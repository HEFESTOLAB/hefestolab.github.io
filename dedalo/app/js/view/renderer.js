/*
 * Dédalo — renderizador WebGL2 propio.
 *  - Caras con color delantero y trasero distinto (para ver caras invertidas).
 *  - Aristas como cuadriláteros en pantalla (grosor real en píxeles, con trazo discontinuo).
 *  - Selección con trama de puntos; caras suavizadas a través de aristas suaves.
 */
(function (root) {
  'use strict';
  const D = root.DEDALO;
  const { V } = D;

  const FACE_VS = `#version 300 es
  layout(location=0) in vec3 aPos;
  layout(location=1) in vec3 aNor;
  layout(location=2) in vec4 aCol;
  layout(location=3) in vec3 aBack;
  layout(location=4) in float aFlag;
  uniform mat4 uVP;
  out vec3 vNor; out vec4 vCol; out vec3 vBack; out float vFlag;
  void main() {
    vNor = aNor; vCol = aCol; vBack = aBack; vFlag = aFlag;
    gl_Position = uVP * vec4(aPos, 1.0);
  }`;

  const FACE_FS = `#version 300 es
  precision highp float;
  in vec3 vNor; in vec4 vCol; in vec3 vBack; in float vFlag;
  uniform vec3 uLight; uniform vec3 uSel; uniform vec3 uHover; uniform float uAlpha;
  out vec4 o;
  void main() {
    vec3 n = normalize(vNor);
    vec3 base = vCol.rgb; float a = vCol.a;
    if (!gl_FrontFacing) { n = -n; base = vBack; a = 1.0; }
    float diff = max(dot(n, uLight), 0.0);
    float fill = max(dot(n, normalize(vec3(-0.5, -0.7, 0.25))), 0.0);
    float sky = 0.5 + 0.5 * n.z;
    vec3 c = base * (0.60 + 0.32 * diff + 0.06 * fill + 0.06 * sky);
    int flag = int(vFlag + 0.5);
    ivec2 fc = ivec2(gl_FragCoord.xy);
    if ((flag & 1) != 0) {
      if (((fc.x + fc.y) % 4) == 0) c = uSel; else c = mix(c, uSel, 0.10);
    } else if ((flag & 2) != 0) {
      if ((fc.x % 3) == 0 && (fc.y % 3) == 0) c = uHover; else c = mix(c, uHover, 0.06);
    }
    o = vec4(c, a * uAlpha);
  }`;

  const LINE_VS = `#version 300 es
  layout(location=0) in vec2 aCorner;
  layout(location=1) in vec3 aP0;
  layout(location=2) in vec3 aP1;
  layout(location=3) in vec4 aCol;
  layout(location=4) in float aWidth;
  layout(location=5) in float aDash;
  uniform mat4 uVP; uniform vec2 uViewport;
  out vec4 vCol; flat out vec2 vS0; flat out vec2 vDir; flat out float vDash;
  void main() {
    vec4 c0 = uVP * vec4(aP0, 1.0);
    vec4 c1 = uVP * vec4(aP1, 1.0);
    float d0 = c0.z + c0.w, d1 = c1.z + c1.w;
    if (d0 < 0.0 && d1 < 0.0) { gl_Position = vec4(3.0, 3.0, 3.0, 1.0); vCol = vec4(0.0); vS0 = vec2(0.0); vDir = vec2(1.0, 0.0); vDash = 0.0; return; }
    if (d0 < 0.0) c0 = mix(c0, c1, d0 / (d0 - d1));
    if (d1 < 0.0) c1 = mix(c1, c0, d1 / (d1 - d0));
    vec2 s0 = c0.xy / c0.w * 0.5 * uViewport;
    vec2 s1 = c1.xy / c1.w * 0.5 * uViewport;
    vec2 dir = s1 - s0; float L = length(dir);
    dir = L > 1e-6 ? dir / L : vec2(1.0, 0.0);
    vec2 nrm = vec2(-dir.y, dir.x);
    vec4 c = mix(c0, c1, aCorner.x);
    vec2 off = nrm * aCorner.y * aWidth * 0.5 + dir * (aCorner.x * 2.0 - 1.0) * aWidth * 0.35;
    c.xy += off / (0.5 * uViewport) * c.w;
    gl_Position = c;
    vCol = aCol; vS0 = s0 + 0.5 * uViewport; vDir = dir; vDash = aDash;
  }`;

  const LINE_FS = `#version 300 es
  precision highp float;
  in vec4 vCol; flat in vec2 vS0; flat in vec2 vDir; flat in float vDash;
  out vec4 o;
  void main() {
    if (vDash > 0.5) {
      float along = dot(gl_FragCoord.xy - vS0, vDir);
      if (mod(along, vDash * 2.0) > vDash) discard;
    }
    o = vCol;
  }`;

  const BG_VS = `#version 300 es
  out vec2 vUv;
  void main() {
    vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
    vUv = p;
    gl_Position = vec4(p * 2.0 - 1.0, 0.999, 1.0);
  }`;
  const BG_FS = `#version 300 es
  precision highp float;
  in vec2 vUv; uniform vec3 uTop; uniform vec3 uBottom; uniform float uHorizon;
  out vec4 o;
  void main() {
    float t = clamp(vUv.y, 0.0, 1.0);
    vec3 c = mix(uBottom, uTop, smoothstep(0.0, 1.0, t));
    o = vec4(c, 1.0);
  }`;

  function hex(c, a) {
    if (Array.isArray(c)) return c.length === 4 ? c : [c[0], c[1], c[2], a === undefined ? 1 : a];
    const s = c.replace('#', '');
    const n = parseInt(s.length === 3 ? s.split('').map((x) => x + x).join('') : s, 16);
    return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255, a === undefined ? 1 : a];
  }

  const STYLE = {
    bgTop: '#d9e3ea', bgBottom: '#f4f1eb',
    front: '#f6f3ec', back: '#a3b0c2',
    edge: '#1c1e21', edgeSoft: '#8a8f96',
    sel: '#1f5fe0', hover: '#e06a1f',
    axisX: '#d4463c', axisY: '#2f9a4a', axisZ: '#3a5fd4',
    guide: '#6b6f76'
  };

  class Renderer {
    constructor(canvas) {
      this.canvas = canvas;
      const gl = canvas.getContext('webgl2', { antialias: true, alpha: false, preserveDrawingBuffer: true, premultipliedAlpha: false });
      if (!gl) throw new Error('Este navegador no tiene WebGL2.');
      this.gl = gl;
      this.dpr = 1;
      this.style = Object.assign({}, STYLE);
      this.opts = { xray: false, showAxes: true, showGuides: true, showEdges: true, showHidden: false, monochrome: false };
      this.faceProg = this._program(FACE_VS, FACE_FS);
      this.lineProg = this._program(LINE_VS, LINE_FS);
      this.bgProg = this._program(BG_VS, BG_FS);

      this.faceVAO = gl.createVertexArray();
      this.faceBuf = gl.createBuffer();
      gl.bindVertexArray(this.faceVAO);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.faceBuf);
      const FS = 14 * 4;
      gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, FS, 0);
      gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 3, gl.FLOAT, false, FS, 12);
      gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 4, gl.FLOAT, false, FS, 24);
      gl.enableVertexAttribArray(3); gl.vertexAttribPointer(3, 3, gl.FLOAT, false, FS, 40);
      gl.enableVertexAttribArray(4); gl.vertexAttribPointer(4, 1, gl.FLOAT, false, FS, 52);
      this.faceCount = 0;
      this.transCount = 0; this.transStart = 0;

      this.quadBuf = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, this.quadBuf);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, -1, 1, -1, 1, 1, 0, -1, 1, 1, 0, 1]), gl.STATIC_DRAW);
      this.lineVAO = gl.createVertexArray();
      this.lineBuf = gl.createBuffer();
      gl.bindVertexArray(this.lineVAO);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.quadBuf);
      gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 8, 0);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.lineBuf);
      const LS = 12 * 4;
      gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 3, gl.FLOAT, false, LS, 0); gl.vertexAttribDivisor(1, 1);
      gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 3, gl.FLOAT, false, LS, 12); gl.vertexAttribDivisor(2, 1);
      gl.enableVertexAttribArray(3); gl.vertexAttribPointer(3, 4, gl.FLOAT, false, LS, 24); gl.vertexAttribDivisor(3, 1);
      gl.enableVertexAttribArray(4); gl.vertexAttribPointer(4, 1, gl.FLOAT, false, LS, 40); gl.vertexAttribDivisor(4, 1);
      gl.enableVertexAttribArray(5); gl.vertexAttribPointer(5, 1, gl.FLOAT, false, LS, 44); gl.vertexAttribDivisor(5, 1);
      gl.bindVertexArray(null);
      this.lineData = new Float32Array(0);
      this.lineCount = 0;
      this.bgVAO = gl.createVertexArray();
      this._meshKey = null;
    }

    _program(vs, fs) {
      const gl = this.gl;
      const mk = (type, src) => {
        const s = gl.createShader(type);
        gl.shaderSource(s, src);
        gl.compileShader(s);
        if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error('Sombreador: ' + gl.getShaderInfoLog(s));
        return s;
      };
      const p = gl.createProgram();
      gl.attachShader(p, mk(gl.VERTEX_SHADER, vs));
      gl.attachShader(p, mk(gl.FRAGMENT_SHADER, fs));
      gl.linkProgram(p);
      if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error('Programa: ' + gl.getProgramInfoLog(p));
      const u = {};
      const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
      for (let i = 0; i < n; i++) { const info = gl.getActiveUniform(p, i); u[info.name] = gl.getUniformLocation(p, info.name); }
      return { p, u };
    }

    resize(w, h, dpr) {
      this.dpr = dpr;
      const W = Math.max(1, Math.round(w * dpr)), H = Math.max(1, Math.round(h * dpr));
      if (this.canvas.width !== W || this.canvas.height !== H) { this.canvas.width = W; this.canvas.height = H; }
      this.cssW = w; this.cssH = h;
    }

    /* ---------- malla de caras ---------- */

    buildFaces(model, sel, hover) {
      const st = this.style;
      const front = hex(st.front), back = hex(st.back);
      // grupos de suavizado: caras unidas por aristas suaves
      const parent = new Map();
      const find = (x) => { while (parent.get(x) !== x) { parent.set(x, parent.get(parent.get(x))); x = parent.get(x); } return x; };
      for (const fid of model.faces.keys()) parent.set(fid, fid);
      for (const e of model.edges.values()) {
        if (!e.soft) continue;
        const fs = [...model.eFaces.get(e.id)];
        for (let i = 1; i < fs.length; i++) { const a = find(fs[0]), b = find(fs[i]); if (a !== b) parent.set(a, b); }
      }
      const vn = new Map();
      const gsize = new Map();
      for (const fid of model.faces.keys()) { const g = find(fid); gsize.set(g, (gsize.get(g) || 0) + 1); }
      for (const f of model.faces.values()) {
        const g = find(f.id);
        const area = Math.max(1e-9, model.faceArea(f.id));
        for (const v of model.faceVerts(f)) {
          const k = g + '|' + v;
          const cur = vn.get(k) || [0, 0, 0];
          vn.set(k, V.add(cur, V.scale(f.n, area)));
        }
      }
      const opaque = [], trans = [];
      const xray = this.opts.xray;
      for (const f of model.faces.values()) {
        const mat = f.mat ? model.materials.get(f.mat) : null;
        let col = mat ? hex(mat.color, mat.opacity === undefined ? 1 : mat.opacity) : front;
        if (this.opts.monochrome) col = front;
        let flag = 0;
        if (sel && sel.faces.has(f.id)) flag |= 1;
        if (hover && hover.face === f.id) flag |= 2;
        const g = find(f.id);
        const smooth = gsize.get(g) > 1;
        const out = (col[3] < 0.999 || xray) ? trans : opaque;
        for (const tri of model.faceTriangles(f.id)) {
          const vertices = [];
          for (const v of tri) {
            const p = model.P(v);
            let nrm = f.n;
            if (smooth) { const s = vn.get(g + '|' + v); if (s) { const nn = V.norm(s); if (V.dot(nn, f.n) > 0.2) nrm = nn; } }
            vertices.push([p[0], p[1], p[2], nrm[0], nrm[1], nrm[2], col[0], col[1], col[2], col[3], back[0], back[1], back[2], flag]);
          }
          const clipped = D.SectionBox ? D.SectionBox.polygon(this.opts.sectionBox, vertices) : vertices;
          for (let i = 1; i < clipped.length - 1; i++) for (const v of [clipped[0], clipped[i], clipped[i+1]]) out.push(...v);
        }
      }
      const all = new Float32Array(opaque.length + trans.length);
      all.set(opaque, 0); all.set(trans, opaque.length);
      const gl = this.gl;
      gl.bindBuffer(gl.ARRAY_BUFFER, this.faceBuf);
      gl.bufferData(gl.ARRAY_BUFFER, all, gl.DYNAMIC_DRAW);
      this.faceCount = opaque.length / 14;
      this.transStart = this.faceCount;
      this.transCount = trans.length / 14;
    }

    /* ---------- líneas ---------- */

    // lines: [{a, b, color, width, dash}]
    setLines(lines) {
      const n = lines.length;
      if (this.lineData.length < n * 12) this.lineData = new Float32Array(Math.max(n * 12, this.lineData.length * 2));
      const d = this.lineData;
      let i = 0;
      for (const l of lines) {
        const c = l.rgba || hex(l.color || this.style.edge, l.alpha);
        d[i++] = l.a[0]; d[i++] = l.a[1]; d[i++] = l.a[2];
        d[i++] = l.b[0]; d[i++] = l.b[1]; d[i++] = l.b[2];
        d[i++] = c[0]; d[i++] = c[1]; d[i++] = c[2]; d[i++] = c[3];
        d[i++] = (l.width || 1.5) * this.dpr; d[i++] = (l.dash || 0) * this.dpr;
      }
      const gl = this.gl;
      gl.bindBuffer(gl.ARRAY_BUFFER, this.lineBuf);
      gl.bufferData(gl.ARRAY_BUFFER, d.subarray(0, n * 12), gl.DYNAMIC_DRAW);
      this.lineCount = n;
    }

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
          if (a.kind === 'guideLine') {
            const s = sel && sel.annots.has(a.id);
            lines.push({ a: V.add(a.p, V.scale(a.dir, -R)), b: V.add(a.p, V.scale(a.dir, R)), color: s ? st.sel : st.guide, width: s ? 1.6 : 1.1, dash: 5, alpha: 0.85 });
          }
        }
      }
      if (this.opts.showEdges) {
        for (const e of model.edges.values()) {
          const isSel = sel && sel.edges.has(e.id);
          const isHover = hover && hover.edge === e.id;
          if (e.soft && !this.opts.showHidden && !isSel && !isHover) continue;
          const a = model.P(e.a), b = model.P(e.b);
          let color = st.edge, width = 1.5, dash = 0;
          if (e.soft) { color = st.edgeSoft; dash = 3; width = 1.1; }
          if (model.eFaces.get(e.id).size === 0) width = 1.7;
          if (isHover) { color = st.hover; width = 2.6; }
          if (isSel) { color = st.sel; width = 2.4; }
          lines.push({ a, b, color, width, dash });
        }
      }
      if (extra) lines.push(...extra);
      this.setLines(D.SectionBox ? D.SectionBox.lines(this.opts.sectionBox, lines) : lines);
    }

    /* ---------- dibujo ---------- */

    render(camera) {
      const gl = this.gl;
      const W = this.canvas.width, H = this.canvas.height;
      gl.viewport(0, 0, W, H);
      gl.clearColor(1, 1, 1, 1);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      // fondo
      gl.disable(gl.DEPTH_TEST);
      gl.useProgram(this.bgProg.p);
      gl.uniform3fv(this.bgProg.u.uTop, hex(this.style.bgTop).slice(0, 3));
      gl.uniform3fv(this.bgProg.u.uBottom, hex(this.style.bgBottom).slice(0, 3));
      gl.bindVertexArray(this.bgVAO);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      gl.enable(gl.DEPTH_TEST);
      gl.depthFunc(gl.LEQUAL);
      const vp = new Float32Array(camera.vp);
      // caras opacas
      gl.useProgram(this.faceProg.p);
      gl.uniformMatrix4fv(this.faceProg.u.uVP, false, vp);
      const L = V.norm([0.35, -0.55, 0.76]);
      gl.uniform3fv(this.faceProg.u.uLight, L);
      gl.uniform3fv(this.faceProg.u.uSel, hex(this.style.sel).slice(0, 3));
      gl.uniform3fv(this.faceProg.u.uHover, hex(this.style.hover).slice(0, 3));
      gl.uniform1f(this.faceProg.u.uAlpha, 1);
      gl.enable(gl.POLYGON_OFFSET_FILL);
      gl.polygonOffset(1.0, 2.0);
      gl.bindVertexArray(this.faceVAO);
      if (this.faceCount) gl.drawArrays(gl.TRIANGLES, 0, this.faceCount);
      // líneas
      gl.disable(gl.POLYGON_OFFSET_FILL);
      gl.useProgram(this.lineProg.p);
      gl.uniformMatrix4fv(this.lineProg.u.uVP, false, vp);
      gl.uniform2f(this.lineProg.u.uViewport, W, H);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      gl.bindVertexArray(this.lineVAO);
      if (this.lineCount) gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, this.lineCount);
      // caras transparentes (rayos X o materiales translúcidos)
      if (this.transCount) {
        gl.useProgram(this.faceProg.p);
        gl.uniform1f(this.faceProg.u.uAlpha, this.opts.xray ? 0.45 : 1);
        gl.depthMask(false);
        gl.enable(gl.POLYGON_OFFSET_FILL);
        gl.bindVertexArray(this.faceVAO);
        gl.drawArrays(gl.TRIANGLES, this.transStart, this.transCount);
        gl.depthMask(true);
        gl.disable(gl.POLYGON_OFFSET_FILL);
      }
      gl.disable(gl.BLEND);
      gl.bindVertexArray(null);
    }
  }

  D.Renderer = Renderer;
  D.hexColor = hex;
  D.STYLE = STYLE;
})(typeof window !== 'undefined' ? window : globalThis);
