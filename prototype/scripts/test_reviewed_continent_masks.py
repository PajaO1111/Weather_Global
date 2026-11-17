"""7C.6d surface integration, explicit review decisions and persisted evidence."""
import json
import unittest

import numpy as np
import shapely
from shapely.geometry import Point, Polygon, box, shape

import build_continent_masks as base
import build_reviewed_continent_masks as review
from validate_reviewed_continent_masks import allocate_cell, grid_cell, lonlat_area


class SurfaceAndNativeGridTests(unittest.TestCase):
    def test_ellipsoid_whole_world_and_hemispheres(self):
        world = lonlat_area(box(-180, -90, 180, 90))
        self.assertAlmostEqual(world, 510065621724088.5, delta=1)
        self.assertAlmostEqual(lonlat_area(box(-180, 0, 180, 90)), world / 2, delta=1)
        self.assertAlmostEqual(lonlat_area(box(-180, -90, 180, 0)), world / 2, delta=1)

    def test_parallel_edge_insertion_and_geographic_grid_tiling(self):
        geometry = Polygon([(0, 0), (3, 0), (3, 3), (0, 3), (0, 0)])
        self.assertAlmostEqual(lonlat_area(geometry),
                               lonlat_area(shapely.segmentize(geometry, .2)), delta=.01)
        tiled = sum(lonlat_area(box(x, y, x + 1, y + 1)) for x in range(3) for y in range(3))
        self.assertAlmostEqual(lonlat_area(geometry), tiled, delta=.01)

    def test_roundoff_sliver_has_no_artificial_geodesic_chord_area(self):
        sliver = Polygon([(-150, -77), (-149.8, -76.9 + 1e-12), (-149.6, -76.8)])
        self.assertLess(lonlat_area(sliver), 1)
        self.assertGreater(base.geodesic_area(sliver), 100)

    def test_holes_are_subtracted(self):
        whole = box(0, 0, 3, 3)
        hole = box(1, 1, 2, 2)
        self.assertAlmostEqual(lonlat_area(whole.difference(hole)),
                               lonlat_area(whole) - lonlat_area(hole), delta=.01)

    def test_dateline_cell_is_split_without_wrapping_across_world(self):
        for south, north in [(-90, -80), (-5, 5), (80, 90)]:
            with self.subTest(latitude=south):
                cell = grid_cell(south, north, 179, 181)
                self.assertEqual(len(base.source_parts(cell)), 2)
                self.assertFalse(cell.covers(Point(0, (south + north) / 2)))
                self.assertAlmostEqual(lonlat_area(cell),
                                       lonlat_area(box(179, south, 180, north)) * 2, delta=.01)

    def test_invalid_bounds_fail(self):
        for args in [(-91, 0, 0, 1), (10, -10, 0, 1), (-90, 90, 0, 361), (0, 1, 2, 1)]:
            with self.subTest(bounds=args), self.assertRaises(ValueError):
                grid_cell(*args)

    def test_land_fraction_is_applied_once_and_conserved(self):
        weights = allocate_cell(100, .25, [2, 6], 8)
        np.testing.assert_array_equal(weights, [6.25, 18.75])
        self.assertEqual(weights.sum(), 25)
        self.assertNotEqual(weights.sum(), 6.25)

    def test_zero_model_land_and_unmapped_model_land_are_not_filled(self):
        np.testing.assert_array_equal(allocate_cell(100, 0, [2, 6], 8), [0, 0])
        np.testing.assert_array_equal(allocate_cell(100, .8, [0, 0], 0), [0, 0])

    def test_invalid_land_fractions_or_incomplete_cell_geometry_fail(self):
        for fraction in [-.1, 1.1, float("nan")]:
            with self.subTest(fraction=fraction), self.assertRaises(ValueError):
                allocate_cell(100, fraction, [2, 6], 8)
        with self.assertRaises(ValueError):
            allocate_cell(100, .5, [20, 60], 100)
        with self.assertRaises(ValueError):
            allocate_cell(100, .5, [2, 6], 0)

    def test_review_classifier_has_no_global_nearest_continent_fallback(self):
        countries = [({"ADMIN": "Greece", "CONTINENT": "Europe"}, box(26, 37, 27, 38))]
        tree = shapely.STRtree([countries[0][1]])
        self.assertEqual(review.decide(box(26.1, 37.1, 26.2, 37.2), countries, tree)["continent"], "europe")
        with self.assertRaisesRegex(ValueError, "No reviewed"):
            review.decide(box(-50, 20, -49, 21), countries, tree)

    def test_special_groups_do_not_follow_sovereignty(self):
        for geometry, expected in [
            (box(53.8, 12.4, 54, 12.6), "africa"),
            (box(3.35, -54.45, 3.45, -54.4), "africa"),
            (box(-109.23, 10.28, -109.22, 10.3), "north-america"),
            (box(34.5, 27.95, 34.6, 28), "asia"),
        ]:
            with self.subTest(bounds=geometry.bounds):
                self.assertEqual(review.decide(geometry, [], None)["continent"], expected)

    def test_corrected_africa_domain_cannot_capture_anatolia_or_sinai(self):
        from shapely.geometry import LineString
        rivers = [({"name": "Suez Canal"}, LineString([(32.31, 31.27), (32.32, 31.2),
                  (32.33, 31.1), (32.34, 31), (32.35, 30.9), (32.36, 30.8),
                  (32.4, 30.6), (32.5, 30.4), (32.55, 30.2), (32.58, 30.01)]))]
        domain, _, _, _ = review.reviewed_africa_domain(rivers)
        self.assertFalse(domain.covers(Point(28, 38)))
        self.assertFalse(domain.covers(Point(33.3, 28.8)))
        self.assertTrue(domain.covers(Point(31.2, 30)))
        self.assertTrue(domain.covers(Point(-5.8, 35.7)))


class ReviewedArtifactsTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.folder = review.OUTPUT
        cls.read = staticmethod(lambda name: json.loads((review.OUTPUT / name).read_text(encoding="utf-8")))
        cls.report = cls.read("report.json")
        cls.validation = cls.read("validation.json")
        cls.decisions = cls.read("decisions.json")["decisions"]
        cls.masks = {key: shape(cls.read(f"{key}.geojson")["geometry"]) for key in base.CONTINENTS}

    def test_persisted_manifest_implementation_and_validation_pins(self):
        for row in self.read("outputs.json")["files"]:
            with self.subTest(file=row["file"]):
                path = self.folder / row["file"]
                self.assertEqual(base.digest(path), row["sha256"])
                self.assertEqual(path.stat().st_size, row["bytes"])
        self.assertEqual(self.report["implementation_sha256"],
                         base.digest(base.ROOT / "prototype" / "scripts" / "build_reviewed_continent_masks.py"))
        self.assertEqual(self.validation["implementation_sha256"],
                         base.digest(base.ROOT / "prototype" / "scripts" / "validate_reviewed_continent_masks.py"))
        self.assertEqual(self.report["validation"]["sha256"], base.digest(self.folder / "validation.json"))

    def test_complete_source_registry_and_decision_chain(self):
        registry = self.read("component-registry.json")["components"]
        previous = json.loads((base.OUTPUT / "component-registry.json").read_text(encoding="utf-8"))["components"]
        self.assertEqual(len(registry), 6836)
        self.assertEqual(len({r["id"] for r in registry}), 6836)
        self.assertEqual(len(self.decisions), 1357)
        self.assertEqual(len({r["component_id"] for r in self.decisions}), 1357)
        self.assertEqual(sum(r["status"] == "assigned" for r in registry), 6835)
        self.assertEqual([r["id"] for r in registry if r["status"] == "excluded"], [review.NULL_ID])
        for before, after in zip(previous, registry):
            self.assertEqual(before["id"], after["id"])
            self.assertEqual(before["source_geometry_sha256"], after["source_geometry_sha256"])
            for entry in after["assignments"]:
                if "review_decision_index" in entry:
                    decision = self.decisions[entry["review_decision_index"]]
                    self.assertEqual(after["id"], decision["component_id"])
                    self.assertEqual(entry["continent"], decision["continent"])
                    self.assertEqual(entry["rule"], decision["rule"])
                    self.assertTrue(decision["rationale"])
                    self.assertTrue(decision["source_pages"])
        self.assertTrue(shape(self.read("unresolved.geojson")["geometry"]).is_empty)
        corrections = self.read("corrections.json")["corrections"]
        self.assertEqual(len(corrections), 3)
        self.assertEqual(corrections[0]["component_id"], "land-02842")
        self.assertEqual(corrections[0]["previous_continent"], "africa")
        self.assertEqual(corrections[0]["continent"], "asia")
        self.assertTrue(self.masks["asia"].covers(Point(34.7, 27.93)))
        self.assertTrue(self.masks["asia"].covers(Point(28, 38)))
        self.assertTrue(self.masks["asia"].covers(Point(33.3, 28.8)))
        self.assertGreater(corrections[1]["africa_to_asia_area_m2"], 1e9)
        self.assertGreater(corrections[2]["removed_from_europe_area_m2"], 3e11)
        self.assertTrue(self.masks["africa"].covers(Point(3, 36.7)))
        self.assertFalse(self.masks["europe"].covers(Point(3, 36.7)))

    def test_europe_v3_has_only_approved_additions_and_african_transfers(self):
        old = shape(json.loads((base.OUTPUT / "europe.geojson").read_text(encoding="utf-8"))["geometry"])
        new = self.masks["europe"]
        removed = old.difference(new)
        self.assertLessEqual(base.surface_area_upper_bound(removed.difference(self.masks["africa"])), .01)
        self.assertGreater(lonlat_area(removed), 3e11)
        added = new.difference(old)
        self.assertTrue(box(25, 35, 29, 41).covers(added))
        self.assertAlmostEqual(lonlat_area(added),
                               sum(d["area_m2"] for d in self.decisions if d["continent"] == "europe"), delta=1e6)
        self.assertIn("v3", self.report["europe"]["candidate_version"])
        self.assertTrue(new.covers(Point(26.3, 39.2)))
        self.assertFalse(old.covers(Point(26.3, 39.2)))

    def test_topology_polar_and_native_grid_evidence(self):
        v = self.validation
        self.assertEqual(v["geographic_topology"], "PASS")
        self.assertEqual(v["model_weight_conservation"], "PASS")
        self.assertLessEqual(v["topology"]["eligible_reconstruction_upper_bound_m2"], 10)
        self.assertEqual(sum(v["topology"]["pairwise_overlaps_upper_bound_m2"].values()), 0)
        self.assertLess(v["area_crosscheck"]["antarctic_laea_relative_error"], 1e-5)
        self.assertEqual({row["source_id"] for row in v["native_grid_audit"]}, {"ACCESS-CM2", "CanESM5"})
        for row in v["native_grid_audit"]:
            self.assertTrue(row["grid"]["pole_to_pole"])
            self.assertTrue(row["grid"]["dateline_cells_split"])
            self.assertAlmostEqual(row["model_land_area_m2"],
                                   row["allocated_model_land_area_m2"] + row["unallocated_model_land_area_m2"], delta=100)
            self.assertEqual(set(row["continents"]), set(base.CONTINENTS))

    def test_previous_geography_climate_and_source_archive_unchanged(self):
        self.assertEqual(review.read_previous(), self.validation["sources_unchanged"])
        for path, expected in base.PINS.values():
            self.assertEqual(base.digest(path), expected)
        for row in self.validation["climate_artifacts_unchanged"]:
            self.assertEqual(base.digest(self.folder.parent.joinpath(*row["file"].split("/"))), row["sha256"])
        archive = self.read("sources/downloads.json")
        self.assertEqual(len(archive), 7)
        for row in archive:
            self.assertEqual(base.digest(self.folder / "sources" / row["file"]), row["sha256"])

    def test_no_success_shaped_grounding_or_publication_claim(self):
        for value in (self.report, self.validation):
            self.assertFalse(value["publication_allowed"])
            self.assertFalse(value["climate_weights_allowed"])
        self.assertTrue(self.validation["antarctic_grounding"].startswith("BLOCKED"))
        self.assertTrue(self.validation["overall"].startswith("CONDITIONAL-PASS"))
        self.assertTrue(self.validation["legacy_custom_europe_nasa_cmip6"].startswith("INVALID-GEOGRAPHY"))
        self.assertFalse(self.report["europe"]["legacy_geography_valid"])
        self.assertFalse(self.read("antarctica.geojson")["properties"]["grounding_line_verified"])
        self.assertFalse(any(g.covers(Point(0, 0)) for g in self.masks.values()))


if __name__ == "__main__":
    unittest.main()
