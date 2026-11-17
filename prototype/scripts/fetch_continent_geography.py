"""Download only bounded, public Natural Earth geographic inputs for phase 7C.6c."""
import hashlib
import json
from pathlib import Path
import urllib.request
import zipfile

ROOT = Path(__file__).resolve().parents[2]
OUTPUT = ROOT / "data_samples" / "2026-11-06" / "continent-masks" / "sources"
INPUTS = [
    ("ne_10m_lakes.zip", "https://naturalearth.s3.amazonaws.com/10m_physical/ne_10m_lakes.zip", 5_000_000),
    ("ne_10m_antarctic_ice_shelves_polys.zip",
     "https://naturalearth.s3.amazonaws.com/10m_physical/ne_10m_antarctic_ice_shelves_polys.zip", 3_000_000),
    ("naturalearth-terms.html", "https://www.naturalearthdata.com/about/terms-of-use/", 200_000),
    ("lakes-documentation.html",
     "https://www.naturalearthdata.com/downloads/10m-physical-vectors/10m-lakes/", 200_000),
    ("shelves-documentation.html",
     "https://www.naturalearthdata.com/downloads/10m-physical-vectors/10m-antarctic-ice-shelves/", 200_000),
]


def main():
    OUTPUT.mkdir(parents=True, exist_ok=True)
    manifest_path = OUTPUT / "downloads.json"
    records = json.loads(manifest_path.read_text(encoding="utf-8")) if manifest_path.exists() else []
    for name, url, maximum in INPUTS:
        target = OUTPUT / name
        previous = next((row for row in records if row["file"] == name), None)
        if target.exists():
            if previous is None or hashlib.sha256(target.read_bytes()).hexdigest() != previous["sha256"]:
                raise ValueError(f"Existing geographic input lacks matching provenance: {name}")
            print(f"Verified existing {name}", flush=True)
            continue
        request = urllib.request.Request(url, headers={"User-Agent": "WeatherGlobal-GeographyPilot/1.0"})
        with urllib.request.urlopen(request, timeout=90) as response:
            data = response.read(maximum + 1)
        if len(data) > maximum:
            raise ValueError(f"Geographic download exceeds limit: {name}")
        if name.endswith(".zip"):
            import io
            with zipfile.ZipFile(io.BytesIO(data)) as archive:
                if archive.testzip() is not None:
                    raise ValueError(f"Invalid ZIP CRC: {name}")
        target.write_bytes(data)
        records.append({"file": name, "url": url, "bytes": len(data),
                        "sha256": hashlib.sha256(data).hexdigest()})
        manifest_path.write_text(json.dumps(records, indent=2) + "\n", encoding="utf-8")
        print(f"Saved {name}: {len(data)} bytes", flush=True)


if __name__ == "__main__":
    main()
