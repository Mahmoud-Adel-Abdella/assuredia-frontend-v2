import test from "node:test"
import assert from "node:assert/strict"
import React from "react"
import "../testdefinitions/__tests__/domEnvironment"
import { mount, cleanup, flush, button, click } from "../testdefinitions/__tests__/harness"
import { stubFetch } from "../testdefinitions/__tests__/harness"
import { RunEvidencePanel } from "../RunEvidencePanel"
import { setToken } from "../../lib/api"

const CLIENT = 7
const DEF = 41
const RUN = 1234

/** Minimal shape of GET …/test-definitions/{def}/runs/{run}. */
function details(overrides: Record<string, unknown> = {}) {
  return {
    id: RUN,
    run_id: "run-def-abc123",
    client_id: CLIENT,
    flow_id: null,
    status: "PASSED",
    total: 2,
    passed: 2,
    failed: 0,
    skipped: 0,
    duration_seconds: 4,
    timestamp: 1_790_000_000_000,
    browser: "chrome",
    env: "prod",
    error_message: null,
    implementation_type: "TEST_DEFINITION",
    execution_purpose: "TRIAL",
    test_definition_id: DEF,
    test_definition_version_id: 9,
    definition_version_number: 3,
    stepResults: [
      {
        id: 1, testRunId: RUN, stepIndex: 1, stepIdentifier: "open",
        actionType: "UI_NAVIGATE", status: "PASSED", reasonCode: null,
        message: "Opened the page", durationMs: 800, createdAt: null,
      },
      {
        id: 2, testRunId: RUN, stepIndex: 2, stepIdentifier: "signin",
        actionType: "UI_CLICK", status: "PASSED", reasonCode: null,
        message: "Clicked Sign in", durationMs: 300, createdAt: null,
      },
    ],
    artifacts: [],
    ...overrides,
  }
}

const RUN_ROUTE = `/test-definitions/${DEF}/runs/${RUN}`

test("RunEvidencePanel", async (t) => {
  setToken("test-token")
  t.afterEach(() => cleanup())

  await t.test("null test_definition_id shows a truthful unavailable state (backward compat)", async () => {
    const view = await mount(
      React.createElement(RunEvidencePanel, { clientId: CLIENT, definitionId: null, runId: null }),
    )
    const text = view.container.textContent ?? ""
    assert.ok(view.container.querySelector('[data-testid="run-evidence-unavailable"]'))
    assert.ok(text.includes("not available"))
    // No rich endpoint is called for a legacy/package run.
    view.unmount()
  })

  await t.test("shows a loading state while evidence is in flight", async () => {
    const original = globalThis.fetch
    // A fetch that never resolves keeps the panel in its loading state.
    globalThis.fetch = (() => new Promise(() => {})) as unknown as typeof fetch
    try {
      const view = await mount(
        React.createElement(RunEvidencePanel, { clientId: CLIENT, definitionId: DEF, runId: RUN }),
      )
      assert.ok(view.container.querySelector('[data-testid="run-evidence-loading"]'))
      view.unmount()
    } finally {
      globalThis.fetch = original
    }
  })

  await t.test("renders run summary and execution timeline on success (PASS)", async () => {
    const stub = stubFetch([{ match: RUN_ROUTE, json: details() }])
    try {
      const view = await mount(
        React.createElement(RunEvidencePanel, { clientId: CLIENT, definitionId: DEF, runId: RUN }),
      )
      await flush()
      const text = view.container.textContent ?? ""
      assert.ok(view.container.querySelector('[data-testid="run-evidence-ready"]'))
      assert.ok(text.includes("run-def-abc123"), "external run id shown")
      assert.ok(text.includes("UI_NAVIGATE") && text.includes("UI_CLICK"), "step actions shown")
      assert.ok(text.includes("Clicked Sign in"), "step message shown")
      view.unmount()
    } finally {
      stub.restore()
    }
  })

  await t.test("renders FAILED step evidence", async () => {
    const stub = stubFetch([{
      match: RUN_ROUTE,
      json: details({
        status: "FAILED", passed: 1, failed: 1,
        stepResults: [
          { id: 1, testRunId: RUN, stepIndex: 1, stepIdentifier: "open", actionType: "UI_NAVIGATE", status: "PASSED", reasonCode: null, message: "ok", durationMs: 100, createdAt: null },
          { id: 2, testRunId: RUN, stepIndex: 2, stepIdentifier: "fill", actionType: "UI_FILL", status: "FAILED", reasonCode: "LOCATOR_NOT_FOUND", message: "locator text=PENDING not found", durationMs: 50, createdAt: null },
        ],
      }),
    }])
    try {
      const view = await mount(React.createElement(RunEvidencePanel, { clientId: CLIENT, definitionId: DEF, runId: RUN }))
      await flush()
      const text = view.container.textContent ?? ""
      assert.ok(text.includes("locator text=PENDING not found"), "failure message shown")
      assert.ok(text.includes("LOCATOR_NOT_FOUND"), "reason code shown")
      view.unmount()
    } finally {
      stub.restore()
    }
  })

  await t.test("empty evidence (no steps, no artifacts) is explicit, never a blank panel", async () => {
    const stub = stubFetch([{ match: RUN_ROUTE, json: details({ stepResults: [], artifacts: [] }) }])
    try {
      const view = await mount(React.createElement(RunEvidencePanel, { clientId: CLIENT, definitionId: DEF, runId: RUN }))
      await flush()
      assert.ok(view.container.querySelector('[data-testid="run-evidence-empty"]'))
      view.unmount()
    } finally {
      stub.restore()
    }
  })

  await t.test("API error shows an error state with retry that refetches and succeeds", async () => {
    const stub = stubFetch([
      { match: RUN_ROUTE, status: 500, json: { error: "boom" }, once: true },
      { match: RUN_ROUTE, json: details() },
    ])
    try {
      const view = await mount(React.createElement(RunEvidencePanel, { clientId: CLIENT, definitionId: DEF, runId: RUN }))
      await flush()
      assert.ok(view.container.querySelector('[data-testid="run-evidence-error"]'), "error state shown")
      await click(button(view.container, "Try again"))
      await flush()
      assert.ok(view.container.querySelector('[data-testid="run-evidence-ready"]'), "retry recovered")
      view.unmount()
    } finally {
      stub.restore()
    }
  })

  await t.test("screenshot artifact renders inline via the authenticated artifact path; object URL revoked on unmount", async () => {
    const revoked: string[] = []
    const realCreate = URL.createObjectURL
    const realRevoke = URL.revokeObjectURL
    URL.createObjectURL = (() => "blob:evidence-1") as typeof URL.createObjectURL
    URL.revokeObjectURL = ((u: string) => { revoked.push(u) }) as typeof URL.revokeObjectURL
    const stub = stubFetch([
      {
        match: RUN_ROUTE,
        once: true,
        json: details({
          artifacts: [{
            id: 55, testRunId: RUN, stepIndex: 2, artifactType: "SCREENSHOT",
            artifactName: "step-2.png", filePath: "client-7/run-1234/secret-name.png",
            fileSizeBytes: 2048, contentType: "image/png", createdAt: null,
          }],
        }),
      },
      { match: `/runs/${RUN}/artifacts/55`, blob: { type: "image/png", content: "PNGDATA" } },
    ])
    try {
      const view = await mount(React.createElement(RunEvidencePanel, { clientId: CLIENT, definitionId: DEF, runId: RUN }))
      await flush()
      const img = view.container.querySelector("img") as HTMLImageElement | null
      assert.ok(img, "screenshot rendered inline as <img>")
      assert.equal(img?.getAttribute("src"), "blob:evidence-1", "inline image uses the authenticated object URL")
      // The artifact was fetched through the authenticated test-definitions route.
      const artifactReq = stub.requests.find((r) => r.url.includes(`/runs/${RUN}/artifacts/55`))
      assert.ok(artifactReq, "artifact fetched via the authenticated route")
      assert.ok(String(artifactReq?.headers["Authorization"] ?? "").startsWith("Bearer "), "artifact request is authenticated")
      // Raw server filesystem path is never rendered.
      assert.equal((view.container.textContent ?? "").includes("secret-name.png"), false)
      view.unmount()
      assert.ok(revoked.includes("blob:evidence-1"), "object URL revoked on unmount")
    } finally {
      stub.restore()
      URL.createObjectURL = realCreate
      URL.revokeObjectURL = realRevoke
    }
  })

  await t.test("a missing/broken screenshot artifact shows a truthful unavailable state", async () => {
    const stub = stubFetch([
      {
        match: RUN_ROUTE,
        once: true,
        json: details({
          artifacts: [{
            id: 77, testRunId: RUN, stepIndex: null, artifactType: "SCREENSHOT",
            artifactName: "gone.png", filePath: "client-7/run-1234/gone.png",
            fileSizeBytes: null, contentType: "image/png", createdAt: null,
          }],
        }),
      },
      { match: `/runs/${RUN}/artifacts/77`, status: 404, json: { error: "Not found" } },
    ])
    try {
      const view = await mount(React.createElement(RunEvidencePanel, { clientId: CLIENT, definitionId: DEF, runId: RUN }))
      await flush()
      assert.equal(view.container.querySelector("img"), null, "no broken image is shown")
      assert.ok((view.container.textContent ?? "").includes("unavailable"), "unavailable state shown")
      view.unmount()
    } finally {
      stub.restore()
    }
  })

  await t.test("no secret/authorization values are rendered", async () => {
    const stub = stubFetch([{
      match: RUN_ROUTE,
      json: details({
        artifacts: [{
          id: 55, testRunId: RUN, stepIndex: null, artifactType: "TRACE",
          artifactName: "trace.zip", filePath: "client-7/run-1234/internal/trace.zip",
          fileSizeBytes: 4096, contentType: "application/zip", createdAt: null,
        }],
      }),
    }])
    try {
      const view = await mount(React.createElement(RunEvidencePanel, { clientId: CLIENT, definitionId: DEF, runId: RUN }))
      await flush()
      const text = view.container.textContent ?? ""
      assert.equal(text.includes("client-7/run-1234"), false, "server filesystem reference never rendered")
      assert.equal(text.includes("Bearer"), false, "no authorization token rendered")
      assert.equal(text.includes("test-token"), false, "session token never rendered")
      view.unmount()
    } finally {
      stub.restore()
    }
  })

  await t.test("stale Run A response cannot overwrite Run B", async () => {
    // Hand-rolled fetch: Run A's details resolve LAST, after Run B is already shown.
    const box: { releaseA: ((body: unknown) => void) | null } = { releaseA: null }
    const original = globalThis.fetch
    globalThis.fetch = ((input: unknown) => {
      const url = String(input)
      if (url.includes(`/runs/${RUN}`)) {
        // Run A — resolve later, on demand.
        return new Promise((resolve) => {
          box.releaseA = (body) => resolve(new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } }))
        })
      }
      // Run B — resolve immediately.
      return Promise.resolve(new Response(JSON.stringify(details({ id: 9999, run_id: "run-def-BBB", test_definition_id: DEF })), { status: 200, headers: { "Content-Type": "application/json" } }))
    }) as unknown as typeof fetch
    try {
      const view = await mount(React.createElement(RunEvidencePanel, { clientId: CLIENT, definitionId: DEF, runId: RUN }))
      // Switch to Run B before Run A resolves.
      await view.rerender(React.createElement(RunEvidencePanel, { clientId: CLIENT, definitionId: DEF, runId: 9999 }))
      await flush()
      assert.ok((view.container.textContent ?? "").includes("run-def-BBB"), "Run B evidence shown")
      // Now let the stale Run A response arrive — it must be ignored.
      box.releaseA?.(details({ id: RUN, run_id: "run-def-AAA-STALE" }))
      await flush()
      const text = view.container.textContent ?? ""
      assert.equal(text.includes("run-def-AAA-STALE"), false, "stale Run A response must not overwrite Run B")
      assert.ok(text.includes("run-def-BBB"), "Run B still shown")
      view.unmount()
    } finally {
      globalThis.fetch = original
    }
  })

})
