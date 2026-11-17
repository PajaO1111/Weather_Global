"""Focused regressions for ECDE temporal, missing-data and scenario validation."""
import unittest

import netCDF4
import numpy as np

from validate_cds_europe_annual import annual_years, scenario_difference, summarize_values


class AnnualValidationTests(unittest.TestCase):
    def test_real_calendar_decodes_contiguous_years(self):
        with netCDF4.Dataset("memory", mode="w", diskless=True) as dataset:
            dataset.createDimension("time", 3)
            time = dataset.createVariable("time", "i8", ("time",))
            time.units = "days since 2000-01-01"
            time.calendar = "proleptic_gregorian"
            time[:] = [0, 366, 731]
            self.assertEqual(annual_years(time), ([2000, 2001, 2002], "proleptic_gregorian"))
            for invalid_axis in ([0, 366, 366], [0, 731, 1096], [731, 366, 0]):
                time[:] = invalid_axis
                with self.assertRaises(ValueError):
                    annual_years(time)

    def test_missing_values_stay_distinct_from_valid_zero_celsius(self):
        years = list(range(1981, 2011))
        values = np.ma.array(np.full((3, 30), 273.15), mask=False)
        values.mask[1, :] = True
        values[2, 0] = np.nan
        summary = summarize_values(values, ["EU", "MISSING", "PARTIAL"], years)
        self.assertEqual(summary["missing_count"], 31)
        self.assertEqual(summary["all_missing_territories"], ["MISSING"])
        self.assertEqual(summary["partially_missing_territories"], ["PARTIAL"])
        self.assertEqual(summary["baseline_complete_territories"], ["EU"])
        self.assertEqual(summary["minimum_K"], 273.15)

    def test_short_baseline_never_counts_as_complete(self):
        summary = summarize_values(np.full((1, 29), 280), ["EU"], list(range(1982, 2011)))
        self.assertEqual(summary["baseline_complete_territories"], [])

    def test_invalid_shape_ids_and_kelvin_rejected(self):
        for values, codes, years in (
            (np.full((1, 2), 280), ["EU"], [2000]),
            (np.full((2, 1), 280), ["EU", "EU"], [2000]),
            (np.full((1, 1), -9e33), ["EU"], [2000]),
        ):
            with self.assertRaises(ValueError):
                summarize_values(values, codes, years)

    def test_scenarios_not_assumed_to_share_historical_values(self):
        years = [2004, 2005, 2006]
        left = np.array([[280., 281., 282.]])
        right = np.array([[280., 281.5, 300.]])
        result = scenario_difference(left, right, years)
        self.assertFalse(result["identical_values"])
        self.assertEqual(result["max_absolute_difference_K"], 0.5)
        self.assertEqual(result["compared_values"], 2)

    def test_scenario_missing_flags_compared_separately(self):
        left = np.ma.array([[280., 281.]], mask=[[False, True]])
        right = np.array([[280., 281.]])
        result = scenario_difference(left, right, [2004, 2005])
        self.assertEqual(result["different_missing_flags"], 1)
        self.assertEqual(result["compared_values"], 1)


if __name__ == "__main__":
    unittest.main()
