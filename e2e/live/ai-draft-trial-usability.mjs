/**
 * AI Test Builder -> DRAFT -> Run trial usability path (opt-in, live stack).
 *
 * The real-stack suite (`real-stack.mjs` + `test-definitions-real-stack.spec.ts`)
 * deliberately seeds definitions directly and runs against a loopback fixture.
 * This script covers the one path that suite cannot: a definition created by the
 * **AI Test Builder**, which needs a live AI provider and a real target site.
 *
 * It is the executable form of the Phase-2 usability contract:
 *
 *   1. An AI-created draft is created from an intent and opens as DRAFT.
 *   2. "Run trial" is ENABLED on that DRAFT with no Validate prerequisite, no
 *      Flow binding and no admin approval.
 *   3. The AI builder emits a `[NEEDS BINDING]` skeleton; the human review step
 *      is binding it. After binding, the trial reaches a terminal result.
 *   4. The run result, its step table and its Evidence render in the UI.
 *
 * It does not start the stack. Bring up the frontend, the backend and the MCP
 * policy proxy first, then:
 *
 *   env -u http_proxy -u https_proxy -u HTTP_PROXY -u HTTPS_PROXY -u ALL_PROXY \
 *     NO_PROXY="localhost,127.0.0.1" \
 *     node e2e/live/ai-draft-trial-usability.mjs
 *
 * Configuration (all optional; defaults target the local demo stack):
 *
 *   PHASE2_FRONTEND_URL   default http://localhost:3000
 *   PHASE2_BACKEND_URL    default http://localhost:8080
 *   PHASE2_EMAIL          demo tenant login
 *   PHASE2_PASSWORD       demo tenant password
 *   PHASE2_EVIDENCE_DIR   where screenshots + the JSON report are written
 *   PHASE2_INTENT         the AI Test Builder intent (a fresh one per run creates
 *                         a fresh plan and therefore a fresh unbound draft)
 *
 * Exit code is non-zero when any contract assertion fails, so it is safe to gate on.
 */
import { chromium } from "@playwright/test"
import fs from "node:fs"
import path from "node:path"

const FRONTEND = process.env.PHASE2_FRONTEND_URL ?? "http://localhost:3000"
const BACKEND = process.env.PHASE2_BACKEND_URL ?? "http://localhost:8080"
const EMAIL = process.env.PHASE2_EMAIL ?? "tool-shop@tool-shop.com"
const PASSWORD = process.env.PHASE2_PASSWORD ?? ""
const OUT =
  process.env.PHASE2_EVIDENCE_DIR ??
  path.join(process.cwd(), "live-test-evidence", "phase2")
const INTENT =
  process.env.PHASE2_INTENT ??
  "Verify the toolshop homepage renders with its main navigation and product search"

if (!PASSWORD) {
  console.error(
    "PHASE2_PASSWORD must be set (the demo tenant password is not stored in this repository).",
  )
  process.exit(2)
}

fs.mkdirSync(OUT, { recursive: true })

const t0 = Date.now()
const el = () => ((Date.now() - t0) / 1000).toFixed(1)
const log = (...a) => console.log(`[${el()}s]`, ...a)

const result = { intent: INTENT, steps: [], screenshots: [], failures: [], adminActions: 0, error: null }
const step = (name, detail) => {
  result.steps.push({ name, detail: detail ?? null, atSeconds: Number(el()) })
  log("STEP:", name, detail ?? "")
}
const fail = (message) => {
  result.failures.push(message)
  log("ASSERTION FAILED:", message)
}

/**
 * The human-review binding for the target site. `[NEEDS BINDING]` placeholders
 * from the planner are replaced with real anchors.
 */
const BOUND_JSON = JSON.stringify(
  {
    schemaVersion: "1.1",
    metadata: { name: "Verify the homepage loads" },
    steps: [
      { action: "ui.navigate", url: "/" },
      {
        action: "ui.assertVisible",
        locator: { strategy: "css", value: '[data-test="search-query"]' },
        name: "The product search box is visible",
      },
      { action: "ui.screenshot", label: "homepage-loaded" },
    ],
    expectedOutcomes: [
      {
        action: "ui.assertVisible",
        locator: { strategy: "css", value: '[data-test="nav-home"]' },
        name: "The primary navigation Home link is visible",
      },
      { action: "ui.assertTitle", expected: "Practice Software Testing", matcher: "contains" },
    ],
  },
  null,
  2,
)

const browser = await chromium.launch({ headless: true, args: ["--no-proxy-server"] })
const context = await browser.newContext({ viewport: { width: 1440, height: 1200 }, ignoreHTTPSErrors: true })
const page = await context.newPage()

page.on("response", async (r) => {
  const u = r.url()
  if (u.includes("/trial")) {
    result.trialHttpStatus = r.status()
    try {
      const j = await r.json()
      result.trialResponse = {
        status: j.status,
        executionPurpose: j.executionPurpose,
        runId: j.runId,
        terminatingReasonCode: j.terminatingReasonCode,
      }
    } catch {}
  }
  if (/test-definitions\/\d+\/versions\/\d+$/.test(u) && r.request().method() === "PUT") {
    result.saveHttpStatus = r.status()
  }
})

const shoot = async (name, full = false) => {
  const p = `${OUT}/${name}.png`
  await page.screenshot({ path: p, fullPage: full })
  result.screenshots.push(p)
}
const reveal = async (loc) => {
  await loc.scrollIntoViewIfNeeded().catch(() => {})
  await page.evaluate(() => {
    for (const e of document.querySelectorAll("div")) {
      const cs = getComputedStyle(e)
      if ((cs.overflowY === "auto" || cs.overflowY === "scroll") && e.scrollHeight > e.clientHeight + 20) {
        e.scrollTop = e.scrollHeight
      }
    }
  })
  await page.waitForTimeout(600)
}
const waitEnabled = (loc) =>
  loc.evaluate(
    (el) =>
      new Promise((res) => {
        const t = setInterval(() => {
          if (!el.disabled) {
            clearInterval(t)
            res()
          }
        }, 200)
        setTimeout(() => {
          clearInterval(t)
          res()
        }, 20000)
      }),
  )

try {
  /* ---- 1. Login + tenant ---- */
  await page.goto(FRONTEND, { waitUntil: "domcontentloaded" })
  await page.getByRole("button", { name: "Log In" }).first().click()
  await page.locator("#email").fill(EMAIL)
  await page.locator("#password").fill(PASSWORD)
  await page.getByRole("button", { name: "Sign In" }).click()
  await page.getByRole("heading", { name: /Good (morning|afternoon|evening)/i }).waitFor({ timeout: 30000 })
  const bodyText = await page.textContent("body")
  const tenantVisible = /tool shop demo/i.test(bodyText || "")
  step("login", { email: EMAIL, tenantVisible })
  if (!tenantVisible) fail("the demo tenant was not visible after login")
  await shoot("01-authenticated")

  /* ---- 2. Create Test -> AI Test Builder ---- */
  await page.getByRole("button", { name: "Create Test" }).first().click()
  await page.locator("#ai-intent-textarea").waitFor({ timeout: 30000 })
  step("ai-builder-open", true)

  const uj = page.getByRole("radio", { name: "User Journey" })
  if (await uj.count()) await uj.first().click()

  /* ---- 3. Intent -> Build Test -> plan ---- */
  await page.locator("#ai-intent-textarea").fill(INTENT)
  await page.getByRole("button", { name: "Build Test" }).click()
  step("build-started", INTENT)

  const reviewBtn = page.getByRole("button", { name: /Review Test/i })
  await reviewBtn.waitFor({ timeout: 300000 })
  step("plan-ready", "PLAN_READY")

  await reviewBtn.first().click()
  const createBtn = page.getByRole("button", { name: "Create Test Draft" })
  await createBtn.waitFor({ timeout: 60000 })
  await createBtn.first().click()

  /* ---- 4. Open the created DRAFT ---- */
  await page.getByText(/Test Draft Created|Already confirmed/i).first().waitFor({ timeout: 300000 })
  const alreadyConfirmed = await page.getByText(/Already confirmed/i).count()
  step("draft-confirm", { outcome: alreadyConfirmed > 0 ? "already-confirmed" : "test-draft-created" })

  if (alreadyConfirmed > 0) {
    await page.getByRole("button", { name: /View in Drafts & Reviews/i }).first().click()
    await page
      .locator("tbody tr", { hasText: /Verify the (homepage|toolshop)/i })
      .first()
      .getByRole("button", { name: "View" })
      .first()
      .click()
  } else {
    await page.getByRole("button", { name: /Open Test/i }).first().click()
  }

  await page.locator("#testdef-source-editor").waitFor({ timeout: 90000 })
  const draftBadgeVisible = (await page.getByTestId("testdef-status-DRAFT").count()) > 0
  step("definition-open", { draftBadgeVisible, secondsToDraft: Number(el()) })
  if (!draftBadgeVisible) fail("the created definition did not open as DRAFT")
  await shoot("02-definition-draft")

  /* ---- 5. THE CONTRACT: trial availability on an AI-created DRAFT ---- */
  const trial = page.locator('button[data-action="trial"]')
  await trial.waitFor({ timeout: 30000 })
  await waitEnabled(trial)

  const trialEnabled = !(await trial.isDisabled())
  const trialReasonShown = (await page.locator("#testdef-reason-trial").count()) > 0
  const flowNotLinked = (await page.locator("text=Not linked").count()) > 0
  const validateBtn = page.locator('button[data-action="validate"]')

  step("trial-availability", {
    trialEnabled,
    trialReasonShown,
    flowNotLinked,
    validateButtonStillPresent: (await validateBtn.count()) > 0,
    adminActionsPerformed: result.adminActions,
  })
  if (!trialEnabled) fail("Run trial is not enabled on the AI-created DRAFT")
  if (trialReasonShown) fail("a reason is shown for the trial action on a DRAFT")

  /* ---- 6. Human review: bind the skeleton ---- */
  const before = await page.locator("#testdef-source-editor").inputValue()
  const wasSkeleton = before.includes("[NEEDS BINDING]") || before.includes('"PENDING"')
  step("skeleton-before-review", { wasSkeleton })

  if (wasSkeleton) {
    await page.locator("#testdef-source-editor").fill(BOUND_JSON)
    const saveBtn = page.getByRole("button", { name: "Save draft" })
    await saveBtn.waitFor({ timeout: 15000 })
    await saveBtn.click()
    await page.getByText("Draft saved").first().waitFor({ timeout: 60000 })
    step("draft-saved", { saveHttpStatus: result.saveHttpStatus ?? null })
    if (result.saveHttpStatus !== 200) fail(`saving the bound draft returned ${result.saveHttpStatus}`)
  } else {
    step("draft-saved", { skipped: "already bound" })
  }

  /* ---- 7. Run trial -> terminal result ---- */
  await waitEnabled(trial)
  await trial.click()

  const terminalBadge = page.locator(
    '[data-testid="testdef-run-status-PASSED"], [data-testid="testdef-run-status-FAILED"], [data-testid="testdef-run-status-ERROR"]',
  )
  await terminalBadge.first().waitFor({ timeout: 300000 })
  const badgeText = ((await terminalBadge.first().textContent()) || "").trim()

  step("trial-result", {
    uiBadgeText: badgeText,
    apiStatus: result.trialResponse?.status ?? null,
    apiPurpose: result.trialResponse?.executionPurpose ?? null,
    apiRunId: result.trialResponse?.runId ?? null,
    terminatingReasonCode: result.trialResponse?.terminatingReasonCode ?? null,
    trialHttpStatus: result.trialHttpStatus,
    secondsDraftToResult: Number(el()),
  })
  if (result.trialHttpStatus !== 200) fail(`the trial request returned ${result.trialHttpStatus}, not 200`)
  if (result.trialResponse?.executionPurpose !== "TRIAL") fail("the run was not recorded with purpose TRIAL")

  /* ---- 8. Run result + Evidence ---- */
  await reveal(terminalBadge.first())
  await shoot("03-trial-result")

  const runPanelVisible = await page.getByRole("heading", { name: "Run result" }).first().isVisible().catch(() => false)
  const stepsTableVisible = await page.getByRole("heading", { name: "Steps" }).first().isVisible().catch(() => false)
  if (!runPanelVisible) fail("the Run result panel did not render")
  if (!stepsTableVisible) fail("the Steps table did not render")

  const refreshBtn = page.getByRole("button", { name: "Refresh run" })
  if (await refreshBtn.count()) {
    await refreshBtn.first().click()
    await page.waitForTimeout(3500)
  }
  const artifacts = await page
    .locator("li p.font-mono")
    .evaluateAll((els) => els.map((e) => (e.textContent || "").trim()).filter((t) => /\.(png|json|txt|log|zip|webm)$/i.test(t)))
  step("evidence", { artifacts })
  await reveal(page.getByRole("heading", { name: "Evidence" }).first())
  await shoot("04-evidence")

  /* ---- 9. No definition-level scheduling surface ---- */
  const scheduleLabels = await page
    .locator("button, a")
    .evaluateAll((els) =>
      els.map((e) => (e.textContent || "").trim()).filter((t) => /^schedule/i.test(t) && t.length < 40),
    )
  step("schedule-controls-on-definition", {
    labels: [...new Set(scheduleLabels)],
    note: "Scheduling is flow-scoped in this build; there is no definition-level schedule action.",
  })

  result.totalSeconds = Number(el())
} catch (err) {
  result.error = String(err && err.stack ? err.stack : err)
  log("ERROR:", result.error)
  await shoot("99-error").catch(() => {})
} finally {
  fs.writeFileSync(`${OUT}/ai-draft-trial-usability.json`, JSON.stringify(result, null, 2))
  await browser.close()
}

if (result.failures.length > 0 || result.error) {
  console.error(`\nFAILED: ${result.failures.length} assertion(s) failed${result.error ? " (script error)" : ""}`)
  process.exit(1)
}
console.log(`\nPASSED: AI-created DRAFT -> trial ${result.trialResponse?.status} in ${result.totalSeconds}s`)
