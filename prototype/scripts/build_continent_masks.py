"""Offline phase 7C.6c geographic drafts, component registry and map review.

Not climate weights, not a release, and not phase 7C.6d certification.
"""
import hashlib
import html
import io
import json
import math
from itertools import combinations
from pathlib import Path
import zipfile

import pyproj
import shapefile
import shapely
from shapely.geometry import GeometryCollection, Point, Polygon, box, mapping, shape
from shapely.ops import transform, unary_union

ROOT = Path(__file__).resolve().parents[2]
LEGACY = ROOT / "data_samples" / "2026-11-04" / "europe-pilot"
OUTPUT = ROOT / "data_samples" / "2026-11-06" / "continent-masks"
VERSION = "7c6c-continental-drafts-v1"
CONTINENTS = ("europe", "asia", "africa", "north-america", "south-america", "oceania", "antarctica")
COLORS = dict(zip(CONTINENTS, ("#6395ef", "#f0ac55", "#e7d568", "#71c990", "#b3a0eb", "#ec9bba", "#b6dce7")))
GEOD = pyproj.Geod(ellps="WGS84")
EMPTY = GeometryCollection()
PINS = {
    "land": (LEGACY / "ne_10m_land.zip", "e547d749445eaa0964aba76738090ec88f5e63c4585122170f98c67a7ea922dc"),
    "countries": (LEGACY / "ne_10m_admin_0_countries.zip", "ce1ac7036499a0edd641fbc093cd209a98f96a49d2eca8480aaacad35138a7f6"),
    "rivers": (LEGACY / "ne_10m_rivers_lake_centerlines.zip", "ded71b01870855ccfe19b51f2ec14c9bb48fae23c0e9f3c11974d426433b5c38"),
    "europe-v1": (LEGACY / "europe-mask-v1.geojson", "8f0aca5c68a20e7c8be0c43d5363a6385662f270eaaf4ba9218815bcee5e141f"),
    "lakes": (OUTPUT / "sources" / "ne_10m_lakes.zip", "0803a06f9c3cb4671d89b68c48b142aad9366ba40f665245e12a913fbc61722a"),
    "shelves": (OUTPUT / "sources" / "ne_10m_antarctic_ice_shelves_polys.zip", "1d421d2487e2721a6e0aee8187e008c9bd8f0adbf4a5297b8503f7bf3c30b04d"),
}
LAYERS = {"land": "land", "countries": "admin_0_countries", "rivers": "rivers_lake_centerlines",
          "lakes": "lakes", "shelves": "antarctic_ice_shelves_polys"}

# Whole-component windows are attribution aids, never extra land geometry.
# Ambiguous crossings are left unresolved rather than clipped into an island.
ISLAND_GROUPS = [
    ("hawaii", "oceania", (-179, 18, -154, 30)),
    ("caribbean-and-bahamas", "north-america", (-89, 9, -58, 28)),
    ("rapa-nui", "oceania", (-110, -28, -108, -26)),
    ("christmas", "asia", (105, -11, 106.5, -10)),
    ("cocos", "asia", (96, -13, 98, -11)),
    ("chagos", "asia", (70, -8, 74, -4)),
    ("andaman-nicobar", "asia", (91, 6, 95, 14)),
    ("maldives", "asia", (72, -1.5, 74.5, 8)),
    ("madeira", "africa", (-18, 30, -15, 34)),
    ("canaries", "africa", (-19, 27, -13, 30)),
    ("cape-verde", "africa", (-26, 14, -22, 18)),
    ("st-helena-ascension-tristan", "africa", (-16, -41, -4, -7)),
    ("madagascar-comoros-mascarenes-seychelles", "africa", (42, -27, 64, -3)),
    ("prince-edward", "africa", (37, -48, 39, -46)),
    ("crozet", "africa", (49, -47, 53, -45)),
    ("kerguelen", "africa", (68, -51, 71, -48)),
    ("amsterdam-st-paul", "africa", (76, -40, 78, -37)),
    ("heard-mcdonald", "oceania", (72, -54, 75, -52)),
    ("south-georgia-sandwich", "south-america", (-39, -60, -25, -53)),
    ("galapagos", "south-america", (-93, -2, -89, 2)),
    ("juan-fernandez", "south-america", (-82, -35, -78, -32)),
    ("falklands", "south-america", (-62, -53, -57, -50)),
    ("norfolk-lord-howe", "oceania", (158, -33, 169, -28)),
    ("new-zealand-subantarctic", "oceania", (157, -59, 180, -46)),
    ("chatham-antipodes", "oceania", (-180, -51, -175, -43)),
    ("greenland", "north-america", (-74, 59, -10, 84)),
    ("aleutians-west", "north-america", (170, 48, 180, 56)),
    ("aleutians-east", "north-america", (-180, 49, -160, 56)),
]
WALLACE_WEST = Polygon([
    (90, -15), (115.75, -15), (115.75, -8), (117.5, -7),
    (118.8, -5), (118.8, 1), (119.5, 3), (119.5, 5), (130, 5),
    (130, 8), (90, 8), (90, -15),
])
WALLACE_EAST = box(90, -15, 155, 5).difference(WALLACE_WEST)
ISLAND_SEEDS = [
    ("australian-mainland", "oceania", (133, -25)),
    ("borneo-whole-island", "asia", (114, 1)),
    ("sulawesi-whole-island", "oceania", (121, -2)),
    ("mindanao-whole-island", "asia", (125, 8)),
    ("sri-lanka-whole-island", "asia", (80.7, 7)),
    ("tierra-del-fuego-whole-island", "south-america", (-69, -54)),
]


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def dump(path, data):
    path.write_text(json.dumps(data, ensure_ascii=True, separators=(",", ":"), allow_nan=False) + "\n",
                    encoding="utf-8")


def source_parts(geometry):
    if geometry.is_empty:
        return []
    if geometry.geom_type == "Polygon":
        return [geometry]
    return [part for child in getattr(geometry, "geoms", []) for part in source_parts(child)]


def polygonal(geometry):
    return unary_union(source_parts(geometry))


def require_valid(geometry, label):
    if not geometry.is_valid:
        raise ValueError(f"{label}: invalid geometry: {shapely.is_valid_reason(geometry)}")
    return geometry


def geodesic_area(geometry):
    # Ring-by-ring avoids cancellation across disconnected hemispheres.
    result = 0.0
    for polygon in source_parts(geometry):
        outer = abs(GEOD.polygon_area_perimeter(*zip(*polygon.exterior.coords))[0])
        holes = sum(abs(GEOD.polygon_area_perimeter(*zip(*ring.coords))[0])
                    for ring in polygon.interiors)
        result += outer - holes
    return result


def surface_area_upper_bound(geometry):
    # GEOS edges are straight in lon/lat. Geodesic chords through extra
    # collinear vertices can falsely give a roundoff sliver thousands of m2.
    # Bound its actual ellipsoidal surface area using the maximum WGS84
    # area density (a deliberately conservative a^2/(1-e^2) per radian^2).
    eccentricity_squared = GEOD.f * (2 - GEOD.f)
    return geometry.area * math.radians(1) ** 2 * GEOD.a ** 2 / (1 - eccentricity_squared)


def water_exclusion(land, lakes, shelves):
    excluded = polygonal(land.intersection(lakes.union(shelves)))
    return polygonal(land.difference(excluded)), excluded


def europe_candidate(legacy, lakes):
    return require_valid(polygonal(legacy.difference(lakes)), "Europe candidate")


def partition_mainland(geometry, first_domain, first_name, second_name):
    return {first_name: polygonal(geometry.intersection(first_domain)),
            second_name: polygonal(geometry.difference(first_domain))}


def classify_island(geometry, labels):
    if box(52, 11, 55, 14).covers(geometry):
        return {"continent": None, "rule": "socotra-group-geographic-convention-needs-decision",
                "status": "unresolved"}
    seed_matches = [(name, continent) for name, continent, point in ISLAND_SEEDS
                    if geometry.covers(Point(*point))]
    if len(seed_matches) > 1:
        raise ValueError(f"Unexpected joined physical islands: {seed_matches}")
    if seed_matches:
        return {"continent": seed_matches[0][1], "rule": seed_matches[0][0], "status": "assigned"}
    matches = [(name, continent) for name, continent, bounds in ISLAND_GROUPS
               if box(*bounds).covers(geometry)]
    if len({continent for _, continent in matches}) > 1:
        raise ValueError(f"Conflicting island rules: {matches}")
    if matches:
        return {"continent": matches[0][1], "rule": "+".join(name for name, _ in matches), "status": "assigned"}
    if WALLACE_WEST.covers(geometry):
        return {"continent": "asia", "rule": "wallace-west-whole-component", "status": "assigned"}
    if WALLACE_EAST.covers(geometry):
        return {"continent": "oceania", "rule": "wallace-east-whole-component", "status": "assigned"}
    # Named local attribution, not sovereign-state transfer. The whole component
    # must be accounted for by same-continent local polygons within recorded
    # numerical tolerance; a coastline mismatch is not fixed by nearest country.
    geographic = {
        "Africa": "africa", "Asia": "asia", "North America": "north-america",
        "South America": "south-america", "Oceania": "oceania",
    }
    permitted_domains = {
        "africa": box(-32, -60, 65, 38),
        "asia": unary_union([box(25, -1.5, 180, 90), box(-180, 60, -169, 90)]),
        "north-america": box(-180, 5, -25, 90),
        "south-america": box(-110, -60, -25, 14),
        "oceania": unary_union([box(110, -60, 180, 30), box(-180, -60, -130, 30)]),
    }
    candidates = []
    for label in labels:
        continent = "asia" if label["name"] in {"Russia", "Turkey"} else geographic.get(label["continent"])
        if label["name"] == "Indonesia":
            continue
        if continent and permitted_domains[continent].covers(geometry) and label["whole_component"]:
            candidates.append((continent, label["name"]))
    if len({continent for continent, _ in candidates}) == 1:
        return {"continent": candidates[0][0],
                "rule": "local-ne-geography-with-spatial-guard:" + "+".join(sorted(name for _, name in candidates)),
                "status": "assigned"}
    return {"continent": None, "rule": "no-unambiguous-approved-component-rule", "status": "unresolved"}


def read_layer(key, repair_log):
    path, expected = PINS[key]
    if digest(path) != expected:
        raise ValueError(f"Pinned geographic source mismatch: {path.name}")
    layer = "ne_10m_" + LAYERS[key]
    records = []
    with zipfile.ZipFile(path) as archive:
        version = archive.read(f"{layer}.VERSION.txt").decode("utf-8").strip()
        reader = shapefile.Reader(shp=io.BytesIO(archive.read(f"{layer}.shp")),
                                  dbf=io.BytesIO(archive.read(f"{layer}.dbf")), encoding="utf-8")
        for index, row in enumerate(reader.iterShapeRecords()):
            geometry = shape(row.shape.__geo_interface__)
            if not geometry.is_valid:
                # Only the three inspected self-intersections may be repaired.
                if (key, index) not in {("lakes", 412), ("lakes", 1186), ("countries", 161)}:
                    raise ValueError(f"Invalid source {key} feature {index}")
                before = geometry
                geometry = polygonal(shapely.make_valid(before))
                repair_log.append({"source": key, "feature_index": index,
                                   "name": row.record.as_dict().get("ADMIN", row.record.as_dict().get("name")),
                                   "reason": shapely.is_valid_reason(before),
                                   "method": "GEOS make_valid, polygonal parts only",
                                   "original_wkb_sha256": hashlib.sha256(before.wkb).hexdigest(),
                                   "repaired_wkb_sha256": hashlib.sha256(geometry.wkb).hexdigest(),
                                   "planar_area_before_deg2": before.area,
                                   "planar_area_after_deg2": geometry.area})
            require_valid(geometry, f"{key} feature {index}")
            records.append((row.record.as_dict(), geometry))
    return records, version


def africa_domain(rivers):
    vertices = [coord for record, geometry in rivers if record.get("name") == "Suez Canal"
                for line in (geometry.geoms if geometry.geom_type == "MultiLineString" else [geometry])
                for coord in line.coords]
    if len(vertices) < 10:
        raise ValueError("Archived Suez centerline is missing")
    # The source has disconnected/duplicate segments around the lakes.
    # A monotonic north-to-south schematic path records rather than hides this.
    ordered = sorted(set(vertices), key=lambda point: (-point[1], point[0]))
    path = []
    for point in ordered:
        if not path or path[-1][1] - point[1] > .002:
            path.append(point)
    if path[-1] != ordered[-1]:
        path.append(ordered[-1])
    domain = Polygon([(-25, 40), (path[0][0], 40)] + path
                     + [(34.5, 27.5), (38, 20), (43.3, 12.5), (55, 12.5),
                        (60, 10), (60, -40), (-25, -40), (-25, 40)])
    return require_valid(domain, "Africa mainland domain"), path


def local_labels(geometry, countries, tree):
    labels, local_geometries = [], {}
    for index in tree.query(geometry, predicate="intersects"):
        record, country = countries[int(index)]
        if geometry.intersection(country).area == 0:
            continue
        labels.append({"name": record["ADMIN"], "continent": record["CONTINENT"],
                       "whole_component": False})
        continent = "Asia" if record["ADMIN"] in {"Russia", "Turkey"} else record["CONTINENT"]
        local_geometries.setdefault(continent, []).append(country)
    tolerance_m2 = min(1.0, geodesic_area(geometry) * 1e-8)
    for label in labels:
        continent = "Asia" if label["name"] in {"Russia", "Turkey"} else label["continent"]
        uncovered = surface_area_upper_bound(geometry.difference(unary_union(local_geometries[continent])))
        label["same_geographic_group_uncovered_m2"] = uncovered
        label["uncovered_area_method"] = "conservative-WGS84-surface-area-upper-bound"
        label["coverage_tolerance_m2"] = tolerance_m2
        label["whole_component"] = uncovered <= tolerance_m2
    return sorted(labels, key=lambda row: row["name"])


def svg_path(geometry):
    commands = []
    for part in source_parts(geometry):
        for ring in [part.exterior, *part.interiors]:
            coordinates = list(ring.coords)
            commands.append("M" + "L".join(f"{x:.5f},{-y:.5f}" for x, y in coordinates) + "Z")
    return "".join(commands)


def render_atlas(masks, unresolved, excluded, report):
    # Simplification is display-only, never used in data geometry or areas.
    views = [
        ("World / Svet", (-180, -90, 180, 90), False),
        ("Wallace: Bali / Lombok / Borneo / Sulawesi / New Guinea", (90, -15, 155, 12), False),
        ("Suez / Sinai", (29, 27, 35, 33), False),
        ("Panama / Colombia", (-80, 6, -75, 11), False),
        ("Arctic / Arktida", (-180, 60, 180, 90), False),
        ("Southern islands / Jizni ostrovy", (-180, -60, 180, -35), False),
        ("Antarctica / Antarktida: EPSG:3031", (-3500000, -3500000, 3500000, 3500000), True),
    ]
    projector = pyproj.Transformer.from_crs(4326, 3031, always_xy=True).transform
    blocks = []
    for title, bounds, polar in views:
        domain = box(*bounds) if not polar else box(-180, -90, 180, -60)
        paths = []
        for name, geometry in [*masks.items(), ("unresolved", unresolved), ("excluded", excluded)]:
            visible = geometry.intersection(domain)
            if visible.is_empty:
                continue
            display = transform(projector, visible) if polar else visible
            display = display.simplify(1000 if polar else .015, preserve_topology=True)
            color = COLORS.get(name, "#e94848" if name == "unresolved" else "#8795a5")
            paths.append(f'<path fill="{color}" fill-rule="evenodd" d="{svg_path(display)}"><title>{name}</title></path>')
        left, bottom, right, top = bounds
        blocks.append(f'<section><h2>{html.escape(title)}</h2><svg role="img" aria-label="{html.escape(title)}" '
                      f'viewBox="{left} {-top} {right-left} {top-bottom}">{"".join(paths)}</svg></section>')
    legend = " ".join(f'<span style="border-left:16px solid {color};padding-left:5px">{name}</span>'
                      for name, color in COLORS.items())
    counts = json.dumps(report["summary"], ensure_ascii=True, indent=2)
    return f"""<!doctype html><html lang="cs"><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>7C.6c - continental mask drafts</title>
<style>body{{font:16px system-ui;background:#102030;color:#edf3fa;margin:2rem}}a{{color:#8ce5dc}}
svg{{width:100%;max-height:650px;background:#23384b;border:1px solid #71869b}}section{{margin:2rem 0}}
pre{{white-space:pre-wrap}}.notice{{border:2px solid #e94848;padding:1rem}}span{{display:inline-block;margin:.3rem}}</style>
<h1>7C.6c - navrh masek / draft masks</h1>
<p class="notice">Neni verejny produkt ani validace 7C.6d. Cervena = neprirazeno; seda = vyloucena voda / ledovy self.
Antarktida neni certifikovana maska uzemneneho ledu. / Not a public release or 7C.6d certification.
Red = unresolved; grey = excluded water / ice shelf. Antarctica is not certified grounded-ice geometry.</p>
<p>Europe v2 candidate excludes mapped lakes; legacy v1 and all climate outputs are unchanged.
Maps use display-only simplification; full-resolution GeoJSON is authoritative for this draft.</p>
<p>{legend}</p><p><a href="report.json">Report / blokace</a> |
<a href="component-registry.json">Component registry</a> |
<a href="unresolved.geojson">Unresolved geometry</a></p>
<ul>{"".join(f'<li><a href="{name}.geojson">{name}.geojson</a></li>' for name in CONTINENTS)}</ul>
<pre>{html.escape(counts)}</pre>{"".join(blocks)}
<p>Made with Natural Earth, public domain. EPSG:4326 overview and regional maps;
EPSG:3031 Antarctic preview. Equirectangular maps are not equal-area comparisons.
Small source islands may be below display resolution. No network resources or climate data.</p></html>"""


def main():
    OUTPUT.mkdir(parents=True, exist_ok=True)
    repairs = []
    layers, versions = {}, {}
    for key in LAYERS:
        layers[key], versions[key] = read_layer(key, repairs)
    europe_path, expected = PINS["europe-v1"]
    if digest(europe_path) != expected:
        raise ValueError("Frozen Europe artifact checksum mismatch")
    legacy_europe = require_valid(shape(json.loads(europe_path.read_text(encoding="utf-8"))["geometry"]), "Europe v1")
    land = require_valid(unary_union([g for _, g in layers["land"]]), "Land union")
    lakes = require_valid(unary_union([g for _, g in layers["lakes"]]), "Lake union")
    shelves = require_valid(unary_union([g for _, g in layers["shelves"]]), "Shelf union")
    eligible, excluded = water_exclusion(land, lakes, shelves)
    europe = europe_candidate(legacy_europe, lakes)
    europe_outside_m2 = geodesic_area(europe.difference(land))
    if europe_outside_m2 > .01:
        raise ValueError(f"Candidate Europe extends outside pinned land: {europe_outside_m2} m2")
    europe = polygonal(europe.intersection(eligible))
    africa, suez_path = africa_domain(layers["rivers"])
    colombia = next(g for r, g in layers["countries"] if r["ADMIN"] == "Colombia")
    south_america = unary_union([colombia, box(-90, -60, -30, 7), box(-77, -60, -30, 15)])
    countries = layers["countries"]
    tree = shapely.STRtree([g for _, g in countries])
    exclusion_shapes = [g for _, g in layers["lakes"]] + [g for _, g in layers["shelves"]]
    exclusion_tree = shapely.STRtree(exclusion_shapes)
    source_components = sorted(source_parts(land), key=lambda g: (-g.area, g.bounds))
    parts = {name: [] for name in CONTINENTS}
    unresolved_parts, registry = [], []
    for index, original in enumerate(source_components):
        identifier = f"land-{index:05d}"
        local_exclusions = unary_union([exclusion_shapes[int(i)]
                                        for i in exclusion_tree.query(original, predicate="intersects")])
        retained, removed = water_exclusion(original, local_exclusions, EMPTY)
        record = {"id": identifier, "source_geometry_sha256": hashlib.sha256(original.wkb).hexdigest(),
                  "bounds": original.bounds, "source_area_m2": geodesic_area(original),
                  "excluded_area_m2": geodesic_area(removed), "assignments": []}
        european = polygonal(retained.intersection(europe))
        if not european.is_empty:
            parts["europe"].append(european)
            record["assignments"].append({"continent": "europe", "rule": "frozen-v1-minus-mapped-lakes",
                                          "area_m2": geodesic_area(european)})
        remainder = polygonal(retained.difference(europe))
        if not remainder.is_empty:
            if original.covers(Point(20, 10)) and original.covers(Point(100, 40)):
                assigned = partition_mainland(remainder, africa, "africa", "asia")
                reason = "identified-afroeurasian-mainland:Suez-source-derived-cut-minus-Europe"
            elif original.covers(Point(-100, 40)) and original.covers(Point(-60, -10)):
                assigned = partition_mainland(remainder, south_america, "south-america", "north-america")
                reason = "identified-American-mainland:Panama-Colombia-admin-border-cut"
            elif original.bounds[3] < -60:
                assigned = {"antarctica": remainder}
                reason = "south-of-60-minus-mapped-shelves-grounding-review-required"
            else:
                assigned, reason = {}, ""
                for piece in source_parts(remainder):
                    labels = local_labels(piece, countries, tree)
                    result = classify_island(piece, labels)
                    entry = {**result, "bounds": piece.bounds, "area_m2": geodesic_area(piece),
                             "local_admin_evidence": labels}
                    record["assignments"].append(entry)
                    if result["continent"] is None:
                        unresolved_parts.append(piece)
                    else:
                        parts[result["continent"]].append(piece)
            for name, geometry in assigned.items():
                if geometry.is_empty:
                    continue
                require_valid(geometry, f"{identifier}:{name}")
                parts[name].append(geometry)
                record["assignments"].append({"continent": name, "rule": reason,
                                              "area_m2": geodesic_area(geometry)})
        record["status"] = ("excluded" if retained.is_empty else
                            "unresolved" if any(row.get("continent") is None for row in record["assignments"])
                            else "assigned")
        registry.append(record)
        if index % 1000 == 0:
            print(f"Registered {index}/{len(source_components)} components", flush=True)
    masks = {name: require_valid(unary_union(geometries), name) for name, geometries in parts.items()}
    unresolved = require_valid(unary_union(unresolved_parts), "Unresolved")
    union = unary_union([*masks.values(), unresolved])
    difference = polygonal(eligible.symmetric_difference(union))
    closure_m2 = surface_area_upper_bound(difference)
    overlap_m2 = sum(surface_area_upper_bound(left.intersection(right))
                     for left, right in combinations([*masks.values(), unresolved], 2))
    excluded_overlap_m2 = surface_area_upper_bound(union.intersection(excluded))
    area_tolerance_m2 = 10.0
    if max(closure_m2, overlap_m2, excluded_overlap_m2) > area_tolerance_m2:
        raise ValueError(f"Draft topology exceeds {area_tolerance_m2} m2: "
                         f"closure={closure_m2}, overlaps={overlap_m2}, excluded={excluded_overlap_m2}")
    report = {
        "schema_version": 1, "version": VERSION, "status": "draft-review-required-not-climate-ready",
        "publication_allowed": False, "climate_weights_allowed": False,
        "sources": {key: {"file": str(path.relative_to(ROOT)), "sha256": pin,
                          "version": versions.get(key, "europe-kuma-manych-cyprus-v1"),
                          "license": "Natural Earth public domain; project boundary CC0" if key == "europe-v1"
                          else "Natural Earth public domain"}
                    for key, (path, pin) in PINS.items()},
        "implementation_sha256": digest(Path(__file__)),
        "runtime": {"shapely": shapely.__version__, "pyproj": pyproj.__version__,
                    "geos": shapely.geos_version_string},
        "source_repairs": repairs,
        "europe": {"legacy_unchanged": digest(europe_path) == expected,
                   "candidate_version": "europe-kuma-manych-cyprus-v2-lakes-candidate",
                   "removed_mapped_lakes_m2": geodesic_area(legacy_europe.intersection(lakes)),
                   "legacy_outside_land_roundoff_m2": europe_outside_m2,
                   "outside_land_tolerance_m2": .01,
                   "climate_recomputation": "not-performed-not-approved",
                   "geometry_difference_from_v1_requires_new_climate_provenance": True},
        "boundary_rules": {
            "suez": {"source": "Natural Earth Suez Canal centerline vertices",
                     "path_lon_lat": suez_path,
                     "caveat": "Schematic monotonic stitching of disconnected source pieces; 0.002 degree vertex filtering, not survey accuracy. Marine joins are cartographic."},
            "panama_colombia": {"source": "Natural Earth Colombia country polygon at mainland frontier",
                               "caveat": "Administrative frontier as approved project convention; local topology needs 7C.6d review."},
            "asia_oceania": {"western_domain_lon_lat": list(WALLACE_WEST.exterior.coords),
                             "caveat": "Project Wallace-inspired island assignment, not a universal continental boundary. Only whole-component matches accepted."},
            "island_group_windows": [{"rule": name, "continent": continent, "bounds": bounds}
                                     for name, continent, bounds in ISLAND_GROUPS],
            "whole_island_seeds": [{"rule": name, "continent": continent, "point": point}
                                  for name, continent, point in ISLAND_SEEDS],
            "other_islands": "Whole-component local geography plus spatial guard. Same-continent local polygons may jointly cover a multinational island. Coverage tolerance <=min(1 m2, component area*1e-8) recorded per component; no coastline/nearest-country fill. Russia/Turkey remainders explicitly Asian, never assigned by sovereign-state continent; Indonesia requires explicit island rules."},
        "blockers": [
            "Any unresolved component requires explicit review; no nearest-continent fallback.",
            "Antarctic shelf polygons are historical generalized cartography based on 2003-2004 MOA; no independently verified grounding line is archived. Antarctica remains provisional.",
            "Natural Earth basic lakes are incomplete and partly historical; mapped-lake exclusion is not proof of removal of every inland water body.",
            "Europe v2 candidate differs from the frozen v1 climate mask; old outputs must not be relabelled.",
            "7C.6d full topology, polar/dateline, geographic and model-coast/weight validation is not performed here."],
        "summary": {
            "source_component_count": len(registry),
            "assigned_source_components": sum(row["status"] == "assigned" for row in registry),
            "unresolved_source_components": sum(row["status"] == "unresolved" for row in registry),
            "excluded_source_components": sum(row["status"] == "excluded" for row in registry),
            "unresolved_polygon_count": len(source_parts(unresolved)),
            "unresolved_area_m2": geodesic_area(unresolved),
            "draft_accounting_difference_m2": closure_m2,
            "draft_accounting_difference_deg2": difference.area,
            "draft_accounting_difference_method": "Conservative WGS84 surface-area upper bound for lon/lat-linear GEOS difference, not geodesic-chord sliver area",
            "draft_accounting_tolerance_m2": area_tolerance_m2,
            "draft_pairwise_overlap_upper_bound_m2": overlap_m2,
            "draft_excluded_overlap_upper_bound_m2": excluded_overlap_m2,
            "topology_tolerance_note": "All three draft topology bounds use 10 m2 tolerance; nonzero sub-m2 bounds are retained, not labelled exact zero.",
            "area_method": "WGS84 geodesic polygon rings, subtract absolute hole areas; dateline crossings retained",
            "areas_m2": {name: geodesic_area(geometry) for name, geometry in masks.items()},
        },
    }
    for name, geometry in masks.items():
        dump(OUTPUT / f"{name}.geojson", {"type": "Feature", "properties": {
            "continent": name, "version": VERSION, "status": report["status"],
            "mask_version": report["europe"]["candidate_version"] if name == "europe" else f"{name}-geographic-draft-v1",
            "publication_allowed": False, "climate_weights_allowed": False,
            "grounding_line_verified": False if name == "antarctica" else None,
        }, "geometry": mapping(geometry)})
    dump(OUTPUT / "unresolved.geojson", {"type": "Feature", "properties": {"status": "unresolved-not-assigned"},
                                        "geometry": mapping(unresolved)})
    dump(OUTPUT / "excluded.geojson", {"type": "Feature", "properties": {"status": "mapped-lakes-and-shelves"},
                                      "geometry": mapping(excluded)})
    dump(OUTPUT / "component-registry.json", {"schema_version": 1, "version": VERSION, "components": registry})
    dump(OUTPUT / "report.json", report)
    (OUTPUT / "atlas.html").write_text(render_atlas(masks, unresolved, excluded, report), encoding="utf-8")
    outputs = [*OUTPUT.glob("*.geojson"), OUTPUT / "component-registry.json", OUTPUT / "report.json", OUTPUT / "atlas.html"]
    dump(OUTPUT / "outputs.json", {"version": VERSION, "files": [
        {"file": path.name, "bytes": path.stat().st_size, "sha256": digest(path)}
        for path in sorted(outputs)]})
    print(json.dumps(report["summary"], indent=2), flush=True)
    print(f"Review atlas: {OUTPUT / 'atlas.html'}", flush=True)


if __name__ == "__main__":
    main()
