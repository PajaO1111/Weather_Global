"""New 7C continental anomalies; never overwrite or relabel legacy Europe."""
import gzip
import hashlib
import json
import math
from pathlib import Path

import netCDF4
import numpy as np

import build_continent_masks as base
import build_reviewed_continent_masks as review
from audit_europe_history import verify_months, year_diagnostics
from build_cmip6_europe_pair import minmax, require_annual
from build_europe_history import annual_record
from build_europe_pilot import COVERAGE, SCENARIOS, annualize, rebase
from continental_weights import NAMES, OUTPUT, load_masks, prepare_weights, require
from fetch_cmip6_europe_pair import APPROVED, OUTPUT as PAIR, plan, sha256, verify
from validate_cmip6_europe_pair import time_axis

VERSION = "7c7-continental-temperatures-v1"
ARTIFACT = OUTPUT / "continental_temperatures_v1.json"
ACTIVE = base.CONTINENTS[:-1]


def monthly_reduce(values, weights):
    """Reduce several regions together without giving missing cells any weight."""
    data = np.ma.asarray(values)
    weights = np.asarray(weights, dtype=float)
    require(data.ndim == 3 and weights.ndim == 3 and data.shape[1:] == weights.shape[1:],
            "Monthly data/weights grid mismatch")
    require(np.isfinite(weights).all() and (weights >= 0).all()
            and (weights.sum(axis=(1, 2)) > 0).all(), "Invalid regional weights")
    raw = np.asarray(np.ma.getdata(data), dtype=float).reshape(len(data), -1)
    valid = ~np.ma.getmaskarray(data).reshape(len(data), -1) & np.isfinite(raw)
    matrix = weights.reshape(len(weights), -1).T
    available = valid.astype(float) @ matrix
    coverage = np.clip(available / matrix.sum(axis=0), 0, 1)
    numerator = np.where(valid, raw, 0) @ matrix
    means = np.full_like(numerator, np.nan)
    np.divide(numerator, available, out=means,
              where=(available > 0) & (coverage + 1e-12 >= COVERAGE))
    return means, coverage


def monthly_regions(dataset, variable, weights, dates):
    field = dataset[variable]
    require(field.dimensions == ("time", "lat", "lon"), "Unsupported temperature dimensions")
    result = [[] for _ in range(len(weights))]
    for start in range(0, len(dates), 24):
        subset = dates[start:start + 24]
        means, coverage = monthly_reduce(field[start:start + len(subset)], weights)
        for i, date in enumerate(subset):
            for k, rows in enumerate(result):
                rows.append({"year": int(date.year), "month": int(date.month),
                             "days": int(date.daysinmonth), "coverage": float(coverage[i, k]),
                             "value": float(means[i, k]) if math.isfinite(means[i, k]) else None})
    return result


def baseline_residual(annual, months):
    reference = [p for p in annual if 1981 <= int(p["date"]) <= 2010]
    days = [sum(r["days"] for r in months if r["year"] == int(p["date"])) for p in reference]
    require(len(reference) == 30 and all(p["value"] is not None for p in reference),
            "Incomplete annual reference")
    residual = float(np.average([p["value"] for p in reference], weights=days))
    require(abs(residual) < 1e-10, "Regional reference does not average to zero")
    return residual


def regional_model(source_id, calendar, experiments, diagnostics):
    historical, baseline, days = rebase(experiments["historical"])
    require_annual(historical, 1850, 2014)
    scenarios = {}
    for scenario in SCENARIOS:
        rows = [{**r, "value": None if r["value"] is None else r["value"] - baseline}
                for r in experiments[scenario]]
        scenarios[scenario] = annualize(rows)
        require_annual(scenarios[scenario], 2015, 2100)
    return {
        "source_id": source_id, "member": "r1i1p1f1", "grid_label": "gn", "calendar": calendar,
        "baseline_temperature_K": baseline, "baseline_days": days,
        "baseline_residual_degC": baseline_residual(historical, experiments["historical"]),
        "grid": diagnostics, "historical": historical, "scenarios": scenarios,
    }


def regional_history(months, calendar, source):
    reference = [r for r in months if 1981 <= r["year"] <= 2010]
    ready = len(reference) == 360 and all(r["value"] is not None for r in reference)
    if ready:
        annual, offset, days = rebase(months)
        diagnostics = year_diagnostics(months, annual)
        points = [annual_record(point, row) for point, row in zip(annual, diagnostics)]
        residual = baseline_residual(annual, months)
    else:
        offset, days, residual = None, None, None
        annual = annualize(months)
        points = []
        for point, row in zip(annual, year_diagnostics(months, annual)):
            reasons = ["incomplete-reference"]
            if row["absent_source_months"]:
                reasons.append("incomplete-source-year")
            if row["below_coverage_months"]:
                reasons.append("insufficient-spatial-coverage")
            points.append({
                "date": point["date"], "value": None, "status": "missing", "missing_reasons": reasons,
                "minimum_monthly_coverage": point["coverage"], "source_months": row["source_months"],
                "absent_source_months": row["absent_source_months"],
                "below_coverage_months": row["below_coverage_months"],
            })
    return {
        "status": "available" if ready else "blocked-incomplete-baseline",
        "series_type": "observation-derived-gridded-analysis",
        "unit": "degC anomaly", "source_unit": "K anomaly", "baseline": [1981, 2010],
        "baseline_offset_K": offset, "baseline_days": days, "baseline_residual_degC": residual,
        "calendar": calendar, "coverage_threshold": COVERAGE,
        "annual": points,
        "monthly_coverage": [{"date": f'{r["year"]:04d}-{r["month"]:02d}', "coverage": r["coverage"]}
                             for r in months],
        "summary": {"annual_count": len(points), "valid_count": sum(p["value"] is not None for p in points),
                    "missing_count": sum(p["value"] is None for p in points)},
        "source": source,
        "usage_review": {"status": "local-analysis-only-see-source-review",
                         "documentation_url": "https://data.giss.nasa.gov/gistemp/",
                         "citation": "GISTEMP Team (2026); Lenssen et al. (2024), doi:10.1029/2023JD040179"},
    }


def compare_points(new, old):
    old_values = {p["date"]: p["value"] for p in old if p["value"] is not None}
    pairs = [(p["date"], p["value"] - old_values[p["date"]]) for p in new
             if p["value"] is not None and p["date"] in old_values]
    require(bool(pairs), "Legacy comparison has no valid common years")
    return {"common_years": len(pairs), "first_year": pairs[0][0], "last_year": pairs[-1][0],
            "mean_new_minus_old_degC": float(np.mean([v for _, v in pairs])),
            "maximum_absolute_change_degC": max(abs(v) for _, v in pairs)}


def legacy_comparison(europe):
    old_models = json.loads((PAIR / "europe_pair_anomalies_v1.json").read_text(encoding="utf-8"))
    old_history = json.loads((PAIR.parent / "europe-history" / "europe_history_v1.json").read_text(encoding="utf-8"))
    result = {"legacy_mask_valid": False, "old_files_preserved": True,
              "new_mask_version": europe["mask"]["version"], "models": []}
    for model in europe["models"]:
        old, = [r for r in old_models["models"] if r["source_id"] == model["source_id"]]
        result["models"].append({
            "source_id": model["source_id"],
            "baseline_temperature_change_K": model["baseline_temperature_K"] - old["baseline_temperature_K"],
            "historical": compare_points(model["historical"], old["historical"]),
            "scenarios": {s: compare_points(model["scenarios"][s], old["scenarios"][s]) for s in SCENARIOS},
        })
    result["history"] = compare_points(europe["history"]["annual"], old_history["annual"])
    return {"europe": result}


def checked_sources():
    manifest_path = PAIR / "manifest.json"
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    expected = {r["file"]: r for r in plan()}
    require(len(manifest["files"]) == len(expected), "Incomplete CMIP6 source manifest")
    require({r["file"] for r in manifest["files"]} == set(expected), "CMIP6 source identities changed")
    for row in manifest["files"]:
        path = (base.ROOT / row["local_path"]).resolve()
        require(base.ROOT in path.parents, "Climate source outside repository")
        verify(path, expected[row["file"]])
    compressed = base.LEGACY / "gistemp250_GHCNv4.nc.gz"
    expanded = base.LEGACY / "gistemp250_GHCNv4.nc"
    retrieval, = [r for r in json.loads((base.LEGACY / "access.json").read_text(encoding="utf-8"))
                  if r.get("file") == compressed.name and r.get("status") == "ok"]
    require(sha256(compressed) == retrieval["sha256"] and compressed.stat().st_size == retrieval["bytes"],
            "NASA retrieval hash mismatch")
    require(hashlib.sha256(gzip.decompress(compressed.read_bytes())).hexdigest() == sha256(expanded),
            "NASA expanded source differs from retrieved archive")
    return manifest


def model_results(source_id, manifest, features, validation):
    entries = [r for r in manifest["files"] if r["source_id"] == source_id]
    static = [next(base.ROOT / r["local_path"] for r in entries if r["variable"] == variable)
              for variable in ("areacella", "sftlf")]
    grid, diagnostics = prepare_weights(source_id, static, features, validation)
    months = {key: {} for key in ACTIVE}
    calendar, historical_end, historical_units = None, None, None
    for experiment in ("historical", *SCENARIOS):
        item, = [r for r in entries if r["variable"] == "tas" and r["experiment"] == experiment]
        print(f"Reducing {source_id}/{experiment} for six reviewed continents", flush=True)
        with netCDF4.Dataset(base.ROOT / item["local_path"]) as dataset:
            for key, value in (("source_id", source_id), ("variant_label", "r1i1p1f1"),
                               ("grid_label", "gn"), ("experiment_id", experiment)):
                require(getattr(dataset, key) == value, f"Native temperature identity mismatch: {key}")
            require(dataset["tas"].units == "K" and "time: mean" in dataset["tas"].cell_methods,
                    "Expected monthly near-surface air temperature in Kelvin")
            for axis in ("lat", "lon"):
                require(np.array_equal(dataset[axis][:], grid[axis])
                        and np.array_equal(dataset[dataset[axis].bounds][:], grid[f"{axis}_bounds"]),
                        "Temperature/static grid mismatch")
            dates, start, end = time_axis(dataset, experiment)
            actual_calendar = dataset["time"].calendar
            if experiment == "historical":
                calendar, historical_end, historical_units = actual_calendar, end, dataset["time"].units
            else:
                require(actual_calendar == calendar and dataset["time"].units == historical_units
                        and start == historical_end and dataset.parent_source_id == source_id
                        and dataset.parent_experiment_id == "historical"
                        and dataset.parent_variant_label == "r1i1p1f1"
                        and dataset.parent_time_units == historical_units
                        and float(dataset.branch_time_in_parent) == historical_end
                        and float(dataset.branch_time_in_child) == start,
                        "Historical/scenario source branch mismatch")
            rows = monthly_regions(dataset, "tas", grid["weights"][:len(ACTIVE)], dates)
            for k, key in enumerate(ACTIVE):
                months[key][experiment] = rows[k]
    results = {}
    for key in ACTIVE:
        result = regional_model(source_id, calendar, months[key], diagnostics["regions"][key])
        result["sources"] = [{name: row[name] for name in
                              ("file", "variable", "experiment", "version", "bytes", "sha256", "local_path")}
                             for row in entries]
        results[key] = result
    return results


def history_results(features, validation):
    path = base.LEGACY / "gistemp250_GHCNv4.nc"
    grid, diagnostics = prepare_weights("NASA", [path], features, validation)
    with netCDF4.Dataset(path) as dataset:
        require("ILAND=250" in dataset.history and "IOCEAN=none" in dataset.history
                and "1951-1980" in dataset.history, "Unexpected NASA GISTEMP product")
        field = dataset["tempanomaly"]
        require(field.units == "K" and field.cell_methods == "time: mean", "NASA anomaly semantics changed")
        dates, calendar = verify_months(dataset)
        require((dates[0].year, dates[0].month) == (1880, 1), "NASA source does not begin in 1880")
        for axis in ("lat", "lon"):
            require(np.array_equal(dataset[axis][:], grid[axis]), "NASA coordinate mismatch")
        print("Reducing NASA land-air analysis for six reviewed continents", flush=True)
        rows = monthly_regions(dataset, "tempanomaly", grid["weights"][:len(ACTIVE)], dates)
    source = {
        "provider": "NASA GISS", "product": "GISTEMP v4 GHCNv4 land-air 250km, IOCEAN=none",
        "data_url": "https://data.giss.nasa.gov/pub/gistemp/gistemp250_GHCNv4.nc.gz",
        "documentation_url": "https://data.giss.nasa.gov/gistemp/data_v4.html",
        "file": str(path.relative_to(base.ROOT)), "sha256": sha256(path),
        "compressed_sha256": sha256(path.with_suffix(".nc.gz")),
        "source_baseline": [1951, 1980],
    }
    return {key: {**regional_history(rows[k], calendar, source),
                  "grid": diagnostics["regions"][key]} for k, key in enumerate(ACTIVE)}


def write_atomic(path, value):
    temporary = path.with_suffix(path.suffix + ".tmp")
    base.dump(temporary, value)
    temporary.replace(path)


def main():
    OUTPUT.mkdir(parents=True, exist_ok=True)
    implementation = {name: sha256(Path(__file__).with_name(name)) for name in
                      ("build_continental_temperatures.py", "continental_weights.py",
                       "continent_geometry_area.py", "build_europe_pilot.py",
                       "build_europe_history.py", "validate_cmip6_europe_pair.py")}
    features, validation = load_masks()
    legacy_pins = validation["climate_artifacts_unchanged"]
    for row in legacy_pins:
        require(sha256(PAIR.parent / row["file"]) == row["sha256"], "Legacy climate bytes changed")
    manifest = checked_sources()
    model_data = [model_results(model, manifest, features, validation) for model in APPROVED]
    histories = history_results(features, validation)
    review_path = OUTPUT / "source-review" / "source-review.json"
    source_review = ({"file": str(review_path.relative_to(base.ROOT)), "sha256": sha256(review_path)}
                     if review_path.exists() else {"status": "pending-official-source-verification"})
    regions = []
    for key in base.CONTINENTS:
        blocked = key == "antarctica"
        models = [row[key] for row in model_data] if not blocked else []
        feature = features[key]
        regions.append({
            "id": key, "name": NAMES[key], "publication_allowed": False,
            "status": "blocked-grounding" if blocked else "validated-local",
            "mask": {"file": str((review.OUTPUT / f"{key}.geojson").relative_to(base.ROOT)),
                     "sha256": sha256(review.OUTPUT / f"{key}.geojson"),
                     "version": feature["properties"].get("mask_version",
                                                          feature["properties"].get("version", review.VERSION)),
                     "area_m2": validation["area_crosscheck"]["lonlat_linear_surface_areas_m2"][key],
                     "grounding_line_verified": False},
            "models": models,
            "range": None if blocked else {
                "historical": minmax([m["historical"] for m in models]),
                "scenarios": {s: minmax([m["scenarios"][s] for m in models]) for s in SCENARIOS}},
            "history": None if blocked else histories[key],
            "limitations": {
                "cs": (["Antarktická teplotní agregace je blokována: dosud není ověřena hranice uzemněného ledu."] if blocked else [
                    "Dva modely a jedna realizace každého nejsou reprezentativní ensemble. Min–max není pravděpodobnost.",
                    "Pobřeží modelu a mapy se liší; nepřiřaditelná modelová pevnina se nepřevádí jinam.",
                    "NASA je prostorově vyhlazená analýza odvozená z pozorování; mezery se neinterpolují a pokrytí není nejistota."]),
                "en": (["Antarctic temperature aggregation is blocked pending independently verified grounded-ice geometry."] if blocked else [
                    "Two models and one realization each are not a representative ensemble. Min–max is not probability.",
                    "Model and mapped coastlines differ; unallocated model land is not relocated.",
                    "NASA is a spatially smoothed observation-derived analysis; gaps are not interpolated and coverage is not uncertainty."]),
            },
        })
    result = {
        "schema_version": 1, "version": VERSION, "status": "local-six-continent-analysis-antarctica-blocked",
        "publication_allowed": False, "baseline": [1981, 2010], "unit": "degC anomaly",
        "regions": regions, "source_review": source_review,
        "legacy_comparison": legacy_comparison(regions[0]),
        "method": {
            "spatial_model": "Native areacella * (sftlf/100) * continental eligible land / all eligible land in cell. Land fraction exactly once. No regridding; orphan model land excluded and reported.",
            "spatial_nasa": "WGS84 surface integral of reviewed land within regular 2-degree source cells; normalize over finite, unmasked available land. No model land fraction.",
            "temporal": "Each model/region or NASA region has its own complete 1981-2010 reference weighted by source-calendar month days. Annual mean requires all twelve months and >=90% regional spatial coverage each month; incomplete reference blocks NASA anomalies.",
            "coverage_threshold": COVERAGE, "missing": "No interpolation, no partial-year annual estimate, no model/reanalysis gap filling.",
            "coastline_policy": "Explicit project conditional subcell allocation; not subcell coastline certification. Aggregate uncertainty from this convention is not quantified.",
            "scope_approval": "User approved remaining phase 7C on 2026-11-06. Six non-Antarctic regions are locally recalculated; 7C.6d Antarctic prohibition remains, no Antarctic temperature weights released.",
            "spread": "Pointwise minimum and maximum of exactly ACCESS-CM2 and CanESM5 after separate rebasing. Not a confidence interval.",
        },
        "sources": [
            {"provider": "WCRP / ESGF / CSIRO / CCCma", "product": "CMIP6 native monthly tas",
             "manifest": str((PAIR / "manifest.json").relative_to(base.ROOT)),
             "sha256": sha256(PAIR / "manifest.json"), "license": "CC-BY-SA-4.0",
             "license_url": "https://creativecommons.org/licenses/by-sa/4.0/",
             "attribution": "ACCESS-CM2: CSIRO/CSIRO-ARCCSS. CanESM5: CCCma, Environment and Climate Change Canada. Acknowledge WCRP/CMIP and ESGF. Continental aggregation, rebasing and spread are project adaptations; no provider endorsement."},
            histories["europe"]["source"],
            {"provider": "Natural Earth", "license": "public domain",
             "geometry_validation": str((review.OUTPUT / "validation.json").relative_to(base.ROOT)),
             "sha256": sha256(review.OUTPUT / "validation.json")},
        ],
        "provenance": {"implementation_sha256": implementation, "legacy_climate_unchanged": legacy_pins,
                       "reviewed_mask_validation_sha256": sha256(review.OUTPUT / "validation.json")},
    }
    for name, pin in implementation.items():
        require(sha256(Path(__file__).with_name(name)) == pin, "Implementation changed during computation")
    for row in legacy_pins:
        require(sha256(PAIR.parent / row["file"]) == row["sha256"], "Legacy climate bytes changed during computation")
    write_atomic(ARTIFACT, result)
    catalog = {
        "schema_version": 1, "version": "7c7-continental-catalog-v1", "publication_allowed": False,
        "product": {"endpoint": "continents-api/v1/bundle.json", "version": VERSION,
                    "sha256": sha256(ARTIFACT), "bytes": ARTIFACT.stat().st_size},
        "regions": [{name: region[name] for name in ("id", "name", "status")} for region in regions],
        "gates": [
            {"code": "antarctic-grounding", "cs": "Antarktida: chybí nezávislé ověření uzemněného ledu.",
             "en": "Antarctica: independent grounded-ice verification is missing."},
            {"code": "public-release-review", "cs": "Pouze lokální analýza; veřejné nasazení není schváleno.",
             "en": "Local analysis only; public deployment is not approved."},
            {"code": "cds-separate-unresolved", "cs": "CDS EU27 zůstává samostatný technický pilot s nevyřešenou metodikou.",
             "en": "CDS EU27 remains a separate technical preview with unresolved methodology."},
            {"code": "nasa-regional-reference", "cs": "NASA 250 km: Afrika, Jižní Amerika a Oceánie nemají úplnou referenci; historie zůstávají nedostupné.",
             "en": "NASA 250km: Africa, South America and Oceania lack a complete reference; their histories remain unavailable."},
            {"code": "nasa-redistribution-review", "cs": "Citace NASA ověřena; produktové podmínky redistribuce zůstávají k ověření.",
             "en": "NASA citation verified; product-specific redistribution terms remain under review."},
        ],
    }
    write_atomic(OUTPUT / "catalog.json", catalog)
    files = [ARTIFACT, OUTPUT / "catalog.json",
             *sorted(OUTPUT.glob("weights-*.npz")), *sorted(OUTPUT.glob("weights-*.json"))]
    write_atomic(OUTPUT / "outputs.json", {
        "schema_version": 1, "version": VERSION, "publication_allowed": False,
        "files": [{"file": p.name, "bytes": p.stat().st_size, "sha256": sha256(p)} for p in files]})
    print(json.dumps({"artifact": str(ARTIFACT), "sha256": sha256(ARTIFACT),
                      "regions": [{"id": r["id"], "status": r["status"],
                                   "history": r["history"]["summary"] if r["history"] else None}
                                  for r in regions],
                      "legacy_comparison": result["legacy_comparison"]}, indent=2))


if __name__ == "__main__":
    main()
