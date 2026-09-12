import assert from "node:assert/strict"
import test from "node:test"

import { ApiError } from "./api"
import {
  CREDENTIAL_NAME_MAX,
  credentialStats,
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
