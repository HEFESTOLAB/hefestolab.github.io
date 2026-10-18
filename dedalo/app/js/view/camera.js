/*
 * Dédalo — cámara orbital con Z hacia arriba.
 */
(function (root) {
  'use strict';
  const D = root.DEDALO;
  const { V, M4 } = D;

  class Camera {
    constructor() {
      this.target = [0, 0, 0];
      this.dist = 18;
      this.yaw = -1.15;      // ángulo alrededor de Z (radianes)
      this.pitch = 0.42;     // elevación
      this.fov = 35 * Math.PI / 180;
      this.persp = true;
      this.w = 800; this.h = 600;
      this.sceneRadius = 10;
      this.update();
    }

    setSize(w, h) { this.w = Math.max(1, w); this.h = Math.max(1, h); this.update(); }

    eye() {
      const cp = Math.cos(this.pitch);
      return V.add(this.target, V.scale([cp * Math.cos(this.yaw), cp * Math.sin(this.yaw), Math.sin(this.pitch)], this.dist));
    }
    forward() { return V.norm(V.sub(this.target, this.eye())); }

    update() {
      const eye = this.eye();
      let up = [0, 0, 1];
      if (Math.abs(Math.cos(this.pitch)) < 1e-6) up = [-Math.cos(this.yaw), -Math.sin(this.yaw), 0];
      this.viewM = M4.lookAt(eye, this.target, up);
      const near = Math.max(0.002, this.dist * 0.002);
      const far = Math.max(this.dist * 400, this.sceneRadius * 20 + this.dist * 4);
      const aspect = this.w / this.h;
      if (this.persp) this.projM = M4.perspective(this.fov, aspect, near, far);
      else {
        const hh = this.dist * Math.tan(this.fov / 2);
        this.projM = M4.ortho(-hh * aspect, hh * aspect, -hh, hh, -far, far);
      }
      this.vp = M4.multiply(this.projM, this.viewM);
      this.ivp = M4.invert(this.vp);
      this._eye = eye;
      this.right = V.norm([this.viewM[0], this.viewM[4], this.viewM[8]]);
      this.up = V.norm([this.viewM[1], this.viewM[5], this.viewM[9]]);
    }

    // Mundo → pantalla (px CSS). z: profundidad NDC; behind: detrás de la cámara.
    project(p) {
      const c = M4.apply4(this.vp, p);
      const w = c[3];
      return { x: (c[0] / w * 0.5 + 0.5) * this.w, y: (1 - (c[1] / w * 0.5 + 0.5)) * this.h, z: c[2] / w, w, behind: w <= 1e-9 };
    }

    // Rayo por un píxel: { o, d } (d unitario).
    ray(x, y) {
      const nx = (x / this.w) * 2 - 1, ny = 1 - (y / this.h) * 2;
      const a = M4.apply(this.ivp, [nx, ny, -1]);
      const b = M4.apply(this.ivp, [nx, ny, 1]);
      return { o: a, d: V.norm(V.sub(b, a)) };
    }

    // Tamaño en metros de un píxel a la distancia del punto p.
    pixelSize(p) {
      if (!this.persp) return (2 * this.dist * Math.tan(this.fov / 2)) / this.h;
      const depth = Math.max(1e-6, V.dot(V.sub(p, this._eye), this.forward()));
      return (2 * depth * Math.tan(this.fov / 2)) / this.h;
    }

    // Orbitar alrededor de un pivote (por defecto el objetivo).
    orbit(dx, dy, pivot) {
      const k = 0.0075;
      const dyaw = -dx * k;
      let dpitch = dy * k;
      const np = Math.max(-Math.PI / 2 + 0.001, Math.min(Math.PI / 2 - 0.001, this.pitch + dpitch));
      dpitch = np - this.pitch;
      if (!pivot) { this.yaw += dyaw; this.pitch = np; this.update(); return; }
      const eye = this.eye();
      const right = this.right;
      let e = V.rotate(eye, pivot, [0, 0, 1], dyaw);
      let t = V.rotate(this.target, pivot, [0, 0, 1], dyaw);
      const r2 = V.rotate(right, [0, 0, 0], [0, 0, 1], dyaw);
      e = V.rotate(e, pivot, r2, -dpitch);
      t = V.rotate(t, pivot, r2, -dpitch);
      this._setEyeTarget(e, t);
    }

    _setEyeTarget(e, t) {
      const d = V.sub(e, t);
      this.dist = Math.max(1e-4, V.len(d));
      this.target = t;
      this.pitch = Math.asin(Math.max(-1, Math.min(1, d[2] / this.dist)));
      this.yaw = Math.atan2(d[1], d[0]);
      this.update();
    }

    // Desplazar la vista: el punto `anchor` sigue al ratón.
    pan(dx, dy, anchor) {
      const ps = this.pixelSize(anchor || this.target);
      const mv = V.add(V.scale(this.right, -dx * ps), V.scale(this.up, dy * ps));
      this.target = V.add(this.target, mv);
      this.update();
    }

    // Acercar (factor < 1) o alejar hacia un punto que queda fijo en pantalla.
    zoomAt(factor, point) {
      const e = this.eye();
      if (!point) point = this.target;
      const ne = V.add(point, V.scale(V.sub(e, point), factor));
      const nt = V.add(point, V.scale(V.sub(this.target, point), factor));
      if (V.dist(ne, nt) < 1e-4) return;
      this._setEyeTarget(ne, nt);
    }

    fit(bbox, keepAngles) {
      if (!bbox) { this.target = [0, 0, 0]; this.dist = 18; this.update(); return; }
      const c = V.mid(bbox.min, bbox.max);
      const r = Math.max(0.5, V.dist(bbox.min, bbox.max) / 2);
      this.target = c;
      const aspect = this.w / this.h;
      const half = Math.min(this.fov / 2, Math.atan(Math.tan(this.fov / 2) * aspect));
      this.dist = (r / Math.sin(half)) * 1.08;
      this.sceneRadius = Math.max(this.sceneRadius, r);
      void keepAngles;
      this.update();
    }

    setView(name) {
      const views = {
        iso: [-1.15, 0.42], top: [-Math.PI / 2, Math.PI / 2 - 0.0005], bottom: [-Math.PI / 2, -Math.PI / 2 + 0.0005],
        front: [-Math.PI / 2, 0], back: [Math.PI / 2, 0], right: [0, 0], left: [Math.PI, 0]
      };
      const v = views[name];
      if (!v) return;
      this.yaw = v[0]; this.pitch = v[1];
      this.update();
    }

    toJSON() { return { target: this.target, dist: this.dist, yaw: this.yaw, pitch: this.pitch, persp: this.persp }; }
    load(j) { if (!j) return; Object.assign(this, { target: j.target, dist: j.dist, yaw: j.yaw, pitch: j.pitch, persp: j.persp !== false }); this.update(); }
  }

  D.Camera = Camera;
})(typeof window !== 'undefined' ? window : globalThis);
