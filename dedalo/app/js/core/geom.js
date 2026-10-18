/*
 * Dédalo — utilidades geométricas puras (sin DOM).
 * Vectores como arrays [x, y, z]; unidades en metros; eje Z hacia arriba.
 */
(function (root) {
  'use strict';
  const D = root.DEDALO = root.DEDALO || {};

  // Tolerancias con nombre: ninguna comparación usa números sueltos.
  const TOL = {
    point: 1e-6,     // dos puntos más cerca que esto son el mismo
    plane: 1e-5,     // distancia máxima de un punto a un plano para "estar" en él
    parallel: 1e-7,  // 1 - |cos| por debajo de esto, dos direcciones son paralelas
    area: 1e-12
  };

  const V = {
    add: (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]],
    sub: (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]],
    scale: (a, s) => [a[0] * s, a[1] * s, a[2] * s],
    dot: (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2],
    cross: (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]],
    len: (a) => Math.hypot(a[0], a[1], a[2]),
    len2: (a) => a[0] * a[0] + a[1] * a[1] + a[2] * a[2],
    dist: (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]),
    neg: (a) => [-a[0], -a[1], -a[2]],
    mid: (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2],
    lerp: (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t],
    clone: (a) => [a[0], a[1], a[2]],
    eq: (a, b, tol) => V.dist(a, b) <= (tol === undefined ? TOL.point : tol),
    norm(a) {
      const l = V.len(a);
      return l > 0 ? [a[0] / l, a[1] / l, a[2] / l] : [0, 0, 0];
    },
    // Un vector unitario cualquiera perpendicular a n.
    perp(n) {
      const a = Math.abs(n[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0];
      return V.norm(V.cross(n, a));
    },
    parallel(a, b) {
      const la = V.len(a), lb = V.len(b);
      if (la === 0 || lb === 0) return false;
      return 1 - Math.abs(V.dot(a, b) / (la * lb)) < TOL.parallel;
    },
    angle(a, b) {
      const la = V.len(a), lb = V.len(b);
      if (la === 0 || lb === 0) return 0;
      return Math.acos(Math.max(-1, Math.min(1, V.dot(a, b) / (la * lb))));
    },
    // Rota p alrededor del eje (origen o, dirección unitaria k) un ángulo a (Rodrigues).
    rotate(p, o, k, a) {
      const v = V.sub(p, o);
      const c = Math.cos(a), s = Math.sin(a);
      const kxv = V.cross(k, v);
      const kdv = V.dot(k, v);
      return [
        o[0] + v[0] * c + kxv[0] * s + k[0] * kdv * (1 - c),
        o[1] + v[1] * c + kxv[1] * s + k[1] * kdv * (1 - c),
        o[2] + v[2] * c + kxv[2] * s + k[2] * kdv * (1 - c)
      ];
    }
  };

  // Normal de un polígono 3D por el método de Newell (robusta con vértices alineados).
  function newellNormal(pts) {
    let x = 0, y = 0, z = 0;
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i], b = pts[(i + 1) % pts.length];
      x += (a[1] - b[1]) * (a[2] + b[2]);
      y += (a[2] - b[2]) * (a[0] + b[0]);
      z += (a[0] - b[0]) * (a[1] + b[1]);
    }
    return [x, y, z]; // longitud = 2 × área
  }

  // Plano {n, d} con n·p = d, n unitario.
  function planeFromPointNormal(p, n) {
    const u = V.norm(n);
    return { n: u, d: V.dot(u, p) };
  }
  function planeDist(pl, p) { return V.dot(pl.n, p) - pl.d; }
  function samePlane(a, b) {
    if (!V.parallel(a.n, b.n)) return false;
    const s = V.dot(a.n, b.n) > 0 ? 1 : -1;
    return Math.abs(a.d - s * b.d) <= TOL.plane;
  }
  function projectToPlane(pl, p) { return V.sub(p, V.scale(pl.n, planeDist(pl, p))); }

  // Intersección rayo–plano: devuelve t (o null si es paralelo).
  function rayPlane(o, dir, pl) {
    const den = V.dot(pl.n, dir);
    if (Math.abs(den) < 1e-12) return null;
    return (pl.d - V.dot(pl.n, o)) / den;
  }

  // Base ortonormal de un plano para pasar a 2D.
  function planeBasis(n, origin) {
    const u = V.perp(n);
    const v = V.cross(n, u);
    return {
      o: origin || [0, 0, 0], u, v, n,
      to2(p) { const d = V.sub(p, this.o); return [V.dot(d, this.u), V.dot(d, this.v)]; },
      to3(q) { return V.add(this.o, V.add(V.scale(this.u, q[0]), V.scale(this.v, q[1]))); }
    };
  }

  // Punto más cercano entre segmento [a,b] y punto p: devuelve {t, q, d}.
  function closestOnSegment(a, b, p) {
    const ab = V.sub(b, a);
    const l2 = V.len2(ab);
    let t = l2 > 0 ? V.dot(V.sub(p, a), ab) / l2 : 0;
    t = Math.max(0, Math.min(1, t));
    const q = V.add(a, V.scale(ab, t));
    return { t, q, d: V.dist(p, q) };
  }

  // Puntos más cercanos entre dos segmentos 3D.
  function segSegClosest(p1, q1, p2, q2) {
    const d1 = V.sub(q1, p1), d2 = V.sub(q2, p2), r = V.sub(p1, p2);
    const a = V.dot(d1, d1), e = V.dot(d2, d2), f = V.dot(d2, r);
    let s, t;
    if (a <= 1e-18 && e <= 1e-18) { s = t = 0; }
    else if (a <= 1e-18) { s = 0; t = Math.max(0, Math.min(1, f / e)); }
    else {
      const c = V.dot(d1, r);
      if (e <= 1e-18) { t = 0; s = Math.max(0, Math.min(1, -c / a)); }
      else {
        const b = V.dot(d1, d2);
        const den = a * e - b * b;
        s = den > 1e-18 ? Math.max(0, Math.min(1, (b * f - c * e) / den)) : 0;
        t = (b * s + f) / e;
        if (t < 0) { t = 0; s = Math.max(0, Math.min(1, -c / a)); }
        else if (t > 1) { t = 1; s = Math.max(0, Math.min(1, (b - c) / a)); }
      }
    }
    const c1 = V.add(p1, V.scale(d1, s)), c2 = V.add(p2, V.scale(d2, t));
    return { s, t, c1, c2, d: V.dist(c1, c2) };
  }

  // Puntos más cercanos entre dos rectas infinitas (o, d) — para inferencias.
  function lineLineClosest(o1, d1, o2, d2) {
    const r = V.sub(o1, o2);
    const a = V.dot(d1, d1), b = V.dot(d1, d2), c = V.dot(d1, r), e = V.dot(d2, d2), f = V.dot(d2, r);
    const den = a * e - b * b;
    if (Math.abs(den) < 1e-14) return null;
    const s = (b * f - c * e) / den;
    const t = (a * f - b * c) / den;
    return { s, t, p1: V.add(o1, V.scale(d1, s)), p2: V.add(o2, V.scale(d2, t)) };
  }

  /* ---------------- 2D ---------------- */

  function area2(poly) {
    let a = 0;
    for (let i = 0, n = poly.length; i < n; i++) {
      const p = poly[i], q = poly[(i + 1) % n];
      a += p[0] * q[1] - q[0] * p[1];
    }
    return a / 2;
  }

  // Punto en polígono (par-impar). Devuelve 1 dentro, 0 en el borde, -1 fuera.
  function pointInPoly2(p, poly, tol) {
    tol = tol === undefined ? 1e-9 : tol;
    let inside = false;
    for (let i = 0, n = poly.length, j = n - 1; i < n; j = i++) {
      const a = poly[j], b = poly[i];
      // ¿sobre el borde?
      const abx = b[0] - a[0], aby = b[1] - a[1];
      const l2 = abx * abx + aby * aby;
      if (l2 > 0) {
        let t = ((p[0] - a[0]) * abx + (p[1] - a[1]) * aby) / l2;
        t = Math.max(0, Math.min(1, t));
        const dx = a[0] + abx * t - p[0], dy = a[1] + aby * t - p[1];
        if (dx * dx + dy * dy <= tol * tol) return 0;
      }
      if ((a[1] > p[1]) !== (b[1] > p[1])) {
        const x = a[0] + (p[1] - a[1]) * (b[0] - a[0]) / (b[1] - a[1]);
        if (p[0] < x) inside = !inside;
      }
    }
    return inside ? 1 : -1;
  }

  /*
   * Triangulación por recorte de orejas con agujeros (código propio).
   * outer: [[x,y]...], holes: [[[x,y]...]...]. Devuelve índices sobre la
   * concatenación outer + holes[0] + holes[1] + ...
   */
  function triangulate(outer, holes) {
    holes = holes || [];
    const pts = [];
    let outerIdx = outer.map((p) => pts.push(p) - 1);
    if (area2(outer) < 0) outerIdx.reverse();
    const holeIdx = holes.map((h) => {
      const idx = h.map((p) => pts.push(p) - 1);
      if (area2(h) > 0) idx.reverse(); // agujeros en sentido horario
      return idx;
    }).filter((h) => h.length >= 3);

    // Escala para las tolerancias relativas.
    let minx = Infinity, miny = Infinity, maxx = -Infinity, maxy = -Infinity;
    for (const p of pts) {
      if (p[0] < minx) minx = p[0]; if (p[0] > maxx) maxx = p[0];
      if (p[1] < miny) miny = p[1]; if (p[1] > maxy) maxy = p[1];
    }
    const size = Math.max(maxx - minx, maxy - miny, 1e-9);
    const eps = 1e-12 * size * size;
    const same = (i, j) => Math.abs(pts[i][0] - pts[j][0]) <= 1e-12 * size && Math.abs(pts[i][1] - pts[j][1]) <= 1e-12 * size;

    // Puentes de agujeros: del vértice más a la derecha del agujero hacia +x.
    holeIdx.sort((a, b) => maxX(b) - maxX(a));
    function maxX(h) { let m = -Infinity; for (const i of h) m = Math.max(m, pts[i][0]); return m; }

    let poly = outerIdx;
    for (const h of holeIdx) poly = bridgeHole(poly, h);

    return earClip(poly);

    function bridgeHole(poly, hole) {
      // vértice M del agujero con mayor x
      let mi = 0;
      for (let i = 1; i < hole.length; i++) if (pts[hole[i]][0] > pts[hole[mi]][0]) mi = i;
      const M = pts[hole[mi]];
      // rayo hacia +x: arista más cercana del polígono
      let bestX = Infinity, bestK = -1;
      for (let k = 0; k < poly.length; k++) {
        const a = pts[poly[k]], b = pts[poly[(k + 1) % poly.length]];
        if ((a[1] - M[1]) * (b[1] - M[1]) > 0) continue;
        if (a[1] === b[1]) {
          // arista horizontal sobre el rayo
          if (a[1] !== M[1]) continue;
          const x = Math.min(a[0], b[0]);
          if (x >= M[0] && x < bestX) { bestX = x; bestK = k; }
          continue;
        }
        const x = a[0] + (M[1] - a[1]) * (b[0] - a[0]) / (b[1] - a[1]);
        if (x >= M[0] - eps && x < bestX) { bestX = x; bestK = k; }
      }
      if (bestK < 0) return poly; // agujero fuera: se ignora
      const ka = poly[bestK], kb = poly[(bestK + 1) % poly.length];
      // candidato P: extremo de la arista con mayor x
      let pk = pts[ka][0] > pts[kb][0] ? bestK : (bestK + 1) % poly.length;
      const I = [bestX, M[1]];
      const P = pts[poly[pk]];
      // ¿algún vértice reflejo dentro del triángulo M, I, P? escoger el de menor ángulo
      let bestAng = Infinity;
      for (let k = 0; k < poly.length; k++) {
        const R = pts[poly[k]];
        if (k === pk) continue;
        if (R[0] < M[0]) continue;
        if (!inTri(R, M, I, P) && !inTri(R, M, P, I)) continue;
        const ang = Math.abs(Math.atan2(R[1] - M[1], R[0] - M[0]));
        const dcur = Math.hypot(R[0] - M[0], R[1] - M[1]);
        if (ang < bestAng || (ang === bestAng && dcur < Math.hypot(pts[poly[pk]][0] - M[0], pts[poly[pk]][1] - M[1]))) {
          bestAng = ang; pk = k;
        }
      }
      const holeSeq = [];
      for (let i = 0; i <= hole.length; i++) holeSeq.push(hole[(mi + i) % hole.length]);
      const out = poly.slice(0, pk + 1).concat(holeSeq, [poly[pk]], poly.slice(pk + 1));
      return out;
    }

    function inTri(p, a, b, c) {
      const d1 = (p[0] - b[0]) * (a[1] - b[1]) - (a[0] - b[0]) * (p[1] - b[1]);
      const d2 = (p[0] - c[0]) * (b[1] - c[1]) - (b[0] - c[0]) * (p[1] - c[1]);
      const d3 = (p[0] - a[0]) * (c[1] - a[1]) - (c[0] - a[0]) * (p[1] - a[1]);
      const neg = d1 < -eps || d2 < -eps || d3 < -eps;
      const pos = d1 > eps || d2 > eps || d3 > eps;
      return !(neg && pos);
    }

    function cross(a, b, c) {
      return (pts[b][0] - pts[a][0]) * (pts[c][1] - pts[b][1]) - (pts[b][1] - pts[a][1]) * (pts[c][0] - pts[b][0]);
    }

    function earClip(poly) {
      const tris = [];
      const Vs = poly.slice();
      let guard = 0;
      while (Vs.length > 3 && guard++ < 200000) {
        let clipped = false;
        const n = Vs.length;
        for (let i = 0; i < n; i++) {
          const a = Vs[(i + n - 1) % n], b = Vs[i], c = Vs[(i + 1) % n];
          if (cross(a, b, c) <= eps) continue;
          let ok = true;
          for (let j = 0; j < n; j++) {
            const k = Vs[j];
            if (k === a || k === b || k === c) continue;
            if (same(k, a) || same(k, b) || same(k, c)) continue;
            if (inTri(pts[k], pts[a], pts[b], pts[c])) { ok = false; break; }
          }
          if (!ok) continue;
          tris.push(a, b, c);
          Vs.splice(i, 1);
          clipped = true;
          break;
        }
        if (!clipped) {
          // quitar un vértice degenerado (alineado) o forzar un recorte
          let removed = false;
          for (let i = 0; i < Vs.length; i++) {
            const m = Vs.length;
            if (Math.abs(cross(Vs[(i + m - 1) % m], Vs[i], Vs[(i + 1) % m])) <= eps) { Vs.splice(i, 1); removed = true; break; }
          }
          if (!removed) { tris.push(Vs[Vs.length - 1], Vs[0], Vs[1]); Vs.splice(0, 1); }
        }
      }
      if (Vs.length === 3 && Math.abs(cross(Vs[0], Vs[1], Vs[2])) > eps) {
        if (cross(Vs[0], Vs[1], Vs[2]) > 0) tris.push(Vs[0], Vs[1], Vs[2]);
        else tris.push(Vs[0], Vs[2], Vs[1]);
      }
      return tris;
    }
  }

  // Desplaza un polígono 2D (CCW) una distancia d (positiva hacia dentro).
  function offsetPolygon2(poly, d) {
    const n = poly.length;
    const out = [];
    const ccw = area2(poly) > 0 ? 1 : -1;
    for (let i = 0; i < n; i++) {
      const p0 = poly[(i + n - 1) % n], p1 = poly[i], p2 = poly[(i + 1) % n];
      // normales interiores de las dos aristas
      const e1 = norm2([p1[0] - p0[0], p1[1] - p0[1]]);
      const e2 = norm2([p2[0] - p1[0], p2[1] - p1[1]]);
      const n1 = [-e1[1] * ccw, e1[0] * ccw];
      const n2 = [-e2[1] * ccw, e2[0] * ccw];
      // intersección de las dos rectas desplazadas
      const a1 = [p0[0] + n1[0] * d, p0[1] + n1[1] * d];
      const a2 = [p1[0] + n2[0] * d, p1[1] + n2[1] * d];
      const den = e1[0] * e2[1] - e1[1] * e2[0];
      if (Math.abs(den) < 1e-12) {
        out.push([p1[0] + n1[0] * d, p1[1] + n1[1] * d]);
      } else {
        const t = ((a2[0] - a1[0]) * e2[1] - (a2[1] - a1[1]) * e2[0]) / den;
        out.push([a1[0] + e1[0] * t, a1[1] + e1[1] * t]);
      }
    }
    return out;
  }
  function norm2(v) { const l = Math.hypot(v[0], v[1]); return l > 0 ? [v[0] / l, v[1] / l] : [0, 0]; }

  /* ---------------- Matrices 4×4 (column-major, para WebGL) ---------------- */

  const M4 = {
    identity() { const m = new Float64Array(16); m[0] = m[5] = m[10] = m[15] = 1; return m; },
    multiply(a, b) {
      const o = new Float64Array(16);
      for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) {
        let s = 0;
        for (let k = 0; k < 4; k++) s += a[k * 4 + r] * b[c * 4 + k];
        o[c * 4 + r] = s;
      }
      return o;
    },
    perspective(fovy, aspect, near, far) {
      const f = 1 / Math.tan(fovy / 2), nf = 1 / (near - far);
      const m = new Float64Array(16);
      m[0] = f / aspect; m[5] = f; m[10] = (far + near) * nf; m[11] = -1; m[14] = 2 * far * near * nf;
      return m;
    },
    ortho(l, r, b, t, n, f) {
      const m = new Float64Array(16);
      m[0] = 2 / (r - l); m[5] = 2 / (t - b); m[10] = -2 / (f - n);
      m[12] = -(r + l) / (r - l); m[13] = -(t + b) / (t - b); m[14] = -(f + n) / (f - n); m[15] = 1;
      return m;
    },
    lookAt(eye, target, up) {
      const z = V.norm(V.sub(eye, target));
      let x = V.cross(up, z);
      if (V.len(x) < 1e-9) x = V.perp(z);
      x = V.norm(x);
      const y = V.cross(z, x);
      const m = new Float64Array(16);
      m[0] = x[0]; m[4] = x[1]; m[8] = x[2];
      m[1] = y[0]; m[5] = y[1]; m[9] = y[2];
      m[2] = z[0]; m[6] = z[1]; m[10] = z[2];
      m[12] = -V.dot(x, eye); m[13] = -V.dot(y, eye); m[14] = -V.dot(z, eye); m[15] = 1;
      return m;
    },
    invert(m) {
      const inv = new Float64Array(16);
      inv[0] = m[5] * m[10] * m[15] - m[5] * m[11] * m[14] - m[9] * m[6] * m[15] + m[9] * m[7] * m[14] + m[13] * m[6] * m[11] - m[13] * m[7] * m[10];
      inv[4] = -m[4] * m[10] * m[15] + m[4] * m[11] * m[14] + m[8] * m[6] * m[15] - m[8] * m[7] * m[14] - m[12] * m[6] * m[11] + m[12] * m[7] * m[10];
      inv[8] = m[4] * m[9] * m[15] - m[4] * m[11] * m[13] - m[8] * m[5] * m[15] + m[8] * m[7] * m[13] + m[12] * m[5] * m[11] - m[12] * m[7] * m[9];
      inv[12] = -m[4] * m[9] * m[14] + m[4] * m[10] * m[13] + m[8] * m[5] * m[14] - m[8] * m[6] * m[13] - m[12] * m[5] * m[10] + m[12] * m[6] * m[9];
      inv[1] = -m[1] * m[10] * m[15] + m[1] * m[11] * m[14] + m[9] * m[2] * m[15] - m[9] * m[3] * m[14] - m[13] * m[2] * m[11] + m[13] * m[3] * m[10];
      inv[5] = m[0] * m[10] * m[15] - m[0] * m[11] * m[14] - m[8] * m[2] * m[15] + m[8] * m[3] * m[14] + m[12] * m[2] * m[11] - m[12] * m[3] * m[10];
      inv[9] = -m[0] * m[9] * m[15] + m[0] * m[11] * m[13] + m[8] * m[1] * m[15] - m[8] * m[3] * m[13] - m[12] * m[1] * m[11] + m[12] * m[3] * m[9];
      inv[13] = m[0] * m[9] * m[14] - m[0] * m[10] * m[13] - m[8] * m[1] * m[14] + m[8] * m[2] * m[13] + m[12] * m[1] * m[10] - m[12] * m[2] * m[9];
      inv[2] = m[1] * m[6] * m[15] - m[1] * m[7] * m[14] - m[5] * m[2] * m[15] + m[5] * m[3] * m[14] + m[13] * m[2] * m[7] - m[13] * m[3] * m[6];
      inv[6] = -m[0] * m[6] * m[15] + m[0] * m[7] * m[14] + m[4] * m[2] * m[15] - m[4] * m[3] * m[14] - m[12] * m[2] * m[7] + m[12] * m[3] * m[6];
      inv[10] = m[0] * m[5] * m[15] - m[0] * m[7] * m[13] - m[4] * m[1] * m[15] + m[4] * m[3] * m[13] + m[12] * m[1] * m[7] - m[12] * m[3] * m[5];
      inv[14] = -m[0] * m[5] * m[14] + m[0] * m[6] * m[13] + m[4] * m[1] * m[14] - m[4] * m[2] * m[13] - m[12] * m[1] * m[6] + m[12] * m[2] * m[5];
      inv[3] = -m[1] * m[6] * m[11] + m[1] * m[7] * m[10] + m[5] * m[2] * m[11] - m[5] * m[3] * m[10] - m[9] * m[2] * m[7] + m[9] * m[3] * m[6];
      inv[7] = m[0] * m[6] * m[11] - m[0] * m[7] * m[10] - m[4] * m[2] * m[11] + m[4] * m[3] * m[10] + m[8] * m[2] * m[7] - m[8] * m[3] * m[6];
      inv[11] = -m[0] * m[5] * m[11] + m[0] * m[7] * m[9] + m[4] * m[1] * m[11] - m[4] * m[3] * m[9] - m[8] * m[1] * m[7] + m[8] * m[3] * m[5];
      inv[15] = m[0] * m[5] * m[10] - m[0] * m[6] * m[9] - m[4] * m[1] * m[10] + m[4] * m[2] * m[9] + m[8] * m[1] * m[6] - m[8] * m[2] * m[5];
      let det = m[0] * inv[0] + m[1] * inv[4] + m[2] * inv[8] + m[3] * inv[12];
      if (det === 0) return M4.identity();
      det = 1 / det;
      for (let i = 0; i < 16; i++) inv[i] *= det;
      return inv;
    },
    // Transforma un punto (con división homogénea).
    apply(m, p) {
      const x = p[0], y = p[1], z = p[2];
      const w = m[3] * x + m[7] * y + m[11] * z + m[15];
      return [
        (m[0] * x + m[4] * y + m[8] * z + m[12]) / w,
        (m[1] * x + m[5] * y + m[9] * z + m[13]) / w,
        (m[2] * x + m[6] * y + m[10] * z + m[14]) / w
      ];
    },
    apply4(m, p) {
      const x = p[0], y = p[1], z = p[2];
      return [
        m[0] * x + m[4] * y + m[8] * z + m[12],
        m[1] * x + m[5] * y + m[9] * z + m[13],
        m[2] * x + m[6] * y + m[10] * z + m[14],
        m[3] * x + m[7] * y + m[11] * z + m[15]
      ];
    },
    toF32(m) { return new Float32Array(m); }
  };

  /* ---------------- Unidades y formato ---------------- */

  // Formatea metros a texto con coma decimal: "2,41 m".
  function fmtLen(m, decimals) {
    decimals = decimals === undefined ? 2 : decimals;
    if (!isFinite(m)) return '—';
    return m.toFixed(decimals).replace('.', ',') + ' m';
  }
  function fmtNum(x, decimals) {
    decimals = decimals === undefined ? 2 : decimals;
    return x.toFixed(decimals).replace('.', ',');
  }
  function fmtArea(m2) { return fmtNum(m2, 2) + ' m²'; }
  function fmtVol(m3) { return fmtNum(m3, 3) + ' m³'; }

  // Interpreta una longitud tecleada: "2,5" "2.5" "250cm" "2500 mm" "3m" "-1,2".
  function parseLen(s) {
    if (s === undefined || s === null) return null;
    s = String(s).trim().toLowerCase().replace(/\s+/g, '');
    if (!s) return null;
    const m = s.match(/^([+-]?)(\d*[.,]?\d*)(mm|cm|dm|m|km)?$/);
    if (!m || m[2] === '' || m[2] === '.' || m[2] === ',') return null;
    let v = parseFloat(m[2].replace(',', '.'));
    if (!isFinite(v)) return null;
    const unit = m[3] || 'm';
    const k = { mm: 0.001, cm: 0.01, dm: 0.1, m: 1, km: 1000 }[unit];
    v *= k;
    return m[1] === '-' ? -v : v;
  }
  // Varias longitudes: "5;4" "5 x 4" "5*4". La coma es decimal.
  function parseLens(s) {
    const parts = String(s).trim().split(/\s*[;x*]\s*|\s+/i).filter((p) => p !== '');
    const out = parts.map(parseLen);
    return out.some((v) => v === null) ? null : out;
  }
  function parseAngle(s) {
    s = String(s).trim().replace(',', '.').replace('°', '');
    const v = parseFloat(s);
    return isFinite(v) ? v : null;
  }

  D.TOL = TOL;
  D.V = V;
  D.M4 = M4;
  D.geom = {
    newellNormal, planeFromPointNormal, planeDist, samePlane, projectToPlane, rayPlane,
    planeBasis, closestOnSegment, segSegClosest, lineLineClosest,
    area2, pointInPoly2, triangulate, offsetPolygon2
  };
  D.units = { fmtLen, fmtNum, fmtArea, fmtVol, parseLen, parseLens, parseAngle };
})(typeof window !== 'undefined' ? window : globalThis);
