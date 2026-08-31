/**
 * Automation create/edit form (Phase 5).
 *
 * Visual design follows the approved Figma layout 1:1; every mock constant
 * from the design file is replaced with real backend data:
 *   - flow options  → GET /dashboard-api/clients/{id} (the client's flows)
 *   - test options  → GET /dashboard-api/flows/{flowId}/tests
 *   - notifications → the backend's notifyPolicy (always / on_failure /
 *                     never), which exists only on scheduled automations.
 * The form emits an AutomationDraft; all backend mapping happens in
 * src/lib/automations.ts.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Button, Card, cx, Spinner, Switch, ErrorState } from "./primitives"
import { ApiError } from "../lib/api"
import { translate, useLang } from "../lib/i18n"
import {
  type Automation,
  type AutomationDraft,
  type AutomationScope,
  type FlowOption,
  type NotifyPolicy,
  NOTIFY_POLICY_OPTIONS,
  SCHEDULE_FREQUENCIES,
  TIMEZONE_OPTIONS,
  deriveCron,
  describeFrequency,
  frequencyLabel,
  getAccountTimezone,
  loadFlowOptions,
  loadFlowTestOptions,
  parseCronToForm,
} from "../lib/automations"

/* ── Types ─────────────────────────────────────────────────── */

export type FlowEntry = {
  key: string
  flowId: number | null
  scope: AutomationScope
  selectedTests: string[]
}

type TestsState =
  | { status: "loading" }
  | { status: "error" }
  | { status: "ready"; tests: string[] }

/* ── Helpers ───────────────────────────────────────────────── */

function randKey(): string {
  return Math.random().toString(36).slice(2, 9)
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.1em] text-slate-400">
      {children}
    </p>
  )
}

const selectCls =
  "w-full rounded-lg border border-slate-200 bg-surface px-3 py-2.5 text-[13px] font-medium text-slate-700 shadow-sm transition-colors hover:border-slate-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400"

function Seg({
  options,
  value,
  onChange,
}: {
  options: { value: string; label: string }[]
  value: string
  onChange: (v: string) => void
}) {
  return (
    <div className="inline-flex gap-1 rounded-lg bg-slate-100 p-1">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={cx(
            "rounded-md px-3 py-1.5 text-[13px] font-medium transition-all",
            value === o.value
              ? "bg-surface text-brand-300 shadow-sm"
              : "text-slate-500 hover:text-slate-700",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

/* ── FlowBlock ─────────────────────────────────────────────── */

function FlowBlock({
  entry,
  index,
  total,
  flowOptions,
  usedIds,
  tests,
  onChange,
  onRemove,
  onMove,
  onRetryTests,
}: {
  entry: FlowEntry
  index: number
  total: number
  flowOptions: FlowOption[]
  usedIds: Set<number>
  tests: TestsState | undefined
  onChange: (e: FlowEntry) => void
  onRemove: () => void
  onMove: (dir: -1 | 1) => void
  onRetryTests: () => void
}) {
  const { t } = useLang()
  const available = flowOptions.filter((f) => f.id === entry.flowId || !usedIds.has(f.id))

  function toggleTest(t: string) {
    const next = entry.selectedTests.includes(t)
      ? entry.selectedTests.filter((x) => x !== t)
      : [...entry.selectedTests, t]
    onChange({ ...entry, selectedTests: next })
  }

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-elevated">
      {/* Header bar */}
      <div className="flex items-center gap-2 border-b border-slate-100 bg-surface px-4 py-2.5">
        {/* Up / down reorder */}
        <div className="flex flex-col gap-px">
          <button
            type="button"
            onClick={() => onMove(-1)}
            disabled={index === 0}
            title={t("automations.form.moveUp")}
            className="rounded p-0.5 text-slate-300 transition-colors hover:text-slate-600 disabled:opacity-25 disabled:hover:text-slate-300"
          >
            <svg className="size-3" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M10 4l6 7H4l6-7z" clipRule="evenodd" />
            </svg>
          </button>
          <button
            type="button"
            onClick={() => onMove(1)}
            disabled={index === total - 1}
            title={t("automations.form.moveDown")}
            className="rounded p-0.5 text-slate-300 transition-colors hover:text-slate-600 disabled:opacity-25 disabled:hover:text-slate-300"
          >
            <svg className="size-3" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M10 16l-6-7h12l-6 7z" clipRule="evenodd" />
            </svg>
          </button>
        </div>
        {/* Drag handle (visual) */}
        <svg
          className="size-4 cursor-grab select-none text-slate-300"
          viewBox="0 0 20 20"
          fill="currentColor"
          aria-hidden="true"
        >
          <path d="M7 4a1 1 0 100 2 1 1 0 000-2zM13 4a1 1 0 100 2 1 1 0 000-2zM7 9a1 1 0 100 2 1 1 0 000-2zM13 9a1 1 0 100 2 1 1 0 000-2zM7 14a1 1 0 100 2 1 1 0 000-2zM13 14a1 1 0 100 2 1 1 0 000-2z" />
        </svg>
        <span className="flex-1 text-[13px] font-semibold text-slate-500">
          {t("automations.form.flowN", { index: index + 1 })}
        </span>
        {total > 1 && (
          <button
            type="button"
            onClick={onRemove}
            title={t("automations.form.removeFlow")}
            className="rounded-md p-1.5 text-slate-400 transition-colors hover:bg-red-50 hover:text-error"
          >
            <svg className="size-4" viewBox="0 0 20 20" fill="currentColor">
              <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
            </svg>
          </button>
        )}
      </div>

      {/* Body */}
      <div className="space-y-4 p-5">
        <div>
          <FieldLabel>{t("automations.form.flowLabel")}</FieldLabel>
          <select
            value={entry.flowId ?? ""}
            onChange={(e) => {
              const nextId = e.target.value === "" ? null : Number(e.target.value)
              onChange({ ...entry, flowId: nextId, selectedTests: [] })
            }}
            className={selectCls}
          >
            {entry.flowId == null && <option value="">{t("automations.form.selectFlowPlaceholder")}</option>}
            {available.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <FieldLabel>{t("automations.form.runScope")}</FieldLabel>
          <Seg
            options={[
              { value: "FULL_FLOW", label: t("run.fullFlow") },
              { value: "SELECTED_TESTS", label: t("run.selectedTests") },
            ]}
            value={entry.scope}
            onChange={(v) =>
              onChange({
                ...entry,
                scope: v === "FULL_FLOW" ? "FULL_FLOW" : "SELECTED_TESTS",
                selectedTests: [],
              })
            }
          />
        </div>

        {entry.scope === "SELECTED_TESTS" && entry.flowId != null && (
          <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
            <div className="mb-3 flex items-center justify-between">
              <span className="text-[11px] font-semibold uppercase tracking-[0.1em] text-slate-400">
                {t("automations.form.selectTests")}
              </span>
              {tests?.status === "ready" && (
                <span className="text-[12px] text-slate-400">
                  {t("automations.form.selectedCount", {
                    selected: entry.selectedTests.length,
                    total: tests.tests.length,
                  })}
                </span>
              )}
            </div>
            {tests?.status === "loading" || tests === undefined ? (
              <div className="flex items-center gap-2 py-3 text-[12px] text-slate-400">
                <Spinner size="sm" className="text-brand-400" />
                {t("automations.form.loadingTests")}
              </div>
            ) : tests.status === "error" ? (
              <div className="flex items-center justify-between gap-3 py-2">
                <span className="text-[12px] text-error">{t("automations.form.testsLoadFailed")}</span>
                <Button variant="ghost" size="sm" onClick={onRetryTests}>
                  {t("common.retry")}
                </Button>
              </div>
            ) : tests.tests.length === 0 ? (
              <p className="py-2 text-[12px] text-slate-400">
                {t("automations.form.noTestsInFlow")}
              </p>
            ) : (
              <div className="space-y-0.5">
                {tests.tests.map((t) => {
                  const checked = entry.selectedTests.includes(t)
                  return (
                    <button
                      key={t}
                      type="button"
                      onClick={() => toggleTest(t)}
                      className="flex w-full items-center gap-2.5 rounded-md px-2 py-2 text-left transition-colors hover:bg-slate-100"
                    >
                      <span
                        className={cx(
                          "flex size-4 shrink-0 items-center justify-center rounded border transition-colors",
                          checked ? "border-brand-600 bg-brand-600" : "border-slate-300",
                        )}
                      >
                        {checked && (
                          <svg className="size-2.5 text-white" viewBox="0 0 20 20" fill="currentColor">
                            <path
                              fillRule="evenodd"
                              d="M16.7 5.3a1 1 0 010 1.4l-8 8a1 1 0 01-1.4 0l-4-4a1 1 0 011.4-1.4l3.3 3.29 7.3-7.3a1 1 0 011.4 0z"
                              clipRule="evenodd"
                            />
                          </svg>
                        )}
                      </span>
                      <span className="font-mono text-[12px] text-slate-700">{t}</span>
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

/* ── Summary sidebar ───────────────────────────────────────── */

function AutomationSummary({
  name,
  flows,
  flowOptions,
  testsCache,
  schedEnabled,
  schedFreq,
  schedTime,
  schedTz,
  cron,
}: {
  name: string
  flows: FlowEntry[]
  flowOptions: FlowOption[]
  testsCache: Record<number, TestsState>
  schedEnabled: boolean
  schedFreq: string
  schedTime: string
  schedTz: string
  cron: string
}) {
  const { t } = useLang()
  const totalTests = useMemo(() => {
    let total = 0
    for (const entry of flows) {
      if (entry.flowId == null) continue
      if (entry.scope === "SELECTED_TESTS") total += entry.selectedTests.length
      else {
        const state = testsCache[entry.flowId]
        total += state?.status === "ready" ? state.tests.length : 0
      }
    }
    return total
  }, [flows, testsCache])

  return (
    <div className="lg:sticky lg:top-6">
      <Card className="overflow-hidden">
        <div className="border-b border-slate-100 px-5 py-3.5">
          <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-slate-400">
            {t("automations.form.summaryTitle")}
          </p>
        </div>
        <div className="space-y-4 p-5 text-[13px]">
          {/* Key stats */}
          <div className="space-y-2.5">
            <div className="flex items-start justify-between gap-3">
              <span className="shrink-0 text-slate-400">{t("automations.form.nameTitle")}</span>
              <span className="break-all text-right font-medium text-slate-700">
                {name.trim() ? name.trim() : <em className="text-slate-300">{t("automations.form.untitled")}</em>}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">{t("automations.form.flowsTitle")}</span>
              <span className="font-semibold text-navy">{flows.filter((f) => f.flowId != null).length}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">{t("automations.form.testsLabel")}</span>
              <span className="font-semibold text-navy">{totalTests}</span>
            </div>
          </div>

          {/* Flow list */}
          {flows.length > 0 && (
            <div className="space-y-2 border-t border-slate-100 pt-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-slate-400">
                {t("automations.form.flowsTitle")}
              </p>
              {flows.map((e) => {
                const label =
                  e.scope === "FULL_FLOW"
                    ? t("automations.form.fullScopeShort")
                    : t("run.testsCount", { count: e.selectedTests.length })
                const flowName = e.flowId != null ? flowOptions.find((f) => f.id === e.flowId)?.name : undefined
                return (
                  <div key={e.key} className="flex items-center gap-1.5">
                    <svg
                      className="size-3.5 shrink-0 text-success"
                      viewBox="0 0 20 20"
                      fill="currentColor"
                    >
                      <path
                        fillRule="evenodd"
                        d="M16.7 5.3a1 1 0 010 1.4l-8 8a1 1 0 01-1.4 0l-4-4a1 1 0 011.4-1.4l3.3 3.29 7.3-7.3a1 1 0 011.4 0z"
                        clipRule="evenodd"
                      />
                    </svg>
                    <span className="font-medium text-slate-700">
                      {flowName ?? <em className="text-slate-300">{t("automations.form.noFlow")}</em>}
                    </span>
                    <span className="text-slate-300">·</span>
                    <span className="text-slate-400">{label}</span>
                  </div>
                )
              })}
            </div>
          )}

          {/* Schedule */}
          <div className="space-y-2 border-t border-slate-100 pt-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-slate-400">
              {t("automations.form.scheduleTitle")}
            </p>
            {schedEnabled ? (
              <>
                <p className="font-medium text-slate-700">{describeFrequency(schedFreq, schedTime)}</p>
                <p className="text-[12px] text-slate-400">{schedTz}</p>
                <div className="mt-1 inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-slate-50 px-2 py-1">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    CRON
                  </span>
                  <code className="font-mono text-[11px] text-slate-600">{cron}</code>
                </div>
              </>
            ) : (
              <p className="text-slate-400">{t("automations.form.notScheduledSummary")}</p>
            )}
          </div>

          {/* Execution mode */}
          <div className="space-y-1 border-t border-slate-100 pt-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-slate-400">
              {t("automations.form.executionLabel")}
            </p>
            <p className="font-medium text-slate-700">
              {schedEnabled ? t("automations.form.execManualScheduled") : t("trigger.manual")}
            </p>
          </div>
        </div>
      </Card>
    </div>
  )
}

/* ── AutomationForm (main export) ──────────────────────────── */

export function AutomationForm({
  clientId,
  initial,
  onBack,
  onSave,
  onUnauthorized,
}: {
  clientId: number
  initial: Automation | null
  onBack: () => void
  onSave: (draft: AutomationDraft) => Promise<void>
  onUnauthorized: () => void
}) {
  const isEdit = initial != null
  const { t } = useLang()

  /* Flow options (real client flows — no mock pool) */
  const [flowOptions, setFlowOptions] = useState<FlowOption[] | null>(null)
  const [flowsError, setFlowsError] = useState<string | null>(null)
  const [testsCache, setTestsCache] = useState<Record<number, TestsState>>({})
  const requestRef = useRef(0)

  /* Name */
  const [name, setName] = useState(initial?.name ?? "")
  const [nameErr, setNameErr] = useState("")

  /* Flows */
  const [flows, setFlows] = useState<FlowEntry[]>(
    initial && initial.flows.length > 0
      ? initial.flows.map((f) => ({
          key: randKey(),
          flowId: f.flowId,
          scope: f.scope,
          selectedTests: [...f.selectedTests],
        }))
      : [{ key: randKey(), flowId: null, scope: "FULL_FLOW", selectedTests: [] }],
  )
  const [flowsErr, setFlowsErr] = useState("")

  /* Schedule */
  const parsedInit = initial?.schedule ? parseCronToForm(initial.schedule.cronExpression) : null
  /** Set when the existing schedule's cron is not representable in the form. */
  const [rawCron] = useState<string | null>(() => {
    if (!initial?.schedule) return null
    return parseCronToForm(initial.schedule.cronExpression) ? null : initial.schedule.cronExpression
  })
  const [cronDirty, setCronDirty] = useState(false)
  const [schedEnabled, setSchedEnabled] = useState(initial?.schedule != null)
  const [schedFreq, setSchedFreq] = useState(parsedInit?.frequency ?? "Every day")
  const [schedTime, setSchedTime] = useState(parsedInit?.time ?? "09:00")

  /* Timezone — account mode stores null (backend inherits the client's). */
  const accountTz = useMemo(() => getAccountTimezone(), [])
  const [tzMode, setTzMode] = useState<"account" | "custom">(() => {
    const initTz = initial?.schedule?.timezone
    if (!initTz || initTz === getAccountTimezone()) return "account"
    return "custom"
  })
  const [customTz, setCustomTz] = useState(initial?.schedule?.timezone ?? TIMEZONE_OPTIONS[0])
  const effectiveTz = tzMode === "account" ? accountTz : customTz

  /* Notifications — backend notifyPolicy (scheduled automations only). */
  const [notifOpen, setNotifOpen] = useState(false)
  const [notifyPolicy, setNotifyPolicy] = useState<NotifyPolicy>(
    initial?.schedule?.notifyPolicy ?? "on_failure",
  )

  const [saving, setSaving] = useState(false)

  const usedIds = useMemo(
    () => new Set(flows.map((e) => e.flowId).filter((id): id is number => id != null)),
    [flows],
  )
  const canAdd = flowOptions != null && flows.length < flowOptions.length

  /* ---- Load flow options ---------------------------------------- */
  const loadOptions = useCallback(async () => {
    const requestId = ++requestRef.current
    setFlowsError(null)
    setFlowOptions(null)
    try {
      const options = await loadFlowOptions(clientId)
      if (requestId !== requestRef.current) return
      setFlowOptions(options)
    } catch (err) {
      if (requestId !== requestRef.current) return
      if (err instanceof ApiError && err.status === 401) return onUnauthorized()
      setFlowsError(err instanceof ApiError ? err.message : translate("automations.form.flowsLoadError"))
    }
  }, [clientId, onUnauthorized])

  useEffect(() => {
    void loadOptions()
  }, [loadOptions])

  /* ---- Load tests for every chosen flow -------------------------- */
  const loadTests = useCallback(
    async (flowId: number) => {
      setTestsCache((prev) => ({ ...prev, [flowId]: { status: "loading" } }))
      try {
        const tests = await loadFlowTestOptions(flowId)
        setTestsCache((prev) => ({ ...prev, [flowId]: { status: "ready", tests } }))
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) return onUnauthorized()
        setTestsCache((prev) => ({ ...prev, [flowId]: { status: "error" } }))
      }
    },
    [onUnauthorized],
  )

  useEffect(() => {
    for (const entry of flows) {
      if (entry.flowId != null && testsCache[entry.flowId] === undefined) {
        void loadTests(entry.flowId)
      }
    }
  }, [flows, testsCache, loadTests])

  /* ---- Flow list operations -------------------------------------- */
  function addFlow() {
    if (!flowOptions) return
    const next = flowOptions.find((f) => !usedIds.has(f.id))
    if (!next) return
    setFlows((prev) => [...prev, { key: randKey(), flowId: next.id, scope: "FULL_FLOW", selectedTests: [] }])
  }

  function removeFlow(key: string) {
    setFlows((prev) => prev.filter((e) => e.key !== key))
  }

  function updateFlow(key: string, updated: FlowEntry) {
    setFlows((prev) => prev.map((e) => (e.key === key ? updated : e)))
  }

  function moveFlow(idx: number, dir: -1 | 1) {
    setFlows((prev) => {
      const next = [...prev]
      const [item] = next.splice(idx, 1)
      next.splice(idx + dir, 0, item)
      return next
    })
  }

  /* ---- Save ------------------------------------------------------- */
  const effectiveCron = cronDirty || !rawCron ? deriveCron(schedFreq, schedTime) : rawCron

  function validate(): boolean {
    let ok = true
    if (!name.trim()) {
      setNameErr(t("automations.form.nameRequired"))
      ok = false
    } else if (name.trim().length > 120) {
      setNameErr(t("automations.form.nameTooLong"))
      ok = false
    } else {
      setNameErr("")
    }

    if (flows.length === 0 || flows.some((e) => e.flowId == null)) {
      setFlowsErr(t("automations.form.flowsRequired"))
      ok = false
    } else if (
      flows.some((e) => {
        if (e.scope !== "SELECTED_TESTS" || e.flowId == null) return false
        const state = testsCache[e.flowId]
        // Only block on a definitive empty selection; loading/error states are retried by the backend.
        return e.selectedTests.length === 0 && state?.status !== "loading" && state?.status !== "error"
      })
    ) {
      setFlowsErr(t("automations.form.selectTestsRequired"))
      ok = false
    } else {
      setFlowsErr("")
    }
    return ok
  }

  async function handleSave() {
    if (!validate() || saving) return
    const draft: AutomationDraft = {
      name: name.trim(),
      items: flows
        .filter((e): e is FlowEntry & { flowId: number } => e.flowId != null)
        .map((e) => ({
          flowId: e.flowId,
          runScope: e.scope,
          selectedTests: e.scope === "SELECTED_TESTS" ? e.selectedTests : undefined,
        })),
      schedule: schedEnabled
        ? {
            cronExpression: effectiveCron,
            timezone: tzMode === "account" ? null : customTz,
            notifyPolicy,
          }
        : null,
    }
    setSaving(true)
    try {
      await onSave(draft)
    } finally {
      setSaving(false)
    }
  }

  const needsTime = schedFreq === "Every day" || schedFreq === "Every week"
  const notifyLabel = t(
    NOTIFY_POLICY_OPTIONS.find((o) => o.value === notifyPolicy)?.labelKey ?? "schedule.notifyDefault",
  )

  /* ---- Loading / error gates -------------------------------------- */
  if (flowsError) {
    return (
      <div className="space-y-6">
        <FormHeader isEdit={isEdit} onBack={onBack} />
        <Card>
          <ErrorState title={t("automations.form.flowsLoadFailed")} description={flowsError} onRetry={() => void loadOptions()} />
        </Card>
      </div>
    )
  }

  if (!flowOptions) {
    return (
      <div className="space-y-6">
        <FormHeader isEdit={isEdit} onBack={onBack} />
        <Card className="flex items-center justify-center gap-3 px-6 py-16 text-[13px] text-slate-400">
          <Spinner size="sm" className="text-brand-400" />
          {t("automations.form.loadingFlows")}
        </Card>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <FormHeader isEdit={isEdit} onBack={onBack} />

      {/* Two-column layout */}
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[1fr_288px]">
        {/* ── Left: form sections ── */}
        <div className="space-y-5">
          {/* Section 1: Name */}
          <Card className="p-6">
            <div className="mb-5 flex items-center gap-2.5">
              <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-brand-50 text-[11px] font-bold text-brand-400">
                1
              </span>
              <h3 className="font-display text-[15px] font-bold text-navy">{t("automations.form.nameTitle")}</h3>
            </div>
            <FieldLabel>{t("automations.form.nameLabel")}</FieldLabel>
            <input
              type="text"
              value={name}
              placeholder={t("automations.form.namePlaceholder")}
              onChange={(e) => setName(e.target.value)}
              className={cx(
                "w-full rounded-lg border bg-surface px-3 py-2.5 text-[14px] font-medium text-slate-700 shadow-sm transition-colors placeholder:text-slate-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400",
                nameErr
                  ? "border-error focus-visible:ring-error"
                  : "border-slate-200 hover:border-slate-300",
              )}
            />
            {nameErr && <p className="mt-1.5 text-[12px] text-error">{nameErr}</p>}
          </Card>

          {/* Section 2: Flows */}
          <Card className="p-6">
            <div className="mb-5 flex items-center gap-2.5">
              <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-brand-50 text-[11px] font-bold text-brand-400">
                2
              </span>
              <div>
                <h3 className="font-display text-[15px] font-bold text-navy">{t("automations.form.flowsTitle")}</h3>
                <p className="mt-0.5 text-[12px] text-slate-400">
                  {t("automations.form.flowsHint")}
                </p>
              </div>
            </div>

            {flowOptions.length === 0 ? (
              <div className="rounded-lg bg-slate-50 px-4 py-3 text-[13px] text-slate-400">
                {t("automations.form.noFlowsYet")}
              </div>
            ) : (
              <div className="space-y-4">
                {flows.map((entry, idx) => (
                  <FlowBlock
                    key={entry.key}
                    entry={entry}
                    index={idx}
                    total={flows.length}
                    flowOptions={flowOptions}
                    usedIds={usedIds}
                    tests={entry.flowId != null ? testsCache[entry.flowId] : undefined}
                    onChange={(updated) => updateFlow(entry.key, updated)}
                    onRemove={() => removeFlow(entry.key)}
                    onMove={(dir) => moveFlow(idx, dir)}
                    onRetryTests={() => entry.flowId != null && void loadTests(entry.flowId)}
                  />
                ))}

                {canAdd ? (
                  <button
                    type="button"
                    onClick={addFlow}
                    className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-slate-300 py-3.5 text-[13px] font-medium text-slate-400 transition-colors hover:border-brand-400 hover:text-brand-400"
                  >
                    <svg className="size-4" viewBox="0 0 20 20" fill="currentColor">
                      <path d="M10.75 4.75a.75.75 0 00-1.5 0v4.5h-4.5a.75.75 0 000 1.5h4.5v4.5a.75.75 0 001.5 0v-4.5h4.5a.75.75 0 000-1.5h-4.5v-4.5z" />
                    </svg>
                    {t("automations.form.addFlow")}
                  </button>
                ) : (
                  <p className="text-center text-[12px] text-slate-400">
                    {t("automations.form.allFlowsAdded")}
                  </p>
                )}
                {flowsErr && <p className="text-[12px] text-error">{flowsErr}</p>}
              </div>
            )}
          </Card>

          {/* Section 3: Schedule */}
          <Card className="p-6">
            <div className="mb-5 flex items-start justify-between gap-4">
              <div className="flex items-center gap-2.5">
                <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-brand-50 text-[11px] font-bold text-brand-400">
                  3
                </span>
                <div>
                  <h3 className="font-display text-[15px] font-bold text-navy">{t("automations.form.scheduleTitle")}</h3>
                  <p className="mt-0.5 text-[12px] text-slate-400">
                    {t("automations.form.scheduleHint")}
                  </p>
                </div>
              </div>
              <Switch on={schedEnabled} onChange={setSchedEnabled} label={t("automations.form.enable")} />
            </div>

            {!schedEnabled && (
              <div className="rounded-lg bg-slate-50 px-4 py-3 text-[13px] text-slate-400">
                {t("automations.form.notScheduledHintBefore")}{" "}
                <span className="font-semibold text-slate-600">{t("page.automations.runNow")}</span>.
              </div>
            )}

            {schedEnabled && (
              <div className="space-y-4">
                {rawCron && !cronDirty && (
                  <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-[12px] text-amber-700">
                    {t("automations.form.customCronWarningBefore")}{" "}
                    <code className="font-mono">{rawCron}</code>
                    {t("automations.form.customCronWarningAfter")}
                  </div>
                )}
                <div
                  className={cx(
                    "grid grid-cols-1 gap-4",
                    needsTime ? "sm:grid-cols-2" : "",
                  )}
                >
                  <div>
                    <FieldLabel>{t("automations.form.frequency")}</FieldLabel>
                    <select
                      value={schedFreq}
                      onChange={(e) => {
                        setSchedFreq(e.target.value)
                        setCronDirty(true)
                      }}
                      className={selectCls}
                    >
                      {SCHEDULE_FREQUENCIES.map((f) => (
                        <option key={f} value={f}>
                          {frequencyLabel(f)}
                        </option>
                      ))}
                    </select>
                  </div>
                  {needsTime && (
                    <div>
                      <FieldLabel>{t("automations.form.time")}</FieldLabel>
                      <input
                        type="time"
                        value={schedTime}
                        onChange={(e) => {
                          setSchedTime(e.target.value)
                          setCronDirty(true)
                        }}
                        className={selectCls}
                      />
                    </div>
                  )}
                </div>
                {/* Timezone — account vs custom */}
                <div>
                  <FieldLabel>{t("automations.form.timezone")}</FieldLabel>
                  <div className="inline-flex w-full gap-1 rounded-lg bg-slate-100 p-1">
                    {(["account", "custom"] as const).map((mode) => (
                      <button
                        key={mode}
                        type="button"
                        onClick={() => setTzMode(mode)}
                        className={cx(
                          "flex-1 rounded-md px-3 py-1.5 text-[12px] font-medium transition-all",
                          tzMode === mode
                            ? "bg-surface text-brand-300 shadow-sm"
                            : "text-slate-500 hover:text-slate-700",
                        )}
                      >
                        {mode === "account" ? t("automations.form.useAccountTz") : t("automations.form.customTz")}
                      </button>
                    ))}
                  </div>

                  {tzMode === "account" ? (
                    <div className="mt-2 flex items-center gap-3 rounded-lg border border-brand-100 bg-brand-50 px-3.5 py-2.5">
                      <svg
                        className="size-4 shrink-0 text-brand-400"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.8"
                      >
                        <circle cx="12" cy="12" r="9" />
                        <path strokeLinecap="round" d="M12 3v18M3 9h18M3 15h18" />
                      </svg>
                      <div>
                        <p className="font-mono text-[13px] font-bold text-navy">{accountTz}</p>
                        <p className="text-[11px] text-brand-400">
                          {t("automations.form.fromSettingsTzBefore")}
                          <span className="inline-block rtl:-scale-x-100"> → </span>
                          {t("automations.form.fromSettingsTzAfter")}
                        </p>
                      </div>
                    </div>
                  ) : (
                    <select
                      value={customTz}
                      onChange={(e) => setCustomTz(e.target.value)}
                      className={cx(selectCls, "mt-2")}
                    >
                      {TIMEZONE_OPTIONS.map((tz) => (
                        <option key={tz}>{tz}</option>
                      ))}
                    </select>
                  )}
                </div>
                {/* Preview */}
                <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
                  <div className="flex items-center justify-between">
                    <p className="text-[13px] font-medium text-slate-700">
                      {describeFrequency(schedFreq, schedTime)} · {effectiveTz}
                    </p>
                    <span className="flex items-center gap-1 text-[11px] font-medium text-success">
                      <span className="size-1.5 rounded-full bg-success" />
                      {t("common.active")}
                    </span>
                  </div>
                  <div className="mt-2 inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2 py-1">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                      CRON
                    </span>
                    <code className="font-mono text-[11px] text-slate-600">{effectiveCron}</code>
                  </div>
                </div>
              </div>
            )}
          </Card>

          {/* Section 4: Notifications */}
          <Card className="p-6">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-center gap-2.5">
                <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-brand-50 text-[11px] font-bold text-brand-400">
                  4
                </span>
                <h3 className="font-display text-[15px] font-bold text-navy">{t("automations.form.notificationsTitle")}</h3>
              </div>
              {schedEnabled && (
                <button
                  type="button"
                  onClick={() => setNotifOpen((v) => !v)}
                  className="flex shrink-0 items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-[12px] font-medium text-slate-500 transition-colors hover:bg-slate-50"
                >
                  {notifOpen ? t("automations.form.collapse") : t("automations.form.configure")}
                  <svg
                    className={cx("size-3.5 transition-transform", notifOpen && "rotate-180")}
                    viewBox="0 0 20 20"
                    fill="currentColor"
                  >
                    <path
                      fillRule="evenodd"
                      d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z"
                      clipRule="evenodd"
                    />
                  </svg>
                </button>
              )}
            </div>

            {!schedEnabled && (
              <p className="mt-3 text-[13px] text-slate-400">
                {t("automations.form.notifScheduledOnly")}
              </p>
            )}

            {schedEnabled && !notifOpen && (
              <p className="mt-3 text-[13px] text-slate-400">
                {t("automations.form.notifyPrefix")}{" "}
                <span className="font-medium text-slate-600">{notifyLabel}</span>
              </p>
            )}

            {schedEnabled && notifOpen && (
              <div className="mt-4 space-y-3">
                <div>
                  <FieldLabel>{t("automations.form.notifyPrefix")}</FieldLabel>
                  <select
                    value={notifyPolicy}
                    onChange={(e) => setNotifyPolicy(e.target.value as NotifyPolicy)}
                    className={selectCls}
                  >
                    {NOTIFY_POLICY_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {t(o.labelKey)}
                      </option>
                    ))}
                  </select>
                </div>
                <p className="text-[12px] text-slate-400">
                  {t("automations.form.notifyPolicyHint")}
                </p>
              </div>
            )}
          </Card>

          {/* Footer actions */}
          <div className="flex items-center gap-3 pb-6">
            <Button variant="ghost" onClick={onBack} disabled={saving}>
              {t("common.cancel")}
            </Button>
            <Button variant="primary" onClick={() => void handleSave()} loading={saving}>
              {saving
                ? t("automations.form.saving")
                : isEdit
                  ? t("common.saveChanges")
                  : t("automations.form.saveAutomation")}
            </Button>
          </div>
        </div>

        {/* ── Right: live summary ── */}
        <AutomationSummary
          name={name}
          flows={flows}
          flowOptions={flowOptions}
          testsCache={testsCache}
          schedEnabled={schedEnabled}
          schedFreq={schedFreq}
          schedTime={schedTime}
          schedTz={effectiveTz}
          cron={effectiveCron}
        />
      </div>
    </div>
  )
}

function FormHeader({ isEdit, onBack }: { isEdit: boolean; onBack: () => void }) {
  const { t } = useLang()
  return (
    <div>
      <button
        onClick={onBack}
        className="mb-3 flex items-center gap-1.5 text-[13px] font-medium text-slate-400 transition-colors hover:text-slate-700"
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
      <h1 className="font-display text-2xl font-extrabold tracking-tight text-navy">
        {isEdit ? t("automations.form.editTitle") : t("page.automations.create")}
      </h1>
      <p className="mt-1 text-[14px] text-slate-400">
        {isEdit ? t("automations.form.editSubtitle") : t("automations.form.createSubtitle")}
      </p>
    </div>
  )
}

export default AutomationForm
