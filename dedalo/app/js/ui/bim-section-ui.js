(function(root) {
  'use strict';
  const D=root.DEDALO;
  function el(tag, text, props) { const n=document.createElement(tag); if(text !== undefined) n.textContent=text; Object.assign(n,props || {}); return n; }
  function button(text, fn) { const n=el('button',text,{type:'button'}); n.addEventListener('click',fn); return n; }
  const note=text=>el('p',text,{className:'muted'});
  function field(body,text,input) { const l=el('label',text); l.append(input); body.append(l); return input; }
  D.UI.prototype.panel_section=function(body,full) {
    const app=this.app, b=app.renderer.opts.sectionBox;
    const key=JSON.stringify(b);
    if(!full && body.dataset.sectionKey===key) return;
    body.dataset.sectionKey=key; body.replaceChildren();
    body.append(note('Recorte visual con seis planos. Coordenadas locales del contexto abierto, en metros. La geometría y la exportación completas se conservan.'));
    const row=el('div',undefined,{className:'btnrow'});
    row.append(button('Ajustar a todo',()=>app.exec('view.sectionBoxFit',{})), button('Ajustar a selección',()=>app.exec('view.sectionBoxFit',{selection:true})));
    body.append(row);
    if(!b) { body.append(note('Caja desactivada. Pulsa Ajustar a todo o Ajustar a selección para crearla.')); return; }
    const inputs={min:[],max:[]};
    const table=el('table'); table.className='section-limits';
    const head=el('tr'); for(const t of ['Eje','Mínimo · m','Máximo · m']) head.append(el('th',t)); table.append(head);
    ['X','Y','Z'].forEach((axis,i)=>{
      const row=el('tr'); row.append(el('td',axis));
      for(const k of ['min','max']) { const inp=el('input',undefined,{type:'number',step:'any',value:String(+b[k][i].toFixed(6))}); inp.setAttribute('aria-label',axis+' '+k); inp.style.width='100%'; inp.style.minWidth='0'; const td=el('td'); td.append(inp); row.append(td); inputs[k].push(inp); }
      table.append(row);
    });
    body.append(table);
    const show=el('input',undefined,{type:'checkbox',checked:b.showBox}); field(body,'Mostrar contorno naranja ',show);
    const actions=el('div',undefined,{className:'btnrow'});
    actions.append(button('Aplicar límites',()=>app.exec('view.sectionBox',{min:inputs.min.map(x=>Number(x.value)),max:inputs.max.map(x=>Number(x.value)),showBox:show.checked})),button('Desactivar caja',()=>app.exec('view.sectionBox',{enabled:false})));
    body.append(actions,note('Los cortes quedan abiertos, sin tapas. La caja del contexto raíz se guarda en .dedalo. Al entrar o salir de un grupo se desactiva; las cajas locales no se guardan al exportar el proyecto completo.'));
  };
  D.UI.prototype.panel_bim=function(body,full) {
    const app=this.app,doc=app.doc;
    const stateKey=doc.projectVersion+'|'+JSON.stringify(doc.selectionItems())+'|'+JSON.stringify(doc.editPath);
    if(!full && body.dataset.bimKey===stateKey) return;
    body.dataset.bimKey=stateKey; body.replaceChildren();
    body.append(note('Selecciona grupos o componentes y asigna su clase BIM. La IA utiliza los mismos comandos bim.*. La clasificación queda guardada en el proyecto.'));
    const schema=el('select'); for(const s of ['IFC4','IFC2X3']) schema.append(el('option',s,{value:s})); schema.value=this._ifcSchema || 'IFC4';
    field(body,'Formato de exportación ',schema);
    schema.addEventListener('change',()=>{ this._ifcSchema=schema.value; this.renderPanel(true); });
    const scope=el('select'); scope.append(el('option','Solo las instancias seleccionadas',{value:'instance'}),el('option','Definición del contexto abierto',{value:'definition'}));
    field(body,'Asignar categoría a ',scope);
    body.append(note('Definición aplica a sus ejemplares que no tengan una clasificación propia. Abre el componente para clasificar su definición.'));
    const filter=el('input',undefined,{type:'search',placeholder:'Buscar clase IFC…'}); field(body,'Buscar categoría ',filter);
    const category=el('select'); field(body,'Clase IFC ',category);
    const predefined=el('select'); field(body,'Tipo predefinido ',predefined);
    const attributeFields=el('div'); body.append(attributeFields); let attributeInputs=[];
    const catalog=D.IFCCategories.list(schema.value);
    const refreshTypes=()=>{
      const entry=catalog.find(x=>x.entity===category.value); predefined.replaceChildren();
      predefined.append(el('option','Sin especificar',{value:''}));
      for(const t of entry && entry.predefinedTypes || []) predefined.append(el('option',t,{value:t}));
      attributeFields.replaceChildren(); attributeInputs=[];
      const declaration=entry && D.IFCCategories.resolve({entity:entry.entity},schema.value);
      for(const attr of declaration ? declaration.attributes.slice(8).filter(a=>!a.optional && a.name !== 'PredefinedType') : []) {
        const numeric=/<real>|<integer>/.test(attr.type);
        const input=attr.enum ? el('select') : el('input',undefined,{type:numeric?'number':'text',step:'any',placeholder:attr.type});
        if(attr.enum) for(const value of attr.enum) input.append(el('option',value,{value}));
        field(attributeFields,attr.name+' (obligatorio) ',input); attributeInputs.push({attr,input,numeric});
      }
    };
    const refreshClasses=()=>{
      const old=category.value, q=filter.value.toLowerCase(); category.replaceChildren();
      for(const c of catalog.filter(x=>x.entity.toLowerCase().includes(q))) category.append(el('option',c.entity,{value:c.entity}));
      if([...category.options].some(x=>x.value===old)) category.value=old;
      refreshTypes();
    };
    filter.addEventListener('input',refreshClasses); category.addEventListener('change',refreshTypes); refreshClasses();
    const objectType=el('input',undefined,{type:'text',placeholder:'Necesario para USERDEFINED'}); field(body,'Descripción del tipo (opcional) ',objectType);
    const host=el('input',undefined,{type:'text',placeholder:'UUID del anfitrión para huecos o proyecciones'}); field(body,'Elemento anfitrión (si corresponde) ',host);
    const current=doc.execute('bim.get',{});
    const currentText=el('pre',undefined,{className:'out'}); currentText.style.maxHeight='180px';
    currentText.textContent=JSON.stringify(current,null,2); body.append(currentText);
    const storey=el('input',undefined,{type:'text',placeholder:'Ej. Planta baja'}); field(body,'Planta (opcional) ',storey);
    const elevation=el('input',undefined,{type:'number',step:'any',value:'0'}); field(body,'Cota de planta · m ',elevation);
    const classify=el('div',undefined,{className:'btnrow'});
    classify.append(button('Asignar clase',()=>{
      const data={entity:category.value}; if(predefined.value) data.predefinedType=predefined.value;
      if(objectType.value.trim()) data.objectType=objectType.value.trim();
      if(host.value.trim()) data.host=host.value.trim();
      if(attributeInputs.length) {
        data.attributes={};
        for(const {attr,input,numeric} of attributeInputs) {
          if(!input.value.trim()) { app.toast('Completa el atributo obligatorio '+attr.name,'error'); return; }
          data.attributes[attr.name]=numeric?Number(input.value):input.value;
        }
      }
      if(storey.value.trim()) data.storey={name:storey.value.trim(),elevation:Number(elevation.value)};
      app.exec('bim.assign',{scope:scope.value,ifc:data});
    }),button('Quitar clasificación',()=>app.exec('bim.clear',{scope:scope.value})));
    body.append(classify);
    const output=el('pre',undefined,{className:'out'}); output.style.maxHeight='240px';
    output.textContent=this._bimReport || '';
    const showReport=r=>{ this._bimReport=JSON.stringify(r,null,2); output.textContent=this._bimReport; };
    const named=el('div',undefined,{className:'btnrow'});
    const namedReport=apply=>{
      const r=app.exec('bim.classifyNamed',{schema:schema.value,apply});
      showReport(Object.assign({},r,{candidateCount:r.totalCandidates === undefined ? (r.candidates || []).length : r.totalCandidates,candidates:(r.candidates || []).slice(0,100)}));
    };
    named.append(button('Revisar clases escritas en nombres',()=>namedReport(false)),button('Aplicar clases escritas en nombres',()=>namedReport(true)));
    body.append(note('Para proyectos anteriores: reconocer únicamente clases IFC literales escritas en nombres (ej. IfcColumn). Revisa primero la propuesta; no se deducen clases de palabras como “pilar” o de la forma.'),named);
    const strict=el('input',undefined,{type:'checkbox',checked:true}); field(body,'Exigir clasificación de todos los elementos ',strict);
    body.append(note('Si desmarcas esta opción, los objetos sin clasificar se conservan como IfcBuildingElementProxy y se enumeran en el informe. Un grupo contenedor sin geometría se conserva como conjunto.'));
    const actions=el('div',undefined,{className:'btnrow'});
    actions.append(button('Comprobar BIM',()=>{ const r=doc.execute('bim.validate',{schema:schema.value,strictClassification:strict.checked}); showReport(r); }),button('Exportar '+schema.value,()=>{
      try { const r=app.files.exportIFC({schema:schema.value,strictClassification:strict.checked}); showReport(r.report); app.toast('Exportado '+schema.value,'ok'); }
      catch(e) { this._bimReport=e.message; output.textContent=e.message; app.toast(e.message,'error'); }
    }));
    body.append(actions,output,note('Se exporta el modelo completo, incluidos los elementos fuera de la caja de sección. Las cotas y textos de dibujo se indican en el informe si no son objetos BIM.'));
  };
})(typeof window !== 'undefined' ? window : globalThis);
