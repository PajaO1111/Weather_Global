"""Synthetic scientific-boundary tests for the two historical views."""
import io
import struct
import unittest

import numpy as np

from build_history_comparison import (
    annual_points, common_period, fill_internal, fill_spatial, neighbor_plan,
    normalize_boxes, parse_sbbx, weighted_months,
)


def record(data):
    marker = struct.pack(">i", len(data))
    return marker + data + marker


class HistoryComparisonTests(unittest.TestCase):
    def test_parser_big_endian_records_and_missing(self):
        header = struct.pack(">8i", 12, 1, 6, 12, 0, 1981, 9999, -9999) + b"test".ljust(80)
        metadata = struct.pack(">7if", 12, -100, 100, -100, 100, 1, 9999, 20)
        values = np.array([9999, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 9999], dtype=">f4")
        stream = record(header) + record(metadata + values.tobytes())
        data, bounds, distance, info = parse_sbbx(io.BytesIO(stream), box_count=1)
        self.assertEqual(info["months"], 11)
        self.assertTrue(np.isnan(data[0, 0]))
        self.assertEqual(data[0, 1], 1)
        np.testing.assert_array_equal(bounds[0], [-1, 1, -1, 1])
        self.assertEqual(distance[0], 20)
        with self.assertRaisesRegex(ValueError, "record"):
            parse_sbbx(io.BytesIO(stream[:-1]), box_count=1)
        with self.assertRaisesRegex(ValueError, "Trailing"):
            parse_sbbx(io.BytesIO(stream + b"x"), box_count=1)

    def test_monthly_reference_removes_unknown_source_offsets(self):
        years = np.arange(30).repeat(12) * .1
        raw = np.tile(np.arange(12), 30)[None, :] + years[None, :]
        shifted = raw + np.tile(np.arange(12) * 7 + 4, 30)
        a, good = normalize_boxes(raw, 1981)
        b, _ = normalize_boxes(shifted, 1981)
        np.testing.assert_allclose(a, b, atol=1e-13)
        self.assertTrue(good[0])
        for month in range(12):
            self.assertAlmostEqual(a[0, month::12].mean(), 0)
        raw[0, 15] = np.nan
        rejected, eligible = normalize_boxes(raw, 1981)
        self.assertFalse(eligible[0])
        self.assertTrue(np.isnan(rejected).all())

    def test_internal_gap_bounds_and_no_edge_extension(self):
        raw = np.array([[np.nan, 0, np.nan, np.nan, 3, np.nan, np.nan, np.nan, 7, np.nan]])
        filled, estimated = fill_internal(raw)
        np.testing.assert_array_equal(filled[0, 1:5], [0, 1, 2, 3])
        self.assertTrue(np.isnan(filled[0, [0, 5, 6, 7, 9]]).all())
        self.assertEqual(estimated.sum(), 2)
        np.testing.assert_array_equal(raw[0, 1:5], [0, np.nan, np.nan, 3])

    def test_spatial_donors_no_cross_region_no_self_and_radius(self):
        bounds = np.array([[-1, 1, x, x + .2] for x in [0, 1, 2, 3, 120]])
        weights = np.array([[1, 1, 1, 1, 0], [0, 0, 0, 0, 1]])
        plans = neighbor_plan(bounds, weights, np.ones(5, dtype=bool))
        self.assertIn(0, plans[0])
        self.assertEqual(len(plans[1]), 0)
        for target, (donors, fractions) in plans[0].items():
            self.assertNotIn(target, donors)
            self.assertNotIn(4, donors)
            self.assertAlmostEqual(fractions.sum(), 1)

    def test_equal_distance_donors_have_reproducible_source_order(self):
        bounds = np.array([[-.1, .1, -.1, .1], [-.1, .1, -.6, -.4],
                           [-.1, .1, .4, .6], [-.1, .1, -1.1, -.9],
                           [-.1, .1, .9, 1.1]])
        plan = neighbor_plan(bounds, np.ones((1, 5)), np.ones(5, dtype=bool))[0]
        self.assertEqual(list(plan[0][0]), [1, 2, 3])

    def test_spatial_no_cascade_and_no_record_extension(self):
        native = np.array([[np.nan, np.nan, np.nan, np.nan],
                           [np.nan, 1, 2, np.nan], [np.nan, 2, 3, np.nan],
                           [np.nan, 3, 4, np.nan], [np.nan, np.nan, np.nan, np.nan]])
        flags = np.zeros_like(native, dtype=bool)
        plan = {0: (np.array([1, 2, 3]), np.array([1 / 3] * 3)),
                4: (np.array([0, 2, 3]), np.array([1 / 3] * 3))}
        result, spatial = fill_spatial(native, native.copy(), flags, plan, np.ones(5))
        np.testing.assert_allclose(result[0, 1:3], [2, 3])
        self.assertTrue(np.isnan(result[[0, 4]][:, [0, 3]]).all())
        self.assertTrue(np.isnan(result[4]).all())
        self.assertEqual(spatial.sum(), 2)

    def test_coverage_fractions_are_full_area_disjoint_and_nan_not_zero(self):
        values = np.array([[1, 1], [3, np.nan], [5, 5.]])
        spatial = np.array([[False, False], [False, False], [True, True]])
        temporal = np.zeros_like(spatial)
        monthly = weighted_months(values, np.array([1., 1., 1.]), spatial, temporal, np.array([0, 500, 300]))
        self.assertEqual(monthly["values"][0], 3)
        self.assertTrue(np.isnan(monthly["values"][1]))
        np.testing.assert_allclose(monthly["coverage"], [1, 2 / 3])
        for i in range(2):
            self.assertAlmostEqual(monthly["source_coverage"][i] + monthly["spatial_estimate_fraction"][i]
                                   + monthly["temporal_estimate_fraction"][i], monthly["coverage"][i])

    def test_complete_years_and_reference_required_and_antarctic_block(self):
        values = np.zeros((1, 361))
        flags = np.zeros_like(values, dtype=bool)
        monthly = weighted_months(values, np.ones(1), flags, flags, np.zeros(1))
        output = annual_points(monthly, 1981)
        self.assertEqual(output["summary"]["valid_count"], 30)
        self.assertEqual(output["annual"][0]["value"], 0)
        self.assertIsNone(output["annual"][-1]["value"])
        self.assertIn("incomplete-source-year", output["annual"][-1]["missing_reasons"])
        blocked = annual_points(monthly, 1981, blocked=True)
        self.assertTrue(all(p["value"] is None and p["status"] == "blocked-geography"
                            for p in blocked["annual"]))
        monthly["values"][1] = np.nan
        no_reference = annual_points(monthly, 1981)
        self.assertEqual(no_reference["summary"]["valid_count"], 0)
        self.assertIn("incomplete-reference", no_reference["annual"][1]["missing_reasons"])

    def test_calendar_days_not_unweighted_monthly_average(self):
        values = np.zeros((1, 372))
        values[0, 360] = 1
        flags = np.zeros_like(values, dtype=bool)
        monthly = weighted_months(values, np.ones(1), flags, flags, np.zeros(1))
        point = annual_points(monthly, 1981)["annual"][-1]
        self.assertAlmostEqual(point["value"], 31 / 365)
        self.assertNotAlmostEqual(point["value"], 1 / 12)

    def test_common_period_excludes_antarctica_and_never_spans_gap(self):
        def region(key, years):
            return {"id": key, "conservative": {"annual": [
                {"date": str(y), "value": 0} for y in years]}}
        period = common_period([region("europe", [1981, 1982, 1984, 1985, 1986]),
                                region("asia", [1981, 1982, 1984, 1985, 1986]),
                                region("antarctica", [])])
        self.assertEqual((period["start"], period["end"]), (1984, 1986))
        self.assertNotIn("antarctica", period["regions"])


if __name__ == "__main__":
    unittest.main()
