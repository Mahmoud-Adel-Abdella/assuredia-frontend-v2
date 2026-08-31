import React, { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  Area,
  AreaChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"
import {
  AiPill,
  Button,
  Card,
  Dropdown,
  EmptyState,
  ErrorState,
  Skeleton,
  StatusBadge,
  TableSkeleton,
  Tabs,
  cx,
  useIsDark,
  type AppStatus,
} from "./primitives"
import { useAuth } from "../lib/auth"
import { translate, useLang } from "../lib/i18n"
import { ApiError, apiAlerts, apiClientRuns, type DashboardAlert, type DashboardRun } from "../lib/api"
import {
  buildDailySeries,
  clientTimezoneOf,
  formatDuration,
  seriesTotals,
  summarizeRuns,
  toFailures,
  toKpis,
  toRunRows,
  type Kpi,
  type TrendPoint,
  type UiFailure,
  type UiRun,
} from "../lib/dashboardData"

/* ------------------------------------------------------------------ */
/* Data loading                                                        */
/* ------------------------------------------------------------------ */

type Source<T> = { data: T | null; loading: boolean; error: string | null }

const initialSource: Source<never> = { data: null, loading: true, error: null }

/**
 * Dashboard data sources:
 *   GET /dashboard-api/clients/{clientId}/runs?limit=200 → KPIs, Test Health, Recent Runs
 *   GET /dashboard-api/alerts?limit=5                    → Recent Failures
 * clientId comes from the authenticated identity (backend-derived), never
 * from arbitrary frontend state. Both sources load once per mount with a
 * stale-response guard — no polling, no duplicate requests.
 */
function useDashboardData(clientId: number | null, onUnauthorized: () => void) {
  const [runs, setRuns] = useState<Source<DashboardRun[]>>(initialSource)
  const [alerts, setAlerts] = useState<Source<DashboardAlert[]>>(initialSource)
  const requestRef = useRef(0)

  const load = useCallback(async () => {
    if (clientId == null) return
    const rid = ++requestRef.current
    setRuns((s) => ({ ...s, loading: true, error: null }))
    setAlerts((s) => ({ ...s, loading: true, error: null }))

    const [runsRes, alertsRes] = await Promise.allSettled([apiClientRuns(clientId, 200), apiAlerts(5)])
    if (rid !== requestRef.current) return

    if (runsRes.status === "fulfilled") {
      setRuns({ data: runsRes.value, loading: false, error: null })
    } else {
      const err = runsRes.reason
      if (err instanceof ApiError && err.status === 401) return onUnauthorized()
      setRuns({ data: null, loading: false, error: err instanceof ApiError ? err.message : translate("dashboard.loadRunsFailed") })
    }

    if (alertsRes.status === "fulfilled") {
      setAlerts({ data: alertsRes.value, loading: false, error: null })
    } else {
      const err = alertsRes.reason
      if (err instanceof ApiError && err.status === 401) return onUnauthorized()
      setAlerts({ data: null, loading: false, error: err instanceof ApiError ? err.message : translate("dashboard.loadAlertsFailed") })
    }
  }, [clientId, onUnauthorized])

  useEffect(() => {
    load()
    return () => {
      requestRef.current++
    }
  }, [load])

  return { runs, alerts, reload: load }
}

/* ------------------------------------------------------------------ */
/* KPI Card                                                            */
/* ------------------------------------------------------------------ */
function KpiCard({ kpi }: { kpi: Kpi }) {
  const toneRing =
    kpi.tone === "success"
      ? "text-emerald-600 bg-emerald-50"
      : kpi.tone === "error"
        ? "text-red-600 bg-red-50"
        : kpi.tone === "brand"
          ? "text-brand-400 bg-brand-50"
          : "text-slate-500 bg-slate-100"
  const deltaGood =
    kpi.delta == null || kpi.trend === "flat"
      ? null
      : kpi.trend === "up"
        ? kpi.tone !== "error"
        : kpi.tone === "error"
  return (
    <Card interactive className="p-5">
      <div className="flex items-start justify-between">
        <p className="text-[13px] font-medium text-slate-500">{kpi.label}</p>
        <span className={cx("flex size-8 items-center justify-center rounded-lg", toneRing)}>
          <span className="size-2 rounded-full bg-current" />
        </span>
      </div>
      <p className="mt-3 font-display text-3xl font-bold tracking-tight text-navy tabular-nums">
        {kpi.value}
      </p>
      <div className="mt-2 flex items-center gap-1.5 text-[12px]">
        {kpi.delta == null ? (
          <span className="font-semibold text-slate-400">—</span>
        ) : (
          <span
            className={cx(
              "inline-flex items-center gap-0.5 font-semibold tabular-nums",
              deltaGood == null ? "text-slate-400" : deltaGood ? "text-emerald-600" : "text-red-500",
            )}
          >
            {kpi.trend !== "flat" && (
              <svg
                className={cx("size-3.5", kpi.trend === "down" && "rotate-180")}
                viewBox="0 0 20 20"
                fill="currentColor"
              >
                <path fillRule="evenodd" d="M10 4l5 6h-3v6H8v-6H5l5-6z" />
              </svg>
            )}
            {kpi.delta}
          </span>
        )}
        <span className="text-slate-400">{kpi.sub}</span>
      </div>
    </Card>
  )
}

function KpiSkeleton() {
  return (
    <Card className="p-5">
      <div className="flex items-start justify-between">
        <Skeleton className="h-3.5 w-24" />
        <Skeleton className="size-8" rounded="lg" />
      </div>
      <Skeleton className="mt-3 h-8 w-24" rounded="lg" />
      <Skeleton className="mt-2 h-3 w-28" />
    </Card>
  )
}

/* ------------------------------------------------------------------ */
/* Chart tooltip                                                       */
/* ------------------------------------------------------------------ */
function ChartTip({ active, payload, label, unit, format }: any) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-lg border border-slate-200 bg-surface px-3 py-2 shadow-lg">
      <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">{label}</p>
      {payload.map((p: any) => (
        <p key={p.name} className="flex items-center gap-2 text-[13px] font-medium text-slate-700">
          <span className="size-2 rounded-full" style={{ background: p.color }} />
          <span>{p.name}</span>
          <span className="ms-auto tabular-nums">
            {format ? format(p.value) : `${p.value}${unit ?? ""}`}
          </span>
        </p>
      ))}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Test Health                                                         */
/* ------------------------------------------------------------------ */
type ChartMetric = "pass-fail" | "total-runs" | "success-rate" | "duration"

function TestHealth({
  series7,
  series30,
  hasRuns,
  loading,
  error,
  onRetry,
}: {
  series7: TrendPoint[] | null
  series30: TrendPoint[] | null
  hasRuns: boolean
  loading: boolean
  error: string | null
  onRetry: () => void
}) {
  const [tab, setTab] = useState("7 days")
  const [metric, setMetric] = useState<ChartMetric>("pass-fail")
  const isDark = useIsDark()
  const { t } = useLang()
  const grid = isDark ? "#1e2536" : "#EEF2F7"
  const axisTick = isDark ? "#7b8496" : "#94a3b8"
  const cursor = isDark ? "#2c3547" : "#cbd5e1"
  const series = tab === "30 days" ? series30 : series7
  const totals = series ? seriesTotals(series) : { passed: 0, failed: 0 }
  const denom = totals.passed + totals.failed
  const rate = denom > 0 ? Math.round((totals.passed / denom) * 1000) / 10 : null
  const donut = [
    { name: t("status.passed"), value: totals.passed, color: "#22C55E" },
    { name: t("status.failed"), value: totals.failed, color: "#EF4444" },
  ]
  /* Internal tab tokens stay English; only the displayed labels translate. */
  const tabLabels: Record<string, string> = {
    "7 days": t("dashboard.days7"),
    "30 days": t("dashboard.days30"),
  }
  /* Internal metric tokens stay English; only the displayed labels translate. */
  const metricOptions: { value: ChartMetric; label: string }[] = [
    { value: "pass-fail", label: t("dashboard.metric.passFail") },
    { value: "total-runs", label: t("dashboard.metric.totalRuns") },
    { value: "success-rate", label: t("dashboard.metric.successRate") },
    { value: "duration", label: t("dashboard.metric.duration") },
  ]
  const metricLabel = metricOptions.find((m) => m.value === metric)?.label ?? ""
  const subtitles: Record<ChartMetric, string> = {
    "pass-fail": t("page.dashboard.testHealthDesc"),
    "total-runs": t("dashboard.metricDesc.totalRuns"),
    "success-rate": t("dashboard.metricDesc.successRate"),
    "duration": t("dashboard.metricDesc.duration"),
  }
  const chartData: ({
    day: string
    rate?: number | null
  } & Partial<TrendPoint>)[] = !series
    ? []
    : metric === "success-rate"
      ? series.map((p) => {
          const tot = p.passed + p.failed
          return { day: p.day, rate: tot > 0 ? Math.round((p.passed / tot) * 1000) / 10 : null }
        })
      : series
  const hasDuration = !!series?.some((p) => p.avgDurationSec != null)

  return (
    <Card className="p-5">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="font-display text-base font-bold text-navy">{t("page.dashboard.testHealth")}</h3>
          <p className="text-[13px] text-slate-500">{subtitles[metric]}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Dropdown
            label={t("dashboard.metric.label")}
            options={metricOptions.map((m) => m.label)}
            value={metricLabel}
            onChange={(label) => {
              const found = metricOptions.find((m) => m.label === label)
              if (found) setMetric(found.value)
            }}
          />
          <Tabs
            tabs={[tabLabels["7 days"], tabLabels["30 days"]]}
            active={tabLabels[tab]}
            onChange={(l) => setTab(l === tabLabels["30 days"] ? "30 days" : "7 days")}
          />
        </div>
      </div>

      {loading ? (
        <div className={cx("grid grid-cols-1 gap-6", metric === "pass-fail" && "lg:grid-cols-[1fr_180px]")}>
          <Skeleton className="h-56" rounded="lg" />
          {metric === "pass-fail" && (
            <div className="flex flex-col items-center justify-center gap-4 border-t border-slate-100 pt-5 lg:border-s lg:border-t-0 lg:ps-6 lg:pt-0">
              <Skeleton className="size-32" rounded="full" />
              <Skeleton className="h-3 w-28" />
            </div>
          )}
        </div>
      ) : error ? (
        <ErrorState title={t("dashboard.testHealthLoadFailed")} description={error} onRetry={onRetry} />
      ) : !series || !hasRuns ? (
        <EmptyState
          title={t("dashboard.noTestActivity")}
          description={t("dashboard.noTestActivityDesc")}
        />
      ) : metric === "duration" && !hasDuration ? (
        <EmptyState
          title={t("dashboard.metric.durationEmpty")}
          description={t("dashboard.metric.durationEmptyDesc")}
        />
      ) : (
        <div className={cx("grid grid-cols-1 gap-6", metric === "pass-fail" && "lg:grid-cols-[1fr_180px]")}>
          <div className="h-56 min-h-0">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ top: 5, right: 8, left: -18, bottom: 0 }}>
                <defs>
                  <linearGradient id="gPass" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#22C55E" stopOpacity={0.25} />
                    <stop offset="100%" stopColor="#22C55E" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="gFail" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#EF4444" stopOpacity={0.2} />
                    <stop offset="100%" stopColor="#EF4444" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="gBlue" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#2563EB" stopOpacity={0.22} />
                    <stop offset="100%" stopColor="#2563EB" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid vertical={false} stroke={grid} />
                <XAxis
                  dataKey="day"
                  interval={tab === "30 days" ? 4 : 0}
                  tickLine={false}
                  axisLine={false}
                  tick={{ fontSize: 11, fill: axisTick }}
                />
                <YAxis
                  tickLine={false}
                  axisLine={false}
                  tick={{ fontSize: 11, fill: axisTick }}
                  width={metric === "success-rate" ? 46 : metric === "duration" ? 52 : 40}
                  domain={metric === "success-rate" ? [0, 100] : undefined}
                  tickFormatter={
                    metric === "success-rate"
                      ? (v) => `${v}%`
                      : metric === "duration"
                        ? (v) => formatDuration(v)
                        : undefined
                  }
                />
                <Tooltip
                  content={
                    <ChartTip
                      unit={metric === "success-rate" ? "%" : undefined}
                      format={metric === "duration" ? formatDuration : undefined}
                    />
                  }
                  cursor={{ stroke: cursor, strokeDasharray: "4 4" }}
                />
                {metric === "pass-fail" && (
                  <>
                    <Area type="monotone" dataKey="passed" name={t("status.passed")} stroke="#22C55E" strokeWidth={2} fill="url(#gPass)" />
                    <Area type="monotone" dataKey="failed" name={t("status.failed")} stroke="#EF4444" strokeWidth={2} fill="url(#gFail)" />
                  </>
                )}
                {metric === "total-runs" && (
                  <Area type="monotone" dataKey="runs" name={t("dashboard.metric.totalRuns")} stroke="#2563EB" strokeWidth={2} fill="url(#gBlue)" />
                )}
                {metric === "success-rate" && (
                  <Area type="monotone" dataKey="rate" name={t("dashboard.metric.successRate")} stroke="#2563EB" strokeWidth={2} fill="url(#gBlue)" />
                )}
                {metric === "duration" && (
                  <Area type="monotone" dataKey="avgDurationSec" name={t("dashboard.metric.duration")} stroke="#2563EB" strokeWidth={2} fill="url(#gBlue)" />
                )}
              </AreaChart>
            </ResponsiveContainer>
          </div>

          {metric === "pass-fail" && (
            <div className="flex flex-col items-center justify-center border-t border-slate-100 pt-5 lg:border-s lg:border-t-0 lg:ps-6 lg:pt-0">
              <div className="relative h-32 w-32 min-h-0">
                <ResponsiveContainer width="100%" height={128}>
                  <PieChart>
                    <Pie
                      data={donut}
                      dataKey="value"
                      innerRadius={44}
                      outerRadius={60}
                      paddingAngle={2}
                      startAngle={90}
                      endAngle={-270}
                      stroke="none"
                    >
                      {donut.map((d) => (
                        <Cell key={d.name} fill={d.color} />
                      ))}
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>
                <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                  <span className="font-display text-xl font-bold text-navy tabular-nums">{rate != null ? `${rate}%` : "—"}</span>
                  <span className="text-[10px] font-medium uppercase tracking-wide text-slate-400">{t("dashboard.passRate")}</span>
                </div>
              </div>
              <div className="mt-4 flex w-full flex-col gap-1.5">
                {donut.map((d) => (
                  <div key={d.name} className="flex items-center gap-2 text-[12px]">
                    <span className="size-2 rounded-full" style={{ background: d.color }} />
                    <span className="text-slate-500">{d.name}</span>
                    <span className="ms-auto font-semibold text-slate-700 tabular-nums">{d.value}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </Card>
  )
}

/* ------------------------------------------------------------------ */
/* Recent Runs                                                         */
/* ------------------------------------------------------------------ */
function RecentRuns({
  rows,
  loading,
  error,
  onRetry,
  onViewAll,
}: {
  rows: UiRun[] | null
  loading: boolean
  error: string | null
  onRetry: () => void
  /** Restored Overview action: navigate to the full Run History (old FE did this). */
  onViewAll?: () => void
}) {
  const [filter, setFilter] = useState("all")
  const { t } = useLang()
  const statusFor: Record<string, AppStatus> = {
    Passed: "PASS",
    Failed: "FAILED",
    Running: "RUNNING",
  }
  /* Filter tokens stay English; only displayed labels translate. */
  const filterOptions = ["all", "Passed", "Failed", "Running"]
  const filterLabels: Record<string, string> = {
    all: t("dashboard.allStatuses"),
    Passed: t("status.passed"),
    Failed: t("status.failed"),
    Running: t("status.running"),
  }
  const triggerLabel = (tr: string) =>
    tr === "Manual" ? t("trigger.manual") : tr === "Scheduled" ? t("trigger.scheduled") : t("trigger.unknown")
  const all = rows ?? []
  const shown = (filter === "all" ? all : all.filter((r) => r.status === statusFor[filter])).slice(0, 6)
  return (
    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
        <div>
          <h3 className="font-display text-base font-bold text-navy">{t("page.dashboard.recentRuns")}</h3>
          <p className="text-[13px] text-slate-500">{t("page.dashboard.recentRunsDesc")}</p>
        </div>
        <div className="flex items-center gap-2">
          <Dropdown
            options={filterOptions.map((f) => filterLabels[f])}
            value={filterLabels[filter]}
            onChange={(label) =>
              setFilter(filterOptions.find((f) => filterLabels[f] === label) ?? "all")
            }
          />
          <Button size="sm" variant="secondary" onClick={onViewAll} disabled={!onViewAll}>
            {t("common.viewAll")}
          </Button>
        </div>
      </div>

      {loading ? (
        <TableSkeleton rows={6} columns={5} />
      ) : error ? (
        <ErrorState title={t("dashboard.recentRunsLoadFailed")} description={error} onRetry={onRetry} />
      ) : all.length === 0 ? (
        <EmptyState
          title={t("dashboard.noRunsYet")}
          description={t("dashboard.noRunsYetDesc")}
        />
      ) : shown.length === 0 ? (
        <EmptyState
          title={t("dashboard.noMatchingRuns")}
          description={t("dashboard.noMatchingRunsDesc", { filter: filterLabels[filter] })}
        />
      ) : (
        <>
          {/* Desktop table */}
          <div className="hidden md:block">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-start text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                  <th className="px-5 py-2.5 font-semibold">{t("table.flow")}</th>
                  <th className="px-5 py-2.5 font-semibold">{t("table.status")}</th>
                  <th className="px-5 py-2.5 font-semibold">{t("table.trigger")}</th>
                  <th className="px-5 py-2.5 font-semibold">{t("table.duration")}</th>
                  <th className="px-5 py-2.5 font-semibold">{t("table.time")}</th>
                  <th className="px-5 py-2.5" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {shown.map((r) => (
                  <tr key={r.id} className="group transition-colors hover:bg-slate-50/70">
                    <td className="px-5 py-3.5">
                      <div className="font-medium text-slate-800">{r.flow}</div>
                      <div className="truncate font-mono text-[11px] text-slate-400">{r.id}</div>
                    </td>
                    <td className="px-5 py-3.5">
                      <StatusBadge status={r.status} />
                    </td>
                    <td className="px-5 py-3.5">
                      <span className="inline-flex items-center gap-1.5 text-[13px] text-slate-600">
                        <span className={cx("size-1.5 rounded-full", r.trigger === "Manual" ? "bg-brand-400" : "bg-slate-300")} />
                        {triggerLabel(r.trigger)}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 font-mono text-[13px] text-slate-500 tabular-nums">{r.duration}</td>
                    <td className="px-5 py-3.5 text-[13px] text-slate-500">{r.time}</td>
                    <td className="px-5 py-3.5 text-right">
                      <button className="rounded-md p-1.5 text-slate-300 transition-colors hover:bg-slate-100 hover:text-brand-400">
                        <svg className="size-4 rtl:-scale-x-100" viewBox="0 0 20 20" fill="currentColor">
                          <path fillRule="evenodd" d="M7.3 4.3a1 1 0 011.4 0l5 5a1 1 0 010 1.4l-5 5a1 1 0 01-1.4-1.4L11.58 10 7.3 5.7a1 1 0 010-1.4z" />
                        </svg>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <div className="divide-y divide-slate-50 md:hidden">
            {shown.map((r) => (
              <div key={r.id} className="px-4 py-3.5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-medium text-slate-800">{r.flow}</p>
                    <p className="truncate font-mono text-[11px] text-slate-400">{r.id}</p>
                  </div>
                  <StatusBadge status={r.status} />
                </div>
                <div className="mt-2 flex items-center gap-3 text-[12px] text-slate-500">
                  <span>{triggerLabel(r.trigger)}</span>
                  <span className="font-mono tabular-nums">{r.duration}</span>
                  <span className="ms-auto">{r.time}</span>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </Card>
  )
}

/* ------------------------------------------------------------------ */
/* Recent Failures                                                     */
/* ------------------------------------------------------------------ */
function RecentFailures({
  failures,
  loading,
  error,
  onRetry,
  onInspect,
}: {
  failures: UiFailure[] | null
  loading: boolean
  error: string | null
  onRetry: () => void
  /** Restored Overview action: open the failed run in Run History (old FE did this). */
  onInspect?: (runId: string) => void
}) {
  const list = failures ?? []
  const { t } = useLang()
  return (
    <Card className="flex h-full flex-col overflow-hidden">
      <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
        <div className="flex items-center gap-2">
          <h3 className="font-display text-base font-bold text-navy">{t("page.dashboard.recentFailures")}</h3>
          {!loading && !error && (
            <span className="rounded-full bg-red-50 px-2 py-0.5 text-[11px] font-bold text-red-600">
              {list.length}
            </span>
          )}
        </div>
        <AiPill />
      </div>
      {loading ? (
        <div className="flex-1 divide-y divide-slate-50">
          {[0, 1, 2].map((i) => (
            <div key={i} className="flex items-start gap-3 px-5 py-4">
              <Skeleton className="size-7 shrink-0" rounded="lg" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-3.5 w-2/3" />
                <Skeleton className="h-3 w-full" />
                <Skeleton className="h-3 w-1/3" />
              </div>
            </div>
          ))}
        </div>
      ) : error ? (
        <ErrorState title={t("dashboard.recentFailuresLoadFailed")} description={error} onRetry={onRetry} />
      ) : list.length === 0 ? (
        <EmptyState
          title={t("dashboard.noRecentFailures")}
          description={t("dashboard.noRecentFailuresDesc")}
        />
      ) : (
        <div className="flex-1 divide-y divide-slate-50">
          {list.map((f) => (
            <div key={f.id} className="group px-5 py-4 transition-colors hover:bg-red-50/30">
              <div className="flex items-start gap-3">
                <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg bg-red-50 text-error">
                  <svg className="size-4" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M10 2a8 8 0 100 16 8 8 0 000-16zm1 4a1 1 0 10-2 0v4a1 1 0 102 0V6zm-1 7a1 1 0 100 2 1 1 0 000-2z" />
                  </svg>
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <p className="truncate text-sm font-semibold text-slate-800">{f.name}</p>
                    <span className="shrink-0 text-[11px] text-slate-400">{f.time}</span>
                  </div>
                  <p className="mt-1 line-clamp-2 font-mono text-[12px] leading-relaxed text-slate-500">
                    {f.detail}
                  </p>
                  <div className="mt-2.5 flex items-center justify-between gap-2">
                    <span className="inline-flex items-center gap-1.5 text-[11px] text-slate-400">
                      <svg className="size-3.5" viewBox="0 0 20 20" fill="currentColor">
                        <path d="M10 2a5 5 0 00-5 5c0 3.5 5 9 5 9s5-5.5 5-9a5 5 0 00-5-5zm0 7a2 2 0 110-4 2 2 0 010 4z" />
                      </svg>
                      {f.client}
                    </span>
                    {f.runId && onInspect ? (
                      <Button
                        size="sm"
                        variant="secondary"
                        className="h-7 px-2.5 text-[12px]"
                        onClick={() => onInspect(f.runId as string)}
                      >
                        {t("page.dashboard.inspectRun")}
                        <svg className="size-3.5 rtl:-scale-x-100" viewBox="0 0 20 20" fill="currentColor">
                          <path fillRule="evenodd" d="M7.3 4.3a1 1 0 011.4 0l5 5a1 1 0 010 1.4l-5 5a1 1 0 01-1.4-1.4L11.58 10 7.3 5.7a1 1 0 010-1.4z" />
                        </svg>
                      </Button>
                    ) : null}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  )
}

/* ------------------------------------------------------------------ */
/* Dashboard                                                           */
/* ------------------------------------------------------------------ */
export function Dashboard({
  onSelect,
  onOpenRun,
}: {
  /** Navigate to a main section (Run History for "View all"). */
  onSelect?: (k: string) => void
  /** Deep-link a failed run into Run History (same contract as Alerts). */
  onOpenRun?: (runId: string) => void
}) {
  const { user, logout } = useAuth()
  const { t, lang } = useLang()
  const clientId = user?.clientId ?? null
  const { runs, alerts, reload } = useDashboardData(clientId, logout)

  const tz = useMemo(() => clientTimezoneOf(runs.data ?? []), [runs.data])
  const summary = useMemo(() => (runs.data ? summarizeRuns(runs.data, tz) : null), [runs.data, tz])
  // `lang` is a dependency: the mappers below localize labels at mapping time.
  const kpis = useMemo(() => (summary ? toKpis(summary) : null), [summary, lang])
  const series7 = useMemo(() => (runs.data ? buildDailySeries(runs.data, 7, tz) : null), [runs.data, tz, lang])
  const series30 = useMemo(() => (runs.data ? buildDailySeries(runs.data, 30, tz) : null), [runs.data, tz, lang])
  const runRows = useMemo(() => (runs.data ? toRunRows(runs.data) : null), [runs.data, lang])
  const failures = useMemo(() => (alerts.data ? toFailures(alerts.data) : null), [alerts.data, lang])
  const hasRuns = (runs.data?.length ?? 0) > 0

  if (clientId == null) {
    return (
      <Card>
        <EmptyState
          title={t("dashboard.noClientLinked")}
          description={t("dashboard.noClientLinkedDesc")}
        />
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      {/* KPI cards */}
      {runs.loading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <KpiSkeleton key={i} />
          ))}
        </div>
      ) : runs.error || !kpis ? (
        <Card>
          <ErrorState title={t("dashboard.loadFailed")} description={runs.error ?? undefined} onRetry={reload} />
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {kpis.map((k) => (
            <KpiCard key={k.label} kpi={k} />
          ))}
        </div>
      )}

      {/* Health + failures */}
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1.6fr_1fr]">
        <TestHealth
          series7={series7}
          series30={series30}
          hasRuns={hasRuns}
          loading={runs.loading}
          error={runs.error}
          onRetry={reload}
        />
        <RecentFailures failures={failures} loading={alerts.loading} error={alerts.error} onRetry={reload} onInspect={onOpenRun} />
      </div>

      {/* Recent runs */}
      <RecentRuns rows={runRows} loading={runs.loading} error={runs.error} onRetry={reload} onViewAll={onSelect ? () => onSelect("history") : undefined} />
    </div>
  )
}
