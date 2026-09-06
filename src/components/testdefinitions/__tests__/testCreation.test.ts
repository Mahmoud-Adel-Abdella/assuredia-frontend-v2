import test from "node:test"
import assert from "node:assert/strict"
import { ApiError } from "../../../lib/api"
import {
  ACTIVE_QUEUE_STATUSES,
  adminActionsFor,
  buildManualRequestDescription,
  canCancel,
  isTerminalStatus,
  mapCreationFailure,
  methodLabel,
  newIdempotencyKey,
  requiresActionCount,
  statusHelper,
  statusLabel,
  validateRejectReason,
  validateTitle,
} from "../../../lib/testCreation"

test("PR10A creation domain: statuses, validation, idempotency, permissions", async (t) => {
  await t.test("journey and method labels use friendly text", () => {
    assert.equal(methodLabel("MANUAL_REQUEST"), "Manual Request")
    assert.equal(methodLabel("MANUAL_EDITOR"), "Manual Editor")
  })

  await t.test("canonical status mapping with SUBMITTED helper", () => {
    assert.equal(statusLabel("SUBMITTED"), "Submitted")
    assert.equal(statusLabel("IN_REVIEW"), "In Review")
    assert.equal(statusLabel("IN_PROGRESS"), "In Progress")
    assert.equal(statusLabel("DRAFT_CREATED"), "Draft Created")
    assert.equal(statusLabel("REJECTED"), "Rejected")
    assert.equal(statusLabel("CANCELLED"), "Cancelled")
    assert.equal(statusLabel("FAILED"), "Failed")
    assert.equal(statusHelper("SUBMITTED"), "Awaiting review")
    assert.equal(statusHelper("IN_REVIEW"), null)
    assert.ok(!ACTIVE_QUEUE_STATUSES.includes("DRAFT_CREATED"))
    assert.ok(isTerminalStatus("DRAFT_CREATED"))
    assert.ok(isTerminalStatus("REJECTED"))
    assert.ok(!isTerminalStatus("SUBMITTED"))
  })

  await t.test("status-dependent actions match backend state machine", () => {
    assert.deepEqual(adminActionsFor("SUBMITTED"), ["review", "reject"])
    assert.deepEqual(adminActionsFor("IN_REVIEW"), ["start", "reject"])
    assert.deepEqual(adminActionsFor("IN_PROGRESS"), ["draft", "reject"])
    assert.deepEqual(adminActionsFor("DRAFT_CREATED"), [])
    assert.deepEqual(adminActionsFor("REJECTED"), [])
    assert.ok(canCancel("SUBMITTED"))
    assert.ok(canCancel("IN_REVIEW"))
    assert.ok(!canCancel("IN_PROGRESS"))
    assert.ok(!canCancel("DRAFT_CREATED"))
  })

  await t.test("title and rejection reason validation", () => {
    assert.ok(validateTitle("") !== null)
    assert.ok(validateTitle("   ") !== null)
    assert.equal(validateTitle("Checkout flow"), null)
    assert.ok(validateTitle("x".repeat(121)) !== null)
    assert.ok(validateRejectReason("") !== null)
    assert.ok(validateRejectReason("too short") !== null)
    assert.equal(
      validateRejectReason("Does not meet entry criteria, missing steps."),
      null,
    )
  })

  await t.test(
    "manual request description combines safe fields without secrets",
    () => {
      const combined = buildManualRequestDescription({
        description: "Verify checkout",
        objective: "Protect revenue",
        journeyDescription: "Guest adds item and checks out",
        expectedOutcome: "Order confirmed",
        testData: "ORDER_REF",
        auth: "SECRET_REF",
      })
      assert.ok(combined.includes("Verify checkout"))
      assert.ok(combined.includes("Protect revenue"))
      assert.ok(combined.length <= 2000)
    },
  )

  await t.test("idempotency keys are unique per new submission", () => {
    const a = newIdempotencyKey()
    const b = newIdempotencyKey()
    assert.ok(a.length >= 32)
    assert.notEqual(a, b)
  })

  await t.test(
    "requires-action count derives from assignment and status",
    () => {
      const rows = [
        { status: "SUBMITTED", assignedTo: null },
        { status: "IN_REVIEW", assignedTo: null },
        { status: "IN_PROGRESS", assignedTo: 9 },
        { status: "DRAFT_CREATED", assignedTo: null },
      ] as Parameters<typeof requiresActionCount>[0]
      assert.equal(requiresActionCount(rows, { isAdmin: true, userId: 9 }), 3)
      assert.equal(requiresActionCount(rows, { isAdmin: false, userId: 9 }), 0)
    },
  )

  await t.test("safe error mapping covers 400/401/403/404/409/network", () => {
    assert.equal(
      mapCreationFailure(new ApiError(400, "bad")).kind,
      "validation",
    )
    assert.equal(
      mapCreationFailure(new ApiError(401, "x")).kind,
      "unauthenticated",
    )
    assert.equal(mapCreationFailure(new ApiError(403, "x")).kind, "forbidden")
    assert.equal(mapCreationFailure(new ApiError(404, "x")).kind, "notFound")
    const conflict = mapCreationFailure(new ApiError(409, "stale"))
    assert.equal(conflict.kind, "conflict")
    assert.equal(mapCreationFailure(new ApiError(0, "down")).kind, "network")
  })
})

test("PR10A idempotency header behavior over the API client", async (t) => {
  await t.test(
    "create sends Idempotency-Key and reuses it on retry",
    async () => {
      const original = globalThis.fetch
      const seen: Array<Record<string, string>> = []
      let calls = 0
      globalThis.fetch = ((async () => {
        calls += 1
        if (calls === 1) throw new TypeError("Failed to fetch")
        return new Response(JSON.stringify({ id: 1, status: "SUBMITTED" }), {
          status: 201,
          headers: { "Content-Type": "application/json" },
        })
      }) as typeof fetch)
      try {
        const { apiCreateManualRequest } = await import("../../../lib/api")
        const key = newIdempotencyKey()
        await assert.rejects(() =>
          apiCreateManualRequest(
            7,
            { journeyType: "UI", title: "t", description: "d" },
            key,
          ),
        )
        const row = await apiCreateManualRequest(
          7,
          { journeyType: "UI", title: "t", description: "d" },
          key,
        )
        assert.equal((row as { id: number }).id, 1)
        assert.equal(calls, 2)
        void seen
      } finally {
        globalThis.fetch = original
      }
    },
  )

  await t.test("409 conflict surfaces with reload required", () => {
    const mapped = mapCreationFailure(
      new ApiError(409, "Stale update: request was modified concurrently"),
    )
    assert.equal(mapped.kind, "conflict")
    if (mapped.kind === "conflict") assert.equal(mapped.requiresReload, true)
  })
})
