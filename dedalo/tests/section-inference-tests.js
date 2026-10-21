'use strict';
const assert=require('node:assert/strict'),path=require('node:path');
for(const f of ['core/geom','core/model','core/document','core/scene','core/hierarchy','core/section-box','view/inference'])require(path.join(__dirname,'../app/js',f+'.js'));
const D=globalThis.DEDALO,S=D.SectionBox,b=S.normalize({min:[0,0,0],max:[1,1,1]});
let pass=0;
function test(name,fn){fn();pass++;console.log('ok '+name);}
function fixture() {
 const model={verts:new Map(),edges:new Map(),faces:new Map(),curves:new Map(),annots:new Map()};
 const app={doc:{model},renderer:{opts:{sectionBox:b,showGuides:true}},camera:{
  project:p=>({x:p[0]*100,y:p[1]*100,behind:false}),
  ray:(x,y)=>({o:[x/100,y/100,3],d:[0,0,-1]})}};
 return {model,app,inf:new D.Inference(app)};
}
test('hidden curve centres, guide points and origin do not attract point snapping',()=>{
 const {model,app,inf}=fixture();
 model.curves.set(1,{center:[2,0.5,0.5]});
 assert.equal(inf._pointSnaps(200,50,null,{}),null);
 model.curves.set(1,{center:[0.5,0.5,0.5]});
 assert.equal(inf._pointSnaps(50,50,null,{}).type,'center');
 model.curves.clear();model.annots.set(1,{id:1,kind:'guidePoint',p:[2,0.5,0.5]});
 assert.equal(inf._pointSnaps(200,50,null,{}),null);
 model.annots.get(1).p=[0.5,0.5,0.5];
 assert.equal(inf._pointSnaps(50,50,null,{}).type,'guide');
 model.annots.clear();app.renderer.opts.showAxes=true;
 app.renderer.opts.sectionBox=S.normalize({min:[0.1,0.1,0.1],max:[1,1,1]});
 assert.equal(inf._pointSnaps(0,0,null,{}),null);
});
test('a guide crosses the section only through its retained points',()=>{
 const {model,app,inf}=fixture();
 model.annots.set(1,{id:1,kind:'guideLine',p:[-2,0.5,0.5],dir:[1,0,0]});
 assert.equal(inf._guideSnap(200,50,app.camera.ray(200,50),{}),null);
 const snap=inf._guideSnap(50,50,app.camera.ray(50,50),{});
 assert.equal(snap.type,'guide');assert(S.contains(b,snap.p));
});
test('tracking ignores acquired hidden points and candidates outside the section',()=>{
 const {app,inf}=fixture();
 inf.tracking=[{p:[2,0.5,0.5]}];
 assert.equal(inf._trackingSnap(50,50,app.camera.ray(50,50),{},null),null);
 assert.equal(inf._trackOnLine(50,50,[0.5,0,0.5],[0,1,0]),null);
 inf.tracking=[{p:[0.5,0.5,0.5]}];
 assert.equal(inf._trackingSnap(200,50,app.camera.ray(200,50),{},null),null);
 assert(inf._trackingSnap(75,50,app.camera.ray(75,50),{},null));
 assert(inf._trackOnLine(75,50,[0.75,0,0.5],[0,1,0]));
});
console.log(pass+' section inference tests passed');
