import { expect, test, type Page } from "@playwright/test"

/**
 * The Test Definition lifecycle, driven through the real UI in a real browser
 * against the in-memory engine double on loopback.
 *
 * Create → Edit DRAFT → Validate → Trial → Approve → Proving → READY → Archive,
 * in one pass, with each transition read back from the server the way the page
 * does it. There are no fixed waits and no retries: every step waits for the
 * assertion it actually depends on.
 */

const ENGINE_URL = "http://127.0.0.1:8099"
const SESSION_TOKEN = "e2e-session-token"
const DEFINITION_NAME = "E2E checkout journey"

const DEFINITION_SOURCE = JSON.stringify(
  {
    schemaVersion: "1.0",
    metadata: { name: DEFINITION_NAME },
    steps: [
      { action: "ui.navigate", url: "/checkout" },
      { action: "ui.click", locator: { strategy: "role", role: "button", name: "Pay" } },
    ],
    expectedOutcomes: [
      { action: "ui.assertText", locator: { strategy: "testId", value: "receipt" }, expected: "Thank you" },
    ],
  },
  null,
  2,
)

/** Signs in the way a returning session does: a stored token, validated by /auth/me. */
async function openDashboard(page: Page) {
  await page.addInitScript(([token]) => {
    window.localStorage.setItem("assuredia.token", token as string)
    window.localStorage.setItem("assuredia_lang", "en")
    window.localStorage.removeItem("sidebarCollapsed")
  }, [SESSION_TOKEN])
  await page.goto("/")
}

async function openTestDefinitions(page: Page) {
  await page.getByRole("button", { name: "Admin Console" }).click()
  await page.getByRole("button", { name: "Test Definitions" }).click()
  // The console works inside one client environment, chosen first.
  await expect(page.locator("#admin-testdef-client")).toBeVisible()
  await expect(page.locator("#admin-testdef-client")).toHaveValue("7")
}

function lifecycleButton(page: Page, action: string) {
  return page.locator(`button[data-action="${action}"]`)
}

test.beforeEach(async ({ request }) => {
  // A clean engine per test keeps the run order-independent.
  const reset = await request.post(`${ENGINE_URL}/__test__/reset`)
  expect(reset.ok()).toBeTruthy()
})

test("a definition goes from draft to archived through the dashboard", async ({ page, request }) => {
  const requestedUrls: string[] = []
  page.on("request", (req) => requestedUrls.push(req.url()))
  // A render failure would otherwise surface only as a locator timeout.
  page.on("pageerror", (err) => {
    throw new Error(`The dashboard raised an uncaught error: ${err.message}`)
  })

  await openDashboard(page)
  await expect(page.getByRole("heading", { name: /Good (morning|afternoon|evening)/ })).toBeVisible()

  await openTestDefinitions(page)

  /* ---- Empty state ------------------------------------------------- */
  await expect(page.getByText("No test definitions yet")).toBeVisible()

  /* ---- Create ------------------------------------------------------ */
  await page.getByRole("button", { name: "New Definition" }).first().click()
  await page.locator("#testdef-name").fill(DEFINITION_NAME)
  await page.locator("#testdef-flow").selectOption({ label: "Checkout" })
  await page.locator("#testdef-source").fill(DEFINITION_SOURCE)
  await expect(page.getByText("Checked in your browser")).toBeVisible()
  await expect(page.getByText("No problems found").first()).toBeVisible()
  await page.getByRole("button", { name: "Create definition" }).click()

  // Creating opens the new definition, which starts as a DRAFT.
  await expect(page.getByRole("heading", { name: DEFINITION_NAME })).toBeVisible()
  await expect(page.getByTestId("testdef-status-DRAFT").first()).toBeVisible()

  /* ---- Edit the draft ---------------------------------------------- */
  const editor = page.locator("#testdef-source-editor")
  await expect(editor).toBeEnabled()
  const edited = DEFINITION_SOURCE.replace('"/checkout"', '"/checkout?utm=e2e"')
  await editor.fill(edited)
  await expect(page.getByText("Unsaved changes")).toBeVisible()
  await page.getByRole("button", { name: "Save draft" }).click()
  await expect(page.getByText("Unsaved changes")).toBeHidden()
  await expect(editor).toHaveValue(edited)

  /* ---- Validate ---------------------------------------------------- */
  await lifecycleButton(page, "validate").click()
  await expect(page.getByTestId("testdef-status-VALIDATED").first()).toBeVisible()
  await expect(page.getByText("Engine validation")).toBeVisible()

  /* ---- Trial ------------------------------------------------------- */
  await expect(lifecycleButton(page, "trial")).toBeEnabled()
  await lifecycleButton(page, "trial").click()
  await expect(page.getByText("Run result")).toBeVisible()
  await expect(page.getByTestId("testdef-run-status-PASSED").first()).toBeVisible()
  await expect(page.getByText("Trial", { exact: true }).first()).toBeVisible()

  // A trial is not gating: the version is still VALIDATED.
  await expect(page.getByTestId("testdef-status-VALIDATED").first()).toBeVisible()

  /* ---- Approve (admin only, confirmed) ----------------------------- */
  await lifecycleButton(page, "approve").click()
  const approveDialog = page.getByRole("dialog")
  await expect(approveDialog).toBeVisible()
  await expect(approveDialog).toContainText("Approve this version?")
  await approveDialog.getByRole("button", { name: "Approve" }).click()
  await expect(page.getByTestId("testdef-status-APPROVED").first()).toBeVisible()

  /* ---- Proving → READY --------------------------------------------- */
  await expect(lifecycleButton(page, "proving")).toBeEnabled()
  // READY is never a control of its own; it can only be a consequence.
  await expect(page.locator('button[data-action="ready"]')).toHaveCount(0)

  await lifecycleButton(page, "proving").click()
  const provingDialog = page.getByRole("dialog")
  await expect(provingDialog).toContainText("real environment")
  await provingDialog.getByRole("button", { name: "Run proving" }).click()

  await expect(page.getByText("The proving run passed and the version is now READY")).toBeVisible()
  await expect(page.getByTestId("testdef-status-READY").first()).toBeVisible()

  /* ---- Evidence ---------------------------------------------------- */
  await page.getByRole("button", { name: "Refresh run" }).click()
  await expect(page.getByText("step-0.png")).toBeVisible()
  const download = page.waitForEvent("download")
  await page.getByRole("button", { name: "Download" }).click()
  expect((await download).suggestedFilename()).toBe("step-0.png")

  /* ---- Archive ----------------------------------------------------- */
  await expect(lifecycleButton(page, "archive")).toBeEnabled()
  await lifecycleButton(page, "archive").click()
  const archiveDialog = page.getByRole("dialog")
  await expect(archiveDialog).toContainText("permanent")
  await archiveDialog.getByRole("button", { name: "Archive" }).click()

  await expect(page.getByTestId("testdef-status-ARCHIVED").first()).toBeVisible()
  // The banner and the editor's own hint both say it; either is enough.
  await expect(page.getByText("archived and cannot be changed or executed").first()).toBeVisible()
  await expect(editor).toBeDisabled()

  /* ---- The list reflects the final state ---------------------------- */
  await page.getByRole("button", { name: "Back to Test Definitions" }).click()
  const row = page.locator("tbody tr", { hasText: DEFINITION_NAME })
  await expect(row).toBeVisible()
  await expect(row.getByTestId("testdef-status-ARCHIVED")).toBeVisible()

  /* ---- Every backend call stayed on the local engine ---------------- */
  const apiCalls = requestedUrls.filter((url) => url.includes("/dashboard-api/"))
  expect(apiCalls.length).toBeGreaterThan(0)
  for (const url of apiCalls) {
    expect(url.startsWith(`${ENGINE_URL}/dashboard-api/`)).toBeTruthy()
  }

  // No request of any kind reached a deployed or experimental environment. The
  // only third-party origin the page touches at all is the Google Fonts
  // stylesheet imported by src/index.css, which predates this feature.
  for (const url of requestedUrls) {
    expect(url).not.toMatch(/neon\.tech|amazonaws\.com|assuredia\.(com|io|app)/i)
  }

  // The engine recorded exactly two executions: one trial, one proving.
  const runs = await request.get(`${ENGINE_URL}/dashboard-api/clients/7/test-definitions/1/runs/2`, {
    headers: { Authorization: `Bearer ${SESSION_TOKEN}` },
  })
  expect(runs.ok()).toBeTruthy()
  expect((await runs.json()).execution_purpose).toBe("PROVING")
})
