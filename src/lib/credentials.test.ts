import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

import { ApiError } from "./api"
import {
  CREDENTIAL_NAME_MAX,
  DRAFT_DESCRIPTION_MAX,
  buildFinalDescription,
  createSubmitLatch,
  credentialStats,
  descriptionOverflow,
  formatLastUsed,
  groupByType,
  isCredentialConfigured,
  mapCredentialError,
  testResultMessage,
  toCreateRequest,
  toUpdateRequest,
  unmaskPrefix,
  validateCredentialForm,
  type CredentialFormValues,
} from "./credentials"
import type { CredentialView } from "./api"

/* ------------------------------------------------------------------ */
/* Fixtures                                                            */
/* ------------------------------------------------------------------ */

function view(overrides: Partial<CredentialView> = {}): CredentialView {
  return {
    id: 70,
    name: "Customer Login",
    type: "USER_ACCOUNT",
    status: "CONFIGURED",
    usernameMasked: "sho***",
    lastUsedAt: null,
    useCount: 0,
    ...overrides,
  }
}

const validationCopy = {
  nameRequired: "A credential name is required.",
  nameTooLong: "The credential name must be at most 120 characters.",
  usernameRequired: "A username is required.",
  passwordRequired: "A password is required.",
}

const errorCopy = {
  validation: "validation",
  conflict: "conflict",
  notFound: "not found",
  unavailable: "unavailable",
  network: "network",
  fallback: "fallback",
}

function form(overrides: Partial<CredentialFormValues> = {}): CredentialFormValues {
  return {
    name: "Staging Login",
    type: "USER_ACCOUNT",
    username: "staging.user",
    password: "pw-123",
    ...overrides,
  }
}

/* ------------------------------------------------------------------ */
/* Display helpers                                                     */
/* ------------------------------------------------------------------ */

test("credentials domain helpers", async (t) => {
  await t.test("isCredentialConfigured is true only for CONFIGURED", () => {
    assert.equal(isCredentialConfigured(view({ status: "CONFIGURED" })), true)
    assert.equal(isCredentialConfigured(view({ status: "NEEDS_SETUP" })), false)
    assert.equal(isCredentialConfigured(view({ status: "INVALID" })), false)
  })

  await t.test("groupByType groups in a stable order and skips empty groups", () => {
    const groups = groupByType([
      view({ id: 1, name: "A", type: "API_SERVICE" }),
      view({ id: 2, name: "B", type: "USER_ACCOUNT" }),
      view({ id: 3, name: "C", type: "USER_ACCOUNT" }),
    ])
    assert.deepEqual(
      groups.map((g) => [g.type, g.credentials.map((c) => c.id)]),
      [
        ["USER_ACCOUNT", [2, 3]],
        ["API_SERVICE", [1]],
      ]
    )
    assert.equal(groupByType([]).length, 0)
  })

  await t.test("groupByType defends against an unknown type", () => {
    const groups = groupByType([
      // The frozen contract can't produce this, but the UI must not crash.
      view({ type: "SOMETHING_ELSE" as CredentialView["type"] }),
    ])
    assert.equal(groups.length, 1)
    assert.equal(groups[0].type, "USER_ACCOUNT")
  })

  await t.test("unmaskPrefix exposes only the visible prefix", () => {
    assert.equal(unmaskPrefix(view({ usernameMasked: "sho***" })), "sho")
    assert.equal(unmaskPrefix(view({ usernameMasked: null })), "")
  })

  await t.test("formatLastUsed renders or degrades safely", () => {
    const formatted = formatLastUsed(
      view({ lastUsedAt: "2026-09-01T10:00:00Z" }),
      "en-US"
    )
    assert.ok(formatted != null && formatted.length > 0)
    assert.equal(formatLastUsed(view({ lastUsedAt: null }), "en-US"), null)
    assert.equal(
      formatLastUsed(view({ lastUsedAt: "not-a-date" }), "en-US"),
      null
    )
  })

  await t.test("credentialStats counts configured and needs-setup (incl. INVALID)", () => {
    const stats = credentialStats([
      view({ status: "CONFIGURED" }),
      view({ status: "NEEDS_SETUP" }),
      view({ status: "INVALID" }),
    ])
    assert.deepEqual(stats, { total: 3, configured: 1, needsSetup: 2 })
  })

  await t.test("testResultMessage prefers the customer copy on success", () => {
    assert.equal(
      testResultMessage(
        { success: true, message: "backend text" },
        { works: "Credential works", failed: "failed" }
      ),
      "Credential works"
    )
    assert.equal(
      testResultMessage(
        { success: false, message: "" },
        { works: "works", failed: "The connection test failed" }
      ),
      "The connection test failed"
    )
  })
})

/* ------------------------------------------------------------------ */
/* Form validation                                                    */
/* ------------------------------------------------------------------ */

test("credential form validation", async (t) => {
  await t.test("create requires name, username, and password", () => {
    assert.deepEqual(validateCredentialForm(form(), "create", validationCopy), {})
    assert.deepEqual(
      validateCredentialForm(form({ name: "  " }), "create", validationCopy),
      { name: validationCopy.nameRequired }
    )
    assert.deepEqual(
      validateCredentialForm(form({ name: "x".repeat(121) }), "create", validationCopy),
      { name: validationCopy.nameTooLong }
    )
    assert.deepEqual(
      validateCredentialForm(form({ username: " " }), "create", validationCopy),
      { username: validationCopy.usernameRequired }
    )
    assert.deepEqual(
      validateCredentialForm(form({ password: "" }), "create", validationCopy),
      { password: validationCopy.passwordRequired }
    )
  })

  await t.test("edit allows a blank password (keep the stored secret)", () => {
    assert.deepEqual(
      validateCredentialForm(form({ password: "" }), "edit", validationCopy),
      {}
    )
    // 120 chars is the exact boundary.
    assert.deepEqual(
      validateCredentialForm(
        form({ name: "x".repeat(CREDENTIAL_NAME_MAX) }),
        "edit",
        validationCopy
      ),
      {}
    )
  })

  await t.test("edit allows a blank username (keep the stored value)", () => {
    assert.deepEqual(
      validateCredentialForm(form({ username: "", password: "" }), "edit", validationCopy),
      {}
    )
    // Only the name remains mandatory on edit.
    assert.deepEqual(
      validateCredentialForm(form({ name: "", username: "", password: "" }), "edit", validationCopy),
      { name: validationCopy.nameRequired }
    )
  })
})

/* ------------------------------------------------------------------ */
/* Request builders                                                   */
/* ------------------------------------------------------------------ */

test("credential request builders", async (t) => {
  await t.test("toCreateRequest trims visible fields, never the password", () => {
    const body = toCreateRequest(
      form({ name: "  Staging  ", username: " user ", password: "  keep spaces  " })
    )
    assert.equal(body.name, "Staging")
    assert.equal(body.username, "user")
    assert.equal(body.password, "  keep spaces  ")
    assert.equal(body.type, "USER_ACCOUNT")
  })

  await t.test("toUpdateRequest omits blank fields (keep stored values)", () => {
    const body = toUpdateRequest(
      form({ name: "  ", username: "  ", password: "" })
    )
    // Type is always sent (closed vocabulary, current selection authoritative).
    assert.deepEqual(body, { type: "USER_ACCOUNT" })
  })

  await t.test("toUpdateRequest sends replaced fields", () => {
    const body = toUpdateRequest(
      form({ name: "Renamed", username: "new-user", password: "new-pw", type: "API_SERVICE" })
    )
    assert.deepEqual(body, {
      name: "Renamed",
      username: "new-user",
      password: "new-pw",
      type: "API_SERVICE",
    })
  })
})

/* ------------------------------------------------------------------ */
/* Error mapping                                                      */
/* ------------------------------------------------------------------ */

test("credential error mapping", async (t) => {
  await t.test("400 maps to validation with inferred field", () => {
    const mapped = mapCredentialError(
      new ApiError(400, "The credential name must be between 1 and 120 characters"),
      errorCopy
    )
    assert.equal(mapped.message, errorCopy.validation)
    assert.equal(mapped.field, "name")
  })

  await t.test("409 maps to the duplicate-name conflict on the name field", () => {
    const mapped = mapCredentialError(
      new ApiError(409, "A credential with this name already exists for this client"),
      errorCopy
    )
    assert.equal(mapped.message, errorCopy.conflict)
    assert.equal(mapped.field, "name")
  })

  await t.test("404 maps to stale/not-found", () => {
    const mapped = mapCredentialError(
      new ApiError(404, "The credential does not exist"),
      errorCopy
    )
    assert.equal(mapped.message, errorCopy.notFound)
    assert.equal(mapped.stale, true)
  })

  await t.test("503 maps to the migration-window copy", () => {
    const mapped = mapCredentialError(
      new ApiError(503, "Secure credentials aren't available on this deployment yet"),
      errorCopy
    )
    assert.equal(mapped.message, errorCopy.unavailable)
  })

  await t.test("network (status 0) maps to the network copy", () => {
    const mapped = mapCredentialError(new ApiError(0, "unreachable"), errorCopy)
    assert.equal(mapped.message, errorCopy.network)
  })

  await t.test("unexpected statuses and non-ApiError values map to fallback", () => {
    assert.equal(
      mapCredentialError(new ApiError(500, "boom"), errorCopy).message,
      errorCopy.fallback
    )
    assert.equal(mapCredentialError(new Error("nope"), errorCopy).message, errorCopy.fallback)
  })
})

/* ------------------------------------------------------------------ */
/* Audit F-01: final description (single source of truth + overflow)  */
/* ------------------------------------------------------------------ */

test("audit F-01: buildFinalDescription + overflow guard", async (t) => {
  await t.test("no credential -> the raw description, byte for byte", () => {
    assert.equal(buildFinalDescription("Check the order page.", null), "Check the order page.")
    assert.equal(buildFinalDescription("", null), "")
  })

  await t.test("with credential -> fixed suffix appended once", () => {
    const combined = buildFinalDescription("Check the order page.", "Customer Login")
    assert.equal(
      combined,
      "Check the order page.\n\nAuthentication (references only): Secure Credential — Customer Login"
    )
    // Idempotent shape: the suffix is exactly the credential metadata block.
    assert.ok(combined.endsWith("Secure Credential — Customer Login"))
  })

  await t.test("overflow counts characters past the backend limit", () => {
    const suffixLength = buildFinalDescription("", "Customer Login").length
    const raw = "x".repeat(DRAFT_DESCRIPTION_MAX - 10)
    // Combined = 1990 + suffix -> overflow = suffix - 10.
    assert.equal(
      descriptionOverflow(raw, "Customer Login"),
      suffixLength - 10
    )
    assert.ok(descriptionOverflow(raw, "Customer Login") > 0)
  })

  await t.test("boundary: combined exactly at the limit is allowed (0)", () => {
    const suffixLength = buildFinalDescription("", "Customer Login").length - 0
    const raw = "x".repeat(DRAFT_DESCRIPTION_MAX - suffixLength)
    assert.equal(
      buildFinalDescription(raw, "Customer Login").length,
      DRAFT_DESCRIPTION_MAX
    )
    assert.equal(descriptionOverflow(raw, "Customer Login"), 0)
  })

  await t.test("no credential never overflows at 2000 raw chars", () => {
    assert.equal(
      descriptionOverflow("x".repeat(DRAFT_DESCRIPTION_MAX), null),
      0
    )
  })

  await t.test("empty description + credential -> review shows the suffix", () => {
    // Re-audit LOW: the review guard runs on the computed value, so an
    // empty raw description with a selected credential still renders.
    const shown = buildFinalDescription("", "Customer Login")
    assert.ok(shown.length > 0)
    assert.ok(shown.includes("Secure Credential — Customer Login"))
    assert.equal(descriptionOverflow("", "Customer Login"), 0)
  })
})

/* ------------------------------------------------------------------ */
/* Audit F-02: submit latch                                           */
/* ------------------------------------------------------------------ */

test("audit F-02: submit latch rejects rapid double-submit", async (t) => {
  await t.test("two rapid handleSubmit calls invoke onSubmit exactly once", async () => {
    const latch = createSubmitLatch()
    let invocations = 0
    async function handleSubmit(): Promise<void> {
      // Mirrors the modal: latch BEFORE the await, release in finally.
      if (!latch.tryEnter()) return
      try {
        invocations++
        await new Promise((resolve) => setTimeout(resolve, 5)) // in-flight POST
      } finally {
        latch.exit()
      }
    }
    const first = handleSubmit()
    const second = handleSubmit() // same tick: latch still held
    await Promise.all([first, second])
    assert.equal(invocations, 1, "the second rapid click must be a no-op")
  })

  await t.test("latch is reusable after the in-flight submit settles", async () => {
    const latch = createSubmitLatch()
    assert.equal(latch.tryEnter(), true)
    latch.exit()
    assert.equal(latch.tryEnter(), true, "released latch admits the next submit")
    latch.exit()
  })

  await t.test("double exit is safe", () => {
    const latch = createSubmitLatch()
    latch.tryEnter()
    latch.exit()
    latch.exit()
    assert.equal(latch.tryEnter(), true)
  })
})

/* ------------------------------------------------------------------ */
/* Audit F-03: localized name placeholder                             */
/* ------------------------------------------------------------------ */

test("audit F-03: name placeholder is i18n-driven in EN and AR", async (t) => {
  // Parse the i18n dictionary the same way terminology.test.ts does.
  const i18nSource = readFileSync(new URL("./i18n.tsx", import.meta.url), "utf8")
  const keyPattern = /"credentials\.form\.namePlaceholder":\s*\{([\s\S]*?)\}/
  const match = keyPattern.exec(i18nSource)
  assert.ok(match, "credentials.form.namePlaceholder must exist in i18n.tsx")
  const en = /en:\s*"((?:[^"\\]|\\.)*)"/.exec(match[1])?.[1]
  const ar = /ar:\s*"((?:[^"\\]|\\.)*)"/.exec(match[1])?.[1]
  assert.equal(en, "e.g. Customer Login")
  assert.ok(ar != null && ar.length > 0, "the AR value must be present")
  assert.notEqual(ar, en, "the AR value must be a real translation, not the EN fallback")
  assert.ok(/[\u0600-\u06FF]/.test(ar), "the AR value must contain Arabic script")

  // Grep-level: no hardcoded English placeholder remains in the modal.
  const modalSource = readFileSync(
    new URL("../components/credentials/CredentialFormModal.tsx", import.meta.url),
    "utf8"
  )
  assert.ok(
    !modalSource.includes('placeholder="Customer Login"'),
    "the hardcoded placeholder must be gone from the form modal"
  )
  assert.ok(
    modalSource.includes('t("credentials.form.namePlaceholder")'),
    "the placeholder must come from the i18n key"
  )
})

/* ------------------------------------------------------------------ */
/* Audit F-04: INVALID folding pinned                                 */
/* ------------------------------------------------------------------ */

test("audit F-04: INVALID credentials are counted under Needs Setup", () => {
  const stats = credentialStats([
    view({ status: "CONFIGURED" }),
    view({ status: "NEEDS_SETUP" }),
    view({ status: "INVALID" }),
  ])
  assert.equal(stats.needsSetup, 2, "INVALID folds into Needs Setup by design")
  assert.equal(stats.configured, 1)
  assert.equal(stats.total, 3)
})
