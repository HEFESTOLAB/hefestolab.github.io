/*
 * Dédalo — herramientas de modificación: Empujar/Tirar, Mover, Rotar, Escala y Equidistancia.
 * Todas muestran el resultado en vivo (LivePreview) y confirman con un comando deshacible.
 */
(function (root) {
  'use strict';
  const D = root.DEDALO;
  const { V, geom, Tool, LivePreview, LatestMotion, toolUtil, units, drawSnap, lockFromKey } = D;
  const { fmtLen, fmtNum } = units;

  // Entidad bajo el ratón para Mover/Rotar sin selección previa.
  function pickEntity(app, x, y) {
    const atomic = (hit, fallback) => {
      const node = app.doc.nodeForHit(hit);
      return node ? Object.assign(app.doc.itemsForNode(node), { label: 'Grupo / componente', p: fallback.p }) : fallback;
    };
    const pk = app.inference.picker;
    const v = pk.nearVertices(x, y, 9)[0];
    if (v && pk.visible(v.p)) return atomic({ vert: v.vid }, { verts: [v.vid], label: 'Vértice', p: v.p });
    const e = pk.nearEdges(x, y, 6)[0];
    if (e && pk.visible(e.p)) return atomic({ edge: e.eid }, { edges: [e.eid], label: 'Arista', p: e.p });
    const f = pk.faceAt(x, y);
    if (f) return atomic({ face: f.fid }, { faces: [f.fid], label: 'Cara', p: f.p });
    return null;
  }

  function vertsOfItems(doc, it) {
    const vs = new Set(doc.vertsOf(it));
    for (const v of it.verts || []) vs.add(v);
    return [...vs];
  }
  function facesTouching(model, vids) {
    const s = new Set();
    for (const v of vids) for (const e of model.vEdges.get(v) || []) for (const f of model.eFaces.get(e)) s.add(f);
    return s;
  }

  function baseInference(tool) {
    // A moving preview must never become its own snap target. Keep the real
    // inference engine but let its picker read the immutable starting geometry.
    if (!D.Model || !D.Picker) return tool.inf;
    const inf = Object.create(tool.inf);
    inf.app = { doc: { model: D.Model.fromJSON(tool.preview.base) }, camera: tool.cam, renderer: tool.app.renderer };
    inf.picker = new D.Picker(inf.app);
    inf.tracking = [];
    return inf;
  }

  function signedLength(text, value, direction) {
    // An explicit + or - is absolute; an unsigned length follows the gesture.
    return /^[+-]/.test(text.trim()) ? value : (Math.sign(direction) || 1) * value;
  }

  /* ================= Empujar / Tirar ================= */

  class PushPullTool extends Tool {
    constructor(app) {
      super(app); this.id = 'pushpull'; this.last = null; this.keep = false; this.preview = new LivePreview(app);
      this.motion = new LatestMotion(app, (ev) => this.movePreview(ev));
    }
    reset() {
      if (this.motion) this.motion.cancel();
      if (this.preview) this.preview.end();
      this.state = 0; this.face = null; this.hoverFace = null; this.dist = 0; this.snap = null;
      this.fast = null; this.snapInference = null; this.blocked = null;
    }
    cursor() { return 'crosshair'; }
    hint() {
      const k = this.keep ? ' [Ctrl: crea una cara inicial nueva]' : ' · Ctrl: conservar la cara de partida';
      return this.state === 0 ? 'Haz clic en una cara para empujarla o tirar de ella. Doble clic repite la última distancia.' + k
        : (this.axisDrag === false ? 'Mueve arriba para tirar y abajo para empujar, o escribe la distancia.' : 'Mueve y haz clic, o escribe la distancia. Engancha a un punto para igualar su altura.') + k;
    }
    vcbLabel() { return 'Distancia'; }
    hover() { return this.state === 0 ? { face: this.hoverFace } : null; }
    onMove(ev) {
      if (this.state === 0) {
        const h = this.inf.picker.faceAt(ev.x, ev.y);
        this.hoverFace = h ? h.fid : null;
        this.app.requestRender();
        return;
      }
      this.motion.queue(ev);
    }
    movePreview(ev) {
      if (this.state !== 1) return;
      const n = this.n;
      const s = (this.snapInference || this.inf).infer(ev.x, ev.y, { start: this.start, noFace: true, skipVerts: this.ownVerts });
      let d;
      const snapD = s ? V.dot(V.sub(s.p, this.start), n) : 0;
      // Coplanar centers and the origin must not repeatedly pin the moving face
      // to its departure plane while the pointer is trying to leave it.
      if (s && Math.abs(snapD) > 1e-6 && (s.type === 'endpoint' || s.type === 'midpoint' || s.type === 'onEdge' || s.type === 'guide' || s.type === 'center')) {
        d = snapD;
        this.snap = s;
      } else {
        const ray = this.cam.ray(ev.x, ev.y);
        const c = this.axisDrag ? geom.lineLineClosest(this.start, n, ray.o, ray.d) : null;
        const offset = [ev.x - this.dragStart[0], ev.y - this.dragStart[1]];
        d = c && Number.isFinite(c.s) ? c.s : (offset[0] * this.screenAxis[0] + offset[1] * this.screenAxis[1]) * this.worldPerPixel;
        this.snap = null;
      }
      this.apply(d);
    }
    apply(d) {
      if (!Number.isFinite(d)) return;
      this.dist = d;
      const keep = this.keep;
      const fid = this.face;
      let r;
      if (this.fast && !keep) r = this.applyFast(d);
      else r = this.preview.apply((m) => m.pushPull(fid, d, { keep }));
      this.blocked = r && r.ok === false ? r.error : null;
      this.app.setVCB(fmtLen(d));
    }
    prepareFast(f) {
      const m = this.model;
      const ids = m.faceVerts(f), own = new Set(ids);
      const points = new Map(ids.map(id => [id, m.P(id).slice()]));
      if (m._canStretch(f)) {
        const limits = [];
        for (const id of ids) for (const eid of m.vEdges.get(id)) {
          const edge = m.edges.get(eid), other = edge.a === id ? edge.b : edge.a;
          if (!own.has(other)) {
            const height = V.dot(V.sub(m.P(other), m.P(id)), this.n);
            if (Math.abs(height) >= D.TOL.point) limits.push(height);
          }
        }
        return { mode: 'stretch', ids, points, limits };
      }
      // Only a wholly isolated face can extrude without interaction with other
      // faces. Cutouts/recesses retain the exact topology path on each frame.
      const boundary = m.faceEdges(f);
      if (m.faces.size === 1 && m.edges.size === boundary.length && m.verts.size === ids.length && boundary.every(id => m.eFaces.get(id).size === 1)) return { mode: 'isolated', sign: 0 };
      return null;
    }
    applyFast(d) {
      const fast = this.fast;
      if (fast.mode === 'stretch') {
        if (fast.limits.some(h => Math.sign(h - d) !== Math.sign(h) || Math.abs(h - d) < D.TOL.point)) {
          this.preview.restore(); this.app.requestRender();
          return { ok: false, error: 'La cara no puede atravesar la geometría que tiene enfrente.' };
        }
      } else {
        if (Math.abs(d) < D.TOL.point) { this.preview.restore(); fast.sign = 0; this.app.requestRender(); return { ok: true }; }
        const sign = Math.sign(d);
        if (!this.preview.applied || fast.sign !== sign) {
          const r = this.preview.apply(m => m.pushPull(this.face, sign, { keep: false }));
          if (!r || !r.ok) return r;
          const m = this.model, cap = m.faces.get(r.face);
          fast.ids = m.faceVerts(cap);
          fast.points = new Map(fast.ids.map(id => [id, V.sub(m.P(id), V.scale(this.n, sign))]));
          fast.sign = sign;
        }
      }
      return this.preview.apply(m => {
        // transformVertices' callback receives positions only, so use the saved
        // vertex IDs to apply absolute positions without accumulating roundoff.
        for (const id of fast.ids) m.verts.get(id).p = V.add(fast.points.get(id), V.scale(this.n, d));
        m.transformVertices(fast.ids, p => p, { noRepair: true });
        return { ok: true };
      }, true);
    }
    onDown(ev) {
      if (ev.button !== 0) return;
      if (this.state === 0) {
        const h = this.inf.picker.faceAt(ev.x, ev.y);
        if (!h) return;
        if (this.doc.nodeForHit({ face: h.fid })) { this.app.toast('Abre el grupo o componente con doble clic antes de editar sus caras.', 'info'); return; }
        this.face = h.fid;
        const f = this.model.faces.get(h.fid);
        this.n = f.n.slice();
        this.start = h.p;
        this.ownVerts = new Set(this.model.faceVerts(f));
        this.preview.begin();
        this.snapInference = baseInference(this);
        this.fast = this.prepareFast(f);
        this.dragStart = [ev.x, ev.y]; this.dist = 0; this.blocked = null;
        const ps = this.cam.pixelSize(this.start);
        const a = this.cam.project(this.start), b = this.cam.project(V.add(this.start, V.scale(this.n, ps * 100)));
        const dx = b.x - a.x, dy = b.y - a.y, span = Math.hypot(dx, dy);
        const viewSin2 = 1 - Math.pow(V.dot(this.n, this.cam.forward()), 2);
        const raySin2 = 1 - Math.pow(V.dot(this.n, this.cam.ray(ev.x, ev.y).d), 2);
        this.axisDrag = Math.min(viewSin2, raySin2) > 0.04;
        this.screenAxis = this.axisDrag && span > 10 ? [dx / span, dy / span] : [0, -1];
        this.worldPerPixel = this.axisDrag && span > 10 ? ps * 100 / span : ps;
        this.state = 1;
        this.downAt = performance.now();
        return;
      }
      this.onMove(ev); this.flushMotion(); this.commit(this.dist);
    }
    commit(d) {
      this.motion.cancel();
      const face = this.face;
      this.preview.end();
      this.state = 0;
      if (Math.abs(d) < 1e-6) { this.lastFace = face; this.app.requestRender(); return; }
      const r = this.doc.execute('face.pushPull', { face, distance: d, keep: this.keep });
      if (!r.ok) { this.app.toast(r.error, 'error'); }
      else { this.last = { face, distance: d, result: r.face }; }
      this.face = null;
      this.app.requestRender();
    }
    onDouble(ev) {
      if (!this.last) return;
      const h = this.inf.picker.faceAt(ev.x, ev.y);
      if (!h) return;
      this.motion.cancel();
      this.preview.end();
      this.state = 0;
      const r = this.doc.execute('face.pushPull', { face: h.fid, distance: this.last.distance, keep: this.keep });
      if (!r.ok) this.app.toast(r.error, 'error');
      this.app.requestRender();
    }
    onVCB(text) {
      const L = units.parseLen(text);
      if (L === null) return false;
      if (this.state === 1) {
        this.flushMotion(); this.commit(signedLength(text, L, this.dist));
        return true;
      }
      if (this.state === 0 && this.last) {
        this.doc.undo();
        const distance = signedLength(text, L, this.last.distance);
        const r = this.doc.execute('face.pushPull', { face: this.last.face, distance, keep: this.keep });
        if (!r.ok) this.app.toast(r.error, 'error');
        else this.last.distance = distance;
        return true;
      }
      return false;
    }
    onKey(ev) {
      if (ev.key === 'Control') { this.flushMotion(); this.keep = !this.keep; this.app.refreshStatus(); if (this.state === 1) { this.preview.restore(); if (this.fast && this.fast.mode === 'isolated') this.fast.sign = 0; this.apply(this.dist); } return true; }
      return false;
    }
    drawOverlay(ov) {
      if (this.state === 1) {
        const end = V.add(this.start, V.scale(this.n, this.dist));
        ov.line3(this.start, end, '#555', 1, 3);
        if (this.snap) { ov.marker(this.snap.p, this.snap.type, this.snap.color); ov.line3(this.snap.p, end, '#888', 1, 3); }
        const s = this.cam.project(end);
        ov.tip(s.x, s.y, this.blocked ? this.blocked : (this.snap ? this.snap.label + ' · ' : '') + fmtLen(this.dist), this.blocked ? '#d63a2f' : null);
      }
    }
  }

  /* ================= Mover ================= */

  class MoveTool extends Tool {
    constructor(app) {
      super(app); this.id = 'move'; this.copy = false; this.preview = new LivePreview(app); this.lastCopy = null;
      this.motion = new LatestMotion(app, (ev) => this.movePreview(ev));
    }
    reset() {
      if (this.motion) this.motion.cancel();
      if (this.preview) this.preview.end();
      this.state = 0; this.items = null; this.snap = null; this.lock = null; this.hoverEnt = null; this.vec = [0, 0, 0];
      this.copy = false; this.snapInference = null;
    }
    cursor() { return 'move'; }
    hint() {
      const c = this.copy ? ' [copia: Ctrl pulsado]' : ' · Mantén Ctrl para copiar';
      return this.state === 0 ? 'Haz clic en el punto de partida. Sin selección se mueve lo que hay bajo el ratón.' + c
        : 'Haz clic en el destino o escribe la distancia. Tras copiar: «x5» repite, «/5» reparte.' + c;
    }
    vcbLabel() { return 'Distancia'; }
    hover() {
      if (this.state !== 0 || !this.hoverEnt) return null;
      return { face: this.hoverEnt.faces ? this.hoverEnt.faces[0] : null, edge: this.hoverEnt.edges ? this.hoverEnt.edges[0] : null };
    }
    onMove(ev) {
      if (this.state === 0) {
        this.syncCopy(ev);
        this.snap = this.inf.infer(ev.x, ev.y, {});
        this.hoverEnt = this.doc.selectionEmpty() ? pickEntity(this.app, ev.x, ev.y) : null;
        this.app.requestRender();
        return;
      }
      this.motion.queue(ev);
    }
    syncCopy(ev) {
      if (typeof ev.ctrl !== 'boolean') return;
      if (this.copy !== ev.ctrl) { this.copy = ev.ctrl; this.app.refreshStatus(); }
    }
    movePreview(ev) {
      if (this.state !== 1) return;
      this.syncCopy(ev);
      this.snap = (this.snapInference || this.inf).infer(ev.x, ev.y, { start: this.start, skipVerts: this.movingSet, skipFaces: this.movingFaces, lockDir: this.lock && this.lock.dir, lockColor: this.lock && this.lock.color, lockLabel: this.lock && this.lock.label });
      this.applyVec(V.sub(this.snap.p, this.start));
    }
    applyVec(v) {
      this.vec = v;
      const it = this.items, copy = this.copy, verts = this.moving;
      this.preview.apply((m) => {
        if (copy) m.copyEntities(it.faces || [], it.edges || [], (q) => V.add(q, v));
        else m.transformVertices(verts, (q) => V.add(q, v));
        // Anotaciones seleccionadas también siguen la vista previa. Sus offsets
        // son vectores: trasladar una cota no cambia su medida ni su separación.
        for (const id of it.annots || []) {
          const source = m.annots.get(id);
          if (!source) continue;
          const annotation = copy ? JSON.parse(JSON.stringify(source)) : source;
          if (copy) { annotation.id = m.newId(); m.annots.set(annotation.id, annotation); }
          for (const key of ['p', 'a', 'b', 'from']) if (annotation[key]) annotation[key] = V.add(annotation[key], v);
        }
        return { ok: true };
      });
      this.app.setVCB(fmtLen(V.len(v)));
    }
    onDown(ev) {
      if (ev.button !== 0) return;
      this.syncCopy(ev);
      if (this.state === 0) {
        let items;
        if (!this.doc.selectionEmpty()) items = this.doc.selectionItems();
        else {
          const e = pickEntity(this.app, ev.x, ev.y);
          if (!e) { this.app.toast('No hay nada que mover aquí.', 'warn'); return; }
          items = { faces: e.faces || [], edges: e.edges || [], verts: e.verts || [], annots: e.annots || [], nodes: e.nodes || [] };
        }
        this.snap = this.inf.infer(ev.x, ev.y, {});
        this.start = this.snap.p.slice();
        this.items = items;
        this.moving = vertsOfItems(this.doc, items);
        this.movingSet = new Set(this.moving);
        this.movingFaces = facesTouching(this.model, this.moving);
        if (!this.moving.length && !(items.annots || []).length) { this.app.toast('La selección no tiene geometría.', 'warn'); return; }
        this.preview.begin();
        this.snapInference = baseInference(this);
        this.state = 1;
        return;
      }
      this.onMove(ev); this.flushMotion(); this.commit(this.vec);
    }
    commit(v) {
      this.motion.cancel();
      this.preview.end();
      const it = this.items;
      this.state = 0;
      if (V.len(v) < 1e-9) { this.reset(); this.app.requestRender(); return; }
      const r = this.doc.execute('entities.move', { faces: it.faces, edges: it.edges, verts: it.verts, annots: it.annots, nodes: it.nodes, vector: v, copy: this.copy });
      if (!r.ok) this.app.toast(r.error, 'error');
      else if (this.copy) this.lastCopy = { items: it, vector: v };
      else this.lastCopy = null;
      this.items = null;
      this.app.requestRender();
    }
    onVCB(text) {
      const t = text.trim().toLowerCase();
      const arr = t.match(/^(?:[x*]\s*(\d+)|(\d+)\s*x)$/);
      const div = t.match(/^\/\s*(\d+)$/);
      if ((arr || div) && this.state === 0 && this.lastCopy) {
        const n = parseInt(arr ? (arr[1] || arr[2]) : div[1], 10);
        if (!(n >= 1 && n <= 500)) return true;
        const lc = this.lastCopy;
        this.doc.undo();
        const vec = div ? V.scale(lc.vector, 1 / n) : lc.vector;
        const r = this.doc.execute('entities.move', { faces: lc.items.faces, edges: lc.items.edges, verts: lc.items.verts, annots: lc.items.annots, nodes: lc.items.nodes, vector: vec, copy: true, copies: n });
        if (!r.ok) this.app.toast(r.error, 'error');
        else this.app.toast((div ? 'Repartido en ' : 'Repetido ') + n + (div ? ' partes' : ' veces'), 'info');
        return true;
      }
      if (this.state !== 1) return false;
      this.flushMotion();
      const c = toolUtil.parseCoords(text, this.start);
      if (c) { this.commit(V.sub(c, this.start)); return true; }
      const L = units.parseLen(text);
      if (L === null) return false;
      let dir = this.lock ? this.lock.dir : this.vec;
      if (this.lock && V.dot(this.vec, dir) < 0) dir = V.neg(dir);
      if (V.len(dir) < 1e-9) { this.app.toast('Mueve el ratón para indicar la dirección.', 'warn'); return true; }
      this.commit(V.scale(V.norm(dir), L));
      return true;
    }
    onKey(ev) {
      if (ev.key === 'Control' || ev.key === 'Meta') { this.flushMotion(); this.syncCopy({ ctrl: true }); if (this.state === 1) this.applyVec(this.vec); return true; }
      if (this.state === 1) {
        const k = lockFromKey(ev.key);
        if (k) { this.lock = this.lock && this.lock.label === k.label ? null : k; return true; }
        if (ev.key === 'Shift' && !this.lock && V.len(this.vec) > 1e-6 && this.snap && this.snap.type !== 'free') {
          this.lock = { dir: V.norm(this.vec), color: this.snap.color, label: 'Bloqueado', shift: true }; return true;
        }
      }
      return false;
    }
    onKeyUp(ev) {
      if (ev.key === 'Control' || ev.key === 'Meta') { this.flushMotion(); this.syncCopy({ ctrl: !!ev.ctrl }); if (this.state === 1) this.applyVec(this.vec); return true; }
      if (ev.key === 'Shift' && this.lock && this.lock.shift) { this.lock = null; return true; }
      return false;
    }
    drawOverlay(ov) {
      if (this.state === 1) {
        const end = V.add(this.start, this.vec);
        const col = this.snap && this.snap.axisLine ? this.snap.axisLine.color : (this.lock ? this.lock.color : '#1c1e21');
        ov.line3(this.start, end, col, 1.6, 5);
        ov.marker(this.start, 'endpoint', '#14a33a');
      }
      if (this.state === 0 && this.hoverEnt && this.hoverEnt.verts) ov.marker(this.hoverEnt.p, 'endpoint', '#e06a1f');
      drawSnap(ov, this.snap);
    }
  }

  /* Copiar tiene un botón propio y conserva el mismo gesto preciso de Mover. */
  class CopyTool extends MoveTool {
    constructor(app) { super(app); this.id = 'copy'; this.copy = true; }
    reset() { super.reset(); this.copy = true; }
    syncCopy() { this.copy = true; }
    hint() {
      return this.state === 0 ? 'Copiar: haz clic en el punto de partida. Puedes seleccionar antes el elemento, grupo o componente.'
        : 'Haz clic en el destino o escribe la distancia. El original se conserva. Después: «x5» repite, «/5» reparte.';
    }
  }

  /* ================= Rotar ================= */

  class RotateTool extends Tool {
    constructor(app) { super(app); this.id = 'rotate'; this.copy = false; this.preview = new LivePreview(app); this.lastCopy = null; }
    reset() {
      if (this.preview) this.preview.end();
      this.state = 0; this.items = null; this.snap = null; this.angle = 0; this.axisLock = null;
    }
    cursor() { return 'crosshair'; }
    hint() {
      const c = this.copy ? ' [copia]' : ' · Ctrl: copiar';
      return ['Haz clic para el centro de giro (sobre una cara, el transportador se apoya en ella). Flechas: eje fijo.' + c,
        'Haz clic para la dirección de referencia.' + c,
        'Mueve para girar y haz clic, o escribe el ángulo en grados.' + c][this.state];
    }
    vcbLabel() { return 'Ángulo'; }
    axisFor(snap) {
      if (this.axisLock) return this.axisLock;
      const pl = toolUtil.drawingPlane(this.app, snap);
      return V.norm(pl.n);
    }
    onMove(ev) {
      if (this.state === 0) {
        this.snap = this.inf.infer(ev.x, ev.y, {});
        this.axis = this.axisFor(this.snap);
      } else if (this.state === 1) {
        this.snap = this.inf.infer(ev.x, ev.y, { start: this.center, plane: { n: this.axis, d: V.dot(this.axis, this.center) } });
      } else {
        this.preview.restore();
        this.snap = this.inf.infer(ev.x, ev.y, { start: this.center, plane: { n: this.axis, d: V.dot(this.axis, this.center) }, skipVerts: this.movingSet, skipFaces: this.movingFaces });
        const cur = V.sub(this.snap.p, this.center);
        let a = Math.atan2(V.dot(V.cross(this.ref, cur), this.axis), V.dot(this.ref, cur));
        const deg = a * 180 / Math.PI;
        const snapDeg = Math.round(deg / 15) * 15;
        if (Math.abs(deg - snapDeg) < 2.5) a = snapDeg * Math.PI / 180;
        this.applyAngle(a);
      }
      this.app.requestRender();
    }
    applyAngle(a) {
      this.angle = a;
      const it = this.items, c = this.center, k = this.axis, verts = this.moving, copy = this.copy;
      this.preview.apply((m) => {
        if (copy) m.copyEntities(it.faces || [], it.edges || [], (q) => V.rotate(q, c, k, a));
        else m.transformVertices(verts, (q) => V.rotate(q, c, k, a));
        return { ok: true };
      });
      this.app.setVCB(fmtNum(a * 180 / Math.PI, 1) + '°');
    }
    onDown(ev) {
      if (ev.button !== 0) return;
      if (this.state === 0) {
        let items;
        if (!this.doc.selectionEmpty()) items = this.doc.selectionItems();
        else {
          const e = pickEntity(this.app, ev.x, ev.y);
          if (!e) { this.app.toast('Selecciona primero lo que quieres girar.', 'warn'); return; }
          items = { faces: e.faces || [], edges: e.edges || [], verts: e.verts || [], annots: e.annots || [], nodes: e.nodes || [] };
          if (e.faces && !items.nodes.length) items = Object.assign(items, this.model.connected(e.faces, []));
          if (!items.nodes.length) items.verts = [];
        }
        this.snap = this.inf.infer(ev.x, ev.y, {});
        this.center = this.snap.p.slice();
        this.axis = this.axisFor(this.snap);
        this.items = items;
        this.moving = vertsOfItems(this.doc, items);
        this.movingSet = new Set(this.moving);
        this.movingFaces = facesTouching(this.model, this.moving);
        this.state = 1;
        return;
      }
      if (this.state === 1) {
        this.onMove(ev);
        const r = V.sub(this.snap.p, this.center);
        const rr = V.sub(r, V.scale(this.axis, V.dot(r, this.axis)));
        if (V.len(rr) < 1e-6) return;
        this.ref = V.norm(rr);
        this.preview.begin();
        this.state = 2;
        return;
      }
      this.commit(this.angle);
    }
    commit(a) {
      this.preview.end();
      const it = this.items;
      this.state = 0;
      if (Math.abs(a) < 1e-9) { this.reset(); return; }
      const r = this.doc.execute('entities.rotate', { faces: it.faces, edges: it.edges, verts: it.verts, annots: it.annots, nodes: it.nodes, center: this.center, axis: this.axis, angle: a * 180 / Math.PI, copy: this.copy });
      if (!r.ok) this.app.toast(r.error, 'error');
      this.lastCopy = this.copy ? { items: it, center: this.center, axis: this.axis, angle: a * 180 / Math.PI } : null;
      this.items = null;
      this.app.requestRender();
    }
    onVCB(text) {
      const t = text.trim().toLowerCase();
      const arr = t.match(/^(?:[x*]\s*(\d+)|(\d+)\s*x)$/);
      const div = t.match(/^\/\s*(\d+)$/);
      if ((arr || div) && this.state === 0 && this.lastCopy) {
        const n = parseInt(arr ? (arr[1] || arr[2]) : div[1], 10);
        const lc = this.lastCopy;
        this.doc.undo();
        this.doc.execute('entities.rotate', { faces: lc.items.faces, edges: lc.items.edges, annots: lc.items.annots, nodes: lc.items.nodes, center: lc.center, axis: lc.axis, angle: div ? lc.angle / n : lc.angle, copy: true, copies: n });
        return true;
      }
      if (this.state !== 2) return false;
      const a = units.parseAngle(text);
      if (a === null) return false;
      this.commit(a * Math.PI / 180);
      return true;
    }
    onKey(ev) {
      if (ev.key === 'Control') { this.copy = !this.copy; this.app.refreshStatus(); return true; }
      if (this.state === 0) {
        const k = lockFromKey(ev.key);
        if (k) { this.axisLock = this.axisLock && V.eq(this.axisLock, k.dir) ? null : k.dir; this.app.requestRender(); return true; }
      }
      return false;
    }
    drawOverlay(ov) {
      const col = Math.abs(this.axis ? this.axis[2] : 1) > 0.99 ? '#3a5fd4' : (Math.abs(this.axis[0]) > 0.99 ? '#d4463c' : (Math.abs(this.axis[1]) > 0.99 ? '#2f9a4a' : '#555'));
      if (this.state === 0 && this.snap) { ov.protractor(this.snap.p, this.axis, null, 60, col); drawSnap(ov, this.snap); return; }
      if (this.state >= 1) ov.protractor(this.center, this.axis, this.ref, 60, col);
      if (this.state === 1 && this.snap) ov.line3(this.center, this.snap.p, '#1c1e21', 1.4, 4);
      if (this.state === 2) {
        const R = this.cam.pixelSize(this.center) * 75;
        ov.line3(this.center, V.add(this.center, V.scale(this.ref, R)), '#1c1e21', 1.4, 4);
        ov.line3(this.center, V.add(this.center, V.scale(V.rotate(this.ref, [0, 0, 0], this.axis, this.angle), R)), '#1c1e21', 1.6);
        const s = this.cam.project(this.center);
        ov.tip(s.x, s.y, fmtNum(this.angle * 180 / Math.PI, 1) + '°');
      }
      if (this.snap && this.state === 1) drawSnap(ov, this.snap, { noTip: false });
    }
  }

  /* ================= Escala ================= */

  class ScaleTool extends Tool {
    constructor(app) { super(app); this.id = 'scale'; this.preview = new LivePreview(app); }
    reset() {
      if (this.preview) this.preview.end();
      this.state = 0; this.grip = null; this.hoverGrip = null; this.factors = [1, 1, 1];
    }
    cursor() { return 'default'; }
    hint() {
      return this.state === 0 ? 'Selecciona y arrastra un tirador: esquinas = uniforme, aristas = dos ejes, caras = un eje. Ctrl: desde el centro.'
        : 'Mueve y haz clic, o escribe el factor (2) o una medida (3m).';
    }
    vcbLabel() { return 'Escala'; }
    grips() {
      if (this.doc.selectionEmpty()) return [];
      const vs = this.doc.vertsOf(this.doc.selectionItems());
      const bb = this.model.bbox(vs);
      if (!bb) return [];
      const c = V.mid(bb.min, bb.max), h = V.scale(V.sub(bb.max, bb.min), 0.5);
      const out = [];
      for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) for (let k = -1; k <= 1; k++) {
        if (!i && !j && !k) continue;
        const g = [i, j, k];
        if (g.some((x, a) => x !== 0 && h[a] < 1e-9)) continue;
        out.push({ g, p: [c[0] + h[0] * i, c[1] + h[1] * j, c[2] + h[2] * k], c, h, n: Math.abs(i) + Math.abs(j) + Math.abs(k) });
      }
      return out;
    }
    gripAt(x, y) {
      let best = null;
      for (const g of this.grips()) {
        const s = this.cam.project(g.p);
        const d = Math.hypot(s.x - x, s.y - y);
        if (d < 9 && (!best || d < best.d)) best = Object.assign({ d }, g);
      }
      return best;
    }
    onMove(ev) {
      if (this.state === 0) { this.hoverGrip = this.gripAt(ev.x, ev.y); this.app.requestRender(); return; }
      const so = this.cam.project(this.origin), sg = this.cam.project(this.grip.p);
      const S0 = [sg.x - so.x, sg.y - so.y], S = [ev.x - so.x, ev.y - so.y];
      const l2 = S0[0] * S0[0] + S0[1] * S0[1];
      let f = l2 > 1 ? (S[0] * S0[0] + S[1] * S0[1]) / l2 : 1;
      if (Math.abs(f - Math.round(f * 10) / 10) < 0.02) f = Math.round(f * 10) / 10;
      if (Math.abs(f) < 0.01) f = 0.01;
      this.applyFactor(f);
    }
    applyFactor(f) {
      this.f = f;
      this.factors = this.grip.g.map((x) => (x !== 0 ? f : 1));
      const o = this.origin, F = this.factors, verts = this.verts;
      this.preview.apply((m) => {
        const touched = m.transformVertices(verts, (q) => [o[0] + (q[0] - o[0]) * F[0], o[1] + (q[1] - o[1]) * F[1], o[2] + (q[2] - o[2]) * F[2]]);
        if (F[0] * F[1] * F[2] < 0) m.flipFaces(touched.filter((x) => m.faces.has(x)));
        return { ok: true };
      });
      this.app.setVCB(fmtNum(f, 2));
    }
    onDown(ev) {
      if (ev.button !== 0) return;
      if (this.state === 0) {
        if (this.doc.selectionEmpty()) { this.app.toast('Selecciona primero lo que quieres escalar.', 'warn'); return; }
        const g = this.gripAt(ev.x, ev.y);
        if (!g) return;
        this.grip = g;
        this.origin = ev.ctrl ? g.c : [g.c[0] - g.h[0] * g.g[0], g.c[1] - g.h[1] * g.g[1], g.c[2] - g.h[2] * g.g[2]];
        this.verts = this.doc.vertsOf(this.doc.selectionItems());
        this.preview.begin();
        this.state = 1;
        this.f = 1;
        return;
      }
      this.commit();
    }
    commit() {
      this.preview.end();
      this.state = 0;
      const r = this.doc.execute('entities.scale', { origin: this.origin, factors: this.factors });
      if (!r.ok) this.app.toast(r.error, 'error');
      this.app.requestRender();
    }
    onVCB(text) {
      if (this.state !== 1) return false;
      const t = text.trim();
      if (/[a-z]/i.test(t)) {
        const L = units.parseLen(t);
        if (L === null) return false;
        const axis = this.grip.g.findIndex((x) => x !== 0);
        const size = this.grip.h[axis] * 2;
        if (size < 1e-9) return true;
        this.applyFactor(L / size);
      } else {
        const f = parseFloat(t.replace(',', '.'));
        if (!isFinite(f) || f === 0) return false;
        this.applyFactor(f);
      }
      this.commit();
      return true;
    }
    drawOverlay(ov) {
      const grips = this.grips();
      if (!grips.length) return;
      const bb = grips[0];
      const c = bb.c, h = bb.h;
      const corners = [];
      for (const i of [-1, 1]) for (const j of [-1, 1]) for (const k of [-1, 1]) corners.push([c[0] + h[0] * i, c[1] + h[1] * j, c[2] + h[2] * k]);
      const E = [[0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7]];
      if (this.state === 0) for (const [a, b] of E) ov.line3(corners[a], corners[b], '#d4463c', 1, 3);
      for (const g of grips) {
        const s = this.cam.project(g.p);
        if (s.behind) continue;
        const hot = (this.hoverGrip && V.eq(this.hoverGrip.p, g.p)) || (this.grip && this.state === 1 && V.eq(this.grip.p, g.p));
        ov.square2(s.x, s.y, g.n === 3 ? 8 : 6.5, hot ? '#d4463c' : (g.n === 3 ? '#14a33a' : '#d4463c'), hot);
      }
      if (this.state === 1) { const s = this.cam.project(this.grip.p); ov.tip(s.x, s.y, 'Escala ' + fmtNum(this.f, 2)); }
    }
  }

  /* ================= Equidistancia ================= */

  class OffsetTool extends Tool {
    constructor(app) { super(app); this.id = 'offset'; this.last = null; }
    reset() { this.state = 0; this.face = null; this.hoverFace = null; this.dist = 0; }
    cursor() { return 'crosshair'; }
    hint() { return this.state === 0 ? 'Haz clic en una cara para copiar su contorno hacia dentro o hacia fuera. Doble clic repite.' : 'Mueve y haz clic, o escribe la distancia.'; }
    vcbLabel() { return 'Distancia'; }
    hover() { return this.state === 0 ? { face: this.hoverFace } : null; }
    boundaryDist(p) {
      const f = this.model.faces.get(this.face);
      const b = this.basis;
      const q = b.to2(p);
      const L = f.loops[0].map((v) => b.to2(this.model.P(v)));
      let m = Infinity;
      for (let i = 0; i < L.length; i++) {
        const a = L[i], c = L[(i + 1) % L.length];
        const abx = c[0] - a[0], aby = c[1] - a[1];
        const l2 = abx * abx + aby * aby;
        let t = l2 > 0 ? ((q[0] - a[0]) * abx + (q[1] - a[1]) * aby) / l2 : 0;
        t = Math.max(0, Math.min(1, t));
        m = Math.min(m, Math.hypot(a[0] + abx * t - q[0], a[1] + aby * t - q[1]));
      }
      return geom.pointInPoly2(q, L) >= 0 ? m : -m;
    }
    planePoint(ev) {
      const f = this.model.faces.get(this.face);
      const ray = this.cam.ray(ev.x, ev.y);
      const t = geom.rayPlane(ray.o, ray.d, { n: f.n, d: f.d });
      return t !== null ? V.add(ray.o, V.scale(ray.d, t)) : null;
    }
    onMove(ev) {
      if (this.state === 0) { const h = this.inf.picker.faceAt(ev.x, ev.y); this.hoverFace = h ? h.fid : null; this.app.requestRender(); return; }
      const p = this.planePoint(ev);
      if (!p) return;
      this.dist = this.boundaryDist(p) - this.d0;
      this.app.setVCB(fmtLen(this.dist));
      this.app.requestRender();
    }
    onDown(ev) {
      if (ev.button !== 0) return;
      if (this.state === 0) {
        const h = this.inf.picker.faceAt(ev.x, ev.y);
        if (!h) return;
        this.face = h.fid;
        const f = this.model.faces.get(h.fid);
        this.basis = this.model.faceBasis(f);
        this.d0 = this.boundaryDist(h.p);
        this.state = 1;
        return;
      }
      this.commit(this.dist);
    }
    commit(d) {
      const face = this.face;
      this.state = 0;
      if (Math.abs(d) < 1e-6) { this.reset(); return; }
      const r = this.doc.execute('face.offset', { face, distance: d });
      if (!r.ok) this.app.toast(r.error, 'error');
      else this.last = d;
      this.reset();
      this.app.requestRender();
    }
    onDouble(ev) {
      if (this.last === null) return;
      const h = this.inf.picker.faceAt(ev.x, ev.y);
      if (!h) return;
      this.reset();
      const r = this.doc.execute('face.offset', { face: h.fid, distance: this.last });
      if (!r.ok) this.app.toast(r.error, 'error');
    }
    onVCB(text) {
      if (this.state !== 1) return false;
      const L = units.parseLen(text);
      if (L === null) return false;
      this.commit((Math.sign(this.dist) || 1) * L);
      return true;
    }
    drawOverlay(ov) {
      if (this.state !== 1 || Math.abs(this.dist) < 1e-6) return;
      const f = this.model.faces.get(this.face);
      if (!f) return;
      const L = f.loops[0].map((v) => this.basis.to2(this.model.P(v)));
      const off = geom.offsetPolygon2(L, this.dist);
      ov.poly3(off.map((q) => this.basis.to3(q)), true, '#1f5fe0', null, 1.8);
    }
  }

  D.tools.PushPullTool = PushPullTool;
  D.tools.MoveTool = MoveTool;
  D.tools.CopyTool = CopyTool;
  D.tools.RotateTool = RotateTool;
  D.tools.ScaleTool = ScaleTool;
  D.tools.OffsetTool = OffsetTool;
  D.pickEntity = pickEntity;
})(typeof window !== 'undefined' ? window : globalThis);
