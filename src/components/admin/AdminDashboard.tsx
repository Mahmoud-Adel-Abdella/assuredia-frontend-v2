import React, { useEffect, useState, useCallback } from "react"
import { Button, Card, cx } from "../primitives"
import { useLang } from "../../lib/i18n"
import {
  apiAdminOverview,
  type AdminOverviewResponse,
  type AdminOverviewClient,
  type AdminOverviewWeeklyBucket,
  type AdminOverviewActivityEvent,
  type AdminOverviewExecutionHealth,
  ApiError,
} from "../../lib/api"
import { parseBackendTimestamp } from "../../lib/dashboardData"

/* Closed-set backend tokens → i18n label keys (tokens themselves never change). */
const RUN_STATUS_LABEL_KEY: Record<string, string> = {
  PASS: "status.passed",
  PASSED: "status.passed",
  FAILED: "status.failed",
  FAIL: "status.failed",
  RUNNING: "status.running",
  CANCELLED: "status.cancelled",
}

const CLIENT_STATUS_LABEL_KEY: Record<string, string> = {
  ACTIVE: "status.active",
  INACTIVE: "status.inactive",
  SUSPENDED: "admin.suspended",
}

function formatRelativeTime(ts: string | null | undefined, locale: string): string {
  const date = parseBackendTimestamp(ts)
  if (!date) return "—"
  const now = Date.now()
  const diffMs = now - date.getTime()
  if (diffMs < 0 || diffMs < 60_000) return locale === "ar" ? "الآن" : "Just now"
  const mins = Math.floor(diffMs / 60_000)
  if (mins < 60) return locale === "ar" ? `منذ ${mins} د` : `${mins} min ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return locale === "ar" ? `منذ ${hours} س` : `${hours} hr ago`
  const days = Math.floor(hours / 24)
  if (days === 1) return locale === "ar" ? "أمس" : "Yesterday"
  if (days < 7) return locale === "ar" ? `منذ ${days} أيام` : `${days} days ago`
  return date.toLocaleDateString(locale === "ar" ? "ar-EG" : "en-US", { month: "short", day: "numeric" })
}

/* ------------------------------------------------------------------ */
/* KPI card                                                           */
/* ------------------------------------------------------------------ */
function KpiCard({
  label,
  value,
  sub,
  tone,
}: {
  label: string
  value: string | number
  sub?: string
  tone: "slate" | "success" | "error" | "brand" | "warning"
}) {
  const dot = {
    slate: "bg-slate-300",
    success: "bg-success",
    error: "bg-error",
    brand: "bg-brand-600",
    warning: "bg-warning",
  }[tone]

  return (
    <Card className="px-4 py-4">
      <div className="flex items-center gap-1.5">
        <span className={cx("size-1.5 rounded-full", dot)} />
        <p className="text-[12px] font-medium text-slate-400">{label}</p>
      </div>
      <p className="mt-1.5 font-display text-2xl font-bold leading-none text-navy">{value}</p>
      {sub && <p className="mt-1 text-[11px] text-slate-400">{sub}</p>}
    </Card>
  )
}

/* ------------------------------------------------------------------ */
/* Run status badge (inline)                                          */
/* ------------------------------------------------------------------ */
function RunBadge({ status }: { status: string | null }) {
  const { t } = useLang()
  if (!status) return <span className="text-[12px] text-slate-400">—</span>

  const normalized = status.toUpperCase()
  const isPass = normalized === "PASS" || normalized === "PASSED"
  const isFail = normalized === "FAILED" || normalized === "FAIL"
  const isRunning = normalized === "RUNNING"

  const style = isPass
    ? { bg: "bg-emerald-50", text: "text-emerald-700", ring: "ring-emerald-600/10", dot: "bg-success" }
    : isFail
    ? { bg: "bg-red-50", text: "text-red-700", ring: "ring-red-600/10", dot: "bg-error" }
    : isRunning
    ? { bg: "bg-brand-50", text: "text-brand-300", ring: "ring-brand-600/10", dot: "bg-brand-600 animate-pulse" }
    : { bg: "bg-slate-100", text: "text-slate-500", ring: "ring-slate-400/10", dot: "bg-slate-400" }

  const labelKey = RUN_STATUS_LABEL_KEY[normalized] ?? "status.unknown"

  return (
    <span className={cx("inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ring-inset", style.bg, style.text, style.ring)}>
      <span className={cx("size-1.5 rounded-full", style.dot)} />
      {t(labelKey)}
    </span>
  )
}

/* ------------------------------------------------------------------ */
/* Client status pill                                                 */
/* ------------------------------------------------------------------ */
function ClientStatusPill({ status }: { status: AdminOverviewClient["status"] }) {
  const { t } = useLang()
  const map = {
    ACTIVE: { bg: "bg-emerald-50", text: "text-emerald-700", ring: "ring-emerald-600/10", dot: "bg-success" },
    INACTIVE: { bg: "bg-slate-100", text: "text-slate-500", ring: "ring-slate-400/10", dot: "bg-slate-400" },
    SUSPENDED: { bg: "bg-red-50", text: "text-red-700", ring: "ring-red-600/10", dot: "bg-error" },
  }[status] ?? { bg: "bg-slate-100", text: "text-slate-500", ring: "ring-slate-400/10", dot: "bg-slate-400" }

  return (
    <span className={cx("inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ring-inset", map.bg, map.text, map.ring)}>
      <span className={cx("size-1.5 rounded-full", map.dot)} />
      {t(CLIENT_STATUS_LABEL_KEY[status] ?? "status.unknown")}
    </span>
  )
}

/* ------------------------------------------------------------------ */
/* 7-day execution chart                                              */
/* ------------------------------------------------------------------ */
function ExecutionChart({ buckets }: { buckets: AdminOverviewWeeklyBucket[] }) {
  const { t } = useLang()
  const maxTotal = Math.max(...buckets.map((d) => d.passed + d.failed), 1)

  return (
    <div>
      <h3 className="mb-3 font-display text-sm font-bold text-navy">{t("admin.dash.chart7")}</h3>
      <div className="flex items-end gap-1.5" style={{ height: 80 }}>
        {buckets.map((day) => {
          const total = day.passed + day.failed
          const heightPct = total > 0 ? (total / maxTotal) * 100 : 0
          const failedPct = total > 0 ? (day.failed / total) * 100 : 0

          return (
            <div key={day.date || day.label} className="group relative flex flex-1 flex-col items-center gap-1">
              {/* Bar */}
              <div
                className="relative w-full overflow-hidden rounded-t-sm bg-slate-100"
                style={{ height: `${Math.max(heightPct, 4)}%` }}
                title={t("admin.dash.chartTip", { label: day.label, passed: day.passed, failed: day.failed })}
              >
                {total > 0 && (
                  <>
                    <div className="absolute inset-0 bg-success opacity-80" />
                    <div
                      className="absolute bottom-0 left-0 right-0 bg-error opacity-90"
                      style={{ height: `${failedPct}%` }}
                    />
                  </>
                )}
              </div>
            </div>
          )
        })}
      </div>
      {/* Labels */}
      <div className="mt-1.5 flex gap-1.5">
        {buckets.map((day) => (
          <div key={day.date || day.label} className="flex-1 text-center font-mono text-[9px] text-slate-400">
            {day.label}
          </div>
        ))}
      </div>
      {/* Legend */}
      <div className="mt-3 flex items-center gap-4 text-[11px] text-slate-400">
        <span className="flex items-center gap-1.5">
          <span className="size-2 rounded-sm bg-success opacity-80" />
          {t("status.passed")}
        </span>
        <span className="flex items-center gap-1.5">
          <span className="size-2 rounded-sm bg-error opacity-90" />
          {t("status.failed")}
        </span>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Execution health status strip                                      */
/* ------------------------------------------------------------------ */
function ExecutionHealth({ health }: { health: AdminOverviewExecutionHealth }) {
  const { t } = useLang()

  const items = [
    { labelKey: "status.running", value: health.running, color: "text-brand-300", dot: "bg-brand-600 animate-pulse" },
    { labelKey: "status.passed", value: health.passed, color: "text-emerald-700", dot: "bg-success" },
    { labelKey: "status.failed", value: health.failed, color: "text-red-700", dot: "bg-error" },
    { labelKey: "admin.total", value: health.total, color: "text-slate-700", dot: "bg-slate-300" },
  ]

  return (
    <div className="grid grid-cols-4 gap-3">
      {items.map(({ labelKey, value, color, dot }) => (
        <div key={labelKey} className="rounded-lg border border-slate-200 bg-elevated px-3 py-2.5 text-center">
          <div className="flex items-center justify-center gap-1">
            <span className={cx("size-1.5 rounded-full", dot)} />
            <p className="text-[10px] text-slate-400">{t(labelKey)}</p>
          </div>
          <p className={cx("mt-1 font-display text-lg font-bold", color)}>{value}</p>
        </div>
      ))}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Activity event row                                                 */
/* ------------------------------------------------------------------ */
const activityIcon: Record<string, React.ReactNode> = {
  client_created: (
    <svg className="size-3.5" viewBox="0 0 20 20" fill="currentColor">
      <path d="M8 9a3 3 0 100-6 3 3 0 000 6zM8 11a6 6 0 016 6H2a6 6 0 016-6zM16 7a1 1 0 10-2 0v1h-1a1 1 0 100 2h1v1a1 1 0 102 0v-1h1a1 1 0 100-2h-1V7z" />
    </svg>
  ),
  flow_executed: (
    <svg className="size-3.5" viewBox="0 0 20 20" fill="currentColor">
      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.7-9.3a1 1 0 00-1.4-1.4L9 10.6 7.7 9.3a1 1 0 00-1.4 1.4l2 2a1 1 0 001.4 0l4-4z" />
    </svg>
  ),
  schedule_completed: (
    <svg className="size-3.5" viewBox="0 0 20 20" fill="currentColor">
      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.3.7l2.5 2.5a1 1 0 001.4-1.4L11 9.6V6z" />
    </svg>
  ),
  test_failed: (
    <svg className="size-3.5" viewBox="0 0 20 20" fill="currentColor">
      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.7 7.3a1 1 0 00-1.4 1.4L8.6 10l-1.3 1.3a1 1 0 101.4 1.4L10 11.4l1.3 1.3a1 1 0 001.4-1.4L11.4 10l1.3-1.3a1 1 0 00-1.4-1.4L10 8.6 8.7 7.3z" />
    </svg>
  ),
  ai_generated: (
    <svg className="size-3.5" viewBox="0 0 20 20" fill="currentColor">
      <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
    </svg>
  ),
  alert_triggered: (
    <svg className="size-3.5" viewBox="0 0 20 20" fill="currentColor">
      <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" />
    </svg>
  ),
}

const activityIconColor: Record<string, string> = {
  PASS: "bg-emerald-50 text-success",
  FAILED: "bg-red-50 text-error",
  INFO: "bg-brand-50 text-brand-400",
}

function ActivityRow({ event, lang }: { event: AdminOverviewActivityEvent; lang: string }) {
  const color = activityIconColor[event.status ?? "INFO"] ?? "bg-brand-50 text-brand-400"
  const icon = activityIcon[event.type] ?? activityIcon.flow_executed
  const timeFormatted = formatRelativeTime(event.timestamp, lang)

  return (
    <div className="flex items-start gap-3 py-2.5">
      <span className={cx("mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-md", color)}>
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[13px] text-slate-600">{event.message}</p>
        <p className="text-[11px] text-slate-400">{event.client}</p>
      </div>
      <span className="shrink-0 text-[11px] text-slate-400">{timeFormatted}</span>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Admin Dashboard                                                    */
/* ------------------------------------------------------------------ */
export function AdminDashboard({ onNavigate }: { onNavigate: (k: string) => void }) {
  const { t, lang } = useLang()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [data, setData] = useState<AdminOverviewResponse | null>(null)

  const loadData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const resp = await apiAdminOverview()
      setData(resp)
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        setError(t("errors.unauthorized"))
      } else if (err instanceof ApiError && err.status === 403) {
        setError(t("errors.forbidden"))
      } else {
        setError(t("admin.dash.loadFailed"))
      }
    } finally {
      setLoading(false)
    }
  }, [t])

  useEffect(() => {
    loadData()
  }, [loadData])

  if (loading && !data) {
    return (
      <div className="space-y-6">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-warning">
            {t("nav.adminConsole")}
          </p>
          <h1 className="mt-1 font-display text-2xl font-bold tracking-tight text-navy">
            {t("admin.dash.title")}
          </h1>
          <p className="mt-1 text-[13px] text-slate-500">
            {t("admin.dash.subtitle")}
          </p>
        </div>
        <div className="flex h-64 items-center justify-center rounded-lg border border-slate-200 bg-white">
          <div className="flex items-center gap-2 text-sm text-slate-500">
            <span className="size-4 animate-spin rounded-full border-2 border-brand-500 border-t-transparent" />
            <span>{t("common.loading")}</span>
          </div>
        </div>
      </div>
    )
  }

  if (error && !data) {
    return (
      <div className="space-y-6">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-warning">
            {t("nav.adminConsole")}
          </p>
          <h1 className="mt-1 font-display text-2xl font-bold tracking-tight text-navy">
            {t("admin.dash.title")}
          </h1>
          <p className="mt-1 text-[13px] text-slate-500">
            {t("admin.dash.subtitle")}
          </p>
        </div>
        <Card className="flex flex-col items-center justify-center p-8 text-center">
          <p className="text-sm font-medium text-error">{error}</p>
          <Button variant="secondary" size="sm" className="mt-4" onClick={loadData}>
            {t("common.retry")}
          </Button>
        </Card>
      </div>
    )
  }

  if (!data) return null

  const { kpis, executionHealth, weeklyChart, clients, recentActivity } = data
  const successRateDisplay = kpis.successRate30d != null ? `${kpis.successRate30d}%` : "—"

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-warning">
          {t("nav.adminConsole")}
        </p>
        <h1 className="mt-1 font-display text-2xl font-bold tracking-tight text-navy">
          {t("admin.dash.title")}
        </h1>
        <p className="mt-1 text-[13px] text-slate-500">
          {t("admin.dash.subtitle")}
        </p>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        <KpiCard label={t("admin.dash.totalClients")} value={kpis.totalClients} tone="slate" />
        <KpiCard
          label={t("admin.dash.activeClients")}
          value={kpis.activeClients}
          sub={t("admin.dash.inactiveCount", { count: kpis.inactiveClients })}
          tone="success"
        />
        <KpiCard label={t("admin.totalRuns")} value={kpis.totalRuns.toLocaleString()} tone="brand" />
        <KpiCard label={t("admin.dash.failedRuns")} value={kpis.failedRuns30d} sub={t("admin.dash.last30")} tone="error" />
        <KpiCard label={t("admin.successRate")} value={successRateDisplay} sub={t("admin.dash.last30")} tone="warning" />
      </div>

      {/* Execution health strip */}
      <Card className="p-5">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-display text-sm font-bold text-navy">{t("admin.dash.execHealth")}</h2>
          <button onClick={() => onNavigate("runs")} className="inline-flex items-center gap-1 text-[12px] font-medium text-brand-300 hover:text-brand-400">
            {t("admin.dash.viewAllRuns")}
            <span className="rtl:-scale-x-100">→</span>
          </button>
        </div>
        <ExecutionHealth health={executionHealth} />
      </Card>

      {/* Two-column main area */}
      <div className="grid gap-6 xl:grid-cols-[1fr_320px]">
        {/* Client table */}
        <Card className="overflow-hidden">
          <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
            <h2 className="font-display text-sm font-bold text-navy">{t("admin.navClients")}</h2>
            <button onClick={() => onNavigate("clients")} className="inline-flex items-center gap-1 text-[12px] font-medium text-brand-300 hover:text-brand-400">
              {t("admin.dash.manageClients")}
              <span className="rtl:-scale-x-100">→</span>
            </button>
          </div>
          {/* Desktop table */}
          <div className="hidden lg:block">
            <table className="w-full">
              <thead>
                <tr className="text-start text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                  <th className="px-5 py-3 font-semibold">{t("run.client")}</th>
                  <th className="px-4 py-3 font-semibold">{t("table.status")}</th>
                  <th className="px-4 py-3 font-semibold">{t("admin.flows")}</th>
                  <th className="px-4 py-3 font-semibold">{t("admin.recentRun")}</th>
                  <th className="px-4 py-3 font-semibold">{t("admin.successRate")}</th>
                  <th className="px-4 py-3 font-semibold">{t("admin.lastActivity")}</th>
                  <th className="px-4 py-3 text-end font-semibold">{t("admin.action")}</th>
                </tr>
              </thead>
              <tbody>
                {clients.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-5 py-8 text-center text-sm text-slate-400">
                      {t("admin.dash.noClients")}
                    </td>
                  </tr>
                ) : (
                  clients.map((client) => {
                    const sr = client.successRate != null ? `${client.successRate}%` : "—"
                    const formattedActivity = formatRelativeTime(client.lastActivity, lang)
                    return (
                      <tr
                        key={client.id}
                        className="group border-t border-slate-100 transition-colors hover:bg-slate-50/60"
                      >
                        <td className="px-5 py-3.5">
                          <p className="text-[13px] font-semibold text-navy">{client.name}</p>
                        </td>
                        <td className="px-4 py-3.5">
                          <ClientStatusPill status={client.status} />
                        </td>
                        <td className="px-4 py-3.5 text-[13px] text-slate-500">{client.flows}</td>
                        <td className="px-4 py-3.5">
                          <RunBadge status={client.recentRun} />
                        </td>
                        <td className="px-4 py-3.5">
                          {client.successRate != null ? (
                            <div className="flex items-center gap-2">
                              <div className="h-1.5 w-16 overflow-hidden rounded-full bg-slate-100">
                                <div
                                  className={cx(
                                    "h-full rounded-full",
                                    client.successRate >= 95 ? "bg-success" : client.successRate >= 85 ? "bg-warning" : "bg-error",
                                  )}
                                  style={{ width: `${Math.min(Math.max(client.successRate, 0), 100)}%` }}
                                />
                              </div>
                              <span className="font-mono text-[12px] text-slate-500">{sr}</span>
                            </div>
                          ) : (
                            <span className="font-mono text-[12px] text-slate-400">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3.5 text-[13px] text-slate-400">{formattedActivity}</td>
                        <td className="px-4 py-3.5 text-end">
                          <Button variant="ghost" size="sm" onClick={() => onNavigate("clients")}>
                            {t("common.view")}
                          </Button>
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>
          {/* Mobile cards */}
          <div className="divide-y divide-slate-100 lg:hidden">
            {clients.length === 0 ? (
              <div className="px-4 py-8 text-center text-sm text-slate-400">
                {t("admin.dash.noClients")}
              </div>
            ) : (
              clients.map((client) => {
                const sr = client.successRate != null ? `${client.successRate}%` : "—"
                const formattedActivity = formatRelativeTime(client.lastActivity, lang)
                return (
                  <div key={client.id} className="flex items-center justify-between px-4 py-3">
                    <div>
                      <p className="text-[13px] font-semibold text-navy">{client.name}</p>
                      <p className="text-[11px] text-slate-400">{t("admin.clients.successShort", { rate: sr })} · {formattedActivity}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <ClientStatusPill status={client.status} />
                      <RunBadge status={client.recentRun} />
                    </div>
                  </div>
                )
              })
            )}
          </div>
        </Card>

        {/* Right column: chart + activity */}
        <div className="space-y-6">
          {/* 7-day chart */}
          <Card className="p-5">
            <ExecutionChart buckets={weeklyChart} />
          </Card>

          {/* Activity feed */}
          <Card className="p-5">
            <div className="flex items-center justify-between pb-1">
              <h2 className="font-display text-sm font-bold text-navy">{t("admin.dash.recentActivity")}</h2>
            </div>
            {recentActivity.length === 0 ? (
              <div className="py-6 text-center text-sm text-slate-400">
                {t("admin.dash.noActivity")}
              </div>
            ) : (
              <div className="mt-1 divide-y divide-slate-100">
                {recentActivity.slice(0, 6).map((ev) => (
                  <ActivityRow key={ev.id} event={ev} lang={lang} />
                ))}
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  )
}

export default AdminDashboard
