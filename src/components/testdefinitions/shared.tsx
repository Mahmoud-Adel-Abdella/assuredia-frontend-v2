import React from "react"
import { Card, cx } from "../primitives"
import { useLang } from "../../lib/i18n"
import { statusLabelKey } from "../../lib/testDefinitionLifecycle"
import type { SchemaFinding } from "../../lib/testDefinitionSchema"
import type { TestDefinitionStatus, TestDefinitionValidationFinding } from "../../lib/api"

/* ------------------------------------------------------------------ */
/* Lifecycle status badge                                              */
/* ------------------------------------------------------------------ */

/**
 * Lifecycle badges carry a coloured dot, a distinct glyph and the status word,
 * so the state is never conveyed by colour alone. The shades used here are the
 * ones `src/index.css` remaps for dark mode.
 */
const STATUS_STYLE: Record<
  TestDefinitionStatus,
  { bg: string; text: string; ring: string; dot: string; glyph: string }
> = {
  DRAFT: { bg: "bg-slate-100", text: "text-slate-600", ring: "ring-slate-400/20", dot: "bg-slate-400", glyph: "◻" },
  VALIDATED: { bg: "bg-brand-50", text: "text-brand-300", ring: "ring-brand-700/10", dot: "bg-brand-700", glyph: "✓" },
  APPROVED: { bg: "bg-amber-50", text: "text-amber-700", ring: "ring-amber-600/10", dot: "bg-warning", glyph: "★" },
  READY: { bg: "bg-emerald-50", text: "text-emerald-700", ring: "ring-emerald-600/10", dot: "bg-success", glyph: "●" },
  ARCHIVED: { bg: "bg-slate-100", text: "text-slate-500", ring: "ring-slate-400/10", dot: "bg-slate-300", glyph: "▣" },
}

export function LifecycleBadge({ status }: { status: TestDefinitionStatus }) {
  const { t } = useLang()
  const style = STATUS_STYLE[status] ?? STATUS_STYLE.DRAFT
  const label = t(statusLabelKey(status))
  return (
    <span
      data-testid={`testdef-status-${status}`}
      className={cx(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide ring-1 ring-inset",
        style.bg,
        style.text,
        style.ring,
      )}
    >
      <span className={cx("size-1.5 rounded-full", style.dot)} />
      <span aria-hidden="true">{style.glyph}</span>
      {label}
    </span>
  )
}

/* ------------------------------------------------------------------ */
/* Page chrome                                                         */
/* ------------------------------------------------------------------ */

export function BackButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="mb-3 inline-flex items-center gap-1.5 text-[13px] font-medium text-slate-400 transition-colors hover:text-brand-300"
    >
      <svg className="size-4 rtl:-scale-x-100" viewBox="0 0 20 20" fill="currentColor">
        <path
          fillRule="evenodd"
          d="M12.79 5.23a.75.75 0 01-.02 1.06L8.832 10l3.938 3.71a.75.75 0 11-1.04 1.08l-4.5-4.25a.75.75 0 010-1.08l4.5-4.25a.75.75 0 011.06.02z"
        />
      </svg>
      {label}
    </button>
  )
}

export function SectionHeading({ children }: { children: React.ReactNode }) {
  return <h2 className="pb-3 font-display text-sm font-bold text-navy">{children}</h2>
}

export function MetaRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-1.5">
      <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{label}</span>
      <span className="text-[13px] text-slate-700">{children}</span>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Form field primitives (mirrors the local helpers in CreateClient)   */
/* ------------------------------------------------------------------ */

export function FieldLabel({
  htmlFor,
  children,
  required,
}: {
  htmlFor: string
  children: React.ReactNode
  required?: boolean
}) {
  return (
    <label htmlFor={htmlFor} className="flex items-center gap-1 text-[12px] font-semibold text-slate-500">
      {children}
      {required && (
        <span className="text-error" aria-hidden="true">
          *
        </span>
      )}
    </label>
  )
}

export function FieldHint({ children }: { children: React.ReactNode }) {
  return <p className="text-[11px] text-slate-400">{children}</p>
}

export function FieldError({ id, children }: { id?: string; children: React.ReactNode }) {
  return (
    <p id={id} role="alert" className="flex items-center gap-1 text-[11px] text-error">
      <svg className="size-3 shrink-0" viewBox="0 0 20 20" fill="currentColor">
        <path
          fillRule="evenodd"
          d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z"
        />
      </svg>
      {children}
    </p>
  )
}

const inputBase =
  "block w-full rounded-lg border bg-elevated px-3.5 py-2.5 text-[13px] text-slate-700 placeholder-slate-400 transition-colors focus:outline-none focus:ring-2 focus:ring-brand-400 disabled:opacity-60"

export function TextInput({
  error,
  className,
  ...rest
}: React.InputHTMLAttributes<HTMLInputElement> & { error?: boolean }) {
  return (
    <input
      className={cx(inputBase, error ? "border-red-400" : "border-slate-200 hover:border-slate-300", className)}
      aria-invalid={error ? "true" : undefined}
      {...rest}
    />
  )
}

export function SelectInput({
  error,
  className,
  children,
  ...rest
}: React.SelectHTMLAttributes<HTMLSelectElement> & { error?: boolean }) {
  return (
    <select
      className={cx(inputBase, error ? "border-red-400" : "border-slate-200", className)}
      aria-invalid={error ? "true" : undefined}
      {...rest}
    >
      {children}
    </select>
  )
}

export function TextArea({
  error,
  className,
  ...rest
}: React.TextareaHTMLAttributes<HTMLTextAreaElement> & { error?: boolean }) {
  return (
    <textarea
      className={cx(inputBase, "resize-y", error ? "border-red-400" : "border-slate-200 hover:border-slate-300", className)}
      aria-invalid={error ? "true" : undefined}
      {...rest}
    />
  )
}

/** The JSON editor: a monospace textarea with spellcheck and autocorrect off. */
export function JsonEditor({
  error,
  className,
  ...rest
}: React.TextareaHTMLAttributes<HTMLTextAreaElement> & { error?: boolean }) {
  return (
    <TextArea
      error={error}
      spellCheck={false}
      autoCapitalize="off"
      autoCorrect="off"
      dir="ltr"
      className={cx("font-mono leading-relaxed", className)}
      {...rest}
    />
  )
}

/* ------------------------------------------------------------------ */
/* Validation findings                                                 */
/* ------------------------------------------------------------------ */

/** The engine and the local pre-check produce the same finding shape. */
type Finding = SchemaFinding | TestDefinitionValidationFinding

function FindingList({ findings, tone }: { findings: Finding[]; tone: "error" | "warning" }) {
  const { t } = useLang()
  return (
    <ul className="space-y-1.5">
      {findings.map((finding, index) => (
        <li key={`${finding.ruleId}-${finding.jsonPointer}-${index}`} className="flex gap-2">
          <code
            dir="ltr"
            className={cx(
              "shrink-0 rounded px-1.5 py-0.5 font-mono text-[11px]",
              tone === "error" ? "bg-red-50 text-red-700" : "bg-amber-50 text-amber-700",
            )}
          >
            {finding.jsonPointer || t("testdef.validation.atRoot")}
          </code>
          <span className="text-[12px] text-slate-600">{finding.message}</span>
        </li>
      ))}
    </ul>
  )
}

/**
 * Renders one validation report. Messages are rendered as text — the engine
 * sanitizes them, and React escapes them, so no server string is ever treated
 * as markup.
 */
export function ValidationFindings({
  title,
  hint,
  valid,
  errors,
  warnings,
  emptyLabel,
}: {
  title: string
  hint?: string
  valid: boolean
  errors: Finding[]
  warnings: Finding[]
  emptyLabel?: string
}) {
  const { t } = useLang()
  const hasFindings = errors.length > 0 || warnings.length > 0

  return (
    <Card className="p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <SectionHeading>{title}</SectionHeading>
        <div className="flex items-center gap-2 pb-3">
          {errors.length > 0 && (
            <span className="rounded-full bg-red-50 px-2 py-0.5 text-[11px] font-semibold text-red-700">
              {t("testdef.validation.errorCount", { count: errors.length })}
            </span>
          )}
          {warnings.length > 0 && (
            <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-700">
              {t("testdef.validation.warningCount", { count: warnings.length })}
            </span>
          )}
          {valid && errors.length === 0 && (
            <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">
              {t("testdef.validation.passed")}
            </span>
          )}
        </div>
      </div>
      {hint && <FieldHint>{hint}</FieldHint>}
      {hasFindings ? (
        <div className="mt-3 space-y-3">
          {errors.length > 0 && <FindingList findings={errors} tone="error" />}
          {warnings.length > 0 && <FindingList findings={warnings} tone="warning" />}
        </div>
      ) : (
        <p className="mt-2 text-[12px] text-slate-500">{emptyLabel ?? t("testdef.validation.passed")}</p>
      )}
    </Card>
  )
}

/** Formats a backend timestamp for display, or an em dash when absent. */
export function formatTimestamp(value: string | null | undefined, locale: string): string {
  if (!value) return "—"
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return "—"
  return date.toLocaleString(locale, {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  })
}
