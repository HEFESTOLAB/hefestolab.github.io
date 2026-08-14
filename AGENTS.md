# HEFESTOLAB repository guidance

This repository is a static GitHub Pages site. Its publishable root contains `.nojekyll`, the human website, localized pages, legal content and browser tools. Do not add a required build step, server, framework or backend.

## Stability rules

- Preserve every existing public URL and relative path. In particular, do not move `tools/ifc-drawing/`.
- Keep IFC processing local in the browser. Never upload IFC files, geometry, drawings or BIM data to an external service.
- Preserve the existing human interface and avoid visible Agent Ready promotion in headers, footers, landing pages, tool cards or the sitemap.
- Do not invent, rename or document a tool without verifying it in `tools/ifc-drawing/index.html` and `tools/ifc-drawing/assets/js/app.js`.
- Do not expose internal state or `window.__HEFESTO_IFC_DRAWING_QA__` publicly. The existing QA object must remain restricted to `file:`, localhost, `127.0.0.1` or the explicit `?qa` query.
- Do not change projection, dimension, sheet, PDF, SVG, DXF or 3D engine logic unless the task explicitly requires it and regression checks are available.
- If `assets/js/app.js` or the CSS changes, update only the corresponding cache-busting query in `tools/ifc-drawing/index.html`.

## Agent Ready layer

The public, non-promoted Agent Ready documentation lives at `agents/`. IFC Drawing is the only Agent Ready application in version 0.1. IFC Energy Model is out of scope.

Start with `agents/ifc-drawing/SKILL.md`. Its references are intentionally split for progressive disclosure. `tools/ifc-drawing/agent.json` and `agents/manifest.json` are machine-readable discovery manifests.
