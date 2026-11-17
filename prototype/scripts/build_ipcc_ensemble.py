#!/usr/bin/env python3
"""Download, verify, and aggregate the pinned IPCC Atlas CMIP6 monthly data."""

from __future__ import annotations

import argparse
import csv
import hashlib
import io
import json
import math
import re
import urllib.request
import zipfile
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

COMMIT = "ed29da33d38ae767d19caafd4cde06042cbe00f4"
DATA_PATH = "datasets-aggregated-regionally/data/CMIP6/CMIP6_tas_landsea"
EXPERIMENTS = ("historical", "ssp126", "ssp245", "ssp370", "ssp585")
BASE_URL = f"https://raw.githubusercontent.com/IPCC-WG1/Atlas/{COMMIT}/{DATA_PATH}"
TREE_URL = f"https://api.github.com/repos/IPCC-WG1/Atlas/git/trees/{COMMIT}?recursive=1"
USER_AGENT = "Weather-Global-phase6-local-data-builder/1.0"
SOURCE_MANIFEST_SHA256 = "d5f901b64f1c7e233b93e410e5d0ea47846188ec751f4fc6fa1b5b57767963b7"


def request_bytes(url: str, accept: str = "application/vnd.github+json") -> bytes:
    request = urllib.request.Request(
        url,
        headers={"User-Agent": USER_AGENT, "Accept": accept},
    )
    with urllib.request.urlopen(request, timeout=60) as response:
        if response.status != 200:
            raise RuntimeError(f"Unexpected HTTP {response.status} for {url}")
        return response.read()


def git_blob_sha(data: bytes) -> str:
    return hashlib.sha1(f"blob {len(data)}\0".encode() + data).hexdigest()


def parse_tree(tree_bytes: bytes) -> tuple[dict[tuple[str, str, str], tuple[str, str]], list[str]]:
    tree = json.loads(tree_bytes)
    if tree.get("sha") != COMMIT or tree.get("truncated"):
        raise RuntimeError("The pinned Git tree is invalid or truncated.")

    pattern = re.compile(r"CMIP6_(.+)_(historical|ssp126|ssp245|ssp370|ssp585)_(r\d+i\d+p\d+f\d+)\.csv$")
    entries: dict[tuple[str, str, str], tuple[str, str]] = {}
    for item in tree.get("tree", []):
        path = item.get("path", "")
        if not path.startswith(DATA_PATH + "/") or item.get("type") != "blob":
            continue
        match = pattern.fullmatch(path.rsplit("/", 1)[-1])
        if match:
            model, experiment, member = match.groups()
            entries[(model, member, experiment)] = (path, item["sha"])

    available = {
        experiment: {
            (model, member)
            for model, member, item_experiment in entries
            if item_experiment == experiment
        }
        for experiment in EXPERIMENTS
    }
    common = set.intersection(*(available[experiment] for experiment in EXPERIMENTS))
    if len(common) != 29 or len({model for model, _ in common}) != 29:
        raise RuntimeError(f"Expected 29 shared model/member pairs, found {len(common)}.")
    if any((model, member, experiment) not in entries for model, member in common for experiment in EXPERIMENTS):
        raise RuntimeError("A common model/member pair is missing an experiment.")
    return entries, [f"{model}|{member}" for model, member in sorted(common)]


def expected_months(first_year: int, last_year: int) -> list[str]:
    return [f"{year:04d}-{month:02d}" for year in range(first_year, last_year + 1) for month in range(1, 13)]


def parse_source(data: bytes, model: str, member: str, experiment: str) -> list[tuple[str, float]]:
    text = data.decode("utf-8-sig")
    metadata = {}
    lines = []
    for line in text.splitlines():
        if line.startswith("#"):
            key, separator, value = line[1:].partition(":")
            if separator:
                metadata[key.strip()] = value.strip()
        elif line.strip():
            lines.append(line)
    expected_metadata = {
        "Project": "CMIP6",
        "Experiment": experiment,
        "Model": f"{model}_{member}",
        "Variable": "tas",
        "Units": "degC",
        "Time_frequency": "month",
        "Area": "land and sea",
    }
    for key, expected in expected_metadata.items():
        if metadata.get(key) != expected:
            raise RuntimeError(f"{model} {experiment}: unexpected {key} metadata.")
    reader = csv.DictReader(lines)
    if reader.fieldnames is None or reader.fieldnames[0] != "date" or reader.fieldnames.count("world") != 1:
        raise RuntimeError(f"{model} {experiment}: missing or duplicate global column.")
    if len(reader.fieldnames) != 60:
        raise RuntimeError(f"{model} {experiment}: expected 60 columns, got {len(reader.fieldnames)}.")

    first, last = (1850, 2014) if experiment == "historical" else (2015, 2100)
    expected_dates = expected_months(first, last)
    points = []
    previous_date = None
    for row in reader:
        date = row.get("date", "")
        if not re.fullmatch(r"\d{4}-(0[1-9]|1[0-2])", date):
            raise RuntimeError(f"{model} {experiment}: invalid month label.")
        if previous_date is not None:
            previous_index = int(previous_date[:4]) * 12 + int(previous_date[5:])
            current_index = int(date[:4]) * 12 + int(date[5:])
            if current_index <= previous_index:
                raise RuntimeError(f"{model} {experiment}: duplicate or unsorted month labels.")
        previous_date = date
        if not first <= int(date[:4]) <= last:
            raise RuntimeError(f"{model} {experiment}: date outside the experiment period.")
        for column in reader.fieldnames[1:]:
            try:
                numeric_value = float(row[column])
            except (KeyError, TypeError, ValueError) as error:
                raise RuntimeError(f"{model} {experiment} {date}: nonnumeric {column} value.") from error
            if not math.isfinite(numeric_value) or not -100 <= numeric_value <= 100:
                raise RuntimeError(f"{model} {experiment} {date}: invalid {column} value.")
        value = float(row["world"])
        points.append((date, value))
    if not points:
        raise RuntimeError(f"{model} {experiment}: no numeric monthly rows.")
    return points


def summarize(member_values: dict[str, list[float]], expected_members: int) -> list[dict[str, float | int | str]]:
    if any(len(values) != expected_members for values in member_values.values()):
        raise RuntimeError("A year does not contain the complete, consistent model/member set.")
    summary = []
    for year, values in member_values.items():
        ordered = sorted(values)
        summary.append({
            "date": year,
            "minimum": round(ordered[0], 6),
            "median": round(ordered[len(ordered) // 2], 6),
            "maximum": round(ordered[-1], 6),
            "members": len(ordered),
        })
    return summary


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", type=Path, default=Path(__file__).resolve().parents[2])
    parser.add_argument("--offline", action="store_true", help="rebuild from the verified source ZIP")
    args = parser.parse_args()
    root = args.root.resolve()
    archive_directory = root / "data_samples" / "2026-11-04"
    archive_path = archive_directory / "ipcc_atlas_cmip6_sources.zip"
    manifest_path = archive_directory / "ipcc_atlas_cmip6_manifest.json"
    source_bytes: dict[str, bytes] = {}
    downloaded: dict[tuple[str, str, str], list[tuple[str, float]]] = {}
    if args.offline:
        input_manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
        if input_manifest.get("commit") != COMMIT:
            raise RuntimeError("The archived source manifest does not match the pinned commit.")
        members = input_manifest.get("common_members", [])
        records = input_manifest.get("sources", [])
        with zipfile.ZipFile(archive_path) as archive:
            for record in records:
                filename = record["file"]
                data = archive.read(f"raw/{filename}")
                if len(data) != record["bytes"] or hashlib.sha256(data).hexdigest() != record["sha256"]:
                    raise RuntimeError(f"Archived source checksum mismatch: {filename}")
                if git_blob_sha(data) != record["git_blob_sha1"]:
                    raise RuntimeError(f"Archived Git blob checksum mismatch: {filename}")
                model, member, experiment = record["model"], record["member"], record["experiment"]
                points = parse_source(data, model, member, experiment)
                if len(points) != record["rows"]:
                    raise RuntimeError(f"Archived source row-count mismatch: {filename}")
                downloaded[(model, member, experiment)] = points
    else:
        tree_bytes = request_bytes(TREE_URL)
        entries, members = parse_tree(tree_bytes)
        records = []
        selected = [
            (model, member, experiment, entries[(model, member, experiment)])
            for model_member in members
            for model, member in [model_member.split("|", 1)]
            for experiment in EXPERIMENTS
        ]
        with ThreadPoolExecutor(max_workers=8) as pool:
            futures = {
                pool.submit(request_bytes, f"https://raw.githubusercontent.com/IPCC-WG1/Atlas/{COMMIT}/{path}"): (
                    model, member, experiment, path, blob_sha
                )
                for model, member, experiment, (path, blob_sha) in selected
            }
            for future in as_completed(futures):
                model, member, experiment, path, blob_sha = futures[future]
                data = future.result()
                if git_blob_sha(data) != blob_sha:
                    raise RuntimeError(f"Git blob checksum mismatch: {path}")
                points = parse_source(data, model, member, experiment)
                filename = path.rsplit("/", 1)[-1]
                downloaded[(model, member, experiment)] = points
                source_bytes[filename] = data
                records.append({
                    "file": filename,
                    "experiment": experiment,
                    "model": model,
                    "member": member,
                    "url": f"https://github.com/IPCC-WG1/Atlas/blob/{COMMIT}/{path}",
                    "git_blob_sha1": blob_sha,
                    "sha256": hashlib.sha256(data).hexdigest(),
                    "bytes": len(data),
                    "rows": len(points),
                })
        records.sort(key=lambda item: (item["model"], item["member"], item["experiment"]))
        input_manifest = {
            "commit": COMMIT,
            "tree_sha256": hashlib.sha256(tree_bytes).hexdigest(),
            "source_count": len(records),
            "sources": records,
            "common_members": members,
        }

    if len(records) != 145:
        raise RuntimeError(f"Expected 145 verified files, found {len(records)}.")
    if input_manifest.get("source_count") != 145 or len(members) != 29:
        raise RuntimeError("The archived common-member inventory is incomplete.")
    manifest_hash = hashlib.sha256(
        json.dumps(input_manifest, sort_keys=True, separators=(",", ":")).encode()
    ).hexdigest()
    if manifest_hash != SOURCE_MANIFEST_SHA256:
        raise RuntimeError("The source manifest differs from the verified pinned input bundle.")

    eligible = []
    excluded = []
    expected_dates = {
        experiment: expected_months(*( (1850, 2014) if experiment == "historical" else (2015, 2100) ))
        for experiment in EXPERIMENTS
    }
    for model_member in members:
        model, member = model_member.split("|", 1)
        incomplete = []
        for experiment in EXPERIMENTS:
            actual = [date for date, _ in downloaded[(model, member, experiment)]]
            expected = expected_dates[experiment]
            if actual != expected:
                expected_set = set(expected)
                missing = [date for date in expected if date not in set(actual)]
                if missing:
                    incomplete.append(f"{experiment} missing {len(missing)} months ({missing[0]}–{missing[-1]})")
                else:
                    incomplete.append(f"{experiment} has unexpected month coverage")
        history_dates = {date for date, _ in downloaded[(model, member, "historical")]}
        if not all(date in history_dates for date in expected_dates["historical"][:612]):
            incomplete.append("historical 1850–1900 reference is incomplete")
        if incomplete:
            excluded.append({"member": model_member, "reason": "; ".join(incomplete)})
        else:
            eligible.append(model_member)
    if len(eligible) < 2:
        raise RuntimeError(f"Fewer than two complete model/member pairs remain ({len(eligible)}).")
    if len({item.split("|", 1)[0] for item in eligible}) != len(eligible):
        raise RuntimeError("The complete ensemble contains more than one realization per model.")

    baselines = {}
    historical_years: dict[str, list[float]] = {}
    scenario_years = {scenario: {} for scenario in EXPERIMENTS[1:]}
    for model_member in eligible:
        model, member = model_member.split("|", 1)
        history = downloaded[(model, member, "historical")]
        reference = [value for date, value in history if "1850-01" <= date <= "1900-12"]
        if len(reference) != 612:
            raise RuntimeError(f"{model_member}: incomplete 1850–1900 reference.")
        baseline = sum(reference) / 612
        baselines[model_member] = baseline
        for index in range(0, len(history), 12):
            year = history[index][0][:4]
            historical_years.setdefault(year, []).append(
                sum(value for _, value in history[index:index + 12]) / 12 - baseline
            )
        for scenario in EXPERIMENTS[1:]:
            series = downloaded[(model, member, scenario)]
            for index in range(0, len(series), 12):
                year = series[index][0][:4]
                scenario_years[scenario].setdefault(year, []).append(
                    sum(value for _, value in series[index:index + 12]) / 12 - baseline
                )

    result = {
        "schema_version": 1,
        "commit": COMMIT,
        "variable": "tas",
        "region": "world",
        "units": "degC anomaly",
        "reference_period": "1850-1900",
        "reference_months": 612,
        "annual_aggregation": "Arithmetic mean of all 12 monthly values; equal month weights.",
        "ensemble_aggregation": "One equally weighted realization per model; median and observed minimum/maximum.",
        "baseline_units": "degC absolute tas mean",
        "baseline_means": {member: round(value, 6) for member, value in baselines.items()},
        "calendar": "Calendar metadata are not encoded in these monthly CSV files.",
        "calendar_method": "Equal weighting of 12 monthly means; no day-count calendar is inferred or applied.",
        "available_common_member_count": len(members),
        "model_count": len(eligible),
        "members": eligible,
        "excluded_members": excluded,
        "source_manifest_sha256": manifest_hash,
        "historical": summarize(historical_years, len(eligible)),
        "scenarios": {scenario: summarize(scenario_years[scenario], len(eligible)) for scenario in EXPERIMENTS[1:]},
    }

    archive_directory.mkdir(parents=True, exist_ok=True)
    if not args.offline:
        with zipfile.ZipFile(archive_path, "w", zipfile.ZIP_DEFLATED, compresslevel=8) as archive:
            for filename, data in sorted(source_bytes.items()):
                archive.writestr(f"raw/{filename}", data)
        manifest_path.write_text(json.dumps(input_manifest, indent=2) + "\n", encoding="utf-8")
    output_directory = root / "prototype" / "backend" / "private" / "data"
    output_directory.mkdir(parents=True, exist_ok=True)
    summary_path = output_directory / "ipcc_cmip6_ensemble.json"
    summary_path.write_text(json.dumps(result, separators=(",", ":"), allow_nan=False) + "\n", encoding="utf-8")
    print(json.dumps({
        "sources": len(records),
        "available_common_members": len(members),
        "members": len(eligible),
        "excluded_members": excluded,
        "scenarios": list(result["scenarios"]),
        "historical_years": len(result["historical"]),
        "scenario_years": {key: len(value) for key, value in result["scenarios"].items()},
        "source_manifest_sha256": manifest_hash,
        "summary_sha256": hashlib.sha256(summary_path.read_bytes()).hexdigest(),
        "archive_bytes": (archive_directory / "ipcc_atlas_cmip6_sources.zip").stat().st_size,
        "archive_sha256": hashlib.sha256(archive_path.read_bytes()).hexdigest(),
        "summary_path": str(summary_path),
    }, indent=2))


if __name__ == "__main__":
    main()
