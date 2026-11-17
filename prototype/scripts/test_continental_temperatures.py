"""Synthetic exact regressions for the new, separately versioned 7C results."""
import unittest

import numpy as np

from build_continental_temperatures import monthly_reduce, regional_history, regional_model
from validate_continental_temperatures import check_reference


def months(first, last, value=280, coverage=1, calendar_days=30):
    return [{"year": year, "month": month, "days": calendar_days,
             "value": value, "coverage": coverage}
            for year in range(first, last + 1) for month in range(1, 13)]


class ContinentalReductionTests(unittest.TestCase):
    def test_masked_nan_and_coverage_threshold(self):
        data = np.ma.array([[[10., 20., 99.]], [[10., 20., np.nan]]],
                           mask=[[[False, False, True]], [[False, False, False]]])
        values, coverage = monthly_reduce(data, np.array([[[1., 3., 1.]], [[0., 0., 2.]]]))
        self.assertAlmostEqual(coverage[0, 0], .8)
        self.assertTrue(np.isnan(values[0, 0]))
        self.assertEqual(coverage[0, 1], 0)
        self.assertTrue(np.isnan(values[0, 1]))
        values, coverage = monthly_reduce(data, np.array([[[1., 3., 0.]]]))
        np.testing.assert_array_equal(values[:, 0], [17.5, 17.5])
        np.testing.assert_array_equal(coverage[:, 0], [1, 1])

    def test_invalid_weights_fail(self):
        for weights in [np.array([[[-1.]]]), np.array([[[0.]]]), np.array([[[np.nan]]])]:
            with self.subTest(weights=weights), self.assertRaises(ValueError):
                monthly_reduce(np.ones((1, 1, 1)), weights)

    def test_constant_model_rebases_and_scenarios_share_reference(self):
        experiments = {"historical": months(1850, 2014)}
        for name in ("ssp126", "ssp245", "ssp370", "ssp585"):
            experiments[name] = months(2015, 2100, 283)
        result = regional_model("test", "360_day", experiments, {})
        self.assertEqual(result["baseline_temperature_K"], 280)
        self.assertEqual(result["baseline_days"], 10800)
        self.assertTrue(all(row["value"] == 0 for row in result["historical"]))
        self.assertTrue(all(row["value"] == 3 for row in result["scenarios"]["ssp585"]))

    def test_missing_model_month_never_reduces_ensemble_count(self):
        experiments = {"historical": months(1850, 2014)}
        experiments.update({name: months(2015, 2100) for name in ("ssp126", "ssp245", "ssp370", "ssp585")})
        experiments["ssp245"].pop()
        with self.assertRaises(ValueError):
            regional_model("test", "360_day", experiments, {})

    def test_history_partial_year_and_coverage_reasons(self):
        data = months(1981, 2011, value=2)
        data[-1]["value"] = None
        data[-1]["coverage"] = .89
        data.pop(-2)
        history = regional_history(data, "standard", {})
        self.assertEqual(history["status"], "available")
        self.assertEqual(history["baseline_offset_K"], 2)
        self.assertEqual(history["annual"][0]["value"], 0)
        last = history["annual"][-1]
        self.assertIsNone(last["value"])
        self.assertEqual(last["source_months"], 11)
        self.assertEqual(last["absent_source_months"], [11])
        self.assertEqual(last["below_coverage_months"], [12])
        self.assertEqual(last["missing_reasons"],
                         ["incomplete-source-year", "insufficient-spatial-coverage"])

    def test_history_without_complete_reference_is_explicitly_blocked(self):
        data = months(1981, 2010, value=1)
        data[0]["value"] = None
        data[0]["coverage"] = .8
        history = regional_history(data, "standard", {})
        self.assertEqual(history["status"], "blocked-incomplete-baseline")
        self.assertIsNone(history["baseline_offset_K"])
        self.assertTrue(all(row["value"] is None for row in history["annual"]))
        self.assertTrue(all("incomplete-reference" in row["missing_reasons"]
                            for row in history["annual"]))

    def test_years_are_day_weighted_not_month_weighted(self):
        data = months(1981, 2011, value=0, calendar_days=30)
        data[-1]["value"], data[-1]["days"] = 12, 31
        history = regional_history(data, "standard", {})
        self.assertAlmostEqual(history["annual"][-1]["value"], 12 * 31 / 361)

    def test_independent_reference_rejects_offset_or_missing_year(self):
        reference = {year: {"values": [0., 0.], "source_months": 12, "days": 360}
                     for year in range(1981, 2011)}
        self.assertEqual(check_reference(reference), 0)
        reference[2010]["values"][1] = .01
        with self.assertRaises(ValueError):
            check_reference(reference)
        reference.pop(2010)
        with self.assertRaises(ValueError):
            check_reference(reference)


if __name__ == "__main__":
    unittest.main()
