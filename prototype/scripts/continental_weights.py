"""Reproducible, cached global-grid intersections for the reviewed 7C masks."""
import json
from pathlib import Path

import netCDF4
import numpy as np
from shapely.geometry import shape

import build_continent_masks as base
import build_reviewed_continent_masks as review
from continent_geometry_area import lonlat_area
from fetch_cmip6_europe_pair import OUTPUT as PAIR, sha256
from validate_reviewed_continent_masks import allocate_cell, cell_area, geometry_index, grid_cell

OUTPUT = base.ROOT / "data_samples" / "2026-11-06" / "continents-7c-completion"
NAMES = {
    "europe": {"cs": "Evropa", "en": "Europe"},
    "asia": {"cs": "Asie", "en": "Asia"},
    "africa": {"cs": "Afrika", "en": "Africa"},
    "north-america": {"cs": "Severní Amerika", "en": "North America"},
    "south-america": {"cs": "Jižní Amerika", "en": "South America"},
    "oceania": {"cs": "Oceánie", "en": "Oceania"},
    "antarctica": {"cs": "Antarktida", "en": "Antarctica"},
}


def require(condition, message):
    if not condition:
        raise ValueError(message)


def load_masks():
    manifest = json.loads((review.OUTPUT / "outputs.json").read_text(encoding="utf-8"))
    for row in manifest["files"]:
        path = review.OUTPUT / row["file"]
        require(path.stat().st_size == row["bytes"] and sha256(path) == row["sha256"],
                f"Reviewed geography changed: {path.name}")
    validation = json.loads((review.OUTPUT / "validation.json").read_text(encoding="utf-8"))
    require(validation["geographic_topology"] == "PASS"
            and validation["model_weight_conservation"] == "PASS", "Reviewed mask validation missing")
    features = {key: json.loads((review.OUTPUT / f"{key}.geojson").read_text(encoding="utf-8"))
                for key in base.CONTINENTS}
    return features, validation


def regular_bounds(coordinates, step, low, high):
    values = np.asarray(coordinates, dtype=float)
    require(np.array_equal(values, np.arange(low + step / 2, high, step)),
            "Unexpected regular observational grid")
    return np.column_stack((values - step / 2, values + step / 2))


def prepare_weights(source_id, source_paths, features, validation):
    """Cache only after source, mask, global tiling and audited-total checks."""
    OUTPUT.mkdir(parents=True, exist_ok=True)
    cache = OUTPUT / f"weights-{source_id.lower()}.npz"
    metadata = cache.with_suffix(".json")
    dependencies = [
        Path(__file__), Path(__file__).with_name("continent_geometry_area.py"),
        Path(__file__).with_name("validate_reviewed_continent_masks.py"),
        review.OUTPUT / "validation.json",
        *[review.OUTPUT / f"{key}.geojson" for key in base.CONTINENTS], *source_paths,
    ]
    pins = {str(path.relative_to(base.ROOT)): sha256(path) for path in dependencies}
    if metadata.exists() and cache.exists():
        existing = json.loads(metadata.read_text(encoding="utf-8"))
        if existing["dependencies"] == pins and sha256(cache) == existing["sha256"]:
            with np.load(cache, allow_pickle=False) as stored:
                return {key: stored[key].copy() for key in stored.files}, existing["diagnostics"]
        raise ValueError(f"Stale weight cache: {cache}; keep it for audit and select a new output version")
    with netCDF4.Dataset(source_paths[0]) as dataset:
        lat, lon = (np.asarray(dataset[name][:]) for name in ("lat", "lon"))
        if source_id == "NASA":
            lat_b = regular_bounds(lat, 2, -90, 90)
            lon_b = regular_bounds(lon, 2, -180, 180)
            model_land = None
        else:
            require(dataset["areacella"].units == "m2", "Unexpected model area units")
            lat_b, lon_b = (np.asarray(dataset[dataset[name].bounds][:]) for name in ("lat", "lon"))
            areas = np.ma.asarray(dataset["areacella"][:])
            with netCDF4.Dataset(source_paths[1]) as fractions:
                require(fractions["sftlf"].units == "%", "Unexpected model fraction units")
                for name, coordinates in (("lat", lat), ("lon", lon)):
                    require(np.array_equal(fractions[name][:], coordinates), "Static coordinate mismatch")
                fraction = np.ma.asarray(fractions["sftlf"][:]) / 100
            require(not np.ma.getmaskarray(areas).any() and not np.ma.getmaskarray(fraction).any(),
                    "Missing native static fields")
            areas, fraction = np.asarray(areas), np.asarray(fraction)
            require(np.isfinite(areas).all() and (areas > 0).all()
                    and np.isfinite(fraction).all() and (fraction >= 0).all()
                    and (fraction <= 1).all(), "Invalid native area or land fraction")
            model_land = areas * fraction
    require(abs(lat_b[0, 0] + 90) < 1e-8 and abs(lat_b[-1, 1] - 90) < 1e-8
            and np.allclose(lat_b[:-1, 1], lat_b[1:, 0], rtol=0, atol=1e-8)
            and abs(lon_b[-1, 1] - lon_b[0, 0] - 360) < 1e-8
            and np.allclose(lon_b[:-1, 1], lon_b[1:, 0], rtol=0, atol=1e-8),
            "Grid must tile the complete globe")
    masks = [shape(features[key]["geometry"]) for key in base.CONTINENTS]
    indices = [geometry_index(geometry) for geometry in masks]
    geometry = np.zeros((len(masks), len(lat), len(lon)), dtype=float)
    weights = np.zeros_like(geometry)
    for i, (south, north) in enumerate(lat_b):
        for j, (west, east) in enumerate(lon_b):
            cell = grid_cell(float(south), float(north), float(west), float(east))
            geometric = np.array([cell_area(cell, parts, tree) for parts, tree in indices])
            geometry[:, i, j] = geometric
            weights[:, i, j] = geometric if model_land is None else allocate_cell(
                float(areas[i, j]), float(fraction[i, j]), geometric, float(geometric.sum()))
        if i % 16 == 0:
            print(f"{source_id}: reviewed intersections {i}/{len(lat)}", flush=True)
    expected = np.array([lonlat_area(g) for g in masks])
    totals = geometry.sum(axis=(1, 2))
    require(np.all(np.abs(totals - expected) <= np.maximum(100, expected * 1e-8)),
            f"{source_id}: geographic cell tiling failure")
    diagnostics = {
        "source_id": source_id, "latitude_cells": len(lat), "longitude_cells": len(lon),
        "pole_to_pole": True, "dateline_cells_split": True,
        "geometric_grid_tiling_error_m2": dict(zip(base.CONTINENTS, (totals - expected).tolist())),
        "coastline_policy": "Unmapped model land is not relocated. Mixed cells allocate model land proportionally to reviewed eligible land geometry. No subcell coast or grounding inference.",
        "antarctic_weights": "diagnostic-only; blocked for temperatures until independent grounded-ice geometry",
    }
    if model_land is not None:
        allocated = weights.sum(axis=0)
        orphan = np.where(geometry.sum(axis=0) == 0, model_land, 0)
        require(np.allclose(allocated + orphan, model_land, rtol=1e-10, atol=.01),
                "Per-cell model-land conservation failure")
        previous, = [row for row in validation["native_grid_audit"] if row["source_id"] == source_id]
        for k, key in enumerate(base.CONTINENTS):
            require(abs(float(weights[k].sum()) - previous["continents"][key]["weighted_area_m2"]) < 100,
                    f"{source_id}/{key}: cached weights differ from independent 7C.6d audit")
        diagnostics.update({
            "model_land_area_m2": float(model_land.sum()),
            "allocated_model_land_area_m2": float(allocated.sum()),
            "unallocated_model_land_area_m2": float(orphan.sum()),
            "maximum_cell_conservation_error_m2": float(np.max(np.abs(allocated + orphan - model_land))),
        })
    diagnostics["regions"] = {
        key: {"weighted_area_m2": float(weights[k].sum()), "geometric_area_m2": float(totals[k]),
              "weighted_cells": int(np.count_nonzero(weights[k])),
              "geometry_in_zero_model_land_cells_m2": float(geometry[k][model_land == 0].sum())
              if model_land is not None else 0}
        for k, key in enumerate(base.CONTINENTS)
    }
    data = {"weights": weights, "geometry": geometry, "lat": lat, "lon": lon,
            "lat_bounds": lat_b, "lon_bounds": lon_b}
    temporary = cache.with_suffix(".tmp.npz")
    np.savez_compressed(temporary, **data)
    temporary.replace(cache)
    base.dump(metadata, {"source_id": source_id, "dependencies": pins,
                         "file": cache.name, "sha256": sha256(cache), "diagnostics": diagnostics})
    return data, diagnostics


def main():
    features, validation = load_masks()
    manifest = json.loads((PAIR / "manifest.json").read_text(encoding="utf-8"))
    for model in ("ACCESS-CM2", "CanESM5"):
        entries = [r for r in manifest["files"] if r["source_id"] == model]
        paths = []
        for variable in ("areacella", "sftlf"):
            item, = [r for r in entries if r["variable"] == variable]
            path = base.ROOT / item["local_path"]
            require(sha256(path) == item["sha256"], "Native fx source hash mismatch")
            paths.append(path)
        prepare_weights(model, paths, features, validation)
    prepare_weights("NASA", [base.LEGACY / "gistemp250_GHCNv4.nc"], features, validation)


if __name__ == "__main__":
    main()
