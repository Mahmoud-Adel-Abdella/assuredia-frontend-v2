import { expect, test, type Page } from "@playwright/test"

/* ------------------------------------------------------------------ */
/* Live-test F-5 / F-9: Run History window + Alerts unread visibility  */
/* ------------------------------------------------------------------ */

const SESSION_TOKEN = "e2e-session-token"
const CLIENT_ID = 7

const CLIENT_ME = {
  id: 2,
  userId: 2,
  email: "qa@example.test",
  role: "CLIENT",
  clientId: CLIENT_ID,
  clientName: "northwind sandbox",
  name: "QA Engineer",
}

async function openAsClient(page: Page) {
  await page.addInitScript(
    ([token]) => {
      window.localStorage.setItem("assuredia.token", token as string)
      window.localStorage.setItem("assuredia_lang", "en")
    },
    [SESSION_TOKEN],
  )
  await page.route("**/dashboard-api/auth/me", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(CLIENT_ME),
    }),
  )
  await page.goto("/")
}

test.beforeEach(async ({ request }) => {
  const reset = await request.post("http://127.0.0.1:8099/__test__/reset")
  expect(reset.ok()).toBeTruthy()
})

test("Run History shows runs older than 7 days by default (F-5)", async ({
  page,
}) => {
  const tenDaysAgo = new Date(Date.now() - 10 * 86_400_000).toISOString()
  await page.route("**/dashboard-api/clients/7/runs*", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([
        {
          id: 12,
          run_id: "run-old-1",
          type: "SINGLE",
          status: "PASSED",
          flow_name: "Checkout",
          total: 3,
          failed: 0,
          duration_seconds: 12,
          timestamp: tenDaysAgo,
          trigger_source: "DIRECT",
        },
      ]),
    }),
  )

  await openAsClient(page)
  await page.getByRole("button", { name: "History" }).first().click()

  // The default window is "All time" — the same source window as the
  // Overview's Recent Runs — so a 10-day-old run is visible on load and the
  // page is never a bare "No runs yet" while runs exist.
  await expect(page.getByRole("row").filter({ hasText: "Checkout" })).toHaveCount(1)
  await expect(page.getByText("No runs yet")).toHaveCount(0)
})

test("unread alerts are visible on load and a banner counts hidden unread (F-9)", async ({
  page,
}) => {
  const now = new Date().toISOString()
  const threeDaysAgo = new Date(Date.now() - 3 * 86_400_000).toISOString()
  await page.route("**/dashboard-api/alerts/unread-count", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ count: 2 }),
    }),
  )
  await page.route("**/dashboard-api/alerts?*", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([
        {
          id: "a-old",
          severity: "error",
          resolutionState: "OPEN",
          isRead: false,
          clientId: CLIENT_ID,
          client: "northwind sandbox",
          flow: "Checkout",
          runId: "run-1",
          failedCount: 1,
          testName: "testOldAlert",
          summary: "Old unread alert outside 24h",
          timestamp: threeDaysAgo,
        },
        {
          id: "a-new",
          severity: "error",
          resolutionState: "OPEN",
          isRead: false,
          clientId: CLIENT_ID,
          client: "northwind sandbox",
          flow: "Checkout",
          runId: "run-2",
          failedCount: 1,
          testName: "testFreshAlert",
          summary: "Fresh unread alert",
          timestamp: now,
        },
      ]),
    }),
  )

  await openAsClient(page)

  // The shell badge and Alerts summary both consume the same authoritative
  // tenant-wide count, even though the list is filtered locally.
  await expect(page.getByRole("button", { name: "2 unread alerts" })).toBeVisible()
  await expect(page.getByRole("button", { name: "Alerts" }).first()).toContainText("2")
  await page.getByRole("button", { name: "Alerts" }).first().click()

  // Default range "All time": the older unread alert is visible on load.
  await expect(page.getByText("testOldAlert")).toBeVisible()
  await expect(page.getByText("Unread").first()).toBeVisible()
  await expect(page.locator("main").getByText("2", { exact: true }).first()).toBeVisible()

  // Narrowing the range hides it — but a banner now says unread work exists
  // outside the filter, with a one-click way back.
  await page.getByLabel("Time").selectOption({ label: "Last 24 hours" })
  await expect(page.getByText("testOldAlert")).toHaveCount(0)
  await expect(
    page.getByText("1 unread alerts are outside the current time filter."),
  ).toBeVisible()
  await page.getByRole("button", { name: "Show all alerts" }).click()
  await expect(page.getByText("testOldAlert")).toBeVisible()
  await expect(
    page.getByText("1 unread alerts are outside the current time filter."),
  ).toHaveCount(0)
})
