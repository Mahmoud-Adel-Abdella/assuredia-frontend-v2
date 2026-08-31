import React, { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Button, Card, ErrorState, Modal, Skeleton, Spinner, cx, useToast } from "./primitives"
import { WorkspaceHeader } from "./WorkspaceHeader"
import { useAuth } from "../lib/auth"
import { useLang, translate } from "../lib/i18n"
import {
  ApiError,
  apiClientDetails,
  apiCreateAssetRequest,
  apiFlowTests,
  apiRunFlow,
  type AssetRequestType,
  type BackendClientDetails,
} from "../lib/api"
import {
  clientEnvironment,
  flowDisplayId,
  toFlowTests,
  toFlows,
  toTestRefs,
  type Flow,
  type FlowStatus,
  type FlowTest,
} from "../lib/flowsData"
import type { LiveRunSession } from "../lib/runData"

/* ------------------------------------------------------------------ */
/* Data loading                                                        */
/* ------------------------------------------------------------------ */

type FlowsSource = { details: BackendClientDetails | null; loading: boolean; error: string | null }

/**
 * Flows page data sources:
 *   GET /dashboard-api/clients/{clientId}        → client settings + flow registry
 *   GET /dashboard-api/flows/{flowId}/tests      → tests per flow (fan-out, one per card)
 * clientId comes from the authenticated identity (backend-derived), never
 * from arbitrary frontend state. The page loads once per mount with a
 * stale-response guard; each card tracks its own tests loading/error state.
 */
function useFlowsData(clientId: number | null, onUnauthorized: () => void) {
  const [source, setSource] = useState<FlowsSource>({ details: null, loading: true, error: null })
  const [flows, setFlows] = useState<Flow[]>([])
  const [tests, setTests] = useState<Record<number, FlowTest[]>>({})
  const [testsErrors, setTestsErrors] = useState<Record<number, string>>({})
  const requestRef = useRef(0)

  const load = useCallback(async () => {
    if (clientId == null) return
    const rid = ++requestRef.current
    setSource({ details: null, loading: true, error: null })
    setFlows([])
    setTests({})
    setTestsErrors({})

    let details: BackendClientDetails
    try {
      details = await apiClientDetails(clientId)
    } catch (err) {
      if (rid !== requestRef.current) return
      if (err instanceof ApiError && err.status === 401) return onUnauthorized()
      setSource({
        details: null,
        loading: false,
        error: err instanceof ApiError ? err.message : translate("flows.loadFailed"),
      })
      return
    }
    if (rid !== requestRef.current) return
    setSource({ details, loading: false, error: null })

    const mapped = toFlows(details)
    setFlows(mapped)

    await Promise.allSettled(
      mapped.map(async (flow) => {
        try {
          const rows = await apiFlowTests(flow.id)
          if (rid !== requestRef.current) return
          setTests((prev) => ({ ...prev, [flow.id]: toFlowTests(rows) }))
        } catch (err) {
          if (rid !== requestRef.current) return
          if (err instanceof ApiError && err.status === 401) return onUnauthorized()
          setTestsErrors((prev) => ({
            ...prev,
            [flow.id]: err instanceof ApiError ? err.message : translate("flows.testsLoadFailed"),
          }))
        }
      }),
    )
  }, [clientId, onUnauthorized])

  useEffect(() => {
    load()
    return () => {
      requestRef.current++
    }
  }, [load])

  /** Per-card retry for a failed tests request. */
  const reloadTests = useCallback(
    async (flowId: number) => {
      const rid = requestRef.current
      setTestsErrors((prev) => {
        const next = { ...prev }
        delete next[flowId]
        return next
      })
      try {
        const rows = await apiFlowTests(flowId)
        if (rid !== requestRef.current) return
        setTests((prev) => ({ ...prev, [flowId]: toFlowTests(rows) }))
      } catch (err) {
        if (rid !== requestRef.current) return
        if (err instanceof ApiError && err.status === 401) return onUnauthorized()
        setTestsErrors((prev) => ({
          ...prev,
          [flowId]: err instanceof ApiError ? err.message : translate("flows.testsLoadFailed"),
        }))
      }
    },
    [onUnauthorized],
  )

  return { source, flows, setFlows, tests, setTests, testsErrors, reload: load, reloadTests }
}

/* ------------------------------------------------------------------ */
/* Small building blocks                                              */
/* ------------------------------------------------------------------ */
function FlowStatusBadge({ status }: { status: FlowStatus }) {
  const { t } = useLang()
  const label =
    status === "ACTIVE"
      ? t("status.active")
      : status === "RUNNING"
        ? t("status.running")
        : t("status.inactive")
  const map: { dot: string; text: string; bg: string; ring: string } = {
    ACTIVE: {
      dot: "bg-success",
      text: "text-emerald-700",
      bg: "bg-emerald-50",
      ring: "ring-emerald-600/10",
    },
    RUNNING: {
      dot: "bg-brand-700 animate-pulse",
      text: "text-brand-300",
      bg: "bg-brand-50",
      ring: "ring-brand-700/10",
    },
    INACTIVE: {
      dot: "bg-slate-400",
      text: "text-slate-400",
      bg: "bg-slate-50",
      ring: "ring-slate-300/20",
    },
  }[status]
  return (
    <span
      className={cx(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide ring-1 ring-inset",
        map.bg,
        map.text,
        map.ring,
      )}
    >
      <span className={cx("size-1.5 rounded-full", map.dot)} />
      {label}
    </span>
  )
}

function Checkbox({ checked }: { checked: boolean }) {
  return (
    <span
      className={cx(
        "flex size-4 shrink-0 items-center justify-center rounded border transition-colors",
        checked ? "border-brand-600 bg-brand-600" : "border-slate-300 bg-transparent",
      )}
    >
      {checked && (
        <svg className="size-3 text-white" viewBox="0 0 20 20" fill="currentColor">
          <path
            fillRule="evenodd"
            d="M16.7 5.3a1 1 0 010 1.4l-8 8a1 1 0 01-1.4 0l-4-4a1 1 0 011.4-1.4l3.3 3.29 7.3-7.3a1 1 0 011.4 0z"
          />
        </svg>
      )}
    </span>
  )
}

/* ------------------------------------------------------------------ */
/* Flow Card                                                          */
/* ------------------------------------------------------------------ */
function FlowIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <circle cx="6" cy="6" r="2.5" />
      <circle cx="18" cy="6" r="2.5" />
      <circle cx="12" cy="18" r="2.5" />
      <path strokeLinecap="round" d="M6 8.5v3a3 3 0 003 3h.5M18 8.5v3a3 3 0 01-3 3h-.5" />
    </svg>
  )
}

function FlowCard({
  flow,
  testsError,
  starting,
  onRequestChange,
  onRequestDelete,
  onViewSchedules,
  onRetryTests,
  onRun,
}: {
  flow: Flow
  testsError?: string
  starting?: boolean
  onRequestChange: (flow: Flow) => void
  onRequestDelete: (flow: Flow) => void
  onViewSchedules: () => void
  onRetryTests: (flowId: number) => void
  onRun: (options: { onlyTests?: string[]; browser?: string; deviceType?: string }) => void
}) {
  const [testsOpen, setTestsOpen] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const { t } = useLang()

  const tests = flow.tests
  const testsLoading = tests == null && !testsError
  const running = flow.status === "RUNNING"

  function toggleTest(name: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      next.has(name) ? next.delete(name) : next.add(name)
      return next
    })
  }

  /**
   * Run options for this card. Only values the frozen backend consumes are
   * sent: browser (chrome/firefox/edge) and deviceType (desktop/tablet/
   * mobile). The values come from the client-level environment shown on the
   * card; unset values ("—") are omitted so the backend falls back to the
   * client's stored defaults.
   */
  function runOptions(onlyTests?: string[]) {
    const options: { onlyTests?: string[]; browser?: string; deviceType?: string } = {}
    const browserValue = flow.browser.trim().toLowerCase()
    if (browserValue === "chrome" || browserValue === "firefox" || browserValue === "edge") {
      options.browser = browserValue
    }
    const deviceValue = flow.device.trim().toLowerCase()
    if (deviceValue === "desktop" || deviceValue === "tablet" || deviceValue === "mobile") {
      options.deviceType = deviceValue
    }
    if (onlyTests) options.onlyTests = onlyTests
    return options
  }

  return (
    <Card className="flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-start gap-3 border-b border-slate-100 px-5 py-4">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-300">
          <FlowIcon className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="truncate font-display text-base font-bold text-navy">{flow.name}</h3>
          </div>
          <p className="font-mono text-[12px] text-slate-400">{flowDisplayId(flow.id)}</p>
        </div>
        <FlowStatusBadge status={flow.status} />
      </div>

      {/* Meta row: tests count + browser/device + read-only schedule link */}
      <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 px-5 py-3.5">
        <span className="inline-flex items-center gap-1.5 text-[13px] text-slate-500">
          <svg className="size-4 text-slate-400" viewBox="0 0 20 20" fill="currentColor">
            <path
              fillRule="evenodd"
              d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h7l5 5v11a2 2 0 01-2 2z"
            />
          </svg>
          {tests == null ? (
            testsError ? (
              <span className="text-error">{t("flows.testsUnavailable")}</span>
            ) : (
              <Skeleton className="h-3.5 w-12" />
            )
          ) : (
            <>{t("run.testsCount", { count: tests.length })}</>
          )}
        </span>
        <span className="inline-flex items-center gap-1.5 text-[13px] text-slate-500">
          <span className="size-1.5 rounded-full bg-slate-300" />
          {flow.browser} · {flow.device}
        </span>
        {flow.scheduled && flow.schedulerActive ? (
          <button
            onClick={onViewSchedules}
            title={t("flows.viewInAutomations")}
            className="ms-auto inline-flex items-center gap-1.5 rounded-full bg-brand-50 px-2.5 py-1 text-[12px] font-medium text-brand-300 transition-colors hover:text-brand-400"
          >
            <svg className="size-3.5" viewBox="0 0 20 20" fill="currentColor">
              <path
                fillRule="evenodd"
                d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.3.7l2.5 2.5a1 1 0 001.4-1.4L11 9.6V6z"
              />
            </svg>
            {flow.nextRun ? t("flows.nextRun", { time: flow.nextRun }) : t("status.scheduled")}
          </button>
        ) : flow.scheduled ? (
          <button
            onClick={onViewSchedules}
            title={t("flows.viewInAutomations")}
            className="ms-auto inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-2.5 py-1 text-[12px] font-medium text-amber-700 transition-colors hover:text-amber-800"
          >
            <svg className="size-3.5" viewBox="0 0 20 20" fill="currentColor">
              <path
                fillRule="evenodd"
                d="M7 5a1 1 0 011 1v8a1 1 0 11-2 0V6a1 1 0 011-1zm6 0a1 1 0 011 1v8a1 1 0 11-2 0V6a1 1 0 011-1z"
              />
            </svg>
            {t("status.paused")}
          </button>
        ) : null}
      </div>

      {/* Tests */}
      <div className="border-t border-slate-100">
        <button
          onClick={() => setTestsOpen((o) => !o)}
          className="flex w-full items-center justify-between px-5 py-3 text-left transition-colors hover:bg-slate-50/60"
        >
          <span className="inline-flex items-center gap-2 text-[13px] font-medium text-slate-700">
            {t("table.tests")}{" "}
            {tests != null ? (
              <span className="text-slate-400">({tests.length})</span>
            ) : testsLoading ? (
              <Spinner size="sm" className="text-slate-300" />
            ) : null}
            {selected.size > 0 && (
              <span className="rounded-full bg-brand-50 px-1.5 py-0.5 text-[11px] font-semibold text-brand-300">
                {t("flows.selectedCount", { count: selected.size })}
              </span>
            )}
          </span>
          <svg
            className={cx("size-4 text-slate-400 transition-transform", testsOpen && "rotate-180")}
            viewBox="0 0 20 20"
            fill="currentColor"
          >
            <path
              fillRule="evenodd"
              d="M5.23 7.21a.75.75 0 011.06.02L10 11.17l3.71-3.94a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z"
            />
          </svg>
        </button>
        {testsOpen && (
          <div className="px-5 pb-4">
            {testsError ? (
              <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-red-200 py-6 text-center">
                <p className="text-[13px] font-medium text-error">{testsError}</p>
                <button
                  onClick={() => onRetryTests(flow.id)}
                  className="mt-2 text-[12px] font-semibold text-brand-300 hover:text-brand-400"
                >
                  {t("common.retry")}
                </button>
              </div>
            ) : tests == null ? (
              <div className="flex items-center justify-center gap-2 rounded-lg border border-dashed border-slate-200 py-6 text-[13px] text-slate-400">
                <Spinner size="sm" />
                {t("flows.loadingTests")}
              </div>
            ) : tests.length === 0 ? (
              <p className="rounded-lg border border-dashed border-slate-200 px-3 py-5 text-center text-[12px] text-slate-400">
                {t("flows.noTestsYet")}
              </p>
            ) : (
              <>
                <div className="mb-2 flex items-center gap-3 text-[12px]">
                  <button
                    onClick={() => setSelected(new Set(tests.map((test) => test.name)))}
                    className="font-medium text-brand-300 hover:text-brand-400"
                  >
                    {t("flows.selectAll")}
                  </button>
                  <span className="text-slate-300">·</span>
                  <button
                    onClick={() => setSelected(new Set())}
                    className="font-medium text-slate-400 hover:text-slate-600"
                  >
                    {t("flows.deselectAll")}
                  </button>
                </div>
                <div className="space-y-1">
                  {tests.map((test) => (
                    <button
                      key={test.name}
                      onClick={() => toggleTest(test.name)}
                      className="flex w-full items-center gap-2.5 rounded-md px-2 py-2 text-left transition-colors hover:bg-slate-50"
                    >
                      <Checkbox checked={selected.has(test.name)} />
                      <span className="min-w-0">
                        <span className="block truncate font-mono text-[13px] text-slate-700">{test.name}</span>
                        <span className="block text-[11px] text-slate-400">{test.suite}</span>
                      </span>
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {/* Run actions */}
      <div className="mt-auto flex flex-wrap items-center gap-2 border-t border-slate-100 px-5 py-4">
        <Button
          variant="primary"
          size="sm"
          onClick={() => onRun(runOptions())}
          disabled={running || starting}
          loading={starting}
        >
          {t("flows.runFullFlow")}
        </Button>
        <Button
          variant="secondary"
          size="sm"
          disabled={running || starting || selected.size === 0}
          onClick={() => onRun(runOptions(Array.from(selected)))}
        >
          {t("flows.runSelected", { count: selected.size })}
        </Button>
        <Button variant="ghost" size="sm" disabled={running} onClick={() => onRequestChange(flow)}>
          <svg className="size-4" viewBox="0 0 20 20" fill="currentColor">
            <path d="M13.586 3.586a2 2 0 112.828 2.828l-8.5 8.5a2 2 0 01-.878.506l-3 .857a.5.5 0 01-.618-.618l.857-3a2 2 0 01.506-.878l8.5-8.5z" />
          </svg>
          {t("flows.requestChange")}
        </Button>
        <button
          onClick={() => onRequestDelete(flow)}
          disabled={running}
          className="ms-auto inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-[13px] font-medium text-slate-400 transition-colors hover:bg-red-50 hover:text-error disabled:pointer-events-none disabled:opacity-50"
        >
          <svg className="size-4" viewBox="0 0 20 20" fill="currentColor">
            <path
              fillRule="evenodd"
              d="M9 2a1 1 0 00-.89.55L7.38 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.38l-.73-1.45A1 1 0 0011 2H9zm-1 6a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 002 0V8a1 1 0 00-1-1z"
            />
          </svg>
          {t("flows.requestDeleteShort")}
        </button>
      </div>
    </Card>
  )
}

/* ------------------------------------------------------------------ */
/* Loading skeleton                                                    */
/* ------------------------------------------------------------------ */
function FlowCardSkeleton() {
  return (
    <Card className="flex flex-col overflow-hidden">
      <div className="flex items-start gap-3 border-b border-slate-100 px-5 py-4">
        <Skeleton className="size-10" rounded="lg" />
        <div className="flex-1 space-y-2 pt-1">
          <Skeleton className="h-4 w-36" />
          <Skeleton className="h-3 w-20" />
        </div>
      </div>
      <div className="px-5 py-4">
        <Skeleton className="h-4 w-56" />
      </div>
      <div className="border-t border-slate-100 px-5 py-3">
        <Skeleton className="h-4 w-36" />
      </div>
      <div className="border-t border-slate-100 px-5 py-3">
        <Skeleton className="h-4 w-24" />
      </div>
      <div className="mt-auto border-t border-slate-100 px-5 py-4">
        <Skeleton className="h-8 w-full" rounded="lg" />
      </div>
    </Card>
  )
}

/* ------------------------------------------------------------------ */
/* Empty state                                                        */
/* ------------------------------------------------------------------ */
function FlowsEmptyState({ onAdd }: { onAdd: () => void }) {
  const { t } = useLang()
  return (
    <Card className="flex flex-col items-center justify-center px-6 py-16 text-center">
      <div className="flex size-14 items-center justify-center rounded-xl bg-brand-50 text-brand-300">
        <FlowIcon className="size-7" />
      </div>
      <p className="mt-4 font-display text-base font-bold text-navy">{t("page.flows.emptyTitle")}</p>
      <p className="mt-1 max-w-xs text-[13px] text-slate-500">
        {t("page.flows.emptyDesc")}
      </p>
      <Button variant="primary" className="mt-5" onClick={onAdd} icon={<span className="text-base leading-none">+</span>}>
        {t("flows.requestNewFlow")}
      </Button>
    </Card>
  )
}

/* ------------------------------------------------------------------ */
/* Flows page                                                         */
/* ------------------------------------------------------------------ */

export function Flows({
  active = "flows",
  onSelect = () => {},
  onStartRun,
  onRequestPreset,
}: {
  active?: string
  onSelect?: (k: string) => void
  onStartRun: (session: LiveRunSession) => void
  /** Hands a preselected request type/flow to the Requests page (App-level state). */
  onRequestPreset?: (preset: { type: AssetRequestType; flowId?: number }) => void
}) {
  const { user, logout } = useAuth()
  const { t } = useLang()
  const toast = useToast()
  const clientId = user?.clientId ?? null

  const { source, flows, tests, setTests, testsErrors, reload, reloadTests } = useFlowsData(clientId, logout)
  /** Deletion request target — submitting creates a DELETE_FLOW request, never a direct delete. */
  const [deleteTarget, setDeleteTarget] = useState<Flow | null>(null)
  const [requesting, setRequesting] = useState(false)
  const [startingFlowId, setStartingFlowId] = useState<number | null>(null)

  const empty = flows.length === 0
  const activeCount = useMemo(() => flows.filter((f) => f.status === "ACTIVE").length, [flows])

  /* ---- Asset changes go through the Requests system -----------------
   * The product model is REQUEST → ADMIN REVIEW → APPROVAL →
   * IMPLEMENTATION, so this page never calls the direct mutation
   * endpoints (POST /flows, PUT /flows/{id}/tests, DELETE /flows/{id}).
   * Instead it hands a preselected request type to the Requests page. */
  function openRequest(type: AssetRequestType, flow?: Flow) {
    onSelect("requests")
    onRequestPreset?.({ type, flowId: flow?.id })
  }

  /** Submit a real DELETE_FLOW request — the flow itself is never deleted here. */
  async function confirmDelete() {
    if (!deleteTarget || requesting || clientId == null) return
    setRequesting(true)
    try {
      await apiCreateAssetRequest(clientId, {
        requestType: "DELETE_FLOW",
        flowId: deleteTarget.id,
        reason: t("flows.requestDeleteDefaultReason"),
      })
      toast({
        title: t("flows.deleteRequestedTitle"),
        description: t("flows.deleteRequestedDesc", { name: deleteTarget.name }),
        variant: "success",
      })
      setDeleteTarget(null)
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        logout()
        return
      }
      toast({
        title: t("flows.deleteRequestFailedTitle"),
        description: err instanceof ApiError ? err.message : t("common.somethingWentWrong"),
        variant: "error",
      })
    } finally {
      setRequesting(false)
    }
  }

  /**
   * Start a real execution: POST /clients/{clientId}/flows/{flowId}/run.
   * The client id always comes from the authenticated identity — never from
   * UI state. On 202 the returned runId opens the live RunDetail view.
   */
  async function handleRun(flow: Flow, options: { onlyTests?: string[]; browser?: string; deviceType?: string }) {
    if (clientId == null || startingFlowId != null) return

    // Zero-selection guard: never call the backend with an empty selection.
    if (options.onlyTests && options.onlyTests.length === 0) {
      toast({
        title: t("flows.noTestsSelectedTitle"),
        description: t("flows.noTestsSelectedDesc"),
        variant: "warning",
      })
      return
    }

    // The session needs the flow's test list (in order) to seed the live view.
    let flowTests = tests[flow.id]
    if (flowTests == null) {
      try {
        flowTests = toFlowTests(await apiFlowTests(flow.id))
        setTests((prev) => ({ ...prev, [flow.id]: flowTests ?? [] }))
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) return logout()
        toast({
          title: t("flows.testsLoadFailedTitle"),
          description: err instanceof ApiError ? err.message : t("flows.tryAgain"),
          variant: "error",
        })
        return
      }
    }

    const methods = options.onlyTests
      ? flowTests.filter((t) => options.onlyTests?.includes(t.name))
      : flowTests

    setStartingFlowId(flow.id)
    try {
      const res = await apiRunFlow(clientId, flow.id, options)
      onStartRun({
        runId: res.runId,
        flowId: flow.id,
        flowName: res.flow,
        clientName: res.client,
        methods: methods.map((t) => ({ name: t.name, suite: t.suite })),
        totalTests: res.totalTests,
        options,
      })
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
        description: err instanceof ApiError ? err.message : t("common.somethingWentWrong"),
        variant: "error",
      })
    } finally {
      setStartingFlowId(null)
    }
  }

  /* ---- Not linked to a client (e.g. ADMIN) ------------------------- */
  if (user == null || user.clientId == null) {
    return (
      <div className="space-y-6">
        <WorkspaceHeader active={active} onSelect={onSelect} />
        <Card>
          <ErrorState
            title={t("dashboard.noClientLinked")}
            description={t("flows.noClientDesc")}
          />
        </Card>
      </div>
    )
  }

  /* ---- List view (mutations live on the Requests page) ------------- */
  return (
    <div className="space-y-6">
      <WorkspaceHeader active={active} onSelect={onSelect} />

      {/* Page header */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-brand-300">
            {t("page.flows.eyebrow")}
          </p>
          <h1 className="mt-1 font-display text-2xl font-bold tracking-tight text-navy">
            {t("page.flows.title")}
          </h1>
          <p className="mt-1 text-[13px] text-slate-500">
            {t("page.flows.subtitle")}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {!empty && !source.loading && (
            <span className="hidden text-[13px] text-slate-400 sm:inline">
              {t("page.flows.activeCount", { active: activeCount, total: flows.length })}
            </span>
          )}
          <Button
            variant="secondary"
            onClick={() => openRequest("ADD_FLOW")}
            icon={<span className="text-base leading-none">+</span>}
          >
            {t("requests.newRequest")}
          </Button>
        </div>
      </div>

      {/* Flow list */}
      {source.loading ? (
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
          <FlowCardSkeleton />
          <FlowCardSkeleton />
        </div>
      ) : source.error ? (
        <Card>
          <ErrorState description={source.error} onRetry={reload} />
        </Card>
      ) : empty ? (
        <FlowsEmptyState onAdd={() => openRequest("ADD_FLOW")} />
      ) : (
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
          {flows.map((flow) => (
            <FlowCard
              key={flow.id}
              flow={{ ...flow, tests: tests[flow.id] ?? null }}
              testsError={testsErrors[flow.id]}
              starting={startingFlowId === flow.id}
              onRequestChange={() => openRequest("MODIFY_FLOW", flow)}
              onRequestDelete={() => setDeleteTarget(flow)}
              onViewSchedules={() => onSelect("automations")}
              onRetryTests={reloadTests}
              onRun={(options) => handleRun(flow, options)}
            />
          ))}
        </div>
      )}

      {/* Delete-request confirmation — explains that nothing is deleted yet. */}
      <Modal
        isOpen={deleteTarget != null}
        onClose={() => {
          if (!requesting) setDeleteTarget(null)
        }}
        title={t("flows.deleteRequestModalTitle")}
        description={
          deleteTarget
            ? t("flows.deleteRequestModalDesc", { name: deleteTarget.name })
            : undefined
        }
        size="sm"
        variant="danger"
        footer={
          <>
            <Button variant="secondary" onClick={() => setDeleteTarget(null)} disabled={requesting}>
              {t("common.cancel")}
            </Button>
            <Button variant="danger" onClick={confirmDelete} loading={requesting}>
              {requesting ? t("flows.requesting") : t("flows.requestDeletion")}
            </Button>
          </>
        }
      />
    </div>
  )
}

export default Flows
