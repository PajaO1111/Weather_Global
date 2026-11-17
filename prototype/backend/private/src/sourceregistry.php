<?php
/* ====================================================
   SOURCE REGISTRY
   Pins approved upstream products and projection files.
   ==================================================== */
declare(strict_types=1);

namespace WeatherGlobal;

final class SourceRegistry
{
    public const IPCC_COMMIT = 'ed29da33d38ae767d19caafd4cde06042cbe00f4';

    /**
     * Pins the lossless, locally extracted global AR6 confidence-output artifact.
     */
    public static function seaLevelArtifact(): array
    {
        return [
            'id' => 'ipcc-ar6-global-sealevel',
            'file' => 'ar6_sealevel.json',
            'url' => 'https://zenodo.org/records/6382554',
            'sha256' => 'de236fb3c46a7f2ce1cb5ccff12b675b6a44e8c0beb840b92f1c5b84be2c55a2',
        ];
    }

    /**
     * Returns the checksum-pinned, locally pre-aggregated model ensemble.
     *
     * @return array{id: string, file: string, url: string, sha256: string, type: string}
     */
    public static function ensembleArtifact(): array
    {
        return [
            'id' => 'ipcc-cmip6-ensemble',
            'file' => 'ipcc_cmip6_ensemble.json',
            'url' => 'https://github.com/IPCC-WG1/Atlas/tree/'
                . self::IPCC_COMMIT . '/datasets-aggregated-regionally',
            'sha256' => '934953067c1ef203ded2cd2c9698f02b0aae66e87a285e422b2a77f08011cb2f',
            'type' => 'projection_ensemble',
        ];
    }

    /**
     * Returns the fixed, allowlisted input files for an import.
     *
     * @return list<array{id: string, file: string, url: string, sha256: ?string, type: string}>
     */
    public static function all(): array
    {
        $sources = [
            [
                'id' => 'co2',
                'file' => 'noaa_co2_mm_gl.csv',
                'url' => 'https://gml.noaa.gov/webdata/ccgg/trends/co2/co2_mm_gl.csv',
                'sha256' => null,
                'type' => 'co2',
            ],
            [
                'id' => 'temperature',
                'file' => 'nasa_gistemp_v4_global.csv',
                'url' => 'https://data.giss.nasa.gov/gistemp/tabledata_v4/GLB.Ts+dSST.csv',
                'sha256' => null,
                'type' => 'temperature',
            ],
            [
                'id' => 'roni',
                'file' => 'noaa_roni_ersstv6.txt',
                'url' => 'https://www.cpc.ncep.noaa.gov/data/indices/RONI.ascii.txt',
                'sha256' => null,
                'type' => 'roni',
            ],
        ];

        $sources = array_merge($sources, [
            [
                'id' => 'ocean-sst-hadsst4',
                'file' => 'hadsst4_global_monthly.csv',
                'url' => 'https://hadleyserver.metoffice.gov.uk/hadsst4/data/data/'
                    . 'HadSST.4.2.0.0_monthly_GLOBE.csv',
                'sha256' => null,
                'type' => 'ocean',
            ],
            [
                'id' => 'ocean-ohc-q1',
                'file' => 'noaa_ohc_0_2000m_q1.dat',
                'url' => 'https://www.ncei.noaa.gov/data/oceans/woa/DATA_ANALYSIS/'
                    . '3M_HEAT_CONTENT/DATA/basin/3month/h22-w0-2000m1-3.dat',
                'sha256' => null,
                'type' => 'ocean',
            ],
            [
                'id' => 'ocean-ohc-q2',
                'file' => 'noaa_ohc_0_2000m_q2.dat',
                'url' => 'https://www.ncei.noaa.gov/data/oceans/woa/DATA_ANALYSIS/'
                    . '3M_HEAT_CONTENT/DATA/basin/3month/h22-w0-2000m4-6.dat',
                'sha256' => null,
                'type' => 'ocean',
            ],
            [
                'id' => 'ocean-ohc-q3',
                'file' => 'noaa_ohc_0_2000m_q3.dat',
                'url' => 'https://www.ncei.noaa.gov/data/oceans/woa/DATA_ANALYSIS/'
                    . '3M_HEAT_CONTENT/DATA/basin/3month/h22-w0-2000m7-9.dat',
                'sha256' => null,
                'type' => 'ocean',
            ],
            [
                'id' => 'ocean-ohc-q4',
                'file' => 'noaa_ohc_0_2000m_q4.dat',
                'url' => 'https://www.ncei.noaa.gov/data/oceans/woa/DATA_ANALYSIS/'
                    . '3M_HEAT_CONTENT/DATA/basin/3month/h22-w0-2000m10-12.dat',
                'sha256' => null,
                'type' => 'ocean',
            ],
            [
                'id' => 'ocean-gmsl-noaa-lsa',
                'file' => 'noaa_gmsl_global_keep_reference.csv',
                'url' => 'https://www.star.nesdis.noaa.gov/socd/lsa/SeaLevelRise/'
                    . 'slr/slr_sla_gbl_keep_ref_90.csv',
                'sha256' => null,
                'type' => 'ocean',
            ],
            [
                'id' => 'ocean-gmsl-noaa-lsa-metadata',
                'file' => 'noaa_gmsl_global_keep_reference.nc',
                'url' => 'https://www.star.nesdis.noaa.gov/socd/lsa/SeaLevelRise/'
                    . 'slr/slr_sla_gbl_keep_ref_90.nc',
                'sha256' => null,
                'type' => 'ocean_metadata',
            ],
        ]);

        foreach (['ACCESS-CM2', 'ACCESS-ESM1-5'] as $model) {
            foreach (['historical', 'ssp126', 'ssp585'] as $experiment) {
                $file = "CMIP6_{$model}_{$experiment}_r1i1p1f1.csv";
                $sources[] = [
                    'id' => strtolower($model . '-' . $experiment),
                    'file' => $file,
                    'url' => 'https://raw.githubusercontent.com/IPCC-WG1/Atlas/'
                        . self::IPCC_COMMIT
                        . '/datasets-aggregated-regionally/data/CMIP6/CMIP6_tas_landsea/'
                        . rawurlencode($file),
                    'sha256' => self::projectionHash($file),
                    'type' => 'projection',
                ];
            }
        }

        return $sources;
    }

    /**
     * Returns the verified source cards for the historical ocean indicators.
     *
     * @return array<string, array<string, string>>
     */
    public static function oceanMetadata(): array
    {
        return [
            'sst' => [
                'provider' => 'Met Office Hadley Centre',
                'product' => 'HadSST.4.2.0.0 monthly global time series',
                'version' => 'HadSST.4.2.0.0',
                'unit' => '°C anomaly',
                'baseline' => '1961–1990',
                'geography' => 'Global ocean, 90°S–90°N (GLOBE)',
                'cadence' => 'Monthly',
                'citation' => 'Met Office Hadley Centre. HadSST.4.2.0.0, monthly GLOBE time series.',
                'license' => 'Open Government Licence v3',
                'license_url' => 'https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/',
                'data_url' => 'https://hadleyserver.metoffice.gov.uk/hadsst4/data/data/'
                    . 'HadSST.4.2.0.0_monthly_GLOBE.csv',
                'documentation_url' => 'https://hadleyserver.metoffice.gov.uk/hadsst4/data/download.html',
                'uncertainty' => 'Source columns include total and component uncertainties; no interval is drawn.',
            ],
            'ohc' => [
                'provider' => 'NOAA National Centers for Environmental Information',
                'product' => 'Global Ocean Heat Content CDR, 0–2000 m, quarterly world-ocean time series',
                'version' => 'Current NCEI portal files; no numbered version is assigned in the data files.',
                'unit' => 'ZJ (converted from 10²² J; 1 source unit = 10 ZJ)',
                'source_unit' => '10²² J',
                'baseline' => 'Source-defined heat-content anomaly; the downloaded time-series files state no calendar reference period. Values are not rebased.',
                'geography' => 'World ocean, integrated from 0 to 2000 m',
                'cadence' => 'Three-month periods, Q1–Q4; no monthly interpolation.',
                'citation' => 'NOAA National Centers for Environmental Information. Global Ocean Heat Content CDR, 0–2000 m basin time series.',
                'license' => 'NOAA public data; product page requests citation/attribution.',
                'license_url' => 'https://www.ncei.noaa.gov/products/climate-data-records/global-ocean-heat-content',
                'data_url' => 'https://www.ncei.noaa.gov/access/global-ocean-heat-content/basin_heat_data.html',
                'documentation_url' => 'https://www.ncei.noaa.gov/products/climate-data-records/global-ocean-heat-content',
                'uncertainty' => 'The provider publishes standard error in source units; this is not a probability interval.',
            ],
            'gmsl' => [
                'provider' => 'NOAA Laboratory for Satellite Altimetry',
                'product' => 'Global mean sea-level anomaly, reference-mission track, annual signal retained',
                'version' => 'RADS 4.7.1 (source NetCDF metadata)',
                'unit' => 'mm sea-level anomaly',
                'baseline' => 'Product-defined anomaly reference; no calendar reference period is stated in the downloaded files.',
                'geography' => 'Global ocean altimetry between 66°S and 66°N',
                'cadence' => 'Irregular source timestamps, approximately one reference-mission repeat cycle; not monthly.',
                'citation' => 'Altimetry data are provided by NOAA Laboratory for Satellite Altimetry.',
                'license' => 'NOAA LSA requests attribution; no separate license is stated in the source files.',
                'license_url' => 'https://www.star.nesdis.noaa.gov/socd/lsa/SeaLevelRise/LSA_SLR_timeseries_global.php',
                'data_url' => 'https://www.star.nesdis.noaa.gov/socd/lsa/SeaLevelRise/'
                    . 'slr/slr_sla_gbl_keep_ref_90.csv',
                'documentation_url' => 'https://www.star.nesdis.noaa.gov/socd/lsa/SeaLevelRise/LSA_SLR_timeseries_global.php',
                'uncertainty' => 'No uncertainty column is published in this time-series file.',
                'corrections' => 'Inverted-barometer correction applied; annual signal retained; no GIA correction.',
                'source_generated_at' => 'Read from the companion NetCDF history attribute.',
            ],
        ];
    }

    /**
     * Returns a fixed digest for an immutable IPCC Atlas file.
     */
    private static function projectionHash(string $file): string
    {
        return match ($file) {
            'CMIP6_ACCESS-CM2_historical_r1i1p1f1.csv' =>
                'ad13196b1dc1e8617ce53297433ca8d11ac673f4ea408a532352cdb4e50623b8',
            'CMIP6_ACCESS-CM2_ssp126_r1i1p1f1.csv' =>
                '6105d11679733e051b45c208f74b45a0ff65de86355c07139b1ed9840cd400af',
            'CMIP6_ACCESS-CM2_ssp585_r1i1p1f1.csv' =>
                '074bb753ce483a908b75e0882917db4088c076a606b1bffc9f9f0c491d1ac18d',
            'CMIP6_ACCESS-ESM1-5_historical_r1i1p1f1.csv' =>
                '7a52add638006ccdcdfaae6c4076206141f0425ce457f84edce2dd4b1ffe872e',
            'CMIP6_ACCESS-ESM1-5_ssp126_r1i1p1f1.csv' =>
                '17887cc5fe6fc981a3162b2559d25091e159abe8f2d0db62d202f5d5e1ab1681',
            'CMIP6_ACCESS-ESM1-5_ssp585_r1i1p1f1.csv' =>
                '84dca98325ec1cbd8efe7ced3505f0e5f41a8d6e8d903c8be3ee2bb2abe70a3f',
            default => throw new \InvalidArgumentException('Unknown pinned projection file.'),
        };
    }
}
