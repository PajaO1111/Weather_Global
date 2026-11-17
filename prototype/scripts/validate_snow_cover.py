"""Independently verify every product value against archived Rutgers text."""
import hashlib
import json
import math
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DIRECTORY = ROOT / "data_samples/2026-11-06/snow-cover-7d3"


def require(condition, message):
    if not condition:
        raise ValueError(message)


def validate():
    manifest_bytes = (DIRECTORY / "source-manifest.json").read_bytes()
    manifest = json.loads(manifest_bytes)
    for row in manifest["sources"]:
        require(Path(row["file"]).name == row["file"], "Unsafe archive path")
        raw = (DIRECTORY / "sources" / row["file"]).read_bytes()
        require(len(raw) == row["bytes"] and hashlib.sha256(raw).hexdigest() == row["sha256"],
                f"Changed source {row['file']}")
    raw_product = (DIRECTORY / "snow_cover_v1.json").read_bytes()
    product = json.loads(raw_product)
    catalog = json.loads((DIRECTORY / "catalog.json").read_text(encoding="utf-8"))
    require(len(raw_product) == catalog["product"]["bytes"]
            and hashlib.sha256(raw_product).hexdigest() == catalog["product"]["sha256"],
            "Product checksum mismatch")
    require(product["provenance"]["manifest_sha256"] == hashlib.sha256(manifest_bytes).hexdigest(),
            "Wrong source snapshot")
    require(product["provenance"]["builder_sha256"] == hashlib.sha256(
        (ROOT / "prototype/scripts/build_snow_cover.mjs").read_bytes()).hexdigest(),
        "Changed builder")
    require(product["unit"] == "km2" and product["source"]["confidence_level"] is None,
            "Misrepresented snow unit/uncertainty")
    expected_gaps = {"1968-07", "1969-06", "1969-07", "1969-08", "1969-09",
                     "1969-10", "1971-07", "1971-08", "1971-09"}
    definitions = [("nh", "nhland"), ("eurasia", "eurasia"),
                   ("na-greenland", "namgnld"), ("na", "nam")]
    checked = 0
    sources = []
    for region, (identity, suffix) in zip(product["regions"], definitions):
        require(region["id"] == identity and region["source_file"] == f"moncov.{suffix}.txt",
                "Changed regional identity")
        rows = [tuple(map(int, line.split())) for line in
                (DIRECTORY / "sources" / f"moncov.{suffix}.txt").read_text().splitlines() if line.strip()]
        original = {f"{year:04d}-{month:02d}": value for year, month, value in rows}
        require(len(original) == len(rows) == 711, "Unexpected source rows")
        require(list(original)[0] == "1966-11" and list(original)[-1] == "2026-10",
                "Unexpected source period")
        require(len(region["points"]) == 720 and len(region["spring"]) == 61,
                "Incomplete product axis")
        missing = set()
        for index, point in enumerate(region["points"]):
            year, month0 = divmod(1966 * 12 + 10 + index, 12)
            date = f"{year:04d}-{month0 + 1:02d}"
            require(point["date"] == date, "Shifted or duplicated calendar month")
            value = original.get(date)
            require(point["extent"] == value, f"Source mismatch {identity}/{date}")
            if value is None:
                missing.add(date)
                require(point["anomaly"] is None and point["reason"] == "missing-source",
                        "Filled source gap")
            else:
                require(point["reason"] is None, "False missing reason")
            checked += 1
        require(missing == expected_gaps, "Unexpected missing dates")
        means = {}
        for month in range(1, 13):
            values = [value for (year, m, value) in rows if 1981 <= year <= 2010 and m == month]
            require(len(values) == 30, "Incomplete reference")
            means[str(month)] = sum(values) / 30
        spring_values = {}
        for year in range(1966, 2027):
            selected = [original.get(f"{year}-{month:02d}") for month in (3, 4, 5)]
            value = None if any(v is None for v in selected) else sum(
                v * days for v, days in zip(selected, (31, 30, 31))) / 92
            spring = region["spring"][year - 1966]
            require(spring["year"] == year, "Shifted spring")
            if value is None:
                require(spring["extent"] is None and spring["anomaly"] is None
                        and spring["reason"] == "incomplete-MAM", "Filled incomplete spring")
            else:
                require(abs(spring["extent"] - value) < 0.000002 and spring["reason"] is None,
                        "Incorrect day-weighted spring")
                spring_values[year] = value
        means["MAM"] = sum(spring_values[year] for year in range(1981, 2011)) / 30
        require(len(region["reference"]) == 13, "Missing reference")
        for ref in region["reference"]:
            require(ref["count"] == 30 and abs(ref["mean"] - means[ref["period"]]) < 0.000002,
                    "Reference mismatch")
        for point in region["points"]:
            if point["extent"] is not None:
                reference = means[str(int(point["date"][5:]))]
                require(math.isclose(point["anomaly"], point["extent"] - reference, abs_tol=0.000002),
                        "Monthly departure mismatch")
        for point in region["spring"]:
            if point["extent"] is not None:
                require(abs(point["anomaly"] - (point["extent"] - means["MAM"])) < 0.000002,
                        "Spring departure mismatch")
        sources.append(original)
    require(len(product["regions"]) == 4, "Unexpected regions")
    closure = [sources[0][date] - sources[1][date] - sources[2][date] for date in sources[0]]
    require(max(map(abs, closure)) <= 1, "Producer hemisphere/regional closure differs by >1 km2")
    require(all(sources[3][date] <= sources[2][date] for date in sources[0]),
            "Invalid Greenland inclusion")
    report = {
        "schema_version": 1, "status": "PASS-independent-all-producer-months",
        "checked_month_records": checked, "checked_original_values": sum(map(len, sources)),
        "missing_months_per_region": sorted(expected_gaps), "checked_spring_records": 244,
        "checked_reference_means": 52, "regional_closure_max_abs_km2": max(map(abs, closure)),
        "artifact_sha256": hashlib.sha256(raw_product).hexdigest(),
        "validator_sha256": hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
        "method": "Independent Python raw-text parsing and unrounded reference/spring calculations; no shared JS helpers",
    }
    (DIRECTORY / "validation.json").write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(f"PASS: {checked} month records, {sum(map(len, sources))} original values, 244 springs, 52 references")


if __name__ == "__main__":
    validate()
