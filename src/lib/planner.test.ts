import test from "node:test"
import assert from "node:assert/strict"
import { ApiError, apiConfirmTestPlan, apiCreateTestPlan } from "./api"
import { toEditable } from "../components/planner/AiBuilderPage"
import { StepRow } from "../components/planner/AiPlanViews"
import {
  COMPOSER_TO_WIRE,
  CONFIRM_ERROR_MESSAGES,
  PLAN_ERROR_MESSAGES,
  attachOutcomesToSteps,
  clarificationCategoryLabel,
  evidenceStatusKind,
  evidenceTruncationCounts,
  formatEvidenceDuration,
  isPlanClarification,
  isPlanReady,
  newConfirmKey,
  normalizePlanEvidence,
  outcomesOfSteps,
  type WithOutcome,
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

test("normalizes optional evidence without exposing producer-only values", () => {
  const evidence = normalizePlanEvidence({
    origin: null,
    pageTitle: "Shop",
    pageUrl: "https://shop.test/orders/{id}?token=***",
    truncated: true,
    elementsFound: 60,
    discoveredElements: [{
      elementId: "e1",
      role: "button",
      name: "Load",
      strategy: "role",
      value: "button[name=Load]",
      strength: "STRONG",
      state: "VERIFIED",
    }],
    backendOperations: [],
    networkRequests: [{ method: "GET", url: "/orders/{id}", status: 0, durationMs: 500 }],
    discoveryDurationMs: 1800,
    degradeWarningToken: "attacker-token",
  })
  assert.equal(evidence?.origin, null)
  assert.equal(evidence?.discoveredElements[0].state, "UNVERIFIED")
  assert.equal(evidence?.networkRequests[0].status, 0)
  assert.equal(evidence?.networkRequests[0].durationMs, 0)
  assert.equal(evidence?.degradeWarningToken, null)
  assert.deepEqual(evidence && evidenceTruncationCounts(evidence), { shown: 1, total: 60, isPartial: true })
})

test("evidence helpers classify statuses and durations", () => {
  assert.equal(formatEvidenceDuration(0), "—")
  assert.equal(formatEvidenceDuration(1842), "1.8s")
  assert.equal(evidenceStatusKind(0), "failed")
  assert.equal(evidenceStatusKind(204), "success")
  assert.equal(evidenceStatusKind(302), "warning")
  assert.equal(evidenceStatusKind(500), "error")
})

test("toEditable preserves endpoint metadata", () => {
  const editable = toEditable(
    [{
      type: "API",
      intent: "Create an order",
      requiresDiscovery: true,
      endpoint: { method: "POST", path: "/api/orders" },
    }],
    [{ type: "API", intent: "Order is created" }],
  )
  assert.deepEqual(editable[0].endpoint, { method: "POST", path: "/api/orders" })
  assert.deepEqual(editable[0].outcome, { type: "API", intent: "Order is created" })
})

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

  await t.test("confirm sends Idempotency-Key, name, and endpoint metadata", async () => {
    const calls = stubFetch(() => ({
      json: { definitionId: 501, creationRequestId: 9, status: "DRAFT" },
    }))
    const result = await apiConfirmTestPlan(7, "plan-1", "key-1", {
      name: "Checkout",
      modifiedSteps: [{
        type: "API",
        intent: "Create an order",
        endpoint: { method: "POST", path: "/api/orders" },
      }],
    })
    assert.equal(result.definitionId, 501)
    assert.equal(calls[0].headers["Idempotency-Key"], "key-1")
    assert.deepEqual(calls[0].body, {
      name: "Checkout",
      modifiedSteps: [{
        type: "API",
        intent: "Create an order",
        endpoint: { method: "POST", path: "/api/orders" },
      }],
    })
    assert.ok(calls[0].url.endsWith("/test-plans/plan-1/confirm"))
  })

  await t.test("composition errors have dedicated actionable copy", () => {
    assert.equal(
      CONFIRM_ERROR_MESSAGES.COMPOSITION_CHANGED,
      "Deleting the UI steps turned this into an API-only plan. Create a Backend Check test instead.",
    )
    assert.equal(
      CONFIRM_ERROR_MESSAGES.COMPOSITION_UI_ONLY,
      "Deleting the API steps turned this into a UI-only plan. Create a User Journey test instead.",
    )
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

/* ------------------------------------------------------------------ */
/* F-7: expected results stay attached to their steps                  */
/* ------------------------------------------------------------------ */

test("attachOutcomesToSteps pairs each outcome with its step by index", () => {
  const steps = [
    { type: "UI" as const, intent: "Search", requiresDiscovery: true, key: "s1" },
    { type: "API" as const, intent: "Verify order", requiresDiscovery: false, key: "s2" },
  ]
  const outcomes = [
    { type: "UI" as const, intent: "Results appear" },
    { type: "API" as const, intent: "Order exists" },
  ]
  const attached = attachOutcomesToSteps(steps, outcomes)
  assert.deepEqual(
    attached.map((s) => s.outcome?.intent),
    ["Results appear", "Order exists"],
  )
})

test("attachOutcomesToSteps tolerates missing or empty outcome lists", () => {
  const steps = [
    { type: "UI" as const, intent: "Search", requiresDiscovery: true, key: "s1" },
  ]
  for (const outcomes of [undefined, null, []]) {
    const attached = attachOutcomesToSteps(steps, outcomes)
    assert.equal(attached.length, 1)
    assert.equal(attached[0].outcome, undefined)
  }
})

test("deleting a step removes its expected result — no orphans (F-7)", () => {
  const steps = [
    { type: "UI" as const, intent: "Search", requiresDiscovery: true, key: "s1" },
    { type: "UI" as const, intent: "Add to cart", requiresDiscovery: true, key: "s2" },
  ]
  const outcomes = [
    { type: "UI" as const, intent: "Results appear" },
    { type: "UI" as const, intent: "Cart holds the product" },
  ]
  let editable = attachOutcomesToSteps(steps, outcomes)

  // The ProposedView delete handler filters the step list; the outcome is
  // attached to the step, so it is pruned by the same operation.
  editable = editable.filter((s) => s.key !== "s1")
  const remaining = outcomesOfSteps(editable)
  assert.deepEqual(
    remaining.map((o) => o.intent),
    ["Cart holds the product"],
  )
})

test("moving a step carries its expected result with it", () => {
  const steps = [
    { type: "UI" as const, intent: "Search", requiresDiscovery: true, key: "s1" },
    { type: "UI" as const, intent: "Add to cart", requiresDiscovery: true, key: "s2" },
  ]
  const outcomes = [
    { type: "UI" as const, intent: "Results appear" },
    { type: "UI" as const, intent: "Cart holds the product" },
  ]
  const editable = attachOutcomesToSteps(steps, outcomes)
  const moved = [...editable]
  const [first] = moved.splice(0, 1)
  moved.splice(1, 0, first)
  assert.deepEqual(
    outcomesOfSteps(moved).map((o) => o.intent),
    ["Cart holds the product", "Results appear"],
  )
})

test("outcomesOfSteps returns an empty list when no step has an outcome", () => {
  const bare: Array<WithOutcome & { key: string }> = [{ key: "s1" }, { key: "s2" }]
  assert.deepEqual(outcomesOfSteps(bare), [])
})
