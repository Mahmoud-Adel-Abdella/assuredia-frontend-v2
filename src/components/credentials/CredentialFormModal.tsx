import React, { useMemo, useState } from "react"
import { cx, Modal, PasswordInput, Select } from "../primitives"
import { useLang } from "../../lib/i18n"
import { IconLock } from "../planner/AiIcons"
import {
  toCreateRequest,
  toUpdateRequest,
  validateCredentialForm,
  type CredentialFormErrors,
  type CredentialFormValues,
} from "../../lib/credentials"
import type {
  ApiError,
  CredentialType,
  CredentialView,
} from "../../lib/api"

/* ------------------------------------------------------------------ */
/* Credential form (Add/Edit) — [IMPROVISED_MISSING_FIGMA]: the Figma  */
/* export's Add-Credential modal is a "coming soon" placeholder, so this*/
/* is composed from the design system's Modal/Input/Select/PasswordInput*/
/* primitives and matches the Figma visual language (rounded cards,      */
/* amber protection notice, brand buttons). The only place in the UI    */
/* where a password may be typed (PR10C.5 Phase 2 constraint).          */
/* ------------------------------------------------------------------ */

const TYPE_OPTIONS: { value: CredentialType; labelKey: string }[] = [
  { value: "USER_ACCOUNT", labelKey: "settings.credentials.typeUserAccount" },
  { value: "API_SERVICE", labelKey: "settings.credentials.typeApiService" },
]

export function CredentialFormModal({
  open,
  mode,
  credential,
  saving,
  error,
  onSubmit,
  onClose,
}: {
  open: boolean
  mode: "create" | "edit"
  /** The credential being edited; null on create. */
  credential: CredentialView | null
  saving: boolean
  /** Inline mapped error from the last submit attempt, if any. */
  error: { message: string; field?: string } | null
  onSubmit: (values: CredentialFormValues) => void
  onClose: () => void
}) {
  const { t } = useLang()

  const [values, setValues] = useState<CredentialFormValues>(() =>
    initialValues(credential),
  )
  const [fieldErrors, setFieldErrors] = useState<CredentialFormErrors>({})

  // Re-seed when switching between credentials while the modal stays open.
  const editId = credential?.id ?? null
  React.useEffect(() => {
    if (open) {
      setValues(initialValues(credential))
      setFieldErrors({})
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editId])

  const validationCopy = useMemo(
    () => ({
      nameRequired: t("credentials.form.nameRequired"),
      nameTooLong: t("credentials.form.nameTooLong"),
      usernameRequired: t("credentials.form.usernameRequired"),
      passwordRequired: t("credentials.form.passwordRequired"),
    }),
    [t],
  )

  function set<K extends keyof CredentialFormValues>(
    key: K,
    value: CredentialFormValues[K],
  ) {
    setValues((prev) => ({ ...prev, [key]: value }))
  }

  function submit() {
    const found = validateCredentialForm(values, mode, validationCopy)
    setFieldErrors(found)
    if (Object.keys(found).length === 0) onSubmit(values)
  }

  return (
    <Modal
      isOpen={open}
      onClose={saving ? () => {} : onClose}
      title={t(mode === "create" ? "credentials.form.addTitle" : "credentials.form.editTitle")}
      size="sm"
    >
      {/* Protection notice — the Figma modal's amber banner, kept verbatim in spirit. */}
      <div className="mb-4 flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 dark:border-amber-500/20 dark:bg-amber-500/[0.06]">
        <IconLock className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-400" />
        <p className="text-[12px] text-amber-700 dark:text-amber-300">
          {t(mode === "create" ? "credentials.form.addNotice" : "credentials.form.editNotice")}
        </p>
      </div>

      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault()
          submit()
        }}
      >
        <label className="block">
          <span className="mb-1.5 block text-[12px] font-semibold text-slate-600 dark:text-slate-300">
            {t("credentials.form.name")}
          </span>
          <input
            value={values.name}
            onChange={(e) => set("name", e.target.value)}
            placeholder="Customer Login"
            maxLength={121}
            autoFocus
            className={cx(
              "w-full rounded-lg border bg-white px-3 py-2 text-[13px] text-slate-800 outline-none transition-colors placeholder:text-slate-400",
              "focus:border-brand-400 focus:ring-2 focus:ring-brand-400/20",
              "dark:bg-slate-900 dark:text-white dark:placeholder:text-white/25",
              fieldErrors.name != null || error?.field === "name"
                ? "border-red-300 dark:border-red-500/40"
                : "border-slate-200 dark:border-white/10",
            )}
          />
          <p className="mt-1 text-[11px] text-slate-400 dark:text-slate-500">
            {t("credentials.form.nameHint")}
          </p>
          {fieldErrors.name != null && (
            <p className="mt-1 text-[11px] font-medium text-red-600 dark:text-red-400">
              {fieldErrors.name}
            </p>
          )}
        </label>

        <label className="block">
          <span className="mb-1.5 block text-[12px] font-semibold text-slate-600 dark:text-slate-300">
            {t("credentials.form.type")}
          </span>
          <Select
            value={values.type}
            onChange={(e) =>
              set("type", e.target.value as CredentialType)
            }
            options={TYPE_OPTIONS.map((o) => ({
              value: o.value,
              label: t(o.labelKey),
            }))}
          />
        </label>

        <label className="block">
          <span className="mb-1.5 block text-[12px] font-semibold text-slate-600 dark:text-slate-300">
            {t("credentials.form.username")}
          </span>
          <input
            value={values.username}
            onChange={(e) => set("username", e.target.value)}
            autoComplete="off"
            dir="ltr"
            placeholder={
              mode === "edit" && credential?.usernameMasked
                ? credential.usernameMasked
                : undefined
            }
            className={cx(
              "w-full rounded-lg border bg-white px-3 py-2 text-[13px] text-slate-800 outline-none transition-colors",
              "focus:border-brand-400 focus:ring-2 focus:ring-brand-400/20",
              "dark:bg-slate-900 dark:text-white",
              fieldErrors.username != null || error?.field === "username"
                ? "border-red-300 dark:border-red-500/40"
                : "border-slate-200 dark:border-white/10",
            )}
          />
          {fieldErrors.username != null && (
            <p className="mt-1 text-[11px] font-medium text-red-600 dark:text-red-400">
              {fieldErrors.username}
            </p>
          )}
        </label>

        <label className="block">
          <span className="mb-1.5 block text-[12px] font-semibold text-slate-600 dark:text-slate-300">
            {t(mode === "create" ? "credentials.form.password" : "credentials.form.passwordNew")}
          </span>
          <PasswordInput
            value={values.password}
            onChange={(e) => set("password", e.target.value)}
            autoComplete="new-password"
            placeholder="••••••••"
          />
          {fieldErrors.password != null && (
            <p className="mt-1 text-[11px] font-medium text-red-600 dark:text-red-400">
              {fieldErrors.password}
            </p>
          )}
        </label>

        {error != null && (
          <p className="rounded-lg bg-red-50 px-3 py-2 text-[12px] font-medium text-red-600 dark:bg-red-500/10 dark:text-red-400">
            {error.message}
          </p>
        )}

        <div className="flex justify-end gap-2 pt-1">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="rounded-lg border border-slate-200 px-4 py-2 text-[13px] font-medium text-slate-600 transition-colors hover:bg-slate-50 disabled:opacity-50 dark:border-white/10 dark:text-slate-300 dark:hover:bg-white/[0.05]"
          >
            {t("credentials.form.cancel")}
          </button>
          <button
            type="submit"
            disabled={saving}
            className="rounded-lg bg-brand-900 px-4 py-2 text-[13px] font-semibold text-white transition-colors hover:bg-brand-700 disabled:opacity-50"
          >
            {saving ? t("common.loading") : t("credentials.form.save")}
          </button>
        </div>
      </form>
    </Modal>
  )
}

function initialValues(credential: CredentialView | null): CredentialFormValues {
  return {
    name: credential?.name ?? "",
    type: credential?.type ?? "USER_ACCOUNT",
    username: "",
    password: "",
  }
}
