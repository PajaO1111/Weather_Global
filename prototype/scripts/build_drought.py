"""SPEIbase area classes on the native grid; no index averaging or gap filling."""
import hashlib
import json
from pathlib import Path
import numpy as np
from netCDF4 import Dataset, num2date
from shapely.geometry import shape, mapping
from continental_weights import NAMES, load_masks
from continent_geometry_area import lonlat_area
from validate_reviewed_continent_masks import grid_cell, geometry_index, cell_area
import build_reviewed_continent_masks as reviewed

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "data_samples/2026-11-06/drought-7d5"
VERSION = "speibase-2.11-20261106-7d5"
IDS = list(NAMES)
CATEGORIES = ["extreme-dry", "severe-dry", "moderate-dry", "near-normal",
              "moderate-wet", "severe-wet", "extreme-wet"]
CITATION = ("Vicente-Serrano, S. M., Begueria, S., Lopez-Moreno, J. I. (2010), "
            "A Multiscalar Drought Index Sensitive to Global Warming: The Standardized "
            "Precipitation Evapotranspiration Index. Journal of Climate 23, 1696-1718. "
            "doi:10.1175/2009JCLI2909.1. Begueria et al. (2014), SPEI revisited. "
            "International Journal of Climatology 34, 3001-3023. doi:10.1002/joc.3887. "
            "CSIC SPEIbase 2.11, CRU TS 4.09, SPEI-3 and SPEI-12, 1901-2024; "
            "accessed 2026-11-06. Original and adapted drought database: ODbL 1.0; "
            "individual database contents: DbCL 1.0. Project fractional area reductions.")


def require(condition, message):
    if not condition:
        raise ValueError(message)


def sha(path):
    with Path(path).open("rb") as file:
        digest = hashlib.sha256()
        for chunk in iter(lambda: file.read(4 * 1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def rounded(value):
    return round(float(value), 9)


def classify(raw):
    return [(raw <= -2), (raw > -2) & (raw <= -1.5), (raw > -1.5) & (raw <= -1),
            (raw > -1) & (raw < 1), (raw >= 1) & (raw < 1.5),
            (raw >= 1.5) & (raw < 2), (raw >= 2)]


def area_classes(values, weights):
    weights = np.asarray(weights, dtype=float)
    values = np.ma.asarray(values)
    require(values.ndim == 2 and weights.ndim == 1 and values.shape[1] == len(weights)
            and np.isfinite(weights).all() and (weights >= 0).all(), "Invalid drought values/weights")
    raw = np.ma.getdata(values)
    valid = ~np.ma.getmaskarray(values) & np.isfinite(raw)
    available = np.sum(valid * weights, axis=1)
    areas = np.stack([np.sum((mask & valid) * weights, axis=1) for mask in classify(raw)], axis=1)
    return [point_row(a, area, weights.sum()) for a, area in zip(areas, available)]


def point_row(areas, available, domain):
    coverage = available / domain if domain else 0.
    fractions = [rounded(a / available) for a in areas] if available else None
    return {
        "categories": fractions, "dry": rounded(sum(areas[:3]) / available) if available else None,
        "severe": rounded(sum(areas[:2]) / available) if available else None,
        "extreme": rounded(areas[0] / available) if available else None,
        "coverage": rounded(coverage), "missing_fraction": rounded(1 - coverage),
        "available_area_km2": round(float(available / 1e6), 6),
        "reason": None if available else "no-source-domain" if not domain else "no-valid-source-values",
    }


def annual_summary(months, first=1901, last=2024):
    result = []
    for year in range(first, last + 1):
        chosen = [p for p in months if p["date"].startswith(str(year))]
        complete = len(chosen) == 12 and all(p["dry"] is not None for p in chosen)
        row = {"date": str(year), "months": len(chosen),
               "valid_months": sum(p["dry"] is not None for p in chosen),
               "coverage": min((p["coverage"] for p in chosen), default=0.),
               "reason": None if complete else "incomplete-year"}
        for key in ["dry", "severe", "extreme"]:
            row[key] = rounded(sum(p[key] for p in chosen) / 12) if complete else None
        row["categories"] = [rounded(sum(p["categories"][i] for p in chosen) / 12) for i in range(7)] if complete else None
        result.append(row)
    return result


def immutable(path, data):
    if path.exists():
        require(path.read_bytes() == data, f"Changed immutable drought output {path}; use a new version")
    else:
        path.write_bytes(data)


def geometry_weights():
    features, _ = load_masks()
    files = [reviewed.OUTPUT / f"{identity}.geojson" for identity in IDS]
    files += [Path(__file__).with_name(name) for name in
              ("continental_weights.py", "continent_geometry_area.py", "validate_reviewed_continent_masks.py",
               "build_reviewed_continent_masks.py", "build_continent_masks.py")]
    dependencies = {str(p.relative_to(ROOT)): sha(p) for p in files}
    cache, metadata = OUT / "weights.npz", OUT / "weights.json"
    if cache.exists() or metadata.exists():
        record = json.loads(metadata.read_text(encoding="utf-8"))
        require(record["dependencies"] == dependencies and record["sha256"] == sha(cache), "Stale drought weights")
        with np.load(cache, allow_pickle=False) as stored:
            geometry = stored["geometry"].copy()
    else:
        geometry = np.zeros((7, 360, 720))
        indices = [geometry_index(shape(features[identity]["geometry"])) for identity in IDS]
        for i, latitude in enumerate(np.arange(-89.75, 90, .5)):
            for j, longitude in enumerate(np.arange(-179.75, 180, .5)):
                cell = grid_cell(latitude - .25, latitude + .25, longitude - .25, longitude + .25)
                for k, index in enumerate(indices):
                    geometry[k, i, j] = cell_area(cell, *index)
            if i % 45 == 0:
                print(f"SPEI geometry row {i}/360", flush=True)
        np.savez_compressed(cache, geometry=geometry)
        metadata.write_text(json.dumps({"dependencies": dependencies, "sha256": sha(cache)}, indent=2) + "\n", encoding="utf-8")
    for k, identity in enumerate(IDS):
        total = lonlat_area(shape(features[identity]["geometry"]))
        require(abs(geometry[k].sum() - total) < max(100, total * 1e-8), "Native grid land conservation failed")
    return features, geometry, dependencies


def build():
    manifest_path = OUT / "source-manifest.json"
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    require(len(manifest["sources"]) == 7, "Incomplete drought archive")
    for row in manifest["sources"]:
        require(Path(row["file"]).name == row["file"] and row["status"] == "archived", "Unsafe drought source")
        path = OUT / "sources" / row["file"]
        require(path.stat().st_size == row["bytes"] and sha(path) == row["sha256"], "Changed original")
    features, geometry, dependencies = geometry_weights()
    totals = geometry.sum(axis=(1, 2))
    products = []
    for scale in [3, 12]:
        path = OUT / "sources" / f"spei{scale:02d}-t.nc"
        with Dataset(path) as ds:
            require(ds.version == "2.11.0" and "CRU TS 4.09" in ds.summary
                    and f"{scale}-months" in ds.title, "Wrong SPEI version/scale")
            var = ds["spei"]
            require(var.dimensions == ("time", "lat", "lon") and var.shape == (1488, 360, 720)
                    and var.units == "1", "Wrong SPEI field")
            require(np.array_equal(ds["lat"][:], np.arange(-89.75, 90, .5))
                    and np.array_equal(ds["lon"][:], np.arange(-179.75, 180, .5)), "Wrong native grid")
            times = ds["time"]
            dates = num2date(times[:], times.units, times.calendar)
            for i, date in enumerate(dates):
                require(date.year == 1901 + i // 12 and date.month == i % 12 + 1, "Broken source time")
            area = np.zeros((7, 1488, 7))
            available = np.zeros((7, 1488))
            domain_mask = np.zeros((360, 720), dtype=bool)
            ever_missing = np.zeros((360, 720), dtype=bool)
            for i in range(0, 360, 10):
                values = var[:, i:i + 10, :]
                raw = np.ma.getdata(values)
                valid = ~np.ma.getmaskarray(values) & np.isfinite(raw)
                domain_mask[i:i + 10] = valid.any(axis=0)
                ever_missing[i:i + 10] = valid.any(axis=0) & ~valid[scale - 1:].all(axis=0)
                weight = geometry[:, i:i + 10, :]
                available += np.einsum("tij,kij->kt", valid, weight, optimize=True)
                for cat, mask in enumerate(classify(raw)):
                    area[:, :, cat] += np.einsum("tij,kij->kt", mask & valid, weight, optimize=True)
            domain = (geometry * domain_mask).sum(axis=(1, 2))
            require(domain[6] == 0 and np.all(domain[:6] > 0), "Unexpected SPEI domain")
            regions = []
            for k, identity in enumerate(IDS):
                points = [{"date": f"{1901 + i // 12}-{i % 12 + 1:02d}",
                           **point_row(area[k, i], available[k, i], domain[k])} for i in range(1488)]
                if k < 6:
                    require(all(p["dry"] is None for p in points[:scale - 1])
                            and all(p["dry"] is not None for p in points[scale - 1:]), "Unexpected source spinup")
                regions.append({
                    "id": identity, "name": NAMES[identity], "geographic_area_km2": round(float(totals[k] / 1e6), 6),
                    "source_domain_area_km2": round(float(domain[k] / 1e6), 6),
                    "domain_fraction": rounded(domain[k] / totals[k]),
                    "ever_missing_domain_area_km2": round(float((geometry[k] * ever_missing).sum() / 1e6), 6),
                    "points": points, "annual": annual_summary(points),
                })
            products.append({"months": scale, "source_domain_cells": int(domain_mask.sum()),
                             "intermittently_missing_cells": int(ever_missing.sum()), "regions": regions})
            print(f"Reduced SPEI-{scale}: {int(domain_mask.sum())} native domain cells", flush=True)
    page = (OUT / "sources/product.html").read_text(encoding="utf-8")
    require("Open Database License" in page and "Database Contents License" in page and "Share-Alike" in page,
            "Missing licence evidence")
    bundle = {
        "schema_version": 1, "version": VERSION, "publication_allowed": False,
        "quantity": "spei-category-area-fraction", "unit": "fraction-of-available-source-land",
        "period": {"first": "1901-01", "last": "2024-12"},
        "categories": CATEGORIES, "boundaries": [-2, -1.5, -1, 1, 1.5, 2],
        "boundary_rule": "dry-upper-inclusive-wet-lower-inclusive",
        "denominator": "available-source-land-per-month-no-infill",
        "annual_method": "mean-of-12-monthly-area-fractions-not-unique-annual-area",
        "source": {"version": "2.11.0", "cru_version": "4.09", "variable": "spei", "unit": "1",
                   "pet": "FAO-56-Penman-Monteith", "resolution_degrees": .5,
                   "calibration_period": None, "recentered_by_project": False,
                   "citation": CITATION, "url": "https://spei.csic.es/database.html",
                   "licence": "ODbL-1.0", "contents_licence": "DbCL-1.0", "confidence_level": None},
        "provenance": {"manifest_sha256": sha(manifest_path), "builder_sha256": sha(__file__),
                       "weights_sha256": sha(OUT / "weights.npz"), "weights_metadata_sha256": sha(OUT / "weights.json"),
                       "geometry_dependencies": dependencies, "archive_responses": 7},
        "scales": products,
        "display_geometry": {"type": "FeatureCollection", "features": [
            {"type": "Feature", "properties": {"name": identity},
             "geometry": mapping(shape(features[identity]["geometry"]).simplify(.15, preserve_topology=True))}
            for identity in IDS]},
    }
    data = (json.dumps(bundle, separators=(",", ":"), ensure_ascii=False, allow_nan=False) + "\n").encode()
    catalog = {"schema_version": 1, "version": VERSION, "api_base": "drought-api/v1/", "publication_allowed": False,
               "product": {"file": "bundle.json", "version": VERSION, "bytes": len(data),
                           "sha256": hashlib.sha256(data).hexdigest()}}
    immutable(OUT / "drought_v1.json", data)
    immutable(OUT / "catalog.json", (json.dumps(catalog, indent=2) + "\n").encode())
    print(json.dumps({"bytes": len(data), "sha256": catalog["product"]["sha256"],
                      "domains": [[r["domain_fraction"] for r in s["regions"]] for s in products]}))


if __name__ == "__main__":
    build()
