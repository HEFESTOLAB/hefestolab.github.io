/* Dédalo: direct IFC classification and on-canvas section controls. */
(function(root){
 'use strict'; const D=root.DEDALO;
 const names={IfcWall:'Muro',IfcSlab:'Forjado / losa',IfcBeam:'Viga',IfcColumn:'Pilar',IfcMember:'Miembro estructural',IfcRoof:'Cubierta',IfcRailing:'Barandilla',IfcStair:'Escalera',IfcStairFlight:'Tramo de escalera',IfcDoor:'Puerta',IfcWindow:'Ventana',IfcFooting:'Cimentación',IfcPile:'Pilote',IfcPlate:'Placa',IfcCovering:'Revestimiento',IfcCurtainWall:'Muro cortina',IfcBuildingElementPart:'Parte constructiva',IfcElementAssembly:'Conjunto de elementos',IfcFurnishingElement:'Mobiliario',IfcPipeSegment:'Tubería',IfcPipeFitting:'Accesorio de tubería',IfcDuctSegment:'Conducto',IfcDuctFitting:'Accesorio de conducto',IfcBuildingElementProxy:'Elemento genérico (sin equivalente específico)'};
 const el=(tag,text,props)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;Object.assign(n,props||{});return n;};
 const btn=(label,fn,cls)=>{const n=el('button',label,{type:'button',className:cls||''});n.addEventListener('click',fn);return n;};
 const note=t=>el('p',t,{className:'muted'});
 function field(body,text,input){const l=el('label',text);l.append(input);body.append(l);return input;}
 function details(body,title){const d=el('details');d.append(el('summary',title));body.append(d);return d;}
 const title=t=>el('h3',t);
 const resultError=(app,r)=>{if(!r?.ok)app.toast(r?.error||'No se pudo completar la operación.','error');return r?.ok;};
 D.UI.prototype.panel_section=function(body,full){
  const app=this.app,b=app.renderer.opts.sectionBox,key=JSON.stringify(b);
  if(!full&&body.dataset.sectionKey===key)return;body.dataset.sectionKey=key;body.replaceChildren();
  body.append(note('Arrastra los tiradores de las seis caras para recortar. Las esquinas cambian el tamaño y el tirador central mueve la caja.'));
  const fit=selection=>{app.setTool('select');app.exec('view.sectionBoxFit',{selection});};
  const row=el('div',undefined,{className:'btnrow'});
  row.append(btn(b?'Reajustar al modelo':'Activar caja de sección',()=>fit(false),'primary'),btn('Ajustar a selección',()=>fit(true)));body.append(row);
  if(!b){body.append(note('El recorte solo afecta a la vista. El archivo IFC incluye el modelo completo.'));return;}
  body.append(note('Seleccionar (Espacio) · arrastrar en el 3D · Esc cancela. En modelos grandes en CPU, el corte se aplica al soltar para mantener los tiradores ágiles.'));
  const show=el('input',undefined,{type:'checkbox',checked:b.showBox}),handles=el('input',undefined,{type:'checkbox',checked:b.showHandles!==false});
  field(body,'Mostrar contorno ',show);field(body,'Mostrar tiradores 3D ',handles);
  const applyVisibility=()=>app.exec('view.sectionBox',{...b,showBox:show.checked,showHandles:handles.checked});
  show.addEventListener('change',applyVisibility);handles.addEventListener('change',applyVisibility);
  const advanced=details(body,'Límites numéricos · metros'),inputs={min:[],max:[]},table=el('table',undefined,{className:'section-limits'});
  const head=el('tr');for(const t of ['Eje','Mínimo','Máximo'])head.append(el('th',t));table.append(head);
  ['X','Y','Z'].forEach((axis,i)=>{const tr=el('tr');tr.append(el('td',axis));for(const k of ['min','max']){const input=el('input',undefined,{type:'number',step:'any',value:String(+b[k][i].toFixed(6))});input.setAttribute('aria-label',axis+' '+k);const td=el('td');td.append(input);tr.append(td);inputs[k].push(input);}table.append(tr);});
  advanced.append(table,btn('Aplicar límites',()=>app.exec('view.sectionBox',{min:inputs.min.map(n=>Number(n.value)),max:inputs.max.map(n=>Number(n.value)),showBox:show.checked,showHandles:handles.checked})));
  body.append(btn('Desactivar caja',()=>app.exec('view.sectionBox',{enabled:false})),note('La geometría se conserva. Los planos de corte quedan abiertos; entrar o salir de un grupo desactiva la caja local.'));
 };
 D.UI.prototype.ifcSelection=function(body){
  const app=this.app,doc=app.doc,nodes=[...doc.sel.nodes].map(id=>doc.scene.node(doc.editPath,id)).filter(Boolean);
  if(!nodes.length){body.append(note('Selecciona un grupo o componente para asignarle su categoría IFC.'));return;}
  body.append(title('Categoría IFC de la selección'));
  const current=doc.execute('bim.get',{nodes:nodes.map(n=>n.id)}),items=current.items||[];
  const entities=[...new Set(items.map(i=>i.effective?.entity||''))],entity=entities.length===1?entities[0]:'';
  const select=el('select');select.setAttribute('aria-label','Categoría IFC de la selección');
  select.append(el('option',entities.length>1?'Varias categorías — elegir una':'Elegir categoría…',{value:''}));
  const catalog=D.IFCCategories.list(this._ifcSchema||'IFC4'),common=el('optgroup',undefined,{label:'Categorías habituales'}),other=el('optgroup',undefined,{label:'Otras categorías IFC'});
  for(const c of catalog){const n=el('option',(names[c.entity]?names[c.entity]+' · ':'')+c.entity,{value:c.entity});(names[c.entity]?common:other).append(n);}
  select.append(common,other);select.value=entity;body.append(select);
  body.append(note('La categoría abarca la geometría del grupo o componente. Los elementos internos con categoría propia se conservan como elementos independientes.'));
  const all=el('input',undefined,{type:'checkbox'}),shared=nodes.every(n=>n.kind==='component'&&n.definitionId===nodes[0].definitionId);
  if(shared)field(body,'Aplicar a todos los ejemplares de este componente ',all);
  const advanced=details(body,'Opciones de categoría'),predefined=el('select'),objectType=el('input',undefined,{type:'text',placeholder:'Descripción para USERDEFINED'}),storey=el('input',undefined,{type:'text',placeholder:'Planta (opcional)'}),elevation=el('input',undefined,{type:'number',step:'any',value:'0'}),host=el('input',undefined,{type:'text',placeholder:'ID del anfitrión, si la categoría lo requiere'}),attrs=el('div');let fields=[];
  field(advanced,'Tipo predefinido ',predefined);field(advanced,'Descripción del tipo ',objectType);field(advanced,'Planta ',storey);field(advanced,'Cota de planta · m ',elevation);field(advanced,'Anfitrión ',host);advanced.append(attrs);
  const refresh=()=>{
   const row=D.IFCCategories.resolve(select.value,this._ifcSchema||'IFC4');predefined.replaceChildren(el('option','Sin especificar',{value:''}));for(const v of row?.predefinedTypes||[])predefined.append(el('option',v,{value:v}));
   attrs.replaceChildren();fields=[];
   for(const a of row?row.attributes.slice(8).filter(a=>!a.optional&&a.name!=='PredefinedType'):[]){
    const numeric=/<real>|<integer>/.test(a.type),input=el(a.enum?'select':'input',undefined,{type:numeric?'number':'text',step:'any'});
    if(a.enum)for(const v of a.enum)input.append(el('option',v,{value:v}));
    field(attrs,a.name+' (obligatorio) ',input);fields.push({a,input,numeric});advanced.open=true;
   }
  };select.addEventListener('change',refresh);refresh();
  const previous=items[0]?.effective;
  if(previous&&entities.length===1){predefined.value=previous.predefinedType||'';objectType.value=previous.objectType||'';storey.value=previous.storey?.name||'';elevation.value=String(previous.storey?.elevation||0);host.value=previous.host||'';for(const f of fields)if(previous.attributes?.[f.a.name]!==undefined)f.input.value=String(previous.attributes[f.a.name]);}
  const target=()=>all.checked&&shared?{scope:'definition',definitionId:nodes[0].definitionId}:{scope:'instance',nodes:nodes.map(n=>n.id)};
  const row=el('div',undefined,{className:'btnrow'});
  row.append(btn('Asignar categoría',()=>{
   if(!select.value){app.toast('Elige una categoría IFC.','warn');return;}
   const ifc={entity:select.value};if(predefined.value)ifc.predefinedType=predefined.value;if(objectType.value.trim())ifc.objectType=objectType.value.trim();
   if(storey.value.trim())ifc.storey={name:storey.value.trim(),elevation:Number(elevation.value)};if(host.value.trim())ifc.host=host.value.trim();
   if(fields.length){ifc.attributes={};for(const f of fields){if(!f.input.value.trim()){advanced.open=true;app.toast('Completa '+f.a.name,'warn');return;}ifc.attributes[f.a.name]=f.numeric?Number(f.input.value):f.input.value;}}
   if(resultError(app,app.exec('bim.assign',{...target(),ifc})))app.toast('Categoría asignada: '+(names[select.value]||select.value),'ok');
  },'primary'),btn('Quitar categoría',()=>app.exec('bim.clear',target())));body.append(row);
 };
 D.UI.prototype.panel_bim=function(body,full){
  const app=this.app,doc=app.doc,key=doc.projectVersion+'|'+JSON.stringify(doc.selectionItems())+'|'+doc.editPath.join('/')+'|'+(this._ifcSchema||'IFC4');
  if(!full&&body.dataset.bimKey===key)return;body.dataset.bimKey=key;body.replaceChildren();
  const inv=doc.execute('bim.inventory',{unclassifiedOnly:true,limit:8});
  body.append(title('Un IFC · modelo completo'),note('Se exporta toda la geometría, incluso fuera de la selección y de la caja de sección.'));
  if(!inv.ok){body.append(note(inv.error));return;}
  body.append(el('div',inv.total+' elementos · '+inv.classified+' clasificados · '+inv.unclassified+' pendientes',{className:'ifc-summary'}));
  const schema=el('select');schema.setAttribute('aria-label','Formato IFC');for(const value of ['IFC4','IFC2X3'])schema.append(el('option',value==='IFC4'?'IFC4 (recomendado)':'IFC2X3 (compatibilidad)',{value}));schema.value=this._ifcSchema||'IFC4';field(body,'Formato ',schema);
  schema.addEventListener('change',()=>{this._ifcSchema=schema.value;this.renderPanel(true);});
  const status=el('div',undefined,{className:'ifc-message'}),exportButton=btn('Exportar modelo completo',()=>{
   if(inv.unclassified){status.textContent='Asigna categoría a los '+inv.unclassified+' elementos pendientes antes de exportar.';app.toast(status.textContent,'warn');return;}
   try{const r=app.files.exportIFC({schema:schema.value,strictClassification:true});status.textContent='Archivo IFC creado: '+r.report.elements+' elementos; '+r.report.faces+' caras. Modelo completo.';app.toast('IFC completo exportado','ok');}
   catch(e){status.textContent=e.message;app.toast(e.message,'error');}
  },'primary ifc-export');body.append(exportButton,status);
  this.ifcSelection(body);
  if(inv.unclassified){
   body.append(title('Pendientes de categoría'));
   for(const item of inv.items){const row=el('div',undefined,{className:'ifc-pending'});row.append(el('span',item.name));row.append(btn('Seleccionar',()=>{
    while(doc.editPath.length)app.exec('context.exit');
    for(const id of item.context)app.exec('context.enter',{node:id});
    if(item.path.length)app.exec('select',{nodes:[item.id]});else { const m=doc.currentDefinition().model;const r=app.exec('group.create',{name:'Geometría sin agrupar',faces:[...m.faces.keys()],edges:[...m.edges.keys()]});if(r?.ok)app.exec('select',{nodes:[r.node]}); }
   }));body.append(row);}
   if(inv.unclassified>inv.items.length)body.append(note('Se muestran los primeros '+inv.items.length+'. La lista se actualiza al asignar categorías.'));
  }
  const advanced=details(body,'Herramientas de revisión');
  advanced.append(btn('Comprobar exportación',()=>{
   const r=doc.execute('bim.validate',{schema:schema.value,strictClassification:true,limit:10});status.textContent=r.ok?'Comprobación correcta: '+r.report.elements+' elementos, '+r.report.faces+' caras.':r.error;
  }));
  advanced.append(btn('Reconocer clases IFC escritas en nombres',()=>{
   const r=app.exec('bim.classifyNamed',{schema:schema.value,apply:true,limit:8});status.textContent=r.ok?'Categorías importadas: '+(r.count||0)+'. Solo se reconocen nombres IFC literales.':r.error;
  }));
  advanced.append(note('Las categorías se guardan con el proyecto. La IA consulta bim.inventory, asigna con bim.assign y revisa con bim.validate. No se deducen categorías por la forma.'));
 };
})(typeof window!=='undefined'?window:globalThis);

