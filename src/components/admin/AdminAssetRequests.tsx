import React, { useCallback, useEffect, useMemo, useState } from "react"
import { Button, Card, ErrorState, cx, useToast } from "../primitives"
import { langLocale, useLang } from "../../lib/i18n"
import { useAuth } from "../../lib/auth"
import { parseBackendTimestamp } from "../../lib/dashboardData"
import {
  ApiError,
  apiApproveAdminAssetRequest,
  apiGetAdminAssetRequest,
  apiImplementAdminAssetRequest,
  apiListAdminAssetRequests,
  apiRejectAdminAssetRequest,
  type AdminAssetRequestRow,
  type AssetRequestStatus,
  type AssetRequestType,
} from "../../lib/api"

/* ------------------------------------------------------------------ */
/* Admin Asset Requests — real Admin APIs only.                        */
/*                                                                     */
/* Source of truth: GET /dashboard-api/admin/requests (list) and       */
/* GET /dashboard-api/admin/requests/{id} (detail). Approve/reject/    */
/* implement POST to the lifecycle endpoints and always refetch — no   */
/* optimistic status writes, no local mock rows. The backend performs  */
/* the actual Flow/Test mutation on implement.                         */
/*                                                                     */
/* Filtering: the queue is fetched whole and filtered client-side so   */
/* the Figma instant-filter UX is preserved; the list endpoint has no  */
/* type/search params and the pending banner counts the full queue.    */
/* ------------------------------------------------------------------ */

/* ---- Closed-set backend tokens → i18n label keys ------------------- */
const TYPE_LABEL_KEY: Record<AssetRequestType, string> = {
  ADD_FLOW: "requests.type.addFlow",
  MODIFY_FLOW: "requests.type.modifyFlow",
  ADD_TEST: "requests.type.addTest",
  MODIFY_TEST: "requests.type.modifyTest",
  DELETE_FLOW: "requests.type.deleteFlow",
  DELETE_TEST: "requests.type.deleteTest",
}

const STATUS_LABEL_KEY: Record<AssetRequestStatus, string> = {
  PENDING: "requests.status.pending",
  APPROVED: "requests.status.approved",
  REJECTED: "requests.status.rejected",
  IMPLEMENTED: "requests.status.implemented",
  CANCELLED: "requests.status.cancelled",
}

const STATUS_STYLES: Record<AssetRequestStatus, { bg: string; text: string; ring: string; dot: string }> = {
  PENDING: { bg: "bg-amber-50", text: "text-amber-700", ring: "ring-amber-600/10", dot: "bg-amber-400" },
  APPROVED: { bg: "bg-emerald-50", text: "text-emerald-700", ring: "ring-emerald-600/10", dot: "bg-success" },
  REJECTED: { bg: "bg-red-50", text: "text-red-700", ring: "ring-red-600/10", dot: "bg-error" },
  IMPLEMENTED: { bg: "bg-brand-50", text: "text-brand-300", ring: "ring-brand-600/10", dot: "bg-brand-600" },
  CANCELLED: { bg: "bg-slate-50", text: "text-slate-500", ring: "ring-slate-200", dot: "bg-slate-400" },
}

const STATUS_FILTERS: ("ALL" | AssetRequestStatus)[] = [
  "ALL",
  "PENDING",
  "APPROVED",
  "REJECTED",
  "IMPLEMENTED",
  "CANCELLED",
]

const TYPE_FILTER_OPTIONS: { value: AssetRequestType | "ALL" }[] = [
  { value: "ALL" },
  { value: "ADD_FLOW" },
  { value: "MODIFY_FLOW" },
  { value: "ADD_TEST" },
  { value: "MODIFY_TEST" },
  { value: "DELETE_FLOW" },
  { value: "DELETE_TEST" },
]

/* ---- View model (mirrors the client Requests mapper) ---------------- */
type AdminRequestTest = {
  testName: string
  description: string
  expectedBehavior: string
  steps: string[]
}

type AdminRequestView = {
  id: number
  clientId: number | null
  clientName: string | null
  type: AssetRequestType
  status: AssetRequestStatus
  requestedByEmail: string | null
  reviewedBy: number | null
  flowName: string | null
  flowId: number | null
  testMethod: string | null
  description: string | null
  expectedBehavior: string | null
  steps: string[]
  reason: string | null
  adminNotes: string | null
  tests: AdminRequestTest[]
  createdAt: Date | null
  updatedAt: Date | null
  reviewedAt: Date | null
  implementedAt: Date | null
}

function str(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v : null
}

function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null
}

function strList(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((s): s is string => typeof s === "string" && s.trim() !== "") : []
}

function toAdminView(row: AdminAssetRequestRow, clientNameFallback?: string | null): AdminRequestView {
  const p = (row.payload ?? {}) as Record<string, unknown>
  const testsRaw = Array.isArray(p.tests) ? p.tests : []
  const tests = testsRaw
    .filter((t): t is Record<string, unknown> => typeof t === "object" && t !== null)
    .map((t) => ({
      testName: str(t.testName) ?? "",
      description: str(t.description) ?? "",
      expectedBehavior: str(t.expectedBehavior) ?? "",
      steps: strList(t.steps),
    }))
  return {
    id: row.id,
    clientId: num(row.client_id),
    clientName: str(row.client_name) ?? str(clientNameFallback) ?? null,
    type: row.request_type,
    status: row.status,
    requestedByEmail: str(row.requested_by_email),
    reviewedBy: num(row.reviewed_by),
    flowName: str(p.flowName),
    flowId: num(p.flowId),
    testMethod: str(p.testMethod) ?? str(p.testName),
    description: str(p.description),
    expectedBehavior: str(p.expectedBehavior),
    steps: strList(p.steps),
    reason: str(p.reason) ?? str(p.newFlowName) ?? str(p.newTestName),
    adminNotes: str(row.admin_notes),
    tests,
    createdAt: parseBackendTimestamp(row.created_at),
    updatedAt: parseBackendTimestamp(row.updated_at),
    reviewedAt: parseBackendTimestamp(row.reviewed_at),
    implementedAt: parseBackendTimestamp(row.implemented_at),
  }
}

/** "Login" for ADD_FLOW, "#12" when only the flow id is known. */
function flowDisplay(r: AdminRequestView): string {
  return r.flowName ?? (r.flowId != null ? `#${r.flowId}` : "—")
}

function formatStamp(date: Date | null): string {
  if (!date) return "—"
  return date.toLocaleDateString(langLocale(), { month: "short", day: "numeric", year: "numeric" })
}

/* ---- Shared presentation pieces ------------------------------------- */
function StatusBadge({ status }: { status: AssetRequestStatus }) {
  const { t } = useLang()
  const s = STATUS_STYLES[status]
  return (
    <span className={cx("inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1 ring-inset", s.bg, s.text, s.ring)}>
      <span className={cx("size-1.5 rounded-full", s.dot)} />
      {t(STATUS_LABEL_KEY[status])}
    </span>
  )
}

function TypeChip({ type }: { type: AssetRequestType }) {
  const { t } = useLang()
  const isDelete = type.startsWith("DELETE")
  const isModify = type.startsWith("MODIFY")
  return (
    <span className={cx("inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide", isDelete ? "bg-red-50 text-red-600" : isModify ? "bg-amber-50 text-amber-700" : "bg-brand-50 text-brand-300")}>
      {t(TYPE_LABEL_KEY[type])}
    </span>
  )
}

/* ------------------------------------------------------------------ */
/* Modals                                                              */
/* ------------------------------------------------------------------ */
function ConfirmModal({
  title,
  description,
  confirmLabel,
  confirmVariant = "primary",
  confirmLoading = false,
  onConfirm,
  onCancel,
  children,
}: {
  title: string
  description?: string
  confirmLabel: string
  confirmVariant?: "primary" | "danger"
  confirmLoading?: boolean
  onConfirm: () => void
  onCancel: () => void
  children?: React.ReactNode
}) {
  const { t } = useLang()
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label={title}>
      <div className="absolute inset-0 bg-[#020a16]/70 backdrop-blur-sm" onClick={onCancel} />
      <div className="relative w-full max-w-md rounded-2xl bg-surface p-6 shadow-2xl">
        <h2 className="font-display text-lg font-bold text-navy">{title}</h2>
        {description && <p className="mt-1.5 text-[13px] text-slate-500">{description}</p>}
        {children}
        <div className="mt-6 flex justify-end gap-3">
          <Button variant="ghost" size="sm" onClick={onCancel} disabled={confirmLoading}>{t("common.cancel")}</Button>
          <button
            onClick={onConfirm}
            disabled={confirmLoading}
            className={cx("inline-flex items-center gap-2 rounded-lg px-4 py-2 text-[13px] font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 disabled:cursor-not-allowed disabled:opacity-60", confirmVariant === "danger" ? "bg-error text-white hover:bg-red-700" : "bg-brand-600 text-white hover:bg-brand-700")}
          >
            {confirmLoading && (
              <svg className="size-3.5 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
              </svg>
            )}
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}

type ActionKind = "approve" | "reject" | "implement"

/* ------------------------------------------------------------------ */
/* Detail view                                                         */
/* ------------------------------------------------------------------ */
function RequestDetail({
  request,
  onBack,
  onAction,
  actionLoading,
}: {
  request: AdminRequestView
  onBack: () => void
  onAction: (kind: ActionKind, adminNotes?: string) => Promise<void>
  actionLoading: ActionKind | null
}) {
  const { t } = useLang()
  const [modal, setModal] = useState<ModalState>(null)
  const [rejectReason, setRejectReason] = useState("")

  const rejectModal = modal?.type === "reject" ? modal : null

  return (
    <div className="space-y-6">
      {modal?.type === "approve" && (
        <ConfirmModal
          title={t("admin.asset.approveTitle")}
          confirmLabel={t("admin.asset.confirmApprove")}
          confirmLoading={actionLoading === "approve"}
          onConfirm={() => { void onAction("approve"); setModal(null) }}
          onCancel={() => setModal(null)}
        />
      )}
      {rejectModal && (
        <ConfirmModal
          title={t("admin.asset.rejectTitle")}
          confirmLabel={t("admin.requests.reject")}
          confirmVariant="danger"
          confirmLoading={actionLoading === "reject"}
          onConfirm={() => { if (rejectReason.trim()) { void onAction("reject", rejectReason.trim()); setModal(null) } }}
          onCancel={() => { setModal(null); setRejectReason("") }}
        >
          <div className="mt-4">
            <label htmlFor="asset-reject-reason" className="mb-1.5 block text-[12px] font-semibold uppercase tracking-wide text-slate-500">
              {t("admin.requests.rejectionReason")}<span className="ms-0.5 text-error">*</span>
            </label>
            <textarea
              id="asset-reject-reason"
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              rows={3}
              placeholder={t("admin.requests.rejectionPlaceholder")}
              className="block w-full resize-none rounded-lg border border-slate-200 bg-elevated px-3.5 py-2.5 text-[13px] text-slate-700 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-400"
            />
          </div>
        </ConfirmModal>
      )}
      {modal?.type === "implement" && (
        <ConfirmModal
          title={t("admin.asset.implementTitle")}
          description={t("admin.asset.implementDesc")}
          confirmLabel={t("admin.asset.confirmImplement")}
          confirmLoading={actionLoading === "implement"}
          onConfirm={() => { void onAction("implement"); setModal(null) }}
          onCancel={() => setModal(null)}
        />
      )}

      <button onClick={onBack} className="inline-flex items-center gap-1.5 text-[13px] font-medium text-slate-400 transition-colors hover:text-brand-300">
        <svg className="size-4 rtl:-scale-x-100" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true"><path fillRule="evenodd" d="M12.7 15.3a1 1 0 01-1.4 0l-4.5-4.6a1 1 0 010-1.4l4.5-4.6a1 1 0 111.4 1.4L8.9 10l3.8 3.9a1 1 0 010 1.4z" /></svg>
        {t("admin.asset.back")}
      </button>

      <Card className="p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <TypeChip type={request.type} />
              <StatusBadge status={request.status} />
            </div>
            <h1 className="mt-2 font-display text-xl font-bold tracking-tight text-navy">
              {t(TYPE_LABEL_KEY[request.type])} — <span dir="ltr" className="inline-block">{flowDisplay(request)}{request.testMethod ? ` · ${request.testMethod}` : ""}</span>
            </h1>
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-slate-400">
              <span dir="ltr" className="font-mono text-slate-500">#{request.id}</span>
              {request.clientName && (
                <>
                  <span aria-hidden="true">·</span>
                  <span className="font-medium text-slate-600">{request.clientName}</span>
                </>
              )}
              {request.requestedByEmail && (
                <>
                  <span aria-hidden="true">·</span>
                  <span dir="ltr">{request.requestedByEmail}</span>
                </>
              )}
              <span aria-hidden="true">·</span>
              <span>{t("admin.requests.submittedAt", { time: formatStamp(request.createdAt) })}</span>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {request.status === "PENDING" && (
              <>
                <Button variant="primary" size="sm" loading={actionLoading === "approve"} disabled={actionLoading !== null} onClick={() => setModal({ type: "approve" })}>{t("admin.asset.confirmApprove")}</Button>
                <Button variant="ghost" size="sm" disabled={actionLoading !== null} onClick={() => setModal({ type: "reject", reason: "" })}>{t("admin.asset.rejectShort")}</Button>
              </>
            )}
            {request.status === "APPROVED" && (
              <Button variant="primary" size="sm" loading={actionLoading === "implement"} disabled={actionLoading !== null} onClick={() => setModal({ type: "implement" })}>{t("admin.asset.markImplemented")}</Button>
            )}
          </div>
        </div>
      </Card>

      <div className="grid gap-6 lg:grid-cols-[1fr_280px]">
        <div className="space-y-5">
          {/* Target */}
          <Card className="p-5">
            <h2 className="pb-3 font-display text-sm font-bold text-navy">{t("admin.asset.target")}</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{t("admin.asset.flow")}</p>
                <p dir="ltr" className="mt-1 text-start text-[13px] font-medium text-slate-700">{flowDisplay(request)}</p>
              </div>
              {request.testMethod && (
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{t("admin.asset.test")}</p>
                  <p dir="ltr" className="mt-1 text-start font-mono text-[13px] font-medium text-slate-700">{request.testMethod}</p>
                </div>
              )}
              {request.clientName && (
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{t("run.client")}</p>
                  <p className="mt-1 text-[13px] font-medium text-slate-700">{request.clientName}</p>
                </div>
              )}
              {request.requestedByEmail && (
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{t("admin.asset.requestedBy")}</p>
                  <p dir="ltr" className="mt-1 text-start text-[13px] font-medium text-slate-700">{request.requestedByEmail}</p>
                </div>
              )}
            </div>
          </Card>

          {/* Description */}
          {request.description && (
            <Card className="p-5">
              <h2 className="pb-3 font-display text-sm font-bold text-navy">{t("admin.asset.description")}</h2>
              <p className="text-[13px] leading-relaxed text-slate-600">{request.description}</p>
            </Card>
          )}

          {/* Expected behavior */}
          {request.expectedBehavior && (
            <Card className="p-5">
              <h2 className="pb-3 font-display text-sm font-bold text-navy">{t("requests.detail.expectedBehavior")}</h2>
              <p className="text-[13px] leading-relaxed text-slate-600">{request.expectedBehavior}</p>
            </Card>
          )}

          {/* Tests — multi-test ADD_FLOW composition (Flow → Tests → Steps) */}
          {request.tests.length > 0 && (
            <Card className="p-5">
              <h2 className="pb-3 font-display text-sm font-bold text-navy">{t("admin.asset.tests")}</h2>
              <div className="space-y-5">
                {request.tests.map((test, ti) => (
                  <div key={ti} className={cx(ti > 0 && "border-t border-slate-100 pt-5")}>
                    <div className="mb-3 flex items-center gap-2">
                      <span className="flex size-5 shrink-0 items-center justify-center rounded-md bg-brand-50 font-mono text-[10px] font-bold text-brand-400">{ti + 1}</span>
                      <p dir="ltr" className="text-start font-mono text-[13px] font-semibold text-navy">{test.testName || "—"}</p>
                    </div>
                    {test.description && (
                      <p className="mb-2 text-[13px] leading-relaxed text-slate-600">{test.description}</p>
                    )}
                    {test.expectedBehavior && (
                      <p className="mb-2 text-[12px] leading-relaxed text-slate-500">
                        <span className="font-semibold text-slate-400">{t("requests.detail.expectedBehavior")}: </span>
                        {test.expectedBehavior}
                      </p>
                    )}
                    {test.steps.length > 0 && (
                      <ol className="space-y-2.5 ps-1">
                        {test.steps.map((step, i) => (
                          <li key={i} className="flex gap-3">
                            <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-brand-50 font-mono text-[10px] font-bold text-brand-400">{i + 1}</span>
                            <p className="text-[13px] leading-relaxed text-slate-600">{step}</p>
                          </li>
                        ))}
                      </ol>
                    )}
                  </div>
                ))}
              </div>
            </Card>
          )}

          {/* Steps (single-asset payloads) */}
          {request.tests.length === 0 && request.steps.length > 0 && (
            <Card className="p-5">
              <h2 className="pb-3 font-display text-sm font-bold text-navy">{t("admin.asset.steps")}</h2>
              <ol className="space-y-2.5">
                {request.steps.map((step, i) => (
                  <li key={i} className="flex gap-3">
                    <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-brand-50 font-mono text-[10px] font-bold text-brand-400">{i + 1}</span>
                    <p className="text-[13px] leading-relaxed text-slate-600">{step}</p>
                  </li>
                ))}
              </ol>
            </Card>
          )}

          {/* Reason */}
          {request.reason && (
            <Card className="p-5">
              <h2 className="pb-3 font-display text-sm font-bold text-navy">{t("admin.asset.reason")}</h2>
              <p className="text-[13px] leading-relaxed text-slate-600">{request.reason}</p>
            </Card>
          )}

          {/* Admin notes (backend admin_notes — rejection reason or approval note) */}
          {request.adminNotes && (
            <Card className={cx("p-5", request.status === "REJECTED" && "border-red-200")}>
              <div className="flex items-center gap-2 pb-3">
                {request.status === "REJECTED" && (
                  <svg className="size-4 text-error" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                    <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" />
                  </svg>
                )}
                <h2 className={cx("font-display text-sm font-bold", request.status === "REJECTED" ? "text-red-700" : "text-navy")}>
                  {request.status === "REJECTED" ? t("admin.requests.rejectionReason") : t("requests.detail.adminNotes")}
                </h2>
              </div>
              <p className="text-[13px] leading-relaxed text-slate-600">{request.adminNotes}</p>
            </Card>
          )}
        </div>

        {/* Sidebar */}
        <div className="space-y-5">
          <Card className="p-5">
            <h2 className="pb-3 font-display text-sm font-bold text-navy">{t("admin.asset.info")}</h2>
            <div className="space-y-3">
              {([
                { label: t("admin.requests.requestId"), value: `#${request.id}`, mono: true, show: true },
                { label: t("requests.col.type"), value: t(TYPE_LABEL_KEY[request.type]), mono: false, show: true },
                ...(request.clientName ? [{ label: t("run.client"), value: request.clientName, mono: false, show: true }] : []),
                { label: t("admin.submitted"), value: formatStamp(request.createdAt), mono: false, show: true },
                { label: t("admin.asset.lastUpdated"), value: formatStamp(request.updatedAt), mono: false, show: true },
                ...(request.reviewedBy != null ? [{ label: t("admin.asset.reviewedBy"), value: `#${request.reviewedBy}`, mono: true, show: true }] : []),
                ...(request.reviewedAt ? [{ label: t("admin.asset.reviewedAt"), value: formatStamp(request.reviewedAt), mono: false, show: true }] : []),
                ...(request.implementedAt ? [{ label: t("requests.detail.implementedLabel"), value: formatStamp(request.implementedAt), mono: false, show: true }] : []),
              ]).map(({ label, value, mono }) => (
                <div key={label}>
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{label}</p>
                  <p className={cx("mt-0.5 text-[13px] font-medium text-slate-700", mono && "font-mono")}>{value}</p>
                </div>
              ))}
            </div>
          </Card>

          {/* Quick actions in sidebar too */}
          {request.status === "PENDING" && (
            <Card className="p-5">
              <h2 className="pb-3 font-display text-sm font-bold text-navy">{t("table.actions")}</h2>
              <div className="space-y-2">
                <Button variant="primary" size="sm" className="w-full" loading={actionLoading === "approve"} disabled={actionLoading !== null} onClick={() => setModal({ type: "approve" })}>{t("admin.requests.approve")}</Button>
                <Button variant="ghost" size="sm" className="w-full" disabled={actionLoading !== null} onClick={() => setModal({ type: "reject", reason: "" })}>{t("admin.requests.reject")}</Button>
              </div>
            </Card>
          )}
          {request.status === "APPROVED" && (
            <Card className="p-5">
              <h2 className="pb-3 font-display text-sm font-bold text-navy">{t("table.actions")}</h2>
              <Button variant="primary" size="sm" className="w-full" loading={actionLoading === "implement"} disabled={actionLoading !== null} onClick={() => setModal({ type: "implement" })}>{t("admin.asset.markImplemented")}</Button>
            </Card>
          )}
        </div>
      </div>
    </div>
  )
}

type ModalState = { type: "approve" } | { type: "reject"; reason: string } | { type: "implement" } | null

/* ------------------------------------------------------------------ */
/* Main page                                                           */
/* ------------------------------------------------------------------ */
const inputCls = "block rounded-lg border border-slate-200 bg-elevated px-3 py-2 text-[13px] text-slate-700 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-400"

export function AdminAssetRequests({ onRequestsChanged }: { onRequestsChanged?: () => void } = {}) {
  const { t } = useLang()
  const toast = useToast()
  const { logout } = useAuth()

  /* rows === null → initial load; otherwise the fetched queue (real API). */
  const [rows, setRows] = useState<AdminRequestView[] | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)

  const [statusFilter, setStatus] = useState<"ALL" | AssetRequestStatus>("ALL")
  const [typeFilter, setType] = useState<AssetRequestType | "ALL">("ALL")
  const [clientFilter, setClient] = useState<string>("ALL")
  const [search, setSearch] = useState("")

  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [detail, setDetail] = useState<AdminRequestView | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [detailError, setDetailError] = useState<string | null>(null)

  const [actionLoading, setActionLoading] = useState<ActionKind | null>(null)
  /** Id of the row receiving a quick list action (per-row loading, §12). */
  const [rowActionId, setRowActionId] = useState<number | null>(null)

  /* ---- List loading ------------------------------------------------ */
  const loadList = useCallback(async (opts: { silent?: boolean } = {}) => {
    if (!opts.silent) {
      setRows(null)
      setLoadError(null)
    }
    try {
      const data = await apiListAdminAssetRequests()
      const views = data.map((row) => toAdminView(row))
      setRows(views)
      if (!opts.silent) onRequestsChanged?.()
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        logout()
        return
      }
      if (!opts.silent) setLoadError(err instanceof Error ? err.message : t("common.loadFailed"))
    }
  }, [logout, onRequestsChanged, t])

  useEffect(() => {
    void loadList()
  }, [loadList, reloadKey])

  /* ---- Detail loading ----------------------------------------------- */
  const openRequest = useCallback(async (id: number, clientNameFallback: string | null) => {
    setSelectedId(id)
    setDetailError(null)
    setDetailLoading(true)
    try {
      const row = await apiGetAdminAssetRequest(id)
      setDetail(toAdminView(row, clientNameFallback))
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        logout()
        return
      }
      setDetailError(err instanceof Error ? err.message : t("common.loadFailed"))
    } finally {
      setDetailLoading(false)
    }
  }, [logout, t])

  const refreshDetail = useCallback(async (id: number) => {
    try {
      const row = await apiGetAdminAssetRequest(id)
      setDetail(toAdminView(row, detail?.clientName ?? null))
      return true
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        logout()
        return false
      }
      return false
    }
  }, [detail?.clientName, logout])

  /* ---- Lifecycle actions -------------------------------------------- */
  const runAction = useCallback(async (id: number, kind: ActionKind, adminNotes?: string, opts: { fromRow?: boolean } = {}) => {
    if (actionLoading || rowActionId != null) return
    if (opts.fromRow) setRowActionId(id)
    else setActionLoading(kind)
    try {
      if (kind === "approve") await apiApproveAdminAssetRequest(id)
      else if (kind === "reject") await apiRejectAdminAssetRequest(id, adminNotes ?? "")
      else await apiImplementAdminAssetRequest(id)

      toast({
        title: t(kind === "approve" ? "admin.asset.approvedTitle" : kind === "reject" ? "admin.asset.rejectedTitle" : "admin.asset.implementedTitle"),
        description: t("admin.asset.actionSuccessDesc", { id }),
        variant: "success",
      })
      await loadList({ silent: true })
      if (selectedId === id) await refreshDetail(id)
      onRequestsChanged?.()
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        logout()
        return
      }
      if (err instanceof ApiError && err.status === 409) {
        // Another admin won the race — never fake success; resync to the backend state.
        toast({
          title: t("errors.requestStateChanged"),
          description: t("errors.requestStateChangedDesc"),
          variant: "warning",
        })
        await loadList({ silent: true })
        if (selectedId === id) await refreshDetail(id)
        onRequestsChanged?.()
        return
      }
      toast({
        title: t(kind === "approve" ? "admin.asset.approveFailedTitle" : kind === "reject" ? "admin.asset.rejectFailedTitle" : "admin.asset.implementFailedTitle"),
        description: err instanceof Error ? err.message : t("common.somethingWentWrong"),
        variant: "error",
      })
    } finally {
      setActionLoading(null)
      setRowActionId(null)
    }
  }, [actionLoading, loadList, logout, onRequestsChanged, refreshDetail, rowActionId, selectedId, t, toast])

  /* ---- Derived state ------------------------------------------------- */
  const clients = useMemo(() => {
    if (!rows) return []
    const map = new Map<string, string>()
    for (const r of rows) {
      const key = r.clientId != null ? String(r.clientId) : r.clientName ?? ""
      if (!key) continue
      if (!map.has(key)) map.set(key, r.clientName ?? `#${r.clientId}`)
    }
    return Array.from(map.entries()).sort((a, b) => a[1].localeCompare(b[1]))
  }, [rows])

  const pendingCount = useMemo(() => rows?.filter((r) => r.status === "PENDING").length ?? 0, [rows])

  const filtered = useMemo(() => {
    if (!rows) return []
    return rows.filter((r) => {
      if (statusFilter !== "ALL" && r.status !== statusFilter) return false
      if (typeFilter !== "ALL" && r.type !== typeFilter) return false
      if (clientFilter !== "ALL" && String(r.clientId ?? "") !== clientFilter) return false
      if (search.trim()) {
        const q = search.toLowerCase()
        const target = `${r.flowName ?? ""} ${r.testMethod ?? ""}`.toLowerCase()
        if (![`#${r.id}`, r.clientName ?? "", r.requestedByEmail ?? "", target].some((v) => v.toLowerCase().includes(q))) return false
      }
      return true
    })
  }, [rows, statusFilter, typeFilter, clientFilter, search])

  /* ---- Detail screen routing ----------------------------------------- */
  if (selectedId != null) {
    return (
      <div className="space-y-6">
        {detailLoading && !detail ? (
          <div className="flex flex-col items-center justify-center gap-3 px-6 py-20 text-[13px] text-slate-400">
            {t("common.loading")}
          </div>
        ) : detailError && !detail ? (
          <ErrorState title={t("common.loadFailed")} description={detailError} onRetry={() => void openRequest(selectedId, null)} />
        ) : detail ? (
          <RequestDetail
            request={detail}
            onBack={() => {
              setSelectedId(null)
              setDetail(null)
              setDetailError(null)
              // Re-entering the queue refetches so requests submitted while
              // reviewing appear without leaving the page.
              void loadList({ silent: true })
            }}
            onAction={(kind, adminNotes) => runAction(detail.id, kind, adminNotes)}
            actionLoading={actionLoading}
          />
        ) : null}
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-brand-300">{t("nav.adminConsole")}</p>
        <h1 className="mt-1 font-display text-2xl font-bold tracking-tight text-navy">{t("admin.asset.title")}</h1>
        <p className="mt-1 text-[13px] text-slate-500">{t("admin.asset.subtitle")}</p>
      </div>

      {/* Pending summary — real count from the fetched queue */}
      {pendingCount > 0 && (
        <div className="flex items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
          <svg className="size-4 shrink-0 text-warning" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 002 0V6zm-1 7a1 1 0 100 2 1 1 0 000-2z" />
          </svg>
          <p className="text-[13px] font-medium text-amber-800" role="status">
            {pendingCount === 1 ? t("admin.asset.pendingBannerOne") : t("admin.asset.pendingBanner", { count: pendingCount })}
          </p>
        </div>
      )}

      {/* Filters + search */}
      <div className="flex flex-wrap items-start gap-3">
        {/* Status tabs */}
        <div className="inline-flex flex-wrap items-center gap-1 rounded-lg bg-slate-100 p-1" role="tablist" aria-label={t("table.status")}>
          {STATUS_FILTERS.map((f) => (
            <button
              key={f}
              role="tab"
              aria-selected={statusFilter === f}
              onClick={() => setStatus(f)}
              className={cx("rounded-md px-3 py-1.5 text-[13px] font-medium transition-all", statusFilter === f ? "bg-surface text-brand-300 shadow-sm" : "text-slate-500 hover:text-slate-700")}
            >
              {f === "ALL" ? t("common.all") : t(STATUS_LABEL_KEY[f])}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2 sm:ms-auto">
          {/* Type filter */}
          <select value={typeFilter} onChange={(e) => setType(e.target.value as AssetRequestType | "ALL")} className={inputCls} aria-label={t("requests.col.type")}>
            {TYPE_FILTER_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.value === "ALL" ? t("admin.asset.allTypes") : t(TYPE_LABEL_KEY[o.value])}</option>
            ))}
          </select>

          {/* Client filter */}
          <select value={clientFilter} onChange={(e) => setClient(e.target.value)} className={inputCls} aria-label={t("run.client")}>
            <option value="ALL">{t("admin.asset.allClients")}</option>
            {clients.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>

          {/* Search */}
          <div className="relative">
            <svg className="absolute start-3 top-1/2 size-3.5 -translate-y-1/2 text-slate-400" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
              <path fillRule="evenodd" d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z" />
            </svg>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t("admin.asset.searchPlaceholder")}
              aria-label={t("admin.asset.searchPlaceholder")}
              className={cx(inputCls, "w-52 ps-8")}
            />
          </div>
        </div>
      </div>

      {/* Table */}
      {rows === null && !loadError ? (
        <Card className="flex items-center justify-center px-6 py-16">
          <p className="text-[13px] text-slate-400">{t("common.loading")}</p>
        </Card>
      ) : loadError && rows === null ? (
        <ErrorState title={t("common.loadFailed")} description={loadError} onRetry={() => setReloadKey((k) => k + 1)} />
      ) : filtered.length === 0 ? (
        <Card className="flex flex-col items-center justify-center px-6 py-16 text-center">
          <div className="flex size-14 items-center justify-center rounded-xl bg-slate-100 text-slate-400">
            <svg className="size-7" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
          </div>
          <p className="mt-4 font-display text-base font-bold text-navy">{t("admin.asset.noMatch")}</p>
          <Button variant="secondary" size="sm" className="mt-4" onClick={() => { setStatus("ALL"); setType("ALL"); setClient("ALL"); setSearch("") }}>{t("admin.asset.resetFilters")}</Button>
        </Card>
      ) : (
        <>
          {/* Desktop table */}
          <Card className="hidden overflow-hidden lg:block">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-100 text-start text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                  <th scope="col" className="px-4 py-3">{t("admin.asset.thRequest")}</th>
                  <th scope="col" className="px-4 py-3">{t("requests.col.type")}</th>
                  <th scope="col" className="px-4 py-3">{t("run.client")}</th>
                  <th scope="col" className="hidden px-4 py-3 xl:table-cell">{t("admin.asset.target")}</th>
                  <th scope="col" className="hidden px-4 py-3 xl:table-cell">{t("admin.asset.requestedBy")}</th>
                  <th scope="col" className="px-4 py-3">{t("table.status")}</th>
                  <th scope="col" className="px-4 py-3">{t("admin.submitted")}</th>
                  <th scope="col" className="px-4 py-3 text-end">{t("table.actions")}</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => (
                  <tr key={r.id} className="group border-t border-slate-100 transition-colors hover:bg-slate-50/60">
                    <td className="px-4 py-3.5">
                      <button onClick={() => void openRequest(r.id, r.clientName)} className="whitespace-nowrap font-mono text-[12px] font-semibold text-brand-300 group-hover:text-brand-400" dir="ltr">
                        #{r.id}
                      </button>
                    </td>
                    <td className="px-4 py-3.5"><TypeChip type={r.type} /></td>
                    <td className="px-4 py-3.5 text-[13px] font-medium text-slate-700">{r.clientName ?? (r.clientId != null ? `#${r.clientId}` : "—")}</td>
                    <td className="hidden px-4 py-3.5 xl:table-cell">
                      <span dir="ltr" className="inline-block text-[13px] text-slate-600">
                        {flowDisplay(r)}{r.testMethod ? <span className="font-mono text-slate-400"> · {r.testMethod}</span> : r.tests.length > 0 ? <span className="text-slate-400"> · {t("admin.asset.testCount", { n: r.tests.length })}</span> : null}
                      </span>
                    </td>
                    <td className="hidden max-w-[160px] px-4 py-3.5 xl:table-cell">
                      <span dir="ltr" className="line-clamp-1 block text-[12px] text-slate-400">{r.requestedByEmail ?? "—"}</span>
                    </td>
                    <td className="px-4 py-3.5"><StatusBadge status={r.status} /></td>
                    <td className="px-4 py-3.5 text-[13px] text-slate-400">{formatStamp(r.createdAt)}</td>
                    <td className="px-4 py-3.5 text-end">
                      <div className="inline-flex items-center gap-2">
                        {r.status === "PENDING" && (
                          <>
                            <button
                              disabled={rowActionId !== null || actionLoading !== null}
                              onClick={() => void runAction(r.id, "approve", undefined, { fromRow: true })}
                              className="inline-flex items-center rounded-md bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-700 ring-1 ring-inset ring-emerald-600/10 transition-colors hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-60"
                            >
                              {rowActionId === r.id ? t("common.loading") : t("admin.asset.approveShort")}
                            </button>
                            <button onClick={() => void openRequest(r.id, r.clientName)} className="inline-flex items-center rounded-md bg-slate-50 px-2.5 py-1 text-[11px] font-semibold text-slate-600 ring-1 ring-inset ring-slate-300/50 hover:bg-slate-100">{t("admin.requests.review")}</button>
                          </>
                        )}
                        {r.status !== "PENDING" && (
                          <Button variant="ghost" size="sm" onClick={() => void openRequest(r.id, r.clientName)}>{t("common.view")}</Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>

          {/* Mobile cards */}
          <div className="space-y-4 lg:hidden">
            {filtered.map((r) => (
              <Card key={r.id} className="p-4" interactive onClick={() => void openRequest(r.id, r.clientName)}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p dir="ltr" className="text-start font-mono text-[11px] text-brand-300">#{r.id}</p>
                    <p className="mt-0.5 text-[14px] font-semibold text-navy">{r.clientName ?? (r.clientId != null ? `#${r.clientId}` : "—")}</p>
                    <p dir="ltr" className="text-start text-[12px] text-slate-400">
                      {flowDisplay(r)}{r.testMethod ? ` · ${r.testMethod}` : r.tests.length > 0 ? ` · ${t("admin.asset.testCount", { n: r.tests.length })}` : ""}
                    </p>
                  </div>
                  <StatusBadge status={r.status} />
                </div>
                <div className="mt-2"><TypeChip type={r.type} /></div>
                <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-3">
                  <span className="text-[12px] text-slate-400">{formatStamp(r.createdAt)}</span>
                  <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); void openRequest(r.id, r.clientName) }}>{t("common.view")}</Button>
                </div>
              </Card>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

export default AdminAssetRequests
