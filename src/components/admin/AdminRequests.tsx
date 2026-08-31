import React, { useCallback, useEffect, useState } from "react"
import { Button, Card, ErrorState, cx, useToast } from "../primitives"
import { useLang, langLocale } from "../../lib/i18n"
import {
  ApiError,
  apiListOnboardingRequests,
  apiGetOnboardingRequest,
  apiApproveOnboardingRequest,
  apiRejectOnboardingRequest,
  type BackendOnboardingRequest,
  type OnboardingRequestStatus,
} from "../../lib/api"
import { parseBackendTimestamp } from "../../lib/dashboardData"

/* Closed-set backend status tokens → i18n label keys (tokens themselves never change). */
const STATUS_LABEL_KEY: Record<OnboardingRequestStatus, string> = {
  PENDING: "status.pending",
  APPROVED: "status.approved",
  REJECTED: "status.rejected",
}

const TAB_LABEL_KEY: Record<"All" | OnboardingRequestStatus, string> = {
  All: "common.all",
  PENDING: "status.pending",
  APPROVED: "status.approved",
  REJECTED: "status.rejected",
}

function formatStamp(stamp: string | null | undefined): string {
  const d = parseBackendTimestamp(stamp)
  if (!d) return "—"
  return d.toLocaleDateString(langLocale(), {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

/* ------------------------------------------------------------------ */
/* Status badge                                                       */
/* ------------------------------------------------------------------ */
function StatusPill({ status }: { status: OnboardingRequestStatus }) {
  const { t } = useLang()
  const map: Record<OnboardingRequestStatus, { bg: string; text: string; ring: string; dot: string }> = {
    PENDING: { bg: "bg-amber-50", text: "text-amber-700", ring: "ring-amber-600/10", dot: "bg-warning" },
    APPROVED: { bg: "bg-emerald-50", text: "text-emerald-700", ring: "ring-emerald-600/10", dot: "bg-success" },
    REJECTED: { bg: "bg-red-50", text: "text-red-700", ring: "ring-red-600/10", dot: "bg-error" },
  }
  const s = map[status] ?? map.PENDING
  return (
    <span className={cx("inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1 ring-inset", s.bg, s.text, s.ring)}>
      <span className={cx("size-1.5 rounded-full", s.dot)} />
      {t(STATUS_LABEL_KEY[status] ?? "status.unknown")}
    </span>
  )
}

/* ------------------------------------------------------------------ */
/* KPI stat                                                           */
/* ------------------------------------------------------------------ */
function KPIStat({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <Card className="flex flex-col items-center justify-center py-4 px-6 text-center">
      <p className={cx("font-display text-2xl font-bold", color)}>{value}</p>
      <p className="mt-0.5 text-[12px] text-slate-400">{label}</p>
    </Card>
  )
}

/* ------------------------------------------------------------------ */
/* Detail / Review view                                               */
/* ------------------------------------------------------------------ */
function DR({ label, value, mono }: { label: string; value: React.ReactNode; mono?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2.5">
      <span className="text-[12px] text-slate-400">{label}</span>
      <span className={cx("text-end text-[13px] font-medium text-slate-700", mono && "font-mono")}>{value}</span>
    </div>
  )
}

function DS({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">{title}</h3>
      <div className="divide-y divide-slate-100 rounded-lg border border-slate-200 bg-elevated px-4">{children}</div>
    </div>
  )
}

function RequestDetail({
  requestId,
  onBack,
  onChanged,
}: {
  requestId: number
  onBack: () => void
  onChanged: () => void
}) {
  const { t } = useLang()
  const toast = useToast()
  const [req, setReq] = useState<BackendOnboardingRequest | null>(null)
  const [loadingReq, setLoadingReq] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  const [actionLoading, setActionLoading] = useState<"approve" | "reject" | null>(null)
  const [showApproveModal, setShowApproveModal] = useState(false)
  const [baseUrlInput, setBaseUrlInput] = useState("")
  const [baseUrlError, setBaseUrlError] = useState<string | null>(null)

  const [showRejectForm, setShowRejectForm] = useState(false)
  const [rejectInput, setRejectInput] = useState("")

  const loadDetail = useCallback(async () => {
    setLoadingReq(true)
    setLoadError(null)
    try {
      const data = await apiGetOnboardingRequest(requestId)
      setReq(data)
      // Pre-fill baseUrl input if empty
      setBaseUrlInput((prev) => (prev ? prev : `https://${(data.company_name || "app").toLowerCase().replace(/[^a-z0-9]/g, "")}.com`))
    } catch (err) {
      setLoadError(err instanceof ApiError ? err.message : t("common.loadFailed"))
    } finally {
      setLoadingReq(false)
    }
  }, [requestId, t])

  useEffect(() => {
    loadDetail()
  }, [loadDetail])

  async function handleConfirmApprove() {
    if (!baseUrlInput.trim()) {
      setBaseUrlError(t("admin.requests.baseUrlRequired"))
      return
    }
    setBaseUrlError(null)
    setActionLoading("approve")
    try {
      const res = await apiApproveOnboardingRequest(requestId, baseUrlInput.trim())
      toast({
        variant: "success",
        title: t("admin.requests.approvedTitle"),
        description: t("admin.requests.approvedDesc", { name: res.clientName || req?.company_name || "" }),
      })
      setShowApproveModal(false)
      await loadDetail()
      onChanged()
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : t("common.unexpectedError")
      toast({
        variant: "error",
        title: t("admin.requests.approveFailedTitle"),
        description: msg,
      })
      // If conflict (409) or state change, refresh from server
      if (err instanceof ApiError && (err.status === 409 || err.status === 404)) {
        setShowApproveModal(false)
        await loadDetail()
        onChanged()
      }
    } finally {
      setActionLoading(null)
    }
  }

  async function handleConfirmReject() {
    setActionLoading("reject")
    try {
      await apiRejectOnboardingRequest(requestId, rejectInput.trim() || undefined)
      toast({
        variant: "success",
        title: t("admin.requests.rejectedTitle"),
        description: t("admin.requests.rejectedDesc", { id: requestId }),
      })
      setShowRejectForm(false)
      await loadDetail()
      onChanged()
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : t("common.unexpectedError")
      toast({
        variant: "error",
        title: t("admin.requests.rejectFailedTitle"),
        description: msg,
      })
      if (err instanceof ApiError && (err.status === 409 || err.status === 404)) {
        setShowRejectForm(false)
        await loadDetail()
        onChanged()
      }
    } finally {
      setActionLoading(null)
    }
  }

  if (loadingReq) {
    return (
      <div className="space-y-6">
        <button onClick={onBack} className="inline-flex items-center gap-1.5 text-[13px] font-medium text-slate-400 transition-colors hover:text-brand-300">
          <svg className="size-4 rtl:-scale-x-100" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M12.7 15.3a1 1 0 01-1.4 0l-4.5-4.6a1 1 0 010-1.4l4.5-4.6a1 1 0 111.4 1.4L8.9 10l3.8 3.9a1 1 0 010 1.4z" /></svg>
          {t("admin.requests.back")}
        </button>
        <Card className="p-12 text-center">
          <div className="inline-flex items-center gap-2 text-[13px] text-slate-500">
            <svg className="size-4 animate-spin text-brand-300" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
            {t("common.loading")}
          </div>
        </Card>
      </div>
    )
  }

  if (loadError || !req) {
    return (
      <div className="space-y-6">
        <button onClick={onBack} className="inline-flex items-center gap-1.5 text-[13px] font-medium text-slate-400 transition-colors hover:text-brand-300">
          <svg className="size-4 rtl:-scale-x-100" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M12.7 15.3a1 1 0 01-1.4 0l-4.5-4.6a1 1 0 010-1.4l4.5-4.6a1 1 0 111.4 1.4L8.9 10l3.8 3.9a1 1 0 010 1.4z" /></svg>
          {t("admin.requests.back")}
        </button>
        <ErrorState title={t("admin.requests.loadFailedTitle")} description={loadError || t("errors.requestNotExist")} onRetry={loadDetail} />
      </div>
    )
  }

  const initial = (req.company_name || req.email || "?").charAt(0).toUpperCase()

  return (
    <div className="space-y-6">
      <button onClick={onBack} className="inline-flex items-center gap-1.5 text-[13px] font-medium text-slate-400 transition-colors hover:text-brand-300">
        <svg className="size-4 rtl:-scale-x-100" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M12.7 15.3a1 1 0 01-1.4 0l-4.5-4.6a1 1 0 010-1.4l4.5-4.6a1 1 0 111.4 1.4L8.9 10l3.8 3.9a1 1 0 010 1.4z" /></svg>
        {t("admin.requests.back")}
      </button>

      {/* Identity card */}
      <Card className="p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className="flex size-11 items-center justify-center rounded-xl bg-brand-900 font-display text-lg font-bold text-white">
              {initial}
            </div>
            <div>
              <div className="flex items-center gap-2.5">
                <h1 className="font-display text-xl font-bold tracking-tight text-navy">{req.company_name}</h1>
                <StatusPill status={req.status} />
              </div>
              <p className="mt-0.5 text-[13px] text-slate-500">{req.email}</p>
            </div>
          </div>
          <p className="text-[12px] text-slate-400">
            {t("admin.requests.submittedAt", { time: formatStamp(req.created_at) })}
          </p>
        </div>

        {/* Rejection reason */}
        {req.status === "REJECTED" && req.admin_notes && (
          <div className="mt-4 rounded-lg border border-red-100 bg-red-50 px-4 py-3">
            <p className="text-[12px] font-semibold text-red-700">{t("admin.requests.rejectionReason")}</p>
            <p className="mt-0.5 text-[13px] text-red-600">{req.admin_notes}</p>
          </div>
        )}

        {/* Provisioned client badge if approved */}
        {req.status === "APPROVED" && req.client_id && (
          <div className="mt-4 flex items-center justify-between gap-3 rounded-lg border border-emerald-100 bg-emerald-50 px-4 py-3">
            <div className="flex items-center gap-2.5">
              <svg className="size-4 shrink-0 text-success" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.7-9.3a1 1 0 00-1.4-1.4L9 10.6 7.7 9.3a1 1 0 00-1.4 1.4l2 2a1 1 0 001.4 0l4-4z" /></svg>
              <div>
                <p className="text-[12px] font-semibold text-emerald-800">{t("admin.requests.provisionedClient")}</p>
                <p className="text-[11px] text-emerald-600">{t("admin.requests.provisionedClientDesc", { id: req.client_id })}</p>
              </div>
            </div>
          </div>
        )}
      </Card>

      {/* Two-column detail */}
      <div className="grid gap-6 lg:grid-cols-[1fr_260px]">
        <div className="space-y-4">
          <DS title={t("onb.requester")}>
            <DR label={t("admin.requests.company")} value={req.company_name} />
            <DR label={t("admin.requests.applicantEmail")} value={req.email} />
            <DR label={t("common.user")} value={`ID #${req.user_id}`} mono />
          </DS>

          {(req.reviewed_by || req.reviewed_at) && (
            <DS title={t("admin.asset.info")}>
              {req.reviewed_by != null && (
                <DR label={t("admin.requests.reviewedBy")} value={`Admin #${req.reviewed_by}`} mono />
              )}
              {req.reviewed_at && (
                <DR label={t("admin.requests.reviewedAt")} value={formatStamp(req.reviewed_at)} />
              )}
            </DS>
          )}
        </div>

        {/* Actions sidebar */}
        <div className="space-y-4">
          <Card className="p-4">
            <h3 className="mb-3 text-[11px] font-semibold uppercase tracking-wide text-slate-400">{t("admin.requests.details")}</h3>
            <div className="space-y-2.5">
              <div>
                <p className="text-[11px] text-slate-400">{t("admin.requests.requestId")}</p>
                <p className="mt-0.5 font-mono text-[12px] text-slate-600">#{req.id}</p>
              </div>
              <div>
                <p className="text-[11px] text-slate-400">{t("admin.submitted")}</p>
                <p className="mt-0.5 text-[13px] text-slate-700">{formatStamp(req.created_at)}</p>
              </div>
              <div>
                <p className="text-[11px] text-slate-400">{t("admin.requests.currentStatus")}</p>
                <div className="mt-0.5">
                  <StatusPill status={req.status} />
                </div>
              </div>
            </div>
          </Card>

          {req.status === "PENDING" && (
            <Card className="p-4">
              <h3 className="mb-3 text-[11px] font-semibold uppercase tracking-wide text-slate-400">{t("table.actions")}</h3>
              <div className="space-y-2">
                <Button
                  variant="primary"
                  className="w-full"
                  onClick={() => {
                    setShowApproveModal(true)
                    setShowRejectForm(false)
                  }}
                  disabled={actionLoading !== null}
                >
                  {t("admin.requests.approve")}
                </Button>

                {!showRejectForm ? (
                  <Button
                    variant="secondary"
                    className="w-full"
                    onClick={() => {
                      setShowRejectForm(true)
                      setShowApproveModal(false)
                    }}
                    disabled={actionLoading !== null}
                  >
                    {t("admin.requests.reject")}
                  </Button>
                ) : (
                  <div className="space-y-2 rounded-lg border border-red-100 bg-red-50 p-3">
                    <p className="text-[12px] font-semibold text-red-700">{t("admin.requests.rejectionReason")}</p>
                    <textarea
                      value={rejectInput}
                      onChange={(e) => setRejectInput(e.target.value)}
                      placeholder={t("admin.requests.rejectionPlaceholder")}
                      rows={3}
                      disabled={actionLoading !== null}
                      className="block w-full rounded-md border border-red-200 bg-white px-3 py-2 text-[12px] text-slate-700 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-red-300 resize-none disabled:opacity-50"
                    />
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="danger"
                        onClick={handleConfirmReject}
                        disabled={actionLoading !== null}
                        className="flex-1"
                      >
                        {actionLoading === "reject" && (
                          <svg className="size-3.5 animate-spin" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
                        )}
                        {actionLoading === "reject" ? t("admin.requests.rejecting") : t("admin.requests.confirmReject")}
                      </Button>
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => setShowRejectForm(false)}
                        disabled={actionLoading !== null}
                      >
                        {t("common.cancel")}
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            </Card>
          )}

          {req.status === "APPROVED" && (
            <div className="flex items-center gap-2.5 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3.5">
              <svg className="size-4 shrink-0 text-success" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.7-9.3a1 1 0 00-1.4-1.4L9 10.6 7.7 9.3a1 1 0 00-1.4 1.4l2 2a1 1 0 001.4 0l4-4z" /></svg>
              <p className="text-[12px] font-semibold text-emerald-700">{t("admin.requests.approvedNote")}</p>
            </div>
          )}
        </div>
      </div>

      {/* Approve Modal for entering Base URL */}
      {showApproveModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-[#020a16]/70 backdrop-blur-sm" onClick={() => !actionLoading && setShowApproveModal(false)} />
          <Card className="relative z-10 w-full max-w-md p-6 shadow-2xl">
            <h3 className="font-display text-lg font-bold text-navy">{t("admin.requests.approveModalTitle")}</h3>
            <p className="mt-1 text-[13px] text-slate-500">{t("admin.requests.approveModalDesc")}</p>

            <div className="mt-4 space-y-3">
              <div>
                <label className="block text-[12px] font-semibold text-slate-700">
                  {t("admin.requests.baseUrlLabel")} <span className="text-red-500">*</span>
                </label>
                <input
                  type="url"
                  value={baseUrlInput}
                  onChange={(e) => {
                    setBaseUrlInput(e.target.value)
                    setBaseUrlError(null)
                  }}
                  placeholder={t("admin.requests.baseUrlPlaceholder")}
                  disabled={actionLoading !== null}
                  className={cx(
                    "mt-1 block w-full rounded-lg border px-3 py-2 text-[13px] focus:outline-none focus:ring-2 disabled:opacity-50",
                    baseUrlError
                      ? "border-red-300 bg-red-50/50 text-red-900 focus:border-red-400 focus:ring-red-200"
                      : "border-slate-200 bg-white text-slate-800 focus:border-brand-300 focus:ring-brand-100",
                  )}
                />
                {baseUrlError && (
                  <p className="mt-1 text-[11px] font-medium text-red-600">{baseUrlError}</p>
                )}
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-2.5">
              <Button
                variant="secondary"
                onClick={() => setShowApproveModal(false)}
                disabled={actionLoading !== null}
              >
                {t("common.cancel")}
              </Button>
              <Button
                variant="primary"
                onClick={handleConfirmApprove}
                disabled={actionLoading !== null}
              >
                {actionLoading === "approve" && (
                  <svg className="size-4 animate-spin" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
                )}
                {actionLoading === "approve" ? t("admin.requests.approving") : t("admin.requests.confirmApprove")}
              </Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Requests list                                                      */
/* ------------------------------------------------------------------ */
export function AdminRequests({ onRequestsChanged }: { onRequestsChanged?: () => void }) {
  const { t } = useLang()
  const [requests, setRequests] = useState<BackendOnboardingRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [statusFilter, setStatusFilter] = useState<"All" | OnboardingRequestStatus>("All")
  const [selectedId, setSelectedId] = useState<number | null>(null)

  const loadRequests = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const rows = await apiListOnboardingRequests()
      setRequests(rows)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("admin.requests.loadFailed"))
    } finally {
      setLoading(false)
    }
  }, [t])

  useEffect(() => {
    loadRequests()
  }, [loadRequests])

  function handleDataChanged() {
    loadRequests()
    onRequestsChanged?.()
  }

  if (selectedId !== null) {
    return (
      <RequestDetail
        requestId={selectedId}
        onBack={() => setSelectedId(null)}
        onChanged={handleDataChanged}
      />
    )
  }

  const pending = requests.filter((r) => r.status === "PENDING").length
  const approved = requests.filter((r) => r.status === "APPROVED").length
  const rejected = requests.filter((r) => r.status === "REJECTED").length

  const filtered = requests.filter((r) => statusFilter === "All" || r.status === statusFilter)

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-warning">{t("nav.adminConsole")}</p>
        <h1 className="mt-1 font-display text-2xl font-bold tracking-tight text-navy">{t("admin.navRequests")}</h1>
        <p className="mt-1 text-[13px] text-slate-500">{t("admin.requests.subtitle")}</p>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-3 gap-4">
        <KPIStat label={t("status.pending")} value={pending} color="text-warning" />
        <KPIStat label={t("status.approved")} value={approved} color="text-success" />
        <KPIStat label={t("status.rejected")} value={rejected} color="text-error" />
      </div>

      {/* Filter */}
      <div className="inline-flex items-center gap-1 rounded-lg bg-slate-100 p-1">
        {(["All", "PENDING", "APPROVED", "REJECTED"] as const).map((tabKey) => (
          <button
            key={tabKey}
            onClick={() => setStatusFilter(tabKey)}
            className={cx(
              "rounded-md px-3 py-1.5 text-[13px] font-medium transition-all",
              statusFilter === tabKey
                ? "bg-surface text-brand-300 shadow-sm"
                : "text-slate-500 hover:text-slate-700",
            )}
          >
            {t(TAB_LABEL_KEY[tabKey])}
          </button>
        ))}
      </div>

      {/* Error state */}
      {error && (
        <ErrorState
          title={t("admin.requests.loadFailedTitle")}
          description={error}
          onRetry={loadRequests}
        />
      )}

      {/* Loading state */}
      {loading && !error && (
        <Card className="p-12 text-center">
          <div className="inline-flex items-center gap-2 text-[13px] text-slate-500">
            <svg className="size-4 animate-spin text-brand-300" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
            {t("common.loading")}
          </div>
        </Card>
      )}

      {/* Table — desktop */}
      {!loading && !error && (
        <Card className="hidden overflow-hidden lg:block">
          <table className="w-full">
            <thead>
              <tr className="text-start text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                <th className="px-5 py-3 font-semibold">{t("admin.requests.company")}</th>
                <th className="px-4 py-3 font-semibold">{t("admin.requests.applicantEmail")}</th>
                <th className="px-4 py-3 font-semibold">{t("admin.submitted")}</th>
                <th className="px-4 py-3 font-semibold">{t("table.status")}</th>
                <th className="px-4 py-3 text-end font-semibold">{t("table.actions")}</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((req) => {
                const initial = (req.company_name || req.email || "?").charAt(0).toUpperCase()
                return (
                  <tr key={req.id} className="group border-t border-slate-100 transition-colors hover:bg-slate-50/60">
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-2.5">
                        <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-brand-50 font-display text-[13px] font-bold text-brand-400">
                          {initial}
                        </div>
                        <div>
                          <p className="text-[13px] font-semibold text-navy group-hover:text-brand-300">{req.company_name}</p>
                          <p className="font-mono text-[11px] text-slate-400">#{req.id}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3.5 text-[13px] text-slate-600">{req.email}</td>
                    <td className="px-4 py-3.5 text-[13px] text-slate-400">{formatStamp(req.created_at)}</td>
                    <td className="px-4 py-3.5"><StatusPill status={req.status} /></td>
                    <td className="px-4 py-3.5 text-end">
                      <Button variant="ghost" size="sm" onClick={() => setSelectedId(req.id)}>
                        {t("admin.requests.review")}
                      </Button>
                    </td>
                  </tr>
                )
              })}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-10 text-center text-[13px] text-slate-400">
                    {requests.length === 0 ? t("admin.requests.emptyDesc") : t("admin.requests.noMatch")}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </Card>
      )}

      {/* Cards — mobile */}
      {!loading && !error && (
        <div className="space-y-3 lg:hidden">
          {filtered.map((req) => {
            const initial = (req.company_name || req.email || "?").charAt(0).toUpperCase()
            return (
              <Card key={req.id} className="p-4" interactive onClick={() => setSelectedId(req.id)}>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-2.5">
                    <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-brand-50 font-display text-[14px] font-bold text-brand-400">
                      {initial}
                    </div>
                    <div>
                      <p className="text-[14px] font-semibold text-navy">{req.company_name}</p>
                      <p className="text-[11px] text-slate-400">{req.email}</p>
                    </div>
                  </div>
                  <StatusPill status={req.status} />
                </div>
                <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-3 text-[12px] text-slate-400">
                  <span className="font-mono">#{req.id}</span>
                  <span>{formatStamp(req.created_at)}</span>
                </div>
              </Card>
            )
          })}
          {filtered.length === 0 && (
            <p className="py-10 text-center text-[13px] text-slate-400">
              {requests.length === 0 ? t("admin.requests.emptyDesc") : t("admin.requests.noMatch")}
            </p>
          )}
        </div>
      )}
    </div>
  )
}

export default AdminRequests
