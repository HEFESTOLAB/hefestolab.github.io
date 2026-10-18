/* Pure integration contracts: App prototype + inert renderer/overlay doubles. */
'use strict';
const assert = require('node:assert/strict');
const path = require('node:path');
const JS = path.join(__dirname, '..', 'app', 'js');
for (const file of ['core/geom', 'core/model', 'core/document', 'core/scene', 'core/hierarchy', 'core/organic', 'tools/base', 'tools/draw', 'tools/modify', 'tools/organic-tools']) require(path.join(JS, file + '.js'));
const D = globalThis.DEDALO;
// Loading the class registers a callback only. Do not construct the DOM app.
globalThis.window = { DEDALO: D, addEventListener() {} };
require(path.join(JS, 'app.js'));
delete globalThis.window;
let passed = 0, failed = 0;
function test(name, fn) { try { fn(); passed++; console.log('  ok   ' + name); } catch (e) { failed++; console.error('  FALLA ' + name + '\n' + e.stack); } }
function near(a, b) { assert.ok(Number.isFinite(a) && Math.abs(a - b) < 1e-7, a + ' != ' + b); }
function cmd(doc, command, params) { const r = doc.execute(command, params || {}); assert.ok(r.ok, r.error); return r; }
function scene(doc) { return JSON.stringify(doc.scene.toJSON()); }

function withScheduler(fn) {
  const saved = Object.fromEntries(['requestAnimationFrame', 'cancelAnimationFrame', 'setTimeout', 'clearTimeout'].map(k => [k, globalThis[k]]));
  const frames = new Map(), timers = new Map(); let id = 0, requested = 0;
  globalThis.requestAnimationFrame = callback => { const key = ++id; requested++; frames.set(key, callback); return key; };
  globalThis.cancelAnimationFrame = key => frames.delete(key);
  globalThis.setTimeout = callback => { const key = ++id; timers.set(key, callback); return key; };
  globalThis.clearTimeout = key => timers.delete(key);
  try { fn({ frames, timers, count: () => requested, frame() { const [key, run] = frames.entries().next().value; frames.delete(key); run(); } }); }
  finally { for (const [key, value] of Object.entries(saved)) if (value === undefined) delete globalThis[key]; else globalThis[key] = value; }
}

function sculptFixture(shared) {
  const doc = new D.Document();
  const group = cmd(doc, 'mesh.patch', { origin: [0, 0, 0], width: 4, depth: 4, bulge: 0, segments: 4 });
  let original = group, instance = null;
  if (shared) {
    original = cmd(doc, 'component.create', { nodes: [group.node], name: 'Paño compartido' });
    instance = cmd(doc, 'component.instantiate', { definitionId: original.definitionId, matrix: D.SceneMath.translation([8, 0, 0]) });
  }
  cmd(doc, 'context.enter', { node: original.node });
  const model = doc.model, point = [2, 2, 0];
  const fid = [...model.faces.values()].find(f => model.pointInFace(f, point) >= 0).id;
  const centerId = model.findVertex(point); assert.notEqual(centerId, null);
  const app = { doc, organicSettings: { radius: 2 }, camera: { pixelSize: () => 0.01 },
    inference: { picker: { faceAt: () => ({ fid, p: point.slice() }) } }, requestRender() {},
    setVCB(value) { this.vcb = value; }, toast(message, kind) { this.lastToast = { message, kind }; } };
  const tool = new D.tools.SculptTool(app); tool.activate();
  tool.onDown({ x: 0, y: 100, button: 0 }); assert.equal(tool.state, 1);
  return { doc, app, tool, centerId, original, instance };
}

console.log('\nDédalo — integración de movimiento sin DOM, lienzo ni render real\n');

test('renderNow drena la última muestra antes de leer rev y construir caras', () => withScheduler(scheduler => {
  const log = [], model = { _revision: 1, get rev() { log.push('read:' + this._revision); return this._revision; } };
  const app = Object.create(D.App.prototype);
  Object.assign(app, { doc: { model, sel: {} }, selVersion: 0, camera: {},
    renderer: { opts: {}, buildFaces(m) { log.push('faces:' + m._revision); }, modelLines(m) { log.push('lines:' + m._revision); }, render() { log.push('render'); } },
    overlay: { clear() {}, drawAnnotations() {} } });
  app.tool = { hover() { return null; }, drawOverlay() {}, motion: new D.LatestMotion(app, ev => { log.push('motion:' + ev.x); model._revision = ev.x; app.requestRender(); }) };
  app.tool.flushMotion = D.Tool.prototype.flushMotion;
  for (let x = 2; x <= 101; x++) app.tool.motion.queue({ x });
  assert.equal(scheduler.count(), 1); scheduler.frame();
  assert.equal(log[0], 'motion:101'); assert.equal(log[1], 'read:101'); assert.ok(log.includes('faces:101')); assert.ok(log.includes('lines:101'));
  assert.equal(scheduler.count(), 1, 'el requestRender de la vista previa no agenda otro frame'); assert.equal(scheduler.frames.size, 0);
  app.renderNow(); assert.equal(log.filter(s => s.startsWith('faces:')).length, 1, 'sin cambios no reconstruye caras');
  assert.equal(app._rendering, false);
}));

test('renderNow libera su guardia después de un fallo y puede volver a renderizar', () => {
  const app = Object.create(D.App.prototype); app.tool = { flushMotion() { throw new Error('controlado'); } };
  assert.throws(() => app.renderNow(), /controlado/); assert.equal(app._rendering, false);
});

test('keyup reenvía Control soltado y Meta pulsado sin perder modificadores', () => {
  const app = Object.create(D.App.prototype), events = []; let refreshed = 0;
  app.tool = { onKeyUp(e) { events.push(e); return true; } }; app.afterInput = () => refreshed++;
  app.onKeyUp({ key: 'Control', ctrlKey: false, metaKey: false, shiftKey: false, altKey: false });
  assert.deepEqual(events[0], { key: 'Control', ctrl: false, shift: false, alt: false });
  app.onKeyUp({ key: 'Control', ctrlKey: false, metaKey: true, shiftKey: true, altKey: true });
  assert.deepEqual(events[1], { key: 'Control', ctrl: true, shift: true, alt: true });
  app.onKeyUp({ key: 'Meta', ctrlKey: false, metaKey: false }); assert.equal(events[2].ctrl, false); assert.equal(refreshed, 3);
});

test('Tab llega a la herramienta de cota y solo impide el foco cuando la herramienta lo usa', () => {
  const app = Object.create(D.App.prototype), keys = []; let prevented = 0, refreshed = 0;
  app.tool = { onKey(e) { keys.push(e.key); return true; } }; app.afterInput = () => refreshed++;
  app.keyDown({ key: 'Tab', ctrl: false, shift: false, prevent: () => prevented++ });
  assert.deepEqual(keys, ['Tab']); assert.equal(prevented, 1); assert.equal(refreshed, 1);
  app.tool.onKey = () => false;
  app.keyDown({ key: 'Tab', ctrl: false, shift: false, prevent: () => prevented++ });
  assert.equal(prevented, 1); assert.equal(refreshed, 1);
});

test('la entrada VCB permite comenzar por + y envía el signo explícito completo', () => {
  const app = Object.create(D.App.prototype); app.vcbBuf = ''; app.showVCB = () => {}; let submitted;
  app.submitVCB = value => { submitted = value; };
  for (const key of ['+', '1', 'm', 'Enter']) app.keyDown({ key, ctrl: false, alt: false });
  assert.equal(submitted, '+1m');
});

test('SculptTool coalesce y onUp confirma el destino final en un único comando', () => {
  const { doc, tool, centerId } = sculptFixture(false), before = scene(doc), history = doc.undoStack.length;
  let applied = 0; const apply = tool.applyEvent; tool.applyEvent = function (ev) { applied++; return apply.call(this, ev); };
  for (let y = 99; y >= 80; y--) tool.onMove({ x: 0, y, button: 0 });
  assert.equal(applied, 0); tool.flushMotion(); assert.equal(applied, 1); near(doc.model.P(centerId)[2], 0.2);
  assert.equal(scene(doc), before, 'la vista previa deja intacta la escena canónica');
  tool.onUp({ x: 0, y: 70, button: 0 }); assert.equal(applied, 2); assert.equal(tool.state, 0);
  near(doc.model.P(centerId)[2], 0.3); assert.equal(doc.undoStack.length, history + 1); assert.deepEqual(doc.scene.validate(), []);
  doc.undo(); assert.equal(scene(doc), before); doc.redo(); near(doc.model.P(centerId)[2], 0.3);
});

test('cancelar SculptTool descarta la última muestra y revierte la vista previa', () => {
  const { doc, tool, centerId } = sculptFixture(false), before = scene(doc), history = doc.undoStack.length;
  tool.onMove({ x: 0, y: 80 }); tool.flushMotion(); near(doc.model.P(centerId)[2], 0.2);
  tool.onMove({ x: 0, y: 60 }); tool.cancel(); tool.flushMotion(); tool.onUp({ x: 0, y: 50, button: 0 });
  near(doc.model.P(centerId)[2], 0); assert.equal(scene(doc), before); assert.equal(doc.undoStack.length, history);
});

test('SculptTool confirma sobre la definición compartida de ambas instancias', () => {
  const { doc, tool, original, instance } = sculptFixture(true), before = scene(doc);
  tool.onMove({ x: 0, y: 80 }); tool.flushMotion(); assert.equal(scene(doc), before);
  const a = doc.scene.node([], original.node), b = doc.scene.node([], instance.node); assert.equal(a.definitionId, b.definitionId);
  tool.onUp({ x: 0, y: 70, button: 0 });
  const definition = doc.scene.definitions.get(a.definitionId).model, centerId = definition.findVertex([2, 2, 0.3]); assert.notEqual(centerId, null);
  cmd(doc, 'context.exit'); const world = doc.worldModel();
  assert.notEqual(world.findVertex([2, 2, 0.3]), null); assert.notEqual(world.findVertex([10, 2, 0.3]), null);
  assert.deepEqual(doc.scene.validate(), []);
});

console.log('\n' + passed + ' pruebas superadas; ' + failed + ' fallidas.');
if (failed) process.exitCode = 1;
