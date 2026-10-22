import { defineConfig, devices } from '@playwright/test';
import { fileURLToPath } from 'node:url';

const PORT = Number(process.env.E2E_PORT ?? 18080);
/** Locally the installed Microsoft Edge; in CI the Playwright Chromium (PW_BROWSER=chromium). */
const browser = process.env.PW_BROWSER ?? 'msedge';
const project =
  browser === 'chromium'
    ? { name: 'chromium', use: { ...devices['Desktop Chrome'] } }
    : { name: 'msedge', use: { ...devices['Desktop Edge'], channel: 'msedge' } };

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : [['list']],
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    viewport: { width: 1440, height: 1000 },
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [project],
  webServer: {
    // the production bundle: API + static web, in-memory store
    command: 'node ../apps/api/dist/server.js',
    url: `http://127.0.0.1:${PORT}/healthz`,
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
    env: {
      PORT: String(PORT),
      HOST: '127.0.0.1',
      STATIC_DIR: fileURLToPath(new URL('../apps/web/dist', import.meta.url)),
      LOG_LEVEL: 'warn',
      RATE_LIMIT_MAX: '1000',
    },
  },
});
