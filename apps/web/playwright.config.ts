import { defineConfig } from '@playwright/test';

// Keep the browser test isolated from a developer's normal API/web processes.
// The caller must provide a disposable *_test DATABASE_URL and a test Redis DB.
const apiPort = Number(process.env.TEST_API_PORT ?? 3001);
const webPort = Number(process.env.TEST_WEB_PORT ?? 5174);
const apiOrigin = `http://localhost:${apiPort}`;
const webOrigin = `http://localhost:${webPort}`;
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl || !new URL(databaseUrl).pathname.endsWith('_test')) {
  throw new Error('Playwright requires DATABASE_URL to point to a disposable database ending in _test.');
}
const redisUrl = process.env.REDIS_URL;
const redisDatabase = redisUrl ? new URL(redisUrl).pathname.slice(1) : '';
if (!/^\d+$/.test(redisDatabase) || Number(redisDatabase) === 0) {
  throw new Error('Playwright requires REDIS_URL to select a nonzero, isolated logical database.');
}

export default defineConfig({
  testDir: './tests',
  outputDir:'test-results/'+(process.env.UI_BROWSER??'chromium'),
  testMatch:'**/*.spec.ts',
  fullyParallel: false,
  workers:1,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL: webOrigin,
    ...(process.env.UI_BROWSER_WS?{connectOptions:{wsEndpoint:process.env.UI_BROWSER_WS,exposeNetwork:'<loopback>'}}:{}),
    browserName: process.env.UI_BROWSER==='firefox'?'firefox':process.env.UI_BROWSER==='webkit'?'webkit':'chromium',
    trace: 'retain-on-failure'
  },
  webServer: [
    {
      command: `PORT=${apiPort} PUBLIC_APP_URL=${webOrigin} BETTER_AUTH_URL=${webOrigin} WEB_ORIGIN=${webOrigin} bun --env-file=../../.env --hot ../api/src/dev.ts`,
      url: `${apiOrigin}/api/health`,
      reuseExistingServer: process.env.UI_REUSE_SERVERS === '1',
      timeout: 30_000
    },
    {
      command: `CAPY_VITE_CACHE_DIR=/tmp/capybudget-playwright-vite-${process.pid} PUBLIC_API_URL=${webOrigin} API_INTERNAL_URL=${apiOrigin} PUBLIC_APP_URL=${webOrigin} BETTER_AUTH_URL=${webOrigin} WEB_ORIGIN=${webOrigin} bun --env-file=../../.env run vite ${process.env.UI_PRODUCTION === '1' ? 'preview' : 'dev'} --host 127.0.0.1 --port ${webPort}`,
      url: `${webOrigin}/login`,
      reuseExistingServer: process.env.UI_REUSE_SERVERS === '1',
      timeout: 60_000
    }
  ]
});
