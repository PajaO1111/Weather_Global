"""Download the bounded annual ECDE Europe temperature pilot."""
import argparse
from datetime import datetime, timezone
import hashlib
import importlib.metadata
import json
from pathlib import Path
import tempfile
import zipfile

import cdsapi

ROOT = Path(__file__).resolve().parents[2]
DEFAULT_OUTPUT = ROOT / "data_samples" / "2026-11-06" / "europe-cds-annual"
DATASET = "sis-ecde-climate-indicators"
REGIONS = (
    "nuts_level_0",
    "nuts_level_1",
    "nuts_level_2",
    "kosovo_and_bosnia_and_herzegovina",
    "adriatic_ionian",
    "alpine_space",
    "northern_periphery_and_arctic",
    "atlantic_area",
    "baltic_sea_region",
    "central_europe",
    "danube",
    "mediterranean",
    "north_sea",
    "north_west_europe",
    "south_west_europe",
    "eu_27",
    "eea_32",
    "eea_38",
)
EXPERIMENTS = ("historical", "rcp4_5", "rcp8_5")
COMBINATIONS = (
    ("ec_earth", "hirham5", "r3i1p1"),
    ("ec_earth", "racmo22e", "r1i1p1"),
    ("ec_earth", "rca4", "r12i1p1"),
    ("hadgem2_es", "racmo22e", "r1i1p1"),
    ("hadgem2_es", "rca4", "r1i1p1"),
    ("ipsl_cm5a_mr", "wrf381p", "r1i1p1"),
    ("mpi_esm_lr", "cclm4_8_17", "r1i1p1"),
    ("mpi_esm_lr", "rca4", "r1i1p1"),
    ("noresm1_m", "hirham5", "r1i1p1"),
)
PROCESS_SCHEMA_URL = (
    "https://cds.climate.copernicus.eu/api/retrieve/v1/processes/"
    "sis-ecde-climate-indicators"
)
TECHNICAL_DOC_URL = (
    "https://confluence.ecmwf.int/spaces/CKB/pages/453680707/"
    "Input+data+underpinning+the+European+Climate+Data+Explorer"
    "+Description+of+the+datasets+and+variables"
)


def build_request(gcm, rcm, member):
    return {
        "version": "v2_0",
        "variable": ["mean_temperature"],
        "origin": "projections",
        "gcm": [gcm],
        "rcm": [rcm],
        "experiment": list(EXPERIMENTS),
        "ensemble_member": [member],
        "temporal_aggregation": ["yearly"],
        "spatial_aggregation": "regional_layer",
        "regional_layer": list(REGIONS),
        "other_parameters": ["mean"],
    }


def request_manifest():
    return [
        {
            "id": f"{gcm}_{rcm}_{member}",
            "gcm": gcm,
            "rcm": rcm,
            "ensemble_member": member,
            "request": build_request(gcm, rcm, member),
        }
        for gcm, rcm, member in COMBINATIONS
    ]


def sha256(path):
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for block in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def load_manifest(path, expected_requests):
    if not path.exists():
        return {
            "schema_version": 1,
            "dataset": DATASET,
            "dataset_version": "v2_0",
            "created_at": datetime.now(timezone.utc).isoformat(),
            "source_schema_url": PROCESS_SCHEMA_URL,
            "technical_documentation_url": TECHNICAL_DOC_URL,
            "method_note": (
                "origin=projections; historical is modelled history, not ERA5; "
                "regional layers are not the project physical-continent mask"
            ),
            "cdsapi_version": importlib.metadata.version("cdsapi"),
            "requests": expected_requests,
            "downloads": [],
        }

    manifest = json.loads(path.read_text(encoding="utf-8"))
    if manifest.get("dataset") != DATASET or manifest.get("requests") != expected_requests:
        raise ValueError(f"Existing manifest does not match this request set: {path}")
    return manifest


def verify_existing_downloads(output, manifest):
    verified = set()
    for record in manifest["downloads"]:
        archive = output / record["file"]
        if not archive.is_file() or archive.stat().st_size != record["bytes"]:
            raise ValueError(f"Previously downloaded file is missing or has changed: {archive.name}")
        if sha256(archive) != record["sha256"]:
            raise ValueError(f"Previously downloaded file failed SHA-256: {archive.name}")
        with zipfile.ZipFile(archive) as zipped:
            if zipped.testzip() is not None:
                raise ValueError(f"Previously downloaded ZIP is corrupt: {archive.name}")
        verified.add(record["file"])
    return verified


def write_manifest(path, manifest):
    temporary = path.with_suffix(".json.tmp")
    temporary.write_text(
        json.dumps(manifest, indent=2, ensure_ascii=False, allow_nan=False) + "\n",
        encoding="utf-8",
    )
    temporary.replace(path)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output-dir", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    requests = request_manifest()
    if len(requests) != 9 or len(REGIONS) != 18:
        raise RuntimeError("The approved pilot request set has changed unexpectedly.")
    if args.dry_run:
        print(json.dumps(requests, indent=2))
        return

    client = cdsapi.Client()
    output = args.output_dir.resolve()
    output.mkdir(parents=True, exist_ok=True)
    manifest_path = output / "manifest.json"
    manifest = load_manifest(manifest_path, requests)
    verified = verify_existing_downloads(output, manifest)
    recorded_files = {item["file"] for item in manifest["downloads"]}
    unexpected_files = {
        path.name for path in output.iterdir()
        if path.is_file() and path.name not in recorded_files and path.name != "manifest.json"
    }
    if unexpected_files:
        raise ValueError(
            "Output directory contains untracked files; move them before downloading: "
            + ", ".join(sorted(unexpected_files))
        )
    write_manifest(manifest_path, manifest)

    for entry in requests:
        filename = f"ecde_mean_temperature_{entry['id']}.zip"
        if filename in verified:
            print(f"Verified; skipping {filename}")
            continue
        if filename in recorded_files:
            raise ValueError(f"Download manifest has an unexpected file name: {filename}")

        with tempfile.NamedTemporaryFile(
            prefix=f".{entry['id']}.", suffix=".part", dir=output, delete=False
        ) as temporary:
            temporary_path = Path(temporary.name)
        try:
            print(f"Submitting bounded CDS request: {entry['id']}", flush=True)
            client.retrieve(DATASET, entry["request"], str(temporary_path))
            if not zipfile.is_zipfile(temporary_path):
                raise ValueError(f"CDS response is not a ZIP archive: {entry['id']}")
            with zipfile.ZipFile(temporary_path) as zipped:
                corrupt_member = zipped.testzip()
                if corrupt_member is not None:
                    raise ValueError(
                        f"CDS ZIP failed CRC validation: {entry['id']}:{corrupt_member}"
                    )

            destination = output / filename
            temporary_path.replace(destination)
            record = {
                "file": filename,
                "gcm": entry["gcm"],
                "rcm": entry["rcm"],
                "ensemble_member": entry["ensemble_member"],
                "bytes": destination.stat().st_size,
                "sha256": sha256(destination),
            }
            manifest["downloads"].append(record)
            write_manifest(manifest_path, manifest)
            recorded_files.add(filename)
            verified.add(filename)
            print(f"Saved {filename}: {record['bytes']} bytes; SHA-256 {record['sha256']}")
        finally:
            if temporary_path.exists():
                temporary_path.unlink()

    total_bytes = sum(item["bytes"] for item in manifest["downloads"])
    manifest["completed_at"] = datetime.now(timezone.utc).isoformat()
    manifest["total_bytes"] = total_bytes
    write_manifest(manifest_path, manifest)
    print(f"Completed {len(manifest['downloads'])} downloads; {total_bytes} bytes total.")
    print(f"Output directory: {output}")


if __name__ == "__main__":
    main()
