import { expect, test, type Page } from "@playwright/test"

const ENGINE_URL = "http://127.0.0.1:8099"
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

async function openAsClient(page: Page, lang = "en") {
  await page.addInitScript(
    ([token, language]) => {
      window.localStorage.setItem("assuredia.token", token as string)
      window.localStorage.setItem("assuredia_lang", language as string)
      window.localStorage.removeItem("sidebarCollapsed")
    },
    [SESSION_TOKEN, lang],
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

function authHeaders(extra: Record<string, string> = {}) {
  return {
    Authorization: `Bearer ${SESSION_TOKEN}`,
    "Content-Type": "application/json",
    ...extra,
  }
}

test.beforeEach(async ({ request }) => {
  const reset = await request.post(`${ENGINE_URL}/__test__/reset`)
  expect(reset.ok()).toBeTruthy()
})

test("sidebar renders the TESTS and RUNS & RESULTS groups", async ({
  page,
}) => {
  await openAsClient(page)
  for (const group of ["Workspace", "TESTS", "RUNS & RESULTS"]) {
    await expect(page.getByText(group, { exact: true }).first()).toBeVisible()
  }
  for (const item of [
    "Active Tests",
    "Drafts & Reviews",
    "Test Requests",
    "Create Test",
    "Live Runs",
    "Scheduled Runs",
    "History",
  ]) {
    await expect(
      page.getByRole("button", { name: item }).first(),
    ).toBeVisible()
  }
})

test("Active Tests hides drafts, Drafts & Reviews shows them", async ({
  page,
  request,
}) => {
  const created = await request.post(
    `${ENGINE_URL}/dashboard-api/clients/${CLIENT_ID}/test-definitions`,
    {
      headers: authHeaders(),
      data: { name: "IA draft definition" },
    },
  )
  expect(created.status()).toBe(200)

  await openAsClient(page)
  await page.getByRole("button", { name: "Active Tests" }).first().click()
  await expect(
    page.getByRole("heading", { name: "Active Tests" }),
  ).toBeVisible()
  await expect(page.getByText("No Active tests on this page")).toBeVisible()
  await expect(page.getByText(/matching this view/)).toBeVisible()
  await expect(
    page.locator("tbody tr", { hasText: "IA draft definition" }),
  ).toHaveCount(0)

  await page.getByRole("button", { name: "Drafts & Reviews" }).first().click()
  await expect(
    page.getByRole("heading", { name: "Drafts & Reviews" }),
  ).toBeVisible()
  await expect(
    page.locator("tbody tr", { hasText: "IA draft definition" }),
  ).toBeVisible()
})

test("Test Requests and Create Test mount their pages", async ({ page }) => {
  await openAsClient(page)
  await page.getByRole("button", { name: "Test Requests" }).first().click()
  await expect(
    page.getByRole("heading", { name: "Test Requests" }),
  ).toBeVisible()
  await page.getByRole("button", { name: "Create Test" }).first().click()
  await expect(
    page.getByRole("heading", { name: "Create a Test" }),
  ).toBeVisible()
})

test("Live Runs, Scheduled Runs and History mount", async ({ page }) => {
  await openAsClient(page)
  await page.getByRole("button", { name: "Live Runs" }).first().click()
  await expect(
    page.getByRole("heading", { name: "Automations" }),
  ).toBeVisible()
  await page.getByRole("button", { name: "Scheduled Runs" }).first().click()
  await expect(
    page.getByRole("heading", { name: "Automations" }),
  ).toBeVisible()
  await page.getByRole("button", { name: "History" }).first().click()
  await expect(
    page.getByRole("heading", { name: "Run History" }),
  ).toBeVisible()
})

test("deep link opens the definition detail", async ({ page, request }) => {
  const created = await request.post(
    `${ENGINE_URL}/dashboard-api/clients/${CLIENT_ID}/test-definitions`,
    {
      headers: authHeaders(),
      data: { name: "IA deep link definition" },
    },
  )
  expect(created.status()).toBe(200)

  await openAsClient(page)
  await page.getByRole("button", { name: "Drafts & Reviews" }).first().click()
  await page
    .locator("tbody tr", { hasText: "IA deep link definition" })
    .getByRole("button", { name: "View" })
    .click()
  await expect(
    page.getByRole("heading", { name: "IA deep link definition" }),
  ).toBeVisible()
})

test("Arabic mirrors the new sidebar groups", async ({ page }) => {
  await openAsClient(page, "ar")
  const dir = await page.evaluate(() => document.documentElement.dir)
  expect(dir).toBe("rtl")
  await expect(
    page.getByText("الاختبارات", { exact: true }),
  ).toBeVisible()
  await expect(
    page.getByRole("button", { name: "إنشاء اختبار" }).first(),
  ).toBeVisible()
})

test("sidebar collapse still works with the new IA", async ({ page }) => {
  await openAsClient(page)
  await expect(page.getByText("TESTS", { exact: true })).toBeVisible()
  await page.getByRole("button", { name: "Close sidebar" }).click()
  await expect(page.getByText("TESTS", { exact: true })).toBeHidden()
  await page.getByRole("button", { name: "Open sidebar" }).click()
  await expect(page.getByText("TESTS", { exact: true })).toBeVisible()
  await expect(
    page.getByRole("button", { name: "Drafts & Reviews" }).first(),
  ).toBeVisible()
})
