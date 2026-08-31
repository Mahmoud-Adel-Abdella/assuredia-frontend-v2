/**
 * Automation Run view (Phase 5 final remediation, Finding #3).
 *
 * Aggregate execution view for one automation run: the automation as a
 * whole plus EVERY flow in the package, each with its real backend status,
 * counts and message. Built from the existing Figma/RunDetail visual
 * language — no new design, no invented progress.
 *
 * Data source (both verified in src/lib/automations.ts):
 *   - manual    → GET /clients/{id}/live-runs/executions/{executionId} (DB-backed)
 *   - scheduled → GET /clients/{id}/schedules/{planId}/runs/{planRunId}
 *                 (in-memory ~30 min; a 404 is reported honestly)
 *
 * A child flow with a runId can be opened in the existing Phase 4
 * LiveRunView for per-test detail.
 */

import React, { useEffect, useRef, useState } from "react"
import { Button, Card, ErrorState, Modal, Skeleton, cx, useToast } from "./primitives"
import { WorkspaceHeader } from "./WorkspaceHeader"
import { StatusBadge, StatusIcon, statusTone, type RunStatus } from "./runShared"
import { ApiError, apiFlowTests } from "../lib/api"
import {
  type AutomationItemState,
  type AutomationRunStart,
  type AutomationRunState,
  automationErrorMessage,
  cancelAutomationRun,
  getAutomationRunState,
  isTerminalAutomationRunStatus,
} from "../lib/automations"
import { mapHistoryStatus, mapItemStatus } from "../lib/runHistory"
import { isTerminalAnalysisStatus } from "../lib/aiAnalysis"
import { formatDurationSeconds } from "../lib/runData"
import type { LiveRunSession } from "../lib/runData"
import { translate, useLang } from "../lib/i18n"
import { AiAnalysisCard } from "./AiCard"

const POLL_MS = 2500
/** After the execution finishes, watch the package AI analysis — bounded. */
const ANALYSIS_POLL_MS = 5000
const ANALYSIS_WATCH_MS = 120_000

/** Elapsed whole seconds since `baseMs`, ticking once per second while active. */
function useElapsedSeconds(active: boolean, baseMs: number): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!active) return
    setNow(Date.now())
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [active])
  return Math.max(0, Math.floor((now - baseMs) / 1000))
}

function itemSummary(item: AutomationItemState): string {
  const parts: string[] = []
  if (item.total > 0) parts.push(translate("autrun.passedOfTotal", { passed: item.passed, total: item.total }))
  if (item.failed > 0) parts.push(translate("autrun.failedCount", { count: item.failed }))
  if (item.skipped > 0) parts.push(translate("autrun.skippedCount", { count: item.skipped }))
  return parts.length > 0 ? parts.join(" · ") : translate("autrun.noTestsReported")
}

/* ------------------------------------------------------------------ */
/* Aggregate live banner (RunDetail LiveBanner visual language)        */
/* ------------------------------------------------------------------ */
function AggregateLiveBanner({
  elapsed,
  currentFlow,
  progress,
}: {
  elapsed: string
  currentFlow?: string
  progress?: number
}) {
  const { t } = useLang()
  return (
    <div className="overflow-hidden rounded-[var(--radius-card)] border border-brand-200 bg-brand-50">
      <div className="flex items-center justify-between gap-4 px-4 py-3">
        <span className="inline-flex items-center gap-2.5 text-[13px] font-bold text-brand-300">
          <span className="relative flex size-2.5">
            <span
              className="absolute inline-flex size-full rounded-full bg-brand-600 opacity-75"
              style={{ animation: "ping 1.2s cubic-bezier(0,0,0.2,1) infinite" }}
            />
            <span className="relative inline-flex size-2.5 rounded-full bg-brand-600" />
          </span>
          {t("status.running").toUpperCase()}
        </span>
        <span className="font-mono text-[14px] font-semibold tabular-nums text-brand-300">
          {elapsed}
        </span>
      </div>
      {currentFlow && (
        <div className="border-t border-brand-200 bg-brand-100/30 px-4 py-2.5">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-brand-300/70">
            {t("autrun.currentFlow")}
          </p>
          <p className="mt-0.5 font-mono text-[13px] font-medium text-brand-300">{currentFlow}</p>
        </div>
      )}
      {typeof progress === "number" && (
        <div className="px-4 pb-3 pt-2">
          <div className="flex items-center justify-between pb-1">
            <span className="text-[11px] text-brand-300/70">{t("autrun.progress")}</span>
            <span className="font-mono text-[11px] text-brand-300">{progress}%</span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-brand-200">
            <div
              className="h-full rounded-full bg-brand-600 transition-all duration-500"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      )}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Automation Run page                                                 */
/* ------------------------------------------------------------------ */
export function AutomationRunView({
  active,
  onSelect,
  clientId,
  clientName,
  automationName,
  target,
  onBack,
  onUnauthorized,
  onOpenChildRun,
  onViewAi,
}: {
  active: string
  onSelect: (k: string) => void
  clientId: number
  clientName: string
  automationName: string
  target: AutomationRunStart
  onBack: () => void
  onUnauthorized: () => void
  onOpenChildRun: (session: LiveRunSession) => void
  /** Deep-link into the AI Analysis page (manual package executions only). */
  onViewAi?: (executionId: string) => void
}) {
  const toast = useToast()
  const { t } = useLang()
  const [state, setState] = useState<AutomationRunState | null>(null)
  const [pollError, setPollError] = useState<string | null>(null)
  const [confirmCancel, setConfirmCancel] = useState(false)
  const [cancelling, setCancelling] = useState(false)
  const [drillingRunId, setDrillingRunId] = useState<string | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)
  const mountedAt = useRef(Date.now())

  /* ---- Poll the aggregate execution state -------------------------- */
  useEffect(() => {
    let stopped = false
    let timer: number | undefined
    /** When the execution turned terminal — starts the bounded analysis watch. */
    let analysisWatchStart: number | null = null

    async function poll() {
      try {
        const next = await getAutomationRunState(clientId, target)
        if (stopped) return
        setState(next)
        setPollError(null)
        if (isTerminalAutomationRunStatus(next.status)) {
          // Execution finished. Manual (live) package executions run their AI
          // analysis after persistence and expose analysisStatus — keep
          // watching it (bounded, slower) until it settles. Scheduled plan
          // runs expose no analysis fields (analysisStatus === null), so they
          // stop here and the analysis stays visible in Run History.
          if (next.analysisStatus == null || isTerminalAnalysisStatus(next.analysisStatus)) return
          if (analysisWatchStart === null) analysisWatchStart = Date.now()
          if (Date.now() - analysisWatchStart >= ANALYSIS_WATCH_MS) return
          timer = window.setTimeout(poll, ANALYSIS_POLL_MS)
          return
        }
      } catch (err) {
        if (stopped) return
        if (err instanceof ApiError && err.status === 401) {
          onUnauthorized()
          return
        }
        if (err instanceof ApiError && err.status === 404) {
          setPollError(
            target.kind === "scheduled"
              ? translate("autrun.scheduledExpired")
              : translate("autrun.executionGone"),
          )
          return
        }
        // Transient failure: keep the last state and retry.
      }
      timer = window.setTimeout(poll, POLL_MS)
    }

    poll()
    return () => {
      stopped = true
      if (timer !== undefined) window.clearTimeout(timer)
    }
  }, [clientId, target, onUnauthorized, refreshKey])

  /* ---- Cancel ------------------------------------------------------ */
  async function handleCancel() {
    if (!state || cancelling) return
    setCancelling(true)
    try {
      await cancelAutomationRun(clientId, state.target)
      setConfirmCancel(false)
      toast({
        title: t("autrun.cancelRequestedTitle"),
        description: t("autrun.cancelRequestedDesc"),
        variant: "info",
      })
      setRefreshKey((k) => k + 1)
    } catch (err) {
      setConfirmCancel(false)
      if (err instanceof ApiError && err.status === 401) {
        onUnauthorized()
        return
      }
      if (err instanceof ApiError && err.status === 409) {
        toast({
          title: t("autrun.runAlreadyFinishedTitle"),
          description: t("autrun.runAlreadyFinishedDesc"),
          variant: "info",
        })
        setRefreshKey((k) => k + 1)
        return
      }
      toast({
        title: t("autrun.cancelFailedTitle"),
        description: automationErrorMessage(err, t("common.somethingWentWrong")),
        variant: "error",
      })
    } finally {
      setCancelling(false)
    }
  }

  /* ---- Drill down into one child flow run --------------------------- */
  async function openChild(item: AutomationItemState) {
    if (!item.runId || item.flowId == null || drillingRunId != null) return
    setDrillingRunId(item.runId)
    try {
      const rows = await apiFlowTests(item.flowId)
      let methods = rows.map((row) => ({ name: row.test_method, suite: row.test_class ?? "" }))
      if (item.tests.length > 0) {
        const wanted = new Set(item.tests)
        methods = methods.filter((m) => wanted.has(m.name))
      }
      onOpenChildRun({
        runId: item.runId,
        flowId: item.flowId,
        flowName: item.flow,
        clientName,
        methods,
        totalTests: methods.length,
        options:
          item.scope === "SELECTED_TESTS" && item.tests.length > 0
            ? { onlyTests: item.tests }
            : {},
      })
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        onUnauthorized()
        return
      }
      toast({
        title: t("autrun.openChildFailedTitle"),
        description: automationErrorMessage(err, t("common.somethingWentWrong")),
        variant: "error",
      })
    } finally {
      setDrillingRunId(null)
    }
  }

  /* ---- Derived display values --------------------------------------- */
  const overallStatus: RunStatus = state ? (mapHistoryStatus(state.status) ?? "CANCELLED") : "RUNNING"
  const running = state ? !isTerminalAutomationRunStatus(state.status) : true
  const progress =
    state && state.total > 0
      ? Math.min(100, Math.round(((state.passed + state.failed + state.skipped) / state.total) * 100))
      : undefined
  const currentFlow = state?.items.find((item) => item.status === "RUNNING")?.flow
  const elapsedBase = state?.startedAt?.getTime() ?? mountedAt.current
  const elapsedSeconds = useElapsedSeconds(running && !pollError, elapsedBase)
  const elapsedLabel = formatDurationSeconds(elapsedSeconds)
  const durationLabel =
    state?.startedAt && state.finishedAt
      ? formatDurationSeconds(Math.max(0, (state.finishedAt.getTime() - state.startedAt.getTime()) / 1000))
      : null

  return (
    <div className="space-y-6">
      <WorkspaceHeader active={active} onSelect={onSelect} />

      {/* Back link */}
      <button
        onClick={onBack}
        className="flex items-center gap-1.5 text-[13px] font-medium text-slate-400 transition-colors hover:text-slate-700"
      >
        <svg className="size-4 rtl:-scale-x-100" viewBox="0 0 20 20" fill="currentColor">
          <path
            fillRule="evenodd"
            d="M17 10a.75.75 0 01-.75.75H5.612l4.158 3.96a.75.75 0 11-1.04 1.08l-5.5-5.25a.75.75 0 010-1.08l5.5-5.25a.75.75 0 111.04 1.08L5.612 9.25H16.25A.75.75 0 0117 10z"
            clipRule="evenodd"
          />
        </svg>
        {t("page.automations.back")}
      </button>

      {state ? (
        <>
          {/* Header card */}
          <Card className="p-5">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="min-w-0">
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-brand-300">
                  {t("autrun.eyebrow")}
                </p>
                <h1 className="mt-1 truncate font-display text-2xl font-bold tracking-tight text-navy">
                  {automationName}
                </h1>
                <p className="mt-1 text-[13px] text-slate-500">
                  {t("automations.flowsCount", { count: state.items.length })}
                  {state.total > 0 && ` · ${t("run.testsCount", { count: state.total })}`}
                  {target.kind === "scheduled" && ` · ${t("autrun.scheduledAutomation")}`}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <StatusBadge status={overallStatus} />
                {running && !state.cancelRequested && (
                  <Button variant="danger" size="sm" onClick={() => setConfirmCancel(true)}>
                    {t("autrun.cancelRun")}
                  </Button>
                )}
                {running && state.cancelRequested && (
                  <span className="rounded-full bg-amber-50 px-2.5 py-1 text-[11px] font-semibold text-amber-600 ring-1 ring-inset ring-amber-600/10">
                    {t("autrun.cancelling")}
                  </span>
                )}
              </div>
            </div>

            {/* Outcome / failure message */}
            {!running && state.message && (
              <p className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-[13px] text-slate-600">
                {state.message}
              </p>
            )}

            {/* Result counts once terminal */}
            {!running && (
              <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-2 border-t border-slate-100 pt-4 text-[13px] text-slate-500">
                <span>
                  <span className="font-semibold text-success">{state.passed}</span> {t("autrun.passedLabel")}
                </span>
                <span>
                  <span className="font-semibold text-error">{state.failed}</span> {t("autrun.failedLabel")}
                </span>
                <span>
                  <span className="font-semibold text-slate-600">{state.skipped}</span> {t("autrun.skippedLabel")}
                </span>
                <span className="font-mono text-[12px]">
                  {t("autrun.durationLabel", { duration: durationLabel ?? "—" })}
                </span>
              </div>
            )}
          </Card>

          {/* Package AI analysis — manual executions only (scheduled plan
              runs expose no analysis fields; packages are never retryable). */}
          {state.analysisStatus != null && state.analysisStatus !== "NOT_STARTED" && (
            <AiAnalysisCard
              status={state.analysisStatus}
              report={state.aiReport}
              onViewFull={
                state.analysisStatus === "COMPLETED" && state.aiReport && target.kind === "manual" && onViewAi
                  ? () => onViewAi(target.executionId)
                  : undefined
              }
            />
          )}

          {/* Live banner while running */}
          {running && (
            <AggregateLiveBanner
              elapsed={elapsedLabel}
              currentFlow={currentFlow}
              progress={progress}
            />
          )}

          {/* Per-flow rows */}
          <Card className="overflow-hidden">
            <div className="border-b border-slate-100 px-5 py-3.5">
              <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-slate-400">
                {t("autrun.flowsInExecution")}
              </p>
            </div>
            <div className="divide-y divide-slate-100">
              {state.items.map((item, index) => {
                const itemStatus = mapItemStatus(item.status, overallStatus)
                const tone = statusTone(itemStatus)
                return (
                  <div key={`${item.flowId ?? index}-${index}`} className="flex items-center gap-4 px-5 py-3.5">
                    <span className={cx("shrink-0", tone)}>
                      <StatusIcon status={itemStatus} className="size-5" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="truncate text-[13px] font-semibold text-navy">{item.flow}</p>
                        <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-500">
                          {item.scope === "SELECTED_TESTS" ? t("run.selectedTests") : t("run.fullFlow")}
                        </span>
                      </div>
                      <p className="mt-0.5 text-[12px] text-slate-400">
                        {itemSummary(item)}
                        {item.message && itemStatus !== "PASS" && (
                          <span className="text-slate-500"> — {item.message}</span>
                        )}
                      </p>
                    </div>
                    <StatusBadge status={itemStatus} />
                    {item.runId ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => void openChild(item)}
                        loading={drillingRunId === item.runId}
                      >
                        {drillingRunId !== item.runId && t("common.view")}
                      </Button>
                    ) : (
                      <span className="w-[52px]" />
                    )}
                  </div>
                )
              })}
            </div>
          </Card>
        </>
      ) : pollError ? null : (
        <Card>
          <Skeleton className="h-24 w-full" rounded="lg" />
        </Card>
      )}

      {pollError && (
        <Card>
          <ErrorState
            title={t("autrun.stateUnavailableTitle")}
            description={pollError}
            onRetry={running ? () => setRefreshKey((k) => k + 1) : undefined}
          />
        </Card>
      )}

      {/* Cancel confirmation */}
      <Modal
        isOpen={confirmCancel}
        onClose={() => {
          if (!cancelling) setConfirmCancel(false)
        }}
        title={t("autrun.cancelModalTitle")}
        description={t("autrun.cancelModalDesc")}
        variant="danger"
        size="sm"
        footer={
          <div className="flex justify-end gap-3">
            <Button variant="ghost" onClick={() => setConfirmCancel(false)} disabled={cancelling}>
              {t("autrun.keepRunning")}
            </Button>
            <Button variant="danger" onClick={() => void handleCancel()} loading={cancelling}>
              {cancelling ? t("autrun.cancelling") : t("autrun.cancelExecution")}
            </Button>
          </div>
        }
      />
    </div>
  )
}

export default AutomationRunView
