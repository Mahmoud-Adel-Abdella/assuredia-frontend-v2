/**
 * Automations page (Phase 5).
 *
 * The user-facing concept is AUTOMATION. The frozen backend stores manual
 * automations as Saved Live Runs and scheduled automations as Execution
 * Plans; src/lib/automations.ts hides that split behind one model. This
 * component never touches the raw endpoints and never exposes backend
 * implementation terminology.
 *
 * Run Now starts a real backend execution and opens the aggregate
 * AutomationRunView, which shows the whole package — every flow with its
 * real backend status — and allows drill-down into each child flow run.
 * No fake run ids, progress, or timers.
 */

import React, { useCallback, useEffect, useRef, useState } from "react"
import {
  AppStatus,
  Button,
  Card,
  CardSkeleton,
  cx,
  EmptyState,
  ErrorState,
  Modal,
  StatusBadge,
  useToast,
} from "./primitives"
import { WorkspaceHeader } from "./WorkspaceHeader"
import { AutomationForm } from "./AutomationForm"
import { ApiError } from "../lib/api"
import {
  type Automation,
  type AutomationDraft,
  type AutomationRunInfo,
  type AutomationRunStart,
  AutomationSaveError,
  automationErrorMessage,
  deleteAutomation,
  describeNotifyPolicy,
  describeSchedule,
  formatDuration,
  formatRunTime,
  loadAutomations,
  runAutomationNow,
  saveAutomation,
  setSchedulePaused,
} from "../lib/automations"
import { useAuth } from "../lib/auth"
import { langLocale, translate, useLang } from "../lib/i18n"

type AutomationsView = "list" | "form" | "detail"

/* Backend run status / trigger tokens stay untouched; only their display
 * labels go through i18n (step 9). */
function runStatusKey(status: AutomationRunInfo["status"]) {
  if (status === "PASSED") return "status.passed"
  if (status === "FAILED") return "status.failed"
  if (status === "CANCELLED") return "status.cancelled"
  return "status.running"
}

function triggerKey(trigger: string) {
  if (trigger === "Manual") return "trigger.manual"
  if (trigger === "Scheduled") return "trigger.scheduled"
  return "trigger.unknown"
}

/* ── State badge ───────────────────────────────────────────── */

function AutomationStateBadge({ automation }: { automation: Automation }) {
  const { t } = useLang()
  if (!automation.schedule) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-500">
        <span className="size-1.5 rounded-full bg-slate-400" />
        {t("automations.form.notScheduledSummary")}
      </span>
    )
  }
  return <StatusBadge status={(automation.schedule.isActive ? "ACTIVE" : "PAUSED") as AppStatus} />
}

/* ── Overflow menu ─────────────────────────────────────────── */

function OverflowMenu({
  automation,
  onEdit,
  onPauseToggle,
  onDelete,
  busy,
}: {
  automation: Automation
  onEdit: () => void
  onPauseToggle: () => void
  onDelete: () => void
  busy: boolean
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const { t } = useLang()

  useEffect(() => {
    function handle(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    if (open) document.addEventListener("mousedown", handle)
    return () => document.removeEventListener("mousedown", handle)
  }, [open])

  const hasSched = !!automation.schedule
  const isPaused = automation.schedule ? !automation.schedule.isActive : false

  return (
    <div ref={ref} className="relative" onClick={(e) => e.stopPropagation()}>
      <button
        onClick={() => setOpen((v) => !v)}
        title={t("automations.moreOptions")}
        className="flex size-8 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
      >
        <svg className="size-4" viewBox="0 0 20 20" fill="currentColor">
          <path d="M6 10a2 2 0 11-4 0 2 2 0 014 0zm6 0a2 2 0 11-4 0 2 2 0 014 0zm4 2a2 2 0 100-4 2 2 0 000 4z" />
        </svg>
      </button>
      {open && (
        <div className="absolute end-0 top-full z-30 mt-1 w-44 overflow-hidden rounded-xl border border-slate-200 bg-surface shadow-lg">
          <button
            onClick={() => {
              setOpen(false)
              onEdit()
            }}
            className="flex w-full items-center gap-2 px-4 py-2.5 text-start text-[13px] text-slate-600 transition-colors hover:bg-slate-50"
          >
            {t("page.automations.editSchedule")}
          </button>
          {hasSched && (
            <button
              onClick={() => {
                setOpen(false)
                onPauseToggle()
              }}
              disabled={busy}
              className="flex w-full items-center gap-2 px-4 py-2.5 text-start text-[13px] text-slate-600 transition-colors hover:bg-slate-50 disabled:opacity-50"
            >
              {isPaused ? t("automations.menu.resumeSchedule") : t("automations.menu.pauseSchedule")}
            </button>
          )}
          <div className="h-px bg-slate-100" />
          <button
            onClick={() => {
              setOpen(false)
              onDelete()
            }}
            className="flex w-full items-center gap-2 px-4 py-2.5 text-start text-[13px] font-medium text-error transition-colors hover:bg-red-50"
          >
            {t("automations.menu.deleteAutomation")}
          </button>
        </div>
      )}
    </div>
  )
}

/* ── Last run strip ────────────────────────────────────────── */

function runStatusColor(status: AutomationRunInfo["status"]) {
  if (status === "PASSED") return { dot: "bg-success", text: "text-success" }
  if (status === "FAILED") return { dot: "bg-error", text: "text-error" }
  if (status === "CANCELLED") return { dot: "bg-slate-400", text: "text-slate-500" }
  return { dot: "bg-brand-700 animate-pulse", text: "text-brand-300" }
}

function LastRunStrip({ run }: { run: AutomationRunInfo }) {
  const { t } = useLang()
  const color = runStatusColor(run.status)
  return (
    <div className="flex items-center gap-2 rounded-lg bg-slate-50 px-3 py-2 text-[12px]">
      <span className={cx("size-1.5 rounded-full", color.dot)} />
      <span className="text-slate-400">{formatRunTime(run.startedAt ?? run.finishedAt)}</span>
      <span className="text-slate-300">·</span>
      <span className={cx("font-medium", color.text)}>{t(runStatusKey(run.status))}</span>
      <span className="text-slate-300">·</span>
      <span className="text-slate-400">{formatDuration(run.startedAt, run.finishedAt)}</span>
      <span className="ms-auto rounded-full border border-slate-200 bg-white px-1.5 py-0.5 text-[10px] font-medium text-slate-400">
        {t(triggerKey(run.trigger))}
      </span>
    </div>
  )
}

/* ── Automation card ───────────────────────────────────────── */

function AutomationCard({
  automation,
  running,
  pausing,
  onView,
  onEdit,
  onRun,
  onPauseToggle,
  onDelete,
}: {
  automation: Automation
  running: boolean
  pausing: boolean
  onView: () => void
  onEdit: () => void
  onRun: () => void
  onPauseToggle: () => void
  onDelete: () => void
}) {
  const { t } = useLang()
  return (
    <Card
      interactive
      onClick={onView}
      className="flex flex-col gap-4 p-5 transition-shadow hover:shadow-md"
    >
      {/* Top row: name + state badge */}
      <div className="flex items-start justify-between gap-3">
        <h3 className="font-display text-[15px] font-bold text-navy leading-tight">
          {automation.name}
        </h3>
        <div className="shrink-0">
          <AutomationStateBadge automation={automation} />
        </div>
      </div>

      {/* Stats */}
      <p className="text-[13px] text-slate-400">
        {t("automations.flowsCount", { count: automation.flowCount })}
        {automation.testCount != null && (
          <>
            {" · "}
            {t("run.testsCount", { count: automation.testCount })}
          </>
        )}
      </p>

      {/* Flow chips */}
      <div className="flex flex-wrap gap-1.5">
        {automation.flows.map((flow) => {
          const label = flow.scope === "FULL_FLOW" ? t("automations.form.fullScopeShort") : `${flow.selectedTests.length}`
          return (
            <span
              key={flow.flowId}
              className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-0.5 text-[11px] font-medium text-slate-600"
            >
              {flow.flowName}
              <span className="text-slate-400">· {label}</span>
            </span>
          )
        })}
      </div>

      {/* Schedule */}
      {automation.schedule ? (
        <div className="flex items-center gap-1.5 text-[12px] text-slate-400">
          <svg className="size-3.5 shrink-0 text-slate-300" viewBox="0 0 20 20" fill="currentColor">
            <path
              fillRule="evenodd"
              d="M10 18a8 8 0 100-16 8 8 0 000 16zm.75-13a.75.75 0 00-1.5 0v5c0 .414.336.75.75.75h4a.75.75 0 000-1.5h-3.25V5z"
              clipRule="evenodd"
            />
          </svg>
          {describeSchedule(automation.schedule)} ·{" "}
          {automation.schedule.timezone ?? t("automations.accountTimezone")}
          {!automation.schedule.isActive && (
            <span className="ms-1 rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-600">
              {t("status.paused")}
            </span>
          )}
        </div>
      ) : (
        <p className="text-[12px] text-slate-400">{t("automations.form.notScheduledSummary")}</p>
      )}

      {/* Last run */}
      {automation.lastRun && <LastRunStrip run={automation.lastRun} />}

      {/* Actions */}
      <div
        className="flex items-center gap-2 border-t border-slate-100 pt-3"
        onClick={(e) => e.stopPropagation()}
      >
        <Button variant="primary" size="sm" onClick={onRun} loading={running}>
          {!running && (
            <svg className="size-3.5" viewBox="0 0 20 20" fill="currentColor">
              <path d="M6.3 2.841A1.5 1.5 0 004 4.11V15.89a1.5 1.5 0 002.3 1.269l9.344-5.89a1.5 1.5 0 000-2.538L6.3 2.84z" />
            </svg>
          )}
          {running ? t("page.automations.starting") : t("page.automations.runNow")}
        </Button>
        <Button variant="outline" size="sm" onClick={onEdit}>
          {t("common.edit")}
        </Button>
        <div className="ms-auto">
          <OverflowMenu
            automation={automation}
            onEdit={onEdit}
            onPauseToggle={onPauseToggle}
            onDelete={onDelete}
            busy={pausing}
          />
        </div>
      </div>
    </Card>
  )
}

/* ── Detail section blocks ─────────────────────────────────── */

function DetailSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.1em] text-slate-400">
        {title}
      </p>
      {children}
    </div>
  )
}

function DetailRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4 text-[13px]">
      <span className="shrink-0 text-slate-400">{label}</span>
      <span className="text-end font-medium text-slate-700">{children}</span>
    </div>
  )
}

/* ── Automation detail view ────────────────────────────────── */

function AutomationDetail({
  automation,
  running,
  pausing,
  onBack,
  onEdit,
  onRun,
  onPauseToggle,
  onDelete,
}: {
  automation: Automation
  running: boolean
  pausing: boolean
  onBack: () => void
  onEdit: () => void
  onRun: () => void
  onPauseToggle: () => void
  onDelete: () => void
}) {
  const { t } = useLang()
  const isPaused = automation.schedule ? !automation.schedule.isActive : false

  return (
    <div className="space-y-6">
      {/* Back nav */}
      <button
        onClick={onBack}
        className="flex items-center gap-1.5 text-[13px] font-medium text-slate-400 transition-colors hover:text-slate-700"
      >
        <svg className="size-4 rtl:-scale-x-100" viewBox="0 0 20 20" fill="currentColor">
          <path
            fillRule="evenodd"
            d="M17 10a.75.75 0 01-.75.75H5.612l4.158 3.96a.75.75 0 11-1.04 1.08l-5.5-5.25a.75.75 0 010-1.08l5.5-5.25a.75.75 0 111.04 1.08L5.612 9.25H16.25A.75.75 0 0117 10z"
            clipRule="evenodd"
          />
        </svg>
        {t("page.automations.back")}
      </button>

      {/* Title row */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-extrabold tracking-tight text-navy">
            {automation.name}
          </h1>
          <div className="mt-2">
            <AutomationStateBadge automation={automation} />
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="primary" size="sm" onClick={onRun} loading={running}>
            {!running && (
              <svg className="size-3.5" viewBox="0 0 20 20" fill="currentColor">
                <path d="M6.3 2.841A1.5 1.5 0 004 4.11V15.89a1.5 1.5 0 002.3 1.269l9.344-5.89a1.5 1.5 0 000-2.538L6.3 2.84z" />
              </svg>
            )}
            {running ? t("page.automations.starting") : t("page.automations.runNow")}
          </Button>
          <Button variant="outline" size="sm" onClick={onEdit}>
            {t("common.edit")}
          </Button>
          {automation.schedule && (
            <>
              <Button variant="outline" size="sm" onClick={onEdit}>
                {t("page.automations.editSchedule")}
              </Button>
              <Button
                variant={isPaused ? "success" : "secondary"}
                size="sm"
                onClick={onPauseToggle}
                loading={pausing}
              >
                {pausing ? "…" : isPaused ? t("common.resume") : t("common.pause")}
              </Button>
            </>
          )}
          <Button variant="danger" size="sm" onClick={onDelete}>
            {t("common.delete")}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_320px]">
        {/* ── Main column ── */}
        <div className="space-y-5">
          {/* Flows */}
          <Card className="p-5">
            <DetailSection title={t("automations.form.flowsTitle")}>
              <div className="space-y-3">
                {automation.flows.map((flow, idx) => (
                  <div
                    key={flow.flowId}
                    className="rounded-lg border border-slate-200 bg-elevated px-4 py-3"
                  >
                    <div className="flex items-center justify-between">
                      <p className="text-[13px] font-semibold text-slate-700">{flow.flowName}</p>
                      <span className="text-[11px] font-medium text-slate-400">
                        {t("automations.form.flowN", { index: idx + 1 })}
                      </span>
                    </div>
                    <p className="mt-1 text-[12px] text-slate-400">
                      {flow.scope === "FULL_FLOW"
                        ? t("automations.detail.fullFlow")
                        : t("automations.detail.selectedTests", { count: flow.selectedTests.length })}
                    </p>
                    {flow.scope === "SELECTED_TESTS" && flow.selectedTests.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1">
                        {flow.selectedTests.map((testName) => (
                          <span
                            key={testName}
                            className="rounded-md border border-slate-200 bg-slate-50 px-2 py-0.5 font-mono text-[11px] text-slate-500"
                          >
                            {testName}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </DetailSection>
          </Card>

          {/* Recent executions */}
          <Card className="overflow-hidden">
            <div className="border-b border-slate-100 px-5 py-3.5">
              <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-slate-400">
                {t("automations.detail.recentExecutions")}
              </p>
            </div>
            {automation.recentRuns.length > 0 ? (
              <div className="divide-y divide-slate-100">
                {automation.recentRuns.map((run) => {
                  const color = runStatusColor(run.status)
                  return (
                    <div
                      key={run.executionId}
                      className="flex items-center gap-4 px-5 py-3.5 text-[13px]"
                    >
                      <span className={cx("size-2 shrink-0 rounded-full", color.dot)} />
                      <span className="min-w-[120px] font-mono text-[12px] text-slate-500">
                        {formatRunTime(run.startedAt ?? run.finishedAt)}
                      </span>
                      <span className="flex-1">
                        <span
                          className={cx(
                            "inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold",
                            run.trigger === "Scheduled"
                              ? "border-slate-200 bg-slate-50 text-slate-500"
                              : "border-brand-100 bg-brand-50 text-brand-400",
                          )}
                        >
                          {t(triggerKey(run.trigger))}
                        </span>
                      </span>
                      <span className={cx("font-semibold", color.text)}>{t(runStatusKey(run.status))}</span>
                      <span className="font-mono text-[12px] text-slate-400">
                        {formatDuration(run.startedAt, run.finishedAt)}
                      </span>
                    </div>
                  )
                })}
              </div>
            ) : (
              <div className="px-5 py-8 text-center text-[13px] text-slate-400">
                {t("automations.detail.noExecutions")}
              </div>
            )}
          </Card>
        </div>

        {/* ── Side column: schedule + notifications ── */}
        <div className="space-y-5">
          {/* Schedule */}
          <Card className="p-5">
            <DetailSection title={t("automations.form.scheduleTitle")}>
              {automation.schedule ? (
                <div className="space-y-3">
                  <DetailRow label={t("automations.form.frequency")}>{describeSchedule(automation.schedule)}</DetailRow>
                  <DetailRow label={t("automations.form.timezone")}>
                    {automation.schedule.timezone ?? t("automations.accountTimezone")}
                  </DetailRow>
                  <DetailRow label={t("table.status")}>
                    <StatusBadge
                      status={(automation.schedule.isActive ? "ACTIVE" : "PAUSED") as AppStatus}
                    />
                  </DetailRow>
                  <div className="mt-2 inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1.5">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                      CRON
                    </span>
                    <code className="font-mono text-[11px] text-slate-600">
                      {automation.schedule.cronExpression}
                    </code>
                  </div>
                </div>
              ) : (
                <p className="text-[13px] text-slate-400">{t("automations.form.notScheduledSummary")}</p>
              )}
            </DetailSection>
          </Card>

          {/* Notifications */}
          <Card className="p-5">
            <DetailSection title={t("automations.form.notificationsTitle")}>
              {automation.schedule ? (
                <DetailRow label={t("automations.form.notifyPrefix")}>
                  {describeNotifyPolicy(automation.schedule.notifyPolicy)}
                </DetailRow>
              ) : (
                <p className="text-[13px] text-slate-400">
                  {t("automations.form.notifScheduledOnly")}
                </p>
              )}
            </DetailSection>
          </Card>

          {/* Meta */}
          <Card className="p-5">
            <DetailSection title={t("automations.detail.info")}>
              <div className="space-y-3">
                <DetailRow label={t("automations.detail.id")}>
                  <code className="font-mono text-[12px] text-slate-500">{automation.id}</code>
                </DetailRow>
                <DetailRow label={t("automations.detail.created")}>
                  {automation.createdAt
                    ? automation.createdAt.toLocaleDateString(langLocale(), {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      })
                    : "—"}
                </DetailRow>
                <DetailRow label={t("automations.form.flowsTitle")}>{automation.flowCount}</DetailRow>
                <DetailRow label={t("automations.form.testsLabel")}>{automation.testCount ?? "—"}</DetailRow>
              </div>
            </DetailSection>
          </Card>
        </div>
      </div>
    </div>
  )
}

/* ── Automations page ──────────────────────────────────────── */

export function Automations({
  active = "automations",
  onSelect = () => {},
  onOpenRun,
}: {
  active?: string
  onSelect?: (k: string) => void
  onOpenRun: (target: AutomationRunStart, name: string) => void
}) {
  const toast = useToast()
  const { user, logout } = useAuth()
  const { t } = useLang()
  const clientId = user?.clientId ?? null

  const [automations, setAutomations] = useState<Automation[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [warning, setWarning] = useState<string | null>(null)

  const [view, setView] = useState<AutomationsView>("list")
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Automation | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [runningId, setRunningId] = useState<string | null>(null)
  const [pausingId, setPausingId] = useState<string | null>(null)

  const requestRef = useRef(0)

  const selected = automations.find((a) => a.id === selectedId) ?? null

  /* ---- Load ------------------------------------------------------ */
  const reload = useCallback(async () => {
    if (clientId == null) return
    const requestId = ++requestRef.current
    setLoading(true)
    setError(null)
    try {
      const result = await loadAutomations(clientId)
      if (requestId !== requestRef.current) return
      setAutomations(result.automations)
      setWarning(result.warning ?? null)
    } catch (err) {
      if (requestId !== requestRef.current) return
      if (err instanceof ApiError && err.status === 401) return logout()
      setError(automationErrorMessage(err, translate("automations.loadFailed")))
    } finally {
      if (requestId === requestRef.current) setLoading(false)
    }
  }, [clientId, logout])

  useEffect(() => {
    void reload()
  }, [reload])

  /* ---- Run Now ----------------------------------------------------
   * Real backend execution: POST .../run on the backing representation,
   * then open the aggregate AutomationRunView for the whole package.
   * Never fabricates a run id — on error the user is told exactly what
   * happened. */
  async function handleRun(automation: Automation) {
    if (clientId == null || runningId != null) return
    setRunningId(automation.id)
    try {
      const start = await runAutomationNow(clientId, automation)
      onOpenRun(start, automation.name)
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        logout()
        return
      }
      if (err instanceof ApiError && err.status === 409) {
        // One run lock per client across all trigger kinds. No automatic retry.
        toast({
          title: t("flows.runInProgressTitle"),
          description: t("flows.runInProgressDesc"),
          variant: "warning",
        })
        return
      }
      toast({
        title: t("flows.runStartFailedTitle"),
        description: automationErrorMessage(err, t("common.somethingWentWrong")),
        variant: "error",
      })
    } finally {
      setRunningId(null)
    }
  }

  /* ---- Pause / resume --------------------------------------------- */
  async function handlePauseToggle(automation: Automation) {
    if (clientId == null || !automation.schedule || pausingId != null) return
    const pausing = automation.schedule.isActive
    setPausingId(automation.id)
    try {
      await setSchedulePaused(clientId, automation, pausing)
      await reload()
      toast({
        title: pausing ? t("automations.pausedTitle") : t("automations.resumedTitle"),
        description: pausing
          ? t("automations.pausedDesc", { name: automation.name })
          : t("automations.resumedDesc", { name: automation.name }),
        variant: pausing ? "info" : "success",
      })
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        logout()
        return
      }
      toast({
        title: pausing ? t("automations.pauseFailedTitle") : t("automations.resumeFailedTitle"),
        description: automationErrorMessage(err, t("common.somethingWentWrong")),
        variant: "error",
      })
    } finally {
      setPausingId(null)
    }
  }

  /* ---- Delete ------------------------------------------------------ */
  async function handleDelete() {
    if (!deleteTarget || clientId == null || deleting) return
    setDeleting(true)
    try {
      await deleteAutomation(clientId, deleteTarget)
      const wasSelected = selectedId === deleteTarget.id
      setDeleteTarget(null)
      if (wasSelected) {
        setView("list")
        setSelectedId(null)
      }
      await reload()
      toast({
        title: t("automations.deletedTitle"),
        description: t("automations.deletedDesc", { name: deleteTarget.name }),
        variant: "success",
      })
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        logout()
        return
      }
      toast({
        title: t("automations.deleteFailedTitle"),
        description: automationErrorMessage(err, t("common.somethingWentWrong")),
        variant: "error",
      })
    } finally {
      setDeleting(false)
    }
  }

  /* ---- Save (create / edit) ---------------------------------------- */
  async function handleSave(draft: AutomationDraft) {
    if (clientId == null) return
    try {
      await saveAutomation(clientId, selected, draft)
      toast({
        title: selected ? t("automations.updatedTitle") : t("automations.createdTitle"),
        description: t("automations.savedDesc", { name: draft.name }),
        variant: "success",
      })
      setView("list")
      setSelectedId(null)
      await reload()
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        logout()
        return
      }
      if (err instanceof AutomationSaveError && err.partial) {
        // New representation saved, old one could not be removed — report it.
        toast({ title: t("automations.savedWarningTitle"), description: err.message, variant: "warning" })
        setView("list")
        setSelectedId(null)
        await reload()
        return
      }
      toast({
        title: selected ? t("automations.updateFailedTitle") : t("automations.createFailedTitle"),
        description: automationErrorMessage(err, t("common.somethingWentWrong")),
        variant: "error",
      })
    }
  }

  /* ---- Routing ------------------------------------------------------ */

  if (view === "form") {
    if (clientId == null) return null
    return (
      <AutomationForm
        clientId={clientId}
        initial={selected}
        onBack={() => setView(selectedId ? "detail" : "list")}
        onSave={handleSave}
        onUnauthorized={logout}
      />
    )
  }

  if (view === "detail" && selected) {
    return (
      <>
        <AutomationDetail
          automation={selected}
          running={runningId === selected.id}
          pausing={pausingId === selected.id}
          onBack={() => {
            setView("list")
            setSelectedId(null)
          }}
          onEdit={() => setView("form")}
          onRun={() => void handleRun(selected)}
          onPauseToggle={() => void handlePauseToggle(selected)}
          onDelete={() => setDeleteTarget(selected)}
        />
        {deleteTarget && (
          <Modal
            isOpen
            onClose={() => {
              if (!deleting) setDeleteTarget(null)
            }}
            title={t("automations.deleteModalTitle")}
            description={t("automations.deleteModalDesc", { name: deleteTarget.name })}
            variant="danger"
            size="sm"
            footer={
              <div className="flex justify-end gap-3">
                <Button variant="ghost" onClick={() => setDeleteTarget(null)} disabled={deleting}>
                  {t("common.cancel")}
                </Button>
                <Button variant="danger" onClick={() => void handleDelete()} loading={deleting}>
                  {deleting ? t("flows.deleting") : t("common.delete")}
                </Button>
              </div>
            }
          />
        )}
      </>
    )
  }

  /* List view */
  return (
    <div className="space-y-6">
      <WorkspaceHeader active={active} onSelect={onSelect} />

      {/* Page header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-extrabold tracking-tight text-navy">
            {t("page.automations.title")}
          </h1>
          <p className="mt-1 text-[14px] text-slate-400">
            {t("page.automations.subtitle")}
          </p>
        </div>
        <Button
          variant="primary"
          onClick={() => {
            setSelectedId(null)
            setView("form")
          }}
          icon={
            <svg className="size-4" viewBox="0 0 20 20" fill="currentColor">
              <path d="M10.75 4.75a.75.75 0 00-1.5 0v4.5h-4.5a.75.75 0 000 1.5h4.5v4.5a.75.75 0 001.5 0v-4.5h4.5a.75.75 0 000-1.5h-4.5v-4.5z" />
            </svg>
          }
        >
          {t("page.automations.create")}
        </Button>
      </div>

      {warning && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-[13px] text-amber-800">
          {warning}
        </div>
      )}

      {/* Loading / error / empty / grid */}
      {loading ? (
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
          <CardSkeleton />
          <CardSkeleton />
          <CardSkeleton />
          <CardSkeleton />
        </div>
      ) : error ? (
        <Card>
          <ErrorState title={t("automations.loadFailedTitle")} description={error} onRetry={() => void reload()} />
        </Card>
      ) : automations.length === 0 ? (
        <EmptyState
          icon={
            <svg
              className="size-10 text-slate-300"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M13 2L4 14h7l-1 8 9-12h-7l1-8z" />
            </svg>
          }
          title={t("automations.emptyTitle")}
          description={t("automations.emptyDesc")}
          action={
            <Button
              variant="primary"
              onClick={() => {
                setSelectedId(null)
                setView("form")
              }}
            >
              {t("page.automations.create")}
            </Button>
          }
        />
      ) : (
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
          {automations.map((a) => (
            <AutomationCard
              key={a.id}
              automation={a}
              running={runningId === a.id}
              pausing={pausingId === a.id}
              onView={() => {
                setSelectedId(a.id)
                setView("detail")
              }}
              onEdit={() => {
                setSelectedId(a.id)
                setView("form")
              }}
              onRun={() => void handleRun(a)}
              onPauseToggle={() => void handlePauseToggle(a)}
              onDelete={() => setDeleteTarget(a)}
            />
          ))}
        </div>
      )}

      {/* Delete confirmation modal */}
      {deleteTarget && (
        <Modal
          isOpen
          onClose={() => {
            if (!deleting) setDeleteTarget(null)
          }}
          title={t("automations.deleteModalTitle")}
          description={t("automations.deleteModalDesc", { name: deleteTarget.name })}
          variant="danger"
          size="sm"
          footer={
            <div className="flex justify-end gap-3">
              <Button variant="ghost" onClick={() => setDeleteTarget(null)} disabled={deleting}>
                {t("common.cancel")}
              </Button>
              <Button variant="danger" onClick={() => void handleDelete()} loading={deleting}>
                {deleting ? t("flows.deleting") : t("common.delete")}
              </Button>
            </div>
          }
        />
      )}
    </div>
  )
}

export default Automations
