/* Dédalo — concept meshes: ellipsoids, sampled Bézier patches and Loop subdivision.
 * Pure geometry and commands, no DOM or renderer. Saved as ordinary native topology.
 * Loop masks: pbr-book.org/3ed-2018/Shapes/Subdivision_Surfaces (independent implementation).
 */
(function (root) {
  'use strict';
  const D = root.DEDALO, { V, Model } = D;
  const MAX_FACES = 16000, MAX_COORD = 1e8;
  const copy = x => JSON.parse(JSON.stringify(x));
  function point(p, name) {
    if (!Array.isArray(p) || p.length !== 3 || p.some(x => !Number.isFinite(x) || Math.abs(x) > MAX_COORD)) throw new Error((name || 'Punto') + ': se requieren tres coordenadas finitas.');
    return p;
  }
  function integer(value, fallback, min, max, name) {
    const n = value === undefined ? fallback : value;
    if (!Number.isSafeInteger(n) || n < min || n > max) throw new Error(name + ' debe estar entre ' + min + ' y ' + max + '.');
    return n;
  }
  function positive(value, fallback, name) {
    const n = value === undefined ? fallback : value;
    if (!Number.isFinite(n) || n < 1e-4 || n > 1e4) throw new Error(name + ' debe estar entre 0,0001 y 10000 m.');
    return n;
  }
  const edgeKey = (a, b) => a < b ? a + ':' + b : b + ':' + a;

  function mesh(points, triangles, source, sourceIds) {
    if (!triangles.length || triangles.length > MAX_FACES) throw new Error('La malla admite hasta ' + MAX_FACES + ' triángulos.');
    const m = new Model();
    if (source) {
      m.nextId = source.nextId;
      for (const [id, material] of source.materials) { m.materials.set(id, copy(material)); m.identities.set(id, source.identities.get(id)); }
      for (const [id, annot] of source.annots) { m.annots.set(id, copy(annot)); m.identities.set(id, source.identities.get(id)); }
    }
    const ids = points.map((p, i) => {
      point(p);
      if (sourceIds && sourceIds[i] !== undefined) {
        const id = sourceIds[i]; m.verts.set(id, { id, p: p.slice() }); m.vEdges.set(id, new Set()); m.identities.set(id, source.identities.get(id)); return id;
      }
      return m._addVertexRaw(p);
    });
    for (const t of triangles) {
      if (t.length < 3 || t.slice(0, 3).some(i => !Number.isSafeInteger(i) || !points[i])) throw new Error('Triángulo inválido.');
      if (new Set(t.slice(0, 3)).size !== 3 || V.len(V.cross(V.sub(points[t[1]], points[t[0]]), V.sub(points[t[2]], points[t[0]]))) < 1e-14) throw new Error('La operación genera un triángulo degenerado.');
      m._addFaceRaw([t.slice(0, 3).map(i => ids[i])], { mat: t[3] || null });
    }
    for (const e of m.edges.values()) e.soft = m.eFaces.get(e.id).size === 2;
    m.touch();
    const errors = m.validate(); if (errors.length) throw new Error(errors[0]);
    return m;
  }
  function ellipsoid(p) {
    const center = point(p.center || [0, 0, 0], 'Centro');
    const r = point(p.radii || [0.3, 0.15, 0.12], 'Radios');
    r.forEach(x => positive(x, 1, 'Radio'));
    const sides = integer(p.segments, 16, 8, 64, 'Segmentos'), rings = integer(p.rings, 8, 4, 32, 'Anillos');
    const pts = [[center[0], center[1], center[2] + r[2]]], tris = [];
    const at = (j, i) => 1 + (j - 1) * sides + (i + sides) % sides;
    for (let j = 1; j < rings; j++) for (let i = 0; i < sides; i++) {
      const a = Math.PI * j / rings, b = 2 * Math.PI * i / sides;
      pts.push([center[0] + r[0] * Math.sin(a) * Math.cos(b), center[1] + r[1] * Math.sin(a) * Math.sin(b), center[2] + r[2] * Math.cos(a)]);
    }
    const bottom = pts.length; pts.push([center[0], center[1], center[2] - r[2]]);
    for (let i = 0; i < sides; i++) {
      tris.push([0, at(1, i), at(1, i + 1)]);
      for (let j = 1; j < rings - 1; j++) {
        const a = at(j, i), b = at(j + 1, i), c = at(j + 1, i + 1), d = at(j, i + 1);
        tris.push([a, b, d], [b, c, d]);
      }
      tris.push([at(rings - 1, i), bottom, at(rings - 1, i + 1)]);
    }
    return mesh(pts, tris);
  }
  function bezierPatch(p) {
    const steps = integer(p.segments, 10, 2, 48, 'Segmentos');
    const o = point(p.origin || [0, 0, 0], 'Origen');
    let controls = p.controls;
    if (controls === undefined) {
      const w = positive(p.width, 1, 'Ancho'), d = positive(p.depth, 0.6, 'Fondo');
      const bulge = p.bulge === undefined ? 0.12 : p.bulge;
      if (!Number.isFinite(bulge) || Math.abs(bulge) > Math.max(w, d) * 2) throw new Error('Curvatura fuera del rango de este paño.');
      controls = [];
      // Middle Bernstein weights sum to 3/4 on each axis at t=1/2.
      // Scale controls so bulge is the actual central height, in metres.
      for (let j = 0; j < 4; j++) for (let i = 0; i < 4; i++) controls.push([o[0] + w * i / 3, o[1] + d * j / 3, o[2] + (i > 0 && i < 3 && j > 0 && j < 3 ? bulge * 16 / 9 : 0)]);
    }
    if (!Array.isArray(controls) || controls.length !== 16) throw new Error('El paño Bézier necesita 16 puntos de control [x,y,z].');
    controls.forEach(c => point(c, 'Control'));
    const bernstein = t => [(1 - t) ** 3, 3 * t * (1 - t) ** 2, 3 * t * t * (1 - t), t ** 3];
    const pts = [], tris = [];
    for (let j = 0; j <= steps; j++) for (let i = 0; i <= steps; i++) {
      const u = bernstein(i / steps), v = bernstein(j / steps), q = [0, 0, 0];
      for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) for (let k = 0; k < 3; k++) q[k] += controls[y * 4 + x][k] * u[x] * v[y];
      pts.push(q);
      if (j < steps && i < steps) { const a = j * (steps + 1) + i, b = a + 1, c = a + steps + 1, d = c + 1; tris.push([a, b, c], [b, d, c]); }
    }
    return mesh(pts, tris);
  }
  function triangulated(model) {
    const ids = [...model.verts.keys()], index = new Map(ids.map((id, i) => [id, i]));
    const pts = ids.map(id => model.P(id).slice()), tris = [];
    for (const f of model.faces.values()) for (const t of model.faceTriangles(f.id)) tris.push([...t.map(id => index.get(id)), f.mat || null]);
    if (!tris.length) throw new Error('No hay caras para subdividir.');
    const used = new Set(tris.flatMap(t => t.slice(0, 3)));
    if (used.size !== pts.length || [...model.edges.values()].some(e => !model.eFaces.get(e.id).size)) throw new Error('Subdivide una malla sin aristas o vértices sueltos.');
    return { pts, tris, ids };
  }
  function loopStep(data, preserveBoundary) {
    if (data.tris.length * 4 > MAX_FACES) throw new Error('Se supera el límite de ' + MAX_FACES + ' triángulos.');
    const edges = new Map(), neighbours = data.pts.map(() => new Set()), boundary = data.pts.map(() => []), fans = data.pts.map(() => new Map());
    for (const t of data.tris) for (let i = 0; i < 3; i++) {
      const a = t[i], b = t[(i + 1) % 3], c = t[(i + 2) % 3], key = edgeKey(a, b);
      if (!edges.has(key)) edges.set(key, { a, b, across: [] });
      const e = edges.get(key);
      if (e.across.length === 1 && e.a === a && e.b === b) throw new Error('Orienta las caras vecinas de forma coherente antes de subdividir.');
      e.across.push(c); if (e.across.length > 2) throw new Error('La subdivisión necesita aristas con una o dos caras.');
      neighbours[a].add(b); neighbours[b].add(a);
      if (!fans[a].has(b)) fans[a].set(b, new Set());
      if (!fans[a].has(c)) fans[a].set(c, new Set());
      fans[a].get(b).add(c); fans[a].get(c).add(b);
    }
    for (const e of edges.values()) if (e.across.length === 1) { boundary[e.a].push(e.b); boundary[e.b].push(e.a); }
    const pts = data.pts.map((p, i) => {
      const border = boundary[i], ring = [...neighbours[i]];
      const visited = new Set(), todo = ring.length ? [ring[0]] : [];
      while (todo.length) { const id = todo.pop(); if (visited.has(id)) continue; visited.add(id); for (const adjacent of fans[i].get(id) || []) todo.push(adjacent); }
      if (visited.size !== ring.length) throw new Error('La malla contiene abanicos desconectados en un vértice.');
      if (border.length) {
        if (border.length !== 2) throw new Error('El contorno de la malla no es manifold.');
        return preserveBoundary ? p.slice() : V.add(V.scale(p, 0.75), V.scale(V.add(data.pts[border[0]], data.pts[border[1]]), 0.125));
      }
      if (ring.length < 3) throw new Error('La malla contiene un vértice no manifold.');
      // Warren/Loop mask used by PBRT: beta(3)=3/16, beta(n>3)=3/(8n).
      const beta = ring.length === 3 ? 3 / 16 : 3 / (8 * ring.length);
      return ring.reduce((q, id) => V.add(q, V.scale(data.pts[id], beta)), V.scale(p, 1 - ring.length * beta));
    });
    for (const e of edges.values()) {
      e.mid = pts.length;
      const sum = V.add(data.pts[e.a], data.pts[e.b]);
      pts.push(e.across.length === 1 ? V.scale(sum, 0.5) : V.add(V.scale(sum, 3 / 8), V.scale(V.add(data.pts[e.across[0]], data.pts[e.across[1]]), 1 / 8)));
    }
    const tris = [];
    for (const [a, b, c, mat] of data.tris) {
      const ab = edges.get(edgeKey(a, b)).mid, bc = edges.get(edgeKey(b, c)).mid, ca = edges.get(edgeKey(c, a)).mid;
      tris.push([a, ab, ca, mat], [b, bc, ab, mat], [c, ca, bc, mat], [ab, bc, ca, mat]);
    }
    return { pts, tris, ids: data.ids };
  }
  function subdivide(model, levels, preserveBoundary) {
    let data = triangulated(model);
    for (let i = 0; i < integer(levels, 1, 1, 2, 'Niveles'); i++) data = loopStep(data, preserveBoundary !== false);
    return mesh(data.pts, data.tris, model, data.ids);
  }
  function deform(model, p) {
    const center = point(p.center, 'Centro'), vector = point(p.vector, 'Desplazamiento'), radius = positive(p.radius, 0.2, 'Radio');
    if (V.len(vector) > radius * 2) throw new Error('Usa una deformación de hasta dos veces el radio del pincel.');
    const affected = [];
    for (const v of model.verts.values()) {
      const t = 1 - V.dist(v.p, center) / radius;
      if (t <= 0) continue;
      const weight = t * t * (3 - 2 * t), q = V.add(v.p, V.scale(vector, weight)); point(q);
      affected.push([v.id, q]);
    }
    if (!affected.length) throw new Error('El radio no alcanza ningún vértice; aumenta el radio o la densidad de la malla.');
    for (const [id, q] of affected) model.verts.get(id).p = q;
    model._tri.clear();
    for (const f of model.faces.values()) model._computePlane(f);
    // Existing quads may cease to be planar; triangulate through the native repair.
    model._repairNonPlanar([...model.faces.keys()]); model.touch();
    for (const f of model.faces.values()) {
      if (V.len(D.geom.newellNormal(f.loops[0].map(id => model.P(id)))) < 1e-14) throw new Error('La deformación colapsa una cara; reduce el desplazamiento.');
    }
    return affected.map(x => x[0]);
  }
  function target(doc, p) {
    if (p.nodes !== undefined && !Array.isArray(p.nodes)) throw new Error('nodes debe ser una lista de UUID.');
    const ids = p.nodes || [...doc.sel.nodes];
    if (ids.length) {
      if (ids.length !== 1) throw new Error('Selecciona una sola malla, grupo o componente.');
      const node = doc.scene.node(doc.editPath, ids[0]); if (!node) throw new Error('Malla fuera del contexto actual.');
      const def = doc.scene.definitions.get(node.definitionId);
      return { def, node };
    }
    if (!doc.editPath.length) throw new Error('Selecciona una malla o entra en un grupo para editarla.');
    return { def: doc.currentDefinition(), node: null };
  }
  function register(doc) {
    const R = (name, title, params, run) => doc.register(name, { title, params, run });
    const create = (p, factory, fallback) => {
      const geometry = factory(p), def = doc.scene.addDefinition(String(p.name || fallback), 'group', geometry);
      const node = doc.scene.addNode(doc.editPath, { definitionId: def.id, name: def.name, matrix: D.SceneMath.identity() });
      doc.clearSelection(true); doc.sel.nodes.add(node.id);
      return { ok: true, node: node.id, definitionId: def.id, faces: geometry.faces.size };
    };
    R('mesh.ellipsoid', 'Crear elipsoide orgánico', { center: '[x,y,z]', radii: '[rx,ry,rz]', segments: '8–64', rings: '4–32', name: 'texto' }, p => create(p, ellipsoid, 'Elipsoide'));
    R('mesh.patch', 'Crear paño Bézier', { origin: '[x,y,z]', width: 'm', depth: 'm', bulge: 'm', controls: '16 puntos opcionales', segments: '2–48' }, p => create(p, bezierPatch, 'Paño curvo'));
    R('mesh.subdivide', 'Subdividir malla (Loop)', { nodes: '[UUID] o contexto actual', levels: '1–2', preserveBoundary: 'bool' }, p => {
      if (p.preserveBoundary !== undefined && typeof p.preserveBoundary !== 'boolean') throw new Error('preserveBoundary debe ser booleano.');
      const t = target(doc, p), next = subdivide(t.def.model, p.levels, p.preserveBoundary);
      t.def.model.load(next.toJSON()); doc.clearSelection(true); if (t.node) doc.sel.nodes.add(t.node.id);
      return { ok: true, definitionId: t.def.id, faces: next.faces.size };
    });
    R('mesh.deform', 'Deformación suave', { center: '[x,y,z] local', radius: 'm', vector: '[dx,dy,dz] local' }, p => {
      if (!doc.editPath.length) throw new Error('Entra en la malla con doble clic antes de deformar.');
      const model = doc.currentDefinition().model;
      const vertices = deform(model, p); doc.clearSelection(true);
      return { ok: true, vertices };
    });
  }
  const Previous = D.Document;
  D.Document = class OrganicDocument extends Previous { constructor() { super(); register(this); } };
  D.Organic = { ellipsoid, bezierPatch, subdivide, deform, maxFaces: MAX_FACES };
})(typeof window !== 'undefined' ? window : globalThis);
