/*
 * Dédalo — archivos: abrir/guardar .dedalo, exportar OBJ/STL/PNG y autoguardado.
 * Los complementos (D.plugins) pueden añadir formatos de entrada y salida.
 */
(function (root) {
  'use strict';
  const D = root.DEDALO;
  const { V } = D;

  const AUTOSAVE_KEY = 'dedalo.autosave.v1';

  // Registro de complementos: { id, name, importers:[{ext, label, read(text, app)}], exporters:[{ext, label, write(app) → {name, data, mime}}], menu:[{label, run(app)}] }
  D.plugins = D.plugins || [];
  D.registerPlugin = function (p) {
    D.plugins.push(p);
    if (D.app && D.app.ui) D.app.ui.buildMenu();
  };

  class Files {
    constructor(app) { this.app = app; this.handle = null; this._autoT = 0; }

    download(name, data, mime) {
      const blob = data instanceof Blob ? data : new Blob([data], { type: mime || 'application/octet-stream' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = name;
      document.body.appendChild(a);
      a.click();
      setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
    }

    safeName() { return (this.app.doc.name || 'modelo').replace(/[\\/:*?"<>|]+/g, '_').trim() || 'modelo'; }

    fileJSON(options) {
      const view = Object.assign({}, this.app.renderer.opts);
      // The serialized model reopens at root; section limits are context-local.
      if (this.app.doc.editPath && this.app.doc.editPath.length) view.sectionBox = null;
      return this.app.doc.fileJSON({ camera: this.app.camera.toJSON(), view, style: Object.assign({}, this.app.renderer.style) }, options);
    }

    restoreView(j) {
      this.app.renderer.opts.sectionBox = null;
      if (j.view) {
        for (const k of ['xray','showAxes','showGuides','showEdges','showHidden','monochrome']) if (typeof j.view[k] === 'boolean') this.app.renderer.opts[k] = j.view[k];
        try { this.app.renderer.opts.sectionBox = D.SectionBox.normalize(j.view.sectionBox); } catch (_) { this.app.toast('Se omitió una caja de sección con límites inválidos.', 'warn'); }
      }
      if (j.style && this.app.renderer.style) for (const key of Object.keys(D.STYLE)) {
        if (typeof j.style[key] === 'string' && /^#[0-9a-f]{6}$/i.test(j.style[key])) this.app.renderer.style[key] = j.style[key];
      }
      this.app._fk = this.app._lk = null;
    }

    async save(as) {
      const text = JSON.stringify(this.fileJSON());
      const name = this.safeName() + '.dedalo';
      try {
        if (window.showSaveFilePicker && (as || !this.handle)) {
          this.handle = await window.showSaveFilePicker({ suggestedName: name, types: [{ description: 'Modelo de Dédalo', accept: { 'application/json': ['.dedalo'] } }] });
        }
        if (this.handle) {
          const w = await this.handle.createWritable();
          await w.write(text);
          await w.close();
          const fname = this.handle.name.replace(/\.dedalo$/i, '');
          this.app.doc.name = fname;
        } else {
          this.download(name, text, 'application/json');
        }
        this.app.doc.dirty = false;
        this.app.ui.refreshTitle();
        this.app.toast('Guardado: ' + this.app.doc.name + '.dedalo', 'ok');
      } catch (e) {
        if (e && e.name === 'AbortError') return;
        console.warn(e);
        this.download(name, text, 'application/json');
        this.app.doc.dirty = false;
        this.app.ui.refreshTitle();
      }
    }

    accepts() {
      const exts = ['.dedalo', '.json'];
      for (const p of D.plugins) for (const im of p.importers || []) exts.push(im.ext);
      return exts.join(',');
    }

    async open() {
      if (this.app.doc.dirty && !confirm('Hay cambios sin guardar. ¿Abrir otro modelo de todos modos?')) return;
      try {
        if (window.showOpenFilePicker) {
          const [h] = await window.showOpenFilePicker({ types: [{ description: 'Modelos', accept: { 'application/json': this.accepts().split(',') } }] });
          const f = await h.getFile();
          this.handle = /\.dedalo$/i.test(f.name) ? h : null;
          this.readFile(f);
          return;
        }
      } catch (e) { if (e && e.name === 'AbortError') return; }
      const inp = document.createElement('input');
      inp.type = 'file';
      inp.accept = this.accepts();
      inp.onchange = () => { if (inp.files[0]) { this.handle = null; this.readFile(inp.files[0]); } };
      inp.click();
    }

    readFile(f) {
      const r = new FileReader();
      r.onload = () => this.loadText(String(r.result), f.name);
      r.readAsText(f);
    }

    loadText(text, fname) {
      const base = (fname || 'modelo').replace(/\.[^.]+$/, '');
      const ext = (fname.match(/\.[^.]+$/) || [''])[0].toLowerCase();
      for (const p of D.plugins) {
        for (const im of p.importers || []) {
          if (im.ext === ext || (im.test && im.test(text))) {
            try { im.read(text, this.app, base); this.app.afterLoad(base); return; }
            catch (e) { this.app.toast('No se pudo leer el archivo: ' + e.message, 'error'); return; }
          }
        }
      }
      let j;
      try { j = JSON.parse(text); } catch (e) { this.app.toast('El archivo no es un JSON válido.', 'error'); return; }
      if (j && j.format === 'dedalo.territory-package' && j.version === 1) j = j.native;
      if (!(j && (j.format === 'dedalo' || j.format === 'dedalo.model'))) {
        this.app.toast('Este archivo no es un modelo de Dédalo.', 'error');
        return;
      }
      try {
        this.app.doc.loadJSON(j, base);
        if (j.camera) this.app.camera.load(j.camera);
        this.restoreView(j);
        this.app.afterLoad(base, !j.camera);
      } catch (e) { this.app.toast('No se pudo abrir: ' + e.message, 'error'); }
    }

    /* ---------- exportar ---------- */

    exportIFC(options) {
      const p = options || {};
      const result = D.IFC.export(this.app.doc, { schema:p.schema || 'IFC4', strictClassification:p.strictClassification !== false });
      if (p.download !== false) this.download(this.safeName() + '_' + (p.schema || 'IFC4') + '.ifc', result.text, 'application/x-step');
      return Object.assign({ ok:true, schema:p.schema || 'IFC4', report:D.IFC.summarizeReport(result.report) }, p.download === false ? { text:result.text } : { downloaded:true });
    }


    exportOBJ() {
      const m = this.app.doc.worldModel();
      const lines = ['# Dédalo — ' + this.app.doc.name, '# Unidades: metros · Y arriba', 'mtllib ' + this.safeName() + '.mtl'];
      const idx = new Map();
      let n = 0;
      for (const v of m.verts.values()) { idx.set(v.id, ++n); lines.push('v ' + v.p[0].toFixed(6) + ' ' + v.p[2].toFixed(6) + ' ' + (-v.p[1]).toFixed(6)); }
      const byMat = new Map();
      for (const f of m.faces.values()) { const k = f.mat || 0; if (!byMat.has(k)) byMat.set(k, []); byMat.get(k).push(f); }
      const mtl = ['# Dédalo'];
      for (const [mid, faces] of byMat) {
        const mat = mid ? m.materials.get(mid) : null;
        const name = mat ? 'm' + mid + '_' + mat.name.replace(/[^\w]+/g, '_') : 'por_defecto';
        const col = D.hexColor(mat ? mat.color : D.STYLE.front);
        mtl.push('newmtl ' + name, 'Kd ' + col.slice(0, 3).map((x) => x.toFixed(4)).join(' '), 'd ' + (mat && mat.opacity !== undefined ? mat.opacity : 1), '');
        lines.push('usemtl ' + name);
        for (const f of faces) {
          if (f.loops.length === 1) lines.push('f ' + f.loops[0].map((v) => idx.get(v)).join(' '));
          else for (const t of m.faceTriangles(f.id)) lines.push('f ' + t.map((v) => idx.get(v)).join(' '));
        }
      }
      this.download(this.safeName() + '.obj', lines.join('\n'), 'text/plain');
      setTimeout(() => this.download(this.safeName() + '.mtl', mtl.join('\n'), 'text/plain'), 400);
      this.app.toast('Exportado OBJ (+ MTL)', 'ok');
    }

    exportSTL() {
      const m = this.app.doc.worldModel();
      const tris = [];
      for (const f of m.faces.values()) for (const t of m.faceTriangles(f.id)) tris.push([f.n, m.P(t[0]), m.P(t[1]), m.P(t[2])]);
      const buf = new ArrayBuffer(84 + tris.length * 50);
      const dv = new DataView(buf);
      const head = 'Dedalo STL - metros';
      for (let i = 0; i < head.length; i++) dv.setUint8(i, head.charCodeAt(i));
      dv.setUint32(80, tris.length, true);
      let o = 84;
      for (const t of tris) {
        for (const p of t) { dv.setFloat32(o, p[0], true); dv.setFloat32(o + 4, p[1], true); dv.setFloat32(o + 8, p[2], true); o += 12; }
        o += 2;
      }
      this.download(this.safeName() + '.stl', new Blob([buf], { type: 'model/stl' }));
      this.app.toast('Exportado STL (' + tris.length + ' triángulos)', 'ok');
    }

    screenshot() {
      const url = this.app.snapshot();
      fetch(url).then((r) => r.blob()).then((b) => this.download(this.safeName() + '.png', b));
    }

    /* ---------- autoguardado (solo en este navegador) ---------- */

    scheduleAutosave() {
      clearTimeout(this._autoT);
      this._autoT = setTimeout(() => {
        try {
          if (!this.app.doc.hasContent()) { localStorage.removeItem(AUTOSAVE_KEY); return; }
          // Store each component definition once. A flattened copy can be hundreds
          // of MB and block the viewer before localStorage rejects its size.
          localStorage.setItem(AUTOSAVE_KEY, JSON.stringify(Object.assign(this.fileJSON({ compact:true, omitAudit:true }), { name: this.app.doc.name })));
        } catch (e) { /* sin almacenamiento: no pasa nada */ }
      }, 1200);
    }
    readAutosave() {
      try { const t = localStorage.getItem(AUTOSAVE_KEY); return t ? JSON.parse(t) : null; } catch (e) { return null; }
    }
    clearAutosave() { try { localStorage.removeItem(AUTOSAVE_KEY); } catch (e) { /* nada */ } }
  }

  D.Files = Files;
  void V;
})(typeof window !== 'undefined' ? window : globalThis);
