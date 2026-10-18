/* Busy-window contracts with real documents and inert App/MCP doubles. No UI or sockets. */
'use strict';
const assert = require('node:assert/strict'), path = require('node:path');
const JS = path.join(__dirname, '..', 'app', 'js');
for (const file of ['core/geom', 'core/dimensions', 'core/model', 'core/document', 'core/scene', 'core/hierarchy', 'io/mcp-bridge']) require(path.join(JS, file + '.js'));
const D = globalThis.DEDALO;
globalThis.window = { DEDALO: D, addEventListener() {} };
require(path.join(JS, 'app.js'));
delete globalThis.window;
let passed = 0, failed = 0;
function test(name, run) { try { run(); passed++; console.log('  ok   ' + name); } catch (error) { failed++; console.error('  FALLA ' + name + '\n' + error.stack); } }
function stable(doc) { return JSON.stringify({ scene: doc.scene.toJSON(), selection: doc.selectionItems(), history: doc.undoStack.length, version: doc.projectVersion }); }
function fixture() {
  const app = Object.create(D.App.prototype), activity = [];
  Object.assign(app, { doc: new D.Document(), territoryBusy: false, tools: {}, navDrag: null,
    tool: { state: 0, id: 'select', cancel() { activity.push('cancel'); }, onDown() { activity.push('down'); }, onDouble() { activity.push('double'); },
      onMove() { activity.push('move'); }, onUp() { activity.push('up'); }, cursor() { activity.push('cursor'); return 'default'; }, onKey() { activity.push('key'); return true; }, onKeyUp() { activity.push('keyup'); return true; } },
    el: { ov: { style: {} } }, ui: { refreshStatus() { activity.push('status'); } }, camera: { zoomAt() { activity.push('zoom'); } },
    afterInput() { activity.push('input'); }, snapshot() { activity.push('snapshot'); return 'data:image/png;base64,TEST'; },
    requestRender() { activity.push('render'); }, evt(e) { activity.push('evt'); return { x: 0, y: 0 }; }, pivotAt() { return [0, 0, 0]; },
    undo() { activity.push('undo'); }, redo() { activity.push('redo'); }, newModel() { activity.push('new'); }, setTool() { activity.push('tool'); },
    files: { save() { activity.push('save'); }, open() { activity.push('open'); } }, toast() { activity.push('toast'); } });
  const bridge = new D.MCPBridge(app); bridge.token = 't'.repeat(48); bridge.sessionId = 'cpu-test'; bridge.permissions = { write: true, snapshot: true };
  app.mcpBridge = bridge;
  return { app, bridge, activity };
}
const rectangle = { origin: [0, 0, 0], width: 2, height: 1 };
function request(f, command) { return { id: 'busy-window-command', action: 'execute', payload: { command, params: rectangle, projectId: f.app.doc.projectId, expectedRevision: f.bridge.revision } }; }

console.log('\nDédalo — ventana de trabajo territorial, CPU\n');

test('la espera de pintado bloquea teclado, puntero y rueda sin cambiar selección, herramientas ni cámara', () => {
  const f = fixture(), { app, activity } = f; let prevented = 0; app.territoryBusy = true;
  const before = stable(app.doc);
  for (const [key, ctrl] of [['z', true], ['s', true], ['o', true], ['n', true], ['Delete', false], ['Escape', false], ['Tab', false], [' ', false]])
    app.keyDown({ key, ctrl, prevent() { prevented++; } });
  app.onKeyUp({ key: 'Control', ctrlKey: false, metaKey: false });
  app.pointerDown({ button: 0, x: 10, y: 20 }); app.pointerMove({ button: 0, x: 12, y: 25 }); app.pointerUp({ button: 0, x: 12, y: 25 });
  app.onWheel({ deltaY: 100, deltaMode: 0, preventDefault() { prevented++; } });
  assert.deepEqual(activity, []); assert.equal(prevented, 9); assert.equal(app.mouse, undefined); assert.equal(app._lastDown, undefined);
  assert.equal(stable(app.doc), before); assert.equal(app.doc._busy, false);
});

test('MCP anuncia ocupación y rechaza cambios y capturas; estado de solo lectura sigue consultable', () => {
  const f = fixture(); f.app.territoryBusy = true; const before = stable(f.app.doc);
  assert.equal(f.bridge.state().busy, true); assert.equal(f.bridge.handle(request(f, 'draw.rectangle')).code, 'USER_BUSY');
  assert.equal(f.bridge.handle({ id: 'snapshot', action: 'read', payload: { query: 'snapshot' } }).ok, false);
  const status = f.bridge.handle({ id: 'status', action: 'read', payload: { query: 'status' } }); assert.equal(status.ok, true); assert.equal(status.result.busy, true);
  assert.equal(stable(f.app.doc), before); assert.deepEqual(f.activity, []);
  f.app.territoryBusy = false; assert.equal(f.bridge.state().busy, false); assert.equal(f.bridge.handle(request(f, 'draw.rectangle')).ok, true);
  assert.equal(f.app.doc.model.faces.size, 1); assert.equal(f.app.doc.undoStack.length, 1);
});

test('el comando interno conserva transacción, proyección y un único undo durante la ventana CPU', () => {
  const f = fixture(); f.app.territoryBusy = true;
  const result = D.App.prototype.exec.call(f.app, 'draw.rectangle', rectangle, true);
  assert.equal(result.ok, true); assert.equal(f.app.doc._busy, false); assert.equal(f.app.doc.model.faces.size, 1); assert.equal(f.app.doc.undoStack.length, 1);
  assert.ok(f.app.doc.undo()); assert.equal(f.app.doc.model.faces.size, 0); assert.equal(f.app.doc._busy, false);
});

test('al liberar la ocupación vuelven las entradas normales sin quedarse una guardia enganchada', () => {
  const f = fixture(); f.app.territoryBusy = true; f.app.pointerMove({ x: 1, y: 1 }); assert.deepEqual(f.activity, []);
  f.app.territoryBusy = false; f.app.pointerMove({ x: 2, y: 3 }); f.app.onKeyUp({ key: 'Control', ctrlKey: false });
  assert.deepEqual(f.app.mouse, { x: 2, y: 3 }); assert.ok(f.activity.includes('move')); assert.ok(f.activity.includes('keyup')); assert.ok(f.activity.includes('input'));
});

console.log('\n' + passed + ' correctas; ' + failed + ' fallidas.');
if (failed) process.exitCode = 1;
