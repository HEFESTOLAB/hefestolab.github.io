/* Interaction contracts in Node: no browser, DOM, canvas or rendering. */
'use strict';
const assert = require('node:assert/strict');
const path = require('node:path');
const APP = path.join(__dirname, '..', 'app', 'js');
for (const file of ['geom', 'model', 'document', 'scene', 'hierarchy']) require(path.join(APP, 'core', file + '.js'));
require(path.join(APP, 'tools', 'base.js'));
require(path.join(APP, 'tools', 'select.js'));
require(path.join(APP, 'tools', 'modify.js'));
require(path.join(APP, 'ui', 'ui.js'));
// Loading App only registers its class; the DOMContentLoaded callback is not run.
globalThis.window = globalThis;
globalThis.addEventListener = () => {};
require(path.join(APP, 'app.js'));
const D = globalThis.DEDALO;
let passed = 0;
function test(name, fn) { fn(); passed++; console.log('  ok   ' + name); }
function execute(doc, name, params) { const r = doc.execute(name, params || {}); assert.equal(r.ok, true, r.error); return r; }
function fixture() {
  const doc = new D.Document();
  execute(doc, 'draw.rectangle', { origin: [0, 0, 0], width: 2, height: 1 });
  const node = execute(doc, 'group.create', { faces: [...doc.model.faces.keys()], name: 'Grupo' }).node;
  doc.clearSelection();
  let face = [...doc.model.faces.keys()][0], tool;
  const app = { doc, renderer: { opts: { showGuides: true } }, requestRender() {},
    overlay: { annotAt: () => null, hits: [] },
    camera: { project: p => ({ x: 100 + p[0] * 100, y: 100 + p[1] * 100, behind: false }), ray: () => ({ o: [0, 0, 10], d: [0, 0, -1] }) },
    inference: { picker: { nearEdges: () => [], visible: () => true, faceAt: () => face ? { fid: face, p: [1, 0.5, 0] } : null } },
    ui: { enterNode(id) { tool.reset(); execute(doc, 'context.enter', { node: id }); } } };
  tool = new D.tools.SelectTool(app); tool.reset();
  return { doc, node, tool, app, hit: id => { face = id; } };
}
const event = extra => Object.assign({ x: 150, y: 150, button: 0, buttons: 0, clicks: 1, ctrl: false, shift: false }, extra);

test('click on a projected face selects the complete group', () => {
  const { doc, node, tool } = fixture();
  tool.onDown(event()); tool.onUp(event());
  assert.deepEqual([...doc.sel.nodes], [node]);
  assert.equal(doc.sel.faces.size, doc.itemsForNode(node).faces.length);
  tool.onDown(event({ shift: true })); tool.onUp(event({ shift: true }));
  assert.equal(doc.selectionEmpty(), true, 'Shift toggles the object as a unit');
});
test('double click enters once and consumes pointerup from the old context', () => {
  const { doc, node, tool } = fixture();
  tool.onDown(event({ clicks: 2 })); tool.onDouble(event({ clicks: 2 }));
  assert.deepEqual(doc.editPath, [node]);
  tool.onUp(event());
  assert.equal(doc.selectionEmpty(), true, 'parent projection IDs must not select local primitives');
});
test('a selection window requires the whole group; crossing selects the whole group', () => {
  const { node, tool } = fixture();
  const full = tool.boxSelect({ x0: 90, y0: 90, x1: 310, y1: 210 });
  assert.deepEqual(full.nodes, [node]); assert.deepEqual(full.faces, []); assert.deepEqual(full.edges, []);
  const partial = tool.boxSelect({ x0: 90, y0: 90, x1: 230, y1: 210 });
  assert.deepEqual(partial.nodes, []); assert.deepEqual(partial.faces, []); assert.deepEqual(partial.edges, []);
  const crossing = tool.boxSelect({ x0: 230, y0: 210, x1: 90, y1: 90 });
  assert.deepEqual(crossing.nodes, [node]); assert.deepEqual(crossing.faces, []); assert.deepEqual(crossing.edges, []);
});
test('box selection keeps loose geometry distinct from atomic nodes', () => {
  const { doc, node, tool } = fixture();
  execute(doc, 'draw.rectangle', { origin: [3, 0, 0], width: 1, height: 1 });
  const selection = tool.boxSelect({ x0: 90, y0: 90, x1: 510, y1: 210 });
  assert.deepEqual(selection.nodes, [node]);
  assert.equal(selection.faces.length, 1);
  for (const id of selection.faces) assert.equal(doc.nodeForHit({ face: id }), null);
});
test('Move picking returns complete atomic geometry and a finite hover point for every hit type', () => {
  const { doc, node, app } = fixture(), expected = doc.itemsForNode(node);
  const vertex = expected.verts[0], edge = expected.edges[0], face = expected.faces[0];
  let hit = 'vert';
  app.inference.picker.nearVertices = () => hit === 'vert' ? [{ vid: vertex, p: doc.model.P(vertex) }] : [];
  app.inference.picker.nearEdges = () => hit === 'edge' ? [{ eid: edge, p: [1, 0, 0] }] : [];
  app.inference.picker.faceAt = () => hit === 'face' ? { fid: face, p: [1, 0.5, 0] } : null;
  for (const kind of ['vert', 'edge', 'face']) {
    hit = kind;
    const picked = D.pickEntity(app, 150, 150);
    assert.deepEqual(picked.nodes, [node], kind + ' resolves to its node');
    for (const key of ['faces', 'edges', 'verts', 'annots']) assert.deepEqual(picked[key], expected[key], kind + ' includes complete ' + key);
    assert.equal(picked.p.length, 3); assert.equal(picked.p.every(Number.isFinite), true, kind + ' has a usable hover point');
  }
});
test('Move preview includes every group vertex and cancellation preserves authoritative geometry', () => {
  const { doc, node, app } = fixture(), expected = doc.itemsForNode(node);
  const source = JSON.stringify(doc.scene.toJSON());
  app.inference.picker.nearVertices = () => [];
  app.inference.picker.nearEdges = () => [{ eid: expected.edges[0], p: [1, 0, 0] }];
  app.inference.infer = () => ({ p: [0, 0, 0] });
  app.setVCB = () => {};
  app.toast = message => { throw new Error(message); };
  const move = new D.tools.MoveTool(app); move.reset();
  move.onDown(event());
  assert.equal(move.state, 1); assert.deepEqual(move.items.nodes, [node]);
  assert.deepEqual([...move.moving].sort((a, b) => a - b), [...expected.verts].sort((a, b) => a - b));
  move.applyVec([2, 0, 0]);
  assert.deepEqual(doc.model.bbox(), { min: [2, 0, 0], max: [4, 1, 0] });
  assert.equal(JSON.stringify(doc.scene.toJSON()), source, 'preview does not change the saved hierarchy');
  move.cancel();
  assert.deepEqual(doc.model.bbox(), { min: [0, 0, 0], max: [2, 1, 0] });
  assert.equal(JSON.stringify(doc.scene.toJSON()), source);
});
test('hierarchy uses instance names and excludes projected primitives from loose selection', () => {
  const { doc, node } = fixture();
  execute(doc, 'component.create', { nodes: [node], name: 'Definición' });
  execute(doc, 'node.rename', { node, name: '<Instancia independiente>' });
  doc.select({ nodes: [node] });
  const selected = D.UI.prototype.hierarchyState.call({ app: { doc } });
  assert.equal(selected.loose, 0); assert.equal(selected.one.id, node);
  execute(doc, 'context.enter', { node });
  const entered = D.UI.prototype.hierarchyState.call({ app: { doc } });
  assert.equal(entered.contextName, '<Instancia independiente>');
});
test('the component library disables recursive instantiation in the current context', () => {
  const { doc, node } = fixture();
  const component = execute(doc, 'component.create', { nodes: [node], name: 'Módulo' });
  const ui = { app: { doc } };
  assert.equal(D.UI.prototype.canInstantiate.call(ui, component.definitionId), true);
  execute(doc, 'context.enter', { node });
  assert.equal(D.UI.prototype.canInstantiate.call(ui, component.definitionId), false);
});
test('Escape cancels unfinished work before it exits an isolated context', () => {
  const { doc, node } = fixture(); execute(doc, 'context.enter', { node });
  const app = { doc, tool: { id: 'select', state: 1, cancel() { this.state = 0; } }, afterInput() {},
    exec: (name) => execute(doc, name) };
  D.App.prototype.escape.call(app); assert.deepEqual(doc.editPath, [node]);
  D.App.prototype.escape.call(app); assert.deepEqual(doc.editPath, []);
  assert.equal(doc.sel.nodes.has(node), true);
});
test('empty scene autosave is silent; unplaced component definitions are recoverable', () => {
  const doc = new D.Document(); let calls = 0, autosave = doc.fileJSON();
  const app = { files: { readAutosave: () => autosave }, toast: () => { calls++; } };
  D.App.prototype.offerRecovery.call(app); assert.equal(calls, 0);
  execute(doc, 'draw.rectangle', { origin: [0, 0, 0], width: 1, height: 1 });
  const component = execute(doc, 'component.create', { faces: [...doc.model.faces.keys()] });
  execute(doc, 'entities.erase', { nodes: [component.node] });
  autosave = doc.fileJSON();
  D.App.prototype.offerRecovery.call(app); assert.equal(calls, 1);
});
test('App cancels active previews before commands mutate the document', () => {
  const doc = new D.Document(), order = [];
  const app = { doc, tool: { cancel: () => order.push('cancel') }, afterInput: () => order.push('after'), toast() {} };
  const raw = doc.execute.bind(doc);
  doc.execute = (...args) => { order.push('execute'); return raw(...args); };
  D.App.prototype.exec.call(app, 'draw.rectangle', { origin: [0, 0, 0], width: 1, height: 1 });
  assert.deepEqual(order, ['cancel', 'execute', 'after']);
  order.length = 0;
  D.App.prototype.exec.call(app, 'scene.get');
  assert.deepEqual(order, ['execute', 'after']);
});
test('public API records attribution and restores the human execution context', () => {
  const doc = new D.Document();
  const app = { doc, tool: { cancel() {} }, afterInput() {}, toast() {} };
  app.exec = (...args) => D.App.prototype.exec.call(app, ...args);
  D.App.prototype.exposeAPI.call(app);
  const previous = doc.execution;
  const r = globalThis.dedalo.execute('draw.rectangle', { origin: [0, 0, 0], width: 1, height: 1 }, { agent: 'test-agent', channel: 'test-api' });
  assert.equal(r.ok, true, r.error);
  assert.equal(doc.audit.at(-1).agent, 'test-agent'); assert.equal(doc.audit.at(-1).channel, 'test-api');
  assert.equal(doc.execution, previous);
  globalThis.dedalo.execute('unknown.command'); assert.equal(doc.execution, previous);
});
console.log('\n' + passed + ' interaction tests passed (without DOM or rendering).');
