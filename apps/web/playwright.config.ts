import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/auth',
  fullyParallel: false,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL: 'http://localhost:5173',
    browserName: 'chromium',
    trace: 'retain-on-failure'
  },
  webServer: [
    {
      command: 'bun --env-file=../../.env --hot ../api/src/server.ts',
      url: 'http://localhost:3000/api/health',
      reuseExistingServer: !process.env.CI,
      timeout: 30_000
    },
    {
      command: 'bun --env-file=../../.env --hot ../api/src/email/worker.ts',
      url: 'http://localhost:8025/api/v1/info',
      reuseExistingServer: !process.env.CI,
      timeout: 30_000
    },
    {
      command: 'bun --env-file=../../.env run vite dev --host 127.0.0.1 --port 5173',
      url: 'http://localhost:5173/login',
      reuseExistingServer: !process.env.CI,
      timeout: 60_000
    }
  ]
});
