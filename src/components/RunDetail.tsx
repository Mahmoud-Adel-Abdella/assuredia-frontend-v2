import React, { useEffect, useState } from "react"
import { Button, Card, cx } from "./primitives"
import { AiAnalysisCard } from "./AiCard"
import {
  Run,
  Step,
  StatusBadge,
  StatusIcon,
  TriggerTag,
  statusTone,
  triggerLabelKey,
} from "./runShared"
import { useLang } from "../lib/i18n"

/* ------------------------------------------------------------------ */
/* Live elapsed timer                                                 */
/* ------------------------------------------------------------------ */
function parseDurationToSeconds(d: string): number {
  const colonMatch = d.match(/^(\d+):(\d+)$/)
  if (colonMatch) return parseInt(colonMatch[1]) * 60 + parseInt(colonMatch[2])
  const sMatch = d.match(/^(\d+)s$/)
  if (sMatch) return parseInt(sMatch[1])
  return 0
}

function formatElapsed(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return m > 0
    ? `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`
    : `${s}s`
}

function useLiveTimer(running: boolean, initialDuration: string): string {
  const [seconds, setSeconds] = useState<number>(() =>
    running ? parseDurationToSeconds(initialDuration) : 0
  )

  // Live runs re-sync to the backend-reported duration on every poll; the
  // local tick only smooths the display between polls.
  useEffect(() => {
    if (!running) return
    setSeconds(parseDurationToSeconds(initialDuration))
  }, [running, initialDuration])

  useEffect(() => {
    if (!running) return
    const id = setInterval(() => setSeconds((s) => s + 1), 1000)
    return () => clearInterval(id)
  }, [running])

  return running ? formatElapsed(seconds) : initialDuration
}

/* ------------------------------------------------------------------ */
/* Small building blocks                                              */
/* ------------------------------------------------------------------ */
function SummaryStat({
  label,
  value,
  tone,
}: {
  label: string
  value: string | number
  tone?: "error" | "default"
}) {
  return (
    <div className="rounded-lg border border-slate-200 bg-elevated px-3 py-2.5 text-center">
      <p className={cx("font-display text-lg font-bold", tone === "error" ? "text-error" : "text-navy")}>
        {value}
      </p>
      <p className="text-[11px] text-slate-400">{label}</p>
    </div>
  )
}

function DetailField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{label}</p>
      <p className="mt-1 text-[13px] font-medium text-slate-700">{children}</p>
    </div>
  )
}

/* Step timeline node -------------------------------------------------*/
function StepNode({ step, last }: { step: Step; last: boolean }) {
  const isDone = step.status === "done"
  const isCurrent = step.status === "current"
  const isFailed = step.status === "failed"
  const isPending = step.status === "pending"

  const dot = isDone
    ? "bg-success text-white"
    : isCurrent
      ? "bg-brand-600 text-white"
      : isFailed
        ? "bg-error text-white"
        : "border border-slate-300 bg-surface"

  return (
    <li className="relative flex gap-3 pb-4 last:pb-0">
      {!last && <span className="absolute start-[10px] top-6 h-[calc(100%-1rem)] w-px bg-slate-200" />}

      {/* Dot */}
      <span
        className={cx(
          "relative z-10 mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full",
          dot,
          isCurrent && "ring-4 ring-brand-100",
        )}
      >
        {isDone && (
          <svg className="size-3" viewBox="0 0 20 20" fill="currentColor">
            <path
              fillRule="evenodd"
              d="M16.7 5.3a1 1 0 010 1.4l-7.5 7.5a1 1 0 01-1.4 0L3.3 9.7a1 1 0 011.4-1.4l3.1 3.1 6.8-6.8a1 1 0 011.4 0z"
            />
          </svg>
        )}
        {isFailed && (
          <svg className="size-3" viewBox="0 0 20 20" fill="currentColor">
            <path d="M5.3 5.3a1 1 0 011.4 0L10 8.6l3.3-3.3a1 1 0 111.4 1.4L11.4 10l3.3 3.3a1 1 0 01-1.4 1.4L10 11.4l-3.3 3.3a1 1 0 01-1.4-1.4L8.6 10 5.3 6.7a1 1 0 010-1.4z" />
          </svg>
        )}
        {isCurrent && <span className="size-1.5 animate-pulse rounded-full bg-white" />}
      </span>

      {/* Content */}
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-3">
          <span
            className={cx(
              "text-[13px]",
              isPending && "text-slate-400",
              isDone && "font-medium text-slate-700",
              isCurrent && "font-semibold text-brand-300",
              isFailed && "font-medium text-error",
            )}
          >
            {step.label}
          </span>
          {step.duration && (
            <span className="shrink-0 font-mono text-[11px] text-slate-400">{step.duration}</span>
          )}
        </div>
        {step.action && (
          <p className="mt-0.5 font-mono text-[11px] text-slate-400">{step.action}</p>
        )}
        {step.result && (
          <p className="mt-0.5 font-mono text-[11px] text-emerald-700">{step.result}</p>
        )}
        {step.error && (
          <p className="mt-1 rounded-md border border-red-200 bg-red-50 px-2 py-1 font-mono text-[11px] text-red-700">
            {step.error}
          </p>
        )}
      </div>
    </li>
  )
}

function StepTimeline({ steps }: { steps: Step[] }) {
  return (
    <ol className="mt-1">
      {steps.map((s, i) => (
        <StepNode key={s.label + i} step={s} last={i === steps.length - 1} />
      ))}
    </ol>
  )
}

/* Screenshot lightbox ----------------------------------------------*/
function ScreenshotThumb({ label, onOpen }: { label: string; onOpen: () => void }) {
  return (
    <button
      onClick={onOpen}
      className="group flex aspect-video flex-col items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-elevated text-slate-400 transition-colors hover:border-brand-300 hover:text-brand-300"
    >
      <svg className="size-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
        <rect x="3" y="5" width="18" height="14" rx="2" />
        <circle cx="9" cy="10" r="1.6" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 18l5-5 3 3 3.5-3.5 3.5 3.5" />
      </svg>
      <span className="px-2 text-center text-[11px]">{label}</span>
    </button>
  )
}

function Lightbox({ label, onClose }: { label: string; onClose: () => void }) {
  const { t } = useLang()
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-6" onClick={onClose}>
      <div className="absolute inset-0 bg-[#020a16]/80 backdrop-blur-sm" />
      <div className="relative w-full max-w-3xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between pb-2">
          <span className="text-[13px] font-medium text-white">{label}</span>
          <button
            onClick={onClose}
            className="rounded-md p-1.5 text-slate-300 hover:bg-white/10 hover:text-white"
            aria-label={t("common.close")}
          >
            <svg className="size-5" viewBox="0 0 20 20" fill="currentColor">
              <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
            </svg>
          </button>
        </div>
        <div className="flex aspect-video items-center justify-center rounded-xl border border-slate-700 bg-elevated text-slate-500">
          <div className="flex flex-col items-center gap-2">
            <svg className="size-10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4">
              <rect x="3" y="5" width="18" height="14" rx="2" />
              <circle cx="9" cy="10" r="1.6" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 18l5-5 3 3 3.5-3.5 3.5 3.5" />
            </svg>
            <span className="text-[12px]">{label}</span>
          </div>
        </div>
      </div>
    </div>
  )
}

/* Cancel confirmation ----------------------------------------------*/
function CancelConfirm({ onConfirm, onClose }: { onConfirm: () => void; onClose: () => void }) {
  const { t } = useLang()
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-[#020a16]/70 backdrop-blur-sm" onClick={onClose} />
      <Card className="relative w-full max-w-sm p-5">
        <div className="flex items-start gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-red-50 text-error">
            <svg className="size-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 9v4m0 4h.01M10.3 3.9L2 18a2 2 0 001.7 3h16.6a2 2 0 001.7-3L13.7 3.9a2 2 0 00-3.4 0z"
              />
            </svg>
          </span>
          <div>
            <h3 className="font-display text-base font-bold text-navy">{t("run.cancelModalTitle")}</h3>
            <p className="mt-1 text-[13px] text-slate-500">
              {t("run.cancelModalDesc")}
            </p>
          </div>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="secondary" size="sm" onClick={onClose}>
            {t("autrun.keepRunning")}
          </Button>
          <Button variant="danger" size="sm" onClick={onConfirm}>
            {t("autrun.cancelRun")}
          </Button>
        </div>
      </Card>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Live execution banner                                              */
/* ------------------------------------------------------------------ */
function LiveBanner({
  liveDuration,
  currentTest,
  currentStep,
  progress,
}: {
  liveDuration: string
  currentTest?: string
  currentStep?: string
  progress?: number
}) {
  const { t } = useLang()
  return (
    <div className="overflow-hidden rounded-[var(--radius-card)] border border-brand-200 bg-brand-50">
      {/* Top bar */}
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
          {liveDuration}
        </span>
      </div>

      {/* Current test / step */}
      {(currentTest || currentStep) && (
        <div className="border-t border-brand-200 bg-brand-100/30 px-4 py-2.5">
          <div className="flex flex-wrap gap-x-8 gap-y-1.5">
            {currentTest && (
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-brand-300/70">
                  {t("run.currentTest")}
                </p>
                <p className="mt-0.5 font-mono text-[13px] font-medium text-brand-300">
                  {currentTest}
                </p>
              </div>
            )}
            {currentStep && (
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-brand-300/70">
                  {t("run.currentStep")}
                </p>
                <p className="mt-0.5 text-[13px] font-medium text-brand-300">{currentStep}</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Progress bar */}
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
/* Run Detail page                                                    */
/* ------------------------------------------------------------------ */
export function RunDetail({
  run,
  onBack,
  onCancel,
  onRunAgain,
  onRetryAi,
  aiRetrying = false,
  onViewAiAnalysis,
  backLabel,
}: {
  run: Run
  onBack: () => void
  onCancel: () => void
  /** Present only when this run can be re-executed against the same flow endpoint. */
  onRunAgain?: () => void
  /** Present only when the backend supports (re)triggering this run's AI analysis. */
  onRetryAi?: () => void
  aiRetrying?: boolean
  /** Deep-link into the AI Analysis page for this run's report. */
  onViewAiAnalysis?: () => void
  backLabel?: string
}) {
  const { t } = useLang()
  const [openTest, setOpenTest] = useState<string | null>(null)
  const [shot, setShot] = useState<string | null>(null)
  const [confirmCancel, setConfirmCancel] = useState(false)
  const [logsOpen, setLogsOpen] = useState(false)

  const running = run.status === "RUNNING"
  const failed = run.status === "FAILED"
  const cancelled = run.status === "CANCELLED"
  const passed = run.status === "PASS"

  const passedCount = run.tests.filter((t) => t.status === "PASS").length
  const liveDuration = useLiveTimer(running, run.duration)

  const headerIconBg = failed
    ? "bg-red-50 text-error"
    : running
      ? "bg-brand-50 text-brand-400"
      : passed
        ? "bg-emerald-50 text-success"
        : "bg-slate-100 text-slate-400" // CANCELLED and UNKNOWN stay neutral

  return (
    <div className="space-y-6">
      {/* Back link */}
      <button
        onClick={onBack}
        className="inline-flex items-center gap-1.5 text-[13px] font-medium text-slate-400 transition-colors hover:text-brand-300"
      >
        <svg className="size-4 rtl:-scale-x-100" viewBox="0 0 20 20" fill="currentColor">
          <path
            fillRule="evenodd"
            d="M12.7 15.3a1 1 0 01-1.4 0l-4.5-4.6a1 1 0 010-1.4l4.5-4.6a1 1 0 111.4 1.4L8.9 10l3.8 3.9a1 1 0 010 1.4z"
          />
        </svg>
        {backLabel ?? t("history.backToHistory")}
      </button>

      {/* Run header */}
      <Card className="p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-3.5">
            <span
              className={cx(
                "flex size-11 shrink-0 items-center justify-center rounded-xl",
                headerIconBg,
              )}
            >
              <StatusIcon status={run.status} className="size-6" />
            </span>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2.5">
                <h1 className="font-display text-xl font-bold tracking-tight text-navy">
                  {run.flow}
                </h1>
                {run.isPackage && (
                  <span className="rounded-full bg-brand-50 px-2 py-0.5 text-[11px] font-semibold text-brand-300">
                    {t("history.packageBadge")} · {t("run.testsCount", { count: run.tests.length })}
                  </span>
                )}
                <StatusBadge status={run.status} />
              </div>

              {/* Metadata row */}
              <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-slate-400">
                <span className="font-mono text-slate-500">{run.id}</span>
                <span className="text-slate-300">·</span>
                <TriggerTag trigger={run.trigger} />
                <span className="text-slate-300">·</span>
                <span>{t("run.startedAt", { time: run.started })}</span>
                <span className="text-slate-300">·</span>
                <span className="font-mono tabular-nums">
                  {running ? liveDuration : run.duration}
                </span>
                {running && (
                  <span className="inline-flex items-center gap-1 font-semibold text-brand-300">
                    <span className="size-1.5 animate-pulse rounded-full bg-brand-600" />
                    {t("run.live")}
                  </span>
                )}
              </div>
              {run.status === "UNKNOWN" && (
                <p className="mt-1.5 text-[12px] font-medium text-slate-400">
                  {t("run.unknownStatusNote")}
                </p>
              )}
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2">
            {running && run.cancellable && (
              <Button variant="danger" size="sm" onClick={() => setConfirmCancel(true)}>
                <svg className="size-3.5" viewBox="0 0 20 20" fill="currentColor">
                  <path
                    fillRule="evenodd"
                    d="M10 18a8 8 0 100-16 8 8 0 000 16zM6.5 9a1 1 0 000 2h7a1 1 0 100-2h-7z"
                  />
                </svg>
                {t("autrun.cancelRun")}
              </Button>
            )}
            {!running && !cancelled && onRunAgain && (
              <Button variant="secondary" size="sm" onClick={onRunAgain}>
                {t("run.runAgain")}
              </Button>
            )}
            {(passed || failed) && run.hasScreenshot && (
              <Button variant="ghost" size="sm" onClick={() => {}}>
                {t("run.viewScreenshots")}
              </Button>
            )}
          </div>
        </div>
      </Card>

      {/* Two-column layout */}
      <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
        {/* Main column */}
        <div className="order-2 space-y-6 lg:order-1">
          {/* Live execution banner */}
          {running && (
            <LiveBanner
              liveDuration={liveDuration}
              currentTest={run.currentTest}
              currentStep={run.currentStep}
              progress={run.progress}
            />
          )}

          {/* Tests */}
          <Card className="p-5">
            <h2 className="font-display text-sm font-bold text-navy">
              {t("table.tests")} ({run.tests.length})
            </h2>
            <div className="mt-3 divide-y divide-slate-100 overflow-hidden rounded-lg border border-slate-200">
              {run.tests.map((test) => {
                const expanded = openTest === test.name
                const hasSteps = !!test.steps?.length
                return (
                  <div key={test.name}>
                    <button
                      onClick={() => hasSteps && setOpenTest(expanded ? null : test.name)}
                      className={cx(
                        "flex w-full items-center gap-3 px-3.5 py-2.5 text-start",
                        hasSteps && "hover:bg-slate-50",
                      )}
                    >
                      <span className={statusTone(test.status)}>
                        <StatusIcon status={test.status} className="size-4" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-mono text-[13px] text-slate-700">
                          {test.name}
                        </span>
                        <span className="block text-[11px] text-slate-400">{test.suite}</span>
                      </span>
                      <span className="shrink-0 font-mono text-[12px] text-slate-400">
                        {test.duration}
                      </span>
                      {hasSteps && (
                        <svg
                          className={cx(
                            "size-4 shrink-0 text-slate-400 transition-transform",
                            expanded && "rotate-180",
                          )}
                          viewBox="0 0 20 20"
                          fill="currentColor"
                        >
                          <path
                            fillRule="evenodd"
                            d="M5.3 7.3a1 1 0 011.4 0L10 10.6l3.3-3.3a1 1 0 111.4 1.4l-4 4a1 1 0 01-1.4 0l-4-4a1 1 0 010-1.4z"
                          />
                        </svg>
                      )}
                    </button>
                    {expanded && test.steps && (
                      <div className="border-t border-slate-100 bg-elevated px-4 py-3">
                        <StepTimeline steps={test.steps} />
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </Card>

          {/* Step / action timeline */}
          {run.stepList && run.stepList.length > 0 && (
            <Card className="p-5">
              <h2 className="font-display text-sm font-bold text-navy">{t("run.executionTimeline")}</h2>
              <div className="mt-3">
                <StepTimeline steps={run.stepList} />
              </div>
            </Card>
          )}

          {/* Failure details */}
          {failed && (
            <Card className="border-red-200 p-5">
              <div className="flex items-center gap-2 pb-3">
                <span className="text-error">
                  <StatusIcon status="FAILED" className="size-5" />
                </span>
                <h2 className="font-display text-sm font-bold text-red-700">{t("run.failureDetails")}</h2>
              </div>

              {/* Failure summary */}
              <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-red-500">
                  {t("run.failureStep")}
                </p>
                <p className="mt-1 text-[13px] leading-relaxed text-slate-600">{run.reason}</p>
              </div>

              {/* Error message */}
              {run.error && (
                <div className="mt-3">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                    {t("run.errorMessage")}
                  </p>
                  <div className="mt-1.5 rounded-lg border border-slate-200 bg-elevated px-3.5 py-3">
                    <p className="font-mono text-[12px] leading-relaxed text-red-600">{run.error}</p>
                  </div>
                </div>
              )}

              {/* Per-test failures from GET /dashboard-api/runs/{runId}/failures */}
              {run.failureDetails && run.failureDetails.length > 0 && (
                <div className="mt-3">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                    {t("run.failedTests")}
                  </p>
                  <div className="mt-1.5 space-y-2">
                    {run.failureDetails.map((f, i) => (
                      <div key={`${f.test}-${i}`} className="rounded-lg border border-red-200 bg-elevated px-3.5 py-3">
                        <p className="font-mono text-[12px] font-semibold text-navy">{f.test}</p>
                        <p className="mt-1 font-mono text-[12px] leading-relaxed text-red-600">{f.message}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Failed step + timestamp */}
              {(run.failedStep || run.failedAt) && (
                <div className="mt-3 grid grid-cols-2 gap-4">
                  {run.failedStep && (
                    <DetailField label={t("run.failedStepLabel")}>{run.failedStep}</DetailField>
                  )}
                  {run.failedAt && <DetailField label={t("run.timestamp")}>{run.failedAt}</DetailField>}
                </div>
              )}

              {/* Screenshots in failure context */}
              {run.hasScreenshot && run.screenshots?.length ? (
                <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
                  {run.screenshots.map((s) => (
                    <ScreenshotThumb key={s} label={s} onOpen={() => setShot(s)} />
                  ))}
                </div>
              ) : null}
            </Card>
          )}

          {/* Screenshots (non-failure) */}
          {!failed && run.hasScreenshot && run.screenshots?.length ? (
            <Card className="p-5">
              <h2 className="font-display text-sm font-bold text-navy">{t("run.screenshots")}</h2>
              <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
                {run.screenshots.map((s) => (
                  <ScreenshotThumb key={s} label={s} onOpen={() => setShot(s)} />
                ))}
              </div>
            </Card>
          ) : null}

          {/* Execution logs */}
          {run.logs && run.logs.length > 0 && (
            <Card className="overflow-hidden">
              <button
                onClick={() => setLogsOpen((v) => !v)}
                className="flex w-full items-center justify-between px-5 py-4 text-start"
              >
                <span className="flex items-center gap-2 font-display text-sm font-bold text-navy">
                  <svg
                    className="size-4 text-slate-400"
                    viewBox="0 0 20 20"
                    fill="currentColor"
                  >
                    <path
                      fillRule="evenodd"
                      d="M3 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1z"
                    />
                  </svg>
                  {t("run.executionLogs")}
                  <span className="rounded-full bg-slate-100 px-1.5 py-0.5 font-mono text-[10px] font-medium text-slate-500">
                    {run.logs.length}
                  </span>
                </span>
                <svg
                  className={cx(
                    "size-4 text-slate-400 transition-transform",
                    logsOpen && "rotate-180",
                  )}
                  viewBox="0 0 20 20"
                  fill="currentColor"
                >
                  <path
                    fillRule="evenodd"
                    d="M5.3 7.3a1 1 0 011.4 0L10 10.6l3.3-3.3a1 1 0 111.4 1.4l-4 4a1 1 0 01-1.4 0l-4-4a1 1 0 010-1.4z"
                  />
                </svg>
              </button>
              {logsOpen && (
                <div className="border-t border-slate-100 bg-elevated">
                  <div className="space-y-0.5 px-5 py-4 font-mono text-[12px] leading-relaxed">
                    {run.logs.map((l, i) => (
                      <div key={i} className="flex gap-3 py-0.5">
                        <span className="w-14 shrink-0 text-slate-400">{l.time}</span>
                        <span
                          className={cx(
                            "w-12 shrink-0 font-semibold",
                            l.level === "ERROR"
                              ? "text-error"
                              : l.level === "WARN"
                                ? "text-amber-600"
                                : l.level === "DEBUG"
                                  ? "text-slate-400"
                                  : "text-brand-400",
                          )}
                        >
                          {l.level}
                        </span>
                        <span className="text-slate-600">{l.message}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </Card>
          )}
        </div>

        {/* Secondary column */}
        <div className="order-1 space-y-6 lg:order-2">
          {/* Execution summary */}
          <Card className="p-5">
            <h2 className="font-display text-sm font-bold text-navy">{t("run.executionSummary")}</h2>

            {/* Status + duration */}
            <div className="mt-3 grid grid-cols-2 gap-3">
              <SummaryStat label={t("table.tests")} value={run.tests.length} />
              <SummaryStat
                label={t("status.passed")}
                value={passedCount}
                tone={passedCount === run.tests.length ? "default" : undefined}
              />
              <SummaryStat
                label={t("status.failed")}
                value={run.failures}
                tone={run.failures > 0 ? "error" : "default"}
              />
              <SummaryStat label={t("run.stepsLabel")} value={run.steps} />
            </div>

            {/* Detail fields */}
            <div className="mt-4 space-y-3 border-t border-slate-100 pt-4">
              <DetailField label={t("table.status")}>
                {cancelled
                  ? t("status.cancelled")
                  : passed
                    ? t("status.passed")
                    : failed
                      ? t("status.failed")
                      : running
                        ? t("status.running")
                        : t("status.unknown")}
              </DetailField>
              <DetailField label={t("table.duration")}>
                {running ? liveDuration : run.duration}
              </DetailField>
              <DetailField label={t("run.client")}>{run.client}</DetailField>
              <DetailField label={t("table.trigger")}>{t(triggerLabelKey(run.trigger))}</DetailField>
              <DetailField label={t("run.startTime")}>{run.startedFull}</DetailField>
              {!running && <DetailField label={t("run.endTime")}>{run.endedFull}</DetailField>}
              {run.assertions != null && <DetailField label={t("run.assertions")}>{run.assertions}</DetailField>}
            </div>
          </Card>

          {/* AI analysis — informational only; never affects execution status. */}
          {run.hasAi && run.ai && (
            <AiAnalysisCard
              status={run.ai.status}
              report={run.ai.report ?? null}
              retryable={run.ai.retryable ?? false}
              retrying={aiRetrying}
              onRetry={onRetryAi}
              onViewFull={run.ai.status === "COMPLETED" && run.ai.report ? onViewAiAnalysis : undefined}
            />
          )}
        </div>
      </div>

      {shot && <Lightbox label={shot} onClose={() => setShot(null)} />}
      {confirmCancel && (
        <CancelConfirm
          onClose={() => setConfirmCancel(false)}
          onConfirm={() => {
            setConfirmCancel(false)
            onCancel()
          }}
        />
      )}
    </div>
  )
}

export default RunDetail
