# QA checklist

Use only the sections relevant to the current task. A successful click is not sufficient evidence; inspect the resulting view, sheet or download state.

## Model and view

- [ ] The intended IFC or Demo project is active.
- [ ] The correct mode and target view are selected.
- [ ] The view is fitted and important geometry is not unintentionally clipped.
- [ ] Plan, elevation or section orientation and cut/depth settings match the task.
- [ ] Visible and hidden-line representation is appropriate.
- [ ] Category or element visibility and colours are intentional.
- [ ] Persistent 3D element/category colours apply to the intended items, survive save/reconnect and appear in a new 3D capture.
- [ ] An element selected from 2D linework is clearly highlighted and any per-view hide/show change affects the intended view only.
- [ ] Clicking true blank space in 2D clears the IFC key, orange 2D highlight, 3D highlight and status selection.
- [ ] Wheel zoom, fit and pan can reach every required area without modifying the drawing.
- [ ] Linework is clear enough for the intended output scale.
- [ ] A 3D capture, if used, matches the intended camera and is labelled NTS.

## Dimensions and annotations

- [ ] Overall dimensions are present where required.
- [ ] Partial chains define important perimeter and partition geometry.
- [ ] Openings and their positions are covered where references are unambiguous.
- [ ] Relevant interior dimensions and thicknesses are present.
- [ ] Elevation or section heights and levels are covered when visible.
- [ ] No important construction element in scope remains dimensionally undefined.
- [ ] SNAP references were used where valid; ORTO use matches the intended direction.
- [ ] Dimensions do not cross or overlap unnecessarily.
- [ ] Text is readable and does not obscure important geometry.
- [ ] Completed dimensions can be repositioned without deleting them, and their PDF text is legible at the nominal 2.1 mm printed height.
- [ ] A chained dimension finishes with a blank click, highlights as one system and moves every segment to one common offset when any segment is dragged.
- [ ] Angular, diameter and radius dimensions use verified references, correct `°`/`Ø`/`R` notation and identical geometry in drawing, sheet, SVG/DXF and PDF.
- [ ] Duplicate dimensions and annotations without technical value were removed.

## Areas

- [ ] Every required room has one valid polygon, number, name and plausible square metres.
- [ ] Automatic areas correspond to intended `IfcSpace` geometry in the active plan band; malformed or overlapping source spaces were not accepted blindly.
- [ ] Manual and IFC area origins are distinguishable and duplicate room numbers were corrected.
- [ ] Plan-wide and per-area text visibility is intentional; hidden labels remain hidden in sheet/PDF/SVG/DXF without removing polygons or schedule rows.
- [ ] The linked area schedule row count equals the plan area count.
- [ ] Room edits propagate after schedule update and remain after project save/reopen.

## Sheet

- [ ] Format and orientation suit the number, proportions and density of views.
- [ ] Viewports stay within margins and clear of the title block.
- [ ] Viewports, labels and scale labels do not overlap.
- [ ] Each title/scale label can be moved independently of its viewport, its X/Y fields match the visible location, and the PDF uses the same position.
- [ ] Each view is large enough to read at its selected scale.
- [ ] Left, right, top and bottom crop handles preserve the opposite edge and do not change the selected scale.
- [ ] A 3D viewport in fill mode stays visually large; its X/Y focus and PDF crop match the on-screen sheet.
- [ ] Equal or different scales were chosen deliberately.
- [ ] The title block number, title, project, author and format are correct.
- [ ] Long title-block values wrap or expand without truncation, and the complete title block remains inside A0/A1/A2/A3/A4 paper bounds.
- [ ] Sheet zoom, pan and fit allow close inspection without changing viewport coordinates.
- [ ] No unintended duplicate or deleted view remains.
- [ ] Area schedules are labelled `TABLA`, remain inside margins, and show every row including the last one.
- [ ] The paper is used effectively without crowding.

## Export

- [ ] The requested output format is correct: PDF sheet, SVG view or DXF 2D view.
- [ ] A valid active sheet exists for PDF, or a generated vector 2D view exists for SVG/DXF.
- [ ] Hidden-line state is correct before export because it affects the output.
- [ ] The operation completed without an error status or toast.
- [ ] A browser download was generated when browser policy permits it.
- [ ] The resulting filename and, where inspectable, document content match the intended view or sheet.

## Project persistence

- [ ] `Guardar proyecto` downloads a `.hefesto-drawing.json` file.
- [ ] Reopening that file restores views, viewBoxes, dimensions/chains/text, areas and label visibility, schedules, IFC display overrides, sheets, viewports and title/scale label positions.
- [ ] Reopening also restores specialised dimensions, viewport four-side crops, 3D fit/focus and saved live-model colour overrides for the next IFC reconnection.
- [ ] A reopened project shows `data-hefesto-project-detached="true"` and `Reconectar IFC`.
- [ ] Reconnecting the source IFC changes model-loaded to true and project-detached to false without changing saved drawing/sheet counts.
- [ ] After reconnection, one new IFC-derived view can be generated while previous documentation remains present.
- [ ] The user understands that the saved project does not embed the original IFC and must use `Reconectar IFC` for new projections or 3D operations.
