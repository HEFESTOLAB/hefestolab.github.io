# Verified tool reference

This inventory was derived from `tools/ifc-drawing/index.html` and `assets/js/app.js` in HEFESTOLAB v2.9.5 / IFC Drawing v0.8. It documents only controls and interactions present in that code. The visible UI is Spanish. Dynamic selectors exist only while their corresponding inspector or view is open.

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
- **Visible Spanish label:** `Seleccionar`; secondary action `Seleccionar también en 3D`
- **DOM selector:** `[data-draw-tool="select"]`, `#drawingSvg`; secondary dynamic `#selectIfc3d`, then `#viewer3d canvas`; dynamic `#ifcClearSelection`, `#ifcOpenDrawing`
- **Purpose:** Select one IFC element from its projected 2D linework or rendered 3D geometry and expose category, GlobalId and local ID.
- **Required mode:** `drawing` for direct 2D picking; `model` for the secondary 3D route.
- **Preconditions:** Real IFC loaded; active generated 2D view if visibility/colour changes are intended.
- **Activation:** With `Seleccionar` active, click IFC linework in the 2D view. If needed, use `Seleccionar también en 3D` and click model geometry.
- **Interaction:** The first 2D pick lazily resolves projected geometry; wait for it. A 3D click without pointer movement performs ray selection.
- **Expected result:** Orange highlight in the active 2D view and the 3D model, plus inspector details; optional return from 3D to the drawing.
- **Success indicator:** Status selection text and `Elemento IFC` inspector.
- **Cancel method:** `Cerrar selección`, `Escape`, or click true blank space in the 2D drawing. The blank click clears the orange 2D/3D highlight and `data-hefesto-selected-ifc-key`.
- **Relevant keyboard shortcuts:** None.
- **Agent notes:** Camera drag is ignored as a selection when movement exceeds four pixels.
- **Known limitations:** Requires pickable geometry and engine IDs; not available in Demo.

## TOOL-CONTROL-IFC-DISPLAY

- **Tool ID:** `TOOL-CONTROL-IFC-DISPLAY`
- **Visible Spanish label:** Category eye/colour controls; `Ocultar elemento`, `Mostrar elemento`, `Aplicar color`, `Color original`, `Restablecer vista`
- **DOM selector:** dynamic `[data-cat-vis]`, `[data-cat-color-on]`, `[data-cat-color]`, `#ifcHideInView`, `#ifcShowInView`, `#ifcApplyColor`, `#ifcClearColor`, `#resetIfcDisplay`
- **Purpose:** Change category or exact-element visibility/colour in one vector 2D view.
- **Required mode:** Active generated 2D view; 3D mode is optional for secondary picking.
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
- **Visible Spanish label:** `Encuadrar` only in view properties; wheel/double-click/pan have no label.
- **DOM selector:** `#drawingSvg`, dynamic `#fit2d`
- **Purpose:** Zoom a 2D drawing around the cursor, pan it, or fit the whole view.
- **Required mode:** `drawing` with generated vector view.
- **Preconditions:** Active non-pending view.
- **Activation:** Wheel over drawing to zoom; with `Seleccionar`, drag blank space to pan; middle-button drag, `Shift`+drag or `Space`+drag pan from any drawing tool; double-click drawing or click inspector `Encuadrar` to fit.
- **Interaction:** Repeated wheel input changes zoom while keeping the cursor location stable. Pan changes the viewBox without moving annotations or geometry.
- **Expected result:** ViewBox changes; double-click restores calculated bounds and padding.
- **Success indicator:** Visible scale/context change or full geometry fitted.
- **Cancel method:** Reverse wheel direction or fit again.
- **Relevant keyboard shortcuts:** Hold `Space` while dragging to pan.
- **Agent notes:** This interaction is intentionally explicit because visual agents may not discover it.
- **Known limitations:** Primary-button blank-space pan is reserved for `Seleccionar`; use the alternate gestures while another drawing tool is active.

## TOOL-SELECT-ANNOTATION

- **Tool ID:** `TOOL-SELECT-ANNOTATION`
- **Visible Spanish label:** `Seleccionar`
- **DOM selector:** `[data-draw-tool="select"]`, drawing annotations `[data-ann]`
- **Purpose:** Select a dimension, linked chain, room area or text annotation; drag text or reposition a completed dimension/chain; edit/delete through inspector.
- **Required mode:** `drawing`.
- **Preconditions:** Active vector 2D view with annotations.
- **Activation:** Activate `Seleccionar`, then click an annotation.
- **Interaction:** Drag text directly. Drag a dimension line or its text perpendicular to the measured references to change its offset. Edit selected properties; press Delete/Backspace or inspector `Eliminar` to remove.
- **Expected result:** Selection highlight and matching `Cota`, `Cadena de cotas`, `Área` or `Texto` inspector.
- **Success indicator:** `data-hefesto-draw-tool="select"`; annotation-selected styling.
- **Cancel method:** `Escape`, inspector `Cerrar`, or click empty drawing area.
- **Relevant keyboard shortcuts:** `Escape`; `Delete`; `Backspace` when no form field is focused.
- **Agent notes:** Dimension dragging preserves both measured reference points and changes only the placement offset.
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

## TOOL-DIMENSION-CHAIN

- **Tool ID:** `TOOL-DIMENSION-CHAIN`
- **Visible Spanish label:** `Cota cadena`
- **DOM selector:** `[data-draw-tool="dimension-chain"]`; generated chain segments use `[data-ann]` and a shared internal chain ID.
- **Purpose:** Create consecutive aligned dimension segments and keep them linked for joint repositioning/deletion.
- **Required mode:** `drawing`.
- **Preconditions:** Active generated vector plan/elevation/section; visible geometric references; SNAP recommended.
- **Activation:** Click `Cota cadena`.
- **Interaction:** Click at least two consecutive linework references. Continue adding references, then click true blank space to use that point as the common offset and finish. Switch to `Seleccionar` and drag any segment to move the whole chain.
- **Expected result:** One dimension per consecutive pair, all sharing one placement offset and highlighted together when selected.
- **Success indicator:** `Cadena de cotas creada` toast; `Cadena de cotas` inspector with the number of segments; every linked segment moves to the same new offset.
- **Cancel method:** `Escape` cancels a pending chain. `Eliminar cadena`, Delete or Backspace removes every linked segment.
- **Relevant keyboard shortcuts:** `Escape`; `Delete`; `Backspace`; `F8`; hold `Shift` for temporary ORTO.
- **Agent notes:** A click near linework adds another reference; a blank click ends the chain. Verify the blank point is not within SNAP/pick tolerance of unrelated linework.
- **Known limitations:** This is manual chained dimensioning, not automatic whole-model dimensioning.

## TOOL-AREA

- **Tool ID:** `TOOL-AREA`
- **Visible Spanish label:** `Área`, `Dibujar área`, `Importar IfcSpace`, `Ocultar textos`, `Mostrar textos`, `Ocultar texto`, `Mostrar texto`
- **DOM selector:** `[data-draw-tool="area"]`; dynamic `#areaManual`, `#areaIfc`, `#areaLabelsVisible`; selected fields/actions `#areaEditNumber`, `#areaEditName`, `#areaToggleLabel`.
- **Purpose:** Draw and label a room area manually or import projected room areas from IFC space entities, with global or per-area label visibility.
- **Required mode:** `drawing` with an active plan.
- **Preconditions:** Manual areas need a generated vector plan. IFC import additionally requires a loaded IFC with classified `IFCSPACE` geometry.
- **Activation:** Click `Área`/`Dibujar área`, or click `Importar IfcSpace`.
- **Interaction:** Manual: click perimeter vertices, then click the first point, double-click or press `Enter`; enter room number and name; click `Crear área`. IFC: wait while every `IfcSpace` in the plan projection band is analysed and labelled. Generated plans automatically attempt this import once. Use `Ocultar textos` for the complete plan or select one area and use `Ocultar texto` for only that annotation.
- **Expected result:** Blue translucent polygon with optional room number/name/square-metres label; source is shown as `Manual` or `IfcSpace`. Hiding text preserves the polygon and schedule row in screen and exports.
- **Success indicator:** `Área creada` or `Espacios IFC importados` toast, visible polygons/labels and updated area statistics.
- **Cancel method:** `Escape` cancels a pending perimeter; modal `Cancelar` discards it; `Eliminar área` removes a completed area.
- **Relevant keyboard shortcuts:** `Enter` closes a valid manual perimeter; `Escape` cancels; Delete/Backspace removes a selected area.
- **Agent notes:** If an IFC has no usable `IfcSpace`, the import button stays disabled. Review imported names and polygons before documentation export. The plan-wide label switch has priority over the individual area switch.
- **Known limitations:** Automatic geometry follows the projected `IfcSpace` outline exposed by the IFC engine; malformed, overlapping or incorrectly classified spaces remain source-data issues.

## TOOL-AREA-SCHEDULE

- **Tool ID:** `TOOL-AREA-SCHEDULE`
- **Visible Spanish label:** `Crear/actualizar cuadro`, `Cuadro de áreas`, `Actualizar`, `Añadir a plano`
- **DOM selector:** dynamic `#areaSchedule`, `#areaMakeSchedule`, `#scheduleRefresh`, `#scheduleAddSheet`; tree `#schedulesTree [data-view]`.
- **Purpose:** Build an area schedule from one plan and place it on sheets as a draggable/resizable table viewport.
- **Required mode:** Create from a plan or selected area; inspect in `drawing`; place/edit in `sheet`.
- **Preconditions:** Active plan; zero or more manual/IFC areas. A sheet is created automatically if required when adding the schedule.
- **Activation:** Click `Crear/actualizar cuadro`; then use `Añadir a plano` or drag the schedule tree item to paper.
- **Interaction:** Edit room number/name before or after schedule creation; linked schedules refresh. Move/resize its viewport like other sheet content. Schedule scale is `TABLA`, not `1:n`.
- **Expected result:** Table columns `Nº`, `Estancia`, `Origen`, `Área`; all rows remain present in screen, SVG and PDF output.
- **Success indicator:** Schedule tree item reports its area count; table appears in drawing/sheet; PDF contains the same row count.
- **Cancel method:** `Eliminar cuadro` removes the schedule and its sheet viewports; `Quitar` removes only one viewport.
- **Relevant keyboard shortcuts:** None.
- **Agent notes:** Use `Actualizar` after bulk changes. Verify the last row in PDF, especially on dense schedules.
- **Known limitations:** One schedule is linked to one source plan; no totals/subtotals or multi-plan aggregation are provided in this version.

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
- **DOM selector:** dynamic `.sheet-vp`; lower-right `.vp-resize`; movable label `.vp-label[data-vp-label]`
- **Purpose:** Move or resize a viewport, or reposition its title/scale label independently on the active sheet.
- **Required mode:** `sheet`.
- **Preconditions:** Active sheet with viewport.
- **Activation:** Pointer-drag viewport body to move; drag `.vp-resize` to resize; drag `.vp-label` to move title and scale together without moving the viewport.
- **Interaction:** Viewport movement is clamped within 10 mm paper margins; minimum size is 35×28 mm. Label movement is clamped to the paper and stored relative to its viewport. Resizing changes the displayed window.
- **Expected result:** Viewport position/size or independent label position updates and inspector stays linked.
- **Success indicator:** Viewport selected border and changed viewport or title/scale X/Y values.
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
- **Known limitations:** Changing sheet size does not automatically rearrange viewports. The title block grows within the page and wraps long metadata instead of clipping it.

## TOOL-NAVIGATE-SHEET

- **Tool ID:** `TOOL-NAVIGATE-SHEET`
- **Visible Spanish label:** `−`, `Encuadrar`, `+`; wheel/pan gestures have no label.
- **DOM selector:** `#sheetCanvas`, `#sheetPaper`, `#btnSheetZoomOut`, `#btnSheetZoomFit`, `#btnSheetZoomIn`
- **Purpose:** Zoom and pan the sheet workspace without altering paper content or viewport positions.
- **Required mode:** `sheet`.
- **Preconditions:** Active sheet.
- **Activation:** Wheel over the paper or use toolbar zoom buttons; pan with middle-button drag, `Shift`+drag or `Space`+drag; click `Encuadrar` to refit.
- **Interaction:** Cursor-centred zoom expands the scrollable paper workspace. Pan changes workspace scroll only.
- **Expected result:** The chosen paper area can be inspected closely while sheet geometry remains unchanged.
- **Success indicator:** Paper scale changes or the workspace scroll position changes; title block and viewport coordinates remain constant.
- **Cancel method:** Reverse the gesture or use `Encuadrar`.
- **Relevant keyboard shortcuts:** Hold `Space` while dragging to pan.
- **Agent notes:** Use this for inspection and precise editing; PDF size and scale are unaffected.
- **Known limitations:** It is workspace navigation, not a viewport crop operation.

## TOOL-SAVE-OPEN-PROJECT

- **Tool ID:** `TOOL-SAVE-OPEN-PROJECT`
- **Visible Spanish label:** `Guardar proyecto`, `Abrir proyecto`
- **DOM selector:** `#btnSaveProject`, `label[for="projectInput"]`, hidden `#projectInput`
- **Purpose:** Download or reopen an editable IFC Drawing project.
- **Required mode:** Any.
- **Preconditions:** Saving requires views, sheets or project data; opening requires a valid `.hefesto-drawing.json` or `.json` file.
- **Activation:** Click `Guardar proyecto` to download; click `Abrir proyecto` and select the saved file to restore it.
- **Interaction:** The JSON preserves levels, projected vector views, viewBoxes, text, areas and their label visibility, chain linkage, per-view visibility/colour, area schedules, captured 3D images, sheets, viewports and moved title/scale label positions.
- **Expected result:** A `.hefesto-drawing.json` download, or a restored editable project after reopening.
- **Success indicator:** Download name uses the project name; reopening restores tree items, active view/sheet and a success toast.
- **Cancel method:** Cancel the system file picker. Opening another IFC or project replaces the current workspace.
- **Relevant keyboard shortcuts:** None.
- **Agent notes:** The saved file is local and portable. Reopened projections, annotations, schedules and sheets can be edited and exported. `data-hefesto-project-detached="true"` means the project is open but its source IFC is not yet reattached.
- **Known limitations:** The original IFC geometry is not embedded; use `Reconectar IFC` rather than ordinary `Abrir IFC` when continuing a saved project.

## TOOL-RECONNECT-IFC

- **Tool ID:** `TOOL-RECONNECT-IFC`
- **Visible Spanish label:** `Reconectar IFC`
- **DOM selector:** `#btnReconnectIfc`, hidden `#reconnectIfcInput`, dynamic `#inspReconnectIfc`
- **Purpose:** Reattach the source IFC to a reopened project without resetting its saved documentation.
- **Required mode:** Any after `Abrir proyecto`; the control appears only while the project is detached.
- **Preconditions:** Valid reopened `.hefesto-drawing.json`; source IFC available; application served over HTTP; engine dependencies reachable.
- **Activation:** Click `Reconectar IFC`, choose the original `.ifc`, then wait for local conversion/classification.
- **Interaction:** The model is loaded like a normal IFC, but existing levels, drawings, annotations, areas, schedules, viewBoxes, sheets and viewports are preserved. Missing IFC levels are merged. A differing filename produces a warning but does not block reconnection.
- **Expected result:** Model workspace is usable again; new plans/elevations/sections and 3D operations are enabled; saved documentation remains in the tree and sheets.
- **Success indicator:** `data-hefesto-model-loaded="true"`, `data-hefesto-project-detached="false"`, hidden reconnect button and `IFC reconectado` status/toast.
- **Cancel method:** Cancel the file picker. A failed reconnection keeps the project detached and its documentation available.
- **Relevant keyboard shortcuts:** None.
- **Agent notes:** Ordinary `Abrir IFC` starts a new IFC project and replaces documentation. Use this control for continuation.
- **Known limitations:** The IFC is referenced by user choice, not embedded; the filename warning cannot prove file identity.

## TOOL-VIEWPORT-PROPERTIES

- **Tool ID:** `TOOL-VIEWPORT-PROPERTIES`
- **Visible Spanish label:** `Escala`, viewport `X (mm)`/`Y (mm)`, `Ancho (mm)`, `Alto (mm)`, title/scale `X (mm)`/`Y (mm)`, `Restablecer posición`, `Recentrar`, `Quitar`
- **DOM selector:** dynamic `#vpScale`, `#vpX`, `#vpY`, `#vpW`, `#vpH`, `#vpLabelX`, `#vpLabelY`, `#vpLabelReset`, `#vpCenter`, `#vpDelete`
- **Purpose:** Precisely control selected viewport scale, position, size, view centre and independent title/scale label position.
- **Required mode:** `sheet`, selected viewport.
- **Preconditions:** Existing viewport.
- **Activation:** Click viewport, then edit inspector.
- **Interaction:** Numeric fields commit on change; select a scale; set title/scale X/Y or drag the label; `Restablecer posición` returns the label below the centred viewport; `Recentrar` restores vector view bounds centre; `Quitar` removes viewport.
- **Expected result:** Viewport rerenders with requested window, geometry scale and label position.
- **Success indicator:** Display and inspector agree; label shows selected `1:n`, NTS or TABLA at the requested position.
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
- **Agent notes:** Hidden-line and area-label visibility affect PDF. Moved title/scale labels use their saved sheet positions. Only the active sheet is exported.
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
- **Agent notes:** Hidden-line state and area-label visibility are preserved in SVG output.
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
- **Agent notes:** Visible/hidden and coloured line groups become DXF layers; dimensions and visible text are emitted as basic entities. Hidden area labels are omitted while area polygon geometry remains.
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
- **Cancel method:** Browser Back may return; save the project first if its current state matters.
- **Relevant keyboard shortcuts:** Browser navigation shortcuts only.
- **Agent notes:** Do not use as a completion action unless the user requested leaving the tool.
- **Known limitations:** Navigation does not autosave; use `Guardar proyecto` explicitly.

## Explicitly absent capabilities

The audited version contains no auto-dimension tool, no auto-layout tool, no public agent execution API, no MCP/WebMCP server, no backend and no automatic cloud save. Do not invent selectors or workflows for them.
