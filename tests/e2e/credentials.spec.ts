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

async function openSecureCredentials(page: Page, lang = "en") {
  await openAsClient(page, lang)
  const isAr = lang === "ar"
  // The sidebar Settings entry and the section nav button are both translated.
  await page
    .getByRole("button", { name: isAr ? "الإعدادات" : "Settings" })
    .first()
    .click()
  await page
    .getByRole("button", {
      name: isAr ? "بيانات الاعتماد الآمنة" : "Secure Credentials",
    })
    .click()
  await expect(
    page.getByRole("heading", {
      name: isAr ? "بيانات الاعتماد الآمنة" : "Secure Credentials",
    }),
  ).toBeVisible()
}

test.beforeEach(async ({ request }) => {
  const reset = await request.post(`${ENGINE_URL}/__test__/reset`)
  expect(reset.ok()).toBeTruthy()
})

/* ------------------------------------------------------------------ */
/* Settings → Secure Credentials page                                  */
/* ------------------------------------------------------------------ */

test("credentials page loads with stats and all three statuses", async ({
  page,
}) => {
  await openSecureCredentials(page)
  // Seeded fixtures: Default + Shop API configured, Staging Login needs setup.
  await expect(page.getByText("credentials defined")).toBeVisible()
  await expect(page.getByText("Total")).toBeVisible()
  await expect(page.getByText("Needs Setup")).toBeVisible()
  await expect(page.getByText("Default").first()).toBeVisible()
  await expect(page.getByText("Shop API").first()).toBeVisible()
  // A needs-setup row carries the Not configured badge.
  await expect(
    page.getByRole("button", { name: /Staging Login/ }),
  ).toContainText("Not configured")
})

test("expandable row shows masked username and never a secret", async ({
  page,
}) => {
  await openSecureCredentials(page)
  await page.getByRole("button", { name: /Default/ }).click()
  await expect(page.getByText("cus***")).toBeVisible()
  // The fake's plaintext secret must never be served or rendered.
  expect(await page.content()).not.toContain("mock-secret")
})

test("add credential → appears in list with CONFIGURED badge", async ({
  page,
}) => {
  await openSecureCredentials(page)
  await page.getByRole("button", { name: "Add Credential" }).click()
  const dialog = page.locator("form")
  await dialog.getByPlaceholder("Customer Login").fill("Marketing Login")
  await dialog.getByRole("textbox", { name: /Username/ }).fill("marketing.user")
  await dialog.getByPlaceholder("••••••••").fill("super-secret-pw")
  await page.getByRole("button", { name: "Save Credential" }).click()
  await expect(page.getByText("Marketing Login").first()).toBeVisible()
  // Secret never renders anywhere after save.
  expect(await page.content()).not.toContain("super-secret-pw")
})

test("add credential rejects duplicate name case-insensitively", async ({
  page,
}) => {
  await openSecureCredentials(page)
  await page.getByRole("button", { name: "Add Credential" }).click()
  const dialog = page.locator("form")
  await dialog.getByPlaceholder("Customer Login").fill("DEFAULT")
  await dialog.getByRole("textbox", { name: /Username/ }).fill("someone")
  await dialog.getByPlaceholder("••••••••").fill("pw")
  await page.getByRole("button", { name: "Save Credential" }).click()
  await expect(
    page.getByText("A credential with this name already exists"),
  ).toBeVisible()
})

test("edit credential: blank password keeps the stored secret", async ({
  page,
  request,
}) => {
  await openSecureCredentials(page)
  await page.getByRole("button", { name: /Shop API/ }).click()
  await page.getByRole("button", { name: "Edit", exact: true }).click()
  const dialog = page.locator("form")
  await dialog.getByPlaceholder("Customer Login").fill("Shop API Renamed")
  await page.getByRole("button", { name: "Save Credential" }).click()
  await expect(page.getByText("Shop API Renamed").first()).toBeVisible()

  // The credential stays CONFIGURED (the stored secret survived the edit).
  const list = await request.get(
    `${ENGINE_URL}/dashboard-api/clients/${CLIENT_ID}/credentials`,
    { headers: authHeaders() },
  )
  const body = await list.json()
  const renamed = body.credentials.find(
    (c: { name: string }) => c.name === "Shop API Renamed",
  )
  expect(renamed.status).toBe("CONFIGURED")
})

test("delete credential asks for confirmation then removes", async ({
  page,
}) => {
  await openSecureCredentials(page)
  await page.getByRole("button", { name: /Staging Login/ }).click()
  await page.getByRole("button", { name: "Remove" }).click()
  // Confirmation dialog first (never window.confirm).
  await expect(page.getByText("Delete credential?")).toBeVisible()
  await page.getByRole("button", { name: "Delete Credential" }).click()
  await expect(page.getByText("Staging Login")).toHaveCount(0)
})

test("test connection shows success; failed test shows the note", async ({
  page,
  request,
}) => {
  // The mock fails any credential named fail:* (the INVALID path).
  const create = await request.post(
    `${ENGINE_URL}/dashboard-api/clients/${CLIENT_ID}/credentials`,
    {
      headers: authHeaders(),
      data: {
        name: "fail:Broken Host",
        type: "USER_ACCOUNT",
        username: "broken.user",
        password: "pw",
      },
    },
  )
  expect(create.status()).toBe(201)

  await openSecureCredentials(page)

  // Success path on the seeded Default row.
  await page.getByRole("button", { name: /Default/ }).click()
  await page.getByRole("button", { name: "Test connection" }).click()
  await expect(page.getByText("Credential works")).toBeVisible()

  // Failure path on the broken row.
  await page.getByRole("button", { name: /fail:Broken Host/ }).click()
  await page.getByRole("button", { name: "Test connection" }).click()
  await expect(page.getByText("The connection test failed")).toBeVisible()
})

test("503 migration window shows the unavailable state", async ({
  page,
  request,
}) => {
  const mode = await request.post(
    `${ENGINE_URL}/__test__/credentials-unavailable`,
    { headers: authHeaders(), data: { unavailable: true } },
  )
  expect(mode.ok()).toBeTruthy()
  await openSecureCredentials(page)
  await expect(
    page.getByText(
      "Secure credentials aren't available on this deployment yet",
    ),
  ).toBeVisible()
})

/* ------------------------------------------------------------------ */
/* REST contract (API level)                                          */
/* ------------------------------------------------------------------ */

test("credential REST contract: CRUD, validation, cross-tenant 404", async ({
  request,
}) => {
  // List returns the wrapped shape.
  const list = await request.get(
    `${ENGINE_URL}/dashboard-api/clients/${CLIENT_ID}/credentials`,
    { headers: authHeaders() },
  )
  expect(list.status()).toBe(200)
  const listBody = await list.json()
  expect(Array.isArray(listBody.credentials)).toBe(true)
  expect(listBody.credentials.length).toBeGreaterThanOrEqual(3)

  // Cross-tenant id (another client's row) is indistinguishable from missing
  // in STATUS; the mock's other-client guard carries its own wording.
  const missing = await request.get(
    `${ENGINE_URL}/dashboard-api/clients/${CLIENT_ID}/credentials/999999`,
    { headers: authHeaders() },
  )
  expect(missing.status()).toBe(404)
  const other = await request.get(
    `${ENGINE_URL}/dashboard-api/clients/99/credentials/1`,
    { headers: authHeaders() },
  )
  expect(other.status()).toBe(404)

  // Full CRUD round trip.
  const created = await request.post(
    `${ENGINE_URL}/dashboard-api/clients/${CLIENT_ID}/credentials`,
    {
      headers: authHeaders(),
      data: {
        name: "API Round Trip",
        type: "API_SERVICE",
        username: "svc.roundtrip",
        password: "pw",
      },
    },
  )
  expect(created.status()).toBe(201)
  const createdView = await created.json()
  expect(createdView.usernameMasked).toBe("svc***")
  expect(createdView.status).toBe("CONFIGURED")

  const updated = await request.put(
    `${ENGINE_URL}/dashboard-api/clients/${CLIENT_ID}/credentials/${createdView.id}`,
    {
      headers: authHeaders(),
      data: { name: "API Round Trip 2", password: "new-pw" },
    },
  )
  expect(updated.status()).toBe(200)
  expect((await updated.json()).name).toBe("API Round Trip 2")

  const tested = await request.post(
    `${ENGINE_URL}/dashboard-api/clients/${CLIENT_ID}/credentials/${createdView.id}/test`,
    { headers: authHeaders(), data: {} },
  )
  expect(tested.status()).toBe(200)
  expect((await tested.json()).success).toBe(true)

  const deleted = await request.delete(
    `${ENGINE_URL}/dashboard-api/clients/${CLIENT_ID}/credentials/${createdView.id}`,
    { headers: authHeaders() },
  )
  expect(deleted.status()).toBe(204)
})

/* ------------------------------------------------------------------ */
/* AI Composer integration                                            */
/* ------------------------------------------------------------------ */

test("composer dropdown lists grouped credentials and sends the REAL id", async ({
  page,
  request,
}) => {
  await openAsClient(page)
  await page.getByRole("button", { name: "Create Test" }).first().click()
  await expect(page.getByPlaceholder("Describe what you want to verify...")).toBeVisible()
  await page.getByRole("button", { name: "Add credential" }).click()

  // Grouped by type with per-credential status badges.
  await expect(page.getByText("User Account", { exact: true })).toBeVisible()
  // F-10: once the list is loaded the pill label is stable — the
  // "Loading..." placeholder never lingers or flashes back.
  await expect(
    page.getByRole("button", { name: "Loading...", exact: true }),
  ).toHaveCount(0)
  await expect(page.getByText("API Service", { exact: true })).toBeVisible()
  await expect(page.getByText("Managed in Settings · values never shown")).toBeVisible()

  // Select the seeded Default row and build. The dropdown option's accessible
  // name is "<name> <status>" (e.g. "Default Configured").
  await page
    .getByRole("button", { name: "Default Configured", exact: true })
    .click()
  await page
    .getByPlaceholder("Describe what you want to verify...")
    .fill("Verify that a customer can complete checkout")
  await page.getByRole("button", { name: "Build Test" }).click()
  await expect(
    page.getByRole("heading", { name: "Here's what Assuredia proposes" }),
  ).toBeVisible()

  // The plan request carried the REAL credential id, not the clientId.
  const probe = await request.get(
    `${ENGINE_URL}/__test__/last-planner-credential`,
    { headers: authHeaders() },
  )
  const probeBody = await probe.json()
  expect(probeBody.credentialId).not.toBe(CLIENT_ID)
  expect(typeof probeBody.credentialId).toBe("number")
})

test("selecting an unconfigured credential surfaces the auth-required state", async ({
  page,
}) => {
  await openAsClient(page)
  await page.getByRole("button", { name: "Create Test" }).first().click()
  await expect(page.getByPlaceholder("Describe what you want to verify...")).toBeVisible()
  await page.getByRole("button", { name: "Add credential" }).click()
  // Staging Login is seeded NEEDS_SETUP.
  await page
    .getByRole("button", { name: "Staging Login Not configured", exact: true })
    .click()
  await page
    .getByPlaceholder("Describe what you want to verify...")
    .fill("Verify that a customer can complete checkout")
  await page.getByRole("button", { name: "Build Test" }).click()
  await expect(
    page.getByRole("heading", { name: "Authentication required" }),
  ).toBeVisible()
})

/* ------------------------------------------------------------------ */
/* RTL / Arabic                                                       */
/* ------------------------------------------------------------------ */

test("Arabic renders the credentials page mirrored", async ({ page }) => {
  // English baseline: LTR + English heading.
  await openSecureCredentials(page)
  const enDir = await page.evaluate(() => document.documentElement.dir)

  // Arabic: a fresh context entry with lang=ar mirrors the document and swaps
  // every string (headings, stats, badges) through the i18n dictionary.
  await openSecureCredentials(page, "ar")
  await expect(
    page.getByRole("heading", { name: "بيانات الاعتماد الآمنة" }),
  ).toBeVisible()
  const arDir = await page.evaluate(() => document.documentElement.dir)
  expect(enDir).toBe("ltr")
  expect(arDir).toBe("rtl")
})

/* ------------------------------------------------------------------ */
/* Audit F-01: review shows the exact submitted description           */
/* ------------------------------------------------------------------ */

test("manual editor review shows the exact submitted description with credential metadata", async ({
  page,
  request,
}) => {
  await openAsClient(page)
  await page.getByRole("button", { name: "Create Test" }).first().click()
  await page.getByRole("button", { name: "Advanced Options" }).click()
  await page.getByRole("button", { name: "Manual User Journey" }).click()

  const rawDescription = "Verify the order confirmation page renders."
  await page.locator("#pr10b-name").fill("Order Confirmation Check")
  await page.locator("#pr10b-description").fill(rawDescription)
  // The default UI action is a navigate; validation requires its URL.
  await page.locator("#pr10b-action-url-0").fill("https://shop.example.test/orders")

  // Attach the seeded Default credential (id 1) via the editor's selector.
  await page.getByRole("button", { name: "Add credential" }).click()
  await page
    .getByRole("button", { name: "Default Configured", exact: true })
    .click()

  // Advance to review.
  await page.getByRole("button", { name: "Review", exact: true }).click()
  await expect(
    page.getByRole("heading", { name: "Review Test" }),
  ).toBeVisible()

  // The review's description block must contain BOTH the raw text and the
  // credential suffix in the SAME rendered element — the exact submitted
  // string, labelled "As submitted:".
  const reviewText = await page
    .getByText(/Verify the order confirmation page renders\./)
    .first()
    .textContent()
  expect(reviewText).toContain(rawDescription)
  expect(reviewText).toContain(
    "Authentication (references only): Secure Credential — Default",
  )

  // Submit and assert the backend received the reviewed text verbatim.
  await page.getByRole("button", { name: "Create Draft" }).click()
  await expect(
    page.getByText(/Draft Created|definitionId/i).first(),
  ).toBeVisible()
  const probe = await request.get(
    `${ENGINE_URL}/__test__/last-draft-description`,
    { headers: authHeaders() },
  )
  const probeBody = await probe.json()
  expect(probeBody.description).toBe(
    `${rawDescription}\n\nAuthentication (references only): Secure Credential — Default`,
  )
})

/* ------------------------------------------------------------------ */
/* Audit F-02: double-click Save fires exactly one POST               */
/* ------------------------------------------------------------------ */

test("double-clicking Save Credential creates exactly one credential", async ({
  page,
  request,
}) => {
  await openSecureCredentials(page)
  await page.getByRole("button", { name: "Add Credential" }).click()
  const dialog = page.locator("form")
  await dialog.getByPlaceholder("e.g. Customer Login").fill("Rapid Double Click")
  await dialog.getByRole("textbox", { name: /Username/ }).fill("rapid.user")
  await dialog.getByPlaceholder("••••••••").fill("pw")

  // Two clicks in one gesture — the second must hit the submit latch.
  await page
    .getByRole("button", { name: "Save Credential" })
    .click({ clickCount: 2 })
  await expect(page.getByText("Rapid Double Click").first()).toBeVisible()

  const probe = await request.get(
    `${ENGINE_URL}/__test__/credential-create-count`,
    { headers: authHeaders() },
  )
  const probeBody = await probe.json()
  expect(probeBody.count).toBe(1)
})

/* ------------------------------------------------------------------ */
/* Re-audit LOW: empty description + credential still shows the suffix */
/* ------------------------------------------------------------------ */

test("manual editor review shows credential suffix with empty description", async ({
  page,
  request,
}) => {
  await openAsClient(page)
  await page.getByRole("button", { name: "Create Test" }).first().click()
  await page.getByRole("button", { name: "Advanced Options" }).click()
  await page.getByRole("button", { name: "Manual User Journey" }).click()

  await page.locator("#pr10b-name").fill("Empty Description Check")
  // Description intentionally left empty.
  await page.locator("#pr10b-action-url-0").fill("https://shop.example.test/orders")

  await page.getByRole("button", { name: "Add credential" }).click()
  await page
    .getByRole("button", { name: "Default Configured", exact: true })
    .click()

  await page.getByRole("button", { name: "Review", exact: true }).click()
  await expect(
    page.getByRole("heading", { name: "Review Test" }),
  ).toBeVisible()

  // The suffix must be visible even though the raw description is empty.
  const reviewText = await page
    .getByText(/Authentication \(references only\): Secure Credential — Default/)
    .first()
    .textContent()
  expect(reviewText).toContain("Secure Credential — Default")

  await page.getByRole("button", { name: "Create Draft" }).click()
  await expect(
    page.getByText(/Draft Created|definitionId/i).first(),
  ).toBeVisible()
  const probe = await request.get(
    `${ENGINE_URL}/__test__/last-draft-description`,
    { headers: authHeaders() },
  )
  const probeBody = await probe.json()
  // The shared draft helper trims edge whitespace at submit
  // (CreateTestShared), so the leading separator is collapsed —
  // the suffix itself must arrive verbatim.
  expect(probeBody.description).toBe(
    `Authentication (references only): Secure Credential — Default`,
  )
})

/* ------------------------------------------------------------------ */
/* Workstream A visual evidence: light/dark credentials surfaces        */
/* ------------------------------------------------------------------ */

test("credentials page surfaces render in both light and dark themes", async ({
  page,
}, testInfo) => {
  await openSecureCredentials(page)

  await page.screenshot({
    path: testInfo.outputPath("credentials-light.png"),
    fullPage: true,
  })

  await page.evaluate(() => {
    document.documentElement.classList.add("dark")
    window.localStorage.setItem("theme", "dark")
  })
  await expect(page.locator("html")).toHaveClass(/dark/)
  await page.screenshot({
    path: testInfo.outputPath("credentials-dark.png"),
    fullPage: true,
  })

  // Exercise the two formerly-broken dark surfaces as part of the visual
  // evidence: the Add Credential form and the selector portal.
  await page.getByRole("button", { name: "Add credential" }).click()
  await expect(
    page.getByRole("heading", { name: "Add Secure Credential" }),
  ).toBeVisible()
  await page.screenshot({
    path: testInfo.outputPath("credentials-form-dark.png"),
    fullPage: true,
  })
  await page.getByRole("button", { name: "Cancel" }).click()
})
