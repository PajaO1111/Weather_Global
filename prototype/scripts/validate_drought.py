"""Independent raw-source audit: categorical weighted histograms and geodesic samples."""
import hashlib
import json
from pathlib import Path
import numpy as np
from netCDF4 import Dataset, num2date
from pyproj import Geod
from shapely.geometry import shape, box
from validate_precipitation import geodesic_area

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "data_samples/2026-11-06/drought-7d5"


def require(condition, message):
    if not condition:
        raise ValueError(message)


def sha(path):
    result = hashlib.sha256()
    with Path(path).open("rb") as file:
        for data in iter(lambda: file.read(4 * 1024 * 1024), b""):
            result.update(data)
    return result.hexdigest()


def close(actual, expected, message, tolerance=2e-8):
    require(np.allclose(actual, expected, atol=tolerance, rtol=0), message)


def validate():
    manifest_path = OUT / "source-manifest.json"
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    require(len(manifest["sources"]) == 7, "Archive incomplete")
    for row in manifest["sources"]:
        require(Path(row["file"]).name == row["file"], "Unsafe original path")
        path = OUT / "sources" / row["file"]
        require(path.stat().st_size == row["bytes"] and sha(path) == row["sha256"], "Original changed")
    raw = (OUT / "drought_v1.json").read_bytes()
    bundle = json.loads(raw)
    catalog = json.loads((OUT / "catalog.json").read_text())
    require(catalog["product"]["bytes"] == len(raw) and catalog["product"]["sha256"] == hashlib.sha256(raw).hexdigest(),
            "Product bytes mismatch")
    pins = bundle["provenance"]
    for digest, path in [(pins["builder_sha256"], ROOT / "prototype/scripts/build_drought.py"),
                         (pins["manifest_sha256"], manifest_path),
                         (pins["weights_sha256"], OUT / "weights.npz"),
                         (pins["weights_metadata_sha256"], OUT / "weights.json")]:
        require(sha(path) == digest, "Stale product evidence")
    for path, digest in pins["geometry_dependencies"].items():
        require(sha(ROOT / path) == digest, "Geometry dependency changed")
    require(bundle["denominator"] == "available-source-land-per-month-no-infill"
            and bundle["source"]["licence"] == "ODbL-1.0"
            and bundle["source"]["pet"] == "FAO-56-Penman-Monteith"
            and bundle["source"]["recentered_by_project"] is False
            and bundle["source"]["calibration_period"] is None, "Misleading scientific contract")
    with np.load(OUT / "weights.npz", allow_pickle=False) as stored:
        geometry = stored["geometry"].copy()
    require(geometry.shape == (7, 360, 720) and np.isfinite(geometry).all() and (geometry >= 0).all(), "Bad weights")
    samples = 0
    for k, region in enumerate(bundle["scales"][0]["regions"]):
        polygon = shape(json.loads((ROOT / "data_samples/2026-11-06/continent-masks-7c6d" /
                                    f"{region['id']}.geojson").read_text(encoding="utf-8"))["geometry"])
        indices = np.argwhere(geometry[k] > 1e5)
        for i, j in indices[np.linspace(0, len(indices) - 1, 6, dtype=int)]:
            lat, lon = -89.75 + .5 * i, -179.75 + .5 * j
            actual = geodesic_area(polygon.intersection(box(lon - .25, lat - .25, lon + .25, lat + .25)), Geod(ellps="WGS84"))
            require(abs(actual - geometry[k, i, j]) < max(500, actual * 2e-6), "Independent geodesic intersection failed")
            samples += 1
    checked = valid_count = annual_count = 0
    for product in bundle["scales"]:
        scale = product["months"]
        weighted_histogram = np.zeros((7, 1488, 7))
        denominators = np.zeros((7, 1488))
        native_domain = np.zeros((360, 720), dtype=bool)
        ever_missing = native_domain.copy()
        with Dataset(OUT / "sources" / f"spei{scale:02d}-t.nc") as ds:
            require(ds.version == "2.11.0" and "CRU TS 4.09" in ds.summary
                    and f"{scale}-months" in ds.title and ds["spei"].units == "1"
                    and ds["spei"].shape == (1488, 360, 720), "Wrong raw SPEI")
            close(ds["lat"][:], np.arange(-89.75, 90, .5), "Wrong latitude")
            close(ds["lon"][:], np.arange(-179.75, 180, .5), "Wrong longitude")
            dates = num2date(ds["time"][:], ds["time"].units, ds["time"].calendar)
            for i, d in enumerate(dates):
                require(d.year == 1901 + i // 12 and d.month == i % 12 + 1, "Wrong decoded month")
            for i in range(0, 360, 12):
                field = ds["spei"][:, i:i + 12, :]
                values = np.ma.getdata(field).astype(float)
                good = ~np.ma.getmaskarray(field) & np.isfinite(values)
                native_domain[i:i + 12] = good.any(axis=0)
                ever_missing[i:i + 12] = good.any(axis=0) & ~good[scale - 1:].all(axis=0)
                codes = np.where(values < 1, np.searchsorted([-2, -1.5, -1], values, side="left"),
                                 3 + np.searchsorted([1, 1.5, 2], values, side="right"))
                for k, weight in enumerate(geometry[:, i:i + 12, :]):
                    denominators[k] += np.sum(good * weight, axis=(1, 2))
                    for code in range(7):
                        weighted_histogram[k, :, code] += np.sum((good & (codes == code)) * weight, axis=(1, 2))
        require(int(native_domain.sum()) == product["source_domain_cells"]
                and int(ever_missing.sum()) == product["intermittently_missing_cells"], "Domain diagnostics mismatch")
        for k, region in enumerate(product["regions"]):
            domain = float((geometry[k] * native_domain).sum())
            close(region["geographic_area_km2"], geometry[k].sum() / 1e6, "Wrong land area", 2e-6)
            close(region["source_domain_area_km2"], domain / 1e6, "Wrong domain", 2e-6)
            close(region["domain_fraction"], domain / geometry[k].sum(), "Wrong domain fraction")
            close(region["ever_missing_domain_area_km2"], (geometry[k] * ever_missing).sum() / 1e6, "Wrong missing diagnostic", 2e-6)
            require(len(region["points"]) == 1488 and len(region["annual"]) == 124, "Wrong axes")
            for t, point in enumerate(region["points"]):
                require(point["date"] == f"{1901 + t // 12}-{t % 12 + 1:02d}", "Shifted output date")
                available = denominators[k, t]
                close(point["available_area_km2"], available / 1e6, "Wrong available area", 2e-6)
                coverage = available / domain if domain else 0
                close(point["coverage"], coverage, "Coverage mismatch")
                close(point["missing_fraction"], 1 - coverage, "Missing fraction mismatch")
                if available:
                    expected = weighted_histogram[k, t] / available
                    close(point["categories"], expected, "Class fractions mismatch")
                    close(sum(point["categories"]), 1., "Class fractions do not close")
                    close(point["dry"], sum(expected[:3]), "Dry area mismatch")
                    close(point["severe"], sum(expected[:2]), "Severe area mismatch")
                    close(point["extreme"], expected[0], "Extreme area mismatch")
                    require(point["reason"] is None, "False missing reason")
                    valid_count += 1
                else:
                    require(point["categories"] is None and all(point[key] is None for key in ["dry", "severe", "extreme"])
                            and point["reason"] == ("no-source-domain" if not domain else "no-valid-source-values"),
                            "Missing source values filled")
                checked += 1
            for i, row in enumerate(region["annual"]):
                months = region["points"][12 * i:12 * i + 12]
                complete = all(p["dry"] is not None for p in months)
                require(row["date"] == str(1901 + i) and row["months"] == 12
                        and row["valid_months"] == sum(p["dry"] is not None for p in months), "Wrong annual month count")
                close(row["coverage"], min(p["coverage"] for p in months), "Wrong annual min coverage")
                if complete:
                    close(row["categories"], np.mean([p["categories"] for p in months], axis=0), "Wrong annual area-month classes")
                    for key in ["dry", "severe", "extreme"]:
                        close(row[key], sum(p[key] for p in months) / 12, "Wrong annual area-month share")
                    require(row["reason"] is None, "False incomplete annual")
                else:
                    require(row["categories"] is None and row["dry"] is None and row["severe"] is None
                            and row["extreme"] is None and row["reason"] == "incomplete-year", "Incomplete annual filled")
                annual_count += 1
    report = {"status": "PASS-independent-raw-spei-histograms-and-geodesic-samples",
              "monthly_records": checked, "valid_monthly_records": valid_count, "annual_records": annual_count,
              "geometry_samples": samples, "original_netcdf_files": 2,
              "artifact_sha256": hashlib.sha256(raw).hexdigest(), "validator_sha256": sha(__file__),
              "method": "Independent raw strips (12 latitudes vs builder 10), searchsorted class codes and weighted histograms. All month/annual/category/coverage/area/null records; 42 separate densified WGS84 geodesic intersection samples."}
    (OUT / "validation.json").write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(report))


if __name__ == "__main__":
    validate()
