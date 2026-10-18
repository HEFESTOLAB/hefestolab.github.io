/*
 * Dédalo — renderizador por software («modo gráfico seguro»).
 *
 * No usa WebGL ni aceleración 3D: rasteriza triángulos y aristas en la CPU con un búfer de
 * profundidad propio y vuelca la imagen en un lienzo 2D pedido con willReadFrequently, que
 * en Chromium obliga a que ese lienzo viva en memoria normal y no en la GPU.
 *
 * Tiene la misma interfaz que Renderer (resize, buildFaces, modelLines, render, opts, style),
 * así que la aplicación no distingue uno de otro.
 */
(function (root) {
  'use strict';
  const D = root.DEDALO;
  const { V, M4 } = D;
  const hex = D.hexColor;

  const LIGHT = V.norm([0.35, -0.55, 0.76]);
  const FILL = V.norm([-0.5, -0.7, 0.25]);
  const LINE_BIAS_PERSP = 0.002;   // margen relativo para que la arista gane a su cara
  const LINE_BIAS_ORTHO = 2e-5;

  function shade(n, base) {
    const diff = Math.max(V.dot(n, LIGHT), 0);
    const fill = Math.max(V.dot(n, FILL), 0);
    const sky = 0.5 + 0.5 * n[2];
    const k = 0.60 + 0.32 * diff + 0.06 * fill + 0.06 * sky;
    return [Math.min(255, base[0] * k * 255), Math.min(255, base[1] * k * 255), Math.min(255, base[2] * k * 255)];
  }
  // Píxel ABGR para Uint32Array en máquinas little-endian (todas las de escritorio).
  function pack(r, g, b) { return ((255 << 24) | ((b & 255) << 16) | ((g & 255) << 8) | (r & 255)) >>> 0; }

  class SoftRenderer {
    constructor(canvas) {
      this.canvas = canvas;
      const g = canvas.getContext('2d', { alpha: false, willReadFrequently: true });
      if (!g) throw new Error('Este navegador no puede dibujar en un lienzo 2D.');
      this.g = g;
      this.software = true;
      this.dpr = 1;
      this.style = Object.assign({}, D.STYLE);
      this.opts = { xray: false, showAxes: true, showGuides: true, showEdges: true, showHidden: false, monochrome: false };
      this.tris = [];
      this.transTris = [];
      this.lines = [];
      this.W = 0; this.H = 0;
    }

    // Se dibuja a 1 píxel por píxel CSS: con pantallas de alta densidad la imagen se escala,
    // pero el coste en CPU no se multiplica por cuatro.
    resize(w, h) {
      const W = Math.max(1, Math.round(w)), H = Math.max(1, Math.round(h));
      if (this.canvas.width !== W || this.canvas.height !== H) { this.canvas.width = W; this.canvas.height = H; }
      if (W !== this.W || H !== this.H) {
        this.W = W; this.H = H;
        this.img = this.g.createImageData(W, H);
        this.color32 = new Uint32Array(this.img.data.buffer);
        this.depth = new Float32Array(W * H);
        this._bgKey = null;
      }
      this.cssW = w; this.cssH = h;
    }

    /* ---------- datos ---------- */

    buildFaces(model, sel, hover) {
      const st = this.style;
      const front = hex(st.front), back = hex(st.back);
      this.tris = []; this.transTris = [];
      for (const f of model.faces.values()) {
        const mat = f.mat ? model.materials.get(f.mat) : null;
        let col = mat ? hex(mat.color, mat.opacity === undefined ? 1 : mat.opacity) : front;
        if (this.opts.monochrome) col = front;
        let flag = 0;
        if (sel && sel.faces.has(f.id)) flag |= 1;
        if (hover && hover.face === f.id) flag |= 2;
        const fc = shade(f.n, col), bc = shade(V.neg(f.n), back);
        const alpha = this.opts.xray ? 0.45 : col[3];
        const list = alpha < 0.999 ? this.transTris : this.tris;
        const fpk = pack(fc[0], fc[1], fc[2]), bpk = pack(bc[0], bc[1], bc[2]);
        for (const t of model.faceTriangles(f.id)) {
          list.push({ a: model.P(t[0]).slice(), b: model.P(t[1]).slice(), c: model.P(t[2]).slice(), fc, bc, fpk, bpk, alpha, flag });
        }
      }
    }

    // Misma lógica que Renderer.modelLines: ejes, guías y aristas.
    modelLines(model, sel, hover, extra) {
      const st = this.style;
      const lines = [];
      const R = 2000;
      if (this.opts.showAxes) {
        const ax = [[st.axisX, [1, 0, 0]], [st.axisY, [0, 1, 0]], [st.axisZ, [0, 0, 1]]];
        for (const [c, d] of ax) {
          lines.push({ a: [0, 0, 0], b: V.scale(d, R), color: c, width: 1.4 });
          lines.push({ a: [0, 0, 0], b: V.scale(d, -R), color: c, width: 1.2, dash: 4, alpha: 0.7 });
        }
      }
      if (this.opts.showGuides) {
        for (const a of model.annots.values()) {
          if (a.kind !== 'guideLine') continue;
          const s = sel && sel.annots.has(a.id);
          lines.push({ a: V.add(a.p, V.scale(a.dir, -R)), b: V.add(a.p, V.scale(a.dir, R)), color: s ? st.sel : st.guide, width: s ? 1.6 : 1.1, dash: 5, alpha: 0.85 });
        }
      }
      if (this.opts.showEdges) {
        for (const e of model.edges.values()) {
          const isSel = sel && sel.edges.has(e.id);
          const isHover = hover && hover.edge === e.id;
          if (e.soft && !this.opts.showHidden && !isSel && !isHover) continue;
          let color = st.edge, width = 1.5, dash = 0;
          if (e.soft) { color = st.edgeSoft; dash = 3; width = 1.1; }
          if (model.eFaces.get(e.id).size === 0) width = 1.7;
          if (isHover) { color = st.hover; width = 2.6; }
          if (isSel) { color = st.sel; width = 2.4; }
          lines.push({ a: model.P(e.a).slice(), b: model.P(e.b).slice(), color, width, dash });
        }
      }
      if (extra) lines.push(...extra);
      for (const l of lines) {
        const c = hex(l.color || st.edge, l.alpha);
        l.rgb = [c[0] * 255, c[1] * 255, c[2] * 255];
        l.a8 = c[3];
        l.pk = pack(l.rgb[0], l.rgb[1], l.rgb[2]);
      }
      this.lines = lines;
    }

    /* ---------- dibujo ---------- */

    render(camera) {
      if (!this.W) return;
      this.cam = camera;
      this.persp = camera.persp;
      this._background();
      this.depth.fill(0);
      const st = this.style;
      const sc = hex(st.sel), hc = hex(st.hover);
      this.selPk = pack(sc[0] * 255, sc[1] * 255, sc[2] * 255);
      this.selRgb = [sc[0] * 255, sc[1] * 255, sc[2] * 255];
      this.hovPk = pack(hc[0] * 255, hc[1] * 255, hc[2] * 255);
      for (const t of this.tris) this._triangle(t, false);
      for (const l of this.lines) this._line(l);
      for (const t of this.transTris) this._triangle(t, true);
      this.g.putImageData(this.img, 0, 0);
    }

    _background() {
      const key = this.W + 'x' + this.H + this.style.bgTop + this.style.bgBottom;
      if (this._bgKey !== key) {
        const top = hex(this.style.bgTop), bot = hex(this.style.bgBottom);
        this._bgRows = new Uint32Array(this.H);
        for (let y = 0; y < this.H; y++) {
          let t = 1 - y / Math.max(1, this.H - 1);
          t = t * t * (3 - 2 * t);
          this._bgRows[y] = pack((bot[0] + (top[0] - bot[0]) * t) * 255, (bot[1] + (top[1] - bot[1]) * t) * 255, (bot[2] + (top[2] - bot[2]) * t) * 255);
        }
        this._bgKey = key;
      }
      const c = this.color32, W = this.W;
      for (let y = 0; y < this.H; y++) c.fill(this._bgRows[y], y * W, (y + 1) * W);
    }

    // Mundo → recorte. Devuelve [x, y, z, w].
    _clip(p) { return M4.apply4(this.cam.vp, p); }

    // Recorte del polígono contra el plano cercano (z + w >= 0).
    _clipNear(poly) {
      const out = [];
      for (let i = 0; i < poly.length; i++) {
        const a = poly[i], b = poly[(i + 1) % poly.length];
        const da = a[2] + a[3], db = b[2] + b[3];
        if (da >= 0) out.push(a);
        if ((da >= 0) !== (db >= 0)) {
          const t = da / (da - db);
          out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t, a[3] + (b[3] - a[3]) * t]);
        }
      }
      return out;
    }

    // Recorte → pantalla: [x, y, profundidad]. Profundidad mayor = más cerca.
    _screen(c) {
      const w = c[3];
      const x = (c[0] / w * 0.5 + 0.5) * this.W;
      const y = (0.5 - c[1] / w * 0.5) * this.H;
      const d = this.persp ? 1 / w : 1 - (c[2] / w * 0.5 + 0.5);
      return [x, y, d];
    }

    _triangle(t, blend) {
      const poly = this._clipNear([this._clip(t.a), this._clip(t.b), this._clip(t.c)]);
      if (poly.length < 3) return;
      const s = poly.map((c) => this._screen(c));
      let area = 0;
      for (let i = 0; i < s.length; i++) { const a = s[i], b = s[(i + 1) % s.length]; area += a[0] * b[1] - b[0] * a[1]; }
      if (Math.abs(area) < 1e-9) return;
      const front = area < 0; // en pantalla la Y va hacia abajo: antihorario en el mundo sale horario
      const pk = front ? t.fpk : t.bpk;
      const rgb = front ? t.fc : t.bc;
      const alpha = blend ? t.alpha : 1;
      const flag = t.flag;
      const c32 = this.color32, dep = this.depth, W = this.W;
      const selPk = this.selPk, hovPk = this.hovPk, selRgb = this.selRgb;
      this._fillConvex(s, (x, y, i, d) => {
        if (d <= dep[i]) return;
        let px = pk, r = rgb[0], g = rgb[1], b = rgb[2];
        if (flag & 1) {
          if (((x + y) & 3) === 0) { px = selPk; r = selRgb[0]; g = selRgb[1]; b = selRgb[2]; }
          else { r = r * 0.9 + selRgb[0] * 0.1; g = g * 0.9 + selRgb[1] * 0.1; b = b * 0.9 + selRgb[2] * 0.1; px = pack(r, g, b); }
        } else if ((flag & 2) && x % 3 === 0 && y % 3 === 0) { px = hovPk; }
        if (!blend) { dep[i] = d; c32[i] = px; return; }
        const o = c32[i];
        const or = o & 255, og = (o >>> 8) & 255, ob = (o >>> 16) & 255;
        c32[i] = pack(or + (r - or) * alpha, og + (g - og) * alpha, ob + (b - ob) * alpha);
      }, W);
    }

    _line(l) {
      let c0 = this._clip(l.a), c1 = this._clip(l.b);
      const d0 = c0[2] + c0[3], d1 = c1[2] + c1[3];
      if (d0 < 0 && d1 < 0) return;
      if (d0 < 0) { const t = d0 / (d0 - d1); c0 = c0.map((v, i) => v + (c1[i] - v) * t); }
      if (d1 < 0) { const t = d1 / (d1 - d0); c1 = c1.map((v, i) => v + (c0[i] - v) * t); }
      const s0 = this._screen(c0), s1 = this._screen(c1);
      const dx = s1[0] - s0[0], dy = s1[1] - s0[1];
      const len = Math.hypot(dx, dy);
      if (len < 1e-6) return;
      const ux = dx / len, uy = dy / len, nx = -uy, ny = ux;
      const hw = Math.max(0.6, (l.width || 1.5) / 2), ext = hw * 0.35;
      const quad = [
        [s0[0] - ux * ext + nx * hw, s0[1] - uy * ext + ny * hw, s0[2]],
        [s0[0] - ux * ext - nx * hw, s0[1] - uy * ext - ny * hw, s0[2]],
        [s1[0] + ux * ext - nx * hw, s1[1] + uy * ext - ny * hw, s1[2]],
        [s1[0] + ux * ext + nx * hw, s1[1] + uy * ext + ny * hw, s1[2]]
      ];
      const dash = l.dash || 0;
      const persp = this.persp;
      const c32 = this.color32, dep = this.depth;
      const pk = l.pk, a8 = l.a8, rgb = l.rgb;
      this._fillConvex(quad, (x, y, i, d) => {
        const ok = persp ? d * (1 + LINE_BIAS_PERSP) >= dep[i] : d + LINE_BIAS_ORTHO >= dep[i];
        if (!ok) return;
        if (dash > 0) {
          const along = (x + 0.5 - s0[0]) * ux + (y + 0.5 - s0[1]) * uy;
          if (((along % (dash * 2)) + dash * 2) % (dash * 2) > dash) return;
        }
        if (a8 >= 0.999) { c32[i] = pk; return; }
        const o = c32[i];
        const or = o & 255, og = (o >>> 8) & 255, ob = (o >>> 16) & 255;
        c32[i] = pack(or + (rgb[0] - or) * a8, og + (rgb[1] - og) * a8, ob + (rgb[2] - ob) * a8);
      }, this.W);
    }

    // Relleno de un polígono convexo por líneas de barrido, con profundidad plana interpolada.
    _fillConvex(pts, pixel, W) {
      const H = this.H;
      // plano de profundidad d = A x + B y + C a partir de tres puntos no alineados
      let A = 0, B = 0, C = pts[0][2];
      const p0 = pts[0];
      for (let k = 2; k < pts.length; k++) {
        const p1 = pts[1], p2 = pts[k];
        const den = (p1[0] - p0[0]) * (p2[1] - p0[1]) - (p2[0] - p0[0]) * (p1[1] - p0[1]);
        if (Math.abs(den) < 1e-9) continue;
        A = ((p1[2] - p0[2]) * (p2[1] - p0[1]) - (p2[2] - p0[2]) * (p1[1] - p0[1])) / den;
        B = ((p1[0] - p0[0]) * (p2[2] - p0[2]) - (p2[0] - p0[0]) * (p1[2] - p0[2])) / den;
        C = p0[2] - A * p0[0] - B * p0[1];
        break;
      }
      let minY = Infinity, maxY = -Infinity;
      for (const p of pts) { if (p[1] < minY) minY = p[1]; if (p[1] > maxY) maxY = p[1]; }
      const y0 = Math.max(0, Math.ceil(minY - 0.5)), y1 = Math.min(H - 1, Math.floor(maxY - 0.5));
      const n = pts.length;
      for (let y = y0; y <= y1; y++) {
        const py = y + 0.5;
        let xl = Infinity, xr = -Infinity;
        for (let k = 0; k < n; k++) {
          const a = pts[k], b = pts[(k + 1) % n];
          if ((a[1] <= py && b[1] > py) || (b[1] <= py && a[1] > py)) {
            const x = a[0] + (py - a[1]) * (b[0] - a[0]) / (b[1] - a[1]);
            if (x < xl) xl = x;
            if (x > xr) xr = x;
          }
        }
        if (xl > xr) continue;
        const xa = Math.max(0, Math.ceil(xl - 0.5)), xb = Math.min(W - 1, Math.floor(xr - 0.5));
        let d = A * (xa + 0.5) + B * py + C;
        let i = y * W + xa;
        for (let x = xa; x <= xb; x++, i++, d += A) pixel(x, y, i, d);
      }
    }
  }

  D.SoftRenderer = SoftRenderer;

  // ¿Qué renderizador usar? Por defecto el seguro (incidencia 0x135, ver docs/).
  // «?acelerado» en la dirección o la opción de Estilos activan WebGL; «?seguro» lo fuerza.
  D.graphicsMode = function () {
    const q = (root.location ? root.location.search + root.location.hash : '').toLowerCase();
    if (q.includes('seguro')) return 'software';
    if (q.includes('acelerado')) return 'webgl';
    try { if (root.localStorage && root.localStorage.getItem('dedalo.graphics') === 'webgl') return 'webgl'; } catch (e) { /* sin almacenamiento */ }
    return 'software';
  };
  D.setGraphicsMode = function (mode) {
    try { root.localStorage.setItem('dedalo.graphics', mode === 'webgl' ? 'webgl' : 'software'); return true; }
    catch (e) { return false; }
  };
})(typeof window !== 'undefined' ? window : globalThis);
