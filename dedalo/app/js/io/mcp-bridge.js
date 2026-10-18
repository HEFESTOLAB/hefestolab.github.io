/* Dédalo ↔ conector MCP local. Sin claves IA, eval ni ejecución de archivos. */
(function (root) {
  'use strict';
  const D = root.DEDALO;
  const ALLOWED = new Set([
    'draw.line', 'draw.rectangle', 'draw.circle', 'draw.polygon', 'draw.arc',
    'face.pushPull', 'face.offset', 'entities.erase', 'entities.move', 'entities.rotate', 'entities.scale', 'entities.mirror',
    'faces.flip', 'faces.paint', 'edges.soften', 'guide.add', 'guides.clear', 'dim.add', 'dim.update', 'text.add', 'annot.edit',
    'group.create', 'component.create', 'component.instantiate', 'component.makeUnique', 'group.explode', 'node.rename', 'project.rename',
    'context.enter', 'context.exit', 'select', 'select.all', 'select.none', 'select.connected', 'edit.undo', 'edit.redo',
    'mesh.ellipsoid', 'mesh.patch', 'mesh.subdivide', 'mesh.deform', 'transaction.batch', 'geo.import', 'geo.info',
    'view.zoomExtents', 'view.set', 'view.option', 'view.projection', 'view.camera'
  ]);
  const bytes = value => new TextEncoder().encode(JSON.stringify(value)).byteLength;
  function finiteJSON(value, depth) {
    if (depth > 32) throw new Error('Los parámetros están demasiado anidados.');
    if (value === null || typeof value === 'string' || typeof value === 'boolean') return;
    if (typeof value === 'number' && Number.isFinite(value)) return;
    if (!value || typeof value !== 'object') throw new Error('Los parámetros deben ser JSON finito.');
    if (Array.isArray(value)) { for (const item of value) finiteJSON(item, depth + 1); return; }
    if (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null) throw new Error('Se esperaba un objeto JSON.');
    for (const [key, item] of Object.entries(value)) {
      if (['__proto__', 'prototype', 'constructor'].includes(key)) throw new Error('Clave de parámetros no admitida.');
      finiteJSON(item, depth + 1);
    }
  }

  class MCPBridge {
    constructor(app, options) {
      this.app = app; const o = options || {};
      this.fetch = o.fetch || (root.fetch && root.fetch.bind(root));
      this.setTimer = o.setTimeout || root.setTimeout.bind(root); this.clearTimer = o.clearTimeout || root.clearTimeout.bind(root);
      this.token = null; this.sessionId = null; this.base = null; this.revision = 0; this.generation = 0; this.attempt = 0;
      this.permissions = { write: false, snapshot: false }; this.listeners = new Set(); this.error = ''; this.connecting = false;
      this.timer = null; this.inflight = new Set(); this.seen = new Map();
      this.unlisten = app.doc.on(kind => {
        if (['model', 'selection', 'context', 'reset'].includes(kind)) this.revision++;
        if (kind === 'reset' && (this.token || this.connecting)) void this.disconnect('El modelo ha cambiado. Conecta de nuevo para compartirlo.');
      });
    }
    on(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
    notify() { for (const fn of this.listeners) { try { fn(this.status()); } catch (_) {} } }
    state() {
      const doc = this.app.doc;
      return { projectId: doc.projectId, revision: this.revision, name: doc.name, context: doc.editPath.slice(),
        projectVersion: doc.projectVersion, appVersion: D.VERSION, busy: !!(doc._busy || this.app.territoryBusy || this.app.navDrag || this.app.tool && this.app.tool.state !== 0),
        permissions: { ...this.permissions } };
    }
    status() { return { connected: !!this.token, connecting: this.connecting, error: this.error, state: this.state(), endpoint: this.base }; }
    async post(route, body) {
      if (!this.fetch) throw new Error('Este navegador no dispone de fetch.');
      const abort = new AbortController(); this.inflight.add(abort);
      const timeout = this.setTimer(() => abort.abort(), 12000);
      try {
        const response = await this.fetch(this.base + '/v1/' + route, {
          method: 'POST', mode: 'cors', credentials: 'omit', cache: 'no-store', redirect: 'error', referrerPolicy: 'no-referrer',
          headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: abort.signal
        });
        const text = await response.text();
        if (text.length > 12 * 1024 * 1024) throw new Error('Respuesta del conector demasiado grande.');
        let result; try { result = JSON.parse(text); } catch (_) { throw new Error('Respuesta del conector no válida.'); }
        if (!response.ok || result.ok === false) throw new Error(result.error || 'El conector rechazó la petición (' + response.status + ').');
        return result;
      } finally { this.clearTimer(timeout); this.inflight.delete(abort); }
    }
    async connect(options) {
      const o = options || {}, port = Number(o.port || 43127), code = String(o.code || '').trim();
      if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('Puerto local no válido.');
      if (!/^[a-z0-9 -]{6,64}$/i.test(code)) throw new Error('Introduce el código que te muestra tu cliente IA al usar dedalo_connection.');
      const attempt = ++this.attempt;
      await this.disconnect(undefined, true);
      if (attempt !== this.attempt) return false;
      this.base = 'http://127.0.0.1:' + port; this.permissions = { write: o.write === true, snapshot: o.snapshot === true };
      this.connecting = true; this.error = ''; this.notify(); const generation = ++this.generation;
      try {
        const result = await this.post('pair', { code, client: { name: 'Dédalo', version: D.VERSION }, permissions: this.permissions, state: this.state() });
        if (generation !== this.generation) return false;
        if (typeof result.token !== 'string' || result.token.length < 32 || typeof result.sessionId !== 'string') throw new Error('Emparejamiento del conector no válido.');
        this.token = result.token; this.sessionId = result.sessionId; this.connecting = false; this.seen.clear(); this.notify();
        this.schedule(generation, 0); return true;
      } catch (error) {
        if (generation !== this.generation) return false;
        this.connecting = false; this.error = error.message; this.notify();
        throw error;
      }
    }
    schedule(generation, delay) {
      this.timer = this.setTimer(() => { this.timer = null; void this.poll(generation); }, delay);
    }
    async poll(generation) {
      if (!this.token || generation !== this.generation) return;
      try {
        const auth = { token: this.token, sessionId: this.sessionId };
        const message = await this.post('poll', { ...auth, state: this.state() });
        if (generation !== this.generation || !this.token) return;
        if (message.request) {
          const request = message.request;
          if (typeof request.id !== 'string' || !request.id || request.id.length > 160) throw new Error('Identificador de petición no válido.');
          let result = this.seen.get(request.id);
          if (!result) {
            result = this.handle(request); this.seen.set(request.id, result);
            if (this.seen.size > 200) this.seen.delete(this.seen.keys().next().value);
          }
          await this.post('result', { ...auth, id: request.id, result });
          if (generation !== this.generation) return;
        }
        this.schedule(generation, 300);
      } catch (error) {
        if (generation !== this.generation) return;
        // No reconexión automática: una respuesta perdida nunca se reejecuta.
        await this.disconnect('Conexión detenida: ' + error.message + '. Consulta el estado antes de repetir una operación.');
      }
    }
    commands() { return this.app.doc.commandList().filter(command => ALLOWED.has(command.name)); }
    checkCommand(command, params) {
      if (!ALLOWED.has(command) || !this.app.doc.commands.has(command)) throw new Error('Comando MCP no permitido: ' + command);
      if (command === 'draw.line' && (!Array.isArray(params.points) || params.points.length > 512)) throw new Error('Dibuja polilíneas de hasta 512 puntos por comando.');
      if (command === 'draw.arc' && params.segments !== undefined && (!Number.isSafeInteger(params.segments) || params.segments < 2 || params.segments > 720)) throw new Error('El arco admite entre 2 y 720 segmentos.');
      if (command === 'view.camera') {
        if (params.target !== undefined && (!Array.isArray(params.target) || params.target.length !== 3 || !params.target.every(Number.isFinite))) throw new Error('La cámara necesita un punto de destino válido.');
        if (params.distance !== undefined && (typeof params.distance !== 'number' || params.distance < 0.001 || params.distance > 1e9)) throw new Error('Distancia de cámara no válida.');
        for (const key of ['yaw', 'pitch']) if (params[key] !== undefined && typeof params[key] !== 'number') throw new Error('Ángulo de cámara no válido.');
      }
      if (command === 'transaction.batch') {
        if (!Array.isArray(params.commands) || !params.commands.length || params.commands.length > 100) throw new Error('El lote admite entre 1 y 100 comandos.');
        for (const item of params.commands) {
          if (!item || typeof item.command !== 'string' || item.command === 'transaction.batch') throw new Error('Lote no válido.');
          const definition = this.app.doc.commands.get(item.command);
          if (!definition || definition.undoable === false) throw new Error('El lote solo admite comandos geométricos deshacibles.');
          this.checkCommand(item.command, item.params || {});
        }
      }
    }
    handle(request) {
      try {
        if (!this.token) throw new Error('Dédalo no está conectado.');
        finiteJSON(request, 0);
        if (bytes(request) > 1024 * 1024) throw new Error('Petición demasiado grande.');
        const payload = request.payload || {}, doc = this.app.doc;
        let result;
        if (request.action === 'read') {
          const queries = { project: () => doc.fileJSON(), commands: () => this.commands(), tree: () => doc.execute('scene.tree'),
            scene: () => doc.execute('scene.get'), selection: () => doc.selectionItems(), audit: () => doc.execute('trace.get'),
            faces: () => doc.execute('model.faces'), edges: () => doc.execute('model.edges'), status: () => this.state() };
          if (payload.query === 'snapshot') {
            if (!this.permissions.snapshot) throw new Error('La captura de pantalla no está autorizada.');
            if (this.state().busy) throw new Error('Termina o cancela el gesto activo antes de capturar.');
            result = { png: this.app.snapshot() };
          } else {
            if (!Object.prototype.hasOwnProperty.call(queries, payload.query)) throw new Error('Consulta MCP no admitida.');
            result = queries[payload.query]();
          }
        } else if (request.action === 'execute') {
          if (!this.permissions.write) throw new Error('La conexión es de solo lectura.');
          if (payload.projectId !== doc.projectId || !Number.isSafeInteger(payload.expectedRevision) || payload.expectedRevision !== this.revision)
            return { ok: false, code: 'STALE_STATE', error: 'El modelo o la selección han cambiado. Vuelve a consultar el estado.', ...this.state() };
          if (this.state().busy) return { ok: false, code: 'USER_BUSY', error: 'Termina o cancela la herramienta activa antes de modificar desde IA.', ...this.state() };
          const params = payload.params || {};
          if (!params || Array.isArray(params) || typeof params !== 'object') throw new Error('Los parámetros deben ser un objeto.');
          this.checkCommand(payload.command, params);
          for (const tool of Object.values(this.app.tools || {})) if ('lastCopy' in tool) tool.lastCopy = null;
          const previous = doc.execution; doc.execution = { agent: 'mcp-local', channel: 'mcp' };
          try { result = this.app.exec(payload.command, params, true); }
          finally { doc.execution = previous; }
        } else throw new Error('Acción MCP no admitida.');
        const state = this.state();
        if (bytes(result) > 4 * 1024 * 1024) return { ok: false, error: 'Resultado demasiado grande. Consulta árbol, caras o aristas por separado.', projectId: state.projectId, revision: state.revision };
        return { ok: !result || result.ok !== false, projectId: state.projectId, revision: state.revision, result };
      } catch (error) { const state = this.state(); return { ok: false, error: error.message, projectId: state.projectId, revision: state.revision }; }
    }
    async disconnect(reason, preserveAttempt) {
      if (!preserveAttempt) ++this.attempt;
      const token = this.token, sessionId = this.sessionId; ++this.generation;
      this.token = null; this.sessionId = null; this.connecting = false; this.seen.clear();
      if (this.timer !== null) this.clearTimer(this.timer); this.timer = null;
      for (const abort of this.inflight) abort.abort();
      this.permissions = { write: false, snapshot: false }; this.error = reason || ''; this.notify();
      if (token) { try { await this.post('disconnect', { token, sessionId }); } catch (_) {} }
    }
    destroy() { void this.disconnect(); if (this.unlisten) this.unlisten(); this.listeners.clear(); }
  }
  D.MCPBridge = MCPBridge; D.MCP_ALLOWED_COMMANDS = [...ALLOWED];
})(typeof window !== 'undefined' ? window : globalThis);
