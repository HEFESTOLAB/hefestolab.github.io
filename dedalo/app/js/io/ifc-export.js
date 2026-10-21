/* Dédalo — native IFC4 / IFC2X3 STEP export, without network or runtime dependencies.
 * Classification is explicit. Mesh shape, metres and Z-up follow the authoritative scene.
 */
(function (root) {
  'use strict';
  const D = root.DEDALO, C = D.IFCCategories;
  const clone = x => JSON.parse(JSON.stringify(x));
  const ref = x => '#' + x;
  const list = values => '(' + values.join(',') + ')';
  const str = value => {
    if (value === undefined || value === null) return '$';
    return "'" + String(value).replace(/[\u0000-\u001f]/g, ' ').replace(/\\/g, '\\\\').replace(/'/g, "''").replace(/[^\x20-\x7e]+/g, s => '\\X2\\' + Array.from({ length: s.length }, (_, i) => s.charCodeAt(i).toString(16).padStart(4, '0').toUpperCase()).join('') + '\\X0\\') + "'";
  };
  const real = value => {
    if (!Number.isFinite(value)) throw new Error('La exportación IFC contiene una medida no finita.');
    const s = (Object.is(value, -0) ? 0 : value).toString().toUpperCase();
    return s.includes('E') ? s.replace(/^(\-?\d+)E/, '$1.E') : (s.includes('.') ? s : s + '.');
  };
  const coord = p => list(p.map(real));
  const keyOf = (a, b) => a < b ? a + ':' + b : b + ':' + a;
  function guid(value) {
    // Existing UUIDs are compressed exactly; composite occurrence paths use 128 deterministic bits.
    const raw = String(value), hex = raw.replace(/-/g, '');
    let n;
    if (/^[0-9a-f]{32}$/i.test(hex)) n = BigInt('0x' + hex);
    else {
      let h = 0n;
      for (let salt = 0; salt < 4; salt++) {
        let v = (2166136261 ^ Math.imul(salt + 1, 0x9e3779b9)) >>> 0;
        for (let i = 0; i < raw.length; i++) v = Math.imul(v ^ raw.charCodeAt(i), 16777619) >>> 0;
        v ^= v >>> 16; v = Math.imul(v, 0x85ebca6b) >>> 0; v ^= v >>> 13;
        h = (h << 32n) | BigInt(v >>> 0);
      }
      n = h;
    }
    const alphabet = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz_$';
    let out = ''; for (let i = 0; i < 22; i++) { out = alphabet[Number(n & 63n)] + out; n >>= 6n; }
    return out;
  }
  class Writer {
    constructor(schema, name, timestamp) { this.schema = schema; this.name = name; this.timestamp = timestamp; this.lines = []; this.count = 0; }
    add(entity, args) { const id = ++this.count; if(!this.reportOnly)this.lines.push('#' + id + '=' + entity.toUpperCase() + '(' + args.join(',') + ');'); return id; }
    root(entity, id, name, args) { return this.add(entity, [str(guid(id)), ref(this.owner), str(name), '$', ...(args || [])]); }
    finish() {
      return ['ISO-10303-21;', 'HEADER;', "FILE_DESCRIPTION(('Dédalo geometry and explicit BIM classification'),'2;1');", 'FILE_NAME(' + [str(this.name + '.ifc'), str(this.timestamp), "('Dédalo')", "('HEFESTOLAB')", "'Dedalo IFC exporter'", "'Dedalo'", "''"].join(',') + ');', "FILE_SCHEMA(('" + this.schema + "'));", 'ENDSEC;', 'DATA;', ...this.lines, 'ENDSEC;', 'END-ISO-10303-21;', ''].join('\n');
    }
  }
  function summarizeReport(report,limit) {
    limit=Number.isSafeInteger(limit)?Math.max(0,Math.min(500,limit)):50;
    const result=Object.assign({},report);
    for(const key of ['unclassified','fallbacks','warnings']){
      const rows=Array.isArray(report[key])?report[key]:[],name='total'+key[0].toUpperCase()+key.slice(1);
      result[name]=rows.length;result[key]=clone(rows.slice(0,limit));
    }
    result.sampleLimit=limit;result.truncated=['unclassified','fallbacks','warnings'].some(key=>report[key]&&report[key].length>limit);
    return result;
  }
  function mergedIFC(definition, node) {
    const a = definition.metadata && definition.metadata.ifc || {}, b = node && node.metadata && node.metadata.ifc || {};
    return Object.assign({}, clone(a), clone(b), { properties: Object.assign({}, a.properties || {}, b.properties || {}), attributes: Object.assign({}, a.attributes || {}, b.attributes || {}) });
  }
  // A classified object owns its unclassified descendants. An explicitly classified
  // child is a separate IFC element; no face is claimed by both.
  function ownedParts(scene, definition) {
    const parts=[], boundaries=[], M=D.SceneMath;
    function walk(def,matrix,path,storey) {
      parts.push({def,matrix,path});
      for(const node of def.nodes) {
        const child=scene.definitions.get(node.definitionId), meta=mergedIFC(child,node);
        const next=M.multiply(matrix,node.matrix), nextPath=path.concat(node.id);
        if(meta.entity) boundaries.push({def:child,node,matrix:next,path:nextPath,storey:meta.storey||storey});
        else walk(child,next,nextPath,meta.storey||storey);
      }
    }
    walk(definition,M.identity(),[],null);
    return {parts,boundaries};
  }
  function inventory(doc, options) {
    const p=options||{}, scene=doc.scene, rows=[], counts={};
    let faces=0, looseEdges=0;
    function visit(def,node,path) {
      const meta=mergedIFC(def,node), own=meta.entity ? ownedParts(scene,def) : null;
      const parts=own?own.parts:[{def}], faceCount=parts.reduce((n,x)=>n+x.def.model.faces.size,0);
      const edgeCount=parts.reduce((n,x)=>n+[...x.def.model.edges.values()].filter(e=>!x.def.model.eFaces.get(e.id)?.size).length,0);
      if(meta.entity || faceCount || edgeCount) {
        const entity=meta.entity||null; counts[entity||'UNCLASSIFIED']=(counts[entity||'UNCLASSIFIED']||0)+1;
        rows.push({id:node?node.id:def.id,definitionId:def.id,name:node?node.name:doc.name,path:path.slice(),context:path.slice(0,-1),entity,source:node?.metadata?.ifc?.entity?'instance':def.metadata?.ifc?.entity?'definition':'unclassified',faces:faceCount,looseEdges:edgeCount});
        faces+=faceCount;looseEdges+=edgeCount;
      }
      if(own)for(const b of own.boundaries)visit(b.def,b.node,path.concat(b.path));
      else for(const child of def.nodes)visit(scene.definitions.get(child.definitionId),child,path.concat(child.id));
    }
    visit(scene.current([]),null,[]);
    const offset=Number.isSafeInteger(p.offset)?Math.max(0,p.offset):0,limit=Number.isSafeInteger(p.limit)?Math.max(0,Math.min(200,p.limit)):50;
    const selected=p.unclassifiedOnly?rows.filter(r=>!r.entity):rows;
    return {ok:true,scope:'entire-model',projectId:doc.projectId,projectVersion:doc.projectVersion,total:rows.length,classified:rows.filter(r=>r.entity).length,unclassified:rows.filter(r=>!r.entity).length,faces,looseEdges,categories:counts,offset,limit,totalRows:selected.length,items:selected.slice(offset,offset+limit),nextOffset:limit>0&&offset+limit<selected.length?offset+limit:null};
  }
  function scalar(value, attribute) {
    if (value === null || value === undefined) { if(!attribute.optional)throw new Error('Falta el atributo IFC obligatorio ' + attribute.name + '.'); return '$'; }
    if (attribute.enum) {
      const v = String(value).toUpperCase(); if (!attribute.enum.includes(v)) throw new Error(attribute.name + ': valor IFC no admitido: ' + v);
      return '.' + v + '.';
    }
    if (/boolean/i.test(attribute.type)) { if (typeof value !== 'boolean') throw new Error(attribute.name + ': se requiere booleano.'); return value ? '.T.' : '.F.'; }
    if (/integer|real|number/i.test(attribute.type)) {
      if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error(attribute.name + ': se requiere número finito.');
      if (/Positive/.test(attribute.type) && value <= 0 || /NonNegative/.test(attribute.type) && value < 0) throw new Error(attribute.name + ': medida fuera del intervalo admitido.');
      if (/integer/i.test(attribute.type)) { if (!Number.isSafeInteger(value)) throw new Error(attribute.name + ': se requiere entero.'); return String(value); }
      return real(value);
    }
    if (/string/.test(attribute.type)) { if (typeof value !== 'string') throw new Error(attribute.name + ': se requiere texto.'); return str(value); }
    throw new Error(attribute.name + ': atributo IFC complejo no admitido por el exportador.');
  }
  function declarationArgs(declaration, predefined, attributes, common) {
    return declaration.attributes.map(a => {
      if (Object.prototype.hasOwnProperty.call(common, a.name)) return common[a.name];
      if (Object.prototype.hasOwnProperty.call(attributes || {}, a.name)) return scalar(attributes[a.name], a);
      if (a.name === 'PredefinedType' && predefined) return scalar(predefined, a);
      if (a.name === 'CompositionType') return '.ELEMENT.';
      if (!a.optional && a.enum && a.enum.includes('NOTDEFINED')) return '.NOTDEFINED.';
      if (!a.optional && /boolean/i.test(a.type)) return '.F.';
      if (!a.optional) throw new Error('Falta el atributo IFC obligatorio ' + a.name + '.');
      return '$';
    });
  }
  function checkMetadata(meta) {
    if (!meta || typeof meta !== 'object' || Array.isArray(meta)) throw new Error('La clasificación IFC debe ser un objeto.');
    const json = JSON.stringify(meta);
    if (json.length > 1000000 || /"(?:__proto__|constructor|prototype)"\s*:/.test(json)) throw new Error('Metadatos IFC no admitidos.');
    const walk = (v, depth) => { if (depth > 20) throw new Error('Metadatos IFC demasiado profundos.'); if (typeof v === 'number' && !Number.isFinite(v)) throw new Error('Metadatos IFC no finitos.'); if (v && typeof v === 'object') for (const x of Object.values(v)) walk(x, depth + 1); };
    walk(meta, 0);
    if (!meta.entity || !C.resolve(meta, 'IFC4') && !C.resolve(meta, 'IFC2X3')) throw new Error('Categoría IFC desconocida: ' + meta.entity);
    if (meta.predefinedType) {
      const choices = ['IFC4', 'IFC2X3'].map(s => C.resolve(meta, s)).filter(Boolean).flatMap(x => x.predefinedTypes);
      if (!choices.includes(meta.predefinedType)) throw new Error('PredefinedType no admitido: ' + meta.predefinedType);
      if (meta.predefinedType === 'USERDEFINED' && !meta.objectType) throw new Error('USERDEFINED requiere objectType.');
    }
    if (meta.storey !== undefined && (typeof meta.storey !== 'object' || !meta.storey || typeof meta.storey.name !== 'string' || (meta.storey.elevation !== undefined && !Number.isFinite(meta.storey.elevation)))) throw new Error('La planta IFC requiere name y elevation finita en metros.');
    if (meta.host !== undefined && (typeof meta.host !== 'string' || !meta.host)) throw new Error('host debe ser el UUID o la ruta de ocurrencia del elemento anfitrión.');
    for (const schema of ['IFC4', 'IFC2X3']) {
      const row = C.resolve(meta, schema); if (!row) continue;
      for (const [name, value] of Object.entries(meta.attributes || {})) {
        const a = row.attributes.find(x => x.name === name);
        if (!a) continue;
        if (row.attributes.indexOf(a) < 8) throw new Error('El atributo ' + name + ' se genera desde la escena.');
        scalar(value, a);
      }
    }
    return clone(meta);
  }
  function install(doc) {
    const targets = p => {
      if (p.scope === 'definition') {
        const definition = p.definitionId ? doc.scene.definitions.get(p.definitionId) : doc.currentDefinition();
        if (!definition) throw new Error('Definición inexistente.');
        return [definition];
      }
      if (p.scope && p.scope !== 'instance') throw new Error('scope debe ser instance o definition.');
      const ids = p.nodes || [...doc.sel.nodes];
      if (!Array.isArray(ids) || !ids.length) throw new Error('Selecciona grupos o componentes, o usa scope: definition para la geometría del contexto. Agrupa las caras para clasificar elementos separados.');
      return ids.map(id => { const node = doc.scene.node(p.path || doc.editPath, id); if (!node) throw new Error('Instancia fuera del contexto: ' + id); return node; });
    };
    const register = (name, title, run, params, undoable) => doc.register(name, { title, run, params, undoable });
    register('bim.inventory','Inventario IFC del modelo completo',p=>inventory(doc,p),{offset:'desde 0',limit:'0..200, por defecto 50',unclassifiedOnly:'bool; pendientes de categoría'},false);
    register('bim.categories', 'Consultar categorías IFC', p => ({ ok: true, schema: C.schema(p.schema), categories: C.list(p.schema) }), { schema: 'IFC4 | IFC2X3' }, false);
    register('bim.assign', 'Asignar categoría BIM', p => {
      const input = p.ifc || p.classification, objects = targets(p);
      if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('La clasificación IFC debe ser un objeto.');
      const values = objects.map(obj => {
        const previous = obj.metadata && obj.metadata.ifc || {}, base = p.replace === true ? {} : clone(previous);
        if (input.entity && previous.entity !== input.entity) for (const key of ['predefinedType','attributes','typeAttributes','host']) delete base[key];
        return checkMetadata(Object.assign(base, clone(input)));
      });
      objects.forEach((obj,i) => { obj.metadata = Object.assign({}, obj.metadata || {}, { ifc: values[i] }); });
      return { ok: true, count: objects.length, scope: p.scope || 'instance', ifc: values[0] };
    }, { path:'[uuid] ruta del contexto de los nodos; opcional', scope: 'instance | definition', nodes: '[uuid] (instancias del contexto)', definitionId: 'uuid (scope definition)', replace:'true: sustituir todos los metadatos IFC; por defecto conservar propiedades/material/planta', ifc: '{entity,predefinedType?,objectType?,storey?:{name,elevation},attributes?,properties?,material?,classification?}' }, true);
    register('bim.clear', 'Quitar clasificación BIM', p => {
      const objects = targets(p); for (const obj of objects) { if (obj.metadata) delete obj.metadata.ifc; }
      return { ok: true, count: objects.length };
    }, { scope: 'instance | definition', nodes: '[uuid]', definitionId: 'uuid' }, true);
    register('bim.get', 'Consultar clasificación BIM', p => ({ ok: true, items: targets(p).map(obj => ({ id: obj.id, name: obj.name, ifc: clone(obj.metadata && obj.metadata.ifc || null), effective: obj.definitionId ? mergedIFC(doc.scene.definitions.get(obj.definitionId), obj) : clone(obj.metadata && obj.metadata.ifc || {}) })) }), { scope: 'instance | definition', nodes: '[uuid]', definitionId: 'uuid' }, false);
    register('bim.validate', 'Revisar exportación BIM', p => { const r = exportIFC(doc, Object.assign({}, p, { reportOnly: true })); return { ok: true, report: summarizeReport(r.report,p.limit) }; }, { schema: 'IFC4 | IFC2X3', strictClassification: 'boolean',limit:'muestra acotada 0..500, por defecto 50' }, false);
    register('bim.classifyNamed', 'Revisar categorías IFC declaradas en nombres', p => {
      const schema=C.schema(p.schema), candidates=[], unmatched=[], conflicts=[], unchanged=[], pending=new Map();
      const inspect=(object,scope,definitionId,inherited)=>{
        const tokens=[...new Set(String(object.name||'').match(/\bIfc[A-Za-z0-9_]+\b/g)||[])], current=object.metadata&&object.metadata.ifc;
        const item={id:object.id,name:object.name,scope,definitionId:definitionId||object.id};
        if(!tokens.length){unmatched.push(item);return;}
        if(tokens.length!==1){conflicts.push({...item,reason:'El nombre declara varias categorías IFC.',tokens});return;}
        const entity=tokens[0], row=C.resolve(entity,schema);
        if(!row){conflicts.push({...item,reason:'La categoría declarada no existe en el esquema seleccionado.',entity});return;}
        if(current&&current.entity){if(current.entity===entity)unchanged.push({...item,entity});else conflicts.push({...item,entity,existing:current.entity,reason:'Ya existe una categoría IFC diferente.'});return;}
        if(inherited){if(inherited===entity)unchanged.push({...item,entity,reason:'Categoría de la definición.'});else conflicts.push({...item,entity,existing:inherited,reason:'La declaración de instancia difiere de su definición.'});return;}
        const value=Object.assign({},current||{},{entity});checkMetadata(value);candidates.push({...item,entity});pending.set(object,value);
      };
      for(const definition of doc.scene.definitions.values())if(definition.kind!=='root')inspect(definition,'definition');
      for(const definition of doc.scene.definitions.values())for(const node of definition.nodes){const target=doc.scene.definitions.get(node.definitionId), inherited=(pending.get(target)||target.metadata&&target.metadata.ifc||{}).entity;inspect(node,'instance',node.definitionId,inherited);}
      const limit=Number.isSafeInteger(p.limit)?Math.max(0,Math.min(500,p.limit)):50,offset=Number.isSafeInteger(p.offset)?Math.max(0,p.offset):0;
      const result={ok:true,schema,applied:false,totalCandidates:candidates.length,totalUnmatched:unmatched.length,totalConflicts:conflicts.length,totalUnchanged:unchanged.length,candidates:candidates.slice(offset,offset+limit),unmatched:unmatched.slice(offset,offset+limit),conflicts:conflicts.slice(offset,offset+limit),unchanged:unchanged.slice(offset,offset+limit),offset,limit};
      if(p.apply===true&&pending.size)return doc.transact('Asignar categorías IFC declaradas en nombres',()=>{for(const [object,value]of pending)object.metadata=Object.assign({},object.metadata||{},{ifc:clone(value)});return Object.assign(result,{applied:true,count:pending.size});});
      return result;
    }, { schema:'IFC4 | IFC2X3', apply:'false: vista previa; true: asignar únicamente tokens IFC literales válidos, sin sobrescribir clasificaciones existentes',offset:'desde 0; paginación de muestras',limit:'0..500, por defecto 50; apply siempre procesa todos los candidatos' }, false);
    return doc;
  }
  function exportIFC(doc, options) {
    options = options || {};
    const schema = C.schema(options.schema), scene = doc.scene;
    if (!scene) throw new Error('La exportación IFC necesita una escena de Dédalo.');
    const errors = scene.validate(); if (errors.length) throw new Error('Escena inválida: ' + errors.join('; '));
    const w = new Writer(schema, doc.name || 'Modelo', options.timestamp || new Date().toISOString());
    w.reportOnly=!!options.reportOnly;
    const report = { schema, projectId: doc.projectId, projectVersion: doc.projectVersion, elements: 0, groups: 0, types: 0, faces: 0, triangles: 0, looseEdges: 0, annotations: 0, unclassified: [], fallbacks: [], warnings: [], categories: {}, storeys: [], geometry: 'IFC4 tessellation / IFC2X3 faceted BRep or face based surface; metres; Z up', source: C.source, scope:'entire-model', classificationPolicy:'A classified group/component owns all unclassified descendants; explicit child categories remain separate; every geometric occurrence is exported once.' };
    const pid = doc.projectId || scene.rootId, M = D.SceneMath;
    const person = w.add('IfcPerson', ['$','$',str('Dédalo'),'$','$','$','$','$']);
    const org = w.add('IfcOrganization', ['$',str('HEFESTOLAB'),'$','$','$']);
    const user = w.add('IfcPersonAndOrganization', [ref(person), ref(org), '$']);
    const app = w.add('IfcApplication', [ref(org),str(D.VERSION||'0.6.1'),str('Dédalo'),'\'DEDALO\'']);
    const unix = Math.floor(Date.parse(w.timestamp)/1000);
    if (!Number.isFinite(unix)) throw new Error('La fecha de exportación IFC no es válida.');
    w.owner = w.add('IfcOwnerHistory', [ref(user),ref(app),'$','.ADDED.',String(unix),ref(user),ref(app),String(unix)]);
    const origin = w.add('IfcCartesianPoint', [coord([0,0,0])]), z = w.add('IfcDirection', [coord([0,0,1])]), x = w.add('IfcDirection', [coord([1,0,0])]);
    const axes = w.add('IfcAxis2Placement3D', [ref(origin),ref(z),ref(x)]);
    const context = w.add('IfcGeometricRepresentationContext', ['$',str('Model'),'3','1.E-7',ref(axes),'$']);
    const unitRefs = [['LENGTHUNIT','METRE'],['AREAUNIT','SQUARE_METRE'],['VOLUMEUNIT','CUBIC_METRE'],['PLANEANGLEUNIT','RADIAN']].map(([kind,name]) => ref(w.add('IfcSIUnit',['*','.'+kind+'.','$','.'+name+'.'])));
    const units = w.add('IfcUnitAssignment',[list(unitRefs)]);
    const project = w.root('IfcProject',pid,doc.name,['$','$','$',list([ref(context)]),ref(units)]);
    const placement = (p, parent) => { const point = p.every(v=>v===0) ? origin : w.add('IfcCartesianPoint',[coord(p)]); const axis = point === origin ? axes : w.add('IfcAxis2Placement3D',[ref(point),ref(z),ref(x)]); return w.add('IfcLocalPlacement',[parent?ref(parent):'$',ref(axis)]); };
    const sitePlacement=placement([0,0,0]), buildingPlacement=placement([0,0,0],sitePlacement);
    const site=w.root('IfcSite',pid+'/site','Solar',['$',ref(sitePlacement),'$','$','.ELEMENT.','$','$','$','$','$']);
    const building=w.root('IfcBuilding',pid+'/building',options.buildingName||'Edificio',['$',ref(buildingPlacement),'$','$','.ELEMENT.','$','$','$']);
    const aggregate=(id,name,parent,children)=>{ if(children.length)w.root('IfcRelAggregates',id,name,[ref(parent),list(children.map(ref))]); };
    aggregate(pid+'/project-site','Proyecto / solar',project,[site]); aggregate(pid+'/site-building','Solar / edificio',site,[building]);
    const storeys=new Map(), types=new Map(), materials=new Map(), styles=new Map(), occurrences=new Map(), features=[], geometryCache=new Map(), ownedCache=new Map(), physicalChildren=new Map(), physicalIds=new Map();
    function storeyFor(value) {
      const info=value||{name:'Planta 0',elevation:0}, elevation=info.elevation||0, k=info.name+'|'+elevation;
      if(!storeys.has(k)){const pl=placement([0,0,elevation],buildingPlacement), entity=w.root('IfcBuildingStorey',pid+'/storey/'+k,info.name,['$',ref(pl),'$','$','.ELEMENT.',real(elevation)]); storeys.set(k,{entity,placement:pl,elevation,products:[],spaces:[]}); report.storeys.push({name:info.name,elevation});}
      return storeys.get(k);
    }
    function pset(product,id,name,properties) {
      const values=[];
      for(const [key,value] of Object.entries(properties||{})){
        if(value===null||value===undefined)continue;
        let typed;
        if(typeof value==='boolean')typed='IFCBOOLEAN('+(value?'.T.':'.F.')+')';
        else if(typeof value==='number'){if(!Number.isFinite(value))throw new Error('Propiedad BIM no finita: '+key);typed=Number.isSafeInteger(value)?'IFCINTEGER('+value+')':'IFCREAL('+real(value)+')';}
        else typed='IFCTEXT('+str(typeof value==='string'?value:JSON.stringify(value))+')';
        values.push(w.add('IfcPropertySingleValue',[str(key),'$',typed,'$']));
      }
      if(!values.length)return;
      const set=w.root('IfcPropertySet',id+'/pset/'+name,name,[list(values.map(ref))]);
      w.root('IfcRelDefinesByProperties',id+'/psetrel/'+name,name,[list([ref(product)]),ref(set)]);
    }
    function material(mat) {
      const name=typeof mat==='string'?mat:(mat&&mat.name)||'Por defecto', k=JSON.stringify(mat);
      if(!materials.has(k))materials.set(k,w.add('IfcMaterial',schema==='IFC4'?[str(name),'$','$']:[str(name)]));
      return materials.get(k);
    }
    function style(mat) {
      mat=mat||{};const color=/^#[0-9a-f]{6}$/i.test(mat.color||'')?mat.color:'#d8d8d8',opacity=Number.isFinite(mat.opacity)?mat.opacity:1,k=color+'|'+opacity;
      if(!styles.has(k)){const rgb=w.add('IfcColourRgb',['$',...color.slice(1).match(/../g).map(v=>real(parseInt(v,16)/255))]);const render=w.add('IfcSurfaceStyleRendering',[ref(rgb),real(1-opacity),'$','$','$','$','$','$','.NOTDEFINED.']);const surface=w.add('IfcSurfaceStyle',[str(mat.name||'Dédalo'),'.BOTH.',list([ref(render)])]);styles.set(k,schema==='IFC2X3'?w.add('IfcPresentationStyleAssignment',[list([ref(surface)])]):surface);}
      return styles.get(k);
    }
    function applyStyle(item,mat){w.add('IfcStyledItem',[ref(item),list([ref(style(mat))]),'$']);}
    function orientedFaces(model, ids) {
      const edgeMap=new Map(), out=ids.map(id=>({source:model.faces.get(id),loops:model.faces.get(id).loops.map(l=>l.slice())}));
      out.forEach((f,i)=>f.loops.forEach(loop=>loop.forEach((a,j)=>{const b=loop[(j+1)%loop.length],k=keyOf(a,b);if(!edgeMap.has(k))edgeMap.set(k,[]);edgeMap.get(k).push({i,sign:a<b?1:-1});})));
      const closed=[...edgeMap.values()].every(a=>a.length===2), flips=new Map(), adjacency=new Map();
      for(const a of edgeMap.values())if(a.length===2){for(const [u,v] of [[a[0],a[1]],[a[1],a[0]]]){if(!adjacency.has(u.i))adjacency.set(u.i,[]);adjacency.get(u.i).push({i:v.i,different:u.sign===v.sign});}}
      const components=[];
      for(let i=0;i<out.length;i++){if(flips.has(i))continue;flips.set(i,false);const queue=[i],part=[];for(let q=0;q<queue.length;q++){const u=queue[q];part.push(u);for(const edge of adjacency.get(u)||[])if(!flips.has(edge.i)){flips.set(edge.i,flips.get(u)!==edge.different);queue.push(edge.i);}}components.push(part);}
      for(const [i,flip]of flips)if(flip)out[i].loops.forEach(l=>l.reverse());
      if(closed)for(const part of components){let volume=0;for(const i of part){const loop=out[i].loops[0],a=model.P(loop[0]);for(let j=1;j+1<loop.length;j++)volume+=D.V.dot(a,D.V.cross(model.P(loop[j]),model.P(loop[j+1])))/6;}if(volume<0)for(const i of part)out[i].loops.forEach(l=>l.reverse());}
      return {faces:out,closed,components};
    }
    function representation(model, matrix, id, definitionId) {
      const ids=[...model.faces.keys()];
      report.annotations+=model.annots.size;
      report.looseEdges += [...model.edges.values()].filter(e=>!(model.eFaces.get(e.id)||new Set()).size).length;
      const freeEdges=[...model.edges.values()].filter(e=>!model.eFaces.get(e.id)?.size);
      if(!ids.length&&!freeEdges.length)return {entity:null,materials:[]};
      const shapes=(items,type,curves)=>{
        const reps=[];
        if(items.length)reps.push(w.add('IfcShapeRepresentation',[ref(context),str('Body'),str(type),list(items.map(ref))]));
        if(curves.length){const set=w.add('IfcGeometricCurveSet',[list(curves.map(ref))]);reps.push(w.add('IfcShapeRepresentation',[ref(context),str('Axis'),str('GeometricCurveSet'),list([ref(set)])]));}
        return w.add('IfcProductDefinitionShape',['$','$',list(reps.map(ref))]);
      };
      report.faces+=ids.length;
      // Shape geometry is reusable. Each occurrence still owns its individual
      // IfcProductDefinitionShape (IFC2X3 ShapeOfProduct has cardinality [1:1]).
      const cacheKey=definitionId+'|'+[0,1,2,4,5,6,8,9,10].map(i=>matrix[i]).join(',');
      if(geometryCache.has(cacheKey)){const cached=geometryCache.get(cacheKey);report.triangles+=cached.triangles;if(!cached.closed&&ids.length)report.warnings.push({id,code:'OPEN_SURFACE',message:'El elemento contiene superficies abiertas.'});return {...cached,entity:shapes(cached.items,cached.shapeType,cached.curves)};}
      const curves=freeEdges.map(e=>{const points=[e.a,e.b].map(v=>w.add('IfcCartesianPoint',[coord(M.vector(matrix,model.P(v)))]));return w.add('IfcPolyline',[list(points.map(ref))]);});
      if(!ids.length){const result={items:[],shapeType:'GeometricCurveSet',curves,materials:[],triangles:0,closed:false};geometryCache.set(cacheKey,result);return {...result,entity:shapes([],result.shapeType,curves)};}
      let triangleCount=0;
      const oriented=orientedFaces(model,ids), points=new Map(), pointIds=new Map(), usedMaterials=new Map();
      const determinant=matrix[0]*(matrix[5]*matrix[10]-matrix[9]*matrix[6])-matrix[4]*(matrix[1]*matrix[10]-matrix[9]*matrix[2])+matrix[8]*(matrix[1]*matrix[6]-matrix[5]*matrix[2]);
      for(const f of oriented.faces)for(const loop of f.loops)for(const vid of loop)if(!points.has(vid))points.set(vid,M.vector(matrix,model.P(vid)));
      const items=[];
      if(schema==='IFC4'){
        let index=0;for(const vid of points.keys())pointIds.set(vid,++index);
        const pointList=w.add('IfcCartesianPointList3D',[list([...points.values()].map(coord))]),byMat=new Map();
        for(const f of oriented.faces){const mid=f.source.mat||0;if(!byMat.has(mid))byMat.set(mid,[]);const original=f.source.loops[0], current=f.loops[0], reverse=current.length>1&&original[0]===current[current.length-1];
          for(const triangle of model.faceTriangles(f.source.id)){const t=triangle.slice();if(reverse!==(determinant<0))t.reverse();byMat.get(mid).push(list(t.map(v=>String(pointIds.get(v)))));report.triangles++;triangleCount++;}}
        for(const [mid,triangles]of byMat){const item=w.add('IfcTriangulatedFaceSet',[ref(pointList),'$',oriented.closed&&byMat.size===1?'.T.':'.F.',list(triangles),'$']);items.push(item);const mat=model.materials.get(mid);usedMaterials.set(mid,mat||{name:'Por defecto'});applyStyle(item,mat);}
      }else{
        for(const [vid,p]of points)pointIds.set(vid,w.add('IfcCartesianPoint',[coord(p)]));
        const faceEntities=oriented.faces.map(f=>{const bounds=f.loops.map((loop,i)=>{const order=determinant<0?loop.slice().reverse():loop;const poly=w.add('IfcPolyLoop',[list(order.map(v=>ref(pointIds.get(v))))]);return w.add(i?'IfcFaceBound':'IfcFaceOuterBound',[ref(poly),'.T.']);});const face=w.add('IfcFace',[list(bounds.map(ref))]);const mat=model.materials.get(f.source.mat);usedMaterials.set(f.source.mat||0,mat||{name:'Por defecto'});applyStyle(face,mat);return face;});
        for(const component of oriented.components){const shell=w.add(oriented.closed?'IfcClosedShell':'IfcOpenShell',[list(component.map(i=>ref(faceEntities[i])))]);const item=w.add(oriented.closed?'IfcFacetedBrep':'IfcFaceBasedSurfaceModel',[oriented.closed?ref(shell):list([ref(shell)])]);items.push(item);applyStyle(item,model.materials.get(oriented.faces[component[0]].source.mat));}
      }
      if(!oriented.closed)report.warnings.push({id,code:'OPEN_SURFACE',message:'El elemento contiene superficies abiertas; se conserva su geometría y no se declara un sólido cerrado.'});
      const result={entity:shapes(items,schema==='IFC4'?'Tessellation':oriented.closed?'Brep':'SurfaceModel',curves),items,curves,shapeType:schema==='IFC4'?'Tessellation':oriented.closed?'Brep':'SurfaceModel',materials:[...usedMaterials.values()],triangles:triangleCount,closed:oriented.closed};geometryCache.set(cacheKey,result);return result;
    }
    function chosen(meta,id,name){
      let declaration=C.resolve(meta,schema),reason;
      if(!meta.entity){reason='Sin categoría IFC explícita';const token=(name.match(/\bIfc[A-Za-z0-9]+\b/)||[])[0];report.unclassified.push({id,name,reason,suggestedEntity:token&&C.resolve(token,schema)?token:null});}
      else if(!declaration)reason='La categoría '+meta.entity+' no existe en '+schema;
      if (declaration && /^Ifc(Opening|Voiding|ChamferEdge|RoundedEdge|Projection)/.test(declaration.entity) && !meta.host) reason='Esta categoría requiere host y una relación IFC de hueco o proyección; no puede ser un elemento independiente.';
      // StandardCase/ElementedCase prescribe specific parametric/decomposition constraints.
      if(declaration&&/(StandardCase|ElementedCase)$/.test(declaration.entity)){const base=declaration.entity==='IfcOpeningStandardCase'?'IfcOpeningElement':declaration.entity.replace(/(StandardCase|ElementedCase)$/,'');declaration=C.resolve({entity:base},schema);report.fallbacks.push({id,name,requested:meta.entity,exported:base,reason:'La representación libre no cumple las restricciones paramétricas del subtipo.'});}
      if(declaration){try{declarationArgs(declaration,meta.predefinedType,meta.attributes,{GlobalId:"''",OwnerHistory:'$',Name:'$',Description:'$',ObjectType:'$',ObjectPlacement:'$',Representation:'$',Tag:'$'});}catch(e){reason=e.message;}}
      if(reason){if(options.strictClassification)throw new Error(name+': '+reason);report.fallbacks.push({id,name,requested:meta.entity||null,exported:'IfcBuildingElementProxy',reason});declaration=C.resolve({entity:'IfcBuildingElementProxy'},schema);}
      return declaration;
    }
    const getType=(declaration,meta,def,id)=>{
      if(!declaration.type)return null;
      // IFC4 ADD2 contains a misspelled CorrectTypeAssigned rule for IfcTransformer.
      // Omitting its optional type relationship preserves a valid occurrence and category.
      if(schema==='IFC4'&&declaration.entity==='IfcTransformer'){report.warnings.push({id,code:'OPTIONAL_TYPE_OMITTED',message:'IfcTransformer conserva su categoría; se omite el tipo opcional por la restricción CorrectTypeAssigned del esquema IFC4 ADD2.'});return null;}
      const predefined=meta.predefinedType&&declaration.type.attributes.some(a=>a.name==='PredefinedType'&&a.enum.includes(meta.predefinedType))?meta.predefinedType:null;
      const k=def.id+'|'+declaration.type.entity+'|'+(predefined||'')+'|'+(meta.objectType||'')+'|'+(meta.typeName||'')+'|'+JSON.stringify(meta.typeAttributes||{});
      if(!types.has(k)){
        const common={GlobalId:str(guid(pid+'/type/'+k)),OwnerHistory:ref(w.owner),Name:str(meta.typeName||def.name),Description:str(meta.description),ElementType:str(meta.objectType||def.name),ApplicableOccurrence:'$',HasPropertySets:'$',RepresentationMaps:'$',Tag:str(def.id)};
        let args;try{args=declarationArgs(declaration.type,predefined,meta.typeAttributes||{},common);}catch(e){report.warnings.push({id,code:'TYPE_OMITTED',message:e.message});return null;}
        types.set(k,{entity:w.add(declaration.type.entity,args),products:[],id:pid+'/type/'+k});report.types++;
      }
      return types.get(k);
    };
    function product(def,node,matrix,path,inheritedStorey,parentPhysical){
      const meta=mergedIFC(def,node),id=pid+'/'+(path.join('/')||'root'),name=meta.name||(node?node.name:doc.name)||def.name;
      let model=def.model,boundaries=null,geometryKey=def.id;
      if(meta.entity && def.nodes.length) {
        if(!ownedCache.has(def.id)) {
          const ownership=ownedParts(scene,def), temporary=new D.Scene();
          temporary.rootId=def.id;
          temporary.definitions=new Map([...scene.definitions].map(([key,d])=>[key,{...d,nodes:d.nodes.filter(n=>!mergedIFC(scene.definitions.get(n.definitionId),n).entity)}]));
          ownedCache.set(def.id,{model:temporary.project([]).model,boundaries:ownership.boundaries});
        }
        const owned=ownedCache.get(def.id); model=owned.model;boundaries=owned.boundaries;geometryKey='owned:'+def.id;
      }
      const hasGeometry=model.faces.size>0||[...model.edges.values()].some(e=>!model.eFaces.get(e.id)?.size);
      const nextStorey=meta.storey||inheritedStorey;
      let entity=null,physical=parentPhysical,group=null, own=[];
      if(hasGeometry||meta.entity){
        const declaration=chosen(meta,id,name),st=storeyFor(nextStorey),offset=[matrix[12],matrix[13],matrix[14]-st.elevation],pl=placement(offset,st.placement);
        const geom=representation(model,matrix,id,geometryKey),common={GlobalId:str(guid(id)),OwnerHistory:ref(w.owner),Name:str(name),Description:str(meta.description),ObjectType:str(meta.objectType||meta.entity||'Sin clasificar'),ObjectPlacement:ref(pl),Representation:geom.entity?ref(geom.entity):'$',Tag:str(node?node.id:def.id)};
        const actualMeta=declaration.entity==='IfcBuildingElementProxy'&&meta.entity!=='IfcBuildingElementProxy'?{}:meta;
        entity=w.add(declaration.exportEntity||declaration.entity,declarationArgs(declaration,actualMeta.predefinedType,actualMeta.attributes||{},common));
        occurrences.set(path.join('/'),entity);
        physicalIds.set(entity,id);
        report.elements++;report.categories[declaration.exportEntity||declaration.entity]=(report.categories[declaration.exportEntity||declaration.entity]||0)+1;
        if(declaration.exportEntity)report.fallbacks.push({id,name,requested:declaration.entity,exported:declaration.exportEntity,type:declaration.type&&declaration.type.entity,reason:'En IFC2X3 la categoría específica se conserva mediante IfcRelDefinesByType.'});
        const isFeature=/^Ifc(Opening|Voiding|ChamferEdge|RoundedEdge|Projection)/.test(declaration.entity);
        if(isFeature)features.push({entity,host:meta.host,path:path.slice(),id,projection:declaration.entity==='IfcProjectionElement'});
        else if(parentPhysical){if(!physicalChildren.has(parentPhysical))physicalChildren.set(parentPhysical,[]);physicalChildren.get(parentPhysical).push(entity);}else (declaration.entity==='IfcSpace'?st.spaces:st.products).push(entity);
        physical=entity;
        if(schema==='IFC2X3'&&declaration.entity==='IfcRoof'&&hasGeometry&&(boundaries?boundaries.length:def.nodes.length)){physical=parentPhysical;report.warnings.push({id,code:'ROOF_PARTS_WITH_BODY',message:'IFC2X3 no permite simultáneamente Body y descomposición de cubierta; se conservan sus elementos como productos de planta y la jerarquía queda en OccurrencePath.'});}
        const type=getType(declaration,actualMeta,def,id);if(type)type.products.push(entity);
        const mats=meta.material?[material(meta.material)]:geom.materials.map(material);
        if(mats.length&&!isFeature&&declaration.entity!=='IfcVirtualElement'&&declaration.entity!=='IfcSpace'){const unique=[...new Set(mats)],selection=unique.length===1?unique[0]:w.add('IfcMaterialList',[list(unique.map(ref))]);w.root('IfcRelAssociatesMaterial',id+'/materials','Materiales',[list([ref(entity)]),ref(selection)]);}
        pset(entity,id,'Pset_Dedalo',{ProjectId:pid,ProjectVersion:doc.projectVersion||0,DefinitionId:def.id,InstanceId:node?node.id:'root',OccurrencePath:path.join('/'),RequestedIFCEntity:meta.entity||'UNCLASSIFIED',ClassificationStatus:meta.entity?'EXPLICIT':'UNCLASSIFIED',SourceTransform:matrix,Units:'METRE',Geometry:'TESSELLATED_SOURCE',Georeference:scene.georeference||null});
        for(const [setName,props]of Object.entries(meta.properties||{})){if(setName==='Pset_Dedalo')throw new Error('Pset_Dedalo está reservado para la trazabilidad de la exportación.');if(!props||typeof props!=='object'||Array.isArray(props))throw new Error('El juego de propiedades '+setName+' debe ser un objeto.');pset(entity,id,setName,props);}
        if(meta.classification)pset(entity,id,'Pset_DedaloClassification',meta.classification);
        own.push(entity);
      }else if(node&&def.nodes.length){group=w.root('IfcGroup',id+'/group',name,['$']);report.groups++;}
      else if(def.model.edges.size||def.model.annots.size){report.looseEdges+=def.model.edges.size;report.annotations+=def.model.annots.size;}
      const children=[];
      if(boundaries)for(const b of boundaries)children.push(...product(b.def,b.node,M.multiply(matrix,b.matrix),path.concat(b.path),b.storey||nextStorey,physical));
      else for(const child of def.nodes){const childDef=scene.definitions.get(child.definitionId);children.push(...product(childDef,child,M.multiply(matrix,child.matrix),[...path,child.id],nextStorey,physical));}
      if(group&&children.length)w.root('IfcRelAssignsToGroup',id+'/assign-group',name,[list([...new Set(children)].map(ref)),'$',ref(group)]);
      return [...own,...children];
    }
    product(scene.current([]),null,M.identity(),[],null,null);
    for(const [parent,children]of physicalChildren)aggregate(physicalIds.get(parent)+'/decomposition','Descomposición',parent,[...new Set(children)]);
    for(const feature of features){
      const sibling=[...feature.path.slice(0,-1),feature.host].join('/'),host=occurrences.get(feature.host)||occurrences.get(sibling);
      if(!host||host===feature.entity)throw new Error('No se encuentra el elemento anfitrión IFC: '+feature.host);
      w.root(feature.projection?'IfcRelProjectsElement':'IfcRelVoidsElement',feature.id+'/host','Elemento anfitrión',[ref(host),ref(feature.entity)]);
    }
    const allStoreys=[...storeys.values()];aggregate(pid+'/building-storeys','Edificio / plantas',building,allStoreys.map(s=>s.entity));
    for(const [k,st]of storeys){if(st.products.length)w.root('IfcRelContainedInSpatialStructure',pid+'/containment/'+k,'Elementos de planta',[list(st.products.map(ref)),ref(st.entity)]);aggregate(pid+'/spaces/'+k,'Espacios de planta',st.entity,st.spaces);}
    for(const t of types.values())if(t.products.length)w.root('IfcRelDefinesByType',t.id+'/instances','Tipo de componente',[list(t.products.map(ref)),ref(t.entity)]);
    if(report.looseEdges)report.warnings.push({code:'LOOSE_EDGES',count:report.looseEdges,message:'Las aristas sin caras se conservan como curvas IFC dentro del mismo archivo.'});
    if(report.annotations)report.warnings.push({code:'ANNOTATIONS',count:report.annotations,message:'Las guías, textos y cotas de edición no se exportan como elementos constructivos.'});
    if(!report.elements)throw new Error('El modelo no contiene caras ni elementos BIM clasificados para exportar.');
    return {text:options.reportOnly?null:w.finish(),report};
  }
  D.IFC={export:exportIFC,install,guid,checkMetadata,summarizeReport,inventory};
})(typeof window !== 'undefined' ? window : globalThis);

