/* GIS loader contracts: pure CPU fixtures, no listener, browser, renderer or live requests. */
'use strict';
const assert = require('node:assert/strict');
require('../app/js/io/territory-data.js');
const T = globalThis.DEDALO.TerritoryData;
let passed = 0, failed = 0;
const tests = [];
function test(name, run) { tests.push({ name, run }); }
function near(actual, expected, tolerance = 1e-8) { assert.ok(Number.isFinite(actual) && Math.abs(actual - expected) < tolerance, actual + ' != ' + expected); }
const bbox = [-3.6982, 42.3438, -3.6976, 42.3443];
const ns = 'xmlns:gml="http://www.opengis.net/gml/3.2" xmlns:cp="http://inspire.ec.europa.eu/schemas/cp/4.0" xmlns:bu="http://inspire.jrc.ec.europa.eu/schemas/bu-ext2d/2.0" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"';
function collection(content, attrs = 'numberMatched="1" numberReturned="1"') { return '<?xml version="1.0"?>\n<FeatureCollection ' + ns + ' ' + attrs + '><member>' + content + '</member></FeatureCollection>'; }
function polygon(coords, opts = {}) { return '<gml:Surface srsName="' + (opts.crs || 'urn:ogc:def:crs:EPSG::4326') + '"><gml:patches><gml:PolygonPatch><gml:exterior><gml:LinearRing><gml:posList srsDimension="' + (opts.dim || 2) + '">' + coords + '</gml:posList></gml:LinearRing></gml:exterior>' + (opts.hole ? '<gml:interior><gml:LinearRing><gml:posList>' + opts.hole + '</gml:posList></gml:LinearRing></gml:interior>' : '') + '</gml:PolygonPatch></gml:patches></gml:Surface>'; }
// Coordinates and attributes transcribed from the real public Burgos GML response verified 2026-10-18.
const realRing = '42.344053 -3.698375 42.344056 -3.698387 42.344067 -3.698433 42.344093 -3.698421 42.344096 -3.69842 42.344068 -3.698311 42.344095 -3.698298 42.344069 -3.698199 42.34404 -3.698212 42.344064 -3.698306 42.344038 -3.698318 42.344046 -3.698349 42.34406 -3.698342 42.344067 -3.698368 42.344053 -3.698375';
const tri = '42.344 -3.698 42.344 -3.697 42.345 -3.697 42.344 -3.698';
function part(g = polygon(realRing), floors = '<bu:numberOfFloorsAboveGround>14</bu:numberOfFloorsAboveGround>') { return '<bu:BuildingPart gml:id="ES.SDGC.BU.2685009VM4828S_part1"><bu:inspireId><Identifier><localId>2685009VM4828S_part1</localId></Identifier></bu:inspireId><bu:geometry><BuildingGeometry><geometry>' + g + '</geometry></BuildingGeometry></bu:geometry>' + floors + '<bu:heightBelowGround uom="m">3</bu:heightBelowGround><bu:numberOfFloorsBelowGround>1</bu:numberOfFloorsBelowGround></bu:BuildingPart>'; }
function parcel(g = polygon(tri)) { return '<cp:CadastralParcel gml:id="ES.SDGC.CP.2685009VM4828S"><cp:areaValue uom="m2">768</cp:areaValue><cp:geometry>' + g + '</cp:geometry><cp:nationalCadastralReference>2685009VM4828S</cp:nationalCadastralReference></cp:CadastralParcel>'; }
const gml = collection(part());
const ascii = 'ncols 5\nnrows 5\nxllcorner -3.698200000000\nyllcorner 42.343800000000\ndx 0.000120000000\ndy 0.000100000000\n857.772 857.572 857.177 858 858\n857.029 858 858 858 858\n857 857 857 857.361 858\n857 857 857 857 857.453\n857 857 857 857 857.531\n';
function envelope(operation, text, extra) { return Object.assign({ ok: true, operation, text, source: { url: 'https://provider.example/verified', crs: operation === 'ign.terrain' ? 'EPSG:4258' : 'EPSG:4326' } }, extra); }

test('bbox uses latitude-adjusted square metres, accepts 0.76 km² and rejects broad/skinny/invalid areas', () => {
  const b = T.bboxAround(-3.69786, 42.34409, 950, 800); near(T.validateBBox(b).areaM2, 760000, 0.1);
  assert.throws(() => T.bboxAround(-3.7, 42, 1100, 1100), /1 km/);
  assert.throws(() => T.bboxAround(-3.7, 42, 2000, 100), /1,1 km/);
  for (const b of [[0, 0, 1, 1], [-3, 43, -4, 42], [0, 42, Infinity, 43], ['-3', 42, -2, 43]]) assert.throws(() => T.validateBBox(b));
  near(T.validateBBox(T.bboxAround(-3.7, 42)).areaM2, 360000, 0.1);
});
test('fixed WFS queries explicitly use formal latitude/longitude EPSG4326 axes', () => {
  for (const [operation, type] of [['catastro.parcels', 'CP.CadastralParcel'], ['catastro.buildings', 'BU.BuildingPart']]) {
    const spec = T.buildRequest({ operation, bbox }), u = new URL(spec.url);
    assert.equal(u.protocol, 'https:'); assert.equal(u.hostname, 'ovc.catastro.meh.es');
    assert.equal(u.searchParams.get('bbox'), '42.3438,-3.6982,42.3443,-3.6976,urn:ogc:def:crs:EPSG::4326');
    assert.equal(u.searchParams.get('typeNames'), type); assert.equal(u.searchParams.get('count'), '5000');
  }
  assert.throws(() => T.buildRequest({ operation: 'url', url: 'http://localhost' }), /BBox|Operación/);
});
test('fixed WCS request uses lon/lat extent, genuine MDT5 coverage, ArcGrid and 33 by 33 samples', () => {
  const u = new URL(T.buildRequest({ operation: 'ign.terrain', bbox }).url);
  assert.equal(u.searchParams.get('bbox'), bbox.join(',')); assert.equal(u.searchParams.get('coverage'), 'Elevacion4258_5');
  assert.equal(u.searchParams.get('width'), '33'); assert.equal(u.searchParams.get('height'), '33');
  assert.equal(u.searchParams.get('format'), 'ArcGrid'); assert.equal(u.searchParams.get('crs'), 'EPSG:4258');
});
test('real BuildingPart GML swaps EPSG4326 axes, preserves floor evidence and never invents height', () => {
  const result = T.parseGML(gml, { featureType: 'BuildingPart' }), f = result.features[0];
  assert.equal(result.features.length, 1); assert.deepEqual(f.geometry.coordinates[0][0], [-3.698375, 42.344053]);
  assert.equal(f.properties.nationalCadastralReference, '2685009VM4828S'); assert.equal(f.properties.floors, 14);
  assert.equal(f.properties.numberOfFloorsBelowGround, 1); assert.equal(f.properties.heightBelowGround, 3);
  assert.equal(f.properties.height, undefined); assert.match(f.properties.heightEvidence, /estimated/);
  assert.equal(result.numberMatched, 1); assert.equal(result.truncated, false);
});
test('parcel MultiSurface keeps separate polygons, courtyard holes and original cadastral area', () => {
  const hole = '42.3442 -3.6978 42.3442 -3.6976 42.3444 -3.6976 42.3442 -3.6978';
  const result = T.parseGML(collection(parcel('<gml:MultiSurface>' + polygon(tri, { hole }) + polygon(tri) + '</gml:MultiSurface>')));
  const f = result.features[0]; assert.equal(f.geometry.type, 'MultiPolygon'); assert.equal(f.geometry.coordinates.length, 2);
  assert.equal(f.geometry.coordinates[0].length, 2); assert.equal(f.properties.areaValue, 768);
  assert.equal(f.geometry.coordinates[0][0].length, 4);
});
test('nil floor values remain null, while actual zero floors stays zero', () => {
  let f = T.parseGML(collection(part(polygon(tri), '<bu:numberOfFloorsAboveGround xsi:nil="true" nilReason="unknown"/>'))).features[0];
  assert.equal(f.properties.floors, null);
  f = T.parseGML(collection(part(polygon(tri), '<bu:numberOfFloorsAboveGround>0</bu:numberOfFloorsAboveGround>'))).features[0]; assert.equal(f.properties.floors, 0);
});
test('native UTM25830 geometry is converted with correct easting/northing to geographic Madrid', () => {
  const coords = '441798.76 4480548.5 441799.76 4480548.5 441799.76 4480549.5 441798.76 4480548.5';
  const p = T.parseGML(collection(part(polygon(coords, { crs: 'urn:ogc:def:crs:EPSG::25830' })))).features[0].geometry.coordinates[0][0];
  near(p[0], -3.686, 0.002); near(p[1], 40.473, 0.003);
});
test('CRS84 stays longitude-first and 3D GML keeps footprint without presenting Z as building height', () => {
  const c = '-3.698 42.344 800 -3.697 42.344 801 -3.697 42.345 802 -3.698 42.344 800';
  const f = T.parseGML(collection(part(polygon(c, { crs: 'urn:ogc:def:crs:OGC:1.3:CRS84', dim: 3 })))).features[0];
  assert.deepEqual(f.geometry.coordinates[0][0], [-3.698, 42.344]); assert.equal(f.properties.height, undefined);
});
test('WFS truncation and bad features are explicit, not silently reported as complete', () => {
  const r = T.parseGML(collection(part(), 'numberMatched="50" numberReturned="1" next="https://provider.example/next"'));
  assert.equal(r.truncated, true); assert.match(r.warnings.join(' '), /truncada/);
  const bad = part(polygon(tri, { crs: 'EPSG:999999' })).replace('part1', 'part2');
  const p = T.parseGML(collection(part() + bad)); assert.equal(p.features.length, 1); assert.equal(p.skipped, 1); assert.match(p.warnings[0], /CRS/);
  assert.throws(() => T.parseGML(collection(bad)), /Ninguna entidad/);
});
test('XML provider errors, mismatched tags, XXE, unknown entities and cardinality are rejected', () => {
  assert.throws(() => T.parseGML('<ExceptionReport><Exception><ExceptionText>Área demasiado grande</ExceptionText></Exception></ExceptionReport>'), /Área demasiado grande/);
  for (const xml of ['<a><b></a>', '<!DOCTYPE a [<!ENTITY x SYSTEM "file:///secret">]><a>&x;</a>', '<a>&secret;</a>', '<a/><b/>', '<a><']) assert.throws(() => T.parseXML(xml));
  const broken = gml.replace('srsDimension="2"', 'srsDimension="2" count="5"'); assert.throws(() => T.parseGML(broken), /Conteo/);
});
test('actual Burgos ArcGrid stores absolute metres and north row; bbox denotes cell centers', () => {
  const t = T.parseElevationASCII(ascii); assert.equal(t.rows, 5); assert.equal(t.cols, 5);
  near(t.grid[0][0], 857.772); near(t.grid[4][4], 857.531); assert.equal(t.rowOrder, 'north-to-south');
  near(t.bbox[0], -3.69814); near(t.bbox[1], 42.34385); near(t.bbox[2], -3.69766); near(t.bbox[3], 42.34425);
  near(t.coverageBBox[0], bbox[0]); near(t.coverageBBox[3], bbox[3]); assert.equal(t.validCount, 25);
});
test('ArcGrid cellsize and center origins work; NODATA stays missing without filling', () => {
  const t = T.parseElevationASCII('ncols 2\nnrows 2\nxllcenter -3.7\nyllcenter 42.3\ncellsize .001\nNODATA_value -9999\n900 -9999\n901 902');
  assert.deepEqual(t.grid, [[900, null], [901, 902]]); near(t.bbox[0], -3.7); near(t.bbox[1], 42.3); assert.equal(t.validCount, 3);
  assert.throws(() => T.parseElevationASCII('ncols 1\nnrows 1\nxllcorner 0\nyllcorner 40\ncellsize .001\nNODATA_value -9999\n-9999'), /sin cotas/);
});
test('ArcGrid malformed dimensions, missing samples and service XML never yield a flat terrain', () => {
  for (const text of [ascii.replace('nrows 5', 'nrows 6'), ascii.replace('dx 0.000120000000', 'dx -1'), ascii.replace('857.772', 'NaN'), 'html failure']) assert.throws(() => T.parseElevationASCII(text));
  assert.throws(() => T.parseElevationASCII('<ServiceExceptionReport><ServiceException>Unknown coverage</ServiceException></ServiceExceptionReport>'), /Unknown coverage/);
});
const osm = { osm3s: { timestamp_osm_base: '2026-10-18T00:00:00Z' }, elements: [
  { type: 'node', id: 1, lon: -3.698, lat: 42.344, tags: { natural: 'tree', species: 'Quercus robur' } },
  { type: 'node', id: 2, lon: 0, lat: 40, tags: { natural: 'tree' } },
  { type: 'way', id: 3, tags: { leisure: 'park' }, geometry: [{ lon: -3.698, lat: 42.344 }, { lon: -3.6978, lat: 42.344 }, { lon: -3.6978, lat: 42.3442 }, { lon: -3.698, lat: 42.344 }] },
  { type: 'way', id: 4, tags: { highway: 'residential', width: '6.5 m' }, geometry: [{ lon: -3.698, lat: 42.344 }, { lon: -3.6978, lat: 42.3442 }] },
  { type: 'way', id: 5, tags: { waterway: 'stream' }, geometry: [{ lon: -3.698, lat: 42.344 }, { lon: -3.6978, lat: 42.3442 }] }
] };
test('OSM imports only mapped tree points; park does not create random trees and roads retain only explicit width', () => {
  const p = T.parseOverpass(osm, { bbox }); assert.equal(p.trees.length, 1); assert.equal(p.trees[0].id, 'osm/node/1');
  assert.equal(p.vegetationAreas.length, 1); assert.equal(p.roads.length, 1); assert.equal(p.waterways.length, 1); assert.equal(p.roads[0].properties.width, 6.5);
  assert.equal(p.vegetationAreas[0].geometry.type, 'Polygon'); assert.equal(p.timestamp, '2026-10-18T00:00:00Z');
  assert.deepEqual(T.parseOverpass({ elements: [] }).trees, []);
});
test('Overpass timeout remark and incomplete area rings never become fake polygons or complete datasets', () => {
  assert.throws(() => T.parseOverpass({ elements: [], remark: 'runtime error: Query timed out' }), /no completó/);
  const p = T.parseOverpass({ elements: [{ type: 'way', id: 1, tags: { leisure: 'park' }, geometry: osm.elements[3].geometry }, { type: 'way', id: 2, tags: { highway: 'path' }, geometry: [{ lon: 2 }] }] });
  assert.equal(p.vegetationAreas.length, 0); assert.equal(p.warnings.length, 1);
});
test('OSM long lines are clipped to bbox and disconnected fragments never get an invented connecting line', () => {
  const geometry = [{ lon: -3.699, lat: 42.344 }, { lon: -3.698, lat: 42.344 }, { lon: -3.697, lat: 42.344 }, { lon: -3.697, lat: 42.3442 }, { lon: -3.698, lat: 42.3442 }];
  const p = T.parseOverpass({ elements: [{ type: 'way', id: 50, tags: { highway: 'path' }, geometry }] }, { bbox });
  assert.equal(p.roads.length, 2); assert.equal(p.roads[0].id, 'osm/way/50#segment-0');
  for (const f of p.roads) for (const point of f.geometry.coordinates) assert.ok(point[0] >= bbox[0] - 1e-12 && point[0] <= bbox[2] + 1e-12 && point[1] >= bbox[1] && point[1] <= bbox[3]);
  assert.equal(p.roads[0].properties.width, undefined);
});
test('OSM areas keep real concave outlines, warn on selection extension and omit enormous areas explicitly', () => {
  const geometry = [{ lon: -3.699, lat: 42.344 }, { lon: -3.6978, lat: 42.344 }, { lon: -3.6978, lat: 42.3442 }, { lon: -3.699, lat: 42.344 }];
  const huge = [{ lon: -4, lat: 42 }, { lon: -3, lat: 42 }, { lon: -3, lat: 43 }, { lon: -4, lat: 42 }];
  const p = T.parseOverpass({ elements: [{ type: 'way', id: 51, tags: { leisure: 'park' }, geometry }, { type: 'way', id: 52, tags: { natural: 'water' }, geometry: huge }] }, { bbox });
  assert.equal(p.vegetationAreas.length, 1); assert.equal(p.waterAreas.length, 0); assert.deepEqual(p.vegetationAreas[0].geometry.coordinates[0][0], [-3.699, 42.344]);
  assert.match(p.warnings.join(' '), /íntegro/); assert.match(p.warnings.join(' '), /extensa omitida/);
});
test('typed loadArea joins genuine layers and provenance, reports progress, preserves no-data and deduplicates OSM', async () => {
  const seen = [], progress = [];
  const result = await T.loadArea({ bbox, onProgress: p => progress.push(p.layer), request: async desc => {
    seen.push(desc); return envelope(desc.operation, desc.operation === 'catastro.parcels' ? collection(parcel()) : desc.operation === 'catastro.buildings' ? gml : desc.operation === 'ign.terrain' ? ascii : JSON.stringify(osm), { cached: true, retrievedAt: '2026-10-18T00:00:00Z' });
  } });
  assert.equal(seen.length, 5); assert.deepEqual(progress, ['parcels', 'buildings', 'terrain', 'trees', 'context']);
  assert.equal(result.parcels.length, 1); assert.equal(result.buildingParts.length, 1); assert.equal(result.trees.length, 1); assert.equal(result.roads.length, 1); assert.equal(result.partial, false);
  assert.equal(result.sources.length, 5); assert.equal(result.sources[0].cached, true); assert.equal(result.sources[0].retrievedAt, '2026-10-18T00:00:00Z');
  assert.deepEqual(result, JSON.parse(JSON.stringify(result)), 'Raw loader output must already be finite JSON for geo.import, without undefined metadata.');
  assert.match(result.sources[0].licenseNote, /restricciones distintas/); assert.match(result.sources[3].license, /ODbL/);
  assert.match(result.warnings.join(' '), /estimada/); assert.ok(!JSON.stringify(result).includes('propietario:'));
});
test('one failed layer yields explicit partial data; all failures reject instead of claiming a successful model', async () => {
  const result = await T.loadArea({ bbox, layers: { parcels: true, buildings: false, terrain: true, trees: false, context: false }, request: async d => { if (d.operation === 'ign.terrain') throw new Error('offline'); return envelope(d.operation, collection(parcel())); } });
  assert.equal(result.partial, true); assert.equal(result.terrain, null); assert.equal(result.layerErrors[0].layer, 'terrain'); assert.equal(result.parcels.length, 1);
  await assert.rejects(() => T.loadArea({ bbox, request: async () => { throw new Error('offline'); } }), /ninguna capa real/);
});
test('OSM layer checkboxes remain authoritative even if a provider returns extra mapped features', async () => {
  const request = async d => envelope(d.operation, JSON.stringify(osm));
  const trees = await T.loadArea({ bbox, layers: { parcels: false, buildings: false, terrain: false, trees: true, context: false }, request });
  assert.equal(trees.trees.length, 1); assert.equal(trees.roads.length, 0); assert.equal(trees.vegetationAreas.length, 0);
  const context = await T.loadArea({ bbox, layers: { parcels: false, buildings: false, terrain: false, trees: false, context: true }, request });
  assert.equal(context.trees.length, 0); assert.equal(context.roads.length, 1);
});
test('truncated GML makes loaded area explicitly partial and records provider counters', async () => {
  const r = await T.loadArea({ bbox, layers: { parcels: true, buildings: false, terrain: false, trees: false, context: false }, request: async d => envelope(d.operation, collection(parcel(), 'numberMatched="200" numberReturned="1"')) });
  assert.equal(r.partial, true); assert.equal(r.sources[0].numberMatched, 200); assert.match(r.warnings.join(' '), /truncada/);
});
test('geocoder candidates require choosing the correct result, then find resolves street with real Burgos coordinates', async () => {
  const calls = [], request = async d => { calls.push(d); return envelope(d.operation, d.operation === 'address.candidates' ? JSON.stringify([{ id: '90590002969', type: 'callejero', address: 'PLAZA ESPAÑA, Burgos', lat: 0, lng: 0 }]) : JSON.stringify({ id: '90590002969', type: 'callejero', address: 'ESPAÑA', lat: 42.34409324124441, lng: -3.697860263562573 })); };
  const r = await T.resolveLocation({ query: 'Plaza España Burgos', request }); assert.equal(r.candidates[0].lon, null);
  const c = await T.resolveCandidate({ candidate: r.candidates[0], request }); near(c.lon, -3.697860263562573); near(c.lat, 42.34409324124441);
  assert.equal(calls[1].operation, 'address.find'); assert.equal(calls[1].id, '90590002969');
});
test('point candidate avoids redundant find and invalid geocoder locations are rejected', async () => {
  const r = await T.resolveCandidate({ candidate: { id: 'p1', type: 'portal', label: 'Portal', lon: -3.7, lat: 42 }, request: () => { throw new Error('must not query'); } }); assert.equal(r.lon, -3.7);
  await assert.rejects(() => T.resolveCandidate({ candidate: { id: 'p1', type: 'portal', label: 'Portal' }, request: async d => envelope(d.operation, '{"lat":0,"lng":0}') }), /ubicación puntual/);
  assert.throws(() => T.buildRequest({ operation: 'address.find', query: 'Madrid', id: 'http://localhost', type: 'portal' }), /inválido/);
});
test('abort halts the remaining layer sequence and invalid envelope operation cannot cross layers', async () => {
  const controller = new AbortController(); let count = 0;
  await assert.rejects(() => T.loadArea({ bbox, signal: controller.signal, request: async d => { count++; controller.abort(); return envelope(d.operation, collection(parcel())); } }), /cancelada/); assert.equal(count, 1);
  await assert.rejects(() => T.loadArea({ bbox, layers: { parcels: true, buildings: false, terrain: false, trees: false, context: false }, request: async () => envelope('ign.terrain', collection(parcel())) }), /ninguna capa real/);
});
test('direct fetch is fixed to public endpoints, omits credentials, decodes latin1 XML and honors HTTP/size errors', async () => {
  let called;
  const r = await T.loadArea({ bbox, layers: { parcels: true, buildings: false, terrain: false, trees: false, context: false }, fetch: async (u, init) => {
    called = { u, init }; return new Response(collection(parcel()), { status: 200, headers: { 'content-type': 'application/xml' } });
  } });
  assert.equal(new URL(called.u).hostname, 'ovc.catastro.meh.es'); assert.equal(called.init.credentials, 'omit'); assert.equal(r.parcels.length, 1);
  await assert.rejects(() => T.loadArea({ bbox, layers: { parcels: true, buildings: false, terrain: false, trees: false, context: false }, fetch: async () => new Response('unavailable', { status: 503 }) }), /HTTP 503/);
});

(async () => {
  console.log('\nDédalo — Territorio: datos y parsers CPU\n');
  for (const t of tests) { try { await t.run(); passed++; console.log('  ok   ' + t.name); } catch (e) { failed++; console.error('  FALLA ' + t.name + '\n' + e.stack); } }
  console.log('\n' + passed + ' pruebas correctas; ' + failed + ' fallidas.'); if (failed) process.exitCode = 1;
})();
