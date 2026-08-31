/**
 * Frontend Automation adapter layer (Phase 5).
 *
 * The user-facing concept is AUTOMATION. The frozen backend has two separate
 * representations and they are deliberately NOT unified server-side:
 *
 *   - Manual automations   → Saved Live Runs  (/clients/{id}/live-runs)
 *   - Scheduled automations → Execution Plans (/clients/{id}/schedules)
 *
 * This module is the ONLY place that knows about that split. UI components
 * work with the unified `Automation` model and call the orchestration
 * functions below; they never talk to the raw endpoints directly.
 *
 * Mapping rules (verified against the frozen backend source):
 *   - create without schedule  → POST live-runs
 *   - create with schedule     → POST schedules (isActive: true)
 *   - edit manual → scheduled  → POST schedules + DELETE the saved live run
 *   - edit scheduled → manual  → POST live-runs + DELETE the plan
 *   - pause / resume           → PUT plan with isActive false/true
 *   - delete                   → DELETE the single backing representation
 *   - Run Now                  → POST .../run on the backing representation
 *
 * Known backend limitations handled honestly here (reported, never faked):
 *   - Execution attribution is verified, never name-matched:
 *       Manual automations → live_run_executions rows are attributed through
 *       the execution state's real `savedLiveRunId` foreign key (survives
 *       renames; two same-named automations can never cross-match).
 *       Executions whose saved live run was deleted answer 404 (the backend
 *       nulls the FK) and stay visible only in Run History.
 *       Scheduled automations → the frozen backend stores NO plan reference
 *       on historical rows and keeps plan-run state in memory for ~30
 *       minutes only, so only executions from the current session can be
 *       verified: a candidate row is attributed only after
 *       GET /schedules/{planId}/runs/{planRunId} confirms ownership (200).
 *       Name is used solely as a candidate pre-filter, never as proof.
 *       Older executions remain visible in Run History, unattributed.
 *   - The manual ↔ scheduled transition is a non-atomic two-step write
 *     (create new representation, then delete the old one). A failed
 *     cleanup is retried with backoff and, if it still fails, surfaced as a
 *     partial success — never hidden. Deleting a saved live run also nulls
 *     the savedLiveRunId FK on its executions (see attribution above).
 *   - There is no next-run-time API, so the UI never shows one.
 *   - Notifications are a single notifyPolicy (always / on_failure / never)
 *     on scheduled automations only; there are no per-channel options.
 */

import {
  ApiError,
  apiClientRuns,
  apiCreatePlan,
  apiCreateSavedLiveRun,
  apiDeletePlan,
  apiDeleteSavedLiveRun,
  apiFlowTests,
  apiGetSavedLiveRun,
  apiListPlans,
  apiListSavedLiveRuns,
  apiPlanRunStatus,
  apiRunPlanNow,
  apiRunSavedLiveRun,
  apiSavedLiveRunExecution,
  apiCancelPlanRun,
  apiCancelSavedLiveRunExecution,
  apiUpdatePlan,
  apiUpdateSavedLiveRun,
  apiClientDetails,
  type BackendPlanResponse,
  type BackendSavedLiveRunRow,
  type DashboardRun,
  type PlanWrite,
  type SavedLiveRunItemWrite,
} from "./api"
import { parseAiReport, type ParsedAiReport } from "./aiAnalysis"
import { parseBackendTimestamp } from "./dashboardData"
import { langLocale, translate } from "./i18n"

/* ------------------------------------------------------------------ */
/* Unified Automation model                                            */
/* ------------------------------------------------------------------ */

export type AutomationScope = "FULL_FLOW" | "SELECTED_TESTS"

export type AutomationFlowRef = {
  flowId: number
  flowName: string
  scope: AutomationScope
  /** Test method names; empty for FULL_FLOW. */
  selectedTests: string[]
}

export type NotifyPolicy = "always" | "on_failure" | "never"

export type AutomationSchedule = {
  /** Six-field Spring cron expression (seconds minutes hours day month weekday). */
  cronExpression: string
  /** null = inherits the client's account timezone. */
  timezone: string | null
  isActive: boolean
  notifyPolicy: NotifyPolicy | null
}

export type AutomationRunInfo = {
  executionId: string
  /** Normalized for display: PASSED | FAILED | CANCELLED | RUNNING. */
  status: "PASSED" | "FAILED" | "CANCELLED" | "RUNNING"
  trigger: "Manual" | "Scheduled"
  startedAt: Date | null
  finishedAt: Date | null
  total: number
  passed: number
  failed: number
}

export type AutomationKind = "manual" | "scheduled"

export type Automation = {
  /** Stable UI id: "live:<id>" or "plan:<id>". */
  id: string
  kind: AutomationKind
  /** Primary key of the backing backend record. */
  backendId: number
  name: string
  flows: AutomationFlowRef[]
  flowCount: number
  /** Total tests that will execute; null while a full-flow count is unknown. */
  testCount: number | null
  schedule: AutomationSchedule | null
  createdAt: Date | null
  updatedAt: Date | null
  lastRun: AutomationRunInfo | null
  recentRuns: AutomationRunInfo[]
}

export function parseAutomationId(id: string): { kind: AutomationKind; backendId: number } | null {
  const match = /^(live|plan):(\d+)$/.exec(id)
  if (!match) return null
  return { kind: match[1] === "live" ? "manual" : "scheduled", backendId: parseInt(match[2], 10) }
}

/* ------------------------------------------------------------------ */
/* Loading — merge both backend representations into one list          */
/* ------------------------------------------------------------------ */

export type AutomationsLoadResult = {
  automations: Automation[]
  /** Present when one backend representation could not be loaded. */
  warning?: string
}

function parseSelectedTests(raw: string | null): string[] {
  if (!raw) return []
  try {
    const parsed: unknown = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.filter((t): t is string => typeof t === "string") : []
  } catch {
    return []
  }
}

function normalizeHistoryStatus(status: string): AutomationRunInfo["status"] {
  const s = status.toUpperCase()
  if (s === "COMPLETED" || s === "PASS" || s === "PASSED") return "PASSED"
  if (s === "FAILED" || s === "FAIL") return "FAILED"
  if (s === "CANCELLED" || s === "CANCELED") return "CANCELLED"
  return "RUNNING"
}

function toRunInfo(row: DashboardRun): AutomationRunInfo {
  // PACKAGE history rows only carry a finish timestamp (no started_at), so
  // startedAt stays null there and the duration renders as unknown rather
  // than a fabricated 0s.
  const started = row.started_at ? parseBackendTimestamp(row.started_at) : null
  const status = normalizeHistoryStatus(row.status)
  // PACKAGE history rows expose timestamp = COALESCE(finished_at, started_at).
  const finished = status !== "RUNNING" ? parseBackendTimestamp(row.timestamp) : null
  return {
    executionId: String(row.id),
    status,
    trigger: String(row.trigger_source ?? "").toUpperCase() === "SCHEDULED" ? "Scheduled" : "Manual",
    startedAt: started,
    finishedAt: finished,
    total: row.total ?? 0,
    passed: row.passed ?? 0,
    failed: row.failed ?? 0,
  }
}

/** Most recent live executions probed for attribution (bounded fan-out). */
const ATTRIBUTION_PROBE_CAP = 40
/** Most recent executions shown per automation. */
const RECENT_RUNS_CAP = 5

/**
 * Manual automations — attribute live-run executions through the execution
 * state's real savedLiveRunId foreign key. Rename-safe by construction, and
 * two same-named automations can never cross-match. Executions whose saved
 * live run was deleted answer 404 (the backend nulls the FK) and remain
 * visible only in Run History.
 */
async function attributeManualRuns(
  clientId: number,
  automations: Automation[],
  packages: DashboardRun[],
): Promise<void> {
  if (automations.length === 0) return
  const byBackendId = new Map(automations.map((automation) => [automation.backendId, automation]))
  const liveRows = packages
    .filter((row) => String(row.id).startsWith("live_"))
    .slice(0, ATTRIBUTION_PROBE_CAP)
  const states = await Promise.all(
    liveRows.map((row) => apiSavedLiveRunExecution(clientId, String(row.id)).catch(() => null)),
  )
  const runsByAutomation = new Map<number, AutomationRunInfo[]>()
  liveRows.forEach((row, index) => {
    const state = states[index]
    if (!state) return // deleted saved live run → unattributable, stays in Run History
    const automation = byBackendId.get(state.savedLiveRunId)
    if (!automation) return
    const list = runsByAutomation.get(automation.backendId) ?? []
    list.push(toRunInfo(row)) // rows arrive newest-first; order preserved
    runsByAutomation.set(automation.backendId, list)
  })
  for (const automation of automations) {
    const runs = runsByAutomation.get(automation.backendId) ?? []
    automation.recentRuns = runs.slice(0, RECENT_RUNS_CAP)
    automation.lastRun = automation.recentRuns[0] ?? null
  }
}

/**
 * Scheduled automations — the frozen backend persists no plan reference on
 * historical rows and keeps plan-run state in memory for ~30 minutes only,
 * so only executions from the current backend session can be attributed.
 * The stored plan name (itself not unique in the schema) is used strictly as
 * a candidate pre-filter; attribution is proven by probing
 * GET /schedules/{planId}/runs/{executionId}, which answers 200 only when
 * the in-memory run belongs to THIS plan. Same-named plans can therefore
 * never cross-match, and nothing is ever attributed on name alone.
 */
async function attributeScheduledRuns(
  clientId: number,
  automations: Automation[],
  packages: DashboardRun[],
): Promise<void> {
  if (automations.length === 0) return
  const planRows = packages.filter((row) => String(row.id).startsWith("plan_"))
  await Promise.all(
    automations.map(async (automation) => {
      const candidates = planRows
        .filter((row) => row.flow_name === automation.name)
        .slice(0, RECENT_RUNS_CAP)
      const verified = await Promise.all(
        candidates.map(async (row) => {
          try {
            // The persisted execution id IS the planRunId (verified against
            // SchedulePlanService.persistPackageStart).
            await apiPlanRunStatus(clientId, automation.backendId, String(row.id))
            return toRunInfo(row)
          } catch {
            return null // state expired or different plan → never attribute
          }
        }),
      )
      const runs = verified.filter((info): info is AutomationRunInfo => info !== null)
      automation.recentRuns = runs.slice(0, RECENT_RUNS_CAP)
      automation.lastRun = automation.recentRuns[0] ?? null
    }),
  )
}

/**
 * Load every automation for the client. Saved-live-run list rows carry no
 * items, so each config is fetched for its flows; FULL_FLOW items need the
 * flow's current test list to compute an honest total test count.
 * lastRun/recentRuns come from verified attribution of run-history PACKAGE
 * rows (foreign key / ownership probe — never a name match).
 */
export async function loadAutomations(clientId: number): Promise<AutomationsLoadResult> {
  const [liveSettled, plansSettled] = await Promise.allSettled([
    apiListSavedLiveRuns(clientId),
    apiListPlans(clientId),
  ])

  const liveRows = liveSettled.status === "fulfilled" ? liveSettled.value : null
  const plans = plansSettled.status === "fulfilled" ? plansSettled.value : null
  if (liveRows === null && plans === null) {
    throw liveSettled.status === "rejected" ? liveSettled.reason : (plansSettled as PromiseRejectedResult).reason
  }

  const warning =
    liveRows === null
      ? translate("automations.warningManualNotLoaded")
      : plans === null
        ? translate("automations.warningScheduledNotLoaded")
        : undefined

  // Full configs for saved live runs (list rows only carry counts).
  const liveConfigs = liveRows
    ? await Promise.all(
        liveRows.map((row) => apiGetSavedLiveRun(clientId, row.id).catch(() => null)),
      )
    : []

  const manual: Automation[] = []
  liveRows?.forEach((row, index) => {
    const config = liveConfigs[index]
    const flows: AutomationFlowRef[] = (config?.items ?? [])
      .slice()
      .sort((a, b) => a.position - b.position)
      .map((item) => ({
        flowId: item.flow_id,
        flowName: item.flow_name,
        scope: item.run_scope,
        selectedTests: parseSelectedTests(item.selected_tests),
      }))
    manual.push({
      id: `live:${row.id}`,
      kind: "manual",
      backendId: row.id,
      name: row.name,
      flows,
      flowCount: row.flow_count,
      testCount: null, // resolved below once full-flow test counts are known
      schedule: null,
      createdAt: parseBackendTimestamp(row.created_at),
      updatedAt: parseBackendTimestamp(row.updated_at),
      lastRun: null,
      recentRuns: [],
    })
  })

  const scheduled: Automation[] = (plans ?? []).map((plan) => fromPlan(plan))

  // Resolve honest test totals for FULL_FLOW items.
  const fullFlowIds = new Set<number>()
  for (const automation of [...manual, ...scheduled]) {
    for (const flow of automation.flows) {
      if (flow.scope === "FULL_FLOW") fullFlowIds.add(flow.flowId)
    }
  }
  const testCounts = new Map<number, number>()
  await Promise.all(
    [...fullFlowIds].map(async (flowId) => {
      try {
        const tests = await apiFlowTests(flowId)
        testCounts.set(flowId, tests.length)
      } catch {
        /* count stays unknown — testCount remains null */
      }
    }),
  )
  for (const automation of [...manual, ...scheduled]) {
    let total = 0
    let complete = true
    for (const flow of automation.flows) {
      if (flow.scope === "SELECTED_TESTS") total += flow.selectedTests.length
      else {
        const count = testCounts.get(flow.flowId)
        if (count === undefined) complete = false
        else total += count
      }
    }
    automation.testCount = complete ? total : null
  }

  // Last/recent runs — verified attribution only, never a name match
  // (see the module header for the exact backend contract).
  try {
    const history = await apiClientRuns(clientId, 200)
    // A rejected (409/BUSY) attempt persists a status=BUSY row that never
    // actually executed — it is not a run, so it must not surface as one.
    const packages = history.filter(
      (row) => row.type === "PACKAGE" && String(row.status ?? "").toUpperCase() !== "BUSY",
    )
    await Promise.all([
      attributeManualRuns(clientId, manual, packages),
      attributeScheduledRuns(clientId, scheduled, packages),
    ])
  } catch {
    /* history is supplementary — the list still renders without it */
  }

  const automations = [...manual, ...scheduled].sort((a, b) => {
    const at = a.createdAt?.getTime() ?? 0
    const bt = b.createdAt?.getTime() ?? 0
    return bt - at
  })

  return { automations, warning }
}

function fromPlan(plan: BackendPlanResponse): Automation {
  const flows: AutomationFlowRef[] = plan.items
    .slice()
    .sort((a, b) => a.position - b.position)
    .map((item) => ({
      flowId: item.flowId,
      flowName: item.flowName,
      scope: item.runScope,
      selectedTests: item.selectedTests ?? [],
    }))
  return {
    id: `plan:${plan.id}`,
    kind: "scheduled",
    backendId: plan.id,
    name: plan.name,
    flows,
    flowCount: flows.length,
    testCount: null,
    schedule: {
      cronExpression: plan.cronExpression,
      timezone: plan.timezone,
      isActive: plan.isActive,
      notifyPolicy: plan.notifyPolicy,
    },
    createdAt: parseBackendTimestamp(plan.createdAt),
    updatedAt: parseBackendTimestamp(plan.updatedAt),
    lastRun: null,
    recentRuns: [],
  }
}

/** Load one automation with full detail (reuses the list loader). */
export async function loadAutomation(clientId: number, id: string): Promise<Automation | null> {
  const { automations } = await loadAutomations(clientId)
  return automations.find((automation) => automation.id === id) ?? null
}

/* ------------------------------------------------------------------ */
/* Form support — real flows and tests only (no mock pool)             */
/* ------------------------------------------------------------------ */

export type FlowOption = { id: number; name: string }

/** The client's flows, for the automation form's flow selectors. */
export async function loadFlowOptions(clientId: number): Promise<FlowOption[]> {
  const details = await apiClientDetails(clientId)
  return details.flows
    .filter((flow) => flow.is_active)
    .map((flow) => ({ id: flow.id, name: flow.flow_name }))
}

/** The flow's test method names, in execution order. */
export async function loadFlowTestOptions(flowId: number): Promise<string[]> {
  const tests = await apiFlowTests(flowId)
  return tests.map((test) => test.test_method)
}

/* ------------------------------------------------------------------ */
/* Create / edit orchestration (CASE A / B / C from the spec)          */
/* ------------------------------------------------------------------ */

export type AutomationDraft = {
  name: string
  items: SavedLiveRunItemWrite[]
  /** null = manual automation. */
  schedule: {
    cronExpression: string
    timezone: string | null
    notifyPolicy: NotifyPolicy | null
  } | null
}

/** Thrown when the new representation was saved but the old one could not be removed. */
export class AutomationSaveError extends Error {
  partial: boolean
  constructor(message: string, partial = false) {
    super(message)
    this.name = "AutomationSaveError"
    this.partial = partial
  }
}

function toPlanWrite(draft: AutomationDraft, isActive: boolean): PlanWrite {
  const schedule = draft.schedule
  return {
    name: draft.name,
    cronExpression: schedule?.cronExpression ?? "0 0 9 * * *",
    timezone: schedule?.timezone ?? null,
    isActive,
    notifyPolicy: schedule?.notifyPolicy ?? null,
    items: draft.items,
  }
}

/**
 * Delete the superseded representation during a manual ↔ scheduled
 * transition, with bounded retry. The frozen backend has no atomic move
 * operation, so the transition is a two-step write (create new, delete old)
 * and this cleanup step can transiently fail. Rules honoured here:
 *   - 404 means the record is already gone — that is success, not failure.
 *   - 401 is rethrown untouched so the caller ends the session.
 *   - transient failures get a short backoff retry before surfacing.
 * A final failure propagates so saveAutomation reports a partial save —
 * a leftover duplicate is never hidden.
 */
async function deleteSuperseded(op: () => Promise<unknown>): Promise<void> {
  const maxAttempts = 3
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      await op()
      return
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) return
      if (err instanceof ApiError && err.status === 401) throw err
      if (attempt === maxAttempts) throw err
      await new Promise((resolve) => setTimeout(resolve, 400 * attempt))
    }
  }
}

/**
 * Create or update an automation, transparently handling the manual ↔
 * scheduled transition by creating the new backend representation first and
 * then deleting the previous one (with retry — see deleteSuperseded). A
 * failure of the cleanup step is reported as a partial success — never
 * hidden — so the caller can warn about the possible duplicate.
 */
export async function saveAutomation(
  clientId: number,
  existing: Automation | null,
  draft: AutomationDraft,
): Promise<void> {
  if (!existing) {
    if (draft.schedule === null) {
      await apiCreateSavedLiveRun(clientId, { name: draft.name, items: draft.items })
    } else {
      await apiCreatePlan(clientId, toPlanWrite(draft, true))
    }
    return
  }

  const wasScheduled = existing.kind === "scheduled"
  const willBeScheduled = draft.schedule !== null

  if (wasScheduled === willBeScheduled) {
    if (willBeScheduled) {
      // Preserve the current pause state on a plain edit.
      await apiUpdatePlan(clientId, existing.backendId, toPlanWrite(draft, existing.schedule?.isActive ?? true))
    } else {
      await apiUpdateSavedLiveRun(clientId, existing.backendId, { name: draft.name, items: draft.items })
    }
    return
  }

  // CASE C — manual ↔ scheduled transition: create new, then remove old.
  if (willBeScheduled) {
    await apiCreatePlan(clientId, toPlanWrite(draft, true))
    try {
      await deleteSuperseded(() => apiDeleteSavedLiveRun(clientId, existing.backendId))
    } catch {
      throw new AutomationSaveError(translate("automations.partialManualLeft"), true)
    }
  } else {
    await apiCreateSavedLiveRun(clientId, { name: draft.name, items: draft.items })
    try {
      await deleteSuperseded(() => apiDeletePlan(clientId, existing.backendId))
    } catch {
      throw new AutomationSaveError(translate("automations.partialScheduleLeft"), true)
    }
  }
}

/** Delete the single backend representation backing this automation. */
export async function deleteAutomation(clientId: number, automation: Automation): Promise<void> {
  if (automation.kind === "manual") {
    await apiDeleteSavedLiveRun(clientId, automation.backendId)
  } else {
    await apiDeletePlan(clientId, automation.backendId)
  }
}

/** Pause or resume a scheduled automation (PUT plan with isActive toggled). */
export async function setSchedulePaused(
  clientId: number,
  automation: Automation,
  paused: boolean,
): Promise<void> {
  if (automation.kind !== "scheduled" || !automation.schedule) {
    throw new AutomationSaveError(translate("automations.onlyScheduledPauseResume"))
  }
  const body: PlanWrite = {
    name: automation.name,
    cronExpression: automation.schedule.cronExpression,
    timezone: automation.schedule.timezone,
    isActive: !paused,
    notifyPolicy: automation.schedule.notifyPolicy,
    items: automation.flows.map((flow) => ({
      flowId: flow.flowId,
      runScope: flow.scope,
      selectedTests: flow.scope === "SELECTED_TESTS" ? flow.selectedTests : undefined,
    })),
  }
  await apiUpdatePlan(clientId, automation.backendId, body)
}

/* ------------------------------------------------------------------ */
/* Run Now orchestration                                               */
/* ------------------------------------------------------------------ */

export type AutomationRunStart =
  | { kind: "manual"; executionId: string }
  | { kind: "scheduled"; planId: number; planRunId: string }

/**
 * Start a real execution through the backing backend representation.
 * A 409 means the client already has a run in progress (one run lock per
 * client across all triggers) and is surfaced to the caller as ApiError.
 */
export async function runAutomationNow(clientId: number, automation: Automation): Promise<AutomationRunStart> {
  if (automation.kind === "manual") {
    const state = await apiRunSavedLiveRun(clientId, automation.backendId)
    return { kind: "manual", executionId: state.executionId }
  }
  const run = await apiRunPlanNow(clientId, automation.backendId)
  return { kind: "scheduled", planId: automation.backendId, planRunId: run.planRunId }
}

/** One flow inside an aggregate automation execution. */
export type AutomationItemState = {
  flowId: number | null
  flow: string
  scope: AutomationScope | null
  /** Present once the child flow run has started; enables drill-down. */
  runId: string | null
  /** Raw backend item status (PENDING/RUNNING/COMPLETED/FAILED/CANCELLED/SKIPPED). */
  status: string
  message: string | null
  /** Selected test names (manual executions only; empty for plan runs). */
  tests: string[]
  total: number
  passed: number
  failed: number
  skipped: number
}

/** Aggregate execution state of one automation run (all of its flows). */
export type AutomationRunState = {
  target: AutomationRunStart
  name: string
  /** Raw backend execution status (QUEUED/RUNNING/COMPLETED/FAILED/CANCELLED/BUSY). */
  status: string
  cancelRequested: boolean
  /** null for manual executions — the frozen backend exposes no start time. */
  startedAt: Date | null
  finishedAt: Date | null
  message: string | null
  /**
   * Raw backend AI analysis lifecycle status
   * (NOT_STARTED/ANALYZING/COMPLETED/FAILED/DISABLED/RATE_LIMITED).
   * Manual (live) executions expose it; plan-run state does not (backend gap)
   * — null then means "not exposed", never "no analysis".
   */
  analysisStatus: string | null
  /** Parsed AI reliability report when one is stored; informational only. */
  aiReport: ParsedAiReport | null
  total: number
  passed: number
  failed: number
  skipped: number
  items: AutomationItemState[]
}

const TERMINAL_AUTOMATION_RUN_STATUSES = new Set(["COMPLETED", "FAILED", "CANCELLED", "BUSY"])

export function isTerminalAutomationRunStatus(status: string): boolean {
  return TERMINAL_AUTOMATION_RUN_STATUSES.has(String(status).toUpperCase())
}

/**
 * Fetch the aggregate state of an automation execution — every flow with
 * its real status, counts and message. Every value comes from the backend;
 * nothing is derived or invented.
 *
 * Reachability (frozen backend):
 *   - manual executions are DB-backed and stay reachable indefinitely;
 *   - scheduled plan runs live in backend memory for ~30 minutes after
 *     finishing, then answer 404 (their history rows remain in Run History).
 */
export async function getAutomationRunState(
  clientId: number,
  target: AutomationRunStart,
): Promise<AutomationRunState> {
  if (target.kind === "manual") {
    const state = await apiSavedLiveRunExecution(clientId, target.executionId)
    return {
      target,
      name: state.name,
      status: state.status,
      cancelRequested: state.cancelRequested,
      startedAt: null,
      finishedAt: state.finishedAt ? parseBackendTimestamp(state.finishedAt) : null,
      message: state.message ?? null,
      analysisStatus: state.analysisStatus ?? null,
      aiReport: parseAiReport(state.aiReport),
      total: state.total ?? 0,
      passed: state.passed ?? 0,
      failed: state.failed ?? 0,
      skipped: state.skipped ?? 0,
      items: state.items.map((item) => ({
        flowId: item.flowId,
        flow: item.flow,
        scope: item.scope,
        runId: item.runId,
        status: item.status,
        message: item.message ?? null,
        tests: item.tests ?? [],
        total: item.total ?? 0,
        passed: item.passed ?? 0,
        failed: item.failed ?? 0,
        skipped: item.skipped ?? 0,
      })),
    }
  }
  const run = await apiPlanRunStatus(clientId, target.planId, target.planRunId)
  return {
    target,
    name: run.planName,
    status: run.status,
    cancelRequested: run.cancelRequested,
    startedAt: run.startedAt ? parseBackendTimestamp(run.startedAt) : null,
    finishedAt: run.finishedAt ? parseBackendTimestamp(run.finishedAt) : null,
    message: run.message ?? null,
    // Plan-run state exposes no analysis fields on the frozen backend; the
    // package analysis stays visible in Run History rows instead.
    analysisStatus: null,
    aiReport: null,
    total: run.items.reduce((sum, item) => sum + (item.total ?? 0), 0),
    passed: run.items.reduce((sum, item) => sum + (item.passed ?? 0), 0),
    failed: run.items.reduce((sum, item) => sum + (item.failed ?? 0), 0),
    skipped: run.items.reduce((sum, item) => sum + (item.skipped ?? 0), 0),
    items: run.items.map((item) => ({
      flowId: item.flowId,
      flow: item.flow,
      scope: item.scope ?? null,
      runId: item.runId,
      status: item.status,
      message: item.message ?? null,
      tests: [], // plan-run state does not carry test lists
      total: item.total ?? 0,
      passed: item.passed ?? 0,
      failed: item.failed ?? 0,
      skipped: item.skipped ?? 0,
    })),
  }
}

/** Request cancellation through the endpoint matching the run's kind. */
export async function cancelAutomationRun(clientId: number, target: AutomationRunStart): Promise<void> {
  if (target.kind === "manual") {
    await apiCancelSavedLiveRunExecution(clientId, target.executionId)
  } else {
    await apiCancelPlanRun(clientId, target.planId, target.planRunId)
  }
}

/* ------------------------------------------------------------------ */
/* Schedule helpers — cron derivation, parsing, human summaries        */
/* ------------------------------------------------------------------ */

/**
 * Internal frequency tokens — deriveCron/parseCronToForm switch on these
 * exact strings. Display labels come from frequencyLabel() (i18n); the
 * tokens themselves are never translated or shown to the user.
 */
export const SCHEDULE_FREQUENCIES = [
  "Every 15 minutes",
  "Every 30 minutes",
  "Every hour",
  "Every 2 hours",
  "Every 6 hours",
  "Every day",
  "Every week",
]

/** Localized display label for an internal frequency token. */
export function frequencyLabel(frequency: string): string {
  switch (frequency) {
    case "Every 15 minutes":
      return translate("schedule.freq.every15m")
    case "Every 30 minutes":
      return translate("schedule.freq.every30m")
    case "Every hour":
      return translate("schedule.freq.everyHour")
    case "Every 2 hours":
      return translate("schedule.freq.every2h")
    case "Every 6 hours":
      return translate("schedule.freq.every6h")
    case "Every day":
      return translate("schedule.freq.everyDay")
    case "Every week":
      return translate("schedule.freq.everyWeek")
    default:
      return frequency
  }
}

export const TIMEZONE_OPTIONS = [
  "UTC",
  "Africa/Cairo",
  "Europe/London",
  "America/New_York",
  "America/Los_Angeles",
  "Asia/Singapore",
  "Asia/Tokyo",
]

/** Notify-policy options — labelKey is resolved through the i18n dictionary at render time. */
export const NOTIFY_POLICY_OPTIONS: { value: NotifyPolicy; labelKey: string }[] = [
  { value: "always", labelKey: "schedule.notifyAlways" },
  { value: "on_failure", labelKey: "schedule.notifyOnFailure" },
  { value: "never", labelKey: "schedule.notifyNever" },
]

const ACCOUNT_TZ_KEY = "assuredia_tz_config"

/**
 * Persist the account timezone preference (Settings → Timezone). Mirrors the
 * value that the frozen backend stores in clients.timezone so the automation
 * form's "account timezone" display agrees with the server between fetches.
 */
export function setAccountTimezoneConfig(cfg: { autoDetect: boolean; manualTz: string }): void {
  try {
    localStorage.setItem(ACCOUNT_TZ_KEY, JSON.stringify(cfg))
  } catch {
    /* ignore storage failures */
  }
}

/** True when the user already saved a timezone preference on this device. */
export function hasAccountTimezoneConfig(): boolean {
  try {
    return localStorage.getItem(ACCOUNT_TZ_KEY) != null
  } catch {
    return false
  }
}

/** The account timezone configured in Settings (falls back to the browser). */
export function getAccountTimezone(): string {
  try {
    const raw = localStorage.getItem(ACCOUNT_TZ_KEY)
    if (raw) {
      const cfg = JSON.parse(raw) as { autoDetect?: boolean; manualTz?: string }
      if (cfg.autoDetect !== false) {
        return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"
      }
      return cfg.manualTz ?? "UTC"
    }
  } catch {
    /* fall through */
  }
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"
  } catch {
    return "UTC"
  }
}

/**
 * Derive the backend's SIX-field Spring cron expression from a form
 * frequency + time (the Figma design used five fields; the frozen backend
 * validates with Spring CronExpression, which requires a leading seconds
 * field — always "0" here).
 */
export function deriveCron(frequency: string, time: string): string {
  const parts = time.split(":")
  const h = parseInt(parts[0] ?? "0", 10)
  const m = parseInt(parts[1] ?? "0", 10)
  switch (frequency) {
    case "Every 15 minutes":
      return "0 */15 * * * *"
    case "Every 30 minutes":
      return "0 */30 * * * *"
    case "Every hour":
      return "0 0 * * * *"
    case "Every 2 hours":
      return "0 0 */2 * * *"
    case "Every 6 hours":
      return "0 0 */6 * * *"
    case "Every day":
      return `0 ${m} ${h} * * *`
    case "Every week":
      return `0 ${m} ${h} * * 1`
    default:
      return "0 0 9 * * *"
  }
}

/**
 * Reverse-map a stored six-field cron expression to the form's frequency +
 * time. Returns null for expressions the form cannot represent (created
 * outside this UI); the caller keeps the raw cron until the user changes it.
 */
export function parseCronToForm(cron: string): { frequency: string; time: string } | null {
  const fields = cron.trim().split(/\s+/)
  if (fields.length !== 6) return null
  const [, m, h, dom, mon, dow] = fields
  const two = (v: string) => v.padStart(2, "0")
  const isNum = (v: string) => /^\d+$/.test(v)
  if (dom !== "*" || mon !== "*") return null
  if (m.startsWith("*/") && isNum(m.slice(2)) && h === "*" && dow === "*") {
    if (m === "*/15") return { frequency: "Every 15 minutes", time: "00:00" }
    if (m === "*/30") return { frequency: "Every 30 minutes", time: "00:00" }
    return null
  }
  if (!isNum(m) || !isNum(h)) return null
  const time = `${two(h)}:${two(m)}`
  if (h === "0" && m === "0" && dow === "*") {
    if (dom === "*") return { frequency: "Every hour", time }
    return null
  }
  if (m === "0" && h.startsWith("*/") && isNum(h.slice(2)) && dow === "*") {
    if (h === "*/2") return { frequency: "Every 2 hours", time }
    if (h === "*/6") return { frequency: "Every 6 hours", time }
    return null
  }
  if (dow === "*" ) return { frequency: "Every day", time }
  if (dow === "1") return { frequency: "Every week", time }
  return null
}

/** Human-readable summary of a schedule, e.g. "Daily at 09:00". */
export function describeSchedule(schedule: AutomationSchedule): string {
  const parsed = parseCronToForm(schedule.cronExpression)
  if (parsed) return describeFrequency(parsed.frequency, parsed.time)
  return `CRON ${schedule.cronExpression}`
}

/** Human-readable label for a form frequency + time, e.g. "Daily at 09:00". */
export function describeFrequency(frequency: string, time: string): string {
  switch (frequency) {
    case "Every 15 minutes":
      return translate("schedule.runsEvery15m")
    case "Every 30 minutes":
      return translate("schedule.runsEvery30m")
    case "Every hour":
      return translate("schedule.freq.everyHour")
    case "Every 2 hours":
      return translate("schedule.runsEvery2h")
    case "Every 6 hours":
      return translate("schedule.runsEvery6h")
    case "Every day":
      return translate("schedule.dailyAt", { time })
    case "Every week":
      return translate("schedule.weeklyMonAt", { time })
    default:
      return translate("schedule.freqAt", { frequency, time })
  }
}

export function describeNotifyPolicy(policy: NotifyPolicy | null): string {
  if (policy === "always") return translate("schedule.notifyAlways")
  if (policy === "on_failure") return translate("schedule.notifyOnFailure")
  if (policy === "never") return translate("schedule.notifyNever")
  return translate("schedule.notifyDefault")
}

/* ------------------------------------------------------------------ */
/* Display formatting                                                  */
/* ------------------------------------------------------------------ */

/** "Today, 14:02" / "Yesterday, 22:10" / "Aug 23, 09:00". */
export function formatRunTime(date: Date | null): string {
  if (!date) return "—"
  const now = new Date()
  const hm = `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`
  const sameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
  const yesterday = new Date(now.getTime() - 86400000)
  if (sameDay(date, now)) return translate("time.todayAt", { time: hm })
  if (sameDay(date, yesterday)) return translate("time.yesterdayAt", { time: hm })
  return `${date.toLocaleDateString(langLocale(), { month: "short", day: "numeric" })}, ${hm}`
}

export function formatDuration(startedAt: Date | null, finishedAt: Date | null): string {
  if (!startedAt || !finishedAt) return "—"
  const seconds = Math.max(0, Math.round((finishedAt.getTime() - startedAt.getTime()) / 1000))
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.floor(seconds / 60)
  const rest = seconds % 60
  if (minutes < 60) return rest > 0 ? `${minutes}m ${rest}s` : `${minutes}m`
  const hours = Math.floor(minutes / 60)
  return `${hours}h ${minutes % 60}m`
}

/** Friendly message for API errors surfaced by this layer (no raw traces). */
export function automationErrorMessage(err: unknown, fallback: string): string {
  if (err instanceof AutomationSaveError) return err.message
  if (err instanceof ApiError) {
    if (err.status === 0) return err.message
    return err.message || fallback
  }
  return fallback
}
