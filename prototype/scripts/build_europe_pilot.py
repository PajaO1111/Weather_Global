"""Offline native-grid Europe technical pilot. Not a multi-model assessment."""
import gzip
import hashlib
import io
import json
from pathlib import Path
import zipfile

import netCDF4
import numpy as np
import pyproj
import shapefile
import shapely
from shapely.geometry import Polygon, box, mapping, shape
from shapely.ops import linemerge, transform, unary_union

ROOT = Path(__file__).resolve().parents[2]
ARCHIVE = ROOT / "data_samples" / "2026-11-04" / "europe-pilot"
OUTPUT = ROOT / "prototype" / "backend" / "private" / "data" / "europe_pilot.json"
SCENARIOS = ("ssp126", "ssp245", "ssp370", "ssp585")
COVERAGE = 0.90
PROJECTOR = pyproj.Transformer.from_crs(4326, 6933, always_xy=True).transform


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def read_shapes(layer):
    with zipfile.ZipFile(ARCHIVE / f"ne_10m_{layer}.zip") as archive:
        reader = shapefile.Reader(
            shp=io.BytesIO(archive.read(f"ne_10m_{layer}.shp")),
            dbf=io.BytesIO(archive.read(f"ne_10m_{layer}.dbf")),
        )
        return [(record.record.as_dict(), shape(record.shape.__geo_interface__))
                for record in reader.iterShapeRecords()]


def projected(geometry):
    return transform(PROJECTOR, shapely.segmentize(geometry, 0.1))


def build_mask():
    # River coordinates are the actual published Natural Earth feature, not a straight meridian.
    rivers = [geometry for record, geometry in read_shapes("rivers_lake_centerlines")
              if record.get("name") == "Ural"]
    parts = [part for geometry in rivers for part in
             (geometry.geoms if geometry.geom_type == "MultiLineString" else [geometry])]
    linework = unary_union(parts)
    fragments = list(linework.geoms) if linework.geom_type == "MultiLineString" else [linework]
    river = linemerge([fragment for fragment in fragments if fragment.length > 0.003])
    if river.geom_type != "LineString":
        raise ValueError("Natural Earth Ural river fragments do not form one main path")
    river = list(river.coords)
    if river[0][1] < river[-1][1]:
        river.reverse()
    ridge = [[70, 90], [70, 72], [68.5, 69], [66.5, 67.5], [65, 67],
             [63, 66.5], [61, 65.5], [59.5, 64.5], [59, 63.5],
             [59.5, 62], [59.5, 61], [59.3, 60], [59, 59],
             [59.5, 58], [59.7, 57], [60, 56], [59.45, 54.71]]
    manych = [[49, 45], [47.3, 44.9], [46.9, 45.3], [45.5, 45.7],
              [44.5, 45.9], [43, 46.1], [42, 46.2], [41, 46.5],
              [40.6, 46.9], [40, 47.1], [39.3, 47.2]]
    straits = [[38, 46], [37, 45.3], [37, 44.6], [30, 42],
               [29.16, 41.23], [29.08, 41.12], [29.04, 41.03],
               [29, 40.98], [28, 40.7], [27, 40.5], [26.75, 40.4],
               [26.5, 40.2], [26.4, 40.05], [26.2, 39.9],
               [25.5, 39], [27.5, 36], [28.8, 35.5], [28.8, 34],
               [-10, 34], [-10, 35.8], [-32, 35.8], [-32, 90]]
    boundary = ridge + [list(point) for point in river] + manych + straits
    domain = Polygon(boundary)
    if not domain.is_valid:
        raise ValueError(f"Invalid geographic partition line: {shapely.is_valid_reason(domain)}")
    land = unary_union([geometry for _, geometry in read_shapes("land")])
    mask = land.intersection(domain).union(land.intersection(box(32, 34, 35, 36)))
    if not mask.is_valid:
        raise ValueError("Invalid continental land mask")
    version = {
        "version": "europe-kuma-manych-cyprus-v1",
        "source": "Natural Earth 1:10m physical land and river vectors",
        "land_zip_sha256": digest(ARCHIVE / "ne_10m_land.zip"),
        "rivers_zip_sha256": digest(ARCHIVE / "ne_10m_rivers_lake_centerlines.zip"),
        "coordinate_reference": "EPSG:4326; area integrations EPSG:6933",
        "boundary_lon_lat": boundary,
        "decisions": [
            "Kuma–Manych Depression, NOT main Caucasus crest",
            "Cyprus whole island INCLUDED as explicit project exception",
            "Iceland and Svalbard included; Greenland excluded",
            "Russia split along Ural Mountains and actual Ural river vector",
            "Kazakhstan only west of Ural river; Turkey Eastern Thrace only",
        ],
        "accuracy": (
            "Versioned scientific pilot convention, NOT an authoritative geological boundary. "
            "Ural ridge and Kuma–Manych are hand-curated schematic polylines, approximately "
            "25 km positional uncertainty (not a certified bound); straits schematic ~5 km. "
            "Ural river uses Natural Earth 1:10m vertices, not survey accuracy; disconnected "
            "source fragments are noded and merged, excluding only microfragments <=0.003 degrees. "
            "Ridge-to-river and Caspian-to-Manych joins are schematic. "
            "Coastlines 1:10m; islands below source resolution absent. Cyprus selection "
            "window contains only Cyprus land. Atlantic western limit 32W: Azores included; "
            "Madeira/Canaries excluded. Novaya Zemlya west of eastern Arctic line included; "
            "Franz Josef Land may be partitioned by the explicitly archived Arctic line."
        ),
        "convention_reference": "https://en.wikipedia.org/wiki/Boundaries_between_the_continents",
        "source_url": "https://www.naturalearthdata.com/downloads/10m-physical-vectors/",
        "license": "Natural Earth public domain; project boundary coordinates CC0",
    }
    mask_path = ARCHIVE / "europe-mask-v1.geojson"
    mask_path.write_text(json.dumps({"type": "Feature", "properties": version,
                                    "geometry": mapping(mask)}, separators=(",", ":")) + "\n",
                         encoding="utf-8")
    return land, mask, version, digest(mask_path)


def bounds(centers):
    centers = np.asarray(centers, dtype=float)
    if len(centers) < 2 or not np.all(np.diff(centers) > 0):
        raise ValueError("Expected increasing regular coordinate")
    edges = np.r_[centers[0] - (centers[1] - centers[0]) / 2,
                  (centers[:-1] + centers[1:]) / 2,
                  centers[-1] + (centers[-1] - centers[-2]) / 2]
    return np.c_[edges[:-1], edges[1:]]


def grid_weights(lat, lon, land, mask, area=None, fraction=None,
                 lat_bounds=None, lon_bounds=None):
    lat_bounds = bounds(lat) if lat_bounds is None else lat_bounds
    lon_bounds = bounds(lon) if lon_bounds is None else lon_bounds
    weights = np.zeros((len(lat), len(lon)), dtype=float)
    geometry_weights = np.zeros_like(weights)
    comparison = []
    for i, (south, north) in enumerate(lat_bounds):
        if north < 34 or south > 85:
            continue
        for j, (west, east) in enumerate(lon_bounds):
            west = (float(west) + 180) % 360 - 180
            width = float(east - lon_bounds[j][0])
            if west > 75 or west + width < -32:
                continue
            cell = box(west, max(-90, south), west + width, min(90, north))
            intersection = mask.intersection(cell)
            if intersection.is_empty:
                continue
            continent_area = projected(intersection).area
            geometry_weights[i, j] = continent_area
            if area is None:
                weights[i, j] = continent_area
            else:
                all_land_area = projected(land.intersection(cell)).area
                conditional_fraction = continent_area / all_land_area if all_land_area else 0
                if not 0 <= conditional_fraction <= 1 + 1e-10:
                    raise ValueError("Invalid conditional continental fraction")
                weights[i, j] = area[i, j] * fraction[i, j] * min(1, conditional_fraction)
                comparison.append(abs(weights[i, j] - continent_area))
    if weights.sum() <= 0:
        raise ValueError("Empty geographic mask")
    return weights, {
        "weighted_area_m2": float(weights.sum()),
        "geometric_area_m2": float(geometry_weights.sum()),
        "relative_signed_coast_area_difference": float(weights.sum() / geometry_weights.sum() - 1),
        "absolute_cell_area_difference_m2": float(sum(comparison)),
        "cells": int(np.count_nonzero(weights)),
        "geometry_with_zero_model_land_m2": float(geometry_weights[weights == 0].sum()),
    }


def spatial_mean(values, weights, threshold=COVERAGE):
    values = np.ma.asarray(values)
    valid = ~np.ma.getmaskarray(values) & np.isfinite(np.ma.getdata(values))
    covered = float(weights[valid].sum() / weights.sum())
    if covered + 1e-12 < threshold:
        return None, covered
    return float(np.sum(np.ma.getdata(values)[valid] * weights[valid]) / weights[valid].sum()), covered


def annualize(months):
    """All twelve distinct months and valid coverage are mandatory, never interpolate."""
    groups = {}
    for item in months:
        groups.setdefault(item["year"], []).append(item)
    output = []
    for year, rows in sorted(groups.items()):
        if len(rows) != 12 or sorted(row["month"] for row in rows) != list(range(1, 13)):
            output.append({"date": str(year), "value": None, "coverage": min(r["coverage"] for r in rows)})
            continue
        valid = all(row["value"] is not None for row in rows)
        total_days = sum(row["days"] for row in rows)
        output.append({
            "date": str(year),
            "value": sum(row["value"] * row["days"] for row in rows) / total_days if valid else None,
            "coverage": min(row["coverage"] for row in rows),
        })
    return output


def monthly_values(dataset, variable, weights):
    time = dataset.variables["time"]
    calendar = getattr(time, "calendar", "standard")
    dates = netCDF4.num2date(time[:], time.units, calendar=calendar)
    rows = []
    for index, date in enumerate(dates):
        mean, coverage = spatial_mean(variable[index], weights)
        rows.append({"year": date.year, "month": date.month, "days": date.daysinmonth,
                     "value": mean, "coverage": coverage})
    keys = [(row["year"], row["month"]) for row in rows]
    if keys != sorted(set(keys)):
        raise ValueError("Duplicate or unordered months")
    for left, right in zip(keys, keys[1:]):
        if right[0] * 12 + right[1] != left[0] * 12 + left[1] + 1:
            raise ValueError("Non-contiguous monthly time axis")
    return rows, calendar


def rebase(months):
    baseline = [row for row in months if 1981 <= row["year"] <= 2010]
    if len(baseline) != 360 or any(row["value"] is None for row in baseline):
        raise ValueError("1981–2010 baseline incomplete or below land coverage threshold")
    days = sum(row["days"] for row in baseline)
    mean = sum(row["value"] * row["days"] for row in baseline) / days
    rebased = [{**row, "value": None if row["value"] is None else row["value"] - mean}
               for row in months]
    return annualize(rebased), mean, days


def write_json(path, value):
    path.write_text(json.dumps(value, ensure_ascii=False, separators=(",", ":"),
                               allow_nan=False) + "\n", encoding="utf-8")


def main():
    import sys
    land, mask, definition, mask_hash = build_mask()
    history_path = ARCHIVE / "gistemp250_GHCNv4.nc"
    if not history_path.exists():
        history_path.write_bytes(gzip.decompress((ARCHIVE / "gistemp250_GHCNv4.nc.gz").read_bytes()))
    with netCDF4.Dataset(history_path) as dataset:
        weights, history_grid = grid_weights(dataset["lat"][:], dataset["lon"][:], land, mask)
        months, calendar = monthly_values(dataset, dataset["tempanomaly"], weights)
        print("NASA baseline coverage min", min(row["coverage"] for row in months if 1981 <= row["year"] <= 2010), flush=True)
        write_json(ARCHIVE / "history-coverage.json", {
            "grid": history_grid, "calendar": calendar, "threshold": COVERAGE,
            "annual": annualize(months),
        })
        if "--mask-only" in sys.argv:
            return
        history, history_baseline, history_days = rebase(months)
        history_metadata = {
            "provider": "NASA GISS", "product": "GISTEMP v4 GHCNv4 surface AIR temperature, 250 km smoothing, IOCEAN=none",
            "data_url": "https://data.giss.nasa.gov/pub/gistemp/gistemp250_GHCNv4.nc.gz",
            "documentation_url": "https://data.giss.nasa.gov/gistemp/data_v4.html",
            "license": "US government scientific data; acknowledge NASA GISS (not NASA endorsement)",
            "citation": "GISTEMP Team (2026); Lenssen et al. (2024), doi:10.1029/2023JD040179",
            "source_history": dataset.history, "calendar": calendar,
            "calendar_note": "No calendar attribute: CF default standard (Gregorian after 1582)",
            "source_unit": dataset["tempanomaly"].units, "source_baseline": "1951–1980",
            "baseline_offset_K": history_baseline, "baseline_days": history_days,
            "grid": history_grid, "source_sha256": digest(ARCHIVE / "gistemp250_GHCNv4.nc.gz"),
        }
    with netCDF4.Dataset(ARCHIVE / "areacella_fx_ACCESS-CM2_historical_r1i1p1f1_gn.nc") as a, \
            netCDF4.Dataset(ARCHIVE / "sftlf_fx_ACCESS-CM2_historical_r1i1p1f1_gn.nc") as f:
        lat, lon = a["lat"][:], a["lon"][:]
        if not np.array_equal(lat, f["lat"][:]) or not np.array_equal(lon, f["lon"][:]):
            raise ValueError("Static grids differ")
        area, fraction = a["areacella"][:], f["sftlf"][:] / 100
        if a["areacella"].units != "m2" or f["sftlf"].units != "%":
            raise ValueError("Unexpected static units")
        if np.ma.getmaskarray(area).any() or np.ma.getmaskarray(fraction).any():
            raise ValueError("Missing static cells")
        if np.any(area <= 0) or np.any(fraction < 0) or np.any(fraction > 1):
            raise ValueError("Invalid area or land fraction")
        lat_b, lon_b = a[a["lat"].bounds][:], a[a["lon"].bounds][:]
        weights, model_grid = grid_weights(lat, lon, land, mask, area, fraction, lat_b, lon_b)
        np.savez_compressed(ARCHIVE / "native-grid-weights.npz", lat=lat, lon=lon, weights=weights)
    models, model_metadata = {}, {}
    for experiment in ("historical", *SCENARIOS):
        path, = list(ARCHIVE.glob(f"tas_Amon_ACCESS-CM2_{experiment}_r1i1p1f1_gn_*.nc"))
        with netCDF4.Dataset(path) as dataset:
            for name, value in [("source_id", "ACCESS-CM2"), ("variant_label", "r1i1p1f1"),
                                ("experiment_id", experiment), ("grid_label", "gn")]:
                if getattr(dataset, name) != value:
                    raise ValueError(f"{name} identity mismatch")
            if dataset["tas"].units != "K":
                raise ValueError("Expected native tas Kelvin")
            if not np.array_equal(lat, dataset["lat"][:]) or not np.array_equal(lon, dataset["lon"][:]):
                raise ValueError("tas/static native coordinates differ")
            if not np.array_equal(lat_b, dataset[dataset["lat"].bounds][:]) or not np.array_equal(lon_b, dataset[dataset["lon"].bounds][:]):
                raise ValueError("tas/static cell bounds differ")
            rows, cal = monthly_values(dataset, dataset["tas"], weights)
            expected = (1850, 2014) if experiment == "historical" else (2015, 2100)
            if (rows[0]["year"], rows[-1]["year"]) != expected or len(rows) != (expected[1] - expected[0] + 1) * 12:
                raise ValueError("Model time coverage mismatch")
            models[experiment] = rows
            model_metadata[experiment] = {"calendar": cal, "months": len(rows),
                "source_file": path.name, "source_sha256": digest(path),
                "tracking_id": getattr(dataset, "tracking_id", ""),
                "license": getattr(dataset, "license", ""), "units": "K"}
    model_history, model_baseline, model_days = rebase(models["historical"])
    scenarios = {}
    for experiment in SCENARIOS:
        if model_metadata[experiment]["calendar"] != model_metadata["historical"]["calendar"]:
            raise ValueError("Historical/scenario calendar mismatch")
        rows = [{**row, "value": None if row["value"] is None else row["value"] - model_baseline}
                for row in models[experiment]]
        annual = annualize(rows)
        if any(row["value"] is None for row in annual):
            raise ValueError("Scenario has invalid annual coverage")
        periods = {}
        for first, last in [(2031, 2050), (2041, 2060), (2081, 2100)]:
            selected = [row for row in rows if first <= row["year"] <= last]
            periods[f"{first}–{last}"] = sum(row["value"] * row["days"] for row in selected) / sum(row["days"] for row in selected)
        scenarios[experiment] = {"annual": annual, "periods": periods}
    if any(row["value"] is None for row in model_history):
        raise ValueError("Model historical coverage invalid")
    manifest = {
        "schema_version": 1, "phase": "7C.2 local Europe technical pilot",
        "mask_sha256": mask_hash,
        "files": [{"file": p.name, "bytes": p.stat().st_size, "sha256": digest(p)}
                  for p in sorted(ARCHIVE.iterdir()) if p.is_file()
                  and (p.suffix in (".nc", ".gz", ".zip", ".geojson", ".npz", ".html"))],
        "approved_tas_catalog_bytes": 456740066, "approved_static_bytes": 109760,
        "network_access_log": "access.json; includes failed URLs and estimates before transfers",
    }
    write_json(ARCHIVE / "manifest.json", manifest)
    artifact = {
        "schema_version": 1, "status": "technical-pilot-one-model", "continent": "Europe",
        "model_count": 1, "model": "ACCESS-CM2", "member": "r1i1p1f1", "baseline": [1981, 2010],
        "unit": "°C anomaly", "coverage_threshold": COVERAGE,
        "mask": {**definition, "sha256": mask_hash, "area_m2": projected(mask).area},
        "method": "CMIP6: areacella * (sftlf/100) * area(cell∩European land)/area(cell∩all land); no double land fraction. NASA: geometric area(cell∩same European land). Each monthly mean requires >=90% of fixed target weights; no gap filling. All 12 months required per year. Calendar day weighting for annual, baseline and periods. Own 1981–2010 baseline for each product, not joined.",
        "limitations": [
            "ONE MODEL / ONE MEMBER technical pilot, no ensemble, min–max, uncertainty band or robust prediction",
            "GISTEMP250 is station-based land-air reconstruction, sparse early coverage; invalid years null, not zero",
            "Land geography identical; model land fractions differ from coastline. Area differences quantified, not hidden",
            definition["accuracy"],
        ],
        "observations": {"metadata": history_metadata, "annual": history},
        "model_historical": model_history, "scenarios": scenarios,
        "model_metadata": {"grid": model_grid, "experiments": model_metadata,
                           "baseline_K": model_baseline, "baseline_days": model_days},
        "source_manifest_sha256": digest(ARCHIVE / "manifest.json"),
    }
    write_json(OUTPUT, artifact)
    print("ARTIFACT", OUTPUT.stat().st_size, digest(OUTPUT))
    print("BASELINES", history_baseline, model_baseline, "days", history_days, model_days)
    print("MODEL GRID", json.dumps(model_grid))
    print("PERIODS", json.dumps({key: value["periods"] for key, value in scenarios.items()}))


if __name__ == "__main__":
    main()
