import test from "node:test"
import assert from "node:assert/strict"
import { ApiError, apiConfirmTestPlan, apiCreateTestPlan } from "./api"
import {
  COMPOSER_TO_WIRE,
  CONFIRM_ERROR_MESSAGES,
  PLAN_ERROR_MESSAGES,
  clarificationCategoryLabel,
  isPlanClarification,
  isPlanReady,
  newConfirmKey,
} from "./planner"

type CapturedRequest = {
  url: string
  method: string
  headers: Record<string, string>
  body: unknown
}

function stubFetch(
  responder: (request: CapturedRequest) => { status?: number; json: unknown },
): CapturedRequest[] {
  const calls: CapturedRequest[] = []
  globalThis.fetch = (async (input: unknown, init?: RequestInit) => {
    const request: CapturedRequest = {
      url: String(input),
      method: init?.method ?? "GET",
      headers: { ...((init?.headers as Record<string, string>) ?? {}) },
      body: typeof init?.body === "string" ? JSON.parse(init.body) : undefined,
    }
    calls.push(request)
    const response = responder(request)
    return new Response(JSON.stringify(response.json), {
      status: response.status ?? 200,
      headers: { "Content-Type": "application/json" },
    })
  }) as typeof fetch
  return calls
}

test("Planner domain vocabulary", async (t) => {
  const originalFetch = globalThis.fetch
  t.afterEach(() => {
    globalThis.fetch = originalFetch
  })

  await t.test("composer types map 1:1 onto wire types", () => {
    assert.equal(COMPOSER_TO_WIRE.UI, "USER_JOURNEY")
    assert.equal(COMPOSER_TO_WIRE.API, "BACKEND_CHECK")
    assert.equal(COMPOSER_TO_WIRE.MIXED, "END_TO_END")
  })

  await t.test("failure messages match the contract strings", () => {
    assert.equal(
      PLAN_ERROR_MESSAGES.AI_UNAVAILABLE,
      "AI Test Builder is temporarily unavailable. Try again in a moment.",
    )
    assert.equal(
      PLAN_ERROR_MESSAGES.CREDENTIAL_REQUIRED,
      "This test requires a Secure Credential. Select one to continue.",
    )
    assert.equal(
      PLAN_ERROR_MESSAGES.UNSUPPORTED_SCENARIO,
      "This scenario isn't supported yet. Try a different request.",
    )
    assert.equal(
      CONFIRM_ERROR_MESSAGES.DUPLICATE_CONFIRM,
      "This plan was already confirmed. Opening the draft...",
    )
  })

  await t.test("clarification categories have friendly labels", () => {
    assert.equal(
      clarificationCategoryLabel("MISSING_BUSINESS_OBJECTIVE"),
      "Missing Objective",
    )
    assert.equal(clarificationCategoryLabel(null), "Clarification")
  })

  await t.test("shape guards discriminate the three responses", () => {
    assert.equal(isPlanReady({ status: "PLAN_READY" }), true)
    assert.equal(isPlanReady({ status: "FAILED" }), false)
    assert.equal(
      isPlanClarification({ status: "NEEDS_CLARIFICATION" }),
      true,
    )
    assert.equal(isPlanClarification(null), false)
  })

  await t.test("confirm keys are unique and non-empty", () => {
    const a = newConfirmKey()
    const b = newConfirmKey()
    assert.ok(a.length > 0)
    assert.notEqual(a, b)
  })

  await t.test("create posts intent with optional fields omitted", async () => {
    const calls = stubFetch(() => ({ json: { status: "PLAN_READY" } }))
    await apiCreateTestPlan(7, { intent: "Verify checkout" })
    assert.equal(calls.length, 1)
    assert.equal(calls[0].method, "POST")
    assert.ok(calls[0].url.endsWith("/dashboard-api/clients/7/test-plans"))
    assert.deepEqual(calls[0].body, { intent: "Verify checkout" })
  })

  await t.test("create forwards type and credential id", async () => {
    const calls = stubFetch(() => ({ json: { status: "PLAN_READY" } }))
    await apiCreateTestPlan(7, {
      intent: "Verify checkout",
      requestedType: "END_TO_END",
      credentialId: 7,
    })
    assert.deepEqual(calls[0].body, {
      intent: "Verify checkout",
      requestedType: "END_TO_END",
      credentialId: 7,
    })
  })

  await t.test("confirm sends Idempotency-Key and name override", async () => {
    const calls = stubFetch(() => ({
      json: { definitionId: 501, creationRequestId: 9, status: "DRAFT" },
    }))
    const result = await apiConfirmTestPlan(7, "plan-1", "key-1", {
      name: "Checkout",
    })
    assert.equal(result.definitionId, 501)
    assert.equal(calls[0].headers["Idempotency-Key"], "key-1")
    assert.deepEqual(calls[0].body, { name: "Checkout" })
    assert.ok(calls[0].url.endsWith("/test-plans/plan-1/confirm"))
  })

  await t.test("confirm surfaces 404 and 409 with backend messages", async () => {
    stubFetch(() => ({ status: 404, json: { error: "Test plan not found" } }))
    await assert.rejects(
      apiConfirmTestPlan(7, "gone", "key-1"),
      (error: unknown) =>
        error instanceof ApiError &&
        error.status === 404 &&
        error.message === "Test plan not found",
    )
    stubFetch(() => ({
      status: 409,
      json: { error: "Idempotency key reused with different request parameters" },
    }))
    await assert.rejects(
      apiConfirmTestPlan(7, "plan-1", "key-1"),
      (error: unknown) => error instanceof ApiError && error.status === 409,
    )
  })
})
