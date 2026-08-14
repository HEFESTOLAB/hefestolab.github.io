# QA checklist

Use only the sections relevant to the current task. A successful click is not sufficient evidence; inspect the resulting view, sheet or download state.

## Model and view

- [ ] The intended IFC or Demo project is active.
- [ ] The correct mode and target view are selected.
- [ ] The view is fitted and important geometry is not unintentionally clipped.
- [ ] Plan, elevation or section orientation and cut/depth settings match the task.
- [ ] Visible and hidden-line representation is appropriate.
- [ ] Category or element visibility and colours are intentional.
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
- [ ] Duplicate dimensions and annotations without technical value were removed.

## Sheet

- [ ] Format and orientation suit the number, proportions and density of views.
- [ ] Viewports stay within margins and clear of the title block.
- [ ] Viewports, labels and scale labels do not overlap.
- [ ] Each view is large enough to read at its selected scale.
- [ ] Equal or different scales were chosen deliberately.
- [ ] The title block number, title, project, author and format are correct.
- [ ] No unintended duplicate or deleted view remains.
- [ ] The paper is used effectively without crowding.

## Export

- [ ] The requested output format is correct: PDF sheet, SVG view or DXF 2D view.
- [ ] A valid active sheet exists for PDF, or a generated vector 2D view exists for SVG/DXF.
- [ ] Hidden-line state is correct before export because it affects the output.
- [ ] The operation completed without an error status or toast.
- [ ] A browser download was generated when browser policy permits it.
- [ ] The resulting filename and, where inspectable, document content match the intended view or sheet.
