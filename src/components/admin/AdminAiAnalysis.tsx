import React, { useCallback, useEffect, useMemo, useState } from "react"
import { Button, Card, ErrorState, cx, useToast } from "../primitives"
import { langLocale, useLang } from "../../lib/i18n"
import { useAuth } from "../../lib/auth"
import { ApiError } from "../../lib/api"
import { fetchAdminRuns, type AdminRunRow } from "../../lib/adminRuns"
import {
  reportActions,
  reportAssessment,
  reportImpact,
  reportRiskLevel,
  type ParsedAiReport,
  type RiskLevel,
} from "../../lib/aiAnalysis"
import { useHistoryRun } from "../../lib/runHistory"
import { RunDetail } from "../RunDetail"

/* ------------------------------------------------------------------ */
/* Admin AI Analysis — real backend data.                              */
/*                                                                     */
/* The backend generates reliability analyses automatically after      */
/* failed executions (when the client's ai_active flag allows) and     */
/* persists them on the run/package rows. There is no admin generation */
/* endpoint in the Figma design and the page is read-only: records are */
/* retrieved from the same composed per-client run history the Client  */
/* AI Analysis page uses (via fetchAdminRuns → toHistoryEntry), so     */
/* SINGLE-run and PACKAGE-level analyses keep exactly the client       */
/* semantics — a package report stays one analysis context.            */
/*                                                                     */
/* Risk level / impact / assessment / actions all come from the        */
/* verified aiAnalysis.ts accessors; anything the backend report does  */
/* not include renders as "—", never fabricated. In-flight analyses    */
/* (no stored report yet) surface in Run Detail on the client — the    */
/* admin list, whose Figma defines no such state, shows only records   */
/* with a stored report.                                               */
/* ------------------------------------------------------------------ */

const RISK_LABEL_KEY: Record<RiskLevel, string> = {
  Critical: "ai.risk.critical",
  High: "ai.risk.high",
  Medium: "ai.risk.medium",
  Low: "ai.risk.low",
}

const RISK_TAB_LABEL_KEY: Record<string, string> = {
  All: "common.all",
  Critical: "ai.risk.critical",
  High: "ai.risk.high",
  Medium: "ai.risk.medium",
  Low: "ai.risk.low",
}

const RUN_STATUS_LABEL_KEY: Record<string, string> = {
  PASS: "status.passed",
  FAILED: "status.failed",
  RUNNING: "status.running",
  CANCELLED: "status.cancelled",
  UNKNOWN: "status.unknown",
}

function riskStyle(risk: RiskLevel) {
  return {
    Critical: { bg: "bg-red-50", text: "text-red-700", ring: "ring-red-600/10", dot: "bg-error" },
    High: { bg: "bg-amber-50", text: "text-amber-700", ring: "ring-amber-600/10", dot: "bg-warning" },
    Medium: { bg: "bg-amber-50", text: "text-amber-600", ring: "ring-amber-500/10", dot: "bg-amber-400" },
    Low: { bg: "bg-brand-50", text: "text-brand-300", ring: "ring-brand-600/10", dot: "bg-brand-600" },
  }[risk]
}

function RiskBadge({ risk }: { risk: RiskLevel }) {
  const { t } = useLang()
  const s = riskStyle(risk)
  return (
    <span className={cx("inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1 ring-inset", s.bg, s.text, s.ring)}>
      <span className={cx("size-1.5 rounded-full", s.dot)} />
      {t(RISK_LABEL_KEY[risk])}
    </span>
  )
}

function RunStatusPill({ status }: { status: string }) {
  const { t } = useLang()
  const map: Record<string, { bg: string; text: string; ring: string; dot: string }> = {
    PASS: { bg: "bg-emerald-50", text: "text-emerald-700", ring: "ring-emerald-600/10", dot: "bg-success" },
    FAILED: { bg: "bg-red-50", text: "text-red-700", ring: "ring-red-600/10", dot: "bg-error" },
    RUNNING: { bg: "bg-brand-50", text: "text-brand-300", ring: "ring-brand-600/10", dot: "bg-brand-600 animate-pulse" },
    CANCELLED: { bg: "bg-slate-100", text: "text-slate-500", ring: "ring-slate-400/10", dot: "bg-slate-400" },
    UNKNOWN: { bg: "bg-slate-100", text: "text-slate-500", ring: "ring-slate-400/10", dot: "bg-slate-300" },
  }
  const s = map[status] ?? map.UNKNOWN
  return (
    <span className={cx("inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1 ring-inset", s.bg, s.text, s.ring)}>
      <span className={cx("size-1.5 rounded-full", s.dot)} />
      {t(RUN_STATUS_LABEL_KEY[status] ?? RUN_STATUS_LABEL_KEY.UNKNOWN)}
    </span>
  )
}

function formatStamp(date: Date | null): string {
  if (!date) return "—"
  return date.toLocaleDateString(langLocale(), { month: "short", day: "numeric", year: "numeric" })
}

/* ------------------------------------------------------------------ */
/* Detail view                                                        */
/* ------------------------------------------------------------------ */
function AnalysisDetail({
  row,
  onBack,
  onOpenRun,
  openLoading,
}: {
  row: AdminRunRow
  onBack: () => void
  onOpenRun: () => void
  openLoading: boolean
}) {
  const { t } = useLang()
  const run = row.entry.run
  const report: ParsedAiReport | undefined = run.ai?.report ?? undefined
  const risk = report ? reportRiskLevel(report) : null
  const impact = report ? reportImpact(report) : null
  const assessment = report ? reportAssessment(report) : null
  const actions = report ? reportActions(report) : []
  const s = risk ? riskStyle(risk) : null

  return (
    <div className="space-y-6">
      <button
        onClick={onBack}
        className="inline-flex items-center gap-1.5 text-[13px] font-medium text-slate-400 transition-colors hover:text-brand-300"
      >
        <svg className="size-4 rtl:-scale-x-100" viewBox="0 0 20 20" fill="currentColor">
          <path fillRule="evenodd" d="M12.7 15.3a1 1 0 01-1.4 0l-4.5-4.6a1 1 0 010-1.4l4.5-4.6a1 1 0 111.4 1.4L8.9 10l3.8 3.9a1 1 0 010 1.4z" />
        </svg>
        {t("page.ai.back")}
      </button>

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
                {t("admin.ai.detailEyebrow")}
              </p>
              <h1 className="mt-0.5 font-display text-xl font-bold tracking-tight text-navy">
                {run.client} · {run.flow}
              </h1>
              <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-slate-400">
                <span dir="ltr" className="font-mono text-slate-500">{run.id}</span>
                <span aria-hidden="true">·</span>
                <span>{run.started}</span>
                <span aria-hidden="true">·</span>
                <span dir="ltr" className="font-mono">{run.duration}</span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <RunStatusPill status={run.status} />
            {risk && <RiskBadge risk={risk} />}
          </div>
        </div>
      </Card>

      <div className="grid gap-6 lg:grid-cols-[1fr_280px]">
        <div className="space-y-5">
          <Card className="p-5">
            <h2 className="pb-3 font-display text-sm font-bold text-navy">{t("ai.businessImpact")}</h2>
            <p className="text-[13px] leading-relaxed text-slate-600">{impact ?? "—"}</p>
          </Card>
          <Card className="p-5">
            <h2 className="pb-3 font-display text-sm font-bold text-navy">{t("ai.assessment")}</h2>
            <p className="text-[13px] leading-relaxed text-slate-600">{assessment ?? "—"}</p>
          </Card>
          <Card className="p-5">
            <h2 className="pb-3 font-display text-sm font-bold text-navy">{t("ai.recommendedActions")}</h2>
            {actions.length === 0 ? (
              <p className="text-[13px] text-slate-500">—</p>
            ) : (
              <ol className="space-y-2.5">
                {actions.map((action, i) => (
                  <li key={i} className="flex gap-3">
                    <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-brand-50 font-mono text-[10px] font-bold text-brand-400">
                      {i + 1}
                    </span>
                    <p className="text-[13px] leading-relaxed text-slate-600">{action}</p>
                  </li>
                ))}
              </ol>
            )}
          </Card>
        </div>

        <div className="space-y-5">
          <Card className="p-5">
            <div className="flex items-center gap-2.5">
              <span className="flex size-7 items-center justify-center rounded-md bg-brand-50 text-brand-400">
                <svg className="size-4" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 2l1.6 4.9L18.5 8.5 13.6 10 12 15l-1.6-5L5.5 8.5 10.4 6.9 12 2z" />
                </svg>
              </span>
              <div>
                <p className="text-[13px] font-semibold text-slate-700">{t("admin.ai.failureAnalysis")}</p>
                <p className="text-[11px] text-slate-400">{t("admin.ai.poweredByGroq")}</p>
              </div>
            </div>
            <div className="mt-4 border-t border-slate-100 pt-4">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{t("ai.riskLevelLabel")}</p>
              <div className="mt-2 flex items-center gap-3">
                {risk && s ? (
                  <>
                    <span className={cx("flex size-10 items-center justify-center rounded-lg", s.bg, s.text)}>
                      <svg className="size-5" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" />
                      </svg>
                    </span>
                    <div>
                      <p className={cx("font-display text-base font-bold", s.text)}>{t(RISK_LABEL_KEY[risk])}</p>
                      <p className="text-[11px] text-slate-400">{t("ai.riskLevelLabel")}</p>
                    </div>
                  </>
                ) : (
                  <p className="text-[13px] text-slate-500">—</p>
                )}
              </div>
            </div>
          </Card>

          <Card className="p-5">
            <h2 className="pb-3 font-display text-sm font-bold text-navy">{t("ai.executionId")}</h2>
            <div className="space-y-3">
              {[
                { labelKey: "run.client", value: run.client, mono: false },
                { labelKey: "ai.executionId", value: run.id, mono: true },
                { labelKey: "table.flow", value: run.flow, mono: false },
                { labelKey: "admin.started", value: run.startedFull, mono: false },
                { labelKey: "table.duration", value: run.duration, mono: true },
                { labelKey: "ai.analyzed", value: formatStamp(row.entry.meta.anchor), mono: false },
              ].map(({ labelKey, value, mono }) => (
                <div key={labelKey}>
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{t(labelKey)}</p>
                  <p className={cx("mt-0.5 text-[13px] font-medium text-slate-700", mono && "font-mono")}>{value}</p>
                </div>
              ))}
            </div>
          </Card>

          <Card className="p-5">
            <h2 className="pb-3 font-display text-sm font-bold text-navy">{t("table.actions")}</h2>
            <div className="space-y-2">
              <Button variant="primary" size="sm" className="w-full" loading={openLoading} onClick={onOpenRun}>
                {t("alerts.openRun")}
              </Button>
            </div>
          </Card>
        </div>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Admin AI Analysis page                                             */
/* ------------------------------------------------------------------ */
export function AdminAiAnalysis() {
  const { t } = useLang()
  const toast = useToast()
  const { logout } = useAuth()

  const [rows, setRows] = useState<AdminRunRow[] | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)

  const [riskFilter, setRiskFilter] = useState<"All" | RiskLevel>("All")
  const [clientFilter, setClientFilter] = useState("all")
  const [selected, setSelected] = useState<AdminRunRow | null>(null)

  /* Related run detail (real run contract, existing RunDetail view). */
  const [runDetailRow, setRunDetailRow] = useState<AdminRunRow | null>(null)
  const { run: detailRun, pollError, cancel, retryAnalysis } = useHistoryRun(
    runDetailRow?.entry ?? null,
    runDetailRow?.clientId ?? null,
    runDetailRow?.clientName ?? "",
    logout,
  )
  const [aiRetrying, setAiRetrying] = useState(false)

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

  /* ---- AI records: runs that carry a stored report -------------------- */
  const records = useMemo(() => (rows ?? []).filter((r) => r.entry.run.ai?.report != null), [rows])

  const clients = useMemo(() => {
    const seen = new Map<string, string>()
    for (const r of records) seen.set(String(r.clientId), r.clientName)
    return Array.from(seen.entries()).sort((a, b) => a[1].localeCompare(b[1]))
  }, [records])

  const filtered = useMemo(() => records.filter((r) => {
    const report = r.entry.run.ai?.report
    const risk = report ? reportRiskLevel(report) : null
    if (riskFilter !== "All" && risk !== riskFilter) return false
    if (clientFilter !== "all" && String(r.clientId) !== clientFilter) return false
    return true
  }), [records, riskFilter, clientFilter])

  const filtersActive = riskFilter !== "All" || clientFilter !== "all"

  /* ---- Related run detail --------------------------------------------- */
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

  if (runDetailRow && detailRun) {
    return (
      <div className="space-y-6">
        <RunDetail
          run={detailRun}
          onBack={() => setRunDetailRow(null)}
          onCancel={handleCancel}
          onRetryAi={detailRun.ai?.retryable ? handleRetryAi : undefined}
          aiRetrying={aiRetrying}
          backLabel={t("admin.ai.backToList")}
        />
        {pollError && (
          <Card>
            <ErrorState title={t("history.runUnavailable")} description={pollError} />
          </Card>
        )}
      </div>
    )
  }

  if (selected) {
    return (
      <AnalysisDetail
        row={selected}
        onBack={() => setSelected(null)}
        openLoading={false}
        onOpenRun={() => setRunDetailRow(selected)}
      />
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-warning">{t("nav.adminConsole")}</p>
          <h1 className="mt-1 font-display text-2xl font-bold tracking-tight text-navy">{t("admin.ai.title")}</h1>
          <p className="mt-1 text-[13px] text-slate-500">{t("admin.ai.subtitle")}</p>
        </div>
        <div className="flex items-center gap-2 text-[12px] text-slate-400">
          <svg className="size-3.5 text-brand-400" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 2l1.6 4.9L18.5 8.5 13.6 10 12 15l-1.6-5L5.5 8.5 10.4 6.9 12 2z" />
          </svg>
          {t("admin.ai.poweredByGroq")}
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="inline-flex items-center gap-1 rounded-lg bg-slate-100 p-1">
          {["All", "Critical", "High", "Medium", "Low"].map((tabKey) => (
            <button
              key={tabKey}
              onClick={() => setRiskFilter(tabKey as "All" | RiskLevel)}
              className={cx(
                "rounded-md px-3 py-1.5 text-[13px] font-medium transition-all",
                riskFilter === tabKey ? "bg-surface text-brand-300 shadow-sm" : "text-slate-500 hover:text-slate-700",
              )}
            >
              {t(RISK_TAB_LABEL_KEY[tabKey])}
            </button>
          ))}
        </div>
        <label className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-surface px-3 py-1.5 text-[13px]">
          <span className="text-slate-400">{t("run.client")}</span>
          <select value={clientFilter} onChange={(e) => setClientFilter(e.target.value)} className="bg-transparent font-medium text-slate-700 focus:outline-none">
            <option value="all">{t("alerts.allClients")}</option>
            {clients.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </label>
      </div>

      {rows === null && !loadError ? (
        <Card className="flex items-center justify-center px-6 py-14">
          <p className="text-[13px] text-slate-400">{t("common.loading")}</p>
        </Card>
      ) : loadError && rows === null ? (
        <ErrorState title={t("common.loadFailed")} description={loadError} onRetry={() => setReloadKey((k) => k + 1)} />
      ) : filtered.length === 0 ? (
        <Card className="px-6 py-14 text-center">
          <p className="text-sm font-semibold text-slate-700">
            {records.length === 0 && !filtersActive ? t("admin.ai.empty") : t("admin.ai.noMatch")}
          </p>
        </Card>
      ) : (
        <>
          <Card className="hidden overflow-hidden lg:block">
            <table className="w-full">
              <thead>
                <tr className="text-start text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                  <th className="px-4 py-3 font-semibold">{t("run.client")}</th>
                  <th className="px-4 py-3 font-semibold">{t("admin.table.flowExecution")}</th>
                  <th className="px-4 py-3 font-semibold">{t("ai.riskLabel")}</th>
                  <th className="hidden px-4 py-3 font-semibold xl:table-cell">{t("ai.businessImpact")}</th>
                  <th className="px-4 py-3 font-semibold">{t("ai.analyzed")}</th>
                  <th className="px-4 py-3 text-end font-semibold">{t("admin.action")}</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => {
                  const report = r.entry.run.ai?.report
                  const risk = report ? reportRiskLevel(report) : null
                  const impact = report ? reportImpact(report) : null
                  return (
                    <tr key={`${r.entry.meta.executionId ?? r.entry.meta.runId ?? r.entry.run.id}`} className="group border-t border-slate-100 hover:bg-slate-50/60">
                      <td className="px-4 py-3.5 text-[13px] font-medium text-navy">{r.clientName}</td>
                      <td className="px-4 py-3.5">
                        <p className="text-[13px] font-semibold text-navy">{r.entry.run.flow}</p>
                        <p dir="ltr" className="text-start font-mono text-[11px] text-slate-400">{r.entry.run.id}</p>
                      </td>
                      <td className="px-4 py-3.5">{risk ? <RiskBadge risk={risk} /> : <span className="text-[12px] text-slate-400">—</span>}</td>
                      <td className="hidden max-w-[240px] px-4 py-3.5 xl:table-cell">
                        <p className="line-clamp-2 text-[13px] text-slate-500">{impact ?? "—"}</p>
                      </td>
                      <td className="px-4 py-3.5 text-[13px] text-slate-400">{formatStamp(r.entry.meta.anchor)}</td>
                      <td className="px-4 py-3.5 text-end">
                        <Button variant="ghost" size="sm" onClick={() => setSelected(r)}>{t("admin.ai.viewAnalysis")}</Button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </Card>

          <div className="space-y-4 lg:hidden">
            {filtered.map((r) => {
              const report = r.entry.run.ai?.report
              const risk = report ? reportRiskLevel(report) : null
              const impact = report ? reportImpact(report) : null
              return (
                <Card key={`${r.entry.meta.executionId ?? r.entry.meta.runId ?? r.entry.run.id}`} className="p-4" interactive onClick={() => setSelected(r)}>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-[13px] font-semibold text-navy">{r.clientName} · {r.entry.run.flow}</p>
                      <p dir="ltr" className="text-start font-mono text-[11px] text-slate-400">{r.entry.run.id}</p>
                    </div>
                    {risk ? <RiskBadge risk={risk} /> : <span className="text-[12px] text-slate-400">—</span>}
                  </div>
                  <p className="mt-2 line-clamp-2 text-[13px] text-slate-500">{impact ?? "—"}</p>
                  <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-3">
                    <span className="text-[12px] text-slate-400">{formatStamp(r.entry.meta.anchor)}</span>
                    <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); setSelected(r) }}>{t("admin.ai.viewAnalysis")}</Button>
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

export default AdminAiAnalysis
