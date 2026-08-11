/*
 * HEFESTOLAB · IFC Energy Model
 * geometry.js — Geometría mínima de IFC
 * ---------------------------------------------------------------------------
 * Sólo se resuelve lo que el modelo analítico necesita: emplazamientos,
 * perfiles, sólidos de extrusión, huellas en planta y envolventes. No se
 * teselan mallas: para un estudio energético basta con los contornos de los
 * espacios y los ejes y espesores de los cerramientos.
 */
(function (global) {
  'use strict';
  const HEM = (global.HEM = global.HEM || {});
  const S = HEM.step;
  const { tokRef, tokNum, tokStr, isList } = S;

  const EPS = 1e-7;

  /* ======================================================================
   * Álgebra 4x4 (fila mayor, vectores columna)
   * ==================================================================== */

  const IDENTITY = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];

  function matMul(a, b) {
    const o = new Array(16);
    for (let r = 0; r < 4; r++) {
      for (let c = 0; c < 4; c++) {
        o[r * 4 + c] = a[r * 4] * b[c] + a[r * 4 + 1] * b[4 + c] + a[r * 4 + 2] * b[8 + c] + a[r * 4 + 3] * b[12 + c];
      }
    }
    return o;
  }

  function applyPoint(m, p) {
    const x = p[0], y = p[1], z = p[2] || 0;
    return [
      m[0] * x + m[1] * y + m[2] * z + m[3],
      m[4] * x + m[5] * y + m[6] * z + m[7],
      m[8] * x + m[9] * y + m[10] * z + m[11]
    ];
  }

  function applyDir(m, d) {
    const x = d[0], y = d[1], z = d[2] || 0;
    return [
      m[0] * x + m[1] * y + m[2] * z,
      m[4] * x + m[5] * y + m[6] * z,
      m[8] * x + m[9] * y + m[10] * z
    ];
  }

  /** Inversa de una transformación rígida (rotación + traslación). */
  function invertRigid(m) {
    const r = [m[0], m[4], m[8], m[1], m[5], m[9], m[2], m[6], m[10]];
    const t = [m[3], m[7], m[11]];
    return [
      r[0], r[1], r[2], -(r[0] * t[0] + r[1] * t[1] + r[2] * t[2]),
      r[3], r[4], r[5], -(r[3] * t[0] + r[4] * t[1] + r[5] * t[2]),
      r[6], r[7], r[8], -(r[6] * t[0] + r[7] * t[1] + r[8] * t[2]),
      0, 0, 0, 1
    ];
  }

  function cross(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
  function dot(a, b) { return a[0] * b[0] + a[1] * b[1] + (a[2] || 0) * (b[2] || 0); }
  function norm(a) { const l = Math.hypot(a[0], a[1], a[2] || 0) || 1; return [a[0] / l, a[1] / l, (a[2] || 0) / l]; }

  function axisMatrix(origin, zAxis, xAxis) {
    const z = norm(zAxis || [0, 0, 1]);
    let x = xAxis ? [xAxis[0], xAxis[1], xAxis[2] || 0] : null;
    if (!x) x = Math.abs(z[2]) < 0.999 ? cross([0, 0, 1], z) : [1, 0, 0];
    // ortogonalizar X respecto a Z
    const d = dot(x, z);
    x = norm([x[0] - d * z[0], x[1] - d * z[1], x[2] - d * z[2]]);
    const y = cross(z, x);
    return [
      x[0], y[0], z[0], origin[0],
      x[1], y[1], z[1], origin[1],
      x[2], y[2], z[2], origin[2],
      0, 0, 0, 1
    ];
  }

  /* ======================================================================
   * Resolución de entidades geométricas
   * ==================================================================== */

  class Geo {
    constructor(model) {
      this.m = model;
      this._placement = new Map();
      this._lengthScale = detectLengthScale(model);
    }

    point(id) {
      const a = this.m.args(id);
      if (!a || !isList(a[0])) return [0, 0, 0];
      const c = a[0].v;
      return [tokNum(c[0]) || 0, tokNum(c[1]) || 0, c.length > 2 ? (tokNum(c[2]) || 0) : 0];
    }

    direction(id) {
      const a = this.m.args(id);
      if (!a || !isList(a[0])) return [0, 0, 1];
      const c = a[0].v;
      return [tokNum(c[0]) || 0, tokNum(c[1]) || 0, c.length > 2 ? (tokNum(c[2]) || 0) : 0];
    }

    /** IfcAxis2Placement2D/3D → matriz 4x4 */
    axisPlacement(id) {
      const ty = this.m.typeOf(id);
      const a = this.m.args(id);
      if (!a) return IDENTITY.slice();
      const origin = this.point(tokRef(a[0]));
      if (ty === 'IFCAXIS2PLACEMENT2D') {
        const ref = tokRef(a[1]) ? this.direction(tokRef(a[1])) : [1, 0, 0];
        return axisMatrix([origin[0], origin[1], 0], [0, 0, 1], [ref[0], ref[1], 0]);
      }
      const z = tokRef(a[1]) ? this.direction(tokRef(a[1])) : [0, 0, 1];
      const x = tokRef(a[2]) ? this.direction(tokRef(a[2])) : null;
      return axisMatrix(origin, z, x);
    }

    /** IfcObjectPlacement (cadena de IfcLocalPlacement) → matriz en coordenadas de proyecto */
    placement(id) {
      if (!id) return IDENTITY.slice();
      const hit = this._placement.get(id);
      if (hit) return hit;
      const ty = this.m.typeOf(id);
      let out = IDENTITY.slice();
      if (ty === 'IFCLOCALPLACEMENT') {
        const a = this.m.args(id);
        const parent = tokRef(a[0]);
        const rel = tokRef(a[1]);
        const local = rel ? this.axisPlacement(rel) : IDENTITY.slice();
        out = parent ? matMul(this.placement(parent), local) : local;
      } else if (ty === 'IFCGRIDPLACEMENT') {
        out = IDENTITY.slice();
      }
      this._placement.set(id, out);
      return out;
    }

    /** Operador de transformación cartesiana (IfcMappedItem) */
    transformOperator(id) {
      const a = this.m.args(id);
      if (!a) return IDENTITY.slice();
      const axis1 = tokRef(a[0]) ? this.direction(tokRef(a[0])) : [1, 0, 0];
      const axis2 = tokRef(a[1]) ? this.direction(tokRef(a[1])) : [0, 1, 0];
      const origin = tokRef(a[2]) ? this.point(tokRef(a[2])) : [0, 0, 0];
      const scale = tokNum(a[3]) != null ? tokNum(a[3]) : 1;
      const axis3 = tokRef(a[4]) ? this.direction(tokRef(a[4])) : cross(axis1, axis2);
      const m = axisMatrix(origin, axis3, axis1);
      if (scale !== 1) for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) m[r * 4 + c] *= scale;
      return m;
    }

    /* -------------------- curvas y perfiles -------------------- */

    /** Devuelve un anillo de puntos 2D a partir de cualquier curva cerrada. */
    curvePolygon(id, depth) {
      depth = depth || 0;
      if (depth > 6 || !id) return null;
      const ty = this.m.typeOf(id);
      const a = this.m.args(id);
      if (!a) return null;
      if (ty === 'IFCPOLYLINE') {
        const pts = (isList(a[0]) ? a[0].v : []).map(t => this.point(tokRef(t))).map(p => [p[0], p[1]]);
        return dedupeRing(pts);
      }
      if (ty === 'IFCCOMPOSITECURVE' || ty === 'IFCCOMPOSITECURVE2D') {
        const out = [];
        for (const seg of (isList(a[0]) ? a[0].v : [])) {
          const sa = this.m.args(tokRef(seg));
          if (!sa) continue;
          const sameSense = S.tokBool(sa[1]);
          const part = this.curvePolygon(tokRef(sa[2]), depth + 1);
          if (!part || !part.length) continue;
          const ordered = sameSense === false ? part.slice().reverse() : part;
          for (const p of ordered) {
            const last = out[out.length - 1];
            if (!last || Math.hypot(last[0] - p[0], last[1] - p[1]) > 1e-6) out.push(p);
          }
        }
        return dedupeRing(out);
      }
      if (ty === 'IFCTRIMMEDCURVE') {
        return this.trimmedCurve(id, depth);
      }
      if (ty === 'IFCINDEXEDPOLYCURVE') {
        const ptsId = tokRef(a[0]);
        const pa = this.m.args(ptsId);
        if (pa && isList(pa[0])) {
          const pts = pa[0].v.map(t => (isList(t) ? [tokNum(t.v[0]) || 0, tokNum(t.v[1]) || 0] : [0, 0]));
          return dedupeRing(pts);
        }
      }
      if (ty === 'IFCCIRCLE') {
        const pos = this.axisPlacement(tokRef(a[0]));
        const r = tokNum(a[1]) || 0;
        const pts = [];
        for (let i = 0; i < 32; i++) {
          const t = (i / 32) * Math.PI * 2;
          const p = applyPoint(pos, [r * Math.cos(t), r * Math.sin(t), 0]);
          pts.push([p[0], p[1]]);
        }
        return pts;
      }
      return null;
    }

    trimmedCurve(id, depth) {
      const a = this.m.args(id);
      const basis = tokRef(a[0]);
      const bty = this.m.typeOf(basis);
      const t1 = trimValue(a[1]);
      const t2 = trimValue(a[2]);
      const sense = S.tokBool(a[3]) !== false;
      if (bty === 'IFCCIRCLE') {
        const ba = this.m.args(basis);
        const pos = this.axisPlacement(tokRef(ba[0]));
        const r = tokNum(ba[1]) || 0;
        let a1 = (t1.angle != null ? t1.angle : 0) * Math.PI / 180;
        let a2 = (t2.angle != null ? t2.angle : 360) * Math.PI / 180;
        if (t1.point && t1.angle == null) a1 = 0;
        if (!sense) { const tmp = a1; a1 = a2; a2 = tmp; }
        let span = a2 - a1;
        while (span <= 0) span += Math.PI * 2;
        const steps = Math.max(3, Math.ceil(Math.abs(span) / (Math.PI / 12)));
        const pts = [];
        for (let i = 0; i <= steps; i++) {
          const t = a1 + span * (i / steps) * (sense ? 1 : 1);
          const p = applyPoint(pos, [r * Math.cos(t), r * Math.sin(t), 0]);
          pts.push([p[0], p[1]]);
        }
        return sense ? pts : pts.reverse();
      }
      if (bty === 'IFCLINE') {
        const p1 = t1.point, p2 = t2.point;
        if (p1 && p2) return [[p1[0], p1[1]], [p2[0], p2[1]]];
        const ba = this.m.args(basis);
        const org = this.point(tokRef(ba[0]));
        const va = this.m.args(tokRef(ba[1]));
        const dir = va ? this.direction(tokRef(va[0])) : [1, 0, 0];
        const mag = va ? (tokNum(va[1]) || 1) : 1;
        const s1 = t1.param != null ? t1.param : 0;
        const s2 = t2.param != null ? t2.param : 1;
        return [
          [org[0] + dir[0] * mag * s1, org[1] + dir[1] * mag * s1],
          [org[0] + dir[0] * mag * s2, org[1] + dir[1] * mag * s2]
        ];
      }
      return this.curvePolygon(basis, depth + 1);
    }

    /** IfcProfileDef → {outer:[[x,y]…], inners:[[…]]} en coordenadas del perfil */
    profile(id) {
      const ty = this.m.typeOf(id);
      const a = this.m.args(id);
      if (!a) return null;
      if (ty === 'IFCARBITRARYCLOSEDPROFILEDEF' || ty === 'IFCARBITRARYPROFILEDEFWITHVOIDS') {
        const outer = this.curvePolygon(tokRef(a[2]));
        if (!outer || outer.length < 3) return null;
        const inners = [];
        if (ty === 'IFCARBITRARYPROFILEDEFWITHVOIDS' && isList(a[3])) {
          for (const t of a[3].v) {
            const ring = this.curvePolygon(tokRef(t));
            if (ring && ring.length >= 3) inners.push(ring);
          }
        }
        return { outer, inners };
      }
      if (ty === 'IFCRECTANGLEPROFILEDEF' || ty === 'IFCROUNDEDRECTANGLEPROFILEDEF') {
        const pos = tokRef(a[2]) ? this.axisPlacement(tokRef(a[2])) : IDENTITY.slice();
        const x = (tokNum(a[3]) || 0) / 2, y = (tokNum(a[4]) || 0) / 2;
        const ring = [[-x, -y], [x, -y], [x, y], [-x, y]].map(p => {
          const q = applyPoint(pos, [p[0], p[1], 0]); return [q[0], q[1]];
        });
        return { outer: ring, inners: [] };
      }
      if (ty === 'IFCCIRCLEPROFILEDEF' || ty === 'IFCCIRCLEHOLLOWPROFILEDEF') {
        const pos = tokRef(a[2]) ? this.axisPlacement(tokRef(a[2])) : IDENTITY.slice();
        const r = tokNum(a[3]) || 0;
        const ring = [];
        for (let i = 0; i < 24; i++) {
          const t = (i / 24) * Math.PI * 2;
          const q = applyPoint(pos, [r * Math.cos(t), r * Math.sin(t), 0]);
          ring.push([q[0], q[1]]);
        }
        return { outer: ring, inners: [] };
      }
      if (ty === 'IFCDERIVEDPROFILEDEF') {
        const base = this.profile(tokRef(a[2]));
        if (!base) return null;
        const op = tokRef(a[3]) ? this.transformOperator(tokRef(a[3])) : IDENTITY.slice();
        const tr = ring => ring.map(p => { const q = applyPoint(op, [p[0], p[1], 0]); return [q[0], q[1]]; });
        return { outer: tr(base.outer), inners: base.inners.map(tr) };
      }
      if (ty === 'IFCCOMPOSITEPROFILEDEF' && isList(a[2])) {
        for (const t of a[2].v) { const p = this.profile(tokRef(t)); if (p) return p; }
      }
      return null;
    }

    /* -------------------- sólidos -------------------- */

    /**
     * Recorre una representación y devuelve los sólidos de extrusión hallados,
     * ya en coordenadas de proyecto.
     * @returns {Array<{outer, inners, base, top, dirZ, matrix}>}
     */
    extrusions(itemId, matrix, out, depth) {
      out = out || []; depth = depth || 0;
      if (depth > 8 || !itemId) return out;
      const ty = this.m.typeOf(itemId);
      const a = this.m.args(itemId);
      if (!a) return out;

      if (ty === 'IFCEXTRUDEDAREASOLID' || ty === 'IFCEXTRUDEDAREASOLIDTAPERED') {
        const prof = this.profile(tokRef(a[0]));
        if (!prof) return out;
        const pos = tokRef(a[1]) ? this.axisPlacement(tokRef(a[1])) : IDENTITY.slice();
        const dir = tokRef(a[2]) ? this.direction(tokRef(a[2])) : [0, 0, 1];
        const depthVal = tokNum(a[3]) || 0;
        const full = matMul(matrix, pos);
        const toWorld = ring => ring.map(p => applyPoint(full, [p[0], p[1], 0]));
        const bottom = toWorld(prof.outer);
        const dirW = applyDir(full, dir);
        const rise = dirW[2] * depthVal;
        const zs = bottom.map(p => p[2]);
        const zBase = Math.min(...zs);
        const zTop = Math.max(...zs);
        // Normal del plano en el que vive el perfil. En una cubierta inclinada
        // exportada desde Revit el perfil ES la cara inferior del faldón, de
        // modo que este plano es directamente el techo del recinto.
        const normal = norm(applyDir(full, [0, 0, 1]));
        out.push({
          outer: bottom.map(p => [p[0], p[1]]),
          outer3: bottom,
          inners: prof.inners.map(r => toWorld(r).map(p => [p[0], p[1]])),
          inners3: prof.inners.map(toWorld),
          base: Math.min(zBase, zBase + rise),
          top: Math.max(zTop, zTop + rise),
          height: Math.abs(rise),
          depth: depthVal,
          normal,
          planar: Math.abs(normal[2]) > 1e-6,
          vertical: Math.abs(Math.abs(dirW[2]) - 1) < 1e-3,
          tilted: Math.abs(Math.abs(normal[2]) - 1) > 1e-4,
          zSpread: zTop - zBase,
          rise
        });
        return out;
      }
      if (ty === 'IFCBOOLEANCLIPPINGRESULT' || ty === 'IFCBOOLEANRESULT') {
        return this.extrusions(tokRef(a[1]), matrix, out, depth + 1);
      }
      if (ty === 'IFCMAPPEDITEM') {
        const src = this.m.args(tokRef(a[0]));
        if (!src) return out;
        const origin = tokRef(src[0]) ? this.axisPlacement(tokRef(src[0])) : IDENTITY.slice();
        const target = tokRef(a[1]) ? this.transformOperator(tokRef(a[1])) : IDENTITY.slice();
        const next = matMul(matMul(matrix, target), origin);
        const rep = this.m.args(tokRef(src[1]));
        if (rep && isList(rep[3])) for (const t of rep[3].v) this.extrusions(tokRef(t), next, out, depth + 1);
        return out;
      }
      if (ty === 'IFCSHAPEREPRESENTATION' && isList(a[3])) {
        for (const t of a[3].v) this.extrusions(tokRef(t), matrix, out, depth + 1);
        return out;
      }
      return out;
    }

    /** Todas las extrusiones de un producto, filtrando por identificador de representación. */
    productExtrusions(productId, wanted) {
      const a = this.m.args(productId);
      if (!a) return [];
      const placement = this.placement(tokRef(a[5]));
      const shapeId = tokRef(a[6]);
      const shape = this.m.args(shapeId);
      if (!shape || !isList(shape[2])) return [];
      const out = [];
      for (const t of shape[2].v) {
        const rep = this.m.args(tokRef(t));
        if (!rep) continue;
        const ident = tokStr(rep[1]);
        if (wanted && ident !== wanted) continue;
        if (isList(rep[3])) for (const it of rep[3].v) this.extrusions(tokRef(it), placement, out, 0);
      }
      return out;
    }

    /** Eje 2D de un muro (representación «Axis»), en coordenadas de proyecto. */
    wallAxis(productId) {
      const a = this.m.args(productId);
      if (!a) return null;
      const placement = this.placement(tokRef(a[5]));
      const shape = this.m.args(tokRef(a[6]));
      if (!shape || !isList(shape[2])) return null;
      for (const t of shape[2].v) {
        const rep = this.m.args(tokRef(t));
        if (!rep || tokStr(rep[1]) !== 'Axis' || !isList(rep[3])) continue;
        for (const it of rep[3].v) {
          const poly = this.curvePolygon(tokRef(it));
          if (poly && poly.length >= 2) {
            return poly.map(p => { const q = applyPoint(placement, [p[0], p[1], 0]); return [q[0], q[1]]; });
          }
        }
      }
      return null;
    }

    /* -------------------- geometría teselada (IFC4) -------------------- */

    /** IfcCartesianPointList3D → array de puntos. */
    pointList(id) {
      const a = this.m.args(id);
      if (!a || !isList(a[0])) return [];
      return a[0].v.map(t => {
        if (!isList(t)) return [0, 0, 0];
        const c = t.v;
        return [tokNum(c[0]) || 0, tokNum(c[1]) || 0, tokNum(c[2]) || 0];
      });
    }

    /**
     * Caras de un producto con geometría teselada: IfcPolygonalFaceSet e
     * IfcTriangulatedFaceSet, que son las que emplea la vista de referencia de
     * IFC4 y, en particular, lo que exporta HEFESTO Pre-BIM Modeler.
     * @returns {Array<Array<Array<number>>>} caras en coordenadas de proyecto
     */
    productFaces(productId, limit) {
      const a = this.m.args(productId);
      if (!a || a.length < 7) return [];
      const placement = this.placement(tokRef(a[5]));
      const shape = this.m.args(tokRef(a[6]));
      if (!shape || !isList(shape[2])) return [];
      const out = [];
      const cap = limit || 40000;
      for (const t of shape[2].v) {
        const rep = this.m.args(tokRef(t));
        if (!rep || !isList(rep[3])) continue;
        for (const it of rep[3].v) this.facesOf(tokRef(it), placement, out, 0, cap);
      }
      return out;
    }

    facesOf(id, matrix, out, depth, cap) {
      if (!id || depth > 6 || out.length > cap) return;
      const ty = this.m.typeOf(id);
      const a = this.m.args(id);
      if (!a) return;

      if (ty === 'IFCPOLYGONALFACESET' || ty === 'IFCTRIANGULATEDFACESET') {
        const pts = this.pointList(tokRef(a[0])).map(p => applyPoint(matrix, p));
        // PnIndex remapea los índices cuando está presente.
        const pnIdx = ty === 'IFCPOLYGONALFACESET' ? a[3] : a[4];
        const pn = (pnIdx && isList(pnIdx)) ? pnIdx.v.map(tokNum) : null;
        const at = (i) => {
          let k = i;
          if (pn && k >= 1 && k <= pn.length) k = pn[k - 1];
          return pts[k - 1];                 // los índices IFC empiezan en 1
        };
        if (ty === 'IFCPOLYGONALFACESET') {
          for (const f of (isList(a[2]) ? a[2].v : [])) {
            const fa = this.m.args(tokRef(f));
            if (!fa || !isList(fa[0])) continue;
            const ring = fa[0].v.map(tokNum).map(at).filter(Boolean);
            if (ring.length >= 3) out.push(ring);
            if (out.length > cap) return;
          }
        } else {
          // CoordIndex es una lista de ternas.
          const ci = isList(a[3]) ? a[3].v : [];
          for (const tri of ci) {
            if (!isList(tri)) continue;
            const ring = tri.v.map(tokNum).map(at).filter(Boolean);
            if (ring.length >= 3) out.push(ring);
            if (out.length > cap) return;
          }
        }
        return;
      }
      if (ty === 'IFCFACETEDBREP' || ty === 'IFCCLOSEDSHELL' || ty === 'IFCFACE' ||
          ty === 'IFCFACEOUTERBOUND' || ty === 'IFCFACEBOUND') {
        if (ty === 'IFCPOLYLOOP') return;
        const refs = [];
        S.collectTokenRefs(a, refs);
        for (const r of refs) this.facesOf(r, matrix, out, depth + 1, cap);
        return;
      }
      if (ty === 'IFCPOLYLOOP') {
        const ring = (isList(a[0]) ? a[0].v : []).map(t => applyPoint(matrix, this.point(tokRef(t))));
        if (ring.length >= 3) out.push(ring);
        return;
      }
      if (ty === 'IFCMAPPEDITEM') {
        const src = this.m.args(tokRef(a[0]));
        if (!src) return;
        const origin = tokRef(src[0]) ? this.axisPlacement(tokRef(src[0])) : IDENTITY.slice();
        const target = tokRef(a[1]) ? this.transformOperator(tokRef(a[1])) : IDENTITY.slice();
        const next = matMul(matMul(matrix, target), origin);
        const rep = this.m.args(tokRef(src[1]));
        if (rep && isList(rep[3])) for (const t of rep[3].v) this.facesOf(tokRef(t), next, out, depth + 1, cap);
        return;
      }
      if (ty === 'IFCBOOLEANCLIPPINGRESULT' || ty === 'IFCBOOLEANRESULT') {
        this.facesOf(tokRef(a[1]), matrix, out, depth + 1, cap);
      }
    }

    /**
     * De una malla saca lo que el modelo analítico necesita: la huella —la cara
     * horizontal más grande a la cota mínima— y las cotas extremas.
     * @returns {{poly, base, top, faces}|null}
     */
    meshFootprint(faces) {
      if (!faces || !faces.length) return null;
      let base = Infinity, top = -Infinity;
      for (const f of faces) for (const p of f) {
        if (p[2] < base) base = p[2];
        if (p[2] > top) top = p[2];
      }
      if (!Number.isFinite(base)) return null;

      let best = null, bestArea = 0;
      for (const f of faces) {
        // Cara horizontal apoyada en la cota mínima.
        let minZ = Infinity, maxZ = -Infinity;
        for (const p of f) { if (p[2] < minZ) minZ = p[2]; if (p[2] > maxZ) maxZ = p[2]; }
        if (maxZ - minZ > 0.02) continue;
        if (minZ > base + 0.02) continue;
        const ring = dedupeRing(f.map(p => [p[0], p[1]]));
        if (ring.length < 3) continue;
        const ar = area(ring);
        if (ar > bestArea) { bestArea = ar; best = ring; }
      }
      // Sin cara horizontal utilizable, se recurre a la envolvente en planta.
      if (!best) {
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        for (const f of faces) for (const p of f) {
          if (p[0] < minX) minX = p[0]; if (p[1] < minY) minY = p[1];
          if (p[0] > maxX) maxX = p[0]; if (p[1] > maxY) maxY = p[1];
        }
        if (!Number.isFinite(minX)) return null;
        best = [[minX, minY], [maxX, minY], [maxX, maxY], [minX, maxY]];
      }
      if (signedArea(best) < 0) best = best.slice().reverse();
      return { poly: best, base, top, faces };
    }

    /**
     * Caras que miran hacia abajo: son las que cierran un recinto por arriba,
     * ya sea el falso techo, el forjado o el faldón de cubierta.
     */
    downwardFaces(faces, minSize) {
      const out = [];
      const min = minSize || 0.4;
      for (const f of faces) {
        if (f.length < 3) continue;
        const n = faceNormal(f);
        if (!n || n[2] > -0.25) continue;          // no mira hacia abajo
        const ring = dedupeRing(f.map(p => [p[0], p[1]]));
        if (ring.length < 3) continue;
        const ar = area(ring);
        if (ar < min) continue;
        out.push({ ring, face: f, normal: n, area: ar });
      }
      return out;
    }

    /**
     * Huella de un sólido facetado: la cara cuyos vértices están todos a la
     * cota mínima. Se usa para releer un recinto de techo inclinado que se ha
     * escrito como IfcFacetedBrep.
     * @returns {{poly, base, top}|null}
     */
    brepFootprint(productId) {
      const a = this.m.args(productId);
      if (!a) return null;
      const placement = this.placement(tokRef(a[5]));
      const shape = this.m.args(tokRef(a[6]));
      if (!shape || !isList(shape[2])) return null;
      const loops = [];
      let minZ = Infinity, maxZ = -Infinity;

      const walkFaces = (id, depth) => {
        if (!id || depth > 6) return;
        const ty = this.m.typeOf(id);
        const args = this.m.args(id);
        if (!args) return;
        if (ty === 'IFCPOLYLOOP') {
          const pts = (isList(args[0]) ? args[0].v : [])
            .map(t => applyPoint(placement, this.point(tokRef(t))));
          if (pts.length >= 3) {
            loops.push(pts);
            for (const p of pts) { if (p[2] < minZ) minZ = p[2]; if (p[2] > maxZ) maxZ = p[2]; }
          }
          return;
        }
        const refs = [];
        S.collectTokenRefs(args, refs);
        for (const r of refs) walkFaces(r, depth + 1);
      };
      for (const t of shape[2].v) {
        const rep = this.m.args(tokRef(t));
        if (!rep || !isList(rep[3])) continue;
        for (const it of rep[3].v) walkFaces(tokRef(it), 0);
      }
      if (!loops.length || !Number.isFinite(minZ)) return null;

      let best = null, bestArea = 0;
      for (const loop of loops) {
        if (!loop.every(p => Math.abs(p[2] - minZ) < 1e-4)) continue;
        const ring = dedupeRing(loop.map(p => [p[0], p[1]]));
        const ar = area(ring);
        if (ar > bestArea) { bestArea = ar; best = ring; }
      }
      if (!best) return null;
      // La cara del suelo se escribe mirando hacia abajo; se devuelve en
      // sentido directo para que coincida con el resto de huellas.
      if (signedArea(best) < 0) best = best.slice().reverse();
      return { poly: best, base: minZ, top: maxZ };
    }

    /** Envolvente en coordenadas de proyecto recorriendo los puntos de la representación. */
    productBBox(productId, limit) {
      const a = this.m.args(productId);
      if (!a) return null;
      const placement = this.placement(tokRef(a[5]));
      const shapeId = tokRef(a[6]);
      if (!shapeId) return null;
      const box = { minX: Infinity, minY: Infinity, minZ: Infinity, maxX: -Infinity, maxY: -Infinity, maxZ: -Infinity, n: 0 };
      this._bboxWalk(shapeId, placement, box, 0, limit || 60000);
      return box.n ? box : null;
    }

    _bboxWalk(id, matrix, box, depth, limit) {
      if (!id || depth > 10 || box.n > limit) return;
      const ty = this.m.typeOf(id);
      const a = this.m.args(id);
      if (!a) return;
      if (ty === 'IFCCARTESIANPOINT') {
        const p = applyPoint(matrix, this.point(id));
        if (p[0] < box.minX) box.minX = p[0];
        if (p[1] < box.minY) box.minY = p[1];
        if (p[2] < box.minZ) box.minZ = p[2];
        if (p[0] > box.maxX) box.maxX = p[0];
        if (p[1] > box.maxY) box.maxY = p[1];
        if (p[2] > box.maxZ) box.maxZ = p[2];
        box.n++;
        return;
      }
      if (ty === 'IFCMAPPEDITEM') {
        const src = this.m.args(tokRef(a[0]));
        if (!src) return;
        const origin = tokRef(src[0]) ? this.axisPlacement(tokRef(src[0])) : IDENTITY.slice();
        const target = tokRef(a[1]) ? this.transformOperator(tokRef(a[1])) : IDENTITY.slice();
        this._bboxWalk(tokRef(src[1]), matMul(matMul(matrix, target), origin), box, depth + 1, limit);
        return;
      }
      if (ty === 'IFCEXTRUDEDAREASOLID') {
        const list = this.extrusions(id, matrix, [], 0);
        for (const e of list) {
          for (const p of e.outer) {
            if (p[0] < box.minX) box.minX = p[0];
            if (p[1] < box.minY) box.minY = p[1];
            if (p[0] > box.maxX) box.maxX = p[0];
            if (p[1] > box.maxY) box.maxY = p[1];
            box.n++;
          }
          if (e.base < box.minZ) box.minZ = e.base;
          if (e.top > box.maxZ) box.maxZ = e.top;
        }
        return;
      }
      // recorrido genérico por referencias
      const refs = [];
      S.collectTokenRefs(a, refs);
      for (const r of refs) {
        if (box.n > limit) return;
        this._bboxWalk(r, matrix, box, depth + 1, limit);
      }
    }
  }

  function trimValue(tok) {
    const out = { param: null, angle: null, point: null };
    if (!tok) return out;
    const items = isList(tok) ? tok.v : [tok];
    for (const it of items) {
      if (!it) continue;
      if (it.t === 'num') { out.param = it.v; out.angle = it.v; }
      else if (it.t === 'list' && it.typed && it.typed.indexOf('PARAMETER') >= 0) { out.param = tokNum(it.v[0]); out.angle = out.param; }
      else if (it.t === 'ref') out.point = null; // los puntos se resuelven fuera si hiciera falta
    }
    return out;
  }

  function detectLengthScale(model) {
    const units = model.slotsOfType('IFCSIUNIT');
    for (const s of units) {
      const a = model.argsOfSlot(s);
      if (S.tokEnum(a[1]) !== 'LENGTHUNIT') continue;
      const prefix = S.tokEnum(a[2]);
      if (!prefix) return 1;
      const table = { MILLI: 0.001, CENTI: 0.01, DECI: 0.1, KILO: 1000 };
      return table[prefix] || 1;
    }
    return 1;
  }

  /* ======================================================================
   * Polígonos 2D
   * ==================================================================== */

  function dedupeRing(pts) {
    if (!pts || pts.length < 2) return pts || [];
    const out = [];
    for (const p of pts) {
      const last = out[out.length - 1];
      if (!last || Math.hypot(last[0] - p[0], last[1] - p[1]) > 1e-6) out.push(p);
    }
    if (out.length > 2) {
      const f = out[0], l = out[out.length - 1];
      if (Math.hypot(f[0] - l[0], f[1] - l[1]) < 1e-6) out.pop();
    }
    return out;
  }

  function signedArea(ring) {
    let a = 0;
    for (let i = 0, n = ring.length; i < n; i++) {
      const p = ring[i], q = ring[(i + 1) % n];
      a += p[0] * q[1] - q[0] * p[1];
    }
    return a / 2;
  }

  function area(ring) { return Math.abs(signedArea(ring)); }

  function perimeter(ring) {
    let p = 0;
    for (let i = 0, n = ring.length; i < n; i++) {
      const a = ring[i], b = ring[(i + 1) % n];
      p += Math.hypot(b[0] - a[0], b[1] - a[1]);
    }
    return p;
  }

  function centroid(ring) {
    let cx = 0, cy = 0, a = 0;
    for (let i = 0, n = ring.length; i < n; i++) {
      const p = ring[i], q = ring[(i + 1) % n];
      const f = p[0] * q[1] - q[0] * p[1];
      cx += (p[0] + q[0]) * f; cy += (p[1] + q[1]) * f; a += f;
    }
    if (Math.abs(a) < EPS) {
      const n = ring.length || 1;
      return [ring.reduce((s, p) => s + p[0], 0) / n, ring.reduce((s, p) => s + p[1], 0) / n];
    }
    a *= 3;
    return [cx / a, cy / a];
  }

  function bbox(ring) {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const p of ring) {
      if (p[0] < minX) minX = p[0];
      if (p[1] < minY) minY = p[1];
      if (p[0] > maxX) maxX = p[0];
      if (p[1] > maxY) maxY = p[1];
    }
    return { minX, minY, maxX, maxY };
  }

  function pointInRing(pt, ring) {
    let inside = false;
    const x = pt[0], y = pt[1];
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const xi = ring[i][0], yi = ring[i][1], xj = ring[j][0], yj = ring[j][1];
      if (((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / ((yj - yi) || EPS) + xi)) inside = !inside;
    }
    return inside;
  }

  function pointInPolygon(pt, poly) {
    if (!pointInRing(pt, poly.outer)) return false;
    for (const h of (poly.inners || [])) if (pointInRing(pt, h)) return false;
    return true;
  }

  function distanceToSegment(p, a, b) {
    const dx = b[0] - a[0], dy = b[1] - a[1];
    const l2 = dx * dx + dy * dy;
    if (l2 < EPS) return Math.hypot(p[0] - a[0], p[1] - a[1]);
    let t = ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2;
    t = Math.max(0, Math.min(1, t));
    return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
  }

  function distanceToRing(p, ring) {
    let best = Infinity;
    for (let i = 0, n = ring.length; i < n; i++) {
      const d = distanceToSegment(p, ring[i], ring[(i + 1) % n]);
      if (d < best) best = d;
    }
    return best;
  }

  /* ======================================================================
   * Triangulación y prismas
   * ----------------------------------------------------------------------
   * Necesario para dibujar los volúmenes de los espacios en 3D con la misma
   * geometría exacta que se ha usado para auditar y para calcular las
   * cantidades. Recorte de orejas con eliminación de huecos por puentes.
   * ==================================================================== */

  /** Une los anillos interiores al exterior mediante puentes, dejando un solo anillo. */
  function eliminateHoles(outer, holes) {
    const valid = (holes || []).filter(h => h && h.length >= 3);
    if (!valid.length) return outer.slice();
    const outerCCW = signedArea(outer) > 0;

    // Se procesan de izquierda a derecha por su vértice más a la derecha.
    const list = valid.map(h => {
      let bi = 0, li = 0;
      for (let i = 1; i < h.length; i++) {
        if (h[i][0] > h[bi][0] || (h[i][0] === h[bi][0] && h[i][1] < h[bi][1])) bi = i;
        if (h[i][0] < h[li][0] || (h[i][0] === h[li][0] && h[i][1] < h[li][1])) li = i;
      }
      return { ring: h, m: h[bi], mLeft: h[li] };
    }).sort((a, b) => a.m[0] - b.m[0]);

    let ring = outer.slice();
    // Dos huecos que tienden su puente al mismo vértice crean un pellizco por
    // el que el recorte de orejas no puede avanzar. Se lleva registro de los
    // vértices ya usados y, si por la derecha no queda ninguno libre, se busca
    // el puente hacia la izquierda.
    const used = new Set();
    for (const item of list) {
      let bridge = findBridge(ring, item.m, used, 1);
      let anchor = item.m;
      if (bridge >= 0 && used.has(keyOf(ring[bridge]))) {
        const alt = findBridge(ring, item.mLeft, used, -1);
        if (alt >= 0 && !used.has(keyOf(ring[alt]))) { bridge = alt; anchor = item.mLeft; }
      }
      if (bridge < 0) continue;
      used.add(keyOf(ring[bridge]));
      const hole = { ring: item.ring, m: anchor };
      // El anillo interior debe recorrerse al contrario que el exterior.
      let hr = hole.ring.slice();
      if ((signedArea(hr) > 0) === outerCCW) hr.reverse();
      let start = 0;
      for (let i = 0; i < hr.length; i++) {
        if (hr[i][0] === hole.m[0] && hr[i][1] === hole.m[1]) { start = i; break; }
      }
      const seq = hr.slice(start).concat(hr.slice(0, start));
      // …exterior hasta el puente, vuelta completa al hueco, regreso al puente…
      ring = ring.slice(0, bridge + 1).concat(seq, [seq[0]], ring.slice(bridge));
    }
    return ring;
  }

  /**
   * Vértice del anillo por el que tender el puente hacia el hueco: se lanza un
   * rayo horizontal hacia +X desde el punto y se toma la arista cortada más
   * cercana, quedándose con su extremo de mayor abscisa.
   */
  function keyOf(p) { return p[0].toFixed(9) + ',' + p[1].toFixed(9); }

  /**
   * Vértice del anillo por el que tender el puente hacia el hueco: se lanza un
   * rayo horizontal desde el punto en la dirección indicada y se toma la
   * arista cortada más cercana, quedándose con el extremo más exterior.
   * @param {number} dir  +1 hacia la derecha, -1 hacia la izquierda
   */
  function findBridge(ring, point, used, dir) {
    dir = dir || 1;
    const hits = [];
    for (let i = 0, n = ring.length; i < n; i++) {
      const a = ring[i], b = ring[(i + 1) % n];
      if ((a[1] > point[1]) === (b[1] > point[1])) continue;
      const t = (point[1] - a[1]) / ((b[1] - a[1]) || EPS);
      const x = a[0] + t * (b[0] - a[0]);
      if (dir > 0 ? x < point[0] - 1e-12 : x > point[0] + 1e-12) continue;
      const j = (i + 1) % n;
      const outerFirst = dir > 0
        ? (a[0] > b[0] || (a[0] === b[0] && Math.abs(a[1] - point[1]) <= Math.abs(b[1] - point[1])))
        : (a[0] < b[0] || (a[0] === b[0] && Math.abs(a[1] - point[1]) <= Math.abs(b[1] - point[1])));
      hits.push({ d: Math.abs(x - point[0]), pair: outerFirst ? [i, j] : [j, i] });
    }
    if (!hits.length) return -1;
    hits.sort((p, q) => p.d - q.d);
    if (used && used.size) {
      for (const h of hits) for (const k of h.pair) if (!used.has(keyOf(ring[k]))) return k;
    }
    return hits[0].pair[0];
  }

  /**
   * Triangula un polígono con huecos.
   * @returns {Array<Array<Array<number>>>} lista de triángulos [[x,y],[x,y],[x,y]]
   */
  function triangulate(outer, holes) {
    const clean = dedupeRing(outer || []);
    if (clean.length < 3) return [];
    const rings = (holes || []).map(dedupeRing).filter(h => h.length >= 3);
    const tris = earClip(eliminateHoles(clean, rings));
    if (!rings.length) return tris;

    // Salvaguarda: si el área triangulada no coincide con la del polígono, el
    // recorte se ha atascado en un pellizco. Antes que dibujar geometría falsa
    // se devuelve la tapa sin huecos, que es una simplificación visible pero
    // honrada.
    const got = tris.reduce((s, t) => s + Math.abs(signedArea(t)), 0);
    const want = area(clean) - rings.reduce((s, h) => s + area(h), 0);
    if (Math.abs(got - want) <= Math.max(1e-6, want * 1e-6)) return tris;
    const fallback = earClip(clean);
    fallback.approximate = true;
    return fallback;
  }

  function earClip(ring0) {
    let ring = ring0;
    if (!ring || ring.length < 3) return [];
    // Orientación antihoraria para el recorte de orejas.
    if (signedArea(ring) < 0) ring = ring.slice().reverse();

    const idx = ring.map((_, i) => i);
    const tris = [];
    let guard = idx.length * 3;
    while (idx.length > 3 && guard-- > 0) {
      let clipped = false;
      for (let i = 0; i < idx.length; i++) {
        const ia = idx[(i + idx.length - 1) % idx.length];
        const ib = idx[i];
        const ic = idx[(i + 1) % idx.length];
        const a = ring[ia], b = ring[ib], c = ring[ic];
        const crossZ = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
        if (crossZ <= 1e-12) continue;             // vértice reflejo o alineado
        let contains = false;
        for (const k of idx) {
          if (k === ia || k === ib || k === ic) continue;
          const p = ring[k];
          // Los puentes hacia los huecos duplican vértices: un punto que
          // coincide con una esquina de la oreja no la invalida.
          if (samePoint(p, a) || samePoint(p, b) || samePoint(p, c)) continue;
          if (pointInTriangle(p, a, b, c)) { contains = true; break; }
        }
        if (contains) continue;
        tris.push([a, b, c]);
        idx.splice(i, 1);
        clipped = true;
        break;
      }
      if (!clipped) break;   // polígono degenerado: se corta por lo sano
    }
    if (idx.length === 3) tris.push([ring[idx[0]], ring[idx[1]], ring[idx[2]]]);
    return tris;
  }

  /** Normal de un polígono 3D por el método de Newell. */
  function faceNormal(f) {
    let nx = 0, ny = 0, nz = 0;
    for (let i = 0, n = f.length; i < n; i++) {
      const a = f[i], b = f[(i + 1) % n];
      nx += (a[1] - b[1]) * (a[2] + b[2]);
      ny += (a[2] - b[2]) * (a[0] + b[0]);
      nz += (a[0] - b[0]) * (a[1] + b[1]);
    }
    const l = Math.hypot(nx, ny, nz);
    return l < 1e-12 ? null : [nx / l, ny / l, nz / l];
  }

  function samePoint(p, q) { return Math.abs(p[0] - q[0]) < 1e-9 && Math.abs(p[1] - q[1]) < 1e-9; }

  function pointInTriangle(p, a, b, c) {
    const e = 1e-12;
    const d1 = (p[0] - b[0]) * (a[1] - b[1]) - (a[0] - b[0]) * (p[1] - b[1]);
    const d2 = (p[0] - c[0]) * (b[1] - c[1]) - (b[0] - c[0]) * (p[1] - c[1]);
    const d3 = (p[0] - a[0]) * (c[1] - a[1]) - (c[0] - a[0]) * (p[1] - a[1]);
    const neg = (d1 < -e) || (d2 < -e) || (d3 < -e);
    const pos = (d1 > e) || (d2 > e) || (d3 > e);
    return !(neg && pos);
  }

  /**
   * Construye la malla de un prisma vertical: tapa inferior, tapa superior y
   * caras laterales. Devuelve posiciones y normales listas para three.js, en
   * el sistema Y-arriba que usan los visores (x, z, -y del IFC).
   */
  function prismMesh(outer, holes, z0, z1) {
    const positions = [];
    const normals = [];
    const push = (x, y, z, nx, ny, nz) => { positions.push(x, z, -y); normals.push(nx, nz, -ny); };

    // Orientaciones normalizadas: contorno antihorario y huecos horarios. Con
    // eso, un único recorrido genera caras laterales bien orientadas en ambos
    // casos, sin necesidad de invertir nada.
    let out = dedupeRing(outer || []);
    if (out.length < 3) return { positions: new Float32Array(0), normals: new Float32Array(0) };
    if (signedArea(out) < 0) out = out.slice().reverse();
    const inner = (holes || []).map(dedupeRing).filter(h => h.length >= 3)
      .map(h => (signedArea(h) > 0 ? h.slice().reverse() : h.slice()));

    const caps = triangulate(out, inner);
    for (const t of caps) {
      push(t[2][0], t[2][1], z0, 0, 0, -1);   // tapa inferior, mirando abajo
      push(t[1][0], t[1][1], z0, 0, 0, -1);
      push(t[0][0], t[0][1], z0, 0, 0, -1);
      push(t[0][0], t[0][1], z1, 0, 0, 1);    // tapa superior
      push(t[1][0], t[1][1], z1, 0, 0, 1);
      push(t[2][0], t[2][1], z1, 0, 0, 1);
    }

    for (const ring of [out].concat(caps.approximate ? [] : inner)) {
      for (let i = 0, n = ring.length; i < n; i++) {
        const a = ring[i], b = ring[(i + 1) % n];
        const dx = b[0] - a[0], dy = b[1] - a[1];
        const len = Math.hypot(dx, dy) || 1;
        const nx = dy / len, ny = -dx / len;
        push(a[0], a[1], z0, nx, ny, 0);
        push(b[0], b[1], z0, nx, ny, 0);
        push(b[0], b[1], z1, nx, ny, 0);
        push(a[0], a[1], z0, nx, ny, 0);
        push(b[0], b[1], z1, nx, ny, 0);
        push(a[0], a[1], z1, nx, ny, 0);
      }
    }
    return { positions: new Float32Array(positions), normals: new Float32Array(normals) };
  }

  HEM.geom = {
    Geo, IDENTITY, matMul, applyPoint, applyDir, axisMatrix, cross, dot, norm,
    invertRigid, faceNormal,
    signedArea, area, perimeter, centroid, bbox, pointInRing, pointInPolygon,
    distanceToSegment, distanceToRing, dedupeRing,
    triangulate, prismMesh, eliminateHoles
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
