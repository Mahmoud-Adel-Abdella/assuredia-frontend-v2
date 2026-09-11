import {
  expect,
  test,
  type APIRequestContext,
  type Page,
} from "@playwright/test"

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

async function setPlannerMode(request: APIRequestContext, mode: string) {
  const res = await request.post(`${ENGINE_URL}/__test__/planner-mode`, {
    headers: authHeaders(),
    data: { mode },
  })
  expect(res.ok()).toBeTruthy()
}

async function openAiBuilder(page: Page) {
  await page.getByRole("button", { name: "Create Test" }).first().click()
  await expect(
    page.getByRole("heading", { name: "Create a Test" }),
  ).toBeVisible()
  await page.getByRole("button", { name: "Start Building" }).click()
}

async function fillAndBuild(page: Page, intent: string) {
  await page
    .getByPlaceholder("Describe what you want to verify...")
    .fill(intent)
  await page.getByRole("button", { name: "Build Test" }).click()
}

test.beforeEach(async ({ request }) => {
  const reset = await request.post(`${ENGINE_URL}/__test__/reset`)
  expect(reset.ok()).toBeTruthy()
  await setPlannerMode(request, "plan")
})

test("planner API contract shapes", async ({ request }) => {
  const created = await request.post(
    `${ENGINE_URL}/dashboard-api/clients/${CLIENT_ID}/test-plans`,
    {
      headers: authHeaders(),
      data: { intent: "Verify checkout", requestedType: "USER_JOURNEY" },
    },
  )
  expect(created.status()).toBe(200)
  const plan = await created.json()
  expect(plan.status).toBe("PLAN_READY")
  expect(plan.testType).toBe("USER_JOURNEY")
  expect(Array.isArray(plan.steps)).toBe(true)
  expect(plan.definitionSourceJson).toBeTruthy()

  const badType = await request.post(
    `${ENGINE_URL}/dashboard-api/clients/${CLIENT_ID}/test-plans`,
    {
      headers: authHeaders(),
      data: { intent: "Verify checkout", requestedType: "NOPE" },
    },
  )
  expect(badType.status()).toBe(400)

  const noKey = await request.post(
    `${ENGINE_URL}/dashboard-api/clients/${CLIENT_ID}/test-plans/${plan.planId}/confirm`,
    { headers: authHeaders(), data: {} },
  )
  expect(noKey.status()).toBe(400)

  const unknown = await request.post(
    `${ENGINE_URL}/dashboard-api/clients/${CLIENT_ID}/test-plans/plan-999/confirm`,
    { headers: authHeaders({ "Idempotency-Key": "k-unknown" }), data: {} },
  )
  expect(unknown.status()).toBe(404)
})

test("AI Builder full flow: build, review, confirm, open", async ({
  page,
}) => {
  await openAsClient(page)
  await openAiBuilder(page)
  await fillAndBuild(page, "Verify that a customer can complete checkout")
  await expect(
    page.getByRole("heading", { name: "Here's what Assuredia proposes" }),
  ).toBeVisible()
  await expect(page.getByText("Search for a product").first()).toBeVisible()
  await page.getByRole("button", { name: /Review Test/ }).click()
  await expect(
    page.getByRole("heading", { name: "Review your test" }),
  ).toBeVisible()
  await expect(page.getByText("https://shop.example.test")).toBeVisible()
  await page.getByRole("button", { name: "Create Test Draft" }).click()
  await expect(
    page.getByRole("heading", { name: "Test Draft Created" }),
  ).toBeVisible()
  await page.getByRole("button", { name: /Open Test/ }).click()
  await expect(page.getByText("Mock planned test").first()).toBeVisible()
})

test("network-failed confirm retries with the same key", async ({
  page,
}) => {
  await openAsClient(page)
  await openAiBuilder(page)
  await fillAndBuild(page, "Verify that a customer can complete checkout")
  await expect(
    page.getByRole("heading", { name: "Here's what Assuredia proposes" }),
  ).toBeVisible()
  await page.getByRole("button", { name: /Review Test/ }).click()
  await expect(
    page.getByRole("heading", { name: "Review your test" }),
  ).toBeVisible()

  const keys: (string | null)[] = []
  await page.route("**/test-plans/*/confirm", async (route) => {
    keys.push(await route.request().headerValue("idempotency-key"))
    if (keys.length === 1) await route.abort()
    else await route.continue()
  })
  await page.getByRole("button", { name: "Create Test Draft" }).click()
  await expect(
    page.getByText("Could not reach Assuredia. Check your connection", {
      exact: false,
    }),
  ).toBeVisible()
  await page.getByRole("button", { name: "Try again" }).click()
  await expect(
    page.getByRole("heading", { name: "Test Draft Created" }),
  ).toBeVisible()
  expect(keys.length).toBe(2)
  expect(keys[0]).toBeTruthy()
  expect(keys[1]).toBe(keys[0])
})

test("clarification answers rebuild the plan", async ({ page, request }) => {
  await setPlannerMode(request, "clarification")
  await openAsClient(page)
  await openAiBuilder(page)
  await fillAndBuild(page, "Test the thing somehow")
  await expect(
    page.getByRole("heading", { name: "I need a bit more detail" }),
  ).toBeVisible()
  await expect(
    page.getByText("Which checkout flow should be verified?"),
  ).toBeVisible()
  await setPlannerMode(request, "plan")
  await page.getByPlaceholder("Type your answer...").fill("Guest checkout")
  await page.getByRole("button", { name: "Continue Planning" }).click()
  await expect(
    page.getByRole("heading", { name: "Here's what Assuredia proposes" }),
  ).toBeVisible()
})

test("failure maps the timeout message with retry", async ({
  page,
  request,
}) => {
  await setPlannerMode(request, "failed:AI_TIMEOUT")
  await openAsClient(page)
  await openAiBuilder(page)
  await fillAndBuild(page, "Verify that a customer can complete checkout")
  await expect(
    page.getByRole("heading", {
      name: "The plan took too long to generate. Try again.",
    }),
  ).toBeVisible()
  await setPlannerMode(request, "plan")
  await page.getByRole("button", { name: "Retry" }).click()
  await expect(
    page.getByRole("heading", { name: "Here's what Assuredia proposes" }),
  ).toBeVisible()
})

test("HTTP 503 FAILED maps the credential message, not the generic one", async ({
  page,
  request,
}) => {
  await setPlannerMode(request, "failed:CREDENTIAL_UNAVAILABLE")
  await openAsClient(page)
  await openAiBuilder(page)
  await fillAndBuild(page, "Verify that a customer can complete checkout")
  await expect(
    page.getByRole("heading", {
      name: "The selected credential is not available. Choose another.",
    }),
  ).toBeVisible()
  await expect(
    page.getByText("AI Test Builder is temporarily unavailable", { exact: false }),
  ).toHaveCount(0)
})

test("expired plan shows the expired message", async ({ page }) => {
  await openAsClient(page)
  await page.route("**/test-plans/*/confirm", (route) =>
    route.fulfill({
      status: 404,
      contentType: "application/json",
      body: JSON.stringify({ error: "Test plan not found" }),
    }),
  )
  await openAiBuilder(page)
  await fillAndBuild(page, "Verify that a customer can complete checkout")
  await expect(
    page.getByRole("heading", { name: "Here's what Assuredia proposes" }),
  ).toBeVisible()
  await page.getByRole("button", { name: /Review Test/ }).click()
  await page.getByRole("button", { name: "Create Test Draft" }).click()
  await expect(
    page.getByRole("heading", {
      name: "This plan has expired. Please create a new one.",
    }),
  ).toBeVisible()
})

test("duplicate confirm navigates to drafts", async ({ page }) => {
  await openAsClient(page)
  await page.route("**/test-plans/*/confirm", (route) =>
    route.fulfill({
      status: 409,
      contentType: "application/json",
      body: JSON.stringify({
        error: "Idempotency key reused with different parameters",
      }),
    }),
  )
  await openAiBuilder(page)
  await fillAndBuild(page, "Verify that a customer can complete checkout")
  await expect(
    page.getByRole("heading", { name: "Here's what Assuredia proposes" }),
  ).toBeVisible()
  await page.getByRole("button", { name: /Review Test/ }).click()
  await page.getByRole("button", { name: "Create Test Draft" }).click()
  await expect(
    page.getByRole("heading", { name: "Already confirmed" }),
  ).toBeVisible()
  await page.getByRole("button", { name: "View in Drafts" }).click()
  await expect(
    page.getByRole("heading", { name: "Drafts & Reviews" }),
  ).toBeVisible()
})

test("credential pill reflects the configured credential", async ({
  page,
}) => {
  await openAsClient(page)
  await openAiBuilder(page)
  await page.getByRole("button", { name: "Add credential" }).click()
  await expect(page.getByText("customer").first()).toBeVisible()
  await expect(page.getByText("Configured").first()).toBeVisible()
  await expect(
    page.getByText("Managed in Settings · values never shown"),
  ).toBeVisible()
})

test("missing origin shows the preflight state", async ({ page }) => {
  await openAsClient(page)
  await page.route("**/dashboard-api/clients/7", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        client: {
          id: CLIENT_ID,
          client_name: "northwind sandbox",
          base_url: null,
          site_username: null,
          site_password_set: false,
        },
        flows: [],
      }),
    }),
  )
  await openAiBuilder(page)
  await fillAndBuild(page, "Verify that a customer can complete checkout")
  await expect(
    page.getByRole("heading", {
      name: "Target application not configured",
    }),
  ).toBeVisible()
})

test("Arabic renders the builder mirrored", async ({ page }) => {
  await openAsClient(page, "ar")
  await page.getByRole("button", { name: "إنشاء اختبار" }).first().click()
  await expect(
    page.getByRole("heading", { name: "إنشاء اختبار" }),
  ).toBeVisible()
  const dir = await page.evaluate(() => document.documentElement.dir)
  expect(dir).toBe("rtl")
  await expect(
    page.getByRole("button", { name: "بدء البناء" }),
  ).toBeVisible()
})
