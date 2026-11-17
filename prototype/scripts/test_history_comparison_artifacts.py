"""Persistent artifact contracts for the new independent historical views."""
import json
import math
import unittest
from pathlib import Path

from build_history_comparison import OUTPUT, PREVIOUS
from fetch_cmip6_europe_pair import sha256


class HistoryArtifactsTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.bundle = json.loads((OUTPUT / "history_comparison_v1.json").read_text(encoding="utf-8"))
        cls.validation = json.loads((OUTPUT / "validation.json").read_text(encoding="utf-8"))

    def test_manifest_and_implementation_pins(self):
        manifest = json.loads((OUTPUT / "outputs.json").read_text(encoding="utf-8"))
        for row in manifest["files"]:
            path = OUTPUT / row["file"]
            self.assertEqual(path.stat().st_size, row["bytes"])
            self.assertEqual(sha256(path), row["sha256"])
        scripts = Path(__file__).parent
        self.assertEqual(self.bundle["provenance"]["implementation_sha256"],
                         sha256(scripts / "build_history_comparison.py"))
        self.assertEqual(self.validation["validator_sha256"],
                         sha256(scripts / "validate_history_comparison.py"))
        self.assertEqual(self.bundle["provenance"]["previous_bundle_sha256"],
                         sha256(PREVIOUS / "continental_temperatures_v1.json"))

    def test_independent_raw_reference_proof_and_common_period(self):
        self.assertTrue(self.validation["status"].startswith("PASS-"))
        self.assertEqual(self.validation["source_global_tiling"], "PASS")
        proof = self.validation["independent_raw_proof"]
        self.assertEqual(len(proof), 7)
        self.assertTrue(all(p["reference_months"] == 360 and len(p["annual_scalar_checks"]) == 5
                            for p in proof))
        self.assertTrue(all(p["independent_exploratory"]["reference_months"] == 360
                            and len(p["independent_exploratory"]["annual_scalar_checks"]) == 5
                            for p in proof))
        self.assertEqual(self.bundle["common_period"]["start"], 1926)
        self.assertEqual(self.bundle["common_period"]["end"], 2025)
        self.assertEqual(len(self.validation["fixed_footprint_sensitivity"]), 6)

    def test_two_views_remain_separate_and_no_partial_year_or_antarctic_certification(self):
        self.assertFalse(self.bundle["publication_allowed"])
        for region in self.bundle["regions"]:
            for view in ("conservative", "exploratory"):
                points = region[view]["annual"]
                self.assertEqual([p["date"] for p in points], [str(y) for y in range(1880, 2027)])
                self.assertIsNone(points[-1]["value"])
                self.assertIn("incomplete-source-year", points[-1]["missing_reasons"])
            self.assertTrue(all(p["spatial_estimate_fraction"] == 0
                                and p["temporal_estimate_fraction"] == 0
                                for p in region["conservative"]["annual"]))
        antarctica = self.bundle["regions"][-1]
        self.assertEqual(antarctica["id"], "antarctica")
        self.assertEqual(antarctica["status"], "provisional-geography")
        self.assertTrue(all(p["value"] is None for p in antarctica["conservative"]["annual"]))
        valid = [p for p in antarctica["exploratory"]["annual"] if p["value"] is not None]
        self.assertEqual((valid[0]["date"], valid[-1]["date"]), ("1958", "2025"))

    def test_estimates_have_explicit_disjoint_area_shares(self):
        estimates = 0
        for region in self.bundle["regions"]:
            for point in region["exploratory"]["annual"]:
                self.assertAlmostEqual(point["coverage"], point["source_coverage"]
                                       + point["spatial_estimate_fraction"]
                                       + point["temporal_estimate_fraction"])
                if point["value"] is not None:
                    self.assertTrue(math.isfinite(point["value"]))
                    self.assertFalse(point["missing_reasons"])
                    if point["spatial_estimate_fraction"] + point["temporal_estimate_fraction"] > 1e-12:
                        self.assertEqual(point["status"], "estimated")
                        estimates += 1
        self.assertGreater(estimates, 0)

    def test_holdout_errors_not_hidden_or_claimed_as_confidence(self):
        validation = self.bundle["validation"]
        for key in ("temporal_holdout", "temporal_two_month_holdout", "spatial_holdout"):
            self.assertGreater(validation[key]["count"], 0)
            self.assertGreaterEqual(validation[key]["rmse_degC"], validation[key]["mae_degC"])
        self.assertGreater(validation["temporal_holdout"]["mae_degC"], .8)
        self.assertIn("not confidence", validation["note"]["en"])


if __name__ == "__main__":
    unittest.main()
