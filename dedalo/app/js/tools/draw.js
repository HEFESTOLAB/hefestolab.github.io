/*
 * Dédalo — herramientas de dibujo: Línea, Rectángulo, Círculo, Polígono y Arco.
 */
(function (root) {
  'use strict';
  const D = root.DEDALO;
  const { V, Tool, toolUtil, units } = D;
  const { fmtLen } = units;

  // Dibujo común del enganche: recta de eje, recta de seguimiento, marcador y etiqueta.
  function drawSnap(ov, s, opts) {
    if (!s) return;
    opts = opts || {};
    if (s.trackLine) ov.line3(s.trackLine.a, s.trackLine.b, s.trackLine.color || '#555', 1.2, s.trackLine.dash || 3);
    if (s.type !== 'free' && s.type !== 'axis' && s.type !== 'locked' && s.type !== 'tracking') ov.marker(s.p, s.type, s.markColor || s.color);
    else if (s.type === 'axis' && s.markColor) ov.marker(s.p, 'onEdge', s.markColor);
    if (!opts.noTip && s.label) {
      const sc = ov.cam.project(s.p);
      ov.tip(sc.x, sc.y, s.label, s.color);
    }
  }
  D.drawSnap = drawSnap;

  function lockFromKey(key) {
    if (key === 'ArrowRight') return { dir: [1, 0, 0], color: '#d4463c', label: 'Bloqueado en eje rojo' };
    if (key === 'ArrowLeft') return { dir: [0, 1, 0], color: '#2f9a4a', label: 'Bloqueado en eje verde' };
    if (key === 'ArrowUp') return { dir: [0, 0, 1], color: '#3a5fd4', label: 'Bloqueado en eje azul' };
    return null;
  }
  D.lockFromKey = lockFromKey;

  /* ================= Línea ================= */

  class LineTool extends Tool {
    constructor(app) { super(app); this.id = 'line'; }
    reset() { this.state = 0; this.start = null; this.snap = null; this.lock = null; this.refEdge = null; this.inf.resetTracking(); }
    cursor() { return 'crosshair'; }
    hint() {
      return this.state === 0
        ? 'Haz clic para el primer extremo, o escribe coordenadas [x;y;z].'
        : 'Haz clic para el siguiente extremo o escribe la longitud. Mayús bloquea la dirección · flechas → rojo, ← verde, ↑ azul · Esc termina.';
    }
    vcbLabel() { return 'Longitud'; }
    ctx() {
      return { start: this.start, lockDir: this.lock && this.lock.dir, lockColor: this.lock && this.lock.color, lockLabel: this.lock && this.lock.label, refEdge: this.refEdge };
    }
    onMove(ev) {
      this.snap = this.inf.infer(ev.x, ev.y, this.ctx());
      if (this.snap.edge && this.snap.type !== 'axis') this.refEdge = this.snap.edge;
      if (this.state === 1) this.app.setVCB(fmtLen(V.dist(this.start, this.snap.p)));
      this.app.requestRender();
    }
    onDown(ev) {
      if (ev.button !== 0) return;
      this.onMove(ev);
      const p = this.snap.p;
      if (this.state === 0) { this.start = p.slice(); this.state = 1; this.app.setVCB(''); return; }
      this.addTo(p);
    }
    addTo(p) {
      if (V.dist(p, this.start) < 1e-6) { this.reset(); this.app.requestRender(); return; }
      const r = this.doc.execute('draw.line', { points: [this.start, p] });
      if (!r.ok) { this.app.toast(r.error, 'error'); return; }
      if (r.faces && r.faces.length) { this.reset(); }
      else { this.start = p.slice(); this.lock = null; }
      this.app.requestRender();
    }
    onDouble() { this.reset(); this.app.requestRender(); }
    onKey(ev) {
      if (this.state !== 1) return false;
      const k = lockFromKey(ev.key);
      if (k) { this.lock = this.lock && this.lock.label === k.label ? null : k; this.app.requestRender(); return true; }
      if (ev.key === 'Shift' && !this.lock && this.snap) {
        const d = V.sub(this.snap.p, this.start);
        if (V.len(d) > 1e-6 && this.snap.type !== 'free') this.lock = { dir: V.norm(d), color: this.snap.color, label: 'Bloqueado', shift: true };
        return true;
      }
      return false;
    }
    onKeyUp(ev) {
      if (ev.key === 'Shift' && this.lock && this.lock.shift) { this.lock = null; this.app.requestRender(); return true; }
      return false;
    }
    onVCB(text) {
      const c = toolUtil.parseCoords(text, this.start);
      if (c) {
        if (this.state === 0) { this.start = c; this.state = 1; return true; }
        this.addTo(c); return true;
      }
      if (this.state !== 1 || !this.snap) return false;
      const L = units.parseLen(text);
      if (L === null) return false;
      let dir = this.lock ? this.lock.dir : V.sub(this.snap.p, this.start);
      if (this.lock && V.dot(V.sub(this.snap.p, this.start), dir) < 0) dir = V.neg(dir);
      if (V.len(dir) < 1e-9) { this.app.toast('Mueve el ratón para indicar la dirección.', 'warn'); return true; }
      this.addTo(V.add(this.start, V.scale(V.norm(dir), L)));
      return true;
    }
    drawOverlay(ov) {
      if (this.state === 1 && this.snap) {
        const col = this.snap.axisLine ? this.snap.axisLine.color : (this.lock ? this.lock.color : '#1c1e21');
        ov.line3(this.start, this.snap.p, col, 2);
        ov.marker(this.start, 'endpoint', '#14a33a');
      }
      drawSnap(ov, this.snap);
    }
  }

  /* ================= Rectángulo ================= */

  class RectTool extends Tool {
    constructor(app) { super(app); this.id = 'rect'; this.last = null; }
    reset() { this.state = 0; this.c1 = null; this.snap = null; this.plane = null; this.dims = null; }
    cursor() { return 'crosshair'; }
    hint() {
      return this.state === 0 ? 'Haz clic para la primera esquina (sobre una cara, el rectángulo se apoya en ella).'
        : 'Haz clic para la esquina opuesta o escribe «ancho;alto» (p. ej. 5;4).';
    }
    vcbLabel() { return 'Dimensiones'; }
    onMove(ev) {
      if (this.state === 0) {
        this.snap = this.inf.infer(ev.x, ev.y, {});
        this.app.requestRender();
        return;
      }
      this.snap = this.inf.infer(ev.x, ev.y, { start: this.c1, plane: this.plane });
      this.compute(this.snap.p);
      this.app.setVCB(fmtLen(Math.abs(this.dims.w)).replace(' m', '') + '; ' + fmtLen(Math.abs(this.dims.h)));
      this.app.requestRender();
    }
    compute(p) {
      const d = V.sub(p, this.c1);
      let w = V.dot(d, this.axes.u), h = V.dot(d, this.axes.v);
      let special = '';
      if (Math.abs(w) > 1e-6 && Math.abs(h) > 1e-6) {
        const ps = this.cam.pixelSize(p);
        if (Math.abs(Math.abs(w) - Math.abs(h)) < ps * 6) { h = Math.sign(h) * Math.abs(w); special = 'Cuadrado'; }
        else {
          const phi = 1.6180339887;
          if (Math.abs(Math.abs(h) - Math.abs(w) / phi) < ps * 5) { h = Math.sign(h) * Math.abs(w) / phi; special = 'Sección áurea'; }
          else if (Math.abs(Math.abs(h) - Math.abs(w) * phi) < ps * 5) { h = Math.sign(h) * Math.abs(w) * phi; special = 'Sección áurea'; }
        }
      }
      this.dims = { w, h, special };
    }
    corners() {
      const { u, v } = this.axes;
      const { w, h } = this.dims;
      const o = this.c1;
      return [o, V.add(o, V.scale(u, w)), V.add(V.add(o, V.scale(u, w)), V.scale(v, h)), V.add(o, V.scale(v, h))];
    }
    onDown(ev) {
      if (ev.button !== 0) return;
      if (this.state === 0) {
        this.snap = this.inf.infer(ev.x, ev.y, {});
        this.c1 = this.snap.p.slice();
        const pl = toolUtil.drawingPlane(this.app, this.snap);
        this.plane = { n: pl.n, d: V.dot(pl.n, this.c1) };
        this.axes = toolUtil.planeAxes(pl.n);
        this.state = 1;
        this.dims = { w: 0, h: 0 };
        return;
      }
      this.onMove(ev);
      this.commit(this.dims.w, this.dims.h);
    }
    commit(w, h) {
      if (Math.abs(w) < 1e-6 || Math.abs(h) < 1e-6) { this.app.toast('El rectángulo necesita ancho y alto.', 'warn'); return; }
      const r = this.doc.execute('draw.rectangle', { origin: this.c1, width: w, height: h, xAxis: this.axes.u, yAxis: this.axes.v });
      if (!r.ok) { this.app.toast(r.error, 'error'); return; }
      this.last = { c1: this.c1, axes: this.axes, w, h };
      this.reset();
      this.app.requestRender();
    }
    onVCB(text) {
      const vals = units.parseLens(text);
      if (!vals || vals.length !== 2) return false;
      if (this.state === 1) {
        const sw = Math.sign(this.dims.w) || 1, sh = Math.sign(this.dims.h) || 1;
        this.commit(Math.abs(vals[0]) * sw * Math.sign(vals[0] || 1), Math.abs(vals[1]) * sh * Math.sign(vals[1] || 1));
        return true;
      }
      if (this.state === 0 && this.last) {
        // redimensionar el último rectángulo
        this.doc.undo();
        const l = this.last;
        this.c1 = l.c1; this.axes = l.axes;
        this.commit(Math.abs(vals[0]) * Math.sign(l.w), Math.abs(vals[1]) * Math.sign(l.h));
        return true;
      }
      return false;
    }
    drawOverlay(ov) {
      if (this.state === 1 && this.dims) {
        const pts = this.corners();
        ov.poly3(pts, true, '#1c1e21', 'rgba(31,95,224,0.10)', 1.8);
        if (this.dims.special) {
          ov.line3(pts[0], pts[2], '#1f5fe0', 1, 4);
          const s = this.cam.project(pts[2]);
          ov.tip(s.x, s.y, this.dims.special, '#1f5fe0');
          return;
        }
      }
      drawSnap(ov, this.snap);
    }
  }

  /* ================= Círculo y polígono ================= */

  class CircleTool extends Tool {
    constructor(app, polygon) {
      super(app);
      this.polygon = !!polygon;
      this.id = polygon ? 'polygon' : 'circle';
      this.segments = polygon ? 6 : 24;
      this.last = null;
    }
    reset() { this.state = 0; this.center = null; this.snap = null; this.plane = null; this.radius = 0; }
    cursor() { return 'crosshair'; }
    hint() {
      const what = this.polygon ? 'polígono' : 'círculo';
      return this.state === 0 ? 'Haz clic para el centro del ' + what + '. Escribe «' + this.segments + 's» para cambiar los ' + (this.polygon ? 'lados' : 'segmentos') + '.'
        : 'Haz clic para fijar el radio o escríbelo.';
    }
    vcbLabel() { return this.state === 0 ? (this.polygon ? 'Lados' : 'Segmentos') : 'Radio'; }
    onMove(ev) {
      if (this.state === 0) {
        this.snap = this.inf.infer(ev.x, ev.y, {});
        this.app.setVCB(String(this.segments));
      } else {
        this.snap = this.inf.infer(ev.x, ev.y, { start: this.center, plane: this.plane });
        this.radius = V.dist(this.snap.p, this.center);
        this.app.setVCB(fmtLen(this.radius));
      }
      this.app.requestRender();
    }
    onDown(ev) {
      if (ev.button !== 0) return;
      if (this.state === 0) {
        this.snap = this.inf.infer(ev.x, ev.y, {});
        this.center = this.snap.p.slice();
        const pl = toolUtil.drawingPlane(this.app, this.snap);
        this.plane = { n: pl.n, d: V.dot(pl.n, this.center) };
        this.state = 1;
        return;
      }
      this.onMove(ev);
      this.commit(this.radius, V.sub(this.snap.p, this.center));
    }
    commit(r, startDir) {
      if (!(r > 1e-6)) { this.app.toast('El radio debe ser mayor que cero.', 'warn'); return; }
      const res = this.doc.execute(this.polygon ? 'draw.polygon' : 'draw.circle', {
        center: this.center, radius: r, normal: this.plane.n, segments: this.segments, sides: this.segments, startDir
      });
      if (!res.ok) { this.app.toast(res.error, 'error'); return; }
      this.last = { center: this.center, plane: this.plane, startDir, r };
      this.reset();
      this.app.requestRender();
    }
    onVCB(text) {
      const segs = text.trim().match(/^(\d+)\s*s$/i) || (this.state === 0 && text.trim().match(/^(\d+)$/));
      if (segs) {
        const n = parseInt(segs[1], 10);
        if (n >= 3 && n <= 720) { this.segments = n; this.app.toast((this.polygon ? 'Lados: ' : 'Segmentos: ') + n, 'info'); }
        return true;
      }
      const r = units.parseLen(text);
      if (r === null) return false;
      if (this.state === 1) { this.commit(Math.abs(r), this.snap ? V.sub(this.snap.p, this.center) : null); return true; }
      if (this.state === 0 && this.last) {
        this.doc.undo();
        Object.assign(this, { center: this.last.center, plane: this.last.plane });
        this.commit(Math.abs(r), this.last.startDir);
        return true;
      }
      return false;
    }
    drawOverlay(ov) {
      if (this.state === 1 && this.radius > 1e-6) {
        const pts = this.model.circlePoints(this.center, this.plane.n, this.radius, this.segments, V.sub(this.snap.p, this.center));
        ov.poly3(pts, true, '#1c1e21', 'rgba(31,95,224,0.10)', 1.8);
        ov.line3(this.center, this.snap.p, '#555', 1, 4);
        ov.marker(this.center, 'center', '#14a33a');
      }
      drawSnap(ov, this.snap);
    }
  }

  /* ================= Arco de dos puntos ================= */

  class ArcTool extends Tool {
    constructor(app) { super(app); this.id = 'arc'; this.segments = 12; }
    reset() { this.state = 0; this.a = null; this.b = null; this.snap = null; this.sag = 0; this.lock = null; }
    cursor() { return 'crosshair'; }
    hint() {
      return ['Haz clic para el inicio del arco.', 'Haz clic para el final del arco o escribe la longitud de la cuerda.', 'Mueve para dar la flecha y haz clic, o escríbela. «12s» cambia los segmentos.'][this.state];
    }
    vcbLabel() { return this.state === 2 ? 'Flecha' : 'Longitud'; }
    onMove(ev) {
      if (this.state === 0) this.snap = this.inf.infer(ev.x, ev.y, {});
      else if (this.state === 1) { this.snap = this.inf.infer(ev.x, ev.y, { start: this.a, lockDir: this.lock && this.lock.dir }); this.app.setVCB(fmtLen(V.dist(this.a, this.snap.p))); }
      else {
        this.snap = this.inf.infer(ev.x, ev.y, { plane: this.plane, noFace: false });
        const mid = V.mid(this.a, this.b);
        let s = V.dot(V.sub(this.snap.p, mid), this.w);
        const half = V.dist(this.a, this.b) / 2;
        this.semi = Math.abs(Math.abs(s) - half) < this.cam.pixelSize(mid) * 8;
        if (this.semi) s = Math.sign(s) * half;
        this.sag = s;
        this.app.setVCB(fmtLen(Math.abs(s)));
      }
      this.app.requestRender();
    }
    onDown(ev) {
      if (ev.button !== 0) return;
      this.onMove(ev);
      if (this.state === 0) { this.a = this.snap.p.slice(); this.startSnap = this.snap; this.state = 1; return; }
      if (this.state === 1) { this.setEnd(this.snap.p); return; }
      this.commit(this.sag);
    }
    setEnd(p) {
      if (V.dist(p, this.a) < 1e-6) return;
      this.b = p.slice();
      const chord = V.norm(V.sub(this.b, this.a));
      let pl = toolUtil.drawingPlane(this.app, this.startSnap);
      if (Math.abs(V.dot(pl.n, chord)) > 1e-6) {
        // la cuerda no está en ese plano: plano vertical que la contiene
        let n = V.cross(chord, [0, 0, 1]);
        if (V.len(n) < 1e-6) n = V.cross(chord, this.cam.right);
        pl = { n: V.norm(n) };
      }
      this.plane = { n: pl.n, d: V.dot(pl.n, this.a) };
      this.w = V.norm(V.cross(pl.n, chord));
      this.state = 2;
    }
    commit(s) {
      const mid = V.mid(this.a, this.b);
      if (Math.abs(s) < 1e-6) {
        this.doc.execute('draw.line', { points: [this.a, this.b] });
      } else {
        const r = this.doc.execute('draw.arc', { start: this.a, end: this.b, through: V.add(mid, V.scale(this.w, s)), segments: this.segments });
        if (!r.ok) { this.app.toast(r.error, 'error'); return; }
      }
      this.reset();
      this.app.requestRender();
    }
    onVCB(text) {
      const segs = text.trim().match(/^(\d+)\s*s$/i);
      if (segs) { this.segments = Math.max(2, Math.min(360, parseInt(segs[1], 10))); this.app.toast('Segmentos: ' + this.segments, 'info'); return true; }
      const L = units.parseLen(text);
      if (L === null) return false;
      if (this.state === 1 && this.snap) {
        const d = V.sub(this.snap.p, this.a);
        if (V.len(d) < 1e-9) return true;
        this.setEnd(V.add(this.a, V.scale(V.norm(d), L)));
        return true;
      }
      if (this.state === 2) { this.commit(Math.sign(this.sag || 1) * Math.abs(L)); return true; }
      return false;
    }
    onKey(ev) {
      if (this.state === 1) {
        const k = lockFromKey(ev.key);
        if (k) { this.lock = this.lock ? null : k; return true; }
      }
      return false;
    }
    drawOverlay(ov) {
      if (this.state === 1) ov.line3(this.a, this.snap.p, '#1c1e21', 1.6);
      if (this.state === 2) {
        const mid = V.mid(this.a, this.b);
        if (Math.abs(this.sag) > 1e-6) {
          const pts = D.arcPoints(this.a, this.b, V.add(mid, V.scale(this.w, this.sag)), this.segments);
          if (pts) ov.poly3(pts, false, this.semi ? '#c026d3' : '#1c1e21', null, 2);
          if (this.semi) { const s = this.cam.project(mid); ov.tip(s.x, s.y, 'Semicírculo', '#c026d3'); }
        } else ov.line3(this.a, this.b, '#1c1e21', 1.6);
        ov.line3(mid, V.add(mid, V.scale(this.w, this.sag)), '#888', 1, 3);
        return;
      }
      drawSnap(ov, this.snap);
    }
  }

  D.tools.LineTool = LineTool;
  D.tools.RectTool = RectTool;
  D.tools.CircleTool = CircleTool;
  D.tools.ArcTool = ArcTool;
})(typeof window !== 'undefined' ? window : globalThis);
