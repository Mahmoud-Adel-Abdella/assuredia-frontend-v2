/**
 * Mapper adapters between the frozen backend dashboard contract and the
 * Dashboard UI models. Pure functions only — no fetching happens here.
 *
 * Data sources (fetched in src/components/Dashboard.tsx via src/lib/api.ts):
 *   GET /dashboard-api/clients/{id}/runs  → KPIs, Test Health chart, Recent Runs
 *   GET /dashboard-api/alerts             → Recent Failures
 *
 * The backend has no aggregate/statistics endpoint: KPIs, pass rate and the
 * daily chart are derived client-side from the real per-run rows. Backend
 * timestamps are naive UTC text (e.g. "2026-08-26 09:15:00.123"); day
 * bucketing and labels are expressed in the client's configured timezone.
 */
import type { DashboardAlert, DashboardRun } from "./api"
import { langLocale, translate } from "./i18n"
import type { AppStatus } from "../components/primitives"

/* ------------------------------------------------------------------ */
/* Timezone-aware time helpers                                         */
/* ------------------------------------------------------------------ */

const formatterCache = new Map<string, Intl.DateTimeFormat>()

function getFormatter(tz: string | null, options: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  const locale = langLocale()
  const key = `${locale}|${tz ?? ""}|${JSON.stringify(options)}`
  let formatter = formatterCache.get(key)
  if (!formatter) {
    formatter = new Intl.DateTimeFormat(locale, tz ? { timeZone: tz, ...options } : options)
    formatterCache.set(key, formatter)
  }
  return formatter
}

function safeZone(tz: string | null | undefined): string {
  if (!tz) return "UTC"
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz })
    return tz
  } catch {
    return "UTC"
  }
}

function partsToObject(parts: Intl.DateTimeFormatPart[]): Record<string, number> {
  const v: Record<string, number> = {}
  for (const p of parts) if (p.type !== "literal") v[p.type] = Number(p.value)
  return v
}

/**
 * Parse a backend timestamp. DB-derived values are naive text in UTC
 * ("2026-08-26 09:15:00.123" — written by Postgres `DEFAULT now()` on a UTC
 * session; verified against real rows whose run_ids carry the client-local
 * wall time); ISO strings that already carry a zone (live-run states) are
 * parsed as-is.
 */
export function parseBackendTimestamp(ts: string | null | undefined): Date | null {
  if (!ts) return null
  const trimmed = ts.trim()
  if (!trimmed) return null
  let iso = trimmed.includes("T") ? trimmed : trimmed.replace(" ", "T")
  // Normalize hour-only UTC offsets ("+03") — JS only accepts ±hh:mm or Z.
  iso = iso.replace(/([+-]\d{2})$/, "$1:00")
  if (!/([Zz]|[+-]\d{2}:\d{2})$/.test(iso)) iso += "Z"
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? null : d
}

type CivilDate = { y: number; m: number; d: number }

function civilDateInZone(instant: Date, tz: string): CivilDate {
  const v = partsToObject(getFormatter(tz, { year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(instant))
  return { y: v.year, m: v.month, d: v.day }
}

function civilKey(c: CivilDate): string {
  return `${c.y}-${String(c.m).padStart(2, "0")}-${String(c.d).padStart(2, "0")}`
}

function shiftCivil(c: CivilDate, days: number): CivilDate {
  const t = new Date(Date.UTC(c.y, c.m - 1, c.d + days))
  return { y: t.getUTCFullYear(), m: t.getUTCMonth() + 1, d: t.getUTCDate() }
}

function civilLabel(c: CivilDate, style: "weekday" | "date"): string {
  // Synthetic noon avoids any day-boundary shift while formatting.
  const asUtc = new Date(Date.UTC(c.y, c.m - 1, c.d, 12))
  return style === "weekday"
    ? getFormatter("UTC", { weekday: "short" }).format(asUtc)
    : getFormatter("UTC", { month: "short", day: "numeric" }).format(asUtc)
}

function runDayKey(run: DashboardRun, zone: string): string | null {
  const date = parseBackendTimestamp(run.timestamp)
  return date ? civilKey(civilDateInZone(date, zone)) : null
}

/** The client's configured timezone, as reported by the runs payload. */
export function clientTimezoneOf(runs: DashboardRun[]): string | null {
  return runs.find((r) => r.client_timezone)?.client_timezone ?? null
}

/* ------------------------------------------------------------------ */
/* KPI aggregation                                                     */
/* ------------------------------------------------------------------ */

export type WindowStats = { total: number; passed: number; failed: number; skipped: number; runCount: number }

function emptyStats(): WindowStats {
  return { total: 0, passed: 0, failed: 0, skipped: 0, runCount: 0 }
}

function addRun(stats: WindowStats, run: DashboardRun) {
  stats.total += run.total ?? 0
  stats.passed += run.passed ?? 0
  stats.failed += run.failed ?? 0
  stats.skipped += run.skipped ?? 0
  stats.runCount += 1
}

function passRate(w: WindowStats): number | null {
  return w.total > 0 ? (w.passed / w.total) * 100 : null
}

export type DashboardSummary = {
  current: WindowStats
  previous: WindowStats
  currentRate: number | null
  previousRate: number | null
}

/**
 * Aggregate runs into two rolling civil-day windows expressed in the
 * client's timezone: the last 7 days (KPI "this week") and the 7 days
 * before that (the comparison window for deltas).
 */
export function summarizeRuns(runs: DashboardRun[], tz: string | null | undefined, now: Date = new Date()): DashboardSummary {
  const zone = safeZone(tz)
  const today = civilDateInZone(now, zone)
  const current = new Set<string>()
  const previous = new Set<string>()
  for (let i = 0; i < 7; i++) current.add(civilKey(shiftCivil(today, -i)))
  for (let i = 7; i < 14; i++) previous.add(civilKey(shiftCivil(today, -i)))

  const cur = emptyStats()
  const prev = emptyStats()
  for (const run of runs) {
    const key = runDayKey(run, zone)
    if (!key) continue
    if (current.has(key)) addRun(cur, run)
    else if (previous.has(key)) addRun(prev, run)
  }
  return { current: cur, previous: prev, currentRate: passRate(cur), previousRate: passRate(prev) }
}

export type Kpi = {
  label: string
  value: string
  /** null = no comparison available (previous window had no runs). */
  delta: string | null
  trend: "up" | "down" | "flat"
  tone?: "success" | "error" | "brand"
  sub: string
}

function formatCount(n: number): string {
  return n.toLocaleString(langLocale())
}

function countDelta(cur: number, prev: number): { delta: string; trend: "up" | "down" | "flat" } {
  const d = cur - prev
  if (d === 0) return { delta: "0", trend: "flat" }
  return { delta: `${d > 0 ? "+" : "-"}${formatCount(Math.abs(d))}`, trend: d > 0 ? "up" : "down" }
}

export function toKpis(summary: DashboardSummary): Kpi[] {
  const { current, previous, currentRate, previousRate } = summary
  const hasPrev = previous.runCount > 0
  const d = (cur: number, prev: number) =>
    hasPrev ? countDelta(cur, prev) : ({ delta: null, trend: "flat" } as const)

  let rateDelta: { delta: string | null; trend: "up" | "down" | "flat" } = { delta: null, trend: "flat" }
  if (currentRate != null && previousRate != null) {
    const dd = Math.round((currentRate - previousRate) * 10) / 10
    rateDelta =
      dd === 0
        ? { delta: "0%", trend: "flat" }
        : { delta: `${dd > 0 ? "+" : "-"}${Math.abs(dd)}%`, trend: dd > 0 ? "up" : "down" }
  }

  return [
    { label: translate("dashboard.totalTests"), value: formatCount(current.total), ...d(current.total, previous.total), sub: translate("dashboard.thisWeek") },
    { label: translate("status.passed"), value: formatCount(current.passed), ...d(current.passed, previous.passed), tone: "success", sub: translate("dashboard.thisWeek") },
    { label: translate("status.failed"), value: formatCount(current.failed), ...d(current.failed, previous.failed), tone: "error", sub: translate("dashboard.thisWeek") },
    {
      label: translate("dashboard.successRate"),
      value: currentRate != null ? `${Math.round(currentRate * 10) / 10}%` : "—",
      ...rateDelta,
      tone: "brand",
      sub: translate("dashboard.vsLastWeek"),
    },
  ]
}

/* ------------------------------------------------------------------ */
/* Test Health chart                                                   */
/* ------------------------------------------------------------------ */

export type TrendPoint = {
  day: string
  passed: number
  failed: number
  /** Number of executions that day (all row types returned by /runs). */
  runs: number
  /** Average execution duration in seconds that day, or null when no run reported one. */
  avgDurationSec: number | null
}

/** Consecutive civil days (oldest → newest) ending today in the client's timezone. */
export function buildDailySeries(
  runs: DashboardRun[],
  days: number,
  tz: string | null | undefined,
  now: Date = new Date(),
): TrendPoint[] {
  const zone = safeZone(tz)
  const today = civilDateInZone(now, zone)
  const style: "weekday" | "date" = days <= 7 ? "weekday" : "date"
  const buckets = new Map<string, TrendPoint>()
  const durAcc = new Map<string, { sum: number; count: number }>()
  const order: string[] = []
  for (let i = days - 1; i >= 0; i--) {
    const c = shiftCivil(today, -i)
    const key = civilKey(c)
    buckets.set(key, { day: civilLabel(c, style), passed: 0, failed: 0, runs: 0, avgDurationSec: null })
    order.push(key)
  }
  for (const run of runs) {
    const key = runDayKey(run, zone)
    const bucket = key ? buckets.get(key) : undefined
    if (bucket) {
      bucket.passed += run.passed ?? 0
      bucket.failed += run.failed ?? 0
      bucket.runs += 1
      if (run.duration_seconds != null && Number.isFinite(run.duration_seconds)) {
        const acc = durAcc.get(key!) ?? { sum: 0, count: 0 }
        acc.sum += run.duration_seconds
        acc.count += 1
        durAcc.set(key!, acc)
      }
    }
  }
  return order.map((key) => {
    const point = buckets.get(key)!
    const acc = durAcc.get(key)
    return acc ? { ...point, avgDurationSec: acc.sum / acc.count } : point
  })
}

export function seriesTotals(series: TrendPoint[]): { passed: number; failed: number } {
  return series.reduce(
    (acc, p) => ({ passed: acc.passed + p.passed, failed: acc.failed + p.failed }),
    { passed: 0, failed: 0 },
  )
}

/* ------------------------------------------------------------------ */
/* Recent Runs                                                         */
/* ------------------------------------------------------------------ */

export type UiRun = {
  id: string
  flow: string
  status: AppStatus
  trigger: "Manual" | "Scheduled" | "Unknown"
  duration: string
  time: string
  sortMs: number
}

/**
 * The backend stores inconsistent legacy status strings; the runs filter
 * normalizes them server-side using these same families.
 */
export function normalizeRunStatus(status: string | null | undefined): AppStatus {
  switch ((status ?? "").trim().toUpperCase()) {
    case "PASS":
    case "PASSED":
    case "COMPLETED":
    case "SUCCESS":
    case "SUCCEEDED":
      return "PASS"
    case "FAIL":
    case "FAILED":
    case "ERROR":
    case "ERRORED":
      return "FAILED"
    case "RUNNING":
    case "STARTED":
    case "IN_PROGRESS":
      return "RUNNING"
    case "QUEUED":
      return "PENDING"
    case "CANCELLED":
    case "CANCELED":
      return "CANCELLED"
    case "SKIPPED":
      return "SKIPPED"
    default:
      return "CANCELLED"
  }
}

function triggerLabel(run: DashboardRun): UiRun["trigger"] {
  switch ((run.trigger_source ?? run.source ?? "").toUpperCase()) {
    case "DIRECT":
      return "Manual"
    case "SCHEDULED":
      return "Scheduled"
    default:
      return "Unknown"
  }
}

export function formatDuration(seconds: number | null | undefined): string {
  if (seconds == null || !Number.isFinite(seconds) || seconds < 0) return "—"
  const s = Math.round(seconds)
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  const rs = s % 60
  if (m < 60) return rs > 0 ? `${m}m ${String(rs).padStart(2, "0")}s` : `${m}m`
  const h = Math.floor(m / 60)
  const rm = m % 60
  return rm > 0 ? `${h}h ${String(rm).padStart(2, "0")}m` : `${h}h`
}

export function relativeTime(date: Date | null, now: Date = new Date()): string {
  if (!date) return "—"
  const diffMs = now.getTime() - date.getTime()
  if (diffMs < 45_000) return translate("time.justNow")
  const mins = Math.floor(diffMs / 60_000)
  if (mins < 60) return translate("time.minsAgo", { count: mins })
  const hours = Math.floor(mins / 60)
  if (hours < 24) return translate("time.hoursAgo", { count: hours })
  const days = Math.floor(hours / 24)
  if (days < 7) return translate("time.daysAgo", { count: days })
  return getFormatter(null, { month: "short", day: "numeric" }).format(date)
}

export function toRunRows(runs: DashboardRun[], now: Date = new Date()): UiRun[] {
  return runs
    .map((run) => {
      const date = parseBackendTimestamp(run.timestamp)
      return {
        id: run.run_id ?? String(run.id),
        flow: run.flow_name ?? run.package_name ?? translate("dashboard.unknownFlow"),
        status: normalizeRunStatus(run.status),
        trigger: triggerLabel(run),
        duration: formatDuration(run.duration_seconds),
        time: relativeTime(date, now),
        sortMs: date?.getTime() ?? 0,
      }
    })
    .sort((a, b) => b.sortMs - a.sortMs)
}

/* ------------------------------------------------------------------ */
/* Recent Failures                                                     */
/* ------------------------------------------------------------------ */

export type UiFailure = {
  id: string
  /** Backend run_id of the failed run, when the alert carries one (deep link to Run History). */
  runId: string | null
  name: string
  detail: string
  time: string
  client: string
}

export function toFailures(alerts: DashboardAlert[], now: Date = new Date()): UiFailure[] {
  return alerts.map((a) => ({
    id: a.id,
    runId: a.runId ?? null,
    name: a.flow ?? translate("dashboard.unknownFlow"),
    detail: a.summary ?? a.testName ?? translate("dashboard.testFailure"),
    time: relativeTime(parseBackendTimestamp(a.timestamp), now),
    client: a.client ?? "—",
  }))
}
