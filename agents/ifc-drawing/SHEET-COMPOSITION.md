# Sheet composition

Use this guide after the required views and annotations exist. Read the sheet tools in [TOOLS.md](TOOLS.md) and validate with [QA-CHECKLIST.md](QA-CHECKLIST.md).

## Composition sequence

1. Inspect the relative proportions and information density of all candidate views.
2. Decide which views belong together logically: for example, plans by level, related elevations, or a plan with its corresponding section.
3. Choose sheet format and orientation for the content, not by habit.
4. Add views and any required area schedules, then move and resize their viewports while respecting borders and the title block.
5. Adjust each viewport scale where necessary.
6. Drag each title/scale label or set its X/Y coordinates so it is clear of geometry and neighbouring viewports.
7. Recheck titles, scale labels, margins, overlaps and unused paper.
8. Use sheet zoom and pan to inspect crowded areas, then `Encuadrar` to review the complete composition.

## Format and orientation

Available formats are A4, A3, A2, A1 and A0. Both horizontal and vertical orientations are available.

- Use smaller formats when the required views remain readable and the title block is not crowded.
- Increase the format when view count, proportions or annotation density require it.
- Prefer horizontal orientation for wide compositions and vertical orientation for tall arrangements, while considering the complete group rather than one view in isolation.
- Do not default automatically to A3, a 2×2 grid or any other fixed pattern.

## Scale

When a 2D view is added, IFC Drawing runs its existing `chooseScale()` calculation. It compares the view bounds with the initial viewport width and height, then selects the first normalised scale denominator large enough to fit the view.

Verified normalised denominators are:

`10, 20, 25, 50, 75, 100, 125, 150, 200, 250, 500, 1000`

If none fits, the application rounds the required denominator upward to the next hundred. The scale can later be changed in the selected viewport's properties. A captured 3D view is NTS (not to scale). An area schedule is labelled `TABLA`; it has no drawing scale.

- Use equal scales when comparison between related views benefits from it.
- Use different scales when view size or technical purpose makes that clearer.
- Prefer the largest readable normalised scale that fits without clipping important geometry or annotations.
- Resizing a viewport changes its window; verify the displayed geometry and labels after resizing.

Do not replace or work around the application's automatic initial scale logic.

## Layout judgement

- Respect the sheet border, margins and title block.
- Keep view labels and scale labels visible.
- Avoid overlaps between viewports, labels and the title block.
- Group related views and maintain a clear reading order.
- Align edges or centres when it strengthens visual structure, without forcing unrelated view proportions into a rigid grid.
- Use the paper efficiently; excessive empty space and cramped content are both defects.
- Maximise the useful drawing size while retaining separation and legibility.
- Do not add the same view twice unless duplication has a clear documentation purpose.
- Enter complete `Número`, `Nombre`, `Proyecto` and `Autor` values. The title block adapts its width and wraps long values on screen and in PDF; verify the complete A0/A1/A2/A3/A4 border and title block after changing format or orientation.

## Viewport controls

Drag a viewport body to move it. Drag its lower-right resize handle to resize it. Drag the view label to reposition its title and scale together without moving the viewport. The inspector also exposes viewport X, Y, width, height and scale, plus exact label X/Y coordinates, label reset, recenter and remove controls. Use numeric properties when precise alignment is more reliable than pointer movement.

The sheet workspace itself can be navigated without changing the composition. Use the mouse wheel or `−`/`+` to zoom, `Encuadrar` to fit, and middle-button drag, `Shift`+drag or `Space`+drag to pan.

## Area schedules

- Create or update the schedule from its source plan before final placement.
- Drag it from `Cuadros de áreas` or use `Añadir a plano`.
- Resize it until every room name and the final row are legible; keep it clear of drawing viewports and the title block.
- Verify the screen row count against the exported PDF row count. The schedule must not silently omit its last row.
- Treat it as a table viewport: position and size are editable, but `1:n` scale and `Recentrar` do not apply.

## Completion test

The sheet is ready when the chosen format and orientation fit the actual content, every view is legible, scale decisions are technically defensible, every movable title/scale label is intentionally placed, related views read as a group, no viewport or label collides with another element, and the title block and margins remain clear.
