import { defineConfig, devices } from '@playwright/test';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';

// A fresh database per run keeps QA separate from the development preview and hospital data.
const databaseDirectory =
  process.env.MEDICARE_E2E_DIRECTORY ?? mkdtempSync(join(tmpdir(), 'medicare-e2e-'));
process.env.MEDICARE_E2E_DIRECTORY = databaseDirectory;
process.env.MEDICARE_E2E_RUN_ID ??= randomUUID();
const origin = 'http://127.0.0.1:5174';

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  workers: 3,
  reporter: [['list'], ['./tests/cleanup-reporter.ts']],
  use: { baseURL: origin, channel: 'chrome', trace: 'retain-on-failure' },
  projects: [
    {
      name: 'desktop',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 1000 } },
    },
    {
      name: 'mobile',
      testIgnore: '**/connected.spec.ts',
      use: { ...devices['Pixel 7'], defaultBrowserType: 'chromium' },
    },
  ],
  webServer: [
    {
      command: 'node tests/api-server.mjs',
      url: 'http://127.0.0.1:3002/api/health',
      reuseExistingServer: false,
      env: {
        HOST: '127.0.0.1',
        PORT: '3002',
        APP_ORIGIN: origin,
        MEDICARE_DB_PATH: join(databaseDirectory, 'medicare.sqlite'),
        MEDICARE_E2E_DIRECTORY: databaseDirectory,
        MEDICARE_E2E_RUN_ID: process.env.MEDICARE_E2E_RUN_ID,
        MEDICARE_SECURE_COOKIES: 'false',
      },
    },
    {
      command: 'npm run dev:frontend -- --port 5174 --strictPort',
      url: origin,
      reuseExistingServer: false,
      env: { MEDICARE_API_URL: 'http://127.0.0.1:3002' },
    },
  ],
});
