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
import { useAuth } from "../../lib/auth"
import {
  ApiError,
  apiAssignCreationRequest,
  apiCreateDraftFromRequest,
  apiListAdminCreationRequests,
  apiRejectCreationRequest,
  apiStartCreationRequest,
} from "../../lib/api"
import { starterDefinitionSource } from "../../lib/testDefinitionSchema"
import {
  ACTIVE_QUEUE_STATUSES,
  adminActionsFor,
  failureText,
  journeyLabel,
  mapCreationFailure,
  methodLabel,
  requiresActionCount,
  statusBadgeClass,
  statusLabel,
  validateRejectReason,
  type CreationStatus,
  type TestCreationRequest,
} from "../../lib/testCreation"

type QueueTab = "active" | "completed" | "all"

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

function ageOf(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime()
  if (!Number.isFinite(ms) || ms < 0) return "—"
  const hours = Math.floor(ms / 3600000)
  if (hours < 24) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}

export function AdminCreationQueue({
  onOpenDefinition,
  onUnauthorized,
}: {
  onOpenDefinition: (clientId: number, definitionId: number) => void
  onUnauthorized: () => void
}) {
  const toast = useToast()
  const { user } = useAuth()
  const [tab, setTab] = useState<QueueTab>("active")
  const [search, setSearch] = useState("")
  const [assignment, setAssignment] = useState("")
  const [status, setStatus] = useState("")
  const [journey, setJourney] = useState("")
  const [rows, setRows] = useState<TestCreationRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [action, setAction] =
    useState<"review" | "start" | "reject" | "draft" | null>(null)
  const [reason, setReason] = useState("")
  const [reasonError, setReasonError] = useState<string | null>(null)
  const [acting, setActing] = useState(false)
  const requestRef = useRef(0)

  const load = useCallback(async () => {
    const id = ++requestRef.current
    setLoading(true)
    setError(null)
    try {
      const res = await apiListAdminCreationRequests({ limit: 100, offset: 0 })
      if (requestRef.current !== id) return
      setRows(res.items as TestCreationRequest[])
    } catch (err) {
      if (requestRef.current !== id) return
      if (err instanceof ApiError && err.status === 401) {
        onUnauthorized()
        return
      }
      if (err instanceof ApiError && err.status === 403) {
        setError("You do not have permission to view the review queue.")
        return
      }
      setError(failureText(mapCreationFailure(err)))
    } finally {
      if (requestRef.current === id) setLoading(false)
    }
  }, [onUnauthorized])

  useEffect(() => {
    load()
  }, [load])

  const detail = rows.find((r) => r.id === selectedId) ?? null

  const visible = rows.filter((r) => {
    if (tab === "active" && !ACTIVE_QUEUE_STATUSES.includes(r.status))
      return false
    if (tab === "completed" && ACTIVE_QUEUE_STATUSES.includes(r.status))
      return false
    if (status && r.status !== status) return false
    if (journey && r.journeyType !== journey) return false
    if (assignment === "unassigned" && r.assignedTo != null) return false
    if (assignment === "assigned" && r.assignedTo == null) return false
    const q = search.trim().toLowerCase()
    if (q && !(r.title.toLowerCase().includes(q) || String(r.id).includes(q)))
      return false
    return true
  })

  const countBy = (s: CreationStatus) =>
    rows.filter((r) => r.status === s).length
  const actionCount = requiresActionCount(rows, {
    isAdmin: user?.role === "ADMIN",
    userId: user?.userId ?? null,
  })

  async function runAction() {
    if (!detail || !action || acting) return
    if (action === "reject") {
      const validation = validateRejectReason(reason)
      setReasonError(validation)
      if (validation) return
    }
    setActing(true)
    try {
      let updated: TestCreationRequest | null = null
      if (action === "review") {
        const assignee = user?.userId
        if (assignee == null) throw new Error("Admin identity is required.")
        updated = ((await apiAssignCreationRequest(
          detail.id,
          assignee,
        )) as TestCreationRequest)
      } else if (action === "start") {
        updated = ((await apiStartCreationRequest(
          detail.id,
        )) as TestCreationRequest)
      } else if (action === "reject") {
        updated = ((await apiRejectCreationRequest(
          detail.id,
          reason.trim(),
        )) as TestCreationRequest)
      } else {
        // The create-draft endpoint answers the lifecycle draft shape, not the
        // request row, so the queue is re-read instead of splicing the response.
        await apiCreateDraftFromRequest(detail.id, {
          name: detail.title.slice(0, 120),
          description: detail.description,
          flowId: detail.flowId,
          initialSourceJson: starterDefinitionSource(
            detail.title,
            detail.journeyType,
          ),
        })
        updated = null
      }
      if (updated) {
        setRows((prev) =>
          prev.map((r) =>
            r.id === detail.id ? updated as TestCreationRequest : r,
          ),
        )
      } else {
        await load()
      }
      setAction(null)
      setReason("")
      setReasonError(null)
      toast({ title: "Updated", variant: "success" })
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        onUnauthorized()
        return
      }
      const mapped = mapCreationFailure(err)
      toast({
        title: "Action failed",
        description: failureText(mapped),
        variant: "error",
      })
      if (mapped.kind === "conflict") load()
    } finally {
      setActing(false)
    }
  }

  if (detail) {
    const actions = adminActionsFor(detail.status)
    return (
      <div className="space-y-4">
        <Button
          variant="ghost"
          onClick={() => {
            setSelectedId(null)
            setAction(null)
            load()
          }}
        >
          ← Back to Review Queue
        </Button>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="font-mono text-[12px] text-slate-400">
              #{detail.id} · Client #{detail.clientId}
            </p>
            <h1 className="mt-1 font-display text-xl font-bold text-navy">
              {detail.title}
            </h1>
          </div>
          <StatusBadge status={detail.status} />
        </div>
        {actions.length > 0 && (
          <Card
            className="flex flex-wrap items-center gap-2 p-4"
            aria-label="Actions"
          >
            <span className="text-[13px] font-semibold text-slate-500">
              Actions:
            </span>
            {actions.includes("review") && (
              <Button variant="primary" onClick={() => setAction("review")}>
                Assign &amp; Review
              </Button>
            )}
            {actions.includes("start") && (
              <Button variant="secondary" onClick={() => setAction("start")}>
                Start Processing
              </Button>
            )}
            {actions.includes("reject") && (
              <Button variant="secondary" onClick={() => setAction("reject")}>
                Reject
              </Button>
            )}
            {actions.includes("draft") && (
              <Button variant="primary" onClick={() => setAction("draft")}>
                Create Draft
              </Button>
            )}
          </Card>
        )}
        <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
          <div className="space-y-4">
            <Card className="p-6">
              <h2 className="font-display text-base font-bold text-navy">
                Request Information
              </h2>
              <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
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
                  <dt className="text-slate-500">Client</dt>
                  <dd className="text-slate-700">#{detail.clientId}</dd>
                </div>
                <div>
                  <dt className="text-slate-500">Requested By</dt>
                  <dd className="text-slate-700">#{detail.requestedBy}</dd>
                </div>
                <div>
                  <dt className="text-slate-500">Assigned To</dt>
                  <dd className="text-slate-700">
                    {detail.assignedTo != null
                      ? `#${detail.assignedTo}`
                      : "Unassigned"}
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
                          onOpenDefinition(
                            detail.clientId,
                            detail.definitionId as number,
                          )
                        }
                        className="font-mono font-semibold text-brand-300 underline-offset-4 hover:underline"
                      >
                        #{detail.definitionId}
                      </button>
                    </dd>
                  </div>
                )}
                {detail.decisionReason && (
                  <div className="sm:col-span-2">
                    <dt className="text-slate-500">Decision</dt>
                    <dd className="text-slate-700">{detail.decisionReason}</dd>
                  </div>
                )}
              </dl>
            </Card>
            <Card className="space-y-4 p-6">
              <h2 className="font-display text-base font-bold text-navy">
                Request Content
              </h2>
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                  Description
                </p>
                <p className="mt-1 whitespace-pre-wrap text-sm text-slate-700">
                  {detail.description ?? "—"}
                </p>
              </div>
            </Card>
          </div>
          <Card className="h-fit p-5">
            <h2 className="font-display text-base font-bold text-navy">
              Status Timeline
            </h2>
            <ul className="mt-3 space-y-3 text-[13px]">
              <li>
                <StatusBadge status={detail.status} />
                <p className="mt-1 text-slate-500">{ageOf(detail.updatedAt)}</p>
              </li>
              <li>
                <p className="font-medium text-navy">Submitted</p>
                <p className="text-slate-500">{ageOf(detail.createdAt)}</p>
              </li>
            </ul>
            {detail.status === "DRAFT_CREATED" &&
              detail.definitionId != null && (
                <Button
                  variant="primary"
                  className="mt-4 w-full"
                  onClick={() =>
                    onOpenDefinition(
                      detail.clientId,
                      detail.definitionId as number,
                    )
                  }
                >
                  Open Test Definition
                </Button>
              )}
          </Card>
        </div>
        <Modal
          isOpen={action != null}
          onClose={() => {
            if (!acting) {
              setAction(null)
              setReasonError(null)
            }
          }}
          title={
            action === "review"
              ? "Move to Review"
              : action === "start"
                ? "Start Processing"
                : action === "reject"
                  ? "Reject Request"
                  : "Create Draft"
          }
          description={
            action === "review"
              ? "Assign this request to yourself and move it into review."
              : action === "start"
                ? "Mark this request as in progress. You are committing to implement the test."
                : action === "reject"
                  ? "Reject this creation request. A reason is required and will be visible to the client."
                  : "Create a Test Definition Draft from this request. This marks it as DRAFT_CREATED."
          }
          variant={
            action === "reject" || action === "start" ? "danger" : "default"
          }
          footer={
            <>
              <Button
                variant="secondary"
                disabled={acting}
                onClick={() => setAction(null)}
              >
                Cancel
              </Button>
              <Button
                variant={
                  action === "reject" || action === "start"
                    ? "danger"
                    : "primary"
                }
                loading={acting}
                disabled={acting}
                onClick={runAction}
              >
                {action === "review"
                  ? "Assign & Review"
                  : action === "start"
                    ? "Start Processing"
                    : action === "reject"
                      ? "Reject Request"
                      : "Create Draft"}
              </Button>
            </>
          }
        >
          <p className="rounded-lg bg-slate-50 px-3 py-2 font-mono text-[12px] text-slate-600">
            #{detail.id} · {detail.title}
          </p>
          {action === "reject" && (
            <div className="mt-4">
              <label
                htmlFor="admin-reject-reason"
                className="mb-1.5 block text-[13px] font-semibold text-navy"
              >
                Rejection Reason{" "}
                <span aria-hidden="true" className="text-error">
                  *
                </span>
              </label>
              <textarea
                id="admin-reject-reason"
                value={reason}
                rows={4}
                maxLength={2000}
                placeholder="Provide a clear, human-readable reason that will be shown to the client."
                onChange={(e) => setReason(e.target.value)}
                aria-invalid={Boolean(reasonError)}
                aria-describedby={
                  reasonError ? "admin-reject-reason-error" : undefined
                }
                className={`w-full rounded-lg border px-3 py-2.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 ${
                  reasonError ? "border-error" : "border-slate-200"
                }`}
              />
              {reasonError ? (
                <p
                  id="admin-reject-reason-error"
                  role="alert"
                  className="mt-1 text-[12px] font-medium text-error"
                >
                  {reasonError}
                </p>
              ) : (
                <p className="mt-1 text-[12px] text-slate-500">
                  Minimum 10 characters. This will be visible to the client.
                </p>
              )}
            </div>
          )}
        </Modal>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-amber-600">
          Admin Console
        </p>
        <h1 className="mt-1 font-display text-2xl font-bold tracking-tight text-navy">
          Creation Review Queue
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Review and process client test creation requests.
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {([
          ["SUBMITTED", "Awaiting Review"],
          ["IN_REVIEW", "In Review"],
          ["IN_PROGRESS", "In Progress"],
          ["DRAFT_CREATED", "Draft Created"],
        ] as Array<[CreationStatus, string]>).map(([s, label]) => (
          <Card key={s} className="p-4">
            <p className="text-[12px] font-semibold text-slate-500">{label}</p>
            <p className="mt-1 font-display text-2xl font-bold text-navy">
              {countBy(s)}
            </p>
            <div className="mt-2">
              <StatusBadge status={s} />
            </div>
          </Card>
        ))}
      </div>
      <div className="flex gap-2" role="tablist" aria-label="Queue">
        {(["active", "completed", "all"] as QueueTab[]).map((t) => (
          <button
            key={t}
            role="tab"
            aria-selected={tab === t}
            onClick={() => setTab(t)}
            className={`rounded-full px-4 py-2 text-[13px] font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 ${
              tab === t
                ? "bg-brand-900 text-white"
                : "bg-slate-100 text-slate-600 hover:bg-slate-200"
            }`}
          >
            {t === "active"
              ? "Active"
              : t === "completed"
                ? "Completed"
                : "All"}
          </button>
        ))}
      </div>
      {actionCount > 0 && (
        <p
          role="status"
          className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-[13px] font-medium text-amber-800"
        >
          {actionCount} request(s) require your action
        </p>
      )}
      <Card className="flex flex-col gap-2 p-4 sm:flex-row">
        <input
          aria-label="Search by title, ID, or client"
          placeholder="Search by title, ID, or client…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="h-10 flex-1 rounded-lg border border-slate-200 bg-surface px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400"
        />
        <select
          aria-label="Assignment filter"
          value={assignment}
          onChange={(e) => setAssignment(e.target.value)}
          className="h-10 rounded-lg border border-slate-200 bg-surface px-3 text-sm"
        >
          <option value="">All Assignments</option>
          <option value="unassigned">Unassigned</option>
          <option value="assigned">Assigned</option>
        </select>
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
      </Card>
      {loading && <TableSkeleton rows={6} />}
      {error && !loading && (
        <ErrorState
          title="Unable to load review queue"
          description={error}
          onRetry={load}
        />
      )}
      {!loading && !error && visible.length === 0 && (
        <EmptyState
          title={rows.length === 0 ? "Queue is empty" : "No matching requests"}
          description="No creation requests match the current filters."
        />
      )}
      {!loading && !error && visible.length > 0 && (
        <Card className="overflow-hidden">
          <ul className="divide-y divide-slate-100">
            {visible.map((r) => (
              <li key={r.id}>
                <button
                  onClick={() => setSelectedId(r.id)}
                  className="flex w-full items-center gap-3 px-4 py-3 text-start hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-400"
                  aria-label={`Review creation request ${r.id}: ${r.title}`}
                >
                  <span className="w-14 shrink-0 font-mono text-[12px] text-slate-500">
                    #{r.id}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-sm font-medium text-navy">
                    {r.title}
                  </span>
                  <span className="hidden text-[12px] text-slate-500 md:inline">
                    Client #{r.clientId}
                  </span>
                  <span className="hidden rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600 sm:inline">
                    {journeyLabel(r.journeyType)}
                  </span>
                  <StatusBadge status={r.status} />
                  <span className="hidden text-[12px] italic text-slate-400 lg:inline">
                    {r.assignedTo != null ? `#${r.assignedTo}` : "Unassigned"}
                  </span>
                  <span className="hidden text-[12px] text-slate-400 sm:inline">
                    {ageOf(r.createdAt)}
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
    </div>
  )
}
