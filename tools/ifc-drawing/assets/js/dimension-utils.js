/*
 * HEFESTOLAB IFC Drawing - dimension geometry and technical text layout.
 * Pure helper shared by the editor, sheets and PDF export.
 */
(function (global) {
  'use strict';

  function geometry(annotation) {
    const x1 = Number(annotation.a[0]);
    const y1 = Number(annotation.a[1]);
    const x2 = Number(annotation.b[0]);
    const y2 = Number(annotation.b[1]);
    const dx = x2 - x1;
    const dy = y2 - y1;
    const length = Math.max(1e-9, Math.hypot(dx, dy));
    const ux = dx / length;
    const uy = dy / length;
    const nx = -uy;
    const ny = ux;
    const offset = Number(annotation.offset) || 0;
    const q1 = [x1 + nx * offset, y1 + ny * offset];
    const q2 = [x2 + nx * offset, y2 + ny * offset];
    const mid = [(q1[0] + q2[0]) / 2, (q1[1] + q2[1]) / 2];
    return { L: length, nx, ny, q1, q2, mid, ux, uy };
  }

  /**
   * Aligned dimension text must stay parallel to its dimension line and be
   * readable from the bottom or the right of the sheet. The result therefore
   * never leaves the [-90, 90] range and vertical text is canonicalised to
   * -90 degrees, independent of the order in which the points were clicked.
   */
  function readableAngle(geom) {
    let angle = Math.atan2(geom.uy, geom.ux) * 180 / Math.PI;
    if (angle > 90) angle -= 180;
    if (angle < -90) angle += 180;
    if (Math.abs(Math.abs(angle) - 90) < 1e-7) angle = -90;
    if (Math.abs(angle) < 1e-10) angle = 0;
    return angle;
  }

  /** Places the baseline above the line in the local coordinate system. */
  function textLayout(geom, gap) {
    const angle = readableAngle(geom);
    const radians = angle * Math.PI / 180;
    const distance = Math.max(0, Number(gap) || 0);
    return {
      x: geom.mid[0] + Math.sin(radians) * distance,
      y: geom.mid[1] - Math.cos(radians) * distance,
      angle
    };
  }

  global.HEFESTO_IFC_DIMENSIONS = Object.freeze({ geometry, readableAngle, textLayout });
})(typeof globalThis !== 'undefined' ? globalThis : this);
