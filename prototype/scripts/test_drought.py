"""Numerical contracts for drought area classes and explicit missing denominators."""
import unittest
import numpy as np
from build_drought import area_classes, annual_summary


class DroughtTests(unittest.TestCase):
    def test_exact_category_boundaries_and_cumulative_thresholds(self):
        x = np.ma.array([[-2., -1.5, -1., 0., 1., 1.5, 2.]])
        row = area_classes(x, np.ones(7))[0]
        np.testing.assert_allclose(row["categories"], np.ones(7) / 7, atol=1e-8)
        self.assertAlmostEqual(row["dry"], 3 / 7, places=7)
        self.assertAlmostEqual(row["severe"], 2 / 7, places=7)
        self.assertAlmostEqual(row["extreme"], 1 / 7, places=7)

    def test_fractional_area_not_cell_counts_and_available_denominator(self):
        x = np.ma.array([[-2., 0., 1.]], mask=[[False, False, True]])
        row = area_classes(x, np.array([3., 1., 4.]))[0]
        self.assertEqual(row["dry"], .75)
        self.assertEqual(row["coverage"], .5)
        self.assertEqual(row["missing_fraction"], .5)
        self.assertEqual(row["categories"][0], .75)
        self.assertAlmostEqual(sum(row["categories"]), 1)

    def test_nan_and_all_missing_stay_missing_not_zero_drought(self):
        row = area_classes(np.ma.array([[np.nan, 0.]]), np.array([1., 1.]))[0]
        self.assertEqual(row["coverage"], .5)
        self.assertEqual(row["dry"], 0.)
        for weights in [np.ones(2), np.zeros(2)]:
            row = area_classes(np.ma.masked_all((1, 2)), weights)[0]
            self.assertIsNone(row["dry"])
            self.assertIsNone(row["categories"])
            self.assertEqual(row["coverage"], 0)

    def test_invalid_weights_and_shape_rejected(self):
        for weights in [np.array([-1., 1.]), np.array([np.nan, 1.]), np.ones(3)]:
            with self.assertRaises(ValueError):
                area_classes(np.ma.ones((1, 2)), weights)

    def test_annual_area_month_average_not_unique_area_or_index_sum(self):
        rows = [{"date": f"2000-{i:02d}", **area_classes(np.ma.array([[-2., 0.]]), np.ones(2))[0]} for i in range(1, 13)]
        annual = annual_summary(rows, 2000, 2001)
        self.assertEqual(annual[0]["dry"], .5)
        self.assertEqual(annual[0]["months"], 12)
        self.assertIsNone(annual[1]["dry"])
        rows.pop()
        self.assertIsNone(annual_summary(rows, 2000, 2000)[0]["dry"])


if __name__ == "__main__":
    unittest.main()
