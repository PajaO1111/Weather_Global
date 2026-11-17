"""Offline content validation; no anomalies or ensemble statistics."""
import json

import netCDF4
import numpy as np
from shapely.geometry import shape
from shapely.ops import unary_union

from build_europe_pilot import ARCHIVE, COVERAGE, grid_weights, read_shapes
from fetch_cmip6_europe_pair import APPROVED, OUTPUT, ROOT, plan, sha256, verify


def time_axis(dataset, experiment):
    time = dataset["time"]
    if not time.units.startswith("days since "):
        raise ValueError("Expected day-based CF time axis")
    dates = netCDF4.num2date(time[:], time.units, calendar=time.calendar)
    first, last = (1850, 2014) if experiment == "historical" else (2015, 2100)
    keys = [(date.year, date.month) for date in dates]
    if keys != [(year, month) for year in range(first, last + 1) for month in range(1, 13)]:
        raise ValueError("Missing, duplicate or reordered monthly dates")
    intervals = dataset[time.bounds][:]
    expected = np.array([[netCDF4.date2num(type(date)(date.year, date.month, 1),
                                         time.units, calendar=time.calendar),
                          date.daysinmonth] for date in dates])
    if (np.ma.getmaskarray(intervals).any() or intervals.shape != (len(dates), 2)
            or not np.allclose(intervals[:, 0], expected[:, 0], rtol=0, atol=1e-8)
            or not np.allclose(intervals[:, 1] - intervals[:, 0], expected[:, 1],
                               rtol=0, atol=1e-8)):
        raise ValueError("Time bounds do not match complete source-calendar months")
    return dates, float(intervals[0, 0]), float(intervals[-1, 1])


def validate():
    manifest = json.loads((OUTPUT / "manifest.json").read_text(encoding="utf-8"))
    if (manifest["status"] != "integrity-verified-not-content-validated"
            or manifest["approved_models"] != list(APPROVED)
            or manifest["inventory_sha256"] != sha256(
                ROOT / "data_samples" / "2026-11-06" / "europe-cmip6-inventory" / "inventory.json")):
        raise ValueError("Manifest identity or inventory hash mismatch")
    expected = {item["file"]: item for item in plan()}
    if len(manifest["files"]) != len(expected):
        raise ValueError("Incomplete download manifest")
    paths = {}
    for item in manifest["files"]:
        if item["file"] not in expected or item["file"] in paths:
            raise ValueError("Unexpected or duplicate file")
        path = (ROOT / item["local_path"]).resolve()
        if ROOT not in path.parents:
            raise ValueError("Source outside repository")
        verify(path, expected[item["file"]])
        paths[item["file"]] = path
    mask_path = ARCHIVE / "europe-mask-v1.geojson"
    feature = json.loads(mask_path.read_text(encoding="utf-8"))
    mask = shape(feature["geometry"])
    land = unary_union([geometry for _, geometry in read_shapes("land")])
    report = {
        "phase": "7C.3b", "status": "content-validated-awaiting-statistics-policy",
        "mask_sha256": sha256(mask_path), "mask_version": feature["properties"]["version"],
        "manifest_sha256": sha256(OUTPUT / "manifest.json"), "models": [],
        "anomalies_calculated": False, "ensemble_calculated": False,
        "publication": "Not approved. Two models are a technical comparison, not assessed uncertainty.",
    }
    for model in APPROVED:
        entries = [item for item in manifest["files"] if item["source_id"] == model]
        static = {}
        static_licenses = {}
        reference = None
        for variable in ("areacella", "sftlf"):
            item, = [item for item in entries if item["variable"] == variable]
            with netCDF4.Dataset(paths[item["file"]]) as dataset:
                for key, value in (("source_id", model), ("variant_label", "r1i1p1f1"),
                                   ("grid_label", "gn"), ("experiment_id", "historical")):
                    if getattr(dataset, key) != value:
                        raise ValueError(f"Static identity mismatch: {key}")
                coords = tuple(np.array(dataset[name][:]) for name in ("lat", "lon"))
                bounds = tuple(np.array(dataset[dataset[name].bounds][:]) for name in ("lat", "lon"))
                if reference is not None and any(not np.array_equal(a, b) for a, b in
                                                zip((*coords, *bounds), reference)):
                    raise ValueError("Static grids differ")
                reference = (*coords, *bounds)
                field = dataset[variable]
                values = field[:]
                if (field.units != ("m2" if variable == "areacella" else "%")
                        or field.dimensions != ("lat", "lon")
                        or np.ma.getmaskarray(values).any() or not np.isfinite(values).all()
                        or np.any(values <= 0 if variable == "areacella"
                                  else (values < 0) | (values > 100))):
                    raise ValueError("Invalid static units, dimensions or values")
                static[variable] = np.array(values)
                static_licenses[variable] = dataset.license
        lat, lon, lat_bounds, lon_bounds = reference
        weights, grid = grid_weights(lat, lon, land, mask, static["areacella"],
                                     static["sftlf"] / 100, lat_bounds, lon_bounds)
        row = {"source_id": model, "member": "r1i1p1f1", "grid": grid,
               "static_licenses": static_licenses, "experiments": {}}
        historical_calendar = None
        historical_end = None
        for experiment in ("historical", "ssp126", "ssp245", "ssp370", "ssp585"):
            item, = [item for item in entries if item["variable"] == "tas"
                     and item["experiment"] == experiment]
            with netCDF4.Dataset(paths[item["file"]]) as dataset:
                for key, value in (("source_id", model), ("variant_label", "r1i1p1f1"),
                                   ("grid_label", "gn"), ("experiment_id", experiment)):
                    if getattr(dataset, key) != value:
                        raise ValueError(f"tas identity mismatch: {key}")
                field = dataset["tas"]
                if field.units != "K" or field.dimensions != ("time", "lat", "lon") or "time: mean" not in field.cell_methods:
                    raise ValueError("Invalid tas units, dimensions or temporal semantics")
                coords = tuple(np.array(dataset[name][:]) for name in ("lat", "lon"))
                bounds = tuple(np.array(dataset[dataset[name].bounds][:]) for name in ("lat", "lon"))
                if any(not np.array_equal(a, b) for a, b in zip((*coords, *bounds), reference)):
                    raise ValueError("tas/static coordinates or bounds differ")
                dates, start, end = time_axis(dataset, experiment)
                calendar = dataset["time"].calendar
                if experiment == "historical":
                    historical_calendar, historical_end = calendar, end
                    historical_units = dataset["time"].units
                elif (calendar != historical_calendar
                      or dataset["time"].units != historical_units or start != historical_end
                      or dataset.parent_source_id != model
                      or dataset.parent_experiment_id != "historical"
                      or dataset.parent_variant_label != "r1i1p1f1"
                      or dataset.parent_time_units != historical_units
                      or float(dataset.branch_time_in_parent) != historical_end
                      or float(dataset.branch_time_in_child) != start):
                    raise ValueError("Historical/scenario parent or branch continuity mismatch")
                minimum = 1.0
                baseline_minimum = 1.0
                for index, date in enumerate(dates):
                    values = field[index]
                    valid = ~np.ma.getmaskarray(values) & np.isfinite(np.ma.getdata(values))
                    coverage = float(weights[valid].sum() / weights.sum())
                    if coverage + 1e-12 < COVERAGE:
                        raise ValueError("Monthly Europe land coverage below pilot threshold")
                    if np.any((np.ma.getdata(values)[valid] < 150)
                              | (np.ma.getdata(values)[valid] > 350)):
                        raise ValueError("tas outside broad physical sanity bounds")
                    minimum = min(minimum, coverage)
                    if 1981 <= date.year <= 2010:
                        baseline_minimum = min(baseline_minimum, coverage)
                licence = dataset.license
                if ("ShareAlike" not in licence.replace(" ", "")
                        or any(text != licence for text in static_licenses.values())):
                    raise ValueError("Unexpected licence; manual review required")
                row["experiments"][experiment] = {
                    "calendar": calendar, "months": len(dates), "shape": list(field.shape),
                    "minimum_europe_coverage": minimum,
                    "candidate_1981_2010_coverage": baseline_minimum if experiment == "historical" else None,
                    "license": licence, "cell_methods": field.cell_methods,
                    "file_sha256": item["sha256"], "tracking_id": dataset.tracking_id,
                    "further_info_url": getattr(dataset, "further_info_url", ""),
                    "parent_experiment": dataset.parent_experiment_id,
                    "parent_member": dataset.parent_variant_label,
                }
        report["models"].append(row)
    temporary = OUTPUT / "validation.json.tmp"
    temporary.write_text(json.dumps(report, indent=2, allow_nan=False) + "\n", encoding="utf-8")
    temporary.replace(OUTPUT / "validation.json")
    return report


if __name__ == "__main__":
    result = validate()
    print(result["status"], "models:", len(result["models"]))
