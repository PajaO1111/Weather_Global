"""Bounded, public-only phase 7C.2 retrieval; never used by visitor requests."""
import hashlib
import json
from pathlib import Path
import urllib.parse
import urllib.request
import uuid
from datetime import datetime, timezone

ROOT = Path(__file__).resolve().parents[2]
ARCHIVE = ROOT / "data_samples" / "2026-11-04" / "europe-pilot"
ARCHIVE.mkdir(exist_ok=True)
LOG = ARCHIVE / "access.json"


def record(entry):
    entry = {"at": datetime.now(timezone.utc).isoformat(), **entry}
    events = ARCHIVE / "access-events"
    events.mkdir(exist_ok=True)
    (events / f"{uuid.uuid4().hex}.json").write_text(json.dumps(entry, indent=2) + "\n")
    rows = json.loads(LOG.read_text()) if LOG.exists() else []
    rows.append(entry)
    LOG.write_text(json.dumps(rows, indent=2) + "\n")


def fetch(url, name, limit, expected=None):
    target = ARCHIVE / name
    if target.exists() and (expected is None or target.stat().st_size == expected):
        return target
    record({"url": url, "file": name, "estimated_max_bytes_before_transfer": limit,
            "expected_bytes": expected})
    try:
        with urllib.request.urlopen(url, timeout=35) as response:
            length = response.headers.get("Content-Length")
            if length and int(length) > limit:
                raise ValueError(f"Transfer exceeds approved bound: {length}")
            count = 0
            with target.with_suffix(target.suffix + ".partial").open("wb") as output:
                while chunk := response.read(1024 * 1024):
                    count += len(chunk)
                    if count > limit:
                        raise ValueError("Transfer exceeds approved bound")
                    output.write(chunk)
            if expected is not None and count != expected:
                raise ValueError(f"Expected {expected}, received {count}")
            target.with_suffix(target.suffix + ".partial").replace(target)
        record({"url": url, "file": name, "status": "ok", "bytes": count,
                "sha256": hashlib.sha256(target.read_bytes()).hexdigest()})
        return target
    except Exception as error:
        target.with_suffix(target.suffix + ".partial").unlink(missing_ok=True)
        record({"url": url, "file": name, "status": "failed", "error": str(error)})
        raise


def catalog(variable, experiment):
    query = urllib.parse.urlencode({
        "project": "CMIP6", "type": "File", "source_id": "ACCESS-CM2",
        "variant_label": "r1i1p1f1", "grid_label": "gn",
        "variable_id": variable, "experiment_id": experiment,
        "format": "application/solr+json", "limit": 100,
    })
    path = fetch("https://esgf-node.llnl.gov/esg-search/search/?" + query,
                 f"catalog-{variable}-{experiment}.json", 2_000_000)
    return json.loads(path.read_text())["response"]["docs"]


def main():
    import sys
    if "--geography" in sys.argv:
        for layer, maximum in [("land", 3_400_000), ("rivers_lake_centerlines", 2_200_000)]:
            fetch(f"https://naturalearth.s3.amazonaws.com/10m_physical/ne_10m_{layer}.zip",
                  f"ne_10m_{layer}.zip", maximum)
        fetch("https://naturalearthdata.com/about/terms-of-use/",
              "naturalearth-terms.html", 150_000)
        fetch("https://en.wikipedia.org/wiki/Boundaries_between_the_continents",
              "geographic-conventions.html", 900_000)
        return
    if "--history" in sys.argv:
        fetch("https://data.giss.nasa.gov/pub/gistemp/gistemp250_GHCNv4.nc.gz",
              "gistemp250_GHCNv4.nc.gz", 12_000_000)
        fetch("https://data.giss.nasa.gov/gistemp/data_v4.html",
              "nasa-data.html", 150_000)
        fetch("https://www.giss.nasa.gov/tools/",
              "nasa-use.html", 150_000)
        return
    evidence = json.loads((ARCHIVE.parent / "continents-feasibility" /
                           "feasibility_evidence.json").read_text())
    candidate = evidence["cmip6_europe_pilot_candidate"]
    sources = [{"variable": "tas", "experiment": "historical", **candidate["historical"]}]
    sources += [{"variable": "tas", **s, "experiment": s["experiment"]}
                for s in candidate["scenarios"]]
    sources += [{"experiment": "historical", **s} for s in candidate["matching_static_files"]]
    for source in sources:
        docs = catalog(source["variable"], source["experiment"])
        urls = []
        for doc in docs:
            if doc.get("title") != source["file"] or int(doc.get("size", 0)) != source["bytes"]:
                continue
            if str(source["version"]) not in str(doc.get("id")):
                continue
            for entry in doc.get("url", []):
                url, _, service = entry.split("|")
                if service == "HTTPServer":
                    secure = url.replace("http://", "https://", 1)
                    if secure not in urls:
                        urls.append(secure)
        record({"file": source["file"], "catalog_candidate_urls": urls})
        if not urls:
            print("NO CATALOG URL", source["file"], flush=True)
        for url in urls[:3]:
            try:
                fetch(url, source["file"], source["bytes"], source["bytes"])
                print("OK", source["file"], flush=True)
                break
            except Exception as error:
                print("FAILED", url, str(error), flush=True)
    fetch("https://naturalearth.s3.amazonaws.com/10m_cultural/ne_10m_admin_0_countries.zip",
          "ne_10m_admin_0_countries.zip", 5_100_000)


if __name__ == "__main__":
    main()
