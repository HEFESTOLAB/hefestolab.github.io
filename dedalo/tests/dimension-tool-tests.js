/* Dimension placement contracts; mathematical camera only, no UI or painting. */
'use strict';
const assert = require('node:assert/strict'), path = require('node:path');
const JS = path.join(__dirname, '..', 'app', 'js');
for (const file of ['core/geom', 'core/dimensions', 'core/model', 'core/document', 'core/scene', 'core/hierarchy', 'view/camera', 'tools/base', 'tools/draw', 'tools/select']) require(path.join(JS, file + '.js'));
const D = globalThis.DEDALO, G = D.DimensionGeometry, V = D.V;
let passed = 0, failed = 0;
function test(name, fn) { try { fn(); passed++; console.log('  ok   ' + name); } catch (e) { failed++; console.error('  FALLA ' + name + '\n' + e.stack); } }
function near(a, b) { assert.ok(Number.isFinite(a) && Math.abs(a - b) < 1e-6, a + ' != ' + b); }
function vector(a, b) { a.forEach((n, i) => near(n, b[i])); }
function cmd(doc, name, params) { const r = doc.execute(name, params); assert.ok(r.ok, r.error); return r; }
function screen(cam, p, extra) { const s = cam.project(p); return Object.assign({ x: s.x, y: s.y, button: 0, shift: false }, extra || {}); }
function annotation(tool) { return { a: tool.a, b: tool.b, off: tool.off, offB: tool.offB }; }
function axisLine(value, axis, length) { const p = G.points(value), delta = V.sub(p.b, p.a); for (let i = 0; i < 3; i++) if (i !== axis) near(delta[i], 0); near(Math.abs(delta[axis]), length); }
function fixture(a, b) {
  const doc = new D.Document(), camera = new D.Camera(); camera.target = V.mid(a, b); camera.update();
  const app = { doc, camera, nextSnap: { p: a, type: 'endpoint' }, requestRender() {}, setVCB(v) { this.vcb = v; }, refreshStatus() {}, toast(message) { this.lastMessage = message; } };
  app.inference = { infer: () => app.nextSnap };
  const tool = new D.tools.DimTool(app); tool.activate();
  tool.onDown(screen(camera, a)); app.nextSnap = { p: b, type: 'endpoint' }; tool.onDown(screen(camera, b));
  assert.equal(tool.state, 2); return { doc, camera, app, tool };
}

console.log('\nDédalo — cotas sobre ejes y cota alineada, sin renderizado\n');

test('geometría proyectada X/Y/Z mide la componente y mantiene la línea paralela al eje', () => {
  const a = [1, 2, 3], b = [5, 7, 9];
  assert.deepEqual(G.validAxes(a, b), [0, 1, 2]); assert.equal(G.dominantAxis(a, b), 2);
  for (let axis = 0; axis < 3; axis++) for (let q = 0; q < 3; q++) if (q !== axis) {
    const layout = G.axisLayout(a, b, axis, q, -2); axisLine(layout, axis, b[axis] - a[axis]); near(G.measure(layout), b[axis] - a[axis]);
  }
});

test('arista vertical de un cubo conserva cota vertical con separación por X o Y en ambas caras', () => {
  const doc = new D.Document(); cmd(doc, 'draw.rectangle', { origin: [0, 0, 0], width: 2, height: 2 });
  cmd(doc, 'face.pushPull', { face: [...doc.model.faces.keys()][0], distance: 3 });
  const edge = [...doc.model.edges.values()].find(e => { const a = doc.model.P(e.a), b = doc.model.P(e.b); return Math.abs(a[2] - b[2]) > 2.9 && a[0] === b[0] && a[1] === b[1]; });
  const a = doc.model.P(edge.a), b = doc.model.P(edge.b), camera = new D.Camera(); camera.target = V.mid(a, b); camera.update();
  const app = { doc, camera, inference: { infer: () => ({ type: 'onEdge', edge: edge.id, p: V.mid(a, b) }) }, requestRender() {}, setVCB() {}, toast() {} };
  const tool = new D.tools.DimTool(app); tool.activate(); tool.onDown(screen(camera, V.mid(a, b))); assert.equal(tool.axis, 2);
  for (const q of [0, 1]) for (const sign of [-1, 1]) {
    tool.offsetAxis = null; const p = V.mid(a, b); p[q] += sign * 2; tool.onMove(screen(camera, p));
    axisLine(annotation(tool), 2, 3); assert.equal(tool.offsetAxis, q); near(tool.off[q], sign * 2);
    near(tool.off[1 - q], 0); near(tool.offB[1 - q], 0);
  }
});

test('el gesto elige separación ortogonal en perspectivas y órbitas distintas', () => {
  const a = [0, 0, 0], b = [0, 0, 3];
  for (const perspective of [true, false]) for (const yaw of [-2.1, -1.15, 0.6]) for (const pitch of [0.15, 0.65]) {
    const camera = new D.Camera(); Object.assign(camera, { target: V.mid(a, b), yaw, pitch, persp: perspective }); camera.update();
    for (const q of [0, 1]) for (const distance of [-1.5, 1.5]) {
      const target = V.mid(a, b); target[q] += distance;
      const layout = G.place(camera, a, b, 2, screen(camera, target), false);
      axisLine(layout, 2, 3); assert.equal(layout.offsetAxis, q); near(layout.off[q], distance); near(layout.off[1 - q], 0);
    }
  }
});

test('vistas frontales y casi paralelas generan valores finitos y ninguna diagonal de cota', () => {
  for (const view of ['front', 'right', 'top']) {
    const { tool, camera } = fixture([0, 0, 0], [0, 0, 3]); camera.setView(view);
    const mid = camera.project([0, 0, 1.5]); tool.onMove({ x: mid.x + 80, y: mid.y - 30, shift: false });
    assert.ok(tool.off.every(Number.isFinite)); assert.ok(tool.offB.every(Number.isFinite)); axisLine(annotation(tool), 2, 3);
  }
});

test('flechas eligen X/Y/Z y avisan si ese eje mide cero', () => {
  const { tool, app } = fixture([0, 0, 0], [2, 0, 3]); assert.equal(tool.axis, 2);
  tool.onKey({ key: 'ArrowRight' }); assert.equal(tool.axis, 0); axisLine(annotation(tool), 0, 2);
  assert.equal(tool.onKey({ key: 'ArrowLeft' }), true); assert.equal(tool.axis, 0); assert.match(app.lastMessage, /eje Y/);
  tool.onKey({ key: 'ArrowUp' }); assert.equal(tool.axis, 2); axisLine(annotation(tool), 2, 3);
  const all = fixture([0, 0, 0], [2, 4, 3]); all.tool.onKey({ key: 'ArrowLeft' }); assert.equal(all.tool.axis, 1); axisLine(annotation(all.tool), 1, 4);
});

test('Tab alterna únicamente ejes de longitud no nula', () => {
  const { tool } = fixture([0, 0, 0], [2, 0, 3]);
  tool.onKey({ key: 'Tab' }); assert.equal(tool.axis, 0); tool.onKey({ key: 'Tab' }); assert.equal(tool.axis, 2);
  const vertical = fixture([0, 0, 0], [0, 0, 3]); for (let i = 0; i < 4; i++) vertical.tool.onKey({ key: 'Tab' }); assert.equal(vertical.tool.axis, 2);
});

test('Mayús mantenido da distancia real alineada y soltar recupera la componente del eje', () => {
  const { tool, camera } = fixture([0, 0, 0], [3, 0, 4]);
  tool.onMove(screen(camera, [1.5, 2, 2])); near(G.measure(annotation(tool)), 4);
  tool.onKey({ key: 'Shift' }); assert.equal(tool.aligned, true); near(G.measure(annotation(tool)), 5); vector(tool.off, tool.offB);
  near(V.dot(tool.off, V.sub(tool.b, tool.a)), 0); tool.onKeyUp({ key: 'Shift' }); near(G.measure(annotation(tool)), 4); axisLine(annotation(tool), 2, 4);
});

test('último clic actualiza la separación y el archivo conserva offB y medida', () => {
  const { doc, tool, camera } = fixture([0, 0, 0], [3, 0, 4]), before = JSON.stringify(doc.scene.toJSON()), history = doc.undoStack.length;
  tool.onMove(screen(camera, [1.5, 1, 2])); assert.equal(JSON.stringify(doc.scene.toJSON()), before);
  tool.onDown(screen(camera, [1.5, 3, 2])); assert.equal(tool.state, 0); assert.equal(doc.undoStack.length, history + 1);
  const annot = [...doc.model.annots.values()][0]; assert.ok(Array.isArray(annot.offB)); near(G.points(annot).a[1], 3); axisLine(annot, 2, 4);
  const restored = new D.Document(); restored.loadJSON(JSON.parse(JSON.stringify(doc.fileJSON())));
  const loaded = [...restored.model.annots.values()][0]; assert.deepEqual(loaded.offB, annot.offB); near(G.measure(loaded), 4);
  doc.undo(); assert.equal(doc.model.annots.size, 0);
});

test('vista previa delega el mismo descriptor geométrico que una cota guardada', () => {
  const { tool } = fixture([0, 0, 0], [3, 0, 4]); let received;
  tool.drawOverlay({ dimension(a, color, options) { received = { a, color, options }; } });
  assert.deepEqual(received.a, annotation(tool)); assert.equal(received.options.preview, true); near(G.measure(received.a), 4);
});

test('cotas antiguas y alineadas conservan la distancia real entre anclajes', () => {
  const legacy = { a: [0, 0, 0], b: [3, 0, 4], off: [0, 2, 0] }; near(G.measure(legacy), 5);
  const aligned = G.alignedLayout(legacy.a, legacy.b, 1, 2); near(G.measure(aligned), 5); vector(aligned.off, aligned.offB);
  assert.throws(() => G.axisLayout([0, 0, 0], [0, 0, 3], 0, 1, 2), /longitud/);
});

test('diagonal diminuta aceptada siempre encuentra un eje con componente no nula', () => {
  const { tool, doc, camera } = fixture([0, 0, 0], [8e-7, 8e-7, 0]);
  assert.equal(tool.axis, 0); assert.deepEqual(G.validAxes(tool.a, tool.b), [0, 1]);
  assert.ok(Number.isFinite(G.measure(annotation(tool)))); assert.ok(Math.abs(G.measure(annotation(tool)) - 8e-7) < 1e-12);
  tool.onDown(screen(camera, [4e-7, 1, 0])); assert.equal(tool.state, 0); assert.equal(doc.model.annots.size, 1);
  const annot = [...doc.model.annots.values()][0]; assert.ok(Math.abs(G.measure(annot) - 8e-7) < 1e-12);
});

test('recolocar cota existente reforma el eje y cancelar conserva exactamente el original', () => {
  const { doc, tool } = fixture([0, 0, 0], [3, 0, 4]); tool.cancel();
  cmd(doc, 'dim.add', { a: [0, 0, 0], b: [3, 0, 4], offset: [1, 2, -0.4] });
  const original = [...doc.model.annots.values()][0], before = JSON.stringify(doc.scene.toJSON()), history = doc.undoStack.length;
  assert.equal(tool.edit(original), true); assert.equal(tool.editId, original.id); axisLine(annotation(tool), 2, 4);
  tool.cancel(); assert.equal(tool.editId, null); assert.equal(JSON.stringify(doc.scene.toJSON()), before); assert.equal(doc.undoStack.length, history);
});

test('confirmar recolocación conserva el ID, guardado y una sola cota', () => {
  const { doc, tool, camera } = fixture([0, 0, 0], [3, 0, 4]); tool.cancel();
  cmd(doc, 'dim.add', { a: [0, 0, 0], b: [3, 0, 4], offset: [1, 2, -0.4] });
  const original = [...doc.model.annots.values()][0], id = original.id, before = JSON.stringify(doc.scene.toJSON());
  tool.edit(original); tool.onDown(screen(camera, [1.5, -3, 2]));
  assert.equal(doc.model.annots.size, 1); const updated = doc.model.annots.get(id); assert.ok(updated); axisLine(updated, 2, 4);
  const restored = new D.Document(); restored.loadJSON(JSON.parse(JSON.stringify(doc.fileJSON()))); assert.equal(restored.model.annots.size, 1); assert.ok(restored.model.annots.get(id));
  doc.undo(); assert.equal(JSON.stringify(doc.scene.toJSON()), before);
});

console.log('\n' + passed + ' pruebas superadas; ' + failed + ' fallidas.');
if (failed) process.exitCode = 1;
