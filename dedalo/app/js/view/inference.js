/*
 * Dédalo — selección por rayo e inferencias (enganches).
 * Todo se calcula en la CPU sobre la geometría real: no hay buffer de selección.
 */
(function (root) {
  'use strict';
  const D = root.DEDALO;
  const { V, geom } = D;

  const AXES = [
    { key: 'x', dir: [1, 0, 0], color: '#d4463c', label: 'En eje rojo' },
    { key: 'y', dir: [0, 1, 0], color: '#2f9a4a', label: 'En eje verde' },
    { key: 'z', dir: [0, 0, 1], color: '#3a5fd4', label: 'En eje azul' }
  ];
  const COLORS = {
    endpoint: '#14a33a', midpoint: '#0aa2c0', center: '#14a33a', onEdge: '#d63a2f', onFace: '#2b4fd6',
    guide: '#6b6f76', intersection: '#0b0b0b', free: '#555', parallel: '#c026d3', tracking: '#555'
  };

  class Picker {
    constructor(app) { this.app = app; }
    get model() { return this.app.doc.model; }
    get cam() { return this.app.camera; }

    // Todas las intersecciones del rayo con caras, ordenadas.
    raycast(ray, exclude) {
      const m = this.model;
      const hits = [];
      for (const f of m.faces.values()) {
        if (exclude && exclude.has(f.id)) continue;
        const den = V.dot(f.n, ray.d);
        if (Math.abs(den) < 1e-12) continue;
        const t = (f.d - V.dot(f.n, ray.o)) / den;
        if (t <= 0) continue;
        const p = V.add(ray.o, V.scale(ray.d, t));
        let inside = false;
        for (const [a, b, c] of m.faceTriangles(f.id)) {
          if (inTri3(p, m.P(a), m.P(b), m.P(c), f.n)) { inside = true; break; }
        }
        if (inside) hits.push({ fid: f.id, t, p });
      }
      hits.sort((h1, h2) => h1.t - h2.t);
      return hits;
    }
    faceAt(x, y, exclude) {
      const hits = this.raycast(this.cam.ray(x, y), exclude);
      return hits[0] || null;
    }

    // ¿Se ve el punto p (ninguna cara delante)?
    visible(p, exclude) {
      if (this.app.renderer.opts.xray) return true;
      const s = this.cam.project(p);
      if (s.behind) return false;
      const ray = this.cam.ray(s.x, s.y);
      const tp = V.dot(V.sub(p, ray.o), ray.d);
      const tol = Math.max(1e-4, this.cam.pixelSize(p) * 1.5);
      const m = this.model;
      for (const f of m.faces.values()) {
        if (exclude && exclude.has(f.id)) continue;
        const den = V.dot(f.n, ray.d);
        if (Math.abs(den) < 1e-12) continue;
        const t = (f.d - V.dot(f.n, ray.o)) / den;
        if (t <= 0 || t >= tp - tol) continue;
        const q = V.add(ray.o, V.scale(ray.d, t));
        for (const [a, b, c] of m.faceTriangles(f.id)) {
          if (inTri3(q, m.P(a), m.P(b), m.P(c), f.n)) return false;
        }
      }
      return true;
    }

    nearVertices(x, y, r, skip) {
      const out = [];
      for (const v of this.model.verts.values()) {
        if (skip && skip.has(v.id)) continue;
        const s = this.cam.project(v.p);
        if (s.behind) continue;
        const d = Math.hypot(s.x - x, s.y - y);
        if (d <= r) out.push({ vid: v.id, p: v.p, d });
      }
      out.sort((a, b) => a.d - b.d);
      return out;
    }

    // Aristas cercanas en pantalla con el punto 3D más próximo al rayo.
    nearEdges(x, y, r, skipVerts) {
      const m = this.model;
      const out = [];
      const ray = this.cam.ray(x, y);
      for (const e of m.edges.values()) {
        if (skipVerts && (skipVerts.has(e.a) || skipVerts.has(e.b))) continue;
        if (e.soft && !this.app.renderer.opts.showHidden) continue;
        const A = m.P(e.a), B = m.P(e.b);
        const sa = this.cam.project(A), sb = this.cam.project(B);
        if (sa.behind && sb.behind) continue;
        const d2 = segDist2(x, y, sa, sb);
        if (d2.d > r) continue;
        // punto de la arista más cercano al rayo del ratón
        const c = geom.segSegClosest(A, B, ray.o, V.add(ray.o, V.scale(ray.d, 1e6)));
        out.push({ eid: e.id, p: c.c1, t: c.s, d: d2.d });
      }
      out.sort((a, b) => a.d - b.d);
      return out;
    }
  }

  function segDist2(x, y, a, b) {
    const abx = b.x - a.x, aby = b.y - a.y;
    const l2 = abx * abx + aby * aby;
    let t = l2 > 0 ? ((x - a.x) * abx + (y - a.y) * aby) / l2 : 0;
    t = Math.max(0, Math.min(1, t));
    return { d: Math.hypot(a.x + abx * t - x, a.y + aby * t - y), t };
  }

  function inTri3(p, a, b, c, n) {
    const e0 = V.cross(V.sub(b, a), V.sub(p, a));
    const e1 = V.cross(V.sub(c, b), V.sub(p, b));
    const e2 = V.cross(V.sub(a, c), V.sub(p, c));
    const s0 = V.dot(e0, n), s1 = V.dot(e1, n), s2 = V.dot(e2, n);
    const eps = -1e-12;
    return (s0 >= eps && s1 >= eps && s2 >= eps) || (s0 <= -eps && s1 <= -eps && s2 <= -eps);
  }

  /*
   * Motor de inferencias.
   * ctx: { start, plane, lockDir, skipVerts:Set, skipFaces:Set, noFace, refEdge }
   */
  class Inference {
    constructor(app) {
      this.app = app;
      this.picker = new Picker(app);
      this.tracking = [];      // puntos adquiridos para alinear [{p, t}]
      this._hoverKey = null; this._hoverSince = 0;
      this.snapR = 11; this.edgeR = 7; this.axisR = 12;
    }
    get cam() { return this.app.camera; }
    get model() { return this.app.doc.model; }

    resetTracking() { this.tracking = []; }

    infer(x, y, ctx) {
      ctx = ctx || {};
      const m = this.model, cam = this.cam, pk = this.picker;
      const skipV = ctx.skipVerts || null;
      const ray = cam.ray(x, y);
      const faceHit = ctx.noFace ? null : pk.faceAt(x, y, ctx.skipFaces);
      const res = (o) => this._finish(Object.assign({ x, y, faceHit }, o), ctx);

      // 0. Bloqueo de dirección (Mayús o flechas)
      if (ctx.lockDir && ctx.start) {
        const pts = this._pointSnaps(x, y, skipV, ctx) || (ctx.preferGuides ? this._guideSnap(x, y, ray, ctx) : null);
        const line = { o: ctx.start, d: V.norm(ctx.lockDir) };
        let p;
        let extra = null;
        if (pts) {
          p = projOnLine(pts.p, line);
          extra = { a: pts.p, b: p, color: '#555', dash: 3 };
        } else {
          const c = geom.lineLineClosest(line.o, line.d, ray.o, ray.d);
          p = c ? c.p1 : ctx.start;
        }
        return res({ p, type: 'locked', label: ctx.lockLabel || 'Bloqueado', color: ctx.lockColor || COLORS.parallel, axisLine: { a: ctx.start, b: p, color: ctx.lockColor || COLORS.parallel }, trackLine: extra });
      }

      // 1. Puntos: extremos, puntos medios, centros, puntos guía
      const ps = this._pointSnaps(x, y, skipV, ctx);
      if (ps) {
        this._acquire(ps);
        const out = Object.assign({}, ps);
        if (ctx.start) {
          const ax = axisOf(V.sub(ps.p, ctx.start));
          if (ax) out.axisLine = { a: ctx.start, b: ps.p, color: ax.color };
        }
        return res(out);
      }

      // The tape uses existing construction lines as targets before broad axis
      // inference can capture the pointer. Other tools retain their priority.
      if (ctx.preferGuides) {
        const guide = this._guideSnap(x, y, ray, ctx);
        if (guide) return res(guide);
      }

      // 2. Ejes desde el punto inicial (y arista de referencia paralela/perpendicular)
      let axisCand = null;
      if (ctx.start) {
        const dirs = AXES.map((a) => ({ dir: a.dir, color: a.color, label: a.label, key: a.key }));
        if (ctx.refEdge && m.edges.has(ctx.refEdge)) {
          const e = m.edges.get(ctx.refEdge);
          const ed = V.norm(V.sub(m.P(e.b), m.P(e.a)));
          if (!AXES.some((a) => V.parallel(a.dir, ed))) dirs.push({ dir: ed, color: COLORS.parallel, label: 'Paralela a arista', key: 'par' });
        }
        let best = null;
        for (const a of dirs) {
          const c = geom.lineLineClosest(ctx.start, a.dir, ray.o, ray.d);
          if (!c || c.t <= 0) continue;
          if (ctx.plane && Math.abs(V.dot(a.dir, ctx.plane.n)) > 1e-6) continue;
          const s = cam.project(c.p1);
          if (s.behind) continue;
          const d = Math.hypot(s.x - x, s.y - y);
          if (Math.abs(c.s) < 1e-9) continue;
          if (d <= this.axisR && (!best || d < best.d)) best = { d, p: c.p1, a };
        }
        if (best) axisCand = { p: best.p, type: 'axis', label: best.a.label, color: best.a.color, axisKey: best.a.key, axisDir: best.a.dir, axisLine: { a: ctx.start, b: best.p, color: best.a.color } };
      }

      // 2b. Seguimiento: el eje se cruza con una línea que sale de un punto adquirido
      if (axisCand) {
        const tr = this._trackOnLine(x, y, ctx.start, axisCand.axisDir);
        if (tr) { axisCand.p = tr.p; axisCand.trackLine = tr.line; axisCand.label = 'Desde punto'; }
        // ¿el eje corta una arista visible?
        const ne = pk.nearEdges(x, y, this.edgeR, skipV)[0];
        if (ne) {
          const e = m.edges.get(ne.eid);
          const c = geom.lineLineClosest(ctx.start, axisCand.axisDir, m.P(e.a), V.sub(m.P(e.b), m.P(e.a)));
          if (c && c.t >= 0 && c.t <= 1 && (!ctx.onPlaneOnly || !ctx.plane || Math.abs(geom.planeDist(ctx.plane, c.p2)) < 1e-6) && V.dist(c.p1, c.p2) < cam.pixelSize(c.p1) * 3) {
            axisCand.p = c.p2; axisCand.label = 'En arista'; axisCand.edge = ne.eid; axisCand.markColor = COLORS.onEdge;
          }
        }
        return res(axisCand);
      }

      // 3. Sobre una arista
      const ne = pk.nearEdges(x, y, this.edgeR, skipV);
      for (const c of ne) {
        if (ctx.onPlaneOnly && ctx.plane && Math.abs(geom.planeDist(ctx.plane, c.p)) > 1e-6) continue;
        if (!pk.visible(c.p, ctx.skipFaces)) continue;
        const out = { p: c.p, type: 'onEdge', label: 'En arista', color: COLORS.onEdge, edge: c.eid };
        if (ctx.start) { const ax = axisOf(V.sub(c.p, ctx.start)); if (ax) out.axisLine = { a: ctx.start, b: c.p, color: ax.color }; }
        return res(out);
      }

      // 4. Guías (líneas de construcción)
      const g = this._guideSnap(x, y, ray, ctx.preferGuides ? ctx : null);
      if (g) return res(g);

      // 5. Seguimiento sin punto inicial: alinear con un punto adquirido
      const tl = this._trackingSnap(x, y, ray, ctx, faceHit);
      if (tl) return res(tl);

      // 6. En una cara
      if (faceHit && !ctx.plane) {
        return res({ p: faceHit.p, type: 'onFace', label: 'En la cara', color: COLORS.onFace, face: faceHit.fid });
      }
      if (faceHit && ctx.plane) {
        const f = m.faces.get(faceHit.fid);
        if (geom.samePlane({ n: f.n, d: f.d }, ctx.plane)) return res({ p: faceHit.p, type: 'onFace', label: 'En la cara', color: COLORS.onFace, face: faceHit.fid });
      }

      // 7. Libre: plano de dibujo
      const p = this._freePoint(ray, ctx);
      const out = { p, type: 'free', label: '', color: COLORS.free };
      if (ctx.start) { const ax = axisOf(V.sub(p, ctx.start)); if (ax) out.axisLine = { a: ctx.start, b: p, color: ax.color }; }
      return res(out);
    }

    _finish(r, ctx) {
      if (ctx.plane && r.type !== 'locked') {
        const q = geom.projectToPlane(ctx.plane, r.p);
        if (!V.eq(q, r.p, 1e-7)) {
          // el enganche está fuera del plano: se proyecta y se marca la proyección
          r.trackLine = r.trackLine || { a: r.p, b: q, color: '#555', dash: 3 };
          r.p = q;
        }
      }
      return r;
    }

    _pointSnaps(x, y, skipV, ctx) {
      const m = this.model, pk = this.picker;
      const cands = [];
      for (const v of pk.nearVertices(x, y, this.snapR, skipV)) {
        if (ctx.skipStartPoint && ctx.start && V.dist(v.p, ctx.start) <= 1e-6) continue;
        if (ctx.onPlaneOnly && ctx.plane && Math.abs(geom.planeDist(ctx.plane, v.p)) > 1e-6) continue;
        if (!pk.visible(v.p, ctx.skipFaces)) continue;
        cands.push({ p: v.p, d: v.d, prio: 0, type: 'endpoint', label: 'Extremo', color: COLORS.endpoint, vertex: v.vid });
        break;
      }
      for (const e of m.edges.values()) {
        if (skipV && (skipV.has(e.a) || skipV.has(e.b))) continue;
        if (e.soft) continue;
        const mp = V.mid(m.P(e.a), m.P(e.b));
        const s = this.cam.project(mp);
        if (s.behind) continue;
        const d = Math.hypot(s.x - x, s.y - y);
        if (d > this.snapR) continue;
        if (!pk.visible(mp, ctx.skipFaces)) continue;
        cands.push({ p: mp, d, prio: 1, type: 'midpoint', label: 'Punto medio', color: COLORS.midpoint, edge: e.id });
      }
      for (const c of m.curves.values()) {
        if (!c.center) continue;
        const s = this.cam.project(c.center);
        if (s.behind) continue;
        const d = Math.hypot(s.x - x, s.y - y);
        if (d <= this.snapR) cands.push({ p: c.center, d, prio: 1, type: 'center', label: 'Centro', color: COLORS.center });
      }
      for (const a of m.annots.values()) {
        if (a.kind !== 'guidePoint') continue;
        if (!this.app.renderer.opts.showGuides) continue;
        const s = this.cam.project(a.p);
        const d = Math.hypot(s.x - x, s.y - y);
        if (!s.behind && d <= this.snapR) cands.push({ p: a.p, d, prio: 1, type: 'guide', label: 'Punto guía', color: COLORS.guide, guide: a.id });
      }
      // origen de ejes
      if (this.app.renderer.opts.showAxes) {
        const s = this.cam.project([0, 0, 0]);
        const d = Math.hypot(s.x - x, s.y - y);
        if (!s.behind && d <= this.snapR) cands.push({ p: [0, 0, 0], d, prio: 0.5, type: 'endpoint', label: 'Origen', color: COLORS.endpoint });
      }
      const usable = cands.filter(c => (!ctx.skipStartPoint || !ctx.start || V.dist(c.p, ctx.start) > 1e-6) && (!ctx.onPlaneOnly || !ctx.plane || Math.abs(geom.planeDist(ctx.plane, c.p)) <= 1e-6));
      if (!usable.length) return null;
      usable.sort((a, b) => (a.prio - b.prio) || (a.d - b.d));
      return usable[0];
    }

    _acquire(ps) {
      const key = ps.p.map((x) => x.toFixed(5)).join(',');
      const now = performance.now();
      if (key !== this._hoverKey) { this._hoverKey = key; this._hoverSince = now; return; }
      if (now - this._hoverSince < 280) return;
      if (this.tracking.some((t) => V.eq(t.p, ps.p))) return;
      this.tracking.push({ p: ps.p.slice() });
      if (this.tracking.length > 2) this.tracking.shift();
    }

    // Seguimiento sobre una recta (start, dir): cruce con ejes que salen de puntos adquiridos.
    _trackOnLine(x, y, start, dir) {
      let best = null;
      for (const t of this.tracking) {
        for (const a of AXES) {
          if (V.parallel(a.dir, dir)) continue;
          const c = geom.lineLineClosest(start, dir, t.p, a.dir);
          if (!c || V.dist(c.p1, c.p2) > 1e-6) continue;
          const s = this.cam.project(c.p1);
          const d = Math.hypot(s.x - x, s.y - y);
          if (d <= this.axisR && (!best || d < best.d)) best = { d, p: c.p1, line: { a: t.p, b: c.p1, color: a.color, dash: 4 } };
        }
      }
      return best;
    }

    _trackingSnap(x, y, ray, ctx, faceHit) {
      if (!this.tracking.length) return null;
      let best = null;
      for (const t of this.tracking) {
        for (const a of AXES) {
          if (ctx.plane && Math.abs(V.dot(a.dir, ctx.plane.n)) > 1e-6) continue;
          let p;
          if (faceHit && Math.abs(V.dot(a.dir, this.model.faces.get(faceHit.fid).n)) < 1e-6) {
            // la recta va por el plano de la cara: buscar el punto de la recta bajo el ratón
            const c = geom.lineLineClosest(t.p, a.dir, ray.o, ray.d);
            if (!c) continue; p = c.p1;
          } else {
            const c = geom.lineLineClosest(t.p, a.dir, ray.o, ray.d);
            if (!c) continue; p = c.p1;
          }
          const s = this.cam.project(p);
          if (s.behind) continue;
          const d = Math.hypot(s.x - x, s.y - y);
          if (d <= 8 && (!best || d < best.d)) best = { d, p, a, t };
        }
      }
      if (!best) return null;
      return { p: best.p, type: 'tracking', label: 'Desde punto', color: best.a.color, trackLine: { a: best.t.p, b: best.p, color: best.a.color, dash: 4 } };
    }

    _guideSnap(x, y, ray, ctx) {
      const m = this.model;
      if (!this.app.renderer.opts.showGuides) return null;
      let best = null;
      for (const a of m.annots.values()) {
        if (a.kind !== 'guideLine') continue;
        let p;
        if (ctx && ctx.plane && Math.abs(V.dot(a.dir, ctx.plane.n)) > 1e-8) {
          // A guide crossing the work plane has one precise intersection.
          const t = geom.rayPlane(a.p, a.dir, ctx.plane);
          if (t === null) continue;
          p = V.add(a.p, V.scale(a.dir, t));
        } else {
          if (ctx && ctx.plane && Math.abs(geom.planeDist(ctx.plane, a.p)) > 1e-6) continue;
          const c = geom.lineLineClosest(a.p, a.dir, ray.o, ray.d);
          if (c && c.t <= 0) continue;
          p = c ? c.p1 : a.p;
        }
        if (ctx && ctx.skipStartPoint && ctx.start && V.dist(p, ctx.start) < 1e-6) continue;
        const s = this.cam.project(p);
        if (s.behind) continue;
        const d = Math.hypot(s.x - x, s.y - y);
        if (d <= this.edgeR && (!best || d < best.d)) best = { d, p, guide: a.id, guideDir: a.dir.slice() };
      }
      return best ? { p: best.p, type: 'guide', label: 'En guía', color: COLORS.guide, guide: best.guide, guideDir: best.guideDir } : null;
    }

    _freePoint(ray, ctx) {
      const cam = this.cam;
      if (ctx.plane) {
        const t = geom.rayPlane(ray.o, ray.d, ctx.plane);
        if (t !== null && t > 0) return V.add(ray.o, V.scale(ray.d, t));
      }
      const fwd = cam.forward();
      let pl;
      if (ctx.start) {
        if (Math.abs(fwd[2]) > 0.18) pl = { n: [0, 0, 1], d: ctx.start[2] };
        else pl = Math.abs(fwd[0]) > Math.abs(fwd[1]) ? { n: [1, 0, 0], d: ctx.start[0] } : { n: [0, 1, 0], d: ctx.start[1] };
      } else {
        pl = { n: [0, 0, 1], d: 0 };
        if (Math.abs(fwd[2]) < 0.12) pl = Math.abs(fwd[0]) > Math.abs(fwd[1]) ? { n: [1, 0, 0], d: 0 } : { n: [0, 1, 0], d: 0 };
      }
      const t = geom.rayPlane(ray.o, ray.d, pl);
      if (t !== null && t > 0 && t < cam.dist * 60) return V.add(ray.o, V.scale(ray.d, t));
      // plano perpendicular a la vista por el objetivo (o el inicio)
      const o = ctx.start || cam.target;
      const t2 = geom.rayPlane(ray.o, ray.d, { n: fwd, d: V.dot(fwd, o) });
      return V.add(ray.o, V.scale(ray.d, t2 === null ? cam.dist : t2));
    }
  }

  function axisOf(d) {
    const l = V.len(d);
    if (l < 1e-9) return null;
    for (const a of AXES) if (V.parallel(a.dir, d)) return a;
    return null;
  }
  function projOnLine(p, line) {
    return V.add(line.o, V.scale(line.d, V.dot(V.sub(p, line.o), line.d)));
  }

  D.Picker = Picker;
  D.Inference = Inference;
  D.AXES = AXES;
  D.INF_COLORS = COLORS;
  D.axisOf = axisOf;
})(typeof window !== 'undefined' ? window : globalThis);
