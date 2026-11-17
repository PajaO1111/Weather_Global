"""Independent raw-CSV verification of the 7D.1 Node-produced sea ice bundle."""
import csv
import hashlib
import io
import json
import math
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
OUTPUT = ROOT / "data_samples/2026-11-06/sea-ice-7d1"
EVIDENCE = ROOT / "data_samples/2026-11-06/phase7d-feasibility"


def digest(content):
    return hashlib.sha256(content).hexdigest()


def verify():
    bundle_bytes = (OUTPUT / "sea_ice_v1.json").read_bytes()
    bundle = json.loads(bundle_bytes)
    catalog = json.loads((OUTPUT / "catalog.json").read_bytes())
    manifest_bytes = (EVIDENCE / "source-manifest.json").read_bytes()
    manifest = json.loads(manifest_bytes)
    assert catalog["product"]["bytes"] == len(bundle_bytes)
    assert catalog["product"]["sha256"] == digest(bundle_bytes)
    assert bundle["provenance"]["manifest_sha256"] == digest(manifest_bytes)
    assert bundle["provenance"]["builder_sha256"] == digest(
        (ROOT / "prototype/scripts/build_sea_ice.mjs").read_bytes())
    assert bundle["unit"] == "million km2" and bundle["publication_allowed"] is False
    assert bundle["reference_period"] == {
        "first": 1981, "last": 2010, "method": "available-calendar-month-mean-no-fill"}
    assert bundle["period"] == {"first": "1978-11", "last": "2026-10"}
    checked_points = 0
    checked_references = 0
    selected_checks = []
    for region_id in ("N", "S"):
        region = next(region for region in bundle["regions"] if region["id"] == region_id)
        originals = {}
        for month in range(1, 13):
            name = f"{region_id}_{month:02d}_extent_v4.0.csv"
            source_bytes = (EVIDENCE / "sources" / name).read_bytes()
            archived = next(row for row in manifest["sources"] if row["file"] == name)
            provenance = next(row for row in bundle["provenance"]["files"] if row["file"] == name)
            assert archived["sha256"] == provenance["sha256"] == digest(source_bytes)
            assert archived["bytes"] == provenance["bytes"] == len(source_bytes)
            assert archived["url"] == provenance["url"]
            rows = list(csv.DictReader(io.StringIO(source_bytes.decode("utf-8")), skipinitialspace=True))
            for row in rows:
                date = f"{int(row['year']):04d}-{int(row['mo']):02d}"
                assert date not in originals and row["region"].strip() == region_id
                assert int(row["mo"]) == month
                value = float(row["extent"])
                originals[date] = (None if value == -9999 else value, row["source_dataset"].strip())
            valid = [float(row["extent"]) for row in rows if
                     1981 <= int(row["year"]) <= 2010 and float(row["extent"]) != -9999]
            reference = region["reference"][month - 1]
            assert reference["month"] == month and reference["count"] == len(valid)
            assert len(valid) == (29 if month in (1, 12) else 30)
            raw_mean = math.fsum(valid) / len(valid)
            assert abs(reference["mean"] - raw_mean) <= 0.00000051
            assert reference["missing_years"] == ([1988] if month == 1 else [1987] if month == 12 else [])
            checked_references += 1
        expected_axis = [f"{year:04d}-{month:02d}" for year in range(1978, 2027)
                         for month in range(1, 13) if "1978-11" <= f"{year:04d}-{month:02d}" <= "2026-10"]
        assert [point["date"] for point in region["points"]] == expected_axis
        assert set(originals) == set(expected_axis)
        for point in region["points"]:
            value, source_id = originals[point["date"]]
            assert point["extent"] == value
            if value is None:
                assert point["anomaly"] is None and point["reason"] == "missing-source"
                assert point["source_dataset"] is None and source_id == "-9999"
            else:
                assert point["source_dataset"] == source_id and point["reason"] is None
                mean = region["reference"][int(point["date"][5:]) - 1]["mean"]
                assert abs(point["anomaly"] - (value - mean)) <= 0.00000051
            checked_points += 1
            if point["date"] in ("1978-11", "1987-12", "1988-01", "2012-09", "2024-05", "2026-10"):
                selected_checks.append({"region": region_id, **point})
    report = {
        "status": "PASS-independent-all-raw-months-and-references",
        "publication_allowed": False,
        "artifact_sha256": digest(bundle_bytes),
        "builder_sha256": bundle["provenance"]["builder_sha256"],
        "validator_sha256": digest(Path(__file__).read_bytes()),
        "checked_points": checked_points, "checked_references": checked_references,
        "selected_checks": selected_checks,
        "limits": [
            "Verifies transformation of published NSIDC monthly extent, not independent satellite retrieval accuracy.",
            "No project filling, annual means, daily minima, volume, mass or probability intervals.",
            "Monthly project reference has 29 values for January/December and 30 otherwise.",
        ],
    }
    (OUTPUT / "validation.json").write_text(json.dumps(report, indent=2, allow_nan=False) + "\n", encoding="utf-8")
    print(f"PASS: {checked_points} monthly records and {checked_references} monthly references")


if __name__ == "__main__":
    verify()
