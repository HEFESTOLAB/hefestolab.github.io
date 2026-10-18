/*
 * Contrato de Overlay.dimension y delegación de drawAnnotations.
 * Solo dobles inertes de g/line3/label2/cámara; sin canvas, DOM, render ni GPU.
 */
'use strict';
const assert = require('node:assert/strict');
const path = require('node:path');
require(path.join(__dirname, '..', 'app', 'js', 'core', 'geom.js'));
require(path.join(__dirname, '..', 'app', 'js', 'core', 'dimensions.js'));
require(path.join(__dirname, '..', 'app', 'js', 'view', 'overlay.js'));
const D = globalThis.DEDALO;
let passed = 0, failed = 0;
const failures = [];
function test(name, run) {
  try { run(); passed++; console.log('  ok   ' + name); }
  catch (error) { failed++; failures.push(name); console.error('  FALLA ' + name + '\n        ' + String(error.stack || error).split('\n').slice(0, 5).join('\n        ')); }
}
function near(actual, expected) { assert.ok(Number.isFinite(actual) && Math.abs(actual - expected) < 1e-9, actual + ' ≠ ' + expected); }
function vector(actual, expected) { assert.equal(actual.length, expected.length); actual.forEach((n, i) => near(n, expected[i])); }
function fixture() {
  const out = Object.create(D.Overlay.prototype), calls = { lines: [], labels: [], arrows: [], depth: 0 };
  out.app = { tool: { id: 'select', state: 0 }, renderer: { opts: { showGuides: false } },
    camera: { project: p => ({ x: 100 * (p[0] + p[2] * 0.25), y: 100 * (p[1] + p[2] * 0.5), behind: false }), pixelSize: () => 0.01 } };
  out.g = {
    save() { calls.depth++; }, restore() { calls.depth--; }, translate(x, y) { calls.arrows.push([x, y]); }, rotate() {},
    beginPath() {}, moveTo() {}, lineTo() {}, closePath() {}, fill() {}
  };
  out.line3 = (a, b, color, width, dash) => calls.lines.push({ a: a.slice(), b: b.slice(), color, width, dash });
  out.label2 = (x, y, text, options) => {
    calls.labels.push({ x, y, text, options, depth: calls.depth }); return { x: x - 20, y: y - 10, w: 40, h: 20 };
  };
  return { overlay: out, calls };
}
function annotation(axis) {
  const a = { id: 7, kind: 'dim', a: [0, 0, 0], b: [3, 4, 12] };
  if (axis === 'x') return { ...a, off: [0, 7, 0], offB: [0, 3, -12] };
  if (axis === 'y') return { ...a, off: [-2, 0, 0], offB: [-5, 0, -12] };
  if (axis === 'z') return { ...a, off: [-2, 0, 0], offB: [-5, -4, 0] };
  return { ...a, off: [0, 2, 0] };
}

console.log('\nDédalo — contrato CPU de la capa de cotas (dobles inertes)\n');

for (const [axis, expected, endpoints] of [
  ['x', 3, [[0, 7, 0], [3, 7, 0]]], ['y', 4, [[-2, 0, 0], [-2, 4, 0]]], ['z', 12, [[-2, 0, 0], [-2, 0, 12]]]
]) test('dimension dibuja línea central ' + axis.toUpperCase() + ' y etiqueta la medida proyectada', () => {
  const { overlay, calls } = fixture(), a = annotation(axis), hit = overlay.dimension(a, '#123456');
  const central = calls.lines.find(c => c.width === 1.2); assert.ok(central); vector(central.a, endpoints[0]); vector(central.b, endpoints[1]);
  assert.equal(central.color, '#123456'); assert.equal(calls.labels.length, 1); assert.equal(calls.labels[0].text, D.units.fmtLen(expected));
  assert.equal(calls.labels[0].depth, 0, 'texto dibujado fuera de la rotación de flechas'); assert.equal(calls.depth, 0); assert.equal(calls.arrows.length, 2);
  assert.deepEqual(hit, { x: calls.labels[0].x - 20, y: calls.labels[0].y - 10, w: 40, h: 20 });
});

test('dimension conserva longitud diagonal de legacy sin offB', () => {
  const { overlay, calls } = fixture(); overlay.dimension(annotation());
  const central = calls.lines.find(c => c.width === 1.2); vector(central.a, [0, 2, 0]); vector(central.b, [3, 6, 12]);
  assert.equal(calls.labels[0].text, D.units.fmtLen(13)); assert.equal(calls.depth, 0);
});

test('dimension respeta texto personalizado sin alterar la geometría de medida', () => {
  const { overlay, calls } = fixture(), a = annotation('x'); a.text = 'Luz útil'; overlay.dimension(a);
  assert.equal(calls.labels[0].text, 'Luz útil'); const central = calls.lines.find(c => c.width === 1.2); vector(central.a, [0, 7, 0]); vector(central.b, [3, 7, 0]);
});

test('dimension corta saca flechas y etiqueta fuera, conservando la línea central exacta', () => {
  const { overlay, calls } = fixture(), a = { id: 1, kind: 'dim', a: [0, 0, 0], b: [0.1, 0, 0], off: [0, 1, 0] };
  overlay.dimension(a); const central = calls.lines.filter(c => c.width === 1.2); assert.equal(central.length, 3);
  vector(central[0].a, [0, 1, 0]); vector(central[0].b, [0.1, 1, 0]);
  assert.ok(calls.labels[0].x > overlay.cam.project([0.1, 1, 0]).x); assert.equal(calls.labels[0].text, D.units.fmtLen(0.1));
});

test('dimension oculta no crea etiqueta ni hit para extremos detrás de cámara', () => {
  const { overlay, calls } = fixture(); overlay.app.camera.project = () => ({ x: 0, y: 0, behind: true });
  assert.equal(overlay.dimension(annotation('x')), null); assert.equal(calls.labels.length, 0); assert.equal(calls.arrows.length, 0);
});

test('dimension de proyección puntual no crea etiqueta ni flechas espurias', () => {
  const { overlay, calls } = fixture(); overlay.app.camera.project = () => ({ x: 1, y: 1, behind: false });
  assert.equal(overlay.dimension(annotation('x')), null); assert.equal(calls.labels.length, 0); assert.equal(calls.depth, 0);
});

test('drawAnnotations delega cotas, colores y rectángulos de selección a dimension', () => {
  const { overlay } = fixture(), a = annotation('x'), b = { ...annotation('y'), id: 8 }, c = { ...annotation('z'), id: 9 }, calls = [];
  overlay.dimension = (value, color) => { calls.push({ value, color }); return { x: value.id, y: 1, w: 40, h: 20 }; };
  overlay.drawAnnotations({ annots: new Map([[a.id, a], [b.id, b], [c.id, c]]) }, { annots: new Set([7]) }, 8);
  assert.deepEqual(calls.map(x => x.value), [a, b, c]); assert.deepEqual(calls.map(x => x.color), ['#1f5fe0', '#e06a1f', '#1c1e21']);
  assert.deepEqual(overlay.hits, [7, 8, 9].map(id => ({ id, x: id, y: 1, w: 40, h: 20 })));
});

test('drawAnnotations omite hit cuando dimension devuelve null', () => {
  const { overlay } = fixture(), a = annotation('x'); overlay.dimension = () => null;
  overlay.drawAnnotations({ annots: new Map([[a.id, a]]) }, { annots: new Set() }); assert.deepEqual(overlay.hits, []);
});

test('drawAnnotations suprime cota guardada durante su recolocación para evitar duplicado', () => {
  const { overlay } = fixture(), a = annotation('x'), b = { ...annotation('y'), id: 8 }, calls = [];
  overlay.app.tool = { id: 'dim', state: 2, editId: a.id };
  overlay.dimension = value => { calls.push(value.id); return { x: 0, y: 0, w: 1, h: 1 }; };
  overlay.drawAnnotations({ annots: new Map([[a.id, a], [b.id, b]]) }, { annots: new Set() });
  assert.deepEqual(calls, [8]); assert.deepEqual(overlay.hits.map(h => h.id), [8]);
});

console.log('\n' + passed + ' correctas, ' + failed + ' fallidas');
if (failed) { console.error('Fallan: ' + failures.join(' · ')); process.exitCode = 1; }
