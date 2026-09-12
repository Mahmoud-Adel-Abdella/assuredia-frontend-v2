import React, { useCallback, useEffect, useMemo, useState } from "react"
import { cx, Button, Card, ErrorState, Modal, Spinner, useToast } from "../primitives"
import { useLang, langLocale } from "../../lib/i18n"
import { IconLock } from "../planner/AiIcons"
import {
  ApiError,
  apiCreateCredential,
  apiDeleteCredential,
  apiListCredentials,
  apiTestCredential,
  apiUpdateCredential,
  type CredentialTestResult,
  type CredentialView,
} from "../../lib/api"
import {
  credentialStats,
  formatLastUsed,
  mapCredentialError,
  testResultMessage,
  toCreateRequest,
  toUpdateRequest,
  type CredentialFormValues,
} from "../../lib/credentials"
import { CredentialFormModal } from "./CredentialFormModal"

/* ------------------------------------------------------------------ */
/* Settings → Secure Credentials (PR10C.5 Phase 2).                    */
/* Adapted from the Figma Make export (Settings: SecureCredentials-     */
/* Section). Layout, stats cards, expandable rows, and protection       */
/* notices preserved; the mock data replaced by the frozen Phase 1      */
/* backend contract, the placeholder modal replaced by the real          */
/* CredentialFormModal, and window.confirm replaced by a proper delete   */
/* confirmation dialog.                                                 */
/*                                                                      */
/* Adapted from Figma Make export (Assuredia UI (7).zip);               */
/* originals retained in the Figma source, not in this repo.            */
/* ------------------------------------------------------------------ */

export function CredentialsSection({
  clientId,
  onUnauthorized,
}: {
  clientId: number
  onUnauthorized: () => void
}) {
  const { t } = useLang()
  const toast = useToast()

  const [credentials, setCredentials] = useState<CredentialView[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<number | null>(null)

  // Form state (Add/Edit)
  const [formOpen, setFormOpen] = useState(false)
  const [formMode, setFormMode] = useState<"create" | "edit">("create")
  const [formCredential, setFormCredential] = useState<CredentialView | null>(null)
  const [formSaving, setFormSaving] = useState(false)
  const [formError, setFormError] = useState<{ message: string; field?: string } | null>(null)

  // Delete state
  const [deleteTarget, setDeleteTarget] = useState<CredentialView | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  // Per-row connection-test state
  const [testingId, setTestingId] = useState<number | null>(null)
  const [testResult, setTestResult] = useState<{
    id: number
    result: CredentialTestResult
  } | null>(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      const list = await apiListCredentials(clientId)
      setCredentials(list)
      setLoadError(null)
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        onUnauthorized()
        return
      }
      setLoadError(
        err instanceof ApiError && err.status === 503
          ? t("settings.credentials.unavailable503")
          : t("common.loadFailed"),
      )
    } finally {
      setLoading(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId, onUnauthorized])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const stats = useMemo(() => credentialStats(credentials), [credentials])

  const errorCopy = useMemo(
    () => ({
      validation: t("credentials.form.errorValidation"),
      conflict: t("credentials.form.errorConflict"),
      notFound: t("credentials.form.errorNotFound"),
      unavailable: t("credentials.form.errorUnavailable"),
      network: t("credentials.form.errorNetwork"),
      fallback: t("credentials.form.errorFallback"),
    }),
    [t],
  )

  /* ── CRUD handlers ─────────────────────────────────────────────── */

  function openCreate() {
    setFormMode("create")
    setFormCredential(null)
    setFormError(null)
    setFormOpen(true)
  }

  function openEdit(credential: CredentialView) {
    setFormMode("edit")
    setFormCredential(credential)
    setFormError(null)
    setFormOpen(true)
  }

  async function submitForm(values: CredentialFormValues) {
    setFormSaving(true)
    setFormError(null)
    try {
      if (formMode === "create") {
        await apiCreateCredential(clientId, toCreateRequest(values))
      } else if (formCredential != null) {
        await apiUpdateCredential(
          clientId,
          formCredential.id,
          toUpdateRequest(values),
        )
      }
      setFormOpen(false)
      await refresh()
      toastSuccess(t("credentials.form.saved"))
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        onUnauthorized()
        return
      }
      const mapped = mapCredentialError(err, errorCopy)
      setFormError({ message: mapped.message, field: mapped.field })
    } finally {
      setFormSaving(false)
    }
  }

  async function confirmDelete() {
    if (deleteTarget == null) return
    setDeleting(true)
    setDeleteError(null)
    try {
      await apiDeleteCredential(clientId, deleteTarget.id)
      setDeleteTarget(null)
      setExpanded(null)
      await refresh()
      toastSuccess(t("credentials.delete.success"))
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        onUnauthorized()
        return
      }
      const mapped = mapCredentialError(err, errorCopy)
      setDeleteError(mapped.message)
    } finally {
      setDeleting(false)
    }
  }

  async function runTest(credential: CredentialView) {
    setTestingId(credential.id)
    setTestResult(null)
    try {
      const result = await apiTestCredential(clientId, credential.id)
      setTestResult({ id: credential.id, result })
      if (!result.success) await refresh()
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        onUnauthorized()
        return
      }
      const mapped = mapCredentialError(err, errorCopy)
      setTestResult({
        id: credential.id,
        result: { success: false, message: mapped.message },
      })
    } finally {
      setTestingId(null)
    }
  }

  function toastSuccess(title: string) {
    toast({ title, variant: "success" })
  }

  /* ── Render ────────────────────────────────────────────────────── */

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="font-display text-[17px] font-bold text-navy">
            {t("settings.credentials.eyebrow")}
          </h2>
          <p className="mt-1 text-[13px] text-slate-500">
            {t("settings.credentials.subtitle")}
          </p>
        </div>
        <Button variant="primary" size="sm" onClick={openCreate}>
          <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
          {t("settings.credentials.addCredential")}
        </Button>
      </div>

      {/* Security notice */}
      <div className="flex items-start gap-3 rounded-xl border border-brand-200/50 bg-brand-50/30 px-4 py-3 dark:border-brand-400/20 dark:bg-brand-500/[0.04]">
        <IconLock className="mt-0.5 size-4 shrink-0 text-brand-300" />
        <div>
          <p className="text-[12px] font-semibold text-brand-300">
            {t("settings.credentials.noticeTitle")}
          </p>
          <p className="mt-0.5 text-[12px] text-slate-500 dark:text-slate-400">
            {t("settings.credentials.noticeBody")}
          </p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Card className="px-4 py-3">
          <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-slate-400">
            {t("settings.credentials.statTotal")}
          </p>
          <p className="mt-1 text-2xl font-bold text-navy">{stats.total}</p>
          <p className="text-[12px] text-slate-400">
            {t("settings.credentials.statTotalHint")}
          </p>
        </Card>
        <Card className="px-4 py-3">
          <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-slate-400">
            {t("settings.credentials.statConfigured")}
          </p>
          <p className="mt-1 text-2xl font-bold text-emerald-600">{stats.configured}</p>
          <p className="text-[12px] text-slate-400">
            {t("settings.credentials.statConfiguredHint")}
          </p>
        </Card>
        <Card className="px-4 py-3">
          <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-slate-400">
            {t("settings.credentials.statNeedsSetup")}
          </p>
          <p className="mt-1 text-2xl font-bold text-amber-600">{stats.needsSetup}</p>
          <p className="text-[12px] text-slate-400">
            {t("settings.credentials.statNeedsSetupHint")}
          </p>
        </Card>
      </div>

      {/* List */}
      {loading ? (
        <div className="flex items-center justify-center gap-2.5 rounded-xl border border-slate-200 bg-surface px-6 py-14 text-[13px] text-slate-500">
          <Spinner size="sm" className="text-brand-400" />
          {t("common.loading")}
        </div>
      ) : loadError != null ? (
        <Card>
          <ErrorState
            title={t("common.loadFailed")}
            description={loadError}
            onRetry={() => {
              setLoading(true)
              void refresh()
            }}
          />
        </Card>
      ) : credentials.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-12 text-center">
          <div className="flex size-12 items-center justify-center rounded-full bg-slate-100 dark:bg-white/[0.06]">
            <IconLock className="size-6 text-slate-400" />
          </div>
          <div>
            <p className="font-semibold text-navy">
              {t("settings.credentials.emptyTitle")}
            </p>
            <p className="mt-1 text-[13px] text-slate-400">
              {t("settings.credentials.emptyBody")}
            </p>
          </div>
          <Button variant="primary" size="sm" onClick={openCreate}>
            {t("settings.credentials.addCredential")}
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          {credentials.map((cred) => (
            <CredentialRow
              key={cred.id}
              credential={cred}
              expanded={expanded === cred.id}
              onToggle={() => setExpanded(expanded === cred.id ? null : cred.id)}
              onEdit={() => openEdit(cred)}
              onDelete={() => setDeleteTarget(cred)}
              onTest={() => void runTest(cred)}
              testing={testingId === cred.id}
              testResult={testResult?.id === cred.id ? testResult.result : null}
            />
          ))}
        </div>
      )}

      {/* Add/Edit modal */}
      <CredentialFormModal
        open={formOpen}
        mode={formMode}
        credential={formCredential}
        saving={formSaving}
        error={formError}
        // The async submitForm is passed directly so the modal's F-02 latch
        // holds until the POST settles (not just until the next render).
        onSubmit={submitForm}
        onClose={() => setFormOpen(false)}
      />

      {/* Delete confirmation (FIX 3: proper dialog, not window.confirm) */}
      <Modal
        isOpen={deleteTarget != null}
        onClose={() => setDeleteTarget(null)}
        title={t("credentials.delete.title")}
        variant="danger"
        size="sm"
      >
        <p className="text-[13px] text-slate-600 dark:text-slate-300">
          <strong className="text-navy dark:text-white">{deleteTarget?.name}</strong>
          {" — "}
          {t("credentials.delete.body")}
        </p>
        {deleteError != null && (
          <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-[12px] font-medium text-red-600 dark:bg-red-500/10 dark:text-red-400">
            {deleteError}
          </p>
        )}
        <div className="mt-5 flex justify-end gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setDeleteTarget(null)}
            disabled={deleting}
          >
            {t("credentials.delete.cancel")}
          </Button>
          <Button
            variant="danger"
            size="sm"
            onClick={() => void confirmDelete()}
            disabled={deleting}
          >
            {deleting ? t("common.loading") : t("credentials.delete.confirm")}
          </Button>
        </div>
      </Modal>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* One expandable credential row (Figma layout preserved)              */
/* ------------------------------------------------------------------ */

function CredentialRow({
  credential,
  expanded,
  onToggle,
  onEdit,
  onDelete,
  onTest,
  testing,
  testResult,
}: {
  credential: CredentialView
  expanded: boolean
  onToggle: () => void
  onEdit: () => void
  onDelete: () => void
  onTest: () => void
  testing: boolean
  testResult: CredentialTestResult | null
}) {
  const { t } = useLang()
  const locale = langLocale()

  const statusKey =
    credential.status === "CONFIGURED"
      ? "settings.credentials.statusConfigured"
      : credential.status === "NEEDS_SETUP"
        ? "settings.credentials.statusNeedsSetup"
        : "settings.credentials.statusInvalid"
  const isConfigured = credential.status === "CONFIGURED"

  const lastUsed = formatLastUsed(credential, locale)

  return (
    <Card className="overflow-hidden">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center gap-4 px-5 py-4 text-left transition-colors hover:bg-slate-50 dark:hover:bg-white/[0.02]"
      >
        {/* Icon */}
        <div
          className={cx(
            "flex size-9 shrink-0 items-center justify-center rounded-lg",
            isConfigured
              ? "bg-brand-50 text-brand-400 dark:bg-brand-500/10 dark:text-brand-400"
              : "bg-slate-100 text-slate-400 dark:bg-white/[0.06]",
          )}
        >
          <IconLock className="size-4" />
        </div>

        {/* Info */}
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-navy dark:text-white">{credential.name}</p>
          <p className="text-[12px] text-slate-400">
            {credential.type === "API_SERVICE"
              ? t("settings.credentials.typeApiService")
              : t("settings.credentials.typeUserAccount")}
          </p>
        </div>

        {/* Status badge */}
        <span
          className={cx(
            "inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold",
            isConfigured
              ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400"
              : credential.status === "NEEDS_SETUP"
                ? "bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400"
                : "bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-400",
          )}
        >
          <span
            className={cx(
              "inline-block h-1.5 w-1.5 rounded-full",
              isConfigured
                ? "bg-emerald-500"
                : credential.status === "NEEDS_SETUP"
                  ? "bg-amber-400"
                  : "bg-red-500",
            )}
          />
          {t(statusKey)}
        </span>

        {/* Chevron */}
        <svg
          className={cx(
            "size-4 shrink-0 text-slate-400 transition-transform rtl:-scale-x-100",
            expanded && "rotate-180",
          )}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {/* Expanded detail */}
      {expanded && (
        <div className="border-t border-slate-100 px-5 py-4 dark:border-white/[0.06]">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-slate-400">
                {t("credentials.form.type")}
              </p>
              <p className="mt-0.5 text-[13px] text-navy dark:text-white">
                {credential.type === "API_SERVICE"
                  ? t("settings.credentials.typeApiService")
                  : t("settings.credentials.typeUserAccount")}
              </p>
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-slate-400">
                {t("credentials.form.username")}
              </p>
              <p className="mt-0.5 text-[13px] text-navy dark:text-white" dir="ltr">
                {credential.usernameMasked ?? "—"}
              </p>
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-slate-400">
                {t("settings.credentials.lastUsed")}
              </p>
              <p className="mt-0.5 text-[13px] text-navy dark:text-white">
                {lastUsed ?? t("settings.credentials.lastUsedNever")}
                {" · "}
                {t("settings.credentials.useCount", { count: credential.useCount })}
              </p>
            </div>
          </div>

          {/* Value protection notice (Figma copy kept) */}
          <div className="mt-4 flex items-center gap-2 rounded-lg bg-slate-50 px-3 py-2.5 dark:bg-white/[0.03]">
            <IconLock className="size-4 shrink-0 text-slate-400" />
            <p className="text-[12px] text-slate-500 dark:text-slate-400">
              {t("settings.credentials.noticeBody")}
            </p>
          </div>

          {/* Row actions */}
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <Button variant="secondary" size="sm" onClick={onTest} disabled={testing}>
              {testing ? (
                <span className="flex items-center gap-2">
                  <Spinner size="sm" />
                  {t("credentials.test.testing")}
                </span>
              ) : (
                t("credentials.test.action")
              )}
            </Button>
            <Button variant="ghost" size="sm" onClick={onEdit}>
              {t("credentials.row.edit")}
            </Button>
            <Button variant="ghost" size="sm" onClick={onDelete}>
              {t("credentials.row.remove")}
            </Button>
          </div>

          {/* Test result (FIX 4) */}
          {testResult != null && (
            <div
              className={cx(
                "mt-3 rounded-lg px-3 py-2.5 text-[12px]",
                testResult.success
                  ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400"
                  : "bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400",
              )}
            >
              <p className="font-semibold">
                {testResult.success
                  ? t("credentials.test.works")
                  : t("credentials.test.failed")}
              </p>
              {!testResult.success && (
                <>
                  <p className="mt-0.5">{testResult.message}</p>
                  <p className="mt-0.5">{t("credentials.test.invalidNote")}</p>
                </>
              )}
            </div>
          )}
        </div>
      )}
    </Card>
  )
}
