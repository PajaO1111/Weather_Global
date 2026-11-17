<?php
/* ====================================================
   SCHEDULED IMPORT ENTRY POINT
   Runs only after an operator configures a private token.
   ==================================================== */
declare(strict_types=1);

use WeatherGlobal\Configuration;
use WeatherGlobal\CronController;
use function WeatherGlobal\importer;

try {
    $privateDirectory = getenv('WEATHER_GLOBAL_PRIVATE_DIR')
        ?: dirname(__DIR__, 2) . DIRECTORY_SEPARATOR . 'weather_global-private';
    require_once $privateDirectory . DIRECTORY_SEPARATOR . 'src' . DIRECTORY_SEPARATOR . 'bootstrap.php';
    $configuration = Configuration::load($privateDirectory, __DIR__);
    (new CronController($configuration, importer($configuration)))->run();
} catch (Throwable $error) {
    error_log('Weather Global cron bootstrap: ' . $error->getMessage());
    http_response_code(503);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    header('X-Content-Type-Options: nosniff');
    header('Referrer-Policy: no-referrer');
    echo json_encode(['status' => 'inactive', 'message' => 'The cron endpoint is not configured.'], JSON_UNESCAPED_SLASHES);
}
