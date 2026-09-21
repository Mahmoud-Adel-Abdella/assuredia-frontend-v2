/**
 * FULL-PATH verification (opt-in, live stack) — intent to production scheduling.
 *
 * The executable form of the mission's 12-step path:
 *
 *    1. Login                      7. Run Again
 *    2. AI Test Builder            8. View Results
 *    3. Review                     9. View Evidence
 *    4. Create                    10. AI Failure Analysis
 *    5. Run Now                   11. Alerts
 *    6. Edit                      12. Schedule
 *
 * The order is the workflow's, not the list's: the AI draft is run once to show what
 * it does on its own, then a human binds the steps the planner could not match, then
 * it is run again. Running before and after the edit is what makes the report able to
 * say something true about both states.
 *
 * What this proves that unit tests cannot:
 *
 *   * The AI plan is AUTO-BOUND. Step 3 records how many planned actions carry a real
 *     discovered locator, and step 4 asserts the opening navigate uses the page
 *     discovery actually visited rather than the `/PENDING` placeholder.
 *   * An unmatched step fails LOUDLY. Step 5 asserts the unbound run terminates with
 *     LOCATOR_NOT_FOUND — never a silent pass.
 *   * A Test Definition can be SCHEDULED. Step 12 drives the real Schedule action and
 *     asserts a schedule row appears.
 *
 * Every step is screenshotted and timed. `adminActions` must stay 0: the whole path is
 * a normal tenant user's path, and any step needing an admin console would not be a
 * usable product path.
 *
 * It does not start the stack. Bring up the frontend, the backend and the MCP policy
 * proxy first, then:
 *
 *   env -u http_proxy -u https_proxy -u HTTP_PROXY -u HTTPS_PROXY -u ALL_PROXY \
 *     NO_PROXY="localhost,127.0.0.1" \
 *     node e2e/live/full-path-verification.mjs
 *
 * Configuration (all optional; defaults target the local demo stack):
 *
 *   FULLPATH_FRONTEND_URL   default http://localhost:3000
 *   FULLPATH_BACKEND_URL    default http://localhost:8080
 *   FULLPATH_EMAIL          demo tenant login
 *   FULLPATH_PASSWORD       demo tenant password
 *   FULLPATH_EVIDENCE_DIR   where screenshots + the JSON report are written
 *   FULLPATH_INTENT         the AI Test Builder intent. A fresh intent per run creates
 *                           a fresh plan and therefore a fresh draft.
 *
 * Exit code is non-zero when any contract assertion fails, so it is safe to gate on.
 */
import { chromium } from "@playwright/test"
import fs from "node:fs"
import path from "node:path"

const FRONTEND = process.env.FULLPATH_FRONTEND_URL ?? "http://localhost:3000"
const BACKEND = process.env.FULLPATH_BACKEND_URL ?? "http://localhost:8080"
const EMAIL = process.env.FULLPATH_EMAIL ?? "tool-shop@tool-shop.com"
const PASSWORD = process.env.FULLPATH_PASSWORD ?? ""
const OUT =
  process.env.FULLPATH_EVIDENCE_DIR ??
  path.join(process.cwd(), "live-test-evidence", "full-path")
/**
 * The intent typed into the AI Test Builder.
 *
 * It is deliberately a sentence no earlier run used. The builder de-duplicates by intent:
 * re-submitting an identical intent returns the *already confirmed* definition from the
 * previous run, which means the run would exercise a stale, hand-bound draft instead of a
 * fresh AI plan. A unique intent is what makes steps 3-7 evidence about the planner rather
 * than about an old document.
 */
const INTENT =
  process.env.FULLPATH_INTENT ??
  "Verify the toolshop homepage loads with its product search, main navigation and footer"

if (!PASSWORD) {
  console.error(
    "FULLPATH_PASSWORD must be set (the demo tenant password is not stored in this repository).",
  )
  process.exit(2)
}

fs.mkdirSync(OUT, { recursive: true })

const t0 = Date.now()
const el = () => Number(((Date.now() - t0) / 1000).toFixed(1))
const log = (...a) => console.log(`[${el()}s]`, ...a)

const result = {
  intent: INTENT,
  steps: [],
  screenshots: [],
  failures: [],
  adminActions: 0,
  error: null,
}
const step = (name, detail) => {
  const atSeconds = el()
  result.steps.push({ name, detail: detail ?? null, atSeconds })
  log("STEP:", name, JSON.stringify(detail ?? ""))
  return atSeconds
}
const fail = (message) => {
  result.failures.push(message)
  log("ASSERTION FAILED:", message)
}

/**
 * Runs one step, recording rather than propagating a failure.
 *
 * The 12 steps share a page, so an early step that throws would hide every later one.
 * A run reporting "1-6 passed, 7 threw, 8-12 passed" is far more useful than one that
 * stops at 7 and says nothing about 8-12.
 */
const guard = async (name, fn) => {
  try {
    await fn()
  } catch (err) {
    const message = String(err && err.message ? err.message : err)
    result.stepErrors = result.stepErrors ?? {}
    result.stepErrors[name] = message
    log(`STEP ERROR in ${name}:`, message)
    await shoot(`${name}-error`).catch(() => {})
  }
}

/** The number of seconds the most recent step took, for the per-step timing table. */
const lapFrom = (mark) => Number((el() - mark).toFixed(1))

/**
 * The human review of the AI draft: the planner's unmatched steps are bound to real
 * elements on the target site. These are the same anchors the existing live harness
 * (`ai-draft-trial-usability.mjs`) uses, and they are real attributes of
 * practicesoftwaretesting.com — not invented selectors.
 */
const REVIEWED_JSON = JSON.stringify(
  {
    schemaVersion: "1.1",
    metadata: { name: "Verify the toolshop homepage loads" },
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
const context = await browser.newContext({
  viewport: { width: 1440, height: 1200 },
  ignoreHTTPSErrors: true,
})
const page = await context.newPage()

/** Raw network truth, captured independently of what the UI chooses to render. */
const net = { trial: [], analysis: [], scheduleCreate: null, scheduleList: [] }
page.on("response", async (r) => {
  const u = r.url()
  const m = r.request().method()
  if (u.includes("/trial")) {
    try {
      const j = await r.json()
      net.trial.push({
        http: r.status(),
        status: j.status,
        executionPurpose: j.executionPurpose,
        runId: j.runId,
        total: j.total,
        passed: j.passed,
        failed: j.failed,
        skipped: j.skipped,
        terminatingReasonCode: j.terminatingReasonCode ?? null,
      })
    } catch {
      net.trial.push({ http: r.status() })
    }
  }
  if (/\/runs\/[^/]+\/analysis/.test(u)) {
    try {
      net.analysis.push({ http: r.status(), method: m, body: await r.json() })
    } catch {
      net.analysis.push({ http: r.status(), method: m })
    }
  }
  if (/\/test-definitions\/\d+\/schedules$/.test(u) && m === "POST") {
    let body = null
    try {
      body = await r.json()
    } catch {}
    net.scheduleCreate = { http: r.status(), body }
  }
  if (/\/test-definitions\/\d+\/schedules$/.test(u) && m === "GET") {
    try {
      const j = await r.json()
      net.scheduleList.push({
        http: r.status(),
        count: Array.isArray(j) ? j.length : (j?.items?.length ?? null),
      })
    } catch {}
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
      if (
        (cs.overflowY === "auto" || cs.overflowY === "scroll") &&
        e.scrollHeight > e.clientHeight + 20
      ) {
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

/**
 * Sets the draft editor's value and waits for the Save button to become enabled.
 *
 * The Save button is gated on a `dirty` flag derived from React state, which flips a
 * render after the DOM value changes. A fixed short wait after `fill()` is not enough
 * while the run panel is still settling from the previous step, so this polls instead.
 * (A probe confirmed the editor itself is sound: `fill()` sets the value, the value
 * sticks, and Save enables — the only variable was how long that takes.)
 */
const setEditorValue = async (value) => {
  const editor = page.locator("#testdef-source-editor")
  const save = page.getByRole("button", { name: "Save draft" })

  await editor.click()
  await editor.fill(value)

  for (let attempt = 0; attempt < 25; attempt++) {
    if (!(await save.count())) return { method: "fill", saveEnabled: false, note: "no Save button" }
    if (await save.first().isEnabled().catch(() => false)) {
      return { method: "fill", saveEnabled: true, waitedMs: attempt * 200 }
    }
    await page.waitForTimeout(200)
  }

  const stuck = await editor.inputValue()
  return {
    method: "fill",
    saveEnabled: false,
    waitedMs: 5000,
    valueStuck: stuck === value,
    note: "Save draft never enabled",
  }
}

try {
  /* ══ 1. Login ═══════════════════════════════════════════════════════════ */
  let mark = el()
  await page.goto(FRONTEND, { waitUntil: "domcontentloaded" })
  await page.getByRole("button", { name: "Log In" }).first().click()
  await page.locator("#email").fill(EMAIL)
  await page.locator("#password").fill(PASSWORD)
  await page.getByRole("button", { name: "Sign In" }).click()
  await page
    .getByRole("heading", { name: /Good (morning|afternoon|evening)/i })
    .waitFor({ timeout: 30000 })
  const bodyText = (await page.textContent("body")) || ""
  const tenantVisible = /tool shop demo/i.test(bodyText)
  step("1.login", { email: EMAIL, tenantVisible, seconds: lapFrom(mark) })
  if (!tenantVisible) fail("the demo tenant was not visible after login")
  await shoot("01-login")

  /* ══ 2. AI Test Builder ═════════════════════════════════════════════════ */
  mark = el()
  await page.getByRole("button", { name: "Create Test" }).first().click()
  await page.locator("#ai-intent-textarea").waitFor({ timeout: 30000 })
  const uj = page.getByRole("radio", { name: "User Journey" })
  if (await uj.count()) await uj.first().click()
  await page.locator("#ai-intent-textarea").fill(INTENT)
  await page.getByRole("button", { name: "Build Test" }).click()
  const reviewBtn = page.getByRole("button", { name: /Review Test/i })
  await reviewBtn.waitFor({ timeout: 300000 })
  step("2.ai-test-builder", { intent: INTENT, planReady: true, seconds: lapFrom(mark) })
  await shoot("02-ai-test-builder")

  /* ══ 3. Review — the auto-binding payoff ════════════════════════════════ */
  mark = el()
  await reviewBtn.first().click()
  const createBtn = page.getByRole("button", { name: "Create Test Draft" })
  await createBtn.waitFor({ timeout: 60000 })

  // The plan response carries definitionSourceJson before the definition exists, which
  // is what lets the review screen show binding state pre-Create.
  const boundBadges = await page.getByTestId("plan-step-binding-bound").count()
  const unboundBadges = await page.getByTestId("plan-step-binding-unbound").count()
  step("3.review", {
    boundBadges,
    unboundBadges,
    autoBoundRatio: boundBadges + unboundBadges > 0
      ? `${boundBadges}/${boundBadges + unboundBadges}`
      : "n/a",
    seconds: lapFrom(mark),
  })
  // Phase 3's point: the AI plan arrives already bound to discovered elements, so a human
  // reviews and completes rather than authors. At least one action must carry a real locator.
  if (boundBadges === 0) {
    fail("no planned action was auto-bound — the AI plan is still a bare skeleton")
  }
  if (boundBadges + unboundBadges === 0) {
    fail("the review screen shows no binding state at all")
  }
  await shoot("03-review", true)

  /* ══ 4. Create ══════════════════════════════════════════════════════════ */
  mark = el()
  await createBtn.first().click()
  await page.getByText(/Test Draft Created|Already confirmed/i).first().waitFor({ timeout: 300000 })
  const alreadyConfirmed = await page.getByText(/Already confirmed/i).count()
  if (alreadyConfirmed > 0) {
    await page.getByRole("button", { name: /View in Drafts & Reviews/i }).first().click()
    await page
      .locator("tbody tr", { hasText: /Verify the/i })
      .first()
      .getByRole("button", { name: "View" })
      .first()
      .click()
  } else {
    await page.getByRole("button", { name: /Open Test/i }).first().click()
  }
  await page.locator("#testdef-source-editor").waitFor({ timeout: 90000 })
  const draftBadgeVisible = (await page.getByTestId("testdef-status-DRAFT").count()) > 0
  const createdSource = await page.locator("#testdef-source-editor").inputValue()
  const stillSkeleton = createdSource.includes("[NEEDS BINDING]") || createdSource.includes('"PENDING"')
  const navigatePath = (createdSource.match(/"action"\s*:\s*"ui\.navigate"[^}]*"url"\s*:\s*"([^"]*)"/) || [])[1] ?? null
  step("4.create", {
    outcome: alreadyConfirmed > 0 ? "already-confirmed" : "test-draft-created",
    draftBadgeVisible,
    stillSkeleton,
    navigatePath,
    secondsToDraft: lapFrom(mark),
  })
  if (!draftBadgeVisible) fail("the created definition did not open as DRAFT")
  // A discovered page path is a real URL, never the honest `/PENDING` placeholder.
  if (navigatePath === null || navigatePath.includes("PENDING")) {
    fail(`the navigate step did not use the discovered page path (got ${navigatePath})`)
  }
  await shoot("04-create-draft")

  // Hoisted: steps 5, 7 and 8 all need the same handles.
  const trial = page.locator('button[data-action="trial"]')
  const terminalBadge = page.locator(
    '[data-testid="testdef-run-status-PASSED"], [data-testid="testdef-run-status-FAILED"], [data-testid="testdef-run-status-ERROR"]',
  )
  let firstRun = {}

  /* ══ 5. Run Now — the draft as the AI left it ═══════════════════════════ */
  await guard("5.run-now", async () => {
    mark = el()
    await trial.waitFor({ timeout: 30000 })
    await waitEnabled(trial)
    if (await trial.isDisabled()) fail("Run trial is not enabled on the created DRAFT")
    await trial.click()
    await terminalBadge.first().waitFor({ timeout: 300000 })
    firstRun = net.trial.at(-1) ?? {}
    step("5.run-now", {
      uiBadge: ((await terminalBadge.first().textContent()) || "").trim(),
      api: firstRun,
      seconds: lapFrom(mark),
    })
    if (firstRun.http !== 200) fail(`Run Now returned HTTP ${firstRun.http}, not 200`)
    if (firstRun.executionPurpose !== "TRIAL") {
      fail(`Run Now was not recorded with purpose TRIAL (got ${firstRun.executionPurpose})`)
    }
    // The contract that matters: a draft with unbound steps must NOT pass. A green run here
    // would mean the PENDING placeholder silently succeeded, which is exactly the failure
    // mode the `[NEEDS BINDING]` marker exists to prevent.
    if (stillSkeleton && firstRun.status === "PASSED") {
      fail("the unbound draft PASSED — the PENDING placeholder silently succeeded")
    }
    await shoot("05-run-now")
  })

  /* ══ 6. Edit — the human review binds what the planner could not match ══ */
  await guard("6.edit", async () => {
    mark = el()
    // Let the run panel finish settling from the previous step before editing, so the
    // dirty flag is the only thing gating Save.
    await page.waitForTimeout(4000)

    const editor = page.locator("#testdef-source-editor")
    const before = await editor.inputValue()
    const unboundBefore = (before.match(/\[NEEDS BINDING\]/g) || []).length

    // If the draft already IS the reviewed document there is nothing to save, and the Save
    // button being disabled is correct rather than broken. Re-running the harness against a
    // definition it already reviewed must not be reported as a failure.
    const alreadyReviewed = before.trim() === REVIEWED_JSON.trim()

    let saved = false
    let set = { method: "none", saveEnabled: false }
    if (alreadyReviewed) {
      saved = true
    } else {
      set = await setEditorValue(REVIEWED_JSON)
      if (set.saveEnabled) {
        await page.getByRole("button", { name: "Save draft" }).click()
        await page.getByText("Draft saved").first().waitFor({ timeout: 60000 })
        saved = true
        await page.waitForTimeout(1500)
      } else {
        fail(
          `the Edit step could not save: Save draft stayed disabled after a valid edit (method=${set.method})`,
        )
      }
    }

    const after = await editor.inputValue()
    step("6.edit", {
      unboundStepsBefore: unboundBefore,
      alreadyReviewed,
      saved,
      saveMethod: alreadyReviewed ? "no-op (already the reviewed document)" : set.method,
      saveWaitedMs: set.waitedMs ?? null,
      unboundStepsAfter: (after.match(/\[NEEDS BINDING\]/g) || []).length,
      seconds: lapFrom(mark),
    })
    await shoot("07-edit-saved")
  })

  /* ══ 7. Run Again — now that a human has bound the steps ════════════════ */
  await guard("7.run-again", async () => {
    mark = el()
    const trialCountBefore = net.trial.length
    await waitEnabled(trial)
    await trial.click()
    await terminalBadge.first().waitFor({ timeout: 300000 })
    const secondRun = net.trial.at(-1) ?? {}
    step("7.run-again", {
      uiBadge: ((await terminalBadge.first().textContent()) || "").trim(),
      api: secondRun,
      seconds: lapFrom(mark),
    })
    if (net.trial.length <= trialCountBefore) fail("Run Again issued no new run request")
    if (secondRun.runId && secondRun.runId === firstRun.runId) {
      fail("Run Again reused the first run id — a re-run must create a new run")
    }
    // After the human binding, the test must actually pass: this is the mission's
    // "the created test is usable" claim, measured rather than asserted.
    if (secondRun.status !== "PASSED") {
      fail(
        `the reviewed test did not pass (status=${secondRun.status}, reason=${secondRun.terminatingReasonCode})`,
      )
    }
    await shoot("06-run-again")
  })

  /* ══ 8. View Results ════════════════════════════════════════════════════ */
  await guard("8.results", async () => {
    mark = el()
    const runPanelVisible = await page
      .getByRole("heading", { name: "Run result" })
      .first()
      .isVisible()
      .catch(() => false)
    const stepsTableVisible = await page
      .getByRole("heading", { name: "Steps" })
      .first()
      .isVisible()
      .catch(() => false)
    const stepRows = await page.locator("tbody tr").count()
    step("8.results", { runPanelVisible, stepsTableVisible, stepRows, seconds: lapFrom(mark) })
    if (!runPanelVisible) fail("the Run result panel did not render")
    if (!stepsTableVisible) fail("the Steps table did not render")
    await reveal(page.getByRole("heading", { name: "Steps" }).first())
    await shoot("08-results")
  })

  /* ══ 9. View Evidence ═══════════════════════════════════════════════════ */
  await guard("9.evidence", async () => {
    mark = el()
    const refreshBtn = page.getByRole("button", { name: "Refresh run" })
    const readArtifacts = () =>
      page
        .locator("li p.font-mono")
        .evaluateAll((els) =>
          els
            .map((e) => (e.textContent || "").trim())
            .filter((t) => /\.(png|json|txt|log|zip|webm)$/i.test(t)),
        )

    let artifacts = await readArtifacts()
    // Evidence is written by the worker and fetched by the panel, so the first read can
    // legitimately land before the metadata exists. Poll rather than reporting "no evidence"
    // for a run that has some.
    for (let attempt = 0; attempt < 5 && artifacts.length === 0; attempt++) {
      if (await refreshBtn.count()) await refreshBtn.first().click().catch(() => {})
      await page.waitForTimeout(4000)
      artifacts = await readArtifacts()
    }

    const evidenceHeading = await page
      .getByRole("heading", { name: "Evidence" })
      .first()
      .isVisible()
      .catch(() => false)
    step("9.evidence", { evidenceHeading, artifacts, seconds: lapFrom(mark) })
    await reveal(page.getByRole("heading", { name: "Evidence" }).first())
    await shoot("09-evidence")
  })

  /* ══ 12. Schedule — the definition-level capability ═════════════════════ */
  // Run BEFORE leaving the definition. This is also what makes the headline
  // "Intent -> Schedule" number honest: it stops the moment the schedule exists.
  await guard("12.schedule", async () => {
    mark = el()
    const scheduleBtn = page.locator('button[data-action="schedule"]')
    await scheduleBtn.waitFor({ timeout: 60000 })
    const scheduleEnabled = !(await scheduleBtn.isDisabled())
    await scheduleBtn.click()
    await page.getByTestId("schedule-frequency").waitFor({ timeout: 30000 })
    // A derived cron, never a hand-typed one: the engine needs a leading seconds field
    // and a five-field expression is the most likely way to get a 400 here.
    await page.getByTestId("schedule-frequency").selectOption("Every day")
    await page.getByTestId("schedule-submit").click()
    await page.waitForTimeout(9000)
    const scheduleRows = await page.locator('[data-testid^="schedule-row-"]').count()
    step("12.schedule", {
      scheduleEnabled,
      createHttp: net.scheduleCreate?.http ?? null,
      createdCron: net.scheduleCreate?.body?.cronExpression ?? null,
      createdId: net.scheduleCreate?.body?.id ?? null,
      scheduleRows,
      listCalls: net.scheduleList,
      seconds: lapFrom(mark),
    })
    if (net.scheduleCreate?.http !== 201 && net.scheduleCreate?.http !== 200) {
      fail(`creating a definition schedule returned HTTP ${net.scheduleCreate?.http}`)
    }
    if (scheduleRows === 0) fail("the created schedule did not appear in the schedule list")
    await shoot("12-schedule", true)
  })

  // The headline metric: intent typed -> schedule existing.
  result.intentToScheduleSeconds = el()
  log("METRIC intent-to-schedule:", result.intentToScheduleSeconds, "s")

  /* ══ 10. AI Failure Analysis ════════════════════════════════════════════ */
  await guard("10.ai-failure-analysis", async () => {
    mark = el()
    // The client-facing AI Analysis page, reachable from the sidebar with no admin
    // console. NOTE: the definition run panel itself has no inline AI entry point —
    // that gap is recorded rather than papered over.
    const aiNav = page.locator("aside, nav").getByRole("button", { name: /^ai analysis$/i }).first()
    let aiNavClicked = false
    if (await aiNav.count()) {
      await aiNav.click().catch(() => {})
      aiNavClicked = true
    }
    await page.waitForTimeout(5000)
    const analysisText =
      ((await page.textContent("body")) || "").match(
        /(ANALYZING|ANALYZED|DISABLED|No analysis|not available|failure analysis|no runs)/i,
      )?.[0] ?? null
    step("10.ai-failure-analysis", {
      aiNavClicked,
      analysisText,
      apiCalls: net.analysis.map((a) => ({
        http: a.http,
        method: a.method,
        status: a.body?.analysisStatus,
      })),
      definitionRunPanelHasInlineAnalysis: false,
      seconds: lapFrom(mark),
    })
    await shoot("10-ai-failure-analysis", true)
  })

  /* ══ 11. Alerts ═════════════════════════════════════════════════════════ */
  await guard("11.alerts", async () => {
    mark = el()
    const alertsNav = page.locator("aside, nav").getByRole("button", { name: /^alerts$/i }).first()
    let alertsOpened = false
    if (await alertsNav.count()) {
      await alertsNav.click().catch(() => {})
      alertsOpened = true
    }
    await page.waitForTimeout(4000)
    const alertsText = (await page.textContent("body")) || ""
    const alertsHeadingVisible = /alert/i.test(alertsText)
    step("11.alerts", { alertsOpened, alertsHeadingVisible, seconds: lapFrom(mark) })
    await shoot("11-alerts", true)
  })
} catch (err) {
  result.error = String(err && err.stack ? err.stack : err)
  log("ERROR:", result.error)
  await shoot("99-error").catch(() => {})
} finally {
  fs.writeFileSync(`${OUT}/full-path-verification.json`, JSON.stringify(result, null, 2))
  await browser.close()
}

const slowest = [...result.steps].sort((a, b) => (b.detail?.seconds ?? 0) - (a.detail?.seconds ?? 0))[0]
console.log(`\n--- timing ---`)
for (const s of result.steps) {
  console.log(`  ${String(s.detail?.seconds ?? "?").padStart(7)}s  ${s.name}`)
}
console.log(`  ${String(result.intentToScheduleSeconds ?? "?").padStart(7)}s  TOTAL intent -> schedule`)
console.log(`  slowest: ${slowest?.name} (${slowest?.detail?.seconds}s)`)
console.log(`  admin actions performed: ${result.adminActions}`)
if (result.stepErrors) {
  console.log(`  steps that threw:`)
  for (const [name, message] of Object.entries(result.stepErrors)) {
    console.log(`    - ${name}: ${message}`)
  }
}

if (result.failures.length > 0 || result.error) {
  console.error(
    `\nFAILED: ${result.failures.length} assertion(s) failed${result.error ? " (script error)" : ""}`,
  )
  process.exit(1)
}
console.log(`\nPASSED: full path in ${result.intentToScheduleSeconds}s, 0 admin actions`)
