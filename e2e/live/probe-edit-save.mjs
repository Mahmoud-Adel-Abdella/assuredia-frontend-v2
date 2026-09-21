/**
 * Diagnostic probe for the Edit step: why does "Save draft" stay disabled?
 *
 * Not part of the deliverable path. It opens one existing DRAFT, records the editor's
 * DOM value and the dirty-gated controls' states before and after a `fill()`, and prints
 * a verdict. Run against the live stack:
 *
 *   env -u http_proxy -u https_proxy -u HTTP_PROXY -u HTTPS_PROXY -u ALL_PROXY \
 *     NO_PROXY="localhost,127.0.0.1" node e2e/live/probe-edit-save.mjs
 */
import { chromium } from "@playwright/test"

const FRONTEND = process.env.FULLPATH_FRONTEND_URL ?? "http://localhost:3000"
const EMAIL = process.env.FULLPATH_EMAIL ?? "tool-shop@tool-shop.com"
const PASSWORD = process.env.FULLPATH_PASSWORD ?? ""
const DEFINITION_ID = process.env.PROBE_DEFINITION_ID ?? "15"

if (!PASSWORD) {
  console.error("FULLPATH_PASSWORD must be set")
  process.exit(2)
}

const browser = await chromium.launch({ headless: true, args: ["--no-proxy-server"] })
const context = await browser.newContext({ viewport: { width: 1440, height: 1200 }, ignoreHTTPSErrors: true })
const page = await context.newPage()

const state = async (label) => {
  const editor = page.locator("#testdef-source-editor")
  const info = await editor.evaluate((el) => ({
    tag: el.tagName,
    readOnly: el.readOnly,
    disabled: el.disabled,
    valueLength: el.value.length,
    hasPendingMarker: el.value.includes("[NEEDS BINDING]"),
    matchesEditorSelector: document.querySelectorAll("#testdef-source-editor").length,
  }))
  const save = page.getByRole("button", { name: "Save draft" })
  const revert = page.getByRole("button", { name: "Revert" })
  const out = {
    label,
    ...info,
    saveCount: await save.count(),
    saveDisabled: await save.first().isDisabled().catch(() => null),
    revertDisabled: await revert.first().isDisabled().catch(() => null),
  }
  console.log(JSON.stringify(out, null, 2))
  return out
}

try {
  await page.goto(FRONTEND, { waitUntil: "domcontentloaded" })
  await page.getByRole("button", { name: "Log In" }).first().click()
  await page.locator("#email").fill(EMAIL)
  await page.locator("#password").fill(PASSWORD)
  await page.getByRole("button", { name: "Sign In" }).click()
  await page.getByRole("heading", { name: /Good (morning|afternoon|evening)/i }).waitFor({ timeout: 30000 })

  // Go straight to the definition detail by clicking through Drafts & Reviews.
  await page.locator("aside, nav").getByRole("button", { name: /drafts|review/i }).first().click()
  await page.waitForTimeout(3000)
  const row = page.locator("tbody tr").filter({ hasText: new RegExp(`#?${DEFINITION_ID}\\b`) }).first()
  const rows = await page.locator("tbody tr").count()
  console.log("draft rows visible:", rows)
  if (await row.count()) {
    await row.getByRole("button", { name: "View" }).first().click()
  } else {
    await page.locator("tbody tr").first().getByRole("button", { name: "View" }).first().click()
  }
  await page.locator("#testdef-source-editor").waitFor({ timeout: 60000 })
  await page.waitForTimeout(1500)

  const before = await state("before")
  const original = await page.locator("#testdef-source-editor").inputValue()

  // ── Reproduce the harness sequence: a FAILED trial, then an edit ──────────────
  // The probe without a trial showed Save enabling correctly, so the trial is the
  // variable. This runs one and then retries the edit.
  if (process.env.PROBE_RUN_TRIAL === "1") {
    const trial = page.locator('button[data-action="trial"]')
    await trial.waitFor({ timeout: 30000 })
    await trial.click()
    const terminal = page.locator(
      '[data-testid="testdef-run-status-PASSED"], [data-testid="testdef-run-status-FAILED"], [data-testid="testdef-run-status-ERROR"]',
    )
    await terminal.first().waitFor({ timeout: 300000 })
    console.log("trial terminal badge:", ((await terminal.first().textContent()) || "").trim())
    await page.waitForTimeout(4000)
    await state("after-failed-trial")
  }

  // A minimal, definitely-valid edit: append a trailing newline.
  const edited = original + "\n"
  await page.locator("#testdef-source-editor").click()
  await page.locator("#testdef-source-editor").fill(edited)
  await page.waitForTimeout(800)
  const afterFill = await state("after-fill")
  const valueAfterFill = await page.locator("#testdef-source-editor").inputValue()

  console.log(
    JSON.stringify(
      {
        verdict: {
          fillChangedDom: valueAfterFill !== original,
          fillStuck: valueAfterFill === edited,
          domReverted: valueAfterFill === original,
          saveEnabledAfterFill: afterFill.saveDisabled === false,
          editorWasReadOnly: before.readOnly,
          duplicateIdCount: before.matchesEditorSelector,
        },
      },
      null,
      2,
    ),
  )
} catch (err) {
  console.error("PROBE ERROR:", String(err && err.stack ? err.stack : err))
} finally {
  await browser.close()
}
