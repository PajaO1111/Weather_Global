<?php
/* ====================================================
   CLIMATE API ENTRY POINT
   Exposes only the validated current climate dataset.
   ==================================================== */
declare(strict_types=1);

use WeatherGlobal\ApiController;
use WeatherGlobal\Configuration;

try {
    $privateDirectory = getenv('WEATHER_GLOBAL_PRIVATE_DIR')
        ?: dirname(__DIR__, 2) . DIRECTORY_SEPARATOR . 'weather_global-private';
    require_once $privateDirectory . DIRECTORY_SEPARATOR . 'src' . DIRECTORY_SEPARATOR . 'bootstrap.php';
    $configuration = Configuration::load($privateDirectory, __DIR__);
    (new ApiController($configuration->storageDirectory))->serve();
} catch (Throwable $error) {
    error_log('Weather Global API bootstrap: ' . $error->getMessage());
    http_response_code(503);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    header('X-Content-Type-Options: nosniff');
    echo json_encode(['error' => 'The climate API is not configured.'], JSON_UNESCAPED_SLASHES);
}
