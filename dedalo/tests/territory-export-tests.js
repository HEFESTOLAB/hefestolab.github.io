/* CPU STEP parser/IFC4 contract checks. This is not a full EXPRESS/MVD validator. */
'use strict';
const assert = require('node:assert/strict'), path = require('node:path');
const JS = path.join(__dirname, '..', 'app', 'js');
require(path.join(JS, 'vendor', 'earcut-2.2.4.js'));
for (const file of ['core/geom', 'core/dimensions', 'core/model', 'core/document', 'core/scene', 'core/hierarchy', 'core/organic', 'core/territory', 'io/territory-export']) require(path.join(JS, file + '.js'));
const D = globalThis.DEDALO, E = D.TerritoryExport, T = D.Territory;
let passed = 0, failed = 0;
function test(name, run) { try { run(); passed++; console.log('  ok   ' + name); } catch (error) { failed++; console.error('  FALLA ' + name + '\n' + error.stack); } }
function cmd(doc, command, params) { const result = doc.execute(command, params || {}); assert.ok(result.ok, result.error); return result; }
function near(a, b, tolerance) { assert.ok(Math.abs(a - b) < (tolerance || 1e-6), a + ' != ' + b); }
const arities = { IFCCARTESIANPOINT: 1, IFCDIRECTION: 1, IFCAXIS2PLACEMENT3D: 3, IFCLOCALPLACEMENT: 2, IFCGEOMETRICREPRESENTATIONCONTEXT: 6, IFCSIUNIT: 4, IFCUNITASSIGNMENT: 1, IFCPROJECT: 9, IFCSITE: 14, IFCRELAGGREGATES: 6, IFCPROJECTEDCRS: 7, IFCMAPCONVERSION: 8, IFCPROPERTYSINGLEVALUE: 4, IFCPROPERTYSET: 5, IFCRELDEFINESBYPROPERTIES: 6, IFCCARTESIANPOINTLIST3D: 1, IFCTRIANGULATEDFACESET: 5, IFCCOLOURRGBLIST: 1, IFCINDEXEDCOLOURMAP: 4, IFCSHAPEREPRESENTATION: 4, IFCPRODUCTDEFINITIONSHAPE: 3, IFCPOLYLINE: 1, IFCGEOGRAPHICELEMENT: 9, IFCANNOTATION: 7, IFCBUILDINGELEMENTPROXY: 9, IFCRELCONTAINEDINSPATIALSTRUCTURE: 6 };
function parse(text) {
  assert.match(text, /^ISO-10303-21;\nHEADER;/); assert.match(text, /FILE_SCHEMA\(\('IFC4'\)\);/); assert.ok(text.endsWith('END-ISO-10303-21;\n'));
  const data = text.split('\nDATA;\n')[1].split('\nENDSEC;')[0], tokens = [], pattern = /\s+|'(?:''|[^'])*'|#[1-9]\d*|\.[A-Z_]+\.|[A-Z][A-Z0-9_]*|[-+]?(?:\d+\.?\d*|\.\d+)(?:E[-+]?\d+)?|[(),;=$*]/gy;
  let offset = 0; while (offset < data.length) { pattern.lastIndex = offset; const match = pattern.exec(data); assert.ok(match, 'token STEP en ' + offset); if (!/^\s/.test(match[0])) tokens.push(match[0]); offset = pattern.lastIndex; }
  let index = 0; const take = token => { assert.equal(tokens[index++], token); };
  function value() {
    const token = tokens[index++];
    if (token === '(') { const list = []; if (tokens[index] !== ')') { list.push(value()); while (tokens[index] === ',') { index++; list.push(value()); } } take(')'); return list; }
    if (token.startsWith('#')) return { ref: Number(token.slice(1)) };
    if (token.startsWith("'")) return token.slice(1, -1).replace(/''/g, "'");
    if (/^[A-Z]/.test(token)) { const args = value(); return { type: token, args }; }
    if (/^[-+0-9.]/.test(token) && !/^\.[A-Z]/.test(token)) { const number = Number(token); assert.ok(Number.isFinite(number)); return number; }
    assert.ok(['$', '*'].includes(token) || /^\.[A-Z_]+\.$/.test(token), token); return token;
  }
  const entities = new Map();
  while (index < tokens.length) { const id = Number(tokens[index++].slice(1)); take('='); const type = tokens[index++], args = value(); take(';'); assert.ok(!entities.has(id)); assert.ok(type in arities, type); assert.equal(args.length, arities[type], type + ' atributos IFC4'); entities.set(id, { id, type, args }); }
  function references(value) { if (Array.isArray(value)) value.forEach(references); else if (value && typeof value === 'object') { if ('ref' in value) assert.ok(entities.has(value.ref), 'referencia #' + value.ref); else references(value.args); } }
  for (const e of entities.values()) references(e.args); return entities;
}
function byType(entities, type) { return [...entities.values()].filter(e => e.type === type); }
function faceMesh(entities, faceSet) { return { points: entities.get(faceSet.args[0].ref).args[0], triangles: faceSet.args[3] }; }
function volume(mesh) { return mesh.triangles.reduce((sum, tri) => { const [a, b, c] = tri.map(i => mesh.points[i - 1]); return sum + D.V.dot(a, D.V.cross(b, c)) / 6; }, 0); }
function closedTriangleShell(mesh) {
  const edges = new Map();
  for (const tri of mesh.triangles) for (let i = 0; i < 3; i++) { const a = tri[i], b = tri[(i + 1) % 3], key = Math.min(a, b) + ':' + Math.max(a, b), pair = edges.get(key) || [0, 0]; pair[0]++; pair[1] += a < b ? 1 : -1; edges.set(key, pair); }
  return [...edges.values()].every(([count, direction]) => count === 2 && direction === 0);
}
function fixture() {
  const doc = new D.Document(); doc.name = "Parcela d'Ávila \\ prueba";
  const p = T.project(-3, 42, 'EPSG:25830'), ring = (a, b, c, d) => [[a, b], [c, b], [c, d], [a, d], [a, b]].map(([x, y]) => T.inverse(p[0] + x, p[1] + y, 'EPSG:25830'));
  const feature = { type: 'Feature', id: 'B-1', sourceId: 'cadastre', geometry: { type: 'Polygon', coordinates: [ring(-5, -5, 5, 5), ring(-1, -1, 1, 1)] }, properties: { floors: 2 } };
  cmd(doc, 'geo.import', { data: { format: 'dedalo.territory-data', version: 1, bbox: [-3.0005, 41.9995, -2.9995, 42.0005], crs: 'EPSG:4326', parcels: [{ ...feature, id: 'P-1' }], buildingParts: [feature],
    terrain: { bbox: [-3.0005, 41.9995, -2.9995, 42.0005], crs: 'EPSG:4326', rows: 2, cols: 2, grid: [[100, 100], [100, 100]], rowOrder: 'north-to-south', nodata: null, verticalDatum: 'orthometric-source', sourceId: 'mdt' },
    trees: [{ id: 'T1', lon: -3.0002, lat: 42.0001, tags: {}, sourceId: 'osm' }, { id: 'T2', lon: -2.9998, lat: 42.0001, tags: {}, sourceId: 'osm' }], vegetationAreas: [], sources: [{ id: 'cadastre', title: 'Test source', url: 'https://example.invalid', license: 'Fixture', attribution: 'Fixture', retrievedAt: '2026-10-18' }], warnings: [] } });
  return doc;
}

console.log('\nDédalo — IFC4/JSON territorial, análisis STEP en CPU\n');

test('IFC4 tokeniza, respeta atributos EXPRESS usados y resuelve todas las referencias', () => {
  const doc = fixture(), before = JSON.stringify(doc.scene.toJSON()), text = E.ifc(doc), parsed = parse(text);
  assert.ok(byType(parsed, 'IFCBUILDINGELEMENTPROXY').length === 1); assert.equal(byType(parsed, 'IFCGEOGRAPHICELEMENT').length, 3); assert.equal(byType(parsed, 'IFCANNOTATION').length, 1);
  assert.equal(JSON.stringify(doc.scene.toJSON()), before, 'exportar no cambia el modelo'); assert.doesNotMatch(text, /NaN|Infinity|undefined/);
});

test('map conversion restaura UTM absoluto sin sumar dos veces el origen local', () => {
  const doc = fixture(), parsed = parse(E.ifc(doc)), conversion = byType(parsed, 'IFCMAPCONVERSION')[0], crs = byType(parsed, 'IFCPROJECTEDCRS')[0];
  assert.equal(crs.args[0], 'EPSG:25830'); doc.scene.georeference.origin.forEach((n, i) => near(conversion.args[i + 2], n)); assert.deepEqual(conversion.args.slice(5), [1, 0, 1]);
  const unit = parsed.get(crs.args[6].ref); assert.equal(unit.args[1], '.LENGTHUNIT.'); assert.equal(unit.args[3], '.METRE.');
  const tree = E.objects(doc).find(o => o.role === 'tree'), actual = T.project(tree.metadata.territory.lon, tree.metadata.territory.lat, 'EPSG:25830');
  near(tree.matrix[12] + conversion.args[2], actual[0]); near(tree.matrix[13] + conversion.args[3], actual[1]);
});

test('triángulos válidos y volumen cerrado conservan el patio del edificio', () => {
  const parsed = parse(E.ifc(fixture())), sets = byType(parsed, 'IFCTRIANGULATEDFACESET');
  for (const set of sets) { const mesh = faceMesh(parsed, set); mesh.points.forEach(p => { assert.equal(p.length, 3); assert.ok(p.every(Number.isFinite)); }); mesh.triangles.forEach(t => { assert.equal(new Set(t).size, 3); assert.ok(t.every(i => Number.isInteger(i) && i >= 1 && i <= mesh.points.length)); }); }
  const solid = sets.find(set => set.args[2] === '.T.'); assert.ok(solid); assert.ok(closedTriangleShell(faceMesh(parsed, solid))); near(volume(faceMesh(parsed, solid)), (100 - 4) * 6, 0.01);
});

test('parcelas se exportan como curvas y árboles como elementos geográficos simbólicos', () => {
  const parsed = parse(E.ifc(fixture())); assert.ok(byType(parsed, 'IFCPOLYLINE').length >= 8);
  const geo = byType(parsed, 'IFCGEOGRAPHICELEMENT'); assert.equal(geo.filter(e => e.args[8] === '.TERRAIN.').length, 1); assert.equal(geo.filter(e => e.args[8] === '.USERDEFINED.').length, 2);
  assert.ok(byType(parsed, 'IFCPROPERTYSINGLEVALUE').some(p => p.args[0] === 'HeightQuality' && p.args[2].args[0] === 'symbolic-estimated'));
});

test('fuentes, UUID y calidad de altura sobreviven como propiedades públicas', () => {
  const doc = fixture(), parsed = parse(E.ifc(doc)), properties = byType(parsed, 'IFCPROPERTYSINGLEVALUE');
  assert.ok(properties.some(p => p.args[0] === 'Sources' && /cadastre/.test(p.args[2].args[0])));
  assert.ok(properties.some(p => p.args[0] === 'HeightQuality' && p.args[2].args[0] === 'inferred-from-floors'));
  for (const item of E.objects(doc)) assert.ok(properties.some(p => p.args[0] === 'NodeUUID' && p.args[2].args[0] === item.id));
  const rootTypes = ['IFCPROJECT', 'IFCSITE', 'IFCRELAGGREGATES', 'IFCPROPERTYSET', 'IFCRELDEFINESBYPROPERTIES', 'IFCGEOGRAPHICELEMENT', 'IFCANNOTATION', 'IFCBUILDINGELEMENTPROXY', 'IFCRELCONTAINEDINSPATIALSTRUCTURE'];
  const ids = [...parsed.values()].filter(e => rootTypes.includes(e.type)).map(e => e.args[0]); assert.equal(new Set(ids).size, ids.length); assert.ok(ids.every(id => /^[0-3][0-9A-Za-z_$]{21}$/.test(id)));
});

test('colores IFC4 conservan el índice por triángulo y copa/tronco diferenciados', () => {
  const parsed = parse(E.ifc(fixture()));
  for (const map of byType(parsed, 'IFCINDEXEDCOLOURMAP')) { const triangles = parsed.get(map.args[0].ref).args[3], colors = parsed.get(map.args[2].ref).args[0]; assert.equal(map.args[3].length, triangles.length); assert.ok(map.args[3].every(i => i >= 1 && i <= colors.length)); }
  assert.ok(byType(parsed, 'IFCCOLOURRGBLIST').some(e => e.args[0].length === 2));
});

test('reflejar una instancia conserva volumen positivo y traslación mundial en IFC', () => {
  const doc = new D.Document(); cmd(doc, 'draw.rectangle', { origin: [0, 0, 0], width: 2, height: 1 }); cmd(doc, 'face.pushPull', { face: [...doc.model.faces.keys()][0], distance: 3 });
  const component = cmd(doc, 'component.create', { name: 'Caja', faces: [...doc.model.faces.keys()] }), matrix = D.SceneMath.scaling([0, 0, 0], [-1, 1, 1]); matrix[12] = 10;
  cmd(doc, 'component.instantiate', { definitionId: component.definitionId, matrix });
  const parsed = parse(E.ifc(doc)), solids = byType(parsed, 'IFCTRIANGULATEDFACESET'); assert.equal(solids.length, 2); solids.forEach(s => near(volume(faceMesh(parsed, s)), 6));
  assert.ok(solids.some(s => faceMesh(parsed, s).points.some(p => p[0] === 10)));
});

test('JSON de intercambio reabre la escena nativa exacta con georef y procedencia', () => {
  const doc = fixture(), pack = E.jsonPackage(doc); assert.equal(pack.format, 'dedalo.territory-package'); assert.equal(pack.units, 'm'); assert.equal(pack.territories.length, 1);
  const reopened = new D.Document(); reopened.loadJSON(JSON.parse(JSON.stringify(pack.native))); assert.deepEqual(reopened.scene.toJSON(), doc.scene.toJSON()); assert.deepEqual(pack.georeference, doc.scene.georeference);
});

test('el abridor de archivos reconoce el paquete territorial y conserva estilos de color válidos', () => {
  require(path.join(JS, 'io/files.js')); D.STYLE = { edge: '#111111' };
  const original = fixture(), pack = E.jsonPackage(original), opened = new D.Document(), errors = []; let afterLoad = 0;
  pack.native.style = { edge: '#a1b2c3', unknown: '#123456' };
  const app = { doc: opened, toast(message) { errors.push(message); }, camera: { load() {} }, renderer: { opts: {}, style: { edge: '#111111' } }, afterLoad() { afterLoad++; } };
  const files = new D.Files(app); files.loadText(JSON.stringify(pack), 'territorio.json');
  assert.equal(errors.length, 0); assert.equal(afterLoad, 1); assert.deepEqual(opened.scene.toJSON(), original.scene.toJSON()); assert.deepEqual(app.renderer.style, { edge: '#a1b2c3' });
  pack.native.style.edge = 'url(javascript:alert(1))'; files.loadText(JSON.stringify(pack), 'territorio.json'); assert.equal(app.renderer.style.edge, '#a1b2c3');
});

if (process.argv[2]) test('fixture real: importación, reapertura, JSON e IFC con referencias y mallas cerradas válidas', () => {
  const fs = require('node:fs'), data = JSON.parse(fs.readFileSync(path.resolve(process.argv[2]), 'utf8')), doc = new D.Document(), imported = cmd(doc, 'geo.import', { data });
  const saved = E.jsonPackage(doc), reopened = new D.Document(); reopened.loadJSON(JSON.parse(JSON.stringify(saved.native))); assert.deepEqual(reopened.scene.toJSON(), doc.scene.toJSON());
  const text = E.ifc(reopened), parsed = parse(text), sets = byType(parsed, 'IFCTRIANGULATEDFACESET');
  let solids = 0; for (const set of sets) if (set.args[2] === '.T.') { assert.ok(closedTriangleShell(faceMesh(parsed, set)), 'cáscara triangular IFC cerrada'); solids++; }
  assert.equal(solids, imported.stats.buildings); console.log('       ' + JSON.stringify({ stats: imported.stats, ifcBytes: Buffer.byteLength(text), entities: parsed.size, closedSolids: solids, warnings: imported.warnings }));
});

console.log('\n' + passed + ' pruebas superadas; ' + failed + ' fallidas.'); if (failed) process.exitCode = 1;
module.exports = { parse, byType, faceMesh, closedTriangleShell };
