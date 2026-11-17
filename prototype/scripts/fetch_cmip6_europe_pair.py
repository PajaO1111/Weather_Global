"""Approved ACCESS-CM2/CanESM5 retrieval with exact catalogue hashes."""
import hashlib
import json
import re
import tempfile
import urllib.error
import urllib.request
from pathlib import Path

from inventory_cmip6_europe import ROOT, OUTPUT as INVENTORY

OUTPUT = ROOT / "data_samples" / "2026-11-06" / "europe-cmip6-pair"
APPROVED = ("ACCESS-CM2", "CanESM5")
LIMIT = 1_400_000_000


def sha256(path):
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def verify(path, item):
    if path.stat().st_size != item["bytes"] or sha256(path) != item["checksum"][0]:
        raise ValueError(f"Size/checksum mismatch: {path.name}")


def write_manifest(manifest):
    temporary = OUTPUT / "manifest.json.tmp"
    temporary.write_text(json.dumps(manifest, indent=2, allow_nan=False) + "\n", encoding="utf-8")
    temporary.replace(OUTPUT / "manifest.json")


def plan():
    inventory = json.loads((INVENTORY / "inventory.json").read_text(encoding="utf-8"))
    if inventory["inventory_complete"] is not True:
        raise ValueError("Incomplete inventory")
    rows = []
    for model in APPROVED:
        entry, = [row for row in inventory["models"] if row["source_id"] == model]
        if entry["variant_label"] != "r1i1p1f1" or entry["grid_label"] != "gn":
            raise ValueError("Approved member/grid changed")
        if (set(entry["experiments"]) != {"historical", "ssp126", "ssp245", "ssp370", "ssp585"}
                or set(entry["static"]) != {"areacella", "sftlf"}):
            raise ValueError("Approved experiment/variable set changed")
        for variable, experiment, group in [
            *[("tas", name, group) for name, group in entry["experiments"].items()],
            *[(name, "historical", group) for name, group in entry["static"].items()],
        ]:
            if group["status"] not in ("catalogue-complete-not-content-validated",
                                       "catalogue-candidate-needs-grid-validation"):
                raise ValueError("Catalogue group not complete")
            for item in group["files"]:
                if (Path(item["file"]).name != item["file"]
                        or item["checksum_type"] != ["SHA256"]
                        or len(item["checksum"]) != 1
                        or not re.fullmatch("[a-f0-9]{64}", item["checksum"][0])):
                    raise ValueError("Unsafe filename or unsupported checksum")
                rows.append({**item, "source_id": model, "variable": variable,
                             "experiment": experiment})
    if sum(row["bytes"] for row in rows if row["source_id"] != "ACCESS-CM2") > LIMIT:
        raise ValueError("Approved byte budget exceeded")
    return rows


def download(item, destination, attempts):
    urls = list(dict.fromkeys(url.replace("http://", "https://", 1)
                             for url in item["http_urls"]))
    for url in urls[:3]:
        if not url.startswith("https://"):
            raise ValueError("HTTPS catalogue URL required")
        with tempfile.NamedTemporaryFile(dir=OUTPUT, suffix=".part", delete=False) as stream:
            temporary = Path(stream.name)
        try:
            print("Downloading", item["file"], url, flush=True)
            with urllib.request.urlopen(url, timeout=60) as response, temporary.open("wb") as stream:
                if not response.url.startswith("https://"):
                    raise ValueError("Refusing insecure redirect")
                count = 0
                while chunk := response.read(1024 * 1024):
                    count += len(chunk)
                    if count > item["bytes"]:
                        raise ValueError("Response exceeds approved file size")
                    stream.write(chunk)
            verify(temporary, item)
            temporary.replace(destination)
            attempts.append({"file": item["file"], "url": url, "status": "verified"})
            return
        except (OSError, ValueError) as error:
            attempts.append({"file": item["file"], "url": url, "status": "failed",
                             "error": str(error)})
            print("Failed:", str(error), flush=True)
        finally:
            temporary.unlink(missing_ok=True)
    raise RuntimeError(f"No verified HTTPS source succeeded: {item['file']}")


def main():
    rows = plan()
    OUTPUT.mkdir(parents=True, exist_ok=True)
    manifest = {"phase": "7C.3b", "approved_models": list(APPROVED),
                "new_saved_byte_limit": LIMIT, "inventory_sha256": sha256(INVENTORY / "inventory.json"),
                "status": "incomplete", "files": [], "attempts": []}
    previous_path = OUTPUT / "manifest.json"
    if previous_path.exists():
        previous = json.loads(previous_path.read_text(encoding="utf-8"))
        if (previous["approved_models"] != manifest["approved_models"]
                or previous["inventory_sha256"] != manifest["inventory_sha256"]):
            raise ValueError("Existing manifest belongs to a different approved inventory")
        manifest["attempts"] = previous["attempts"]
    write_manifest(manifest)
    for item in rows:
        path = (ROOT / "data_samples" / "2026-11-04" / "europe-pilot" / item["file"]
                if item["source_id"] == "ACCESS-CM2" else OUTPUT / item["file"])
        if item["source_id"] == "ACCESS-CM2" or path.exists():
            verify(path, item)
        else:
            try:
                download(item, path, manifest["attempts"])
            finally:
                write_manifest(manifest)
        manifest["files"].append({**item, "local_path": str(path.relative_to(ROOT)),
                                  "sha256": sha256(path)})
        write_manifest(manifest)
    manifest["status"] = "integrity-verified-not-content-validated"
    manifest["new_saved_bytes"] = sum(item["bytes"] for item in rows
                                      if item["source_id"] != "ACCESS-CM2")
    write_manifest(manifest)
    print("Verified", len(rows), "files; new saved bytes:", manifest["new_saved_bytes"])


if __name__ == "__main__":
    main()
