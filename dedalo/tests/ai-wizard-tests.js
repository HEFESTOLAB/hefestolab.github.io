/* UI event flow with a tiny in-memory element double. No browser, canvas or server. */
'use strict';
const assert = require('node:assert/strict');
class Element {
  constructor(tag) { this.tagName = tag.toUpperCase(); this.children = []; this.dataset = {}; this.events = {}; this.attrs = {}; this.className = ''; this.parentNode = null; this._text = ''; this.classList = { add: n => { this.className += ' ' + n; } }; }
  append(...nodes) { for (let n of nodes) { if (typeof n === 'string') { const t = new Element('#text'); t.textContent = n; n = t; } n.parentNode = this; this.children.push(n); } }
  replaceChildren(...nodes) { for (const n of this.children) n.parentNode = null; this.children = []; this._text = ''; this.append(...nodes); }
  set textContent(t) { this.replaceChildren(); this._text = String(t); }
  get textContent() { return this._text + this.children.map(n => n.textContent).join(''); }
  get isConnected() { return this === document.body || !!this.parentNode && this.parentNode.isConnected; }
  setAttribute(k, v) { this.attrs[k] = String(v); }
  addEventListener(k, fn) { (this.events[k] ||= []).push(fn); }
  async event(k) { if (this.disabled) return; for (const fn of this.events[k] || []) await fn({ target: this }); }
  querySelector(selector) { return all(this).find(n => selector.startsWith('.') ? n.className.split(/\s+/).includes(selector.slice(1)) : n.tagName === selector.toUpperCase()) || null; }
  focus() {} select() {}
}
function all(node, tag) { return node.children.flatMap(n => [...(!tag || n.tagName === tag.toUpperCase() ? [n] : []), ...all(n, tag)]); }
globalThis.document = { body: new Element('body'), createElement: tag => new Element(tag), createTextNode: text => { const t = new Element('#text'); t.textContent = text; return t; } };
globalThis.location = new URL('https://hefestolab.github.io/dedalo/?seguro');
globalThis.history = { replaceState(_a, _b, href) { globalThis.location = new URL(href); } };
globalThis.DEDALO = { UI: class {} };
require('../app/js/ui/mcp-ui.js'); const D = globalThis.DEDALO;
function fixture() {
  const ui = new D.UI(), body = new Element('div'), panel = new Element('aside'), calls = []; body.className = 'panel-body'; panel.append(body); document.body.append(panel);
  let connected = false;
  const bridge = { status: () => ({ connected, connecting: false, error: '', state: { permissions: { write: true }, name: 'test' } }), async connect(p) { calls.push(p); connected = true; ui.refreshMCP(); return true; }, async disconnect() { connected = false; ui.refreshMCP(); } };
  ui.el = { panel }; ui.panel = 'ai'; ui.mcpButton = new Element('button'); ui.app = { mcpBridge: bridge, toast() {} }; ui.openPanel = id => { ui.panel = id; ui.panel_ai(body, true); };
  ui.panel_ai(body, true); return { ui, body, calls, bridge, setConnected: v => { connected = v; } };
}
const button = (body, label) => { const n = all(body, 'button').find(n => n.textContent === label); assert.ok(n, label); return n; };
const cases = [], test = (name, run) => cases.push({ name, run });
test('no network or model sharing before an explicit connection click', () => { const f = fixture(); assert.equal(f.calls.length, 0); assert.match(f.body.textContent, /Tu IA/); assert.equal(f.ui.mcpButton.textContent, 'Unir IA'); });
test('Claude download comes from a real anchor and installation is user confirmed', async () => { const f = fixture(); await button(f.body, 'Continuar con Claude Desktop').event('click'); const a = all(f.body, 'a').find(n => n.download === ''); assert.equal(a.href, 'downloads/DEDALO_MCP_CLAUDE_v0.6.1.mcpb'); assert.equal(f.calls.length, 0); await a.event('click'); assert.match(f.body.textContent, /Descarga solicitada/); assert.match(f.body.textContent, /Instalar extensión/); });
test('Codex gets ZIP and stdio configuration, with a separate installed step', async () => { const f = fixture(); await button(f.body, 'Codex').event('click'); await button(f.body, 'Continuar con Codex').event('click'); assert.equal(all(f.body, 'a').find(n => n.download === '').href, 'downloads/DEDALO_MCP_LOCAL_v0.6.1.zip'); assert.match(all(f.body, 'textarea')[0].value, /^codex mcp add dedalo -- node/); assert.equal(f.calls.length, 0); });
test('pair link is removed from address, prefills code and never auto-authorises', () => { globalThis.location = new URL('http://127.0.0.1:43128/dedalo/?conector=1#dedalo-pair=ABCD1234'); const f = fixture(); f.ui.consumePairLink(); assert.equal(location.hash, ''); assert.equal(f.ui.aiWizard.step, 2); assert.equal(f.ui.mcpFields.code.value, 'ABCD1234'); assert.equal(f.ui.mcpFields.port.value, '43128'); assert.equal(f.calls.length, 0); });
test('explicit connect uses the permission choices and displays active status', async () => { globalThis.location = new URL('https://hefestolab.github.io/dedalo/'); const f = fixture(); await button(f.body, 'Ya lo tengo instalado').event('click'); f.ui.mcpFields.code.value = 'ABCD1234'; f.ui.mcpFields.write.checked = false; await button(f.body, 'Unir mi IA a este modelo').event('click'); assert.equal(f.calls.length, 1); assert.equal(f.calls[0].write, false); assert.equal(f.calls[0].snapshot, false); assert.match(f.body.textContent, /4\. IA conectada/); assert.equal(f.ui.mcpButton.textContent, 'IA conectada'); });
test('lost session refreshes the visible ready page instead of claiming connected', () => { const f = fixture(); f.setConnected(true); f.ui.refreshMCP(); assert.match(f.body.textContent, /4\. IA conectada/); f.setConnected(false); f.ui.refreshMCP(); assert.match(f.body.textContent, /La sesión se ha cerrado/); assert.ok(!f.body.textContent.includes('4. IA conectada')); assert.equal(f.ui.mcpButton.textContent, 'Unir IA'); });
test('installed local copy does not link to a recursively missing connector archive', async () => { globalThis.location = new URL('http://127.0.0.1:43127/dedalo/?conector=1'); const f = fixture(); await button(f.body, 'Continuar con Claude Desktop').event('click'); assert.equal(all(f.body, 'a').filter(n => n.download === '').length, 0); });
test('malformed pair fragments and shell interpolation in paths are rejected', () => { assert.equal(D.AISetup.pairFragment({ hash: '#dedalo-pair=%3Cscript%3E' }), null); for (const p of ['test\nrm', '$(secret)/server.mjs', '";cmd', '`whoami`']) assert.throws(() => D.AISetup.config('codex', p)); assert.match(D.AISetup.config('other', 'C:/D/server.mjs'), /mcpServers/); });
(async () => { let passed = 0; for (const t of cases) { await t.run(); passed++; console.log('ok ' + t.name); } console.log(passed + ' correctas, 0 fallidas'); })().catch(e => { console.error(e); process.exitCode = 1; });

