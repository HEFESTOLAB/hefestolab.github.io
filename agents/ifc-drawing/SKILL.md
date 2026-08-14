---
name: hefesto-ifc-drawing
description: >
  Operate HEFESTO IFC Drawing when an AI browser agent needs to open and inspect
  a local IFC model, generate 2D plans, elevations or sections, add manual
  dimensions and text, control IFC visibility and colour, capture a 3D view,
  compose drawing sheets, or export PDF, SVG or DXF technical documentation in
  the HEFESTOLAB browser application.
---

# HEFESTO IFC Drawing

HEFESTO IFC Drawing is a static, client-side browser application with a Spanish user interface. It reads IFC files locally, generates technical views, supports manual annotations and composes drawing sheets.

- Application: <https://hefestolab.github.io/tools/ifc-drawing/>
- Agent guide: <https://hefestolab.github.io/agents/ifc-drawing/>
- Agent Ready version: `0.1`
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
- Compose or refine a sheet: read the sheet entries in [TOOLS.md](TOOLS.md), then [SHEET-COMPOSITION.md](SHEET-COMPOSITION.md).
- Export PDF, SVG or DXF: read the matching export workflow and tool entry.
- Produce a complete drawing set: read [WORKFLOWS.md](WORKFLOWS.md), [DIMENSIONING.md](DIMENSIONING.md), [SHEET-COMPOSITION.md](SHEET-COMPOSITION.md) and [QA-CHECKLIST.md](QA-CHECKLIST.md).
- Diagnose a failed or unavailable operation: read [LIMITATIONS.md](LIMITATIONS.md).

## High-value interaction facts

- 2D zoom: use the mouse wheel over the drawing; zoom is centred on the cursor.
- 2D fit: double-click the drawing, or use `Encuadrar` in the view properties.
- There is no verified 2D pan interaction in this version.
- Manual dimension sequence: activate `Cota`, click reference 1, click reference 2, then click to place the dimension line.
- `Escape` cancels a pending dimension. `F8` toggles ORTO. Holding `Shift` applies temporary ORTO while defining the second point.
- The initial sheet scale is calculated by the existing `chooseScale()` routine; it can then be changed in viewport properties.

## Read-only state

The application root `#app` mirrors a limited set of real state values in `data-hefesto-*` attributes: Agent Ready flag, mode, draw tool, model-loaded flag, busy flag, SNAP, ORTO, and active drawing/sheet IDs when present. Treat them as observations, never as controls. Continue to verify visible results.

## Discovery boundary

The page declares the guide through `rel="help"`, HEFESTO-specific metadata, embedded JSON, `agent.json`, `llms.txt` and the general Agent Ready manifest. These mechanisms improve discoverability but do not guarantee that every current browser agent will automatically load this Skill. The explicit guide URL remains the reliable fallback.
