/* Native IFC contract tests. Optional IFC_FIXTURE_DIR writes files for independent IfcOpenShell validation. */
'use strict';
const assert=require('node:assert/strict'), path=require('node:path'), fs=require('node:fs');
for(const file of ['core/geom','core/model','core/document','core/scene','core/hierarchy','core/ifc-categories','io/ifc-export'])require(path.join(__dirname,'../app/js',file+'.js'));
const D=globalThis.DEDALO;
let passed=0;
function test(name,fn){fn();passed++;console.log('  ok   '+name);}
function box(){const m=new D.Model();m.addRectangle([0,0,0],[1,0,0],[0,1,0],2,3);m.pushPull([...m.faces.keys()][0],4);return m;}
function fixture(name,entity){const doc=new D.Document();D.IFC.install(doc);doc.name='Muros españoles 東京';const def=doc.scene.addDefinition(name||'Componente','component',box());if(entity)def.metadata={ifc:{entity}};const node=doc.scene.addNode([],{definitionId:def.id});doc._syncProjection();return {doc,def,node};}
function writeFixture(name,doc){if(!process.env.IFC_FIXTURE_DIR)return;fs.mkdirSync(process.env.IFC_FIXTURE_DIR,{recursive:true});for(const schema of ['IFC4','IFC2X3']){const r=D.IFC.export(doc,{schema,strictClassification:true,timestamp:'2026-10-20T10:00:00Z'});fs.writeFileSync(path.join(process.env.IFC_FIXTURE_DIR,name+'-'+schema+'.ifc'),r.text);}}
test('catalogs expose concrete schema declarations and IFC2X3 MEP type mappings',()=>{
 assert.ok(D.IFCCategories.list('IFC4').length>=130);assert.ok(D.IFCCategories.list('IFC2X3').length>=100);
 const pipe=D.IFCCategories.resolve('IfcPipeSegment','IFC2X3');assert.equal(pipe.exportEntity,'IfcFlowSegment');assert.equal(pipe.type.entity,'IfcPipeSegmentType');
 assert.equal(D.IFCCategories.resolve('IfcImaginaryWall','IFC4'),null);
});
test('classification is transactional, survives save/reload, and undo restores metadata',()=>{
 const {doc,def,node}=fixture();doc.select({nodes:[node.id]});const before=JSON.stringify(doc.scene.toJSON());
 const assigned=doc.execute('bim.assign',{ifc:{entity:'IfcWall',predefinedType:'STANDARD',properties:{Pset_Example:{AcousticRating:'Rw 45',External:true}}}});assert.equal(assigned.ok,true);
 const saved=doc.fileJSON(),restored=new D.Document();D.IFC.install(restored);restored.loadJSON(saved);assert.equal(restored.scene.node([],node.id).metadata.ifc.entity,'IfcWall');
 assert.ok(doc.undo());assert.equal(JSON.stringify(doc.scene.toJSON()),before);assert.ok(doc.redo());assert.equal(doc.scene.node([],node.id).metadata.ifc.entity,'IfcWall');
 assert.equal(def.metadata,undefined,'classifying an instance does not change its shared definition');
});
test('ambiguous raw face selection requires grouping or explicit definition scope',()=>{
 const doc=new D.Document();D.IFC.install(doc);doc.execute('draw.rectangle',{origin:[0,0,0],u:[1,0,0],v:[0,1,0],width:2,height:2});
 assert.equal(doc.execute('bim.assign',{ifc:{entity:'IfcSlab'}}).ok,false);
 assert.equal(doc.execute('bim.assign',{scope:'definition',ifc:{entity:'IfcSlab'}}).ok,true);
});
test('reclassifying preserves BIM properties and material, clears category-specific attributes, and supports undo',()=>{
 const {doc,node}=fixture();doc.select({nodes:[node.id]});const old={entity:'IfcWall',predefinedType:'STANDARD',attributes:{PredefinedType:'STANDARD'},material:'Timber',storey:{name:'First floor',elevation:3},properties:{Pset_Specification:{FireRating:'60 min'}},classification:{system:'Uniclass',code:'test'}};
 assert.equal(doc.execute('bim.assign',{ifc:old}).ok,true);assert.equal(doc.execute('bim.assign',{ifc:{entity:'IfcColumn'}}).ok,true);
 const current=doc.scene.node([],node.id).metadata.ifc;assert.equal(current.material,'Timber');assert.deepEqual(current.properties,old.properties);assert.deepEqual(current.storey,old.storey);assert.equal(current.attributes,undefined);assert.equal(current.predefinedType,undefined);
 assert.ok(doc.undo());assert.equal(doc.scene.node([],node.id).metadata.ifc.predefinedType,'STANDARD');
 assert.equal(doc.execute('bim.assign',{replace:true,ifc:{entity:'IfcColumn'}}).ok,true);assert.deepEqual(doc.scene.node([],node.id).metadata.ifc,{entity:'IfcColumn'});
});
test('strict export refuses unclassified geometry; generic export reports every fallback',()=>{
 const {doc}=fixture('IfcWall | declared name');assert.throws(()=>D.IFC.export(doc,{strictClassification:true}),/Sin categoría IFC/);
 const result=D.IFC.export(doc);assert.equal(result.report.unclassified.length,1);assert.equal(result.report.unclassified[0].suggestedEntity,'IfcWall');assert.equal(result.report.categories.IfcBuildingElementProxy,1);
});
test('literal IFC name migration previews without changes, refuses ambiguity, and applies once with undo',()=>{
 const {doc,def}=fixture('IfcWall | Muro');const bad=doc.scene.addDefinition('preIfcColumn suffix','component',box()),ambiguous=doc.scene.addDefinition('IfcBeam + IfcColumn','component',box()),unknown=doc.scene.addDefinition('IfcFakeElement','component',box());
 doc.scene.addNode([],{definitionId:bad.id});doc.scene.addNode([],{definitionId:ambiguous.id});doc.scene.addNode([],{definitionId:unknown.id});doc._syncProjection();
 const before=JSON.stringify(doc.scene.toJSON()),undos=doc.undoStack.length,preview=doc.execute('bim.classifyNamed',{});
 assert.equal(preview.candidates.length,1);assert.ok(preview.conflicts.length>=2);assert.equal(JSON.stringify(doc.scene.toJSON()),before);assert.equal(doc.undoStack.length,undos);
 const applied=doc.execute('bim.classifyNamed',{apply:true});assert.equal(applied.count,1);assert.equal(doc.scene.definitions.get(def.id).metadata.ifc.entity,'IfcWall');assert.equal(doc.scene.definitions.get(bad.id).metadata,undefined);
 assert.ok(doc.undo());assert.equal(JSON.stringify(doc.scene.toJSON()),before);
});
test('required dimensions are checked instead of inventing reinforcement dimensions',()=>{
 const {doc,def}=fixture('Barra','IfcReinforcingBar');assert.throws(()=>D.IFC.export(doc,{schema:'IFC2X3',strictClassification:true}),/NominalDiameter/);
 def.metadata.ifc.attributes={NominalDiameter:0.02,CrossSectionArea:0.0003141592653589793};
 assert.equal(D.IFC.export(doc,{schema:'IFC2X3',strictClassification:true}).report.categories.IfcReinforcingBar,1);
 assert.equal(doc.execute('bim.assign',{scope:'definition',definitionId:def.id,ifc:{entity:'IfcReinforcingBar',attributes:{NominalDiameter:-1}}}).ok,false);
 assert.equal(doc.execute('bim.assign',{scope:'definition',definitionId:def.id,ifc:{entity:'IfcReinforcingBar',attributes:{NominalDiameter:null}}}).ok,false);
});
test('export preserves occurrence identity across renaming and never modifies source geometry',()=>{
 const {doc,def,node}=fixture('Wall','IfcWall');const before=JSON.stringify(doc.scene.toJSON()),a=D.IFC.export(doc);node.name='Renamed';const b=D.IFC.export(doc);
 const product=text=>text.match(/=IFCWALL\('([^']+)'/)[1];assert.equal(product(a.text),product(b.text));node.name='Wall';assert.equal(JSON.stringify(doc.scene.toJSON()),before);
 assert.equal(D.IFC.guid('00000000-0000-0000-0000-000000000000'),'0000000000000000000000');
});
test('nested shared components, nonuniform scaling and mirrors retain exact source transforms',()=>{
 const doc=new D.Document();D.IFC.install(doc);const child=doc.scene.addDefinition('Column','component',box());child.metadata={ifc:{entity:'IfcColumn',storey:{name:'Nivel 3',elevation:3}}};
 const parent=doc.scene.addDefinition('Assembly','component',new D.Model());parent.nodes.push({id:D.uuid(),kind:'component',name:'Column',definitionId:child.id,matrix:D.SceneMath.scaling([0,0,0],[-2,0.5,1.5])});
 doc.scene.addNode([],{definitionId:parent.id,matrix:D.SceneMath.translation([10,20,3])});doc.scene.addNode([],{definitionId:parent.id,matrix:D.SceneMath.translation([-10,0,0])});doc._syncProjection();
 const r=D.IFC.export(doc,{strictClassification:true});assert.equal(r.report.elements,2);assert.equal(r.report.types,1);assert.equal(r.report.groups,2);writeFixture('nested',doc);
});
test('IFC2X3 open surfaces are surface models and hosted openings have void relationships',()=>{
 const {doc,def,node}=fixture('Wall','IfcWall'),opening=doc.scene.addDefinition('Opening','component',box());opening.metadata={ifc:{entity:'IfcOpeningElement',host:node.id}};
 doc.scene.addNode([],{definitionId:opening.id,matrix:D.SceneMath.translation([0.5,1,1])});doc._syncProjection();const r=D.IFC.export(doc,{schema:'IFC2X3',strictClassification:true});assert.match(r.text,/IFCRELVOIDSELEMENT/);writeFixture('opening',doc);
 const surface=new D.Document(),model=new D.Model();model.addRectangle([0,0,0],[1,0,0],[0,1,0],2,2);const d=surface.scene.addDefinition('Plate','component',model);d.metadata={ifc:{entity:'IfcPlate'}};surface.scene.addNode([],{definitionId:d.id});
 const s=D.IFC.export(surface,{schema:'IFC2X3',strictClassification:true});assert.match(s.text,/IFCFACEBASEDSURFACEMODEL/);assert.doesNotMatch(s.text,/IFCFACETEDBREP/);writeFixture('surface',surface);
});
test('a composite roof has one aggregate relationship for all its parts',()=>{
 const doc=new D.Document();D.IFC.install(doc);const roof=doc.scene.addDefinition('Roof','component',new D.Model());roof.metadata={ifc:{entity:'IfcRoof'}};
 const slab=doc.scene.addDefinition('Roof slab','component',box());slab.metadata={ifc:{entity:'IfcSlab',predefinedType:'ROOF'}};
 for(let i=0;i<3;i++)roof.nodes.push({id:D.uuid(),kind:'component',name:'Roof slab',definitionId:slab.id,matrix:D.SceneMath.translation([i*2,0,0])});
 doc.scene.addNode([],{definitionId:roof.id});doc._syncProjection();const result=D.IFC.export(doc,{schema:'IFC2X3',strictClassification:true});
 assert.equal((result.text.match(/IFCRELAGGREGATES\([^\n]+Descomposici/g)||[]).length,1);writeFixture('roof',doc);
});
test('IFC4 and IFC2X3 preserve explicit MEP categories using schema-specific occurrences and types',()=>{
 const {doc}=fixture('Pipe','IfcPipeSegment');const a=D.IFC.export(doc,{schema:'IFC4',strictClassification:true}),b=D.IFC.export(doc,{schema:'IFC2X3',strictClassification:true});assert.match(a.text,/IFCPIPESEGMENT\(/);assert.match(b.text,/IFCFLOWSEGMENT\(/);assert.match(b.text,/IFCPIPESEGMENTTYPE\(/);writeFixture('pipe',doc);
});
test('large-model reports retain exact totals while transport samples stay bounded',()=>{
 const rows=Array.from({length:10000},(_,i)=>({id:i,name:'Element '+i})),report={elements:10000,unclassified:rows,fallbacks:rows,warnings:rows};const summary=D.IFC.summarizeReport(report,3);
 assert.equal(summary.totalUnclassified,10000);assert.equal(summary.totalFallbacks,10000);assert.equal(summary.totalWarnings,10000);assert.equal(summary.unclassified.length,3);assert.equal(summary.truncated,true);assert.ok(JSON.stringify(summary).length<2000);
 const {doc}=fixture('IfcWall | W');for(let i=0;i<3;i++)doc.scene.addDefinition('IfcBeam | B'+i,'component',box());const preview=doc.execute('bim.classifyNamed',{limit:1});assert.equal(preview.totalCandidates,4);assert.equal(preview.candidates.length,1);assert.equal(doc.undoStack.length,0);
});
console.log(passed+' IFC tests passed.');
