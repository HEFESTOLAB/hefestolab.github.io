/*
 * Dédalo — modelo geométrico de aristas y caras (sin DOM).
 *
 * Reglas del modelo (las mismas que se ven al usar un modelador de caras):
 *  - Los vértices coincidentes se funden; un punto que cae dentro de una arista la parte.
 *  - Cuando unas aristas cierran un contorno plano, aparece la cara.
 *  - Una arista dibujada sobre una cara de borde a borde la divide; un contorno cerrado
 *    dentro de una cara crea una cara interior y deja un hueco en la exterior.
 *  - Borrar una arista borra las caras que limita, salvo que separe dos caras
 *    coplanarias: entonces las une.
 *  - Ninguna operación "arregla" geometría en silencio: si no puede hacerse, devuelve
 *    { ok: false, error } y el modelo queda como estaba (lo garantiza el historial).
 */
(function (root) {
  'use strict';
  const D = root.DEDALO;
  const { V, TOL, geom } = D;
  // UUIDs belong to authoritative geometry, independently of transient view IDs.
  D.uuid = D.uuid || (() => {
    if (root.crypto && typeof root.crypto.randomUUID === 'function') return root.crypto.randomUUID();
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
      const r = Math.floor(Math.random() * 16); return (c === 'x' ? r : (r & 3) | 8).toString(16);
    });
  });

  const planeOf = (f) => ({ n: f.n, d: f.d });

  class Model {
    constructor() { this.clear(); }

    clear() {
      this.verts = new Map();   // id → { id, p:[x,y,z] }
      this.edges = new Map();   // id → { id, a, b, soft, curve }
      this.faces = new Map();   // id → { id, loops:[[vid…]…], n, d, mat }
      this.vEdges = new Map();  // vid → Set(eid)
      this.eFaces = new Map();  // eid → Set(fid)
      this.edgeKey = new Map(); // "a|b" → eid
      this.curves = new Map();  // id → { id, kind, center, normal, radius, segments }
      this.materials = new Map(); // id → { id, name, color, opacity }
      this.annots = new Map();  // id → guía, cota o texto
      this.identities = new Map(); // numeric topology ID → persistent UUID
      this.nextId = 1;
      this._tri = new Map();
      this.rev = 0;
    }

    newId() { const id = this.nextId++; this.identities.set(id, D.uuid()); return id; }
    touch() { this.rev++; }

    /* ======================= Vértices ======================= */

    findVertex(p) {
      for (const v of this.verts.values()) if (V.eq(v.p, p)) return v.id;
      return null;
    }
    _addVertexRaw(p) {
      const id = this.newId();
      this.verts.set(id, { id, p: [p[0], p[1], p[2]] });
      this.vEdges.set(id, new Set());
      return id;
    }
    vertexAt(p) {
      const f = this.findVertex(p);
      return f !== null ? f : this._addVertexRaw(p);
    }
    // Como vertexAt, pero si el punto cae dentro de una arista la parte.
    vertexAtSplitting(p) {
      const f = this.findVertex(p);
      if (f !== null) return f;
      const eid = this.edgeContaining(p);
      if (eid !== null) return this.splitEdge(eid, p);
      return this._addVertexRaw(p);
    }
    edgeContaining(p) {
      for (const e of this.edges.values()) {
        const A = this.verts.get(e.a).p, B = this.verts.get(e.b).p;
        const c = geom.closestOnSegment(A, B, p);
        if (c.d <= TOL.point && V.dist(c.q, A) > TOL.point && V.dist(c.q, B) > TOL.point) return e.id;
      }
      return null;
    }
    P(vid) { return this.verts.get(vid).p; }

    /* ======================= Aristas ======================= */

    key(a, b) { return a < b ? a + '|' + b : b + '|' + a; }
    findEdge(a, b) {
      const e = this.edgeKey.get(this.key(a, b));
      return e === undefined ? null : e;
    }
    _addEdgeRaw(a, b, props) {
      if (a === b) return null;
      const k = this.key(a, b);
      const ex = this.edgeKey.get(k);
      if (ex !== undefined) return ex;
      const id = this.newId();
      this.edges.set(id, { id, a, b, soft: !!(props && props.soft), curve: (props && props.curve) || null });
      this.edgeKey.set(k, id);
      this.vEdges.get(a).add(id);
      this.vEdges.get(b).add(id);
      this.eFaces.set(id, new Set());
      return id;
    }
    _removeEdgeRaw(id) {
      const e = this.edges.get(id);
      if (!e) return;
      for (const f of [...this.eFaces.get(id)]) this._removeFaceRaw(f);
      this.edges.delete(id);
      this.edgeKey.delete(this.key(e.a, e.b));
      const sa = this.vEdges.get(e.a); if (sa) sa.delete(id);
      const sb = this.vEdges.get(e.b); if (sb) sb.delete(id);
      this.eFaces.delete(id);
    }
    _removeVertexIfOrphan(vid) {
      const s = this.vEdges.get(vid);
      if (s && s.size === 0) { this.verts.delete(vid); this.vEdges.delete(vid); }
    }
    edgeLen(eid) { const e = this.edges.get(eid); return V.dist(this.P(e.a), this.P(e.b)); }

    // Parte una arista en el punto p (o en el vértice existente vid). Devuelve el vértice.
    splitEdge(eid, p, vid) {
      const e = this.edges.get(eid);
      const { a, b } = e;
      if (vid === undefined || vid === null) vid = this._addVertexRaw(p);
      const faces = [...this.eFaces.get(eid)];
      const props = { soft: e.soft, curve: e.curve };
      this.eFaces.get(eid).clear();
      this._removeEdgeRaw(eid);
      const e1 = this._addEdgeRaw(a, vid, props);
      const e2 = this._addEdgeRaw(vid, b, props);
      for (const fid of faces) {
        const f = this.faces.get(fid);
        for (const loop of f.loops) {
          for (let i = 0; i < loop.length; i++) {
            const x = loop[i], y = loop[(i + 1) % loop.length];
            if ((x === a && y === b) || (x === b && y === a)) { loop.splice(i + 1, 0, vid); break; }
          }
        }
        this.eFaces.get(e1).add(fid);
        this.eFaces.get(e2).add(fid);
        this._tri.delete(fid);
      }
      return vid;
    }

    /*
     * Añade el segmento p→q, partiéndolo en los vértices que ya están sobre él y en los
     * cruces con otras aristas (que también se parten). Devuelve las aristas que lo
     * componen y cuáles son nuevas. No crea caras: eso lo hace autoFaces().
     */
    addSegment(p, q, props) {
      const a = this.vertexAtSplitting(p);
      const b = this.vertexAtSplitting(q);
      if (a === b) return { edges: [], created: [] };
      const P = this.P(a), Q = this.P(b);
      const dir = V.sub(Q, P);
      const L = V.len(dir);
      const marks = [{ t: 0, v: a }, { t: 1, v: b }];
      for (const vx of this.verts.values()) {
        if (vx.id === a || vx.id === b) continue;
        const c = geom.closestOnSegment(P, Q, vx.p);
        if (c.d <= TOL.point && c.t * L > TOL.point && (1 - c.t) * L > TOL.point) marks.push({ t: c.t, v: vx.id });
      }
      for (const e of [...this.edges.values()]) {
        if (!this.edges.has(e.id)) continue;
        if (e.a === a || e.a === b || e.b === a || e.b === b) continue;
        const A = this.P(e.a), B = this.P(e.b);
        if (V.parallel(dir, V.sub(B, A))) continue;
        const c = geom.segSegClosest(P, Q, A, B);
        if (c.d > TOL.point) continue;
        const lenE = V.dist(A, B);
        const inE = c.t * lenE > TOL.point && (1 - c.t) * lenE > TOL.point;
        const inP = c.s * L > TOL.point && (1 - c.s) * L > TOL.point;
        if (inE && inP) {
          const existing = this.findVertex(c.c1);
          const vid = this.splitEdge(e.id, c.c1, existing);
          marks.push({ t: c.s, v: vid });
        }
      }
      marks.sort((m1, m2) => m1.t - m2.t);
      const edges = [], created = [];
      for (let i = 0; i + 1 < marks.length; i++) {
        const u = marks[i].v, w = marks[i + 1].v;
        if (u === w) continue;
        let eid = this.findEdge(u, w);
        if (eid === null) { eid = this._addEdgeRaw(u, w, props); created.push(eid); }
        edges.push(eid);
      }
      return { edges, created };
    }

    // Polilínea (abierta o cerrada) + caras automáticas.
    addPolyline(points, closed, props, opts) {
      const created = [], all = [];
      const n = points.length;
      const m = closed ? n : n - 1;
      for (let i = 0; i < m; i++) {
        const r = this.addSegment(points[i], points[(i + 1) % n], props);
        created.push(...r.created);
        all.push(...r.edges);
      }
      const faces = this.autoFaces(created, opts);
      this.touch();
      return { edges: all, created, faces };
    }

    /* ======================= Caras ======================= */

    _addFaceRaw(loops, props) {
      const id = this.newId();
      const f = { id, loops: loops.map((l) => l.slice()), n: [0, 0, 1], d: 0, mat: (props && props.mat) || null };
      this.faces.set(id, f);
      this._computePlane(f);
      for (const loop of f.loops) {
        for (let i = 0; i < loop.length; i++) {
          const a = loop[i], b = loop[(i + 1) % loop.length];
          let e = this.findEdge(a, b);
          if (e === null) e = this._addEdgeRaw(a, b);
          this.eFaces.get(e).add(id);
        }
      }
      return id;
    }
    _removeFaceRaw(fid) {
      const f = this.faces.get(fid);
      if (!f) return;
      for (const e of this.faceEdges(f)) { const s = this.eFaces.get(e); if (s) s.delete(fid); }
      this.faces.delete(fid);
      this._tri.delete(fid);
    }
    faceEdges(f) {
      const out = [];
      for (const loop of f.loops) {
        for (let i = 0; i < loop.length; i++) {
          const e = this.findEdge(loop[i], loop[(i + 1) % loop.length]);
          if (e !== null) out.push(e);
        }
      }
      return out;
    }
    faceVerts(f) {
      const s = new Set();
      for (const loop of f.loops) for (const v of loop) s.add(v);
      return [...s];
    }
    _computePlane(f) {
      const pts = f.loops[0].map((v) => this.P(v));
      const nn = geom.newellNormal(pts);
      const l = V.len(nn);
      f.n = l > 1e-18 ? V.scale(nn, 1 / l) : [0, 0, 1];
      let s = 0;
      for (const p of pts) s += V.dot(f.n, p);
      f.d = s / pts.length;
      this._tri.delete(f.id);
    }
    _flipFace(f) {
      f.loops = f.loops.map((l) => l.slice().reverse());
      this._computePlane(f);
    }
    flipFaces(fids) {
      for (const fid of fids) { const f = this.faces.get(fid); if (f) this._flipFace(f); }
      this.touch();
    }
    faceBasis(f) { return geom.planeBasis(f.n, this.P(f.loops[0][0])); }
    faceLoops2(f, basis) { return f.loops.map((l) => l.map((v) => basis.to2(this.P(v)))); }

    // 1 dentro, 0 en el borde, -1 fuera. Vale también para "fotos" de caras ya borradas.
    pointInFace(f, p) {
      if (Math.abs(geom.planeDist(planeOf(f), p)) > TOL.plane * 10) return -1;
      const b = this.faceBasis(f);
      const q = b.to2(p);
      const L = this.faceLoops2(f, b);
      const r = geom.pointInPoly2(q, L[0], 1e-7);
      if (r <= 0) return r;
      for (let i = 1; i < L.length; i++) {
        const h = geom.pointInPoly2(q, L[i], 1e-7);
        if (h === 0) return 0;
        if (h > 0) return -1;
      }
      return 1;
    }

    // Triángulos [va, vb, vc] en sentido antihorario respecto a la normal.
    faceTriangles(fid) {
      let t = this._tri.get(fid);
      if (t) return t;
      const f = this.faces.get(fid);
      const b = this.faceBasis(f);
      const L = this.faceLoops2(f, b);
      const idx = geom.triangulate(L[0], L.slice(1));
      const flat = [].concat(...f.loops);
      t = [];
      for (let i = 0; i < idx.length; i += 3) t.push([flat[idx[i]], flat[idx[i + 1]], flat[idx[i + 2]]]);
      this._tri.set(fid, t);
      return t;
    }
    faceArea(fid) {
      let a = 0;
      for (const [x, y, z] of this.faceTriangles(fid)) {
        a += V.len(V.cross(V.sub(this.P(y), this.P(x)), V.sub(this.P(z), this.P(x)))) / 2;
      }
      return a;
    }
    faceCentroid(fid) {
      let a = 0, c = [0, 0, 0];
      for (const [x, y, z] of this.faceTriangles(fid)) {
        const A = this.P(x), B = this.P(y), C = this.P(z);
        const ar = V.len(V.cross(V.sub(B, A), V.sub(C, A))) / 2;
        c = V.add(c, V.scale(V.add(V.add(A, B), C), ar / 3));
        a += ar;
      }
      return a > 0 ? V.scale(c, 1 / a) : this.P(this.faces.get(fid).loops[0][0]);
    }
    // Un punto claramente interior de la cara (centro del triángulo más grande).
    faceInteriorPoint(f) {
      const b = this.faceBasis(f);
      const L = this.faceLoops2(f, b);
      const q = regionInterior2(L[0], L.slice(1));
      return b.to3(q);
    }
    faceHasDirected(f, a, b) {
      for (const loop of f.loops) {
        for (let i = 0; i < loop.length; i++) {
          if (loop[i] === a && loop[(i + 1) % loop.length] === b) return true;
        }
      }
      return false;
    }

    /* ============ Detección de caras en un plano (corazón del modelo) ============ */

    // Regiones planas (contorno + huecos) que forman las aristas dadas en una base 2D.
    _regions(basis, edgeIds) {
      let E = new Set(edgeIds);
      const P2 = new Map();
      const p2 = (v) => { let q = P2.get(v); if (!q) { q = basis.to2(this.P(v)); P2.set(v, q); } return q; };
      let cycles;
      for (let iter = 0; iter < 1000; iter++) {
        // podar aristas colgantes
        for (;;) {
          const deg = new Map();
          for (const eid of E) { const e = this.edges.get(eid); deg.set(e.a, (deg.get(e.a) || 0) + 1); deg.set(e.b, (deg.get(e.b) || 0) + 1); }
          let changed = false;
          for (const eid of [...E]) { const e = this.edges.get(eid); if (deg.get(e.a) === 1 || deg.get(e.b) === 1) { E.delete(eid); changed = true; } }
          if (!changed) break;
        }
        // semiaristas ordenadas por ángulo en cada vértice
        const out = new Map();
        for (const eid of E) {
          const e = this.edges.get(eid);
          for (const [u, w] of [[e.a, e.b], [e.b, e.a]]) {
            const pu = p2(u), pw = p2(w);
            if (!out.has(u)) out.set(u, []);
            out.get(u).push({ to: w, eid, ang: Math.atan2(pw[1] - pu[1], pw[0] - pu[0]) });
          }
        }
        for (const l of out.values()) l.sort((x, y) => x.ang - y.ang);
        const used = new Set();
        cycles = [];
        for (const [u0, list] of out) {
          for (const h0 of list) {
            const k0 = u0 + '>' + h0.to;
            if (used.has(k0)) continue;
            const cyc = [], ceds = [];
            let u = u0, h = h0, guard = 0;
            while (guard++ < 100000) {
              const k = u + '>' + h.to;
              if (used.has(k)) break;
              used.add(k);
              cyc.push(u); ceds.push(h.eid);
              const v = h.to;
              const lv = out.get(v);
              let i = lv.findIndex((x) => x.to === u);
              const nxt = lv[(i - 1 + lv.length) % lv.length];
              u = v; h = nxt;
            }
            cycles.push({ verts: cyc, edges: ceds, area: geom.area2(cyc.map(p2)) });
          }
        }
        // puentes: aristas recorridas dos veces por el mismo ciclo
        let bridges = false;
        for (const c of cycles) {
          const seen = new Set();
          for (const eid of c.edges) {
            if (seen.has(eid)) { E.delete(eid); bridges = true; }
            seen.add(eid);
          }
        }
        if (!bridges) break;
      }
      const regions = cycles.filter((c) => c.area > TOL.area).map((c) => ({ outer: c.verts, outerEdges: c.edges, holes: [], area: c.area }));
      const outers = cycles.filter((c) => c.area < -TOL.area);
      regions.sort((r1, r2) => r1.area - r2.area);
      for (const h of outers) {
        const hset = new Set(h.verts);
        for (const r of regions) {
          const rset = new Set(r.outer);
          const probe = h.verts.find((v) => !rset.has(v));
          if (probe === undefined) continue;
          if (hset.size && geom.pointInPoly2(p2(probe), r.outer.map(p2), 1e-9) > 0) { r.holes.push(h.verts); break; }
        }
      }
      for (const r of regions) {
        r.interior2 = regionInterior2(r.outer.map(p2), r.holes.map((h) => h.map(p2)));
        r.interior = basis.to3(r.interior2);
      }
      return regions;
    }

    /*
     * Recalcula las caras del plano `plane` alrededor de las aristas `seeds`.
     *  - Las caras afectadas se sustituyen por las regiones que caen dentro de ellas
     *    (heredan material y orientación).
     *  - Una región nueva es cara si su contorno exterior contiene una arista semilla.
     * opts: { noNew, involved:[fid], viewDir }
     */
    _reface(plane, seeds, opts) {
      opts = opts || {};
      const onPl = (vid) => Math.abs(geom.planeDist(plane, this.P(vid))) <= TOL.plane;
      const inPl = (eid) => { const e = this.edges.get(eid); return onPl(e.a) && onPl(e.b); };
      const seedSet = new Set(seeds.filter((e) => this.edges.has(e) && inPl(e)));
      // 1. componente conexa de aristas del plano
      const C = new Set(seedSet);
      const stack = [...seedSet];
      const seenV = new Set();
      while (stack.length) {
        const e = this.edges.get(stack.pop());
        for (const v of [e.a, e.b]) {
          if (seenV.has(v)) continue;
          seenV.add(v);
          for (const e2 of this.vEdges.get(v)) if (!C.has(e2) && inPl(e2)) { C.add(e2); stack.push(e2); }
        }
      }
      // 2. caras del plano afectadas
      const coplanar = [...this.faces.values()].filter((f) => geom.samePlane(planeOf(f), plane));
      const involved = new Set(opts.involved || []);
      for (const f of coplanar) {
        if (involved.has(f.id)) continue;
        let hit = this.faceEdges(f).some((e) => C.has(e));
        if (!hit) {
          for (const eid of C) {
            const e = this.edges.get(eid);
            if (this.pointInFace(f, V.mid(this.P(e.a), this.P(e.b))) > 0) { hit = true; break; }
          }
        }
        if (hit) involved.add(f.id);
      }
      if (C.size === 0 && involved.size === 0) return [];
      // 3. aristas en juego
      const E = new Set(C);
      for (const fid of involved) for (const e of this.faceEdges(this.faces.get(fid))) E.add(e);
      const origin = this.P(this.edges.get([...E][0]).a);
      const basis = geom.planeBasis(plane.n, origin);
      const regions = this._regions(basis, [...E]);
      const removed = [...involved].map((id) => this.faces.get(id));
      const keep = new Set();
      const plan = [];
      for (const R of regions) {
        const sig = sigOf([R.outer, ...R.holes]);
        const same = removed.find((f) => sigOf(f.loops) === sig);
        if (same) { keep.add(same.id); continue; }
        const ip = R.interior;
        if (coplanar.some((f) => !involved.has(f.id) && this.pointInFace(f, ip) > 0)) continue;
        const parent = removed.find((f) => this.pointInFace(f, ip) > 0);
        if (parent) {
          plan.push({ R, mat: parent.mat, sign: V.dot(parent.n, plane.n) > 0 ? 1 : -1 });
        } else if (!opts.noNew && R.outerEdges.some((e) => seedSet.has(e))) {
          plan.push({ R, mat: null, sign: 0 });
        }
      }
      for (const fid of involved) if (!keep.has(fid)) this._removeFaceRaw(fid);
      const created = [];
      for (const c of plan) {
        let loops = [c.R.outer, ...c.R.holes];
        const sign = c.sign || this._chooseSign(loops, plane, opts);
        if (sign < 0) loops = loops.map((l) => l.slice().reverse());
        created.push(this._addFaceRaw(loops, { mat: c.mat }));
      }
      return created;
    }

    // Orientación de una cara nueva: coherente con sus vecinas; si no tiene, hacia arriba
    // (horizontal) o hacia quien mira (vertical).
    _chooseSign(loops, plane, opts) {
      let votes = 0;
      const outer = loops[0];
      for (let i = 0; i < outer.length; i++) {
        const a = outer[i], b = outer[(i + 1) % outer.length];
        const e = this.findEdge(a, b);
        if (e === null) continue;
        for (const fid of this.eFaces.get(e)) {
          const g = this.faces.get(fid);
          if (this.faceHasDirected(g, a, b)) votes--;
          else if (this.faceHasDirected(g, b, a)) votes++;
        }
      }
      if (votes !== 0) return votes > 0 ? 1 : -1;
      if (Math.abs(plane.n[2]) > 0.999) return plane.n[2] > 0 ? 1 : -1;
      if (opts && opts.viewDir) return V.dot(plane.n, opts.viewDir) < 0 ? 1 : -1;
      return 1;
    }

    // Planos candidatos para las aristas nuevas y recálculo de caras en cada uno.
    autoFaces(created, opts) {
      created = created.filter((e) => this.edges.has(e));
      if (!created.length) return [];
      const planes = [];
      const addPlane = (pl) => { if (!planes.some((q) => geom.samePlane(q, pl))) planes.push(pl); };
      for (const eid of created) {
        const e = this.edges.get(eid);
        const A = this.P(e.a), B = this.P(e.b);
        const dir = V.sub(B, A);
        const mid = V.mid(A, B);
        for (const f of this.faces.values()) {
          const pl = planeOf(f);
          if (Math.abs(geom.planeDist(pl, A)) <= TOL.plane && Math.abs(geom.planeDist(pl, B)) <= TOL.plane && this.pointInFace(f, mid) >= 0) addPlane(pl);
        }
        for (const v of [e.a, e.b]) {
          for (const e2id of this.vEdges.get(v)) {
            if (e2id === eid) continue;
            const e2 = this.edges.get(e2id);
            const o = e2.a === v ? e2.b : e2.a;
            const d2 = V.sub(this.P(o), this.P(v));
            const nrm = V.cross(dir, d2);
            if (V.len(nrm) < 1e-12 || V.parallel(dir, d2)) continue;
            addPlane(geom.planeFromPointNormal(A, nrm));
          }
        }
      }
      const faces = [];
      for (const pl of planes) faces.push(...this._reface(pl, created, opts));
      return faces.filter((f) => this.faces.has(f));
    }

    /* ======================= Borrar ======================= */

    eraseFaces(fids) {
      for (const fid of fids) this._removeFaceRaw(fid);
      this.touch();
    }

    // Borra aristas: elimina las caras que limitan o une dos caras coplanarias.
    eraseEdges(eids, opts) {
      const ends = new Set();
      for (const eid of eids) {
        const e = this.edges.get(eid);
        if (!e) continue;
        ends.add(e.a); ends.add(e.b);
        const fs = [...this.eFaces.get(eid)].map((id) => this.faces.get(id));
        const snaps = fs.map((f) => ({ id: f.id, loops: f.loops.map((l) => l.slice()), n: f.n, d: f.d, mat: f.mat }));
        const merge = fs.length === 2 && geom.samePlane(planeOf(fs[0]), planeOf(fs[1]));
        for (const f of fs) this._removeFaceRaw(f.id);
        this._removeEdgeRaw(eid);
        if (merge) this._refill(planeOf(snaps[0]), snaps);
      }
      for (const v of ends) {
        if (!this.verts.has(v)) continue;
        if (!(opts && opts.noHeal)) this._healVertex(v);
        this._removeVertexIfOrphan(v);
      }
      this.touch();
    }

    // Vuelve a crear las regiones que caían dentro de caras borradas (fusión).
    _refill(plane, snaps) {
      const E = new Set();
      for (const s of snaps) {
        for (const loop of s.loops) for (let i = 0; i < loop.length; i++) {
          const e = this.findEdge(loop[i], loop[(i + 1) % loop.length]);
          if (e !== null) E.add(e);
        }
      }
      if (!E.size) return [];
      const basis = geom.planeBasis(plane.n, this.P(this.edges.get([...E][0]).a));
      const regions = this._regions(basis, [...E]);
      const created = [];
      for (const R of regions) {
        const ip = R.interior;
        if ([...this.faces.values()].some((f) => geom.samePlane(planeOf(f), plane) && this.pointInFace(f, ip) > 0)) continue;
        const parent = snaps.find((s) => this.pointInFace(s, ip) > 0);
        if (!parent) continue;
        let loops = [R.outer, ...R.holes];
        if (V.dot(parent.n, plane.n) < 0) loops = loops.map((l) => l.slice().reverse());
        created.push(this._addFaceRaw(loops, { mat: parent.mat }));
      }
      return created;
    }

    // Si un vértice queda con dos aristas alineadas e iguales, se funden en una.
    _healVertex(vid) {
      const es = [...(this.vEdges.get(vid) || [])];
      if (es.length !== 2) return;
      const e1 = this.edges.get(es[0]), e2 = this.edges.get(es[1]);
      const o1 = e1.a === vid ? e1.b : e1.a, o2 = e2.a === vid ? e2.b : e2.a;
      if (o1 === o2) return;
      const d1 = V.sub(this.P(o1), this.P(vid)), d2 = V.sub(this.P(o2), this.P(vid));
      if (!V.parallel(d1, d2) || V.dot(d1, d2) > 0) return;
      if (e1.soft !== e2.soft) return;
      const f1 = [...this.eFaces.get(e1.id)].sort().join(','), f2 = [...this.eFaces.get(e2.id)].sort().join(',');
      if (f1 !== f2) return;
      if (this.findEdge(o1, o2) !== null) return;
      const faces = [...this.eFaces.get(e1.id)];
      const props = { soft: e1.soft, curve: e1.curve === e2.curve ? e1.curve : null };
      this.eFaces.get(e1.id).clear(); this.eFaces.get(e2.id).clear();
      this._removeEdgeRaw(e1.id); this._removeEdgeRaw(e2.id);
      const ne = this._addEdgeRaw(o1, o2, props);
      for (const fid of faces) {
        const f = this.faces.get(fid);
        f.loops = f.loops.map((l) => l.filter((v) => v !== vid));
        this.eFaces.get(ne).add(fid);
        this._tri.delete(fid);
      }
      this._removeVertexIfOrphan(vid);
    }

    /* ======================= Empujar / tirar ======================= */

    /*
     * Empuja (dist < 0) o tira (dist > 0) de una cara a lo largo de su normal.
     *  - Si todas sus vecinas son perpendiculares, la cara se desplaza y las vecinas se estiran.
     *  - Si no, se extruye: paredes nuevas + tapa. Una cara suelta queda como base.
     *  - Si la tapa o una pared caen sobre una cara opuesta, se recortan (agujero pasante
     *    o muesca). Las paredes coplanarias con una vecina del mismo sentido se funden.
     * opts.keep: conservar la cara de partida (crear una nueva).
     */
    pushPull(fid, dist, opts) {
      opts = opts || {};
      const f = this.faces.get(fid);
      if (!f) return { ok: false, error: 'La cara ya no existe.' };
      if (Math.abs(dist) < TOL.point) return { ok: true, face: fid };
      const loopEdges = this.faceEdges(f);
      const others = (eid) => [...this.eFaces.get(eid)].filter((x) => x !== fid).map((x) => this.faces.get(x));
      const isFree = loopEdges.every((eid) => others(eid).length === 0);
      const attachedCoplanar = loopEdges.some((eid) => others(eid).some((g) => geom.samePlane(planeOf(g), planeOf(f))));

      if (!opts.keep && !isFree && !attachedCoplanar && this._canStretch(f)) {
        const r = this._stretch(f, dist);
        this.touch();
        return r;
      }

      let d = dist;
      const keepOrig = !!opts.keep || isFree;
      if (isFree && d < 0) { this._flipFace(f); d = -d; }
      const n = f.n;
      const loops = f.loops.map((l) => l.slice());
      const off = V.scale(n, d);
      const map = new Map();
      for (const loop of loops) for (const v of loop) if (!map.has(v)) map.set(v, this.vertexAtSplitting(V.add(this.P(v), off)));
      const newEdges = [];
      for (const loop of loops) {
        const m = loop.length;
        for (let i = 0; i < m; i++) {
          const a = loop[i], b = loop[(i + 1) % m], prev = loop[(i + m - 1) % m];
          const e0 = this.edges.get(this.findEdge(a, b));
          const ep = this.edges.get(this.findEdge(prev, a));
          newEdges.push(this._addEdgeRaw(map.get(a), map.get(b), { curve: e0.curve, soft: e0.soft }));
          const smooth = !!(e0.curve && ep.curve && e0.curve === ep.curve && this._curveSmooth(e0.curve));
          newEdges.push(this._addEdgeRaw(a, map.get(a), { soft: smooth }));
        }
      }
      const walls = [];
      for (const loop of loops) {
        const m = loop.length;
        for (let i = 0; i < m; i++) {
          const a = loop[i], b = loop[(i + 1) % m];
          walls.push(this._addFaceRaw([[a, b, map.get(b), map.get(a)]], {}));
        }
      }
      const cap = this._addFaceRaw(loops.map((l) => l.map((v) => map.get(v))), { mat: f.mat });
      if (keepOrig) { if (isFree) this._flipFace(f); }
      else this._removeFaceRaw(fid);

      // recortar solapes con caras opuestas (agujero pasante, muescas)
      const pre = new Set([cap, ...walls]);
      for (const xid of [cap, ...walls]) {
        const X = this.faces.get(xid);
        if (!X) continue;
        for (const G of [...this.faces.values()]) {
          if (G.id === xid || pre.has(G.id)) continue;
          if (!geom.samePlane(planeOf(X), planeOf(G)) || V.dot(X.n, G.n) > 0) continue;
          if (!X.loops[0].every((v) => this.pointInFace(G, this.P(v)) >= 0)) continue;
          if (this.pointInFace(G, this.faceInteriorPoint(X)) <= 0) continue;
          this._cancelOverlap(X, G);
          break;
        }
      }
      // fundir paredes coplanarias del mismo sentido
      const check = new Set(loopEdges);
      for (const e of newEdges) check.add(e);
      for (const eid of check) {
        if (!this.edges.has(eid)) continue;
        const fs = [...this.eFaces.get(eid)].map((x) => this.faces.get(x));
        if (fs.length === 2 && geom.samePlane(planeOf(fs[0]), planeOf(fs[1])) && V.dot(fs[0].n, fs[1].n) > 0) {
          this.eraseEdges([eid]);
        }
      }
      // aristas sueltas que deja la operación
      for (const eid of check) {
        if (this.edges.has(eid) && this.eFaces.get(eid).size === 0) {
          const e = this.edges.get(eid);
          this._removeEdgeRaw(eid);
          this._removeVertexIfOrphan(e.a); this._removeVertexIfOrphan(e.b);
        }
      }
      this.touch();
      return { ok: true, face: this.faces.has(cap) ? cap : null, mode: 'extrude' };
    }

    _curveSmooth(cid) {
      const c = this.curves.get(cid);
      return !c || c.kind !== 'polygon';
    }

    _canStretch(f) {
      const fv = this.faceVerts(f);
      for (const eid of this.faceEdges(f)) if (this.eFaces.get(eid).size < 2) return false;
      for (const v of fv) {
        for (const eid of this.vEdges.get(v)) {
          for (const gid of this.eFaces.get(eid)) {
            if (gid === f.id) continue;
            if (Math.abs(V.dot(this.faces.get(gid).n, f.n)) > 1e-6) return false;
          }
        }
      }
      return true;
    }

    _stretch(f, dist) {
      const fv = new Set(this.faceVerts(f));
      for (const v of fv) {
        for (const eid of this.vEdges.get(v)) {
          const e = this.edges.get(eid);
          const w = e.a === v ? e.b : e.a;
          if (fv.has(w)) continue;
          const h = V.dot(V.sub(this.P(w), this.P(v)), f.n);
          if (Math.abs(h) < TOL.point) continue;
          const after = h - dist;
          if (Math.sign(after) !== Math.sign(h) || Math.abs(after) < TOL.point) {
            return { ok: false, error: 'La cara no puede atravesar la geometría que tiene enfrente.' };
          }
        }
      }
      const off = V.scale(f.n, dist);
      this.transformVertices([...fv], (p) => V.add(p, off), { noRepair: true });
      return { ok: true, face: f.id, mode: 'stretch' };
    }

    // X solapa con G (coplanaria y de sentido opuesto): se quitan las dos zonas.
    _cancelOverlap(X, G) {
      const xLoops = X.loops.map((l) => l.slice());
      const xOuter = new Set(xLoops[0]);
      const xEdges = this.faceEdges(X);
      const gid = G.id;
      this._removeFaceRaw(X.id);
      const created = this._reface(planeOf(G), xEdges, { noNew: true, involved: [gid] });
      const matches = (f) => f.loops[0].length === xOuter.size && f.loops[0].every((v) => xOuter.has(v));
      for (const cid of created) { const c = this.faces.get(cid); if (c && matches(c)) this._removeFaceRaw(cid); }
      const g = this.faces.get(gid);
      if (g && matches(g)) this._removeFaceRaw(gid);
    }

    /* ======================= Transformar / copiar ======================= */

    transformVertices(vids, fn, opts) {
      for (const v of vids) { const x = this.verts.get(v); if (x) x.p = fn(x.p); }
      this._tri.clear();
      const fs = new Set();
      for (const v of vids) {
        const es = this.vEdges.get(v);
        if (!es) continue;
        for (const e of es) for (const f of this.eFaces.get(e)) fs.add(f);
      }
      for (const fid of fs) this._computePlane(this.faces.get(fid));
      if (!(opts && opts.noRepair)) this._repairNonPlanar([...fs]);
      for (const a of this.annots.values()) if (a.attach && vids.includes(a.attach)) { /* reservado */ }
      this.touch();
      return [...fs];
    }

    // Caras que dejan de ser planas se pliegan en triángulos (aristas suaves).
    _repairNonPlanar(fids) {
      for (const fid of fids) {
        const f = this.faces.get(fid);
        if (!f) continue;
        let maxd = 0;
        for (const loop of f.loops) for (const v of loop) maxd = Math.max(maxd, Math.abs(geom.planeDist(planeOf(f), this.P(v))));
        if (maxd <= TOL.plane) continue;
        const tris = this.faceTriangles(fid).map((t) => t.slice());
        const mat = f.mat;
        const boundary = new Set(this.faceEdges(f));
        this._removeFaceRaw(fid);
        for (const t of tris) {
          for (let i = 0; i < 3; i++) {
            const a = t[i], b = t[(i + 1) % 3];
            if (this.findEdge(a, b) === null) this._addEdgeRaw(a, b, { soft: true });
          }
          this._addFaceRaw([t], { mat });
        }
        void boundary;
      }
    }

    // Duplica caras y aristas aplicando fn a los puntos. Devuelve los ids nuevos.
    copyEntities(fids, eids, fn) {
      const vset = new Set();
      const eset = new Set(eids);
      for (const fid of fids) {
        const f = this.faces.get(fid);
        for (const loop of f.loops) for (const v of loop) vset.add(v);
        for (const e of this.faceEdges(f)) eset.add(e);
      }
      for (const eid of eset) { const e = this.edges.get(eid); vset.add(e.a); vset.add(e.b); }
      const map = new Map();
      for (const v of vset) map.set(v, this.vertexAtSplitting(fn(this.P(v))));
      const newE = [], newF = [];
      for (const eid of eset) {
        const e = this.edges.get(eid);
        const ne = this._addEdgeRaw(map.get(e.a), map.get(e.b), { soft: e.soft, curve: e.curve });
        if (ne !== null) newE.push(ne);
      }
      for (const fid of fids) {
        const f = this.faces.get(fid);
        const loops = f.loops.map((l) => l.map((v) => map.get(v)));
        const sig = sigOf(loops);
        if ([...this.faces.values()].some((g) => sigOf(g.loops) === sig)) continue;
        newF.push(this._addFaceRaw(loops, { mat: f.mat }));
      }
      this.touch();
      return { faces: newF, edges: newE };
    }

    /* ======================= Equidistancia ======================= */

    // Copia el contorno de una cara hacia dentro (d > 0) o hacia fuera (d < 0).
    offsetFace(fid, d, opts) {
      const f = this.faces.get(fid);
      if (!f) return { ok: false, error: 'La cara ya no existe.' };
      const b = this.faceBasis(f);
      const outer = f.loops[0].map((v) => b.to2(this.P(v)));
      const off = geom.offsetPolygon2(outer, d);
      const a0 = geom.area2(outer), a1 = geom.area2(off);
      if (Math.sign(a0) !== Math.sign(a1) || Math.abs(a1) < 1e-10) return { ok: false, error: 'La distancia es demasiado grande para esta cara.' };
      // comprobación simple de autointersección
      for (let i = 0; i < off.length; i++) {
        for (let j = i + 2; j < off.length; j++) {
          if (i === 0 && j === off.length - 1) continue;
          if (segCross2(off[i], off[(i + 1) % off.length], off[j], off[(j + 1) % off.length])) {
            return { ok: false, error: 'La equidistancia se cruza consigo misma: prueba una distancia menor.' };
          }
        }
      }
      let props = {};
      const es = f.loops[0].map((v, i) => this.edges.get(this.findEdge(v, f.loops[0][(i + 1) % f.loops[0].length])));
      const c0 = es[0].curve;
      if (c0 && es.every((e) => e.curve === c0)) {
        const c = this.curves.get(c0);
        if (c) {
          const nc = { id: this.newId(), kind: c.kind, center: c.center.slice(), normal: c.normal.slice(), radius: Math.max(0, c.radius - d), segments: c.segments };
          this.curves.set(nc.id, nc);
          props = { curve: nc.id };
        }
      }
      const pts = off.map((q) => b.to3(q));
      const r = this.addPolyline(pts, true, props, opts);
      return { ok: true, faces: r.faces, edges: r.edges };
    }

    /* ======================= Figuras ======================= */

    addRectangle(origin, u, v, w, h, opts) {
      const U = V.scale(V.norm(u), w), W = V.scale(V.norm(v), h);
      const pts = [origin, V.add(origin, U), V.add(V.add(origin, U), W), V.add(origin, W)];
      return this.addPolyline(pts, true, {}, opts);
    }

    circlePoints(center, normal, radius, segments, startDir) {
      const n = V.norm(normal);
      let u;
      if (startDir && V.len(V.sub(startDir, V.scale(n, V.dot(startDir, n)))) > 1e-9) u = V.norm(V.sub(startDir, V.scale(n, V.dot(startDir, n))));
      else {
        const x = [1, 0, 0];
        const px = V.sub(x, V.scale(n, V.dot(x, n)));
        u = V.len(px) > 1e-6 ? V.norm(px) : V.norm(V.sub([0, 1, 0], V.scale(n, n[1])));
      }
      const w = V.cross(n, u);
      const pts = [];
      for (let i = 0; i < segments; i++) {
        const a = (2 * Math.PI * i) / segments;
        pts.push(V.add(center, V.add(V.scale(u, radius * Math.cos(a)), V.scale(w, radius * Math.sin(a)))));
      }
      return pts;
    }

    addCircle(center, normal, radius, segments, opts, kind, startDir) {
      segments = Math.max(3, Math.min(720, Math.round(segments || 24)));
      const c = { id: this.newId(), kind: kind || 'circle', center: center.slice(), normal: V.norm(normal), radius, segments };
      this.curves.set(c.id, c);
      const pts = this.circlePoints(center, normal, radius, segments, startDir);
      return this.addPolyline(pts, true, { curve: c.id }, opts);
    }

    addArc(points, opts) {
      const c = { id: this.newId(), kind: 'arc', segments: points.length - 1 };
      this.curves.set(c.id, c);
      return this.addPolyline(points, false, { curve: c.id }, opts);
    }

    curveEdges(cid) {
      const out = [];
      for (const e of this.edges.values()) if (e.curve === cid) out.push(e.id);
      return out;
    }

    /* ======================= Materiales ======================= */

    addMaterial(name, color, opacity) {
      for (const m of this.materials.values()) if (m.color === color && (m.opacity || 1) === (opacity || 1)) return m.id;
      const id = this.newId();
      this.materials.set(id, { id, name: name || color, color, opacity: opacity === undefined ? 1 : opacity });
      this.touch();
      return id;
    }
    paintFaces(fids, matId) {
      for (const fid of fids) { const f = this.faces.get(fid); if (f) f.mat = matId; }
      this.touch();
    }

    /* ======================= Consultas ======================= */

    bbox(vids) {
      const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
      const it = vids ? vids.map((v) => this.verts.get(v)).filter(Boolean) : this.verts.values();
      let any = false;
      for (const v of it) {
        any = true;
        for (let i = 0; i < 3; i++) { if (v.p[i] < min[i]) min[i] = v.p[i]; if (v.p[i] > max[i]) max[i] = v.p[i]; }
      }
      return any ? { min, max } : null;
    }

    // Geometría conectada a unas entidades (triple clic).
    connected(fids, eids) {
      const vs = new Set();
      for (const fid of fids) { const f = this.faces.get(fid); if (f) for (const v of this.faceVerts(f)) vs.add(v); }
      for (const eid of eids) { const e = this.edges.get(eid); if (e) { vs.add(e.a); vs.add(e.b); } }
      const stack = [...vs];
      const E = new Set(), F = new Set();
      while (stack.length) {
        const v = stack.pop();
        for (const eid of this.vEdges.get(v) || []) {
          if (E.has(eid)) continue;
          E.add(eid);
          const e = this.edges.get(eid);
          for (const w of [e.a, e.b]) if (!vs.has(w)) { vs.add(w); stack.push(w); }
          for (const fid of this.eFaces.get(eid)) {
            if (F.has(fid)) continue;
            F.add(fid);
            // los huecos de una cara también están "conectados" a ella
            for (const w of this.faceVerts(this.faces.get(fid))) if (!vs.has(w)) { vs.add(w); stack.push(w); }
          }
        }
      }
      return { faces: [...F], edges: [...E], verts: [...vs] };
    }

    // ¿Las caras forman un sólido cerrado y bien orientado?
    isClosed(fids) {
      const set = new Set(fids);
      const count = new Map();
      for (const fid of fids) {
        const f = this.faces.get(fid);
        for (const loop of f.loops) for (let i = 0; i < loop.length; i++) {
          const k = loop[i] + '>' + loop[(i + 1) % loop.length];
          count.set(k, (count.get(k) || 0) + 1);
        }
      }
      for (const [k, c] of count) {
        if (c !== 1) return false;
        const [a, b] = k.split('>');
        if (count.get(b + '>' + a) !== 1) return false;
      }
      return set.size > 0;
    }

    volume(fids) {
      let v = 0;
      for (const fid of fids) {
        for (const [a, b, c] of this.faceTriangles(fid)) v += V.dot(this.P(a), V.cross(this.P(b), this.P(c))) / 6;
      }
      return v;
    }

    stats() {
      return { vertices: this.verts.size, edges: this.edges.size, faces: this.faces.size, materials: this.materials.size, annotations: this.annots.size };
    }

    // Comprobación de coherencia interna (la usan las pruebas).
    validate() {
      const errs = [];
      for (const [k, eid] of this.edgeKey) if (!this.edges.has(eid)) errs.push('clave de arista huérfana ' + k);
      for (const e of this.edges.values()) {
        if (!this.verts.has(e.a) || !this.verts.has(e.b)) errs.push('arista ' + e.id + ' sin vértice');
        for (const fid of this.eFaces.get(e.id)) if (!this.faces.has(fid)) errs.push('arista ' + e.id + ' apunta a cara inexistente ' + fid);
      }
      for (const f of this.faces.values()) {
        for (const loop of f.loops) {
          if (loop.length < 3) errs.push('cara ' + f.id + ' con contorno de ' + loop.length);
          for (let i = 0; i < loop.length; i++) {
            const e = this.findEdge(loop[i], loop[(i + 1) % loop.length]);
            if (e === null) errs.push('cara ' + f.id + ' sin arista ' + loop[i] + '-' + loop[(i + 1) % loop.length]);
            else if (!this.eFaces.get(e).has(f.id)) errs.push('arista ' + e + ' no conoce la cara ' + f.id);
            if (Math.abs(geom.planeDist(planeOf(f), this.P(loop[i]))) > TOL.plane * 10) errs.push('cara ' + f.id + ' no plana');
          }
        }
      }
      return errs;
    }

    /* ======================= Serialización ======================= */

    toJSON() {
      const ids = new Set();
      for (const map of [this.verts, this.edges, this.faces, this.curves, this.materials, this.annots]) for (const id of map.keys()) ids.add(id);
      for (const id of ids) if (!this.identities.has(id)) this.identities.set(id, D.uuid());
      return {
        format: 'dedalo.model', version: 1,
        nextId: this.nextId,
        verts: [...this.verts.values()].map((v) => [v.id, v.p[0], v.p[1], v.p[2]]),
        edges: [...this.edges.values()].map((e) => [e.id, e.a, e.b, e.soft ? 1 : 0, e.curve || 0]),
        faces: [...this.faces.values()].map((f) => ({ id: f.id, loops: f.loops, mat: f.mat })),
        curves: [...this.curves.values()],
        materials: [...this.materials.values()],
        annots: [...this.annots.values()],
        identities: Object.fromEntries([...ids].map(id => [id, this.identities.get(id)]))
      };
    }

    static fromJSON(j) {
      const m = new Model();
      m.load(j);
      return m;
    }

    load(j) {
      this.clear();
      if (!j || j.format !== 'dedalo.model') throw new Error('No es un modelo de Dédalo.');
      for (const [id, x, y, z] of j.verts) { this.verts.set(id, { id, p: [x, y, z] }); this.vEdges.set(id, new Set()); }
      for (const [id, a, b, soft, curve] of j.edges) {
        this.edges.set(id, { id, a, b, soft: !!soft, curve: curve || null });
        this.edgeKey.set(this.key(a, b), id);
        this.vEdges.get(a).add(id); this.vEdges.get(b).add(id);
        this.eFaces.set(id, new Set());
      }
      for (const fj of j.faces) {
        const f = { id: fj.id, loops: fj.loops.map((l) => l.slice()), n: [0, 0, 1], d: 0, mat: fj.mat || null };
        this.faces.set(f.id, f);
        this._computePlane(f);
        for (const e of this.faceEdges(f)) this.eFaces.get(e).add(f.id);
      }
      for (const c of j.curves || []) this.curves.set(c.id, c);
      for (const mt of j.materials || []) this.materials.set(mt.id, mt);
      for (const a of j.annots || []) this.annots.set(a.id, a);
      for (const map of [this.verts, this.edges, this.faces, this.curves, this.materials, this.annots]) for (const id of map.keys()) this.identities.set(id, (j.identities && j.identities[id]) || D.uuid());
      let maxId = 0;
      for (const id of this.identities.keys()) if (id > maxId) maxId = id;
      this.nextId = Math.max(j.nextId || 1, 1 + maxId);
      this.touch();
    }
  }

  /* ---------------- ayudas internas ---------------- */

  function sigOf(loops) {
    const all = [];
    for (const l of loops) for (const v of l) all.push(v);
    all.sort((a, b) => a - b);
    return loops.length + ':' + all.join(',');
  }

  function regionInterior2(outer, holes) {
    const pts = outer.concat(...holes);
    const idx = geom.triangulate(outer, holes);
    let best = -1, bp = null;
    for (let i = 0; i < idx.length; i += 3) {
      const a = pts[idx[i]], b = pts[idx[i + 1]], c = pts[idx[i + 2]];
      const ar = Math.abs((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]));
      if (ar > best) { best = ar; bp = [(a[0] + b[0] + c[0]) / 3, (a[1] + b[1] + c[1]) / 3]; }
    }
    return bp || outer[0];
  }

  function segCross2(a, b, c, d) {
    const o = (p, q, r) => (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]);
    const d1 = o(a, b, c), d2 = o(a, b, d), d3 = o(c, d, a), d4 = o(c, d, b);
    return ((d1 > 1e-12 && d2 < -1e-12) || (d1 < -1e-12 && d2 > 1e-12)) && ((d3 > 1e-12 && d4 < -1e-12) || (d3 < -1e-12 && d4 > 1e-12));
  }

  D.Model = Model;
  D.modelUtil = { sigOf, planeOf };
})(typeof window !== 'undefined' ? window : globalThis);
