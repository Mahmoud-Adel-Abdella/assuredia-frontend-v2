import test from "node:test"
import assert from "node:assert/strict"
import {
  ApiError,
  apiActivateTestDefinitionVersion,
  apiArchiveTestDefinitionVersion,
  apiCreateFlow,
  apiCreateTestDefinition,
  apiDownloadTestDefinitionArtifact,
  apiEditTestDefinitionDraft,
  apiExecuteTestDefinitionProving,
  apiExecuteTestDefinitionTrial,
  apiGetTestDefinition,
  apiGetTestDefinitionRun,
  apiListTestDefinitions,
  apiUpdateTestDefinition,
} from "../../../lib/api"
import {
  isFreshExecutionResponse,
  runViewFromDetails,
  runViewFromExecution,
  runViewFromExecutionResponse,
} from "../../../lib/testDefinitionRuns"
import {
  CLIENT_ID,
  DEFINITION_ID,
  PATHS,
  RUN_ID,
  VERSION_ID,
  details,
  executionResult,
  listItem,
  listResponse,
  runDetails,
} from "./fixtures"

type Captured = { url: string; method: string; headers: Record<string, string>; body: unknown }

function stub(
  responder: (captured: Captured) => { status?: number; json?: unknown; text?: string; contentType?: string },
) {
  const calls: Captured[] = []
  globalThis.fetch = (async (input: unknown, init?: RequestInit) => {
    const captured: Captured = {
      url: String(input),
      method: (init?.method ?? "GET").toUpperCase(),
      headers: { ...((init?.headers as Record<string, string>) ?? {}) },
      body: typeof init?.body === "string" ? JSON.parse(init.body) : undefined,
    }
    calls.push(captured)
    const reply = responder(captured)
    const payload = reply.text !== undefined
      ? reply.text
      : reply.json === undefined
        ? ""
        : JSON.stringify(reply.json)
    return new Response(payload, {
      status: reply.status ?? 200,
      headers: { "Content-Type": reply.contentType ?? "application/json" },
    })
  }) as typeof fetch
  return calls
}

test("Test Definition API bindings and run normalization", async (t) => {
  const originalFetch = globalThis.fetch
  t.afterEach(() => {
    globalThis.fetch = originalFetch
  })

  await t.test("List requests the tenant route with bounded paging and search", async () => {
    const calls = stub(() => ({ json: listResponse([listItem()], { total: 40, limit: 25, offset: 25 }) }))
    const page = await apiListTestDefinitions(CLIENT_ID, { limit: 25, offset: 25, search: " checkout " })

    assert.equal(calls.length, 1)
    assert.equal(calls[0].method, "GET")
    assert.match(calls[0].url, new RegExp(`${PATHS.list}\\?limit=25&offset=25&search=checkout$`))
    assert.equal(page.total, 40)
    assert.equal(page.items[0].id, DEFINITION_ID)
  })

  await t.test("A blank search is omitted rather than sent as an empty filter", async () => {
    const calls = stub(() => ({ json: listResponse([]) }))
    await apiListTestDefinitions(CLIENT_ID, { search: "   " })
    assert.ok(!calls[0].url.includes("search="))
  })

  await t.test("Create trims the name and sends the closed DTO the engine expects", async () => {
    const calls = stub(() => ({
      json: {
        definitionId: DEFINITION_ID,
        clientId: CLIENT_ID,
        name: "Checkout happy path",
        description: null,
        flowId: null,
        initialVersionId: VERSION_ID,
        versionNumber: 1,
        status: "DRAFT",
      },
    }))
    await apiCreateTestDefinition(CLIENT_ID, { name: "  Checkout happy path  " })

    assert.equal(calls[0].method, "POST")
    assert.deepEqual(calls[0].body, {
      name: "Checkout happy path",
      description: null,
      flowId: null,
      assetRequestId: null,
      initialSourceJson: null,
    })
  })

  await t.test("8. A duplicate name surfaces as a 409 carrying the engine's message", async () => {
    stub(() => ({
      status: 409,
      json: { error: "A Test Definition with this name already exists for this client" },
    }))
    await assert.rejects(
      () => apiCreateTestDefinition(CLIENT_ID, { name: "Checkout happy path" }),
      (err: unknown) => {
        assert.ok(err instanceof ApiError)
        assert.equal(err.status, 409)
        assert.equal(err.message, "A Test Definition with this name already exists for this client")
        return true
      },
    )
  })

  await t.test("25. A cross-tenant definition answers 404, indistinguishable from missing", async () => {
    stub(() => ({ status: 404, json: { error: "This client does not exist" } }))
    await assert.rejects(
      () => apiGetTestDefinition(999, DEFINITION_ID),
      (err: unknown) => {
        assert.ok(err instanceof ApiError)
        assert.equal(err.status, 404)
        return true
      },
    )

    stub(() => ({ status: 404, json: { error: "Test Definition not found" } }))
    await assert.rejects(
      () => apiGetTestDefinition(CLIENT_ID, 12345),
      (err: unknown) => {
        assert.ok(err instanceof ApiError)
        assert.equal(err.status, 404)
        return true
      },
    )
  })

  await t.test("A draft edit sends versionLock for optimistic concurrency", async () => {
    const calls = stub(() => ({
      json: { definitionId: DEFINITION_ID, versionId: VERSION_ID, versionNumber: 1, status: "DRAFT", versionLock: 2, updated: true },
    }))
    await apiEditTestDefinitionDraft(CLIENT_ID, DEFINITION_ID, VERSION_ID, {
      versionLock: 1,
      sourceJson: "{}",
      schemaVersion: "1.0",
    })
    assert.equal(calls[0].method, "PUT")
    assert.equal(calls[0].url.endsWith(PATHS.version), true)
    assert.deepEqual(calls[0].body, { versionLock: 1, sourceJson: "{}", schemaVersion: "1.0" })
  })

  await t.test("17. Trial and proving send Idempotency-Key, and omit it when absent", async () => {
    const withKey = stub(() => ({ json: executionResult("TRIAL") }))
    await apiExecuteTestDefinitionTrial(CLIENT_ID, DEFINITION_ID, VERSION_ID, "op-key-1")
    assert.equal(withKey[0].headers["Idempotency-Key"], "op-key-1")

    const withoutKey = stub(() => ({ json: executionResult("TRIAL") }))
    await apiExecuteTestDefinitionTrial(CLIENT_ID, DEFINITION_ID, VERSION_ID)
    assert.ok(!("Idempotency-Key" in withoutKey[0].headers))

    const proving = stub(() => ({ json: executionResult("PROVING", { becameReady: true, currentStatus: "READY" }) }))
    await apiExecuteTestDefinitionProving(CLIENT_ID, DEFINITION_ID, VERSION_ID, "op-key-2")
    assert.equal(proving[0].headers["Idempotency-Key"], "op-key-2")
    assert.match(proving[0].url, /\/proving$/)
  })

  await t.test("Archive posts to the version's archive route", async () => {
    const calls = stub(() => ({
      json: { definitionId: DEFINITION_ID, versionId: VERSION_ID, versionNumber: 1, status: "ARCHIVED", aggregateArchived: true },
    }))
    const result = await apiArchiveTestDefinitionVersion(CLIENT_ID, DEFINITION_ID, VERSION_ID)
    assert.match(calls[0].url, /\/archive$/)
    assert.equal(result.aggregateArchived, true)
  })

  /* ---- Activation (Draft-Activation phase) --------------------------- */

  await t.test("Activate posts to the version's activate route (no admin gate) and returns the marker", async () => {
    const calls = stub(() => ({
      json: {
        definitionId: DEFINITION_ID,
        activeVersionId: VERSION_ID,
        versionNumber: 1,
        activatedAt: "2026-08-30T12:00:00Z",
        activatedBy: 11,
        versionStatus: "DRAFT",
        active: true,
        alreadyActive: false,
      },
    }))
    const result = await apiActivateTestDefinitionVersion(CLIENT_ID, DEFINITION_ID, VERSION_ID)
    assert.equal(calls[0].method, "POST")
    assert.match(calls[0].url, new RegExp(`${PATHS.version}/activate$`))
    assert.equal(result.active, true)
    assert.equal(result.activeVersionId, VERSION_ID)
    assert.equal(result.versionStatus, "DRAFT", "activation never changes the canonical status")
    assert.equal(result.alreadyActive, false)
  })

  await t.test("A repeated activation is idempotent and reports alreadyActive", async () => {
    stub(() => ({
      json: {
        definitionId: DEFINITION_ID,
        activeVersionId: VERSION_ID,
        versionNumber: 1,
        activatedAt: "2026-08-30T12:00:00Z",
        activatedBy: 11,
        versionStatus: "DRAFT",
        active: true,
        alreadyActive: true,
      },
    }))
    const result = await apiActivateTestDefinitionVersion(CLIENT_ID, DEFINITION_ID, VERSION_ID)
    assert.equal(result.alreadyActive, true)
  })

  /* ---- Add to Flow (Draft-Activation phase) -------------------------- */

  await t.test("Add to an existing flow re-binds the aggregate, preserving name and description", async () => {
    const calls = stub(() => ({ json: { updated: true } }))
    await apiUpdateTestDefinition(CLIENT_ID, DEFINITION_ID, {
      name: "Checkout happy path",
      description: "Proves a card purchase completes",
      flowId: 300,
    })
    assert.equal(calls[0].method, "PUT")
    assert.equal(calls[0].url.endsWith(PATHS.definition), true)
    assert.deepEqual(calls[0].body, {
      name: "Checkout happy path",
      description: "Proves a card purchase completes",
      flowId: 300,
    })
  })

  await t.test("Create new flow then bind: two calls, the second uses the created flow id", async () => {
    const created = stub((c) =>
      c.url.endsWith("/flows")
        ? { json: { status: "ok", flowId: 777, flowName: "Login & Checkout", testsCreated: 0 } }
        : { json: { updated: true } },
    )
    const flow = await apiCreateFlow(CLIENT_ID, { flowName: "Login & Checkout" })
    await apiUpdateTestDefinition(CLIENT_ID, DEFINITION_ID, {
      name: "Checkout happy path",
      description: null,
      flowId: flow.flowId,
    })
    assert.equal(created.length, 2)
    assert.match(created[0].url, /\/clients\/\d+\/flows$/)
    assert.equal(created[0].method, "POST")
    assert.deepEqual(created[0].body, { flowName: "Login & Checkout" })
    assert.equal((created[1].body as { flowId: number }).flowId, 777)
  })

  await t.test("A duplicate flow name surfaces as a safe 409 rather than a duplicate flow", async () => {
    stub(() => ({ status: 409, json: { error: "A flow with this name already exists" } }))
    await assert.rejects(
      () => apiCreateFlow(CLIENT_ID, { flowName: "Existing Flow" }),
      (err: unknown) => {
        assert.ok(err instanceof ApiError)
        assert.equal(err.status, 409)
        return true
      },
    )
  })

  await t.test("An artifact download is an authenticated blob fetch, not a link", async () => {
    const calls = stub(() => ({ text: "PNGDATA", contentType: "image/png" }))
    const blob = await apiDownloadTestDefinitionArtifact(CLIENT_ID, DEFINITION_ID, RUN_ID, 5)
    assert.equal(calls[0].method, "GET")
    assert.match(calls[0].url, new RegExp(`${PATHS.run}/artifacts/5$`))
    assert.equal(await blob.text(), "PNGDATA")
  })

  await t.test("27. A missing artifact answers 404 with the engine's safe message", async () => {
    stub(() => ({ status: 404, json: { error: "Artifact file not found" } }))
    await assert.rejects(
      () => apiDownloadTestDefinitionArtifact(CLIENT_ID, DEFINITION_ID, RUN_ID, 5),
      (err: unknown) => {
        assert.ok(err instanceof ApiError)
        assert.equal(err.status, 404)
        assert.equal(err.message, "Artifact file not found")
        return true
      },
    )

    // The controller's own not-found path returns an empty body; the status still maps.
    stub(() => ({ status: 404, text: "" }))
    await assert.rejects(
      () => apiDownloadTestDefinitionArtifact(CLIENT_ID, DEFINITION_ID, RUN_ID, 5),
      (err: unknown) => {
        assert.ok(err instanceof ApiError)
        assert.equal(err.status, 404)
        assert.ok(err.message.length > 0, "an empty body must still produce a displayable message")
        return true
      },
    )
  })

  /* ---- Normalizing the two execution shapes -------------------------- */

  await t.test("A fresh execution and a replay are told apart by shape, not by guessing", () => {
    assert.equal(isFreshExecutionResponse(executionResult("TRIAL")), true)
    assert.equal(isFreshExecutionResponse(runDetails()), false)
  })

  await t.test("13. A fresh trial response normalizes into steps plus expected outcomes", () => {
    const view = runViewFromExecution(executionResult("TRIAL"))
    assert.equal(view.runId, RUN_ID)
    assert.equal(view.purpose, "TRIAL")
    assert.equal(view.status, "PASSED")
    assert.equal(view.replayed, false)
    assert.equal(view.steps.length, 2)
    assert.equal(view.steps[0].isExpectedOutcome, false)
    assert.equal(view.steps[1].isExpectedOutcome, true)
    // Opcodes arrive as enum names, not the "ui.navigate" wire form.
    assert.equal(view.steps[0].action, "UI_NAVIGATE")
    assert.deepEqual(view.totals, { total: 2, passed: 2, failed: 0, skipped: 0 })
    assert.equal(
      view.artifactsUnknown,
      true,
      "a fresh execution carries no artifacts, which must not read as none produced",
    )
  })

  await t.test("14. A failed trial keeps the failure reason and counts it as failed", () => {
    const failed = executionResult("TRIAL", {
      status: "FAILED",
      terminatingReasonCode: "ASSERTION_FAILED",
      outcomeResults: [
        {
          stepIndex: 0,
          stepAddress: "expectedOutcomes[0]",
          opcode: "UI_ASSERT_TEXT",
          status: "FAILED",
          reasonCode: "ASSERTION_FAILED",
          sanitizedMessage: "Expected \"Thank you\" but found \"Payment declined\"",
          expectedValue: "Thank you",
          actualValue: "Payment declined",
          effectiveTimeoutMs: 10000,
          elapsedMs: 120,
          screenshotPath: "step-0.png",
        },
      ],
    })
    const view = runViewFromExecution(failed)
    assert.equal(view.status, "FAILED")
    assert.equal(view.terminatingReasonCode, "ASSERTION_FAILED")
    assert.equal(view.totals.failed, 1)
    assert.equal(view.steps[1].reasonCode, "ASSERTION_FAILED")
    assert.match(String(view.steps[1].message), /Payment declined/)
  })

  await t.test("Steps the engine never reached are counted as skipped, not failed", () => {
    const view = runViewFromExecution(executionResult("TRIAL", {
      status: "FAILED",
      stepResults: [
        { stepIndex: 0, stepAddress: "steps[0]", opcode: "UI_NAVIGATE", status: "FAILED", reasonCode: "TIMEOUT", sanitizedMessage: "timed out", expectedValue: null, actualValue: null, effectiveTimeoutMs: 10000, elapsedMs: 10000, screenshotPath: null },
        { stepIndex: 1, stepAddress: "steps[1]", opcode: "UI_CLICK", status: "NOT_EXECUTED", reasonCode: null, sanitizedMessage: null, expectedValue: null, actualValue: null, effectiveTimeoutMs: 0, elapsedMs: 0, screenshotPath: null },
      ],
      outcomeResults: [],
    }))
    assert.deepEqual(view.totals, { total: 2, passed: 0, failed: 1, skipped: 1 })
  })

  await t.test("21/22. Proving reports its READY outcome without the UI inferring it", () => {
    const ready = runViewFromExecution(executionResult("PROVING", { becameReady: true, currentStatus: "READY" }))
    assert.equal(ready.becameReady, true)
    assert.equal(ready.currentStatus, "READY")

    const notReady = runViewFromExecution(
      executionResult("PROVING", { status: "FAILED", becameReady: false, currentStatus: "APPROVED" }),
    )
    assert.equal(notReady.becameReady, false)
    assert.equal(notReady.currentStatus, "APPROVED")
  })

  await t.test("An execution that lost its lease carries the engine's note through", () => {
    const view = runViewFromExecution(
      executionResult("TRIAL", { idempotencyNote: "This execution lost its idempotency lease; the recorded result is authoritative" }),
    )
    assert.match(String(view.idempotencyNote), /authoritative/)
  })

  await t.test("26. A stored run normalizes its snake_case row, steps and artifact metadata", () => {
    const view = runViewFromDetails(runDetails())
    assert.equal(view.runId, RUN_ID)
    assert.equal(view.externalRunId, "run-def-abc123")
    assert.equal(view.purpose, "TRIAL")
    assert.equal(view.durationMs, 1000)
    // `timestamp` arrives as epoch millis from the java.sql.Timestamp column.
    assert.equal(view.startedAt, "2026-08-30T11:20:00.000Z")
    assert.equal(view.artifactsUnknown, false)
    assert.equal(view.artifacts.length, 1)
    assert.equal(view.artifacts[0].name, "step-0.png")
    assert.equal(view.artifacts[0].sizeBytes, 20481)
  })

  await t.test("The artifact storage reference is dropped from the view model", () => {
    const view = runViewFromDetails(runDetails())
    const serialized = JSON.stringify(view)
    assert.ok(!serialized.includes("filePath"))
    assert.ok(!serialized.includes(`run-${RUN_ID}/step-0.png`), "no storage path may reach the UI layer")
    assert.ok(!Object.prototype.hasOwnProperty.call(view.artifacts[0], "filePath"))
  })

  await t.test("17b. A replayed execution is normalized as the original stored run", async () => {
    const calls = stub(() => ({ json: runDetails() }))
    const replay = await apiExecuteTestDefinitionTrial(CLIENT_ID, DEFINITION_ID, VERSION_ID, "op-key-1")
    const view = runViewFromExecutionResponse(replay)

    assert.equal(calls[0].headers["Idempotency-Key"], "op-key-1")
    assert.equal(view.replayed, true, "a replay must be shown as a retrieval, not a new run")
    assert.equal(view.runId, RUN_ID)
    assert.equal(view.becameReady, null, "a replay carries no becameReady, and none is invented")
    assert.equal(view.artifacts.length, 1)
  })

  await t.test("GET run details reads back evidence after a fresh execution", async () => {
    const calls = stub(() => ({ json: runDetails() }))
    const view = runViewFromDetails(await apiGetTestDefinitionRun(CLIENT_ID, DEFINITION_ID, RUN_ID))
    assert.equal(calls[0].url.endsWith(PATHS.run), true)
    assert.equal(view.artifacts.length, 1)
    assert.equal(view.replayed, false)
  })

  await t.test("Definition details expose the version history the engine returns", async () => {
    stub(() => ({ json: details("VALIDATED") }))
    const loaded = await apiGetTestDefinition(CLIENT_ID, DEFINITION_ID)
    assert.equal(loaded.versions.length, 1)
    assert.equal(loaded.versions[0].status, "VALIDATED")
    assert.equal(loaded.versions[0].versionLock, 1)
    assert.ok(!Object.prototype.hasOwnProperty.call(loaded.versions[0], "sourceJson"), "the list of versions omits source by contract")
  })
})
