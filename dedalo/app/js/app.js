/*
 * Dédalo — aplicación: une documento, cámara, render, inferencias, herramientas e interfaz.
 */
(function (root) {
  'use strict';
  const D = root.DEDALO;
  const { V, geom } = D;

  D.VERSION = '0.5.1';

  D.TOOL_DEFS = [
    { group: 'sel', id: 'select', label: 'Seleccionar', key: 'Espacio', icon: 'select' },
    { group: 'sel', id: 'erase', label: 'Borrar', key: 'E', icon: 'erase' },
    { group: 'sel', id: 'paint', label: 'Pintar', key: 'B', icon: 'paint' },
    { group: 'draw', id: 'line', label: 'Línea', key: 'L', icon: 'line' },
    { group: 'draw', id: 'arc', label: 'Arco', key: 'A', icon: 'arc' },
    { group: 'draw', id: 'rect', label: 'Rectángulo', key: 'R', icon: 'rect' },
    { group: 'draw', id: 'circle', label: 'Círculo', key: 'C', icon: 'circle' },
    { group: 'draw', id: 'polygon', label: 'Polígono', key: 'G', icon: 'polygon' },
    { group: 'mod', id: 'pushpull', label: 'Empujar/Tirar', key: 'P', icon: 'pushpull' },
    { group: 'mod', id: 'move', label: 'Mover', key: 'M', icon: 'move' },
    { group: 'mod', id: 'copy', label: 'Copiar', key: 'V', icon: 'copy' },
    { group: 'mod', id: 'rotate', label: 'Rotar', key: 'Q', icon: 'rotate' },
    { group: 'mod', id: 'scale', label: 'Escala', key: 'S', icon: 'scale' },
    { group: 'mod', id: 'offset', label: 'Equidistancia', key: 'F', icon: 'offset' },
    { group: 'mod', id: 'sculpt', label: 'Deformar suave', key: 'U', icon: 'move' },
    { group: 'anno', id: 'tape', label: 'Cinta métrica', key: 'T', icon: 'tape' },
    { group: 'anno', id: 'dim', label: 'Cota', key: 'D', icon: 'dim' },
    { group: 'anno', id: 'text', label: 'Texto', key: 'K', icon: 'text' },
    { group: 'nav', id: 'orbit', label: 'Orbitar', key: 'O', icon: 'orbit' },
    { group: 'nav', id: 'pan', label: 'Desplazar', key: 'H', icon: 'pan' },
    { group: 'nav', id: 'zoom', label: 'Zoom', key: 'Z', icon: 'zoom' }
  ];

  class App {
    constructor() {
      D.app = this;
      const $ = (id) => document.getElementById(id);
      this.el = {
        app: $('app'), topbar: $('topbar'), toolbar: $('toolbar'), viewport: $('viewport'), gl: $('gl'), ov: $('ov'),
        rail: $('rail'), panel: $('panel'), hint: $('hint'), vcb: $('vcb'), vcbLabel: $('vcb-label'), menu: $('menu'), ctx: $('ctxmenu'), toasts: $('toasts'), gfx: $('gfx')
      };
      this.doc = new D.Document();
      this.camera = new D.Camera();
      // Modo gráfico: por defecto, por software (sin WebGL). Ver docs/INCIDENCIA-2026-10-17-0x135.md.
      this.graphics = D.graphicsMode();
      let glError = null;
      if (this.graphics === 'webgl') {
        try { this.renderer = new D.Renderer(this.el.gl); }
        catch (e) { glError = e; this.graphics = 'software'; }
      }
      if (!this.renderer) {
        // un lienzo que ya pidió WebGL no puede dar después un contexto 2D: se cambia por otro limpio
        if (glError) { const fresh = this.el.gl.cloneNode(false); this.el.gl.replaceWith(fresh); this.el.gl = fresh; }
        this.renderer = new D.SoftRenderer(this.el.gl);
      }
      this.overlay = new D.Overlay(this.el.ov, this, { software: this.graphics === 'software' });
      this.inference = new D.Inference(this);
      this.files = new D.Files(this);
      const T = D.tools;
      this.tools = {
        select: new T.SelectTool(this), erase: new T.EraserTool(this), paint: new T.PaintTool(this),
        line: new T.LineTool(this), arc: new T.ArcTool(this), rect: new T.RectTool(this),
        circle: new T.CircleTool(this, false), polygon: new T.CircleTool(this, true),
        pushpull: new T.PushPullTool(this), move: new T.MoveTool(this), copy: new T.CopyTool(this), rotate: new T.RotateTool(this),
        scale: new T.ScaleTool(this), offset: new T.OffsetTool(this), sculpt: new T.SculptTool(this),
        tape: new T.TapeTool(this), dim: new T.DimTool(this), text: new T.TextTool(this),
        orbit: new T.OrbitTool(this), pan: new T.PanTool(this), zoom: new T.ZoomTool(this)
      };
      this.tool = this.tools.select;
      this.currentMaterial = { name: 'Ladrillo', color: '#b5583a', opacity: 1 };
      this.organicSettings = { radius: 0.2 };
      this.vcbBuf = '';
      this.selVersion = 0;
      this.mcpBridge = new D.MCPBridge(this);
      this.ui = new D.UI(this);
      this.mcpBridge.on(() => this.ui.refreshMCP());
      this.registerAppCommands();
      this.bindEvents();
      this.resize();
      this.setTool('select');
      this.ui.refreshGraphicsBadge();
      this.renderNow();
      if (glError) this.toast('No se pudo activar la aceleración gráfica (' + glError.message + '). Se usa el modo seguro.', 'warn');
      this.offerRecovery();
      this.exposeAPI();
      this.ui.consumePairLink();
      window.addEventListener('pagehide', () => { void this.mcpBridge.disconnect(); });
    }

    // Cambiar de renderizador exige recargar: un lienzo no puede pasar de 2D a WebGL.
    setGraphicsMode(mode) {
      if (mode === this.graphics) return;
      D.setGraphicsMode(mode);
      const msg = mode === 'webgl'
        ? 'La aceleración gráfica usa la tarjeta de vídeo (WebGL). Se aplica al volver a abrir Dédalo. ¿Recargar ahora? Guarda antes si tienes cambios.'
        : 'El modo seguro dibuja sin aceleración. Se aplica al volver a abrir Dédalo. ¿Recargar ahora? Guarda antes si tienes cambios.';
      if (confirm(msg)) location.reload();
      else this.toast('Se aplicará la próxima vez que abras Dédalo.', 'info');
    }

    /* ---------------- eventos ---------------- */

    bindEvents() {
      const ov = this.el.ov;
      ov.addEventListener('pointerdown', (e) => this.onPointerDown(e));
      ov.addEventListener('pointermove', (e) => this.onPointerMove(e));
      ov.addEventListener('pointerup', (e) => this.onPointerUp(e));
      ov.addEventListener('pointercancel', () => { this.navDrag = null; this.rightDown = null; if (this.tool) this.tool.cancel(); });
      ov.addEventListener('mousedown', (e) => { if (e.button === 1) e.preventDefault(); });
      ov.addEventListener('wheel', (e) => this.onWheel(e), { passive: false });
      // The popup can be inserted under the pointer before the browser emits
      // contextmenu. Capture that event even when its new target is #ctxmenu.
      document.addEventListener('contextmenu', (e) => this.onContextMenu(e), true);
      ov.addEventListener('pointerleave', () => { this.mouse = null; });
      window.addEventListener('keydown', (e) => this.onKeyDown(e));
      window.addEventListener('keyup', (e) => this.onKeyUp(e));
      window.addEventListener('resize', () => { this.resize(); this.renderNow(); });
      if (window.ResizeObserver) new ResizeObserver(() => { this.resize(); this.requestRender(); }).observe(this.el.viewport);
      window.addEventListener('beforeunload', (e) => { if (this.doc.dirty) { e.preventDefault(); e.returnValue = ''; } });
      this.doc.on((kind) => {
        if (kind === 'beforecontext') {
          this.tool.cancel();
          return;
        }
        if (kind === 'context') {
          this.tool.reset();
          this.vcbBuf = '';
          this.showVCB();
          this._lastDown = null;
          this._clicks = 0;
          this._fk = this._lk = null;
          this.updateSceneRadius();
          this.zoomExtents();
          this.ui.refreshContext();
          this.ui.renderPanel(true);
        }
        if (kind === 'model') {
          this._fk = this._lk = null;
          this.updateSceneRadius();
          this.files.scheduleAutosave();
        }
        if (kind === 'selection' || kind === 'model' || kind === 'context') this.selVersion++;
        this.ui.refreshPanels();
        this.ui.refreshTitle();
        this.requestRender();
      });
    }

    onContextMenu(e) {
      const target = e.target && (e.target.nodeType === 3 ? e.target.parentElement : e.target);
      if (!target) return;
      // Keep native editing and dialog menus, including inline text prompts.
      if (target.closest && target.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"]), dialog, [role="dialog"], .modal')) return;
      const surfaces = [this.el.viewport, this.el.ov, this.el.gl, this.el.ctx];
      if (surfaces.some((el) => el && (el === target || (el.contains && el.contains(target))))) e.preventDefault();
    }

    evt(e) {
      const r = this.el.ov.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top, button: e.button, buttons: e.buttons === undefined ? 0 : e.buttons, shift: !!e.shiftKey, ctrl: !!(e.ctrlKey || e.metaKey), alt: !!e.altKey, clicks: 1 };
    }

    onPointerDown(e) {
      try { this.el.ov.setPointerCapture(e.pointerId); } catch (err) { /* nada */ }
      this.ui.hideMenus();
      if (document.activeElement && document.activeElement !== document.body && document.activeElement.blur) document.activeElement.blur();
      const ev = this.evt(e);
      this.pointerDown(ev);
    }
    pointerDown(ev) {
      if (this.territoryBusy) return;
      const now = performance.now();
      const ld = this._lastDown;
      if (ld && now - ld.t < 450 && Math.hypot(ev.x - ld.x, ev.y - ld.y) < 6 && ev.button === ld.b) this._clicks = (this._clicks || 1) + 1;
      else this._clicks = 1;
      this._lastDown = { t: now, x: ev.x, y: ev.y, b: ev.button };
      ev.clicks = this._clicks;
      if (ev.button === 1) { this.navDrag = { x: ev.x, y: ev.y, pivot: this.pivotAt(ev.x, ev.y) }; this.el.ov.style.cursor = 'grabbing'; return; }
      if (ev.button === 2) { this.rightDown = { x: ev.x, y: ev.y }; return; }
      try {
        this.tool.onDown(ev);
        if (ev.clicks === 2) this.tool.onDouble(ev);
      } catch (err) { console.error(err); this.toast('Error interno: ' + err.message, 'error'); }
      this.afterInput();
    }
    onPointerMove(e) { this.pointerMove(this.evt(e)); }
    pointerMove(ev) {
      if (this.territoryBusy) return;
      this.mouse = ev;
      if (this.navDrag) {
        const dx = ev.x - this.navDrag.x, dy = ev.y - this.navDrag.y;
        if (ev.shift) this.camera.pan(dx, dy, this.navDrag.pivot);
        else this.camera.orbit(dx, dy, this.navDrag.pivot);
        this.navDrag.x = ev.x; this.navDrag.y = ev.y;
        this.requestRender();
        return;
      }
      try { this.tool.onMove(ev); } catch (err) { console.error(err); }
      const c = this.tool.cursor();
      if (this._cursor !== c) { this._cursor = c; this.el.ov.style.cursor = c; }
      this.ui.refreshStatus();
    }
    onPointerUp(e) { this.pointerUp(this.evt(e)); }
    pointerUp(ev) {
      if (this.territoryBusy) return;
      if (ev.button === 1 && this.navDrag) { this.navDrag = null; this._cursor = null; return; }
      if (ev.button === 2 && this.rightDown) {
        const moved = Math.hypot(ev.x - this.rightDown.x, ev.y - this.rightDown.y) > 5;
        this.rightDown = null;
        if (!moved) this.contextMenu(ev);
        return;
      }
      if (ev.button === 0) { try { this.tool.onUp(ev); } catch (err) { console.error(err); } }
      this.afterInput();
    }
    afterInput() { this.requestRender(); this.ui.refreshStatus(); }

    contextMenu(ev) {
      if (this.tool.state !== 0) { this.tool.cancel(); this.afterInput(); return; }
      const h = D.pickForSelect(this, ev.x, ev.y);
      if (h && this.tool.id === 'select') {
        const node = this.doc.nodeForHit(h);
        const inSel = node ? this.doc.sel.nodes.has(node) : (h.face && this.doc.sel.faces.has(h.face)) || (h.edge && this.doc.sel.edges.has(h.edge)) || (h.annot && this.doc.sel.annots.has(h.annot));
        if (!inSel) this.doc.select(node ? { nodes: [node] } : { faces: h.face ? [h.face] : [], edges: h.edge ? [h.edge] : [], annots: h.annot ? [h.annot] : [] }, 'set');
      }
      this.renderNow();
      this.ui.showContextMenu(ev.x, ev.y);
    }

    onWheel(e) {
      e.preventDefault();
      if (this.territoryBusy) return;
      const ev = this.evt(e);
      const k = e.deltaMode === 1 ? 0.05 : 0.0015;
      const f = Math.exp(Math.max(-0.5, Math.min(0.5, e.deltaY * k)));
      this.camera.zoomAt(f, this.pivotAt(ev.x, ev.y));
      this.requestRender();
    }

    // Punto 3D bajo el ratón para orbitar/zoom: cara, suelo o plano del objetivo.
    pivotAt(x, y) {
      const hit = this.inference.picker.faceAt(x, y);
      if (hit) return hit.p;
      const ray = this.camera.ray(x, y);
      const t = geom.rayPlane(ray.o, ray.d, { n: [0, 0, 1], d: 0 });
      if (t !== null && t > 0 && t < this.camera.dist * 8) return V.add(ray.o, V.scale(ray.d, t));
      const fwd = this.camera.forward();
      const t2 = geom.rayPlane(ray.o, ray.d, { n: fwd, d: V.dot(fwd, this.camera.target) });
      return V.add(ray.o, V.scale(ray.d, t2 === null ? this.camera.dist : t2));
    }

    onKeyDown(e) {
      const t = e.target;
      if (t && t.closest && t.closest('dialog, [role="dialog"], .modal')) return;
      if (e.key === 'Escape' && this.ui.hideMenus()) {
        e.preventDefault();
        return;
      }
      if (t && t !== this.el.vcb && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      if (t === this.el.vcb) return;
      this.keyDown({ key: e.key, shift: e.shiftKey, ctrl: e.ctrlKey || e.metaKey, alt: e.altKey, repeat: e.repeat, prevent: () => e.preventDefault() });
    }
    keyDown(k) {
      const key = k.key;
      const prevent = k.prevent || (() => {});
      if (this.territoryBusy) { prevent(); return; }
      if (k.ctrl) {
        const c = key.toLowerCase();
        if (c === 'z' && !k.shift) { prevent(); this.undo(); return; }
        if (c === 'y' || (c === 'z' && k.shift)) { prevent(); this.redo(); return; }
        if (c === 's') { prevent(); this.files.save(k.shift); return; }
        if (c === 'o') { prevent(); this.files.open(); return; }
        if (c === 'n') { prevent(); this.newModel(); return; }
        if (c === 'a') { prevent(); this.exec('select.all'); return; }
      }
      if (['Shift', 'Control', 'Meta', 'Alt', 'Tab', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(key)) {
        if (!k.repeat && this.tool.onKey({ key, shift: k.shift, ctrl: k.ctrl })) { prevent(); this.afterInput(); }
        return;
      }
      if (k.ctrl || k.alt) return;
      if (key === 'Enter') { if (this.vcbBuf) { prevent(); this.submitVCB(this.vcbBuf); } return; }
      if (key === 'Backspace') { if (this.vcbBuf) { prevent(); this.vcbBuf = this.vcbBuf.slice(0, -1); this.showVCB(); } return; }
      if (key === 'Escape') {
        prevent();
        if (this.vcbBuf) { this.vcbBuf = ''; this.showVCB(); return; }
        this.escape();
        return;
      }
      if (key === 'Delete') { if (!this.doc.selectionEmpty()) { prevent(); this.exec('entities.erase'); } return; }
      if (key.length !== 1) return;
      const starts = /[0-9.,+\-[<\/*;]/.test(key) || key.toLowerCase() === 'x';
      if (this.vcbBuf || starts) {
        prevent();
        this.vcbBuf += key;
        this.showVCB();
        return;
      }
      if (key === ' ') { prevent(); this.setTool('select'); return; }
      if (k.shift && key.toLowerCase() === 'z') { prevent(); this.zoomExtents(); return; }
      const def = D.TOOL_DEFS.find((d) => d.key && d.key.length === 1 && d.key.toLowerCase() === key.toLowerCase());
      if (def && !k.shift) { prevent(); this.setTool(def.id); }
    }
    onKeyUp(e) {
      if (this.territoryBusy) return;
      if (['Shift', 'Control', 'Meta', 'Alt'].includes(e.key)) { if (this.tool.onKeyUp({ key: e.key, ctrl: !!(e.ctrlKey || e.metaKey), shift: !!e.shiftKey, alt: !!e.altKey })) this.afterInput(); }
    }

    escape() {
      if (this.tool.state !== 0) { this.tool.cancel(); }
      else if (this.doc.editPath.length) this.exec('context.exit');
      else if (this.tool.id === 'select') this.doc.clearSelection();
      else this.tool.cancel();
      this.afterInput();
    }

    showVCB() {
      this.el.vcb.value = this.vcbBuf;
      this.el.vcb.classList.toggle('typing', !!this.vcbBuf);
    }
    setVCB(text) {
      if (this.vcbBuf || document.activeElement === this.el.vcb) return;
      this.el.vcb.value = text;
    }
    submitVCB(text) {
      this.vcbBuf = '';
      this.showVCB();
      text = String(text || '').trim();
      if (!text) return;
      let ok = false;
      try { ok = this.tool.onVCB(text); } catch (err) { console.error(err); }
      if (!ok) this.toast('«' + text + '» no es un valor válido para ' + this.tool.vcbLabel().toLowerCase() + ' aquí.', 'warn');
      this.afterInput();
    }

    /* ---------------- acciones ---------------- */

    setTool(id) {
      const t = this.tools[id];
      if (!t) return false;
      if (this.tool) this.tool.deactivate();
      this.tool = t;
      t.activate();
      this.vcbBuf = '';
      this.showVCB();
      this.el.vcb.value = '';
      this.ui.setActiveTool(id);
      this._cursor = t.cursor();
      this.el.ov.style.cursor = this._cursor;
      this.ui.refreshStatus();
      this.requestRender();
      return true;
    }

    exec(name, params, quiet) {
      const command = this.doc.commands.get(name);
      if (command && command.undoable !== false) this.tool.cancel();
      const r = this.doc.execute(name, params || {});
      if (!r.ok && !quiet) this.toast(r.error, 'error');
      this.afterInput();
      return r;
    }
    undo() {
      this.tool.cancel();
      const r = this.doc.undo();
      if (!r) this.toast('No hay nada que deshacer.', 'info');
      this.afterInput();
    }
    redo() {
      this.tool.cancel();
      const r = this.doc.redo();
      if (!r) this.toast('No hay nada que rehacer.', 'info');
      this.afterInput();
    }
    newModel() {
      if (this.doc.dirty && !confirm('Hay cambios sin guardar. ¿Empezar un modelo nuevo?')) return;
      this.tool.cancel();
      this.doc.newModel();
      this.files.handle = null;
      this.camera = Object.assign(this.camera, new D.Camera());
      this.resize();
      this.camera.update();
      this.ui.refreshTitle();
      this.renderNow();
    }
    afterLoad(name, fit) {
      this.doc.name = name || this.doc.name;
      this.tool.cancel();
      this.updateSceneRadius();
      if (fit !== false) this.zoomExtents();
      this.ui.refreshTitle();
      this.ui.refreshContext();
      this.ui.renderPanel(true);
      this.renderNow();
      this.toast('Abierto: ' + this.doc.name, 'ok');
    }

    setMaterial(m) { this.currentMaterial = m; this.ui.refreshMaterialList(); this.ui.refreshStatus(); }

    updateSceneRadius() {
      const bb = this.doc.model.bbox();
      this.camera.sceneRadius = bb ? Math.max(10, V.dist(bb.min, bb.max)) : 10;
      this.camera.update();
    }
    zoomExtents() {
      const m = this.doc.model;
      let bb = m.bbox();
      for (const a of m.annots.values()) {
        const dimension = a.kind === 'dim' ? D.DimensionGeometry.points(a) : null;
        for (const p of [a.p, a.a, a.b, dimension && dimension.a, dimension && dimension.b]) {
          if (!p || a.kind === 'guideLine') continue;
          if (!bb) bb = { min: p.slice(), max: p.slice() };
          for (let i = 0; i < 3; i++) { bb.min[i] = Math.min(bb.min[i], p[i]); bb.max[i] = Math.max(bb.max[i], p[i]); }
        }
      }
      this.camera.fit(bb);
      this.requestRender();
    }
    zoomToSelection() {
      const bb = this.doc.model.bbox(this.doc.vertsOf(this.doc.selectionItems()));
      if (bb) { this.camera.fit(bb); this.requestRender(); }
    }
    setView(name) { this.camera.setView(name); this.zoomExtents(); }

    about() {
      this.toast('Dédalo ' + D.VERSION + ' — modelador 3D libre. Motor geométrico, render WebGL e iconos propios.', 'info');
    }

    offerRecovery() {
      const a = this.files.readAutosave();
      if (!a) return;
      const geometry = (m) => !!m && ['verts', 'edges', 'faces', 'annots'].some((k) => Array.isArray(m[k]) && m[k].length);
      const defs = a.scene && Array.isArray(a.scene.definitions) ? a.scene.definitions : [];
      const sceneContent = defs.some((d) => d && (d.kind === 'component' || d.id === a.scene.rootId &&
        (geometry(d.model) || Array.isArray(d.nodes) && d.nodes.length)));
      if (!sceneContent && !geometry(a.model)) return;
      this.toast('Hay un modelo sin guardar de la última sesión.', 'info', [
        { label: 'Recuperar', run: () => { this.doc.loadJSON(a, a.name || 'Recuperado'); if (a.camera) this.camera.load(a.camera); this.doc.dirty = true; this.afterLoad(a.name || 'Recuperado', !a.camera); } },
        { label: 'Descartar', run: () => this.files.clearAutosave() }
      ]);
    }

    toast(msg, kind, actions) { this.ui.toast(msg, kind, actions); }
    promptText(x, y, def, cb) { this.ui.promptText(x, y, def, cb); }
    refreshStatus() { this.ui.refreshStatus(); }

    /* ---------------- render ---------------- */

    resize() {
      const r = this.el.viewport.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = Math.max(1, Math.round(r.width)), h = Math.max(1, Math.round(r.height));
      this.renderer.resize(w, h, dpr);
      this.overlay.resize(w, h, dpr);
      if (this.camera.w !== w || this.camera.h !== h) this.camera.setSize(w, h);
    }
    requestRender() {
      if (this._rendering) return;
      if (this._raf) return;
      this._raf = requestAnimationFrame(() => { this._raf = 0; this.renderNow(); });
      // si la ventana está oculta, requestAnimationFrame puede no llegar
      clearTimeout(this._rt);
      this._rt = setTimeout(() => { if (this._raf) { cancelAnimationFrame(this._raf); this._raf = 0; this.renderNow(); } }, 120);
    }
    renderNow() {
      if (this._rendering) return;
      this._rendering = true;
      try {
      if (this.tool && this.tool.flushMotion) this.tool.flushMotion();
      const m = this.doc.model;
      const hover = (this.tool.hover && this.tool.hover()) || null;
      const ok = JSON.stringify(this.renderer.opts);
      const fk = m.rev + '|' + this.selVersion + '|' + (hover && hover.face) + '|' + ok;
      if (fk !== this._fk) { this.renderer.buildFaces(m, this.doc.sel, hover); this._fk = fk; }
      const lk = m.rev + '|' + this.selVersion + '|' + (hover && hover.edge) + '|' + ok;
      if (lk !== this._lk) { this.renderer.modelLines(m, this.doc.sel, hover); this._lk = lk; }
      this.renderer.render(this.camera);
      this.overlay.clear();
      this.overlay.drawAnnotations(m, this.doc.sel, hover && hover.annot);
      try { this.tool.drawOverlay(this.overlay); } catch (err) { console.error(err); }
      } finally { this._rendering = false; }
    }
    snapshot() {
      this.renderNow();
      // El visor y la capa 2D pueden tener resoluciones distintas (el modo seguro dibuja a 1:1).
      const c = document.createElement('canvas');
      c.width = this.el.ov.width; c.height = this.el.ov.height;
      const g = c.getContext('2d');
      g.drawImage(this.el.gl, 0, 0, c.width, c.height);
      g.drawImage(this.el.ov, 0, 0);
      return c.toDataURL('image/png');
    }

    /* ---------------- comandos de la aplicación ---------------- */

    registerAppCommands() {
      const R = (name, def) => this.doc.register(name, Object.assign({ undoable: false }, def));
      R('view.zoomExtents', { title: 'Ver todo', run: () => { this.zoomExtents(); return { ok: true }; } });
      R('view.set', { title: 'Vista estándar', params: { name: 'iso | top | bottom | front | back | left | right' }, run: (p) => { this.setView(p.name); return { ok: true }; } });
      R('view.option', {
        title: 'Opción de visualización', params: { name: 'showEdges | showHidden | showAxes | showGuides | xray | monochrome', value: 'bool' },
        run: (p) => {
          if (!(p.name in this.renderer.opts)) return { ok: false, error: 'Opción desconocida: ' + p.name };
          this.renderer.opts[p.name] = !!p.value; this.requestRender(); this.ui.refreshPanels(); return { ok: true };
        }
      });
      R('view.projection', { title: 'Proyección', params: { perspective: 'bool' }, run: (p) => { this.camera.persp = p.perspective !== false; this.camera.update(); this.requestRender(); return { ok: true }; } });
      R('view.camera', {
        title: 'Cámara', params: { target: '[x,y,z]', distance: 'm', yaw: 'grados', pitch: 'grados' },
        run: (p) => {
          const c = this.camera;
          if (p.target) c.target = p.target;
          if (p.distance) c.dist = p.distance;
          if (p.yaw !== undefined) c.yaw = p.yaw * Math.PI / 180;
          if (p.pitch !== undefined) c.pitch = p.pitch * Math.PI / 180;
          c.update(); this.requestRender();
          return { ok: true, camera: c.toJSON() };
        }
      });
      R('tool.set', { title: 'Activar herramienta', params: { id: Object.keys(this.tools).join(' | ') }, run: (p) => (this.setTool(p.id) ? { ok: true } : { ok: false, error: 'Herramienta desconocida' }) });
      R('app.snapshot', { title: 'Captura (PNG en base64)', run: () => ({ ok: true, png: this.snapshot() }) });
    }

    /* ---------------- API pública (agentes y pruebas) ---------------- */

    exposeAPI() {
      const app = this;
      root.dedalo = {
        version: D.VERSION,
        execute: (name, params, options) => {
          const previous = app.doc.execution;
          const opts = options || {};
          app.doc.execution = { agent: typeof opts.agent === 'string' && opts.agent.trim() ? opts.agent.trim() : 'external',
            channel: typeof opts.channel === 'string' && opts.channel.trim() ? opts.channel.trim() : 'api' };
          try { return app.exec(name, params, true); }
          finally { app.doc.execution = previous; }
        },
        commands: () => app.doc.commandList(),
        model: () => app.doc.model.toJSON(),
        scene: () => app.doc.execute('scene.get'),
        snapshot: () => app.snapshot(),
        // ganchos para pruebas automáticas: eventos sintéticos en coordenadas del visor
        test: {
          app,
          down: (x, y, o) => app.pointerDown(Object.assign({ x, y, button: 0, buttons: 1, shift: false, ctrl: false, alt: false }, o || {})),
          move: (x, y, o) => app.pointerMove(Object.assign({ x, y, button: 0, buttons: 0, shift: false, ctrl: false, alt: false }, o || {})),
          up: (x, y, o) => app.pointerUp(Object.assign({ x, y, button: 0, buttons: 0, shift: false, ctrl: false, alt: false }, o || {})),
          click(x, y, o) { this.move(x, y, o); this.down(x, y, o); this.up(x, y, o); },
          key: (key, o) => app.keyDown(Object.assign({ key, shift: false, ctrl: false, alt: false }, o || {})),
          type(text) { for (const ch of String(text)) this.key(ch); this.key('Enter'); },
          toScreen: (p) => { const s = app.camera.project(p); return [s.x, s.y]; },
          render: () => app.renderNow(),
          state: () => ({ tool: app.tool.id, toolState: app.tool.state, stats: app.doc.model.stats(), sel: app.doc.selectionItems(), hint: app.tool.hint() })
        }
      };
    }
  }

  D.App = App;
  window.addEventListener('DOMContentLoaded', () => {
    try { new App(); }
    catch (e) { console.error(e); }
  });
})(typeof window !== 'undefined' ? window : globalThis);
