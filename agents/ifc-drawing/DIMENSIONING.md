# Dimensioning criteria

This file teaches what to dimension, not only how to press `Cota` or `Cota cadena`. Read the single-dimension, chain, SNAP and ORTO entries in [TOOLS.md](TOOLS.md) first. Dimensions are manual; there is no auto-dimension tool.

## General method

1. Inspect the complete view and identify the geometry that can be read unambiguously.
2. Plan a hierarchy before clicking: overall dimensions outside, partial chains closer to the object, and interior dimensions where they remain legible.
3. Place dimensions with SNAP on valid endpoints, midpoints or edges. Use ORTO for genuinely horizontal or vertical measurements.
4. Work in passes. Do not stop after a few obvious dimensions.
5. Reinspect the entire view, correct overlaps and remove duplication without technical value.

## Chained dimensions

Use `Cota cadena` when several consecutive references form one ordered horizontal, vertical or aligned system.

1. Activate `Cota cadena` and acquire references in their physical order.
2. Click true blank space only after the last reference; that blank point sets the common dimension-line offset and completes the command.
3. Switch to `Seleccionar`. Selecting any segment highlights the complete chain.
4. Drag any segment perpendicular to the measured direction, or edit `Desfase`, to move every segment together.
5. Use `Eliminar cadena` only when the whole system is wrong. For a different reference sequence, recreate the chain deliberately.

Do not mix unrelated directions in one chain. Prefer several coherent chains to one visually tangled system.

The target is technical completeness plus legibility, not the maximum possible dimension count.

## Plans

### Pass 1 — overall geometry

Look for:

- total building length and width;
- principal setbacks or offsets;
- important changes in the external perimeter;
- clear overall dimensions of distinct wings or volumes.

### Pass 2 — partial chains

Where the geometry is unequivocal, dimension:

- façade or enclosure segments;
- changes of direction;
- relevant wall faces;
- distances between partitions;
- wall and partition thicknesses that matter to construction or interpretation;
- the internal distribution needed to reconstruct the plan logically.

Arrange partial chains closer to the building than overall dimensions. Keep corresponding chain lines aligned when that improves comparison.

### Pass 3 — openings

Review every visible door, window, opening and passage. Where references are clear, dimension:

- opening width;
- position relative to nearby wall faces, grids or corners;
- spacing between repeated openings;
- remaining wall segments when they define placement better than redundant centreline dimensions.

Do not infer an opening edge that is obscured or graphically ambiguous.

### Pass 4 — interiors

Review every room or functional zone for:

- principal internal width and length;
- relevant partitions and structural elements;
- clearances or passages essential to understanding the layout;
- wall thicknesses not already established elsewhere.

Avoid dimensioning the same fact repeatedly in neighbouring rooms.

### Pass 5 — QA

Perform a second full visual inspection and ask:

> Is any important construction element still not dimensionally defined?

Check especially perimeter changes, small offsets, openings, interior partitions and thicknesses. Then check whether a dimension is technically true but graphically unreadable.

## Elevations

When the geometry is identifiable, review:

- overall width and height;
- main level elevations;
- opening width and height;
- sill and lintel heights;
- vertical position of doors and windows;
- eaves, cornice and ridge;
- significant changes in façade height;
- other clearly visible construction elements required to explain the elevation.

Use vertical chains for levels and heights, and horizontal chains for widths and opening placement. Do not assume a sill, lintel, eave or ridge that cannot be identified from the projection.

## Sections

Where visible, review:

- total height;
- storey and reference levels;
- clear internal heights;
- slabs and relevant thicknesses;
- roof build-up, eaves and ridge;
- openings crossed by the section;
- changes of level;
- significant longitudinal or transverse dimensions.

Keep vertical dimension systems ordered. Distinguish level-to-level, clear height and material thickness instead of collapsing them into one ambiguous chain.

## Legibility rules

- Avoid unnecessary crossings and overlapping text or extension lines.
- Keep text away from geometry when practical.
- Maintain coherent spacing between parallel dimension lines.
- Place overall dimensions farther from the object than partial dimensions.
- Avoid duplicates that add no construction information.
- Preserve a visible hierarchy between overall, partial, opening and interior dimensions.
- Prefer a valid SNAP reference over a free click.
- Use ORTO only when the intended measurement is horizontal or vertical.
- Zoom around the target before placing points; double-click to fit again when context is lost.
- Reposition a completed dimension by selecting it and dragging the line or text perpendicular to its witness points; the measured references remain fixed.
- Reposition a completed dimension chain by dragging any linked segment; every segment must retain the same resulting offset.
- Dimension text in PDF output has a nominal printed height of `2.1 mm`, independent of the viewport scale. Still verify that dense chains do not overlap.
- If the interface shows an implausible value, correct its offset/text or delete it and inspect the references again.

## Completion test

A dimensioning task is complete only when the requested scope is covered, important elements are dimensionally defined, ambiguous geometry has not been guessed, and the result remains readable at the intended sheet scale.
