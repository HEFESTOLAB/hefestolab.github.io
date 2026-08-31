/*
 * HEFESTOLAB · IFC Energy Model
 * step.js — Núcleo STEP/IFC (ISO 10303-21)
 * ---------------------------------------------------------------------------
 * Lector, editor y escritor de archivos IFC en texto plano, sin dependencias
 * externas ni WebAssembly. Trabaja con desplazamientos sobre la cadena
 * original, de modo que un IFC de 60 MB no se duplica en memoria como
 * millones de subcadenas.
 *
 * Diseñado para IFC2X3 e IFC4. Se ejecuta igual en navegador y en Node.
 */
(function (global) {
  'use strict';
  const HEM = (global.HEM = global.HEM || {});

  /* ======================================================================
   * 1. Cadenas IFC  (ISO 10303-21 + extensiones \X\ \X2\ \S\ de IFC)
   * ==================================================================== */

  function decodeIfcString(raw) {
    if (raw == null) return '';
    if (raw.indexOf('\\') < 0) return raw;
    let out = '';
    for (let i = 0; i < raw.length; i++) {
      const c = raw[i];
      if (c !== '\\') { out += c; continue; }
      const n = raw[i + 1];
      if (n === '\\') { out += '\\'; i++; continue; }
      // \S\c  → carácter + 128 (ISO 8859-1)
      if (n === 'S' && raw[i + 2] === '\\') {
        out += String.fromCharCode(raw.charCodeAt(i + 3) + 128);
        i += 3; continue;
      }
      // \X\HH → un byte
      if (n === 'X' && raw[i + 2] === '\\') {
        out += String.fromCharCode(parseInt(raw.substr(i + 3, 2), 16));
        i += 4; continue;
      }
      // \X2\HHHH...\X0\  → UTF-16BE  |  \X4\HHHHHHHH...\X0\ → UTF-32
      if (n === 'X' && (raw[i + 2] === '2' || raw[i + 2] === '4') && raw[i + 3] === '\\') {
        const width = raw[i + 2] === '2' ? 4 : 8;
        let j = i + 4;
        const end = raw.indexOf('\\X0\\', j);
        const stop = end < 0 ? raw.length : end;
        while (j + width <= stop) {
          const cp = parseInt(raw.substr(j, width), 16);
          out += Number.isFinite(cp) ? String.fromCodePoint(cp) : '';
          j += width;
        }
        i = (end < 0 ? raw.length : end + 3);
        continue;
      }
      out += c;
    }
    return out;
  }

  function encodeIfcString(str) {
    let out = '';
    for (const ch of String(str == null ? '' : str)) {
      const cp = ch.codePointAt(0);
      if (ch === '\\') { out += '\\\\'; continue; }
      if (ch === "'") { out += "''"; continue; }
      if (cp < 128) { out += ch; continue; }
      if (cp < 256) { out += '\\X\\' + cp.toString(16).toUpperCase().padStart(2, '0'); continue; }
      let hex = '';
      for (let k = 0; k < ch.length; k++) hex += ch.charCodeAt(k).toString(16).toUpperCase().padStart(4, '0');
      out += '\\X2\\' + hex + '\\X0\\';
    }
    return out;
  }

  /* ======================================================================
   * 2. Tokens de argumento
   * ==================================================================== */

  const REF = 'ref', STR = 'str', ENUM = 'enum', NUM = 'num', NUL = '$', STAR = '*', LIST = 'list';

  const T = {
    ref: (v) => ({ t: REF, v }),
    str: (v) => ({ t: STR, v: encodeIfcString(v) }),
    rawStr: (v) => ({ t: STR, v }),
    enum: (v) => ({ t: ENUM, v }),
    num: (v) => ({ t: NUM, v }),
    nul: () => ({ t: NUL }),
    star: () => ({ t: STAR }),
    list: (v, typed) => (typed ? { t: LIST, v: v || [], typed } : { t: LIST, v: v || [] }),
    bool: (v) => ({ t: ENUM, v: v ? 'T' : 'F' })
  };

  function isRef(tok) { return !!tok && tok.t === REF; }
  function isList(tok) { return !!tok && tok.t === LIST; }
  function isNull(tok) { return !tok || tok.t === NUL || tok.t === STAR; }
  function tokNum(tok) { return tok && tok.t === NUM ? tok.v : null; }
  function tokStr(tok) { return tok && tok.t === STR ? decodeIfcString(tok.v) : null; }
  function tokEnum(tok) { return tok && tok.t === ENUM ? tok.v : null; }
  function tokRef(tok) { return tok && tok.t === REF ? tok.v : 0; }
  function tokBool(tok) {
    if (!tok || tok.t !== ENUM) return null;
    if (tok.v === 'T') return true;
    if (tok.v === 'F') return false;
    return null;
  }

  /** Serializa un token al formato STEP. */
  function writeToken(tok) {
    if (tok == null) return '$';
    switch (tok.t) {
      case NUL: return '$';
      case STAR: return '*';
      case REF: return '#' + tok.v;
      case STR: return "'" + tok.v + "'";
      case ENUM: return '.' + tok.v + '.';
      case NUM: return formatNumber(tok.v);
      case LIST: return '(' + tok.v.map(writeToken).join(',') + ')';
      default: return '$';
    }
  }

  function formatNumber(v) {
    if (!Number.isFinite(v)) return '0.';
    if (Number.isInteger(v) && Math.abs(v) < 1e15) {
      // Los enteros IFC se escriben sin punto; los reales lo llevan siempre.
      return String(v) + (Object.is(v, -0) ? '.' : '.');
    }
    let s = String(v);
    if (s.indexOf('e') >= 0 || s.indexOf('E') >= 0) {
      s = v.toExponential(12).replace('e', 'E');
      if (s.indexOf('.') < 0) s = s.replace('E', '.E');
      return s;
    }
    if (s.indexOf('.') < 0) s += '.';
    return s;
  }

  /** Serializa un entero puro (sin punto decimal). */
  function writeInt(v) { return { t: NUM, v, int: true }; }

  /* ======================================================================
   * 3. Analizador de la lista de argumentos
   * ==================================================================== */

  function parseArgs(text, start, end) {
    const out = [];
    const stack = [out];
    let i = start;
    let cur = out;
    while (i < end) {
      const c = text.charCodeAt(i);
      // espacios y separadores
      if (c === 32 || c === 9 || c === 13 || c === 10) { i++; continue; }
      if (c === 44 /* , */) { i++; continue; }
      if (c === 40 /* ( */) {
        const lst = { t: LIST, v: [] };
        cur.push(lst); stack.push(lst.v); cur = lst.v; i++; continue;
      }
      if (c === 41 /* ) */) {
        stack.pop(); cur = stack[stack.length - 1] || out; i++; continue;
      }
      if (c === 39 /* ' */) {
        let j = i + 1;
        for (;;) {
          const k = text.indexOf("'", j);
          if (k < 0 || k >= end) { j = end; break; }
          if (text.charCodeAt(k + 1) === 39) { j = k + 2; continue; }
          j = k; break;
        }
        cur.push({ t: STR, v: text.slice(i + 1, j) });
        i = j + 1; continue;
      }
      if (c === 35 /* # */) {
        let j = i + 1;
        while (j < end) { const d = text.charCodeAt(j); if (d < 48 || d > 57) break; j++; }
        cur.push({ t: REF, v: +text.slice(i + 1, j) });
        i = j; continue;
      }
      if (c === 46 /* . */) {
        const j = text.indexOf('.', i + 1);
        const stop = (j < 0 || j >= end) ? end : j;
        cur.push({ t: ENUM, v: text.slice(i + 1, stop) });
        i = stop + 1; continue;
      }
      if (c === 36 /* $ */) { cur.push({ t: NUL }); i++; continue; }
      if (c === 42 /* * */) { cur.push({ t: STAR }); i++; continue; }
      // número o palabra suelta (IFCINTEGER(...) tipado se trata como lista)
      let j = i;
      while (j < end) {
        const d = text.charCodeAt(j);
        if (d === 44 || d === 41 || d === 40 || d === 32 || d === 9 || d === 13 || d === 10) break;
        j++;
      }
      const raw = text.slice(i, j);
      if (text.charCodeAt(j) === 40 /* tipo con paréntesis: IFCBOOLEAN(.T.) */) {
        const lst = { t: LIST, v: [], typed: raw.toUpperCase() };
        cur.push(lst); stack.push(lst.v); cur = lst.v; i = j + 1; continue;
      }
      const num = parseFloat(raw);
      cur.push(Number.isFinite(num) ? { t: NUM, v: num, raw } : { t: ENUM, v: raw });
      i = j;
    }
    return out;
  }

  function writeArgs(args) {
    const parts = new Array(args.length);
    for (let i = 0; i < args.length; i++) parts[i] = writeAny(args[i]);
    return parts.join(',');
  }

  function writeAny(tok) {
    if (tok == null) return '$';
    if (tok.t === LIST) {
      const inner = '(' + tok.v.map(writeAny).join(',') + ')';
      return tok.typed ? tok.typed + inner : inner;
    }
    if (tok.t === NUM) {
      if (tok.raw != null) return tok.raw;
      if (tok.int) return String(Math.round(tok.v));
      return formatNumber(tok.v);
    }
    return writeToken(tok);
  }

  /* ======================================================================
   * 4. Modelo
   * ==================================================================== */

  class StepModel {
    constructor(text) {
      this.text = text;
      this.header = '';
      this.schema = 'DESCONOCIDO';
      this.fileName = '';
      this.originatingSystem = '';
      this.count = 0;
      this.ids = null;          // Int32Array  slot -> id
      this.typeIds = null;      // Int32Array  slot -> índice en typeNames
      this.argStart = null;     // Int32Array
      this.argEnd = null;       // Int32Array
      this.typeNames = [];      // string[]
      this.typeSlots = new Map();   // 'IFCWALL' -> Int32Array de slots
      this.slotById = null;     // Int32Array id -> slot (-1 si no existe)
      this.maxId = 0;
      this._argCache = new Map();   // slot -> tokens (perezoso)
      this._dirty = new Set();      // slots con argumentos modificados
      this._added = [];             // {id,type,args}
      this._removed = new Set();    // slots eliminados
      this._refs = null;            // {start:Int32Array, data:Int32Array}
      this._inverse = null;         // Map id -> number[] (slots que lo referencian)
      this.parse();
    }

    /* ---------------- análisis ---------------- */

    parse() {
      const text = this.text;
      const dataAt = text.indexOf('DATA;');
      if (dataAt < 0) throw new Error('El archivo no contiene una sección DATA; ¿es realmente un IFC en formato STEP?');
      this.header = text.slice(0, dataAt + 5);

      const schemaMatch = /FILE_SCHEMA\s*\(\s*\(\s*'([^']+)'/i.exec(this.header);
      if (schemaMatch) this.schema = schemaMatch[1].toUpperCase().split(/[^A-Z0-9]/)[0] || schemaMatch[1].toUpperCase();
      const nameMatch = /FILE_NAME\s*\(\s*'((?:[^']|'')*)'/i.exec(this.header);
      if (nameMatch) this.fileName = decodeIfcString(nameMatch[1]);
      const origMatch = /FILE_NAME[\s\S]*?'((?:[^']|'')*)'\s*,\s*'((?:[^']|'')*)'\s*\)\s*;/i.exec(this.header);
      if (origMatch) this.originatingSystem = decodeIfcString(origMatch[1]);

      const n = text.length;
      const ids = [], typeIds = [], aStart = [], aEnd = [];
      const typeIndex = new Map();
      const typeNames = this.typeNames;
      let maxId = 0;
      let i = dataAt + 5;

      while (i < n) {
        const c = text.charCodeAt(i);
        if (c === 32 || c === 9 || c === 13 || c === 10 || c === 59) { i++; continue; }
        if (c === 47 && text.charCodeAt(i + 1) === 42) { // comentario /* */
          const e = text.indexOf('*/', i + 2);
          i = e < 0 ? n : e + 2; continue;
        }
        if (c !== 35 /* # */) {
          // ENDSEC; / END-ISO-10303-21;
          if (text.startsWith('ENDSEC', i) || text.startsWith('END-ISO', i)) break;
          i++; continue;
        }
        // #id = TIPO ( args ) ;
        let j = i + 1;
        while (j < n) { const d = text.charCodeAt(j); if (d < 48 || d > 57) break; j++; }
        const id = +text.slice(i + 1, j);
        while (j < n && text.charCodeAt(j) !== 61) j++;  // '='
        j++;
        while (j < n) { const d = text.charCodeAt(j); if (d !== 32 && d !== 9 && d !== 13 && d !== 10) break; j++; }
        const tStart = j;
        while (j < n && text.charCodeAt(j) !== 40) j++;  // '('
        const typeName = text.slice(tStart, j).trim().toUpperCase();
        const open = j;
        // paréntesis balanceados respetando cadenas
        let depth = 0, k = open, inStr = false;
        while (k < n) {
          const d = text.charCodeAt(k);
          if (inStr) {
            if (d === 39) { if (text.charCodeAt(k + 1) === 39) k++; else inStr = false; }
          } else if (d === 39) inStr = true;
          else if (d === 40) depth++;
          else if (d === 41) { depth--; if (depth === 0) break; }
          k++;
        }
        let tid = typeIndex.get(typeName);
        if (tid === undefined) { tid = typeNames.length; typeNames.push(typeName); typeIndex.set(typeName, tid); }
        ids.push(id); typeIds.push(tid); aStart.push(open + 1); aEnd.push(k);
        if (id > maxId) maxId = id;
        i = k + 1;
        while (i < n && text.charCodeAt(i) !== 59) i++;  // ';'
        i++;
      }

      this.count = ids.length;
      this.ids = Int32Array.from(ids);
      this.typeIds = Int32Array.from(typeIds);
      this.argStart = Int32Array.from(aStart);
      this.argEnd = Int32Array.from(aEnd);
      this.maxId = maxId;

      const byId = new Int32Array(maxId + 2).fill(-1);
      for (let s = 0; s < this.count; s++) byId[this.ids[s]] = s;
      this.slotById = byId;

      // slots por tipo
      const counts = new Int32Array(typeNames.length);
      for (let s = 0; s < this.count; s++) counts[this.typeIds[s]]++;
      const buckets = typeNames.map((_, t) => new Int32Array(counts[t]));
      const fill = new Int32Array(typeNames.length);
      for (let s = 0; s < this.count; s++) { const t = this.typeIds[s]; buckets[t][fill[t]++] = s; }
      for (let t = 0; t < typeNames.length; t++) this.typeSlots.set(typeNames[t], buckets[t]);
    }

    /* ---------------- acceso ---------------- */

    slotOf(id) { return (id > 0 && id < this.slotById.length) ? this.slotById[id] : -1; }
    typeOfSlot(slot) { return slot < 0 ? null : (slot < this.count ? this.typeNames[this.typeIds[slot]] : this._added[slot - this.count].type); }
    typeOf(id) { return this.typeOfSlot(this.slotOf(id)); }
    exists(id) { const s = this.slotOf(id); return s >= 0 && !this._removed.has(s); }

    slotsOfType(...types) {
      const out = [];
      for (const ty of types) {
        const arr = this.typeSlots.get(ty.toUpperCase());
        if (arr) for (let i = 0; i < arr.length; i++) if (!this._removed.has(arr[i])) out.push(arr[i]);
      }
      for (let i = 0; i < this._added.length; i++) {
        const a = this._added[i];
        if (types.some(t => t.toUpperCase() === a.type)) out.push(this.count + i);
      }
      return out;
    }

    idsOfType(...types) { return this.slotsOfType(...types).map(s => this.idOfSlot(s)); }
    idOfSlot(slot) { return slot < this.count ? this.ids[slot] : this._added[slot - this.count].id; }

    /** Tokens de argumento de una entidad (cacheado). */
    argsOfSlot(slot) {
      if (slot < 0) return null;
      let a = this._argCache.get(slot);
      if (a) return a;
      if (slot >= this.count) { a = this._added[slot - this.count].args; this._argCache.set(slot, a); return a; }
      a = parseArgs(this.text, this.argStart[slot], this.argEnd[slot]);
      this._argCache.set(slot, a);
      return a;
    }
    args(id) { return this.argsOfSlot(this.slotOf(id)); }
    arg(id, i) { const a = this.args(id); return a ? a[i] : null; }

    /** Marca una entidad como modificada para que el escritor la regenere. */
    touch(id) { const s = this.slotOf(id); if (s >= 0) this._dirty.add(s); return s; }

    setArg(id, index, token) {
      const a = this.args(id);
      if (!a) return false;
      while (a.length <= index) a.push({ t: NUL });
      a[index] = token;
      this.touch(id);
      return true;
    }

    remove(id) { const s = this.slotOf(id); if (s >= 0) this._removed.add(s); }
    removeSlot(slot) { if (slot >= 0) this._removed.add(slot); }

    /** Crea una entidad nueva y devuelve su identificador. */
    add(type, args) {
      const id = ++this.maxId;
      this._added.push({ id, type: type.toUpperCase(), args });
      const slot = this.count + this._added.length - 1;
      if (id >= this.slotById.length) {
        const bigger = new Int32Array(id + 1024).fill(-1);
        bigger.set(this.slotById);
        this.slotById = bigger;
      }
      this.slotById[id] = slot;
      this._argCache.set(slot, args);
      return id;
    }

    /* ---------------- referencias ---------------- */

    /** Construye la tabla de referencias directas slot -> ids referenciados. */
    buildRefs() {
      if (this._refs) return this._refs;
      const text = this.text, count = this.count;
      const start = new Int32Array(count + 1);
      // primera pasada: contar
      let total = 0;
      for (let s = 0; s < count; s++) {
        start[s] = total;
        total += countRefs(text, this.argStart[s], this.argEnd[s]);
      }
      start[count] = total;
      const data = new Int32Array(total);
      let p = 0;
      for (let s = 0; s < count; s++) p = collectRefs(text, this.argStart[s], this.argEnd[s], data, p);
      this._refs = { start, data };
      return this._refs;
    }

    /** Referencias directas de un slot (incluye entidades añadidas o modificadas). */
    refsOfSlot(slot) {
      if (slot >= this.count || this._dirty.has(slot)) {
        const out = [];
        collectTokenRefs(this.argsOfSlot(slot), out);
        return out;
      }
      const r = this.buildRefs();
      const out = new Array(r.start[slot + 1] - r.start[slot]);
      for (let i = r.start[slot], k = 0; i < r.start[slot + 1]; i++, k++) out[k] = r.data[i];
      return out;
    }

    /** Índice inverso id -> slots que lo referencian. */
    buildInverse() {
      if (this._inverse) return this._inverse;
      const r = this.buildRefs();
      const map = new Map();
      for (let s = 0; s < this.count; s++) {
        for (let i = r.start[s]; i < r.start[s + 1]; i++) {
          const id = r.data[i];
          let arr = map.get(id);
          if (!arr) { arr = []; map.set(id, arr); }
          arr.push(s);
        }
      }
      this._inverse = map;
      return map;
    }

    referencedBy(id) {
      const inv = this.buildInverse();
      return (inv.get(id) || []).filter(s => !this._removed.has(s));
    }

    /* ---------------- escritura ---------------- */

    /**
     * Serializa el modelo.
     * @param {Object} opt
     * @param {Set<number>|null} opt.keep  Conjunto de slots a conservar (null = todos)
     * @param {Object} opt.headerInfo      {description[], name, originating}
     */
    write(opt) {
      opt = opt || {};
      const keep = opt.keep || null;
      const chunks = [];
      chunks.push(this.buildHeader(opt.headerInfo));
      const text = this.text;

      const emit = (slot) => {
        if (this._removed.has(slot)) return;
        if (keep && !keep.has(slot)) return;
        if (slot < this.count && !this._dirty.has(slot)) {
          // línea original íntegra: máxima fidelidad y velocidad
          const s0 = this.argStart[slot] - 1;
          let head = slot; // nada
          chunks.push('#' + this.ids[slot] + '=' + this.typeNames[this.typeIds[slot]] +
            text.slice(this.argStart[slot] - 1, this.argEnd[slot] + 1) + ';\r\n');
          void head;
          return;
        }
        const id = this.idOfSlot(slot);
        const type = this.typeOfSlot(slot);
        chunks.push('#' + id + '=' + type + '(' + writeArgs(this.argsOfSlot(slot)) + ');\r\n');
      };

      for (let s = 0; s < this.count; s++) emit(s);
      for (let i = 0; i < this._added.length; i++) emit(this.count + i);

      chunks.push('ENDSEC;\r\n');
      chunks.push('END-ISO-10303-21;\r\n');
      return chunks.join('');
    }

    buildHeader(info) {
      info = info || {};
      const esc = encodeIfcString;
      const desc = (info.description && info.description.length ? info.description : ['ViewDefinition [CoordinationView_V2.0]'])
        .map(d => "'" + esc(d) + "'").join(',');
      const name = esc(info.name || this.fileName || 'modelo.ifc');
      const stamp = (info.timestamp || new Date().toISOString()).replace(/\.\d+Z$/, 'Z').slice(0, 19);
      const author = esc(info.author || '');
      const org = esc(info.organization || '');
      const preproc = esc(info.preprocessor || 'HEFESTOLAB IFC Energy Model');
      const orig = esc(info.originating || this.originatingSystem || '');
      const auth = esc(info.authorization || '');
      return 'ISO-10303-21;\r\nHEADER;\r\n' +
        'FILE_DESCRIPTION((' + desc + "),'2;1');\r\n" +
        "FILE_NAME('" + name + "','" + stamp + "',('" + author + "'),('" + org + "')," +
        "'" + preproc + "','" + orig + "','" + auth + "');\r\n" +
        "FILE_SCHEMA(('" + this.schema + "'));\r\nENDSEC;\r\n\r\nDATA;\r\n";
    }
  }

  /* --------- utilidades de recuento de referencias (sin asignar memoria) --------- */

  function countRefs(text, start, end) {
    let c = 0, i = start, inStr = false;
    while (i < end) {
      const d = text.charCodeAt(i);
      if (inStr) { if (d === 39) { if (text.charCodeAt(i + 1) === 39) i++; else inStr = false; } i++; continue; }
      if (d === 39) { inStr = true; i++; continue; }
      if (d === 35) { c++; i++; while (i < end) { const e = text.charCodeAt(i); if (e < 48 || e > 57) break; i++; } continue; }
      i++;
    }
    return c;
  }

  function collectRefs(text, start, end, out, p) {
    let i = start, inStr = false;
    while (i < end) {
      const d = text.charCodeAt(i);
      if (inStr) { if (d === 39) { if (text.charCodeAt(i + 1) === 39) i++; else inStr = false; } i++; continue; }
      if (d === 39) { inStr = true; i++; continue; }
      if (d === 35) {
        let j = i + 1, v = 0;
        while (j < end) { const e = text.charCodeAt(j); if (e < 48 || e > 57) break; v = v * 10 + (e - 48); j++; }
        out[p++] = v; i = j; continue;
      }
      i++;
    }
    return p;
  }

  function collectTokenRefs(tokens, out) {
    if (!tokens) return out;
    for (const tk of tokens) {
      if (!tk) continue;
      if (tk.t === REF) out.push(tk.v);
      else if (tk.t === LIST) collectTokenRefs(tk.v, out);
    }
    return out;
  }

  HEM.step = {
    StepModel, parseArgs, writeArgs, writeAny, writeToken, writeInt,
    decodeIfcString, encodeIfcString, formatNumber,
    T, isRef, isList, isNull, tokNum, tokStr, tokEnum, tokRef, tokBool,
    collectTokenRefs
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
