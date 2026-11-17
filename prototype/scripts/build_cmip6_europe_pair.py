"""Offline two-model Europe anomalies and descriptive min/max, never probabilities."""
import json
import math

import netCDF4
import numpy as np
from shapely.geometry import shape
from shapely.ops import unary_union

from build_europe_pilot import (
    ARCHIVE, COVERAGE, SCENARIOS, annualize, grid_weights, monthly_values, read_shapes, rebase,
)
from fetch_cmip6_europe_pair import APPROVED, OUTPUT, ROOT, sha256
from validate_cmip6_europe_pair import validate

ARTIFACT = OUTPUT / "europe_pair_anomalies_v1.json"


def require_annual(points, first, last):
    if ([point["date"] for point in points] != [str(year) for year in range(first, last + 1)]
            or any(point["value"] is None or not math.isfinite(point["value"])
                   or point["coverage"] < COVERAGE for point in points)):
        raise ValueError("Incomplete, non-finite or insufficiently covered annual series")


def minmax(series):
    if len(series) != 2 or not series[0] or len(series[0]) != len(series[1]):
        raise ValueError("Exactly two nonempty aligned model series required")
    output = []
    for left, right in zip(*series):
        if (left["date"] != right["date"] or any(
                point["value"] is None or not math.isfinite(point["value"])
                for point in (left, right))):
            raise ValueError("Misaligned or missing model value; never reduce model count")
        output.append({"date": left["date"], "min": min(left["value"], right["value"]),
                       "max": max(left["value"], right["value"]), "model_count": 2})
    return output


def build():
    validation = validate()
    manifest = json.loads((OUTPUT / "manifest.json").read_text(encoding="utf-8"))
    feature = json.loads((ARCHIVE / "europe-mask-v1.geojson").read_text(encoding="utf-8"))
    land = unary_union([geometry for _, geometry in read_shapes("land")])
    mask = shape(feature["geometry"])
    models = []
    for source_id in APPROVED:
        entries = [item for item in manifest["files"] if item["source_id"] == source_id]
        area_entry, = [item for item in entries if item["variable"] == "areacella"]
        land_entry, = [item for item in entries if item["variable"] == "sftlf"]
        with netCDF4.Dataset(ROOT / area_entry["local_path"]) as area, \
                netCDF4.Dataset(ROOT / land_entry["local_path"]) as fraction:
            weights, diagnostics = grid_weights(
                area["lat"][:], area["lon"][:], land, mask,
                area["areacella"][:], fraction["sftlf"][:] / 100,
                area[area["lat"].bounds][:], area[area["lon"].bounds][:],
            )
        monthly = {}
        calendars = {}
        for experiment in ("historical", *SCENARIOS):
            entry, = [item for item in entries if item["variable"] == "tas"
                      and item["experiment"] == experiment]
            with netCDF4.Dataset(ROOT / entry["local_path"]) as dataset:
                monthly[experiment], calendars[experiment] = monthly_values(
                    dataset, dataset["tas"], weights)
        if len(set(calendars.values())) != 1:
            raise ValueError("Model calendar changes between experiments")
        historical, baseline_k, baseline_days = rebase(monthly["historical"])
        require_annual(historical, 1850, 2014)
        scenarios = {}
        for scenario in SCENARIOS:
            points = annualize([{**row, "value": None if row["value"] is None
                                 else row["value"] - baseline_k} for row in monthly[scenario]])
            require_annual(points, 2015, 2100)
            scenarios[scenario] = points
        models.append({
            "source_id": source_id, "member": "r1i1p1f1", "grid_label": "gn",
            "calendar": calendars["historical"],
            "baseline_temperature_K": baseline_k, "baseline_days": baseline_days,
            "grid": diagnostics, "historical": historical, "scenarios": scenarios,
            "sources": [{key: entry[key] for key in
                         ("file", "variable", "experiment", "version", "bytes", "sha256", "local_path")}
                        for entry in entries],
            "license_statement": next(row for row in validation["models"]
                                      if row["source_id"] == source_id)["experiments"]["historical"]["license"],
        })
    return {
        "schema_version": 1, "version": "7c3c-europe-pair-anomalies-v1",
        "status": "local-technical-two-model-comparison-not-public-release",
        "region": "Europe custom physical land mask, not EU27",
        "mask": {"version": validation["mask_version"], "sha256": validation["mask_sha256"],
                 "land_zip_sha256": sha256(ARCHIVE / "ne_10m_land.zip"),
                 "definition": feature["properties"]},
        "baseline": [1981, 2010], "unit": "degC anomaly", "source_unit": "K",
        "model_count": 2, "models": models,
        "range": {
            "statistic": "pointwise minimum and maximum of the two model anomalies",
            "historical": minmax([model["historical"] for model in models]),
            "scenarios": {scenario: minmax([model["scenarios"][scenario] for model in models])
                          for scenario in SCENARIOS},
        },
        "method": {
            "baseline": "Each model's own historical 1981-2010 monthly land mean, weighted by source-calendar month duration.",
            "annual": "Subtract that fixed model baseline from monthly values; annual mean weighted by source-calendar month duration; require all 12 months.",
            "spatial": "Native areacella * sftlf/100 * (geometric Europe land overlap / all geometric land overlap); no regridding or double land weighting.",
            "coverage_threshold": COVERAGE,
            "missing_policy": "No interpolation, no changing model count; any invalid annual value blocks this artifact.",
            "range": "Min/max after independent model rebasing and annualization; align calendar-year labels only, not daily time axes.",
        },
        "limitations": [
            "Two models and one realization each are a technical comparison, not a representative independent ensemble.",
            "Min/max is descriptive model spread, not a confidence interval, percentile, probability or bound on future outcomes.",
            "Historical series are model simulations, not observations; no NASA, ERA5 or CDS series are joined.",
            "Different source calendars and native grids are preserved; coast/land-mask differences remain in model diagnostics.",
            "Custom boundary is a versioned pilot convention with schematic segments, not an authoritative continental border.",
        ],
        "license": "CC-BY-SA-4.0", "license_url": "https://creativecommons.org/licenses/by-sa/4.0/",
        "attribution": "CMIP6 ACCESS-CM2: CSIRO/CSIRO-ARCCSS; CanESM5: CCCma, Environment and Climate Change Canada. Acknowledge WCRP/CMIP and ESGF providers. Europe aggregation, rebasing and two-model range are project adaptations; no provider endorsement.",
        "manifest_sha256": sha256(OUTPUT / "manifest.json"),
        "validation_sha256": sha256(OUTPUT / "validation.json"),
        "implementation_sha256": {name: sha256(ROOT / "prototype" / "scripts" / name) for name in
                                  ("build_cmip6_europe_pair.py", "build_europe_pilot.py",
                                   "validate_cmip6_europe_pair.py")},
    }


def main():
    result = build()
    temporary = ARTIFACT.with_suffix(".json.tmp")
    temporary.write_text(json.dumps(result, ensure_ascii=False, allow_nan=False,
                                    separators=(",", ":")) + "\n", encoding="utf-8")
    temporary.replace(ARTIFACT)
    print("Built", ARTIFACT, "SHA-256", sha256(ARTIFACT))
    for model in result["models"]:
        print(model["source_id"], model["calendar"], "baseline K:",
              model["baseline_temperature_K"], "days:", model["baseline_days"])


if __name__ == "__main__":
    main()
