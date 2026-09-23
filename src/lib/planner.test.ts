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
  normalizeClarificationQuestions,
  normalizePlanClarification,
  normalizePlanEvidence,
  normalizePlanEvidenceOnPlan,
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

test("invalid evidence fails closed at the plan normalization boundary", () => {
  const plan = {
    status: "PLAN_READY" as const,
    planId: "plan-invalid-evidence",
    testType: "USER_JOURNEY" as const,
    title: "Invalid evidence",
    description: null,
    authenticationRequired: false,
    credentialReference: null,
    steps: [],
    expectedOutcomes: [],
    requiredCapabilities: [],
    warnings: [],
    definitionSourceJson: "{}",
    evidence: "x",
  }
  for (const value of ["x", 42, true, null, undefined]) {
    assert.equal(normalizePlanEvidence(value), undefined)
    assert.equal(normalizePlanEvidenceOnPlan({ ...plan, evidence: value }).evidence, undefined)
  }
  for (const value of [[], {}]) {
    assert.equal(typeof normalizePlanEvidenceOnPlan({ ...plan, evidence: value }).evidence, "object")
  }
})

test("normalizes network status clamp boundaries", () => {
  const statuses = [-1, 0, 599, 600, 9999]
  const evidence = normalizePlanEvidence({
    networkRequests: statuses.map((status) => ({ status })),
  })
  assert.deepEqual(
    evidence?.networkRequests.map((request) => request.status),
    [0, 0, 599, 599, 599],
  )
})

test("caps evidence arrays before mapping", () => {
  const repeated = (count: number, item: unknown) => Array.from({ length: count }, () => item)
  const evidence = normalizePlanEvidence({
    backendOperations: repeated(200, {}),
    discoveredElements: repeated(200, {}),
    networkRequests: repeated(200, {}),
  })
  assert.equal(evidence?.backendOperations.length, 50)
  assert.equal(evidence?.discoveredElements.length, 50)
  assert.equal(evidence?.networkRequests.length, 100)
})

test("caps evidence string fields to their contract lengths", () => {
  const evidence = normalizePlanEvidence({
    origin: "o".repeat(5000),
    pageTitle: "t".repeat(5000),
    pageUrl: "u".repeat(5000),
    backendOperations: [{ path: "p".repeat(5000), summary: "s".repeat(5000), tags: ["g".repeat(5000)] }],
    discoveredElements: [{ name: "n".repeat(5000) }],
    networkRequests: [{ url: "r".repeat(5000) }],
  })
  assert.equal(evidence?.origin?.length, 2048)
  assert.equal(evidence?.pageTitle?.length, 500)
  assert.equal(evidence?.pageUrl?.length, 2048)
  assert.equal(evidence?.backendOperations[0].path.length, 2048)
  assert.equal(evidence?.backendOperations[0].summary.length, 200)
  assert.equal(evidence?.backendOperations[0].tags[0].length, 100)
  assert.equal(evidence?.discoveredElements[0].name.length, 500)
  assert.equal(evidence?.networkRequests[0].url.length, 2048)
})

test("caps elementsFound at one million", () => {
  assert.equal(
    normalizePlanEvidence({ elementsFound: 2_147_483_647 })?.elementsFound,
    1_000_000,
  )
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

test("toEditable preserves structured UI action immutably", () => {
  const action = {
    kind: "fill" as const,
    target: "Username",
    value: { source: "config" as const, reference: "username" },
  }
  const editable = toEditable(
    [{
      type: "UI",
      intent: "Enter username",
      requiresDiscovery: true,
      action,
    }],
    [{ type: "UI", intent: "Dashboard is visible" }],
  )
  assert.deepEqual(editable[0].action, action)
  assert.notEqual(editable[0].action, action)
  assert.notEqual(editable[0].action?.value, action.value)
  assert.equal(editable[0].action?.value?.reference, "username")
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

  await t.test("clarification normalizer maps backend contract to canonical questions", async (st) => {
    // Case 1 — normal clarification
    await st.test("Case 1: normal clarification converts string question and category", () => {
      const input = {
        status: "NEEDS_CLARIFICATION",
        planId: "p1",
        questions: ["Which account should be used?"],
        categories: ["MISSING_BUSINESS_OBJECTIVE"],
      }
      const normalized = normalizePlanClarification(input)
      assert.deepEqual(normalized.questions, [
        {
          question: "Which account should be used?",
          category: "MISSING_BUSINESS_OBJECTIVE",
        },
      ])
      assert.equal(normalized.status, "NEEDS_CLARIFICATION")
      assert.equal(normalized.planId, "p1")
    })

    // Case 2 — multiple questions
    await st.test("Case 2: multiple questions mapped by matching indexes", () => {
      const input = {
        questions: [
          "Which account should be used?",
          "What should happen after login?",
        ],
        categories: [
          "MISSING_BUSINESS_OBJECTIVE",
          "MISSING_EXPECTED_OUTCOME",
        ],
      }
      const questions = normalizeClarificationQuestions(input.questions, input.categories)
      assert.deepEqual(questions, [
        {
          question: "Which account should be used?",
          category: "MISSING_BUSINESS_OBJECTIVE",
        },
        {
          question: "What should happen after login?",
          category: "MISSING_EXPECTED_OUTCOME",
        },
      ])
    })

    // Case 3 — missing category
    await st.test("Case 3: missing categories array sets category to null", () => {
      const questions = normalizeClarificationQuestions(["Question"], [])
      assert.deepEqual(questions, [
        {
          question: "Question",
          category: null,
        },
      ])
    })

    // Case 4 — fewer categories
    await st.test("Case 4: fewer categories leaves remaining questions with null category", () => {
      const questions = normalizeClarificationQuestions(
        ["Q1", "Q2", "Q3"],
        ["MISSING_BUSINESS_OBJECTIVE"],
      )
      assert.deepEqual(questions, [
        {
          question: "Q1",
          category: "MISSING_BUSINESS_OBJECTIVE",
        },
        {
          question: "Q2",
          category: null,
        },
        {
          question: "Q3",
          category: null,
        },
      ])
    })

    // Case 5 — empty questions
    await st.test("Case 5: empty questions or non-array returns safe empty array", () => {
      assert.deepEqual(normalizeClarificationQuestions([], ["CAT1"]), [])
      assert.deepEqual(normalizeClarificationQuestions(null, ["CAT1"]), [])
      assert.deepEqual(normalizeClarificationQuestions(undefined), [])
      assert.deepEqual(normalizePlanClarification({ status: "NEEDS_CLARIFICATION" }).questions, [])
    })

    // Categories longer than questions: extra categories ignored
    await st.test("defensive: categories longer than questions are ignored safely", () => {
      const questions = normalizeClarificationQuestions(
        ["Q1"],
        ["CAT1", "CAT2", "CAT3"],
      )
      assert.deepEqual(questions, [
        {
          question: "Q1",
          category: "CAT1",
        },
      ])
    })

    // Standard API path normalizes clarification responses
    await st.test("standard API path apiCreateTestPlan normalizes clarification", async () => {
      stubFetch(() => ({
        json: {
          status: "NEEDS_CLARIFICATION",
          planId: "p-clarify",
          questions: ["Which account should be used?"],
          categories: ["MISSING_BUSINESS_OBJECTIVE"],
        },
      }))
      const res = await apiCreateTestPlan(7, { intent: "Test login" })
      assert.equal(res.status, "NEEDS_CLARIFICATION")
      if (res.status === "NEEDS_CLARIFICATION") {
        assert.deepEqual(res.questions, [
          {
            question: "Which account should be used?",
            category: "MISSING_BUSINESS_OBJECTIVE",
          },
        ])
      }
    })
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

  await t.test("confirm preserves structured action and credential reference without plaintext", async () => {
    const calls = stubFetch(() => ({
      json: { definitionId: 502, creationRequestId: 10, status: "DRAFT" },
    }))
    await apiConfirmTestPlan(7, "plan-2", "key-2", {
      name: "Secure login",
      modifiedSteps: [{
        type: "UI",
        intent: "Enter username",
        action: {
          kind: "fill",
          target: "Username",
          value: { source: "config", reference: "username" },
        },
      }],
    })
    const body = calls[0].body as { modifiedSteps: Array<{ action?: unknown }> }
    assert.deepEqual(body.modifiedSteps[0].action, {
      kind: "fill",
      target: "Username",
      value: { source: "config", reference: "username" },
    })
    assert.equal((body.modifiedSteps[0].action as { value: { source: string; reference: string } }).value.source, "config")
    assert.equal((body.modifiedSteps[0].action as { value: { source: string; reference: string } }).value.reference, "username")
    assert.doesNotMatch(JSON.stringify(body), /test@example\\.com|password123/)
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
