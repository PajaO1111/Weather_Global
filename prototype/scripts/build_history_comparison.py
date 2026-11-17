"""Two explicitly separated historical views of the archived NASA 1200km analysis."""
import calendar
import gzip
import hashlib
import json
import math
import struct
from pathlib import Path

import numpy as np
from shapely.geometry import mapping, shape

import build_continent_masks as base
import build_reviewed_continent_masks as review
from continental_weights import NAMES, load_masks, require
from continent_geometry_area import lonlat_area
from fetch_cmip6_europe_pair import sha256
from validate_reviewed_continent_masks import cell_area, geometry_index, grid_cell

OUTPUT = base.ROOT / "data_samples" / "2026-11-06" / "continents-history-7c8"
PREVIOUS = OUTPUT.parent / "continents-7c-completion"
SOURCE = PREVIOUS / "source-review" / "nasa-SBBX1880-Ts-GHCNv4-1200.gz"
SOURCE_SHA = "3b42c078c953edeb5547def42bcc15a187b8ca6bb2393b37bc1bbc185fccb97a"
BASELINE = (1981, 2010)
COVERAGE = .90
MAX_GAP = 2
RADIUS_KM = 1200
NEIGHBORS = 3
VERSION = "7c8-history-comparison-v1"


def read_record(stream):
    marker = stream.read(4)
    require(len(marker) == 4, "Truncated SBBX record marker")
    size, = struct.unpack(">i", marker)
    require(0 < size <= 100000, "Invalid SBBX record size")
    data = stream.read(size)
    end = stream.read(4)
    require(len(data) == size and len(end) == 4 and struct.unpack(">i", end)[0] == size,
            "Truncated or inconsistent SBBX record")
    return data


def parse_sbbx(stream, box_count=8000):
    header = read_record(stream)
    require(len(header) == 112, "Unexpected SBBX header length")
    info = struct.unpack(">8i", header[:32])
    next_length, _, _, months, _, first_year, missing, _ = info
    require(0 < months < 5000 and 1800 <= first_year <= 2100 and missing == 9999,
            "Unsupported SBBX header")
    data = np.full((box_count, months), np.nan)
    bounds = np.zeros((box_count, 4))
    distance = np.zeros(box_count)
    for i in range(box_count):
        record = read_record(stream)
        require(len(record) == 32 + 4 * next_length, "SBBX next-record length mismatch")
        metadata = struct.unpack(">7if", record[:32])
        values = np.frombuffer(record[32:], dtype=">f4").astype(float)
        require(len(values) <= months, "SBBX time axis exceeds header")
        require(np.isfinite(values).all(), "Nonfinite SBBX source value")
        values[values == missing] = np.nan
        require(np.all(np.abs(values[np.isfinite(values)]) < 100), "Implausible SBBX anomaly")
        data[i, :len(values)] = values
        bounds[i] = np.asarray(metadata[1:5]) / 100
        south, north, west, east = bounds[i]
        require(-90 <= south < north <= 90 and -180 <= west < east <= 180,
                "Invalid SBBX box boundaries")
        distance[i] = metadata[7]
        require(math.isfinite(distance[i]) and distance[i] >= 0, "Invalid source station distance")
        next_length = metadata[0]
    require(stream.read(1) == b"", "Trailing or extra SBBX records")
    require(np.isfinite(data).any(), "Empty SBBX source")
    last_month = int(np.flatnonzero(np.isfinite(data).any(axis=0))[-1])
    return data[:, :last_month + 1], bounds, distance, {
        "first_year": first_year, "months": last_month + 1,
        "header_months": months, "title": header[32:].decode("ascii").strip(),
        "last_year": first_year + last_month // 12, "last_month": last_month % 12 + 1,
    }


def normalize_boxes(values, first_year, baseline=BASELINE):
    """Rebase each calendar month separately; arbitrary source box offsets cancel."""
    data = np.asarray(values, dtype=float)
    start, stop = (baseline[0] - first_year) * 12, (baseline[1] + 1 - first_year) * 12
    require(0 <= start < stop <= data.shape[1], "Source does not span the chosen reference")
    reference = data[:, start:stop]
    eligible = np.isfinite(reference).all(axis=1)
    output = np.full_like(data, np.nan)
    for month in range(12):
        means = reference[eligible, month::12].mean(axis=1)
        output[np.ix_(eligible, np.arange(month, data.shape[1], 12))] = (
            data[eligible, month::12] - means[:, None])
    return output, eligible


def fill_internal(values, max_gap=MAX_GAP):
    """Linear estimates only for bounded runs of at most two missing months."""
    data = np.asarray(values, dtype=float)
    output = data.copy()
    estimated = np.zeros(data.shape, dtype=bool)
    for row in range(len(data)):
        good = np.flatnonzero(np.isfinite(data[row]))
        for left, right in zip(good[:-1], good[1:]):
            gap = int(right - left - 1)
            if 0 < gap <= max_gap:
                output[row, left + 1:right] = np.linspace(data[row, left], data[row, right], gap + 2)[1:-1]
                estimated[row, left + 1:right] = True
    return output, estimated


def neighbor_plan(bounds, weights, eligible):
    """Three native-baseline donors in the same continent, at most 1200km away."""
    lat = np.radians((bounds[:, 0] + bounds[:, 1]) / 2)
    lon = np.radians((bounds[:, 2] + bounds[:, 3]) / 2)
    plans = []
    for region_weights in weights:
        targets = np.flatnonzero(region_weights > 0)
        donors = targets[eligible[targets]]
        plan = {}
        for target in targets:
            candidates = donors[donors != target]
            haversine = (np.sin((lat[candidates] - lat[target]) / 2) ** 2
                         + np.cos(lat[target]) * np.cos(lat[candidates])
                         * np.sin((lon[candidates] - lon[target]) / 2) ** 2)
            distances = 2 * 6371.0088 * np.arcsin(np.sqrt(np.clip(haversine, 0, 1)))
            # Millimetre-equivalent distance ties use immutable source-box order.
            order = np.lexsort((candidates, np.round(distances, 6)))[:NEIGHBORS]
            selected = candidates[order]
            d = distances[order]
            if len(selected) == NEIGHBORS and d[-1] <= RADIUS_KM:
                inverse = 1 / np.maximum(d, 1) ** 2
                plan[int(target)] = (selected, inverse / inverse.sum())
        plans.append(plan)
    return plans


def fill_spatial(native, temporal, temporal_flags, plan, weights):
    output = temporal.copy()
    spatial_flags = np.zeros(native.shape, dtype=bool)
    region_values = native[weights > 0]
    available = np.flatnonzero(np.isfinite(region_values).any(axis=0))
    if not len(available):
        return output, spatial_flags
    # Only the region's existing source envelope is eligible; no historical extension.
    envelope = np.zeros(native.shape[1], dtype=bool)
    envelope[available[0]:available[-1] + 1] = True
    for target, (donors, fractions) in plan.items():
        months = (~np.isfinite(output[target]) & envelope
                  & np.isfinite(native[donors]).all(axis=0))
        if months.any():
            output[target, months] = fractions @ native[np.ix_(donors, months)]
            spatial_flags[target, months] = True
    require(not (spatial_flags & temporal_flags).any(), "Overlapping estimate categories")
    return output, spatial_flags


def weighted_months(values, weights, spatial, temporal, distance):
    finite = np.isfinite(values)
    total = float(weights.sum())
    require(total > 0, "Empty continent weights")
    available = weights @ finite
    coverage = np.clip(available / total, 0, 1)
    means = np.full(values.shape[1], np.nan)
    numerator = weights @ np.where(finite, values, 0)
    np.divide(numerator, available, out=means,
              where=coverage + 1e-12 >= COVERAGE)
    spatial_share = np.clip((weights @ spatial) / total, 0, 1)
    temporal_share = np.clip((weights @ temporal) / total, 0, 1)
    native = finite & ~spatial & ~temporal
    return {
        "values": means, "coverage": coverage,
        "source_coverage": np.clip((weights @ native) / total, 0, 1),
        "spatial_estimate_fraction": spatial_share, "temporal_estimate_fraction": temporal_share,
        "long_range_fraction": np.clip(((weights * (distance > 250)) @ native) / total, 0, 1),
    }


def annual_points(monthly, first_year, blocked=False):
    n = len(monthly["values"])
    days = np.array([calendar.monthrange(first_year + i // 12, i % 12 + 1)[1] for i in range(n)])
    start, stop = (BASELINE[0] - first_year) * 12, (BASELINE[1] + 1 - first_year) * 12
    reference = monthly["values"][start:stop]
    reference_ready = len(reference) == 360 and np.isfinite(reference).all()
    offset = float(np.average(reference, weights=days[start:stop])) if reference_ready else None
    points = []
    for start in range(0, n, 12):
        end = min(start + 12, n)
        values = monthly["values"][start:end]
        complete = end - start == 12 and np.isfinite(values).all() and reference_ready
        fractions = {name: float(np.average(monthly[name][start:end], weights=days[start:end]))
                     for name in monthly if name != "values"}
        reasons = []
        if blocked:
            reasons.append("provisional-antarctic-geography")
        if not reference_ready:
            reasons.append("incomplete-reference")
        if end - start != 12:
            reasons.append("incomplete-source-year")
        if not np.isfinite(values).all():
            reasons.append("insufficient-spatial-coverage")
        value = float(np.average(values, weights=days[start:end]) - offset) if complete and not blocked else None
        estimated = fractions["spatial_estimate_fraction"] + fractions["temporal_estimate_fraction"] > 1e-12
        points.append({
            "date": str(first_year + start // 12), "value": value, **fractions,
            "status": "blocked-geography" if blocked else (
                "missing" if value is None else "estimated" if estimated else "available"),
            "missing_reasons": reasons,
        })
    valid = [int(p["date"]) for p in points if p["value"] is not None]
    return {"annual": points, "summary": {
        "valid_count": len(valid), "first_valid": min(valid) if valid else None,
        "last_valid": max(valid) if valid else None,
    }, "reference_offset_degC": offset}


def metrics(errors):
    values = np.asarray(errors, dtype=float)
    return {
        "count": len(values),
        "mae_degC": float(np.mean(np.abs(values))) if len(values) else None,
        "rmse_degC": float(np.sqrt(np.mean(values ** 2))) if len(values) else None,
    }


def holdout_validation(native, plans):
    temporal_errors, two_month_errors, spatial_errors = [], [], []
    # Deterministic isolated post-reference monthly holdouts, no baseline leakage.
    indices = range((2011 - 1880) * 12, min(native.shape[1] - 1, (2025 - 1880) * 12), 13)
    for row in range(0, len(native), 17):
        for month in indices:
            values = native[row, month - 1:month + 2]
            if np.isfinite(values).all():
                temporal_errors.append((values[0] + values[2]) / 2 - values[1])
            if month + 2 < native.shape[1]:
                block = native[row, month - 1:month + 3]
                if np.isfinite(block).all():
                    two_month_errors.extend(np.linspace(block[0], block[-1], 4)[1:3] - block[1:3])
    regional_errors = {}
    for region_id, plan in zip(base.CONTINENTS, plans):
        errors = []
        for target in list(plan)[::17]:
            donors, fractions = plan[target]
            for month in indices:
                if math.isfinite(native[target, month]) and np.isfinite(native[donors, month]).all():
                    error = float(fractions @ native[donors, month] - native[target, month])
                    spatial_errors.append(error)
                    errors.append(error)
        regional_errors[region_id] = metrics(errors)
    return {"temporal_holdout": metrics(temporal_errors),
            "temporal_two_month_holdout": metrics(two_month_errors),
            "spatial_holdout": metrics(spatial_errors), "spatial_by_region": regional_errors,
            "note": {
                "cs": "Zadržené jednotlivé i dvojice měsíců a buňky po referenci, již v prostorově vyhlazené analýze NASA. Nejde o nezávislá staniční měření. Chyby nejsou intervalem spolehlivosti ani důkazem pro rozsáhlé nepokryté oblasti. Odhady neprodlužují záznam.",
                "en": "Withheld individual and pairs of months and cells after the reference, within NASA's already spatially smoothed analysis. These are not independent station observations. Errors are not confidence intervals or validation of large unsampled areas. Estimates do not extend the record.",
            }}


def prepare_box_weights(bounds, features):
    cache = OUTPUT / "sbbx_weights.npz"
    pins = {
        "source_sha256": SOURCE_SHA, "implementation_sha256": sha256(Path(__file__)),
        "geometry_implementation_sha256": sha256(Path(__file__).with_name("continent_geometry_area.py")),
        "masks": {key: sha256(review.OUTPUT / f"{key}.geojson") for key in base.CONTINENTS},
    }
    metadata = cache.with_suffix(".json")
    if cache.exists() or metadata.exists():
        require(cache.exists() and metadata.exists(), "Incomplete SBBX weight cache")
        existing = json.loads(metadata.read_text(encoding="utf-8"))
        require(existing["dependencies"] == pins and existing["sha256"] == sha256(cache),
                "Stale SBBX weights; preserve this version and choose a new output directory")
        with np.load(cache, allow_pickle=False) as stored:
            return stored["weights"].copy(), existing["diagnostics"]
    geometries = [shape(features[key]["geometry"]) for key in base.CONTINENTS]
    indices = [geometry_index(geometry) for geometry in geometries]
    weights = np.zeros((len(geometries), len(bounds)))
    for j, (south, north, west, east) in enumerate(bounds):
        cell = grid_cell(south, north, west, east)
        for i, (parts, tree) in enumerate(indices):
            weights[i, j] = cell_area(cell, parts, tree)
        if j % 1000 == 0:
            print(f"SBBX reviewed-mask intersections {j}/{len(bounds)}", flush=True)
    expected = np.array([lonlat_area(g) for g in geometries])
    error = weights.sum(axis=1) - expected
    require(np.all(np.abs(error) <= np.maximum(100, expected * 1e-8)), "SBBX boxes do not tile masks")
    diagnostics = {"mask_tiling_error_m2": dict(zip(base.CONTINENTS, error.tolist())),
                   "area_m2": dict(zip(base.CONTINENTS, expected.tolist()))}
    np.savez_compressed(cache, weights=weights)
    metadata.write_text(json.dumps({
        "dependencies": pins, "sha256": sha256(cache), "diagnostics": diagnostics,
    }, indent=2) + "\n", encoding="utf-8")
    return weights, diagnostics


def common_period(regions):
    active = [r for r in regions if r["id"] != "antarctica"]
    years = set.intersection(*[
        {int(p["date"]) for p in r["conservative"]["annual"] if p["value"] is not None}
        for r in active])
    runs = []
    for year in sorted(years):
        if not runs or year != runs[-1][-1] + 1:
            runs.append([])
        runs[-1].append(year)
    longest = max(runs, key=lambda run: (len(run), run[-1])) if runs else []
    return {"start": longest[0] if longest else None, "end": longest[-1] if longest else None,
            "regions": [r["id"] for r in active]}


def sensitivity(points, previous):
    old = {p["date"]: p["value"] for p in previous if p["value"] is not None}
    differences = [p["value"] - old[p["date"]] for p in points
                   if p["value"] is not None and p["date"] in old]
    return {
        "common_years": len(differences),
        "mean_difference_degC": float(np.mean(differences)) if differences else None,
        "max_absolute_difference_degC": max(map(abs, differences)) if differences else None,
    }


def main():
    require(sha256(SOURCE) == SOURCE_SHA, "Archived NASA 1200km source changed")
    OUTPUT.mkdir(parents=True, exist_ok=True)
    with gzip.open(SOURCE, "rb") as stream:
        raw, bounds, distance, source_info = parse_sbbx(stream)
    require(source_info["first_year"] == 1880, "Unexpected NASA origin")
    features, _ = load_masks()
    weights, diagnostics = prepare_box_weights(bounds, features)
    native, eligible = normalize_boxes(raw, source_info["first_year"])
    temporal, temporal_flags = fill_internal(native)
    plans = neighbor_plan(bounds, weights, eligible)
    proof = holdout_validation(native, plans)
    previous_bytes = (PREVIOUS / "continental_temperatures_v1.json").read_bytes()
    previous = json.loads(previous_bytes)
    regions = []
    empty_flags = np.zeros(native.shape, dtype=bool)
    for k, key in enumerate(base.CONTINENTS):
        conservative = annual_points(weighted_months(
            native, weights[k], empty_flags, empty_flags, distance),
            source_info["first_year"], blocked=key == "antarctica")
        estimated, spatial_flags = fill_spatial(native, temporal, temporal_flags, plans[k], weights[k])
        # A spatially inferred box gets its own full calendar-month reference, never a borrowed offset.
        estimated, _ = normalize_boxes(estimated, source_info["first_year"])
        spatial_flags &= np.isfinite(estimated)
        temporal_region = temporal_flags & np.isfinite(estimated)
        exploratory = annual_points(weighted_months(
            estimated, weights[k], spatial_flags, temporal_region, distance),
            source_info["first_year"])
        old = next(r for r in previous["regions"] if r["id"] == key)
        regions.append({
            "id": key, "name": NAMES[key],
            "status": "provisional-geography" if key == "antarctica" else "validated-local",
            "geometry": mapping(shape(features[key]["geometry"]).simplify(.06, preserve_topology=True)),
            "geometry_version": features[key]["properties"].get(
                "mask_version", features[key]["properties"]["version"]),
            "area_m2": diagnostics["area_m2"][key],
            "conservative": conservative, "exploratory": exploratory,
            "sensitivity_250km": sensitivity(conservative["annual"], old["history"]["annual"])
            if old["history"] else {"common_years": 0, "mean_difference_degC": None,
                                    "max_absolute_difference_degC": None},
        })
        print(f"{key}: conservative {conservative['summary']}; exploratory {exploratory['summary']}", flush=True)
    bundle = {
        "schema_version": 1, "version": VERSION, "publication_allowed": False,
        "baseline": list(BASELINE), "unit": "degC anomaly",
        "source": {
            "title": "NASA GISTEMP v4 GHCNv4 land-air, SBBX 1200km",
            "url": "https://data.giss.nasa.gov/pub/gistemp/SBBX1880.Ts.GHCNv4.1200.gz",
            "sha256": SOURCE_SHA, "smoothing_km": 1200, **source_info,
            "citation": "GISTEMP Team (2026); Lenssen et al. (2024), doi:10.1029/2023JD040179",
        },
        "methods": {
            "conservative": {
                "cs": "Jednotný NASA 1200km produkt, bez vlastního doplňování. Každá buňka má všech 360 referenčních měsíců 1981–2010; měsíční odchylky se přepočítají po kalendářních měsících. Plošné průniky našich masek, alespoň 90 % plochy každý měsíc, všech 12 měsíců a vážení počtem dní. Antarktida je v tomto pohledu blokována neověřenou grounded-land geometrií.",
                "en": "One NASA 1200km product, no project gap filling. Each cell has all 360 reference months in 1981–2010; anomalies are rebased by calendar month. Fractional intersections with our masks, at least 90% area each month, all 12 months and day weighting. Antarctica is blocked here because grounded-land geometry is not independently verified.",
            },
            "exploratory": {
                "cs": "Oddělený odhad: lineární doplnění pouze vnitřních mezer do 2 měsíců; poté nejbližší 3 referenčně úplné buňky stejného kontinentu do 1200 km, váhy 1/d², pouze pokud jsou všechny tři v daném měsíci původně dostupné. Shodné vzdálenosti s přesností na 1 mm rozhoduje pořadí zdrojových boxů. Žádné řetězení prostorových odhadů ani prodlužování regionálního záznamu. Nové buňky opět vyžadují celou referenci; platí 90 % a úplný rok. Antarktida používá výslovně předběžnou geografii, nikoli certifikovanou plochu uzemněného ledu.",
                "en": "Separate estimate: linear filling of internal gaps up to 2 months only; then the nearest 3 complete-reference cells in the same continent within 1200km, inverse-distance-squared weights, only when all three are originally available that month. Distance ties at 1mm precision use source-box order. No chained spatial estimates or extension of the regional record. New cells again require a full reference; 90% and complete-year rules remain. Antarctica uses explicitly provisional geography, not a certified grounded-ice area.",
            },
            "limitations": {
                "cs": [
                    "NASA 1200 km je prostorově odhadovaná analýza odvozená z pozorování, nikoli přímé měření každé buňky.",
                    "Pokrytí a podíl našich odhadů jsou podíly celé plochy kontinentu, nikoli počet stanic ani interval nejistoty. Dlouhý dosah znamená statický zdrojový údaj vzdálenosti nejbližší stanice >250 km; nejde o historické pokrytí stanicemi v jednotlivých letech.",
                    "Podíly se průměrují podle dní; platnost roku se posuzuje každý měsíc, nikoli pouze podle ročního pokrytí.",
                    "Změny zastoupení dostupné plochy mohou i nadále zkreslovat regionální trend. Rozdíl 250/1200 km je citlivost metody, nikoli chyba vůči pravdě.",
                    "Mapa zbarvuje celou kontinentální plochu jedinou agregací; nepředstavuje místní teplotu ani pokrytí v každém místě. Zjednodušení je pouze pro zobrazení.",
                    "Chybějící data zůstávají chybějící, pokud odhad nesplní pravidla. Historie se neprodlužuje před ani za zdroj a nespojuje se s SSP.",
                    "Publikace není povolena: produktové podmínky redistribuce NASA zůstávají k ověření.",
                ],
                "en": [
                    "NASA 1200km is a spatially estimated observation-derived analysis, not a direct measurement of each cell.",
                    "Coverage and project estimate shares are fractions of the entire continental area, not station counts or uncertainty intervals. Long range uses static source nearest-station distance >250km; it is not historical year-by-year station coverage.",
                    "Shares are day-weighted averages; annual validity is checked month by month, not only against annual mean coverage.",
                    "Changing available-area composition can still bias a regional trend. The 250/1200km difference is methodological sensitivity, not error against truth.",
                    "The map colors each continent with one aggregate, not a local temperature or complete local coverage. Geometry simplification is display-only.",
                    "Missing data remain missing when estimation rules fail. The record is not extended before or after the source or joined to SSP.",
                    "Publication is not authorised: NASA product-specific redistribution terms remain to be verified.",
                ],
            },
        },
        "common_period": common_period(regions), "validation": proof, "regions": regions,
        "provenance": {
            "source_file": str(SOURCE.relative_to(base.ROOT)),
            "implementation_sha256": sha256(Path(__file__)),
            "weights_sha256": sha256(OUTPUT / "sbbx_weights.npz"),
            "previous_bundle_sha256": hashlib.sha256(previous_bytes).hexdigest(),
            "source_format": "big-endian Fortran sequential, 8000 equal-area boxes",
            "mask_diagnostics": diagnostics, "baseline_rule": "complete 360 months per box, calendar-month rebasing",
        },
    }
    require(hashlib.sha256((PREVIOUS / "continental_temperatures_v1.json").read_bytes()).hexdigest()
            == bundle["provenance"]["previous_bundle_sha256"], "Legacy bundle changed")
    artifact = OUTPUT / "history_comparison_v1.json"
    artifact.write_text(json.dumps(bundle, ensure_ascii=False, allow_nan=False, separators=(",", ":")) + "\n",
                        encoding="utf-8")
    catalog = {
        "schema_version": 1, "version": "7c8-history-catalog-v1", "publication_allowed": False,
        "product": {"endpoint": "history-comparison-api/v1/bundle.json",
                    "version": VERSION, "sha256": sha256(artifact), "bytes": artifact.stat().st_size},
        "regions": [{"id": r["id"], "name": r["name"]} for r in regions],
    }
    (OUTPUT / "catalog.json").write_text(json.dumps(catalog, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    (OUTPUT / "validation.json").write_text(json.dumps({
        "status": "local-two-view-conditional", "artifact_sha256": sha256(artifact),
        "source_sha256": SOURCE_SHA, "validation": proof, "common_period": bundle["common_period"],
        "regions": [{"id": r["id"], "conservative": r["conservative"]["summary"],
                     "exploratory": r["exploratory"]["summary"]} for r in regions],
        "publication_allowed": False, "limitations": bundle["methods"]["limitations"],
    }, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"artifact": str(artifact), "bytes": artifact.stat().st_size,
                      "common_period": bundle["common_period"], "holdout": proof}, indent=2))


if __name__ == "__main__":
    main()
