/* Territory contracts in pure Node: geometry, source provenance, datum and undo. */
'use strict';
const assert = require('node:assert/strict'), path = require('node:path');
const JS = path.join(__dirname, '..', 'app', 'js', 'core');
require(path.join(JS, '..', 'vendor', 'earcut-2.2.4.js'));
for (const file of ['geom', 'dimensions', 'model', 'document', 'scene', 'hierarchy', 'organic', 'territory']) require(path.join(JS, file + '.js'));
const D = globalThis.DEDALO, T = D.Territory;
let passed = 0, failed = 0;
function test(name, run) { try { run(); passed++; console.log('  ok   ' + name); } catch (e) { failed++; console.error('  FALLA ' + name + '\n' + e.stack); } }
function near(actual, expected, tolerance) { assert.ok(Number.isFinite(actual) && Math.abs(actual - expected) < (tolerance || 1e-5), actual + ' != ' + expected); }
function cmd(doc, name, params) { const r = doc.execute(name, params || {}); assert.ok(r.ok, r.error); return r; }
const clone = x => JSON.parse(JSON.stringify(x));
function dataFixture() {
  const center = [-3, 42], projected = T.project(...center, 'EPSG:25830');
  const ring = (minX, minY, maxX, maxY) => [[minX, minY], [maxX, minY], [maxX, maxY], [minX, maxY], [minX, minY]].map(([x, y]) => T.inverse(projected[0] + x, projected[1] + y, 'EPSG:25830'));
  const feature = { type: 'Feature', id: 'B-1', geometry: { type: 'Polygon', coordinates: [ring(-10, -10, 10, 10), ring(-3, -3, 3, 3)] }, properties: { numberOfFloorsAboveGround: 3 }, sourceId: 'cadastre' };
  const data = { format: 'dedalo.territory-data', version: 1, bbox: [-3.0005, 41.9995, -2.9995, 42.0005], crs: 'EPSG:4326',
    parcels: [{ ...clone(feature), id: 'P-1', properties: { reference: 'REF' } }], buildingParts: [feature],
    terrain: { bbox: [-3.0005, 41.9995, -2.9995, 42.0005], crs: 'EPSG:4326', rows: 4, cols: 4, grid: Array.from({ length: 4 }, () => [100, 100, 100, 100]), nodata: null, rowOrder: 'north-to-south', verticalDatum: 'orthometric-test-source', sourceId: 'mdt' },
    trees: [{ id: 'T-1', lon: -3.0002, lat: 42.0002, tags: {}, sourceId: 'osm' }, { id: 'T-2', lon: -2.9998, lat: 42.0002, tags: { height: '8 m' }, sourceId: 'osm' }], vegetationAreas: [],
    sources: [{ id: 'cadastre', title: 'Source fixture', url: 'https://example.invalid/data', license: 'test', attribution: 'Fixture', retrievedAt: '2026-10-18T12:00:00Z' }], warnings: [] };
  return { data, ring, projected };
}
function descendants(doc) { return [...doc.scene.definitions.values()].flatMap(d => d.nodes); }
function role(doc, name) { return descendants(doc).filter(n => n.metadata && n.metadata.territory && n.metadata.territory.role === name); }
function model(doc, node) { return doc.scene.definitions.get(node.definitionId).model; }

console.log('\nDédalo — Territorio, geometría nativa y procedencia sin renderizado\n');

test('UTM GRS80 coincide con estación ERGNSS A Coruña del IGN y meridiano central', () => {
  // IGN ERGNSS ACOR: 43°21′51.77088″ N, 8°23′56.16319″ W;
  // UTM29 E548701.438 N4801455.364. Datum ETRS89, GRS80.
  const lat = 43 + 21 / 60 + 51.77088 / 3600, lon = -(8 + 23 / 60 + 56.16319 / 3600), p = T.project(lon, lat, 'EPSG:25829');
  near(p[0], 548701.438, 0.01); near(p[1], 4801455.364, 0.01); near(T.project(-3, 0, 'EPSG:25830')[0], 500000); near(T.project(-3, 0, 'EPSG:25830')[1], 0);
});

test('elige ETRS89 por huso y REGCAN95/4083 en Canarias con vuelta inversa', () => {
  for (const [lon, lat, crs] of [[-8, 43, 'EPSG:25829'], [-3, 42, 'EPSG:25830'], [3, 39, 'EPSG:25831'], [-16, 28, 'EPSG:4083']]) {
    assert.equal(T.chooseCRS(lon, lat).crs, crs); const p = T.project(lon, lat, crs), ll = T.inverse(...p, crs); near(ll[0], lon, 1e-7); near(ll[1], lat, 1e-7);
  }
});

test('importa edificio cerrado con patio, parcelas y MDT en metros; no cambia geometría anterior', () => {
  const doc = new D.Document(); cmd(doc, 'draw.rectangle', { origin: [100, 100, 0], width: 2, height: 1 }); const old = clone(doc.currentDefinition().model.toJSON());
  const { data } = dataFixture(), result = cmd(doc, 'geo.import', { data }); assert.equal(result.stats.buildings, 1); assert.equal(result.stats.terrainFaces, 18); assert.equal(result.stats.trees, 2);
  assert.deepEqual(doc.scene.current([]).model.toJSON(), old); const building = role(doc, 'building-part')[0], m = model(doc, building); assert.ok(m.isClosed([...m.faces.keys()]));
  near(m.volume([...m.faces.keys()]), (400 - 36) * 9, 0.01); assert.deepEqual(m.validate(), []); assert.equal(building.metadata.territory.height.kind, 'inferred-from-floors');
  near(building.metadata.territory.base.absolute, 100); near(doc.scene.georeference.origin[2], 100); assert.equal(doc.scene.georeference.crs, 'EPSG:25830'); assert.match(doc.scene.georeference.horizontalTransform, /sin corrección/);
});

test('NoData permanece como hueco y las filas norte-sur quedan orientadas hacia arriba', () => {
  const { data } = dataFixture(); data.terrain.grid[1][1] = null; const plan = T.prepare(data), terrain = plan.children.find(c => c.role === 'terrain').children[0].model;
  assert.equal(terrain.faces.size, 10); for (const f of terrain.faces.values()) assert.ok(f.n[2] > 0.9); assert.deepEqual(terrain.validate(), []);
});

test('lee MDT proyectado UTM y respeta alturas y malla absoluta sin mezclar grados', () => {
  const { data, projected } = dataFixture(); data.terrain = { bbox: [projected[0] - 100, projected[1] - 100, projected[0] + 100, projected[1] + 100], crs: 'EPSG:25830', rows: 2, cols: 2, grid: [[110, 110], [110, 110]], nodata: null, rowOrder: 'north-to-south', verticalDatum: 'orthometric' };
  const doc = new D.Document(); cmd(doc, 'geo.import', { data }); near(doc.scene.georeference.origin[2], 110); const terrain = model(doc, role(doc, 'terrain')[0]); near(terrain.bbox().max[0] - terrain.bbox().min[0], 200, 0.001); near(terrain.bbox().max[2], 0);
});

test('árboles conservan posiciones de fuente y comparten una definición simbólica editable', () => {
  const { data } = dataFixture(), doc = new D.Document(); cmd(doc, 'geo.import', { data, options: { treeHeight: 6 } });
  const trees = role(doc, 'tree'); assert.equal(trees.length, 2); assert.equal(trees[0].kind, 'component'); assert.equal(trees[0].definitionId, trees[1].definitionId);
  assert.equal(trees[0].metadata.territory.height.kind, 'symbolic-estimated'); assert.equal(trees[1].metadata.territory.height.kind, 'source-height'); near(trees[0].matrix[10], 6); near(trees[1].matrix[10], 8);
  const p = T.project(data.trees[0].lon, data.trees[0].lat, 'EPSG:25830'); near(trees[0].matrix[12] + doc.scene.georeference.origin[0], p[0]); near(trees[0].matrix[13] + doc.scene.georeference.origin[1], p[1]);
  data.trees = []; data.vegetationAreas = [data.parcels[0]]; const second = new D.Document(); cmd(second, 'geo.import', { data }); assert.equal(role(second, 'tree').length, 0); assert.equal(role(second, 'vegetation-area').length, 1);
});

test('altura de fuente se distingue de plantas y la altura ausente no inventa volumen', () => {
  const { data } = dataFixture(); data.buildingParts[0].properties = { height: 12, floors: 3 }; const doc = new D.Document(); cmd(doc, 'geo.import', { data }); const known = role(doc, 'building-part')[0]; assert.equal(known.metadata.territory.height.kind, 'source-height'); near(model(doc, known).bbox().max[2], 12);
  data.buildingParts[0].properties = {}; const other = new D.Document(), result = cmd(other, 'geo.import', { data }); assert.equal(result.stats.footprintsOnly, 1); assert.equal(model(other, role(other, 'building-part')[0]).faces.size, 0); assert.ok(result.warnings.some(w => /sin altura/.test(w)));
});

test('sin MDT informa referencia Z=0 y conserva el origen en importaciones posteriores', () => {
  const { data } = dataFixture(); data.terrain = null; const doc = new D.Document(), first = cmd(doc, 'geo.import', { data }); assert.equal(doc.scene.georeference.verticalOriginStatus, 'unavailable-reference-zero'); assert.ok(first.warnings.length);
  const origin = doc.scene.georeference.origin.slice(); cmd(doc, 'geo.import', { data }); assert.deepEqual(doc.scene.georeference.origin, origin); assert.equal(role(doc, 'territory').length, 2);
});

test('viales y cauces son trazados; áreas agua/vegetación mantienen patios y procedencia', () => {
  const { data, ring } = dataFixture(); data.trees = [];
  data.roads = [{ type: 'Feature', id: 'R1', geometry: { type: 'LineString', coordinates: [ring(-20, 0, 20, 1)[0], ring(-20, 0, 20, 1)[1]] }, properties: { highway: 'residential' }, sourceId: 'osm-context' }];
  data.waterways = clone(data.roads); data.waterways[0].id = 'W1'; data.waterAreas = [clone(data.parcels[0])]; data.vegetationAreas = [clone(data.parcels[0])];
  const doc = new D.Document(), result = cmd(doc, 'geo.import', { data }); assert.equal(result.stats.roads, 1); assert.equal(result.stats.waterways, 1); assert.equal(result.stats.waterAreas, 1);
  assert.equal(model(doc, role(doc, 'road-centerline')[0]).faces.size, 0); assert.equal(role(doc, 'tree').length, 0);
  for (const kind of ['water-area', 'vegetation-area']) { const m = model(doc, role(doc, kind)[0]); near([...m.faces.keys()].reduce((sum, id) => sum + m.faceArea(id), 0), 364, 0.01); assert.deepEqual(m.validate(), []); }
});

test('guardar/abrir y deshacer/rehacer conservan origen, fuentes, IDs y metadatos', () => {
  const { data } = dataFixture(), doc = new D.Document(), before = clone(doc.scene.toJSON()); cmd(doc, 'geo.import', { data }); const after = clone(doc.scene.toJSON());
  assert.equal(role(doc, 'territory')[0].metadata.territory.sources[0].id, 'cadastre'); const file = clone(doc.fileJSON()), reopened = new D.Document(); reopened.loadJSON(file); assert.deepEqual(reopened.scene.toJSON(), after);
  doc.undo(); assert.deepEqual(doc.scene.toJSON(), before); doc.redo(); assert.deepEqual(doc.scene.toJSON(), after);
  const history = doc.undoStack.length, info = cmd(doc, 'geo.info'); assert.equal(info.territories.length, 1); assert.equal(info.georeference.crs, 'EPSG:25830'); assert.equal(doc.undoStack.length, history);
});

test('límites y datos inválidos fallan atómicamente sin alterar selección ni historial', () => {
  const { data } = dataFixture(), doc = new D.Document(); cmd(doc, 'draw.rectangle', { origin: [0, 0, 0], width: 1, height: 1 }); doc.select({ faces: [...doc.model.faces.keys()] });
  const before = JSON.stringify(doc._state()), history = doc.undoStack.length;
  const invalid = [Object.assign(clone(data), { bbox: [-3.1, 41.9, -2.9, 42.1] }), Object.assign(clone(data), { trees: Array.from({ length: 6001 }, () => data.trees[0]) })];
  const badHeight = clone(data); badHeight.buildingParts[0].properties.height = -1; invalid.push(badHeight);
  const badGrid = clone(data); badGrid.terrain.grid[0][0] = NaN; invalid.push(badGrid);
  for (const value of invalid) { assert.equal(doc.execute('geo.import', { data: value }).ok, false); assert.equal(JSON.stringify(doc._state()), before); assert.equal(doc.undoStack.length, history); }
});

test('contorno degenerado de fuente se omite con advertencia sin perder los edificios válidos', () => {
  const { data } = dataFixture(), broken = clone(data.buildingParts[0]); broken.id = 'BROKEN'; broken.geometry.coordinates[1] = broken.geometry.coordinates[1].map(p => [p[0] + 0.002, p[1]]); data.buildingParts.push(broken);
  const doc = new D.Document(), result = cmd(doc, 'geo.import', { data }); assert.equal(result.stats.buildings, 1); assert.equal(result.stats.skippedFeatures, 1); assert.ok(result.warnings.some(w => /BROKEN/.test(w))); assert.deepEqual(doc.scene.validate(), []);
});

test('vía larga externa se recorta a la selección sin forzar coordenadas a más de50km', () => {
  const { data } = dataFixture(); data.roads = [{ id: 'LONG', geometry: { type: 'LineString', coordinates: [[-8, 42], [3, 42]] }, properties: {}, sourceId: 'osm' }];
  const doc = new D.Document(); cmd(doc, 'geo.import', { data }); const road = model(doc, role(doc, 'road-centerline')[0]); assert.equal(road.edges.size, 1); assert.ok(road.bbox().max[0] - road.bbox().min[0] < 100);
});

console.log('\n' + passed + ' pruebas superadas; ' + failed + ' fallidas.'); if (failed) process.exitCode = 1;
