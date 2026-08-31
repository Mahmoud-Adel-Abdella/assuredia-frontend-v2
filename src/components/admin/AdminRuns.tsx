import React, { useCallback, useEffect, useMemo, useState } from "react"
import { Button, Card, ErrorState, cx, useToast } from "../primitives"
import { useLang } from "../../lib/i18n"
import { useAuth } from "../../lib/auth"
import { ApiError } from "../../lib/api"
import { fetchAdminRuns, type AdminRunRow } from "../../lib/adminRuns"
import { useHistoryRun, type HistoryEntry } from "../../lib/runHistory"
import { RunDetail } from "../RunDetail"
import type { RunStatus } from "../runShared"

/* ------------------------------------------------------------------ */
/* Admin Runs — real backend data, composed per client.                */
/*                                                                     */
/* The frozen backend exposes run history per client only              */
/* (GET /dashboard-api/clients/{id}/runs; an admin may query any       */
/* client). fetchAdminRuns composes it across real clients and maps    */
/* rows with the SAME semantics as the Client Run History              */
/* (runHistory.toHistoryEntry): raw statuses (PASS/FAIL/…) map through */
/* the verified family mapping, triggers map from the backend's        */
/* SCHEDULED/DIRECT/UNKNOWN tokens, and Saved-Live-Run PACKAGE         */
/* executions stay one execution unit with their child items.          */
/*                                                                     */
/* The UI's three filters (status / client / trigger) apply client-side */
/* over the composed list — the backend has no cross-client query and  */
/* the Figma filters are instant. The View action opens the existing   */
/* RunDetail view (the app's run-detail design) wired to the real      */
/* status/failures/cancel/analyze endpoints via useHistoryRun.         */
/* ------------------------------------------------------------------ */

const STATUS_LABEL_KEY: Record<RunStatus, string> = {
  PASS: "status.passed",
  FAILED: "status.failed",
  RUNNING: "status.running",
  CANCELLED: "status.cancelled",
  UNKNOWN: "status.unknown",
}

const TRIGGER_LABEL_KEY: Record<string, string> = {
  Manual: "trigger.manual",
  Scheduled: "trigger.scheduled",
  Unknown: "trigger.unknown",
}

function StatusBadge({ status }: { status: RunStatus }) {
  const { t } = useLang()
  const map: Record<string, { bg: string; text: string; ring: string; dot: string }> = {
    PASS: { bg: "bg-emerald-50", text: "text-emerald-700", ring: "ring-emerald-600/10", dot: "bg-success" },
    FAILED: { bg: "bg-red-50", text: "text-red-700", ring: "ring-red-600/10", dot: "bg-error" },
    RUNNING: { bg: "bg-brand-50", text: "text-brand-300", ring: "ring-brand-600/10", dot: "bg-brand-600 animate-pulse" },
    CANCELLED: { bg: "bg-slate-100", text: "text-slate-500", ring: "ring-slate-400/10", dot: "bg-slate-400" },
    UNKNOWN: { bg: "bg-slate-100", text: "text-slate-500", ring: "ring-slate-400/10", dot: "bg-slate-300" },
  }
  const s = map[status]
  return (
    <span className={cx("inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1 ring-inset", s.bg, s.text, s.ring)}>
      <span className={cx("size-1.5 rounded-full", s.dot)} />
      {t(STATUS_LABEL_KEY[status])}
    </span>
  )
}

function TriggerTag({ trigger }: { trigger: string }) {
  const { t } = useLang()
  const scheduled = trigger === "Scheduled"
  const labelKey = TRIGGER_LABEL_KEY[trigger] ?? TRIGGER_LABEL_KEY.Unknown
  return (
    <span className="inline-flex items-center gap-1.5 text-[12px] font-medium text-slate-500">
      <svg className="size-3.5 text-slate-400" viewBox="0 0 20 20" fill="currentColor">
        {scheduled ? (
          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.3.7l2.5 2.5a1 1 0 001.4-1.4L11 9.6V6z" />
        ) : (
          <path d="M11 2L4 11h4l-1 7 7-9h-4l1-7z" />
        )}
      </svg>
      {t(labelKey)}
    </span>
  )
}

function FilterSelect({ label, options, value, onChange }: { label: string; options: { value: string; label: string }[]; value: string; onChange: (v: string) => void }) {
  return (
    <label className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-surface px-3 py-1.5 text-[13px]">
      <span className="text-slate-400">{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)} className="bg-transparent font-medium text-slate-700 focus:outline-none">
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </label>
  )
}

const STATUS_TABS = ["All", "Passed", "Failed", "Running"] as const
type StatusTab = typeof STATUS_TABS[number]
const STATUS_MAP: Record<Exclude<StatusTab, "All">, RunStatus> = { Passed: "PASS", Failed: "FAILED", Running: "RUNNING" }
const TAB_LABEL_KEY: Record<StatusTab, string> = {
  All: "common.all",
  Passed: "status.passed",
  Failed: "status.failed",
  Running: "status.running",
}

export function AdminRuns() {
  const { t } = useLang()
  const toast = useToast()
  const { logout } = useAuth()

  const [rows, setRows] = useState<AdminRunRow[] | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)

  const [statusTab, setStatusTab] = useState<StatusTab>("All")
  const [clientFilter, setClientFilter] = useState("all")
  const [triggerFilter, setTriggerFilter] = useState("all")

  const [openRow, setOpenRow] = useState<AdminRunRow | null>(null)

  /* ---- List loading ------------------------------------------------- */
  const loadList = useCallback(async (opts: { silent?: boolean } = {}) => {
    if (!opts.silent) {
      setRows(null)
      setLoadError(null)
    }
    try {
      const data = await fetchAdminRuns()
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
  }, [loadList, reloadKey])

  /* ---- Derived state ------------------------------------------------- */
  const allRows = rows ?? []

  const summary = useMemo(() => ({
    total: allRows.length,
    passed: allRows.filter((r) => r.entry.run.status === "PASS").length,
    failed: allRows.filter((r) => r.entry.run.status === "FAILED").length,
    running: allRows.filter((r) => r.entry.run.status === "RUNNING").length,
  }), [allRows])

  const filtered = useMemo(() => allRows.filter(({ entry, clientId }) => {
    if (statusTab !== "All" && entry.run.status !== STATUS_MAP[statusTab]) return false
    if (clientFilter !== "all" && String(clientId) !== clientFilter) return false
    if (triggerFilter !== "all" && entry.run.trigger !== triggerFilter) return false
    return true
  }), [allRows, statusTab, clientFilter, triggerFilter])

  const filtersActive = statusTab !== "All" || clientFilter !== "all" || triggerFilter !== "all"

  const clientOptions = useMemo(() => {
    const seen = new Map<string, string>()
    for (const r of allRows) seen.set(String(r.clientId), r.clientName)
    return [
      { value: "all", label: t("alerts.allClients") },
      ...Array.from(seen.entries()).sort((a, b) => a[1].localeCompare(b[1])).map(([value, label]) => ({ value, label })),
    ]
  }, [allRows, t])

  const triggerOptions = useMemo(() => [
    { value: "all", label: t("admin.allTriggers") },
    { value: "Manual", label: t("trigger.manual") },
    { value: "Scheduled", label: t("trigger.scheduled") },
  ], [t])

  /* ---- Opened run (real status/failures polling + cancel/analyze) ---- */
  const { run: openRun, pollError, cancel, retryAnalysis } = useHistoryRun(
    openRow?.entry ?? null,
    openRow?.clientId ?? null,
    openRow?.clientName ?? "",
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
      toast({
        title: t("autrun.cancelRequestedTitle"),
        description: t("autrun.cancelRequestedDesc"),
        variant: "info",
      })
    } else if (result.alreadyFinished) {
      toast({
        title: t("autrun.runAlreadyFinishedTitle"),
        description: t("autrun.runAlreadyFinishedDesc"),
        variant: "info",
      })
    } else if (result.message) {
      toast({ title: t("autrun.cancelFailedTitle"), description: result.message, variant: "error" })
    }
  }

  function closeDetail() {
    setOpenRow(null)
    void loadList({ silent: true }) // reconcile statuses that may have changed while the run was open
  }

  /* ---- Detail view (existing RunDetail, admin read/monitor path) ----- */
  if (openRow && openRun) {
    return (
      <div className="space-y-6">
        <RunDetail
          run={openRun}
          onBack={closeDetail}
          onCancel={handleCancel}
          onRetryAi={openRun.ai?.retryable ? handleRetryAi : undefined}
          aiRetrying={aiRetrying}
          backLabel={t("admin.runs.backToList")}
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
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-warning">{t("nav.adminConsole")}</p>
        <h1 className="mt-1 font-display text-2xl font-bold tracking-tight text-navy">{t("admin.runs.title")}</h1>
        <p className="mt-1 text-[13px] text-slate-500">{t("admin.runs.subtitle")}</p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {[
          { labelKey: "admin.total", value: summary.total, dot: "bg-slate-300" },
          { labelKey: "status.passed", value: summary.passed, dot: "bg-success" },
          { labelKey: "status.failed", value: summary.failed, dot: "bg-error" },
          { labelKey: "status.running", value: summary.running, dot: "bg-brand-600 animate-pulse" },
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
          {STATUS_TABS.map((tabKey) => (
            <button
              key={tabKey}
              onClick={() => setStatusTab(tabKey)}
              className={cx(
                "rounded-md px-3 py-1.5 text-[13px] font-medium transition-all",
                statusTab === tabKey ? "bg-surface text-brand-300 shadow-sm" : "text-slate-500 hover:text-slate-700",
              )}
            >
              {t(TAB_LABEL_KEY[tabKey])}
            </button>
          ))}
        </div>
        <FilterSelect label={t("run.client")} options={clientOptions} value={clientFilter} onChange={setClientFilter} />
        <FilterSelect label={t("table.trigger")} options={triggerOptions} value={triggerFilter} onChange={setTriggerFilter} />
      </div>

      {/* Table */}
      {rows === null && !loadError ? (
        <Card className="flex items-center justify-center px-6 py-14">
          <p className="text-[13px] text-slate-400">{t("common.loading")}</p>
        </Card>
      ) : loadError && rows === null ? (
        <ErrorState title={t("common.loadFailed")} description={loadError} onRetry={() => setReloadKey((k) => k + 1)} />
      ) : filtered.length === 0 ? (
        <Card className="px-6 py-14 text-center">
          <p className="text-sm font-semibold text-slate-700">
            {allRows.length === 0 && !filtersActive ? t("admin.runs.empty") : t("admin.runs.noMatch")}
          </p>
          <p className="mt-1 text-[13px] text-slate-500">
            {allRows.length === 0 && !filtersActive ? t("admin.runs.emptyHint") : t("admin.runs.noMatchHint")}
          </p>
        </Card>
      ) : (
        <>
          <Card className="hidden overflow-hidden lg:block">
            <table className="w-full">
              <thead>
                <tr className="text-start text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                  <th className="px-4 py-3 font-semibold">{t("run.client")}</th>
                  <th className="px-4 py-3 font-semibold">{t("table.flow")}</th>
                  <th className="px-4 py-3 font-semibold">{t("admin.table.testTests")}</th>
                  <th className="px-4 py-3 font-semibold">{t("table.trigger")}</th>
                  <th className="px-4 py-3 font-semibold">{t("table.status")}</th>
                  <th className="px-4 py-3 font-semibold">{t("admin.started")}</th>
                  <th className="px-4 py-3 font-semibold">{t("table.duration")}</th>
                  <th className="px-4 py-3 text-end font-semibold">{t("admin.action")}</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((row) => (
                  <tr key={`${row.entry.meta.executionId ?? row.entry.meta.runId ?? row.entry.run.id}`} className="group border-t border-slate-100 hover:bg-slate-50/60">
                    <td className="px-4 py-3.5">
                      <p className="text-[13px] font-medium text-navy">{row.entry.run.client}</p>
                    </td>
                    <td className="px-4 py-3.5">
                      <p className="text-[13px] font-semibold text-navy">{row.entry.run.flow}</p>
                    </td>
                    <td className="px-4 py-3.5 font-mono text-[12px] text-slate-500">{row.entry.run.testLabel}</td>
                    <td className="px-4 py-3.5"><TriggerTag trigger={row.entry.run.trigger} /></td>
                    <td className="px-4 py-3.5"><StatusBadge status={row.entry.run.status} /></td>
                    <td className="px-4 py-3.5 text-[13px] text-slate-500">{row.entry.run.started}</td>
                    <td className="px-4 py-3.5 font-mono text-[13px] text-slate-500">{row.entry.run.duration}</td>
                    <td className="px-4 py-3.5 text-end">
                      <Button variant="ghost" size="sm" onClick={() => setOpenRow(row)}>
                        {row.entry.run.status === "RUNNING" ? t("history.viewLive") : t("common.view")}
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>

          {/* Mobile cards */}
          <div className="space-y-3 lg:hidden">
            {filtered.map((row) => (
              <Card key={`${row.entry.meta.executionId ?? row.entry.meta.runId ?? row.entry.run.id}`} className="p-4" interactive onClick={() => setOpenRow(row)}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-[13px] font-semibold text-navy">{row.entry.run.flow}</p>
                    <p className="text-[11px] text-slate-400">{row.entry.run.client} · <span className="font-mono">{row.entry.run.id}</span></p>
                  </div>
                  <StatusBadge status={row.entry.run.status} />
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-3 border-t border-slate-100 pt-3 text-[12px] text-slate-400">
                  <TriggerTag trigger={row.entry.run.trigger} />
                  <span>{row.entry.run.started}</span>
                  <span className="font-mono">{row.entry.run.duration}</span>
                  <Button variant="ghost" size="sm" className="ms-auto" onClick={(e) => { e.stopPropagation(); setOpenRow(row) }}>{t("common.view")}</Button>
                </div>
              </Card>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

export default AdminRuns
