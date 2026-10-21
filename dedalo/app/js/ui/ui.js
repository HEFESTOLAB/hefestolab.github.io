/*
 * Dédalo — interfaz: barra de herramientas, paneles laterales, menú, barra de estado,
 * menú contextual, avisos y cuadro de texto en el visor.
 */
(function (root) {
  'use strict';
  const D = root.DEDALO;
  const { V, units } = D;
  const { fmtLen, fmtArea, fmtVol, fmtNum } = units;
  const I = D.ICONS;

  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const h = (tag, attrs, html) => {
    const el = document.createElement(tag);
    for (const k in attrs || {}) {
      if (k === 'class') el.className = attrs[k];
      else if (k.startsWith('on')) el.addEventListener(k.slice(2), attrs[k]);
      else el.setAttribute(k, attrs[k]);
    }
    if (html !== undefined) el.innerHTML = html;
    return el;
  };

  const PALETTE = [
    ['Por defecto', null], ['Blanco roto', '#f2efe8'], ['Yeso', '#e6e0d4'], ['Hormigón', '#b9b5ad'], ['Hormigón oscuro', '#8e8b85'],
    ['Ladrillo', '#b5583a'], ['Terracota', '#c8693f'], ['Piedra', '#c9bfae'], ['Pizarra', '#4a525a'], ['Madera clara', '#d8b47a'],
    ['Madera', '#a8743f'], ['Madera oscura', '#6b4426'], ['Acero', '#9aa3ad'], ['Acero corten', '#8f4a26'], ['Aluminio', '#c9ced3'],
    ['Vidrio', '#9cc7dd', 0.35], ['Agua', '#4f93c4', 0.6], ['Césped', '#6f9a45'], ['Arena', '#e2cf9c'], ['Asfalto', '#3c3e41'],
    ['Negro', '#1f2022'], ['Rojo', '#c0392b'], ['Naranja', '#e67e22'], ['Amarillo', '#e8c547'], ['Verde', '#3f8f5a'],
    ['Turquesa', '#2a9d8f'], ['Azul', '#2f6db3'], ['Añil', '#3b3f8f'], ['Morado', '#7d4ea0'], ['Rosa', '#d98ba5']
  ];

  const PANELS = [
    ['ai', 'Unir IA', 'connect'],
    ['territory', 'Territorio · España', 'views'],
    ['hierarchy', 'Jerarquía: grupos y componentes', 'hierarchy'],
    ['organic', 'Formas libres', 'materials'],
    ['info', 'Información de la entidad', 'info'],
    ['materials', 'Materiales', 'materials'],
    ['styles', 'Estilos', 'styles'],
    ['section', 'Caja de sección · tiradores 3D', 'section'],
    ['bim', 'Categorías y exportación IFC', 'ifc'],
    ['views', 'Vistas', 'views'],
    ['model', 'Información del modelo', 'model'],
    ['console', 'Consola de comandos', 'console'],
    ['keys', 'Atajos de teclado', 'keys']
  ];

  class UI {
    constructor(app) {
      this.app = app;
      this.el = app.el;
      this.panel = null;
      this.buildTopbar();
      this.buildToolbar();
      this.buildRail();
      this.buildMenu();
      this.buildStatus();
      document.addEventListener('pointerdown', (e) => {
        if (!e.target.closest('.menu') && !e.target.closest('#menu-btn')) this.hideMenus();
      });
    }

    /* ---------------- barra superior ---------------- */

    buildTopbar() {
      const t = this.el.topbar;
      t.innerHTML = '';
      t.append(
        h('button', { id: 'menu-btn', class: 'icon-btn', title: 'Menú', onclick: (e) => { e.stopPropagation(); this.toggleMenu(); } }, I.menu),
        h('div', { class: 'brand' }, I.logo + '<span>Dédalo</span>')
      );
      const name = h('input', { id: 'doc-name', spellcheck: 'false', title: 'Nombre del modelo' });
      name.value = this.app.doc.name;
      name.addEventListener('change', () => { this.app.exec('project.rename', { name: name.value.trim() || 'Sin título' }); this.refreshTitle(); });
      name.addEventListener('keydown', (e) => { if (e.key === 'Enter') name.blur(); e.stopPropagation(); });
      this.nameInput = name;
      this.saveState = h('span', { id: 'save-state' }, '');
      t.append(name, this.saveState, h('span', { class: 'sep' }));
      this.undoBtn = h('button', { class: 'icon-btn', title: 'Deshacer (Ctrl+Z)', onclick: () => this.app.undo() }, I.undo);
      this.redoBtn = h('button', { class: 'icon-btn', title: 'Rehacer (Ctrl+Y)', onclick: () => this.app.redo() }, I.redo);
      this.contextEl = h('div', { class: 'viewbtns', 'aria-label': 'Contexto de edición', style: 'max-width:35%;overflow:auto;flex-shrink:1' });
      t.append(this.undoBtn, this.redoBtn, this.contextEl, h('span', { class: 'spacer' }));
      const views = h('div', { class: 'viewbtns' });
      for (const [id, label, tip] of [['iso', 'Iso', 'Vista isométrica'], ['top', 'Planta', 'Vista superior'], ['front', 'Alzado', 'Vista frontal'], ['right', 'Lateral', 'Vista derecha']]) {
        views.append(h('button', { class: 'chip', title: tip, onclick: () => this.app.setView(id) }, label));
      }
      views.append(h('button', { class: 'icon-btn', title: 'Ver todo (Mayús+Z)', onclick: () => this.app.zoomExtents() }, I.extents));
      t.append(views);
      this.mcpButton = h('button', { class: 'chip', title: 'Unir tu IA paso a paso', onclick: () => { if (this.panel !== 'ai') this.openPanel('ai'); } }, 'Unir IA');
      t.append(h('button', { class: 'chip', title: 'Crear un entorno desde datos de España', onclick: () => { if (this.panel !== 'territory') this.openPanel('territory'); } }, 'Territorio'));
      t.append(h('button', { class:'chip', title:'Recortar la vista con seis planos', onclick:() => { if(this.panel !== 'section') this.openPanel('section'); } }, I.section + '<span>Sección</span>'));
      t.append(h('button', { class:'primary', title:'Clasificar elementos y exportar a IFC', onclick:() => { if(this.panel !== 'bim') this.openPanel('bim'); } }, I.ifc + '<span>Exportar IFC</span>'));
      t.append(this.mcpButton);
      t.append(h('button', { class: 'primary', title: 'Guardar (Ctrl+S)', onclick: () => this.app.files.save() }, I.save + '<span>Guardar</span>'));
      this.refreshTitle();
    }

    refreshTitle() {
      const d = this.app.doc;
      if (document.activeElement !== this.nameInput) this.nameInput.value = d.name;
      this.saveState.textContent = d.dirty ? 'Sin guardar' : 'Guardado';
      this.saveState.classList.toggle('dirty', d.dirty);
      document.title = (d.dirty ? '• ' : '') + d.name + ' — Dédalo';
      this.undoBtn.disabled = !d.undoStack.length;
      this.redoBtn.disabled = !d.redoStack.length;
      this.undoBtn.title = d.undoStack.length ? 'Deshacer «' + d.undoStack[d.undoStack.length - 1].label + '» (Ctrl+Z)' : 'Deshacer (Ctrl+Z)';
      this.refreshContext();
    }

    refreshContext() {
      const doc = this.app.doc;
      if (!this.contextEl || !doc.scene) return;
      const path = doc.editPath || [];
      const trail = [{ name: doc.name, depth: 0 }];
      for (let depth = 1; depth <= path.length; depth++) {
        const parent = doc.scene.current(path.slice(0, depth - 1));
        const node = parent.nodes.find((n) => n.id === path[depth - 1]);
        trail.push({ name: node ? node.name : 'Sin nombre', depth });
      }
      const key = JSON.stringify(trail);
      if (this._contextKey === key) return;
      this._contextKey = key;
      this.contextEl.replaceChildren();
      for (const part of trail) {
        if (part.depth) this.contextEl.append(document.createTextNode('›'));
        const b = h('button', { class: 'chip', title: part.depth === path.length ? 'Contexto actual' : 'Volver a este contexto', onclick: () => this.exitToDepth(part.depth) });
        b.textContent = part.name;
        if (part.depth === path.length) { b.disabled = true; b.setAttribute('aria-current', 'location'); }
        this.contextEl.append(b);
      }
      this.contextEl.title = path.length ? 'Edición aislada en coordenadas locales. Esc vuelve al contexto padre.' : 'Modelo completo';
    }

    exitToDepth(depth) {
      this.app.setTool('select');
      while (this.app.doc.editPath.length > depth) {
        if (!this.app.exec('context.exit').ok) break;
      }
    }

    hierarchyState() {
      const doc = this.app.doc, ctx = doc.scene.current(doc.editPath);
      const ids = [...doc.sel.nodes];
      const nodes = ctx.nodes.filter((n) => ids.includes(n.id));
      let loose = 0;
      for (const [kind, values] of [['face', doc.sel.faces], ['edge', doc.sel.edges], ['annot', doc.sel.annots]]) {
        for (const id of values) if (!doc.nodeForHit({ [kind]: id })) loose++;
      }
      const parent = doc.editPath.length ? doc.scene.current(doc.editPath.slice(0, -1)) : null;
      const activeNode = parent && parent.nodes.find((n) => n.id === doc.editPath[doc.editPath.length - 1]);
      return { ctx, contextName: activeNode ? activeNode.name : doc.name, ids, nodes, loose, empty: !ids.length && !loose,
        one: nodes.length === 1 && !loose ? nodes[0] : null,
        canComponent: !!loose && !nodes.length || nodes.length === 1 && nodes[0].kind === 'group' && !loose };
    }

    createGroup() {
      const r = this.app.exec('group.create', { name: 'Grupo' });
      if (r.ok && this.panel !== 'hierarchy') this.openPanel('hierarchy');
    }

    createComponent() {
      const s = this.hierarchyState();
      const r = this.app.exec('component.create', { name: s.one ? s.one.name : 'Componente' });
      if (r.ok && this.panel !== 'hierarchy') this.openPanel('hierarchy');
    }

    enterNode(node) {
      this.app.setTool('select');
      const r = this.app.exec('context.enter', { node });
      if (r.ok) this.app.toast('Edición aislada en coordenadas locales. Esc vuelve al padre. Los cambios de un componente se comparten entre sus instancias.', 'info');
    }

    renameNode(node) {
      const r = this.el.viewport.getBoundingClientRect();
      this.promptText(Math.max(12, r.width / 2 - 100), 24, node.name, (name) => {
        if (name && name.trim()) this.app.exec('node.rename', { node: node.id, name: name.trim() });
      });
    }

    canInstantiate(definitionId) {
      const doc = this.app.doc, target = doc.scene.current(doc.editPath).id, seen = new Set();
      const reaches = (id) => {
        if (id === target) return true;
        if (seen.has(id)) return false;
        seen.add(id);
        const def = doc.scene.definitions.get(id);
        return !!def && def.nodes.some((node) => reaches(node.definitionId));
      };
      return !reaches(definitionId);
    }

    /* ---------------- herramientas ---------------- */

    buildToolbar() {
      const tb = this.el.toolbar;
      tb.innerHTML = '';
      let group = null;
      for (const d of D.TOOL_DEFS) {
        if (group !== null && d.group !== group) tb.append(h('div', { class: 'tsep' }));
        group = d.group;
        const b = h('button', { class: 'tool-btn', 'data-tool': d.id, 'aria-label': d.label, 'data-tip': esc(d.label) + (d.key ? '<kbd>' + d.key + '</kbd>' : ''), onclick: () => this.app.setTool(d.id) }, I[d.icon]);
        tb.append(b);
      }
      tb.append(h('div', { class: 'tsep' }));
      tb.append(h('button', { class: 'tool-btn', 'aria-label': 'Ver todo', 'data-tip': 'Ver todo<kbd>⇧Z</kbd>', onclick: () => this.app.zoomExtents() }, I.extents));
      this.bindTips();
    }
    bindTips() {
      if (this.tipEl) return;
      const tip = h('div', { id: 'tip', class: 'hidden' });
      document.body.append(tip);
      this.tipEl = tip;
      const show = (e) => {
        const b = e.target.closest('[data-tip]');
        if (!b) { tip.classList.add('hidden'); return; }
        tip.innerHTML = b.dataset.tip;
        tip.classList.remove('hidden');
        const r = b.getBoundingClientRect();
        const right = b.classList.contains('rail-btn');
        tip.style.top = (r.top + r.height / 2 - tip.offsetHeight / 2) + 'px';
        tip.style.left = (right ? r.left - tip.offsetWidth - 8 : r.right + 8) + 'px';
      };
      document.addEventListener('mouseover', show);
      document.addEventListener('pointerdown', () => tip.classList.add('hidden'));
    }
    setActiveTool(id) {
      for (const b of this.el.toolbar.querySelectorAll('.tool-btn')) b.classList.toggle('active', b.dataset.tool === id);
    }

    /* ---------------- barra de estado ---------------- */

    buildStatus() {
      const vcb = this.el.vcb;
      vcb.addEventListener('keydown', (e) => {
        e.stopPropagation();
        if (e.key === 'Enter') { const t = vcb.value; vcb.blur(); this.app.submitVCB(t); }
        else if (e.key === 'Escape') { vcb.blur(); this.app.vcbBuf = ''; }
      });
      vcb.addEventListener('focus', () => { vcb.select(); });
    }
    refreshStatus() {
      const t = this.app.tool;
      const hint = t.hint() || '';
      if (this._hint !== hint) { this._hint = hint; this.el.hint.textContent = hint; }
      const lab = t.vcbLabel();
      if (this._lab !== lab) { this._lab = lab; this.el.vcbLabel.textContent = lab; }
      this.refreshTitle();
    }

    /* ---------------- paneles ---------------- */

    buildRail() {
      const rail = this.el.rail;
      rail.innerHTML = '';
      for (const [id, label, icon] of PANELS) {
        rail.append(h('button', { class: 'rail-btn', 'data-panel': id, 'aria-label': label, 'data-tip': esc(label), onclick: () => this.openPanel(id) }, I[icon]));
      }
    }
    openPanel(id) {
      if (this.panel === id) { this.panel = null; }
      else this.panel = id;
      for (const b of this.el.rail.querySelectorAll('.rail-btn')) b.classList.toggle('active', b.dataset.panel === this.panel);
      this.el.app.classList.toggle('panel-open', !!this.panel);
      this.renderPanel(true);
      setTimeout(() => { this.app.resize(); this.app.renderNow(); }, 0);
    }
    refreshPanels() {
      if (!this.panel || this._pending) return;
      this._pending = true;
      requestAnimationFrame(() => { this._pending = false; this.renderPanel(false); });
      setTimeout(() => { if (this._pending) { this._pending = false; this.renderPanel(false); } }, 120);
    }
    renderPanel(full) {
      const p = this.el.panel;
      if (!this.panel) { p.innerHTML = ''; return; }
      const def = PANELS.find((x) => x[0] === this.panel);
      if (full || !p.querySelector('.panel-body')) {
        p.innerHTML = '';
        const head = h('div', { class: 'panel-head' }, '<span>' + esc(def[1]) + '</span>');
        head.append(h('button', { class: 'icon-btn small', title: 'Cerrar', onclick: () => this.openPanel(this.panel) }, I.close));
        p.append(head, h('div', { class: 'panel-body' }));
      }
      const body = p.querySelector('.panel-body');
      // los paneles con campos editables no se repintan mientras se escribe
      if (!full && body.contains(document.activeElement) && /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)) return;
      const fn = this['panel_' + this.panel];
      if (fn) fn.call(this, body, full);
    }

    panel_info(body) {
      const app = this.app, m = app.doc.model, sel = app.doc.sel;
      body.innerHTML = '';
      if (sel.nodes.size) {
        const s = this.hierarchyState();
        const node = s.one;
        body.append(h('div', { class: 'ent-title' }, '<span class="badge">' + (node ? node.kind === 'component' ? 'Componente' : 'Grupo' : s.nodes.length + ' objetos') + '</span>'));
        if (node) {
          const title = h('b'); title.textContent = node.name; body.append(title);
          const rows = [['Identificador', esc(node.id)]];
          if (node.kind === 'component') rows.push(['Definición compartida', esc(node.definitionId)]);
          body.append(table(rows));
          this.nodeNameField(body, node);
          if(this.ifcSelection) this.ifcSelection(body);
          body.append(h('button', { onclick: () => this.enterNode(node.id) }, 'Entrar a editar'));
        } else body.append(h('p', { class: 'muted' }, 'La selección contiene grupos o componentes completos' + (s.loose ? ' y geometría suelta' : '') + '.'));
        const acts = h('div', { class: 'btnrow' });
        acts.append(h('button', { onclick: () => app.exec('group.explode') }, 'Explotar objetos'));
        if (s.one && s.one.kind === 'component') acts.append(h('button', { onclick: () => app.exec('component.makeUnique') }, 'Hacer único'));
        acts.append(h('button', { onclick: () => { if (this.panel !== 'hierarchy') this.openPanel('hierarchy'); } }, 'Ver jerarquía'));
        body.append(acts);
        return;
      }
      const nF = sel.faces.size, nE = sel.edges.size, nA = sel.annots.size;
      if (!nF && !nE && !nA) {
        body.append(h('div', { class: 'empty' }, '<b>Nada seleccionado</b><p>Haz clic en una cara o una arista con la herramienta Seleccionar (Espacio) para ver aquí sus datos.</p>'));
        return;
      }
      const rows = [];
      if (nF === 1 && (!nE || nE === m.faceEdges(m.faces.get([...sel.faces][0])).length) && !nA) {
        const f = m.faces.get([...sel.faces][0]);
        const mat = f.mat ? m.materials.get(f.mat) : null;
        body.append(h('div', { class: 'ent-title' }, '<span class="badge">Cara</span> #' + f.id));
        rows.push(['Área', fmtArea(m.faceArea(f.id))]);
        rows.push(['Normal', f.n.map((x) => fmtNum(x, 3)).join('; ')]);
        rows.push(['Huecos', String(f.loops.length - 1)]);
        rows.push(['Material', '<span class="sw" style="background:' + (mat ? mat.color : D.STYLE.front) + '"></span>' + esc(mat ? mat.name : 'Por defecto')]);
        body.append(table(rows));
        const acts = h('div', { class: 'btnrow' });
        acts.append(h('button', { onclick: () => app.exec('faces.flip', { faces: [f.id] }) }, 'Invertir cara'));
        acts.append(h('button', { onclick: () => app.exec('select.connected') }, 'Seleccionar lo conectado'));
        body.append(acts);
        return;
      }
      if (!nF && nE && !nA) {
        let L = 0, soft = 0;
        for (const eid of sel.edges) { L += m.edgeLen(eid); if (m.edges.get(eid).soft) soft++; }
        body.append(h('div', { class: 'ent-title' }, '<span class="badge">' + (nE === 1 ? 'Arista' : nE + ' aristas') + '</span>'));
        rows.push([nE === 1 ? 'Longitud' : 'Longitud total', fmtLen(L, 3)]);
        if (nE === 1) {
          const e = m.edges.get([...sel.edges][0]);
          rows.push(['Inicio', m.P(e.a).map((x) => fmtNum(x, 3)).join('; ')]);
          rows.push(['Fin', m.P(e.b).map((x) => fmtNum(x, 3)).join('; ')]);
          rows.push(['Caras', String(m.eFaces.get(e.id).size)]);
        }
        rows.push(['Suaves', soft + ' de ' + nE]);
        body.append(table(rows));
        const acts = h('div', { class: 'btnrow' });
        acts.append(h('button', { onclick: () => app.exec('edges.soften', { soft: true }) }, 'Suavizar'));
        acts.append(h('button', { onclick: () => app.exec('edges.soften', { soft: false }) }, 'Endurecer'));
        body.append(acts);
        return;
      }
      if (nA === 1 && !nF && !nE) {
        const a = m.annots.get([...sel.annots][0]);
        const names = { guideLine: 'Guía', guidePoint: 'Punto guía', dim: 'Cota', text: 'Texto' };
        body.append(h('div', { class: 'ent-title' }, '<span class="badge">' + names[a.kind] + '</span>'));
        if (a.kind === 'text' || a.kind === 'dim') {
          const inp = h('input', { class: 'wide', value: a.text || (a.kind === 'dim' ? fmtLen(D.DimensionGeometry.measure(a)) : '') });
          inp.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') { app.exec('annot.edit', { id: a.id, text: inp.value }); inp.blur(); } });
          body.append(h('label', { class: 'field' }, 'Texto'), inp);
          if (a.kind === 'dim') {
            body.append(h('p', { class: 'muted' }, 'Medida de la cota: ' + fmtLen(D.DimensionGeometry.measure(a), 3) + '. Deja el texto vacío para mostrar la medida.'));
            body.append(h('button', { onclick: () => {
              if (doc.nodeForHit({ annot: a.id })) { app.toast('Entra en el grupo o componente para recolocar su cota.', 'info'); return; }
              app.setTool('dim'); app.tool.edit(a); app.afterInput();
            } }, 'Volver a colocar la cota'));
          }
        }
        return;
      }
      // selección mixta
      body.append(h('div', { class: 'ent-title' }, '<span class="badge">Selección</span>'));
      rows.push(['Caras', String(nF)], ['Aristas', String(nE)]);
      if (nA) rows.push(['Anotaciones', String(nA)]);
      let area = 0;
      for (const f of sel.faces) area += m.faceArea(f);
      if (nF) rows.push(['Área', fmtArea(area)]);
      const fl = [...sel.faces];
      if (nF >= 4 && m.isClosed(fl)) rows.push(['Volumen', fmtVol(Math.abs(m.volume(fl)))], ['Sólido', 'cerrado ✓']);
      const bb = m.bbox(app.doc.vertsOf(app.doc.selectionItems()));
      if (bb) rows.push(['Caja', [0, 1, 2].map((i) => fmtNum(bb.max[i] - bb.min[i], 2)).join(' × ') + ' m']);
      body.append(table(rows));
    }

    nodeNameField(body, node) {
      const row = h('div', { class: 'custom' });
      const input = h('input', { class: 'grow', 'aria-label': 'Nombre del objeto' });
      input.value = node.name;
      const rename = () => { const name = input.value.trim(); if (name) this.app.exec('node.rename', { node: node.id, name }); };
      input.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') { rename(); input.blur(); } });
      row.append(input, h('button', { onclick: rename }, 'Renombrar'));
      body.append(row);
    }

    panel_hierarchy(body) {
      const app = this.app, doc = app.doc, s = this.hierarchyState();
      body.innerHTML = '';
      const title = h('div', { class: 'sub first' });
      title.textContent = doc.editPath.length ? 'Editando: ' + s.contextName : 'Modelo: ' + doc.name;
      body.append(title);
      if (doc.editPath.length) {
        body.append(h('p', { class: 'muted' }, 'Contexto aislado · coordenadas locales. Esc vuelve al padre.' + (s.ctx.kind === 'component' ? ' Al editar esta definición se actualizan todas sus instancias.' : '')));
        body.append(h('button', { onclick: () => this.exitToDepth(doc.editPath.length - 1) }, '↑ Salir al padre'));
      } else body.append(h('p', { class: 'muted' }, 'Clic selecciona el objeto completo. Doble clic entra a editarlo. Los componentes comparten definición.'));
      const acts = h('div', { class: 'btnrow' });
      const addAction = (label, fn, disabled) => { const b = h('button', { onclick: fn }); b.textContent = label; b.disabled = !!disabled; acts.append(b); };
      addAction('Crear grupo', () => this.createGroup(), s.empty);
      addAction('Crear componente', () => this.createComponent(), !s.canComponent);
      addAction('Explotar', () => app.exec('group.explode'), !s.nodes.length);
      addAction('Hacer único', () => app.exec('component.makeUnique'), !s.one || s.one.kind !== 'component');
      addAction('Reflejar X', () => app.exec('entities.mirror', { axis: 'x', origin: [0, 0, 0] }), s.empty);
      body.append(acts);
      body.append(h('div', { class: 'sub' }, 'Objetos en este contexto (' + s.ctx.nodes.length + ')'));
      if (!s.ctx.nodes.length) body.append(h('p', { class: 'muted' }, 'Selecciona geometría y pulsa Crear grupo o Crear componente.'));
      for (const node of s.ctx.nodes) {
        const row = h('div', { class: 'btnrow', style: 'flex-wrap:nowrap;align-items:center' });
        const select = h('button', { class: doc.sel.nodes.has(node.id) ? 'on grow' : 'grow', title: 'Seleccionar · Ctrl añade · Mayús alterna', style: 'min-width:0;text-align:left;overflow:hidden;text-overflow:ellipsis', onclick: (e) => {
          doc.select({ nodes: [node.id] }, e.ctrlKey && e.shiftKey ? 'remove' : e.ctrlKey || e.metaKey ? 'add' : e.shiftKey ? 'toggle' : 'set');
          app.requestRender();
        }, ondblclick: () => this.enterNode(node.id) });
        select.textContent = (node.kind === 'component' ? '◇ ' : '▣ ') + node.name;
        const enter = h('button', { title: 'Entrar a editar ' + node.name, 'aria-label': 'Entrar a editar ' + node.name, onclick: () => this.enterNode(node.id) }, 'Entrar');
        row.append(select, enter); body.append(row);
      }
      if (s.one) { body.append(h('div', { class: 'sub' }, 'Objeto seleccionado')); this.nodeNameField(body, s.one); }
      body.append(h('div', { class: 'sub' }, 'Definiciones de componentes'));
      const defs = [...doc.scene.definitions.values()].filter((d) => d.kind === 'component');
      if (!defs.length) body.append(h('p', { class: 'muted' }, 'Crea un componente para reutilizar su definición.'));
      for (const def of defs) {
        const row = h('div', { class: 'btnrow', style: 'align-items:center;justify-content:space-between' });
        const name = h('span', { class: 'grow' }); name.textContent = def.name || 'Componente';
        const canPlace = this.canInstantiate(def.id);
        const place = h('button', { title: canPlace ? 'Añadir una instancia en el origen local; usa Mover para colocarla' : 'Esta definición contiene el contexto actual y produciría una referencia circular.', onclick: () => {
          const r = app.exec('component.instantiate', { definitionId: def.id });
          if (r.ok) { app.setTool('move'); app.toast('Instancia creada en el origen local. Usa Mover para colocarla.', 'info'); }
        } }, 'Instanciar');
        place.disabled = !canPlace;
        row.append(name, place);
        body.append(row);
      }
      body.append(h('p', { class: 'muted' }, 'Reflejar X usa el plano YZ del origen del contexto. Explotar incorpora el contenido al padre. Hacer único separa la definición de las instancias seleccionadas.'));
    }

    panel_organic(body) {
      const app = this.app, settings = app.organicSettings;
      const defaults = { width: 0.6, depth: 0.3, height: 0.24, bulge: 0.08, radius: 0.2, preserveBoundary: true };
      for (const key in defaults) if (settings[key] === undefined) settings[key] = defaults[key];
      body.innerHTML = '';
      body.append(h('div', { class: 'sub first' }, 'Crear una base orgánica'));
      body.append(h('p', { class: 'muted' }, 'Mallas para explorar carcasas, retrovisores o paños curvos. Se crean como grupos independientes, en el origen del contexto actual.'));
      const field = (label, key) => {
        const row = h('label', { class: 'field' }); row.append(document.createTextNode(label + ' (m)'));
        const input = h('input', { class: 'wide', 'aria-label': label }); input.value = String(settings[key]);
        input.addEventListener('keydown', e => e.stopPropagation());
        input.addEventListener('change', () => { const value = units.parseLen(input.value); if (value !== null) settings[key] = value; else { input.value = String(settings[key]); app.toast('Escribe una longitud válida.', 'warn'); } });
        row.append(input); body.append(row);
      };
      field('Ancho', 'width'); field('Fondo', 'depth'); field('Alto del elipsoide', 'height'); field('Bulto del paño', 'bulge');
      const create = (command, params) => { app.setTool('select'); const result = app.exec(command, params); if (result.ok) app.zoomExtents(); };
      const buttons = h('div', { class: 'btnrow' });
      buttons.append(h('button', { onclick: () => create('mesh.ellipsoid', { radii: [settings.width / 2, settings.depth / 2, settings.height / 2], name: 'Base elipsoide' }) }, 'Crear elipsoide'));
      buttons.append(h('button', { onclick: () => create('mesh.patch', { width: settings.width, depth: settings.depth, bulge: settings.bulge, name: 'Paño curvo' }) }, 'Crear paño curvo'));
      body.append(buttons, h('div', { class: 'sub' }, 'Refinar y dar forma'));
      const hs = this.hierarchyState(), editable = !!hs.one || app.doc.editPath.length > 0;
      const boundary = h('input', { type: 'checkbox' }); boundary.checked = settings.preserveBoundary;
      boundary.addEventListener('change', () => { settings.preserveBoundary = boundary.checked; });
      const lab = h('label', { class: 'check' }); lab.append(boundary, document.createTextNode(' Conservar borde al subdividir')); body.append(lab);
      const refine = h('button', { onclick: () => app.exec('mesh.subdivide', { preserveBoundary: settings.preserveBoundary }) }, 'Subdividir y suavizar (Loop)');
      refine.disabled = !editable; body.append(refine);
      field('Radio de deformación', 'radius');
      const sculpt = h('button', { onclick: () => {
        app.setTool('select');
        const state = this.hierarchyState();
        if (state.one && !app.exec('context.enter', { node: state.one.id }).ok) return;
        if (!app.doc.editPath.length) { app.toast('Selecciona una malla o entra en ella con doble clic.', 'info'); return; }
        app.setTool('sculpt');
      } }, 'Entrar y deformar suavemente (U)');
      sculpt.disabled = !editable; body.append(sculpt);
      body.append(h('p', { class: 'muted' }, 'Arrastra arriba o abajo sobre la malla; el radio controla la zona afectada. Esc cancela. Subdivide antes si faltan vértices. En componentes, editar la definición actualiza sus instancias.'));
      body.append(h('p', { class: 'muted' }, 'Base de diseño conceptual: mallas trianguladas, sin superficies NURBS ni control de fabricación. El paño es abierto; OBJ/STL conservan la malla.'));
    }

    panel_materials(body, full) {
      const app = this.app;
      if (!full && body.dataset.built) { this.refreshMaterialList(body); return; }
      body.dataset.built = '1';
      body.innerHTML = '';
      const cur = h('div', { class: 'curmat' });
      body.append(cur);
      this.curMatEl = cur;
      const grid = h('div', { class: 'swatches' });
      for (const [name, color, op] of PALETTE) {
        const b = h('button', { class: 'swatch' + (color ? '' : ' def'), title: name, onclick: () => { app.setMaterial(color ? { name, color, opacity: op === undefined ? 1 : op } : null); app.setTool('paint'); } });
        b.style.background = color || D.STYLE.front;
        if (op !== undefined) b.style.opacity = 0.75;
        grid.append(b);
      }
      body.append(grid);
      const custom = h('div', { class: 'custom' });
      const col = h('input', { type: 'color', value: '#7a8a6a' });
      const op = h('input', { type: 'range', min: '0.1', max: '1', step: '0.05', value: '1', title: 'Opacidad' });
      const nm = h('input', { placeholder: 'Nombre', class: 'grow' });
      nm.addEventListener('keydown', (e) => e.stopPropagation());
      custom.append(col, nm, op, h('button', { onclick: () => { app.setMaterial({ name: nm.value.trim() || col.value, color: col.value, opacity: +op.value }); app.setTool('paint'); } }, 'Usar'));
      body.append(h('div', { class: 'sub' }, 'Color propio'), custom);
      body.append(h('div', { class: 'sub' }, 'En el modelo'));
      this.matList = h('div', { class: 'matlist' });
      body.append(this.matList);
      body.append(h('p', { class: 'muted' }, 'Con la herramienta Pintar: Alt toma el material de una cara, Ctrl pinta las caras conectadas iguales y Mayús todas las iguales.'));
      this.refreshMaterialList(body);
    }
    refreshMaterialList() {
      const app = this.app, m = app.doc.model;
      if (this.curMatEl) {
        const c = app.currentMaterial;
        this.curMatEl.innerHTML = '<span class="sw big" style="background:' + (c ? c.color : D.STYLE.front) + ';opacity:' + (c ? (c.opacity < 1 ? 0.75 : 1) : 1) + '"></span><div><b>' + esc(c ? c.name : 'Por defecto') + '</b><br><span class="muted">Material activo para Pintar (B)</span></div>';
      }
      if (!this.matList) return;
      const count = new Map();
      for (const f of m.faces.values()) if (f.mat) count.set(f.mat, (count.get(f.mat) || 0) + 1);
      this.matList.innerHTML = '';
      if (!count.size) { this.matList.append(h('p', { class: 'muted' }, 'Todavía no hay caras pintadas.')); return; }
      for (const [id, n] of count) {
        const mt = m.materials.get(id);
        if (!mt) continue;
        this.matList.append(h('button', { class: 'matrow', onclick: () => { app.setMaterial({ name: mt.name, color: mt.color, opacity: mt.opacity }); app.setTool('paint'); } },
          '<span class="sw" style="background:' + mt.color + '"></span>' + esc(mt.name) + '<span class="muted"> · ' + n + ' caras</span>'));
      }
    }

    refreshGraphicsBadge() {
      const b = this.el.gfx;
      if (!b) return;
      const soft = this.app.graphics === 'software';
      b.textContent = soft ? 'Modo seguro' : 'Acelerado';
      b.classList.toggle('accel', !soft);
      b.title = soft ? 'Dibujo por software, sin aceleración gráfica. Cámbialo en Estilos.' : 'Dibujo con la tarjeta de vídeo (WebGL). Cámbialo en Estilos.';
      b.onclick = () => { if (this.panel !== 'styles') this.openPanel('styles'); };
    }

    panel_styles(body) {
      const app = this.app, o = app.renderer.opts;
      body.innerHTML = '';
      body.append(h('div', { class: 'sub first' }, 'Gráficos'));
      const gr0 = h('div', { class: 'btnrow' });
      gr0.append(h('button', { class: app.graphics === 'software' ? 'on' : '', onclick: () => app.setGraphicsMode('software') }, 'Modo seguro'));
      gr0.append(h('button', { class: app.graphics === 'webgl' ? 'on' : '', onclick: () => app.setGraphicsMode('webgl') }, 'Acelerado (WebGL)'));
      body.append(gr0);
      body.append(h('p', { class: 'muted' }, app.graphics === 'software'
        ? 'Ahora se dibuja por software, sin usar la tarjeta gráfica para el 3D. Es más lento con modelos grandes y no suaviza cilindros.'
        : 'Ahora se dibuja con la tarjeta gráfica (WebGL2).'));
      body.append(h('div', { class: 'sub' }, 'Mostrar'));
      const opts = [['showEdges', 'Aristas'], ['showHidden', 'Geometría oculta (aristas suaves)'], ['showAxes', 'Ejes'], ['showGuides', 'Guías'], ['xray', 'Rayos X'], ['monochrome', 'Monocromo']];
      for (const [k, label] of opts) {
        const cb = h('input', { type: 'checkbox' });
        cb.checked = !!o[k];
        cb.addEventListener('change', () => app.exec('view.option', { name: k, value: cb.checked }));
        const lab = h('label', { class: 'check' });
        lab.append(cb, document.createTextNode(' ' + label));
        body.append(lab);
      }
      body.append(h('div', { class: 'sub' }, 'Proyección'));
      const pr = h('div', { class: 'btnrow' });
      pr.append(h('button', { class: app.camera.persp ? 'on' : '', onclick: () => { app.exec('view.projection', { perspective: true }); this.renderPanel(true); } }, 'Perspectiva'));
      pr.append(h('button', { class: !app.camera.persp ? 'on' : '', onclick: () => { app.exec('view.projection', { perspective: false }); this.renderPanel(true); } }, 'Paralela'));
      body.append(pr);
      body.append(h('div', { class: 'sub' }, 'Guías'));
      const gr = h('div', { class: 'btnrow' });
      gr.append(h('button', { onclick: () => app.exec('guides.clear') }, 'Borrar todas las guías'));
      body.append(gr);
    }

    panel_views(body) {
      const app = this.app;
      body.innerHTML = '';
      const grid = h('div', { class: 'viewgrid' });
      for (const [id, label] of [['iso', 'Isométrica'], ['top', 'Planta'], ['front', 'Frontal'], ['back', 'Posterior'], ['left', 'Izquierda'], ['right', 'Derecha'], ['bottom', 'Inferior']]) {
        grid.append(h('button', { onclick: () => app.setView(id) }, label));
      }
      grid.append(h('button', { class: 'on', onclick: () => app.zoomExtents() }, 'Ver todo'));
      body.append(grid);
      body.append(h('div', { class: 'sub' }, 'Campo de visión'));
      const fov = h('input', { type: 'range', min: '20', max: '90', step: '1', value: String(Math.round(app.camera.fov * 180 / Math.PI)) });
      const lab = h('span', { class: 'muted' }, Math.round(app.camera.fov * 180 / Math.PI) + '°');
      fov.addEventListener('input', () => { app.camera.fov = +fov.value * Math.PI / 180; app.camera.update(); lab.textContent = fov.value + '°'; app.requestRender(); });
      body.append(fov, lab);
      body.append(h('p', { class: 'muted' }, 'Rueda: zoom hacia el cursor · botón central: orbitar · Mayús + botón central: desplazar.'));
    }

    panel_model(body) {
      const app = this.app;
      body.innerHTML = '';
      const r = app.doc.execute('model.stats');
      const s = r.stats;
      const rows = [['Nombre', esc(app.doc.name)], ['Unidades', 'metros'], ['Vértices', s.vertices], ['Aristas', s.edges], ['Caras', s.faces], ['Materiales', s.materials], ['Anotaciones', s.annotations], ['Área total', fmtArea(r.area)]];
      if (r.closed) rows.push(['Volumen', fmtVol(Math.abs(r.volume))], ['Sólido', 'cerrado ✓']);
      if (r.bbox) rows.push(['Caja envolvente', [0, 1, 2].map((i) => fmtNum(r.bbox.max[i] - r.bbox.min[i], 2)).join(' × ') + ' m']);
      body.append(table(rows));
      body.append(h('p', { class: 'muted' }, 'Dédalo ' + D.VERSION + ' · formato .dedalo (JSON abierto y documentado).'));
    }

    panel_console(body, full) {
      const app = this.app;
      if (!full && body.dataset.built) return;
      body.dataset.built = '1';
      body.innerHTML = '';
      body.append(h('p', { class: 'muted' }, 'Todo lo que hacen las herramientas es un <b>comando JSON</b>. Escribe uno por línea: <code>nombre {parámetros}</code>. Un agente puede usar lo mismo con <code>window.dedalo.execute(nombre, parámetros)</code>.'));
      const ta = h('textarea', { rows: '5', spellcheck: 'false' });
      ta.value = 'draw.rectangle {"origin":[0,0,0],"width":5,"height":4}\nmodel.faces {}';
      ta.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) run(); });
      const out = h('pre', { class: 'out' });
      const run = () => {
        for (const line of ta.value.split('\n')) {
          const t = line.trim();
          if (!t || t.startsWith('#')) continue;
          const m = t.match(/^([\w.]+)\s*(.*)$/);
          let params = {};
          if (m[2]) { try { params = JSON.parse(m[2]); } catch (e) { out.textContent = '✗ JSON no válido en: ' + t + '\n' + out.textContent; continue; } }
          const r = app.exec(m[1], params, true);
          out.textContent = (r.ok ? '✓ ' : '✗ ') + m[1] + ' → ' + JSON.stringify(r, (k, v) => (typeof v === 'number' ? +v.toFixed(4) : v)).slice(0, 1500) + '\n' + out.textContent;
        }
      };
      const rr = h('div', { class: 'btnrow' });
      rr.append(h('button', { class: 'on', onclick: run }, 'Ejecutar (Ctrl+Enter)'));
      body.append(ta, rr, out);
      const list = h('details', { class: 'cmds' });
      list.append(h('summary', {}, 'Comandos disponibles (' + app.doc.commandList().length + ')'));
      for (const c of app.doc.commandList()) {
        const ps = Object.entries(c.params || {}).map(([k, v]) => '<i>' + esc(k) + '</i>: ' + esc(v)).join('<br>');
        list.append(h('div', { class: 'cmd' }, '<code>' + esc(c.name) + '</code> <span class="muted">' + esc(c.title || '') + '</span>' + (ps ? '<div class="ps">' + ps + '</div>' : '')));
      }
      body.append(list);
    }

    panel_keys(body) {
      body.innerHTML = '';
      const rows = D.TOOL_DEFS.filter((d) => d.key).map((d) => ['<kbd>' + d.key + '</kbd>', d.id === 'copy' ? 'Copiar · conserva el original sin mantener Ctrl' : d.label]);
      rows.push(['<kbd>Mayús</kbd>+<kbd>Z</kbd>', 'Ver todo'], ['<kbd>Supr</kbd>', 'Borrar la selección'], ['<kbd>Ctrl</kbd>+<kbd>Z</kbd> / <kbd>Y</kbd>', 'Deshacer / Rehacer'],
        ['<kbd>Ctrl</kbd>+<kbd>A</kbd>', 'Seleccionar todo'], ['<kbd>Ctrl</kbd>+<kbd>S</kbd>', 'Guardar'], ['<kbd>Ctrl</kbd>+<kbd>O</kbd>', 'Abrir'], ['<kbd>Esc</kbd>', 'Cancelar / deseleccionar'],
        ['Escribir + <kbd>Intro</kbd>', 'Medida exacta (2,5 · 250cm · 5;4 · [x;y;z] · &lt;dx;dy;dz&gt;)'], ['<kbd>Mayús</kbd> mantenida', 'Bloquear la inferencia actual'],
        ['<kbd>→</kbd> <kbd>←</kbd> <kbd>↑</kbd>', 'Bloquear eje rojo / verde / azul'], ['Cotas: <kbd>Tab</kbd> / flechas', 'Elegir eje X/Y/Z · Mayús mantenida: distancia inclinada'], ['<kbd>Ctrl</kbd> mantenido (Mover)', 'Copiar; al soltar vuelve a mover · luego «x5» o «/5»'], ['<kbd>Ctrl</kbd> (Rotar)', 'Alternar copia'], ['<kbd>U</kbd>', 'Deformar suavemente una malla'], ['Botón central', 'Orbitar (Mayús: desplazar)'], ['Rueda', 'Zoom al cursor']);
      body.append(table(rows));
    }

    /* ---------------- menú principal ---------------- */

    buildMenu() {
      const app = this.app;
      const m = this.el.menu;
      m.innerHTML = '';
      const item = (label, kb, fn, dis) => {
        const b = h('button', { class: 'mi', onclick: () => { this.hideMenus(); fn(); } }, '<span>' + esc(label) + '</span>' + (kb ? '<kbd>' + kb + '</kbd>' : ''));
        if (dis) b.disabled = true;
        m.append(b);
      };
      const sec = (t) => m.append(h('div', { class: 'msec' }, esc(t)));
      sec('Archivo');
      item('Nuevo', 'Ctrl+N', () => app.newModel());
      item('Abrir…', 'Ctrl+O', () => app.files.open());
      item('Guardar', 'Ctrl+S', () => app.files.save());
      item('Guardar como…', 'Ctrl+Mayús+S', () => app.files.save(true));
      item('Exportar OBJ', '', () => app.files.exportOBJ());
      item('Exportar STL', '', () => app.files.exportSTL());
      item('Exportar IFC · BIM', '', () => { if(this.panel !== 'bim') this.openPanel('bim'); });
      item('Caja de sección', '', () => { if(this.panel !== 'section') this.openPanel('section'); });
      item('Captura de pantalla (PNG)', '', () => app.files.screenshot());
      for (const p of D.plugins) {
        for (const ex of p.exporters || []) item(ex.label, '', () => ex.run(app));
        for (const mi of p.menu || []) item(mi.label, '', () => mi.run(app));
      }
      sec('Edición');
      const hs = this.hierarchyState();
      item('Deshacer', 'Ctrl+Z', () => app.undo());
      item('Rehacer', 'Ctrl+Y', () => app.redo());
      item('Seleccionar todo', 'Ctrl+A', () => app.exec('select.all'));
      item('Copiar', 'V', () => app.setTool('copy'), hs.empty);
      item('Borrar selección', 'Supr', () => app.exec('entities.erase'), hs.empty);
      item('Crear grupo', '', () => this.createGroup(), hs.empty);
      item('Crear componente', '', () => this.createComponent(), !hs.canComponent);
      item('Entrar a editar objeto', '', () => this.enterNode(hs.one.id), !hs.one);
      item('Renombrar objeto…', '', () => this.renameNode(hs.one), !hs.one);
      item('Salir al padre', 'Esc', () => this.exitToDepth(app.doc.editPath.length - 1), !app.doc.editPath.length);
      item('Explotar objetos seleccionados', '', () => app.exec('group.explode'), !hs.nodes.length);
      item('Hacer componente único', '', () => app.exec('component.makeUnique'), !hs.one || hs.one.kind !== 'component');
      item('Reflejar selección en X', '', () => app.exec('entities.mirror', { axis: 'x', origin: [0, 0, 0] }), hs.empty);
      item('Invertir caras seleccionadas', '', () => app.exec('faces.flip'), !app.doc.sel.faces.size || !!hs.nodes.length);
      sec('Ver');
      item('Jerarquía', '', () => { if (this.panel !== 'hierarchy') this.openPanel('hierarchy'); });
      item('Formas libres', '', () => { if (this.panel !== 'organic') this.openPanel('organic'); });
      item('Ver todo', 'Mayús+Z', () => app.zoomExtents());
      item('Rayos X', '', () => app.exec('view.option', { name: 'xray', value: !app.renderer.opts.xray }));
      item('Perspectiva / Paralela', '', () => app.exec('view.projection', { perspective: !app.camera.persp }));
      sec('Ayuda');
      item('Atajos de teclado', '', () => this.openPanel('keys'));
      item('Acerca de Dédalo', '', () => app.about());
    }
    toggleMenu() {
      const m = this.el.menu;
      const show = m.classList.contains('hidden');
      this.hideMenus();
      if (show) { this.buildMenu(); m.classList.remove('hidden'); }
    }
    hideMenus() {
      const open = !this.el.menu.classList.contains('hidden') || !this.el.ctx.classList.contains('hidden');
      this.el.menu.classList.add('hidden');
      this.el.ctx.classList.add('hidden');
      return open;
    }

    showContextMenu(x, y) {
      this.hideMenus();
      const app = this.app, sel = app.doc.sel;
      const c = this.el.ctx;
      c.innerHTML = '';
      const item = (label, fn, dis) => {
        const b = h('button', { class: 'mi', onclick: () => { this.hideMenus(); fn(); } }, '<span>' + esc(label) + '</span>');
        if (dis) b.disabled = true;
        c.append(b);
      };
      const empty = app.doc.selectionEmpty();
      const hs = this.hierarchyState();
      item('Borrar', () => app.exec('entities.erase'), empty);
      item('Copiar', () => app.setTool('copy'), empty);
      item('Crear grupo', () => this.createGroup(), empty);
      item('Crear componente', () => this.createComponent(), !hs.canComponent);
      item('Entrar a editar', () => this.enterNode(hs.one.id), !hs.one);
      item('Renombrar…', () => this.renameNode(hs.one), !hs.one);
      item('Salir al padre', () => this.exitToDepth(app.doc.editPath.length - 1), !app.doc.editPath.length);
      item('Explotar', () => app.exec('group.explode'), !hs.nodes.length);
      item('Hacer único', () => app.exec('component.makeUnique'), !hs.one || hs.one.kind !== 'component');
      item('Reflejar en X', () => app.exec('entities.mirror', { axis: 'x', origin: [0, 0, 0] }), empty);
      c.append(h('div', { class: 'msep' }));
      item('Invertir caras', () => app.exec('faces.flip'), !sel.faces.size || !!hs.nodes.length);
      item('Suavizar aristas', () => app.exec('edges.soften', { soft: true }), !sel.edges.size || !!hs.nodes.length);
      item('Endurecer aristas', () => app.exec('edges.soften', { soft: false }), !sel.edges.size || !!hs.nodes.length);
      c.append(h('div', { class: 'msep' }));
      item('Seleccionar lo conectado', () => app.exec('select.connected'), empty || !!hs.nodes.length);
      item('Seleccionar todo', () => app.exec('select.all'));
      item('Anular selección', () => app.exec('select.none'), empty);
      c.append(h('div', { class: 'msep' }));
      item('Ver selección', () => app.zoomToSelection(), empty);
      item('Información de la entidad', () => { if (this.panel !== 'info') this.openPanel('info'); });
      const r = this.el.viewport.getBoundingClientRect();
      c.classList.remove('hidden');
      const w = c.offsetWidth, hh = c.offsetHeight;
      c.style.left = Math.min(r.left + x, window.innerWidth - w - 6) + 'px';
      c.style.top = Math.min(r.top + y, window.innerHeight - hh - 6) + 'px';
    }

    /* ---------------- avisos y texto ---------------- */

    toast(msg, kind, actions) {
      if (!msg) return;
      const t = h('div', { class: 'toast ' + (kind || 'info') }, '<span>' + esc(msg) + '</span>');
      for (const a of actions || []) t.append(h('button', { onclick: () => { a.run(); t.remove(); } }, esc(a.label)));
      this.el.toasts.append(t);
      while (this.el.toasts.children.length > 4) this.el.toasts.firstChild.remove();
      setTimeout(() => t.classList.add('out'), actions ? 12000 : 3600);
      setTimeout(() => t.remove(), actions ? 12500 : 4100);
    }

    promptText(x, y, def, cb) {
      const box = h('div', { class: 'prompt' });
      const inp = h('input', { value: def || '' });
      box.append(inp);
      box.style.left = x + 'px';
      box.style.top = y + 'px';
      this.el.viewport.append(box);
      let done = false;
      const finish = (v) => { if (done) return; done = true; box.remove(); cb(v); this.app.requestRender(); };
      inp.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') finish(inp.value); if (e.key === 'Escape') finish(null); });
      inp.addEventListener('blur', () => finish(inp.value));
      setTimeout(() => { inp.focus(); inp.select(); }, 0);
    }
  }

  function table(rows) {
    const t = h('table', { class: 'kv' });
    for (const [k, v] of rows) t.append(h('tr', {}, '<th>' + k + '</th><td>' + v + '</td>'));
    return t;
  }

  D.UI = UI;
  D.PALETTE = PALETTE;
})(typeof window !== 'undefined' ? window : globalThis);
