/* MCP browser bridge over in-memory HTTP doubles. No sockets, UI or renderer. */
'use strict';
const assert = require('node:assert/strict'), path = require('node:path');
const JS = path.join(__dirname, '..', 'app', 'js');
for (const file of ['core/geom', 'core/dimensions', 'core/model', 'core/document', 'core/scene', 'core/hierarchy', 'core/organic', 'io/mcp-bridge']) require(path.join(JS, file + '.js'));
const D = globalThis.DEDALO; D.VERSION = '0.4.0';
const cases = []; let passed = 0, failed = 0;
function test(name, run) { cases.push({ name, run }); }
function cmd(doc, name, params) { const r = doc.execute(name, params || {}); assert.ok(r.ok, r.error); return r; }
function stable(doc) { return JSON.stringify({ scene: doc.scene.toJSON(), selection: doc.selectionItems(), history: doc.undoStack.length, version: doc.projectVersion }); }
async function settle(check) { for (let i = 0; i < 100; i++) { if (!check || check()) return; await Promise.resolve(); } assert.ok(check(), 'las promesas de transporte completan sin esperas reales'); }
function fixture(options) {
  const doc = new D.Document(), executions = [], posts = [], requests = [], timers = new Map(); let timerId = 0, snapshotCalls = 0;
  const transport = { failResult: false, invalidPair: false, pollWaiter: null, pollDeferred: false };
  const app = { doc, tool: { state: 0 }, tools: { move: { lastCopy: { previous: true } } },
    snapshot() { snapshotCalls++; return 'data:image/png;base64,TEST'; },
    exec(name, params, silent) {
      executions.push({ name, params, silent, execution: doc.execution && { ...doc.execution } });
      if (name === 'edit.undo') return { ok: doc.undo() };
      if (name === 'edit.redo') return { ok: doc.redo() };
      return doc.execute(name, params);
    } };
  const fetch = async (url, init) => {
    const route = url.split('/v1/')[1], body = JSON.parse(init.body); posts.push({ url, route, body, init });
    let value;
    if (route === 'pair') value = transport.invalidPair ? { ok: true, token: 'short', sessionId: 's' } : { ok: true, token: 't'.repeat(48), sessionId: 'memory-session' };
    else if (route === 'poll') {
      if (transport.pollDeferred) value = await new Promise((resolve, reject) => { transport.pollWaiter = resolve; init.signal.addEventListener('abort', () => reject(new Error('ABORTED')), { once: true }); });
      else value = { ok: true, request: requests.shift() || null };
    } else if (route === 'result') {
      if (transport.failResult) throw new Error('Resultado perdido'); value = { ok: true };
    } else if (route === 'disconnect') value = { ok: true };
    else throw new Error('Ruta inesperada: ' + route);
    return { ok: true, status: 200, text: async () => JSON.stringify(value) };
  };
  const bridge = new D.MCPBridge(app, { fetch, setTimeout(fn, delay) { const id = ++timerId; timers.set(id, { fn, delay }); return id; }, clearTimeout(id) { timers.delete(id); } });
  const api = { doc, app, bridge, posts, requests, timers, executions, transport, snapshots: () => snapshotCalls,
    async connect(config) { await bridge.connect(Object.assign({ code: 'PAIR-123', write: true, snapshot: false }, config || options || {})); },
    execute(command, params, extra) { return { id: 'request-' + posts.length, action: 'execute', payload: Object.assign({ projectId: doc.projectId, expectedRevision: bridge.revision, command, params: params || {} }, extra || {}) }; },
    read(query) { return { id: 'read-' + query, action: 'read', payload: { query } }; },
    async poll(request) {
      requests.push(request);
      const timer = [...timers.entries()].find(([, value]) => value.delay < 30000);
      assert.ok(timer, 'poll se agenda explícitamente'); timers.delete(timer[0]); timer[1].fn();
      await settle(() => bridge.inflight.size === 0 && (bridge.timer !== null || !bridge.token));
    } };
  return api;
}

test('pair → poll → comando geométrico → result usa permiso y autenticación de sesión', async () => {
  const f = fixture(), previousExecution = { ...f.doc.execution }; await f.connect(); assert.equal(f.bridge.status().connected, true);
  const pair = f.posts[0]; assert.equal(pair.route, 'pair'); assert.equal(pair.body.code, 'PAIR-123'); assert.deepEqual(pair.body.permissions, { write: true, snapshot: false });
  await f.poll(f.execute('draw.rectangle', { origin: [0, 0, 0], width: 2, height: 1 }));
  assert.equal(f.doc.model.faces.size, 1); assert.equal(f.executions.length, 1); assert.equal(f.executions[0].silent, true); assert.deepEqual(f.executions[0].execution, { agent: 'mcp-local', channel: 'mcp' });
  assert.equal(f.app.tools.move.lastCopy, null); assert.deepEqual(f.doc.execution, previousExecution);
  const result = f.posts.find(p => p.route === 'result'); assert.equal(result.body.result.ok, true); assert.equal(result.body.sessionId, 'memory-session'); assert.equal(result.body.token.length, 48);
  assert.equal(result.init.credentials, 'omit'); assert.equal(result.init.redirect, 'error'); assert.equal([...f.timers.values()].filter(t => t.delay === 300).length, 1);
});

test('selección y undo invalidan expectedRevision; cargar cierra sesión y requiere reconectar', async () => {
  const f = fixture(); await f.connect(); cmd(f.doc, 'draw.rectangle', { origin: [0, 0, 0], width: 2, height: 1 });
  const beforeSelection = f.execute('entities.move', { vector: [1, 0, 0] }); f.doc.select({ faces: [...f.doc.model.faces.keys()] });
  assert.equal(f.bridge.handle(beforeSelection).code, 'STALE_STATE');
  const beforeUndo = f.execute('draw.rectangle', { origin: [5, 0, 0], width: 1, height: 1 }); f.doc.undo(); assert.equal(f.bridge.handle(beforeUndo).code, 'STALE_STATE');
  const beforeLoad = f.execute('draw.rectangle', { origin: [5, 0, 0], width: 1, height: 1 }), file = JSON.parse(JSON.stringify(f.doc.fileJSON()));
  f.doc.loadJSON(file); assert.equal(f.bridge.token, null); assert.match(f.bridge.handle(beforeLoad).error, /no está conectado/);
  await settle(() => f.bridge.inflight.size === 0); await f.connect(); assert.equal(f.bridge.handle(beforeLoad).code, 'STALE_STATE'); assert.equal(f.executions.length, 0);
});

test('solo lectura permite consultas y exige permiso específico para capturas', async () => {
  const f = fixture(); await f.connect({ write: false, snapshot: false });
  assert.equal(f.bridge.handle(f.read('project')).ok, true); assert.equal(f.bridge.handle(f.read('selection')).ok, true);
  assert.match(f.bridge.handle(f.execute('draw.rectangle', { origin: [0, 0, 0], width: 1, height: 1 })).error, /solo lectura/);
  assert.match(f.bridge.handle(f.read('snapshot')).error, /no está autorizada/); assert.equal(f.snapshots(), 0);
  const commandList = f.bridge.handle(f.read('commands')).result; assert.ok(commandList.some(c => c.name === 'draw.rectangle')); assert.ok(commandList.every(c => D.MCP_ALLOWED_COMMANDS.includes(c.name)));
  await f.connect({ write: false, snapshot: true }); const snapshot = f.bridge.handle(f.read('snapshot')); assert.equal(snapshot.ok, true); assert.equal(f.snapshots(), 1); assert.match(snapshot.result.png, /^data:image\/png/);
});

test('gesto activo, navegación o transacción bloquean cambios y capturas', async () => {
  const f = fixture(); await f.connect({ write: true, snapshot: true });
  for (const busy of ['tool', 'navigation', 'transaction']) {
    f.app.tool.state = busy === 'tool' ? 1 : 0; f.app.navDrag = busy === 'navigation' ? {} : null; f.doc._busy = busy === 'transaction';
    assert.equal(f.bridge.handle(f.execute('draw.rectangle', { origin: [0, 0, 0], width: 1, height: 1 })).code, 'USER_BUSY'); assert.equal(f.bridge.handle(f.read('snapshot')).ok, false);
  }
  f.doc._busy = false; f.app.navDrag = null; f.app.tool.state = 0; assert.equal(f.snapshots(), 0); assert.equal(f.executions.length, 0);
});

test('allowlist y JSON finito bloquean eval, carga/nuevo, prototipos, NaN y peticiones enormes', async () => {
  const f = fixture(); await f.connect(); const before = stable(f.doc);
  for (const name of ['eval', 'window.eval', 'project.load', 'model.load', 'file.open', 'file.new', 'project.new']) assert.equal(f.bridge.handle(f.execute(name, {})).ok, false, name);
  for (const params of [{ value: NaN }, { value: Infinity }, { value: () => 'forbidden' }, JSON.parse('{"__proto__":{"polluted":true}}'), { nested: { constructor: 'forbidden' } }, { value: Object.create({ inherited: true }) }, { huge: 'x'.repeat(1024 * 1024) }]) assert.equal(f.bridge.handle(f.execute('draw.rectangle', params)).ok, false);
  assert.equal({}.polluted, undefined); assert.equal(stable(f.doc), before); assert.equal(f.executions.length, 0);
});

test('lotes se validan completos: ni anidación ni comandos no deshacibles ni más de100', async () => {
  const f = fixture(); await f.connect(); const before = stable(f.doc), rectangle = { command: 'draw.rectangle', params: { origin: [0, 0, 0], width: 1, height: 1 } };
  for (const commands of [[], [rectangle, { command: 'transaction.batch', params: { commands: [rectangle] } }], [rectangle, { command: 'context.exit' }], Array.from({ length: 101 }, () => rectangle), [rectangle, { command: 'file.open' }]]) assert.equal(f.bridge.handle(f.execute('transaction.batch', { commands })).ok, false);
  assert.equal(stable(f.doc), before); assert.equal(f.executions.length, 0);
  const result = f.bridge.handle(f.execute('transaction.batch', { commands: [rectangle, { ...rectangle, params: { origin: [3, 0, 0], width: 1, height: 1 } }] }));
  assert.equal(result.ok, true); assert.equal(f.doc.model.faces.size, 2); assert.equal(f.doc.undoStack.length, 1); f.doc.undo(); assert.equal(f.doc.model.faces.size, 0);
});

test('petición repetida por ID devuelve el resultado guardado sin doble ejecución', async () => {
  const f = fixture(); await f.connect(); const request = f.execute('draw.rectangle', { origin: [0, 0, 0], width: 2, height: 1 }); request.id = 'same-request';
  await f.poll(request); await f.poll(request); const results = f.posts.filter(p => p.route === 'result');
  assert.equal(f.executions.length, 1); assert.equal(f.doc.undoStack.length, 1); assert.equal(results.length, 2); assert.deepEqual(results[0].body.result, results[1].body.result);
});

test('respuesta perdida conserva sesión y reenvía solo el resultado sin repetir el comando', async () => {
  const f = fixture(); await f.connect(); f.transport.failResult = true;
  await f.poll(f.execute('draw.rectangle', { origin: [0, 0, 0], width: 2, height: 1 }));
  assert.equal(f.doc.model.faces.size, 1); assert.equal(f.executions.length, 1); assert.ok(f.bridge.token); assert.match(f.bridge.error, /Recuperando/); assert.ok(f.bridge.pendingResult);
  const posts = f.posts.length; await f.bridge.poll(f.bridge.generation - 1); assert.equal(f.posts.length, posts);
  f.transport.failResult = false; await f.poll(null);
  const replies = f.posts.filter(p => p.route === 'result'); assert.equal(replies.length, 2); assert.deepEqual(replies[0].body, replies[1].body);
  assert.equal(f.executions.length, 1); assert.equal(f.bridge.pendingResult, null); assert.equal(f.bridge.status().recovering, false); assert.deepEqual(f.bridge.permissions, { write: true, snapshot: false });
});

test('lecturas de más de4MiB se paginan sin perder geometría, IDs ni revisión', async () => {
  const f = fixture(); await f.connect();
  const expected = { projectId: f.doc.projectId, geometry: Array.from({ length: 70000 }, (_, i) => ({ id: 'pieza-' + i, name: '木造 pagoda ' + i, points: [i, i + 1, i + 2] })) };
  f.bridge.projectRead = () => expected;
  const first = f.bridge.handle(f.read('project')); assert.equal(first.ok, true); assert.equal(first.result.format, 'json-fragment');
  let combined = first.result.json, offset = first.result.nextOffset, count = 1;
  while (offset !== null) {
    const page = f.bridge.handle({ id: 'page-' + offset, action: 'read', payload: { query: 'project', offset, expectedRevision: first.revision } });
    assert.equal(page.ok, true); assert.ok(page.result.json.length <= 65536); combined += page.result.json; offset = page.result.nextOffset; count++;
  }
  assert.ok(count > 60); assert.deepEqual(JSON.parse(combined), expected);
  f.bridge.revision++;
  const stale = f.bridge.handle({ id: 'stale', action: 'read', payload: { query: 'project', offset: 1, expectedRevision: first.revision } });
  assert.equal(stale.ok, false); assert.equal(stale.result.code, 'STALE_STATE');
  for (const payload of [{ offset: -1 }, { limit: 1e9 }, { offset: 1.5 }]) assert.equal(f.bridge.handle({ id: 'invalid', action: 'read', payload: { query: 'project', ...payload } }).ok, false);
  assert.ok(f.bridge.token);
});

test('project comparte la escena canónica y definition evita expandir instancias', async () => {
  const f = fixture(); await f.connect(); cmd(f.doc, 'draw.rectangle', { origin: [0, 0, 0], width: 2, height: 1 });
  const scene = f.doc.scene.toJSON(); f.doc.fileJSON = () => { throw new Error('No debe expandir la proyección heredada'); };
  const project = f.bridge.handle(f.read('project')); assert.equal(project.ok, true); assert.equal(project.result.representation, 'canonical-scene'); assert.deepEqual(project.result.scene, scene); assert.equal(project.result.model, undefined);
  const id = f.doc.scene.rootId;
  const definition = f.bridge.handle({ id: 'definition', action: 'read', payload: { query: 'definition', definitionId: id } });
  assert.equal(definition.ok, true); assert.equal(definition.result.id, id); assert.equal(definition.result.model.faces.length, 1); assert.equal(definition.result.coordinates, 'definition-local');
});

test('desconectar aborta poll en vuelo y una respuesta tardía no ejecuta nada', async () => {
  const f = fixture(); await f.connect(); f.transport.pollDeferred = true;
  const timer = [...f.timers.entries()].find(([, value]) => value.delay === 0); f.timers.delete(timer[0]); timer[1].fn(); await settle(() => !!f.transport.pollWaiter);
  const request = f.execute('draw.rectangle', { origin: [0, 0, 0], width: 2, height: 1 }); await f.bridge.disconnect();
  f.transport.pollWaiter({ ok: true, request }); await settle(() => f.bridge.inflight.size === 0);
  assert.equal(f.executions.length, 0); assert.equal(f.doc.model.faces.size, 0); assert.equal(f.bridge.token, null); assert.equal(f.timers.size, 0);
});

test('par y puerto inválidos fallan sin poll ni estado conectado', async () => {
  const f = fixture(); await assert.rejects(f.bridge.connect({ code: 'x', port: 43127 }), /código/); await assert.rejects(f.bridge.connect({ code: 'PAIR-123', port: 80 }), /Puerto/); assert.equal(f.posts.length, 0);
  f.transport.invalidPair = true; await assert.rejects(f.connect(), /Emparejamiento/); assert.equal(f.bridge.token, null); assert.equal(f.bridge.connecting, false); assert.equal(f.timers.size, 0);
});

test('reconectar dos veces y cancelar un intento lento no reemplaza la sesión nueva', async () => {
  const f = fixture(); await f.connect();
  const post = f.bridge.post.bind(f.bridge); let release;
  f.bridge.post = (route, body) => route === 'disconnect' ? new Promise(resolve => { release = resolve; }) : post(route, body);
  const earlier = f.connect(); await settle(() => !!release);
  await f.connect(); const active = f.bridge.token, generation = f.bridge.generation;
  release({ ok: true }); assert.equal(await earlier, undefined); // fixture.connect awaits the public call
  assert.equal(f.bridge.token, active); assert.equal(f.bridge.generation, generation); assert.equal(f.bridge.status().connected, true);
  f.bridge.post = post; await f.bridge.disconnect();
  await f.connect(); release = null;
  f.bridge.post = (route, body) => route === 'disconnect' ? new Promise(resolve => { release = resolve; }) : post(route, body);
  const pending = f.connect(); await settle(() => !!release); await f.bridge.disconnect(); release({ ok: true }); await pending;
  assert.equal(f.bridge.token, null); assert.equal(f.timers.size, 0);
});

test('MCP rechaza amplificación extrema de arco y cámara inválida antes de ejecutar', async () => {
  const f = fixture(); await f.connect();
  f.doc.register('view.camera', { undoable: false, run() { throw new Error('No debe ejecutarse'); } });
  for (const [command, params] of [
    ['draw.arc', { start: [1, 0, 0], end: [-1, 0, 0], through: [0, 1, 0], segments: 1e12 }],
    ['draw.line', { points: Array.from({ length: 513 }, (_, i) => [i, 0, 0]) }],
    ['view.camera', { target: [0, 0], distance: 4 }], ['view.camera', { distance: -1 }]
  ]) { const result = f.bridge.handle(f.execute(command, params)); assert.equal(result.ok, false); }
  assert.equal(f.executions.length, 0); assert.equal(f.doc.model.faces.size, 0); await f.bridge.disconnect();
});

test('guide.add rechaza dirección cero/NaN y revierte escena, selección e historial', async () => {
  const doc = new D.Document(); cmd(doc, 'guide.add', { point: [1, 2, 3], direction: [1, 0, 0] }); doc.select({ annots: [...doc.model.annots.keys()] });
  const before = stable(doc);
  for (const params of [{ point: [0, 0, 0], direction: [0, 0, 0] }, { point: [0, 0, 0], direction: [NaN, 1, 0] }, { point: [0, Infinity, 0], direction: [1, 0, 0] }, { point: [0, 0, 0], from: [NaN, 0, 0] }]) {
    assert.equal(doc.execute('guide.add', params).ok, false); assert.equal(stable(doc), before);
  }
});

(async () => {
  console.log('\nDédalo — puente MCP con HTTP y temporizadores en memoria\n');
  for (const { name, run } of cases) { try { await run(); passed++; console.log('  ok   ' + name); } catch (error) { failed++; console.error('  FALLA ' + name + '\n' + error.stack); } }
  console.log('\n' + passed + ' pruebas superadas; ' + failed + ' fallidas.'); if (failed) process.exitCode = 1;
})().catch(error => { console.error(error); process.exitCode = 1; });
