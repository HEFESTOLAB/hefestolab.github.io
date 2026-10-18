/*
 * Dédalo — documento: modelo + selección + historial + registro de comandos.
 *
 * Todo cambio del modelo pasa por un comando con parámetros JSON. Los botones, el
 * teclado, la consola y un agente externo ejecutan exactamente los mismos comandos,
 * así que cualquier cosa que se haga con el ratón se puede reproducir y probar.
 */
(function (root) {
  'use strict';
  const D = root.DEDALO;
  const { V, Model, geom } = D;

  const HISTORY_MAX = 100;

  class Document {
    constructor() {
      this.model = new Model();
      this.sel = { faces: new Set(), edges: new Set(), annots: new Set() };
      this.undoStack = [];
      this.redoStack = [];
      this.listeners = new Set();
      this.commands = new Map();
      this.name = 'Sin título';
      this.dirty = false;
      this.viewDir = null; // dirección de la cámara (para orientar caras verticales)
      registerCoreCommands(this);
    }

    on(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
    emit(kind) { for (const fn of this.listeners) { try { fn(kind, this); } catch (e) { console.error(e); } } }

    /* ---------------- Comandos ---------------- */

    register(name, def) { this.commands.set(name, Object.assign({ name }, def)); }

    commandList() {
      return [...this.commands.values()].map((c) => ({ name: c.name, title: c.title, params: c.params || {}, undoable: c.undoable !== false }));
    }

    execute(name, params) {
      const c = this.commands.get(name);
      if (!c) return { ok: false, error: 'Comando desconocido: ' + name };
      params = params || {};
      if (c.undoable === false) {
        try {
          const r = c.run.call(this, params, this);
          return r === undefined ? { ok: true } : r;
        } catch (e) { return { ok: false, error: e.message }; }
      }
      return this.transact(c.title || name, () => c.run.call(this, params, this));
    }

    // Ejecuta fn como una operación deshacible. Si falla, el modelo vuelve a su estado.
    transact(label, fn) {
      const before = JSON.stringify(this.model.toJSON());
      let r;
      try { r = fn(); } catch (e) { r = { ok: false, error: e.message || String(e) }; console.error(e); }
      if (r === undefined) r = { ok: true };
      if (r.ok === false) {
        this.model.load(JSON.parse(before));
        this.pruneSelection();
        this.emit('model');
        return r;
      }
      const errs = this.model.validate();
      if (errs.length) {
        console.error('Modelo incoherente tras «' + label + '»:', errs);
        this.model.load(JSON.parse(before));
        this.pruneSelection();
        this.emit('model');
        return { ok: false, error: 'La operación dejaba la geometría incoherente y se ha anulado.' };
      }
      this.undoStack.push({ label, json: before });
      if (this.undoStack.length > HISTORY_MAX) this.undoStack.shift();
      this.redoStack.length = 0;
      this.dirty = true;
      this.pruneSelection();
      this.emit('model');
      return r;
    }

    undo() {
      const s = this.undoStack.pop();
      if (!s) return false;
      this.redoStack.push({ label: s.label, json: JSON.stringify(this.model.toJSON()) });
      this.model.load(JSON.parse(s.json));
      this.clearSelection(true);
      this.dirty = true;
      this.emit('model');
      return s.label;
    }
    redo() {
      const s = this.redoStack.pop();
      if (!s) return false;
      this.undoStack.push({ label: s.label, json: JSON.stringify(this.model.toJSON()) });
      this.model.load(JSON.parse(s.json));
      this.clearSelection(true);
      this.dirty = true;
      this.emit('model');
      return s.label;
    }

    newModel() {
      this.model = new Model();
      this.undoStack.length = 0; this.redoStack.length = 0;
      this.clearSelection(true);
      this.name = 'Sin título';
      this.dirty = false;
      this.emit('model');
      this.emit('reset');
    }

    loadJSON(j, name) {
      const m = new Model();
      m.load(j.model || j);
      this.model = m;
      this.undoStack.length = 0; this.redoStack.length = 0;
      this.clearSelection(true);
      if (name) this.name = name;
      this.dirty = false;
      this.emit('model');
      this.emit('reset');
    }

    fileJSON(extra) {
      return Object.assign({ format: 'dedalo', version: 1, app: 'Dédalo', saved: new Date().toISOString(), model: this.model.toJSON() }, extra || {});
    }

    /* ---------------- Selección ---------------- */

    clearSelection(silent) {
      this.sel.faces.clear(); this.sel.edges.clear(); this.sel.annots.clear();
      if (!silent) this.emit('selection');
    }
    pruneSelection() {
      for (const f of [...this.sel.faces]) if (!this.model.faces.has(f)) this.sel.faces.delete(f);
      for (const e of [...this.sel.edges]) if (!this.model.edges.has(e)) this.sel.edges.delete(e);
      for (const a of [...this.sel.annots]) if (!this.model.annots.has(a)) this.sel.annots.delete(a);
    }
    select(items, mode) {
      mode = mode || 'set';
      if (mode === 'set') { this.sel.faces.clear(); this.sel.edges.clear(); this.sel.annots.clear(); }
      const apply = (set, ids) => {
        for (const id of ids || []) {
          if (mode === 'remove') set.delete(id);
          else if (mode === 'toggle') { if (set.has(id)) set.delete(id); else set.add(id); }
          else set.add(id);
        }
      };
      apply(this.sel.faces, items.faces);
      apply(this.sel.edges, items.edges);
      apply(this.sel.annots, items.annots);
      this.pruneSelection();
      this.emit('selection');
    }
    selectionEmpty() { return !this.sel.faces.size && !this.sel.edges.size && !this.sel.annots.size; }
    selectionItems() { return { faces: [...this.sel.faces], edges: [...this.sel.edges], annots: [...this.sel.annots] }; }

    // Vértices afectados por una selección (caras + aristas).
    vertsOf(items) {
      const vs = new Set();
      for (const fid of items.faces || []) { const f = this.model.faces.get(fid); if (f) for (const v of this.model.faceVerts(f)) vs.add(v); }
      for (const eid of items.edges || []) { const e = this.model.edges.get(eid); if (e) { vs.add(e.a); vs.add(e.b); } }
      for (const v of items.verts || []) if (this.model.verts.has(v)) vs.add(v);
      return [...vs];
    }
  }

  /* ---------------- Comandos del núcleo ---------------- */

  function itemsFrom(doc, p) {
    if (p.faces || p.edges || p.annots || p.verts) return { faces: p.faces || [], edges: p.edges || [], annots: p.annots || [], verts: p.verts || [] };
    return doc.selectionItems();
  }
  function needPoint(p, k) {
    const v = p[k];
    if (!Array.isArray(v) || v.length !== 3 || v.some((x) => typeof x !== 'number' || !isFinite(x))) throw new Error('Falta el punto «' + k + '» como [x, y, z].');
    return v;
  }
  function dimensionData(p) {
    const a = needPoint(p, 'a'), b = needPoint(p, 'b');
    const off = p.offset === undefined ? [0, 0, 0] : needPoint(p, 'offset');
    const offB = p.offsetB === undefined ? null : needPoint(p, 'offsetB');
    const lineA = V.add(a, off), lineB = V.add(b, offB || off);
    if (![...lineA, ...lineB, V.dist(a, b), V.dist(lineA, lineB)].every(Number.isFinite)) throw new Error('La cota supera el intervalo numérico admitido.');
    if (V.dist(a, b) < 1e-9) throw new Error('La cota necesita dos puntos distintos.');
    if (offB && V.dist(lineA, lineB) < 1e-9) throw new Error('La medida proyectada de la cota es nula.');
    const data = { a: a.slice(), b: b.slice(), off: off.slice() };
    if (offB) data.offB = offB.slice();
    return data;
  }
  function circleFrom3(a, b, c) {
    const ab = V.sub(b, a), ac = V.sub(c, a);
    const n = V.cross(ab, ac);
    const n2 = V.len2(n);
    if (n2 < 1e-18) return null;
    const t1 = V.scale(V.cross(n, ab), V.len2(ac));
    const t2 = V.scale(V.cross(ac, n), V.len2(ab));
    const center = V.add(a, V.scale(V.add(t1, t2), 1 / (2 * n2)));
    return { center, normal: V.norm(n), radius: V.dist(center, a) };
  }

  function registerCoreCommands(doc) {
    const R = (name, def) => doc.register(name, def);
    const viewOpts = () => ({ viewDir: doc.viewDir });

    R('draw.line', {
      title: 'Línea',
      params: { points: '[[x,y,z], …] (m)', closed: 'bool' },
      run(p) {
        if (!Array.isArray(p.points) || p.points.length < 2) throw new Error('Hacen falta al menos dos puntos.');
        const r = doc.model.addPolyline(p.points, !!p.closed, {}, viewOpts());
        return { ok: true, edges: r.edges, faces: r.faces };
      }
    });

    R('draw.rectangle', {
      title: 'Rectángulo',
      params: { origin: '[x,y,z]', width: 'm', height: 'm', xAxis: '[x,y,z] opcional', yAxis: '[x,y,z] opcional' },
      run(p) {
        const o = needPoint(p, 'origin');
        const w = +p.width, h = +p.height;
        if (!(Math.abs(w) > 1e-6 && Math.abs(h) > 1e-6)) throw new Error('El rectángulo necesita ancho y alto distintos de cero.');
        const u = p.xAxis || [1, 0, 0], v = p.yAxis || [0, 1, 0];
        const U = V.scale(V.norm(u), w), W = V.scale(V.norm(v), h);
        const pts = [o, V.add(o, U), V.add(V.add(o, U), W), V.add(o, W)];
        const r = doc.model.addPolyline(pts, true, {}, viewOpts());
        return { ok: true, edges: r.edges, faces: r.faces };
      }
    });

    R('draw.circle', {
      title: 'Círculo',
      params: { center: '[x,y,z]', radius: 'm', normal: '[x,y,z] (por defecto Z)', segments: 'número (24)' },
      run(p) {
        const c = needPoint(p, 'center');
        if (!(p.radius > 1e-6)) throw new Error('El radio debe ser mayor que cero.');
        const r = doc.model.addCircle(c, p.normal || [0, 0, 1], +p.radius, p.segments || 24, viewOpts(), 'circle', p.startDir);
        return { ok: true, edges: r.edges, faces: r.faces };
      }
    });

    R('draw.polygon', {
      title: 'Polígono',
      params: { center: '[x,y,z]', radius: 'm (al vértice)', sides: 'número', normal: '[x,y,z]' },
      run(p) {
        const c = needPoint(p, 'center');
        if (!(p.radius > 1e-6)) throw new Error('El radio debe ser mayor que cero.');
        const r = doc.model.addCircle(c, p.normal || [0, 0, 1], +p.radius, p.sides || 6, viewOpts(), 'polygon', p.startDir);
        return { ok: true, edges: r.edges, faces: r.faces };
      }
    });

    R('draw.arc', {
      title: 'Arco',
      params: { start: '[x,y,z]', end: '[x,y,z]', through: '[x,y,z] punto del arco', segments: 'número (12)' },
      run(p) {
        const a = needPoint(p, 'start'), b = needPoint(p, 'end'), m = needPoint(p, 'through');
        const pts = D.arcPoints(a, b, m, p.segments || 12);
        if (!pts) {
          const r = doc.model.addPolyline([a, b], false, {}, viewOpts());
          return { ok: true, edges: r.edges, faces: r.faces };
        }
        const r = doc.model.addArc(pts, viewOpts());
        return { ok: true, edges: r.edges, faces: r.faces };
      }
    });

    R('face.pushPull', {
      title: 'Empujar/Tirar',
      params: { face: 'id de cara', distance: 'm (+ hacia la normal)', keep: 'bool: conservar la cara de partida' },
      run(p) {
        if (!doc.model.faces.has(p.face)) throw new Error('No existe la cara ' + p.face + '.');
        return doc.model.pushPull(p.face, +p.distance, { keep: !!p.keep });
      }
    });

    R('face.offset', {
      title: 'Equidistancia',
      params: { face: 'id de cara', distance: 'm (+ hacia dentro)' },
      run(p) {
        if (!doc.model.faces.has(p.face)) throw new Error('No existe la cara ' + p.face + '.');
        return doc.model.offsetFace(p.face, +p.distance, viewOpts());
      }
    });

    R('entities.erase', {
      title: 'Borrar',
      params: { faces: '[ids]', edges: '[ids]', annots: '[ids]', '(sin parámetros)': 'borra la selección' },
      run(p) {
        const it = itemsFrom(doc, p);
        // las aristas arrastran sus caras; las caras sueltas se borran solas
        const m = doc.model;
        for (const a of it.annots) m.annots.delete(a);
        m.eraseFaces(it.faces.filter((f) => m.faces.has(f)));
        m.eraseEdges(it.edges.filter((e) => m.edges.has(e)));
        // quitar aristas que se quedan sin caras al borrar caras seleccionadas junto a sus aristas
        doc.clearSelection(true);
        return { ok: true };
      }
    });

    R('entities.move', {
      title: 'Mover',
      params: { vector: '[dx,dy,dz]', copy: 'bool', copies: 'nº de copias en serie', faces: '[ids]', edges: '[ids]' },
      run(p) {
        const it = itemsFrom(doc, p);
        const v = needPoint(p, 'vector');
        const m = doc.model;
        if (p.copy) {
          const n = Math.max(1, Math.round(p.copies || 1));
          const all = { faces: [], edges: [], annots: [] };
          for (let i = 1; i <= n; i++) {
            const r = m.copyEntities(it.faces, it.edges, (q) => V.add(q, V.scale(v, i)));
            all.faces.push(...r.faces); all.edges.push(...r.edges);
            all.annots.push(...transformAnnots(m, it.annots, (q) => V.add(q, V.scale(v, i)), (q) => q.slice(), true));
          }
          doc.select(all, 'set');
          return { ok: true, created: all };
        }
        const vs = doc.vertsOf(it);
        m.transformVertices(vs, (q) => V.add(q, v));
        transformAnnots(m, it.annots, (q) => V.add(q, v), (q) => q.slice(), false);
        return { ok: true };
      }
    });

    R('entities.rotate', {
      title: 'Rotar',
      params: { center: '[x,y,z]', axis: '[x,y,z]', angle: 'grados', copy: 'bool', copies: 'nº', faces: '[ids]', edges: '[ids]' },
      run(p) {
        const it = itemsFrom(doc, p);
        const c = needPoint(p, 'center');
        const k = V.norm(p.axis || [0, 0, 1]);
        const a = (+p.angle) * Math.PI / 180;
        const m = doc.model;
        if (p.copy) {
          const n = Math.max(1, Math.round(p.copies || 1));
          const all = { faces: [], edges: [], annots: [] };
          for (let i = 1; i <= n; i++) {
            const r = m.copyEntities(it.faces, it.edges, (q) => V.rotate(q, c, k, a * i));
            all.faces.push(...r.faces); all.edges.push(...r.edges);
            all.annots.push(...transformAnnots(m, it.annots, (q) => V.rotate(q, c, k, a * i), (q) => V.rotate(q, [0, 0, 0], k, a * i), true));
          }
          doc.select(all, 'set');
          return { ok: true, created: all };
        }
        m.transformVertices(doc.vertsOf(it), (q) => V.rotate(q, c, k, a));
        transformAnnots(m, it.annots, (q) => V.rotate(q, c, k, a), (q) => V.rotate(q, [0, 0, 0], k, a), false);
        return { ok: true };
      }
    });

    R('entities.scale', {
      title: 'Escala',
      params: { origin: '[x,y,z]', factors: '[sx,sy,sz] o número', faces: '[ids]', edges: '[ids]' },
      run(p) {
        const it = itemsFrom(doc, p);
        const o = needPoint(p, 'origin');
        const f = typeof p.factors === 'number' ? [p.factors, p.factors, p.factors] : p.factors;
        if (!Array.isArray(f) || f.some((x) => !isFinite(x) || Math.abs(x) < 1e-6)) throw new Error('Factores de escala no válidos.');
        const m = doc.model;
        const touched = m.transformVertices(doc.vertsOf(it), (q) => [o[0] + (q[0] - o[0]) * f[0], o[1] + (q[1] - o[1]) * f[1], o[2] + (q[2] - o[2]) * f[2]]);
        transformAnnots(m, it.annots, (q) => [o[0] + (q[0] - o[0]) * f[0], o[1] + (q[1] - o[1]) * f[1], o[2] + (q[2] - o[2]) * f[2]], (q) => q.map((x, i) => x * f[i]), false);
        if (f[0] * f[1] * f[2] < 0) m.flipFaces(touched.filter((x) => m.faces.has(x)));
        return { ok: true };
      }
    });

    R('faces.flip', {
      title: 'Invertir caras',
      params: { faces: '[ids]' },
      run(p) {
        const it = itemsFrom(doc, p);
        doc.model.flipFaces(it.faces);
        return { ok: true };
      }
    });

    R('faces.paint', {
      title: 'Pintar',
      params: { faces: '[ids]', color: '#rrggbb o null (por defecto)', name: 'texto', opacity: '0–1' },
      run(p) {
        const it = itemsFrom(doc, p);
        const m = doc.model;
        let mat = null;
        if (p.color) mat = m.addMaterial(p.name || p.color, p.color, p.opacity === undefined ? 1 : +p.opacity);
        m.paintFaces(it.faces, mat);
        return { ok: true, material: mat };
      }
    });

    R('edges.soften', {
      title: 'Suavizar aristas',
      params: { edges: '[ids]', soft: 'bool' },
      run(p) {
        const it = itemsFrom(doc, p);
        for (const eid of it.edges) { const e = doc.model.edges.get(eid); if (e) e.soft = p.soft !== false; }
        doc.model.touch();
        return { ok: true };
      }
    });

    R('guide.add', {
      title: 'Guía',
      params: { point: '[x,y,z]', direction: '[x,y,z] (sin dirección: punto guía)' },
      run(p) {
        const m = doc.model;
        const point = needPoint(p, 'point').slice();
        const direction = p.direction === undefined ? null : needPoint(p, 'direction');
        const from = p.from == null ? null : needPoint(p, 'from').slice();
        if (direction && V.len(direction) < 1e-9) throw new Error('La guía necesita una dirección no nula.');
        const id = m.newId();
        if (direction) m.annots.set(id, { id, kind: 'guideLine', p: point, dir: V.norm(direction) });
        else m.annots.set(id, { id, kind: 'guidePoint', p: point, from });
        m.touch();
        return { ok: true, id };
      }
    });

    R('guides.clear', {
      title: 'Borrar guías',
      run() {
        const m = doc.model;
        for (const a of [...m.annots.values()]) if (a.kind === 'guideLine' || a.kind === 'guidePoint') m.annots.delete(a.id);
        m.touch();
        return { ok: true };
      }
    });

    R('dim.add', {
      title: 'Cota',
      params: { a: '[x,y,z]', b: '[x,y,z]', offset: '[dx,dy,dz] desplazamiento del extremo A', offsetB: '[dx,dy,dz] desplazamiento del extremo B (opcional; cota proyectada)' },
      run(p) {
        const m = doc.model;
        const data = dimensionData(p);
        const id = m.newId();
        m.annots.set(id, Object.assign({ id, kind: 'dim' }, data));
        m.touch();
        return { ok: true, id };
      }
    });

    R('dim.update', {
      title: 'Recolocar cota',
      params: { id: 'id de cota', a: '[x,y,z]', b: '[x,y,z]', offset: '[dx,dy,dz]', offsetB: '[dx,dy,dz] opcional' },
      run(p) {
        const m = doc.model, annotation = m.annots.get(p.id);
        if (!annotation || annotation.kind !== 'dim') throw new Error('No existe esa cota en el contexto abierto.');
        const data = dimensionData(p);
        delete annotation.offB;
        Object.assign(annotation, data);
        m.touch();
        return { ok: true, id: annotation.id };
      }
    });

    R('text.add', {
      title: 'Texto',
      params: { point: '[x,y,z]', text: 'texto', offset: '[dx,dy,dz] posición del rótulo (opcional)' },
      run(p) {
        const m = doc.model;
        const id = m.newId();
        m.annots.set(id, { id, kind: 'text', p: needPoint(p, 'point'), off: p.offset || null, text: String(p.text || '') });
        m.touch();
        return { ok: true, id };
      }
    });

    R('annot.edit', {
      title: 'Editar texto',
      params: { id: 'id', text: 'texto' },
      run(p) {
        const a = doc.model.annots.get(p.id);
        if (!a) throw new Error('No existe la anotación.');
        a.text = String(p.text);
        doc.model.touch();
        return { ok: true };
      }
    });

    /* --- comandos que no cambian el modelo --- */

    R('select', {
      title: 'Seleccionar', undoable: false,
      params: { faces: '[ids]', edges: '[ids]', mode: 'set | add | remove | toggle' },
      run(p) { doc.select({ faces: p.faces, edges: p.edges, annots: p.annots }, p.mode || 'set'); return { ok: true, selection: doc.selectionItems() }; }
    });
    R('select.all', {
      title: 'Seleccionar todo', undoable: false,
      run() { doc.select({ faces: [...doc.model.faces.keys()], edges: [...doc.model.edges.keys()], annots: [...doc.model.annots.keys()] }, 'set'); return { ok: true }; }
    });
    R('select.none', { title: 'No seleccionar nada', undoable: false, run() { doc.clearSelection(); return { ok: true }; } });
    R('select.connected', {
      title: 'Seleccionar lo conectado', undoable: false,
      run() { const c = doc.model.connected([...doc.sel.faces], [...doc.sel.edges]); doc.select({ faces: c.faces, edges: c.edges }, 'add'); return { ok: true }; }
    });

    R('edit.undo', { title: 'Deshacer', undoable: false, run() { const l = doc.undo(); return l ? { ok: true, undone: l } : { ok: false, error: 'No hay nada que deshacer.' }; } });
    R('edit.redo', { title: 'Rehacer', undoable: false, run() { const l = doc.redo(); return l ? { ok: true, redone: l } : { ok: false, error: 'No hay nada que rehacer.' }; } });

    R('model.new', { title: 'Nuevo', undoable: false, run() { doc.newModel(); return { ok: true }; } });
    R('model.get', { title: 'Leer modelo', undoable: false, run() { return { ok: true, model: doc.model.toJSON() }; } });
    R('model.load', { title: 'Cargar modelo', undoable: false, params: { model: 'JSON de Dédalo' }, run(p) { doc.loadJSON(p.model || p); return { ok: true }; } });
    R('model.stats', {
      title: 'Estadísticas', undoable: false,
      run() {
        const m = doc.model;
        const faces = [...m.faces.keys()];
        let area = 0;
        for (const f of faces) area += m.faceArea(f);
        const closed = faces.length > 0 && m.isClosed(faces);
        return { ok: true, stats: m.stats(), area, closed, volume: closed ? m.volume(faces) : null, bbox: m.bbox() };
      }
    });
    R('model.faces', {
      title: 'Listar caras', undoable: false,
      params: { near: '[x,y,z] opcional: solo la cara que contiene el punto' },
      run(p) {
        const m = doc.model;
        let list = [...m.faces.values()];
        if (p.near) list = list.filter((f) => m.pointInFace(f, p.near) >= 0);
        return {
          ok: true,
          faces: list.map((f) => ({ id: f.id, normal: f.n.map((x) => +x.toFixed(6)), area: +m.faceArea(f.id).toFixed(6), centroid: m.faceCentroid(f.id).map((x) => +x.toFixed(6)), holes: f.loops.length - 1, material: f.mat }))
        };
      }
    });
    R('model.edges', {
      title: 'Listar aristas', undoable: false,
      run() {
        const m = doc.model;
        return { ok: true, edges: [...m.edges.values()].map((e) => ({ id: e.id, a: m.P(e.a), b: m.P(e.b), length: +m.edgeLen(e.id).toFixed(6), faces: m.eFaces.get(e.id).size, soft: e.soft })) };
      }
    });
  }

  function transformAnnots(m, ids, point, vector, copy) {
    const changed = [];
    for (const id of ids || []) {
      const a = m.annots.get(id);
      if (!a) continue;
      const t = copy ? JSON.parse(JSON.stringify(a)) : a;
      if (copy) { t.id = m.newId(); m.annots.set(t.id, t); }
      for (const key of ['p', 'a', 'b', 'from']) if (t[key]) t[key] = point(t[key]);
      for (const key of ['off', 'offB', 'dir']) if (t[key]) t[key] = key === 'dir' ? V.norm(vector(t[key])) : vector(t[key]);
      changed.push(t.id);
    }
    if (changed.length) m.touch();
    return changed;
  }

  // Puntos de un arco que pasa por a, m y b (null si están alineados).
  D.arcPoints = function (a, b, m, segments) {
    const c = circleFrom3(a, m, b);
    if (!c) return null;
    const basis = geom.planeBasis(c.normal, c.center);
    const ang = (p) => { const q = basis.to2(p); return Math.atan2(q[1], q[0]); };
    let a0 = ang(a), am = ang(m), a1 = ang(b);
    const norm = (x) => { while (x < 0) x += 2 * Math.PI; while (x >= 2 * Math.PI) x -= 2 * Math.PI; return x; };
    let sweep = norm(a1 - a0);
    const sm = norm(am - a0);
    if (sm > sweep) sweep = sweep - 2 * Math.PI; // el punto intermedio está por el otro lado
    const n = Math.max(2, Math.round(segments));
    const pts = [];
    for (let i = 0; i <= n; i++) {
      const t = a0 + (sweep * i) / n;
      pts.push(basis.to3([c.radius * Math.cos(t), c.radius * Math.sin(t)]));
    }
    pts[0] = a.slice(); pts[n] = b.slice();
    return pts;
  };
  D.circleFrom3 = circleFrom3;

  D.Document = Document;
})(typeof window !== 'undefined' ? window : globalThis);
