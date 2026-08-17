# Verified limitations

These limitations are separated by source. Do not describe browser or IFC-source constraints as application defects.

## Application limitations

- There is no automatic whole-model dimensioning tool. Single dimensions use three clicks; manual chained dimensions use consecutive reference clicks and a blank placement click.
- There is no automatic sheet-layout tool.
- 2D and sheet pan are local navigation gestures; they do not change view geometry, viewport crop or PDF content.
- The Demo contains prepared vector views but no 3D IFC geometry. It cannot generate new plans, elevations, sections or 3D captures.
- New projections, IFC category/element controls and 3D capture require a successfully loaded real IFC.
- SVG and DXF export require an active generated vector 2D view. Captured 3D raster views are not exported as standalone SVG or DXF.
- PDF exports the active sheet, not every sheet as a multi-page set.
- Captured 3D views are raster images and NTS (not to scale).
- Project files are saved and reopened locally. They preserve projected vector views, annotations, chained dimensions, areas, schedules, display overrides and sheets, but do not embed the source IFC geometry; use `Reconectar IFC` to reattach it without clearing documentation before new projections, 3D picking or a fresh 3D capture. Local documentation levels never modify the source IFC.
- Area schedules are linked to one plan and do not provide multi-plan totals or subtotals.
- A sheet view title and its scale/NTS/TABLA indicator form one movable label; they move together rather than as two independent text objects.
- Hiding an area label affects its room text only. The room polygon and area-schedule row intentionally remain available.
- The scale list is finite; when the fitting denominator exceeds the predefined list, `chooseScale()` rounds upward to the next hundred.

## Browser-agent limitations

- A browser agent may need human assistance with the operating-system file picker.
- Pointer precision can affect SNAP acquisition, dimension placement, viewport movement and resizing. Verify visual feedback and results.
- A browser agent may not automatically discover or load this Skill even though multiple discovery hints are present. Use the explicit guide URL when needed.
- Download completion may be difficult to inspect in agents that cannot access the browser's download UI or local filesystem.

## Browser security limitations

- Real IFC loading is intentionally refused under `file://` because browser ES-module and WebAssembly restrictions can produce incomplete loading. Serve the static site over HTTP, including for local tests.
- The IFC engine loads pinned third-party modules and WebAssembly from the existing jsDelivr CDN. Initial real-IFC use therefore requires network access to those existing dependencies.
- Browser download, canvas and local-file policies can vary by browser or automation environment.

## IFC source limitations

- View quality depends on valid IFC geometry and the edge projection produced from it.
- Level discovery depends on `IFCBUILDINGSTOREY` metadata found in the first 40 MB read for lightweight metadata parsing. A model with missing, unusual or late metadata may show no detected levels.
- Category and exact element controls depend on classification and geometry IDs exposed by the loaded IFC and engine. Some IFCs may not provide usable categories.
- Automatic room areas require classified `IFCSPACE` geometry. Their outline and calculated surface follow the projection exposed by the engine, so malformed, overlapping or semantically incorrect source spaces require manual review or replacement.
- Ambiguous, missing, duplicated or incorrectly classified source geometry can make technical dimensioning uncertain. Do not invent references that cannot be identified.
- Very large or complex IFC files can take substantial local memory and processing time; performance depends on the browser and device.

## Security boundary

The internal `window.__HEFESTO_IFC_DRAWING_QA__` object remains restricted to `file:`, localhost, `127.0.0.1` or an explicit `?qa` query. It is not a production agent API and must not be treated as one.
