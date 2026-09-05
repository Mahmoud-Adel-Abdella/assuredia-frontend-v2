import test from "node:test"
import assert from "node:assert/strict"
import React from "react"
import { button, cleanup, click, flush, mount, queryAll, stubFetch, textOf } from "./harness"
import { TestDefinitionRunPanel } from "../TestDefinitionRunPanel"
import { runViewFromDetails, runViewFromExecution } from "../../../lib/testDefinitionRuns"
import { CLIENT_ID, DEFINITION_ID, PATHS, RUN_ID, executionResult, runDetails } from "./fixtures"

const ARTIFACT_PATH = `${PATHS.run}/artifacts/5`

function renderPanel(run: ReturnType<typeof runViewFromDetails> | null, running = false) {
  return mount(
    React.createElement(TestDefinitionRunPanel, {
      clientId: CLIENT_ID,
      definitionId: DEFINITION_ID,
      run,
      running,
    }),
  )
}

test("Run results and evidence", async (t) => {
  let restore: (() => void) | null = null
  t.afterEach(() => {
    restore?.()
    restore = null
    cleanup()
  })

  await t.test("26. Artifact metadata is rendered, and the storage reference is not", async () => {
    const view = await renderPanel(runViewFromDetails(runDetails()))

    const body = textOf(view.container)
    assert.match(body, /Evidence/)
    assert.match(body, /step-0\.png/)
    assert.match(body, /SCREENSHOT/)
    assert.match(body, /Step 0/)
    assert.match(body, /20\.0 KB/)
    assert.ok(button(view.container, "Download"), "each artifact offers an authenticated download")

    // The engine still returns a storage reference on this payload; it must never
    // reach the page, and there must be no href pointing at one either.
    const html = view.container.innerHTML
    assert.ok(!html.includes(`${CLIENT_ID}/run-${RUN_ID}/step-0.png`))
    assert.ok(!html.includes("filePath"))
    assert.equal(queryAll(view.container, "a[href]").length, 0, "evidence has no public URL to link to")
  })

  await t.test("26b. A run with no evidence says so, without implying a failure", async () => {
    const view = await renderPanel(runViewFromDetails(runDetails({ artifacts: [] })))
    assert.match(textOf(view.container), /This run produced no evidence files/)
    assert.equal(queryAll(view.container, "button").filter((b) => textOf(b) === "Download").length, 0)
  })

  await t.test("26c. A fresh execution distinguishes 'not reported here' from 'none'", async () => {
    const view = await renderPanel(runViewFromExecution(executionResult("TRIAL")))
    const body = textOf(view.container)
    assert.match(body, /Refresh the run to list it/)
    assert.ok(!body.includes("produced no evidence files"))
  })

  await t.test("27. A missing artifact file is reported as unavailable, not as a crash", async () => {
    const stub = stubFetch([
      { match: ARTIFACT_PATH, status: 404, json: { error: "Artifact file not found" } },
    ])
    restore = stub.restore

    const view = await renderPanel(runViewFromDetails(runDetails()))
    await click(button(view.container, "Download"))
    await flush(4)

    const shown = textOf(view.container)
    assert.match(shown, /Evidence file unavailable/)
    assert.match(shown, /could not return the file/)
    // The control comes back so the user can try again.
    assert.equal(button(view.container, "Download").disabled, false)
  })

  await t.test("27b. A denied artifact is reported as denied, with the engine's reason", async () => {
    const stub = stubFetch([
      {
        match: ARTIFACT_PATH,
        status: 403,
        json: { error: "Your client environment is currently inactive — contact your administrator" },
      },
    ])
    restore = stub.restore

    const view = await renderPanel(runViewFromDetails(runDetails()))
    await click(button(view.container, "Download"))
    await flush(4)

    const shown = textOf(view.container)
    assert.match(shown, /Evidence access denied/)
    assert.match(shown, /currently inactive/)
  })

  await t.test("27c. A 5xx during download shows a safe message, never server internals", async () => {
    const stub = stubFetch([
      {
        match: ARTIFACT_PATH,
        status: 500,
        json: { error: "java.io.FileNotFoundException: D:\\engine\\artifacts\\7\\run-512\\step-0.png" },
      },
    ])
    restore = stub.restore

    const view = await renderPanel(runViewFromDetails(runDetails()))
    await click(button(view.container, "Download"))
    await flush(4)

    const shown = textOf(document.body)
    assert.match(shown, /Download failed/)
    assert.ok(!shown.includes("FileNotFoundException"))
    assert.ok(!shown.includes("D:\\"))
    assert.ok(!shown.includes("artifacts"))
  })

  await t.test("A successful download fetches the bytes with the session, not a link", async () => {
    const stub = stubFetch([
      { match: ARTIFACT_PATH, blob: { type: "image/png", content: "PNGDATA" } },
    ])
    restore = stub.restore

    const view = await renderPanel(runViewFromDetails(runDetails()))
    await click(button(view.container, "Download"))
    await flush(4)

    assert.equal(stub.requests.length, 1)
    assert.equal(stub.requests[0].method, "GET")
    assert.match(stub.requests[0].url, /\/artifacts\/5$/)
    assert.ok(!textOf(view.container).includes("Download failed"))
  })

  await t.test("A pending run is announced while the engine works", async () => {
    const view = await renderPanel(null, true)
    const status = view.container.querySelector('[role="status"]')
    assert.ok(status)
    assert.match(textOf(status), /Waiting for the engine/)
  })

  await t.test("Every run status renders a word, not just a colour", async () => {
    for (const [status, label] of [
      ["PASSED", "Passed"],
      ["FAILED", "Failed"],
      ["ERROR", "Error"],
      ["CANCELLED", "Cancelled"],
    ] as const) {
      const view = await renderPanel(runViewFromDetails(runDetails({ status })))
      const badge = view.container.querySelector(`[data-testid="testdef-run-status-${status}"]`)
      assert.ok(badge, `${status} must render a badge`)
      assert.match(textOf(badge), new RegExp(label))
      view.unmount()
    }
  })

  await t.test("A step message is rendered as text, never as markup", async () => {
    const injected = '<img src=x onerror="alert(1)">'
    const view = await renderPanel(
      runViewFromDetails(
        runDetails({
          status: "FAILED",
          stepResults: [
            {
              id: 1,
              testRunId: RUN_ID,
              stepIndex: 0,
              stepIdentifier: "steps[0]",
              actionType: "UI_CLICK",
              status: "FAILED",
              reasonCode: "LOCATOR_NOT_FOUND",
              message: injected,
              durationMs: 12,
              createdAt: null,
            },
          ],
        }),
      ),
    )

    assert.equal(queryAll(view.container, "img").length, 0, "a message must never become an element")
    assert.match(textOf(view.container), /<img src=x/)
  })
})
