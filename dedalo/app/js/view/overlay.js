/*
 * Dédalo — capa 2D sobre el visor: marcadores de inferencia, previsualizaciones,
 * cotas, textos, rectángulo de selección y etiquetas.
 */
(function (root) {
  'use strict';
  const D = root.DEDALO;
  const { V } = D;

  class Overlay {
    constructor(canvas, app, opts) {
      this.c = canvas;
      // En modo seguro el lienzo se pide en memoria normal (sin aceleración).
      this.g = canvas.getContext('2d', opts && opts.software ? { willReadFrequently: true } : undefined);
      this.app = app;
      this.dpr = 1;
    }
    get cam() { return this.app.camera; }

    resize(w, h, dpr) {
      this.dpr = dpr; this.w = w; this.h = h;
      const W = Math.round(w * dpr), H = Math.round(h * dpr);
      if (this.c.width !== W || this.c.height !== H) { this.c.width = W; this.c.height = H; }
    }
    clear() {
      const g = this.g;
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.clearRect(0, 0, this.c.width, this.c.height);
      g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    }

    // Proyecta un segmento recortándolo contra el plano cercano.
    seg2(a, b) {
      const cam = this.cam;
      const ca = D.M4.apply4(cam.vp, a), cb = D.M4.apply4(cam.vp, b);
      const da = ca[2] + ca[3], db = cb[2] + cb[3];
      if (da < 0 && db < 0) return null;
      let A = ca, B = cb;
      if (da < 0) { const t = da / (da - db); A = ca.map((x, i) => x + (cb[i] - x) * t); }
      if (db < 0) { const t = db / (db - da); B = cb.map((x, i) => x + (ca[i] - x) * t); }
      const s = (c) => [(c[0] / c[3] * 0.5 + 0.5) * cam.w, (1 - (c[1] / c[3] * 0.5 + 0.5)) * cam.h];
      return [s(A), s(B)];
    }

    line3(a, b, color, width, dash) {
      const s = this.seg2(a, b);
      if (!s) return;
      const g = this.g;
      g.save();
      g.strokeStyle = color || '#111';
      g.lineWidth = width || 1.5;
      g.setLineDash(dash ? (Array.isArray(dash) ? dash : [dash, dash]) : []);
      g.beginPath(); g.moveTo(s[0][0], s[0][1]); g.lineTo(s[1][0], s[1][1]); g.stroke();
      g.restore();
    }

    poly3(pts, closed, stroke, fill, width, dash) {
      if (pts.length < 2) return;
      const g = this.g;
      const s = pts.map((p) => this.cam.project(p));
      if (s.some((q) => q.behind)) {
        for (let i = 0; i < pts.length - (closed ? 0 : 1); i++) this.line3(pts[i], pts[(i + 1) % pts.length], stroke, width, dash);
        return;
      }
      g.save();
      g.beginPath();
      g.moveTo(s[0].x, s[0].y);
      for (let i = 1; i < s.length; i++) g.lineTo(s[i].x, s[i].y);
      if (closed) g.closePath();
      if (fill) { g.fillStyle = fill; g.fill(); }
      if (stroke) {
        g.strokeStyle = stroke; g.lineWidth = width || 1.5;
        g.setLineDash(dash ? [dash, dash] : []);
        g.stroke();
      }
      g.restore();
    }

    marker(p, type, color) {
      const s = this.cam.project(p);
      if (s.behind) return;
      const g = this.g;
      const x = s.x, y = s.y;
      g.save();
      g.lineWidth = 1.5;
      g.strokeStyle = '#fff';
      g.fillStyle = color || '#14a33a';
      g.beginPath();
      if (type === 'endpoint' || type === 'center') { g.arc(x, y, 5.5, 0, Math.PI * 2); }
      else if (type === 'midpoint') { g.arc(x, y, 5, 0, Math.PI * 2); }
      else if (type === 'onEdge') { g.rect(x - 4.5, y - 4.5, 9, 9); }
      else if (type === 'onFace') { g.moveTo(x, y - 6); g.lineTo(x + 6, y); g.lineTo(x, y + 6); g.lineTo(x - 6, y); g.closePath(); }
      else if (type === 'guide') { g.moveTo(x - 5, y - 5); g.lineTo(x + 5, y + 5); g.moveTo(x + 5, y - 5); g.lineTo(x - 5, y + 5); g.strokeStyle = color; g.lineWidth = 2; g.stroke(); g.restore(); return; }
      else { g.arc(x, y, 3.5, 0, Math.PI * 2); }
      g.fill(); g.stroke();
      if (type === 'center') { g.beginPath(); g.fillStyle = '#fff'; g.arc(x, y, 2, 0, Math.PI * 2); g.fill(); }
      g.restore();
    }

    tip(x, y, text, color) {
      if (!text) return;
      const g = this.g;
      g.save();
      g.font = '600 11.5px system-ui, "Segoe UI", sans-serif';
      const w = g.measureText(text).width + 12;
      let tx = x + 14, ty = y + 18;
      if (tx + w > this.w - 4) tx = x - w - 10;
      if (ty + 22 > this.h - 4) ty = y - 30;
      g.fillStyle = 'rgba(255,255,255,0.94)';
      g.strokeStyle = color || 'rgba(0,0,0,0.25)';
      g.lineWidth = 1;
      roundRect(g, tx, ty, w, 21, 5);
      g.fill(); g.stroke();
      g.fillStyle = '#1c1e21';
      g.fillText(text, tx + 6, ty + 14.5);
      g.restore();
    }

    label2(x, y, text, opts) {
      opts = opts || {};
      const g = this.g;
      g.save();
      g.font = (opts.bold ? '600 ' : '') + (opts.size || 12) + 'px system-ui, "Segoe UI", sans-serif';
      const w = g.measureText(text).width + 10;
      const h = (opts.size || 12) + 9;
      const bx = opts.align === 'left' ? x : x - w / 2;
      const by = y - h / 2;
      g.fillStyle = opts.bg || 'rgba(255,255,255,0.92)';
      g.strokeStyle = opts.border || 'rgba(0,0,0,0.28)';
      roundRect(g, bx, by, w, h, 4);
      g.fill(); g.stroke();
      g.fillStyle = opts.color || '#1c1e21';
      g.fillText(text, bx + 5, by + h - 7);
      g.restore();
      return { x: bx, y: by, w, h };
    }

    rect2(x0, y0, x1, y1, crossing) {
      const g = this.g;
      g.save();
      g.strokeStyle = '#1f5fe0';
      g.fillStyle = crossing ? 'rgba(31,95,224,0.06)' : 'rgba(31,95,224,0.08)';
      g.setLineDash(crossing ? [5, 4] : []);
      g.lineWidth = 1.2;
      g.fillRect(Math.min(x0, x1), Math.min(y0, y1), Math.abs(x1 - x0), Math.abs(y1 - y0));
      g.strokeRect(Math.min(x0, x1) + 0.5, Math.min(y0, y1) + 0.5, Math.abs(x1 - x0), Math.abs(y1 - y0));
      g.restore();
    }

    square2(x, y, s, color, filled) {
      const g = this.g;
      g.save();
      g.fillStyle = filled ? color : '#fff';
      g.strokeStyle = color;
      g.lineWidth = 1.5;
      g.fillRect(x - s / 2, y - s / 2, s, s);
      g.strokeRect(x - s / 2, y - s / 2, s, s);
      g.restore();
    }

    // Transportador (herramienta Rotar).
    protractor(center, n, refDir, radiusPx, color) {
      const ps = this.cam.pixelSize(center) * radiusPx;
      const basis = D.geom.planeBasis(n, center);
      const u = refDir ? V.norm(refDir) : basis.u;
      const w = V.cross(n, u);
      const pts = [];
      for (let i = 0; i <= 48; i++) {
        const a = (i / 48) * Math.PI * 2;
        pts.push(V.add(center, V.add(V.scale(u, ps * Math.cos(a)), V.scale(w, ps * Math.sin(a)))));
      }
      this.poly3(pts, true, color, 'rgba(255,255,255,0.18)', 1.4);
      for (let k = 0; k < 24; k++) {
        const a = (k / 24) * Math.PI * 2;
        const d = V.add(V.scale(u, Math.cos(a)), V.scale(w, Math.sin(a)));
        const r0 = ps * (k % 6 === 0 ? 0.78 : 0.88);
        this.line3(V.add(center, V.scale(d, r0)), V.add(center, V.scale(d, ps)), color, 1.2);
      }
    }

    // Vista previa y anotación guardada comparten geometría y medida. Los textos
    // se mantienen horizontales y las flechas salen fuera cuando falta espacio.
    dimension(annotation, color) {
      const col = color || '#1c1e21';
      const points = D.DimensionGeometry.points(annotation), A = points.a, B = points.b;
      const sa = this.cam.project(A), sb = this.cam.project(B);
      const extension = (from, to) => {
        const delta = V.sub(to, from), length = V.len(delta);
        if (length < 1e-9) return;
        const unit = V.scale(delta, 1 / length), pixel = this.cam.pixelSize(to);
        this.line3(V.add(from, V.scale(unit, Math.min(length * 0.2, pixel * 3))), V.add(to, V.scale(unit, pixel * 6)), col, 1);
      };
      extension(annotation.a, A); extension(annotation.b, B);
      this.line3(A, B, col, 1.2);
      if (sa.behind || sb.behind) return null;
      const g = this.g, dx = sb.x - sa.x, dy = sb.y - sa.y, screenLength = Math.hypot(dx, dy);
      if (screenLength < 1) return null;
      const angle = Math.atan2(dy, dx), outside = screenLength < 40;
      if (outside) {
        const ps = this.cam.pixelSize(V.mid(A, B)), dir = V.norm(V.sub(B, A));
        this.line3(V.add(A, V.scale(dir, -ps * 14)), A, col, 1.2);
        this.line3(B, V.add(B, V.scale(dir, ps * 14)), col, 1.2);
      }
      for (const [s, dir] of [[sa, outside ? -1 : 1], [sb, outside ? 1 : -1]]) {
        g.save(); g.fillStyle = col; g.translate(s.x, s.y); g.rotate(angle);
        g.beginPath(); g.moveTo(0, 0); g.lineTo(9 * dir, -3.5); g.lineTo(9 * dir, 3.5); g.closePath(); g.fill(); g.restore();
      }
      const x = outside ? sb.x + dx / screenLength * 32 : (sa.x + sb.x) / 2;
      const y = outside ? sb.y + dy / screenLength * 32 : (sa.y + sb.y) / 2;
      return this.label2(x, y, annotation.text || D.units.fmtLen(D.DimensionGeometry.measure(annotation)), { color: col });
    }

    /* ---------- anotaciones del modelo ---------- */

    drawAnnotations(model, sel, hoverAnnot) {
      const fmt = D.units.fmtLen;
      this.hits = [];
      for (const a of model.annots.values()) {
        if (a.kind === 'dim' && this.app.tool && this.app.tool.id === 'dim' && this.app.tool.state === 2 && this.app.tool.editId === a.id) continue;
        const isSel = sel && sel.annots.has(a.id);
        const isHov = hoverAnnot === a.id;
        const col = isSel ? '#1f5fe0' : (isHov ? '#e06a1f' : '#1c1e21');
        if (a.kind === 'guidePoint') {
          if (!this.app.renderer.opts.showGuides) continue;
          if (a.from) this.line3(a.from, a.p, isSel ? '#1f5fe0' : '#6b6f76', 1, 4);
          this.marker(a.p, 'guide', isSel ? '#1f5fe0' : '#6b6f76');
          const s = this.cam.project(a.p);
          this.hits.push({ id: a.id, x: s.x - 7, y: s.y - 7, w: 14, h: 14 });
        } else if (a.kind === 'dim') {
          const r = this.dimension(a, col);
          if (r) this.hits.push(Object.assign({ id: a.id }, r));
        } else if (a.kind === 'text') {
          const s = this.cam.project(a.p);
          if (s.behind) continue;
          let lx = s.x, ly = s.y;
          if (a.off) {
            const so = this.cam.project(V.add(a.p, a.off));
            if (!so.behind) { lx = so.x; ly = so.y; }
            this.line3(a.p, V.add(a.p, a.off), col, 1);
            const g = this.g;
            g.save(); g.fillStyle = col; g.beginPath(); g.arc(s.x, s.y, 2.5, 0, Math.PI * 2); g.fill(); g.restore();
          }
          const r = this.label2(lx, ly, a.text || ' ', { color: col, border: isSel ? '#1f5fe0' : undefined, size: 12.5 });
          this.hits.push(Object.assign({ id: a.id }, r));
        }
      }
    }

    annotAt(x, y) {
      for (const h of this.hits || []) if (x >= h.x && x <= h.x + h.w && y >= h.y && y <= h.y + h.h) return h.id;
      return null;
    }
  }

  function roundRect(g, x, y, w, h, r) {
    g.beginPath();
    g.moveTo(x + r, y);
    g.lineTo(x + w - r, y); g.quadraticCurveTo(x + w, y, x + w, y + r);
    g.lineTo(x + w, y + h - r); g.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    g.lineTo(x + r, y + h); g.quadraticCurveTo(x, y + h, x, y + h - r);
    g.lineTo(x, y + r); g.quadraticCurveTo(x, y, x + r, y);
    g.closePath();
  }

  D.Overlay = Overlay;
})(typeof window !== 'undefined' ? window : globalThis);
