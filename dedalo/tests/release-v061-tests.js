'use strict';
const assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs');
for(const f of ['core/geom','core/model','core/document','core/scene','core/hierarchy','core/ifc-categories','core/section-box','io/ifc-export','view/camera'])require(path.join(__dirname,'../app/js',f+'.js'));
const D=globalThis.DEDALO;let passed=0;
function test(name,fn){fn();passed++;console.log('ok '+name);}
function box(){const m=new D.Model();m.addRectangle([0,0,0],[1,0,0],[0,1,0],2,3);m.pushPull([...m.faces.keys()][0],4);return m;}
function fixture(){
 const doc=new D.Document();D.IFC.install(doc);const frame=doc.scene.addDefinition('Viga compuesta','component'),part=doc.scene.addDefinition('Pieza repetida','component',box());
 frame.nodes.push({id:D.uuid(),name:'A',kind:'component',definitionId:part.id,matrix:D.SceneMath.translation([0,0,0])},{id:D.uuid(),name:'B',kind:'component',definitionId:part.id,matrix:D.SceneMath.translation([5,0,0])});
 const node=doc.scene.addNode([],{definitionId:frame.id});doc._syncProjection();return {doc,frame,part,node};
}
test('parent category owns nested unclassified meshes once; one IFC element and complete geometry',()=>{
 const {doc,node}=fixture();doc.select({nodes:[node.id]});assert(doc.execute('bim.assign',{ifc:{entity:'IfcBeam'}}).ok);
 const inventory=doc.execute('bim.inventory',{});assert.equal(inventory.total,1);assert.equal(inventory.unclassified,0);assert.equal(inventory.faces,12);
 for(const schema of ['IFC4','IFC2X3']){const r=D.IFC.export(doc,{schema,strictClassification:true});assert.equal(r.report.elements,1);assert.equal(r.report.faces,12);assert.equal(r.report.categories.IfcBeam,1);if(process.env.IFC_FIXTURE_DIR)fs.writeFileSync(path.join(process.env.IFC_FIXTURE_DIR,'compound-'+schema+'.ifc'),r.text);}
});
test('explicit nested category overrides container ownership without omitted or duplicate faces',()=>{
 const {doc,frame,node}=fixture();node.metadata={ifc:{entity:'IfcRoof'}};frame.nodes[1].metadata={ifc:{entity:'IfcBeam'}};
 const before=JSON.stringify(doc.scene.toJSON()),inv=doc.execute('bim.inventory',{});assert.equal(inv.total,2);assert.equal(inv.faces,12);
 for(const schema of ['IFC4','IFC2X3']){const r=D.IFC.export(doc,{schema,strictClassification:true});assert.equal(r.report.elements,2);assert.equal(r.report.faces,12);if(process.env.IFC_FIXTURE_DIR)fs.writeFileSync(path.join(process.env.IFC_FIXTURE_DIR,'override-'+schema+'.ifc'),r.text);}
 assert.equal(JSON.stringify(doc.scene.toJSON()),before);
});
test('full export ignores active nested context, view crop, and selection',()=>{
 const {doc,node,frame}=fixture();frame.metadata={ifc:{entity:'IfcColumn'}};doc.scene.addNode([],{definitionId:frame.id,matrix:D.SceneMath.translation([40,0,0])});doc._syncProjection();doc.select({nodes:[node.id]});doc.execute('context.enter',{node:node.id});doc.clearSelection();
 const r=D.IFC.export(doc,{strictClassification:true});assert.equal(r.report.faces,24);assert.equal(r.report.elements,2);assert.equal(r.report.scope,'entire-model');
});
test('free edges are included as IFC curves alongside faces and alone',()=>{
 const {doc,node,frame}=fixture();node.metadata={ifc:{entity:'IfcBeam'}};frame.model.addSegment([0,0,7],[8,0,7]);
 for(const schema of ['IFC4','IFC2X3']){const r=D.IFC.export(doc,{schema,strictClassification:true});assert(r.text.includes('IFCGEOMETRICCURVESET('));assert.equal(r.report.looseEdges,1);if(process.env.IFC_FIXTURE_DIR)fs.writeFileSync(path.join(process.env.IFC_FIXTURE_DIR,'curves-'+schema+'.ifc'),r.text);}
});
test('bounded inventory exposes node context paths for AI; assignment can target nested nodes without changing edit context',()=>{
 const {doc,frame}=fixture();let inv=doc.execute('bim.inventory',{limit:1});assert.equal(inv.items.length,1);assert(inv.nextOffset!==null);
 const item=inv.items[0];assert(doc.execute('bim.assign',{path:item.context,nodes:[item.id],ifc:{entity:'IfcMember'}}).ok);assert.equal(doc.editPath.length,0);
 assert.equal(doc.scene.node(item.context,item.id).metadata.ifc.entity,'IfcMember');
 assert.equal(doc.execute('bim.inventory',{limit:1,unclassifiedOnly:true}).items.length,1);
});
test('normal save is canonical and compact, including after verbose audit data; explicit legacy fallback is still supported',()=>{
 const {doc,node}=fixture();doc.select({nodes:[node.id]});doc.execute('bim.assign',{ifc:{entity:'IfcBeam'}});
 const geometry=JSON.stringify(doc.scene.toJSON()),original=doc.scene.project;doc.scene.project=()=>{throw Error('Saving must not expand instances');};
 let saved;try{saved=doc.fileJSON();assert.equal(saved.model,undefined);assert(saved.audit[0].changes.every(c=>!('before'in c)&&!('after'in c)));}finally{doc.scene.project=original;}
 const restored=new D.Document();restored.loadJSON(saved);assert.equal(JSON.stringify(restored.scene.toJSON()),geometry);
 assert(doc.fileJSON({}, {compact:false}).model);
});
test('six face handles drag both perspective and ortho; clamp planes, Escape restore, and no geometry mutation',()=>{
 for(const persp of [true,false])for(let axis=0;axis<3;axis++)for(const side of ['min','max']){
  const {doc}=fixture(),cam=new D.Camera();cam.setSize(900,600);cam.fit({min:[0,0,0],max:[7,3,4]});cam.persp=persp;cam.update();
  const app={doc,camera:cam,tool:{id:'select',state:0},renderer:{opts:{}},files:{scheduleAutosave(){}},ui:{refreshPanels(){},refreshTitle(){}},el:{ov:{style:{}}},requestRender(){},exec(c,p){return doc.execute(c,p);}};
  D.SectionBox.install(app);doc.execute('view.sectionBox',{min:[-1,-1,-1],max:[8,4,5]});const before=JSON.stringify(doc.scene.toJSON()),c=app.sectionController;
  const h=c.screenHandles().find(h=>h.kind==='face'&&h.axis===axis&&h.side===side);assert(h);
  // Force the specific visible face for deterministic controller movement testing.
  const hit=c.hit;c.hit=()=>h;assert(c.begin({x:h.s.x,y:h.s.y,button:0}));c.hit=hit;
  c.move({x:h.s.x+c.drag.axis[0]*25,y:h.s.y+c.drag.axis[1]*25});assert.notEqual(app.renderer.opts.sectionBox[side][axis],side==='min'?[-1,-1,-1][axis]:[8,4,5][axis]);
  assert(c.cancel());assert.equal(app.renderer.opts.sectionBox[side][axis],side==='min'?[-1,-1,-1][axis]:[8,4,5][axis]);assert.equal(JSON.stringify(doc.scene.toJSON()),before);
 }
});
test('corner and move grips preserve valid extents; face and move grips remain pickable in front view',()=>{
 const {doc}=fixture(),cam=new D.Camera();cam.setSize(900,600);cam.fit({min:[0,0,0],max:[7,3,4]});cam.persp=false;cam.setView('front');cam.update();
 const app={doc,camera:cam,tool:{id:'select',state:0},renderer:{opts:{}},files:{scheduleAutosave(){}},ui:{refreshPanels(){},refreshTitle(){}},el:{ov:{style:{}}},requestRender(){},exec(c,p){return doc.execute(c,p);}};
 D.SectionBox.install(app);doc.execute('view.sectionBox',{min:[-1,-1,-1],max:[8,4,5]});
 const controller=app.sectionController;
 for(const id of ['move','min1','max1']){const h=controller.screenHandles().find(h=>h.id===id);assert.equal(controller.hit(h.s.x,h.s.y).id,id);}
 const move=controller.screenHandles().find(h=>h.id==='move'),extent=app.renderer.opts.sectionBox.max.map((v,i)=>v-app.renderer.opts.sectionBox.min[i]);
 assert(controller.begin({x:move.s.x,y:move.s.y,button:0}));controller.move({x:move.s.x+30,y:move.s.y-20});assert(controller.end());assert(app.renderer.opts.sectionBox.max.every((v,i)=>Math.abs(v-app.renderer.opts.sectionBox.min[i]-extent[i])<1e-9));
 const corner=controller.screenHandles().find(h=>h.kind==='corner'),original=JSON.stringify(app.renderer.opts.sectionBox),hit=controller.hit;controller.hit=()=>corner;controller.begin({x:corner.s.x,y:corner.s.y,button:0});controller.hit=hit;controller.move({x:corner.s.x+100000,y:corner.s.y+100000});assert(app.renderer.opts.sectionBox.max.every((v,i)=>v>app.renderer.opts.sectionBox.min[i]));controller.cancel();assert.equal(JSON.stringify(app.renderer.opts.sectionBox),original);
 assert.equal(doc.execute('bim.inventory',{limit:0}).nextOffset,null);
});
console.log(passed+' release regression tests passed');

