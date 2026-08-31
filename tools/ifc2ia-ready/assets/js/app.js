/* HEFESTOLAB IFC2IA Ready · interface */
(function () {
  'use strict';
  const CORE = window.HEFESTO_IFC2IA;
  const $ = id => document.getElementById(id);
  // Filtro sintético: «solo los elementos con incidencias», sin ser un código de
  // incidencia concreto. Permite que el botón funcione como interruptor.
  const PROBLEM_FILTER = '__PROBLEMATICOS__';
  const state = {
    tab: 'start', analysis: null, selection: new Set(), search: '', category: 'all', level: 'all',
    page: 0, pageSize: 250, profile: 'equilibrado', allowRisk: false, issueFilter: null,
    ifcBytes: null, ifcText: '', viewer: null, viewerHost: null, viewerReady: false, viewerBusy: false,
    viewerError: null, viewerUsesRecovered: false, visualFocus: null, visualIsolated: false,
    viewerRiskAccepted: false, viewerForceAccepted: false, qaColors: false, visualNoGeometry: false
  };
  const demoIfc = `ISO-10303-21;
HEADER;
FILE_DESCRIPTION(('ViewDefinition [CoordinationView_V2.0]'),'2;1');
FILE_NAME('HEFESTO_IFC2IA_DEMO.ifc','2026-08-28T10:00:00',('HEFESTOLAB'),('HEFESTOLAB'),'HEFESTO IFC2IA Ready','HEFESTOLAB','');
FILE_SCHEMA(('IFC2X3'));
ENDSEC;
DATA;
#2=IFCPERSON($,'HEFESTOLAB',$,$,$,$,$,$);
#3=IFCORGANIZATION($,'HEFESTOLAB',$,$,$);
#4=IFCPERSONANDORGANIZATION(#2,#3,$);
#5=IFCAPPLICATION(#3,'1.1','HEFESTO IFC2IA Ready','IFC2IA');
#6=IFCOWNERHISTORY(#4,#5,$,.ADDED.,$,$,$,0);
#10=IFCSIUNIT(*,.LENGTHUNIT.,$,.METRE.);
#11=IFCSIUNIT(*,.AREAUNIT.,$,.SQUARE_METRE.);
#12=IFCSIUNIT(*,.VOLUMEUNIT.,$,.CUBIC_METRE.);
#13=IFCUNITASSIGNMENT((#10,#11,#12));
#14=IFCCARTESIANPOINT((0.,0.,0.));
#15=IFCAXIS2PLACEMENT3D(#14,$,$);
#16=IFCDIRECTION((0.,0.,1.));
#20=IFCPROJECT('0HEFESTOIFC2IADEM0001',#6,'Proyecto demo',$,$,$,$,(#22),#13);
#22=IFCGEOMETRICREPRESENTATIONCONTEXT($,'Model',3,1.E-05,#15,$);
#23=IFCLOCALPLACEMENT($,#15);
#24=IFCSITE('0HEFESTOIFC2IASITE001',#6,'Sitio demo',$,$,#23,$,$,.ELEMENT.,$,$,$,$,$);
#25=IFCLOCALPLACEMENT(#23,#15);
#26=IFCBUILDING('0HEFESTOIFC2IABLDG001',#6,'Edificio demo',$,$,#25,$,$,.ELEMENT.,$,$,$);
#27=IFCCARTESIANPOINT((0.,0.,0.));
#28=IFCAXIS2PLACEMENT3D(#27,$,$);
#29=IFCLOCALPLACEMENT(#25,#28);
#30=IFCBUILDINGSTOREY('0HEFESTOIFC2IANIV0001',#6,'Planta baja',$,$,#29,$,'Planta baja',.ELEMENT.,0.);
#31=IFCBUILDINGSTOREY('0HEFESTOIFC2IANIV0002',#6,'Planta primera',$,$,#34,$,'Planta primera',.ELEMENT.,3.);
#32=IFCCARTESIANPOINT((0.,0.,3.));
#33=IFCAXIS2PLACEMENT3D(#32,$,$);
#34=IFCLOCALPLACEMENT(#25,#33);
#40=IFCCARTESIANPOINT((0.,0.,0.));
#41=IFCAXIS2PLACEMENT3D(#40,$,$);
#42=IFCLOCALPLACEMENT(#29,#41);
#43=IFCCARTESIANPOINT((0.,0.,0.));
#44=IFCAXIS2PLACEMENT3D(#43,$,$);
#45=IFCLOCALPLACEMENT(#34,#44);
#46=IFCCARTESIANPOINT((2.,0.,0.));
#47=IFCAXIS2PLACEMENT3D(#46,$,$);
#48=IFCLOCALPLACEMENT(#29,#47);
#49=IFCCARTESIANPOINT((0.,2.,0.));
#50=IFCAXIS2PLACEMENT3D(#49,$,$);
#51=IFCLOCALPLACEMENT(#34,#50);
#52=IFCCARTESIANPOINT((0.,2.,0.));
#53=IFCAXIS2PLACEMENT3D(#52,$,$);
#54=IFCLOCALPLACEMENT(#29,#53);
#60=IFCRECTANGLEPROFILEDEF(.AREA.,$,$,5.,0.25);
#61=IFCEXTRUDEDAREASOLID(#60,#15,#16,3.);
#62=IFCSHAPEREPRESENTATION(#22,'Body','SweptSolid',(#61));
#63=IFCPRODUCTDEFINITIONSHAPE($,$,(#62));
#64=IFCRECTANGLEPROFILEDEF(.AREA.,$,$,5.,5.);
#65=IFCEXTRUDEDAREASOLID(#64,#15,#16,0.3);
#66=IFCSHAPEREPRESENTATION(#22,'Body','SweptSolid',(#65));
#67=IFCPRODUCTDEFINITIONSHAPE($,$,(#66));
#68=IFCRECTANGLEPROFILEDEF(.AREA.,$,$,0.9,0.2);
#69=IFCEXTRUDEDAREASOLID(#68,#15,#16,2.1);
#70=IFCSHAPEREPRESENTATION(#22,'Body','SweptSolid',(#69));
#71=IFCPRODUCTDEFINITIONSHAPE($,$,(#70));
#72=IFCRECTANGLEPROFILEDEF(.AREA.,$,$,5.,0.3);
#73=IFCEXTRUDEDAREASOLID(#72,#15,#16,0.5);
#74=IFCSHAPEREPRESENTATION(#22,'Body','SweptSolid',(#73));
#75=IFCPRODUCTDEFINITIONSHAPE($,$,(#74));
#76=IFCRECTANGLEPROFILEDEF(.AREA.,$,$,0.3,0.3);
#77=IFCEXTRUDEDAREASOLID(#76,#15,#16,3.);
#78=IFCSHAPEREPRESENTATION(#22,'Body','SweptSolid',(#77));
#79=IFCPRODUCTDEFINITIONSHAPE($,$,(#78));
#100=IFCWALLSTANDARDCASE('0HEFESTOIFC2IAMURO0001',#6,'Muro exterior EI60',$,'Muro 25 cm',#42,#63,'W-01');
#101=IFCSLAB('0HEFESTOIFC2IAFORJ0001',#6,'Forjado planta primera',$,'Forjado 30 cm',#45,#67,'S-01',.FLOOR.);
#102=IFCDOOR('0HEFESTOIFC2IAPUER0001',#6,'Puerta acceso',$,'Puerta 0.90 x 2.10 m',#48,#71,'D-01',2.1,0.9);
#103=IFCBEAM('0HEFESTOIFC2IAVIGA0001',#6,'Viga principal',$,'Viga 30 x 50 cm',#51,#75,'B-01');
#104=IFCCOLUMN('0HEFESTOIFC2IAPILR0001',#6,'Pilar P1',$,'Pilar 30 x 30 cm',#54,#79,'C-01');
#120=IFCWALLTYPE('0HEFESTOIFC2IATIPM001',#6,'Muro genérico 25 cm',$,$,$,$,$,'W-TYPE',$,.STANDARD.);
#121=IFCSLABTYPE('0HEFESTOIFC2IATIPF001',#6,'Forjado hormigón 30 cm',$,$,$,$,$,'S-TYPE',$,.FLOOR.);
#130=IFCRELDEFINESBYTYPE('0HEFESTOIFC2IAREL0001',#6,$,$,(#100),#120);
#131=IFCRELDEFINESBYTYPE('0HEFESTOIFC2IAREL0002',#6,$,$,(#101),#121);
#200=IFCQUANTITYAREA('NetSideArea',$,$,12.5);
#201=IFCQUANTITYAREA('GrossSideArea',$,$,13.1);
#202=IFCQUANTITYVOLUME('NetVolume',$,$,3.125);
#203=IFCELEMENTQUANTITY('0HEFESTOIFC2IAQTO0001',#6,'BaseQuantities',$,$,(#200,#201,#202));
#204=IFCRELDEFINESBYPROPERTIES('0HEFESTOIFC2IAREL0003',#6,$,$,(#100),#203);
#210=IFCQUANTITYAREA('GrossArea',$,$,48.0);
#211=IFCQUANTITYVOLUME('NetVolume',$,$,14.4);
#212=IFCELEMENTQUANTITY('0HEFESTOIFC2IAQTO0002',#6,'BaseQuantities',$,$,(#210,#211));
#213=IFCRELDEFINESBYPROPERTIES('0HEFESTOIFC2IAREL0004',#6,$,$,(#101),#212);
#220=IFCQUANTITYAREA('Area',$,$,1.89);
#221=IFCQUANTITYCOUNT('Count',$,$,1.);
#222=IFCELEMENTQUANTITY('0HEFESTOIFC2IAQTO0003',#6,'BaseQuantities',$,$,(#220,#221));
#223=IFCRELDEFINESBYPROPERTIES('0HEFESTOIFC2IAREL0005',#6,$,$,(#102),#222);
#230=IFCQUANTITYLENGTH('Length',$,$,6.4);
#231=IFCQUANTITYVOLUME('NetVolume',$,$,0.96);
#232=IFCELEMENTQUANTITY('0HEFESTOIFC2IAQTO0004',#6,'BaseQuantities',$,$,(#230,#231));
#233=IFCRELDEFINESBYPROPERTIES('0HEFESTOIFC2IAREL0006',#6,$,$,(#103),#232);
#240=IFCQUANTITYLENGTH('Length',$,$,3.0);
#241=IFCQUANTITYVOLUME('NetVolume',$,$,0.27);
#242=IFCELEMENTQUANTITY('0HEFESTOIFC2IAQTO0005',#6,'BaseQuantities',$,$,(#240,#241));
#243=IFCRELDEFINESBYPROPERTIES('0HEFESTOIFC2IAREL0007',#6,$,$,(#104),#242);
#250=IFCPROPERTYSINGLEVALUE('FireRating',$,IFCLABEL('EI 60'),$);
#251=IFCPROPERTYSINGLEVALUE('IsExternal',$,IFCBOOLEAN(.T.),$);
#252=IFCPROPERTYSET('0HEFESTOIFC2IAPSET001',#6,'Pset_WallCommon',$,(#250,#251));
#253=IFCRELDEFINESBYPROPERTIES('0HEFESTOIFC2IAREL0008',#6,$,$,(#100),#252);
#260=IFCMATERIAL('Hormigón armado');
#261=IFCMATERIAL('Madera');
#262=IFCRELASSOCIATESMATERIAL('0HEFESTOIFC2IAREL0009',#6,$,$,(#100,#101,#103,#104),#260);
#263=IFCRELASSOCIATESMATERIAL('0HEFESTOIFC2IAREL0010',#6,$,$,(#102),#261);
#270=IFCRELCONTAINEDINSPATIALSTRUCTURE('0HEFESTOIFC2IAREL0011',#6,$,$,(#100,#102,#104),#30);
#271=IFCRELCONTAINEDINSPATIALSTRUCTURE('0HEFESTOIFC2IAREL0012',#6,$,$,(#101,#103),#31);
#272=IFCRELAGGREGATES('0HEFESTOIFC2IAREL0013',#6,$,$,#20,(#24));
#273=IFCRELAGGREGATES('0HEFESTOIFC2IAREL0014',#6,$,$,#24,(#26));
#274=IFCRELAGGREGATES('0HEFESTOIFC2IAREL0015',#6,$,$,#26,(#30,#31));
ENDSEC;
END-ISO-10303-21;`;

  function esc(value) { return String(value == null ? '' : value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]); }
  function n0(value) { return new Intl.NumberFormat('es-ES', { maximumFractionDigits: 0 }).format(value || 0); }
  function n(value, digits) { return new Intl.NumberFormat('es-ES', { maximumFractionDigits: digits == null ? 3 : digits }).format(Number.isFinite(value) ? value : 0); }
  function pct(value) { return new Intl.NumberFormat('es-ES', { style: 'percent', maximumFractionDigits: 0 }).format(value || 0); }
  function bytes(value) {
    if (value < 1024) return value + ' B';
    if (value < 1048576) return n(value / 1024, 1) + ' KB';
    return n(value / 1048576, 2) + ' MB';
  }
  function severityClass(severity) { return severity === 'Bloqueante' ? 'block' : severity === 'Aviso' ? 'warn' : 'info'; }
  function statusClass(status) { return status === 'Error' ? 'error' : status === 'Revisar' ? 'warn' : ''; }
  function toast(message, type) {
    const item = document.createElement('div');
    item.className = 'toast ' + (type || ''); item.textContent = message; $('toasts').appendChild(item);
    setTimeout(() => item.remove(), 4200);
  }
  function setStatus(text, kind, meta) {
    $('statusText').textContent = text; $('statusDot').className = 'status-dot ' + (kind || '');
    if (meta != null) $('statusMeta').textContent = meta;
  }
  function setProgress(show, title, text, value) {
    $('progress').classList.toggle('hidden', !show);
    if (title) $('progTitle').textContent = title;
    if (text) $('progText').textContent = text;
    if (value != null) $('progBar').style.width = Math.max(5, Math.min(100, value)) + '%';
    $('app').dataset.busy = show ? 'true' : 'false';
  }
  // Cede el hilo sin depender de requestAnimationFrame: si la pestaña pasa a
  // segundo plano el navegador deja de emitir fotogramas y la carga se quedaba
  // detenida a mitad hasta que el usuario volvía a ella.
  const yieldToHost = (function () {
    if (typeof document !== 'undefined' && typeof MessageChannel === 'function') {
      const channel = new MessageChannel();
      const queue = [];
      channel.port1.onmessage = () => { const resolve = queue.shift(); if (resolve) resolve(); };
      return () => new Promise(resolve => { queue.push(resolve); channel.port2.postMessage(0); });
    }
    return () => new Promise(resolve => setTimeout(resolve, 0));
  })();
  function delayFrame() { return yieldToHost(); }

  async function hashBytes(buffer) {
    if (!crypto || !crypto.subtle) return '';
    try {
      const digest = await crypto.subtle.digest('SHA-256', buffer);
      return [...new Uint8Array(digest)].map(v => v.toString(16).padStart(2, '0')).join('').toUpperCase();
    } catch (_) { return ''; }
  }

  const u16le = (bytes, at) => bytes[at] | (bytes[at + 1] << 8);
  const u32le = (bytes, at) => (bytes[at] | (bytes[at + 1] << 8) | (bytes[at + 2] << 16) | (bytes[at + 3] << 24)) >>> 0;

  /**
   * Extrae el primer .ifc de un contenedor .ifczip/.zip. Se lee el directorio
   * central, no la cadena de cabeceras locales, porque muchos empaquetadores
   * dejan los tamaños a cero y los completan con un descriptor posterior.
   */
  async function extractIfcFromZip(bytes) {
    let eocd = -1;
    for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 66000); i--) {
      if (u32le(bytes, i) === 0x06054b50) { eocd = i; break; }
    }
    if (eocd < 0) throw new Error('El archivo comprimido no tiene un directorio ZIP legible.');
    const count = u16le(bytes, eocd + 10);
    let at = u32le(bytes, eocd + 16);
    if (at === 0xFFFFFFFF) throw new Error('El ZIP usa formato ZIP64, no admitido. Descomprímelo y abre el .ifc directamente.');
    for (let i = 0; i < count && at + 46 <= bytes.length; i++) {
      if (u32le(bytes, at) !== 0x02014b50) break;
      const method = u16le(bytes, at + 10);
      const compressed = u32le(bytes, at + 20);
      const nameLength = u16le(bytes, at + 28);
      const extraLength = u16le(bytes, at + 30);
      const commentLength = u16le(bytes, at + 32);
      const localAt = u32le(bytes, at + 42);
      const name = new TextDecoder('utf-8').decode(bytes.subarray(at + 46, at + 46 + nameLength));
      at += 46 + nameLength + extraLength + commentLength;
      if (!/\.ifc$/i.test(name)) continue;
      if (u32le(bytes, localAt) !== 0x04034b50) throw new Error('La entrada del ZIP no se pudo localizar.');
      const dataAt = localAt + 30 + u16le(bytes, localAt + 26) + u16le(bytes, localAt + 28);
      const payload = bytes.subarray(dataAt, dataAt + compressed);
      if (method === 0) return { bytes: payload.slice(), name };
      if (method !== 8) throw new Error('El ZIP usa una compresión no admitida por el navegador.');
      if (typeof DecompressionStream === 'undefined') throw new Error('Este navegador no puede descomprimir ZIP. Descomprime el archivo y abre el .ifc.');
      const stream = new Blob([payload]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
      const expanded = new Uint8Array(await new Response(stream).arrayBuffer());
      return { bytes: expanded, name };
    }
    throw new Error('El archivo comprimido no contiene ningún .ifc.');
  }

  async function readIfcBytes(file) {
    const buffer = await file.arrayBuffer();
    let bytes = new Uint8Array(buffer);
    let name = file.name;
    if (/\.(?:ifczip|zip)$/i.test(file.name) || (bytes.length > 4 && u32le(bytes, 0) === 0x04034b50)) {
      setProgress(true, 'Descomprimiendo', 'Extrayendo el IFC del contenedor…', 20);
      await delayFrame();
      const extracted = await extractIfcFromZip(bytes);
      bytes = extracted.bytes;
      name = extracted.name.split('/').pop() || file.name;
    }
    return { bytes, name };
  }

  async function loadFile(file) {
    if (!file) return;
    if (/\.(?:ifcxml|xml)$/i.test(file.name)) { toast('Este archivo es ifcXML. IFC2IA lee IFC en formato STEP (.ifc); expórtalo de nuevo como .ifc.', 'error'); return; }
    if (!/\.(?:ifc|ifczip|zip)$/i.test(file.name)) { toast('Selecciona un archivo .ifc o .ifczip.', 'error'); return; }
    if (file.size > 400 * 1048576) {
      toast('El archivo supera los 400 MB: es muy probable que el navegador se quede sin memoria. Divide el modelo por disciplinas.', 'warn');
    }
    setProgress(true, 'Leyendo IFC', 'Comprobando bytes, codificación y estructura STEP…', 8);
    setStatus('Procesando IFC…', '', 'El archivo permanece en este dispositivo');
    try {
      const read = await readIfcBytes(file);
      const rawBytes = read.bytes;
      setProgress(true, 'Leyendo IFC', 'Decodificando el texto STEP…', 14);
      await delayFrame();
      const decoded = CORE.decodeIfcBytes(rawBytes);
      const sha256 = await hashBytes(rawBytes);
      setProgress(true, 'Control previo', 'Recuperando entidades, relaciones y cantidades…', 18);
      await delayFrame();
      const analysis = await CORE.analyze(decoded.text, { name: read.name, size: rawBytes.length, sha256, byteAudit: decoded.byteAudit },
        (value, message) => setProgress(true, 'Control previo', message || 'Analizando el modelo…', 18 + (Number(value) || 0) * 68));
      finishLoad(analysis, rawBytes, decoded.text);
    } catch (error) {
      console.error(error);
      setProgress(false); setStatus('No se pudo abrir el IFC', 'error');
      const detail = String((error && error.message) || error);
      toast(/memory|allocation|RangeError|Array buffer allocation/i.test(detail)
        ? 'El navegador se ha quedado sin memoria con este archivo. Cierra otras pestañas o divide el IFC por disciplinas.'
        : 'No se pudo analizar el IFC: ' + detail, 'error');
    }
  }

  async function loadDemo() {
    setProgress(true, 'Cargando demo', 'Preparando un IFC cuantificado de ejemplo…', 25);
    await delayFrame();
    const encoded = new TextEncoder().encode(demoIfc);
    const analysis = await CORE.analyze(demoIfc, { name: 'HEFESTO_IFC2IA_DEMO.ifc', size: encoded.length, byteAudit: CORE.auditBytes(encoded) });
    finishLoad(analysis, encoded, demoIfc);
  }

  function finishLoad(analysis, rawBytes, ifcText) {
    disposeViewer();
    state.analysis = analysis;
    // El visor recibe una copia propia justo al abrir, así que aquí basta con
    // conservar los bytes originales: duplicarlos multiplicaba la memoria.
    state.ifcBytes = rawBytes || null;
    // El texto completo solo hace falta para reconstruir una copia recuperable
    // cuando el archivo venía dañado. En un IFC sano se libera de inmediato.
    const audit = analysis.source.byteAudit || {};
    const needsRecovery = !!(audit.controlBytes || audit.nulBytes || audit.invalidUtf8 ||
      analysis.source.malformedEntities || (analysis.diagnostics.duplicateStepIds || []).length);
    state.ifcText = needsRecovery ? (ifcText || '') : '';
    state.selection = new Set(analysis.elements.map(e => e.stepId));
    state.search = ''; state.category = 'all'; state.level = 'all'; state.page = 0; state.allowRisk = false; state.issueFilter = null; state.visualFocus = null;
    state.viewerRiskAccepted = false; state.viewerForceAccepted = false; state.visualIsolated = false; state.visualNoGeometry = false; state.qaColors = false;
    $('app').dataset.modelLoaded = 'true'; $('fileName').textContent = analysis.source.name;
    $('fileInfo').textContent = `${bytes(analysis.source.size)} · ${n0(analysis.source.entitiesRecovered)} entidades recuperadas · ${n0(analysis.elements.length)} elementos`;
    $('schemaChip').textContent = analysis.source.schema;
    $('scoreChip').textContent = `QA ${analysis.summary.score}/100`;
    $('scoreChip').className = 'chip ' + (analysis.summary.score >= 80 ? 'score-good' : analysis.summary.score >= 50 ? 'score-warn' : 'score-bad');
    $('badgeAudit').textContent = analysis.findings.length;
    $('badgeElements').textContent = analysis.elements.length;
    $('badgeQuantities').textContent = analysis.quantities.length;
    document.querySelectorAll('.mode-tab').forEach(button => button.disabled = false);
    $('btnReset').disabled = false;
    setProgress(true, 'Preparando panel', 'Calculando cobertura, incidencias y reducción de contexto…', 86);
    yieldToHost().then(() => {
      setProgress(false); switchTab('audit');
      const kind = analysis.summary.blocking ? 'error' : analysis.summary.warnings ? 'warn' : '';
      setStatus(analysis.summary.blocking ? 'IFC cargado con bloqueantes' : 'IFC listo', kind, `${state.selection.size} elementos seleccionados · 0 datos enviados`);
      toast(analysis.summary.blocking ? 'IFC cargado: revisa los bloqueantes antes de exportar.' : 'IFC analizado correctamente.', analysis.summary.blocking ? 'warn' : '');
    });
  }

  function disposeViewer() {
    if (state.viewer) {
      try { state.viewer.dispose(); } catch (_) {}
    }
    if (state.viewerHost) {
      try { state.viewerHost.remove(); } catch (_) {}
    }
    state.viewer = null; state.viewerHost = null; state.viewerReady = false; state.viewerBusy = false;
    state.viewerError = null; state.viewerUsesRecovered = false; state.visualIsolated = false;
  }

  function viewerHostElement() {
    if (!state.viewerHost) {
      const host = document.createElement('div');
      host.className = 'ifc-viewer-canvas';
      state.viewerHost = host;
    }
    return state.viewerHost;
  }

  function mountViewer() {
    const slot = $('ifcViewerHost');
    if (!slot) return;
    slot.appendChild(viewerHostElement());
    if (state.viewer) state.viewer.resize();
    updateViewerOverlay();
    refreshVisualSelection();
  }

  /**
   * ¿Trae el archivo daños que hagan arriesgada la conversión 3D? La conversión
   * de geometría ocurre en el hilo principal del navegador: con un IFC con bytes
   * corruptos puede no terminar nunca y deja la pestaña bloqueada. Por eso se
   * detecta antes, se avisa y se convierte una copia saneada en lugar del original.
   */
  function viewerRisk() {
    if (!state.analysis) return null;
    const audit = state.analysis.source.byteAudit || {};
    const duplicates = (state.analysis.diagnostics.duplicateStepIds || []).length;
    const malformed = state.analysis.source.malformedEntities || 0;
    if (!(audit.controlBytes || audit.nulBytes || audit.invalidUtf8 || malformed || duplicates)) return null;
    const partes = [];
    if (audit.nulBytes) partes.push(`${n0(audit.nulBytes)} bytes nulos`);
    if (audit.controlBytes) partes.push(`${n0(audit.controlBytes)} bytes de control`);
    if (malformed) partes.push(`${n0(malformed)} entidades ilegibles`);
    if (duplicates) partes.push(`${n0(duplicates)} identificadores repetidos`);
    // Si los bytes están alterados, los números de la geometría también lo están:
    // el motor puede quedarse dando vueltas con coordenadas imposibles y no hay
    // manera de cancelarlo, porque convierte en el hilo principal del navegador.
    const blocking = !!(audit.nulBytes || audit.controlBytes || audit.invalidUtf8);
    return { detail: partes.join(' · '), canRepair: !!state.ifcText, blocking };
  }

  function updateViewerOverlay(progress, message) {
    const overlay = $('viewerOverlay');
    if (!overlay) return;
    overlay.classList.toggle('hidden', state.viewerReady && !state.viewerError);
    const title = $('viewerOverlayTitle'), text = $('viewerOverlayText'), bar = $('viewerMiniBar');
    const risk = viewerRisk();
    const pendingRisk = risk && !state.viewerRiskAccepted && !state.viewerReady;
    if (state.viewerError) {
      if (title) title.textContent = 'No se pudo cargar el modelo 3D';
      if (text) text.textContent = state.viewerError;
    } else if (state.viewerBusy) {
      if (title) title.textContent = 'Preparando el visor 3D';
      if (text) text.textContent = message || 'Convirtiendo la geometría localmente…';
    } else if (pendingRisk && risk.blocking) {
      if (title) title.textContent = 'Vista 3D desactivada: el archivo tiene bytes dañados';
      if (text) text.textContent = `El control previo ha encontrado ${risk.detail}. Con los bytes alterados las coordenadas de la geometría también lo están, y el motor 3D puede quedarse bloqueado sin poder cancelarse. El control previo, las cantidades y las exportaciones funcionan con normalidad sin cargar el 3D.`;
    } else if (pendingRisk) {
      if (title) title.textContent = 'Este IFC está dañado: la vista 3D es arriesgada';
      if (text) text.textContent = `El control previo ha encontrado ${risk.detail}. ` + (risk.canRepair
        ? 'Se convertirá una copia saneada en memoria, no el archivo original, y aun así la conversión puede tardar varios minutos. El control y las exportaciones funcionan sin cargar el 3D.'
        : 'La conversión puede tardar varios minutos. El control y las exportaciones funcionan sin cargar el 3D.');
    } else {
      if (title) title.textContent = 'Visualiza el IFC y localiza los problemas';
      if (text) text.textContent = location.protocol === 'file:'
        ? 'Para el visor 3D abre el paquete con INICIAR_HEFESTOLAB_LOCAL.bat. El control y las exportaciones siguen funcionando con doble clic.'
        : 'Carga la geometría cuando quieras. El IFC continúa en este dispositivo.';
    }
    if (bar) bar.style.width = `${Math.max(4, Math.min(100, Math.round((progress || 0) * 100)))}%`;
    const blocked = !!(pendingRisk && risk.blocking);
    const forceRow = $('viewerForceRow'), forceBox = $('viewerForce');
    if (forceRow) forceRow.classList.toggle('hidden', !blocked);
    if (forceBox && !blocked) forceBox.checked = false;
    const button = $('viewerLoadButton');
    if (button) {
      button.disabled = state.viewerBusy || !state.ifcBytes || location.protocol === 'file:' ||
        (blocked && !state.viewerForceAccepted);
      button.textContent = state.viewerError
        ? 'Reintentar carga 3D'
        : blocked
          ? 'Forzar la conversión 3D'
          : pendingRisk
            ? (risk.canRepair ? 'Intentar con una copia saneada' : 'Intentar de todos modos')
            : 'Cargar modelo 3D';
      button.classList.toggle('warn', !!pendingRisk);
    }
  }

  function viewerElementByGuid(guid) {
    return state.analysis && state.analysis.elements.find(element => element.globalId === guid);
  }

  async function loadViewer(options) {
    if (state.viewerReady && state.viewer) { state.viewer.resize(); return state.viewer; }
    if (state.viewerBusy) return null;
    if (!state.analysis || !state.ifcBytes) return null;
    if (location.protocol === 'file:') {
      state.viewerError = 'El visor 3D necesita el servidor local incluido para cargar los módulos gráficos. Ejecuta INICIAR_HEFESTOLAB_LOCAL.bat.';
      updateViewerOverlay();
      return null;
    }
    if (!window.HEFESTO_IFC2IA_VIEWER) {
      state.viewerError = 'No se ha encontrado el módulo visual IFC2IA.';
      updateViewerOverlay();
      return null;
    }
    // Un IFC dañado puede dejar la conversión de geometría dando vueltas en el
    // hilo principal sin final. Solo se arranca desde el botón del visor, que
    // muestra antes el aviso: aislar o seleccionar nunca la dispara por sorpresa.
    const risk = viewerRisk();
    if (risk && !state.viewerRiskAccepted) {
      if (!options || !options.confirmRisk) { updateViewerOverlay(0); return null; }
      if (risk.blocking && !state.viewerForceAccepted) { updateViewerOverlay(0); return null; }
      state.viewerRiskAccepted = true;
    }
    state.viewerBusy = true; state.viewerError = null; updateViewerOverlay(.03, 'Iniciando la escena…');
    setStatus('Cargando modelo 3D…', '', 'El IFC permanece en este dispositivo');
    try {
      const recoveryEligible = !!risk && !!state.ifcText;
      const createViewer = () => {
        let viewer;
        viewer = new window.HEFESTO_IFC2IA_VIEWER.Viewer(viewerHostElement(), {
          onProgress(value, text) { updateViewerOverlay(value, text); },
          onStatus(text, kind) { setStatus(text, kind); },
          onPick(guid) {
            if (!guid) { state.visualFocus = null; viewer.clearSelection(); renderElements(); return; }
            const element = viewerElementByGuid(guid);
            if (!element) { toast('Ese objeto del modelo no es un elemento medible (puerto, anotación o geometría auxiliar).', 'warn'); return; }
            state.visualFocus = element.stepId;
            viewer.select([guid], { zoom: false, problem: element.status !== 'Correcto' });
            // Se repinta la lista para que el elemento pulsado tenga ficha aunque
            // esté fuera de la ventana visible o del filtro activo: si no, hacer
            // clic en el 3D no resaltaba nada en el panel.
            renderElements();
            refreshVisualSelection(true);
          }
        });
        return viewer;
      };
      const openAttempt = async (viewerBytes, recovered) => {
        state.viewerUsesRecovered = recovered;
        const viewer = createViewer(); state.viewer = viewer;
        const result = await viewer.open(viewerBytes, state.analysis.source.name, state.analysis.elements);
        return { viewer, result };
      };

      const cleanUp = () => {
        if (state.viewer) { try { state.viewer.dispose(); } catch (_) {} }
        state.viewer = null;
      };
      let opened;
      if (recoveryEligible) {
        // Con un archivo dañado se convierte la copia saneada, NO el original:
        // entregarle bytes corruptos a web-ifc podía bloquear la pestaña entera
        // sin posibilidad de cancelar. El archivo del usuario no se modifica.
        updateViewerOverlay(.05, 'Preparando una copia saneada en memoria; el original no se modifica…');
        await delayFrame();
        const recoveredBytes = new TextEncoder().encode(CORE.buildViewerIfc(state.ifcText));
        try { opened = await openAttempt(recoveredBytes, true); }
        catch (recoveredError) {
          console.warn('La copia saneada no abrió en 3D; se intenta el original.', recoveredError);
          cleanUp();
          updateViewerOverlay(.06, 'La copia saneada no ha funcionado; probando con el archivo original…');
          try { opened = await openAttempt(state.ifcBytes.slice(), false); }
          catch (originalError) { originalError.originalCause = recoveredError; throw originalError; }
        }
      } else {
        try {
          opened = await openAttempt(state.ifcBytes.slice(), false);
        } catch (originalError) {
          if (!state.ifcText) throw originalError;
          console.warn('El IFC original no abrió en 3D; se intenta una copia saneada en memoria.', originalError);
          cleanUp();
          updateViewerOverlay(.06, 'Reintentando con una copia saneada; el original permanece intacto…');
          const recoveredBytes = new TextEncoder().encode(CORE.buildViewerIfc(state.ifcText));
          try { opened = await openAttempt(recoveredBytes, true); }
          catch (recoveredError) { recoveredError.originalCause = originalError; throw recoveredError; }
        }
      }
      const viewer = opened.viewer, result = opened.result;
      state.viewerReady = true; state.viewerBusy = false; state.viewerError = null;
      if (state.tab === 'elements') renderElements();
      else updateViewerOverlay(1, 'Modelo listo');
      setStatus('Modelo 3D listo', '', `${result.linked} de ${result.source} elementos enlazados por GlobalId${state.viewerUsesRecovered ? ' · vista recuperable' : ''}`);
      toast(`Visor listo: ${result.linked} elementos enlazados con el control QA.`);
      return viewer;
    } catch (error) {
      console.error(error);
      if (state.viewer) { try { state.viewer.dispose(); } catch (_) {} }
      state.viewer = null; state.viewerReady = false; state.viewerBusy = false;
      const detail = String(error && (error.code || error.message) || error);
      state.viewerError = /VENDOR_MISSING|worker|web-ifc\.wasm|404|failed to fetch|network/i.test(detail)
        ? 'No se han podido abrir los recursos gráficos locales. Comprueba que el ZIP se descomprimió completo y vuelve a intentarlo.'
        : /memory|out of bounds|allocation|map maximum|rangeerror|tiempo máximo/i.test(detail)
          ? 'El modelo supera la memoria disponible para la conversión 3D en este navegador. La auditoría y las exportaciones siguen activas; cierra otras pestañas o divide el IFC por disciplinas.'
          : 'La geometría del IFC no ha podido convertirse. Se ha probado primero el archivo original y, si procedía, una copia recuperable en memoria; el original nunca se modifica.';
      updateViewerOverlay();
      setStatus('Visor 3D no disponible', 'warn', 'El control y las exportaciones siguen activos');
      toast(state.viewerError, 'warn');
      return null;
    }
  }

  /** Devuelve la vista completa: sin aislar, sin filtros y sin selección resaltada. */
  function showEverything() {
    state.visualIsolated = false;
    state.visualNoGeometry = false;
    state.issueFilter = null;
    state.search = '';
    state.category = 'all';
    state.level = 'all';
    state.page = 0;
    state.visualFocus = null;
    if (state.viewer) {
      Promise.resolve(state.viewer.showAll()).catch(() => {});
      Promise.resolve(state.viewer.clearSelection()).catch(() => {});
    }
    renderSide();
    if (state.tab === 'elements') renderElements(); else renderStage();
    setStatus('Vista completa restablecida', '', `${state.analysis ? state.analysis.elements.length : 0} elementos visibles`);
  }

  /**
   * Lleva al modelo 3D el filtro activo del panel izquierdo. Sin filtro devuelve
   * el modelo completo; con filtro aísla y encuadra ese conjunto sin repintarlo,
   * para no perder los colores reales del IFC.
   */
  async function syncViewerWithFilter() {
    if (!state.viewerReady || !state.viewer || !state.analysis) return;
    const rows = filteredElements();
    const total = state.analysis.elements.length;
    if (!rows.length) { toast('Ningún elemento coincide con el filtro.', 'warn'); return; }
    if (rows.length === total) {
      state.visualIsolated = false;
      await state.viewer.showAll();
      await state.viewer.clearSelection();
      await state.viewer.fit();
      syncIsolationBar();
      return;
    }
    await focusVisualElements(rows, { isolate: true, highlight: false });
  }

  function visualGuids(elements) { return elements.map(element => element.globalId).filter(Boolean); }

  async function focusVisualElements(elements, options) {
    if (!elements || !elements.length) { toast('No hay elementos enlazables en este filtro.', 'warn'); return; }
    const viewer = state.viewerReady ? state.viewer : await loadViewer();
    if (!viewer) {
      if (viewerRisk() && !state.viewerRiskAccepted) toast('Este IFC está dañado: pulsa antes «Cargar 3D» y confirma el aviso del visor.', 'warn');
      return;
    }
    const guids = visualGuids(elements);
    if (options && options.showAll) await viewer.showAll();
    if (options && options.isolate) {
      const count = await viewer.isolate(guids);
      if (!count) {
        // Sin geometría no se aísla nada: el modelo se queda como estaba en vez
        // de vaciarse la pantalla, que es lo que ocurría antes.
        state.visualNoGeometry = true;
        syncIsolationBar();
        toast('Esos elementos no tienen geometría propia en el modelo 3D. El modelo se deja como estaba.', 'warn');
        return;
      }
      state.visualIsolated = true;
      state.visualNoGeometry = false;
      // El aviso se pinta ya: no debe depender de que termine el encuadre.
      syncIsolationBar();
    }
    if (options && options.highlight === false) {
      // Filtrar por categoría o planta encuadra el conjunto pero no lo repinta:
      // así se sigue viendo el color real de los materiales del IFC.
      await viewer.clearSelection();
      if (!(options && options.zoom === false)) await viewer.zoomTo(guids);
    } else {
      await viewer.select(guids, { zoom: !(options && options.zoom === false), problem: !!(options && options.problem) });
    }
    if (elements.length === 1) state.visualFocus = elements[0].stepId;
    refreshVisualSelection(true);
  }

  /**
   * Mantiene el aviso de vista reducida al día sin rehacer todo el panel: aislar
   * desde la barra de herramientas cambiaba el estado del 3D pero no avisaba de
   * ello por ninguna parte.
   */
  function syncIsolationBar() {
    const card = document.querySelector('.model-card');
    if (!card) return;
    const existing = card.querySelector('.isolation-bar');
    const html = state.analysis ? isolationBar(filteredElements()) : '';
    if (!html) { if (existing) existing.remove(); return; }
    if (existing) { existing.outerHTML = html; return; }
    const host = card.querySelector('.ifc-viewer-host');
    if (host) host.insertAdjacentHTML('beforebegin', html);
  }

  function refreshVisualSelection(scroll) {
    syncIsolationBar();
    document.querySelectorAll('[data-visual-card]').forEach(card => card.classList.toggle('focused', +card.dataset.visualCard === state.visualFocus));
    const detail = $('visualDetail');
    const element = state.analysis && state.analysis.elements.find(item => item.stepId === state.visualFocus);
    if (detail) {
      detail.innerHTML = element ? `<b>${esc(element.description || element.name || element.ifcClass)}</b><span>${esc(element.ifcClass)} · ${esc(element.level)} · ${esc(element.unit)} ${n(element.value, 5)}</span><small>${esc(element.quantityOrigin || '')}${element.issues.length ? ' · ' + esc(element.issues.join(' · ')) : (element.notes.length ? ' · ' + esc(element.notes.join(' · ')) : '')}</small>` : '<span>Haz clic en el modelo o en un elemento del panel.</span>';
    }
    if (scroll && element) {
      const card = document.querySelector(`[data-visual-card="${element.stepId}"]`);
      if (card) card.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }

  function reset() {
    disposeViewer();
    state.analysis = null; state.selection.clear(); state.tab = 'start'; state.issueFilter = null; state.search = ''; state.category = 'all'; state.level = 'all'; state.viewerRiskAccepted = false; state.viewerForceAccepted = false; state.visualIsolated = false;
    state.ifcBytes = null; state.ifcText = '';
    $('app').dataset.modelLoaded = 'false'; $('fileName').textContent = 'Proyecto sin cargar'; $('fileInfo').textContent = 'IFC → control previo → Excel / JSON para IA';
    $('schemaChip').textContent = '—'; $('scoreChip').textContent = '—'; $('scoreChip').className = 'chip';
    $('badgeAudit').textContent = '0'; $('badgeElements').textContent = '0'; $('badgeQuantities').textContent = '0';
    document.querySelectorAll('.mode-tab').forEach(button => { if (button.dataset.tab !== 'start') button.disabled = true; });
    $('btnReset').disabled = true; $('ifcInput').value = ''; setStatus('Preparado', '', 'Todo se procesa en este navegador'); switchTab('start');
  }

  function switchTab(tab) {
    if (tab !== 'start' && !state.analysis) return;
    state.tab = tab;
    document.querySelectorAll('.mode-tab').forEach(button => button.classList.toggle('active', button.dataset.tab === tab));
    renderSide(); renderStage(); $('stage').focus({ preventScroll: true });
  }

  function selectionSummary() {
    if (!state.analysis) return { total: 0, quantities: 0, properties: 0 };
    const ids = state.selection, selected = state.analysis.elements.filter(e => ids.has(e.stepId));
    return {
      total: selected.length,
      quantities: state.analysis.quantities.filter(q => ids.has(q.elementId)).length,
      properties: state.analysis.properties.filter(p => ids.has(p.elementId)).length,
      errors: selected.filter(e => e.status === 'Error').length,
      review: selected.filter(e => e.status === 'Revisar').length
    };
  }

  function renderSide() {
    const a = state.analysis;
    if (!a) {
      $('sidePanel').innerHTML = `<div class="side-block"><h3>Qué resuelve</h3><p>Convierte un IFC pesado en un conjunto cuantificado, trazable y pequeño para que una IA pueda preparar mediciones y presupuestos sin consumir el modelo completo.</p></div><div class="side-block"><h3>Privacidad</h3><p>El IFC se lee en memoria. No se sube, no se modifica y no sale del navegador.</p></div><div class="side-block"><h3>Salidas</h3><div class="side-stat"><b>Excel</b><span>7 hojas</span></div><div class="side-stat"><b>JSON</b><span>compacto</span></div><div class="side-stat"><b>Trazabilidad</b><span>GlobalId + STEP</span></div></div>`;
      return;
    }
    const s = selectionSummary();
    let html = `<div class="side-block"><h3>Selección activa</h3><div class="side-stat"><b>Elementos</b><span>${n0(s.total)} / ${n0(a.elements.length)}</span></div><div class="side-stat"><b>Cantidades IFC</b><span>${n0(s.quantities)}</span></div><div class="side-stat"><b>Propiedades</b><span>${n0(s.properties)}</span></div><div class="side-stat"><b>Para revisar</b><span>${n0(s.errors + s.review)}</span></div></div>`;
    if (state.tab === 'elements') {
      html += `<div class="side-block"><h3>Selección rápida</h3><div class="side-actions"><button class="quiet-btn" data-action="select-filtered">Todo visible</button><button class="quiet-btn" data-action="clear-filtered">Nada visible</button></div></div><div class="side-block"><h3>Categorías</h3><div class="filter-list"><label class="filter-item ${state.category === 'all' ? 'active' : ''}"><input type="radio" name="category" value="all" ${state.category === 'all' ? 'checked' : ''}><span>Todas</span><small>${a.elements.length}</small></label>${a.summary.categories.map(row => `<label class="filter-item ${state.category === row.name ? 'active' : ''}"><input type="radio" name="category" value="${esc(row.name)}" ${state.category === row.name ? 'checked' : ''}><span>${esc(row.name)}</span><small>${row.total}</small></label>`).join('')}</div></div><div class="side-block"><h3>Niveles</h3><div class="filter-list"><label class="filter-item ${state.level === 'all' ? 'active' : ''}"><input type="radio" name="level" value="all" ${state.level === 'all' ? 'checked' : ''}><span>Todos</span></label>${a.summary.levels.map(row => `<label class="filter-item ${state.level === row.name ? 'active' : ''}"><input type="radio" name="level" value="${esc(row.name)}" ${state.level === row.name ? 'checked' : ''}><span>${esc(row.name)}</span><small>${row.total}</small></label>`).join('')}</div></div>`;
    } else if (state.tab === 'export') {
      html += `<div class="side-block"><h3>Contexto estimado</h3><div class="side-stat"><b>IFC original</b><span>≈ ${n0(a.summary.originalTokens)} tokens</span></div><div class="side-stat"><b>IFC2IA</b><span>≈ ${n0(a.summary.compactTokens)} tokens</span></div><div class="side-stat"><b>Reducción</b><span>${pct(a.summary.tokenReduction)}</span></div></div><div class="side-block"><h3>Contenido preservado</h3><p>Identidad, clase, tipo, planta, materiales, cantidades, propiedades seleccionadas, incidencias y referencias STEP/GlobalId.</p></div>`;
    } else {
      const units = a.source.units || {};
      html += `<div class="side-block"><h3>Modelo</h3><div class="side-stat"><b>Esquema</b><span>${esc(a.source.schema)}</span></div><div class="side-stat"><b>Tamaño</b><span>${bytes(a.source.size)}</span></div><div class="side-stat"><b>Recuperadas</b><span>${n0(a.source.entitiesRecovered)}</span></div><div class="side-stat"><b>Dañadas</b><span>${n0(a.source.malformedEntities)}</span></div></div><div class="side-block"><h3>Unidades del IFC</h3><div class="side-stat"><b>Longitud</b><span>${esc(units.length || 'METRE')}</span></div><div class="side-stat"><b>Superficie</b><span>${esc(units.area || 'SQUARE_METRE')}</span></div><div class="side-stat"><b>Volumen</b><span>${esc(units.volume || 'CUBIC_METRE')}</span></div><p>Las cantidades y cotas se convierten a m, m², m³ y kg.</p></div><div class="side-block"><h3>Regla de oro</h3><p>Un bloqueante no impide ver lo recuperable, pero sí exige confirmación antes de descargar los archivos.</p></div>`;
    }
    $('sidePanel').innerHTML = html;
  }

  function renderStage() {
    $('stage').classList.toggle('visual-mode', state.tab === 'elements');
    if (state.tab === 'start') renderStart();
    else if (state.tab === 'audit') renderAudit();
    else if (state.tab === 'elements') renderElements();
    else if (state.tab === 'quantities') renderQuantities();
    else renderExport();
  }

  function renderStart() {
    $('stage').innerHTML = `<div class="start-wrap"><section class="hero-panel"><div><span class="eyebrow">HEFESTOLAB Tools · Gratis · Local</span><h1>Del IFC pesado a datos <span>listos para IA.</span></h1><p>Detecta antes los fallos del modelo, selecciona únicamente lo que vas a medir y descarga un Excel estructurado y un JSON compacto. La IA recibe cantidades y trazabilidad, no millones de coordenadas y geometrías que disparan el contexto.</p></div><label class="dropzone" id="dropzone" for="ifcInput"><span><i class="drop-icon">⇩</i><b>Arrastra aquí tu IFC</b><span>IFC2X3 · IFC4 · IFC4X3 · también .ifczip · sin subirlo a ningún servidor</span><span class="action-btn primary">Seleccionar archivo</span></span></label></section><div class="principle-grid"><article class="principle"><i>01</i><b>Control antes de medir</b><span>Codificación, STEP, GlobalId, niveles, clases, cantidades, proxies y cobertura.</span></article><article class="principle"><i>02</i><b>Selección visual</b><span>Filtra por categoría, planta, texto o incidencia y decide qué entra en el presupuesto.</span></article><article class="principle"><i>03</i><b>Excel preparado</b><span>Mediciones editables, fórmulas, trazabilidad, QA, resúmenes y configuración de costes.</span></article><article class="principle"><i>04</i><b>Menos tokens</b><span>El JSON tabular elimina geometría repetitiva sin perder los datos útiles para presupuesto.</span></article></div></div>`;
  }

  function renderAudit() {
    const a = state.analysis;
    const findings = state.issueFilter ? a.findings.filter(f => f.code === state.issueFilter) : a.findings;
    $('stage').innerHTML = `<div class="page-head"><div><span class="eyebrow">Fase 1 · Control previo</span><h2>Qué puede salir mal antes de pedir un presupuesto.</h2><p>La app no corrige ni oculta el origen: muestra lo recuperado, lo dudoso y lo que debe bloquearse.</p></div><div class="toolbar"><button class="action-btn secondary" data-tab-go="elements">Revisar elementos →</button></div></div><div class="stats-grid"><article class="stat-card score-card"><div><small>Calidad del modelo</small><b>${a.summary.score}/100</b><span>${a.summary.blocking ? 'Hay bloqueantes' : a.summary.warnings ? 'Revisión recomendada' : 'Sin incidencias críticas'}</span></div><div class="score-ring" style="--score:${a.summary.score}"><b>${a.summary.score}</b></div></article><article class="stat-card"><small>Elementos recuperados</small><b>${n0(a.elements.length)}</b><span>${n0(a.source.entitiesRecovered)} entidades STEP válidas</span></article><article class="stat-card"><small>Cobertura de cantidades</small><b>${pct(a.summary.coverage)}</b><span>${n0(a.quantities.length)} cantidades IFC normalizadas</span></article><article class="stat-card"><small>Reducción estimada IA</small><b>${pct(a.summary.tokenReduction)}</b><span>≈ ${n0(a.summary.originalTokens)} → ${n0(a.summary.compactTokens)} tokens</span></article></div><section class="panel"><div class="panel-head"><h3>Incidencias del control previo</h3><span>${findings.length} comprobaciones con resultado</span></div><div class="finding-list">${findings.length ? findings.map(f => `<article class="finding"><span class="severity ${severityClass(f.severity)}">${esc(f.severity)}</span><b>${esc(f.title)}</b><p>${esc(f.detail)}${f.action ? `<br><strong>Acción:</strong> ${esc(f.action)}` : ''}</p>${f.elementIds.length ? `<button data-finding="${esc(f.code)}">Ver ${f.elementIds.length} elementos</button>` : '<span></span>'}</article>`).join('') : '<div class="table-note">No se han detectado incidencias.</div>'}</div></section><div class="two-cols"><section class="panel"><div class="panel-head"><h3>Elementos por categoría</h3><span>cobertura de cantidades</span></div><div class="bar-list">${barRows(a.summary.categories.map(row => ({ label: row.name, value: row.withQuantities, total: row.total, suffix: `${row.withQuantities}/${row.total}` })))}</div></section><section class="panel"><div class="panel-head"><h3>Elementos por nivel</h3><span>estructura espacial</span></div><div class="bar-list">${barRows(a.summary.levels.map(row => ({ label: row.name, value: row.total, total: Math.max(...a.summary.levels.map(x => x.total), 1), suffix: row.total })))}</div></section></div>`;
  }

  function barRows(rows) {
    return rows.map(row => `<div class="bar-row"><span title="${esc(row.label)}">${esc(row.label)}</span><div class="bar-track"><i style="width:${Math.max(2, Math.min(100, row.total ? row.value / row.total * 100 : 0))}%"></i></div><b>${esc(row.suffix)}</b></div>`).join('') || '<div class="table-note">Sin datos.</div>';
  }

  function filteredElements() {
    if (!state.analysis) return [];
    const q = state.search.trim().toLowerCase();
    let rows = state.analysis.elements.filter(e => (state.category === 'all' || e.category === state.category) && (state.level === 'all' || e.level === state.level));
    if (state.issueFilter === PROBLEM_FILTER) rows = rows.filter(e => e.status !== 'Correcto');
    else if (state.issueFilter) {
      // El conjunto se calcula una vez: recorrer elementIds por cada elemento
      // hacía que filtrar un modelo grande tardara segundos.
      const finding = state.analysis.findings.find(f => f.code === state.issueFilter);
      const ids = new Set(finding ? finding.elementIds : []);
      rows = rows.filter(e => e.issues.includes(state.issueFilter) || ids.has(e.stepId));
    }
    if (q) rows = rows.filter(e => [e.globalId, e.ifcClass, e.category, e.level, e.name, e.description, e.typeName, e.materials.map(m => m.name).join(' '), e.issues.join(' ')].join(' ').toLowerCase().includes(q));
    return rows;
  }

  /**
   * Aviso siempre visible cuando la vista está reducida. Antes, aislar dejaba el
   * modelo con unos pocos elementos y el botón para deshacerlo se ocultaba por
   * CSS en pantallas de menos de 1250 px: no había forma evidente de volver.
   */
  function isolationBar(rows) {
    const total = state.analysis.elements.length;
    const listaReducida = rows.length < total;
    if (!state.visualIsolated && !state.visualNoGeometry && !listaReducida) return '';
    const partes = [];
    if (state.visualIsolated) partes.push('el modelo 3D muestra solo los elementos aislados');
    else if (state.visualNoGeometry) partes.push('esos elementos no se dibujan en 3D (huecos, conjuntos o piezas sin forma propia), así que el modelo sigue completo');
    if (listaReducida) partes.push(`la lista muestra ${n0(rows.length)} de ${n0(total)} elementos`);
    return `<div class="isolation-bar"><span><b>Vista reducida:</b> ${esc(partes.join(' y '))}.</span><button class="action-btn primary" data-action="viewer-show-all">Ver todo el modelo</button></div>`;
  }

  function renderElements() {
    const rows = filteredElements();
    const problematic = state.analysis.elements.filter(element => element.status !== 'Correcto');
    const linkedFindings = state.analysis.findings.filter(finding => finding.elementIds.length);
    const visible = rows.slice(0, 180);
    // El elemento seleccionado en el 3D siempre tiene ficha, aunque quede fuera
    // de los primeros 180 o no pase el filtro: es lo que enlaza modelo y panel.
    if (state.visualFocus != null && !visible.some(element => element.stepId === state.visualFocus)) {
      const focused = state.analysis.elements.find(element => element.stepId === state.visualFocus);
      if (focused) visible.unshift(focused);
    }
    $('stage').innerHTML = `<div class="visual-shell"><div class="visual-heading"><div><span class="eyebrow">Fase 2 · Revisión visual</span><h2>Modelo e incidencias, en el mismo lugar.</h2><p>${n0(rows.length)} elementos visibles · ${n0(problematic.length)} con incidencias · ${n0(state.selection.size)} incluidos en la exportación.</p></div><div class="toolbar"><input class="search" id="elementSearch" type="search" value="${esc(state.search)}" placeholder="Buscar clase, nombre, GlobalId, material…"><button class="action-btn primary" data-tab-go="export">Preparar exportación →</button></div></div><div class="visual-grid"><section class="model-card"><div class="model-toolbar"><div><b>IFC interactivo</b><span>${state.viewerUsesRecovered ? 'vista saneada · original intacto' : 'órbita · zoom · selección por clic'}</span></div><div class="model-actions"><button class="quiet-btn" data-action="viewer-load">Cargar 3D</button><button class="quiet-btn" data-action="viewer-show-all" ${state.viewerReady ? '' : 'disabled'}>Ver todo</button><button class="quiet-btn" data-action="viewer-fit" ${state.viewerReady ? '' : 'disabled'}>Encuadrar</button><button class="quiet-btn" data-action="viewer-isolate-selected" ${state.viewerReady ? '' : 'disabled'}>Aislar incluidos</button><button class="quiet-btn ${state.qaColors ? 'active' : ''}" data-action="viewer-qa-colors" ${state.viewerReady ? '' : 'disabled'} title="Alternar entre los materiales del IFC y el color por estado de la medición">${state.qaColors ? 'Color real' : 'Color QA'}</button><button class="quiet-btn optional" data-action="viewer-view" data-view="iso" ${state.viewerReady ? '' : 'disabled'}>ISO</button><button class="quiet-btn optional" data-action="viewer-view" data-view="planta" ${state.viewerReady ? '' : 'disabled'}>Planta</button></div></div>${isolationBar(rows)}<div class="ifc-viewer-host" id="ifcViewerHost"><div class="viewer-overlay" id="viewerOverlay"><div class="viewer-overlay-card"><i>◇</i><b id="viewerOverlayTitle">Visualiza el IFC y localiza los problemas</b><p id="viewerOverlayText">Carga la geometría cuando quieras. El IFC continúa en este dispositivo.</p><div class="mini-progress"><span id="viewerMiniBar"></span></div><label class="viewer-force hidden" id="viewerForceRow"><input type="checkbox" id="viewerForce"><span>Entiendo que el navegador puede quedarse bloqueado y que tendría que cerrar la pestaña. El control previo y las exportaciones ya están disponibles sin el 3D.</span></label><button class="action-btn primary" id="viewerLoadButton" data-action="viewer-load">Cargar modelo 3D</button></div></div></div><div class="model-bottom"><div class="viewer-legend">${state.qaColors ? '<span><i class="normal"></i>Correcto</span><span><i class="review"></i>Revisar</span><span><i class="error"></i>Problemático</span>' : '<span>Materiales del IFC</span>'}<span><i class="selected"></i>Seleccionado</span></div><div class="visual-detail" id="visualDetail"><span>Haz clic en el modelo o en un elemento del panel.</span></div></div></section><aside class="visual-control"><div class="control-head"><div><span class="eyebrow">Panel de control</span><h3>Problemas y elementos</h3></div>${state.issueFilter ? '<button class="quiet-btn" data-action="clear-issue">Quitar filtro</button>' : ''}</div><div class="control-actions"><button class="action-btn ${state.issueFilter === PROBLEM_FILTER ? 'primary' : 'secondary'}" data-action="viewer-problems">${state.issueFilter === PROBLEM_FILTER ? 'Volver al modelo completo' : `Ver ${n0(problematic.length)} problemáticos`}</button><button class="action-btn secondary" data-action="select-filtered">Incluir visibles</button><button class="action-btn secondary" data-action="clear-filtered">Excluir visibles</button></div><div class="issue-buttons">${linkedFindings.map(finding => `<button class="issue-button ${state.issueFilter === finding.code ? 'active' : ''}" data-visual-finding="${esc(finding.code)}"><span class="severity ${severityClass(finding.severity)}">${esc(finding.severity)}</span><b>${esc(finding.title)}</b><small>${finding.elementIds.length} elementos</small></button>`).join('') || '<p class="empty-control">No hay incidencias vinculadas a elementos.</p>'}</div><div class="element-control-list">${visible.map(element => `<article class="visual-element ${statusClass(element.status)}" data-visual-card="${element.stepId}"><label title="Incluir en la exportación"><input class="row-check" type="checkbox" data-select-id="${element.stepId}" ${state.selection.has(element.stepId) ? 'checked' : ''}></label><button data-visual-element="${element.stepId}"><span class="state-dot ${statusClass(element.status)}"></span><b>${esc(element.description || element.name || element.ifcClass)}</b><small>${esc(element.ifcClass)} · ${esc(element.level)}</small><small>${esc(element.unit)} ${n(element.value, 5)} · #${element.stepId}</small>${element.issues.length ? `<em>${esc(element.issues.slice(0, 3).join(' · '))}</em>` : (element.notes.length ? `<small class=\"note\">${esc(element.notes.slice(0, 2).join(' · '))}</small>` : '')}</button></article>`).join('') || '<p class="empty-control">Ningún elemento coincide con los filtros.</p>'}</div>${rows.length > visible.length ? `<div class="control-note">Se muestran los primeros ${visible.length} de ${rows.length}; el Excel conserva toda la selección.</div>` : ''}</aside></div></div>`;
    const input = $('elementSearch'); if (input) { input.focus({ preventScroll: true }); input.setSelectionRange(input.value.length, input.value.length); }
    mountViewer();
  }

  function renderQuantities() {
    const a = state.analysis, ids = state.selection;
    const qRows = a.quantities.filter(q => ids.has(q.elementId));
    const unitTotals = new Map(); qRows.forEach(q => unitTotals.set(q.unit, (unitTotals.get(q.unit) || 0) + (Number.isFinite(q.value) ? q.value : 0)));
    const elementRows = a.elements.filter(e => ids.has(e.stepId));
    const byCat = new Map(); elementRows.forEach(e => { const row = byCat.get(e.category) || { label: e.category, count: 0, measured: 0 }; row.count++; if (e.quantities.length) row.measured++; byCat.set(e.category, row); });
    $('stage').innerHTML = `<div class="page-head"><div><span class="eyebrow">Fase 3 · Cantidades</span><h2>Una medición propuesta, todas las cantidades conservadas.</h2><p>La unidad principal alimenta el presupuesto; Gross/Net y cantidades alternativas siguen disponibles para auditoría. Todo está convertido desde ${esc((a.source.units && a.source.units.length) || 'METRE')} a m, m², m³ y kg.</p></div><div class="toolbar"><button class="action-btn primary" data-tab-go="export">Exportar selección →</button></div></div><div class="stats-grid">${['m²','m³','m','ud'].map(unit => `<article class="stat-card"><small>Total ${unit}</small><b>${n(unitTotals.get(unit) || 0, 3)}</b><span>${qRows.filter(q => q.unit === unit).length} cantidades originales</span></article>`).join('')}</div><div class="two-cols"><section class="panel"><div class="panel-head"><h3>Cobertura por categoría</h3><span>selección activa</span></div><div class="bar-list">${barRows([...byCat.values()].map(row => ({ label: row.label, value: row.measured, total: row.count, suffix: `${row.measured}/${row.count}` })))}</div></section><section class="panel"><div class="panel-head"><h3>Qué se exporta</h3><span>estructura para IA</span></div><div class="bar-list"><div class="side-stat"><b>Elementos seleccionados</b><span>${n0(elementRows.length)}</span></div><div class="side-stat"><b>Cantidades IFC</b><span>${n0(qRows.length)}</span></div><div class="side-stat"><b>Propiedades trazables</b><span>${n0(a.properties.filter(p => ids.has(p.elementId)).length)}</span></div><div class="side-stat"><b>GlobalId conservados</b><span>${n0(elementRows.filter(e => e.globalId).length)}</span></div></div></section></div><section class="panel"><div class="panel-head"><h3>Cantidades IFC normalizadas</h3><span>${qRows.length} filas</span></div><div class="table-wrap"><table><thead><tr><th>Nivel</th><th>Elemento</th><th>Clase</th><th>Conjunto</th><th>Cantidad</th><th>Unidad</th><th>Valor</th><th>Origen</th><th>STEP</th></tr></thead><tbody>${qRows.slice(0, 500).map(q => `<tr><td>${esc(q.level)}</td><td class="main"><b>${esc(q.description)}</b><small>${esc(q.globalId)}</small></td><td>${esc(q.ifcClass)}</td><td>${esc(q.setName)}</td><td>${esc(q.name)}</td><td>${esc(q.unit)}</td><td class="num">${n(q.value, 8)}</td><td>${esc(q.source || 'IfcElementQuantity')}</td><td class="mono">#${q.sourceStepId}</td></tr>`).join('')}</tbody></table></div>${qRows.length > 500 ? `<div class="table-note">Vista limitada a 500 filas; el Excel conserva las ${qRows.length}.</div>` : ''}</section>`;
  }

  function renderExport() {
    const a = state.analysis, s = selectionSummary(), blocked = a.summary.blocking > 0 && !state.allowRisk;
    const compact = CORE.compactData(a, state.selection, state.profile);
    const json = JSON.stringify(compact), jsonBytes = new Blob([json]).size;
    const compactTokens = Math.ceil(json.length / 3.7);
    const reduction = 1 - compactTokens / Math.max(1, a.summary.originalTokens);
    const comparison = reduction >= 0
      ? `reducción aproximada del ${pct(reduction)}`
      : `aumento aproximado del ${pct(Math.abs(reduction))}`;
    const sizeWarning = reduction < 0
      ? '<div class="risk-box"><span>Este perfil no reduce contexto. Usa Equilibrado o Mínimo IA antes de adjuntarlo a una IA.</span></div>'
      : compact.selection.targetExceeded
        ? '<div class="risk-box"><span>La selección base ya ocupa más que el objetivo automático; reduce elementos o usa Mínimo IA.</span></div>'
        : '';
    $('stage').innerHTML = `<div class="page-head"><div><span class="eyebrow">Fase 4 · Exportar</span><h2>Un archivo humano y otro optimizado para IA.</h2><p>Ambos salen de la misma selección y conservan la trazabilidad hasta GlobalId y STEP.</p></div></div><div class="export-grid"><section class="export-card"><h3>Perfil de contexto</h3><p>Elige cuánta propiedad adicional viaja con las cantidades. La geometría nunca se incluye.</p><div class="profile-box"><label class="profile-option"><input type="radio" name="profile" value="equilibrado" ${state.profile === 'equilibrado' ? 'checked' : ''}><span><b>Equilibrado · recomendado</b><small>Identidad, cantidades, materiales y hasta cuatro propiedades prioritarias por elemento, con límite automático de tamaño.</small></span></label><label class="profile-option"><input type="radio" name="profile" value="minimo" ${state.profile === 'minimo' ? 'checked' : ''}><span><b>Mínimo IA</b><small>Elementos y cantidades sin propiedades auxiliares. Es la salida más pequeña.</small></span></label><label class="profile-option"><input type="radio" name="profile" value="trazabilidad" ${state.profile === 'trazabilidad' ? 'checked' : ''}><span><b>Auditoría completa</b><small>Incluye todas las propiedades. Puede superar el IFC y no se recomienda como contexto para IA.</small></span></label></div><span class="big">≈ ${n0(compactTokens)} tokens</span><p>${bytes(jsonBytes)} frente a ${bytes(a.source.size)} del IFC · ${comparison}. Se incluyen ${n0(compact.selection.includedProperties)} de ${n0(compact.selection.sourceProperties)} propiedades fuente.</p>${sizeWarning}${a.summary.blocking ? `<div class="risk-box"><label><input id="allowRisk" type="checkbox" ${state.allowRisk ? 'checked' : ''}><span>Entiendo que hay ${a.summary.blocking} bloqueante(s) y quiero exportar únicamente los datos recuperables, manteniendo las incidencias en el archivo.</span></label></div>` : ''}</section><section class="export-card"><h3>Descargas</h3><p>${n0(s.total)} elementos · ${n0(s.quantities)} cantidades · ${n0(compact.selection.includedProperties)} propiedades incluidas.</p><article class="format-card"><span class="format-icon">XLSX</span><span><b>Excel para mediciones y presupuesto</b><small>7 hojas: LEEME, Mediciones IA, Cantidades IFC, Propiedades, Control QA, Resumen y Configuración.</small></span><button class="action-btn primary" data-export="xlsx" ${blocked || !s.total ? 'disabled' : ''}>Descargar</button></article><article class="format-card"><span class="format-icon">JSON</span><span><b>IFC2IA compacto</b><small>JSON minificado, columnas sin datos repetidos y límite automático en el perfil recomendado.</small></span><button class="action-btn secondary" data-export="json" ${blocked || !s.total ? 'disabled' : ''}>Descargar</button></article><div class="panel" style="margin-top:14px;margin-bottom:0"><div class="bar-list"><div class="side-stat"><b>Datos enviados</b><span>0</span></div><div class="side-stat"><b>Archivo IFC original</b><span>sin modificar</span></div><div class="side-stat"><b>Fórmulas Excel</b><span>cantidad · coste · GG · BI</span></div><div class="side-stat"><b>QA incluido</b><span>${a.findings.length} incidencias</span></div></div></div></section></div>`;
  }

  function downloadBlob(blob, name) {
    const url = URL.createObjectURL(blob), link = document.createElement('a');
    link.href = url; link.download = name; document.body.appendChild(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 2000);
  }
  async function exportFile(format) {
    if (!state.analysis || !state.selection.size) return;
    if (state.analysis.summary.blocking && !state.allowRisk) { toast('Confirma primero la exportación recuperable.', 'warn'); return; }
    const base = CORE.safeFileBase(state.analysis.source.name) + '_HEFESTO_IFC2IA';
    setProgress(true, format === 'xlsx' ? 'Generando Excel' : 'Generando JSON', 'Estructurando la selección y la trazabilidad…', 35);
    await delayFrame();
    try {
      if (format === 'xlsx') {
        const blob = await CORE.buildWorkbook(state.analysis, state.selection, state.profile);
        setProgress(true, 'Generando Excel', 'Comprimiendo libro localmente…', 86); await delayFrame();
        downloadBlob(blob, base + '.xlsx');
      } else {
        const content = CORE.buildJson(state.analysis, state.selection, state.profile);
        downloadBlob(new Blob([content], { type: 'application/json;charset=utf-8' }), base + '.hefesto-ifc2ia.json');
      }
      setProgress(false); setStatus('Exportación preparada', '', `${state.selection.size} elementos · 0 datos enviados`); toast((format === 'xlsx' ? 'Excel' : 'JSON') + ' generado correctamente.');
    } catch (error) {
      console.error(error); setProgress(false); toast('No se pudo generar el archivo: ' + (error.message || error), 'error');
    }
  }

  function selectRows(rows, selected) {
    rows.forEach(e => selected ? state.selection.add(e.stepId) : state.selection.delete(e.stepId));
    $('badgeElements').textContent = state.selection.size; renderSide(); renderStage();
    setStatus('Selección actualizada', '', `${state.selection.size} elementos seleccionados · 0 datos enviados`);
  }

  document.addEventListener('click', event => {
    const tab = event.target.closest('[data-tab]'); if (tab && tab.classList.contains('mode-tab')) { switchTab(tab.dataset.tab); return; }
    const tabGo = event.target.closest('[data-tab-go]'); if (tabGo) { switchTab(tabGo.dataset.tabGo); return; }
    const action = event.target.closest('[data-action]');
    if (action) {
      if (action.dataset.action === 'select-filtered') selectRows(filteredElements(), true);
      if (action.dataset.action === 'clear-filtered') selectRows(filteredElements(), false);
      if (action.dataset.action === 'prev-page') { state.page = Math.max(0, state.page - 1); renderStage(); }
      if (action.dataset.action === 'next-page') { state.page++; renderStage(); }
      if (action.dataset.action === 'viewer-load') loadViewer({ confirmRisk: true });
      if (action.dataset.action === 'viewer-fit' && state.viewer) state.viewer.fit();
      if (action.dataset.action === 'viewer-view' && state.viewer) state.viewer.setView(action.dataset.view);
      // «Ver todo» deshace TODO lo que reduce la vista: el aislamiento del 3D y
      // también los filtros de la lista. Antes exigía que el visor estuviera
      // cargado (`&& state.viewer`), así que sin 3D el botón no hacía nada.
      if (action.dataset.action === 'viewer-show-all') showEverything();
      if (action.dataset.action === 'viewer-qa-colors' && state.viewer) {
        state.qaColors = !state.qaColors;
        Promise.resolve(state.viewer.setQaColorMode(state.qaColors)).catch(() => {});
        renderElements();
        setStatus(state.qaColors ? 'Color por estado de la medición' : 'Colores originales del IFC', '', state.qaColors ? 'azul correcto · ámbar revisar · rojo problemático' : 'materiales tal y como vienen en el archivo');
      }
      if (action.dataset.action === 'viewer-isolate-selected') {
        focusVisualElements(state.analysis.elements.filter(element => state.selection.has(element.stepId)), { isolate: true });
      }
      if (action.dataset.action === 'viewer-problems') {
        // Interruptor: si ya se ve solo lo problemático, vuelve al modelo completo.
        if (state.issueFilter === PROBLEM_FILTER) showEverything();
        else {
          state.issueFilter = PROBLEM_FILTER; state.search = ''; state.category = 'all'; state.level = 'all';
          renderSide(); renderElements();
          focusVisualElements(state.analysis.elements.filter(element => element.status !== 'Correcto'), { isolate: true, problem: true });
        }
      }
      if (action.dataset.action === 'clear-issue') showEverything();
      return;
    }
    const finding = event.target.closest('[data-finding]');
    if (finding) {
      state.issueFilter = finding.dataset.finding; state.search = ''; state.category = 'all'; state.level = 'all'; switchTab('elements');
      const item = state.analysis.findings.find(entry => entry.code === finding.dataset.finding);
      if (item) focusVisualElements(state.analysis.elements.filter(element => item.elementIds.includes(element.stepId)), { isolate: true, problem: true });
      return;
    }
    const visualFinding = event.target.closest('[data-visual-finding]');
    if (visualFinding) {
      state.issueFilter = visualFinding.dataset.visualFinding; state.search = ''; state.category = 'all'; state.level = 'all';
      const item = state.analysis.findings.find(entry => entry.code === state.issueFilter);
      renderSide(); renderElements();
      if (item) focusVisualElements(state.analysis.elements.filter(element => item.elementIds.includes(element.stepId)), { isolate: true, problem: true });
      return;
    }
    const visualElement = event.target.closest('[data-visual-element]');
    if (visualElement) {
      const element = state.analysis.elements.find(item => item.stepId === +visualElement.dataset.visualElement);
      if (element) { state.visualFocus = element.stepId; focusVisualElements([element], { showAll: true, problem: element.status !== 'Correcto' }); }
      return;
    }
    const exportButton = event.target.closest('[data-export]'); if (exportButton) { exportFile(exportButton.dataset.export); return; }
  });

  document.addEventListener('change', event => {
    if (event.target.matches('[data-select-id]')) {
      const id = +event.target.dataset.selectId; event.target.checked ? state.selection.add(id) : state.selection.delete(id);
      $('badgeElements').textContent = state.selection.size; renderSide(); setStatus('Selección actualizada', '', `${state.selection.size} elementos seleccionados · 0 datos enviados`); return;
    }
    // Filtrar por categoría o planta también actúa sobre el modelo: aísla y
    // encuadra ese conjunto. Antes solo cambiaba la lista y el 3D no se enteraba.
    if (event.target.name === 'category') { state.category = event.target.value; state.page = 0; state.issueFilter = null; renderSide(); renderStage(); syncViewerWithFilter(); return; }
    if (event.target.name === 'level') { state.level = event.target.value; state.page = 0; renderSide(); renderStage(); syncViewerWithFilter(); return; }
    if (event.target.name === 'profile') { state.profile = event.target.value; renderStage(); return; }
    if (event.target.id === 'allowRisk') { state.allowRisk = event.target.checked; renderStage(); return; }
    if (event.target.id === 'viewerForce') { state.viewerForceAccepted = event.target.checked; updateViewerOverlay(); return; }
  });

  document.addEventListener('input', event => {
    if (event.target.id === 'elementSearch') { state.search = event.target.value; state.page = 0; renderElements(); }
  });

  $('ifcInput').addEventListener('change', event => loadFile(event.target.files[0]));
  $('btnDemo').addEventListener('click', loadDemo); $('btnReset').addEventListener('click', reset);
  $('btnTheme').addEventListener('click', () => {
    const root = document.documentElement; root.dataset.theme = root.dataset.theme === 'dark' ? 'light' : 'dark';
    try { localStorage.setItem('hefestolab-theme', root.dataset.theme); } catch (_) {}
  });
  window.addEventListener('dragover', event => { event.preventDefault(); const zone = $('dropzone'); if (zone) zone.classList.add('drag'); });
  window.addEventListener('dragleave', event => { if (!event.relatedTarget) { const zone = $('dropzone'); if (zone) zone.classList.remove('drag'); } });
  window.addEventListener('drop', event => { event.preventDefault(); const zone = $('dropzone'); if (zone) zone.classList.remove('drag'); const file = [...event.dataTransfer.files].find(item => /\.(?:ifc|ifczip|zip)$/i.test(item.name)); if (file) loadFile(file); else toast('Arrastra un archivo .ifc o .ifczip.', 'error'); });
  window.addEventListener('keydown', event => {
    if (event.key === 'Escape' && state.analysis) {
      state.issueFilter = null; state.visualFocus = null; state.visualIsolated = false;
      if (state.viewer) { state.viewer.showAll(); state.viewer.clearSelection(); }
      if (state.tab === 'elements') { renderSide(); renderElements(); }
    }
  });
  window.addEventListener('beforeunload', disposeViewer);

  renderSide(); renderStage();
})();
