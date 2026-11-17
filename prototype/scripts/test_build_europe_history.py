"""Versioned historical artifact contract and independent-source integration checks."""
import copy
import json
import unittest
from unittest.mock import patch

from build_europe_history import ARTIFACT, PILOT, annual_record, build, serialize
from build_europe_pilot import ARCHIVE
from fetch_cmip6_europe_pair import ROOT, sha256


def sample():
    return ({"date": "2000", "value": 0.5, "coverage": 0.96},
            {"year": 2000, "valid": True, "minimum_coverage": 0.96,
             "source_months": 12, "absent_source_months": [], "below_coverage_months": []})


class HistoryArtifactTests(unittest.TestCase):
    def test_valid_record_preserves_value_and_coverage(self):
        point, diagnostic = sample()
        row = annual_record(point, diagnostic)
        self.assertEqual(row["value"], 0.5)
        self.assertEqual(row["status"], "valid")
        self.assertEqual(row["missing_reasons"], [])
        self.assertEqual(row["minimum_monthly_coverage"], 0.96)

    def test_coverage_gap_and_incomplete_year_have_distinct_reasons(self):
        point, diagnostic = sample()
        point.update(value=None, coverage=0.8)
        diagnostic.update(valid=False, minimum_coverage=0.8, below_coverage_months=[2])
        self.assertEqual(annual_record(point, diagnostic)["missing_reasons"],
                         ["insufficient-spatial-coverage"])
        point["coverage"] = 0.96
        diagnostic.update(minimum_coverage=0.96, source_months=9,
                          absent_source_months=[10, 11, 12], below_coverage_months=[])
        self.assertEqual(annual_record(point, diagnostic)["missing_reasons"],
                         ["incomplete-source-year"])
        point["coverage"] = 0.8
        diagnostic.update(minimum_coverage=0.8, below_coverage_months=[2])
        self.assertEqual(len(annual_record(point, diagnostic)["missing_reasons"]), 2)

    def test_inconsistent_or_invalid_records_fail_explicitly(self):
        for mutate in [
            lambda p, d: p.update(value=None),
            lambda p, d: p.update(value=float("nan")),
            lambda p, d: p.update(coverage=float("inf")),
            lambda p, d: p.update(date="2001"),
            lambda p, d: d.update(source_months=9),
            lambda p, d: d.update(absent_source_months=[13]),
            lambda p, d: d.update(valid=False),
            lambda p, d: d.update(minimum_coverage=0.8),
        ]:
            point, diagnostic = sample()
            mutate(point, diagnostic)
            with self.assertRaises(ValueError):
                annual_record(point, diagnostic)

    def test_json_rejects_nonfinite_numbers(self):
        with self.assertRaises(ValueError):
            serialize({"value": float("nan")})
        self.assertEqual(serialize({"value": None}), b'{"value":null}\n')

    @unittest.skipUnless((ARCHIVE / "gistemp250_GHCNv4.nc").exists(),
                         "Local archived NASA source not present")
    def test_full_build_is_deterministic_matches_pilot_and_has_all_gap_reasons(self):
        artifact = build()
        if ARTIFACT.exists():
            saved = json.loads(ARTIFACT.read_text(encoding="utf-8"))
            self.assertEqual(saved, artifact)
            self.assertEqual(serialize(saved), serialize(artifact))
        self.assertEqual(artifact["summary"]["valid_years"], list(range(1894, 2026)))
        self.assertEqual(artifact["summary"]["annual_count"], 147)
        self.assertEqual(artifact["summary"]["valid_count"], 132)
        self.assertEqual(artifact["summary"]["missing_count"], 15)
        self.assertEqual(artifact["source_period"]["monthly_count"], 1761)
        original = json.loads(PILOT.read_text(encoding="utf-8"))["observations"]["annual"]
        for row, point in zip(artifact["annual"], original):
            self.assertEqual(row["value"], point["value"])
            self.assertEqual(row["minimum_monthly_coverage"], point["coverage"])
            if int(row["date"]) < 1894:
                self.assertIsNone(row["value"])
                self.assertEqual(row["missing_reasons"], ["insufficient-spatial-coverage"])
        self.assertEqual(artifact["annual"][-1]["absent_source_months"], [10, 11, 12])
        self.assertEqual(artifact["annual"][-1]["missing_reasons"], ["incomplete-source-year"])
        self.assertIsNone(artifact["annual"][-1]["value"])
        self.assertEqual(artifact["baseline"]["years"], [1981, 2010])
        self.assertEqual(artifact["baseline"]["days"], 10957)
        for key in ("audit", "pilot"):
            self.assertEqual(artifact["provenance"][f"{key}_sha256"],
                             sha256(ROOT / artifact["provenance"][f"{key}_file"]))
        self.assertNotIn("license", artifact)
        self.assertIn("not-public-release", artifact["status"])
        self.assertNotIn("range", artifact)

    @unittest.skipUnless((ARCHIVE / "gistemp250_GHCNv4.nc").exists(),
                         "Local archived NASA source not present")
    def test_stale_audit_blocks_build(self):
        from audit_europe_history import OUTPUT
        report = json.loads((OUTPUT / "audit.json").read_text(encoding="utf-8"))
        changed = copy.deepcopy(report)
        changed["annual_valid_count"] -= 1
        with patch("build_europe_history.audit", return_value=changed):
            with self.assertRaisesRegex(ValueError, "Fresh audit differs"):
                build()


if __name__ == "__main__":
    unittest.main()
