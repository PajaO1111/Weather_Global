"""Checks approved weighting, complete series and descriptive two-model range."""
import json
import unittest

import netCDF4
import numpy as np
from shapely.geometry import shape
from shapely.ops import unary_union

from build_cmip6_europe_pair import ARTIFACT, minmax, require_annual
from build_europe_pilot import ARCHIVE, SCENARIOS, annualize, grid_weights, read_shapes, rebase
from fetch_cmip6_europe_pair import ROOT


def months(year, leap=False):
    lengths = [31, 29 if leap else 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
    return [{"year": year, "month": month, "days": days,
             "value": 280.0 + (month == 2), "coverage": 1.0}
            for month, days in enumerate(lengths, 1)]


class CalculationTests(unittest.TestCase):
    def test_calendar_month_duration_changes_annual_mean(self):
        self.assertAlmostEqual(annualize(months(2000, True))[0]["value"], 280 + 29 / 366)
        self.assertAlmostEqual(annualize(months(2000))[0]["value"], 280 + 28 / 365)

    def test_baseline_requires_all_360_months_and_uses_day_weights(self):
        rows = [row for year in range(1981, 2011) for row in months(
            year, year % 4 == 0 and (year % 100 != 0 or year % 400 == 0))]
        _, baseline, days = rebase(rows)
        self.assertEqual(days, 10957)
        self.assertAlmostEqual(baseline, sum(row["value"] * row["days"] for row in rows) / days)
        with self.assertRaises(ValueError):
            rebase(rows[:-1])

    def test_missing_month_and_nonfinite_year_block_artifact(self):
        for points in (annualize(months(2000)[:-1]),
                       [{"date": "2000", "value": float("nan"), "coverage": 1.0}],
                       [{"date": "2000", "value": 1, "coverage": 0.89}]):
            with self.assertRaises(ValueError):
                require_annual(points, 2000, 2000)

    def test_range_is_exact_minmax_not_percentiles(self):
        self.assertEqual(minmax([[{"date": "2000", "value": 4}],
                                 [{"date": "2000", "value": -1}]]),
                         [{"date": "2000", "min": -1, "max": 4, "model_count": 2}])
        for series in ([], [[{"date": "2000", "value": 1}]],
                       [[{"date": "2000", "value": 1}], [{"date": "2001", "value": 2}]],
                       [[{"date": "2000", "value": 1}], [{"date": "2000", "value": None}]]):
            with self.assertRaises(ValueError):
                minmax(series)

    @unittest.skipUnless(ARTIFACT.is_file(), "Local two-model artifact not built")
    def test_real_output_baseline_ranges_and_original_access_regression(self):
        result = json.loads(ARTIFACT.read_text(encoding="utf-8"))
        self.assertEqual(result["baseline"], [1981, 2010])
        self.assertEqual([model["source_id"] for model in result["models"]],
                         ["ACCESS-CM2", "CanESM5"])
        for model in result["models"]:
            require_annual(model["historical"], 1850, 2014)
            for scenario in SCENARIOS:
                require_annual(model["scenarios"][scenario], 2015, 2100)
            reference = [point for point in model["historical"]
                         if 1981 <= int(point["date"]) <= 2010]
            day_counts = [366 if model["calendar"] == "proleptic_gregorian"
                          and int(point["date"]) % 4 == 0 else 365 for point in reference]
            self.assertAlmostEqual(sum(point["value"] * days for point, days in
                                       zip(reference, day_counts)) / sum(day_counts), 0, places=10)
            self.assertEqual(model["baseline_days"], sum(day_counts))
        for key in ("historical", *SCENARIOS):
            series = [model["historical"] if key == "historical" else model["scenarios"][key]
                      for model in result["models"]]
            actual = result["range"]["historical"] if key == "historical" else result["range"]["scenarios"][key]
            self.assertEqual(actual, minmax(series))
        original = json.loads((ROOT / "prototype" / "backend" / "private" / "data"
                               / "europe_pilot.json").read_text(encoding="utf-8"))
        self.assertEqual(result["mask"]["definition"]["boundary_lon_lat"],
                         original["mask"]["boundary_lon_lat"])
        self.assertEqual(result["models"][0]["historical"], original["model_historical"])
        for scenario in SCENARIOS:
            self.assertEqual(result["models"][0]["scenarios"][scenario],
                             original["scenarios"][scenario]["annual"])

    @unittest.skipUnless(ARTIFACT.is_file(), "Local two-model artifact not built")
    def test_all_1018_annual_values_against_independent_numpy_time_reduction(self):
        result = json.loads(ARTIFACT.read_text(encoding="utf-8"))
        feature = json.loads((ARCHIVE / "europe-mask-v1.geojson").read_text(encoding="utf-8"))
        land = unary_union([geometry for _, geometry in read_shapes("land")])
        mask = shape(feature["geometry"])
        count = 0
        for model in result["models"]:
            sources = model["sources"]
            area_entry, = [entry for entry in sources if entry["variable"] == "areacella"]
            land_entry, = [entry for entry in sources if entry["variable"] == "sftlf"]
            with netCDF4.Dataset(ROOT / area_entry["local_path"]) as area, \
                    netCDF4.Dataset(ROOT / land_entry["local_path"]) as fraction:
                weights, _ = grid_weights(
                    area["lat"][:], area["lon"][:], land, mask, area["areacella"][:],
                    fraction["sftlf"][:] / 100, area[area["lat"].bounds][:],
                    area[area["lon"].bounds][:])
            baseline = None
            for experiment in ("historical", *SCENARIOS):
                entry, = [entry for entry in sources if entry["variable"] == "tas"
                          and entry["experiment"] == experiment]
                with netCDF4.Dataset(ROOT / entry["local_path"]) as dataset:
                    time = dataset["time"]
                    dates = netCDF4.num2date(time[:], time.units, calendar=time.calendar)
                    days = np.array([date.daysinmonth for date in dates])
                    years = np.array([date.year for date in dates])
                    values = np.array([np.average(dataset["tas"][index], weights=weights)
                                       for index in range(len(dates))])
                    if experiment == "historical":
                        selected = (years >= 1981) & (years <= 2010)
                        baseline = np.average(values[selected], weights=days[selected])
                        self.assertAlmostEqual(baseline, model["baseline_temperature_K"], places=10)
                    points = model["historical"] if experiment == "historical" else model["scenarios"][experiment]
                    for point in points:
                        selected = years == int(point["date"])
                        expected = np.average(values[selected], weights=days[selected]) - baseline
                        self.assertAlmostEqual(point["value"], expected, places=10)
                        count += 1
        self.assertEqual(count, 1018)


if __name__ == "__main__":
    unittest.main()
