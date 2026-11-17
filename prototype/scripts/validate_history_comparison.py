"""Independent raw-record/reference proof and invariants for the historical views."""
import calendar
import gzip
import json
import math
import struct
from pathlib import Path

import numpy as np
from shapely.geometry import box
from shapely.ops import unary_union

from build_history_comparison import BASELINE, OUTPUT, PREVIOUS, SOURCE, SOURCE_SHA, VERSION
from continental_weights import require
from fetch_cmip6_europe_pair import sha256


def decode_independently():
    payload = gzip.decompress(SOURCE.read_bytes())
    position = 0
    records = []
    while position < len(payload):
        length = int.from_bytes(payload[position:position + 4], "big", signed=True)
        require(0 < length < 100000 and position + length + 8 <= len(payload), "Raw framing invalid")
        start = position + 4
        end = start + length
        require(payload[position:position + 4] == payload[end:end + 4], "Raw record footer mismatch")
        records.append(payload[start:end])
        position = end + 4
    require(len(records) == 8001 and len(records[0]) == 112, "Expected 8000 NASA source boxes")
    header = struct.unpack(">8i", records[0][:32])
    require(header[5] == 1880 and header[6] == 9999, "Unexpected raw time or missing marker")
    raw = np.full((8000, header[3]), np.nan)
    bounds = []
    expected_length = header[0]
    for i, record in enumerate(records[1:]):
        require(len(record) == expected_length * 4 + 32, "Next-record pointer mismatch")
        fields = struct.unpack(">7if", record[:32])
        values = np.asarray(struct.unpack(f">{expected_length}f", record[32:]))
        raw[i, :expected_length] = np.where(values == 9999, np.nan, values)
        bounds.append(tuple(x / 100 for x in fields[1:5]))
        expected_length = fields[0]
    end = int(np.flatnonzero(np.isfinite(raw).any(axis=0))[-1]) + 1
    shapes = [box(west, south, east, north) for south, north, west, east in bounds]
    union = unary_union(shapes)
    require(union.symmetric_difference(box(-180, -90, 180, 90)).area < 1e-8,
            "Source grid does not cover the globe")
    require(abs(sum(s.area for s in shapes) - union.area) < 1e-8, "Source boxes overlap")
    reference = raw[:, (1981 - 1880) * 12:(2011 - 1880) * 12]
    eligible = np.isfinite(reference).all(axis=1)
    native = np.full((8000, end), np.nan)
    for i in np.flatnonzero(eligible):
        for month in range(12):
            mean = math.fsum(reference[i, month::12]) / 30
            native[i, month::12] = raw[i, month:end:12] - mean
    return native, np.asarray(bounds)


def reduce_scalar(native, weights, month):
    pairs = [(float(w), float(v)) for w, v in zip(weights, native[:, month]) if w > 0 and math.isfinite(v)]
    total = math.fsum(float(w) for w in weights)
    available = math.fsum(w for w, _ in pairs)
    coverage = available / total
    if coverage + 1e-12 < .90:
        return None, coverage
    return math.fsum(w * v for w, v in pairs) / available, coverage


def composition_diagnostic(native, weights, region, period):
    start, stop = (period["start"] - 1880) * 12, (period["end"] + 1 - 1880) * 12
    fixed = (weights > 0) & np.isfinite(native[:, start:stop]).all(axis=1)
    fraction = float(weights[fixed].sum() / weights.sum())
    if not fixed.any():
        return {"fixed_footprint_fraction": fraction, "comparison_years": 0}
    fixed_weights = weights[fixed]
    monthly = fixed_weights @ native[fixed] / fixed_weights.sum()
    ref = range((1981 - 1880) * 12, (2011 - 1880) * 12)
    days = [calendar.monthrange(1880 + i // 12, i % 12 + 1)[1] for i in ref]
    offset = math.fsum(monthly[i] * d for i, d in zip(ref, days)) / sum(days)
    years, differences, values = [], [], []
    conservative = {int(p["date"]): p["value"] for p in region["conservative"]["annual"]}
    exploratory = {int(p["date"]): p["value"] for p in region["exploratory"]["annual"]}
    for year in range(period["start"], period["end"] + 1):
        if conservative[year] is None:
            continue
        axis = range((year - 1880) * 12, (year + 1 - 1880) * 12)
        days = [calendar.monthrange(year, month + 1)[1] for month in range(12)]
        value = math.fsum(monthly[i] * d for i, d in zip(axis, days)) / sum(days) - offset
        years.append(year)
        values.append(value)
        differences.append(value - conservative[year])
    return {
        "fixed_footprint_fraction": fraction, "comparison_years": len(years),
        "maximum_annual_difference_degC": max(map(abs, differences)) if differences else None,
        "fixed_footprint_trend_degC_per_decade": float(np.polyfit(years, values, 1)[0] * 10)
        if len(years) > 1 else None,
        "conservative_trend_degC_per_decade": float(np.polyfit(
            years, [conservative[y] for y in years], 1)[0] * 10) if len(years) > 1 else None,
        "exploratory_trend_degC_per_decade": float(np.polyfit(
            years, [exploratory[y] for y in years], 1)[0] * 10)
        if len(years) > 1 and all(exploratory[y] is not None for y in years) else None,
        "interpretation": "Sensitivity on a fixed available subset, not a replacement whole-continent estimate or a confidence interval.",
    }


def exploratory_scalar_proof(native, bounds, weights, region):
    """Reconstruct estimates independently using chord distances and scalar annual sums."""
    targets = np.flatnonzero(weights > 0)
    values = native[targets].copy()
    spatial = np.zeros(values.shape, dtype=bool)
    temporal = np.zeros(values.shape, dtype=bool)
    for row in range(len(values)):
        good = np.flatnonzero(np.isfinite(values[row]))
        for left, right in zip(good[:-1], good[1:]):
            if 1 < right - left <= 3:
                for month in range(left + 1, right):
                    fraction = (month - left) / (right - left)
                    values[row, month] = (1 - fraction) * native[targets[row], left] + fraction * native[targets[row], right]
                    temporal[row, month] = True
    source_axis = np.flatnonzero(np.isfinite(native[targets]).any(axis=0))
    eligible = np.isfinite(native[:, (1981 - 1880) * 12:(2011 - 1880) * 12]).all(axis=1)
    donors = targets[eligible[targets]]
    lat = np.radians(bounds[:, :2].mean(axis=1))
    lon = np.radians(bounds[:, 2:].mean(axis=1))
    vectors = np.column_stack((np.cos(lat) * np.cos(lon), np.cos(lat) * np.sin(lon), np.sin(lat)))
    for row, target in enumerate(targets):
        candidates = donors[donors != target]
        chord = np.sqrt(np.sum((vectors[candidates] - vectors[target]) ** 2, axis=1))
        distances = 2 * 6371.0088 * np.arcsin(np.clip(chord / 2, 0, 1))
        order = np.lexsort((candidates, np.round(distances, 6)))[:3]
        if len(order) != 3 or distances[order[-1]] > 1200:
            continue
        chosen = candidates[order]
        inverse = 1 / np.maximum(distances[order], 1) ** 2
        fractions = inverse / inverse.sum()
        missing = np.flatnonzero(~np.isfinite(values[row]))
        for month in missing:
            if source_axis[0] <= month <= source_axis[-1] and np.isfinite(native[chosen, month]).all():
                values[row, month] = math.fsum(float(w * native[d, month]) for d, w in zip(chosen, fractions))
                spatial[row, month] = True
    start, stop = (1981 - 1880) * 12, (2011 - 1880) * 12
    eligible = np.isfinite(values[:, start:stop]).all(axis=1)
    for row in np.flatnonzero(eligible):
        for month in range(12):
            mean = math.fsum(values[row, start + month:stop:12]) / 30
            values[row, month::12] -= mean
    values[~eligible] = np.nan
    temporal &= np.isfinite(values)
    spatial &= np.isfinite(values)
    selected_weights = weights[targets]
    reference = []
    reference_days = []
    for month in range(start, stop):
        value, _ = reduce_scalar(values, selected_weights, month)
        require(value is not None, "Independent exploratory reference incomplete")
        reference.append(value)
        reference_days.append(calendar.monthrange(1880 + month // 12, month % 12 + 1)[1])
    offset = math.fsum(v * d for v, d in zip(reference, reference_days)) / sum(reference_days)
    require(abs(offset - region["exploratory"]["reference_offset_degC"]) < 1e-10,
            "Independent exploratory reference offset mismatch")
    checks = []
    for year in (1880, 1926, 1981, 2010, 2025):
        means, days, spatial_shares, temporal_shares = [], [], [], []
        for m in range(12):
            month = (year - 1880) * 12 + m
            value, _ = reduce_scalar(values, selected_weights, month)
            means.append(value)
            days.append(calendar.monthrange(year, m + 1)[1])
            total = math.fsum(selected_weights)
            spatial_shares.append(math.fsum(selected_weights[spatial[:, month]]) / total)
            temporal_shares.append(math.fsum(selected_weights[temporal[:, month]]) / total)
        expected = (math.fsum(v * d for v, d in zip(means, days)) / sum(days) - offset
                    if all(v is not None for v in means) else None)
        point = region["exploratory"]["annual"][year - 1880]
        require((point["value"] is None) == (expected is None), "Independent exploratory availability mismatch")
        if expected is not None:
            require(abs(point["value"] - expected) < 1e-10, "Independent exploratory annual mismatch")
        for key, shares in (("spatial_estimate_fraction", spatial_shares),
                            ("temporal_estimate_fraction", temporal_shares)):
            share = math.fsum(v * d for v, d in zip(shares, days)) / sum(days)
            require(abs(point[key] - share) < 1e-10, "Independent project estimate-share mismatch")
        checks.append({"year": year, "value": expected})
    return {"reference_months": 360, "reference_offset_degC": offset, "annual_scalar_checks": checks}


def validate():
    artifact = OUTPUT / "history_comparison_v1.json"
    data = json.loads(artifact.read_text(encoding="utf-8"))
    catalog = json.loads((OUTPUT / "catalog.json").read_text(encoding="utf-8"))
    require(sha256(SOURCE) == SOURCE_SHA, "Source hash changed")
    require(data["version"] == VERSION and data["publication_allowed"] is False
            and data["baseline"] == list(BASELINE), "Scientific identity changed")
    require(catalog["product"]["sha256"] == sha256(artifact)
            and catalog["product"]["bytes"] == artifact.stat().st_size, "Catalog byte pin changed")
    require(data["provenance"]["implementation_sha256"]
            == sha256(Path(__file__).with_name("build_history_comparison.py")), "Producer changed")
    require(data["provenance"]["previous_bundle_sha256"]
            == sha256(PREVIOUS / "continental_temperatures_v1.json"), "Previous bundle changed")
    require(data["provenance"]["weights_sha256"] == sha256(OUTPUT / "sbbx_weights.npz"), "Weights changed")
    native, bounds = decode_independently()
    with np.load(OUTPUT / "sbbx_weights.npz", allow_pickle=False) as stored:
        weights = stored["weights"]
    require(weights.shape == (7, 8000) and np.isfinite(weights).all() and (weights >= 0).all(),
            "Invalid continental weight arrays")
    proof, composition = [], {}
    reference_start, reference_stop = (1981 - 1880) * 12, (2011 - 1880) * 12
    reference_days = [calendar.monthrange(1880 + i // 12, i % 12 + 1)[1]
                      for i in range(reference_start, reference_stop)]
    for k, region in enumerate(data["regions"]):
        require(region["id"] == catalog["regions"][k]["id"], "Catalog region mismatch")
        require(abs(float(weights[k].sum()) - region["area_m2"]) < max(100, region["area_m2"] * 1e-8),
                "Continent area mismatch")
        for view in ("conservative", "exploratory"):
            points = region[view]["annual"]
            require([int(p["date"]) for p in points] == list(range(1880, 2027)), "Time axis changed")
            valid = []
            for point in points:
                shares = [point[key] for key in ("coverage", "source_coverage", "spatial_estimate_fraction",
                                                "temporal_estimate_fraction", "long_range_fraction")]
                require(all(math.isfinite(x) and -1e-12 <= x <= 1 + 1e-12 for x in shares),
                        "Invalid coverage/estimate share")
                require(abs(point["coverage"] - sum(shares[1:4])) < 1e-10, "Coverage categories not disjoint")
                require(point["long_range_fraction"] <= point["source_coverage"] + 1e-12,
                        "Long-range diagnostic exceeds source area")
                if view == "conservative":
                    require(shares[2] == 0 and shares[3] == 0, "Estimates leaked into conservative view")
                if point["value"] is None:
                    require(point["missing_reasons"] and point["status"] in ("missing", "blocked-geography"),
                            "Unexplained missing value")
                else:
                    require(math.isfinite(point["value"]) and not point["missing_reasons"]
                            and point["status"] in ("available", "estimated"), "Invalid finite annual value")
                    valid.append(int(point["date"]))
            require(region[view]["summary"] == {
                "valid_count": len(valid), "first_valid": min(valid) if valid else None,
                "last_valid": max(valid) if valid else None,
            }, "Annual summary mismatch")
            require(points[-1]["value"] is None and "incomplete-source-year" in points[-1]["missing_reasons"],
                    "Partial 2026 year presented as a complete annual result")
        reference_values = []
        for month in range(reference_start, reference_stop):
            value, _ = reduce_scalar(native, weights[k], month)
            require(value is not None, "Independent regional reference incomplete")
            reference_values.append(value)
        offset = math.fsum(v * d for v, d in zip(reference_values, reference_days)) / sum(reference_days)
        require(abs(offset - region["conservative"]["reference_offset_degC"]) < 1e-10,
                "Independent reference offset mismatch")
        checks = []
        for year in (1880, 1926, 1981, 2010, 2025):
            values, coverage, days = [], [], []
            for month in range(12):
                value, cover = reduce_scalar(native, weights[k], (year - 1880) * 12 + month)
                values.append(value)
                coverage.append(cover)
                days.append(calendar.monthrange(year, month + 1)[1])
            expected = (math.fsum(v * d for v, d in zip(values, days)) / sum(days) - offset
                        if all(v is not None for v in values) and region["id"] != "antarctica" else None)
            point = region["conservative"]["annual"][year - 1880]
            require((point["value"] is None) == (expected is None), "Independent annual availability mismatch")
            if expected is not None:
                require(abs(point["value"] - expected) < 1e-10, "Independent annual scalar value mismatch")
            expected_coverage = math.fsum(c * d for c, d in zip(coverage, days)) / sum(days)
            require(abs(point["coverage"] - expected_coverage) < 1e-10, "Independent source coverage mismatch")
            checks.append({"year": year, "value": expected, "coverage": expected_coverage})
        if region["id"] == "antarctica":
            require(region["status"] == "provisional-geography"
                    and all(p["value"] is None for p in region["conservative"]["annual"]),
                    "Unverified Antarctica exposed as conservative")
        # Source envelope is based on actual regional availability, not first passing annual value.
        source_months = np.flatnonzero(np.isfinite(native[weights[k] > 0]).any(axis=0))
        low, high = 1880 + source_months[0] // 12, 1880 + source_months[-1] // 12
        require(all(p["value"] is None or low <= int(p["date"]) <= high
                    for p in region["exploratory"]["annual"]), "Estimated history extends source envelope")
        exploratory = exploratory_scalar_proof(native, bounds, weights[k], region)
        proof.append({"region": region["id"], "reference_months": 360,
                      "independent_reference_offset_degC": offset, "annual_scalar_checks": checks,
                      "independent_exploratory": exploratory})
        if region["id"] in data["common_period"]["regions"]:
            composition[region["id"]] = composition_diagnostic(
                native, weights[k], region, data["common_period"])
        print(f"Independent {region['id']}: reference and raw-cell annual checks PASS", flush=True)
    period = data["common_period"]
    for year in range(period["start"], period["end"] + 1):
        require(all(next(p for p in r["conservative"]["annual"] if int(p["date"]) == year)["value"] is not None
                    for r in data["regions"] if r["id"] in period["regions"]), "Common period spans a gap")
    previous_validation = json.loads((OUTPUT / "validation.json").read_text(encoding="utf-8"))
    previous_validation.update({
        "status": "PASS-two-local-views-with-explicit-estimates-and-scientific-limits",
        "validator_sha256": sha256(Path(__file__)), "independent_raw_proof": proof,
        "source_global_tiling": "PASS", "legacy_unchanged": True,
        "fixed_footprint_sensitivity": composition,
    })
    (OUTPUT / "validation.json").write_text(json.dumps(previous_validation, ensure_ascii=False, indent=2)
                                          + "\n", encoding="utf-8")
    files = ["history_comparison_v1.json", "catalog.json", "validation.json",
             "sbbx_weights.npz", "sbbx_weights.json"]
    (OUTPUT / "outputs.json").write_text(json.dumps({"files": [{
        "file": name, "bytes": (OUTPUT / name).stat().st_size, "sha256": sha256(OUTPUT / name),
    } for name in files]}, indent=2) + "\n", encoding="utf-8")
    print(previous_validation["status"])


if __name__ == "__main__":
    validate()
