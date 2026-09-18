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
  await expect(page.getByPlaceholder("Describe what you want to verify...")).toBeVisible()
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
  await page.getByRole("radio", { name: "End-to-End" }).click()
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
  await expect(page.getByText("GET").first()).toBeVisible()
  await expect(page.getByText("/api/products").first()).toBeVisible()
  await page.getByRole("button", { name: "View Evidence" }).click()
  await expect(page.getByRole("dialog")).toBeVisible()
  await expect(page.getByRole("dialog").getByText("Discovery Evidence")).toBeVisible()
  await expect(page.getByRole("dialog").getByText("Showing first 1 of 60")).toBeVisible()
  await page.getByRole("button", { name: "Network Activity" }).click()
  await expect(page.getByRole("dialog").getByText("Failed")).toBeVisible()
  await expect(page.getByRole("dialog").getByText("/api/products/{id}?token=***")).toBeVisible()
  await page.getByRole("dialog").getByRole("button", { name: "Close evidence" }).click()
  await expect(page.getByRole("dialog")).toBeHidden()
  await page.getByRole("button", { name: "Create Test Draft" }).click()
  await expect(
    page.getByRole("heading", { name: "Test Draft Created" }),
  ).toBeVisible()
  await page.getByRole("button", { name: /Open Test/ }).click()
  await expect(page.getByText("Mock planned test").first()).toBeVisible()
})

test("UI-only composition deletion shows the specific confirm message", async ({
  page,
}) => {
  await openAsClient(page)
  await openAiBuilder(page)
  await page.getByRole("radio", { name: "End-to-End" }).click()
  await fillAndBuild(page, "Verify that a customer can complete checkout")
  await expect(page.getByText("Verify product availability").first()).toBeVisible()
  await page.getByText("Verify product availability").first().click()
  await page.getByRole("button", { name: /delete/i }).click()
  await page.getByRole("button", { name: /Review Test/ }).click()
  await page.route("**/test-plans/*/confirm", (route) =>
    route.fulfill({
      status: 400,
      contentType: "application/json",
      body: JSON.stringify({
        error: "Deleting the API steps changed this End-to-End plan into a UI-only plan. Create a new User Journey test, or add API steps back.",
      }),
    }),
  )
  await page.getByRole("button", { name: "Create Test Draft" }).click()
  await expect(
    page.getByText("Deleting the API steps turned this into a UI-only plan. Create a User Journey test instead.", { exact: true }),
  ).toBeVisible()
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

test("HTTP 200 CREDENTIAL_REQUIRED maps the credential-required copy", async ({
  page,
  request,
}) => {
  // PR10C.5 Phase 0 / L-1: the backend delivers CREDENTIAL_REQUIRED over
  // HTTP 200 (clarification-shaped) with the same FAILED body; the builder
  // must map it to the credential copy, not the generic invalid-output one.
  await setPlannerMode(request, "failed:CREDENTIAL_REQUIRED")
  const api = await request.post(
    `${ENGINE_URL}/dashboard-api/clients/${CLIENT_ID}/test-plans`,
    {
      headers: authHeaders(),
      data: { intent: "Verify previous orders", requestedType: "USER_JOURNEY" },
    },
  )
  expect(api.status()).toBe(200)
  expect((await api.json()).errorCategory).toBe("CREDENTIAL_REQUIRED")

  await openAsClient(page)
  await openAiBuilder(page)
  await fillAndBuild(page, "Verify previous orders")
  await expect(
    page.getByRole("heading", {
      name: "This test requires a Secure Credential. Select one to continue.",
    }),
  ).toBeVisible()
  await expect(
    page.getByRole("heading", {
      name: "The plan could not be finalized. Try again or adjust your request.",
    }),
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
  // PR10C.5 Phase 2: the composer's credential dropdown now lists the real
  // credential rows (grouped by type) instead of the pre-018 single-credential
  // pill sourced from client details.
  await openAsClient(page)
  await openAiBuilder(page)
  await page.getByRole("button", { name: "Add credential" }).click()
  await expect(
    page.getByRole("button", { name: "Default Configured", exact: true }),
  ).toBeVisible()
  await expect(page.getByText("User Account", { exact: true })).toBeVisible()
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

/* PR10D.5 D-7: Backend Check also needs the base_url — backend discovery
 * probes the API spec on the client's configured origin, so the API chip must
 * hit the same preflight gate instead of an opaque backend rejection. */
test("missing origin shows the preflight state for Backend Check (PR10D.5 D-7)", async ({
  page,
}) => {
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
  await page.getByRole("radio", { name: "Backend Check" }).click()
  await fillAndBuild(page, "Verify the orders API is healthy")
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
    page.getByPlaceholder("صف ما تريد التحقق منه..."),
  ).toBeVisible()
  await page.getByPlaceholder("صف ما تريد التحقق منه...").fill("تحقق من مسار الدفع بالكامل")
  await page.getByRole("button", { name: "بناء الاختبار" }).click()
  await expect(page.getByRole("button", { name: "عرض الدليل" })).toBeVisible()
  await page.getByRole("button", { name: "عرض الدليل" }).click()
  await expect(page.getByRole("dialog")).toBeVisible()
  await expect(page.getByRole("dialog").getByText("دليل الاستكشاف")).toBeVisible()
  await page.getByRole("dialog").getByRole("button", { name: "نشاط الشبكة" }).click()
  await expect(page.getByRole("dialog").getByText("/api/products/{id}?token=***")).toBeVisible()
})

/* ------------------------------------------------------------------ */
/* F-7: deleting a proposed step prunes its expected result            */
/* ------------------------------------------------------------------ */

test("deleting a proposed step removes its expected result (F-7)", async ({
  page,
}) => {
  await openAsClient(page)
  await openAiBuilder(page)
  await fillAndBuild(page, "Verify the complete checkout journey")
  await expect(
    page.getByRole("heading", { name: "Here's what Assuredia proposes" }),
  ).toBeVisible()

  // The mock plan ships one expected result ("It works"), attached to the
  // first step. Delete that step and the outcome must go with it.
  await expect(page.getByText("It works")).toBeVisible()
  await page.getByRole("button", { name: /Search for a product/ }).click()
  await page.getByRole("button", { name: "Delete action" }).click()
  await expect(page.getByText("It works")).toHaveCount(0)
  // The surviving step keeps the plan coherent.
  await expect(
    page.getByText("Add the product to the cart"),
  ).toBeVisible()
})

/* ------------------------------------------------------------------ */
/* F-8: the composer explains its minimum intent length                */
/* ------------------------------------------------------------------ */

test("a short intent shows the min-length hint until the threshold is reached (F-8)", async ({
  page,
}) => {
  await openAsClient(page)
  await openAiBuilder(page)
  const input = page.getByPlaceholder("Describe what you want to verify...")

  await input.fill("Test it")
  await expect(
    page.getByText("Describe your test in at least 11 characters."),
  ).toBeVisible()
  await expect(page.getByRole("button", { name: "Build Test" })).toBeDisabled()

  await input.fill("Test it please")
  await expect(
    page.getByText("Describe your test in at least 11 characters."),
  ).toHaveCount(0)
  await expect(page.getByRole("button", { name: "Build Test" })).toBeEnabled()
})

/* ------------------------------------------------------------------ */
/* Workstream B visual/architecture evidence                            */
/* ------------------------------------------------------------------ */

test("Create Test lands on AI Builder with hidden discovery and collapsed advanced options", async ({
  page,
}, testInfo) => {
  await openAsClient(page)
  await openAiBuilder(page)

  await expect(
    page.getByPlaceholder("Describe what you want to verify..."),
  ).toBeVisible()
  await expect(page.getByText("UI Discovery", { exact: true })).toHaveCount(0)
  await expect(page.getByText("App Discovery", { exact: true })).toHaveCount(0)
  await expect(page.getByText("Backend Discovery", { exact: true })).toHaveCount(0)
  await expect(page.getByText("MCP Discovery", { exact: true })).toHaveCount(0)

  const advanced = page.getByRole("button", { name: "Advanced Options" })
  await expect(advanced).toBeVisible()
  await expect(advanced).toHaveAttribute("aria-expanded", "false")
  await page.screenshot({
    path: testInfo.outputPath("create-test-ai-first.png"),
    fullPage: true,
  })

  await advanced.click()
  await expect(advanced).toHaveAttribute("aria-expanded", "true")
  await expect(page.getByRole("button", { name: "Manual User Journey" })).toBeVisible()
  await expect(page.getByRole("button", { name: "Manual Backend Check" })).toBeVisible()
})
