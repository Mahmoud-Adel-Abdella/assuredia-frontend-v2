import "./domEnvironment"

import React, { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { LanguageProvider } from "../../../lib/i18n"
import { ToastProvider } from "../../primitives"

/** A mounted component plus the queries and interactions the tests need. */
export type Mounted = {
  container: HTMLElement
  unmount: () => void
  /** Re-renders with a new element inside the same root. */
  rerender: (element: React.ReactElement) => Promise<void>
}

let activeRoots: { root: Root; container: HTMLElement }[] = []

/**
 * Mounts one component inside the providers the dashboard always supplies
 * (language and toasts) and flushes effects, so the returned DOM is settled.
 */
export async function mount(element: React.ReactElement): Promise<Mounted> {
  const container = document.createElement("div")
  document.body.appendChild(container)
  const root = createRoot(container)
  activeRoots.push({ root, container })

  const wrap = (child: React.ReactElement) =>
    React.createElement(LanguageProvider, null, React.createElement(ToastProvider, null, child))

  await act(async () => {
    root.render(wrap(element))
  })

  return {
    container,
    unmount: () => {
      act(() => root.unmount())
      container.remove()
      activeRoots = activeRoots.filter((entry) => entry.container !== container)
    },
    rerender: async (next: React.ReactElement) => {
      await act(async () => {
        root.render(wrap(next))
      })
    },
  }
}

/** Unmounts anything a test left behind. Call from `afterEach`. */
export function cleanup() {
  for (const { root, container } of activeRoots) {
    act(() => root.unmount())
    container.remove()
  }
  activeRoots = []
  document.body.innerHTML = ""
}

/** Lets queued microtasks and effects settle (a resolved fetch, for instance). */
export async function flush(times = 3) {
  for (let i = 0; i < times; i++) {
    await act(async () => {
      await Promise.resolve()
    })
  }
}

/** Waits real time inside act(), for the debounced search and other timers. */
export async function advance(ms: number) {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, ms))
  })
  await flush()
}

/** Runs work that resolves a pending promise, keeping the re-render inside act(). */
export async function actAsync(work: () => void | Promise<void>) {
  await act(async () => {
    await work()
  })
  await flush()
}

/* ------------------------------------------------------------------ */
/* Queries                                                             */
/* ------------------------------------------------------------------ */

/** All rendered text, whitespace-collapsed, for coarse content assertions. */
export function textOf(node: ParentNode | null): string {
  return (node?.textContent ?? "").replace(/\s+/g, " ").trim()
}

export function queryAll<E extends Element = HTMLElement>(root: ParentNode, selector: string): E[] {
  return Array.from(root.querySelectorAll<E>(selector))
}

/** The first element whose visible text contains `text`. */
export function findByText<E extends HTMLElement = HTMLElement>(
  root: ParentNode,
  selector: string,
  text: string,
): E | null {
  return (
    queryAll<E>(root, selector).find((el) => (el.textContent ?? "").includes(text)) ?? null
  )
}

/** The button whose label contains `text`. Throws when absent, so tests fail loudly. */
export function button(root: ParentNode, text: string): HTMLButtonElement {
  const found = findByText<HTMLButtonElement>(root, "button", text)
  if (!found) {
    throw new Error(`No button labelled "${text}". Buttons present: ${
      queryAll(root, "button").map((b) => `"${textOf(b)}"`).join(", ") || "(none)"
    }`)
  }
  return found
}

/** The button whose label contains `text`, or null when it is not rendered. */
export function optionalButton(root: ParentNode, text: string): HTMLButtonElement | null {
  return findByText<HTMLButtonElement>(root, "button", text)
}

/* ------------------------------------------------------------------ */
/* Interactions                                                        */
/* ------------------------------------------------------------------ */

export async function click(element: Element) {
  await act(async () => {
    element.dispatchEvent(new window.MouseEvent("click", { bubbles: true, cancelable: true }))
  })
}

/** Two clicks dispatched back to back, with no await between them. */
export async function doubleClick(element: Element) {
  await act(async () => {
    element.dispatchEvent(new window.MouseEvent("click", { bubbles: true, cancelable: true }))
    element.dispatchEvent(new window.MouseEvent("click", { bubbles: true, cancelable: true }))
  })
}

/** Replaces a control's value the way React's synthetic change expects. */
export async function setValue(
  element: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement,
  value: string,
) {
  await act(async () => {
    const prototype = Object.getPrototypeOf(element)
    const descriptor = Object.getOwnPropertyDescriptor(prototype, "value")
    descriptor?.set?.call(element, value)
    element.dispatchEvent(new window.Event("input", { bubbles: true }))
    element.dispatchEvent(new window.Event("change", { bubbles: true }))
  })
}

export async function pressKey(key: string, target: EventTarget = document) {
  await act(async () => {
    target.dispatchEvent(new window.KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }))
  })
}

/* ------------------------------------------------------------------ */
/* fetch stubbing                                                      */
/* ------------------------------------------------------------------ */

export type RecordedRequest = {
  url: string
  method: string
  headers: Record<string, string>
  body: unknown
}

export type StubRoute = {
  /** Matched against the request URL with `includes`. */
  match: string
  method?: string
  status?: number
  /** JSON body, or a Blob for the artifact route. */
  json?: unknown
  blob?: { type: string; content: string }
  /** Throw instead of answering, to simulate an unreachable network. */
  networkError?: boolean
  /** Consume this route only once; later matching requests fall through. */
  once?: boolean
}

/** A recording fetch stub driven by ordered routes. */
export function stubFetch(routes: StubRoute[]) {
  const remaining = routes.map((route) => ({ ...route, used: false }))
  const requests: RecordedRequest[] = []

  const impl = async (input: unknown, init?: RequestInit) => {
    const url = String(input)
    const method = (init?.method ?? "GET").toUpperCase()
    const headers: Record<string, string> = {}
    for (const [name, value] of Object.entries((init?.headers as Record<string, string>) ?? {})) {
      headers[name] = value
    }
    let body: unknown = undefined
    if (typeof init?.body === "string") {
      try {
        body = JSON.parse(init.body)
      } catch {
        body = init.body
      }
    }
    requests.push({ url, method, headers, body })

    const route = remaining.find(
      (candidate) =>
        !candidate.used
        && url.includes(candidate.match)
        && (candidate.method === undefined || candidate.method.toUpperCase() === method),
    ) ?? remaining.find(
      (candidate) =>
        !candidate.once
        && url.includes(candidate.match)
        && (candidate.method === undefined || candidate.method.toUpperCase() === method),
    )

    if (!route) throw new TypeError(`No stub route matches ${method} ${url}`)
    if (route.once) route.used = true
    if (route.networkError) throw new TypeError("Failed to fetch")

    if (route.blob) {
      return new Response(route.blob.content, {
        status: route.status ?? 200,
        headers: { "Content-Type": route.blob.type },
      })
    }
    return new Response(route.json === undefined ? "" : JSON.stringify(route.json), {
      status: route.status ?? 200,
      headers: { "Content-Type": "application/json" },
    })
  }

  const original = globalThis.fetch
  globalThis.fetch = impl as unknown as typeof fetch
  return {
    requests,
    restore: () => {
      globalThis.fetch = original
    },
  }
}
