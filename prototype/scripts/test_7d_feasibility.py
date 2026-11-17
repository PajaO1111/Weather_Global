import json
import unittest

from inspect_7d_samples import OUTPUT, gas_rows, inspect, sea_ice_rows


def sea_ice_sample():
    return "year,mo,source_dataset,region,extent,area\n" + "".join(
        f"{year},1,NSIDC-0051,N,10,8\n" for year in range(1981, 2011))


class FeasibilityTests(unittest.TestCase):
    def test_complete_reference(self):
        self.assertEqual(len(sea_ice_rows(sea_ice_sample(), "N", 1)), 30)

    def test_known_missing_value_remains_missing(self):
        text = sea_ice_sample().replace("1988,1,NSIDC-0051,N,10,8",
                                       "1988,1,-9999,N,-9999,-9999")
        rows = sea_ice_rows(text, "N", 1)
        self.assertIsNone(rows[7]["extent"])
        self.assertIsNone(rows[7]["area"])

    def test_missing_area_does_not_remove_extent(self):
        text = sea_ice_sample().replace("1987,1,NSIDC-0051,N,10,8",
                                       "1987,1,NSIDC-0051,N,10,-9999")
        self.assertEqual(sea_ice_rows(text, "N", 1)[6]["extent"], 10)

    def test_sea_ice_rejects_bad_units_shape_identity_and_values(self):
        for text, region, month in (
            (sea_ice_sample().replace("extent,area", "volume,area"), "N", 1),
            (sea_ice_sample(), "S", 1), (sea_ice_sample(), "N", 2),
            (sea_ice_sample().replace(",10,8", ",nan,8"), "N", 1),
            (sea_ice_sample().replace(",10,8", ",-1,8"), "N", 1),
            (sea_ice_sample() + "2010,1,NSIDC-0051,N,10,8\n", "N", 1),
        ):
            with self.subTest(region=region, month=month):
                with self.assertRaises(ValueError):
                    sea_ice_rows(text, region, month)

    def test_missing_baseline_year_is_not_silently_accepted(self):
        with self.assertRaises(ValueError):
            sea_ice_rows(sea_ice_sample().replace("1981,1,NSIDC-0051,N,10,8\n", ""), "N", 1)

    def test_gas_uncertainty_sentinel_is_not_negative_uncertainty(self):
        for sentinel in (-9.9, -9.99):
            rows = gas_rows(f"# ppb average_unc\n2001 1 2001.0 316.0 {sentinel} 316.0 {sentinel}\n")
            self.assertIsNone(rows[0]["uncertainty"])
            self.assertEqual(rows[0]["mean"], 316)

    def test_gas_rejects_invalid_fields_and_missing_months(self):
        base = "# ppb average_unc\n2001 1 2001.0 316.0 0.1 316.0 0.1\n"
        for text in (base + "2001 3 2001.2 317.0 0.1 317.0 0.1\n",
                     base.replace("316.0", "nan"),
                     base.replace("0.1", "-0.1"),
                     base.replace(" 1 ", " 13 ")):
            with self.subTest(text=text):
                with self.assertRaises(ValueError):
                    gas_rows(text)

    def test_real_archives_and_explicit_sample_gates(self):
        inspect()
        report = json.loads((OUTPUT / "sample-inspection.json").read_text(encoding="utf-8"))
        self.assertEqual(len(report["sea_ice"]), 24)
        self.assertFalse(report["publication_ready"])
        for region in ("N", "S"):
            rows = [row for row in report["sea_ice"] if row["region"] == region]
            self.assertEqual(sum(row["reference_count"] for row in rows), 358)
            self.assertEqual(next(row for row in rows if row["month"] == 1)["missing_extent_years"],
                             [1988])
            self.assertEqual(next(row for row in rows if row["month"] == 12)["missing_extent_years"],
                             [1987])
        self.assertEqual(report["snow"]["cadence_days"], [7])
        self.assertEqual(report["precipitation"]["dimensions"]["time"], 48)
        self.assertEqual(report["carbon_budget"]["status"], "consent_page_not_spreadsheet")
        self.assertEqual(report["spei"]["status"], "partial_header_only_not_numeric_validation")


if __name__ == "__main__":
    unittest.main()
