<?php
/* ====================================================
   IMPORT SERVICE
   Validates, versions, and atomically publishes datasets.
   ==================================================== */
declare(strict_types=1);

namespace WeatherGlobal;

use DateTimeImmutable;
use DateTimeZone;
use RuntimeException;
use Throwable;

final readonly class ImportService
{
    /**
     * Creates an importer with private storage and a bounded HTTP client.
     */
    public function __construct(
        private string $storageDirectory,
        private HttpClient $httpClient,
        private int $minimumInterval,
        private int $httpTimeoutSeconds
    ) {
    }

    /**
     * Imports upstream files or a verified local archive, preserving the last good release.
     *
     * @return array{status: string, release: ?string, snapshot: ?string}
     */
    public function run(
        bool $force = false,
        ?string $archiveDirectory = null,
        ?DateTimeImmutable $now = null
    ): array {
        $this->ensureDirectory($this->storageDirectory);
        $lockPath = $this->storageDirectory . DIRECTORY_SEPARATOR . 'import.lock';
        $lock = fopen($lockPath, 'c');
        if ($lock === false) {
            throw new RuntimeException('Unable to open the import lock.');
        }
        if (!flock($lock, LOCK_EX | LOCK_NB)) {
            fclose($lock);
            throw new RuntimeException('An import is already running.');
        }

        $stagingDirectory = null;
        try {
            $current = $this->readCurrent();
            $currentManifest = $current === null ? null : $this->readManifest($current['release']);
            if (!$force && $currentManifest !== null) {
                $publishedAt = new DateTimeImmutable($currentManifest['generated_at']);
                $age = ($now ?? new DateTimeImmutable('now', new DateTimeZone('UTC')))->getTimestamp()
                    - $publishedAt->getTimestamp();
                if ($age >= 0 && $age < $this->minimumInterval) {
                    return [
                        'status' => 'skipped',
                        'release' => $current['release'],
                        'snapshot' => $currentManifest['snapshot'],
                    ];
                }
            }

            $now ??= new DateTimeImmutable('now', new DateTimeZone('UTC'));
            $stagingDirectory = $this->storageDirectory . DIRECTORY_SEPARATOR . 'staging-'
                . bin2hex(random_bytes(8));
            $this->ensureDirectory($stagingDirectory);
            $rawDirectory = $stagingDirectory . DIRECTORY_SEPARATOR . 'sources';
            $this->ensureDirectory($rawDirectory);

            $sourceRecords = [];
            $sourceText = [];
            foreach (SourceRegistry::all() as $source) {
                $bytes = $this->readSource($source, $archiveDirectory, $current);
                $digest = hash('sha256', $bytes);
                if ($source['sha256'] !== null && !hash_equals($source['sha256'], $digest)) {
                    throw new RuntimeException('Pinned source checksum mismatch: ' . $source['file']);
                }
                $this->writeFile($rawDirectory . DIRECTORY_SEPARATOR . $source['file'], $bytes);
                $sourceText[$source['file']] = $bytes;
                $sourceRecords[] = [
                    'id' => $source['id'],
                    'file' => $source['file'],
                    'url' => $source['url'],
                    'sha256' => $digest,
                    'bytes' => strlen($bytes),
                ];
            }

            $ensembleSource = SourceRegistry::ensembleArtifact();
            $ensemblePath = dirname(__DIR__) . DIRECTORY_SEPARATOR . 'data'
                . DIRECTORY_SEPARATOR . $ensembleSource['file'];
            $ensembleBytes = file_get_contents($ensemblePath);
            if (!is_string($ensembleBytes)
                || !hash_equals($ensembleSource['sha256'], hash('sha256', $ensembleBytes))) {
                throw new RuntimeException('Pinned CMIP6 ensemble artifact is missing or has changed.');
            }
            $projectionEnsemble = DataParser::parseEnsemble($ensembleBytes);
            $this->writeFile($rawDirectory . DIRECTORY_SEPARATOR . $ensembleSource['file'], $ensembleBytes);
            $sourceRecords[] = [
                'id' => $ensembleSource['id'],
                'file' => $ensembleSource['file'],
                'url' => $ensembleSource['url'],
                'sha256' => $ensembleSource['sha256'],
                'bytes' => strlen($ensembleBytes),
            ];

            $seaLevelSource = SourceRegistry::seaLevelArtifact();
            $seaLevelPath = dirname(__DIR__) . DIRECTORY_SEPARATOR . 'data'
                . DIRECTORY_SEPARATOR . $seaLevelSource['file'];
            $seaLevelBytes = file_get_contents($seaLevelPath);
            if (!is_string($seaLevelBytes)
                || !hash_equals($seaLevelSource['sha256'], hash('sha256', $seaLevelBytes))) {
                throw new RuntimeException('Pinned AR6 sea-level artifact is missing or has changed.');
            }
            $seaLevel = DataParser::parseSeaLevel($seaLevelBytes);
            $this->writeFile($rawDirectory . DIRECTORY_SEPARATOR . $seaLevelSource['file'], $seaLevelBytes);
            $sourceRecords[] = [
                'id' => $seaLevelSource['id'], 'file' => $seaLevelSource['file'],
                'url' => $seaLevelSource['url'], 'sha256' => $seaLevelSource['sha256'],
                'bytes' => strlen($seaLevelBytes),
            ];

            $series = [
                'co2' => DataParser::parseCo2($sourceText['noaa_co2_mm_gl.csv']),
                'temperature' => DataParser::parseTemperature($sourceText['nasa_gistemp_v4_global.csv']),
                'roni' => DataParser::parseRoni($sourceText['noaa_roni_ersstv6.txt']),
            ];
            $ohc = array_merge(
                DataParser::parseOhcQuarter($sourceText['noaa_ohc_0_2000m_q1.dat'], 1),
                DataParser::parseOhcQuarter($sourceText['noaa_ohc_0_2000m_q2.dat'], 2),
                DataParser::parseOhcQuarter($sourceText['noaa_ohc_0_2000m_q3.dat'], 3),
                DataParser::parseOhcQuarter($sourceText['noaa_ohc_0_2000m_q4.dat'], 4)
            );
            usort($ohc, static fn (array $left, array $right): int => $left['source_time'] <=> $right['source_time']);
            $noaaGmsl = DataParser::parseNoaaGmsl(
                $sourceText['noaa_gmsl_global_keep_reference.csv'],
                $sourceText['noaa_gmsl_global_keep_reference.nc']
            );
            $oceans = [
                'schema_version' => 1,
                'metadata' => SourceRegistry::oceanMetadata(),
                'series' => [
                    'sst' => DataParser::parseHadSst($sourceText['hadsst4_global_monthly.csv']),
                    'ohc' => $ohc,
                    'gmsl' => $noaaGmsl,
                ],
            ];
            $projections = $this->buildProjections($sourceText);
            $this->validateHistoricalCoverage($series);
            $this->validateOceanCoverage($oceans['series']);

            $climate = [
                'snapshot' => $now->setTimezone(new DateTimeZone('UTC'))->format('Y-m-d'),
                'generatedAt' => $now->setTimezone(new DateTimeZone('UTC'))->format('Y-m-d\TH:i:s\Z'),
                'commit' => SourceRegistry::IPCC_COMMIT,
                'series' => $series,
                'projections' => $projections,
                'projection_ensemble' => $projectionEnsemble,
                'oceans' => $oceans,
                'ocean_projections' => $seaLevel,
            ];
            $climateJson = json_encode($climate, JSON_THROW_ON_ERROR | JSON_UNESCAPED_SLASHES);
            $this->writeFile($stagingDirectory . DIRECTORY_SEPARATOR . 'climate.json', $climateJson);

            $manifest = [
                'schema_version' => 2,
                'snapshot' => $climate['snapshot'],
                'generated_at' => $climate['generatedAt'],
                'commit' => SourceRegistry::IPCC_COMMIT,
                'climate_sha256' => hash('sha256', $climateJson),
                'sources' => $sourceRecords,
                'coverage' => array_map(
                    static fn (array $points): array => [
                        'first' => $points[0]['date'],
                        'last' => $points[array_key_last($points)]['date'],
                        'count' => count($points),
                    ],
                    $series
                ),
                'ocean_coverage' => [
                    'sst' => $this->coverage($oceans['series']['sst']),
                    'ohc' => $this->coverage($oceans['series']['ohc']),
                    'gmsl' => [
                        'first' => $oceans['series']['gmsl']['points'][0]['date'],
                        'last' => $oceans['series']['gmsl']['points'][
                            array_key_last($oceans['series']['gmsl']['points'])
                        ]['date'],
                        'count' => count($oceans['series']['gmsl']['points']),
                        'source_generated_at' => $oceans['series']['gmsl']['source_generated_at'],
                    ],
                ],
                'ocean_projection_coverage' => [
                    'scenarios' => array_keys($seaLevel['scenarios']),
                    'first' => '2020', 'last' => '2150',
                    'points_per_scenario' => 14, 'quantiles' => 107,
                    'confidence' => 'medium_confidence',
                ],
            ];
            $manifestJson = json_encode($manifest, JSON_THROW_ON_ERROR | JSON_UNESCAPED_SLASHES);
            $this->writeFile($stagingDirectory . DIRECTORY_SEPARATOR . 'manifest.json', $manifestJson);

            $releaseId = hash('sha256', $manifestJson);
            $releaseDirectory = $this->storageDirectory . DIRECTORY_SEPARATOR . 'releases'
                . DIRECTORY_SEPARATOR . $releaseId;
            $this->ensureDirectory(dirname($releaseDirectory));
            if (is_dir($releaseDirectory)) {
                $existingManifest = $releaseDirectory . DIRECTORY_SEPARATOR . 'manifest.json';
                $existingClimate = $releaseDirectory . DIRECTORY_SEPARATOR . 'climate.json';
                $existingManifestHash = is_file($existingManifest) ? hash_file('sha256', $existingManifest) : false;
                $existingClimateHash = is_file($existingClimate) ? hash_file('sha256', $existingClimate) : false;
                if (!is_string($existingManifestHash) || !hash_equals($releaseId, $existingManifestHash)
                    || !is_string($existingClimateHash)
                    || !hash_equals($manifest['climate_sha256'], $existingClimateHash)) {
                    $this->removeTree($releaseDirectory);
                }
            }
            if (is_dir($releaseDirectory)) {
                $this->removeTree($stagingDirectory);
            } elseif (!@rename($stagingDirectory, $releaseDirectory)) {
                try {
                    $this->copyDirectory($stagingDirectory, $releaseDirectory);
                    $copiedClimate = $releaseDirectory . DIRECTORY_SEPARATOR . 'climate.json';
                    if (!is_file($copiedClimate)
                        || !hash_equals($manifest['climate_sha256'], hash_file('sha256', $copiedClimate))) {
                        throw new RuntimeException('The copied immutable release failed its integrity check.');
                    }
                    $this->removeTree($stagingDirectory);
                } catch (Throwable $error) {
                    if (is_dir($releaseDirectory)) {
                        $this->removeTree($releaseDirectory);
                    }
                    throw new RuntimeException('Unable to publish the immutable data release.', 0, $error);
                }
            }
            $stagingDirectory = null;

            $pointer = json_encode([
                'release' => $releaseId,
                'climate_sha256' => $manifest['climate_sha256'],
            ], JSON_THROW_ON_ERROR | JSON_UNESCAPED_SLASHES);
            $this->writeAtomically($this->storageDirectory . DIRECTORY_SEPARATOR . 'current.json', $pointer);

            return ['status' => 'published', 'release' => $releaseId, 'snapshot' => $climate['snapshot']];
        } catch (Throwable $error) {
            if ($stagingDirectory !== null && is_dir($stagingDirectory)) {
                $this->removeTree($stagingDirectory);
            }
            throw $error;
        } finally {
            flock($lock, LOCK_UN);
            fclose($lock);
        }
    }

    /**
     * Reads one allowlisted source from an archive, previous release, or HTTPS.
     *
     * @param array{id: string, file: string, url: string, sha256: ?string, type: string} $source
     * @param array{release: string, climate_sha256: string}|null $current
     */
    private function readSource(array $source, ?string $archiveDirectory, ?array $current): string
    {
        if ($archiveDirectory !== null) {
            $path = $archiveDirectory . DIRECTORY_SEPARATOR . $source['file'];
            $manifestPath = $archiveDirectory . DIRECTORY_SEPARATOR . 'manifest.json';
            if (!is_file($manifestPath) || !is_file($path)) {
                throw new RuntimeException('Archived source is missing: ' . $source['file']);
            }
            $manifestText = (string) file_get_contents($manifestPath);
            $manifestText = preg_replace('/^\xEF\xBB\xBF/', '', $manifestText) ?? $manifestText;
            $manifest = json_decode($manifestText, true, 512, JSON_THROW_ON_ERROR);
            $entry = null;
            foreach ($manifest['files'] ?? [] as $candidate) {
                if (($candidate['file'] ?? null) === $source['file']) {
                    $entry = $candidate;
                    break;
                }
            }
            $bytes = file_get_contents($path);
            if (!is_string($bytes) || $entry === null
                || strlen($bytes) !== ($entry['bytes'] ?? -1)
                || !hash_equals((string) ($entry['sha256'] ?? ''), hash('sha256', $bytes))) {
                throw new RuntimeException('Archived source integrity check failed: ' . $source['file']);
            }
            return $bytes;
        }

        if ($source['sha256'] !== null && $current !== null) {
            $previous = $this->storageDirectory . DIRECTORY_SEPARATOR . 'releases'
                . DIRECTORY_SEPARATOR . $current['release'] . DIRECTORY_SEPARATOR . 'sources'
                . DIRECTORY_SEPARATOR . $source['file'];
            if (is_file($previous)) {
                $bytes = file_get_contents($previous);
                if (is_string($bytes) && hash_equals($source['sha256'], hash('sha256', $bytes))) {
                    return $bytes;
                }
            }
        }

        return $this->httpClient->get($source['url'], $this->httpTimeoutSeconds, 5_000_000);
    }

    /**
     * Calculates annual anomalies against the complete 1850–1900 model baseline.
     *
     * @param array<string, string> $sourceText
     * @return list<array{model: string, scenario: string, points: list<array{date: string, value: float}>}>
     */
    private function buildProjections(array $sourceText): array
    {
        $projections = [];
        foreach (['ACCESS-CM2', 'ACCESS-ESM1-5'] as $model) {
            $historical = DataParser::parseWorld($sourceText["CMIP6_{$model}_historical_r1i1p1f1.csv"]);
            $baseline = array_values(array_filter(
                $historical,
                static fn (array $point): bool => $point['date'] >= '1850-01' && $point['date'] <= '1900-12'
            ));
            if (count($baseline) !== 612) {
                throw new RuntimeException('Incomplete CMIP6 1850–1900 baseline.');
            }
            $mean = array_sum(array_column($baseline, 'value')) / count($baseline);

            foreach (['ssp126', 'ssp585'] as $scenario) {
                $monthly = DataParser::parseWorld($sourceText["CMIP6_{$model}_{$scenario}_r1i1p1f1.csv"]);
                $annual = DataParser::annualMeans($monthly);
                if (count($annual) !== 86 || $annual[0]['date'] !== '2015'
                    || $annual[array_key_last($annual)]['date'] !== '2100'
                    || in_array(null, array_column($annual, 'value'), true)) {
                    throw new RuntimeException('Incomplete CMIP6 scenario series.');
                }
                $projections[] = [
                    'model' => $model,
                    'scenario' => $scenario,
                    'points' => array_map(
                        static fn (array $point): array => [
                            'date' => $point['date'],
                            'value' => $point['value'] - $mean,
                        ],
                        $annual
                    ),
                ];
            }
        }
        return $projections;
    }

    /**
     * Requires the validated historical products and expected archive periods.
     *
     * @param array<string, list<array{date: string, value: ?float}>> $series
     */
    private function validateHistoricalCoverage(array $series): void
    {
        if (count($series['co2']) < 500 || $series['co2'][0]['date'] !== '1979-01') {
            throw new RuntimeException('NOAA CO2 coverage is unexpectedly short.');
        }
        if (count($series['temperature']) < 1700 || $series['temperature'][0]['date'] !== '1880-01') {
            throw new RuntimeException('NASA GISTEMP coverage is unexpectedly short.');
        }
        if (count($series['roni']) < 800 || $series['roni'][0]['date'] !== '1950-01') {
            throw new RuntimeException('NOAA RONI coverage is unexpectedly short.');
        }
    }

    /**
     * Rejects incomplete ocean timelines without resampling or filling gaps.
     *
     * @param array{
     *     sst: list<array{date: string, value: ?float}>,
     *     ohc: list<array{date: string, year: int, quarter: int, source_time: float}>,
     *     gmsl: array{points: list<array{date: string, year: int, source_time: float, platform: string, value: float}>}
     * } $series
     */
    private function validateOceanCoverage(array $series): void
    {
        if ($series['sst'] === [] || $series['sst'][0]['date'] !== '1850-01'
            || count($series['sst']) < 2000) {
            throw new RuntimeException('HadSST4 global monthly coverage is incomplete.');
        }

        if ($series['ohc'] === []) {
            throw new RuntimeException('NOAA OHC quarterly coverage is empty.');
        }
        $previousQuarter = null;
        foreach ($series['ohc'] as $point) {
            $ordinal = $point['year'] * 4 + $point['quarter'];
            if ($previousQuarter !== null && $ordinal !== $previousQuarter + 1) {
                throw new RuntimeException('NOAA OHC quarterly coverage contains a missing or duplicate period.');
            }
            $previousQuarter = $ordinal;
        }

        if ($series['gmsl']['points'] === []) {
            throw new RuntimeException('NOAA LSA global sea-level coverage is empty.');
        }
    }

    /**
     * Summarizes an already validated series without deriving extra time steps.
     *
     * @param list<array{date: string}> $points
     * @return array{first: string, last: string, count: int}
     */
    private function coverage(array $points): array
    {
        return [
            'first' => $points[0]['date'],
            'last' => $points[array_key_last($points)]['date'],
            'count' => count($points),
        ];
    }

    /**
     * Loads the current release pointer only when its identifier is safe.
     *
     * @return array{release: string, climate_sha256: string}|null
     */
    private function readCurrent(): ?array
    {
        $path = $this->storageDirectory . DIRECTORY_SEPARATOR . 'current.json';
        if (!is_file($path)) {
            return null;
        }
        $pointer = json_decode((string) file_get_contents($path), true, 512, JSON_THROW_ON_ERROR);
        if (!is_array($pointer)
            || !preg_match('/^[a-f0-9]{64}$/', (string) ($pointer['release'] ?? ''))
            || !preg_match('/^[a-f0-9]{64}$/', (string) ($pointer['climate_sha256'] ?? ''))) {
            throw new RuntimeException('Current data pointer is invalid.');
        }
        return $pointer;
    }

    /**
     * Reads a trusted manifest from the release selected by the pointer.
     *
     * @return array<string, mixed>
     */
    private function readManifest(string $release): array
    {
        $path = $this->storageDirectory . DIRECTORY_SEPARATOR . 'releases'
            . DIRECTORY_SEPARATOR . $release . DIRECTORY_SEPARATOR . 'manifest.json';
        $manifest = json_decode((string) file_get_contents($path), true, 512, JSON_THROW_ON_ERROR);
        if (!is_array($manifest) || !isset($manifest['generated_at'], $manifest['snapshot'])) {
            throw new RuntimeException('Current release manifest is invalid.');
        }
        return $manifest;
    }

    /**
     * Writes a small pointer file via a same-directory rename.
     */
    private function writeAtomically(string $path, string $content): void
    {
        $temporary = $path . '.' . bin2hex(random_bytes(6)) . '.tmp';
        $this->writeFile($temporary, $content);
        if (!rename($temporary, $path)) {
            if (DIRECTORY_SEPARATOR === '\\' && is_file($path)) {
                unlink($path);
            }
            if (!rename($temporary, $path)) {
                @unlink($temporary);
                throw new RuntimeException('Unable to replace the current data pointer.');
            }
        }
    }

    /**
     * Writes a complete file and reports filesystem errors.
     */
    private function writeFile(string $path, string $content): void
    {
        if (file_put_contents($path, $content, LOCK_EX) !== strlen($content)) {
            throw new RuntimeException('Unable to write private import data.');
        }
    }

    /**
     * Creates a private directory when it does not yet exist.
     */
    private function ensureDirectory(string $path): void
    {
        if (!is_dir($path) && !mkdir($path, 0700, true) && !is_dir($path)) {
            throw new RuntimeException('Unable to create private data directory.');
        }
    }

    /**
     * Copies a complete staged release when the filesystem cannot rename directories.
     */
    private function copyDirectory(string $source, string $destination): void
    {
        $this->ensureDirectory($destination);
        $iterator = new \RecursiveIteratorIterator(
            new \RecursiveDirectoryIterator($source, \FilesystemIterator::SKIP_DOTS),
            \RecursiveIteratorIterator::SELF_FIRST
        );
        foreach ($iterator as $item) {
            $relative = substr($item->getPathname(), strlen($source) + 1);
            $target = $destination . DIRECTORY_SEPARATOR . $relative;
            if ($item->isDir()) {
                $this->ensureDirectory($target);
                continue;
            }
            $this->ensureDirectory(dirname($target));
            if (!copy($item->getPathname(), $target)) {
                throw new RuntimeException('Unable to copy the staged immutable data release.');
            }
        }
    }

    /**
     * Removes only this import's uniquely named incomplete staging directory.
     */
    private function removeTree(string $directory): void
    {
        $iterator = new \RecursiveIteratorIterator(
            new \RecursiveDirectoryIterator($directory, \FilesystemIterator::SKIP_DOTS),
            \RecursiveIteratorIterator::CHILD_FIRST
        );
        foreach ($iterator as $item) {
            $item->isDir() ? rmdir($item->getPathname()) : unlink($item->getPathname());
        }
        rmdir($directory);
    }
}
