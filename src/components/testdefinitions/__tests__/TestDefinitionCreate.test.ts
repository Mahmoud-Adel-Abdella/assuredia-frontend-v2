import test from "node:test"
import assert from "node:assert/strict"
import React from "react"
import { button, cleanup, click, flush, mount, setValue, stubFetch, textOf } from "./harness"
import { TestDefinitionCreate } from "../TestDefinitionCreate"
import {
  CLIENT_ID,
  CLIENT_NAME,
  DEFINITION_ID,
  FLOW_ID,
  PATHS,
  VALID_SOURCE,
  VERSION_ID,
  clientDetailsResponse,
} from "./fixtures"

const CLIENT_PATH = `/dashboard-api/clients/${CLIENT_ID}`

function created(overrides: Record<string, unknown> = {}) {
  return {
    definitionId: DEFINITION_ID,
    clientId: CLIENT_ID,
    name: "Checkout happy path",
    description: null,
    flowId: FLOW_ID,
    initialVersionId: VERSION_ID,
    versionNumber: 1,
    status: "DRAFT",
    ...overrides,
  }
}

async function renderCreate(overrides: Partial<Parameters<typeof TestDefinitionCreate>[0]> = {}) {
  const view = await mount(
    React.createElement(TestDefinitionCreate, {
      clientId: CLIENT_ID,
      clientName: CLIENT_NAME,
      onCancel: () => {},
      onCreated: () => {},
      onUnauthorized: () => {},
      ...overrides,
    }),
  )
  await flush()
  return view
}

function field<E extends HTMLElement>(root: ParentNode, id: string): E {
  const found = root.querySelector<E>(`#${id}`)
  if (!found) throw new Error(`No field #${id}`)
  return found
}

test("Create Test Definition form", async (t) => {
  let restore: (() => void) | null = null
  t.afterEach(() => {
    restore?.()
    restore = null
    cleanup()
  })

  await t.test("5. A valid submission creates the definition and opens it", async () => {
    const stub = stubFetch([
      { match: CLIENT_PATH, method: "GET", json: clientDetailsResponse() },
      { match: PATHS.list, method: "POST", json: created() },
    ])
    restore = stub.restore
    const opened: number[] = []

    const view = await renderCreate({ onCreated: (id) => opened.push(id) })

    await setValue(field<HTMLInputElement>(view.container, "testdef-name"), "Checkout happy path")
    await setValue(field<HTMLSelectElement>(view.container, "testdef-flow"), String(FLOW_ID))
    await setValue(field<HTMLTextAreaElement>(view.container, "testdef-source"), VALID_SOURCE)
    await click(button(view.container, "Create definition"))
    await flush()

    const post = stub.requests.find((r) => r.method === "POST")
    assert.ok(post, "the form must POST to the tenant's test-definitions route")
    assert.deepEqual(post.body, {
      name: "Checkout happy path",
      description: null,
      flowId: FLOW_ID,
      assetRequestId: null,
      initialSourceJson: VALID_SOURCE,
    })
    assert.deepEqual(opened, [DEFINITION_ID], "a successful create navigates to the new definition")
  })

  await t.test("5b. An empty editor lets the engine seed its own starter document", async () => {
    const stub = stubFetch([
      { match: CLIENT_PATH, method: "GET", json: clientDetailsResponse() },
      { match: PATHS.list, method: "POST", json: created({ flowId: null }) },
    ])
    restore = stub.restore

    const view = await renderCreate()
    await setValue(field<HTMLInputElement>(view.container, "testdef-name"), "Bare definition")
    await click(button(view.container, "Create definition"))
    await flush()

    const post = stub.requests.find((r) => r.method === "POST")
    assert.equal((post?.body as { initialSourceJson: unknown }).initialSourceJson, null)
  })

  await t.test("A missing name is refused locally, before any request", async () => {
    const stub = stubFetch([{ match: CLIENT_PATH, method: "GET", json: clientDetailsResponse() }])
    restore = stub.restore

    const view = await renderCreate()
    await click(button(view.container, "Create definition"))
    await flush()

    assert.equal(stub.requests.filter((r) => r.method === "POST").length, 0)
    const error = view.container.querySelector("#testdef-name-error")
    assert.ok(error, "the name field must carry its own error")
    assert.match(textOf(error), /name is required/i)
    assert.equal(field<HTMLInputElement>(view.container, "testdef-name").getAttribute("aria-invalid"), "true")
    assert.equal(
      field<HTMLInputElement>(view.container, "testdef-name").getAttribute("aria-describedby"),
      "testdef-name-error",
    )
  })

  await t.test("6. Invalid JSON blocks submission and is reported against the source", async () => {
    const stub = stubFetch([{ match: CLIENT_PATH, method: "GET", json: clientDetailsResponse() }])
    restore = stub.restore

    const view = await renderCreate()
    await setValue(field<HTMLInputElement>(view.container, "testdef-name"), "Broken JSON")
    await setValue(field<HTMLTextAreaElement>(view.container, "testdef-source"), '{ "schemaVersion": "1.0", ')
    await click(button(view.container, "Create definition"))
    await flush()

    assert.equal(stub.requests.filter((r) => r.method === "POST").length, 0)
    assert.ok(view.container.querySelector("#testdef-source-error"))
    // The local pre-check names itself, so its findings are never mistaken for the engine's.
    assert.match(textOf(view.container), /Checked in your browser/)
  })

  await t.test("7. Schema violations are listed against their JSON pointers", async () => {
    const stub = stubFetch([{ match: CLIENT_PATH, method: "GET", json: clientDetailsResponse() }])
    restore = stub.restore

    const view = await renderCreate()
    await setValue(field<HTMLInputElement>(view.container, "testdef-name"), "Schema problems")
    await setValue(
      field<HTMLTextAreaElement>(view.container, "testdef-source"),
      JSON.stringify({ schemaVersion: "1.0", metadata: { name: "x" }, steps: [{ action: "ui.navigate" }] }),
    )
    await flush()

    const findings = textOf(view.container)
    assert.match(findings, /Checked in your browser/)
    assert.match(findings, /expectedOutcomes is required/)
    assert.ok(
      view.container.querySelector("code")?.textContent?.length,
      "each finding shows the pointer of the offending node",
    )

    await click(button(view.container, "Create definition"))
    await flush()
    assert.equal(stub.requests.filter((r) => r.method === "POST").length, 0)
  })

  await t.test("8. A duplicate name 409 is shown on the name field, not as a raw error", async () => {
    const stub = stubFetch([
      { match: CLIENT_PATH, method: "GET", json: clientDetailsResponse() },
      {
        match: PATHS.list,
        method: "POST",
        status: 409,
        json: { error: "A Test Definition with this name already exists for this client" },
      },
    ])
    restore = stub.restore
    let opened = 0

    const view = await renderCreate({ onCreated: () => opened++ })
    await setValue(field<HTMLInputElement>(view.container, "testdef-name"), "Checkout happy path")
    await click(button(view.container, "Create definition"))
    await flush()

    assert.equal(opened, 0, "a rejected create must not navigate")
    const error = view.container.querySelector("#testdef-name-error")
    assert.ok(error)
    assert.match(textOf(error), /already exists/)
  })

  await t.test("A 404 on the flow binding is reported on the flow field", async () => {
    const stub = stubFetch([
      { match: CLIENT_PATH, method: "GET", json: clientDetailsResponse() },
      {
        match: PATHS.list,
        method: "POST",
        status: 404,
        json: { error: "Specified flow does not belong to this client" },
      },
    ])
    restore = stub.restore

    const view = await renderCreate()
    await setValue(field<HTMLInputElement>(view.container, "testdef-name"), "Wrong flow")
    await setValue(field<HTMLSelectElement>(view.container, "testdef-flow"), String(FLOW_ID))
    await click(button(view.container, "Create definition"))
    await flush()

    const error = view.container.querySelector("#testdef-flow-error")
    assert.ok(error)
    assert.match(textOf(error), /does not belong to this client/)
  })

  await t.test("Submission is single-shot: a double click dispatches one request", async () => {
    const pending: { resolve: ((value: Response) => void) | null } = { resolve: null }
    const original = globalThis.fetch
    restore = () => {
      globalThis.fetch = original
    }
    const posts: string[] = []
    globalThis.fetch = (async (input: unknown, init?: RequestInit) => {
      const url = String(input)
      const method = (init?.method ?? "GET").toUpperCase()
      if (method === "GET") {
        return new Response(JSON.stringify(clientDetailsResponse()), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        })
      }
      posts.push(url)
      return new Promise<Response>((resolve) => {
        pending.resolve = resolve
      })
    }) as typeof fetch

    const view = await renderCreate()
    await setValue(field<HTMLInputElement>(view.container, "testdef-name"), "Only once")

    await click(button(view.container, "Create definition"))
    // While the request is on the wire the control is disabled, so a second
    // click cannot produce a second definition.
    assert.equal(button(view.container, "Creating").disabled, true)
    await click(button(view.container, "Creating"))
    assert.equal(posts.length, 1)

    pending.resolve?.(
      new Response(JSON.stringify(created()), { status: 200, headers: { "Content-Type": "application/json" } }),
    )
    await flush(5)
  })

  await t.test("Cancelling leaves without sending anything", async () => {
    const stub = stubFetch([{ match: CLIENT_PATH, method: "GET", json: clientDetailsResponse() }])
    restore = stub.restore
    let cancelled = 0

    const view = await renderCreate({ onCancel: () => cancelled++ })
    await setValue(field<HTMLInputElement>(view.container, "testdef-name"), "Abandoned")
    await click(button(view.container, "Cancel"))

    assert.equal(cancelled, 1)
    assert.equal(stub.requests.filter((r) => r.method === "POST").length, 0)
  })

  await t.test("The tenant is context, not an input the form can change", async () => {
    const stub = stubFetch([{ match: CLIENT_PATH, method: "GET", json: clientDetailsResponse() }])
    restore = stub.restore

    const view = await renderCreate()
    const client = field<HTMLInputElement>(view.container, "testdef-client")
    assert.equal(client.disabled, true)
    assert.equal(client.readOnly, true)
    assert.equal(client.value, CLIENT_NAME)
  })
})
