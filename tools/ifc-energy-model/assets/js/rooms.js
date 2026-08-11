/*
 * HEFESTOLAB · IFC Energy Model
 * rooms.js — Techos inclinados y detección de recintos
 * ---------------------------------------------------------------------------
 * Dos problemas que comparten geometría:
 *
 *  1. Un espacio bajo cubierta inclinada no es un prisma. Aplanarlo a la altura
 *     de planta falsea el volumen y deja de ser coplanario con la cara inferior
 *     del faldón, que es justo lo que CYPE exige. Aquí se reconstruyen los
 *     planos de los faldones y se recorta cada recinto contra ellos.
 *
 *  2. Si el IFC llega sin IfcSpace no hay modelo analítico posible. Los
 *     recintos se deducen rasterizando la planta con los muros como obstáculo
 *     y quedándose con las regiones cerradas.
 */
(function (global) {
  'use strict';
  const HEM = (global.HEM = global.HEM || {});
  const G = HEM.geom;

  /* ======================================================================
   * 1 · Techos: planos de cubierta y forjado
   * ==================================================================== */

  /**
   * Recopila los planos que pueden cerrar un recinto por arriba: caras
   * inferiores de faldones de cubierta y de forjados.
   * @returns {Array<{poly, plane:{a,b,c}, tilted, source}>}
   */
  function ceilingPlanes(P) {
    const out = [];
    for (const el of P.elements) {
      if (!el.keep || el.container) continue;
      if (el.role !== 'cubierta' && el.role !== 'forjado') continue;
      let solids = [];
      try { solids = P.geo.productExtrusions(el.id); } catch (err) { solids = []; }

      // Geometría teselada: los faldones no son extrusiones, así que los planos
      // se sacan de las caras que miran hacia abajo. Se agrupan las coplanarias
      // —una cubierta a cuatro aguas puede traer decenas de miles de
      // triángulos— y queda un plano por faldón.
      if (!solids.length) {
        let faces = [];
        try { faces = P.geo.productFaces(el.id, 60000); } catch (err) { faces = []; }
        if (!faces.length) continue;
        // No se confía en la orientación de las normales: hay exportadores que
        // devuelven la malla con el giro invertido y entonces la cara inferior
        // parece mirar hacia arriba. Se toman todas las caras no verticales y,
        // por cada pendiente, se conserva el plano más bajo: ése es el intradós.
        const abajo = [];
        for (const f of faces) {
          if (f.length < 3) continue;
          const n = G.faceNormal(f);
          if (!n || Math.abs(n[2]) < 0.25) continue;
          const ring = G.dedupeRing(f.map(pt => [pt[0], pt[1]]));
          if (ring.length < 3) continue;
          const ar = G.area(ring);
          // Sin mínimo por cara: una cubierta finamente teselada trae decenas
          // de miles de triángulos diminutos y el área se acumula por plano.
          if (ar < 1e-5) continue;
          abajo.push({ face: f, ring, area: ar });
        }
        const porPendiente = new Map();
        const grupos = new Map();
        for (const f of abajo) {
          const pl = planeThrough(f.face);
          if (!pl) continue;
          const pend = pl.a.toFixed(3) + '|' + pl.b.toFixed(3);
          const previo = porPendiente.get(pend);
          if (previo === undefined || pl.c < previo) porPendiente.set(pend, pl.c);
          const clave = pend + '|' + pl.c.toFixed(2);
          let g = grupos.get(clave);
          if (!g) { g = { plane: pl, area: 0, box: null, pend }; grupos.set(clave, g); }
          g.area += f.area;
          const b = G.bbox(f.ring);
          g.box = g.box ? {
            minX: Math.min(g.box.minX, b.minX), minY: Math.min(g.box.minY, b.minY),
            maxX: Math.max(g.box.maxX, b.maxX), maxY: Math.max(g.box.maxY, b.maxY)
          } : b;
        }
        // Por cada pendiente se descarta el trasdós, que queda por encima.
        const utiles = [...grupos.values()].filter(g => g.plane.c <= porPendiente.get(g.pend) + 0.02);
        const total = utiles.reduce((s2, g) => s2 + g.area, 0) || 1;
        for (const g of utiles) {
          if (g.area / total < 0.02) continue;         // restos irrelevantes
          const b = g.box;
          out.push({
            poly: [[b.minX, b.minY], [b.maxX, b.minY], [b.maxX, b.maxY], [b.minX, b.maxY]],
            inners: [],
            plane: g.plane,
            tilted: Math.abs(g.plane.a) > 1e-3 || Math.abs(g.plane.b) > 1e-3,
            elementId: el.id,
            role: el.role,
            zMin: planeZ(g.plane, b.minX, b.minY),
            zMax: planeZ(g.plane, b.maxX, b.maxY),
            tessellated: true
          });
        }
        continue;
      }

      for (const s of solids) {
        if (!s.outer3 || s.outer3.length < 3) continue;
        const plane = planeThrough(s.outer3);
        if (!plane) continue;
        out.push({
          poly: s.outer,
          inners: s.inners || [],
          plane,
          tilted: !!s.tilted,
          elementId: el.id,
          role: el.role,
          zMin: s.base,
          zMax: s.top
        });
      }
    }
    return out;
  }

  /** Ajusta z = a·x + b·y + c por mínimos cuadrados sobre los puntos dados. */
  function planeThrough(pts) {
    let n = 0, sx = 0, sy = 0, sz = 0, sxx = 0, sxy = 0, syy = 0, sxz = 0, syz = 0;
    for (const p of pts) {
      if (!Number.isFinite(p[2])) continue;
      n++; sx += p[0]; sy += p[1]; sz += p[2];
      sxx += p[0] * p[0]; sxy += p[0] * p[1]; syy += p[1] * p[1];
      sxz += p[0] * p[2]; syz += p[1] * p[2];
    }
    if (n < 3) return null;
    // Sistema normal 3x3
    const m = [[sxx, sxy, sx], [sxy, syy, sy], [sx, sy, n]];
    const v = [sxz, syz, sz];
    const det = m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1])
      - m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0])
      + m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0]);
    if (Math.abs(det) < 1e-12) {
      // Puntos alineados o plano vertical: se usa la cota media.
      return { a: 0, b: 0, c: sz / n, degenerate: true };
    }
    const solve = (col) => {
      const mm = m.map(r => r.slice());
      for (let i = 0; i < 3; i++) mm[i][col] = v[i];
      return (mm[0][0] * (mm[1][1] * mm[2][2] - mm[1][2] * mm[2][1])
        - mm[0][1] * (mm[1][0] * mm[2][2] - mm[1][2] * mm[2][0])
        + mm[0][2] * (mm[1][0] * mm[2][1] - mm[1][1] * mm[2][0])) / det;
    };
    return { a: solve(0), b: solve(1), c: solve(2) };
  }

  const planeZ = (pl, x, y) => pl.a * x + pl.b * y + pl.c;

  /**
   * Altura de techo sobre un punto: la más baja de las caras que lo cubren.
   * @returns {{z:number, tilted:boolean, source:Object}|null}
   */
  function ceilingAt(planes, x, y, minZ) {
    let best = null;
    for (const pl of planes) {
      if (!G.pointInRing([x, y], pl.poly)) continue;
      let inHole = false;
      for (const h of pl.inners) if (G.pointInRing([x, y], h)) { inHole = true; break; }
      if (inHole) continue;
      const z = planeZ(pl.plane, x, y);
      // Un plano a menos de 1,8 m sobre el suelo no puede ser el techo de un
      // recinto habitable: suele ser el propio forjado de la planta.
      if (z <= minZ + 1.8) continue;
      if (!best || z < best.z) best = { z, tilted: pl.tilted, source: pl };
    }
    return best;
  }

  /**
   * Recorta un espacio contra los planos de techo.
   * @returns {{flat:boolean, height:number|null, minH:number, maxH:number,
   *            volume:number, area:number, ceilingArea:number, triangles:Array}}
   */
  function clipSpace(space, planes, fallbackHeight) {
    const base = space.base;
    const area = space.areaNet;
    const ring = G.dedupeRing(space.poly || []);
    if (ring.length < 3) return flatResult(space, fallbackHeight || space.height, area);

    // Planos que pueden cubrir el recinto.
    const box = G.bbox(ring);
    const cand = planes.filter(pl => {
      const b = G.bbox(pl.poly);
      if (b.maxX < box.minX - 0.05 || b.minX > box.maxX + 0.05) return false;
      if (b.maxY < box.minY - 0.05 || b.minY > box.maxY + 0.05) return false;
      return planeZ(pl.plane, (box.minX + box.maxX) / 2, (box.minY + box.maxY) / 2) > base + 1.8;
    });
    if (!cand.length) return flatResult(space, fallbackHeight || space.height, area);

    // Partición exacta: la huella se recorta por las bisectrices entre planos,
    // de modo que cada región queda bajo un único faldón. Sin subdivisión no
    // hay junturas en T y el techo sale plano por tramos, que es justo lo que
    // exige la coplanariedad con la cara inferior de la cubierta.
    const regions = [];
    for (let i = 0; i < cand.length; i++) {
      let poly = ring.slice();
      for (let j = 0; j < cand.length && poly.length >= 3; j++) {
        if (i === j) continue;
        const pi = cand[i].plane, pj = cand[j].plane;
        poly = clipHalfPlane(poly, pi.a - pj.a, pi.b - pj.b, pi.c - pj.c);
      }
      if (poly.length < 3) continue;
      const a2 = Math.abs(G.signedArea(poly));
      if (a2 < 1e-6) continue;
      regions.push({ poly, plane: cand[i].plane, src: cand[i] });
    }
    if (!regions.length) return flatResult(space, fallbackHeight || space.height, area);

    let volume = 0, ceilingArea = 0, minH = Infinity, maxH = -Infinity, covered = 0;
    for (const r of regions) {
      const a2 = Math.abs(G.signedArea(r.poly));
      const c = G.centroid(r.poly);
      // Volumen exacto bajo un plano: área × altura en el centroide.
      const hc = planeZ(r.plane, c[0], c[1]) - base;
      volume += a2 * hc;
      covered += a2;
      // Superficie real del techo: área en planta dividida por el coseno.
      const cosT = 1 / Math.sqrt(1 + r.plane.a * r.plane.a + r.plane.b * r.plane.b);
      ceilingArea += a2 / cosT;
      for (const p of r.poly) {
        const h = planeZ(r.plane, p[0], p[1]) - base;
        if (h < minH) minH = h;
        if (h > maxH) maxH = h;
      }
    }
    if (!Number.isFinite(minH)) { minH = fallbackHeight || space.height; maxH = minH; }

    const flat = (maxH - minH) < 0.05;
    return {
      flat,
      height: flat ? (minH + maxH) / 2 : null,
      minH, maxH,
      volume,
      area,
      ceilingArea: ceilingArea || area,
      coverage: area ? covered / area : 0,
      regions
    };
  }

  /** Sutherland–Hodgman: conserva la parte del polígono con a·x + b·y + c ≤ 0. */
  function clipHalfPlane(poly, a, b, c) {
    if (Math.abs(a) < 1e-12 && Math.abs(b) < 1e-12) return c <= 1e-9 ? poly.slice() : [];
    const f = (p) => a * p[0] + b * p[1] + c;
    const out = [];
    for (let i = 0; i < poly.length; i++) {
      const p = poly[i], q = poly[(i + 1) % poly.length];
      const fp = f(p), fq = f(q);
      const inP = fp <= 1e-9, inQ = fq <= 1e-9;
      if (inP) out.push(p);
      if (inP !== inQ) {
        const t = fp / (fp - fq);
        out.push([p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t]);
      }
    }
    return G.dedupeRing(out);
  }

  function flatResult(space, h, area) {
    return {
      flat: true, height: h, minH: h, maxH: h,
      volume: area * h, area, ceilingArea: area, coverage: 0, regions: []
    };
  }

  /**
   * Construye el sólido real del recinto: suelo plano, caras laterales de
   * altura variable y techo formado por las caras inclinadas. Devuelve las
   * caras en coordenadas de proyecto, listas para escribirse como
   * IfcFacetedBrep.
   *
   * La clave para que la malla cierre es que el contorno del suelo y los
   * laterales usen exactamente los mismos puntos que han quedado en el borde
   * al subdividir el techo.
   *
   * @returns {{faces:Array<Array<Array<number>>>, closed:boolean, volume:number}|null}
   */
  function spaceBrep(space, clip) {
    if (!clip || clip.flat || !clip.regions || !clip.regions.length) return null;
    if (space.inners && space.inners.length) return null;   // con patios, mejor no arriesgar
    const base = space.base;

    // La malla se construye a partir de las propias regiones, no del contorno
    // original. Las regiones teselan exactamente la huella, así que cada arista
    // o la comparten dos regiones —y entonces es una lima interior— o está en
    // el borde y le corresponde una cara lateral. Cerrar la malla deja de
    // depender de tolerancias: sale por construcción.
    const regions = conformRegions(clip.regions.map(r => ({
      plane: r.plane,
      poly: G.signedArea(r.poly) < 0 ? r.poly.slice().reverse() : r.poly.slice()
    })));

    const key = (p) => p[0].toFixed(5) + ',' + p[1].toFixed(5);
    const edgeKey = (a, b) => { const ka = key(a), kb = key(b); return ka < kb ? ka + '|' + kb : kb + '|' + ka; };
    const edges = new Map();
    for (const r of regions) {
      for (let i = 0; i < r.poly.length; i++) {
        const a = r.poly[i], b = r.poly[(i + 1) % r.poly.length];
        if (Math.hypot(b[0] - a[0], b[1] - a[1]) < 1e-7) continue;
        const k = edgeKey(a, b);
        const e = edges.get(k);
        if (e) e.count++;
        else edges.set(k, { a, b, region: r, count: 1 });
      }
    }
    const boundary = [...edges.values()].filter(e => e.count === 1);
    if (boundary.length < 3) return null;

    // Encadenar las aristas de borde para obtener el contorno del suelo.
    const byStart = new Map();
    for (const e of boundary) {
      const k = key(e.a);
      if (!byStart.has(k)) byStart.set(k, []);
      byStart.get(k).push(e);
      const k2 = key(e.b);
      if (!byStart.has(k2)) byStart.set(k2, []);
      byStart.get(k2).push(e);
    }
    const loop = [];
    const used = new Set();
    let cur = boundary[0].a, startKey = key(boundary[0].a), guard = 0;
    while (guard++ < boundary.length + 2) {
      loop.push(cur);
      const cands = (byStart.get(key(cur)) || []).filter(e => !used.has(e));
      if (!cands.length) break;
      const e = cands[0];
      used.add(e);
      cur = key(e.a) === key(cur) ? e.b : e.a;
      if (key(cur) === startKey) break;
    }
    if (loop.length !== boundary.length) return null;   // contorno no simple

    const zOf = (p, region) => planeZ(region.plane, p[0], p[1]);

    const faces = [];
    faces.push(loop.map(p => [p[0], p[1], base]).reverse());     // suelo, mirando abajo
    for (const e of boundary) {
      faces.push([
        [e.a[0], e.a[1], base],
        [e.b[0], e.b[1], base],
        [e.b[0], e.b[1], zOf(e.b, e.region)],
        [e.a[0], e.a[1], zOf(e.a, e.region)]
      ]);
    }
    for (const r of regions) {
      faces.push(r.poly.map(p => [p[0], p[1], zOf(p, r)]));
    }

    const check = shellCheck(faces);
    return { faces, closed: check.closed, openEdges: check.open, volume: check.volume };
  }

  /**
   * Hace conformes los contornos de las regiones: inserta en cada arista los
   * vértices de las regiones vecinas que caen sobre ella.
   *
   * Sin esto, una lima que en un faldón está partida en tres tramos y en el
   * contiguo es un único segmento produce aristas que no casan, y la malla no
   * cierra aunque las regiones teselen la huella a la perfección. Es
   * exactamente lo que ocurría en un recinto de Casa Ítaca.
   */
  function conformRegions(regions) {
    const all = [];
    for (const r of regions) for (const p of r.poly) all.push(p);

    return regions.map(r => {
      const out = [];
      for (let i = 0; i < r.poly.length; i++) {
        const a = r.poly[i], b = r.poly[(i + 1) % r.poly.length];
        out.push(a);
        const dx = b[0] - a[0], dy = b[1] - a[1];
        const len2 = dx * dx + dy * dy;
        if (len2 < 1e-14) continue;
        const inner = [];
        for (const p of all) {
          const t = ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2;
          if (t <= 1e-7 || t >= 1 - 1e-7) continue;
          // Distancia perpendicular: sólo cuentan los que están sobre la arista.
          const d = Math.abs((p[0] - a[0]) * dy - (p[1] - a[1]) * dx) / Math.sqrt(len2);
          if (d > 1e-6) continue;
          inner.push({ t, p });
        }
        inner.sort((u, v) => u.t - v.t);
        let last = -1;
        for (const it of inner) {
          if (it.t - last < 1e-7) continue;
          last = it.t;
          out.push(it.p);
        }
      }
      return { plane: r.plane, poly: G.dedupeRing(out) };
    });
  }

  /** Comprueba que la malla cierra y calcula su volumen por divergencia. */
  function shellCheck(faces) {
    const edges = new Map();
    let volume = 0;
    const k = (p) => p[0].toFixed(4) + ',' + p[1].toFixed(4) + ',' + p[2].toFixed(4);
    for (const f of faces) {
      for (let i = 0; i < f.length; i++) {
        const a = f[i], b = f[(i + 1) % f.length];
        if (Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]) < 1e-9) continue;
        const ka = k(a), kb = k(b);
        const id = ka < kb ? ka + '|' + kb : kb + '|' + ka;
        edges.set(id, (edges.get(id) || 0) + 1);
      }
      for (let i = 1; i + 1 < f.length; i++) {
        const a = f[0], b = f[i], c = f[i + 1];
        volume += (a[0] * (b[1] * c[2] - c[1] * b[2])
          - a[1] * (b[0] * c[2] - c[0] * b[2])
          + a[2] * (b[0] * c[1] - c[0] * b[1])) / 6;
      }
    }
    let open = 0;
    for (const [, n] of edges) if (n !== 2) open++;
    return { closed: open === 0, open, volume: Math.abs(volume) };
  }

  /* ======================================================================
   * 2 · Detección de recintos a partir de los muros
   * ==================================================================== */

  /**
   * Rasteriza la planta con los muros como obstáculo y devuelve las regiones
   * cerradas. Es un método deliberadamente tosco pero robusto: no depende de
   * que los ejes de los muros se corten con exactitud, que es justo donde
   * fallan los enfoques topológicos con geometría real.
   *
   * @param {Project} P
   * @param {Object} opt {storeyId, cell, minArea}
   */
  function detectRooms(P, opt) {
    opt = opt || {};
    const cell = opt.cell || 0.08;               // 8 cm
    const minArea = opt.minArea || 1.2;          // m²
    const storeyId = opt.storeyId || null;

    const walls = P.elements.filter(e =>
      (e.family === 'wall' || e.family === 'curtain') && e.keep && !e.container &&
      (!storeyId || e.storeyId === storeyId));
    if (!walls.length) return { rooms: [], reason: 'El modelo no tiene muros utilizables.' };

    // --- envolvente ---
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    const segs = [];
    for (const w of walls) {
      const th = Math.max(0.05, w.thickness || 0.2);
      const axis = w.axis && w.axis.length >= 2 ? w.axis : polyAxis(w.poly);
      if (!axis) continue;
      for (let i = 0; i < axis.length - 1; i++) {
        segs.push({ a: axis[i], b: axis[i + 1], th });
        for (const p of [axis[i], axis[i + 1]]) {
          if (p[0] < minX) minX = p[0];
          if (p[1] < minY) minY = p[1];
          if (p[0] > maxX) maxX = p[0];
          if (p[1] > maxY) maxY = p[1];
        }
      }
    }
    if (!segs.length) return { rooms: [], reason: 'No se han podido leer los ejes de los muros.' };

    const pad = 1.0;
    minX -= pad; minY -= pad; maxX += pad; maxY += pad;
    const nx = Math.ceil((maxX - minX) / cell), ny = Math.ceil((maxY - minY) / cell);
    if (nx * ny > 6e6) return { rooms: [], reason: 'La planta es demasiado grande para el detector.' };

    // --- rasterizado de muros ---
    const grid = new Uint8Array(nx * ny);        // 1 = muro
    for (const s of segs) rasterSegment(grid, nx, ny, minX, minY, cell, s);

    // --- relleno por inundación ---
    // La región que toca el borde es el exterior; el resto son candidatos.
    const label = new Int32Array(nx * ny).fill(-1);
    let next = 0;
    const regions = [];
    const stack = [];
    for (let i = 0; i < nx * ny; i++) {
      if (grid[i] || label[i] >= 0) continue;
      const id = next++;
      let count = 0, touchesBorder = false;
      let rMinX = nx, rMinY = ny, rMaxX = 0, rMaxY = 0;
      stack.length = 0; stack.push(i); label[i] = id;
      while (stack.length) {
        const k = stack.pop();
        const x = k % nx, y = (k - x) / nx;
        count++;
        if (x === 0 || y === 0 || x === nx - 1 || y === ny - 1) touchesBorder = true;
        if (x < rMinX) rMinX = x; if (x > rMaxX) rMaxX = x;
        if (y < rMinY) rMinY = y; if (y > rMaxY) rMaxY = y;
        if (x > 0) push(k - 1); if (x < nx - 1) push(k + 1);
        if (y > 0) push(k - nx); if (y < ny - 1) push(k + nx);
      }
      regions.push({ id, count, touchesBorder, box: [rMinX, rMinY, rMaxX, rMaxY] });
      function push(k) { if (!grid[k] && label[k] < 0) { label[k] = id; stack.push(k); } }
    }

    const cellArea = cell * cell;
    const rooms = [];
    let seq = 0;
    for (const r of regions) {
      if (r.touchesBorder) continue;
      const area = r.count * cellArea;
      if (area < minArea) continue;
      const ring = traceRegion(label, nx, ny, r, minX, minY, cell);
      if (!ring || ring.length < 3) continue;
      const poly = simplify(ring, cell * 0.9);
      if (poly.length < 3) continue;
      const a = G.area(poly);
      if (a < minArea) continue;
      rooms.push({
        index: ++seq,
        poly,
        areaRaster: area,
        area: a,
        centroid: G.centroid(poly),
        cells: r.count
      });
    }
    rooms.sort((a, b) => b.area - a.area);
    return { rooms, grid: { nx, ny, cell, minX, minY }, walls: walls.length };
  }

  function polyAxis(poly) {
    if (!poly || poly.length < 4) return null;
    let best = null, len = 0;
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i], b = poly[(i + 1) % poly.length];
      const l = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (l > len) { len = l; best = [a, b]; }
    }
    return best;
  }

  /** Pinta un segmento de muro con su espesor sobre la rejilla. */
  function rasterSegment(grid, nx, ny, minX, minY, cell, s) {
    const half = s.th / 2 + cell * 0.5;
    const ax = s.a[0], ay = s.a[1], bx = s.b[0], by = s.b[1];
    const lo = [Math.min(ax, bx) - half, Math.min(ay, by) - half];
    const hi = [Math.max(ax, bx) + half, Math.max(ay, by) + half];
    const x0 = Math.max(0, Math.floor((lo[0] - minX) / cell));
    const y0 = Math.max(0, Math.floor((lo[1] - minY) / cell));
    const x1 = Math.min(nx - 1, Math.ceil((hi[0] - minX) / cell));
    const y1 = Math.min(ny - 1, Math.ceil((hi[1] - minY) / cell));
    for (let y = y0; y <= y1; y++) {
      const py = minY + (y + 0.5) * cell;
      for (let x = x0; x <= x1; x++) {
        const px = minX + (x + 0.5) * cell;
        if (G.distanceToSegment([px, py], s.a, s.b) <= half) grid[y * nx + x] = 1;
      }
    }
  }

  /** Contorno de una región mediante seguimiento de aristas de celda. */
  function traceRegion(label, nx, ny, region, minX, minY, cell) {
    const id = region.id;
    const inside = (x, y) => x >= 0 && y >= 0 && x < nx && y < ny && label[y * nx + x] === id;
    // Celda de arranque: la primera de la fila inferior de la región.
    let sx = -1, sy = -1;
    for (let y = region.box[1]; y <= region.box[3] && sx < 0; y++) {
      for (let x = region.box[0]; x <= region.box[2]; x++) {
        if (inside(x, y)) { sx = x; sy = y; break; }
      }
    }
    if (sx < 0) return null;

    // Marcha de cuadrados sobre las esquinas de celda.
    const pts = [];
    let cx = sx, cy = sy, dir = 0;      // 0 este, 1 norte, 2 oeste, 3 sur
    const start = sx + ',' + sy;
    let guard = 0;
    const corner = (x, y) => [minX + x * cell, minY + y * cell];
    let px = sx, py = sy;
    do {
      pts.push(corner(px, py));
      // Girar a la izquierda mientras se pueda, si no seguir recto, si no a la derecha.
      const dirs = [[1, 0], [0, 1], [-1, 0], [0, -1]];
      let moved = false;
      for (const turn of [3, 0, 1, 2]) {
        const nd = (dir + turn) % 4;
        const [dx, dy] = dirs[nd];
        // La celda a la izquierda del avance debe pertenecer a la región.
        const lx = px + (dx === 0 ? (dy > 0 ? -1 : 0) : (dx > 0 ? 0 : -1));
        const ly = py + (dy === 0 ? (dx > 0 ? 0 : -1) : (dy > 0 ? 0 : -1));
        if (!inside(lx, ly)) continue;
        px += dx; py += dy; dir = nd; moved = true; break;
      }
      if (!moved) break;
    } while (!(px === sx && py === sy) && guard++ < 400000);
    void cx; void cy; void start;
    return pts;
  }

  /** Simplificación Douglas–Peucker con enganche a ortogonal. */
  function simplify(ring, tol) {
    if (ring.length < 4) return ring;
    const keep = new Uint8Array(ring.length);
    keep[0] = 1; keep[ring.length - 1] = 1;
    const stack = [[0, ring.length - 1]];
    while (stack.length) {
      const [i, j] = stack.pop();
      let best = -1, bestD = tol;
      for (let k = i + 1; k < j; k++) {
        const d = G.distanceToSegment(ring[k], ring[i], ring[j]);
        if (d > bestD) { bestD = d; best = k; }
      }
      if (best > 0) { keep[best] = 1; stack.push([i, best], [best, j]); }
    }
    const out = [];
    for (let i = 0; i < ring.length; i++) if (keep[i]) out.push(ring[i]);
    return G.dedupeRing(out);
  }

  HEM.rooms = {
    ceilingPlanes, ceilingAt, clipSpace, spaceBrep, shellCheck, detectRooms, planeThrough, planeZ, simplify
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
