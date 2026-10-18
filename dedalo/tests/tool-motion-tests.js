/* Interaction regressions in pure Node: no DOM, renderer, GPU or server. */
'use strict';
const assert = require('node:assert/strict');
const path = require('node:path');
const JS = path.join(__dirname, '..', 'app', 'js');
for (const file of ['core/geom', 'core/model', 'core/document', 'core/scene', 'core/hierarchy', 'view/camera', 'view/inference', 'tools/base', 'tools/draw', 'tools/modify']) require(path.join(JS, file + '.js'));
const D = globalThis.DEDALO;
let passed = 0, failed = 0;
function test(name, fn) { try { fn(); passed++; console.log('  ok   ' + name); } catch (e) { failed++; console.error('  FALLA ' + name + '\n' + e.stack); } }
function near(a, b) { assert.ok(Number.isFinite(a) && Math.abs(a - b) < 1e-6, a + ' != ' + b); }
function cmd(doc, name, args) { const r = doc.execute(name, args); assert.ok(r.ok, r.error); return r; }
function rectangle(doc, z) { cmd(doc, 'draw.rectangle', { origin: [0, 0, z || 0], width: 5, height: 4 }); return [...doc.model.faces.keys()][0]; }
function box(doc) { const fid = rectangle(doc); cmd(doc, 'face.pushPull', { face: fid, distance: 3 }); return [...doc.model.faces.values()].find(f => f.n[2] > 0.999).id; }
function volume(doc) { return doc.model.volume([...doc.model.faces.keys()]); }
function appFor(doc) {
  const app = { doc, camera: new D.Camera(), renderer: { opts: { xray: true, showAxes: false, showGuides: false } }, renders: 0,
    requestRender() { this.renders++; }, refreshStatus() {}, setVCB(s) { this.vcb = s; }, toast(message, kind) { this.message = { message, kind }; } };
  app.inference = new D.Inference(app); return app;
}
function pushTool(doc, fid, point) {
  const app = appFor(doc), tool = new D.tools.PushPullTool(app); tool.activate();
  app.inference.picker.faceAt = () => ({ fid, p: point || [2, 2, doc.model.faces.get(fid).d] });
  const screen = app.camera.project(point || [2, 2, doc.model.faces.get(fid).d]);
  tool.onDown({ x: screen.x, y: screen.y, button: 0, ctrl: false }); assert.equal(tool.state, 1); return { app, tool, screen };
}
function moveTool(doc, ctrl) {
  const app = appFor(doc), tool = new D.tools.MoveTool(app); tool.activate();
  app.inference.infer = (x, y) => ({ p: [x, y, 0], type: 'free' });
  tool.onDown({ x: 0, y: 0, button: 0, ctrl: !!ctrl });
  tool.snapInference = { infer: app.inference.infer }; return { app, tool };
}
function scene(doc) { return JSON.stringify(doc.scene.toJSON()); }

console.log('\nDédalo — movimiento e interacción sin renderizado\n');

test('cola conserva únicamente la última muestra y cancelar la descarta', () => {
  const seen = [], app = { requestRender() {} }, queue = new D.LatestMotion(app, e => seen.push(e.x));
  for (let x = 0; x < 100; x++) queue.queue({ x });
  assert.deepEqual(seen, []); queue.flush(); assert.deepEqual(seen, [99]);
  queue.queue({ x: 100 }); queue.cancel(); queue.flush(); assert.deepEqual(seen, [99]);
});

test('las revisiones crecen al restaurar y reaplicar para invalidar la caché visual', () => {
  const doc = new D.Document(), fid = rectangle(doc), app = appFor(doc), preview = new D.LivePreview(app);
  preview.begin(); const revisions = [doc.model.rev];
  for (const d of [1, 2, -1, -2]) { preview.apply(m => m.pushPull(fid, d)); revisions.push(doc.model.rev); }
  preview.end(); revisions.push(doc.model.rev);
  assert.ok(revisions.every((r, i) => i === 0 || r > revisions[i - 1]), revisions.join(', '));
});

test('empujar coalesce 100 movimientos en una inferencia y aplica la última posición', () => {
  const doc = new D.Document(), fid = rectangle(doc), { tool } = pushTool(doc, fid), canonical = scene(doc);
  let count = 0; tool.snapInference = { infer(x) { count++; return { p: [2, 2, x], type: 'endpoint' }; } };
  for (let x = 1; x <= 100; x++) tool.onMove({ x, y: 0 });
  assert.equal(count, 0); tool.flushMotion(); assert.equal(count, 1); near(tool.dist, 100);
  assert.equal(scene(doc), canonical, 'la vista previa no escribe el documento canónico');
  tool.cancel(); assert.equal(doc.model.faces.size, 1);
});

test('extrusión aislada actualiza vértices sin repetir topología en cada avance', () => {
  const doc = new D.Document(), fid = rectangle(doc), { tool } = pushTool(doc, fid);
  const m = doc.model, exact = m.pushPull; let calls = 0;
  m.pushPull = function (...args) { calls++; return exact.apply(this, args); };
  for (let i = 1; i <= 30; i++) tool.apply(i / 10);
  assert.equal(calls, 1); near(volume(doc), 60); assert.deepEqual(doc.model.validate(), []);
  tool.apply(-2); near(volume(doc), 40); assert.equal(calls, 2);
  assert.ok(doc.model.bbox().max[2] < 1e-6); assert.deepEqual(doc.model.validate(), []);
  tool.apply(0); assert.equal(doc.model.faces.size, 1);
  tool.apply(1); near(volume(doc), 20); tool.cancel();
});

test('estirar avanza y retrocede, conserva geometría canónica y se confirma en un undo', () => {
  const doc = new D.Document(), fid = box(doc), original = scene(doc), history = doc.undoStack.length, { tool } = pushTool(doc, fid);
  assert.equal(tool.fast.mode, 'stretch'); tool.apply(2); near(volume(doc), 100);
  tool.apply(-1); near(volume(doc), 40); assert.equal(scene(doc), original);
  tool.commit(-1); near(volume(doc), 40); assert.equal(doc.undoStack.length, history + 1);
  doc.undo(); near(volume(doc), 60); doc.redo(); near(volume(doc), 40);
});

test('la vista rápida conserva el bloqueo de atravesar la cara opuesta', () => {
  const doc = new D.Document(), fid = box(doc), { tool } = pushTool(doc, fid);
  tool.apply(1); near(volume(doc), 80); tool.apply(-3); assert.ok(tool.blocked); near(volume(doc), 60);
  tool.apply(-2); assert.equal(tool.blocked, null); near(volume(doc), 20); tool.cancel(); near(volume(doc), 60);
});

test('vista casi paralela al eje usa desplazamiento continuo con signo en ambos sentidos', () => {
  const doc = new D.Document(), fid = rectangle(doc), app = appFor(doc), tool = new D.tools.PushPullTool(app);
  app.camera.setView('top'); app.inference.picker.faceAt = () => ({ fid, p: [2, 2, 0] });
  const s = app.camera.project([2, 2, 0]); tool.activate(); tool.onDown({ ...s, button: 0 });
  tool.snapInference = { infer: () => ({ p: [0, 0, 0], type: 'endpoint' }) };
  assert.equal(tool.axisDrag, false); tool.onMove({ x: s.x, y: s.y - 40 }); tool.flushMotion(); assert.ok(tool.dist > 0);
  const distance = tool.dist; tool.onMove({ x: s.x, y: s.y + 40 }); tool.flushMotion(); near(tool.dist, -distance); tool.cancel();
});

test('snaps usan el modelo inicial y no la tapa que se está arrastrando', () => {
  const doc = new D.Document(), fid = rectangle(doc), { tool } = pushTool(doc, fid);
  assert.notEqual(tool.snapInference.model, doc.model); tool.apply(2);
  assert.equal(tool.snapInference.model.faces.size, 1); assert.equal(doc.model.faces.size, 6); tool.cancel();
});

test('distancia negativa escrita no se invierte y positivo explícito invierte el gesto', () => {
  for (const [text, expected] of [['-1m', -1], ['+1m', 1], ['1m', -1]]) {
    const doc = new D.Document(), fid = box(doc), { tool } = pushTool(doc, fid);
    tool.apply(-0.5); assert.equal(tool.onVCB(text), true); near(volume(doc), 20 * (3 + expected));
  }
});

test('cajeados y huecos pasantes conservan el camino geométrico exacto', () => {
  for (const [d, expectedFaces, expectedVolume] of [[-1, 11, 54], [-3, 10, 42]]) {
    const doc = new D.Document(); box(doc);
    cmd(doc, 'draw.line', { points: [[1, 1, 3], [4, 1, 3], [4, 3, 3], [1, 3, 3]], closed: true });
    const fid = [...doc.model.faces.values()].find(f => f.n[2] > 0.999 && doc.model.pointInFace(f, [2.5, 2, 3]) > 0).id;
    const { tool } = pushTool(doc, fid, [2.5, 2, 3]); assert.equal(tool.fast, null);
    tool.apply(d); assert.equal(doc.model.faces.size, expectedFaces); near(volume(doc), expectedVolume);
    assert.deepEqual(doc.model.validate(), []); tool.commit(d); near(volume(doc), expectedVolume);
    doc.undo(); near(volume(doc), 60);
  }
});

test('Ctrl pulsado antes del inicio copia un grupo y conserva su definición', () => {
  const doc = new D.Document(); box(doc);
  const r = cmd(doc, 'group.create', { name: 'Grupo', faces: [...doc.model.faces.keys()] }), id = r.node.id || r.node;
  doc.select({ nodes: [id] }); const { tool } = moveTool(doc, true);
  tool.onDown({ x: 8, y: 0, button: 0, ctrl: true });
  const nodes = doc.scene.current([]).nodes; assert.equal(nodes.length, 2); assert.equal(nodes[0].kind, 'group'); assert.equal(nodes[1].kind, 'group');
  assert.notEqual(nodes[0].definitionId, nodes[1].definitionId, 'los grupos copiados conservan definiciones independientes');
  near(doc.model.bbox().max[0], 13); doc.undo(); assert.equal(doc.scene.current([]).nodes.length, 1);
});

test('Ctrl pulsado durante mover y soltado vuelve al movimiento sin copia pegada', () => {
  const doc = new D.Document(), fid = rectangle(doc); doc.select({ faces: [fid] });
  const { tool } = moveTool(doc, false); tool.onMove({ x: 8, y: 0, ctrl: false }); tool.flushMotion();
  tool.onKey({ key: 'Control' }); assert.equal(tool.copy, true); assert.equal(doc.model.faces.size, 2);
  tool.onKey({ key: 'Control' }); assert.equal(tool.copy, true, 'repetir keydown no alterna');
  tool.onKeyUp({ key: 'Control', ctrl: false }); assert.equal(tool.copy, false); assert.equal(doc.model.faces.size, 1);
  tool.onDown({ x: 8, y: 0, button: 0, ctrl: false }); assert.equal(doc.model.faces.size, 1); near(doc.model.bbox().min[0], 8);
});

test('copia de componentes y serie mantienen instancias y una definición compartida', () => {
  const doc = new D.Document(); box(doc);
  const r = cmd(doc, 'component.create', { name: 'Módulo', faces: [...doc.model.faces.keys()] }), id = r.node.id || r.node;
  doc.select({ nodes: [id] }); const { tool } = moveTool(doc, true);
  tool.onDown({ x: 8, y: 0, button: 0, ctrl: true }); assert.equal(tool.onVCB('x3'), true);
  const nodes = doc.scene.current([]).nodes; assert.equal(nodes.length, 4); assert.ok(nodes[0].definitionId); assert.ok(nodes.every(n => n.definitionId === nodes[0].definitionId));
  near(doc.model.bbox().max[0], 29); doc.undo(); assert.equal(doc.scene.current([]).nodes.length, 1);
});

test('cancelar una copia con movimiento pendiente no modifica objetos ni historial', () => {
  const doc = new D.Document(), fid = rectangle(doc); doc.select({ faces: [fid] }); const canonical = scene(doc), n = doc.undoStack.length;
  const { tool } = moveTool(doc, true); tool.onMove({ x: 8, y: 0, ctrl: true }); tool.cancel(); tool.flushMotion();
  assert.equal(scene(doc), canonical); assert.equal(doc.model.faces.size, 1); assert.equal(doc.undoStack.length, n);
});

console.log('\n' + passed + ' pruebas superadas; ' + failed + ' fallidas.');
if (failed) process.exitCode = 1;
