/* Inert DOM-shaped nodes only: no browser, graphics, sockets or tile downloads. */
'use strict';
const assert = require('node:assert/strict');
require('../app/js/io/territory-data.js');
class Node {
  constructor(tag = 'div') { this.tagName = tag.toUpperCase(); this.children = []; this.parentElement = null; this.dataset = {}; this.style = {}; this.attrs = {}; this.events = new Map(); this.clientWidth = 300; this.clientHeight = 250; this.classList = { add() {} }; this.hidden = false; this.disabled = false; }
  set textContent(value) { this.text = String(value); this.replaceChildren(); }
  get textContent() { return (this.text || '') + this.children.map(c => c.textContent).join(''); }
  setAttribute(key, value) { this.attrs[key] = String(value); }
  append(...children) { for (const child of children) { if (child.parentElement) child.remove(); this.children.push(child); child.parentElement = this; } }
  replaceChildren(...children) { for (const child of this.children) child.parentElement = null; this.children = []; this.append(...children); }
  remove() { if (this.parentElement) this.parentElement.children = this.parentElement.children.filter(c => c !== this); this.parentElement = null; }
  addEventListener(type, listener) { if (!this.events.has(type)) this.events.set(type, []); this.events.get(type).push(listener); }
  removeEventListener(type, listener) { this.events.set(type, (this.events.get(type) || []).filter(fn => fn !== listener)); }
  trigger(type, extra = {}) { for (const listener of this.events.get(type) || []) listener({ target: this, preventDefault() {}, pointerId: 1, ...extra }); }
  closest(selector) { for (let n = this; n; n = n.parentElement) if (selector.split(',').some(tag => tag.toUpperCase() === n.tagName)) return n; return null; }
  setPointerCapture() {}
  getBoundingClientRect() { return { left: 0, top: 0, width: this.clientWidth, height: this.clientHeight }; }
}
const observers = [];
globalThis.document = { createElement: tag => new Node(tag) };
globalThis.location = { protocol: 'file:' };
globalThis.ResizeObserver = class { constructor(fn) { this.fn = fn; observers.push(this); } observe(node) { this.node = node; } disconnect() { this.disconnected = true; } };
require('../app/js/view/territory-map.js');
const D = globalThis.DEDALO; let passed = 0, failed = 0;
function test(name, run) { try { run(); passed++; console.log('ok ' + name); } catch (error) { failed++; console.error('FAIL ' + name + '\n' + error.stack); } }
function fixture(center = [-3.69786, 42.34409], side = 600) { const el = new Node(), selected = [], map = new D.TerritoryMap(el, { center, side, onChange: point => selected.push(point) }); return { el, map, selected }; }
function settle(map, type = 'load') { for (const img of [...map.tiles.children]) img.trigger(type); }

test('file and hosted preview request the same official IGN JPEG tiles, with no local-server gate', () => {
  const urls = [];
  for (const protocol of ['file:', 'https:', 'http:']) {
    globalThis.location.protocol = protocol;
    const { map, el } = fixture(); assert.ok(map.tiles.children.length > 0); urls.push(map.tiles.children.map(n => n.src));
    for (const img of map.tiles.children) { const url = new URL(img.src); assert.equal(url.hostname, 'www.ign.es'); assert.equal(url.pathname, '/wmts/ign-base'); assert.equal(url.searchParams.get('LAYER'), 'IGNBaseTodo'); assert.equal(url.searchParams.get('TILEMATRIXSET'), 'GoogleMapsCompatible'); assert.equal(url.searchParams.get('FORMAT'), 'image/jpeg'); assert.equal(img.crossOrigin, undefined); }
    assert.match(el.textContent, /IGN/); assert.doesNotMatch(el.textContent, /lanzador/);
    map.destroy();
  }
  assert.deepEqual(urls[0], urls[1]); assert.deepEqual(urls[1], urls[2]);
});
test('only visible tiles are created and unchanged drawings reuse their images', () => {
  const { map, el } = fixture(), before = [...map.tiles.children];
  const p = D.TerritoryMapMath.pixel(...map.center, map.zoom), cols = Math.ceil((p[0] + el.clientWidth / 2) / 256) - Math.floor((p[0] - el.clientWidth / 2) / 256), rows = Math.ceil((p[1] + el.clientHeight / 2) / 256) - Math.floor((p[1] - el.clientHeight / 2) / 256);
  assert.equal(before.length, cols * rows); map.draw(); assert.deepEqual([...map.tiles.children], before); assert.ok(before.length <= 6);
  map.set([-3.5, 42.34], 600); assert.ok(map.tiles.children.every(n => !before.includes(n))); assert.ok(before.every(n => n.parentElement === null));
});
test('pending images show loading and settle to a clean preview with no warning', () => {
  const { map, el } = fixture(); assert.equal(el.attrs['aria-busy'], 'true'); assert.equal(map.note.dataset.state, 'loading'); assert.match(map.note.textContent, /Cargando mapa/);
  settle(map); assert.equal(el.attrs['aria-busy'], 'false'); assert.equal(map.note.dataset.state, 'ready'); assert.equal(map.note.textContent, ''); assert.equal(map.retry.hidden, true);
});
test('partial image failure offers explicit retry and clears after successful load', () => {
  const { map } = fixture(); settle(map); const failedImage = map.tiles.children[0]; failedImage.trigger('error');
  assert.equal(map.note.dataset.state, 'error'); assert.match(map.note.textContent, /reintentar/); assert.equal(map.retry.hidden, false);
  map.retry.trigger('click'); assert.equal(failedImage.parentElement, null); assert.equal(map.note.dataset.state, 'loading'); settle(map);
  assert.equal(map.note.dataset.state, 'ready'); assert.equal(map.retry.hidden, true);
});
test('changing the side updates the displayed meters and crop width at once', () => {
  const { map } = fixture(), previous = parseFloat(map.box.style.width) / 2 ** map.zoom;
  map.set(map.center, 800); assert.equal(map.box.textContent, '800 m'); assert.ok(Math.abs(parseFloat(map.box.style.width) / 2 ** map.zoom / previous - 4 / 3) < 1e-8);
  map.set(map.center, 300); assert.equal(map.box.textContent, '300 m'); assert.ok(Math.abs(parseFloat(map.box.style.width) / 2 ** map.zoom / previous - .5) < 1e-8);
  assert.throws(() => map.set([0, 0], 600)); assert.equal(map.box.textContent, '300 m');
});
test('click and drag use the map plane and reject an invalid distant center', () => {
  const { map, el, selected } = fixture(); const initial = map.center.slice();
  el.trigger('pointerdown', { clientX: 200, clientY: 125, button: 0 }); el.trigger('pointerup', { clientX: 200, clientY: 125 }); assert.ok(map.center[0] > initial[0]); assert.equal(selected.length, 1);
  const clicked = map.center.slice(); el.trigger('pointerdown', { clientX: 150, clientY: 125, button: 0 }); el.trigger('pointerup', { clientX: 180, clientY: 125 }); assert.ok(map.center[0] < clicked[0]); assert.equal(selected.length, 2);
  const valid = map.center.slice(); el.trigger('pointerdown', { clientX: 150, clientY: 125, button: 0 }); el.trigger('pointerup', { clientX: 500000, clientY: 500000 }); assert.deepEqual(map.center, valid); assert.equal(selected.length, 2);
});
test('zoom changes map scale without changing selected size or coordinates', () => {
  const { map } = fixture(), center = map.center.slice(), width = parseFloat(map.box.style.width); map.controls[0].trigger('click');
  assert.equal(map.zoom, 16); assert.equal(map.side, 600); assert.deepEqual(map.center, center); assert.ok(Math.abs(parseFloat(map.box.style.width) - width * 2) < 1e-10);
  for (let i = 0; i < 30; i++) map.controls[0].trigger('click'); assert.equal(map.zoom, 18);
  for (let i = 0; i < 30; i++) map.controls[1].trigger('click'); assert.equal(map.zoom, 8);
});
test('busy state holds the crop steady and restores map loading status afterward', () => {
  const { map, el, selected } = fixture(); settle(map); const center = map.center.slice();
  map.setBusy(true, 'Preparando edificios…'); assert.equal(el.attrs['aria-busy'], 'true'); assert.equal(map.note.textContent, 'Preparando edificios…'); assert.ok(map.controls.every(n => n.disabled));
  el.trigger('pointerdown', { clientX: 150, clientY: 125 }); el.trigger('pointerup', { clientX: 190, clientY: 125 }); map.controls[0].trigger('click'); assert.deepEqual(map.center, center); assert.equal(map.zoom, 15); assert.equal(selected.length, 0);
  map.setBusy(false); assert.equal(el.attrs['aria-busy'], 'false'); assert.equal(map.note.textContent, ''); assert.ok(map.controls.every(n => !n.disabled));
});
test('resize adds newly visible map tiles and destroy releases observer and event handlers', () => {
  const { map, el, selected } = fixture(), observer = observers.at(-1), originalTiles = map.tiles.children.length;
  el.clientWidth = 1000; observer.fn(); assert.ok(map.tiles.children.length > originalTiles);
  map.destroy(); assert.equal(observer.disconnected, true); assert.equal(map.tiles.children.length, 0); assert.ok([...el.events.values()].every(listeners => listeners.length === 0));
  observer.fn(); map.set([-3.4, 42.2], 800); el.trigger('pointerdown', { clientX: 100, clientY: 100 }); assert.equal(map.tiles.children.length, 0); assert.equal(selected.length, 0); map.destroy();
});
test('fit keeps the full selected bbox and 20 pixel margin in narrow panels, without changing its meters', () => {
  for (const center of [[-3.69786, 42.34409], [-16.3, 28.4], [2.65, 39.6]]) for (const side of [50, 300, 600, 1000]) {
    const { map, el } = fixture(center, side); el.clientWidth = 180; map.fit();
    assert.equal(map.side, side); assert.ok(map.zoom <= 18);
    const x = parseFloat(map.box.style.left), y = parseFloat(map.box.style.top), width = parseFloat(map.box.style.width), height = parseFloat(map.box.style.height);
    assert.ok(x >= 20 - 1e-6); assert.ok(y >= 20 - 1e-6); assert.ok(x + width <= el.clientWidth - 20 + 1e-6); assert.ok(y + height <= el.clientHeight - 20 + 1e-6);
    const bbox = D.TerritoryData.bboxAround(...center, side), origin = D.TerritoryMapMath.pixel(...center, map.zoom), nw = D.TerritoryMapMath.lonlat(origin[0] + x - el.clientWidth / 2, origin[1] + y - el.clientHeight / 2, map.zoom), se = D.TerritoryMapMath.lonlat(origin[0] + x + width - el.clientWidth / 2, origin[1] + y + height - el.clientHeight / 2, map.zoom);
    assert.ok(Math.abs(nw[0] - bbox[0]) < 1e-10); assert.ok(Math.abs(nw[1] - bbox[3]) < 1e-10); assert.ok(Math.abs(se[0] - bbox[2]) < 1e-10); assert.ok(Math.abs(se[1] - bbox[1]) < 1e-10);
  }
});
test('size changes refit, while moving the center and resizing retain a manually chosen zoom', () => {
  const { map, el } = fixture(); map.controls[0].trigger('click'); const manualZoom = map.zoom;
  map.set([-3.695, 42.345], 600); assert.equal(map.zoom, manualZoom); el.clientWidth = 280; observers.at(-1).fn(); assert.equal(map.zoom, manualZoom);
  map.set(map.center, 1000); assert.ok(map.zoom < manualZoom); assert.equal(map.fitMode, true); assert.ok(parseFloat(map.box.style.width) <= el.clientWidth - 40);
});
test('projection round trips the mainland, Balearics and Canaries without axis swaps', () => {
  for (const point of [[-3.69786, 42.34409], [2.65, 39.6], [-16.3, 28.4]]) for (const zoom of [8, 15, 18]) { const restored = D.TerritoryMapMath.lonlat(...D.TerritoryMapMath.pixel(...point, zoom), zoom); point.forEach((value, i) => assert.ok(Math.abs(value - restored[i]) < 1e-10)); }
});
console.log(passed + ' correctas, ' + failed + ' fallidas'); if (failed) process.exitCode = 1;
