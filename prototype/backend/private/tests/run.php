<?php
/* ====================================================
   BACKEND TEST RUNNER
   Verifies parsers and atomic import behavior against fixtures.
   ==================================================== */
declare(strict_types=1);

use WeatherGlobal\DataParser;
use WeatherGlobal\ApiController;
use WeatherGlobal\Configuration;
use WeatherGlobal\CronController;
use WeatherGlobal\HttpClient;
use WeatherGlobal\ImportService;
use WeatherGlobal\SourceRegistry;

require_once dirname(__DIR__) . DIRECTORY_SEPARATOR . 'src' . DIRECTORY_SEPARATOR . 'dataparser.php';
require_once dirname(__DIR__) . DIRECTORY_SEPARATOR . 'src' . DIRECTORY_SEPARATOR . 'httpclient.php';
require_once dirname(__DIR__) . DIRECTORY_SEPARATOR . 'src' . DIRECTORY_SEPARATOR . 'importservice.php';
require_once dirname(__DIR__) . DIRECTORY_SEPARATOR . 'src' . DIRECTORY_SEPARATOR . 'sourceregistry.php';
require_once dirname(__DIR__) . DIRECTORY_SEPARATOR . 'src' . DIRECTORY_SEPARATOR . 'configuration.php';
require_once dirname(__DIR__) . DIRECTORY_SEPARATOR . 'src' . DIRECTORY_SEPARATOR . 'croncontroller.php';
require_once dirname(__DIR__) . DIRECTORY_SEPARATOR . 'src' . DIRECTORY_SEPARATOR . 'apicontroller.php';

final class RejectingHttpClient implements HttpClient
{
    /**
     * Makes unexpected network access an explicit test failure.
     */
    public function get(string $url, int $timeoutSeconds, int $maximumBytes): string
    {
        throw new RuntimeException('Network access is not allowed in tests.');
    }
}

/**
 * Runs one assertion and records an informative result.
 */
function check(bool $condition, string $message): void
{
    if (!$condition) {
        throw new RuntimeException($message);
    }
    fwrite(STDOUT, "PASS {$message}" . PHP_EOL);
}

$archive = dirname(__DIR__, 4) . DIRECTORY_SEPARATOR . 'data_samples'
    . DIRECTORY_SEPARATOR . '2026-11-04';
$co2 = DataParser::parseCo2((string) file_get_contents($archive . DIRECTORY_SEPARATOR . 'noaa_co2_mm_gl.csv'));
$temperature = DataParser::parseTemperature((string) file_get_contents($archive . DIRECTORY_SEPARATOR . 'nasa_gistemp_v4_global.csv'));
$roni = DataParser::parseRoni((string) file_get_contents($archive . DIRECTORY_SEPARATOR . 'noaa_roni_ersstv6.txt'));
check(count($co2) === 571 && $co2[array_key_last($co2)]['date'] === '2026-07', 'NOAA CO2 values and coverage parse.');
check(count($temperature) === 1764 && $temperature[array_key_last($temperature)]['date'] === '2026-12', 'NASA GISTEMP monthly rows parse.');
check(count(array_filter($temperature, static fn (array $point): bool => $point['value'] === null)) === 3, 'NASA missing markers stay null.');
check($roni[0]['start'] === '1949-12' && $roni[0]['end'] === '1950-02', 'NOAA RONI cross-year seasons parse.');
$oceanDirectory = dirname(__DIR__) . DIRECTORY_SEPARATOR . 'data' . DIRECTORY_SEPARATOR . 'oceans';
$oceanSourceMetadata = SourceRegistry::oceanMetadata();
$validOceanLicenseLinks = count($oceanSourceMetadata) === 3;
foreach ($oceanSourceMetadata as $source) {
    $validOceanLicenseLinks = $validOceanLicenseLinks
        && isset($source['license_url'])
        && preg_match('/^https:\/\//', $source['license_url']) === 1;
}
check($validOceanLicenseLinks, 'Ocean source cards link to HTTPS provider license or attribution guidance.');
$hadSstBytes = (string) file_get_contents($oceanDirectory . DIRECTORY_SEPARATOR . 'hadsst4_global_monthly.csv');
$hadSst = DataParser::parseHadSst($hadSstBytes);
check(count($hadSst) > 2000 && $hadSst[0]['date'] === '1850-01'
    && $hadSst[0]['value'] === -0.332884 && $hadSst[array_key_last($hadSst)]['date'] === '2026-09',
    'HadSST4 monthly anomaly and archived coverage parse.');
check($hadSst[0]['total_uncertainty'] === 0.137691
    && $hadSst[0]['uncorrelated_uncertainty'] === 0.031029,
    'HadSST4 published uncertainty components remain separately available.');
$missingHadSst = DataParser::parseHadSst(
    "year,month,anomaly,total_uncertainty,uncorrelated_uncertainty,correlated_uncertainty,"
    . "bias_uncertainty,coverage_uncertainty,lower_bound_95pct_bias_uncertainty_range,"
    . "upper_bound_95pct_bias_uncertainty_range\n1850,1,***,0.1,0.02,0.03,0.04,0.05,-0.2,0.2"
);
check($missingHadSst[0]['value'] === null, 'HadSST4 missing markers remain null rather than zero.');
$ohc = [];
foreach ([1, 2, 3, 4] as $quarter) {
    $file = sprintf('noaa_ohc_0_2000m_q%d.dat', $quarter);
    $ohc = array_merge(
        $ohc,
        DataParser::parseOhcQuarter(
            (string) file_get_contents($oceanDirectory . DIRECTORY_SEPARATOR . $file),
            $quarter
        )
    );
}
usort($ohc, static fn (array $left, array $right): int => $left['source_time'] <=> $right['source_time']);
check(count($ohc) === 86 && $ohc[0]['date'] === '2005-Q1'
    && $ohc[array_key_last($ohc)]['date'] === '2026-Q2',
    'NOAA NCEI heat content remains quarterly across the archived coverage.');
check($ohc[0]['source_value_1e22_j'] === 8.973 && $ohc[0]['value'] === 89.73
    && $ohc[0]['source_standard_error_1e22_j'] === 1.292 && $ohc[0]['standard_error'] === 12.92
    && DataParser::ohcToZettajoules(1.0) === 10.0,
    'NOAA OHC value and standard error convert 10²² J to ZJ by a factor of ten.');
$malformedOHC = false;
try {
    DataParser::parseOhcQuarter("YEAR WO WOse NH NHse SH SHse\n2005.125 8.9 1.2 5.6 0.4 3.3 0.8\n2007.125 9 1 5 1 4 1", 1);
} catch (RuntimeException) {
    $malformedOHC = true;
}
check($malformedOHC, 'NOAA OHC parser rejects missing annual periods within a quarter.');
$gmslBytes = (string) file_get_contents(
    $oceanDirectory . DIRECTORY_SEPARATOR . 'noaa_gmsl_global_keep_reference.csv'
);
$gmslMetadataBytes = (string) file_get_contents(
    $oceanDirectory . DIRECTORY_SEPARATOR . 'noaa_gmsl_global_keep_reference.nc'
);
$gmsl = DataParser::parseNoaaGmsl($gmslBytes, $gmslMetadataBytes);
$missionCounts = array_count_values(array_column($gmsl['points'], 'platform'));
$topexTimes = array_column(array_filter(
    $gmsl['points'],
    static fn (array $point): bool => $point['platform'] === 'topex-poseidon'
), 'source_time');
$topexIntervals = [];
for ($index = 1; $index < count($topexTimes); $index++) {
    $topexIntervals[] = round($topexTimes[$index] - $topexTimes[$index - 1], 4);
}
check($gmsl['source_version'] === 'RADS 4.7.1'
    && $gmsl['source_generated_at'] === '2025-02-19T19:57:10Z'
    && $missionCounts === [
        'topex-poseidon' => 438,
        'jason-1' => 412,
        'jason-2' => 324,
        'jason-3' => 329,
        'sentinel-6mf' => 154,
    ],
    'NOAA LSA metadata and all five mission series are preserved.');
check(count($gmsl['points']) === 1657 && $gmsl['points'][0]['date'] === '1992-12-18'
    && $gmsl['points'][array_key_last($gmsl['points'])]['date'] === '2025-02-16'
    && count(array_unique($topexTimes)) === $missionCounts['topex-poseidon']
    && count(array_unique($topexIntervals)) > 1,
    'NOAA LSA decimal-year observations retain irregular dates and original timestamps.');
$invalidInputs = [
    static fn () => DataParser::parseCo2("year,month,value\n2000,01,1"),
    static fn () => DataParser::parseCo2(
        "year,month,decimal,average,average_unc,trend,trend_unc\n"
        . "2000,01,2000,350,0,350,0\n2000,01,2000,351,0,351,0"
    ),
    static fn () => DataParser::parseRoni("SEAS YR ANOM\nBAD 1950 1"),
    static fn () => DataParser::parseWorld("date,region\n2100-01,1"),
    static fn () => DataParser::parseHadSst("year,month,anomaly\n1850,01,***"),
    static fn () => DataParser::parseOhcQuarter("YEAR WO WOse NH NHse SH SHse\n2005.125 8.9 *** 5.6 0.4 3.3 0.8", 1),
    static fn () => DataParser::parseNoaaGmsl(
        "year,TOPEX/Poseidon,Jason-1,Jason-2,Jason-3,Sentinel-6MF\n1993.001,1,,,,",
        "RADS version 4.7.1"
    ),
    static fn () => DataParser::parseNoaaGmsl($gmslBytes, str_replace('mm', 'cm', $gmslMetadataBytes)),
];
foreach ($invalidInputs as $invalidInput) {
    $rejected = false;
    try {
        $invalidInput();
    } catch (RuntimeException) {
        $rejected = true;
    }
    check($rejected, 'Malformed source schema or values are rejected.');
}

$ensembleSource = SourceRegistry::ensembleArtifact();
$ensemblePath = dirname(__DIR__) . DIRECTORY_SEPARATOR . 'data'
    . DIRECTORY_SEPARATOR . $ensembleSource['file'];
$ensembleBytes = (string) file_get_contents($ensemblePath);
check(hash_equals($ensembleSource['sha256'], hash('sha256', $ensembleBytes)), 'The compact ensemble artifact matches its pinned checksum.');
$ensemble = DataParser::parseEnsemble($ensembleBytes);
check($ensemble['model_count'] === 19 && $ensemble['available_common_member_count'] === 29
    && count($ensemble['excluded_members']) === 10, 'Ensemble membership excludes incomplete model/member pairs consistently.');
check(count($ensemble['historical']) === 165
    && array_keys($ensemble['scenarios']) === ['ssp126', 'ssp245', 'ssp370', 'ssp585']
    && count($ensemble['scenarios']['ssp585']) === 86, 'Modelled history and all four scenarios have complete annual coverage.');
check($ensemble['historical'][164]['median'] === 0.963902
    && $ensemble['scenarios']['ssp126'][0]['minimum'] === 0.513869
    && $ensemble['scenarios']['ssp126'][0]['median'] === 1.080776
    && $ensemble['scenarios']['ssp126'][0]['maximum'] === 1.563727, 'Known annual range values match the verified batch calculation.');
check($ensemble['baseline_means']['ACCESS-CM2|r1i1p1f1'] === 13.760598,
    'Each included model has an explicit 1850–1900 reference mean.');

$invalidEnsembles = [];
$missingYear = $ensemble;
array_pop($missingYear['historical']);
$invalidEnsembles[] = json_encode($missingYear, JSON_THROW_ON_ERROR);
$reversedRange = $ensemble;
$reversedRange['scenarios']['ssp245'][0]['minimum'] = 2.0;
$invalidEnsembles[] = json_encode($reversedRange, JSON_THROW_ON_ERROR);
foreach ($invalidEnsembles as $invalidEnsemble) {
    $rejected = false;
    try {
        DataParser::parseEnsemble($invalidEnsemble);
    } catch (RuntimeException) {
        $rejected = true;
    }
    check($rejected, 'Incomplete or inconsistent ensemble inputs are rejected.');
}

$projectionFiles = array_filter(
    SourceRegistry::all(),
    static fn (array $source): bool => $source['type'] === 'projection'
);
$seaLevelSource = SourceRegistry::seaLevelArtifact();
$seaLevelBytes = (string) file_get_contents(dirname(__DIR__) . '/data/' . $seaLevelSource['file']);
$seaLevel = DataParser::parseSeaLevel($seaLevelBytes);
check(hash_equals($seaLevelSource['sha256'], hash('sha256', $seaLevelBytes)),
    'AR6 compact artifact matches its pinned checksum.');
check($seaLevel['reference_period'] === '1995-2014' && $seaLevel['unit'] === 'mm'
    && $seaLevel['confidence'] === 'medium_confidence' && count($seaLevel['quantiles']) === 107,
    'AR6 original baseline, units, confidence and all 107 quantiles remain explicit.');
$quantileIndexes = [];
foreach ([0.17, 0.5, 0.83] as $q) {
    foreach ($seaLevel['quantiles'] as $index => $coordinate) {
        if (abs($coordinate - $q) < 0.000001) {
            $quantileIndexes[] = $index;
        }
    }
}
$published2100 = [
    'ssp126' => [324, 437, 614], 'ssp245' => [435, 556, 761],
    'ssp370' => [548, 678, 898], 'ssp585' => [625, 766, 1018],
];
foreach ($published2100 as $scenario => $expected) {
    $values = $seaLevel['scenarios'][$scenario]['points'][8]['values'];
    check(array_map(static fn ($index) => $values[$index], $quantileIndexes) === $expected,
        'Original AR6 2100 q17/q50/q83 match archived NetCDF: ' . $scenario);
}
$invalidSeaLevels = [];
foreach (['reference_period' => '1850-1900', 'unit' => 'm', 'confidence' => 'low_confidence'] as $key => $value) {
    $bad = $seaLevel;
    $bad[$key] = $value;
    $invalidSeaLevels[] = $bad;
}
$bad = $seaLevel;
$bad['scenarios']['ssp245']['points'][10]['date'] = '2126';
$invalidSeaLevels[] = $bad;
$bad = $seaLevel;
$bad['scenarios']['ssp245']['points'][0]['values'][0] = -32768;
$invalidSeaLevels[] = $bad;
$bad = $seaLevel;
$bad['quantiles'][1] = 0;
$invalidSeaLevels[] = $bad;
foreach ($invalidSeaLevels as $bad) {
    $rejected = false;
    try {
        DataParser::parseSeaLevel(json_encode($bad, JSON_THROW_ON_ERROR));
    } catch (RuntimeException) {
        $rejected = true;
    }
    check($rejected, 'Invalid AR6 metadata, missing values or invented periods are rejected.');
}
foreach ($projectionFiles as $source) {
    $bytes = (string) file_get_contents($archive . DIRECTORY_SEPARATOR . $source['file']);
    check(hash_equals((string) $source['sha256'], hash('sha256', $bytes)), $source['file'] . ' matches the pinned checksum.');
}

$temporaryRoot = __DIR__ . DIRECTORY_SEPARATOR . 'runtime-' . bin2hex(random_bytes(6));
$storage = $temporaryRoot . DIRECTORY_SEPARATOR . 'storage';
$service = new ImportService($storage, new RejectingHttpClient(), 86400, 12);
$fixedTime = new DateTimeImmutable('2026-11-04T20:00:00Z');
$published = $service->run(true, $archive, $fixedTime);
check($published['status'] === 'published', 'A validated archive is published.');
$pointerPath = $storage . DIRECTORY_SEPARATOR . 'current.json';
$pointer = json_decode((string) file_get_contents($pointerPath), true, 512, JSON_THROW_ON_ERROR);
$releaseData = $storage . DIRECTORY_SEPARATOR . 'releases' . DIRECTORY_SEPARATOR . $pointer['release']
    . DIRECTORY_SEPARATOR . 'climate.json';
$originalHash = hash_file('sha256', $releaseData);
$climate = json_decode((string) file_get_contents($releaseData), true, 512, JSON_THROW_ON_ERROR);
check(count($climate['projections']) === 4 && $climate['projections'][0]['points'][0]['date'] === '2015', 'Four projection series reach the expected range.');
check($climate['projection_ensemble']['model_count'] === 19
    && count($climate['projection_ensemble']['historical']) === 165
    && count($climate['projection_ensemble']['scenarios']['ssp370']) === 86,
    'Published API includes the complete phase 6 model range.');
$oceanPayload = $climate['oceans'];
check($oceanPayload['schema_version'] === 1
    && count($oceanPayload['series']['sst']) === count($hadSst)
    && count($oceanPayload['series']['ohc']) === 86
    && count($oceanPayload['series']['gmsl']['points']) === count($gmsl['points']),
    'Published release contains all three validated ocean series at native cadence.');
check($climate['ocean_projections'] == $seaLevel,
    'Atomic publication contains the complete verified AR6 payload alongside historical data.');
$previousMethod = $_SERVER['REQUEST_METHOD'] ?? null;
$previousQuery = $_GET;
$_SERVER['REQUEST_METHOD'] = 'GET';
$_GET = ['dataset' => 'climate'];
ob_start();
(new ApiController($storage))->serve();
$apiBody = (string) ob_get_clean();
$apiStatus = http_response_code();
$_GET = $previousQuery;
if ($previousMethod === null) {
    unset($_SERVER['REQUEST_METHOD']);
} else {
    $_SERVER['REQUEST_METHOD'] = $previousMethod;
}
$apiClimate = json_decode($apiBody, true, 512, JSON_THROW_ON_ERROR);
check($apiStatus === 200 && count($apiClimate['projection_ensemble']['scenarios']['ssp245']) === 86,
    'Read-only API serves the verified phase 6 payload.');
check($apiClimate['oceans']['series']['sst'][0]['date'] === '1850-01'
    && $apiClimate['oceans']['series']['ohc'][0]['date'] === '2005-Q1'
    && $apiClimate['oceans']['series']['gmsl']['source_version'] === 'RADS 4.7.1',
    'Read-only API exposes the expected native-frequency ocean data shape.');
check($apiClimate['ocean_projections']['scenarios']['ssp585']['points'][8]['date'] === '2100'
    && count($apiClimate['ocean_projections']['scenarios']['ssp585']['points']) === 14,
    'Read-only API serves real decadal AR6 data, not interpolated annual projections.');
check($service->run(false, $archive, $fixedTime->modify('+1 hour'))['status'] === 'skipped', 'Import freshness prevents frequent downloads.');

$replica = $temporaryRoot . DIRECTORY_SEPARATOR . 'artifact-test';
mkdir($replica . DIRECTORY_SEPARATOR . 'src', 0777, true);
mkdir($replica . DIRECTORY_SEPARATOR . 'data');
foreach (['importservice.php', 'sourceregistry.php', 'dataparser.php', 'httpclient.php'] as $file) {
    copy(dirname(__DIR__) . '/src/' . $file, $replica . '/src/' . $file);
}
copy(dirname(__DIR__) . '/data/ipcc_cmip6_ensemble.json', $replica . '/data/ipcc_cmip6_ensemble.json');
$child = '<?php declare(strict_types=1);'
    . 'foreach (["httpclient", "sourceregistry", "dataparser", "importservice"] as $file)'
    . ' { require __DIR__ . "/src/" . $file . ".php"; }'
    . '$client = new class implements \WeatherGlobal\HttpClient {'
    . 'public function get(string $url, int $timeoutSeconds, int $maximumBytes): string'
    . ' { throw new \RuntimeException("Unexpected network access."); }};'
    . 'try { (new \WeatherGlobal\ImportService(' . var_export($storage, true)
    . ', $client, 86400, 8))->run(true, ' . var_export($archive, true) . '); exit(2); }'
    . 'catch (\Throwable $error) { exit(str_contains($error->getMessage(), "Pinned AR6 sea-level artifact") ? 0 : 3); }';
file_put_contents($replica . '/check.php', $child);
foreach (['missing', 'corrupted'] as $state) {
    if ($state === 'corrupted') {
        file_put_contents($replica . '/data/ar6_sealevel.json', '{"schema_version":1}');
    }
    $output = [];
    $exitCode = 0;
    exec(escapeshellarg(PHP_BINARY) . ' -d display_errors=0 '
        . escapeshellarg($replica . '/check.php') . ' 2>&1', $output, $exitCode);
    check($exitCode === 0 && json_decode((string) file_get_contents($pointerPath), true)['release'] === $pointer['release']
        && hash_file('sha256', $releaseData) === $originalHash,
        'A ' . $state . ' pinned AR6 artifact cannot publish or change the current pointer.');
}

$brokenArchive = $temporaryRoot . DIRECTORY_SEPARATOR . 'broken-archive';
mkdir($brokenArchive);
copy($archive . DIRECTORY_SEPARATOR . 'manifest.json', $brokenArchive . DIRECTORY_SEPARATOR . 'manifest.json');
foreach (SourceRegistry::all() as $source) {
    copy(
        $archive . DIRECTORY_SEPARATOR . $source['file'],
        $brokenArchive . DIRECTORY_SEPARATOR . $source['file']
    );
}
$brokenManifest = json_decode(
    (string) file_get_contents($brokenArchive . DIRECTORY_SEPARATOR . 'manifest.json'),
    true,
    512,
    JSON_THROW_ON_ERROR
);
$brokenSstName = 'hadsst4_global_monthly.csv';
$originalBrokenSst = (string) file_get_contents($brokenArchive . DIRECTORY_SEPARATOR . $brokenSstName);
$brokenSst = "invalid source schema\n" . substr(
    $originalBrokenSst,
    strpos($originalBrokenSst, "\n") + 1
);
file_put_contents($brokenArchive . DIRECTORY_SEPARATOR . $brokenSstName, $brokenSst);
foreach ($brokenManifest['files'] as &$entry) {
    if ($entry['file'] === $brokenSstName) {
        $entry['bytes'] = strlen($brokenSst);
        $entry['sha256'] = hash('sha256', $brokenSst);
    }
}
unset($entry);
file_put_contents(
    $brokenArchive . DIRECTORY_SEPARATOR . 'manifest.json',
    json_encode($brokenManifest, JSON_THROW_ON_ERROR | JSON_UNESCAPED_SLASHES)
);
$failed = false;
try {
    $service->run(true, $brokenArchive, $fixedTime->modify('+2 days'));
} catch (Throwable) {
    $failed = true;
}
check($failed, 'A partial or invalid archive fails explicitly.');
check(hash_file('sha256', $releaseData) === $originalHash, 'A failed import preserves the last published release.');
check(json_decode((string) file_get_contents($pointerPath), true, 512, JSON_THROW_ON_ERROR)['release'] === $pointer['release'], 'A failed import does not switch the current pointer.');

$upstreamFailed = false;
try {
    $service->run(true, null, $fixedTime->modify('+3 days'));
} catch (RuntimeException $error) {
    $upstreamFailed = str_contains($error->getMessage(), 'Network access is not allowed');
}
check($upstreamFailed, 'An upstream failure is surfaced without publishing.');
check(hash_file('sha256', $releaseData) === $originalHash, 'An upstream failure retains the previous release.');

$cronConfigPath = $temporaryRoot . DIRECTORY_SEPARATOR . 'config.php';
$publicDirectory = $temporaryRoot . DIRECTORY_SEPARATOR . 'public';
mkdir($publicDirectory);
file_put_contents($cronConfigPath, "<?php return ["
    . "'storage_directory' => " . var_export($storage, true) . ","
    . "'cron_token' => 'unit-test-token-with-at-least-32-characters',"
    . "'minimum_import_interval' => 86400,"
    . "'http_timeout_seconds' => 12];");
$configuration = Configuration::load($temporaryRoot);
$publicStorage = $publicDirectory . DIRECTORY_SEPARATOR . 'storage';
file_put_contents($cronConfigPath, "<?php return ["
    . "'storage_directory' => " . var_export($publicStorage, true) . ","
    . "'cron_token' => 'unit-test-token-with-at-least-32-characters',"
    . "'minimum_import_interval' => 86400,"
    . "'http_timeout_seconds' => 12];");
$publicStorageRejected = false;
try {
    Configuration::load($temporaryRoot, $publicDirectory);
} catch (RuntimeException) {
    $publicStorageRejected = true;
}
check($publicStorageRejected, 'Public web storage is rejected by configuration validation.');
file_put_contents($cronConfigPath, "<?php return ["
    . "'storage_directory' => " . var_export($storage, true) . ","
    . "'cron_token' => 'unit-test-token-with-at-least-32-characters',"
    . "'minimum_import_interval' => 86400,"
    . "'http_timeout_seconds' => 12];");
$configuration = Configuration::load($temporaryRoot);
$previousMethod = $_SERVER['REQUEST_METHOD'] ?? null;
$previousQuery = $_GET;
$_SERVER['REQUEST_METHOD'] = 'GET';
$_GET = ['token' => 'invalid-test-token'];
ob_start();
(new CronController($configuration, $service))->run();
$cronResponse = (string) ob_get_clean();
$cronStatus = http_response_code();
$_GET = $previousQuery;
if ($previousMethod === null) {
    unset($_SERVER['REQUEST_METHOD']);
} else {
    $_SERVER['REQUEST_METHOD'] = $previousMethod;
}
check($cronStatus === 403, 'The scheduled endpoint rejects an invalid token.');
check(!str_contains($cronResponse, 'unit-test-token'), 'The scheduled endpoint never returns its configured token.');

$refreshed = $service->run(true, $archive, $fixedTime->modify('+4 days'));
$updatedPointer = json_decode((string) file_get_contents($pointerPath), true, 512, JSON_THROW_ON_ERROR);
check($refreshed['status'] === 'published' && $updatedPointer['release'] === $refreshed['release'], 'A successful refresh atomically selects its new release.');
check($updatedPointer['release'] !== $pointer['release'] && is_file($releaseData), 'The previous immutable release remains available after refresh.');

$lockPath = $storage . DIRECTORY_SEPARATOR . 'import.lock';
$lock = fopen($lockPath, 'c');
flock($lock, LOCK_EX | LOCK_NB);
$busy = false;
try {
    $service->run(true, $archive, $fixedTime->modify('+3 days'));
} catch (RuntimeException $error) {
    $busy = str_contains($error->getMessage(), 'already running');
}
flock($lock, LOCK_UN);
fclose($lock);
check($busy, 'Concurrent imports are rejected by the file lock.');

$removeTree = static function (string $directory) use (&$removeTree): void {
    foreach (array_diff(scandir($directory) ?: [], ['.', '..']) as $entry) {
        $path = $directory . DIRECTORY_SEPARATOR . $entry;
        if (is_dir($path) && !is_link($path)) {
            $removeTree($path);
        } else {
            unlink($path);
        }
    }
    rmdir($directory);
};
$removeTree($temporaryRoot);
