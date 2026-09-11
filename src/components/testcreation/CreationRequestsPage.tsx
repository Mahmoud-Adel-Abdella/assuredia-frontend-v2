import React, { useCallback, useEffect, useRef, useState } from "react"
import {
  Button,
  Card,
  EmptyState,
  ErrorState,
  Modal,
  TableSkeleton,
  useToast,
} from "../primitives"
import {
  ApiError,
  apiCancelCreationRequest,
  apiGetCreationRequest,
  apiListCreationRequests,
} from "../../lib/api"
import {
  canCancel,
  failureText,
  journeyLabel,
  mapCreationFailure,
  methodLabel,
  statusBadgeClass,
  statusHelper,
  statusLabel,
  type CreationMethod,
  type CreationStatus,
  type JourneyType,
  type TestCreationRequest,
} from "../../lib/testCreation"

const PER_PAGE = 10

function formatDate(value: string): string {
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return value
  return d.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  })
}

function StatusBadge({ status }: { status: CreationStatus }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] font-semibold ring-1 ring-inset ${statusBadgeClass(status)}`}
    >
      <span className="size-1.5 rounded-full bg-current" aria-hidden="true" />
      {statusLabel(status)}
    </span>
  )
}

export function CreationRequestsPage({
  clientId,
  onNewTest,
  onOpenDefinition,
  onUnauthorized,
}: {
  clientId: number
  onNewTest: () => void
  onOpenDefinition: (definitionId: number) => void
  onUnauthorized: () => void
}) {
  const toast = useToast()
  const [search, setSearch] = useState("")
  const [status, setStatus] = useState("")
  const [journey, setJourney] = useState("")
  const [method, setMethod] = useState("")
  const [page, setPage] = useState(0)
  const [rows, setRows] = useState<TestCreationRequest[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [detail, setDetail] = useState<TestCreationRequest | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [detailError, setDetailError] = useState<string | null>(null)
  const [cancelOpen, setCancelOpen] = useState(false)
  const [cancelling, setCancelling] = useState(false)
  const requestRef = useRef(0)

  const load = useCallback(async () => {
    const id = ++requestRef.current
    setLoading(true)
    setError(null)
    try {
      const res = await apiListCreationRequests(clientId, {
        status: status || undefined,
        limit: PER_PAGE,
        offset: page * PER_PAGE,
      })
      if (requestRef.current !== id) return
      setRows(res.items as TestCreationRequest[])
      setTotal(res.total ?? res.items.length)
    } catch (err) {
      if (requestRef.current !== id) return
      if (err instanceof ApiError && err.status === 401) {
        onUnauthorized()
        return
      }
      setError(failureText(mapCreationFailure(err)))
    } finally {
      if (requestRef.current === id) setLoading(false)
    }
  }, [clientId, status, page, onUnauthorized])

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    setPage(0)
  }, [status, journey, method])

  const filtered = rows.filter((r) => {
    if (journey && r.journeyType !== journey as JourneyType) return false
    if (method && r.creationMethod !== method as CreationMethod) return false
    const q = search.trim().toLowerCase()
    if (!q) return true
    return r.title.toLowerCase().includes(q) || String(r.id).includes(q)
  })

  async function openDetail(id: number) {
    setSelectedId(id)
    setDetail(null)
    setDetailError(null)
    setDetailLoading(true)
    try {
      const row = await apiGetCreationRequest(clientId, id)
      setDetail(row as TestCreationRequest)
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        onUnauthorized()
        return
      }
      setDetailError(failureText(mapCreationFailure(err)))
    } finally {
      setDetailLoading(false)
    }
  }

  async function confirmCancel() {
    if (selectedId == null || cancelling) return
    setCancelling(true)
    try {
      const row = await apiCancelCreationRequest(clientId, selectedId)
      setDetail(row as TestCreationRequest)
      setRows((prev) =>
        prev.map((r) => (r.id === selectedId ? row as TestCreationRequest : r)),
      )
      setCancelOpen(false)
      toast({ title: "Request cancelled", variant: "success" })
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        onUnauthorized()
        return
      }
      toast({
        title: "Could not cancel",
        description: failureText(mapCreationFailure(err)),
        variant: "error",
      })
    } finally {
      setCancelling(false)
    }
  }

  if (selectedId != null) {
    return (
      <div className="space-y-4">
        <Button
          variant="ghost"
          onClick={() => {
            setSelectedId(null)
            setDetail(null)
            load()
          }}
        >
          ← Back to Creation Requests
        </Button>
        {detailLoading && <TableSkeleton rows={6} />}
        {detailError && !detailLoading && (
          <ErrorState
            title="Could not load request"
            description={detailError}
            onRetry={() => openDetail(selectedId)}
          />
        )}
        {detail && (
          <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
            <div className="space-y-4">
              <Card className="p-6">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-mono text-[12px] text-slate-400">
                      #{detail.id}
                    </p>
                    <h1 className="mt-1 font-display text-xl font-bold text-navy">
                      {detail.title}
                    </h1>
                  </div>
                  <StatusBadge status={detail.status} />
                </div>
                <dl className="mt-4 grid gap-2 text-sm sm:grid-cols-2">
                  <div>
                    <dt className="text-slate-500">Journey Type</dt>
                    <dd className="font-medium text-navy">
                      {journeyLabel(detail.journeyType)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-slate-500">Method</dt>
                    <dd className="font-medium text-navy">
                      {methodLabel(detail.creationMethod)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-slate-500">Requested By</dt>
                    <dd className="font-medium text-navy">
                      #{detail.requestedBy}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-slate-500">Created</dt>
                    <dd className="text-slate-700">
                      {formatDate(detail.createdAt)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-slate-500">Updated</dt>
                    <dd className="text-slate-700">
                      {formatDate(detail.updatedAt)}
                    </dd>
                  </div>
                  {detail.flowId != null && (
                    <div>
                      <dt className="text-slate-500">Flow</dt>
                      <dd className="text-slate-700">#{detail.flowId}</dd>
                    </div>
                  )}
                  {detail.definitionId != null && (
                    <div>
                      <dt className="text-slate-500">Draft</dt>
                      <dd>
                        <button
                          onClick={() =>
                            onOpenDefinition(detail.definitionId as number)
                          }
                          className="font-mono font-semibold text-brand-300 underline-offset-4 hover:underline"
                        >
                          #{detail.definitionId} (open in Test Definitions)
                        </button>
                      </dd>
                    </div>
                  )}
                  {detail.decisionReason && (
                    <div className="sm:col-span-2">
                      <dt className="text-slate-500">Decision</dt>
                      <dd className="text-slate-700">
                        {detail.decisionReason}
                      </dd>
                    </div>
                  )}
                </dl>
              </Card>
              <Card className="p-6">
                <h2 className="font-display text-base font-bold text-navy">
                  Description
                </h2>
                <p className="mt-2 whitespace-pre-wrap text-sm text-slate-700">
                  {detail.description ?? "—"}
                </p>
              </Card>
            </div>
            <div className="space-y-4">
              {canCancel(detail.status) && (
                <Card className="p-5">
                  <h2 className="font-display text-base font-bold text-navy">
                    Actions
                  </h2>
                  <Button
                    variant="secondary"
                    className="mt-3 w-full border-red-200 text-red-700"
                    onClick={() => setCancelOpen(true)}
                  >
                    Cancel Request
                  </Button>
                  <p className="mt-2 text-[12px] text-slate-500">
                    Only available before processing starts.
                  </p>
                </Card>
              )}
              {detail.status === "DRAFT_CREATED" &&
                detail.definitionId != null && (
                  <Card className="p-5">
                    <h2 className="font-display text-base font-bold text-navy">
                      Result
                    </h2>
                    <Button
                      variant="primary"
                      className="mt-3 w-full"
                      onClick={() =>
                        onOpenDefinition(detail.definitionId as number)
                      }
                    >
                      Open Test Definition
                    </Button>
                  </Card>
                )}
              <Card className="p-5">
                <h2 className="font-display text-base font-bold text-navy">
                  Timeline
                </h2>
                <ul className="mt-3 space-y-3 text-[13px]">
                  <li>
                    <StatusBadge status={detail.status} />
                    <p className="mt-1 text-slate-500">
                      {formatDate(detail.updatedAt)}
                    </p>
                  </li>
                  <li>
                    <p className="font-medium text-navy">Submitted</p>
                    <p className="text-slate-500">
                      {formatDate(detail.createdAt)}
                    </p>
                  </li>
                </ul>
              </Card>
            </div>
          </div>
        )}
        <Modal
          isOpen={cancelOpen}
          onClose={() => setCancelOpen(false)}
          title="Cancel Request?"
          description={`Are you sure you want to cancel "${detail?.title ?? ""}"? This action cannot be undone.`}
          variant="danger"
          footer={
            <>
              <Button variant="secondary" onClick={() => setCancelOpen(false)}>
                Keep Request
              </Button>
              <Button
                variant="danger"
                loading={cancelling}
                disabled={cancelling}
                onClick={confirmCancel}
              >
                Cancel Request
              </Button>
            </>
          }
        >
          <p className="text-[13px] text-slate-500">
            Cancellation is only available while the request is Submitted or In
            Review.
          </p>
        </Modal>
      </div>
    )
  }

  const from = total === 0 ? 0 : page * PER_PAGE + 1
  const to = Math.min(total, (page + 1) * PER_PAGE)

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400">
            Test Creation
          </p>
          <h1 className="mt-1 font-display text-2xl font-bold tracking-tight text-navy">
            Test Requests
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Track the status of your test creation requests.
          </p>
        </div>
        <Button variant="primary" onClick={onNewTest}>
          + New Test
        </Button>
      </div>

      <Card className="flex flex-col gap-2 p-4 sm:flex-row">
        <input
          aria-label="Search by title or ID"
          placeholder="Search by title or ID…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="h-10 flex-1 rounded-lg border border-slate-200 bg-surface px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400"
        />
        <select
          aria-label="Status filter"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className="h-10 rounded-lg border border-slate-200 bg-surface px-3 text-sm"
        >
          <option value="">All Statuses</option>
          {([
            "SUBMITTED",
            "IN_REVIEW",
            "IN_PROGRESS",
            "DRAFT_CREATED",
            "REJECTED",
            "CANCELLED",
            "FAILED",
          ] as CreationStatus[]).map((s) => (
            <option key={s} value={s}>
              {statusLabel(s)}
            </option>
          ))}
        </select>
        <select
          aria-label="Journey type filter"
          value={journey}
          onChange={(e) => setJourney(e.target.value)}
          className="h-10 rounded-lg border border-slate-200 bg-surface px-3 text-sm"
        >
          <option value="">All Journey Types</option>
          <option value="UI">UI</option>
          <option value="API">API</option>
          <option value="MIXED">Mixed</option>
        </select>
        <select
          aria-label="Creation method filter"
          value={method}
          onChange={(e) => setMethod(e.target.value)}
          className="h-10 rounded-lg border border-slate-200 bg-surface px-3 text-sm"
        >
          <option value="">All Methods</option>
          <option value="MANUAL_REQUEST">Manual Request</option>
          <option value="MANUAL_EDITOR">Manual Editor</option>
        </select>
      </Card>

      {loading && <TableSkeleton rows={6} />}
      {error && !loading && (
        <ErrorState
          title="Unable to load creation requests"
          description={error}
          onRetry={load}
        />
      )}
      {!loading && !error && filtered.length === 0 && (
        <EmptyState
          title={
            rows.length === 0
              ? "No creation requests yet"
              : "No matching requests"
          }
          description={
            rows.length === 0
              ? "Start by creating a new test."
              : "Try adjusting your filters."
          }
          action={
            rows.length === 0 ? (
              <Button variant="primary" onClick={onNewTest}>
                + New Test
              </Button>
            ) : undefined
          }
        />
      )}
      {!loading && !error && filtered.length > 0 && (
        <Card className="overflow-hidden">
          <ul className="divide-y divide-slate-100">
            {filtered.map((r) => (
              <li key={r.id}>
                <button
                  onClick={() => openDetail(r.id)}
                  className="flex w-full items-center gap-3 px-4 py-3 text-start transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-400"
                  aria-label={`Open creation request ${r.id}: ${r.title}, ${statusLabel(r.status)}`}
                >
                  <span className="w-16 shrink-0 font-mono text-[12px] text-slate-500">
                    #{r.id}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-sm font-medium text-navy">
                    {r.title}
                  </span>
                  <span className="hidden rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600 sm:inline">
                    {journeyLabel(r.journeyType)}
                  </span>
                  <span className="hidden rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600 md:inline">
                    {methodLabel(r.creationMethod)}
                  </span>
                  <StatusBadge status={r.status} />
                  {statusHelper(r.status) && (
                    <span className="hidden text-[11px] text-slate-400 lg:inline">
                      {statusHelper(r.status)}
                    </span>
                  )}
                  <span className="hidden text-[12px] text-slate-400 sm:inline">
                    {formatDate(r.createdAt)}
                  </span>
                  <span aria-hidden="true" className="text-slate-300">
                    ›
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </Card>
      )}
      {!loading && !error && total > 0 && (
        <div className="flex items-center justify-between text-[13px] text-slate-500">
          <p>
            Showing {from}–{to} of {total}
          </p>
          <div className="flex gap-2">
            <Button
              variant="secondary"
              disabled={page === 0}
              onClick={() => setPage((p) => Math.max(0, p - 1))}
            >
              ← Prev
            </Button>
            <Button
              variant="secondary"
              disabled={to >= total}
              onClick={() => setPage((p) => p + 1)}
            >
              Next →
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
