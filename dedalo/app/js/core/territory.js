/* Territorio: native geometry from source features. Pure CPU, metres, no network. */
(function (root) {
  'use strict';
  const D = root.DEDALO, { V, Model, SceneMath: M } = D;
  const LIMITS = { features: 6000, vertices: 180000, faces: 180000, gridPoints: 65536, area: 1100000, extent: 2000 };
  const clone = x => JSON.parse(JSON.stringify(x)), RAD = Math.PI / 180;
  function json(value, depth) {
    if (depth > 30) throw new Error('Datos territoriales demasiado anidados.');
    if (value === null || ['string', 'boolean'].includes(typeof value)) return;
    if (typeof value === 'number' && Number.isFinite(value)) return;
    if (!value || typeof value !== 'object' || (!Array.isArray(value) && Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null)) throw new Error('Territorio requiere JSON finito.');
    for (const [key, item] of Object.entries(value)) { if (['__proto__', 'prototype', 'constructor'].includes(key)) throw new Error('Clave territorial no admitida.'); json(item, depth + 1); }
  }
  function crsInfo(crs) {
    const text = String(crs || '').toUpperCase(), code = Number(text.split(':').at(-1));
    if ([25829, 25830, 25831].includes(code)) return { crs: 'EPSG:' + code, zone: code - 25800, datum: 'ETRS89', ellipsoid: 'GRS80' };
    if (code === 4083) return { crs: 'EPSG:4083', zone: 28, datum: 'REGCAN95', ellipsoid: 'GRS80' };
    throw new Error('SRC proyectado no admitido: ' + crs);
  }
  function chooseCRS(lon, lat) {
    if (!Number.isFinite(lon) || !Number.isFinite(lat) || lon < -20 || lon > 6 || lat < 24 || lat > 45) throw new Error('El área debe encontrarse en España y su entorno inmediato.');
    if (lon < -12 && lat < 32) return crsInfo('EPSG:4083');
    return crsInfo('EPSG:' + (25800 + Math.max(29, Math.min(31, Math.floor((lon + 180) / 6) + 1))));
  }
  // Transverse Mercator series on GRS80. Source lon/lat WGS84 is treated as
  // compatible with ETRS89/REGCAN95; no epoch/datum correction is fabricated.
  function project(lon, lat, crs) {
    const info = crsInfo(crs), a = 6378137, f = 1 / 298.257222101, e2 = f * (2 - f), ep2 = e2 / (1 - e2), k = 0.9996;
    if (!Number.isFinite(lon) || !Number.isFinite(lat) || Math.abs(lat) >= 84 || lat < 0) throw new Error('Coordenadas geográficas no válidas.');
    const phi = lat * RAD, lambda = lon * RAD, central = (info.zone * 6 - 183) * RAD, sin = Math.sin(phi), cos = Math.cos(phi), tan = Math.tan(phi);
    const N = a / Math.sqrt(1 - e2 * sin * sin), T = tan * tan, C = ep2 * cos * cos, A = cos * (lambda - central), e4 = e2 * e2, e6 = e4 * e2;
    const meridian = a * ((1 - e2 / 4 - 3 * e4 / 64 - 5 * e6 / 256) * phi - (3 * e2 / 8 + 3 * e4 / 32 + 45 * e6 / 1024) * Math.sin(2 * phi) + (15 * e4 / 256 + 45 * e6 / 1024) * Math.sin(4 * phi) - 35 * e6 / 3072 * Math.sin(6 * phi));
    return [500000 + k * N * (A + (1 - T + C) * A ** 3 / 6 + (5 - 18 * T + T * T + 72 * C - 58 * ep2) * A ** 5 / 120), k * (meridian + N * tan * (A * A / 2 + (5 - T + 9 * C + 4 * C * C) * A ** 4 / 24 + (61 - 58 * T + T * T + 600 * C - 330 * ep2) * A ** 6 / 720))];
  }
  function inverse(easting, northing, crs) {
    const info = crsInfo(crs), a = 6378137, f = 1 / 298.257222101, e2 = f * (2 - f), ep2 = e2 / (1 - e2), k = 0.9996;
    if (![easting, northing].every(Number.isFinite)) throw new Error('Coordenadas UTM no válidas.');
    const e4 = e2 * e2, e6 = e4 * e2, mu = northing / (k * a * (1 - e2 / 4 - 3 * e4 / 64 - 5 * e6 / 256)), e1 = (1 - Math.sqrt(1 - e2)) / (1 + Math.sqrt(1 - e2));
    const phi = mu + (3 * e1 / 2 - 27 * e1 ** 3 / 32) * Math.sin(2 * mu) + (21 * e1 ** 2 / 16 - 55 * e1 ** 4 / 32) * Math.sin(4 * mu) + 151 * e1 ** 3 / 96 * Math.sin(6 * mu) + 1097 * e1 ** 4 / 512 * Math.sin(8 * mu);
    const sin = Math.sin(phi), cos = Math.cos(phi), tan = Math.tan(phi), N = a / Math.sqrt(1 - e2 * sin * sin), R = a * (1 - e2) / (1 - e2 * sin * sin) ** 1.5, T = tan * tan, C = ep2 * cos * cos, A = (easting - 500000) / (N * k);
    const lat = phi - N * tan / R * (A * A / 2 - (5 + 3 * T + 10 * C - 4 * C * C - 9 * ep2) * A ** 4 / 24 + (61 + 90 * T + 298 * C + 45 * T * T - 252 * ep2 - 3 * C * C) * A ** 6 / 720);
    const lon = (info.zone * 6 - 183) * RAD + (A - (1 + 2 * T + C) * A ** 3 / 6 + (5 - 2 * C + 28 * T - 3 * C * C + 8 * ep2 + 24 * T * T) * A ** 5 / 120) / cos;
    return [lon / RAD, lat / RAD];
  }
  function validBBox(box) {
    if (!Array.isArray(box) || box.length !== 4 || !box.every(Number.isFinite) || box[0] >= box[2] || box[1] >= box[3]) throw new Error('La extensión territorial no es válida.');
    return box;
  }
  function terrainReader(terrain) {
    if (!terrain) return null;
    const box = validBBox(terrain.bbox), rows = terrain.rows, cols = terrain.cols;
    if (![rows, cols].every(n => Number.isSafeInteger(n) && n >= 2) || rows * cols > LIMITS.gridPoints || !Array.isArray(terrain.grid)) throw new Error('Malla de terreno demasiado grande o inválida.');
    const flat = !Array.isArray(terrain.grid[0]), values = flat ? terrain.grid : terrain.grid.flat();
    if (values.length !== rows * cols || (!flat && (terrain.grid.length !== rows || terrain.grid.some(row => !Array.isArray(row) || row.length !== cols)))) throw new Error('Las dimensiones del MDT no coinciden con la cuadrícula.');
    const geographic = ['EPSG:4326', 'EPSG:4258'].includes(String(terrain.crs).toUpperCase()); if (!geographic) crsInfo(terrain.crs);
    const valid = z => z !== null && z !== terrain.nodata && Number.isFinite(z) && Math.abs(z) <= 12000;
    const at = (r, c) => { const z = values[r * cols + c]; return valid(z) ? z : null; };
    const northFirst = terrain.rowOrder !== 'south-to-north';
    function sourceXY(r, c) { return [box[0] + (box[2] - box[0]) * c / (cols - 1), northFirst ? box[3] - (box[3] - box[1]) * r / (rows - 1) : box[1] + (box[3] - box[1]) * r / (rows - 1)]; }
    function lonlat(r, c) { const p = sourceXY(r, c); return geographic ? p : inverse(p[0], p[1], terrain.crs); }
    function sample(lon, lat) {
      const p = geographic ? [lon, lat] : project(lon, lat, terrain.crs), u = (p[0] - box[0]) / (box[2] - box[0]) * (cols - 1), v = (northFirst ? box[3] - p[1] : p[1] - box[1]) / (box[3] - box[1]) * (rows - 1);
      if (u < -1e-7 || v < -1e-7 || u > cols - 1 + 1e-7 || v > rows - 1 + 1e-7) return null;
      const c = Math.min(cols - 2, Math.max(0, Math.floor(u))), r = Math.min(rows - 2, Math.max(0, Math.floor(v))), dx = Math.max(0, Math.min(1, u - c)), dy = Math.max(0, Math.min(1, v - r));
      const points = [[r, c, (1 - dx) * (1 - dy)], [r, c + 1, dx * (1 - dy)], [r + 1, c, (1 - dx) * dy], [r + 1, c + 1, dx * dy]];
      if (points.some(([rr, cc, w]) => w > 1e-12 && at(rr, cc) === null)) return null;
      return points.reduce((sum, [rr, cc, w]) => sum + (at(rr, cc) || 0) * w, 0);
    }
    return { rows, cols, at, lonlat, sample, validValues: values.filter(valid), source: terrain };
  }
  const area2 = ring => ring.reduce((sum, p, i) => { const q = ring[(i + 1) % ring.length]; return sum + p[0] * q[1] - q[0] * p[1]; }, 0) / 2;
  function ringsIntersect(a, b, same) {
    const turn = (p, q, r) => (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]);
    let checks = 0;
    const segments = ring => ring.map((p, i) => { const q = ring[(i + 1) % ring.length]; return { p, q, i, minX: Math.min(p[0], q[0]), maxX: Math.max(p[0], q[0]), minY: Math.min(p[1], q[1]), maxY: Math.max(p[1], q[1]) }; });
    const first = segments(a), second = same ? first : segments(b);
    for (const x of first) for (const y of second) {
      if (same && (y.i <= x.i || y.i === x.i + 1 || (x.i === 0 && y.i === a.length - 1))) continue;
      if (x.maxX < y.minX - 1e-8 || y.maxX < x.minX - 1e-8 || x.maxY < y.minY - 1e-8 || y.maxY < x.minY - 1e-8) continue;
      if (++checks > 2000000) throw new Error('Contorno demasiado complejo; simplifica el recorte.');
      const p = turn(x.p, x.q, y.p), q = turn(x.p, x.q, y.q), r = turn(y.p, y.q, x.p), s = turn(y.p, y.q, x.q);
      if (p * q <= 1e-12 && r * s <= 1e-12) return true;
    }
    return false;
  }
  function polygons(feature) {
    const g = feature.geometry;
    if (!g || !['Polygon', 'MultiPolygon'].includes(g.type) || !Array.isArray(g.coordinates)) throw new Error('Solo se admiten huellas Polygon/MultiPolygon.');
    return g.type === 'Polygon' ? [g.coordinates] : g.coordinates;
  }
  function ringPoints(ring, local) {
    if (!Array.isArray(ring) || ring.length < 4 || ring.length > 20000) throw new Error('Contorno territorial inválido.');
    const out = [];
    for (const p of ring) {
      if (!Array.isArray(p) || p.length < 2 || !p.slice(0, 2).every(Number.isFinite)) throw new Error('Contorno sin coordenadas geográficas válidas.');
      const q = local(p[0], p[1], 0); if (!out.length || V.dist(out.at(-1), q) > 1e-5) out.push(q);
    }
    if (V.dist(out[0], out.at(-1)) < 1e-5) out.pop();
    for (let i = out.length - 1; out.length > 3 && i >= 0; i--) {
      const previous = out[(i + out.length - 1) % out.length], current = out[i], next = out[(i + 1) % out.length];
      if (D.geom.closestOnSegment(previous, next, current).d < 1e-7) out.splice(i, 1);
    }
    if (out.length < 3 || Math.abs(area2(out)) < 1e-5) throw new Error('Contorno degenerado.');
    if (ringsIntersect(out, out, true)) throw new Error('Contorno con intersecciones propias.');
    return out;
  }
  function material(model, color, name) { return model.addMaterial(name, color, 1); }
  function validTriangles(rings, triangles) {
    const points = rings.flat(), edges = new Map(), boundary = new Map(); let offset = 0, total = 0;
    const key = (a, b) => Math.min(a, b) + ':' + Math.max(a, b);
    for (const ring of rings) { for (let i = 0; i < ring.length; i++) { const a = offset + i, b = offset + (i + 1) % ring.length; boundary.set(key(a, b), a < b ? 1 : -1); } offset += ring.length; }
    for (const triangle of triangles) {
      const [a, b, c] = triangle.map(i => points[i]); if (!a || !b || !c) return false;
      const area = ((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])) / 2; if (area <= 1e-10) return false; total += area;
      for (let i = 0; i < 3; i++) { const a = triangle[i], b = triangle[(i + 1) % 3], id = key(a, b), value = edges.get(id) || [0, 0]; value[0]++; value[1] += a < b ? 1 : -1; edges.set(id, value); }
    }
    const area = Math.abs(area2(rings[0])) - rings.slice(1).reduce((sum, ring) => sum + Math.abs(area2(ring)), 0);
    if (Math.abs(total - area) > Math.max(1e-6, area * 1e-8)) return false;
    for (const [id, direction] of boundary) { const edge = edges.get(id); if (!edge || edge[0] !== 1 || edge[1] !== direction) return false; }
    for (const [id, edge] of edges) if (!boundary.has(id) && (edge[0] !== 2 || edge[1] !== 0)) return false;
    return true;
  }
  function triangulateRings(raw) {
    const rings = raw.map((ring, index) => (area2(ring) > 0) === (index === 0) ? ring : ring.slice().reverse());
    if (!D.Earcut) throw new Error('Falta el triangulador territorial Earcut 2.2.4.');
    const points = [], holes = []; for (let i = 0; i < rings.length; i++) { if (i) holes.push(points.length / 2); for (const p of rings[i]) points.push(p[0], p[1]); }
    const flat = D.Earcut(points, holes, 2), triangles = []; for (let i = 0; i < flat.length; i += 3) triangles.push(flat.slice(i, i + 3));
    if (validTriangles(rings, triangles)) return { rings, triangles };
    throw new Error('No se puede triangular la huella y sus patios sin perder su frontera.');
  }
  function outlines(rings, color) {
    const model = new Model();
    for (const ring of rings) { const ids = ring.map(p => model._addVertexRaw(p)); ids.forEach((id, i) => model._addEdgeRaw(id, ids[(i + 1) % ids.length])); }
    if (color) material(model, color, 'Líneas territoriales'); model.touch(); return model;
  }
  function areaSurface(rings, color, elevation) {
    const result = triangulateRings(rings), model = new Model(), mat = material(model, color, 'Cobertura territorial'), points = result.rings.flat(), ids = points.map(p => model._addVertexRaw([p[0], p[1], elevation(p)]));
    for (const indices of result.triangles) {
      const tri = indices.map(index => ids[index]);
      if (V.cross(V.sub(model.P(tri[1]), model.P(tri[0])), V.sub(model.P(tri[2]), model.P(tri[0])))[2] < 0) tri.reverse();
      model._addFaceRaw([tri], { mat });
    }
    for (const edge of model.edges.values()) edge.soft = model.eFaces.get(edge.id).size === 2;
    model.touch(); return model;
  }
  function prism(rings, base, height) {
    const model = new Model(), mat = material(model, '#f4f3ef', 'Edificación — caliza');
    const bottom = [], top = [];
    rings.forEach((raw, index) => {
      const ring = (area2(raw) > 0) === (index === 0) ? raw : raw.slice().reverse();
      bottom.push(ring.map(p => model._addVertexRaw([p[0], p[1], base]))); top.push(ring.map(p => model._addVertexRaw([p[0], p[1], base + height])));
    });
    const bottomFace = model._addFaceRaw(bottom.map(r => r.slice().reverse()), { mat }), topFace = model._addFaceRaw(top, { mat });
    bottom.forEach((ring, k) => ring.forEach((id, i) => { const j = (i + 1) % ring.length; model._addFaceRaw([[id, ring[j], top[k][j], top[k][i]]], { mat }); }));
    const normalized = rings.map((ring, i) => (area2(ring) > 0) === (i === 0) ? ring : ring.slice().reverse()), bottomIds = bottom.flat(), topIds = top.flat(), bottomMap = new Map(bottomIds.map((id, i) => [id, i])), topMap = new Map(topIds.map((id, i) => [id, i]));
    const topValid = validTriangles(normalized, model.faceTriangles(topFace).map(tri => tri.map(id => topMap.get(id))));
    const bottomValid = validTriangles(normalized, model.faceTriangles(bottomFace).map(tri => tri.slice().reverse().map(id => bottomMap.get(id))));
    if (!topValid || !bottomValid) {
      const result = triangulateRings(normalized), originalPoints = normalized.flat(), indexFor = p => originalPoints.indexOf(p), indices = result.rings.flat().map(indexFor);
      model._removeFaceRaw(bottomFace); model._removeFaceRaw(topFace);
      for (const tri of result.triangles) { model._addFaceRaw([tri.map(i => topIds[indices[i]])], { mat }); model._addFaceRaw([tri.slice().reverse().map(i => bottomIds[indices[i]])], { mat }); }
      for (const edge of model.edges.values()) { const fs = [...model.eFaces.get(edge.id)].map(id => model.faces.get(id)); if (fs.length === 2 && Math.abs(fs[0].n[2]) > 0.99 && Math.abs(fs[1].n[2]) > 0.99) edge.soft = true; }
      model._territoryCapTriangulated = true;
    }
    model.touch(); if (!model.isClosed([...model.faces.keys()]) || model.validate().length) throw new Error('La huella no produce un volumen cerrado válido.'); return model;
  }
  function treeModel(style) {
    const model = D.Organic ? D.Organic.ellipsoid({ center: [0, 0, 0.7], radii: [0.3, 0.3, 0.3], segments: 8, rings: 4 }) : null;
    if (!model) throw new Error('El motor de mallas debe cargarse antes de Territorio.');
    const crown = material(model, style === 'white' ? '#f4f3ef' : '#a3d36d', 'Copa simbólica'); for (const f of model.faces.values()) f.mat = crown;
    const trunk = material(model, style === 'white' ? '#f4f3ef' : '#b7ae99', 'Tronco simbólico');
    const points = [[-0.025, -0.025], [0.025, -0.025], [0.025, 0.025], [-0.025, 0.025]], low = points.map(p => model._addVertexRaw([p[0], p[1], 0])), high = points.map(p => model._addVertexRaw([p[0], p[1], 0.55]));
    model._addFaceRaw([low.slice().reverse()], { mat: trunk }); model._addFaceRaw([high], { mat: trunk });
    low.forEach((id, i) => { const j = (i + 1) % low.length; model._addFaceRaw([[id, low[j], high[j], high[i]]], { mat: trunk }); }); model.touch(); return model;
  }
  function positive(value, fallback, name, max) { const n = value === undefined ? fallback : Number(value); if (!Number.isFinite(n) || n <= 0 || n > (max || 500)) throw new Error(name + ' fuera de rango.'); return n; }
  function heightValue(value) { if (typeof value === 'number') return Number.isFinite(value) ? value : null; if (typeof value !== 'string' || !/^\s*\d+(?:[.,]\d+)?\s*(?:m)?\s*$/i.test(value)) return null; return Number(value.replace(/m/ig, '').trim().replace(',', '.')); }
  function clipSegment(a, b, box) {
    const dx = b[0] - a[0], dy = b[1] - a[1]; let start = 0, end = 1;
    for (const [p, q] of [[-dx, a[0] - box[0]], [dx, box[2] - a[0]], [-dy, a[1] - box[1]], [dy, box[3] - a[1]]]) {
      if (Math.abs(p) < 1e-20) { if (q < 0) return null; }
      else { const t = q / p; if (p < 0) start = Math.max(start, t); else end = Math.min(end, t); if (start > end) return null; }
    }
    return [[a[0] + start * dx, a[1] + start * dy], [a[0] + end * dx, a[1] + end * dy]];
  }
  function prepare(data, options, existing) {
    json(data, 0); options = options || {}; json(options, 0);
    if (data.format !== 'dedalo.territory-data' || data.version !== 1 || data.crs !== 'EPSG:4326') throw new Error('Formato territorial no admitido.');
    const box = validBBox(data.bbox), center = [(box[0] + box[2]) / 2, (box[1] + box[3]) / 2], info = existing ? crsInfo(existing.crs) : chooseCRS(...center);
    const p0 = project(box[0], box[1], info.crs), p1 = project(box[2], box[3], info.crs), width = Math.abs(p1[0] - p0[0]), depth = Math.abs(p1[1] - p0[1]);
    if (width * depth > LIMITS.area || width > LIMITS.extent || depth > LIMITS.extent) throw new Error('El área territorial supera 1 km² o 2000 m por lado; reduce el recorte.');
    const arrays = ['parcels', 'buildingParts', 'trees', 'vegetationAreas', 'roads', 'waterways', 'waterAreas']; for (const key of [...arrays, 'sources', 'warnings']) if (data[key] !== undefined && !Array.isArray(data[key])) throw new Error(key + ' debe ser una lista.');
    if (arrays.reduce((n, key) => n + (data[key] || []).length, 0) > LIMITS.features) throw new Error('Demasiados elementos territoriales; reduce el recorte.');
    const terrain = terrainReader(data.terrain), heights = terrain ? terrain.validValues.slice().sort((a, b) => a - b) : [], projectedCenter = project(...center, info.crs);
    const origin = existing && existing.origin ? existing.origin.slice() : [projectedCenter[0], projectedCenter[1], heights.length ? heights[Math.floor(heights.length / 2)] : 0];
    if (!Array.isArray(origin) || origin.length !== 3 || !origin.every(Number.isFinite)) throw new Error('Origen geográfico inválido.');
    const georeference = existing ? clone(existing) : { crs: info.crs, datum: info.datum, ellipsoid: info.ellipsoid, units: 'm', origin, sourceCRS: data.crs, center, verticalDatum: data.terrain && data.terrain.verticalDatum || 'not-provided',
      horizontalTransform: 'Proyección GRS80 de coordenadas WGS84 compatibles; sin corrección de datum/época. Precisión geodésica no certificada.', verticalOriginStatus: heights.length ? 'derived-from-valid-terrain-grid' : 'unavailable-reference-zero' };
    const warnings = [...new Set((data.warnings || []).map(String))], stats = { parcels: 0, buildings: 0, footprintsOnly: 0, terrainFaces: 0, trees: 0, vegetationAreas: 0, roads: 0, waterways: 0, waterAreas: 0, skippedFeatures: 0, faces: 0, vertices: 0 };
    if (!terrain || !heights.length) warnings.push('Sin cotas de terreno válidas: bases sobre Z=0 local de referencia, sin elevación medida.');
    const local = (lon, lat, absoluteZ) => { const p = project(lon, lat, info.crs); const q = [p[0] - origin[0], p[1] - origin[1], absoluteZ - origin[2]]; if (q.some(v => !Number.isFinite(v) || Math.abs(v) > 50000)) throw new Error('Coordenada fuera del recorte territorial.'); return q; };
    const children = [], components = new Map();
    const categories = {};
    const category = (role, name) => categories[role] || (categories[role] = { name, role, children: [], model: new Model() });
    const budget = model => { stats.faces += model.faces.size; stats.vertices += model.verts.size; if (stats.faces > LIMITS.faces || stats.vertices > LIMITS.vertices) throw new Error('Se supera el límite de ' + LIMITS.faces + ' caras o ' + LIMITS.vertices + ' vértices. Reduce el recorte.'); };
    const metadata = (feature, role, extra) => ({ territory: Object.assign({ role, sourceId: feature.sourceId || feature.source || null, featureId: String(feature.id || feature.properties && feature.properties.id || ''), properties: clone(feature.properties || feature.tags || {}), provenance: clone(feature.provenance || {}) }, extra || {}) });
    const floorHeight = positive(options.floorHeight, 3, 'Altura por planta', 10);
    function featureRings(feature) {
      return polygons(feature).map(poly => {
        if (!Array.isArray(poly) || !poly.length) throw new Error('Polígono sin contorno exterior.');
        const rings = poly.map(ring => ringPoints(ring, local));
        for (let h = 1; h < rings.length; h++) {
          if (rings[h].some(p => D.geom.pointInPoly2(p, rings[0]) <= 0) || ringsIntersect(rings[0], rings[h], false)) throw new Error('Patio fuera de la huella o tocando su perímetro.');
          for (let k = 1; k < h; k++) if (ringsIntersect(rings[k], rings[h], false) || D.geom.pointInPoly2(rings[h][0], rings[k]) >= 0 || D.geom.pointInPoly2(rings[k][0], rings[h]) >= 0) throw new Error('Patios solapados o anidados.');
        }
        return rings;
      });
    }
    function sourceRings(feature) {
      try { return featureRings(feature); }
      catch (error) { stats.skippedFeatures++; warnings.push('Geometría de fuente omitida [' + String(feature.id || 'sin ID') + ']: ' + error.message); return []; }
    }
    for (const feature of data.parcels || []) {
      const rings = sourceRings(feature).flat(); if (!rings.length) continue;
      const lonlat = feature.geometry.type === 'Polygon' ? feature.geometry.coordinates[0][0] : feature.geometry.coordinates[0][0][0], absolute = terrain && terrain.sample(lonlat[0], lonlat[1]);
      const z = absolute === null || absolute === false ? 0 : (absolute === undefined ? 0 : absolute - origin[2]); rings.forEach(r => r.forEach(p => p[2] = z + 0.03));
      const model = outlines(rings); budget(model); category('parcels', 'Parcelas').children.push({ name: 'Parcela ' + (feature.id || stats.parcels + 1), model, metadata: metadata(feature, 'parcel-boundary', { elevation: absolute === null || !terrain ? 'reference-plane' : 'terrain-derived' }) }); stats.parcels++;
    }
    for (const feature of data.buildingParts || []) {
      const props = feature.properties || {}, supplied = heightValue(props.height !== undefined ? props.height : props.heightAboveGround), floors = Number(props.floors === undefined ? props.numberOfFloorsAboveGround === undefined ? props['building:levels'] : props.numberOfFloorsAboveGround : props.floors);
      let height = supplied, kind = supplied !== null ? 'source-height' : 'unavailable';
      if (height === null && Number.isFinite(floors) && floors > 0 && floors <= 150) { height = floors * floorHeight; kind = 'inferred-from-floors'; }
      if (height === null && options.defaultBuildingHeight !== undefined) { height = positive(options.defaultBuildingHeight, 3, 'Altura estimada', 500); kind = 'explicit-estimated-default'; }
      const minHeight = heightValue(props.min_height === undefined ? props.minHeight : props.min_height) || 0;
      if (height !== null && (height <= minHeight || height > 500 || minHeight < 0)) throw new Error('Altura de edificio inválida.');
      const polygonsLocal = sourceRings(feature);
      polygonsLocal.forEach((rings, part) => {
        const centroid = rings[0].reduce((p, q) => V.add(p, V.scale(q, 1 / rings[0].length)), [0, 0, 0]), ll = inverse(centroid[0] + origin[0], centroid[1] + origin[1], info.crs), sampled = terrain ? terrain.sample(...ll) : null, base = sampled === null ? 0 : sampled - origin[2];
        let model;
        try { model = height === null ? outlines(rings.map(r => r.map(p => [p[0], p[1], base]))) : prism(rings, base + minHeight, height - minHeight); }
        catch (error) { stats.skippedFeatures++; warnings.push('Volumen de fuente omitido [' + String(feature.id || 'sin ID') + ']: ' + error.message); return; }
        if (model._territoryCapTriangulated) warnings.push('Patios complejos triangulados como caras nativas suaves [' + String(feature.id || 'sin ID') + '].');
        budget(model);
        category('buildings', 'Edificios').children.push({ name: 'Edificio ' + (feature.id || stats.buildings + stats.footprintsOnly + 1) + (polygonsLocal.length > 1 ? ' · ' + (part + 1) : ''), model,
          metadata: metadata(feature, 'building-part', { height: { value: height, kind, floors: Number.isFinite(floors) ? floors : null, floorHeight: kind === 'inferred-from-floors' ? floorHeight : null, editable: true }, capRepresentation: model._territoryCapTriangulated ? 'validated-native-triangles' : 'native-polygon-with-holes', minHeight, base: { absolute: sampled, local: base, kind: sampled === null ? 'unavailable-reference-plane' : 'bilinear-terrain-derived' }, part }) });
        if (height === null) stats.footprintsOnly++; else stats.buildings++;
      });
    }
    if (stats.footprintsOnly) warnings.push(stats.footprintsOnly + ' huellas sin altura/planta documentada: se conservan como contornos, sin volumen inventado.');
    if (terrain) {
      const model = new Model(), mat = material(model, '#eeefec', 'Terreno MDT'), ids = new Map();
      const vertex = (r, c) => { const key = r * terrain.cols + c; if (!ids.has(key)) ids.set(key, model._addVertexRaw(local(...terrain.lonlat(r, c), terrain.at(r, c)))); return ids.get(key); };
      for (let r = 0; r < terrain.rows - 1; r++) for (let c = 0; c < terrain.cols - 1; c++) {
        if ([[r, c], [r + 1, c], [r, c + 1], [r + 1, c + 1]].some(([rr, cc]) => terrain.at(rr, cc) === null)) continue;
        const a = vertex(r, c), b = vertex(r + 1, c), cc = vertex(r, c + 1), d = vertex(r + 1, c + 1);
        for (const tri of [[a, b, cc], [cc, b, d]]) {
          const cross = V.cross(V.sub(model.P(tri[1]), model.P(tri[0])), V.sub(model.P(tri[2]), model.P(tri[0])));
          if (cross[2] < 0) tri.reverse(); model._addFaceRaw([tri], { mat });
        }
      }
      for (const edge of model.edges.values()) edge.soft = model.eFaces.get(edge.id).size === 2;
      model.touch(); budget(model); stats.terrainFaces = model.faces.size;
      if (model.faces.size) category('terrain', 'Terreno').children.push({ name: 'MDT · ' + terrain.rows + ' × ' + terrain.cols, model, metadata: { territory: { role: 'terrain', sourceId: data.terrain.sourceId || null, verticalDatum: data.terrain.verticalDatum || 'not-provided', nodata: data.terrain.nodata === undefined ? null : data.terrain.nodata, rows: terrain.rows, cols: terrain.cols, status: 'derived-grid-triangulation-no-nodata-fill' } } });
    }
    const surfaceElevation = p => { const ll = inverse(p[0] + origin[0], p[1] + origin[1], info.crs), z = terrain ? terrain.sample(...ll) : null; return z === null ? 0.06 : z - origin[2] + 0.06; };
    for (const key of ['roads', 'waterways']) for (const feature of data[key] || []) {
      const g = feature.geometry;
      if (!g || !['LineString', 'MultiLineString'].includes(g.type)) throw new Error('El trazado necesita LineString/MultiLineString.');
      const lines = g.type === 'LineString' ? [g.coordinates] : g.coordinates, model = new Model();
      for (const line of lines) {
        if (!Array.isArray(line) || line.length < 2 || line.length > 20000) throw new Error('Trazado territorial inválido.');
        for (const p of line) if (!Array.isArray(p) || p.length < 2 || !p.slice(0, 2).every(Number.isFinite)) throw new Error('Coordenadas de trazado inválidas.');
        for (let i = 1; i < line.length; i++) {
          const segment = clipSegment(line[i - 1], line[i], box); if (!segment) continue;
          const points = segment.map(p => { const q = local(p[0], p[1], 0); q[2] = surfaceElevation(q); return q; });
          if (V.dist(points[0], points[1]) > 1e-6) model._addEdgeRaw(model._addVertexRaw(points[0]), model._addVertexRaw(points[1]));
        }
      }
      model.touch(); budget(model); category(key, key === 'roads' ? 'Viales · ejes de fuente' : 'Cauces · trazados de fuente').children.push({ name: (key === 'roads' ? 'Vial ' : 'Cauce ') + (feature.id || stats[key] + 1), model, metadata: metadata(feature, key === 'roads' ? 'road-centerline' : 'waterway-centerline', { representation: 'source-centerline-terrain-projected-no-invented-width' }) }); stats[key]++;
    }
    for (const key of ['vegetationAreas', 'waterAreas']) for (const feature of data[key] || []) {
      const water = key === 'waterAreas';
      for (const rings of sourceRings(feature)) {
        const model = areaSurface(rings, water ? '#93c5dd' : '#d6e5c7', surfaceElevation); budget(model);
        category(water ? 'water' : 'vegetation', water ? 'Agua · huellas de fuente' : 'Vegetación observada').children.push({ name: (water ? 'Área de agua ' : 'Área vegetal ') + (feature.id || stats[key] + 1), model,
          metadata: metadata(feature, water ? 'water-area' : 'vegetation-area', { representation: water ? 'source-footprint-terrain-projected-not-measured-water-level-or-depth' : 'source-footprint-terrain-projected-no-generated-trees' }) }); stats[key]++;
      }
    }
    if ((data.trees || []).length) {
      const style = options.treeStyle === 'white' ? 'white' : 'natural', model = treeModel(style); components.set('tree', { name: 'Árbol simbólico compartido', model, metadata: { territory: { role: 'tree-symbol', style, representation: 'symbolic-ellipsoid-crown-and-trunk' } } });
      for (const feature of data.trees) {
        if (![feature.lon, feature.lat].every(Number.isFinite)) throw new Error('Árbol sin posición geográfica válida.');
        const sourceHeight = heightValue(feature.tags && feature.tags.height), height = positive(sourceHeight === null ? options.treeHeight : sourceHeight, 6, 'Altura de árbol', 100), sampled = terrain ? terrain.sample(feature.lon, feature.lat) : null;
        const p = local(feature.lon, feature.lat, sampled === null ? origin[2] : sampled), matrix = M.identity(); matrix[0] = matrix[5] = matrix[10] = height; matrix[12] = p[0]; matrix[13] = p[1]; matrix[14] = p[2]; budget(model);
        category('trees', 'Arbolado registrado').children.push({ name: 'Árbol ' + (feature.id || stats.trees + 1), component: 'tree', matrix, metadata: metadata(feature, 'tree', { position: 'source-recorded', lon: feature.lon, lat: feature.lat, height: { value: height, kind: sourceHeight === null ? 'symbolic-estimated' : 'source-height' }, base: sampled === null ? 'reference-plane' : 'terrain-derived' }) }); stats.trees++;
      }
    }
    for (const value of Object.values(categories)) children.push(value);
    if (!children.length) throw new Error('No hay geometría territorial válida para importar.');
    return { children, components, georeference, warnings, stats, metadata: { territory: { role: 'territory', bbox: box.slice(), sources: clone(data.sources || []), warnings, stats, georeference } } };
  }
  function importData(doc, data, options) {
    if (doc.editPath.length) throw new Error('Sal del grupo activo antes de importar Territorio.');
    const plan = prepare(data, options, doc.scene.georeference), rootDef = doc.scene.addDefinition('Territorio', 'group'), rootNode = doc.scene.addNode([], { definitionId: rootDef.id, name: 'Territorio' });
    rootNode.metadata = clone(plan.metadata); rootDef.metadata = clone(plan.metadata); const shared = new Map();
    for (const [key, value] of plan.components) { const def = doc.scene.addDefinition(value.name, 'component', value.model); def.metadata = clone(value.metadata); shared.set(key, def.id); }
    function add(item, path) {
      const id = item.component ? shared.get(item.component) : doc.scene.addDefinition(item.name, 'group', item.model || new Model()).id;
      const node = doc.scene.addNode(path, { definitionId: id, name: item.name, matrix: item.matrix || M.identity() });
      node.metadata = clone(item.metadata || { territory: { role: 'territory-group', category: item.role || null } });
      if (!item.component) doc.scene.definitions.get(id).metadata = clone(node.metadata);
      for (const child of item.children || []) add(child, [...path, node.id]); return node;
    }
    for (const item of plan.children) add(item, [rootNode.id]); doc.scene.georeference = clone(plan.georeference); doc.clearSelection(true); doc.sel.nodes.add(rootNode.id);
    return { ok: true, node: rootNode.id, georeference: plan.georeference, warnings: plan.warnings, stats: plan.stats };
  }
  const Previous = D.Document;
  D.Document = class TerritoryDocument extends Previous {
    constructor() {
      super();
      this.register('geo.import', { title: 'Importar Territorio', params: { data: 'dedalo.territory-data v1', options: 'floorHeight, treeHeight, treeStyle' }, run: p => importData(this, p.data, p.options) });
      this.register('geo.info', { title: 'Información de Territorio', undoable: false, run: () => ({ ok: true, georeference: clone(this.scene.georeference || null), territories: this.scene.current([]).nodes.filter(n => n.metadata && n.metadata.territory && n.metadata.territory.role === 'territory').map(n => ({ node: n.id, name: n.name, ...clone(n.metadata.territory) })) }) });
    }
  };
  D.Territory = { project, inverse, chooseCRS, crsInfo, terrainReader, prepare, importData, limits: LIMITS };
})(typeof window !== 'undefined' ? window : globalThis);
