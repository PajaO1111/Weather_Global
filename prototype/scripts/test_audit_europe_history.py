"""Historical audit regressions; no network access."""
import json
import unittest

import netCDF4
import numpy as np

from audit_europe_history import OUTPUT, audit, verify_months, year_diagnostics
from build_europe_pilot import ARCHIVE, annualize, spatial_mean


class HistoryTests(unittest.TestCase):
    def test_partial_year_is_missing_not_year_to_date_average(self):
        months = [{"year": 2026, "month": month, "days": 31,
                   "coverage": 0.96, "value": 1.0} for month in range(1, 10)]
        annual = annualize(months)
        self.assertIsNone(annual[0]["value"])
        row, = year_diagnostics(months, annual)
        self.assertEqual(row["absent_source_months"], [10, 11, 12])
        self.assertEqual(row["below_coverage_months"], [])

    def test_threshold_uses_weighted_area_and_masked_values(self):
        values = np.ma.array([1.0, 100.0], mask=[False, True])
        mean, coverage = spatial_mean(values, np.array([0.89, 0.11]))
        self.assertIsNone(mean)
        self.assertAlmostEqual(coverage, 0.89)
        mean, coverage = spatial_mean(values, np.array([0.9, 0.1]))
        self.assertEqual(mean, 1)
        self.assertAlmostEqual(coverage, 0.9)

    def test_annual_requires_all_months_above_coverage(self):
        months = [{"year": 2000, "month": month, "days": 30,
                   "coverage": 1.0, "value": 1.0} for month in range(1, 13)]
        months[4].update(value=None, coverage=0.8)
        annual = annualize(months)
        self.assertIsNone(annual[0]["value"])
        self.assertEqual(year_diagnostics(months, annual)[0]["below_coverage_months"], [5])

    def test_month_bounds_and_order_are_enforced(self):
        with netCDF4.Dataset("synthetic-history", mode="w", diskless=True) as dataset:
            dataset.createDimension("time", 2)
            dataset.createDimension("nv", 2)
            time = dataset.createVariable("time", "f8", ("time",))
            time.units = "days since 2000-01-01"
            time.bounds = "time_bnds"
            time[:] = [14, 45]
            bounds = dataset.createVariable("time_bnds", "f8", ("time", "nv"))
            bounds[:] = [[0, 31], [31, 60]]
            _, calendar = verify_months(dataset)
            self.assertEqual(calendar, "standard")
            bounds[1, 1] = 59
            with self.assertRaises(ValueError):
                verify_months(dataset)
            bounds[1, 1] = 60
            time[1] = 14
            with self.assertRaises(ValueError):
                verify_months(dataset)

    @unittest.skipUnless((ARCHIVE / "gistemp250_GHCNv4.nc").exists(),
                         "Local archived NASA source not present")
    def test_full_archive_audit_and_source_decision(self):
        result = audit()
        self.assertEqual(result["monthly_count"], 1761)
        self.assertEqual(result["valid_years"], list(range(1894, 2026)))
        self.assertEqual(result["annual_invalid_count"], 15)
        self.assertEqual(result["below_threshold_month_count"], 164)
        self.assertEqual(result["baseline"]["months"], 360)
        self.assertEqual(result["baseline"]["days"], 10957)
        self.assertGreater(result["baseline"]["minimum_monthly_coverage"], 0.95)
        self.assertTrue(result["original_pilot_values_exact_match"])
        self.assertTrue(result["independent_spatial_and_annual_reduction_passed"])
        self.assertFalse(result["next_phase_7c4b"]["additional_climate_download_required"])
        if (OUTPUT / "audit.json").exists():
            saved = json.loads((OUTPUT / "audit.json").read_text(encoding="utf-8"))
            self.assertEqual(result, saved)


if __name__ == "__main__":
    unittest.main()
