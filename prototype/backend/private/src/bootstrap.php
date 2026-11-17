<?php
/* ====================================================
   APPLICATION BOOTSTRAP
   Resolves private paths and wires shared services.
   ==================================================== */
declare(strict_types=1);

namespace WeatherGlobal;

use RuntimeException;

require_once __DIR__ . '/configuration.php';
require_once __DIR__ . '/dataparser.php';
require_once __DIR__ . '/httpclient.php';
require_once __DIR__ . '/importservice.php';
require_once __DIR__ . '/sourceregistry.php';
require_once __DIR__ . '/apicontroller.php';
require_once __DIR__ . '/croncontroller.php';

/**
 * Resolves the external private directory without exposing a config fallback.
 */
function privateDirectory(): string
{
    $directory = getenv('WEATHER_GLOBAL_PRIVATE_DIR')
        ?: dirname(__DIR__);
    if (!is_dir($directory)) {
        throw new RuntimeException('Private Weather Global application directory is missing.');
    }
    return $directory;
}

/**
 * Loads runtime settings and creates an importer.
 */
function importer(Configuration $configuration): ImportService
{
    return new ImportService(
        $configuration->storageDirectory,
        new CurlHttpClient(),
        $configuration->minimumImportInterval,
        $configuration->httpTimeoutSeconds
    );
}
