/* Drag deformation uses a smooth spatial falloff; commits via the same command API. */
(function (root) {
  'use strict';
  const D = root.DEDALO, { V, Tool, LivePreview } = D;
  class SculptTool extends Tool {
    constructor(app) { super(app); this.id = 'sculpt'; this.preview = new LivePreview(app); this.motion = new D.LatestMotion(app, ev => this.applyEvent(ev)); }
    reset() { if (this.motion) this.motion.cancel(); if (this.preview) this.preview.end(); this.state = 0; this.hit = null; this.vector = [0, 0, 0]; this.blocked = null; }
    cursor() { return 'crosshair'; }
    hint() { return this.state ? 'Arrastra arriba/abajo para deformar suavemente. Esc cancela. También puedes escribir una distancia.' : 'Entra en una malla con doble clic. Arrastra sobre ella para deformar; ajusta el radio en Formas libres.'; }
    vcbLabel() { return 'Deformación'; }
    hover() { return this.hit ? { face: this.hit.fid } : null; }
    onMove(ev) {
      if (!this.state) { this.hit = this.inf.picker.faceAt(ev.x, ev.y); this.blocked = null; this.app.requestRender(); return; }
      this.motion.queue(ev);
    }
    onDown(ev) {
      if (ev.button !== 0 || this.state) return;
      const hit = this.inf.picker.faceAt(ev.x, ev.y); if (!hit) return;
      if (!this.doc.editPath.length || this.doc.nodeForHit({ face: hit.fid })) { this.app.toast('Entra en la malla con doble clic antes de deformar.', 'info'); return; }
      const f = this.model.faces.get(hit.fid);
      this.hit = hit; this.center = hit.p.slice(); this.normal = f.n.slice(); this.startY = ev.y;
      this.radius = (this.app.organicSettings && this.app.organicSettings.radius) || 0.2;
      this.pixelSize = Math.max(1e-8, this.cam.pixelSize(hit.p)); this.vector = [0, 0, 0];
      this.preview.begin(); this.state = 1;
    }
    applyEvent(ev) { this.applyDistance(Math.max(-this.radius * 1.5, Math.min(this.radius * 1.5, (this.startY - ev.y) * this.pixelSize))); }
    applyDistance(distance) {
      this.vector = V.scale(this.normal, distance);
      const params = { center: this.center, radius: this.radius, vector: this.vector };
      const result = this.preview.apply(m => { D.Organic.deform(m, params); return { ok: true }; });
      this.blocked = result && result.ok === false ? result.error : null;
      this.app.setVCB(D.units.fmtLen(distance));
    }
    onUp(ev) {
      if (!this.state) return;
      this.motion.queue(ev); this.flushMotion(); this.commit();
    }
    commit() {
      const params = { center: this.center, radius: this.radius, vector: this.vector };
      this.motion.cancel(); this.preview.end(); this.state = 0;
      if (V.len(params.vector) > 1e-9) { const r = this.doc.execute('mesh.deform', params); if (!r.ok) this.app.toast(r.error, 'error'); }
      this.app.requestRender();
    }
    onVCB(text) {
      if (!this.state) return false;
      const distance = D.units.parseLen(text); if (distance === null) return false;
      this.motion.cancel(); this.applyDistance(distance); this.commit(); return true;
    }
    drawOverlay(ov) {
      if (!this.hit) return;
      const c = this.state ? V.add(this.center, this.vector) : this.hit.p;
      const n = this.state ? this.normal : this.model.faces.get(this.hit.fid).n;
      const radius = this.state ? this.radius : (this.app.organicSettings && this.app.organicSettings.radius) || 0.2;
      const basis = D.geom.planeBasis(n, c), pts = [];
      for (let i = 0; i < 32; i++) pts.push(basis.to3([radius * Math.cos(i * Math.PI / 16), radius * Math.sin(i * Math.PI / 16)]));
      ov.poly3(pts, true, '#9c49c4', null, 1.5);
      if (this.blocked) { const s = this.cam.project(c); ov.tip(s.x, s.y, this.blocked, '#d63a2f'); }
    }
  }
  D.tools.SculptTool = SculptTool;
})(typeof window !== 'undefined' ? window : globalThis);
