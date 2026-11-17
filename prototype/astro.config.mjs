/* ====================================================
   ASTRO CONFIGURATION
   Builds a static site below the Weather Global URL prefix.
   ==================================================== */
import { defineConfig } from 'astro/config';
import { randomUUID } from 'node:crypto';
import { copyFile, readFile, readdir, rename, writeFile } from 'node:fs/promises';
import { basename, dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createEuropeMiddleware } from './scripts/europe-api.mjs';
import { createContinentsMiddleware } from './scripts/continents-api.mjs';
import { createHistoryComparisonMiddleware } from './scripts/history-comparison-api.mjs';
import { createSeaIceMiddleware } from './scripts/sea-ice-api.mjs';
import { createIceSheetMiddleware } from './scripts/ice-sheets-api.mjs';
import { createSnowMiddleware } from './scripts/snow-cover-api.mjs';
import { createPrecipitationMiddleware } from './scripts/precipitation-api.mjs';
import { createDroughtMiddleware } from './scripts/drought-api.mjs';
import { createAtmosphericGasesMiddleware } from './scripts/atmospheric-gases-api.mjs';
import { createCarbonBudgetMiddleware } from './scripts/carbon-budget-api.mjs';
import { packageHostingProducts } from './scripts/hosting-products.mjs';

const phpPort = process.env.WEATHER_GLOBAL_PHP_PORT ?? '8081';

async function lowercaseOutputFiles(directory) {
  const files = [];
  const allFiles = [];
  async function collect(currentDirectory) {
    for (const entry of await readdir(currentDirectory, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        if (entry.name !== entry.name.toLowerCase()) {
          throw new Error(`Build output directory must be lowercase for WEDOS: ${entry.name}`);
        }
        await collect(join(currentDirectory, entry.name));
      } else {
        const path = join(currentDirectory, entry.name);
        allFiles.push(path);
        if (entry.name !== entry.name.toLowerCase()) files.push(path);
      }
    }
  }
  await collect(directory);

  const names = new Set();
  for (const file of allFiles) {
    const relativeDestination = relative(directory, join(dirname(file), basename(file).toLowerCase())).split(sep).join('/').toLowerCase();
    if (names.has(relativeDestination)) {
      throw new Error(`Build output has a lowercase filename collision: ${relativeDestination}`);
    }
    names.add(relativeDestination);
  }

  const replacements = [];
  for (const file of files) {
    const relativeSource = relative(directory, file).split(sep).join('/');
    const destination = join(dirname(file), basename(file).toLowerCase());
    const relativeDestination = relative(directory, destination).split(sep).join('/');
    const temporary = join(dirname(file), `.wg-case-${randomUUID()}.tmp`);
    await rename(file, temporary);
    await rename(temporary, destination);
    replacements.push([relativeSource, relativeDestination]);
  }

  const textExtensions = new Set(['.html', '.js', '.css', '.json', '.txt', '.svg', '.xml', '.webmanifest', '.map']);
  for (const file of allFiles) {
    const extension = file.slice(file.lastIndexOf('.')).toLowerCase();
    if (!textExtensions.has(extension)) continue;
    let content = await readFile(file, 'utf8');
    for (const [source, destination] of replacements) {
      content = content.split(source).join(destination);
    }
    await writeFile(file, content);
  }
}

async function assertLowercaseDirectories(directory, relativeDirectory = '') {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (entry.name !== entry.name.toLowerCase()) {
        throw new Error(`Build output directory must be lowercase for WEDOS: ${relativeDirectory}${entry.name}`);
      }
      await assertLowercaseDirectories(join(directory, entry.name), `${relativeDirectory}${entry.name}/`);
    } else if (entry.name !== entry.name.toLowerCase()) {
      throw new Error(`Build output file must be lowercase for WEDOS: ${relativeDirectory}${entry.name}`);
    }
  }
}

export default defineConfig({
  base: '/weather_global/',
  outDir: './dist',
  output: 'static',
  trailingSlash: 'always',
  integrations: [{
    name: 'weather-global-php-endpoints',
    hooks: {
      'astro:build:done': async ({ dir }) => {
        await Promise.all(['api.php', 'cron.php'].map(file => copyFile(
          fileURLToPath(new URL(`./backend/public/${file}`, import.meta.url)),
          fileURLToPath(new URL(file, dir))
        )));
        await lowercaseOutputFiles(fileURLToPath(dir));
        await packageHostingProducts(fileURLToPath(dir));
        await assertLowercaseDirectories(fileURLToPath(dir));
      }
    }
  }],
  vite: {
    plugins: [
      {
        name: 'weather-global-local-drought-api',
        configureServer(server) {
          server.middlewares.use(createDroughtMiddleware({ logger: server.config.logger }));
        },
      },
      {
        name: 'weather-global-local-atmospheric-gases-api',
        configureServer(server) {
          server.middlewares.use(createAtmosphericGasesMiddleware({ logger: server.config.logger }));
        },
      },
      {
        name: 'weather-global-local-carbon-budget-api',
        configureServer(server) {
          server.middlewares.use(createCarbonBudgetMiddleware({ logger: server.config.logger }));
        },
      },
      {
        name: 'weather-global-local-precipitation-api',
        configureServer(server) {
          server.middlewares.use(createPrecipitationMiddleware({ logger: server.config.logger }));
        },
      },
      {
        name: 'weather-global-local-snow-cover-api',
        configureServer(server) {
          server.middlewares.use(createSnowMiddleware({ logger: server.config.logger }));
        },
      },
      {
        name: 'weather-global-local-ice-sheets-api',
        configureServer(server) {
          server.middlewares.use(createIceSheetMiddleware({ logger: server.config.logger }));
        },
      },
      {
        name: 'weather-global-local-sea-ice-api',
        configureServer(server) {
          server.middlewares.use(createSeaIceMiddleware({ logger: server.config.logger }));
        },
      },
      {
        name: 'weather-global-local-europe-api',
        configureServer(server) {
          server.middlewares.use(createEuropeMiddleware({ logger: server.config.logger }));
        },
      },
      {
        name: 'weather-global-local-continents-api',
        configureServer(server) {
          server.middlewares.use(createContinentsMiddleware({ logger: server.config.logger }));
        },
      },
      {
        name: 'weather-global-local-history-comparison-api',
        configureServer(server) {
          server.middlewares.use(createHistoryComparisonMiddleware({ logger: server.config.logger }));
        },
      },
    ],
    server: {
      proxy: {
        '/api.php': {
          target: `http://127.0.0.1:${phpPort}`,
          rewrite: path => path.replace(/\/$/, '')
        },
        '/cron.php': {
          target: `http://127.0.0.1:${phpPort}`,
          rewrite: path => path.replace(/\/$/, '')
        }
      }
    }
  }
});
