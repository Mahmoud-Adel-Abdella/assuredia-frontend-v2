import React, { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Button, Card, CardSkeleton, ErrorState, cx, useToast } from "./primitives"
import { WorkspaceHeader } from "./WorkspaceHeader"
import { RunDetail } from "./RunDetail"
import { Run, StatusBadge, StatusIcon, TriggerTag, statusTone } from "./runShared"
import { ApiError, apiClientDetails, apiClientRuns, apiFlowTests, type ClientRunsQuery } from "../lib/api"
import { useAuth } from "../lib/auth"
import { translate, useLang } from "../lib/i18n"
import { toHistoryEntry, useHistoryRun, type HistoryEntry } from "../lib/runHistory"
import { automationErrorMessage } from "../lib/automations"

/* ------------------------------------------------------------------ */
/* Summary card                                                       */
/* ------------------------------------------------------------------ */
function SummaryCard({ label, value, tone }: { label: string; value: string | number; tone: "slate" | "success" | "error" | "brand" }) {
  const dot = { slate: "bg-slate-300", success: "bg-success", error: "bg-error", brand: "bg-brand-600" }[tone]
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
/* Table row + mobile card                                            */
/* ------------------------------------------------------------------ */
function RunRow({ run, onOpen }: { run: Run; onOpen: () => void }) {
  const { t } = useLang()
  const tone = statusTone(run.status)
  return (
    <tr className="group border-t border-slate-100 transition-colors hover:bg-slate-50/60">
      <td className="px-4 py-3.5">
        <span className={cx("inline-flex items-center", tone)}>
          <StatusIcon status={run.status} className="size-5" />
        </span>
      </td>
      <td className="px-4 py-3.5">
        <button onClick={onOpen} className="flex items-center gap-2 text-start">
          <span className="text-[13px] font-semibold text-navy group-hover:text-brand-300">{run.flow}</span>
          {run.isPackage && (
            <span className="rounded-full bg-brand-50 px-1.5 py-0.5 text-[10px] font-semibold text-brand-300">
              {t("history.packageBadge")}
            </span>
          )}
        </button>
      </td>
      <td className="px-4 py-3.5">
        {run.isPackage ? (
          <span className="text-[13px] text-slate-500">{run.testLabel}</span>
        ) : (
          <span className="font-mono text-[12px] text-slate-500">{run.testLabel}</span>
        )}
      </td>
      <td className="px-4 py-3.5">
        <TriggerTag trigger={run.trigger} />
      </td>
      <td className="px-4 py-3.5 text-[13px] text-slate-500">{run.started}</td>
      <td className="px-4 py-3.5 font-mono text-[13px] text-slate-500">{run.duration}</td>
      <td className="px-4 py-3.5">
        <StatusBadge status={run.status} />
      </td>
      <td className="px-4 py-3.5 text-end">
        <Button variant="ghost" size="sm" onClick={onOpen}>
          {run.status === "RUNNING" ? t("history.viewLive") : t("common.view")}
        </Button>
      </td>
    </tr>
  )
}

function RunMobileCard({ run, onOpen }: { run: Run; onOpen: () => void }) {
  const { t } = useLang()
  const tone = statusTone(run.status)
  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-3">
        <button onClick={onOpen} className="flex min-w-0 items-center gap-2.5 text-start">
          <span className={cx("shrink-0", tone)}>
            <StatusIcon status={run.status} className="size-5" />
          </span>
          <span className="min-w-0">
            <span className="flex items-center gap-2">
              <span className="truncate text-[14px] font-semibold text-navy">{run.flow}</span>
              {run.isPackage && (
                <span className="shrink-0 rounded-full bg-brand-50 px-1.5 py-0.5 text-[10px] font-semibold text-brand-300">
                  {t("history.packageBadge")}
                </span>
              )}
            </span>
            <span className="block truncate font-mono text-[11px] text-slate-400">{run.testLabel}</span>
          </span>
        </button>
        <StatusBadge status={run.status} />
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 border-t border-slate-100 pt-3 text-[12px] text-slate-400">
        <TriggerTag trigger={run.trigger} />
        <span>{run.started}</span>
        <span className="font-mono">{run.duration}</span>
        <Button variant="ghost" size="sm" className="ms-auto" onClick={onOpen}>
          {run.status === "RUNNING" ? t("history.viewLive") : t("common.view")}
        </Button>
      </div>
    </Card>
  )
}

/* ------------------------------------------------------------------ */
/* Filters                                                            */
/* ------------------------------------------------------------------ */
type FilterOption = { label: string; value: string }

function FilterDropdown({
  label,
  options,
  value,
  onChange,
}: {
  label: string
  options: FilterOption[]
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
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  )
}

/* ------------------------------------------------------------------ */
/* Run History page                                                   */
/* ------------------------------------------------------------------ */
const STATUS_TABS = ["All", "Passed", "Failed", "Running"] as const
type StatusTab = (typeof STATUS_TABS)[number]

/** Status tab → verified backend `status` query value (appendStatusValues). */
const STATUS_QUERY: Record<Exclude<StatusTab, "All">, string> = {
  Passed: "PASSED",
  Failed: "FAILED",
  Running: "RUNNING",
}

/** Status tab → display label key (tokens stay English). */
const TAB_LABEL_KEY: Record<StatusTab, string> = {
  All: "common.all",
  Passed: "status.passed",
  Failed: "status.failed",
  Running: "status.running",
}

/** Trigger → verified backend `source` query value (trigger_source column). */
const TRIGGER_FILTERS: { labelKey: string; value: string }[] = [
  { labelKey: "history.triggerAll", value: "all" },
  { labelKey: "trigger.manual", value: "DIRECT" },
  { labelKey: "trigger.scheduled", value: "SCHEDULED" },
]

const TIME_OPTIONS = ["Today", "Last 7 days", "Last 30 days", "Custom range"] as const
type TimeOption = (typeof TIME_OPTIONS)[number]

/** Time filter option → display label key (tokens stay English). */
const TIME_LABEL_KEY: Record<TimeOption, string> = {
  Today: "common.today",
  "Last 7 days": "history.time.last7",
  "Last 30 days": "history.time.last30",
  "Custom range": "history.time.custom",
}

/** Background refresh cadence while at least one listed run is RUNNING. */
const LIST_POLL_MS = 10_000

/** Backend `limit` ceiling — the server clamps every request to this max. */
const HISTORY_LIMIT = 200

function timeCutoff(option: TimeOption): number {
  if (option === "Today") {
    const d = new Date()
    d.setHours(0, 0, 0, 0)
    return d.getTime()
  }
  const days = option === "Last 7 days" ? 7 : 30
  return Date.now() - days * 86_400_000
}

export function RunHistory({
  active = "history",
  onSelect = () => {},
  openRunId = null,
  onOpenRunConsumed,
  onViewAi,
  onRunAgainFlow,
}: {
  active?: string
  onSelect?: (k: string) => void
  /** Deep link from the Alerts page: external run_id to open once. */
  openRunId?: string | null
  onOpenRunConsumed?: () => void
  /** Deep link into the AI Analysis page for a run's report. */
  onViewAi?: (runId: string) => void
  /**
   * Run Again (Figma run-header action): re-executes a finished single-flow
   * run via its flowId. Package executions have no equivalent endpoint and
   * keep no Run Again action.
   */
  onRunAgainFlow?: (flowId: number) => void
}) {
  const toast = useToast()
  const { user, logout } = useAuth()
  const { t } = useLang()
  const clientId = user?.clientId ?? null
  const clientName = user?.clientName ?? ""

  const [entries, setEntries] = useState<HistoryEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [statusTab, setStatusTab] = useState<StatusTab>("All")
  const [trigger, setTrigger] = useState("all")
  const [flowId, setFlowId] = useState("all")
  const [test, setTest] = useState("all")
  const [time, setTime] = useState<TimeOption>("Last 7 days")
  const [customFrom, setCustomFrom] = useState("")
  const [customTo, setCustomTo] = useState("")
  const [openEntry, setOpenEntry] = useState<HistoryEntry | null>(null)
  const [flowOptions, setFlowOptions] = useState<FilterOption[]>([])
  const [testOptions, setTestOptions] = useState<FilterOption[]>([])
  /** True when the last response hit the backend row cap (see reload). */
  const [reachedCap, setReachedCap] = useState(false)

  const requestRef = useRef(0)

  /* ---- Server-side query (verified DashboardController params) -----
     Pagination contract (inspected, not assumed): GET /clients/{id}/runs
     supports `limit` (server-clamped to 1–200), the filters below, and
     inclusive ISO-8601 `from`/`to` bounds on the row timestamp. There is
     NO offset, page, or cursor parameter, so the newest HISTORY_LIMIT rows
     of the current query are the whole reachable window; older runs are
     reached by narrowing the time range — never through faked UI
     pagination. When a response hits the cap, the note below the table
     says so instead of pretending the list is complete. */
  const customRangeInvalid =
    time === "Custom range" && customFrom !== "" && customTo !== "" && customFrom > customTo

  const query = useMemo<ClientRunsQuery>(() => {
    const q: ClientRunsQuery = {}
    if (statusTab !== "All") q.status = STATUS_QUERY[statusTab]
    if (trigger !== "all") q.source = trigger
    if (flowId !== "all") q.flowId = Number(flowId)
    if (test !== "all") q.test = test
    if (time === "Custom range") {
      // An inverted range is rejected by the backend (400), so send nothing
      // until the user fixes it — the hint below the header explains why.
      if (!customRangeInvalid) {
        if (customFrom) q.from = new Date(`${customFrom}T00:00:00`).toISOString()
        if (customTo) q.to = new Date(`${customTo}T23:59:59.999`).toISOString()
      }
    } else {
      q.from = new Date(timeCutoff(time)).toISOString()
    }
    return q
  }, [statusTab, trigger, flowId, test, time, customFrom, customTo, customRangeInvalid])

  /* ---- Load ------------------------------------------------------ */
  const reload = useCallback(
    async (withSkeleton = true) => {
      if (clientId == null) return
      const requestId = ++requestRef.current
      if (withSkeleton) {
        setLoading(true)
        setError(null)
      }
      try {
        const rows = await apiClientRuns(clientId, HISTORY_LIMIT, query)
        if (requestId !== requestRef.current) return
        // A full-size response means the server truncated: with no offset or
        // cursor available there may be older rows beyond this window.
        setReachedCap(rows.length >= HISTORY_LIMIT)
        setEntries(
          rows
            .map((row) => toHistoryEntry(row, clientName))
            .filter((e): e is HistoryEntry => e !== null),
        )
      } catch (err) {
        if (requestId !== requestRef.current) return
        if (err instanceof ApiError && err.status === 401) return logout()
        setError(automationErrorMessage(err, translate("common.somethingWentWrong")))
      } finally {
        if (requestId === requestRef.current && withSkeleton) setLoading(false)
      }
    },
    [clientId, clientName, logout, query],
  )

  useEffect(() => {
    void reload()
  }, [reload])

  /* While any listed run is still RUNNING, refresh in the background
     (no skeleton) until every row reaches a terminal state. */
  const hasRunning = useMemo(() => entries.some((e) => e.run.status === "RUNNING"), [entries])

  /* Export the currently loaded rows to CSV client-side (old FE capability).
     Columns mirror the visible table; this is a local download only — no
     backend endpoint exists or is needed. */
  function exportCsv() {
    if (entries.length === 0) return
    const esc = (v: string) => `"${v.replace(/"/g, '""')}"`
    const header = ["run_id", "flow", "tests", "trigger", "started", "duration", "status", "failures"]
    const lines = entries.map((e) =>
      [
        e.meta.runId ?? e.meta.executionId ?? e.run.id,
        e.run.flow,
        e.run.testLabel,
        e.run.trigger,
        e.run.startedFull,
        e.run.duration,
        e.run.status,
        String(e.run.failures),
      ]
        .map(esc)
        .join(","),
    )
    const blob = new Blob(["\uFEFF" + [header.join(","), ...lines].join("\r\n")], {
      type: "text/csv;charset=utf-8",
    })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `assuredia-runs-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
    toast({ title: t("history.exportDone", { count: entries.length }), variant: "success" })
  }
  useEffect(() => {
    if (!hasRunning || loading || error != null || openEntry) return
    const timer = window.setInterval(() => void reload(false), LIST_POLL_MS)
    return () => window.clearInterval(timer)
  }, [hasRunning, loading, error, openEntry, reload])

  /* ---- Deep link from Alerts (Phase 7) ------------------------------
     Resolve the alert's run through the same /runs contract this page
     already uses and open it in the existing RunDetail view. One-shot:
     the link is consumed whether the run resolves or not. Alerts can be
     older than the current time filter, so the lookup fetches without
     filter constraints (backend cap: 200 newest runs). */
  useEffect(() => {
    if (!openRunId || clientId == null) return
    let disposed = false
    apiClientRuns(clientId, 200)
      .then((rows) => {
        if (disposed) return
        const row = rows.find((r) => r.run_id === openRunId)
        const entry = row ? toHistoryEntry(row, clientName) : null
        if (entry) {
          setOpenEntry(entry)
        } else {
          toast({
            title: t("history.runNotFound"),
            description: t("history.runNotFoundDesc"),
            variant: "warning",
          })
        }
        onOpenRunConsumed?.()
      })
      .catch((err) => {
        if (disposed) return
        if (err instanceof ApiError && err.status === 401) return logout()
        toast({
          title: t("history.openRunFailed"),
          description: automationErrorMessage(err, t("common.somethingWentWrong")),
          variant: "error",
        })
        onOpenRunConsumed?.()
      })
    return () => {
      disposed = true
    }
    // Fires once per deep link; the lookup reads only stable inputs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openRunId])

  /* ---- Stable filter options (real client flows + their tests) ----- */
  useEffect(() => {
    if (clientId == null) return
    let disposed = false
    apiClientDetails(clientId)
      .then(async (details) => {
        if (disposed) return
        setFlowOptions(details.flows.map((f) => ({ label: f.flow_name, value: String(f.id) })))
        // The backend `test` filter matches flow_tests.test_method, so the
        // dropdown offers exactly those names. Option loading is an
        // enhancement — individual failures never break the table.
        const results = await Promise.allSettled(details.flows.map((f) => apiFlowTests(f.id)))
        if (disposed) return
        const names = new Set<string>()
        for (const r of results) {
          if (r.status === "fulfilled") {
            for (const t of r.value) names.add(t.test_method)
          }
        }
        setTestOptions(
          Array.from(names)
            .sort((a, b) => a.localeCompare(b))
            .map((n) => ({ label: n, value: n })),
        )
      })
      .catch((err) => {
        if (disposed) return
        if (err instanceof ApiError && err.status === 401) logout()
      })
    return () => {
      disposed = true
    }
  }, [clientId, logout])

  /* ---- Opened run (live follow-up while RUNNING) ------------------ */
  const { run: openRun, pollError, cancel, retryAnalysis } = useHistoryRun(
    openEntry,
    clientId,
    clientName,
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
    setOpenEntry(null)
    void reload(false) // reconcile statuses that may have changed while the run was open
  }

  /* ---- Summary + empty state --------------------------------------- */
  const summary = useMemo(() => {
    const total = entries.length
    const passed = entries.filter((e) => e.run.status === "PASS").length
    const failed = entries.filter((e) => e.run.status === "FAILED").length
    const settled = passed + failed
    const rate = settled === 0 ? 0 : Math.round((passed / settled) * 100)
    return { total, passed, failed, rate }
  }, [entries])

  // "No runs yet" is only honest with default filters; otherwise the server
  // simply returned no rows for the query and we say so.
  const filtersActive =
    statusTab !== "All" || trigger !== "all" || flowId !== "all" || test !== "all" || time !== "Last 7 days"

  /* Localized filter option lists (tokens stay English; labels translate). */
  const timeOptionItems: FilterOption[] = TIME_OPTIONS.map((o) => ({ label: t(TIME_LABEL_KEY[o]), value: o }))
  const triggerOptions: FilterOption[] = TRIGGER_FILTERS.map((f) => ({ label: t(f.labelKey), value: f.value }))

  if (openEntry && openRun) {
    return (
      <div className="space-y-6">
        <WorkspaceHeader active={active} onSelect={onSelect} />
        <RunDetail
          run={openRun}
          onBack={closeDetail}
          onCancel={handleCancel}
          onRunAgain={
            onRunAgainFlow &&
            openEntry.meta.kind === "single" &&
            openEntry.meta.flowId != null
              ? () => onRunAgainFlow(openEntry.meta.flowId as number)
              : undefined
          }
          onRetryAi={openRun.ai?.retryable ? handleRetryAi : undefined}
          aiRetrying={aiRetrying}
          onViewAiAnalysis={onViewAi ? () => onViewAi(openRun.id) : undefined}
          backLabel={t("history.backToHistory")}
        />
        {pollError && (
          <Card>
            <ErrorState title={t("history.runUnavailable")} description={pollError} />
          </Card>
        )}
      </div>
    )
  }

  const empty = !loading && !error && entries.length === 0 && !filtersActive

  return (
    <div className="space-y-6">
      <WorkspaceHeader active={active} onSelect={onSelect} />

      {/* Page header */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-brand-300">{t("page.runHistory.eyebrow")}</p>
          <h1 className="mt-1 font-display text-2xl font-bold tracking-tight text-navy">{t("page.runHistory.title")}</h1>
          <p className="mt-1 text-[13px] text-slate-500">
            {t("page.runHistory.subtitle")}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <FilterDropdown
            label={t("table.time")}
            options={timeOptionItems}
            value={time}
            onChange={(v) => setTime(v as TimeOption)}
          />
          {time === "Custom range" && (
            <>
              <input
                type="date"
                value={customFrom}
                onChange={(e) => setCustomFrom(e.target.value)}
                aria-label={t("history.fromDate")}
                className="rounded-lg border border-slate-200 bg-surface px-2.5 py-1.5 text-[13px] font-medium text-slate-700 focus:outline-none"
              />
              <span className="text-[13px] text-slate-400">{t("history.to")}</span>
              <input
                type="date"
                value={customTo}
                onChange={(e) => setCustomTo(e.target.value)}
                aria-label={t("history.toDate")}
                className="rounded-lg border border-slate-200 bg-surface px-2.5 py-1.5 text-[13px] font-medium text-slate-700 focus:outline-none"
              />
            </>
          )}
        </div>
      </div>

      {customRangeInvalid && (
        <p className="-mt-3 text-[12px] font-medium text-error">
          {t("history.rangeInvalid")}
        </p>
      )}

      {loading ? (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <CardSkeleton />
            <CardSkeleton />
            <CardSkeleton />
            <CardSkeleton />
          </div>
          <CardSkeleton />
          <CardSkeleton />
        </div>
      ) : error ? (
        <Card>
          <ErrorState title={t("page.runHistory.loadError")} description={error} onRetry={() => void reload()} />
        </Card>
      ) : empty ? (
        <Card className="flex flex-col items-center justify-center px-6 py-16 text-center">
          <div className="flex size-14 items-center justify-center rounded-xl bg-brand-50 text-brand-300">
            <svg className="size-7" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3.5 12a8.5 8.5 0 108.5-8.5A8.5 8.5 0 004 8" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v4h4M12 7.5V12l3 2" />
            </svg>
          </div>
          <p className="mt-4 font-display text-base font-bold text-navy">{t("page.runHistory.emptyTitle")}</p>
          <p className="mt-1 max-w-xs text-[13px] text-slate-500">{t("page.runHistory.emptyDesc")}</p>
          <Button variant="primary" className="mt-5" onClick={() => onSelect("flows")}>
            {t("page.runHistory.goToFlows")}
          </Button>
        </Card>
      ) : (
        <>
          {/* Summary */}
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <SummaryCard label={t("history.totalRuns")} value={summary.total} tone="slate" />
            <SummaryCard label={t("status.passed")} value={summary.passed} tone="success" />
            <SummaryCard label={t("status.failed")} value={summary.failed} tone="error" />
            <SummaryCard label={t("history.successRate")} value={`${summary.rate}%`} tone="brand" />
          </div>

          {/* Filter bar */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="inline-flex items-center gap-1 rounded-lg bg-slate-100 p-1">
              {STATUS_TABS.map((tab) => (
                <button
                  key={tab}
                  onClick={() => setStatusTab(tab)}
                  className={cx(
                    "rounded-md px-3 py-1.5 text-[13px] font-medium transition-all",
                    statusTab === tab ? "bg-surface text-brand-300 shadow-sm" : "text-slate-500 hover:text-slate-700",
                  )}
                >
                  {t(TAB_LABEL_KEY[tab])}
                </button>
              ))}
            </div>
            <FilterDropdown label={t("table.trigger")} options={triggerOptions} value={trigger} onChange={setTrigger} />
            <FilterDropdown
              label={t("table.flow")}
              options={[{ label: t("history.flowAll"), value: "all" }, ...flowOptions]}
              value={flowId}
              onChange={setFlowId}
            />
            <FilterDropdown
              label={t("history.testLabel")}
              options={[{ label: t("history.testAll"), value: "all" }, ...testOptions]}
              value={test}
              onChange={setTest}
            />

            {/* Restored actions (old FE had both): re-fetch the current query and
                export the loaded rows client-side — no backend change needed. */}
            <div className="ms-auto flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => void reload(false)}
                disabled={loading}
              >
                {t("common.refresh")}
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => exportCsv()}
                disabled={entries.length === 0}
              >
                {t("history.exportCsv")}
              </Button>
            </div>
          </div>

          {/* Table (desktop) */}
          {entries.length === 0 ? (
            <Card className="px-6 py-14 text-center">
              <p className="text-sm font-semibold text-slate-700">{t("history.noMatch")}</p>
              <p className="mt-1 text-[13px] text-slate-500">{t("history.noMatchDesc")}</p>
            </Card>
          ) : (
            <>
              <Card className="hidden overflow-hidden lg:block">
                <table className="w-full">
                  <thead>
                    <tr className="text-start text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                      <th className="px-4 py-3 font-semibold">{t("table.status")}</th>
                      <th className="px-4 py-3 font-semibold">{t("table.flow")}</th>
                      <th className="px-4 py-3 font-semibold">{t("history.testOrTests")}</th>
                      <th className="px-4 py-3 font-semibold">{t("table.trigger")}</th>
                      <th className="px-4 py-3 font-semibold">{t("history.started")}</th>
                      <th className="px-4 py-3 font-semibold">{t("table.duration")}</th>
                      <th className="px-4 py-3 font-semibold">{t("history.result")}</th>
                      <th className="px-4 py-3 text-end font-semibold">{t("table.actions")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {entries.map((e) => (
                      <RunRow key={e.run.id} run={e.run} onOpen={() => setOpenEntry(e)} />
                    ))}
                  </tbody>
                </table>
              </Card>

              {/* Cards (mobile / tablet) */}
              <div className="space-y-4 lg:hidden">
                {entries.map((e) => (
                  <RunMobileCard key={e.run.id} run={e.run} onOpen={() => setOpenEntry(e)} />
                ))}
              </div>

              {reachedCap && (
                <p className="px-2 text-center text-[12px] text-slate-400">
                  {t("history.capNote", { limit: HISTORY_LIMIT })}
                </p>
              )}
            </>
          )}
        </>
      )}
    </div>
  )
}

export default RunHistory
