import React, { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Button, Card, CardSkeleton, ErrorState, cx, Modal, useToast } from "./primitives"
import {
  ApiError,
  apiAlertRead,
  apiAlertResolve,
  apiAlerts,
  apiAlertsMarkAllRead,
  type AlertResolveResponse,
  type DashboardAlert,
} from "../lib/api"
import { useAuth } from "../lib/auth"
import { translate, useLang } from "../lib/i18n"
import { automationErrorMessage } from "../lib/automations"
import { parseBackendTimestamp } from "../lib/dashboardData"
import { formatFull, formatShort } from "../lib/runData"
import { unreadOutsideFilter } from "../lib/alerts"

/* ------------------------------------------------------------------ */
/* Contract (frozen backend — DashboardController)                     */
/*   GET  /dashboard-api/alerts?limit=N          derived from persisted */
/*        failed, non-cancelled test_runs rows (no alerts table).       */
/*   POST /dashboard-api/alerts/{id}/read        is_read = true (204).  */
/*   POST /dashboard-api/alerts/{id}/resolve     resolution_state =     */
/*        RESOLVED + resolved_by/resolved_at; the run stays FAILED.     */
/*   POST /dashboard-api/alerts/mark-all-read    { updated }.           */
/* Fields the backend does not expose (trigger source, duration, AI,    */
/* screenshots) are not rendered — they are never invented.             */
/* ------------------------------------------------------------------ */

type AlertKind = "failure" | "warning"
type AlertState = "Unread" | "Read" | "Resolved"

/* Visual language per alert kind (semantic only) */
const KIND: Record<
  AlertKind,
  { dot: string; icon: string; ring: string; bg: string; label: string }
> = {
  failure: { dot: "bg-error", icon: "text-error", ring: "ring-red-600/10", bg: "bg-red-50", label: "Failure" },
  warning: { dot: "bg-warning", icon: "text-warning", ring: "ring-amber-600/10", bg: "bg-amber-50", label: "Warning" },
}

/* ---- Real backend row → display values ---------------------------- */

function alertState(a: DashboardAlert): AlertState {
  if (String(a.resolutionState ?? "OPEN").toUpperCase() === "RESOLVED") return "Resolved"
  return a.isRead ? "Read" : "Unread"
}

/** Backend severity: "error" when tests failed, "warning" for run-level failures. */
function alertKind(a: DashboardAlert): AlertKind {
  return a.severity === "warning" ? "warning" : "failure"
}

function alertTitle(a: DashboardAlert): string {
  return (a.failedCount ?? 0) > 0 || a.testName
    ? translate("alerts.testFailed")
    : translate("alerts.runFailed")
}

function alertDate(a: DashboardAlert): Date | null {
  return parseBackendTimestamp(a.timestamp)
}

/* ------------------------------------------------------------------ */
/* Small building blocks                                              */
/* ------------------------------------------------------------------ */
function KindIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 20 20" fill="currentColor">
      <path
        fillRule="evenodd"
        d="M8.26 3.1c.77-1.33 2.71-1.33 3.48 0l6.28 10.86c.77 1.33-.19 3-1.74 3H3.72c-1.55 0-2.51-1.67-1.74-3L8.26 3.1zM11 8a1 1 0 10-2 0v3a1 1 0 102 0V8zm-1 6a1 1 0 100 2 1 1 0 000-2z"
      />
    </svg>
  )
}

function StateBadge({ state }: { state: AlertState }) {
  const { t } = useLang()
  const map: { text: string; bg: string; ring: string; dot?: string; labelKey: string } = {
    Unread: { text: "text-brand-300", bg: "bg-brand-50", ring: "ring-brand-700/10", dot: "bg-brand-700", labelKey: "alerts.unread" },
    Read: { text: "text-slate-400", bg: "bg-slate-50", ring: "ring-slate-300/20", labelKey: "alerts.read" },
    Resolved: { text: "text-emerald-700", bg: "bg-emerald-50", ring: "ring-emerald-600/10", dot: "bg-success", labelKey: "status.resolved" },
  }[state]
  return (
    <span
      className={cx(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide ring-1 ring-inset",
        map.bg,
        map.text,
        map.ring,
      )}
    >
      {map.dot && <span className={cx("size-1.5 rounded-full", map.dot)} />}
      {t(map.labelKey)}
    </span>
  )
}

function SummaryCard({
  label,
  value,
  tone,
  icon,
}: {
  label: string
  value: number | string
  tone: "brand" | "error" | "warning" | "slate"
  icon: React.ReactNode
}) {
  const toneCls = {
    brand: "bg-brand-50 text-brand-300",
    error: "bg-red-50 text-error",
    warning: "bg-amber-50 text-warning",
    slate: "bg-slate-50 text-slate-500",
  }[tone]
  return (
    <Card className="flex items-center gap-3 px-4 py-3.5">
      <span className={cx("flex size-9 shrink-0 items-center justify-center rounded-lg", toneCls)}>{icon}</span>
      <div className="min-w-0">
        <p className="font-display text-xl font-bold leading-none text-navy">{value}</p>
        <p className="mt-1 text-[12px] font-medium text-slate-400">{label}</p>
      </div>
    </Card>
  )
}

/* ------------------------------------------------------------------ */
/* Alert row                                                          */
/* ------------------------------------------------------------------ */
function AlertRow({ alert, onOpen }: { alert: DashboardAlert; onOpen: () => void }) {
  const kind = alertKind(alert)
  const k = KIND[kind]
  const state = alertState(alert)
  const unread = state === "Unread"
  const date = alertDate(alert)
  return (
    <button
      onClick={onOpen}
      className={cx(
        "group flex w-full items-center gap-4 border-t border-slate-100 px-4 py-3.5 text-start transition-colors first:border-t-0 hover:bg-slate-50/60",
        unread && "bg-elevated",
      )}
    >
      {/* Unread indicator + kind icon */}
      <span className="relative flex shrink-0 items-center">
        <span
          className={cx(
            "me-2 size-2 rounded-full transition-opacity",
            unread ? "bg-brand-500" : "bg-transparent",
          )}
        />
        <span className={cx("flex size-9 items-center justify-center rounded-lg", k.bg, k.icon)}>
          <KindIcon className="size-4.5" />
        </span>
      </span>

      {/* Main content */}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className={cx("truncate text-[14px] text-navy", unread ? "font-bold" : "font-medium")}>
            {alertTitle(alert)}
          </p>
        </div>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-[12px] text-slate-400">
          <span className="font-medium text-slate-500">{alert.client ?? "—"}</span>
          <span className="text-slate-300">·</span>
          <span>{alert.flow ?? "—"}</span>
          {alert.testName && (
            <>
              <span className="text-slate-300">·</span>
              <span className="font-mono text-[11px] text-slate-400">{alert.testName}</span>
            </>
          )}
        </div>
      </div>

      {/* Time */}
      <div className="hidden w-32 shrink-0 text-[12px] text-slate-400 lg:block">
        {date ? formatShort(date) : "—"}
      </div>

      {/* State */}
      <div className="shrink-0">
        <StateBadge state={state} />
      </div>

      {/* Chevron */}
      <svg
        className="size-4 shrink-0 text-slate-300 transition-colors group-hover:text-slate-500 rtl:-scale-x-100"
        viewBox="0 0 20 20"
        fill="currentColor"
      >
        <path
          fillRule="evenodd"
          d="M7.21 14.77a.75.75 0 01.02-1.06L11.17 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z"
        />
      </svg>
    </button>
  )
}

/* ------------------------------------------------------------------ */
/* Alert details drawer                                               */
/* ------------------------------------------------------------------ */
function DetailField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{label}</p>
      <p className="mt-1 text-[13px] font-medium text-slate-700">{children}</p>
    </div>
  )
}

function AlertDetails({
  alert,
  resolvedByLabel,
  markingRead,
  onClose,
  onMarkRead,
  onRequestResolve,
  onOpenRun,
}: {
  alert: DashboardAlert
  /** Display label for resolved_by (a users id — no name lookup exists). */
  resolvedByLabel: string | null
  markingRead: boolean
  onClose: () => void
  onMarkRead: () => void
  onRequestResolve?: () => void
  onOpenRun?: () => void
}) {
  const { t } = useLang()
  const kind = alertKind(alert)
  const k = KIND[kind]
  const state = alertState(alert)
  const date = alertDate(alert)
  const resolvedAt = parseBackendTimestamp(alert.resolvedAt ?? undefined)
  const failedTests =
    alert.tests && alert.tests.trim().length > 0
      ? alert.tests.split(",").map((t) => t.trim()).filter(Boolean)
      : []
  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-[#020a16]/70 backdrop-blur-sm" onClick={onClose} />
      <aside
        className="relative flex h-full w-full max-w-md flex-col border-s border-slate-200 bg-surface"
        style={{ boxShadow: "var(--shadow-card-hover)" }}
      >
        {/* Header */}
        <div className="flex items-start gap-3 border-b border-slate-100 px-5 py-4">
          <span className={cx("flex size-10 shrink-0 items-center justify-center rounded-lg", k.bg, k.icon)}>
            <KindIcon className="size-5" />
          </span>
          <div className="min-w-0 flex-1">
            <h3 className="font-display text-base font-bold text-navy">{alertTitle(alert)}</h3>
            <p className="mt-0.5 text-[12px] text-slate-400">
              <span className="font-mono">{alert.runId ?? alert.id}</span>
              {date && <> · {formatFull(date)}</>}
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-md p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
            aria-label={t("common.close")}
          >
            <svg className="size-4" viewBox="0 0 20 20" fill="currentColor">
              <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 space-y-5 overflow-y-auto px-5 py-5">
          <div className="flex items-center gap-2">
            <StateBadge state={state} />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <DetailField label={t("run.client")}>{alert.client ?? "—"}</DetailField>
            <DetailField label={t("table.flow")}>{alert.flow ?? "—"}</DetailField>
            <DetailField label={t("history.testLabel")}>
              <span className="font-mono text-[12px]">{alert.testName ?? "—"}</span>
            </DetailField>
            <DetailField label={t("alerts.executionTime")}>{date ? formatFull(date) : "—"}</DetailField>
          </div>

          {/* All failed tests of the run, when more than one */}
          {failedTests.length > 1 && (
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                {t("run.failedTests")} ({failedTests.length})
              </p>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {failedTests.map((name) => (
                  <span
                    key={name}
                    className="rounded-md bg-slate-100 px-2 py-1 font-mono text-[11px] font-medium text-slate-600"
                  >
                    {name}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Resolved metadata — real resolved_by / resolved_at from the backend */}
          {state === "Resolved" && (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3.5 py-3">
              <div className="flex items-center gap-1.5">
                <svg className="size-4 shrink-0 text-success" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.7-9.3a1 1 0 00-1.4-1.4L9 10.6 7.7 9.3a1 1 0 00-1.4 1.4l2 2a1 1 0 001.4 0l4-4z" />
                </svg>
                <p className="text-[12px] font-semibold text-emerald-800">{t("alerts.manuallyResolved")}</p>
              </div>
              <div className="mt-2.5 grid grid-cols-2 gap-3">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-emerald-700/70">{t("alerts.resolvedBy")}</p>
                  <p className="mt-1 text-[13px] font-medium text-emerald-900">{resolvedByLabel ?? "—"}</p>
                </div>
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-emerald-700/70">{t("alerts.resolvedAt")}</p>
                  <p className="mt-1 text-[13px] font-medium text-emerald-900">
                    {resolvedAt ? formatFull(resolvedAt) : "—"}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Notification policy context */}
          <div className="flex items-start gap-2.5 rounded-lg border border-slate-200 bg-slate-50 px-3.5 py-3">
            <svg className="mt-0.5 size-4 shrink-0 text-slate-400" viewBox="0 0 20 20" fill="currentColor">
              <path
                fillRule="evenodd"
                d="M18 10A8 8 0 112 10a8 8 0 0116 0zm-7-4a1 1 0 10-2 0 1 1 0 002 0zm-1 3a1 1 0 00-1 1v3a1 1 0 102 0v-3a1 1 0 00-1-1z"
              />
            </svg>
            <p className="text-[12px] leading-relaxed text-slate-500">{t("alerts.policyNote")}</p>
          </div>

          {/* Failure reason — the sanitized first error message from the backend */}
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{t("alerts.failureReason")}</p>
            <div className="mt-1.5 rounded-lg border border-slate-200 bg-elevated px-3.5 py-3">
              <p className="font-mono text-[12px] leading-relaxed text-slate-600">
                {alert.summary ?? t("alerts.noFailureDetails")}
              </p>
            </div>
          </div>
        </div>

        {/* Footer actions */}
        <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 px-5 py-4">
          {alert.runId && onOpenRun && (
            <Button variant="primary" size="sm" onClick={onOpenRun}>
              {t("alerts.openRun")}
            </Button>
          )}
          {state !== "Resolved" && onRequestResolve && (
            <Button
              variant="success"
              size="sm"
              onClick={onRequestResolve}
              icon={
                <svg className="size-3.5" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.7-9.3a1 1 0 00-1.4-1.4L9 10.6 7.7 9.3a1 1 0 00-1.4 1.4l2 2a1 1 0 001.4 0l4-4z" />
                </svg>
              }
            >
              {t("alerts.markResolved")}
            </Button>
          )}
          {state === "Unread" && (
            <Button
              variant="ghost"
              size="sm"
              className="ms-auto"
              onClick={onMarkRead}
              loading={markingRead}
            >
              {t("alerts.markRead")}
            </Button>
          )}
        </div>
      </aside>
    </div>
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
/* Alerts page                                                        */
/* ------------------------------------------------------------------ */
const TABS = ["All", "Unread", "Failures", "Resolved"] as const
type Tab = (typeof TABS)[number]
const TAB_LABEL_KEY: Record<Tab, string> = {
  All: "common.all",
  Unread: "alerts.unread",
  Failures: "alerts.failures",
  Resolved: "status.resolved",
}

const RANGE_OPTIONS: string[] = ["Last 24 hours", "Last 7 days", "Last 30 days", "All time"]
const RANGE_LABEL_KEY: Record<string, string> = {
  "Last 24 hours": "alerts.range.last24",
  "Last 7 days": "history.time.last7",
  "Last 30 days": "history.time.last30",
  "All time": "alerts.range.allTime",
}

function rangeCutoff(range: string): number | null {
  if (range === "Last 24 hours") return Date.now() - 86_400_000
  if (range === "Last 7 days") return Date.now() - 7 * 86_400_000
  if (range === "Last 30 days") return Date.now() - 30 * 86_400_000
  return null
}

export function Alerts({
  active = "alerts",
  onSelect = () => {},
  onOpenRun,
  onAlertsChanged,
}: {
  active?: string
  onSelect?: (k: string) => void
  /** Navigate to the existing Run History detail screen for the alert's run. */
  onOpenRun?: (runId: string) => void
  /** Notify the app shell so the bell / sidebar unread count refreshes. */
  onAlertsChanged?: () => void
}) {
  const toast = useToast()
  const { user, logout } = useAuth()
  const { lang, t } = useLang()

  const [alerts, setAlerts] = useState<DashboardAlert[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [tab, setTab] = useState<Tab>("All")
  const [client, setClient] = useState("all")
  const [flow, setFlow] = useState("all")
  // Default "All time": the old "Last 24 hours" default hid older unread
  // alerts behind an empty-looking list (live-test F-9). The banner below
  // still points out unread alerts whenever a narrower filter hides them.
  const [range, setRange] = useState("All time")
  const [openId, setOpenId] = useState<string | null>(null)
  const [resolveConfirmId, setResolveConfirmId] = useState<string | null>(null)
  const [resolving, setResolving] = useState(false)
  const [markingAll, setMarkingAll] = useState(false)
  const [markingReadId, setMarkingReadId] = useState<string | null>(null)

  const requestRef = useRef(0)

  /* ---- Load (single fetch per visit; no polling — the backend has no
          push channel, so nothing is simulated between fetches) ------ */
  const reload = useCallback(
    async (withSkeleton = true) => {
      const requestId = ++requestRef.current
      if (withSkeleton) {
        setLoading(true)
        setError(null)
      }
      try {
        const rows = await apiAlerts(200)
        if (requestId !== requestRef.current) return
        setAlerts(rows)
      } catch (err) {
        if (requestId !== requestRef.current) return
        if (err instanceof ApiError && err.status === 401) return logout()
        setError(automationErrorMessage(err, translate("common.somethingWentWrong")))
      } finally {
        if (requestId === requestRef.current && withSkeleton) setLoading(false)
      }
    },
    [logout],
  )

  useEffect(() => {
    void reload()
  }, [reload])

  const open = useMemo(() => alerts.find((a) => a.id === openId) ?? null, [alerts, openId])

  /* ---- Filter options attributed by stable ids, never by name ------ */
  const clientOptions = useMemo(() => {
    const seen = new Map<string, string>()
    for (const a of alerts) {
      if (a.clientId != null && !seen.has(String(a.clientId))) {
        seen.set(String(a.clientId), a.client ?? translate("alerts.clientFallback", { id: a.clientId }))
      }
    }
    return Array.from(seen, ([value, label]) => ({ value, label }))
  }, [alerts, lang])

  const flowOptions = useMemo(() => {
    const seen = new Map<string, string>()
    for (const a of alerts) {
      if (a.flowId != null && !seen.has(String(a.flowId))) {
        seen.set(String(a.flowId), a.flow ?? translate("run.flowFallback", { id: a.flowId }))
      }
    }
    return Array.from(seen, ([value, label]) => ({ value, label }))
  }, [alerts, lang])

  const rangeOptions: FilterOption[] = RANGE_OPTIONS.map((v) => ({ label: t(RANGE_LABEL_KEY[v]), value: v }))

  const summary = useMemo(() => {
    // Matches GET /alerts/unread-count: unread means is_read = false,
    // independent of resolution state.
    const unread = alerts.filter((a) => !a.isRead).length
    const critical = alerts.filter((a) => alertKind(a) === "failure" && alertState(a) !== "Resolved").length
    const failures = alerts.filter((a) => alertKind(a) === "failure").length
    const now = new Date()
    const today = alerts.filter((a) => {
      const d = alertDate(a)
      return (
        d != null &&
        d.getFullYear() === now.getFullYear() &&
        d.getMonth() === now.getMonth() &&
        d.getDate() === now.getDate()
      )
    }).length
    return { unread, critical, failures, today }
  }, [alerts])

  const filtered = useMemo(() => {
    const cutoff = rangeCutoff(range)
    return alerts.filter((a) => {
      const state = alertState(a)
      if (tab === "Unread" && state !== "Unread") return false
      if (tab === "Failures" && alertKind(a) !== "failure") return false
      if (tab === "Resolved" && state !== "Resolved") return false
      if (client !== "all" && String(a.clientId ?? "") !== client) return false
      if (flow !== "all" && String(a.flowId ?? "") !== flow) return false
      if (cutoff != null) {
        const d = alertDate(a)
        if (d == null || d.getTime() < cutoff) return false
      }
      return true
    })
  }, [alerts, tab, client, flow, range])

  // Unread alerts the current filter hides — surfaced by the banner below so
  // a narrower time range can never make the page look empty of attention
  // items while unread work remains (live-test F-9).
  const hiddenUnread = useMemo(
    () => unreadOutsideFilter(alerts, filtered),
    [alerts, filtered],
  )

  /* ---- Mutations (all persisted by the frozen backend) ------------- */

  function applyResolution(id: string, res: AlertResolveResponse) {
    setAlerts((prev) =>
      prev.map((a) =>
        a.id === id
          ? {
              ...a,
              resolutionState: res.resolutionState,
              resolvedBy: res.resolvedBy,
              resolvedAt: res.resolvedAt,
              isRead: res.isRead ?? a.isRead,
            }
          : a,
      ),
    )
  }

  async function markRead(id: string) {
    if (markingReadId != null) return
    setMarkingReadId(id)
    try {
      await apiAlertRead(id)
      setAlerts((prev) => prev.map((a) => (a.id === id ? { ...a, isRead: true } : a)))
      onAlertsChanged?.()
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) return logout()
      if (err instanceof ApiError && err.status === 404) {
        toast({
          title: t("alerts.goneTitle"),
          description: t("alerts.goneDesc"),
          variant: "warning",
        })
        void reload(false)
        setOpenId(null)
        return
      }
      toast({
        title: t("alerts.markReadFailedTitle"),
        description: err instanceof ApiError ? err.message : t("common.somethingWentWrong"),
        variant: "error",
      })
    } finally {
      setMarkingReadId(null)
    }
  }

  async function resolveAlert(id: string) {
    setResolving(true)
    try {
      const res = await apiAlertResolve(id)
      applyResolution(id, res)
      setResolveConfirmId(null)
      onAlertsChanged?.()
      toast({
        title: t("alerts.resolvedTitle"),
        description: t("alerts.resolvedDesc"),
        variant: "success",
      })
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) return logout()
      if (err instanceof ApiError && err.status === 404) {
        setResolveConfirmId(null)
        toast({
          title: t("alerts.goneTitle"),
          description: t("alerts.goneDesc"),
          variant: "warning",
        })
        void reload(false)
        setOpenId(null)
        return
      }
      toast({
        title: t("alerts.resolveFailedTitle"),
        description: err instanceof ApiError ? err.message : t("common.somethingWentWrong"),
        variant: "error",
      })
    } finally {
      setResolving(false)
    }
  }

  async function markAllRead() {
    setMarkingAll(true)
    try {
      await apiAlertsMarkAllRead()
      setAlerts((prev) => prev.map((a) => ({ ...a, isRead: true })))
      onAlertsChanged?.()
      toast({ title: t("alerts.allReadTitle"), variant: "success" })
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) return logout()
      toast({
        title: t("alerts.markAllReadFailedTitle"),
        description: err instanceof ApiError ? err.message : t("common.somethingWentWrong"),
        variant: "error",
      })
    } finally {
      setMarkingAll(false)
    }
  }

  /* resolved_by is a users id; the backend has no name lookup for it.
     Show "You" when it matches the signed-in user, the raw id otherwise. */
  function resolvedByLabel(a: DashboardAlert): string | null {
    if (a.resolvedBy == null || String(a.resolvedBy).length === 0) return null
    const mine =
      user != null && (String(a.resolvedBy) === String(user.id) || String(a.resolvedBy) === String(user.userId))
    return mine ? t("alerts.you") : translate("alerts.userFallback", { id: a.resolvedBy })
  }

  const hasAny = !loading && !error && alerts.length > 0
  const hasUnread = summary.unread > 0

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-brand-300">{t("page.alerts.eyebrow")}</p>
          <h1 className="mt-1 font-display text-2xl font-bold tracking-tight text-navy">{t("page.alerts.title")}</h1>
          <p className="mt-1 text-[13px] text-slate-500">
            {t("page.alerts.subtitle")}
          </p>
        </div>
        {hasUnread && (
          <Button variant="secondary" onClick={markAllRead} loading={markingAll}>
            {t("page.alerts.markAllRead")}
          </Button>
        )}
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <SummaryCard
          label={t("alerts.unread")}
          value={summary.unread}
          tone="brand"
          icon={
            <svg className="size-4.5" viewBox="0 0 20 20" fill="currentColor">
              <path d="M10 2a6 6 0 00-6 6c0 3.5-1.5 4.5-1.5 4.5h15S16 11.5 16 8a6 6 0 00-6-6zM8.3 16a2 2 0 003.4 0H8.3z" />
            </svg>
          }
        />
        <SummaryCard
          label={t("alerts.critical")}
          value={summary.critical}
          tone="error"
          icon={
            <svg className="size-4.5" viewBox="0 0 20 20" fill="currentColor">
              <path
                fillRule="evenodd"
                d="M8.26 3.1c.77-1.33 2.71-1.33 3.48 0l6.28 10.86c.77 1.33-.19 3-1.74 3H3.72c-1.55 0-2.51-1.67-1.74-3L8.26 3.1zM11 8a1 1 0 10-2 0v3a1 1 0 102 0V8zm-1 6a1 1 0 100 2 1 1 0 000-2z"
              />
            </svg>
          }
        />
        <SummaryCard
          label={t("alerts.failures")}
          value={summary.failures}
          tone="warning"
          icon={
            <svg className="size-4.5" viewBox="0 0 20 20" fill="currentColor">
              <path
                fillRule="evenodd"
                d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.7 7.3a1 1 0 00-1.4 1.4L8.6 10l-1.3 1.3a1 1 0 101.4 1.4L10 11.4l1.3 1.3a1 1 0 001.4-1.4L11.4 10l1.3-1.3a1 1 0 00-1.4-1.4L10 8.6 8.7 7.3z"
              />
            </svg>
          }
        />
        <SummaryCard
          label={t("common.today")}
          value={summary.today}
          tone="slate"
          icon={
            <svg className="size-4.5" viewBox="0 0 20 20" fill="currentColor">
              <path
                fillRule="evenodd"
                d="M6 2a1 1 0 00-1 1v1H4a2 2 0 00-2 2v9a2 2 0 002 2h12a2 2 0 002-2V6a2 2 0 00-2-2h-1V3a1 1 0 10-2 0v1H7V3a1 1 0 00-1-1zm10 6H4v7h12V8z"
              />
            </svg>
          }
        />
      </div>

      {loading ? (
        <div className="space-y-4">
          <CardSkeleton />
          <CardSkeleton />
        </div>
      ) : error ? (
        <Card>
          <ErrorState title={t("page.alerts.loadError")} description={error} onRetry={() => void reload()} />
        </Card>
      ) : hasAny ? (
        <>
          {/* Unread hidden by the current filter (live-test F-9): never let a
              narrower time range look like "no alerts need attention". */}
          {hiddenUnread > 0 && (
            <div
              role="status"
              className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-brand-200/50 bg-brand-50/30 px-4 py-3 dark:border-brand-400/20 dark:bg-brand-500/[0.04]"
            >
              <p className="text-[13px] text-slate-600 dark:text-slate-300">
                {t("alerts.hiddenUnread", { count: hiddenUnread })}
              </p>
              <Button variant="secondary" size="sm" onClick={() => setRange("All time")}>
                {t("alerts.showAllTime")}
              </Button>
            </div>
          )}
          {/* Filter bar */}
          <div className="space-y-3">
            <div className="inline-flex items-center gap-1 rounded-lg bg-slate-100 p-1">
              {TABS.map((tabKey) => (
                <button
                  key={tabKey}
                  onClick={() => setTab(tabKey)}
                  className={cx(
                    "rounded-md px-3 py-1.5 text-[13px] font-medium transition-all",
                    tab === tabKey ? "bg-surface text-brand-300 shadow-sm" : "text-slate-500 hover:text-slate-700",
                  )}
                >
                  {t(TAB_LABEL_KEY[tabKey])}
                </button>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <FilterDropdown
                label={t("run.client")}
                options={[{ label: t("alerts.allClients"), value: "all" }, ...clientOptions]}
                value={client}
                onChange={setClient}
              />
              <FilterDropdown
                label={t("table.flow")}
                options={[{ label: t("history.flowAll"), value: "all" }, ...flowOptions]}
                value={flow}
                onChange={setFlow}
              />
              <FilterDropdown label={t("table.time")} options={rangeOptions} value={range} onChange={setRange} />
            </div>
          </div>

          {/* Alert list */}
          {filtered.length === 0 ? (
            <Card className="px-6 py-14 text-center">
              <p className="text-sm font-semibold text-slate-700">{t("alerts.noMatch")}</p>
              <p className="mt-1 text-[13px] text-slate-500">{t("history.noMatchDesc")}</p>
            </Card>
          ) : (
            <Card className="overflow-hidden">
              {filtered.map((a) => (
                <AlertRow key={a.id} alert={a} onOpen={() => setOpenId(a.id)} />
              ))}
            </Card>
          )}
        </>
      ) : (
        /* Empty state */
        <Card className="flex flex-col items-center justify-center px-6 py-16 text-center">
          <div className="flex size-14 items-center justify-center rounded-xl bg-brand-50 text-brand-300">
            <svg className="size-7" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
              <path strokeLinecap="round" strokeLinejoin="round" d="M18 8a6 6 0 00-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M13.7 21a2 2 0 01-3.4 0" />
            </svg>
          </div>
          <p className="mt-4 font-display text-base font-bold text-navy">{t("page.alerts.emptyTitle")}</p>
          <p className="mt-1 max-w-xs text-[13px] text-slate-500">
            {t("page.alerts.emptyDesc")}
          </p>
        </Card>
      )}

      {open && (
        <AlertDetails
          alert={open}
          resolvedByLabel={resolvedByLabel(open)}
          markingRead={markingReadId === open.id}
          onClose={() => setOpenId(null)}
          onMarkRead={() => void markRead(open.id)}
          onRequestResolve={
            alertState(open) !== "Resolved" ? () => setResolveConfirmId(open.id) : undefined
          }
          onOpenRun={
            open.runId && onOpenRun ? () => onOpenRun(open.runId as string) : undefined
          }
        />
      )}

      {/* Resolve confirmation modal */}
      <Modal
        isOpen={resolveConfirmId !== null}
        onClose={() => { if (!resolving) setResolveConfirmId(null) }}
        title={t("alerts.resolveModalTitle")}
        description={t("alerts.resolveModalDesc")}
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setResolveConfirmId(null)} disabled={resolving}>
              {t("common.cancel")}
            </Button>
            <Button
              variant="success"
              loading={resolving}
              onClick={() => resolveConfirmId && void resolveAlert(resolveConfirmId)}
            >
              {t("alerts.markResolved")}
            </Button>
          </>
        }
      >
        <p className="text-[13px] leading-relaxed text-slate-600">
          {t("alerts.resolveModalRemain")}{" "}
          <span className="font-mono font-semibold text-error">{t("status.failed")}</span>{" "}
          {t("alerts.resolveModalOnly")}{" "}
          <span className="font-semibold text-emerald-700">{t("status.resolved")}</span>.{" "}
          {t("alerts.resolveModalNote")}
        </p>
      </Modal>
    </div>
  )
}

export default Alerts
