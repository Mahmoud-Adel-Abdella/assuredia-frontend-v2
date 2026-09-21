import test from "node:test"
import assert from "node:assert/strict"
import React from "react"
import { cleanup, flush, mount, stubFetch, textOf, type StubRoute } from "./harness"
import { TestDefinitionDetail } from "../TestDefinitionDetail"
import {
  CLIENT_ID,
  CLIENT_NAME,
  DEFINITION_ID,
  PATHS,
  details,
  executionResult,
  version,
} from "./fixtures"

/**
 * Phase-2 usability contract: an AI-created Test Definition is usable straight
 * after human review.
 *
 * The AI Test Builder produces a DRAFT that is deliberately NOT linked to a
 * production Flow. TRIAL is a non-gating manual execution (spec
 * test-definition-spec-v1.md §2003-2008), so:
 *
 *   - the UI offers "Run trial" on any non-archived status with no Flow;
 *   - no reason text is rendered for the trial action;
 *   - clicking it dispatches the trial request and renders the run result;
 *   - ARCHIVED is still excluded, and PROVING keeps its Flow requirement.
 */

/** A DRAFT definition exactly as the AI Test Builder leaves it: no Flow. */
function aiDraftRoutes(extra: StubRoute[] = []): StubRoute[] {
  return [
    { match: PATHS.version, method: "GET", json: version("DRAFT") },
    { match: PATHS.definition, method: "GET", json: details("DRAFT", { flowId: null }) },
    ...extra,
  ]
}

async function renderDetail(routes: StubRoute[]) {
  const stub = stubFetch(routes)
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
  await flush(4)
  return { ...view, stub }
}

function actionButton(root: ParentNode, action: string): HTMLButtonElement | null {
  return root.querySelector<HTMLButtonElement>(`button[data-action="${action}"]`)
}

/* Imported after the helper so the stub is installed by `stubFetch`. */

test("an AI-created unbound DRAFT is trialled without a Flow and without admin approval", async (t) => {
  let restore: (() => void) | null = null
  t.afterEach(() => {
    restore?.()
    restore = null
    cleanup()
  })

  await t.test("Run trial is enabled on the unbound DRAFT and shows no reason", async () => {
    const view = await renderDetail(aiDraftRoutes())
    restore = view.stub.restore

    const trial = actionButton(view.container, "trial")
    assert.ok(trial, "the trial action is rendered")
    assert.equal(trial.disabled, false, "trial must be enabled on a DRAFT with no Flow")

    assert.equal(
      view.container.querySelector("#testdef-reason-trial"),
      null,
      "no reason is shown: the trial is not blocked by status or a missing Flow",
    )
    // The definition genuinely has no Flow; the enablement is not an accident.
    assert.match(textOf(view.container), /Not linked/)
  })

  await t.test("clicking Run trial dispatches the trial and renders the run result", async () => {
    const view = await renderDetail(
      aiDraftRoutes([{ match: `${PATHS.version}/trial`, method: "POST", json: executionResult("TRIAL") }]),
    )
    restore = view.stub.restore

    await actionButton(view.container, "trial")!.click()
    await flush(6)

    const trialPosts = view.stub.requests.filter(
      (r) => r.url.includes(`${PATHS.version}/trial`) && r.method === "POST",
    )
    assert.equal(trialPosts.length, 1, "exactly one trial request is dispatched")

    // The run panel renders from the execution response: a terminal status, not a
    // conflict. A 409 would have produced an error banner instead of this badge.
    assert.ok(
      view.container.querySelector('[data-testid="testdef-run-status-PASSED"]'),
      "the run result panel shows the terminal status",
    )
    assert.doesNotMatch(textOf(view.container), /Flow before/i, "no Flow prerequisite error is surfaced")
  })

  await t.test("the trial stays enabled whatever the Flow binding is", async () => {
    const unbound = await renderDetail(aiDraftRoutes())
    const bound = await renderDetail([
      { match: PATHS.version, method: "GET", json: version("DRAFT") },
      { match: PATHS.definition, method: "GET", json: details("DRAFT") },
    ])
    restore = unbound.stub.restore

    assert.equal(actionButton(unbound.container, "trial")?.disabled, false, "unbound DRAFT trial enabled")
    assert.equal(actionButton(bound.container, "trial")?.disabled, false, "bound DRAFT trial enabled")
    bound.stub.restore()
  })

  await t.test("every non-archived status is triallable", async () => {
    for (const status of ["DRAFT", "VALIDATED", "APPROVED", "READY"] as const) {
      const view = await renderDetail([
        { match: PATHS.version, method: "GET", json: version(status) },
        { match: PATHS.definition, method: "GET", json: details(status, { flowId: null }) },
      ])
      assert.equal(
        actionButton(view.container, "trial")?.disabled,
        false,
        `trial must be enabled for ${status}`,
      )
      view.stub.restore()
      cleanup()
    }
  })

  await t.test("an ARCHIVED definition still refuses the trial, with a reason", async () => {
    const view = await renderDetail([
      { match: PATHS.version, method: "GET", json: version("ARCHIVED") },
      { match: PATHS.definition, method: "GET", json: details("ARCHIVED", { flowId: null, isArchived: true }) },
    ])
    restore = view.stub.restore

    const trial = actionButton(view.container, "trial")
    assert.ok(trial, "the trial action is still rendered for an archived definition")
    assert.equal(trial.disabled, true, "ARCHIVED must never be trialled")
    const reason = view.container.querySelector("#testdef-reason-trial")
    assert.ok(reason, "the archived reason is rendered")
    assert.match(textOf(reason), /ARCHIVED/i)
  })

  await t.test("PROVING keeps its Flow requirement and is not offered on a DRAFT", async () => {
    const view = await renderDetail(aiDraftRoutes())
    restore = view.stub.restore

    const proving = actionButton(view.container, "proving")
    if (proving) {
      assert.equal(proving.disabled, true, "proving stays gated on a DRAFT")
      const reason = view.container.querySelector("#testdef-reason-proving")
      assert.ok(reason, "the proving reason is rendered")
    }
    // A DRAFT has no passing proving run, so it is never READY by hand.
    assert.equal(view.container.querySelector('[data-testid="testdef-status-READY"]'), null)
  })
})
