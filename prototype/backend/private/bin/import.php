<?php
/* ====================================================
   IMPORT COMMAND
   Supports scheduled HTTPS imports and verified local archives.
   ==================================================== */
declare(strict_types=1);

use WeatherGlobal\Configuration;
use function WeatherGlobal\importer;
use function WeatherGlobal\privateDirectory;

require_once dirname(__DIR__) . DIRECTORY_SEPARATOR . 'src' . DIRECTORY_SEPARATOR . 'bootstrap.php';

try {
    $privateDirectory = privateDirectory();
    $configuration = Configuration::load($privateDirectory);
    $fromSnapshot = in_array('--from-snapshot', $argv, true);
    $force = in_array('--force', $argv, true);
    foreach (array_slice($argv, 1) as $argument) {
        if (!in_array($argument, ['--from-snapshot', '--force'], true)) {
            throw new InvalidArgumentException('Supported options are --from-snapshot and --force.');
        }
    }

    $archive = $fromSnapshot
        ? dirname(__DIR__, 4) . DIRECTORY_SEPARATOR . 'data_samples'
            . DIRECTORY_SEPARATOR . '2026-11-04'
        : null;
    $result = importer($configuration)->run($force, $archive);
    fwrite(STDOUT, json_encode($result, JSON_THROW_ON_ERROR | JSON_UNESCAPED_SLASHES) . PHP_EOL);
} catch (Throwable $error) {
    fwrite(STDERR, 'Weather Global import failed: ' . $error->getMessage() . PHP_EOL);
    exit(1);
}
