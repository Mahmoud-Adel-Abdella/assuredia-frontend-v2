/**
 * jsdom + React 19 harness for the Test Definition component tests.
 *
 * The repository's suites run on `node:test` through `tsx` and have so far only
 * covered the data layer. These components carry behaviour that only exists once
 * they are mounted — disabled states, focus management, double-click refusal — so
 * they are rendered into a real DOM here rather than asserted indirectly.
 *
 * Importing this module installs the DOM globals. Import it *before* the
 * components under test so React sees a document when it initialises.
 */

import { JSDOM } from "jsdom"

const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  url: "http://localhost/",
  pretendToBeVisual: true,
})

const globals = globalThis as unknown as Record<string, unknown>

/** Node 24 defines some of these as getter-only, so each is redefined. */
function define(name: string, value: unknown) {
  Object.defineProperty(globals, name, { value, writable: true, configurable: true })
}

define("window", dom.window)
define("document", dom.window.document)
define("navigator", dom.window.navigator)
define("HTMLElement", dom.window.HTMLElement)
define("HTMLInputElement", dom.window.HTMLInputElement)
define("HTMLTextAreaElement", dom.window.HTMLTextAreaElement)
define("HTMLSelectElement", dom.window.HTMLSelectElement)
define("HTMLButtonElement", dom.window.HTMLButtonElement)
define("Node", dom.window.Node)
define("Event", dom.window.Event)
define("MouseEvent", dom.window.MouseEvent)
define("KeyboardEvent", dom.window.KeyboardEvent)
define("MutationObserver", dom.window.MutationObserver)
define("getComputedStyle", dom.window.getComputedStyle)
define("localStorage", dom.window.localStorage)
define("requestAnimationFrame", (cb: FrameRequestCallback) =>
  dom.window.setTimeout(() => cb(Date.now()), 0))
define("cancelAnimationFrame", (handle: number) => dom.window.clearTimeout(handle))
// React's act() requires this opt-in so updates are flushed synchronously.
define("IS_REACT_ACT_ENVIRONMENT", true)

// jsdom has no object-URL implementation; the artifact download path needs one.
if (typeof dom.window.URL.createObjectURL !== "function") {
  dom.window.URL.createObjectURL = () => "blob:mock"
  dom.window.URL.revokeObjectURL = () => {}
}

export { dom }
