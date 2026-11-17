"""Build a versioned local NASA history artifact only after a fresh offline audit."""
import json
import math

from audit_europe_history import OUTPUT as AUDIT_DIRECTORY, audit
from build_europe_pilot import COVERAGE
from fetch_cmip6_europe_pair import ROOT, sha256

OUTPUT = ROOT / "data_samples" / "2026-11-06" / "europe-history"
ARTIFACT = OUTPUT / "europe_history_v1.json"
PILOT = ROOT / "prototype" / "backend" / "private" / "data" / "europe_pilot.json"


def annual_record(point, diagnostic):
    if point["date"] != str(diagnostic["year"]):
        raise ValueError("Annual point/diagnostic year mismatch")
    if point["coverage"] != diagnostic["minimum_coverage"]:
        raise ValueError("Annual point/diagnostic coverage mismatch")
    absent = diagnostic["absent_source_months"]
    below = diagnostic["below_coverage_months"]
    if (any(type(month) is not int or not 1 <= month <= 12 for month in [*absent, *below])
            or absent != sorted(set(absent)) or below != sorted(set(below))
            or set(absent) & set(below) or diagnostic["source_months"] != 12 - len(absent)
            or not math.isfinite(point["coverage"]) or not 0 <= point["coverage"] <= 1):
        raise ValueError("Invalid annual coverage diagnostics")
    reasons = []
    if absent:
        reasons.append("incomplete-source-year")
    if below:
        reasons.append("insufficient-spatial-coverage")
    valid = not reasons
    if (diagnostic["valid"] is not valid or (point["value"] is not None) != valid
            or (valid and (not math.isfinite(point["value"]) or point["coverage"] < COVERAGE))
            or bool(below) != (point["coverage"] + 1e-12 < COVERAGE)):
        raise ValueError("Annual validity contradicts coverage or missing-month diagnostics")
    return {
        "date": point["date"], "value": point["value"], "status": "valid" if valid else "missing",
        "missing_reasons": reasons, "minimum_monthly_coverage": point["coverage"],
        "source_months": diagnostic["source_months"],
        "absent_source_months": list(absent), "below_coverage_months": list(below),
    }


def build():
    report = audit()
    audit_path = AUDIT_DIRECTORY / "audit.json"
    if report != json.loads(audit_path.read_text(encoding="utf-8")):
        raise ValueError("Fresh audit differs from archived 7C.4a/b evidence; review and regenerate audit first")
    if (report["status"] != "audit-passed-with-explicit-coverage-limitations"
            or report["next_phase_7c4b"]["decision"]
            != "retain-NASA-for-local-observation-derived-history-with-gaps"):
        raise ValueError("NASA source selection or audit not approved for local history")
    # The fresh audit independently verifies every pilot annual value against the archived NetCDF.
    original = json.loads(PILOT.read_text(encoding="utf-8"))["observations"]["annual"]
    diagnostics = report["year_diagnostics"]
    first, last = int(report["first_month"][:4]), int(report["last_month"][:4])
    expected_dates = [str(year) for year in range(first, last + 1)]
    if ([point["date"] for point in original] != expected_dates
            or [str(row["year"]) for row in diagnostics] != expected_dates):
        raise ValueError("Incomplete or reordered annual history/diagnostics")
    annual = [annual_record(point, row) for point, row in zip(original, diagnostics)]
    valid = [point for point in annual if point["status"] == "valid"]
    missing = [point for point in annual if point["status"] == "missing"]
    if (len(valid) != report["annual_valid_count"] or len(missing) != report["annual_invalid_count"]
            or [int(point["date"]) for point in valid] != report["valid_years"]):
        raise ValueError("Historical counts differ from audit")
    return {
        "schema_version": 1, "version": "7c4c-europe-nasa-history-v1",
        "status": "local-observation-derived-history-not-public-release",
        "region": "Europe custom physical land mask, not EU27",
        "series_type": "observation-derived-gridded-analysis",
        "provider": "NASA GISS", "product": "GISTEMP v4 GHCNv4 land-air, 250km smoothing, IOCEAN=none",
        "unit": "degC anomaly", "source_unit": "K anomaly",
        "baseline": report["baseline"],
        "calendar": report["source"]["metadata"]["calendar"],
        "source_period": {"first_month": report["first_month"], "last_month": report["last_month"],
                          "monthly_count": report["monthly_count"]},
        "annual_period": [first, last],
        "summary": {
            "annual_count": len(annual), "valid_count": len(valid), "missing_count": len(missing),
            "valid_years": report["valid_years"],
            "missing_years": [int(point["date"]) for point in missing],
        },
        "annual": annual,
        "monthly_coverage": report["monthly_coverage"],
        "mask": report["mask"],
        "coverage": {
            "threshold": COVERAGE, "minimum_monthly": report["monthly_coverage_min"],
            "maximum_monthly": report["monthly_coverage_max"],
            "below_threshold_month_count": report["below_threshold_month_count"],
            "definition": "Fraction of geometric Europe land area with unmasked finite source grid values; not station density or uncertainty.",
        },
        "method": {
            "spatial": "Geometric Europe land/cell intersection area weights on verified regular 2-degree grid; normalize over available area each month. No model sftlf applied.",
            "baseline": "Subtract one source-calendar-day-weighted regional 1981-2010 mean from source 1951-1980 anomalies; not cellwise monthly climatology rebasing.",
            "annual": "Source-calendar month-duration weighted mean; all 12 months must exist and meet the project area-coverage threshold.",
            "missing": "Preserve null with explicit reasons. No interpolation, partial-year annual estimate, or model/reanalysis gap filling.",
            "uncertainty": "No observational uncertainty interval calculated. Model min/max is not observational uncertainty.",
            "modifications": ["Custom land-mask aggregation", "Regional reference shift to 1981-2010",
                              "Day-weighted annual reduction", "Explicit gap and coverage annotation"],
        },
        "limitations": report["limitations"],
        "source": report["source"],
        "documentation": report["documentation"],
        "attribution": "NASA GISS / GISTEMP Team; GHCNv4 station-based surface-air analysis. Custom European aggregation and rebasing are project processing, not an official NASA European series or endorsement.",
        "usage_review": {
            "status": "official-product-use-and-citation-verification-required-before-publication",
            "note": "Do not assign the CMIP6 CC-BY-SA or CDS CC-BY licence to this NASA source by inheritance.",
            "source_documentation_url": "https://data.giss.nasa.gov/gistemp/data_v4.html",
        },
        "publication_gates": report["next_phase_7c4b"]["publication_gates"],
        "provenance": {
            "audit_file": str(audit_path.relative_to(ROOT)), "audit_sha256": sha256(audit_path),
            "pilot_file": str(PILOT.relative_to(ROOT)), "pilot_sha256": sha256(PILOT),
            "independent_source_audit_passed": report["independent_spatial_and_annual_reduction_passed"],
            "implementation_sha256": {
                **report["implementation_sha256"],
                "build_europe_history.py": sha256(ROOT / "prototype" / "scripts" / "build_europe_history.py"),
            },
        },
    }


def serialize(artifact):
    return (json.dumps(artifact, ensure_ascii=False, allow_nan=False, separators=(",", ":")) + "\n").encode("utf-8")


def main():
    artifact = build()
    content = serialize(artifact)
    OUTPUT.mkdir(parents=True, exist_ok=True)
    temporary = ARTIFACT.with_suffix(".json.tmp")
    temporary.write_bytes(content)
    temporary.replace(ARTIFACT)
    print(f"Built {ARTIFACT}; bytes={len(content)}; SHA-256={sha256(ARTIFACT)}")
    print(f"Annual points={artifact['summary']['annual_count']}; "
          f"valid={artifact['summary']['valid_count']}; missing={artifact['summary']['missing_count']}")


if __name__ == "__main__":
    main()
