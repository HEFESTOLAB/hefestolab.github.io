/*
 * Dédalo — jerarquía de grupos y definiciones de componentes (sin DOM).
 *
 * Cada definición conserva su propio Model. Las instancias sólo contienen una
 * referencia y una matriz local: editar un componente cambia todas sus copias;
 * copiar un grupo, en cambio, crea una definición independiente.
 * project() crea una vista geométrica desechable sin soldar entre contextos.
 */
(function (root) {
  'use strict';
  const D = root.DEDALO;
  const MAX_DEPTH = 64;
  const MAX_PROJECTED = 2000000;
  const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  const uuidKey = (value) => typeof value === 'string' ? value.toLowerCase() : value;
  const clone = (x) => JSON.parse(JSON.stringify(x));
  const isPoint = (p) => Array.isArray(p) && p.length === 3 && p.every(Number.isFinite);
  const length = (p) => Math.hypot(p[0], p[1], p[2]);
  const unit = (p) => { const l = length(p); return l ? p.map((v) => v / l) : [0, 0, 0]; };
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const add = (a, b) => a.map((v, i) => v + b[i]);
  const negative = (p) => p.map((v) => -v);
  function checkMetadata(value) {
    let count = 0;
    const visit = (v, depth) => {
      if (depth > 24 || ++count > 100000) throw new Error('Metadatos demasiado complejos.');
      if (v === null || typeof v === 'string' || typeof v === 'boolean') return;
      if (typeof v === 'number' && Number.isFinite(v)) return;
      if (!v || typeof v !== 'object') throw new Error('Metadatos no válidos: se requiere JSON finito.');
      if (!Array.isArray(v) && Object.getPrototypeOf(v) !== Object.prototype && Object.getPrototypeOf(v) !== null) throw new Error('Metadatos no válidos.');
      for (const [key, child] of Object.entries(v)) {
        if (['__proto__', 'prototype', 'constructor'].includes(key)) throw new Error('Clave de metadatos no admitida.');
        visit(child, depth + 1);
      }
    };
    visit(value, 0);
    if (JSON.stringify(value).length > 1024 * 1024) throw new Error('Metadatos demasiado grandes.');
    return value;
  }
  const metadata = (object, key) => object[key] === undefined ? {} : { [key]: clone(checkMetadata(object[key])) };
  const finiteDimension = (a) => {
    if (!isPoint(a.a) || !isPoint(a.b) || (a.off != null && !isPoint(a.off)) || (a.offB != null && !isPoint(a.offB))) return false;
    const A = add(a.a, a.off || [0, 0, 0]), B = add(a.b, a.offB || a.off || [0, 0, 0]);
    return isPoint(A) && isPoint(B) && Number.isFinite(length(A.map((v, i) => v - B[i]))) && Number.isFinite(length(a.a.map((v, i) => v - a.b[i])));
  };

  function uuid() {
    const c = root.crypto;
    if (c && c.randomUUID) return c.randomUUID();
    const bytes = new Uint8Array(16);
    if (c && c.getRandomValues) c.getRandomValues(bytes);
    else for (let i = 0; i < 16; i++) bytes[i] = Math.floor(Math.random() * 256);
    bytes[6] = (bytes[6] & 15) | 64;
    bytes[8] = (bytes[8] & 63) | 128;
    const h = [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
    return h.slice(0, 8) + '-' + h.slice(8, 12) + '-' + h.slice(12, 16) + '-' + h.slice(16, 20) + '-' + h.slice(20);
  }

  function identity() { return [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]; }
  function multiply(a, b) {
    const out = new Array(16).fill(0);
    for (let col = 0; col < 4; col++) for (let row = 0; row < 4; row++) {
      for (let k = 0; k < 4; k++) out[col * 4 + row] += a[k * 4 + row] * b[col * 4 + k];
    }
    return out;
  }
  function translation(v) {
    if (!isPoint(v)) throw new Error('El desplazamiento debe tener tres números finitos.');
    const m = identity(); m[12] = v[0]; m[13] = v[1]; m[14] = v[2]; return m;
  }
  function vector(m, p) {
    const result = [m[0] * p[0] + m[4] * p[1] + m[8] * p[2], m[1] * p[0] + m[5] * p[1] + m[9] * p[2], m[2] * p[0] + m[6] * p[1] + m[10] * p[2]];
    if (!result.every(Number.isFinite)) throw new Error('El vector transformado queda fuera del intervalo numérico.');
    return result;
  }
  function point(m, p) {
    const result = add(vector(m, p), [m[12], m[13], m[14]]);
    if (!result.every(Number.isFinite)) throw new Error('El punto transformado queda fuera del intervalo numérico.');
    return result;
  }
  function rotation(center, axis, angle) {
    if (!isPoint(center) || !isPoint(axis) || !length(axis) || !Number.isFinite(angle)) throw new Error('Centro, eje o ángulo de giro inválidos.');
    const [x, y, z] = unit(axis), c = Math.cos(angle), s = Math.sin(angle), t = 1 - c;
    const r = [t * x * x + c, t * x * y + s * z, t * x * z - s * y, 0,
      t * x * y - s * z, t * y * y + c, t * y * z + s * x, 0,
      t * x * z + s * y, t * y * z - s * x, t * z * z + c, 0, 0, 0, 0, 1];
    return multiply(translation(center), multiply(r, translation(negative(center))));
  }
  function scaling(origin, factors) {
    if (!isPoint(origin)) throw new Error('El origen de escala debe tener tres números finitos.');
    if (Number.isFinite(factors)) factors = [factors, factors, factors];
    if (!isPoint(factors) || factors.some((v) => v === 0)) throw new Error('Los factores de escala deben ser finitos y distintos de cero.');
    const m = identity(); m[0] = factors[0]; m[5] = factors[1]; m[10] = factors[2];
    return multiply(translation(origin), multiply(m, translation(negative(origin))));
  }
  function affine(m) {
    return Array.isArray(m) && m.length === 16 && m.every(Number.isFinite) && m[3] === 0 && m[7] === 0 && m[11] === 0 && m[15] === 1;
  }
  function inverse(m) {
    if (!affine(m)) throw new Error('La transformación debe ser una matriz afín finita de 4 × 4.');
    // Normalizar evita que un cambio uniforme de unidad desborde el determinante.
    const scale = Math.max(...[0, 1, 2, 4, 5, 6, 8, 9, 10].map((i) => Math.abs(m[i])));
    if (!scale) throw new Error('La transformación no es invertible.');
    const a = [m[0], m[1], m[2]].map((v) => v / scale);
    const b = [m[4], m[5], m[6]].map((v) => v / scale);
    const c = [m[8], m[9], m[10]].map((v) => v / scale);
    const ca = cross(b, c), cb = cross(c, a), cc = cross(a, b);
    const det = dot(a, ca);
    if (!Number.isFinite(det) || det === 0) throw new Error('La transformación no es invertible.');
    const invScale = 1 / scale;
    const ra = ca.map((v) => v / det * invScale), rb = cb.map((v) => v / det * invScale), rc = cc.map((v) => v / det * invScale);
    const out = [ra[0], rb[0], rc[0], 0, ra[1], rb[1], rc[1], 0, ra[2], rb[2], rc[2], 0, 0, 0, 0, 1];
    const t = negative(vector(out, [m[12], m[13], m[14]]));
    out[12] = t[0]; out[13] = t[1]; out[14] = t[2];
    if (!out.every(Number.isFinite)) throw new Error('La inversa de la transformación queda fuera del intervalo numérico.');
    return out;
  }
  function validMatrix(m) { try { inverse(m); return true; } catch (_) { return false; } }
  function determinantSign(m) {
    const scale = Math.max(...[0, 1, 2, 4, 5, 6, 8, 9, 10].map((i) => Math.abs(m[i])));
    return Math.sign(dot([m[0] / scale, m[1] / scale, m[2] / scale], cross([m[4] / scale, m[5] / scale, m[6] / scale], [m[8] / scale, m[9] / scale, m[10] / scale])));
  }
  function normal(m, n) {
    const inv = inverse(m);
    return unit([inv[0] * n[0] + inv[1] * n[1] + inv[2] * n[2], inv[4] * n[0] + inv[5] * n[1] + inv[6] * n[2], inv[8] * n[0] + inv[9] * n[1] + inv[10] * n[2]]);
  }

  function failure(errors) { const e = new Error(errors.join('\n')); e.errors = errors; return e; }
  const entityId = (v) => Number.isSafeInteger(v) && v > 0;

  function checkProjectionNumbers(j) {
    const bad = () => { throw new Error('La geometría proyectada contiene coordenadas no finitas o fuera del intervalo numérico.'); };
    for (const v of j.verts) if (!isPoint(v.slice(1))) bad();
    for (const c of j.curves || []) {
      for (const k of ['center', 'normal', 'axisU', 'axisV']) if (c[k] !== undefined && !isPoint(c[k])) bad();
      if (c.normal && !length(c.normal)) bad();
      if (c.radius !== undefined && !Number.isFinite(c.radius)) bad();
      if (c.radii !== undefined && (!Array.isArray(c.radii) || !c.radii.every(Number.isFinite))) bad();
    }
    for (const a of j.annots || []) {
      for (const k of ['p', 'a', 'b', 'from', 'off', 'offB', 'dir']) if (a[k] != null && !isPoint(a[k])) bad();
      if (['guidePoint', 'guideLine', 'text'].includes(a.kind) && !isPoint(a.p)) bad();
      if (a.kind === 'dim' && !finiteDimension(a)) bad();
      if (a.kind === 'guideLine' && (!isPoint(a.dir) || !length(a.dir))) bad();
    }
  }

  // Model.load es deliberadamente pequeño. Esta frontera comprueba todo antes
  // de llamarlo, para que un archivo roto nunca destruya el documento abierto.
  function validateModel(j, label, errors) {
    const err = (s) => errors.push(label + ': ' + s);
    if (!j || j.format !== 'dedalo.model' || j.version !== 1) { err('formato o versión de geometría no admitidos.'); return; }
    const fields = ['verts', 'edges', 'faces', 'curves', 'materials', 'annots'];
    if (fields.some((k) => j[k] !== undefined && !Array.isArray(j[k])) || ['verts', 'edges', 'faces'].some((k) => !Array.isArray(j[k]))) { err('listas de geometría inválidas.'); return; }
    const all = new Set(), verts = new Map(), edges = new Map(), edgePairs = new Set(), curves = new Set(), mats = new Set();
    let maxId = 0;
    const id = (v, kind) => {
      if (!entityId(v)) { err('ID de ' + kind + ' inválido.'); return false; }
      if (all.has(v)) { err('ID geométrico duplicado ' + v + '.'); return false; }
      all.add(v); maxId = Math.max(maxId, v); return true;
    };
    for (const v of j.verts) {
      if (!Array.isArray(v) || v.length !== 4 || !v.slice(1).every(Number.isFinite)) { err('vértice inválido.'); continue; }
      if (id(v[0], 'vértice')) verts.set(v[0], v.slice(1));
    }
    for (const c of j.curves || []) {
      if (!c || typeof c !== 'object') { err('curva inválida.'); continue; }
      if (!id(c.id, 'curva')) continue;
      curves.add(c.id);
      if (typeof c.kind !== 'string') err('tipo de curva inválido.');
      for (const k of ['center', 'normal', 'axisU', 'axisV']) if (c[k] !== undefined && !isPoint(c[k])) err('curva ' + c.id + ' con ' + k + ' inválido.');
      if (c.normal && !length(c.normal)) err('curva ' + c.id + ' con normal nula.');
      if (c.radius !== undefined && (!Number.isFinite(c.radius) || c.radius < 0)) err('radio de curva inválido.');
      if (c.segments !== undefined && (!Number.isSafeInteger(c.segments) || c.segments < 1)) err('número de segmentos inválido.');
    }
    for (const m of j.materials || []) {
      if (!m || typeof m !== 'object') { err('material inválido.'); continue; }
      if (!id(m.id, 'material')) continue;
      mats.add(m.id);
      if (m.opacity !== undefined && (!Number.isFinite(m.opacity) || m.opacity < 0 || m.opacity > 1)) err('opacidad de material inválida.');
    }
    for (const e of j.edges) {
      if (!Array.isArray(e) || e.length < 3 || !id(e[0], 'arista')) { err('arista inválida.'); continue; }
      edges.set(e[0], e);
      if (!verts.has(e[1]) || !verts.has(e[2]) || e[1] === e[2]) err('arista ' + e[0] + ' sin dos vértices distintos.');
      const key = e[1] < e[2] ? e[1] + '|' + e[2] : e[2] + '|' + e[1];
      if (edgePairs.has(key)) err('dos aristas comparten los mismos vértices.');
      edgePairs.add(key);
      if (e[4] && !curves.has(e[4])) err('arista ' + e[0] + ' referencia una curva inexistente.');
    }
    for (const f of j.faces) {
      if (!f || typeof f !== 'object' || !id(f.id, 'cara')) { err('cara inválida.'); continue; }
      if (!Array.isArray(f.loops) || !f.loops.length) { err('cara ' + f.id + ' sin contornos.'); continue; }
      if (f.mat && !mats.has(f.mat)) err('cara ' + f.id + ' referencia un material inexistente.');
      for (const loop of f.loops) {
        if (!Array.isArray(loop) || loop.length < 3 || new Set(loop).size !== loop.length) { err('contorno inválido en cara ' + f.id + '.'); continue; }
        for (let i = 0; i < loop.length; i++) {
          const a = loop[i], b = loop[(i + 1) % loop.length];
          if (!verts.has(a)) err('cara ' + f.id + ' referencia un vértice inexistente.');
          const key = a < b ? a + '|' + b : b + '|' + a;
          if (!edgePairs.has(key)) err('cara ' + f.id + ' carece de arista de contorno.');
        }
      }
    }
    for (const a of j.annots || []) {
      if (!a || typeof a !== 'object' || !id(a.id, 'anotación')) { err('anotación inválida.'); continue; }
      if (typeof a.kind !== 'string') err('tipo de anotación inválido.');
      for (const k of ['p', 'a', 'b', 'from', 'off', 'offB', 'dir']) if (a[k] != null && !isPoint(a[k])) err('anotación ' + a.id + ' con ' + k + ' inválido.');
      if (a.kind === 'dim' && !finiteDimension(a)) err('cota con extremos o medida no válidos.');
      if (['guidePoint', 'guideLine', 'text'].includes(a.kind) && !isPoint(a.p)) err('anotación sin posición.');
      if (a.kind === 'guideLine' && (!isPoint(a.dir) || !length(a.dir))) err('guía sin dirección.');
      if (a.attach != null && !verts.has(a.attach)) err('anotación con vértice asociado inexistente.');
    }
    if (!entityId(j.nextId) || j.nextId <= maxId) err('el contador de geometría no supera los IDs existentes.');
    if (j.identities !== undefined) {
      if (!j.identities || typeof j.identities !== 'object' || Array.isArray(j.identities)) err('el registro de UUID geométricos es inválido.');
      else {
        const seen = new Set();
        for (const [key, value] of Object.entries(j.identities)) {
          if (!all.has(Number(key)) || String(Number(key)) !== key) err('UUID asociado a una entidad inexistente.');
          if (typeof value !== 'string' || !UUID.test(value)) err('UUID geométrico inválido.');
          if (seen.has(uuidKey(value))) err('UUID geométrico duplicado.');
          seen.add(uuidKey(value));
        }
        // Los archivos anteriores carecen del registro completo; Model.load
        // genera identidades para las entidades que todavía no tienen una.
      }
    }
  }

  function validateData(j) {
    const errors = [];
    if (!j || j.format !== 'dedalo.scene' || j.version !== 1) return ['Formato o versión de escena no admitidos.'];
    if (!Array.isArray(j.definitions) || !j.definitions.length) return ['La escena no contiene definiciones.'];
    try { if (j.georeference !== undefined) checkMetadata(j.georeference); } catch (e) { errors.push(e.message); }
    const seen = new Set(), defs = new Map(), refs = new Map();
    if (typeof j.rootId !== 'string' || !UUID.test(j.rootId)) errors.push('El ID raíz no es un UUID válido.');
    for (const d of j.definitions) {
      if (!d || typeof d !== 'object') { errors.push('Definición inválida.'); continue; }
      if (typeof d.id !== 'string' || !UUID.test(d.id)) errors.push('ID de definición inválido.');
      if (seen.has(uuidKey(d.id))) errors.push('ID de definición duplicado ' + d.id + '.');
      seen.add(uuidKey(d.id)); defs.set(d.id, d);
      if (!['root', 'group', 'component'].includes(d.kind)) errors.push('Tipo de definición inválido.');
      if (typeof d.name !== 'string') errors.push('Nombre de definición inválido.');
      try { if (d.metadata !== undefined) checkMetadata(d.metadata); } catch (e) { errors.push(e.message); }
      if (d.kind === 'root' && d.id !== j.rootId) errors.push('La escena tiene más de una raíz.');
      if (!Array.isArray(d.nodes)) errors.push('Lista de nodos inválida en ' + d.id + '.');
      validateModel(d.model, 'Definición ' + d.id, errors);
    }
    const rd = defs.get(j.rootId);
    if (!rd || rd.kind !== 'root') errors.push('La definición raíz no existe o tiene un tipo incorrecto.');
    for (const d of defs.values()) for (const n of Array.isArray(d.nodes) ? d.nodes : []) {
      if (!n || typeof n !== 'object') { errors.push('Nodo inválido.'); continue; }
      if (typeof n.id !== 'string' || !UUID.test(n.id)) errors.push('ID de nodo inválido.');
      if (seen.has(uuidKey(n.id))) errors.push('ID de nodo duplicado ' + n.id + '.');
      seen.add(uuidKey(n.id));
      if (!['group', 'component'].includes(n.kind)) errors.push('Tipo de nodo inválido.');
      if (typeof n.name !== 'string') errors.push('Nombre de nodo inválido.');
      try { if (n.metadata !== undefined) checkMetadata(n.metadata); } catch (e) { errors.push(e.message); }
      if (!validMatrix(n.matrix)) errors.push('Transformación inválida o no invertible en ' + n.id + '.');
      const target = defs.get(n.definitionId);
      if (!target) errors.push('Definición ausente en nodo ' + n.id + '.');
      else if (target.kind !== n.kind) errors.push('El tipo del nodo no coincide con su definición en ' + n.id + '.');
      refs.set(n.definitionId, (refs.get(n.definitionId) || 0) + 1);
    }
    // Una definición compartida aparece una sola vez en esta lista. Sus caras
    // son las mismas entidades canónicas para todas sus instancias; en cambio,
    // dos definiciones independientes no pueden reutilizar el mismo UUID.
    for (const d of defs.values()) {
      const identities = d.model && d.model.identities;
      if (!identities || typeof identities !== 'object' || Array.isArray(identities)) continue;
      for (const [localId, value] of Object.entries(identities)) {
        if (typeof value !== 'string' || !UUID.test(value)) continue;
        const key = uuidKey(value);
        if (seen.has(key)) errors.push('UUID geométrico duplicado en definición ' + d.id + ', entidad ' + localId + '.');
        seen.add(key);
      }
    }
    if (refs.has(j.rootId)) errors.push('Un nodo no puede instanciar la raíz.');
    for (const [id, d] of defs) if (d.kind === 'group' && (refs.get(id) || 0) > 1) errors.push('El grupo ' + id + ' comparte definición: debe clonarse al copiar.');
    const visiting = new Set(), done = new Map();
    function visit(id, level) {
      if (visiting.has(id)) { errors.push('Referencia circular en definición ' + id + '.'); return 0; }
      if (done.has(id)) return done.get(id);
      const d = defs.get(id); if (!d) return 0;
      if (level >= MAX_DEPTH) { errors.push('La jerarquía supera ' + MAX_DEPTH + ' niveles.'); return MAX_DEPTH + 1; }
      visiting.add(id);
      let depth = 1;
      for (const n of Array.isArray(d.nodes) ? d.nodes : []) if (n && defs.has(n.definitionId)) depth = Math.max(depth, 1 + visit(n.definitionId, level + 1));
      visiting.delete(id); done.set(id, depth);
      if (depth > MAX_DEPTH) errors.push('La jerarquía supera ' + MAX_DEPTH + ' niveles.');
      return depth;
    }
    // También se comprueban definiciones aún no colocadas en la escena.
    for (const id of defs.keys()) visit(id, 0);
    return errors;
  }

  class Scene {
    constructor(model) {
      if (model !== undefined && !(model instanceof D.Model)) throw new Error('La raíz necesita un Model de Dédalo.');
      this.rootId = uuid();
      this.definitions = new Map();
      this.definitions.set(this.rootId, { id: this.rootId, name: 'Modelo', kind: 'root', model: model || new D.Model(), nodes: [] });
    }

    current(path) {
      path = path || [];
      if (!Array.isArray(path) || path.length >= MAX_DEPTH) throw new Error('La ruta de edición no es válida.');
      let d = this.definitions.get(this.rootId);
      for (const id of path) {
        const n = d && d.nodes.find((x) => x.id === id);
        if (!n) throw new Error('La ruta de edición contiene un nodo inexistente.');
        d = this.definitions.get(n.definitionId);
      }
      if (!d) throw new Error('La definición de edición no existe.');
      return d;
    }

    node(path, id) { return this.current(path).nodes.find((n) => n.id === id) || null; }

    addDefinition(name, kind, model) {
      if (!['group', 'component'].includes(kind)) throw new Error('La definición debe ser grupo o componente.');
      if (model !== undefined && !(model instanceof D.Model)) throw new Error('La definición necesita un Model de Dédalo.');
      const d = { id: uuid(), name: String(name || (kind === 'group' ? 'Grupo' : 'Componente')), kind, model: model || new D.Model(), nodes: [] };
      this.definitions.set(d.id, d); return d;
    }

    addNode(path, props) {
      props = props || {};
      const parent = this.current(path), d = this.definitions.get(props.definitionId);
      if (!d || d.kind === 'root') throw new Error('La definición a instanciar no existe.');
      if (props.kind && props.kind !== d.kind) throw new Error('El tipo del nodo no coincide con su definición.');
      const n = { id: props.id || uuid(), kind: d.kind, name: String(props.name || d.name), definitionId: d.id, matrix: props.matrix ? props.matrix.slice() : identity(), ...metadata(props, 'metadata') };
      if (!UUID.test(n.id) || this.definitions.has(n.id) || [...this.definitions.values()].some((x) => x.nodes.some((y) => y.id === n.id))) throw new Error('El ID del nodo es inválido o está repetido.');
      if (!validMatrix(n.matrix)) throw new Error('La transformación es inválida o no invertible.');
      // No insertar una referencia que vuelva a su propio contexto.
      const seen = new Set();
      const reaches = (id, depth) => {
        if (id === parent.id) return true;
        if (seen.has(id)) return false;
        if (depth >= MAX_DEPTH) throw new Error('La jerarquía es demasiado profunda.');
        seen.add(id);
        const target = this.definitions.get(id);
        return !!target && target.nodes.some((child) => reaches(child.definitionId, depth + 1));
      };
      if (reaches(d.id, 1)) throw new Error('Un componente no puede contenerse a sí mismo.');
      if (d.kind === 'group' && [...this.definitions.values()].some((x) => x.nodes.some((y) => y.definitionId === d.id))) throw new Error('Copia la definición del grupo antes de crear otra instancia.');
      parent.nodes.push(n); return n;
    }

    cloneDefinition(id, deepGroups) {
      const source = this.definitions.get(id);
      if (!source || source.kind === 'root') throw new Error('La definición a duplicar no existe.');
      if (deepGroups === undefined) deepGroups = true;
      const pending = [], ancestors = new Set();
      const copy = (d, depth) => {
        if (depth >= MAX_DEPTH || ancestors.has(d.id)) throw new Error('La definición contiene una jerarquía circular o demasiado profunda.');
        ancestors.add(d.id);
        const model = new D.Model(); model.load(clone(d.model.toJSON()));
        if (model.identities instanceof Map) for (const key of model.identities.keys()) model.identities.set(key, uuid());
        const next = { id: uuid(), name: d.name, kind: d.kind, model, nodes: [], ...metadata(d, 'metadata') };
        pending.push(next);
        for (const n of d.nodes) {
          const child = this.definitions.get(n.definitionId);
          if (!child) throw new Error('Falta una definición hija.');
          const childId = deepGroups && n.kind === 'group' ? copy(child, depth + 1).id : child.id;
          next.nodes.push({ id: uuid(), kind: n.kind, name: n.name, definitionId: childId, matrix: n.matrix.slice(), ...metadata(n, 'metadata') });
        }
        ancestors.delete(d.id); return next;
      };
      const result = copy(source, 0);
      for (const d of pending) this.definitions.set(d.id, d);
      return result;
    }

    pruneUnused() {
      const used = new Set();
      const visit = (id) => {
        if (used.has(id)) return;
        used.add(id);
        const d = this.definitions.get(id);
        if (d) for (const n of d.nodes) visit(n.definitionId);
      };
      visit(this.rootId);
      const removed = [];
      for (const id of this.definitions.keys()) if (!used.has(id)) { this.definitions.delete(id); removed.push(id); }
      return removed;
    }

    toJSON() {
      return { format: 'dedalo.scene', version: 1, rootId: this.rootId, ...metadata(this, 'georeference'), definitions: [...this.definitions.values()].map((d) => ({ id: d.id, name: d.name, kind: d.kind, model: clone(d.model.toJSON()), ...metadata(d, 'metadata'), nodes: d.nodes.map((n) => ({ id: n.id, kind: n.kind, name: n.name, definitionId: n.definitionId, matrix: n.matrix.slice(), ...metadata(n, 'metadata') })) })) };
    }

    validate() {
      let data;
      try { data = this.toJSON(); } catch (e) { return ['No se puede serializar la escena: ' + e.message]; }
      const errors = validateData(data);
      if (!errors.length) for (const d of this.definitions.values()) {
        try { errors.push(...d.model.validate().map((e) => d.name + ': ' + e)); }
        catch (e) { errors.push(d.name + ': geometría incoherente (' + e.message + ').'); }
      }
      return errors;
    }

    load(json) {
      let data;
      if (typeof json !== 'string' && json && Array.isArray(json.definitions)) {
        if (json.georeference !== undefined) checkMetadata(json.georeference);
        for (const d of json.definitions) {
          if (d && d.metadata !== undefined) checkMetadata(d.metadata);
          for (const n of d && Array.isArray(d.nodes) ? d.nodes : []) if (n && n.metadata !== undefined) checkMetadata(n.metadata);
        }
      }
      try { data = typeof json === 'string' ? JSON.parse(json) : clone(json); }
      catch (_) { throw failure(['El archivo de escena no contiene JSON válido.']); }
      const errors = validateData(data);
      if (errors.length) throw failure(errors);
      const definitions = new Map();
      for (const d of data.definitions) {
        const model = new D.Model(); model.load(d.model);
        const errs = model.validate();
        if (errs.length) errors.push(...errs.map((e) => d.name + ': ' + e));
        definitions.set(d.id, { id: d.id, name: d.name, kind: d.kind, model, nodes: d.nodes, ...metadata(d, 'metadata') });
      }
      if (errors.length) throw failure(errors);
      this.rootId = data.rootId; this.definitions = definitions;
      if (data.georeference !== undefined) this.georeference = clone(data.georeference); else delete this.georeference;
      return this;
    }

    project(path) {
      const context = this.current(path || []);
      const data = clone(context.model.toJSON());
      const owners = { verts: new Map(), faces: new Map(), edges: new Map(), annots: new Map() }, nodeItems = new Map();
      let next = -1;
      const alloc = () => { if (-next > MAX_PROJECTED) throw new Error('La vista supera el límite de entidades proyectadas.'); return next--; };
      const append = (d, matrix, owner, ancestors, depth) => {
        if (ancestors.has(d.id) || depth >= MAX_DEPTH) throw new Error('La escena contiene una jerarquía circular o demasiado profunda.');
        if (!validMatrix(matrix)) throw new Error('La transformación acumulada no es invertible.');
        const visiting = new Set(ancestors); visiting.add(d.id);
        const source = clone(d.model.toJSON());
        const ids = new Map();
        const items = nodeItems.get(owner);
        const register = (kind, old) => {
          const id = alloc(); ids.set(old, id);
          if (owners[kind]) { owners[kind].set(id, owner); items[kind].push(id); }
          return id;
        };
        for (const v of source.verts) { const id = register('verts', v[0]); data.verts.push([id, ...point(matrix, v.slice(1))]); }
        for (const mt of source.materials || []) { const id = register('materials', mt.id); data.materials.push({ ...mt, id }); }
        for (const c of source.curves || []) {
          const id = register('curves', c.id);
          const nc = { ...c, id };
          if (isPoint(c.center)) nc.center = point(matrix, c.center);
          if (isPoint(c.normal)) nc.normal = normal(matrix, c.normal);
          if (isPoint(c.axisU) && isPoint(c.axisV)) {
            nc.axisU = vector(matrix, c.axisU); nc.axisV = vector(matrix, c.axisV);
            nc.radii = [length(nc.axisU), length(nc.axisV)];
          } else if (isPoint(c.normal) && Number.isFinite(c.radius)) {
            const n = unit(c.normal), pick = Math.abs(n[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0];
            const u = unit(cross(n, pick)), v = cross(n, u);
            const tu = vector(matrix, u.map((x) => x * c.radius)), tv = vector(matrix, v.map((x) => x * c.radius));
            const ru = length(tu), rv = length(tv), scale = Math.max(ru, rv, 1e-30);
            if (Math.abs(ru - rv) <= scale * 1e-9 && Math.abs(dot(tu, tv)) <= scale * scale * 1e-9) nc.radius = (ru + rv) / 2;
            else { nc.sourceKind = c.sourceKind || c.kind; nc.kind = c.kind === 'polygon' ? 'polygon' : 'ellipse'; nc.axisU = tu; nc.axisV = tv; nc.radii = [ru, rv]; delete nc.radius; }
          }
          data.curves.push(nc);
        }
        for (const e of source.edges) data.edges.push([register('edges', e[0]), ids.get(e[1]), ids.get(e[2]), e[3], e[4] ? ids.get(e[4]) : 0]);
        const reflected = determinantSign(matrix) < 0;
        for (const f of source.faces) {
          const loops = f.loops.map((l) => { const loop = l.map((id) => ids.get(id)); return reflected ? loop.reverse() : loop; });
          data.faces.push({ ...f, id: register('faces', f.id), loops, mat: f.mat ? ids.get(f.mat) : null });
        }
        for (const a of source.annots || []) {
          const na = { ...a, id: register('annots', a.id) };
          for (const k of ['p', 'a', 'b', 'from']) if (isPoint(a[k])) na[k] = point(matrix, a[k]);
          for (const k of ['off', 'offB', 'dir']) if (isPoint(a[k])) na[k] = k === 'dir' ? unit(vector(matrix, a[k])) : vector(matrix, a[k]);
          if (a.attach != null) na.attach = ids.get(a.attach);
          data.annots.push(na);
        }
        for (const n of d.nodes) {
          const child = this.definitions.get(n.definitionId);
          if (!child) throw new Error('Falta la definición del nodo ' + n.name + '.');
          append(child, multiply(matrix, n.matrix), owner, visiting, depth + 1);
        }
      };
      for (const n of context.nodes) {
        nodeItems.set(n.id, { verts: [], faces: [], edges: [], annots: [] });
        const d = this.definitions.get(n.definitionId);
        if (!d) throw new Error('Falta la definición del nodo ' + n.name + '.');
        append(d, n.matrix, n.id, new Set([context.id]), 1);
      }
      // Comprobar antes de Model.load: su geometría trabaja con aritmética JS y
      // un null procedente de serializar NaN podría convertirse en cero.
      checkProjectionNumbers(data);
      const model = new D.Model(); model.load(data);
      for (const f of model.faces.values()) if (!isPoint(f.n) || !Number.isFinite(f.d)) throw new Error('El plano de una cara proyectada queda fuera del intervalo numérico.');
      return { model, owners, nodeItems };
    }
  }

  D.SceneMath = { identity, multiply, translation, rotation, scaling, point, inverse, vector, validMatrix };
  D.Scene = Scene;
})(typeof window !== 'undefined' ? window : globalThis);
