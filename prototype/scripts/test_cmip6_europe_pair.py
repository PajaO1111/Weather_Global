"""Bounded retrieval and source-calendar regressions."""
import hashlib
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import netCDF4

import fetch_cmip6_europe_pair as fetch
from validate_cmip6_europe_pair import time_axis


class PairTests(unittest.TestCase):
    def test_plan_only_contains_two_approved_models(self):
        rows = fetch.plan()
        self.assertEqual({item["source_id"] for item in rows}, {"ACCESS-CM2", "CanESM5"})
        self.assertEqual(len(rows), 14)
        self.assertEqual(sum(item["bytes"] for item in rows if item["source_id"] == "CanESM5"),
                         161726477)

    def test_checksum_and_size_are_both_required(self):
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / "test.nc"
            path.write_bytes(b"abc")
            item = {"bytes": 3, "checksum": [hashlib.sha256(b"abc").hexdigest()]}
            fetch.verify(path, item)
            path.write_bytes(b"abd")
            with self.assertRaises(ValueError):
                fetch.verify(path, item)
            path.write_bytes(b"abcd")
            with self.assertRaises(ValueError):
                fetch.verify(path, item)

    def test_failed_download_has_explicit_error_and_cleans_partial(self):
        with tempfile.TemporaryDirectory() as folder, patch.object(fetch, "OUTPUT", Path(folder)):
            item = {"file": "test.nc", "bytes": 3, "checksum": ["a" * 64],
                    "http_urls": ["https://example.invalid/test.nc"]}
            attempts = []
            with patch.object(fetch.urllib.request, "urlopen", side_effect=OSError("test failure")):
                with self.assertRaises(RuntimeError):
                    fetch.download(item, Path(folder) / "test.nc", attempts)
            self.assertEqual(attempts[0]["status"], "failed")
            self.assertEqual(list(Path(folder).iterdir()), [])

    def test_both_source_calendars_and_temporal_bounds(self):
        rows = fetch.plan()
        for model in fetch.APPROVED:
            row, = [row for row in rows if row["source_id"] == model
                    and row["variable"] == "tas" and row["experiment"] == "historical"]
            path = (fetch.ROOT / "data_samples" / "2026-11-04" / "europe-pilot" / row["file"]
                    if model == "ACCESS-CM2" else fetch.OUTPUT / row["file"])
            if not path.exists():
                self.skipTest("Approved local fields not downloaded")
            with netCDF4.Dataset(path) as dataset:
                dates, _, _ = time_axis(dataset, "historical")
                self.assertEqual(len(dates), 1980)
                expected = "proleptic_gregorian" if model == "ACCESS-CM2" else "365_day"
                self.assertEqual(dataset["time"].calendar, expected)
                with self.assertRaises(ValueError):
                    time_axis(dataset, "ssp126")


if __name__ == "__main__":
    unittest.main()
