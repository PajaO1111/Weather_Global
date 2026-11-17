<?php
/* ====================================================
   READ-ONLY API
   Serves only the current, validated climate release.
   ==================================================== */
declare(strict_types=1);

namespace WeatherGlobal;

use RuntimeException;
use Throwable;

final readonly class ApiController
{
    /**
     * Creates the read-only controller for private release storage.
     */
    public function __construct(private string $storageDirectory)
    {
    }

    /**
     * Serves the sole allowlisted public dataset using an integrity-checked ETag.
     */
    public function serve(): void
    {
        header('Content-Type: application/json; charset=utf-8');
        header('X-Content-Type-Options: nosniff');
        header('Referrer-Policy: no-referrer');

        if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'GET' && ($_SERVER['REQUEST_METHOD'] ?? '') !== 'HEAD') {
            header('Allow: GET, HEAD');
            $this->respond(405, ['error' => 'Method not allowed.']);
            return;
        }
        if (($_GET['dataset'] ?? null) !== 'climate' || count($_GET) !== 1) {
            $this->respond(400, ['error' => 'Unknown dataset request.']);
            return;
        }

        try {
            $pointerPath = $this->storageDirectory . DIRECTORY_SEPARATOR . 'current.json';
            if (!is_file($pointerPath)) {
                throw new RuntimeException('No validated data release is available.');
            }
            $pointer = json_decode((string) file_get_contents($pointerPath), true, 512, JSON_THROW_ON_ERROR);
            $release = $pointer['release'] ?? '';
            $expectedHash = $pointer['climate_sha256'] ?? '';
            if (!is_string($release) || !preg_match('/^[a-f0-9]{64}$/', $release)
                || !is_string($expectedHash) || !preg_match('/^[a-f0-9]{64}$/', $expectedHash)) {
                throw new RuntimeException('The current data pointer is invalid.');
            }

            $dataPath = $this->storageDirectory . DIRECTORY_SEPARATOR . 'releases'
                . DIRECTORY_SEPARATOR . $release . DIRECTORY_SEPARATOR . 'climate.json';
            if (!is_file($dataPath) || !hash_equals($expectedHash, hash_file('sha256', $dataPath))) {
                throw new RuntimeException('The current data release failed its integrity check.');
            }
            $etag = '"' . $expectedHash . '"';
            header('ETag: ' . $etag);
            header('Cache-Control: public, max-age=3600, stale-while-revalidate=86400');
            if (trim((string) ($_SERVER['HTTP_IF_NONE_MATCH'] ?? '')) === $etag) {
                http_response_code(304);
                return;
            }
            http_response_code(200);
            if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'HEAD') {
                readfile($dataPath);
            }
        } catch (Throwable $error) {
            error_log('Weather Global API: ' . $error->getMessage());
            header('Cache-Control: no-store');
            $this->respond(503, ['error' => 'Validated climate data are temporarily unavailable.']);
        }
    }

    /**
     * Emits a bounded JSON error response.
     *
     * @param array{error: string} $body
     */
    private function respond(int $status, array $body): void
    {
        http_response_code($status);
        header('Cache-Control: no-store');
        echo json_encode($body, JSON_UNESCAPED_SLASHES);
    }
}
