# HEFESTOLAB repository guidance

This repository is a static GitHub Pages site. Its publishable root contains `.nojekyll`, the human website, localized pages, legal content and browser tools. Do not add a required build step, server, framework or backend.

## Stability rules

- Preserve every existing public URL and relative path. In particular, do not move `tools/ifc-drawing/`.
- Preserve `tools/ifc2ia-ready/` as a static, client-side quantity and QA application. Its Excel and compact JSON exports must remain reproducible from the selected IFC without a backend.
- Preserve the IFC2IA Ready visual workflow: a large central IFC viewer and a synchronized right-hand issue/element panel. Its pinned That Open Components 3.4.8, Fragments 3.4.7 and web-ifc 0.0.77 runtimes are served from `assets/vendor/`; do not reintroduce a runtime CDN dependency. An invalid or oversized geometric model must never block semantic analysis or exports.
- Keep the default AI profile genuinely smaller than the source IFC. Repeated identity fields belong in the element table and other tables reference `stepIdElemento`; the complete-property profile must remain explicitly marked as an audit output that may be larger.
- Keep the visual bridge traceable through source IFC GlobalId and STEP express identifiers. Do not upload the model or replace those identifiers with generated ones.
- Keep IFC processing local in the browser. Never upload IFC files, geometry, drawings or BIM data to an external service.
- Preserve the existing human interface and avoid visible Agent Ready promotion in headers, footers, landing pages, tool cards or the sitemap.
- Do not invent, rename or document a tool without verifying it in `tools/ifc-drawing/index.html` and `tools/ifc-drawing/assets/js/app.js`.
- Do not expose internal state or `window.__HEFESTO_IFC_DRAWING_QA__` publicly. The existing QA object must remain restricted to `file:`, localhost, `127.0.0.1` or the explicit `?qa` query.
- Do not change projection, dimension, sheet, PDF, SVG, DXF or 3D engine logic unless the task explicitly requires it and regression checks are available.
- If `assets/js/app.js` or the CSS changes, update only the corresponding cache-busting query in `tools/ifc-drawing/index.html`.
- If IFC2IA Ready JavaScript or CSS changes, update only its matching cache-busting query in `tools/ifc2ia-ready/index.html`.

## Agent Ready layer

The public, non-promoted Agent Ready documentation lives at `agents/`. IFC Drawing is the only application covered by that Agent Ready layer in version 0.4. IFC Energy Model and the separately branded IFC2IA Ready tool are out of scope for agent discovery metadata.

Start with `agents/ifc-drawing/SKILL.md`. Its references are intentionally split for progressive disclosure. `tools/ifc-drawing/agent.json` and `agents/manifest.json` are machine-readable discovery manifests.
