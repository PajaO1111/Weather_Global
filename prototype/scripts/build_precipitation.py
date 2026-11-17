"""GPCC precip reductions on newly intersected fixed continental land support."""
import gzip
import hashlib
import json
from pathlib import Path

import numpy as np
from netCDF4 import Dataset, num2date
from shapely.geometry import mapping, shape

from continental_weights import NAMES, load_masks
from continent_geometry_area import lonlat_area
from validate_reviewed_continent_masks import cell_area, geometry_index, grid_cell
import build_reviewed_continent_masks as reviewed

ROOT = Path(__file__).resolve().parents[2]
OUTPUT = ROOT / "data_samples/2026-11-06/precipitation-7d4"
VERSION = "gpcc-v2025-250-20261106-7d4"
IDS = list(NAMES)
CITATION = ("Rustemeier, E.; Finger, P.; Schirmeister, Z.; Ziese, M. (2025). "
            "GPCC Precipitation Analysis Monthly Version 2025 at 2.5 degrees. "
            "DOI:10.5676/DWD_GPCC/MONTHLY_V2025_250. Source: DWD/GPCC, CC BY 4.0. "
            "Subset: precip, gauge, dist_int, 1891-01 to 2026-08, accessed 2026-11-06. "
            "Project fractional continental reductions and 1981-2010 references; "
            "Natural Earth reviewed geography, public domain.")


def require(condition, message):
    if not condition:
        raise ValueError(message)


def sha(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def rounded(value):
    return round(float(value), 6)


def reduce_months(precip, gauge, distance, weights):
    weights = np.asarray(weights, dtype=float)
    require(weights.ndim == 3 and np.isfinite(weights).all() and (weights >= 0).all(),
            "Invalid precipitation weights")
    require(precip.shape == gauge.shape == distance.shape
            and precip.ndim == 3 and precip.shape[1:] == weights.shape[1:], "Invalid GPCC field shape")
    raw = np.ma.getdata(precip).astype(float)
    valid = ~np.ma.getmaskarray(precip) & np.isfinite(raw)
    require((raw[valid] >= 0).all(), "Negative valid precipitation")
    result = [[] for _ in weights]
    for k, weight in enumerate(weights):
        area = weight.sum()
        for i in range(len(precip)):
            good = valid[i] & (weight > 0)
            available = weight[good].sum()
            coverage = available / area if area else 0.
            if not area or coverage < 1 - 1e-10:
                result[k].append({"value": None, "coverage": rounded(coverage), "station_fraction": None,
                                  "distance_km": None, "reason": "no-source-domain" if not area else "incomplete-fixed-support"})
                continue
            for diagnostic in (gauge[i], distance[i]):
                require(not np.ma.getmaskarray(diagnostic)[good].any()
                        and np.isfinite(np.asarray(diagnostic)[good]).all()
                        and (np.asarray(diagnostic)[good] >= 0).all(), "Missing or invalid supported diagnostic")
            result[k].append({
                "value": rounded(np.sum(raw[i][good] * weight[good]) / area),
                "coverage": rounded(coverage),
                "station_fraction": rounded(weight[good & (np.asarray(gauge[i]) > 0)].sum() / area),
                "distance_km": rounded(np.sum(np.asarray(distance[i])[good] * weight[good]) / area),
                "reason": None,
            })
    return result


def annual_rows(months, first=1891, last=2026):
    result = []
    for year in range(first, last + 1):
        selected = [row for row in months if row["date"].startswith(str(year))]
        good = len(selected) == 12 and all(row["value"] is not None for row in selected)
        unsupported = selected and all(row["reason"] == "no-source-domain" for row in selected)
        result.append({
            "date": str(year), "value": rounded(sum(row["value"] for row in selected)) if good else None,
            "months": len(selected), "coverage": min((row["coverage"] for row in selected), default=0.),
            "station_fraction": min(row["station_fraction"] for row in selected) if good else None,
            "distance_km": rounded(sum(row["distance_km"] for row in selected) / 12) if good else None,
            "reason": None if good else "no-source-domain" if unsupported else "incomplete-source-year",
        })
    return result


def immutable(path, content):
    if path.exists():
        require(path.read_bytes() == content, f"Changed immutable output {path}; use a new version")
    else:
        path.write_bytes(content)


def build():
    manifest_path = OUTPUT / "source-manifest.json"
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    require(len(manifest["sources"]) == 96, "Incomplete GPCC archive")
    for row in manifest["sources"]:
        require(Path(row["file"]).name == row["file"] and row["status"] == "archived", "Unsafe source")
        path = OUTPUT / "sources" / row["file"]
        require(path.stat().st_size == row["bytes"] and sha(path) == row["sha256"], "Changed source")
    files = sorted((OUTPUT / "sources").glob("*.nc.gz"))
    require(len(files) == 47, "Missing GPCC intervals")
    support = np.ones((72, 144), dtype=bool)
    for path in files:
        with Dataset("gpcc", memory=gzip.decompress(path.read_bytes())) as ds:
            require(ds["precip"].units == "mm/month" and ds["precip"].dimensions == ("time", "lat", "lon"),
                    "Wrong GPCC precipitation field")
            require(np.array_equal(ds["lat"][:], np.arange(88.75, -90, -2.5))
                    and np.array_equal(ds["lon"][:], np.arange(-178.75, 180, 2.5)), "Wrong native grid")
            support &= np.all(~np.ma.getmaskarray(ds["precip"][:]), axis=0)
    features, _ = load_masks()
    geometry_dependencies = [
        reviewed.OUTPUT / f"{identity}.geojson" for identity in IDS
    ] + [Path(__file__).with_name(name) for name in
         ("continent_geometry_area.py", "validate_reviewed_continent_masks.py", "build_continent_masks.py")]
    dependencies = {str(path.relative_to(ROOT)): sha(path) for path in geometry_dependencies}
    cache = OUTPUT / "weights.npz"
    metadata = OUTPUT / "weights.json"
    if cache.exists() or metadata.exists():
        previous = json.loads(metadata.read_text(encoding="utf-8"))
        require(previous["dependencies"] == dependencies and sha(cache) == previous["sha256"], "Stale GPCC weights")
        with np.load(cache, allow_pickle=False) as stored:
            geometry = stored["geometry"].copy()
            require(np.array_equal(support, stored["support"]), "Changed fixed native support")
    else:
        geometry = np.zeros((7, 72, 144))
        indices = [geometry_index(shape(features[identity]["geometry"])) for identity in IDS]
        for i, latitude in enumerate(np.arange(88.75, -90, -2.5)):
            for j, longitude in enumerate(np.arange(-178.75, 180, 2.5)):
                cell = grid_cell(latitude - 1.25, latitude + 1.25, longitude - 1.25, longitude + 1.25)
                for k, index in enumerate(indices):
                    geometry[k, i, j] = cell_area(cell, *index)
            if i % 18 == 0:
                print(f"GPCC new geometry row {i}/72", flush=True)
        np.savez_compressed(cache, geometry=geometry, support=support)
        metadata.write_text(json.dumps({"dependencies": dependencies, "sha256": sha(cache)}, indent=2) + "\n", encoding="utf-8")
    totals = geometry.sum(axis=(1, 2))
    expected = np.array([lonlat_area(shape(features[identity]["geometry"])) for identity in IDS])
    require(np.all(np.abs(totals - expected) < np.maximum(100, expected * 1e-8)), "Grid does not reconstruct land")
    weights = geometry * support
    fractions = weights.sum(axis=(1, 2)) / totals
    require(np.all(fractions[:6] >= .95) and fractions[6] == 0, "Unexpected GPCC support")
    all_months = [[] for _ in IDS]
    for path in files:
        with Dataset("gpcc", memory=gzip.decompress(path.read_bytes())) as ds:
            time = ds["time"]
            dates = num2date(time[:], time.units, getattr(time, "calendar", "standard"))
            reduced = reduce_months(ds["precip"][:], ds["gauge"][:], ds["dist_int"][:], weights)
            for k, rows in enumerate(reduced):
                all_months[k].extend({"date": f"{d.year:04d}-{d.month:02d}", **row} for d, row in zip(dates, rows))
        print(f"Reduced {path.name}", flush=True)
    regions = []
    for k, identity in enumerate(IDS):
        monthly = all_months[k]
        require(len(monthly) == 1628, "Unexpected decoded month count")
        for i, row in enumerate(monthly):
            year, month = divmod(1891 * 12 + i, 12)
            require(row["date"] == f"{year:04d}-{month + 1:02d}", "Noncontiguous GPCC time")
        annual = annual_rows(monthly)
        reference = []
        for period in [str(i) for i in range(1, 13)] + ["annual"]:
            series = annual if period == "annual" else [row for row in monthly if int(row["date"][5:]) == int(period)]
            valid = [row["value"] for row in series if "1981" <= row["date"][:4] <= "2010" and row["value"] is not None]
            mean = rounded(sum(valid) / len(valid)) if valid else None
            require(len(valid) == (0 if identity == "antarctica" else 30), "Incomplete precipitation reference")
            reference.append({"period": period, "mean": mean, "count": len(valid)})
            for row in series:
                row["anomaly"] = rounded(row["value"] - mean) if row["value"] is not None and mean is not None else None
        regions.append({
            "id": identity, "name": NAMES[identity], "geographic_area_km2": rounded(totals[k] / 1e6),
            "supported_area_km2": rounded(weights[k].sum() / 1e6), "support_fraction": round(float(fractions[k]), 9),
            "monthly": monthly, "annual": annual, "reference": reference,
        })
    display = {"type": "FeatureCollection", "features": [
        {"type": "Feature", "properties": {"name": identity},
         "geometry": mapping(shape(features[identity]["geometry"]).simplify(.15, preserve_topology=True))}
        for identity in IDS
    ]}
    licence_path = ROOT / "data_samples/2026-11-06/phase7d-feasibility/sources/gpcc-terms.html"
    licence_manifest = json.loads((licence_path.parents[1] / "source-manifest.json").read_text(encoding="utf-8"))
    licence_row, = [r for r in licence_manifest["sources"] if r["file"] == licence_path.name and r["status"] == "archived"]
    require(sha(licence_path) == licence_row["sha256"], "Changed DWD legal evidence")
    licence = licence_path.read_text(encoding="utf-8")
    require("CC BY 4.0" in licence and "All open spatial data" in licence, "Unverified DWD use evidence")
    bundle = {
        "schema_version": 1, "version": VERSION, "publication_allowed": False,
        "quantity": "land-precipitation-depth", "unit": "mm", "period": {"first": "1891-01", "last": "2026-08"},
        "reference_period": {"first": 1981, "last": 2010}, "annual_method": "sum-12-months-identical-fixed-support",
        "spatial_method": "ellipsoidal-fractional-land-intersections-fixed-common-precip-support",
        "source": {"variable": "precip", "not_used": "precip_infill", "doi": "10.5676/DWD_GPCC/MONTHLY_V2025_250",
                   "version": "2025", "resolution_degrees": 2.5, "citation": CITATION,
                   "confidence_level": None, "gauge_correction_applied_by_project": False},
        "provenance": {"manifest_sha256": sha(manifest_path), "builder_sha256": sha(__file__),
                       "weights_sha256": sha(cache), "weights_metadata_sha256": sha(metadata),
                       "licence_sha256": sha(licence_path), "geometry_dependencies": dependencies,
                       "source_files": len(files), "archive_responses": len(manifest["sources"]),
                       "fixed_native_support_cells": int(support.sum())},
        "regions": regions, "display_geometry": display,
    }
    data = (json.dumps(bundle, separators=(",", ":"), ensure_ascii=False, allow_nan=False) + "\n").encode()
    catalog = {"schema_version": 1, "version": VERSION, "api_base": "precipitation-api/v1/", "publication_allowed": False,
               "product": {"file": "bundle.json", "version": VERSION, "bytes": len(data),
                           "sha256": hashlib.sha256(data).hexdigest()}}
    immutable(OUTPUT / "precipitation_v1.json", data)
    immutable(OUTPUT / "catalog.json", (json.dumps(catalog, indent=2) + "\n").encode())
    print(json.dumps({"bytes": len(data), "sha256": catalog["product"]["sha256"],
                      "support_fractions": dict(zip(IDS, fractions.tolist()))}))


if __name__ == "__main__":
    build()
