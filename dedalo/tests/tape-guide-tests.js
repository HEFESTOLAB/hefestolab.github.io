/* Tape and guide regression contracts. Pure CPU; no DOM, canvas or server. */
'use strict';
const assert = require('node:assert/strict'), path = require('node:path');
const JS = path.join(__dirname, '..', 'app', 'js');
for (const file of ['core/geom', 'core/dimensions', 'core/model', 'core/document', 'core/scene', 'core/hierarchy', 'view/camera', 'view/inference', 'tools/base', 'tools/draw', 'tools/select']) require(path.join(JS, file + '.js'));
const D = globalThis.DEDALO, V = D.V;
let passed = 0, failed = 0;
function test(name, fn) { try { fn(); passed++; console.log('  ok   ' + name); } catch (e) { failed++; console.error('  FALLA ' + name + '\n' + e.stack); } }
function near(a, b) { assert.ok(Number.isFinite(a) && Math.abs(a - b) < 1e-6, a + ' != ' + b); }
function vector(a, b) { a.forEach((n, i) => near(n, b[i])); }
function cmd(doc, name, params) { const r = doc.execute(name, params); assert.ok(r.ok, r.error); return r; }
function screen(camera, p) { const s = camera.project(p); return { x: s.x, y: s.y, button: 0 }; }
function appFor(doc) {
  const camera = new D.Camera(), app = { doc, camera, renderer: { opts: { xray: true, showGuides: true, showAxes: false, showHidden: false } },
    requestRender() {}, refreshStatus() {}, setVCB(value) { this.vcb = value; }, toast(message, kind) { this.message = { message, kind }; } };
  app.inference = new D.Inference(app); return app;
}
function begin(doc, snap, app) {
  app = app || appFor(doc); const tool = new D.tools.TapeTool(app); tool.activate();
  const original = app.inference.infer; app.inference.infer = () => snap;
  tool.onDown(screen(app.camera, snap.p)); app.inference.infer = original; assert.equal(tool.state, 1); return { app, tool };
}
function box() { const doc = new D.Document(); cmd(doc, 'draw.rectangle', { origin: [0, 0, 0], width: 4, height: 4 }); cmd(doc, 'face.pushPull', { face: [...doc.model.faces.keys()][0], distance: 3 }); return doc; }
function sourceEdge(doc, a, b) { const aid = doc.model.findVertex(a), bid = doc.model.findVertex(b); return doc.model.findEdge(aid, bid); }
function lastGuide(doc) { return [...doc.model.annots.values()].at(-1); }

console.log('\nDédalo — cinta métrica y guías sin renderizado\n');

test('punto medio de arista crea paralela y acepta separación numérica sin mover', () => {
  const doc = box(), edge = sourceEdge(doc, [0, 0, 0], [4, 0, 0]);
  const { tool } = begin(doc, { type: 'midpoint', edge, p: [2, 0, 0] }); const start = tool.start.slice(), direction = tool.edgeDir.slice();
  assert.equal(tool.onVCB('250mm'), true); const guide = lastGuide(doc); assert.equal(guide.kind, 'guideLine'); near(V.len(V.cross(guide.dir, direction)), 0);
  near(V.dist(guide.p, start), 0.25); near(V.dot(V.sub(guide.p, start), direction), 0);
});

test('desde un punto la entrada inmediata crea un punto guía sobre el plano', () => {
  const doc = new D.Document(), app = appFor(doc); app.renderer.opts.showGuides = false;
  const { tool } = begin(doc, { type: 'endpoint', p: [1, 1, 0] }, app); tool.onVCB('1m');
  const guide = lastGuide(doc); assert.equal(guide.kind, 'guidePoint'); vector(guide.from, [1, 1, 0]); vector(guide.p, [2, 1, 0]); assert.equal(app.renderer.opts.showGuides, true);
});

test('arista vertical permite separación exacta en las dos caras y a ambos lados', () => {
  for (const q of [0, 1]) for (const sign of [-1, 1]) {
    const doc = box(), edge = sourceEdge(doc, [0, 0, 0], [0, 0, 3]), start = [0, 0, 1.5];
    const { tool, app } = begin(doc, { type: 'onEdge', edge, p: start }); const target = start.slice(); target[q] += sign * 1.3;
    tool.onMove(screen(app.camera, target)); assert.ok(tool.measure(tool.snap.p) > 1.29, JSON.stringify({ q, sign, snap: tool.snap, plane: tool.plane })); near(tool.measure(tool.snap.p), 1.3); near(tool.snap.p[q], sign * 1.3); near(tool.snap.p[1 - q], 0); near(tool.snap.p[2], 1.5);
    tool.onDown(screen(app.camera, target)); assert.equal(lastGuide(doc).kind, 'guideLine'); near(V.dot(lastGuide(doc).dir, [0, 0, 1]), 1);
  }
});

test('salir del contorno superior conserva su cota Z y no cae al plano del suelo', () => {
  const doc = box(), edge = sourceEdge(doc, [0, 0, 3], [4, 0, 3]), { tool, app } = begin(doc, { type: 'midpoint', edge, p: [2, 0, 3] });
  tool.onMove(screen(app.camera, [2, -2, 3])); near(tool.snap.p[2], 3); near(tool.snap.p[1], -2); near(tool.measure(tool.snap.p), 2);
});

test('desde una cara vertical se conserva el plano incluso fuera del contorno', () => {
  const doc = box(), face = [...doc.model.faces.values()].find(f => f.n[1] < -0.99).id;
  const { tool, app } = begin(doc, { type: 'onFace', face, faceHit: { fid: face }, p: [1.1, 0, 1.1] });
  tool.onMove(screen(app.camera, [-1.7, 0, 2.4])); near(tool.snap.p[1], 0); vector(tool.snap.p, [-1.7, 0, 2.4]);
});

test('flechas permiten VCB inmediato y rechazan ejes paralelos a la arista', () => {
  const doc = box(), edge = sourceEdge(doc, [0, 0, 0], [0, 0, 3]), { tool, app } = begin(doc, { type: 'midpoint', edge, p: [0, 0, 1.5] });
  tool.onKey({ key: 'ArrowUp' }); assert.equal(tool.lock, null); assert.match(app.message.message, /paralelo/);
  tool.onKey({ key: 'ArrowRight' }); tool.onVCB('1.5m'); vector(lastGuide(doc).p, [1.5, 0, 1.5]);
  const other = begin(doc, { type: 'endpoint', p: [1, 1, 0] }); other.tool.onKey({ key: 'ArrowUp' }); other.tool.onVCB('-2m'); vector(lastGuide(doc).p, [1, 1, -2]);
});

test('Mayús bloquea y libera la dirección actual sin perder distancia numérica', () => {
  const doc = new D.Document(), { tool, app } = begin(doc, { type: 'endpoint', p: [0, 0, 0] });
  tool.onMove(screen(app.camera, [2, 0, 0])); tool.onKey({ key: 'Shift' }); assert.equal(tool.lock.shift, true);
  tool.onMove(screen(app.camera, [2, 1, 0])); near(tool.snap.p[1], 0); tool.onKeyUp({ key: 'Shift' }); assert.equal(tool.lock, null);
  tool.onKey({ key: 'ArrowLeft' }); tool.onVCB('2m'); near(lastGuide(doc).p[1], 2);
});

test('arista paralela a la vista tiene separación finita en vez de atascarse', () => {
  const doc = new D.Document(), app = appFor(doc), dir = app.camera.forward(), a = V.scale(dir, -2), b = V.scale(dir, 2);
  cmd(doc, 'draw.line', { points: [a, b] }); const edge = [...doc.model.edges.keys()][0], { tool } = begin(doc, { type: 'midpoint', edge, p: [0, 0, 0] }, app);
  const s = app.camera.project([0, 0, 0]); tool.onMove({ x: s.x + 80, y: s.y, button: 0 }); assert.ok(tool.measure(tool.snap.p) > 0); assert.ok(tool.snap.p.every(Number.isFinite));
  tool.onVCB('1m'); near(V.len(lastGuide(doc).p), 1); near(V.len(V.cross(lastGuide(doc).dir, dir)), 0);
});

test('snap preferente identifica guía y respeta el plano de trabajo', () => {
  const doc = new D.Document(); cmd(doc, 'guide.add', { point: [0, 1, 2], direction: [1, 0, 0] }); const id = lastGuide(doc).id, app = appFor(doc), at = screen(app.camera, [2, 1, 2]);
  const snap = app.inference.infer(at.x, at.y, { start: [0, 0, 2], plane: { n: [0, 0, 1], d: 2 }, preferGuides: true });
  assert.equal(snap.type, 'guide'); assert.equal(snap.guide, id); vector(snap.guideDir, [1, 0, 0]); vector(snap.p, [2, 1, 2]);
  const elsewhere = app.inference.infer(at.x, at.y, { plane: { n: [0, 0, 1], d: 0 }, preferGuides: true }); assert.notEqual(elsewhere.type, 'guide');
});

test('guía que atraviesa una cara engancha en su intersección exacta', () => {
  const doc = new D.Document(); cmd(doc, 'guide.add', { point: [1, 1, -1], direction: [0, 0, 1] }); const app = appFor(doc), at = screen(app.camera, [1, 1, 0]);
  const snap = app.inference.infer(at.x, at.y, { plane: { n: [0, 0, 1], d: 0 }, preferGuides: true }); assert.equal(snap.type, 'guide'); vector(snap.p, [1, 1, 0]);
});

test('guías ocultas no atraen el cursor y punto guía no se confunde con recta coincidente', () => {
  const doc = new D.Document(); cmd(doc, 'guide.add', { point: [1, 1, 0] }); const pointId = lastGuide(doc).id;
  cmd(doc, 'guide.add', { point: [1, 1, 0], direction: [1, 0, 0] }); const app = appFor(doc), at = screen(app.camera, [1, 1, 0]);
  const snap = app.inference.infer(at.x, at.y, { preferGuides: true }); assert.equal(snap.guide, pointId); assert.equal(snap.guideDir, undefined);
  const { tool } = begin(doc, snap, app); assert.equal(tool.edgeDir, null); tool.cancel(); app.renderer.opts.showGuides = false;
  assert.notEqual(app.inference.infer(at.x, at.y, { preferGuides: true }).type, 'guide');
});

test('guía existente se reconoce por ID y crea otra paralela a distancia exacta', () => {
  const doc = new D.Document(); cmd(doc, 'guide.add', { point: [1, 1, 2], direction: [1, 0, 0] }); const app = appFor(doc), tool = new D.tools.TapeTool(app); tool.activate();
  tool.onDown(screen(app.camera, [1, 1, 2])); assert.equal(tool.state, 1); vector(tool.edgeDir, [1, 0, 0]);
  tool.onVCB('250mm'); const guide = lastGuide(doc); assert.equal(doc.model.annots.size, 2); assert.equal(guide.kind, 'guideLine'); vector(guide.dir, [1, 0, 0]); near(V.dist(guide.p, [1, 1, 2]), 0.25);
});

test('distancia negativa invierte el lado indicado con el cursor al separar una arista', () => {
  const doc = box(), edge = sourceEdge(doc, [0, 0, 0], [0, 0, 3]), { tool, app } = begin(doc, { type: 'onEdge', edge, p: [0, 0, 1.5] });
  tool.onMove(screen(app.camera, [1.3, 0, 1.5])); tool.onVCB('-1m'); vector(lastGuide(doc).p, [-1, 0, 1.5]);
});

test('modo solo medir y cancelar no alteran el documento; crear permite deshacer y guardar', () => {
  const doc = new D.Document(), { tool } = begin(doc, { type: 'endpoint', p: [1, 1, 0] }), before = JSON.stringify(doc.scene.toJSON());
  tool.guides = false; tool.onVCB('1m'); assert.equal(JSON.stringify(doc.scene.toJSON()), before);
  const next = begin(doc, { type: 'endpoint', p: [1, 1, 0] }); next.tool.onMove(screen(next.app.camera, [3, 1, 0])); next.tool.cancel(); assert.equal(JSON.stringify(doc.scene.toJSON()), before);
  const create = begin(doc, { type: 'endpoint', p: [1, 1, 0] }); create.tool.onVCB('1m'); const saved = new D.Document(); saved.loadJSON(JSON.parse(JSON.stringify(doc.fileJSON()))); assert.equal(saved.model.annots.size, 1);
  doc.undo(); assert.equal(doc.model.annots.size, 0);
});

test('un fallo guide.add se comunica y conserva la herramienta para corregirlo', () => {
  const doc = new D.Document(), { tool, app } = begin(doc, { type: 'endpoint', p: [1, 1, 0] });
  doc.execute = () => ({ ok: false, error: 'Fallo controlado' }); tool.onVCB('1m'); assert.equal(tool.state, 1); assert.equal(app.message.kind, 'error'); assert.match(app.message.message, /Fallo controlado/);
});

console.log('\n' + passed + ' pruebas superadas; ' + failed + ' fallidas.');
if (failed) process.exitCode = 1;
