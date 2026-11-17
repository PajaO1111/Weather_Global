"""Reproducible 7C.6d geometry and native-grid diagnostics, no temperatures."""
import hashlib
import json
import math
from itertools import combinations

import netCDF4
import numpy as np
import pyproj
import shapely
from shapely.geometry import LineString, Point, box, shape
from shapely.ops import transform, unary_union

import build_continent_masks as base
import build_reviewed_continent_masks as review
from continent_geometry_area import lonlat_area


def grid_cell(south, north, west, east):
    if not (-90 <= south < north <= 90 and 0 < east - west <= 360):
        raise ValueError("Invalid native cell bounds")
    width = east - west
    west = (west + 180) % 360 - 180
    east = west + width
    if east <= 180:
        return box(west, south, east, north)
    return unary_union([box(west, south, 180, north), box(-180, south, east - 360, north)])


def allocate_cell(model_area, land_fraction, geometric_areas, all_land_area):
    areas = np.asarray(geometric_areas, dtype=float)
    if (not math.isfinite(model_area) or model_area <= 0
            or not math.isfinite(land_fraction) or not 0 <= land_fraction <= 1
            or not np.isfinite(areas).all() or (areas < 0).any()
            or not math.isfinite(all_land_area) or all_land_area < 0):
        raise ValueError("Invalid native-grid area/fraction inputs")
    if all_land_area == 0:
        if np.any(areas):
            raise ValueError("Continental geometry without eligible land")
        return np.zeros_like(areas)
    if abs(float(areas.sum()) - all_land_area) > max(10, all_land_area * 1e-8):
        raise ValueError("Continental geometric allocation does not reconstruct eligible cell land")
    return model_area * land_fraction * areas / all_land_area


def check(condition, message):
    if not condition:
        raise ValueError(message)


def geometry_index(geometry):
    parts = base.source_parts(geometry)
    return parts, shapely.STRtree(parts)


def cell_area(cell, parts, tree):
    indices = tree.query(cell, predicate="intersects")
    return sum(lonlat_area(parts[int(i)].intersection(cell)) for i in indices)


def audit_native_grid(name, directory, masks, eligible):
    area_path = directory / f"areacella_fx_{name}_historical_r1i1p1f1_gn.nc"
    fraction_path = directory / f"sftlf_fx_{name}_historical_r1i1p1f1_gn.nc"
    with netCDF4.Dataset(area_path) as dataset, netCDF4.Dataset(fraction_path) as fractions:
        check(dataset["areacella"].units == "m2", f"{name}: unsupported area units")
        check(fractions["sftlf"].units == "%", f"{name}: unsupported land fraction units")
        check(dataset["areacella"].dimensions == ("lat", "lon"), f"{name}: unsupported grid")
        check(fractions["sftlf"].dimensions == ("lat", "lon"), f"{name}: inconsistent fraction dimensions")
        for axis in ("lat", "lon"):
            check(np.array_equal(dataset[axis][:], fractions[axis][:]), f"{name}: mismatched {axis}")
        lat_bounds = np.asarray(dataset[dataset["lat"].bounds][:])
        lon_bounds = np.asarray(dataset[dataset["lon"].bounds][:])
        areas = np.ma.asarray(dataset["areacella"][:])
        fraction = np.ma.asarray(fractions["sftlf"][:]) / 100
        check(not np.ma.getmaskarray(areas).any() and not np.ma.getmaskarray(fraction).any(),
              f"{name}: missing native fx values")
        areas, fraction = np.asarray(areas), np.asarray(fraction)
        check(np.isfinite(areas).all() and (areas > 0).all(), f"{name}: invalid areas")
        check(np.isfinite(fraction).all() and (fraction >= 0).all() and (fraction <= 1).all(),
              f"{name}: invalid fractions")
    check(areas.shape == (len(lat_bounds), len(lon_bounds)), f"{name}: invalid bounds shape")
    check(abs(lat_bounds[0, 0] + 90) < 1e-8 and abs(lat_bounds[-1, 1] - 90) < 1e-8
          and np.allclose(lat_bounds[:-1, 1], lat_bounds[1:, 0], atol=1e-8, rtol=0),
          f"{name}: latitude bounds are not contiguous pole to pole")
    check(np.allclose(lon_bounds[:-1, 1], lon_bounds[1:, 0], atol=1e-8, rtol=0)
          and abs(lon_bounds[-1, 1] - lon_bounds[0, 0] - 360) < 1e-8,
          f"{name}: longitude bounds do not tile 360 degrees")
    indexed = [geometry_index(masks[key]) for key in base.CONTINENTS]
    all_index = geometry_index(eligible)
    totals = np.zeros(7)
    geometric_totals = np.zeros(7)
    no_model_land = np.zeros(7)
    cells = np.zeros(7, dtype=int)
    orphan_area, orphan_cells, allocatable_area, max_error = 0.0, 0, 0.0, 0.0
    for i, (south, north) in enumerate(lat_bounds):
        for j, (west, east) in enumerate(lon_bounds):
            cell = grid_cell(float(south), float(north), float(west), float(east))
            geometric = np.array([cell_area(cell, parts, tree) for parts, tree in indexed])
            all_area = cell_area(cell, *all_index)
            weights = allocate_cell(float(areas[i, j]), float(fraction[i, j]), geometric, all_area)
            totals += weights
            geometric_totals += geometric
            cells += weights > 0
            if fraction[i, j] == 0:
                no_model_land += geometric
            model_land = float(areas[i, j] * fraction[i, j])
            if all_area == 0 and model_land > 0:
                orphan_area += model_land
                orphan_cells += 1
            elif all_area > 0:
                allocatable_area += model_land
                max_error = max(max_error, abs(float(weights.sum()) - model_land))
        if i % 16 == 0:
            print(f"{name}: audited latitude row {i}/{len(lat_bounds)}", flush=True)
    check(abs(float(totals.sum()) - allocatable_area) <= max(100, allocatable_area * 1e-10),
          f"{name}: weight conservation failure")
    expected_geometry = np.array([lonlat_area(masks[k]) for k in base.CONTINENTS])
    check(np.all(np.abs(geometric_totals - expected_geometry) <= np.maximum(100, expected_geometry * 1e-8)),
          f"{name}: split grid cells do not reconstruct continent geometry")
    return {
        "source_id": name, "status": "diagnostic-only-not-approved-climate-weights",
        "grid": {"latitude_cells": len(lat_bounds), "longitude_cells": len(lon_bounds),
                 "pole_to_pole": True, "longitude_span_degrees": 360, "dateline_cells_split": True},
        "sources": [{"file": str(p.relative_to(base.ROOT)), "sha256": base.digest(p)}
                    for p in (area_path, fraction_path)],
        "formula": "areacella * (sftlf / 100) * (eligible continental geometry / all eligible land geometry in cell); land fraction applied exactly once",
        "model_land_area_m2": float(np.sum(areas * fraction)),
        "allocated_model_land_area_m2": float(totals.sum()),
        "unallocated_model_land_area_m2": orphan_area, "unallocated_model_land_cells": orphan_cells,
        "maximum_cell_conservation_error_m2": max_error,
        "continents": {key: {"weighted_area_m2": float(totals[k]),
                             "geometric_area_m2": float(geometric_totals[k]),
                             "geometric_grid_tiling_error_m2": float(geometric_totals[k] - expected_geometry[k]),
                             "relative_model_coast_area_difference": float(totals[k] / expected_geometry[k] - 1),
                             "geometry_in_zero_model_land_cells_m2": float(no_model_land[k]),
                             "weighted_cells": int(cells[k])}
                       for k, key in enumerate(base.CONTINENTS)},
        "limitations": [
            "Model land without eligible mapped land is reported, not reassigned or hidden.",
            "Within a mixed cell this convention distributes model land over eligible geographic land; it cannot resolve subcell model coastline or grounding differences.",
            "Mapped lakes and shelves are excluded geometrically but model land may include different lakes/ice; no automatic scientific approval.",
            "No tas data read, no temperature aggregation, no weight file published or old climate output changed.",
        ],
    }


def main():
    folder = review.OUTPUT
    implementation_sha256 = base.digest(base.ROOT / "prototype" / "scripts" / "validate_reviewed_continent_masks.py")
    report = json.loads((folder / "report.json").read_text(encoding="utf-8"))
    archive_path = folder / "sources" / "downloads.json"
    archive = json.loads(archive_path.read_text(encoding="utf-8"))
    check(len(archive) == 7, "Incomplete source-page/map archive")
    for row in archive:
        path = folder / "sources" / row["file"]
        check(path.stat().st_size == row["bytes"] and base.digest(path) == row["sha256"],
              f"Source-page archive hash mismatch: {path.name}")
    check(report["implementation_sha256"] == base.digest(base.ROOT / "prototype" / "scripts" / "build_reviewed_continent_masks.py"),
          "Reviewed implementation changed after geometry generation")
    masks = {key: shape(json.loads((folder / f"{key}.geojson").read_text(encoding="utf-8"))["geometry"])
             for key in base.CONTINENTS}
    for key, geometry in masks.items():
        base.require_valid(geometry, key)
        check(not geometry.is_empty, f"{key}: empty mask")
        check(all(math.isfinite(x) for x in geometry.bounds), f"{key}: nonfinite coordinates")
        check(geometry.bounds[0] >= -180 and geometry.bounds[2] <= 180
              and geometry.bounds[1] >= -90 and geometry.bounds[3] <= 90, f"{key}: out of range")
    registry = json.loads((folder / "component-registry.json").read_text(encoding="utf-8"))["components"]
    decisions = json.loads((folder / "decisions.json").read_text(encoding="utf-8"))["decisions"]
    check(len(registry) == 6836 and len({r["id"] for r in registry}) == 6836, "Incomplete registry")
    check(len(decisions) == 1357 and len({r["component_id"] for r in decisions}) == 1357, "Incomplete decisions")
    check(all(r["status"] in {"assigned", "excluded"} for r in registry), "Unresolved source component")
    check([r["id"] for r in registry if r["status"] == "excluded"] == [review.NULL_ID], "Unexpected exclusion")
    for row in registry:
        check(bool(row["assignments"]), f"{row['id']}: missing assignments")
        for entry in row["assignments"]:
            check(entry["continent"] in base.CONTINENTS or
                  (row["id"] == review.NULL_ID and entry.get("status") == "excluded"), "Missing continent decision")
    repairs = []
    land = unary_union([g for _, g in base.read_layer("land", repairs)[0]])
    lakes = unary_union([g for _, g in base.read_layer("lakes", repairs)[0]])
    shelves = unary_union([g for _, g in base.read_layer("shelves", repairs)[0]])
    sources = sorted(base.source_parts(land), key=lambda g: (-g.area, g.bounds))
    for row, original in zip(registry, sources):
        check(row["source_geometry_sha256"] == hashlib.sha256(original.wkb).hexdigest(),
              f"{row['id']}: wrong source component")
    null_island = sources[int(review.NULL_ID.split("-")[1])]
    eligible, expected_excluded = base.water_exclusion(land, lakes, shelves.union(null_island))
    excluded = shape(json.loads((folder / "excluded.geojson").read_text(encoding="utf-8"))["geometry"])
    combined = unary_union(list(masks.values()))
    difference = base.surface_area_upper_bound(eligible.symmetric_difference(combined))
    overlaps = {f"{a}/{b}": base.surface_area_upper_bound(masks[a].intersection(masks[b]))
                for a, b in combinations(base.CONTINENTS, 2)}
    exclusion_overlap = base.surface_area_upper_bound(combined.intersection(excluded))
    exclusion_difference = base.surface_area_upper_bound(excluded.symmetric_difference(expected_excluded))
    check(max(difference, sum(overlaps.values()), exclusion_overlap, exclusion_difference) <= 10,
          "7C.6d topology exceeds the explicit 10 m2 tolerance")
    rule = report["boundary_rules"]["suez"]
    mainland = next(g for g in sources if g.covers(Point(20, 10)) and g.covers(Point(100, 40)))
    europe = masks["europe"]
    marine_joins = unary_union([LineString(rule["north_marine_join_lon_lat"]),
                               LineString(rule["south_marine_join_lon_lat"])])
    marine_land = marine_joins.intersection(mainland.difference(
        box(*rule["allowed_land_cut_corridor"])))
    check(marine_land.is_empty, "Africa/Asia marine joins intersect connected mainland outside Suez corridor")
    # Independent polar equal-area projection; densify lon/lat edges before
    # projection so long parallel edges are not replaced with projected chords.
    polar_equal_area = pyproj.Transformer.from_crs(
        4326, "+proj=laea +lat_0=-90 +lon_0=0 +datum=WGS84 +units=m", always_xy=True).transform
    polar = transform(polar_equal_area, shapely.segmentize(masks["antarctica"], .05))
    polar_area = polar.area
    surface_areas = {key: lonlat_area(g) for key, g in masks.items()}
    polar_error = abs(polar_area / surface_areas["antarctica"] - 1)
    check(polar_error < 1e-5, "Independent polar equal-area check failed")
    samples = [
        ("socotra", 54, 12.5, "africa"), ("bouvet", 3.4, -54.42, "africa"),
        ("clipperton", -109.22, 10.29, "north-america"),
        ("lesbos", 26.3, 39.2, "europe"), ("rhodes", 27.95, 36.2, "europe"),
        ("anatolian-island", 26.72, 38.5, "asia"),
        ("suez-west", 31.5, 30, "africa"), ("sinai", 33.8, 29.5, "asia"),
        ("panama", -80, 8.5, "north-america"), ("colombia", -74, 4, "south-america"),
        ("greenland", -42, 72, "north-america"), ("south-pole", 0, -89.99, "antarctica"),
        ("bali", 115.15, -8.4, "asia"), ("lombok", 116.3, -8.6, "oceania"),
        ("new-guinea", 141, -5, "oceania"), ("hawaii", -155.5, 19.5, "oceania"),
        ("tiran", 34.55649995449783, 27.96668121950006, "asia"),
        ("sanafir", 34.7, 27.93, "asia"),
        ("western-anatolia", 28, 38, "asia"), ("western-sinai", 33.3, 28.8, "asia"),
        ("cairo", 31.2, 30, "africa"), ("tangier", -5.8, 35.7, "africa"),
        ("algiers", 3, 36.7, "africa"), ("arabia", 43, 17, "asia"),
    ]
    for label, x, y, expected in samples:
        check([key for key, g in masks.items() if g.covers(Point(x, y))] == [expected],
              f"Geographic sample failed: {label}")
    check(not combined.covers(Point(0, 0)), "Fictional Null Island still assigned")
    previous_europe = shape(json.loads((base.OUTPUT / "europe.geojson").read_text(encoding="utf-8"))["geometry"])
    removed_europe = previous_europe.difference(masks["europe"])
    check(base.surface_area_upper_bound(removed_europe.difference(masks["africa"])) <= .01,
          "Removed legacy Europe land was not explicitly transferred to Africa")
    check(report["europe"]["removed_wrongly_included_african_land_m2"] > 3e11,
          "Approved legacy European geography correction is missing")
    prior = review.read_previous()
    climate_pins = [
        ("europe-cds-annual/validation/eu27_preview.json", "0aee1c1d7617657451ea624be7206b73d43878d0ea43aa630bdeac278a76132f"),
        ("europe-cmip6-pair/europe_pair_anomalies_v1.json", "ef75363408e5ad65cd14e20cf94be156ab139fc384f121415a489460f7cfb5f9"),
        ("europe-history/europe_history_v1.json", "6798265e06d8e140452ed63bf9a5fdbe414aa039c3ffc7f9eb46f23926cfac70"),
    ]
    for relative, expected in climate_pins:
        check(base.digest(folder.parent.joinpath(*relative.split("/"))) == expected,
              f"Existing climate artefact changed: {relative}")
    model_reports = [
        audit_native_grid("ACCESS-CM2", base.LEGACY, masks, eligible),
        audit_native_grid("CanESM5", folder.parent / "europe-cmip6-pair", masks, eligible),
    ]
    validation = {
        "schema_version": 1, "version": review.VERSION,
        "overall": "CONDITIONAL-PASS-geographic-topology-and-native-grid-audit",
        "geographic_topology": "PASS", "model_weight_conservation": "PASS",
        "antarctic_grounding": "BLOCKED-no-independent-grounding-line",
        "legacy_custom_europe_nasa_cmip6": "INVALID-GEOGRAPHY-requires-separately-approved-recomputation",
        "climate_weights_allowed": False, "publication_allowed": False,
        "sources_unchanged": prior,
        "source_page_archive_sha256": base.digest(archive_path),
        "climate_artifacts_unchanged": [{"file": name, "sha256": pin} for name, pin in climate_pins],
        "implementation_sha256": implementation_sha256,
        "surface_area_implementation_sha256": base.digest(base.ROOT / "prototype" / "scripts" / "continent_geometry_area.py"),
        "topology": {"tolerance_m2": 10, "eligible_reconstruction_upper_bound_m2": difference,
                     "pairwise_overlaps_upper_bound_m2": overlaps,
                     "excluded_overlap_upper_bound_m2": exclusion_overlap,
                     "excluded_reconstruction_upper_bound_m2": exclusion_difference,
                     "marine_joins_outside_suez_corridor_cross_mainland": False,
                     "area_definition": "Conservative WGS84 surface upper bound of lon/lat-linear GEOS differences; small nonzero roundoff explicitly retained."},
        "area_crosscheck": {
            "lonlat_linear_surface_areas_m2": surface_areas,
            "geodesic_ring_areas_m2": {key: base.geodesic_area(g) for key, g in masks.items()},
            "note": "Geodesic chords and GEOS lon/lat-linear edges are slightly different geometry; the surface integral is used for model-cell tiling.",
            "antarctic_independent_laea_area_m2": polar_area,
            "antarctic_laea_relative_error": polar_error, "antarctic_laea_max_relative_error": 1e-5,
        },
        "geographic_samples": [{"name": n, "point": [x, y], "continent": c, "status": "PASS"}
                               for n, x, y, c in samples],
        "native_grid_audit": model_reports,
        "remaining_gates": report["blockers"],
    }
    check(implementation_sha256 == base.digest(base.ROOT / "prototype" / "scripts" / "validate_reviewed_continent_masks.py"),
          "Validator source changed during execution; rerun required")
    base.dump(folder / "validation.json", validation)
    report["status"] = "geography-reviewed-topology-passed-grounding-and-climate-gates-open"
    report["validation"] = {"file": "validation.json", "sha256": base.digest(folder / "validation.json"),
                            "overall": validation["overall"]}
    base.dump(folder / "report.json", report)
    review.update_manifest()
    print(json.dumps({"overall": validation["overall"], "topology": validation["topology"],
                      "polar_error": polar_error,
                      "model_unallocated_area_m2": {r["source_id"]: r["unallocated_model_land_area_m2"] for r in model_reports}}, indent=2))


if __name__ == "__main__":
    main()
