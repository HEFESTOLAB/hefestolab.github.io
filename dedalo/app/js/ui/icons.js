/*
 * Dédalo — iconos propios (trazo de 1,6 px sobre rejilla de 24). Diseño original.
 */
(function (root) {
  'use strict';
  const D = root.DEDALO;
  const s = (body, extra) => '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"' + (extra || '') + '>' + body + '</svg>';
  const dot = (x, y, r) => '<circle cx="' + x + '" cy="' + y + '" r="' + (r || 1.9) + '" fill="currentColor" stroke="none"/>';

  D.ICONS = {
    logo: '<svg viewBox="0 0 32 32" width="26" height="26" fill="none"><rect x="1.5" y="1.5" width="29" height="29" rx="7" fill="#b4532a"/><path d="M8 9h10l6 6v8H14l-6-6z" stroke="#fff" stroke-width="1.8" stroke-linejoin="round"/><path d="M8 9v8h16M18 9v14" stroke="#fff" stroke-width="1.8" stroke-linejoin="round" opacity=".55"/></svg>',
    section: s('<path d="M4 8l8-4 8 4v9l-8 4-8-4zM4 8l8 4 8-4M12 12v9"/><path d="M3 13l18-5v5L3 18z" fill="currentColor" fill-opacity=".18"/><rect x="1.5" y="12" width="3" height="3" fill="currentColor"/><rect x="19.5" y="6.5" width="3" height="3" fill="currentColor"/>'),
    ifc: s('<path d="M5 3h10l4 4v14H5zM15 3v5h4"/><path d="M8 17v-6h6v6M8 14h6M11 11v6M3 20h18"/>'),
    hierarchy: s('<rect x="9" y="2" width="6" height="5" rx="1"/><path d="M12 7v5M5 16v-4h14v4"/><rect x="2" y="16" width="6" height="5" rx="1"/><rect x="9" y="16" width="6" height="5" rx="1"/><rect x="16" y="16" width="6" height="5" rx="1"/>'),
    menu: s('<path d="M4 7h16M4 12h16M4 17h16"/>'),
    select: s('<path d="M6 3.5l11.5 9.2-5.3.8 3.2 6.2-2.4 1.2-3.2-6.2-3.8 3.8z" fill="currentColor" fill-opacity=".08"/>'),
    erase: s('<path d="M14.5 4.5l5 5-8.5 8.5H6.5l-2-2a1.5 1.5 0 010-2.1z"/><path d="M9.5 9.5l5 5"/><path d="M11 18h8.5"/>'),
    line: s('<path d="M5.5 18.5l13-13"/>' + dot(5.5, 18.5) + dot(18.5, 5.5)),
    arc: s('<path d="M4.5 17.5C6 10 10.5 6.5 19.5 6.5"/>' + dot(4.5, 17.5) + dot(19.5, 6.5)),
    rect: s('<rect x="4.5" y="6.5" width="15" height="11" rx=".5"/>' + dot(4.5, 17.5) + dot(19.5, 6.5)),
    circle: s('<circle cx="12" cy="12" r="7.5"/>' + dot(12, 12, 1.6) + '<path d="M12 12h7.5" stroke-dasharray="2 2"/>'),
    polygon: s('<path d="M12 4.2l6.8 3.9v7.8L12 19.8l-6.8-3.9V8.1z"/>' + dot(12, 12, 1.4)),
    pushpull: s('<path d="M4 15.5l8 4 8-4M4 15.5l8-4 8 4"/><path d="M12 3.5v8.5M9 6.5l3-3 3 3"/>'),
    move: s('<path d="M12 3.5v17M3.5 12h17"/><path d="M9.5 6L12 3.5 14.5 6M9.5 18l2.5 2.5 2.5-2.5M6 9.5L3.5 12 6 14.5M18 9.5l2.5 2.5-2.5 2.5"/>'),
    copy: s('<rect x="8" y="8" width="12" height="12" rx="1.5"/><path d="M16 8V4H4v12h4"/>'),
    connect: s('<path d="M9 8.5l2-2a4 4 0 015.5 5.8l-2 2M15 15.5l-2 2a4 4 0 01-5.5-5.8l2-2M8.5 15.5l7-7"/>'),
    rotate: s('<path d="M19 12a7 7 0 11-2.05-4.95"/><path d="M17.5 3.8v3.6h-3.6"/>' + dot(12, 12, 1.4)),
    scale: s('<rect x="3.5" y="10.5" width="10" height="10" rx=".5"/><path d="M10 3.5h10.5V14" stroke-dasharray="2.2 2"/><path d="M11 13l8-8M14.5 5h4.5v4.5"/>'),
    offset: s('<rect x="3.5" y="3.5" width="17" height="17" rx="2"/><rect x="8" y="8" width="8" height="8" rx="1"/>'),
    tape: s('<rect x="3.5" y="7" width="13" height="10" rx="2"/><circle cx="10" cy="12" r="2.2"/><path d="M16.5 15h4M18 15v-2M20.5 15v-2"/>'),
    dim: s('<path d="M4 6v12M20 6v12M4 12h16"/><path d="M7 9.5L4 12l3 2.5M17 9.5l3 2.5-3 2.5"/>'),
    text: s('<path d="M4 20l4.5-4.5"/><rect x="9.5" y="4" width="11" height="9" rx="1.5"/><path d="M12.5 7.2h5M15 7.2v3.8"/>'),
    paint: s('<path d="M5 11.5l6.5-6.5 6.5 6.5-6.5 6.5z"/><path d="M5 11.5h13"/><path d="M19.5 14.5s1.8 2.2 1.8 3.4a1.8 1.8 0 01-3.6 0c0-1.2 1.8-3.4 1.8-3.4z" fill="currentColor" stroke="none"/>'),
    orbit: s('<ellipse cx="12" cy="12" rx="8.5" ry="4"/><path d="M12 3.5v17" opacity=".5"/><path d="M17.2 6.4l2.6 1.7-.9 2.9"/>' + dot(12, 12, 1.5)),
    pan: s('<path d="M8.5 12V6.5a1.5 1.5 0 013 0V11M11.5 10.5V5a1.5 1.5 0 013 0v6M14.5 10.5V7a1.5 1.5 0 013 0v6.5c0 4-2.5 6.5-6 6.5-2.6 0-4-1.2-5.4-3.4L4.4 13a1.4 1.4 0 012.3-1.5L8.5 14"/>'),
    zoom: s('<circle cx="10.5" cy="10.5" r="6"/><path d="M15 15l5 5M8 10.5h5M10.5 8v5"/>'),
    extents: s('<circle cx="11" cy="11" r="4.5"/><path d="M14.5 14.5l3.5 3.5"/><path d="M3.5 7.5v-4h4M16.5 3.5h4v4M20.5 16.5v4h-4M7.5 20.5h-4v-4"/>'),
    undo: s('<path d="M8.5 5L4 9.5 8.5 14"/><path d="M4 9.5h10a5 5 0 010 10h-3"/>'),
    redo: s('<path d="M15.5 5L20 9.5 15.5 14"/><path d="M20 9.5H10a5 5 0 000 10h3"/>'),
    info: s('<circle cx="12" cy="12" r="8.5"/><path d="M12 11v5.5"/>' + dot(12, 7.8, 1.2)),
    materials: s('<path d="M12 3.5a8.5 8.5 0 100 17c1.3 0 1.8-.9 1.8-1.8 0-1.4-1.3-1.7-1.3-3 0-1 .8-1.7 1.8-1.7h2.2c2.2 0 3.9-1.6 3.9-3.8 0-3.6-3.8-6.7-8.4-6.7z"/>' + dot(7.5, 11, 1.3) + dot(10, 7.2, 1.3) + dot(14.5, 7.2, 1.3)),
    styles: s('<circle cx="12" cy="12" r="8.5"/><path d="M12 3.5v17" /><path d="M12 3.5a8.5 8.5 0 010 17z" fill="currentColor" fill-opacity=".85" stroke="none"/>'),
    views: s('<path d="M12 3.5l7.5 4.2v8.6L12 20.5l-7.5-4.2V7.7z"/><path d="M4.5 7.7L12 12l7.5-4.3M12 12v8.5"/>'),
    model: s('<path d="M5 6.5h14M5 12h14M5 17.5h9"/>' + dot(19, 17.5, 1.4)),
    console: s('<rect x="3.5" y="4.5" width="17" height="15" rx="2"/><path d="M7 9.5l3 2.5-3 2.5M12.5 15h4.5"/>'),
    keys: s('<rect x="3" y="6.5" width="18" height="11" rx="2"/><path d="M6.5 10h.01M9.5 10h.01M12.5 10h.01M15.5 10h.01M17.5 10h.01M8 14h8"/>'),
    save: s('<path d="M5 4.5h11l3.5 3.5v11.5H5z"/><path d="M8 4.5v5h7v-5M8 19.5v-5.5h8v5.5"/>'),
    close: s('<path d="M6 6l12 12M18 6L6 18"/>'),
    chevron: s('<path d="M9 6l6 6-6 6"/>')
  };
})(typeof window !== 'undefined' ? window : globalThis);
