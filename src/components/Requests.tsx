import React, { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  ApiError,
  apiCancelAssetRequest,
  apiClientDetails,
  apiCreateAssetRequest,
  apiFlowTests,
  apiGetAssetRequest,
  apiListAssetRequests,
  type AssetRequestPayload,
  type AssetRequestStatus,
  type AssetRequestTestSpec,
  type AssetRequestType,
  type BackendAssetRequest,
} from "../lib/api"
import { parseBackendTimestamp } from "../lib/dashboardData"
import { useAuth } from "../lib/auth"
import { langLocale, useLang } from "../lib/i18n"
import { Button, Card, ErrorState, Skeleton, cx, useToast } from "./primitives"
import { WorkspaceHeader } from "./WorkspaceHeader"

/* ------------------------------------------------------------------ */
/* Client Requests page — real Asset Requests APIs only.               */
/*                                                                     */
/* The user-facing model is REQUEST → REVIEW → APPROVAL →              */
/* IMPLEMENTATION. Clients never mutate flows/tests directly from      */
/* here — every submit goes through POST /clients/{id}/requests and    */
/* every row shown comes from GET /clients/{id}/requests.              */
/* No mock request data exists in this file.                           */
/* ------------------------------------------------------------------ */

/* ---- View model ---------------------------------------------------- */

type RequestView = {
  id: number
  type: AssetRequestType
  status: AssetRequestStatus
  /** Flow name (ADD_FLOW) or flow id (everything else). */
  flowName: string | null
  flowId: number | null
  testMethod: string | null
  description: string | null
  expectedBehavior: string | null
  steps: string[]
  reason: string | null
  adminNotes: string | null
  /** Tests carried by an ADD_FLOW payload. */
  tests: { testName: string; description: string; expectedBehavior: string; steps: string[] }[]
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

function toView(row: BackendAssetRequest): RequestView {
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
    type: row.request_type,
    status: row.status,
    flowName: str(p.flowName),
    flowId: num(p.flowId),
    testMethod: str(p.testMethod) ?? str(p.testName),
    description: str(p.description),
    expectedBehavior: str(p.expectedBehavior),
    steps: strList(p.steps),
    reason: str(p.reason),
    adminNotes: str(row.admin_notes),
    tests,
    createdAt: parseBackendTimestamp(row.created_at),
    updatedAt: parseBackendTimestamp(row.updated_at),
    reviewedAt: parseBackendTimestamp(row.reviewed_at),
    implementedAt: parseBackendTimestamp(row.implemented_at),
  }
}

/* ---- Presentation constants ---------------------------------------- */

const TYPE_KEYS: Record<AssetRequestType, string> = {
  ADD_FLOW: "requests.type.addFlow",
  MODIFY_FLOW: "requests.type.modifyFlow",
  ADD_TEST: "requests.type.addTest",
  MODIFY_TEST: "requests.type.modifyTest",
  DELETE_FLOW: "requests.type.deleteFlow",
  DELETE_TEST: "requests.type.deleteTest",
}

const STATUS_KEYS: Record<AssetRequestStatus, string> = {
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

function StatusBadge({ status }: { status: AssetRequestStatus }) {
  const { t } = useLang()
  const s = STATUS_STYLES[status]
  return (
    <span
      className={cx(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1 ring-inset",
        s.bg,
        s.text,
        s.ring,
      )}
    >
      <span className={cx("size-1.5 rounded-full", s.dot)} />
      {t(STATUS_KEYS[status])}
    </span>
  )
}

function TypeChip({ type }: { type: AssetRequestType }) {
  const { t } = useLang()
  const isDelete = type.startsWith("DELETE")
  const isModify = type.startsWith("MODIFY")
  return (
    <span
      className={cx(
        "inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide",
        isDelete ? "bg-red-50 text-red-600" : isModify ? "bg-amber-50 text-amber-700" : "bg-brand-50 text-brand-300",
      )}
    >
      {t(TYPE_KEYS[type])}
    </span>
  )
}

function formatStamp(date: Date | null): string {
  if (!date) return "—"
  return date.toLocaleDateString(langLocale(), { month: "short", day: "numeric", year: "numeric" })
}

/* ------------------------------------------------------------------ */
/* Detail view                                                         */
/* ------------------------------------------------------------------ */

const TIMELINE_KEYS: { key: AssetRequestStatus; labelKey: string }[] = [
  { key: "PENDING", labelKey: "requests.timeline.submitted" },
  { key: "APPROVED", labelKey: "requests.timeline.approved" },
  { key: "IMPLEMENTED", labelKey: "requests.timeline.implemented" },
]

function RequestTimeline({ status }: { status: AssetRequestStatus }) {
  const { t } = useLang()
  const failed = status === "REJECTED" || status === "CANCELLED"
  const stepIdx =
    status === "PENDING" ? 0 : status === "APPROVED" ? 1 : status === "IMPLEMENTED" ? 2 : -1

  return (
    <div className="flex items-center gap-0">
      {TIMELINE_KEYS.map((step, i) => {
        const done = stepIdx > i
        const current = stepIdx === i
        const isFinal = i === TIMELINE_KEYS.length - 1
        return (
          <React.Fragment key={step.key}>
            <div className="flex flex-col items-center">
              <div
                className={cx(
                  "flex size-7 items-center justify-center rounded-full text-[11px] font-bold transition-colors",
                  done || current
                    ? failed
                      ? "bg-slate-200 text-slate-400"
                      : "bg-brand-600 text-white"
                    : "border border-slate-200 bg-surface text-slate-400",
                )}
              >
                {done ? (
                  <svg className="size-3.5" viewBox="0 0 20 20" fill="currentColor">
                    <path
                      fillRule="evenodd"
                      d="M16.7 5.3a1 1 0 010 1.4l-8 8a1 1 0 01-1.4 0l-4-4a1 1 0 011.4-1.4l3.3 3.29 7.3-7.3a1 1 0 011.4 0z"
                    />
                  </svg>
                ) : (
                  i + 1
                )}
              </div>
              <p
                className={cx(
                  "mt-1 text-center text-[10px] font-semibold uppercase tracking-wide",
                  current ? "text-brand-300" : "text-slate-400",
                )}
              >
                {t(step.labelKey)}
              </p>
            </div>
            {!isFinal && (
              <div
                className={cx("mx-1 mb-4 h-px min-w-[24px] flex-1", done ? "bg-brand-600" : "bg-slate-200")}
              />
            )}
          </React.Fragment>
        )
      })}
      {failed && (
        <>
          <div className="mx-1 mb-4 h-px min-w-[24px] flex-1 bg-slate-200" />
          <div className="flex flex-col items-center">
            <div
              className={cx(
                "flex size-7 items-center justify-center rounded-full text-[11px] font-bold",
                status === "REJECTED" ? "bg-red-100 text-red-600" : "bg-slate-100 text-slate-400",
              )}
            >
              <svg className="size-3.5" viewBox="0 0 20 20" fill="currentColor">
                <path d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" />
              </svg>
            </div>
            <p
              className={cx(
                "mt-1 text-center text-[10px] font-semibold uppercase tracking-wide",
                status === "REJECTED" ? "text-red-600" : "text-slate-400",
              )}
            >
              {t(STATUS_KEYS[status])}
            </p>
          </div>
        </>
      )}
    </div>
  )
}

function DetailSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card className="p-5">
      <h2 className="pb-3 font-display text-sm font-bold text-navy">{title}</h2>
      {children}
    </Card>
  )
}

function RequestDetail({
  request,
  clientId,
  onCancelled,
  onBack,
  onUnauthorized,
}: {
  request: RequestView
  clientId: number
  onCancelled: () => void
  onBack: () => void
  onUnauthorized: () => void
}) {
  const { t } = useLang()
  const toast = useToast()
  const [cancelling, setCancelling] = useState(false)

  async function handleCancel() {
    if (cancelling) return
    setCancelling(true)
    try {
      await apiCancelAssetRequest(clientId, request.id)
      toast({
        title: t("requests.cancel.successTitle"),
        description: t("requests.cancel.successDesc", { id: request.id }),
        variant: "success",
      })
      onCancelled()
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        onUnauthorized()
        return
      }
      if (err instanceof ApiError && err.status === 409) {
        // No longer PENDING (review raced us) — refresh to show the real state.
        toast({
          title: t("requests.cancel.conflictTitle"),
          description: t("requests.cancel.conflictDesc"),
          variant: "warning",
        })
        onCancelled()
        return
      }
      toast({
        title: t("requests.cancel.failedTitle"),
        description: err instanceof ApiError ? err.message : t("common.somethingWentWrong"),
        variant: "error",
      })
    } finally {
      setCancelling(false)
    }
  }

  return (
    <div className="space-y-6">
      <button
        onClick={onBack}
        className="inline-flex items-center gap-1.5 text-[13px] font-medium text-slate-400 transition-colors hover:text-brand-300"
      >
        <svg className="size-4 rtl:rotate-180" viewBox="0 0 20 20" fill="currentColor">
          <path
            fillRule="evenodd"
            d="M12.7 15.3a1 1 0 01-1.4 0l-4.5-4.6a1 1 0 010-1.4l4.5-4.6a1 1 0 111.4 1.4L8.9 10l3.8 3.9a1 1 0 010 1.4z"
          />
        </svg>
        {t("requests.backToList")}
      </button>

      {/* Header */}
      <Card className="p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <TypeChip type={request.type} />
              <StatusBadge status={request.status} />
            </div>
            <h1 className="mt-2 font-display text-xl font-bold tracking-tight text-navy">
              {t(TYPE_KEYS[request.type])}
            </h1>
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-slate-400">
              <span className="font-mono text-slate-500">#{request.id}</span>
              <span className="text-slate-300">·</span>
              <span>{t("requests.detail.submittedAt", { time: formatStamp(request.createdAt) })}</span>
              <span className="text-slate-300">·</span>
              <span>{t("requests.detail.updatedAt", { time: formatStamp(request.updatedAt) })}</span>
            </div>
          </div>
          {request.status === "PENDING" && (
            <Button variant="ghost" size="sm" loading={cancelling} onClick={() => void handleCancel()}>
              {t("requests.cancel.button")}
            </Button>
          )}
        </div>
      </Card>

      <div className="grid gap-6 lg:grid-cols-[1fr_280px]">
        {/* Main column */}
        <div className="space-y-5">
          {/* Target */}
          <DetailSection title={t("requests.detail.target")}>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                  {t("requests.detail.flow")}
                </p>
                <p className="mt-1 text-[13px] font-medium text-slate-700">
                  {request.flowName ?? (request.flowId != null ? `#${request.flowId}` : "—")}
                </p>
              </div>
              {request.testMethod && (
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                    {t("requests.detail.test")}
                  </p>
                  <p className="mt-1 font-mono text-[13px] font-medium text-slate-700">{request.testMethod}</p>
                </div>
              )}
            </div>
          </DetailSection>

          {/* ADD_FLOW: one card per requested test */}
          {request.tests.length > 0 && (
            <DetailSection title={t("requests.detail.requestedTests", { count: request.tests.length })}>
              <div className="space-y-4">
                {request.tests.map((test, i) => (
                  <div key={i} className="rounded-xl border border-slate-200 bg-elevated p-4">
                    <div className="flex items-center gap-2.5">
                      <span className="flex size-6 items-center justify-center rounded-full bg-brand-50 font-mono text-[11px] font-bold text-brand-400">
                        {i + 1}
                      </span>
                      <span className="font-mono text-[13px] font-semibold text-navy">
                        {test.testName || "—"}
                      </span>
                    </div>
                    {test.description && (
                      <p className="mt-2 text-[13px] leading-relaxed text-slate-600">{test.description}</p>
                    )}
                    {test.expectedBehavior && (
                      <p className="mt-2 text-[12px] leading-relaxed text-slate-500">
                        <span className="font-semibold text-slate-400">{t("requests.detail.expectedBehavior")}: </span>
                        {test.expectedBehavior}
                      </p>
                    )}
                    {test.steps.length > 0 && (
                      <ol className="mt-3 space-y-2">
                        {test.steps.map((step, j) => (
                          <li key={j} className="flex gap-3">
                            <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-brand-50 font-mono text-[10px] font-bold text-brand-400">
                              {j + 1}
                            </span>
                            <p className="text-[13px] leading-relaxed text-slate-600">{step}</p>
                          </li>
                        ))}
                      </ol>
                    )}
                  </div>
                ))}
              </div>
            </DetailSection>
          )}

          {/* Single-test payload fields */}
          {request.description && (
            <DetailSection title={t("requests.detail.description")}>
              <p className="text-[13px] leading-relaxed text-slate-600">{request.description}</p>
            </DetailSection>
          )}

          {request.tests.length === 0 && request.expectedBehavior && (
            <DetailSection title={t("requests.detail.expectedBehavior")}>
              <p className="text-[13px] leading-relaxed text-slate-600">{request.expectedBehavior}</p>
            </DetailSection>
          )}

          {request.tests.length === 0 && request.steps.length > 0 && (
            <DetailSection title={t("requests.detail.steps")}>
              <ol className="space-y-2.5">
                {request.steps.map((step, i) => (
                  <li key={i} className="flex gap-3">
                    <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-brand-50 font-mono text-[10px] font-bold text-brand-400">
                      {i + 1}
                    </span>
                    <p className="text-[13px] leading-relaxed text-slate-600">{step}</p>
                  </li>
                ))}
              </ol>
            </DetailSection>
          )}

          {request.reason && (
            <DetailSection title={t("requests.detail.reason")}>
              <p className="text-[13px] leading-relaxed text-slate-600">{request.reason}</p>
            </DetailSection>
          )}

          {request.adminNotes && (
            <Card className="border-red-200 p-5">
              <div className="flex items-center gap-2 pb-3">
                <svg className="size-4 text-error" viewBox="0 0 20 20" fill="currentColor">
                  <path
                    fillRule="evenodd"
                    d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z"
                  />
                </svg>
                <h2 className="font-display text-sm font-bold text-red-700">{t("requests.detail.adminNotes")}</h2>
              </div>
              <p className="text-[13px] leading-relaxed text-slate-600">{request.adminNotes}</p>
            </Card>
          )}
        </div>

        {/* Sidebar column */}
        <div className="space-y-5">
          <DetailSection title={t("requests.detail.timeline")}>
            <RequestTimeline status={request.status} />
          </DetailSection>
          <DetailSection title={t("requests.detail.info")}>
            <div className="space-y-3">
              {(
                [
                  { label: t("requests.detail.requestId"), value: `#${request.id}`, mono: true },
                  { label: t("requests.detail.typeLabel"), value: t(TYPE_KEYS[request.type]), mono: false },
                  { label: t("requests.detail.submittedLabel"), value: formatStamp(request.createdAt), mono: false },
                  { label: t("requests.detail.updatedLabel"), value: formatStamp(request.updatedAt), mono: false },
                  { label: t("requests.detail.reviewedLabel"), value: formatStamp(request.reviewedAt), mono: false },
                  { label: t("requests.detail.implementedLabel"), value: formatStamp(request.implementedAt), mono: false },
                ] as const
              ).map(({ label, value, mono }) => (
                <div key={label}>
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{label}</p>
                  <p className={cx("mt-0.5 text-[13px] font-medium text-slate-700", mono && "font-mono")}>{value}</p>
                </div>
              ))}
            </div>
          </DetailSection>
        </div>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* New request forms                                                   */
/* ------------------------------------------------------------------ */

const inputCls =
  "block w-full rounded-lg border border-slate-200 bg-elevated px-3.5 py-2.5 text-[13px] text-slate-700 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-400"

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1.5 block text-[12px] font-semibold uppercase tracking-wide text-slate-500">
        {label}
        {required && <span className="ms-0.5 text-error">*</span>}
      </label>
      {children}
    </div>
  )
}

function StepList({ steps, onChange }: { steps: string[]; onChange: (s: string[]) => void }) {
  const { t } = useLang()
  return (
    <div className="space-y-2">
      {steps.map((step, i) => (
        <div key={i} className="flex items-start gap-2">
          <span className="mt-2.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-brand-50 font-mono text-[10px] font-bold text-brand-400">
            {i + 1}
          </span>
          <input
            type="text"
            value={step}
            onChange={(e) => {
              const n = [...steps]
              n[i] = e.target.value
              onChange(n)
            }}
            placeholder={t("requests.form.stepPlaceholder", { n: i + 1 })}
            className={cx(inputCls, "min-w-0 flex-1")}
          />
          {steps.length > 1 && (
            <button
              type="button"
              onClick={() => onChange(steps.filter((_, j) => j !== i))}
              className="mt-2.5 rounded-md p-1 text-slate-400 transition-colors hover:text-error"
              aria-label={t("requests.form.removeStep")}
            >
              <svg className="size-4" viewBox="0 0 20 20" fill="currentColor">
                <path d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" />
              </svg>
            </button>
          )}
        </div>
      ))}
      <button
        type="button"
        onClick={() => onChange([...steps, ""])}
        className="inline-flex items-center gap-1.5 text-[13px] font-medium text-brand-300 transition-colors hover:text-brand-400"
      >
        <span className="flex size-5 items-center justify-center rounded-full border border-brand-300 text-base leading-none">
          +
        </span>
        {t("requests.form.addStep")}
      </button>
    </div>
  )
}

/* ---- Form state ---------------------------------------------------- */

type FlowOption = { id: number; name: string }

type DraftTest = {
  key: number
  name: string
  description: string
  expectedBehavior: string
  steps: string[]
}

function makeDraftTest(id: number): DraftTest {
  return { key: id, name: "", description: "", expectedBehavior: "", steps: [""] }
}

function testsFromDraft(drafts: DraftTest[]): AssetRequestTestSpec[] {
  return drafts
    .map((d) => ({
      testName: d.name.trim(),
      description: d.description.trim() || undefined,
      expectedBehavior: d.expectedBehavior.trim() || undefined,
      steps: d.steps.map((s) => s.trim()).filter(Boolean),
    }))
    .filter((d) => d.testName !== "" && d.steps.length > 0)
}

/* ---- Type picker ---------------------------------------------------- */

const TYPE_OPTIONS: { type: AssetRequestType; icon: string; descKey: string }[] = [
  { type: "ADD_FLOW", icon: "+", descKey: "requests.typeDesc.addFlow" },
  { type: "MODIFY_FLOW", icon: "~", descKey: "requests.typeDesc.modifyFlow" },
  { type: "ADD_TEST", icon: "+", descKey: "requests.typeDesc.addTest" },
  { type: "MODIFY_TEST", icon: "~", descKey: "requests.typeDesc.modifyTest" },
  { type: "DELETE_FLOW", icon: "✕", descKey: "requests.typeDesc.deleteFlow" },
  { type: "DELETE_TEST", icon: "✕", descKey: "requests.typeDesc.deleteTest" },
]

function TypePicker({ onPick }: { onPick: (t: AssetRequestType) => void }) {
  const { t } = useLang()
  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-display text-xl font-bold tracking-tight text-navy">
          {t("requests.newRequest")}
        </h2>
        <p className="mt-1 text-[13px] text-slate-500">{t("requests.form.selectType")}</p>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {TYPE_OPTIONS.map(({ type, icon, descKey }) => {
          const isDelete = type.startsWith("DELETE")
          const isModify = type.startsWith("MODIFY")
          return (
            <button
              key={type}
              type="button"
              onClick={() => onPick(type)}
              className="flex items-start gap-3.5 rounded-xl border border-slate-200 bg-surface px-4 py-4 text-start transition-all hover:border-brand-300 hover:shadow-sm"
            >
              <span
                className={cx(
                  "flex size-9 shrink-0 items-center justify-center rounded-lg text-lg font-bold",
                  isDelete ? "bg-red-50 text-red-500" : isModify ? "bg-amber-50 text-amber-600" : "bg-brand-50 text-brand-400",
                )}
              >
                {icon}
              </span>
              <span>
                <span className="block font-semibold text-navy">{t(TYPE_KEYS[type])}</span>
                <span className="mt-0.5 block text-[12px] text-slate-400">{t(descKey)}</span>
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

/* ---- ADD_FLOW (multi-test) ------------------------------------------ */

function TestBlock({
  test,
  index,
  total,
  onUpdate,
  onRemove,
}: {
  test: DraftTest
  index: number
  total: number
  onUpdate: (t: DraftTest) => void
  onRemove: () => void
}) {
  const { t } = useLang()
  function set<K extends keyof DraftTest>(key: K, val: DraftTest[K]) {
    onUpdate({ ...test, [key]: val })
  }
  return (
    <div className="rounded-xl border border-slate-200 bg-elevated">
      <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-brand-50 font-mono text-[11px] font-bold text-brand-400">
            {index + 1}
          </span>
          <span className="truncate text-[13px] font-semibold text-navy">
            {test.name.trim() ? test.name.trim() : t("requests.form.testN", { n: index + 1 })}
          </span>
        </div>
        {total > 1 && (
          <button
            type="button"
            onClick={onRemove}
            className="inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium text-slate-400 transition-colors hover:bg-red-50 hover:text-error"
          >
            <svg className="size-3.5" viewBox="0 0 20 20" fill="currentColor">
              <path d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" />
            </svg>
            {t("requests.form.removeTest")}
          </button>
        )}
      </div>
      <div className="space-y-4 p-4">
        <Field label={t("requests.form.testName")} required>
          <input
            type="text"
            value={test.name}
            onChange={(e) => set("name", e.target.value)}
            placeholder={t("requests.form.testNamePlaceholder")}
            className={inputCls}
          />
        </Field>
        <Field label={t("requests.form.description")}>
          <textarea
            value={test.description}
            onChange={(e) => set("description", e.target.value)}
            rows={2}
            placeholder={t("requests.form.testDescPlaceholder")}
            className={cx(inputCls, "resize-none")}
          />
        </Field>
        <Field label={t("requests.detail.expectedBehavior")}>
          <textarea
            value={test.expectedBehavior}
            onChange={(e) => set("expectedBehavior", e.target.value)}
            rows={2}
            placeholder={t("requests.form.expectedPlaceholder")}
            className={cx(inputCls, "resize-none")}
          />
        </Field>
        <Field label={t("requests.detail.steps")}>
          <StepList steps={test.steps} onChange={(s) => set("steps", s)} />
        </Field>
      </div>
    </div>
  )
}

/* ---- Unified new-request form --------------------------------------- */

function NewRequestForm({
  clientId,
  initialType,
  initialFlowId,
  onSubmitted,
  onCancel,
  onUnauthorized,
}: {
  clientId: number
  /** Pre-selected type when opened from the Flows page. */
  initialType?: AssetRequestType
  /** Pre-selected flow when opened from the Flows page. */
  initialFlowId?: number
  onSubmitted: () => void
  onCancel: () => void
  onUnauthorized: () => void
}) {
  const { t } = useLang()
  const toast = useToast()

  const [type, setType] = useState<AssetRequestType | null>(initialType ?? null)
  const [flows, setFlows] = useState<FlowOption[] | null>(null)
  const [flowsError, setFlowsError] = useState<string | null>(null)

  // Shared draft state for every type.
  const [flowId, setFlowId] = useState<number | null>(initialFlowId ?? null)
  const [flowName, setFlowName] = useState("")
  const [flowDescription, setFlowDescription] = useState("")
  const [testMethod, setTestMethod] = useState("")
  const [description, setDescription] = useState("")
  const [expectedBehavior, setExpectedBehavior] = useState("")
  const [reason, setReason] = useState("")
  const [steps, setSteps] = useState<string[]>([""])
  const [draftTests, setDraftTests] = useState<DraftTest[]>([makeDraftTest(1)])
  const nextKey = useRef(2)
  const [submitting, setSubmitting] = useState(false)

  const selectedFlow = useMemo(() => flows?.find((f) => f.id === flowId) ?? null, [flows, flowId])

  const needsExistingFlow =
    type != null && type !== "ADD_FLOW" // every other type targets an existing flow
  const needsExistingTest = type === "MODIFY_TEST" || type === "DELETE_TEST"
  const needsNewTest = type === "ADD_TEST"
  const needsReason = type === "MODIFY_FLOW" || type === "MODIFY_TEST" || type === "DELETE_FLOW" || type === "DELETE_TEST"
  const isDelete = type?.startsWith("DELETE") ?? false

  /* Steps are per-type content: re-typing starts a fresh step list so the
     MODIFY_FLOW steps field (shown for every non-delete type, per Figma)
     never inherits values typed for another request type. */
  useEffect(() => {
    setSteps([""])
  }, [type])

  /* Real flows for the selector — no mock pool. */
  useEffect(() => {
    let alive = true
    setFlows(null)
    setFlowsError(null)
    apiClientDetails(clientId)
      .then((details) => {
        if (!alive) return
        setFlows(
          details.flows
            .filter((f) => f.is_active)
            .map((f) => ({ id: f.id, name: f.flow_name })),
        )
      })
      .catch((err) => {
        if (!alive) return
        if (err instanceof ApiError && err.status === 401) {
          onUnauthorized()
          return
        }
        setFlowsError(err instanceof ApiError ? err.message : t("common.somethingWentWrong"))
      })
    return () => {
      alive = false
    }
  }, [clientId, onUnauthorized, t])

  function validationError(): string | null {
    if (type === "ADD_FLOW") {
      if (!flowName.trim()) return t("requests.validation.flowName")
      const specs = testsFromDraft(draftTests)
      if (specs.length === 0) return t("requests.validation.testsRequired")
      if (specs.length !== draftTests.length) return t("requests.validation.testIncomplete")
      const names = new Set<string>()
      for (const spec of specs) {
        const key = spec.testName.trim().toLowerCase()
        if (names.has(key)) return t("requests.validation.duplicateTest")
        names.add(key)
      }
      return null
    }
    if (type == null) return null
    if (needsExistingFlow && flowId == null) return t("requests.validation.flowRequired")
    if (needsExistingTest && !testMethod) return t("requests.validation.testRequired")
    if (needsNewTest && !testMethod.trim()) return t("requests.validation.testNameRequired")
    if (needsNewTest && steps.map((s) => s.trim()).filter(Boolean).length === 0)
      return t("requests.validation.stepsRequired")
    if (needsReason && !reason.trim()) return t("requests.validation.reasonRequired")
    return null
  }

  function buildPayload(): AssetRequestPayload | null {
    if (type == null) return null
    switch (type) {
      case "ADD_FLOW":
        return {
          requestType: "ADD_FLOW",
          flowName: flowName.trim(),
          description: flowDescription.trim() || undefined,
          tests: testsFromDraft(draftTests),
        }
      case "MODIFY_FLOW":
        return {
          requestType: "MODIFY_FLOW",
          flowId: flowId!,
          description: description.trim() || undefined,
          expectedBehavior: expectedBehavior.trim() || undefined,
          steps: steps.map((s) => s.trim()).filter(Boolean),
          reason: reason.trim(),
        }
      case "ADD_TEST":
        return {
          requestType: "ADD_TEST",
          flowId: flowId!,
          testName: testMethod.trim(),
          description: description.trim() || undefined,
          expectedBehavior: expectedBehavior.trim() || undefined,
          steps: steps.map((s) => s.trim()).filter(Boolean),
        }
      case "MODIFY_TEST":
        return {
          requestType: "MODIFY_TEST",
          flowId: flowId!,
          testMethod,
          description: description.trim() || undefined,
          expectedBehavior: expectedBehavior.trim() || undefined,
          steps: steps.map((s) => s.trim()).filter(Boolean),
          reason: reason.trim(),
        }
      case "DELETE_FLOW":
        return { requestType: "DELETE_FLOW", flowId: flowId!, reason: reason.trim() }
      case "DELETE_TEST":
        return { requestType: "DELETE_TEST", flowId: flowId!, testMethod, reason: reason.trim() }
    }
  }

  async function handleSubmit() {
    if (submitting || type == null) return
    const problem = validationError()
    if (problem) {
      toast({ title: t("requests.validation.title"), description: problem, variant: "warning" })
      return
    }
    const payload = buildPayload()
    if (!payload) return
    setSubmitting(true)
    try {
      await apiCreateAssetRequest(clientId, payload)
      toast({
        title: t("requests.submit.successTitle"),
        description: t("requests.submit.successDesc"),
        variant: "success",
      })
      onSubmitted()
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        onUnauthorized()
        return
      }
      if (err instanceof ApiError && err.status === 409) {
        // e.g. an active flow with the requested name already exists.
        toast({ title: t("requests.submit.conflictTitle"), description: err.message, variant: "warning" })
        return
      }
      toast({
        title: t("requests.submit.failedTitle"),
        description: err instanceof ApiError ? err.message : t("common.somethingWentWrong"),
        variant: "error",
      })
    } finally {
      setSubmitting(false)
    }
  }

  if (type == null) {
    return (
      <div className="space-y-6">
        <TypePicker onPick={setType} />
        <div className="flex justify-start">
          <Button variant="ghost" size="sm" onClick={onCancel}>
            {t("common.cancel")}
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => setType(null)}
          className="inline-flex items-center gap-1.5 text-[13px] font-medium text-slate-400 transition-colors hover:text-brand-300"
        >
          <svg className="size-4 rtl:rotate-180" viewBox="0 0 20 20" fill="currentColor">
            <path
              fillRule="evenodd"
              d="M12.7 15.3a1 1 0 01-1.4 0l-4.5-4.6a1 1 0 010-1.4l4.5-4.6a1 1 0 111.4 1.4L8.9 10l3.8 3.9a1 1 0 010 1.4z"
            />
          </svg>
          {t("requests.form.changeType")}
        </button>
        <TypeChip type={type} />
      </div>

      <Card className="p-6">
        <div className="space-y-5">
          {/* ADD_FLOW: the new flow's name */}
          {type === "ADD_FLOW" && (
            <>
              <Field label={t("requests.form.flowName")} required>
                <input
                  type="text"
                  value={flowName}
                  onChange={(e) => setFlowName(e.target.value)}
                  placeholder={t("requests.form.flowNamePlaceholder")}
                  className={inputCls}
                />
              </Field>
              <Field label={t("requests.form.description")}>
                <textarea
                  value={flowDescription}
                  onChange={(e) => setFlowDescription(e.target.value)}
                  rows={2}
                  placeholder={t("requests.form.flowDescPlaceholder")}
                  className={cx(inputCls, "resize-none")}
                />
              </Field>
            </>
          )}

          {/* Every other type targets an existing flow */}
          {needsExistingFlow && (
            <Field label={t("requests.form.selectFlow")} required>
              {flowsError ? (
                <p className="text-[13px] text-error">{flowsError}</p>
              ) : flows == null ? (
                <div className="flex items-center gap-2 py-2 text-[13px] text-slate-400">
                  <span className="inline-block size-3.5 animate-spin rounded-full border-2 border-slate-200 border-t-brand-400" />
                  {t("common.loading")}
                </div>
              ) : (
                <select
                  value={flowId ?? ""}
                  onChange={(e) => {
                    setFlowId(e.target.value === "" ? null : Number(e.target.value))
                    setTestMethod("")
                  }}
                  className={inputCls}
                >
                  <option value="">{t("requests.form.flowPlaceholder")}</option>
                  {flows.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.name}
                    </option>
                  ))}
                </select>
              )}
            </Field>
          )}

          {/* Existing test (MODIFY_TEST / DELETE_TEST) */}
          {needsExistingTest && <TestSelector flowId={flowId} value={testMethod} onChange={setTestMethod} />}

          {/* New test name (ADD_TEST) */}
          {needsNewTest && (
            <Field label={t("requests.form.testName")} required>
              <input
                type="text"
                value={testMethod}
                onChange={(e) => setTestMethod(e.target.value)}
                placeholder={t("requests.form.testNamePlaceholder")}
                className={inputCls}
              />
            </Field>
          )}

          {/* Delete confirmation callout */}
          {isDelete && (
            <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
              <svg className="mt-0.5 size-4 shrink-0 text-warning" viewBox="0 0 20 20" fill="currentColor">
                <path
                  fillRule="evenodd"
                  d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 5zm0 9a1 1 0 100-2 1 1 0 000 2z"
                />
              </svg>
              <p className="text-[13px] text-amber-800">{t("requests.form.deleteWarning")}</p>
            </div>
          )}

          {/* Shared change fields */}
          {!isDelete && type !== "ADD_FLOW" && (
            <>
              <Field label={t("requests.form.description")} required={type === "ADD_TEST"}>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={3}
                  placeholder={t("requests.form.changeDescPlaceholder")}
                  className={cx(inputCls, "resize-none")}
                />
              </Field>
              <Field label={t("requests.detail.expectedBehavior")}>
                <textarea
                  value={expectedBehavior}
                  onChange={(e) => setExpectedBehavior(e.target.value)}
                  rows={2}
                  placeholder={t("requests.form.expectedPlaceholder")}
                  className={cx(inputCls, "resize-none")}
                />
              </Field>
              <Field label={t("requests.detail.steps")}>
                <StepList steps={steps} onChange={setSteps} />
              </Field>
            </>
          )}

          {/* Reason */}
          {needsReason && (
            <Field label={t("requests.form.reason")} required={isDelete}>
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={2}
                placeholder={t("requests.form.reasonPlaceholder")}
                className={cx(inputCls, "resize-none")}
              />
            </Field>
          )}
        </div>

        {/* ADD_FLOW: requested tests */}
        {type === "ADD_FLOW" && (
          <>
            <div className="mb-4 mt-7 flex items-center gap-3">
              <div className="h-px flex-1 bg-slate-100" />
              <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400">
                {t("requests.form.testsN", { count: draftTests.length })}
              </p>
              <div className="h-px flex-1 bg-slate-100" />
            </div>
            <div className="space-y-4">
              {draftTests.map((test, i) => (
                <TestBlock
                  key={test.key}
                  test={test}
                  index={i}
                  total={draftTests.length}
                  onUpdate={(updated) =>
                    setDraftTests((prev) => prev.map((d) => (d.key === updated.key ? updated : d)))
                  }
                  onRemove={() => setDraftTests((prev) => prev.filter((d) => d.key !== test.key))}
                />
              ))}
            </div>
            <button
              type="button"
              onClick={() => setDraftTests((prev) => [...prev, makeDraftTest(nextKey.current++)])}
              className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-slate-200 py-3 text-[13px] font-medium text-slate-500 transition-colors hover:border-brand-300 hover:text-brand-300"
            >
              <span className="flex size-5 items-center justify-center rounded-full border border-current text-base leading-none">
                +
              </span>
              {t("requests.form.addTest")}
            </button>
          </>
        )}

        <div className="mt-6 flex items-center justify-end gap-3 border-t border-slate-100 pt-5">
          <Button variant="ghost" size="sm" onClick={onCancel} disabled={submitting}>
            {t("common.cancel")}
          </Button>
          <Button variant="primary" size="sm" loading={submitting} onClick={() => void handleSubmit()}>
            {t("requests.form.submit")}
          </Button>
        </div>
      </Card>
    </div>
  )
}

/** Loads a flow's real test methods for the MODIFY_TEST / DELETE_TEST selector. */
function TestSelector({
  flowId,
  value,
  onChange,
}: {
  flowId: number | null
  value: string
  onChange: (v: string) => void
}) {
  const { t } = useLang()
  const [tests, setTests] = useState<string[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (flowId == null) {
      setTests(null)
      setError(null)
      return
    }
    let alive = true
    setTests(null)
    setError(null)
    apiFlowTests(flowId)
      .then((rows) => {
        if (!alive) return
        setTests(rows.map((r) => r.test_method))
      })
      .catch(() => {
        if (!alive) return
        setError(t("requests.form.testsLoadFailed"))
      })
    return () => {
      alive = false
    }
  }, [flowId, t])

  if (flowId == null) return null
  return (
    <Field label={t("requests.form.selectTest")} required>
      {error ? (
        <p className="text-[13px] text-error">{error}</p>
      ) : tests == null ? (
        <div className="flex items-center gap-2 py-2 text-[13px] text-slate-400">
          <span className="inline-block size-3.5 animate-spin rounded-full border-2 border-slate-200 border-t-brand-400" />
          {t("common.loading")}
        </div>
      ) : (
        <select value={value} onChange={(e) => onChange(e.target.value)} className={inputCls}>
          <option value="">{t("requests.form.testPlaceholder")}</option>
          {tests.map((tm) => (
            <option key={tm} value={tm}>
              {tm}
            </option>
          ))}
        </select>
      )}
    </Field>
  )
}

/* ------------------------------------------------------------------ */
/* List rows                                                           */
/* ------------------------------------------------------------------ */

function RequestRow({ request, onView }: { request: RequestView; onView: () => void }) {
  const { t } = useLang()
  return (
    <tr className="group border-t border-slate-100 transition-colors hover:bg-slate-50/60">
      <td className="px-4 py-3.5">
        <button type="button" onClick={onView} className="flex flex-col text-start">
          <span className="font-mono text-[12px] font-semibold text-brand-300 group-hover:text-brand-400">
            #{request.id}
          </span>
          <span className="mt-0.5 text-[13px] font-medium text-navy">
            {request.flowName ?? (request.flowId != null ? `#${request.flowId}` : "—")}
            {request.testMethod ? ` · ${request.testMethod}` : ""}
          </span>
        </button>
      </td>
      <td className="px-4 py-3.5">
        <TypeChip type={request.type} />
      </td>
      <td className="px-4 py-3.5">
        <StatusBadge status={request.status} />
      </td>
      <td className="hidden max-w-[220px] px-4 py-3.5 xl:table-cell">
        <p className="line-clamp-1 text-[13px] text-slate-500">
          {request.description ?? request.tests[0]?.description ?? "—"}
        </p>
      </td>
      <td className="px-4 py-3.5 text-[13px] text-slate-400">{formatStamp(request.createdAt)}</td>
      <td className="px-4 py-3.5 text-end">
        <Button variant="ghost" size="sm" onClick={onView}>
          {t("common.view")}
        </Button>
      </td>
    </tr>
  )
}

function RequestCard({ request, onView }: { request: RequestView; onView: () => void }) {
  const { t } = useLang()
  return (
    <Card className="p-4" interactive onClick={onView}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-mono text-[11px] text-brand-300">#{request.id}</p>
          <p className="mt-0.5 truncate text-[14px] font-semibold text-navy">
            {request.flowName ?? (request.flowId != null ? `#${request.flowId}` : "—")}
            {request.testMethod ? ` · ${request.testMethod}` : ""}
          </p>
        </div>
        <StatusBadge status={request.status} />
      </div>
      <div className="mt-2 flex items-center gap-2">
        <TypeChip type={request.type} />
      </div>
      {(request.description || request.tests[0]?.description) && (
        <p className="mt-2 line-clamp-1 text-[13px] text-slate-500">
          {request.description ?? request.tests[0]?.description}
        </p>
      )}
      <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-3">
        <span className="text-[12px] text-slate-400">
          {t("requests.detail.submittedAt", { time: formatStamp(request.createdAt) })}
        </span>
        <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); onView() }}>
          {t("common.view")}
        </Button>
      </div>
    </Card>
  )
}

/* ------------------------------------------------------------------ */
/* Page                                                                */
/* ------------------------------------------------------------------ */

const STATUS_FILTERS: { key: string; labelKey: string | null }[] = [
  { key: "ALL", labelKey: null },
  { key: "PENDING", labelKey: "requests.status.pending" },
  { key: "APPROVED", labelKey: "requests.status.approved" },
  { key: "REJECTED", labelKey: "requests.status.rejected" },
  { key: "IMPLEMENTED", labelKey: "requests.status.implemented" },
  { key: "CANCELLED", labelKey: "requests.status.cancelled" },
]

export function Requests({
  active = "requests",
  onSelect = () => {},
  initialType,
  initialFlowId,
  initialConsumed,
}: {
  active?: string
  onSelect?: (k: string) => void
  /** Opening from the Flows page can preselect a request type. */
  initialType?: AssetRequestType
  initialFlowId?: number
  initialConsumed?: () => void
}) {
  const { t } = useLang()
  const { user, logout } = useAuth()
  const clientId = user?.clientId ?? null

  const [statusFilter, setStatusFilter] = useState<string>("ALL")
  const [requests, setRequests] = useState<RequestView[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [view, setView] = useState<"list" | "new">(initialType ? "new" : "list")
  const requestSeq = useRef(0)

  const reload = useCallback(async () => {
    if (clientId == null) return
    const seq = ++requestSeq.current
    setLoading(true)
    setError(null)
    try {
      const rows = await apiListAssetRequests(clientId)
      if (seq !== requestSeq.current) return
      setRequests(rows.map(toView))
    } catch (err) {
      if (seq !== requestSeq.current) return
      if (err instanceof ApiError && err.status === 401) {
        logout()
        return
      }
      setError(err instanceof ApiError ? err.message : t("common.somethingWentWrong"))
    } finally {
      if (seq === requestSeq.current) setLoading(false)
    }
  }, [clientId, logout, t])

  useEffect(() => {
    if (clientId != null) void reload()
  }, [clientId, reload])

  const filtered = useMemo(
    () => (statusFilter === "ALL" ? requests : requests.filter((r) => r.status === statusFilter)),
    [requests, statusFilter],
  )
  const pendingCount = useMemo(() => requests.filter((r) => r.status === "PENDING").length, [requests])
  const selected = useMemo(() => requests.find((r) => r.id === selectedId) ?? null, [requests, selectedId])

  function openDetail(id: number) {
    setSelectedId(id)
  }

  function backToList() {
    setSelectedId(null)
  }

  function submitted() {
    setView("list")
    void reload()
  }

  /* Not linked to a client (e.g. ADMIN viewing the client shell). */
  if (clientId == null) {
    return (
      <div className="space-y-6">
        <WorkspaceHeader active={active} onSelect={onSelect} />
        <Card>
          <ErrorState title={t("dashboard.noClientLinked")} description={t("flows.noClientDesc")} />
        </Card>
      </div>
    )
  }

  if (selected) {
    return (
      <div className="space-y-6">
        <WorkspaceHeader active={active} onSelect={onSelect} />
        <RequestDetail
          request={selected}
          clientId={clientId}
          onCancelled={() => {
            setSelectedId(null)
            void reload()
          }}
          onBack={backToList}
          onUnauthorized={logout}
        />
      </div>
    )
  }

  if (view === "new") {
    return (
      <div className="space-y-6">
        <WorkspaceHeader active={active} onSelect={onSelect} />
        <NewRequestForm
          clientId={clientId}
          initialType={initialType}
          initialFlowId={initialFlowId}
          onSubmitted={submitted}
          onCancel={() => {
            setView("list")
            initialConsumed?.()
          }}
          onUnauthorized={logout}
        />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <WorkspaceHeader active={active} onSelect={onSelect} />

      {/* Page header */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-brand-300">
            {t("requests.eyebrow")}
          </p>
          <h1 className="mt-1 font-display text-2xl font-bold tracking-tight text-navy">{t("requests.title")}</h1>
          <p className="mt-1 text-[13px] text-slate-500">{t("requests.subtitle")}</p>
        </div>
        <Button
          variant="primary"
          onClick={() => {
            initialConsumed?.()
            setView("new")
          }}
          icon={<span className="text-base leading-none">+</span>}
        >
          {t("requests.newRequest")}
        </Button>
      </div>

      {/* Pending summary */}
      {pendingCount > 0 && (
        <div className="flex items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
          <svg className="size-4 shrink-0 text-warning" viewBox="0 0 20 20" fill="currentColor">
            <path
              fillRule="evenodd"
              d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 002 0V6zm-1 7a1 1 0 100 2 1 1 0 000-2z"
            />
          </svg>
          <p className="text-[13px] font-medium text-amber-800">
            {t("requests.pendingBanner", { count: pendingCount })}
          </p>
        </div>
      )}

      {/* Status filters */}
      <div className="inline-flex flex-wrap items-center gap-1 rounded-lg bg-slate-100 p-1">
        {STATUS_FILTERS.map(({ key, labelKey }) => (
          <button
            key={key}
            type="button"
            onClick={() => setStatusFilter(key)}
            className={cx(
              "rounded-md px-3 py-1.5 text-[13px] font-medium transition-all",
              statusFilter === key ? "bg-surface text-brand-300 shadow-sm" : "text-slate-500 hover:text-slate-700",
            )}
          >
            {labelKey ? t(labelKey) : t("requests.filter.all")}
          </button>
        ))}
      </div>

      {/* Loading / error / empty / list */}
      {loading ? (
        <div className="space-y-3">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
      ) : error ? (
        <Card>
          <ErrorState title={t("requests.loadFailedTitle")} description={error} />
          <div className="flex justify-center pb-5">
            <Button variant="secondary" size="sm" onClick={() => void reload()}>
              {t("common.retry")}
            </Button>
          </div>
        </Card>
      ) : requests.length === 0 ? (
        <Card className="flex flex-col items-center justify-center px-6 py-16 text-center">
          <div className="flex size-14 items-center justify-center rounded-xl bg-slate-100 text-slate-400">
            <svg className="size-7" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
              />
            </svg>
          </div>
          <p className="mt-4 font-display text-base font-bold text-navy">{t("requests.emptyTitle")}</p>
          <p className="mt-1 max-w-sm text-[13px] text-slate-500">{t("requests.emptyDesc")}</p>
          <Button
            variant="primary"
            className="mt-5"
            onClick={() => setView("new")}
            icon={<span className="text-base leading-none">+</span>}
          >
            {t("requests.createRequest")}
          </Button>
        </Card>
      ) : filtered.length === 0 ? (
        <Card className="flex flex-col items-center justify-center px-6 py-16 text-center">
          <span className="flex size-12 items-center justify-center rounded-xl bg-slate-100 text-slate-400">
            <svg className="size-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
            </svg>
          </span>
          <p className="mt-4 font-display text-base font-bold text-navy">{t("requests.noMatchTitle")}</p>
          <Button variant="secondary" size="sm" className="mt-4" onClick={() => setStatusFilter("ALL")}>
            {t("requests.filter.viewAll")}
          </Button>
        </Card>
      ) : (
        <>
          <Card className="hidden overflow-hidden lg:block">
            <table className="w-full">
              <thead>
                <tr className="text-start text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                  <th className="px-4 py-3 font-semibold">{t("requests.col.target")}</th>
                  <th className="px-4 py-3 font-semibold">{t("requests.col.type")}</th>
                  <th className="px-4 py-3 font-semibold">{t("requests.col.status")}</th>
                  <th className="hidden px-4 py-3 font-semibold xl:table-cell">{t("requests.col.description")}</th>
                  <th className="px-4 py-3 font-semibold">{t("requests.col.submitted")}</th>
                  <th className="px-4 py-3 text-end font-semibold">{t("requests.col.action")}</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => (
                  <RequestRow key={r.id} request={r} onView={() => openDetail(r.id)} />
                ))}
              </tbody>
            </table>
          </Card>
          <div className="space-y-4 lg:hidden">
            {filtered.map((r) => (
              <RequestCard key={r.id} request={r} onView={() => openDetail(r.id)} />
            ))}
          </div>
        </>
      )}

    </div>
  )
}

export default Requests
