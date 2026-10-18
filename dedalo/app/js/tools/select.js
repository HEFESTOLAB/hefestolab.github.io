/*
 * Dédalo — Seleccionar, Borrar, Pintar, Cinta métrica, Cota, Texto y navegación.
 */
(function (root) {
  'use strict';
  const D = root.DEDALO;
  const { V, geom, Tool, units, drawSnap } = D;
  const { fmtLen, fmtArea, fmtNum } = units;

  // Entidad bajo el ratón para seleccionar: anotación > arista > guía > cara.
  function pick(app, x, y) {
    const a = app.overlay.annotAt(x, y);
    if (a) return { annot: a };
    const pk = app.inference.picker;
    const e = pk.nearEdges(x, y, 6)[0];
    if (e && pk.visible(e.p)) return { edge: e.eid };
    const ray = app.camera.ray(x, y);
    for (const g of app.doc.model.annots.values()) {
      if (g.kind !== 'guideLine' || !app.renderer.opts.showGuides) continue;
      const c = geom.lineLineClosest(g.p, g.dir, ray.o, ray.d);
      if (!c || c.t <= 0) continue;
      const s = app.camera.project(c.p1);
      if (Math.hypot(s.x - x, s.y - y) < 5) return { annot: g.id };
    }
    const f = pk.faceAt(x, y);
    if (f) return { face: f.fid, p: f.p };
    return null;
  }

  function expandCurves(model, edges) {
    const out = new Set(edges);
    for (const eid of edges) {
      const e = model.edges.get(eid);
      if (e && e.curve) for (const x of model.curveEdges(e.curve)) out.add(x);
    }
    return [...out];
  }

  /* ================= Seleccionar ================= */

  class SelectTool extends Tool {
    constructor(app) { super(app); this.id = 'select'; }
    reset() { this.state = 0; this.down = null; this.box = null; this.hoverEnt = null; this._hk = null; }
    cursor() { return 'default'; }
    hint() { return 'Clic o arrastre selecciona (→ ventana, ← cruce). Ctrl añade · Mayús alterna · doble clic: entrar en grupo/componente o seleccionar cara y aristas · Esc: salir al padre.'; }
    hover() { return this.hoverEnt ? { face: this.hoverEnt.face, edge: this.hoverEnt.edge, annot: this.hoverEnt.annot } : null; }
    mode(ev) { return ev.ctrl && ev.shift ? 'remove' : ev.ctrl ? 'add' : ev.shift ? 'toggle' : 'set'; }
    onDown(ev) {
      if (ev.button !== 0) return;
      this.down = { x: ev.x, y: ev.y, clicks: ev.clicks || 1 };
      this.box = null;
    }
    onMove(ev) {
      if (this.down && ev.buttons & 1) {
        if (Math.hypot(ev.x - this.down.x, ev.y - this.down.y) > 4) {
          this.box = { x0: this.down.x, y0: this.down.y, x1: ev.x, y1: ev.y };
          this.hoverEnt = null;
          this.app.requestRender();
        }
        return;
      }
      const h = pick(this.app, ev.x, ev.y);
      const key = h ? JSON.stringify([h.face, h.edge, h.annot]) : '';
      if (key !== this._hk) { this._hk = key; this.hoverEnt = h; this.app.requestRender(); }
    }
    onUp(ev) {
      if (!this.down) return;
      const m = this.model;
      const mode = this.mode(ev);
      if (this.box) {
        const sel = this.boxSelect(this.box);
        this.doc.select(sel, mode === 'set' ? 'set' : mode);
        this.box = null; this.down = null;
        this.app.requestRender();
        return;
      }
      const clicks = this.down.clicks;
      this.down = null;
      const h = pick(this.app, ev.x, ev.y);
      if (!h) { if (mode === 'set') this.doc.clearSelection(); this.app.requestRender(); return; }
      let items = { faces: [], edges: [], annots: [], nodes: [] };
      const node = this.doc.nodeForHit(h);
      if (node) items.nodes = [node];
      else if (h.annot) items.annots = [h.annot];
      else if (clicks >= 3) {
        const c = m.connected(h.face ? [h.face] : [], h.edge ? [h.edge] : []);
        items = { faces: c.faces, edges: c.edges, annots: [] };
      } else if (clicks === 2) {
        if (h.face) items = { faces: [h.face], edges: m.faceEdges(m.faces.get(h.face)), annots: [] };
        else if (h.edge) items = { faces: [...m.eFaces.get(h.edge)], edges: expandCurves(m, [h.edge]), annots: [] };
      } else {
        if (h.face) items.faces = [h.face];
        if (h.edge) items.edges = expandCurves(m, [h.edge]);
      }
      this.doc.select(items, clicks > 1 && mode === 'set' ? 'set' : mode);
      this.app.requestRender();
    }
    boxSelect(b) {
      const m = this.model, cam = this.cam;
      const crossing = b.x1 < b.x0;
      const x0 = Math.min(b.x0, b.x1), x1 = Math.max(b.x0, b.x1), y0 = Math.min(b.y0, b.y1), y1 = Math.max(b.y0, b.y1);
      const scr = new Map();
      for (const v of m.verts.values()) scr.set(v.id, cam.project(v.p));
      const inside = (s) => !s.behind && s.x >= x0 && s.x <= x1 && s.y >= y0 && s.y <= y1;
      const segHits = (sa, sb) => {
        if (inside(sa) || inside(sb)) return true;
        if (sa.behind || sb.behind) return false;
        const rect = [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
        for (let i = 0; i < 4; i++) if (segX([sa.x, sa.y], [sb.x, sb.y], rect[i], rect[(i + 1) % 4])) return true;
        return false;
      };
      const edges = [], faces = [], annots = [];
      for (const e of m.edges.values()) {
        const sa = scr.get(e.a), sb = scr.get(e.b);
        if (crossing ? segHits(sa, sb) : (inside(sa) && inside(sb))) edges.push(e.id);
      }
      for (const f of m.faces.values()) {
        const vs = m.faceVerts(f);
        if (!crossing) { if (vs.every((v) => inside(scr.get(v)))) faces.push(f.id); continue; }
        let hit = false;
        for (const eid of m.faceEdges(f)) { const e = m.edges.get(eid); if (segHits(scr.get(e.a), scr.get(e.b))) { hit = true; break; } }
        if (!hit) {
          const poly = f.loops[0].map((v) => [scr.get(v).x, scr.get(v).y]);
          if (geom.pointInPoly2([(x0 + x1) / 2, (y0 + y1) / 2], poly) > 0) hit = true;
        }
        if (hit) faces.push(f.id);
      }
      for (const h of this.app.overlay.hits || []) {
        const cx = h.x + h.w / 2, cy = h.y + h.h / 2;
        if (cx >= x0 && cx <= x1 && cy >= y0 && cy <= y1) annots.push(h.id);
      }
      // Las primitivas proyectadas de un hijo se seleccionan como un objeto atómico.
      // Una ventana debe contener todas sus posiciones; un cruce basta con tocarlo.
      const touched = new Set();
      const loose = (kind, ids) => ids.filter((id) => {
        const node = this.doc.nodeForHit({ [kind]: id });
        if (!node) return true;
        touched.add(node);
        return false;
      });
      const looseFaces = loose('face', faces), looseEdges = loose('edge', edges), looseAnnots = loose('annot', annots);
      const nodes = [];
      if (crossing) nodes.push(...touched);
      else {
        const contained = new Map();
        const note = (node, yes) => { if (node) contained.set(node, contained.has(node) ? contained.get(node) && yes : yes); };
        for (const v of m.verts.values()) note(this.doc.nodeForHit({ vert: v.id }), inside(scr.get(v.id)));
        for (const hit of this.app.overlay.hits || []) {
          const node = this.doc.nodeForHit({ annot: hit.id });
          note(node, hit.x >= x0 && hit.y >= y0 && hit.x + hit.w <= x1 && hit.y + hit.h <= y1);
        }
        for (const node of touched) if (contained.get(node)) nodes.push(node);
      }
      return { faces: looseFaces, edges: looseEdges, annots: looseAnnots, nodes };
    }
    onDouble(ev) {
      const hit = pick(this.app, ev.x, ev.y);
      const node = hit && this.doc.nodeForHit(hit);
      if (node) {
        // onDouble llega en pointerdown. Se consume el pointerup pendiente antes
        // de cambiar de proyección: sus identificadores pertenecen al padre.
        this.down = null;
        this.box = null;
        this.app.ui.enterNode(node);
        return;
      }
      // editar un texto con doble clic
      const a = this.app.overlay.annotAt(ev.x, ev.y);
      if (!a) return;
      const an = this.model.annots.get(a);
      if (an && an.kind === 'text') {
        this.app.promptText(ev.x, ev.y, an.text, (t) => { if (t !== null) this.doc.execute('annot.edit', { id: a, text: t }); });
      }
    }
    drawOverlay(ov) { if (this.box) ov.rect2(this.box.x0, this.box.y0, this.box.x1, this.box.y1, this.box.x1 < this.box.x0); }
  }

  function segX(a, b, c, d) {
    const o = (p, q, r) => (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]);
    const d1 = o(a, b, c), d2 = o(a, b, d), d3 = o(c, d, a), d4 = o(c, d, b);
    return ((d1 > 0) !== (d2 > 0)) && ((d3 > 0) !== (d4 > 0));
  }

  /* ================= Borrar ================= */

  class EraserTool extends Tool {
    constructor(app) { super(app); this.id = 'erase'; }
    reset() { this.state = 0; this.marked = new Set(); this.markedA = new Set(); this.hoverEdge = null; this.hoverAnnot = null; }
    cursor() { return 'crosshair'; }
    hint() { return 'Haz clic o arrastra sobre aristas, guías, cotas o textos para borrarlos. Ctrl: suavizar en lugar de borrar.'; }
    hover() { return { edge: this.hoverEdge, annot: this.hoverAnnot }; }
    target(x, y) {
      const h = pick(this.app, x, y);
      if (!h) return null;
      if (h.annot) return { annot: h.annot };
      if (h.edge) return { edge: h.edge };
      return null;
    }
    mark(t) {
      if (!t) return;
      if (t.edge) for (const e of expandCurves(this.model, [t.edge])) this.marked.add(e);
      if (t.annot) this.markedA.add(t.annot);
    }
    onDown(ev) {
      if (ev.button !== 0) return;
      this.state = 1;
      this.marked = new Set(); this.markedA = new Set();
      this.mark(this.target(ev.x, ev.y));
      this.app.requestRender();
    }
    onMove(ev) {
      const t = this.target(ev.x, ev.y);
      this.hoverEdge = t && t.edge ? t.edge : null;
      this.hoverAnnot = t && t.annot ? t.annot : null;
      if (this.state === 1) this.mark(t);
      this.app.requestRender();
    }
    onUp(ev) {
      if (this.state !== 1) return;
      this.state = 0;
      const edges = [...this.marked], annots = [...this.markedA];
      this.marked = new Set(); this.markedA = new Set();
      if (!edges.length && !annots.length) return;
      let r;
      if (ev.ctrl) r = this.doc.execute('edges.soften', { edges, soft: true });
      else r = this.doc.execute('entities.erase', { edges, annots, faces: [] });
      if (!r.ok) this.app.toast(r.error, 'error');
      this.app.requestRender();
    }
    drawOverlay(ov) {
      for (const eid of this.marked) {
        const e = this.model.edges.get(eid);
        if (e) ov.line3(this.model.P(e.a), this.model.P(e.b), '#e06a1f', 3);
      }
    }
  }

  /* ================= Pintar ================= */

  class PaintTool extends Tool {
    constructor(app) { super(app); this.id = 'paint'; }
    reset() { this.state = 0; this.hoverFace = null; }
    cursor() { return 'cell'; }
    hint() {
      const m = this.app.currentMaterial;
      return 'Haz clic en una cara para pintarla con «' + (m ? m.name : 'Por defecto') + '». Alt: tomar material · Ctrl: caras conectadas iguales · Mayús: todas las iguales.';
    }
    hover() { return { face: this.hoverFace }; }
    onMove(ev) { const h = this.inf.picker.faceAt(ev.x, ev.y); this.hoverFace = h ? h.fid : null; this.app.requestRender(); }
    onDown(ev) {
      if (ev.button !== 0) return;
      const h = this.inf.picker.faceAt(ev.x, ev.y);
      if (!h) return;
      const m = this.model;
      const f = m.faces.get(h.fid);
      if (ev.alt) {
        const mat = f.mat ? m.materials.get(f.mat) : null;
        this.app.setMaterial(mat ? { name: mat.name, color: mat.color, opacity: mat.opacity } : null);
        return;
      }
      let faces = [h.fid];
      if (this.doc.sel.faces.has(h.fid)) faces = [...this.doc.sel.faces];
      else if (ev.shift) faces = [...m.faces.values()].filter((g) => g.mat === f.mat).map((g) => g.id);
      else if (ev.ctrl) faces = m.connected([h.fid], []).faces.filter((id) => m.faces.get(id).mat === f.mat);
      const cm = this.app.currentMaterial;
      const r = this.doc.execute('faces.paint', { faces, color: cm ? cm.color : null, name: cm ? cm.name : null, opacity: cm ? cm.opacity : 1 });
      if (!r.ok) this.app.toast(r.error, 'error');
    }
  }

  /* ================= Cinta métrica ================= */

  class TapeTool extends Tool {
    constructor(app) { super(app); this.id = 'tape'; this.guides = true; }
    reset() { this.state = 0; this.start = null; this.snap = null; this.edgeDir = null; this.edgeLine = null; this.lock = null; this.planes = []; this.plane = null; this.defaultDir = null; this.direction = null; this.pointer = null; this.skipVerts = null; }
    cursor() { return 'crosshair'; }
    hint() {
      const g = this.guides ? 'crea guías' : 'solo mide';
      return this.state === 0 ? 'Haz clic en un punto para medir (desde una arista se crea una guía paralela). Ctrl: ' + (this.guides ? 'solo medir' : 'crear guías') + ' · ahora ' + g + '.'
        : 'Haz clic en el segundo punto o escribe la distancia. Flechas: X/Y/Z · Mayús: bloquear dirección. Sin mover: ' + (this.edgeDir ? 'perpendicular a la arista.' : 'dirección inicial sobre el plano.');
    }
    vcbLabel() { return 'Longitud'; }
    onMove(ev) {
      this.pointer = { x: ev.x, y: ev.y };
      if (this.state === 0) this.snap = this.inf.infer(ev.x, ev.y, { preferGuides: true });
      else {
        if (this.edgeDir && !this.lock) this.choosePlane(ev);
        const plane = this.lock ? null : this.plane;
        this.snap = this.inf.infer(ev.x, ev.y, { start: this.start, plane, onPlaneOnly: true, preferGuides: true, skipStartPoint: true, skipVerts: this.skipVerts,
          lockDir: this.lock && this.lock.dir, lockColor: this.lock && this.lock.color, lockLabel: this.lock && this.lock.label });
        if (this.edgeDir) {
          let delta = V.sub(this.snap.p, this.start);
          // Near an edge-on work plane, a ray cannot determine the distance.
          // Use the projected perpendicular direction, never the ground plane.
          if (!this.lock && this.plane && Math.abs(V.dot(this.plane.n, this.cam.ray(ev.x, ev.y).d)) < 1e-5 && ['free', 'axis', 'locked'].includes(this.snap.type)) {
            const dir = this.perpendicularIn(this.plane), a = this.cam.project(this.start), step = Math.max(1e-8, this.cam.pixelSize(this.start)) * 80;
            const b = this.cam.project(V.add(this.start, V.scale(dir, step))), dx = b.x - a.x, dy = b.y - a.y, span2 = dx * dx + dy * dy;
            delta = V.scale(dir, span2 > 1e-8 ? ((ev.x - a.x) * dx + (ev.y - a.y) * dy) * step / span2 : 0);
          }
          delta = V.sub(delta, V.scale(this.edgeDir, V.dot(delta, this.edgeDir)));
          this.snap = Object.assign({}, this.snap, { p: V.add(this.start, delta) });
        }
        const direction = V.sub(this.snap.p, this.start);
        if (V.len(direction) > 1e-8) this.direction = V.norm(direction);
        this.app.setVCB(fmtLen(this.measure(this.snap.p)));
      }
      this.app.requestRender();
    }
    perpendicularIn(plane) { return V.norm(V.cross(plane.n, this.edgeDir)); }
    choosePlane(ev) {
      if (!this.planes.length) return;
      const start = this.cam.project(this.start), gesture = [ev.x - start.x, ev.y - start.y], length = Math.hypot(...gesture), step = Math.max(1e-8, this.cam.pixelSize(this.start)) * 80;
      if (length < 2) return;
      let best = null, previous = null;
      for (const plane of this.planes) {
        const dir = this.perpendicularIn(plane), b = this.cam.project(V.add(this.start, V.scale(dir, step))), dx = b.x - start.x, dy = b.y - start.y, span = Math.hypot(dx, dy);
        if (b.behind || span < 0.1) continue;
        const score = Math.abs((gesture[0] * dx + gesture[1] * dy) / (length * span));
        const candidate = { plane, score, dir };
        if (plane === this.plane) previous = candidate;
        if (!best || score > best.score) best = candidate;
      }
      const chosen = previous && best && best.score - previous.score < 0.06 ? previous : best;
      if (chosen) { this.plane = chosen.plane; this.defaultDir = chosen.dir; }
    }
    initializePlane() {
      const add = (n) => {
        if (!n || (this.edgeDir && Math.abs(V.dot(n, this.edgeDir)) > 1e-6)) return;
        const normal = V.norm(n), plane = { n: normal, d: V.dot(normal, this.start) };
        if (!this.planes.some(p => Math.abs(V.dot(p.n, plane.n)) > 1 - 1e-8)) this.planes.push(plane);
      };
      const hit = this.snap.faceHit || (this.inf.picker && this.inf.picker.faceAt(this.pointer.x, this.pointer.y));
      if (hit && this.model.faces.has(hit.fid)) add(this.model.faces.get(hit.fid).n);
      if (this.edgeLine) for (const fid of this.model.eFaces.get(this.edgeLine) || []) add(this.model.faces.get(fid).n);
      if (!this.planes.length) {
        if (this.edgeDir) {
          let n = V.sub(this.cam.forward(), V.scale(this.edgeDir, V.dot(this.cam.forward(), this.edgeDir)));
          if (V.len(n) < 1e-6) n = V.cross(this.edgeDir, this.cam.right);
          if (V.len(n) < 1e-6) n = V.perp(this.edgeDir);
          add(n);
        } else add(D.toolUtil.drawingPlane(this.app, this.snap).n);
      }
      this.plane = this.planes[0];
      if (this.edgeDir) this.defaultDir = this.perpendicularIn(this.plane);
      else {
        const candidates = [[1, 0, 0], [0, 1, 0], [0, 0, 1]].map(dir => V.sub(dir, V.scale(this.plane.n, V.dot(dir, this.plane.n))));
        this.defaultDir = V.norm(candidates.find(dir => V.len(dir) > 0.5));
      }
    }
    measure(p) {
      if (this.edgeDir) {
        const d = V.sub(p, this.start);
        return V.len(V.sub(d, V.scale(this.edgeDir, V.dot(d, this.edgeDir))));
      }
      return V.dist(p, this.start);
    }
    onDown(ev) {
      if (ev.button !== 0) return;
      if (this.state === 0) {
        this.pointer = { x: ev.x, y: ev.y };
        this.snap = this.inf.infer(ev.x, ev.y, { preferGuides: true });
        this.start = this.snap.p.slice();
        this.edgeDir = null;
        if (this.snap.edge && this.model.edges.has(this.snap.edge)) {
          const e = this.model.edges.get(this.snap.edge);
          this.edgeDir = V.norm(V.sub(this.model.P(e.b), this.model.P(e.a)));
          this.edgeLine = e.id; this.skipVerts = new Set([e.a, e.b]);
        } else if (this.snap.guideDir) this.edgeDir = V.norm(this.snap.guideDir);
        this.initializePlane();
        this.direction = null;
        if (this.inf.resetTracking) this.inf.resetTracking();
        this.app.setVCB('0');
        this.state = 1;
        return;
      }
      this.onMove(ev);
      this.place(this.snap.p);
    }
    place(p) {
      const dist = this.measure(p);
      if (this.guides && dist > 1e-6) {
        const params = this.edgeDir ? { point: p, direction: this.edgeDir } : { point: p, from: this.start };
        const result = this.doc.execute('guide.add', params);
        if (!result.ok) { this.app.toast(result.error, 'error'); return; }
        if (this.app.renderer && this.app.renderer.opts) this.app.renderer.opts.showGuides = true;
      }
      this.app.toast('Distancia: ' + fmtLen(dist), 'info');
      this.reset();
      this.app.requestRender();
    }
    onVCB(text) {
      if (this.state !== 1 || !this.snap) return false;
      const L = units.parseLen(text);
      if (L === null) return false;
      let dir = this.direction || (this.lock && this.lock.dir) || this.defaultDir;
      if (this.edgeDir) dir = V.sub(dir, V.scale(this.edgeDir, V.dot(dir, this.edgeDir)));
      if (V.len(dir) < 1e-9) { this.app.toast('Elige una dirección perpendicular con las flechas o mueve el ratón.', 'info'); return true; }
      this.place(V.add(this.start, V.scale(V.norm(dir), L)));
      return true;
    }
    onKey(ev) {
      if (ev.key === 'Control' || ev.key === 'Meta') { this.guides = !this.guides; this.app.refreshStatus(); return true; }
      if (this.state !== 1) return false;
      const axis = D.lockFromKey(ev.key);
      if (axis) {
        if (this.edgeDir && V.len(V.cross(axis.dir, this.edgeDir)) < 1e-6) { this.app.toast('Ese eje es paralelo a la arista; elige otro para separar la guía.', 'info'); return true; }
        this.lock = this.lock && this.lock.label === axis.label ? null : axis;
        this.direction = this.lock ? this.lock.dir.slice() : null;
        if (this.pointer) this.onMove(this.pointer);
        return true;
      }
      if (ev.key === 'Shift') {
        if (!this.lock) this.lock = { dir: (this.direction || this.defaultDir).slice(), color: '#555', label: 'Dirección bloqueada', shift: true };
        return true;
      }
      return false;
    }
    onKeyUp(ev) { if (ev.key === 'Shift' && this.lock && this.lock.shift) { this.lock = null; if (this.pointer) this.onMove(this.pointer); return true; } return false; }
    drawOverlay(ov) {
      if (this.state === 1 && this.snap) {
        const p = this.snap.p;
        if (this.edgeDir) {
          const R = this.cam.dist * 3;
          ov.line3(V.add(p, V.scale(this.edgeDir, -R)), V.add(p, V.scale(this.edgeDir, R)), '#6b6f76', 1, 5);
          const d = V.sub(p, this.start);
          const foot = V.add(this.start, V.scale(this.edgeDir, V.dot(d, this.edgeDir)));
          ov.line3(foot, p, '#1c1e21', 1.4, 3);
        } else ov.line3(this.start, p, '#1c1e21', 1.4, 3);
        const s = this.cam.project(p);
        ov.tip(s.x, s.y, fmtLen(this.measure(p)));
        ov.marker(p, this.snap.type === 'free' ? 'guide' : this.snap.type, this.snap.color);
        return;
      }
      drawSnap(ov, this.snap);
    }
  }

  /* ================= Cota ================= */

  class DimTool extends Tool {
    constructor(app) { super(app); this.id = 'dim'; }
    reset() { this.state = 0; this.a = null; this.b = null; this.off = null; this.offB = null; this.snap = null; this.axis = null; this.offsetAxis = null; this.aligned = false; this.pointer = null; this.editId = null; }
    cursor() { return 'crosshair'; }
    hint() {
      if (this.state < 2) return ['Haz clic en el primer punto (o en una arista para acotarla entera).', 'Haz clic en el segundo punto.'][this.state];
      return 'Separa la cota y haz clic. ' + (this.aligned ? 'Alineada: distancia real.' : 'Eje ' + D.DimensionGeometry.axes[this.axis].toUpperCase() + '.') + ' Derecha: X · Izquierda: Y · Arriba: Z · Tab: cambiar eje · Mantén Mayús: alineada.';
    }
    preparePlacement() {
      this.axis = D.DimensionGeometry.dominantAxis(this.a, this.b);
      this.offsetAxis = null; this.off = [0, 0, 0]; this.offB = [0, 0, 0]; this.state = 2;
      this.updatePlacement();
    }
    edit(annotation) {
      this.reset();
      if (!annotation || annotation.kind !== 'dim' || V.dist(annotation.a, annotation.b) < 1e-6) return false;
      this.editId = annotation.id; this.a = annotation.a.slice(); this.b = annotation.b.slice();
      const old = D.DimensionGeometry.points(annotation), position = this.cam.project(V.mid(old.a, old.b));
      this.pointer = { x: position.x, y: position.y }; this.preparePlacement();
      this.app.requestRender(); return true;
    }
    updatePlacement() {
      if (this.state !== 2 || !this.pointer) return;
      const layout = D.DimensionGeometry.place(this.cam, this.a, this.b, this.axis, this.pointer, this.aligned, this.offsetAxis);
      this.off = layout.off; this.offB = layout.offB; this.offsetAxis = layout.offsetAxis;
      this.app.setVCB(fmtLen(layout.length)); this.app.requestRender();
    }
    onMove(ev) {
      this.pointer = { x: ev.x, y: ev.y };
      if (typeof ev.shift === 'boolean') this.aligned = ev.shift;
      if (this.state < 2) this.snap = this.inf.infer(ev.x, ev.y, this.state === 1 ? { start: this.a } : {});
      else this.updatePlacement();
      this.app.requestRender();
    }
    onDown(ev) {
      if (ev.button !== 0) return;
      this.onMove(ev);
      if (this.state === 0) {
        if (this.snap.type === 'onEdge' && this.snap.edge) {
          const e = this.model.edges.get(this.snap.edge);
          this.a = this.model.P(e.a).slice(); this.b = this.model.P(e.b).slice();
          this.preparePlacement();
          return;
        }
        this.a = this.snap.p.slice(); this.state = 1; return;
      }
      if (this.state === 1) {
        if (V.dist(this.snap.p, this.a) < 1e-6) return;
        this.b = this.snap.p.slice(); this.preparePlacement(); return;
      }
      const params = { a: this.a, b: this.b, offset: this.off, offsetB: this.offB };
      if (this.editId !== null) params.id = this.editId;
      const result = this.doc.execute(this.editId === null ? 'dim.add' : 'dim.update', params);
      if (!result.ok) { this.app.toast(result.error, 'error'); return; }
      this.reset();
    }
    onKey(ev) {
      if (ev.key === 'Shift') { this.aligned = true; this.updatePlacement(); return true; }
      if (this.state !== 2) return false;
      const choices = D.DimensionGeometry.validAxes(this.a, this.b);
      const arrows = { ArrowRight: 0, ArrowLeft: 1, ArrowUp: 2 };
      let axis;
      if (ev.key === 'Tab') axis = choices[(choices.indexOf(this.axis) + 1) % choices.length];
      else if (Object.prototype.hasOwnProperty.call(arrows, ev.key)) axis = arrows[ev.key];
      else return false;
      if (!choices.includes(axis)) { this.app.toast('Los puntos no tienen longitud en el eje ' + D.DimensionGeometry.axes[axis].toUpperCase() + '.', 'info'); return true; }
      this.axis = axis; this.offsetAxis = null; this.updatePlacement(); return true;
    }
    onKeyUp(ev) {
      if (ev.key !== 'Shift') return false;
      this.aligned = false; this.updatePlacement(); return true;
    }
    drawOverlay(ov) {
      if (this.state === 1) ov.line3(this.a, this.snap.p, '#1c1e21', 1.2, 3);
      if (this.state === 2) {
        ov.dimension({ a: this.a, b: this.b, off: this.off, offB: this.offB }, '#1c1e21', { preview: true });
        return;
      }
      drawSnap(ov, this.snap);
    }
  }

  /* ================= Texto ================= */

  class TextTool extends Tool {
    constructor(app) { super(app); this.id = 'text'; }
    reset() { this.state = 0; this.anchor = null; this.snap = null; this.labelPos = null; this.defText = ''; }
    cursor() { return 'text'; }
    hint() { return this.state === 0 ? 'Haz clic sobre un elemento para anclar el texto (en una cara propone su área; en una arista, su longitud).' : 'Haz clic donde quieras el rótulo y escribe el texto.'; }
    onMove(ev) {
      if (this.state === 0) this.snap = this.inf.infer(ev.x, ev.y, {});
      else {
        const fwd = this.cam.forward();
        const ray = this.cam.ray(ev.x, ev.y);
        const t = geom.rayPlane(ray.o, ray.d, { n: fwd, d: V.dot(fwd, this.anchor) });
        if (t !== null) this.labelPos = V.add(ray.o, V.scale(ray.d, t));
      }
      this.app.requestRender();
    }
    onDown(ev) {
      if (ev.button !== 0) return;
      this.onMove(ev);
      if (this.state === 0) {
        const s = this.snap;
        this.anchor = s.p.slice();
        const m = this.model;
        if (s.vertex) this.defText = s.p.map((x) => fmtNum(x, 2)).join('; ');
        else if (s.edge && m.edges.has(s.edge)) this.defText = fmtLen(m.edgeLen(s.edge));
        else if (s.face || (s.faceHit && s.type === 'onFace')) this.defText = fmtArea(m.faceArea(s.face || s.faceHit.fid));
        else this.defText = 'Texto';
        this.state = 1;
        this.labelPos = this.anchor;
        return;
      }
      const anchor = this.anchor, off = V.sub(this.labelPos || anchor, anchor);
      const sc = this.cam.project(this.labelPos || anchor);
      const def = this.defText;
      this.reset();
      this.app.promptText(sc.x, sc.y, def, (t) => {
        if (t === null || t === '') return;
        this.doc.execute('text.add', { point: anchor, offset: V.len(off) > 1e-9 ? off : null, text: t });
      });
    }
    drawOverlay(ov) {
      if (this.state === 1 && this.labelPos) {
        ov.line3(this.anchor, this.labelPos, '#1c1e21', 1);
        const s = this.cam.project(this.labelPos);
        ov.label2(s.x, s.y, this.defText);
        return;
      }
      drawSnap(ov, this.snap);
    }
  }

  /* ================= Navegación ================= */

  class OrbitTool extends Tool {
    constructor(app) { super(app); this.id = 'orbit'; }
    cursor() { return this.drag ? 'grabbing' : 'grab'; }
    hint() { return 'Arrastra para orbitar. Mayús: desplazar. Rueda: zoom.'; }
    onDown(ev) { this.drag = { x: ev.x, y: ev.y, pan: ev.shift }; this.pivot = this.app.pivotAt(ev.x, ev.y); }
    onMove(ev) {
      if (!this.drag || !(ev.buttons & 1)) { this.drag = null; return; }
      const dx = ev.x - this.drag.x, dy = ev.y - this.drag.y;
      if (this.drag.pan || ev.shift) this.cam.pan(dx, dy, this.pivot);
      else this.cam.orbit(dx, dy, this.pivot);
      this.drag.x = ev.x; this.drag.y = ev.y;
      this.app.requestRender();
    }
    onUp() { this.drag = null; }
  }
  class PanTool extends Tool {
    constructor(app) { super(app); this.id = 'pan'; }
    cursor() { return 'move'; }
    hint() { return 'Arrastra para desplazar la vista.'; }
    onDown(ev) { this.drag = { x: ev.x, y: ev.y }; this.pivot = this.app.pivotAt(ev.x, ev.y); }
    onMove(ev) {
      if (!this.drag || !(ev.buttons & 1)) { this.drag = null; return; }
      this.cam.pan(ev.x - this.drag.x, ev.y - this.drag.y, this.pivot);
      this.drag.x = ev.x; this.drag.y = ev.y;
      this.app.requestRender();
    }
    onUp() { this.drag = null; }
  }
  class ZoomTool extends Tool {
    constructor(app) { super(app); this.id = 'zoom'; }
    cursor() { return 'zoom-in'; }
    hint() { return 'Arrastra arriba/abajo para acercar o alejar. Mayús+Z: ver todo.'; }
    onDown(ev) { this.drag = { x: ev.x, y: ev.y }; this.pivot = this.app.pivotAt(ev.x, ev.y); }
    onMove(ev) {
      if (!this.drag || !(ev.buttons & 1)) { this.drag = null; return; }
      const dy = ev.y - this.drag.y;
      this.cam.zoomAt(Math.pow(1.01, dy), this.pivot);
      this.drag.y = ev.y;
      this.app.requestRender();
    }
    onUp() { this.drag = null; }
  }

  D.tools.SelectTool = SelectTool;
  D.tools.EraserTool = EraserTool;
  D.tools.PaintTool = PaintTool;
  D.tools.TapeTool = TapeTool;
  D.tools.DimTool = DimTool;
  D.tools.TextTool = TextTool;
  D.tools.OrbitTool = OrbitTool;
  D.tools.PanTool = PanTool;
  D.tools.ZoomTool = ZoomTool;
  D.pickForSelect = pick;
})(typeof window !== 'undefined' ? window : globalThis);
