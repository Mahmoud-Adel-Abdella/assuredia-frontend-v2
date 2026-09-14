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
  expect(res.status()).toBe(200)
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

async function setDiscoveryMode(
  request: APIRequestContext,
  mode: "completed" | "empty" | "truncated" | "failed" | "unavailable",
) {
  const response = await request.post(`${ENGINE_URL}/__test__/discovery-mode`, {
    data: { mode },
  })
  expect(response.ok()).toBeTruthy()
}

async function openCreateTest(page: Page) {
  await page.getByRole("button", { name: "Create Test" }).first().click()
  await expect(
    page.getByRole("heading", { name: "Create a Test" }),
  ).toBeVisible()
}

test("Create Test opens the AI composer immediately and hides discovery capabilities", async ({
  page,
}) => {
  await openAsClient(page)
  await openCreateTest(page)
  await expect(
    page.getByPlaceholder("Describe what you want to verify...")
  ).toBeVisible()
  await expect(page.getByText("UI Discovery", { exact: true })).toHaveCount(0)
  await expect(page.getByText("App Discovery", { exact: true })).toHaveCount(0)
  await expect(page.getByText("Backend Discovery", { exact: true })).toHaveCount(0)
  await expect(page.getByText("MCP Discovery", { exact: true })).toHaveCount(0)
})

test("Arabic Create Test mirrors document direction and translates discovery", async ({
  page,
}) => {
  await page.addInitScript(
    ([token]) => {
      window.localStorage.setItem("assuredia.token", token as string)
      window.localStorage.setItem("assuredia_lang", "ar")
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
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl")
  await page.getByRole("button", { name: "إنشاء اختبار" }).first().click()
  await expect(
    page.getByRole("heading", { name: "إنشاء اختبار" }),
  ).toBeVisible()
  await expect(page.getByPlaceholder("صف ما تريد التحقق منه...")).toBeVisible()
  await expect(page.getByText("استكشاف واجهة المستخدم", { exact: true })).toHaveCount(0)
})

async function createEditorDraftThroughWizard(
  page: Page,
  journey: "UI" | "API" | "MIXED",
  title: string,
) {
  await openCreateTest(page)
  await page.getByRole("button", { name: "Advanced Options" }).click()
  await page.getByRole("button", { name: "Manual User Journey" }).click()
  await page.locator("#pr10b-name").fill(title)
  await page.locator("#pr10b-description").fill(`Verify ${title}`)
  await page.locator("#pr10b-type").selectOption(journey)
  if (journey === "UI") {
    await page.locator("#pr10b-action-kind-0").selectOption("navigate")
    await page.locator("#pr10b-action-url-0").fill("/checkout")
  } else if (journey === "API") {
    await page.locator("#pr10b-endpoint").fill("/api/orders")
    await page.locator("#pr10b-status").fill("200")
  }
  await page.getByRole("button", { name: "Review", exact: true }).click()
  await page.getByRole("button", { name: "Create Draft" }).click()
  await expect(
    page.getByRole("heading", { name: "Draft Created" }),
  ).toBeVisible()
}

async function submitEditorDraftExpectingFailure(page: Page, title: string) {
  await openCreateTest(page)
  await page.getByRole("button", { name: "Advanced Options" }).click()
  await page.getByRole("button", { name: "Manual User Journey" }).click()
  await page.locator("#pr10b-name").fill(title)
  await page.locator("#pr10b-description").fill(`Verify ${title}`)
  await page.locator("#pr10b-type").selectOption("API")
  await page.locator("#pr10b-endpoint").fill("/api/orders")
  await page.getByRole("button", { name: "Review", exact: true }).click()
  await page.getByRole("button", { name: "Create Draft" }).click()
  await expect(page.getByText("Some details need attention")).toBeVisible()
}

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
  await page.getByRole("button", { name: "Create Test" }).first().click()
  await page.getByRole("button", { name: "Ask an Engineer" }).click()
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

for (const journey of ["UI", "API", "MIXED"] as const) {
  test(`${journey} Manual Editor creates a Draft and opens it`, async ({
    page,
  }) => {
    await openAsClient(page)
    page.on("pageerror", (err) => {
      throw new Error(`Dashboard error: ${err.message}`)
    })
    await expect(
      page.getByRole("heading", { name: /Good (morning|afternoon|evening)/ }),
    ).toBeVisible()
    const title = `E2E ${journey} editor ${Date.now()}`
    await createEditorDraftThroughWizard(page, journey, title)
    await page.getByRole("button", { name: "Open Test Definition" }).click()
    const editor = page.locator("#testdef-source-editor")
    await expect(editor).toBeVisible()
    const source = await editor.inputValue()
    const doc = JSON.parse(source)
    if (journey === "UI") {
      expect(doc.schemaVersion).toBe("1.1")
      expect(source).toContain("ui.navigate")
      expect(source).not.toContain("api.")
    } else {
      expect(doc.schemaVersion).toBe("1.1")
      expect(source).toContain("api.request")
      if (journey === "MIXED") expect(source).toContain("ui.navigate")
      else expect(source).not.toContain('"action": "ui.')
    }
  })
}

async function reopenDraftThroughRequests(page: Page, title: string) {
  await page.getByRole("button", { name: "Test Requests" }).first().click()
  await page.getByRole("button", { name: title }).first().click()
  await page.getByRole("button", { name: "Open Test Definition" }).click()
  const editor = page.locator("#testdef-source-editor")
  await expect(editor).toBeVisible()
  return editor.inputValue()
}

test("API Draft retains Schema 1.1 across save and reopen", async ({
  page,
}) => {
  await openAsClient(page)
  page.on("pageerror", (err) => {
    throw new Error(`Dashboard error: ${err.message}`)
  })
  await expect(
    page.getByRole("heading", { name: /Good (morning|afternoon|evening)/ }),
  ).toBeVisible()
  const title = `E2E API retain ${Date.now()}`
  await createEditorDraftThroughWizard(page, "API", title)
  await page.getByRole("button", { name: "Open Test Definition" }).click()
  const editor = page.locator("#testdef-source-editor")
  await expect(editor).toBeVisible()
  const source = await editor.inputValue()
  const doc = JSON.parse(source)
  doc.metadata.description = "edited in the browser"
  await editor.fill(JSON.stringify(doc, null, 2))
  await page.getByRole("button", { name: "Save draft" }).click()
  await expect(page.getByText("Draft saved").first()).toBeVisible()
  const again = await reopenDraftThroughRequests(page, title)
  expect(JSON.parse(again).schemaVersion).toBe("1.1")
  expect(again).toContain("api.request")
  expect(again).toContain("edited in the browser")
})

test("Mixed Draft keeps UI/API order across save and reopen", async ({
  page,
}) => {
  await openAsClient(page)
  page.on("pageerror", (err) => {
    throw new Error(`Dashboard error: ${err.message}`)
  })
  await expect(
    page.getByRole("heading", { name: /Good (morning|afternoon|evening)/ }),
  ).toBeVisible()
  const title = `E2E mixed order ${Date.now()}`
  await createEditorDraftThroughWizard(page, "MIXED", title)
  await page.getByRole("button", { name: "Open Test Definition" }).click()
  const editor = page.locator("#testdef-source-editor")
  await expect(editor).toBeVisible()
  const source = await editor.inputValue()
  expect(source.indexOf("api.request")).toBeLessThan(
    source.indexOf("ui.navigate"),
  )
  const doc = JSON.parse(source)
  doc.metadata.description = "mixed edit"
  await editor.fill(JSON.stringify(doc, null, 2))
  await page.getByRole("button", { name: "Save draft" }).click()
  await expect(page.getByText("Draft saved").first()).toBeVisible()
  const reopened = await reopenDraftThroughRequests(page, title)
  expect(JSON.parse(reopened).schemaVersion).toBe("1.1")
  expect(reopened.indexOf("api.request")).toBeLessThan(
    reopened.indexOf("ui.navigate"),
  )
})

test("journey mismatch is shown as a safe submission error", async ({
  page,
}) => {
  await openAsClient(page)
  page.on("pageerror", (err) => {
    throw new Error(`Dashboard error: ${err.message}`)
  })
  await page.route("**/dashboard-api/clients/*/test-definitions", (route) =>
    route.fulfill({
      status: 400,
      contentType: "application/json",
      body: JSON.stringify({
        error: "Definition is not compatible with journey type API",
      }),
    }),
  )
  await expect(
    page.getByRole("heading", { name: /Good (morning|afternoon|evening)/ }),
  ).toBeVisible()
  await submitEditorDraftExpectingFailure(page, `E2E mismatch ${Date.now()}`)
  await expect(
    page.getByText("Definition is not compatible with journey type API"),
  ).toBeVisible()
})

test("wizard review resolves the related flow's name, not its id (F-6)", async ({
  page,
}) => {
  await openAsClient(page)
  await page.getByRole("button", { name: "Create Test" }).first().click()
  await page.getByRole("button", { name: "Ask an Engineer" }).click()
  await page.getByRole("radio", { name: /UI Journey/ }).click()
  await page.getByRole("button", { name: /Next/ }).click()
  await page.getByRole("radio", { name: /Manual Request/ }).first().click()
  await page.getByRole("button", { name: /Next/ }).click()
  await page.locator("#tc-title").fill("E2E flow name check")
  await page.locator("#tc-desc").fill("Verify the review shows the flow name")
  // The seeded flow (mock engine FLOW id 300) is offered by NAME.
  await page.locator("#tc-flow").selectOption({ label: "Checkout" })
  await page.getByRole("button", { name: /Next/ }).click()
  await page.locator("#tc-objective").fill("Protect checkout revenue")
  await page.locator("#tc-journey").fill("Guest completes checkout")
  await page.locator("#tc-expected").fill("Order confirmation is shown")
  await page.getByRole("button", { name: /Next/ }).click()
  await expect(
    page.getByRole("heading", { name: "Request Summary" }),
  ).toBeVisible()
  // The Flow row shows the resolved flow NAME — never the bare id.
  await expect(page.getByText("Checkout", { exact: true })).toBeVisible()
})
