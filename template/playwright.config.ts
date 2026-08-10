import "dotenv/config";
import { defineConfig, devices } from "@playwright/test";

const DEMO_SERVER_PORT = process.env.QAF_DEMO_SERVER_PORT ?? "4319";
const DEFAULT_BASE_URL = `http://localhost:${DEMO_SERVER_PORT}`;

/**
 * Every browser/device project is doubled: the default runs everything
 * EXCEPT `@quarantined`-tagged tests (blocking); a `-quarantine` twin runs
 * ONLY `@quarantined` tests with more retries and `continue-on-error` in CI
 * (non-blocking). See docs/quarantine.md for the full mechanism — the
 * `quarantine-manifest.json` ceiling is enforced separately via
 * `qaf-check-quarantine` (npm run check-quarantine), not by Playwright itself.
 */
export default defineConfig({
  testDir: "./tests",
  globalSetup: "./global-setup.ts",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? undefined : "50%",
  shard: process.env.QAF_SHARD_TOTAL
    ? { current: Number(process.env.QAF_SHARD_INDEX ?? 1), total: Number(process.env.QAF_SHARD_TOTAL) }
    : undefined,
  reporter: [
    ["list"],
    ["html", { open: "never" }],
    ...(process.env.CI ? ([["blob"]] as const) : ([] as const)),
    ["@qaf/core/reporter"],
  ],
  // Starts the dependency-free demo server (tests/fixtures/server) so the example
  // suite runs standalone. Point APP_BASE_URL/API_BASE_URL at your real app and
  // delete this block once you're testing something other than the examples.
  webServer: {
    command: `node tests/fixtures/server/index.mjs`,
    url: `${DEFAULT_BASE_URL}/health`,
    reuseExistingServer: !process.env.CI,
    env: { QAF_DEMO_SERVER_PORT: DEMO_SERVER_PORT },
  },
  use: {
    baseURL: process.env.APP_BASE_URL ?? DEFAULT_BASE_URL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  projects: [
    // `visual/` and `a11y/` are separate projects below (their own job/workflow,
    // never blocking) — the main browser projects explicitly skip those folders
    // rather than relying on skip-at-runtime, so a plain `pnpm test` never
    // depends on a visual baseline existing.
    {
      name: "chromium",
      grepInvert: /@quarantined/,
      testDir: "./tests/web",
      testIgnore: ["**/visual/**", "**/a11y/**"],
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "chromium-quarantine",
      grep: /@quarantined/,
      testDir: "./tests/web",
      testIgnore: ["**/visual/**", "**/a11y/**"],
      retries: 5,
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "firefox",
      grepInvert: /@quarantined/,
      testDir: "./tests/web",
      testIgnore: ["**/visual/**", "**/a11y/**"],
      use: { ...devices["Desktop Firefox"] },
    },
    {
      name: "webkit",
      grepInvert: /@quarantined/,
      testDir: "./tests/web",
      testIgnore: ["**/visual/**", "**/a11y/**"],
      use: { ...devices["Desktop Safari"] },
    },
    {
      name: "mobile-chrome",
      grepInvert: /@quarantined/,
      testDir: "./tests/mobile",
      use: { ...devices["Pixel 7"] },
    },
    {
      name: "mobile-safari",
      grepInvert: /@quarantined/,
      testDir: "./tests/mobile",
      use: { ...devices["iPhone 14"] },
    },
    {
      name: "api",
      grepInvert: /@quarantined/,
      testDir: "./tests/api",
      use: { baseURL: process.env.API_BASE_URL ?? DEFAULT_BASE_URL },
    },
    // Not part of the `chromium/firefox/webkit/...` matrix — run explicitly via
    // `pnpm test:visual` / CI's visual.yml. First run needs `test:visual:update`
    // to generate baselines (docs/visual-testing.md).
    {
      name: "visual",
      testDir: "./tests/web/visual",
      use: { ...devices["Desktop Chrome"] },
    },
    // Not part of the default matrix either — run via `pnpm test:a11y` / CI's a11y.yml.
    {
      name: "a11y",
      testDir: "./tests/web/a11y",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
