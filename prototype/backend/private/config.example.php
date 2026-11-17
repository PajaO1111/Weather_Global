<?php
/* ====================================================
   PRIVATE CONFIGURATION TEMPLATE
   Copy outside the public directory and set a new token.
   ==================================================== */
declare(strict_types=1);

return [
    'storage_directory' => __DIR__ . DIRECTORY_SEPARATOR . 'storage',
    'cron_token' => '',
    'minimum_import_interval' => 86400,
    'http_timeout_seconds' => 8,
];
