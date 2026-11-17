# Weather Global backend

The public Astro build is static. `api.php` reads only the current validated
release; `cron.php` runs the scheduled importer only after a private token is
configured. Source downloads never happen while a visitor opens a page.
The canonical Weather Global 1.0 build and web-hosting guide is
[`../../implementace.md`](../../implementace.md). Operator-approved hosting packaging adds
nine static JSON API families with checked catalogues, complete bundles and
attribution. Archived `publication_allowed: false` products remain untouched;
public copies carry approved release metadata. Invalid legacy European pilots
remain local. This frontend packaging never changes private storage or config.
The build uses lowercase public asset names and fails if an uppercase path is
emitted, to remain compatible with the WEDOS FTP upload behavior.
Private PHP source filenames and their `require_once` references are also
entirely lowercase. Upload `backend/private/src/` without changing its names;
Linux requires an exact case match. When updating it, preserve the hosting
`config.php` and `storage/`.

## Local checks

From `prototype/`:

```powershell
npm test
npm run build
npm run dev
```

Reuse the installed dependencies; restore them only if missing. In particular,
do not run `npm ci` against a running Windows development server (native DLL locks).

The development server imports the archived, checksum-verified samples into
`backend/private/storage/` on first start. It uses `config.example.php`, whose
empty cron token keeps the cron endpoint inactive. No live source is contacted.

## Private hosting layout

Upload the contents of `prototype/dist/` to the public
`/weather_global/` directory. Put the contents of `prototype/backend/private/`
in a separate, non-public directory named `weather_global-private` beside the
document root. The PHP entry points look for that directory relative to the
public path; if the host uses a different layout, set
`WEATHER_GLOBAL_PRIVATE_DIR` and `WEATHER_GLOBAL_CONFIG` to absolute private
paths. Do not upload `config.example.php` as an active configuration.

Create `config.php` in the private directory by copying the example. Set
`storage_directory` to an absolute path that is not web-accessible. Leave
`cron_token` empty until the operator explicitly activates the scheduled
import. Keep the upstream timeout at 8 seconds or less so the initial download
of all pinned files fits the hosting execution limit. When activating the
endpoint, generate a unique random token of at least 32 characters; do not
reuse the existing Weather_3PO token. Prefer an
`Authorization: Bearer` header if the scheduler supports it. If the scheduler
requires a query parameter, protect its URL and rotate the token if it may
have appeared in access logs.

The endpoint enforces a 24-hour minimum interval, regardless of how often the
hosting scheduler calls it. A failure returns a non-success status and leaves
the previous release selected. The IPCC files are pinned to the checked-in
Atlas commit and SHA-256 values.

No hosting files, production URL, existing cron job, or production
configuration are changed by this project.

## Atlas navigation

The overview is a bilingual thematic hub for global climate, continents and
oceans, followed by the existing indicator cards and an explanation of
observations, added estimates and conditional scenarios.
Six primary sections replace the flat product menu. Each section exposes its
subpages through contextual navigation and expandable mobile groups. At widths up
to 1100 px the main navigation opens with the Menu button; Escape closes it and
returns focus. Route and language changes close the menu.
Existing hash URLs remain unchanged. Regional European previews and archives
remain available only in the loopback development environment, under Continents.
This navigation change does not modify data processing or publish a release.

## Phase 7D.0: bounded source feasibility

The local source registry and evidence are in
`data_samples/2026-11-06/phase7d-feasibility/` at the repository root.
From the repository root:

```powershell
node prototype\scripts\audit_7d_sources.mjs
python -B prototype\scripts\inspect_7d_samples.py
python -B -m unittest discover -s prototype\scripts -p test_7d_feasibility.py -v
node --test prototype\tests\7d-source-audit.test.mjs
```

Use the existing Python environment containing numpy and netCDF4. The archiver
reuses checksum-verified files, refuses to overwrite their bytes, and records
failed URLs explicitly. Inspection is offline. An archived HTTP response is
not automatically a numerical dataset: the carbon-budget download returned an
HTML consent page and the SPEI sample is only a bounded partial header.
Neither is admitted as a numerical product.

The first implementable scope is monthly Arctic/Antarctic sea ice extent.
January 1988 and December 1987 are missing in both hemispheres, including inside
the proposed 1981-2010 reference. Reference counts must be reported (29 for
January/December, 30 otherwise); no gap filling is authorised by this audit.
The source registry records separate remaining gates for ice-sheet mass, snow,
precipitation, drought, emissions and atmospheric gases. See
[the phase record](../../fazeD.md) for scope and licence findings.
No application API, deployment or scheduled import is changed by 7D.0.

## Phase 7D.1: monthly polar sea ice

Locally implemented at `#sea-ice?lang=cs` (or `lang=en`), under Oceans,
also linked from the overview and sources. Separate NSIDC G02135 v4
Northern/Southern Hemisphere monthly extent: November 1978 through October 2026.
The concentration threshold is >=15%; units are million km2.
This is the producer's monthly concentration-grid aggregation, not necessarily
the mean of daily extents. It cannot establish exact daily extrema, volume,
mass or land-ice sea-level contribution.

Historical month and period selection, extent/project departure, two selected
seasonal years, reference lines and accessible tables are included. January and
December 1981-2010 project references each have 29 values, other months 30.
December 1987 and January 1988 stay missing in both hemispheres. Partial 1978
and 2026 seasons are not extrapolated. Missing source area does not discard
valid extent. Source identifiers include quoted mixed `NSIDC-0051,NSIDC-0081`;
do not split these CSV rows naively at every comma.

Offline reproduction from the repository root, using the existing Python:

```powershell
node prototype\scripts\build_sea_ice.mjs
python -B prototype\scripts\validate_sea_ice.py
node --test prototype\tests\sea-ice.test.mjs prototype\tests\sea-ice-api.test.mjs
```

The builder checksum-verifies all 24 CSVs against the 7D.0 manifest. The
independent Python validator checks all 1,152 records and 24 reference means
directly from the CSVs, not from shared JS reduction helpers. Numerical output
is deterministic and a rebuild refuses to replace differing bytes. Versioned
products are in `data_samples/2026-11-06/sea-ice-7d1/`, outside the public tree.
Update the output version/directory explicitly for a future source snapshot.

The development middleware serves loopback-only
`/weather_global/sea-ice-api/v1/{catalog,bundle}.json`, GET/HEAD, no-store,
nosniff. Catalogue identity, byte length, SHA-256 and the scientific contract
must pass; otherwise it logs an error and returns 503, never stale substitute
data. Queries, unknown paths, methods and non-local hosts are rejected.
The browser verifies the same checksum and contract, has explicit error/retry,
and aborts/disposes resources when navigating away.

Create a **new** manual candidate from `prototype/`:

```powershell
npm run build
node scripts\package_sea_ice.mjs
npm test
```

Packaging refuses an existing candidate directory. The supplied
`sea-ice-7d1/manual-review-candidate/` contains 25 checksum-listed files: current
frontend, sea ice API, earlier three API families byte-for-byte, attribution,
independent numerical evidence and a source-review record. No raw archives,
credentials or private config are copied. The complete atlas still has earlier
NASA redistribution/provisional Antarctic land-geometry publication gates.
Sea ice uses the producer's polar domains, not those land masks.
No FTP, CRON, production release pointer or configuration was changed.

Runnable integrated Playwright flows are exported by
`tests/sea-ice-browser-flows.mjs`: `validateSeaIceMatrix`,
`validateSeaIceControlsAndNavigation`, `validateSeaIceFailureAndLifecycle`.
Replay with an existing page against the development server on port 4174.
They cover 96 language/hemisphere/month/metric combinations, exact chart values,
4,608 paginated table rows, gaps, 29/30 references, partial seasons, invalid/empty
selections, 503/corrupt-200 rejection, retry, disposal and late cancellation.
CS/EN widths 320/390/768/1366 have no page overflow. The integrated hidden page
requires DOM clicks and synthetic resize delivery; native visible pointer,
focus and live-resize delivery remain a manual check, not a claimed automated
certification. No new browser/package installation was required.
Final regression: 77 Node tests and 68 PHP assertions pass; the static build
passes with the existing large-chunk advisory. Candidate checks also prove
that a repeated staging attempt refuses to overwrite the previous bytes.

## Phase 7D.2: Greenland and Antarctic land ice

Implemented locally at `#ice-sheets?lang=cs` or `lang=en`, under Oceans.
The source is the **public NASA Earth Indicator chart product**, not an
authenticated download of PO.DAAC scientific granules. The indicator links
embedded regional charts; their published JS loader supplies public JSON URLs.
No Earthdata login, credentials or access-control workaround was used.

Source snapshots, evidence, deterministic product, catalogue and independent
validation are in `data_samples/2026-11-06/ice-sheets-7d2/`.
The original graphs were updated 2026-10-23 and archived 2026-11-06.
Each region has 260 original records: 259 valid values and one null mission
marker. Source-labelled interval is 2002-04-16 through 2026-07-17. Scientific
product pages already mention August 2026, but that is not in this graph and is
not substituted into it. Ten HTTP responses are archived; the JPL method URL
returned a recorded 404, never numerical evidence.

Preserve original decimal years, labelled dates and record IDs. These are
irregular representative epochs of monthly solutions, not daily observations
or a calendar-month series. Some labelled months contain two distinct records
(2011-10, 2012-01, 2015-04, 2017-04): do not merge or shift them. Lines/bands
split at the original null and at intervals >0.125 decimal year (about 46 days);
this is an explicit graphical rule, not filled data. The main mission gap is
between source labels 2017-06-10 and 2018-06-14. There are 18 other longer
source intervals.

The published chart zero is retained (first point = 0 Gt); no project rebasing,
including on shorter selections. The chart JSON does not document the full
reference operation: do not claim a 1981-2010 or underlying-grid mean for it.
Published `y_margin_min/y_margin_max` remain exact in the chart and table.
Their confidence level and re-zeroing covariance are not stated in this chart
JSON; do not label them 95% or 1-sigma, despite general scientific mascon release
notes discussing calibrated 1-sigma uncertainty. No own GIA correction,
hydrological gain factors, Antarctic continental masks, annual sums,
extrapolation or mass-to-sea-level conversion.

Offline reproduction from the repository root, using the existing Python:

```powershell
node prototype\scripts\build_ice_sheets.mjs
python -B prototype\scripts\validate_ice_sheets.py
node --test prototype\tests\ice-sheets.test.mjs prototype\tests\ice-sheets-api.test.mjs
```

Only for intentionally creating a **new source snapshot**, before building:
`node prototype\scripts\archive_ice_sheets.mjs`. It archives bounded public
responses and checks cached source bytes. Never refresh the manifest under an
already-built immutable product; choose a new version/directory explicitly.
The existing archive is complete for the selected public chart product; no
network refresh is needed for reproduction. `source-review.json` records
scientific limits, citation and use evidence; the historical 7D.0 registry is
kept unchanged as its original audit snapshot.

The local read-only API is
`/weather_global/ice-sheets-api/v1/{catalog,bundle}.json`. It shares the verified
loopback GET/HEAD middleware with sea ice, preserving query/method/Host
rejection, no-store/nosniff, size/SHA-256/scientific contract checks and explicit
logged 503. Client-side checksums, error/retry and abort/dispose are tested.

UI includes region/period selection, optional source uncertainty band/bars,
all-record paginated table, gap list, dynamic description, glossary and CS/EN
methods. Overview/context/source/About entries and land-ice/sea-ice/observed
sea-level/scenario links are wired without adding another primary nav section.
Theme-aware chart contrast is 8.54:1 (mass line) and 8.47:1 (axis labels).

Candidate creation from `prototype/`:

```powershell
npm run build
node scripts\package_ice_sheets.mjs
npm test
```

The current candidate is `ice-sheets-7d2/manual-review-candidate-r2/`:
31 checksum-listed files, current frontend, all five API families, attribution
and scientific evidence. Earlier four API families are preserved byte-for-byte.
The initial 7D.2 candidate predates the final dark-theme colour/contrast check;
it was not overwritten and is not the current candidate. Repeated staging into
the current directory fails with EEXIST. No raw archives, private configuration
or credentials are included. Full-atlas publication and native visible UI
sign-off remain separate; this phase does not clear prior NASA continental
redistribution or provisional Antarctic land-geometry gates.

Runnable integrated Playwright flows in `tests/ice-sheets-browser-flows.mjs`:
`validateIceSheetNumerics`, `validateIceSheetControlsAndLayout`,
`validateIceSheetFailuresAndLifecycle`. They check all original records,
1,040 CS/EN table rows, 1,036 plotted mass values, 956 uncertainty polygons,
mission/other gaps, same-month distinct epochs, uncertainty toggling, range
errors/empty selections, failure/retry/disposal/cancellation, relevant links
and CS/EN widths 320/390/768/1366. Hidden integrated pages require DOM activation
and explicit resize delivery; no claim of native visible focus/pointer
certification. Existing sea ice matrix (96 selections, 4,608 rows) was replayed
successfully. No production, FTP, CRON or dependency installation was performed.
Final regression: **86 Node tests and 68 PHP assertions**, exit code 0; build
passes with the pre-existing large-chunk advisory.
`validateIceSheetBuiltCandidate(page, baseUrl)` also replays the built static
candidate: catalog/bundle 200, rendered SVG/table, two October 2011 epochs and
fractional axis labels, no failed HTTP requests. Supply a loopback static server
URL ending in `/weather_global/`; the existing `api.php` backend must separately
be available or proxied locally. This smoke check uses the packaged land-ice
JSON and compiled JS, not the development middleware's land-ice endpoint.

## Phase 7D.3: Northern Hemisphere snow cover

Locally implemented at `#snow-cover?lang=cs` or `lang=en`, under **Global
climate**, not as an ocean variable. Overview, contextual navigation, sources
and About are wired; six primary navigation groups remain.

Source: the four official Rutgers monthly regional text files linked from
<https://climate.rutgers.edu/snowcover/190km/table_area.php?ui_set=2>,
NOAA/NCEI NH SCE CDR v01r01, DOI **10.7289/V5N014G9**. Regions are NH,
Eurasia, North America including Greenland, and North America excluding
Greenland. Eurasia is not Europe; no project continental temperature masks
are used. NH equals Eurasia + NA including Greenland within 1 km2 producer
rounding. The no-Greenland option is an alternative, not another additive
region. Greenland strongly affects summer extent; this is not ice-sheet mass.

The monthly source is **1966-11 through 2026-10**, 711 original values per
region. The 720-month product axis explicitly retains nine missing dates:
1968-07, 1969-06--1969-10, 1971-07--1971-09. No gap filling/zero substitution
or Southern Hemisphere series. The separate archived weekly NetCDF starts
in October 1966; do not manufacture that month in these monthly files.
1966 and 2026 are partial years.

Original integer **km2** is retained in product/tables; charts use **million
km2**. Rutgers weights weekly areas by map-week days within each month.
We use their resulting official monthly figures, not a new grid reduction.
Historical Rutgers documentation discusses 89x89 cells and a 50% threshold;
the separately archived NCEI NetCDF declares 88x88 and about 42%. Those
conventions are explicitly not equated/rethresholded or used to manufacture
new monthly regional totals.

History selects one of 12 calendar months or **MAM (March--May)**, region,
period and extent/project departure. Seasonal comparison follows two selected
years, retaining partial years and gaps. Duplicate selected years collapse.
Both charts have tables; history pagination preserves exact original km2.
Complete MAM means require all three monthly source values, weighted
31/30/31 days. There are 61 spring records per region (1966 incomplete,
1967--2026 complete). Source monthly values stay unchanged. Derived values
are rounded to 0.000001 km2 for deterministic storage, not measurement
precision. References: available calendar-month means over 1981--2010,
30 values each; MAM reference is the mean of 30 complete yearly MAM means.
They are project calculations, not official Rutgers anomalies.

The seasonal decline shows extent retreat, not daily disappearance dates,
melt rates, depth, density, water equivalent, glacier mass or sea-level
contribution. No annual area sums. Selected text files contain no measurement
uncertainty: no invented confidence band or 95%/1-sigma claim. Methods explain
early-record reanalysis, land-mask/patchy-cell changes and the June 1999
weekly-chart-to-IMS transition; daily input is not daily output. Clouds,
illumination, vegetation and mountains remain observing limitations.

Offline reproduction from repository root (existing Python, no extra packages):

```powershell
node prototype\scripts\build_snow_cover.mjs
python -B prototype\scripts\validate_snow_cover.py
node --test prototype\tests\snow-cover.test.mjs prototype\tests\snow-cover-api.test.mjs
```

Original archive, manifest, `source-review.json`, product and independent
validation are in `data_samples/2026-11-06/snow-cover-7d3/`. Nine bounded public
responses (four monthly files, supporting NH weekly text, downloads/method/CDR/
citation pages) were checksummed. Independent Python parses raw texts without
JS reduction helpers: all **2844 original values, 2880 monthly records,
244 spring records, 52 reference means** and regional closure. Product:
238262 bytes, SHA-256
`72b53422236066d69f619364e70fcd2f8e27fa8d45f569691c6975e15464efbd`.
Historical 7D.0 registry remains an unchanged audit snapshot; the follow-up
source review resolves its aggregation gate by selecting producer totals.

Only when preparing a **new explicitly versioned source snapshot**, before
building: `node prototype\scripts\archive_snow_cover.mjs`. It verifies cached
bytes and refuses overwriting originals. Do not refresh an existing immutable
product's source files/manifest in place. Offline reproduction requires no
new download.

API: `/weather_global/snow-cover-api/v1/{catalog,bundle}.json`. Shared
read-only loopback GET/HEAD middleware rejects remote Host/method/query/
unknown paths; no-store/nosniff, byte/SHA-256/scientific contract validation.
Missing/corrupt/misleading data produce logged 503, never stale substitute
data. Browser checksums, explicit retry, abort and both chart disposals are
covered.

Build and stage a **new** candidate from `prototype/`:

```powershell
npm run build
node scripts\package_snow_cover.mjs
npm test
```

The current `snow-cover-7d3/manual-review-candidate/` has **37 manifest files,
six API families**; all 17 prior API files remain byte-identical.
Earlier attribution/review/validation is preserved under `prior-evidence/`.
No raw archives, credentials or private config. Staging refuses an existing
directory (EEXIST); previous candidates are unchanged. Public use is based
on the CDR's archived "No restrictions on access or use" metadata and the
Rutgers pages linking these same CDR files, with subset/access-date citation
and no endorsement. Full atlas publication and earlier scientific/licensing/
geographical gates still require separate review.

Runnable integrated Playwright flows in `tests/snow-cover-browser-flows.mjs`:
`validateSnowMatrix`, `validateSnowControlsAndLayout`,
`validateSnowFailuresAndLifecycle`, and
`validateSnowBuiltCandidate(page, baseUrl)`.
The matrix covers **208 language/region/period/metric selections**, **6248
history table rows**, and **12496 plotted history positions including nulls**,
plus seasonal values/references. Controls cover gaps, incomplete spring,
empty/invalid ranges, partial years, duplicate years, source/context/overview
navigation and ice cross-links. CS/EN widths 320/390/768/1366 fit without page
overflow; chart colours match the dark theme. The hidden integrated page uses
DOM activation and synthetic resize delivery; native visible pointer/focus/
live resize remains a manual sign-off gap.

Failure flow proves 503/corrupt-200 rejection, retry, disposal and late abort.
The built-candidate flow uses compiled JS and actual packaged snow JSON on a
temporary loopback static server; only legacy `api.php` is separately served
or locally proxied. Both endpoints 200, two SVG charts, exact selected source
value, zero failed HTTP requests. Temporary helper was stopped and removed.
Existing land-ice numerical browser replay also passes after integration.
Final **94 Node tests + 68 PHP assertions**, exit 0; static build passes with
the known large-chunk advisory. No dependency installs, production, FTP, CRON
or private configuration changes.

## Phase 7D.4: continental precipitation and water

The local CS/EN `#precipitation?lang=cs` / `#precipitation?lang=en` view
is under Global climate, the overview and Sources; six primary groups
remain. Monthly/annual history, two-year seasonality, continent choropleth,
exact tables and gauge/interpolation diagnostics share the verified bundle.

Selected **GPCC Precipitation Analysis Monthly Version 2025, 2.5 degrees**,
DOI **10.5676/DWD_GPCC/MONTHLY_V2025_250**, field **precip**, NOT
climatologically filled precip_infill. **January 1891-August 2026**:
**1628 source months**, including the monthly 2025/2026 extension.
47 original gzip NetCDF files and 47 producer MD5 files plus two HTML
pages are archived with bounded retrieval and SHA-256; all producer MD5s
verified. Actual CF time coordinates, not broken global time_coverage
strings, determine the axis. Raw archives are not in the delivery candidate.

New fractional intersections of the native grid with reviewed continent
geography use WGS84 ellipsoidal areas, not temperature-grid weights.
All monthly depths use identical common valid land support throughout
the record. Geographic/supported area and unsupported share are explicit.
Six-continent support fractions range from **99.992047% to 99.999922%**;
unsupported fragments are neither relocated nor zero-filled.
Antarctica is outside this GPCC domain: all values and references null.
Its neutral display outline is not data coverage or a validation of
provisional Antarctic temperature geography. Simplified display geometry
is never used in numerical weights.

Annual depth SUMS twelve monthly depths over identical support, never a
day-weighted mean. **1891-2025: 135 complete annual sums**; 2026 has only
eight source months and annual null. Project **1981-2010** references
have 30 same-calendar-month values and 30 complete yearly sums in each
supported continent. Departures are in mm. Continental mean depths are
not additive across continents.

`gauge >= 1` yields the weighted area fraction of grid cells containing
a gauge, not directly observed area or exact gauge coordinates.
Area-weighted `dist_int` is in km. Annual diagnostics show the minimum
monthly gauge-cell fraction and mean of twelve monthly distances.
These are not confidence intervals. GPCC is an interpolated observational
analysis with changing station networks/effective resolution. No invented
regional 95% or one-sigma interval from `err`, no sum of reused `gauge_int`,
no extra `sys_err` correction on published precip. Six decimal places
document reproducible reductions, not six-decimal measurement accuracy.
Precipitation is not groundwater, runoff, soil moisture, water availability
or a complete drought diagnosis.

Reproduce from repository root with the existing Python 3.10 environment
(numpy, netCDF4, shapely, pyproj; no dependency changes in this phase):

```powershell
node prototype\scripts\archive_precipitation.mjs
py -3.10 -B -m unittest discover -s prototype\scripts -p test_precipitation.py
py -3.10 -B prototype\scripts\build_precipitation.py
py -3.10 -B prototype\scripts\validate_precipitation.py
node --test prototype\tests\precipitation.test.mjs prototype\tests\precipitation-api.test.mjs prototype\tests\precipitation-numerical.test.mjs
Set-Location prototype
npm run build
Set-Location ..
node prototype\scripts\package_precipitation.mjs
node --test prototype\tests\precipitation-package.test.mjs
```

The archive verifies cached originals. Builder outputs are immutable:
re-running requires identical bytes, including pinned builder/source/
weights/geography hashes; changed inputs need a new product version and
output scope, not deletion/overwriting. Packaging refuses an existing
candidate with EEXIST. To check the already-built candidate without staging:

```powershell
node --input-type=module -e "import {verifyPrecipitationCandidate} from './prototype/scripts/package_precipitation.mjs'; console.log((await verifyPrecipitationCandidate()).files.length)"
Set-Location prototype
npm test
```

All new Node tests are in the canonical `npm test`, including the Python
numerical safeguard subprocess (Windows default `py -3.10`, elsewhere
`python3`; set `WEATHER_GLOBAL_PYTHON` to an explicit interpreter if needed).
API: `precipitation-api/v1/catalog.json` and `bundle.json`.
Loopback GET/HEAD only, no-store/nosniff, query/method/Host rejection;
both endpoints verify current checksum and scientific contract, with
logged 503 on missing/corrupt/misleading data. Browser independently checks
catalogue/SHA/science and supports explicit retry, abort and chart disposal.

Data/evidence: `data_samples/2026-11-06/precipitation-7d4/`.
Product **3641925 bytes**, SHA-256
`f8f574c513146cfb43ac60546ab150582eefcebdd89830f8d37417d444559f18`.
Independent validator checks **11396 monthly records (9768 valid),
952 annual records, 91 references and 42 separately densified WGS84
geodesic cell intersections**, plus all MD5/SHA/dependency pins.
`source-review.json` records CC BY 4.0 attribution and project modifications.
The previously archived DWD legal-notice evidence is SHA-pinned and copied
into the candidate; the live notice's 403 was not bypassed. No DWD endorsement.

Runnable integrated Playwright flows in
`tests/precipitation-browser-flows.mjs`: `validatePrecipitationMatrix`,
`validatePrecipitationControlsAndLayout`, `validatePrecipitationFailuresAndLifecycle`,
`validatePrecipitationBuiltCandidate(page, baseUrl)`.
The matrix covers **364 CS/EN selections, 24696 exact history table rows,
49392 plotted history positions including nulls, 2548 map values and 8736
seasonal positions**. Controls cover partial annual/missing month, Antarctic
null, reference counts, duplicate seasons, invalid ranges, source/navigation
and water limitations. Eight CS/EN widths 320/390/768/1366 fit without page
overflow; long DOI/citation wraps. 503/corrupt-200 rejection, retry, all chart
disposal and actual intercepted late-response abort pass.
The hidden integrated page uses DOM actions/synthetic resize; native
visible pointer/focus/live resizing remains a manual sign-off gap.

Current immutable `manual-review-candidate/`: **46 manifest files, seven
API families**. All **20 files from six previous API families byte-identical**;
recursive earlier attribution/reviews preserved under
`prior-evidence/snow-cover-7d3/`. No credentials/private config/raw archives.
Compiled frontend and actual packaged precipitation JSON were browser-tested
on an attached temporary loopback static helper (only legacy api.php locally
proxied): both endpoints 200, three SVG charts, exact 2026-08 value, no HTTP
failures. Helper stopped and removed. Previous sea-ice, land-ice and snow
browser numerical replays pass after integration.

Final **103 Node tests + 68 PHP assertions**, exit 0; build passes with the
known large-chunk advisory. Production, FTP, CRON, user servers and previous
candidates unchanged. Local 7D.4 complete; full 7D and public deployment are
not complete. Earlier product scientific/licensing/geography release gates
remain in force.

## Phase 7D.5: climatic drought and separate annual context

Local CS/EN `#drought?lang=cs` / `#drought?lang=en` under Global climate,
overview and Sources. **CSIC SPEIbase 2.11.0 / CRU TS 4.09**, SPEI-3/12,
native 0.5 degrees, **1901-01 through 2024-12**. Both complete original
NetCDF files (759745573 bytes) plus five product/method/licence pages
are archived with exact bounds and SHA-256. No operational SPEI Monitor
splicing: this source uses FAO-56 Penman-Monteith PET, not Thornthwaite.
Published standardized indices are not recalculated/recentered; archived
metadata do not explicitly establish calibration-period bounds.
Do not substitute 1981-2010 or current newer repository metadata.

New fractional native-grid / reviewed-continent intersections use WGS84
areas. Each month's denominator is actually available land, while potential
source domain is the stable union of cells having any valid source value.
Rare intermittent gaps remain missing for that month, not zero drought
or removal from all 124 years. Both geographic/domain and available/domain
fractions and all areas are explicit. Source domain covers 99.6616463%
to 99.9815906% of six-continent geographic land; Antarctica has zero domain
and null data. Its neutral outline does not certify temperature geography.

Seven exclusive project classes: x<=-2; -2<x<=-1.5; -1.5<x<=-1;
-1<x<1; 1<=x<1.5; 1.5<=x<2; x>=2. Not the producer viewer's different
percentile-colour intervals or local impact warning classes.
Cumulative dry <=-1, severe <=-1.5 and extreme <=-2 fractions overlap.
Source tails beyond +/-3 are valid, not clipped. Initial two/eleven
months remain null; first valid 1901-03/1901-12. Annual results require
twelve valid monthly fractions and report their arithmetic mean, NOT
unique annual affected area, index sum or mm. Annual coverage is minimum
monthly coverage; 1901 annual null, 1902-2024 complete.

Three SVG charts and exact tables show history, seven-class distribution
and selected continental category shares with fixed 0-100% map scale.
Map is not local dry-cell location. Separately fetched/checksummed GPCC
and conservative NASA APIs show same-year annual precipitation/departure
and temperature departure, each with its own support, units, 1981-2010
reference and licence. Independent context failure/retry leaves SPEI intact.
No combined index, inferred cause, soil-moisture/groundwater/streamflow/
reservoir/impact/water-access/forecast claims or invented confidence bounds.

Reproduce from repository root with the existing Python 3.10 environment:

```powershell
node prototype\scripts\archive_drought.mjs
py -3.10 -B -m unittest discover -s prototype\scripts -p test_drought.py
py -3.10 -B prototype\scripts\build_drought.py
py -3.10 -B prototype\scripts\validate_drought.py
node --test prototype\tests\drought.test.mjs prototype\tests\drought-api.test.mjs
Set-Location prototype
npm run build
Set-Location ..
node prototype\scripts\package_drought.mjs
node --test prototype\tests\drought-package.test.mjs
```

Builder/source/weights/geography pins are immutable; repeat runs verify
identical bytes. Packaging refuses an existing candidate (EEXIST); check
the current candidate without rebuilding:

```powershell
node --input-type=module -e "import {verifyDroughtCandidate} from './prototype/scripts/package_drought.mjs'; console.log((await verifyDroughtCandidate()).files.length)"
Set-Location prototype
npm test
```

Local API `drought-api/v1/catalog.json` / `bundle.json` uses the existing
loopback GET/HEAD no-store/nosniff, query/method/Host rejection and logged
fail-closed 503 checks. Browser independently verifies SHA/science with
explicit errors/retry, abort and chart/observer disposal. No new dependencies.
Data/evidence: `data_samples/2026-11-06/drought-7d5/`. Product 7598966 bytes,
SHA-256 `7b93cc00dc9736c8f84e6a8f59dd5f9b1e01f743e62ae8e1c95c102f4df31eeb`.
Independent validator checks all **20832 monthly / 1736 annual records,
17778 valid monthly results and 42 separate geodesic intersections** using
different raw strips and class coding. Five numerical Python safeguards
run within canonical `npm test`.

Runnable integrated Playwright flows in `tests/drought-browser-flows.mjs`:
`validateDroughtMatrix`, `validateDroughtControlsContextAndLayout`,
`validateDroughtFailuresAndLifecycle`, `validateDroughtBuiltCandidate`.
Matrix **364 CS/EN selections** covers seven regions, two windows, thirteen
periods, rotating all ten metrics (not the full metric-period cross-product):
**45136 exact history rows/plot positions, 2548 map values, 2352 class
positions**, including class tables and available areas. Separate context
is checked for seven regions in 1901/1981/2024. Spinup, Antarctic null,
invalid range, eight responsive cases, navigation, 503/corrupt200/retry,
independent context failure, both late-response aborts and all-chart disposal
pass. Prior precipitation browser matrix passes again. Hidden DOM/synthetic
resize does not certify visible native pointer/focus/live resizing.

Separate adapted drought database **ODbL 1.0**, contents **DbCL 1.0**:
full raw adapted JSON download, source links/citation, modification notice
and original licence pages in UI/candidate. No relicensing GPCC/NASA or the
entire atlas. Preserve the adapted-database access and attribution on any
future public use. `source-review.json` records evidence and limitations.

Immutable candidate: **58 manifest files, eight API families**; all **23
previous API files byte-identical**. Earlier rights/evidence recursively
retained under `prior-evidence/precipitation-7d4/`. No raw archives,
credentials or private configuration. Actual compiled candidate and packaged
JSON/context tested on temporary attached loopback helper: API 200, three
SVG charts, exact December 2024, adapted database download, zero HTTP failures.
Helper stopped/deleted. **113 Node tests +68 PHP checks**, exit 0; build
passes with existing large-chunk advisory. Local 7D.5 complete, not whole 7D
or production deployment. Prior scientific/licensing/geography and visible
interaction release gates remain. Production, FTP, CRON and earlier
candidates untouched. 7D.7 has since been implemented locally from the
archived NOAA GML CH4/N2O monthly files. 7D.6 remains blocked until the actual
licensed GCB numerical workbook is available; the archived `.xlsx` response
is HTML and must not be used as data.

## Phase 7D.7: atmospheric gas concentrations (local only)

The local NOAA GML product is built from the two archived source files under
`../../data_samples/2026-11-06/phase7d-feasibility/sources/`. It preserves
516 monthly CH4 values (1983-07 through 2026-06) and 306 monthly N2O values
(2001-01 through 2026-06), each with separate producer `average`, `trend`,
and uncertainty fields. Missing uncertainty sentinels remain null. These
are global dry-air concentrations in ppb, not emission inventories.

`scripts/build-atmospheric-gases.mjs` verifies the pinned input checksums and
month axes before creating
`../../data_samples/2026-11-06/atmospheric-gases-7d7/`. It refuses to overwrite
an existing product. Run `node scripts/build-atmospheric-gases.mjs --check`
from `prototype/` to verify that the existing bundle and catalogue still
exactly match the archived inputs. The local-only API and `atmospheric-gases`
view expose the validated product; publication remains disabled.

## Phase 7A: ocean history (local only)

The verified offline inputs and manifest are in
`../data_samples/2026-11-04/`. The sample combines the previous climate
snapshot with official HadSST4 monthly data, NOAA NCEI 0–2000 m OHC quarterly
files, and NOAA LSA's five-mission GMSL CSV plus NetCDF metadata. The manifest
records source URLs, capture times, byte counts and SHA-256 values. The
importer validates this manifest before parsing; visitor requests never fetch
these source files.

To explicitly create a **local** ocean-enabled release from the archived
inputs, run from `prototype/`:

```powershell
$env:WEATHER_GLOBAL_PRIVATE_DIR = (Resolve-Path backend\private).Path
$env:WEATHER_GLOBAL_CONFIG = (Resolve-Path backend\private\config.example.php).Path
php backend\private\bin\import.php --from-snapshot --force
```

This writes only to the `storage_directory` selected by the local private
configuration. Do not point that command at hosting storage. The new
`oceans` API field is optional, so the existing release remains accepted and
the Oceans view shows an explicit “not in this release” state until a
validated release with ocean data is selected.

The operator subsequently reported manually uploading phase 7A. This task did
not inspect or mutate hosting. For a separately approved
deployment, build and test locally, upload the contents of `dist/` to the
public path, and upload the lowercase updated private PHP source and
`backend/private/bin/import.php` to the already confirmed private path. Keep
the host's existing `config.php`, private `storage/`, release files and current
pointer intact; do not copy this machine's configuration or storage. The
raw ocean archives and `data_samples/` are not public assets and must not be
uploaded into the document root. This phase did not call a production API,
importer or CRON endpoint. Separately approve and schedule any production
import or pointer change; do not rely on or modify the existing hosting CRON
to publish these new sources without that approval.

## Phase 7B: published global sea-level scenarios

The optional `ocean_projections` API field contains **real published**
IPCC AR6/FACTS confidence output, version **20210809**, Zenodo record
<https://zenodo.org/records/6382554> (version DOI `10.5281/zenodo.6382554`).
The original archive is <https://zenodo.org/records/6382554/files/ar6.zip>.
Only the four global `total_*_medium_confidence_values.nc` members for
SSP1-2.6, SSP2-4.5, SSP3-7.0 and SSP5-8.5 are used. SSP1-1.9 and low-confidence
branches are intentionally outside this first scope.

- Global location ID **-1**, **mm**, original **1995–2014** reference.
  The baseline and likelihood language are explicitly documented in the
  archived NASA tool `data-react-props`, not inferred from NOAA observations.
- **2020–2150 at ten-year steps**, 14 points per scenario. No fabricated
  annual values, no value for 2126, and no medium-confidence extension to 2300.
- All **107 original float32 quantile coordinates and published values** are
  retained. The UI displays q50 and q17–q83. These are **p-boxes**, not one
  probability distribution: q50 is the mean of workflow medians; below q50
  the file uses the lower envelope of each quantile, above q50 the upper
  envelope. q17–q83 is the product's assessed **likely range** (IPCC likely:
  at least 66%), not model minimum–maximum or a guarantee.
- `medium_confidence` concerns the included processes, not the probability of
  the scenario. Low-confidence processes and their potentially higher outcomes
  are omitted, explicitly disclosed, and never pooled with the likely range.
- The source combines p-box 1e through 2100 and 1f afterwards. The chart
  deliberately leaves a gap between 2100 and 2110 rather than disguising that
  methodological boundary as a smooth physical trajectory.
- CC BY 4.0. The UI cites Fox-Kemper et al. (2021), Chapter 9,
  DOI `10.1017/9781009157896.011`; Kopp et al. (2023), FACTS,
  DOI `10.5194/gmd-16-7461-2023`; and Garner et al. (2021), dataset version
  20210809, with the required producer/funder/NASA acknowledgement.

Control values at 2100, in **mm**:

| Scenario | q17 | q50 | q83 |
|---|---:|---:|---:|
| SSP1-2.6 | 324 | 437 | 614 |
| SSP2-4.5 | 435 | 556 | 761 |
| SSP3-7.0 | 548 | 678 | 898 |
| SSP5-8.5 | 625 | 766 | 1018 |

This is neither local relative coastal sea level nor a flood map. The original
NOAA LSA history is **not joined or rebased** to these projections. Temperature
`projection_ensemble` and its 19-model min–max range remain a separate product.

### Reproduction and integrity

From the workspace root, with Python 3.10+ and local `netCDF4==1.7.4` available
(install `prototype\scripts\requirements-ar6.txt` only if that dependency is
missing):

```powershell
# Offline: verifies archived files, then regenerates the same compact artifact.
py -3.10 prototype\scripts\build_ar6_sealevel.py
```

The scientific originals, archive-member paths, exact HTTP byte ranges,
retrieval times, SHA-256, CRC32, license and scientific documentation are in
`data_samples\2026-11-04\ar6\manifest.json`. NASA tool HTML establishes the
baseline and likely-language definition; the original FACTS PDF establishes
the p-box convention, units, global ID and available years; the provider FAQ
documents the workflow change after 2100. These are archived, not live API
dependencies. `--extract` can re-fetch the selected original members using
strict bounded HTTP 206 ranges. It inspects/verifies the ZIP central directory
and member CRCs; it **does not download the 889,784,792-byte archive**, nor claim
to have recomputed its full published MD5. Do not refresh documentation or use
`--record-documents` without reviewing and repinning the resulting artifact.

The PHP-ready artifact is `backend\private\data\ar6_sealevel.json`:
**31,133 bytes**, SHA-256
`de236fb3c46a7f2ce1cb5ccff12b675b6a44e8c0beb840b92f1c5b84be2c55a2`.
`SourceRegistry::seaLevelArtifact()` pins it. Missing, changed or structurally
invalid data fail the import before publication. Atomic rollback tests include
missing/corrupted AR6 artifacts; visitor requests do no scientific processing.
Old releases without `ocean_projections` remain valid and show an explicit
unavailable state in `#ocean-future?lang=cs` / `?lang=en`.

### Local publication and manual deployment

The explicitly authorized **local-only** offline import selected release
`aae2fff060266a000fcbf8a0c5c7978fa6be604e5b432c6c988934ed7deefe0e`.
Its files are under `backend\private\storage\releases\<release>\`; the persisted
pointer is `backend\private\storage\current.json`, climate SHA-256
`4fe41f85fdead1f3e5c7edba766f8717d1cbe8e04f846b1ce1394c66a02f2ca7`.
It retains all previous climate/ocean payloads and adds the four real AR6
scenarios. The existing local server at
`http://127.0.0.1:4174/weather_global/#ocean-future?lang=cs` can use it
immediately. Browser/API caches may retain an earlier response for one hour;
use a cache-bypassing reload during verification.

For the operator's separately controlled FTP deployment, in this order:

1. Upload the **contents** of `prototype\dist\` to the existing public
   `/weather_global/`, including its lowercase `_astro` assets and PHP entry
   points. No raw archives, scripts or private configuration belong there.
2. Upload updated lowercase `backend\private\src\` and
   `backend\private\data\ar6_sealevel.json` to the existing private application
   directory. Keep the existing `ipcc_cmip6_ensemble.json` and ocean inputs;
   preserve hosting **config.php**, cron token/schedule, storage and all old
   releases. Do not upload this machine's config as the hosting configuration.
3. If publishing this validated local release manually, create only the new
   private `storage\releases\aae2fff060266a000fcbf8a0c5c7978fa6be604e5b432c6c988934ed7deefe0e\`
   and upload its `climate.json` and `manifest.json`. Raw `sources\` files
   are not required to serve the API; do not rename or overwrite older
   immutable releases. Verify both uploaded files against their SHA-256
   (manifest SHA-256 is the release ID).
4. **Only after every dependent file is present**, deliberately replace
   private `storage\current.json` with this release's pointer (upload under
   a temporary name then rename if the FTP client supports it). Keep the
   previous pointer for rollback. Uploading only frontend/src/data does
   **not** expose new 7B data while the pointer still selects an old release.
5. Cache-bypass the public API/browser once and verify `ocean_projections`.
   Do not trigger an importer/CRON URL to accomplish this update.

This task performed no production upload, pointer change or endpoint/CRON call.
Local tests use PHP 8.2; WEDOS PHP 8.5 and hosted operating limits remain
unverified. The existing build-size warning (>500 kB chunk) remains.

## Phase 6: reproducible IPCC Atlas ensemble

From the workspace root, Python 3.10 or later can download and process the
public inputs from the pinned IPCC-WG1/Atlas commit:

```powershell
py -3.10 prototype\scripts\build_ipcc_ensemble.py
```

The script verifies the Git blob SHA for each source against the pinned Git
tree, checks SHA-256, metadata, all 60 numeric columns, and month coverage, and
writes:

- `data_samples\2026-11-04\ipcc_atlas_cmip6_sources.zip`: all 145 source CSVs
  from the 29 model/member pairs found in the pinned tree.
- `data_samples\2026-11-04\ipcc_atlas_cmip6_manifest.json`: each source URL,
  commit-tree blob ID, SHA-256, byte count and row count.
- `prototype\backend\private\data\ipcc_cmip6_ensemble.json`: compact annual
  values used by the PHP importer; its SHA-256 is pinned in the source registry.

To reproduce the aggregation without network access, verify and process the
archived inputs:

```powershell
py -3.10 prototype\scripts\build_ipcc_ensemble.py --offline
```

The tree contains 29 filenames shared by historical and all four SSP
experiments, but complete monthly content validation leaves **19 model/member
pairs**. Ten are excluded from every period/scenario because at least one file
has missing months (all ten historical files miss 1901–1949, and
incomplete 2100 coverage in two SSP groups). The identical 19 models are used
for every annual median, minimum and maximum. The artifact records every
included member's actual 1850–1900 mean and every exclusion reason. This
selected subset is not a representative sample of all CMIP6 models.

Each included model is rebased against the arithmetic mean of its 612 monthly
`world` tas values in 1850–1900. Annual values are the arithmetic mean of 12
monthly values with equal month weights. The CSVs do not state the source
calendar, so the calculation neither invents calendar metadata nor applies
Gregorian day weighting. The across-model median and actual minimum/maximum
are descriptive model statistics, not percentiles or a probability interval.
The modelled historical period and four scenario experiments are separate from
the observational GISTEMP series; every 2015–2100 point is a simulation.
Retain the Atlas CC BY 4.0 attribution and CMIP6 terms of use in any public
release. Cite Iturbide et al. (2022), DOI `10.1038/s41597-022-01739-y`, and the
IPCC Atlas chapter (2023), DOI `10.1017/9781009157896.021`; include the WCRP,
WGCM/CMIP, modelling-group, ESGF and funding acknowledgements from the pinned
Atlas `LICENSE.md`.

The importer reads the compact artifact locally; hosting visitors and the
scheduled importer do not download the 145 raw files. A future release must
ship `prototype\backend\private\data\ipcc_cmip6_ensemble.json` together with
the updated lowercase PHP source. For a separately approved deployment,
upload the built public files and updated private PHP source/data while
preserving the hosting `config.php` and `storage/`. Do not invoke the
production cron or change its token/schedule as part of this phase. The
previous validated release remains available until an operator deliberately
publishes a new release. No production files or endpoints were accessed for
this implementation.

## Phase 7C.2c: offline CDS regional-temperature validation

The nine downloaded ECDE ZIPs remain separate from the native CMIP6
physical-Europe pilot and from public API releases. Run from the workspace
root using the already installed Python 3.10, netCDF4, NumPy and cdsapi:

```powershell
py -3.10 -B -m unittest discover -s prototype\scripts -p test_validate_cds_europe_annual.py
py -3.10 -B prototype\scripts\validate_cds_europe_annual.py
```

The validator does not initialize a CDS client or contact the network. It
checks download hashes/CRCs, reads every NetCDF member in memory, validates
model/member/scenario identity, units, height, annual calendars, territorial
IDs and missing values, and compares scenario-labelled years before 2006.
It writes `data_samples\2026-11-06\europe-cds-annual\validation\report.json`;
original ZIPs and the download manifest remain unchanged.

This archive contains 306 NetCDF members, 9,378 territorial series and
1,344,180 value positions. There are 25,800 missing positions in 180 wholly
missing series. The common nine-combination horizon is **1970–2098**, not
2100: both HadGEM2-ES combinations end in 2098. Kosovo and Bosnia IDs are
present in NUTS 0, but no separate combined layer was returned.
All nonempty series cover 1981–2010; this alone does not establish a valid
rebasing policy. Pre-2006 RCP values differ by up to 0.917119 K.

The report status is `review-required-not-publishable`. Before calculating
anomalies or releasing these data, establish annual/spatial aggregation
semantics (NetCDF states `cell_methods: time: point`), historical provenance,
license/redistribution conditions, missing-territory exclusions and the
comparison horizon. These are bias-adjusted SIS Energy/EURO-CORDEX RCP
regional aggregates, not native CMIP6 SSP physical-continent data or ERA5
observations. Do not average NUTS means into a continental mean or combine
these samples with the existing CMIP6 ensemble. No API, release pointer,
production deployment or CRON change is part of this validation.

### Phase 7C.2d: subsequent methodology review

`validation\methodology_review.json` supplements the content inventory; it
does not rewrite `report.json` or authorize publication. Public CDS catalogue
records and the linked licence confirm **CC BY 4.0** for ECDE and SIS Energy.
Public output must include attribution, source/version/licence links and
notice of modifications without suggesting endorsement.

The ECDE v2.0 Product User Guide identifies NUTS 2024, reference 1991–2020
and earthkit regional aggregation. The upstream Air Temperature Fact Sheet
documents CDFt bias adjustment; neither statement proves the exact ECDE
weight settings or the cause of the observed pre-2006 scenario differences.

The operator approved nine combinations on 1970–2098, a future **1991–2020**
reference and explicit exclusion of the 180 wholly missing series without
interpolation. All 9,198 nonempty series have 30 reference-year values.
Keep each combination/RCP separate. The nine combinations share GCMs/RCMs;
they are not nine independent GCMs or an assessed probability sample.

Before producing anomalies or public UI, obtain product-specific annual
weighting and spatial-mask settings and clarify historical provenance.
No anomaly calculation, API release or provider contact occurred in 7C.2d.

### Phase 7C.2e: local EU27 technical preview

The support inquiry has been sent by the operator; producer clarification
is pending. The methodology review remains unresolved. The separate
`build_cds_eu27_preview.py` flow revalidates all archives, selects the EU27
layer and years **2006–2098**, and converts K to Celsius by subtracting
273.15. It performs no rebasing, interpolation, additional averaging or
ensemble statistics. EU27 is not the physical continent Europe.

```powershell
py -3.10 -B prototype\scripts\build_cds_eu27_preview.py
py -3.10 -B -m unittest discover -s prototype\scripts -p test_build_cds_eu27_preview.py
Set-Location prototype
npm run dev
```

Open `http://127.0.0.1:4174/weather_global/#europe-pilot?lang=cs` (or
`lang=en`). Nine GCM/RCM/member selections and both RCPs have 93 original
annual values each, shown in a chart and paginated accessible table.
The screen identifies the unresolved methodology and provides attribution,
version, input-manifest hash and selected NetCDF hash.

The versioned artifact is stored only under
`data_samples\2026-11-06\europe-cds-annual\validation\eu27_preview.json`.
Astro's development middleware serves it only to loopback clients with a
local Host header, GET only, no caching, and an exact SHA-256 pin:
`0aee1c1d7617657451ea624be7206b73d43878d0ea43aa630bdeac278a76132f`.
Missing or changed artifacts return HTTP 503 with an explicit UI error.
Regenerating the same input is deterministic; later producer-approved
changes require a new artifact version, reviewed validation and checksum
update, not silently replacing this preview.

The navigation and fetch are development-only; neither artifact nor
middleware is shipped by `npm run build`. There is no public-release
approval, current-release pointer, production backend, FTP or CRON change.
Bosnia's BA data exists in NUTS0; the absent combined Kosovo/Bosnia layer
is not attributed to war or filled with derived values.

### Phase 7C.3a: catalogue-only multi-model inventory

`prototype\scripts\inventory_cmip6_europe.py` queries public ESGF File
metadata only. It does not download climate fields, modify pilot outputs
or approve an ensemble. Reproduce from the repository root:

```powershell
py -3.10 -B prototype\scripts\inventory_cmip6_europe.py
py -3.10 -B -m unittest discover -s prototype\scripts -p test_inventory_cmip6_europe.py
```

Evidence is archived under
`data_samples\2026-11-06\europe-cmip6-inventory\inventory.json` alongside
35 raw catalogue responses, query URLs and SHA-256 hashes. The 6 November
inventory transferred 689,551 bytes of catalogue metadata. Duplicate
filenames are deduplicated only when sizes and checksums agree; filename
intervals must cover 1850–2014 historical and 2015–2100 in each SSP without
gaps or overlaps. Entire intersecting files count toward the estimate,
including any extension beyond 2100; catalogue coverage is not verified
NetCDF coverage.

| Provisional source/member | Grid | Catalogue bytes including static fields | Additional bytes |
|---|---|---:|---:|
| ACCESS-CM2/r1i1p1f1 | gn | 456,849,826 | 0 |
| CanESM5/r1i1p1f1 | gn | 161,726,477 | 161,726,477 |
| IPSL-CM6A-LR/r1i1p1f1 | gr | 293,398,105 | 293,398,105 |
| MPI-ESM1-2-LR/r1i1p1f1 | gn | 204,535,663 | 204,535,663 |
| MRI-ESM2-0/r1i1p1f1 | gn | 693,774,628 | 693,774,628 |

All five have catalogue-complete tas intervals for all five experiments
and one deduplicated historical areacella/sftlf file each. Existing ACCESS
files match all catalogue sizes and SHA-256 hashes and can be reused.
Total catalogue size is **1,810,284,699 bytes**; additional estimated
transfer is **1,353,434,873 bytes** (about 1.35 GB / 1.26 GiB). This is
neither download authorization nor a workspace/memory estimate.

The shortlist is provisional, not an exhaustive availability survey.
IPSL gn queries returned no records; gr records are retained as a
conditional candidate, not asserted to be native or compatible. Before
including any model, validate actual coordinates/bounds, source calendar,
units, parent/member continuity, licences, monthly coverage and mask
weights. A common r1 label alone does not establish historical continuity.
One member per model avoids weighting a model by its realization count,
but does not make model families statistically independent.

Next gate: operator approval of models, byte budget, baseline and
statistics before bounded retrieval. The proposed baseline is
**1981–2010**, consistent with the native Europe pilot, not the separate
CDS 1991–2020 policy. Suggested median/P10–P90 would describe model spread,
not confidence or forecast probabilities; five models yield a limited
sample and require an explicit quantile convention. No ensemble values
were calculated and the CDS methodology block remains unchanged.

### Phase 7C.3b: approved two-model inputs and content validation

The operator approved **ACCESS-CM2 and CanESM5 only**, with a 1.40 GB
decimal new-saved-file limit. IPSL, MPI and MRI remain excluded from this
phase. Seven existing ACCESS files were reused after catalogue size and
SHA-256 verification; seven CanESM5 files were downloaded over HTTPS from
the Canadian provider. **161,726,477 bytes** of new climate files were saved.
Failed/retried transfers could increase network traffic; none were needed
in the initial successful run. No ensemble or anomalies were calculated.

Reproduce from repository root with the existing Python 3.10 environment:

```powershell
py -3.10 -B prototype\scripts\fetch_cmip6_europe_pair.py
py -3.10 -B prototype\scripts\validate_cmip6_europe_pair.py
py -3.10 -B -m unittest discover -s prototype\scripts -p test_cmip6_europe_pair.py
```

The fetcher takes only these two models from the archived inventory,
enforces exact experiment/member/grid identities and checksums, streams
with exact per-file byte bounds, saves atomically and records source URLs
and failures. Existing changed files fail verification rather than being
silently replaced. The manifest pins the inventory hash. Re-running verifies
existing files and retains previous download-attempt provenance.

Evidence and new CanESM5 inputs reside in
`data_samples\2026-11-06\europe-cmip6-pair\`:
`manifest.json` records all 14 files and their paths/hashes;
`validation.json` records the independent offline content check.

| Model | Grid shape | Calendar | Historical months | Months per SSP |
|---|---|---|---:|---:|
| ACCESS-CM2/r1i1p1f1 | 144 × 192 | proleptic_gregorian | 1,980 | 1,032 |
| CanESM5/r1i1p1f1 | 64 × 128 | 365_day | 1,980 | 1,032 |

Actual monthly time bounds agree with full calendar months, historical
1850–2014 and SSP 2015–2100. Parent source/member/experiment and branch
times link every SSP to the corresponding historical run. tas is K with
`time: mean`; all static coordinates and bounds match tas for each model.
Static areas/land fractions and all monthly values pass sanity checks.
Coverage is 100% of each model's positive Europe weights in every month,
not proof that every geographic land fragment is represented.

The existing Europe mask is read without rewriting it. Weighted area
differs from geometric area by **+0.88% ACCESS / −3.30% CanESM5**; zero
model-land cells also omit some geometric land. These are explicit
resolution/coast-mask diagnostics, not a reason to double-apply land
fractions or force both grids to have identical area.

All seven files per model declare the same **CC BY-SA 4.0** licence,
recorded verbatim with provider information. This is not the CDS
CC BY 4.0 licence; retain attribution and ShareAlike obligations for any
future redistributed/adapted output.

Status: `content-validated-awaiting-statistics-policy`. Next obtain
approval of the baseline and output statistics before calculating
model-specific annual anomalies. Keep the two source calendars distinct.
With just two models, label the result as a technical two-model comparison;
do not present interpolated P10–P90 as assessed uncertainty. Existing
production releases, UI/API, CDS methodology status, FTP and CRON remain
unchanged.

### Phase 7C.3c: approved local two-model annual anomalies

The operator approved **1981–2010** and **individual models plus descriptive
minimum–maximum**, without probability interpretation. The offline builder
revalidates the 14 source files and reuses the existing mask/weighting and
annualization helpers without rewriting the native pilot or its mask.

```powershell
# Run from repository root.
py -3.10 -B prototype\scripts\build_cmip6_europe_pair.py
py -3.10 -B -m unittest discover -s prototype\scripts -p "test_*cmip6*.py"
```

Output:
`data_samples\2026-11-06\europe-cmip6-pair\europe_pair_anomalies_v1.json`.
Schema/version: `1` / `7c3c-europe-pair-anomalies-v1`.
It contains two model histories (1850–2014), four SSP series per model
(2015–2100), and date-aligned descriptive min/max for each experiment.
There are **1,018 individual annual values and 509 min/max pairs**.
Historical values are model simulations, not observations.

Each model uses its own historical European land-weighted monthly
temperatures to calculate one day-weighted reference mean. Subtract this
fixed reference from monthly values and then annualize using each source
calendar's actual month durations. All 12 months and valid coverage are
mandatory; invalid annual values stop artifact creation rather than
silently reducing the number of models. Kelvin differences have the same
numerical magnitude as Celsius differences: output is **degrees Celsius
anomaly**, not absolute temperature.

| Model | Historical reference mean (K) | Reference days |
|---|---:|---:|
| ACCESS-CM2 | 276.46048659139996 | 10,957 |
| CanESM5 | 279.18328482956565 | 10,950 |

Reference anomalies have zero **day-weighted** mean; an unweighted mean of
annual anomalies need not be exactly zero for the Gregorian calendar.
Models are aligned by calendar-year labels, not by resampling daily axes.
No percentiles, median, ensemble mean or probability distribution are
calculated. Min/max is computed only after independent model rebasing;
it is neither a confidence interval nor a bound on future outcomes.

The artifact retains source filenames/versions/checksums, model calendars,
coast-weight diagnostics, full licence statements, mask/land hashes,
manifest/validation hashes and implementation hashes. Attribution and
**CC BY-SA 4.0** apply to this adapted CMIP6 output; do not substitute the
separate CDS licence or imply producer endorsement.

Validation: 15 CMIP6 regression tests passed, including an independent
NumPy time reduction of all 1,018 annual values (agreement to 10 decimal
places), exact min/max checks, calendar and missing-data cases, exact
ACCESS comparison against the original pilot, and a deterministic rebuild
with identical SHA-256:
`87de6b506cc6874e1ae2b4268e44ccf8a3385c778b880c856f975f037f382916`.

This is a local technical **two-model comparison**, not an assessed
multi-model uncertainty product. No frontend/API integration, current
release update or production deployment is part of 7C.3c. The earlier
7C.3b validation report remains an input-content report; its
`anomalies_calculated: false` describes that earlier stage, not this new
separate artifact. The next step is a separately labelled local
CMIP6 comparison interface, kept distinct from the CDS EU27/RCP preview.

### Phase 7C.3d: local CMIP6 comparison interface

Open `http://127.0.0.1:4174/weather_global/#europe-cmip6?lang=cs`
(or `lang=en`) while `npm run dev` is running. The separate navigation
item **Europe CMIP6** shows ACCESS-CM2 and CanESM5, historical or one of four
SSPs, a switchable descriptive min/max band and a paginated table with
both model values and min/max. Values are anomalies relative to each
model's own 1981–2010 reference, not the CDS EU27 absolute temperatures.
Model calendars, licence statements, source hashes and geographic limits
are shown alongside the chart.

The shared development-only middleware now serves both fixed preview
paths. It checks loopback address, local Host, GET-only access and exact
file SHA-256; missing/changed files fail explicitly with HTTP 503.
The CMIP6 frontend additionally verifies both complete model series and
every exact min/max pair. Loading, error/retry and stale-navigation guards
are independent of the CDS view. No static payload is copied to public
assets; build dead-code elimination excludes the local fetch and screen.

During integration the previous checksum correctly rejected a subsequently
reformatted artifact. The operator approved regeneration/provenance
normalization. A Unicode inspection confirmed the source mask currently
contains the correct U+2013 dash; the apparent replacement glyph was not
repaired blindly. The mask writer now specifies UTF-8 explicitly.
Geometry and all 1,018 numeric values remain unchanged; the original
ACCESS numeric regression still passes. The regenerated artifact's pin is:
`ef75363408e5ad65cd14e20cf94be156ab139fc384f121415a489460f7cfb5f9`.
Earlier checksum evidence above describes the earlier serialized file.

Two new portable JavaScript contract tests cover complete input and
rejection of invalid identity, calendar, baseline, missing values and
corrupt ranges. Browser checks cover five experiment selections, displayed
table values, pagination through 2100, band toggle, CS/EN, error/retry and
navigation away during delayed fetch. Some integrated-browser pointer
actions timed out on the shared non-visible tab; DOM-activated controls
verified handlers, so normal physical pointer/touch interaction remains
an operator check. Production API, current release, FTP and CRON were not
changed.

### Phase 7C.4a/b: historical NASA audit and source decision

The operator approved auditing existing inputs and, if acceptable,
proceeding directly to source selection. No new climate data were needed.
Run from the repository root:

```powershell
py -3.10 -B prototype\scripts\audit_europe_history.py
py -3.10 -B -m unittest discover -s prototype\scripts -p test_audit_europe_history.py
```

The reproducible audit is saved to
`data_samples\2026-11-06\europe-history-audit\audit.json`. It verifies the
archived gzip against retrieval size/SHA-256 and compares its decompressed
bytes with the existing NetCDF. It checks land-air/250km/no-ocean product
identity, original 1951–1980 reference, Kelvin anomaly units, scale/fill
handling, full monthly CF bounds, source-calendar continuity and the
regular 2-degree grid. Spatial bounds are inferred from verified centres;
the source supplies no lat/lon cell bounds. The mask hash matches the
current CMIP6 pair; the mask and original pilot are not rewritten.

| Audit finding | Archived result |
|---|---|
| Source months | January 1880–September 2026; 1,761 months |
| Whole valid years under existing 90% rule | **1894–2025**, 132 years |
| Years failing area coverage | **1880–1893** |
| Partial final year | **2026**, only January–September; no annual value |
| Months below coverage threshold | 164 |
| Minimum reference-month coverage, 1981–2010 | **95.6528%** |
| Area represented in every reference month | **94.9033%** |
| Reference months/days | 360 / 10,957 |
| Regional reference shift from source anomalies | 0.8187289088337909 K |

This is an observation-derived gridded GISTEMP analysis with producer
250km smoothing, not raw station measurements or reanalysis. The project
does no extra gap interpolation, but must not claim the producer used
none. Coverage denotes available grid area, not station density or
observational uncertainty. The existing 90% rule is a project pilot
criterion, not a NASA/WMO completeness standard.

The scalar regional day-weighted rebase reproduces the original pilot
exactly and yields a day-weighted reference residual below 1e-10 degrees.
Independent NumPy spatial and annual reductions agree within 1e-12.
Spatial support still varies by month: this is not a fixed-cell or
cellwise-climatology rebase, and does not make NASA and CMIP6 sampling
operators identical. No regional observational uncertainty interval is
available from this calculation.

**7C.4b decision:** retain NASA for the local observation-derived European
history, explicitly preserving the invalid years and partial last year.
Do not fetch ERA5 now. ERA5 could later provide a separate reanalysis
comparison, not repair gaps or extend the observation curve seamlessly.
This decision does not authorize public release. The archived
`nasa-use.html` is a GISS software page, not product-specific licence
evidence; verify appropriate official usage/citation terms before
publication and retain NASA/GISTEMP acknowledgement without endorsement.

Five tests cover temporal-bound corruption, duplicate months, weighted
coverage thresholds, incomplete years, invalid monthly coverage and the
full offline audit/source decision. The next phase, 7C.4c, can create a
separate versioned historical artifact with valid/invalid status and
coverage; do not silently reuse the local CMIP6 min/max as observational
uncertainty. No UI, API, production release, FTP, CRON or CDS methodology
status was changed.

### Phase 7C.4c: versioned local historical artifact

The standalone NASA history is now stored at
`data_samples\2026-11-06\europe-history\europe_history_v1.json`.
Schema/version: `1` / `7c4c-europe-nasa-history-v1`. Reproduce from the
repository root:

```powershell
py -3.10 -B prototype\scripts\build_europe_history.py
py -3.10 -B -m unittest discover -s prototype\scripts -p "test_*europe_history.py"
```

The builder runs the full source audit and requires exact agreement with
the archived 7C.4a/b report and the local NASA source-selection decision.
A changed audit blocks generation for review instead of silently adopting
new source semantics. Annual values are taken from the pilot only after
the fresh audit independently verifies every value against the archived
NetCDF. The pilot, source data, audit and mask are not rewritten.
Output is atomic, deterministic UTF-8 JSON with non-finite numbers rejected.

The artifact contains **147 annual positions, 1880–2026**:

- **132 valid values, 1894–2025**, matching the original pilot exactly.
- **1880–1893:** `value: null`, `status: missing`,
  `missing_reasons: ["insufficient-spatial-coverage"]`.
- **2026:** `value: null`, `status: missing`,
  `missing_reasons: ["incomplete-source-year"]`, absent months 10–12.

Each annual record carries source-month count, absent months,
below-threshold months and minimum monthly coverage. That minimum is over
the months actually present, not proof of a complete year: consult status
and absent-month fields as well. If a year has both inadequate coverage
and absent months, both reasons are retained. The artifact includes all
1,761 monthly coverage records, the 90% project threshold, full baseline
diagnostics, geography/grid metadata and limitations. Missing values are
never interpolated, filled from models or replaced by partial-year means.

Units are **degrees Celsius anomaly**, rebased from the source
1951–1980 anomalies to a day-weighted regional **1981–2010** reference.
Kelvin anomaly differences have the same magnitude as Celsius differences;
**do not subtract 273.15** from these source anomalies. This is separate
from the CDS absolute-temperature conversion.

Provenance includes source archive/expanded NetCDF hashes, retrieval
record, mask hash, audit/pilot hashes, archived documentation hashes and
implementation hashes. Usage remains explicitly pending official
product-use/citation verification before public release; neither the
CMIP6 nor CDS licence is inherited. No observational uncertainty band is
fabricated. The artifact is labelled
`local-observation-derived-history-not-public-release`.

Validation: **11 audit/artifact tests passed**. They cover complete and
partial years, weighted coverage, conflicting validity diagnostics,
non-finite rejection, source-time corruption, exact pilot values, all
missing-year reasons, stale-audit rejection and deterministic byte-for-byte
reproduction. Artifact size is 146,015 bytes; SHA-256:
`4dc42d0c22d8f3af34a0d87561cf1b9fb345f0eda515b5e45ff20a9093305af4`.

The next step is **7C.4d**, a separate local historical display beside
(not joined into) the CMIP6 simulations. This stage added no endpoint or
UI and made no production/API, FTP, CRON or CDS methodology changes.

### Phase 7C.4d: local NASA historical interface

With `npm run dev`, open
`http://127.0.0.1:4174/weather_global/#europe-history?lang=cs`
(or `lang=en`). The development-only **Europe NASA** navigation item
displays the observation-derived analysis separately from CMIP6 and CDS.
The CMIP6 method section links to this historical view; curves are never
spliced together.

The anomaly chart retains all 147 annual positions with 15 nulls and
`connectNulls: false`. A second chart displays minimum coverage of months
actually present and the 90% pilot threshold. The paginated table gives
anomaly, coverage, validity/reason, source-month count, absent months and
below-threshold months. In particular 2026 remains missing despite its
above-threshold coverage: it has only nine source months.

The frontend validates every annual record against all monthly coverage
records, including exact years, null/reason consistency and the source
reference. It shows producer smoothing, time-varying spatial support,
pending NASA usage/citation review and source/mask/audit hashes. No
observational uncertainty band or inherited CDS/CMIP6 licence is shown.

The shared loopback/GET-only/no-store development middleware serves
`history-preview.json` only with the exact source-file checksum. The
operator's attached history JSON has been pretty-printed since 7C.4c;
its parsed contents match a fresh audited build exactly. Formatting was
preserved, and the current file pin is:
`6798265e06d8e140452ed63bf9a5fdbe414aa039c3ffc7f9eb46f23926cfac70`.
Its canonical serialization still hashes to the original 7C.4c
`4dc42d0c22d8f3af34a0d87561cf1b9fb345f0eda515b5e45ff20a9093305af4`.
The Python regression now compares semantic content and deterministic
canonical bytes rather than rejecting harmless indentation changes.
Any semantic difference still fails the fresh-source audit.

Two new portable JS contract tests passed; the full application suite
passed (36 JS tests plus PHP tests), as did the 11 Python history tests.
The production build contains no NASA preview payload, endpoint or pin.
Local GET returns 200, POST 405 and nonlocal Host 403. Browser checks
confirmed both charts, CS/EN, early-year gap reasons and final-year
pagination/absent months. The shared non-visible tab again required DOM
activation when normal pointer actions timed out; physical clicking
remains an operator check.

This is not a public release or a change to the production API, FTP,
CRON or existing climate release. NASA usage/citation review and the
separate CDS methodology questions remain open.

Final browser verification compared all 147 table rows with the artifact,
and tested simulated HTTP 503/retry plus navigation away during a delayed
load. All passed. Persistent detached dev-server starts terminated in this
session; the bounded attached validation server was stopped after testing.
Start `npm run dev` in your own terminal to keep the preview available.

### Phase 7C.5: local European catalogue and versioned API

The approved scope is local development only, not public publication.
Restart an already running `npm run dev` after this configuration change,
then open `http://127.0.0.1:4174/weather_global/#europe?lang=cs`
(or `lang=en`). The overview links to three separate existing views and
explains geography, units, periods, scenario families, interpretation,
licences and publication gates. It does not merge curves, recalculate
values or modify any source artifact.

Development API, relative to `/weather_global/`:

| Endpoint | Response |
|---|---|
| `europe-api/v1/catalog.json` | Schema/API version, reviewed product identities, byte hashes, view routes, endpoints, bilingual descriptions and publication gates |
| `europe-api/v1/cmip6.json` | Unchanged versioned two-model custom-Europe artifact |
| `europe-api/v1/history.json` | Unchanged NASA history artifact, including all gaps and monthly coverage |
| `europe-api/v1/cds.json` | Unchanged nine-member EU27 absolute-temperature artifact |

Use the explicit `.json` URLs: the site's Astro `trailingSlash: always`
handling rejects extensionless paths before they reach Vite middleware.
There is no general file-serving endpoint or arbitrary dataset/path query.
The three older `*-preview.json` paths remain compatibility aliases to the
same checks and bytes. The existing PHP `api.php?dataset=climate` remains
unchanged.

All four endpoints allow GET/HEAD only (405 otherwise), require a loopback
connection and loopback Host (403 otherwise), reject query parameters (400)
and use `Cache-Control: no-store` plus `X-Content-Type-Options: nosniff`.
Unknown product/version paths ending in `.json` return 404. Each product
request verifies the pinned SHA-256 and its existing scientific contract
before returning any artifact bytes. Missing, changed or invalid files
produce a logged error and HTTP 503; no data are substituted. HEAD applies
the same validation without a response body.

The catalogue is a reviewed contract, not a live availability report:
individual product endpoints determine actual file availability.
`publication_allowed` is false globally and for every product. CMIP6
still requires public-release/attribution/CC BY-SA review; NASA requires
official product-use/citation verification and release review; CDS
requires producer-methodology clarification and release/attribution
review. A null NASA licence means unverified, not unrestricted use.
No licences are inherited between products.

Three portable tests in `tests/europe-api.test.mjs` cover catalogue/gate
integrity, byte-plus-scientific-contract validation and real HTTP
method/Host/allowlist/error behavior without needing local climate files.
The full suite passed: 39 JS tests plus PHP tests; production build passed
with only the existing large-chunk warning. Live development probes
returned 200 for all four endpoints, all three aliases and the unchanged
climate API. Browser checks exercised the CS/EN overview, both NASA charts,
all five CMIP6 experiment choices and all nine CDS member/two-scenario
selections through the new API. Simulated catalogue HTTP 503/retry and
navigation away during a delayed catalogue response also passed.

No European payload, API middleware, catalogue or product hash is shipped
in the production output. Production API, release pointers, FTP and CRON
are unchanged. This completes the approved **local** 7C.5 scope, not the
still-blocked public-release portion of the original roadmap.

### Educational chart descriptions and glossary

Every main chart now has a static CS/EN **Chart description**, explicit
linked product source, **What the chart cannot tell you**, and a separate
**Glossary** section before the existing method/source material. Small
overview sparklines retain their links to the fully described detail.
Comparison charts reuse the corresponding indicator's explanation.

`src/chart-education.js` holds product-specific content for CO2, global
GISTEMP, RONI, HadSST4, OHC, satellite sea level, global modelled history
and projections, the older demonstration, European NASA history and
coverage, the European CMIP6 pair and CDS EU27, and AR6 sea-level
projections. It distinguishes units, geography, references, cadence,
observations versus simulations, and the meaning of gaps and bands.

Projection descriptions explain each available RCP/SSP scenario,
radiative forcing, scenario inputs, model response and internal
variability. Scientific references link to van Vuuren et al. (2011)
and IPCC AR6 scenario documentation. No scenario probabilities are
assigned, equal-number RCP/SSP pathways are not equated, and general
scenario explanations do not resolve CDS's outstanding methodology.

The approved scope is static educational text only: no automatic
selection narrative, extrema, trends, new averages or data changes.
The text describes selectors without claiming a particular curve is
currently selected. Zoom is explicitly distinguished from table/period
selection. Existing chart controls, source artefacts, publication gates
and production deployment are unchanged.

Validation: 41 JS tests plus the PHP suite and production build passed.
Two new portable content tests cover all 14 guide types in both
languages, scenario membership, reference periods and distinct
uncertainty interpretations. Browser checks passed on 12 current views
in both languages (24 view/language combinations), including descriptions,
separate glossaries and unchanged chart rendering. The legacy fallback
description is covered by the portable tests, not by the current-release
browser traversal.

## Phase 7C.6c: offline continental geographic drafts

This phase adds no backend endpoint, climate calculation or public release.
Run the Python scripts from the repository root with the existing geographic
dependencies (`shapely`, `pyproj`, `pyshp`):

```powershell
python -B prototype\scripts\fetch_continent_geography.py
python -B prototype\scripts\build_continent_masks.py
python -B -m unittest discover -s prototype\scripts -p test_build_continent_masks.py
python -B -m unittest discover -s prototype\scripts -p test_continent_mask_artifacts.py
```

The fetcher downloads only bounded public geographic inputs/documentation;
existing downloads must match their provenance. The builder requires pinned
archives from the existing European pilot and Natural Earth land/admin0
5.1.1, lakes 5.0.0 and ice shelves 4.1.0. No climate download is involved.
Three inspected source self-intersections have explicit repair evidence;
unexpected invalid inputs fail.

Open [the offline atlas](../../data_samples/2026-11-06/continent-masks/atlas.html).
Its directory contains seven full-resolution drafts, separate unresolved and
excluded geometry, a complete 6,836-component registry, source/rule/runtime
provenance in `report.json`, and an output SHA256 manifest. Display
simplification never changes the GeoJSONs. Antarctic preview uses EPSG:3031;
the other map previews are not equal-area comparisons.

The user approved a separate **Europe v2 mapped-lake candidate**, after the
audit found that frozen v1 includes mapped inland water. It removes about
135,018.28 square kilometres of mapped lakes, not necessarily every inland
water body. Original Europe v1 and existing CDS/CMIP6/NASA climate artefacts
are immutable and checked by hash. They cannot be relabelled as v2 results;
no recomputation is approved or performed here.

Every component has an explicit rule or remains unresolved, never assigned
by nearest continent. Whole-island anchors implement approved conventions
without changing physical shorelines. Generic attribution requires complete
same-geographic-group local coverage within a recorded numerical tolerance.
Socotra awaits a geographic decision. Islands outside frozen Europe and
physical/admin coastline discrepancies remain visible for review.

Draft accounting includes the unresolved geometry. Closure, pairwise
overlaps and overlap with exclusions use a conservative WGS84 surface-area
upper bound with a declared 10 m2 tolerance. This avoids artificial
geodesic-chord areas on near-collinear GEOS roundoff slivers; nonzero
sub-m2 bounds remain reported, not rounded to exact zero. Regional area
totals use WGS84 geodesic rings.

Antarctic shelf inputs are historical generalized cartography based on
2003-2004 MOA, not an independently verified grounding line. Antarctica
remains provisional. All outputs block publication and climate weights.
Phase 7C.6d geographic, polar/dateline and model-coast/weight certification
is still required; none of these drafts changes the development climate API,
production releases, hosting, FTP or CRON.

Verification: 17/17 targeted Python tests pass (exit 0); Pylance reports
no syntax errors. Browser checks rendered all seven offline maps, with
no external resources or invalid SVG coordinates. The final draft assigns
5,479 source components and explicitly retains 1,357 unresolved components
(about 20,461.86 square kilometres). Accounting difference upper bound is
0.4673 m2, pairwise area overlap is zero, and exclusion-overlap upper bound
is 0.1317 m2. These are preliminary checks, not phase 7C.6d sign-off.

## Phase 7C.6d: reviewed geography and conditional validation

The separate [review atlas](../../data_samples/2026-11-06/continent-masks-7c6d/atlas.html)
and [validation report](../../data_samples/2026-11-06/continent-masks-7c6d/validation.json)
preserve the previous 7C.6c set. All 1,357 former residual components have
explicit source-ID/hash decisions: 6,835 physical components are assigned,
the documented fictional Null Island is excluded, none remains unresolved.
Local source-map association is restricted to enumerated geographic groups
and bounding guards; there is no unrestricted nearest-continent fallback.
Natural Earth documentation and its original page-map thumbnails are
archived with URLs and hashes under `sources`.

Socotra is explicitly grouped with the African Horn, Bouvet with the African
South Atlantic region, and Clipperton with North America. Source political
labels remain as evidence, not continental rules. Tiran/Sanafir are Asian.
`corrections.json` records corrections to pre-existing assignments, including
the Africa helper boundary which had accidentally captured western Anatolia
and part of Sinai. Corrected Mediterranean/Red-Sea marine joins do not cross
connected mainland outside the documented Suez corridor.

**Critical legacy finding:** Europe v1's 34N southern helper boundary also
included northern Morocco, Algeria and Tunisia. The user explicitly approved
a new v3 correction, while preserving v1/v2 bytes and old numbers. V3 retains
the eastern convention, removes mapped lakes and wrongly included African
land, and adds reviewed Aegean islands. About 395,235 square kilometres of
former v2 geometry are transferred to Africa using the consistent WGS84
surface integral. Long lon/lat-linear edges must not be measured as different
geodesic chords; both area interpretations are exposed in validation.

**Existing custom-Europe NASA/CMIP6 results have invalid geography pending
separately approved recomputation.** They are retained for audit, not certified
or relabelled as v3. Bilingual alerts appear above both graphs and in the local
catalogue, with an explicit recomputation publication gate. Producer CDS EU27
does not use this custom mask and is unaffected by this particular defect.
Its existing methodology gate is unchanged. An already-running development
server must be restarted to refresh middleware's imported catalogue; an old
catalogue is intentionally rejected by the newly built client rather than
silently treated as current.

```powershell
python -B prototype\scripts\fetch_continent_review_sources.py
python -B prototype\scripts\build_reviewed_continent_masks.py
python -B prototype\scripts\validate_reviewed_continent_masks.py
python -B -m unittest discover -s prototype\scripts -p test_reviewed_continent_masks.py
```

Validation checks every source component and all pairwise overlaps, eligible
land reconstruction, exclusions, known geographic samples and genuinely
marine joins. WGS84 integration follows the actual GEOS lon/lat-linear
boundaries; polar area is independently checked in Antarctic-centred LAEA.
Both existing ACCESS-CM2 and CanESM5 native grids are audited pole to pole,
splitting dateline cells. Diagnostics use `areacella * (sftlf/100)` exactly
once and conditional continental allocation; they expose model land without
eligible geographic land, zero-model-land geometry and coastal differences.
No new climate data are downloaded, no `tas` is read, and no weight product
or recomputed temperature series is released.

The verdict remains **conditional**: archived generalized 2003-2004 MOA ice
shelves are not an independently verified Antarctic grounding line. Source
lakes/coasts are incomplete and partly historical; subcell model coastline
differences remain. `publication_allowed` and `climate_weights_allowed` stay
false. Existing climate files, production API, release pointers, FTP and CRON
are unchanged.

Final evidence: all 21 continental pairs have zero area overlap; the
conservative eligible-land reconstruction remainder is 0.46721 m2 and
excluded-area overlap 0.13161 m2 (explicit 10 m2 tolerance). Antarctic
LAEA relative error is 1.42276e-7 against a 1e-5 limit. Unallocated native
model land is approximately 871,009 km2 for ACCESS-CM2 and 397,245 km2 for
CanESM5; allocation plus this exposed remainder conserves model land.
The 29 targeted Python regressions, four local API tests and frontend
build pass. Browser verification covers 16 offline maps, three local
source thumbnails and all eight CS/EN European-route combinations,
including unchanged chart rendering and no custom-mask warning on CDS.
The temporary test server was stopped; the existing user-owned 4174
server was not replaced.

## Completing 7C: corrected Europe and continental products

The user approved the remaining local 7C stages on 6 November 2026.
New products are separate from all archived European artifacts:

- `data_samples/2026-11-06/continents-7c-completion/`
- `prototype/scripts/continental_weights.py`: pinned global grid intersections,
  cached only after all continental areas match the independent 7C.6d audit.
- `prototype/scripts/build_continental_temperatures.py`: two native CMIP6
  models for six non-Antarctic continents, plus separately qualified NASA
  histories. Neither model calendars nor source grids are replaced.
- `prototype/scripts/validate_continental_temperatures.py`: independently
  re-reads raw cells with scalar masked reductions and calendar-day annual
  weighting; verifies every reference month and selected early/late years
  of every experiment. Missing official-source evidence blocks finalization.

From the repository root, using the existing Python environment:

```powershell
python -B prototype\scripts\continental_weights.py
python -B prototype\scripts\build_continental_temperatures.py
python -B prototype\scripts\validate_continental_temperatures.py
python -B -m unittest discover -s prototype\scripts -p test_continental_temperatures.py
python -B -m unittest discover -s prototype\scripts -p test_continental_artifacts.py
```

The corrected Europe mask is
`europe-kuma-manych-cyprus-v3-geography-corrected`. Both its geometry and the
area-integration method are explicit in the new provenance. Relative to the
legacy calculation, the absolute 1981-2010 model baseline changes by
-0.458232 K (ACCESS-CM2) and -0.433374 K (CanESM5); changes in annual
anomalies are much smaller, at most about 0.086 degrees C. The same 250km
NASA source changes by at most 0.055586 degrees C. The artifact includes
common-year diagnostics rather than pretending old values were v3.

The `#continents` view has CS/EN region/product/model/experiment selectors,
aligned multi-region comparisons, paginated accessible tables, explicit
NASA coverage/gap reasons, source-based chart descriptions, methodology and
a separate glossary. NASA and CMIP6 are never spliced. Two-model min/max is
descriptive spread, not assessed probability. Legacy European pages retain
their geographic warnings and link directly to the new corrected view.

Local `GET`/`HEAD` endpoints are
`/weather_global/continents-api/v1/catalog.json` and `bundle.json`.
They are loopback-only, reject parameters and unsupported methods, use
`no-store`, and validate bytes/SHA-256/scientific contract before serving.
Errors return structured 503 responses with logging, never a stale European
substitute. Restart an already-running Astro server after changing middleware
imports; HMR of client code alone does not refresh Node's module cache.

The strict NASA reference rule is retained: all 360 reference months must
meet the project 90% area-coverage threshold. An incomplete reference
explicitly blocks the regional history instead of relaxing the threshold,
rebasing over an undocumented subset, or outputting zeros. A different
NASA smoothing product must have its own source identity and complete
independently checked reference; individual missing years may not be patched.

`package_continents.mjs` stages a manual-review candidate after a successful
fresh build and numerical validation. It includes the static frontend, both
catalogues and their exact JSON products, attributions, validation, source
review and a file manifest. It never copies private configuration, credentials
or storage, never uploads, and never invokes an importer or CRON. An existing
candidate directory is not overwritten. Production publication remains false;
staging does not waive Antarctic grounding, source methodology or release gates.

### Official evidence and remaining scientific scope

The completed source review archives 17 official resources (82,219,368 bytes).
NASA citations are verified, but a product-specific redistribution licence
was not established. The official requested 1200km NetCDF URL returns 404;
the downloaded official `SBBX1880.Ts.GHCNv4.1200.gz` is an 8,000 equal-area-box
sequential binary product, **not** the existing 2-degree NetCDF grid. It is
archived for a future independently validated parser/aggregation, not used
or silently substituted. Africa, South America and Oceania therefore retain
explicitly unavailable NASA histories under the current 250km coverage rule.

SCAR ADD coastline edition 7.11, DOI
`10.5285/cc0b73c0-3b53-40fb-ae84-b5dce4ac163a`, supplies EPSG:3031 lines
including 1,519 grounding-line features. Availability does not certify the
project mask: constructing a closed grounded-ice polygon and independently
validating it against the correct coastline types remains necessary.
Antarctic temperatures stay blocked. Official CDS yearly request metadata
does not explain exact temporal weighting or historical RCP differences;
the existing EU27 methodological gate remains.

This is a **conditional six-continent technical delivery**, not a claim that
all scientific acceptance criteria for 7C have been closed. No failure is
converted into data, no NASA smoothing products are blended and no public
deployment is performed.

### Local delivery verification

The canonical `npm test` currently covers 54 JavaScript tests (none skipped)
and 68 PHP assertions. The new numerical/artifact suites cover 14 tests;
54 related Python regressions also passed. Independent scalar reductions
check each model experiment and the complete 360-month reference against
raw cells. Browser checks cover 96 region/scenario/model/language selections,
exact rounded values, comparisons, pagination, explicit 503/recovery and
legacy geography warnings.

The local manual candidate is
`data_samples/2026-11-06/continents-7c-completion/manual-review-candidate/`
relative to the repository root. Read its `readme.txt`, `manifest.json`,
`validation.json` and `source-review.json` together. It is not self-contained
without the existing configured private PHP backend; a missing backend
must produce an explicit unavailable state, not synthetic climate data.

The corrected local view is `#continents?lang=cs` (or `lang=en`).
Restart an already running development server after middleware changes:
client HMR alone does not reload cached server-side API modules.

The final staged build was replayed through a local PHP static host with
the existing private backend configured externally: all 96 selections,
both languages, comparisons, blocked Antarctica, three missing NASA histories
and injected 503/recovery passed. At 390px the document is 375px and both
chart SVGs are 309px. Direct mobile initialization and return-to-tab handling
passed. The integrated browser remains hidden even after `bringToFront()`;
native foreground resize events could not be verified there. The lifecycle
check explicitly simulated `visibilitychange`; production code does not poll.
The previous candidate remains in
`manual-review-candidate-before-final-responsive-fix/` for comparison.

## Two historical views (7C.8)

The user approved two separate views, without extrapolating before or after
the available source record:

1. **Conservative comparison:** one pinned NASA GISTEMP v4 GHCNv4 land-air
   1200km SBBX analysis for every continent, no project filling. A complete
   360-month 1981-2010 reference is required per source box, rebased separately
   for each calendar month to cancel the source's potentially different
   box/month offsets. Regional monthly coverage must reach 90%, annual values
   require all twelve months and are weighted by calendar days.
2. **Exploratory estimates:** the same base plus linear interpolation of
   internal gaps of at most two months, then three nearest complete-reference
   donors from the same continent within 1200km, with inverse-distance-squared
   weights. All three donors must be originally available that month; no
   chained spatial estimates. New spatial series also need a complete
   reference. No estimates precede or follow the regional source envelope.

Source: `SBBX1880.Ts.GHCNv4.1200.gz`, SHA-256
`3b42c078c953edeb5547def42bcc15a187b8ca6bb2393b37bc1bbc185fccb97a`,
archived in the previous source review. It ends in September 2026; the
partial 2026 annual value remains missing. This is observation-derived
spatial analysis, not a direct measurement in each box. The two views do
not mix NASA250, CDS absolute temperatures, CMIP6 projections or ice-mass data.

The six conservative non-Antarctic regions have a continuous common interval
**1926-2025**. All-available view retains earlier supported years individually.
Exploratory Antarctica has values for 1958-2025 on explicitly provisional
geography; it is NOT a certified grounded-ice mean. Conservative Antarctica
stays unavailable. The map colors each existing continent with one aggregate,
not within-continent local temperature. Missing values are not zero.
This land-only atlas is not a land-ocean global index.

Products are under
`data_samples/2026-11-06/continents-history-7c8/` from the repository root.
Reproduce from `prototype` with the established Python interpreter:

```powershell
$env:OPENBLAS_NUM_THREADS='1'
python -B scripts\build_history_comparison.py
python -B scripts\validate_history_comparison.py
python -B -m unittest discover -s scripts -p 'test_history_comparison*.py'
```

Independent validation decodes all raw record frames, verifies global box
tiling and checks seven full 360-month regional references plus selected
annual scalar reductions in both views, including independent reconstruction
of spatial/temporal estimates and their area shares. Equal-distance donors
use immutable source-box order at 1mm distance precision. Source, mask,
implementation and legacy hashes are
pinned. Stale weight caches are refused, not silently reused.

Fixed-footprint sensitivity over 1926-2025 retains 91.66-99.82% of continental
area; maximum annual difference from the conservative view is 0.05441 C.
This is a test of changing spatial composition, not total uncertainty.
Held-out spatial cells have MAE 0.06851 C; isolated monthly interpolation
has MAE 0.85456 C, two-month gaps 0.86335 C. These are errors inside an
already smoothed analysis, NOT independent-station validation or confidence
intervals; the exploratory view must remain visibly separate.

Each annual record carries full-continent-area shares for source availability,
project spatial estimates and project temporal estimates; these disjoint
shares sum to coverage. Shares are day-weighted annual summaries, whereas
the 90% gate is enforced month by month. Static nearest-station-distance
metadata are only a source diagnostic, not year-by-year observed coverage.

Build and stage the current frontend with `npm run build`, then
`node scripts\package_history_comparison.mjs`, then `npm test`.
The new candidate is versioned separately from previous candidates and refuses
overwrite. No private backend data, raw archives, FTP, importer or CRON
operation is included. NASA redistribution terms remain a publication gate.

The completed route is `#continental-history?lang=cs` or `lang=en`.
The existing local preview on port 4174 was verified directly: current catalogue
and exact bundle return 200/no-store; HEAD 200, unknown 404, query 400 and POST 405.
The final build and canonical suite pass: 63 JS tests without skips and 68 PHP
assertions. New Python tests: 15 passed; previous continental suites: 14 passed.
Real-browser replay checked 28 region/view/language selections, exact 2025 values
and four area shares, partial 2026 missing, pagination, grey missing maps,
common-period limits, injected 503/recovery and cancellation on route leave.

At 390px, direct rendering and simulated return-to-tab both have a 375px document
and 309px chart SVGs. Long source hashes wrap and chart labels use the existing
light muted foreground. The integrated browser remains hidden, so native
foreground resize delivery is still an explicit test limitation, not a pass.
No polling was added. The final user-preview check has no console errors.
Earlier 7C.8 candidates were preserved under explicit
`manual-review-candidate-before-mobile-text-fix/` and
`manual-review-candidate-before-unused-title-fix/` names.
