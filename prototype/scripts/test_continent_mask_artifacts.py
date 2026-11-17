"""Offline contract checks for generated 7C.6c drafts, not 7C.6d certification."""
import json
import unittest
from itertools import combinations

from shapely.geometry import Point, shape
from shapely.ops import unary_union

from build_continent_masks import (
    CONTINENTS, OUTPUT, PINS, ROOT, digest, europe_candidate, geodesic_area,
    read_layer, require_valid, source_parts, water_exclusion,
    surface_area_upper_bound,
)


class GeneratedContinentMaskTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        def read(name):
            return json.loads((OUTPUT / name).read_text(encoding="utf-8"))
        cls.report = read("report.json")
        cls.registry = read("component-registry.json")["components"]
        cls.manifest = read("outputs.json")
        cls.features = {name: read(f"{name}.geojson") for name in CONTINENTS}
        cls.masks = {name: shape(feature["geometry"]) for name, feature in cls.features.items()}
        cls.unresolved = shape(read("unresolved.geojson")["geometry"])
        cls.excluded = shape(read("excluded.geojson")["geometry"])
        cls.legacy = shape(json.loads(PINS["europe-v1"][0].read_text(encoding="utf-8"))["geometry"])
        repairs = []
        cls.land = unary_union([g for _, g in read_layer("land", repairs)[0]])
        cls.lakes = unary_union([g for _, g in read_layer("lakes", repairs)[0]])
        cls.shelves = unary_union([g for _, g in read_layer("shelves", repairs)[0]])
        cls.eligible, _ = water_exclusion(cls.land, cls.lakes, cls.shelves)

    def test_hash_manifest_and_existing_climate_outputs_are_unchanged(self):
        for item in self.manifest["files"]:
            with self.subTest(file=item["file"]):
                path = OUTPUT / item["file"]
                self.assertEqual(path.stat().st_size, item["bytes"])
                self.assertEqual(digest(path), item["sha256"])
        self.assertEqual(self.report["implementation_sha256"],
                         digest(ROOT / "prototype" / "scripts" / "build_continent_masks.py"))
        for path, expected in PINS.values():
            self.assertEqual(digest(path), expected)
        base = ROOT / "data_samples" / "2026-11-06"
        climate = [
            ("europe-cds-annual/validation/eu27_preview.json",
             "0aee1c1d7617657451ea624be7206b73d43878d0ea43aa630bdeac278a76132f"),
            ("europe-cmip6-pair/europe_pair_anomalies_v1.json",
             "ef75363408e5ad65cd14e20cf94be156ab139fc384f121415a489460f7cfb5f9"),
            ("europe-history/europe_history_v1.json",
             "6798265e06d8e140452ed63bf9a5fdbe414aa039c3ffc7f9eb46f23926cfac70"),
        ]
        for relative, expected in climate:
            self.assertEqual(digest(base.joinpath(*relative.split("/"))), expected)

    def test_registry_accounts_for_every_physical_source_component(self):
        originals = sorted(source_parts(self.land), key=lambda g: (-g.area, g.bounds))
        self.assertEqual(len(originals), 6836)
        self.assertEqual(len(self.registry), len(originals))
        self.assertEqual(len({row["id"] for row in self.registry}), len(originals))
        import hashlib
        for index, (row, original) in enumerate(zip(self.registry, originals)):
            self.assertEqual(row["id"], f"land-{index:05d}")
            self.assertEqual(row["source_geometry_sha256"], hashlib.sha256(original.wkb).hexdigest())
            self.assertEqual(row["bounds"], list(original.bounds))
            for entry in row["assignments"]:
                self.assertTrue(entry["rule"])
                self.assertGreaterEqual(entry["area_m2"], 0)
                self.assertIn(entry["continent"], [*CONTINENTS, None])
            self.assertEqual(row["status"] == "unresolved",
                             any(entry["continent"] is None for entry in row["assignments"]))

    def test_draft_closure_and_pairwise_disjointness(self):
        for name, geometry in self.masks.items():
            require_valid(geometry, name)
        pieces = [*self.masks.values(), self.unresolved]
        closure = surface_area_upper_bound(self.eligible.symmetric_difference(unary_union(pieces)))
        self.assertLessEqual(closure, 10)
        self.assertAlmostEqual(closure, self.report["summary"]["draft_accounting_difference_m2"], delta=.001)
        overlap = sum(surface_area_upper_bound(left.intersection(right))
                      for left, right in combinations(pieces, 2))
        excluded_overlap = surface_area_upper_bound(unary_union(pieces).intersection(self.excluded))
        self.assertLessEqual(overlap, 10)
        self.assertLessEqual(excluded_overlap, 10)
        self.assertAlmostEqual(overlap, self.report["summary"]["draft_pairwise_overlap_upper_bound_m2"], delta=.001)
        self.assertAlmostEqual(excluded_overlap, self.report["summary"]["draft_excluded_overlap_upper_bound_m2"], delta=.001)

    def test_europe_candidate_changes_only_mapped_water_and_roundoff(self):
        candidate = europe_candidate(self.legacy, self.lakes).intersection(self.eligible)
        self.assertLessEqual(surface_area_upper_bound(candidate.symmetric_difference(self.masks["europe"])), .01)
        self.assertLessEqual(surface_area_upper_bound(self.masks["europe"].difference(self.legacy)), .01)
        self.assertGreater(self.report["europe"]["removed_mapped_lakes_m2"], 135_000_000_000)
        self.assertLess(self.report["europe"]["removed_mapped_lakes_m2"], 136_000_000_000)

    def test_approved_places_use_real_generated_geometries(self):
        examples = [
            ("Australia", 133, -25, "oceania"), ("Borneo", 114, 1, "asia"),
            ("Sulawesi", 121, -2, "oceania"), ("Bali", 115.15, -8.4, "asia"),
            ("Lombok", 116.3, -8.6, "oceania"), ("Timor", 125, -9, "oceania"),
            ("New Guinea", 141, -5, "oceania"), ("Cyprus", 33, 35, "europe"),
            ("Greenland", -42, 72, "north-america"), ("Sinai", 33.8, 29.5, "asia"),
            ("Egypt", 30, 27, "africa"), ("Panama", -80, 8.5, "north-america"),
            ("Colombia", -74, 4, "south-america"), ("Sakhalin", 142.5, 50, "asia"),
            ("Hawaii", -155.5, 19.5, "oceania"), ("Rapa Nui", -109.35, -27.1, "oceania"),
            ("Mindanao", 125, 8, "asia"), ("Sri Lanka", 80.7, 7, "asia"),
            ("Tierra del Fuego", -69, -54, "south-america"),
            ("Western Aleutians", 173.0493131865513, 52.88241201400004, "north-america"),
        ]
        for name, x, y, expected in examples:
            with self.subTest(place=name):
                point = Point(x, y)
                self.assertTrue(self.masks[expected].covers(point))
                self.assertFalse(self.unresolved.covers(point))
                self.assertEqual([key for key, g in self.masks.items() if g.covers(point)], [expected])

    def test_publication_weights_and_grounding_remain_blocked(self):
        self.assertFalse(self.report["publication_allowed"])
        self.assertFalse(self.report["climate_weights_allowed"])
        self.assertTrue(self.report["blockers"])
        for feature in self.features.values():
            self.assertFalse(feature["properties"]["publication_allowed"])
            self.assertFalse(feature["properties"]["climate_weights_allowed"])
        self.assertFalse(self.features["antarctica"]["properties"]["grounding_line_verified"])
        self.assertLessEqual(surface_area_upper_bound(self.masks["antarctica"].intersection(self.shelves)), 10)


if __name__ == "__main__":
    unittest.main()
