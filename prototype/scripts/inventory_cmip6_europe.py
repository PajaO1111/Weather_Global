"""Bounded public ESGF metadata inventory; never downloads climate fields."""
import hashlib
import json
import re
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
OUTPUT = ROOT / "data_samples" / "2026-11-06" / "europe-cmip6-inventory"
ENDPOINT = "https://esgf-node.llnl.gov/esg-search/search/"
MODELS = {"ACCESS-CM2": "gn", "CanESM5": "gn", "IPSL-CM6A-LR": "gr",
          "MPI-ESM1-2-LR": "gn", "MRI-ESM2-0": "gn"}
EXPERIMENTS = ("historical", "ssp126", "ssp245", "ssp370", "ssp585")


def query(model, grid, variable, experiment):
    params = {
        "project": "CMIP6", "type": "File", "source_id": model,
        "variant_label": "r1i1p1f1", "grid_label": grid,
        "variable_id": variable, "table_id": "Amon" if variable == "tas" else "fx",
        "experiment_id": experiment, "latest": "true", "replica": "false",
        "format": "application/solr+json", "limit": 500,
    }
    url = ENDPOINT + "?" + urllib.parse.urlencode(params)
    with urllib.request.urlopen(url, timeout=60) as response:
        raw = response.read(4_000_001)
    if len(raw) > 4_000_000:
        raise ValueError("Metadata response exceeds 4 MB bound")
    payload = json.loads(raw)
    result = payload["response"]
    if result["numFound"] > len(result["docs"]):
        raise ValueError("Metadata result truncated; narrower query required")
    name = f"{model.lower()}-{variable}-{experiment}.json"
    (OUTPUT / name).write_bytes(raw)
    return result["docs"], {
        "query_url": url, "file": name, "bytes": len(raw),
        "sha256": hashlib.sha256(raw).hexdigest(), "num_found": result["numFound"],
    }


def month_index(year, month):
    if not 1 <= month <= 12:
        raise ValueError("Invalid month in catalogue filename")
    return year * 12 + month - 1


def reusable_bytes(item):
    path = ROOT / "data_samples" / "2026-11-04" / "europe-pilot" / item["file"]
    if Path(item["file"]).name != item["file"] or not path.is_file():
        return 0
    if path.stat().st_size != item["bytes"] or item["checksum_type"] != ["SHA256"]:
        return 0
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return item["bytes"] if item["checksum"] == [digest.hexdigest()] else 0


def summarize(docs, experiment, variable="tas"):
    files = {}
    for doc in docs:
        name = doc["title"]
        item = {
            "file": name, "bytes": int(doc["size"]), "id": doc["id"],
            "checksum": doc.get("checksum"), "checksum_type": doc.get("checksum_type"),
            "version": doc.get("version"),
            "http_urls": [entry.split("|")[0] for entry in doc.get("url", [])
                          if entry.split("|")[-1] == "HTTPServer"],
        }
        if name in files:
            if any(files[name][key] != item[key] for key in ("bytes", "checksum", "checksum_type")):
                raise ValueError(f"Conflicting catalogue records for {name}")
            files[name]["http_urls"] = sorted(set(files[name]["http_urls"] + item["http_urls"]))
        else:
            files[name] = item
    selected = list(files.values())
    if variable != "tas":
        return {
            "status": "catalogue-candidate-needs-grid-validation" if len(selected) == 1
                      else "absent-or-ambiguous",
            "bytes": sum(item["bytes"] for item in selected), "files": selected,
        }
    start, end = (1850, 2014) if experiment == "historical" else (2015, 2100)
    first, last = month_index(start, 1), month_index(end, 12)
    coverage = {}
    relevant = []
    unknown = []
    for item in selected:
        match = re.search(r"_(\d{4})(\d{2})-(\d{4})(\d{2})\.nc$", item["file"])
        if not match:
            unknown.append(item["file"])
            continue
        left, right = month_index(int(match[1]), int(match[2])), month_index(int(match[3]), int(match[4]))
        if right < left:
            raise ValueError("Reversed catalogue interval")
        if right < first or left > last:
            continue
        relevant.append(item)
        for index in range(max(left, first), min(right, last) + 1):
            coverage[index] = coverage.get(index, 0) + 1
    missing = sum(index not in coverage for index in range(first, last + 1))
    overlap = sum(count > 1 for count in coverage.values())
    return {
        "status": "catalogue-complete-not-content-validated"
                  if missing == 0 and overlap == 0 and not unknown else "review-required",
        "required_years": [start, end], "missing_months": missing,
        "overlapping_months": overlap, "unparsed_files": unknown,
        "bytes": sum(item["bytes"] for item in relevant), "files": relevant,
    }


def main():
    OUTPUT.mkdir(parents=True, exist_ok=True)
    report = {
        "phase": "7C.3a", "created_at": datetime.now(timezone.utc).isoformat(),
        "status": "metadata-only-no-download-approved",
        "scope": "Five provisional model candidates, not a final or exhaustive ensemble.",
        "selection": "One r1i1p1f1 member per source_id; gn except IPSL gr; not yet approved.",
        "grid_note": "IPSL exact gn queries returned zero; gr has catalogue results. Do not assume gr is native or grid-compatible before NetCDF validation.",
        "inventory_complete": False,
        "models": [], "queries": [],
        "unverified": [
            "NetCDF calendars, units, bounds, parent experiment/member continuity and actual monthly coverage.",
            "Model/static coordinate compatibility and fractional land weights on the existing Europe mask.",
            "Each selected version's redistribution licence and attribution.",
            "Historical-only fx absence does not imply that compatible fx fields are unavailable in other experiments.",
            "Disk workspace/decoded-memory needs and final baseline/statistic policy.",
        ],
        "proposed_policy": {
            "geography": "Existing europe-kuma-manych-cyprus-v1, not CDS EU27.",
            "baseline": "1981-2010 as in native pilot; approval required. CDS 1991-2020 is separate.",
            "annual_weights": "Source-calendar month duration; all 12 months required.",
            "ensemble": "One equally weighted model value; proposed median and P10-P90 with explicit quantile method.",
            "uncertainty": "Model spread, not confidence interval or probabilistic forecast; shared model ancestry remains.",
        },
    }
    for model, grid in MODELS.items():
        row = {"source_id": model, "variant_label": "r1i1p1f1", "grid_label": grid, "experiments": {}, "static": {}}
        for variable, experiment in [( "tas", e) for e in EXPERIMENTS] + [
                ("areacella", "historical"), ("sftlf", "historical")]:
            docs, evidence = query(model, grid, variable, experiment)
            report["queries"].append(evidence)
            group = row["experiments"] if variable == "tas" else row["static"]
            group[experiment if variable == "tas" else variable] = summarize(docs, experiment, variable)
            print(model, variable, experiment, len(docs), flush=True)
        row["catalogue_bytes"] = sum(item["bytes"] for item in
                                     [*row["experiments"].values(), *row["static"].values()])
        row["verified_reusable_bytes"] = sum(reusable_bytes(item)
            for group in [*row["experiments"].values(), *row["static"].values()]
            for item in group["files"])
        row["additional_catalogue_bytes"] = row["catalogue_bytes"] - row["verified_reusable_bytes"]
        report["models"].append(row)
        report["inventory_complete"] = len(report["models"]) == len(MODELS)
        temporary = OUTPUT / "inventory.json.tmp"
        temporary.write_text(json.dumps(report, indent=2, allow_nan=False) + "\n", encoding="utf-8")
        temporary.replace(OUTPUT / "inventory.json")
    print("Catalogue bytes (not download authorization):",
          sum(row["catalogue_bytes"] for row in report["models"]))


if __name__ == "__main__":
    main()
