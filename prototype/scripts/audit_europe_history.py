"""Offline 7C.4a audit and evidence-based 7C.4b historical-source decision."""
import gzip
import hashlib
import json

import netCDF4
import numpy as np
from shapely.geometry import shape

from build_europe_pilot import (
    ARCHIVE, COVERAGE, annualize, grid_weights, monthly_values, rebase,
)
from fetch_cmip6_europe_pair import ROOT, sha256

OUTPUT = ROOT / "data_samples" / "2026-11-06" / "europe-history-audit"


def verify_months(dataset):
    time = dataset["time"]
    calendar = getattr(time, "calendar", "standard")
    dates = netCDF4.num2date(time[:], time.units, calendar=calendar)
    keys = [(date.year, date.month) for date in dates]
    if not keys or keys != sorted(set(keys)) or any(
            right[0] * 12 + right[1] != left[0] * 12 + left[1] + 1
            for left, right in zip(keys, keys[1:])):
        raise ValueError("Duplicate, unordered or non-contiguous source months")
    intervals = dataset[time.bounds][:]
    expected_start = np.array([netCDF4.date2num(type(date)(date.year, date.month, 1),
                                              time.units, calendar=calendar) for date in dates])
    if (not time.units.startswith("days since ") or intervals.shape != (len(dates), 2)
            or np.ma.getmaskarray(intervals).any()
            or not np.array_equal(intervals[:, 0], expected_start)
            or not np.array_equal(intervals[:, 1] - intervals[:, 0],
                                  [date.daysinmonth for date in dates])):
        raise ValueError("Monthly CF bounds do not match source-calendar months")
    return dates, calendar


def year_diagnostics(months, annual):
    output = []
    for point in annual:
        rows = [row for row in months if row["year"] == int(point["date"])]
        missing = [row["month"] for row in rows if row["value"] is None]
        absent = sorted(set(range(1, 13)) - {row["month"] for row in rows})
        output.append({
            "year": int(point["date"]), "valid": point["value"] is not None,
            "source_months": len(rows), "below_coverage_months": missing,
            "absent_source_months": absent, "minimum_coverage": point["coverage"],
        })
    return output


def audit():
    compressed = ARCHIVE / "gistemp250_GHCNv4.nc.gz"
    source = ARCHIVE / "gistemp250_GHCNv4.nc"
    records = json.loads((ARCHIVE / "access.json").read_text(encoding="utf-8"))
    retrieval, = [row for row in records if row.get("file") == compressed.name
                  and row.get("status") == "ok"]
    if compressed.stat().st_size != retrieval["bytes"] or sha256(compressed) != retrieval["sha256"]:
        raise ValueError("NASA archive no longer matches retrieval provenance")
    if hashlib.sha256(gzip.decompress(compressed.read_bytes())).hexdigest() != sha256(source):
        raise ValueError("Expanded NASA NetCDF differs from archived gzip")
    feature = json.loads((ARCHIVE / "europe-mask-v1.geojson").read_text(encoding="utf-8"))
    mask = shape(feature["geometry"])
    if not mask.is_valid or mask.is_empty or feature["properties"]["version"] != "europe-kuma-manych-cyprus-v1":
        raise ValueError("Invalid or unexpected Europe mask")
    pair = json.loads((ROOT / "data_samples" / "2026-11-06" / "europe-cmip6-pair"
                       / "europe_pair_anomalies_v1.json").read_text(encoding="utf-8"))
    if pair["mask"]["sha256"] != sha256(ARCHIVE / "europe-mask-v1.geojson"):
        raise ValueError("Historical mask differs from current CMIP6 pair mask")
    with netCDF4.Dataset(source) as dataset:
        if ("ILAND=250" not in dataset.history or "IOCEAN=none" not in dataset.history
                or "1951-1980" not in dataset.history):
            raise ValueError("NASA product identity or original reference mismatch")
        field = dataset["tempanomaly"]
        if (field.units != "K" or field.cell_methods != "time: mean"
                or field.dimensions != ("time", "lat", "lon")):
            raise ValueError("Unexpected NASA anomaly dimensions, units or cell methods")
        dates, calendar = verify_months(dataset)
        if (dates[0].year, dates[0].month) != (1880, 1):
            raise ValueError("Unexpected NASA starting month")
        lat, lon = dataset["lat"][:], dataset["lon"][:]
        if (not np.array_equal(lat, np.arange(-89, 90, 2))
                or not np.array_equal(lon, np.arange(-179, 180, 2))
                or dataset["lat"].units != "degrees_north" or dataset["lon"].units != "degrees_east"):
            raise ValueError("NASA grid is not expected regular global two-degree grid")
        weights, grid = grid_weights(lat, lon, None, mask)
        months, actual_calendar = monthly_values(dataset, field, weights)
        if actual_calendar != calendar:
            raise ValueError("Calendar interpretation changed")
        annual, offset, days = rebase(months)
        baseline = [row for row in months if 1981 <= row["year"] <= 2010]
        minimum_baseline = min(row["coverage"] for row in baseline)
        diagnostics = year_diagnostics(months, annual)
        original = json.loads((ROOT / "prototype" / "backend" / "private" / "data"
                               / "europe_pilot.json").read_text(encoding="utf-8"))
        if (annual != original["observations"]["annual"]
                or offset != original["observations"]["metadata"]["baseline_offset_K"]):
            raise ValueError("Audited history differs from original pilot calculation")
        independent_coverage = []
        independent_means = []
        for index in range(len(dates)):
            values = field[index]
            valid = ~np.ma.getmaskarray(values) & np.isfinite(np.ma.getdata(values))
            coverage = np.sum(weights[valid]) / np.sum(weights)
            independent_coverage.append(float(coverage))
            if months[index]["value"] is not None:
                mean = np.average(np.ma.getdata(values)[valid], weights=weights[valid])
                if not np.isclose(mean, months[index]["value"], rtol=0, atol=1e-12):
                    raise ValueError("Independent spatial reduction mismatch")
                independent_means.append(float(mean))
            else:
                independent_means.append(None)
        for point in annual:
            indices = [index for index, date in enumerate(dates)
                       if date.year == int(point["date"])]
            valid_year = len(indices) == 12 and all(independent_means[index] is not None
                                                   for index in indices)
            if valid_year != (point["value"] is not None):
                raise ValueError("Independent annual validity mismatch")
            if valid_year:
                expected = float(np.average([independent_means[index] for index in indices],
                                             weights=[dates[index].daysinmonth for index in indices])) - offset
                if not np.isclose(expected, point["value"], rtol=0, atol=1e-12):
                    raise ValueError("Independent annual reduction mismatch")
        annual_baseline = [row for row in annual if 1981 <= int(row["date"]) <= 2010]
        year_days = [sum(row["days"] for row in baseline if row["year"] == int(point["date"]))
                     for point in annual_baseline]
        reference_residual = float(np.average([point["value"] for point in annual_baseline],
                                              weights=year_days))
        if abs(reference_residual) > 1e-10:
            raise ValueError("Rebased historical reference does not average to zero")
        valid_years = [row["year"] for row in diagnostics if row["valid"]]
        # A time-varying mask changes spatial support, even when each month meets the threshold.
        eligible = (weights > 0) & np.all(
            np.stack([~np.ma.getmaskarray(field[index]) & np.isfinite(np.ma.getdata(field[index]))
                      for index, date in enumerate(dates) if 1981 <= date.year <= 2010]), axis=0)
        fixed_baseline_coverage = float(weights[eligible].sum() / weights.sum())
        metadata = {
            "history": dataset.history, "institution": dataset.institution,
            "calendar": calendar, "calendar_attribute_present": "calendar" in dataset["time"].ncattrs(),
            "cell_methods": field.cell_methods, "source_units": field.units,
            "scale_factor": float(field.scale_factor), "fill_value": int(field._FillValue),
            "spatial_bounds": "Inferred +/-1 degree from verified regular cell centres; source has no lat/lon bounds.",
        }
    return {
        "phase": "7C.4a", "status": "audit-passed-with-explicit-coverage-limitations",
        "scope": "Offline archived GISTEMP v4 land-air 250km product; no new climate download or release.",
        "source": {"file": str(compressed.relative_to(ROOT)), "sha256": sha256(compressed),
                   "netcdf_sha256": sha256(source), "retrieval": retrieval, "metadata": metadata},
        "mask": {"version": feature["properties"]["version"],
                 "sha256": sha256(ARCHIVE / "europe-mask-v1.geojson"), "grid": grid,
                 "matches_current_cmip6_pair": True},
        "coverage_threshold": COVERAGE, "monthly_count": len(months),
        "first_month": f"{dates[0].year:04}-{dates[0].month:02}",
        "last_month": f"{dates[-1].year:04}-{dates[-1].month:02}",
        "monthly_coverage_min": min(independent_coverage),
        "monthly_coverage_max": max(independent_coverage),
        "below_threshold_month_count": sum(row["value"] is None for row in months),
        "monthly_coverage": [{"date": f"{row['year']:04}-{row['month']:02}",
                              "coverage": row["coverage"], "valid": row["value"] is not None}
                             for row in months],
        "annual_valid_count": len(valid_years), "annual_invalid_count": len(annual) - len(valid_years),
        "valid_years": valid_years, "year_diagnostics": diagnostics,
        "baseline": {"years": [1981, 2010], "months": len(baseline), "days": days,
                     "minimum_monthly_coverage": minimum_baseline,
                     "fixed_cells_present_every_baseline_month_area_fraction": fixed_baseline_coverage,
                     "offset_K_anomaly": offset, "day_weighted_annual_residual": reference_residual,
                     "original_reference": [1951, 1980]},
        "original_pilot_values_exact_match": True,
        "independent_spatial_and_annual_reduction_passed": True,
        "limitations": [
            "Observation-derived gridded analysis with producer 250km smoothing, not raw station records and not reanalysis.",
            "No project interpolation. Producer smoothing/spatial inference remains part of GISTEMP.",
            "Coverage measures available gridded values over geometric land, not station density, observation independence or uncertainty.",
            "Available-area means have time-varying spatial support. Scalar regional rebasing is not cellwise monthly climatology rebasing.",
            "The 90% coverage threshold is the existing project pilot rule, not a claimed NASA/WMO completeness standard.",
            "Missing annual values stay missing; a partial final year is not a full-year mean.",
            "Same geographic mask does not imply identical grid or sampling operator as native CMIP6.",
            "No regional uncertainty interval was derived; two-model spread is not observational uncertainty.",
        ],
        "documentation": [
            {"file": "nasa-data.html", "sha256": sha256(ARCHIVE / "nasa-data.html"),
             "url": "https://data.giss.nasa.gov/gistemp/data_v4.html"},
            {"file": "nasa-use.html", "sha256": sha256(ARCHIVE / "nasa-use.html"),
             "note": "Archived GISS software page, not a product-specific licence proof."},
        ],
        "next_phase_7c4b": {
            "decision": "retain-NASA-for-local-observation-derived-history-with-gaps",
            "additional_climate_download_required": False,
            "ERA5": "Optional future independent reanalysis comparison, not a gap-filler or seamless extension; requires separate scope and byte approval.",
            "reason": "Existing source has a complete valid reference and reproduces the pilot; transparent gaps/coverage suffice for the local historical view.",
            "publication_gates": [
                "Display actual valid/invalid years and spatial coverage; do not imply complete 1880-present history.",
                "Label observational analysis, modelled history and any future reanalysis separately; do not join curves.",
                "Retain NASA/GISTEMP acknowledgement and verify product-use/citation terms from appropriate official documentation before public release.",
                "Approve any fixed-mask sensitivity or cellwise rebasing change separately; never silently alter pilot semantics.",
            ],
        },
        "implementation_sha256": {name: sha256(ROOT / "prototype" / "scripts" / name) for name in
                                  ("audit_europe_history.py", "build_europe_pilot.py")},
    }


def main():
    report = audit()
    OUTPUT.mkdir(parents=True, exist_ok=True)
    temporary = OUTPUT / "audit.json.tmp"
    temporary.write_text(json.dumps(report, indent=2, allow_nan=False) + "\n", encoding="utf-8")
    temporary.replace(OUTPUT / "audit.json")
    print(json.dumps({key: report[key] for key in
                      ("status", "first_month", "last_month", "annual_valid_count",
                       "annual_invalid_count", "below_threshold_month_count", "baseline",
                       "next_phase_7c4b")}, indent=2))


if __name__ == "__main__":
    main()
