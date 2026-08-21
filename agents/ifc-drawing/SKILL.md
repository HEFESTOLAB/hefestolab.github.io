---
name: hefesto-ifc-drawing
description: >
  Operate HEFESTO IFC Drawing when an AI browser agent needs to open and inspect
  a local IFC model, generate 2D plans, elevations or sections, add manual
  linear, angular, diameter and radius dimensions, dimension chains, room areas and text, control IFC visibility,
  area-label visibility and colour, colour IFC elements and categories in 3D,
  reconnect the source IFC, compose drawing sheets with four-sided viewport
  cropping, movable view labels and area schedules,
  or export PDF, SVG or DXF technical documentation in
  the HEFESTOLAB browser application.
---

# HEFESTO IFC Drawing

HEFESTO IFC Drawing is a static, client-side browser application with a Spanish user interface. It reads IFC files locally, generates technical views, supports manual annotations and composes drawing sheets.

- Application: <https://hefestolab.github.io/tools/ifc-drawing/>
- Agent guide: <https://hefestolab.github.io/agents/ifc-drawing/>
- Agent Ready version: `0.5`
- UI language: Spanish (`Modelo`, `Documentación`, `Planos`)

## Operating principles

1. Operate the same interface used by humans. Do not seek a hidden execution API.
2. Never upload the user's IFC, geometry or drawings. The file is processed locally in the browser.
3. Verify visible state after every material action. Do not infer success from a click alone.
4. Use the Demo to learn and test dimensions, annotations, sheets and exports. A real IFC is required for new projections and 3D captures.
5. Use SNAP for valid geometric references and ORTO when a horizontal or vertical dimension is intended.
6. Preserve technical judgement. Choose views, scale, sheet size, orientation and layout for the project rather than following a fixed template.
7. Finish with the task-relevant checks in [QA-CHECKLIST.md](QA-CHECKLIST.md).

## Progressive disclosure

Do not load every reference file unless the current task requires it.

- Discover or activate a control: read the relevant entry in [TOOLS.md](TOOLS.md).
- Open an IFC or generate a view: read [WORKFLOWS.md](WORKFLOWS.md) and only the tool entries it links.
- Dimension a plan, elevation or section: read the dimension and SNAP/ORTO entries in [TOOLS.md](TOOLS.md), then [DIMENSIONING.md](DIMENSIONING.md).
- Create rooms or an area schedule: read the area and schedule entries in [TOOLS.md](TOOLS.md), then the matching workflow in [WORKFLOWS.md](WORKFLOWS.md).
- Compose or refine a sheet: read the sheet entries in [TOOLS.md](TOOLS.md), then [SHEET-COMPOSITION.md](SHEET-COMPOSITION.md).
- Export PDF, SVG or DXF: read the matching export workflow and tool entry.
- Produce a complete drawing set: read [WORKFLOWS.md](WORKFLOWS.md), [DIMENSIONING.md](DIMENSIONING.md), [SHEET-COMPOSITION.md](SHEET-COMPOSITION.md) and [QA-CHECKLIST.md](QA-CHECKLIST.md).
- Diagnose a failed or unavailable operation: read [LIMITATIONS.md](LIMITATIONS.md).

## High-value interaction facts

- 2D zoom: use the mouse wheel over the drawing; zoom is centred on the cursor.
- 2D pan: with `Seleccionar`, drag blank drawing space with the primary button; middle-button drag, `Shift`+drag and `Space`+drag also pan without changing tools.
- 2D fit: double-click the drawing, or use `Encuadrar` in the view properties.
- In a real IFC projection, click linework with `Seleccionar` to highlight the exact IFC element and expose per-view hide/show/colour controls. The 3D picker remains available as a secondary route.
- With `Seleccionar`, clicking true blank space clears both IFC and annotation selection. Do not confuse a short click with a drag used for pan.
- Linear, diameter and radius dimension sequence: activate the corresponding tool, click reference 1, click reference 2, then click to place the dimension line. Diameter labels use `Ø`; radius labels use `R`.
- Angular dimension sequence: activate `∠ Angular`, click the vertex, one point on each ray, then a fourth point to set the arc radius.
- Chained dimension sequence: activate `Cota cadena`, click consecutive geometric references, then click blank space to place and finish. With `Seleccionar`, dragging any chain segment moves every segment together.
- Manual area sequence: activate `Área`, click the room perimeter, close on the first point, double-click or press `Enter`, then enter room number/name. `IfcSpace` geometry is imported automatically when a plan is generated and can be refreshed from `Importar IfcSpace`.
- `Escape` cancels a pending dimension. `F8` toggles ORTO. Holding `Shift` applies temporary ORTO while defining the second point.
- Completed dimensions can be dragged perpendicular to their witness points. PDF dimension text is emitted at a nominal height of `2.1 mm` regardless of viewport scale.
- Sheets support wheel zoom, toolbar fit/zoom controls and pan with middle-button, `Shift`+drag or `Space`+drag.
- On a sheet, drag the view label itself to move its title and scale together without moving the viewport. Exact label X/Y values and a reset action are available in viewport properties.
- A selected viewport has independent left, right, top and bottom crop handles. For a captured 3D image, `Rellenar · recortar` keeps the image large and the X/Y focus controls choose the visible portion.
- In the 3D model, select an element and apply a persistent colour to that exact item or its IFC category. Saved colours are restored after reconnecting the source IFC and are visible in new 3D captures.
- Area labels can be hidden for the complete plan or for one selected manual/`IfcSpace` area. The polygon and linked schedule row remain present, and the visibility choice is preserved in sheet/PDF/SVG/DXF output.
- Use `Guardar proyecto` to preserve views, annotations, areas, dimension chains, schedules, visibility/colour settings and sheets in `.hefesto-drawing.json`; use `Abrir proyecto` to continue later. The source IFC geometry is not embedded: after reopening, use `Reconectar IFC` to reattach it without replacing the saved documentation.
- The initial sheet scale is calculated by the existing `chooseScale()` routine; it can then be changed in viewport properties.

## Read-only state

The application root `#app` mirrors a limited set of real state values in `data-hefesto-*` attributes: Agent Ready flag, mode, draw tool, model-loaded flag, project-detached flag, busy flag, SNAP, ORTO, active drawing/sheet IDs, selected IFC key, sheet zoom and project format when present. Treat them as observations, never as controls. Continue to verify visible results.

## Discovery boundary

The page declares the guide through `rel="help"`, HEFESTO-specific metadata, embedded JSON, `agent.json`, `llms.txt` and the general Agent Ready manifest. These mechanisms improve discoverability but do not guarantee that every current browser agent will automatically load this Skill. The explicit guide URL remains the reliable fallback.
