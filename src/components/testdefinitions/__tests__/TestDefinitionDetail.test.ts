import test from "node:test"
import assert from "node:assert/strict"
import React from "react"
import {
  actAsync,
  button,
  cleanup,
  click,
  doubleClick,
  flush,
  mount,
  optionalButton,
  pressKey,
  queryAll,
  setValue,
  stubFetch,
  textOf,
  type StubRoute,
} from "./harness"
import { TestDefinitionDetail } from "../TestDefinitionDetail"
import {
  CLIENT_ID,
  CLIENT_NAME,
  DEFINITION_ID,
  PATHS,
  RUN_ID,
  VALID_SOURCE,
  VERSION_ID,
  details,
  executionResult,
  invalidReport,
  runDetails,
  validReport,
  version,
  versionSummary,
} from "./fixtures"
import type { TestDefinitionStatus } from "../../../lib/api"

/** Routes that answer the two GETs the detail view always makes. */
function baseRoutes(status: TestDefinitionStatus, extra: Partial<Parameters<typeof version>[1]> = {}): StubRoute[] {
  return [
    { match: PATHS.version, method: "GET", json: version(status, extra) },
    { match: PATHS.definition, method: "GET", json: details(status) },
  ]
}

async function renderDetail(
  routes: StubRoute[],
  overrides: Partial<Parameters<typeof TestDefinitionDetail>[0]> = {},
) {
  const stub = stubFetch(routes)
  const view = await mount(
    React.createElement(TestDefinitionDetail, {
      clientId: CLIENT_ID,
      clientName: CLIENT_NAME,
      definitionId: DEFINITION_ID,
      isAdmin: true,
      onBack: () => {},
      onUnauthorized: () => {},
      ...overrides,
    }),
  )
  await flush(5)
  return { ...view, stub }
}

function editor(root: ParentNode): HTMLTextAreaElement {
  const found = root.querySelector<HTMLTextAreaElement>("#testdef-source-editor")
  if (!found) throw new Error("The source editor is not rendered")
  return found
}

function actionButton(root: ParentNode, action: string): HTMLButtonElement | null {
  return root.querySelector<HTMLButtonElement>(`button[data-action="${action}"]`)
}

test("Test Definition detail, editor and lifecycle", async (t) => {
  let restore: (() => void) | null = null
  t.afterEach(() => {
    restore?.()
    restore = null
    cleanup()
  })

  await t.test("9. A DRAFT is editable and saves with the server's version lock", async () => {
    const saved = { definitionId: DEFINITION_ID, versionId: VERSION_ID, versionNumber: 1, status: "DRAFT", versionLock: 2, updated: true }
    const view = await renderDetail([
      { match: PATHS.version, method: "PUT", json: saved },
      ...baseRoutes("DRAFT"),
    ])
    restore = view.stub.restore

    const area = editor(view.container)
    assert.equal(area.disabled, false)
    assert.equal(area.readOnly, false)

    const next = VALID_SOURCE.replace("Checkout happy path", "Checkout happy path v2")
    await setValue(area, next)
    assert.match(textOf(view.container), /Unsaved changes/)

    await click(button(view.container, "Save draft"))
    await flush(5)

    const put = view.stub.requests.find((r) => r.method === "PUT")
    assert.ok(put, "saving must PUT the version")
    assert.deepEqual(put.body, { versionLock: 1, sourceJson: next, schemaVersion: "1.0" })
    // The server is re-read after a save rather than the UI assuming success.
    assert.ok(view.stub.requests.filter((r) => r.method === "GET").length >= 4)
  })

  await t.test("9b. A dirty draft can be discarded back to the server's copy", async () => {
    const view = await renderDetail(baseRoutes("DRAFT"))
    restore = view.stub.restore

    await setValue(editor(view.container), '{"schemaVersion":"1.0"}')
    assert.match(textOf(view.container), /Unsaved changes/)

    await click(button(view.container, "Discard changes"))
    assert.equal(editor(view.container).value, VALID_SOURCE)
    assert.ok(!textOf(view.container).includes("Unsaved changes"))
  })

  await t.test("9c. Broken JSON is refused before the request is made", async () => {
    const view = await renderDetail(baseRoutes("DRAFT"))
    restore = view.stub.restore

    await setValue(editor(view.container), "{ not json")
    await click(button(view.container, "Save draft"))
    await flush()

    assert.equal(view.stub.requests.filter((r) => r.method === "PUT").length, 0)
    assert.ok(view.container.querySelector("#testdef-draft-error"))
  })

  await t.test("10. A 409 on save reports the conflict and reloads from the server", async () => {
    const view = await renderDetail([
      {
        match: PATHS.version,
        method: "PUT",
        status: 409,
        json: { error: "Version 1 is VALIDATED and cannot be edited. Create a new version instead." },
      },
      ...baseRoutes("DRAFT"),
    ])
    restore = view.stub.restore

    await setValue(editor(view.container), VALID_SOURCE.replace("Checkout", "Changed"))
    const getsBefore = view.stub.requests.filter((r) => r.method === "GET").length
    await click(button(view.container, "Save draft"))
    await flush(6)

    assert.match(textOf(document.body), /cannot be edited/)
    assert.ok(
      view.stub.requests.filter((r) => r.method === "GET").length > getsBefore,
      "a stale-state conflict must re-read the server rather than guess",
    )
  })

  await t.test("11. Validate reports the engine's report and the new status", async () => {
    const view = await renderDetail([
      // The initial read is a DRAFT; after validating, the engine reports VALIDATED
      // with the report it persisted.
      { match: PATHS.version, method: "GET", json: version("DRAFT"), once: true },
      { match: PATHS.definition, method: "GET", json: details("DRAFT"), once: true },
      {
        match: `${PATHS.version}/validate`,
        method: "POST",
        json: { definitionId: DEFINITION_ID, versionId: VERSION_ID, versionNumber: 1, status: "VALIDATED", valid: true, validationReport: validReport() },
      },
      { match: PATHS.version, method: "GET", json: version("VALIDATED", { validationReportJson: JSON.stringify(validReport()) }) },
      { match: PATHS.definition, method: "GET", json: details("VALIDATED") },
    ])
    restore = view.stub.restore

    const validate = actionButton(view.container, "validate")
    assert.ok(validate)
    assert.equal(validate.disabled, false, "a DRAFT must be validatable")
    await click(validate)
    await flush(6)

    assert.ok(view.stub.requests.some((r) => r.url.endsWith("/validate") && r.method === "POST"))
    assert.match(textOf(view.container), /Engine validation/)
    assert.match(textOf(view.container), /No problems found/)
    // The status shown comes from the re-read, not from an optimistic guess.
    assert.ok(view.container.querySelector('[data-testid="testdef-status-VALIDATED"]'))
  })

  await t.test("12. A failing validation keeps DRAFT and lists the findings", async () => {
    const view = await renderDetail([
      {
        match: `${PATHS.version}/validate`,
        method: "POST",
        json: { definitionId: DEFINITION_ID, versionId: VERSION_ID, versionNumber: 1, status: "DRAFT", valid: false, validationReport: invalidReport() },
      },
      { match: PATHS.version, method: "GET", json: version("DRAFT", { validationReportJson: JSON.stringify(invalidReport()) }) },
      { match: PATHS.definition, method: "GET", json: details("DRAFT") },
    ])
    restore = view.stub.restore

    await click(actionButton(view.container, "validate")!)
    await flush(6)

    const body = textOf(view.container)
    assert.match(body, /url is required for ui\.navigate/)
    assert.match(body, /1 error/)
    assert.ok(
      queryAll(view.container, "code").some((c) => c.textContent === "/steps/0/url"),
      "the engine's JSON pointer is shown so the author can find the node",
    )
    // The version is still a DRAFT, so it stays editable.
    assert.equal(editor(view.container).disabled, false)
    assert.ok(view.container.querySelector('[data-testid="testdef-status-DRAFT"]'))
  })

  await t.test("13. A trial sends one idempotency key and renders the run", async () => {
    const view = await renderDetail([
      { match: `${PATHS.version}/trial`, method: "POST", json: executionResult("TRIAL") },
      ...baseRoutes("VALIDATED"),
    ])
    restore = view.stub.restore

    await click(actionButton(view.container, "trial")!)
    await flush(6)

    const trial = view.stub.requests.find((r) => r.url.endsWith("/trial"))
    assert.ok(trial)
    const key = trial.headers["Idempotency-Key"]
    assert.ok(key && key.length >= 32, "a trial must carry a generated idempotency key")

    const body = textOf(view.container)
    assert.match(body, /Run result/)
    assert.match(body, /run-def-abc123|#512/)
    assert.ok(view.container.querySelector('[data-testid="testdef-run-status-PASSED"]'))
    assert.match(body, /UI_NAVIGATE/)
    assert.match(body, /Expected outcome/)
    // A fresh execution has no artifact list; the panel says so rather than
    // claiming the run produced no evidence.
    assert.match(body, /Refresh the run to list it/)
  })

  await t.test("14. A failed trial shows the failure and its sanitized reason", async () => {
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
    const view = await renderDetail([
      { match: `${PATHS.version}/trial`, method: "POST", json: failed },
      ...baseRoutes("VALIDATED"),
    ])
    restore = view.stub.restore

    await click(actionButton(view.container, "trial")!)
    await flush(6)

    assert.ok(view.container.querySelector('[data-testid="testdef-run-status-FAILED"]'))
    assert.match(textOf(view.container), /Payment declined/)
    assert.match(textOf(view.container), /ASSERTION_FAILED/)
  })

  await t.test("15. A trial that errors surfaces a safe message and no run", async () => {
    const view = await renderDetail([
      {
        match: `${PATHS.version}/trial`,
        method: "POST",
        status: 500,
        json: { error: "java.sql.SQLException at engine.Repo.insert(Repo.java:118)" },
      },
      ...baseRoutes("VALIDATED"),
    ])
    restore = view.stub.restore

    await click(actionButton(view.container, "trial")!)
    await flush(6)

    const shown = textOf(document.body)
    assert.ok(!shown.includes("SQLException"), "no server internals may reach the screen")
    assert.ok(!shown.includes("Repo.java"))
    assert.ok(!shown.includes("Run result"), "a failed dispatch must not render a run")
  })

  await t.test("16. Two rapid clicks on Run trial dispatch exactly one execution", async () => {
    let resolveTrial: ((value: Response) => void) | null = null
    const trialCalls: { key: string | undefined }[] = []
    const original = globalThis.fetch
    restore = () => {
      globalThis.fetch = original
    }
    globalThis.fetch = (async (input: unknown, init?: RequestInit) => {
      const url = String(input)
      const method = (init?.method ?? "GET").toUpperCase()
      if (method === "GET") {
        const json = url.includes("/versions/") ? version("VALIDATED") : details("VALIDATED")
        return new Response(JSON.stringify(json), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        })
      }
      trialCalls.push({ key: (init?.headers as Record<string, string>)?.["Idempotency-Key"] })
      return new Promise<Response>((resolve) => {
        resolveTrial = resolve
      })
    }) as typeof fetch

    const view = await mount(
      React.createElement(TestDefinitionDetail, {
        clientId: CLIENT_ID,
        clientName: CLIENT_NAME,
        definitionId: DEFINITION_ID,
        isAdmin: true,
        onBack: () => {},
        onUnauthorized: () => {},
      }),
    )
    await flush(5)

    await doubleClick(actionButton(view.container, "trial")!)
    assert.equal(trialCalls.length, 1, "a double click must produce one run, not two")

    // A third click while the request is still in flight is refused as well.
    await click(actionButton(view.container, "trial")!)
    assert.equal(trialCalls.length, 1)

    await actAsync(() => {
      resolveTrial?.(
        new Response(JSON.stringify(executionResult("TRIAL")), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      )
    })
    assert.match(textOf(view.container), /Run result/)
  })

  await t.test("17. A replayed trial is presented as the original run, not a new one", async () => {
    const view = await renderDetail([
      // The engine answers a completed key with the stored run-details shape.
      { match: `${PATHS.version}/trial`, method: "POST", json: runDetails() },
      ...baseRoutes("VALIDATED"),
    ])
    restore = view.stub.restore

    await click(actionButton(view.container, "trial")!)
    await flush(6)

    const body = textOf(view.container)
    assert.match(body, /Replayed result/)
    assert.match(body, /run-def-abc123/)
    // The stored run carries its evidence, so the artifact list is real here.
    assert.match(body, /step-0\.png/)
  })

  await t.test("29. After a network failure the retry reuses the same idempotency key", async () => {
    const keys: (string | undefined)[] = []
    let failNext = true
    const original = globalThis.fetch
    restore = () => {
      globalThis.fetch = original
    }
    globalThis.fetch = (async (input: unknown, init?: RequestInit) => {
      const url = String(input)
      const method = (init?.method ?? "GET").toUpperCase()
      if (method === "GET") {
        const json = url.includes("/versions/") ? version("VALIDATED") : details("VALIDATED")
        return new Response(JSON.stringify(json), { status: 200, headers: { "Content-Type": "application/json" } })
      }
      keys.push((init?.headers as Record<string, string>)?.["Idempotency-Key"])
      if (failNext) {
        failNext = false
        // The request left, but no response came back: the outcome is unknown.
        throw new TypeError("Failed to fetch")
      }
      return new Response(JSON.stringify(runDetails()), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    }) as typeof fetch

    const view = await mount(
      React.createElement(TestDefinitionDetail, {
        clientId: CLIENT_ID,
        clientName: CLIENT_NAME,
        definitionId: DEFINITION_ID,
        isAdmin: true,
        onBack: () => {},
        onUnauthorized: () => {},
      }),
    )
    await flush(5)

    await click(actionButton(view.container, "trial")!)
    await flush(6)
    assert.equal(keys.length, 1)

    await click(actionButton(view.container, "trial")!)
    await flush(6)

    assert.equal(keys.length, 2)
    assert.equal(keys[0], keys[1], "the retry must replay the same operation, not start a second run")
    assert.match(textOf(view.container), /Replayed result/)
  })

  await t.test("18. An admin sees the admin-only steps in the states that allow them", async () => {
    const view = await renderDetail(baseRoutes("VALIDATED"))
    restore = view.stub.restore

    assert.ok(actionButton(view.container, "approve"), "approve is an admin control")
    assert.equal(actionButton(view.container, "approve")!.disabled, false)
    assert.ok(actionButton(view.container, "proving"), "proving is visible even before APPROVED")
    assert.equal(actionButton(view.container, "proving")!.disabled, true)
    assert.equal(actionButton(view.container, "trial")!.disabled, false)

    // A disabled control explains itself instead of silently doing nothing.
    const reason = view.container.querySelector("#testdef-reason-proving")
    assert.ok(reason)
    assert.match(textOf(reason), /Not available while this version is Validated/)
    assert.equal(actionButton(view.container, "proving")!.getAttribute("aria-describedby"), "testdef-reason-proving")
  })

  await t.test("19. A non-admin never sees approve, proving or archive", async () => {
    const view = await renderDetail(baseRoutes("APPROVED"), { isAdmin: false })
    restore = view.stub.restore

    assert.equal(actionButton(view.container, "approve"), null)
    assert.equal(actionButton(view.container, "proving"), null)
    assert.equal(actionButton(view.container, "archive"), null)
    // What they may still do stays available.
    assert.ok(actionButton(view.container, "trial"))
    assert.equal(actionButton(view.container, "trial")!.disabled, false)
    assert.ok(actionButton(view.container, "newVersion"))
  })

  await t.test("20. Approve is confirmed first, then re-read from the server", async () => {
    const view = await renderDetail([
      { match: PATHS.version, method: "GET", json: version("VALIDATED"), once: true },
      { match: PATHS.definition, method: "GET", json: details("VALIDATED"), once: true },
      {
        match: `${PATHS.version}/approve`,
        method: "POST",
        json: { definitionId: DEFINITION_ID, versionId: VERSION_ID, versionNumber: 1, status: "APPROVED" },
      },
      { match: PATHS.version, method: "GET", json: version("APPROVED") },
      { match: PATHS.definition, method: "GET", json: details("APPROVED") },
    ])
    restore = view.stub.restore

    await click(actionButton(view.container, "approve")!)
    // Nothing is sent until the dialog is confirmed.
    assert.equal(view.stub.requests.filter((r) => r.method === "POST").length, 0)

    const dialog = document.body.querySelector('[role="dialog"]')
    assert.ok(dialog, "a sensitive step must ask first")
    assert.match(textOf(dialog), /Approve this version\?/)

    await click(button(dialog, "Approve"))
    await flush(6)

    assert.ok(view.stub.requests.some((r) => r.url.endsWith("/approve") && r.method === "POST"))
    assert.ok(view.container.querySelector('[data-testid="testdef-status-APPROVED"]'))
    assert.equal(document.body.querySelector('[role="dialog"]'), null, "the dialog closes once it is done")
  })

  await t.test("A confirmation can be abandoned without sending anything", async () => {
    const view = await renderDetail(baseRoutes("VALIDATED"))
    restore = view.stub.restore

    await click(actionButton(view.container, "approve")!)
    const dialog = document.body.querySelector('[role="dialog"]')
    assert.ok(dialog)
    await click(button(dialog, "Cancel"))

    assert.equal(document.body.querySelector('[role="dialog"]'), null)
    assert.equal(view.stub.requests.filter((r) => r.method === "POST").length, 0)
  })

  await t.test("21. A passing proving run reports READY, taken from the engine", async () => {
    const view = await renderDetail([
      { match: PATHS.version, method: "GET", json: version("APPROVED"), once: true },
      { match: PATHS.definition, method: "GET", json: details("APPROVED"), once: true },
      {
        match: `${PATHS.version}/proving`,
        method: "POST",
        json: executionResult("PROVING", { becameReady: true, currentStatus: "READY" }),
      },
      { match: PATHS.version, method: "GET", json: version("READY", { provingRunId: RUN_ID }) },
      { match: PATHS.definition, method: "GET", json: details("READY") },
    ])
    restore = view.stub.restore

    await click(actionButton(view.container, "proving")!)
    const dialog = document.body.querySelector('[role="dialog"]')
    assert.ok(dialog)
    assert.match(textOf(dialog), /real environment/)
    await click(button(dialog, "Run proving"))
    await flush(6)

    const body = textOf(view.container)
    assert.match(body, /The proving run passed and the version is now READY/)
    assert.ok(view.container.querySelector('[data-testid="testdef-status-READY"]'))
    // READY has no control of its own — it is only ever a consequence.
    assert.equal(actionButton(view.container, "ready"), null)
    // The proving run is recorded against the version.
    assert.match(body, new RegExp(`#${RUN_ID}`))
  })

  await t.test("22. A failing proving run leaves the version APPROVED", async () => {
    const view = await renderDetail([
      { match: PATHS.version, method: "GET", json: version("APPROVED"), once: true },
      { match: PATHS.definition, method: "GET", json: details("APPROVED"), once: true },
      {
        match: `${PATHS.version}/proving`,
        method: "POST",
        json: executionResult("PROVING", {
          status: "FAILED",
          terminatingReasonCode: "ASSERTION_FAILED",
          becameReady: false,
          currentStatus: "APPROVED",
        }),
      },
      ...baseRoutes("APPROVED"),
    ])
    restore = view.stub.restore

    await click(actionButton(view.container, "proving")!)
    await click(button(document.body.querySelector('[role="dialog"]')!, "Run proving"))
    await flush(6)

    const body = textOf(view.container)
    assert.match(body, /did not pass, so the version stays APPROVED/)
    assert.ok(view.container.querySelector('[data-testid="testdef-status-APPROVED"]'))
    assert.equal(view.container.querySelector('[data-testid="testdef-status-READY"]'), null)
    assert.ok(view.container.querySelector('[data-testid="testdef-run-status-FAILED"]'))
    // Archive stays unavailable because the version never became READY.
    assert.equal(actionButton(view.container, "archive")!.disabled, true)
  })

  await t.test("23. Archive is a danger confirmation and freezes the definition", async () => {
    const view = await renderDetail([
      { match: PATHS.version, method: "GET", json: version("READY"), once: true },
      { match: PATHS.definition, method: "GET", json: details("READY"), once: true },
      {
        match: `${PATHS.version}/archive`,
        method: "POST",
        json: { definitionId: DEFINITION_ID, versionId: VERSION_ID, versionNumber: 1, status: "ARCHIVED", aggregateArchived: true },
      },
      { match: PATHS.version, method: "GET", json: version("ARCHIVED") },
      { match: PATHS.definition, method: "GET", json: details("ARCHIVED") },
    ])
    restore = view.stub.restore

    await click(actionButton(view.container, "archive")!)
    const dialog = document.body.querySelector('[role="dialog"]')
    assert.ok(dialog)
    assert.match(textOf(dialog), /permanent/)
    await click(button(dialog, "Archive"))
    await flush(6)

    assert.ok(view.stub.requests.some((r) => r.url.endsWith("/archive") && r.method === "POST"))
    assert.ok(view.container.querySelector('[data-testid="testdef-status-ARCHIVED"]'))
  })

  await t.test("24. An ARCHIVED definition is read-only and offers nothing", async () => {
    const view = await renderDetail(baseRoutes("ARCHIVED"))
    restore = view.stub.restore

    assert.equal(editor(view.container).disabled, true)
    assert.equal(editor(view.container).readOnly, true)
    assert.equal(optionalButton(view.container, "Save draft"), null)
    assert.equal(optionalButton(view.container, "Discard changes"), null)

    for (const action of ["validate", "trial", "approve", "proving", "archive", "newVersion"]) {
      const control = actionButton(view.container, action)
      if (control) assert.equal(control.disabled, true, `${action} must be disabled once archived`)
    }
    assert.match(textOf(view.container), /archived and cannot be changed or executed/)
  })
})
