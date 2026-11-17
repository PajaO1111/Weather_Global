<?php
/* ====================================================
   CONFIGURATION
   Loads deployment settings from a private PHP file.
   ==================================================== */
declare(strict_types=1);

namespace WeatherGlobal;

use RuntimeException;

final readonly class Configuration
{
    /**
     * Creates validated runtime settings.
     */
    private function __construct(
        public string $storageDirectory,
        public string $cronToken,
        public int $minimumImportInterval,
        public int $httpTimeoutSeconds
    ) {
    }

    /**
     * Loads settings from an explicitly private file.
     */
    public static function load(string $privateDirectory, ?string $publicDirectory = null): self
    {
        $path = getenv('WEATHER_GLOBAL_CONFIG') ?: $privateDirectory . DIRECTORY_SEPARATOR . 'config.php';
        $resolvedPath = realpath($path);
        if (!is_file($path) || !is_readable($path) || $resolvedPath === false) {
            throw new RuntimeException('Private Weather Global configuration is missing or unreadable.');
        }
        if ($publicDirectory !== null
            && (self::isWithinDirectory($path, $publicDirectory)
                || self::isWithinDirectory($resolvedPath, $publicDirectory))) {
            throw new RuntimeException('Weather Global configuration must be outside the public directory.');
        }

        $settings = require $resolvedPath;
        if (!is_array($settings)) {
            throw new RuntimeException('Private Weather Global configuration must return an array.');
        }

        $storage = $settings['storage_directory'] ?? null;
        $token = $settings['cron_token'] ?? null;
        $interval = $settings['minimum_import_interval'] ?? null;
        $timeout = $settings['http_timeout_seconds'] ?? null;

        if (!is_string($storage) || $storage === '' || !self::isAbsolutePath($storage)) {
            throw new RuntimeException('storage_directory must be an absolute private path.');
        }
        if ($publicDirectory !== null
            && (self::isWithinDirectory($storage, $publicDirectory)
                || (realpath($storage) !== false && self::isWithinDirectory((string) realpath($storage), $publicDirectory)))) {
            throw new RuntimeException('Weather Global storage must be outside the public directory.');
        }
        if (!is_string($token)) {
            throw new RuntimeException('cron_token must be a string.');
        }
        if (!is_int($interval) || $interval < 3600 || $interval > 604800) {
            throw new RuntimeException('minimum_import_interval must be between 3600 and 604800 seconds.');
        }
        if (!is_int($timeout) || $timeout < 2 || $timeout > 20) {
            throw new RuntimeException('http_timeout_seconds must be between 2 and 20 seconds.');
        }

        return new self($storage, $token, $interval, $timeout);
    }

    /**
     * Detects absolute paths on Windows and POSIX hosts.
     */
    private static function isAbsolutePath(string $path): bool
    {
        return str_starts_with($path, DIRECTORY_SEPARATOR)
            || preg_match('/^[A-Za-z]:[\\\\\/]/', $path) === 1;
    }

    /**
     * Checks both a directory itself and its descendants across Windows and POSIX paths.
     */
    private static function isWithinDirectory(string $path, string $directory): bool
    {
        $root = realpath($directory);
        if ($root === false) {
            throw new RuntimeException('The public directory cannot be resolved.');
        }
        $normalizedPath = rtrim(str_replace('\\', '/', $path), '/');
        $normalizedRoot = rtrim(str_replace('\\', '/', $root), '/');
        if (DIRECTORY_SEPARATOR === '\\') {
            $normalizedPath = strtolower($normalizedPath);
            $normalizedRoot = strtolower($normalizedRoot);
        }
        return $normalizedPath === $normalizedRoot
            || str_starts_with($normalizedPath, $normalizedRoot . '/');
    }
}
