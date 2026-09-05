import { defineConfig, devices } from "@playwright/test"

/**
 * End-to-end configuration for the Test Definition lifecycle.
 *
 * Two local servers are started for the run and torn down with it: an in-memory
 * engine double on 8099 and the dashboard's own dev server on 3100, built against
 * that address. Nothing reaches a deployed environment — `VITE_API_BASE_URL` is
 * pinned to loopback here, and the spec fails if the app ever calls elsewhere.
 *
 * The dev server runs on a port of its own so a developer's `pnpm dev` on 3000 is
 * left alone (`strictPort` is on, so sharing it would fail the run).
 */
const DASHBOARD_PORT = 3100
const ENGINE_PORT = 8099
const DASHBOARD_URL = `http://127.0.0.1:${DASHBOARD_PORT}`
const ENGINE_URL = `http://127.0.0.1:${ENGINE_PORT}`

export default defineConfig({
  testDir: "./tests/e2e",
  // Deterministic by construction: no retries, and one worker so the shared
  // in-memory engine is never driven by two specs at once.
  retries: 0,
  workers: 1,
  fullyParallel: false,
  forbidOnly: true,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: [["list"]],
  use: {
    baseURL: DASHBOARD_URL,
    // No screenshots, videos or traces: this repository does not version test
    // artifacts, and a failing run reports through the console instead.
    screenshot: "off",
    video: "off",
    trace: "off",
    ...devices["Desktop Chrome"],
  },
  webServer: [
    {
      command: "node tests/e2e/mock-engine.mjs",
      url: `${ENGINE_URL}/__test__/health`,
      reuseExistingServer: false,
      timeout: 30_000,
      env: {
        MOCK_ENGINE_PORT: String(ENGINE_PORT),
        MOCK_ENGINE_ALLOW_ORIGIN: DASHBOARD_URL,
      },
    },
    {
      command: "npm run dev",
      url: DASHBOARD_URL,
      reuseExistingServer: false,
      timeout: 120_000,
      env: {
        PORT: String(DASHBOARD_PORT),
        VITE_API_BASE_URL: ENGINE_URL,
      },
    },
  ],
})
