/* Dedicated Copy tool contracts in pure Node: no DOM, canvas, renderer or server. */
'use strict';
const assert = require('node:assert/strict'), path = require('node:path');
const JS = path.join(__dirname, '..', 'app', 'js');
for (const file of ['core/geom', 'core/dimensions', 'core/model', 'core/document', 'core/scene', 'core/hierarchy', 'view/camera', 'view/inference', 'tools/base', 'tools/draw', 'tools/modify']) require(path.join(JS, file + '.js'));
const D = globalThis.DEDALO;
let passed = 0, failed = 0;
function test(name, fn) { try { fn(); passed++; console.log('  ok   ' + name); } catch (e) { failed++; console.error('  FALLA ' + name + '\n' + e.stack); } }
function command(doc, name, params) { const r = doc.execute(name, params || {}); assert.ok(r.ok, r.error); return r; }
function scene(doc) { return JSON.stringify(doc.scene.toJSON()); }
function near(a, b) { assert.ok(Number.isFinite(a) && Math.abs(a - b) < 1e-7, a + ' != ' + b); }
function vector(a, b) { a.forEach((value, i) => near(value, b[i])); }
const event = (x = 0, y = 0, extra) => Object.assign({ x, y, button: 0, ctrl: false, shift: false }, extra);
function rectangle(doc) { command(doc, 'draw.rectangle', { origin: [0, 0, 0], width: 2, height: 1 }); return [...doc.model.faces.keys()][0]; }
function fixture(kind, selected = true) {
  const doc = new D.Document(); let face, node;
  if (kind !== 'annotations') {
    face = rectangle(doc);
    if (kind === 'group' || kind === 'component') node = command(doc, kind + '.create', { faces: [face], name: 'Original' }).node;
    if (selected) doc.select(node ? { nodes: [node] } : { faces: [face] }, 'set'); else doc.clearSelection();
  }
  const app = { doc, camera: new D.Camera(), renderer: { opts: { xray: true, showAxes: false, showGuides: false } },
    requestRender() {}, refreshStatus() {}, setVCB(text) { this.vcb = text; },
    toast(message, kind) { if (kind === 'error' || kind === 'warn') throw new Error(message); this.lastMessage = message; } };
  app.inference = new D.Inference(app);
  app.inference.infer = (x, y) => ({ p: [x, y, 0], type: 'free' });
  app.inference.picker.nearVertices = () => []; app.inference.picker.nearEdges = () => [];
  app.inference.picker.faceAt = () => face ? { fid: face, p: [0, 0, 0] } : null;
  const tool = new D.tools.CopyTool(app); tool.activate();
  return { app, doc, tool, face, node };
}
function start(f) { f.tool.onDown(event()); assert.equal(f.tool.state, 1); f.tool.snapInference = { infer: f.app.inference.infer }; }
function originalVertices(f) { return new Map(f.doc.model.faceVerts(f.doc.model.faces.get(f.face)).map(id => [id, { p: f.doc.model.P(id).slice(), uuid: f.doc.model.identities.get(id) }])); }
function assertOriginal(f, original) { for (const [id, value] of original) { assert.deepEqual(f.doc.model.P(id), value.p); assert.equal(f.doc.model.identities.get(id), value.uuid); } }
function faceStarts(doc) { return [...doc.model.faces.values()].map(face => Math.min(...doc.model.faceVerts(face).map(id => doc.model.P(id)[0]))).sort((a, b) => a - b); }

console.log('\nDédalo — Copiar (V) sin Ctrl, pruebas CPU\n');

test('Copy starts and remains enabled without Ctrl while preserving the original face and UUIDs', () => {
  const f = fixture(), original = originalVertices(f), faceUUID = f.doc.model.identities.get(f.face);
  assert.equal(f.tool.id, 'copy'); assert.equal(f.tool.copy, true); start(f);
  f.tool.onDown(event(5));
  assert.equal(f.tool.state, 0); assert.equal(f.tool.copy, true); assert.equal(f.doc.model.faces.size, 2);
  assertOriginal(f, original); assert.equal(f.doc.model.identities.get(f.face), faceUUID);
  assert.deepEqual(faceStarts(f.doc), [0, 5]);
});

test('an unselected face can be picked and copied directly with the same two-click gesture', () => {
  const f = fixture(undefined, false); assert.equal(f.doc.selectionEmpty(), true); start(f);
  assert.deepEqual(f.tool.items.faces, [f.face]); f.tool.onDown(event(-4, 0));
  assert.equal(f.doc.model.faces.size, 2); assert.deepEqual(faceStarts(f.doc), [-4, 0]);
});

test('Control and Meta keydown, repeats and release cannot turn the dedicated Copy tool into Move', () => {
  const f = fixture(), original = originalVertices(f); start(f); f.tool.onMove(event(5)); f.tool.flushMotion();
  for (const key of ['Control', 'Control', 'Meta']) { f.tool.onKey({ key, ctrl: true }); assert.equal(f.tool.copy, true); }
  for (const key of ['Control', 'Meta']) { f.tool.onKeyUp({ key, ctrl: false }); assert.equal(f.tool.copy, true); }
  assert.equal(f.doc.model.faces.size, 2); assertOriginal(f, original);
  f.tool.onDown(event(5, 0, { ctrl: false })); assert.equal(f.doc.model.faces.size, 2); assertOriginal(f, original);
  f.tool.activate(); assert.equal(f.tool.copy, true);
});

test('canceling a displayed preview and pending pointer restores canonical geometry and history', () => {
  const f = fixture(), canonical = scene(f.doc), history = f.doc.undoStack.length, audit = f.doc.audit.length;
  start(f); f.tool.onMove(event(4)); f.tool.flushMotion(); assert.equal(f.doc.model.faces.size, 2);
  assert.equal(scene(f.doc), canonical, 'the visual preview is not the saved document');
  f.tool.onMove(event(20)); f.tool.cancel(); f.tool.flushMotion();
  assert.equal(scene(f.doc), canonical); assert.equal(f.doc.model.faces.size, 1);
  assert.equal(f.doc.undoStack.length, history); assert.equal(f.doc.audit.length, audit); assert.equal(f.tool.copy, true);
});

test('the final click overrides an older queued pointer sample and commits exactly once', () => {
  const f = fixture(), history = f.doc.undoStack.length; start(f); f.tool.onMove(event(30));
  f.tool.onDown(event(7));
  assert.deepEqual(faceStarts(f.doc), [0, 7]); assert.equal(f.doc.undoStack.length, history + 1);
  f.tool.flushMotion(); assert.deepEqual(faceStarts(f.doc), [0, 7]);
});

test('numeric distance and relative coordinates commit copies while the original stays fixed', () => {
  for (const [text, expected] of [['3m', [3, 0, 0]], ['<3;2;1>', [3, 2, 1]]]) {
    const f = fixture(), original = originalVertices(f); start(f); f.tool.onMove(event(8));
    assert.equal(f.tool.onVCB(text), true); assert.equal(f.doc.model.faces.size, 2); assertOriginal(f, original);
    const copy = [...f.doc.model.faces.values()].find(face => face.id !== f.face);
    const points = f.doc.model.faceVerts(copy).map(id => f.doc.model.P(id));
    vector([0, 1, 2].map(axis => Math.min(...points.map(p => p[axis]))), expected);
  }
});

test('a copied group receives its own definition, node UUID and geometry identities', () => {
  const f = fixture('group'), source = f.doc.scene.current([]).nodes[0], original = JSON.stringify(f.doc.scene.definitions.get(source.definitionId).model.toJSON());
  const ids = new Set(Object.values(f.doc.scene.definitions.get(source.definitionId).model.toJSON().identities));
  start(f); f.tool.onDown(event(5));
  const nodes = f.doc.scene.current([]).nodes, copy = nodes.find(node => node.id !== source.id);
  assert.equal(nodes.length, 2); assert.equal(copy.kind, 'group'); assert.notEqual(copy.id, source.id); assert.notEqual(copy.definitionId, source.definitionId);
  assert.equal(JSON.stringify(f.doc.scene.definitions.get(source.definitionId).model.toJSON()), original);
  const fresh = Object.values(f.doc.scene.definitions.get(copy.definitionId).model.toJSON().identities);
  assert.ok(fresh.length && fresh.every(uuid => !ids.has(uuid)));
  vector(source.matrix.slice(12, 15), [0, 0, 0]); vector(copy.matrix.slice(12, 15), [5, 0, 0]);
});

test('a copied component remains an instance of the same unmodified definition', () => {
  const f = fixture('component'), source = f.doc.scene.current([]).nodes[0], original = JSON.stringify(f.doc.scene.definitions.get(source.definitionId).model.toJSON());
  start(f); f.tool.onDown(event(5));
  const nodes = f.doc.scene.current([]).nodes, copy = nodes.find(node => node.id !== source.id);
  assert.equal(nodes.length, 2); assert.notEqual(copy.id, source.id); assert.equal(copy.definitionId, source.definitionId);
  assert.equal(JSON.stringify(f.doc.scene.definitions.get(source.definitionId).model.toJSON()), original);
  vector(source.matrix.slice(12, 15), [0, 0, 0]); vector(copy.matrix.slice(12, 15), [5, 0, 0]);
});

test('annotation previews and commit translate points, preserve offsets, assign new UUIDs and undo/redo exactly', () => {
  const f = fixture('annotations');
  const dim = command(f.doc, 'dim.add', { a: [0, 0, 0], b: [2, 0, 0], offset: [0, 1, 0] }).id;
  const text = command(f.doc, 'text.add', { point: [1, 0, 0], text: 'Original', offset: [0, 0, 1] }).id;
  f.doc.select({ annots: [dim, text] }, 'set');
  const before = scene(f.doc), sourceDim = structuredClone(f.doc.model.annots.get(dim)), sourceText = structuredClone(f.doc.model.annots.get(text));
  const oldUUIDs = new Set([f.doc.model.identities.get(dim), f.doc.model.identities.get(text)]);
  start(f); f.tool.onMove(event(4, 2)); f.tool.flushMotion();
  assert.equal(f.doc.model.annots.size, 4); assert.equal(scene(f.doc), before);
  const preview = [...f.doc.model.annots.values()].find(a => a.kind === 'dim' && a.id !== dim);
  vector(preview.a, [4, 2, 0]); vector(preview.b, [6, 2, 0]); assert.deepEqual(preview.off, sourceDim.off);
  f.tool.onDown(event(4, 2));
  assert.deepEqual(f.doc.model.annots.get(dim), sourceDim); assert.deepEqual(f.doc.model.annots.get(text), sourceText);
  for (const annotation of f.doc.model.annots.values()) if (![dim, text].includes(annotation.id)) {
    assert.ok(!oldUUIDs.has(f.doc.model.identities.get(annotation.id)));
    assert.deepEqual(annotation.off, annotation.kind === 'dim' ? sourceDim.off : sourceText.off);
  }
  const committed = scene(f.doc); f.doc.undo(); assert.equal(scene(f.doc), before);
  f.doc.redo(); assert.equal(scene(f.doc), committed);
});

test('xN repeats and /N distributes complete copies with unique IDs in one undoable operation', () => {
  for (const [formula, delta, expected] of [['x3', 5, [0, 5, 10, 15]], ['/3', 6, [0, 2, 4, 6]]]) {
    const f = fixture(), before = scene(f.doc), history = f.doc.undoStack.length; start(f); f.tool.onDown(event(delta));
    assert.equal(f.tool.onVCB(formula), true); assert.deepEqual(faceStarts(f.doc), expected);
    assert.equal(f.doc.undoStack.length, history + 1);
    const ids = [...f.doc.model.identities.values()]; assert.equal(ids.length, new Set(ids).size);
    const committed = scene(f.doc); f.doc.undo(); assert.equal(scene(f.doc), before);
    f.doc.redo(); assert.equal(scene(f.doc), committed); assert.deepEqual(f.doc.model.validate(), []);
  }
});

console.log('\n' + passed + ' passed; ' + failed + ' failed.\n');
if (failed) process.exitCode = 1;
