"""Offline content validation of the downloaded ECDE annual temperature pilot."""
import argparse
import hashlib
import json
from pathlib import Path
import zipfile

import netCDF4
import numpy as np

from fetch_cds_europe_annual import (
    DEFAULT_OUTPUT, load_manifest, request_manifest, verify_existing_downloads,
)

LAYERS = {
    "nuts_0": "nuts_level_0",
    "nuts_1": "nuts_level_1",
    "nuts_2": "nuts_level_2",
    "eea_eea_32": "eea_32",
    "eea_eea_38": "eea_38",
    "eea_eu_27": "eu_27",
    **{f"eea_trans_{region}": region for region in (
        "adriatic_ionian", "alpine_space", "northern_periphery_and_arctic",
        "atlantic_area", "baltic_sea_region", "central_europe", "danube",
        "mediterranean", "north_sea", "north_west_europe", "south_west_europe",
    )},
}


def annual_years(time):
    calendar = getattr(time, "calendar", "standard")
    dates = netCDF4.num2date(time[:], time.units, calendar=calendar)
    years = [date.year for date in dates]
    if not years or years != list(range(years[0], years[-1] + 1)):
        raise ValueError("Annual time axis is empty, duplicated, unordered or non-contiguous")
    return years, calendar


def summarize_values(values, codes, years):
    data = np.ma.asarray(values)
    if data.shape != (len(codes), len(years)) or len(set(codes)) != len(codes):
        raise ValueError("Temperature dimensions or unique territorial IDs are invalid")
    raw = np.ma.getdata(data)
    invalid = np.ma.getmaskarray(data) | ~np.isfinite(raw)
    valid = raw[~invalid]
    if not valid.size or np.any((valid < 150) | (valid > 350)):
        raise ValueError("Temperature has no valid values or implausible Kelvin values")
    baseline = (np.array(years) >= 1981) & (np.array(years) <= 2010)
    return {
        "territory_count": len(codes),
        "territory_ids": codes,
        "value_count": int(data.size),
        "missing_count": int(invalid.sum()),
        "minimum_K": float(valid.min()),
        "maximum_K": float(valid.max()),
        "all_missing_territories": [
            code for code, row in zip(codes, invalid) if row.all()
        ],
        "partially_missing_territories": [
            code for code, row in zip(codes, invalid) if row.any() and not row.all()
        ],
        "baseline_complete_territories": [
            code for code, row in zip(codes, invalid)
            if int(baseline.sum()) == 30 and not row[baseline].any()
        ],
    }


def scenario_difference(left, right, years):
    mask = np.array(years) <= 2005
    left = np.ma.asarray(left)[:, mask]
    right = np.ma.asarray(right)[:, mask]
    a, b = np.ma.getdata(left), np.ma.getdata(right)
    invalid_a = np.ma.getmaskarray(left) | ~np.isfinite(a)
    invalid_b = np.ma.getmaskarray(right) | ~np.isfinite(b)
    valid = ~(invalid_a | invalid_b)
    differences = np.abs(a[valid] - b[valid])
    return {
        "period": [years[0], min(years[-1], 2005)],
        "compared_values": int(valid.sum()),
        "different_missing_flags": int(np.count_nonzero(invalid_a != invalid_b)),
        "max_absolute_difference_K": float(differences.max()) if differences.size else None,
        "identical_values": bool(differences.size and np.all(differences == 0)),
    }


def inspect_member(content, name, entry):
    with netCDF4.Dataset("ecde-memory", memory=content) as dataset:
        variable = dataset["mean_temperature"]
        expected = {
            "units": "K",
            "standard_name": "air_temperature",
            "original_name": "tasAdjust",
            "gcm": entry["gcm"],
            "rcm": entry["rcm"],
            "ensemble_member": entry["ensemble_member"],
        }
        for attribute, value in expected.items():
            if getattr(variable, attribute, None) != value:
                raise ValueError(f"{name}: unexpected {attribute}")
        if len(variable.dimensions) != 2 or variable.dimensions[1] != "time":
            raise ValueError(f"{name}: unexpected temperature dimensions")
        scenario = variable.scenario
        if scenario not in ("rcp_4_5", "rcp_8_5") or f"-{scenario}-" not in name:
            raise ValueError(f"{name}: unexpected scenario identity")
        years, calendar = annual_years(dataset["time"])
        dimension = variable.dimensions[0]
        codes = [str(value) for value in dataset[dimension][:].reshape(-1)]
        values = variable[:]
        layer = name.split("-layer-")[1].split("-latitude-")[0]
        if not name.endswith("-v2.0.nc"):
            raise ValueError(f"{name}: unexpected dataset version")
        if "height" not in dataset.variables or float(dataset["height"][...]) != 2:
            raise ValueError(f"{name}: expected 2m temperature")
        metadata = {
            attribute: str(variable.getncattr(attribute))
            for attribute in variable.ncattrs()
        }
        record = {
            "member": name,
            "sha256": hashlib.sha256(content).hexdigest(),
            "layer": layer,
            "scenario": scenario,
            "first_year": years[0],
            "last_year": years[-1],
            "year_count": len(years),
            "calendar": calendar,
            "global_attributes": {
                attribute: str(dataset.getncattr(attribute))
                for attribute in dataset.ncattrs()
            },
            "temperature_metadata": metadata,
            **summarize_values(values, codes, years),
        }
        return record, values.copy(), years


def validate(archive_directory):
    manifest_path = archive_directory / "manifest.json"
    if not manifest_path.is_file():
        raise ValueError("Download manifest is missing")
    manifest = load_manifest(manifest_path, request_manifest())
    verified = verify_existing_downloads(archive_directory, manifest)
    if len(verified) != 9 or len(manifest["downloads"]) != 9:
        raise ValueError("Expected exactly nine verified downloads")
    expected_ids = {entry["id"] for entry in manifest["requests"]}
    actual_ids = {
        "_".join(entry[key] for key in ("gcm", "rcm", "ensemble_member"))
        for entry in manifest["downloads"]
    }
    if actual_ids != expected_ids:
        raise ValueError("Download combinations do not match requested combinations")
    if manifest["total_bytes"] != sum(item["bytes"] for item in manifest["downloads"]):
        raise ValueError("Manifest total byte count is incorrect")
    report = {
        "schema_version": 1,
        "phase": "7C.2c",
        "status": "review-required-not-publishable",
        "download_manifest_sha256": hashlib.sha256(manifest_path.read_bytes()).hexdigest(),
        "total_download_bytes": sum(item["bytes"] for item in manifest["downloads"]),
        "archives": [],
        "files": [],
        "historical_segment_comparisons": [],
        "publication_blockers": [
            "No standalone historical experiment returned; scenario-labelled values must not be "
            "represented as observations or one shared historical series.",
            "Requested Kosovo/Bosnia layer has no separate file; NUTS coverage is not proof of "
            "an equivalent combined regional aggregation.",
            "Missing territories must be explicitly excluded, never filled or treated as zero.",
            "Regional weighting, bias-adjustment provenance and annual cell_methods need source "
            "documentation review before anomaly calculation.",
            "License and redistribution conditions are not established by these NetCDF attributes.",
            "Two HadGEM2-ES combinations stop at 2098; a nine-combination result cannot be "
            "extended to 2100, and an 2081-2100 average is incomplete for those combinations.",
        ],
        "source_comparison": {
            "cds": "Bias-adjusted EURO-CORDEX/SIS Energy tasAdjust; RCP4.5/RCP8.5; "
                   "administrative/sector layers; annual Kelvin; no ERA5 observations requested.",
            "custom_mask_pilot": "Native CMIP6 ACCESS-CM2 tas; four SSP; project physical Europe "
                                 "mask; monthly source with day-weighted aggregation; separate NASA history.",
            "policy": "Do not merge model samples, geographical masks or RCP/SSP experiments. "
                      "Do not average NUTS region means to create a continental mean.",
        },
    }
    for entry in manifest["downloads"]:
        filename = entry["file"]
        cache = {}
        archive_records = []
        with zipfile.ZipFile(archive_directory / filename) as zipped:
            names = zipped.namelist()
            if len(names) != len(set(names)):
                raise ValueError(f"{filename}: duplicate ZIP names")
            for name in names:
                if not name.endswith(".nc"):
                    raise ValueError(f"{filename}: unexpected ZIP member {name}")
                record, values, years = inspect_member(zipped.read(name), name, entry)
                key = (record["layer"], record["scenario"])
                if key in cache:
                    raise ValueError(f"{filename}: duplicate layer/scenario")
                cache[key] = (record, values, years)
                record["archive"] = filename
                archive_records.append(record)
        layers = sorted({key[0] for key in cache})
        if set(layers) != set(LAYERS):
            raise ValueError(f"{filename}: returned layer inventory differs from the reviewed set")
        for layer in layers:
            left, a, years = cache[(layer, "rcp_4_5")]
            right, b, other_years = cache[(layer, "rcp_8_5")]
            if years != other_years or left["territory_ids"] != right["territory_ids"]:
                raise ValueError(f"{filename}: scenario coordinates differ")
            report["historical_segment_comparisons"].append({
                "archive": filename, "layer": layer,
                **scenario_difference(a, b, years),
            })
        report["archives"].append({
            "file": filename, "layers": layers, "member_count": len(archive_records),
            "requested_layers_without_separate_file": sorted(
                set(manifest["requests"][0]["request"]["regional_layer"])
                - {LAYERS[layer] for layer in layers}
            ),
            "first_year": min(item["first_year"] for item in archive_records),
            "last_year": max(item["last_year"] for item in archive_records),
            "nuts0_contains_XK_BA": all(
                {"XK", "BA"} <= set(cache[("nuts_0", scenario)][0]["territory_ids"])
                for scenario in ("rcp_4_5", "rcp_8_5")
            ),
        })
        report["files"].extend(archive_records)
    records = report["files"]
    report["summary"] = {
        "archive_count": len(report["archives"]),
        "netcdf_count": len(records),
        "territorial_series_count": sum(item["territory_count"] for item in records),
        "value_count": sum(item["value_count"] for item in records),
        "missing_count": sum(item["missing_count"] for item in records),
        "time_ranges": sorted({(item["first_year"], item["last_year"]) for item in records}),
        "calendars": sorted({item["calendar"] for item in records}),
        "common_year_range_all_combinations": [
            max(item["first_year"] for item in records),
            min(item["last_year"] for item in records),
        ],
        "all_missing_territorial_series": sum(len(item["all_missing_territories"]) for item in records),
        "partially_missing_territorial_series": sum(
            len(item["partially_missing_territories"]) for item in records
        ),
        "baseline_complete_territorial_series": sum(
            len(item["baseline_complete_territories"]) for item in records
        ),
        "max_pre2006_scenario_difference_K": max(
            item["max_absolute_difference_K"]
            for item in report["historical_segment_comparisons"]
            if item["max_absolute_difference_K"] is not None
        ),
    }
    return report


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--archive-dir", type=Path, default=DEFAULT_OUTPUT)
    args = parser.parse_args()
    report = validate(args.archive_dir)
    output = args.archive_dir / "validation" / "report.json"
    output.parent.mkdir(parents=True, exist_ok=True)
    temporary = output.with_suffix(".json.tmp")
    temporary.write_text(
        json.dumps(report, indent=2, allow_nan=False) + "\n", encoding="utf-8"
    )
    temporary.replace(output)
    print(json.dumps(report["summary"], indent=2))
    print(f"Status: {report['status']}; report: {output}")


if __name__ == "__main__":
    main()
