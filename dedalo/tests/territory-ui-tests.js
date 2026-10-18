/* Territory UI async state tested with inert DOM-shaped objects: no browser/render/server. */
'use strict';
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
require('../app/js/io/territory-data.js');
const D = globalThis.DEDALO, originalData = { ...D.TerritoryData };
class Node {
  constructor(tag = 'div') { this.tagName = tag.toUpperCase(); this.children = []; this.parentElement = null; this.dataset = {}; this.style = {}; this.attrs = {}; this.events = new Map(); this.classes = new Set(); this.disabled = false; this.clientWidth = 300; this.clientHeight = 250;
    this.classList = { add: (...names) => names.forEach(n => this.classes.add(n)), remove: n => this.classes.delete(n), contains: n => this.classes.has(n) }; }
  get isConnected() { return this.connected || !!(this.parentElement && this.parentElement.isConnected); }
  set className(value) { this.classes = new Set(value.split(/\s+/).filter(Boolean)); }
  get className() { return [...this.classes].join(' '); }
  set textContent(value) { this.text = String(value); this.replaceChildren(); }
  get textContent() { return (this.text || '') + this.children.map(c => c.textContent).join(''); }
  setAttribute(key, value) { this.attrs[key] = String(value); }
  append(...items) { for (const item of items) { if (item.parentElement) item.remove(); item.parentElement = this; this.children.push(item); } }
  replaceChildren(...items) { for (const c of this.children) c.parentElement = null; this.children = []; this.append(...items); }
  remove() { if (this.parentElement) this.parentElement.children = this.parentElement.children.filter(c => c !== this); this.parentElement = null; }
  addEventListener(name, listener) { if (!this.events.has(name)) this.events.set(name, []); this.events.get(name).push(listener); }
  async trigger(name, extra = {}) { const event = Object.assign({ target: this, preventDefault() {} }, extra); for (const fn of this.events.get(name) || []) await fn(event); }
  closest(selector) { for (let n = this; n; n = n.parentElement) if (selector.split(',').some(s => n.tagName.toLowerCase() === s)) return n; return null; }
  setPointerCapture() {} getBoundingClientRect() { return { left: 0, top: 0, width: 300, height: 250 }; }
}
globalThis.document = { createElement: tag => new Node(tag), createTextNode: text => { const n = new Node('#text'); n.textContent = text; return n; } };
globalThis.location = { protocol: 'file:', hostname: '', port: '', search: '' };
D.UI = function () {};
require('../app/js/view/territory-map.js');
require('../app/js/ui/territory-ui.js');
const originalPaint = D.TerritoryUI.paint;
const tests = []; let passed = 0, failed = 0;
function test(name, run) { tests.push({ name, run }); }
function walk(node) { return [node, ...node.children.flatMap(walk)]; }
function find(node, predicate) { const out = walk(node).find(predicate); assert.ok(out, 'control not found'); return out; }
function button(body, text) { return find(body, n => n.tagName === 'BUTTON' && n.textContent === text); }
function fileInput(body) { return find(body, n => n.tagName === 'INPUT' && n.type === 'file'); }
function status(body) { return find(body, n => n.classes.has('wizard-status')).textContent; }
function deferred() { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; }
async function tick() { for (let i = 0; i < 6; i++) await new Promise(r => setImmediate(r)); }
function data(partial = false) { return { format: 'dedalo.territory-data', version: 1, bbox: originalData.bboxAround(-3.7, 42, 100), parcels: [], buildingParts: [], trees: [], terrain: null, sources: [{ title: 'Fuente real', attribution: 'Proveedor', licenseURL: 'https://provider.example/license' }], warnings: partial ? ['Capa incompleta real'] : [], partial }; }
function fixture(existing, geo) {
  Object.assign(D.TerritoryData, originalData);
  D.TerritoryUI.paint = originalPaint;
  globalThis.fetch = async () => ({ ok: false, json: async () => ({}) });
  let calls = 0, downloads = 0, saves = 0;
  const page = new Node('body'); page.connected = true; const container = new Node('main'); container.inert = false; page.append(container); document.body = page; document.activeElement = null;
  const app = { doc: { projectId: 'project-A', projectVersion: 0, editPath: [], scene: { georeference: geo ? { crs: 'EPSG:4326' } : null }, execute: () => ({ georeference: geo ? {} : null }), clearSelection() {} },
    el: { app: container }, tool: { state: 0 }, navDrag: null, mcpBridge: { revision: 0, state: () => ({ busy: false }) }, renderer: { style: {}, opts: {} }, exec() { calls++; return { ok: true }; }, setView() {}, renderNow() {},
    files: { download() { downloads++; }, save() { saves++; }, safeName() { return 'Burgos'; } } };
  D.Territory = { prepare() { return {}; } }; D.TerritoryExport = { ifc: () => 'IFC', jsonPackage: () => ({}) };
  const ui = Object.create(D.UI.prototype); ui.app = app; ui.panel = 'territory'; ui.openPanel = name => { ui.panel = name; };
  if (existing) ui.territoryState = { center: [-3.7, 42], side: 600, label: 'Burgos', layers: { parcels: true, buildings: true, terrain: true, trees: true, context: true }, floorHeight: 3, treeHeight: 6, data: existing, projectId: 'project-A' };
  const body = new Node('div'); container.append(body); ui.panel_territory(body, true);
  return { ui, app, body, page, container, counts: () => ({ calls, downloads, saves }) };
}

test('coordinate center accepts longitude first and rejects reversed, nonnumeric and distant input', () => {
  assert.deepEqual(D.TerritoryUI.center('-3.69786, 42.34409'), [-3.69786, 42.34409]);
  assert.deepEqual(D.TerritoryUI.center('-3.69786;42.34409'), [-3.69786, 42.34409]);
  for (const value of ['42.34,-3.69', 'Madrid', '-3,42,1', '0,0']) assert.throws(() => D.TerritoryUI.center(value));
});
test('map mercator round trips Spain and selection never changes on an invalid remote pan', async () => {
  for (const p of [[-3.7, 42.34], [-16.3, 28.4], [2.65, 39.6]]) for (const z of [8, 15, 18]) {
    const q = D.TerritoryMapMath.lonlat(...D.TerritoryMapMath.pixel(...p, z), z); p.forEach((n, i) => assert.ok(Math.abs(n - q[i]) < 1e-10));
  }
  const container = new Node(), selected = [];
  const map = new D.TerritoryMap(container, { center: [-3.7, 42.34], side: 600, onChange: p => selected.push(p) });
  await container.trigger('pointerdown', { clientX: 150, clientY: 125, pointerId: 1 });
  await container.trigger('pointerup', { clientX: 500000, clientY: 500000 });
  assert.deepEqual(map.center, [-3.7, 42.34]); assert.equal(selected.length, 0);
  assert.ok(walk(container).some(n => n.tagName === 'IMG' && n.src.startsWith('https://www.ign.es/wmts/ign-base?')), 'archivo local solicita imágenes reales del mapa en planta');
});
test('transport uses only chosen loopback port and typed descriptor with credential omission', async () => {
  const calls = [];
  globalThis.fetch = async (url, init) => { calls.push({ url, init }); return url.endsWith('/health') ? { ok: true, json: async () => ({ service: 'dedalo-local-mcp', territory: true }) } : new Response('{"ok":true,"text":"data"}', { status: 200 }); };
  const controller = new AbortController(), t = await D.TerritoryUI.transport({ port: 43210, signal: controller.signal });
  assert.equal(typeof t.request, 'function'); await t.request({ operation: 'osm.trees', bbox: [-3.7, 42, -3.699, 42.001] }, { signal: controller.signal });
  assert.equal(calls[0].url, 'http://127.0.0.1:43210/health'); assert.equal(calls[1].url, 'http://127.0.0.1:43210/v1/geodata');
  assert.equal(calls[1].init.credentials, 'omit'); assert.equal(calls[1].init.signal, controller.signal); assert.equal(JSON.parse(calls[1].init.body).operation, 'osm.trees');
});
test('transport gracefully falls back on absent/incompatible connector and rejects invalid ports or aborted setup', async () => {
  globalThis.fetch = async () => ({ ok: true, json: async () => ({ service: 'another-service', territory: true }) });
  assert.equal((await D.TerritoryUI.transport({})).request, undefined);
  await assert.rejects(() => D.TerritoryUI.transport({ port: 80 }), /Puerto/);
  const c = new AbortController(); c.abort(); await assert.rejects(() => D.TerritoryUI.transport({ signal: c.signal }), /cancelada/);
});
test('search survives final panel refresh and candidate selection retains the point without mutating model', async () => {
  const f = fixture(); D.TerritoryData.resolveLocation = async () => ({ candidates: [{ id: '1', type: 'portal', label: 'Portal Burgos', lon: -3.69, lat: 42.34 }], warnings: [] });
  await button(f.body, 'Buscar lugar').trigger('click'); await tick();
  assert.equal(f.ui.territoryState.loading, false); await button(f.body, 'Portal Burgos').trigger('click'); await tick();
  assert.deepEqual(f.ui.territoryState.center, [-3.69, 42.34]); assert.equal(f.counts().calls, 0); assert.match(status(f.body), /Ubicación seleccionada/);
});
test('pending query disables old imports, data downloads and exports, preserving existing model', async () => {
  const f = fixture(data(), true), wait = deferred(); D.TerritoryData.loadArea = () => wait.promise;
  await button(f.body, 'Consultar datos del recorte').trigger('click'); await tick(); assert.equal(f.ui.territoryState.loading, true);
  for (const label of ['Crear entorno 3D en este modelo', 'Guardar datos GIS (JSON)', 'Guardar modelo .dedalo', 'Exportar IFC4', 'Exportar paquete JSON']) await button(f.body, label).trigger('click');
  assert.deepEqual(f.counts(), { calls: 0, downloads: 0, saves: 0 });
  fileInput(f.body).files = [{ size: 10, text: async () => JSON.stringify(data()) }]; await fileInput(f.body).trigger('change');
  assert.match(status(f.body), /Espera o cancela/); wait.resolve(data()); await tick();
});
test('cancel after full panel reconstruction aborts the captured query and resets the current controls', async () => {
  const f = fixture(), wait = deferred(); let signal;
  D.TerritoryData.loadArea = options => { signal = options.signal; return wait.promise; };
  await button(f.body, 'Consultar datos del recorte').trigger('click'); await tick();
  const next = new Node(); next.connected = true; f.body.connected = false; f.ui.panel_territory(next, true);
  assert.equal(find(next, n => n.tagName === 'FIELDSET').disabled, true); assert.equal(button(next, 'Cancelar consulta').disabled, false);
  await button(next, 'Cancelar consulta').trigger('click'); assert.equal(signal.aborted, true); wait.resolve(data()); await tick();
  assert.equal(f.ui.territoryState.loading, false); assert.equal(f.ui.territoryState.abort, null); assert.equal(f.ui.territoryState.data, undefined);
  assert.equal(find(next, n => n.tagName === 'FIELDSET').disabled, false); assert.equal(button(next, 'Cancelar consulta').disabled, true); assert.match(status(next), /cancelada/);
});
test('successful query paints result, partial status and safe attribution in the current rebuilt panel', async () => {
  const f = fixture(), wait = deferred(); D.TerritoryData.loadArea = () => wait.promise;
  await button(f.body, 'Consultar datos del recorte').trigger('click'); await tick();
  f.ui.panel_territory(f.body, true); wait.resolve(data(true)); await tick();
  assert.match(f.body.textContent, /resultado parcial/); assert.match(f.body.textContent, /Capa incompleta real/);
  const link = find(f.body, n => n.tagName === 'A' && n.href === 'https://provider.example/license'); assert.equal(link.rel, 'noopener'); assert.equal(link.target, '_blank');
  assert.equal(f.ui.territoryState.loading, false); assert.equal(f.counts().calls, 0);
});
test('changing panels while data arrives does not replace unrelated panel content', async () => {
  const f = fixture(), wait = deferred(); D.TerritoryData.loadArea = () => wait.promise;
  await button(f.body, 'Consultar datos del recorte').trigger('click'); await tick(); f.ui.panel = 'ai'; f.body.replaceChildren(new Node('summary')); f.body.children[0].textContent = 'Unir IA';
  wait.resolve(data()); await tick(); assert.equal(f.body.textContent, 'Unir IA'); assert.equal(f.ui.territoryState.data.format, 'dedalo.territory-data');
});
test('new-project guard prevents importing reviewed data into a different model; active edit guard also preserves it', async () => {
  const f = fixture(data()); f.app.doc.projectId = 'project-B'; await button(f.body, 'Crear entorno 3D en este modelo').trigger('click');
  assert.equal(f.counts().calls, 0); assert.match(status(f.body), /otro proyecto/);
  f.app.doc.projectId = 'project-A'; f.app.doc.editPath = ['group']; await button(f.body, 'Crear entorno 3D en este modelo').trigger('click'); assert.equal(f.counts().calls, 0); assert.match(status(f.body), /sal del grupo/);
});
test('valid reviewed import executes once, uses white scene and reveals exports without automatic download', async () => {
  const f = fixture(data(), true); await button(f.body, 'Crear entorno 3D en este modelo').trigger('click');
  assert.equal(f.counts().calls, 1); assert.equal(f.counts().downloads, 0); assert.equal(f.app.renderer.style.bgTop, '#f8f9fa'); assert.equal(f.app.renderer.opts.showAxes, false);
  await button(f.body, 'Exportar IFC4').trigger('click'); assert.equal(f.counts().downloads, 1); assert.match(status(f.body), /IFC4 exportado/);
});
test('typing metres or moving the slider updates the side, area and map crop immediately', async () => {
  const f = fixture(), side = find(f.body, n => n.tagName === 'INPUT' && n.type === 'number' && n.min === '50'), slider = find(f.body, n => n.tagName === 'INPUT' && n.type === 'range');
  side.value = '825'; await side.trigger('input');
  assert.equal(f.ui.territoryState.side, 825); assert.equal(slider.value, '825'); assert.equal(f.ui.territoryState.map.side, 825); assert.equal(f.ui.territoryState.map.box.textContent, '825 m');
  assert.match(find(f.body, n => n.classes.has('territory-area')).textContent, /825 × 825 m · 0\.68 km²/);
  slider.value = '250'; await slider.trigger('input');
  assert.equal(side.value, '250'); assert.equal(f.ui.territoryState.side, 250); assert.equal(f.ui.territoryState.map.box.textContent, '250 m');
  assert.match(find(f.body, n => n.classes.has('territory-area')).textContent, /250 × 250 m · 0\.06 km²/);
  side.value = '0'; await side.trigger('input'); assert.equal(f.ui.territoryState.side, 250); assert.equal(side.attrs['aria-invalid'], 'true');
  await side.trigger('change'); assert.equal(side.value, '250'); assert.equal(f.ui.territoryState.map.side, 250); assert.match(status(f.body), /50 y 1000/); assert.equal(f.counts().calls, 0);
});
test('changing the crop after a query discards its stale review and an old create click cannot import it', async () => {
  const f = fixture(), prepared = data(); D.TerritoryData.loadArea = async () => prepared;
  await button(f.body, 'Consultar datos del recorte').trigger('click'); await tick();
  assert.equal(f.ui.territoryState.data, prepared); assert.equal(typeof f.ui.territoryState.dataSelection, 'string');
  const oldCreate = button(f.body, 'Crear entorno 3D en este modelo'), side = find(f.body, n => n.tagName === 'INPUT' && n.type === 'number' && n.min === '50');
  side.value = '400'; await side.trigger('input');
  assert.equal(f.ui.territoryState.data, null); assert.equal(f.ui.territoryState.dataSelection, null); assert.equal(f.ui.territoryState.map.side, 400); assert.equal(f.counts().calls, 0);
  assert.equal(walk(f.body).some(n => n.tagName === 'BUTTON' && n.textContent === 'Crear entorno 3D en este modelo'), false); assert.match(status(f.body), /nueva selección/);
  await oldCreate.trigger('click'); assert.equal(f.counts().calls, 0); assert.match(status(f.body), /selección ha cambiado/);
});
test('CPU import shows the spinner and locks model input before paint, then restores the page', async () => {
  const f = fixture(data()), painted = deferred(); D.TerritoryUI.paint = () => painted.promise;
  const create = button(f.body, 'Crear entorno 3D en este modelo'), pending = create.trigger('click'), s = f.ui.territoryState;
  assert.equal(f.counts().calls, 0, 'the synchronous import cannot start before the busy indicator can paint');
  assert.equal(s.loading, true); assert.equal(s.phase, 'cpu'); assert.equal(f.app.territoryBusy, true); assert.equal(f.app.doc._busy, undefined);
  assert.equal(f.container.inert, true); assert.equal(f.container.attrs['aria-busy'], 'true'); assert.equal(s.notice.parentElement, f.page, 'the notice remains outside the inert app');
  assert.equal(s.notice.classes.has('territory-working-blocking'), true); assert.ok(walk(s.notice).some(n => n.classes.has('territory-spinner'))); assert.match(s.notice.textContent, /Creando el entorno/);
  assert.equal(s.map.busy, true); assert.equal(button(f.body, 'Cancelar consulta').disabled, true);
  await button(f.body, 'Cancelar consulta').trigger('click'); assert.equal(f.counts().calls, 0, 'a non-interruptible import is not advertised as cancellable');
  painted.resolve(); await pending;
  assert.equal(f.counts().calls, 1); assert.equal(s.loading, false); assert.equal(s.phase, null); assert.equal(f.app.territoryBusy, false); assert.equal(f.container.inert, false);
  assert.equal(f.container.attrs['aria-busy'], 'false'); assert.equal(s.notice, null); assert.equal(walk(f.page).some(n => n.classes.has('territory-working')), false); assert.equal(s.map.busy, false);
});
test('concurrent or queued import clicks create one environment and leave the completed action disabled', async () => {
  const f = fixture(data()), painted = deferred(); D.TerritoryUI.paint = () => painted.promise;
  const create = button(f.body, 'Crear entorno 3D en este modelo'), first = create.trigger('click');
  await create.trigger('click'); assert.equal(f.counts().calls, 0); painted.resolve(); await first;
  assert.equal(f.counts().calls, 1); assert.equal(button(f.body, 'Entorno ya creado en este modelo').disabled, true);
  await create.trigger('click'); assert.equal(f.counts().calls, 1, 'even an event queued for the old removed button cannot duplicate the completed import');
  assert.match(status(f.body), /ya está creado/);
});
test('a failed import releases the notice, CPU flag and inert state and leaves the action retryable', async () => {
  const f = fixture(data()), painted = deferred(); D.TerritoryUI.paint = () => painted.promise; f.container.inert = true;
  f.app.exec = () => { throw new Error('Fallo controlado al importar'); };
  const pending = button(f.body, 'Crear entorno 3D en este modelo').trigger('click'); painted.resolve(); await pending;
  assert.match(status(f.body), /Fallo controlado/); assert.equal(f.ui.territoryState.notice, null); assert.equal(f.app.territoryBusy, false); assert.equal(f.ui.territoryState.loading, false);
  assert.equal(f.container.inert, true, 'a pre-existing inert state is restored, not overwritten'); assert.equal(button(f.body, 'Crear entorno 3D en este modelo').disabled, false);
  assert.equal(f.ui.territoryState.importedData, undefined); assert.deepEqual(f.app.renderer.style, {});
});
test('changing the model, context or active gesture while waiting for paint prevents the import and releases the lock', async () => {
  for (const [name, change] of [
    ['project', f => { f.app.doc.projectId = 'project-B'; }],
    ['revision', f => { f.app.mcpBridge.revision++; }],
    ['version', f => { f.app.doc.projectVersion++; }],
    ['context', f => { f.app.doc.editPath = ['group']; }],
    ['tool', f => { f.app.tool.state = 1; }],
    ['navigation', f => { f.app.navDrag = {}; }]
  ]) {
    const f = fixture(data()), painted = deferred(); D.TerritoryUI.paint = () => painted.promise;
    const pending = button(f.body, 'Crear entorno 3D en este modelo').trigger('click'); change(f); painted.resolve(); await pending;
    assert.equal(f.counts().calls, 0, name); assert.equal(f.ui.territoryState.notice, null, name); assert.equal(f.app.territoryBusy, false, name); assert.equal(f.container.inert, false, name);
    assert.equal(f.ui.territoryState.loading, false, name); assert.match(status(f.body), /modelo ha cambiado|herramienta activa/, name);
  }
});
test('network progress keeps the model usable, exposes cancellation and removes its spinner on cancellation or failure', async () => {
  const f = fixture(), query = deferred(); let signal;
  D.TerritoryData.loadArea = options => { signal = options.signal; options.onProgress({ layer: 'trees', index: 3, total: 5 }); return query.promise; };
  await button(f.body, 'Consultar datos del recorte').trigger('click'); await tick();
  const s = f.ui.territoryState; assert.equal(s.phase, 'network'); assert.notEqual(f.app.territoryBusy, true); assert.equal(f.container.inert, false); assert.equal(button(f.body, 'Cancelar consulta').disabled, false);
  assert.equal(s.notice.parentElement, f.page); assert.equal(s.notice.classes.has('territory-working-blocking'), false); assert.match(s.notice.textContent, /árboles · 4\/5/);
  await button(f.body, 'Cancelar consulta').trigger('click'); assert.equal(signal.aborted, true); query.resolve(data()); await tick();
  assert.equal(s.notice, null); assert.equal(s.data, undefined); assert.equal(s.phase, null); assert.equal(s.loading, false); assert.equal(button(f.body, 'Cancelar consulta').disabled, true); assert.match(status(f.body), /cancelada/);
  const g = fixture(), failed = deferred(); D.TerritoryData.loadArea = () => failed.promise;
  await button(g.body, 'Consultar datos del recorte').trigger('click'); await tick(); failed.reject(new Error('El servicio no responde')); await tick();
  assert.equal(g.ui.territoryState.notice, null); assert.equal(g.ui.territoryState.loading, false); assert.equal(g.ui.territoryState.abort, null); assert.equal(button(g.body, 'Cancelar consulta').disabled, true); assert.match(status(g.body), /El servicio no responde/);
});
test('paint yields through two frames before CPU work and clears the background-tab timeout', async () => {
  const saved = { raf: globalThis.requestAnimationFrame, timeout: globalThis.setTimeout, clear: globalThis.clearTimeout }, frames = [], timers = new Map(); let sequence = 0, resolved = false;
  globalThis.requestAnimationFrame = fn => { frames.push(fn); return frames.length; }; globalThis.setTimeout = (fn, delay) => { const id = ++sequence; timers.set(id, { fn, delay }); return id; }; globalThis.clearTimeout = id => timers.delete(id);
  try {
    const waiting = originalPaint().then(() => { resolved = true; }); await Promise.resolve(); assert.equal(resolved, false); assert.equal(frames.length, 1); assert.equal([...timers.values()][0].delay, 120);
    frames.shift()(); await Promise.resolve(); assert.equal(resolved, false); assert.equal(frames.length, 1);
    frames.shift()(); await waiting; assert.equal(resolved, true); assert.equal(timers.size, 0);
  } finally { if (saved.raf === undefined) delete globalThis.requestAnimationFrame; else globalThis.requestAnimationFrame = saved.raf; globalThis.setTimeout = saved.timeout; globalThis.clearTimeout = saved.clear; }
});
test('paint can complete by its timeout when an inactive browser tab does not deliver frames', async () => {
  const saved = { raf: globalThis.requestAnimationFrame, timeout: globalThis.setTimeout, clear: globalThis.clearTimeout }, frames = []; let fallback, resolved = 0;
  globalThis.requestAnimationFrame = fn => { frames.push(fn); return frames.length; }; globalThis.setTimeout = fn => { fallback = fn; return 1; }; globalThis.clearTimeout = () => {};
  try {
    const waiting = originalPaint().then(() => resolved++); fallback(); await waiting; assert.equal(resolved, 1);
    frames.shift()(); frames.shift()(); await Promise.resolve(); assert.equal(resolved, 1, 'late frames cannot release or run the operation twice');
  } finally { if (saved.raf === undefined) delete globalThis.requestAnimationFrame; else globalThis.requestAnimationFrame = saved.raf; globalThis.setTimeout = saved.timeout; globalThis.clearTimeout = saved.clear; }
});
test('local JSON finishing after project change or new query cannot replace prepared data', async () => {
  const f = fixture(), wait = deferred(), input = fileInput(f.body); input.files = [{ size: 10, text: () => wait.promise }];
  const reading = input.trigger('change'); f.app.doc.projectId = 'project-B'; wait.resolve(JSON.stringify(data())); await reading;
  assert.equal(f.ui.territoryState.data, undefined); assert.match(status(f.body), /otro proyecto/);
  const g = fixture(), wait2 = deferred(), input2 = fileInput(g.body); input2.files = [{ size: 10, text: () => wait2.promise }];
  const reading2 = input2.trigger('change'); g.ui.territoryState.generation = 1; wait2.resolve(JSON.stringify(data())); await reading2;
  assert.equal(g.ui.territoryState.data, undefined); assert.match(status(g.body), /otra consulta/);
});
test('valid local data is validated before review and never imports automatically', async () => {
  const f = fixture(), input = fileInput(f.body); let prepared = 0; D.Territory.prepare = () => { prepared++; };
  input.files = [{ size: 10, text: async () => JSON.stringify(data(true)) }]; await input.trigger('change');
  assert.equal(prepared, 1); assert.equal(f.counts().calls, 0); assert.match(f.body.textContent, /resultado parcial/); assert.match(status(f.body), /cargados del archivo/);
});
test('imported source attribution is plain text and non-HTTPS license values cannot become executable links', () => {
  const d = data(); d.sources[0].licenseURL = 'javascript:alert(1)'; d.sources[0].title = '<script>unsafe</script>';
  const f = fixture(d); assert.equal(walk(f.body).some(n => n.tagName === 'A' && n.href === 'javascript:alert(1)'), false);
  assert.match(f.body.textContent, /<script>unsafe<\/script>/);
});
test('script order loads constructors before app startup, and public download references stay local', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  for (const script of ['core/territory.js', 'view/territory-map.js', 'ui/territory-ui.js', 'io/territory-data.js', 'io/territory-export.js']) assert.ok(html.indexOf(script) < html.indexOf('src="app/js/app.js"'));
  const f = fixture(), link = find(f.body, n => n.tagName === 'A' && n.textContent === 'Descargar conector local'); assert.equal(link.href, 'downloads/DEDALO_MCP_LOCAL_v0.5.1.zip');
});
test('final review: geo.info command failure hides exports without mutating or crashing the panel', () => {
  const f = fixture(data(), true), before = JSON.stringify(f.app.doc.scene);
  f.app.doc.execute = () => ({ ok: false, error: 'Consulta rechazada' });
  assert.doesNotThrow(() => f.ui.panel_territory(f.body, true));
  assert.equal(walk(f.body).some(n => n.tagName === 'BUTTON' && n.textContent === 'Exportar IFC4'), false);
  assert.equal(JSON.stringify(f.app.doc.scene), before); assert.deepEqual(f.counts(), { calls: 0, downloads: 0, saves: 0 });
});
test('final review: failed geo.import keeps display options and existing model untouched', async () => {
  const f = fixture(data()), before = JSON.stringify(f.app.doc.scene), style = JSON.stringify(f.app.renderer.style);
  f.app.exec = () => ({ ok: false, error: 'La importación se ha anulado' });
  await button(f.body, 'Crear entorno 3D en este modelo').trigger('click');
  assert.match(status(f.body), /se ha anulado/); assert.equal(JSON.stringify(f.app.doc.scene), before); assert.equal(JSON.stringify(f.app.renderer.style), style);
  assert.equal(f.ui.territoryState.result, undefined); assert.equal(f.counts().downloads, 0);
});
test('final review: connector fetch or CORS rejection falls back to public transport without sharing model', async () => {
  let calls = 0; globalThis.fetch = async () => { calls++; throw new TypeError('Failed to fetch'); };
  const result = await D.TerritoryUI.transport({ port: 43127 }); assert.equal(result.request, undefined); assert.match(result.label, /directo/); assert.equal(calls, 1);
});
test('final review: unrelated local web port is never mistaken for the connector port', async () => {
  const prior = globalThis.location;
  try {
    globalThis.location = { protocol: 'http:', hostname: '127.0.0.1', port: '58234', search: '' };
    const f = fixture(), wait = deferred(), urls = []; globalThis.fetch = async (url) => { urls.push(url); return { ok: false, json: async () => ({}) }; };
    D.TerritoryData.loadArea = () => wait.promise; await button(f.body, 'Consultar datos del recorte').trigger('click'); await tick();
    assert.equal(urls[0], 'http://127.0.0.1:43127/health'); wait.resolve(data()); await tick(); assert.equal(f.counts().calls, 0);
  } finally { globalThis.location = prior; }
});

(async () => { console.log('\nDédalo — Territorio UI, estados asíncronos CPU\n'); const selected = process.argv[2] ? tests.filter(t => t.name.includes(process.argv[2])) : tests; if (!selected.length) throw new Error('No hay pruebas que coincidan con el filtro.'); for (const t of selected) { try { await t.run(); passed++; console.log('  ok   ' + t.name); } catch (e) { failed++; console.error('  FALLA ' + t.name + '\n' + e.stack); } } console.log('\n' + passed + ' correctas; ' + failed + ' fallidas.'); if (failed) process.exitCode = 1; })();
