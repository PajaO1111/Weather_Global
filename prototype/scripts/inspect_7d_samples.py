"""Verify archived 7D.0 samples without generating application products."""
import csv
import gzip
import hashlib
import io
import json
from pathlib import Path

import numpy as np
from netCDF4 import Dataset, num2date

OUTPUT = Path(__file__).resolve().parents[2] / "data_samples/2026-11-06/phase7d-feasibility"


def require(condition, message):
    if not condition:
        raise ValueError(message)


def sea_ice_rows(text, region, month):
    reader = csv.reader(io.StringIO(text))
    require([value.strip() for value in next(reader)] ==
            ["year", "mo", "source_dataset", "region", "extent", "area"],
            "Unexpected sea ice CSV header")
    rows = []
    for fields in reader:
        require(len(fields) == 6, "Invalid sea ice field count")
        year, actual_month = int(fields[0]), int(fields[1])
        extent, area = float(fields[4]), float(fields[5])
        require(actual_month == month and fields[3].strip() == region,
                "Sea ice region/month mismatch")
        require(np.isfinite(extent) and np.isfinite(area), "Nonfinite sea ice value")
        require(extent == -9999 or 0 <= extent <= 40, "Invalid sea ice extent")
        require(area == -9999 or 0 <= area <= 40, "Invalid sea ice area")
        require(not rows or year > rows[-1]["year"], "Duplicate or unordered sea ice year")
        rows.append({"year": year, "extent": None if extent == -9999 else extent,
                     "area": None if area == -9999 else area,
                     "source_dataset": fields[2].strip()})
    require(bool(rows), "Empty sea ice series")
    reference = [row for row in rows if 1981 <= row["year"] <= 2010]
    require(len(reference) == 30, "Reference years absent from sea ice file")
    require(sum(row["extent"] is not None for row in reference) >= 29,
            "Fewer than 29 available sea ice reference values")
    return rows


def gas_rows(text):
    require("ppb" in text and "average_unc" in text, "Missing gas unit/schema")
    rows = []
    for line in text.splitlines():
        if not line.strip() or line.lstrip().startswith("#"):
            continue
        fields = line.split()
        require(len(fields) == 7, "Unexpected gas field count")
        year, month = int(fields[0]), int(fields[1])
        values = [float(value) for value in fields[2:]]
        require(1 <= month <= 12 and all(np.isfinite(values)), "Invalid gas fields")
        key = year * 12 + month
        require(not rows or key == rows[-1]["key"] + 1, "Gas months not continuous")
        require(values[1] > 0, "Invalid gas mean")
        require(all(value >= 0 or value in (-9.9, -9.99) for value in [values[2], values[4]]),
                "Unexpected gas uncertainty sentinel")
        rows.append({"key": key, "date": f"{year:04d}-{month:02d}", "mean": values[1],
                     "uncertainty": None if values[2] in (-9.9, -9.99) else values[2]})
    require(bool(rows), "Empty gas series")
    return rows


def array_summary(values):
    valid = np.ma.masked_invalid(values).compressed()
    require(valid.size > 0, "No valid sample values")
    return {"valid_count": int(valid.size), "minimum": float(valid.min()),
            "maximum": float(valid.max())}


def inspect():
    manifest_path = OUTPUT / "source-manifest.json"
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    sources = OUTPUT / "sources"
    archived = [item for item in manifest["sources"] if item["status"] == "archived"]
    for item in archived:
        content = (sources / item["file"]).read_bytes()
        require(len(content) == item["bytes"], f"Byte count changed: {item['file']}")
        require(hashlib.sha256(content).hexdigest() == item["sha256"],
                f"Checksum changed: {item['file']}")
    sea_ice = []
    for region in ("N", "S"):
        for month in range(1, 13):
            name = f"{region}_{month:02d}_extent_v4.0.csv"
            rows = sea_ice_rows((sources / name).read_text(encoding="utf-8"), region, month)
            valid = [row for row in rows if row["extent"] is not None]
            sea_ice.append({
                "file": name, "region": region, "month": month, "rows": len(rows),
                "first_year": rows[0]["year"], "last_year": rows[-1]["year"],
                "missing_extent_years": [row["year"] for row in rows if row["extent"] is None],
                "reference_count": sum(row["extent"] is not None for row in rows
                                       if 1981 <= row["year"] <= 2010),
                "reference_mean_extent": sum(row["extent"] for row in rows
                                             if 1981 <= row["year"] <= 2010
                                             and row["extent"] is not None) / sum(
                                                 row["extent"] is not None for row in rows
                                                 if 1981 <= row["year"] <= 2010),
                "last_valid": valid[-1],
            })
    with Dataset("snow", memory=(sources / "snow-sample.nc").read_bytes()) as dataset:
        require(dataset.product_version == "v01r01", "Unexpected snow product version")
        require(dataset.license == "No restrictions on access or use", "Snow terms changed")
        snow = dataset.variables["snow_cover_extent"][:]
        unique = np.unique(snow.compressed())
        require(set(unique.tolist()) <= {0, 1}, "Snow mask is not binary")
        time = dataset.variables["time"]
        differences = np.unique(np.diff(time[:])).tolist()
        require(differences == [7], "Snow sample is not a weekly series")
        dates = num2date(time[:], time.units, time.calendar)
        land = dataset.variables["land"][:]
        area = dataset.variables["area"][:]
        require(np.all(area > 0), "Nonpositive snow cell area")
        examples = []
        for index in (0, len(dates) // 2, len(dates) - 1):
            examples.append({
                "time_coordinate": dates[index].isoformat(),
                "snow_land_area_km2_sample_sum": float(np.ma.sum(
                    np.ma.masked_where(land != 1, snow[index]) * area, dtype=np.float64)),
            })
        snow_report = {
            "dimensions": {key: len(value) for key, value in dataset.dimensions.items()},
            "version": dataset.product_version, "license": dataset.license,
            "declared_start": dataset.time_coverage_start,
            "declared_end": dataset.time_coverage_end,
            "first_time_coordinate": dates[0].isoformat(),
            "last_time_coordinate": dates[-1].isoformat(),
            "cadence_days": differences, "mask_values": unique.tolist(),
            "snow_cover_threshold": float(dataset.variables["snow_cover_threshold"][...]),
            "cell_area": array_summary(area),
            "diagnostic_only_not_validated_regional_product": examples,
        }
    with Dataset("gpcc", memory=gzip.decompress(
            (sources / "gpcc-2021-2024.nc.gz").read_bytes())) as dataset:
        require(len(dataset.dimensions["time"]) == 48, "Unexpected GPCC sample length")
        time = dataset.variables["time"]
        dates = num2date(time[:], time.units, time.calendar)
        months = [date.year * 12 + date.month for date in dates]
        require(months == list(range(2021 * 12 + 1, 2025 * 12 + 1)),
                "Unexpected GPCC sample dates")
        require(dataset.variables["precip"].units == "mm/month", "Unexpected GPCC unit")
        variables = {}
        for name in ("precip", "precip_infill", "gauge", "gauge_int", "dist_int",
                     "err", "sys_err", "liquid", "solid"):
            variable = dataset.variables[name]
            variables[name] = {"units": variable.units, **array_summary(variable[:])}
        require(variables["precip"]["minimum"] >= 0, "Negative valid precipitation")
        gpcc_report = {
            "dimensions": {key: len(value) for key, value in dataset.dimensions.items()},
            "first": dates[0].isoformat(), "last": dates[-1].isoformat(),
            "declared_start": dataset.time_coverage_start,
            "declared_end": dataset.time_coverage_end,
            "calendar": time.calendar, "variables": variables,
            "warning": "Global time coverage strings lack years; decode the time coordinate.",
            "grid_degrees": 2.5,
        }
    gases = {}
    for gas in ("ch4", "n2o"):
        rows = gas_rows((sources / f"{gas}-monthly.txt").read_text(encoding="utf-8"))
        gases[gas] = {"rows": len(rows), "first": rows[0]["date"], "last": rows[-1],
                      "unit": "ppb", "missing_uncertainty_count": sum(
                          row["uncertainty"] is None for row in rows)}
    carbon = (sources / "gcb-global.xlsx").read_bytes()
    require(b"licence-page" in carbon and b"Yes, I accept" in carbon,
            "Recheck GCB response: no longer the observed consent page")
    spei = (sources / "spei03-header.bin").read_bytes()
    require(spei[:8] == b"\x89HDF\r\n\x1a\n", "Unexpected SPEI partial signature")
    require(b"Global 3-months SPEI" in spei, "SPEI partial identity changed")
    report = {
        "schema_version": 1, "publication_ready": False,
        "inspector_sha256": hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
        "source_manifest_sha256": hashlib.sha256(manifest_path.read_bytes()).hexdigest(),
        "archived_files": len(archived), "archived_bytes": sum(item["bytes"] for item in archived),
        "failed_endpoints": [item for item in manifest["sources"] if item["status"] != "archived"],
        "sea_ice": sea_ice, "snow": snow_report, "precipitation": gpcc_report,
        "gases": gases,
        "spei": {"status": "partial_header_only_not_numeric_validation",
                 "content_range": next(item["content_range"] for item in archived
                                       if item["file"] == "spei03-header.bin"),
                      "requires": "Full SPEI-3/SPEI-12 numerical inspection and ODbL derivative release plan"},
        "carbon_budget": {"status": "consent_page_not_spreadsheet",
                          "requires": "Normal licence acceptance and real XLSX content inspection"},
        "ice_sheets": {"status": "source_documentation_only",
                       "requires": "Exact producer regional series, uncertainties, reference and authorised access"},
    }
    (OUTPUT / "sample-inspection.json").write_text(
        json.dumps(report, indent=2, allow_nan=False) + "\n", encoding="utf-8")
    print(json.dumps({key: report[key] for key in
                      ("archived_files", "archived_bytes", "gases", "spei", "carbon_budget")},
                     indent=2))


if __name__ == "__main__":
    inspect()
