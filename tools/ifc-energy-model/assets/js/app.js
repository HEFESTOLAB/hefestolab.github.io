/*
 * HEFESTOLAB · IFC Energy Model — interfaz
 * ---------------------------------------------------------------------------
 * Prepara un IFC de proyecto para el flujo:
 *   IFC → BIMserver.center → Open BIM Analytical Model → CYPETHERM HE Plus
 *
 * Todo ocurre en el navegador. El archivo del usuario no se sube a ningún
 * servidor ni se modifica en disco.
 */
(() => {
  'use strict';

  const $ = (s, r = document) => r.querySelector(s);
  const esc = (v) => String(v == null ? '' : v).replace(/[&<>'"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[c]));
  const n2 = (v, d = 2) => Number.isFinite(+v) ? (+v).toLocaleString('es-ES', { minimumFractionDigits: d, maximumFractionDigits: d }) : '—';
  const n0 = (v) => Number.isFinite(+v) ? (+v).toLocaleString('es-ES') : '—';

  const state = {
    tab: 'start',
    model: null,
    project: null,
    audit: null,
    fileName: '',
    fileSize: 0,
    result: null,
    plan: { scale: 1, ox: 0, oy: 0, ready: false, drag: null },
    filter: '',
    // --- visor 3D ---
    viewMode: '3d',            // '3d' | 'plan'
    viewer: null,
    viewerHost: null,
    viewerSource: 'clean',     // 'clean' | 'full'
    viewerStale: false,
    viewerBusy: false,
    viewerError: null,
    colorMode: 'diagnostico',
    showSpaces: true,
    section: 'off',
    picked: null,
    rawBuffer: null,
    expanded: false,
    target: 'analitico',        // 'analitico' | 'modelo3d'
    site: { lat: null, lon: null, elevation: null, town: '', region: '', postal: '', address: '' },
    detected: null,
    createdRooms: [],
    draw: { active: false, pts: [], hover: null, snap: null },
    storey: '',            // planta aislada en el visor
    category: '',
    storeyList: [],
    categoryList: [],
    planView: false,        // vista de planta cortada activa
    drawBase: null,         // cota de suelo al dibujar
    drawTop: 'auto',        // 'auto' = hasta la cubierta; si no, cota de techo
    drawTopZ: null,
    pendingFocus: null,
    options: {
      isExternal: true, predefined: true, quantities: true,
      spaceHeight: true, spaceCleanup: true, purge: true, purgeNoisePsets: true,
      orphanOpenings: true, curtainToWall: false, siteFix: false
    }
  };

  const el = {
    stage: $('#stage'), side: $('#sidePanel'), input: $('#ifcInput'),
    fileName: $('#fileName'), fileInfo: $('#fileInfo'), reset: $('#btnReset'),
    schema: $('#schemaChip'), score: $('#scoreChip'),
    statusDot: $('#statusDot'), statusText: $('#statusText'), statusMeta: $('#statusMeta'),
    progress: $('#progress'), progTitle: $('#progTitle'), progText: $('#progText'),
    progBar: $('#progBar'), progMeta: $('#progMeta'), toasts: $('#toasts')
  };

  /* ====================================================================
   * Utilidades de interfaz
   * ================================================================== */

  function status(text, kind = 'ok') {
    el.statusText.textContent = text;
    el.statusDot.className = 'status-dot' + (kind === 'ok' ? '' : ' ' + kind);
  }
  function toast(title, text = '', kind = '') {
    const t = document.createElement('div');
    t.className = 'toast ' + kind;
    t.innerHTML = `<b>${esc(title)}</b>${text ? `<span>${esc(text)}</span>` : ''}`;
    el.toasts.appendChild(t);
    setTimeout(() => t.remove(), 5200);
  }
  let progStart = 0;
  function showProgress(title, text) {
    progStart = performance.now();
    el.progress.classList.remove('hidden');
    el.progTitle.textContent = title;
    el.progText.textContent = text || '';
    el.progBar.style.width = '2%';
    el.progMeta.textContent = '';
    status(title, 'busy');
  }
  function setProgress(text, p) {
    if (text) el.progText.textContent = text;
    if (Number.isFinite(p)) el.progBar.style.width = Math.max(2, Math.min(100, p * 100)) + '%';
    el.progMeta.textContent = ((performance.now() - progStart) / 1000).toFixed(1) + ' s';
  }
  function hideProgress(msg) {
    el.progress.classList.add('hidden');
    status(msg || 'Preparado', 'ok');
  }
  const nextFrame = () => new Promise(r => requestAnimationFrame(() => setTimeout(r, 0)));

  function disposeViewer() {
    const v = state.viewer;
    if (v) {
      try { if (state.draw && state.draw.in3d) v.endDraw(false); } catch (e) { /* */ }
      try { v.dispose(); } catch (e) { /* ya liberado */ }
    }
    state.viewer = null;
    if (state.viewerHost) {
      try { state.viewerHost.remove(); } catch (e) { /* */ }
    }
    state.viewerHost = null;
    state.storeyList = [];
    state.categoryList = [];
  }

  /** Limpia todo estado ligado al IFC anterior antes de publicar uno nuevo. */
  function resetPerModelState() {
    disposeViewer();
    state.viewMode = '3d';
    state.viewerSource = 'clean';
    state.viewerStale = false;
    state.viewerBusy = false;
    state.viewerError = null;
    state.colorMode = 'diagnostico';
    state.showSpaces = true;
    state.section = 'off';
    state.picked = null;
    state.pendingFocus = null;
    state.storey = '';
    state.category = '';
    state.planView = false;
    state.detected = null;
    state.createdRooms = [];
    state.draw = { active: false, pts: [], hover: null, snap: null };
    state.drawBase = null;
    state.drawTop = 'auto';
    state.drawTopZ = null;
    state.plan = { scale: 1, ox: 0, oy: 0, ready: false, drag: null };
    state.expanded = false;
    document.body.classList.remove('viewer-expanded');
    const bar = $('#drawBar');
    if (bar) bar.remove();
  }

  /* ====================================================================
   * Carga del archivo
   * ================================================================== */

  /**
   * Los IFC en STEP son ASCII con secuencias de escape, pero algunos
   * exportadores escriben acentos en bruto. Se prueba UTF-8 y, si aparecen
   * caracteres de sustitución, se relee como Windows-1252.
   */
  function decodeBuffer(buffer) {
    const bytes = new Uint8Array(buffer);
    let text = new TextDecoder('utf-8', { fatal: false }).decode(bytes);
    if (text.indexOf('�') >= 0) {
      try { text = new TextDecoder('windows-1252').decode(bytes); } catch (e) { /* se mantiene UTF-8 */ }
    }
    return text;
  }

  async function loadFile(file) {
    if (!file) return;
    showProgress('Leyendo el archivo', file.name);
    await nextFrame();
    try {
      const t0 = performance.now();
      const buffer = await file.arrayBuffer();
      setProgress('Descodificando ' + fmtBytes(buffer.byteLength), 0.12);
      await nextFrame();
      const text = decodeBuffer(buffer);

      setProgress('Analizando la estructura STEP', 0.25);
      await nextFrame();
      const model = new HEM.step.StepModel(text);
      if (!model.count) throw new Error('El archivo no contiene entidades IFC.');

      setProgress('Indexando el modelo', 0.45);
      await nextFrame();
      const project = new HEM.cype.Project(model, (msg, p) => setProgress(msg, 0.45 + p * 0.4));

      setProgress('Auditando frente a los requisitos de CYPE', 0.9);
      await nextFrame();
      const audit = HEM.cype.audit(project);

      resetPerModelState();
      state.model = model;
      state.project = project;
      state.audit = audit;
      state.fileName = file.name;
      state.fileSize = buffer.byteLength;
      state.rawBuffer = buffer;
      state.result = null;
      state.plan.ready = false;

      el.fileName.textContent = file.name;
      el.fileInfo.textContent = model.schema + ' · ' + fmtBytes(buffer.byteLength) + ' · ' + n0(model.count) + ' entidades';
      el.reset.disabled = false;
      el.schema.textContent = model.schema;
      document.querySelectorAll('.mode-tab[disabled]').forEach(b => { b.disabled = false; });

      loadSiteFromModel(project);
      // Si el IFC no trae ni un solo recinto no hay modelo analítico posible,
      // así que se propone la detección sin que haya que pedirla.
      if (!project.spaces.length) {
        try {
          const d = HEM.rooms.detectRooms(project, { cell: 0.06 });
          d.rooms.forEach(r => { r.name = 'Recinto ' + r.index; r.take = true; });
          state.detected = d;
          if (d.rooms.length) {
            toast('Este IFC no trae recintos', 'Se han deducido ' + d.rooms.length + ' contornos cerrados de los muros. Revísalos en la pestaña Espacios.');
          }
        } catch (e) { /* la detección es opcional */ }
      }
      refreshBadges();
      hideProgress('Modelo analizado en ' + ((performance.now() - t0) / 1000).toFixed(1) + ' s');
      go('audit');
      toast('Modelo analizado', n0(model.count) + ' entidades · ' + project.spaces.length + ' espacios · ' + audit.score.errors + ' incidencias graves', audit.score.errors ? '' : 'ok');
    } catch (err) {
      hideProgress('Error al leer el modelo');
      status('Error al leer el modelo', 'err');
      toast('No se ha podido leer el IFC', String(err && err.message || err), 'err');
      console.error(err);
    }
  }

  function fmtBytes(n) { return HEM.cype.fmtBytes(n); }

  /** Lee del IfcSite lo que ya trae, para que el formulario parta de ahí. */
  function loadSiteFromModel(P) {
    const S = HEM.step;
    const site = { lat: null, lon: null, elevation: null, town: '', region: '', postal: '', address: '' };
    const a = P.siteId ? P.m.args(P.siteId) : null;
    if (a) {
      const deg = (tok) => {
        if (!tok || !S.isList(tok)) return null;
        const v = tok.v.map(S.tokNum);
        if (v[0] == null) return null;
        const sign = v[0] < 0 ? -1 : 1;
        return sign * (Math.abs(v[0]) + Math.abs(v[1] || 0) / 60 + Math.abs(v[2] || 0) / 3600 + Math.abs(v[3] || 0) / 3.6e9);
      };
      site.lat = deg(a[9]);
      site.lon = deg(a[10]);
      site.elevation = S.tokNum(a[11]);
      const addrId = S.tokRef(a[13]);
      const ad = addrId ? P.m.args(addrId) : null;
      if (ad) {
        site.town = S.tokStr(ad[6]) || '';
        site.region = S.tokStr(ad[7]) || '';
        site.postal = S.tokStr(ad[8]) || '';
        if (S.isList(ad[4]) && ad[4].v.length) site.address = S.tokStr(ad[4].v[0]) || '';
      }
    }
    state.site = site;
  }

  function refreshBadges() {
    const P = state.project, A = state.audit;
    if (!P) return;
    $('#badgeAudit').textContent = A.score.errors + A.score.warns;
    $('#badgeSpaces').textContent = P.spaces.filter(s => s.include).length;
    $('#badgeElems').textContent = P.elements.filter(e => HEM.cype.ENVELOPE.has(e.family) && e.keep && !e.container).length;
    $('#badgePurge').textContent = P.groups.filter(g => !g.keep).reduce((s, g) => s + g.count, 0);
    el.score.textContent = A.score.pct + '% conforme';
    el.score.className = 'chip ' + (A.score.errors ? 'error' : (A.score.warns ? 'warn' : 'ok'));
  }

  function reaudit() {
    if (!state.project) return;
    state.project.recompute();
    state.audit = HEM.cype.audit(state.project);
    refreshBadges();
  }

  /* ====================================================================
   * Navegación
   * ================================================================== */

  function go(tab) {
    state.tab = tab;
    document.querySelectorAll('.mode-tab').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
    render();
    el.stage.scrollTop = 0;
  }

  function render() {
    const views = { start: viewStart, audit: viewAudit, spaces: viewSpaces, elements: viewElements, purge: viewPurge, export: viewExport };
    (views[state.tab] || viewStart)();
    renderSide();
  }

  /* ====================================================================
   * Vista · Inicio
   * ================================================================== */

  function viewStart() {
    el.stage.classList.remove('split');
    el.stage.innerHTML = `
      <div class="start">
        <h1>Del IFC de proyecto al <span>modelo analítico</span> de CYPE.</h1>
        <p class="lead">Los IFC que llegan de un modelo de arquitectura casi nunca cumplen los requisitos que Open BIM Analytical Model necesita para generar el modelo analítico. Esta herramienta los audita, los corrige y los aligera para que la certificación energética con CYPETHERM HE Plus arranque a la primera.</p>
        <div class="dropzone" id="drop">
          <div class="big">Arrastra aquí un archivo IFC</div>
          <div class="small">o pulsa el botón para seleccionarlo</div>
          <label class="btn primary" for="ifcInput">Seleccionar archivo IFC</label>
          <div class="pill-row">
            <span class="pill">IFC2X3 e IFC4</span>
            <span class="pill">Proceso local</span>
            <span class="pill">Sin subida de modelos</span>
            <span class="pill">Sin instalación</span>
          </div>
        </div>
        <div class="flow">
          <div class="step"><i>01</i><b>Auditoría</b><small>Se comprueba el modelo frente a los requisitos publicados por CYPE para el generador del modelo analítico.</small></div>
          <div class="step"><i>02</i><b>Espacios</b><small>Se depuran los IfcSpace, se descartan áreas duplicadas y se generan las cantidades base.</small></div>
          <div class="step"><i>03</i><b>Cerramientos</b><small>Se deduce qué elementos dan al exterior y se escribe IsExternal y los tipos predefinidos.</small></div>
          <div class="step"><i>04</i><b>Aligerado</b><small>Se retira todo lo que no interviene en el cálculo y se exporta el IFC saneado.</small></div>
        </div>
      </div>`;
    const drop = $('#drop');
    ['dragenter', 'dragover'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.add('over'); }));
    ['dragleave', 'drop'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.remove('over'); }));
    drop.addEventListener('drop', e => {
      const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
      if (f) loadFile(f);
    });
  }

  /* ====================================================================
   * Vista · Auditoría
   * ================================================================== */

  const LEVEL_LABEL = { error: 'Incumple', warn: 'Revisar', ok: 'Correcto', info: 'Informativo' };

  function viewAudit() {
    const A = state.audit, P = state.project;
    if (!A) return viewStart();
    el.stage.classList.add('split');
    state.checkTargets = new Map();
    const groups = {};
    for (const c of A.checks) (groups[c.group] = groups[c.group] || []).push(c);

    el.stage.innerHTML = `
      ${planPanel()}
      <section class="data-pane">
      <h2 class="section-title">Auditoría frente a Open BIM Analytical Model</h2>
      <p class="section-sub">Cada comprobación corresponde a un requisito publicado por CYPE para que la generación automática del modelo analítico funcione. Las marcadas como incumplidas son las que provocan superficies mal orientadas, adyacencias con «elemento constructivo» y volúmenes imposibles.</p>
      <div class="summary">
        <div class="stat"><b>${A.score.pct}%</b><small>Conformidad</small></div>
        <div class="stat"><b style="color:var(--danger)">${A.score.errors}</b><small>Incumplimientos</small></div>
        <div class="stat"><b style="color:var(--warn)">${A.score.warns}</b><small>A revisar</small></div>
        <div class="stat"><b>${n0(P.spaces.filter(s => s.include).length)}</b><small>Espacios activos</small></div>
        <div class="stat"><b>${n0(P.elements.filter(e => HEM.cype.ENVELOPE.has(e.family) && e.keep && !e.container).length)}</b><small>Cerramientos</small></div>
        <div class="stat"><b>${fmtBytes(state.fileSize)}</b><small>Tamaño actual</small></div>
      </div>
      ${Object.keys(groups).map(g => `
        <h3 style="margin:18px 0 9px;font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:var(--muted)">${esc(g)}</h3>
        ${groups[g].map(checkCard).join('')}
      `).join('')}
      <div class="note" style="margin-top:18px">
        <b>Siguiente paso.</b> Revisa las pestañas Espacios, Cerramientos y Aligerado para ajustar los criterios, y termina en Exportar para descargar el IFC corregido.
      </div>
      </section>`;
    bindPanel();
  }

  let checkSeq = 0;
  function checkCard(c) {
    let btn = '';
    if (c.targets && c.targets.length) {
      const key = 'chk' + (++checkSeq);
      if (!state.checkTargets) state.checkTargets = new Map();
      state.checkTargets.set(key, c.targets);
      btn = `<button class="btn tiny" data-act="check-3d" data-key="${key}" data-level="${c.level}">Ver en 3D · ${c.targets.length}</button>`;
    }
    return `<div class="check ${c.level}">
      <div class="check-head">
        <span class="grp">${LEVEL_LABEL[c.level] || c.level}</span>
        <b>${esc(c.title)}</b>
        <span class="val">${esc(c.value)}</span>
      </div>
      ${c.detail ? `<p>${esc(c.detail)}</p>` : ''}
      ${c.items && c.items.length ? `<ul>${c.items.slice(0, 14).map(i => `<li>${esc(i)}</li>`).join('')}${c.items.length > 14 ? `<li>… y ${c.items.length - 14} más</li>` : ''}</ul>` : ''}
      ${c.rule ? `<div class="rule">Requisito CYPE · ${esc(c.rule)}</div>` : ''}
      <div class="check-actions">
        ${c.fix ? `<span class="fixtag">Se corrige automáticamente</span>` : ''}
        ${btn}
      </div>
    </div>`;
  }

  /* ====================================================================
   * Vista · Espacios
   * ================================================================== */

  const USES = [
    ['acondicionado', 'Acondicionado'],
    ['no_acondicionado', 'No acondicionado'],
    ['no_habitable', 'No habitable'],
    ['exterior', 'Exterior'],
    ['descartado', 'Descartado']
  ];

  function viewSpaces() {
    const P = state.project;
    el.stage.classList.add('split');
    const rows = P.spaces.map((s, i) => {
      const target = HEM.cype.storeyAbove(P, s);
      const over = target && s.height > target + 0.1;
      const h = s.height == null ? null : s.height;
      return `<tr class="${s.include ? '' : 'off'}${state.picked === s.guid ? ' picked' : ''}" data-i="${i}" data-guid="${esc(s.guid)}" data-act="row-space">
        <td><input type="checkbox" data-act="inc" data-i="${i}" ${s.include ? 'checked' : ''}></td>
        <td><input type="text" data-act="sp-name" data-i="${i}" value="${esc(s.label)}" title="${esc(s.label)}"></td>
        <td class="num">${n2(s.areaNet, 2)}</td>
        <td class="num ${over ? 'flagtag' : ''}">${s.sloped ? (n2(s.minH || 0, 2) + '–' + n2(s.maxH || s.height || 0, 2)) : n2(h, 2)}</td>
        <td class="num">${n2(s.volume != null ? s.volume : s.areaNet * (h || 0), 1)}</td>
        <td>
          <select data-act="use" data-i="${i}">
            ${USES.map(u => `<option value="${u[0]}" ${s.use === u[0] ? 'selected' : ''}>${u[1]}</option>`).join('')}
          </select>
        </td>
        <td style="font-size:10px;color:var(--muted)">${s.created ? '<span class="tag int">creado aquí</span> ' : ''}${esc(s.reason || (over ? 'Sobrepasa la altura de planta' : ''))}</td>
        <td>${s.created ? `<button class="btn tiny" data-act="space-del" data-i="${i}" title="Eliminar este recinto">✕</button>` : ''}</td>
      </tr>`;
    }).join('');

    const active = P.spaces.filter(s => s.include);
    el.stage.innerHTML = `
      ${planPanel()}
      <section class="data-pane">
        <h2 class="section-title">Espacios del modelo</h2>
        <p class="section-sub">Open BIM Analytical Model parte de los IfcSpace para construir superficies, aristas y adyacencias. Los espacios solapados, los recintos exteriores y las alturas que atraviesan el forjado son la causa más frecuente de que el modelo analítico salga mal.</p>
        <div class="toolbar">
          <button class="btn" data-act="all-on">Incluir todos</button>
          <button class="btn" data-act="only-real">Sólo estancias reales</button>
          <button class="btn" data-act="detect">Detectar desde los muros</button>
          <button class="btn primary" data-act="draw-start">Dibujar recinto a mano</button>
          <span class="spacer" style="flex:1"></span>
          <span class="chip">${active.length} de ${P.spaces.length} activos · ${n2(active.reduce((a, s) => a + s.areaNet, 0), 1)} m²</span>
        </div>
        <div class="tablewrap">
          <table>
            <thead><tr>
              <th style="width:34px"></th><th>Espacio</th><th style="width:78px">Sup. m²</th>
              <th style="width:70px">Alt. m</th><th style="width:80px">Vol. m³</th>
              <th style="width:140px">Uso</th><th>Observación</th><th style="width:34px"></th>
            </tr></thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
        ${detectedBlock()}
        <div class="note" style="margin-top:12px">
          <b>Altura de los espacios.</b> Al exportar, cada recinto se recorta contra los planos reales de la cubierta: si el techo es inclinado se escribe como sólido con su volumen real y se omite <i>Height</i>, porque no existe una altura única. Si es plano, se ajusta al nivel superior.
        </div>
      </section>`;
    bindPanel();
  }

  /** Propuesta de recintos deducidos de los muros. */
  function detectedBlock() {
    const d = state.detected;
    if (!d) return '';
    if (!d.rooms.length) {
      return `<div class="note" style="margin-top:12px"><b>Sin recintos.</b> ${esc(d.reason || 'No se han encontrado contornos cerrados por los muros.')}</div>`;
    }
    const total = d.rooms.reduce((a, r) => a + r.area, 0);
    return `<div class="block" style="margin-top:12px;border-color:var(--blue-line)">
      <h3>Recintos deducidos de los muros · ${d.rooms.length}</h3>
      <p style="margin-bottom:10px">Se ha rasterizado la planta usando los muros como obstáculo y se han buscado las regiones cerradas. Suman ${n2(total, 1)} m². <b>Es una propuesta, no un dictamen</b>: el detector no distingue una separación virtual de un hueco de paso, así que puede unir dos estancias abiertas entre sí o partir una que se comunique por un vano ancho.</p>
      <div class="tablewrap" style="max-height:260px;overflow-y:auto">
        <table><thead><tr><th style="width:34px"></th><th style="width:56px">Nº</th><th>Nombre</th><th style="width:84px">Sup. m²</th></tr></thead>
        <tbody>${d.rooms.map((r, i) => `<tr>
          <td><input type="checkbox" data-act="det-on" data-i="${i}" ${r.take !== false ? 'checked' : ''}></td>
          <td>${r.index}</td>
          <td><input type="text" data-act="det-name" data-i="${i}" value="${esc(r.name || ('Recinto ' + r.index))}"></td>
          <td class="num">${n2(r.area, 2)}</td>
        </tr>`).join('')}</tbody></table>
      </div>
      <div class="toolbar" style="margin-top:10px">
        <button class="btn primary" data-act="det-create">Crear los recintos marcados como IfcSpace</button>
        <button class="btn ghost" data-act="det-clear">Descartar la propuesta</button>
      </div>
    </div>`;
  }

  /* ====================================================================
   * Vista · Cerramientos
   * ================================================================== */

  const ROLES = [
    ['fachada', 'Fachada'], ['particion', 'Partición interior'], ['medianera', 'Medianera'],
    ['muro_sotano', 'Muro de sótano'], ['cubierta', 'Cubierta'], ['forjado', 'Forjado'],
    ['solera', 'Solera'], ['muro_cortina', 'Muro cortina'],
    ['hueco_exterior', 'Hueco exterior'], ['hueco_interior', 'Hueco interior'],
    ['pavimento_exterior', 'Pavimento exterior'], ['losa_exterior', 'Losa exterior']
  ];
  const ROLE_LABEL = Object.fromEntries(ROLES);

  function viewElements() {
    const P = state.project;
    el.stage.classList.add('split');
    const list = P.elements
      .filter(e => HEM.cype.ENVELOPE.has(e.family) && !e.container)
      .filter(e => !state.filter || (e.typeName + ' ' + e.name).toLowerCase().includes(state.filter));

    const rows = list.map(e => {
      const idx = P.elements.indexOf(e);
      const ext = e.decided;
      const mismatch = e.declared !== null && ext !== null && e.declared !== ext;
      return `<tr class="${e.keep ? '' : 'off'}${state.picked === e.guid ? ' picked' : ''}" data-guid="${esc(e.guid)}" data-act="row-elem" data-i="${idx}">
        <td><input type="checkbox" data-act="keep" data-i="${idx}" ${e.keep ? 'checked' : ''}></td>
        <td style="font-size:9.5px;color:var(--muted)">${esc(e.type.replace('IFC', ''))}</td>
        <td class="name" title="${esc(e.typeName || e.name)}">${esc(e.typeName || e.name)}</td>
        <td><select data-act="role" data-i="${idx}">
          ${ROLES.map(r => `<option value="${r[0]}" ${e.role === r[0] ? 'selected' : ''}>${r[1]}</option>`).join('')}
        </select></td>
        <td><select data-act="ext" data-i="${idx}">
          <option value="true" ${ext === true ? 'selected' : ''}>Exterior</option>
          <option value="false" ${ext === false ? 'selected' : ''}>Interior</option>
        </select></td>
        <td class="num">${e.thickness != null ? n2(e.thickness * 100, 1) : '—'}</td>
        <td style="font-size:9.5px;color:var(--muted)">${e.declared === null ? '<span class="tag mut">sin declarar</span>' : (mismatch ? '<span class="tag ext">contradice</span>' : '<span class="tag mut">coincide</span>')}</td>
      </tr>`;
    }).join('');

    const nExt = list.filter(e => e.decided === true && e.keep).length;
    el.stage.innerHTML = `
      ${planPanel()}
      <section class="data-pane">
        <h2 class="section-title">Cerramientos y huecos</h2>
        <p class="section-sub">La función de cada elemento se deduce de su posición real respecto a los espacios activos: se lanzan sondas a ambos lados del eje del muro y se comprueba en cuál hay recinto. De ahí salen IsExternal y los tipos predefinidos BASESLAB, BASEMENTWALL y PARTYWALL que escribe la exportación.</p>
        <div class="toolbar">
          <input class="searchbox" type="text" id="filter" placeholder="Filtrar por tipo…" value="${esc(state.filter)}">
          <button class="btn ghost" data-act="reset-roles">Restablecer deducción automática</button>
          <span style="flex:1"></span>
          <span class="chip">${nExt} exteriores · ${list.filter(e => e.decided === false && e.keep).length} interiores</span>
        </div>
        <div class="tablewrap">
          <table>
            <thead><tr>
              <th style="width:34px"></th><th style="width:82px">Entidad</th><th>Tipo</th>
              <th style="width:150px">Función</th><th style="width:110px">Adyacencia</th>
              <th style="width:64px">e (cm)</th><th style="width:96px">En el IFC</th>
            </tr></thead>
            <tbody>${rows || '<tr><td colspan="7" style="padding:20px;text-align:center;color:var(--muted)">Sin resultados</td></tr>'}</tbody>
          </table>
        </div>
      </section>`;
    const f = $('#filter');
    if (f) f.addEventListener('input', () => { state.filter = f.value.trim().toLowerCase(); const p = f.selectionStart; viewElements(); const g = $('#filter'); if (g) { g.focus(); g.setSelectionRange(p, p); } });
    bindPanel();
  }

  /* ====================================================================
   * Vista · Aligerado
   * ================================================================== */

  const FAMILY_LABEL = {
    wall: 'Muro', slab: 'Forjado', roof: 'Cubierta', door: 'Puerta', window: 'Ventana',
    curtain: 'Muro cortina', shading: 'Sombra', struct: 'Estructura', furniture: 'Mobiliario',
    mep: 'Instalaciones', proxy: 'Genérico', finish: 'Acabado', annotation: 'Anotación', other: 'Otros'
  };

  function viewPurge() {
    const P = state.project;
    el.stage.classList.add('split');
    const drop = P.groups.filter(g => !g.keep).reduce((s, g) => s + g.count, 0);
    const keep = P.groups.filter(g => g.keep).reduce((s, g) => s + g.count, 0);

    const rows = P.groups.map(g => `<tr class="${g.keep ? '' : 'off'}" data-act="row-group" data-k="${esc(g.key)}">
      <td><input type="checkbox" data-act="grp" data-k="${esc(g.key)}" ${g.keep ? 'checked' : ''} ${g.envelope ? 'disabled' : ''}></td>
      <td><span class="tag ${g.envelope ? 'int' : 'mut'}">${FAMILY_LABEL[g.family] || g.family}</span></td>
      <td style="font-size:9.5px;color:var(--muted)">${esc(g.type.replace('IFC', ''))}</td>
      <td class="name" title="${esc(g.label)}">${esc(g.label)}</td>
      <td class="num">${n0(g.count)}</td>
      <td style="font-size:10px;color:var(--muted)">${esc(g.reason || '')}</td>
    </tr>`).join('');

    el.stage.innerHTML = `
      ${planPanel()}
      <section class="data-pane">
      <h2 class="section-title">Aligerado del modelo</h2>
      <p class="section-sub">El modelo analítico sólo necesita la envolvente: espacios, muros, forjados, cubiertas y huecos. El mobiliario, las instalaciones, la topografía y las series repetitivas de piezas menudas multiplican el tamaño del archivo y ralentizan la generación sin aportar nada al cálculo. Desmarca lo que quieras conservar.</p>
      <div class="summary">
        <div class="stat"><b>${n0(keep)}</b><small>Elementos conservados</small></div>
        <div class="stat"><b style="color:var(--danger)">${n0(drop)}</b><small>Elementos retirados</small></div>
        <div class="stat"><b>${n0(P.groups.length)}</b><small>Grupos de tipo</small></div>
        <div class="stat"><b>${fmtBytes(state.fileSize)}</b><small>Tamaño de partida</small></div>
      </div>
      <div class="toolbar">
        <button class="btn" data-act="grp-env">Sólo la envolvente</button>
        <button class="btn" data-act="grp-all">Conservarlo todo</button>
        <button class="btn ghost" data-act="grp-auto">Volver a la propuesta automática</button>
      </div>
      <div class="tablewrap">
        <table>
          <thead><tr>
            <th style="width:34px"></th><th style="width:118px">Familia</th><th style="width:120px">Entidad</th>
            <th>Tipo</th><th style="width:70px">Uds.</th><th style="width:280px">Criterio</th>
          </tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
      <div class="note" style="margin-top:12px">
        <b>Qué se retira además.</b> Al descartar un tipo se elimina también su IfcTypeObject y los RepresentationMaps asociados, donde vive la geometría de la familia completa. Ahí está el grueso del archivo: un tipo con malla de miles de caras pesa lo mismo lo use una vez o trescientas.
      </div>
      </section>`;
    bindPanel();
  }

  /* ====================================================================
   * Vista · Exportar
   * ================================================================== */

  const OPTIONS = [
    ['spaceCleanup', 'Depurar espacios', 'Elimina del IFC los espacios marcados como descartados o exteriores, junto con sus relaciones. Evita volúmenes solapados en el modelo analítico.'],
    ['spaceHeight', 'Recortar los espacios contra la cubierta', 'Reconstruye los planos de los faldones y recorta cada recinto contra ellos. Bajo cubierta inclinada el espacio se escribe como sólido con techo inclinado, con su volumen real, y se omite Height porque no existe una altura única.'],
    ['orphanOpenings', 'Retirar huecos sin carpintería', 'Elimina los IfcOpeningElement que perforan un muro sin alojar puerta ni ventana. CYPE los interpretaría como una abertura adicional o una superficie sin referencia.'],
    ['curtainToWall', 'Convertir muros cortina en muros', 'Reescribe los IfcCurtainWall como IfcWallStandardCase. El importador directo de CYPETHERM lee sobre todo IfcWall e IfcWallStandardCase, así que un tabique exportado como muro cortina podría dejar un recinto sin cerrar.'],
    ['siteFix', 'Corregir el emplazamiento', 'Sustituye la latitud, longitud, altitud y dirección postal del IfcSite y del IfcBuilding por las que indiques abajo.'],
    ['quantities', 'Generar Qto_SpaceBaseQuantities', 'Escribe superficie, perímetro, altura y volumen de cada espacio, que es de donde CYPE toma estos datos.'],
    ['isExternal', 'Escribir IsExternal', 'Añade o corrige la propiedad en Pset_WallCommon, Pset_SlabCommon, Pset_DoorCommon y Pset_WindowCommon según la adyacencia deducida.'],
    ['predefined', 'Asignar tipos predefinidos', 'Marca las soleras como USERDEFINED (BASESLAB) y los muros enterrados o medianeros como BASEMENTWALL o PARTYWALL.'],
    ['purge', 'Aligerar el modelo', 'Retira los elementos descartados en la pestaña Aligerado y toda la geometría, tipos y conjuntos de propiedades que quedan huérfanos.'],
    ['purgeNoisePsets', 'Retirar conjuntos de propiedades sin uso', 'Elimina Pset_QuantityTakeOff, Pset_ReinforcementBarPitchOf… y similares, que no intervienen en el cálculo energético.']
  ];

  function viewExport() {
    el.stage.classList.remove('split');
    const R = state.result;
    el.stage.innerHTML = `
      <h2 class="section-title">Exportar el IFC preparado</h2>
      <p class="section-sub">Se genera un archivo nuevo con el mismo esquema del original. El tuyo no se toca. Elige primero por dónde va a entrar en CYPETHERM, porque los dos caminos no piden lo mismo.</p>
      <div class="targets">
        ${Object.keys(TARGETS).map(k => `<label class="target ${state.target === k ? 'on' : ''}">
          <input type="radio" name="target" data-act="target" data-k="${k}" ${state.target === k ? 'checked' : ''}>
          <span><b>${esc(TARGETS[k].label)}</b><small>${esc(TARGETS[k].hint)}</small></span>
        </label>`).join('')}
      </div>
      ${state.options.siteFix ? siteForm() : ''}
      <div class="optlist">
        ${OPTIONS.map(o => `<label class="opt">
          <input type="checkbox" data-act="opt" data-k="${o[0]}" ${state.options[o[0]] ? 'checked' : ''}>
          <span><b>${esc(o[1])}</b><small>${esc(o[2])}</small></span>
        </label>`).join('')}
      </div>
      <div class="toolbar" style="margin-top:14px">
        <button class="btn primary" data-act="build">Generar IFC corregido</button>
        ${R ? `<button class="btn" data-act="dl-ifc">Descargar IFC</button>
               <button class="btn" data-act="dl-json">Descargar informe JSON</button>
               <button class="btn" data-act="dl-html">Descargar informe HTML</button>` : ''}
      </div>
      ${R ? resultBlock(R) : `<div class="note">Pulsa <b>Generar IFC corregido</b> para aplicar las correcciones marcadas. El proceso tarda unos segundos incluso en modelos de decenas de megabytes.</div>`}`;
  }

  /** Formulario del emplazamiento, precargado con lo que trae el IFC. */
  function siteForm() {
    const s = state.site;
    const fld = (k, label, ph, w) => `<label class="fld" style="flex:${w || 1}">
      <span>${esc(label)}</span>
      <input type="text" data-act="site" data-k="${k}" value="${esc(s[k] == null ? '' : s[k])}" placeholder="${esc(ph || '')}">
    </label>`;
    return `<div class="block sitebox">
      <h3>Emplazamiento que se escribirá en el IFC</h3>
      <p style="margin-bottom:10px">El IFC de proyecto suele arrastrar la geolocalización de la plantilla o de otra obra. CYPETHERM usa lo que declares en «Datos del emplazamiento», pero el IFC debe salir coherente para cualquier otro lector.</p>
      <div class="fldrow">${fld('town', 'Municipio', 'Melgar de Fernamental', 2)}${fld('region', 'Provincia', 'Burgos')}${fld('postal', 'Código postal', '09100')}</div>
      <div class="fldrow">${fld('lat', 'Latitud', '42.4064')}${fld('lon', 'Longitud', '-4.2372')}${fld('elevation', 'Altitud (m)', '806')}${fld('address', 'Dirección', 'Calle y número', 2)}</div>
    </div>`;
  }

  function resultBlock(R) {
    const c = R.counts;
    const ratio = state.fileSize ? (1 - R.bytes / state.fileSize) * 100 : 0;
    return `
      <div class="summary" style="margin-top:16px">
        <div class="stat"><b>${fmtBytes(R.bytes)}</b><small>Archivo resultante</small></div>
        <div class="stat"><b style="color:var(--success)">−${n2(ratio, 0)}%</b><small>Reducción</small></div>
        <div class="stat"><b>${n0(R.entities)}</b><small>Entidades finales</small></div>
        <div class="stat"><b>${R.score.pct}%</b><small>Conformidad final</small></div>
      </div>
      <div class="block">
        <h3>Correcciones aplicadas</h3>
        <div class="logbox">
          ${R.log.map(l => `<div><b>${esc(l.kind)}</b>${esc(l.text)}</div>`).join('') || '<div>Sin cambios.</div>'}
        </div>
      </div>
      <div class="block">
        <h3>Comprobación del archivo generado</h3>
        <p style="margin-bottom:9px">El IFC de salida se ha vuelto a leer y auditar desde cero para verificar que no quedan referencias rotas ni requisitos sin cumplir.</p>
        <div class="summary">
          <div class="stat"><b style="color:${R.dangling ? 'var(--danger)' : 'var(--success)'}">${n0(R.dangling)}</b><small>Referencias rotas</small></div>
          <div class="stat"><b style="color:${R.score.errors ? 'var(--danger)' : 'var(--success)'}">${R.score.errors}</b><small>Incumplimientos</small></div>
          <div class="stat"><b>${R.score.warns}</b><small>A revisar</small></div>
          <div class="stat"><b>${n0(R.spaces)}</b><small>Espacios exportados</small></div>
        </div>
        ${R.checks.filter(x => x.level === 'error' || x.level === 'warn').map(checkCard).join('') || '<p style="color:var(--success);font-weight:700">Todas las comprobaciones se superan.</p>'}
      </div>
      <div class="note">
        <b>Siguiente paso en CYPE.</b> Sube este IFC a BIMserver.center → crea una obra en Open BIM Analytical Model → «Generar modelo analítico» → revisa las superficies y compártelo → en CYPETHERM HE Plus (CTE 2019) importa el modelo analítico. Si mezclas versiones distintas de las aplicaciones, actualiza ambas antes de compartir.
      </div>`;
  }

  async function build() {
    const P = state.project;
    if (!P) return;
    showProgress('Aplicando correcciones', 'Preparando una copia de trabajo');
    await nextFrame();
    try {
      const t0 = performance.now();
      // Se trabaja siempre sobre una relectura limpia para poder generar varias
      // veces sin arrastrar los cambios de la ejecución anterior.
      setProgress('Releyendo el modelo original', 0.1);
      await nextFrame();
      const model = new HEM.step.StepModel(state.model.text);
      const fresh = new HEM.cype.Project(model);
      transferDecisions(P, fresh);

      const F = new HEM.fix.Fixer(fresh, fixerOptions());
      F.run((msg, p) => setProgress(msg, 0.2 + p * 0.5));

      setProgress('Escribiendo el IFC', 0.75);
      await nextFrame();
      const text = F.toIfc(state.fileName);

      setProgress('Verificando el archivo generado', 0.88);
      await nextFrame();
      const check = new HEM.step.StepModel(text);
      check.buildRefs();
      let dangling = 0;
      for (let s = 0; s < check.count; s++) {
        for (let i = check._refs.start[s]; i < check._refs.start[s + 1]; i++) {
          if (check.slotOf(check._refs.data[i]) < 0) dangling++;
        }
      }
      const checkProject = new HEM.cype.Project(check);
      const checkAudit = HEM.cype.audit(checkProject);

      state.result = {
        text,
        bytes: byteLength(text),
        entities: check.count,
        counts: F.counts,
        log: F.log,
        report: F.report(),
        dangling,
        score: checkAudit.score,
        checks: checkAudit.checks,
        spaces: checkProject.spaces.length
      };
      hideProgress('IFC generado en ' + ((performance.now() - t0) / 1000).toFixed(1) + ' s');
      viewExport();
      toast('IFC corregido generado', fmtBytes(state.fileSize) + ' → ' + fmtBytes(state.result.bytes) + ' · ' + checkAudit.score.pct + '% conforme',
        (dangling === 0 && checkAudit.score.errors === 0) ? 'ok' : '');
    } catch (err) {
      hideProgress('Error al generar el IFC');
      toast('No se ha podido generar el archivo', String(err && err.message || err), 'err');
      console.error(err);
    }
  }

  /** Traslada las decisiones del usuario a la copia de trabajo. */
  function transferDecisions(from, to) {
    const byId = new Map(to.spaces.map(s => [s.id, s]));
    for (const s of from.spaces) {
      const t = byId.get(s.id);
      if (!t) continue;
      t.include = s.include; t.use = s.use; t.reason = s.reason;
      if (s.targetHeight != null) t.targetHeight = s.targetHeight;
    }
    to.groupChoice = new Map(from.groupChoice);
    const elems = new Map(to.elements.map(e => [e.id, e]));
    for (const e of from.elements) {
      const t = elems.get(e.id);
      if (!t) continue;
      if (e.userRole) t.userRole = e.userRole;
      if (e.userExternal != null) t.userExternal = e.userExternal;
      if (e.keepOverride != null) t.keepOverride = e.keepOverride;
    }
    to.recompute();
  }

  /** Opciones efectivas del corrector, con el destino aplicado. */
  function fixerOptions() {
    return Object.assign({}, state.options, {
      target: state.target,
      site: state.site,
      createRooms: state.createdRooms,
      createStorey: (state.project && state.project.storeys[0] || {}).id,
      spaceHeightMode: state.options.spaceHeight ? 'cubierta' : 'mantener'
    });
  }

  /**
   * Cada destino tiene su propio criterio. El importador directo de CYPETHERM
   * no lee los IfcSpace pero sí necesita que los tabiques lleguen como muros;
   * Open BIM Analytical Model es al revés.
   */
  const TARGETS = {
    modelo3d: {
      label: 'CYPETHERM · Modelo 3D',
      hint: 'Importación directa desde la solapa «Modelo 3D» de CYPETHERM. Convierte la geometría en muros, forjados y huecos editables. Los recintos se introducen después dentro de CYPETHERM, así que los IfcSpace son secundarios.',
      apply: { curtainToWall: true, spaceHeight: true, quantities: true, predefined: true, orphanOpenings: true }
    },
    analitico: {
      label: 'Open BIM Analytical Model',
      hint: 'El IFC se sube a BIMserver.center y Open BIM Analytical Model genera el modelo analítico a partir de los recintos. Aquí los IfcSpace mandan: contorno, volumen bajo cubierta y coplanariedad con los cerramientos.',
      apply: { curtainToWall: false, spaceHeight: true, quantities: true, predefined: true, orphanOpenings: true }
    }
  };

  function setTarget(name) {
    state.target = name;
    Object.assign(state.options, TARGETS[name].apply);
    state.result = null;
    state.viewerStale = true;
  }

  /** Escribe el nombre nuevo en el IfcSpace del modelo en memoria. */
  function renameSpaceInModel(P, sp, nombre) {
    try {
      P.m.setArg(sp.id, 7, HEM.step.T.str(nombre));
    } catch (e) { /* el nombre se conserva igualmente en la exportación */ }
  }

  function byteLength(str) {
    let bytes = 0;
    for (let i = 0; i < str.length; i++) {
      const c = str.charCodeAt(i);
      bytes += c < 0x80 ? 1 : c < 0x800 ? 2 : 3;
    }
    return bytes;
  }

  function download(name, text, mime) {
    const blob = new Blob([text], { type: mime || 'application/octet-stream' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  }

  function baseName() { return (state.fileName || 'modelo').replace(/\.ifc$/i, ''); }

  /* ====================================================================
   * Planta esquemática
   * ================================================================== */

  /**
   * Panel lateral: visor 3D o planta esquemática. El 3D es el modo por
   * defecto; la planta se mantiene porque funciona sin conexión y sin WebGL.
   */
  function planPanel() {
    return state.viewMode === 'plan' ? plan2dPanel() : viewer3dPanel();
  }

  function plan2dPanel() {
    const d = state.draw;
    return `<div class="plan">
      <div class="plan-head">
        ${viewToggle()}
        <span class="spacer"></span>
        ${d.active
          ? `${drawLevelsHtml()}<button class="btn primary" data-act="draw-close" ${d.pts.length < 3 ? 'disabled' : ''}>Cerrar recinto (${d.pts.length})</button>
             <button class="btn ghost" data-act="draw-undo" ${!d.pts.length ? 'disabled' : ''}>Deshacer</button>
             <button class="btn ghost" data-act="draw-cancel">Cancelar</button>`
          : `<button class="btn" data-act="draw-start">Dibujar recinto</button>
             <button class="btn ghost" data-act="plan-fit">Encuadrar</button>`}
      </div>
      ${d.active ? '<div class="drawhint">Marca las esquinas pinchando sobre la planta. Engancha a las <b>caras y esquinas de muros y tabiques</b>, no sólo al eje: el punto se pone verde al capturar. Doble clic, Intro o «Cerrar recinto» terminan; Esc cancela. Con el visor 3D cargado, el mismo botón dibuja sobre el modelo con enganche a la geometría real.</div>' : ''}
      <canvas id="planCanvas"></canvas>
      <div class="legend">
        <span><i style="background:var(--ext)"></i>Exterior</span>
        <span><i style="background:var(--int)"></i>Interior</span>
        <span><i style="background:var(--ground)"></i>Terreno</span>
        <span><i style="background:var(--roof)"></i>Cubierta</span>
        <span><i style="background:var(--space)"></i>Espacio activo</span>
      </div>
    </div>`;
  }

  function viewToggle() {
    return `<span class="segmented">
      <button class="${state.viewMode === '3d' ? 'on' : ''}" data-act="view-3d" type="button">3D</button>
      <button class="${state.viewMode === 'plan' ? 'on' : ''}" data-act="view-plan" type="button">Planta</button>
    </span>`;
  }

  function viewer3dPanel() {
    const v = state.viewer;
    const ready = v && v.model;
    return `<div class="plan viewer">
      <div class="plan-head">
        ${viewToggle()}
        <span class="spacer"></span>
        ${ready ? `<button class="btn" data-act="draw-start" title="Dibujar un recinto sobre el modelo">Dibujar recinto</button>
                   <button class="btn ghost" data-act="v-fit" title="Encuadrar todo">Encuadrar</button>` : ''}
        <button class="icon-btn small" data-act="v-expand" title="Ampliar el visor">⤢</button>
      </div>
      <div class="viewer-host" id="viewerHost"></div>
      ${ready ? viewerTools() : ''}
      <div class="viewer-overlay ${!state.viewerError && (ready || state.viewerBusy) ? 'hidden' : ''}" id="viewerOverlay">
        ${viewerOverlayContent()}
      </div>
      ${ready ? `<div class="legend" id="viewerLegend">${legendFor(state.colorMode)}</div>` : ''}
    </div>`;
  }

  function viewerOverlayContent() {
    if (location.protocol === 'file:') {
      return `<div class="vo">
        <b>El visor 3D necesita servidor</b>
        <span>El motor de That Open se carga como módulo desde una CDN y el navegador lo bloquea al abrir la página con doble clic. Arranca <code>INICIAR_HEFESTOLAB_LOCAL.bat</code> y entra por <code>127.0.0.1</code>, o usa la vista de planta, que funciona igual sin conexión.</span>
        <button class="btn" data-act="view-plan" type="button">Ver la planta esquemática</button>
      </div>`;
    }
    if (state.viewerError) {
      return `<div class="vo">
        <b>No se ha podido iniciar el visor</b>
        <span>${esc(state.viewerError)}</span>
        <button class="btn" data-act="v-load" type="button">Reintentar</button>
        <button class="btn ghost" data-act="view-plan" type="button">Usar la planta</button>
      </div>`;
    }
    return `<div class="vo">
      <b>Visor 3D</b>
      <span>Se carga el modelo ya depurado, de modo que abre en un par de segundos aunque el original pese decenas de megabytes. Pulsa una incidencia de la auditoría o una fila de las tablas y el elemento se aísla aquí.</span>
      <button class="btn primary" data-act="v-load" type="button">Cargar el modelo en 3D</button>
    </div>`;
  }

  function viewerTools() {
    const stale = state.viewerStale ? '<button class="btn warn" data-act="v-reload" title="Las decisiones han cambiado">Actualizar 3D</button>' : '';
    return `<div class="viewer-tools">
      <select data-act="v-color" title="Criterio de color">
        <option value="diagnostico" ${state.colorMode === 'diagnostico' ? 'selected' : ''}>Color: diagnóstico</option>
        <option value="familia" ${state.colorMode === 'familia' ? 'selected' : ''}>Color: función</option>
        <option value="original" ${state.colorMode === 'original' ? 'selected' : ''}>Color: original</option>
      </select>
      <select data-act="v-source" title="Qué modelo se muestra">
        <option value="clean" ${state.viewerSource === 'clean' ? 'selected' : ''}>Modelo depurado</option>
        <option value="full" ${state.viewerSource === 'full' ? 'selected' : ''}>Original completo (lento)</option>
      </select>
      <span class="vsep"></span>
      <button class="btn ghost" data-act="v-view" data-v="iso" title="Vista isométrica">ISO</button>
      <button class="btn ghost" data-act="v-view" data-v="planta" title="Vista en planta">Planta</button>
      <button class="btn ghost" data-act="v-view" data-v="alzado" title="Alzado">Alzado</button>
      <span class="vsep"></span>
      ${state.storeyList.length ? `<select data-act="v-storey" title="Aislar una planta">
        <option value="">Todas las plantas</option>
        ${state.storeyList.map(n => `<option value="${esc(n)}" ${state.storey === n ? 'selected' : ''}>${esc(n)}</option>`).join('')}
      </select>
      <button class="btn ghost ${state.planView ? 'on' : ''}" data-act="v-plan" title="Abrir la vista de planta cortada a esa cota" ${state.storey ? '' : 'disabled'}>Vista de planta</button>` : ''}
      ${state.categoryList.length ? `<select data-act="v-cat" title="Aislar una categoría">
        <option value="">Todas las categorías</option>
        ${state.categoryList.map(n => `<option value="${esc(n)}" ${state.category === n ? 'selected' : ''}>${esc(String(n).replace('IFC', ''))}</option>`).join('')}
      </select>` : ''}
      <button class="btn ghost" data-act="v-isolate" title="Aislar lo seleccionado">Aislar</button>
      <button class="btn ghost" data-act="v-hide" title="Ocultar lo seleccionado">Ocultar</button>
      <span class="vsep"></span>
      <button class="btn ghost ${state.section !== 'off' ? 'on' : ''}" data-act="v-section" title="Plano de sección">Sección</button>
      <button class="btn ghost" data-act="v-showall" title="Mostrar todo">Todo</button>
      <label class="vcheck" title="Volúmenes de espacio"><input type="checkbox" data-act="v-spaces" ${state.showSpaces ? 'checked' : ''}> Espacios</label>
      ${stale}
    </div>`;
  }

  function legendFor(mode) {
    if (mode === 'original') return '<span>Colores originales del modelo</span>';
    return `<span><i style="background:#e0632b"></i>Exterior</span>
      <span><i style="background:#2563eb"></i>Interior</span>
      <span><i style="background:#8b5e34"></i>Terreno</span>
      <span><i style="background:#7c3aed"></i>Cubierta</span>
      <span><i style="background:#0ea5e9"></i>Espacio</span>
      <span><i style="background:#94a3b8"></i>Se retira</span>`;
  }

  /* ====================================================================
   * Visor 3D
   * ================================================================== */

  function bindPanel() {
    if (state.viewMode === 'plan') return bindPlan();
    bindViewer();
  }

  /**
   * El visor vive en un contenedor propio que se mueve entre vistas en lugar de
   * recrearse: reconstruir el lienzo WebGL en cada cambio de pestaña obligaría
   * a reconvertir el IFC.
   */
  function viewerHostElement() {
    if (!state.viewerHost) {
      const host = document.createElement('div');
      host.className = 'viewer-canvas';
      state.viewerHost = host;
    }
    return state.viewerHost;
  }

  function bindViewer() {
    const slot = $('#viewerHost');
    if (!slot) return;
    slot.appendChild(viewerHostElement());
    scheduleViewerResize();
  }

  function scheduleViewerResize() {
    requestAnimationFrame(() => requestAnimationFrame(() => {
      const host = state.viewerHost;
      const viewer = state.viewer;
      if (!host || !host.isConnected || host.clientWidth < 2 || host.clientHeight < 2 || !viewer) return;
      try {
        if (typeof viewer.resize === 'function') viewer.resize();
        else if (viewer.engine) viewer.engine.world.renderer.resize();
      } catch (e) { /* el panel todavía se está asentando */ }
    }));
  }

  async function ensureViewer() {
    if (state.viewer) return state.viewer;
    state.viewer = new HEM.Viewer(viewerHostElement(), {
      onPick: (guid) => onViewerPick(guid),
      onStatus: (text, kind) => { if (text) toast('Visor', text, kind === 'warn' ? '' : kind); },
      onProgress: (p, text) => setProgress(text, 0.1 + p * 0.85)
    });
    return state.viewer;
  }

  /** Bytes del modelo que se envía al visor. */
  async function viewerBytes() {
    if (state.viewerSource === 'full') {
      return { bytes: new Uint8Array(state.rawBuffer), project: state.project, label: 'original completo' };
    }
    // Copia limpia con las decisiones actuales: es lo que verá CYPE. Se cede el
    // hilo entre fases para que la pestaña no se quede congelada.
    setProgress('Releyendo el modelo', 0.04);
    await nextFrame();
    const model = new HEM.step.StepModel(state.model.text);
    await nextFrame();
    setProgress('Indexando la copia de trabajo', 0.08);
    const fresh = new HEM.cype.Project(model);
    await nextFrame();
    transferDecisions(state.project, fresh);
    setProgress('Aplicando las correcciones', 0.14);
    await nextFrame();
    const F = new HEM.fix.Fixer(fresh, Object.assign({}, fixerOptions(), { purge: true }));
    F.run();
    await nextFrame();
    setProgress('Escribiendo el modelo para el visor', 0.2);
    const text = F.toIfc(state.fileName);
    await nextFrame();
    return { bytes: strToBytes(text), project: fresh, label: 'depurado' };
  }

  function strToBytes(str) {
    // El IFC en STEP es ASCII con secuencias de escape, pero se codifica en
    // UTF-8 por si algún exportador dejó caracteres en bruto.
    return new TextEncoder().encode(str);
  }

  async function loadViewer() {
    if (location.protocol === 'file:') return;
    if (state.viewerBusy) { toast('Un momento', 'El visor ya está cargando ese modelo.'); return; }
    if (!state.rawBuffer || !state.project) return;
    state.viewerBusy = true;
    state.viewerError = null;
    showProgress('Preparando el visor 3D', 'Iniciando el motor');
    await nextFrame();
    try {
      setProgress('Generando el modelo para el visor', 0.08);
      await nextFrame();
      const { bytes, project, label } = await viewerBytes();
      // Cada conversión usa Components nuevos. Así no sobreviven plantas,
      // clasificadores ni planos de recorte del IFC o de la fuente anterior.
      disposeViewer();
      state.viewerBusy = true;
      state.storey = '';
      state.category = '';
      state.planView = false;
      state.section = 'off';
      const v = await ensureViewer();
      bindViewer();
      const info = await v.open(bytes, state.fileName, project);
      state.viewerStale = false;
      state.viewerBusy = false;
      hideProgress('Modelo cargado en el visor');
      render();
      await applyViewerState();
      state.storeyList = info.storeys || [];
      state.categoryList = info.categories || [];
      render();
      scheduleViewerResize();
      toast('Visor 3D listo', info.elements + ' elementos enlazados · ' + info.spaces + ' espacios · ' +
        (state.storeyList.length ? state.storeyList.length + ' plantas' : 'sin plantas') + ' · modelo ' + label, 'ok');
      for (const note of info.notes || []) toast('Aviso del visor', note);
    } catch (err) {
      disposeViewer();
      state.viewerBusy = false;
      state.viewerError = String((err && err.message) || err);
      hideProgress('El visor no ha podido arrancar');
      render();
      console.error(err);
    }
  }

  async function applyViewerState() {
    const v = state.viewer;
    if (!v || !v.model) return;
    await v.applyColors(state.colorMode);
    await v.setSpacesVisible(state.showSpaces);
    if (state.section !== 'off') await v.section(state.section);
  }

  /** El visor devuelve un GlobalId: se resuelve a fila y se muestra su ficha. */
  function onViewerPick(guid) {
    const P = state.project;
    if (!P) return;
    state.picked = guid || null;
    if (!guid) { renderSide(); return; }
    const sp = P.spaces.find(s => s.guid === guid);
    const el = P.elements.find(e => e.guid === guid);
    if (sp && state.tab !== 'spaces') go('spaces');
    else if (el && state.tab !== 'elements' && state.tab !== 'purge') go('elements');
    else render();
    if (state.viewer) state.viewer.select([guid], { zoom: false });
    highlightRow(guid);
    renderSide();
  }

  function highlightRow(guid) {
    setTimeout(() => {
      const row = document.querySelector('tr[data-guid="' + cssEscape(guid) + '"]');
      if (!row) return;
      document.querySelectorAll('tr.picked').forEach(r => r.classList.remove('picked'));
      row.classList.add('picked');
      row.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }, 30);
  }

  function cssEscape(v) { return String(v).replace(/["\\]/g, '\\$&'); }

  /** Barra flotante mientras se dibuja, para no repintar todo el panel. */
  function renderDrawBar() {
    const host = $('#drawBar');
    const n = state.draw.pts.length;
    const html = `<b>Dibujando recinto</b>
      <span>${n} esquina${n === 1 ? '' : 's'}</span>
      ${drawLevelsHtml()}
      <button class="btn primary" data-act="draw-close" ${n < 3 ? 'disabled' : ''}>Cerrar recinto</button>
      <button class="btn" data-act="draw-undo" ${!n ? 'disabled' : ''}>Deshacer</button>
      <button class="btn ghost" data-act="draw-cancel">Cancelar</button>`;
    if (host) { host.innerHTML = html; return; }
    const bar = document.createElement('div');
    bar.id = 'drawBar';
    bar.className = 'drawbar';
    bar.innerHTML = html;
    document.body.appendChild(bar);
  }

  /** Cota de arranque del nivel activo en el visor; si no hay, la planta baja. */
  function activeStoreyZ(P) {
    if (state.storey) {
      const hit = P.storeys.find(x => x.name === state.storey) ||
        P.storeys.find(x => x.name && state.storey.indexOf(x.name) >= 0);
      if (hit && Number.isFinite(hit.z)) return hit.z;
    }
    // Sin planta elegida, la de referencia es la que agrupa más elementos: en
    // modelos con niveles auxiliares —terreno, dinteles, cumbrera— la más baja
    // no es el suelo del edificio.
    let mejor = null, mejorN = -1;
    for (const s of P.storeys) {
      if (!Number.isFinite(s.z)) continue;
      let n = 0;
      for (const [, st] of P.storeyOfElem) if (st === s.id) n++;
      for (const sp of P.spaces) if (sp.storeyId === s.id) n += 2;
      if (n > mejorN) { mejorN = n; mejor = s; }
    }
    if (mejor && mejorN > 0) return mejor.z;
    // Si tampoco eso decide, la cota de suelo de los recintos existentes.
    const conSuelo = P.spaces.filter(sp => sp.poly && Number.isFinite(sp.base));
    if (conSuelo.length) return conSuelo.sort((a, b) => a.base - b.base)[Math.floor(conSuelo.length / 2)].base;
    if (P.storeys[0] && Number.isFinite(P.storeys[0].z)) return P.storeys[0].z;
    return P.zBase || 0;
  }

  /**
   * Cotas del recinto que se está dibujando. El suelo se propone desde la
   * planta activa, pero se puede escribir a mano: en un bajo cubierta el
   * arranque es el falso techo, que rara vez coincide con un nivel.
   */
  function drawLevelsHtml() {
    const P = state.project;
    const base = state.drawBase != null ? state.drawBase : (P ? activeStoreyZ(P) : 0);
    return `<span class="drawlv">
      <label>Suelo <input type="number" step="0.05" data-act="draw-base" value="${n2(base, 3).replace(',', '.')}"></label>
      <label>Techo
        <select data-act="draw-topmode">
          <option value="auto" ${state.drawTop === 'auto' ? 'selected' : ''}>hasta la cubierta</option>
          <option value="fijo" ${state.drawTop === 'fijo' ? 'selected' : ''}>cota fija</option>
        </select>
      </label>
      ${state.drawTop === 'fijo'
        ? `<input type="number" step="0.05" data-act="draw-topz" title="Cota de techo" value="${state.drawTopZ != null ? n2(state.drawTopZ, 3).replace(',', '.') : n2(base + 2.5, 3).replace(',', '.')}">`
        : ''}
    </span>`;
  }

  function exitDrawMode() {
    state.draw = { active: false, pts: [], hover: null, snap: null, in3d: false };
    const bar = $('#drawBar');
    if (bar) bar.remove();
    if (state.expanded) {
      state.expanded = false;
      document.body.classList.remove('viewer-expanded');
      scheduleViewerResize();
    }
  }

  /** Cierra el contorno dibujado y lo escribe como IfcSpace. */
  function closeDrawing() {
    const P = state.project;
    const raw = (state.draw.in3d && state.viewer) ? state.viewer.endDraw(true) : state.draw.pts;
    const limpios = (raw || []).filter(p => p && Number.isFinite(p[0]) && Number.isFinite(p[1]));
    const pts = HEM.geom.dedupeRing(limpios);
    if (!P || pts.length < 3) {
      toast('Contorno incompleto', 'Hacen falta al menos tres esquinas.');
      exitDrawMode();
      return;
    }
    const area = HEM.geom.area(pts);
    if (area < 0.5) { toast('Contorno demasiado pequeño', n2(area, 2) + ' m²'); exitDrawMode(); return; }

    const nombre = (typeof prompt === 'function'
      ? prompt('Nombre del recinto', 'Recinto ' + (P.spaces.length + 1))
      : null) || ('Recinto ' + (P.spaces.length + 1));

    const base = state.drawBase != null ? state.drawBase : activeStoreyZ(P);

    // Techo: o una cota fija indicada por el usuario, o hasta donde llegue la
    // cubierta sobre el recinto. El recorte fino contra los faldones lo hace
    // luego la exportación, pero así el recinto ya nace con la altura correcta.
    let altura = (P.storeys[1] && P.storeys[1].z - base) || 2.5;
    if (state.drawTop === 'fijo' && state.drawTopZ != null) {
      altura = state.drawTopZ - base;
      if (altura < 0.3) { toast('Cota de techo incorrecta', 'El techo debe quedar al menos 30 cm por encima del suelo.'); return; }
    } else {
      try {
        const planos = HEM.rooms.ceilingPlanes(P);
        if (planos.length) {
          let techo = null;
          for (const p of pts.concat([HEM.geom.centroid(pts)])) {
            const c = HEM.rooms.ceilingAt(planos, p[0], p[1], base);
            if (c && (techo === null || c.z > techo)) techo = c.z;
          }
          if (techo !== null && techo - base > 0.5) altura = techo - base;
        }
      } catch (e) { /* se queda con la altura de planta */ }
    }

    const def = { poly: pts, name: nombre, base, height: altura };
    state.createdRooms.push(def);
    const F = new HEM.fix.Fixer(P, Object.assign({}, fixerOptions(), { createRooms: null }));
    F.createSpaces([def], (P.storeys[0] || {}).id);

    exitDrawMode();
    state.viewerStale = true;
    reaudit();
    toast('Recinto creado', nombre + ' · ' + n2(area, 2) + ' m² · de ' + n2(base, 2) + ' a ' + n2(base + altura, 2) + ' m' +
      (state.drawTop === 'fijo' ? ' (cota fija)' : '. Al exportar se recorta contra los faldones.'), 'ok');
    go('spaces');
  }

  /** Punto único de entrada desde la interfaz hacia el visor. */
  async function focusIn3D(guids, opts) {
    if (!guids || !guids.length) return;
    if (state.viewMode !== '3d') { state.viewMode = '3d'; render(); }
    if (!state.viewer || !state.viewer.model || state.viewerStale) {
      if (location.protocol === 'file:') {
        toast('El visor 3D necesita servidor', 'Abre la web por 127.0.0.1 o usa la vista de planta.');
        return;
      }
      await loadViewer();
      if (!state.viewer || !state.viewer.model) return;
    }
    const v = state.viewer;
    if (opts && opts.isolate) {
      const isolated = await v.isolate(guids);
      if (!isolated) {
        toast('Elemento no disponible en esta vista', state.viewerSource === 'clean'
          ? 'Se retiró del modelo depurado. Elige «Original completo» para localizarlo sin ocultar el resto.'
          : 'No se ha podido enlazar con la geometría cargada.');
        return;
      }
    }
    const selected = await v.select(guids, { zoom: true, problem: !!(opts && opts.problem) });
    if (!selected) return;
    state.picked = guids.length === 1 ? guids[0] : null;
  }

  /** Pantalla → coordenadas de proyecto, deshaciendo la transformación del dibujo. */
  function planToWorld(cv, ev) {
    const rect = cv.getBoundingClientRect();
    const W = rect.width, H = rect.height;
    const s = state.plan.scale;
    if (!Number.isFinite(s) || s <= 0 || !W || !H) return null;
    const cx = state.plan.cx || 0, cy = state.plan.cy || 0;
    const px = ev.clientX - rect.left, py = ev.clientY - rect.top;
    const p = [
      (px - W / 2 - state.plan.ox) / s + cx,
      -(py - H / 2 - state.plan.oy) / s + cy
    ];
    return (Number.isFinite(p[0]) && Number.isFinite(p[1])) ? p : null;
  }

  /** Captura a esquinas y ejes de muro, y al primer punto para cerrar. */
  function snapPoint(world) {
    const P = state.project;
    if (!P) return { p: world, kind: null };
    // Radio de captura de unos 14 px, convertido a metros y acotado: sin tope,
    // con la planta muy alejada todo caía dentro del radio y los puntos se
    // colapsaban unos sobre otros.
    const radio = Math.max(0.04, Math.min(0.60, 14 / Math.max(0.5, state.plan.scale)));
    let best = null, bestD = radio;
    let bestRank = 99;
    const RANK = { cierre: 0, esquina: 1, punto: 1, cara: 2, eje: 3 };
    const test = (q, kind) => {
      const d = Math.hypot(q[0] - world[0], q[1] - world[1]);
      if (d > radio) return;
      const r = RANK[kind];
      // Los puntos ganan a las aristas aunque estén algo más lejos.
      if (r < bestRank || (r === bestRank && d < bestD)) { bestRank = r; bestD = d; best = { p: [q[0], q[1]], kind }; }
    };
    if (state.draw.pts.length >= 3) {
      const f = state.draw.pts[0];
      if (Math.hypot(f[0] - world[0], f[1] - world[1]) < radio * 0.8) best = { p: [f[0], f[1]], kind: 'cierre' };
    }
    if (best) return best;
    for (const q of state.draw.pts) test(q, 'punto');

    const baseZ = activeStoreyZ(P);
    const projectToSegment = (a, b, kind) => {
      const dx = b[0] - a[0], dy = b[1] - a[1];
      const l2 = dx * dx + dy * dy;
      if (l2 < 1e-9) return;
      let t = ((world[0] - a[0]) * dx + (world[1] - a[1]) * dy) / l2;
      t = Math.max(0, Math.min(1, t));
      test([a[0] + dx * t, a[1] + dy * t], kind);
    };
    for (const el of P.elements) {
      if (!el.keep || el.container) continue;
      // No se mezclan caras de plantas distintas cuando el IFC contiene
      // cerramientos superpuestos en Z.
      if (Number.isFinite(el.base) && Number.isFinite(el.top) &&
          (baseZ < el.base - 0.35 || baseZ > el.top + 0.35)) continue;
      // Muros, tabiques y muros cortina. La huella IFC tiene prioridad porque
      // contiene las caras interiores reales; el eje+espesor queda como
      // respaldo para IFC sin perfil resoluble.
      const esMuro = el.family === 'wall' || el.family === 'curtain';
      if (!esMuro) continue;
      const poly = el.poly && el.poly.length >= 3 ? HEM.geom.dedupeRing(el.poly) : null;
      if (poly && poly.length >= 3) {
        for (const q of poly) test(q, 'esquina');
        for (let i = 0; i < poly.length; i++) projectToSegment(poly[i], poly[(i + 1) % poly.length], 'cara');
      }
      if (el.axis && el.axis.length >= 2) {
        const axis = el.axis;
        for (const q of axis) test(q, 'eje');
        for (let i = 0; i < axis.length - 1; i++) {
          const a = axis[i], b = axis[i + 1];
          projectToSegment(a, b, 'eje');
          if (poly) continue;
          const dx = b[0] - a[0], dy = b[1] - a[1], len = Math.hypot(dx, dy);
          if (len < 1e-9) continue;
          const nx = -dy / len, ny = dx / len, th = Math.max(0.02, el.thickness || 0.1);
          let t = ((world[0] - a[0]) * dx + (world[1] - a[1]) * dy) / (len * len);
          t = Math.max(0, Math.min(1, t));
          const px = a[0] + dx * t, py = a[1] + dy * t;
          test([px + nx * th / 2, py + ny * th / 2], 'cara');
          test([px - nx * th / 2, py - ny * th / 2], 'cara');
          for (const extremo of [a, b]) {
            test([extremo[0] + nx * th / 2, extremo[1] + ny * th / 2], 'esquina');
            test([extremo[0] - nx * th / 2, extremo[1] - ny * th / 2], 'esquina');
          }
        }
      }
    }
    return best || { p: world, kind: null };
  }

  function bindPlan() {
    const cv = $('#planCanvas');
    if (!cv) return;
    if (state.draw.active) {
      cv.style.cursor = 'crosshair';
      cv.addEventListener('mousemove', (ev) => {
        const w0 = planToWorld(cv, ev);
        if (!w0) return;
        const snap = snapPoint(w0);
        state.draw.hover = snap.p;
        state.draw.snap = snap.kind;
        drawPlan(cv);
      });
      cv.addEventListener('click', (ev) => {
        const w0 = planToWorld(cv, ev);
        if (!w0) { toast('Planta sin dimensionar', 'Encuadra la planta antes de dibujar.'); return; }
        const snap = snapPoint(w0);
        if (snap.kind === 'cierre') return closeDrawing();
        state.draw.pts.push(snap.p);
        render();
      });
      cv.addEventListener('dblclick', (ev) => { ev.preventDefault(); closeDrawing(); });
    }
    const fit = () => { fitPlan(cv); drawPlan(cv); };
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(fit) : null;
    if (ro) ro.observe(cv);
    fit();
    cv.addEventListener('wheel', e => {
      e.preventDefault();
      const k = e.deltaY < 0 ? 1.12 : 1 / 1.12;
      state.plan.scale *= k;
      drawPlan(cv);
    }, { passive: false });
    cv.addEventListener('pointerdown', e => {
      state.plan.drag = { x: e.clientX, y: e.clientY, ox: state.plan.ox, oy: state.plan.oy };
      cv.classList.add('drag'); cv.setPointerCapture(e.pointerId);
    });
    cv.addEventListener('pointermove', e => {
      if (!state.plan.drag) return;
      state.plan.ox = state.plan.drag.ox + (e.clientX - state.plan.drag.x);
      state.plan.oy = state.plan.drag.oy + (e.clientY - state.plan.drag.y);
      drawPlan(cv);
    });
    ['pointerup', 'pointercancel'].forEach(ev => cv.addEventListener(ev, () => { state.plan.drag = null; cv.classList.remove('drag'); }));
  }

  function planBounds() {
    const P = state.project;
    let b = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity, any: false };
    const eat = (ring) => {
      for (const p of ring) {
        if (p[0] < b.minX) b.minX = p[0];
        if (p[1] < b.minY) b.minY = p[1];
        if (p[0] > b.maxX) b.maxX = p[0];
        if (p[1] > b.maxY) b.maxY = p[1];
        b.any = true;
      }
    };
    for (const s of P.spaces) if (s.poly) eat(s.poly);
    for (const e of P.elements) {
      if (!HEM.cype.ENVELOPE.has(e.family) || !e.keep) continue;
      if (e.axis) eat(e.axis);
      else if (e.poly && e.family !== 'slab') eat(e.poly);
    }
    return b;
  }

  function fitPlan(cv) {
    const rect = cv.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    cv.width = Math.max(1, Math.round(rect.width * dpr));
    cv.height = Math.max(1, Math.round(rect.height * dpr));
    const b = planBounds();
    if (!b.any) { state.plan.scale = 20; state.plan.ox = rect.width / 2; state.plan.oy = rect.height / 2; return; }
    const w = Math.max(0.5, b.maxX - b.minX), h = Math.max(0.5, b.maxY - b.minY);
    let s = Math.min(rect.width / w, rect.height / h) * 0.86;
    // Si el panel aún no tiene medidas —pestaña oculta, primer pintado— la
    // escala saldría cero o infinita y todas las coordenadas se irían a NaN.
    if (!Number.isFinite(s) || s <= 0.01) s = 20;
    state.plan.scale = s;
    state.plan.cx = (b.minX + b.maxX) / 2;
    state.plan.cy = (b.minY + b.maxY) / 2;
    state.plan.ox = 0; state.plan.oy = 0;
  }

  function drawPlan(cv) {
    const P = state.project;
    if (!P || !cv) return;
    const dpr = window.devicePixelRatio || 1;
    const ctx = cv.getContext('2d');
    const W = cv.width / dpr, H = cv.height / dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);

    const css = getComputedStyle(document.documentElement);
    const col = (name, fallback) => (css.getPropertyValue(name) || fallback).trim();
    const s = state.plan.scale;
    const cx = state.plan.cx || 0, cy = state.plan.cy || 0;
    const tx = (x) => (x - cx) * s + W / 2 + state.plan.ox;
    const ty = (y) => -(y - cy) * s + H / 2 + state.plan.oy;

    // espacios
    for (const sp of P.spaces) {
      if (!sp.poly) continue;
      ctx.fillStyle = sp.include ? 'rgba(14,165,233,.14)' : 'rgba(148,163,184,.10)';
      if (sp.inners && sp.inners.length) {
        // Con patios o huecos interiores el relleno se hace por triángulos:
        // así el hueco queda realmente vacío.
        for (const t of HEM.geom.triangulate(sp.poly, sp.inners)) {
          ctx.beginPath();
          ctx.moveTo(tx(t[0][0]), ty(t[0][1]));
          ctx.lineTo(tx(t[1][0]), ty(t[1][1]));
          ctx.lineTo(tx(t[2][0]), ty(t[2][1]));
          ctx.closePath();
          ctx.fill();
        }
      }
      ctx.beginPath();
      sp.poly.forEach((p, i) => i ? ctx.lineTo(tx(p[0]), ty(p[1])) : ctx.moveTo(tx(p[0]), ty(p[1])));
      ctx.closePath();
      if (!sp.inners || !sp.inners.length) ctx.fill();
      ctx.strokeStyle = sp.include ? col('--space', '#0ea5e9') : col('--muted2', '#94a3b8');
      ctx.lineWidth = sp.include ? 1 : 0.6;
      ctx.setLineDash(sp.include ? [] : [4, 3]);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // forjados y cubiertas
    for (const e of P.elements) {
      if (!e.keep || !e.poly) continue;
      if (e.family !== 'slab' && e.family !== 'roof') continue;
      ctx.beginPath();
      e.poly.forEach((p, i) => i ? ctx.lineTo(tx(p[0]), ty(p[1])) : ctx.moveTo(tx(p[0]), ty(p[1])));
      ctx.closePath();
      ctx.strokeStyle = e.role === 'cubierta' ? col('--roof', '#7c3aed') : col('--ground', '#8b5e34');
      ctx.lineWidth = 0.9;
      ctx.setLineDash([6, 4]);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // muros
    for (const e of P.elements) {
      if (!e.keep || e.family !== 'wall' || !e.axis) continue;
      const ext = e.decided === true;
      ctx.beginPath();
      e.axis.forEach((p, i) => i ? ctx.lineTo(tx(p[0]), ty(p[1])) : ctx.moveTo(tx(p[0]), ty(p[1])));
      ctx.strokeStyle = e.role === 'muro_sotano' ? col('--ground', '#8b5e34') : (ext ? col('--ext', '#e0632b') : col('--int', '#2563eb'));
      ctx.lineWidth = Math.max(1.4, (e.thickness || 0.2) * s);
      ctx.lineCap = 'butt';
      ctx.stroke();
    }

    // huecos
    for (const e of P.elements) {
      if (!e.keep || (e.family !== 'window' && e.family !== 'door')) continue;
      const b = e.bbox || (e.poly ? HEM.geom.bbox(e.poly) : null);
      if (!b) continue;
      const x = tx((b.minX + b.maxX) / 2), y = ty((b.minY + b.maxY) / 2);
      ctx.beginPath();
      ctx.arc(x, y, e.family === 'window' ? 3.2 : 2.6, 0, Math.PI * 2);
      ctx.fillStyle = e.decided ? col('--ext', '#e0632b') : col('--int', '#2563eb');
      ctx.globalAlpha = e.family === 'window' ? 1 : 0.65;
      ctx.fill();
      ctx.globalAlpha = 1;
    }

    // contorno que se está dibujando
    if (state.draw.active) {
      const pts = state.draw.pts;
      const hov = state.draw.hover;
      if (pts.length) {
        ctx.beginPath();
        pts.forEach((p, i) => i ? ctx.lineTo(tx(p[0]), ty(p[1])) : ctx.moveTo(tx(p[0]), ty(p[1])));
        if (hov) ctx.lineTo(tx(hov[0]), ty(hov[1]));
        ctx.strokeStyle = col('--blue', '#2563eb');
        ctx.lineWidth = 2;
        ctx.setLineDash([6, 4]);
        ctx.stroke();
        ctx.setLineDash([]);
        if (pts.length >= 3) {
          ctx.beginPath();
          pts.forEach((p, i) => i ? ctx.lineTo(tx(p[0]), ty(p[1])) : ctx.moveTo(tx(p[0]), ty(p[1])));
          ctx.closePath();
          ctx.fillStyle = 'rgba(37,99,235,.13)';
          ctx.fill();
        }
        for (const p of pts) {
          ctx.beginPath();
          ctx.arc(tx(p[0]), ty(p[1]), 3.4, 0, Math.PI * 2);
          ctx.fillStyle = col('--blue', '#2563eb');
          ctx.fill();
        }
      }
      if (hov) {
        ctx.beginPath();
        ctx.arc(tx(hov[0]), ty(hov[1]), state.draw.snap ? 5.5 : 3, 0, Math.PI * 2);
        ctx.strokeStyle = state.draw.snap ? col('--success', '#118d68') : col('--muted', '#64748b');
        ctx.lineWidth = 1.6;
        ctx.stroke();
      }
    }

    // etiquetas
    ctx.font = '600 9px Inter, Arial, sans-serif';
    ctx.textAlign = 'center';
    for (const sp of P.spaces) {
      if (!sp.poly || !sp.include) continue;
      const c = HEM.geom.centroid(sp.poly);
      ctx.fillStyle = col('--muted', '#64748b');
      ctx.fillText(sp.label.slice(0, 18), tx(c[0]), ty(c[1]));
    }
  }

  /* ====================================================================
   * Panel lateral contextual
   * ================================================================== */

  function renderSide() {
    const P = state.project;
    if (!P) return;
    const A = state.audit;
    const active = P.spaces.filter(s => s.include);
    const envelope = P.elements.filter(e => HEM.cype.ENVELOPE.has(e.family) && e.keep && !e.container);
    const cls = A.score.errors ? 'error' : (A.score.warns ? 'warn' : 'ok');
    el.side.innerHTML = `
      <div class="score">
        <div class="gauge" style="background:conic-gradient(var(--${cls === 'ok' ? 'success' : cls === 'warn' ? 'warn' : 'danger'}) ${A.score.pct * 3.6}deg, var(--line2) 0)">
          <div style="background:var(--panel);width:60px;height:60px;border-radius:50%;display:grid;place-items:center">
            ${A.score.pct}%<span>CYPE</span>
          </div>
        </div>
        <div class="score-legend">
          <span><i class="dot error"></i><b>${A.score.errors}</b> incumplimientos</span>
          <span><i class="dot warn"></i><b>${A.score.warns}</b> a revisar</span>
          <span><i class="dot ok"></i><b>${A.score.oks}</b> correctos</span>
        </div>
      </div>
      <div class="block">
        <h3>Modelo</h3>
        <p>
          Esquema <b>${esc(state.model.schema)}</b><br>
          ${n0(state.model.count)} entidades · ${fmtBytes(state.fileSize)}<br>
          ${P.storeys.length} planta${P.storeys.length === 1 ? '' : 's'} · ${P.spaces.length} espacios<br>
          Origen: ${esc((state.model.originatingSystem || '—').slice(0, 42))}
        </p>
      </div>
      <div class="block">
        <h3>Envolvente detectada</h3>
        <p>
          ${envelope.filter(e => e.family === 'wall' && e.decided).length} fachadas ·
          ${envelope.filter(e => e.family === 'wall' && !e.decided).length} particiones<br>
          ${envelope.filter(e => e.role === 'cubierta').length} cubiertas ·
          ${envelope.filter(e => e.role === 'solera').length} soleras<br>
          ${envelope.filter(e => e.family === 'window').length} ventanas ·
          ${envelope.filter(e => e.family === 'door').length} puertas<br>
          Superficie útil activa: <b>${n2(active.reduce((a, s) => a + s.areaNet, 0), 1)} m²</b>
        </p>
      </div>
      ${pickedCard()}
      <div class="block">
        <h3>Recordatorio</h3>
        <p>La deducción automática es un punto de partida sólido, no un dictamen. Revisa el modelo antes de exportar: el color naranja marca lo que dará al exterior en el modelo analítico.</p>
      </div>`;
  }

  /** Ficha del elemento seleccionado en el visor o en las tablas. */
  function pickedCard() {
    const P = state.project;
    if (!P || !state.picked) return '';
    const sp = P.spaces.find(s => s.guid === state.picked);
    if (sp) {
      return `<div class="block picked-card">
        <h3>Espacio seleccionado</h3>
        <p><b>${esc(sp.label)}</b><br>
          ${USES_LABEL[sp.use] || sp.use} · ${sp.include ? 'entra en el cálculo' : 'excluido'}<br>
          Superficie ${n2(sp.areaNet, 2)} m² · altura ${n2(sp.height, 2)} m<br>
          Volumen ${n2(sp.areaNet * sp.height, 2)} m³ · perímetro ${n2(sp.perimeter, 2)} m<br>
          <small>${esc(sp.guid)}</small></p>
      </div>`;
    }
    const e2 = P.elements.find(x => x.guid === state.picked);
    if (!e2) return '';
    const layers = e2.layers && e2.layers.layers.length
      ? '<br>' + e2.layers.layers.map(l => '· ' + esc(l.material) + ' ' + n2(l.thickness * 100, 1) + ' cm').join('<br>')
      : '';
    return `<div class="block picked-card">
      <h3>Elemento seleccionado</h3>
      <p><b>${esc((e2.typeName || e2.name || e2.type).slice(0, 70))}</b><br>
        ${esc(e2.type.replace('IFC', ''))} · ${esc(ROLE_LABEL[e2.role] || e2.role || '—')}<br>
        ${e2.decided === true ? 'Da al exterior' : e2.decided === false ? 'Interior' : 'Sin determinar'}
        ${e2.thickness != null ? ' · espesor ' + n2(e2.thickness * 100, 1) + ' cm' : ''}<br>
        ${e2.keep ? 'Se conserva' : 'Se retira del IFC'}
        ${layers}
        <br><small>${esc(e2.guid)}</small></p>
    </div>`;
  }

  const USES_LABEL = Object.fromEntries(USES);

  /* ====================================================================
   * Eventos
   * ================================================================== */

  document.addEventListener('click', async (e) => {
    const tab = e.target.closest('.mode-tab');
    if (tab && !tab.disabled) return go(tab.dataset.tab);

    const btn = e.target.closest('[data-act]');
    if (!btn) return;
    const act = btn.dataset.act;
    const P = state.project;

    if (act === 'plan-fit') { const cv = $('#planCanvas'); if (cv) { fitPlan(cv); drawPlan(cv); } return; }

    /* ---- visor 3D ---- */
    if (act === 'view-3d') { state.viewMode = '3d'; render(); return; }
    if (act === 'view-plan') { state.viewMode = 'plan'; render(); return; }
    if (act === 'v-load' || act === 'v-reload') { state.viewerError = null; return loadViewer(); }
    if (act === 'v-fit') { if (state.viewer) state.viewer.fit(); return; }
    if (act === 'v-showall') {
      state.storey = ''; state.category = ''; state.planView = false; state.section = 'off';
      if (state.viewer) {
        await state.viewer.showAll();
        await state.viewer.clearSelection();
        await state.viewer.fit();
      }
      state.picked = null;
      render();
      return;
    }
    if (act === 'v-view') { if (state.viewer) state.viewer.setView(btn.dataset.v); return; }
    if (act === 'v-plan') {
      if (!state.viewer || !state.storey) return;
      state.planView = !state.planView;
      const ok = state.planView
        ? await state.viewer.openPlanView(state.storey)
        : await state.viewer.closePlanView();
      if (!ok && state.planView) state.planView = false;
      render();
      return;
    }
    if (act === 'v-isolate') { if (state.viewer) await state.viewer.isolateSelection(); return; }
    if (act === 'v-hide') { if (state.viewer) await state.viewer.hideSelection(); return; }
    if (act === 'v-section') {
      const order = ['off', 'planta', 'alzado', 'lateral'];
      state.section = order[(order.indexOf(state.section) + 1) % order.length];
      if (state.viewer) {
        const ok = await state.viewer.section(state.section);
        if (!ok) state.section = 'off';
      }
      toast('Sección', state.section === 'off' ? 'Sección desactivada' : 'Plano de sección: ' + state.section);
      render();
      return;
    }
    if (act === 'v-expand') {
      state.expanded = !state.expanded;
      document.body.classList.toggle('viewer-expanded', state.expanded);
      render();
      scheduleViewerResize();
      return;
    }
    if (act === 'check-3d') {
      const targets = (state.checkTargets && state.checkTargets.get(btn.dataset.key)) || [];
      return focusIn3D(targets, { isolate: true, problem: btn.dataset.level === 'error' });
    }
    if (act === 'row-space' || act === 'row-elem') {
      const guid = btn.dataset.guid;
      if (!guid) return;
      state.picked = guid;
      document.querySelectorAll('tr.picked').forEach(r => r.classList.remove('picked'));
      btn.classList.add('picked');
      focusIn3D([guid], {});
      renderSide();
      return;
    }
    if (act === 'row-group') {
      const g = P && P.groups.find(x => x.key === btn.dataset.k);
      if (!g) return;
      const guids = g.ids.map(id => { const x = P.byId.get(id); return x ? x.guid : null; }).filter(Boolean);
      return focusIn3D(guids, { isolate: true });
    }
    if (act === 'build') return build();
    if (act === 'dl-ifc') return download(baseName() + '_CYPE.ifc', state.result.text, 'application/x-step');
    if (act === 'dl-json') return download(baseName() + '_informe.json', JSON.stringify(state.result.report, null, 2), 'application/json');
    if (act === 'dl-html') return download(baseName() + '_informe.html', htmlReport(), 'text/html;charset=utf-8');

    if (!P) return;
    if (act === 'draw-start') {
      const base = activeStoreyZ(P);
      // Con el visor cargado se dibuja sobre el modelo, con enganche real a la
      // geometría; si no, se cae a la planta esquemática.
      if (state.viewer && state.viewer.model && state.viewMode === '3d') {
        state.expanded = true;
        document.body.classList.add('viewer-expanded');
        state.draw = { active: true, pts: [], hover: null, snap: null, in3d: true };
        state.viewer.beginDraw(base, (kind, d) => {
          state.draw.pts = d.pts || [];
          if (kind === 'close') return closeDrawing();
          if (kind === 'point' || kind === 'start') renderDrawBar();
        });
        render();
        scheduleViewerResize();
        toast('Modo dibujo sobre el modelo', 'Se engancha a esquinas y aristas de muros y tabiques. Doble clic o volver al primer punto cierra el recinto.');
        return;
      }
      state.viewMode = 'plan';
      state.draw = { active: true, pts: [], hover: null, snap: null, in3d: false };
      toast('Modo dibujo', 'Marca las esquinas del recinto sobre la planta.');
      return render();
    }
    if (act === 'draw-undo') {
      if (state.draw.in3d && state.viewer) { state.viewer.undoDrawPoint(); return renderDrawBar(); }
      state.draw.pts.pop(); return render();
    }
    if (act === 'draw-cancel') {
      if (state.draw.in3d && state.viewer) state.viewer.endDraw(false);
      exitDrawMode();
      return render();
    }
    if (act === 'draw-close') return closeDrawing();
    if (act === 'space-del') {
      const sp = P.spaces[+btn.dataset.i];
      if (!sp) return;
      state.createdRooms = state.createdRooms.filter(r => r.name !== sp.label);
      P.spaces.splice(+btn.dataset.i, 1);
      state.viewerStale = true;
      reaudit();
      toast('Recinto eliminado', sp.label);
      return viewSpaces();
    }
    if (act === 'detect') {
      const storey = P.storeys.length === 1 ? P.storeys[0].id : null;
      const d = HEM.rooms.detectRooms(P, { cell: 0.06, storeyId: storey });
      d.rooms.forEach((r, i) => { r.name = 'Recinto ' + r.index; r.take = true; void i; });
      state.detected = d;
      toast('Detección de recintos', d.rooms.length + ' contornos cerrados · ' + n2(d.rooms.reduce((a, r) => a + r.area, 0), 1) + ' m²');
      return viewSpaces();
    }
    if (act === 'det-clear') { state.detected = null; return viewSpaces(); }
    if (act === 'det-create') {
      const d = state.detected;
      if (!d) return;
      const rooms = d.rooms.filter(r => r.take !== false).map(r => ({
        poly: r.poly, name: r.name, height: 2.5, base: P.zBase || 0
      }));
      if (!rooms.length) return toast('Nada que crear', 'No hay recintos marcados.');
      state.createdRooms = state.createdRooms.concat(rooms);
      const F = new HEM.fix.Fixer(P, Object.assign({}, fixerOptions(), { createRooms: null }));
      const created = F.createSpaces(rooms, (P.storeys[0] || {}).id);
      state.detected = null;
      state.viewerStale = true;
      reaudit();
      toast('Recintos creados', created.length + ' IfcSpace añadidos al modelo. Revisa sus nombres y usos antes de exportar.', 'ok');
      return viewSpaces();
    }
    if (act === 'all-on') { P.spaces.forEach(s => { s.include = true; }); state.viewerStale = true; reaudit(); return viewSpaces(); }
    if (act === 'only-real') {
      P.spaces.forEach(s => { s.include = !(s.use === 'descartado' || s.use === 'exterior'); });
      state.viewerStale = true; reaudit(); return viewSpaces();
    }
    if (act === 'reset-roles') {
      P.elements.forEach(x => { x.userRole = null; x.userExternal = null; });
      state.viewerStale = true; reaudit(); return viewElements();
    }
    if (act === 'grp-env') { P.groups.forEach(g => P.groupChoice.set(g.key, !!g.envelope)); state.viewerStale = true; reaudit(); return viewPurge(); }
    if (act === 'grp-all') { P.groups.forEach(g => P.groupChoice.set(g.key, true)); state.viewerStale = true; reaudit(); return viewPurge(); }
    if (act === 'grp-auto') { P.groupChoice.clear(); state.viewerStale = true; reaudit(); return viewPurge(); }
  });

  document.addEventListener('change', async (e) => {
    const t = e.target;
    const act = t.dataset && t.dataset.act;
    if (!act) return;
    const P = state.project;

    if (act === 'opt') { state.options[t.dataset.k] = t.checked; state.result = null; state.viewerStale = true; return viewExport(); }
    if (act === 'target') { setTarget(t.dataset.k); return viewExport(); }
    if (act === 'site') {
      const k = t.dataset.k;
      const num = ['lat', 'lon', 'elevation'].includes(k);
      state.site[k] = num ? (t.value.trim() === '' ? null : parseFloat(t.value.replace(',', '.'))) : t.value;
      state.result = null;
      return;
    }

    /* ---- controles del visor ---- */
    if (act === 'v-color') {
      state.colorMode = t.value;
      if (state.viewer) state.viewer.applyColors(state.colorMode);
      const lg = $('#viewerLegend');
      if (lg) lg.innerHTML = legendFor(state.colorMode);
      return;
    }
    if (act === 'v-source') {
      if (t.value === 'full' && state.fileSize > 25 * 1024 * 1024) {
        const mb = (state.fileSize / 1048576).toFixed(0);
        if (!confirm('El modelo original ocupa ' + mb + ' MB. Convertirlo entero puede tardar varios minutos y consumir mucha memoria.\n\n¿Continuar?')) {
          t.value = state.viewerSource;
          return;
        }
      }
      state.viewerSource = t.value;
      return loadViewer();
    }
    if (act === 'v-storey') {
      state.storey = t.value;
      state.category = '';
      state.planView = false;
      if (state.viewer) {
        await state.viewer.closePlanView();
        const ok = await state.viewer.isolateStorey(t.value || null);
        if (!ok && t.value) state.storey = '';
      }
      render();
      return;
    }
    if (act === 'v-cat') {
      state.category = t.value;
      state.storey = '';
      state.planView = false;
      if (state.viewer) {
        await state.viewer.closePlanView();
        const ok = await state.viewer.isolateCategory(t.value || null);
        if (!ok && t.value) state.category = '';
      }
      render();
      return;
    }
    if (act === 'v-spaces') {
      state.showSpaces = t.checked;
      if (state.viewer) await state.viewer.setSpacesVisible(state.showSpaces);
      return;
    }
    if (!P) return;

    if (act === 'inc') {
      const sp = P.spaces[+t.dataset.i];
      sp.include = t.checked;
      if (!t.checked && sp.use === 'acondicionado') sp.use = 'descartado';
      state.viewerStale = true;
      reaudit(); return viewSpaces();
    }
    if (act === 'sp-name') {
      const sp = P.spaces[+t.dataset.i];
      if (!sp) return;
      const nuevo = t.value.trim() || sp.label;
      const def = state.createdRooms.find(r => r.name === sp.label);
      if (def) def.name = nuevo;
      sp.label = nuevo; sp.longName = nuevo; sp.reference = sp.reference || nuevo;
      renameSpaceInModel(P, sp, nuevo);
      state.viewerStale = true;
      return;
    }
    if (act === 'use') {
      const sp = P.spaces[+t.dataset.i];
      sp.use = t.value;
      sp.include = (t.value !== 'descartado' && t.value !== 'exterior');
      sp.reason = 'Definido por el usuario';
      state.viewerStale = true;
      reaudit(); return viewSpaces();
    }
    if (act === 'role') {
      const x = P.elements[+t.dataset.i];
      x.userRole = t.value; x.role = t.value;
      if (t.value === 'fachada' || t.value === 'cubierta' || t.value === 'hueco_exterior' || t.value === 'muro_sotano') { x.userExternal = true; x.decided = true; }
      if (t.value === 'particion' || t.value === 'forjado' || t.value === 'hueco_interior' || t.value === 'medianera') { x.userExternal = false; x.decided = false; }
      state.audit = HEM.cype.audit(P); refreshBadges();
      if (state.viewer) state.viewer.applyColors(state.colorMode);
      return viewElements();
    }
    if (act === 'ext') {
      const x = P.elements[+t.dataset.i];
      x.userExternal = (t.value === 'true'); x.decided = x.userExternal;
      state.audit = HEM.cype.audit(P); refreshBadges();
      if (state.viewer) state.viewer.applyColors(state.colorMode);
      return viewElements();
    }
    if (act === 'keep') {
      const x = P.elements[+t.dataset.i];
      x.keepOverride = t.checked; x.keep = t.checked;
      state.viewerStale = true;
      state.audit = HEM.cype.audit(P); refreshBadges();
      if (state.viewer) state.viewer.applyColors(state.colorMode);
      return viewElements();
    }
    if (act === 'draw-base') {
      const v = parseFloat(String(t.value).replace(',', '.'));
      state.drawBase = Number.isFinite(v) ? v : null;
      return;
    }
    if (act === 'draw-topmode') {
      state.drawTop = t.value;
      if (state.draw.in3d) renderDrawBar(); else render();
      return;
    }
    if (act === 'draw-topz') {
      const v = parseFloat(String(t.value).replace(',', '.'));
      state.drawTopZ = Number.isFinite(v) ? v : null;
      return;
    }
    if (act === 'det-on') { if (state.detected) state.detected.rooms[+t.dataset.i].take = t.checked; return; }
    if (act === 'det-name') { if (state.detected) state.detected.rooms[+t.dataset.i].name = t.value; return; }
    if (act === 'grp') { P.groupChoice.set(t.dataset.k, t.checked); state.viewerStale = true; reaudit(); return viewPurge(); }
  });

  el.input.addEventListener('change', () => { if (el.input.files[0]) loadFile(el.input.files[0]); el.input.value = ''; });

  el.reset.addEventListener('click', () => {
    resetPerModelState();
    state.rawBuffer = null;
    state.model = null; state.project = null; state.audit = null; state.result = null;
    state.fileName = ''; state.fileSize = 0;
    el.fileName.textContent = 'Ningún modelo cargado';
    el.fileInfo.textContent = 'Abre un IFC para empezar';
    el.reset.disabled = true;
    el.schema.textContent = '—'; el.score.textContent = '—'; el.score.className = 'chip';
    el.side.innerHTML = '';
    document.querySelectorAll('.mode-tab').forEach(b => { if (b.dataset.tab !== 'start') b.disabled = true; });
    go('start');
  });

  $('#btnTheme').addEventListener('click', () => {
    const r = document.documentElement;
    r.dataset.theme = r.dataset.theme === 'dark' ? 'light' : 'dark';
    try { localStorage.setItem('hefestolab-theme', r.dataset.theme); } catch (e) { /* modo privado */ }
    const cv = $('#planCanvas'); if (cv) drawPlan(cv);
  });

  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && state.draw.active) {
      if (state.draw.in3d && state.viewer) state.viewer.endDraw(false);
      exitDrawMode(); render();
    }
    if (e.key === 'Enter' && state.draw.active && state.draw.pts.length >= 3) closeDrawing();
  });

  window.addEventListener('dragover', e => e.preventDefault());
  window.addEventListener('drop', e => {
    e.preventDefault();
    const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
    if (f && /\.ifc$/i.test(f.name)) loadFile(f);
  });

  /* ====================================================================
   * Informe HTML
   * ================================================================== */

  function htmlReport() {
    const R = state.result, P = state.project;
    const rep = R.report;
    const row = (c) => `<tr class="${c.level}"><td>${LEVEL_LABEL[c.level]}</td><td>${esc(c.title)}</td><td>${esc(c.value)}</td><td>${esc(c.rule || '')}</td></tr>`;
    return `<!doctype html><html lang="es"><head><meta charset="utf-8">
<title>Informe IFC Energy Model · ${esc(state.fileName)}</title>
<style>
body{font-family:system-ui,Segoe UI,Arial,sans-serif;color:#1e293b;max-width:1000px;margin:36px auto;padding:0 20px;line-height:1.6}
h1{font-size:23px;letter-spacing:-.02em;margin:0 0 4px}h2{font-size:15px;margin:30px 0 10px;border-bottom:1px solid #e2e8f0;padding-bottom:6px}
.sub{color:#64748b;font-size:13px;margin:0 0 22px}
table{width:100%;border-collapse:collapse;font-size:12px;margin-bottom:14px}
th{background:#f1f5f9;text-align:left;padding:7px 9px;font-size:10px;letter-spacing:.06em;text-transform:uppercase;color:#475569}
td{padding:6px 9px;border-bottom:1px solid #eef2f7;vertical-align:top}
tr.error td:first-child{color:#b91c1c;font-weight:700}tr.warn td:first-child{color:#b45309;font-weight:700}tr.ok td:first-child{color:#118d68;font-weight:700}
.stats{display:flex;gap:10px;flex-wrap:wrap;margin-bottom:18px}
.stat{border:1px solid #e2e8f0;border-radius:9px;padding:10px 14px;min-width:130px}
.stat b{display:block;font-size:19px}.stat small{color:#64748b;font-size:10px;text-transform:uppercase;letter-spacing:.05em}
ul{font-size:12px;color:#475569}
footer{margin-top:34px;padding-top:14px;border-top:1px solid #e2e8f0;color:#94a3b8;font-size:11px}
</style></head><body>
<h1>Preparación del IFC para el modelo analítico</h1>
<p class="sub">${esc(state.fileName)} · esquema ${esc(state.model.schema)} · generado el ${new Date().toLocaleString('es-ES')}</p>
<div class="stats">
  <div class="stat"><b>${fmtBytes(state.fileSize)} → ${fmtBytes(R.bytes)}</b><small>Tamaño</small></div>
  <div class="stat"><b>${n0(state.model.count)} → ${n0(R.entities)}</b><small>Entidades</small></div>
  <div class="stat"><b>${state.audit.score.pct}% → ${R.score.pct}%</b><small>Conformidad</small></div>
  <div class="stat"><b>${n0(R.dangling)}</b><small>Referencias rotas</small></div>
</div>
<h2>Correcciones aplicadas</h2>
<ul>${R.log.map(l => `<li>${esc(l.text)}</li>`).join('')}</ul>
<h2>Auditoría del archivo generado</h2>
<table><thead><tr><th style="width:90px">Estado</th><th>Comprobación</th><th style="width:170px">Valor</th><th>Requisito CYPE</th></tr></thead>
<tbody>${R.checks.map(row).join('')}</tbody></table>
<h2>Espacios exportados</h2>
<table><thead><tr><th>Espacio</th><th>Uso</th><th style="width:90px">Superficie m²</th><th style="width:80px">Altura m</th><th style="width:90px">Volumen m³</th></tr></thead>
<tbody>${rep.espacios.filter(s => s.incluido).map(s => `<tr><td>${esc(s.nombre)}</td><td>${esc(s.uso)}</td><td>${n2(s.superficie_m2)}</td><td>${n2(s.altura_m)}</td><td>${n2(s.volumen_m3)}</td></tr>`).join('')}</tbody></table>
<h2>Cerramientos de la envolvente</h2>
<table><thead><tr><th style="width:90px">Entidad</th><th>Tipo</th><th style="width:130px">Función</th><th style="width:80px">Adyacencia</th><th style="width:70px">e (m)</th></tr></thead>
<tbody>${rep.cerramientos.map(c => `<tr><td>${esc(String(c.entidad).replace('IFC', ''))}</td><td>${esc(c.tipo)}</td><td>${esc(ROLE_LABEL[c.funcion] || c.funcion || '')}</td><td>${c.exterior ? 'Exterior' : 'Interior'}</td><td>${c.espesor_m != null ? n2(c.espesor_m, 3) : '—'}</td></tr>`).join('')}</tbody></table>
<h2>Elementos retirados</h2>
<table><thead><tr><th>Grupo</th><th style="width:110px">Entidad</th><th style="width:70px">Uds.</th><th style="width:260px">Criterio</th></tr></thead>
<tbody>${rep.purgados.map(p => `<tr><td>${esc(p.grupo)}</td><td>${esc(String(p.entidad).replace('IFC', ''))}</td><td>${n0(p.unidades)}</td><td>${esc(p.motivo || '')}</td></tr>`).join('')}</tbody></table>
<footer>Generado con HEFESTOLAB IFC Energy Model v1.9.0 · hefestolab.github.io · Destino: Open BIM Analytical Model → CYPETHERM HE Plus (CTE 2019). Los criterios de auditoría reproducen los requisitos publicados por CYPE para el generador del modelo analítico.</footer>
</body></html>`;
  }

  /* ====================================================================
   * Arranque
   * ================================================================== */

  go('start');
  status('Preparado');
  if (location.protocol === 'file:') {
    toast('Abierta desde el disco', 'La herramienta funciona igualmente: todo el proceso es local y no necesita servidor.');
  }
})();
