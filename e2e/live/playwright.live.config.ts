import { defineConfig } from "@playwright/test"

/**
 * REAL-STACK integration configuration — OPT-IN ONLY.
 *
 * This config is never picked up by `npm test` or `npm run test:e2e`. It is run
 * exclusively through the documented opt-in command:
 *
 *   ASSUREDIA_BACKEND_DIR="<engine repository>" npm run test:live
 *
 * The orchestrator (e2e/live/real-stack.mjs) starts and tears down the entire
 * local stack and sets LIVE_STACK_READY. Refusing to run without it prevents an
 * accidental Docker/Java/Chromium start from a stray `playwright test`.
 */
if (process.env.LIVE_STACK_READY !== "1") {
  throw new Error(
    "The real-stack suite is opt-in: run it via ASSUREDIA_BACKEND_DIR=<engine repo> npm run test:live " +
      "(see e2e/live/README.md). Direct invocation would start Docker, Java and Chromium unexpectedly.",
  )
}

export default defineConfig({
  testDir: ".", // relative to this config, which already lives in e2e/live
  testMatch: "**/test-definitions-real-stack.spec.ts",
  timeout: 180_000,
  expect: { timeout: 30_000 },
  // Deterministic by construction: no retries, one worker, one shared audited stack.
  retries: 0,
  workers: 1,
  fullyParallel: false,
  forbidOnly: true,
  reporter: [["list"]],
  use: {
    baseURL: process.env.LIVE_FRONTEND_URL,
    headless: process.env.HEADED !== "1",
    screenshot: "off",
    video: "off",
    trace: "retain-on-failure",
    // Real Chromium with realistic desktop viewport.
    viewport: { width: 1280, height: 800 },
  },
  // The orchestrator owns the stack lifecycle; nothing is started here.
})
