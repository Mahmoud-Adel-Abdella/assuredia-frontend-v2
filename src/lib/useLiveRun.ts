/**
 * Live run polling (Phase 4).
 *
 * Polls GET /dashboard-api/runs/{runId}/status for a run started via
 * POST /clients/{id}/flows/{flowId}/run. Polling rules (frozen-backend
 * contract):
 *   - starts only once a valid runId exists (a LiveRunSession),
 *   - sequential requests — the next poll is scheduled after the previous
 *     one settles, so requests never overlap,
 *   - stops when the backend reports a terminal status
 *     (COMPLETED | FAILED | CANCELLED) or when the hook unmounts,
 *   - after the run turns terminal, the frozen backend starts the AI
 *     analysis asynchronously, so polling continues at a slower pace until
 *     the analysis itself reaches a terminal state — bounded by a safety
 *     cap so a run whose analysis never starts is not polled forever,
 *   - a transient network/5xx error keeps the last known state and retries;
 *     401 routes to the auth handler, 404 stops with an error.
 * All backend calls go through src/lib/api.ts.
 */

import { useCallback, useEffect, useRef, useState } from "react"
import { ApiError, apiCancelRun, apiRunStatus, apiTriggerAnalysis } from "./api"
import { isTerminalAnalysisStatus } from "./aiAnalysis"
import { translate } from "./i18n"
import { initialRun, isTerminalStatus, toRun, type LiveRunSession } from "./runData"
import type { Run } from "../components/runShared"

/** The frozen tracker is designed for ~1s polling; stay slightly slower. */
const POLL_INTERVAL_MS = 1500
/** Slower cadence once only the AI analysis can still change. */
const ANALYSIS_POLL_INTERVAL_MS = 3000
/**
 * Safety cap for watching the analysis after the run finished. The frozen
 * backend retries internally (3 attempts × 20s + backoff), so two minutes
 * covers every honest outcome; after that the run detail / history views
 * reflect the final state on their next fetch.
 */
const ANALYSIS_WATCH_MS = 120_000

export type CancelResult =
  | { ok: true }
  | { ok: false; alreadyFinished: boolean; message?: string }

export function useLiveRun(session: LiveRunSession | null, onUnauthorized: () => void) {
  const [run, setRun] = useState<Run | null>(null)
  const [pollError, setPollError] = useState<string | null>(null)
  const [cancelling, setCancelling] = useState(false)
  const sessionRef = useRef(session)
  sessionRef.current = session
  const cancellingRef = useRef(false)
  /** Bumped after a successful analysis (re)trigger to restart the watch. */
  const [analysisNonce, setAnalysisNonce] = useState(0)
  const prevSessionRef = useRef<LiveRunSession | null>(null)

  useEffect(() => {
    const sessionChanged = prevSessionRef.current !== session
    prevSessionRef.current = session

    if (!session) {
      setRun(null)
      setPollError(null)
      return
    }
    if (sessionChanged) {
      setRun(initialRun(session))
      setPollError(null)
    }

    let stopped = false
    let timer: number | undefined
    /** When the run turned terminal — starts the bounded analysis watch. */
    let terminalAt: number | null = null

    async function poll() {
      if (stopped || !session) return
      try {
        const state = await apiRunStatus(session.runId)
        if (stopped) return
        setRun(toRun(state, session))
        if (isTerminalStatus(state.status)) {
          // Execution finished. The frozen backend starts the AI analysis
          // asynchronously after persistence, so keep watching until the
          // analysis reaches its own terminal state — bounded, at a slower
          // cadence, and with nothing faked in between.
          if (isTerminalAnalysisStatus(state.analysisStatus ?? null)) return
          if (terminalAt === null) terminalAt = Date.now()
          if (Date.now() - terminalAt >= ANALYSIS_WATCH_MS) return
          timer = window.setTimeout(poll, ANALYSIS_POLL_INTERVAL_MS)
          return
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
      timer = window.setTimeout(poll, POLL_INTERVAL_MS)
    }

    poll()
    return () => {
      stopped = true
      if (timer !== undefined) window.clearTimeout(timer)
    }
  }, [session, onUnauthorized, analysisNonce])

  /**
   * POST /runs/{runId}/cancel. The backend only flips the status to
   * CANCELLED when the suite actually stops, so polling simply continues;
   * nothing is faked here. A 409 means the run already finished.
   */
  const cancel = useCallback(async (): Promise<CancelResult> => {
    const current = sessionRef.current
    if (!current || cancellingRef.current) return { ok: false, alreadyFinished: false }
    cancellingRef.current = true
    setCancelling(true)
    try {
      await apiCancelRun(current.runId)
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
  }, [onUnauthorized])

  /**
   * POST /dashboard-api/runs/{runId}/analyze — re-trigger the analysis of
   * this single run (test_runs scope). The UI only flips to ANALYZING on a
   * real 202; a 409 means the client has AI disabled.
   */
  const retryingAnalysisRef = useRef(false)
  const [retryingAnalysis, setRetryingAnalysis] = useState(false)
  const retryAnalysis = useCallback(async (): Promise<CancelResult> => {
    const current = sessionRef.current
    if (!current || retryingAnalysisRef.current) return { ok: false, alreadyFinished: false }
    retryingAnalysisRef.current = true
    setRetryingAnalysis(true)
    try {
      const accepted = await apiTriggerAnalysis(current.runId)
      setRun((prev) =>
        prev
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
          prev ? { ...prev, hasAi: true, ai: { status: "DISABLED", report: null, retryable: false } } : prev,
        )
        return { ok: false, alreadyFinished: false, message: translate("run.aiDisabledForAccount") }
      }
      return {
        ok: false,
        alreadyFinished: false,
        message: err instanceof ApiError ? err.message : translate("run.unableToStartAnalysis"),
      }
    } finally {
      retryingAnalysisRef.current = false
      setRetryingAnalysis(false)
    }
  }, [onUnauthorized])

  return { run, pollError, cancelling, cancel, retryAnalysis, retryingAnalysis }
}
