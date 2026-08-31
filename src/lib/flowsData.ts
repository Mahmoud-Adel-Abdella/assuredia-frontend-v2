/**
 * Pure mappers for the Flows + Tests screens (Phase 3).
 *
 * Architecture: backend response → mapper (this file) → UI model → components.
 * No fetching here — every function is a synchronous transformation of data
 * that src/lib/api.ts already typed against the frozen backend contract.
 */

import type { BackendClientDetails, BackendClientInfo, BackendFlowRow, BackendFlowTestRow } from "./api"
import { parseBackendTimestamp } from "./dashboardData"
import { langLocale } from "./i18n"

/* ------------------------------------------------------------------ */
/* UI models (what the existing Figma components render)               */
/* ------------------------------------------------------------------ */
export type FlowStatus = "ACTIVE" | "INACTIVE" | "RUNNING"

export type FlowTest = {
  /** flow_tests.test_method */
  name: string
  /** flow_tests.test_class (simple or fully-qualified — displayed as the backend returns it) */
  suite: string
  /** Not persisted — the frozen backend has no column for it (see Phase 3 gap report). */
  description?: string
  /** Not persisted — the frozen backend has no column for it (see Phase 3 gap report). */
  expectedResult?: string
}

export type Flow = {
  /** flows.id (numeric backend id — used for every API call) */
  id: number
  /** flows.flow_name */
  name: string
  /** Derived: scheduler.is_running → RUNNING, flows.is_active → ACTIVE, else INACTIVE */
  status: FlowStatus
  /** clients.browser (a client-level setting — the backend has no per-flow browser) */
  browser: string
  /** clients.device_type (a client-level setting — the backend has no per-flow device) */
  device: string
  /** A scheduler row exists for the flow */
  scheduled: boolean
  /** Backend `scheduler_active` — true only when a schedule exists AND it is active (not paused) */
  schedulerActive: boolean
  /** Formatted scheduler.next_run_at */
  nextRun?: string
  /** flow_tests rows — null until the per-flow tests request settles */
  tests: FlowTest[] | null
}

/* ------------------------------------------------------------------ */
/* Display helpers                                                     */
/* ------------------------------------------------------------------ */

/** Numeric backend id → the card subtitle, e.g. 10 → "FLOW-0010". Pure display formatting. */
export function flowDisplayId(id: number): string {
  return `FLOW-${String(id).padStart(4, "0")}`
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1)
}

/**
 * Client-level browser/device display values. The backend stores these on the
 * client (not per flow), so every flow card of a client shows the same pair.
 */
export function clientEnvironment(client: BackendClientInfo | null): { browser: string; device: string } {
  const browser = client?.browser?.trim() ? capitalize(client.browser.trim()) : "—"
  const device = client?.device_type?.trim() ? capitalize(client.device_type.trim()) : "—"
  return { browser, device }
}

/** scheduler.next_run_at → "Aug 26, 09:00"-style label in the viewer's local time. */
export function formatNextRun(timestamp: string | null): string | undefined {
  const date = parseBackendTimestamp(timestamp)
  if (!date) return undefined
  return new Intl.DateTimeFormat(langLocale(), {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date)
}

/* ------------------------------------------------------------------ */
/* Mappers                                                             */
/* ------------------------------------------------------------------ */

/** flow_tests rows → UI tests. The backend already orders by "order", id. */
export function toFlowTests(rows: BackendFlowTestRow[]): FlowTest[] {
  return rows.map((row) => ({
    name: row.test_method,
    suite: row.test_class,
  }))
}

/**
 * UI tests → the string refs the backend accepts on write:
 * "TestClass.testMethod". The backend qualifies short refs itself
 * (clients.<clientName>.tests.*) and splits on the last dot.
 */
export function toTestRefs(tests: FlowTest[]): string[] {
  return tests.map((t) => `${t.suite}.${t.name}`)
}

/**
 * GET /clients/{id} → UI flows.
 *
 * Soft-deleted flows (is_active=false) are filtered out: DELETE
 * /flows/{flowId} is a soft delete and the engine's config.json drops
 * those flows, so they no longer belong in the registry list. There is
 * also no endpoint to reactivate a flow, so an inactive row is a
 * deleted one.
 */
export function toFlows(details: BackendClientDetails): Flow[] {
  const { browser, device } = clientEnvironment(details.client)

  return details.flows
    .filter((row) => row.is_active)
    .map((row) => toFlow(row, browser, device))
}

function toFlow(row: BackendFlowRow, browser: string, device: string): Flow {
  const status: FlowStatus = row.is_running ? "RUNNING" : row.is_active ? "ACTIVE" : "INACTIVE"
  const scheduled = row.scheduler_id != null
  // A schedule only counts as "Scheduled" when the backend also reports it
  // active. scheduler_active=false means a paused schedule (a scheduler row
  // exists but is deactivated), which the card shows as Paused instead.
  const schedulerActive = scheduled && row.scheduler_active === true
  const flow: Flow = {
    id: row.id,
    name: row.flow_name,
    status,
    browser,
    device,
    scheduled,
    schedulerActive,
    tests: null,
  }
  const nextRun = formatNextRun(row.next_run_at)
  if (scheduled && nextRun) flow.nextRun = nextRun
  return flow
}
