"""Extract bounded, original global AR6 confidence files; never fetch the 890 MB ZIP."""
import argparse
from datetime import datetime, timezone
import hashlib
import io
import json
from pathlib import Path
import struct
import urllib.request
import zipfile
import zlib

ROOT = Path(__file__).resolve().parents[2]
ARCHIVE = ROOT / "data_samples" / "2026-11-04" / "ar6"
URL = "https://zenodo.org/records/6382554/files/ar6.zip"
SIZE = 889784792
SCENARIOS = ["ssp126", "ssp245", "ssp370", "ssp585"]
HASHES = [
    "f71e543638310e12c6f72868740f2f51ffda6cd9aedb58f8d0e7d5b1c61fec8f",
    "9313b7bb543a951914d40c8c54c1b9734fddb8e69ba5c69a07ec42577ae10991",
    "c2009cbe8872bdd209e734949b28acf507a153b81504d509d6f0a5aeae167471",
    "f696fd089e534c2a1d2d0eb3799c4d5a0d8f0803cefc35d387cc59e1b5bff1f8",
]


def fetch_range(first, last):
    """Require and bound HTTP partial content before reading any scientific bytes."""
    request = urllib.request.Request(URL, headers={"Range": f"bytes={first}-{last}"})
    with urllib.request.urlopen(request, timeout=40) as response:
        expected = f"bytes {first}-{last}/{SIZE}"
        if response.status != 206 or response.headers.get("Content-Range") != expected:
            raise ValueError("The server did not honor the bounded archive range")
        data = response.read(last - first + 2)
    if len(data) != last - first + 1:
        raise ValueError("Truncated or oversized archive range")
    return data


def extract():
    """Archive only four medium-confidence global totals and documentation, with CRC."""
    ARCHIVE.mkdir(parents=True, exist_ok=True)
    tail = fetch_range(SIZE - 65536, SIZE - 1)
    position = tail.rfind(b"PK\x05\x06")
    end = tail[position:]
    fields = struct.unpack_from("<4s4H2LH", end)
    length, offset = fields[5:7]
    if length > 1000000:
        raise ValueError("Unexpected ZIP directory size")
    directory = fetch_range(offset, offset + length - 1)
    if hashlib.sha256(directory).hexdigest() != "ee1fb7ee1407b36378d823155ab36e7f40ba12133f5964e8991edd1b7e76cd55":
        raise ValueError("Pinned archive directory changed")
    (ARCHIVE / "zip-directory.bin").write_bytes(directory)
    (ARCHIVE / "zip-end.bin").write_bytes(end)
    index = zipfile.ZipFile(io.BytesIO(directory + end))
    wanted = ["ar6/LICENSE", "ar6/FACTS_confidence_output_file_readme.pdf"] + [
        f"ar6/global/confidence_output_files/medium_confidence/{s}/total_{s}_medium_confidence_values.nc"
        for s in SCENARIOS
    ]
    records = []
    for member in wanted:
        info = index.getinfo(member)
        if info.file_size > 200000 or info.compress_size > 200000:
            raise ValueError("Unexpected member size")
        start = info.header_offset + offset
        header = fetch_range(start, start + 29)
        fields = struct.unpack("<4s5H3L2H", header)
        data_start = start + 30 + fields[-2] + fields[-1]
        compressed = fetch_range(data_start, data_start + info.compress_size - 1)
        raw = zlib.decompress(compressed, -15) if info.compress_type == 8 else compressed
        if len(raw) != info.file_size or zlib.crc32(raw) != info.CRC:
            raise ValueError("ZIP member integrity failure")
        filename = Path(member).name.lower()
        (ARCHIVE / filename).write_bytes(raw)
        records.append({
            "file": filename, "archive_url": URL, "member": member,
            "bytes": len(raw), "sha256": hashlib.sha256(raw).hexdigest(),
            "zip_crc32": f"{info.CRC:08x}",
            "compressed_range": [data_start, data_start + info.compress_size - 1],
        })
        print(filename, len(raw), raw[:8])
    manifest = {
        "record": "https://zenodo.org/records/6382554",
        "version": "20210809", "license": "CC-BY-4.0",
        "archive_bytes": SIZE,
        "archive_md5_from_zenodo": "6ae2f0206bcc687b2dadb1eb997d4234",
        "archive_downloaded_in_full": False,
        "retrieved_at": datetime.now(timezone.utc).isoformat(),
        "directory_sha256": hashlib.sha256(directory).hexdigest(),
        "sources": records,
    }
    (ARCHIVE / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")


def build():
    """Validate original quantiles and emit a small, lossless PHP-ready artifact."""
    import numpy as np
    from netCDF4 import Dataset

    manifest_path = ARCHIVE / "manifest.json"
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    if hashlib.sha256((ARCHIVE / "zip-directory.bin").read_bytes()).hexdigest() != manifest["directory_sha256"]:
        raise ValueError("Archived ZIP directory changed")
    for record in manifest["sources"]:
        raw = (ARCHIVE / record["file"]).read_bytes()
        if len(raw) != record["bytes"] or hashlib.sha256(raw).hexdigest() != record["sha256"]:
            raise ValueError("Archived source checksum changed: " + record["file"])
    for record in manifest.get("documents", []):
        if hashlib.sha256((ARCHIVE / record["file"]).read_bytes()).hexdigest() != record["sha256"]:
            raise ValueError("Archived documentation changed")
    scenarios = {}
    quantiles = None
    for scenario, expected_hash in zip(SCENARIOS, HASHES):
        filename = f"total_{scenario}_medium_confidence_values.nc"
        path = ARCHIVE / filename
        if hashlib.sha256(path.read_bytes()).hexdigest() != expected_hash:
            raise ValueError("Pinned projection source changed")
        with Dataset(path) as source:
            q = source["quantiles"][:].tolist()
            years = source["years"][:].tolist()
            values = source["sea_level_change"][:]
            if (
                source["locations"][:].tolist() != [-1]
                or source["sea_level_change"].units != "mm"
                or source["sea_level_change"].dimensions != ("quantiles", "years", "locations")
                or years != list(range(2020, 2151, 10))
                or len(q) != 107 or q != sorted(set(q))
                or q[0] != 0 or q[-1] != 1
                or np.ma.getmaskarray(values).any()
                or not np.isfinite(values).all()
                or not (np.diff(values[:, :, 0], axis=0) >= 0).all()
                or (quantiles is not None and q != quantiles)
            ):
                raise ValueError("Invalid global projection coordinates or values")
            quantiles = q
            scenarios[scenario] = {
                "source_file": filename, "source_sha256": expected_hash,
                "source_history": source.history,
                "source_workflows": source.source,
                "points": [
                    {"date": str(year), "values": values[:, index, 0].astype(int).tolist()}
                    for index, year in enumerate(years)
                ],
            }
    artifact = {
        "schema_version": 1,
        "product": "IPCC AR6 Sea Level Projections",
        "provider": "IPCC AR6 projection authors / NASA Sea Level Change Team",
        "version": "20210809", "unit": "mm",
        "reference_period": "1995-2014", "location_id": -1,
        "geography": "Global mean sea level",
        "confidence": "medium_confidence",
        "statistic": "confidence_output_pbox",
        "central_definition": "q0.50 is the mean of workflow medians, not the median of a single probability distribution.",
        "interval_definition": "q0.17 lower envelope and q0.83 upper envelope across assessed medium-confidence workflows (likely range).",
        "workflow_definition": "Confidence output combines p-box 1e through 2100 and 1f after 2100; a methodological discontinuity may occur at 2110.",
        "quantiles": quantiles,
        "scenarios": scenarios,
        "source_url": URL, "record_url": "https://zenodo.org/records/6382554",
        "documentation_url": "https://github.com/Rutgers-ESSP/IPCC-AR6-Sea-Level-Projections",
        "baseline_documentation_url": "https://sealevel.nasa.gov/ipcc-ar6-sea-level-projection-tool/",
        "source_manifest_sha256": hashlib.sha256(manifest_path.read_bytes()).hexdigest(),
        "license": "CC-BY-4.0", "license_url": "https://creativecommons.org/licenses/by/4.0/",
        "citations": [
            {"text": "Fox-Kemper et al. (2021), Ocean, Cryosphere and Sea Level Change, IPCC AR6 WGI Chapter 9.", "url": "https://doi.org/10.1017/9781009157896.011"},
            {"text": "Kopp et al. (2023), The Framework for Assessing Changes To Sea-Level (FACTS) v1.0.", "url": "https://doi.org/10.5194/gmd-16-7461-2023"},
            {"text": "Garner et al. (2021), IPCC AR6 Sea Level Projections, version 20210809, accessed 2026-11-04.", "url": "https://doi.org/10.5281/zenodo.6382554"},
        ],
        "acknowledgement": "We thank the projection authors for developing and making the sea-level rise projections available, multiple funding agencies for supporting the development of the projections, and the NASA Sea Level Change Team for developing and hosting the IPCC AR6 Sea Level Projection Tool.",
    }
    target = ROOT / "prototype" / "backend" / "private" / "data" / "ar6_sealevel.json"
    target.write_text(json.dumps(artifact, ensure_ascii=False, separators=(",", ":"), allow_nan=False) + "\n", encoding="utf-8")
    print("artifact", target.stat().st_size, hashlib.sha256(target.read_bytes()).hexdigest())


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--extract", action="store_true")
    parser.add_argument("--record-documents", action="store_true", help="Record newly captured documentation before pinning the artifact")
    args = parser.parse_args()
    if args.extract:
        extract()
    if args.record_documents:
        path = ARCHIVE / "manifest.json"
        manifest = json.loads(path.read_text(encoding="utf-8"))
        for record in manifest["sources"]:
            record["retrieved_at"] = datetime.fromtimestamp((ARCHIVE / record["file"]).stat().st_mtime, timezone.utc).isoformat()
        manifest["retrieved_at"] = max(record["retrieved_at"] for record in manifest["sources"])
        documents = {
            "zenodo-record.json": "https://zenodo.org/api/records/6382554",
            "source-guide.md": "https://raw.githubusercontent.com/Rutgers-ESSP/IPCC-AR6-Sea-Level-Projections/main/README.md",
            "license-guide.md": "https://raw.githubusercontent.com/Rutgers-ESSP/IPCC-AR6-Sea-Level-Projections/main/LICENSE.md",
            "faq.md": "https://raw.githubusercontent.com/Rutgers-ESSP/IPCC-AR6-Sea-Level-Projections/main/FAQ.md",
            "nasa-tool.html": "https://sealevel.nasa.gov/ipcc-ar6-sea-level-projection-tool/",
        }
        manifest["documents"] = [{
            "file": filename, "url": url, "bytes": (ARCHIVE / filename).stat().st_size,
            "retrieved_at": datetime.fromtimestamp((ARCHIVE / filename).stat().st_mtime, timezone.utc).isoformat(),
            "sha256": hashlib.sha256((ARCHIVE / filename).read_bytes()).hexdigest(),
        } for filename, url in documents.items()]
        path.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    build()
