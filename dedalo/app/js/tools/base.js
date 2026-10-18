/*
 * Dédalo — base de herramientas y utilidades comunes.
 * Una herramienta recibe eventos ya traducidos a coordenadas del visor (px CSS).
 */
(function (root) {
  'use strict';
  const D = root.DEDALO;
  const { V, geom } = D;

  class Tool {
    constructor(app) { this.app = app; this.state = 0; }
    get doc() { return this.app.doc; }
    get model() { return this.app.doc.model; }
    get inf() { return this.app.inference; }
    get cam() { return this.app.camera; }
    activate() { this.reset(); }
    deactivate() { this.cancel(); }
    reset() { this.state = 0; }
    cancel() { this.reset(); this.app.requestRender(); }
    onDown() {}
    onMove() {}
    flushMotion() { if (this.motion) this.motion.flush(); }
    onUp() {}
    onDouble() {}
    onKey() { return false; }
    onKeyUp() { return false; }
    onVCB() { return false; }
    hint() { return ''; }
    vcbLabel() { return 'Medidas'; }
    drawOverlay() {}
    cursor() { return 'default'; }
    hover() { return null; }       // { face } | { edge } para resaltar
    // Para tests y para la barra de estado
    status() { return { tool: this.id, state: this.state }; }
  }

  /*
   * Vista previa "en vivo": la operación se aplica de verdad sobre el modelo para que
   * se vea exactamente el resultado, y se deshace al mover o cancelar. Al confirmar se
   * vuelve al estado base y se ejecuta el comando normal (deshacible).
   */
  class LivePreview {
    constructor(app) { this.app = app; this.base = null; this.applied = false; }
    begin() {
      this.base = this.app.doc.model.toJSON();
      this.applied = false;
    }
    apply(fn, incremental) {
      if (!this.base) return { ok: false };
      const m = this.app.doc.model;
      const revision = m.rev;
      // Incremental callbacks must derive positions from their captured base points.
      // They are only used when topology is unchanged; commit still runs the command.
      if (this.applied && !incremental) m.load(this.base);
      let r;
      try { r = fn(m); } catch (e) { r = { ok: false, error: e.message }; console.warn(e); }
      if (r && r.ok === false) { m.load(this.base); this.applied = false; }
      else this.applied = true;
      // load() reconstructs a model at rev=1. Keep preview revisions increasing
      // so the renderer and picker cannot reuse a previous frame's geometry.
      m.rev = Math.max(m.rev, revision);
      m.touch();
      this.app.requestRender();
      return r;
    }
    restore() {
      if (this.base && this.applied) {
        const m = this.app.doc.model, revision = m.rev;
        m.load(this.base); m.rev = Math.max(m.rev, revision) + 1;
      }
      this.applied = false;
    }
    end() { this.restore(); this.base = null; }
  }

  // Keep the latest pointer sample until the next application render. A click or
  // numeric commit flushes it synchronously; cancellation drops it completely.
  class LatestMotion {
    constructor(app, apply) { this.app = app; this.apply = apply; this.pending = null; }
    queue(ev) { this.pending = Object.assign({}, ev); this.app.requestRender(); }
    flush() { const ev = this.pending; this.pending = null; if (ev) this.apply(ev); }
    cancel() { this.pending = null; }
  }

  // Plano de dibujo para rectángulos, círculos…: el de la cara bajo el ratón o uno de ejes.
  function drawingPlane(app, snap) {
    const m = app.doc.model;
    let fid = snap && (snap.face || (snap.faceHit && snap.type !== 'free' ? snap.faceHit.fid : null));
    if (!fid && snap && snap.type === 'free' && snap.faceHit) fid = null;
    if (fid && m.faces.has(fid)) {
      const f = m.faces.get(fid);
      return { n: f.n, d: f.d, face: fid };
    }
    const fwd = app.camera.forward();
    const p = snap ? snap.p : [0, 0, 0];
    if (Math.abs(fwd[2]) > 0.18 || !snap) return { n: [0, 0, 1], d: p[2] };
    if (Math.abs(fwd[0]) > Math.abs(fwd[1])) return { n: [1, 0, 0], d: p[0] };
    return { n: [0, 1, 0], d: p[1] };
  }

  // Ejes (u, v) dentro de un plano: horizontal + "arriba" en lo posible.
  function planeAxes(n) {
    n = V.norm(n);
    if (Math.abs(n[2]) > 0.999) return { u: [1, 0, 0], v: n[2] > 0 ? [0, 1, 0] : [0, -1, 0] };
    let u = V.cross([0, 0, 1], n);
    u = V.norm(u);
    const v = V.cross(n, u);
    return { u, v };
  }

  // Interpreta coordenadas tecleadas: [x;y;z] absolutas o <dx;dy;dz> relativas.
  function parseCoords(text, from) {
    const t = text.trim();
    const abs = t.match(/^\[(.*)\]$/), rel = t.match(/^<(.*)>$/);
    const m = abs || rel;
    if (!m) return null;
    const parts = m[1].split(/\s*;\s*/).map((s) => D.units.parseLen(s));
    if (parts.length !== 3 || parts.some((x) => x === null)) return null;
    return abs ? parts : V.add(from || [0, 0, 0], parts);
  }

  function evPoint(ev) { return [ev.x, ev.y]; }

  D.Tool = Tool;
  D.LivePreview = LivePreview;
  D.LatestMotion = LatestMotion;
  D.toolUtil = { drawingPlane, planeAxes, parseCoords, evPoint };
  D.tools = D.tools || {};
  void geom;
})(typeof window !== 'undefined' ? window : globalThis);
