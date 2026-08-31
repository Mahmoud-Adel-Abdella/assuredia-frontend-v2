import React from "react"
import { useLang } from "../lib/i18n"
import { cx } from "./primitives"
import type { ParsedAiReport } from "../lib/aiAnalysis"

/* ------------------------------------------------------------------ */
/* Shared run types                                                   */
/* ------------------------------------------------------------------ */
/**
 * "UNKNOWN" is a safe neutral state for rows whose backend status the frozen
 * engine does not define today — the UI must never pass an unrecognized
 * status off as a known one (e.g. by rendering it as Running).
 */
export type RunStatus = "PASS" | "FAILED" | "RUNNING" | "CANCELLED" | "UNKNOWN"
/**
 * "Unknown" covers legacy rows persisted before the frozen backend tracked
 * a trigger source (its compatibility path reports 'UNKNOWN').
 */
export type Trigger = "Manual" | "Scheduled" | "Unknown"
export type StepStatus = "done" | "current" | "pending" | "failed"

export type ChildTest = {
  name: string
  suite: string
  status: RunStatus
  duration: string
  steps?: Step[]
}

export type Step = {
  label: string
  status: StepStatus
  duration?: string
  action?: string
  result?: string
  error?: string
}

export type LogLine = {
  time: string
  level: "INFO" | "WARN" | "ERROR" | "DEBUG"
  message: string
}

/**
 * AI reliability analysis state of an execution (Phase 8). Mirrors the
 * frozen backend's lifecycle: NOT_STARTED | ANALYZING | COMPLETED | FAILED |
 * DISABLED | RATE_LIMITED (unknown values are tolerated and treated as
 * non-terminal). AI output is informational only — it never changes the
 * execution, test, alert, or automation status.
 */
export type RunAi = {
  status: string
  /** Present only when the backend stored a report that parsed successfully. */
  report?: ParsedAiReport | null
  /**
   * True only when the frozen backend supports (re)triggering the analysis
   * for this execution — single test_runs via POST /runs/{runId}/analyze.
   * Package executions have no retry endpoint and stay false.
   */
  retryable?: boolean
}

export type Run = {
  id: string
  flow: string
  isPackage: boolean
  testLabel: string
  tests: ChildTest[]
  trigger: Trigger
  started: string
  startedFull: string
  endedFull: string
  duration: string
  status: RunStatus
  client: string
  steps: number
  /** Not provided by the frozen backend for live runs — omitted, and the field is hidden. */
  assertions?: number
  failures: number
  reason?: string
  error?: string
  /** Per-test failures from GET /dashboard-api/runs/{runId}/failures (sanitized). */
  failureDetails?: { test: string; message: string }[]
  failedStep?: string
  failedAt?: string
  /** True when the run carries an AI analysis state worth surfacing. */
  hasAi: boolean
  hasScreenshot: boolean
  progress?: number
  currentTest?: string
  currentStep?: string
  stepList?: Step[]
  logs?: LogLine[]
  ai?: RunAi
  screenshots?: string[]
  cancellable?: boolean
}

/* ------------------------------------------------------------------ */
/* Status + trigger visuals (never color-only)                        */
/* ------------------------------------------------------------------ */
export function StatusIcon({ status, className }: { status: RunStatus; className?: string }) {
  if (status === "PASS") {
    return (
      <svg className={className} viewBox="0 0 20 20" fill="currentColor">
        <path
          fillRule="evenodd"
          d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.7-9.3a1 1 0 00-1.4-1.4L9 10.6 7.7 9.3a1 1 0 00-1.4 1.4l2 2a1 1 0 001.4 0l4-4z"
        />
      </svg>
    )
  }
  if (status === "FAILED") {
    return (
      <svg className={className} viewBox="0 0 20 20" fill="currentColor">
        <path
          fillRule="evenodd"
          d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.7 7.3a1 1 0 00-1.4 1.4L8.6 10l-1.3 1.3a1 1 0 101.4 1.4L10 11.4l1.3 1.3a1 1 0 001.4-1.4L11.4 10l1.3-1.3a1 1 0 00-1.4-1.4L10 8.6 8.7 7.3z"
        />
      </svg>
    )
  }
  if (status === "CANCELLED") {
    return (
      <svg className={className} viewBox="0 0 20 20" fill="currentColor">
        <path
          fillRule="evenodd"
          d="M10 18a8 8 0 100-16 8 8 0 000 16zM6.5 9a1 1 0 000 2h7a1 1 0 100-2h-7z"
        />
      </svg>
    )
  }
  if (status === "UNKNOWN") {
    return (
      <svg className={className} viewBox="0 0 20 20" fill="currentColor">
        <path
          fillRule="evenodd"
          d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-8-3a1 1 0 00-.867.5 1 1 0 11-1.731-1A3 3 0 0113 8a3.001 3.001 0 01-2 2.83V11a1 1 0 11-2 0v-1a1 1 0 011-1 1 1 0 100-2zm0 8a1 1 0 100-2 1 1 0 000 2z"
          clipRule="evenodd"
        />
      </svg>
    )
  }
  return (
    <svg className={className} viewBox="0 0 20 20" fill="currentColor">
      <path d="M11 2L4 11h4l-1 7 7-9h-4l1-7z" />
    </svg>
  )
}

export function StatusBadge({ status, label }: { status: RunStatus; label?: string }) {
  const { t } = useLang()
  const map: { text: string; bg: string; ring: string; dot: string; labelKey: string } = {
    PASS: { text: "text-emerald-700", bg: "bg-emerald-50", ring: "ring-emerald-600/10", dot: "bg-success", labelKey: "status.passed" },
    FAILED: { text: "text-red-700", bg: "bg-red-50", ring: "ring-red-600/10", dot: "bg-error", labelKey: "status.failed" },
    RUNNING: { text: "text-brand-300", bg: "bg-brand-50", ring: "ring-brand-700/10", dot: "bg-brand-700 animate-pulse", labelKey: "status.running" },
    CANCELLED: { text: "text-slate-500", bg: "bg-slate-100", ring: "ring-slate-400/10", dot: "bg-slate-400", labelKey: "status.cancelled" },
    // Neutral on purpose: the backend returned a status this UI has no name for.
    UNKNOWN: { text: "text-slate-600", bg: "bg-slate-50", ring: "ring-slate-400/25", dot: "bg-slate-300", labelKey: "status.unknown" },
  }[status]
  return (
    <span
      className={cx(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide ring-1 ring-inset",
        map.bg,
        map.text,
        map.ring,
      )}
    >
      <span className={cx("size-1.5 rounded-full", map.dot)} />
      {label ?? t(map.labelKey)}
    </span>
  )
}

export function statusTone(status: RunStatus) {
  return status === "PASS"
    ? "text-success"
    : status === "FAILED"
      ? "text-error"
      : status === "CANCELLED" || status === "UNKNOWN"
        ? "text-slate-400"
        : "text-brand-400"
}

/** Trigger token → display label key (backend tokens stay untouched). */
export function triggerLabelKey(trigger: Trigger): string {
  return trigger === "Manual" ? "trigger.manual" : trigger === "Scheduled" ? "trigger.scheduled" : "trigger.unknown"
}

export function TriggerTag({ trigger }: { trigger: Trigger }) {
  const { t } = useLang()
  const scheduled = trigger === "Scheduled"
  const labelKey = triggerLabelKey(trigger)
  return (
    <span className="inline-flex items-center gap-1.5 text-[12px] font-medium text-slate-500">
      <svg className="size-3.5 text-slate-400" viewBox="0 0 20 20" fill="currentColor">
        {scheduled ? (
          <path
            fillRule="evenodd"
            d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.3.7l2.5 2.5a1 1 0 001.4-1.4L11 9.6V6z"
          />
        ) : (
          <path d="M11 2L4 11h4l-1 7 7-9h-4l1-7z" />
        )}
      </svg>
      {t(labelKey)}
    </span>
  )
}
