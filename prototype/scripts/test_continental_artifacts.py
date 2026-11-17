"""Persisted 7C checks, including independent baseline proof and legacy identity."""
import json
import unittest
from pathlib import Path

from continental_weights import OUTPUT
from fetch_cmip6_europe_pair import OUTPUT as PAIR, ROOT, sha256
from validate_continental_temperatures import validate_shape


class ContinentalArtifactTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.bundle = json.loads((OUTPUT / "continental_temperatures_v1.json").read_text(encoding="utf-8"))
        cls.validation = json.loads((OUTPUT / "validation.json").read_text(encoding="utf-8"))

    def test_scientific_contract(self):
        validate_shape(self.bundle)

    def test_manifest_catalog_and_implementation(self):
        manifest = json.loads((OUTPUT / "outputs.json").read_text(encoding="utf-8"))
        for row in manifest["files"]:
            with self.subTest(file=row["file"]):
                path = OUTPUT.joinpath(*row["file"].split("/"))
                self.assertEqual(path.stat().st_size, row["bytes"])
                self.assertEqual(sha256(path), row["sha256"])
        catalog = json.loads((OUTPUT / "catalog.json").read_text(encoding="utf-8"))
        self.assertEqual(catalog["product"]["sha256"], sha256(OUTPUT / "continental_temperatures_v1.json"))
        for name, pin in self.bundle["provenance"]["implementation_sha256"].items():
            self.assertEqual(sha256(Path(__file__).with_name(name)), pin)
        self.assertEqual(self.validation["validator_sha256"],
                         sha256(Path(__file__).with_name("validate_continental_temperatures.py")))

    def test_no_legacy_mutation_or_unapproved_publication(self):
        self.assertFalse(self.bundle["publication_allowed"])
        self.assertFalse(self.validation["publication_allowed"])
        for row in self.bundle["provenance"]["legacy_climate_unchanged"]:
            self.assertEqual(sha256(PAIR.parent / row["file"]), row["sha256"])
        for region in self.bundle["regions"]:
            self.assertFalse(region["publication_allowed"])
        antarctica = self.bundle["regions"][-1]
        self.assertEqual(antarctica["status"], "blocked-grounding")
        self.assertIsNone(antarctica["history"])
        self.assertEqual(antarctica["models"], [])

    def test_independent_raw_source_and_full_reference_checks(self):
        self.assertEqual(len(self.validation["independent_raw_cell_checks"]), 11)
        for row in self.validation["independent_raw_cell_checks"]:
            with self.subTest(source=row["source_id"], experiment=row.get("experiment")):
                self.assertLess(row["maximum_absolute_error_degC"], 1e-10)
                if row["source_id"] == "NASA" or row["experiment"] == "historical":
                    self.assertTrue(set(range(1981, 2011)) <= set(row["years"]))
                    self.assertLess(row["independent_baseline_residual_degC"], 1e-10)

    def test_europe_is_recomputed_not_just_relabelled(self):
        comparison = self.bundle["legacy_comparison"]["europe"]
        self.assertFalse(comparison["legacy_mask_valid"])
        self.assertTrue(comparison["old_files_preserved"])
        self.assertIn("v3", comparison["new_mask_version"])
        for model in comparison["models"]:
            self.assertGreater(abs(model["baseline_temperature_change_K"]), .01)
            self.assertGreater(model["historical"]["maximum_absolute_change_degC"], .001)
        self.assertGreater(comparison["history"]["maximum_absolute_change_degC"], .001)

    def test_climate_and_source_evidence_provenance(self):
        for region in self.bundle["regions"][:-1]:
            for model in region["models"]:
                for source in model["sources"]:
                    self.assertEqual(sha256(ROOT / source["local_path"]), source["sha256"])
            source = region["history"]["source"]
            self.assertEqual(sha256(ROOT / source["file"]), source["sha256"])
        review = self.bundle["source_review"]
        self.assertEqual(sha256(ROOT / review["file"]), review["sha256"])


if __name__ == "__main__":
    unittest.main()
