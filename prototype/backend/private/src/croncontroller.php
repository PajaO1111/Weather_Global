<?php
/* ====================================================
   CRON CONTROLLER
   Keeps the authenticated scheduled importer inactive by default.
   ==================================================== */
declare(strict_types=1);

namespace WeatherGlobal;

use RuntimeException;
use Throwable;

final readonly class CronController
{
    /**
     * Creates the scheduled import endpoint.
     */
    public function __construct(
        private Configuration $configuration,
        private ImportService $importService
    ) {
    }

    /**
     * Accepts only an explicitly configured token and never exposes it in output.
     */
    public function run(): void
    {
        header('Content-Type: application/json; charset=utf-8');
        header('Cache-Control: no-store');
        header('X-Content-Type-Options: nosniff');
        header('Referrer-Policy: no-referrer');

        if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'GET') {
            header('Allow: GET');
            $this->respond(405, ['status' => 'error', 'message' => 'Method not allowed.']);
            return;
        }
        if (strlen($this->configuration->cronToken) < 32) {
            $this->respond(503, ['status' => 'inactive', 'message' => 'Cron endpoint is not configured.']);
            return;
        }

        $provided = $_SERVER['HTTP_AUTHORIZATION'] ?? '';
        if (preg_match('/^Bearer ([A-Za-z0-9._~-]{32,})$/', $provided, $matches) === 1) {
            $provided = $matches[1];
        } else {
            $provided = is_string($_GET['token'] ?? null) ? $_GET['token'] : '';
        }
        if (!hash_equals($this->configuration->cronToken, $provided)) {
            $this->respond(403, ['status' => 'error', 'message' => 'Forbidden.']);
            return;
        }
        if (count($_GET) > 1 || (isset($_GET['token']) && !is_string($_GET['token']))) {
            $this->respond(400, ['status' => 'error', 'message' => 'Invalid request parameters.']);
            return;
        }

        try {
            $result = $this->importService->run();
            $this->respond(200, $result);
        } catch (Throwable $error) {
            error_log('Weather Global cron: ' . $error->getMessage());
            $this->respond(503, ['status' => 'error', 'message' => 'Import failed; the previous release was retained.']);
        }
    }

    /**
     * Emits a JSON response without including request credentials.
     *
     * @param array<string, string|null> $body
     */
    private function respond(int $status, array $body): void
    {
        http_response_code($status);
        echo json_encode($body, JSON_UNESCAPED_SLASHES);
    }
}
