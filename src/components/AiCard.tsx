/**
 * AI analysis card (Phase 8) — the single place that renders an execution's
 * AI reliability analysis inside run views.
 *
 * Honesty rules enforced here:
 *   - Only fields actually present in the backend report render; a missing
 *     field hides its section instead of being invented.
 *   - Reliability is the anchored complement of the backend risk score
 *     (100 − riskScore, backend scale: 0 = perfect) — derived, never
 *     invented; the raw risk score stays visible next to it.
 *   - Trend and browser insight render only when the report carries them
 *     (package reports have neither and simply omit the fields).
 *   - ANALYZING shows a quiet "analyzing" state — no fake progress, timers,
 *     or completion.
 *   - FAILED / RATE_LIMITED never touch the execution status; the card only
 *     reports the analysis itself.
 *   - Retry is offered only when the caller says the backend supports it
 *     (single test_runs via POST /runs/{runId}/analyze).
 */

import React from "react"
import { AiPill, Button, Card, cx } from "./primitives"
import { useLang } from "../lib/i18n"
import {
  reportActions,
  reportAssessment,
  reportBrowserInsight,
  reportImpact,
  reportReliabilityScore,
  reportRiskLevel,
  reportRiskScore,
  reportTrend,
  type ParsedAiReport,
  type RiskLevel,
  type TrendDirection,
} from "../lib/aiAnalysis"

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{label}</p>
      {children}
    </div>
  )
}

function riskPillClasses(level: string): string {
  if (level === "Critical" || level === "High") return "bg-red-50 text-red-700 ring-red-600/10"
  if (level === "Medium") return "bg-amber-50 text-amber-700 ring-amber-600/10"
  return "bg-emerald-50 text-emerald-700 ring-emerald-600/10"
}

/* Closed-set backend display values → i18n label keys (backend values themselves never change). */
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

/* Reliability ring — same scale derivation as the AI Analysis page. */
function scoreColor(score: number): { stroke: string; text: string; labelKey: string } {
  if (score >= 90) return { stroke: "#22c55e", text: "text-success", labelKey: "ai.score.excellent" }
  if (score >= 70) return { stroke: "#3b82f6", text: "text-brand-400", labelKey: "ai.score.good" }
  if (score >= 40) return { stroke: "#f59e0b", text: "text-warning", labelKey: "ai.score.atRisk" }
  return { stroke: "#ef4444", text: "text-error", labelKey: "ai.score.low" }
}

function MiniReliability({ score }: { score: number }) {
  const { t } = useLang()
  const c = scoreColor(score)
  const r = 16
  const circ = 2 * Math.PI * r
  const fill = (Math.max(0, Math.min(100, score)) / 100) * circ
  return (
    <div className="flex items-center gap-2.5">
      <svg width={44} height={44} viewBox="0 0 44 44" className="shrink-0 -rotate-90">
        <circle cx={22} cy={22} r={r} fill="none" stroke="#e2e8f0" strokeWidth="5" />
        <circle
          cx={22}
          cy={22}
          r={r}
          fill="none"
          stroke={c.stroke}
          strokeWidth="5"
          strokeDasharray={`${fill} ${circ}`}
          strokeLinecap="round"
        />
      </svg>
      <div>
        <p className={cx("font-display text-lg font-bold leading-none", c.text)}>
          {score}
          <span className="text-[12px] font-normal text-slate-400">/100</span>
        </p>
        <p className="mt-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
          {t("ai.reliability")} · {t(c.labelKey)}
        </p>
      </div>
    </div>
  )
}

export function AiAnalysisCard({
  status,
  report,
  retryable = false,
  retrying = false,
  onRetry,
  onViewFull,
}: {
  /** Raw backend analysis status (ANALYZING / COMPLETED / FAILED / …). */
  status: string
  /** Parsed stored report; null when the backend has none. */
  report: ParsedAiReport | null
  /** Only true when the frozen backend accepts a (re)trigger for this run. */
  retryable?: boolean
  retrying?: boolean
  onRetry?: () => void
  /** Deep-link to the AI Analysis page; shown only for completed reports. */
  onViewFull?: () => void
}) {
  const { t } = useLang()

  /* ---- In flight: ANALYZING or any unrecognized non-terminal state ---- */
  if (status !== "COMPLETED" && status !== "FAILED" && status !== "RATE_LIMITED" && status !== "DISABLED") {
    if (status === "NOT_STARTED" && !retryable) return null
    return (
      <Card className="border-brand-200 p-5">
        <AiPill />
        {status === "NOT_STARTED" ? (
          <div className="mt-3">
            <p className="text-[13px] font-semibold text-navy">{t("ai.card.notStarted")}</p>
            <p className="mt-1 text-[13px] leading-relaxed text-slate-500">
              {t("ai.card.notStartedDesc")}
            </p>
            {retryable && onRetry && (
              <Button variant="primary" size="sm" className="mt-3 w-full" onClick={onRetry} loading={retrying}>
                {retrying ? t("ai.card.starting") : t("ai.card.runAnalysis")}
              </Button>
            )}
          </div>
        ) : (
          <div className="mt-3 flex items-start gap-2.5">
            <span className="relative mt-1 flex size-2 shrink-0">
              <span
                className="absolute inline-flex size-full rounded-full bg-brand-600 opacity-75"
                style={{ animation: "ping 1.2s cubic-bezier(0,0,0.2,1) infinite" }}
              />
              <span className="relative inline-flex size-2 rounded-full bg-brand-600" />
            </span>
            <div>
              <p className="text-[13px] font-semibold text-navy">{t("ai.analyzing")}</p>
              <p className="mt-1 text-[13px] leading-relaxed text-slate-500">
                {t("ai.card.analyzingDesc")}
              </p>
            </div>
          </div>
        )}
      </Card>
    )
  }

  /* ---- DISABLED ---------------------------------------------------- */
  if (status === "DISABLED") {
    return (
      <Card className="border-brand-200 p-5">
        <AiPill />
        <p className="mt-3 text-[13px] font-semibold text-navy">{t("ai.card.disabled")}</p>
        <p className="mt-1 text-[13px] leading-relaxed text-slate-500">
          {t("ai.card.disabledDesc")}
        </p>
      </Card>
    )
  }

  /* ---- FAILED / RATE_LIMITED ---------------------------------------- */
  if (status === "FAILED" || status === "RATE_LIMITED") {
    return (
      <Card className="border-brand-200 p-5">
        <AiPill />
        <p className="mt-3 text-[13px] font-semibold text-navy">{t("ai.analysisUnavailable")}</p>
        <p className="mt-1 text-[13px] leading-relaxed text-slate-500">
          {status === "RATE_LIMITED" ? t("ai.card.rateLimited") : t("ai.card.analysisFailed")}
        </p>
        {retryable && onRetry && (
          <Button variant="secondary" size="sm" className="mt-3 w-full" onClick={onRetry} loading={retrying}>
            {retrying ? t("ai.card.starting") : t("ai.card.retryAnalysis")}
          </Button>
        )}
      </Card>
    )
  }

  /* ---- COMPLETED ---------------------------------------------------- */
  const risk = report ? reportRiskLevel(report) : null
  const reliability = report ? reportReliabilityScore(report) : null
  const riskScore = report ? reportRiskScore(report) : null
  const impact = report ? reportImpact(report) : null
  const assessment = report ? reportAssessment(report) : null
  const trend = report ? reportTrend(report) : null
  const browserInsight = report ? reportBrowserInsight(report) : null
  const actions = report ? reportActions(report) : []

  return (
    <Card className="border-brand-200 p-5">
      <AiPill />
      {!report ? (
        <p className="mt-3 text-[13px] leading-relaxed text-slate-500">
          {t("ai.card.reportUnreadable")}
        </p>
      ) : (
        <div className="mt-3 space-y-3">
          {reliability != null && (
            <div>
              <MiniReliability score={reliability} />
              {riskScore != null && (
                <p className="mt-1 text-[11px] text-slate-400">
                  {t("ai.riskScoreNote", { score: riskScore })}
                </p>
              )}
            </div>
          )}
          {risk && (
            <Field label={t("ai.riskLevelLabel")}>
              <span
                className={cx(
                  "mt-1 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide ring-1 ring-inset",
                  riskPillClasses(risk),
                )}
              >
                {t(RISK_LABEL_KEY[risk])}
              </span>
            </Field>
          )}
          {impact && (
            <Field label={t("ai.businessImpact")}>
              <p className="mt-1 text-[13px] text-slate-600">{impact}</p>
            </Field>
          )}
          {assessment && (
            <Field label={t("ai.assessment")}>
              <p className="mt-1 text-[13px] leading-relaxed text-slate-600">{assessment}</p>
            </Field>
          )}
          {trend && (
            <Field label={t("ai.historicalTrend")}>
              <p className="mt-1 text-[13px] text-slate-600">
                <span className="font-semibold">
                  {trend.direction === "Insufficient"
                    ? t("ai.insufficientData")
                    : t(TREND_LABEL_KEY[trend.direction])}
                </span>
                {trend.delta !== undefined && trend.direction !== "Insufficient" && (
                  <span className="font-mono text-[12px] text-slate-400">
                    {" "}({trend.delta > 0 ? "+" : ""}{trend.delta})
                  </span>
                )}
                {trend.confidence && (
                  <span className="text-slate-400">
                    {" "}· {t("ai.confidence", { level: t(CONFIDENCE_LABEL_KEY[trend.confidence]) })}
                  </span>
                )}
              </p>
              {trend.note && (
                <p className="mt-1 text-[12px] leading-relaxed text-slate-500">{trend.note}</p>
              )}
            </Field>
          )}
          {browserInsight && (
            <Field label={t("ai.browserInsight")}>
              <p className="mt-1 text-[13px] leading-relaxed text-slate-600">
                {browserInsight.browser && <span className="font-semibold">{browserInsight.browser}: </span>}
                {browserInsight.pattern}
              </p>
            </Field>
          )}
          {actions.length > 0 && (
            <Field label={t("ai.recommendedActions")}>
              <ul className="mt-1.5 space-y-1.5">
                {actions.map((a) => (
                  <li key={a} className="flex gap-2 text-[13px] text-slate-600">
                    <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-brand-500" />
                    {a}
                  </li>
                ))}
              </ul>
            </Field>
          )}
        </div>
      )}
      {report && onViewFull && (
        <Button variant="primary" size="sm" className="mt-4 w-full" onClick={onViewFull}>
          {t("ai.card.viewFull")}
        </Button>
      )}
    </Card>
  )
}

export default AiAnalysisCard
