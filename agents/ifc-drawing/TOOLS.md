# Verified tool reference

This inventory was derived from `tools/ifc-drawing/index.html` and `assets/js/app.js` in HEFESTOLAB v2.9.2. It documents only controls and interactions present in that code. The visible UI is Spanish. Dynamic selectors exist only while their corresponding inspector or view is open.

## TOOL-LOAD-DEMO

- **Tool ID:** `TOOL-LOAD-DEMO`
- **Visible Spanish label:** `Demo`, `Cargar demo`, `Probar sin IFC`
- **DOM selector:** `#btnDemo`, `#btnDemoSide`, `#btnDemoStart`
- **Purpose:** Load prepared vector plan, section and elevation views plus an A3 demo sheet.
- **Required mode:** Any initial state.
- **Preconditions:** None; no IFC or network-loaded engine is required.
- **Activation:** Click any Demo control.
- **Interaction:** One click; wait for `Demo cargada`.
- **Expected result:** Drawing mode opens with demo views, annotations and a sheet.
- **Success indicator:** Project name `HEFESTO · Proyecto de demostración`; file meta `Demo vectorial · sin IFC`; success toast.
- **Cancel method:** None after activation; opening a real IFC replaces the session content.
- **Relevant keyboard shortcuts:** None.
- **Agent notes:** Use it to test dimensions, text, sheets and exports.
- **Known limitations:** No 3D geometry; cannot generate new projections or capture a 3D view.

## TOOL-OPEN-IFC

- **Tool ID:** `TOOL-OPEN-IFC`
- **Visible Spanish label:** `Abrir IFC`, `Abrir archivo IFC`
- **DOM selector:** `label[for="ifcInput"]`, `#btnOpenIfcSide`, hidden `#ifcInput`
- **Purpose:** Select and load one local `.ifc` file for in-browser processing.
- **Required mode:** Any.
- **Preconditions:** Site served over HTTP; local file available; browser can reach the pinned CDN engine dependencies.
- **Activation:** Click a label or side button, then complete the operating-system file picker.
- **Interaction:** Select one IFC and wait through metadata, engine, geometry, property, conversion and fit phases.
- **Expected result:** Model workspace displays the IFC; detected levels and preset plan/elevation tree entries appear.
- **Success indicator:** `data-hefesto-model-loaded="true"`, model badge/file metadata, `IFC cargado` toast.
- **Cancel method:** Cancel the system file picker before selection. No mid-conversion cancel control exists.
- **Relevant keyboard shortcuts:** None.
- **Agent notes:** File-picker security may require human action. Do not repeat clicks while `data-hefesto-busy="true"`.
- **Known limitations:** Refused under `file://`; one source IFC per session; file is local but engine modules come from existing CDNs.

## TOOL-SWITCH-MODE

- **Tool ID:** `TOOL-SWITCH-MODE`
- **Visible Spanish label:** `Modelo`, `Documentación`, `Planos`
- **DOM selector:** `[data-mode="model"]`, `[data-mode="drawing"]`, `[data-mode="sheet"]`
- **Purpose:** Switch among 3D model, active 2D view and active sheet workspaces.
- **Required mode:** Any.
- **Preconditions:** The destination has useful content; otherwise an empty state is shown.
- **Activation:** Click the desired tab.
- **Interaction:** One click.
- **Expected result:** Matching context toolbar and workspace become visible.
- **Success indicator:** Active tab class and `#app[data-hefesto-mode]` value.
- **Cancel method:** Select another mode.
- **Relevant keyboard shortcuts:** None.
- **Agent notes:** Opening a tree view or sheet also changes mode.
- **Known limitations:** Switching mode does not create content.

## TOOL-FIT-MODEL

- **Tool ID:** `TOOL-FIT-MODEL`
- **Visible Spanish label:** `Encuadrar`, `Encuadrar modelo`, `Actualizar 3D`
- **DOM selector:** `#btnFit`, dynamic `#inspFit`, dynamic `#inspRefresh3d`
- **Purpose:** Fit a valid loaded model in the 3D camera; optionally refresh canvas/Fragments sizing.
- **Required mode:** `model` for visual verification.
- **Preconditions:** Real IFC loaded with valid 3D bounds.
- **Activation:** Click `Encuadrar`; use `Actualizar 3D` only when the inspector exposes it and the canvas needs refresh.
- **Interaction:** One click.
- **Expected result:** Model camera frames the full model.
- **Success indicator:** Model visibly framed; `Modelo encuadrado` toast when invoked from a fit button.
- **Cancel method:** None; change the camera afterward.
- **Relevant keyboard shortcuts:** None.
- **Agent notes:** This is 3D fit, not 2D fit.
- **Known limitations:** Unavailable for Demo or invalid model bounds.

## TOOL-CREATE-LEVEL

- **Tool ID:** `TOOL-CREATE-LEVEL`
- **Visible Spanish label:** `+ Nivel`, `Crear nivel`
- **DOM selector:** `#btnCreateLevel`, `#btnLevelTree`, dynamic `#inspLevel`
- **Purpose:** Add a local documentation level, optionally creating its plan.
- **Required mode:** Usually `model`.
- **Preconditions:** None for a level; a real IFC is required to create its plan.
- **Activation:** Click a create-level control.
- **Interaction:** Enter name and elevation in metres; choose whether to create a plan; click `Crear`.
- **Expected result:** Sorted level tree entry; optional plan if model geometry exists.
- **Success indicator:** `Nivel creado` toast and new `[data-level]` item.
- **Cancel method:** `Cancelar`, `Escape`, backdrop or modal close.
- **Relevant keyboard shortcuts:** `Escape` closes the modal.
- **Agent notes:** Select the level to edit name/elevation or create its plan.
- **Known limitations:** Local session data only; never modifies the IFC.

## TOOL-EDIT-LEVEL

- **Tool ID:** `TOOL-EDIT-LEVEL`
- **Visible Spanish label:** Level property fields, `Crear planta`, `Eliminar`
- **DOM selector:** dynamic `#levelEditName`, `#levelEditElev`, `#levelMakePlan`, `#levelDelete`, `#levelClose`
- **Purpose:** Edit a documentation level, create its plan, or delete a local level.
- **Required mode:** `model`, selected `[data-level]`.
- **Preconditions:** Existing level; model loaded for `Crear planta`; only LOCAL levels expose delete.
- **Activation:** Click a level tree item, then use the inspector.
- **Interaction:** Change fields or click an action.
- **Expected result:** Tree updates; plan appears; or local level and its linked plans are removed.
- **Success indicator:** Updated tree/property values or corresponding toast.
- **Cancel method:** `Cerrar`; field changes already committed on change are not rolled back.
- **Relevant keyboard shortcuts:** None.
- **Agent notes:** Editing an IFC-derived level is still local to this session.
- **Known limitations:** Deleting a local level also removes drawings linked by its level ID; no undo.

## TOOL-CREATE-PLAN

- **Tool ID:** `TOOL-CREATE-PLAN`
- **Visible Spanish label:** `+ Planta`, `Crear planta`
- **DOM selector:** `#btnCreatePlan`, dynamic `#inspPlan`, dynamic modal `#projName`, `#projOri`, `#projAngle`, `#projLevel`, `#projNear`, `#projFar`
- **Purpose:** Create a vector top projection by detected level or free projection range.
- **Required mode:** `model` for activation; result opens in `drawing`.
- **Preconditions:** Real IFC loaded.
- **Activation:** Click create-plan, complete modal, click `Crear vista`.
- **Interaction:** Prefer a verified level; otherwise use optional near/far; set name and edge threshold deliberately.
- **Expected result:** Pending plan is projected, fitted and activated.
- **Success indicator:** Vectorial plan inspector, non-zero line count, `Vista generada` toast.
- **Cancel method:** `Cancelar`, `Escape`, backdrop or modal close before creation.
- **Relevant keyboard shortcuts:** `Escape` closes modal.
- **Agent notes:** Level plans use an automatically calculated band. An existing plan for the same level is opened instead of duplicated.
- **Known limitations:** Demo unsupported; quality depends on IFC geometry and projection.

## TOOL-CREATE-ELEVATION

- **Tool ID:** `TOOL-CREATE-ELEVATION`
- **Visible Spanish label:** `+ Alzado`, `Crear alzado`
- **DOM selector:** `#btnCreateElevation`, dynamic `#inspElev`; projection modal fields `#projName`, `#projOri`, `#projAngle`, `#projNear`, `#projFar`
- **Purpose:** Create a vector North, South, West or East elevation.
- **Required mode:** `model`; result opens in `drawing`.
- **Preconditions:** Real IFC loaded.
- **Activation:** Click, choose orientation/settings, then `Crear vista`.
- **Interaction:** Optionally bound depth with near/far; wait for projection.
- **Expected result:** Named vector elevation activated.
- **Success indicator:** Non-zero vector linework and `Vista generada` toast.
- **Cancel method:** Modal cancel/close, `Escape` or backdrop before creation.
- **Relevant keyboard shortcuts:** `Escape` closes modal.
- **Agent notes:** Inspect orientation visually; do not rely only on the chosen label.
- **Known limitations:** Demo unsupported; near/far can unintentionally clip geometry.

## TOOL-CREATE-SECTION

- **Tool ID:** `TOOL-CREATE-SECTION`
- **Visible Spanish label:** `+ Sección`, `Crear sección`
- **DOM selector:** `#btnCreateSection`, dynamic `#inspSection`; modal `#projName`, `#projOri`, `#projAngle`, `#projPos`, `#projDepth`
- **Purpose:** Create a vector section from a transverse/normal-Z or longitudinal/normal-X cutting band.
- **Required mode:** `model`; result opens in `drawing`.
- **Preconditions:** Real IFC loaded; desired cut understood.
- **Activation:** Click, set orientation/position/depth, click `Crear vista`.
- **Interaction:** Blank position uses model centre; depth defaults to 0.50 m and is clamped to model extent.
- **Expected result:** Section projection generated and fitted.
- **Success indicator:** Vectorial section with expected cut content; success toast.
- **Cancel method:** Modal cancel/close, `Escape` or backdrop before creation.
- **Relevant keyboard shortcuts:** `Escape` closes modal.
- **Agent notes:** Inspect both cut location and visible depth after generation.
- **Known limitations:** Demo unsupported; section is defined by projector near/far band, not a drawn section line.

## TOOL-CAPTURE-3D-VIEW

- **Tool ID:** `TOOL-CAPTURE-3D-VIEW`
- **Visible Spanish label:** `+ Vista 3D`, `Capturar vista 3D`
- **DOM selector:** `#btnCreate3DView`, dynamic `#insp3D`, modal `#view3dName`
- **Purpose:** Capture the current 3D camera as a JPEG view for sheets.
- **Required mode:** Uses the `model` workspace.
- **Preconditions:** Real IFC loaded and visible canvas with valid dimensions.
- **Activation:** Set the 3D camera, click capture, name it, click `Capturar`.
- **Interaction:** The grid is hidden during capture; wait for completion.
- **Expected result:** New `Vistas 3D` tree item with raster preview.
- **Success indicator:** `Vista 3D creada` toast and resolution in inspector.
- **Cancel method:** Modal cancel before capture; afterward use `Eliminar vista` in its inspector.
- **Relevant keyboard shortcuts:** `Escape` closes modal.
- **Agent notes:** The captured camera is fixed; capture again for another viewpoint.
- **Known limitations:** Real IFC only; raster JPEG; NTS; standalone SVG/DXF unavailable.

## TOOL-SELECT-IFC-ELEMENT

- **Tool ID:** `TOOL-SELECT-IFC-ELEMENT`
- **Visible Spanish label:** `Seleccionar elemento en 3D`
- **DOM selector:** dynamic `#selectIfc3d`, then `#viewer3d canvas`; dynamic `#ifcClearSelection`, `#ifcOpenDrawing`
- **Purpose:** Select one rendered IFC element and expose category, GlobalId and local ID.
- **Required mode:** `model` for picking.
- **Preconditions:** Real IFC loaded; active generated 2D view if visibility/colour changes are intended.
- **Activation:** From 2D view properties click `Seleccionar elemento en 3D`, then click geometry in the model.
- **Interaction:** A click without pointer movement performs ray selection.
- **Expected result:** Element highlight and inspector details; optional return to active drawing.
- **Success indicator:** Status selection text and `Elemento IFC` inspector.
- **Cancel method:** `Cerrar selección` or click empty space.
- **Relevant keyboard shortcuts:** None.
- **Agent notes:** Camera drag is ignored as a selection when movement exceeds four pixels.
- **Known limitations:** Requires pickable geometry and engine IDs; not available in Demo.

## TOOL-CONTROL-IFC-DISPLAY

- **Tool ID:** `TOOL-CONTROL-IFC-DISPLAY`
- **Visible Spanish label:** Category eye/colour controls; `Ocultar elemento`, `Mostrar elemento`, `Aplicar color`, `Color original`, `Restablecer vista`
- **DOM selector:** dynamic `[data-cat-vis]`, `[data-cat-color-on]`, `[data-cat-color]`, `#ifcHideInView`, `#ifcShowInView`, `#ifcApplyColor`, `#ifcClearColor`, `#resetIfcDisplay`
- **Purpose:** Change category or exact-element visibility/colour in one vector 2D view.
- **Required mode:** Active generated 2D view; model mode temporarily for exact-element picking.
- **Preconditions:** Real IFC with usable categories/IDs.
- **Activation:** Use view inspector controls.
- **Interaction:** Each change reprojects the view; wait for completion before another change.
- **Expected result:** Linework and exports reflect per-view visibility/colour.
- **Success indicator:** Updated drawing and success toast naming the change.
- **Cancel method:** Reverse the control or use `Restablecer vista`; no general undo stack.
- **Relevant keyboard shortcuts:** None.
- **Agent notes:** Changes are view-specific and local; verify PDF/SVG/DXF representation after changes.
- **Known limitations:** Missing IFC classification may leave no category controls; filters can hide all geometry and fail projection.

## TOOL-OPEN-VIEW

- **Tool ID:** `TOOL-OPEN-VIEW`
- **Visible Spanish label:** Dynamic view names under `VISTAS`
- **DOM selector:** dynamic `[data-view]`
- **Purpose:** Generate a pending view if necessary and open it in drawing mode; also provide drag source for sheets.
- **Required mode:** Any with project tree visible.
- **Preconditions:** Existing view entry; real IFC for a pending projection.
- **Activation:** Click the view name; or drag it to an active sheet.
- **Interaction:** Wait if the item says `generar`.
- **Expected result:** Selected view becomes active; drawing mode opens.
- **Success indicator:** Tree item active, title matches, active drawing ID present.
- **Cancel method:** Select another view or mode.
- **Relevant keyboard shortcuts:** None.
- **Agent notes:** A tree entry alone may be pending; verify vectorial status.
- **Known limitations:** Failed projection leaves the view unusable until its cause is resolved.

## TOOL-NAVIGATE-2D

- **Tool ID:** `TOOL-NAVIGATE-2D`
- **Visible Spanish label:** `Encuadrar` only in view properties; wheel/double-click have no label.
- **DOM selector:** `#drawingSvg`, dynamic `#fit2d`
- **Purpose:** Zoom a 2D drawing around the cursor or fit the whole view.
- **Required mode:** `drawing` with generated vector view.
- **Preconditions:** Active non-pending view.
- **Activation:** Wheel over drawing to zoom; double-click drawing or click inspector `Encuadrar` to fit.
- **Interaction:** Repeated wheel input changes zoom while keeping the cursor location stable.
- **Expected result:** ViewBox changes; double-click restores calculated bounds and padding.
- **Success indicator:** Visible scale/context change or full geometry fitted.
- **Cancel method:** Reverse wheel direction or fit again.
- **Relevant keyboard shortcuts:** None.
- **Agent notes:** This interaction is intentionally explicit because visual agents may not discover it.
- **Known limitations:** No verified 2D pan exists.

## TOOL-SELECT-ANNOTATION

- **Tool ID:** `TOOL-SELECT-ANNOTATION`
- **Visible Spanish label:** `Seleccionar`
- **DOM selector:** `[data-draw-tool="select"]`, drawing annotations `[data-ann]`
- **Purpose:** Select a dimension or text annotation; drag text; edit/delete through inspector.
- **Required mode:** `drawing`.
- **Preconditions:** Active vector 2D view with annotations.
- **Activation:** Activate `Seleccionar`, then click an annotation.
- **Interaction:** Drag text directly; edit selected properties; press Delete/Backspace or inspector `Eliminar` to remove.
- **Expected result:** Selection highlight and matching `Cota` or `Texto` inspector.
- **Success indicator:** `data-hefesto-draw-tool="select"`; annotation-selected styling.
- **Cancel method:** `Escape`, inspector `Cerrar`, or click empty drawing area.
- **Relevant keyboard shortcuts:** `Escape`; `Delete`; `Backspace` when no form field is focused.
- **Agent notes:** Direct drag applies only to text, not dimensions.
- **Known limitations:** No undo; deleting is immediate.

## TOOL-DIMENSION

- **Tool ID:** `TOOL-DIMENSION`
- **Visible Spanish label:** `Cota`
- **DOM selector:** `[data-draw-tool="dimension"]`
- **Purpose:** Create one manual aligned dimension in the active 2D view.
- **Required mode:** `drawing`.
- **Preconditions:** Active generated vector plan/elevation/section; not a 3D capture.
- **Activation:** Click `Cota`.
- **Interaction:** Click first reference, click second reference, then click to place the dimension line. SNAP and ORTO modify reference acquisition.
- **Expected result:** Blue dimension with measured length; it remains selected for offset or text override edits.
- **Success indicator:** `Cota creada` toast and selected dimension inspector.
- **Cancel method:** `Escape` cancels a pending dimension; select/delete removes a completed one.
- **Relevant keyboard shortcuts:** `Escape`; `F8` for ORTO; hold `Shift` for temporary ORTO while defining point 2.
- **Agent notes:** Read [DIMENSIONING.md](DIMENSIONING.md); placing a few dimensions is not automatically a complete task.
- **Known limitations:** Manual only; no auto-dimension; free clicks remain possible when SNAP finds no reference.

## TOOL-TEXT

- **Tool ID:** `TOOL-TEXT`
- **Visible Spanish label:** `Texto`
- **DOM selector:** `[data-draw-tool="text"]`, modal `#modalTextValue`
- **Purpose:** Place a text note in a vector 2D view.
- **Required mode:** `drawing`.
- **Preconditions:** Active generated vector 2D view; not a 3D capture.
- **Activation:** Activate `Texto`, click placement point, enter text, click `Añadir`.
- **Interaction:** Point can SNAP; selected text can later be edited, positioned numerically or dragged with `Seleccionar`.
- **Expected result:** Text annotation appears and propagates to sheet/PDF/SVG/DXF.
- **Success indicator:** Text visible and selected in inspector.
- **Cancel method:** Modal cancel/close, `Escape` or backdrop; delete completed text with selection tools.
- **Relevant keyboard shortcuts:** `Escape` closes modal; Delete/Backspace deletes selected text outside inputs.
- **Agent notes:** Keep notes concise and avoid obscuring geometry.
- **Known limitations:** No rich-text formatting or automatic label placement.

## TOOL-SNAP

- **Tool ID:** `TOOL-SNAP`
- **Visible Spanish label:** `SNAP`
- **DOM selector:** `#toggleSnapBtn`
- **Purpose:** Toggle snapping to visible-line endpoints, midpoints and nearest edge points.
- **Required mode:** `drawing`.
- **Preconditions:** Active vector 2D view.
- **Activation:** Click toggle.
- **Interaction:** Hover near geometry while placing a dimension or text and observe marker/label (`Extremo`, `Medio`, `Arista`).
- **Expected result:** Chosen point resolves to the displayed reference when within tolerance.
- **Success indicator:** `aria-pressed`, status `SNAP ON/OFF`, `data-hefesto-snap`, visible snap marker.
- **Cancel method:** Toggle off.
- **Relevant keyboard shortcuts:** None.
- **Agent notes:** Endpoints outrank midpoints; both outrank edges. SNAP indexes visible lines, not hidden lines.
- **Known limitations:** Pointer tolerance depends on current zoom and canvas size; no intersection/perpendicular/centre snaps are verified.

## TOOL-ORTHO

- **Tool ID:** `TOOL-ORTHO`
- **Visible Spanish label:** `ORTO F8`
- **DOM selector:** `#toggleOrthoBtn`
- **Purpose:** Constrain the second dimension reference horizontally or vertically from the first.
- **Required mode:** `drawing`, dimension tool.
- **Preconditions:** First dimension point chosen.
- **Activation:** Click toggle or press F8; holding Shift invokes temporary ORTO even when the persistent toggle is off.
- **Interaction:** Direction is chosen from the dominant cursor delta; compatible SNAP references are then sought on that axis.
- **Expected result:** Horizontal or vertical guide and dimension axis.
- **Success indicator:** `aria-pressed`, status `ORTO ON/OFF`, `data-hefesto-ortho`; `Horizontal` or `Vertical` in dimension inspector.
- **Cancel method:** Toggle/F8 off; release Shift for temporary constraint.
- **Relevant keyboard shortcuts:** `F8`; hold `Shift` during point 2.
- **Agent notes:** Use only for genuinely orthogonal measurements.
- **Known limitations:** Applies to dimension point definition, not general geometry editing.

## TOOL-HIDDEN-LINES

- **Tool ID:** `TOOL-HIDDEN-LINES`
- **Visible Spanish label:** `Ocultas`
- **DOM selector:** `#toggleHidden`
- **Purpose:** Show or omit projected hidden lines in drawing, sheet and exports.
- **Required mode:** Primarily `drawing`; effect also appears in `sheet` and output.
- **Preconditions:** Active view has hidden segments.
- **Activation:** Change checkbox.
- **Interaction:** One toggle; inspect active view and sheet.
- **Expected result:** Dashed hidden line layer appears/disappears and the same choice affects PDF, SVG and DXF.
- **Success indicator:** Checkbox state and visible dashed linework.
- **Cancel method:** Toggle back.
- **Relevant keyboard shortcuts:** None.
- **Agent notes:** Set intentionally before export.
- **Known limitations:** Does not regenerate geometry; only controls existing projected hidden segments.

## TOOL-EDIT-VIEW

- **Tool ID:** `TOOL-EDIT-VIEW`
- **Visible Spanish label:** View name, `Encuadrar`, `Añadir a plano`, export actions, `Eliminar vista`
- **DOM selector:** dynamic `#viewName`, `#fit2d`, `#addSheetView`, `#svg2`, `#dxf2`; 3D variants `#viewName3d`, `#addSheetView3d`, `#deleteView3d`
- **Purpose:** Rename and act on the active view from its inspector.
- **Required mode:** `drawing` with active view.
- **Preconditions:** Existing view.
- **Activation:** Change name or click an action.
- **Interaction:** Fields commit on change; buttons delegate to the documented fit/add/export operations.
- **Expected result:** Tree/title updates or requested action runs.
- **Success indicator:** New view name, fitted view, added viewport or export toast.
- **Cancel method:** Rename again; completed exports cannot be recalled; 3D deletion has no undo.
- **Relevant keyboard shortcuts:** None.
- **Agent notes:** A 3D view inspector exposes deletion; the inspected 2D view does not expose a delete button.
- **Known limitations:** 3D views are NTS and cannot use 2D drawing tools or SVG/DXF export.

## TOOL-EDIT-ANNOTATION

- **Tool ID:** `TOOL-EDIT-ANNOTATION`
- **Visible Spanish label:** `Desfase (m)`, `Texto`, `Contenido`, `X`, `Y`, `Cerrar`, `Eliminar`
- **DOM selector:** dynamic `#annOffset`, `#annText`, `#annContent`, `#annX`, `#annY`, `#annBack`, `#annDelete`
- **Purpose:** Edit a selected dimension offset/text override or selected note content/position.
- **Required mode:** `drawing`, selected annotation.
- **Preconditions:** Completed dimension or text selected with `Seleccionar`.
- **Activation:** Use inspector fields/buttons.
- **Interaction:** Dimension edits update on input; text coordinates update on change.
- **Expected result:** Drawing and sheet annotations update immediately.
- **Success indicator:** Visible annotation and inspector values agree.
- **Cancel method:** `Cerrar` only clears selection; it does not roll back edits. Re-enter the prior value manually if needed.
- **Relevant keyboard shortcuts:** Delete/Backspace can remove selected annotation outside an input.
- **Agent notes:** A blank dimension text override restores the automatic measurement label.
- **Known limitations:** No undo history.

## TOOL-CREATE-SHEET

- **Tool ID:** `TOOL-CREATE-SHEET`
- **Visible Spanish label:** `+ Plano`, `+ Crear plano`
- **DOM selector:** `#btnNewSheet`, `#btnNewSheetEmpty`
- **Purpose:** Create a new A3 landscape drawing sheet and activate it.
- **Required mode:** Sheet toolbar or empty sheet state.
- **Preconditions:** None; views can be added later.
- **Activation:** Click once.
- **Interaction:** New sheets receive sequential `P-01`, `P-02`, etc., default title and project/author values.
- **Expected result:** Blank sheet with border/title block appears in `Planos`.
- **Success indicator:** New `[data-sheet]` tree entry; active sheet ID; sheet inspector.
- **Cancel method:** No sheet-delete control exists in this version.
- **Relevant keyboard shortcuts:** None.
- **Agent notes:** Configure properties immediately to avoid exporting default metadata.
- **Known limitations:** Default is always A3 landscape; no duplicate/delete/reorder sheet controls are verified.

## TOOL-OPEN-SHEET

- **Tool ID:** `TOOL-OPEN-SHEET`
- **Visible Spanish label:** Dynamic sheet number and name under `PLANOS`
- **DOM selector:** dynamic `[data-sheet]`
- **Purpose:** Activate an existing sheet and open the sheet workspace.
- **Required mode:** Any with project tree visible.
- **Preconditions:** Existing sheet.
- **Activation:** Click the sheet tree item.
- **Interaction:** One click clears viewport selection and renders the sheet.
- **Expected result:** Selected sheet becomes active in `Planos` mode.
- **Success indicator:** Active tree styling and matching active sheet ID/property values.
- **Cancel method:** Select another sheet or mode.
- **Relevant keyboard shortcuts:** None.
- **Agent notes:** Always select the intended sheet immediately before PDF export.
- **Known limitations:** No sheet reorder or delete control is verified.

## TOOL-ADD-VIEW

- **Tool ID:** `TOOL-ADD-VIEW`
- **Visible Spanish label:** `+ Vista`, `Añadir vista`, `Añadir a plano`, `Generar y añadir`
- **DOM selector:** `#btnAddView`, dynamic `#shAdd`, `#addSheetView`, `#addSheetView3d`; modal `#addViewSelect`; drag source `[data-view]`, drop target `#sheetPaper`
- **Purpose:** Place an existing vector or captured 3D view on the active sheet.
- **Required mode:** Usually `sheet`; inspector action can start from `drawing`.
- **Preconditions:** At least one view; an active sheet is created automatically if absent.
- **Activation:** Use add-view modal/action, or drag a tree view onto the paper.
- **Interaction:** A pending vector view is generated first. Drop position becomes viewport centre. Initial dimensions are clamped to the paper.
- **Expected result:** Selected viewport appears and sheet mode activates.
- **Success indicator:** `Vista añadida` toast with scale or NTS; viewport selected.
- **Cancel method:** Cancel modal; after addition use viewport `Quitar`.
- **Relevant keyboard shortcuts:** `Escape` closes modal.
- **Agent notes:** Vector views receive automatic initial scale from `chooseScale()`; 3D views preserve image aspect and are NTS.
- **Known limitations:** No duplicate warning; agent must avoid accidental repeated views.

## TOOL-MOVE-RESIZE-VIEWPORT

- **Tool ID:** `TOOL-MOVE-RESIZE-VIEWPORT`
- **Visible Spanish label:** No button label; direct sheet interaction.
- **DOM selector:** dynamic `.sheet-vp`; lower-right `.vp-resize`
- **Purpose:** Move or resize a viewport on the active sheet.
- **Required mode:** `sheet`.
- **Preconditions:** Active sheet with viewport.
- **Activation:** Pointer-drag viewport body to move; drag `.vp-resize` to resize.
- **Interaction:** Movement is clamped within 10 mm paper margins; minimum size is 35×28 mm. Resizing changes the displayed window.
- **Expected result:** Viewport position/size updates and inspector stays linked.
- **Success indicator:** Viewport selected border and changed X/Y/width/height values.
- **Cancel method:** No drag cancel/undo; restore numerically in inspector.
- **Relevant keyboard shortcuts:** None.
- **Agent notes:** Recheck crop, labels, title block and overlaps after each resize.
- **Known limitations:** No alignment guides, snapping or automatic layout.

## TOOL-SHEET-PROPERTIES

- **Tool ID:** `TOOL-SHEET-PROPERTIES`
- **Visible Spanish label:** `Número`, `Nombre`, `Formato`, `Orientación`, `Proyecto`, `Autor`
- **DOM selector:** dynamic `#shNumber`, `#shName`, `#shFormat`, `#shOri`, `#shProject`, `#shAuthor`
- **Purpose:** Edit active sheet identity, size, orientation and title-block metadata.
- **Required mode:** `sheet` with no viewport selected.
- **Preconditions:** Active sheet.
- **Activation:** Click blank paper/border if needed, then edit fields.
- **Interaction:** Text updates on input; format/orientation on change.
- **Expected result:** Paper and title block rerender.
- **Success indicator:** Inspector, tree label and title block show new values.
- **Cancel method:** Restore prior value manually.
- **Relevant keyboard shortcuts:** None.
- **Agent notes:** Formats: A4, A3, A2, A1, A0; orientations: Horizontal/Vertical.
- **Known limitations:** Changing sheet size does not automatically rearrange viewports.

## TOOL-VIEWPORT-PROPERTIES

- **Tool ID:** `TOOL-VIEWPORT-PROPERTIES`
- **Visible Spanish label:** `Escala`, `X (mm)`, `Y (mm)`, `Ancho (mm)`, `Alto (mm)`, `Recentrar`, `Quitar`
- **DOM selector:** dynamic `#vpScale`, `#vpX`, `#vpY`, `#vpW`, `#vpH`, `#vpCenter`, `#vpDelete`
- **Purpose:** Precisely control selected viewport scale, position, size and view centre.
- **Required mode:** `sheet`, selected viewport.
- **Preconditions:** Existing viewport.
- **Activation:** Click viewport, then edit inspector.
- **Interaction:** Numeric fields commit on change; select a scale; `Recentrar` restores vector view bounds centre; `Quitar` removes viewport.
- **Expected result:** Viewport rerenders with requested window and geometry scale.
- **Success indicator:** Display and inspector agree; label shows selected `1:n` or NTS.
- **Cancel method:** Restore prior values; removed viewport can only be re-added.
- **Relevant keyboard shortcuts:** None.
- **Agent notes:** Verified standard scales: 1:10, 1:20, 1:25, 1:50, 1:75, 1:100, 1:125, 1:150, 1:200, 1:250, 1:500, 1:1000, plus an automatically calculated fallback if present.
- **Known limitations:** 3D raster viewport scale is NTS and `Recentrar` is disabled.

## TOOL-EXPORT-PDF

- **Tool ID:** `TOOL-EXPORT-PDF`
- **Visible Spanish label:** `Exportar PDF`
- **DOM selector:** `#btnExportPdf`, dynamic `#shPdf`
- **Purpose:** Export the active sheet to one PDF file.
- **Required mode:** Sheet context recommended.
- **Preconditions:** Active sheet; jsPDF library loaded. An empty sheet can technically export, but is not a useful deliverable.
- **Activation:** Click export.
- **Interaction:** Wait while vector geometry, annotations, images and title block are drawn.
- **Expected result:** Browser downloads `<sheet number>_<sheet name>.pdf`.
- **Success indicator:** `PDF exportado` status and `PDF generado` toast.
- **Cancel method:** None after generation begins.
- **Relevant keyboard shortcuts:** None.
- **Agent notes:** Hidden-line checkbox affects PDF. Only the active sheet is exported.
- **Known limitations:** Browser download policy may hide/block download; no multi-page all-sheet export.

## TOOL-EXPORT-SVG

- **Tool ID:** `TOOL-EXPORT-SVG`
- **Visible Spanish label:** `SVG`, `Exportar SVG`
- **DOM selector:** `#btnExportSvg`, dynamic `#svg2`
- **Purpose:** Export the active vector 2D view and annotations as standalone SVG.
- **Required mode:** `drawing` with active vector view.
- **Preconditions:** Non-pending plan, elevation or section; not 3D raster.
- **Activation:** Click SVG export.
- **Interaction:** One click generates a browser download.
- **Expected result:** `<view name>.svg` download.
- **Success indicator:** `SVG exportado` toast.
- **Cancel method:** None after click.
- **Relevant keyboard shortcuts:** None.
- **Agent notes:** Hidden-line state controls whether hidden segments are included.
- **Known limitations:** Unavailable for 3D captures or pending/no view.

## TOOL-EXPORT-DXF

- **Tool ID:** `TOOL-EXPORT-DXF`
- **Visible Spanish label:** `DXF 2D`, `Exportar DXF`
- **DOM selector:** `#btnExportDxf`, dynamic `#dxf2`
- **Purpose:** Export active vector 2D geometry and annotations as ASCII DXF.
- **Required mode:** `drawing` with active vector view.
- **Preconditions:** Non-pending plan, elevation or section; not 3D raster.
- **Activation:** Click DXF export.
- **Interaction:** One click generates a browser download.
- **Expected result:** `<view name>.dxf`; `$INSUNITS` is metres and coordinate Y is converted for DXF output.
- **Success indicator:** `DXF 2D exportado` toast stating model units are metres.
- **Cancel method:** None after click.
- **Relevant keyboard shortcuts:** None.
- **Agent notes:** Visible/hidden and coloured line groups become DXF layers; dimensions/text are emitted as basic entities.
- **Known limitations:** 2D only; not a 3D model export; unavailable for 3D captures.

## TOOL-THEME

- **Tool ID:** `TOOL-THEME`
- **Visible Spanish label:** Icon `◐`
- **DOM selector:** `#btnTheme`
- **Purpose:** Toggle light/dark application theme.
- **Required mode:** Any.
- **Preconditions:** None.
- **Activation:** Click icon.
- **Interaction:** One click; preference is stored locally.
- **Expected result:** Theme changes without altering model/document data.
- **Success indicator:** Root `data-theme` toggles `light`/`dark`.
- **Cancel method:** Click again.
- **Relevant keyboard shortcuts:** None.
- **Agent notes:** Cosmetic utility; not part of technical deliverables.
- **Known limitations:** Does not change export colours or content.

## TOOL-PANELS

- **Tool ID:** `TOOL-PANELS`
- **Visible Spanish label:** Chevron controls for Navegador and Propiedades
- **DOM selector:** `#btnCollapseLeft`, `#btnExpandLeft`, `#btnCollapseRight`, `#btnExpandRight`
- **Purpose:** Collapse or restore side panels and resize the workspace.
- **Required mode:** Any.
- **Preconditions:** None.
- **Activation:** Click corresponding chevron.
- **Interaction:** One click; 3D canvas or sheet is resized afterward.
- **Expected result:** Panel visibility changes while application data remains unchanged.
- **Success indicator:** Body class `left-collapsed` or `right-collapsed`; restore button visible.
- **Cancel method:** Use restore chevron.
- **Relevant keyboard shortcuts:** None.
- **Agent notes:** Expand panels before relying on tree or property controls.
- **Known limitations:** Pure layout utility.

## TOOL-EXIT

- **Tool ID:** `TOOL-EXIT`
- **Visible Spanish label:** HEFESTOLAB brand link or `×`
- **DOM selector:** `.app-brand`, `.top-icon[aria-label="Cerrar"]`
- **Purpose:** Leave IFC Drawing and return to the HEFESTOLAB home page.
- **Required mode:** Any.
- **Preconditions:** None.
- **Activation:** Click either link.
- **Interaction:** Normal browser navigation.
- **Expected result:** `../../index.html` opens.
- **Success indicator:** IFC Drawing is no longer the active page.
- **Cancel method:** Browser Back may return if session state remains available, but persistence is not guaranteed.
- **Relevant keyboard shortcuts:** Browser navigation shortcuts only.
- **Agent notes:** Do not use as a completion action unless the user requested leaving the tool.
- **Known limitations:** Session edits are not explicitly saved before navigation.

## Explicitly absent capabilities

The audited version contains no auto-dimension tool, no auto-layout tool, no public agent execution API, no MCP/WebMCP server, no backend and no verified 2D pan. Do not invent selectors or workflows for them.
