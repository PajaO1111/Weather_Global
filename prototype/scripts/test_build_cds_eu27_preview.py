"""Offline integration check against the operator's downloaded CDS archives."""
import hashlib
import json
import unittest
import zipfile

import netCDF4
import numpy as np

from build_cds_eu27_preview import DEFAULT_OUTPUT, OUTPUT, build


@unittest.skipUnless(OUTPUT.is_file(), "Local CDS preview artifact not generated")
class PreviewSourceTests(unittest.TestCase):
    def test_every_value_and_hash_match_original_sources(self):
        artifact = build()
        self.assertEqual(artifact, json.loads(OUTPUT.read_text(encoding="utf-8")))
        manifest = json.loads((DEFAULT_OUTPUT / "manifest.json").read_text(encoding="utf-8"))
        self.assertEqual(len(artifact["members"]), 9)
        count = 0
        for member in artifact["members"]:
            entry = next(entry for entry in manifest["downloads"]
                         if "_".join(entry[key] for key in
                                     ("gcm", "rcm", "ensemble_member")) == member["id"])
            with zipfile.ZipFile(DEFAULT_OUTPUT / entry["file"]) as archive:
                for scenario in ("rcp_4_5", "rcp_8_5"):
                    source = member["sources"][scenario]
                    content = archive.read(source["file"])
                    self.assertEqual(hashlib.sha256(content).hexdigest(), source["sha256"])
                    with netCDF4.Dataset("source-test", memory=content) as dataset:
                        time = dataset["time"]
                        years = np.array([date.year for date in netCDF4.num2date(
                            time[:], time.units, calendar=time.calendar)])
                        expected = dataset["mean_temperature"][:][0][
                            (years >= 2006) & (years <= 2098)] - 273.15
                        points = member["scenarios"][scenario]
                        self.assertEqual([point["date"] for point in points],
                                         [str(year) for year in range(2006, 2099)])
                        np.testing.assert_array_equal([point["value"] for point in points],
                                                      expected)
                        count += len(points)
        self.assertEqual(count, 1674)


if __name__ == "__main__":
    unittest.main()
