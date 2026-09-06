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

async function openAsClient(page: Page) {
  await page.addInitScript(
    ([token]) => {
      window.localStorage.setItem("assuredia.token", token as string)
      window.localStorage.setItem("assuredia_lang", "en")
      window.localStorage.removeItem("sidebarCollapsed")
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

test("client Manual Request creates one request and no immediate definition", async ({
  request,
}) => {
  const res = await request.post(
    `${ENGINE_URL}/dashboard-api/clients/${CLIENT_ID}/test-creation-requests`,
    {
      headers: authHeaders({ "Idempotency-Key": "req-1" }),
      data: {
        journeyType: "UI",
        title: "Guest checkout",
        description: "Verify checkout",
      },
    },
  )
  expect(res.status()).toBe(201)
  const row = await res.json()
  expect(row.status).toBe("SUBMITTED")
  expect(row.creationMethod).toBe("MANUAL_REQUEST")
  expect(row.definitionId).toBeNull()
})

test("client Manual Editor creates one request and one Draft", async ({
  request,
}) => {
  const res = await request.post(
    `${ENGINE_URL}/dashboard-api/clients/${CLIENT_ID}/test-definitions`,
    {
      headers: authHeaders({ "Idempotency-Key": "editor-1" }),
      data: {
        journeyType: "MIXED",
        name: "Mixed order flow",
        description: "API then UI",
      },
    },
  )
  expect(res.status()).toBe(201)
  const row = await res.json()
  expect(row.status).toBe("DRAFT_CREATED")
  expect(row.definitionId).toBeTruthy()
})

test("double submit and idempotent replay do not duplicate", async ({
  request,
}) => {
  const first = await request.post(
    `${ENGINE_URL}/dashboard-api/clients/${CLIENT_ID}/test-creation-requests`,
    {
      headers: authHeaders({ "Idempotency-Key": "dup-key" }),
      data: {
        journeyType: "API",
        title: "Orders API",
        description: "Check orders",
      },
    },
  )
  expect(first.status()).toBe(201)
  const a = await first.json()
  const replay = await request.post(
    `${ENGINE_URL}/dashboard-api/clients/${CLIENT_ID}/test-creation-requests`,
    {
      headers: authHeaders({ "Idempotency-Key": "dup-key" }),
      data: {
        journeyType: "API",
        title: "Orders API",
        description: "Check orders",
      },
    },
  )
  expect(replay.status()).toBe(201)
  const b = await replay.json()
  expect(b.id).toBe(a.id)
  const mismatch = await request.post(
    `${ENGINE_URL}/dashboard-api/clients/${CLIENT_ID}/test-creation-requests`,
    {
      headers: authHeaders({ "Idempotency-Key": "dup-key" }),
      data: {
        journeyType: "API",
        title: "Different",
        description: "Check orders",
      },
    },
  )
  expect(mismatch.status()).toBe(409)
  const list = await request.get(
    `${ENGINE_URL}/dashboard-api/clients/${CLIENT_ID}/test-creation-requests?limit=100`,
    {
      headers: authHeaders(),
    },
  )
  const body = await list.json()
  expect(body.total).toBe(1)
})

test("cross-tenant request is a safe 404 and validation is 400", async ({
  request,
}) => {
  const cross = await request.get(
    `${ENGINE_URL}/dashboard-api/clients/999/test-creation-requests`,
    {
      headers: authHeaders(),
    },
  )
  expect(cross.status()).toBe(404)
  const bad = await request.post(
    `${ENGINE_URL}/dashboard-api/clients/${CLIENT_ID}/test-creation-requests`,
    {
      headers: authHeaders({ "Idempotency-Key": "bad-1" }),
      data: { journeyType: "NOPE", title: "", description: "x" },
    },
  )
  expect(bad.status()).toBe(400)
})

test("admin review transitions and client cancellation work", async ({
  request,
}) => {
  const created = await request.post(
    `${ENGINE_URL}/dashboard-api/clients/${CLIENT_ID}/test-creation-requests`,
    {
      headers: authHeaders({ "Idempotency-Key": "flow-1" }),
      data: {
        journeyType: "UI",
        title: "Login flow",
        description: "Verify login",
      },
    },
  )
  const row = await created.json()
  const assign = await request.post(
    `${ENGINE_URL}/dashboard-api/admin/test-creation-requests/${row.id}/assign`,
    {
      headers: authHeaders(),
      data: { assignedTo: 1 },
    },
  )
  expect(assign.status()).toBe(200)
  expect((await assign.json()).status).toBe("IN_REVIEW")
  const start = await request.post(
    `${ENGINE_URL}/dashboard-api/admin/test-creation-requests/${row.id}/start`,
    {
      headers: authHeaders(),
    },
  )
  expect((await start.json()).status).toBe("IN_PROGRESS")
  const draft = await request.post(
    `${ENGINE_URL}/dashboard-api/admin/test-creation-requests/${row.id}/create-draft`,
    {
      headers: authHeaders(),
      data: { name: "Login flow", description: "Verify login" },
    },
  )
  expect(draft.status()).toBe(201)
  expect((await draft.json()).definitionId).toBeTruthy()

  const second = await request.post(
    `${ENGINE_URL}/dashboard-api/clients/${CLIENT_ID}/test-creation-requests`,
    {
      headers: authHeaders({ "Idempotency-Key": "flow-2" }),
      data: {
        journeyType: "UI",
        title: "Cancellable",
        description: "Cancel me",
      },
    },
  )
  const row2 = await second.json()
  const cancel = await request.post(
    `${ENGINE_URL}/dashboard-api/clients/${CLIENT_ID}/test-creation-requests/${row2.id}/cancel`,
    { headers: authHeaders() },
  )
  expect((await cancel.json()).status).toBe("CANCELLED")
})

test("client wizard submits a Manual Request through the UI", async ({
  page,
}) => {
  await openAsClient(page)
  page.on("pageerror", (err) => {
    throw new Error(`Dashboard error: ${err.message}`)
  })
  await expect(
    page.getByRole("heading", { name: /Good (morning|afternoon|evening)/ }),
  ).toBeVisible()
  await page.getByRole("button", { name: "New Test" }).first().click()
  await page.getByRole("button", { name: "Create Manual Request" }).click()
  await page.getByRole("radio", { name: /UI Journey/ }).click()
  await page.getByRole("button", { name: /Next/ }).click()
  await page
    .getByRole("radio", { name: /Manual Request/ })
    .first()
    .click()
  await page.getByRole("button", { name: /Next/ }).click()
  await page.locator("#tc-title").fill("E2E guest checkout")
  await page.locator("#tc-desc").fill("Verify guest checkout works")
  await page.getByRole("button", { name: /Next/ }).click()
  await page.locator("#tc-objective").fill("Protect checkout revenue")
  await page
    .locator("#tc-journey")
    .fill("Guest adds item, checks out, sees confirmation")
  await page.locator("#tc-expected").fill("Order confirmation is shown")
  await page.getByRole("button", { name: /Next/ }).click()
  await page.getByRole("button", { name: "Submit Request" }).click()
  await expect(
    page.getByRole("heading", { name: "Request Submitted" }),
  ).toBeVisible()
  await page.getByRole("button", { name: "View Creation Requests" }).click()
  await expect(page.getByText("E2E guest checkout").first()).toBeVisible()
})
