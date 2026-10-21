/* Caja de sección: recorte visual reversible en coordenadas del contexto abierto. */
(function(root) {
  'use strict';
  const D = root.DEDALO;
  const copy = x => JSON.parse(JSON.stringify(x));
  function normalize(value) {
    if (!value || value.enabled === false) return null;
    for (const k of ['min', 'max']) if (!Array.isArray(value[k]) || value[k].length !== 3 || value[k].some(x => typeof x !== 'number' || !Number.isFinite(x))) throw new Error('Los límites de sección deben ser tres números finitos en metros.');
    if (value.min.some((x, i) => value.max[i] - x < 1e-7)) throw new Error('Cada máximo de sección debe ser mayor que su mínimo.');
    return { enabled: true, min: value.min.slice(), max: value.max.slice(), showBox: value.showBox !== false };
  }
  const active = b => !!(b && b.enabled);
  const contains = (b, p) => !active(b) || p.every((x, i) => x >= b.min[i] - 1e-8 && x <= b.max[i] + 1e-8);
  // Sutherland-Hodgman, with interpolation of any extra attributes after XYZ.
  function polygon(b, points) {
    if (!active(b)) return points;
    let out = points;
    for (let axis = 0; axis < 3; axis++) for (let side = 0; side < 2; side++) {
      const input = out; out = [];
      const bound = side ? b.max[axis] : b.min[axis], sign = side ? -1 : 1;
      for (let i = 0; i < input.length; i++) {
        const a = input[i], c = input[(i + 1) % input.length];
        const da = sign * (a[axis] - bound), dc = sign * (c[axis] - bound);
        if (da >= 0) out.push(a);
        if ((da >= 0) !== (dc >= 0)) { const t = da / (da - dc); out.push(a.map((x, j) => x + (c[j] - x) * t)); }
      }
      if (!out.length) return out;
    }
    return out;
  }
  function segment(b, a, c) {
    if (!active(b)) return [a, c];
    let low = 0, high = 1;
    for (let i = 0; i < 3; i++) {
      const d = c[i] - a[i];
      if (Math.abs(d) < 1e-15) { if (a[i] < b.min[i] || a[i] > b.max[i]) return null; continue; }
      let x = (b.min[i] - a[i]) / d, y = (b.max[i] - a[i]) / d;
      if (x > y) [x, y] = [y, x];
      low = Math.max(low, x); high = Math.min(high, y);
      if (low > high) return null;
    }
    return [a.map((x, i) => x + (c[i] - x) * low), a.map((x, i) => x + (c[i] - x) * high)];
  }
  function wires(b) {
    if (!active(b) || !b.showBox) return [];
    const pts = Array.from({length:8}, (_, k) => [0,1,2].map(i => (k & (1 << i)) ? b.max[i] : b.min[i]));
    const lines = [];
    for (let k = 0; k < 8; k++) for (let i = 0; i < 3; i++) if (!(k & (1 << i))) lines.push({ a: pts[k], b: pts[k | (1 << i)], color: '#e47924', width: 2, dash: 4 });
    return lines;
  }
  function lines(b, list) {
    if (!active(b)) return list;
    return list.flatMap(l => { const s = segment(b, l.a, l.b); return s ? [Object.assign({}, l, { a:s[0], b:s[1] })] : []; }).concat(wires(b));
  }
  function install(app) {
    const set = value => {
      app.renderer.opts.sectionBox = normalize(value);
      app._fk = app._lk = null;
      app.doc.dirty = true;
      app.files.scheduleAutosave(); app.requestRender(); app.ui.refreshTitle(); app.ui.refreshPanels();
      return { ok:true, sectionBox:copy(app.renderer.opts.sectionBox) };
    };
    app.doc.register('view.sectionBox', { title:'Caja de sección', undoable:false,
      params:{ enabled:'bool; false desactiva', min:'[x,y,z] metros', max:'[x,y,z] metros', showBox:'bool', read:'bool; solo consultar' },
      run(p) { if (p.read) return { ok:true, sectionBox:copy(app.renderer.opts.sectionBox || null), coordinates:'context-local', caps:false }; return set(p); } });
    app.doc.register('view.sectionBoxFit', { title:'Ajustar caja de sección', undoable:false,
      params:{ selection:'bool; ajustar a la selección', padding:'m, opcional' },
      run(p) {
        let points;
        if (p.selection) {
          if (app.doc.selectionEmpty()) throw new Error('Selecciona primero elementos para ajustar la sección.');
          points = [...app.doc.vertsOf(app.doc.selectionItems())].map(id => app.doc.model.P(id));
        } else points = [...app.doc.model.verts.values()].map(v => v.p);
        if (!points.length) throw new Error('No hay geometría para ajustar la sección.');
        const padding = p.padding === undefined ? 0.05 : p.padding;
        if (typeof padding !== 'number' || !Number.isFinite(padding) || padding < 0) throw new Error('El margen debe ser un número no negativo en metros.');
        const min = [Infinity,Infinity,Infinity], max = [-Infinity,-Infinity,-Infinity];
        for (const pt of points) for (let i = 0; i < 3; i++) { min[i] = Math.min(min[i],pt[i]); max[i] = Math.max(max[i],pt[i]); }
        for (let i = 0; i < 3; i++) { const pad = Math.max(padding,(max[i]-min[i]) < 1e-7 ? 0.005 : 0); min[i]-=pad; max[i]+=pad; }
        return set({min,max});
      } });
    app.doc.on(kind => {
      // Limits belong to the local coordinate system, so release on context switch.
      if (kind === 'context' || kind === 'reset') { app.renderer.opts.sectionBox = null; app._fk = app._lk = null; }
    });
  }
  D.SectionBox = { normalize, active, contains, polygon, segment, wires, lines, install };
})(typeof window !== 'undefined' ? window : globalThis);
