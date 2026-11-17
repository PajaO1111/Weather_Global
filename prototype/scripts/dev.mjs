/* ====================================================
   LOCAL DEVELOPMENT SERVER
   Starts PHP for the API and Astro for the static frontend.
   ==================================================== */
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const privateDirectory = resolve(root, 'backend/private');
const configFile = process.env.WEATHER_GLOBAL_CONFIG ?? resolve(privateDirectory, 'config.example.php');
const phpPort = process.env.WEATHER_GLOBAL_PHP_PORT ?? '8081';
const webPort = process.env.PORT ?? '4174';
const environment = {
  ...process.env,
  WEATHER_GLOBAL_PRIVATE_DIR: privateDirectory,
  WEATHER_GLOBAL_CONFIG: configFile,
  WEATHER_GLOBAL_PHP_PORT: phpPort
};

function run(command, args) {
  return new Promise((resolveExit, reject) => {
    const child = spawn(command, args, { cwd: root, env: environment, stdio: 'inherit' });
    child.once('error', reject);
    child.once('exit', code => code === 0 ? resolveExit() : reject(new Error(`${command} exited with ${code}`)));
  });
}

if (!existsSync(resolve(privateDirectory, 'storage/current.json'))) {
  await run('php', ['backend/private/bin/import.php', '--from-snapshot', '--force']);
}

const php = spawn('php', ['-S', `127.0.0.1:${phpPort}`, '-t', 'backend/public'], {
  cwd: root, env: environment, stdio: 'inherit'
});
const astro = spawn(process.execPath, [
  resolve(root, 'node_modules/astro/bin/astro.mjs'),
  'dev',
  '--host',
  '127.0.0.1',
  '--port',
  webPort
], { cwd: root, env: environment, stdio: 'inherit' });

function stopServers() {
  if (!php.killed) php.kill();
  if (!astro.killed) astro.kill();
}

process.once('SIGINT', stopServers);
process.once('SIGTERM', stopServers);
php.once('exit', code => {
  if (code !== 0 && code !== null) process.exitCode = code;
  stopServers();
});
astro.once('exit', code => {
  if (code !== 0 && code !== null) process.exitCode = code;
  stopServers();
});
