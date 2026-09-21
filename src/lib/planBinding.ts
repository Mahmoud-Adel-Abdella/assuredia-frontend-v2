/**
 * Binding status of a generated Test Definition.
 *
 * An AI plan is business-level: the model emits an `intent` per step and is forbidden from
 * emitting selectors. The definition document is where those intents become executable, and
 * Phase 3 auto-binds each one to a discovered element. A step that matched nothing keeps the
 * honest `PENDING` placeholder under a `[NEEDS BINDING] ` name, so it fails the run loudly
 * instead of silently passing. API targets are resolved against the backend catalog the same way,
 * and are reported here on the same footing — the user-facing question is one question, whether
 * the action can run, not which kind of target it happens to have.
 *
 * This module reads that document — which already travels with the plan response — and answers
 * the only question the review screen needs: which steps are ready to run, and which still need
 * a human to bind a target.
 *
 * The document is the single source of truth here: nothing is inferred from the plan's business
 * steps, and no locator is ever invented.
 */

/** The marker the engine writes into the `name` of a step awaiting binding. */
export const NEEDS_BINDING_PREFIX = "[NEEDS BINDING] "

/** The placeholder every unbound locator, URL and API path carries. */
export const PENDING_PLACEHOLDER = "PENDING"

export type BindingStatus = "BOUND" | "NEEDS_BINDING" | "UNKNOWN"

export type PlanBinding = {
  /** Nodes that must resolve a real target before the test can run. */
  total: number
  bound: number
  unbound: number
  /** The business intents still awaiting binding, in document order. */
  unboundIntents: string[]
  /** Intent to status, for a per-step badge. An edited intent simply misses the map. */
  statusByIntent: Map<string, BindingStatus>
}

const EMPTY: PlanBinding = {
  total: 0,
  bound: 0,
  unbound: 0,
  unboundIntents: [],
  statusByIntent: new Map(),
}

type Node = Record<string, unknown>

function asNodes(value: unknown): Node[] {
  return Array.isArray(value) ? (value.filter((n) => n && typeof n === "object") as Node[]) : []
}

/**
 * A node needs a target when it has somewhere to go or something to touch: a locator, a request
 * URL, or an extracted field path. An assertion on a literal (`api.assertStatus`) has none, so it
 * is not something a human could bind and is excluded.
 */
function needsTarget(node: Node): boolean {
  const action = typeof node.action === "string" ? node.action : ""
  if (action === "ui.navigate" || action === "api.request" || action === "api.extract") return true
  return Boolean(node.locator && typeof node.locator === "object")
}

/** True when the node's target is still the honest placeholder. */
function isUnbound(node: Node): boolean {
  const locator = (node.locator ?? {}) as Node
  const values = [locator.value, locator.name, locator.role, node.url, node.jsonPath].filter(
    (v): v is string => typeof v === "string",
  )
  // The marker on the name is authoritative; the placeholder in any target slot confirms it.
  const name = typeof node.name === "string" ? node.name : ""
  if (name.startsWith(NEEDS_BINDING_PREFIX)) return true
  return values.some((v) => v.includes(PENDING_PLACEHOLDER))
}

/** The business intent a node carries, with the binding marker stripped. */
function intentOf(node: Node): string {
  const name = typeof node.name === "string" ? node.name : ""
  return name.startsWith(NEEDS_BINDING_PREFIX) ? name.slice(NEEDS_BINDING_PREFIX.length) : name
}

/**
 * Reads a definition document and reports how much of it is bound.
 *
 * A malformed or absent document yields an empty result rather than throwing: the review screen
 * must still render, and "no binding information" is a truthful answer.
 */
export function planBinding(sourceJson: string | null | undefined): PlanBinding {
  if (!sourceJson || !sourceJson.trim()) return EMPTY

  let document: Node
  try {
    const parsed: unknown = JSON.parse(sourceJson)
    if (!parsed || typeof parsed !== "object") return EMPTY
    document = parsed as Node
  } catch {
    return EMPTY
  }

  const nodes = [...asNodes(document.steps), ...asNodes(document.expectedOutcomes)].filter(
    needsTarget,
  )

  let bound = 0
  const unboundIntents: string[] = []
  const statusByIntent = new Map<string, BindingStatus>()

  for (const node of nodes) {
    const intent = intentOf(node)
    if (isUnbound(node)) {
      unboundIntents.push(intent)
      // An unbound counterpart always wins for a shared intent: reporting "Bound" for an intent
      // that also has an unbound node would be the silent failure this module exists to prevent.
      if (intent) statusByIntent.set(intent, "NEEDS_BINDING")
    } else {
      bound += 1
      if (intent && statusByIntent.get(intent) !== "NEEDS_BINDING") {
        statusByIntent.set(intent, "BOUND")
      }
    }
  }

  return {
    total: nodes.length,
    bound,
    unbound: unboundIntents.length,
    unboundIntents,
    statusByIntent,
  }
}

/**
 * The binding status for one plan step, matched on its business intent.
 *
 * Intents are carried into the document verbatim (bound) or with the marker prefix (unbound), so
 * the match is exact. A step the user has since edited has no counterpart and reports UNKNOWN
 * rather than guessing.
 */
export function bindingStatusFor(binding: PlanBinding, intent: string): BindingStatus {
  if (!intent) return "UNKNOWN"
  return binding.statusByIntent.get(intent) ?? "UNKNOWN"
}

/** True when every target in the document is bound. */
export function isFullyBound(binding: PlanBinding): boolean {
  return binding.total > 0 && binding.unbound === 0
}
