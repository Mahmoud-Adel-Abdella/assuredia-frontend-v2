/**
 * Pure mappers for live run execution (Phase 4).
 *
 * Architecture: backend run status → mapper (this file) → existing Run UI
 * model (runShared.tsx) → RunDetail. No fetching here — polling lives in
 * src/lib/useLiveRun.ts and every backend call goes through src/lib/api.ts.
 *
 * Backend status vocabulary (frozen engine LiveExecutionTracker):
 *   QUEUED | RUNNING | COMPLETED | FAILED | CANCELLED
 * UI vocabulary: PASS | FAILED | RUNNING | CANCELLED, so
 *   COMPLETED → PASS and QUEUED → RUNNING.
 *
 * Fields the backend does not provide (assertions, logs, screenshots) are
 * left empty rather than invented — RunDetail hides those sections. The AI
 * analysis state (analysisStatus / aiReport) is mapped through aiAnalysis.ts
 * and is informational only — it never affects the execution status.
 */

import type { BackendRunStatus, BackendStepState, RunFlowOptions } from "./api"
import { parseAiReport } from "./aiAnalysis"
import { parseBackendTimestamp } from "./dashboardData"
import { langLocale, translate } from "./i18n"
import type { ChildTest, Run, RunStatus, Step } from "../components/runShared"

/* ------------------------------------------------------------------ */
/* Live run session                                                    */
/* ------------------------------------------------------------------ */

/**
 * Everything the frontend knows about a run it just started. Created from
 * the 202 response of POST /clients/{id}/flows/{flowId}/run plus the flow's
 * test list; it seeds the UI before the first status poll lands and labels
 * the per-test steps the tracker reports.
 */
export type LiveRunSession = {
  runId: string
  flowId: number
  flowName: string
  clientName: string
  /** The tests this run executes, in flow order (full flow or the selection). */
  methods: { name: string; suite: string }[]
  totalTests: number
  /** The options the run was started with — reused verbatim by Run Again. */
  options: RunFlowOptions
}

const TERMINAL_STATUSES = new Set(["COMPLETED", "FAILED", "CANCELLED"])

export function isTerminalStatus(status: string): boolean {
  return TERMINAL_STATUSES.has(status)
}

/** Backend run status → UI run status. Unknown values stay "RUNNING" so polling continues. */
export function mapRunStatus(status: string): RunStatus {
  if (status === "COMPLETED") return "PASS"
  if (status === "FAILED") return "FAILED"
  if (status === "CANCELLED") return "CANCELLED"
  return "RUNNING" // QUEUED | RUNNING | anything unexpected
}

/* ------------------------------------------------------------------ */
/* Formatting helpers                                                  */
/* ------------------------------------------------------------------ */

export function formatDurationSeconds(seconds: number | null | undefined): string {
  if (seconds == null) return "—"
  if (seconds < 60) return `${Math.round(seconds)}s`
  const m = Math.floor(seconds / 60)
  const s = Math.round(seconds % 60)
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
}

function formatDurationMs(ms: number | null | undefined): string | undefined {
  if (ms == null) return undefined
  const seconds = ms / 1000
  return seconds >= 10 ? `${Math.round(seconds)}s` : `${(Math.round(seconds * 10) / 10).toFixed(1)}s`
}

export function formatFull(date: Date): string {
  const locale = langLocale()
  const day = new Intl.DateTimeFormat(locale, { month: "short", day: "numeric", year: "numeric" }).format(date)
  const time = new Intl.DateTimeFormat(locale, { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }).format(date)
  return `${day} · ${time}`
}

export function formatShort(date: Date): string {
  const locale = langLocale()
  const time = new Intl.DateTimeFormat(locale, { hour: "2-digit", minute: "2-digit", hour12: false }).format(date)
  const now = new Date()
  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
  const dayDiff = Math.round((startOfDay(now) - startOfDay(date)) / 86_400_000)
  if (dayDiff === 0) return translate("time.todayAt", { time })
  if (dayDiff === 1) return translate("time.yesterdayAt", { time })
  const day = new Intl.DateTimeFormat(locale, { month: "short", day: "numeric" }).format(date)
  return `${day}, ${time}`
}

/* ------------------------------------------------------------------ */
/* Step mapping                                                        */
/* ------------------------------------------------------------------ */

function mapStepStatus(status: string): Step["status"] {
  if (status === "PASSED") return "done"
  if (status === "FAILED") return "failed"
  if (status === "RUNNING") return "current"
  return "pending" // PENDING | SKIPPED
}

function toStep(step: BackendStepState): Step {
  const mapped: Step = { label: step.stepName, status: mapStepStatus(step.status) }
  const duration = formatDurationMs(step.durationMs)
  if (duration) mapped.duration = duration
  if (step.status === "FAILED" && step.errorMessage) mapped.error = step.errorMessage
  return mapped
}

/** A test's aggregate status from its step statuses + the overall run status. */
function childStatus(stepStatuses: string[], runStatus: RunStatus): RunStatus {
  if (stepStatuses.includes("FAILED")) return "FAILED"
  if (stepStatuses.includes("RUNNING")) return "RUNNING"
  if (stepStatuses.length > 0 && stepStatuses.every((s) => s === "PASSED")) return "PASS"
  // Not finished yet (PENDING/SKIPPED leftovers): follow the run's outcome.
  if (runStatus === "CANCELLED") return "CANCELLED"
  if (runStatus === "FAILED") return "FAILED"
  if (runStatus === "PASS") return "PASS"
  return "RUNNING"
}

function toChildTests(
  steps: BackendStepState[],
  session: LiveRunSession,
  runStatus: RunStatus,
): ChildTest[] {
  const stepsByMethod = new Map<string, BackendStepState[]>()
  for (const step of steps) {
    const list = stepsByMethod.get(step.testMethod)
    if (list) list.push(step)
    else stepsByMethod.set(step.testMethod, [step])
  }

  // Expected tests first (in flow order), then any tracker-only extras.
  const orderedMethods = session.methods.map((m) => m.name)
  for (const method of stepsByMethod.keys()) {
    if (!orderedMethods.includes(method)) orderedMethods.push(method)
  }
  const suiteOf = new Map(session.methods.map((m) => [m.name, m.suite]))

  return orderedMethods.map((method) => {
    const testSteps = stepsByMethod.get(method) ?? []
    const statuses = testSteps.map((s) => s.status)
    const finishedMs = testSteps.every((s) => s.durationMs != null) && testSteps.length > 0
    const totalMs = testSteps.reduce((sum, s) => sum + (s.durationMs ?? 0), 0)
    const child: ChildTest = {
      name: method,
      suite: suiteOf.get(method) ?? "",
      status: childStatus(statuses, runStatus),
      duration: finishedMs ? formatDurationMs(totalMs) ?? "—" : "—",
    }
    if (testSteps.length > 0) child.steps = testSteps.map(toStep)
    return child
  })
}

/* ------------------------------------------------------------------ */
/* Run mapping                                                         */
/* ------------------------------------------------------------------ */

/** Seed the UI from the 202 response before the first status poll lands. */
export function initialRun(session: LiveRunSession): Run {
  return {
    id: session.runId,
    flow: session.flowName,
    isPackage: false,
    testLabel: session.methods.length === 1 ? session.methods[0].name : translate("run.testsCount", { count: session.totalTests }),
    tests: session.methods.map((m) => ({ name: m.name, suite: m.suite, status: "RUNNING", duration: "—" })),
    trigger: "Manual",
    started: "—",
    startedFull: "—",
    endedFull: "—",
    duration: "0s",
    status: "RUNNING",
    client: session.clientName,
    steps: 0,
    failures: 0,
    hasAi: false,
    hasScreenshot: false,
    cancellable: true,
  }
}

/** GET /runs/{runId}/status payload → the existing Run UI model. */
export function toRun(state: BackendRunStatus, session: LiveRunSession): Run {
  const status = mapRunStatus(state.status)
  const running = status === "RUNNING"
  const steps = state.steps ?? []

  const startedAt = parseBackendTimestamp(state.startedAt)
  const completedAt = parseBackendTimestamp(state.completedAt)

  const firstFailure = steps.find((s) => s.status === "FAILED")

  const run: Run = {
    id: state.runId,
    flow: state.flow ?? session.flowName,
    isPackage: false,
    testLabel: session.methods.length === 1 ? session.methods[0].name : translate("run.testsCount", { count: state.totalTests ?? session.totalTests }),
    tests: toChildTests(steps, session, status),
    trigger: "Manual",
    started: startedAt ? formatShort(startedAt) : "—",
    startedFull: startedAt ? formatFull(startedAt) : "—",
    endedFull: completedAt ? formatFull(completedAt) : "—",
    duration: running ? formatDurationSeconds(state.durationSeconds ?? 0) : formatDurationSeconds(state.durationSeconds),
    status,
    client: state.client ?? session.clientName,
    steps: steps.length,
    failures: state.failedTests ?? 0,
    hasAi: false,
    hasScreenshot: false,
    cancellable: running && !state.cancelRequested,
  }

  if (typeof state.progress === "number") run.progress = state.progress
  if (state.currentTest) run.currentTest = state.currentTest
  if (state.currentStep) run.currentStep = state.currentStep
  if (steps.length > 0) run.stepList = steps.map(toStep)

  if (status === "FAILED") {
    run.reason =
      (state.failedTests ?? 0) > 0
        ? translate("run.failedOfTotalTests", {
            failed: state.failedTests ?? 0,
            total: state.totalTests ?? session.totalTests,
          })
        : translate("run.failedBeforeAnyTest")
    if (firstFailure) {
      run.failedStep = firstFailure.stepName
      if (firstFailure.errorMessage) run.error = firstFailure.errorMessage
    }
    if (completedAt) run.failedAt = formatFull(completedAt)
  }

  // AI analysis (Phase 8): informational augmentation of the execution — it
  // never changes the execution status above. NOT_STARTED while the run is
  // in flight means analysis has not begun yet and is not surfaced.
  const analysisStatus = state.analysisStatus
  if (analysisStatus && analysisStatus !== "NOT_STARTED") {
    run.ai = {
      status: analysisStatus,
      report: parseAiReport(state.aiReport),
      // Single runs are test_runs-scoped; the frozen backend accepts a
      // re-trigger only while no analysis has completed. Cancelled runs are
      // never retryable — the user aborted the execution (matches the Run
      // History gate in runHistory.ts).
      retryable:
        !running && status !== "CANCELLED" && (analysisStatus === "FAILED" || analysisStatus === "RATE_LIMITED"),
    }
    run.hasAi = true
  }

  return run
}
