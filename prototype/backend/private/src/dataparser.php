<?php
/* ====================================================
   DATA PARSER
   Parses and validates approved climate data formats.
   ==================================================== */
declare(strict_types=1);

namespace WeatherGlobal;

use RuntimeException;

final class DataParser
{
    /**
     * Validates published global p-box quantiles, preserving all original decadal steps.
     */
    public static function parseSeaLevel(string $text): array
    {
        $data = json_decode($text, true, 512, JSON_THROW_ON_ERROR);
        foreach ([
            'schema_version' => 1, 'version' => '20210809', 'unit' => 'mm',
            'reference_period' => '1995-2014', 'location_id' => -1,
            'confidence' => 'medium_confidence', 'statistic' => 'confidence_output_pbox',
            'license' => 'CC-BY-4.0',
        ] as $key => $value) {
            if (($data[$key] ?? null) !== $value) {
                throw new RuntimeException('Invalid AR6 sea-level metadata: ' . $key);
            }
        }
        foreach (['product', 'provider', 'geography', 'central_definition', 'interval_definition',
            'workflow_definition', 'acknowledgement'] as $key) {
            if (!is_string($data[$key] ?? null) || trim($data[$key]) === '') {
                throw new RuntimeException('Missing AR6 sea-level provenance: ' . $key);
            }
        }
        foreach (['source_url', 'record_url', 'documentation_url', 'baseline_documentation_url', 'license_url'] as $key) {
            if (!is_string($data[$key] ?? null) || !str_starts_with($data[$key], 'https://')) {
                throw new RuntimeException('Invalid AR6 provenance URL.');
            }
        }
        if (!is_string($data['source_manifest_sha256'] ?? null)
            || !preg_match('/^[a-f0-9]{64}$/', $data['source_manifest_sha256'])
            || !is_array($data['citations'] ?? null) || count($data['citations']) !== 3) {
            throw new RuntimeException('Missing AR6 source manifest or citations.');
        }
        foreach ($data['citations'] as $citation) {
            if (!is_string($citation['text'] ?? null) || $citation['text'] === ''
                || !is_string($citation['url'] ?? null) || !str_starts_with($citation['url'], 'https://doi.org/')) {
                throw new RuntimeException('Invalid AR6 citation.');
            }
        }
        $quantiles = $data['quantiles'] ?? null;
        if (!is_array($quantiles) || !array_is_list($quantiles) || count($quantiles) !== 107
            || $quantiles[0] != 0 || $quantiles[106] != 1) {
            throw new RuntimeException('Invalid AR6 quantile coordinates.');
        }
        $previous = -1;
        foreach ($quantiles as $quantile) {
            if ((!is_int($quantile) && !is_float($quantile)) || !is_finite((float) $quantile)
                || $quantile <= $previous || $quantile < 0 || $quantile > 1) {
                throw new RuntimeException('Unordered AR6 quantile coordinates.');
            }
            $previous = $quantile;
        }
        foreach ([0.17, 0.5, 0.83] as $required) {
            if (count(array_filter($quantiles, static fn ($q): bool => abs($q - $required) < 0.000001)) !== 1) {
                throw new RuntimeException('Missing AR6 display quantile.');
            }
        }
        $scenarios = ['ssp126', 'ssp245', 'ssp370', 'ssp585'];
        if (!is_array($data['scenarios'] ?? null) || array_keys($data['scenarios']) !== $scenarios) {
            throw new RuntimeException('Invalid AR6 scenario coverage.');
        }
        foreach ($data['scenarios'] as $scenario => $series) {
            if (($series['source_file'] ?? null) !== "total_{$scenario}_medium_confidence_values.nc"
                || !is_string($series['source_sha256'] ?? null)
                || !preg_match('/^[a-f0-9]{64}$/', $series['source_sha256'])
                || !is_string($series['source_history'] ?? null)
                || !is_string($series['source_workflows'] ?? null)
                || !is_array($series['points'] ?? null) || !array_is_list($series['points'])
                || count($series['points']) !== 14) {
                throw new RuntimeException('Invalid AR6 scenario provenance or periods.');
            }
            foreach ($series['points'] as $index => $point) {
                if (($point['date'] ?? null) !== (string) (2020 + 10 * $index)
                    || !is_array($point['values'] ?? null) || !array_is_list($point['values'])
                    || count($point['values']) !== 107) {
                    throw new RuntimeException('Missing or interpolated AR6 periods.');
                }
                $previous = -INF;
                foreach ($point['values'] as $value) {
                    if ((!is_int($value) && !is_float($value)) || !is_finite((float) $value)
                        || $value === -32768 || $value < $previous) {
                        throw new RuntimeException('Invalid AR6 p-box values.');
                    }
                    $previous = $value;
                }
            }
        }
        return $data;
    }

    /**
     * Parses NOAA monthly global CO2 values.
     *
     * @return list<array{date: string, value: float}>
     */
    public static function parseCo2(string $text): array
    {
        $rows = self::sourceLines($text);
        if (array_shift($rows) !== 'year,month,decimal,average,average_unc,trend,trend_unc') {
            throw new RuntimeException('NOAA CO2 schema changed.');
        }

        $series = [];
        foreach ($rows as $line) {
            $cells = str_getcsv($line);
            if (count($cells) !== 7 || !ctype_digit($cells[0]) || !ctype_digit($cells[1])) {
                throw new RuntimeException('Invalid NOAA CO2 row.');
            }
            $year = (int) $cells[0];
            $month = (int) $cells[1];
            $value = self::number($cells[3]);
            if ($month < 1 || $month > 12 || $value < 100 || $value > 1000) {
                throw new RuntimeException('NOAA CO2 value is outside the expected range.');
            }
            $series[] = ['date' => sprintf('%04d-%02d', $year, $month), 'value' => $value];
        }

        return self::validateMonthly($series);
    }

    /**
     * Parses NASA GISTEMP monthly global temperature anomalies.
     *
     * @return list<array{date: string, value: ?float}>
     */
    public static function parseTemperature(string $text): array
    {
        $rows = self::sourceLines($text);
        if (array_shift($rows) !== 'Land-Ocean: Global Means'
            || array_shift($rows) !== 'Year,Jan,Feb,Mar,Apr,May,Jun,Jul,Aug,Sep,Oct,Nov,Dec,J-D,D-N,DJF,MAM,JJA,SON') {
            throw new RuntimeException('NASA GISTEMP schema changed.');
        }

        $series = [];
        foreach ($rows as $line) {
            $cells = str_getcsv($line);
            if (count($cells) !== 19 || !ctype_digit($cells[0])) {
                throw new RuntimeException('Invalid NASA GISTEMP row.');
            }
            foreach (array_slice($cells, 1, 12) as $index => $cell) {
                $value = $cell === '***' ? null : self::number($cell);
                if ($value !== null && ($value < -5 || $value > 5)) {
                    throw new RuntimeException('NASA GISTEMP value is outside the expected range.');
                }
                $series[] = [
                    'date' => sprintf('%04d-%02d', (int) $cells[0], $index + 1),
                    'value' => $value,
                ];
            }
        }

        return self::validateMonthly($series);
    }

    /**
     * Parses NOAA CPC's overlapping three-month RONI seasons.
     *
     * @return list<array{date: string, value: float, season: string, start: string, end: string}>
     */
    public static function parseRoni(string $text): array
    {
        $rows = self::sourceLines($text);
        if (preg_replace('/\s+/', ',', trim((string) array_shift($rows))) !== 'SEAS,YR,ANOM') {
            throw new RuntimeException('NOAA RONI schema changed.');
        }

        $seasons = ['DJF', 'JFM', 'FMA', 'MAM', 'AMJ', 'MJJ', 'JJA', 'JAS', 'ASO', 'SON', 'OND', 'NDJ'];
        $series = [];
        foreach ($rows as $line) {
            $cells = preg_split('/\s+/', trim($line));
            if (count($cells) !== 3 || !ctype_digit($cells[1])) {
                throw new RuntimeException('Invalid NOAA RONI row.');
            }
            $month = array_search($cells[0], $seasons, true);
            if ($month === false) {
                throw new RuntimeException('Unknown NOAA RONI season.');
            }
            $year = (int) $cells[1];
            $value = self::number($cells[2]);
            if ($value < -5 || $value > 5) {
                throw new RuntimeException('NOAA RONI value is outside the expected range.');
            }
            $centerMonth = $month + 1;
            $center = new \DateTimeImmutable(sprintf('%04d-%02d-01', $year, $centerMonth), new \DateTimeZone('UTC'));
            $series[] = [
                'date' => $center->format('Y-m'),
                'value' => $value,
                'season' => $cells[0],
                'start' => $center->modify('-1 month')->format('Y-m'),
                'end' => $center->modify('+1 month')->format('Y-m'),
            ];
        }

        self::validateMonthly($series);
        return $series;
    }

    /**
     * Parses the HadSST4 monthly global-ocean anomaly time series.
     *
     * @return list<array{
     *     date: string,
     *     value: ?float,
     *     total_uncertainty: ?float,
     *     uncorrelated_uncertainty: ?float,
     *     correlated_uncertainty: ?float,
     *     bias_uncertainty: ?float,
     *     coverage_uncertainty: ?float
     * }>
     */
    public static function parseHadSst(string $text): array
    {
        $rows = self::sourceLines($text);
        $expectedHeader = 'year,month,anomaly,total_uncertainty,uncorrelated_uncertainty,'
            . 'correlated_uncertainty,bias_uncertainty,coverage_uncertainty,'
            . 'lower_bound_95pct_bias_uncertainty_range,upper_bound_95pct_bias_uncertainty_range';
        if (array_shift($rows) !== $expectedHeader) {
            throw new RuntimeException('HadSST4 monthly GLOBE schema changed.');
        }

        $series = [];
        foreach ($rows as $line) {
            $cells = str_getcsv($line);
            if (count($cells) !== 10 || !ctype_digit($cells[0]) || !ctype_digit($cells[1])) {
                throw new RuntimeException('Invalid HadSST4 row.');
            }
            $year = (int) $cells[0];
            $month = (int) $cells[1];
            if ($year < 1850 || $year > 2200 || $month < 1 || $month > 12) {
                throw new RuntimeException('HadSST4 date is outside its expected range.');
            }

            $values = array_map(
                self::optionalNumber(...),
                array_slice($cells, 2, 6)
            );
            if (($values[0] !== null && ($values[0] < -10 || $values[0] > 10))
                || array_filter(
                    array_slice($values, 1),
                    static fn (?float $value): bool => $value !== null && ($value < 0 || $value > 10)
                ) !== []) {
                throw new RuntimeException('HadSST4 anomaly or uncertainty is outside its expected range.');
            }

            foreach (array_slice($cells, 8, 2) as $bound) {
                $number = self::optionalNumber($bound);
                if ($number !== null && ($number < -10 || $number > 10)) {
                    throw new RuntimeException('HadSST4 bias-uncertainty bound is outside its expected range.');
                }
            }

            $series[] = [
                'date' => sprintf('%04d-%02d', $year, $month),
                'value' => $values[0],
                'total_uncertainty' => $values[1],
                'uncorrelated_uncertainty' => $values[2],
                'correlated_uncertainty' => $values[3],
                'bias_uncertainty' => $values[4],
                'coverage_uncertainty' => $values[5],
            ];
        }

        return self::validateMonthly($series);
    }

    /**
     * Parses one NOAA NCEI global 0–2000 m heat-content quarter.
     *
     * @return list<array{
     *     date: string,
     *     year: int,
     *     quarter: int,
     *     source_time: float,
     *     value: float,
     *     source_value_1e22_j: float,
     *     standard_error: float,
     *     source_standard_error_1e22_j: float
     * }>
     */
    public static function parseOhcQuarter(string $text, int $quarter): array
    {
        if ($quarter < 1 || $quarter > 4) {
            throw new RuntimeException('NOAA OHC quarter must be between 1 and 4.');
        }
        $rows = self::sourceLines($text);
        $header = preg_split('/\s+/', trim((string) array_shift($rows))) ?: [];
        if ($header !== ['YEAR', 'WO', 'WOse', 'NH', 'NHse', 'SH', 'SHse']) {
            throw new RuntimeException('NOAA OHC basin time-series schema changed.');
        }

        $series = [];
        $previousYear = null;
        $expectedFraction = ($quarter * 2 - 1) / 8;
        foreach ($rows as $line) {
            $cells = preg_split('/\s+/', trim($line)) ?: [];
            if (count($cells) !== 7) {
                throw new RuntimeException('Invalid NOAA OHC row.');
            }
            $numbers = array_map(self::number(...), $cells);
            $sourceTime = $numbers[0];
            $year = (int) floor($sourceTime);
            if ($year < 1800 || $year > 2200
                || abs(($sourceTime - $year) - $expectedFraction) > 0.002
                || ($previousYear !== null && $year !== $previousYear + 1)) {
                throw new RuntimeException('NOAA OHC timestamp is invalid or has a missing year.');
            }
            if (abs($numbers[1]) > 1000 || $numbers[2] < 0 || $numbers[2] > 1000
                || abs($numbers[3]) > 1000 || $numbers[4] < 0 || $numbers[4] > 1000
                || abs($numbers[5]) > 1000 || $numbers[6] < 0 || $numbers[6] > 1000) {
                throw new RuntimeException('NOAA OHC value or standard error is outside its expected range.');
            }

            $series[] = [
                'date' => sprintf('%04d-Q%d', $year, $quarter),
                'year' => $year,
                'quarter' => $quarter,
                'source_time' => $sourceTime,
                'value' => self::ohcToZettajoules($numbers[1]),
                'source_value_1e22_j' => $numbers[1],
                'standard_error' => self::ohcToZettajoules($numbers[2]),
                'source_standard_error_1e22_j' => $numbers[2],
            ];
            $previousYear = $year;
        }
        if ($series === []) {
            throw new RuntimeException('NOAA OHC quarter contains no observations.');
        }
        return $series;
    }

    /**
     * Converts NOAA's 10^22 joule unit to zettajoules without changing the source value.
     */
    public static function ohcToZettajoules(float $sourceValue): float
    {
        if (!is_finite($sourceValue)) {
            throw new RuntimeException('NOAA OHC value must be finite.');
        }
        return $sourceValue * 10;
    }

    /**
     * Parses NOAA LSA's unsmoothed, multi-mission global sea-level CSV and metadata.
     *
     * @return array{
     *     points: list<array{date: string, year: int, source_time: float, platform: string, value: float}>,
     *     source_version: string,
     *     source_generated_at: string
     * }
     */
    public static function parseNoaaGmsl(string $text, string $metadataText): array
    {
        $netcdf = self::netcdfHeaderAttributes($metadataText);
        $sourceDescription = $netcdf['global']['source'] ?? '';
        $history = $netcdf['global']['history'] ?? '';
        $trend = $netcdf['global']['trend'] ?? '';
        if (!preg_match(
                '/Radar Altimeter Database System version\s+(\d+\.\d+(?:\.\d+)?)/i',
                $sourceDescription,
                $versionMatch
            )
            || !preg_match(
                '/Generated by.*? at ([A-Za-z]{3} \d{1,2} [A-Za-z]{3} \d{2}:\d{2}:\d{2} UTC \d{4}) by/s',
                $history,
                $generatedMatch
            )
            || !str_contains($netcdf['global']['title'] ?? '', 'Annual signals retained')
            || !preg_match('/no glacial isostatic adjustment correction/i', $trend)) {
            throw new RuntimeException('NOAA LSA NetCDF version, generation, signal, or GIA metadata is invalid.');
        }
        foreach (['sla_tx', 'sla_j1', 'sla_j2', 'sla_j3', 'sla_6a'] as $variable) {
            if (($netcdf['variables'][$variable]['units'] ?? null) !== 'mm') {
                throw new RuntimeException('NOAA LSA NetCDF sea-level units are missing or changed.');
            }
        }
        $generatedAt = \DateTimeImmutable::createFromFormat(
            'D d M H:i:s \U\T\C Y',
            $generatedMatch[1],
            new \DateTimeZone('UTC')
        );
        if (!$generatedAt instanceof \DateTimeImmutable) {
            throw new RuntimeException('NOAA LSA metadata generation time is invalid.');
        }

        $rows = self::sourceLines($text);
        $expectedHeader = [
            'year',
            'TOPEX/Poseidon',
            'Jason-1',
            'Jason-2',
            'Jason-3',
            'Sentinel-6MF',
        ];
        if (str_getcsv((string) array_shift($rows)) !== $expectedHeader) {
            throw new RuntimeException('NOAA LSA global sea-level CSV schema changed.');
        }

        $missions = [
            'topex-poseidon' => 'TOPEX/Poseidon',
            'jason-1' => 'Jason-1',
            'jason-2' => 'Jason-2',
            'jason-3' => 'Jason-3',
            'sentinel-6mf' => 'Sentinel-6MF',
        ];
        $missionCounts = array_fill_keys(array_keys($missions), 0);
        $lastTimeByMission = [];
        $points = [];
        $previousTime = null;
        foreach ($rows as $line) {
            $cells = str_getcsv($line);
            if (count($cells) !== 6) {
                throw new RuntimeException('Invalid NOAA LSA global sea-level row.');
            }
            $sourceTime = self::number($cells[0]);
            if ($sourceTime < 1900 || $sourceTime > 2200
                || ($previousTime !== null && $sourceTime <= $previousTime)) {
                throw new RuntimeException('NOAA LSA timestamps are invalid, duplicated, or out of order.');
            }
            $date = self::dateFromDecimalYear($sourceTime);
            $year = (int) substr($date, 0, 4);
            $hasValue = false;
            foreach (array_keys($missions) as $index => $missionId) {
                $cell = trim($cells[$index + 1]);
                if ($cell === '') {
                    continue;
                }
                $value = self::number($cell);
                if ($value < -500 || $value > 500) {
                    throw new RuntimeException('NOAA LSA sea-level anomaly is outside its expected millimeter range.');
                }
                if (isset($lastTimeByMission[$missionId]) && $sourceTime <= $lastTimeByMission[$missionId]) {
                    throw new RuntimeException('NOAA LSA timestamps are duplicated within a mission.');
                }
                $points[] = [
                    'date' => $date,
                    'year' => $year,
                    'source_time' => $sourceTime,
                    'platform' => $missionId,
                    'value' => $value,
                ];
                $lastTimeByMission[$missionId] = $sourceTime;
                $missionCounts[$missionId]++;
                $hasValue = true;
            }
            if (!$hasValue) {
                throw new RuntimeException('NOAA LSA row has no observed mission value.');
            }
            $previousTime = $sourceTime;
        }

        foreach ($missionCounts as $missionId => $count) {
            if ($count === 0) {
                throw new RuntimeException('NOAA LSA series is missing mission ' . $missionId . '.');
            }
        }
        if ($points === []) {
            throw new RuntimeException('NOAA LSA global sea-level series is empty.');
        }

        return [
            'points' => $points,
            'source_version' => 'RADS ' . $versionMatch[1],
            'source_generated_at' => $generatedAt->format('Y-m-d\TH:i:s\Z'),
        ];
    }

    /**
     * Reads only the classic NetCDF header attributes needed to validate NOAA LSA metadata.
     *
     * @return array{global: array<string, string>, variables: array<string, array<string, string>>}
     */
    private static function netcdfHeaderAttributes(string $text): array
    {
        if (!str_starts_with($text, "CDF\x01") || strlen($text) < 16) {
            throw new RuntimeException('NOAA LSA metadata is not a supported classic NetCDF file.');
        }
        $offset = 8;
        $readUInt32 = static function () use ($text, &$offset): int {
            if ($offset + 4 > strlen($text)) {
                throw new RuntimeException('NOAA LSA NetCDF header is truncated.');
            }
            $value = unpack('Nvalue', substr($text, $offset, 4));
            $offset += 4;
            return (int) $value['value'];
        };
        $readString = static function () use ($text, &$offset, $readUInt32): string {
            $length = $readUInt32();
            if ($length > 1_000_000 || $offset + $length > strlen($text)) {
                throw new RuntimeException('NOAA LSA NetCDF string length is invalid.');
            }
            $value = substr($text, $offset, $length);
            $offset += $length + ((4 - ($length % 4)) % 4);
            return rtrim($value, "\0");
        };
        $readListCount = static function (int $expectedTag) use ($readUInt32): int {
            $tag = $readUInt32();
            if ($tag === 0) {
                return 0;
            }
            $count = $readUInt32();
            if ($tag !== $expectedTag || $count > 10_000) {
                throw new RuntimeException('NOAA LSA NetCDF list tag or count is invalid.');
            }
            return $count;
        };
        $readAttributes = static function () use (
            $text,
            &$offset,
            $readUInt32,
            $readString,
            $readListCount
        ): array {
            $attributes = [];
            $attributeCount = $readListCount(12);
            for ($index = 0; $index < $attributeCount; $index++) {
                $name = $readString();
                $type = $readUInt32();
                $count = $readUInt32();
                $width = match ($type) {
                    1, 2 => 1,
                    3 => 2,
                    4, 5 => 4,
                    6 => 8,
                    default => throw new RuntimeException('NOAA LSA NetCDF attribute type is unsupported.'),
                };
                $length = $count * $width;
                if ($length > 1_000_000 || $offset + $length > strlen($text)) {
                    throw new RuntimeException('NOAA LSA NetCDF attribute length is invalid.');
                }
                if ($type === 2) {
                    $attributes[$name] = rtrim(substr($text, $offset, $length), "\0");
                }
                $offset += $length + ((4 - ($length % 4)) % 4);
            }
            return $attributes;
        };

        $dimensionCount = $readListCount(10);
        for ($index = 0; $index < $dimensionCount; $index++) {
            $readString();
            $readUInt32();
        }
        $global = $readAttributes();
        $variableCount = $readListCount(11);
        $variables = [];
        for ($index = 0; $index < $variableCount; $index++) {
            $name = $readString();
            $dimensionIds = $readUInt32();
            if ($dimensionIds > 10_000) {
                throw new RuntimeException('NOAA LSA NetCDF variable dimensions are invalid.');
            }
            for ($dimension = 0; $dimension < $dimensionIds; $dimension++) {
                $readUInt32();
            }
            $variables[$name] = $readAttributes();
            $readUInt32();
            $readUInt32();
            $readUInt32();
        }
        return ['global' => $global, 'variables' => $variables];
    }

    /**
     * Parses a pinned CMIP6 global near-surface temperature series.
     *
     * @return list<array{date: string, value: float}>
     */
    public static function parseWorld(string $text): array
    {
        $rows = self::sourceLines($text);
        while ($rows !== [] && str_starts_with($rows[0], '#')) {
            array_shift($rows);
        }
        if ($rows === []) {
            throw new RuntimeException('CMIP6 file is empty.');
        }

        $header = str_getcsv(array_shift($rows));
        $worldIndex = array_search('world', $header, true);
        if (($header[0] ?? null) !== 'date' || $worldIndex === false) {
            throw new RuntimeException('CMIP6 global column is missing.');
        }

        $series = [];
        foreach ($rows as $line) {
            $cells = str_getcsv($line);
            if (count($cells) !== count($header) || !preg_match('/^\d{4}-(0[1-9]|1[0-2])$/', $cells[0])) {
                throw new RuntimeException('Invalid CMIP6 row.');
            }
            $value = self::number($cells[$worldIndex]);
            if ($value < -100 || $value > 100) {
                throw new RuntimeException('CMIP6 world value is outside the expected Celsius range.');
            }
            $series[] = ['date' => $cells[0], 'value' => $value];
        }

        return self::validateMonthly($series);
    }

    /**
     * Validates the complete checksum-pinned annual CMIP6 ensemble artifact.
     *
     * @return array<string, mixed>
     */
    public static function parseEnsemble(string $text): array
    {
        $ensemble = json_decode($text, true, 512, JSON_THROW_ON_ERROR);
        if (!is_array($ensemble)
            || ($ensemble['schema_version'] ?? null) !== 1
            || ($ensemble['commit'] ?? null) !== SourceRegistry::IPCC_COMMIT
            || ($ensemble['variable'] ?? null) !== 'tas'
            || ($ensemble['region'] ?? null) !== 'world'
            || ($ensemble['units'] ?? null) !== 'degC anomaly'
            || ($ensemble['reference_period'] ?? null) !== '1850-1900'
            || ($ensemble['reference_months'] ?? null) !== 612
            || !is_int($ensemble['model_count'] ?? null)
            || $ensemble['model_count'] < 2
            || !is_int($ensemble['available_common_member_count'] ?? null)
            || $ensemble['available_common_member_count'] !== 29
            || !is_array($ensemble['members'] ?? null)
            || count($ensemble['members']) !== $ensemble['model_count']
            || !is_array($ensemble['excluded_members'] ?? null)
            || count($ensemble['members']) + count($ensemble['excluded_members'])
                !== $ensemble['available_common_member_count']
            || !preg_match('/^[a-f0-9]{64}$/', (string) ($ensemble['source_manifest_sha256'] ?? ''))
            || ($ensemble['annual_aggregation'] ?? null)
                !== 'Arithmetic mean of all 12 monthly values; equal month weights.'
            || ($ensemble['ensemble_aggregation'] ?? null)
                !== 'One equally weighted realization per model; median and observed minimum/maximum.'
            || ($ensemble['baseline_units'] ?? null) !== 'degC absolute tas mean'
            || !is_array($ensemble['baseline_means'] ?? null)
            || count($ensemble['baseline_means']) !== $ensemble['model_count']
            || ($ensemble['calendar'] ?? null)
                !== 'Calendar metadata are not encoded in these monthly CSV files.'
            || ($ensemble['calendar_method'] ?? null)
                !== 'Equal weighting of 12 monthly means; no day-count calendar is inferred or applied.'
            || !is_array($ensemble['scenarios'] ?? null)
            || array_keys($ensemble['scenarios']) !== ['ssp126', 'ssp245', 'ssp370', 'ssp585']) {
            throw new RuntimeException('CMIP6 ensemble metadata or scenario coverage is invalid.');
        }

        $models = [];
        foreach ($ensemble['members'] as $member) {
            if (!is_string($member)
                || !preg_match('/^([A-Za-z0-9.-]+)\|r\d+i\d+p\d+f\d+$/', $member, $matches)
                || isset($models[$matches[1]])) {
                throw new RuntimeException('CMIP6 ensemble members are invalid or duplicated.');
            }
            $models[$matches[1]] = true;
        }
        if (count($models) !== $ensemble['model_count']) {
            throw new RuntimeException('CMIP6 ensemble must contain one realization per model.');
        }
        foreach ($ensemble['excluded_members'] as $excluded) {
            if (!is_array($excluded)) {
                throw new RuntimeException('CMIP6 exclusion record is invalid.');
            }
            $member = $excluded['member'] ?? null;
            if (!is_string($member)
                || !preg_match('/^([A-Za-z0-9.-]+)\|r\d+i\d+p\d+f\d+$/', $member, $matches)
                || isset($models[$matches[1]])
                || !is_string($excluded['reason'] ?? null)
                || $excluded['reason'] === '') {
                throw new RuntimeException('CMIP6 exclusions are invalid or duplicated.');
            }
            $models[$matches[1]] = true;
        }
        if (count($models) !== $ensemble['available_common_member_count']) {
            throw new RuntimeException('CMIP6 included and excluded model/member sets are incomplete.');
        }
        if (array_diff($ensemble['members'], array_keys($ensemble['baseline_means'])) !== []
            || array_diff(array_keys($ensemble['baseline_means']), $ensemble['members']) !== []) {
            throw new RuntimeException('The per-model 1850–1900 reference values are incomplete.');
        }
        foreach ($ensemble['baseline_means'] as $baseline) {
            if (!is_numeric($baseline) || !is_finite((float) $baseline)
                || (float) $baseline < -100 || (float) $baseline > 100) {
                throw new RuntimeException('A per-model 1850–1900 reference value is invalid.');
            }
        }

        self::validateEnsemblePoints($ensemble['historical'] ?? null, 1850, 2014, $ensemble['model_count']);
        foreach (['ssp126', 'ssp245', 'ssp370', 'ssp585'] as $scenario) {
            self::validateEnsemblePoints($ensemble['scenarios'][$scenario], 2015, 2100, $ensemble['model_count']);
        }
        return $ensemble;
    }

    /**
     * Calculates annual means only from twelve complete months.
     *
     * @param list<array{date: string, value: ?float}> $series
     * @return list<array{date: string, value: ?float}>
     */
    public static function annualMeans(array $series): array
    {
        $groups = [];
        foreach ($series as $point) {
            $groups[substr($point['date'], 0, 4)][] = $point['value'];
        }

        $annual = [];
        foreach ($groups as $year => $values) {
            $complete = count($values) === 12 && !in_array(null, $values, true);
            $annual[] = [
                'date' => (string) $year,
                'value' => $complete ? array_sum($values) / 12 : null,
            ];
        }
        return $annual;
    }

    /**
     * Validates sorted, contiguous monthly dates and numeric values.
     *
     * @param list<array{date: string, value: ?float}> $series
     * @return list<array{date: string, value: ?float}>
     */
    private static function validateMonthly(array $series): array
    {
        if ($series === []) {
            throw new RuntimeException('Data series is empty.');
        }

        $previous = null;
        foreach ($series as $point) {
            if (!preg_match('/^\d{4}-(0[1-9]|1[0-2])$/', $point['date'])) {
                throw new RuntimeException('Invalid month in data series.');
            }
            if ($previous !== null) {
                $expected = (new \DateTimeImmutable($previous . '-01', new \DateTimeZone('UTC')))
                    ->modify('+1 month')
                    ->format('Y-m');
                if ($point['date'] !== $expected) {
                    throw new RuntimeException('Duplicate or missing month in data series.');
                }
            }
            if ($point['value'] !== null && !is_finite($point['value'])) {
                throw new RuntimeException('Non-finite value in data series.');
            }
            $previous = $point['date'];
        }
        return $series;
    }

    /**
     * Requires a complete annual series with ordered empirical range values.
     *
     * @param mixed $points
     */
    private static function validateEnsemblePoints(mixed $points, int $firstYear, int $lastYear, int $members): void
    {
        if (!is_array($points) || count($points) !== $lastYear - $firstYear + 1) {
            throw new RuntimeException('CMIP6 ensemble year coverage is incomplete.');
        }
        foreach (array_values($points) as $index => $point) {
            $year = (string) ($firstYear + $index);
            if (!is_array($point)
                || ($point['date'] ?? null) !== $year
                || ($point['members'] ?? null) !== $members
                || !is_numeric($point['minimum'] ?? null)
                || !is_numeric($point['median'] ?? null)
                || !is_numeric($point['maximum'] ?? null)) {
                throw new RuntimeException('CMIP6 ensemble point is incomplete or out of order.');
            }
            $minimum = (float) $point['minimum'];
            $median = (float) $point['median'];
            $maximum = (float) $point['maximum'];
            if (!is_finite($minimum) || !is_finite($median) || !is_finite($maximum)
                || $minimum > $median || $median > $maximum) {
                throw new RuntimeException('CMIP6 ensemble minimum, median, and maximum are invalid.');
            }
        }
    }

    /**
     * Removes comments, blank lines, and a UTF-8 byte-order mark.
     *
     * @return list<string>
     */
    private static function sourceLines(string $text): array
    {
        $text = preg_replace('/^\xEF\xBB\xBF/', '', $text) ?? $text;
        return array_values(array_filter(
            preg_split('/\r\n|\n|\r/', trim($text)) ?: [],
            static fn (string $line): bool => trim($line) !== '' && !str_starts_with(trim($line), '#')
        ));
    }

    /**
     * Parses a finite numeric cell without accepting empty or sentinel values.
     */
    private static function number(string $value): float
    {
        $value = trim($value);
        if ($value === '' || !is_numeric($value)) {
            throw new RuntimeException('Non-numeric data cell encountered.');
        }
        $number = (float) $value;
        if (!is_finite($number)) {
            throw new RuntimeException('Non-finite data cell encountered.');
        }
        return $number;
    }

    /**
     * Parses an optional published value while keeping missing markers distinct from zero.
     */
    private static function optionalNumber(string $value): ?float
    {
        $value = trim($value);
        if ($value === '' || $value === '***') {
            return null;
        }
        return self::number($value);
    }

    /**
     * Converts a decimal year to its nearest Gregorian UTC calendar date.
     */
    private static function dateFromDecimalYear(float $value): string
    {
        $year = (int) floor($value);
        $start = new \DateTimeImmutable(sprintf('%04d-01-01', $year), new \DateTimeZone('UTC'));
        $days = $start->format('L') === '1' ? 366 : 365;
        $offset = min($days - 1, (int) round(($value - $year) * $days));
        return $start->modify('+' . $offset . ' days')->format('Y-m-d');
    }
}
