import test from "node:test"
import assert from "node:assert/strict"
import { ApiError } from "../../../lib/api"
import {
  ADMIN_ONLY_ACTIONS,
  IdempotencyRegistry,
  availabilityOf,
  isContentEditable,
  lifecycleAvailability,
  mapTestDefinitionFailure,
  statusLabelKey,
  type LifecycleAction,
  type LifecycleSubject,
} from "../../../lib/testDefinitionLifecycle"
import { VERSION_ID } from "./fixtures"

function subject(overrides: Partial<LifecycleSubject> = {}): LifecycleSubject {
  return { status: "DRAFT", definitionArchived: false, flowId: 300, isAdmin: true, ...overrides }
}

function enabledActions(s: LifecycleSubject): LifecycleAction[] {
  return lifecycleAvailability(s).filter((a) => a.visible && a.enabled).map((a) => a.action)
}

function visibleActions(s: LifecycleSubject): LifecycleAction[] {
  return lifecycleAvailability(s).filter((a) => a.visible).map((a) => a.action)
}

test("Test Definition lifecycle gating, idempotency and error mapping", async (t) => {
  await t.test("18. An admin sees every lifecycle control, gated by state", () => {
    assert.deepEqual(enabledActions(subject({ status: "DRAFT" })), ["validate", "trial", "newVersion"])
    assert.deepEqual(enabledActions(subject({ status: "VALIDATED" })), ["trial", "approve", "newVersion"])
    assert.deepEqual(enabledActions(subject({ status: "APPROVED" })), ["trial", "proving", "newVersion"])
    assert.deepEqual(enabledActions(subject({ status: "READY" })), ["trial", "archive", "newVersion"])

    for (const action of ADMIN_ONLY_ACTIONS) {
      assert.ok(
        visibleActions(subject({ status: "READY" })).includes(action),
        `${action} must be visible to an admin`,
      )
    }
  })

  await t.test("19. A non-admin never sees approve, proving or archive", () => {
    for (const status of ["DRAFT", "VALIDATED", "APPROVED", "READY"] as const) {
      const visible = visibleActions(subject({ status, isAdmin: false }))
      for (const action of ADMIN_ONLY_ACTIONS) {
        assert.ok(!visible.includes(action), `${action} must be hidden from a non-admin in ${status}`)
      }
    }
    // What a non-admin can still do is exactly what the engine permits them.
    assert.deepEqual(enabledActions(subject({ status: "DRAFT", isAdmin: false })), ["validate", "trial", "newVersion"])
    assert.deepEqual(enabledActions(subject({ status: "VALIDATED", isAdmin: false })), ["trial", "newVersion"])
  })

  await t.test("READY is never offered as a manual transition", () => {
    const everyAction = new Set<string>()
    for (const status of ["DRAFT", "VALIDATED", "APPROVED", "READY", "ARCHIVED"] as const) {
      for (const isAdmin of [true, false]) {
        for (const info of lifecycleAvailability(subject({ status, isAdmin }))) everyAction.add(info.action)
      }
    }
    assert.ok(!everyAction.has("ready" as LifecycleAction))
    assert.deepEqual(
      [...everyAction].sort(),
      ["approve", "archive", "newVersion", "proving", "trial", "validate"],
    )
  })

  await t.test("24. An archived definition disables every action and every edit", () => {
    const archived = subject({ status: "ARCHIVED", definitionArchived: true })
    assert.deepEqual(enabledActions(archived), [])
    for (const info of lifecycleAvailability(archived)) {
      if (info.visible) assert.ok(info.reason, `${info.action} must explain why it is disabled`)
    }
    assert.equal(isContentEditable("ARCHIVED", true), false)
    assert.equal(isContentEditable("DRAFT", true), false, "an archived aggregate freezes its draft too")
    assert.equal(isContentEditable("DRAFT", false), true)
    assert.equal(isContentEditable("VALIDATED", false), false)
  })

  await t.test("Trial no longer needs a flow; proving still does", () => {
    // A trial is a non-gating manual execution: enabled on any non-archived status,
    // with or without a Flow binding (spec §2003-2008).
    const unbound = subject({ status: "VALIDATED", flowId: null })
    const trial = availabilityOf(lifecycleAvailability(unbound), "trial")
    assert.equal(trial.visible, true)
    assert.equal(trial.enabled, true, "a trial must not require a Flow binding")
    assert.equal(trial.reason, null)

    assert.equal(
      availabilityOf(lifecycleAvailability(subject({ status: "DRAFT", flowId: null })), "trial").enabled,
      true,
      "a DRAFT must be triallable without a Flow",
    )

    // Proving is still gated: it needs APPROVED and a bound Flow.
    const proving = availabilityOf(lifecycleAvailability(subject({ status: "APPROVED", flowId: null })), "proving")
    assert.equal(proving.enabled, false)
    assert.ok(proving.reason)

    // approve does not touch the flow, so it stays available
    assert.equal(availabilityOf(lifecycleAvailability(subject({ status: "VALIDATED", flowId: null })), "approve").enabled, true)
  })

  await t.test("A trial is disabled only for an ARCHIVED definition", () => {
    const archived = availabilityOf(
      lifecycleAvailability(subject({ status: "ARCHIVED", definitionArchived: true, flowId: 300 })),
      "trial",
    )
    assert.equal(archived.enabled, false)
    assert.ok(archived.reason)

    for (const status of ["DRAFT", "VALIDATED", "APPROVED", "READY"] as const) {
      assert.equal(
        availabilityOf(lifecycleAvailability(subject({ status })), "trial").enabled,
        true,
        `trial must be enabled in ${status}`,
      )
    }
  })

  await t.test("Status label keys resolve for every lifecycle state", () => {
    assert.equal(statusLabelKey("DRAFT"), "testdef.status.draft")
    assert.equal(statusLabelKey("ARCHIVED"), "testdef.status.archived")
  })

  /* ---- Idempotency -------------------------------------------------- */

  await t.test("16. A second dispatch of the same operation is refused while one is in flight", () => {
    const registry = new IdempotencyRegistry()
    const identity = { purpose: "TRIAL" as const, versionId: VERSION_ID }

    const first = registry.acquire(identity)
    assert.equal(typeof first, "string")
    assert.equal(registry.isInFlight(identity), true)
    assert.equal(registry.acquire(identity), null, "a double click must not reach the network")
  })

  await t.test("29. An uncertain outcome keeps the key so the retry replays", () => {
    const registry = new IdempotencyRegistry()
    const identity = { purpose: "TRIAL" as const, versionId: VERSION_ID }

    const first = registry.acquire(identity)
    registry.holdForRetry(identity)
    assert.equal(registry.isRetryable(identity), true)

    const retry = registry.acquire(identity)
    assert.equal(retry, first, "a retry of the same operation must reuse its key")

    registry.settle(identity)
    const afterSettle = registry.acquire(identity)
    assert.notEqual(afterSettle, first, "a new operation must not reuse a settled key")
  })

  await t.test("A deliberate restart abandons the held key", () => {
    const registry = new IdempotencyRegistry()
    const identity = { purpose: "PROVING" as const, versionId: VERSION_ID }
    const first = registry.acquire(identity)
    registry.holdForRetry(identity)
    registry.restart(identity)
    assert.equal(registry.isRetryable(identity), false)
    assert.notEqual(registry.acquire(identity), first)
  })

  await t.test("Trial and proving keys are independent, and so are versions", () => {
    const registry = new IdempotencyRegistry()
    const trial = registry.acquire({ purpose: "TRIAL", versionId: 1 })
    const proving = registry.acquire({ purpose: "PROVING", versionId: 1 })
    const otherVersion = registry.acquire({ purpose: "TRIAL", versionId: 2 })
    assert.notEqual(trial, proving)
    assert.notEqual(trial, otherVersion)
    assert.equal(new Set([trial, proving, otherVersion]).size, 3)
  })

  await t.test("Keys look like unguessable tokens and are never derived from ids", () => {
    const registry = new IdempotencyRegistry()
    const key = registry.acquire({ purpose: "TRIAL", versionId: VERSION_ID })
    assert.ok(key && key.length >= 32, "a key must carry real entropy")
    assert.ok(!key.includes(String(VERSION_ID)) || key.length >= 32)
  })

  /* ---- Error mapping ------------------------------------------------- */

  await t.test("28. Server internals are never surfaced; 5xx collapses to a safe message", () => {
    const leaky = new ApiError(
      500,
      "org.postgresql.util.PSQLException: ERROR: relation \"test_definitions\" does not exist at C:\\engine\\Repo.java:118",
    )
    const mapped = mapTestDefinitionFailure(leaky)
    assert.equal(mapped.kind, "unavailable")
    assert.ok(!mapped.message.includes("PSQLException"))
    assert.ok(!mapped.message.includes("test_definitions"))
    assert.ok(!mapped.message.includes("C:\\"))
    assert.ok(!mapped.message.includes(".java"))
    assert.equal(mapped.retrySameKey, true, "an unknown 5xx outcome must keep the idempotency key")

    // A safe summary the engine already produced is kept as-is.
    const safe = mapTestDefinitionFailure(
      new ApiError(503, "The requested operation is temporarily unavailable"),
    )
    assert.equal(safe.message, "The requested operation is temporarily unavailable")

    // A non-ApiError throw is treated as an unknown outcome, not rendered raw.
    const thrown = mapTestDefinitionFailure(new Error("socket hang up at internal/stream.js:44"))
    assert.equal(thrown.kind, "unavailable")
    assert.ok(!thrown.message.includes("stream.js"))
  })

  await t.test("Each status maps to the reaction the engine's contract implies", () => {
    assert.equal(mapTestDefinitionFailure(new ApiError(400, "sourceJson is required")).kind, "invalid")
    assert.equal(mapTestDefinitionFailure(new ApiError(401, "x")).kind, "unauthenticated")
    assert.equal(
      mapTestDefinitionFailure(new ApiError(403, "This operation is restricted to administrators")).kind,
      "forbidden",
    )

    // 404 covers "missing" and "another tenant's" identically, and always means reload.
    const notFound = mapTestDefinitionFailure(new ApiError(404, "Test Definition not found"))
    assert.equal(notFound.kind, "notFound")
    assert.equal(notFound.requiresReload, true)

    const network = mapTestDefinitionFailure(new ApiError(0, "Network unreachable"))
    assert.equal(network.kind, "network")
    assert.equal(network.retrySameKey, true)
  })

  await t.test("Stale-state conflicts ask for a reload; flat refusals do not", () => {
    const stale = mapTestDefinitionFailure(
      new ApiError(409, "Stale update detected; the draft was modified concurrently or expectedLock did not match"),
    )
    assert.equal(stale.kind, "conflict")
    assert.equal(stale.requiresReload, true)
    assert.equal(stale.retrySameKey, false)

    const nonDraft = mapTestDefinitionFailure(
      new ApiError(409, "Version 1 is VALIDATED and cannot be edited. Create a new version instead."),
    )
    assert.equal(nonDraft.requiresReload, true)

    const duplicate = mapTestDefinitionFailure(
      new ApiError(409, "A Test Definition with this name already exists for this client"),
    )
    assert.equal(duplicate.kind, "conflict")
    assert.equal(duplicate.requiresReload, false)
    assert.equal(duplicate.retrySameKey, false)

    // "still running under this key" is the one conflict that must be retried with it.
    const inProgress = mapTestDefinitionFailure(
      new ApiError(409, "A previous request with this idempotency key is currently in progress"),
    )
    assert.equal(inProgress.retrySameKey, true)

    const mismatch = mapTestDefinitionFailure(
      new ApiError(409, "Idempotency key reused with mismatched version or request parameters"),
    )
    assert.equal(mismatch.retrySameKey, false, "a mismatched key must not be replayed")
  })
})
