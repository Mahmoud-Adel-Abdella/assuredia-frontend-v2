/**
 * AI Analysis page (Phase 8 revision).
 *
 * Implements the recovered Figma "AI Reliability Intelligence" design with
 * REAL backend data only. There is NO demo data: a record exists only
 * because a run row carries a stored AI report (or a package row is
 * genuinely ANALYZING right now).
 *
 * Data source (verified in src/lib/api.ts):
 *   GET /dashboard-api/clients/{id}/runs — SINGLE rows expose `ai_report`
 *   when an analysis finished; PACKAGE rows expose `analysis_status` plus
 *   `ai_report`. Single rows have no analysis_status, so presence of a
 *   report is the only list-level signal for them.
 *
 * Field honesty rules enforced here (mapping in src/lib/aiAnalysis.ts):
 *   - Risk level ← report.severity (real backend value).
 *   - Reliability score ← 100 − report.riskScore.score. The backend exposes
 *     a RISK score (0 = perfect, 100 = critical failure); reliability is the
 *     anchored complement on that same scale — derived, never invented. The
 *     raw risk score is displayed next to it.
 *   - Trend ← report.trend / report.history / report.trendScore (single
 *     runs). Package reports carry none of these → "Insufficient historical
 *     data" (a valid state, not an error).
 *   - Browser insight ← report.browserInsight (single runs only).
 *   - Business impact / assessment / actions ← report text fields.
 *   - Failure context ← Phase 4 execution evidence (run error message,
 *     sanitized per-test failures, package item messages) — AI interprets
 *     the evidence; it never replaces it.
 *   - The backend exposes no AI provider/model — no provider branding is
 *     shown anywhere in the runtime UI.
 *   - The backend exposes no per-analysis timestamp — the run time stands
 *     in for it (labeled "Analyzed" per the design).
 *   - The backend exposes no screenshots through the sanitized API — the
 *     section is omitted rather than faked.
 *   - The page auto-refreshes (10 s) ONLY while a package analysis is
 *     really in flight; nothing is simulated in between.
 *   - AI output never changes the execution status — it is rendered
 *     alongside it, sourced from the same run row.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Button, Card, ErrorState, Skeleton, cx } from "./primitives"
import { WorkspaceHeader } from "./WorkspaceHeader"
import { StatusBadge, type RunStatus } from "./runShared"
import {
  ApiError,
  apiClientRuns,
  apiRunFailures,
  type DashboardPackageItem,
  type DashboardRun,
} from "../lib/api"
import { useAuth } from "../lib/auth"
import { langLocale, translate, useLang } from "../lib/i18n"
import { parseBackendTimestamp, relativeTime } from "../lib/dashboardData"
import { mapHistoryStatus } from "../lib/runHistory"
import { formatDurationSeconds } from "../lib/runData"
import {
  parseAiReport,
  reportActions,
  reportAssessment,
  reportBrowserInsight,
  reportImpact,
  reportImpactCategory,
  reportReliabilityScore,
  reportRiskLevel,
  reportRiskScore,
  reportTrend,
  type ParsedAiReport,
  type RiskLevel,
  type TrendDirection,
  type TrendView,
} from "../lib/aiAnalysis"

/* ------------------------------------------------------------------ */
/* Record model — derived from backend run rows only                   */
/* ------------------------------------------------------------------ */
type AiRecord = {
  /** Stable record id: run_id for single runs, execution_id for packages
      (identical to Run History, so "Open Run" deep-links resolve). */
  id: string
  isPackage: boolean
  flow: string
  /** Authoritative execution status — the AI result never changes it. */
  runStatus: RunStatus
  /** True while the backend reports ANALYZING and no report is stored yet. */
  analyzing: boolean
  report: ParsedAiReport | null
  risk: RiskLevel | null
  /** Derived: 100 − riskScore (backend risk scale: 0 = perfect). */
  reliabilityScore: number | null
  /** Backend risk score 0–100, shown alongside the derived reliability. */
  riskScore: number | null
  trend: TrendView | null
  browserInsight: { browser?: string; pattern: string } | null
  impact: string | null
  impactCategory: string | null
  assessment: string | null
  actions: string[]
  /** Run timestamp — the backend exposes no separate "analyzed at" field. */
  at: Date | null
  durationSeconds: number | null
  browser: string | null
  /** SINGLE rows: sanitized top-level run error message. */
  errorMessage: string | null
  /** PACKAGE rows: failed child items with their backend messages. */
  failedItems: { flow: string; message: string | null }[]
  /** Execution counts from the run row (execution data, not AI data). */
  counts: { total: number | null; passed: number | null; failed: number | null; skipped: number | null }
}

function failedPackageItems(items: DashboardPackageItem[] | undefined): { flow: string; message: string | null }[] {
  if (!Array.isArray(items)) return []
  const out: { flow: string; message: string | null }[] = []
  for (const item of items) {
    if (String(item.status ?? "").toUpperCase() === "FAILED") {
      out.push({ flow: item.flow ?? translate("table.flow"), message: item.message?.trim() || null })
    }
  }
  return out
}

function toAiRecord(row: DashboardRun): AiRecord | null {
  const isPackage = row.type === "PACKAGE" || typeof row.id === "string"
  const report = parseAiReport(row.ai_report)
  const analyzing =
    isPackage && String(row.analysis_status ?? "").toUpperCase() === "ANALYZING" && report == null
  // A row without a stored report and without an in-flight analysis is not
  // an AI record — it is never shown here (DISABLED/FAILED/NOT_STARTED
  // analyses surface in Run Detail instead, where the run is the subject).
  if (!report && !analyzing) return null
  const runStatus = mapHistoryStatus(row.status) ?? "UNKNOWN"
  return {
    id: isPackage ? String(row.id) : (row.run_id ?? String(row.id)),
    isPackage,
    flow: isPackage
      ? (row.package_name ?? row.flow_name ?? translate("run.packageRun"))
      : (row.flow_name ?? translate("run.flowRun")),
    runStatus,
    analyzing,
    report,
    risk: report ? reportRiskLevel(report) : null,
    reliabilityScore: report ? reportReliabilityScore(report) : null,
    riskScore: report ? reportRiskScore(report) : null,
    trend: report ? reportTrend(report) : null,
    browserInsight: report ? reportBrowserInsight(report) : null,
    impact: report ? reportImpact(report) : null,
    impactCategory: report ? reportImpactCategory(report) : null,
    assessment: report ? reportAssessment(report) : null,
    actions: report ? reportActions(report) : [],
    at: parseBackendTimestamp(row.timestamp),
    durationSeconds:
      typeof row.duration_seconds === "number" && Number.isFinite(row.duration_seconds)
        ? row.duration_seconds
        : null,
    browser: typeof row.browser === "string" && row.browser.trim() ? row.browser.trim() : null,
    errorMessage:
      typeof row.error_message === "string" && row.error_message.trim() ? row.error_message.trim() : null,
    failedItems: failedPackageItems(row.packageItems),
    counts: {
      total: typeof row.total === "number" ? row.total : null,
      passed: typeof row.passed === "number" ? row.passed : null,
      failed: typeof row.failed === "number" ? row.failed : null,
      skipped: typeof row.skipped === "number" ? row.skipped : null,
    },
  }
}

/** Absolute label matching the design's "Aug 24, 2026 · 18:00" shape. */
function absoluteTime(date: Date | null): string {
  if (!date) return "—"
  const locale = langLocale()
  const day = date.toLocaleDateString(locale, { month: "short", day: "numeric", year: "numeric" })
  const time = date.toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit", hour12: false })
  return `${day} · ${time}`
}

/** Unknown report field → displayable strings (drops everything else). */
function toTextList(value: unknown): string[] {
  if (typeof value === "string") return value.trim() ? [value.trim()] : []
  if (!Array.isArray(value)) return []
  const out: string[] = []
  for (const item of value) {
    if (typeof item === "string" && item.trim()) out.push(item.trim())
  }
  return out
}

/* ------------------------------------------------------------------ */
/* Risk visuals (Figma risk system: color + icon + label)              */
/* ------------------------------------------------------------------ */
/** Backend risk tokens stay English; only the display label is translated. */
const RISK_LABEL_KEY: Record<RiskLevel, string> = {
  Critical: "ai.risk.critical",
  High: "ai.risk.high",
  Medium: "ai.risk.medium",
  Low: "ai.risk.low",
}

const TREND_LABEL_KEY: Record<TrendDirection, string> = {
  Stable: "ai.trend.stable",
  Improving: "ai.trend.improving",
  Degrading: "ai.trend.degrading",
  Recurring: "ai.trend.recurring",
  New: "ai.trend.new",
  Insufficient: "ai.trend.insufficient",
}

const CONFIDENCE_LABEL_KEY: Record<string, string> = {
  High: "ai.confidence.high",
  Medium: "ai.confidence.medium",
  Low: "ai.confidence.low",
}

/** Backend impact-category tokens → display label key (unknown tokens render as-is). */
const IMPACT_LABEL_KEY: Record<string, string> = {
  "Customer Access": "ai.impact.customerAccess",
  "Revenue Impact": "ai.impact.revenue",
  "Data Integrity": "ai.impact.dataIntegrity",
  Low: "ai.risk.low",
  None: "common.none",
}

type RiskStyle = { bg: string; text: string; ring: string; icon: string; dot: string }

function riskStyle(risk: RiskLevel): RiskStyle {
  return {
    Critical: {
      bg: "bg-red-50",
      text: "text-red-700",
      ring: "ring-red-600/10",
      icon: "text-error",
      dot: "bg-error",
    },
    High: {
      bg: "bg-amber-50",
      text: "text-amber-700",
      ring: "ring-amber-600/10",
      icon: "text-warning",
      dot: "bg-warning",
    },
    Medium: {
      bg: "bg-amber-50",
      text: "text-amber-600",
      ring: "ring-amber-500/10",
      icon: "text-amber-500",
      dot: "bg-amber-400",
    },
    Low: {
      bg: "bg-brand-50",
      text: "text-brand-300",
      ring: "ring-brand-600/10",
      icon: "text-brand-400",
      dot: "bg-brand-600",
    },
  }[risk]
}

function RiskBadge({ risk, size = "sm" }: { risk: RiskLevel; size?: "sm" | "md" }) {
  const { t } = useLang()
  const s = riskStyle(risk)
  return (
    <span
      className={cx(
        "inline-flex items-center gap-1.5 rounded-full ring-1 ring-inset font-semibold uppercase tracking-wide",
        s.bg, s.text, s.ring,
        size === "md" ? "px-3 py-1.5 text-[12px]" : "px-2.5 py-1 text-[11px]",
      )}
    >
      <RiskIcon risk={risk} className="size-3" />
      {t(RISK_LABEL_KEY[risk])}
    </span>
  )
}

function RiskIcon({ risk, className }: { risk: RiskLevel; className?: string }) {
  if (risk === "Critical") {
    return (
      <svg className={className} viewBox="0 0 20 20" fill="currentColor">
        <path
          fillRule="evenodd"
          d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 5zm0 9a1 1 0 100-2 1 1 0 000 2z"
        />
      </svg>
    )
  }
  if (risk === "High") {
    return (
      <svg className={className} viewBox="0 0 20 20" fill="currentColor">
        <path d="M10 2a8 8 0 100 16A8 8 0 0010 2zm0 3a.75.75 0 01.75.75v4.5a.75.75 0 01-1.5 0v-4.5A.75.75 0 0110 5zm0 9a1 1 0 100-2 1 1 0 000 2z" />
      </svg>
    )
  }
  if (risk === "Medium") {
    return (
      <svg className={className} viewBox="0 0 20 20" fill="currentColor">
        <path
          fillRule="evenodd"
          d="M10 18a8 8 0 100-16 8 8 0 000 16zM6.75 9.25a.75.75 0 000 1.5h6.5a.75.75 0 000-1.5h-6.5z"
        />
      </svg>
    )
  }
  return (
    <svg className={className} viewBox="0 0 20 20" fill="currentColor">
      <path
        fillRule="evenodd"
        d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 10-2 0v4a1 1 0 102 0V6zm-1 7a1 1 0 100 2 1 1 0 000-2z"
      />
    </svg>
  )
}

/* ------------------------------------------------------------------ */
/* Reliability score — derived from the backend risk score             */
/* ------------------------------------------------------------------ */
function scoreColor(score: number): { stroke: string; text: string; labelKey: string } {
  if (score >= 90) return { stroke: "#22c55e", text: "text-success", labelKey: "ai.score.excellent" }
  if (score >= 70) return { stroke: "#3b82f6", text: "text-brand-400", labelKey: "ai.score.good" }
  if (score >= 40) return { stroke: "#f59e0b", text: "text-warning", labelKey: "ai.score.atRisk" }
  return { stroke: "#ef4444", text: "text-error", labelKey: "ai.score.low" }
}

function ReliabilityRing({ score, size = 80 }: { score: number; size?: number }) {
  const r = (size - 12) / 2
  const circ = 2 * Math.PI * r
  const fill = (Math.max(0, Math.min(100, score)) / 100) * circ
  const c = scoreColor(score)
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="shrink-0 -rotate-90">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#e2e8f0" strokeWidth="6" />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke={c.stroke}
        strokeWidth="6"
        strokeDasharray={`${fill} ${circ}`}
        strokeLinecap="round"
        style={{ transition: "stroke-dasharray 0.6s ease" }}
      />
    </svg>
  )
}

function ReliabilityScore({ score, compact = false }: { score: number; compact?: boolean }) {
  const { t } = useLang()
  const c = scoreColor(score)
  if (compact) {
    return (
      <div className="flex items-center gap-2">
        <ReliabilityRing score={score} size={44} />
        <div>
          <p className={cx("font-display text-xl font-bold leading-none", c.text)}>
            {score}
            <span className="text-[13px] font-normal text-slate-400">/100</span>
          </p>
          <p className="mt-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-400">{t(c.labelKey)}</p>
        </div>
      </div>
    )
  }
  return (
    <div className="flex items-center gap-3.5">
      <div className="relative shrink-0">
        <ReliabilityRing score={score} size={72} />
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <p className={cx("font-display text-[20px] font-bold leading-none", c.text)}>{score}</p>
          <p className="text-[9px] text-slate-400">/ 100</p>
        </div>
      </div>
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{t("ai.reliability")}</p>
        <p className={cx("mt-0.5 font-display text-base font-bold", c.text)}>{t(c.labelKey)}</p>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Trend visuals                                                       */
/* ------------------------------------------------------------------ */
function trendColors(dir: TrendDirection): { bg: string; text: string; ring: string } {
  if (dir === "Stable" || dir === "Improving") {
    return { bg: "bg-emerald-50", text: "text-emerald-700", ring: "ring-emerald-600/10" }
  }
  if (dir === "Degrading") return { bg: "bg-red-50", text: "text-red-700", ring: "ring-red-600/10" }
  if (dir === "Recurring") return { bg: "bg-amber-50", text: "text-amber-700", ring: "ring-amber-600/10" }
  if (dir === "New") return { bg: "bg-brand-50", text: "text-brand-300", ring: "ring-brand-600/10" }
  return { bg: "bg-slate-50", text: "text-slate-500", ring: "ring-slate-200" }
}

function TrendIcon({ dir, className }: { dir: TrendDirection; className?: string }) {
  if (dir === "Stable") {
    return (
      <svg className={className} viewBox="0 0 20 20" fill="currentColor">
        <path
          fillRule="evenodd"
          d="M3 10a.75.75 0 01.75-.75h10.638L10.23 5.29a.75.75 0 111.04-1.08l5.5 5.25a.75.75 0 010 1.08l-5.5 5.25a.75.75 0 11-1.04-1.08l4.158-3.96H3.75A.75.75 0 013 10z"
        />
      </svg>
    )
  }
  if (dir === "Improving") {
    return (
      <svg className={className} viewBox="0 0 20 20" fill="currentColor">
        <path
          fillRule="evenodd"
          d="M12.577 4.878a.75.75 0 01.919-.53l4.78 1.281a.75.75 0 01.531.919l-1.281 4.78a.75.75 0 01-1.449-.387l.81-3.022a19.407 19.407 0 00-5.594 5.203.75.75 0 01-1.139.093L7 10.06l-4.72 4.72a.75.75 0 01-1.06-1.061l5.25-5.25a.75.75 0 011.06 0l3.074 3.073a20.923 20.923 0 015.545-4.931l-3.042-.815a.75.75 0 01-.53-.918z"
        />
      </svg>
    )
  }
  if (dir === "Degrading") {
    return (
      <svg className={className} viewBox="0 0 20 20" fill="currentColor">
        <path
          fillRule="evenodd"
          d="M1.22 5.222a.75.75 0 011.06 0L7 9.942l3.768-3.769a.75.75 0 011.113.058 20.908 20.908 0 013.813 7.254l1.574-2.727a.75.75 0 011.3.75l-2.475 4.286a.75.75 0 01-.617.393l-4.69.3a.75.75 0 01-.1-1.495l2.95-.188a19.404 19.404 0 00-3.53-6.41L7 11.06 2.28 6.283a.75.75 0 010-1.061z"
        />
      </svg>
    )
  }
  if (dir === "Recurring") {
    return (
      <svg className={className} viewBox="0 0 20 20" fill="currentColor">
        <path
          fillRule="evenodd"
          d="M15.312 11.424a5.5 5.5 0 01-9.201 2.466l-.312-.311h2.433a.75.75 0 000-1.5H3.989a.75.75 0 00-.75.75v4.242a.75.75 0 001.5 0v-2.43l.31.31a7 7 0 0011.712-3.138.75.75 0 00-1.449-.39zm1.23-3.723a.75.75 0 00.219-.53V2.929a.75.75 0 00-1.5 0V5.36l-.31-.31A7 7 0 003.239 8.188a.75.75 0 101.448.389A5.5 5.5 0 0113.89 6.11l.311.31h-2.432a.75.75 0 000 1.5h4.243a.75.75 0 00.53-.219z"
        />
      </svg>
    )
  }
  if (dir === "New") {
    return (
      <svg className={className} viewBox="0 0 20 20" fill="currentColor">
        <path d="M11.983 1.907a.75.75 0 00-1.292-.657l-8.5 9.5A.75.75 0 002.75 12h6.572l-1.305 6.093a.75.75 0 001.292.657l8.5-9.5A.75.75 0 0017.25 8h-6.572l1.305-6.093z" />
      </svg>
    )
  }
  return (
    <svg className={className} viewBox="0 0 20 20" fill="currentColor">
      <path
        fillRule="evenodd"
        d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zM8.94 6.94a.75.75 0 11-1.061-1.061 3 3 0 112.871 5.026v.345a.75.75 0 01-1.5 0v-.5c0-.72.57-1.172 1.081-1.287A1.5 1.5 0 108.94 6.94zM10 15a1 1 0 100-2 1 1 0 000 2z"
      />
    </svg>
  )
}

function TrendChip({ trend }: { trend: TrendView }) {
  const { t } = useLang()
  const c = trendColors(trend.direction)
  return (
    <span
      className={cx(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1 ring-inset",
        c.bg, c.text, c.ring,
      )}
    >
      <TrendIcon dir={trend.direction} className="size-3" />
      {t(TREND_LABEL_KEY[trend.direction])}
      {trend.delta !== undefined && trend.direction !== "Insufficient" && (
        <span className="font-mono">{trend.delta > 0 ? "+" : ""}{trend.delta}</span>
      )}
    </span>
  )
}

/* ------------------------------------------------------------------ */
/* AI identity strip — no provider branding: the frozen backend does    */
/* not expose the AI provider or model through any API.                 */
/* ------------------------------------------------------------------ */
function AiIdentityBanner() {
  const { t } = useLang()
  return (
    <div className="flex items-center gap-2.5">
      <span className="flex size-7 items-center justify-center rounded-md bg-brand-50 text-brand-400">
        <svg className="size-4" viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 2l1.6 4.9L18.5 8.5 13.6 10 12 15l-1.6-5L5.5 8.5 10.4 6.9 12 2zM19 14l.9 2.6L22.5 17.5 20 18.4 19 21l-.9-2.6L15.5 17.5 18 16.6 19 14z" />
        </svg>
      </span>
      <div className="leading-tight">
        <p className="text-[12px] font-bold text-slate-700">{t("page.ai.eyebrow")}</p>
        <p className="text-[10px] text-slate-400">{t("page.ai.tagline")}</p>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Summary stat card                                                  */
/* ------------------------------------------------------------------ */
function StatCard({
  label,
  value,
  tone,
}: {
  label: string
  value: number
  tone: "slate" | "error" | "warning" | "brand"
}) {
  const dot = {
    slate: "bg-slate-300",
    error: "bg-error",
    warning: "bg-warning",
    brand: "bg-brand-600",
  }[tone]

  return (
    <Card className="px-4 py-3.5">
      <div className="flex items-center gap-1.5">
        <span className={cx("size-1.5 rounded-full", dot)} />
        <p className="text-[12px] font-medium text-slate-400">{label}</p>
      </div>
      <p className="mt-1.5 font-display text-2xl font-bold leading-none text-navy">{value}</p>
    </Card>
  )
}

/* ------------------------------------------------------------------ */
/* Failure context (execution evidence — Phase 4 data, not AI output)  */
/* ------------------------------------------------------------------ */
function FailureContext({ record }: { record: AiRecord }) {
  const { t } = useLang()
  const [failures, setFailures] = useState<{ test: string; message: string }[] | null>(null)
  const [failureError, setFailureError] = useState<string | null>(null)
  const [loadingFailures, setLoadingFailures] = useState(false)
  const requestRef = useRef(0)

  const loadFailures = useCallback(async () => {
    if (record.isPackage) return
    const reqId = ++requestRef.current
    setLoadingFailures(true)
    setFailureError(null)
    try {
      const rows = await apiRunFailures(record.id)
      if (requestRef.current !== reqId) return
      setFailures(rows.map((r) => ({ test: r.test_name, message: r.error_message })))
    } catch (err) {
      if (requestRef.current !== reqId) return
      setFailureError(
        err instanceof ApiError && err.message ? err.message : translate("ai.failuresLoadError"),
      )
    } finally {
      if (requestRef.current === reqId) setLoadingFailures(false)
    }
  }, [record.id, record.isPackage])

  useEffect(() => {
    if (!record.isPackage) void loadFailures()
  }, [record.isPackage, loadFailures])

  const hasAnyEvidence =
    record.errorMessage != null || record.failedItems.length > 0 || (failures?.length ?? 0) > 0

  return (
    <div className="space-y-3">
      {/* Row-level sanitized error (SINGLE rows) */}
      {record.errorMessage && (
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{t("run.errorMessage")}</p>
          <div className="mt-1.5 rounded-lg border border-red-200 bg-red-50 px-3.5 py-3">
            <p className="break-words font-mono text-[12px] leading-relaxed text-red-600">{record.errorMessage}</p>
          </div>
        </div>
      )}

      {/* Per-test failures (SINGLE rows, sanitized by the backend) */}
      {!record.isPackage &&
        (loadingFailures ? (
          <div className="space-y-2">
            <Skeleton className="h-12 w-full" rounded="md" />
            <Skeleton className="h-12 w-full" rounded="md" />
          </div>
        ) : failureError ? (
          <div className="rounded-lg border border-slate-200 bg-elevated px-4 py-3">
            <p className="text-[13px] text-slate-500">{failureError}</p>
            <button
              onClick={() => void loadFailures()}
              className="mt-1.5 text-[12px] font-semibold text-brand-300 hover:text-brand-400"
            >
              {t("common.retry")}
            </button>
          </div>
        ) : failures && failures.length > 0 ? (
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{t("run.failedTests")}</p>
            <div className="mt-1.5 space-y-2">
              {failures.map((f, i) => (
                <div key={`${f.test}-${i}`} className="rounded-lg border border-slate-200 bg-elevated px-3.5 py-3">
                  <p className="text-[12px] font-semibold text-slate-700">{f.test}</p>
                  {f.message.trim() && (
                    <p className="mt-1 break-words font-mono text-[12px] leading-relaxed text-slate-500">
                      {f.message}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </div>
        ) : null)}

      {/* Failed package items with their backend messages (PACKAGE rows) */}
      {record.isPackage && record.failedItems.length > 0 && (
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{t("ai.failedFlows")}</p>
          <div className="mt-1.5 space-y-2">
            {record.failedItems.map((item, i) => (
              <div key={`${item.flow}-${i}`} className="rounded-lg border border-slate-200 bg-elevated px-3.5 py-3">
                <p className="text-[12px] font-semibold text-slate-700">{item.flow}</p>
                {item.message && (
                  <p className="mt-1 break-words font-mono text-[12px] leading-relaxed text-slate-500">
                    {item.message}
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {!hasAnyEvidence && !loadingFailures && (
        <p className="text-[13px] text-slate-400">
          {t("ai.noFailureEvidence")}
        </p>
      )}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Detail view                                                        */
/* ------------------------------------------------------------------ */
function SectionCard({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <Card className="p-5">
      <div className="flex items-center gap-2 pb-3">
        {icon}
        <h2 className="font-display text-sm font-bold text-navy">{title}</h2>
      </div>
      {children}
    </Card>
  )
}

function UnavailableNote({ text }: { text: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-elevated px-4 py-3">
      <p className="text-[13px] text-slate-400">{text}</p>
    </div>
  )
}

function AnalysisDetail({
  record,
  clientName,
  onBack,
  onOpenRun,
}: {
  record: AiRecord
  clientName: string
  onBack: () => void
  onOpenRun?: () => void
}) {
  const { t } = useLang()
  const s = record.risk ? riskStyle(record.risk) : null
  const report = record.report
  const isFailed = record.runStatus === "FAILED"
  const history = report?.history ?? null
  const affectedFlows = report ? toTextList(report.affectedFlows) : []
  const observedPattern = report?.observedPattern?.trim() || null

  return (
    <div className="space-y-6">
      {/* Back */}
      <button
        onClick={onBack}
        className="inline-flex items-center gap-1.5 text-[13px] font-medium text-slate-400 transition-colors hover:text-brand-300"
      >
        <svg className="size-4" viewBox="0 0 20 20" fill="currentColor">
          <path
            fillRule="evenodd"
            d="M12.7 15.3a1 1 0 01-1.4 0l-4.5-4.6a1 1 0 010-1.4l4.5-4.6a1 1 0 111.4 1.4L8.9 10l3.8 3.9a1 1 0 010 1.4z"
          />
        </svg>
        {t("page.ai.back")}
      </button>

      {/* Header card */}
      <Card className="border-brand-200 p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-3.5">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-400">
              <svg className="size-6" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 2l1.6 4.9L18.5 8.5 13.6 10 12 15l-1.6-5L5.5 8.5 10.4 6.9 12 2zM19 14l.9 2.6L22.5 17.5 20 18.4 19 21l-.9-2.6L15.5 17.5 18 16.6 19 14z" />
              </svg>
            </span>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-brand-300/80">
                {t("page.ai.eyebrow")}
              </p>
              <h1 className="mt-0.5 font-display text-xl font-bold tracking-tight text-navy">
                {record.flow}
              </h1>
              <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-slate-400">
                <span className="font-mono text-slate-500">{record.id}</span>
                <span className="text-slate-300">·</span>
                <span>{absoluteTime(record.at)}</span>
                {record.durationSeconds != null && (
                  <>
                    <span className="text-slate-300">·</span>
                    <span className="font-mono">{formatDurationSeconds(record.durationSeconds)}</span>
                  </>
                )}
                {record.isPackage && (
                  <>
                    <span className="text-slate-300">·</span>
                    <span>{t("page.ai.packageExecution")}</span>
                  </>
                )}
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge status={record.runStatus} />
            {record.risk && <RiskBadge risk={record.risk} />}
            {record.trend && record.trend.direction !== "Insufficient" && <TrendChip trend={record.trend} />}
          </div>
        </div>
      </Card>

      {record.analyzing || !report ? (
        /* In-flight (or report-less) record: honest waiting state — no
           invented text, no fake progress. The list page refreshes while
           an analysis is genuinely in flight. */
        <Card className="border-brand-200 p-5">
          <AiIdentityBanner />
          <div className="mt-4 flex items-center gap-3">
            <span className="relative flex size-4 shrink-0">
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-brand-400 opacity-40" />
              <span className="relative inline-flex size-4 rounded-full bg-brand-600" />
            </span>
            <div>
              <p className="text-[13px] font-semibold text-navy">{t("ai.analyzing")}</p>
              <p className="mt-0.5 text-[13px] text-slate-500">
                {t("ai.analyzingDesc")}
              </p>
            </div>
          </div>
        </Card>
      ) : (
        /* Two-column layout */
        <div className="grid gap-6 lg:grid-cols-[1fr_288px]">
          {/* Main column — only fields the backend actually returned */}
          <div className="order-2 space-y-5 lg:order-1">
            {/* Business Impact */}
            <SectionCard
              title={t("ai.businessImpact")}
              icon={
                <svg className="size-4 text-brand-400" viewBox="0 0 20 20" fill="currentColor">
                  <path
                    fillRule="evenodd"
                    d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4zm2 6a1 1 0 011-1h6a1 1 0 110 2H7a1 1 0 01-1-1zm1 3a1 1 0 100 2h6a1 1 0 100-2H7z"
                  />
                </svg>
              }
            >
              {record.impact ? (
                <>
                  {record.impactCategory && record.impactCategory !== record.impact && (
                    <span className="mb-2 inline-flex items-center rounded-full bg-brand-50 px-2.5 py-1 text-[11px] font-semibold text-brand-300 ring-1 ring-inset ring-brand-600/10">
                      {IMPACT_LABEL_KEY[record.impactCategory]
                        ? t(IMPACT_LABEL_KEY[record.impactCategory])
                        : record.impactCategory}
                    </span>
                  )}
                  <p className="text-[13px] leading-relaxed text-slate-600">{record.impact}</p>
                </>
              ) : (
                <UnavailableNote text={t("ai.noImpact")} />
              )}
            </SectionCard>

            {/* Assessment */}
            <SectionCard
              title={t("ai.assessment")}
              icon={
                <svg className="size-4 text-brand-400" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 2l1.6 4.9L18.5 8.5 13.6 10 12 15l-1.6-5L5.5 8.5 10.4 6.9 12 2z" />
                </svg>
              }
            >
              {record.assessment ? (
                <p className="text-[13px] leading-relaxed text-slate-600">{record.assessment}</p>
              ) : (
                <UnavailableNote text={t("ai.noAssessment")} />
              )}
            </SectionCard>

            {/* Historical Trend */}
            <SectionCard
              title={t("ai.historicalTrend")}
              icon={
                <svg className="size-4 text-brand-400" viewBox="0 0 20 20" fill="currentColor">
                  <path
                    fillRule="evenodd"
                    d="M1.22 5.222a.75.75 0 011.06 0L7 9.942l3.768-3.769a.75.75 0 011.113.058 20.908 20.908 0 013.813 7.254l1.574-2.727a.75.75 0 011.3.75l-2.475 4.286a.75.75 0 01-.617.393l-4.69.3a.75.75 0 01-.1-1.495l2.95-.188a19.404 19.404 0 00-3.53-6.41L7 11.06 2.28 6.283a.75.75 0 010-1.061z"
                  />
                </svg>
              }
            >
              {!record.trend || record.trend.direction === "Insufficient" ? (
                <UnavailableNote text={t("ai.noTrendYet")} />
              ) : (
                <div className="space-y-3">
                  <div className="flex flex-wrap items-center gap-3">
                    <TrendChip trend={record.trend} />
                    {record.trend.confidence && (
                      <span className="text-[12px] text-slate-400">
                        {t("ai.confidence", { level: t(CONFIDENCE_LABEL_KEY[record.trend.confidence]) })}
                      </span>
                    )}
                  </div>
                  {record.trend.note && (
                    <p className="text-[13px] leading-relaxed text-slate-600">{record.trend.note}</p>
                  )}
                  {history && (history.passedRuns != null || history.failedRuns != null) && (
                    <p className="text-[12px] text-slate-400">
                      {t("ai.priorExecutions")}{" "}
                      {typeof history.totalRuns === "number" ? history.totalRuns : "—"}
                      {typeof history.passedRuns === "number" && ` · ${t("ai.countPassed", { count: history.passedRuns })}`}
                      {typeof history.failedRuns === "number" && ` · ${t("ai.countFailed", { count: history.failedRuns })}`}
                    </p>
                  )}
                </div>
              )}
            </SectionCard>

            {/* Browser Insight — single-run reports only */}
            <SectionCard
              title={t("ai.browserInsight")}
              icon={
                <svg className="size-4 text-brand-400" viewBox="0 0 20 20" fill="currentColor">
                  <path
                    fillRule="evenodd"
                    d="M10 18a8 8 0 100-16 8 8 0 000 16zM4.332 8.027a6.012 6.012 0 011.912-2.706C6.512 5.73 6.974 6 7.5 6A1.5 1.5 0 019 7.5V8a2 2 0 004 0 2 2 0 011.523-1.943A5.977 5.977 0 0116 10c0 .34-.028.675-.083 1H15a2 2 0 00-2 2v2.197A5.973 5.973 0 0110 16v-2a2 2 0 00-2-2 2 2 0 01-2-2 2 2 0 00-1.668-1.973z"
                  />
                </svg>
              }
            >
              {record.browserInsight ? (
                record.browserInsight.browser ? (
                  <div className="flex items-start gap-3">
                    <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-md bg-brand-50 text-brand-400">
                      <svg className="size-4" viewBox="0 0 20 20" fill="currentColor">
                        <path
                          fillRule="evenodd"
                          d="M10 18a8 8 0 100-16 8 8 0 000 16zM4.332 8.027a6.012 6.012 0 011.912-2.706C6.512 5.73 6.974 6 7.5 6A1.5 1.5 0 019 7.5V8a2 2 0 004 0 2 2 0 011.523-1.943A5.977 5.977 0 0116 10c0 .34-.028.675-.083 1H15a2 2 0 00-2 2v2.197A5.973 5.973 0 0110 16v-2a2 2 0 00-2-2 2 2 0 01-2-2 2 2 0 00-1.668-1.973z"
                        />
                      </svg>
                    </span>
                    <div>
                      <p className="text-[12px] font-semibold text-slate-700">{record.browserInsight.browser}</p>
                      <p className="mt-0.5 text-[13px] leading-relaxed text-slate-600">
                        {record.browserInsight.pattern}
                      </p>
                    </div>
                  </div>
                ) : (
                  <p className="text-[13px] text-slate-500">{record.browserInsight.pattern}</p>
                )
              ) : (
                <UnavailableNote
                  text={
                    record.isPackage
                      ? t("ai.noBrowserInsightPackage")
                      : t("ai.noBrowserInsight")
                  }
                />
              )}
            </SectionCard>

            {/* Recommended Actions */}
            <SectionCard
              title={t("ai.recommendedActions")}
              icon={
                <svg className="size-4 text-brand-400" viewBox="0 0 20 20" fill="currentColor">
                  <path
                    fillRule="evenodd"
                    d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.7-9.3a1 1 0 00-1.4-1.4L9 10.6 7.7 9.3a1 1 0 00-1.4 1.4l2 2a1 1 0 001.4 0l4-4z"
                  />
                </svg>
              }
            >
              {record.actions.length > 0 ? (
                <ol className="space-y-2.5">
                  {record.actions.map((action, i) => (
                    <li key={i} className="flex gap-3">
                      <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-brand-50 font-mono text-[10px] font-bold text-brand-400">
                        {i + 1}
                      </span>
                      <p className="text-[13px] leading-relaxed text-slate-600">{action}</p>
                    </li>
                  ))}
                </ol>
              ) : (
                <UnavailableNote text={t("ai.noActions")} />
              )}
            </SectionCard>

            {/* Observed Pattern / Affected Flows — package report fields */}
            {observedPattern && (
              <SectionCard
                title={t("ai.observedPattern")}
                icon={
                  <svg className="size-4 text-brand-400" viewBox="0 0 20 20" fill="currentColor">
                    <path d="M3 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1z" />
                  </svg>
                }
              >
                <p className="text-[13px] leading-relaxed text-slate-600">{observedPattern}</p>
              </SectionCard>
            )}

            {affectedFlows.length > 0 && (
              <SectionCard
                title={t("ai.affectedFlows")}
                icon={
                  <svg className="size-4 text-brand-400" viewBox="0 0 20 20" fill="currentColor">
                    <path
                      fillRule="evenodd"
                      d="M10 2a1 1 0 011 1v1.06a7 7 0 015.94 5.94H18a1 1 0 110 2h-1.06A7 7 0 0111 17.94V19a1 1 0 11-2 0v-1.06A7 7 0 013.06 12H2a1 1 0 110-2h1.06A7 7 0 019 4.06V3a1 1 0 011-1zm0 5a3 3 0 100 6 3 3 0 000-6z"
                    />
                  </svg>
                }
              >
                <div className="flex flex-wrap gap-2">
                  {affectedFlows.map((flow) => (
                    <span
                      key={flow}
                      className="rounded-full bg-slate-100 px-2.5 py-1 text-[12px] font-medium text-slate-600"
                    >
                      {flow}
                    </span>
                  ))}
                </div>
              </SectionCard>
            )}

            {/* Failure Context — execution evidence for failed runs */}
            {isFailed && (
              <SectionCard
                title={t("ai.failureContext")}
                icon={
                  <svg className="size-4 text-slate-400" viewBox="0 0 20 20" fill="currentColor">
                    <path d="M3 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1z" />
                  </svg>
                }
              >
                <FailureContext record={record} />
              </SectionCard>
            )}
          </div>

          {/* Secondary column — sticky intelligence sidebar */}
          <div className="order-1 space-y-4 lg:order-2">
            <Card className="overflow-hidden p-5">
              <AiIdentityBanner />
              <div className="mt-4 border-t border-slate-100 pt-4">
                {record.reliabilityScore != null ? (
                  <>
                    <ReliabilityScore score={record.reliabilityScore} />
                    {record.riskScore != null && (
                      <p className="mt-2 text-[11px] text-slate-400">
                        {t("ai.riskScoreNote", { score: record.riskScore })}
                      </p>
                    )}
                  </>
                ) : (
                  <p className="text-[13px] text-slate-400">
                    {t("ai.noReliabilityScore")}
                  </p>
                )}
              </div>
              <div className="mt-4 border-t border-slate-100 pt-4">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{t("ai.riskLevelLabel")}</p>
                {record.risk && s ? (
                  <div className="mt-2 flex items-center gap-2.5">
                    <span className={cx("flex size-8 items-center justify-center rounded-lg", s.bg, s.icon)}>
                      <RiskIcon risk={record.risk} className="size-4" />
                    </span>
                    <p className={cx("font-display text-base font-bold", s.text)}>{t(RISK_LABEL_KEY[record.risk])}</p>
                  </div>
                ) : (
                  <p className="mt-2 text-[13px] text-slate-400">
                    {t("ai.noRiskLevel")}
                  </p>
                )}
              </div>
              <div className="mt-4 border-t border-slate-100 pt-4">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{t("ai.trendLabel")}</p>
                <div className="mt-2">
                  {!record.trend || record.trend.direction === "Insufficient" ? (
                    <p className="text-[12px] text-slate-400">{t("ai.insufficientData")}</p>
                  ) : (
                    <>
                      <TrendChip trend={record.trend} />
                      {record.trend.confidence && (
                        <p className="mt-1.5 text-[11px] text-slate-400">
                          {t("ai.confidence", { level: t(CONFIDENCE_LABEL_KEY[record.trend.confidence]) })}
                        </p>
                      )}
                    </>
                  )}
                </div>
              </div>
            </Card>

            {/* Execution summary — execution data only; AI never changes it */}
            <Card className="p-5">
              <h2 className="pb-3 font-display text-sm font-bold text-navy">{t("page.ai.executionSummary")}</h2>
              <div className="space-y-3">
                {[
                  { label: t("ai.executionId"), value: record.id, mono: true },
                  { label: t("ai.typeLabel"), value: record.isPackage ? t("run.packageRun") : t("ai.singleFlowRun"), mono: false },
                  { label: t("table.flow"), value: record.flow, mono: false },
                  { label: t("run.client"), value: clientName, mono: false },
                  ...(record.browser ? [{ label: t("ai.browserLabel"), value: record.browser, mono: false }] : []),
                  { label: t("history.started"), value: absoluteTime(record.at), mono: false },
                  ...(record.durationSeconds != null
                    ? [{ label: t("table.duration"), value: formatDurationSeconds(record.durationSeconds), mono: true }]
                    : []),
                  ...(record.counts.passed != null || record.counts.failed != null
                    ? [
                        {
                          label: t("table.tests"),
                          value: [
                            record.counts.passed != null ? t("ai.countPassed", { count: record.counts.passed }) : null,
                            record.counts.failed != null ? t("ai.countFailed", { count: record.counts.failed }) : null,
                            record.counts.skipped != null ? t("ai.countSkipped", { count: record.counts.skipped }) : null,
                          ]
                            .filter(Boolean)
                            .join(" · "),
                          mono: false,
                        },
                      ]
                    : []),
                ].map(({ label, value, mono }) => (
                  <div key={label}>
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                      {label}
                    </p>
                    <p className={cx("mt-0.5 break-words text-[13px] font-medium text-slate-700", mono && "font-mono")}>
                      {value}
                    </p>
                  </div>
                ))}
              </div>
            </Card>

            {/* Actions */}
            {onOpenRun && (
              <Card className="p-5">
                <h2 className="pb-3 font-display text-sm font-bold text-navy">{t("ai.actionsHeader")}</h2>
                <div className="space-y-2">
                  <Button variant="primary" size="sm" className="w-full" onClick={onOpenRun}>
                    {t("alerts.openRun")}
                  </Button>
                </div>
              </Card>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* List row / card                                                    */
/* ------------------------------------------------------------------ */
function AnalysisRow({ record, onOpen }: { record: AiRecord; onOpen: () => void }) {
  const { t } = useLang()
  return (
    <tr className="group border-t border-slate-100 transition-colors hover:bg-slate-50/60">
      <td className="px-4 py-3.5">
        <button onClick={onOpen} className="flex flex-col text-start">
          <span className="text-[13px] font-semibold text-navy group-hover:text-brand-300">
            {record.flow}
          </span>
          <span className="font-mono text-[11px] text-slate-400">{record.id}</span>
        </button>
      </td>
      <td className="px-4 py-3.5">
        <StatusBadge status={record.runStatus} />
      </td>
      <td className="px-4 py-3.5">
        {record.analyzing ? (
          <span className="text-[12px] italic text-slate-400">{t("ai.analyzingShort")}</span>
        ) : record.reliabilityScore != null ? (
          <ReliabilityScore score={record.reliabilityScore} compact />
        ) : (
          <span className="text-[13px] text-slate-300">—</span>
        )}
      </td>
      <td className="px-4 py-3.5">
        {record.risk ? (
          <RiskBadge risk={record.risk} />
        ) : (
          <span className="text-[13px] text-slate-300">—</span>
        )}
      </td>
      <td className="hidden px-4 py-3.5 lg:table-cell">
        {record.trend ? <TrendChip trend={record.trend} /> : <span className="text-[13px] text-slate-300">—</span>}
      </td>
      <td className="hidden max-w-[220px] px-4 py-3.5 xl:table-cell">
        {record.analyzing ? (
          <p className="text-[13px] italic text-slate-400">{t("ai.analyzing")}</p>
        ) : record.impact ? (
          <p className="line-clamp-2 text-[13px] text-slate-500">{record.impact}</p>
        ) : (
          <span className="text-[13px] text-slate-300">—</span>
        )}
      </td>
      <td className="px-4 py-3.5 text-[13px] text-slate-400">
        {record.at ? relativeTime(record.at) : "—"}
      </td>
      <td className="px-4 py-3.5 text-end">
        <Button variant="ghost" size="sm" onClick={onOpen}>
          {t("ai.viewAnalysis")}
        </Button>
      </td>
    </tr>
  )
}

function AnalysisMobileCard({ record, onOpen }: { record: AiRecord; onOpen: () => void }) {
  const { t } = useLang()
  return (
    <Card className="p-4" interactive onClick={onOpen}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[14px] font-semibold text-navy">{record.flow}</p>
          <p className="font-mono text-[11px] text-slate-400">{record.id}</p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1.5">
          {record.risk && <RiskBadge risk={record.risk} />}
          {record.trend && <TrendChip trend={record.trend} />}
        </div>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
        {record.analyzing ? (
          <span className="text-[13px] italic text-slate-400">{t("ai.analyzing")}</span>
        ) : record.reliabilityScore != null ? (
          <ReliabilityScore score={record.reliabilityScore} compact />
        ) : null}
        <StatusBadge status={record.runStatus} />
      </div>
      {record.analyzing ? null : record.impact ? (
        <p className="mt-2.5 line-clamp-2 text-[13px] text-slate-500">{record.impact}</p>
      ) : null}
      <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-3">
        <span className="text-[12px] text-slate-400">
          {record.at ? relativeTime(record.at) : "—"}
        </span>
        <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); onOpen() }}>
          {t("ai.viewAnalysis")}
        </Button>
      </div>
    </Card>
  )
}

/* ------------------------------------------------------------------ */
/* Filter dropdown                                                    */
/* ------------------------------------------------------------------ */
function FilterSelect({
  label,
  options,
  value,
  onChange,
}: {
  label: string
  options: { label: string; value: string }[]
  value: string
  onChange: (v: string) => void
}) {
  return (
    <label className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-surface px-3 py-1.5 text-[13px]">
      <span className="text-slate-400">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="bg-transparent font-medium text-slate-700 focus:outline-none"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </label>
  )
}

/* ------------------------------------------------------------------ */
/* Main page                                                          */
/* ------------------------------------------------------------------ */
const STATUS_TABS = ["All", "Failed", "Passed"] as const
type StatusTab = (typeof STATUS_TABS)[number]
const STATUS_TAB_LABEL_KEY: Record<StatusTab, string> = {
  All: "common.all",
  Failed: "status.failed",
  Passed: "status.passed",
}

export function AiAnalysis({
  active = "ai-analysis",
  onSelect = () => {},
  openRunId = null,
  onOpenRunConsumed,
  onOpenRun,
}: {
  active?: string
  onSelect?: (k: string) => void
  /** Deep link from "View AI Analysis": stable run/execution id to preselect once. */
  openRunId?: string | null
  onOpenRunConsumed?: () => void
  /** Deep-link back into Run History for a record's run. */
  onOpenRun?: (runId: string) => void
}) {
  const { user, logout } = useAuth()
  const { t, lang } = useLang()
  const clientId = user?.clientId ?? null
  const clientName = user?.clientName ?? ""

  const [rows, setRows] = useState<DashboardRun[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [statusFilter, setStatusFilter] = useState<StatusTab>("All")
  const [riskFilter, setRiskFilter] = useState("All")
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const requestRef = useRef(0)

  /* ---- Load the newest 200 runs (backend cap) and derive records --- */
  const load = useCallback(async () => {
    if (clientId == null) return
    const reqId = ++requestRef.current
    try {
      const data = await apiClientRuns(clientId, 200)
      if (requestRef.current !== reqId) return
      setRows(data)
      setError(null)
    } catch (err) {
      if (requestRef.current !== reqId) return
      if (err instanceof ApiError && err.status === 401) {
        logout()
        return
      }
      setError(
        err instanceof ApiError && err.message
          ? err.message
          : translate("ai.loadError"),
      )
    }
  }, [clientId, logout])

  useEffect(() => {
    void load()
  }, [load])

  const records = useMemo(
    () => (rows ?? []).map(toAiRecord).filter((r): r is AiRecord => r != null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rows, lang],
  )

  // Auto-refresh ONLY while a package analysis is genuinely in flight.
  const anyAnalyzing = records.some((r) => r.analyzing)
  useEffect(() => {
    if (!anyAnalyzing) return
    const timer = window.setInterval(() => void load(), 10_000)
    return () => window.clearInterval(timer)
  }, [anyAnalyzing, load])

  // Consume a "View AI Analysis" deep link once the records are known.
  useEffect(() => {
    if (!openRunId || rows == null) return
    const match = records.find((r) => r.id === openRunId)
    if (match) setSelectedId(match.id)
    onOpenRunConsumed?.()
  }, [openRunId, rows, records, onOpenRunConsumed])

  const selected = useMemo(
    () => records.find((r) => r.id === selectedId) ?? null,
    [records, selectedId],
  )

  const summary = useMemo(
    () => ({
      total: records.length,
      critical: records.filter((r) => r.risk === "Critical").length,
      high: records.filter((r) => r.risk === "High" || r.risk === "Critical").length,
      failed: records.filter((r) => r.runStatus === "FAILED").length,
    }),
    [records],
  )

  const filtered = useMemo(() => {
    return records.filter((r) => {
      if (statusFilter === "Failed" && r.runStatus !== "FAILED") return false
      if (statusFilter === "Passed" && r.runStatus !== "PASS") return false
      if (riskFilter !== "All" && r.risk !== riskFilter) return false
      return true
    })
  }, [records, statusFilter, riskFilter])

  const filtersActive = statusFilter !== "All" || riskFilter !== "All"

  if (selected) {
    return (
      <AnalysisDetail
        record={selected}
        clientName={clientName}
        onBack={() => setSelectedId(null)}
        onOpenRun={onOpenRun ? () => onOpenRun(selected.id) : undefined}
      />
    )
  }

  return (
    <div className="space-y-6">
      <WorkspaceHeader active={active} onSelect={onSelect} />

      {/* Page header */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-brand-300">
            {t("ai.listEyebrow")}
          </p>
          <h1 className="mt-1 font-display text-2xl font-bold tracking-tight text-navy">
            {t("ai.listTitle")}
          </h1>
          <p className="mt-1 text-[13px] text-slate-500">
            {t("ai.listSubtitle")}
          </p>
        </div>
        <Button variant="secondary" size="sm" onClick={() => void load()}>
          <svg className="size-3.5" viewBox="0 0 20 20" fill="currentColor">
            <path
              fillRule="evenodd"
              d="M15.312 11.424a5.5 5.5 0 01-9.201 2.466l-.312-.311h2.433a.75.75 0 000-1.5H3.989a.75.75 0 00-.75.75v4.242a.75.75 0 001.5 0v-2.43l.31.31a7 7 0 0011.712-3.138.75.75 0 00-1.449-.39zm1.23-3.723a.75.75 0 00.219-.53V2.929a.75.75 0 00-1.5 0V5.36l-.31-.31A7 7 0 003.239 8.188a.75.75 0 101.448.389A5.5 5.5 0 0113.89 6.11l.311.31h-2.432a.75.75 0 000 1.5h4.243a.75.75 0 00.53-.219z"
              clipRule="evenodd"
            />
          </svg>
          {t("ai.refresh")}
        </Button>
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label={t("ai.analyses")} value={summary.total} tone="slate" />
        <StatCard label={t("ai.criticalIssues")} value={summary.critical} tone="error" />
        <StatCard label={t("ai.highRisk")} value={summary.high} tone="warning" />
        <StatCard label={t("ai.recentFailures")} value={summary.failed} tone="brand" />
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Status tabs */}
        <div className="inline-flex items-center gap-1 rounded-lg bg-slate-100 p-1">
          {STATUS_TABS.map((tabKey) => (
            <button
              key={tabKey}
              onClick={() => setStatusFilter(tabKey)}
              className={cx(
                "rounded-md px-3 py-1.5 text-[13px] font-medium transition-all",
                statusFilter === tabKey
                  ? "bg-surface text-brand-300 shadow-sm"
                  : "text-slate-500 hover:text-slate-700",
              )}
            >
              {t(STATUS_TAB_LABEL_KEY[tabKey])}
            </button>
          ))}
        </div>
        <FilterSelect
          label={t("ai.riskLabel")}
          options={[
            { label: t("common.all"), value: "All" },
            { label: t("ai.risk.critical"), value: "Critical" },
            { label: t("ai.risk.high"), value: "High" },
            { label: t("ai.risk.medium"), value: "Medium" },
            { label: t("ai.risk.low"), value: "Low" },
          ]}
          value={riskFilter}
          onChange={setRiskFilter}
        />
      </div>

      {/* Content */}
      {rows == null && !error ? (
        /* Loading — skeleton in the existing card/table shapes. */
        <div className="space-y-4">
          <Card className="overflow-hidden">
            <div className="space-y-3 p-4">
              <Skeleton className="h-10 w-full" rounded="md" />
              <Skeleton className="h-10 w-full" rounded="md" />
              <Skeleton className="h-10 w-full" rounded="md" />
            </div>
          </Card>
        </div>
      ) : error ? (
        <Card>
          <ErrorState
            title={t("ai.analysisUnavailable")}
            description={error}
            onRetry={() => void load()}
          />
        </Card>
      ) : records.length === 0 ? (
        <Card className="flex flex-col items-center justify-center px-6 py-16 text-center">
          <div className="flex size-14 items-center justify-center rounded-xl bg-brand-50 text-brand-400">
            <svg className="size-7" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 2l1.6 4.9L18.5 8.5 13.6 10 12 15l-1.6-5L5.5 8.5 10.4 6.9 12 2zM19 14l.9 2.6L22.5 17.5 20 18.4 19 21l-.9-2.6L15.5 17.5 18 16.6 19 14z" />
            </svg>
          </div>
          <p className="mt-4 font-display text-base font-bold text-navy">{t("ai.emptyTitle")}</p>
          <p className="mt-1 max-w-sm text-[13px] text-slate-500">
            {t("ai.emptyDesc")}
          </p>
          <Button variant="secondary" size="sm" className="mt-5" onClick={() => onSelect("run-history")}>
            {t("ai.viewRunHistory")}
          </Button>
        </Card>
      ) : filtered.length === 0 ? (
        <Card className="flex flex-col items-center justify-center px-6 py-16 text-center">
          <div className="flex size-14 items-center justify-center rounded-xl bg-brand-50 text-brand-400">
            <svg className="size-7" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 2l1.6 4.9L18.5 8.5 13.6 10 12 15l-1.6-5L5.5 8.5 10.4 6.9 12 2zM19 14l.9 2.6L22.5 17.5 20 18.4 19 21l-.9-2.6L15.5 17.5 18 16.6 19 14z" />
            </svg>
          </div>
          <p className="mt-4 font-display text-base font-bold text-navy">{t("ai.noMatch")}</p>
          <p className="mt-1 max-w-xs text-[13px] text-slate-500">
            {t("history.noMatchDesc")}
          </p>
          {filtersActive && (
            <Button
              variant="secondary"
              size="sm"
              className="mt-5"
              onClick={() => { setStatusFilter("All"); setRiskFilter("All") }}
            >
              {t("ai.clearFilters")}
            </Button>
          )}
        </Card>
      ) : (
        <>
          {/* Table — desktop */}
          <Card className="hidden overflow-hidden lg:block">
            <table className="w-full">
              <thead>
                <tr className="text-start text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                  <th className="px-4 py-3 font-semibold">{t("ai.flowOrExecution")}</th>
                  <th className="px-4 py-3 font-semibold">{t("table.status")}</th>
                  <th className="px-4 py-3 font-semibold">{t("ai.reliability")}</th>
                  <th className="px-4 py-3 font-semibold">{t("ai.riskLabel")}</th>
                  <th className="hidden px-4 py-3 font-semibold lg:table-cell">{t("ai.trendLabel")}</th>
                  <th className="hidden px-4 py-3 font-semibold xl:table-cell">{t("ai.businessImpact")}</th>
                  <th className="px-4 py-3 font-semibold">{t("ai.analyzed")}</th>
                  <th className="px-4 py-3 text-end font-semibold">{t("table.actions")}</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => (
                  <AnalysisRow key={r.id} record={r} onOpen={() => setSelectedId(r.id)} />
                ))}
              </tbody>
            </table>
          </Card>

          {/* Cards — mobile / tablet */}
          <div className="space-y-4 lg:hidden">
            {filtered.map((r) => (
              <AnalysisMobileCard key={r.id} record={r} onOpen={() => setSelectedId(r.id)} />
            ))}
          </div>

          {(rows?.length ?? 0) >= 200 && (
            <p className="text-center text-[12px] text-slate-400">
              {t("ai.recentCap", { limit: 200 })}
            </p>
          )}
        </>
      )}
    </div>
  )
}

export default AiAnalysis
