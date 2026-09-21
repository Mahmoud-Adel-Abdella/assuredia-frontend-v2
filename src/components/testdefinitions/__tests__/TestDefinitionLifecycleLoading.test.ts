import test from "node:test"
import assert from "node:assert/strict"
import React from "react"
import {
  cleanup,
  flush,
  mount,
  pressKey,
  queryAll,
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
  VALID_SOURCE,
  details,
  version,
} from "./fixtures"

/**
 * Regression tests for the lifecycle loading race (final review gate).
 *
 * The lifecycle bar describes the ACTIVE version. While that version is still
 * loading the bar used to render with a DRAFT default and briefly enabled
 * buttons whose handlers silently returned. These tests pin the fix: actions
 * stay disabled with a visible reason until the version is on screen, no
 * lifecycle request can fire early, and failures leave the bar disabled.
 */

function lifecycleRoutes(
  status: Parameters<typeof version>[0],
  extra: Partial<Parameters<typeof version>[1]> = {},
): StubRoute[] {
  return [
    { match: PATHS.version, method: "GET", json: version(status, extra) },
    { match: PATHS.definition, method: "GET", json: details(status) },
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

test("lifecycle loading race is closed", async (t) => {
  let restore: (() => void) | null = null
  t.afterEach(() => {
    restore?.()
    restore = null
    cleanup()
  })

  await t.test("1. definition resolves before version: actions stay disabled, no lifecycle request fires", async () => {
    const original = globalThis.fetch
    restore = () => {
      globalThis.fetch = original
    }
    const lifecyclePosts: string[] = []
    globalThis.fetch = (async (input: unknown, init?: RequestInit) => {
      const url = String(input)
      const method = (init?.method ?? "GET").toUpperCase()
      if (url.includes(PATHS.version) && method === "GET") {
        return new Promise<Response>(() => {})
      }
      if (url.includes(PATHS.definition) && method === "GET") {
        return new Response(JSON.stringify(details("DRAFT")), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        })
      }
      if (method === "POST") lifecyclePosts.push(url)
      return new Response(JSON.stringify({}), { status: 200, headers: { "Content-Type": "application/json" } })
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
    await flush(4)

    // The bar is rendered in place (no layout shift) but every action is gated.
    for (const action of ["validate", "trial", "approve", "proving", "archive", "newVersion"]) {
      const button = actionButton(view.container, action)
      if (button) {
        assert.equal(button.disabled, true, `${action} must be disabled while the version loads`)
      }
    }
    const reason = view.container.querySelector("#testdef-reason-validate")
    assert.ok(reason, "the loading reason is rendered")
    assert.match(textOf(reason), /Loading the active version/)

    // A programmatic click on the disabled control dispatches nothing.
    for (const action of ["validate", "trial", "newVersion"]) {
      await view.container.querySelector<HTMLElement>(`button[data-action="${action}"]`)?.click()
    }
    assert.equal(lifecyclePosts.length, 0, "no lifecycle request may fire while the version loads")
  })

  await t.test("2. version finishes loading: correct actions enable from the real status", async () => {
    const view = await renderDetail(lifecycleRoutes("DRAFT"))
    restore = view.stub.restore

    assert.equal(actionButton(view.container, "validate")?.disabled, false)
    assert.equal(actionButton(view.container, "trial")?.disabled, false, "a DRAFT trial is enabled")
    assert.equal(actionButton(view.container, "newVersion")?.disabled, false)
    assert.equal(
      actionButton(view.container, "validate")?.getAttribute("aria-describedby"),
      null,
      "no loading reason remains once the version is on screen",
    )
  })

  await t.test("3. version fetch fails: safe error state and actions stay disabled", async () => {
    const view = await renderDetail([
      { match: PATHS.version, method: "GET", status: 500, json: { error: "boom" } },
      { match: PATHS.definition, method: "GET", json: details("DRAFT") },
    ])
    restore = view.stub.restore

    const body = textOf(view.container)
    assert.match(body, /Could not load this version/)
    for (const action of ["validate", "trial", "approve", "proving", "archive", "newVersion"]) {
      const button = actionButton(view.container, action)
      if (button) assert.equal(button.disabled, true, `${action} must stay disabled after a version failure`)
    }
  })

  await t.test("4. rapid double click during loading fires zero lifecycle requests", async () => {
    const original = globalThis.fetch
    restore = () => {
      globalThis.fetch = original
    }
    const lifecyclePosts: string[] = []
    globalThis.fetch = (async (input: unknown, init?: RequestInit) => {
      const url = String(input)
      const method = (init?.method ?? "GET").toUpperCase()
      if (url.includes(PATHS.version) && method === "GET") {
        return new Promise<Response>(() => {})
      }
      if (url.includes(PATHS.definition) && method === "GET") {
        return new Response(JSON.stringify(details("DRAFT")), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        })
      }
      if (method === "POST") lifecyclePosts.push(url)
      return new Response("{}", { status: 200, headers: { "Content-Type": "application/json" } })
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
    await flush(4)

    const validate = actionButton(view.container, "validate")!
    await validate.click()
    await validate.click()
    await validate.click()
    assert.equal(validate.disabled, true)
    assert.equal(lifecyclePosts.length, 0)
  })

  await t.test("5. status changes after refresh come from the server, not stale state", async () => {
    const view = await renderDetail([
      { match: PATHS.version, method: "GET", json: version("DRAFT"), once: true },
      { match: PATHS.definition, method: "GET", json: details("DRAFT"), once: true },
      {
        match: `${PATHS.version}/validate`,
        method: "POST",
        json: { definitionId: DEFINITION_ID, versionId: 91, versionNumber: 1, status: "VALIDATED", valid: true, validationReport: { valid: true, errors: [], warnings: [], schemaVersion: "1.0", validatorVersion: "1.0.0" } },
      },
      { match: PATHS.version, method: "GET", json: version("VALIDATED", { validationReportJson: JSON.stringify({ valid: true, errors: [], warnings: [], schemaVersion: "1.0", validatorVersion: "1.0.0" }) }) },
      { match: PATHS.definition, method: "GET", json: details("VALIDATED") },
    ])
    restore = view.stub.restore

    assert.equal(actionButton(view.container, "trial")?.disabled, false, "a DRAFT trial is enabled")
    await view.container.querySelector<HTMLElement>('button[data-action="validate"]')?.click()
    await flush(6)

    assert.ok(
      view.container.querySelector('[data-testid="testdef-status-VALIDATED"]'),
      "the UI must show the server's new status",
    )
    assert.equal(actionButton(view.container, "validate")?.disabled, true, "validate is spent once VALIDATED")
    assert.equal(actionButton(view.container, "trial")?.disabled, false, "trial stays enabled from the server status")
  })

  await t.test("6. keyboard activation while loading fires no request", async () => {
    const original = globalThis.fetch
    restore = () => {
      globalThis.fetch = original
    }
    const lifecyclePosts: string[] = []
    globalThis.fetch = (async (input: unknown, init?: RequestInit) => {
      const url = String(input)
      const method = (init?.method ?? "GET").toUpperCase()
      if (url.includes(PATHS.version) && method === "GET") {
        return new Promise<Response>(() => {})
      }
      if (url.includes(PATHS.definition) && method === "GET") {
        return new Response(JSON.stringify(details("DRAFT")), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        })
      }
      if (method === "POST") lifecyclePosts.push(url)
      return new Response("{}", { status: 200, headers: { "Content-Type": "application/json" } })
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
    await flush(4)

    for (const action of ["validate", "trial", "newVersion"]) {
      const button = view.container.querySelector<HTMLElement>(`button[data-action="${action}"]`)
      if (button) {
        button.focus()
        await pressKey("Enter", button)
        await pressKey(" ", button)
      }
    }
    assert.equal(lifecyclePosts.length, 0, "keyboard activation must not fire while disabled")
  })
})
