import React, { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Button, Card, ErrorState, cx, useToast } from "../primitives"
import { useLang, langLocale } from "../../lib/i18n"
import {
  apiGetTestDefinition,
  apiListTestDefinitions,
  type TestDefinitionListItem,
  type TestDefinitionStatus,
} from "../../lib/api"
import { mapTestDefinitionFailure } from "../../lib/testDefinitionLifecycle"
import { LifecycleBadge, formatTimestamp } from "./shared"

/** One page of definitions. The engine bounds `limit` to 100. */
const PAGE_SIZE = 25

/** How long to wait after the last keystroke before re-querying the engine. */
const SEARCH_DEBOUNCE_MS = 300

/**
 * The status column shows the aggregate's state as the list endpoint reports it.
 *
 * `GET …/test-definitions` returns `TestDefinitionEntity` rows, which carry
 * `isArchived` but no version status — version state lives on the versions of
 * the aggregate and is only available from the detail route. So the list is
 * honest about what it knows: ARCHIVED when the aggregate is archived, and
 * otherwise it defers to the detail view rather than inventing a status.
 */
function listStatus(row: TestDefinitionListItem): TestDefinitionStatus | null {
  return row.isArchived ? "ARCHIVED" : null
}

/**
 * Lifecycle filter for the TESTS IA views. The list endpoint reports no
 * version status, so when set, each row's effective status (newest version,
 * detail route) is resolved through the existing API and rows filter
 * client-side. ARCHIVED aggregates never match a lifecycle filter.
 *
 * Backend follow-up: expose the latest version's status on the list
 * endpoint to eliminate the per-row status resolution below.
 */
export type TestDefinitionStatusFilter = "READY" | "DRAFTS"

const DRAFT_STATUSES: TestDefinitionStatus[] = ["DRAFT", "VALIDATED", "APPROVED"]

function matchesFilter(
  row: TestDefinitionListItem,
  status: TestDefinitionStatus | "UNKNOWN" | undefined,
  filter: TestDefinitionStatusFilter,
): boolean {
  if (row.isArchived || status === undefined || status === "UNKNOWN") return false
  return filter === "READY" ? status === "READY" : DRAFT_STATUSES.includes(status)
}

export function TestDefinitionList({
  clientId,
  clientName,
  onOpen,
  onCreate,
  onUnauthorized,
  statusFilter,
}: {
  clientId: number
  clientName: string
  onOpen: (definitionId: number) => void
  onCreate: () => void
  onUnauthorized: () => void
  statusFilter?: TestDefinitionStatusFilter
}) {
  const { t } = useLang()
  const toast = useToast()
  const locale = langLocale()

  const [rows, setRows] = useState<TestDefinitionListItem[] | null>(null)
  const [total, setTotal] = useState(0)
  const [offset, setOffset] = useState(0)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)
  const [refreshing, setRefreshing] = useState(false)

  const [searchInput, setSearchInput] = useState("")
  const [search, setSearch] = useState("")

  /* Monotonic request id: a slow earlier page can never overwrite a newer one. */
  const requestRef = useRef(0)

  /* Effective lifecycle status per row (detail route), only when filtering. */
  const [statusById, setStatusById] = useState<Record<
    number,
    TestDefinitionStatus | "UNKNOWN"
  > | null>(null)
  const [resolving, setResolving] = useState(false)

  useEffect(() => {
    const handle = setTimeout(() => {
      setSearch(searchInput.trim())
      setOffset(0)
    }, SEARCH_DEBOUNCE_MS)
    return () => clearTimeout(handle)
  }, [searchInput])

  const load = useCallback(
    async (opts: { silent?: boolean } = {}) => {
      const rid = ++requestRef.current
      if (opts.silent) {
        setRefreshing(true)
      } else {
        setRows(null)
        setLoadError(null)
      }
      try {
        const page = await apiListTestDefinitions(clientId, {
          limit: PAGE_SIZE,
          offset,
          search: search || undefined,
        })
        if (rid !== requestRef.current) return
        setRows(page.items ?? [])
        setTotal(page.total ?? 0)
      } catch (err) {
        if (rid !== requestRef.current) return
        const failure = mapTestDefinitionFailure(err)
        if (failure.kind === "unauthenticated") {
          onUnauthorized()
          return
        }
        if (opts.silent) {
          toast({ title: t("testdef.loadFailed"), description: failure.message, variant: "error" })
        } else {
          setLoadError(failure.message)
        }
      } finally {
        if (rid === requestRef.current) setRefreshing(false)
      }
    },
    [clientId, offset, search, onUnauthorized, t, toast],
  )

  useEffect(() => {
    void load()
    return () => {
      // Invalidate in-flight responses so an unmounted page never sets state.
      requestRef.current++
    }
  }, [load, reloadKey])

  /* Resolve row statuses through the existing detail route when filtering. */
  useEffect(() => {
    if (!statusFilter || rows === null) return
    const rid = ++requestRef.current
    setStatusById(null)
    setResolving(true)
    let cancelled = false
    void (async () => {
      try {
        const entries = await Promise.all(
          rows.map(async (row) => {
            try {
              const details = await apiGetTestDefinition(clientId, row.id)
              const latest = details.versions?.[0]
              return [row.id, latest?.status ?? "UNKNOWN"] as const
            } catch (err) {
              if (err && typeof err === "object" && "status" in err &&
                (err as { status?: unknown }).status === 401) {
                onUnauthorized()
                return null
              }
              return [row.id, "UNKNOWN"] as const
            }
          }),
        )
        if (cancelled || rid !== requestRef.current) return
        const next: Record<number, TestDefinitionStatus | "UNKNOWN"> = {}
        for (const entry of entries) {
          if (entry) next[entry[0]] = entry[1]
        }
        setStatusById(next)
      } finally {
        if (!cancelled && rid === requestRef.current) setResolving(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [statusFilter, rows, clientId, onUnauthorized])

  const allItems = rows ?? []
  const items = statusFilter
    ? statusById == null
      ? []
      : allItems.filter((row) => matchesFilter(row, statusById[row.id], statusFilter))
    : allItems
  const filteredEmpty =
    statusFilter != null &&
    !resolving &&
    rows !== null &&
    rows.length > 0 &&
    items.length === 0
  const searching = search !== ""
  const rangeFrom = total === 0 ? 0 : offset + 1
  const rangeTo = offset + items.length

  const flowLabel = useCallback(
    (flowId: number | null) => (flowId == null ? t("testdef.noFlow") : t("testdef.flowNumber", { id: flowId })),
    [t],
  )

  const pager = useMemo(
    () => ({ canPrev: offset > 0, canNext: offset + PAGE_SIZE < total }),
    [offset, total],
  )

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-[220px] flex-1">
          <label htmlFor="testdef-search" className="sr-only">
            {t("testdef.searchPlaceholder")}
          </label>
          <input
            id="testdef-search"
            type="search"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder={t("testdef.searchPlaceholder")}
            className="block w-full rounded-lg border border-slate-200 bg-elevated px-3.5 py-2 text-[13px] text-slate-700 placeholder-slate-400 transition-colors hover:border-slate-300 focus:outline-none focus:ring-2 focus:ring-brand-400"
          />
        </div>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => void load({ silent: true })}
          loading={refreshing}
          aria-label={t("common.refresh")}
        >
          {t("common.refresh")}
        </Button>
        <Button variant="primary" size="sm" onClick={onCreate}>
          {t("testdef.new")}
        </Button>
      </div>

      {statusFilter && rows !== null && !loadError && (
        <p role="status" className="text-[12px] text-slate-400">
          {resolving
            ? t("testdef.filterResolving")
            : t("testdef.filterNote", {
                shown: items.length,
                total: allItems.length,
              })}
        </p>
      )}

      {/* A refresh keeps the current rows on screen; only the button shows progress. */}
      {rows === null && !loadError ? (
        <Card className="flex items-center justify-center px-6 py-16">
          <p role="status" className="text-[13px] text-slate-400">
            {t("common.loading")}
          </p>
        </Card>
      ) : loadError && rows === null ? (
        <ErrorState
          title={t("testdef.loadFailed")}
          description={loadError}
          onRetry={() => setReloadKey((k) => k + 1)}
        />
      ) : statusFilter != null && (resolving || statusById == null) && rows !== null && rows.length > 0 ? (
        <Card className="flex items-center justify-center px-6 py-16">
          <p role="status" className="text-[13px] text-slate-400">
            {t("testdef.filterResolving")}
          </p>
        </Card>
      ) : filteredEmpty ? (
        <Card className="flex flex-col items-center justify-center px-6 py-16 text-center">
          <div className="flex size-12 items-center justify-center rounded-xl bg-slate-100 text-slate-400">
            <svg className="size-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h7l5 5v11a2 2 0 01-2 2z"
              />
            </svg>
          </div>
          <p className="mt-4 font-display text-base font-bold text-navy">
            {statusFilter === "READY" ? t("testdef.noReadyOnPage") : t("testdef.noDraftsOnPage")}
          </p>
          <p className="mt-1 max-w-sm text-[13px] text-slate-500">
            {statusFilter === "READY" ? t("testdef.noReadyOnPageHint") : t("testdef.noDraftsOnPageHint")}
          </p>
        </Card>
      ) : items.length === 0 ? (
        <Card className="flex flex-col items-center justify-center px-6 py-16 text-center">
          <div className="flex size-12 items-center justify-center rounded-xl bg-slate-100 text-slate-400">
            <svg className="size-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h7l5 5v11a2 2 0 01-2 2z"
              />
            </svg>
          </div>
          <p className="mt-4 font-display text-base font-bold text-navy">
            {searching ? t("testdef.noMatch") : t("testdef.empty")}
          </p>
          <p className="mt-1 max-w-sm text-[13px] text-slate-500">
            {searching ? t("testdef.noMatchHint") : t("testdef.emptyHint")}
          </p>
          {!searching && (
            <div className="mt-4">
              <Button variant="primary" size="sm" onClick={onCreate}>
                {t("testdef.new")}
              </Button>
            </div>
          )}
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-start text-[13px]">
              <caption className="sr-only">{t("testdef.title")}</caption>
              <thead>
                <tr className="border-b border-slate-200 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                  <th scope="col" className="px-5 py-3 text-start">{t("testdef.th.name")}</th>
                  <th scope="col" className="px-4 py-3 text-start">{t("testdef.th.client")}</th>
                  <th scope="col" className="px-4 py-3 text-start">{t("testdef.th.flow")}</th>
                  <th scope="col" className="px-4 py-3 text-start">{t("testdef.th.implementation")}</th>
                  <th scope="col" className="px-4 py-3 text-start">{t("testdef.th.status")}</th>
                  <th scope="col" className="px-4 py-3 text-start">{t("testdef.th.updated")}</th>
                  <th scope="col" className="px-4 py-3 text-end">{t("testdef.th.actions")}</th>
                </tr>
              </thead>
              <tbody className={cx("divide-y divide-slate-200", refreshing && "opacity-70")}>
                {items.map((row) => {
                  const status = listStatus(row)
                  return (
                    <tr key={row.id} className="transition-colors hover:bg-slate-50">
                      <td className="px-5 py-3.5">
                        <p className="font-semibold text-slate-800">{row.name}</p>
                        {row.description && (
                          <p className="mt-0.5 max-w-md truncate text-[12px] text-slate-400">{row.description}</p>
                        )}
                      </td>
                      <td className="px-4 py-3.5 text-slate-600">{clientName || `#${row.clientId}`}</td>
                      <td className="px-4 py-3.5">
                        <span className={cx("font-mono text-[12px]", row.flowId == null ? "text-slate-400" : "text-slate-600")} dir="ltr">
                          {flowLabel(row.flowId)}
                        </span>
                      </td>
                      <td className="px-4 py-3.5 text-[12px] text-slate-500">
                        {t("testdef.implementation.testDefinition")}
                      </td>
                      <td className="px-4 py-3.5">
                        {status ? (
                          <LifecycleBadge status={status} />
                        ) : (
                          <span className="text-[12px] text-slate-400">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3.5 text-[12px] text-slate-500">
                        {formatTimestamp(row.updatedAt, locale)}
                      </td>
                      <td className="px-4 py-3.5 text-end">
                        <Button variant="secondary" size="sm" onClick={() => onOpen(row.id)}>
                          {t("common.view")}
                        </Button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {(pager.canPrev || pager.canNext) && (
            <div className="flex items-center justify-between gap-3 border-t border-slate-200 px-5 py-3">
              <p className="text-[12px] text-slate-400">
                {t("testdef.pageRange", { from: rangeFrom, to: rangeTo, total })}
              </p>
              <div className="flex items-center gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={!pager.canPrev}
                  onClick={() => setOffset((o) => Math.max(0, o - PAGE_SIZE))}
                >
                  {t("testdef.prevPage")}
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={!pager.canNext}
                  onClick={() => setOffset((o) => o + PAGE_SIZE)}
                >
                  {t("testdef.nextPage")}
                </Button>
              </div>
            </div>
          )}
        </Card>
      )}
    </div>
  )
}

export default TestDefinitionList
