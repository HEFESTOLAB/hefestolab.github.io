'use strict';
const assert=require('assert'),path=require('path');
for(const f of ['core/geom','core/model','core/document','core/scene','core/hierarchy','core/section-box','view/camera','view/renderer','view/softrender','view/inference','io/files']) require(path.join(__dirname,'../app/js',f+'.js'));
const D=globalThis.DEDALO,S=D.SectionBox;
let pass=0;
function test(name,fn) { fn(); pass++; console.log('ok '+name); }
const b=S.normalize({min:[0,0,0],max:[1,1,1]});
test('reject nonfinite, inverted and zero extent; preserve disabled',()=>{
 assert.throws(()=>S.normalize({min:[NaN,0,0],max:[1,1,1]}));
 assert.throws(()=>S.normalize({min:[0,0,0],max:[0,1,1]}));
 assert.strictEqual(S.normalize({enabled:false}),null);
});
test('clip triangle crossing all six planes; interpolated attributes',()=>{
 const p=S.polygon(b,[[-2,0.5,0.5,2],[3,0.5,0.5,7],[0.5,4,0.5,4.5]]);
 assert(p.length>=3); for(const v of p) { assert(S.contains(b,v.slice(0,3))); assert(Math.abs(v[3]-(v[0]+4))<1e-10); }
 assert.strictEqual(S.polygon(b,[[-2,0,0],[-1,0,0],[-1,1,0]]).length,0);
});
test('segment clipping parallel/on plane/crossing and box wires',()=>{
 assert.deepStrictEqual(S.segment(b,[-2,0.5,0.5],[2,0.5,0.5]),[[0,0.5,0.5],[1,0.5,0.5]]);
 assert.strictEqual(S.segment(b,[-1,-1,0],[-1,1,0]),null);
 assert.strictEqual(S.wires(b).length,12);
 assert.strictEqual(S.wires({...b,showBox:false}).length,0);
});
const doc=new D.Document(); doc.execute('draw.rectangle',{origin:[-2,-2,0.5],width:4,height:4});
test('software renderer clips faces and edges without mutating topology',()=>{
 const before=JSON.stringify(doc.scene.toJSON());
 const r=Object.create(D.SoftRenderer.prototype); r.style={...D.STYLE}; r.opts={sectionBox:b,showEdges:true};
 r.buildFaces(doc.model); assert(r.tris.length>=2);
 for(const t of r.tris) for(const v of [t.a,t.b,t.c]) assert(S.contains(b,v));
 r.modelLines(doc.model); assert(r.lines.length>=12);
 assert.strictEqual(before,JSON.stringify(doc.scene.toJSON()));
});
test('WebGL upload contains clipped vertices',()=>{
 let upload; const r=Object.create(D.Renderer.prototype); r.style={...D.STYLE}; r.opts={sectionBox:b}; r.gl={ARRAY_BUFFER:1,DYNAMIC_DRAW:2,bindBuffer(){},bufferData(k,values){upload=values;}};
 r.buildFaces(doc.model); assert(upload.length>=42);
 for(let i=0;i<upload.length;i+=14) assert(S.contains(b,[upload[i],upload[i+1],upload[i+2]]));
});
test('picking skips clipped front faces; nearest retained hit is selectable',()=>{
 const m=new D.Model(); m.addRectangle([0,0,0],[1,0,0],[0,1,0],1,1); m.addRectangle([0,0,2],[1,0,0],[0,1,0],1,1);
 const app={doc:{model:m},renderer:{opts:{sectionBox:S.normalize({min:[0,0,-1],max:[1,1,1]})}}};
 const picker=new D.Picker(app); const hits=picker.raycast({o:[0.5,0.5,3],d:[0,0,-1]});
 assert.strictEqual(hits.length,1); assert.strictEqual(hits[0].p[2],0);
});
test('human and AI command fit/disable/query; readonly query; scene unchanged',()=>{
 const before=JSON.stringify(doc.scene.toJSON());
 const app={doc,renderer:{opts:{}},files:{scheduleAutosave(){}},ui:{refreshPanels(){},refreshTitle(){}},requestRender(){}};
 S.install(app);
 assert(doc.execute('view.sectionBoxFit',{}).ok);
 assert(doc.execute('view.sectionBox',{read:true}).sectionBox);
 assert.strictEqual(doc.execute('view.sectionBoxFit',{selection:true}).ok,false);
 assert(doc.execute('view.sectionBox',{enabled:false}).ok);
 assert.strictEqual(app.renderer.opts.sectionBox,null);
 assert.strictEqual(before,JSON.stringify(doc.scene.toJSON()));
});
test('view settings roundtrip and section coordinates released on context change',()=>{
 const app={doc,renderer:{opts:{}},files:{scheduleAutosave(){}},ui:{refreshPanels(){},refreshTitle(){}},requestRender(){}}; S.install(app);
 doc.execute('view.sectionBox',b); const file=doc.fileJSON({view:app.renderer.opts});
 assert.deepStrictEqual(S.normalize(JSON.parse(JSON.stringify(file)).view.sectionBox),b);
 doc.emit('context'); assert.strictEqual(app.renderer.opts.sectionBox,null);
});
test('saving within a transformed child omits local limits on root reopening',()=>{
 const childDoc=new D.Document(); childDoc.execute('draw.rectangle',{origin:[0,0,0],width:2,height:3});
 const group=childDoc.execute('group.create',{faces:[...childDoc.model.faces.keys()],name:'Child'});
 assert(group.ok); assert(childDoc.execute('entities.move',{nodes:[group.node],vector:[10,0,0]}).ok);
 assert(childDoc.execute('context.enter',{node:group.node}).ok);
 const app={doc:childDoc,camera:{toJSON(){return {}; }},renderer:{opts:{sectionBox:b},style:D.STYLE},toast(){}};
 const files=new D.Files(app);const saved=files.fileJSON();assert.strictEqual(saved.view.sectionBox,null);
 const rootDoc=new D.Document();rootDoc.loadJSON(saved);assert.strictEqual(rootDoc.editPath.length,0);
 files.restoreView(saved);assert.strictEqual(app.renderer.opts.sectionBox,null);
});
test('view restore normalizes section and ignores invalid limits/foreign options',()=>{
 const app={renderer:{opts:{sectionBox:b},style:{...D.STYLE}},toast(){}};const files=new D.Files(app);
 files.restoreView({view:{sectionBox:{min:[1,0,0],max:[0,1,1]},unexpected:'x'}});
 assert.strictEqual(app.renderer.opts.sectionBox,null);assert.strictEqual(app.renderer.opts.unexpected,undefined);
 files.restoreView({view:{sectionBox:b}});assert.deepStrictEqual(app.renderer.opts.sectionBox,b);
});
test('compact autosave keeps canonical instances and avoids world projection',()=>{
 const before=doc.scene.toJSON();const original=doc.scene.project;
 doc.scene.project=()=>{throw new Error('must not flatten for autosave');};
 let saved;try{saved=doc.fileJSON({}, {compact:true,omitAudit:true});}finally{doc.scene.project=original;}
 assert.strictEqual(saved.model,undefined);assert.deepStrictEqual(saved.scene,before);assert(saved.autosave.auditOmitted);
 const restored=new D.Document();restored.loadJSON(saved);assert.deepStrictEqual(restored.scene.toJSON(),before);
});
console.log(pass+' section box tests passed');
