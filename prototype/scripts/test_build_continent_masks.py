"""Focused geometry/convention tests; no network or climate files required."""
import unittest
import shapely
from shapely.geometry import Point, box
from build_continent_masks import (
    classify_island, europe_candidate, geodesic_area, local_labels, partition_mainland,
    require_valid, source_parts, water_exclusion,
    surface_area_upper_bound,
)


class ContinentMaskTests(unittest.TestCase):
    def test_europe_candidate_removes_lakes_without_mutating_legacy(self):
        legacy = box(0, 0, 4, 4)
        candidate = europe_candidate(legacy, box(1, 1, 2, 2))
        self.assertEqual(legacy.area, 16)
        self.assertEqual(candidate.area, 15)
        self.assertFalse(candidate.covers(Point(1.5, 1.5)))

    def test_water_and_shelves_are_excluded_not_assigned(self):
        eligible, excluded = water_exclusion(box(0, 0, 4, 4),
                                             box(1, 1, 2, 2), box(2, 2, 3, 3))
        self.assertEqual(eligible.area, 14)
        self.assertEqual(excluded.area, 2)
        self.assertEqual(eligible.intersection(excluded).area, 0)

    def test_mainland_partition_is_explicit_and_conservative(self):
        mainland = box(0, 0, 10, 10)
        parts = partition_mainland(mainland, box(0, 0, 3, 10), "africa", "asia")
        self.assertEqual(parts["africa"].area, 30)
        self.assertEqual(parts["asia"].area, 70)
        self.assertTrue(parts["africa"].union(parts["asia"]).equals(mainland))
        self.assertEqual(parts["africa"].intersection(parts["asia"]).area, 0)

    def test_explicit_island_groups_include_transcontinental_exceptions(self):
        examples = [
            ("Bali", 115.15, -8.4, "asia"),
            ("Lombok", 116.3, -8.6, "oceania"),
            ("Borneo", 114, 1, "asia"),
            ("Sulawesi", 121, -2, "oceania"),
            ("Timor", 125, -9, "oceania"),
            ("New Guinea", 141, -5, "oceania"),
            ("Hawaii", -155.5, 19.5, "oceania"),
            ("Rapa Nui", -109.35, -27.1, "oceania"),
            ("Greenland", -42, 72, "north-america"),
            ("Trinidad", -61.3, 10.4, "north-america"),
            ("Madeira", -16.9, 32.7, "africa"),
            ("Christmas", 105.6, -10.5, "asia"),
            ("Heard", 73.5, -53.1, "oceania"),
            ("Kerguelen", 69.5, -49.3, "africa"),
            ("Mindanao", 125, 8, "asia"),
            ("Sri Lanka", 80.7, 7, "asia"),
            ("Tierra del Fuego", -69, -54, "south-america"),
            ("Western Aleutians", 173, 53, "north-america"),
        ]
        for name, x, y, expected in examples:
            with self.subTest(name=name):
                result = classify_island(box(x - .01, y - .01, x + .01, y + .01), [])
                self.assertEqual(result["continent"], expected)
                self.assertTrue(result["rule"])

    def test_unclear_island_is_explicitly_unresolved(self):
        result = classify_island(box(31, 33, 31.1, 33.1), [])
        self.assertIsNone(result["continent"])
        socotra = classify_island(box(53.8, 12.5, 54, 12.6),
                                  [{"name": "Yemen", "continent": "Asia", "whole_component": True}])
        self.assertIsNone(socotra["continent"])
        self.assertIn("needs-decision", socotra["rule"])
        self.assertEqual(result["status"], "unresolved")
        # A rule window must not cut an island just to force an assignment.
        result = classify_island(box(114, -9, 117, -8), [])
        self.assertIsNone(result["continent"])

    def test_multinational_island_uses_joint_local_geography(self):
        island = box(114, 1, 115, 2)
        countries = [
            ({"ADMIN": "Malaysia", "CONTINENT": "Asia"}, box(114, 1, 114.5, 2)),
            ({"ADMIN": "Brunei", "CONTINENT": "Asia"}, box(114.5, 1, 115, 2)),
        ]
        labels = local_labels(island, countries, shapely.STRtree([g for _, g in countries]))
        self.assertEqual(len(labels), 2)
        self.assertTrue(all(row["whole_component"] for row in labels))
        self.assertTrue(all(row["same_geographic_group_uncovered_m2"] == 0 for row in labels))

    def test_russian_remainder_is_geographic_asia_not_admin_europe(self):
        island = box(142, 49, 143, 50)
        countries = [({"ADMIN": "Russia", "CONTINENT": "Europe"}, island)]
        labels = local_labels(island, countries, shapely.STRtree([island]))
        self.assertEqual(labels[0]["continent"], "Europe")
        self.assertEqual(classify_island(island, labels)["continent"], "asia")

    def test_admin_coastline_gap_is_not_silently_filled(self):
        island = box(142, 49, 143, 50)
        countries = [({"ADMIN": "Russia", "CONTINENT": "Europe"}, box(142, 49, 142.99, 50))]
        labels = local_labels(island, countries, shapely.STRtree([countries[0][1]]))
        self.assertFalse(labels[0]["whole_component"])
        self.assertLessEqual(labels[0]["coverage_tolerance_m2"], 1)
        self.assertIsNone(classify_island(island, labels)["continent"])

    def test_indonesia_cannot_bypass_explicit_island_boundary(self):
        island = box(114, -9, 117, -8)
        labels = [{"name": "Indonesia", "continent": "Asia", "whole_component": True}]
        self.assertIsNone(classify_island(island, labels)["continent"])

    def test_area_uses_ellipsoid_and_invalid_input_fails(self):
        square = box(0, 0, 1, 1)
        self.assertGreater(geodesic_area(square), 12_000_000_000)
        self.assertLess(geodesic_area(square), 13_000_000_000)
        self.assertEqual(len(source_parts(square)), 1)
        from shapely.geometry import Polygon
        with self.assertRaisesRegex(ValueError, "invalid"):
            require_valid(Polygon([(0, 0), (1, 1), (0, 1), (1, 0), (0, 0)]), "test")

    def test_roundoff_sliver_uses_surface_bound_not_geodesic_chords(self):
        from shapely.geometry import Polygon
        sliver = Polygon([(-150, -77), (-149.8, -76.9 + 1e-12), (-149.6, -76.8)])
        self.assertLess(surface_area_upper_bound(sliver), 1)
        self.assertGreater(geodesic_area(sliver), 100)


if __name__ == "__main__":
    unittest.main()
