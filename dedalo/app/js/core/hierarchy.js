/*
 * Dédalo 0.2 — authoritative scene/document integration, without DOM.
 * Definitions own editable topology. The flat Model exposed to existing tools is
 * a disposable evaluation of the current context; it is never the saved source.
 */
(function (root) {
  'use strict';
  const D = root.DEDALO, BaseDocument = D.Document;
  const { V, Model, Scene, SceneMath: M } = D;
  const clone = x => JSON.parse(JSON.stringify(x));
  const array = x => x === undefined ? [] : (Array.isArray(x) ? x : (() => { throw new Error('Se esperaba una lista de identificadores.'); })());
  const vec = (v, name) => {
    if (!Array.isArray(v) || v.length !== 3 || v.some(n => typeof n !== 'number' || !Number.isFinite(n))) throw new Error(name + ' debe contener tres números finitos.');
    return v;
  };
  const determinant = a => a[0] * (a[5] * a[10] - a[9] * a[6]) - a[4] * (a[1] * a[10] - a[9] * a[2]) + a[8] * (a[1] * a[6] - a[5] * a[2]);
  const emptyItems = () => ({ faces: [], edges: [], annots: [], verts: [], nodes: [] });

  // Transfer a selected topological subset without welding it to adjacent objects.
  function extract(model, items) {
    const j = model.toJSON(), fs = new Set(items.faces), es = new Set(items.edges), vs = new Set(items.verts), as = new Set(items.annots);
    for (const id of fs) { const f = model.faces.get(id); if (!f) throw new Error('Cara inexistente: ' + id); for (const e of model.faceEdges(f)) es.add(e); }
    for (const id of es) { const e = model.edges.get(id); if (!e) throw new Error('Arista inexistente: ' + id); vs.add(e.a); vs.add(e.b); }
    for (const id of vs) if (!model.verts.has(id)) throw new Error('Vértice inexistente: ' + id);
    for (const id of as) if (!model.annots.has(id)) throw new Error('Anotación inexistente: ' + id);
    const restFaces = j.faces.filter(f => !fs.has(f.id));
    const neededEdges = new Set();
    for (const f of restFaces) for (const e of model.faceEdges(f)) neededEdges.add(e);
    const restEdges = j.edges.filter(e => !es.has(e[0]) || neededEdges.has(e[0]));
    const neededVertices = new Set(restEdges.flatMap(e => [e[1], e[2]]));
    const restVerts = j.verts.filter(v => !vs.has(v[0]) || neededVertices.has(v[0]));
    const curves = new Set(j.edges.filter(e => es.has(e[0]) && e[4]).map(e => e[4]));
    const mats = new Set(j.faces.filter(f => fs.has(f.id) && f.mat).map(f => f.mat));
    const selected = {
      format: 'dedalo.model', version: 1, nextId: j.nextId,
      verts: j.verts.filter(v => vs.has(v[0])), edges: j.edges.filter(e => es.has(e[0])), faces: j.faces.filter(f => fs.has(f.id)),
      annots: j.annots.filter(a => as.has(a.id)), curves: j.curves.filter(c => curves.has(c.id)), materials: j.materials.filter(m => mats.has(m.id)), identities: {}
    };
    const remaining = Object.assign({}, j, { verts: restVerts, edges: restEdges, faces: restFaces, annots: j.annots.filter(a => !as.has(a.id)) });
    const retained = new Set([...restVerts.map(v => v[0]), ...restEdges.map(e => e[0]), ...restFaces.map(f => f.id), ...remaining.annots.map(a => a.id), ...j.curves.map(c => c.id), ...j.materials.map(m => m.id)]);
    for (const list of [selected.verts, selected.edges, selected.faces, selected.curves, selected.materials, selected.annots]) for (const obj of list) {
      const id = Array.isArray(obj) ? obj[0] : obj.id;
      // A boundary retained by a neighbouring face becomes independent topology.
      selected.identities[id] = retained.has(id) ? D.uuid() : j.identities[id];
    }
    model.load(remaining);
    return Model.fromJSON(selected);
  }

  function appendGeometry(target, source, matrix, preserveIdentity) {
    const a = target.toJSON(), b = clone(source.toJSON()), remap = new Map();
    const id = old => { if (!remap.has(old)) remap.set(old, target.newId()); return remap.get(old); };
    for (const list of [b.verts, b.edges, b.faces, b.curves, b.materials, b.annots]) for (const item of list) id(Array.isArray(item) ? item[0] : item.id);
    a.identities = a.identities || {};
    for (const [old, fresh] of remap) a.identities[fresh] = preserveIdentity ? b.identities[old] : D.uuid();
    const reflected = determinant(matrix) < 0;
    for (const [old, x, y, z] of b.verts) a.verts.push([id(old), ...M.point(matrix, [x, y, z])]);
    for (const e of b.edges) a.edges.push([id(e[0]), id(e[1]), id(e[2]), e[3], e[4] ? id(e[4]) : 0]);
    for (const f of b.faces) a.faces.push({ id: id(f.id), loops: f.loops.map(l => (reflected ? l.slice().reverse() : l).map(id)), mat: f.mat ? id(f.mat) : null });
    for (const material of b.materials) a.materials.push(Object.assign(material, { id: id(material.id) }));
    for (const curve of b.curves) {
      const originalNormal = curve.normal || [0, 0, 1];
      const basis = D.geom.planeBasis(originalNormal);
      const u = M.vector(matrix, curve.axisU || V.scale(basis.u, curve.radius || 1));
      const v = M.vector(matrix, curve.axisV || V.scale(basis.v, curve.radius || 1));
      if (curve.center) curve.center = M.point(matrix, curve.center);
      const inverse = M.inverse(matrix), n = originalNormal;
      curve.normal = V.norm([inverse[0] * n[0] + inverse[1] * n[1] + inverse[2] * n[2], inverse[4] * n[0] + inverse[5] * n[1] + inverse[6] * n[2], inverse[8] * n[0] + inverse[9] * n[1] + inverse[10] * n[2]]);
      curve.axisU = u; curve.axisV = v;
      if (Math.abs(V.len(u) - V.len(v)) > 1e-8 || Math.abs(V.dot(u, v)) > 1e-8) {
        curve.sourceKind = curve.sourceKind || curve.kind; if (curve.kind !== 'polygon') curve.kind = 'ellipse';
        curve.radii = [V.len(u), V.len(v)]; delete curve.radius;
      }
      else curve.radius = V.len(u);
      curve.id = id(curve.id); a.curves.push(curve);
    }
    for (const annotation of b.annots) {
      annotation.id = id(annotation.id);
      for (const key of ['p', 'a', 'b', 'from']) if (Array.isArray(annotation[key])) annotation[key] = M.point(matrix, annotation[key]);
      for (const key of ['dir', 'off', 'offB']) if (Array.isArray(annotation[key])) annotation[key] = M.vector(matrix, annotation[key]);
      if (annotation.attach && remap.has(annotation.attach)) annotation.attach = id(annotation.attach);
      a.annots.push(annotation);
    }
    a.nextId = target.nextId; target.load(a);
    return { faces: b.faces.map(f => id(f.id)), edges: b.edges.map(e => id(e[0])), annots: b.annots.map(x => x.id), verts: b.verts.map(v => id(v[0])), nodes: [] };
  }

  class HierarchyDocument extends BaseDocument {
    constructor() {
      super();
      this.scene = new Scene(this.model);
      this.editPath = []; this.sel.nodes = new Set(); this._busy = false;
      this.projectId = D.uuid(); this.sessionId = D.uuid(); this.projectVersion = 0;
      this.audit = []; this.execution = { agent: 'human', channel: 'command' };
      this._projectionRevision = 0;
      this._registerHierarchy(); this._syncProjection();
    }
    currentDefinition() { return this.scene.current(this.editPath); }
    hasContent() {
      const rootDefinition = this.scene.current([]), m = rootDefinition.model;
      return !!(m.verts.size || m.annots.size || rootDefinition.nodes.length || [...this.scene.definitions.values()].some(d => d.kind === 'component'));
    }
    _collectGroups() {
      // Unplaced components form the reusable library; unused private groups can go.
      const used = new Set();
      const visit = id => { if (used.has(id)) return; used.add(id); const d = this.scene.definitions.get(id); if (d) for (const n of d.nodes) visit(n.definitionId); };
      visit(this.scene.rootId);
      for (const d of this.scene.definitions.values()) if (d.kind === 'component') visit(d.id);
      for (const d of this.scene.definitions.values()) if (d.kind === 'group' && !used.has(d.id)) this.scene.definitions.delete(d.id);
    }
    _syncProjection() {
      this._projection = this.scene.project(this.editPath);
      // A monotonic revision invalidates renderer caches after context and undo.
      this._projection.model.rev = ++this._projectionRevision;
      if (!this._busy) this.model = this._projection.model;
      this.pruneSelection();
    }
    nodeForHit(hit) {
      if (!this._projection || !hit) return null;
      for (const [singular, plural] of [['face', 'faces'], ['edge', 'edges'], ['annot', 'annots'], ['vert', 'verts']]) {
        const owners = this._projection.owners[plural];
        if (hit[singular] !== undefined && owners && owners.has(hit[singular])) return owners.get(hit[singular]);
      }
      return null;
    }
    itemsForNode(id) {
      const items = this._projection && this._projection.nodeItems.get(id);
      return items ? Object.assign(clone(items), { nodes: [id] }) : emptyItems();
    }
    logicalItems(items) {
      items = items || this.selectionItems();
      const result = emptyItems(), nodeSet = new Set(array(items.nodes));
      const view = this._busy ? this.model : (this._projection ? this._projection.model : this.model);
      for (const kind of ['faces', 'edges', 'annots', 'verts']) for (const id of array(items[kind])) {
        const owner = this._projection && this._projection.owners[kind] && this._projection.owners[kind].get(id);
        if (owner) nodeSet.add(owner);
        else if (view[kind] && view[kind].has(id)) result[kind].push(id);
        else throw new Error('Identificador inexistente en el contexto: ' + id);
      }
      for (const id of nodeSet) {
        if (!this.scene.node(this.editPath, id)) throw new Error('El objeto no pertenece al contexto activo: ' + id);
        result.nodes.push(id);
      }
      return result;
    }
    clearSelection(silent) {
      super.clearSelection(true);
      if (this.sel.nodes) this.sel.nodes.clear();
      if (!silent) this.emit('selection');
    }
    selectionEmpty() { return super.selectionEmpty() && !(this.sel.nodes && this.sel.nodes.size); }
    selectionItems() { return Object.assign(super.selectionItems(), { nodes: [...(this.sel.nodes || [])] }); }
    select(items, mode) {
      if (!this.scene) return super.select(items, mode);
      const logical = this.logicalItems(items || {}), existing = this.logicalItems(this.selectionItems());
      const selected = emptyItems();
      mode = mode || 'set';
      for (const kind of ['faces', 'edges', 'annots', 'nodes']) {
        const set = new Set(mode === 'set' ? [] : existing[kind]);
        for (const id of logical[kind]) {
          if (mode === 'remove') set.delete(id);
          else if (mode === 'toggle') { if (set.has(id)) set.delete(id); else set.add(id); }
          else set.add(id);
        }
        selected[kind] = [...set];
      }
      this.sel.faces = new Set(selected.faces); this.sel.edges = new Set(selected.edges); this.sel.annots = new Set(selected.annots); this.sel.nodes = new Set(selected.nodes);
      this.pruneSelection(); this.emit('selection');
    }
    pruneSelection() {
      if (!this.scene || !this._projection) return super.pruneSelection();
      const m = this._projection.model;
      for (const kind of ['faces', 'edges', 'annots']) for (const id of [...this.sel[kind]]) {
        if (!m[kind].has(id) || this._projection.owners[kind].has(id)) this.sel[kind].delete(id);
      }
      for (const id of [...this.sel.nodes]) {
        const items = this._projection.nodeItems.get(id);
        if (!items) { this.sel.nodes.delete(id); continue; }
        for (const kind of ['faces', 'edges', 'annots']) for (const primitive of items[kind]) this.sel[kind].add(primitive);
      }
    }
    vertsOf(items) {
      const expanded = Object.assign(emptyItems(), items || {});
      for (const id of expanded.nodes || []) {
        const child = this._projection && this._projection.nodeItems.get(id);
        if (child) expanded.verts = [...expanded.verts, ...child.verts];
      }
      return super.vertsOf(expanded);
    }
    _state() { return { scene: this.scene.toJSON(), path: this.editPath.slice(), selection: this.selectionItems(), name: this.name }; }
    _restore(state) {
      this.scene.load(state.scene); this.editPath = state.path.slice();
      if (typeof state.name === 'string') this.name = state.name;
      this.clearSelection(true); this._syncProjection();
      try { this.select(state.selection || {}, 'set'); } catch (_) { this.clearSelection(true); }
    }
    execute(name, params) {
      const command = this.commands.get(name);
      if (!command) return { ok: false, error: 'Comando desconocido: ' + name };
      params = params || {};
      try {
        if (command.undoable === false) return command.run.call(this, params, this) || { ok: true };
        const invoke = () => {
          let p = params;
          if (/^(entities\.(erase|move|rotate|scale|mirror)|faces\.(flip|paint)|edges\.soften)$/.test(name)) {
            const hasItems = ['faces', 'edges', 'annots', 'verts', 'nodes'].some(k => Object.prototype.hasOwnProperty.call(params, k));
            const logical = this.logicalItems(hasItems ? params : this.selectionItems());
            if (logical.nodes.length && !name.startsWith('entities.')) throw new Error('Abre el grupo o componente para editar su geometría.');
            p = Object.assign({}, params, logical);
          }
          if ((name === 'face.pushPull' || name === 'face.offset') && this.nodeForHit({ face: p.face })) throw new Error('Abre el grupo o componente antes de editar una cara.');
          if ((name === 'annot.edit' || name === 'dim.update') && this.nodeForHit({ annot: p.id })) throw new Error('Abre el grupo o componente antes de editar una anotación.');
          const result = command.run.call(this, p, this) || { ok: true };
          if (result.ok !== false) this._syncProjection();
          return result;
        };
        if (this._busy) return invoke();
        return this.transact(command.title || name, invoke, { command: name, params });
      } catch (e) { return { ok: false, error: e.message || String(e) }; }
    }
    transact(label, fn, metadata) {
      if (this._busy) return fn();
      const before = clone(this._state()), beforeScene = JSON.stringify(before.scene);
      this._busy = true; this.model = this.currentDefinition().model;
      let result;
      try {
        result = fn() || { ok: true };
        if (result.ok === false) throw new Error(result.error || 'Operación cancelada.');
        this._collectGroups();
        const errors = this.scene.validate();
        if (errors.length) throw new Error('La operación deja un modelo incoherente: ' + errors.slice(0, 3).join(' · '));
        this._busy = false; this._syncProjection();
      } catch (e) {
        this._busy = false; this._restore(before); this.emit('model');
        return { ok: false, error: e.message || String(e) };
      }
      const after = clone(this.scene.toJSON());
      if (beforeScene !== JSON.stringify(after) || before.name !== this.name) {
        this.undoStack.push({ label, json: JSON.stringify(before) });
        if (this.undoStack.length > 100) this.undoStack.shift();
        this.redoStack.length = 0; this.dirty = true; this.projectVersion++;
        this._record(label, before.scene, after, Object.assign({}, metadata || {}, { projectName: { before: before.name, after: this.name } }));
      }
      this.emit('model'); return result;
    }
    _record(label, before, after, metadata) {
      const left = new Map(before.definitions.map(x => [x.id, x])), right = new Map(after.definitions.map(x => [x.id, x]));
      const changes = [];
      for (const id of new Set([...left.keys(), ...right.keys()])) {
        const a = left.get(id) || null, b = right.get(id) || null;
        if (JSON.stringify(a) !== JSON.stringify(b)) changes.push({ objectId: id, type: !a ? 'create' : !b ? 'delete' : 'update', before: a, after: b });
      }
      this.audit.push(Object.assign({ transactionId: D.uuid(), sessionId: this.sessionId, agent: this.execution.agent, channel: this.execution.channel,
        timestamp: new Date().toISOString(), projectVersion: this.projectVersion, label, changes }, clone(metadata || {})));
      if (this.audit.length > 100) this.audit.shift();
    }
    undo() { return this._history(this.undoStack, this.redoStack, 'undo'); }
    redo() { return this._history(this.redoStack, this.undoStack, 'redo'); }
    _history(from, to, type) {
      if (!from.length) return false;
      this.emit('beforecontext');
      const entry = from.pop(), before = clone(this._state());
      to.push({ label: entry.label, json: JSON.stringify(before) });
      this._restore(JSON.parse(entry.json)); this.dirty = true; this.projectVersion++;
      this._record(entry.label, before.scene, clone(this.scene.toJSON()), { command: 'edit.' + type });
      this.emit('context'); this.emit('model'); return entry.label;
    }
    newModel() {
      this.emit('beforecontext');
      this.scene = new Scene(new Model()); this.editPath = [];
      this.clearSelection(true); this.undoStack.length = 0; this.redoStack.length = 0;
      this.name = 'Sin título'; this.projectId = D.uuid(); this.projectVersion = 0; this.audit = []; this.dirty = false;
      this._syncProjection(); this.emit('context'); this.emit('model'); this.emit('reset');
    }
    loadJSON(json, name) {
      if (!json || typeof json !== 'object') throw new Error('Proyecto no válido.');
      if (json.format === 'dedalo' && ![1, 2].includes(json.version)) throw new Error('Versión de proyecto no compatible.');
      const next = new Scene();
      if (json.scene) next.load(clone(json.scene));
      else {
        const model = Model.fromJSON(clone(json.model || json));
        const errors = model.validate(); if (errors.length) throw new Error(errors.join(' · '));
        const migration = new Scene(model); next.load(migration.toJSON());
      }
      // Evaluate the candidate before replacing the current scene or its history.
      // Finite local values can still overflow when instance matrices accumulate.
      next.project([]);
      this.emit('beforecontext'); this.scene = next; this.editPath = [];
      this.clearSelection(true); this.undoStack.length = 0; this.redoStack.length = 0;
      this.name = name || json.name || this.name;
      this.projectId = typeof json.projectId === 'string' ? json.projectId : D.uuid();
      this.projectVersion = Number.isSafeInteger(json.projectVersion) ? json.projectVersion : 0;
      this.audit = Array.isArray(json.audit) ? clone(json.audit).slice(-100) : [];
      this.dirty = false; this._syncProjection(); this.emit('context'); this.emit('model'); this.emit('reset');
    }
    fileJSON(extra, options) {
      options = Object.assign({compact:true,auditDetail:false},options || {});
      // Only an explicit legacy export includes the flattened fallback permits inspection by old readers; scene is authoritative.
      const file = Object.assign({}, extra || {}, { format: 'dedalo', version: 2, app: 'Dédalo', saved: new Date().toISOString(),
        name: this.name, projectId: this.projectId, projectVersion: this.projectVersion, scene: clone(this.scene.toJSON()),
        audit: options.omitAudit ? [] : options.auditDetail ? clone(this.audit) : this.audit.map(t=>({transactionId:t.transactionId,sessionId:t.sessionId,agent:t.agent,channel:t.channel,timestamp:t.timestamp,projectVersion:t.projectVersion,label:t.label,changes:(t.changes||[]).map(c=>({objectId:c.objectId,type:c.type}))})), storage:'scene-instances', auditMode:options.auditDetail?'detailed':'summary' });
      if (!options.compact) file.model = this.scene.project([]).model.toJSON();
      if (options.omitAudit) file.autosave = { compact: true, auditOmitted: true };
      // The existing camera is in local coordinates while a definition is open.
      if (this.editPath.length) delete file.camera;
      return file;
    }
    worldModel() { return this.scene.project([]).model; }
    _selectedNodes(p, single) {
      const ids = p.node ? [p.node] : (p.nodes === undefined ? [...this.sel.nodes] : array(p.nodes));
      if (!ids.length || (single && ids.length !== 1)) throw new Error(single ? 'Selecciona exactamente un grupo o componente.' : 'Selecciona un grupo o componente.');
      return ids.map(id => { const node = this.scene.node(this.editPath, id); if (!node) throw new Error('Objeto fuera del contexto actual.'); return node; });
    }
    _createGroup(p, component) {
      const hasItems = ['faces', 'edges', 'annots', 'verts', 'nodes'].some(k => Object.prototype.hasOwnProperty.call(p, k));
      const items = this.logicalItems(hasItems ? p : this.selectionItems());
      if (!items.nodes.length && !items.faces.length && !items.edges.length && !items.annots.length && !items.verts.length) throw new Error('Selecciona primero la geometría que quieres agrupar.');
      const parent = this.currentDefinition();
      const geometry = extract(parent.model, items);
      const def = this.scene.addDefinition(String(p.name || (component ? 'Componente' : 'Grupo')), component ? 'component' : 'group', geometry);
      const chosen = new Set(items.nodes);
      def.nodes = parent.nodes.filter(n => chosen.has(n.id)); parent.nodes = parent.nodes.filter(n => !chosen.has(n.id));
      const node = this.scene.addNode(this.editPath, { kind: component ? 'component' : 'group', name: def.name, definitionId: def.id, matrix: M.identity() });
      this.clearSelection(true); this.sel.nodes.add(node.id);
      return { ok: true, node: node.id, definitionId: def.id };
    }
    _transformNodes(p, matrix, copyCount) {
      const parent = this.currentDefinition(), output = [];
      for (const id of p.nodes || []) {
        const node = this.scene.node(this.editPath, id); if (!node) throw new Error('Objeto inexistente.');
        if (copyCount) {
          for (let i = 1; i <= copyCount; i++) {
            const definition = node.kind === 'group' ? this.scene.cloneDefinition(node.definitionId, true) : this.scene.definitions.get(node.definitionId);
            const created = this.scene.addNode(this.editPath, { kind: node.kind, name: node.name, definitionId: definition.id, matrix: M.multiply(matrix(i), node.matrix), ...(node.metadata === undefined ? {} : { metadata: clone(node.metadata) }) });
            output.push(created.id);
          }
        } else { node.matrix = M.multiply(matrix(1), node.matrix); output.push(node.id); }
      }
      void parent; return output;
    }
    _registerHierarchy() {
      const R = (name, title, run, params, undoable) => this.register(name, { title, run, params: params || {}, undoable: undoable !== false });
      R('group.create', 'Crear grupo', p => this._createGroup(p, false), { name: 'texto', nodes: '[UUID]', faces: '[id]', edges: '[id]' });
      R('component.create', 'Crear componente', p => {
        const hasItems = ['faces', 'edges', 'annots', 'verts', 'nodes'].some(k => Object.prototype.hasOwnProperty.call(p, k));
        const items = this.logicalItems(hasItems ? p : this.selectionItems());
        if (items.nodes.length === 1 && !items.faces.length && !items.edges.length && !items.annots.length && !items.verts.length) {
          const node = this.scene.node(this.editPath, items.nodes[0]);
          if (node.kind === 'component') throw new Error('La selección ya es un componente.');
          const def = this.scene.definitions.get(node.definitionId);
          node.kind = 'component'; def.kind = 'component';
          if (p.name) { node.name = String(p.name); def.name = String(p.name); }
          return { ok: true, node: node.id, definitionId: def.id };
        }
        return this._createGroup(p, true);
      }, { name: 'texto', nodes: '[UUID de grupo] o selección' });
      R('component.instantiate', 'Insertar instancia', p => {
        const def = this.scene.definitions.get(p.definitionId);
        if (!def || def.kind !== 'component') throw new Error('No existe esa definición de componente.');
        const node = this.scene.addNode(this.editPath, { kind: 'component', name: String(p.name || def.name), definitionId: def.id, matrix: p.matrix || M.identity() });
        this.clearSelection(true); this.sel.nodes.add(node.id);
        return { ok: true, node: node.id, definitionId: def.id };
      }, { definitionId: 'UUID', matrix: 'matriz afín 4x4, column-major (opcional)' });
      R('component.makeUnique', 'Hacer componente único', p => {
        const node = this._selectedNodes(p, true)[0];
        if (node.kind !== 'component') throw new Error('Selecciona una instancia de componente.');
        const def = this.scene.cloneDefinition(node.definitionId, true);
        def.name = String(p.name || def.name + ' (único)'); node.name = def.name; node.definitionId = def.id;
        return { ok: true, node: node.id, definitionId: def.id };
      }, { nodes: '[UUID de instancia]', name: 'texto opcional' });
      R('group.explode', 'Desagrupar', p => {
        const nodes = this._selectedNodes(p), parent = this.currentDefinition(), selected = emptyItems();
        for (const node of nodes) {
          const def = this.scene.definitions.get(node.definitionId);
          const inserted = appendGeometry(parent.model, def.model, node.matrix, node.kind === 'group');
          for (const key of ['faces', 'edges', 'annots', 'verts']) selected[key].push(...inserted[key]);
          // Detach children before reparenting so UUIDs and group ownership remain unique.
          const children = def.nodes.slice();
          if (node.kind === 'group') def.nodes = [];
          parent.nodes = parent.nodes.filter(n => n.id !== node.id);
          // Children keep their hierarchy. A shared component needs independent nodes.
          for (const child of children) {
            const childDef = child.kind === 'group' && node.kind === 'component' ? this.scene.cloneDefinition(child.definitionId, true) : this.scene.definitions.get(child.definitionId);
            const created = this.scene.addNode(this.editPath, { id: node.kind === 'group' ? child.id : undefined, kind: child.kind, name: child.name,
              definitionId: childDef.id, matrix: M.multiply(node.matrix, child.matrix) });
            selected.nodes.push(created.id);
          }
          if (node.kind === 'group') this.scene.definitions.delete(def.id);
        }
        this.clearSelection(true);
        for (const key of ['faces', 'edges', 'annots', 'nodes']) for (const id of selected[key]) this.sel[key].add(id);
        return { ok: true, created: selected };
      }, { nodes: '[UUID] o selección' });
      R('node.rename', 'Renombrar objeto', p => {
        const node = this._selectedNodes(p, true)[0];
        if (typeof p.name !== 'string' || !p.name.trim()) throw new Error('Escribe un nombre.');
        node.name = p.name.trim(); if (node.kind === 'group') this.scene.definitions.get(node.definitionId).name = node.name;
        return { ok: true, node: node.id };
      }, { node: 'UUID', name: 'texto' });
      R('project.rename', 'Renombrar proyecto', p => {
        if (typeof p.name !== 'string' || !p.name.trim()) throw new Error('Escribe un nombre para el proyecto.');
        this.name = p.name.trim(); return { ok: true, name: this.name };
      }, { name: 'texto' });
      R('context.enter', 'Editar grupo o componente', p => {
        if (this._busy) throw new Error('No se cambia de contexto dentro de un lote.');
        const node = this._selectedNodes(p, true)[0];
        this.scene.project([...this.editPath, node.id]);
        this.emit('beforecontext'); this.editPath.push(node.id); this.clearSelection(true); this._syncProjection(); this.emit('context');
        return { ok: true, path: this.editPath.slice(), definitionId: node.definitionId };
      }, { node: 'UUID' }, false);
      R('context.exit', 'Salir de edición', () => {
        if (!this.editPath.length) return { ok: false, error: 'Ya estás en la raíz del modelo.' };
        this.scene.project(this.editPath.slice(0, -1));
        this.emit('beforecontext'); const id = this.editPath.pop(); this.clearSelection(true); this._syncProjection(); this.select({ nodes: [id] }); this.emit('context');
        return { ok: true, path: this.editPath.slice() };
      }, {}, false);
      R('scene.get', 'Leer escena jerárquica', () => ({ ok: true, scene: clone(this.scene.toJSON()), context: this.editPath.slice() }), {}, false);
      R('scene.tree', 'Consultar jerarquía', () => ({ ok: true, rootId: this.scene.rootId, definitions: [...this.scene.definitions.values()].map(d => ({ id: d.id, kind: d.kind, name: d.name, nodes: clone(d.nodes) })), context: this.editPath.slice() }), {}, false);
      R('trace.get', 'Leer trazabilidad local', () => ({ ok: true, projectId: this.projectId, sessionId: this.sessionId, projectVersion: this.projectVersion, transactions: clone(this.audit) }), {}, false);
      R('model.get', 'Leer proyecto completo', () => ({ ok: true, model: this.fileJSON() }), {}, false);
      R('transaction.batch', 'Lote de comandos', p => {
        if (!Array.isArray(p.commands) || !p.commands.length || p.commands.length > 100) throw new Error('El lote debe contener entre 1 y 100 comandos.');
        const results = [];
        for (const cmd of p.commands) {
          if (!cmd || typeof cmd.command !== 'string') throw new Error('Comando de lote no válido.');
          const def = this.commands.get(cmd.command);
          if (!def || def.undoable === false || cmd.command === 'transaction.batch') throw new Error('El lote solo admite comandos geométricos deshacibles.');
          const result = this.execute(cmd.command, cmd.params || {}); if (result.ok === false) return result;
          results.push(result);
        }
        return { ok: true, results };
      }, { commands: '[{command,params}], máximo 100; transacción atómica' });

      // Preserve the existing primitive operations while routing instance transforms.
      for (const name of ['entities.move', 'entities.rotate', 'entities.scale', 'entities.erase']) {
        const primitive = this.commands.get(name).run;
        this.commands.get(name).params.nodes = '[UUID de grupo o instancia]';
        this.commands.get(name).run = p => {
          if (name === 'entities.erase') {
            const selected = new Set(p.nodes); this.currentDefinition().nodes = this.currentDefinition().nodes.filter(n => !selected.has(n.id));
            return primitive.call(this, p, this);
          }
          let matrix;
          if (name === 'entities.move') { const v = vec(p.vector, 'vector'); matrix = i => M.translation(V.scale(v, i)); }
          if (name === 'entities.rotate') {
            const center = vec(p.center, 'center'), axis = vec(p.axis || [0, 0, 1], 'axis');
            if (V.len(axis) < 1e-9 || typeof p.angle !== 'number' || !Number.isFinite(p.angle)) throw new Error('Rotación no válida.');
            matrix = i => M.rotation(center, axis, p.angle * i * Math.PI / 180);
          }
          if (name === 'entities.scale') {
            const origin = vec(p.origin, 'origin'), f = typeof p.factors === 'number' ? [p.factors, p.factors, p.factors] : vec(p.factors, 'factors');
            if (f.some(x => !Number.isFinite(x) || Math.abs(x) < 1e-6)) throw new Error('La escala no puede ser nula.');
            matrix = () => M.scaling(origin, f);
          }
          const count = p.copy ? (p.copies === undefined ? 1 : p.copies) : 0;
          if (p.copy && (!Number.isSafeInteger(count) || count < 1 || count > 500)) throw new Error('El número de copias debe estar entre 1 y 500.');
          if (name === 'entities.scale' && p.copy) throw new Error('Para copiar una escala, copia primero el objeto con Mover.');
          const transformed = this._transformNodes(p, matrix, count);
          const result = primitive.call(this, p, this) || { ok: true };
          if (count && transformed.length) for (const id of transformed) this.sel.nodes.add(id);
          return Object.assign(result, { nodes: transformed });
        };
      }
      R('entities.mirror', 'Reflejar', p => {
        const axis = ['x', 'y', 'z'].indexOf(String(p.axis || 'x').toLowerCase());
        if (axis < 0) throw new Error('El eje debe ser x, y o z.');
        const f = [1, 1, 1]; f[axis] = -1;
        return this.execute('entities.scale', Object.assign({}, p, { origin: p.origin || [0, 0, 0], factors: f }));
      }, { axis: 'x | y | z', origin: '[x,y,z]', nodes: '[UUID] o selección' });
    }
  }
  D.Document = HierarchyDocument;
})(typeof window !== 'undefined' ? window : globalThis);
