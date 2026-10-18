/*
 * Mallas orgánicas: contratos geométricos y del documento, Node puro.
 * Ejecutar: node tests/organic-tests.js
 * Máscaras Loop contrastadas con PBRT 3e, Shapes/Subdivision_Surfaces.
 * Estas pruebas comprueban refinement poligonal; no una superficie límite NURBS.
 */
'use strict';
const assert = require('node:assert/strict');
const path = require('node:path');
for (const file of ['geom', 'model', 'document', 'scene', 'hierarchy', 'organic']) {
  require(path.join(__dirname, '..', 'app', 'js', 'core', file + '.js'));
}
const D = globalThis.DEDALO, O = D.Organic, V = D.V;
let passed = 0, failed = 0;
const failures = [];
function test(name, run) {
  try { run(); passed++; console.log('  ok   ' + name); }
  catch (error) { failed++; failures.push(name); console.error('  FALLA ' + name + '\n        ' + String(error.stack || error).split('\n').slice(0, 5).join('\n        ')); }
}
function near(actual, expected, message, tolerance) {
  assert.ok(Number.isFinite(actual) && Math.abs(actual - expected) <= (tolerance || 1e-9),
    (message || 'valor') + ': ' + actual + ' ≠ ' + expected);
}
function vector(actual, expected, message, tolerance) {
  assert.equal(actual.length, expected.length); actual.forEach((n, i) => near(n, expected[i], message, tolerance));
}
function command(doc, name, params) {
  const result = doc.execute(name, params || {});
  assert.ok(result && result.ok, name + ': ' + (result && result.error)); return result;
}
function valid(model) {
  assert.deepEqual(model.validate(), [], 'topología nativa coherente');
  for (const f of model.faces.values()) {
    assert.equal(f.loops.length, 1); assert.equal(f.loops[0].length, 3, 'caras triangulares');
    assert.ok(model.faceArea(f.id) > 1e-14, 'sin triángulos degenerados');
    near(V.len(f.n), 1, 'normal unitaria', 1e-7);
  }
}
function boundary(model) { return [...model.edges.values()].filter(e => model.eFaces.get(e.id).size === 1); }
function signedVolume(model) {
  let sum = 0;
  for (const f of model.faces.values()) for (const [a, b, c] of model.faceTriangles(f.id)) sum += V.dot(model.P(a), V.cross(model.P(b), model.P(c))) / 6;
  return sum;
}
function oriented(model, center) {
  for (const f of model.faces.values()) {
    const pts = f.loops[0].map(id => model.P(id));
    const centroid = pts.reduce((p, q) => V.add(p, V.scale(q, 1 / pts.length)), [0, 0, 0]);
    assert.ok(V.dot(f.n, V.sub(centroid, center)) > 0, 'normal exterior de la cara ' + f.id);
  }
  // Cada arista interior se recorre en sentidos opuestos en sus dos caras.
  for (const e of model.edges.values()) if (model.eFaces.get(e.id).size === 2) {
    const signs = [...model.eFaces.get(e.id)].map(id => {
      const loop = model.faces.get(id).loops[0], i = loop.indexOf(e.a);
      return loop[(i + 1) % loop.length] === e.b ? 1 : -1;
    });
    assert.equal(signs[0] + signs[1], 0, 'orientación consistente de una arista interior');
  }
}
function bbox(model, min, max) { const b = model.bbox(); vector(b.min, min, 'bbox min'); vector(b.max, max, 'bbox max'); }
function clone(value) { return JSON.parse(JSON.stringify(value)); }
function state(doc) {
  return JSON.stringify({ scene: doc.scene.toJSON(), path: doc.editPath, selection: doc.selectionItems(),
    undo: doc.undoStack, redo: doc.redoStack, dirty: doc.dirty, version: doc.projectVersion, audit: doc.audit, projectId: doc.projectId });
}
function def(doc, result) { return doc.scene.definitions.get(result.definitionId); }
function rawMesh(points, triangles, outwardCenter) {
  const m = new D.Model(), ids = points.map(p => m._addVertexRaw(p));
  for (const t of triangles) {
    let order = t.slice();
    if (outwardCenter) {
      const a = points[order[0]], b = points[order[1]], c = points[order[2]], n = V.cross(V.sub(b, a), V.sub(c, a));
      if (V.dot(n, V.sub(a, outwardCenter)) < 0) order = [t[0], t[2], t[1]];
    }
    m._addFaceRaw([order.map(i => ids[i])]);
  }
  m.touch(); return m;
}
function triangle() { return rawMesh([[0, 0, 0], [1, 0, 0], [0, 1, 0]], [[0, 1, 2]]); }
function tetrahedron() {
  return rawMesh([[1, 1, 1], [-1, -1, 1], [-1, 1, -1], [1, -1, -1]],
    [[0, 1, 2], [0, 3, 1], [0, 2, 3], [1, 3, 2]], [0, 0, 0]);
}
function deCasteljau(points, t) {
  let row = points.map(p => p.slice());
  while (row.length > 1) row = row.slice(0, -1).map((p, i) => V.add(V.scale(p, 1 - t), V.scale(row[i + 1], t)));
  return row[0];
}
function patchAt(controls, u, v) {
  return deCasteljau([0, 1, 2, 3].map(j => deCasteljau(controls.slice(j * 4, j * 4 + 4), u)), v);
}
function attachMesh(doc, model) {
  const definition = doc.scene.addDefinition('Malla de prueba', 'group', model);
  const node = doc.scene.addNode([], { definitionId: definition.id });
  command(doc, 'context.enter', { node: node.id }); return { definition, node };
}

console.log('\nDédalo — mallas orgánicas (sin DOM ni render)\n');

test('elipsoide cerrado con número conocido de caras, aristas y vértices', () => {
  const m = O.ellipsoid({ segments: 16, rings: 8 }); valid(m);
  assert.equal(m.verts.size, 2 + 16 * 7); assert.equal(m.faces.size, 2 * 16 * 7);
  assert.equal(m.edges.size, m.faces.size * 3 / 2); assert.equal(m.verts.size - m.edges.size + m.faces.size, 2);
  assert.equal(boundary(m).length, 0); assert.ok(m.isClosed([...m.faces.keys()]));
});

test('elipsoide trasladado: bbox, normales exteriores y volumen con tolerancia de discretización', () => {
  const center = [1.2, -0.7, 2], radii = [0.3, 0.15, 0.12];
  const m = O.ellipsoid({ center, radii, segments: 32, rings: 16 }); valid(m); oriented(m, center);
  bbox(m, V.sub(center, radii), V.add(center, radii));
  const volume = signedVolume(m), analytic = 4 * Math.PI * radii.reduce((a, b) => a * b) / 3;
  assert.ok(volume > 0); assert.ok(Math.abs(volume / analytic - 1) < 0.02, 'volumen inscripto a menos del 2 %');
});

test('elipsoide rechaza radios, coordenadas y densidades inválidos sin crear grupos', () => {
  const doc = new D.Document(), before = state(doc);
  for (const params of [{ radii: [1, 0, 1] }, { radii: [-1, 1, 1] }, { center: [NaN, 0, 0] }, { segments: 7 }, { rings: 33 }]) {
    assert.equal(doc.execute('mesh.ellipsoid', params).ok, false); assert.equal(state(doc), before);
  }
});

test('paño Bézier abierto: contorno rectangular conservado y bulto de centro esperado', () => {
  const s = 4, origin = [2, -1, 0.3], width = 2, depth = 1, bulge = 0.4;
  const m = O.bezierPatch({ origin, width, depth, bulge, segments: s }); valid(m);
  assert.equal(m.verts.size, (s + 1) ** 2); assert.equal(m.faces.size, 2 * s * s); assert.equal(boundary(m).length, 4 * s);
  assert.equal(m.isClosed([...m.faces.keys()]), false);
  const points = [...m.verts.values()].map(v => v.p);
  vector(points[2 * (s + 1) + 2], [3, -0.5, 0.3 + bulge], 'altura central en metros');
  for (const e of boundary(m)) for (const id of [e.a, e.b]) near(m.P(id)[2], origin[2], 'contorno plano');
  assert.ok([...m.faces.values()].every(f => f.n[2] > 0), 'orientación hacia arriba');
});

test('paño plano sin bulto conserva área y extensión exactas', () => {
  const m = O.bezierPatch({ width: 2, depth: 3, bulge: 0, segments: 4 }); valid(m);
  bbox(m, [0, 0, 0], [2, 3, 0]); near([...m.faces.keys()].reduce((a, id) => a + m.faceArea(id), 0), 6, 'área');
});

test('paño acepta 16 controles libres y coincide con evaluación independiente de Casteljau', () => {
  const controls = [];
  for (let j = 0; j < 4; j++) for (let i = 0; i < 4; i++) controls.push([i / 3, j / 3, (i * i - j + i * j) / 20]);
  const s = 4, m = O.bezierPatch({ controls, segments: s }), points = [...m.verts.values()].map(v => v.p); valid(m);
  vector(points[0], controls[0]); vector(points[s], controls[3]); vector(points[s * (s + 1)], controls[12]); vector(points.at(-1), controls[15]);
  for (let j = 0; j <= s; j++) for (let i = 0; i <= s; i++) vector(points[j * (s + 1) + i], patchAt(controls, i / s, j / s), 'evaluación paramétrica');
});

test('paño rechaza cantidad incorrecta, controles no finitos y todos los controles coincidentes', () => {
  const doc = new D.Document(), before = state(doc);
  const invalid = [[], Array.from({ length: 15 }, () => [0, 0, 0]), Array.from({ length: 16 }, () => [0, 0, 0])];
  const badPoint = Array.from({ length: 16 }, (_, i) => [i % 4, Math.floor(i / 4), 0]); badPoint[7][2] = Infinity; invalid.push(badPoint);
  for (const controls of invalid) { assert.equal(doc.execute('mesh.patch', { controls }).ok, false); assert.equal(state(doc), before); }
});

test('Loop divide un triángulo en cuatro, con contorno fijo y puntos medios exactos', () => {
  const m = triangle(), before = clone(m.toJSON()), ids = [...m.verts.keys()], next = O.subdivide(m, 1, true); valid(next);
  assert.deepEqual(m.toJSON(), before, 'subdividir no muta el modelo fuente');
  assert.equal(next.faces.size, 4); assert.equal(next.verts.size, 6); assert.equal(boundary(next).length, 6);
  ids.forEach(id => { vector(next.P(id), m.P(id)); assert.equal(next.identities.get(id), m.identities.get(id)); });
  for (const p of [[0.5, 0, 0], [0.5, 0.5, 0], [0, 0.5, 0]]) assert.ok([...next.verts.values()].some(v => V.dist(v.p, p) < 1e-9), 'punto medio ' + p);
  assert.ok([...next.faces.values()].every(f => f.n[2] > 0));
});

test('Loop permite suavizar contorno con máscara 3/4 y 1/8 de PBRT', () => {
  const m = triangle(), ids = [...m.verts.keys()], next = O.subdivide(m, 1, false); valid(next);
  vector(next.P(ids[0]), [1 / 8, 1 / 8, 0]); vector(next.P(ids[1]), [3 / 4, 1 / 8, 0]); vector(next.P(ids[2]), [1 / 8, 3 / 4, 0]);
});

test('Loop mantiene las esquinas y las líneas del contorno de un paño tras dos niveles', () => {
  const m = O.bezierPatch({ width: 2, depth: 1, bulge: 0.3, segments: 2 });
  const boundaryIds = new Set(boundary(m).flatMap(e => [e.a, e.b])), next = O.subdivide(m, 2, true); valid(next);
  assert.equal(next.faces.size, m.faces.size * 16); assert.equal(boundary(next).length, boundary(m).length * 4);
  for (const id of boundaryIds) vector(next.P(id), m.P(id), 'vértice de borde original');
  for (const e of boundary(next)) for (const id of [e.a, e.b]) {
    const p = next.P(id); near(p[2], 0, 'borde no se levanta');
    assert.ok(Math.abs(p[0]) < 1e-9 || Math.abs(p[0] - 2) < 1e-9 || Math.abs(p[1]) < 1e-9 || Math.abs(p[1] - 1) < 1e-9);
  }
});

test('Loop tetraédrico usa beta=3/16, pesos de arista y conserva cierre y orientación', () => {
  const m = tetrahedron(), ids = [...m.verts.keys()], next = O.subdivide(m, 1, true); valid(next); oriented(next, [0, 0, 0]);
  assert.equal(next.faces.size, 16); assert.equal(next.verts.size, 10); assert.equal(boundary(next).length, 0);
  assert.ok(next.isClosed([...next.faces.keys()])); assert.ok(signedVolume(next) > 0);
  for (const id of ids) vector(next.P(id), V.scale(m.P(id), 1 / 4), 'máscara valencia tres');
  assert.ok([...next.verts.values()].some(v => V.dist(v.p, [0, 0, 0.5]) < 1e-9), 'máscara interior 3/8,3/8,1/8,1/8');
});

test('Loop con valencia cuatro usa beta=3/(8n), sin emplear máscara valencia tres', () => {
  const m = rawMesh([[0, 0, 1], [1, 0, 0], [0, 1, 0], [-1, 0, 0], [0, -1, 0], [0, 0, -1]],
    [[0, 1, 2], [0, 2, 3], [0, 3, 4], [0, 4, 1], [5, 2, 1], [5, 3, 2], [5, 4, 3], [5, 1, 4]], [0, 0, 0]);
  const id = [...m.verts.keys()][0], next = O.subdivide(m, 1, true); valid(next); oriented(next, [0, 0, 0]);
  vector(next.P(id), [0, 0, 5 / 8], 'máscara valencia cuatro'); assert.ok(next.isClosed([...next.faces.keys()]));
});

test('Loop conserva cierre, normales exteriores y Euler de un elipsoide', () => {
  const m = O.ellipsoid({ radii: [1, 0.7, 0.4], segments: 8, rings: 4 }), next = O.subdivide(m, 2, true); valid(next); oriented(next, [0, 0, 0]);
  assert.equal(next.faces.size, m.faces.size * 16); assert.equal(next.verts.size - next.edges.size + next.faces.size, 2);
  assert.equal(boundary(next).length, 0); assert.ok(next.isClosed([...next.faces.keys()]));
});

test('Loop rechaza aristas de tres caras y geometría suelta', () => {
  const nonManifold = rawMesh([[0, 0, 0], [1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1]], [[0, 1, 2], [1, 0, 3], [0, 1, 4]]);
  assert.throws(() => O.subdivide(nonManifold, 1), /caras|manifold/i);
  const loose = triangle(); loose._addVertexRaw([4, 4, 4]); assert.throws(() => O.subdivide(loose, 1), /sueltos/i);
});

test('Loop rechaza dos abanicos cerrados que solo comparten un vértice', () => {
  const m = rawMesh([[0, 0, 0], [1, 0, 0], [0, 1, 0], [0, 0, 1], [-1, 0, 0], [0, -1, 0], [0, 0, -1]],
    [[0, 2, 1], [0, 1, 3], [0, 3, 2], [1, 2, 3], [0, 4, 5], [0, 6, 4], [0, 5, 6], [4, 6, 5]]);
  assert.throws(() => O.subdivide(m, 1), /manifold|abanico|conectad/i);
});

test('Loop rechaza caras adyacentes orientadas en el mismo sentido de su arista común', () => {
  const m = rawMesh([[0, 0, 0], [1, 0, 0], [0, 1, 0], [0, -1, 0]], [[0, 1, 2], [0, 1, 3]]);
  const before = clone(m.toJSON());
  assert.throws(() => O.subdivide(m, 1), /orienta|coherente/i);
  assert.deepEqual(m.toJSON(), before, 'no intenta reparar ni mutar silenciosamente la fuente');
});

test('Loop conserva material de las caras hijas y UUID de vértices fuente', () => {
  const m = triangle(), id = m.newId(); m.materials.set(id, { id, name: 'Prototipo', color: '#aabbcc', opacity: 0.7 });
  for (const f of m.faces.values()) f.mat = id;
  const next = O.subdivide(m, 2, true); valid(next);
  assert.deepEqual(next.materials.get(id), m.materials.get(id)); assert.equal(next.identities.get(id), m.identities.get(id));
  for (const [vid] of m.verts) assert.equal(next.identities.get(vid), m.identities.get(vid));
  assert.ok([...next.faces.values()].every(f => f.mat === id));
});

test('subdivisión rechazada conserva escena, revisión e historial del documento', () => {
  const doc = new D.Document(), result = command(doc, 'mesh.ellipsoid', { segments: 8, rings: 4 }), before = state(doc);
  assert.equal(doc.execute('mesh.subdivide', { nodes: [result.node], levels: 3 }).ok, false); assert.equal(state(doc), before);
});

test('deformación suave actúa localmente y conserva UUID y posición exterior al radio', () => {
  const doc = new D.Document(), result = command(doc, 'mesh.ellipsoid', { radii: [1, 1, 1], segments: 16, rings: 8 });
  command(doc, 'context.enter', { node: result.node });
  const source = doc.currentDefinition().model, old = new Map([...source.verts].map(([id, v]) => [id, { p: v.p.slice(), uuid: source.identities.get(id) }]));
  const center = [0, 0, 1], radius = 0.8, shift = [0.04, -0.02, 0.1];
  const changed = command(doc, 'mesh.deform', { center, radius, vector: shift }), m = doc.currentDefinition().model; valid(m);
  assert.ok(changed.vertices.length > 1 && changed.vertices.length < old.size); assert.equal(m.verts.size, old.size);
  for (const [id, before] of old) {
    assert.equal(m.identities.get(id), before.uuid, 'UUID persistente');
    const t = Math.max(0, 1 - V.dist(before.p, center) / radius), weight = t * t * (3 - 2 * t);
    vector(m.P(id), V.add(before.p, V.scale(shift, weight)), 'caída cúbica local');
    if (t === 0) assert.deepEqual(m.P(id), before.p, 'exterior al radio intacto');
  }
  assert.ok(m.isClosed([...m.faces.keys()]));
});

test('deformación inválida, lejana o demasiado grande revierte sin alterar selección ni historial', () => {
  const doc = new D.Document(), result = command(doc, 'mesh.patch', { segments: 2 }); command(doc, 'context.enter', { node: result.node });
  doc.select({ faces: [doc.model.faces.keys().next().value] }); const before = state(doc);
  for (const params of [{ center: [0, 0, 0], radius: 0.1, vector: [1, 0, 0] }, { center: [99, 99, 99], radius: 0.1, vector: [0, 0, 0.01] }, { center: [0, 0, 0], radius: 1, vector: [NaN, 0, 0] }]) {
    assert.equal(doc.execute('mesh.deform', params).ok, false); assert.equal(state(doc), before);
  }
});

test('deformación que colapsa un triángulo se rechaza y restaura el documento completo', () => {
  const doc = new D.Document(); attachMesh(doc, triangle()); const before = state(doc);
  const result = doc.execute('mesh.deform', { center: [0, 0, 0], radius: 0.5, vector: [1, 0, 0] });
  assert.equal(result.ok, false, 'un vértice no puede colapsar sobre su vecino'); assert.equal(state(doc), before);
});

test('deshacer y rehacer subdivisión y deformación recupera exactamente la escena', () => {
  const doc = new D.Document(), result = command(doc, 'mesh.ellipsoid', { segments: 8, rings: 4 }), before = clone(doc.scene.toJSON());
  command(doc, 'mesh.subdivide', { nodes: [result.node], levels: 1 }); const subdivided = clone(doc.scene.toJSON());
  assert.ok(doc.undo()); assert.deepEqual(doc.scene.toJSON(), before); assert.ok(doc.redo()); assert.deepEqual(doc.scene.toJSON(), subdivided);
  command(doc, 'context.enter', { node: result.node });
  const m = doc.currentDefinition().model, top = [...m.verts.values()].reduce((a, b) => a.p[2] > b.p[2] ? a : b).p.slice();
  const beforeDeform = clone(doc.scene.toJSON()); command(doc, 'mesh.deform', { center: top, radius: 0.2, vector: [0, 0, 0.02] });
  const deformed = clone(doc.scene.toJSON()); assert.ok(doc.undo()); assert.deepEqual(doc.scene.toJSON(), beforeDeform); assert.ok(doc.redo()); assert.deepEqual(doc.scene.toJSON(), deformed);
});

test('malla componente compartida, hacer único y guardado/reapertura conservan la semántica', () => {
  const doc = new D.Document(), group = command(doc, 'mesh.ellipsoid', { radii: [0.4, 0.25, 0.2], segments: 8, rings: 4 });
  const original = command(doc, 'component.create', { nodes: [group.node], name: 'Retrovisor' });
  const instance = command(doc, 'component.instantiate', { definitionId: original.definitionId, matrix: D.SceneMath.translation([2, 0, 0]) });
  assert.equal(doc.scene.node([], original.node).definitionId, doc.scene.node([], instance.node).definitionId);
  const faceCount = def(doc, original).model.faces.size;
  command(doc, 'mesh.subdivide', { nodes: [original.node], levels: 1 });
  assert.equal(def(doc, original).model.faces.size, faceCount * 4); assert.equal(doc.worldModel().faces.size, faceCount * 8, 'ambas instancias reflejan subdivisión');
  const unique = command(doc, 'component.makeUnique', { nodes: [instance.node] }); assert.notEqual(unique.definitionId, original.definitionId);
  const sharedBefore = clone(def(doc, original).model.toJSON());
  command(doc, 'context.enter', { node: instance.node });
  const m = doc.currentDefinition().model, top = [...m.verts.values()].reduce((a, b) => a.p[2] > b.p[2] ? a : b).p.slice();
  command(doc, 'mesh.deform', { center: top, radius: 0.25, vector: [0, 0, 0.02] }); command(doc, 'context.exit');
  assert.deepEqual(def(doc, original).model.toJSON(), sharedBefore, 'hacer único protege la definición anterior');
  assert.notDeepEqual(def(doc, unique).model.toJSON(), sharedBefore);
  const file = clone(doc.fileJSON()), reopened = new D.Document(); reopened.loadJSON(file);
  assert.deepEqual(reopened.scene.toJSON(), doc.scene.toJSON()); assert.equal(reopened.projectId, doc.projectId);
  assert.equal(reopened.scene.node([], original.node).definitionId, original.definitionId); assert.equal(reopened.scene.node([], instance.node).definitionId, unique.definitionId);
  valid(def(reopened, original).model); valid(def(reopened, unique).model); assert.deepEqual(reopened.scene.validate(), []);
});

console.log('\n' + passed + ' correctas, ' + failed + ' fallidas');
if (failed) { console.error('Fallan: ' + failures.join(' · ')); process.exitCode = 1; }
