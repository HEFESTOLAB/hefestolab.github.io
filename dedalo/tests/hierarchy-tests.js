/*
 * Grupos y componentes reales: pruebas de comportamiento del documento.
 * Node puro: no abre una ventana, no inicia servidores y no renderiza.
 * Ejecutar: node tests/hierarchy-tests.js
 */
'use strict';
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const path = require('node:path');
const APP = path.join(__dirname, '..', 'app', 'js');
for (const file of ['geom', 'model', 'document', 'scene', 'hierarchy']) require(path.join(APP, 'core', file + '.js'));
const D = globalThis.DEDALO;
let passed = 0;
let failed = 0;
const failures = [];

function test(name, fn) {
  try { fn(); passed++; console.log('  ok   ' + name); }
  catch (error) {
    failed++; failures.push(name);
    console.error('  FALLA ' + name + '\n        ' + String(error.stack || error).split('\n').slice(0, 5).join('\n        '));
  }
}
function near(actual, expected, message) {
  assert.ok(Number.isFinite(actual) && Math.abs(actual - expected) < 1e-6, (message || 'valor geométrico') + ': ' + actual + ' ≠ ' + expected);
}
function vector(actual, expected, message) { assert.equal(actual.length, expected.length); actual.forEach((value, i) => near(value, expected[i], message)); }
function clone(value) { return JSON.parse(JSON.stringify(value)); }
function command(doc, name, params) {
  const result = doc.execute(name, params || {});
  assert.ok(result && result.ok, name + ': ' + (result && result.error || JSON.stringify(result)));
  return result;
}
function nodeId(result) { const node = result.node; const id = node && typeof node === 'object' ? node.id : node; assert.ok(id, 'la operación devuelve el identificador del nodo'); return id; }
function nodes(doc, editPath) {
  const value = doc.scene.current(editPath || []).nodes;
  return Array.isArray(value) ? value : value instanceof Map ? [...value.values()] : Object.values(value || {});
}
function world(doc) { const m = doc.scene.project([]).model; assert.ok(m instanceof D.Model); assert.deepEqual(m.validate(), [], 'modelo mundial coherente'); return m; }
function bbox(model, min, max) { const box = model.bbox(); assert.ok(box, 'hay geometría'); vector(box.min, min, 'mínimo'); vector(box.max, max, 'máximo'); }
function points(model) { return [...model.verts.values()].map(v => v.p.map(n => Math.round(n * 1e6) / 1e6).join(',')).sort(); }
function geometry(doc) {
  const m = world(doc);
  return { points: points(m), faces: m.faces.size, edges: m.edges.size, area: [...m.faces.keys()].reduce((sum, id) => sum + m.faceArea(id), 0), volume: m.volume([...m.faces.keys()]) };
}
function loose(doc) { return doc.scene.current(doc.editPath).model; }
function stableFile(doc) {
  const json = clone(doc.fileJSON());
  // Audit and projectVersion record the undo/load action itself. Projected IDs are
  // transient view metadata; authoritative local UUIDs belong to scene models.
  delete json.saved; delete json.audit; delete json.projectVersion;
  if (json.model) delete json.model.identities;
  return json;
}
function rectangle(doc, origin, width, height) {
  const before = new Set(doc.model.faces.keys());
  command(doc, 'draw.rectangle', { origin: origin || [0, 0, 0], width: width || 2, height: height || 1 });
  return [...doc.model.faces.keys()].filter(id => !before.has(id));
}
function box(doc, width, depth, height) {
  const faces = rectangle(doc, [0, 0, 0], width || 2, depth || 1);
  command(doc, 'face.pushPull', { face: faces[0], distance: height || 1 });
  return [...doc.model.faces.keys()];
}
function groupBox(doc) {
  box(doc, 2, 1, 1);
  return nodeId(command(doc, 'group.create', { name: 'Caja', faces: [...doc.model.faces.keys()] }));
}
function componentBox(doc) {
  box(doc, 2, 1, 1);
  return command(doc, 'component.create', { name: 'Módulo', faces: [...doc.model.faces.keys()] });
}
function translate(x, y, z) { return [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x || 0, y || 0, z || 0, 1]; }
function topFace(model) { const found = [...model.faces.values()].find(f => f.n[2] > 0.999); assert.ok(found, 'cara superior encontrada'); return found.id; }
function enter(doc, id) { command(doc, 'context.enter', { node: id }); }
function exit(doc) { command(doc, 'context.exit'); }

console.log('\nDédalo — grupos y componentes reales (sin DOM)\n');

test('agrupar aísla la geometría y conserva una cara coincidente del exterior', () => {
  const doc = new D.Document();
  const face = rectangle(doc, [0, 0, 0], 2, 1)[0];
  doc.select({ faces: [face] });
  const group = nodeId(command(doc, 'group.create', { name: 'Aislado' }));
  assert.equal(loose(doc).faces.size, 0, 'la cara sale del contexto exterior');
  rectangle(doc, [0, 0, 0], 2, 1);
  command(doc, 'entities.move', { nodes: [group], vector: [3, 0, 0] });
  bbox(loose(doc), [0, 0, 0], [2, 1, 0]);
  assert.equal(loose(doc).faces.size, 1, 'la cara exterior sigue intacta');
  enter(doc, group);
  assert.equal(doc.model.faces.size, 1);
  bbox(doc.model, [0, 0, 0], [2, 1, 0]);
  exit(doc);
  bbox(world(doc), [0, 0, 0], [5, 1, 0]);
  assert.equal(world(doc).faces.size, 2);
});

test('una jerarquía anidada edita únicamente el contexto abierto', () => {
  const doc = new D.Document();
  const inner = groupBox(doc);
  const outer = nodeId(command(doc, 'group.create', { name: 'Contenedor', nodes: [inner] }));
  enter(doc, outer); enter(doc, inner);
  assert.equal(doc.editPath.length, 2);
  command(doc, 'face.pushPull', { face: topFace(doc.model), distance: 2 });
  near(doc.model.volume([...doc.model.faces.keys()]), 6);
  exit(doc);
  assert.equal(loose(doc).faces.size, 0, 'el contenedor tiene un hijo, no geometría soldada');
  exit(doc);
  assert.equal(doc.editPath.length, 0);
  bbox(world(doc), [0, 0, 0], [2, 1, 3]);
  assert.equal(loose(doc).faces.size, 0);
});

test('las caras proyectadas de un grupo cerrado no se editan desde el exterior', () => {
  const doc = new D.Document();
  const id = groupBox(doc);
  const before = stableFile(doc);
  const projectedFace = topFace(doc.model);
  const rejected = doc.execute('face.pushPull', { face: projectedFace, distance: 4 });
  assert.equal(rejected.ok, false, 'se requiere abrir el contexto');
  assert.deepEqual(stableFile(doc), before);
  enter(doc, id);
  command(doc, 'face.pushPull', { face: topFace(doc.model), distance: 4 });
  exit(doc);
  bbox(world(doc), [0, 0, 0], [2, 1, 5]);
});

test('consultar escena y jerarquía informa de los nodos sin mutar el documento', () => {
  const doc = new D.Document();
  const inner = groupBox(doc);
  const outer = nodeId(command(doc, 'group.create', { name: 'Exterior', nodes: [inner] }));
  const before = stableFile(doc), history = doc.undoStack.length;
  const read = command(doc, 'scene.get');
  assert.deepEqual(read.scene, before.scene);
  const tree = command(doc, 'scene.tree');
  assert.equal(tree.rootId, doc.scene.rootId);
  assert.ok(tree.definitions.some(def => def.nodes.some(node => node.id === inner)));
  assert.ok(tree.definitions.some(def => def.nodes.some(node => node.id === outer)));
  assert.deepEqual(stableFile(doc), before);
  assert.equal(doc.undoStack.length, history);
});

test('dos instancias comparten edición y conservan su colocación propia', () => {
  const doc = new D.Document();
  const first = componentBox(doc);
  const firstId = nodeId(first);
  const second = command(doc, 'component.instantiate', { definitionId: first.definitionId, matrix: translate(10, 0, 0), name: 'Repetición' });
  assert.equal(second.definitionId, first.definitionId);
  assert.notEqual(nodeId(second), firstId);
  enter(doc, firstId);
  command(doc, 'face.pushPull', { face: topFace(doc.model), distance: 2 });
  exit(doc);
  const m = world(doc);
  bbox(m, [0, 0, 0], [12, 1, 3]);
  assert.equal(m.faces.size, 12);
  near(m.volume([...m.faces.keys()]), 12, 'volumen de las dos instancias editadas');
});

test('crear componente a partir de un grupo conserva su contenido y posición', () => {
  const doc = new D.Document();
  const group = groupBox(doc);
  command(doc, 'entities.move', { nodes: [group], vector: [4, 3, 0] });
  const before = geometry(doc);
  const component = command(doc, 'component.create', { name: 'Desde grupo', nodes: [group] });
  assert.ok(component.definitionId);
  assert.deepEqual(geometry(doc), before);
  command(doc, 'component.instantiate', { definitionId: component.definitionId, matrix: translate(0, 10, 0) });
  assert.equal(world(doc).faces.size, 12);
});

test('hacer único independiza la definición de una sola instancia', () => {
  const doc = new D.Document();
  const first = componentBox(doc);
  const second = command(doc, 'component.instantiate', { definitionId: first.definitionId, matrix: translate(10, 0, 0) });
  const secondId = nodeId(second);
  const unique = command(doc, 'component.makeUnique', { nodes: [secondId] });
  assert.notEqual(unique.definitionId, first.definitionId);
  enter(doc, secondId);
  command(doc, 'face.pushPull', { face: topFace(doc.model), distance: 3 });
  exit(doc);
  enter(doc, nodeId(first));
  bbox(doc.model, [0, 0, 0], [2, 1, 1]);
  exit(doc);
  const m = world(doc);
  bbox(m, [0, 0, 0], [12, 1, 4]);
  near(m.volume([...m.faces.keys()]), 10, 'una caja original y otra única de altura 4');
});

test('mover, rotar, escalar y reflejar nodos transforman su geometría mundial', () => {
  const doc = new D.Document();
  const id = groupBox(doc);
  command(doc, 'entities.move', { nodes: [id], vector: [1, 2, 3] });
  bbox(world(doc), [1, 2, 3], [3, 3, 4]);
  command(doc, 'entities.rotate', { nodes: [id], center: [0, 0, 0], axis: [0, 0, 1], angle: 90 });
  bbox(world(doc), [-3, 1, 3], [-2, 3, 4]);
  command(doc, 'entities.scale', { nodes: [id], origin: [0, 0, 0], factors: [2, 3, 4] });
  bbox(world(doc), [-6, 3, 12], [-4, 9, 16]);
  command(doc, 'entities.mirror', { nodes: [id], origin: [0, 0, 0], axis: 'x' });
  const m = world(doc);
  bbox(m, [4, 3, 12], [6, 9, 16]);
  near(m.volume([...m.faces.keys()]), 48, 'el espejo conserva la orientación exterior');
  enter(doc, id);
  bbox(doc.model, [0, 0, 0], [2, 1, 1]);
  exit(doc);
});

test('copiar un grupo crea grupos independientes con distancia acumulada', () => {
  const doc = new D.Document();
  const id = groupBox(doc);
  command(doc, 'entities.move', { nodes: [id], vector: [3, 0, 0], copy: true, copies: 2 });
  assert.equal(nodes(doc).length, 3);
  bbox(world(doc), [0, 0, 0], [8, 1, 1]);
  const copied = nodes(doc).find(node => node.id !== id);
  assert.ok(copied);
  enter(doc, copied.id);
  command(doc, 'face.pushPull', { face: topFace(doc.model), distance: 1 });
  exit(doc);
  enter(doc, id);
  bbox(doc.model, [0, 0, 0], [2, 1, 1]);
  exit(doc);
  near(world(doc).volume([...world(doc).faces.keys()]), 8);
});

test('copias independientes y componentes únicos reciben UUID de geometría propios', () => {
  const doc = new D.Document();
  const group = groupBox(doc);
  const original = doc.scene.definitions.get(nodes(doc)[0].definitionId).model;
  const originalUUIDs = new Set(Object.values(original.toJSON().identities));
  command(doc, 'entities.move', { nodes: [group], vector: [5, 0, 0], copy: true });
  const copied = nodes(doc).find(node => node.id !== group);
  const copiedModel = doc.scene.definitions.get(copied.definitionId).model;
  const copiedUUIDs = Object.values(copiedModel.toJSON().identities);
  assert.equal(copiedUUIDs.length, originalUUIDs.size);
  assert.ok(copiedUUIDs.every(id => !originalUUIDs.has(id)), 'la copia de grupo tiene identidades propias');
  const component = command(doc, 'component.create', { nodes: [group], name: 'Compartido' });
  const instance = command(doc, 'component.instantiate', { definitionId: component.definitionId, matrix: translate(10, 0, 0) });
  const unique = command(doc, 'component.makeUnique', { nodes: [nodeId(instance)] });
  const uniqueUUIDs = Object.values(doc.scene.definitions.get(unique.definitionId).model.toJSON().identities);
  assert.ok(uniqueUUIDs.every(id => !originalUUIDs.has(id)), 'hacer único independiza también las identidades');
});

test('seleccionar una cara proyectada selecciona y mueve el grupo completo', () => {
  const doc = new D.Document();
  const group = groupBox(doc);
  const face = topFace(doc.model);
  doc.select({ faces: [face] });
  assert.ok(doc.sel.nodes.has(group), 'la cara identifica al objeto cerrado');
  assert.equal(doc.sel.nodes.size, 1);
  assert.equal(doc.sel.faces.size, 6, 'la selección incluye todas las caras del grupo');
  command(doc, 'entities.move', { vector: [4, 2, 0] });
  bbox(world(doc), [4, 2, 0], [6, 3, 1]);
  const proxyEdge = [...doc.model.edges.keys()][0];
  command(doc, 'entities.rotate', { edges: [proxyEdge], center: [0, 0, 0], axis: [0, 0, 1], angle: 90 });
  bbox(world(doc), [-3, 4, 0], [-2, 6, 1]);
  enter(doc, group);
  bbox(loose(doc), [0, 0, 0], [2, 1, 1]);
  exit(doc);
});

test('copiar una selección mixta conserva geometría suelta y objetos independientes', () => {
  const doc = new D.Document();
  const group = groupBox(doc);
  const rootFace = rectangle(doc, [0, 3, 0], 1, 1).find(id => loose(doc).faces.has(id));
  assert.ok(rootFace);
  const before = stableFile(doc);
  command(doc, 'entities.move', { nodes: [group], faces: [rootFace], vector: [5, 0, 0], copy: true });
  assert.equal(nodes(doc).length, 2);
  assert.equal(loose(doc).faces.size, 2, 'se copia también la cara suelta');
  assert.equal(world(doc).faces.size, 14);
  bbox(world(doc), [0, 0, 0], [7, 4, 1]);
  assert.ok(doc.undo());
  assert.deepEqual(stableFile(doc), before);
});

test('las copias de componente mantienen el vínculo a su definición', () => {
  const doc = new D.Document();
  const component = componentBox(doc);
  command(doc, 'entities.rotate', { nodes: [nodeId(component)], center: [0, 0, 0], axis: [0, 0, 1], angle: 90, copy: true });
  assert.equal(nodes(doc).length, 2);
  enter(doc, nodeId(component));
  command(doc, 'face.pushPull', { face: topFace(doc.model), distance: 1 });
  exit(doc);
  assert.equal(world(doc).faces.size, 12);
  near(world(doc).volume([...world(doc).faces.keys()]), 8);
  bbox(world(doc), [-1, 0, 0], [2, 2, 2]);
});

test('explotar un grupo transformado preserva colocación y grupos hijos', () => {
  const doc = new D.Document();
  const inner = groupBox(doc);
  const outer = nodeId(command(doc, 'group.create', { name: 'Exterior', nodes: [inner] }));
  command(doc, 'entities.move', { nodes: [outer], vector: [5, 0, 0] });
  enter(doc, outer);
  command(doc, 'entities.move', { nodes: [inner], vector: [0, 7, 0] });
  exit(doc);
  const before = geometry(doc);
  command(doc, 'group.explode', { nodes: [outer] });
  assert.deepEqual(geometry(doc), before);
  assert.equal(nodes(doc).length, 1, 'el grupo hijo sigue siendo un nodo editable');
  const remaining = nodes(doc)[0];
  enter(doc, remaining.id);
  assert.equal(doc.model.faces.size, 6);
  exit(doc);
  command(doc, 'group.explode', { nodes: [remaining.id] });
  assert.equal(nodes(doc).length, 0);
  assert.equal(doc.model.faces.size, 6);
  assert.deepEqual(geometry(doc), before);
});

test('agrupación y transformaciones incluyen anotaciones', () => {
  const doc = new D.Document();
  const face = rectangle(doc, [0, 0, 0], 2, 1)[0];
  const annot = command(doc, 'guide.add', { point: [1, 0, 0] }).id;
  const group = nodeId(command(doc, 'group.create', { name: 'Con guía', faces: [face], annots: [annot] }));
  assert.equal(loose(doc).annots.size, 0);
  command(doc, 'entities.move', { nodes: [group], vector: [4, 2, 1] });
  const values = [...world(doc).annots.values()];
  assert.equal(values.length, 1);
  vector(values[0].p, [5, 2, 1]);
});

test('renombrar y borrar nodos funcionan desde selección y se pueden deshacer', () => {
  const doc = new D.Document();
  const id = groupBox(doc);
  command(doc, 'node.rename', { node: id, name: 'Nombre nuevo' });
  assert.equal(nodes(doc)[0].name, 'Nombre nuevo');
  doc.select({ nodes: [id] });
  assert.ok(doc.sel.nodes.has(id));
  command(doc, 'entities.erase');
  assert.equal(nodes(doc).length, 0);
  assert.equal(world(doc).faces.size, 0);
  assert.ok(doc.undo());
  assert.equal(nodes(doc)[0].id, id);
  assert.equal(nodes(doc)[0].name, 'Nombre nuevo');
  assert.ok(doc.redo());
  assert.equal(nodes(doc).length, 0);
});

test('deshacer y rehacer restauran definición, colocación, nombres y geometría', () => {
  const doc = new D.Document();
  const initial = stableFile(doc);
  const component = componentBox(doc);
  command(doc, 'component.instantiate', { definitionId: component.definitionId, matrix: translate(5, 0, 0) });
  command(doc, 'node.rename', { node: nodeId(component), name: 'Principal' });
  command(doc, 'entities.scale', { nodes: [nodeId(component)], origin: [0, 0, 0], factors: 2 });
  enter(doc, nodeId(component));
  command(doc, 'face.pushPull', { face: topFace(doc.model), distance: 1 });
  exit(doc);
  const final = stableFile(doc);
  const undoCount = doc.undoStack.length;
  assert.ok(undoCount >= 6);
  for (let i = 0; i < undoCount; i++) assert.ok(doc.undo());
  assert.deepEqual(stableFile(doc), initial);
  for (let i = 0; i < undoCount; i++) assert.ok(doc.redo());
  assert.deepEqual(stableFile(doc), final);
});

test('guardar y abrir conserva UUID, nodos, definiciones e IDs de geometría locales', () => {
  const doc = new D.Document();
  const component = componentBox(doc);
  const id = nodeId(component);
  command(doc, 'component.instantiate', { definitionId: component.definitionId, matrix: translate(5, 2, 0) });
  command(doc, 'entities.rotate', { nodes: [id], center: [0, 0, 0], axis: [0, 0, 1], angle: 30 });
  enter(doc, id);
  const localIds = { faces: [...doc.model.faces.keys()], edges: [...doc.model.edges.keys()], verts: [...doc.model.verts.keys()] };
  exit(doc);
  const json = stableFile(doc);
  assert.ok(json.scene, 'el archivo incluye la escena jerárquica');
  const reopened = new D.Document();
  reopened.loadJSON(clone(json), 'Reabierto');
  assert.deepEqual(stableFile(reopened).scene, json.scene);
  assert.deepEqual(geometry(reopened), geometry(doc));
  enter(reopened, id);
  assert.deepEqual({ faces: [...reopened.model.faces.keys()], edges: [...reopened.model.edges.keys()], verts: [...reopened.model.verts.keys()] }, localIds);
  command(reopened, 'face.pushPull', { face: topFace(reopened.model), distance: 1 });
  exit(reopened);
  assert.equal(world(reopened).faces.size, 12, 'ambas instancias siguen editables');
});

test('los archivos v1 de geometría plana se abren y pueden agruparse', () => {
  const legacy = new D.Model();
  legacy.addRectangle([2, 3, 0], [1, 0, 0], [0, 1, 0], 4, 5);
  const legacyFile = { format: 'dedalo', version: 1, model: legacy.toJSON() };
  const doc = new D.Document();
  doc.loadJSON(clone(legacyFile));
  assert.equal(doc.model.faces.size, 1);
  bbox(world(doc), [2, 3, 0], [6, 8, 0]);
  doc.select({ faces: [...doc.model.faces.keys()] });
  nodeId(command(doc, 'group.create', { name: 'Legado' }));
  assert.equal(loose(doc).faces.size, 0);
  bbox(world(doc), [2, 3, 0], [6, 8, 0]);
});

test('una transacción por lote se deshace completa y revierte ante un comando inválido', () => {
  const doc = new D.Document();
  const id = groupBox(doc);
  const before = stableFile(doc);
  const history = doc.undoStack.length;
  command(doc, 'transaction.batch', { commands: [
    { command: 'node.rename', params: { node: id, name: 'En lote' } },
    { command: 'entities.move', params: { nodes: [id], vector: [5, 0, 0] } }
  ] });
  assert.equal(doc.undoStack.length, history + 1, 'el lote ocupa una operación del historial');
  bbox(world(doc), [5, 0, 0], [7, 1, 1]);
  assert.ok(doc.undo());
  assert.deepEqual(stableFile(doc), before);
  const failedBatch = doc.execute('transaction.batch', { commands: [
    { command: 'node.rename', params: { node: id, name: 'Debe revertir' } },
    { command: 'entities.move', params: { nodes: [id], vector: [5, 0, 0] } },
    { command: 'comando.inexistente', params: {} }
  ] });
  assert.equal(failedBatch.ok, false);
  assert.deepEqual(stableFile(doc), before);
  assert.equal(doc.undoStack.length, history);
});

test('parámetros inválidos no destruyen la escena ni crean historial', () => {
  const doc = new D.Document();
  const id = groupBox(doc);
  const before = stableFile(doc);
  const history = doc.undoStack.length;
  for (const [name, params] of [
    ['entities.move', { nodes: [id], vector: [NaN, 0, 0] }],
    ['entities.scale', { nodes: [id], origin: [0, 0, 0], factors: [1, 0, 1] }],
    ['component.instantiate', { definitionId: 'missing-definition' }],
    ['context.enter', { node: 'missing-node' }],
    ['group.create', { nodes: ['missing-node'] }]
  ]) {
    const result = doc.execute(name, params);
    assert.equal(result.ok, false, name + ' debe rechazar los datos');
    assert.deepEqual(stableFile(doc), before, name + ' conserva el documento');
    assert.equal(doc.undoStack.length, history, name + ' conserva el historial');
  }
});

// Estos casos usan la forma serializada emitida por el documento; no fabrican una
// segunda representación de escena. Se comprueba que una carga fallida sea atómica.
function sceneRecords(json) {
  const scene = json.scene;
  assert.ok(scene && typeof scene === 'object');
  const result = [];
  (function visit(value) {
    if (!value || typeof value !== 'object') return;
    if (value.model && value.nodes) result.push(value);
    for (const child of Object.values(value)) if (child && typeof child === 'object') visit(child);
  })(scene);
  return result;
}
function serializedNodes(json) {
  const result = [];
  (function visit(value) {
    if (!value || typeof value !== 'object') return;
    if (Array.isArray(value.nodes)) result.push(...value.nodes);
    for (const child of Object.values(value)) if (child && typeof child === 'object') visit(child);
  })(json.scene);
  return result;
}
function rejectedLoad(mutator) {
  const doc = new D.Document();
  const component = componentBox(doc);
  const json = stableFile(doc);
  const before = stableFile(doc);
  mutator(json, component);
  let rejected = false;
  try { const result = doc.loadJSON(json); rejected = !!(result && result.ok === false); } catch (_) { rejected = true; }
  assert.ok(rejected, 'la carga corrupta debe rechazarse');
  assert.deepEqual(stableFile(doc), before, 'la carga fallida conserva el documento abierto');
}

test('cargar referencias de definición inexistentes se rechaza sin perder el documento', () => {
  rejectedLoad(json => {
    const node = serializedNodes(json)[0]; assert.ok(node);
    const key = Object.hasOwn(node, 'definitionId') ? 'definitionId' : Object.hasOwn(node, 'definition') ? 'definition' : 'definitionId';
    node[key] = 'missing-definition';
  });
});

test('cargar coordenadas no finitas se rechaza sin perder el documento', () => {
  rejectedLoad(json => {
    const record = sceneRecords(json).find(record => record.model.verts.length); assert.ok(record);
    record.model.verts[0][1] = NaN;
  });
});

test('cargar una matriz singular se rechaza sin perder el documento', () => {
  rejectedLoad(json => { const node = serializedNodes(json)[0]; assert.ok(node); node.matrix = Array(16).fill(0); });
});

test('cargar un ciclo de definiciones se rechaza sin perder el documento', () => {
  rejectedLoad((json, component) => {
    const record = sceneRecords(json).find(record => record.id === component.definitionId);
    assert.ok(record, 'se encuentra la definición del componente');
    const source = serializedNodes(json)[0]; assert.ok(source);
    const child = clone(source); child.id = randomUUID();
    record.nodes.push(child);
  });
});

test('explotar una curva escalada y reflejada conserva sus metadatos geométricos', () => {
  for (const kind of ['circle', 'polygon']) {
    const doc = new D.Document();
    command(doc, 'draw.' + kind, { center: [0, 0, 0], normal: [0, 0, 1], radius: 1, segments: 12, sides: 6 });
    command(doc, 'select.all');
    const group = nodeId(command(doc, 'group.create'));
    command(doc, 'entities.scale', { nodes: [group], origin: [0, 0, 0], factors: [-2, 1, 1] });
    const before = points(world(doc));
    command(doc, 'group.explode', { nodes: [group] });
    assert.deepEqual(points(world(doc)), before);
    const usedEdge = [...loose(doc).edges.values()].find(e => e.curve);
    const curve = loose(doc).curves.get(usedEdge.curve);
    assert.equal(curve.kind, kind === 'polygon' ? 'polygon' : 'ellipse');
    assert.equal(curve.radius, undefined, 'no conserva un radio circular falso');
    near(curve.normal[2], 1, 'normal del plano tras reflejo');
  }
});

console.log('\n' + passed + ' correctas, ' + failed + ' fallidas');
if (failed) { console.error('Fallan: ' + failures.join(' · ')); process.exitCode = 1; }
