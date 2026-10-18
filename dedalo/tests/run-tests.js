/*
 * Pruebas del motor de Dédalo (Node puro, sin navegador).
 * Cada caso tiene un resultado geométrico conocido: número de caras, sólido cerrado,
 * volumen exacto, etc.  Ejecutar:  node tests/run-tests.js
 */
'use strict';
const path = require('path');
const APP = path.join(__dirname, '..', 'app', 'js');
for (const f of ['core/geom.js', 'core/model.js', 'core/document.js', 'core/scene.js', 'core/hierarchy.js']) require(path.join(APP, f));
const D = globalThis.DEDALO;
const { Model, V } = D;

let pass = 0, fail = 0;
const failures = [];
function test(name, fn) {
  try { fn(); pass++; console.log('  ok   ' + name); }
  catch (e) { fail++; failures.push(name); console.log('  FALLA ' + name + '\n        ' + (e && e.stack ? e.stack.split('\n').slice(0, 3).join('\n        ') : e)); }
}
function eq(a, b, msg) { if (a !== b) throw new Error((msg || '') + ' esperado ' + JSON.stringify(b) + ' y salió ' + JSON.stringify(a)); }
function near(a, b, msg, tol) { if (Math.abs(a - b) > (tol || 1e-6)) throw new Error((msg || '') + ' esperado ' + b + ' y salió ' + a); }
function ok(c, msg) { if (!c) throw new Error(msg || 'condición falsa'); }
function valid(m) { const e = m.validate(); if (e.length) throw new Error('modelo incoherente: ' + e.slice(0, 5).join(' | ')); }
function allFaces(m) { return [...m.faces.keys()]; }
function faceAt(m, p, normal) {
  for (const f of m.faces.values()) {
    if (normal && V.dot(f.n, normal) < 0.999) continue;
    if (m.pointInFace(f, p) > 0) return f.id;
  }
  return null;
}
function rect(m, x0, y0, w, h, z) { return m.addRectangle([x0, y0, z || 0], [1, 0, 0], [0, 1, 0], w, h); }
function box(m, w, d, h) { rect(m, 0, 0, w, d); const f = [...m.faces.keys()][0]; m.pushPull(f, h); return m; }

console.log('\nDédalo — pruebas del motor\n');

test('unidades: longitudes con coma, cm y mm', () => {
  const u = D.units;
  near(u.parseLen('2,5'), 2.5); near(u.parseLen('250cm'), 2.5); near(u.parseLen('2500 mm'), 2.5);
  near(u.parseLen('-1.2'), -1.2); eq(u.parseLen('abc'), null);
  const two = u.parseLens('5;4'); near(two[0], 5); near(two[1], 4);
  const tw2 = u.parseLens('2,5 x 3'); near(tw2[0], 2.5); near(tw2[1], 3);
  eq(u.fmtLen(2.41), '2,41 m');
});

test('triangulación: cuadrado con agujero', () => {
  const t = D.geom.triangulate([[0, 0], [4, 0], [4, 4], [0, 4]], [[[1, 1], [1, 3], [3, 3], [3, 1]]]);
  const pts = [[0, 0], [4, 0], [4, 4], [0, 4], [1, 1], [1, 3], [3, 3], [3, 1]];
  let a = 0;
  for (let i = 0; i < t.length; i += 3) a += D.geom.area2([pts[t[i]], pts[t[i + 1]], pts[t[i + 2]]]);
  near(a, 12, 'área triangulada');
});

test('rectángulo en el suelo: una cara hacia arriba de 20 m²', () => {
  const m = new Model();
  rect(m, 0, 0, 5, 4);
  eq(m.faces.size, 1); eq(m.edges.size, 4); eq(m.verts.size, 4);
  const f = [...m.faces.values()][0];
  near(f.n[2], 1, 'normal');
  near(m.faceArea(f.id), 20, 'área');
  valid(m);
});

test('líneas sueltas que cierran un contorno crean la cara', () => {
  const m = new Model();
  m.addPolyline([[0, 0, 0], [3, 0, 0]], false);
  m.addPolyline([[3, 0, 0], [3, 2, 0]], false);
  m.addPolyline([[3, 2, 0], [0, 2, 0]], false);
  eq(m.faces.size, 0, 'sin cerrar');
  m.addPolyline([[0, 2, 0], [0, 0, 0]], false);
  eq(m.faces.size, 1, 'al cerrar');
  valid(m);
});

test('empujar/tirar una cara suelta: caja cerrada de 60 m³', () => {
  const m = box(new Model(), 5, 4, 3);
  eq(m.faces.size, 6); eq(m.edges.size, 12); eq(m.verts.size, 8);
  ok(m.isClosed(allFaces(m)), 'sólido cerrado');
  near(m.volume(allFaces(m)), 60, 'volumen');
  valid(m);
});

test('empujar/tirar hacia abajo una cara suelta también cierra bien', () => {
  const m = new Model();
  rect(m, 0, 0, 2, 2);
  m.pushPull([...m.faces.keys()][0], -1);
  ok(m.isClosed(allFaces(m)), 'cerrado');
  near(m.volume(allFaces(m)), 4, 'volumen');
  valid(m);
});

test('tirar de la tapa estira la caja (no añade caras)', () => {
  const m = box(new Model(), 5, 4, 3);
  const top = faceAt(m, [2.5, 2, 3], [0, 0, 1]);
  ok(top, 'tapa encontrada');
  const r = m.pushPull(top, 1);
  ok(r.ok, r.error); eq(r.mode, 'stretch');
  eq(m.faces.size, 6);
  near(m.volume(allFaces(m)), 80, 'volumen');
  valid(m);
});

test('tirar de un lateral alarga la caja', () => {
  const m = box(new Model(), 5, 4, 3);
  const side = faceAt(m, [5, 2, 1.5], [1, 0, 0]);
  ok(side, 'lateral encontrado');
  m.pushPull(side, 10);
  near(m.volume(allFaces(m)), 15 * 4 * 3, 'volumen');
  eq(m.faces.size, 6);
  valid(m);
});

test('empujar la tapa más allá de la base se rechaza', () => {
  const m = box(new Model(), 2, 2, 1);
  const top = faceAt(m, [1, 1, 1], [0, 0, 1]);
  const r = m.pushPull(top, -1.5);
  eq(r.ok, false);
  near(m.volume(allFaces(m)), 4, 'sin cambios');
});

test('rectángulo dibujado con líneas sobre la tapa: cara interior + hueco', () => {
  const m = box(new Model(), 5, 4, 3);
  m.addPolyline([[1, 1, 3], [4, 1, 3], [4, 3, 3], [1, 3, 3]], true);
  eq(m.faces.size, 7);
  const inner = faceAt(m, [2.5, 2, 3], [0, 0, 1]);
  near(m.faceArea(inner), 6, 'área interior');
  const outer = faceAt(m, [0.5, 0.5, 3], [0, 0, 1]);
  near(m.faceArea(outer), 14, 'área de la tapa con hueco');
  eq(m.faces.get(outer).loops.length, 2, 'la tapa tiene un hueco');
  valid(m);
});

test('cajeado: empujar la cara interior 1 m hacia dentro', () => {
  const m = box(new Model(), 5, 4, 3);
  m.addPolyline([[1, 1, 3], [4, 1, 3], [4, 3, 3], [1, 3, 3]], true);
  const inner = faceAt(m, [2.5, 2, 3], [0, 0, 1]);
  const r = m.pushPull(inner, -1);
  ok(r.ok, r.error);
  eq(m.faces.size, 11);
  ok(m.isClosed(allFaces(m)), 'cerrado');
  near(m.volume(allFaces(m)), 60 - 6, 'volumen');
  valid(m);
});

test('agujero pasante: empujar la cara interior todo el canto', () => {
  const m = box(new Model(), 5, 4, 3);
  m.addPolyline([[1, 1, 3], [4, 1, 3], [4, 3, 3], [1, 3, 3]], true);
  const inner = faceAt(m, [2.5, 2, 3], [0, 0, 1]);
  m.pushPull(inner, -3);
  eq(m.faces.size, 10, 'caras');
  ok(m.isClosed(allFaces(m)), 'cerrado');
  near(m.volume(allFaces(m)), 60 - 18, 'volumen');
  ok(faceAt(m, [2.5, 2, 0]) === null, 'la base tiene hueco');
  valid(m);
});

test('lo conectado atraviesa los huecos de las caras (triple clic)', () => {
  const m = box(new Model(), 5, 4, 3);
  m.addPolyline([[1, 1, 3], [4, 1, 3], [4, 3, 3], [1, 3, 3]], true);
  m.pushPull(faceAt(m, [2.5, 2, 3], [0, 0, 1]), -3);
  const front = faceAt(m, [2.5, 0, 1.5], [0, -1, 0]);
  const c = m.connected([front], []);
  eq(c.faces.length, 10); eq(c.edges.length, 24);
});

test('protuberancia: tirar de la cara interior hacia fuera', () => {
  const m = box(new Model(), 5, 4, 3);
  m.addPolyline([[1, 1, 3], [4, 1, 3], [4, 3, 3], [1, 3, 3]], true);
  const inner = faceAt(m, [2.5, 2, 3], [0, 0, 1]);
  m.pushPull(inner, 2);
  ok(m.isClosed(allFaces(m)), 'cerrado');
  near(m.volume(allFaces(m)), 60 + 12, 'volumen');
  valid(m);
});

test('muesca en el borde: la pared coincide con el lateral y se recorta', () => {
  const m = box(new Model(), 5, 4, 3);
  // rectángulo que toca el borde frontal (y = 0)
  m.addPolyline([[1, 0, 3], [1, 1, 3], [3, 1, 3], [3, 0, 3]], false);
  eq(m.faces.size, 7, 'la tapa se divide');
  const notch = faceAt(m, [2, 0.5, 3], [0, 0, 1]);
  const r = m.pushPull(notch, -1);
  ok(r.ok, r.error);
  ok(m.isClosed(allFaces(m)), 'cerrado');
  near(m.volume(allFaces(m)), 60 - 2, 'volumen');
  valid(m);
});

test('escalón: tirar hacia arriba una franja del borde funde la pared con el lateral', () => {
  const m = box(new Model(), 5, 4, 3);
  m.addPolyline([[0, 1, 3], [5, 1, 3]], false);
  eq(m.faces.size, 7, 'la tapa se divide en dos');
  const strip = faceAt(m, [2.5, 0.5, 3], [0, 0, 1]);
  m.pushPull(strip, 1);
  ok(m.isClosed(allFaces(m)), 'cerrado');
  near(m.volume(allFaces(m)), 60 + 5, 'volumen');
  // la pared frontal debe ser una sola cara (fundida)
  const front = [...m.faces.values()].filter((f) => f.n[1] < -0.999);
  eq(front.length, 1, 'frontal fundido');
  valid(m);
});

test('una línea de borde a borde divide la cara; borrarla la vuelve a unir', () => {
  const m = new Model();
  rect(m, 0, 0, 4, 2);
  const r = m.addPolyline([[0, 1, 0], [4, 1, 0]], false);
  eq(m.faces.size, 2);
  m.eraseEdges(r.edges);
  eq(m.faces.size, 1, 'fusión');
  eq(m.edges.size, 4, 'vértices sanados');
  near(m.faceArea([...m.faces.keys()][0]), 8);
  valid(m);
});

test('borrar una arista de la caja borra las dos caras que limita', () => {
  const m = box(new Model(), 2, 2, 2);
  const e = m.findEdge(m.findVertex([2, 0, 0]), m.findVertex([2, 2, 0]));
  m.eraseEdges([e]);
  eq(m.faces.size, 4);
  valid(m);
});

test('dos rectángulos que se solapan: tres caras', () => {
  const m = new Model();
  rect(m, 0, 0, 4, 4);
  rect(m, 2, 2, 4, 4);
  eq(m.faces.size, 3);
  let a = 0; for (const f of m.faces.keys()) a += m.faceArea(f);
  near(a, 28, 'área total');
  valid(m);
});

test('círculo y cilindro con aristas suaves', () => {
  const m = new Model();
  m.addCircle([0, 0, 0], [0, 0, 1], 1, 24);
  eq(m.faces.size, 1); eq(m.edges.size, 24);
  m.pushPull([...m.faces.keys()][0], 2);
  eq(m.faces.size, 26);
  const soft = [...m.edges.values()].filter((e) => e.soft).length;
  eq(soft, 24, 'aristas verticales suaves');
  ok(m.isClosed(allFaces(m)), 'cerrado');
  const exact = Math.PI * 2;
  ok(Math.abs(m.volume(allFaces(m)) - exact) < 0.1, 'volumen ≈ π r² h');
  valid(m);
});

test('equidistancia hacia dentro crea un anillo', () => {
  const m = new Model();
  rect(m, 0, 0, 4, 4);
  const r = m.offsetFace([...m.faces.keys()][0], 1);
  ok(r.ok, r.error);
  eq(m.faces.size, 2);
  const inner = faceAt(m, [2, 2, 0]);
  near(m.faceArea(inner), 4);
  valid(m);
});

test('mover la tapa en horizontal pliega las caras no planas', () => {
  const m = box(new Model(), 2, 2, 2);
  const top = faceAt(m, [1, 1, 2], [0, 0, 1]);
  const vs = m.faceVerts(m.faces.get(top));
  m.transformVertices(vs, (p) => V.add(p, [0.5, 0, 0]));
  valid(m);
  ok(m.isClosed(allFaces(m)), 'sigue cerrado');
  near(m.volume(allFaces(m)), 8, 'el volumen de un prisma inclinado no cambia');
});

test('copiar una caja desplazada', () => {
  const m = box(new Model(), 1, 1, 1);
  const r = m.copyEntities(allFaces(m), [], (p) => V.add(p, [3, 0, 0]));
  eq(r.faces.length, 6);
  eq(m.faces.size, 12);
  valid(m);
});

test('guardar y abrir conserva el modelo', () => {
  const m = box(new Model(), 5, 4, 3);
  m.addPolyline([[1, 1, 3], [4, 1, 3], [4, 3, 3], [1, 3, 3]], true);
  const j = JSON.parse(JSON.stringify(m.toJSON()));
  const m2 = Model.fromJSON(j);
  eq(m2.faces.size, m.faces.size); eq(m2.edges.size, m.edges.size);
  near(m2.volume(allFaces(m2)), 60);
  valid(m2);
  // y se puede seguir modelando
  const inner = faceAt(m2, [2.5, 2, 3], [0, 0, 1]);
  m2.pushPull(inner, -3);
  ok(m2.isClosed(allFaces(m2)));
});

if (D.Document) {
  test('documento: comandos con deshacer y rehacer', () => {
    const doc = new D.Document();
    doc.execute('draw.rectangle', { origin: [0, 0, 0], width: 5, height: 4 });
    eq(doc.model.faces.size, 1);
    const fid = [...doc.model.faces.keys()][0];
    doc.execute('face.pushPull', { face: fid, distance: 3 });
    eq(doc.model.faces.size, 6);
    doc.undo();
    eq(doc.model.faces.size, 1);
    doc.redo();
    eq(doc.model.faces.size, 6);
    const list = doc.commandList();
    ok(list.length > 5, 'registro de comandos');
  });
}

console.log('\n' + pass + ' correctas, ' + fail + ' fallidas');
if (fail) { console.log('Fallan: ' + failures.join(' · ')); process.exit(1); }
