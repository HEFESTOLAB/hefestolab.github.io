/*
 * HEFESTOLAB IFC Drawing · Revisión v0.8
 * ------------------------------------------------------------
 * Cliente puro: el IFC se lee con File API y se procesa en el navegador.
 * El motor IFC se carga bajo demanda desde versiones fijadas de That Open
 * Components / web-ifc. La demo, el compositor, cotas, SVG, DXF y PDF
 * funcionan sin necesidad de cargar un IFC.
 */
(() => {
  'use strict';

  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const uid = (p = 'id') => `${p}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const esc = (v) => String(v ?? '').replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
  const fmt = (v, n = 2) => Number.isFinite(+v) ? (+v).toFixed(n) : '—';
  const mmFormats = { A4:[210,297], A3:[297,420], A2:[420,594], A1:[594,841], A0:[841,1189] };
  const standardScales = [10,20,25,50,75,100,125,150,200,250,500,1000];
  const DIMENSION_TEXT_MM = 2.1;
  const DIMENSION_TEXT_POINTS = DIMENSION_TEXT_MM * 72 / 25.4;
  const PROJECT_SCHEMA = 'hefestolab-ifc-drawing-project';
  const PROJECT_VERSION = 1;

  const state = {
    mode: 'model',
    drawTool: 'select',
    projectName: 'Proyecto sin guardar',
    source: null,
    sourceMeta: { schema:'—', size:0, storeys:[] },
    drawings: [],
    activeDrawingId: null,
    viewBoxes: new Map(),
    sheets: [],
    activeSheetId: null,
    selectedViewportId: null,
    selectedAnnotationId: null,
    selectedIfc: null,
    pendingDimension: null,
    pendingDimensionChain: null,
    pendingArea: null,
    projectDetached: false,
    engine: null,
    enginePromise: null,
    modelBox: null,
    modelBoxSource: null,
    activeModelId: null,
    modelLoaded: false,
    ifcModels: 0,
    geometryMap: {},
    ifcCategories: [],
    categoryItems: new Map(),
    itemCategories: new Map(),
    busy: false,
    paperPPM: 1.7,
    sheetZoom: 1,
    demo: false,
    levels: [],
    selectedLevelId: null,
    snapEnabled: true,
    orthoEnabled: true,
    snapHover: null,
    dragAnnotation: null,
    progressState: { started:0, lastUpdate:0, phase:'', phaseProgress:0, history:[], timer:null },
    loadStats: { conversionSeconds:0, totalSeconds:0, modelBoxSource:null, modelId:null },
    ui: { pan:null, sheetPan:null, spaceDown:false, suppressClickUntil:0 }
  };

  const el = {
    app: $('#app'), ifcInput: $('#ifcInput'), reconnectIfcInput: $('#reconnectIfcInput'), projectInput: $('#projectInput'), projectName: $('#projectName'), fileMeta: $('#fileMeta'),
    start: $('#startScreen'), modelStage: $('#modelStage'), drawingStage: $('#drawingStage'), sheetStage: $('#sheetStage'),
    viewer: $('#viewer3d'), drawingSvg: $('#drawingSvg'), drawingEmpty: $('#drawingEmpty'), drawingTitle: $('#drawingTitle'), drawingInfo: $('#drawingInfo'),
    modelTree: $('#modelTree'), levelsTree: $('#levelsTree'), plansTree: $('#plansTree'), elevationsTree: $('#elevationsTree'), views3dTree: $('#views3dTree'), schedulesTree: $('#schedulesTree'), sheetsTree: $('#sheetsTree'),
    inspector: $('#inspector'), inspectorTitle: $('#inspectorTitle'), sheetCanvas: $('#sheetCanvas'), paperHost: $('#paperHost'), sheetEmpty: $('#sheetEmpty'),
    progress: $('#progressPanel'), progressTitle: $('#progressTitle'), progressText: $('#progressText'), progressBar: $('#progressBar'), progressMeta: $('#progressMeta'),
    statusDot: $('#statusDot'), statusText: $('#statusText'), statusSelection: $('#statusSelection'), statusCoords: $('#statusCoords'), statusSnap: $('#statusSnap'), statusOrtho: $('#statusOrtho'),
    modelBadge: $('#modelBadge'), engineHint: $('#engineHint'), toggleHidden: $('#toggleHidden'),
    modalBackdrop: $('#modalBackdrop'), modalTitle: $('#modalTitle'), modalBody: $('#modalBody'), modalActions: $('#modalActions'),
    toastHost: $('#toastHost')
  };

  function syncAgentState(){
    if(!el.app)return;
    const values={
      'data-hefesto-agent-ready':'true',
      'data-hefesto-mode':state.mode,
      'data-hefesto-draw-tool':state.drawTool,
      'data-hefesto-model-loaded':String(state.modelLoaded),
      'data-hefesto-busy':String(state.busy),
      'data-hefesto-snap':String(state.snapEnabled),
      'data-hefesto-ortho':String(state.orthoEnabled),
      'data-hefesto-active-drawing-id':state.activeDrawingId,
      'data-hefesto-active-sheet-id':state.activeSheetId,
      'data-hefesto-selected-ifc-key':state.selectedIfc?.key||'',
      'data-hefesto-project-detached':String(state.projectDetached),
      'data-hefesto-sheet-zoom':String(state.sheetZoom),
      'data-hefesto-project-format':PROJECT_SCHEMA
    };
    for(const [name,value] of Object.entries(values)){
      if(value===null||value===undefined||value==='')el.app.removeAttribute(name);
      else el.app.setAttribute(name,String(value));
    }
  }
  function setProjectDetached(value){state.projectDetached=!!value;$('#btnReconnectIfc')?.classList.toggle('hidden',!state.projectDetached);syncAgentState();}

  function setStatus(text, kind = 'ok') {
    el.statusText.textContent = text;
    el.statusDot.className = `status-dot ${kind}`;
    syncAgentState();
  }
  function toast(title, text = '', kind = '') {
    const t = document.createElement('div');
    t.className = `toast ${kind}`;
    t.innerHTML = `<b>${esc(title)}</b>${text ? `<span>${esc(text)}</span>` : ''}`;
    el.toastHost.appendChild(t);
    setTimeout(() => t.remove(), 4200);
  }
  function progressElapsed(){ return state.progressState.started ? (performance.now()-state.progressState.started)/1000 : 0; }
  function refreshProgressMeta(){
    if(!el.progressMeta)return;
    const sec=progressElapsed(), ps=state.progressState;
    const stale=ps.lastUpdate && performance.now()-ps.lastUpdate>15000;
    el.progress.classList.toggle('stalled',!!stale);
    el.progressMeta.textContent=`${ps.phase||'inicializando'} · ${sec.toFixed(1)} s${stale?' · sin cambio de etapa >15 s':''}`;
  }
  function startProgressClock(){
    clearInterval(state.progressState.timer);
    state.progressState.timer=setInterval(refreshProgressMeta,1000);
  }
  function showProgress(title, text = '', p = 0, phase='preparación') {
    state.busy = true; el.progress.classList.remove('hidden'); el.progress.classList.remove('stalled');
    state.progressState.started=performance.now();state.progressState.lastUpdate=performance.now();state.progressState.phase=phase;state.progressState.phaseProgress=0;state.progressState.history=[];
    el.progressTitle.textContent = title; el.progressText.textContent = text; el.progressBar.style.width = `${clamp(p,0,1)*100}%`;
    startProgressClock();refreshProgressMeta();setStatus(title, 'busy');
  }
  function updateProgress(text, p, phase) {
    if (text) el.progressText.textContent = text;
    if (Number.isFinite(p)) el.progressBar.style.width = `${clamp(p,0,1)*100}%`;
    if(phase){
      state.progressState.phase=phase;state.progressState.history.push({t:progressElapsed(),phase,text,p});
      const titles={motor:'Preparando motor IFC',escena:'Preparando visor 3D',worker:'Preparando Fragments', 'web-ifc':'Preparando web-ifc',lectura:'Leyendo archivo IFC',geometría:'Procesando geometría',propiedades:'Leyendo propiedades',conversión:'Convirtiendo a Fragments',encuadre:'Finalizando modelo',finalizado:'Modelo listo'};
      if(titles[phase])el.progressTitle.textContent=titles[phase];
    }
    state.progressState.lastUpdate=performance.now();refreshProgressMeta();
  }
  function hideProgress(okText = 'Preparado') {
    state.busy = false; clearInterval(state.progressState.timer); state.progressState.timer=null; el.progress.classList.add('hidden');el.progress.classList.remove('stalled'); setStatus(okText, 'ok');
  }

  function showModal({ title, html, actions = [] }) {
    el.modalTitle.textContent = title;
    el.modalBody.innerHTML = html;
    el.modalActions.innerHTML = '';
    actions.forEach(a => {
      const b = document.createElement('button');
      b.className = `prop-btn ${a.primary ? 'primary' : ''} ${a.danger ? 'danger' : ''}`;
      b.textContent = a.label;
      b.addEventListener('click', () => a.onClick?.());
      el.modalActions.appendChild(b);
    });
    el.modalBackdrop.classList.remove('hidden');
  }
  function closeModal(){ el.modalBackdrop.classList.add('hidden'); el.modalBody.innerHTML = ''; el.modalActions.innerHTML = ''; }

  function setMode(mode) {
    state.mode = mode;
    $$('.mode-tab').forEach(b => b.classList.toggle('active', b.dataset.mode === mode));
    $('#modelTools').classList.toggle('hidden', mode !== 'model');
    $('#drawingTools').classList.toggle('hidden', mode !== 'drawing');
    $('#sheetTools').classList.toggle('hidden', mode !== 'sheet');
    el.start.classList.add('hidden');
    el.modelStage.classList.toggle('hidden', mode !== 'model');
    el.drawingStage.classList.toggle('hidden', mode !== 'drawing');
    el.sheetStage.classList.toggle('hidden', mode !== 'sheet');
    if (mode === 'model') {
      // El renderer puede haberse creado mientras el contenedor estaba oculto.
      // Forzamos resize al hacerlo visible para evitar un canvas 0×0 / viewport en blanco.
      requestAnimationFrame(() => {
        try { state.engine?.world?.renderer?.resize?.(); } catch (_) {}
        requestAnimationFrame(() => refreshFragmentsAfterCamera());
      });
    }
    if (mode === 'drawing') renderDrawing();
    if (mode === 'sheet') renderSheet();
    renderInspector();
    syncAgentState();
  }

  function setDrawTool(tool) {
    state.drawTool = tool;
    state.pendingDimension = null;
    state.pendingDimensionChain = null;
    state.pendingArea = null;
    $$('[data-draw-tool]').forEach(b => b.classList.toggle('active', b.dataset.drawTool === tool));
    el.drawingSvg.classList.toggle('crosshair', tool !== 'select');
    if (tool === 'dimension') toast('Cota activa', 'Haz clic en dos puntos y un tercer clic para fijar el desplazamiento.');
    if (tool === 'dimension-chain') toast('Cota en cadena activa', 'Marca referencias consecutivas y haz clic en un espacio en blanco para colocar y terminar la cadena.');
    if (tool === 'area') toast('Área activa', 'Marca el perímetro y haz clic otra vez en el primer punto, pulsa Intro o haz doble clic para cerrarlo.');
    syncAgentState();
  }

  function updateModeIndicators(){
    const sb=$('#toggleSnapBtn'),ob=$('#toggleOrthoBtn');
    sb?.classList.toggle('active',state.snapEnabled);sb?.setAttribute('aria-pressed',String(state.snapEnabled));
    ob?.classList.toggle('active',state.orthoEnabled);ob?.setAttribute('aria-pressed',String(state.orthoEnabled));
    if(el.statusSnap){el.statusSnap.textContent=`SNAP ${state.snapEnabled?'ON':'OFF'}`;el.statusSnap.className=`status-mode ${state.snapEnabled?'on':'off'}`;}
    if(el.statusOrtho){el.statusOrtho.textContent=`ORTO ${state.orthoEnabled?'ON':'OFF'}`;el.statusOrtho.className=`status-mode ${state.orthoEnabled?'on':'off'}`;}
    syncAgentState();
  }
  function setSnapEnabled(value){state.snapEnabled=!!value;state.snapHover=null;updateModeIndicators();renderDrawing();toast('SNAP',state.snapEnabled?'Extremo, punto medio y arista activos.':'Referencias desactivadas.');}
  function setOrthoEnabled(value){state.orthoEnabled=!!value;updateModeIndicators();renderDrawing();toast('ORTO',state.orthoEnabled?'Cotas restringidas a horizontal/vertical.':'Restricción permanente desactivada. Mantén Shift para ORTO temporal.');}
  function inputFocused(){return ['INPUT','TEXTAREA','SELECT'].includes(document.activeElement?.tagName)||document.activeElement?.isContentEditable;}

  function safeName(name){ return String(name || 'modelo').replace(/\.[^.]+$/, '').replace(/[^\w\- áéíóúüñÁÉÍÓÚÜÑ]/g,'_').slice(0,80); }
  function bytesText(n){ if(!n)return '0 B'; const u=['B','KB','MB','GB']; let i=0,v=n; while(v>=1024&&i<u.length-1){v/=1024;i++} return `${v.toFixed(i?1:0)} ${u[i]}`; }

  // ---------- IFC metadata (lightweight, only a head slice) ----------
  function splitIfcArgs(s){
    const out=[]; let cur='', quote=false, depth=0;
    for(let i=0;i<s.length;i++){
      const c=s[i];
      if(c==="'"){
        cur+=c;
        if(quote && s[i+1]==="'"){ cur+=s[++i]; continue; }
        quote=!quote; continue;
      }
      if(!quote){ if(c==='(')depth++; if(c===')')depth--; if(c===','&&depth===0){out.push(cur.trim());cur='';continue;} }
      cur+=c;
    }
    if(cur.trim()) out.push(cur.trim()); return out;
  }
  function decodeIfcStringEscapes(value){
    const source=String(value??'');
    const decodeBlock=(hex,width,useCodePoints)=>{
      if(!hex||hex.length%width!==0||!/^[0-9A-F]+$/i.test(hex))return null;
      const values=[];
      for(let i=0;i<hex.length;i+=width){
        const n=Number.parseInt(hex.slice(i,i+width),16);
        if(!Number.isFinite(n))return null;
        values.push(n);
      }
      if(useCodePoints){
        if(values.some(n=>n>0x10FFFF||(n>=0xD800&&n<=0xDFFF)))return null;
        try{return values.map(n=>String.fromCodePoint(n)).join('');}catch(_){return null;}
      }
      for(let i=0;i<values.length;i++){
        const n=values[i];
        if(n>=0xD800&&n<=0xDBFF){if(i+1>=values.length||values[i+1]<0xDC00||values[i+1]>0xDFFF)return null;i++;}
        else if(n>=0xDC00&&n<=0xDFFF)return null;
      }
      return values.map(n=>String.fromCharCode(n)).join('');
    };
    const replace=(input,kind,width,useCodePoints)=>input.replace(new RegExp(`\\\\${kind}\\\\([0-9A-F]*?)\\\\X0\\\\`,'gi'),(match,hex)=>decodeBlock(hex,width,useCodePoints)??match);
    return replace(replace(source,'X2',4,false),'X4',8,true);
  }
  function ifcString(token){
    if(!token || token === '$' || token === '*') return '';
    const m = token.match(/^'(.*)'$/s); const value=m ? m[1].replace(/''/g,"'") : token;
    return decodeIfcStringEscapes(value);
  }
  function parseIfcMeta(text){
    const schema = text.match(/FILE_SCHEMA\s*\(\s*\(\s*'([^']+)'/i)?.[1] || 'IFC';
    const storeys=[]; const re=/#(\d+)\s*=\s*IFCBUILDINGSTOREY\s*\(([\s\S]*?)\)\s*;/gi; let m;
    while((m=re.exec(text)) && storeys.length<200){
      const a=splitIfcArgs(m[2]); const name=ifcString(a[2]) || ifcString(a[7]) || `Nivel ${storeys.length+1}`;
      let elevation = null;
      for(let i=a.length-1;i>=0;i--){ const v=parseFloat(a[i]); if(Number.isFinite(v)){ elevation=v; break; } }
      if(!storeys.some(s=>s.name===name && s.elevation===elevation)) storeys.push({id:m[1],name,elevation});
    }
    const unitIsMilli = /IFCSIUNIT\s*\([^;]*\.LENGTHUNIT\.[^;]*\.MILLI\./i.test(text);
    if(unitIsMilli) storeys.forEach(s=>{ if(Number.isFinite(s.elevation)) s.elevation/=1000; });
    storeys.sort((a,b)=>(a.elevation??0)-(b.elevation??0));
    return {schema,storeys};
  }

  function syncLevelsFromMeta(storeys=[]){
    state.levels=(storeys||[]).map((s,i)=>({id:`level_ifc_${s.id||i}`,ifcId:s.id||null,name:s.name||`Nivel ${i+1}`,elevation:Number.isFinite(s.elevation)?s.elevation:0,source:'IFC'}));
    state.selectedLevelId=null;
  }
  function selectedLevel(){return state.levels.find(l=>l.id===state.selectedLevelId)||null;}
  function levelModelY(level){
    const box=state.modelBox;if(!box||!level)return 0;const y=+level.elevation;const tol=Math.max(.5,(box.max.y-box.min.y)*.05);
    if(Number.isFinite(y)&&y>=box.min.y-tol&&y<=box.max.y+tol)return clamp(y,box.min.y,box.max.y);
    const vals=state.levels.map(l=>+l.elevation).filter(Number.isFinite);if(vals.length<2)return (box.min.y+box.max.y)/2;
    const mn=Math.min(...vals),mx=Math.max(...vals),t=(+level.elevation-mn)/Math.max(.001,mx-mn);return box.min.y+clamp(t,0,1)*(box.max.y-box.min.y);
  }
  function addLevelDialog(){
    const ref=state.levels.at(-1)?.elevation??0;
    showModal({title:'Crear nivel',html:`<div class="modal-note">Este nivel se guarda solo en la sesión de HEFESTOLAB IFC Drawing. No modifica el IFC original.</div><div class="form-grid"><div class="form-group full"><label>Nombre</label><input id="levelName" value="Nuevo nivel"></div><div class="form-group"><label>Cota (m)</label><input id="levelElev" type="number" step="0.01" value="${fmt(ref,2)}"></div><div class="form-group"><label>Crear planta</label><select id="levelPlan"><option value="yes">Sí</option><option value="no">No</option></select></div></div>`,actions:[{label:'Cancelar',onClick:closeModal},{label:'Crear',primary:true,onClick:()=>{
      const name=$('#levelName').value.trim()||'Nuevo nivel',elevation=parseFloat($('#levelElev').value);if(!Number.isFinite(elevation)){toast('Cota no válida','Introduce una cota numérica en metros.','warn');return;}
      const l={id:uid('level'),name,elevation,source:'LOCAL'};state.levels.push(l);state.levels.sort((a,b)=>a.elevation-b.elevation);state.selectedLevelId=l.id;
      if($('#levelPlan').value==='yes'&&state.modelLoaded)createPlanForLevel(l,false);closeModal();renderTrees();renderInspector();toast('Nivel creado',`${name} · ${fmt(elevation,2)} m`,'good');
    }}]});
  }
  function createPlanForLevel(level,activate=true){
    if(!state.modelLoaded){toast('Nivel creado','Carga un IFC para generar su planta.','warn');return null;}
    const box=state.modelBox,y=levelModelY(level),sorted=[...state.levels].sort((a,b)=>a.elevation-b.elevation),idx=sorted.findIndex(l=>l.id===level.id),next=sorted[idx+1],nextY=next?levelModelY(next):box.max.y;
    const near=clamp(y-.08,box.min.y,box.max.y),far=clamp(Math.max(y+.45,nextY-.08),box.min.y,box.max.y);
    const existing=state.drawings.find(d=>d.kind==='plan'&&d.levelId===level.id);if(existing){if(activate)activateDrawing(existing.id);return existing;}
    const d=addDrawing({name:`Planta · ${level.name}`,kind:'plan',levelId:level.id,pending:true,projection:{orientation:'top',near,far,angleThreshold:50},annotations:[]});renderTrees();if(activate)activateDrawing(d.id);return d;
  }

  // ---------- Drawings ----------
  function calcBounds(segments){
    let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;
    for(const s of segments||[]){
      minX=Math.min(minX,s[0],s[2]); minY=Math.min(minY,s[1],s[3]); maxX=Math.max(maxX,s[0],s[2]); maxY=Math.max(maxY,s[1],s[3]);
    }
    if(!Number.isFinite(minX)) return {minX:-5,minY:-5,maxX:5,maxY:5,width:10,height:10,cx:0,cy:0};
    const width=Math.max(.001,maxX-minX),height=Math.max(.001,maxY-minY);
    return {minX,minY,maxX,maxY,width,height,cx:(minX+maxX)/2,cy:(minY+maxY)/2};
  }
  function ensureDrawingBounds(d){
    if(d?.kind==='areaSchedule')return d.bounds=scheduleBounds(d);
    const all=[...(d.visible||[]),...(d.hidden||[])]; d.bounds=calcBounds(all); return d.bounds;
  }
  function fitViewBox(d){
    const b=ensureDrawingBounds(d), pad=Math.max(b.width,b.height)*.07+.25;
    const vb={x:b.minX-pad,y:b.minY-pad,w:b.width+pad*2,h:b.height+pad*2}; state.viewBoxes.set(d.id,vb); return vb;
  }
  function activeDrawing(){ return state.drawings.find(d=>d.id===state.activeDrawingId)||null; }
  function activeSheet(){ return state.sheets.find(s=>s.id===state.activeSheetId)||null; }
  function selectedViewport(){ const sh=activeSheet(); return sh?.viewports.find(v=>v.id===state.selectedViewportId)||null; }
  function selectedAnnotation(){ const d=activeDrawing(); return d?.annotations?.find(a=>a.id===state.selectedAnnotationId)||null; }

  function drawingLabelKind(kind){ return ({plan:'PLANTA',elevation:'ALZADO',section:'SECCIÓN',demo:'VISTA',threeD:'VISTA 3D',areaSchedule:'CUADRO DE ÁREAS'})[kind] || 'VISTA'; }
  function addDrawing(d){
    d.id ||= uid('view'); d.visible ||= []; d.hidden ||= []; d.annotations ||= []; d.pending = !!d.pending; d.snapIndex=null;
    ensureDrawingDisplay(d);
    if(d.kind==='threeD'){
      const aspect=Math.max(.1,Number(d.imageAspect)||((d.imageWidth||16)/Math.max(1,d.imageHeight||9)));
      d.imageAspect=aspect;d.bounds={minX:0,minY:0,maxX:aspect,maxY:1,width:aspect,height:1,cx:aspect/2,cy:.5};d.pending=false;
    }else if(d.kind==='areaSchedule'){
      d.rows=Array.isArray(d.rows)?d.rows:[];d.bounds=scheduleBounds(d);d.pending=false;
    }else if(!d.pending) ensureDrawingBounds(d);
    state.drawings.push(d); return d;
  }

  function ensureDrawingDisplay(d){
    if(!d.display)d.display={hiddenCategories:new Set(),hiddenItems:new Set(),categoryColors:new Map(),itemColors:new Map()};
    d.display.hiddenCategories ||= new Set();d.display.hiddenItems ||= new Set();d.display.categoryColors ||= new Map();d.display.itemColors ||= new Map();
    d.segmentStyles ||= {visible:[],hidden:[]};
    return d.display;
  }
  const itemKey=(modelId,localId)=>`${String(modelId)}:${String(localId)}`;
  function mapCount(map){let n=0;for(const ids of Object.values(map||{}))n+=ids?.size||0;return n;}
  function copyMap(map){const out={};for(const [modelId,ids] of Object.entries(map||{}))out[modelId]=new Set(ids||[]);return out;}
  function intersectMap(source,allowed){
    const out={};for(const [modelId,ids] of Object.entries(source||{})){const ok=allowed?.[modelId];if(!ok)continue;const keep=new Set();for(const id of ids||[])if(ok.has(id))keep.add(id);if(keep.size)out[modelId]=keep;}return out;
  }
  function categoryDefaultColor(name){
    const n=String(name||'').toUpperCase();
    if(n.includes('WALL'))return '#d97706';if(n.includes('WINDOW'))return '#0284c7';if(n.includes('DOOR'))return '#a16207';
    if(n.includes('ROOF'))return '#7c3aed';if(n.includes('SLAB'))return '#64748b';if(n.includes('SPACE'))return '#06b6d4';
    if(n.includes('COLUMN')||n.includes('BEAM')||n.includes('MEMBER'))return '#475569';if(n.includes('FURNISH'))return '#a855f7';
    return '#2563eb';
  }
  async function activateDrawing(id){
    let d=state.drawings.find(x=>x.id===id); if(!d)return;
    state.activeDrawingId=id; state.selectedAnnotationId=null;
    if(d.pending){
      try{ await projectPendingDrawing(d); }catch(err){ console.error(err); toast('No se pudo generar la vista', err.message || String(err),'bad'); setStatus('Error al proyectar','error'); return; }
    }
    if(state.selectedIfc)await syncSelectedIfcProjection(d);
    if(!state.viewBoxes.has(id)) fitViewBox(d);
    setMode('drawing'); renderTrees(); renderDrawing(); renderInspector();
  }

  function geometrySegments(geometry, orientation){
    const pos=geometry?.getAttribute?.('position'); if(!pos) return [];
    const segs=[];
    const map=(x,y,z)=>{
      switch(orientation){
        case 'top': return [x,z];
        case 'front': return [x,-y];
        case 'back': return [-x,-y];
        case 'left': return [z,-y];
        case 'right': return [-z,-y];
        default: return [x,-y];
      }
    };
    const cap=450000; const count=Math.min(pos.count-pos.count%2,cap*2);
    for(let i=0;i<count;i+=2){
      const a=map(pos.getX(i),pos.getY(i),pos.getZ(i)); const b=map(pos.getX(i+1),pos.getY(i+1),pos.getZ(i+1));
      if(Math.hypot(a[0]-b[0],a[1]-b[1])>1e-6) segs.push([a[0],a[1],b[0],b[1]]);
    }
    return segs;
  }

  function extentAlong(box, axis){
    const xs=[box.min.x,box.max.x],ys=[box.min.y,box.max.y],zs=[box.min.z,box.max.z]; let mn=Infinity,mx=-Infinity;
    for(const x of xs)for(const y of ys)for(const z of zs){ const v=x*axis[0]+y*axis[1]+z*axis[2]; mn=Math.min(mn,v);mx=Math.max(mx,v); }
    return {min:mn,max:mx};
  }
  const orientationDef = {
    top:{dir:[0,-1,0],axis:[0,1,0]}, front:{dir:[0,0,-1],axis:[0,0,1]}, back:{dir:[0,0,1],axis:[0,0,-1]},
    left:{dir:[-1,0,0],axis:[1,0,0]}, right:{dir:[1,0,0],axis:[-1,0,0]}
  };

  function configureProjector(d){
    const {edgeProjector}=state.engine,def=orientationDef[d.projection.orientation]||orientationDef.top,ext=extentAlong(state.modelBox,def.axis);
    edgeProjector.projectionDirection.set(...def.dir);
    let near=Number.isFinite(d.projection.near)?d.projection.near:ext.min,far=Number.isFinite(d.projection.far)?d.projection.far:ext.max;
    if(near>far)[near,far]=[far,near];edgeProjector.nearPlane=clamp(near,ext.min,ext.max);edgeProjector.farPlane=clamp(far,ext.min,ext.max);
    edgeProjector.generator.angleThreshold=d.projection.angleThreshold||50;
  }
  function drawingProjectionMap(d){
    const display=ensureDrawingDisplay(d),out=copyMap(state.geometryMap);
    for(const category of display.hiddenCategories){
      const group=state.categoryItems.get(category);if(!group)continue;
      for(const [modelId,ids] of Object.entries(group.map||{})){const target=out[modelId];if(!target)continue;for(const id of ids)target.delete(id);}
    }
    for(const [modelId,ids] of Object.entries(out))for(const id of [...ids])if(display.hiddenItems.has(itemKey(modelId,id)))ids.delete(id);
    for(const modelId of Object.keys(out))if(!out[modelId].size)delete out[modelId];
    return out;
  }
  async function projectMap(map,d,onProgress){
    configureProjector(d);const {edgeProjector,world}=state.engine;
    const result=await edgeProjector.get(map,world,{onProgress:(message,p)=>onProgress?.(message,p)});
    const visible=geometrySegments(result.visible,d.projection.orientation),hidden=geometrySegments(result.hidden,d.projection.orientation);
    try{result.visible.dispose?.();result.hidden.dispose?.();}catch(_){ }
    return {visible,hidden};
  }
  function segmentCandidateIndex(segments,bounds){
    const maxDim=Math.max(bounds?.width||1,bounds?.height||1,.1),cell=Math.max(maxDim/100,.04),cells=new Map();
    const add=(key,i)=>{let a=cells.get(key);if(!a)cells.set(key,a=[]);a.push(i);};
    segments.forEach((s,i)=>{const minX=Math.min(s[0],s[2]),maxX=Math.max(s[0],s[2]),minY=Math.min(s[1],s[3]),maxY=Math.max(s[1],s[3]);const x0=Math.floor(minX/cell),x1=Math.floor(maxX/cell),y0=Math.floor(minY/cell),y1=Math.floor(maxY/cell);for(let x=x0;x<=x1;x++)for(let y=y0;y<=y1;y++)add(`${x},${y}`,i);});
    return {segments,cells,cell,tol:Math.max(maxDim*1e-5,.0002)};
  }
  function segmentHasSource(s,index){
    const mx=(s[0]+s[2])/2,my=(s[1]+s[3])/2,ix=Math.floor(mx/index.cell),iy=Math.floor(my/index.cell),ids=new Set();
    for(let x=ix-1;x<=ix+1;x++)for(let y=iy-1;y<=iy+1;y++)for(const id of index.cells.get(`${x},${y}`)||[])ids.add(id);
    const ax=s[2]-s[0],ay=s[3]-s[1],al=Math.hypot(ax,ay);if(al<1e-8)return false;
    for(const id of ids){const q=index.segments[id],bx=q[2]-q[0],by=q[3]-q[1],bl=Math.hypot(bx,by);if(bl<1e-8)continue;if(Math.abs(ax*by-ay*bx)/(al*bl)>.003)continue;const near=nearestPointOnSegment([mx,my],q);if(Math.hypot(near[0]-mx,near[1]-my)<=index.tol)return true;}
    return false;
  }
  function paintMasterSegments(master,source,styles,style,bounds){
    const candidates=[...(source.visible||[]),...(source.hidden||[])];if(!candidates.length)return;
    const index=segmentCandidateIndex(candidates,bounds);for(let i=0;i<master.length;i++)if(segmentHasSource(master[i],index))styles[i]=style;
  }
  async function rebuildDrawingStyles(d,allowed){
    const display=ensureDrawingDisplay(d);d.segmentStyles={visible:new Array(d.visible.length).fill(null),hidden:new Array(d.hidden.length).fill(null)};
    const sources=[];
    for(const [category,color] of display.categoryColors){
      if(display.hiddenCategories.has(category))continue;const group=state.categoryItems.get(category);if(!group)continue;
      const map=intersectMap(group.map,allowed);if(mapCount(map))sources.push({map,style:{color,layer:`CAT_${String(category).replace(/[^A-Za-z0-9_]/g,'_').slice(0,28)}`}});
    }
    for(const [key,color] of display.itemColors){
      if(display.hiddenItems.has(key))continue;const cut=key.lastIndexOf(':'),modelId=key.slice(0,cut),rawId=key.slice(cut+1),allowedIds=allowed[modelId];if(!allowedIds)continue;
      let localId=[...allowedIds].find(id=>String(id)===rawId);if(localId===undefined)continue;
      sources.push({map:{[modelId]:new Set([localId])},style:{color,layer:`EL_${rawId.replace(/[^A-Za-z0-9_]/g,'_').slice(0,24)}`}});
    }
    let i=0;for(const source of sources){updateProgress(`Aplicando colores documentales · ${++i}/${sources.length}`,.80+(i/Math.max(1,sources.length))*.15);const projected=await projectMap(source.map,d);paintMasterSegments(d.visible,projected,d.segmentStyles.visible,source.style,d.bounds);paintMasterSegments(d.hidden,projected,d.segmentStyles.hidden,source.style,d.bounds);}
  }

  async function projectPendingDrawing(d){
    if(!state.engine || !state.modelLoaded) throw new Error('Primero debes cargar un IFC.');
    if(d._projecting)return d._projecting;
    d._projecting=(async()=>{
    const oldView=state.viewBoxes.get(d.id),wasPending=d.pending;
    showProgress('Generando vista 2D', `${d.name} · preparando geometría`, .05);
    const map=drawingProjectionMap(d),total=mapCount(map);if(!total)throw new Error('Los filtros de la vista ocultan todos los elementos. Restablece la visibilidad.');
    updateProgress(`${total.toLocaleString('es-ES')} elementos con geometría`, .16);
    const projected=await projectMap(map,d,(message,p)=>{if(Number.isFinite(p))updateProgress(message,p*.62+.16);else updateProgress(message);});
    d.visible=projected.visible;d.hidden=projected.hidden;d.pending=false;d.snapIndex=null;d.stats={elements:total};ensureDrawingBounds(d);
    await rebuildDrawingStyles(d,map);
    if(wasPending||!oldView)fitViewBox(d);else state.viewBoxes.set(d.id,oldView);
    hideProgress(`Vista generada · ${d.visible.length.toLocaleString('es-ES')} líneas`);
    if(d.kind==='plan'&&!(d.annotations||[]).some(a=>a.type==='area'&&a.source==='IFC'))await importIfcSpaces(d,{automatic:true});
    toast('Vista generada', `${d.name}: ${d.visible.length.toLocaleString('es-ES')} visibles · ${d.hidden.length.toLocaleString('es-ES')} ocultas`,'good');
    if(state.activeDrawingId===d.id){renderDrawing();renderInspector();}renderTrees();renderSheet();
    })().catch(err=>{
      clearInterval(state.progressState.timer);state.progressState.timer=null;el.progress.classList.add('hidden');state.busy=false;
      throw err;
    }).finally(()=>{d._projecting=null;});return d._projecting;
  }

  function updateDrawingToolAvailability(d=activeDrawing()){
    const raster=d?.kind==='threeD',schedule=d?.kind==='areaSchedule',locked=raster||schedule;
    $$('[data-draw-tool]').forEach(b=>{b.disabled=!!locked;});
    ['toggleSnapBtn','toggleOrthoBtn','btnExportDxf'].forEach(id=>{const b=$(`#${id}`);if(b)b.disabled=!!locked;});
    const svg=$('#btnExportSvg');if(svg)svg.disabled=!!raster;
    if(locked&&state.drawTool!=='select'){state.drawTool='select';state.pendingDimension=null;state.pendingDimensionChain=null;state.pendingArea=null;$$('[data-draw-tool]').forEach(b=>b.classList.toggle('active',b.dataset.drawTool==='select'));}
  }

  function drawingLayers(d,hidden=false){
    const segments=hidden?(d.hidden||[]):(d.visible||[]),styles=(d.segmentStyles?.[hidden?'hidden':'visible'])||[],groups=new Map();
    for(let i=0;i<segments.length;i++){const style=styles[i]||null,key=style?`${style.color}|${style.layer}`:'default';let g=groups.get(key);if(!g){g={style,segments:[]};groups.set(key,g);}g.segments.push(segments[i]);}
    return [...groups.values()];
  }
  function styledSvgLines(d,hidden=false,cls='visible-line'){
    return drawingLayers(d,hidden).map(g=>g.segments.map(s=>`<line class="${cls}"${g.style?` style="stroke:${esc(g.style.color)}"`:''} x1="${s[0]}" y1="${s[1]}" x2="${s[2]}" y2="${s[3]}"/>`).join('')).join('');
  }

  function polygonArea(points){let a=0;for(let i=0;i<(points||[]).length;i++){const p=points[i],q=points[(i+1)%points.length];a+=p[0]*q[1]-q[0]*p[1];}return Math.abs(a)/2;}
  function polygonCentroid(points){
    let crossSum=0,cx=0,cy=0;for(let i=0;i<(points||[]).length;i++){const p=points[i],q=points[(i+1)%points.length],cross=p[0]*q[1]-q[0]*p[1];crossSum+=cross;cx+=(p[0]+q[0])*cross;cy+=(p[1]+q[1])*cross;}
    if(Math.abs(crossSum)<1e-9){const n=Math.max(1,points?.length||0);return [(points||[]).reduce((s,p)=>s+p[0],0)/n,(points||[]).reduce((s,p)=>s+p[1],0)/n];}
    return [cx/(3*crossSum),cy/(3*crossSum)];
  }
  function convexHull(points){
    const entries=(points||[]).map(p=>[`${(+p[0]).toFixed(5)}:${(+p[1]).toFixed(5)}`,[+p[0],+p[1]]]);
    const unique=[...new Map(entries).values()].sort((a,b)=>a[0]-b[0]||a[1]-b[1]);if(unique.length<3)return unique;
    const cross=(o,a,b)=>(a[0]-o[0])*(b[1]-o[1])-(a[1]-o[1])*(b[0]-o[0]),lower=[],upper=[];
    for(const p of unique){while(lower.length>=2&&cross(lower[lower.length-2],lower[lower.length-1],p)<=0)lower.pop();lower.push(p);}for(let i=unique.length-1;i>=0;i--){const p=unique[i];while(upper.length>=2&&cross(upper[upper.length-2],upper[upper.length-1],p)<=0)upper.pop();upper.push(p);}lower.pop();upper.pop();return lower.concat(upper);
  }
  function ensureAreaAnnotation(a){a.polygon=Array.isArray(a.polygon)?a.polygon:[];a.areaM2=Number.isFinite(+a.areaM2)?+a.areaM2:polygonArea(a.polygon);a.center=Array.isArray(a.center)?a.center:polygonCentroid(a.polygon);a.name=String(a.name||'Estancia');a.number=String(a.number||'');a.source=a.source||'MANUAL';if(typeof a.showLabel!=='boolean')a.showLabel=true;return a;}
  function areaLabelVisible(a,d){return d?.areaLabelsVisible!==false&&ensureAreaAnnotation(a).showLabel!==false;}
  function areaAnnotationSvg(a,d){
    ensureAreaAnnotation(a);const b=d.bounds||ensureDrawingBounds(d),fs=Math.max(.16,Math.max(b.width,b.height)/105),pts=a.polygon.map(p=>`${p[0]},${p[1]}`).join(' '),selected=a.id===state.selectedAnnotationId?' area-selected':'',label=`${esc(a.number?`${a.number} · `:'')}${esc(a.name)}`,area=`${fmt(a.areaM2,2)} m²`,texts=areaLabelVisible(a,d)?`<text class="area-label" data-ann="${a.id}" x="${a.center[0]}" y="${a.center[1]-fs*.18}" font-size="${fs}">${label}</text><text class="area-label" data-ann="${a.id}" x="${a.center[0]}" y="${a.center[1]+fs*.95}" font-size="${fs*.86}">${area}</text>`:'';
    return `<g class="area-annotation${selected}" data-ann="${a.id}"><polygon class="area-fill" data-ann="${a.id}" points="${pts}"/>${texts}</g>`;
  }
  function scheduleBounds(d){const rows=Math.max(1,d?.rows?.length||0),height=1.55+rows*.68;return {minX:0,minY:0,maxX:16,maxY:height,width:16,height,cx:8,cy:height/2};}
  function areaScheduleSvg(d){
    const rows=d.rows||[],cols=[0,1.7,10.4,13.4,16],titleH=.88,headH=.67,rowH=.68,total=titleH+headH+Math.max(1,rows.length)*rowH;d.bounds={minX:0,minY:0,maxX:16,maxY:total,width:16,height:total,cx:8,cy:total/2};let out=`<rect class="schedule-head" x="0" y="0" width="16" height="${titleH}"/><text class="schedule-title" x=".22" y=".58" font-size=".34">${esc(d.name||'Cuadro de áreas')}</text>`;
    const headers=['Nº','Estancia','Origen','Área'];for(let i=0;i<4;i++){out+=`<rect class="schedule-head" x="${cols[i]}" y="${titleH}" width="${cols[i+1]-cols[i]}" height="${headH}"/><text class="schedule-title ${i===3?'schedule-area':''}" x="${i===3?cols[i+1]-.18:cols[i]+.18}" y="${titleH+.45}" font-size=".28">${headers[i]}</text>`;}
    const sourceRows=rows.length?rows:[{number:'—',name:'Sin áreas',source:'—',areaM2:0}];sourceRows.forEach((row,r)=>{const y=titleH+headH+r*rowH,values=[row.number||String(r+1).padStart(2,'0'),row.name||'Estancia',row.source==='IFC'?'IFC':'Manual',`${fmt(row.areaM2,2)} m²`];for(let i=0;i<4;i++){out+=`<rect class="schedule-cell" x="${cols[i]}" y="${y}" width="${cols[i+1]-cols[i]}" height="${rowH}"/><text class="schedule-text ${i===3?'schedule-area':''}" x="${i===3?cols[i+1]-.18:cols[i]+.18}" y="${y+.45}" font-size=".28">${esc(values[i])}</text>`;}});return out;
  }
  function areaScheduleTable(d){const rows=d.rows||[];return `<table class="area-schedule-table"><caption>${esc(d.name||'Cuadro de áreas')}</caption><thead><tr><th style="width:12%">Nº</th><th>Estancia</th><th style="width:19%">Origen</th><th style="width:22%">Área</th></tr></thead><tbody>${rows.map((r,i)=>`<tr><td>${esc(r.number||String(i+1).padStart(2,'0'))}</td><td>${esc(r.name)}</td><td>${r.source==='IFC'?'IFC':'Manual'}</td><td>${fmt(r.areaM2,2)} m²</td></tr>`).join('')||'<tr><td>—</td><td>Sin áreas</td><td>—</td><td>0,00 m²</td></tr>'}</tbody></table>`;}

  function renderDrawing(){
    const d=activeDrawing(); const svg=el.drawingSvg;
    if(!d || d.pending){ svg.innerHTML='';svg.classList.remove('raster-preview'); el.drawingEmpty.classList.remove('hidden'); el.drawingTitle.textContent=d?.name||'Sin vista activa'; el.drawingInfo.textContent=d?.pending?'Pendiente de generar':'—'; updateDrawingToolAvailability(d); return; }
    el.drawingEmpty.classList.add('hidden');
    if(d.kind==='threeD'){
      const aspect=d.imageAspect||16/9;const vb={x:0,y:0,w:aspect,h:1};state.viewBoxes.set(d.id,vb);svg.setAttribute('viewBox',`0 0 ${aspect} 1`);svg.classList.add('raster-preview');
      el.drawingTitle.textContent=d.name;el.drawingInfo.textContent=`VISTA 3D · ${d.imageWidth||0} × ${d.imageHeight||0} px · NTS`;
      svg.innerHTML=`<rect x="0" y="0" width="${aspect}" height="1" fill="#fff"/><image href="${d.imageData}" x="0" y="0" width="${aspect}" height="1" preserveAspectRatio="xMidYMid meet"/>`;updateDrawingToolAvailability(d);return;
    }
    if(d.kind==='areaSchedule'){
      svg.classList.remove('raster-preview');svg.classList.add('schedule-canvas');const vb=state.viewBoxes.get(d.id)||fitViewBox(d);svg.setAttribute('viewBox',`${vb.x} ${vb.y} ${vb.w} ${vb.h}`);el.drawingTitle.textContent=d.name;el.drawingInfo.textContent=`CUADRO DE ÁREAS · ${(d.rows||[]).length} estancias`;svg.innerHTML=`<rect x="${vb.x}" y="${vb.y}" width="${vb.w}" height="${vb.h}" fill="#fff"/><g>${areaScheduleSvg(d)}</g>`;updateDrawingToolAvailability(d);return;
    }
    svg.classList.remove('raster-preview','schedule-canvas');updateDrawingToolAvailability(d);
    let vb=state.viewBoxes.get(d.id)||fitViewBox(d); svg.setAttribute('viewBox',`${vb.x} ${vb.y} ${vb.w} ${vb.h}`);
    el.drawingTitle.textContent=d.name; el.drawingInfo.textContent=`${drawingLabelKind(d.kind)} · ${d.visible.length.toLocaleString('es-ES')} líneas`;
    const visible=styledSvgLines(d,false,'visible-line');
    const hidden=el.toggleHidden.checked?styledSvgLines(d,true,'hidden-line'):'';
    const selected=d.selectionSegments&&state.selectedIfc&&d.selectionSegments.key===state.selectedIfc.key?[...(d.selectionSegments.hidden||[]),...(d.selectionSegments.visible||[])].map(s=>`<line class="ifc-selection-line" x1="${s[0]}" y1="${s[1]}" x2="${s[2]}" y2="${s[3]}"/>`).join(''):'';
    const ann=(d.annotations||[]).map(a=>annotationSvg(a,d)).join('');
    let preview='';
    if(state.pendingDimension?.a){ const p=state.pendingDimension; if(p.b) preview=annotationSvg({id:'preview',type:'dimension',a:p.a,b:p.b,offset:p.offset||0},d,true); else preview=`<circle cx="${p.a[0]}" cy="${p.a[1]}" r="${Math.max(vb.w/500,.01)}" fill="#2563eb"/>`; }
    if(state.pendingDimensionChain?.points?.length){const p=state.pendingDimensionChain,pts=[...p.points,p.cursor].filter(Boolean),r=Math.max(vb.w/700,.008);preview+=`<polyline class="chain-preview" points="${pts.map(q=>q.join(',')).join(' ')}"/>${p.points.map(q=>`<circle class="chain-point" cx="${q[0]}" cy="${q[1]}" r="${r}"/>`).join('')}`;}
    if(state.pendingArea?.points?.length){const p=state.pendingArea,pts=[...p.points,p.cursor].filter(Boolean);preview+=`<polygon class="area-preview" points="${pts.map(q=>q.join(',')).join(' ')}"/>`;}
    const snap=renderSnapOverlay(d,vb);
    svg.innerHTML=`<rect x="${vb.x}" y="${vb.y}" width="${vb.w}" height="${vb.h}" fill="#fff"/><g>${hidden}${visible}</g><g aria-label="Elemento IFC seleccionado">${selected}</g><g>${ann}${preview}</g><g id="interactionOverlay">${snap}</g>`;
  }

  function formatLength(m){ if(Math.abs(m)>=100) return `${m.toFixed(1)} m`; if(Math.abs(m)>=10) return `${m.toFixed(2)} m`; return `${m.toFixed(3)} m`; }
  const dimensionTools=globalThis.HEFESTO_IFC_DIMENSIONS;
  function dimensionGeom(a){return dimensionTools.geometry(a);}
  function annotationSvg(a,d,preview=false){
    if(a.type==='area')return areaAnnotationSvg(a,d);
    const selected=state.selectedAnnotationId&&(a.id===state.selectedAnnotationId||(a.chainId&&d.annotations?.find(x=>x.id===state.selectedAnnotationId)?.chainId===a.chainId));
    const sel=!preview&&selected?` annotation-selected${a.chainId?' chain-selected':''}`:'';
    if(a.type==='dimension'){
      const g=dimensionGeom(a), b=d.bounds||ensureDrawingBounds(d), fs=Math.max(.16,Math.max(b.width,b.height)/100), tick=fs*.52;
      const label=esc(a.textOverride||formatLength(g.L)),text=dimensionTools.textLayout(g,fs*.4);
      const tx=-g.uy*tick,ty=g.ux*tick;
      return `<g class="${sel.trim()}" data-ann="${a.id}">
        <line class="dim-ext" x1="${a.a[0]}" y1="${a.a[1]}" x2="${g.q1[0]}" y2="${g.q1[1]}"/><line class="dim-ext" x1="${a.b[0]}" y1="${a.b[1]}" x2="${g.q2[0]}" y2="${g.q2[1]}"/>
        <line class="dim-line" x1="${g.q1[0]}" y1="${g.q1[1]}" x2="${g.q2[0]}" y2="${g.q2[1]}"/>
        <line class="dim-line" x1="${g.q1[0]-tx}" y1="${g.q1[1]-ty}" x2="${g.q1[0]+tx}" y2="${g.q1[1]+ty}"/><line class="dim-line" x1="${g.q2[0]-tx}" y1="${g.q2[1]-ty}" x2="${g.q2[0]+tx}" y2="${g.q2[1]+ty}"/>
        <line class="dim-hit" data-ann="${a.id}" x1="${g.q1[0]}" y1="${g.q1[1]}" x2="${g.q2[0]}" y2="${g.q2[1]}"/>
        <text class="dim-text" data-ann="${a.id}" x="${text.x}" y="${text.y}" font-size="${fs}" text-anchor="middle" transform="rotate(${text.angle} ${text.x} ${text.y})">${label}</text></g>`;
    }
    if(a.type==='text'){
      const b=d.bounds||ensureDrawingBounds(d),fs=a.size||Math.max(.18,Math.max(b.width,b.height)/90);
      return `<g class="${sel.trim()}" data-ann="${a.id}"><text class="note-text" data-ann="${a.id}" x="${a.p[0]}" y="${a.p[1]}" font-size="${fs}">${esc(a.text)}</text></g>`;
    }
    return '';
  }
  function updateDimensionNode(group,a,d){
    if(!group)return;const g=dimensionGeom(a),b=d.bounds||ensureDrawingBounds(d),fs=Math.max(.16,Math.max(b.width,b.height)/100),tick=fs*.52,text=dimensionTools.textLayout(g,fs*.4),tx=-g.uy*tick,ty=g.ux*tick,lines=group.querySelectorAll('line');
    const setLine=(node,x1,y1,x2,y2)=>{if(!node)return;node.setAttribute('x1',x1);node.setAttribute('y1',y1);node.setAttribute('x2',x2);node.setAttribute('y2',y2);};
    setLine(lines[0],a.a[0],a.a[1],g.q1[0],g.q1[1]);setLine(lines[1],a.b[0],a.b[1],g.q2[0],g.q2[1]);setLine(lines[2],g.q1[0],g.q1[1],g.q2[0],g.q2[1]);setLine(lines[3],g.q1[0]-tx,g.q1[1]-ty,g.q1[0]+tx,g.q1[1]+ty);setLine(lines[4],g.q2[0]-tx,g.q2[1]-ty,g.q2[0]+tx,g.q2[1]+ty);setLine(lines[5],g.q1[0],g.q1[1],g.q2[0],g.q2[1]);
    const label=group.querySelector('text.dim-text');if(label){label.setAttribute('x',text.x);label.setAttribute('y',text.y);label.setAttribute('transform',`rotate(${text.angle} ${text.x} ${text.y})`);}
  }

  function svgPoint(evt){
    const svg=el.drawingSvg; const p=svg.createSVGPoint(); p.x=evt.clientX;p.y=evt.clientY; const ctm=svg.getScreenCTM(); if(!ctm)return [0,0]; const q=p.matrixTransform(ctm.inverse()); return [q.x,q.y];
  }
  function worldTolerance(d,px=12){const vb=state.viewBoxes.get(d.id)||fitViewBox(d);return vb.w/Math.max(1,el.drawingSvg.clientWidth||1000)*px;}
  function cellKey(x,y,cell){return `${Math.floor(x/cell)},${Math.floor(y/cell)}`;}
  function buildSnapIndex(d){
    if(d.snapIndex)return d.snapIndex;const b=d.bounds||ensureDrawingBounds(d),maxDim=Math.max(b.width,b.height,.1),cell=Math.max(maxDim/90,.025),points=new Map(),segments=new Map();
    const add=(map,key,val)=>{let a=map.get(key);if(!a)map.set(key,a=[]);a.push(val);};
    const seen=new Set();
    (d.visible||[]).forEach((s,i)=>{
      const pts=[[s[0],s[1],'Extremo'],[s[2],s[3],'Extremo'],[(s[0]+s[2])/2,(s[1]+s[3])/2,'Medio']];
      for(const q of pts){const rk=`${q[2]}:${q[0].toFixed(6)}:${q[1].toFixed(6)}`;if(seen.has(rk))continue;seen.add(rk);add(points,cellKey(q[0],q[1],cell),q);}
      const len=Math.hypot(s[2]-s[0],s[3]-s[1]),steps=Math.min(80,Math.max(1,Math.ceil(len/cell)));
      const used=new Set();for(let k=0;k<=steps;k++){const t=k/steps,x=s[0]+(s[2]-s[0])*t,y=s[1]+(s[3]-s[1])*t,key=cellKey(x,y,cell);if(!used.has(key)){used.add(key);add(segments,key,i);}}
    });
    d.snapIndex={cell,points,segments};return d.snapIndex;
  }
  function nearestPointOnSegment(p,s){const vx=s[2]-s[0],vy=s[3]-s[1],l2=vx*vx+vy*vy;if(l2<1e-12)return [s[0],s[1]];const t=clamp(((p[0]-s[0])*vx+(p[1]-s[1])*vy)/l2,0,1);return [s[0]+t*vx,s[1]+t*vy];}
  function nearbyCells(p,idx){const ix=Math.floor(p[0]/idx.cell),iy=Math.floor(p[1]/idx.cell),keys=[];for(let dx=-1;dx<=1;dx++)for(let dy=-1;dy<=1;dy++)keys.push(`${ix+dx},${iy+dy}`);return keys;}
  function getSnap(p,d,options={}){
    if(!state.snapEnabled)return {p:[...p],type:null,distance:Infinity};const idx=buildSnapIndex(d),tol=worldTolerance(d,12);let best={p:[...p],type:null,distance:tol};
    const keys=nearbyCells(p,idx);const axis=options.axis,base=options.base;
    const accept=q=>{if(!axis||!base)return q;if(axis==='H'&&Math.abs(q[1]-base[1])<=tol)return [q[0],base[1],q[2]];if(axis==='V'&&Math.abs(q[0]-base[0])<=tol)return [base[0],q[1],q[2]];return null;};
    for(const key of keys)for(const q0 of idx.points.get(key)||[]){const q=accept(q0);if(!q)continue;const dd=Math.hypot(q[0]-p[0],q[1]-p[1]);const priority=q0[2]==='Extremo'?0:1,bp=best.type==='Extremo'?0:best.type==='Medio'?1:2;if(dd<=tol&&(dd<best.distance*.92||priority<bp)){best={p:[q[0],q[1]],type:q0[2],distance:dd};}}
    const segIds=new Set(keys.flatMap(k=>idx.segments.get(k)||[]));
    for(const i of segIds){const s=d.visible[i];let q;
      if(axis&&base){
        if(axis==='H'){
          const dy=s[3]-s[1];if(Math.abs(dy)<1e-10){if(Math.abs(s[1]-base[1])>tol)continue;q=[clamp(p[0],Math.min(s[0],s[2]),Math.max(s[0],s[2])),base[1]];}else{const t=(base[1]-s[1])/dy;if(t<0||t>1)continue;q=[s[0]+(s[2]-s[0])*t,base[1]];}
        }else{
          const dx=s[2]-s[0];if(Math.abs(dx)<1e-10){if(Math.abs(s[0]-base[0])>tol)continue;q=[base[0],clamp(p[1],Math.min(s[1],s[3]),Math.max(s[1],s[3]))];}else{const t=(base[0]-s[0])/dx;if(t<0||t>1)continue;q=[base[0],s[1]+(s[3]-s[1])*t];}
        }
      }else q=nearestPointOnSegment(p,s);
      const dd=Math.hypot(q[0]-p[0],q[1]-p[1]);if(!best.type&&dd<best.distance&&dd<=tol)best={p:q,type:'Arista',distance:dd};
    }
    return best;
  }
  function resolveDrawingPoint(raw,d,base,evt={}){
    const forceOrtho=!!base&&(state.orthoEnabled||evt.shiftKey);let initial=getSnap(raw,d);let axis=null,p=initial.p;
    if(forceOrtho){const target=initial.type?initial.p:raw;axis=Math.abs(target[0]-base[0])>=Math.abs(target[1]-base[1])?'H':'V';p=axis==='H'?[target[0],base[1]]:[base[0],target[1]];const aligned=getSnap(p,d,{axis,base});if(aligned.type)p=aligned.p;return {p,type:aligned.type||initial.type,axis};}
    return {p,type:initial.type,axis:null};
  }
  function renderSnapOverlay(d,vb){
    const sh=state.snapHover;let out='';
    if(state.pendingDimension?.a&&sh?.axis){const a=state.pendingDimension.a,p=sh.p;out+=`<line class="ortho-guide" x1="${a[0]}" y1="${a[1]}" x2="${p[0]}" y2="${p[1]}"/>`;}
    if(!sh?.type)return out;const r=Math.max(vb.w/(el.drawingSvg.clientWidth||1000)*7,vb.w/1000);const [x,y]=sh.p;
    if(sh.type==='Extremo')out+=`<rect class="snap-marker snap-marker-ring" x="${x-r}" y="${y-r}" width="${r*2}" height="${r*2}"/>`;
    else if(sh.type==='Medio')out+=`<path class="snap-marker snap-marker-mid" d="M ${x} ${y-r*1.2} L ${x+r*1.15} ${y+r*.8} L ${x-r*1.15} ${y+r*.8} Z"/>`;
    else out+=`<g class="snap-marker"><circle class="snap-marker-ring" cx="${x}" cy="${y}" r="${r*.8}"/><line class="snap-marker-cross" x1="${x-r*1.4}" y1="${y}" x2="${x+r*1.4}" y2="${y}"/><line class="snap-marker-cross" x1="${x}" y1="${y-r*1.4}" x2="${x}" y2="${y+r*1.4}"/></g>`;
    out+=`<text class="snap-label" x="${x+r*1.7}" y="${y-r*1.4}" font-size="${Math.max(r*1.8,.12)}">${sh.type}</text>`;return out;
  }

  function updateInteractionOverlay(){const d=activeDrawing();if(!d||d.pending)return;const vb=state.viewBoxes.get(d.id)||fitViewBox(d),g=$('#interactionOverlay',el.drawingSvg);if(g)g.innerHTML=renderSnapOverlay(d,vb);}

  function chainReference(raw,d,base=null,evt={}){
    const direct=getSnap(raw,d);if(!direct.type){const near=nearestDrawingSegment(raw,d);if(near.index<0||near.distance>worldTolerance(d,12))return null;direct.p=near.point;direct.type='Arista';}
    if(!base)return {p:direct.p,type:direct.type,axis:null};const axis=state.pendingDimensionChain?.axis||(state.orthoEnabled||evt.shiftKey?(Math.abs(direct.p[0]-base[0])>=Math.abs(direct.p[1]-base[1])?'H':'V'):null),p=axis==='H'?[direct.p[0],base[1]]:axis==='V'?[base[0],direct.p[1]]:direct.p;return {p,type:direct.type,axis};
  }
  function finishDimensionChain(d,placement){
    const pending=state.pendingDimensionChain,rawPoints=pending?.points||[],points=[];for(const p of rawPoints)if(!points.length||Math.hypot(p[0]-points.at(-1)[0],p[1]-points.at(-1)[1])>1e-6)points.push(p);
    if(points.length<2){state.pendingDimensionChain=null;state.snapHover=null;renderDrawing();toast('Cadena cancelada','Se necesitan al menos dos referencias.','warn');return false;}
    const first=points[0],last=points.at(-1),dx=last[0]-first[0],dy=last[1]-first[1],L=Math.max(1e-9,Math.hypot(dx,dy)),nx=-dy/L,ny=dx/L,mid=[(first[0]+last[0])/2,(first[1]+last[1])/2];let offset=(placement[0]-mid[0])*nx+(placement[1]-mid[1])*ny;if(Math.abs(offset)<.05)offset=.35;const chainId=uid('chain');let selected=null;
    for(let i=0;i<points.length-1;i++){const a={id:uid('dim'),type:'dimension',a:[...points[i]],b:[...points[i+1]],offset,axis:pending.axis||null,chainId,chainIndex:i};d.annotations.push(a);selected||=a;}
    state.pendingDimensionChain=null;state.snapHover=null;state.selectedAnnotationId=selected?.id||null;renderDrawing();renderSheet();renderInspector();toast('Cadena de cotas creada',`${points.length-1} tramos · arrastra cualquiera para mover todo el conjunto.`,'good');return true;
  }
  function cleanPolygon(points,d){const tol=worldTolerance(d,2),out=[];for(const p of points||[])if(!out.length||Math.hypot(p[0]-out.at(-1)[0],p[1]-out.at(-1)[1])>tol)out.push([...p]);if(out.length>2&&Math.hypot(out[0][0]-out.at(-1)[0],out[0][1]-out.at(-1)[1])<=tol)out.pop();return out;}
  function finishManualArea(d){
    const polygon=cleanPolygon(state.pendingArea?.points||[],d);state.pendingArea=null;state.snapHover=null;if(polygon.length<3||polygonArea(polygon)<.001){renderDrawing();toast('Área cancelada','El perímetro necesita al menos tres puntos y una superficie válida.','warn');return;}
    const n=(d.annotations||[]).filter(a=>a.type==='area').length+1,areaM2=polygonArea(polygon),center=polygonCentroid(polygon);
    showModal({title:'Anotar estancia',html:`<div class="modal-note">Superficie calculada sobre el perímetro: <b>${fmt(areaM2,2)} m²</b>.</div><div class="form-grid"><div class="form-group"><label>Número</label><input id="areaNumber" value="${String(n).padStart(2,'0')}"></div><div class="form-group"><label>Estancia</label><input id="areaName" value="Estancia ${n}" autofocus></div></div>`,actions:[{label:'Cancelar',onClick:()=>{closeModal();renderDrawing();}},{label:'Crear área',primary:true,onClick:()=>{const a=ensureAreaAnnotation({id:uid('area'),type:'area',polygon,areaM2,center,number:$('#areaNumber').value.trim(),name:$('#areaName').value.trim()||`Estancia ${n}`,source:'MANUAL'});d.annotations.push(a);state.selectedAnnotationId=a.id;syncAreaSchedules(d);closeModal();renderDrawing();renderSheet();renderInspector();toast('Área creada',`${a.name} · ${fmt(a.areaM2,2)} m²`,'good');}}]});setTimeout(()=>$('#areaName')?.select(),30);
  }

  async function onDrawingClick(evt){
    const d=activeDrawing(); if(!d||d.pending||state.dragAnnotation||performance.now()<state.ui.suppressClickUntil)return;
    if(state.drawTool==='select'){
      const target=evt.target.closest?.('[data-ann]');state.selectedAnnotationId=target?.dataset?.ann||null;if(state.selectedAnnotationId){renderDrawing();renderInspector();return;}
      const raw=svgPoint(evt);if(state.modelLoaded&&d.kind!=='areaSchedule'){const near=nearestDrawingSegment(raw,d);if(near.index>=0&&near.distance<=worldTolerance(d,12)){await selectIfcFromDrawing(d,raw);return;}}
      await clearIfcSelection();renderDrawing();renderInspector();refreshFragmentsAfterCamera();return;
    }
    if(d.kind==='areaSchedule')return;
    const raw=svgPoint(evt),base=state.drawTool==='dimension'&&state.pendingDimension&&!state.pendingDimension.b?state.pendingDimension.a:null,res=resolveDrawingPoint(raw,d,base,evt),p=res.p;
    if(state.drawTool==='dimension'){
      if(!state.pendingDimension){ state.pendingDimension={a:p}; toast('Cota · punto 1',`Referencia: ${res.type||'libre'}. Selecciona el segundo punto.`); }
      else if(!state.pendingDimension.b){ state.pendingDimension.b=p;state.pendingDimension.axis=res.axis; toast('Cota · línea definida',`${res.axis?`ORTO ${res.axis==='H'?'horizontal':'vertical'} · `:''}${res.type||'punto libre'}. Tercer clic para colocar la línea.`); }
      else{
        const a=state.pendingDimension.a,b=state.pendingDimension.b,dx=b[0]-a[0],dy=b[1]-a[1],L=Math.max(1e-9,Math.hypot(dx,dy)); const nx=-dy/L,ny=dx/L; const mid=[(a[0]+b[0])/2,(a[1]+b[1])/2];
        let off=(raw[0]-mid[0])*nx+(raw[1]-mid[1])*ny; if(Math.abs(off)<.05)off=.35;
        const ann={id:uid('dim'),type:'dimension',a:[...a],b:[...b],offset:off,axis:state.pendingDimension.axis||null}; d.annotations.push(ann);state.selectedAnnotationId=ann.id;state.pendingDimension=null;state.snapHover=null;toast('Cota creada',formatLength(L),'good');
      }
      renderDrawing();renderInspector();renderSheet();return;
    }
    if(state.drawTool==='dimension-chain'){
      state.pendingDimensionChain ||= {points:[],axis:null,cursor:null};const chain=state.pendingDimensionChain,ref=chainReference(raw,d,chain.points[0]||null,evt);
      if(!ref){if(chain.points.length>=2)finishDimensionChain(d,raw);else{state.pendingDimensionChain=null;renderDrawing();toast('Cadena cancelada','Empieza sobre una referencia visible.','warn');}return;}
      if(chain.points.length&&Math.hypot(ref.p[0]-chain.points.at(-1)[0],ref.p[1]-chain.points.at(-1)[1])<=worldTolerance(d,2)){toast('Referencia repetida','Selecciona otro punto de la cadena.','warn');return;}
      if(chain.points.length===1)chain.axis=ref.axis;chain.points.push([...ref.p]);chain.cursor=[...ref.p];state.snapHover=ref;renderDrawing();toast(`Cadena · referencia ${chain.points.length}`,chain.points.length===1?'Selecciona la siguiente referencia.':'Continúa o haz clic en blanco para colocar y terminar.');return;
    }
    if(state.drawTool==='area'){
      state.pendingArea ||= {points:[],cursor:null};const area=state.pendingArea,snap=getSnap(raw,d),point=snap.type?snap.p:raw;if(area.points.length>=3&&Math.hypot(point[0]-area.points[0][0],point[1]-area.points[0][1])<=worldTolerance(d,12)){finishManualArea(d);return;}area.points.push([...point]);area.cursor=[...point];state.snapHover=snap;renderDrawing();return;
    }
    if(state.drawTool==='text'){
      showTextModal(p,d); return;
    }
  }

  function showTextModal(p,d){
    showModal({title:'Añadir texto',html:`<div class="form-grid"><div class="form-group full"><label>Texto</label><input id="modalTextValue" autofocus value="Nota técnica"></div></div>`,actions:[
      {label:'Cancelar',onClick:closeModal},{label:'Añadir',primary:true,onClick:()=>{const text=$('#modalTextValue').value.trim();if(text){const a={id:uid('text'),type:'text',p:[...p],text};d.annotations.push(a);state.selectedAnnotationId=a.id;}closeModal();renderDrawing();renderInspector();renderSheet();}}
    ]}); setTimeout(()=>$('#modalTextValue')?.select(),30);
  }

  function beginAnnotationDrag(evt){
    if(state.mode!=='drawing'||state.drawTool!=='select')return;const target=evt.target.closest?.('[data-ann]');if(!target)return;const d=activeDrawing(),a=d?.annotations?.find(x=>x.id===target.dataset.ann);if(!a||!['text','dimension'].includes(a.type))return;
    evt.preventDefault();evt.stopPropagation();state.selectedAnnotationId=a.id;const p=svgPoint(evt),chain=a.chainId?d.annotations.filter(x=>x.type==='dimension'&&x.chainId===a.chainId).map(x=>({id:x.id,offset:x.offset})):null;state.dragAnnotation={id:a.id,type:a.type,start:[...p],origin:a.type==='text'?[...a.p]:a.offset,chain,pointerId:evt.pointerId,moved:false};el.drawingSvg.classList.add('dragging-annotation');el.drawingSvg.setPointerCapture?.(evt.pointerId);renderDrawing();renderInspector();
  }
  function moveAnnotationDrag(evt){
    const drag=state.dragAnnotation;if(!drag)return false;const d=activeDrawing(),a=d?.annotations?.find(x=>x.id===drag.id);if(!a)return false;const p=svgPoint(evt),dx=p[0]-drag.start[0],dy=p[1]-drag.start[1];drag.moved=drag.moved||Math.hypot(dx,dy)>worldTolerance(d,2);
    if(a.type==='text'){a.p=[drag.origin[0]+dx,drag.origin[1]+dy];const node=el.drawingSvg.querySelector(`text.note-text[data-ann="${a.id}"]`);if(node){node.setAttribute('x',a.p[0]);node.setAttribute('y',a.p[1]);}el.statusCoords.textContent=`X ${fmt(a.p[0],3)} · Y ${fmt(a.p[1],3)}`;}
    else if(a.type==='dimension'){const g=dimensionGeom(a),delta=dx*g.nx+dy*g.ny;if(drag.chain?.length){for(const item of drag.chain){const member=d.annotations.find(x=>x.id===item.id);if(!member)continue;member.offset=item.offset+delta;updateDimensionNode(el.drawingSvg.querySelector(`g[data-ann="${member.id}"]`),member,d);}a.offset=drag.origin+delta;el.statusCoords.textContent=`Cadena · desfase ${fmt(a.offset,3)} m`;}else{a.offset=drag.origin+delta;updateDimensionNode(el.drawingSvg.querySelector(`g[data-ann="${a.id}"]`),a,d);el.statusCoords.textContent=`Desfase ${fmt(a.offset,3)} m`;}}
    return true;
  }
  function endAnnotationDrag(evt){
    const drag=state.dragAnnotation;if(!drag)return;try{el.drawingSvg.releasePointerCapture?.(drag.pointerId);}catch(_){}el.drawingSvg.classList.remove('dragging-annotation');state.dragAnnotation=null;if(drag.moved)state.ui.suppressClickUntil=performance.now()+250;renderDrawing();renderSheet();renderInspector();
  }
  function beginDrawingPan(evt){
    if(state.mode!=='drawing'||state.dragAnnotation)return;const d=activeDrawing();if(!d||d.pending||d.kind==='threeD')return;const overAnnotation=!!evt.target.closest?.('[data-ann]');const primaryBackground=evt.button===0&&state.drawTool==='select'&&!overAnnotation;const explicit=evt.button===1||(evt.button===0&&(evt.shiftKey||state.ui.spaceDown));if(!primaryBackground&&!explicit)return;
    if(explicit)evt.preventDefault();const vb={...(state.viewBoxes.get(d.id)||fitViewBox(d))};state.ui.pan={drawingId:d.id,pointerId:evt.pointerId,startX:evt.clientX,startY:evt.clientY,vb,moved:false};el.drawingSvg.classList.add('panning');el.drawingSvg.setPointerCapture?.(evt.pointerId);
  }
  function moveDrawingPan(evt){
    const pan=state.ui.pan;if(!pan)return false;const d=activeDrawing();if(!d||d.id!==pan.drawingId)return false;const dx=(evt.clientX-pan.startX)*pan.vb.w/Math.max(1,el.drawingSvg.clientWidth),dy=(evt.clientY-pan.startY)*pan.vb.h/Math.max(1,el.drawingSvg.clientHeight),vb={x:pan.vb.x-dx,y:pan.vb.y-dy,w:pan.vb.w,h:pan.vb.h};state.viewBoxes.set(d.id,vb);pan.moved=pan.moved||Math.hypot(evt.clientX-pan.startX,evt.clientY-pan.startY)>2;el.drawingSvg.setAttribute('viewBox',`${vb.x} ${vb.y} ${vb.w} ${vb.h}`);const bg=el.drawingSvg.querySelector(':scope > rect');if(bg){bg.setAttribute('x',vb.x);bg.setAttribute('y',vb.y);bg.setAttribute('width',vb.w);bg.setAttribute('height',vb.h);}return true;
  }
  function endDrawingPan(){
    const pan=state.ui.pan;if(!pan)return;try{el.drawingSvg.releasePointerCapture?.(pan.pointerId);}catch(_){}el.drawingSvg.classList.remove('panning');state.ui.pan=null;if(pan.moved)state.ui.suppressClickUntil=performance.now()+250;
  }

  // ---------- Sheet composer ----------
  function createSheet(){
    const n=state.sheets.length+1; const sh={id:uid('sheet'),number:`P-${String(n).padStart(2,'0')}`,name:`Plano ${n}`,format:'A3',orientation:'landscape',project:state.projectName||'',author:'HEFESTOLAB',viewports:[]};
    state.sheets.push(sh);state.activeSheetId=sh.id;state.selectedViewportId=null;state.sheetZoom=1;renderTrees();renderSheet();renderInspector();return sh;
  }
  function sheetSize(sh){ const a=mmFormats[sh.format]||mmFormats.A3; return sh.orientation==='landscape'?[a[1],a[0]]:[a[0],a[1]]; }
  function titleBlockMetrics(sh,pw){
    const available=Math.max(80,pw-20),project=String(sh.project||state.projectName||''),name=String(sh.name||''),author=String(sh.author||'—'),longest=Math.max(project.length,name.length,author.length),w=clamp(180+Math.max(0,longest-42)*1.45,Math.min(180,available),available),projectShare=clamp(.56+Math.max(0,Math.max(project.length,name.length)-45)*.0018,.56,.70),minor=(1-projectShare)/2,charsPerLine=Math.max(18,Math.floor((w*projectShare-5)/1.22)),lines=Math.max(1,Math.ceil(Math.max(project.length,name.length)/charsPerLine)),h=34+Math.min(3,lines-1)*5;
    return {w,h,projectShare,minor};
  }
  function chooseScale(d,w,h){ const b=d.bounds||ensureDrawingBounds(d); const req=Math.max(b.width*1000/Math.max(1,w),b.height*1000/Math.max(1,h)); return standardScales.find(s=>s>=req)||Math.ceil(req/100)*100; }
  function isNonScaleDrawing(d){return d?.kind==='threeD'||d?.kind==='areaSchedule';}
  function viewportLabelOffset(vp){return {x:Number.isFinite(+vp.labelDx)?+vp.labelDx:vp.w/2,y:Number.isFinite(+vp.labelDy)?+vp.labelDy:vp.h+3.2};}
  function viewportLabelPosition(vp){const offset=viewportLabelOffset(vp);return {x:vp.x+offset.x,y:vp.y+offset.y};}
  function viewportLabelMarkup(vp,d,ppm){const offset=viewportLabelOffset(vp),scale=isNonScaleDrawing(d)?(d.kind==='areaSchedule'?'TABLA':'NTS'):`1:${vp.scale}`;return `<div class="vp-label" data-vp-label style="left:${offset.x*ppm}px;top:${offset.y*ppm}px" title="Arrastra para mover el título y la escala"><b>${esc(d.name)}</b><span>${scale}</span></div>`;}
  async function addViewToSheet(drawingId,drop=null){
    let sh=activeSheet()||createSheet(); const d=state.drawings.find(x=>x.id===drawingId); if(!d){toast('Vista no disponible','La vista ya no existe.','warn');return null;}
    if(d.pending){
      try{await projectPendingDrawing(d);renderTrees();}
      catch(err){console.error(err);toast('No se pudo generar la vista',err.message||String(err),'bad');return null;}
    }
    const [pw,ph]=sheetSize(sh),idx=sh.viewports.length;let w=Math.min(180,pw-40),h=Math.min(115,ph-80),scale=null;
    if(d.kind==='threeD'){const aspect=d.imageAspect||16/9;h=Math.min(h,w/aspect);w=Math.min(w,h*aspect);}
    else if(d.kind==='areaSchedule'){w=Math.min(150,pw-40);h=Math.min(Math.max(38,24+(d.rows?.length||0)*7),ph-80);}
    else scale=chooseScale(d,w,h);
    const x=drop?.x!=null?drop.x-w/2:20+(idx%2)*Math.min(w+10,100),y=drop?.y!=null?drop.y-h/2:18+Math.floor(idx/2)*90;
    const vp={id:uid('vp'),drawingId:d.id,x,y,w,h,scale,cx:d.bounds.cx,cy:d.bounds.cy};
    vp.x=clamp(vp.x,12,pw-vp.w-12);vp.y=clamp(vp.y,12,ph-vp.h-45); sh.viewports.push(vp);state.selectedViewportId=vp.id;setMode('sheet');renderSheet();renderInspector();toast('Vista añadida',`${d.name} · ${isNonScaleDrawing(d)?'NTS':'1:'+vp.scale}`,'good');return vp;
  }
  function viewportWindow(vp,d){ const mmPerUnit=1000/Math.max(1,+vp.scale||100); return {x:vp.cx-vp.w/(2*mmPerUnit),y:vp.cy-vp.h/(2*mmPerUnit),w:vp.w/mmPerUnit,h:vp.h/mmPerUnit,mmPerUnit}; }

  function renderSheet(){
    if(state.mode!=='sheet')return; const sh=activeSheet();
    if(!sh){el.sheetEmpty.classList.remove('hidden');el.paperHost.classList.add('hidden');return;}
    el.sheetEmpty.classList.add('hidden');el.paperHost.classList.remove('hidden');
    const [pw,ph]=sheetSize(sh); const hostW=Math.max(300,el.sheetCanvas.clientWidth-110),hostH=Math.max(250,el.sheetCanvas.clientHeight-100),basePPM=clamp(Math.min(hostW/pw,hostH/ph,2.2),.28,2.2),ppm=basePPM*clamp(state.sheetZoom,.25,6);state.paperPPM=ppm;state.paperBasePPM=basePPM;
    const margin=10,tb=titleBlockMetrics(sh,pw),tbw=tb.w,tbh=tb.h,tbx=pw-margin-tbw,tby=ph-margin-tbh;
    el.paperHost.style.width=`${Math.max(el.sheetCanvas.clientWidth,pw*ppm+110)}px`;el.paperHost.style.height=`${Math.max(el.sheetCanvas.clientHeight,ph*ppm+110)}px`;el.paperHost.dataset.zoom=String(state.sheetZoom);
    el.paperHost.innerHTML=`<div class="sheet-paper" id="sheetPaper" style="width:${pw*ppm}px;height:${ph*ppm}px" data-ppm="${ppm}">
      <div class="sheet-border" style="left:${margin*ppm}px;top:${margin*ppm}px;width:${(pw-margin*2)*ppm}px;height:${(ph-margin*2)*ppm}px"></div>
      <div class="sheet-titleblock" style="left:${tbx*ppm}px;top:${tby*ppm}px;width:${tbw*ppm}px;height:${tbh*ppm}px;grid-template-columns:${tb.projectShare}fr ${tb.minor}fr ${tb.minor}fr">
        <div class="tb-cell"><small>Proyecto</small><b title="${esc(sh.project||state.projectName)}">${esc(sh.project||state.projectName)}</b></div><div class="tb-cell"><small>Plano</small><b>${esc(sh.number)}</b></div><div class="tb-cell"><small>Formato</small><b>${esc(sh.format)} · ${sh.orientation==='landscape'?'H':'V'}</b></div>
        <div class="tb-cell"><small>Título</small><b title="${esc(sh.name)}">${esc(sh.name)}</b></div><div class="tb-cell"><small>Autor</small><b title="${esc(sh.author||'—')}">${esc(sh.author||'—')}</b></div><div class="tb-cell"><small>Software</small><b class="tb-brand">HEFESTOLAB</b></div>
      </div>
    </div>`;
    const paper=$('#sheetPaper');
    sh.viewports.forEach(vp=>paper.appendChild(makeViewportElement(vp,ppm)));
    paper.addEventListener('pointerdown',e=>{if(e.target===paper||e.target.classList.contains('sheet-border')){state.selectedViewportId=null;renderSheet();renderInspector();}});
    paper.addEventListener('dragover',e=>{if(!e.dataTransfer?.types?.includes('application/x-hefesto-view')&&!e.dataTransfer?.types?.includes('text/plain'))return;e.preventDefault();e.dataTransfer.dropEffect='copy';paper.classList.add('drop-target');});
    paper.addEventListener('dragleave',e=>{if(!paper.contains(e.relatedTarget))paper.classList.remove('drop-target');});
    paper.addEventListener('drop',e=>{e.preventDefault();paper.classList.remove('drop-target');const id=e.dataTransfer?.getData('application/x-hefesto-view')||e.dataTransfer?.getData('text/plain');if(!id)return;const r=paper.getBoundingClientRect();addViewToSheet(id,{x:(e.clientX-r.left)/ppm,y:(e.clientY-r.top)/ppm});});
  }
  function setSheetZoom(value,anchor=null){
    const canvas=el.sheetCanvas,oldWidth=Math.max(1,canvas.scrollWidth),oldHeight=Math.max(1,canvas.scrollHeight),rect=canvas.getBoundingClientRect(),localX=anchor?anchor.clientX-rect.left:canvas.clientWidth/2,localY=anchor?anchor.clientY-rect.top:canvas.clientHeight/2,ratioX=(canvas.scrollLeft+localX)/oldWidth,ratioY=(canvas.scrollTop+localY)/oldHeight;state.sheetZoom=clamp(value,.25,6);renderSheet();canvas.scrollLeft=ratioX*canvas.scrollWidth-localX;canvas.scrollTop=ratioY*canvas.scrollHeight-localY;setStatus(`Plano · zoom ${Math.round(state.sheetZoom*100)}%`,'ok');
  }
  function fitSheet(){state.sheetZoom=1;renderSheet();el.sheetCanvas.scrollLeft=Math.max(0,(el.sheetCanvas.scrollWidth-el.sheetCanvas.clientWidth)/2);el.sheetCanvas.scrollTop=Math.max(0,(el.sheetCanvas.scrollHeight-el.sheetCanvas.clientHeight)/2);setStatus('Plano encuadrado','ok');}
  function beginSheetPan(evt){
    if(state.mode!=='sheet')return;const explicit=evt.button===1||(evt.button===0&&(evt.shiftKey||state.ui.spaceDown));if(!explicit)return;evt.preventDefault();state.ui.sheetPan={pointerId:evt.pointerId,startX:evt.clientX,startY:evt.clientY,scrollLeft:el.sheetCanvas.scrollLeft,scrollTop:el.sheetCanvas.scrollTop};el.sheetCanvas.classList.add('panning');el.sheetCanvas.setPointerCapture?.(evt.pointerId);
  }
  function moveSheetPan(evt){const pan=state.ui.sheetPan;if(!pan)return;el.sheetCanvas.scrollLeft=pan.scrollLeft-(evt.clientX-pan.startX);el.sheetCanvas.scrollTop=pan.scrollTop-(evt.clientY-pan.startY);}
  function endSheetPan(){const pan=state.ui.sheetPan;if(!pan)return;try{el.sheetCanvas.releasePointerCapture?.(pan.pointerId);}catch(_){}state.ui.sheetPan=null;el.sheetCanvas.classList.remove('panning');}

  function makeViewportElement(vp,ppm){
    const d=state.drawings.find(x=>x.id===vp.drawingId); const div=document.createElement('div');div.className=`sheet-vp ${vp.id===state.selectedViewportId?'selected':''}`;div.dataset.vp=vp.id;
    div.style.cssText=`left:${vp.x*ppm}px;top:${vp.y*ppm}px;width:${vp.w*ppm}px;height:${vp.h*ppm}px`;
    if(!d){div.innerHTML='<span>Vista eliminada</span>';return div;}
    if(d.kind==='threeD'){
      div.classList.add('sheet-vp-3d');div.innerHTML=`<div class="vp-image-wrap"><img src="${d.imageData}" alt=""></div>${viewportLabelMarkup(vp,d,ppm)}<i class="vp-resize"></i>`;
    }else if(d.kind==='areaSchedule'){
      div.classList.add('sheet-vp-area-schedule');div.innerHTML=`${areaScheduleTable(d)}${viewportLabelMarkup(vp,d,ppm)}<i class="vp-resize"></i>`;
    }else{
      const win=viewportWindow(vp,d); const vis=styledSvgLines(d,false,'vp-visible'); const hid=el.toggleHidden.checked?styledSvgLines(d,true,'vp-hidden'):'';
      const ann=(d.annotations||[]).map(a=>sheetAnnotationSvg(a,d,vp)).join('');
      div.innerHTML=`<svg viewBox="${win.x} ${win.y} ${win.w} ${win.h}" preserveAspectRatio="none">${hid}${vis}${ann}</svg>${viewportLabelMarkup(vp,d,ppm)}<i class="vp-resize"></i>`;
    }
    div.addEventListener('pointerdown',e=>{
      e.stopPropagation();state.selectedViewportId=vp.id;renderInspector();
      const movingLabel=!!e.target.closest?.('[data-vp-label]'),resizing=e.target.classList.contains('vp-resize'),label=viewportLabelOffset(vp),start={x:e.clientX,y:e.clientY,vx:vp.x,vy:vp.y,vw:vp.w,vh:vp.h,labelX:label.x,labelY:label.y};div.setPointerCapture?.(e.pointerId);if(movingLabel)div.classList.add('moving-label');
      const move=ev=>{const dx=(ev.clientX-start.x)/ppm,dy=(ev.clientY-start.y)/ppm;const sh=activeSheet(),[pw,ph]=sheetSize(sh);if(movingLabel){vp.labelDx=clamp(vp.x+start.labelX+dx,10,pw-10)-vp.x;vp.labelDy=clamp(vp.y+start.labelY+dy,10,ph-10)-vp.y;}else if(resizing){vp.w=clamp(start.vw+dx,35,pw-vp.x-10);vp.h=clamp(start.vh+dy,28,ph-vp.y-10);}else{vp.x=clamp(start.vx+dx,10,pw-vp.w-10);vp.y=clamp(start.vy+dy,10,ph-vp.h-10);}renderViewportLive(div,vp,d,ppm);};
      const up=()=>{window.removeEventListener('pointermove',move);window.removeEventListener('pointerup',up);div.classList.remove('moving-label');renderSheet();renderInspector();};window.addEventListener('pointermove',move);window.addEventListener('pointerup',up,{once:true});
      div.classList.add('selected');
    }); return div;
  }
  function renderViewportLive(div,vp,d,ppm){ div.style.left=`${vp.x*ppm}px`;div.style.top=`${vp.y*ppm}px`;div.style.width=`${vp.w*ppm}px`;div.style.height=`${vp.h*ppm}px`;const label=viewportLabelOffset(vp),labelEl=div.querySelector('[data-vp-label]');if(labelEl){labelEl.style.left=`${label.x*ppm}px`;labelEl.style.top=`${label.y*ppm}px`;}if(!isNonScaleDrawing(d)){const win=viewportWindow(vp,d);div.querySelector('svg')?.setAttribute('viewBox',`${win.x} ${win.y} ${win.w} ${win.h}`);} }
  function sheetAnnotationSvg(a,d,vp){
    if(a.type==='dimension'){
      const g=dimensionGeom(a),win=viewportWindow(vp,d),fs=DIMENSION_TEXT_MM/Math.max(.001,win.mmPerUnit),text=dimensionTools.textLayout(g,fs*.4);
      return `<g><line class="vp-visible" x1="${a.a[0]}" y1="${a.a[1]}" x2="${g.q1[0]}" y2="${g.q1[1]}"/><line class="vp-visible" x1="${a.b[0]}" y1="${a.b[1]}" x2="${g.q2[0]}" y2="${g.q2[1]}"/><line class="vp-visible" x1="${g.q1[0]}" y1="${g.q1[1]}" x2="${g.q2[0]}" y2="${g.q2[1]}"/><text x="${text.x}" y="${text.y}" font-size="${fs}" text-anchor="middle" fill="#1e3a8a" transform="rotate(${text.angle} ${text.x} ${text.y})">${esc(a.textOverride||formatLength(g.L))}</text></g>`;
    }
    if(a.type==='text'){const b=d.bounds||ensureDrawingBounds(d),fs=a.size||Math.max(.18,Math.max(b.width,b.height)/90);return `<text x="${a.p[0]}" y="${a.p[1]}" font-size="${fs}" fill="#1e3a8a">${esc(a.text)}</text>`;}
    if(a.type==='area'){ensureAreaAnnotation(a);const win=viewportWindow(vp,d),fs=DIMENSION_TEXT_MM/Math.max(.001,win.mmPerUnit),pts=a.polygon.map(p=>p.join(',')).join(' '),texts=areaLabelVisible(a,d)?`<text x="${a.center[0]}" y="${a.center[1]-fs*.18}" font-size="${fs}" text-anchor="middle" fill="#075985" font-weight="700">${esc(a.number?`${a.number} · ${a.name}`:a.name)}</text><text x="${a.center[0]}" y="${a.center[1]+fs*.95}" font-size="${fs*.86}" text-anchor="middle" fill="#075985">${fmt(a.areaM2,2)} m²</text>`:'';return `<g><polygon points="${pts}" fill="rgba(14,165,233,.10)" stroke="#0284c7" stroke-width="${.15/Math.max(.001,win.mmPerUnit)}"/>${texts}</g>`;} return '';
  }

  // ---------- PDF / SVG / DXF ----------
  function clipLine(x0,y0,x1,y1,xmin,ymin,xmax,ymax){
    let t0=0,t1=1,dx=x1-x0,dy=y1-y0; const p=[-dx,dx,-dy,dy],q=[x0-xmin,xmax-x0,y0-ymin,ymax-y0];
    for(let i=0;i<4;i++){if(p[i]===0){if(q[i]<0)return null;}else{const r=q[i]/p[i];if(p[i]<0){if(r>t1)return null;if(r>t0)t0=r;}else{if(r<t0)return null;if(r<t1)t1=r;}}}
    return [x0+t0*dx,y0+t0*dy,x0+t1*dx,y0+t1*dy];
  }
  function pdfMap(vp,d,x,y){ const win=viewportWindow(vp,d); return [vp.x+(x-win.x)*win.mmPerUnit,vp.y+(y-win.y)*win.mmPerUnit]; }
  function hexRgb(hex){const n=parseInt(String(hex||'').replace('#',''),16);return Number.isFinite(n)?[(n>>16)&255,(n>>8)&255,n&255]:null;}
  function pdfDrawDrawing(doc,d,vp,hidden=false){
    doc.setLineWidth(hidden?.10:.16);doc.setLineDashPattern(hidden?[1.2,1.0]:[],0);
    for(const group of drawingLayers(d,hidden)){const rgb=group.style&&hexRgb(group.style.color);doc.setDrawColor(...(rgb||(hidden?[145,155,166]:[20,25,32])));for(const s of group.segments){const a=pdfMap(vp,d,s[0],s[1]),b=pdfMap(vp,d,s[2],s[3]);const c=clipLine(a[0],a[1],b[0],b[1],vp.x,vp.y,vp.x+vp.w,vp.y+vp.h);if(c)doc.line(c[0],c[1],c[2],c[3]);}}
    doc.setLineDashPattern([],0);doc.setDrawColor(20,25,32);
  }
  function pdfDrawAnnotations(doc,d,vp){
    doc.setDrawColor(37,99,235);doc.setTextColor(30,58,138);doc.setLineWidth(.13);
    for(const a of d.annotations||[]){
      if(a.type==='dimension'){
        const g=dimensionGeom(a),win=viewportWindow(vp,d),modelText=DIMENSION_TEXT_MM/Math.max(.001,win.mmPerUnit),layout=dimensionTools.textLayout(g,modelText*.4);const p1=pdfMap(vp,d,a.a[0],a.a[1]),p2=pdfMap(vp,d,a.b[0],a.b[1]),q1=pdfMap(vp,d,g.q1[0],g.q1[1]),q2=pdfMap(vp,d,g.q2[0],g.q2[1]),text=pdfMap(vp,d,layout.x,layout.y);
        doc.setFontSize(DIMENSION_TEXT_POINTS);if(clipLine(q1[0],q1[1],q2[0],q2[1],vp.x,vp.y,vp.x+vp.w,vp.y+vp.h)){doc.line(p1[0],p1[1],q1[0],q1[1]);doc.line(p2[0],p2[1],q2[0],q2[1]);doc.line(q1[0],q1[1],q2[0],q2[1]);doc.text(a.textOverride||formatLength(g.L),text[0],text[1],{align:'center',angle:-layout.angle});}
      }else if(a.type==='text'){doc.setFontSize(7);const p=pdfMap(vp,d,a.p[0],a.p[1]);if(p[0]>=vp.x&&p[0]<=vp.x+vp.w&&p[1]>=vp.y&&p[1]<=vp.y+vp.h)doc.text(a.text,p[0],p[1]);}
      else if(a.type==='area'){ensureAreaAnnotation(a);doc.setDrawColor(2,132,199);doc.setLineWidth(.16);for(let i=0;i<a.polygon.length;i++){const p=pdfMap(vp,d,...a.polygon[i]),q=pdfMap(vp,d,...a.polygon[(i+1)%a.polygon.length]);doc.line(p[0],p[1],q[0],q[1]);}if(areaLabelVisible(a,d)){const c=pdfMap(vp,d,...a.center);doc.setTextColor(7,89,133);doc.setFont('helvetica','bold');doc.setFontSize(DIMENSION_TEXT_POINTS);doc.text(a.number?`${a.number} · ${a.name}`:a.name,c[0],c[1]-.8,{align:'center'});doc.setFont('helvetica','normal');doc.text(`${fmt(a.areaM2,2)} m²`,c[0],c[1]+1.8,{align:'center'});}}
    }
    doc.setTextColor(0,0,0);doc.setDrawColor(20,25,32);
  }
  function pdfDraw3DView(doc,d,vp){
    if(!d?.imageData)return;const aspect=d.imageAspect||((d.imageWidth||16)/Math.max(1,d.imageHeight||9));let w=vp.w,h=w/aspect;if(h>vp.h){h=vp.h;w=h*aspect;}const x=vp.x+(vp.w-w)/2,y=vp.y+(vp.h-h)/2;
    doc.setFillColor(255,255,255);doc.rect(vp.x,vp.y,vp.w,vp.h,'F');doc.addImage(d.imageData,d.imageFormat||'JPEG',x,y,w,h,undefined,'FAST');doc.setDrawColor(180,188,198);doc.setLineWidth(.12);doc.rect(vp.x,vp.y,vp.w,vp.h);
  }
  function pdfDrawAreaSchedule(doc,d,vp){
    const rows=d.rows||[],titleH=8,headH=7,rowH=Math.min(7,Math.max(.1,(vp.h-titleH-headH-.2)/Math.max(1,rows.length))),bodyFont=Math.min(5.5,Math.max(3.8,rowH*.82)),cols=[vp.x,vp.x+vp.w*.12,vp.x+vp.w*.65,vp.x+vp.w*.81,vp.x+vp.w],y0=vp.y;doc.setDrawColor(15,23,42);doc.setLineWidth(.14);doc.setFillColor(226,232,240);doc.rect(vp.x,y0,vp.w,titleH,'FD');doc.setFont('helvetica','bold');doc.setFontSize(7);doc.setTextColor(15,23,42);doc.text(d.name||'Cuadro de áreas',vp.x+2,y0+5.2);let y=y0+titleH;const headers=['Nº','ESTANCIA','ORIGEN','ÁREA'];for(let i=0;i<4;i++){doc.setFillColor(241,245,249);doc.rect(cols[i],y,cols[i+1]-cols[i],headH,'FD');doc.setFontSize(5.5);doc.text(headers[i],i===3?cols[i+1]-2:cols[i]+2,y+4.7,{align:i===3?'right':'left'});}y+=headH;doc.setFont('helvetica','normal');for(let r=0;r<rows.length;r++,y+=rowH){const row=rows[r],values=[row.number||String(r+1).padStart(2,'0'),row.name||'Estancia',row.source==='IFC'?'IFC':'Manual',`${fmt(row.areaM2,2)} m²`];for(let i=0;i<4;i++){doc.rect(cols[i],y,cols[i+1]-cols[i],rowH);doc.setFontSize(bodyFont);const value=doc.splitTextToSize(String(values[i]),Math.max(2,cols[i+1]-cols[i]-4))[0]||'';doc.text(value,i===3?cols[i+1]-2:cols[i]+2,y+rowH*.68,{align:i===3?'right':'left'});}}doc.setTextColor(0);doc.setFont('helvetica','normal');
  }
  function pdfTitleCell(doc,label,value,x,y,w,h,color=[20,20,20]){
    doc.setFont('helvetica','normal');doc.setFontSize(5);doc.setTextColor(80);doc.text(label,x+2,y+4);let size=7,lines=[];const text=String(value??'—'),maxWidth=Math.max(4,w-4),available=Math.max(3,h-6);
    while(size>=5.2){doc.setFontSize(size);lines=doc.splitTextToSize(text,maxWidth);if(lines.length*size*25.4/72*1.08<=available)break;size-=.25;}
    doc.setFont('helvetica','bold');doc.setFontSize(Math.max(5.2,size));doc.setTextColor(...color);doc.text(lines,x+2,y+8,{lineHeightFactor:1.08});
  }
  function pdfTitleBlock(doc,sh,pw,ph){
    const m=10,tb=titleBlockMetrics(sh,pw),w=tb.w,h=tb.h,x=pw-m-w,y=ph-m-h,row=h/2,c1=w*tb.projectShare,c2=w*tb.minor,c3=w-c1-c2;doc.setLineWidth(.18);doc.setDrawColor(15,23,42);doc.rect(x,y,w,h);doc.line(x,y+row,x+w,y+row);doc.line(x+c1,y,x+c1,y+h);doc.line(x+c1+c2,y,x+c1+c2,y+h);
    pdfTitleCell(doc,'PROYECTO',sh.project||state.projectName,x,y,c1,row);pdfTitleCell(doc,'PLANO',sh.number,x+c1,y,c2,row);pdfTitleCell(doc,'FORMATO',`${sh.format} ${sh.orientation==='landscape'?'H':'V'}`,x+c1+c2,y,c3,row);pdfTitleCell(doc,'TÍTULO',sh.name,x,y+row,c1,row);pdfTitleCell(doc,'AUTOR',sh.author||'—',x+c1,y+row,c2,row);pdfTitleCell(doc,'SOFTWARE','HEFESTOLAB',x+c1+c2,y+row,c3,row,[8,121,232]);doc.setTextColor(0);
  }
  async function exportPdf(){
    const sh=activeSheet(); if(!sh){toast('No hay plano','Crea un plano antes de exportar.','warn');return;} const jspdf=window.jspdf;if(!jspdf?.jsPDF){toast('PDF no disponible','No se ha cargado jsPDF.','bad');return;}
    showProgress('Exportando PDF','Dibujando geometría vectorial',.05);await new Promise(r=>setTimeout(r,30));
    try{
      const [pw,ph]=sheetSize(sh);const doc=new jspdf.jsPDF({unit:'mm',format:[pw,ph],orientation:pw>ph?'landscape':'portrait',compress:true});doc.setLineJoin('miter');doc.setLineCap('butt');doc.setDrawColor(15,23,42);doc.setLineWidth(.18);doc.rect(10,10,pw-20,ph-20);
      let i=0;for(const vp of sh.viewports){const d=state.drawings.find(x=>x.id===vp.drawingId);if(!d||d.pending)continue;updateProgress(`${d.name} · ${d.kind==='threeD'?'imagen 3D':d.kind==='areaSchedule'?'tabla':'líneas visibles'}`,.1+(i/Math.max(1,sh.viewports.length))*.72);if(d.kind==='threeD')pdfDraw3DView(doc,d,vp);else if(d.kind==='areaSchedule')pdfDrawAreaSchedule(doc,d,vp);else{pdfDrawDrawing(doc,d,vp,false);if(el.toggleHidden.checked)pdfDrawDrawing(doc,d,vp,true);pdfDrawAnnotations(doc,d,vp);}const label=viewportLabelPosition(vp);doc.setFontSize(6);doc.setFont('helvetica','bold');doc.text(d.name,label.x,label.y,{align:'center'});doc.setFont('helvetica','normal');doc.text(isNonScaleDrawing(d)?(d.kind==='areaSchedule'?'TABLA':'NTS'):`1:${vp.scale}`,label.x,label.y+2.9,{align:'center'});i++;}
      pdfTitleBlock(doc,sh,pw,ph);updateProgress('Generando archivo',.93);doc.setProperties({title:`${sh.number} · ${sh.name}`,subject:'HEFESTOLAB IFC Drawing',creator:'HEFESTOLAB IFC Drawing'});doc.save(`${safeName(sh.number+'_'+sh.name)}.pdf`);hideProgress('PDF exportado');toast('PDF generado','Documento vectorial descargado.','good');
    }catch(err){console.error(err);el.progress.classList.add('hidden');setStatus('Error al exportar PDF','error');toast('Error PDF',err.message||String(err),'bad');}
  }
  function standaloneSvg(d){
    if(d.kind==='areaSchedule'){const b=scheduleBounds(d);return `<?xml version="1.0" encoding="UTF-8"?><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${b.width} ${b.height}"><style>.schedule-head{fill:#e2e8f0;stroke:#0f172a;stroke-width:.02}.schedule-cell{fill:#fff;stroke:#0f172a;stroke-width:.02}.schedule-title{font:bold .28px Arial;fill:#0f172a}.schedule-text{font:.28px Arial;fill:#0f172a}.schedule-area{text-anchor:end}</style>${areaScheduleSvg(d)}</svg>`;}
    const b=d.bounds||ensureDrawingBounds(d),pad=Math.max(b.width,b.height)*.03+.1,vb={x:b.minX-pad,y:b.minY-pad,w:b.width+2*pad,h:b.height+2*pad};
    const layerSvg=(hidden)=>drawingLayers(d,hidden).map(g=>`<g fill="none" stroke="${g.style?esc(g.style.color):(hidden?'#94a3b8':'#111827')}" stroke-width="${hidden?'.013':'.02'}"${hidden?' stroke-dasharray=".18 .14"':''} vector-effect="non-scaling-stroke">${g.segments.map(s=>`<line x1="${s[0]}" y1="${s[1]}" x2="${s[2]}" y2="${s[3]}"/>`).join('')}</g>`).join('');
    const vis=layerSvg(false),hid=el.toggleHidden.checked?layerSvg(true):'',ann=(d.annotations||[]).map(a=>annotationSvg(a,d)).join('');
    return `<?xml version="1.0" encoding="UTF-8"?><svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb.x} ${vb.y} ${vb.w} ${vb.h}"><rect x="${vb.x}" y="${vb.y}" width="${vb.w}" height="${vb.h}" fill="white"/>${hid}${vis}<style>.dim-line,.dim-ext{stroke:#2563eb;stroke-width:.018;fill:none}.dim-text,.note-text{fill:#1e3a8a;font-family:Arial,sans-serif}.area-fill{fill:#e0f2fe;stroke:#0284c7;stroke-width:.018}.area-label{fill:#075985;font-family:Arial,sans-serif;font-weight:bold;text-anchor:middle}</style>${ann}</svg>`;
  }
  function exportSvg(){const d=activeDrawing();if(!d||d.pending||d.kind==='threeD'){toast('SVG no disponible','Selecciona una vista 2D vectorial. Las vistas 3D se exportan dentro del PDF.','warn');return;}downloadBlob(standaloneSvg(d),`${safeName(d.name)}.svg`,'image/svg+xml');toast('SVG exportado',d.name,'good');}
  function dxfLine(layer,s,color=null){const trueColor=color?parseInt(String(color).replace('#',''),16):null;return `0\nLINE\n8\n${layer}\n${Number.isFinite(trueColor)?`420\n${trueColor}\n`:''}10\n${s[0]}\n20\n${-s[1]}\n30\n0\n11\n${s[2]}\n21\n${-s[3]}\n31\n0\n`;}
  function exportDxf(){
    const d=activeDrawing();if(!d||d.pending||isNonScaleDrawing(d)){toast('DXF no disponible','Selecciona una vista 2D vectorial de planta, alzado o sección.','warn');return;}
    let e='';for(const group of drawingLayers(d,false))for(const s of group.segments)e+=dxfLine(group.style?.layer||'VISIBLE',s,group.style?.color);if(el.toggleHidden.checked)for(const group of drawingLayers(d,true))for(const s of group.segments)e+=dxfLine(group.style?.layer?`${group.style.layer}_HIDDEN`:'HIDDEN',s,group.style?.color);
    for(const a of d.annotations||[]){if(a.type==='dimension'){const g=dimensionGeom(a);e+=dxfLine('DIMENSIONS',[a.a[0],a.a[1],g.q1[0],g.q1[1]])+dxfLine('DIMENSIONS',[a.b[0],a.b[1],g.q2[0],g.q2[1]])+dxfLine('DIMENSIONS',[g.q1[0],g.q1[1],g.q2[0],g.q2[1]]);e+=`0\nTEXT\n8\nDIMENSIONS\n10\n${g.mid[0]}\n20\n${-g.mid[1]}\n30\n0\n40\n0.2\n1\n${a.textOverride||formatLength(g.L)}\n`;}else if(a.type==='text'){e+=`0\nTEXT\n8\nANNOTATION\n10\n${a.p[0]}\n20\n${-a.p[1]}\n30\n0\n40\n0.22\n1\n${a.text.replace(/[\r\n]+/g,' ')}\n`;}else if(a.type==='area'){ensureAreaAnnotation(a);for(let i=0;i<a.polygon.length;i++){const p=a.polygon[i],q=a.polygon[(i+1)%a.polygon.length];e+=dxfLine('AREAS',[p[0],p[1],q[0],q[1]],'#0284c7');}if(areaLabelVisible(a,d))e+=`0\nTEXT\n8\nAREAS\n10\n${a.center[0]}\n20\n${-a.center[1]}\n30\n0\n40\n0.22\n1\n${String(a.number?`${a.number} - ${a.name}`:a.name).replace(/[\r\n]+/g,' ')} ${fmt(a.areaM2,2)} m2\n`;}}
    const dxf=`0\nSECTION\n2\nHEADER\n9\n$INSUNITS\n70\n6\n0\nENDSEC\n0\nSECTION\n2\nENTITIES\n${e}0\nENDSEC\n0\nEOF\n`;downloadBlob(dxf,`${safeName(d.name)}.dxf`,'application/dxf');toast('DXF 2D exportado','Unidades de modelo: metros.','good');
  }
  function downloadBlob(data,name,type='application/octet-stream'){const b=data instanceof Blob?data:new Blob([data],{type});const u=URL.createObjectURL(b);const a=document.createElement('a');a.href=u;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(u),1500);}

  // ---------- Save / reopen project ----------
  function displayToJson(display){const d=display||{};return {hiddenCategories:[...(d.hiddenCategories||[])],hiddenItems:[...(d.hiddenItems||[])],categoryColors:[...(d.categoryColors||[])],itemColors:[...(d.itemColors||[])]};}
  function displayFromJson(display={}){return {hiddenCategories:new Set(display.hiddenCategories||[]),hiddenItems:new Set(display.hiddenItems||[]),categoryColors:new Map(display.categoryColors||[]),itemColors:new Map(display.itemColors||[])};}
  function drawingToJson(d){const out={...d,display:displayToJson(d.display),snapIndex:null};delete out._projecting;delete out.selectionSegments;return out;}
  function serializeProject(){
    return {schema:PROJECT_SCHEMA,version:PROJECT_VERSION,savedAt:new Date().toISOString(),application:'HEFESTO IFC Drawing',projectName:state.projectName,source:{name:state.source,meta:state.sourceMeta},levels:state.levels,drawings:state.drawings.map(drawingToJson),sheets:state.sheets,activeDrawingId:state.activeDrawingId,activeSheetId:state.activeSheetId,viewBoxes:[...state.viewBoxes.entries()],preferences:{hiddenLines:!!el.toggleHidden.checked},note:'El IFC original no se incrusta. Usa Reconectar IFC al reabrir para continuar creando vistas. Las vistas vectoriales, planos, áreas, cuadros y cotas sí quedan guardados.'};
  }
  function saveProject(){
    if(!state.drawings.length&&!state.sheets.length){toast('Proyecto vacío','Carga un IFC, abre la demo o crea documentación antes de guardar.','warn');return;}const data=serializeProject(),name=`${safeName(state.projectName||'Proyecto')}_IFC_Drawing.hefesto-drawing.json`;downloadBlob(JSON.stringify(data,null,2),name,'application/json');toast('Proyecto guardado',`${state.drawings.length} vistas · ${state.sheets.length} planos`,'good');setStatus('Proyecto guardado','ok');
  }
  function assertProjectData(data){if(!data||data.schema!==PROJECT_SCHEMA||+data.version!==PROJECT_VERSION)throw new Error('El archivo no es un proyecto compatible de HEFESTO IFC Drawing.');if(!Array.isArray(data.drawings)||!Array.isArray(data.sheets)||!Array.isArray(data.levels))throw new Error('El proyecto está incompleto o dañado.');}
  async function applyProject(data,fileName='proyecto'){assertProjectData(data);await clearIfcSelection();if(state.engine)for(const [modelId] of [...state.engine.fragments.list]){try{state.engine.fragments.core.disposeModel(modelId);}catch(_){ }}
    state.modelLoaded=false;state.modelBox=null;state.modelBoxSource=null;state.activeModelId=null;state.ifcModels=0;state.geometryMap={};state.ifcCategories=[];state.categoryItems=new Map();state.itemCategories=new Map();state.demo=false;state.source=data.source?.name||fileName;state.sourceMeta=data.source?.meta||{schema:'PROYECTO',size:0,storeys:[]};state.projectName=String(data.projectName||safeName(fileName)||'Proyecto HEFESTO');state.levels=data.levels.map(l=>({...l}));state.drawings=[];setProjectDetached(true);
    for(const raw of data.drawings){const d={...raw,visible:Array.isArray(raw.visible)?raw.visible:[],hidden:Array.isArray(raw.hidden)?raw.hidden:[],annotations:Array.isArray(raw.annotations)?raw.annotations:[],display:displayFromJson(raw.display),snapIndex:null,pending:!!raw.pending};addDrawing(d);}
    state.sheets=data.sheets.map(sh=>({...sh,viewports:Array.isArray(sh.viewports)?sh.viewports.map(vp=>({...vp})):[]}));state.viewBoxes=new Map((data.viewBoxes||[]).filter(pair=>Array.isArray(pair)&&pair.length===2&&pair[1]&&Number.isFinite(+pair[1].w)&&Number.isFinite(+pair[1].h)));state.activeDrawingId=state.drawings.some(d=>d.id===data.activeDrawingId)?data.activeDrawingId:(state.drawings[0]?.id||null);state.activeSheetId=state.sheets.some(sh=>sh.id===data.activeSheetId)?data.activeSheetId:(state.sheets[0]?.id||null);state.selectedViewportId=null;state.selectedAnnotationId=null;state.pendingDimension=null;state.pendingDimensionChain=null;state.pendingArea=null;state.sheetZoom=1;el.toggleHidden.checked=data.preferences?.hiddenLines!==false;el.projectName.textContent=state.projectName;el.fileMeta.textContent=`Proyecto HEFESTO · ${state.drawings.length} vistas · ${state.sheets.length} planos`;el.modelBadge.textContent='PROYECTO GUARDADO · IFC NO INCRUSTADO';el.engineHint.textContent='Documentación reabierta · usa Reconectar IFC para continuar';el.start.classList.add('hidden');renderTrees();if(state.activeSheetId)setMode('sheet');else if(state.activeDrawingId)await activateDrawing(state.activeDrawingId);else setMode('model');renderDrawing();renderSheet();renderInspector();setStatus('Proyecto reabierto · IFC pendiente','ok');toast('Proyecto reabierto',`${state.drawings.length} vistas · ${state.sheets.length} planos · reconecta ${state.source||'el IFC original'} para continuar.`,'good');
  }
  async function openProjectFile(file){if(!file)return;try{const data=JSON.parse(await file.text());await applyProject(data,file.name);}catch(err){console.error(err);toast('No se pudo abrir el proyecto',err.message||String(err),'bad');setStatus('Proyecto no válido','error');}finally{if(el.projectInput)el.projectInput.value='';}}

  // ---------- Demo ----------
  function demoPlan(){
    const v=[];const h=[];const L=(x1,y1,x2,y2)=>v.push([x1,y1,x2,y2]);
    // envelope, internal partitions, openings and columns
    [[0,0,20,0],[20,0,20,12],[20,12,0,12],[0,12,0,0],[0.28,.28,19.72,.28],[19.72,.28,19.72,11.72],[19.72,11.72,.28,11.72],[.28,11.72,.28,.28]].forEach(s=>L(...s));
    L(7,0.28,7,5.1);L(7,6.1,7,11.72);L(13,.28,13,7.6);L(13,8.6,13,11.72);L(.28,6,4.8,6);L(5.8,6,12.9,6);L(13.1,6,19.72,6);
    for(const x of [3.5,10,16.5])for(const y of [3,9]){const r=.18;L(x-r,y-r,x+r,y-r);L(x+r,y-r,x+r,y+r);L(x+r,y+r,x-r,y+r);L(x-r,y+r,x-r,y-r);}
    // door arcs represented as chords/simple openings
    h.push([7,5.1,8,4.1],[13,7.6,14,6.6],[4.8,6,5.8,5]);
    const d={name:'Planta nivel 0 · Demo',kind:'plan',visible:v,hidden:h,annotations:[]};ensureDrawingBounds(d);
    d.annotations.push({id:uid('dim'),type:'dimension',a:[0,0],b:[20,0],offset:-1.1},{id:uid('dim'),type:'dimension',a:[0,0],b:[0,12],offset:1.0},{id:uid('text'),type:'text',p:[1.1,2.2],text:'SALA TÉCNICA'});return d;
  }
  function demoSection(){const v=[];const L=(...s)=>v.push(s);L(0,8,20,8);L(0,8,0,0);L(20,8,20,0);L(0,0,20,0);L(0,3.2,20,3.2);L(0,6.4,20,6.4);for(const x of [3.5,10,16.5]){L(x-.18,8,x-.18,0);L(x+.18,8,x+.18,0);}L(0,8,10,11);L(10,11,20,8);const d={name:'Sección A-A · Demo',kind:'section',visible:v,hidden:[],annotations:[]};ensureDrawingBounds(d);d.annotations.push({id:uid('dim'),type:'dimension',a:[0,0],b:[0,8],offset:-1},{id:uid('text'),type:'text',p:[8.1,10.2],text:'CUBIERTA'});return d;}
  function demoElevation(){const v=[];const L=(...s)=>v.push(s);L(0,8,0,0);L(20,8,20,0);L(0,0,20,0);L(0,8,10,11);L(10,11,20,8);for(const x of [3.5,10,16.5]){L(x,0,x,8);}L(2,0,2,2.4);L(5,0,5,2.4);L(2,2.4,5,2.4);const d={name:'Alzado norte · Demo',kind:'elevation',visible:v,hidden:[[0,3.2,20,3.2],[0,6.4,20,6.4]],annotations:[]};ensureDrawingBounds(d);return d;}
  function loadDemo(){
    state.demo=true;state.source='demo';state.projectName='HEFESTO · Proyecto de demostración';state.sourceMeta={schema:'DEMO',size:0,storeys:[{id:'d0',name:'Nivel 0',elevation:0},{id:'d1',name:'Nivel 1',elevation:3.2},{id:'d2',name:'Nivel 2',elevation:6.4}]};syncLevelsFromMeta(state.sourceMeta.storeys);state.drawings=[];state.sheets=[];state.activeSheetId=null;state.activeDrawingId=null;state.modelLoaded=false;state.sheetZoom=1;setProjectDetached(false);
    const p=addDrawing(demoPlan()),s=addDrawing(demoSection()),e=addDrawing(demoElevation());state.activeDrawingId=p.id;fitViewBox(p);fitViewBox(s);fitViewBox(e);
    const sh=createSheet();sh.project='HEFESTOLAB · Proyecto demo';sh.name='Planta y sección';addViewDirect(sh,p,{x:18,y:20,w:180,h:105});addViewDirect(sh,s,{x:215,y:20,w:180,h:105});
    el.projectName.textContent=state.projectName;el.fileMeta.textContent='Demo vectorial · sin IFC';el.engineHint.textContent='Demo vectorial · el modelo 3D no se carga';el.modelBadge.textContent='DEMO · SIN MODELO 3D';renderTrees();setMode('drawing');renderDrawing();toast('Demo cargada','Prueba cotas, anotaciones, planos y exportación PDF.','good');setStatus('Demo lista','ok');
  }
  function addViewDirect(sh,d,pos){const vp={id:uid('vp'),drawingId:d.id,x:pos.x,y:pos.y,w:pos.w,h:pos.h,scale:chooseScale(d,pos.w,pos.h),cx:d.bounds.cx,cy:d.bounds.cy};sh.viewports.push(vp);return vp;}

  // ---------- Modelo 3D / encuadre robusto ----------
  function validModelBox(box){
    if(!box?.min||!box?.max)return false;
    const values=[box.min.x,box.min.y,box.min.z,box.max.x,box.max.y,box.max.z];
    if(!values.every(Number.isFinite))return false;
    return box.max.x>=box.min.x && box.max.y>=box.min.y && box.max.z>=box.min.z;
  }
  function modelBoxSize(box=state.modelBox){
    if(!validModelBox(box))return {x:0,y:0,z:0,max:0};
    const x=Math.max(0,box.max.x-box.min.x),y=Math.max(0,box.max.y-box.min.y),z=Math.max(0,box.max.z-box.min.z);
    return {x,y,z,max:Math.max(x,y,z)};
  }
  function modelBoxText(box=state.modelBox){
    const s=modelBoxSize(box);return validModelBox(box)?`${fmt(s.x,2)} × ${fmt(s.y,2)} × ${fmt(s.z,2)} m`:'extensión no disponible';
  }
  async function refreshFragmentsAfterCamera(){
    try{await state.engine?.fragments?.core?.update?.(true);}catch(err){console.warn('Fragments update:',err);}
  }
  function fitModelImmediate(showToast=false){
    const engine=state.engine,box=state.modelBox;
    if(!engine||!validModelBox(box)){if(showToast)toast('No se puede encuadrar','El modelo no dispone de una extensión 3D válida.','warn');return false;}
    try{
      // No esperar una transición animada. En algunos modelos/CameraControls la
      // promesa de fitToBox(..., true) no emite nunca el evento de fin y dejaba
      // la carga detenida aunque IFC -> Fragments ya hubiera terminado.
      const result=engine.world.camera.controls.fitToBox(box,false);
      Promise.resolve(result).catch(err=>console.warn('fitToBox:',err));
      requestAnimationFrame(()=>refreshFragmentsAfterCamera());
      if(showToast)toast('Modelo encuadrado',modelBoxText(box),'good');
      return true;
    }catch(err){
      console.warn('fitToBox inmediato:',err);
      // Fallback sin Box3 helpers: posición isométrica calculada con min/max.
      try{
        const cx=(box.min.x+box.max.x)/2,cy=(box.min.y+box.max.y)/2,cz=(box.min.z+box.max.z)/2;
        const span=Math.max(modelBoxSize(box).max,1);
        const result=engine.world.camera.controls.setLookAt(cx+span*1.15,cy+span*.78,cz+span*1.15,cx,cy,cz,false);
        Promise.resolve(result).catch(()=>{});requestAnimationFrame(()=>refreshFragmentsAfterCamera());
        if(showToast)toast('Modelo encuadrado','Se ha utilizado el encuadre alternativo.','good');
        return true;
      }catch(err2){console.error(err2);if(showToast)toast('No se pudo encuadrar',err2.message||String(err2),'bad');return false;}
    }
  }

  async function capture3DView(name=null){
    if(!state.engine||!state.modelLoaded){toast('Sin modelo 3D','Carga primero un IFC real.','warn');return null;}
    setMode('model');const {world,fragments,grid}=state.engine;showProgress('Capturando vista 3D','Preparando imagen del visor',.2);
    try{
      try{world.renderer.resize();}catch(_){ }
      await refreshFragmentsAfterCamera();await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
      const prevGrid=grid?.visible;if(grid)grid.visible=false;
      try{await refreshFragmentsAfterCamera();}catch(_){ }
      const threeRenderer=world.renderer?.three,canvas=threeRenderer?.domElement||el.viewer.querySelector('canvas');
      if(!canvas||!canvas.width||!canvas.height)throw new Error('El canvas 3D no tiene dimensiones válidas.');
      try{threeRenderer?.render?.(world.scene.three,world.camera.three);}catch(_){ }
      const out=document.createElement('canvas');out.width=canvas.width;out.height=canvas.height;const ctx=out.getContext('2d');if(!ctx)throw new Error('No se pudo crear la imagen 3D.');ctx.fillStyle='#ffffff';ctx.fillRect(0,0,out.width,out.height);ctx.drawImage(canvas,0,0);
      if(grid)grid.visible=prevGrid!==false;requestAnimationFrame(()=>refreshFragmentsAfterCamera());
      const imageData=out.toDataURL('image/jpeg',.92);if(!imageData||imageData.length<1000)throw new Error('La captura 3D resultó vacía.');
      const n=state.drawings.filter(x=>x.kind==='threeD').length+1;const d=addDrawing({name:name||`Vista 3D · ${n}`,kind:'threeD',imageData,imageFormat:'JPEG',imageWidth:out.width,imageHeight:out.height,imageAspect:out.width/out.height,createdAt:new Date().toISOString(),pending:false});
      state.activeDrawingId=d.id;renderTrees();hideProgress('Vista 3D capturada');toast('Vista 3D creada',`${d.name} · ${out.width} × ${out.height} px`,'good');return d;
    }catch(err){if(grid)try{grid.visible=true;}catch(_){ }console.error(err);el.progress.classList.add('hidden');setStatus('Error al capturar vista 3D','error');toast('No se pudo capturar la vista 3D',err.message||String(err),'bad');return null;}
  }
  function capture3DViewDialog(){
    if(!state.modelLoaded){toast('Sin modelo 3D','Carga primero un IFC real.','warn');return;}const n=state.drawings.filter(x=>x.kind==='threeD').length+1;
    showModal({title:'Crear vista 3D',html:`<div class="modal-note">Se guardará una instantánea de la <b>cámara 3D actual</b>, sin la rejilla, para colocarla en uno o varios planos. La vista se considera <b>NTS (sin escala)</b>.</div><div class="form-grid"><div class="form-group full"><label>Nombre</label><input id="view3dName" value="Vista 3D · ${n}"></div></div>`,actions:[{label:'Cancelar',onClick:closeModal},{label:'Capturar',primary:true,onClick:async()=>{const name=$('#view3dName').value.trim()||`Vista 3D · ${n}`;closeModal();await capture3DView(name);}}]});
  }

  // ---------- IFC engine ----------
  function ifcPhaseLabel(info={}){
    const proc=String(info.process||'').toLowerCase();
    if(proc.includes('geom'))return 'geometría';if(proc.includes('prop'))return 'propiedades';if(proc.includes('convert'))return 'conversión';return proc||'conversión IFC';
  }
  function mapIfcProgress(progress,info={}){
    const p=clamp(Number(progress)||0,0,1),proc=String(info.process||'').toLowerCase();
    if(proc.includes('geom'))return .43+p*.34;
    if(proc.includes('prop'))return .77+p*.13;
    if(proc.includes('convert'))return .90+p*.055;
    return .43+p*.47;
  }
  function ifcProgressText(progress,info={}){
    const phase=ifcPhaseLabel(info),pct=Math.round(clamp(Number(progress)||0,0,1)*100);let detail='';
    if(info.class!=null)detail+=` · clase ${info.class}`;if(info.entitiesProcessed!=null)detail+=` · ${Number(info.entitiesProcessed).toLocaleString('es-ES')} entidades`;
    return `${phase[0].toUpperCase()+phase.slice(1)} · ${pct}%${detail}`;
  }
  function modelById(modelId){
    const list=state.engine?.fragments?.list;if(!list)return null;let model=list.get?.(modelId);if(model)return model;
    for(const [key,value] of list)if(String(key)===String(modelId)||String(value?.modelId)===String(modelId))return value;return null;
  }
  function clearDrawingSelectionHighlights(){for(const d of state.drawings)delete d.selectionSegments;}
  async function clearIfcSelection(){
    const prev=state.selectedIfc;if(prev){const model=modelById(prev.modelId);try{await model?.resetHighlight?.([prev.localId]);}catch(_){ }}
    state.selectedIfc=null;clearDrawingSelectionHighlights();if(el.statusSelection)el.statusSelection.textContent='Sin selección';syncAgentState();
  }
  async function syncSelectedIfcProjection(d){
    const selection=state.selectedIfc;if(!selection||!d||d.pending||isNonScaleDrawing(d)||!state.engine||!state.modelLoaded){if(d)delete d.selectionSegments;return;}
    const allowed=drawingProjectionMap(d),ids=allowed[String(selection.modelId)];let localId=ids&&[...ids].find(id=>String(id)===String(selection.localId));
    if(localId===undefined){delete d.selectionSegments;return;}
    try{const projected=await projectMap({[String(selection.modelId)]:new Set([localId])},d);d.selectionSegments={key:selection.key,visible:projected.visible,hidden:projected.hidden};}
    catch(err){console.warn('Resaltado de selección 2D:',err);delete d.selectionSegments;}
  }
  async function selectIfcItem(modelId,localId,model=null){
    if(localId===undefined||localId===null){await clearIfcSelection();renderInspector();renderDrawing();return;}
    await clearIfcSelection();model=model||modelById(modelId);let guid=null;
    if(model)for(const [key,value] of state.engine?.fragments?.list||[])if(value===model||String(value?.modelId)===String(model?.modelId)){modelId=key;break;}
    try{guid=(await model?.getGuidsByLocalIds?.([localId]))?.[0]||null;}catch(_){ }
    const key=itemKey(modelId,localId),category=state.itemCategories.get(key)||'Sin categoría';state.selectedIfc={modelId,localId,guid,category,key};
    try{await model?.highlight?.([localId],{color:{isColor:true,r:1,g:.72,b:.10},renderedFaces:1,opacity:1,transparent:false});}catch(_){ }
    if(el.statusSelection)el.statusSelection.textContent=`${String(category).replace(/^IFC/,'')} · #${localId}`;state.selectedLevelId=null;
    const d=activeDrawing();if(d)await syncSelectedIfcProjection(d);renderTrees();renderDrawing();renderInspector();refreshFragmentsAfterCamera();
  }
  async function selectIfcHit(hit){
    if(!hit||hit.localId===undefined||hit.localId===null){await clearIfcSelection();renderInspector();renderDrawing();return;}
    const model=hit.fragments||modelById(state.activeModelId);let modelId=model?.modelId||state.activeModelId;
    await selectIfcItem(modelId,hit.localId,model);
  }
  function mapEntries(map){const out=[];for(const [modelId,ids] of Object.entries(map||{}))for(const id of ids||[])out.push({modelId,id});return out;}
  function entriesMap(entries){const out={};for(const entry of entries){let ids=out[entry.modelId];if(!ids)out[entry.modelId]=ids=new Set();ids.add(entry.id);}return out;}
  function segmentDistance(p,s){const q=nearestPointOnSegment(p,s);return {distance:Math.hypot(q[0]-p[0],q[1]-p[1]),point:q};}
  function projectedDistance(p,projected){let best=Infinity;for(const s of [...(projected.visible||[]),...(projected.hidden||[])])best=Math.min(best,segmentDistance(p,s).distance);return best;}
  function nearestDrawingSegment(p,d){let best={distance:Infinity,point:p,index:-1};for(let i=0;i<(d.visible||[]).length;i++){const hit=segmentDistance(p,d.visible[i]);if(hit.distance<best.distance)best={...hit,index:i};}return best;}
  async function findIfcItemAtDrawingPoint(d,p){
    const nearest=nearestDrawingSegment(p,d),tol=worldTolerance(d,12);if(nearest.index<0||nearest.distance>tol)return null;
    let candidates=mapEntries(drawingProjectionMap(d));if(!candidates.length)return null;const target=nearest.point,total=candidates.length;showProgress('Seleccionando en la vista 2D',`${total.toLocaleString('es-ES')} elementos candidatos`,.04,'identificación 2D');
    try{
      let step=0;while(candidates.length>1){const mid=Math.ceil(candidates.length/2),left=candidates.slice(0,mid);const projected=await projectMap(entriesMap(left),d);const hit=projectedDistance(target,projected)<=tol*1.8;candidates=hit?left:candidates.slice(mid);step++;updateProgress(`${candidates.length.toLocaleString('es-ES')} candidatos`,Math.min(.88,.08+step*.075),'identificación 2D');await new Promise(resolve=>setTimeout(resolve,0));}
      const found=candidates[0];if(!found)return null;const check=await projectMap(entriesMap([found]),d);if(projectedDistance(target,check)>tol*2.4)return null;return found;
    }finally{hideProgress('Selección 2D preparada');}
  }
  async function selectIfcFromDrawing(d,p){
    if(!state.modelLoaded||!state.engine)return false;try{const found=await findIfcItemAtDrawingPoint(d,p);if(!found){await clearIfcSelection();renderDrawing();renderInspector();toast('Elemento no identificado','Haz clic más cerca de una línea visible del elemento.','warn');return false;}await selectIfcItem(found.modelId,found.id);toast('Elemento seleccionado en 2D',`${String(state.selectedIfc?.category||'Elemento').replace(/^IFC/,'')} · #${found.id}`,'good');return true;}
    catch(err){console.error(err);toast('No se pudo seleccionar en 2D',err.message||String(err),'bad');return false;}
  }
  function bindModelPicking(engine){
    if(engine.pickBound)return;engine.pickBound=true;const dom=engine.world.renderer.three.domElement;let down=null;
    dom.addEventListener('pointerdown',ev=>{down={x:ev.clientX,y:ev.clientY};});
    dom.addEventListener('pointerup',async ev=>{if(state.mode!=='model'||!state.modelLoaded||!down)return;const moved=Math.hypot(ev.clientX-down.x,ev.clientY-down.y);down=null;if(moved>4)return;let hit=null;try{hit=engine.raycaster?await engine.raycaster.castRay():await engine.fragments.raycast({camera:engine.world.camera.three,mouse:engine.mouse.position,dom});}catch(err){console.warn('Selección IFC:',err);}await selectIfcHit(hit);});
  }
  async function buildIfcSemanticIndex(){
    const engine=state.engine;state.geometryMap={};state.ifcCategories=[];state.categoryItems=new Map();state.itemCategories=new Map();if(!engine)return;
    for(const [modelId,model] of engine.fragments.list){const ids=await model.getItemsIdsWithGeometry();state.geometryMap[String(modelId)]=new Set(ids||[]);}
    const classifier=engine.components.get(engine.OBC.Classifier),classificationName='IFC Drawing · Categorías';
    try{classifier.list.delete?.(classificationName);}catch(_){ }
    try{
      await classifier.byCategory({classificationName});const classification=classifier.list.get(classificationName);
      if(classification)for(const [name,data] of classification){let raw=null;try{raw=data?.get?await data.get():data?.map;}catch(_){raw=data?.map;}const map=intersectMap(raw,state.geometryMap),count=mapCount(map);if(!count)continue;const category=String(name);state.categoryItems.set(category,{name:category,map,count});for(const [modelId,ids] of Object.entries(map))for(const id of ids)state.itemCategories.set(itemKey(modelId,id),category);}
    }catch(err){console.warn('Clasificación IFC:',err);toast('Categorías no disponibles','El modelo se ha cargado, pero este IFC no expone clasificación por entidad.','warn');}
    state.ifcCategories=[...state.categoryItems.values()].sort((a,b)=>a.name.localeCompare(b.name,'es'));
  }
  function ifcSpaceCategory(){return state.ifcCategories.find(c=>String(c.name).toUpperCase()==='IFCSPACE')||state.ifcCategories.find(c=>String(c.name).toUpperCase().endsWith('SPACE'))||null;}
  function ifcAttributeValue(item,key){const v=item?.[key];return String(v?.value??v??'').trim();}
  async function ifcSpaceIdentity(model,localId,index){
    try{const data=await model?.getItemsData?.([localId],{attributesDefault:true});const item=Array.isArray(data)?data[0]:data?.[0]||data||{};return {name:ifcAttributeValue(item,'LongName')||ifcAttributeValue(item,'Name')||`Estancia ${index+1}`,number:ifcAttributeValue(item,'Tag')||String(index+1).padStart(2,'0')};}catch(_){return {name:`Estancia ${index+1}`,number:String(index+1).padStart(2,'0')};}
  }
  function syncAreaSchedules(source){
    const rows=(source.annotations||[]).filter(a=>a.type==='area').map(a=>{ensureAreaAnnotation(a);return {id:a.id,number:a.number,name:a.name,areaM2:a.areaM2,source:a.source,ifcKey:a.ifcKey||null};}).sort((a,b)=>String(a.number).localeCompare(String(b.number),'es',{numeric:true})||a.name.localeCompare(b.name,'es'));
    for(const schedule of state.drawings.filter(d=>d.kind==='areaSchedule'&&d.sourceDrawingId===source.id)){schedule.rows=rows.map(r=>({...r}));schedule.bounds=scheduleBounds(schedule);state.viewBoxes.delete(schedule.id);}renderSheet();
    return rows;
  }
  function createOrUpdateAreaSchedule(source){
    if(!source||source.kind!=='plan'){toast('Cuadro no disponible','Selecciona una vista de planta.','warn');return null;}const rows=syncAreaSchedules(source);let schedule=state.drawings.find(d=>d.kind==='areaSchedule'&&d.sourceDrawingId===source.id);
    if(schedule){schedule.rows=rows;schedule.name=`Cuadro de áreas · ${source.name}`;schedule.bounds=scheduleBounds(schedule);state.viewBoxes.delete(schedule.id);toast('Cuadro actualizado',`${rows.length} estancias.`,'good');}
    else schedule=addDrawing({name:`Cuadro de áreas · ${source.name}`,kind:'areaSchedule',sourceDrawingId:source.id,rows,annotations:[],visible:[],hidden:[]});
    renderTrees();activateDrawing(schedule.id);return schedule;
  }
  async function importIfcSpaces(d,{automatic=false}={}){
    const category=ifcSpaceCategory();if(!d||d.kind!=='plan'){toast('Áreas IFC','La importación de espacios se realiza en una planta.','warn');return 0;}if(!state.modelLoaded||!category){if(!automatic)toast('Sin IfcSpace','Este IFC no contiene espacios con geometría clasificada.','warn');return 0;}
    const entries=mapEntries(category.map),found=[];showProgress(automatic?'Importando espacios IFC':'Actualizando espacios IFC',`${entries.length} espacios candidatos`,.04,'áreas IFC');
    try{for(let i=0;i<entries.length;i++){const entry=entries[i],projected=await projectMap(entriesMap([entry]),d),segments=[...(projected.visible||[]),...(projected.hidden||[])];if(!segments.length)continue;const polygon=convexHull(segments.flatMap(s=>[[s[0],s[1]],[s[2],s[3]]]));const areaM2=polygonArea(polygon);if(polygon.length<3||areaM2<.01)continue;const identity=await ifcSpaceIdentity(modelById(entry.modelId),entry.id,found.length);found.push(ensureAreaAnnotation({id:uid('area'),type:'area',polygon,areaM2,center:polygonCentroid(polygon),name:identity.name,number:identity.number,source:'IFC',ifcKey:itemKey(entry.modelId,entry.id)}));updateProgress(`${i+1}/${entries.length} · ${found.length} estancias en esta planta`,.08+(i+1)/Math.max(1,entries.length)*.86,'áreas IFC');await new Promise(resolve=>setTimeout(resolve,0));}
      const manual=(d.annotations||[]).filter(a=>!(a.type==='area'&&a.source==='IFC'));d.annotations=[...manual,...found];syncAreaSchedules(d);hideProgress(`${found.length} espacios IFC importados`);if(found.length||!automatic)toast(found.length?'Espacios IFC importados':'Sin espacios en esta planta',found.length?`${found.length} áreas anotadas automáticamente.`:'No se proyectó ningún IfcSpace dentro de la banda de esta vista.',found.length?'good':'warn');renderDrawing();renderInspector();return found.length;
    }catch(err){console.error(err);clearInterval(state.progressState.timer);state.progressState.timer=null;el.progress.classList.add('hidden');state.busy=false;toast('No se pudieron importar espacios',err.message||String(err),'bad');return 0;}
  }
  async function loadEngine(){
    if(state.engine)return state.engine;if(state.enginePromise)return state.enginePromise;
    state.enginePromise=(async()=>{
      showProgress('Preparando motor IFC','Cargando That Open Components 3.4.8',.02,'motor');
      const OBC=await import('https://cdn.jsdelivr.net/npm/@thatopen/components@3.4.8/+esm');
      updateProgress('Inicializando escena BIM',.10,'escena');
      const components=new OBC.Components();const worlds=components.get(OBC.Worlds);const world=worlds.create();world.scene=new OBC.SimpleScene(components);world.scene.setup();world.scene.three.background=null;world.renderer=new OBC.SimpleRenderer(components,el.viewer,{preserveDrawingBuffer:true,antialias:true});world.renderer.showLogo=false;world.camera=new OBC.OrthoPerspectiveCamera(components);components.init();
      // El raycaster del mundo es obligatorio en Fragments 3.x para que la
      // selección GPU devuelva IDs en vez de un resultado vacío.
      let raycaster=null;try{raycaster=components.get(OBC.Raycasters).get(world);}catch(_){ }
      // Mantener el canvas sincronizado con el workspace (paneles, pestañas y resize de ventana).
      try{world.renderer.resize();}catch(_){ }
      const resizeObserver=typeof ResizeObserver!=='undefined'?new ResizeObserver(()=>{try{world.renderer.resize();}catch(_){ }}):null;
      resizeObserver?.observe(el.viewer);
      let grid=null;try{grid=components.get(OBC.Grids).create(world);}catch(_){ }
      const fragments=components.get(OBC.FragmentsManager);updateProgress('Cargando worker de Fragments',.20,'worker');const workerUrl=await OBC.FragmentsManager.getWorker();fragments.init(workerUrl);
      world.camera.controls.addEventListener('update',()=>fragments.core.update());world.onCameraChanged?.add?.(camera=>{for(const [,model] of fragments.list)model.useCamera(camera.three);fragments.core.update(true);});
      fragments.list.onItemSet.add(({key,value:model})=>{model.useCamera(world.camera.three);world.scene.three.add(model.object);state.ifcModels++;state.activeModelId=key||model.modelId||state.activeModelId;if(validModelBox(model.box)){state.modelBox=model.box;state.modelBoxSource='Fragments model.box';}Promise.resolve(fragments.core.update(true)).catch(()=>{});});
      fragments.core.models.materials.list.onItemSet.add(({value:material})=>{if(!('isLodMaterial' in material&&material.isLodMaterial)){material.polygonOffset=true;material.polygonOffsetUnits=1;material.polygonOffsetFactor=Math.random();}});
      updateProgress('Configurando web-ifc 0.0.77',.31,'web-ifc');const ifcLoader=components.get(OBC.IfcLoader);await ifcLoader.setup({autoSetWasm:false,wasm:{path:'https://cdn.jsdelivr.net/npm/web-ifc@0.0.77/',absolute:true}});
      const edgeProjector=components.get(OBC.EdgeProjector);edgeProjector.generator.angleThreshold=50;edgeProjector.cullerPixelsPerMeter=.05;const mouse=new OBC.Mouse(world.renderer.three.domElement);
      const boxer=components.get(OBC.BoundingBoxer);
      state.engine={OBC,components,world,fragments,ifcLoader,edgeProjector,boxer,grid,resizeObserver,mouse,raycaster};bindModelPicking(state.engine);updateProgress('Motor preparado',.39,'motor listo');return state.engine;
    })().catch(err=>{state.enginePromise=null;throw err;});return state.enginePromise;
  }

  async function openIfc(file,options={}){
    if(!file||state.busy)return;
    const reconnect=!!options.preserveProject,previousSource=state.source,previousMeta=state.sourceMeta,expectedSource=reconnect?state.source:null;
    if(location.protocol==='file:'){
      el.ifcInput.value='';if(el.reconnectIfcInput)el.reconnectIfcInput.value='';
      showModal({title:'IFC real: abrir mediante servidor local',html:`<div class="modal-note"><b>No voy a intentar cargar el IFC desde file://.</b> Chrome/Edge pueden bloquear módulos ES y WebAssembly cuando una aplicación se abre con doble clic; eso produce cargas incompletas o estados engañosos.</div><div class="prop-section"><div class="prop-head">PRUEBA LOCAL CORRECTA</div><div class="prop-body"><p style="font-size:10px;line-height:1.55;margin:0">Sirve esta carpeta por HTTP y vuelve a abrir la herramienta. Si usas la copia de prueba de HEFESTOLAB, ejecuta <code>INICIAR_HEFESTOLAB_LOCAL.bat</code> en la raíz; en cualquier otro caso vale con <code>python -m http.server</code> en esa misma carpeta. Se abrirá en <b>http://127.0.0.1</b>. El IFC seguirá procesándose en tu equipo y no se subirá a HEFESTOLAB.</p></div></div>`,actions:[{label:'Entendido',primary:true,onClick:closeModal}]});return;
    }
    try{
      state.demo=false;state.modelLoaded=false;state.modelBox=null;state.modelBoxSource=null;state.activeModelId=null;state.ifcModels=0;await clearIfcSelection();state.geometryMap={};state.ifcCategories=[];state.categoryItems=new Map();state.itemCategories=new Map();state.loadStats={conversionSeconds:0,totalSeconds:0,modelBoxSource:null,modelId:null};showProgress(reconnect?'Reconectando IFC':'Abriendo IFC',`${file.name} · leyendo cabecera`,.01,'metadatos');
      const headText=await file.slice(0,Math.min(file.size,40*1024*1024)).text();const meta=parseIfcMeta(headText);state.sourceMeta={...meta,size:file.size};if(reconnect)mergeIfcLevels(meta.storeys);else{syncLevelsFromMeta(meta.storeys);state.projectName=safeName(file.name);}state.source=file.name;
      el.projectName.textContent=state.projectName;el.fileMeta.textContent=`${meta.schema} · ${bytesText(file.size)} · ${meta.storeys.length?meta.storeys.length+' niveles':'niveles no detectados'}`;renderTrees();
      // Mostrar el viewport ANTES de construir WebGL. Crear el renderer dentro de un
      // contenedor display:none puede dejarlo con dimensiones 0×0 hasta un resize manual.
      setMode('model');
      const engine=await loadEngine();
      // Una sola fuente IFC por sesión: liberar cualquier modelo anterior antes de convertir el nuevo.
      for(const [modelId] of [...engine.fragments.list]){try{engine.fragments.core.disposeModel(modelId);}catch(_){ }}
      if(!reconnect){state.drawings=[];state.sheets=[];state.activeDrawingId=null;state.activeSheetId=null;state.selectedViewportId=null;state.selectedAnnotationId=null;state.pendingDimension=null;state.pendingDimensionChain=null;state.pendingArea=null;state.snapHover=null;state.sheetZoom=1;}
      renderTrees();renderInspector();
      updateProgress('Leyendo bytes del IFC',.405,'lectura');const buffer=new Uint8Array(await file.arrayBuffer());updateProgress(`${bytesText(buffer.byteLength)} en memoria · iniciando conversión`,.43,'geometría');
      const callback=(p,info={})=>updateProgress(ifcProgressText(p,info),mapIfcProgress(p,info),ifcPhaseLabel(info));
      const conversionStarted=performance.now();
      const loadedModel=await engine.ifcLoader.load(buffer,false,safeName(file.name),{
        instanceCallback:(importer)=>{
          importer.webIfcSettings={...(importer.webIfcSettings||{}),COORDINATE_TO_ORIGIN:true,CIRCLE_SEGMENTS:12};
          importer.doubleSidedMaterials=true;
          // Mantener el conjunto de atributos/relaciones mínimo del importer: documentación geométrica no necesita addAllAttributes/addAllRelations.
        },
        processData:{progressCallback:callback}
      });
      state.loadStats.conversionSeconds=(performance.now()-conversionStarted)/1000;
      updateProgress('Conversión terminada · leyendo extensión Fragments',.965,'encuadre');
      // IfcLoader.load() devuelve directamente el FragmentsModel. Usarlo evita depender
      // del orden temporal del evento list.onItemSet para obtener cámara, objeto y box.
      if(loadedModel){
        try{loadedModel.useCamera(engine.world.camera.three);}catch(_){ }
        try{if(!loadedModel.object?.parent)engine.world.scene.three.add(loadedModel.object);}catch(_){ }
        state.activeModelId=loadedModel.modelId||loadedModel.uuid||state.activeModelId;
      }
      if(loadedModel&&validModelBox(loadedModel.box)){state.modelBox=loadedModel.box;state.modelBoxSource='IfcLoader result.model.box';}
      if(!validModelBox(state.modelBox)){
        engine.boxer.list.clear();engine.boxer.addFromModels();const merged=engine.boxer.get();engine.boxer.list.clear();
        if(validModelBox(merged)){state.modelBox=merged;state.modelBoxSource='BoundingBoxer';}
      }
      if(!validModelBox(state.modelBox))throw new Error('IFC convertido, pero Fragments no devolvió una extensión 3D válida.');
      state.loadStats.modelBoxSource=state.modelBoxSource;state.loadStats.modelId=state.activeModelId||safeName(file.name);state.loadStats.totalSeconds=progressElapsed();
      state.modelLoaded=true;updateProgress('Clasificando elementos IFC',.982,'propiedades');await buildIfcSemanticIndex();
      if(!reconnect)buildIfcViewPresets();setProjectDetached(false);renderTrees();el.modelBadge.textContent=`${meta.schema} · ${safeName(file.name)}`;el.engineHint.textContent=`Motor IFC · That Open / web-ifc · ${modelBoxText()}`;
      updateProgress('Modelo listo',1,'finalizado');hideProgress(reconnect?'IFC reconectado':'IFC cargado');setMode('model');renderInspector();
      // La carga ya está oficialmente terminada. Resize + actualización + encuadre se
      // ejecutan desacoplados; ninguno puede mantener bloqueada la interfaz.
      requestAnimationFrame(()=>{
        try{engine.world.renderer.resize();}catch(_){ }
        Promise.resolve(engine.fragments.core.update(true)).catch(()=>{});
        requestAnimationFrame(()=>fitModelImmediate(false));
      });
      const mismatch=reconnect&&expectedSource&&String(expectedSource).toLowerCase()!==String(file.name).toLowerCase();toast(reconnect?'IFC reconectado':'IFC cargado',`${meta.schema} · ${meta.storeys.length||'sin'} niveles · ${modelBoxText()}${mismatch?' · aviso: el nombre no coincide con el IFC guardado':''}`,'good');
    }catch(err){
      console.error(err);clearInterval(state.progressState.timer);state.progressState.timer=null;el.progress.classList.add('hidden');state.busy=false;setStatus('Error al abrir IFC','error');toast('No se pudo abrir el IFC',err.message||String(err),'bad');showEngineHelp(err);
      if(reconnect){state.source=previousSource;state.sourceMeta=previousMeta;setProjectDetached(true);}
      try{state.engine?.ifcLoader?.cleanUp?.();}catch(_){ }
    }finally{el.ifcInput.value='';if(el.reconnectIfcInput)el.reconnectIfcInput.value='';}
  }

  function mergeIfcLevels(storeys){
    for(const s of storeys||[]){const elevation=+s.elevation||0,exists=state.levels.some(l=>Math.abs((+l.elevation||0)-elevation)<.005||String(l.name).trim().toLowerCase()===String(s.name||'').trim().toLowerCase());if(!exists)state.levels.push({id:uid('level'),name:s.name||`Nivel ${state.levels.length+1}`,elevation,source:'IFC'});}state.levels.sort((a,b)=>a.elevation-b.elevation);
  }

  function buildIfcViewPresets(){
    state.drawings=[];state.sheets=[];state.activeDrawingId=null;state.activeSheetId=null;const box=state.modelBox; if(!box)return;
    if(state.levels.length) state.levels.forEach(level=>createPlanForLevel(level,false));
    else addDrawing({name:'Planta general',kind:'plan',pending:true,projection:{orientation:'top'},annotations:[]});
    [['Alzado norte','front'],['Alzado sur','back'],['Alzado oeste','left'],['Alzado este','right']].forEach(([name,o])=>addDrawing({name,kind:'elevation',pending:true,projection:{orientation:o},annotations:[]}));
  }

  function showEngineHelp(err){
    const hist=(state.progressState.history||[]).slice(-8).map(h=>`<li>${fmt(h.t,1)} s · ${esc(h.phase||'—')} · ${esc(h.text||'')}</li>`).join('');
    showModal({title:'Diagnóstico del motor IFC',html:`<div class="modal-note">El modelo no se ha enviado a ningún servidor HEFESTOLAB. El fallo se ha producido durante la lectura/conversión local. La barra de carga separa geometría, propiedades, conversión y finalización para que no vuelva a quedarse visualmente clavada en un 75% artificial.</div><div class="prop-section"><div class="prop-head">DETALLE</div><div class="prop-body"><p style="font-size:10px;line-height:1.5;margin:0 0 8px">${esc(err?.message||String(err))}</p>${hist?`<ol style="margin:0;padding-left:18px;font-size:8.5px;line-height:1.5">${hist}</ol>`:''}</div></div>`,actions:[{label:'Cerrar',primary:true,onClick:closeModal}]});
  }

  // ---------- Projection dialogs ----------
  function projectionDialog(type='plan'){
    if(!state.modelLoaded){toast(state.demo?'Demo sin geometría 3D':'Sin IFC',state.demo?'La demo permite probar cotas y planos, pero para crear plantas/secciones nuevas debes cargar un IFC real.':'Carga primero un archivo IFC.','warn');return;}
    const isPlan=type==='plan',isSection=type==='section';
    const opts=isPlan?'<option value="top">Planta</option>':isSection?'<option value="front">Transversal · normal Z</option><option value="left">Longitudinal · normal X</option>':'<option value="front">Norte</option><option value="back">Sur</option><option value="left">Oeste</option><option value="right">Este</option>';
    const def=isPlan?'Nueva planta':isSection?'Sección A-A':'Nuevo alzado';
    let extraFields='';
    if(isSection) extraFields=`<div class="form-group"><label>Posición de corte (m)</label><input id="projPos" type="number" step="0.01" placeholder="Centro del modelo"></div><div class="form-group"><label>Profundidad visible (m)</label><input id="projDepth" type="number" min="0.01" step="0.05" value="0.50"></div>`;
    else if(isPlan) extraFields=`<div class="form-group full"><label>Nivel</label><select id="projLevel"><option value="">Planta libre / modelo completo</option>${state.levels.map(l=>`<option value="${l.id}" ${l.id===state.selectedLevelId?'selected':''}>${esc(l.name)} · ${fmt(l.elevation,2)} m</option>`).join('')}</select></div><div class="form-group"><label>Near libre (m)</label><input id="projNear" type="number" step="0.01" placeholder="Automático"></div><div class="form-group"><label>Far libre (m)</label><input id="projFar" type="number" step="0.01" placeholder="Automático"></div>`;
    else extraFields=`<div class="form-group"><label>Near (opcional)</label><input id="projNear" type="number" step="0.01" placeholder="Automático"></div><div class="form-group"><label>Far (opcional)</label><input id="projFar" type="number" step="0.01" placeholder="Automático"></div>`;
    const note=isSection?'Define el plano de sección por su orientación, posición y profundidad visible. El corte usa los planos near/far del proyector de aristas.':isPlan?'Selecciona un nivel para generar automáticamente la banda de planta. Los campos Near/Far solo se usan en una planta libre.':'La vista se genera a partir de aristas visibles y ocultas del IFC. Near/Far permiten limitar la profundidad.';
    showModal({title:def,html:`<div class="modal-note">${note}</div><div class="form-grid"><div class="form-group full"><label>Nombre</label><input id="projName" value="${def}"></div><div class="form-group"><label>Orientación</label><select id="projOri">${opts}</select></div><div class="form-group"><label>Umbral de arista</label><input id="projAngle" type="number" min="1" max="89" value="50"></div>${extraFields}</div>`,actions:[{label:'Cancelar',onClick:closeModal},{label:'Crear vista',primary:true,onClick:async()=>{
      const orientation=$('#projOri').value;let near,far,levelId=null;
      if(isSection){
        const od=orientationDef[orientation]||orientationDef.front,ext=extentAlong(state.modelBox,od.axis),pos=parseOptional($('#projPos').value),depth=Math.max(.01,parseFloat($('#projDepth').value)||.50),center=Number.isFinite(pos)?pos:(ext.min+ext.max)/2;
        near=clamp(center-depth/2,ext.min,ext.max);far=clamp(center+depth/2,ext.min,ext.max);
      }else if(isPlan&&$('#projLevel')?.value){
        levelId=$('#projLevel').value;const level=state.levels.find(l=>l.id===levelId),existing=state.drawings.find(d=>d.kind==='plan'&&d.levelId===levelId);
        if(existing){closeModal();toast('Planta ya existente',existing.name,'warn');await activateDrawing(existing.id);return;}
        const y=levelModelY(level),sorted=[...state.levels].sort((a,b)=>a.elevation-b.elevation),idx=sorted.findIndex(l=>l.id===levelId),next=sorted[idx+1],nextY=next?levelModelY(next):state.modelBox.max.y;near=clamp(y-.08,state.modelBox.min.y,state.modelBox.max.y);far=clamp(Math.max(y+.45,nextY-.08),state.modelBox.min.y,state.modelBox.max.y);
      }else{near=parseOptional($('#projNear')?.value);far=parseOptional($('#projFar')?.value);}
      const d=addDrawing({name:$('#projName').value.trim()||def,kind:isPlan?'plan':isSection?'section':'elevation',levelId,pending:true,projection:{orientation,near,far,angleThreshold:+$('#projAngle').value||50},annotations:[]});closeModal();renderTrees();await activateDrawing(d.id);
    }}]});
  }
  function parseOptional(v){const n=parseFloat(v);return Number.isFinite(n)?n:undefined;}

  // ---------- Tree & inspector ----------
  function renderTrees(){
    if(state.source){
      el.modelTree.innerHTML=`<div class="tree-item ${state.mode==='model'&&!state.selectedLevelId?'active':''}" data-model="main"><span class="tree-ico">◇</span><span class="tree-label">${esc(state.projectName)}</span><small>${esc(state.sourceMeta.schema)}</small></div>`;
      el.modelTree.querySelector('[data-model]')?.addEventListener('click',()=>{state.selectedLevelId=null;setMode('model');renderTrees();});
    }else el.modelTree.innerHTML='<div class="tree-empty">Carga un IFC o la demo.</div>';
    el.levelsTree.innerHTML=state.levels.length?state.levels.map(l=>`<div class="tree-item ${l.id===state.selectedLevelId?'level-selected':''}" data-level="${l.id}" title="Nivel de documentación local"><span class="tree-ico">≡</span><span class="tree-label">${esc(l.name)} <em class="level-source">${esc(l.source)}</em></span><small class="level-elev">${fmt(l.elevation,2)} m</small></div>`).join(''):'<div class="tree-empty">Sin niveles. Usa + Nivel.</div>';
    $$('[data-level]',el.levelsTree).forEach(n=>n.addEventListener('click',()=>{state.selectedLevelId=n.dataset.level;setMode('model');renderTrees();renderInspector();}));
    const plans=state.drawings.filter(d=>d.kind==='plan'),others=state.drawings.filter(d=>!['plan','threeD','areaSchedule'].includes(d.kind)),views3d=state.drawings.filter(d=>d.kind==='threeD'),schedules=state.drawings.filter(d=>d.kind==='areaSchedule');
    el.plansTree.innerHTML=plans.length?plans.map(treeViewHtml).join(''):'<div class="tree-empty">Sin plantas.</div>';
    el.elevationsTree.innerHTML=others.length?others.map(treeViewHtml).join(''):'<div class="tree-empty">Sin vistas.</div>';
    el.views3dTree.innerHTML=views3d.length?views3d.map(treeViewHtml).join(''):'<div class="tree-empty">Sin vistas 3D. Usa + Vista 3D.</div>';
    if(el.schedulesTree)el.schedulesTree.innerHTML=schedules.length?schedules.map(treeViewHtml).join(''):'<div class="tree-empty">Sin cuadros. Créalo desde una planta.</div>';
    const viewNodes=$$('[data-view]',el.plansTree).concat($$('[data-view]',el.elevationsTree),$$('[data-view]',el.views3dTree),el.schedulesTree?$$('[data-view]',el.schedulesTree):[]);
    viewNodes.forEach(n=>{
      n.addEventListener('click',()=>activateDrawing(n.dataset.view));
      if(n.draggable){n.addEventListener('dragstart',e=>{n.classList.add('dragging');e.dataTransfer.effectAllowed='copy';e.dataTransfer.setData('application/x-hefesto-view',n.dataset.view);e.dataTransfer.setData('text/plain',n.dataset.view);});n.addEventListener('dragend',()=>n.classList.remove('dragging'));}
    });
    el.sheetsTree.innerHTML=state.sheets.length?state.sheets.map(s=>`<div class="tree-item ${s.id===state.activeSheetId&&state.mode==='sheet'?'active':''}" data-sheet="${s.id}"><span class="tree-ico">▱</span><span class="tree-label">${esc(s.number)} · ${esc(s.name)}</span><small>${s.format}</small></div>`).join(''):'<div class="tree-empty">Sin planos.</div>';
    $$('[data-sheet]',el.sheetsTree).forEach(n=>n.addEventListener('click',()=>{state.activeSheetId=n.dataset.sheet;state.selectedViewportId=null;setMode('sheet');renderTrees();}));
    syncAgentState();
  }
  function treeViewHtml(d){const ready=!d.pending,is3d=d.kind==='threeD',schedule=d.kind==='areaSchedule';return `<div class="tree-item ${d.id===state.activeDrawingId&&state.mode==='drawing'?'active':''}" data-view="${d.id}" draggable="true" title="${ready?'Arrastra esta vista a un plano o haz clic para abrirla':'Arrástrala al plano para generarla automáticamente, o haz clic para abrirla'}"><span class="tree-ico">${is3d?'◈':schedule?'▦':d.pending?'○':'▤'}</span><span class="tree-label">${esc(d.name)}</span><small class="${is3d?'view3d-size':''}">${is3d?'NTS':schedule?`${d.rows?.length||0} áreas`:d.pending?'generar':(d.visible.length.toLocaleString('es-ES'))}</small></div>`;}

  function renderInspector(){
    const ann=selectedAnnotation(),vp=selectedViewport(),d=activeDrawing(),sh=activeSheet(),level=selectedLevel();
    if(state.mode==='sheet'&&vp){renderViewportInspector(vp,sh);return;}
    if(state.mode==='sheet'&&sh){renderSheetInspector(sh);return;}
    if(state.mode==='drawing'&&ann){renderAnnotationInspector(ann,d);return;}
    if(state.mode==='drawing'&&d){renderDrawingInspector(d);return;}
    if(state.mode==='model'&&state.selectedIfc){renderIfcSelectionInspector(state.selectedIfc,d);return;}
    if(state.mode==='model'&&level){renderLevelInspector(level);return;}
    if(state.mode==='model'&&state.source){renderModelInspector();return;}
    el.inspectorTitle.textContent='Herramienta';el.inspector.innerHTML='<div class="inspector-empty"><div class="empty-icon">i</div><b>IFC Drawing</b><p>Selecciona un modelo, un nivel, una vista, una cota o un viewport para editar sus propiedades.</p></div>';
  }
  function renderModelInspector(){
    el.inspectorTitle.textContent=state.demo?'Demo':'Modelo IFC';const b=state.modelBox,ls=state.loadStats||{};
    const diag=state.modelLoaded?`<div class="prop-section"><div class="prop-head">DIAGNÓSTICO DE CARGA</div><div class="prop-body"><div class="field"><label>Conversión</label><input value="${fmt(ls.conversionSeconds,1)} s" readonly></div><div class="field"><label>Bounding box</label><input value="${esc(ls.modelBoxSource||state.modelBoxSource||'—')}" readonly></div><div class="field"><label>Canvas</label><input value="${el.viewer.clientWidth||0} × ${el.viewer.clientHeight||0} px" readonly></div><div class="prop-buttons"><button class="prop-btn primary" id="inspFit">Encuadrar modelo</button><button class="prop-btn" id="inspRefresh3d">Actualizar 3D</button></div></div></div>`:'';
    const reconnect=state.projectDetached?`<div class="prop-section"><div class="prop-head">IFC ORIGINAL</div><div class="prop-body"><p class="drag-hint">El proyecto conserva su documentación. Reconecta <b>${esc(state.source||'el IFC original')}</b> para crear más vistas, seleccionar elementos e importar espacios.</p><button class="prop-btn primary wide" id="inspReconnectIfc">Reconectar IFC</button></div></div>`:'';
    el.inspector.innerHTML=`<div class="prop-section"><div class="prop-head">ARCHIVO</div><div class="prop-body"><div class="field"><label>Nombre</label><input value="${esc(state.projectName)}" readonly></div><div class="field"><label>Esquema</label><input value="${esc(state.sourceMeta.schema)}" readonly></div><div class="field"><label>Tamaño</label><input value="${bytesText(state.sourceMeta.size)}" readonly></div><div class="field"><label>Niveles</label><input value="${state.levels.length}" readonly></div></div></div>${reconnect}${b?`<div class="prop-section"><div class="prop-head">EXTENSIÓN 3D</div><div class="prop-body"><div class="stat-grid"><div class="stat"><b>${fmt(b.max.x-b.min.x,2)} m</b><span>X</span></div><div class="stat"><b>${fmt(b.max.y-b.min.y,2)} m</b><span>Y vertical</span></div><div class="stat"><b>${fmt(b.max.z-b.min.z,2)} m</b><span>Z</span></div><div class="stat"><b>${state.ifcModels||1}</b><span>Modelos</span></div></div></div></div>`:''}${diag}<div class="prop-section"><div class="prop-head">DOCUMENTACIÓN</div><div class="prop-body"><div class="prop-buttons"><button class="prop-btn" id="inspLevel">Crear nivel</button><button class="prop-btn primary" id="inspPlan">Crear planta</button><button class="prop-btn" id="inspElev">Crear alzado</button><button class="prop-btn" id="inspSection">Crear sección</button><button class="prop-btn" id="insp3D">Capturar vista 3D</button></div>${state.demo?'<p class="drag-hint">La demo contiene vistas 2D, no geometría 3D. Puedes crear niveles, pero las nuevas plantas/secciones requieren cargar un IFC real.</p>':''}</div></div>`;
    $('#inspFit')?.addEventListener('click',()=>fitModelImmediate(true));$('#inspRefresh3d')?.addEventListener('click',()=>{try{state.engine?.world?.renderer?.resize?.();}catch(_){ }refreshFragmentsAfterCamera();toast('Visor 3D actualizado','Se ha recalculado el tamaño del canvas y actualizado Fragments.','good');});
    $('#inspLevel')?.addEventListener('click',addLevelDialog);$('#inspPlan')?.addEventListener('click',()=>projectionDialog('plan'));$('#inspElev')?.addEventListener('click',()=>projectionDialog('elevation'));$('#inspSection')?.addEventListener('click',()=>projectionDialog('section'));$('#insp3D')?.addEventListener('click',capture3DViewDialog);
    $('#inspReconnectIfc')?.addEventListener('click',()=>el.reconnectIfcInput?.click());
  }
  async function updateDrawingDisplay(d,change,undo,label){
    if(!d||d.pending||isNonScaleDrawing(d)){toast('Vista 2D no disponible','Genera o selecciona primero una planta, sección o alzado.','warn');return false;}
    change();try{await projectPendingDrawing(d);await syncSelectedIfcProjection(d);renderDrawing();toast(label,d.name,'good');return true;}catch(err){undo?.();clearInterval(state.progressState.timer);state.progressState.timer=null;el.progress.classList.add('hidden');state.busy=false;setStatus('No se pudo actualizar la vista','error');toast('No se pudo actualizar la vista',err.message||String(err),'bad');return false;}
  }
  function bindSelectedIfcActions(d,selection){
    if(!d||!selection)return;const display=ensureDrawingDisplay(d),key=selection.key;
    $('#ifcHideInView')?.addEventListener('click',()=>{const had=display.hiddenItems.has(key);updateDrawingDisplay(d,()=>display.hiddenItems.add(key),()=>{if(!had)display.hiddenItems.delete(key);},'Elemento ocultado en la vista');});
    $('#ifcShowInView')?.addEventListener('click',()=>{const had=display.hiddenItems.has(key);updateDrawingDisplay(d,()=>display.hiddenItems.delete(key),()=>{if(had)display.hiddenItems.add(key);},'Elemento mostrado en la vista');});
    $('#ifcApplyColor')?.addEventListener('click',()=>{const old=display.itemColors.get(key),color=$('#ifcElementColor')?.value||'#ef4444';updateDrawingDisplay(d,()=>display.itemColors.set(key,color),()=>{if(old)display.itemColors.set(key,old);else display.itemColors.delete(key);},'Color de elemento aplicado');});
    $('#ifcClearColor')?.addEventListener('click',()=>{const old=display.itemColors.get(key);updateDrawingDisplay(d,()=>display.itemColors.delete(key),()=>{if(old)display.itemColors.set(key,old);},'Color de elemento restablecido');});
  }
  function selectedIfcBlock(d){
    const s=state.selectedIfc;if(!s||!d)return `<div class="note-mini">Con <b>Seleccionar</b> activo, haz clic directamente sobre una línea del elemento en esta vista 2D. Se resaltará también en el modelo 3D y podrás ocultarlo solo aquí.</div>`;
    const display=ensureDrawingDisplay(d),hidden=display.hiddenItems.has(s.key),color=display.itemColors.get(s.key)||'#ef4444';
    return `<div class="prop-section"><div class="prop-head">ELEMENTO IFC SELECCIONADO</div><div class="prop-body"><p class="ifc-selection-name"><b>${esc(String(s.category).replace(/^IFC/,''))}</b><br><small>${esc(s.guid||('#'+s.localId))}</small></p><div class="field"><label>Color en esta vista</label><input id="ifcElementColor" type="color" value="${esc(color)}"></div><div class="prop-buttons"><button class="prop-btn ${hidden?'':'danger'}" id="ifcHideInView" ${hidden?'disabled':''}>Ocultar elemento</button><button class="prop-btn" id="ifcShowInView" ${hidden?'':'disabled'}>Mostrar elemento</button><button class="prop-btn primary" id="ifcApplyColor">Aplicar color</button><button class="prop-btn" id="ifcClearColor">Color original</button></div></div></div>`;
  }
  function renderIfcSelectionInspector(selection,d){
    const target=d&&!d.pending&&!isNonScaleDrawing(d)?d:null;el.inspectorTitle.textContent='Elemento IFC';
    el.inspector.innerHTML=`<div class="prop-section"><div class="prop-head">SELECCIÓN 3D EXACTA</div><div class="prop-body"><div class="field"><label>Categoría</label><input value="${esc(String(selection.category).replace(/^IFC/,''))}" readonly></div><div class="field"><label>GlobalId</label><input value="${esc(selection.guid||'No disponible')}" readonly></div><div class="field"><label>ID local</label><input value="${esc(selection.localId)}" readonly></div><div class="field"><label>Vista documental activa</label><input value="${esc(target?.name||'Ninguna vista 2D generada')}" readonly></div>${target?selectedIfcBlock(target):'<p class="drag-hint">Abre o genera una vista 2D para aplicar visibilidad o color a este elemento.</p>'}<div class="prop-buttons"><button class="prop-btn" id="ifcClearSelection">Cerrar selección</button>${target?'<button class="prop-btn primary" id="ifcOpenDrawing">Volver a la vista 2D</button>':''}</div></div></div>`;
    bindSelectedIfcActions(target,selection);$('#ifcClearSelection')?.addEventListener('click',async()=>{await clearIfcSelection();renderInspector();refreshFragmentsAfterCamera();});$('#ifcOpenDrawing')?.addEventListener('click',()=>activateDrawing(target.id));
  }
  function renderLevelInspector(level){
    const local=level.source==='LOCAL';el.inspectorTitle.textContent='Nivel';el.inspector.innerHTML=`<div class="prop-section"><div class="prop-head">NIVEL DE DOCUMENTACIÓN</div><div class="prop-body"><div class="field"><label>Nombre</label><input id="levelEditName" value="${esc(level.name)}"></div><div class="field"><label>Cota (m)</label><input id="levelEditElev" type="number" step="0.01" value="${fmt(level.elevation,3)}"></div><div class="field"><label>Origen</label><input value="${esc(level.source)}" readonly></div><div class="prop-buttons"><button class="prop-btn primary" id="levelMakePlan" ${state.modelLoaded?'':'disabled'}>Crear planta</button><button class="prop-btn" id="levelClose">Cerrar</button>${local?'<button class="prop-btn danger" id="levelDelete">Eliminar</button>':''}</div><p class="drag-hint">Los cambios de nivel son locales a IFC Drawing y no alteran el archivo IFC original.</p></div></div>`;
    $('#levelEditName')?.addEventListener('change',e=>{level.name=e.target.value.trim()||level.name;renderTrees();});$('#levelEditElev')?.addEventListener('change',e=>{const v=parseFloat(e.target.value);if(Number.isFinite(v)){level.elevation=v;state.levels.sort((a,b)=>a.elevation-b.elevation);renderTrees();}});$('#levelMakePlan')?.addEventListener('click',()=>createPlanForLevel(level,true));$('#levelClose')?.addEventListener('click',()=>{state.selectedLevelId=null;renderTrees();renderInspector();});$('#levelDelete')?.addEventListener('click',()=>{state.levels=state.levels.filter(l=>l.id!==level.id);state.drawings=state.drawings.filter(d=>d.levelId!==level.id);state.selectedLevelId=null;renderTrees();renderInspector();toast('Nivel eliminado','Solo de esta sesión local.');});
  }
  function renderDrawingInspector(d){
    if(d.kind==='areaSchedule'){
      const source=state.drawings.find(x=>x.id===d.sourceDrawingId);el.inspectorTitle.textContent='Cuadro de áreas';el.inspector.innerHTML=`<div class="prop-section"><div class="prop-head">CUADRO DE ÁREAS</div><div class="prop-body"><div class="field"><label>Nombre</label><input id="scheduleName" value="${esc(d.name)}"></div><div class="field"><label>Vista origen</label><input value="${esc(source?.name||'Vista eliminada')}" readonly></div><div class="field"><label>Estancias</label><input value="${d.rows?.length||0}" readonly></div><div class="field"><label>Superficie</label><input value="${fmt((d.rows||[]).reduce((s,r)=>s+(+r.areaM2||0),0),2)} m²" readonly></div><div class="prop-buttons"><button class="prop-btn" id="scheduleRefresh" ${source?'':'disabled'}>Actualizar</button><button class="prop-btn primary" id="scheduleAddSheet">Añadir a plano</button><button class="prop-btn" id="scheduleSvg">Exportar SVG</button><button class="prop-btn danger" id="scheduleDelete">Eliminar cuadro</button></div><p class="area-schedule-note">Arrastra el cuadro desde el Navegador al plano, igual que cualquier vista.</p></div></div>`;
      $('#scheduleName')?.addEventListener('input',e=>{d.name=e.target.value||d.name;renderTrees();renderDrawing();renderSheet();});$('#scheduleRefresh')?.addEventListener('click',()=>{if(source){d.rows=syncAreaSchedules(source);renderDrawing();renderInspector();renderTrees();toast('Cuadro actualizado',`${d.rows.length} estancias.`,'good');}});$('#scheduleAddSheet')?.addEventListener('click',()=>addViewToSheet(d.id));$('#scheduleSvg')?.addEventListener('click',exportSvg);$('#scheduleDelete')?.addEventListener('click',()=>{for(const sh of state.sheets)sh.viewports=sh.viewports.filter(v=>v.drawingId!==d.id);state.drawings=state.drawings.filter(x=>x.id!==d.id);state.activeDrawingId=source?.id||null;renderTrees();if(source)activateDrawing(source.id);else{renderDrawing();renderInspector();}toast('Cuadro eliminado');});return;
    }
    if(d.kind==='threeD'){
      el.inspectorTitle.textContent='Vista 3D';el.inspector.innerHTML=`<div class="prop-thumb"><img src="${d.imageData}" alt=""></div><div class="prop-section"><div class="prop-head">IDENTIDAD</div><div class="prop-body"><div class="field"><label>Nombre</label><input id="viewName3d" value="${esc(d.name)}"></div><div class="field"><label>Tipo</label><input value="VISTA 3D" readonly></div><div class="field"><label>Escala</label><input value="NTS · Sin escala" readonly></div><div class="field"><label>Resolución</label><input value="${d.imageWidth||0} × ${d.imageHeight||0} px" readonly></div></div></div><div class="prop-section"><div class="prop-head">ACCIONES</div><div class="prop-body"><div class="prop-buttons"><button class="prop-btn primary" id="addSheetView3d">Añadir a plano</button><button class="prop-btn danger" id="deleteView3d">Eliminar vista</button></div><p class="drag-hint">También puedes arrastrar esta vista desde el Navegador directamente sobre un plano.</p></div></div>`;
      $('#viewName3d')?.addEventListener('change',e=>{d.name=e.target.value.trim()||d.name;renderTrees();renderDrawing();});$('#addSheetView3d')?.addEventListener('click',()=>addViewToSheet(d.id));$('#deleteView3d')?.addEventListener('click',()=>{for(const sh of state.sheets)sh.viewports=sh.viewports.filter(v=>v.drawingId!==d.id);state.drawings=state.drawings.filter(x=>x.id!==d.id);state.activeDrawingId=null;renderTrees();renderDrawing();renderInspector();toast('Vista 3D eliminada');});return;
    }
    const display=ensureDrawingDisplay(d),categories=state.ifcCategories.map((c,i)=>{const hidden=display.hiddenCategories.has(c.name),active=display.categoryColors.has(c.name),color=display.categoryColors.get(c.name)||categoryDefaultColor(c.name);return `<div class="ifc-category-row"><button class="cat-eye ${hidden?'off':''}" data-cat-vis="${i}" title="${hidden?'Mostrar':'Ocultar'} categoría">${hidden?'○':'●'}</button><span title="${esc(c.name)}">${esc(c.name.replace(/^IFC/,''))}<small>${c.count.toLocaleString('es-ES')}</small></span><label title="Activar color de categoría"><input type="checkbox" data-cat-color-on="${i}" ${active?'checked':''}></label><input type="color" data-cat-color="${i}" value="${esc(color)}" title="Color de categoría"></div>`;}).join(''),categoryFallback=state.modelLoaded?'Este IFC no expone categorías con geometría.':'Proyecto reabierto sin el IFC original: las vistas y ocultaciones guardadas siguen disponibles, pero la selección de nuevos elementos requiere cargar el IFC.';
    el.inspectorTitle.textContent='Vista 2D';const b=d.pending?null:(d.bounds||ensureDrawingBounds(d));el.inspector.innerHTML=`<div class="prop-section"><div class="prop-head">IDENTIDAD</div><div class="prop-body"><div class="field"><label>Nombre</label><input id="viewName" value="${esc(d.name)}"></div><div class="field"><label>Tipo</label><input value="${drawingLabelKind(d.kind)}" readonly></div><div class="field"><label>Estado</label><input value="${d.pending?'Pendiente de generar':'Vectorial'}" readonly></div></div></div>${b?`<div class="prop-section"><div class="prop-head">GEOMETRÍA</div><div class="prop-body"><div class="stat-grid"><div class="stat"><b>${d.visible.length.toLocaleString('es-ES')}</b><span>Líneas visibles</span></div><div class="stat"><b>${d.hidden.length.toLocaleString('es-ES')}</b><span>Líneas ocultas</span></div><div class="stat"><b>${fmt(b.width,2)} m</b><span>Ancho</span></div><div class="stat"><b>${fmt(b.height,2)} m</b><span>Alto</span></div></div></div></div>`:''}<div class="prop-section"><div class="prop-head">VISIBILIDAD Y COLOR IFC</div><div class="prop-body">${selectedIfcBlock(d)}<button class="prop-btn wide" id="selectIfc3d" ${state.modelLoaded?'':'disabled'}>Seleccionar también en 3D</button>${categories?`<div class="ifc-category-head"><b>Categorías</b><small>ojo · color</small></div><div class="ifc-category-list">${categories}</div><div class="prop-buttons"><button class="prop-btn" id="resetIfcDisplay">Restablecer vista</button></div>`:`<p class="drag-hint">${esc(categoryFallback)}</p>`}</div></div><div class="prop-section"><div class="prop-head">ACCIONES</div><div class="prop-body"><div class="prop-buttons"><button class="prop-btn" id="fit2d">Encuadrar</button><button class="prop-btn primary" id="addSheetView">${d.pending?'Generar y añadir':'Añadir a plano'}</button><button class="prop-btn" id="svg2">Exportar SVG</button><button class="prop-btn" id="dxf2">Exportar DXF</button></div><p class="drag-hint">Rueda para zoom. Arrastra el fondo con Seleccionar, botón central o Espacio para panear.</p></div></div>`;
    if(d.kind==='plan'){const areas=(d.annotations||[]).filter(a=>a.type==='area'),ifcAreas=areas.filter(a=>a.source==='IFC').length;el.inspector.insertAdjacentHTML('beforeend',`<div class="prop-section"><div class="prop-head">ÁREAS Y ESTANCIAS</div><div class="prop-body"><div class="stat-grid"><div class="stat"><b>${areas.length}</b><span>Áreas</span></div><div class="stat"><b>${fmt(areas.reduce((s,a)=>s+(+a.areaM2||0),0),2)} m²</b><span>Superficie</span></div></div><div class="prop-buttons"><button class="prop-btn" id="areaManual">Dibujar área</button><button class="prop-btn" id="areaIfc" ${state.modelLoaded&&ifcSpaceCategory()?'':'disabled'}>Importar IfcSpace</button><button class="prop-btn primary" id="areaSchedule">Crear/actualizar cuadro</button><button class="prop-btn" id="areaLabelsVisible">${d.areaLabelsVisible===false?'Mostrar textos':'Ocultar textos'}</button></div><p class="area-schedule-note">${ifcAreas?`${ifcAreas} áreas proceden de IfcSpace.`:'Puedes dibujar estancias manualmente o importarlas del IFC cuando existan.'} Ocultar los textos no elimina los polígonos ni las filas del cuadro.</p></div></div>`);}
    $('#viewName')?.addEventListener('change',e=>{d.name=e.target.value.trim()||d.name;renderTrees();renderDrawing();});$('#fit2d')?.addEventListener('click',()=>{fitViewBox(d);renderDrawing();});$('#addSheetView')?.addEventListener('click',()=>addViewToSheet(d.id));$('#svg2')?.addEventListener('click',exportSvg);$('#dxf2')?.addEventListener('click',exportDxf);$('#selectIfc3d')?.addEventListener('click',()=>{setMode('model');toast('Selecciona un elemento','Haz clic sobre el modelo 3D. Después podrás ocultarlo o colorearlo en «'+d.name+'».');});bindSelectedIfcActions(d,state.selectedIfc);
    $('#areaManual')?.addEventListener('click',()=>setDrawTool('area'));$('#areaIfc')?.addEventListener('click',()=>importIfcSpaces(d));$('#areaSchedule')?.addEventListener('click',()=>createOrUpdateAreaSchedule(d));$('#areaLabelsVisible')?.addEventListener('click',()=>{d.areaLabelsVisible=d.areaLabelsVisible===false;renderDrawing();renderSheet();renderInspector();toast(d.areaLabelsVisible?'Textos de áreas visibles':'Textos de áreas ocultos',d.name,'good');});
    $$('[data-cat-vis]',el.inspector).forEach(btn=>btn.addEventListener('click',()=>{const c=state.ifcCategories[+btn.dataset.catVis];if(!c)return;const had=display.hiddenCategories.has(c.name);updateDrawingDisplay(d,()=>had?display.hiddenCategories.delete(c.name):display.hiddenCategories.add(c.name),()=>had?display.hiddenCategories.add(c.name):display.hiddenCategories.delete(c.name),had?'Categoría mostrada':'Categoría ocultada');}));
    $$('[data-cat-color-on]',el.inspector).forEach(input=>input.addEventListener('change',()=>{const c=state.ifcCategories[+input.dataset.catColorOn];if(!c)return;const old=display.categoryColors.get(c.name),color=$(`[data-cat-color="${input.dataset.catColorOn}"]`,el.inspector)?.value||categoryDefaultColor(c.name);updateDrawingDisplay(d,()=>input.checked?display.categoryColors.set(c.name,color):display.categoryColors.delete(c.name),()=>{if(old)display.categoryColors.set(c.name,old);else display.categoryColors.delete(c.name);},input.checked?'Color de categoría aplicado':'Color de categoría restablecido');}));
    $$('[data-cat-color]',el.inspector).forEach(input=>input.addEventListener('change',()=>{const c=state.ifcCategories[+input.dataset.catColor];if(!c)return;const old=display.categoryColors.get(c.name),box=$(`[data-cat-color-on="${input.dataset.catColor}"]`,el.inspector);updateDrawingDisplay(d,()=>{display.categoryColors.set(c.name,input.value);if(box)box.checked=true;},()=>{if(old)display.categoryColors.set(c.name,old);else display.categoryColors.delete(c.name);},'Color de categoría aplicado');}));
    $('#resetIfcDisplay')?.addEventListener('click',()=>{const old={hiddenCategories:new Set(display.hiddenCategories),hiddenItems:new Set(display.hiddenItems),categoryColors:new Map(display.categoryColors),itemColors:new Map(display.itemColors)};updateDrawingDisplay(d,()=>{display.hiddenCategories.clear();display.hiddenItems.clear();display.categoryColors.clear();display.itemColors.clear();},()=>{d.display=old;},'Visibilidad y colores restablecidos');});
  }
  function renderAnnotationInspector(a,d){
    el.inspectorTitle.textContent=a.type==='dimension'?(a.chainId?'Cadena de cotas':'Cota'):a.type==='area'?'Área':'Texto';
    if(a.type==='dimension'){
      const g=dimensionGeom(a),members=a.chainId?d.annotations.filter(x=>x.type==='dimension'&&x.chainId===a.chainId):[a];el.inspector.innerHTML=`<div class="prop-section"><div class="prop-head">${a.chainId?'CADENA DE COTAS':'COTA'}</div><div class="prop-body"><div class="field"><label>Medida</label><input value="${formatLength(g.L)}" readonly></div>${a.chainId?`<div class="field"><label>Tramos</label><input value="${members.length}" readonly></div>`:''}<div class="field"><label>Dirección</label><input value="${a.axis==='H'?'Horizontal':a.axis==='V'?'Vertical':'Libre'}" readonly></div><div class="field"><label>Desfase (m)</label><input id="annOffset" type="number" step="0.05" value="${a.offset}"></div><div class="field"><label>Texto tramo</label><input id="annText" value="${esc(a.textOverride||'')}" placeholder="Automático"></div><div class="prop-buttons"><button class="prop-btn" id="annBack">Cerrar</button><button class="prop-btn danger" id="annDelete">${a.chainId?'Eliminar cadena':'Eliminar'}</button></div><p class="drag-hint">${a.chainId?'Arrastra cualquier tramo o cambia el desfase para mover toda la cadena a la vez.':'Arrastra directamente la línea o el texto de la cota para cambiar su altura sin borrarla.'} En PDF el texto se imprime con altura nominal de ${DIMENSION_TEXT_MM.toFixed(1).replace('.',',')} mm.</p></div></div>`;$('#annOffset').addEventListener('input',e=>{const value=+e.target.value||0;for(const member of members)member.offset=value;renderDrawing();renderSheet();});$('#annText').addEventListener('input',e=>{a.textOverride=e.target.value;renderDrawing();renderSheet();});
    }else if(a.type==='area'){
      ensureAreaAnnotation(a);el.inspector.innerHTML=`<div class="prop-section"><div class="prop-head">ÁREA DE ESTANCIA</div><div class="prop-body"><div class="field"><label>Número</label><input id="areaEditNumber" value="${esc(a.number)}"></div><div class="field"><label>Estancia</label><input id="areaEditName" value="${esc(a.name)}"></div><div class="field"><label>Área</label><input value="${fmt(a.areaM2,2)} m²" readonly></div><div class="field"><label>Origen</label><input value="${a.source==='IFC'?'IfcSpace':'Manual'}" readonly></div><div class="field"><label>Texto</label><input value="${areaLabelVisible(a,d)?'Visible':'Oculto'}" readonly></div><div class="prop-buttons"><button class="prop-btn" id="annBack">Cerrar</button><button class="prop-btn" id="areaToggleLabel">${a.showLabel===false?'Mostrar texto':'Ocultar texto'}</button><button class="prop-btn primary" id="areaMakeSchedule">Crear/actualizar cuadro</button><button class="prop-btn danger" id="annDelete">Eliminar área</button></div><p class="drag-hint">El control general de la planta tiene prioridad. El cuadro de áreas conserva esta estancia aunque su etiqueta esté oculta.</p></div></div>`;const update=()=>{syncAreaSchedules(d);renderDrawing();renderSheet();renderTrees();};$('#areaEditNumber')?.addEventListener('input',e=>{a.number=e.target.value;update();});$('#areaEditName')?.addEventListener('input',e=>{a.name=e.target.value||a.name;update();});$('#areaToggleLabel')?.addEventListener('click',()=>{a.showLabel=a.showLabel===false;renderDrawing();renderSheet();renderInspector();});$('#areaMakeSchedule')?.addEventListener('click',()=>createOrUpdateAreaSchedule(d));
    }else{
      el.inspector.innerHTML=`<div class="prop-section"><div class="prop-head">TEXTO</div><div class="prop-body"><div class="field"><label>Contenido</label><textarea id="annContent">${esc(a.text)}</textarea></div><div class="field"><label>X</label><input id="annX" type="number" step="0.01" value="${fmt(a.p[0],3)}"></div><div class="field"><label>Y</label><input id="annY" type="number" step="0.01" value="${fmt(a.p[1],3)}"></div><div class="prop-buttons"><button class="prop-btn" id="annBack">Cerrar</button><button class="prop-btn danger" id="annDelete">Eliminar</button></div><p class="drag-hint">También puedes mover el texto directamente: herramienta <b>Seleccionar</b> → arrastrar el texto.</p></div></div>`;$('#annContent').addEventListener('input',e=>{a.text=e.target.value;renderDrawing();renderSheet();});const pos=(id,i)=>$(id)?.addEventListener('change',e=>{const v=parseFloat(e.target.value);if(Number.isFinite(v)){a.p[i]=v;renderDrawing();renderSheet();}});pos('#annX',0);pos('#annY',1);
    }
    $('#annBack')?.addEventListener('click',()=>{state.selectedAnnotationId=null;renderDrawing();renderInspector();});$('#annDelete')?.addEventListener('click',()=>{d.annotations=d.annotations.filter(x=>a.chainId?x.chainId!==a.chainId:x.id!==a.id);state.selectedAnnotationId=null;if(a.type==='area')syncAreaSchedules(d);renderDrawing();renderSheet();renderInspector();toast(a.chainId?'Cadena eliminada':a.type==='area'?'Área eliminada':'Anotación eliminada');});
  }
  function renderSheetInspector(sh){
    el.inspectorTitle.textContent='Plano';el.inspector.innerHTML=`<div class="prop-section"><div class="prop-head">HOJA</div><div class="prop-body"><div class="field"><label>Número</label><input id="shNumber" value="${esc(sh.number)}"></div><div class="field"><label>Nombre</label><input id="shName" value="${esc(sh.name)}"></div><div class="field"><label>Formato</label><select id="shFormat">${Object.keys(mmFormats).map(x=>`<option ${x===sh.format?'selected':''}>${x}</option>`).join('')}</select></div><div class="field"><label>Orientación</label><select id="shOri"><option value="landscape" ${sh.orientation==='landscape'?'selected':''}>Horizontal</option><option value="portrait" ${sh.orientation==='portrait'?'selected':''}>Vertical</option></select></div><div class="field"><label>Proyecto</label><input id="shProject" value="${esc(sh.project)}"></div><div class="field"><label>Autor</label><input id="shAuthor" value="${esc(sh.author)}"></div></div></div><div class="prop-section"><div class="prop-head">CONTENIDO</div><div class="prop-body"><div class="stat-grid"><div class="stat"><b>${sh.viewports.length}</b><span>Viewports</span></div><div class="stat"><b>${sh.format}</b><span>Formato</span></div></div><div class="prop-buttons"><button class="prop-btn" id="shAdd">Añadir vista</button><button class="prop-btn primary" id="shPdf">Exportar PDF</button></div></div></div>`;
    const bindText=(id,key)=>$(id)?.addEventListener('input',e=>{sh[key]=e.target.value;renderSheet();renderTrees();});const bindSelect=(id,key)=>$(id)?.addEventListener('change',e=>{sh[key]=e.target.value;state.sheetZoom=1;renderSheet();renderTrees();renderInspector();});bindText('#shNumber','number');bindText('#shName','name');bindText('#shProject','project');bindText('#shAuthor','author');bindSelect('#shFormat','format');bindSelect('#shOri','orientation');$('#shAdd')?.addEventListener('click',showAddViewModal);$('#shPdf')?.addEventListener('click',exportPdf);
  }
  function renderViewportInspector(vp,sh){
    const d=state.drawings.find(x=>x.id===vp.drawingId),nts=isNonScaleDrawing(d),label=viewportLabelPosition(vp);el.inspectorTitle.textContent='Viewport';el.inspector.innerHTML=`<div class="prop-section"><div class="prop-head">VISTA EN PLANO</div><div class="prop-body"><div class="field"><label>Vista</label><input value="${esc(d?.name||'—')}" readonly></div>${nts?`<div class="field"><label>Escala</label><input value="${d?.kind==='areaSchedule'?'TABLA':'NTS · Sin escala'}" readonly></div>`:`<div class="field"><label>Escala</label><select id="vpScale">${[...new Set([...standardScales,vp.scale])].sort((a,b)=>a-b).map(s=>`<option value="${s}" ${+s===+vp.scale?'selected':''}>1:${s}</option>`).join('')}</select></div>`}<div class="field"><label>X (mm)</label><input id="vpX" type="number" step="1" value="${fmt(vp.x,1)}"></div><div class="field"><label>Y (mm)</label><input id="vpY" type="number" step="1" value="${fmt(vp.y,1)}"></div><div class="field"><label>Ancho (mm)</label><input id="vpW" type="number" step="1" value="${fmt(vp.w,1)}"></div><div class="field"><label>Alto (mm)</label><input id="vpH" type="number" step="1" value="${fmt(vp.h,1)}"></div><div class="prop-buttons"><button class="prop-btn" id="vpCenter" ${nts?'disabled':''}>Recentrar</button><button class="prop-btn danger" id="vpDelete">Quitar</button></div></div></div><div class="prop-section"><div class="prop-head">TÍTULO Y ESCALA</div><div class="prop-body"><div class="field"><label>X (mm)</label><input id="vpLabelX" type="number" step="1" value="${fmt(label.x,1)}"></div><div class="field"><label>Y (mm)</label><input id="vpLabelY" type="number" step="1" value="${fmt(label.y,1)}"></div><div class="prop-buttons"><button class="prop-btn" id="vpLabelReset">Restablecer posición</button></div><p class="drag-hint">También puedes arrastrar directamente el título y la escala sobre el plano. Se mueven juntos y su posición se conserva al guardar y exportar.</p></div></div>`;
    const num=(id,key)=>$(id)?.addEventListener('change',e=>{vp[key]=+e.target.value||vp[key];renderSheet();renderInspector();});num('#vpX','x');num('#vpY','y');num('#vpW','w');num('#vpH','h');const labelNum=(id,key,base)=>$(id)?.addEventListener('change',e=>{const value=parseFloat(e.target.value),[pw,ph]=sheetSize(sh);if(Number.isFinite(value))vp[key]=clamp(value,10,key==='labelDx'?pw-10:ph-10)-base();renderSheet();renderInspector();});labelNum('#vpLabelX','labelDx',()=>vp.x);labelNum('#vpLabelY','labelDy',()=>vp.y);$('#vpLabelReset')?.addEventListener('click',()=>{delete vp.labelDx;delete vp.labelDy;renderSheet();renderInspector();});$('#vpScale')?.addEventListener('change',e=>{vp.scale=+e.target.value;renderSheet();renderInspector();});$('#vpCenter')?.addEventListener('click',()=>{if(d&&!nts){vp.cx=d.bounds.cx;vp.cy=d.bounds.cy;renderSheet();}});$('#vpDelete')?.addEventListener('click',()=>{sh.viewports=sh.viewports.filter(x=>x.id!==vp.id);state.selectedViewportId=null;renderSheet();renderInspector();toast('Vista retirada del plano');});
  }

  function showAddViewModal(){
    const ready=state.drawings;if(!ready.length){toast('No hay vistas','Crea primero una planta, alzado o sección.','warn');return;}
    showModal({title:'Añadir vista al plano',html:`<div class="form-grid"><div class="form-group full"><label>Vista</label><select id="addViewSelect">${ready.map(d=>`<option value="${d.id}">${d.pending?'[generar] ':''}${esc(d.name)}</option>`).join('')}</select></div></div>`,actions:[{label:'Cancelar',onClick:closeModal},{label:'Añadir',primary:true,onClick:()=>{const id=$('#addViewSelect').value;closeModal();addViewToSheet(id);}}]});
  }

  // ---------- Interaction wiring ----------
  $$('.mode-tab').forEach(b=>b.addEventListener('click',()=>setMode(b.dataset.mode)));
  $$('[data-draw-tool]').forEach(b=>b.addEventListener('click',()=>setDrawTool(b.dataset.drawTool)));
  $$('.tree-title').forEach(b=>b.addEventListener('click',e=>{if(e.target.closest?.('.tree-add'))return;b.closest('.tree-section').classList.toggle('open');}));
  el.ifcInput.addEventListener('change',()=>openIfc(el.ifcInput.files?.[0]));
  el.reconnectIfcInput?.addEventListener('change',()=>openIfc(el.reconnectIfcInput.files?.[0],{preserveProject:true}));
  el.projectInput?.addEventListener('change',()=>openProjectFile(el.projectInput.files?.[0]));$('#btnSaveProject')?.addEventListener('click',saveProject);
  ['btnDemo','btnDemoSide','btnDemoStart'].forEach(id=>$(`#${id}`)?.addEventListener('click',loadDemo));
  $('#btnOpenIfcSide')?.addEventListener('click',()=>el.ifcInput.click());
  $('#btnFit')?.addEventListener('click',()=>fitModelImmediate(true));
  $('#btnCreateLevel')?.addEventListener('click',addLevelDialog);$('#btnLevelTree')?.addEventListener('click',e=>{e.stopPropagation();addLevelDialog();});
  $('#btnCreatePlan')?.addEventListener('click',()=>projectionDialog('plan'));$('#btnCreateElevation')?.addEventListener('click',()=>projectionDialog('elevation'));$('#btnCreateSection')?.addEventListener('click',()=>projectionDialog('section'));$('#btnCreate3DView')?.addEventListener('click',capture3DViewDialog);
  $('#toggleSnapBtn')?.addEventListener('click',()=>setSnapEnabled(!state.snapEnabled));$('#toggleOrthoBtn')?.addEventListener('click',()=>setOrthoEnabled(!state.orthoEnabled));
  $('#btnNewSheet')?.addEventListener('click',()=>{createSheet();setMode('sheet');});$('#btnNewSheetEmpty')?.addEventListener('click',()=>{createSheet();setMode('sheet');});$('#btnAddView')?.addEventListener('click',showAddViewModal);
  $('#btnSheetZoomOut')?.addEventListener('click',()=>setSheetZoom(state.sheetZoom/1.25));$('#btnSheetZoomFit')?.addEventListener('click',fitSheet);$('#btnSheetZoomIn')?.addEventListener('click',()=>setSheetZoom(state.sheetZoom*1.25));
  $('#btnExportPdf')?.addEventListener('click',exportPdf);$('#btnExportSvg')?.addEventListener('click',exportSvg);$('#btnExportDxf')?.addEventListener('click',exportDxf);
  el.toggleHidden.addEventListener('change',()=>{renderDrawing();renderSheet();});

  el.drawingSvg.addEventListener('pointerdown',beginAnnotationDrag);el.drawingSvg.addEventListener('pointerdown',beginDrawingPan);
  el.drawingSvg.addEventListener('pointermove',e=>{
    if(state.mode!=='drawing')return;if(moveAnnotationDrag(e)||moveDrawingPan(e))return;const d=activeDrawing();if(!d||d.pending)return;const raw=svgPoint(e);el.statusCoords.textContent=`X ${fmt(raw[0],3)} · Y ${fmt(raw[1],3)}`;
    if(state.drawTool==='dimension'){
      if(!state.pendingDimension){state.snapHover=getSnap(raw,d);updateInteractionOverlay();}
      else if(!state.pendingDimension.b){state.snapHover=resolveDrawingPoint(raw,d,state.pendingDimension.a,e);updateInteractionOverlay();}
      else{state.snapHover=null;const a=state.pendingDimension.a,b=state.pendingDimension.b,dx=b[0]-a[0],dy=b[1]-a[1],L=Math.max(1e-9,Math.hypot(dx,dy)),nx=-dy/L,ny=dx/L,mid=[(a[0]+b[0])/2,(a[1]+b[1])/2];state.pendingDimension.offset=(raw[0]-mid[0])*nx+(raw[1]-mid[1])*ny;renderDrawing();}
    }else if(state.drawTool==='dimension-chain'){state.pendingDimensionChain ||= {points:[],axis:null,cursor:null};const chain=state.pendingDimensionChain,ref=chainReference(raw,d,chain.points[0]||null,e);chain.cursor=ref?.p||raw;state.snapHover=ref||null;renderDrawing();}
    else if(state.drawTool==='area'){state.pendingArea ||= {points:[],cursor:null};const snap=getSnap(raw,d);state.pendingArea.cursor=snap.type?snap.p:raw;state.snapHover=snap;renderDrawing();}
    else if(state.drawTool==='text'){state.snapHover=getSnap(raw,d);updateInteractionOverlay();}
    else if(state.snapHover){state.snapHover=null;updateInteractionOverlay();}
  });
  el.drawingSvg.addEventListener('pointerup',endAnnotationDrag);el.drawingSvg.addEventListener('pointerup',endDrawingPan);el.drawingSvg.addEventListener('pointercancel',endAnnotationDrag);el.drawingSvg.addEventListener('pointercancel',endDrawingPan);
  el.drawingSvg.addEventListener('mouseleave',()=>{if(!state.dragAnnotation&&state.snapHover){state.snapHover=null;updateInteractionOverlay();}});
  el.drawingSvg.addEventListener('click',onDrawingClick);
  el.drawingSvg.addEventListener('wheel',e=>{const d=activeDrawing();if(!d||d.pending)return;e.preventDefault();const vb=state.viewBoxes.get(d.id)||fitViewBox(d);const f=e.deltaY>0?1.12:.89;const p=svgPoint(e);const nw=clamp(vb.w*f,(d.bounds?.width||1)*.03,(d.bounds?.width||10)*20),nh=vb.h*(nw/vb.w);const rx=(p[0]-vb.x)/vb.w,ry=(p[1]-vb.y)/vb.h;state.viewBoxes.set(d.id,{x:p[0]-rx*nw,y:p[1]-ry*nh,w:nw,h:nh});renderDrawing();},{passive:false});
  el.drawingSvg.addEventListener('dblclick',e=>{const d=activeDrawing();if(!d)return;if(state.drawTool==='area'&&state.pendingArea?.points?.length>=3){e.preventDefault();finishManualArea(d);}else{fitViewBox(d);renderDrawing();}});
  el.sheetCanvas.addEventListener('wheel',e=>{if(state.mode!=='sheet'||!activeSheet())return;e.preventDefault();setSheetZoom(state.sheetZoom*(e.deltaY>0?.88:1.14),e);},{passive:false});
  el.sheetCanvas.addEventListener('pointerdown',beginSheetPan);el.sheetCanvas.addEventListener('pointermove',moveSheetPan);el.sheetCanvas.addEventListener('pointerup',endSheetPan);el.sheetCanvas.addEventListener('pointercancel',endSheetPan);
  document.addEventListener('keydown',e=>{
    if(e.code==='Space'&&!inputFocused()){state.ui.spaceDown=true;el.drawingSvg.classList.add('pan-ready');el.sheetCanvas.classList.add('pan-ready');e.preventDefault();}
    if(e.key==='F8'&&!inputFocused()){e.preventDefault();setOrthoEnabled(!state.orthoEnabled);return;}
    if(e.key==='Enter'&&!inputFocused()&&state.drawTool==='area'&&state.pendingArea?.points?.length>=3){e.preventDefault();finishManualArea(activeDrawing());return;}
    if(e.key==='Escape'){if(!el.modalBackdrop.classList.contains('hidden'))closeModal();else if(state.dragAnnotation){endAnnotationDrag({});}else if(state.ui.pan){endDrawingPan();}else if(state.ui.sheetPan){endSheetPan();}else if(state.pendingDimension||state.pendingDimensionChain||state.pendingArea){state.pendingDimension=null;state.pendingDimensionChain=null;state.pendingArea=null;state.snapHover=null;renderDrawing();toast('Operación cancelada');}else if(state.selectedAnnotationId){state.selectedAnnotationId=null;renderDrawing();renderInspector();}else if(state.selectedIfc){clearIfcSelection().then(()=>{renderDrawing();renderInspector();refreshFragmentsAfterCamera();});}}
    if((e.key==='Delete'||e.key==='Backspace')&&state.mode==='drawing'&&state.selectedAnnotationId&&!inputFocused()){const d=activeDrawing(),selected=d.annotations.find(a=>a.id===state.selectedAnnotationId),chainId=selected?.chainId;d.annotations=d.annotations.filter(a=>chainId?a.chainId!==chainId:a.id!==state.selectedAnnotationId);state.selectedAnnotationId=null;if(selected?.type==='area')syncAreaSchedules(d);renderDrawing();renderSheet();renderInspector();}
  });
  document.addEventListener('keyup',e=>{if(e.code==='Space'){state.ui.spaceDown=false;el.drawingSvg.classList.remove('pan-ready');el.sheetCanvas.classList.remove('pan-ready');}});
  $('#modalClose')?.addEventListener('click',closeModal);el.modalBackdrop.addEventListener('pointerdown',e=>{if(e.target===el.modalBackdrop)closeModal();});
  const syncWorkspaceAfterPanel=()=>requestAnimationFrame(()=>{try{state.engine?.world?.renderer?.resize?.();}catch(_){ }if(state.mode==='sheet')renderSheet();});
  $('#btnCollapseLeft')?.addEventListener('click',()=>{document.body.classList.add('left-collapsed');syncWorkspaceAfterPanel();});$('#btnCollapseRight')?.addEventListener('click',()=>{document.body.classList.add('right-collapsed');syncWorkspaceAfterPanel();});
  $('#btnExpandLeft')?.addEventListener('click',()=>{document.body.classList.remove('left-collapsed');syncWorkspaceAfterPanel();});$('#btnExpandRight')?.addEventListener('click',()=>{document.body.classList.remove('right-collapsed');syncWorkspaceAfterPanel();});
  $('#btnTheme')?.addEventListener('click',()=>{const root=document.documentElement;root.dataset.theme=root.dataset.theme==='dark'?'light':'dark';localStorage.setItem('hefestolab-ifcdrawing-theme',root.dataset.theme);});
  window.addEventListener('resize',()=>{if(state.mode==='sheet')renderSheet();state.engine?.world?.renderer?.resize?.();});

  if(location.protocol==='file:'||location.hostname==='localhost'||location.hostname==='127.0.0.1'||new URLSearchParams(location.search).has('qa')){
    window.__HEFESTO_IFC_DRAWING_QA__={state,loadDemo,openIfc,activeDrawing,activeSheet,selectedLevel,getSnap,resolveDrawingPoint,addDrawing,renderTrees,renderDrawing,renderSheet,addViewToSheet,createSheet,fitSheet,setSheetZoom,fitModelImmediate,validModelBox,modelBoxText,capture3DView,decodeIfcStringEscapes,ifcString,serializeProject,applyProject,titleBlockMetrics,dimensionTextMm:DIMENSION_TEXT_MM,selectIfcFromDrawing,syncSelectedIfcProjection,polygonArea,polygonCentroid,finishDimensionChain,finishManualArea,importIfcSpaces,createOrUpdateAreaSchedule,syncAreaSchedules,setDrawTool,setProjectDetached,addArea:(drawing,polygon,name='Estancia',number='01',source='MANUAL')=>{const a=ensureAreaAnnotation({id:uid('area'),type:'area',polygon,areaM2:polygonArea(polygon),center:polygonCentroid(polygon),name,number,source});drawing.annotations.push(a);syncAreaSchedules(drawing);renderDrawing();return a;},addLevel:(name,elevation)=>{const l={id:uid('level'),name,elevation:+elevation,source:'LOCAL'};state.levels.push(l);renderTrees();return l;}};
  }

  // Theme follows site preference when available.
  document.documentElement.dataset.theme=localStorage.getItem('hefestolab-ifcdrawing-theme')||localStorage.getItem('hefestolab-theme')||'light';
  renderTrees();renderInspector();updateModeIndicators();setStatus('Preparado','ok');
  if (new URLSearchParams(location.search).get('demo') === '1') setTimeout(loadDemo, 60);
})();
