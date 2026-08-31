/* HEFESTOLAB IFC2IA Ready · semantic IFC extraction, QA and local exports */
(function (global) {
  'use strict';

  const STEP = global.HEM && global.HEM.step;
  if (!STEP) throw new Error('IFC2IA necesita el lector STEP de HEFESTOLAB.');

  const VERSION = '1.4.0';
  const PRODUCT_TYPES = new Set([
    'IFCWALL', 'IFCWALLSTANDARDCASE', 'IFCSLAB', 'IFCROOF', 'IFCCOLUMN', 'IFCBEAM',
    'IFCFOOTING', 'IFCPILE', 'IFCDOOR', 'IFCWINDOW', 'IFCSTAIR', 'IFCSTAIRFLIGHT',
    'IFCRAMP', 'IFCRAMPFLIGHT', 'IFCRAILING', 'IFCCOVERING', 'IFCCURTAINWALL',
    'IFCMEMBER', 'IFCPLATE', 'IFCBUILDINGELEMENTPROXY', 'IFCFURNISHINGELEMENT',
    'IFCSYSTEMFURNITUREELEMENT', 'IFCTRANSPORTELEMENT', 'IFCCHIMNEY', 'IFCSHADINGDEVICE',
    'IFCSANITARYTERMINAL', 'IFCFLOWTERMINAL', 'IFCFLOWSEGMENT', 'IFCFLOWFITTING',
    'IFCFLOWCONTROLLER', 'IFCFLOWMOVINGDEVICE', 'IFCFLOWSTORAGEDEVICE',
    'IFCFLOWTREATMENTDEVICE', 'IFCENERGYCONVERSIONDEVICE', 'IFCDISTRIBUTIONELEMENT',
    'IFCDISTRIBUTIONCONTROLELEMENT', 'IFCDISTRIBUTIONFLOWELEMENT', 'IFCELECTRICALELEMENT',
    'IFCCIVILELEMENT', 'IFCGEOGRAPHICELEMENT', 'IFCREINFORCINGBAR', 'IFCREINFORCINGMESH',
    'IFCTENDON', 'IFCTENDONANCHOR', 'IFCMECHANICALFASTENER', 'IFCFASTENER', 'IFCDISCRETEACCESSORY',
    'IFCELEMENTASSEMBLY', 'IFCVIRTUALELEMENT', 'IFCOPENINGELEMENT', 'IFCVOIDINGFEATURE',
    'IFCPROJECTIONELEMENT', 'IFCFEATUREELEMENTADDITION', 'IFCFEATUREELEMENTSUBTRACTION',
    'IFCAUDIOVISUALAPPLIANCE', 'IFCCABLECARRIERSEGMENT', 'IFCCABLESEGMENT', 'IFCDUCTSEGMENT',
    'IFCPIPESEGMENT', 'IFCPIPEFITTING', 'IFCDUCTFITTING', 'IFCAIRTERMINAL', 'IFCLIGHTFIXTURE',
    'IFCOUTLET', 'IFCSWITCHINGDEVICE', 'IFCPROTECTIVEDEVICE', 'IFCPUMP', 'IFCFAN', 'IFCBOILER',
    'IFCCHILLER', 'IFCCOIL', 'IFCTANK', 'IFCUNITARYEQUIPMENT', 'IFCSPACEHEATER',
    // IFC4 / IFC4X3: clases que faltaban y que sí aparecen en exportaciones reales.
    'IFCBUILDINGELEMENTPART', 'IFCBUILTELEMENT', 'IFCBEARING', 'IFCDEEPFOUNDATION',
    'IFCCAISSONFOUNDATION', 'IFCSOLARDEVICE', 'IFCELECTRICAPPLIANCE', 'IFCELECTRICMOTOR',
    'IFCELECTRICGENERATOR', 'IFCELECTRICTIMECONTROL', 'IFCELECTRICFLOWSTORAGEDEVICE',
    'IFCELECTRICFLOWTREATMENTDEVICE', 'IFCELECTRICDISTRIBUTIONBOARD', 'IFCCOMMUNICATIONSAPPLIANCE',
    'IFCCONTROLLER', 'IFCALARM', 'IFCSENSOR', 'IFCACTUATOR', 'IFCUNITARYCONTROLELEMENT',
    'IFCFILTER', 'IFCDAMPER', 'IFCVALVE', 'IFCCOMPRESSOR', 'IFCCONDENSER', 'IFCCOOLINGTOWER',
    'IFCCOOLEDBEAM', 'IFCEVAPORATOR', 'IFCEVAPORATIVECOOLER', 'IFCHEATEXCHANGER',
    'IFCHUMIDIFIER', 'IFCMEDICALDEVICE', 'IFCMOTORCONNECTION', 'IFCTUBEBUNDLE',
    'IFCTRANSFORMER', 'IFCBURNER', 'IFCENGINE', 'IFCJUNCTIONBOX', 'IFCCABLEFITTING',
    'IFCLAMP', 'IFCSTACKTERMINAL', 'IFCWASTETERMINAL', 'IFCFIRESUPPRESSIONTERMINAL',
    'IFCRAIL', 'IFCTRACKELEMENT', 'IFCKERB', 'IFCPAVEMENT',
    'IFCCOURSE', 'IFCEARTHWORKSELEMENT', 'IFCEARTHWORKSFILL', 'IFCEARTHWORKSCUT',
    'IFCSIGN', 'IFCSIGNAL', 'IFCVIBRATIONDAMPER', 'IFCVIBRATIONISOLATOR',
    'IFCCONVEYORSEGMENT', 'IFCMOORINGDEVICE', 'IFCNAVIGATIONELEMENT', 'IFCIMPACTPROTECTIONDEVICE',
    'IFCFURNITURE'
  ]);
  // Las variantes StandardCase/ElementedCase de IFC4 son productos medibles de pleno
  // derecho: sin esta regla un IfcSlabStandardCase quedaba fuera de la medición.
  const PRODUCT_CASE_PATTERN = /^IFC[A-Z]+(?:STANDARDCASE|ELEMENTEDCASE)$/;
  const SPATIAL_TYPES = new Set(['IFCPROJECT', 'IFCSITE', 'IFCBUILDING', 'IFCBUILDINGSTOREY', 'IFCSPACE', 'IFCZONE', 'IFCSPATIALZONE', 'IFCEXTERNALSPATIALELEMENT']);
  const QUANTITY_TYPES = {
    IFCQUANTITYLENGTH: 'm', IFCQUANTITYAREA: 'm²', IFCQUANTITYVOLUME: 'm³',
    IFCQUANTITYCOUNT: 'ud', IFCQUANTITYNUMBER: 'ud', IFCQUANTITYWEIGHT: 'kg', IFCQUANTITYTIME: 'h'
  };
  // Magnitud física de cada cantidad, para aplicarle la escala de unidades del proyecto.
  const QUANTITY_DIMENSION = {
    IFCQUANTITYLENGTH: 'length', IFCQUANTITYAREA: 'area', IFCQUANTITYVOLUME: 'volume',
    IFCQUANTITYCOUNT: 'count', IFCQUANTITYNUMBER: 'count', IFCQUANTITYWEIGHT: 'mass', IFCQUANTITYTIME: 'time'
  };
  // Tipos de medida IFC que pueden aparecer envolviendo el valor de una propiedad
  // (IFCAREAMEASURE(12.5)). Dan la magnitud sin depender del nombre de la propiedad.
  const MEASURE_DIMENSION = {
    IFCLENGTHMEASURE: 'length', IFCPOSITIVELENGTHMEASURE: 'length', IFCNONNEGATIVELENGTHMEASURE: 'length',
    IFCAREAMEASURE: 'area', IFCPOSITIVEAREAMEASURE: 'area',
    IFCVOLUMEMEASURE: 'volume', IFCPOSITIVEVOLUMEMEASURE: 'volume',
    IFCMASSMEASURE: 'mass', IFCCOUNTMEASURE: 'count', IFCINTEGERCOUNTRATEMEASURE: 'count',
    IFCTIMEMEASURE: 'time'
  };
  const DIMENSION_UNIT = { length: 'm', area: 'm²', volume: 'm³', mass: 'kg', count: 'ud', time: 'h' };
  // Entidades de unidades que hay que conservar para poder escalar las cantidades.
  const UNIT_TYPES = new Set([
    'IFCUNITASSIGNMENT', 'IFCSIUNIT', 'IFCCONVERSIONBASEDUNIT', 'IFCCONVERSIONBASEDUNITWITHOFFSET',
    'IFCMEASUREWITHUNIT', 'IFCDIMENSIONALEXPONENTS', 'IFCCONTEXTDEPENDENTUNIT',
    'IFCDERIVEDUNIT', 'IFCDERIVEDUNITELEMENT', 'IFCMONETARYUNIT'
  ]);
  const SI_PREFIX = {
    EXA: 1e18, PETA: 1e15, TERA: 1e12, GIGA: 1e9, MEGA: 1e6, KILO: 1e3, HECTO: 1e2, DECA: 1e1,
    DECI: 1e-1, CENTI: 1e-2, MILLI: 1e-3, MICRO: 1e-6, NANO: 1e-9, PICO: 1e-12, FEMTO: 1e-15, ATTO: 1e-18
  };
  // Exponente con el que el prefijo SI afecta a cada unidad base.
  const SI_UNIT_BASE = {
    METRE: { dimension: 'length', power: 1, factor: 1 },
    SQUARE_METRE: { dimension: 'area', power: 2, factor: 1 },
    CUBIC_METRE: { dimension: 'volume', power: 3, factor: 1 },
    GRAM: { dimension: 'mass', power: 1, factor: 0.001 },
    SECOND: { dimension: 'time', power: 1, factor: 1 / 3600 }
  };
  const UNIT_TYPE_DIMENSION = {
    LENGTHUNIT: 'length', AREAUNIT: 'area', VOLUMEUNIT: 'volume', MASSUNIT: 'mass', TIMEUNIT: 'time'
  };
  const IMPORTANT_PSETS = /(?:COMMON|IDENTITY|IDENTIDAD|CONSTRAINT|RESTRICC|MATERIAL|FIRE|ACOUST|THERMAL|PHAS|FASE|MANUFACTURER|CLASSIFICATION|CLASSIFICACI|COST|COSTE|TYPE|TIPO|DIMENSION|COTA)/i;
  const HIGH_VALUE_PROPERTIES = /(?:CLASSIFICATION|CLASSIFICACI|COST|COSTE|REFERENCE|REFERENCIA|FIRE|FUEGO|THERMAL|TERM|ACOUST|MATERIAL|MANUFACTURER|FABRICANTE|STATUS|ESTADO|PHASE|FASE)/i;
  const BALANCED_PROPERTIES_PER_ELEMENT = 4;

  const CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;
  function clean(value) {
    return String(value == null ? '' : value).replace(CONTROL_CHARS, '\uFFFD').trim();
  }
  function tokString(tok) {
    if (!tok) return '';
    if (tok.t === 'str') return clean(STEP.decodeIfcString(tok.v));
    if (tok.t === 'enum') return clean(tok.v);
    if (tok.t === 'num') return tok.v;
    if (tok.t === 'ref') return '#' + tok.v;
    if (tok.t === 'list' && tok.typed && tok.v.length) return tokString(tok.v[0]);
    if (tok.t === 'list') return tok.v.map(tokString).filter(v => v !== '').join(' | ');
    return '';
  }
  function tokRef(tok) { return tok && tok.t === 'ref' ? tok.v : 0; }
  function tokNumber(tok) {
    if (!tok) return null;
    if (tok.t === 'num' && Number.isFinite(tok.v)) return tok.v;
    if (tok.t === 'list' && tok.v.length) return tokNumber(tok.v[0]);
    return null;
  }
  function listRefs(tok) {
    if (!tok || tok.t !== 'list') return [];
    return tok.v.filter(item => item && item.t === 'ref').map(item => item.v);
  }
  function lastEnum(args) {
    for (let i = args.length - 1; i >= 0; i--) if (args[i] && args[i].t === 'enum') return clean(args[i].v);
    return '';
  }
  function safeFileBase(name) {
    return clean(name || 'modelo').replace(/\.[^.]+$/, '').replace(/[^A-Za-z0-9._-]+/g, '_').replace(/^_+|_+$/g, '') || 'modelo';
  }
  function round(value, decimals) {
    if (!Number.isFinite(value)) return 0;
    const p = Math.pow(10, decimals == null ? 4 : decimals);
    return Math.round(value * p) / p;
  }

  function auditBytes(bytes, options) {
    options = options || {};
    let nul = 0, control = 0, high = 0;
    for (let i = 0; i < bytes.length; i++) {
      const value = bytes[i];
      if (value === 0) nul++;
      if (value > 127) high++;
      else if (value < 32 && value !== 9 && value !== 10 && value !== 13) control++;
    }
    let invalidUtf8 = false;
    if (!options.skipUtf8Check) {
      try { new TextDecoder('utf-8', { fatal: true }).decode(bytes); } catch (_) { invalidUtf8 = true; }
    }
    return {
      bytes: bytes.length,
      nulBytes: nul,
      controlBytes: control,
      highBytes: high,
      invalidUtf8,
      controlRatio: bytes.length ? control / bytes.length : 0
    };
  }

  /**
   * Decodifica el IFC una sola vez. Antes el archivo completo se decodificaba dos
   * veces (auditoría y lectura), lo que duplicaba el pico de memoria en modelos
   * grandes. También se admiten UTF-16 con BOM y se elimina la marca inicial.
   */
  function decodeIfcBytes(bytes) {
    const byteAudit = auditBytes(bytes, { skipUtf8Check: true });
    let encoding = 'utf-8', text = null;
    if (bytes.length >= 2 && bytes[0] === 0xFF && bytes[1] === 0xFE) encoding = 'utf-16le';
    else if (bytes.length >= 2 && bytes[0] === 0xFE && bytes[1] === 0xFF) encoding = 'utf-16be';
    if (encoding !== 'utf-8') {
      text = new TextDecoder(encoding).decode(bytes);
      byteAudit.invalidUtf8 = false;
    } else {
      try { text = new TextDecoder('utf-8', { fatal: true }).decode(bytes); }
      catch (_) {
        byteAudit.invalidUtf8 = true;
        encoding = 'windows-1252';
        text = new TextDecoder('windows-1252').decode(bytes);
      }
    }
    if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);
    return { text, byteAudit, encoding };
  }

  const ENTITY_START = /#(\d+)\s*=\s*([A-Za-z][A-Za-z0-9_]*)\s*\(/g;
  const VALID_TYPE = /^IFC[A-Z0-9_]{2,60}$/;

  /**
   * Devuelve el paréntesis de cierre que corresponde al de apertura respetando las
   * cadenas ISO 10303 (con '' escapado) y los comentarios. Sustituye al antiguo
   * indexOf(');'), que cortaba la entidad en cuanto un texto contenía ");" y que
   * daba por dañadas las entidades escritas en varias líneas.
   */
  function closingParen(text, open, limit) {
    let depth = 0, i = open, inString = false;
    while (i < limit) {
      const c = text.charCodeAt(i);
      if (inString) {
        if (c === 39) { if (text.charCodeAt(i + 1) === 39) i++; else inString = false; }
      } else if (c === 39) inString = true;
      else if (c === 47 && text.charCodeAt(i + 1) === 42) {
        const close = text.indexOf('*/', i + 2);
        if (close < 0) return -1;
        i = close + 1;
      } else if (c === 40) depth++;
      else if (c === 41) { depth--; if (depth === 0) return i; }
      i++;
    }
    return -1;
  }

  /**
   * Recorre las entidades del texto sin retener nada: la memoria la decide quien
   * visita. El siguiente «#n= IFCXXX(» marca el límite duro de la entidad actual.
   * Sin ese tope, un solo paréntesis corrupto hacía que la búsqueda del cierre se
   * comiera cientos de entidades correctas que venían detrás; en un archivo con
   * bytes dañados se perdía casi la mitad del modelo sin avisar.
   */
  function forEachEntity(text, from, visit) {
    const pattern = new RegExp(ENTITY_START.source, 'g');
    pattern.lastIndex = from || 0;
    let match = pattern.exec(text);
    let detected = 0;
    while (match) {
      detected++;
      const id = +match[1];
      const type = match[2].toUpperCase();
      const open = pattern.lastIndex - 1;
      const next = pattern.exec(text);
      const limit = next ? next.index : text.length;
      const close = VALID_TYPE.test(type) ? closingParen(text, open, limit) : -1;
      if (close < 0) visit(id, type, -1, -1, match.index, -1);
      else {
        let end = close + 1;
        while (end < limit) {
          const c = text.charCodeAt(end);
          if (c === 32 || c === 9 || c === 13 || c === 10) { end++; continue; }
          break;
        }
        if (text.charCodeAt(end) === 59) end++; else end = close + 1;
        visit(id, type, open + 1, close, match.index, end);
      }
      match = next;
    }
    return detected;
  }

  /** ¿Necesita la medición los argumentos de esta clase? La geometría no. */
  function isIndexableType(type) {
    if (isProduct(type) || SPATIAL_TYPES.has(type) || UNIT_TYPES.has(type)) return true;
    if (type.indexOf('IFCREL') === 0) return true;
    if (type.indexOf('IFCPROPERTY') === 0 || type.indexOf('IFCQUANTITY') === 0 || type.indexOf('IFCPHYSICAL') === 0) return true;
    if (type.indexOf('IFCMATERIAL') === 0) return true;
    if (type === 'IFCELEMENTQUANTITY' || type === 'IFCCLASSIFICATION' || type === 'IFCCLASSIFICATIONREFERENCE') return true;
    return /(?:TYPE|STYLE)$/.test(type);
  }

  /**
   * Índice semántico del IFC. Solo se analizan y retienen los argumentos de las
   * clases que la medición necesita: puntos, caras, extrusiones y colocaciones se
   * cuentan pero no se guardan. En un IFC real eso es más del 90 % del archivo, y
   * es lo que permite abrir modelos grandes sin agotar la memoria de la pestaña.
   */
  function scanEntities(text, options) {
    options = options || {};
    const keep = options.keep || isIndexableType;
    const byId = new Map(), byType = new Map(), malformed = [], duplicateIds = [];
    let recovered = 0;
    // Mapa ligero id -> posición de sus argumentos en el texto. Permite leer
    // bajo demanda la geometría (puntos, caras, perfiles) sin retenerla: es lo
    // que hace posible medir a partir de la forma sin agotar la memoria.
    let slotById = new Int32Array(1 << 20).fill(-1);
    let argStarts = new Int32Array(1 << 16);
    let argEnds = new Int32Array(1 << 16);
    let typeSlots = new Int32Array(1 << 16);
    const typeNames = [];
    const typeIndex = new Map();
    let slots = 0;
    const growSlots = () => {
      if (slots < argStarts.length) return;
      const size = argStarts.length * 2;
      const a = new Int32Array(size); a.set(argStarts); argStarts = a;
      const b = new Int32Array(size); b.set(argEnds); argEnds = b;
      const c = new Int32Array(size); c.set(typeSlots); typeSlots = c;
    };
    const remember = (id, type, start, end) => {
      if (!Number.isFinite(id) || id < 1 || id > 40000000) return false;
      if (id >= slotById.length) {
        let size = slotById.length;
        while (size <= id) size *= 2;
        const bigger = new Int32Array(size).fill(-1);
        bigger.set(slotById);
        slotById = bigger;
      }
      const repeated = slotById[id] >= 0;
      let tid = typeIndex.get(type);
      if (tid === undefined) { tid = typeNames.length; typeNames.push(type); typeIndex.set(type, tid); }
      growSlots();
      argStarts[slots] = start; argEnds[slots] = end; typeSlots[slots] = tid;
      slotById[id] = slots++;
      return repeated;
    };
    const detected = forEachEntity(text, options.from || 0, (id, type, argStart, argEnd, start, end) => {
      if (argStart < 0) {
        if (malformed.length < 2000) malformed.push({ id, type, reason: VALID_TYPE.test(type) ? 'Paréntesis o terminador dañados' : 'Tipo STEP ilegible' });
        return;
      }
      recovered++;
      if (remember(id, type, argStart, argEnd)) duplicateIds.push(id);
      if (!keep(type)) return;
      let args;
      try { args = STEP.parseArgs(text, argStart, argEnd); }
      catch (error) {
        if (malformed.length < 2000) malformed.push({ id, type, reason: clean(error && error.message) || 'Argumentos ilegibles' });
        return;
      }
      const entity = { id, type, args, start, end };
      byId.set(id, entity);
      let bucket = byType.get(type);
      if (!bucket) { bucket = []; byType.set(type, bucket); }
      bucket.push(entity);
    });
    const index = {
      byId, byType, malformed, duplicateIds, detectedStarts: detected, recovered, indexed: byId.size,
      text,
      typeOf(id) {
        const slot = (id > 0 && id < slotById.length) ? slotById[id] : -1;
        return slot < 0 ? null : typeNames[typeSlots[slot]];
      },
      /** Lee una entidad no indexada analizando sus argumentos en ese momento. */
      lazy(id) {
        const cached = byId.get(id);
        if (cached) return cached;
        const slot = (id > 0 && id < slotById.length) ? slotById[id] : -1;
        if (slot < 0) return null;
        try {
          return { id, type: typeNames[typeSlots[slot]], args: STEP.parseArgs(text, argStarts[slot], argEnds[slot]) };
        } catch (_) { return null; }
      }
    };
    return index;
  }

  /**
   * Copia recuperable para el visor 3D: conserva TODAS las entidades legibles,
   * también la geometría, y descarta solo lo que está roto. El archivo original
   * del usuario nunca se modifica.
   */
  function buildViewerIfc(text) {
    const cleanText = String(text || '')
      .replace(CONTROL_CHARS, ' ')
      .replace(/\uFFFD/g, '?');
    const dataMatch = /\bDATA\s*;/i.exec(cleanText);
    if (!dataMatch) return cleanText;
    const dataEnd = dataMatch.index + dataMatch[0].length;
    const chunks = [cleanText.slice(0, dataEnd), '\n'];
    const seen = new Set();
    forEachEntity(cleanText, dataEnd, (id, type, argStart, argEnd, start, end) => {
      if (argStart < 0 || end < 0 || seen.has(id)) return;
      seen.add(id);
      chunks.push(cleanText.slice(start, end).trim(), '\n');
    });
    chunks.push('ENDSEC;\nEND-ISO-10303-21;');
    return chunks.join('');
  }
  function entitiesOf(index, type) { return index.byType.get(type) || []; }
  function entity(index, id) { return index.byId.get(id) || null; }
  // IfcDistributionPort y demás puertos son conexiones lógicas, no elementos
  // físicos: en un modelo MEP son la mayoría de las entidades y aparecían como
  // miles de elementos «sin cantidades» que no se pueden medir ni presupuestar.
  const NOT_PRODUCT = /(?:PORT|TYPE|STYLE|REL|PROPERTY|QUANTITY|MATERIAL|REPRESENTATION|PLACEMENT|SYSTEM|GROUP|ZONE)$/;
  function isProduct(type) {
    if (NOT_PRODUCT.test(type)) return false;
    if (PRODUCT_TYPES.has(type)) return true;
    if (PRODUCT_CASE_PATTERN.test(type)) return true;
    return /^IFC(?:FLOW|DISTRIBUTION|ENERGYCONVERSION|BUILDINGELEMENT|CIVIL|GEOGRAPHIC)/.test(type);
  }

  function categoryFor(type) {
    if (/FOOTING|PILE/.test(type)) return 'Cimentación';
    if (/COLUMN|BEAM|MEMBER|PLATE|REINFORC|TENDON/.test(type)) return 'Estructura';
    if (/WALL|CURTAINWALL/.test(type)) return 'Muros y cerramientos';
    if (/SLAB|ROOF/.test(type)) return 'Forjados y cubiertas';
    if (/DOOR|WINDOW/.test(type)) return 'Carpinterías';
    if (/STAIR|RAMP|RAILING/.test(type)) return 'Circulación y protecciones';
    if (/COVERING/.test(type)) return 'Acabados';
    if (/FLOW|DISTRIBUTION|PIPE|DUCT|CABLE|TERMINAL|OUTLET|SWITCH|PUMP|FAN|BOILER|CHILLER|COIL|TANK|FIXTURE/.test(type)) return 'Instalaciones';
    if (/FURNISH|SYSTEMFURNITURE|TRANSPORT/.test(type)) return 'Equipamiento';
    if (/OPENING|VOIDING|PROJECTION|FEATURE/.test(type)) return 'Huecos y operaciones';
    return 'Otros elementos';
  }

  function parseHeader(text) {
    const dataMatch = /\bDATA\s*;/i.exec(text);
    const headerEnd = dataMatch ? dataMatch.index : -1;
    const header = headerEnd >= 0 ? text.slice(0, headerEnd) : text.slice(0, Math.min(text.length, 100000));
    const schema = /FILE_SCHEMA\s*\(\s*\(\s*'([^']+)'/i.exec(header);
    const fileName = /FILE_NAME\s*\(\s*'((?:[^']|'')*)'/i.exec(header);
    const application = /FILE_NAME[\s\S]*?'((?:[^']|'')*)'\s*,\s*'((?:[^']|'')*)'\s*\)\s*;/i.exec(header);
    return {
      schema: schema ? clean(schema[1].toUpperCase()) : 'DESCONOCIDO',
      internalName: fileName ? clean(STEP.decodeIfcString(fileName[1])) : '',
      originatingSystem: application ? clean(STEP.decodeIfcString(application[1])) : '',
      hasDataSection: !!dataMatch,
      hasEndIso: /END-ISO-10303-21\s*;/i.test(text.slice(Math.max(0, text.length - 8192)))
    };
  }

  /* ---------------------------------------------------------------------------
   * Unidades del proyecto (IfcUnitAssignment)
   * -------------------------------------------------------------------------
   * Un IfcQuantityArea no está en metros cuadrados: está en la unidad declarada
   * por el proyecto. La mayoría de exportaciones de Revit, Allplan o Tekla
   * trabajan en milímetros, de modo que sin esta conversión un muro de 15 m²
   * se exportaba como 15.000.000 y toda la medición quedaba inservible.
   * ------------------------------------------------------------------------- */

  function siUnitFactor(index, item) {
    const a = item.args;
    const unitType = clean(tokString(a[1])).toUpperCase();
    const dimension = UNIT_TYPE_DIMENSION[unitType];
    if (!dimension) return null;
    const base = SI_UNIT_BASE[clean(tokString(a[3])).toUpperCase()];
    if (!base) return null;
    const prefix = clean(tokString(a[2])).toUpperCase();
    const prefixFactor = SI_PREFIX[prefix] || 1;
    return { dimension, factor: base.factor * Math.pow(prefixFactor, base.power) };
  }

  function conversionUnitFactor(index, item, depth) {
    const a = item.args;
    const unitType = clean(tokString(a[1])).toUpperCase();
    const dimension = UNIT_TYPE_DIMENSION[unitType];
    if (!dimension) return null;
    const measure = entity(index, tokRef(a[3]));
    if (!measure || measure.type !== 'IFCMEASUREWITHUNIT') return null;
    const value = tokNumber(measure.args[0]);
    const inner = unitFactorOf(index, tokRef(measure.args[1]), (depth || 0) + 1);
    if (!Number.isFinite(value) || !inner) return null;
    return { dimension, factor: value * inner.factor };
  }

  function unitFactorOf(index, id, depth) {
    if (!id || (depth || 0) > 6) return null;
    const item = entity(index, id);
    if (!item) return null;
    if (item.type === 'IFCSIUNIT') return siUnitFactor(index, item);
    if (item.type === 'IFCCONVERSIONBASEDUNIT' || item.type === 'IFCCONVERSIONBASEDUNITWITHOFFSET') return conversionUnitFactor(index, item, depth || 0);
    return null;
  }

  /** Factores para pasar las cantidades del IFC a m, m², m³, kg y h. */
  function parseUnits(index) {
    const units = {
      // Sin IfcUnitAssignment, ISO 16739 implica unidades SI: metro y segundo.
      factors: { length: 1, area: 1, volume: 1, mass: 1, count: 1, time: 1 / 3600 },
      names: {},
      declared: false,
      lengthIsMetre: true
    };
    const assignments = entitiesOf(index, 'IFCUNITASSIGNMENT');
    const ids = [];
    for (const assignment of assignments) for (const ref of listRefs(assignment.args[0])) ids.push(ref);
    for (const id of ids) {
      const item = entity(index, id);
      if (!item) continue;
      const resolved = unitFactorOf(index, id, 0);
      if (!resolved || !Number.isFinite(resolved.factor) || resolved.factor <= 0) continue;
      units.factors[resolved.dimension] = resolved.factor;
      units.declared = true;
      const prefix = item.type === 'IFCSIUNIT' ? clean(tokString(item.args[2])) : '';
      const name = item.type === 'IFCSIUNIT' ? clean(tokString(item.args[3])) : clean(tokString(item.args[2]));
      units.names[resolved.dimension] = (prefix ? prefix + ' ' : '') + name;
    }
    // Sin AREAUNIT/VOLUMEUNIT explícitos, IFC las deriva de la unidad de longitud.
    const declaredArea = units.names.area != null, declaredVolume = units.names.volume != null;
    if (!declaredArea) units.factors.area = Math.pow(units.factors.length, 2);
    if (!declaredVolume) units.factors.volume = Math.pow(units.factors.length, 3);
    units.lengthIsMetre = Math.abs(units.factors.length - 1) < 1e-9;
    return units;
  }

  function scaleValue(value, dimension, units) {
    if (!Number.isFinite(value)) return value;
    const factor = units && units.factors && units.factors[dimension];
    return Number.isFinite(factor) && factor > 0 ? value * factor : value;
  }

  function collectRelations(index) {
    const containment = new Map(), aggregatesParent = new Map(), typeOf = new Map(), propertyDefs = new Map(), materials = new Map();
    for (const rel of entitiesOf(index, 'IFCRELCONTAINEDINSPATIALSTRUCTURE')) {
      const related = listRefs(rel.args[4]), parent = tokRef(rel.args[5]);
      for (const id of related) containment.set(id, parent);
    }
    for (const rel of entitiesOf(index, 'IFCRELREFERENCEDINSPATIALSTRUCTURE')) {
      const related = listRefs(rel.args[4]), parent = tokRef(rel.args[5]);
      for (const id of related) if (!containment.has(id)) containment.set(id, parent);
    }
    for (const rel of entitiesOf(index, 'IFCRELAGGREGATES')) {
      const parent = tokRef(rel.args[4]);
      for (const id of listRefs(rel.args[5])) aggregatesParent.set(id, parent);
    }
    for (const rel of entitiesOf(index, 'IFCRELDEFINESBYTYPE')) {
      const typeId = tokRef(rel.args[5]);
      for (const id of listRefs(rel.args[4])) typeOf.set(id, typeId);
    }
    for (const rel of entitiesOf(index, 'IFCRELDEFINESBYPROPERTIES')) {
      const definition = tokRef(rel.args[5]);
      for (const id of listRefs(rel.args[4])) {
        if (!propertyDefs.has(id)) propertyDefs.set(id, []);
        propertyDefs.get(id).push(definition);
      }
    }
    for (const rel of entitiesOf(index, 'IFCRELASSOCIATESMATERIAL')) {
      const material = tokRef(rel.args[5]);
      for (const id of listRefs(rel.args[4])) {
        if (!materials.has(id)) materials.set(id, []);
        materials.get(id).push(material);
      }
    }
    return { containment, aggregatesParent, typeOf, propertyDefs, materials };
  }

  function materialInfo(index, id, seen, depth) {
    if (!id || depth > 8) return [];
    seen = seen || new Set();
    if (seen.has(id)) return [];
    seen.add(id);
    const item = entity(index, id);
    if (!item) return [];
    const a = item.args;
    if (item.type === 'IFCMATERIAL') return [{ name: clean(tokString(a[0])), thickness: null }];
    if (item.type === 'IFCMATERIALLAYER') {
      return materialInfo(index, tokRef(a[0]), seen, depth + 1).map(row => ({ name: row.name, thickness: tokNumber(a[1]) }));
    }
    if (/IFCMATERIAL(?:LAYER|PROFILE|CONSTITUENT)SETUSAGE/.test(item.type)) return materialInfo(index, tokRef(a[0]), seen, depth + 1);
    if (/IFCMATERIAL(?:LAYER|PROFILE|CONSTITUENT)SET/.test(item.type) || item.type === 'IFCMATERIALLIST') {
      const refs = listRefs(a[0]);
      return refs.flatMap(ref => materialInfo(index, ref, seen, depth + 1));
    }
    if (/IFCMATERIAL(?:PROFILE|CONSTITUENT)/.test(item.type)) {
      const refs = [];
      for (const token of a) if (token && token.t === 'ref') refs.push(token.v);
      const rows = refs.flatMap(ref => materialInfo(index, ref, seen, depth + 1));
      if (rows.length) return rows;
      return [{ name: clean(tokString(a[0]) || tokString(a[1])), thickness: null }];
    }
    return [];
  }

  function valueFromProperty(token) {
    if (!token || token.t === '$' || token.t === '*') return null;
    if (token.t === 'list' && token.typed) return { value: tokString(token), valueType: token.typed };
    if (token.t === 'num') return { value: token.v, valueType: 'NUMBER' };
    if (token.t === 'enum') return { value: token.v, valueType: 'ENUM' };
    if (token.t === 'str') return { value: tokString(token), valueType: 'TEXT' };
    if (token.t === 'ref') return { value: '#' + token.v, valueType: 'REFERENCE' };
    if (token.t === 'list') return { value: tokString(token), valueType: 'LIST' };
    return null;
  }


  /* ---------------------------------------------------------------------------
   * Medición a partir de la geometría
   * -------------------------------------------------------------------------
   * Muchos IFC reales no traen IfcElementQuantity: CYPECAD, TeKton3D o cualquier
   * exportación ligera dejan la medición implícita en la forma. Los visores
   * profesionales muestran volumen y longitud porque los calculan. Aquí se hace
   * lo mismo, leyendo la geometría bajo demanda: perfiles paramétricos, sólidos
   * de extrusión y revolución, barridos y mallas. Todo en unidades del IFC; la
   * conversión a m, m² y m³ se aplica al final con el factor de longitud.
   * ------------------------------------------------------------------------- */

  const GEOMETRY_MAX_DEPTH = 14;

  function geoEntity(index, id) {
    if (!id || !index.lazy) return null;
    return index.lazy(id);
  }

  function pointCoords(index, id, cache) {
    const item = geoEntity(index, id);
    if (!item || item.type !== 'IFCCARTESIANPOINT') return null;
    const list = item.args[0];
    if (!list || list.t !== 'list') return null;
    const out = [];
    for (const token of list.v) {
      const value = tokNumber(token);
      out.push(Number.isFinite(value) ? value : 0);
    }
    return out.length ? out : null;
  }

  /** Puntos de una curva cerrada o abierta. Los arcos se aproximan por su cuerda. */
  function curvePoints(index, id, cache, depth) {
    if ((depth || 0) > GEOMETRY_MAX_DEPTH) return null;
    const item = geoEntity(index, id);
    if (!item) return null;
    if (item.type === 'IFCPOLYLINE') {
      const refs = listRefs(item.args[0]);
      const points = [];
      for (const ref of refs) {
        const p = pointCoords(index, ref, cache);
        if (p) points.push(p);
      }
      return points.length ? points : null;
    }
    if (item.type === 'IFCTRIMMEDCURVE') return curvePoints(index, tokRef(item.args[0]), cache, (depth || 0) + 1);
    if (item.type === 'IFCCOMPOSITECURVE' || item.type === 'IFCCOMPOSITECURVESEGMENT') {
      const segments = item.type === 'IFCCOMPOSITECURVE' ? listRefs(item.args[0]) : [tokRef(item.args[2])];
      const points = [];
      for (const ref of segments) {
        const part = item.type === 'IFCCOMPOSITECURVE'
          ? curvePoints(index, tokRef((geoEntity(index, ref) || { args: [] }).args[2]), cache, (depth || 0) + 1)
          : curvePoints(index, ref, cache, (depth || 0) + 1);
        if (part) for (const p of part) points.push(p);
      }
      return points.length ? points : null;
    }
    if (item.type === 'IFCINDEXEDPOLYCURVE') {
      const listId = tokRef(item.args[0]);
      const source = geoEntity(index, listId);
      if (!source) return null;
      const coords = source.args[0];
      if (!coords || coords.t !== 'list') return null;
      const points = [];
      for (const row of coords.v) {
        if (!row || row.t !== 'list') continue;
        points.push(row.v.map(token => tokNumber(token) || 0));
      }
      return points.length ? points : null;
    }
    return null;
  }

  function polygonArea(points) {
    if (!points || points.length < 3) return 0;
    let sum = 0;
    for (let i = 0, n = points.length; i < n; i++) {
      const a = points[i], b = points[(i + 1) % n];
      sum += (a[0] || 0) * (b[1] || 0) - (b[0] || 0) * (a[1] || 0);
    }
    return Math.abs(sum) / 2;
  }

  function polylineLength(points, closed) {
    if (!points || points.length < 2) return 0;
    let total = 0;
    const n = points.length;
    const last = closed ? n : n - 1;
    for (let i = 0; i < last; i++) {
      const a = points[i], b = points[(i + 1) % n];
      const dx = (b[0] || 0) - (a[0] || 0);
      const dy = (b[1] || 0) - (a[1] || 0);
      const dz = (b[2] || 0) - (a[2] || 0);
      total += Math.hypot(dx, dy, dz);
    }
    return total;
  }

  /** Área y perímetro exterior de un perfil IFC. */
  function profileGeometry(index, id, cache, depth) {
    if (!id || (depth || 0) > GEOMETRY_MAX_DEPTH) return null;
    if (cache.profiles.has(id)) return cache.profiles.get(id);
    const item = geoEntity(index, id);
    let result = null;
    if (item) {
      const a = item.args;
      const num = i => { const v = tokNumber(a[i]); return Number.isFinite(v) ? v : 0; };
      const type = item.type;
      if (type === 'IFCRECTANGLEPROFILEDEF' || type === 'IFCROUNDEDRECTANGLEPROFILEDEF') {
        const x = num(3), y = num(4);
        result = { area: x * y, perimeter: 2 * (x + y) };
      } else if (type === 'IFCRECTANGLEHOLLOWPROFILEDEF') {
        const x = num(3), y = num(4), t = num(5);
        const inner = Math.max(0, x - 2 * t) * Math.max(0, y - 2 * t);
        result = { area: Math.max(0, x * y - inner), perimeter: 2 * (x + y) };
      } else if (type === 'IFCCIRCLEPROFILEDEF') {
        const r = num(3);
        result = { area: Math.PI * r * r, perimeter: 2 * Math.PI * r };
      } else if (type === 'IFCCIRCLEHOLLOWPROFILEDEF') {
        const r = num(3), t = num(4), ri = Math.max(0, r - t);
        result = { area: Math.PI * (r * r - ri * ri), perimeter: 2 * Math.PI * r };
      } else if (type === 'IFCELLIPSEPROFILEDEF') {
        const p = num(3), q = num(4);
        result = { area: Math.PI * p * q, perimeter: Math.PI * (3 * (p + q) - Math.sqrt((3 * p + q) * (p + 3 * q))) };
      } else if (type === 'IFCISHAPEPROFILEDEF') {
        // Doble T: alas + alma + los cuatro acuerdos, que es como se tabula el
        // área de un HEB o un IPE en los catálogos.
        const b = num(3), h = num(4), tw = num(5), tf = num(6), r = num(7);
        const area = 2 * b * tf + Math.max(0, h - 2 * tf) * tw + (4 - Math.PI) * r * r;
        result = { area, perimeter: 2 * (b + h) + 2 * (b - tw) - 2 * (4 - Math.PI) * r };
      } else if (type === 'IFCUSHAPEPROFILEDEF') {
        const h = num(3), b = num(4), tw = num(5), tf = num(6), r = num(7);
        const area = 2 * b * tf + Math.max(0, h - 2 * tf) * tw + (2 - Math.PI / 2) * r * r;
        result = { area, perimeter: 2 * (b + h) + 2 * (b - tw) };
      } else if (type === 'IFCLSHAPEPROFILEDEF') {
        const h = num(3), b = num(4) || num(3), t = num(5), r = num(6);
        const area = t * (h + b - t) + (1 - Math.PI / 4) * r * r;
        result = { area, perimeter: 2 * (h + b) };
      } else if (type === 'IFCTSHAPEPROFILEDEF') {
        const h = num(3), b = num(4), tw = num(5), tf = num(6);
        result = { area: b * tf + Math.max(0, h - tf) * tw, perimeter: 2 * (b + h) };
      } else if (type === 'IFCZSHAPEPROFILEDEF') {
        const h = num(3), b = num(4), tw = num(5), tf = num(6);
        result = { area: 2 * b * tf + Math.max(0, h - 2 * tf) * tw, perimeter: 4 * b + 2 * h };
      } else if (type === 'IFCCSHAPEPROFILEDEF') {
        const h = num(3), b = num(4), t = num(5), g = num(6);
        result = { area: t * (h + 2 * b + 2 * g - 4 * t), perimeter: 2 * (h + b) };
      } else if (type === 'IFCARBITRARYCLOSEDPROFILEDEF') {
        const points = curvePoints(index, tokRef(a[2]), cache, (depth || 0) + 1);
        result = { area: polygonArea(points), perimeter: polylineLength(points, true) };
      } else if (type === 'IFCARBITRARYPROFILEDEFWITHVOIDS') {
        const outer = curvePoints(index, tokRef(a[2]), cache, (depth || 0) + 1);
        let area = polygonArea(outer);
        for (const ref of listRefs(a[3])) area -= polygonArea(curvePoints(index, ref, cache, (depth || 0) + 1));
        result = { area: Math.max(0, area), perimeter: polylineLength(outer, true) };
      } else if (type === 'IFCARBITRARYOPENPROFILEDEF' || type === 'IFCCENTERLINEPROFILEDEF') {
        const points = curvePoints(index, tokRef(a[2]), cache, (depth || 0) + 1);
        result = { area: 0, perimeter: polylineLength(points, false) };
      } else if (type === 'IFCCOMPOSITEPROFILEDEF') {
        let area = 0, perimeter = 0;
        for (const ref of listRefs(a[2])) {
          const part = profileGeometry(index, ref, cache, (depth || 0) + 1);
          if (part) { area += part.area; perimeter += part.perimeter; }
        }
        result = { area, perimeter };
      } else if (type === 'IFCDERIVEDPROFILEDEF') {
        const parent = profileGeometry(index, tokRef(a[2]), cache, (depth || 0) + 1);
        const operator = geoEntity(index, tokRef(a[3]));
        let scale = 1;
        if (operator) {
          const s = tokNumber(operator.args[3]);
          if (Number.isFinite(s) && s > 0) scale = s;
        }
        if (parent) result = { area: parent.area * scale * scale, perimeter: parent.perimeter * scale };
      }
    }
    if (result && (!Number.isFinite(result.area) || result.area < 0)) result.area = 0;
    if (result && !Number.isFinite(result.perimeter)) result.perimeter = 0;
    cache.profiles.set(id, result);
    return result;
  }

  /** Volumen y superficie de una lista de caras poligonales (teorema de la divergencia). */
  function meshQuantities(polygons) {
    let volume = 0, area = 0;
    for (const polygon of polygons) {
      if (!polygon || polygon.length < 3) continue;
      const p0 = polygon[0];
      for (let i = 1; i < polygon.length - 1; i++) {
        const p1 = polygon[i], p2 = polygon[i + 1];
        const ux = p1[0] - p0[0], uy = p1[1] - p0[1], uz = (p1[2] || 0) - (p0[2] || 0);
        const vx = p2[0] - p0[0], vy = p2[1] - p0[1], vz = (p2[2] || 0) - (p0[2] || 0);
        const cx = uy * vz - uz * vy, cy = uz * vx - ux * vz, cz = ux * vy - uy * vx;
        area += Math.hypot(cx, cy, cz) / 2;
        volume += ((p0[0] || 0) * cx + (p0[1] || 0) * cy + (p0[2] || 0) * cz) / 6;
      }
    }
    return { volume: Math.abs(volume), area };
  }

  function loopPoints(index, id, cache, depth) {
    const item = geoEntity(index, id);
    if (!item) return null;
    if (item.type === 'IFCPOLYLOOP') {
      const points = [];
      for (const ref of listRefs(item.args[0])) {
        const p = pointCoords(index, ref, cache);
        if (p) points.push(p);
      }
      return points.length ? points : null;
    }
    return null;
  }

  function facesOf(index, faceRefs, cache, depth, out) {
    for (const ref of faceRefs) {
      const face = geoEntity(index, ref);
      if (!face || face.type.indexOf('IFCFACE') !== 0) continue;
      for (const boundRef of listRefs(face.args[0])) {
        const bound = geoEntity(index, boundRef);
        if (!bound) continue;
        const points = loopPoints(index, tokRef(bound.args[0]), cache, depth);
        if (points) out.push(points);
      }
    }
    return out;
  }

  function shellPolygons(index, shellRefs, cache, depth) {
    const polygons = [];
    for (const ref of shellRefs) {
      const shell = geoEntity(index, ref);
      if (!shell) continue;
      if (/IFC(?:CLOSED|OPEN)SHELL|IFCCONNECTEDFACESET/.test(shell.type)) facesOf(index, listRefs(shell.args[0]), cache, depth, polygons);
    }
    return polygons;
  }

  const EMPTY_GEOMETRY = { volume: 0, area: 0, length: 0, approx: false, kind: '' };

  /** Volumen, superficie y longitud de un sólido, en unidades del IFC. */
  function solidGeometry(index, id, cache, depth) {
    if (!id || (depth || 0) > GEOMETRY_MAX_DEPTH) return null;
    if (cache.solids.has(id)) return cache.solids.get(id);
    cache.solids.set(id, null); // corta ciclos
    const item = geoEntity(index, id);
    let result = null;
    if (item) {
      const a = item.args;
      const type = item.type;
      if (type === 'IFCEXTRUDEDAREASOLID' || type === 'IFCEXTRUDEDAREASOLIDTAPERED') {
        const profile = profileGeometry(index, tokRef(a[0]), cache, (depth || 0) + 1);
        const height = Math.abs(tokNumber(a[3]) || 0);
        if (profile && height > 0) {
          let area = profile.area;
          if (type === 'IFCEXTRUDEDAREASOLIDTAPERED') {
            const end = profileGeometry(index, tokRef(a[4]), cache, (depth || 0) + 1);
            if (end) area = (profile.area + end.area) / 2;
          }
          result = {
            volume: area * height,
            area: profile.perimeter * height + 2 * area,
            length: height,
            approx: type === 'IFCEXTRUDEDAREASOLIDTAPERED',
            kind: 'extrusión'
          };
        }
      } else if (type === 'IFCREVOLVEDAREASOLID' || type === 'IFCREVOLVEDAREASOLIDTAPERED') {
        // Teorema de Pappus: el codo equivale a un tramo recto de longitud
        // ángulo × radio del centro del perfil, que es la medida útil en MEP.
        const profile = profileGeometry(index, tokRef(a[0]), cache, (depth || 0) + 1);
        const angle = Math.abs(tokNumber(a[3]) || 0);
        const axis = geoEntity(index, tokRef(a[2]));
        const profileEntity = geoEntity(index, tokRef(a[0]));
        let radius = 0;
        if (axis && profileEntity) {
          const axisPoint = pointCoords(index, tokRef(axis.args[0]), cache) || [0, 0, 0];
          const placement = geoEntity(index, tokRef(profileEntity.args[2]));
          const profilePoint = placement ? (pointCoords(index, tokRef(placement.args[0]), cache) || [0, 0]) : [0, 0];
          radius = Math.hypot((profilePoint[0] || 0) - (axisPoint[0] || 0), (profilePoint[1] || 0) - (axisPoint[1] || 0));
        }
        if (profile && angle > 0 && radius > 0) {
          const sweep = angle * radius;
          result = { volume: profile.area * sweep, area: profile.perimeter * sweep, length: sweep, approx: true, kind: 'revolución' };
        } else if (profile && angle > 0) {
          result = { volume: 0, area: 0, length: 0, approx: true, kind: 'revolución' };
        }
      } else if (type === 'IFCSWEPTDISKSOLID' || type === 'IFCSWEPTDISKSOLIDPOLYGONAL') {
        const points = curvePoints(index, tokRef(a[0]), cache, (depth || 0) + 1);
        const radius = Math.abs(tokNumber(a[1]) || 0);
        const inner = Math.abs(tokNumber(a[2]) || 0);
        const length = polylineLength(points, false);
        if (length > 0 && radius > 0) {
          const section = Math.PI * (radius * radius - inner * inner);
          result = { volume: section * length, area: 2 * Math.PI * radius * length, length, approx: false, kind: 'barrido' };
        }
      } else if (type === 'IFCSURFACECURVESWEPTAREASOLID' || type === 'IFCFIXEDREFERENCESWEPTAREASOLID' || type === 'IFCDIRECTRIXCURVESWEPTAREASOLID') {
        const profile = profileGeometry(index, tokRef(a[0]), cache, (depth || 0) + 1);
        const points = curvePoints(index, tokRef(a[2]), cache, (depth || 0) + 1);
        const length = polylineLength(points, false);
        if (profile && length > 0) {
          result = { volume: profile.area * length, area: profile.perimeter * length, length, approx: true, kind: 'barrido' };
        }
      } else if (type === 'IFCFACETEDBREP' || type === 'IFCADVANCEDBREP') {
        const polygons = shellPolygons(index, [tokRef(a[0])], cache, (depth || 0) + 1);
        const mesh = meshQuantities(polygons);
        result = { volume: mesh.volume, area: mesh.area, length: 0, approx: type === 'IFCADVANCEDBREP', kind: 'malla' };
      } else if (type === 'IFCFACETEDBREPWITHVOIDS') {
        const outer = meshQuantities(shellPolygons(index, [tokRef(a[0])], cache, (depth || 0) + 1));
        const voids = meshQuantities(shellPolygons(index, listRefs(a[1]), cache, (depth || 0) + 1));
        result = { volume: Math.max(0, outer.volume - voids.volume), area: outer.area + voids.area, length: 0, approx: false, kind: 'malla' };
      } else if (type === 'IFCSHELLBASEDSURFACEMODEL' || type === 'IFCFACEBASEDSURFACEMODEL') {
        const polygons = shellPolygons(index, listRefs(a[0]), cache, (depth || 0) + 1);
        const mesh = meshQuantities(polygons);
        // Superficies abiertas: la superficie es fiable, el volumen no.
        result = { volume: 0, area: mesh.area, length: 0, approx: true, kind: 'superficie' };
      } else if (type === 'IFCPOLYGONALFACESET' || type === 'IFCTRIANGULATEDFACESET') {
        const coordList = geoEntity(index, tokRef(a[0]));
        const points = [];
        if (coordList && coordList.args[0] && coordList.args[0].t === 'list') {
          for (const row of coordList.args[0].v) {
            if (row && row.t === 'list') points.push(row.v.map(token => tokNumber(token) || 0));
          }
        }
        const polygons = [];
        if (type === 'IFCPOLYGONALFACESET') {
          for (const ref of listRefs(a[2])) {
            const face = geoEntity(index, ref);
            if (!face || !face.args[0] || face.args[0].t !== 'list') continue;
            const polygon = [];
            for (const token of face.args[0].v) {
              const i = tokNumber(token);
              if (Number.isFinite(i) && points[i - 1]) polygon.push(points[i - 1]);
            }
            if (polygon.length > 2) polygons.push(polygon);
          }
        } else {
          const list = a[3];
          if (list && list.t === 'list') {
            for (const row of list.v) {
              if (!row || row.t !== 'list') continue;
              const polygon = [];
              for (const token of row.v) {
                const i = tokNumber(token);
                if (Number.isFinite(i) && points[i - 1]) polygon.push(points[i - 1]);
              }
              if (polygon.length > 2) polygons.push(polygon);
            }
          }
        }
        const mesh = meshQuantities(polygons);
        const closed = tokBoolLike(a[type === 'IFCPOLYGONALFACESET' ? 1 : 2]);
        result = { volume: closed === false ? 0 : mesh.volume, area: mesh.area, length: 0, approx: closed === false, kind: 'malla' };
      } else if (type === 'IFCBOOLEANRESULT' || type === 'IFCBOOLEANCLIPPINGRESULT') {
        const operator = clean(tokString(a[0])).toUpperCase();
        const first = solidGeometry(index, tokRef(a[1]), cache, (depth || 0) + 1) || EMPTY_GEOMETRY;
        const second = solidGeometry(index, tokRef(a[2]), cache, (depth || 0) + 1) || EMPTY_GEOMETRY;
        let volume = first.volume;
        if (operator === 'UNION') volume = first.volume + second.volume;
        else if (operator === 'DIFFERENCE') volume = Math.max(0, first.volume - second.volume);
        else if (operator === 'INTERSECTION') volume = Math.min(first.volume, second.volume);
        result = { volume, area: first.area, length: first.length, approx: true, kind: 'booleana' };
      } else if (type === 'IFCCSGSOLID') {
        result = solidGeometry(index, tokRef(a[0]), cache, (depth || 0) + 1);
      } else if (type === 'IFCMAPPEDITEM') {
        const source = geoEntity(index, tokRef(a[0]));
        const target = geoEntity(index, tokRef(a[1]));
        let scale = 1;
        if (target) {
          const s = tokNumber(target.args[3]);
          if (Number.isFinite(s) && s > 0) scale = s;
        }
        const mapped = source ? representationGeometry(index, tokRef(source.args[1]), cache, (depth || 0) + 1) : null;
        if (mapped) {
          result = {
            volume: mapped.volume * scale * scale * scale,
            area: mapped.area * scale * scale,
            length: mapped.length * scale,
            approx: mapped.approx,
            kind: mapped.kind
          };
        }
      } else if (type === 'IFCPOLYLINE' || type === 'IFCINDEXEDPOLYCURVE' || type === 'IFCTRIMMEDCURVE' || type === 'IFCCOMPOSITECURVE') {
        const points = curvePoints(index, id, cache, (depth || 0) + 1);
        const length = polylineLength(points, false);
        if (length > 0) result = { volume: 0, area: 0, length, approx: false, kind: 'eje' };
      } else if (type === 'IFCGEOMETRICSET' || type === 'IFCGEOMETRICCURVESET') {
        let length = 0;
        for (const ref of listRefs(a[0])) {
          const part = solidGeometry(index, ref, cache, (depth || 0) + 1);
          if (part) length += part.length;
        }
        if (length > 0) result = { volume: 0, area: 0, length, approx: false, kind: 'eje' };
      }
    }
    cache.solids.set(id, result);
    return result;
  }

  function tokBoolLike(token) {
    if (!token) return null;
    if (token.t === 'enum') return token.v === 'T' ? true : token.v === 'F' ? false : null;
    return null;
  }

  /** Suma los sólidos de una IfcShapeRepresentation. */
  function representationGeometry(index, id, cache, depth) {
    if (!id || (depth || 0) > GEOMETRY_MAX_DEPTH) return null;
    const item = geoEntity(index, id);
    if (!item) return null;
    const items = listRefs(item.args[3] || item.args[2]);
    let volume = 0, area = 0, length = 0, approx = false, kind = '';
    let found = false;
    for (const ref of items) {
      const part = solidGeometry(index, ref, cache, (depth || 0) + 1);
      if (!part) continue;
      found = true;
      volume += part.volume; area += part.area;
      length = Math.max(length, part.length);
      approx = approx || part.approx;
      kind = kind || part.kind;
    }
    return found ? { volume, area, length, approx, kind } : null;
  }

  /**
   * Medición de un producto a partir de su representación. Se usa «Body» para el
   * cuerpo y, si existe, «Axis» para la longitud real del eje, que es lo que se
   * mide en vigas, muros y conductos.
   */
  function productGeometry(index, representationId, cache) {
    if (!representationId) return null;
    const shape = geoEntity(index, representationId);
    // Algunos exportadores escriben el supertipo IfcProductRepresentation en vez
    // de IfcProductDefinitionShape; ambos llevan las representaciones en el mismo
    // argumento y hay que aceptar los dos o el modelo entero se queda sin medir.
    if (!shape || (shape.type !== 'IFCPRODUCTDEFINITIONSHAPE' && shape.type !== 'IFCPRODUCTREPRESENTATION')) return null;
    let body = null, axisLength = 0;
    for (const ref of listRefs(shape.args[2])) {
      const representation = geoEntity(index, ref);
      if (!representation) continue;
      const identifier = clean(tokString(representation.args[1])).toLowerCase();
      if (identifier === 'box' || identifier === 'footprint' || identifier === 'annotation') continue;
      const geometry = representationGeometry(index, ref, cache, 0);
      if (!geometry) continue;
      if (identifier === 'axis') { axisLength = Math.max(axisLength, geometry.length); continue; }
      if (!body) body = geometry;
      else {
        body = {
          volume: body.volume + geometry.volume,
          area: body.area + geometry.area,
          length: Math.max(body.length, geometry.length),
          approx: body.approx || geometry.approx,
          kind: body.kind || geometry.kind
        };
      }
    }
    if (!body && axisLength > 0) body = { volume: 0, area: 0, length: axisLength, approx: false, kind: 'eje' };
    if (!body) return null;
    if (axisLength > 0) body = Object.assign({}, body, { length: axisLength });
    return body;
  }

  /** Convierte la geometría a m, m² y m³ y la devuelve como filas de cantidad. */
  function quantitiesFromGeometry(index, element, representationId, units, cache) {
    const geometry = productGeometry(index, representationId, cache);
    if (!geometry) return [];
    const f = (units && units.factors && units.factors.length) || 1;
    const rows = [];
    const setName = 'Geometría IFC';
    const push = (name, unit, dimension, value, raw) => {
      if (!Number.isFinite(value) || value <= 0) return;
      rows.push({
        elementId: element.stepId, globalId: element.globalId, ifcClass: element.ifcClass,
        level: element.level, description: element.description,
        setName, name, unit, dimension, value, rawValue: raw,
        sourceStepId: representationId, source: geometry.approx ? 'Geometría IFC (aprox.)' : 'Geometría IFC'
      });
    };
    push('Volumen', 'm³', 'volume', geometry.volume * f * f * f, geometry.volume);
    push('Área', 'm²', 'area', geometry.area * f * f, geometry.area);
    push('Longitud', 'm', 'length', geometry.length * f, geometry.length);
    return rows;
  }

  function quantityFromEntity(index, q, setName, elementId, element, units) {
    const unit = QUANTITY_TYPES[q.type];
    const dimension = QUANTITY_DIMENSION[q.type];
    if (!unit || !dimension) return null;
    const raw = tokNumber(q.args[3]);
    // Una cantidad puede declarar su propia unidad y, si lo hace, manda sobre la
    // del proyecto (IfcPhysicalSimpleQuantity.Unit).
    const own = unitFactorOf(index, tokRef(q.args[2]), 0);
    const value = (own && own.dimension === dimension)
      ? (Number.isFinite(raw) ? raw * own.factor : raw)
      : scaleValue(raw, dimension, units);
    return {
      elementId,
      globalId: element.globalId,
      ifcClass: element.ifcClass,
      level: element.level,
      description: element.description,
      setName: clean(setName || 'Cantidades'),
      name: clean(tokString(q.args[0]) || q.type.replace('IFCQUANTITY', '')),
      unit,
      dimension,
      value,
      rawValue: raw,
      sourceStepId: q.id,
      source: 'IfcElementQuantity'
    };
  }

  /**
   * Recorre las cantidades de un IfcElementQuantity, incluidas las agrupadas en
   * IfcPhysicalComplexQuantity (tramos, capas, subconjuntos). Antes se ignoraban
   * y el elemento quedaba sin medición aunque el IFC sí la traía.
   */
  function collectQuantities(index, refs, setName, elementId, element, units, out, depth, seen) {
    if ((depth || 0) > 6) return out;
    seen = seen || new Set();
    for (const qId of refs) {
      const q = entity(index, qId);
      if (!q || seen.has(qId)) continue;
      seen.add(qId);
      if (q.type === 'IFCPHYSICALCOMPLEXQUANTITY') {
        const label = clean(tokString(q.args[0]));
        collectQuantities(index, listRefs(q.args[2]), label ? `${setName} · ${label}` : setName, elementId, element, units, out, (depth || 0) + 1, seen);
        continue;
      }
      const quantity = quantityFromEntity(index, q, setName, elementId, element, units);
      if (quantity) out.push(quantity);
    }
    return out;
  }

  /**
   * Última red de seguridad para la medición: si un elemento no trae ninguna
   * IfcElementQuantity pero sí propiedades con medida tipada
   * (IFCAREAMEASURE, IFCVOLUMEMEASURE, IFCLENGTHMEASURE…), se usan como cantidad
   * marcada como tal. El tipo IFC da la magnitud, así que la escala es fiable.
   */
  function quantitiesFromProperties(element, units) {
    const rows = [];
    for (const property of element.properties) {
      const dimension = MEASURE_DIMENSION[String(property.valueType || '').toUpperCase()];
      if (!dimension) continue;
      const raw = Number(property.value);
      if (!Number.isFinite(raw)) continue;
      if (!/(?:AREA|SUPERFIC|VOLUM|LENGTH|LONGITUD|WIDTH|ANCHO|HEIGHT|ALTUR|PERIMET|THICKNESS|ESPESOR|WEIGHT|MASS|PESO|COUNT|CANTIDAD)/i.test(property.name)) continue;
      rows.push({
        elementId: element.stepId,
        globalId: element.globalId,
        ifcClass: element.ifcClass,
        level: element.level,
        description: element.description,
        setName: property.setName,
        name: property.name,
        unit: DIMENSION_UNIT[dimension],
        dimension,
        value: scaleValue(raw, dimension, units),
        rawValue: raw,
        sourceStepId: property.sourceStepId,
        source: 'Propiedad IFC'
      });
    }
    return rows;
  }

  function chooseMeasure(element) {
    // Una medición nunca es negativa: descartar esos valores evita elegir por
    // error una cota de nivel bajo rasante como cantidad de presupuesto.
    const all = element.quantities.filter(q => Number.isFinite(q.value) && q.value >= 0);
    // Una cantidad declarada en el IFC siempre gana a una deducida de propiedades.
    const official = all.filter(q => q.source === 'IfcElementQuantity');
    const quantities = official.length ? official : all;
    const best = (unit, patterns) => {
      const rows = quantities.filter(q => q.unit === unit);
      if (!rows.length) return null;
      return rows.slice().sort((a, b) => {
        const score = row => {
          const name = row.name.toUpperCase();
          for (let i = 0; i < patterns.length; i++) if (patterns[i].test(name)) return 100 - i * 10;
          return 1;
        };
        return score(b) - score(a);
      })[0];
    };
    const area = best('m²', [/NETSIDEAREA|NETAREA|NETFLOORAREA/, /GROSSSIDEAREA|GROSSAREA|GROSSFLOORAREA/, /AREA/]);
    const volume = best('m³', [/NETVOLUME/, /GROSSVOLUME/, /VOLUME/]);
    const length = best('m', [/^LENGTH$|NETLENGTH|TOTALLENGTH/, /PERIMETER/, /HEIGHT|WIDTH/]);
    const count = best('ud', [/COUNT|NUMBER/, /.*/]);
    const type = element.ifcClass;
    let selected = null;
    if (/DOOR|WINDOW|FURNISH|TERMINAL|OUTLET|FIXTURE|APPLIANCE|EQUIPMENT|PROXY/.test(type)) selected = count || { unit: 'ud', value: 1, name: 'Recuento' };
    else if (/PIPE|DUCT|CABLE|RAILING|FLOWSEGMENT/.test(type)) selected = length || count;
    else if (/COLUMN|BEAM|MEMBER|FOOTING|PILE|REINFORC|SLAB/.test(type)) selected = volume || area || length || count;
    else if (/WALL|ROOF|COVERING|CURTAIN/.test(type)) selected = area || volume || length || count;
    else selected = volume || area || length || count;
    return {
      area: area ? area.value : 0,
      volume: volume ? volume.value : 0,
      length: length ? length.value : 0,
      count: count ? count.value : 1,
      unit: selected ? selected.unit : 'ud',
      value: selected && Number.isFinite(selected.value) ? selected.value : 1,
      sourceName: selected ? selected.name : 'Recuento por elemento',
      measureSource: selected && selected.source ? selected.source : 'Recuento automático'
    };
  }

  function chapterFor(category) {
    const codes = {
      'Cimentación': '01 · Cimentación', 'Estructura': '02 · Estructura',
      'Muros y cerramientos': '03 · Fachadas y particiones', 'Forjados y cubiertas': '04 · Forjados y cubiertas',
      'Carpinterías': '05 · Carpinterías', 'Circulación y protecciones': '06 · Escaleras y protecciones',
      'Acabados': '07 · Acabados', 'Instalaciones': '08 · Instalaciones',
      'Equipamiento': '09 · Equipamiento', 'Huecos y operaciones': 'No presupuestar', 'Otros elementos': '99 · Revisar'
    };
    return codes[category] || '99 · Revisar';
  }

  /**
   * Cede el hilo entre fases. No se usa requestAnimationFrame a propósito: en una
   * pestaña que no está a la vista el navegador deja de emitir fotogramas y el
   * análisis se quedaría parado hasta volver a ella. MessageChannel sí sigue
   * despachando y permite repintar cuando la pestaña está visible.
   */
  const yieldToHost = (function () {
    if (typeof document !== 'undefined' && typeof MessageChannel === 'function') {
      const channel = new MessageChannel();
      const queue = [];
      channel.port1.onmessage = () => { const resolve = queue.shift(); if (resolve) resolve(); };
      return () => new Promise(resolve => { queue.push(resolve); channel.port2.postMessage(0); });
    }
    return () => new Promise(resolve => setTimeout(resolve, 0));
  })();

  function makeScheduler(onProgress) {
    let last = Date.now();
    return async function tick(value, message) {
      if (typeof onProgress === 'function') { try { onProgress(value, message); } catch (_) {} }
      const now = Date.now();
      if (now - last < 60) return;
      last = now;
      await yieldToHost();
    };
  }

  function storeyElevation(args) {
    const direct = tokNumber(args[9]);
    if (Number.isFinite(direct)) return direct;
    for (let i = args.length - 1; i >= 8; i--) {
      const value = tokNumber(args[i]);
      if (Number.isFinite(value)) return value;
    }
    return null;
  }

  async function analyze(text, fileInfo, onProgress) {
    fileInfo = fileInfo || {};
    const tick = makeScheduler(onProgress);
    await tick(0.05, 'Leyendo la cabecera del IFC');
    const header = parseHeader(text);
    await tick(0.1, 'Recuperando entidades STEP');
    const index = scanEntities(text);
    await tick(0.45, 'Resolviendo relaciones, tipos y materiales');
    const rel = collectRelations(index);
    const units = parseUnits(index);
    const storeys = new Map();
    for (const row of entitiesOf(index, 'IFCBUILDINGSTOREY')) {
      const elevation = scaleValue(storeyElevation(row.args), 'length', units);
      storeys.set(row.id, { id: row.id, globalId: clean(tokString(row.args[0])), name: clean(tokString(row.args[2]) || tokString(row.args[7]) || ('Nivel #' + row.id)), elevation });
    }

    const rawProducts = [];
    for (const row of index.byId.values()) if (isProduct(row.type)) rawProducts.push(row);
    const globalCounts = new Map();
    for (const row of rawProducts) {
      const gid = clean(tokString(row.args[0]));
      if (gid) globalCounts.set(gid, (globalCounts.get(gid) || 0) + 1);
    }

    await tick(0.5, 'Cuantificando elementos');
    const geometryCache = { profiles: new Map(), solids: new Map() };
    const elements = [], quantityRows = [], propertyRows = [];
    let done = 0;
    for (const row of rawProducts) {
      if ((++done & 255) === 0) await tick(0.5 + 0.35 * (done / Math.max(1, rawProducts.length)), `Cuantificando elementos (${done}/${rawProducts.length})`);
      const a = row.args;
      const globalId = clean(tokString(a[0]));
      let levelId = rel.containment.get(row.id) || 0;
      if (!levelId) {
        let parent = rel.aggregatesParent.get(row.id), guard = 0;
        while (parent && guard++ < 12) {
          if (storeys.has(parent)) { levelId = parent; break; }
          if (rel.containment.has(parent)) { levelId = rel.containment.get(parent); break; }
          parent = rel.aggregatesParent.get(parent);
        }
      }
      const level = storeys.get(levelId) || { id: 0, name: 'Sin nivel', elevation: null };
      const typeId = rel.typeOf.get(row.id) || 0;
      const typeEntity = entity(index, typeId);
      const typeName = typeEntity ? clean(tokString(typeEntity.args[2]) || tokString(typeEntity.args[8])) : '';
      const materials = (rel.materials.get(row.id) || []).flatMap(id => materialInfo(index, id, new Set(), 0))
        .map(item => ({ name: item.name, thickness: Number.isFinite(item.thickness) ? scaleValue(item.thickness, 'length', units) : item.thickness }));
      const uniqueMaterials = [...new Map(materials.filter(m => m.name).map(m => [m.name + '|' + m.thickness, m])).values()];
      const element = {
        stepId: row.id,
        globalId,
        ifcClass: row.type,
        predefinedType: lastEnum(a),
        name: clean(tokString(a[2])),
        description: clean(tokString(a[3]) || tokString(a[2]) || row.type),
        objectType: clean(tokString(a[4])),
        tag: clean(tokString(a[7])),
        typeId,
        typeName,
        category: categoryFor(row.type),
        chapter: '',
        levelId: level.id,
        level: level.name,
        elevation: level.elevation,
        materials: uniqueMaterials,
        quantities: [],
        properties: [],
        issues: [],   // impiden o comprometen la medición
        notes: [],    // información útil que no invalida la medición
        included: true
      };
      element.chapter = chapterFor(element.category);
      const definitions = [...(rel.propertyDefs.get(row.id) || [])];
      if (typeId) definitions.push(...(rel.propertyDefs.get(typeId) || []));
      for (const defId of [...new Set(definitions)]) {
        const def = entity(index, defId);
        if (!def) continue;
        if (def.type === 'IFCELEMENTQUANTITY') {
          const setName = clean(tokString(def.args[2]) || 'Cantidades');
          const rows = collectQuantities(index, listRefs(def.args[5]), setName, row.id, element, units, [], 0, null);
          for (const quantity of rows) { element.quantities.push(quantity); quantityRows.push(quantity); }
        } else if (def.type === 'IFCPROPERTYSET') {
          const setName = clean(tokString(def.args[2]) || 'Pset');
          for (const pId of listRefs(def.args[4])) {
            const prop = entity(index, pId);
            if (!prop) continue;
            let parsed = null;
            if (prop.type === 'IFCPROPERTYSINGLEVALUE') parsed = valueFromProperty(prop.args[2]);
            else if (prop.type === 'IFCPROPERTYENUMERATEDVALUE') parsed = { value: tokString(prop.args[2]), valueType: 'ENUMERATION' };
            else if (prop.type === 'IFCPROPERTYLISTVALUE') parsed = { value: tokString(prop.args[2]), valueType: 'LIST' };
            if (!parsed) continue;
            const item = {
              elementId: row.id, globalId, ifcClass: row.type, level: level.name,
              setName, name: clean(tokString(prop.args[0])), valueType: parsed.valueType,
              value: parsed.value, sourceStepId: pId, origin: defId === (rel.propertyDefs.get(row.id) || [])[0] ? 'Instancia' : 'IFC'
            };
            element.properties.push(item);
            propertyRows.push(item);
          }
        }
      }
      const hasIfcQuantities = element.quantities.length > 0;
      let quantityOrigin = hasIfcQuantities ? 'IfcElementQuantity' : 'Sin medición';
      if (!hasIfcQuantities) {
        // Sin IfcElementQuantity se mide la forma, que es lo que hace cualquier
        // visor profesional. Si tampoco hay geometría legible, se recurre a las
        // propiedades con medida tipada.
        const fromGeometry = quantitiesFromGeometry(index, element, tokRef(a[6]), units, geometryCache);
        if (fromGeometry.length) {
          for (const quantity of fromGeometry) { element.quantities.push(quantity); quantityRows.push(quantity); }
          quantityOrigin = 'Geometría IFC';
        } else {
          const derived = quantitiesFromProperties(element, units);
          if (derived.length) {
            for (const quantity of derived) { element.quantities.push(quantity); quantityRows.push(quantity); }
            quantityOrigin = 'Propiedad IFC';
          }
        }
      }
      element.quantityOrigin = quantityOrigin;
      const measure = chooseMeasure(element);
      Object.assign(element, measure);
      // El estado depende de si el elemento SE PUEDE MEDIR, no de si le falta
      // cualquier dato. Antes, no tener tipo o material bastaba para marcarlo, y
      // en un modelo normal eso pintaba de amarillo el 100 % de los elementos.
      if (!globalId) element.issues.push('GLOBALID_AUSENTE');
      else if (!/^[0-9A-Za-z_$]{22}$/.test(globalId)) element.notes.push('GLOBALID_NO_ESTANDAR');
      if (globalId && globalCounts.get(globalId) > 1) element.issues.push('GLOBALID_DUPLICADO');
      if (!element.name && !element.description) element.notes.push('NOMBRE_AUSENTE');
      if (!levelId) element.notes.push('NIVEL_NO_RESUELTO');
      element.hasIfcQuantities = hasIfcQuantities;
      if (!hasIfcQuantities) element.notes.push('SIN_CANTIDADES_IFC');
      if (quantityOrigin === 'Geometría IFC') element.notes.push('CANTIDAD_DESDE_GEOMETRIA');
      if (quantityOrigin === 'Propiedad IFC') element.notes.push('CANTIDAD_DESDE_PROPIEDAD');
      if (quantityOrigin === 'Sin medición') element.issues.push('SIN_MEDICION');
      // Solo compromete la medición lo que afecta a la cantidad elegida. Los
      // conjuntos de Revit incluyen cotas de nivel negativas por debajo de la
      // rasante: son correctas y marcaban como erróneo casi todo el modelo.
      if (!Number.isFinite(element.value)) element.issues.push('CANTIDAD_NO_NUMERICA');
      else if (element.value < 0) element.issues.push('CANTIDAD_NEGATIVA');
      else if (element.value === 0) element.issues.push('CANTIDAD_CERO');
      if (element.quantities.some(q => Number.isFinite(q.value) && q.value < 0)) element.notes.push('VALORES_NEGATIVOS_EN_CONJUNTO');
      if (row.type === 'IFCBUILDINGELEMENTPROXY') element.notes.push('ELEMENTO_PROXY');
      if (!typeName) element.notes.push('TIPO_NO_RESUELTO');
      if (!uniqueMaterials.length) element.notes.push('MATERIAL_NO_RESUELTO');
      element.status = element.issues.some(code => /DUPLICADO|NO_NUMERICA|NEGATIVA/.test(code))
        ? 'Error'
        : (element.issues.length ? 'Revisar' : 'Correcto');
      elements.push(element);
    }

    const findings = [];
    const addFinding = (severity, code, title, detail, elementIds, action) => findings.push({ id: findings.length + 1, severity, code, title, detail, elementIds: elementIds || [], action: action || '' });
    const byteAudit = fileInfo.byteAudit || {};
    if (byteAudit.nulBytes > 0 || byteAudit.controlBytes > 0) addFinding('Bloqueante', 'BYTES_CONTROL', 'El archivo contiene bytes de control o nulos', `${byteAudit.controlBytes || 0} bytes de control; ${byteAudit.nulBytes || 0} nulos. Puede haber corrupción binaria.`, [], 'Recupera o vuelve a exportar el IFC desde la aplicación de origen.');
    if (byteAudit.invalidUtf8) addFinding('Aviso', 'CODIFICACION', 'Codificación no UTF-8', 'Se aplicó lectura Windows-1252 tolerante. Revisa nombres y descripciones.', [], 'Exporta el IFC como STEP/ASCII estándar o verifica los textos.');
    if (!header.hasDataSection) addFinding('Bloqueante', 'SIN_DATA', 'No se encontró la sección DATA', 'El archivo no tiene la estructura mínima ISO 10303-21.', [], 'Selecciona un IFC STEP válido.');
    if (!header.hasEndIso) addFinding('Bloqueante', 'SIN_FIN_IFC', 'Falta END-ISO-10303-21', 'El archivo parece truncado o incompleto.', [], 'Vuelve a exportar o recupera el archivo.');
    if (!/^IFC(?:2X3|4)/.test(header.schema)) addFinding('Aviso', 'SCHEMA', 'Esquema no identificado', `Esquema detectado: ${header.schema}.`, [], 'Comprueba que sea IFC2X3, IFC4 o IFC4X3.');
    if (index.malformed.length) addFinding(index.malformed.length > 3 ? 'Bloqueante' : 'Aviso', 'STEP_DANADO', 'Entidades STEP dañadas o ilegibles', `${index.malformed.length} inicios de entidad no pudieron recuperarse.`, index.malformed.slice(0, 100).map(x => x.id), 'Revisa el IFC original; la exportación recuperable no puede garantizar estas entidades.');
    if (index.duplicateIds.length) addFinding('Bloqueante', 'STEP_ID_DUPLICADO', 'Identificadores STEP duplicados', `${index.duplicateIds.length} identificadores # repetidos.`, index.duplicateIds.slice(0, 500), 'Regenera el IFC.');
    if (!units.declared) addFinding('Aviso', 'UNIDADES_AUSENTES', 'No se encontró IfcUnitAssignment', 'Se asumen unidades SI (metro, m², m³, kg). Si el modelo estaba en milímetros, las cantidades no serán correctas.', [], 'Verifica las unidades del proyecto antes de presupuestar.');
    else if (!units.lengthIsMetre) addFinding('Informativo', 'UNIDADES_CONVERTIDAS', 'Unidades del proyecto convertidas', `El IFC declara longitudes en ${units.names.length || 'unidad no métrica'}; todas las cantidades se han convertido a m, m², m³ y kg.`, [], 'Compara una cantidad conocida con el modelo original antes de presupuestar.');
    if (!storeys.size) addFinding('Aviso', 'NIVELES_AUSENTES', 'No se detectaron niveles', 'La agrupación por planta no estará disponible.', [], 'Revisa la estructura espacial del IFC.');
    if (!elements.length) addFinding('Bloqueante', 'SIN_ELEMENTOS', 'No se recuperaron elementos físicos', 'No hay productos IFC utilizables para mediciones.', [], 'Comprueba la integridad y el tipo de archivo.');
    const missingQuantity = elements.filter(e => !e.hasIfcQuantities).map(e => e.stepId);
    if (missingQuantity.length) addFinding('Informativo', 'COBERTURA_CANTIDADES', 'Elementos sin IfcElementQuantity', `${missingQuantity.length} de ${elements.length} elementos no traen cantidades declaradas; se han medido por otros medios cuando ha sido posible.`, missingQuantity, 'Para una medición contractual, reexporta el IFC incluyendo BaseQuantities.');
    const fromGeometry = elements.filter(e => e.quantityOrigin === 'Geometría IFC').map(e => e.stepId);
    if (fromGeometry.length) addFinding('Informativo', 'CANTIDAD_DESDE_GEOMETRIA', 'Cantidades calculadas desde la geometría', `${fromGeometry.length} elementos sin IfcElementQuantity se han medido a partir de su forma (perfil × longitud, barridos y mallas), igual que hace un visor IFC.`, fromGeometry, 'Contrasta un par de piezas conocidas antes de presupuestar.');
    const derivedQuantity = elements.filter(e => e.quantityOrigin === 'Propiedad IFC').map(e => e.stepId);
    if (derivedQuantity.length) addFinding('Informativo', 'CANTIDAD_DESDE_PROPIEDAD', 'Cantidades deducidas de propiedades', `${derivedQuantity.length} elementos han tomado su medida de propiedades con medida tipada (IfcAreaMeasure, IfcVolumeMeasure…).`, derivedQuantity, 'Verifica estas medidas: no proceden de las cantidades base del IFC.');
    const noMeasure = elements.filter(e => e.quantityOrigin === 'Sin medición').map(e => e.stepId);
    if (noMeasure.length) addFinding('Aviso', 'SIN_MEDICION', 'Elementos sin ninguna medición', `${noMeasure.length} elementos no tienen cantidades, ni geometría legible, ni propiedades dimensionales. Se exportan como 1 ud.`, noMeasure, 'Revísalos uno a uno o mídelos aparte antes de presupuestar.');
    const unresolvedLevels = elements.filter(e => !e.levelId).map(e => e.stepId);
    if (unresolvedLevels.length) addFinding('Informativo', 'NIVELES_NO_RESUELTOS', 'Elementos sin nivel trazable', `${unresolvedLevels.length} elementos no se relacionan con IfcBuildingStorey.`, unresolvedLevels, 'Asigna planta antes de usar resúmenes por nivel.');
    const duplicatedGlobalIds = elements.filter(e => e.issues.includes('GLOBALID_DUPLICADO')).map(e => e.stepId);
    if (duplicatedGlobalIds.length) addFinding('Bloqueante', 'GLOBALID_DUPLICADO', 'GlobalId repetidos', `${duplicatedGlobalIds.length} elementos comparten identificadores globales.`, duplicatedGlobalIds, 'Corrige el modelo para conservar trazabilidad individual.');
    const proxies = elements.filter(e => e.ifcClass === 'IFCBUILDINGELEMENTPROXY').map(e => e.stepId);
    if (proxies.length) addFinding('Informativo', 'PROXIES', 'Elementos genéricos', `${proxies.length} IfcBuildingElementProxy requieren clasificación manual.`, proxies, 'Asigna una clase IFC específica o un capítulo manual.');

    const blocking = findings.filter(f => f.severity === 'Bloqueante').length;
    const warnings = findings.filter(f => f.severity === 'Aviso').length;
    const measurable = elements.filter(e => e.quantityOrigin && e.quantityOrigin !== 'Sin medición').length;
    const coverage = elements.length ? measurable / elements.length : 0;
    const declaredCoverage = elements.length ? elements.filter(e => e.hasIfcQuantities).length / elements.length : 0;
    let score = 100 - blocking * 22 - warnings * 5 - Math.round((1 - coverage) * 25);
    score = Math.max(0, Math.min(100, score));

    const byCategory = new Map(), byLevel = new Map();
    for (const el of elements) {
      const cat = byCategory.get(el.category) || { name: el.category, total: 0, included: 0, withQuantities: 0, issues: 0 };
      cat.total++; cat.included++; if (el.quantityOrigin !== 'Sin medición') cat.withQuantities++; if (el.issues.length) cat.issues++; byCategory.set(el.category, cat);
      const lev = byLevel.get(el.level) || { name: el.level, elevation: el.elevation, total: 0, included: 0, withQuantities: 0 };
      lev.total++; lev.included++; if (el.quantityOrigin !== 'Sin medición') lev.withQuantities++; byLevel.set(el.level, lev);
    }
    const originalTokens = Math.ceil((fileInfo.size || text.length) / 3.7);
    const result = {
      version: VERSION,
      source: {
        name: fileInfo.name || header.internalName || 'modelo.ifc',
        size: fileInfo.size || text.length,
        sha256: fileInfo.sha256 || '',
        schema: header.schema,
        internalName: header.internalName,
        originatingSystem: header.originatingSystem,
        entitiesDetected: index.detectedStarts,
        entitiesRecovered: index.recovered,
        entitiesIndexed: index.indexed,
        malformedEntities: index.malformed.length,
        units: {
          declared: units.declared,
          length: units.names.length || (units.declared ? 'METRE' : 'METRE (asumida)'),
          area: units.names.area || 'derivada de la longitud',
          volume: units.names.volume || 'derivada de la longitud',
          mass: units.names.mass || 'KILOGRAM (asumida)',
          factors: units.factors
        },
        byteAudit
      },
      elements, quantities: quantityRows, properties: propertyRows, storeys: [...storeys.values()], findings,
      summary: {
        score, blocking, warnings, elementCount: elements.length, quantityCount: quantityRows.length,
        propertyCount: propertyRows.length, coverage, declaredCoverage, measurable, categories: [...byCategory.values()].sort((a, b) => b.total - a.total),
        levels: [...byLevel.values()].sort((a, b) => (a.elevation == null) - (b.elevation == null) || (a.elevation || 0) - (b.elevation || 0)),
        originalTokens, compactTokens: 0, tokenReduction: 0
      },
      diagnostics: { malformed: index.malformed.slice(0, 500), duplicateStepIds: index.duplicateIds }
    };
    await tick(0.92, 'Estimando el contexto para IA');
    const selection = new Set(elements.map(element => element.stepId));
    const compactChars = buildJson(result, selection, 'equilibrado').length;
    result.summary.compactTokens = Math.ceil(compactChars / 3.7);
    result.summary.tokenReduction = originalTokens ? 1 - result.summary.compactTokens / originalTokens : 0;
    await tick(1, 'Control previo terminado');
    return result;
  }

  function selectedElements(analysis, selection) {
    const set = selection instanceof Set ? selection : new Set(selection || analysis.elements.map(e => e.stepId));
    return analysis.elements.filter(e => set.has(e.stepId));
  }

  function compactText(value, limit) {
    const text = String(value == null ? '' : value);
    const max = limit || 500;
    return text.length > max ? text.slice(0, max - 1) + '…' : text;
  }

  function profileProperties(analysis, ids, profile) {
    const all = analysis.properties.filter(property => ids.has(property.elementId));
    if (profile === 'minimo') return { rows: [], sourceCount: all.length, candidateCount: 0 };
    if (profile === 'trazabilidad') return { rows: all, sourceCount: all.length, candidateCount: all.length };

    const rows = [], seen = new Set();
    const globalLimit = Math.max(200, Math.floor(Math.max(1, analysis.source.size || 0) / 480));
    for (const element of analysis.elements) {
      if (!ids.has(element.stepId) || rows.length >= globalLimit) continue;
      const candidates = (element.properties || []).filter(property => IMPORTANT_PSETS.test(property.setName + ' ' + property.name));
      candidates.sort((a, b) => {
        const pa = HIGH_VALUE_PROPERTIES.test(a.setName + ' ' + a.name) ? 0 : 1;
        const pb = HIGH_VALUE_PROPERTIES.test(b.setName + ' ' + b.name) ? 0 : 1;
        return pa - pb;
      });
      let included = 0;
      for (const property of candidates) {
        const key = `${property.elementId}|${property.setName}|${property.name}|${String(property.value)}`;
        if (seen.has(key)) continue;
        seen.add(key); rows.push(property); included++;
        if (included >= BALANCED_PROPERTIES_PER_ELEMENT || rows.length >= globalLimit) break;
      }
    }
    return { rows, sourceCount: all.length, candidateCount: rows.length };
  }

  function compactData(analysis, selection, profile) {
    const elements = selectedElements(analysis, selection);
    const ids = new Set(elements.map(e => e.stepId));
    const quantities = analysis.quantities.filter(q => ids.has(q.elementId));
    const propertySelection = profileProperties(analysis, ids, profile);
    const properties = propertySelection.rows;
    const elementColumns = ['stepId', 'globalId', 'claseIFC', 'predefinido', 'categoria', 'capituloSugerido', 'nivel', 'cota_m', 'nombre', 'descripcion', 'tipo', 'materiales', 'unidadPresupuesto', 'cantidadPresupuesto', 'origenCantidad', 'fuenteCantidad', 'area_m2', 'volumen_m3', 'longitud_m', 'unidades', 'estadoQA', 'incidencias', 'observaciones'];
    const quantityColumns = ['stepIdElemento', 'conjunto', 'cantidadIFC', 'unidad', 'valor', 'stepIdCantidad', 'origen'];
    const propertyColumns = ['stepIdElemento', 'conjunto', 'propiedad', 'tipoValor', 'valor', 'stepIdPropiedad'];
    const compactFindings = analysis.findings.map(finding => ({
      severity: finding.severity, code: finding.code, title: finding.title,
      detail: finding.detail, action: finding.action,
      affectedCount: finding.elementIds.length,
      sampleStepIds: finding.elementIds.slice(0, 100),
      sampleTruncated: finding.elementIds.length > 100
    }));
    const propertyRows = properties.map(property => [
      property.elementId, compactText(property.setName, 160), compactText(property.name, 160),
      property.valueType, compactText(property.value, 500), property.sourceStepId
    ]);
    const output = {
      schemaVersion: 'HEFESTO-IFC2IA-1.4',
      generatedAt: new Date().toISOString(),
      generator: `HEFESTO IFC2IA Ready ${VERSION}`,
      purpose: 'Datos IFC cuantificados y trazables para mediciones y presupuestos asistidos por IA',
      privacy: 'Procesado localmente en el navegador; 0 datos enviados',
      source: analysis.source,
      selection: {
        profile: profile || 'equilibrado', selectedElements: elements.length, sourceElements: analysis.elements.length,
        sourceProperties: propertySelection.sourceCount, candidateProperties: propertySelection.candidateCount,
        includedProperties: propertyRows.length, omittedProperties: Math.max(0, propertySelection.sourceCount - propertyRows.length)
      },
      qa: { score: analysis.summary.score, blocking: analysis.summary.blocking, warnings: analysis.summary.warnings, findings: compactFindings },
      dictionary: { elementColumns, quantityColumns, propertyColumns },
      elements: elements.map(element => [
        element.stepId, element.globalId, element.ifcClass, element.predefinedType, element.category,
        element.chapter, compactText(element.level, 160), element.elevation, compactText(element.name, 300),
        compactText(element.description, 500), compactText(element.typeName, 300),
        compactText(element.materials.map(material => material.thickness == null ? material.name : `${material.name} (${round(material.thickness, 4)} m)`).join(' | '), 500),
        element.unit, round(element.value, 6), compactText(element.sourceName, 160),
        compactText(element.measureSource, 60), round(element.area, 6),
        round(element.volume, 6), round(element.length, 6), round(element.count, 3), element.status, element.issues.join(' | '), element.notes.join(' | ')
      ]),
      quantities: quantities.map(quantity => [
        quantity.elementId, compactText(quantity.setName, 160), compactText(quantity.name, 160),
        quantity.unit, round(quantity.value, 8), quantity.sourceStepId, quantity.source || 'IfcElementQuantity'
      ]),
      properties: [],
      exclusions: ['Geometría BREP/mallas', 'representaciones gráficas', 'coordenadas de vértices', 'estilos de visualización'],
      preservation: 'Se conservan identidad, clase, tipo, planta, materiales, cantidades, propiedades prioritarias, incidencias y referencias STEP/GlobalId. Los datos repetidos se enlazan por stepIdElemento.',
      unitsNote: 'Las cantidades y las cotas están convertidas a m, m², m³, kg y h a partir de IfcUnitAssignment (source.units guarda las unidades originales y los factores aplicados). Los valores de la tabla de propiedades se conservan tal cual vienen en el IFC, sin convertir.'
    };

    if (profile === 'equilibrado' || !profile) {
      const targetBytes = Math.max(4096, Math.floor(Math.max(1, analysis.source.size || 0) * 0.72));
      let available = Math.max(0, targetBytes - JSON.stringify(output).length - 2);
      for (const row of propertyRows) {
        const cost = JSON.stringify(row).length + (output.properties.length ? 1 : 0);
        if (cost > available) break;
        output.properties.push(row); available -= cost;
      }
      output.selection.includedProperties = output.properties.length;
      output.selection.omittedProperties = Math.max(0, propertySelection.sourceCount - output.properties.length);
      output.selection.targetBytes = targetBytes;
      output.selection.targetExceeded = JSON.stringify(output).length > targetBytes;
    } else {
      output.properties = propertyRows;
      output.selection.includedProperties = propertyRows.length;
      output.selection.omittedProperties = Math.max(0, propertySelection.sourceCount - propertyRows.length);
    }
    return output;
  }

  function buildJson(analysis, selection, profile) {
    return JSON.stringify(compactData(analysis, selection, profile));
  }

  function xml(value) {
    return String(value == null ? '' : value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
  }
  function colName(index) {
    let value = index + 1, out = '';
    while (value) { value--; out = String.fromCharCode(65 + value % 26) + out; value = Math.floor(value / 26); }
    return out;
  }
  function cellXml(cell, row, col) {
    if (cell == null) return '';
    const ref = colName(col) + row;
    const obj = typeof cell === 'object' && !Array.isArray(cell) && ('v' in cell || 'f' in cell || 's' in cell) ? cell : { v: cell };
    const style = obj.s == null ? '' : ` s="${obj.s}"`;
    if (obj.f) return `<c r="${ref}"${style}><f>${xml(String(obj.f).replace(/^=/, ''))}</f><v>${Number.isFinite(obj.v) ? obj.v : 0}</v></c>`;
    if (typeof obj.v === 'number' && Number.isFinite(obj.v)) return `<c r="${ref}"${style}><v>${obj.v}</v></c>`;
    if (typeof obj.v === 'boolean') return `<c r="${ref}"${style} t="b"><v>${obj.v ? 1 : 0}</v></c>`;
    const text = String(obj.v == null ? '' : obj.v);
    return `<c r="${ref}"${style} t="inlineStr"><is><t xml:space="preserve">${xml(text)}</t></is></c>`;
  }
  function sheetXml(rows, options) {
    options = options || {};
    const maxCols = rows.reduce((m, row) => Math.max(m, row.length), 0);
    const rowXml = rows.map((cells, index) => {
      const r = index + 1;
      const height = options.rowHeights && options.rowHeights[r];
      const attrs = height ? ` ht="${height}" customHeight="1"` : '';
      return `<row r="${r}"${attrs}>${cells.map((cell, col) => cellXml(cell, r, col)).join('')}</row>`;
    }).join('');
    const widths = (options.widths || []).map((width, index) => `<col min="${index + 1}" max="${index + 1}" width="${width}" customWidth="1"/>`).join('');
    const panes = options.freezeRow ? `<pane ySplit="${options.freezeRow}" topLeftCell="A${options.freezeRow + 1}" activePane="bottomLeft" state="frozen"/>` : '';
    const merges = (options.merges || []).map(ref => `<mergeCell ref="${ref}"/>`).join('');
    const autoFilter = options.autoFilter ? `<autoFilter ref="${options.autoFilter}"/>` : '';
    const dimension = rows.length && maxCols ? `A1:${colName(maxCols - 1)}${rows.length}` : 'A1';
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><dimension ref="${dimension}"/><sheetViews><sheetView showGridLines="0" workbookViewId="0">${panes}</sheetView></sheetViews><sheetFormatPr defaultRowHeight="18"/>${widths ? `<cols>${widths}</cols>` : ''}<sheetData>${rowXml}</sheetData>${autoFilter}${merges ? `<mergeCells count="${(options.merges || []).length}">${merges}</mergeCells>` : ''}<pageMargins left="0.25" right="0.25" top="0.5" bottom="0.5" header="0.2" footer="0.2"/></worksheet>`;
  }

  const STYLES_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><numFmts count="4"><numFmt numFmtId="164" formatCode="#,##0.0000"/><numFmt numFmtId="165" formatCode="#,##0.00 [$€-es-ES]"/><numFmt numFmtId="166" formatCode="0.0%"/><numFmt numFmtId="167" formatCode="0.000"/></numFmts><fonts count="4"><font><sz val="10"/><name val="Arial"/><color rgb="FF0D2038"/></font><font><b/><sz val="18"/><name val="Arial"/><color rgb="FFFFFFFF"/></font><font><b/><sz val="10"/><name val="Arial"/><color rgb="FFFFFFFF"/></font><font><b/><sz val="10"/><name val="Arial"/><color rgb="FF0D2038"/></font></fonts><fills count="9"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF07182F"/><bgColor indexed="64"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FF0879E8"/><bgColor indexed="64"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFF5F8FC"/><bgColor indexed="64"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFFFF2CC"/><bgColor indexed="64"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFE2F0D9"/><bgColor indexed="64"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFFCE4D6"/><bgColor indexed="64"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFF4CCCC"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border><border><left style="thin"><color rgb="FFDCE6F0"/></left><right style="thin"><color rgb="FFDCE6F0"/></right><top style="thin"><color rgb="FFDCE6F0"/></top><bottom style="thin"><color rgb="FFDCE6F0"/></bottom><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="14"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment vertical="center"/></xf><xf numFmtId="0" fontId="3" fillId="4" borderId="0" xfId="0" applyFont="1" applyFill="1"/><xf numFmtId="0" fontId="2" fillId="3" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment wrapText="1" vertical="center"/></xf><xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment wrapText="1" vertical="top"/></xf><xf numFmtId="164" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1"/><xf numFmtId="165" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1"/><xf numFmtId="166" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1"/><xf numFmtId="0" fontId="0" fillId="5" borderId="1" xfId="0" applyFill="1" applyBorder="1"/><xf numFmtId="0" fontId="0" fillId="6" borderId="1" xfId="0" applyFill="1" applyBorder="1"/><xf numFmtId="0" fontId="0" fillId="7" borderId="1" xfId="0" applyFill="1" applyBorder="1"/><xf numFmtId="0" fontId="0" fillId="8" borderId="1" xfId="0" applyFill="1" applyBorder="1"/><xf numFmtId="167" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1"/><xf numFmtId="0" fontId="3" fillId="4" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`;

  function crc32(bytes) {
    let crc = 0xFFFFFFFF;
    for (let i = 0; i < bytes.length; i++) {
      crc ^= bytes[i];
      for (let j = 0; j < 8; j++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xEDB88320 : 0);
    }
    return (crc ^ 0xFFFFFFFF) >>> 0;
  }
  function u16(value) { return [value & 255, (value >>> 8) & 255]; }
  function u32(value) { return [value & 255, (value >>> 8) & 255, (value >>> 16) & 255, (value >>> 24) & 255]; }
  async function deflateRaw(data) {
    if (typeof CompressionStream === 'undefined' || data.length < 512) return null;
    try {
      const stream = new Blob([data]).stream().pipeThrough(new CompressionStream('deflate-raw'));
      const packed = new Uint8Array(await new Response(stream).arrayBuffer());
      return packed.length < data.length ? packed : null;
    } catch (_) { return null; }
  }

  /**
   * Empaqueta el libro. Las hojas se comprimen con deflate cuando el navegador
   * lo permite: un modelo grande pasaba de decenas de MB a unos pocos, y el
   * archivo sigue siendo un ZIP estándar si la compresión no está disponible.
   */
  async function zipPackage(files) {
    const encoder = new TextEncoder(), local = [], central = [];
    let offset = 0;
    for (const file of files) {
      const name = encoder.encode(file.name);
      const data = typeof file.data === 'string' ? encoder.encode(file.data) : file.data;
      const crc = crc32(data);
      const packed = await deflateRaw(data);
      const payload = packed || data;
      const method = packed ? 8 : 0;
      const header = new Uint8Array([80, 75, 3, 4, 20, 0, 0, 8, method, 0, 0, 0, 33, 0, ...u32(crc), ...u32(payload.length), ...u32(data.length), ...u16(name.length), 0, 0, ...name]);
      local.push(header, payload);
      const c = new Uint8Array([80, 75, 1, 2, 20, 0, 20, 0, 0, 8, method, 0, 0, 0, 33, 0, ...u32(crc), ...u32(payload.length), ...u32(data.length), ...u16(name.length), 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, ...u32(offset), ...name]);
      central.push(c);
      offset += header.length + payload.length;
    }
    const centralSize = central.reduce((sum, chunk) => sum + chunk.length, 0);
    const end = new Uint8Array([80, 75, 5, 6, 0, 0, 0, 0, ...u16(files.length), ...u16(files.length), ...u32(centralSize), ...u32(offset), 0, 0]);
    return new Blob([...local, ...central, end], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  }

  async function buildWorkbook(analysis, selection, profile) {
    const elements = selectedElements(analysis, selection), ids = new Set(elements.map(e => e.stepId));
    const quantities = analysis.quantities.filter(q => ids.has(q.elementId));
    const propertySelection = profileProperties(analysis, ids, profile);
    const properties = propertySelection.rows;
    const settings = { gg: 0.13, bi: 0.06, iva: 0.21 };
    const infoRows = [
      [{ v: 'HEFESTO IFC2IA READY', s: 1 }, null, null, null, null, null, null, null],
      [{ v: 'Archivo cuantificado para mediciones y presupuestos asistidos por IA', s: 2 }, null, null, null, null, null, null, null],
      [],
      [{ v: 'Origen', s: 13 }, analysis.source.name, { v: 'Esquema', s: 13 }, analysis.source.schema, { v: 'SHA-256', s: 13 }, analysis.source.sha256 || 'No disponible'],
      [{ v: 'Elementos fuente', s: 13 }, analysis.elements.length, { v: 'Seleccionados', s: 13 }, elements.length, { v: 'Cobertura cantidades', s: 13 }, { v: analysis.summary.coverage, s: 7 }],
      [{ v: 'Puntuación QA', s: 13 }, analysis.summary.score, { v: 'Bloqueantes', s: 13 }, analysis.summary.blocking, { v: 'Avisos', s: 13 }, analysis.summary.warnings],
      [{ v: 'Entidades recuperadas', s: 13 }, analysis.source.entitiesRecovered, { v: 'Entidades dañadas', s: 13 }, analysis.source.malformedEntities, { v: 'Datos enviados', s: 13 }, '0 · proceso local'],
      [{ v: 'Unidad de longitud IFC', s: 13 }, (analysis.source.units && analysis.source.units.length) || 'METRE', { v: 'Superficie', s: 13 }, (analysis.source.units && analysis.source.units.area) || 'SQUARE_METRE', { v: 'Volumen', s: 13 }, (analysis.source.units && analysis.source.units.volume) || 'CUBIC_METRE'],
      ['', 'Todas las cantidades y cotas de este libro están convertidas a m, m², m³, kg y h. La hoja Cantidades IFC conserva además el valor original del archivo.'],
      [],
      [{ v: 'Cómo usar este libro', s: 3 }, null, null, null, null, null, null, null],
      ['1', 'Revisa primero Control QA. Un bloqueante no debe ignorarse sin comprobar el IFC original.'],
      ['2', 'En Mediciones IA completa Código partida, Precio unitario y % merma (celdas amarillas).'],
      ['3', 'La cantidad presupuestaria procede de IfcElementQuantity; todas las cantidades originales están en Cantidades IFC.'],
      ['4', 'Para IA, adjunta este Excel o el JSON compacto; evita adjuntar el IFC completo si solo necesitas presupuesto.'],
      ['5', 'La geometría no se copia: se preservan identidad, clase, planta, tipo, materiales, cantidades, propiedades y trazabilidad.'],
      [],
      [{ v: 'Advertencia profesional', s: 3 }, null, null, null, null, null, null, null],
      ['', 'Las unidades y partidas sugeridas son una ayuda de preparación. Deben ser revisadas por el técnico responsable antes de emitir una medición o presupuesto contractual.']
    ];

    const measureHeaders = ['Incluir', 'Nº', 'Capítulo sugerido', 'Código partida', 'Nivel', 'Cota (m)', 'Clase IFC', 'Predefinido', 'Descripción IFC', 'GlobalId IFC', 'Tipo IFC', 'Materiales', 'Unidad', 'Área (m²)', 'Volumen (m³)', 'Longitud (m)', 'Unidades', 'Cantidad presup.', 'Precio unit. (€)', '% merma', 'Coste directo (€)', '% GG', '% BI', 'Total sin IVA (€)', 'Estado QA', 'Incidencias', 'Observaciones', 'Fuente de la cantidad'];
    const measureRows = [
      [{ v: 'MEDICIONES IA · EDITABLE Y TRAZABLE', s: 1 }, ...new Array(measureHeaders.length - 1).fill(null)],
      [{ v: 'Filtra por nivel, clase o estado. Amarillo = entrada del usuario; verde = cálculo automático.', s: 2 }, ...new Array(measureHeaders.length - 1).fill(null)],
      [], [], [],
      measureHeaders.map(v => ({ v, s: 3 }))
    ];
    elements.forEach((e, index) => {
      const row = index + 7, price = 0, waste = 0, qty = round(e.value, 6);
      const materialText = e.materials.map(m => m.thickness == null ? m.name : `${m.name} (${round(m.thickness, 4)} m)`).join(' | ');
      const statusStyle = e.status === 'Correcto' ? 9 : (e.status === 'Error' ? 11 : 10);
      measureRows.push([
        { v: 'Sí', s: 8 }, index + 1, e.chapter, { v: '', s: 8 }, e.level,
        { v: e.elevation == null ? '' : e.elevation, s: 12 }, e.ifcClass, e.predefinedType, e.description || e.name,
        e.globalId, e.typeName, materialText, e.unit, { v: round(e.area, 6), s: 5 }, { v: round(e.volume, 6), s: 5 },
        { v: round(e.length, 6), s: 5 }, { v: round(e.count, 3), s: 5 },
        { f: `IF(M${row}="m²",N${row},IF(M${row}="m³",O${row},IF(M${row}="m",P${row},Q${row})))`, v: qty, s: 9 },
        { v: price, s: 8 }, { v: waste, s: 8 }, { f: `R${row}*S${row}*(1+T${row})`, v: 0, s: 6 },
        { f: `'Configuracion'!$B$7`, v: settings.gg, s: 7 }, { f: `'Configuracion'!$B$8`, v: settings.bi, s: 7 },
        { f: `U${row}*(1+V${row}+W${row})`, v: 0, s: 6 }, { v: e.status, s: statusStyle }, e.issues.join(' | '), e.notes.join(' | '),
        `${e.quantityOrigin || 'IfcElementQuantity'} · ${e.sourceName || ''}`.trim()
      ]);
    });

    const qHeaders = ['Nº', 'Nivel', 'Clase IFC', 'Descripción IFC', 'GlobalId IFC', 'Conjunto', 'Cantidad IFC', 'Unidad', 'Valor convertido', 'Valor original IFC', 'Origen', 'STEP cantidad'];
    const qRows = [[{ v: 'TRAZABILIDAD DE CANTIDADES IFC', s: 1 }, ...new Array(qHeaders.length - 1).fill(null)], [{ v: 'Una fila por IfcPhysicalQuantity original; no se descartan alternativas Gross/Net. El valor convertido está en m, m², m³, kg y h.', s: 2 }, ...new Array(qHeaders.length - 1).fill(null)], [], [], qHeaders.map(v => ({ v, s: 3 }))];
    quantities.forEach((q, index) => qRows.push([index + 1, q.level, q.ifcClass, q.description, q.globalId, q.setName, q.name, q.unit, { v: round(q.value, 8), s: 5 }, { v: round(q.rawValue, 8), s: 5 }, q.source || 'IfcElementQuantity', '#' + q.sourceStepId]));

    const pHeaders = ['Nº', 'Nivel', 'Clase IFC', 'GlobalId IFC', 'Conjunto', 'Propiedad', 'Tipo de valor', 'Valor', 'Origen', 'STEP propiedad'];
    const propertyNote = profile === 'trazabilidad'
      ? 'Perfil de máxima trazabilidad: se incluyen todas las propiedades recuperadas; puede superar el tamaño del IFC.'
      : profile === 'minimo'
        ? 'Perfil mínimo IA: no se incluyen propiedades auxiliares; identidad, cantidades, tipo y materiales permanecen en Mediciones IA.'
        : `Perfil equilibrado: ${properties.length} propiedades prioritarias de ${propertySelection.sourceCount} recuperadas, limitadas para reducir contexto.`;
    const pRows = [[{ v: 'PROPIEDADES IFC SELECCIONADAS', s: 1 }, ...new Array(pHeaders.length - 1).fill(null)], [{ v: propertyNote, s: 2 }, ...new Array(pHeaders.length - 1).fill(null)], [], [], pHeaders.map(v => ({ v, s: 3 }))];
    properties.forEach((p, index) => pRows.push([index + 1, p.level, p.ifcClass, p.globalId, p.setName, p.name, p.valueType, p.value == null ? '' : p.value, p.origin, '#' + p.sourceStepId]));

    const qaHeaders = ['Severidad', 'Código', 'Título', 'Detalle', 'Elementos STEP', 'Acción recomendada'];
    const qaRows = [[{ v: 'CONTROL PREVIO DE CALIDAD', s: 1 }, null, null, null, null, null], [{ v: 'Resuelve primero los bloqueantes. Los avisos deben quedar documentados antes de presupuestar.', s: 2 }, null, null, null, null, null], [], [], qaHeaders.map(v => ({ v, s: 3 }))];
    analysis.findings.forEach(f => qaRows.push([{ v: f.severity, s: f.severity === 'Bloqueante' ? 11 : (f.severity === 'Aviso' ? 10 : 9) }, { v: f.code, s: 4 }, { v: f.title, s: 4 }, { v: f.detail, s: 4 }, { v: f.elementIds.slice(0, 60).map(id => '#' + id).join(' '), s: 4 }, { v: f.action, s: 4 }]));

    const summaryRows = [[{ v: 'RESUMEN DE SELECCIÓN', s: 1 }, null, null, null, null, null], [{ v: 'Control por categoría y nivel antes de enviar datos a una IA o vincular precios.', s: 2 }, null, null, null, null, null], [], [], [{ v: 'Categoría', s: 3 }, { v: 'Elementos', s: 3 }, { v: 'Seleccionados', s: 3 }, { v: 'Con cantidades', s: 3 }, { v: 'Incidencias', s: 3 }]];
    const selectedCategory = new Map();
    elements.forEach(e => selectedCategory.set(e.category, (selectedCategory.get(e.category) || 0) + 1));
    analysis.summary.categories.forEach(row => summaryRows.push([row.name, row.total, selectedCategory.get(row.name) || 0, row.withQuantities, row.issues]));
    summaryRows.push([], [{ v: 'Nivel', s: 3 }, { v: 'Cota (m)', s: 3 }, { v: 'Elementos', s: 3 }, { v: 'Seleccionados', s: 3 }, { v: 'Con cantidades', s: 3 }]);
    const selectedLevel = new Map();
    elements.forEach(e => selectedLevel.set(e.level, (selectedLevel.get(e.level) || 0) + 1));
    analysis.summary.levels.forEach(row => summaryRows.push([row.name, { v: row.elevation == null ? '' : row.elevation, s: 12 }, row.total, selectedLevel.get(row.name) || 0, row.withQuantities]));

    const configRows = [[{ v: 'CONFIGURACIÓN DEL PRESUPUESTO', s: 1 }, null, null, null, null, null], [{ v: 'Edita los porcentajes globales y completa precios/códigos en Mediciones IA.', s: 2 }, null, null, null, null, null], [], [], [{ v: 'Parámetro', s: 3 }, { v: 'Valor', s: 3 }], ['Moneda', { v: 'EUR', s: 8 }], ['Gastos generales', { v: settings.gg, s: 8 }], ['Beneficio industrial', { v: settings.bi, s: 8 }], ['IVA', { v: settings.iva, s: 8 }], [], [{ v: 'Criterios', s: 3 }, null, null, null, null, null], ['Cantidad presupuestaria', 'Se propone desde IfcElementQuantity y la clase IFC; revisa casos singulares.'], ['Coste directo', 'Cantidad × Precio unitario × (1 + merma).'], ['Total sin IVA', 'Coste directo × (1 + GG + BI).'], ['IVA', 'Configurado para cálculo posterior; el total de la tabla se presenta sin IVA.']];

    const sheets = [
      { name: 'LEEME', rows: infoRows, options: { widths: [22, 72, 18, 28, 18, 68, 16, 16], merges: ['A1:H1', 'A2:H2', 'A11:H11', 'A18:H18'] } },
      { name: 'Mediciones IA', rows: measureRows, options: { widths: [10, 7, 26, 18, 26, 11, 22, 16, 44, 24, 26, 34, 10, 13, 15, 14, 11, 15, 15, 11, 17, 10, 10, 18, 13, 40, 40, 34], merges: ['A1:AB1', 'A2:AB2'], freezeRow: 6, autoFilter: `A6:AB${Math.max(6, measureRows.length)}`, rowHeights: { 1: 30, 6: 34 } } },
      { name: 'Cantidades IFC', rows: qRows, options: { widths: [7, 26, 22, 44, 24, 24, 28, 10, 18, 18, 20, 14], merges: ['A1:L1', 'A2:L2'], freezeRow: 5, autoFilter: `A5:L${Math.max(5, qRows.length)}` } },
      { name: 'Propiedades clave', rows: pRows, options: { widths: [7, 26, 22, 24, 28, 28, 16, 50, 14, 14], merges: ['A1:J1', 'A2:J2'], freezeRow: 5, autoFilter: `A5:J${Math.max(5, pRows.length)}` } },
      { name: 'Control QA', rows: qaRows, options: { widths: [14, 24, 34, 62, 58, 64], merges: ['A1:F1', 'A2:F2'], freezeRow: 5, autoFilter: `A5:F${Math.max(5, qaRows.length)}`, rowHeights: Object.fromEntries(analysis.findings.map((_, index) => [index + 6, 44])) } },
      { name: 'Resumen', rows: summaryRows, options: { widths: [34, 16, 16, 18, 16, 16], merges: ['A1:F1', 'A2:F2'] } },
      { name: 'Configuracion', rows: configRows, options: { widths: [28, 72, 16, 16, 16, 16], merges: ['A1:F1', 'A2:F2', 'A11:F11'] } }
    ];
    const files = [];
    const overrides = sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('');
    files.push({ name: '[Content_Types].xml', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/><Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>${overrides}</Types>` });
    files.push({ name: '_rels/.rels', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/></Relationships>` });
    files.push({ name: 'docProps/core.xml', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>HEFESTO IFC2IA Ready · ${xml(analysis.source.name)}</dc:title><dc:creator>HEFESTOLAB</dc:creator><dc:description>IFC cuantificado y trazable para mediciones y presupuestos asistidos por IA</dc:description><dcterms:created xsi:type="dcterms:W3CDTF">${new Date().toISOString()}</dcterms:created></cp:coreProperties>` });
    files.push({ name: 'docProps/app.xml', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes"><Application>HEFESTO IFC2IA Ready</Application><AppVersion>${VERSION}</AppVersion></Properties>` });
    files.push({ name: 'xl/styles.xml', data: STYLES_XML });
    const workbookSheets = sheets.map((sheet, i) => `<sheet name="${xml(sheet.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('');
    files.push({ name: 'xl/workbook.xml', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><bookViews><workbookView activeTab="0"/></bookViews><sheets>${workbookSheets}</sheets><calcPr calcId="191029" calcMode="auto" fullCalcOnLoad="1" forceFullCalc="1"/></workbook>` });
    const rels = sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('');
    files.push({ name: 'xl/_rels/workbook.xml.rels', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${rels}<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>` });
    sheets.forEach((sheet, i) => files.push({ name: `xl/worksheets/sheet${i + 1}.xml`, data: sheetXml(sheet.rows, sheet.options) }));
    return zipPackage(files);
  }

  global.HEFESTO_IFC2IA = {
    VERSION, auditBytes, decodeIfcBytes, scanEntities, buildViewerIfc, analyze, compactData, buildJson, buildWorkbook,
    safeFileBase, selectedElements
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
