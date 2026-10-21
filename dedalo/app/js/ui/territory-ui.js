/* Territorio España: selección, datos reales, revisión e importación atómica. */
(function (root) {
  'use strict';
  const D = root.DEDALO, el = (tag, text, cls) => { const n = document.createElement(tag); if (text) n.textContent = text; if (cls) n.className = cls; return n; };
  function center(value) { const a = String(value).trim().split(/\s*[;,]\s*|\s+/).map(Number); if (a.length !== 2 || !a.every(Number.isFinite)) throw new Error('Introduce longitud, latitud en grados decimales.'); D.TerritoryData.bboxAround(a[0], a[1], 50); return a; }
  function safeSourceLink(value) { try { const u = new URL(value); return u.protocol === 'https:' && !u.username && !u.password ? u.href : null; } catch (_) { return null; } }
  function paint() {
    return new Promise(resolve => {
      let done = false, timer;
      const finish = () => { if (done) return; done = true; clearTimeout(timer); resolve(); };
      timer = setTimeout(finish, typeof root.requestAnimationFrame === 'function' ? 120 : 0);
      if (typeof root.requestAnimationFrame === 'function') root.requestAnimationFrame(() => root.requestAnimationFrame(finish));
    });
  }
  async function connectorRequest(base, descriptor, signal) {
    const controller = new AbortController(), relay = () => controller.abort();
    if (signal) { if (signal.aborted) relay(); else signal.addEventListener('abort', relay, { once: true }); }
    const timer = setTimeout(relay, 75000);
    try {
      const r = await root.fetch(base + '/v1/geodata', { method: 'POST', mode: 'cors', credentials: 'omit', cache: 'no-store', redirect: 'error', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(descriptor), signal: controller.signal });
      if (r.status === 404) throw Object.assign(new Error('Conector territorial antiguo.'), { code: 'CONNECTOR_MISSING' });
      if (+(r.headers.get('content-length') || 0) > 32 * 1024 * 1024) throw new Error('Respuesta GIS demasiado grande. Reduce la zona.');
      const text = await r.text(); if (text.length > 32 * 1024 * 1024) throw new Error('Respuesta GIS demasiado grande.'); const json = JSON.parse(text);
      if (!r.ok || !json.ok) throw Object.assign(new Error(json.error && json.error.message || json.error || 'El conector no pudo consultar la capa.'), { code: json.error && json.error.code || 'CONNECTOR' });
      return json;
    } catch (e) {
      if (signal && signal.aborted) throw Object.assign(new Error('Consulta cancelada.'), { code: 'ABORTED' });
      if (controller.signal.aborted) throw Object.assign(new Error('El conector tardó demasiado. Reduce el recorte o vuelve a iniciarlo.'), { code: 'CONNECTOR_TIMEOUT' });
      throw e;
    } finally { clearTimeout(timer); if (signal) signal.removeEventListener('abort', relay); }
  }
  async function transport(options) {
    const port = Number(options.port || 43127); if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('Puerto local inválido.');
    const base = 'http://127.0.0.1:' + port, controller = new AbortController(), relay = () => controller.abort(), timer = setTimeout(relay, 1800);
    if (options.signal) { if (options.signal.aborted) relay(); else options.signal.addEventListener('abort', relay, { once: true }); }
    let local = false;
    try { const r = await root.fetch(base + '/health', { signal: controller.signal, mode: 'cors', credentials: 'omit', cache: 'no-store', redirect: 'error' }); const j = await r.json(); local = r.ok && j.service === 'dedalo-local-mcp' && j.territory === true; }
    catch (_) { /* public HTTPS remains available when no connector is running */ }
    finally { clearTimeout(timer); if (options.signal) options.signal.removeEventListener('abort', relay); }
    if (options.signal && options.signal.aborted) throw new Error('Consulta cancelada.');
    if (!local) return { request: undefined, label: 'Acceso directo a servicios públicos' };
    let connected = true;
    return { label: 'Datos públicos · conector local y recuperación directa', request: async (descriptor, call) => {
      const signal = call && call.signal || options.signal;
      if (!connected) return D.TerritoryData.requestPublic(descriptor, { signal });
      // A stopped AI host may take its stdio connector with it between two layers.
      // Recover only a lost transport, never repeat a rejected provider query.
      try { return await connectorRequest(base, descriptor, signal); }
      catch (e) {
        if (signal && signal.aborted || e.name === 'AbortError' || e.code === 'ABORTED') throw e;
        if (!(e instanceof TypeError) && e.code !== 'CONNECTOR_MISSING') throw e;
        connected = false; return D.TerritoryData.requestPublic(descriptor, { signal });
      }
    } };
  }
  D.TerritoryUI = { center, transport, safeSourceLink, paint };
  D.UI.prototype.panel_territory = function (body, full) {
    if (!full && body.dataset.built) return;
    const s = this.territoryState || (this.territoryState = { center: [-3.697860263562573, 42.34409324124441], side: 600, label: 'Plaza España · Burgos', layers: { parcels: true, buildings: true, terrain: true, trees: true, context: true }, floorHeight: 3, treeHeight: 6 });
    if (s.map && s.map.destroy) s.map.destroy();
    s.currentBody = body;
    body.dataset.built = '1'; body.replaceChildren(); body.classList.add('territory-ui');
    const app = this.app, button = (text, fn, primary) => { const n = el('button', text, primary ? 'primary' : ''); n.type = 'button'; n.addEventListener('click', fn); return n; };
    const status = el('p', s.message || 'Elige un lugar y el tamaño del entorno.', 'wizard-status'); status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite');
    s.status = status;
    const progress = text => { s.message = text; if (s.status && s.status.isConnected) s.status.textContent = text; if (s.noticeLabel) s.noticeLabel.textContent = text; };
    const notice = (text, blocking) => {
      if (!s.notice) {
        s.notice = el('div', null, 'territory-working'); s.notice.setAttribute('role', 'status'); s.notice.setAttribute('aria-live', 'polite'); s.notice.setAttribute('aria-atomic', 'true');
        const card = el('div', null, 'territory-working-card'), spinner = el('span', null, 'territory-spinner'); spinner.setAttribute('aria-hidden', 'true'); s.noticeLabel = el('span', text); card.append(spinner, s.noticeLabel); s.notice.append(card);
      }
      s.notice.className = 'territory-working' + (blocking ? ' territory-working-blocking' : '');
      const target = document.body || s.currentBody; if (s.notice.parentElement !== target) target.append(s.notice);
      progress(text);
    };
    const hideNotice = () => { if (s.notice) s.notice.remove(); s.notice = null; s.noticeLabel = null; };
    const renderCurrent = () => { if (this.panel === 'territory' && s.currentBody && s.currentBody.isConnected) this.panel_territory(s.currentBody, true); };
    body.append(el('p', 'De un lugar a tu entorno 3D', 'ent-title'), el('p', 'Parcelas y edificios de Catastro, relieve de IGN y arbolado cartografiado de OpenStreetMap. Un entorno editable con fuentes conservadas.'));
    const controls = el('fieldset'); controls.className = 'territory-controls'; controls.disabled = !!s.loading;
    const query = el('input'); query.type = 'search'; query.className = 'wide'; query.placeholder = 'Dirección, municipio o referencia catastral'; query.value = s.query || 'Plaza España, Burgos'; query.setAttribute('aria-label', 'Buscar lugar');
    const candidates = el('div', null, 'candidate-list');
    const port = () => this.aiWizard && this.aiWizard.port || (new URLSearchParams(root.location.search).has('conector') && root.location.hostname === '127.0.0.1' && root.location.port) || 43127;
    const run = async fn => {
      if (s.loading) return; const abort = new AbortController(); s.loading = true; s.phase = 'network'; s.abort = abort; s.generation = (s.generation || 0) + 1; controls.disabled = true; cancel.disabled = false; mapBox.style.pointerEvents = 'none';
      notice('Conectando con los servicios de datos…', false); if (s.map && s.map.setBusy) s.map.setBusy(true);
      try { const net = await transport({ port: port(), signal: abort.signal }); s.transport = net.label; await fn(net.request, abort.signal); }
      catch (e) { progress(e.name === 'AbortError' || abort.signal.aborted ? 'Consulta cancelada; el modelo se conserva.' : e.message); }
      finally {
        if (s.abort === abort) {
          if (abort.signal.aborted) progress('Consulta cancelada; el modelo se conserva.');
          s.loading = false; s.phase = null; s.abort = null; controls.disabled = false; cancel.disabled = true; mapBox.style.pointerEvents = ''; hideNotice();
          renderCurrent();
        }
      }
    };
    const cpu = async (message, fn) => {
      if (s.loading || app.territoryBusy) { progress('Espera a que termine la operación actual.'); return; }
      const doc = app.doc, projectId = doc.projectId, version = doc.projectVersion, revision = app.mcpBridge.revision;
      const container = app.el && app.el.app, previousInert = container && container.inert, focus = document.activeElement;
      s.loading = true; s.phase = 'cpu'; app.territoryBusy = true; controls.disabled = true; cancel.disabled = true; mapBox.style.pointerEvents = 'none';
      if (s.map && s.map.setBusy) s.map.setBusy(true); notice(message, true);
      if (container) { container.inert = true; container.setAttribute('aria-busy', 'true'); }
      try {
        await D.TerritoryUI.paint();
        if (app.doc !== doc || doc.projectId !== projectId || doc.projectVersion !== version || app.mcpBridge.revision !== revision) throw new Error('El modelo ha cambiado. Revisa la operación y vuelve a pulsar el botón.');
        await fn();
      } catch (e) { progress(e.message); }
      finally {
        app.territoryBusy = false; s.loading = false; s.phase = null; controls.disabled = false; mapBox.style.pointerEvents = ''; hideNotice();
        if (container) { container.inert = previousInert; container.setAttribute('aria-busy', 'false'); }
        renderCurrent();
        if (focus && focus.isConnected && !focus.disabled && focus.focus) { try { focus.focus({ preventScroll: true }); } catch (_) {} }
      }
    };
    const coordinate = el('input'); coordinate.className = 'wide'; coordinate.value = s.center.map(n => n.toFixed(7)).join(', '); const coordLabel = el('label', 'Centro · longitud, latitud', 'field'); coordLabel.append(coordinate);
    const selectionKey = () => s.center.map(n => n.toFixed(7)).join(',') + ':' + s.side;
    const invalidateDataPreview = () => { if (s.data && s.dataSelection && s.dataSelection !== selectionKey()) { s.data = null; s.dataSelection = null; showData(); progress('Recorte actualizado. Consulta los datos de la nueva selección.'); } };
    const areaText = () => s.label + ' · ' + s.side + ' × ' + s.side + ' m · ' + (s.side ** 2 / 1000000).toFixed(2) + ' km²';
    const selectCenter = (p, label) => { s.center = p; s.label = label || 'Selección del mapa'; coordinate.value = p.map(n => n.toFixed(7)).join(', '); if (s.map) s.map.set(p, s.side); area.textContent = areaText(); invalidateDataPreview(); };
    controls.append(query, button('Buscar lugar', () => { s.query = query.value; void run(async (request, signal) => {
      progress('Buscando direcciones…'); const found = await D.TerritoryData.resolveLocation({ query: query.value, request, signal }); if (signal.aborted) return; s.candidates = found.candidates; showCandidates();
      progress(found.candidates.length ? 'Elige la dirección que corresponde.' : found.warnings.join(' '));
    }); }), candidates);
    const showCandidates = () => { candidates.replaceChildren(); for (const c of s.candidates || []) candidates.append(button(c.label, () => { void run(async (nextRequest, nextSignal) => { const value = await D.TerritoryData.resolveCandidate({ candidate: c, request: nextRequest, signal: nextSignal }); if (nextSignal.aborted) return; selectCenter([value.lon, value.lat], value.label); s.candidates = []; showCandidates(); progress('Ubicación seleccionada. Comprueba el recorte del mapa.'); }); })); };
    const mapBox = el('div'); mapBox.style.pointerEvents = s.loading ? 'none' : ''; controls.append(mapBox, el('p', 'Mapa en planta: arrastra para desplazar o pulsa para centrar. + y − acercan el mapa; cambia los metros para ampliar el recorte.', 'muted'));
    const area = el('p', areaText(), 'territory-area');
    const side = el('input'); side.type = 'number'; side.min = '50'; side.max = '1000'; side.step = '1'; side.value = String(s.side); side.className = 'wide'; const sideLabel = el('label', 'Lado del recorte en metros · máximo 1 km²', 'field'); sideLabel.append(side);
    const slider = el('input'); slider.type = 'range'; slider.min = '50'; slider.max = '1000'; slider.step = '1'; slider.value = String(s.side); slider.className = 'territory-size'; slider.setAttribute('aria-label', 'Cambiar el lado del recorte en metros');
    const previewSide = (value, commit) => {
      if (s.loading) return; const length = Number(value);
      if (!Number.isFinite(length) || length < 50 || length > 1000) { side.setAttribute('aria-invalid', 'true'); if (commit) { side.value = String(s.side); progress('El lado debe estar entre 50 y 1000 metros.'); } return; }
      try { D.TerritoryData.bboxAround(...s.center, length); s.side = length; side.value = String(length); slider.value = String(length); side.setAttribute('aria-invalid', 'false'); selectCenter(s.center, s.label); }
      catch (e) { if (commit) progress(e.message); }
    };
    side.addEventListener('input', () => previewSide(side.value, false)); side.addEventListener('change', () => previewSide(side.value, true)); slider.addEventListener('input', () => previewSide(slider.value, true)); sideLabel.append(slider);
    controls.append(area, sideLabel, coordLabel, button('Aplicar coordenadas y tamaño', () => { try { const p = center(coordinate.value), length = Number(side.value); if (!Number.isFinite(length) || length < 50 || length > 1000) throw new Error('El lado debe estar entre 50 y 1000 metros.'); D.TerritoryData.bboxAround(...p, length); s.side = length; selectCenter(p, 'Selección por coordenadas'); progress('Recorte actualizado.'); } catch (e) { progress(e.message); } }));
    controls.append(el('h3', 'Capas del entorno'));
    for (const [key, text] of [['parcels', 'Parcelas'], ['buildings', 'Edificios'], ['terrain', 'Relieve del terreno'], ['trees', 'Árboles registrados'], ['context', 'Calles, agua y zonas verdes']]) {
      const check = el('input'); check.type = 'checkbox'; check.checked = s.layers[key]; const label = el('label', null, 'check'); label.append(check, document.createTextNode(text)); check.addEventListener('change', () => { s.layers[key] = check.checked; }); controls.append(label);
    }
    const advanced = el('details'); advanced.append(el('summary', 'Alturas y representación'));
    for (const [key, title, min, max] of [['floorHeight', 'Altura estimada por planta (m)', 2, 10], ['treeHeight', 'Altura simbólica de árboles sin dato (m)', 1, 40]]) {
      const input = el('input'); input.type = 'number'; input.min = min; input.max = max; input.step = '0.1'; input.value = s[key]; input.className = 'wide'; const label = el('label', title, 'field'); label.append(input); input.addEventListener('change', () => { const value = Number(input.value); if (value >= min && value <= max) s[key] = value; else { input.value = s[key]; progress('Usa una altura dentro del intervalo indicado.'); } }); advanced.append(label);
    }
    advanced.append(el('p', 'Las alturas por plantas son estimaciones editables. Sin altura ni plantas, se conserva la huella. Los árboles son símbolos en posiciones registradas; su cobertura puede ser incompleta.', 'muted')); controls.append(advanced);
    const review = el('div', null, 'territory-review');
    const showData = () => {
      review.replaceChildren(); if (!s.data) return; const data = s.data;
      review.append(el('h3', data.partial ? 'Datos preparados · resultado parcial' : 'Datos preparados'), el('p', data.parcels.length + ' parcelas · ' + data.buildingParts.length + ' partes de edificios · ' + data.trees.length + ' árboles · terreno ' + (data.terrain ? 'disponible' : 'sin datos')));
      if (data.partial) review.append(el('p', 'Alguna capa no llegó completa. Revisa los avisos antes de crear el entorno.', 'wizard-note'));
      if (data.layerErrors && data.layerErrors.length) review.append(el('p', 'Capas no disponibles: ' + data.layerErrors.map(item => ({ parcels: 'parcelas', buildings: 'edificios', terrain: 'relieve', trees: 'árboles', context: 'calles y zonas verdes' }[item.layer] || item.layer)).join(', ') + '. Puedes crear el entorno con las capas que sí llegaron.', 'wizard-note'));
      const details = el('details'); details.append(el('summary', 'Fuentes y avisos (' + data.warnings.length + ')'));
      const list = el('ul'); for (const warning of data.warnings) list.append(el('li', warning)); details.append(list);
      for (const source of data.sources) { const href = safeSourceLink(source.licenseURL), a = el(href ? 'a' : 'span', source.title + ' · ' + source.attribution); if (href) { a.href = href; a.target = '_blank'; a.rel = 'noopener'; } details.append(a, el('br')); } review.append(details);
      const imported = () => s.importedData === data && s.importedProjectId === app.doc.projectId && (!s.result || !s.result.node || typeof app.doc.scene.node !== 'function' || !!app.doc.scene.node([], s.result.node));
      const create = button(imported() ? 'Entorno ya creado en este modelo' : 'Crear entorno 3D en este modelo', async () => {
        try {
          if (s.loading) throw new Error('Espera o cancela la consulta antes de crear el entorno.');
          if (s.data !== data) throw new Error('La selección ha cambiado. Consulta los datos del recorte actual.');
          if (imported()) throw new Error('Este entorno ya está creado en el modelo.');
          if (s.projectId !== app.doc.projectId) throw new Error('Has abierto otro proyecto. Vuelve a consultar la zona antes de importar.');
          if (app.mcpBridge.state().busy || app.doc.editPath.length) throw new Error('Termina la herramienta activa y sal del grupo antes de importar.');
          const options = { floorHeight: s.floorHeight, treeHeight: s.treeHeight };
          await cpu('Creando el entorno 3D… Preparando edificios, terreno y árboles. Puede tardar unos segundos.', () => {
            if (app.doc.editPath.length || app.doc._busy || app.navDrag || app.tool && app.tool.state !== 0) throw new Error('Termina la herramienta activa y sal del grupo antes de importar.');
            const result = app.exec('geo.import', { data, options }, true);
            if (!result || result.ok === false) throw new Error(result && result.error || 'No se pudo crear el entorno.');
            app.doc.clearSelection(); Object.assign(app.renderer.style, { bgTop: '#f8f9fa', bgBottom: '#f8f9fa', edge: '#92938d', edgeSoft: '#c7c9c4', back: '#d8d9d5' });
            app.renderer.opts.showAxes = false; app.setView('iso'); app.renderNow(); progress('Entorno creado. Puedes editar sus grupos, guardar .dedalo o exportar IFC.');
            s.result = result; s.importedData = data; s.importedProjectId = app.doc.projectId;
          });
        } catch (e) { progress(e.message); }
      }, true); create.disabled = !!s.loading || imported();
      review.append(create, button('Guardar datos GIS (JSON)', async () => { if (s.loading) { progress('Espera o cancela la consulta antes de guardar datos.'); return; } await cpu('Preparando los datos GIS para descargar…', () => app.files.download('territorio-datos.json', JSON.stringify(data), 'application/json')); }));
    };
    const exports = el('div');
    const showExports = () => {
      exports.replaceChildren(); const info = app.doc.execute('geo.info'); if (!info.georeference) return;
      const ready = () => { if (s.loading) throw new Error('Espera o cancela la consulta antes de exportar.'); };
      exports.append(el('h3', 'Guardar y llevar a HEFESTO'), button('Guardar modelo .dedalo', () => { try { ready(); app.files.save(); } catch (e) { progress(e.message); } }), button('Exportar IFC4', async () => { try { ready(); await cpu('Preparando el archivo IFC4…', () => { app.files.download(app.files.safeName() + '.ifc', D.TerritoryExport.ifc(app.doc), 'application/x-step'); progress('IFC4 exportado con geometría, fuentes y georreferencia.'); }); } catch (e) { progress(e.message); } }), button('Exportar paquete JSON', async () => { try { ready(); await cpu('Preparando el paquete JSON…', () => app.files.download(app.files.safeName() + '-territorio.json', JSON.stringify(D.TerritoryExport.jsonPackage(app.doc)), 'application/json')); } catch (e) { progress(e.message); } }), el('p', 'El IFC contiene volúmenes de contexto y elementos geográficos. Impórtalo como IFC en HEFESTO. La aceptación en la versión concreta de HEFESTO está pendiente de probar.', 'muted'));
    };
    controls.append(button('Consultar datos del recorte', () => { void run(async (request, signal) => {
      const p = center(coordinate.value), length = Number(side.value); if (!Number.isFinite(length) || length < 50 || length > 1000) throw new Error('Usa un lado entre 50 y 1000 m.'); s.side = length; selectCenter(p, s.label);
      const bbox = D.TerritoryData.bboxAround(...p, length), id = app.doc.projectId;
      const data = await D.TerritoryData.loadArea({ bbox, layers: { ...s.layers }, request, signal, onProgress: value => progress('Consultando ' + ({ parcels: 'parcelas', buildings: 'edificios', terrain: 'relieve', trees: 'árboles', context: 'calles y zonas verdes' }[value.layer]) + ' · ' + (value.index + 1) + '/' + value.total + '…') });
      if (signal.aborted) return; s.data = data; s.dataSelection = selectionKey(); s.projectId = id; showData(); progress('Consulta terminada. ' + s.transport + '. Revisa el resultado y crea el entorno.');
    }); }, true));
    const cancel = button('Cancelar consulta', () => { if (s.phase === 'network' && s.abort) s.abort.abort(); }); cancel.disabled = !s.loading || s.phase !== 'network';
    body.append(controls, status, cancel, review, exports);
    const fallback = el('details'); fallback.append(el('summary', 'Si los datos no llegan · conector y archivo local'), el('p', 'Algunos servicios públicos bloquean consultas directas del navegador. Descarga el conector ZIP y ejecuta INICIAR_TERRITORIO.cmd con Node.js 22+. No requiere una IA ni claves. Después vuelve a consultar desde Dédalo.'));
    const zip = el('a', 'Descargar conector local'); zip.href = 'downloads/DEDALO_MCP_LOCAL_v0.6.0.zip'; zip.download = ''; if (!new URLSearchParams(root.location.search).has('conector')) fallback.append(zip);
    const localPort = Number(port()), local = el('a', 'Abrir Dédalo desde el conector iniciado'); local.href = 'http://127.0.0.1:' + (Number.isInteger(localPort) && localPort >= 1024 && localPort <= 65535 ? localPort : 43127) + '/dedalo/?seguro&conector=1'; local.target = '_blank'; local.rel = 'noopener';
    fallback.append(el('p', 'Una vez iniciado, abre su copia local. Guarda antes los cambios de esta pestaña.'), local);
    fallback.append(button('Abrir guía Unir IA', () => this.openPanel('ai')));
    const input = el('input'); input.type = 'file'; input.disabled = !!s.loading; input.accept = '.json,application/json'; input.setAttribute('aria-label', 'Importar datos GIS de Dédalo'); input.addEventListener('change', async () => {
      try {
        if (s.loading) throw new Error('Espera o cancela la consulta antes de cargar un archivo.');
        const file = input.files[0]; if (!file) return; if (file.size > 32 * 1024 * 1024) throw new Error('Archivo GIS demasiado grande.');
        const id = app.doc.projectId, generation = s.generation || 0, data = JSON.parse(await file.text());
        if (s.loading || generation !== (s.generation || 0)) throw new Error('Ha empezado otra consulta. Vuelve a seleccionar el archivo después.');
        if (id !== app.doc.projectId) throw new Error('Has abierto otro proyecto. Vuelve a seleccionar el archivo.');
        if (data.format !== 'dedalo.territory-data' || data.version !== 1) throw new Error('Selecciona un JSON de datos GIS exportado desde Territorio.');
        await cpu('Comprobando los datos GIS del archivo…', () => { D.Territory.prepare(data, { floorHeight: s.floorHeight, treeHeight: s.treeHeight }, app.doc.scene.georeference); s.data = data; s.dataSelection = null; s.projectId = id; progress('Datos GIS cargados del archivo. Revisa y crea el entorno.'); });
      } catch (e) { progress(e.message); }
    }); fallback.append(input); body.append(fallback, el('p', 'Cobertura DGC: España salvo Navarra y País Vasco. Los servicios públicos pueden limitar consultas; máximo 1 km² por recorte. No se descargan datos de titulares.', 'muted'));
    s.map = new D.TerritoryMap(mapBox, { center: s.center, side: s.side, onChange: p => { s.center = p; s.label = 'Selección del mapa'; coordinate.value = p.map(n => n.toFixed(7)).join(', '); area.textContent = areaText(); invalidateDataPreview(); } });
    if (s.map.setBusy) s.map.setBusy(!!s.loading);
    showCandidates(); showData(); showExports();
  };
})(typeof window !== 'undefined' ? window : globalThis);
