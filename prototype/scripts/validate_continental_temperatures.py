"""Independent raw-cell checks and persisted contracts for the new 7C bundle."""
import json
import math
from pathlib import Path

import netCDF4
import numpy as np

import build_continent_masks as base
import build_reviewed_continent_masks as review
from build_europe_pilot import SCENARIOS, spatial_mean
from continental_weights import OUTPUT, require
from fetch_cmip6_europe_pair import OUTPUT as PAIR, sha256

ARTIFACT = OUTPUT / "continental_temperatures_v1.json"


def independent_years(path, variable, weights, baseline, years):
    """Use scalar masked reductions, separately from batched matrix production."""
    with netCDF4.Dataset(path) as dataset:
        time = dataset["time"]
        calendar = getattr(time, "calendar", "standard")
        dates = netCDF4.num2date(time[:], time.units, calendar=calendar)
        values, coverages, days = {}, {}, {}
        for i, date in enumerate(dates):
            year = int(date.year)
            if year not in years:
                continue
            raw = dataset[variable][i]
            row, covered = zip(*(spatial_mean(raw, region) for region in weights))
            values.setdefault(year, []).append(row)
            coverages.setdefault(year, []).append(covered)
            days.setdefault(year, []).append(date.daysinmonth)
        results = {}
        for year in years:
            array = np.array(values[year], dtype=float)
            valid = np.isfinite(array).all(axis=0) & (len(array) == 12)
            numerator = np.average(array, axis=0, weights=days[year]) - baseline
            results[year] = {
                "values": [float(value) if ok else None for value, ok in zip(numerator, valid)],
                "coverage": np.min(coverages[year], axis=0).tolist(),
                "source_months": len(array), "days": sum(days[year]),
            }
    return results


def compare_independent(region_series, independent, coverage_key="coverage"):
    maximum = 0.0
    for k, points in enumerate(region_series):
        mapped = {int(p["date"]): p for p in points}
        for year, row in independent.items():
            point = mapped[year]
            expected = row["values"][k]
            require((point["value"] is None) == (expected is None), "Independent annual missingness differs")
            require(abs(point[coverage_key] - row["coverage"][k]) < 1e-12,
                    "Independent spatial coverage differs")
            if expected is not None:
                error = abs(point["value"] - expected)
                require(error < 1e-10, f"Independent raw-cell/year reduction differs: {error}")
                maximum = max(maximum, error)
    return maximum


def check_reference(independent):
    years = list(range(1981, 2011))
    require(all(year in independent and independent[year]["source_months"] == 12 for year in years),
            "Independent reference is incomplete")
    residual = np.average([independent[y]["values"] for y in years], axis=0,
                          weights=[independent[y]["days"] for y in years])
    require(np.isfinite(residual).all() and np.max(np.abs(residual)) < 1e-10,
            "Independent regional reference offset is incorrect")
    return float(np.max(np.abs(residual)))


def validate_shape(bundle):
    require(bundle["schema_version"] == 1 and bundle["version"] == "7c7-continental-temperatures-v1"
            and bundle["publication_allowed"] is False
            and bundle["baseline"] == [1981, 2010] and bundle["unit"] == "degC anomaly",
            "Continental artifact identity/reference mismatch")
    require([r["id"] for r in bundle["regions"]] == list(base.CONTINENTS), "Region coverage changed")
    for region in bundle["regions"]:
        require(region["publication_allowed"] is False, "Unapproved regional publication")
        path = base.ROOT / region["mask"]["file"]
        require(sha256(path) == region["mask"]["sha256"], "Mask provenance mismatch")
        if region["status"] == "blocked-grounding":
            require(region["id"] == "antarctica" and region["models"] == []
                    and region["range"] is None and region["history"] is None,
                    "Blocked Antarctic region must not expose temperatures")
            continue
        require(region["status"] == "validated-local"
                and [m["source_id"] for m in region["models"]] == ["ACCESS-CM2", "CanESM5"],
                "Unexpected regional model selection")
        for experiment in ("historical", *SCENARIOS):
            first, last = (1850, 2014) if experiment == "historical" else (2015, 2100)
            points = []
            for model in region["models"]:
                series = model["historical"] if experiment == "historical" else model["scenarios"][experiment]
                require([p["date"] for p in series] == [str(y) for y in range(first, last + 1)],
                        "Annual model date axis mismatch")
                require(all(p["value"] is not None and math.isfinite(p["value"])
                            and .9 <= p["coverage"] <= 1 for p in series), "Invalid annual model value")
                require(abs(model["baseline_residual_degC"]) < 1e-10, "Nonzero model reference")
                points.append(series)
            ranges = (region["range"]["historical"] if experiment == "historical"
                      else region["range"]["scenarios"][experiment])
            require(len(ranges) == len(points[0]), "Truncated model spread")
            for low, high, row in zip(*points, ranges):
                require(low["date"] == high["date"] == row["date"] and row["model_count"] == 2
                        and row["min"] == min(low["value"], high["value"])
                        and row["max"] == max(low["value"], high["value"]), "Model min/max differs")
        history = region["history"]
        require(history["status"] in ("available", "blocked-incomplete-baseline"), "Unknown NASA status")
        annual = history["annual"]
        require([p["date"] for p in annual] == [str(y) for y in range(1880, 2027)], "NASA annual axis changed")
        monthly = {p["date"]: p["coverage"] for p in history["monthly_coverage"]}
        for point in annual:
            year = point["date"]
            months = {int(date[-2:]): coverage for date, coverage in monthly.items() if date.startswith(year)}
            absent = sorted(set(range(1, 13)) - months.keys())
            below = sorted(m for m, coverage in months.items() if coverage + 1e-12 < .9)
            require(point["absent_source_months"] == absent and point["below_coverage_months"] == below
                    and point["source_months"] == len(months)
                    and point["minimum_monthly_coverage"] == min(months.values()),
                    "NASA coverage/gap diagnostics differ from monthly evidence")
            reasons = []
            if history["status"] != "available":
                reasons.append("incomplete-reference")
            if absent:
                reasons.append("incomplete-source-year")
            if below:
                reasons.append("insufficient-spatial-coverage")
            require(point["missing_reasons"] == reasons
                    and (point["value"] is None) == bool(reasons)
                    and point["status"] == ("missing" if reasons else "valid"),
                    "NASA annual validity differs from source support")
            require(point["value"] is None or math.isfinite(point["value"]), "Non-finite NASA anomaly")


def main():
    bundle = json.loads(ARTIFACT.read_text(encoding="utf-8"))
    validate_shape(bundle)
    review_path = OUTPUT / "source-review" / "source-review.json"
    require(review_path.exists() and bundle["source_review"].get("sha256") == sha256(review_path),
            "Current official-source review is missing from this computation")
    source_review = json.loads(review_path.read_text(encoding="utf-8"))
    for row in source_review["source_archive"]:
        path = (review_path.parent / row["file"]).resolve()
        require(path.parent == review_path.parent and path.stat().st_size == row["bytes"]
                and sha256(path) == row["sha256"], "Official source archive identity mismatch")
    catalog = json.loads((OUTPUT / "catalog.json").read_text(encoding="utf-8"))
    require(catalog["product"]["sha256"] == sha256(ARTIFACT)
            and catalog["product"]["bytes"] == ARTIFACT.stat().st_size, "Catalog byte identity mismatch")
    for row in json.loads((OUTPUT / "outputs.json").read_text(encoding="utf-8"))["files"]:
        path = OUTPUT / row["file"]
        require(sha256(path) == row["sha256"] and path.stat().st_size == row["bytes"],
                "Continental output manifest mismatch")
    for name, pin in bundle["provenance"]["implementation_sha256"].items():
        require(sha256(Path(__file__).with_name(name)) == pin, "Numerical implementation changed")
    for row in bundle["provenance"]["legacy_climate_unchanged"]:
        require(sha256(PAIR.parent / row["file"]) == row["sha256"], "Legacy source was overwritten")
    regions = bundle["regions"][:-1]
    manifest = json.loads((PAIR / "manifest.json").read_text(encoding="utf-8"))
    checks = []
    for k, source_id in enumerate(("ACCESS-CM2", "CanESM5")):
        with np.load(OUTPUT / f"weights-{source_id.lower()}.npz", allow_pickle=False) as cache:
            weights = cache["weights"][:6]
        models = [region["models"][k] for region in regions]
        baseline = np.array([m["baseline_temperature_K"] for m in models])
        for experiment in ("historical", *SCENARIOS):
            item, = [r for r in manifest["files"] if r["source_id"] == source_id
                      and r["experiment"] == experiment and r["variable"] == "tas"]
            years = [1850, *range(1981, 2011), 2014] if experiment == "historical" else [2015, 2050, 2100]
            expected = independent_years(base.ROOT / item["local_path"], "tas", weights, baseline, years)
            series = [m["historical"] if experiment == "historical" else m["scenarios"][experiment]
                      for m in models]
            check = {"source_id": source_id, "experiment": experiment, "years": years,
                     "maximum_absolute_error_degC": compare_independent(series, expected)}
            if experiment == "historical":
                check["independent_baseline_residual_degC"] = check_reference(expected)
            checks.append(check)
            print(f"Independent {source_id}/{experiment}: PASS", flush=True)
    with np.load(OUTPUT / "weights-nasa.npz", allow_pickle=False) as cache:
        weights = cache["weights"][:6]
    ready = [i for i, region in enumerate(regions) if region["history"]["status"] == "available"]
    offsets = np.array([regions[i]["history"]["baseline_offset_K"] for i in ready])
    years = [1880, *range(1981, 2011), 2025, 2026]
    expected = independent_years(base.LEGACY / "gistemp250_GHCNv4.nc", "tempanomaly",
                                weights[ready], offsets, years)
    checks.append({"source_id": "NASA", "years": years,
                   "independent_baseline_residual_degC": check_reference(expected),
                   "maximum_absolute_error_degC": compare_independent(
                       [regions[i]["history"]["annual"] for i in ready], expected,
                       "minimum_monthly_coverage")})
    result = {
        "schema_version": 1, "version": bundle["version"],
        "status": "PASS-six-continental-products-Antarctic-temperatures-blocked",
        "publication_allowed": False, "artifact_sha256": sha256(ARTIFACT),
        "validator_sha256": sha256(Path(__file__)), "independent_raw_cell_checks": checks,
        "legacy_files_unchanged": True, "all_seven_regions_explicit": True,
        "temperature_regions": 6, "antarctic_temperature_series": False,
        "limits": [
            "This is numerical/source-contract validation, not a representative ensemble or quantified observational uncertainty.",
            "Antarctic grounding and CDS methodology remain separate gates; no public deployment is performed.",
        ],
    }
    base.dump(OUTPUT / "validation.json", result)
    manifest_path = OUTPUT / "outputs.json"
    outputs = json.loads(manifest_path.read_text(encoding="utf-8"))
    for path in (OUTPUT / "validation.json", OUTPUT / "source-review" / "source-review.json"):
        require(path.exists(), f"Completion evidence is missing: {path.name}")
        relative = path.relative_to(OUTPUT).as_posix()
        outputs["files"] = [row for row in outputs["files"] if row["file"] != relative]
        outputs["files"].append({"file": relative, "bytes": path.stat().st_size, "sha256": sha256(path)})
    base.dump(manifest_path, outputs)
    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()
