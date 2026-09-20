import { expect, test } from "@playwright/test"

const ENGINE_URL = "http://127.0.0.1:8099"
const TOKEN = "e2e-session-token"

async function openBuilder(page: import("@playwright/test").Page) {
  await page.addInitScript(([token]) => localStorage.setItem("assuredia.token", token as string), [TOKEN])
  await page.route("**/dashboard-api/auth/me", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ id: 2, userId: 2, role: "CLIENT", clientId: 7, clientName: "northwind sandbox", name: "QA Engineer" }) }))
  await page.goto("/")
  await page.getByRole("button", { name: "Create Test" }).first().click()
  await expect(page.getByRole("heading", { name: "Create a Test" })).toBeVisible()
}

async function mode(request: import("@playwright/test").APIRequestContext, value: string) {
  await request.post(`${ENGINE_URL}/__test__/planner-mode`, { headers: { Authorization: `Bearer ${TOKEN}` }, data: { mode: value } })
}

test.beforeEach(async ({ request }) => {
  await request.post(`${ENGINE_URL}/__test__/reset`)
  await mode(request, "plan")
})

test("live discovery progresses to review and confirms a draft", async ({ page }) => {
  await openBuilder(page)
  await page.getByPlaceholder("Describe what you want to verify...").fill("Verify a user can view products")
  await page.getByRole("button", { name: "Build Test" }).click()
  await expect(page.getByTestId("live-discovery-feed")).toBeVisible()
  await expect(page.getByText("Reading your request")).toBeVisible()
  await expect(page.getByText("Application loaded")).toBeVisible()
  await page.screenshot({ path: "test-results/live-discovery-mid-process.png", fullPage: true })
  await expect(page.getByRole("heading", { name: "Here's what Assuredia proposes" })).toBeVisible({ timeout: 15000 })
  await page.getByRole("button", { name: /Review Test/ }).click()
  await page.getByRole("button", { name: "Create Test Draft" }).click()
  await expect(page.getByRole("heading", { name: "Test Draft Created" })).toBeVisible()
})

test("cancel opens confirmation and returns to composer", async ({ page }) => {
  await openBuilder(page)
  await page.getByPlaceholder("Describe what you want to verify...").fill("Verify a user can view products")
  await page.getByRole("button", { name: "Build Test" }).click()
  await page.getByRole("button", { name: "Cancel Discovery" }).click()
  await expect(page.getByRole("heading", { name: "Cancel planning?" })).toBeVisible()
  await page.getByRole("dialog").locator("button").filter({ hasText: "Cancel" }).click()
  await expect(page.getByRole("heading", { name: "Create a Test" })).toBeVisible()
})

test("cancel decline closes the dialog and planning continues", async ({ page }) => {
  await openBuilder(page)
  await page.getByPlaceholder("Describe what you want to verify...").fill("Verify a user can view products")
  await page.getByRole("button", { name: "Build Test" }).click()
  await expect(page.getByTestId("live-discovery-feed")).toBeVisible()
  await page.getByRole("button", { name: "Cancel Discovery" }).click()
  await expect(page.getByRole("heading", { name: "Cancel planning?" })).toBeVisible()
  await page.getByRole("button", { name: "Continue" }).click()
  await expect(page.getByRole("heading", { name: "Cancel planning?" })).toBeHidden()
  await expect(page.getByTestId("live-discovery-feed")).toBeVisible()
  await expect(page.getByRole("heading", { name: "Here's what Assuredia proposes" })).toBeVisible({ timeout: 15000 })
})

test("failure shows recovery and Try Again returns to composer", async ({ page, request }) => {
  await mode(request, "failed:AI_TIMEOUT")
  await openBuilder(page)
  await page.getByPlaceholder("Describe what you want to verify...").fill("Verify a user can view products")
  await page.getByRole("button", { name: "Build Test" }).click()
  await expect(page.getByRole("heading", { name: "The plan took too long to generate. Try again." })).toBeVisible({ timeout: 15000 })
  await page.getByRole("button", { name: "Retry" }).click()
  await expect(page.getByRole("heading", { name: "Create a Test" })).toBeVisible()
})

test("failure Edit intent returns to the composer with the textarea focused", async ({ page, request }) => {
  await mode(request, "failed:AI_TIMEOUT")
  await openBuilder(page)
  await page.getByPlaceholder("Describe what you want to verify...").fill("Verify a user can view products")
  await page.getByRole("button", { name: "Build Test" }).click()
  await expect(page.getByRole("heading", { name: "The plan took too long to generate. Try again." })).toBeVisible({ timeout: 15000 })
  await page.getByRole("button", { name: "Edit intent" }).click()
  await expect(page.getByRole("heading", { name: "Create a Test" })).toBeVisible()
  await expect(page.getByPlaceholder("Describe what you want to verify...")).toBeFocused()
  // The original intent is preserved for editing.
  await expect(page.getByPlaceholder("Describe what you want to verify...")).toHaveValue("Verify a user can view products")
})

test("light mode renders the feed surface", async ({ page }) => {
  await openBuilder(page)
  await page.getByPlaceholder("Describe what you want to verify...").fill("Verify a user can view products")
  await page.getByRole("button", { name: "Build Test" }).click()
  await page.evaluate(() => document.documentElement.classList.remove("dark"))
  const feed = page.getByTestId("live-discovery-feed")
  await expect(feed).toBeVisible()
  await page.screenshot({ path: "test-results/live-discovery-light.png", fullPage: true })
})

test("Arabic feed mirrors direction and keeps connector on the right", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("assuredia_lang", "ar"))
  await page.addInitScript(([token]) => localStorage.setItem("assuredia.token", token as string), [TOKEN])
  await page.route("**/dashboard-api/auth/me", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ id: 2, userId: 2, role: "CLIENT", clientId: 7, clientName: "northwind sandbox", name: "QA Engineer" }) }))
  await page.goto("/")
  await page.getByRole("button", { name: "إنشاء اختبار" }).first().click()
  await expect(page.getByRole("heading", { name: "إنشاء اختبار" })).toBeVisible()
  await page.getByPlaceholder("صف ما تريد التحقق منه...").fill("تحقق من عرض المنتجات")
  await page.getByRole("button", { name: /بناء الاختبار/ }).click()
  const feed = page.getByTestId("live-discovery-feed")
  await expect(feed).toHaveAttribute("dir", "rtl")
  await expect(feed.locator("[class*='rtl:right-\\[19px\\]']")).toBeVisible()
  await page.screenshot({ path: "test-results/live-discovery-rtl.png", fullPage: true })
})
