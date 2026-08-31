/**
 * AI analysis data layer (Phase 8).
 *
 * Pure mappers between the frozen backend's AI contract and the UI model.
 * No fetching here — every backend call goes through src/lib/api.ts.
 *
 * Contract facts (verified against DashboardController / LiveRunAiService /
 * AiReliabilityService):
 *   - Lifecycle states: NOT_STARTED | ANALYZING | COMPLETED | FAILED |
 *     DISABLED | RATE_LIMITED. Unknown values are tolerated and treated as
 *     non-terminal (the UI never presents them as a known state).
 *   - The stored report is a raw JSON string (runs list) or an already
 *     parsed object (/analysis, /status). It is only ever rendered from
 *     fields that are actually present — nothing is invented.
 *   - Single-run reports use `recommendedActions` (array); package reports
 *     use `recommendedAction` (string, occasionally an array).
 *   - AI analysis is informational. It never changes the execution status.
 */

/** Severity buckets used by the Figma design's risk visuals. */
export type RiskLevel = "Critical" | "High" | "Medium" | "Low"

/**
 * Parsed AI reliability report. Every field is optional because the frozen
 * backend only validates `status` + `severity` — everything else may be
 * absent and must simply not render.
 */
export type ParsedAiReport = {
  /** Healthy | Warning | Critical (single runs) / package status string. */
  status?: string
  /** Low | Medium | High | Critical. */
  severity?: string
  riskScore?: { score?: number | null; level?: string | null } | number | null
  trendScore?: number | null
  estimatedBusinessRisk?: string | null
  businessImpact?: string | null
  assessment?: string | null
  summary?: string | null
  journey?: string | null
  journeyType?: string | null
  affectedFlows?: unknown
  observedPattern?: string | null
  priority?: string | null
  trend?: {
    direction?: string | null
    summary?: string | null
    isRecurring?: boolean | null
    confidence?: string | null
  } | null
  history?: {
    totalRuns?: number | null
    passedRuns?: number | null
    failedRuns?: number | null
    lastSuccessfulRun?: string | null
    lastFailedRun?: string | null
  } | null
  browserInsight?: {
    hasBrowserPattern?: boolean | null
    affectedBrowser?: string | null
    summary?: string | null
  } | null
  /** Single-run reports: array of action strings. */
  recommendedActions?: unknown
  /** Package reports: one action string (sometimes an array). */
  recommendedAction?: unknown
}

/**
 * Parse a stored AI report. Accepts the raw JSON string from the runs list
 * or an already-parsed object from /analysis and /status. Returns null when
 * there is nothing usable (missing, malformed, non-object, or empty) — an
 * empty stored object means "no report", never a report with no findings.
 */
export function parseAiReport(raw: unknown): ParsedAiReport | null {
  let value: unknown = raw
  if (typeof raw === "string") {
    const trimmed = raw.trim()
    if (!trimmed) return null
    try {
      value = JSON.parse(trimmed)
    } catch {
      return null
    }
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) return null
  if (Object.keys(value as object).length === 0) return null
  return value as ParsedAiReport
}

/* ------------------------------------------------------------------ */
/* Lifecycle helpers                                                    */
/* ------------------------------------------------------------------ */

/** Terminal analysis states — no further state change is expected. */
const TERMINAL_ANALYSIS_STATUSES = new Set(["COMPLETED", "FAILED", "DISABLED", "RATE_LIMITED"])

export function isTerminalAnalysisStatus(status: string | null | undefined): boolean {
  return status != null && TERMINAL_ANALYSIS_STATUSES.has(status)
}

/**
 * True while an analysis is genuinely in flight: a known non-terminal state
 * other than NOT_STARTED. Unknown backend values also count as in-flight so
 * the UI shows "analyzing" instead of mislabeling them.
 */
export function isAnalysisInFlight(status: string | null | undefined): boolean {
  if (status == null) return false
  if (status === "NOT_STARTED") return false
  return !TERMINAL_ANALYSIS_STATUSES.has(status)
}

/* ------------------------------------------------------------------ */
/* Report accessors — render only what the backend actually returned    */
/* ------------------------------------------------------------------ */

function nonEmpty(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null
}

/** Report severity → the design's risk buckets. null when absent/unrecognized. */
export function reportRiskLevel(report: ParsedAiReport): RiskLevel | null {
  const severity = nonEmpty(report.severity)?.toLowerCase()
  if (severity === "critical") return "Critical"
  if (severity === "high") return "High"
  if (severity === "medium") return "Medium"
  if (severity === "low") return "Low"
  return null
}

/** Numeric risk score (0–100) when the report provides one. */
export function reportRiskScore(report: ParsedAiReport): number | null {
  const raw = report.riskScore
  if (typeof raw === "number" && Number.isFinite(raw)) return raw
  if (raw && typeof raw === "object" && typeof raw.score === "number" && Number.isFinite(raw.score)) {
    return raw.score
  }
  return null
}

/** Business impact text from the analysis response. */
export function reportImpact(report: ParsedAiReport): string | null {
  return nonEmpty(report.businessImpact) ?? nonEmpty(report.estimatedBusinessRisk)
}

/**
 * Business risk category label, only when it matches the frozen backend's
 * enum (Customer Access | Revenue Impact | Data Integrity | Low | None).
 * Anything else is free text already covered by reportImpact — never a
 * category.
 */
const IMPACT_CATEGORIES = new Set(["Customer Access", "Revenue Impact", "Data Integrity", "Low", "None"])

export function reportImpactCategory(report: ParsedAiReport): string | null {
  const value = nonEmpty(report.estimatedBusinessRisk)
  return value && IMPACT_CATEGORIES.has(value) ? value : null
}

/** Assessment text: full reports use `assessment`, package reports may only have `summary`. */
export function reportAssessment(report: ParsedAiReport): string | null {
  return nonEmpty(report.assessment) ?? nonEmpty(report.summary)
}

/**
 * Recommended actions from whichever field the report carries
 * (recommendedActions for single runs, recommendedAction for packages).
 * Non-string entries are dropped, never coerced into text.
 */
export function reportActions(report: ParsedAiReport): string[] {
  const out: string[] = []
  for (const source of [report.recommendedActions, report.recommendedAction]) {
    if (Array.isArray(source)) {
      for (const item of source) {
        const text = nonEmpty(item)
        if (text) out.push(text)
      }
    } else {
      const text = nonEmpty(source)
      if (text) out.push(text)
    }
  }
  return out
}

/** Trend summary line when the report provides one. */
export function reportTrendSummary(report: ParsedAiReport): string | null {
  return nonEmpty(report.trend?.summary)
}

/* ------------------------------------------------------------------ */
/* Derived capability views (Phase 8 revision)                          */
/* ------------------------------------------------------------------ */
/*
 * The frozen backend exposes a RISK score, not a reliability score: the
 * single-run contract defines riskScore.score as 0–100 where 0 = perfect
 * and 100 = critical failure. Reliability is the anchored complement on
 * that same scale (reliability = 100 − riskScore) — a derivation from a
 * verified backend value, never an invented metric. The raw risk score
 * stays visible next to it wherever the design allows.
 */

/** Reliability score 0–100 (higher = healthier), or null when the report has no risk score. */
export function reportReliabilityScore(report: ParsedAiReport): number | null {
  const risk = reportRiskScore(report)
  if (risk == null) return null
  return Math.max(0, Math.min(100, Math.round(100 - risk)))
}

/** Historical trend directions supported by the design. */
export type TrendDirection =
  | "Stable"
  | "Improving"
  | "Degrading"
  | "Recurring"
  | "New"
  | "Insufficient"

/** Design view of the report's historical trend block. */
export type TrendView = {
  direction: TrendDirection
  /** Backend trendScore (−100…100): + improving, − degrading, 0 stable. */
  delta?: number
  confidence?: "High" | "Medium" | "Low"
  /** Backend trend.summary — the AI's own trend explanation. */
  note?: string
  /** Backend trend.isRecurring flag. */
  isRecurring?: boolean
}

/**
 * Map the report's trend/history blocks onto the design's trend model.
 *
 * Rules (backend values are never overridden by derived labels):
 *   - an explicit trend.direction (Improving|Stable|Degrading) wins;
 *   - otherwise isRecurring=true yields "Recurring";
 *   - otherwise history.totalRuns===0 yields "New" (first execution of the
 *     flow — the backend sent no prior runs);
 *   - anything else is "Insufficient" (a valid state, not an error).
 *
 * Package reports carry no trend/history fields at all and resolve to
 * "Insufficient" as well. null means "no trend block and no history block
 * anywhere" — callers render the designed insufficient-historical-data
 * state for both.
 */
export function reportTrend(report: ParsedAiReport): TrendView | null {
  const trend = report.trend
  const history = report.history
  if (!trend && !history) return null

  const confidenceRaw = nonEmpty(trend?.confidence)?.toLowerCase()
  const confidence =
    confidenceRaw === "high" || confidenceRaw === "medium" || confidenceRaw === "low"
      ? (confidenceRaw === "high" ? "High" : confidenceRaw === "medium" ? "Medium" : "Low")
      : undefined
  const note = nonEmpty(trend?.summary) ?? undefined
  const delta =
    typeof report.trendScore === "number" && Number.isFinite(report.trendScore)
      ? Math.round(report.trendScore)
      : undefined
  const isRecurring = trend?.isRecurring === true ? true : undefined

  const directionRaw = nonEmpty(trend?.direction)?.toLowerCase()
  if (directionRaw === "improving" || directionRaw === "stable" || directionRaw === "degrading") {
    return {
      direction: directionRaw === "improving" ? "Improving" : directionRaw === "stable" ? "Stable" : "Degrading",
      delta,
      confidence,
      note,
      isRecurring,
    }
  }
  if (trend?.isRecurring === true) return { direction: "Recurring", delta, confidence, note, isRecurring }
  if (history && typeof history.totalRuns === "number" && history.totalRuns === 0) {
    return { direction: "New", confidence, note }
  }
  return { direction: "Insufficient", confidence, note }
}

/**
 * Browser insight from the report, or null when the backend returned no
 * insight text. `browser` is only present for a real affected browser —
 * the backend's "none" sentinel is dropped, never displayed.
 */
export function reportBrowserInsight(report: ParsedAiReport): { browser?: string; pattern: string } | null {
  const pattern = nonEmpty(report.browserInsight?.summary)
  if (!pattern) return null
  const browser = nonEmpty(report.browserInsight?.affectedBrowser)
  return {
    browser: browser && browser.toLowerCase() !== "none" ? browser : undefined,
    pattern,
  }
}
