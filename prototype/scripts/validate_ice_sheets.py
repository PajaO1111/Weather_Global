"""Verify the public NASA chart transformation independently of the JS parser."""
import hashlib
import json
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
PRODUCT = ROOT / "data_samples/2026-11-06/ice-sheets-7d2"


def sha(content):
    return hashlib.sha256(content).hexdigest()


def verify():
    manifest_bytes = (PRODUCT / "source-manifest.json").read_bytes()
    manifest = json.loads(manifest_bytes)
    original_files = {}
    for row in manifest["sources"]:
        if row["status"] != "archived":
            continue
        content = (PRODUCT / "sources" / row["file"]).read_bytes()
        assert sha(content) == row["sha256"] and len(content) == row["bytes"]
        original_files[row["file"]] = content
    content = (PRODUCT / "ice_sheets_v1.json").read_bytes()
    bundle = json.loads(content)
    catalog = json.loads((PRODUCT / "catalog.json").read_bytes())
    assert catalog["product"]["sha256"] == sha(content) and catalog["product"]["bytes"] == len(content)
    assert bundle["provenance"]["manifest_sha256"] == sha(manifest_bytes)
    assert bundle["provenance"]["builder_sha256"] == sha(
        (ROOT / "prototype/scripts/build_ice_sheets.mjs").read_bytes())
    assert bundle["source_product"] == "NASA-Earth-Indicator-public-chart"
    assert bundle["publication_allowed"] is False and bundle["unit"] == "Gt"
    assert bundle["reference"] == {
        "id": "published-chart-zero-preserved", "anchor_month": "2002-04",
        "mean_period": None, "rebased_by_project": False}
    assert bundle["uncertainty"] == {
        "kind": "published-chart-lower-upper", "confidence_level": None, "recomputed": False}
    assert bundle["period"] == {"first": "2002-04-16", "last": "2026-07-17"}
    summaries = []
    checked = 0
    for region_id in ("greenland", "antarctica"):
        raw = json.loads(original_files[f"{region_id}.json"])
        region = next(region for region in bundle["regions"] if region["id"] == region_id)
        assert region["source"]["chart_id"] == raw["chart_id"]
        assert region["source"]["chart_updated"] == raw["chart"]["updated_at"]
        assert region["source"]["sha256"] == sha(original_files[f"{region_id}.json"])
        assert len(region["points"]) == len(raw["items"]) == 260
        times = []
        valid = []
        nulls = []
        for item, point in zip(raw["items"], region["points"]):
            source_date = date(item["year"], item["month"], item["day"]).isoformat()
            assert point["date"] == source_date
            assert point["source_id"] == item["id"] and point["source_time"] == item["x"]
            assert point["value"] == item["y"]
            assert point["lower"] == item["y_margin_min"] and point["upper"] == item["y_margin_max"]
            assert item["units"] == "Gt" and item["status"] == 1
            if item["y"] is None:
                assert point["lower"] is None and point["upper"] is None
                assert point["mission"] is None and point["reason"] == "between-missions"
                assert source_date == "2017-12-11" and point["source_time"] == 2017.945
                nulls.append(source_date)
            else:
                assert point["lower"] <= point["value"] <= point["upper"]
                assert point["reason"] is None
                assert point["mission"] == ("GRACE" if source_date <= "2017-06-30" else "GRACE-FO")
                valid.append(point)
            times.append(item["x"])
            checked += 1
        assert all(first < last for first, last in zip(times, times[1:]))
        assert len(set(point["source_id"] for point in region["points"])) == 260
        assert len(valid) == 259 and nulls == ["2017-12-11"]
        assert valid[0]["value"] == 0 and valid[0]["date"] == "2002-04-16"
        assert len([point for point in valid if point["date"].startswith("2011-10")]) == 2
        gaps = [{"before": first["date"], "after": last["date"]}
                for first, last in zip(valid, valid[1:])
                if last["source_time"] - first["source_time"] > 0.125]
        assert len(gaps) == 19
        assert {"before": "2017-06-10", "after": "2018-06-14"} in gaps
        summaries.append({
            "id": region_id, "records": 260, "valid": 259, "source_nulls": nulls,
            "long_intervals": gaps, "first": valid[0], "last": valid[-1],
            "duplicate_calendar_months_preserved": ["2011-10", "2012-01", "2015-04", "2017-04"],
        })
    report = {
        "status": "PASS-independent-all-public-chart-records",
        "publication_allowed": False, "artifact_sha256": sha(content),
        "validator_sha256": sha(Path(__file__).read_bytes()),
        "builder_sha256": bundle["provenance"]["builder_sha256"],
        "checked_records": checked, "checked_valid_mass_values": 518,
        "regions": summaries,
        "limits": [
            "Verifies exact public chart transformation, not original satellite retrieval accuracy.",
            "Chart JSON has no confidence level or full re-zeroing/covariance documentation.",
            "No rebasing, calendar aggregation, gap filling, GIA re-correction or sea-level conversion.",
            "Long-interval 0.125 decimal-year rule is a display break, not an observational product.",
        ],
    }
    (PRODUCT / "validation.json").write_text(json.dumps(report, indent=2, allow_nan=False) + "\n", encoding="utf-8")
    print(f"PASS: {checked} original records, 518 mass values with bounds; both mission gaps and irregular epochs preserved")


if __name__ == "__main__":
    verify()
