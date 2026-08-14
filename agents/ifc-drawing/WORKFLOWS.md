# Verified workflows

Use [TOOLS.md](TOOLS.md) for exact selectors and interactions. Use specialist guidance only when the workflow requires it.

## WF-001 — Open IFC

- **Objective:** Load a local IFC into the 3D model workspace.
- **Preconditions:** Site served over HTTP; supported browser; local IFC available; existing CDN dependencies reachable.
- **Tools:** `TOOL-OPEN-IFC`, `TOOL-FIT-MODEL`.
- **Steps:** Activate `Abrir IFC`; complete the system file picker; wait while the busy state and progress panel run; do not issue conflicting actions; enter `Modelo` and use `Encuadrar` if needed.
- **Validation:** `#app[data-hefesto-model-loaded="true"]`; file name/schema shown; 3D model visible; status reports `IFC cargado` or ready; levels/views appear when detected.
- **Completion:** Correct model is loaded and inspectable.
- **Frequent errors:** Attempting real IFC under `file://`; assuming the file-picker click loaded a file; interrupting conversion; treating unavailable IFC categories as a failed model load.

## WF-002 — Generate plan

- **Objective:** Create a vector plan from the loaded IFC.
- **Preconditions:** WF-001 complete; valid model bounds; desired storey known or free near/far range understood.
- **Tools:** `TOOL-CREATE-PLAN`, `TOOL-OPEN-VIEW`, `TOOL-NAVIGATE-2D`.
- **Steps:** In `Modelo`, activate `+ Planta`; name the view; select a level for the automatic plan band, or leave it free and set optional near/far values; retain or deliberately change the edge threshold; create the view; wait for projection; fit the result.
- **Validation:** Active mode is `drawing`; title/type show a plan; state is vectorial rather than pending; visible-line count is non-zero; geometry matches the intended level.
- **Completion:** Plan is generated, fitted and technically usable.
- **Frequent errors:** Using Demo; creating a second plan for a level that already has one; using arbitrary near/far values; judging a pending tree item as a finished view.

## WF-003 — Dimension plan

- **Objective:** Dimension the requested plan to an appropriate technical level.
- **Preconditions:** WF-002 complete; active vector plan; scope agreed.
- **Tools:** `TOOL-DIMENSION`, `TOOL-SNAP`, `TOOL-ORTHO`, `TOOL-SELECT-ANNOTATION`, `TOOL-NAVIGATE-2D`.
- **Steps:** Read [DIMENSIONING.md](DIMENSIONING.md); inspect the full plan; dimension in passes—overall, partial chains, openings, interiors, QA; use wheel zoom around each target; place each dimension with two reference clicks and a placement click; correct offsets/text in properties if needed.
- **Validation:** Values are plausible; references align with intended geometry; overall and partial systems are present; no important item in scope remains undefined; no excessive overlap.
- **Completion:** Dimension coverage and legibility both pass [QA-CHECKLIST.md](QA-CHECKLIST.md).
- **Frequent errors:** Stopping after two overall dimensions; missing openings/interiors; free-clicking near geometry without checking SNAP; leaving a pending dimension; creating duplicates.

## WF-004 — Generate elevation

- **Objective:** Create a vector elevation from a cardinal orientation.
- **Preconditions:** WF-001 complete.
- **Tools:** `TOOL-CREATE-ELEVATION`, `TOOL-OPEN-VIEW`, `TOOL-NAVIGATE-2D`.
- **Steps:** In `Modelo`, activate `+ Alzado`; choose North, South, West or East as exposed by the Spanish modal; optionally set near/far; name and create; wait for projection; fit and inspect.
- **Validation:** Correct elevation orientation, non-zero linework and no unintended depth clipping.
- **Completion:** Elevation is vectorial and suitable for annotation or sheet placement.
- **Frequent errors:** Confusing the visible label with the projection direction; over-limiting near/far; using Demo.

## WF-005 — Dimension elevation

- **Objective:** Define the elevation's principal horizontal and vertical construction information.
- **Preconditions:** WF-004 complete.
- **Tools:** `TOOL-DIMENSION`, `TOOL-SNAP`, `TOOL-ORTHO`, `TOOL-SELECT-ANNOTATION`, `TOOL-NAVIGATE-2D`.
- **Steps:** Read the elevation section in [DIMENSIONING.md](DIMENSIONING.md); add overall width/height; add levels and identifiable opening/eave/ridge dimensions; organise horizontal and vertical chains; perform a second full review.
- **Validation:** No unverified feature is dimensioned; vertical positions and overall geometry are clear; chains remain legible.
- **Completion:** Required elevation information is dimensionally defined and readable.
- **Frequent errors:** Guessing obscured sill or lintel positions; omitting levels; crowding vertical chains.

## WF-006 — Generate section

- **Objective:** Create a vector section from a defined cutting band.
- **Preconditions:** WF-001 complete; intended longitudinal/transverse direction and cut position understood.
- **Tools:** `TOOL-CREATE-SECTION`, `TOOL-OPEN-VIEW`, `TOOL-NAVIGATE-2D`.
- **Steps:** In `Modelo`, activate `+ Sección`; choose transverse/normal Z or longitudinal/normal X; set cut position or accept the model centre; set visible depth; name and create; wait for projection; fit and inspect. Dimension only if requested, using the section criteria in [DIMENSIONING.md](DIMENSIONING.md).
- **Validation:** The cut passes through the intended geometry; depth does not include irrelevant background or omit required elements; linework is non-zero.
- **Completion:** Section is correctly located, vectorial and readable.
- **Frequent errors:** Treating depth as cut position; accepting the model centre when the task needs a specific space; using Demo; assuming cut contents without inspecting.

## WF-007 — Compose sheet

- **Objective:** Arrange existing views on a technically legible sheet.
- **Preconditions:** Required views generated; annotations substantially complete.
- **Tools:** `TOOL-CREATE-SHEET`, `TOOL-ADD-VIEW`, `TOOL-MOVE-RESIZE-VIEWPORT`, `TOOL-SHEET-PROPERTIES`, `TOOL-VIEWPORT-PROPERTIES`.
- **Steps:** Read [SHEET-COMPOSITION.md](SHEET-COMPOSITION.md); create a sheet; set number, title, project, author, format and orientation; add views from the modal or drag tree views to paper; review the automatically selected initial scales; move/resize/recentre and change scales as justified.
- **Validation:** All content stays inside margins and clear of the title block; view/scale labels show; no overlaps; information is readable; format and orientation suit the content.
- **Completion:** Sheet passes the Sheet section of [QA-CHECKLIST.md](QA-CHECKLIST.md).
- **Frequent errors:** Assuming one format or scale fits all projects; resizing without rechecking crop; covering the title block; adding duplicates.

## WF-008 — Export PDF

- **Objective:** Download the active sheet as PDF.
- **Preconditions:** WF-007 complete; active sheet; jsPDF loaded; hidden-line state set intentionally.
- **Tools:** `TOOL-EXPORT-PDF`.
- **Steps:** Select the target sheet in the tree; review sheet and hidden-line state; activate `Exportar PDF`; wait for progress to complete; inspect the browser download when possible.
- **Validation:** Success toast/status; download generated; filename reflects sheet number and title.
- **Completion:** Requested PDF exists and corresponds to the active sheet.
- **Frequent errors:** Exporting the wrong active sheet; expecting a multi-sheet PDF; missing downloads because browser policy blocked or hid them.

## WF-009 — Export SVG

- **Objective:** Download the active vector 2D view as SVG.
- **Preconditions:** Generated plan/elevation/section active; not a 3D capture; hidden-line state set intentionally.
- **Tools:** `TOOL-EXPORT-SVG`.
- **Steps:** Open the target 2D view; inspect fit and hidden lines; activate `SVG`; inspect download when possible.
- **Validation:** Success toast and `.svg` download named from the view.
- **Completion:** SVG represents the intended active view and annotations.
- **Frequent errors:** Active view is pending or raster 3D; exporting the wrong tree view; overlooking the effect of `Ocultas`.

## WF-010 — Export DXF

- **Objective:** Download the active vector 2D view as DXF.
- **Preconditions:** Generated vector 2D view active; hidden-line state set intentionally.
- **Tools:** `TOOL-EXPORT-DXF`.
- **Steps:** Open and review the target view; activate `DXF 2D`; inspect download when possible.
- **Validation:** Success toast states model units are metres; `.dxf` download generated; annotations and desired hidden lines included.
- **Completion:** DXF corresponds to the active view.
- **Frequent errors:** Expecting a 3D DXF; active 3D capture; wrong hidden-line setting; treating metre model units as millimetres downstream.

## WF-011 — Produce a complete basic drawing set

- **Objective:** Create the appropriate basic plans, elevations, sections, annotations, sheets and exports for the user's model and brief.
- **Preconditions:** IFC and deliverables available; requested scope understood.
- **Tools:** All workflow-specific tools, selected deliberately.
- **Steps:** Complete WF-001; inventory levels and project geometry; generate only necessary plans/elevations/sections; inspect each view; dimension using [DIMENSIONING.md](DIMENSIONING.md); add text sparingly; optionally capture a useful NTS 3D view; compose sheets using [SHEET-COMPOSITION.md](SHEET-COMPOSITION.md); run the complete [QA-CHECKLIST.md](QA-CHECKLIST.md); export requested formats.
- **Validation:** Every requested view exists and is correct; dimensioning is technically sufficient; sheets are legible; outputs complete without errors.
- **Completion:** The full requested set passes QA and the generated downloads are accounted for.
- **Frequent errors:** Generating every possible view without purpose; under-dimensioning; using rigid layouts; assuming browser download success; failing to reinspect after scale or viewport changes.
