import test from "node:test"
import assert from "node:assert/strict"

import {
  NEEDS_BINDING_PREFIX,
  PENDING_PLACEHOLDER,
  bindingStatusFor,
  isFullyBound,
  planBinding,
} from "./planBinding"

/**
 * Phase 3 Option A binds each planned intent to an element found during exploration and leaves the
 * honest `PENDING` placeholder behind when nothing matched. The review screen reads that document
 * and must never claim an action is runnable when it is not, so these tests pin both directions:
 * a bound document reads bound, and an unbound one is visible rather than silent.
 */

/** A definition node as the engine writes it. */
function node(name: string, locator: unknown): Record<string, unknown> {
  return { action: "ui.click", name, locator }
}

/** A locator bound to a real discovered element. */
function boundLocator(role: string, accessibleName: string): Record<string, unknown> {
  return { strategy: "role", role, name: accessibleName }
}

/** The placeholder an unmatched step keeps. */
function pendingLocator(): Record<string, unknown> {
  return { strategy: "css", value: PENDING_PLACEHOLDER }
}

function doc(steps: unknown[], expectedOutcomes: unknown[] = []): string {
  return JSON.stringify({ version: "1", steps, expectedOutcomes })
}

test("a fully bound document reports every action as bound", () => {
  const binding = planBinding(
    doc([
      { action: "ui.navigate", name: "Open the shop", url: "https://shop.test/products" },
      node("Click the Sign in link", boundLocator("link", "Sign in")),
      node("Fill the Email field", boundLocator("textbox", "Email")),
    ]),
  )

  assert.equal(binding.total, 3)
  assert.equal(binding.bound, 3)
  assert.equal(binding.unbound, 0)
  assert.deepEqual(binding.unboundIntents, [])
  assert.equal(isFullyBound(binding), true)
  assert.equal(bindingStatusFor(binding, "Click the Sign in link"), "BOUND")
  assert.equal(bindingStatusFor(binding, "Open the shop"), "BOUND")
})

test("an unmatched action keeps its PENDING target and is named in the unbound list", () => {
  const binding = planBinding(
    doc([
      node("Click the Sign in link", boundLocator("link", "Sign in")),
      node(`${NEEDS_BINDING_PREFIX}Click the Checkout button`, pendingLocator()),
    ]),
  )

  assert.equal(binding.total, 2)
  assert.equal(binding.bound, 1)
  assert.equal(binding.unbound, 1)
  assert.equal(isFullyBound(binding), false)
  // The marker is presentation, not part of the business intent the review screen renders.
  assert.deepEqual(binding.unboundIntents, ["Click the Checkout button"])
  assert.equal(bindingStatusFor(binding, "Click the Checkout button"), "NEEDS_BINDING")
  assert.equal(bindingStatusFor(binding, "Click the Sign in link"), "BOUND")
})

test("an unmatched action is unbound by its placeholder even without the name marker", () => {
  // The marker is written by the engine, but the placeholder alone must be enough: a target that
  // still reads PENDING cannot run, whatever the name says.
  const binding = planBinding(doc([node("Click the Checkout button", pendingLocator())]))

  assert.equal(binding.unbound, 1)
  assert.equal(bindingStatusFor(binding, "Click the Checkout button"), "NEEDS_BINDING")
})

test("a navigate action resolves through its discovered URL", () => {
  const binding = planBinding(
    doc([{ action: "ui.navigate", name: "Open the shop", url: "https://shop.test/products" }]),
  )

  assert.equal(binding.total, 1)
  assert.equal(binding.bound, 1)
  assert.equal(isFullyBound(binding), true)
})

test("a navigate action with no discovered page stays PENDING and unbound", () => {
  const binding = planBinding(
    doc([{ action: "ui.navigate", name: "Open the shop", url: PENDING_PLACEHOLDER }]),
  )

  assert.equal(binding.total, 1)
  assert.equal(binding.unbound, 1)
  assert.equal(bindingStatusFor(binding, "Open the shop"), "NEEDS_BINDING")
})

test("expected outcomes are counted alongside steps", () => {
  const binding = planBinding(
    doc(
      [node("Click the Sign in link", boundLocator("link", "Sign in"))],
      [
        node("Confirm the account menu is visible", boundLocator("button", "Jane Doe")),
        node(`${NEEDS_BINDING_PREFIX}Confirm the cart badge`, pendingLocator()),
      ],
    ),
  )

  assert.equal(binding.total, 3)
  assert.equal(binding.bound, 2)
  assert.equal(binding.unbound, 1)
  assert.deepEqual(binding.unboundIntents, ["Confirm the cart badge"])
})

test("an API request with a resolved path is bound, and a PENDING one is not", () => {
  // The backend catalog is a second source of targets. A request the catalog confirmed can run;
  // one that fell back to the placeholder cannot, and must not be reported as ready.
  const binding = planBinding(
    doc([
      { action: "api.request", method: "GET", url: "/products", name: "Fetch the product list" },
      { action: "api.request", method: "POST", url: "/PENDING", name: "Create an order" },
    ]),
  )

  assert.equal(binding.total, 2)
  assert.equal(binding.bound, 1)
  assert.equal(binding.unbound, 1)
  assert.deepEqual(binding.unboundIntents, ["Create an order"])
  assert.equal(bindingStatusFor(binding, "Fetch the product list"), "BOUND")
  assert.equal(bindingStatusFor(binding, "Create an order"), "NEEDS_BINDING")
})

test("an unbound API extraction is visible even though its name carries no marker", () => {
  const binding = planBinding(
    doc([
      { action: "api.extract", jsonPath: "$.PENDING", variable: "orderId", name: "Extract the order id" },
    ]),
  )

  assert.equal(binding.total, 1)
  assert.equal(binding.unbound, 1)
  assert.equal(bindingStatusFor(binding, "Extract the order id"), "NEEDS_BINDING")
})

test("a bound API extraction is not mistaken for an unbound one", () => {
  // `$.pendingOrders` shares a prefix with the placeholder but is a real, resolved field path.
  const binding = planBinding(
    doc([{ action: "api.extract", jsonPath: "$.pendingOrders", name: "Extract the pending orders" }]),
  )

  assert.equal(binding.bound, 1)
  assert.equal(binding.unbound, 0)
})

test("nodes without a target are not counted as actions needing binding", () => {
  // An assertion on a literal is not something a human can bind, so including it would overstate
  // the work and dilute the summary.
  const binding = planBinding(
    doc([
      { action: "api.assertStatus", expected: 200, name: "Verify API returns success status" },
      node("Click the Sign in link", boundLocator("link", "Sign in")),
    ]),
  )

  assert.equal(binding.total, 1)
  assert.equal(bindingStatusFor(binding, "Verify API returns success status"), "UNKNOWN")
})

test("a shared intent reports unbound when any of its nodes is unbound", () => {
  // A step and an outcome can carry the same intent. Reporting BOUND because one node resolved
  // would hide the other, so the unbound node wins.
  const binding = planBinding(
    doc(
      [node("Click the Sign in link", boundLocator("link", "Sign in"))],
      [node(`${NEEDS_BINDING_PREFIX}Click the Sign in link`, pendingLocator())],
    ),
  )

  assert.equal(binding.bound, 1)
  assert.equal(binding.unbound, 1)
  assert.equal(bindingStatusFor(binding, "Click the Sign in link"), "NEEDS_BINDING")
})

test("an intent the user has since edited reports UNKNOWN rather than guessing", () => {
  const binding = planBinding(doc([node("Click the Sign in link", boundLocator("link", "Sign in"))]))

  assert.equal(bindingStatusFor(binding, "Click the Login link"), "UNKNOWN")
  assert.equal(bindingStatusFor(binding, ""), "UNKNOWN")
})

test("a malformed document yields an empty result instead of throwing", () => {
  // The review screen must still render when the document cannot be read; "no binding information"
  // is a truthful answer and must not become a blank page.
  for (const input of ["", "   ", "not json", "[]", "null", '{"steps": "nope"}']) {
    const binding = planBinding(input)
    assert.equal(binding.total, 0, `input: ${input}`)
    assert.equal(binding.unbound, 0, `input: ${input}`)
    assert.equal(isFullyBound(binding), false, `input: ${input}`)
  }
})

test("a missing document yields an empty result", () => {
  for (const input of [null, undefined]) {
    const binding = planBinding(input)
    assert.equal(binding.total, 0)
    assert.equal(isFullyBound(binding), false)
  }
})

test("an empty discovery leaves every planned action unbound", () => {
  // The Phase 3 empty-discovery path: nothing was discovered, so nothing is bound and nothing is
  // hidden. The review screen must show the full count as still needing a target.
  const binding = planBinding(
    doc([
      { action: "ui.navigate", name: "Open the shop", url: PENDING_PLACEHOLDER },
      node(`${NEEDS_BINDING_PREFIX}Click the Sign in link`, pendingLocator()),
      node(`${NEEDS_BINDING_PREFIX}Fill the Email field`, pendingLocator()),
    ]),
  )

  assert.equal(binding.total, 3)
  assert.equal(binding.bound, 0)
  assert.equal(binding.unbound, 3)
  assert.equal(isFullyBound(binding), false)
  assert.deepEqual(binding.unboundIntents, [
    "Open the shop",
    "Click the Sign in link",
    "Fill the Email field",
  ])
})

test("a document with no bindable actions is not reported as fully bound", () => {
  // Nothing to bind is not the same as everything bound: the summary banner keys off this.
  const binding = planBinding(doc([{ action: "api.call", name: "Fetch the product list" }]))

  assert.equal(binding.total, 0)
  assert.equal(isFullyBound(binding), false)
})
