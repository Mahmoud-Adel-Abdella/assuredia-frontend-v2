/**
 * Run History data layer (Phase 5 final remediation).
 *
 * Sole source of truth: GET /dashboard-api/clients/{id}/runs for the
 * authenticated client (the client id always comes from the auth session,
 * never from UI state). Rows are mapped into the shared Run model that the
 * existing table UI renders; fields the frozen backend does not expose stay
 * "—" rather than being invented.
 *
 * Row-shape facts (verified against DashboardController):
 *   - SINGLE rows are snake_case test_runs rows. `timestamp` is the time the
 *     result was persisted (run finish) and `duration_seconds` is real, so
 *     start = timestamp − duration is exact backend arithmetic, not a guess.
 *   - PACKAGE rows are live_run_executions rows remapped by the controller.
 *     `timestamp` = COALESCE(finished_at, started_at) — the start time while
 *     RUNNING, the finish time once terminal. The raw started_at is dropped
 *     by the remap, so finished packages have no duration and render "—".
 *   - Rows with status BUSY are rejected (409) attempts that never executed —
 *     they are not runs and are excluded.
 *   - Rows whose status is not part of the verified backend vocabulary map to
 *     the neutral UNKNOWN UI state: rendered plainly, never polled, never
 *     cancellable — an unrecognized state is never misrepresented as a
 *     known one (mapHistoryStatus).
 *   - PACKAGE rows carry `packageItems`: per-flow results in execution order.
 *   - trigger_source is DIRECT (run from the dashboard), SCHEDULED (cron) or
 *     UNKNOWN (legacy rows persisted before source tracking).
 */

import { useCallback, useEffect, useRef, useState } from "react"
import {
  ApiError,
  apiCancelRun,
  apiCancelSavedLiveRunExecution,
  apiClientRuns,
  apiRunAnalysis,
  apiRunFailures,
  apiRunStatus,
  apiTriggerAnalysis,
  apiSavedLiveRunExecution,
  type BackendLiveRunState,
  type DashboardRun,
} from "./api"
import { isAnalysisInFlight, isTerminalAnalysisStatus, parseAiReport } from "./aiAnalysis"
import { parseBackendTimestamp } from "./dashboardData"
import { translate } from "./i18n"
import {
  formatDurationSeconds,
  formatFull,
  formatShort,
  isTerminalStatus,
  toRun,
  type LiveRunSession,
} from "./runData"
import type { ChildTest, Run, RunStatus, Trigger } from "../components/runShared"

/* ------------------------------------------------------------------ */
/* Entry model                                                         */
/* ------------------------------------------------------------------ */

export type HistoryRowKind = "single" | "package-live" | "package-plan"

/** Backend context needed to poll / cancel an opened run. */
export type HistoryMeta = {
  kind: HistoryRowKind
  flowId: number | null
  /** SINGLE runs only. */
  runId: string | null
  /** PACKAGE runs only. */
  executionId: string | null
  startedAt: Date | null
  finishedAt: Date | null
  /** The row's canonical timestamp — used by the time filter. */
  anchor: Date | null
}

export type HistoryEntry = { run: Run; meta: HistoryMeta }

/* ------------------------------------------------------------------ */
/* Status / trigger mapping                                            */
/* ------------------------------------------------------------------ */

/**
 * Status families accepted by the frozen backend's history filter
 * (DashboardController#appendStatusValues — verified contract):
 *   PASSED    → 'PASSED','PASS','COMPLETED','SUCCESS','SUCCEEDED'
 *   FAILED    → 'FAILED','FAIL','ERROR','ERRORED'
 *   CANCELLED → 'CANCELLED','CANCELED'
 *   RUNNING   → 'RUNNING','STARTED','IN_PROGRESS','QUEUED'
 *   SKIPPED   → 'SKIPPED'
 */
const RUNNING_FAMILY = new Set(["RUNNING", "STARTED", "IN_PROGRESS", "QUEUED"])

/**
 * Backend history status → UI status.
 *   - BUSY rows return null: rejected (409) attempts that never executed.
 *   - Recognized statuses keep their verified mapping. SKIPPED whole runs
 *     never executed — the closest UI vocabulary is cancelled.
 *   - Anything unrecognized maps to the neutral "UNKNOWN" state. An
 *     unrecognized status is never passed off as a known one: an UNKNOWN
 *     row is not running, is never polled, and cannot be cancelled.
 */
export function mapHistoryStatus(status: string | null | undefined): RunStatus | null {
  const s = String(status ?? "").trim().toUpperCase()
  if (s === "BUSY") return null
  if (s === "COMPLETED" || s === "PASS" || s === "PASSED" || s === "SUCCESS" || s === "SUCCEEDED") return "PASS"
  if (s === "FAILED" || s === "FAIL" || s === "ERROR" || s === "ERRORED") return "FAILED"
  if (s === "CANCELLED" || s === "CANCELED") return "CANCELLED"
  if (s === "SKIPPED") return "CANCELLED"
  if (RUNNING_FAMILY.has(s)) return "RUNNING"
  return "UNKNOWN"
}

function mapTrigger(row: DashboardRun): Trigger {
  const source = String(row.trigger_source ?? row.source ?? "").toUpperCase()
  if (source === "SCHEDULED") return "Scheduled"
  if (source === "DIRECT") return "Manual"
  return "Unknown"
}

/** A package child's status → UI status, relative to the parent run. */
export function mapItemStatus(status: string | null | undefined, parent: RunStatus): RunStatus {
  const s = String(status ?? "").trim().toUpperCase()
  if (s === "COMPLETED" || s === "PASS" || s === "PASSED" || s === "SUCCESS" || s === "SUCCEEDED") return "PASS"
  if (s === "FAILED" || s === "FAIL" || s === "ERROR" || s === "ERRORED") return "FAILED"
  if (s === "CANCELLED" || s === "CANCELED") return "CANCELLED"
  if (s === "SKIPPED") return "CANCELLED" // the flow never executed
  if (RUNNING_FAMILY.has(s)) return "RUNNING"
  // PENDING/blank: queued behind a running package, or never started in a
  // finished one. (Live views seed pending tests the same way — runData.ts.)
  if (s === "PENDING" || s === "") return parent === "RUNNING" ? "RUNNING" : "CANCELLED"
  // Unrecognized item status: neutral, never misrepresented as a known state.
  return "UNKNOWN"
}

/* ------------------------------------------------------------------ */
/* Row → Run mapping                                                   */
/* ------------------------------------------------------------------ */

export function toHistoryEntry(row: DashboardRun, clientName: string): HistoryEntry | null {
  const status = mapHistoryStatus(row.status)
  if (status === null) return null
  const running = status === "RUNNING"
  const trigger = mapTrigger(row)
  const anchor = parseBackendTimestamp(row.timestamp)

  if (row.type === "PACKAGE" || typeof row.id === "string") {
    const executionId = String(row.id)
    const kind: HistoryRowKind = executionId.startsWith("live_") ? "package-live" : "package-plan"
    const items = row.packageItems ?? []
    const tests: ChildTest[] = items.map((item) => {
      const childStatus = mapItemStatus(item.status, status)
      return {
        name: item.flow ?? translate("run.flowFallback", { id: item.flow_id ?? "?" }),
        suite:
          String(item.scope ?? "").toUpperCase() === "SELECTED_TESTS"
            ? translate("run.selectedTests")
            : translate("run.fullFlow"),
        status: childStatus,
        duration: "—",
        // Sanitized per-flow failure message from live_run_execution_items.
        steps: item.message
          ? [{ label: translate("run.failureStep"), status: "failed" as const, error: item.message }]
          : undefined,
      }
    })
    const total = row.total ?? null
    const flowCount = row.flow_count ?? items.length
    const testLabel =
      total != null
        ? translate("run.testsCount", { count: total })
        : flowCount > 0
          ? translate("run.flowsCount", { count: flowCount })
          : "—"

    // timestamp = started while running, finished once terminal.
    const startedAt = running ? anchor : parseBackendTimestamp(row.started_at)
    const finishedAt = running ? null : anchor
    const elapsed = running && anchor ? Math.max(0, (Date.now() - anchor.getTime()) / 1000) : null

    const run: Run = {
      id: executionId,
      flow: row.package_name ?? row.flow_name ?? translate("run.packageRun"),
      isPackage: true,
      testLabel,
      tests,
      trigger,
      started: anchor ? formatShort(anchor) : "—",
      startedFull: startedAt ? formatFull(startedAt) : "—",
      endedFull: finishedAt ? formatFull(finishedAt) : "—",
      duration: elapsed != null ? formatDurationSeconds(elapsed) : "—",
      status,
      client: clientName,
      steps: 0,
      failures: row.failed ?? 0,
      hasAi: false,
      hasScreenshot: false,
      cancellable: running && kind === "package-live",
    }
    if (status === "FAILED") {
      // Aggregate fact from the package row itself — never from a single child.
      const failedFlows = tests.filter((t) => t.status === "FAILED").length
      if (failedFlows > 0) {
        run.reason = translate("run.failedFlowsOfTotal", { failed: failedFlows, total: tests.length })
      } else if ((row.failed ?? 0) > 0) {
        run.reason = translate("run.failedTestsCount", { count: row.failed ?? 0 })
      } else {
        run.reason = translate("run.executionFinishedWithFailure")
      }
      if (finishedAt) run.failedAt = formatFull(finishedAt)
    }
    // AI analysis (Phase 8): PACKAGE rows carry analysis_status + ai_report
    // directly. A stored report without a status means COMPLETED. Packages
    // have no retry endpoint on the frozen backend — read-only.
    const packageReport = parseAiReport(row.ai_report)
    const packageAnalysis = row.analysis_status && row.analysis_status !== "NOT_STARTED" ? row.analysis_status : null
    if (packageAnalysis || packageReport) {
      run.ai = {
        status: packageAnalysis ?? "COMPLETED",
        report: packageReport,
        retryable: false,
      }
      run.hasAi = true
    }
    return { run, meta: { kind, flowId: null, runId: null, executionId, startedAt, finishedAt, anchor } }
  }

  // SINGLE row.
  const runId = row.run_id ?? String(row.id)
  const durationSec = row.duration_seconds ?? null
  const finishedAt = running ? null : anchor
  const startedAt = running
    ? anchor
    : anchor && durationSec != null
      ? new Date(anchor.getTime() - durationSec * 1000)
      : anchor

  const total = row.total ?? null
  const run: Run = {
    id: runId,
    flow: row.flow_name ?? translate("run.flowRun"),
    isPackage: false,
    testLabel: total != null ? translate("run.testsCount", { count: total }) : "—",
    tests: [], // per-test names are not part of the history payload
    trigger,
    started: startedAt ? formatShort(startedAt) : "—",
    startedFull: startedAt ? formatFull(startedAt) : "—",
    endedFull: finishedAt ? formatFull(finishedAt) : "—",
    duration: running
      ? startedAt
        ? formatDurationSeconds(Math.max(0, (Date.now() - startedAt.getTime()) / 1000))
        : "—"
      : formatDurationSeconds(durationSec),
    status,
    client: clientName,
    steps: 0,
    failures: row.failed ?? 0,
    hasAi: false,
    hasScreenshot: false,
    cancellable: running && row.run_id != null,
  }
  if (status === "FAILED") {
    if ((row.failed ?? 0) > 0) {
      run.reason = translate("run.failedTestsCount", { count: row.failed ?? 0 })
    } else {
      run.reason = translate("run.executionFinishedWithFailure")
    }
    if (row.error_message) run.error = row.error_message
    if (finishedAt) run.failedAt = formatFull(finishedAt)
  }
  // AI analysis (Phase 8): SINGLE rows expose only ai_report in the list —
  // a stored report means the analysis completed. The full lifecycle state
  // (ANALYZING / FAILED / DISABLED / …) is resolved lazily through
  // GET /runs/{runId}/analysis when the run is opened (useHistoryRun).
  const singleReport = parseAiReport(row.ai_report)
  if (singleReport) {
    run.ai = { status: "COMPLETED", report: singleReport, retryable: false }
    run.hasAi = true
  }
  return {
    run,
    meta: {
      kind: "single",
      flowId: row.flow_id ?? null,
      runId,
      executionId: null,
      startedAt,
      finishedAt,
      anchor,
    },
  }
}

/* ------------------------------------------------------------------ */
/* Live follow-up for a run opened while still RUNNING                 */
/* ------------------------------------------------------------------ */

const POLL_MS = 2500
const PLAN_REFRESH_MS = 8000
const TERMINAL_EXECUTION = new Set(["COMPLETED", "FAILED", "CANCELLED"])
/** After the run finishes, keep watching its AI analysis — bounded + slower. */
const ANALYSIS_POLL_MS = 5000
const ANALYSIS_WATCH_MS = 120_000
/**
 * Analysis states the frozen backend accepts a (re)trigger for
 * (AiReliabilityService claim guard on test_runs). COMPLETED and DISABLED
 * are not re-triggerable — the UI must not offer a button for them.
 */
const RETRYABLE_ANALYSIS = new Set(["NOT_STARTED", "FAILED", "RATE_LIMITED"])

/** Merge a live execution State into the history snapshot of a package run. */
function mergeExecutionState(entry: HistoryEntry, state: BackendLiveRunState): Run {
  const mapped = mapHistoryStatus(state.status)
  // BUSY = rejected before executing; nothing more will happen.
  const status: RunStatus = mapped ?? "CANCELLED"
  const running = status === "RUNNING"
  const startedAt = entry.meta.startedAt
  const finishedAt = state.finishedAt ? parseBackendTimestamp(state.finishedAt) : entry.meta.finishedAt

  const run: Run = {
    ...entry.run,
    tests: state.items.map((item) => ({
      name: item.flow,
      suite: item.scope === "SELECTED_TESTS" ? translate("run.selectedTests") : translate("run.fullFlow"),
      status: mapItemStatus(item.status, status),
      duration: "—",
    })),
    status,
    endedFull: finishedAt ? formatFull(finishedAt) : "—",
    duration:
      running && startedAt
        ? formatDurationSeconds(Math.max(0, (Date.now() - startedAt.getTime()) / 1000))
        : startedAt && finishedAt
          ? formatDurationSeconds(Math.max(0, (finishedAt.getTime() - startedAt.getTime()) / 1000))
          : "—",
    failures: state.failed ?? 0,
    cancellable: running && !state.cancelRequested,
  }
  const done = (state.passed ?? 0) + (state.failed ?? 0) + (state.skipped ?? 0)
  if (state.total > 0) run.progress = Math.min(100, Math.round((done / state.total) * 100))
  if (state.currentFlow) {
    run.currentTest = state.currentTest ? `${state.currentFlow} · ${state.currentTest}` : state.currentFlow
  }
  if (status === "FAILED") {
    run.reason = state.message ?? translate("run.executionFailed")
    if (finishedAt) run.failedAt = formatFull(finishedAt)
  }
  // AI analysis (Phase 8): live package executions expose analysisStatus +
  // aiReport on the execution state. Informational only — the execution
  // status above stays authoritative.
  const analysisStatus = state.analysisStatus
  if (analysisStatus && analysisStatus !== "NOT_STARTED") {
    run.ai = { status: analysisStatus, report: parseAiReport(state.aiReport), retryable: false }
    run.hasAi = true
  } else {
    run.ai = undefined
    run.hasAi = false
  }
  return run
}

export type HistoryCancelResult =
  | { ok: true }
  | { ok: false; alreadyFinished: boolean; message?: string }

/**
 * Keep an opened run in sync with the backend while it is RUNNING:
 *   - SINGLE        → GET /runs/{runId}/status (full live tracker state)
 *   - PACKAGE live_ → GET /clients/{id}/live-runs/executions/{executionId}
 *   - PACKAGE plan_ → no state endpoint is reachable from history (the plan
 *     id is not part of the /runs contract), so the row is re-read from
 *     /runs until it reaches a terminal status.
 * Terminal runs are returned as-is with no polling.
 */
export function useHistoryRun(
  entry: HistoryEntry | null,
  clientId: number | null,
  clientName: string,
  onUnauthorized: () => void,
) {
  const [run, setRun] = useState<Run | null>(null)
  const [pollError, setPollError] = useState<string | null>(null)
  const [cancelling, setCancelling] = useState(false)
  const cancellingRef = useRef(false)
  /** Bumped after a successful (re)trigger to restart the analysis watch. */
  const [analysisNonce, setAnalysisNonce] = useState(0)
  const prevEntryRef = useRef<HistoryEntry | null>(null)

  useEffect(() => {
    const entryChanged = prevEntryRef.current !== entry
    prevEntryRef.current = entry

    if (!entry) {
      setRun(null)
      setPollError(null)
      return
    }
    const target = entry
    if (entryChanged) {
      setRun(target.run)
      setPollError(null)
    }

    // Terminal SINGLE runs: attach the sanitized per-test failures (FAILED
    // only — GET /runs/{runId}/failures) and resolve the AI analysis
    // lifecycle via GET /runs/{runId}/analysis. The runs list exposes only
    // ai_report for singles, so this endpoint is the sole source of the
    // ANALYZING / FAILED / DISABLED / RATE_LIMITED states. Package rows are
    // not queried here: test_failures and /analysis are keyed by single-run
    // ids, and package rows already carry analysis_status + per-flow
    // messages.
    if (
      target.meta.kind === "single" &&
      target.meta.runId &&
      target.run.status !== "RUNNING" &&
      clientId != null
    ) {
      let disposed = false
      let analysisTimer: number | undefined
      const runId = target.meta.runId

      if (target.run.status === "FAILED") {
        apiRunFailures(runId)
          .then((failures) => {
            if (disposed || failures.length === 0) return
            setRun((prev) =>
              prev && prev.id === target.run.id
                ? {
                    ...prev,
                    failureDetails: failures.map((f) => ({
                      test: f.test_name,
                      message: f.error_message,
                    })),
                  }
                : prev,
            )
          })
          .catch((err) => {
            if (disposed) return
            if (err instanceof ApiError && err.status === 401) onUnauthorized()
            // Best-effort detail: the run keeps its row-level reason/error.
          })
      }

      const watchStartedAt = Date.now()
      async function watchAnalysis() {
        if (disposed) return
        try {
          const res = await apiRunAnalysis(runId)
          if (disposed) return
          const status = res.analysisStatus ?? "NOT_STARTED"
          const report = parseAiReport(res.analysis)
          setRun((prev) => {
            if (!prev || prev.id !== target.run.id) return prev
            const retryable = RETRYABLE_ANALYSIS.has(status) && prev.status !== "CANCELLED"
            // NOT_STARTED on a finished run (legacy rows / analysis never
            // started) is only surfaced so the user can trigger it.
            const show = status !== "NOT_STARTED" || retryable
            return {
              ...prev,
              hasAi: show,
              ai: show ? { status, report, retryable } : undefined,
            }
          })
          // A genuinely in-flight analysis keeps being watched (bounded).
          if (isAnalysisInFlight(status) && Date.now() - watchStartedAt < ANALYSIS_WATCH_MS) {
            analysisTimer = window.setTimeout(watchAnalysis, ANALYSIS_POLL_MS)
          }
        } catch (err) {
          if (disposed) return
          if (err instanceof ApiError && err.status === 401) {
            onUnauthorized()
            return
          }
          if (err instanceof ApiError && err.status === 404) return // no analysis row — keep row-level state
          // Transient failure: keep the row-level state, retry inside the window.
          if (Date.now() - watchStartedAt < ANALYSIS_WATCH_MS) {
            analysisTimer = window.setTimeout(watchAnalysis, ANALYSIS_POLL_MS)
          }
        }
      }
      watchAnalysis()

      return () => {
        disposed = true
        if (analysisTimer !== undefined) window.clearTimeout(analysisTimer)
      }
    }

    if (target.run.status !== "RUNNING" || clientId == null) return

    let stopped = false
    let timer: number | undefined
    /** When the execution turned terminal — starts the bounded analysis watch. */
    let analysisWatchStart: number | null = null
    const { kind, runId, executionId, flowId } = target.meta

    /**
     * The frozen backend starts the AI analysis after the execution is
     * persisted, so a terminal execution status can still be followed by an
     * ANALYZING → COMPLETED/FAILED transition. Watch it at a slower pace,
     * bounded by ANALYSIS_WATCH_MS — nothing is faked in between.
     */
    function scheduleAnalysisWatchOrStop(analysisStatus: string | null | undefined): boolean {
      if (isTerminalAnalysisStatus(analysisStatus ?? null)) return true
      if (analysisWatchStart === null) analysisWatchStart = Date.now()
      if (Date.now() - analysisWatchStart >= ANALYSIS_WATCH_MS) return true
      timer = window.setTimeout(poll, ANALYSIS_POLL_MS)
      return false
    }

    async function poll() {
      if (stopped || clientId == null) return
      try {
        if (kind === "single" && runId) {
          const state = await apiRunStatus(runId)
          if (stopped) return
          const session: LiveRunSession = {
            runId,
            flowId: flowId ?? 0,
            flowName: target.run.flow,
            clientName,
            methods: [],
            totalTests: 0,
            options: {},
          }
          const mapped = toRun(state, session)
          // toRun assumes a run started from the Flows page; restore what the
          // history row actually knows (trigger, client).
          mapped.trigger = target.run.trigger
          mapped.client = clientName
          setRun(mapped)
          if (isTerminalStatus(state.status) && scheduleAnalysisWatchOrStop(state.analysisStatus)) return
        } else if (kind === "package-live" && executionId) {
          const state = await apiSavedLiveRunExecution(clientId, executionId)
          if (stopped) return
          setRun(mergeExecutionState(target, state))
          if (state.status === "BUSY") return
          if (TERMINAL_EXECUTION.has(state.status) && scheduleAnalysisWatchOrStop(state.analysisStatus)) return
        } else if (kind === "package-plan") {
          const rows = await apiClientRuns(clientId, 200)
          if (stopped) return
          const row = rows.find((r) => String(r.id) === target.run.id)
          if (row) {
            const next = toHistoryEntry(row, clientName)
            if (next) {
              setRun(next.run)
              if (next.run.status !== "RUNNING" && scheduleAnalysisWatchOrStop(next.run.ai?.status)) return
            }
          }
        }
      } catch (err) {
        if (stopped) return
        if (err instanceof ApiError && err.status === 401) {
          onUnauthorized()
          return
        }
        if (err instanceof ApiError && err.status === 404) {
          setPollError(translate("run.noLongerAvailable"))
          return
        }
        // Transient failure (network / 5xx): keep the last state, retry.
      }
      timer = window.setTimeout(poll, kind === "package-plan" ? PLAN_REFRESH_MS : POLL_MS)
    }

    poll()
    return () => {
      stopped = true
      if (timer !== undefined) window.clearTimeout(timer)
    }
  }, [entry, clientId, clientName, onUnauthorized, analysisNonce])

  /** Real cancellation through the matching backend endpoint. */
  const cancel = useCallback(async (): Promise<HistoryCancelResult> => {
    if (!entry || clientId == null || cancellingRef.current) {
      return { ok: false, alreadyFinished: false }
    }
    const { kind, runId, executionId } = entry.meta
    cancellingRef.current = true
    setCancelling(true)
    try {
      if (kind === "single" && runId) {
        await apiCancelRun(runId)
      } else if (kind === "package-live" && executionId) {
        await apiCancelSavedLiveRunExecution(clientId, executionId)
      } else {
        return {
          ok: false,
          alreadyFinished: false,
          message: translate("run.scheduledPackageNotCancellable"),
        }
      }
      return { ok: true }
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        onUnauthorized()
        return { ok: false, alreadyFinished: false }
      }
      if (err instanceof ApiError && err.status === 409) {
        return { ok: false, alreadyFinished: true }
      }
      return {
        ok: false,
        alreadyFinished: false,
        message: err instanceof ApiError ? err.message : translate("run.unableToCancelNow"),
      }
    } finally {
      cancellingRef.current = false
      setCancelling(false)
    }
  }, [entry, clientId, onUnauthorized])

  /**
   * POST /dashboard-api/runs/{runId}/analyze — (re)trigger the analysis of a
   * single run. The frozen backend only supports this for test_runs (package
   * executions answer 404) and answers 409 when the client's AI flag is off.
   * Nothing is faked: the UI flips to ANALYZING only on a real 202.
   */
  const retryAnalysis = useCallback(async (): Promise<HistoryCancelResult> => {
    const meta = entry?.meta
    if (!entry || !meta || meta.kind !== "single" || !meta.runId) {
      return { ok: false, alreadyFinished: false, message: translate("run.analysisSingleRunsOnly") }
    }
    try {
      const accepted = await apiTriggerAnalysis(meta.runId)
      setRun((prev) =>
        prev && prev.id === entry.run.id
          ? {
              ...prev,
              hasAi: true,
              ai: { status: accepted.analysisStatus ?? "ANALYZING", report: null, retryable: false },
            }
          : prev,
      )
      setAnalysisNonce((n) => n + 1) // restart the bounded analysis watch
      return { ok: true }
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        onUnauthorized()
        return { ok: false, alreadyFinished: false }
      }
      if (err instanceof ApiError && err.status === 409) {
        setRun((prev) =>
          prev && prev.id === entry.run.id
            ? { ...prev, hasAi: true, ai: { status: "DISABLED", report: null, retryable: false } }
            : prev,
        )
        return { ok: false, alreadyFinished: false, message: translate("run.aiDisabledForAccount") }
      }
      return {
        ok: false,
        alreadyFinished: false,
        message: err instanceof ApiError ? err.message : translate("run.unableToStartAnalysis"),
      }
    }
  }, [entry, onUnauthorized])

  return { run, pollError, cancelling, cancel, retryAnalysis }
}
