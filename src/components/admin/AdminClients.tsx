import React, { useCallback, useEffect, useState } from "react"
import { Button, Card, ErrorState, cx, useToast } from "../primitives"
import { useLang } from "../../lib/i18n"
import { useAuth } from "../../lib/auth"
import { parseBackendTimestamp } from "../../lib/dashboardData"
import {
  ApiError,
  apiClientDetails,
  apiClientList,
  apiClientRuns,
  apiUpdateClient,
  type BackendClientListRow,
  type BackendClientDetails,
  type DashboardRun,
} from "../../lib/api"
import { langLocale } from "../../lib/i18n"
import { CreateClient } from "./CreateClient"

/* ------------------------------------------------------------------ */
/* Admin Clients — real backend data (GET /dashboard-api/clients).     */
/*                                                                     */
/* Fields the frozen backend does NOT provide are rendered as "—"      */
/* rather than fabricated: flows count and success rate (no list-level */
/* aggregation endpoint), plan/region (no such columns — real browser  */
/* and timezone metadata are shown in the same slots instead).         */
/* The status tabs filter client-side: the list endpoint has no status */
/* parameter, and the admin queue is small.                            */
/* ------------------------------------------------------------------ */

/* Backend is_active boolean → the two statuses the backend can express. */
type ClientActiveStatus = "ACTIVE" | "INACTIVE"

const CLIENT_STATUS_LABEL_KEY: Record<ClientActiveStatus, string> = {
  ACTIVE: "status.active",
  INACTIVE: "status.inactive",
}

const TAB_LABEL_KEY: Record<string, string> = {
  All: "common.all",
  Active: "status.active",
  Inactive: "status.inactive",
}

/** test_runs.status is free-text server-side; only known tokens get a badge. */
function toRunStatus(v: string | null | undefined): "PASS" | "FAILED" | "RUNNING" | "CANCELLED" | null {
  return v === "PASS" || v === "FAILED" || v === "RUNNING" || v === "CANCELLED" ? v : null
}

function formatStamp(date: Date | null): string {
  if (!date) return "—"
  return date.toLocaleDateString(langLocale(), { month: "short", day: "numeric", year: "numeric" })
}

/* ------------------------------------------------------------------ */
/* Visuals                                                            */
/* ------------------------------------------------------------------ */
function ClientStatusPill({ status }: { status: ClientActiveStatus }) {
  const { t } = useLang()
  const map = {
    ACTIVE: { bg: "bg-emerald-50", text: "text-emerald-700", ring: "ring-emerald-600/10", dot: "bg-success" },
    INACTIVE: { bg: "bg-slate-100", text: "text-slate-500", ring: "ring-slate-400/10", dot: "bg-slate-400" },
  }[status]

  return (
    <span className={cx("inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1 ring-inset", map.bg, map.text, map.ring)}>
      <span className={cx("size-1.5 rounded-full", map.dot)} />
      {t(CLIENT_STATUS_LABEL_KEY[status])}
    </span>
  )
}

function RunBadge({ status }: { status: ReturnType<typeof toRunStatus> }) {
  const { t } = useLang()
  if (!status) return <span className="text-[12px] text-slate-400">—</span>
  const labelKey = { PASS: "status.passed", FAILED: "status.failed", RUNNING: "status.running", CANCELLED: "status.cancelled" }[status]
  const map = {
    PASS: { bg: "bg-emerald-50", text: "text-emerald-700", ring: "ring-emerald-600/10", dot: "bg-success" },
    FAILED: { bg: "bg-red-50", text: "text-red-700", ring: "ring-red-600/10", dot: "bg-error" },
    RUNNING: { bg: "bg-brand-50", text: "text-brand-300", ring: "ring-brand-600/10", dot: "bg-brand-600 animate-pulse" },
    CANCELLED: { bg: "bg-slate-100", text: "text-slate-500", ring: "ring-slate-400/10", dot: "bg-slate-400" },
  }[status]
  const s = map
  return (
    <span className={cx("inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ring-inset", s.bg, s.text, s.ring)}>
      <span className={cx("size-1.5 rounded-full", s.dot)} />
      {t(labelKey)}
    </span>
  )
}

/* ------------------------------------------------------------------ */
/* Detail view                                                        */
/* ------------------------------------------------------------------ */
function ClientDetail({
  clientId,
  onBack,
  onClientChanged,
}: {
  clientId: number
  onBack: () => void
  onClientChanged: () => void
}) {
  const { t } = useLang()
  const toast = useToast()
  const { logout } = useAuth()

  const [details, setDetails] = useState<BackendClientDetails | null>(null)
  const [runs, setRuns] = useState<DashboardRun[] | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)
  const [statusUpdating, setStatusUpdating] = useState(false)

  useEffect(() => {
    let cancelled = false
    setLoadError(null)
    if (reloadKey === 0) {
      setDetails(null)
      setRuns(null)
    }
    Promise.all([apiClientDetails(clientId), apiClientRuns(clientId, 3)])
      .then(([d, r]) => {
        if (cancelled) return
        setDetails(d)
        setRuns(r)
      })
      .catch((err) => {
        if (cancelled) return
        if (err instanceof ApiError && err.status === 401) {
          logout()
          return
        }
        setLoadError(err instanceof Error ? err.message : t("common.loadFailed"))
      })
    return () => {
      cancelled = true
    }
  }, [clientId, reloadKey, logout, t])

  async function toggleActive() {
    if (!details || statusUpdating) return
    const nextActive = !(details.client.is_active ?? true)
    setStatusUpdating(true)
    try {
      await apiUpdateClient(clientId, { isActive: nextActive })
      toast({
        title: t(nextActive ? "admin.clients.activatedTitle" : "admin.clients.suspendedTitle"),
        description: t("admin.clients.statusUpdatedDesc", { name: details.client.client_name }),
        variant: "success",
      })
      setReloadKey((k) => k + 1)
      onClientChanged()
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        logout()
        return
      }
      toast({
        title: t("admin.clients.updateFailedTitle"),
        description: err instanceof Error ? err.message : t("common.somethingWentWrong"),
        variant: "error",
      })
    } finally {
      setStatusUpdating(false)
    }
  }

  if (loadError && !details) {
    return (
      <div className="space-y-6">
        <BackButton onBack={onBack} />
        <ErrorState title={t("common.loadFailed")} description={loadError} onRetry={() => setReloadKey((k) => k + 1)} />
      </div>
    )
  }

  if (!details) {
    return (
      <div className="space-y-6">
        <BackButton onBack={onBack} />
        <Card className="flex items-center justify-center px-6 py-16">
          <p className="text-[13px] text-slate-400">{t("common.loading")}</p>
        </Card>
      </div>
    )
  }

  const client = details.client
  const isActive = client.is_active ?? true
  const flowCount = details.flows.length
  const scheduleCount = details.flows.filter((f) => f.scheduler_id != null).length
  const latestRun = runs && runs.length > 0 ? runs[0] : null
  const latestRunDate = latestRun ? parseBackendTimestamp(latestRun.timestamp) : null

  const sections = [
    { labelKey: "admin.plan", value: "—" },
    { labelKey: "admin.region", value: client.timezone ?? "—" },
    { labelKey: "onb.website", value: client.base_url ?? "—" },
    { labelKey: "admin.contact", value: client.dashboard_user_email ?? "—" },
    { labelKey: "admin.created", value: formatStamp(parseBackendTimestamp(client.created_at ?? null)) },
    { labelKey: "admin.totalRuns", value: "—" },
    { labelKey: "admin.successRate", value: "—" },
    { labelKey: "admin.lastActivity", value: formatStamp(latestRunDate) },
  ]

  return (
    <div className="space-y-6">
      <BackButton onBack={onBack} />

      {/* Identity card */}
      <Card className="p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className="flex size-12 items-center justify-center rounded-xl bg-brand-900 font-display text-lg font-bold text-white">
              {client.client_name.charAt(0).toUpperCase()}
            </div>
            <div>
              <div className="flex items-center gap-2.5">
                <h1 className="font-display text-xl font-bold tracking-tight text-navy">
                  {client.client_name}
                </h1>
                <ClientStatusPill status={isActive ? "ACTIVE" : "INACTIVE"} />
              </div>
              <p dir="ltr" className="mt-0.5 text-start text-[13px] text-slate-500">
                {client.base_url ?? "—"} · {client.browser ?? "—"} · {client.timezone ?? "—"}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {isActive ? (
              <Button variant="secondary" size="sm" loading={statusUpdating} onClick={() => void toggleActive()}>{t("admin.clients.suspend")}</Button>
            ) : (
              <Button variant="primary" size="sm" loading={statusUpdating} onClick={() => void toggleActive()}>{t("admin.clients.activate")}</Button>
            )}
          </div>
        </div>
      </Card>

      {/* Two-column layout */}
      <div className="grid gap-6 lg:grid-cols-[1fr_280px]">
        {/* Summary data */}
        <div className="space-y-6">
          {/* Stats */}
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            {[
              { labelKey: "admin.flows", value: String(flowCount) },
              { labelKey: "admin.schedules", value: String(scheduleCount) },
              { labelKey: "admin.totalRuns", value: "—" },
              { labelKey: "admin.successRate", value: "—" },
            ].map(({ labelKey, value }) => (
              <Card key={labelKey} className="px-4 py-3.5 text-center">
                <p className="font-display text-xl font-bold text-navy">{value}</p>
                <p className="text-[11px] text-slate-400">{t(labelKey)}</p>
              </Card>
            ))}
          </div>

          {/* Recent runs — real run history (GET /clients/{id}/runs) */}
          <Card className="p-5">
            <h2 className="pb-3 font-display text-sm font-bold text-navy">{t("page.dashboard.recentRuns")}</h2>
            {runs === null ? (
              <p className="py-6 text-center text-[13px] text-slate-400">{t("common.loading")}</p>
            ) : runs.length === 0 ? (
              <p className="py-6 text-center text-[13px] text-slate-400">{t("admin.clients.noRuns")}</p>
            ) : (
              <div className="divide-y divide-slate-100 rounded-lg border border-slate-200">
                {runs.map((run) => (
                  <div key={String(run.id)} className="flex items-center gap-3 px-3.5 py-2.5">
                    <RunBadge status={toRunStatus(run.status)} />
                    <span className="flex-1 truncate text-[13px] font-medium text-slate-700">{run.flow_name ?? "—"}</span>
                    <span dir="ltr" className="font-mono text-[11px] text-slate-400">{run.run_id ?? `#${run.id}`}</span>
                    <span className="text-[12px] text-slate-400">{formatStamp(parseBackendTimestamp(run.timestamp))}</span>
                    <span dir="ltr" className="font-mono text-[12px] text-slate-400">{run.duration_seconds != null ? `${Math.round(run.duration_seconds)}s` : "—"}</span>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>

        {/* Detail fields */}
        <div className="space-y-6">
          <Card className="p-5">
            <h2 className="pb-3 font-display text-sm font-bold text-navy">{t("admin.clients.details")}</h2>
            <div className="space-y-3">
              {sections.map(({ labelKey, value }) => (
                <div key={labelKey}>
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{t(labelKey)}</p>
                  <p className="mt-0.5 text-[13px] font-medium text-slate-700">{value}</p>
                </div>
              ))}
            </div>
          </Card>

          <Card className="p-5">
            <h2 className="pb-3 font-display text-sm font-bold text-navy">{t("admin.recentRun")}</h2>
            <div className="flex items-center gap-2.5">
              <RunBadge status={latestRun ? toRunStatus(latestRun.status) : null} />
              <span className="text-[13px] text-slate-500">{formatStamp(latestRunDate)}</span>
            </div>
          </Card>
        </div>
      </div>
    </div>
  )
}

function BackButton({ onBack }: { onBack: () => void }) {
  const { t } = useLang()
  return (
    <button
      onClick={onBack}
      className="inline-flex items-center gap-1.5 text-[13px] font-medium text-slate-400 transition-colors hover:text-brand-300"
    >
      <svg className="size-4 rtl:-scale-x-100" viewBox="0 0 20 20" fill="currentColor">
        <path fillRule="evenodd" d="M12.7 15.3a1 1 0 01-1.4 0l-4.5-4.6a1 1 0 010-1.4l4.5-4.6a1 1 0 111.4 1.4L8.9 10l3.8 3.9a1 1 0 010 1.4z" />
      </svg>
      {t("admin.clients.back")}
    </button>
  )
}

/* ------------------------------------------------------------------ */
/* Client list                                                        */
/* ------------------------------------------------------------------ */
export function AdminClients() {
  const { t } = useLang()
  const { logout } = useAuth()
  const [statusFilter, setStatusFilter] = useState("All")
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [showCreateFlow, setShowCreateFlow] = useState(false)
  const [listReloadKey, setListReloadKey] = useState(0)

  const [rows, setRows] = useState<BackendClientListRow[] | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)

  const loadList = useCallback(async (opts: { silent?: boolean } = {}) => {
    if (!opts.silent) {
      setRows(null)
      setLoadError(null)
    }
    try {
      const data = await apiClientList()
      setRows(data)
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        logout()
        return
      }
      if (!opts.silent) setLoadError(err instanceof Error ? err.message : t("common.loadFailed"))
    }
  }, [logout, t])

  useEffect(() => {
    void loadList()
  }, [loadList, listReloadKey])

  if (selectedId != null) {
    return (
      <ClientDetail
        clientId={selectedId}
        onBack={() => {
          setSelectedId(null)
          void loadList({ silent: true })
        }}
        onClientChanged={() => void loadList({ silent: true })}
      />
    )
  }

  if (showCreateFlow) {
    return (
      <CreateClient
        onBack={() => {
          setShowCreateFlow(false)
          void loadList({ silent: true })
        }}
        onOpenClient={(createdId) => {
          setShowCreateFlow(false)
          setSelectedId(createdId)
        }}
      />
    )
  }

  const filtered = (rows ?? []).filter((c) => {
    const active = c.is_active ?? true
    if (statusFilter === "Active" && !active) return false
    if (statusFilter === "Inactive" && active) return false
    return true
  })

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-warning">
            {t("nav.adminConsole")}
          </p>
          <h1 className="mt-1 font-display text-2xl font-bold tracking-tight text-navy">{t("admin.navClients")}</h1>
          <p className="mt-1 text-[13px] text-slate-500">
            {t("admin.clients.subtitle")}
          </p>
        </div>
        <Button
          variant="primary"
          onClick={() => setShowCreateFlow(true)}
          icon={
            <svg className="size-4" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" />
            </svg>
          }
        >
          {t("admin.clients.newClient")}
        </Button>
      </div>

      {/* Filter */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="inline-flex items-center gap-1 rounded-lg bg-slate-100 p-1">
          {["All", "Active", "Inactive"].map((tabKey) => (
            <button
              key={tabKey}
              onClick={() => setStatusFilter(tabKey)}
              className={cx(
                "rounded-md px-3 py-1.5 text-[13px] font-medium transition-all",
                statusFilter === tabKey ? "bg-surface text-brand-300 shadow-sm" : "text-slate-500 hover:text-slate-700",
              )}
            >
              {t(TAB_LABEL_KEY[tabKey])}
            </button>
          ))}
        </div>
      </div>

      {/* Table — desktop */}
      {rows === null && !loadError ? (
        <Card className="flex items-center justify-center px-6 py-16">
          <p className="text-[13px] text-slate-400">{t("common.loading")}</p>
        </Card>
      ) : loadError && rows === null ? (
        <ErrorState title={t("common.loadFailed")} description={loadError} onRetry={() => setListReloadKey((k) => k + 1)} />
      ) : filtered.length === 0 ? (
        <Card className="flex flex-col items-center justify-center px-6 py-16 text-center">
          <div className="flex size-14 items-center justify-center rounded-xl bg-slate-100 text-slate-400">
            <svg className="size-7" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2M9 11a4 4 0 100-8 4 4 0 000 8zm14 10v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75" />
            </svg>
          </div>
          <p className="mt-4 font-display text-base font-bold text-navy">{t("admin.clients.empty")}</p>
        </Card>
      ) : (
        <>
          <Card className="hidden overflow-hidden lg:block">
            <table className="w-full">
              <thead>
                <tr className="text-start text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                  <th className="px-5 py-3 font-semibold">{t("run.client")}</th>
                  <th className="px-4 py-3 font-semibold">{t("table.status")}</th>
                  <th className="px-4 py-3 font-semibold">{t("admin.flows")}</th>
                  <th className="px-4 py-3 font-semibold">{t("admin.recentRun")}</th>
                  <th className="px-4 py-3 font-semibold">{t("admin.successRate")}</th>
                  <th className="px-4 py-3 font-semibold">{t("admin.lastActivity")}</th>
                  <th className="px-4 py-3 text-end font-semibold">{t("table.actions")}</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((client) => {
                  const active = client.is_active ?? true
                  return (
                    <tr key={client.id} className="group border-t border-slate-100 transition-colors hover:bg-slate-50/60">
                      <td className="px-5 py-3.5">
                        <button onClick={() => setSelectedId(client.id)} className="flex items-center gap-2.5 text-start">
                          <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-brand-50 font-display text-[13px] font-bold text-brand-400">
                            {client.client_name.charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <p className="text-[13px] font-semibold text-navy group-hover:text-brand-300">{client.client_name}</p>
                            <p dir="ltr" className="text-start text-[11px] text-slate-400">{client.browser ?? "—"} · {client.timezone ?? "—"}</p>
                          </div>
                        </button>
                      </td>
                      <td className="px-4 py-3.5">
                        <ClientStatusPill status={active ? "ACTIVE" : "INACTIVE"} />
                      </td>
                      <td className="px-4 py-3.5 text-[13px] text-slate-500">—</td>
                      <td className="px-4 py-3.5">
                        <RunBadge status={toRunStatus(client.last_run_status)} />
                      </td>
                      <td className="px-4 py-3.5">
                        <span className="font-mono text-[12px] text-slate-500">—</span>
                      </td>
                      <td className="px-4 py-3.5 text-[13px] text-slate-400">
                        {formatStamp(parseBackendTimestamp(client.last_run_timestamp))}
                      </td>
                      <td className="px-4 py-3.5 text-end">
                        <Button variant="ghost" size="sm" onClick={() => setSelectedId(client.id)}>
                          {t("common.view")}
                        </Button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </Card>

          {/* Cards — mobile */}
          <div className="space-y-4 lg:hidden">
            {filtered.map((client) => {
              const active = client.is_active ?? true
              return (
                <Card key={client.id} className="p-4" interactive onClick={() => setSelectedId(client.id)}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-2.5">
                      <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-brand-50 font-display text-[14px] font-bold text-brand-400">
                        {client.client_name.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <p className="text-[14px] font-semibold text-navy">{client.client_name}</p>
                        <p dir="ltr" className="text-start text-[11px] text-slate-400">{client.browser ?? "—"}</p>
                      </div>
                    </div>
                    <ClientStatusPill status={active ? "ACTIVE" : "INACTIVE"} />
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-3 border-t border-slate-100 pt-3 text-[12px] text-slate-400">
                    <span>{client.timezone ?? "—"}</span>
                    <span>{formatStamp(parseBackendTimestamp(client.last_run_timestamp))}</span>
                    <RunBadge status={toRunStatus(client.last_run_status)} />
                  </div>
                </Card>
              )
            })}
          </div>
        </>
      )}

    </div>
  )
}

export default AdminClients
