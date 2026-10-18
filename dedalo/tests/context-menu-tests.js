/* Context-menu routing with inert EventTargets; no browser, DOM, canvas or renderer. */
'use strict';
const assert = require('node:assert/strict'), path = require('node:path');
const { setMaxListeners } = require('node:events');
const JS = path.join(__dirname, '..', 'app', 'js');
for (const file of ['core/geom', 'core/dimensions', 'core/model', 'core/document', 'core/scene', 'core/hierarchy']) require(path.join(JS, file + '.js'));
const D = globalThis.DEDALO;
D.plugins = [];

class Surface extends EventTarget {
  constructor(tag = 'div', id = '', classes = '') {
    super(); this.tagName = tag.toUpperCase(); this.id = id; this.nodeType = 1;
    this.parentElement = null; this.children = []; this.style = {}; this.attrs = {};
    this.classes = new Set(classes.split(/\s+/).filter(Boolean));
    this.classList = { add: c => this.classes.add(c), remove: c => this.classes.delete(c), contains: c => this.classes.has(c),
      toggle: (c, force) => { const add = force === undefined ? !this.classes.has(c) : force; if (add) this.classes.add(c); else this.classes.delete(c); return add; } };
    this.offsetWidth = 250; this.offsetHeight = 360; this.registrations = [];
  }
  addEventListener(name, listener, options) { this.registrations.push({ name, options }); super.addEventListener(name, listener, options); }
  get className() { return [...this.classes].join(' '); }
  set className(v) { this.classes = new Set(v.split(/\s+/).filter(Boolean)); }
  get innerHTML() { return this.html || ''; }
  set innerHTML(v) { this.html = v; this.children = []; }
  setAttribute(name, value) { this.attrs[name] = String(value); if (name === 'id') this.id = value; }
  append(...children) { for (const child of children) { child.parentElement = this; this.children.push(child); } }
  contains(target) { for (let n = target; n; n = n.parentElement) if (n === this) return true; return false; }
  closest(selector) {
    const matches = (n, s) => s[0] === '#' ? n.id === s.slice(1) : s[0] === '.' ? n.classes.has(s.slice(1))
      : s.startsWith('[contenteditable]') ? 'contenteditable' in n.attrs && n.attrs.contenteditable !== 'false'
      : s === '[role="dialog"]' ? n.attrs.role === 'dialog' : n.tagName.toLowerCase() === s;
    for (let n = this; n; n = n.parentElement) if (selector.split(',').some(s => matches(n, s.trim()))) return n;
    return null;
  }
  getBoundingClientRect() { return { left: 20, top: 30, width: 600, height: 400 }; }
  setPointerCapture() {}
}

const docEvents = new Surface('document'), windowEvents = new EventTarget();
setMaxListeners(0, docEvents, windowEvents); // Each fixture deliberately retains its inert bindings.
docEvents.body = new Surface('body'); docEvents.activeElement = null;
docEvents.createElement = tag => new Surface(tag);
globalThis.document = docEvents;
globalThis.window = globalThis;
globalThis.addEventListener = windowEvents.addEventListener.bind(windowEvents);
globalThis.innerWidth = 800; globalThis.innerHeight = 600;
require(path.join(JS, 'ui', 'ui.js'));
require(path.join(JS, 'app.js'));
D.pickForSelect = app => app.hit || null;

// Suppress only construction of visual controls; menu and event methods are real.
class InertUI extends D.UI {
  buildTopbar() {} buildToolbar() {} buildRail() {} buildMenu() {} buildStatus() {}
  refreshPanels() {} refreshTitle() {} refreshStatus() {} refreshContext() {} renderPanel() {}
  openPanel(name) { this.panel = name; }
}
function fixture(kind) {
  const doc = new D.Document();
  const command = (name, params) => { const r = doc.execute(name, params || {}); assert.ok(r.ok, r.error); return r; };
  command('draw.rectangle', { origin: [0, 0, 0], width: 2, height: 1 });
  let node;
  if (kind) node = command(kind === 'component' ? 'component.create' : 'group.create', { faces: [...doc.model.faces.keys()], name: kind }).node;
  doc.clearSelection();
  const el = { viewport: new Surface('div', 'viewport'), ov: new Surface('canvas', 'ov'), gl: new Surface('canvas', 'gl'),
    ctx: new Surface('div', 'ctxmenu', 'menu hidden'), menu: new Surface('div', 'menu', 'menu hidden'), vcb: new Surface('input', 'vcb') };
  el.viewport.append(el.gl, el.ov);
  const app = Object.create(D.App.prototype);
  Object.assign(app, { el, doc, vcbBuf: '', selVersion: 0, renderCount: 0, cancelCount: 0, modelKeyCount: 0,
    renderer: { opts: {} }, files: { scheduleAutosave() {} },
    requestRender() {}, renderNow() { this.renderCount++; }, updateSceneRadius() {}, zoomExtents() {},
    exec: command, setTool(id) { this.selectedTool = id; }, toast(message) { throw new Error(message); },
    tool: { id: 'select', state: 0, onDown() {}, onUp() {}, cancel() { app.cancelCount++; this.state = 0; }, reset() {} }
  });
  app.ui = new InertUI(app);
  app.bindEvents();
  app.hit = { face: [...doc.model.faces.keys()][0] };
  return { app, el, doc, node, command };
}
function event(type, target, extra) {
  const e = new Event(type, { cancelable: true });
  for (const [k, value] of Object.entries(Object.assign({ target, button: 2, buttons: 0, clientX: 120, clientY: 130, pointerId: 1 }, extra))) Object.defineProperty(e, k, { value, configurable: true });
  return e;
}
function rightClick(f) {
  f.el.ov.dispatchEvent(event('pointerdown', f.el.ov));
  f.el.ov.dispatchEvent(event('pointerup', f.el.ov));
}
function nativeMenu(target) { const e = event('contextmenu', target); docEvents.dispatchEvent(e); return e; }
const button = (f, label) => f.el.ctx.children.find(c => c.innerHTML.includes('<span>' + label + '</span>'));
let passed = 0, failed = 0;
function test(name, fn) { try { fn(); passed++; console.log('  ok   ' + name); } catch (e) { failed++; console.error('  FALLA ' + name + '\n' + e.stack); } }

console.log('\nDédalo — menú contextual, EventTargets inertes\n');

test('contextmenu is captured on the document before it reaches a replacement popup target', () => {
  fixture();
  assert.ok(docEvents.registrations.some(r => r.name === 'contextmenu' && r.options === true));
});

test('right click selects a loose face and opens one Dédalo popup', () => {
  const f = fixture(); f.el.menu.classList.remove('hidden'); rightClick(f);
  assert.deepEqual([...f.doc.sel.faces], [f.app.hit.face]);
  assert.ok(f.el.menu.classList.contains('hidden'));
  assert.equal(f.el.ctx.classList.contains('hidden'), false);
  assert.equal(button(f, 'Crear grupo').disabled, undefined);
});

test('a late native contextmenu landing on the new popup button is prevented', () => {
  const f = fixture(); rightClick(f);
  const before = f.el.ctx.children.length, e = nativeMenu(button(f, 'Crear grupo'));
  assert.equal(e.defaultPrevented, true);
  assert.equal(f.el.ctx.children.length, before);
  assert.equal(f.el.ctx.classList.contains('hidden'), false);
});

test('native menus are suppressed on both canvases, viewport and popup background', () => {
  const f = fixture();
  for (const target of [f.el.ov, f.el.gl, f.el.viewport, f.el.ctx]) assert.equal(nativeMenu(target).defaultPrevented, true);
});

test('native menus remain available in external fields and ordinary page surfaces', () => {
  fixture();
  for (const target of [new Surface('input'), new Surface('textarea'), new Surface('div')]) assert.equal(nativeMenu(target).defaultPrevented, false);
});

test('inline text inputs, textareas, selects and editable text retain native editing menus', () => {
  const f = fixture();
  for (const tag of ['input', 'textarea', 'select', 'div']) {
    const field = new Surface(tag); if (tag === 'div') field.setAttribute('contenteditable', 'true');
    const text = new Surface('span'); field.append(text); f.el.viewport.append(field);
    assert.equal(nativeMenu(text).defaultPrevented, false, tag);
  }
  const readonly = new Surface('div'); readonly.setAttribute('contenteditable', 'false'); f.el.viewport.append(readonly);
  assert.equal(nativeMenu(readonly).defaultPrevented, true);
});

test('dialog and modal content keeps its own native menu even when placed inside the viewport', () => {
  const f = fixture();
  for (const type of ['dialog', 'role', 'modal']) {
    const modal = new Surface(type === 'dialog' ? 'dialog' : 'div');
    if (type === 'role') modal.setAttribute('role', 'dialog');
    if (type === 'modal') modal.classList.add('modal');
    const child = new Surface('p'); modal.append(child); f.el.viewport.append(modal);
    assert.equal(nativeMenu(child).defaultPrevented, false, type);
  }
});

test('right click resolves a group atomically and offers group/component actions', () => {
  const f = fixture('group'); rightClick(f);
  assert.deepEqual([...f.doc.sel.nodes], [f.node]);
  assert.equal(button(f, 'Entrar a editar').disabled, undefined);
  assert.equal(button(f, 'Crear componente').disabled, undefined);
  assert.equal(button(f, 'Hacer único').disabled, true);
});

test('right click resolves a component and enables make-unique without changing its definition', () => {
  const f = fixture('component'), before = JSON.stringify(f.doc.scene.toJSON()); rightClick(f);
  assert.deepEqual([...f.doc.sel.nodes], [f.node]);
  assert.equal(button(f, 'Hacer único').disabled, undefined);
  assert.equal(JSON.stringify(f.doc.scene.toJSON()), before);
});

test('the popup group action still executes and closes both Dédalo menus', () => {
  const f = fixture(); rightClick(f);
  button(f, 'Crear grupo').dispatchEvent(event('click', button(f, 'Crear grupo'), { button: 0 }));
  assert.equal(f.doc.sel.nodes.size, 1);
  assert.equal(f.doc.scene.current([]).nodes[0].kind, 'group');
  assert.ok(f.el.ctx.classList.contains('hidden')); assert.ok(f.el.menu.classList.contains('hidden'));
});

test('Copy is disabled without a selection and available from the editing menu with V', () => {
  const f = fixture();
  D.UI.prototype.buildMenu.call(f.app.ui);
  let copy = f.el.menu.children.find(c => c.innerHTML.includes('<span>Copiar</span>'));
  assert.equal(copy.disabled, true); assert.ok(copy.innerHTML.includes('<kbd>V</kbd>'));
  rightClick(f); D.UI.prototype.buildMenu.call(f.app.ui);
  copy = f.el.menu.children.find(c => c.innerHTML.includes('<span>Copiar</span>'));
  assert.equal(copy.disabled, undefined);
  copy.dispatchEvent(event('click', copy, { button: 0 }));
  assert.equal(f.app.selectedTool, 'copy'); assert.ok(f.el.ctx.classList.contains('hidden'));
});

test('the right-click Copy action selects the dedicated tool without changing the selected object', () => {
  const f = fixture('group'); rightClick(f); const copy = button(f, 'Copiar');
  assert.equal(copy.disabled, undefined);
  copy.dispatchEvent(event('click', copy, { button: 0 }));
  assert.equal(f.app.selectedTool, 'copy'); assert.deepEqual([...f.doc.sel.nodes], [f.node]);
  assert.ok(f.el.ctx.classList.contains('hidden'));
});

test('Escape dismisses the popup first and preserves the selected object', () => {
  const f = fixture('group'); rightClick(f);
  const e = event('keydown', f.el.ctx, { key: 'Escape' }); f.app.onKeyDown(e);
  assert.equal(e.defaultPrevented, true);
  assert.ok(f.el.ctx.classList.contains('hidden'));
  assert.deepEqual([...f.doc.sel.nodes], [f.node]); assert.equal(f.app.cancelCount, 0);
  f.app.onKeyDown(event('keydown', f.el.ov, { key: 'Escape' }));
  assert.equal(f.doc.selectionEmpty(), true, 'normal Escape resumes after the popup is gone');
});

test('Escape on the main menu does not exit an editing context', () => {
  const f = fixture('group'); f.command('context.enter', { node: f.node });
  f.el.menu.classList.remove('hidden');
  f.app.onKeyDown(event('keydown', f.el.menu, { key: 'Escape' }));
  assert.ok(f.el.menu.classList.contains('hidden'));
  assert.deepEqual(f.doc.editPath, [f.node]);
});

test('Escape and modelling shortcuts inside a dialog remain owned by that dialog', () => {
  const f = fixture('group'); rightClick(f); f.app.ui.hideMenus();
  const dialog = new Surface('div'); dialog.setAttribute('role', 'dialog');
  const child = new Surface('button'); dialog.append(child);
  f.app.keyDown = () => { throw new Error('A dialog event reached model shortcuts'); };
  for (const key of ['Escape', 'Delete', 'g']) {
    const e = event('keydown', child, { key }); f.app.onKeyDown(e);
    assert.equal(e.defaultPrevented, false);
  }
  assert.deepEqual([...f.doc.sel.nodes], [f.node]);
});

test('a right-button drag or canceled pointer never opens a leftover popup', () => {
  const f = fixture();
  f.el.ov.dispatchEvent(event('pointerdown', f.el.ov));
  f.el.ov.dispatchEvent(event('pointerup', f.el.ov, { clientX: 180 }));
  assert.ok(f.el.ctx.classList.contains('hidden'));
  f.el.ov.dispatchEvent(event('pointerdown', f.el.ov));
  f.el.ov.dispatchEvent(event('pointercancel', f.el.ov));
  f.el.ov.dispatchEvent(event('pointerup', f.el.ov));
  assert.ok(f.el.ctx.classList.contains('hidden')); assert.equal(f.app.rightDown, null);
});

test('right click cancels an active modelling operation without opening a menu', () => {
  const f = fixture(); f.app.tool.state = 1; rightClick(f);
  assert.equal(f.app.cancelCount, 1); assert.ok(f.el.ctx.classList.contains('hidden'));
  assert.equal(nativeMenu(f.el.ov).defaultPrevented, true);
});

test('outside pointerdown closes the popup while clicks in it remain available', () => {
  const f = fixture(); rightClick(f);
  docEvents.dispatchEvent(event('pointerdown', button(f, 'Crear grupo'), { button: 0 }));
  assert.equal(f.el.ctx.classList.contains('hidden'), false);
  const input = new Surface('input'); docEvents.dispatchEvent(event('pointerdown', input, { button: 0 }));
  assert.ok(f.el.ctx.classList.contains('hidden'));
  assert.equal(nativeMenu(input).defaultPrevented, false);
});

console.log('\n' + passed + ' passed; ' + failed + ' failed.\n');
if (failed) process.exitCode = 1;
