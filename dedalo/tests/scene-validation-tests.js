/* Validación de UUID canónicos de escena. Node puro; no usa DOM ni render. */
'use strict';
const assert = require('node:assert/strict');
const path = require('node:path');
for (const file of ['geom', 'model', 'document', 'scene', 'hierarchy']) require(path.join(__dirname, '..', 'app', 'js', 'core', file + '.js'));
const D = globalThis.DEDALO;
let passed = 0;
function test(name, run) { run(); passed++; console.log('  ok   ' + name); }
function fixture() {
  const scene = new D.Scene();
  const geometry = () => {
    const m = new D.Model(); m.addRectangle([0, 0, 0], [1, 0, 0], [0, 1, 0], 2, 1); return m;
  };
  const first = scene.addDefinition('Primero', 'component', geometry());
  const second = scene.addDefinition('Segundo', 'component', geometry());
  const node = scene.addNode([], { definitionId: first.id });
  scene.addNode([], { definitionId: first.id, matrix: D.SceneMath.translation([5, 0, 0]) });
  scene.addNode([], { definitionId: second.id });
  return { scene, first, second, node };
}
function rejected(mutate) {
  const { scene, first, second, node } = fixture();
  const baseline = JSON.stringify(scene.toJSON()), input = scene.toJSON();
  const a = input.definitions.find(d => d.id === first.id), b = input.definitions.find(d => d.id === second.id);
  mutate(input, a, b, node);
  assert.throws(() => scene.load(input), /duplicado/i);
  assert.equal(JSON.stringify(scene.toJSON()), baseline, 'el rechazo conserva íntegra la escena anterior');
}
test('rechaza UUID geométrico igual al UUID de definición raíz', () => rejected((j, a) => { a.model.identities[a.model.verts[0][0]] = j.rootId; }));
test('rechaza UUID geométrico igual al UUID de una instancia', () => rejected((j, a, b, node) => { a.model.identities[a.model.edges[0][0]] = node.id; }));
test('rechaza UUID geométrico compartido por dos definiciones independientes', () => rejected((j, a, b) => { b.model.identities[b.model.faces[0].id] = a.model.identities[a.model.faces[0].id]; }));
test('compara los UUID sin distinguir mayúsculas', () => rejected((j, a, b) => { b.model.identities[b.model.verts[0][0]] = a.model.identities[a.model.verts[0][0]].toUpperCase(); }));
test('valida también la escena canónica en memoria', () => {
  const { scene, first } = fixture(); first.model.identities.set(first.model.verts.keys().next().value, scene.rootId);
  assert.ok(scene.validate().some(e => /UUID geométrico duplicado/i.test(e)));
});
test('acepta instancias múltiples de la misma definición sin duplicar su identidad', () => {
  const { scene, first } = fixture(), json = scene.toJSON(), restored = new D.Scene().load(json);
  assert.deepEqual(restored.validate(), []);
  assert.equal(restored.current([]).nodes.filter(n => n.definitionId === first.id).length, 2);
  assert.deepEqual(restored.toJSON(), json);
});
test('genera UUID ausentes al migrar geometría anterior', () => {
  const { scene } = fixture(), legacy = scene.toJSON();
  for (const d of legacy.definitions) delete d.model.identities;
  const restored = new D.Scene().load(legacy);
  assert.deepEqual(restored.validate(), []);
  const values = restored.toJSON().definitions.flatMap(d => Object.values(d.model.identities));
  assert.equal(new Set(values).size, values.length);
  assert.ok(values.length > 0);
});
test('rechaza el desbordamiento de posición al proyectar una instancia', () => {
  const scene = new D.Scene(), m = new D.Model();
  const a = m._addVertexRaw([1e308, 0, 0]), b = m._addVertexRaw([1e308, 1, 0]); m._addEdgeRaw(a, b);
  const d = scene.addDefinition('Posición extrema', 'component', m);
  scene.addNode([], { definitionId: d.id, matrix: D.SceneMath.translation([1e308, 0, 0]) });
  assert.throws(() => scene.project(), /intervalo numérico|no finitas/);
});
test('rechaza el desbordamiento de un vector de anotación transformado', () => {
  const scene = new D.Scene(), m = new D.Model(), id = m.newId();
  m.annots.set(id, { id, kind: 'text', p: [0, 0, 0], off: [1e308, 0, 0], text: 'Texto' });
  const d = scene.addDefinition('Anotación extrema', 'component', m);
  scene.addNode([], { definitionId: d.id, matrix: D.SceneMath.scaling([0, 0, 0], [2, 1, 1]) });
  assert.throws(() => scene.project(), /intervalo numérico|no finitas/);
});
test('rechaza planos numéricamente desbordados aunque sus vértices sean finitos', () => {
  const scene = new D.Scene(), m = new D.Model();
  m.addRectangle([0, 0, 0], [1, 0, 0], [0, 1, 0], 2, 1);
  const d = scene.addDefinition('Plano extremo', 'component', m);
  scene.addNode([], { definitionId: d.id, matrix: D.SceneMath.scaling([0, 0, 0], 1e155) });
  assert.throws(() => scene.project(), /plano.*intervalo numérico/);
});
function documentState(doc) {
  return JSON.stringify({ scene: doc.scene.toJSON(), path: doc.editPath, selection: doc.selectionItems(),
    undo: doc.undoStack, redo: doc.redoStack, name: doc.name, dirty: doc.dirty,
    version: doc.projectVersion, projectId: doc.projectId, audit: doc.audit });
}
function documentFixture() {
  const doc = new D.Document();
  assert.equal(doc.execute('draw.line', { points: [[0, 0, 0], [1, 1, 0]] }).ok, true);
  const component = doc.execute('component.create', { edges: [...doc.model.edges.keys()], name: 'Componente protegido' });
  assert.equal(component.ok, true);
  assert.equal(doc.execute('entities.move', { nodes: [component.node], vector: [5, 0, 0] }).ok, true);
  assert.ok(doc.undo());
  doc.select({ nodes: [component.node] });
  doc.name = 'Proyecto protegido';
  assert.ok(doc.undoStack.length && doc.redoStack.length);
  return { doc, component };
}
test('una carga con proyección desbordada conserva proyecto, selección e historial', () => {
  const { doc } = documentFixture(), before = documentState(doc), previousScene = doc.scene;
  const candidate = new D.Scene(), m = new D.Model();
  const a = m._addVertexRaw([1e308, 0, 0]), b = m._addVertexRaw([1e308, 1, 0]); m._addEdgeRaw(a, b);
  const d = candidate.addDefinition('No sustituir el proyecto', 'component', m);
  candidate.addNode([], { definitionId: d.id, matrix: D.SceneMath.translation([1e308, 0, 0]) });
  assert.throws(() => doc.loadJSON({ format: 'dedalo', version: 2, scene: candidate.toJSON(), name: 'Archivo desbordado' }), /intervalo numérico|no finitas/);
  assert.equal(doc.scene, previousScene);
  assert.equal(documentState(doc), before);
});
test('una transacción con NaN revierte sin convertir la coordenada en cero', () => {
  const { doc, component } = documentFixture(), before = documentState(doc);
  const result = doc.transact('Coordenada inválida', () => {
    const model = doc.scene.definitions.get(component.definitionId).model;
    model.verts.values().next().value.p[0] = NaN;
    return { ok: true };
  });
  assert.equal(result.ok, false);
  assert.equal(documentState(doc), before);
});
test('una transacción directa con proyección desbordada revierte el documento completo', () => {
  const { doc, component } = documentFixture(), before = documentState(doc);
  const result = doc.transact('Proyección inválida', () => {
    const model = doc.scene.definitions.get(component.definitionId).model;
    for (const vertex of model.verts.values()) vertex.p[0] = 1e308;
    doc.scene.node([], component.node).matrix = D.SceneMath.translation([1e308, 0, 0]);
    return { ok: true };
  });
  assert.equal(result.ok, false);
  assert.equal(documentState(doc), before);
});
console.log(passed + ' pruebas de validación de escena superadas.');
