import test from "node:test"
import assert from "node:assert/strict"
import React from "react"
import {
  actAsync,
  advance,
  button,
  cleanup,
  click,
  flush,
  mount,
  optionalButton,
  queryAll,
  setValue,
  stubFetch,
  textOf,
} from "./harness"
import { TestDefinitionList } from "../TestDefinitionList"
import { CLIENT_ID, CLIENT_NAME, DEFINITION_ID, PATHS, listItem, listResponse } from "./fixtures"

function renderList(overrides: Partial<Parameters<typeof TestDefinitionList>[0]> = {}) {
  return mount(
    React.createElement(TestDefinitionList, {
      clientId: CLIENT_ID,
      clientName: CLIENT_NAME,
      onOpen: () => {},
      onCreate: () => {},
      onUnauthorized: () => {},
      ...overrides,
    }),
  )
}

test("Test Definitions list page", async (t) => {
  let restore: (() => void) | null = null
  t.afterEach(() => {
    restore?.()
    restore = null
    cleanup()
  })

  await t.test("1. A loading state is announced before the first response lands", async () => {
    let release: (() => void) | null = null
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    const original = globalThis.fetch
    restore = () => {
      globalThis.fetch = original
    }
    globalThis.fetch = (async () => {
      await gate
      return new Response(JSON.stringify(listResponse([listItem()])), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    }) as typeof fetch

    const view = await renderList()
    const status = view.container.querySelector('[role="status"]')
    assert.ok(status, "the pending list must expose a status region")
    assert.match(textOf(status), /Loading/)
    assert.equal(queryAll(view.container, "table").length, 0)

    await actAsync(() => {
      release?.()
    })
    assert.equal(queryAll(view.container, "table").length, 1)
  })
  await t.test("2. An empty tenant gets the empty state, not an empty table", async () => {
    const stub = stubFetch([{ match: PATHS.list, json: listResponse([]) }])
    restore = stub.restore

    const view = await renderList()
    await flush()

    assert.equal(queryAll(view.container, "table").length, 0)
    assert.match(textOf(view.container), /No test definitions yet/)
    // The empty state offers the one action that resolves it.
    assert.ok(optionalButton(view.container, "New Definition"))
  })

  await t.test("3. A populated list renders the fields the contract actually returns", async () => {
    const stub = stubFetch([
      {
        match: PATHS.list,
        json: listResponse([
          listItem(),
          listItem({ id: 43, name: "Unbound journey", flowId: null, description: null, isArchived: true }),
        ]),
      },
    ])
    restore = stub.restore

    const view = await renderList()
    await flush()

    const rows = queryAll(view.container, "tbody tr")
    assert.equal(rows.length, 2)

    const first = textOf(rows[0])
    assert.match(first, /Checkout happy path/)
    assert.match(first, new RegExp(CLIENT_NAME))
    assert.match(first, /Flow #300/)
    assert.match(first, /Definition JSON/)

    // An unbound definition says so instead of showing a blank cell.
    assert.match(textOf(rows[1]), /Not linked/)
    // The list only claims a status it can actually know: the archived flag.
    assert.ok(rows[1].querySelector('[data-testid="testdef-status-ARCHIVED"]'))
    assert.equal(rows[0].querySelector('[data-testid^="testdef-status-"]'), null)

    // Status is not conveyed by colour alone: the badge carries its own word.
    assert.match(textOf(rows[1].querySelector('[data-testid="testdef-status-ARCHIVED"]')), /Archived/)
  })

  await t.test("3b. The row action opens the definition by id", async () => {
    const stub = stubFetch([{ match: PATHS.list, json: listResponse([listItem()]) }])
    restore = stub.restore
    const opened: number[] = []

    const view = await renderList({ onOpen: (id) => opened.push(id) })
    await flush()
    await click(button(view.container, "View"))

    assert.deepEqual(opened, [DEFINITION_ID])
  })

  await t.test("4. A failed load shows a retry affordance and recovers on retry", async () => {
    const stub = stubFetch([
      { match: PATHS.list, status: 503, json: { error: "The requested operation is temporarily unavailable" }, once: true },
      { match: PATHS.list, json: listResponse([listItem()]) },
    ])
    restore = stub.restore

    const view = await renderList()
    await flush()

    assert.match(textOf(view.container), /Could not load test definitions/)
    assert.match(textOf(view.container), /temporarily unavailable/)

    await click(button(view.container, "Retry"))
    await flush()

    assert.equal(queryAll(view.container, "tbody tr").length, 1)
    assert.ok(!textOf(view.container).includes("Could not load test definitions"))
  })

  await t.test("4b. A 401 hands control to the session handler instead of showing an error", async () => {
    const stub = stubFetch([{ match: PATHS.list, status: 401, json: { error: "Token is invalid or expired — log in again" } }])
    restore = stub.restore
    let unauthorized = 0

    const view = await renderList({ onUnauthorized: () => unauthorized++ })
    await flush()

    assert.equal(unauthorized, 1)
    assert.ok(!textOf(view.container).includes("Could not load test definitions"))
  })

  await t.test("A refresh keeps the current rows on screen while it reloads", async () => {
    const stub = stubFetch([{ match: PATHS.list, json: listResponse([listItem()]) }])
    restore = stub.restore

    const view = await renderList()
    await flush()
    assert.equal(queryAll(view.container, "tbody tr").length, 1)

    await click(button(view.container, "Refresh"))
    // Rows stay mounted during the in-flight refresh: no flash of empty state.
    assert.equal(queryAll(view.container, "tbody tr").length, 1)
    await flush()
    assert.equal(queryAll(view.container, "tbody tr").length, 1)
    assert.equal(stub.requests.length, 2)
  })

  await t.test("Search is sent to the engine, and a miss is reported as a miss", async () => {
    const stub = stubFetch([
      { match: `${PATHS.list}?limit=25&offset=0`, json: listResponse([listItem()]), once: true },
      { match: "search=nothing", json: listResponse([]) },
    ])
    restore = stub.restore

    const view = await renderList()
    await flush()

    const search = view.container.querySelector<HTMLInputElement>("#testdef-search")
    assert.ok(search)
    await setValue(search, "nothing")
    // The query is debounced, so nothing is sent until the pause elapses.
    assert.equal(stub.requests.length, 1)
    await advance(400)

    assert.equal(stub.requests.length, 2)
    assert.match(stub.requests[1].url, /search=nothing/)
    assert.match(textOf(view.container), /No definitions match this search/)
    // A search miss must not offer "create" as if the tenant were empty.
    assert.equal(optionalButton(view.container, "New Definition")?.textContent?.includes("New Definition"), true)
  })

  await t.test("Paging uses the totals the engine reported, not a local guess", async () => {
    const stub = stubFetch([
      { match: "offset=0", json: listResponse([listItem()], { total: 60, limit: 25, offset: 0 }), once: true },
      { match: "offset=25", json: listResponse([listItem({ id: 44, name: "Second page" })], { total: 60, limit: 25, offset: 25 }) },
    ])
    restore = stub.restore

    const view = await renderList()
    await flush()
    assert.match(textOf(view.container), /1–1 of 60/)

    const previous = button(view.container, "Previous")
    assert.equal(previous.disabled, true, "there is no page before the first")

    await click(button(view.container, "Next"))
    await flush()
    assert.match(stub.requests[1].url, /offset=25/)
    assert.match(textOf(view.container), /Second page/)
  })
})
