'use strict';
// In-memory file encoders: no DOM, canvas, renderer or filesystem downloads.
const assert = require('node:assert/strict'), path = require('node:path');
const appPath = path.join(__dirname, '..', 'app', 'js');
for (const f of ['core/geom.js', 'core/model.js', 'core/document.js', 'core/scene.js', 'core/hierarchy.js', 'io/files.js']) require(path.join(appPath, f));
const D = globalThis.DEDALO;
D.STYLE = { front: '#ffffff' }; D.hexColor = () => [1, 1, 1, 1];
const doc = new D.Document();
function exec(name, params) { const r = doc.execute(name, params); assert.ok(r.ok, r.error); return r; }
exec('draw.rectangle', { origin: [0, 0, 0], width: 1, height: 1 });
exec('face.pushPull', { face: [...doc.model.faces.keys()][0], distance: 1 }); exec('select.all');
const a = exec('component.create', { name: 'Caja' });
exec('component.instantiate', { definitionId: a.definitionId, matrix: D.SceneMath.translation([3, 0, 0]) });
exec('context.enter', { node: a.node });
const downloads = [];
const file = new D.Files({ doc, toast() {}, camera: { toJSON: () => ({ target: [0, 0, 0] }) }, renderer: { opts: {} } });
file.download = (name, data, mime) => downloads.push({ name, data, mime });
const originalTimeout = globalThis.setTimeout;
globalThis.setTimeout = fn => { fn(); return 0; };
try { file.exportOBJ(); file.exportSTL(); } finally { globalThis.setTimeout = originalTimeout; }
(async () => {
  const obj = downloads.find(x => x.name.endsWith('.obj')).data;
  assert.equal(obj.split('\n').filter(x => x.startsWith('v ')).length, 16);
  assert.equal(obj.split('\n').filter(x => x.startsWith('f ')).length, 12);
  assert.ok(obj.includes('v 4.000000'), 'incluye la segunda instancia mundial');
  console.log('ok OBJ exporta ambas instancias desde edición aislada');
  const bytes = await downloads.find(x => x.name.endsWith('.stl')).data.arrayBuffer();
  assert.equal(new DataView(bytes).getUint32(80, true), 24);
  assert.equal(bytes.byteLength, 84 + 24 * 50);
  console.log('ok STL contiene los triángulos de ambas instancias');
  const native = file.fileJSON();
  assert.equal(native.version, 2); assert.equal(native.camera, undefined);
  const reopened = new D.Document(); reopened.loadJSON(JSON.parse(JSON.stringify(native)));
  assert.equal(reopened.worldModel().faces.size, 12);
  assert.equal(JSON.stringify(reopened.scene.toJSON()), JSON.stringify(doc.scene.toJSON()));
  console.log('ok guardar desde un grupo conserva toda la escena mundial');
  console.log('3 correctas, 0 fallidas');
})().catch(error => { console.error(error); process.exitCode = 1; });
