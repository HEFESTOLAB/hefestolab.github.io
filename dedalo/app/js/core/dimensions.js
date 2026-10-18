/* Axis and aligned dimension geometry. Pure math; no model, DOM or renderer. */
(function (root) {
  'use strict';
  const D = root.DEDALO, { V, geom } = D;
  const AXES = [[1, 0, 0], [0, 1, 0], [0, 0, 1]], EPS = 1e-9;
  function validAxes(a, b) { return AXES.map((_, i) => i).filter(i => Math.abs(b[i] - a[i]) > EPS); }
  function dominantAxis(a, b) { return validAxes(a, b).sort((i, j) => Math.abs(b[j] - a[j]) - Math.abs(b[i] - a[i]))[0]; }
  function axisLayout(a, b, axis, offsetAxis, distance) {
    if (!validAxes(a, b).includes(axis)) throw new Error('Los puntos no tienen longitud en ese eje.');
    if (!AXES[offsetAxis] || axis === offsetAxis || !Number.isFinite(distance)) throw new Error('Separación de cota inválida.');
    const A2 = V.mid(a, b), B2 = A2.slice(); A2[axis] = a[axis]; B2[axis] = b[axis];
    A2[offsetAxis] += distance; B2[offsetAxis] += distance;
    return { a: a.slice(), b: b.slice(), off: V.sub(A2, a), offB: V.sub(B2, b), axis, offsetAxis, length: Math.abs(b[axis] - a[axis]) };
  }
  function perpendicular(a, b, axis) {
    const ab = V.norm(V.sub(b, a)), candidate = AXES[axis];
    return V.norm(V.sub(candidate, V.scale(ab, V.dot(candidate, ab))));
  }
  function alignedLayout(a, b, offsetAxis, distance) {
    const direction = perpendicular(a, b, offsetAxis);
    if (V.dist(a, b) <= EPS || V.len(direction) < EPS || !Number.isFinite(distance)) throw new Error('Separación de cota inválida.');
    const off = V.scale(direction, distance);
    return { a: a.slice(), b: b.slice(), off, offB: off.slice(), offsetAxis, length: V.dist(a, b) };
  }
  function endpoints(annotation) {
    const A2 = V.add(annotation.a, annotation.off || [0, 0, 0]);
    const B2 = V.add(annotation.b, annotation.offB || annotation.off || [0, 0, 0]);
    return { A2, B2, length: annotation.offB !== undefined ? V.dist(A2, B2) : V.dist(annotation.a, annotation.b) };
  }
  function points(annotation) { const p = endpoints(annotation); return { a: p.A2, b: p.B2 }; }
  function measure(annotation) { return endpoints(annotation).length; }
  function place(camera, a, b, axis, cursor, aligned, preferredOffsetAxis) {
    const mid = V.mid(a, b), s = camera.project(mid), ps = Math.max(1e-9, camera.pixelSize(mid));
    const gesture = [cursor.x - s.x, cursor.y - s.y], length = Math.hypot(...gesture), step = ps * 80;
    const ab = aligned ? V.norm(V.sub(b, a)) : AXES[axis], ray = camera.ray(cursor.x, cursor.y);
    const candidates = [];
    for (let q = 0; q < 3; q++) {
      if (!aligned && q === axis) continue;
      const direction = aligned ? perpendicular(a, b, q) : AXES[q];
      if (V.len(direction) < EPS) continue;
      const projected = camera.project(V.add(mid, V.scale(direction, step)));
      const delta = [projected.x - s.x, projected.y - s.y], span = Math.hypot(...delta);
      if (projected.behind || span < 0.1) continue;
      const normal = V.norm(V.cross(ab, direction));
      const planeQuality = Math.abs(V.dot(normal, ray.d));
      const score = length > 1e-6 ? Math.abs((gesture[0] * delta[0] + gesture[1] * delta[1]) / (length * span)) : 0;
      candidates.push({ q, direction, delta, span, normal, planeQuality, score });
    }
    if (!candidates.length) {
      const q = [0, 1, 2].find(i => aligned ? V.len(perpendicular(a, b, i)) > EPS : i !== axis);
      return aligned ? alignedLayout(a, b, q, 0) : axisLayout(a, b, axis, q, 0);
    }
    // Prefer a readable offset plane. Keep its axis while near the angular
    // boundary between two gestures, so a small tremor cannot flip the plane.
    const readable = candidates.filter(c => c.planeQuality > 1e-5);
    const pool = readable.length ? readable : candidates;
    pool.sort((c, d) => d.score - c.score || d.span - c.span || c.q - d.q);
    const previous = pool.find(c => c.q === preferredOffsetAxis);
    const chosen = previous && pool[0].score - previous.score < 0.08 ? previous : pool[0];
    const t = geom.rayPlane(ray.o, ray.d, { n: chosen.normal, d: V.dot(chosen.normal, mid) });
    let distance;
    if (chosen.planeQuality > 1e-5 && t !== null && t >= 0) distance = V.dot(V.sub(V.add(ray.o, V.scale(ray.d, t)), mid), chosen.direction);
    else distance = (gesture[0] * chosen.delta[0] + gesture[1] * chosen.delta[1]) * step / (chosen.span * chosen.span);
    if (!Number.isFinite(distance)) distance = 0;
    return aligned ? alignedLayout(a, b, chosen.q, distance) : axisLayout(a, b, axis, chosen.q, distance);
  }
  D.DimensionGeometry = { axes: ['x', 'y', 'z'], validAxes, dominantAxis, axisLayout, alignedLayout, endpoints, points, measure, place };
})(typeof window !== 'undefined' ? window : globalThis);
