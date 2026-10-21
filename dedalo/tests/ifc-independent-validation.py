"""Independent export validation using IfcOpenShell; development only.

    IFC_FIXTURE_DIR=fixtures node tests/ifc-export-tests.js
    python tests/ifc-independent-validation.py fixtures

Install ifcopenshell and pytest in a development environment first. No dependency
is downloaded or used by the browser. Exits nonzero on schema/EXPRESS/mesh errors.
"""
import argparse
import json
import pathlib
import sys
import ifcopenshell
import ifcopenshell.geom
import ifcopenshell.validate

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("directory", type=pathlib.Path)
parser.add_argument("--schema-only", action="store_true")
args = parser.parse_args()
files = sorted(args.directory.glob("*.ifc"))
if not files:
    raise SystemExit("No IFC files found")
settings = ifcopenshell.geom.settings()
settings.set(settings.USE_WORLD_COORDS, True)
failed = False
for path in files:
    model = ifcopenshell.open(str(path))
    logger = ifcopenshell.validate.json_logger()
    ifcopenshell.validate.validate(model, logger, express_rules=True)
    geometry_count = 0
    geometry_errors = []
    if not args.schema_only:
        for obj in model.by_type("IfcElement"):
            if not obj.Representation:
                continue
            try:
                shape = ifcopenshell.geom.create_shape(settings, obj)
                verts = shape.geometry.verts
                assert verts, "empty mesh"
                if path.name.startswith("nested-"):
                    bounds = [[min(verts[k::3]), max(verts[k::3])] for k in range(3)]
                    expected = ([[6, 10], [20, 21.5], [3, 9]] if bounds[0][1] > 0 else [[-14, -10], [0, 1.5], [0, 6]])
                    assert all(abs(bounds[k][j] - expected[k][j]) < 1e-9 for k in range(3) for j in range(2)), (bounds, expected)
                geometry_count += 1
            except Exception as exc:
                geometry_errors.append({"stepId": obj.id(), "error": str(exc)})
    result = {"file": path.name, "schema": model.schema, "schemaErrors": len(logger.statements), "geometries": geometry_count, "geometryErrors": geometry_errors}
    print(json.dumps(result), flush=True)
    if logger.statements:
        print(json.dumps(logger.statements, default=str, indent=2))
    failed |= bool(logger.statements or geometry_errors)
sys.exit(1 if failed else 0)
