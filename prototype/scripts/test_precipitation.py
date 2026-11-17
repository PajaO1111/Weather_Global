"""Numerical safeguards for GPCC regional precipitation."""
import unittest

import numpy as np

from build_precipitation import annual_rows, reduce_months


class PrecipitationTests(unittest.TestCase):
    def test_area_weights_are_fractional_not_cell_counts(self):
        precip = np.ma.array([[[0., 100.]]])
        gauge = np.ma.array([[[0., 2.]]])
        distance = np.ma.array([[[200., 20.]]])
        weights = np.array([[[3., 1.]]])
        result = reduce_months(precip, gauge, distance, weights)
        self.assertAlmostEqual(result[0][0]["value"], 25)
        self.assertAlmostEqual(result[0][0]["station_fraction"], .25)
        self.assertAlmostEqual(result[0][0]["distance_km"], 155)

    def test_missing_values_never_become_zero(self):
        values = np.ma.array([[[12., 24.]]], mask=[[[False, True]]])
        result = reduce_months(values, np.ma.ones((1, 1, 2)), np.ma.ones((1, 1, 2)),
                               np.array([[[1., 1.]]]))
        self.assertIsNone(result[0][0]["value"])
        self.assertEqual(result[0][0]["reason"], "incomplete-fixed-support")
        self.assertEqual(result[0][0]["coverage"], .5)

    def test_annual_sum_requires_all_months_and_no_day_weighting(self):
        months = [{"date": f"2000-{i:02d}", "value": float(i), "coverage": 1.,
                   "station_fraction": .2, "distance_km": 10., "reason": None} for i in range(1, 13)]
        result = annual_rows(months, 2000, 2001)
        self.assertEqual(result[0]["value"], 78.)
        self.assertEqual(result[0]["months"], 12)
        self.assertIsNone(result[1]["value"])
        months[0]["value"] = None
        self.assertIsNone(annual_rows(months, 2000, 2000)[0]["value"])

    def test_invalid_weights_and_negative_precip_fail(self):
        for weight in [np.array([[[-1.]]]), np.array([[[float("nan")]]])]:
            with self.assertRaises(ValueError):
                reduce_months(np.ma.ones((1, 1, 1)), np.ma.ones((1, 1, 1)),
                              np.ma.ones((1, 1, 1)), weight)
        with self.assertRaises(ValueError):
            reduce_months(np.ma.array([[[-1.]]]), np.ma.ones((1, 1, 1)),
                          np.ma.ones((1, 1, 1)), np.ones((1, 1, 1)))


if __name__ == "__main__":
    unittest.main()
