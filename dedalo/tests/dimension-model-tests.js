/*
 * Integración CPU de cotas alineadas antiguas y cotas proyectadas con offsetB.
 * Sin DOM, navegador ni renderer. Ejecutar: node tests/dimension-model-tests.js
 * Contrato: A2=a+off; B2=b+(offB||off). offB ausente conserva distancia a-b.
 */
'use strict';
const assert = require('node:assert/strict');
const path = require('node:path');
for (const file of ['geom', 'model', 'document', 'scene', 'hierarchy']) require(path.join(__dirname, '..', 'app', 'js', 'core', file + '.js'));
const D = globalThis.DEDALO, V = D.V;
let passed = 0, failed = 0;
const failures = [];
function test(name, run) {
  try { run(); passed++; console.log('  ok   ' + name); }
  catch (error) { failed++; failures.push(name); console.error('  FALLA ' + name + '\n        ' + String(error.stack || error).split('\n').slice(0, 5).join('\n        ')); }
}
function near(actual, expected, message, tolerance) {
  assert.ok(Number.isFinite(actual) && Math.abs(actual - expected) <= (tolerance || 1e-9), (message || 'valor') + ': ' + actual + ' ≠ ' + expected);
}
function vector(actual, expected, message) { assert.equal(actual.length, expected.length); actual.forEach((n, i) => near(n, expected[i], message)); }
function clone(value) { return JSON.parse(JSON.stringify(value)); }
function command(doc, name, params) {
  const result = doc.execute(name, params || {}); assert.ok(result && result.ok, name + ': ' + (result && result.error)); return result;
}
function local(doc) { return doc.currentDefinition().model; }
function only(model) { const a = [...model.annots.values()]; assert.equal(a.length, 1, 'una sola cota'); return a[0]; }
function line(a) { return [V.add(a.a, a.off || [0, 0, 0]), V.add(a.b, a.offB || a.off || [0, 0, 0])]; }
function length(a) { const [p, q] = line(a); return Math.hypot(...p.map((n, i) => n - q[i])); }
function state(doc) {
  return JSON.stringify({ scene: doc.scene.toJSON(), path: doc.editPath, selection: doc.selectionItems(),
    undo: doc.undoStack, redo: doc.redoStack, dirty: doc.dirty, version: doc.projectVersion, audit: doc.audit, projectId: doc.projectId });
}
function create(doc, axis) {
  const params = { a: [0, 0, 0], b: [3, 4, 12] };
  if (axis === 'x') Object.assign(params, { offset: [0, 7, 0], offsetB: [0, 3, -12] });
  else if (axis === 'y') Object.assign(params, { offset: [-2, 0, 0], offsetB: [-5, 0, -12] });
  else if (axis === 'z') Object.assign(params, { offset: [-2, 0, 0], offsetB: [-5, -4, 0] });
  else params.offset = [0, 2, 0];
  const r = command(doc, 'dim.add', params); return { result: r, params, annotation: local(doc).annots.get(r.id) };
}
function grouped(doc, axis) {
  const fixture = create(doc, axis), uuid = local(doc).identities.get(fixture.result.id);
  const group = command(doc, 'group.create', { annots: [fixture.result.id], name: 'Cota agrupada' });
  return { ...fixture, group, uuid };
}
function transformed(a, point, direction) {
  const out = clone(a); out.a = point(a.a); out.b = point(a.b); out.off = direction(a.off || [0, 0, 0]);
  if (a.offB !== undefined) out.offB = direction(a.offB); return out;
}
function assertDim(actual, expected) {
  assert.equal(actual.kind, 'dim'); vector(actual.a, expected.a, 'ancla A'); vector(actual.b, expected.b, 'ancla B'); vector(actual.off, expected.off, 'vector A');
  if (expected.offB !== undefined) vector(actual.offB, expected.offB, 'vector B'); else assert.equal(actual.offB, undefined);
  line(actual).forEach((p, i) => vector(p, line(expected)[i], 'extremo de línea')); near(length(actual), length(expected), 'medida proyectada');
}
const rotateZ = p => [-p[1], p[0], p[2]], scale = p => [2 * p[0], 0.5 * p[1], 3 * p[2]];

console.log('\nDédalo — cotas proyectadas e integración del documento (sin DOM)\n');

test('cota alineada anterior sin offB conserva longitud espacial y offsets iguales', () => {
  const doc = new D.Document(), { annotation } = create(doc); assert.equal(annotation.offB, undefined);
  vector(line(annotation)[0], [0, 2, 0]); vector(line(annotation)[1], [3, 6, 12]); near(length(annotation), 13);
  assert.deepEqual(doc.scene.validate(), []);
});

for (const [axis, expected, endpoints] of [
  ['x', 3, [[0, 7, 0], [3, 7, 0]]], ['y', 4, [[-2, 0, 0], [-2, 4, 0]]], ['z', 12, [[-2, 0, 0], [-2, 0, 12]]]
]) test('cota proyectada ' + axis.toUpperCase() + ' mide la línea de cota sin tomar la diagonal 13', () => {
  const doc = new D.Document(), { annotation, params } = create(doc, axis);
  assert.deepEqual(annotation.offB, params.offsetB); line(annotation).forEach((p, i) => vector(p, endpoints[i])); near(length(annotation), expected);
  assert.deepEqual(doc.scene.validate(), []);
});

test('modelo nativo conserva offB y UUID al serializar y cargar', () => {
  const doc = new D.Document(), { result, annotation } = create(doc, 'x'), m = local(doc), input = clone(m.toJSON()), next = D.Model.fromJSON(input);
  assertDim(next.annots.get(result.id), annotation); assert.equal(next.identities.get(result.id), m.identities.get(result.id));
  assert.deepEqual(next.toJSON(), input);
});

test('archivo antiguo de versión 1 sin offB se migra sin cambiar la cota', () => {
  const m = new D.Model(), id = m.newId(); m.annots.set(id, { id, kind: 'dim', a: [1, 2, 3], b: [4, 6, 15], off: [0, 2, 0] });
  const before = clone(m.annots.get(id)), doc = new D.Document(); doc.loadJSON({ format: 'dedalo', version: 1, model: clone(m.toJSON()) });
  assertDim(only(local(doc)), before); near(length(only(local(doc))), 13); assert.equal(only(local(doc)).offB, undefined);
});

test('archivo de proyecto versión 2 guarda y reabre cotas proyectadas sin perder identidad', () => {
  const doc = new D.Document(), { result, annotation } = create(doc, 'z'), uuid = local(doc).identities.get(result.id), file = clone(doc.fileJSON());
  const reopened = new D.Document(); reopened.loadJSON(file); assertDim(only(local(reopened)), annotation);
  assert.equal(local(reopened).identities.get(result.id), uuid); assert.equal(reopened.projectId, doc.projectId);
  assert.deepEqual(reopened.scene.toJSON(), doc.scene.toJSON());
});

test('grupo trasladado mueve anclas y conserva ambos offsets como vectores', () => {
  const doc = new D.Document(), f = grouped(doc, 'x'), base = clone(f.annotation), v = [10, -5, 2];
  command(doc, 'entities.move', { nodes: [f.group.node], vector: v });
  const actual = only(doc.worldModel()), expected = transformed(base, p => V.add(p, v), p => p.slice()); assertDim(actual, expected); near(length(actual), 3);
});

test('grupo rotado transforma offB y conserva la medida de la cota', () => {
  const doc = new D.Document(), f = grouped(doc, 'x');
  command(doc, 'entities.rotate', { nodes: [f.group.node], center: [0, 0, 0], axis: [0, 0, 1], angle: 90 });
  const actual = only(doc.worldModel()); assertDim(actual, transformed(f.annotation, rotateZ, rotateZ)); near(length(actual), 3);
});

test('grupo escalado no uniforme transforma cada extremo de la línea y mide 6', () => {
  const doc = new D.Document(), f = grouped(doc, 'x');
  command(doc, 'entities.scale', { nodes: [f.group.node], origin: [0, 0, 0], factors: [2, 0.5, 3] });
  const actual = only(doc.worldModel()); assertDim(actual, transformed(f.annotation, scale, scale)); near(length(actual), 6);
});

test('explotar grupo con traslación, rotación y escala conserva línea y UUID', () => {
  const doc = new D.Document(), f = grouped(doc, 'y');
  command(doc, 'entities.move', { nodes: [f.group.node], vector: [3, -1, 2] });
  command(doc, 'entities.rotate', { nodes: [f.group.node], center: [0, 0, 0], axis: [0, 0, 1], angle: 90 });
  command(doc, 'entities.scale', { nodes: [f.group.node], origin: [0, 0, 0], factors: [2, 0.5, 3] });
  const expected = clone(only(doc.worldModel())); command(doc, 'group.explode', { nodes: [f.group.node] });
  const actual = only(local(doc)); assertDim(actual, expected); assert.equal(local(doc).identities.get(actual.id), f.uuid);
});

test('jerarquía anidada proyecta y conserva offB al guardar y reabrir', () => {
  const doc = new D.Document(), f = grouped(doc, 'z'), outer = command(doc, 'group.create', { nodes: [f.group.node], name: 'Contenedor' });
  command(doc, 'entities.rotate', { nodes: [outer.node], center: [0, 0, 0], axis: [0, 0, 1], angle: 90 });
  command(doc, 'context.enter', { node: outer.node }); command(doc, 'entities.scale', { nodes: [f.group.node], origin: [0, 0, 0], factors: [2, 0.5, 3] }); command(doc, 'context.exit');
  const expected = only(doc.worldModel()), reopened = new D.Document(); reopened.loadJSON(clone(doc.fileJSON()));
  assertDim(only(reopened.worldModel()), expected); near(length(only(reopened.worldModel())), 36);
});

test('cota creada dentro de un grupo se interpreta en coordenadas locales y sale transformada', () => {
  const doc = new D.Document(), original = create(doc), group = command(doc, 'group.create', { annots: [original.result.id] });
  command(doc, 'entities.move', { nodes: [group.node], vector: [8, 2, 0] }); command(doc, 'context.enter', { node: group.node });
  command(doc, 'entities.erase', { annots: [original.result.id] }); const f = create(doc, 'x');
  near(length(f.annotation), 3); command(doc, 'context.exit');
  assertDim(only(doc.worldModel()), transformed(f.annotation, p => V.add(p, [8, 2, 0]), p => p.slice()));
});

test('cota suelta se mueve sin trasladar los vectores off y offB', () => {
  const doc = new D.Document(), f = create(doc, 'x'), before = clone(f.annotation);
  command(doc, 'entities.move', { annots: [f.result.id], vector: [2, 3, 4] });
  assertDim(only(local(doc)), transformed(before, p => V.add(p, [2, 3, 4]), p => p.slice()));
});

test('cota suelta rota ambas anclas y offsets alrededor del centro', () => {
  const doc = new D.Document(), f = create(doc, 'x'), before = clone(f.annotation);
  command(doc, 'entities.rotate', { annots: [f.result.id], center: [0, 0, 0], axis: [0, 0, 1], angle: 90 });
  assertDim(only(local(doc)), transformed(before, rotateZ, rotateZ));
});

test('cota suelta escala offsets y anclas con factores no uniformes', () => {
  const doc = new D.Document(), f = create(doc, 'x'), before = clone(f.annotation);
  command(doc, 'entities.scale', { annots: [f.result.id], origin: [0, 0, 0], factors: [2, 0.5, 3] });
  assertDim(only(local(doc)), transformed(before, scale, scale)); near(length(only(local(doc))), 6);
});

test('copiar cota con mover conserva original y crea nuevas identidades y offsets', () => {
  const doc = new D.Document(), f = create(doc, 'y'), before = clone(f.annotation), originalUUID = local(doc).identities.get(f.result.id);
  command(doc, 'entities.move', { annots: [f.result.id], vector: [2, 0, 0], copy: true, copies: 2 });
  const m = local(doc), copies = [...m.annots.values()].filter(a => a.id !== f.result.id); assert.equal(copies.length, 2);
  assertDim(m.annots.get(f.result.id), before);
  for (let i = 0; i < 2; i++) {
    assertDim(copies[i], transformed(before, p => V.add(p, [2 * (i + 1), 0, 0]), p => p.slice()));
    assert.notEqual(m.identities.get(copies[i].id), originalUUID);
  }
  assert.notEqual(m.identities.get(copies[0].id), m.identities.get(copies[1].id));
});

test('copiar cota con rotar no cambia original y rota ambas líneas de referencia', () => {
  const doc = new D.Document(), f = create(doc, 'x'), before = clone(f.annotation);
  command(doc, 'entities.rotate', { annots: [f.result.id], center: [0, 0, 0], axis: [0, 0, 1], angle: 90, copy: true });
  const m = local(doc), copy = [...m.annots.values()].find(a => a.id !== f.result.id); assert.ok(copy);
  assertDim(m.annots.get(f.result.id), before); assertDim(copy, transformed(before, rotateZ, rotateZ));
});

test('crear y transformar una cota admite deshacer/rehacer sin perder offB', () => {
  const doc = new D.Document(), baseline = clone(doc.scene.toJSON()), f = create(doc, 'x'), created = clone(doc.scene.toJSON());
  assert.ok(doc.undo()); assert.deepEqual(doc.scene.toJSON(), baseline); assert.ok(doc.redo()); assert.deepEqual(doc.scene.toJSON(), created);
  command(doc, 'entities.rotate', { annots: [f.result.id], center: [0, 0, 0], axis: [0, 0, 1], angle: 90 }); const rotated = clone(doc.scene.toJSON());
  assert.ok(doc.undo()); assert.deepEqual(doc.scene.toJSON(), created); assert.ok(doc.redo()); assert.deepEqual(doc.scene.toJSON(), rotated);
});

test('API rechaza puntos iguales, offsets mal formados/no finitos y línea proyectada nula', () => {
  const doc = new D.Document(); create(doc, 'x'); const before = state(doc);
  const invalid = [
    { a: [0, 0, 0], b: [0, 0, 0] },
    { a: [0, 0, 0], b: [1, 0, 0], offset: [0, 1] },
    { a: [0, 0, 0], b: [1, 0, 0], offset: [0, NaN, 0] },
    { a: [0, 0, 0], b: [1, 0, 0], offsetB: [0, 1] },
    { a: [0, 0, 0], b: [1, 0, 0], offsetB: [0, Infinity, 0] },
    { a: [0, 0, 0], b: [1, 0, 0], offsetB: '0,1,0' },
    { a: [0, 0, 0], b: [3, 4, 12], offset: [0, 0, 0], offsetB: [-3, -4, -12] }
  ];
  for (const p of invalid) { const result = doc.execute('dim.add', p); assert.equal(result.ok, false, JSON.stringify(p)); assert.equal(state(doc), before, 'rechazo atómico'); }
});

test('carga con offB corrupto se rechaza sin sustituir documento, selección ni historial', () => {
  const doc = new D.Document(), f = create(doc, 'x'); doc.select({ annots: [f.result.id] });
  const before = state(doc), candidate = clone(doc.fileJSON()), root = candidate.scene.definitions.find(d => d.id === candidate.scene.rootId);
  root.model.annots[0].offB = [0, 1]; assert.throws(() => doc.loadJSON(candidate), /offB|anotaci|cota/i); assert.equal(state(doc), before);
});

test('validación en memoria detecta offB no finito antes de serializarlo como null', () => {
  const doc = new D.Document(); create(doc, 'x'); only(local(doc)).offB[0] = NaN;
  assert.ok(doc.scene.validate().length > 0, 'no se debe normalizar NaN a null y aceptar el documento');
});

test('API rechaza desbordamiento al sumar ancla y offset aunque cada entrada sea finita', () => {
  const doc = new D.Document(); create(doc, 'x'); const before = state(doc);
  for (const p of [
    { a: [1e308, 0, 0], b: [0, 1, 0], offset: [1e308, 0, 0] },
    { a: [0, 0, 0], b: [1e308, 1, 0], offset: [0, 0, 0], offsetB: [1e308, 0, 0] }
  ]) { assert.equal(doc.execute('dim.add', p).ok, false); assert.equal(state(doc), before); }
});

test('carga rechaza extremos sumados desbordados sin sustituir el proyecto abierto', () => {
  const doc = new D.Document(), f = create(doc, 'x'); doc.select({ annots: [f.result.id] }); const before = state(doc);
  const candidate = clone(doc.fileJSON()), root = candidate.scene.definitions.find(d => d.id === candidate.scene.rootId);
  Object.assign(root.model.annots[0], { a: [1e308, 0, 0], off: [1e308, 0, 0] });
  assert.throws(() => doc.loadJSON(candidate), /cota|intervalo|finit/i); assert.equal(state(doc), before);
});

test('dim.update conserva ID, UUID y texto personalizado al recolocar y cambiar proyección', () => {
  const doc = new D.Document(), f = create(doc, 'x'), id = f.result.id, uuid = local(doc).identities.get(id);
  command(doc, 'annot.edit', { id, text: 'Luz útil' });
  const params = { id, a: [1, 2, 3], b: [4, 6, 15], offset: [-2, 0, 0], offsetB: [-5, 0, -12] };
  const result = command(doc, 'dim.update', params), a = local(doc).annots.get(id);
  assert.equal(result.id, id); assert.equal(a.id, id); assert.equal(a.text, 'Luz útil'); assert.equal(local(doc).identities.get(id), uuid);
  assertDim(a, { kind: 'dim', a: params.a, b: params.b, off: params.offset, offB: params.offsetB }); near(length(a), 4);
  assert.equal(local(doc).annots.size, 1, 'recolocar no crea una cota duplicada');
});

test('dim.update permite volver a alineada retirando offB y mantiene deshacer/rehacer exactos', () => {
  const doc = new D.Document(), f = create(doc, 'x'), before = clone(doc.scene.toJSON());
  command(doc, 'dim.update', { id: f.result.id, a: [0, 0, 0], b: [3, 4, 12], offset: [0, 2, 0] });
  const after = clone(doc.scene.toJSON()); assert.equal(only(local(doc)).offB, undefined); near(length(only(local(doc))), 13);
  assert.ok(doc.undo()); assert.deepEqual(doc.scene.toJSON(), before); assert.ok(doc.redo()); assert.deepEqual(doc.scene.toJSON(), after);
});

test('dim.update inválido conserva valores, selección, revisión e historial', () => {
  const doc = new D.Document(), f = create(doc, 'x'); command(doc, 'annot.edit', { id: f.result.id, text: 'No perder' }); doc.select({ annots: [f.result.id] });
  const before = state(doc);
  for (const p of [
    { id: f.result.id, a: [0, 0, 0], b: [0, 0, 0] },
    { id: f.result.id, a: [0, 0, 0], b: [1, 0, 0], offsetB: [NaN, 0, 0] },
    { id: f.result.id, a: [1e308, 0, 0], b: [0, 1, 0], offset: [1e308, 0, 0] },
    { id: 9999, a: [0, 0, 0], b: [1, 0, 0] }
  ]) { assert.equal(doc.execute('dim.update', p).ok, false); assert.equal(state(doc), before, 'cancelación atómica'); }
});

test('dim.update rechaza proxy de grupo cerrado y permite editar la cota dentro de su contexto', () => {
  const doc = new D.Document(), f = grouped(doc, 'x'), proxy = only(doc.model).id; assert.ok(proxy < 0, 'ID de vista de grupo cerrado');
  const before = state(doc), params = { a: [0, 0, 0], b: [3, 4, 12], offset: [-2, 0, 0], offsetB: [-5, 0, -12] };
  assert.equal(doc.execute('dim.update', { id: proxy, ...params }).ok, false); assert.equal(state(doc), before);
  command(doc, 'context.enter', { node: f.group.node });
  command(doc, 'dim.update', { id: only(local(doc)).id, ...params }); near(length(only(local(doc))), 4);
  command(doc, 'context.exit'); near(length(only(doc.worldModel())), 4); assert.deepEqual(doc.scene.validate(), []);
});

console.log('\n' + passed + ' correctas, ' + failed + ' fallidas');
if (failed) { console.error('Fallan: ' + failures.join(' · ')); process.exitCode = 1; }
