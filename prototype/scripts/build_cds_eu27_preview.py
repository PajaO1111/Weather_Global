"""Build an offline EU27 preview without rebasing or further aggregation."""
import hashlib
import json
import zipfile

import netCDF4
import numpy as np

from fetch_cds_europe_annual import DEFAULT_OUTPUT
from validate_cds_europe_annual import validate

OUTPUT = DEFAULT_OUTPUT / "validation" / "eu27_preview.json"


def build():
    report = validate(DEFAULT_OUTPUT)
    manifest = json.loads((DEFAULT_OUTPUT / "manifest.json").read_text(encoding="utf-8"))
    members = []
    for entry in manifest["downloads"]:
        scenarios = {}
        sources = {}
        with zipfile.ZipFile(DEFAULT_OUTPUT / entry["file"]) as archive:
            for scenario in ("rcp_4_5", "rcp_8_5"):
                names = [name for name in archive.namelist()
                         if f"-{scenario}-" in name and "-layer-eea_eu_27-" in name]
                if len(names) != 1:
                    raise ValueError("Expected one EU27 member for each RCP")
                content = archive.read(names[0])
                with netCDF4.Dataset("preview", memory=content) as dataset:
                    time = dataset["time"]
                    dates = netCDF4.num2date(time[:], time.units, calendar=time.calendar)
                    values = dataset["mean_temperature"][:]
                    if values.shape[0] != 1 or np.ma.getmaskarray(values).any():
                        raise ValueError("Missing or ambiguous EU27 series")
                    points = [
                        {"date": str(date.year), "value": float(value) - 273.15}
                        for date, value in zip(dates, values[0])
                        if 2006 <= date.year <= 2098
                    ]
                    if [point["date"] for point in points] != [str(y) for y in range(2006, 2099)]:
                        raise ValueError("EU27 preview horizon incomplete")
                    if any(not np.isfinite(point["value"]) for point in points):
                        raise ValueError("Invalid EU27 temperature")
                    scenarios[scenario] = points
                    sources[scenario] = {
                        "file": names[0], "sha256": hashlib.sha256(content).hexdigest(),
                    }
        members.append({
            "id": "_".join(entry[key] for key in ("gcm", "rcm", "ensemble_member")),
            "gcm": entry["gcm"], "rcm": entry["rcm"],
            "member": entry["ensemble_member"], "scenarios": scenarios,
            "sources": sources,
        })
    return {
        "schema_version": 1, "version": "7c2e-eu27-preview-1",
        "status": "local-technical-preview-methodology-unresolved",
        "region": "EU27", "source_unit": "K", "unit": "degC",
        "conversion": "T_C = T_K - 273.15", "horizon": [2006, 2098],
        "anomalies": False, "ensemble_statistics": False,
        "source_url": "https://cds.climate.copernicus.eu/datasets/sis-ecde-climate-indicators",
        "license": "CC-BY-4.0", "license_url": "https://creativecommons.org/licenses/by/4.0/",
        "attribution": "Copernicus Climate Change Service (C3S), ECMWF; ECDE producers "
                       "The Climate Data Factory and B-Open; underlying SIS Energy/EURO-CORDEX "
                       "(doi:10.24381/cds.f6951a62). No producer endorsement.",
        "limitations": [
            "EU27 is not the physical continent Europe; source regional averages are reused.",
            "Annual/spatial aggregation and pre-2006 scenario differences remain unresolved.",
            "Only unit conversion and year selection; no anomalies, interpolation, ensemble "
            "band or further temporal/spatial averaging.",
            "Historical years omitted, not corrected; no ERA5 observations included.",
        ],
        "download_manifest_sha256": report["download_manifest_sha256"],
        "members": members,
    }


if __name__ == "__main__":
    artifact = build()
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    temporary = OUTPUT.with_suffix(".json.tmp")
    temporary.write_text(json.dumps(artifact, allow_nan=False, separators=(",", ":")) + "\n",
                         encoding="utf-8")
    temporary.replace(OUTPUT)
    print(f"Built {OUTPUT}; bytes={OUTPUT.stat().st_size}; "
          f"sha256={hashlib.sha256(OUTPUT.read_bytes()).hexdigest()}")
