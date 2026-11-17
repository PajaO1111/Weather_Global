"""Independent raw GPCC recomputation and sampled geodesic weight verification."""
import gzip
import hashlib
import json
import re
from pathlib import Path

import numpy as np
from netCDF4 import Dataset, num2date
from pyproj import Geod
from shapely.geometry import box, shape

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "data_samples/2026-11-06/precipitation-7d4"


def check(condition, message):
    if not condition:
        raise ValueError(message)


def checksum(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def near(actual, expected, message, tolerance=0.000002):
    check(actual is not None and abs(actual - expected) < tolerance, message)


def geodesic_area(geometry, geod):
    polygons = [geometry] if geometry.geom_type == "Polygon" else list(getattr(geometry, "geoms", []))
    result = 0.
    for polygon in polygons:
        if polygon.geom_type != "Polygon":
            continue
        rings = [polygon.exterior, *polygon.interiors]
        areas = []
        for ring in rings:
            coords = np.asarray(ring.coords)
            dense = []
            for a, b in zip(coords[:-1], coords[1:]):
                steps = max(1, int(np.ceil(np.max(np.abs(b - a)) / .02)))
                dense.extend(a + (b - a) * (i / steps) for i in range(steps))
            if not dense:
                areas.append(0.)
            else:
                xy = np.asarray(dense)
                area, _ = geod.polygon_area_perimeter(xy[:, 0], xy[:, 1])
                areas.append(abs(area))
        result += max(0., areas[0] - sum(areas[1:]))
    return result


def validate():
    manifest_path = OUT / "source-manifest.json"
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    for row in manifest["sources"]:
        check(Path(row["file"]).name == row["file"], "Unsafe source")
        path = OUT / "sources" / row["file"]
        check(path.stat().st_size == row["bytes"] and checksum(path) == row["sha256"], "Source checksum mismatch")
        if path.name.endswith(".nc.gz"):
            md5_path = path.with_name("readme_md5_" + path.name.split("monthly_")[1].replace(".nc.gz", ".txt"))
            expected = re.search(r"\b[a-f0-9]{32}\b", md5_path.read_text(), re.I)
            check(expected is not None and hashlib.md5(path.read_bytes()).hexdigest() == expected[0].lower(), "Producer MD5 mismatch")
    raw = (OUT / "precipitation_v1.json").read_bytes()
    bundle = json.loads(raw)
    catalog = json.loads((OUT / "catalog.json").read_text())
    check(len(raw) == catalog["product"]["bytes"] and hashlib.sha256(raw).hexdigest() == catalog["product"]["sha256"], "Artifact mismatch")
    pins = bundle["provenance"]
    check(pins["builder_sha256"] == checksum(ROOT / "prototype/scripts/build_precipitation.py")
          and pins["manifest_sha256"] == checksum(manifest_path)
          and pins["weights_sha256"] == checksum(OUT / "weights.npz")
          and pins["weights_metadata_sha256"] == checksum(OUT / "weights.json"), "Stale dependencies")
    check(bundle["source"]["variable"] == "precip" and bundle["source"]["not_used"] == "precip_infill"
          and bundle["source"]["confidence_level"] is None
          and bundle["source"]["gauge_correction_applied_by_project"] is False, "Misrepresented source")
    for path, digest in pins["geometry_dependencies"].items():
        check(checksum(ROOT / path) == digest, "Changed geometry dependency")
    with np.load(OUT / "weights.npz", allow_pickle=False) as stored:
        geometry, support = stored["geometry"], stored["support"]
    check(geometry.shape == (7, 72, 144) and support.shape == (72, 144)
          and np.isfinite(geometry).all() and (geometry >= 0).all(), "Invalid weights")
    geometry_audits = 0
    geod = Geod(ellps="WGS84")
    regions = bundle["regions"]
    for k, region in enumerate(regions):
        polygon = shape(json.loads((ROOT / "data_samples/2026-11-06/continent-masks-7c6d" /
                                    (region["id"] + ".geojson")).read_text(encoding="utf-8"))["geometry"])
        indices = np.argwhere(geometry[k] > 1e5)
        samples = indices[np.linspace(0, len(indices) - 1, 6, dtype=int)]
        for i, j in samples:
            latitude, longitude = 88.75 - i * 2.5, -178.75 + j * 2.5
            clip = polygon.intersection(box(longitude - 1.25, latitude - 1.25, longitude + 1.25, latitude + 1.25))
            independent = geodesic_area(clip, geod)
            check(abs(geometry[k, i, j] - independent) < max(500, independent * 2e-6), "Independent cell geometry failed")
            geometry_audits += 1
        near(region["geographic_area_km2"], geometry[k].sum() / 1e6, "Wrong geographic area")
        near(region["supported_area_km2"], (geometry[k] * support).sum() / 1e6, "Wrong supported area")
        near(region["support_fraction"], (geometry[k] * support).sum() / geometry[k].sum(), "Wrong support fraction")
    independent = [[] for _ in regions]
    month_index = 0
    for path in sorted((OUT / "sources").glob("*.nc.gz")):
        with Dataset("gpcc", memory=gzip.decompress(path.read_bytes())) as ds:
            check(ds["precip"].units == "mm/month" and ds["dist_int"].units == "mean distance in kilometer", "Wrong units")
            times = ds["time"]
            dates = num2date(times[:], times.units, getattr(times, "calendar", "standard"))
            values, gauges, distances = (ds[name][:] for name in ("precip", "gauge", "dist_int"))
            for t, date in enumerate(dates):
                y, m = divmod(1891 * 12 + month_index, 12)
                check(date.year == y and date.month == m + 1, "Broken decoded source axis")
                for k, region in enumerate(regions):
                    point = region["monthly"][month_index]
                    check(point["date"] == f"{y:04d}-{m + 1:02d}", "Shifted product date")
                    weight = (geometry[k] * support).ravel()
                    cells = np.flatnonzero(weight > 0)
                    if not len(cells):
                        check(point["value"] is None and point["reason"] == "no-source-domain"
                              and point["station_fraction"] is None and point["distance_km"] is None, "Filled Antarctic domain")
                        independent[k].append(None)
                        continue
                    check(not np.ma.getmaskarray(values[t]).ravel()[cells].any(), "Invalid common support")
                    x = np.asarray(values[t]).ravel()[cells].astype(float)
                    w = weight[cells]
                    value = float(np.average(x, weights=w))
                    station = float(np.average((np.asarray(gauges[t]).ravel()[cells] > 0).astype(float), weights=w))
                    distance = float(np.average(np.asarray(distances[t]).ravel()[cells].astype(float), weights=w))
                    near(point["value"], value, "Independent precip reduction mismatch")
                    near(point["station_fraction"], station, "Independent gauge-cell fraction mismatch")
                    near(point["distance_km"], distance, "Independent interpolation distance mismatch")
                    check(point["coverage"] == 1 and point["reason"] is None, "Wrong fixed support coverage")
                    independent[k].append(value)
                month_index += 1
    check(month_index == 1628 and len(regions) == 7, "Unexpected source size")
    reference_checks = annual_checks = 0
    for k, region in enumerate(regions):
        check(len(region["monthly"]) == 1628 and len(region["annual"]) == 136 and len(region["reference"]) == 13, "Wrong product axes")
        for index, row in enumerate(region["annual"]):
            year = 1891 + index
            months = region["monthly"][index * 12:(index + 1) * 12]
            check(row["date"] == str(year) and row["months"] == len(months), "Wrong annual support")
            if k == 6 or len(months) < 12:
                check(row["value"] is None and row["anomaly"] is None, "Filled unsupported annual value")
            else:
                near(row["value"], sum(p["value"] for p in months), "Annual sum mismatch")
                near(row["station_fraction"], min(p["station_fraction"] for p in months), "Wrong annual station diagnostic")
                near(row["distance_km"], sum(p["distance_km"] for p in months) / 12, "Wrong annual distance")
            annual_checks += 1
        for ref in region["reference"]:
            series = region["annual"] if ref["period"] == "annual" else [
                p for p in region["monthly"] if int(p["date"][5:]) == int(ref["period"])]
            reference = [p["value"] for p in series if "1981" <= p["date"][:4] <= "2010" and p["value"] is not None]
            check(len(reference) == ref["count"] == (0 if k == 6 else 30), "Incomplete reference")
            if reference:
                mean = sum(reference) / len(reference)
                near(ref["mean"], mean, "Reference mismatch")
                for point in series:
                    if point["value"] is not None:
                        near(point["anomaly"], point["value"] - ref["mean"], "Departure mismatch")
            else:
                check(ref["mean"] is None, "Filled Antarctic reference")
            reference_checks += 1
    report = {
        "status": "PASS-independent-raw-netcdf-and-geodesic-samples",
        "checked_month_records": 1628 * 7, "checked_valid_month_values": 1628 * 6,
        "checked_annual_records": annual_checks, "checked_references": reference_checks,
        "independent_geometry_cells": geometry_audits, "source_files": 47,
        "artifact_sha256": hashlib.sha256(raw).hexdigest(), "validator_sha256": checksum(Path(__file__)),
        "method": "Independent raw NetCDF per-region numpy.average; all monthly values/diagnostics and annual sums/references. 42 independently densified WGS84 geodesic cell intersections.",
    }
    (OUT / "validation.json").write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(report))


if __name__ == "__main__":
    validate()
