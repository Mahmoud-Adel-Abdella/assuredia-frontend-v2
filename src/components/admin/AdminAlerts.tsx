import React, { useCallback, useEffect, useMemo, useState } from "react"
import { Button, Card, ErrorState, cx, useToast } from "../primitives"
import { langLocale, useLang } from "../../lib/i18n"
import { useAuth } from "../../lib/auth"
import { parseBackendTimestamp } from "../../lib/dashboardData"
import {
  ApiError,
  apiAlerts,
  apiClientRuns,
  type DashboardAlert,
} from "../../lib/api"
import { useHistoryRun, toHistoryEntry, type HistoryEntry } from "../../lib/runHistory"
import { RunDetail } from "../RunDetail"

/* ------------------------------------------------------------------ */
/* Admin Alerts — real backend data.                                   */
/*                                                                     */
/* GET /dashboard-api/alerts is role-scoped server-side: an ADMIN      */
/* receives failure alerts for EVERY client, a CLIENT only its own —   */
/* the same endpoint the Client Alerts page uses, reused here without  */
/* any client-side scoping.                                            */
/*                                                                     */
/* The backend derives alerts from failed runs: severity is exactly    */
/* "error" | "warning" and lifecycle is resolutionState OPEN/RESOLVED  */
/* (there is no "Acknowledged" state and no delete endpoint — those    */
/* mock concepts are not rendered). isRead persists in test_runs and   */
/* feeds the real unread count in the sidebar badge.                   */
/* The "Execution" action opens the related run via the real run       */
/* history contract; "AI Analysis" stays a visual affordance until the */
/* Admin AI Analysis integration phase (the admin AI page is still     */
/* mock) — it is left intact, not faked.                               */
/* ------------------------------------------------------------------ */

type AlertResolution = "OPEN" | "RESOLVED"
type AlertSeverity = "error" | "warning"

const SEVERITY_LABEL_KEY: Record<AlertSeverity, string> = {
  error: "admin.alerts.severityError",
  warning: "admin.alerts.severityWarning",
}

const RESOLUTION_LABEL_KEY: Record<AlertResolution, string> = {
  OPEN: "admin.alertStatus.open",
  RESOLVED: "status.resolved",
}

const STATUS_TABS = [
  { key: "All", labelKey: "common.all" },
  { key: "OPEN", labelKey: "admin.alertStatus.open" },
  { key: "RESOLVED", labelKey: "status.resolved" },
] as const

const SEVERITY_OPTIONS = [
  { value: "All", labelKey: "common.all" },
  { value: "error", labelKey: "admin.alerts.severityError" },
  { value: "warning", labelKey: "admin.alerts.severityWarning" },
] as const

function severityOf(a: DashboardAlert): AlertSeverity {
  return a.severity === "warning" ? "warning" : "error"
}

function resolutionOf(a: DashboardAlert): AlertResolution {
  return String(a.resolutionState ?? "OPEN").toUpperCase() === "RESOLVED" ? "RESOLVED" : "OPEN"
}

function formatStamp(date: Date | null): string {
  if (!date) return "—"
  return date.toLocaleDateString(langLocale(), { month: "short", day: "numeric", year: "numeric" })
}

function SeverityBadge({ severity }: { severity: AlertSeverity }) {
  const { t } = useLang()
  const map: Record<AlertSeverity, { bg: string; text: string; ring: string; dot: string }> = {
    error: { bg: "bg-red-50", text: "text-red-700", ring: "ring-red-600/10", dot: "bg-error" },
    warning: { bg: "bg-amber-50", text: "text-amber-700", ring: "ring-amber-600/10", dot: "bg-warning" },
  }
  const s = map[severity]
  return (
    <span className={cx("inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1 ring-inset", s.bg, s.text, s.ring)}>
      <span className={cx("size-1.5 rounded-full", s.dot)} />
      {t(SEVERITY_LABEL_KEY[severity])}
    </span>
  )
}

function AlertStatusPill({ status }: { status: AlertResolution }) {
  const { t } = useLang()
  const map = {
    OPEN: { bg: "bg-red-50", text: "text-red-700", ring: "ring-red-600/10" },
    RESOLVED: { bg: "bg-emerald-50", text: "text-emerald-700", ring: "ring-emerald-600/10" },
  }[status]
  return (
    <span className={cx("inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1 ring-inset", map.bg, map.text, map.ring)}>
      {t(RESOLUTION_LABEL_KEY[status])}
    </span>
  )
}

export function AdminAlerts({ onAlertsChanged }: { onAlertsChanged?: () => void } = {}) {
  const { t } = useLang()
  const toast = useToast()
  const { logout } = useAuth()

  const [alerts, setAlerts] = useState<DashboardAlert[] | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)

  const [statusFilter, setStatusFilter] = useState<"All" | AlertResolution>("All")
  const [severityFilter, setSeverityFilter] = useState<"All" | AlertSeverity>("All")
  const [clientFilter, setClientFilter] = useState("all")

  /* ---- Related-run detail (real run history contract) ---------------- */
  const [openEntry, setOpenEntry] = useState<HistoryEntry | null>(null)
  const [openClientId, setOpenClientId] = useState<number | null>(null)
  const [openClientName, setOpenClientName] = useState("")
  const [resolving, setResolving] = useState(false)

  const loadList = useCallback(async (opts: { silent?: boolean } = {}) => {
    if (!opts.silent) {
      setAlerts(null)
      setLoadError(null)
    }
    try {
      const data = await apiAlerts(200)
      setAlerts(data)
      onAlertsChanged?.()
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        logout()
        return
      }
      if (!opts.silent) setLoadError(err instanceof Error ? err.message : t("page.alerts.loadError"))
    }
  }, [logout, onAlertsChanged, t])

  useEffect(() => {
    void loadList()
  }, [loadList, reloadKey])

  /* ---- Derived state ------------------------------------------------- */
  const allAlerts = alerts ?? []

  const openCount = allAlerts.filter((a) => resolutionOf(a) === "OPEN").length
  const errorCount = allAlerts.filter((a) => severityOf(a) === "error").length
  const resolvedCount = allAlerts.filter((a) => resolutionOf(a) === "RESOLVED").length

  const clients = useMemo(() => {
    const seen = new Map<string, string>()
    for (const a of allAlerts) {
      if (a.clientId != null) seen.set(String(a.clientId), a.client ?? `#${a.clientId}`)
    }
    return Array.from(seen.entries()).sort((a, b) => a[1].localeCompare(b[1]))
  }, [allAlerts])

  const filtered = useMemo(() => allAlerts.filter((a) => {
    if (statusFilter !== "All" && resolutionOf(a) !== statusFilter) return false
    if (severityFilter !== "All" && severityOf(a) !== severityFilter) return false
    if (clientFilter !== "all" && String(a.clientId ?? "") !== clientFilter) return false
    return true
  }), [allAlerts, statusFilter, severityFilter, clientFilter])

  const filtersActive = statusFilter !== "All" || severityFilter !== "All" || clientFilter !== "all"

  /* ---- Open the related execution (existing RunDetail view) ---------- */
  const { run: openRun, pollError, cancel, retryAnalysis } = useHistoryRun(
    openEntry,
    openClientId,
    openClientName,
    logout,
  )
  const [aiRetrying, setAiRetrying] = useState(false)

  async function handleRetryAi() {
    if (aiRetrying) return
    setAiRetrying(true)
    try {
      const result = await retryAnalysis()
      if (!result.ok && result.message) {
        toast({ title: t("run.unableToStartAnalysis"), description: result.message, variant: "error" })
      }
    } finally {
      setAiRetrying(false)
    }
  }

  async function handleCancel() {
    const result = await cancel()
    if (result.ok) {
      toast({ title: t("autrun.cancelRequestedTitle"), description: t("autrun.cancelRequestedDesc"), variant: "info" })
    } else if (result.alreadyFinished) {
      toast({ title: t("autrun.runAlreadyFinishedTitle"), description: t("autrun.runAlreadyFinishedDesc"), variant: "info" })
    } else if (result.message) {
      toast({ title: t("autrun.cancelFailedTitle"), description: result.message, variant: "error" })
    }
  }

  async function openExecution(a: DashboardAlert) {
    if (resolving || a.clientId == null) return
    setResolving(true)
    try {
      const rows = await apiClientRuns(a.clientId, 200)
      const row = rows.find((r) => r.run_id != null && r.run_id === a.runId) ?? rows.find((r) => String(r.id) === String(a.runId))
      const entry = row ? toHistoryEntry(row, a.client ?? "") : null
      if (entry) {
        setOpenClientId(a.clientId)
        setOpenClientName(a.client ?? "")
        setOpenEntry(entry)
      } else {
        toast({ title: t("history.runNotFound"), description: t("history.runNotFoundDesc"), variant: "warning" })
      }
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        logout()
        return
      }
      toast({
        title: t("history.openRunFailed"),
        description: err instanceof Error ? err.message : t("common.somethingWentWrong"),
        variant: "error",
      })
    } finally {
      setResolving(false)
    }
  }

  /* ---- Detail view (existing RunDetail) ------------------------------- */
  if (openEntry && openRun) {
    return (
      <div className="space-y-6">
        <RunDetail
          run={openRun}
          onBack={() => { setOpenEntry(null); void loadList({ silent: true }) }}
          onCancel={handleCancel}
          onRetryAi={openRun.ai?.retryable ? handleRetryAi : undefined}
          aiRetrying={aiRetrying}
          backLabel={t("admin.alerts.backToList")}
        />
        {pollError && (
          <Card>
            <ErrorState title={t("history.runUnavailable")} description={pollError} />
          </Card>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-warning">{t("nav.adminConsole")}</p>
          <h1 className="mt-1 font-display text-2xl font-bold tracking-tight text-navy">{t("admin.alerts.title")}</h1>
          <p className="mt-1 text-[13px] text-slate-500">{t("admin.alerts.subtitle")}</p>
        </div>
        {openCount > 0 && (
          <div className="flex items-center gap-2 rounded-full border border-red-200 bg-red-50 px-3 py-1.5">
            <span className="size-2 rounded-full bg-error" />
            <span className="text-[13px] font-semibold text-red-700">{t("admin.alerts.openCritical", { open: openCount, critical: errorCount })}</span>
          </div>
        )}
      </div>

      {/* Summary */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { labelKey: "admin.alertStatus.open", value: openCount, dot: "bg-error" },
          { labelKey: "admin.alerts.errorsLabel", value: errorCount, dot: "bg-error" },
          { labelKey: "status.resolved", value: resolvedCount, dot: "bg-success" },
        ].map(({ labelKey, value, dot }) => (
          <Card key={labelKey} className="px-4 py-3.5">
            <div className="flex items-center gap-1.5">
              <span className={cx("size-1.5 rounded-full", dot)} />
              <p className="text-[12px] font-medium text-slate-400">{t(labelKey)}</p>
            </div>
            <p className="mt-1.5 font-display text-2xl font-bold leading-none text-navy">{value}</p>
          </Card>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="inline-flex items-center gap-1 rounded-lg bg-slate-100 p-1">
          {STATUS_TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setStatusFilter(tab.key)}
              className={cx(
                "rounded-md px-3 py-1.5 text-[13px] font-medium transition-all",
                statusFilter === tab.key ? "bg-surface text-brand-300 shadow-sm" : "text-slate-500 hover:text-slate-700",
              )}
            >
              {t(tab.labelKey)}
            </button>
          ))}
        </div>
        <label className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-surface px-3 py-1.5 text-[13px]">
          <span className="text-slate-400">{t("admin.severity")}</span>
          <select value={severityFilter} onChange={(e) => setSeverityFilter(e.target.value as "All" | AlertSeverity)} className="bg-transparent font-medium text-slate-700 focus:outline-none">
            {SEVERITY_OPTIONS.map((o) => <option key={o.value} value={o.value}>{t(o.labelKey)}</option>)}
          </select>
        </label>
        <label className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-surface px-3 py-1.5 text-[13px]">
          <span className="text-slate-400">{t("run.client")}</span>
          <select value={clientFilter} onChange={(e) => setClientFilter(e.target.value)} className="bg-transparent font-medium text-slate-700 focus:outline-none">
            <option value="all">{t("alerts.allClients")}</option>
            {clients.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </label>
      </div>

      {/* Table */}
      {alerts === null && !loadError ? (
        <Card className="flex items-center justify-center px-6 py-14">
          <p className="text-[13px] text-slate-400">{t("common.loading")}</p>
        </Card>
      ) : loadError && alerts === null ? (
        <ErrorState title={t("page.alerts.loadError")} description={loadError} onRetry={() => setReloadKey((k) => k + 1)} />
      ) : filtered.length === 0 ? (
        <Card className="px-6 py-14 text-center">
          <p className="text-sm font-semibold text-slate-700">
            {allAlerts.length === 0 && !filtersActive ? t("page.alerts.emptyTitle") : t("alerts.noMatch")}
          </p>
        </Card>
      ) : (
        <>
          <Card className="hidden overflow-hidden lg:block">
            <table className="w-full">
              <thead>
                <tr className="text-start text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                  <th className="px-4 py-3 font-semibold">{t("run.client")}</th>
                  <th className="px-4 py-3 font-semibold">{t("admin.table.flowTest")}</th>
                  <th className="px-4 py-3 font-semibold">{t("admin.table.alert")}</th>
                  <th className="px-4 py-3 font-semibold">{t("admin.severity")}</th>
                  <th className="px-4 py-3 font-semibold">{t("table.status")}</th>
                  <th className="px-4 py-3 font-semibold">{t("table.time")}</th>
                  <th className="px-4 py-3 text-end font-semibold">{t("table.actions")}</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((alert) => (
                  <tr key={alert.id} className="group border-t border-slate-100 hover:bg-slate-50/60">
                    <td className="px-4 py-3.5 text-[13px] font-medium text-navy">{alert.client ?? (alert.clientId != null ? `#${alert.clientId}` : "—")}</td>
                    <td className="px-4 py-3.5">
                      <p className="text-[13px] font-semibold text-slate-700">{alert.flow ?? "—"}</p>
                      <p dir="ltr" className="text-start font-mono text-[11px] text-slate-400">{alert.testName ?? "—"}</p>
                    </td>
                    <td className="max-w-[220px] px-4 py-3.5 text-[13px] text-slate-500">{alert.summary ?? "—"}</td>
                    <td className="px-4 py-3.5"><SeverityBadge severity={severityOf(alert)} /></td>
                    <td className="px-4 py-3.5"><AlertStatusPill status={resolutionOf(alert)} /></td>
                    <td className="px-4 py-3.5 text-[13px] text-slate-400">{formatStamp(parseBackendTimestamp(alert.timestamp))}</td>
                    <td className="px-4 py-3.5 text-end">
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="sm" loading={resolving} onClick={() => void openExecution(alert)}>{t("ai.executionId")}</Button>
                        <Button variant="ghost" size="sm">{t("nav.aiAnalysis")}</Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>

          {/* Mobile */}
          <div className="space-y-3 lg:hidden">
            {filtered.map((alert) => (
              <Card key={alert.id} className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-[13px] font-semibold text-navy">{alert.flow ?? "—"}</p>
                    <p className="text-[11px] text-slate-400">{alert.client ?? "—"} · <span dir="ltr" className="font-mono">{alert.testName ?? "—"}</span></p>
                  </div>
                  <SeverityBadge severity={severityOf(alert)} />
                </div>
                <p className="mt-2 text-[13px] text-slate-500">{alert.summary ?? "—"}</p>
                <div className="mt-3 flex items-center gap-2 border-t border-slate-100 pt-3">
                  <AlertStatusPill status={resolutionOf(alert)} />
                  <span className="text-[12px] text-slate-400">{formatStamp(parseBackendTimestamp(alert.timestamp))}</span>
                  <Button variant="ghost" size="sm" className="ms-auto" loading={resolving} onClick={() => void openExecution(alert)}>{t("ai.executionId")}</Button>
                </div>
              </Card>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

export default AdminAlerts
