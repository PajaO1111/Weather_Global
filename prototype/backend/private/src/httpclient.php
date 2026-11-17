<?php
/* ====================================================
   HTTP CLIENT
   Downloads allowlisted data with bounded TLS requests.
   ==================================================== */
declare(strict_types=1);

namespace WeatherGlobal;

use RuntimeException;

interface HttpClient
{
    /**
     * Fetches one fixed upstream URL with a strict response-size limit.
     */
    public function get(string $url, int $timeoutSeconds, int $maximumBytes): string;
}

final class CurlHttpClient implements HttpClient
{
    /**
     * Fetches an HTTPS resource without following redirects.
     */
    public function get(string $url, int $timeoutSeconds, int $maximumBytes): string
    {
        if (!function_exists('curl_init')) {
            throw new RuntimeException('The PHP cURL extension is required for imports.');
        }
        if (parse_url($url, PHP_URL_SCHEME) !== 'https') {
            throw new RuntimeException('Only HTTPS upstream sources are allowed.');
        }

        $handle = curl_init($url);
        if ($handle === false) {
            throw new RuntimeException('Unable to initialize the HTTPS request.');
        }

        $body = '';
        curl_setopt_array($handle, [
            CURLOPT_RETURNTRANSFER => false,
            CURLOPT_FOLLOWLOCATION => false,
            CURLOPT_CONNECTTIMEOUT => min(5, $timeoutSeconds),
            CURLOPT_TIMEOUT => $timeoutSeconds,
            CURLOPT_SSL_VERIFYPEER => true,
            CURLOPT_SSL_VERIFYHOST => 2,
            CURLOPT_PROTOCOLS => CURLPROTO_HTTPS,
            CURLOPT_USERAGENT => 'WeatherGlobal/1.0 (scheduled data importer)',
            CURLOPT_WRITEFUNCTION => static function ($curl, string $chunk) use (&$body, $maximumBytes): int {
                if (strlen($body) + strlen($chunk) > $maximumBytes) {
                    return 0;
                }
                $body .= $chunk;
                return strlen($chunk);
            },
        ]);
        $success = curl_exec($handle);
        $status = (int) curl_getinfo($handle, CURLINFO_RESPONSE_CODE);
        $error = curl_error($handle);
        curl_close($handle);

        if ($success === false) {
            throw new RuntimeException($error === '' ? 'Upstream download failed.' : 'Upstream download failed: ' . $error);
        }
        if ($status !== 200 || $body === '') {
            throw new RuntimeException(sprintf('Upstream returned HTTP %d or an empty response.', $status));
        }
        return $body;
    }
}
