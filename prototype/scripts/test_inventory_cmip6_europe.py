"""Metadata interval checks do not need network or downloaded fields."""
import unittest

from inventory_cmip6_europe import summarize


def doc(period, size=100):
    return {"title": f"tas_Amon_MODEL_historical_r1i1p1f1_gn_{period}.nc",
            "size": size, "id": f"MODEL.{period}", "url": [],
            "checksum": ["abc"], "checksum_type": ["SHA256"]}


class InventoryTests(unittest.TestCase):
    def test_full_historical_interval_and_duplicate_replica(self):
        result = summarize([doc("185001-201412"), doc("185001-201412")], "historical")
        self.assertEqual(result["status"], "catalogue-complete-not-content-validated")
        self.assertEqual(result["bytes"], 100)

    def test_gap_and_overlap_are_not_complete(self):
        gap = summarize([doc("185001-201411")], "historical")
        self.assertEqual(gap["missing_months"], 1)
        overlap = summarize([doc("185001-201412"), doc("200001-201412")], "historical")
        self.assertEqual(overlap["overlapping_months"], 180)
        self.assertEqual(overlap["status"], "review-required")

    def test_conflicting_same_filename_rejected(self):
        with self.assertRaises(ValueError):
            summarize([doc("185001-201412"), doc("185001-201412", 200)], "historical")

    def test_future_extension_is_counted_as_whole_download(self):
        result = summarize([doc("201501-230012", 300)], "ssp585")
        self.assertEqual(result["missing_months"], 0)
        self.assertEqual(result["bytes"], 300)

    def test_bad_filename_and_missing_static_stay_unverified(self):
        self.assertEqual(summarize([doc("unknown")], "historical")["status"], "review-required")
        self.assertEqual(summarize([], "historical", "sftlf")["status"], "absent-or-ambiguous")


if __name__ == "__main__":
    unittest.main()
