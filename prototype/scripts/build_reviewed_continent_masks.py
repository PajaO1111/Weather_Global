"""7C.6d source-map decisions; preserve all 7C.6c and climate artefacts."""
import copy
import hashlib
import html
import json
import re
from collections import Counter

import shapely
from shapely.geometry import LineString, Point, Polygon, box, mapping, shape
from shapely.ops import unary_union

import build_continent_masks as base
from continent_geometry_area import lonlat_area

OUTPUT = base.OUTPUT.parent / "continent-masks-7c6d"
VERSION = "7c6d-geographic-review-v1"
NULL_ID = "land-05715"
NULL_SHA256 = "a4b7de597c928719d9fdf2066482941027d7cfd71585b5dbd8a2153ea613b446"
REVIEWED_REPORT_SHA256 = "4f1fe8cb37a941d1e22c3a0f6a22ad927631488b3c4e98c5be237cffcb99665e"
SOURCE_PAGES = {
    "land": "https://www.naturalearthdata.com/downloads/10m-physical-vectors/10m-land/",
    "countries": "https://www.naturalearthdata.com/downloads/10m-cultural-vectors/10m-admin-0-countries/",
    "shelves": "https://www.naturalearthdata.com/downloads/10m-physical-vectors/10m-antarctic-ice-shelves/",
    "null-island": "https://www.naturalearthdata.com/blog/natural-earth-version-1-3-release-notes/",
}

# Reviewed LOCAL source-map associations, not sovereign-state transfers.
# Every resulting decision is materialised by component ID and source hash.
# Location guards deliberately prevent applying these rules to overseas land.
GROUPS = [
    ("Argentina", "south-america", (-75, -57, -50, -20)),
    ("Brazil", "south-america", (-75, -35, -30, 8)),
    ("Chile", "south-america", (-80, -60, -65, -15)),
    ("Guyana", "south-america", (-62, 0, -55, 10)),
    ("South Georgia and the Islands", "south-america", (-44, -60, -25, -50)),
    ("Canada", "north-america", (-145, 40, -50, 85)),
    ("United States of America", "north-america", (-180, 24, -60, 75)),
    ("Mexico", "north-america", (-120, 10, -85, 35)),
    ("Panama", "north-america", (-84, 6, -77, 11)),
    ("Bermuda", "north-america", (-66, 31, -63, 34)),
    ("Greece", "europe", (25, 35, 29, 41)),
    ("Turkey", "asia", (25, 35, 37, 42)),
    ("Russia", "asia", (-180, 42, 180, 90)),
    ("China", "asia", (105, 15, 127, 42)),
    ("Hong Kong S.A.R.", "asia", (113, 21, 115, 24)),
    ("Macao S.A.R", "asia", (113, 21, 115, 24)),
    ("Japan", "asia", (122, 23, 147, 46)),
    ("North Korea", "asia", (123, 36, 132, 44)),
    ("South Korea", "asia", (123, 32, 132, 40)),
    ("Taiwan", "asia", (117, 20, 124, 27)),
    ("Philippines", "asia", (114, 4, 128, 22)),
    ("Spratly Islands", "asia", (109, 6, 118, 14)),
    ("Vietnam", "asia", (102, 7, 112, 23)),
    ("Thailand", "asia", (96, 5, 105, 15)),
    ("Myanmar", "asia", (91, 8, 100, 19)),
    ("Sri Lanka", "asia", (78, 5, 83, 11)),
    ("India", "asia", (70, 7, 81, 13)),
    ("Iran", "asia", (47, 24, 58, 32)),
    ("Kazakhstan", "asia", (49, 43, 55, 48)),
    ("Kuwait", "asia", (47, 28, 50, 31)),
    ("United Arab Emirates", "asia", (50, 23, 57, 27)),
    ("Oman", "asia", (54, 16, 61, 25)),
    ("Saudi Arabia", "asia", (34, 15, 54, 30)),
    ("Yemen", "asia", (41, 12, 49, 17)),
    ("Egypt", "africa", (32, 21, 38, 29)),
    ("Sudan", "africa", (35, 18, 39, 23)),
    ("Eritrea", "africa", (38, 12, 44, 18)),
    ("Djibouti", "africa", (42, 10, 44, 14)),
    ("Somaliland", "africa", (42, 10, 46, 13)),
    ("United Republic of Tanzania", "africa", (38, -11, 42, -4)),
    ("French Southern and Antarctic Lands", "africa", (38, -24, 42, -20)),
    ("Gabon", "africa", (8, -2, 11, 2)),
    ("Mauritania", "africa", (-18, 17, -15, 22)),
    ("Australia", "oceania", (110, -45, 154, -10)),
    ("Coral Sea Islands", "oceania", (150, -26, 160, -15)),
    ("Papua New Guinea", "oceania", (140, -12, 157, 0)),
    ("Solomon Islands", "oceania", (154, -13, 168, -3)),
    ("New Caledonia", "oceania", (162, -25, 173, -18)),
    ("Federated States of Micronesia", "oceania", (135, 0, 164, 12)),
    ("Marshall Islands", "oceania", (160, 3, 174, 16)),
    ("Kiribati", "oceania", (165, -12, 180, 5)),
    ("Kiribati", "oceania", (-180, -12, -145, 5)),
    ("New Zealand", "oceania", (165, -50, 180, -30)),
    ("New Zealand", "oceania", (-175, -12, -170, -8)),
    ("Cook Islands", "oceania", (-168, -24, -150, -7)),
    ("Fiji", "oceania", (-180, -22, -175, -12)),
    ("Tonga", "oceania", (-178, -24, -172, -14)),
    ("Tuvalu", "oceania", (175, -13, 180, -4)),
    ("Wallis and Futuna", "oceania", (-180, -16, -175, -12)),
    ("Pitcairn Islands", "oceania", (-131, -27, -123, -22)),
    ("United States Minor Outlying Islands", "oceania", (165, 16, 168, 22)),
    ("United States Minor Outlying Islands", "oceania", (-180, -2, -150, 8)),
]
SPECIAL = [
    ("tiran-sanafir-gulf-aqaba", "asia", (34.4, 27.7, 34.9, 28.1),
     "Strait-of-Tiran islands grouped with Sinai/Arabia in Asia; the archived Egyptian administrative label must not transfer them to Africa."),
    ("socotra-horn-of-africa", "africa", (52, 11, 55, 14),
     "Socotra group assigned to the Horn-of-Africa geographic island region; source Yemen/Asia administrative label retained as conflicting evidence. Project convention, not a sovereignty claim."),
    ("bouvet-south-atlantic", "africa", (3, -55, 4, -54),
     "Isolated South Atlantic island north of 60S assigned to Africa as an explicit project grouping; not Europe by Norwegian sovereignty or a continental-shelf claim."),
    ("clipperton-eastern-pacific", "north-america", (-110, 10, -109, 11),
     "Eastern Pacific Clipperton grouped with North America, not France/Europe; source open-ocean category retained."),
]


def reviewed_africa_domain(rivers):
    _, canal = base.africa_domain(rivers)
    north = [(-25, 35), (-8, 35), (-6, 35.8), (-5.6, 35.95), (-4, 36),
             (0, 37), (10, 38), (12, 36.5), (16, 34.5), (25, 34), (31.5, 32),
             (canal[0][0], 32), canal[0]]
    south = [canal[-1], (32.6, 29.85), (32.66, 29.5), (32.94, 29),
             (33.2, 28.5), (33.61, 28), (33.9, 27.5), (34.65, 26),
             (35.8, 24), (37, 22), (38.5, 20), (41.5, 15), (42.8, 13.3),
             (43.1, 12.9), (43.25, 12.7), (43.4, 12.6), (45, 12), (55, 12),
             (60, 10), (60, -40)]
    polygon = Polygon(north[:-1] + canal + south[1:] + [(-25, -40), north[0]])
    return base.require_valid(polygon, "Reviewed Africa domain"), canal, north, south


def read_previous():
    manifest = json.loads((base.OUTPUT / "outputs.json").read_text(encoding="utf-8"))
    evidence = []
    for item in manifest["files"]:
        path = base.OUTPUT / item["file"]
        actual = base.digest(path)
        semantic_only = False
        if actual != item["sha256"]:
            # Reviewed editor serialization has its own exact pin. Its summary
            # was compared against the independently pinned offline atlas.
            if item["file"] != "report.json" or actual != REVIEWED_REPORT_SHA256:
                raise ValueError(f"7C.6c input changed: {path.name}")
            semantic_only = True
        evidence.append({**item, "actual_sha256": actual, "reviewed_serialization_change": semantic_only})
    atlas = (base.OUTPUT / "atlas.html").read_text(encoding="utf-8")
    summary = json.loads(html.unescape(re.search(r"<pre>(.*?)</pre>", atlas, re.S).group(1)))
    if summary != json.loads((base.OUTPUT / "report.json").read_text(encoding="utf-8"))["summary"]:
        raise ValueError("Reviewed report summary disagrees with pinned 7C.6c atlas")
    return evidence


def render_review_panels(masks, countries, decisions):
    views = [
        ("Aegean / Egejske ostrovy: Europe v3", (25, 35, 29, 41)),
        ("Socotra / Sokotra: Horn of Africa grouping", (42, 10, 56, 17)),
        ("Bouvet: South Atlantic / Africa convention", (0, -56, 6, -52)),
        ("Clipperton: eastern Pacific / North America", (-112, 8, -105, 13)),
        ("Pacific west / zapadni Tichomori", (135, -25, 180, 25)),
        ("Pacific east / vychodni Tichomori", (-180, -30, -120, 30)),
        ("Date line west / Aleutians", (168, 48, 180, 56)),
        ("Date line east / Aleutians", (-180, 48, -160, 56)),
        ("Strait of Tiran / Sinai and Arabia", (33.5, 27.2, 35.5, 29)),
    ]
    blocks = ['<h2>7C.6d: source-map overlays / zdrojove mapove vazby</h2>'
              '<p>White outlines and labels = archived Natural Earth admin0 map evidence, '
              'not the continental boundary. Circles = reviewed components; '
              'hover shows source ID, local map label and the explicit decision.</p>']
    for title, bounds in views:
        domain = box(*bounds)
        paths = []
        for key, geometry in masks.items():
            visible = geometry.intersection(domain)
            if not visible.is_empty:
                paths.append(f'<path fill="{base.COLORS[key]}" fill-rule="evenodd" '
                             f'd="{base.svg_path(visible.simplify(.004, preserve_topology=True))}"/>')
        for record, country in countries:
            if not country.intersects(domain):
                continue
            visible = country.intersection(domain)
            if visible.area == 0:
                continue
            point = visible.representative_point()
            name = html.escape(record["ADMIN"])
            paths.append(f'<path fill="none" stroke="#fff" stroke-width=".015" '
                         f'd="{base.svg_path(visible.simplify(.01, preserve_topology=True))}"><title>{name}</title></path>'
                         f'<text x="{point.x}" y="{-point.y}" font-size=".18" fill="#fff">{name}</text>')
        for decision in decisions:
            if not domain.covers(box(*decision["bounds"])):
                continue
            left, bottom, right, top = decision["bounds"]
            label = html.escape(f'{decision["component_id"]}: {decision["rule"]} -> {decision["continent"]}')
            paths.append(f'<circle cx="{(left+right)/2}" cy="{-(bottom+top)/2}" r=".04" '
                         f'fill="none" stroke="#fded91" stroke-width=".02"><title>{label}</title></circle>')
        left, bottom, right, top = bounds
        blocks.append(f'<section><h2>{html.escape(title)}</h2><svg role="img" aria-label="{html.escape(title)}" '
                      f'viewBox="{left} {-top} {right-left} {top-bottom}">{"".join(paths)}</svg></section>')
    blocks.append('<h2>Archived source-page maps / mapy ze zdrojovych stranek</h2>'
                  '<p>Natural Earth thumbnails illustrate the source, not a complete global classification.</p>'
                  '<img alt="Natural Earth land source map" src="sources/land-source-map.gif">'
                  '<img alt="Natural Earth countries source map" src="sources/countries-source-map.png">'
                  '<img alt="Natural Earth Antarctic shelves source map" src="sources/shelves-source-map.gif">'
                  '<p>Source documentation: '
                  '<a href="sources/land-documentation.html">land</a> | '
                  '<a href="sources/countries-documentation.html">countries</a> | '
                  '<a href="sources/null-island-release-notes.html">Null Island warning</a> | '
                  '<a href="sources/shelves-documentation.html">shelves</a>.</p>')
    return "".join(blocks)


def decide(geometry, countries, tree):
    for rule, continent, bounds, rationale in SPECIAL:
        if box(*bounds).covers(geometry):
            return {"continent": continent, "rule": rule, "rationale": rationale,
                    "location_guard": bounds, "source_pages": list(SOURCE_PAGES.values())[:2]}
    nearby = int(tree.nearest(geometry))
    record, local = countries[nearby]
    rules = [(name, continent, bounds) for name, continent, bounds in GROUPS
             if name == record["ADMIN"] and box(*bounds).covers(geometry)]
    if len(rules) != 1 or geometry.distance(local) > 6:
        raise ValueError(f"No reviewed source-map group for {record['ADMIN']}: {geometry.bounds}")
    name, continent, bounds = rules[0]
    return {
        "continent": continent, "rule": "reviewed-local-map-group:" + name,
        "rationale": "Whole physical component associated with the explicitly reviewed local coastal/archipelago group inside its location guard; source coastline is not filled or changed. No global nearest-continent fallback.",
        "local_map_label": name, "source_admin_continent": record["CONTINENT"],
        "local_map_gap_degrees": geometry.distance(local), "location_guard": bounds,
        "source_pages": [SOURCE_PAGES["land"], SOURCE_PAGES["countries"]],
    }


def main():
    prior = read_previous()
    OUTPUT.mkdir(parents=True, exist_ok=True)
    registry = copy.deepcopy(json.loads((base.OUTPUT / "component-registry.json").read_text(encoding="utf-8"))["components"])
    previous_report = json.loads((base.OUTPUT / "report.json").read_text(encoding="utf-8"))
    masks = {name: shape(json.loads((base.OUTPUT / f"{name}.geojson").read_text(encoding="utf-8"))["geometry"])
             for name in base.CONTINENTS}
    old_unresolved = shape(json.loads((base.OUTPUT / "unresolved.geojson").read_text(encoding="utf-8"))["geometry"])
    by_bounds = {}
    for geometry in base.source_parts(old_unresolved):
        if geometry.bounds in by_bounds:
            raise ValueError("Duplicate unresolved bounds require a stronger geometry identity")
        by_bounds[geometry.bounds] = geometry
    countries = base.read_layer("countries", [])[0]
    tree = shapely.STRtree([g for _, g in countries])
    additions = {name: [] for name in base.CONTINENTS}
    exclusions, decisions = [], []
    for component in registry:
        for entry in component["assignments"]:
            if entry["continent"] is not None:
                continue
            geometry = by_bounds.pop(tuple(entry["bounds"]))
            if component["id"] == NULL_ID:
                if component["source_geometry_sha256"] != NULL_SHA256 or not box(-.01, -.01, .01, .01).covers(geometry):
                    raise ValueError("Null Island identity changed")
                decision = {"continent": None, "rule": "exclude-fictitious-null-island",
                            "rationale": "Natural Earth explicitly documents Null Island as a fictional troubleshooting feature; excluded from eligible land, not assigned to Africa.",
                            "source_pages": [SOURCE_PAGES["null-island"]], "status": "excluded"}
                exclusions.append(geometry)
                component["excluded_area_m2"] += lonlat_area(geometry)
            else:
                decision = {**decide(geometry, countries, tree), "status": "assigned"}
                additions[decision["continent"]].append(geometry)
            decision.update({"component_id": component["id"],
                             "source_geometry_sha256": component["source_geometry_sha256"],
                             "review_geometry_sha256": hashlib.sha256(geometry.wkb).hexdigest(),
                             "bounds": geometry.bounds, "area_m2": lonlat_area(geometry),
                             "prior_geodesic_chord_area_m2": entry["area_m2"],
                             "prior_rule": entry["rule"], "prior_local_admin_evidence": entry["local_admin_evidence"]})
            decisions.append(decision)
            entry.update({"continent": decision["continent"], "rule": decision["rule"],
                          "prior_geodesic_chord_area_m2": entry["area_m2"],
                          "area_m2": decision["area_m2"], "area_method": "WGS84-lonlat-linear-surface-integral",
                          "status": decision["status"], "review_decision_index": len(decisions) - 1})
        component["status"] = "excluded" if component["id"] == NULL_ID else "assigned"
    if by_bounds or len(decisions) != previous_report["summary"]["unresolved_polygon_count"]:
        raise ValueError("Review does not account for every unresolved component")
    masks = {name: base.require_valid(unary_union([geometry, *additions[name]]), name)
             for name, geometry in masks.items()}
    # 7C.6d checks existing assignments as well as formerly unresolved ones.
    # The archived Egyptian label had incorrectly put Sanafir in Africa.
    land = unary_union([g for _, g in base.read_layer("land", [])[0]])
    originals = sorted(base.source_parts(land), key=lambda g: (-g.area, g.bounds))
    sanafir = originals[2842]
    record = registry[2842]
    if record["id"] != "land-02842" or not box(34.4, 27.7, 34.9, 28.1).covers(sanafir):
        raise ValueError("Sanafir source identity changed")
    if record["assignments"][0]["continent"] != "africa":
        raise ValueError("Unexpected prior Sanafir assignment")
    moved = base.polygonal(masks["africa"].intersection(sanafir))
    if base.surface_area_upper_bound(sanafir.symmetric_difference(moved)) > .01:
        raise ValueError("Sanafir correction would not move the whole physical component")
    correction = {
        "component_id": record["id"], "source_geometry_sha256": record["source_geometry_sha256"],
        "bounds": sanafir.bounds, "area_m2": lonlat_area(moved),
        "previous_continent": "africa", "continent": "asia", "rule": SPECIAL[0][0],
        "rationale": SPECIAL[0][3], "source_pages": [SOURCE_PAGES["land"], SOURCE_PAGES["countries"]],
    }
    record["assignments"][0].update({"continent": "asia", "rule": correction["rule"],
                                     "review_correction_index": 0})
    masks["africa"] = base.require_valid(base.polygonal(masks["africa"].difference(moved)), "Corrected Africa")
    masks["asia"] = base.require_valid(unary_union([masks["asia"], moved]), "Corrected Asia")
    mainland_index, mainland = next((i, g) for i, g in enumerate(originals)
                                    if g.covers(Point(20, 10)) and g.covers(Point(100, 40)))
    mainland_record = registry[mainland_index]
    rivers = base.read_layer("rivers", [])[0]
    africa_domain, canal, north_join, south_join = reviewed_africa_domain(rivers)
    old_africa = masks["africa"].intersection(mainland)
    old_asia = masks["asia"].intersection(mainland)
    remainder = unary_union([old_africa, old_asia])
    # Only the documented canal corridor may intentionally cut source land.
    # No marine join may cross the remaining connected mainland.
    corridor = box(32, 29.8, 32.7, 31.4)
    marine_crossing = unary_union([LineString(north_join), LineString(south_join)]).intersection(
        remainder.difference(corridor))
    if not marine_crossing.is_empty:
        raise ValueError(f"Reviewed marine join crosses mainland: {marine_crossing.bounds}")
    new_mainland = base.partition_mainland(remainder, africa_domain, "africa", "asia")
    mainland_correction = {
        "component_id": mainland_record["id"],
        "source_geometry_sha256": mainland_record["source_geometry_sha256"],
        "rule": "corrected-marine-joins-Suez-Africa-Asia",
        "rationale": "Visual audit found the old northern auxiliary boundary reached 40N and assigned western Anatolia to Africa, and its southern join cut Sinai. Corrected Mediterranean/Red-Sea marine joins do not cross eligible connected mainland outside the documented Suez corridor.",
        "africa_to_asia_area_m2": lonlat_area(old_africa.difference(new_mainland["africa"])),
        "asia_to_africa_area_m2": lonlat_area(old_asia.difference(new_mainland["asia"])),
        "source_pages": [SOURCE_PAGES["land"], SOURCE_PAGES["countries"]],
    }
    # Separately approved after 7C.6d exposed African land inside legacy Europe.
    # Preserve the old mask and climate numbers; correct only this new v3.
    african_europe = masks["europe"].intersection(mainland).intersection(africa_domain)
    if african_europe.is_empty:
        raise ValueError("Expected reviewed legacy Europe/Africa defect was not found")
    masks["europe"] = base.require_valid(base.polygonal(masks["europe"].difference(african_europe)), "Europe without African mainland")
    new_mainland["africa"] = unary_union([new_mainland["africa"], african_europe])
    europe_corrections = [{
        "component_id": mainland_record["id"],
        "source_geometry_sha256": mainland_record["source_geometry_sha256"],
        "removed_from_europe_area_m2": lonlat_area(african_europe),
        "rule": "African mainland south of verified Mediterranean marine joins",
    }]
    coastal_africa = {"Morocco", "Algeria", "Tunisia"}
    for i, original in enumerate(originals):
        if not box(-12, 33, 12, 38.3).covers(original):
            continue
        european = masks["europe"].intersection(original)
        if european.is_empty or european.area == 0:
            continue
        nearest = int(tree.nearest(original))
        local_record, local_geometry = countries[nearest]
        if local_record["ADMIN"] not in coastal_africa or original.distance(local_geometry) > .6:
            continue
        masks["europe"] = base.polygonal(masks["europe"].difference(european))
        masks["africa"] = unary_union([masks["africa"], european])
        registry[i]["assignments"] = [{
            "continent": "africa", "rule": "reviewed-African-Mediterranean-coastal-component",
            "area_m2": lonlat_area(european), "review_correction_index": 2}]
        europe_corrections.append({
            "component_id": registry[i]["id"],
            "source_geometry_sha256": registry[i]["source_geometry_sha256"],
            "removed_from_europe_area_m2": lonlat_area(european),
            "local_map_label": local_record["ADMIN"],
            "local_map_gap_degrees": original.distance(local_geometry),
            "bounds": original.bounds, "rule": "reviewed-African-Mediterranean-coastal-component",
        })
    europe_correction = {
        "rule": "approved-Europe-v3-remove-African-mainland-and-coastal-islands",
        "authorization": "2026-11-06: user explicitly approved correction of new v3 after measured legacy African overlap; preserve v1/v2 and all old results, flag future recomputation.",
        "previous_continent": "europe", "continent": "africa",
        "affected_components": europe_corrections,
        "removed_from_europe_area_m2": sum(row["removed_from_europe_area_m2"] for row in europe_corrections),
        "rationale": "The old 34N southern auxiliary boundary admitted northern Morocco, Algeria and Tunisia. Verified marine separation removes their mainland plus explicitly reviewed nearby African coastal islands. The original source geometry is not changed.",
        "source_pages": [SOURCE_PAGES["land"], SOURCE_PAGES["countries"]],
    }
    mainland_record["assignments"] = [{
        "continent": "europe", "rule": "frozen-v1-minus-lakes-minus-wrong-African-mainland",
        "area_m2": lonlat_area(masks["europe"].intersection(mainland)),
        "review_correction_index": 2}]
    for key, geometry in new_mainland.items():
        masks[key] = base.require_valid(unary_union([masks[key].difference(mainland), geometry]), key)
        mainland_record["assignments"].append({
            "continent": key, "rule": mainland_correction["rule"],
            "area_m2": lonlat_area(geometry), "review_correction_index": 1})
    excluded = shape(json.loads((base.OUTPUT / "excluded.geojson").read_text(encoding="utf-8"))["geometry"])
    excluded = base.require_valid(unary_union([excluded, *exclusions]), "Exclusions including fictional land")
    summary = {
        "source_component_count": len(registry),
        "assigned_source_components": sum(row["status"] == "assigned" for row in registry),
        "excluded_source_components": sum(row["status"] == "excluded" for row in registry),
        "unresolved_source_components": 0, "unresolved_polygon_count": 0, "unresolved_area_m2": 0,
        "review_decision_count": len(decisions),
        "existing_assignment_correction_count": 3,
        "decision_counts_by_rule": dict(sorted(Counter(row["rule"] for row in decisions).items())),
        "areas_m2": {name: lonlat_area(g) for name, g in masks.items()},
        "area_method": "WGS84 ellipsoidal surface integral along the lon/lat-linear GEOS boundaries, eight-point Gauss-Legendre edge integration; independent polar equal-area cross-check in validation.json. Unmodified inherited registry fields retain their original geodesic-chord meaning.",
    }
    report = {
        "schema_version": 1, "version": VERSION, "status": "geographic-review-awaiting-validation",
        "publication_allowed": False, "climate_weights_allowed": False,
        "authorization": "2026-11-06: user delegated unresolved geographic decisions based on source maps and grouping; no public deployment or climate recomputation.",
        "sources": previous_report["sources"], "source_pages": SOURCE_PAGES,
        "source_page_archive": "sources/downloads.json",
        "previous_artifacts": prior, "previous_manifest_sha256": base.digest(base.OUTPUT / "outputs.json"),
        "implementation_sha256": base.digest(base.ROOT / "prototype" / "scripts" / "build_reviewed_continent_masks.py"),
        "shared_geometry_implementation_sha256": base.digest(base.ROOT / "prototype" / "scripts" / "build_continent_masks.py"),
        "surface_area_implementation_sha256": base.digest(base.ROOT / "prototype" / "scripts" / "continent_geometry_area.py"),
        "boundary_rules": previous_report["boundary_rules"],
        "review_policy": {"max_local_map_gap_degrees": 6,
                          "note": "Geographic association of enumerated 7C.6c unresolved components only, guarded by source identity and local group bounds. Never a general-purpose nearest-continent classifier.",
                          "groups": [{"local_map_label": n, "continent": c, "bounds": b} for n, c, b in GROUPS],
                          "source_caveat": "Natural Earth land is derived from coastline and warns about northern Russia/southern Chile accuracy. Admin world regions roughly follow UN grouping, not universal physical continents; local polygons are evidence, not sovereign-state transfer."},
        "europe": {**previous_report["europe"], "candidate_version": "europe-kuma-manych-cyprus-v3-geography-corrected",
                   "previous_candidate_unchanged": True, "added_reviewed_islands_m2": sum(lonlat_area(g) for g in additions["europe"]),
                   "removed_wrongly_included_african_land_m2": europe_correction["removed_from_europe_area_m2"],
                   "legacy_geography_valid": False, "legacy_nasa_cmip6_requires_recomputation": True,
                   "change": "v2 plus reviewed Greek eastern Aegean components, minus wrongly included African mainland and reviewed coastal islands. Explicitly approved new v3 only; v1/v2 files and all old climate numbers unchanged. Existing custom-Europe NASA/CMIP6 results have invalid geography pending separately approved recomputation; producer EU27 CDS geography is not affected by this mask defect."},
        "eligible_land": {"definition": "Pinned Natural Earth physical land minus mapped lakes, mapped Antarctic shelves and the explicitly identified fictional Null Island.",
                          "null_island_component": NULL_ID, "null_island_area_m2": sum(lonlat_area(g) for g in exclusions)},
        "blockers": [
            "Antarctic grounding line independently verified against current grounded ice is not archived; Natural Earth shelves refer to generalized 2003-2004 MOA. Antarctica remains provisional.",
            "Natural Earth basic lakes and coasts are cartographic, incomplete and partly historical; this is not a current hydrographic survey.",
            "Native-grid audit is a diagnostic only, never approval to publish weights or recompute climate values.",
            "Legacy custom-Europe NASA/CMIP6 values used the geographically defective v1; not geographically validated and must be recomputed in a separately approved step. Existing v1/v2 bytes and old numbers are retained, never silently relabelled.",
        ],
        "summary": summary,
    }
    report["boundary_rules"]["suez"] = {
        "source": "Archived Natural Earth Suez centerline plus explicitly reviewed marine joins",
        "path_lon_lat": canal, "north_marine_join_lon_lat": north_join, "south_marine_join_lon_lat": south_join,
        "allowed_land_cut_corridor": [32, 29.8, 32.7, 31.4],
        "marine_join_mainland_intersection": "empty outside the documented canal corridor, after frozen Europe subtraction",
        "caveat": "Canal is generalized and disconnected in the source; join/stitching is project cartography, not survey accuracy. Corrected joins no longer cut Anatolia or southern Sinai.",
    }
    for name, geometry in masks.items():
        base.dump(OUTPUT / f"{name}.geojson", {"type": "Feature", "properties": {
            "continent": name, "version": VERSION, "status": "reviewed-geography-not-climate-ready",
            "mask_version": report["europe"]["candidate_version"] if name == "europe" else f"{name}-geographic-review-v1",
            "publication_allowed": False, "climate_weights_allowed": False,
            "grounding_line_verified": False if name == "antarctica" else None,
        }, "geometry": mapping(geometry)})
    base.dump(OUTPUT / "unresolved.geojson", {"type": "Feature", "properties": {"status": "none"},
                                            "geometry": mapping(base.EMPTY)})
    base.dump(OUTPUT / "excluded.geojson", {"type": "Feature", "properties": {"status": "mapped-water-shelves-and-fictitious-null-island"},
                                          "geometry": mapping(excluded)})
    base.dump(OUTPUT / "component-registry.json", {"schema_version": 1, "version": VERSION, "components": registry})
    base.dump(OUTPUT / "decisions.json", {"schema_version": 1, "version": VERSION, "decisions": decisions})
    base.dump(OUTPUT / "corrections.json", {"schema_version": 1, "version": VERSION,
                                          "corrections": [correction, mainland_correction, europe_correction]})
    base.dump(OUTPUT / "report.json", report)
    atlas = base.render_atlas(masks, base.EMPTY, excluded, report)
    atlas = atlas.replace("7C.6c", "7C.6d").replace("navrh masek / draft masks", "geograficka kontrola / geographic review")
    atlas = atlas.replace("Neni verejny produkt ani validace 7C.6d.", "Neni verejny produkt. Rozsah kontroly 7C.6d je ve validation.json.")
    atlas = atlas.replace("Not a public release or 7C.6d certification.", "Not a public release; validation.json states the conditional 7C.6d scope.")
    atlas = atlas.replace("Europe v2 candidate excludes mapped lakes;",
                          "Europe v3 removes wrongly included African land and mapped lakes, and adds reviewed Aegean islands;")
    atlas = atlas.replace("<p>Europe v3", '<p class="notice">Legacy NASA/CMIP6 Europe results used defective v1 geography and require separately approved recomputation. Original files/numbers are preserved, not certified.</p><p>Europe v3')
    atlas = atlas.replace('<a href="report.json">Report / blokace</a>',
                          '<a href="report.json">Report / blokace</a> | <a href="decisions.json">Decisions</a> | <a href="validation.json">Validation</a>')
    atlas = atlas.replace("</html>", render_review_panels(masks, countries, decisions) + "</html>")
    (OUTPUT / "atlas.html").write_text(atlas, encoding="utf-8")
    update_manifest()
    print(json.dumps(summary, indent=2))
    print(f"Review atlas: {OUTPUT / 'atlas.html'}")


def update_manifest():
    paths = sorted(path for path in OUTPUT.iterdir()
                   if path.is_file() and path.name != "outputs.json")
    base.dump(OUTPUT / "outputs.json", {"version": VERSION, "files": [
        {"file": path.name, "bytes": path.stat().st_size, "sha256": base.digest(path)} for path in paths]})


if __name__ == "__main__":
    main()
