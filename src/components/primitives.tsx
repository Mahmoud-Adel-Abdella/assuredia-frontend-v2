import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { useLang } from "../lib/i18n"

/* ------------------------------------------------------------------ */
/* Utility                                                             */
/* ------------------------------------------------------------------ */
export function cx(...parts: (string | false | null | undefined)[]) {
  return parts.filter(Boolean).join(" ")
}

/** Reactively tracks whether the `dark` class is present on <html>. */
export function useIsDark() {
  const [dark, setDark] = useState(
    () => typeof document !== "undefined" && document.documentElement.classList.contains("dark"),
  )
  useEffect(() => {
    const el = document.documentElement
    const update = () => setDark(el.classList.contains("dark"))
    update()
    const obs = new MutationObserver(update)
    obs.observe(el, { attributes: true, attributeFilter: ["class"] })
    return () => obs.disconnect()
  }, [])
  return dark
}

/* ------------------------------------------------------------------ */
/* Spinner                                                             */
/* ------------------------------------------------------------------ */
export function Spinner({ size = "md", className }: { size?: "sm" | "md" | "lg"; className?: string }) {
  const sz = { sm: "size-3.5", md: "size-4", lg: "size-5" }[size]
  return (
    <svg className={cx(sz, "animate-spin text-current", className)} viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  )
}

/* ------------------------------------------------------------------ */
/* Button                                                             */
/* ------------------------------------------------------------------ */
type ButtonVariant = "primary" | "secondary" | "ghost" | "outline" | "danger" | "success" | "link"
type ButtonSize = "sm" | "md" | "lg"

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant
  size?: ButtonSize
  icon?: React.ReactNode
  loading?: boolean
}

export function Button({
  variant = "secondary",
  size = "md",
  icon,
  loading,
  className,
  children,
  disabled,
  ...rest
}: ButtonProps) {
  const base =
    "inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:ring-offset-2 focus-visible:ring-offset-surface disabled:opacity-50 disabled:pointer-events-none whitespace-nowrap"
  const sizes: Record<ButtonSize, string> = {
    sm: "h-8 px-3 text-[13px]",
    md: "h-10 px-4 text-sm",
    lg: "h-11 px-5 text-[15px]",
  }
  const variants: Record<ButtonVariant, string> = {
    primary: "bg-brand-900 text-white shadow-sm hover:bg-brand-950 active:scale-[.98]",
    secondary: "bg-surface text-slate-700 border border-slate-200 hover:border-slate-300 hover:bg-slate-50 active:scale-[.98]",
    ghost: "text-slate-600 hover:bg-slate-100 hover:text-slate-900",
    outline: "border-2 border-brand-900 text-brand-300 hover:bg-brand-50 active:scale-[.98]",
    danger: "bg-error text-white shadow-sm hover:brightness-95 active:scale-[.98]",
    success: "bg-success text-white shadow-sm hover:brightness-95 active:scale-[.98]",
    link: "text-brand-300 underline-offset-4 hover:underline px-0 h-auto",
  }
  return (
    <button className={cx(base, sizes[size], variants[variant], className)} disabled={disabled || loading} {...rest}>
      {loading ? <Spinner size={size === "lg" ? "md" : "sm"} /> : icon}
      {children}
    </button>
  )
}

/* ------------------------------------------------------------------ */
/* IconButton                                                          */
/* ------------------------------------------------------------------ */
type IconButtonVariant = "ghost" | "secondary" | "danger" | "primary"

type IconButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  icon: React.ReactNode
  label: string
  variant?: IconButtonVariant
  size?: "sm" | "md" | "lg"
}

export function IconButton({ icon, label, variant = "ghost", size = "md", className, ...rest }: IconButtonProps) {
  const sz = { sm: "size-7", md: "size-9", lg: "size-10" }[size]
  const variants: Record<IconButtonVariant, string> = {
    ghost: "text-slate-400 hover:bg-slate-100 hover:text-slate-700",
    secondary: "border border-slate-200 text-slate-600 hover:border-slate-300 hover:bg-slate-50",
    danger: "text-slate-400 hover:bg-red-50 hover:text-error",
    primary: "bg-brand-900 text-white hover:bg-brand-950",
  }
  return (
    <button
      aria-label={label}
      title={label}
      className={cx("inline-flex items-center justify-center rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 disabled:opacity-50 disabled:pointer-events-none", sz, variants[variant], className)}
      {...rest}
    >
      {icon}
    </button>
  )
}

/* ------------------------------------------------------------------ */
/* Card                                                               */
/* ------------------------------------------------------------------ */
export function Card({
  className,
  children,
  interactive,
  ...rest
}: React.HTMLAttributes<HTMLDivElement> & { interactive?: boolean }) {
  return (
    <div
      className={cx(
        "rounded-[var(--radius-card)] border border-slate-200/80 bg-surface",
        interactive && "cursor-pointer transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md",
        className,
      )}
      style={{ boxShadow: "var(--shadow-card)" }}
      {...rest}
    >
      {children}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Status Badge                                                       */
/* ------------------------------------------------------------------ */
export type AppStatus =
  | "ACTIVE" | "INACTIVE" | "RUNNING" | "PASS" | "PASSED"
  | "FAILED" | "CANCELLED" | "SKIPPED" | "SCHEDULED" | "PAUSED"
  | "PENDING" | "RESOLVED" | "APPROVED" | "REJECTED"

/** @deprecated Use AppStatus */
export type RunStatus = "PASS" | "FAILED" | "RUNNING"

const STATUS_MAP: Record<AppStatus, { dot: string; text: string; bg: string; ring: string; labelKey: string; pulse?: boolean }> = {
  ACTIVE:    { dot: "bg-success", text: "text-emerald-700", bg: "bg-emerald-50", ring: "ring-emerald-600/10", labelKey: "status.active" },
  PASSED:    { dot: "bg-success", text: "text-emerald-700", bg: "bg-emerald-50", ring: "ring-emerald-600/10", labelKey: "status.passed" },
  PASS:      { dot: "bg-success", text: "text-emerald-700", bg: "bg-emerald-50", ring: "ring-emerald-600/10", labelKey: "status.pass" },
  RESOLVED:  { dot: "bg-success", text: "text-emerald-700", bg: "bg-emerald-50", ring: "ring-emerald-600/10", labelKey: "status.resolved" },
  APPROVED:  { dot: "bg-success", text: "text-emerald-700", bg: "bg-emerald-50", ring: "ring-emerald-600/10", labelKey: "status.approved" },
  RUNNING:   { dot: "bg-brand-700", text: "text-brand-300", bg: "bg-brand-50", ring: "ring-brand-700/10", labelKey: "status.running", pulse: true },
  SCHEDULED: { dot: "bg-brand-700", text: "text-brand-300", bg: "bg-brand-50", ring: "ring-brand-700/10", labelKey: "status.scheduled" },
  PENDING:   { dot: "bg-warning", text: "text-amber-700", bg: "bg-amber-50", ring: "ring-amber-600/10", labelKey: "status.pending" },
  PAUSED:    { dot: "bg-warning", text: "text-amber-700", bg: "bg-amber-50", ring: "ring-amber-600/10", labelKey: "status.paused" },
  FAILED:    { dot: "bg-error", text: "text-red-700", bg: "bg-red-50", ring: "ring-red-600/10", labelKey: "status.failed" },
  REJECTED:  { dot: "bg-error", text: "text-red-700", bg: "bg-red-50", ring: "ring-red-600/10", labelKey: "status.rejected" },
  INACTIVE:  { dot: "bg-slate-400", text: "text-slate-500", bg: "bg-slate-100", ring: "ring-slate-400/10", labelKey: "status.inactive" },
  CANCELLED: { dot: "bg-slate-400", text: "text-slate-500", bg: "bg-slate-100", ring: "ring-slate-400/10", labelKey: "status.cancelled" },
  SKIPPED:   { dot: "bg-slate-400", text: "text-slate-500", bg: "bg-slate-100", ring: "ring-slate-400/10", labelKey: "status.skipped" },
}

export function StatusBadge({ status }: { status: AppStatus }) {
  const { t } = useLang()
  const s = STATUS_MAP[status]
  return (
    <span className={cx("inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide ring-1 ring-inset", s.bg, s.text, s.ring)}>
      <span className={cx("size-1.5 rounded-full", s.dot, s.pulse && "animate-pulse")} />
      {t(s.labelKey)}
    </span>
  )
}

/* ------------------------------------------------------------------ */
/* Dropdown                                                           */
/* ------------------------------------------------------------------ */
export function Dropdown({
  label,
  options,
  value,
  onChange,
}: {
  label?: string
  options: string[]
  value: string
  onChange: (v: string) => void
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener("mousedown", onDoc)
    return () => document.removeEventListener("mousedown", onDoc)
  }, [])

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="inline-flex h-9 items-center gap-2 rounded-lg border border-slate-200 bg-surface px-3 text-[13px] font-medium text-slate-700 transition-colors hover:border-slate-300 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400"
      >
        {label && <span className="text-slate-400">{label}</span>}
        <span>{value}</span>
        <svg className={cx("size-3.5 text-slate-400 transition-transform", open && "rotate-180")} viewBox="0 0 20 20" fill="currentColor">
          <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.17l3.71-3.94a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" />
        </svg>
      </button>
      {open && (
        <div className="absolute end-0 z-20 mt-1.5 min-w-[160px] overflow-hidden rounded-lg border border-slate-200 bg-surface py-1 shadow-lg">
          {options.map((opt) => (
            <button
              key={opt}
              onClick={() => { onChange(opt); setOpen(false) }}
              className={cx("flex w-full items-center justify-between px-3 py-2 text-start text-[13px] transition-colors hover:bg-slate-50", opt === value ? "font-semibold text-brand-300" : "text-slate-600")}
            >
              {opt}
              {opt === value && (
                <svg className="size-4 text-brand-400" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M16.7 5.3a1 1 0 010 1.4l-8 8a1 1 0 01-1.4 0l-4-4a1 1 0 011.4-1.4l3.3 3.29 7.3-7.3a1 1 0 011.4 0z" />
                </svg>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Tabs                                                               */
/* ------------------------------------------------------------------ */
export function Tabs({
  tabs,
  active,
  onChange,
}: {
  tabs: string[]
  active: string
  onChange: (t: string) => void
}) {
  return (
    <div className="inline-flex items-center gap-1 rounded-lg bg-slate-100 p-1">
      {tabs.map((t) => (
        <button
          key={t}
          onClick={() => onChange(t)}
          className={cx("rounded-md px-3 py-1.5 text-[13px] font-medium transition-all", active === t ? "bg-surface text-brand-300 shadow-sm" : "text-slate-500 hover:text-slate-700")}
        >
          {t}
        </button>
      ))}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Alert                                                              */
/* ------------------------------------------------------------------ */
export function Alert({
  tone = "info",
  title,
  children,
  onDismiss,
}: {
  tone?: "info" | "success" | "warning" | "error"
  title: string
  children?: React.ReactNode
  onDismiss?: () => void
}) {
  const map = {
    info: { bg: "bg-brand-50", border: "border-brand-200", text: "text-brand-300", icon: "text-brand-400" },
    success: { bg: "bg-emerald-50", border: "border-emerald-200", text: "text-emerald-800", icon: "text-success" },
    warning: { bg: "bg-amber-50", border: "border-amber-200", text: "text-amber-800", icon: "text-warning" },
    error: { bg: "bg-red-50", border: "border-red-200", text: "text-red-800", icon: "text-error" },
  }[tone]
  return (
    <div className={cx("flex items-start gap-3 rounded-xl border px-4 py-3", map.bg, map.border)}>
      <svg className={cx("mt-0.5 size-5 shrink-0", map.icon)} viewBox="0 0 20 20" fill="currentColor">
        <path fillRule="evenodd" d="M18 10A8 8 0 11 2 10a8 8 0 0116 0zm-7-4a1 1 0 10-2 0v4a1 1 0 002 0V6zm-1 7a1 1 0 100 2 1 1 0 000-2z" />
      </svg>
      <div className="flex-1">
        <p className={cx("text-sm font-semibold", map.text)}>{title}</p>
        {children && <div className={cx("mt-0.5 text-[13px]", map.text, "opacity-80")}>{children}</div>}
      </div>
      {onDismiss && (
        <button onClick={onDismiss} className={cx("shrink-0 rounded p-0.5 hover:bg-white/10", map.text)}>
          <svg className="size-4" viewBox="0 0 20 20" fill="currentColor">
            <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
          </svg>
        </button>
      )}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Empty State                                                        */
/* ------------------------------------------------------------------ */
export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon?: React.ReactNode
  title: string
  description: string
  action?: React.ReactNode
}) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
      <div className="flex size-12 items-center justify-center rounded-xl bg-slate-100 text-slate-400">
        {icon ?? (
          <svg className="size-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h7l5 5v11a2 2 0 01-2 2z" />
          </svg>
        )}
      </div>
      <p className="mt-4 text-sm font-semibold text-slate-800">{title}</p>
      <p className="mt-1 max-w-xs text-[13px] text-slate-500">{description}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Error State                                                        */
/* ------------------------------------------------------------------ */
export function ErrorState({
  title,
  description,
  onRetry,
}: {
  title?: string
  description?: string
  onRetry?: () => void
}) {
  const { t } = useLang()
  return (
    <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
      <div className="flex size-12 items-center justify-center rounded-xl bg-red-50 text-error">
        <svg className="size-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
        </svg>
      </div>
      <p className="mt-4 text-sm font-semibold text-slate-800">{title ?? t("common.somethingWentWrong")}</p>
      <p className="mt-1 max-w-xs text-[13px] text-slate-500">{description ?? t("common.unexpectedError")}</p>
      {onRetry && (
        <div className="mt-4">
          <Button variant="secondary" size="sm" onClick={onRetry}>
            <svg className="size-3.5" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 010 2H4a1 1 0 01-1-1V3a1 1 0 011-1zm.008 9.057a1 1 0 011.276.61A5.002 5.002 0 0014.001 13H11a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0v-2.101a7.002 7.002 0 01-11.601-2.566 1 1 0 01.61-1.276z" />
            </svg>
            {t("common.retry")}
          </Button>
        </div>
      )}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Skeleton                                                           */
/* ------------------------------------------------------------------ */
export function Skeleton({ className, rounded = "md" }: { className?: string; rounded?: "sm" | "md" | "lg" | "full" }) {
  const r = { sm: "rounded-sm", md: "rounded-md", lg: "rounded-lg", full: "rounded-full" }[rounded]
  return (
    <div className={cx("relative overflow-hidden bg-slate-100", r, className)}>
      <div
        className="absolute inset-0 -translate-x-full"
        style={{ background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.08), transparent)", animation: "shimmer 1.5s infinite" }}
      />
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Toast                                                              */
/* ------------------------------------------------------------------ */
type ToastVariant = "success" | "error" | "warning" | "info"
type ToastItem = { id: string; title: string; description?: string; variant: ToastVariant }
type ToastFn = (opts: Omit<ToastItem, "id"> & { duration?: number }) => void

const ToastCtx = createContext<ToastFn>(() => {})

function ToastCard({ item, onDismiss }: { item: ToastItem; onDismiss: () => void }) {
  const icons = {
    success: (
      <svg className="size-4 shrink-0 text-success" viewBox="0 0 20 20" fill="currentColor">
        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.7-9.3a1 1 0 00-1.4-1.4L9 10.6 7.7 9.3a1 1 0 00-1.4 1.4l2 2a1 1 0 001.4 0l4-4z" />
      </svg>
    ),
    error: (
      <svg className="size-4 shrink-0 text-error" viewBox="0 0 20 20" fill="currentColor">
        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" />
      </svg>
    ),
    warning: (
      <svg className="size-4 shrink-0 text-warning" viewBox="0 0 20 20" fill="currentColor">
        <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" />
      </svg>
    ),
    info: (
      <svg className="size-4 shrink-0 text-brand-400" viewBox="0 0 20 20" fill="currentColor">
        <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" />
      </svg>
    ),
  }
  const borders = { success: "border-emerald-200", error: "border-red-200", warning: "border-amber-200", info: "border-brand-200" }

  return (
    <div className={cx("flex w-full max-w-[360px] items-start gap-3 rounded-xl border bg-surface px-4 py-3.5 shadow-lg", borders[item.variant])}>
      {icons[item.variant]}
      <div className="min-w-0 flex-1">
        <p className="text-[13px] font-semibold text-slate-800">{item.title}</p>
        {item.description && <p className="mt-0.5 text-[12px] text-slate-500">{item.description}</p>}
      </div>
      <button onClick={onDismiss} className="shrink-0 text-slate-400 hover:text-slate-600">
        <svg className="size-4" viewBox="0 0 20 20" fill="currentColor">
          <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
        </svg>
      </button>
    </div>
  )
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([])

  const toast = useCallback<ToastFn>(({ title, description, variant = "info", duration = 4000 }) => {
    const id = Math.random().toString(36).slice(2)
    setToasts((p) => [...p, { id, title, description, variant }])
    setTimeout(() => setToasts((p) => p.filter((t) => t.id !== id)), duration)
  }, [])

  function dismiss(id: string) {
    setToasts((p) => p.filter((t) => t.id !== id))
  }

  return (
    <ToastCtx.Provider value={toast}>
      {children}
      {typeof document !== "undefined" && createPortal(
        <div className="fixed bottom-4 end-4 z-[200] flex flex-col-reverse gap-2">
          {toasts.map((t) => (
            <ToastCard key={t.id} item={t} onDismiss={() => dismiss(t.id)} />
          ))}
        </div>,
        document.body,
      )}
    </ToastCtx.Provider>
  )
}

export function useToast() {
  return useContext(ToastCtx)
}

/* ------------------------------------------------------------------ */
/* Modal                                                              */
/* ------------------------------------------------------------------ */
type ModalSize = "sm" | "md" | "lg"
type ModalVariant = "default" | "danger" | "info"

type ModalProps = {
  isOpen: boolean
  onClose: () => void
  title?: string
  description?: string
  size?: ModalSize
  variant?: ModalVariant
  children?: React.ReactNode
  footer?: React.ReactNode
}

export function Modal({ isOpen, onClose, title, description, size = "md", variant = "default", children, footer }: ModalProps) {
  useEffect(() => {
    if (!isOpen) return
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") onClose() }
    document.addEventListener("keydown", onKey)
    return () => document.removeEventListener("keydown", onKey)
  }, [isOpen, onClose])

  if (!isOpen || typeof document === "undefined") return null

  const widths: Record<ModalSize, string> = { sm: "max-w-[400px]", md: "max-w-[520px]", lg: "max-w-[720px]" }
  const iconColor: Record<ModalVariant, string> = {
    default: "text-brand-400",
    danger: "text-error",
    info: "text-brand-400",
  }

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-[#020a16]/70 backdrop-blur-sm" onClick={onClose} />
      <div className={cx("relative w-full overflow-hidden rounded-2xl border border-slate-200 bg-elevated shadow-2xl", widths[size])}>
        {title && (
          <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-6 py-5">
            <div>
              <h2 className={cx("font-display text-[17px] font-bold", variant === "danger" ? "text-error" : "text-navy")}>{title}</h2>
              {description && <p className="mt-1 text-[13px] text-slate-500">{description}</p>}
            </div>
            <button onClick={onClose} className="shrink-0 text-slate-400 transition-colors hover:text-slate-600">
              <svg className="size-5" viewBox="0 0 20 20" fill="currentColor">
                <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
              </svg>
            </button>
          </div>
        )}
        {children && <div className="px-6 py-5">{children}</div>}
        {footer && (
          <div className="flex items-center justify-end gap-2 border-t border-slate-200 px-6 py-4">
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body,
  )
}

/* ------------------------------------------------------------------ */
/* Form field wrapper                                                 */
/* ------------------------------------------------------------------ */
export function FormField({
  label,
  htmlFor,
  required,
  hint,
  error,
  children,
}: {
  label: string
  htmlFor: string
  required?: boolean
  hint?: string
  error?: string
  children: React.ReactNode
}) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={htmlFor} className="flex items-center gap-1 text-[12px] font-semibold text-slate-500">
        {label}
        {required && <span className="text-error">*</span>}
      </label>
      {children}
      {error && (
        <p className="flex items-center gap-1 text-[11px] text-error">
          <svg className="size-3 shrink-0" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" /></svg>
          {error}
        </p>
      )}
      {hint && !error && <p className="text-[11px] text-slate-400">{hint}</p>}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Input                                                              */
/* ------------------------------------------------------------------ */
type InputProps = React.InputHTMLAttributes<HTMLInputElement> & {
  error?: string
  prefix?: string
  suffix?: string
}

export function Input({ error, prefix, suffix, className, ...rest }: InputProps) {
  const base = cx(
    "block flex-1 bg-elevated px-3.5 py-2.5 text-[13px] text-slate-700 placeholder-slate-400 focus:outline-none disabled:opacity-60",
    !prefix && "rounded-lg border",
    error ? "border-red-400" : "border-slate-200 hover:border-slate-300",
    "transition-colors focus:ring-2 focus:ring-brand-400",
    className,
  )
  if (prefix || suffix) {
    return (
      <div className={cx("flex overflow-hidden rounded-lg border focus-within:ring-2 focus-within:ring-brand-400", error ? "border-red-400" : "border-slate-200")}>
        {prefix && <span className="flex items-center border-e border-slate-200 bg-elevated px-3 text-[12px] text-slate-400">{prefix}</span>}
        <input className={cx("flex-1 bg-elevated px-3.5 py-2.5 text-[13px] text-slate-700 placeholder-slate-400 focus:outline-none disabled:opacity-60")} {...rest} />
        {suffix && <span className="flex items-center border-s border-slate-200 bg-elevated px-3 text-[12px] text-slate-400">{suffix}</span>}
      </div>
    )
  }
  return <input className={base} {...rest} />
}

/* ------------------------------------------------------------------ */
/* PasswordInput                                                      */
/* ------------------------------------------------------------------ */
export function PasswordInput({ error, className, ...rest }: Omit<React.InputHTMLAttributes<HTMLInputElement>, "type"> & { error?: string }) {
  const [show, setShow] = useState(false)
  const { t } = useLang()
  return (
    <div className={cx("flex overflow-hidden rounded-lg border transition-colors focus-within:ring-2 focus-within:ring-brand-400", error ? "border-red-400" : "border-slate-200")}>
      <input
        type={show ? "text" : "password"}
        className={cx("flex-1 bg-elevated px-3.5 py-2.5 text-[13px] text-slate-700 placeholder-slate-400 focus:outline-none disabled:opacity-60", className)}
        {...rest}
      />
      <button
        type="button"
        tabIndex={-1}
        onClick={() => setShow((v) => !v)}
        className="flex items-center border-s border-slate-200 bg-elevated px-3 text-slate-400 hover:text-slate-600"
        aria-label={show ? t("login.hidePassword") : t("login.showPassword")}
      >
        {show ? (
          <svg className="size-4" viewBox="0 0 20 20" fill="currentColor"><path d="M10 12a2 2 0 100-4 2 2 0 000 4z" /><path fillRule="evenodd" d="M.458 10C1.732 5.943 5.522 3 10 3s8.268 2.943 9.542 7c-1.274 4.057-5.064 7-9.542 7S1.732 14.057.458 10zM14 10a4 4 0 11-8 0 4 4 0 018 0z" /></svg>
        ) : (
          <svg className="size-4" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M3.707 2.293a1 1 0 00-1.414 1.414l14 14a1 1 0 001.414-1.414l-1.473-1.473A10.014 10.014 0 0019.542 10C18.268 5.943 14.478 3 10 3a9.958 9.958 0 00-4.512 1.074l-1.78-1.781zm4.261 4.26l1.514 1.515a2.003 2.003 0 012.45 2.45l1.514 1.514a4 4 0 00-5.478-5.478z" /><path d="M12.454 16.697L9.75 13.992a4 4 0 01-3.742-3.741L2.335 6.578A9.98 9.98 0 00.458 10c1.274 4.057 5.064 7 9.542 7 .847 0 1.669-.105 2.454-.303z" /></svg>
        )}
      </button>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Textarea                                                           */
/* ------------------------------------------------------------------ */
type TextareaProps = React.TextareaHTMLAttributes<HTMLTextAreaElement> & { error?: string }

export function Textarea({ error, className, ...rest }: TextareaProps) {
  return (
    <textarea
      className={cx(
        "block w-full rounded-lg border bg-elevated px-3.5 py-2.5 text-[13px] text-slate-700 placeholder-slate-400 transition-colors focus:outline-none focus:ring-2 focus:ring-brand-400 resize-none disabled:opacity-60",
        error ? "border-red-400" : "border-slate-200 hover:border-slate-300",
        className,
      )}
      {...rest}
    />
  )
}

/* ------------------------------------------------------------------ */
/* Select                                                             */
/* ------------------------------------------------------------------ */
type SelectProps = React.SelectHTMLAttributes<HTMLSelectElement> & {
  options: { value: string; label: string }[]
  error?: string
}

export function Select({ options, error, className, ...rest }: SelectProps) {
  return (
    <select
      className={cx(
        "block w-full rounded-lg border bg-elevated px-3.5 py-2.5 text-[13px] text-slate-700 focus:outline-none focus:ring-2 focus:ring-brand-400 disabled:opacity-60",
        error ? "border-red-400" : "border-slate-200",
        className,
      )}
      {...rest}
    >
      {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  )
}

/* ------------------------------------------------------------------ */
/* Checkbox                                                           */
/* ------------------------------------------------------------------ */
export function Checkbox({
  id,
  checked,
  onChange,
  label,
  disabled,
}: {
  id: string
  checked: boolean
  onChange: (v: boolean) => void
  label?: string
  disabled?: boolean
}) {
  return (
    <label htmlFor={id} className={cx("inline-flex cursor-pointer items-center gap-2.5", disabled && "cursor-not-allowed opacity-50")}>
      <span
        className={cx(
          "flex size-4 shrink-0 items-center justify-center rounded border transition-colors",
          checked ? "border-brand-600 bg-brand-600" : "border-slate-300 bg-elevated",
          !disabled && "cursor-pointer",
        )}
      >
        {checked && (
          <svg className="size-3 text-white" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M16.7 5.3a1 1 0 010 1.4l-8 8a1 1 0 01-1.4 0l-4-4a1 1 0 011.4-1.4l3.3 3.29 7.3-7.3a1 1 0 011.4 0z" />
          </svg>
        )}
      </span>
      <input id={id} type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} disabled={disabled} className="sr-only" />
      {label && <span className="text-[13px] text-slate-700">{label}</span>}
    </label>
  )
}

/* ------------------------------------------------------------------ */
/* Radio                                                              */
/* ------------------------------------------------------------------ */
export function Radio({
  id,
  name,
  value,
  checked,
  onChange,
  label,
  disabled,
}: {
  id: string
  name: string
  value: string
  checked: boolean
  onChange: (v: string) => void
  label?: string
  disabled?: boolean
}) {
  return (
    <label htmlFor={id} className={cx("inline-flex cursor-pointer items-center gap-2.5", disabled && "cursor-not-allowed opacity-50")}>
      <span className={cx("flex size-4 shrink-0 items-center justify-center rounded-full border transition-colors", checked ? "border-brand-600 bg-brand-600" : "border-slate-300 bg-elevated")}>
        {checked && <span className="size-1.5 rounded-full bg-white" />}
      </span>
      <input id={id} type="radio" name={name} value={value} checked={checked} onChange={() => onChange(value)} disabled={disabled} className="sr-only" />
      {label && <span className="text-[13px] text-slate-700">{label}</span>}
    </label>
  )
}

/* ------------------------------------------------------------------ */
/* Switch                                                             */
/* ------------------------------------------------------------------ */
export function Switch({
  on,
  onChange,
  label,
  disabled,
}: {
  on: boolean
  onChange: (v: boolean) => void
  label?: string
  disabled?: boolean
}) {
  return (
    <label className={cx("inline-flex cursor-pointer items-center gap-3", disabled && "cursor-not-allowed opacity-50")}>
      {label && <span className="text-[13px] text-slate-700">{label}</span>}
      <button
        type="button"
        role="switch"
        aria-checked={on}
        disabled={disabled}
        onClick={() => onChange(!on)}
        className={cx(
          "relative inline-flex h-6 w-11 shrink-0 rounded-full border-2 border-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 disabled:opacity-50 disabled:pointer-events-none",
          on ? "bg-brand-900" : "bg-slate-200",
        )}
      >
        <span className={cx("pointer-events-none inline-block size-4 rounded-full bg-white shadow ring-0 transition-transform mt-0.5", on ? "translate-x-5 rtl:-translate-x-5" : "translate-x-0")} />
      </button>
    </label>
  )
}

/* ------------------------------------------------------------------ */
/* Skeleton variants                                                  */
/* ------------------------------------------------------------------ */
export function TableSkeleton({ rows = 5, columns = 4 }: { rows?: number; columns?: number }) {
  return (
    <div className="overflow-hidden rounded-[var(--radius-card)] border border-slate-200/80 bg-surface">
      {/* Header */}
      <div className="flex items-center gap-4 border-b border-slate-100 px-5 py-3">
        {Array.from({ length: columns }).map((_, i) => (
          <Skeleton key={i} className={cx("h-3.5", i === 0 ? "w-32" : i === columns - 1 ? "w-16 ms-auto" : "w-20")} />
        ))}
      </div>
      {/* Rows */}
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-4 border-b border-slate-100/50 px-5 py-4">
          <div className="flex items-center gap-2.5">
            <Skeleton className="size-8" rounded="lg" />
            <div className="space-y-1.5">
              <Skeleton className="h-3 w-24" />
              <Skeleton className="h-2.5 w-16" />
            </div>
          </div>
          {Array.from({ length: columns - 2 }).map((_, j) => (
            <Skeleton key={j} className="h-3 w-20" />
          ))}
          <Skeleton className="ms-auto h-7 w-12" rounded="lg" />
        </div>
      ))}
    </div>
  )
}

export function CardSkeleton() {
  return (
    <Card className="p-5">
      <div className="flex items-start gap-3">
        <Skeleton className="size-10 shrink-0" rounded="lg" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-3 w-1/2" />
        </div>
      </div>
      <div className="mt-4 space-y-2">
        <Skeleton className="h-3 w-full" />
        <Skeleton className="h-3 w-5/6" />
        <Skeleton className="h-3 w-2/3" />
      </div>
      <div className="mt-4 flex gap-2">
        <Skeleton className="h-8 w-24" rounded="lg" />
        <Skeleton className="h-8 w-20" rounded="lg" />
      </div>
    </Card>
  )
}

/* ------------------------------------------------------------------ */
/* DataTable                                                          */
/* ------------------------------------------------------------------ */
type Column<T> = {
  key: string
  label: string
  render: (row: T) => React.ReactNode
  align?: "left" | "right" | "center"
}

type DataTableProps<T extends { id: string }> = {
  columns: Column<T>[]
  rows: T[]
  loading?: boolean
  onRowClick?: (row: T) => void
  emptyTitle?: string
  emptyDescription?: string
}

export function DataTable<T extends { id: string }>({
  columns,
  rows,
  loading,
  onRowClick,
  emptyTitle,
  emptyDescription,
}: DataTableProps<T>) {
  const { t } = useLang()
  if (loading) return <TableSkeleton rows={5} columns={columns.length} />

  return (
    <Card className="overflow-hidden">
      <table className="w-full">
        <thead>
          <tr className="border-b border-slate-100 text-start text-[11px] font-semibold uppercase tracking-wide text-slate-400">
            {columns.map((col) => (
              <th key={col.key} className={cx("px-5 py-3 font-semibold", col.align === "right" && "text-right", col.align === "center" && "text-center")}>
                {col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={columns.length}>
                <EmptyState title={emptyTitle ?? t("common.noData")} description={emptyDescription ?? t("common.nothingToDisplay")} />
              </td>
            </tr>
          ) : (
            rows.map((row) => (
              <tr
                key={row.id}
                onClick={() => onRowClick?.(row)}
                className={cx("border-t border-slate-100 transition-colors hover:bg-slate-50/60", onRowClick && "cursor-pointer")}
              >
                {columns.map((col) => (
                  <td key={col.key} className={cx("px-5 py-3.5", col.align === "right" && "text-right", col.align === "center" && "text-center")}>
                    {col.render(row)}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </Card>
  )
}

/* ------------------------------------------------------------------ */
/* AI pill                                                            */
/* ------------------------------------------------------------------ */
export function AiPill({ className }: { className?: string }) {
  const { t } = useLang()
  return (
    <span className={cx("inline-flex items-center gap-1.5 rounded-full border border-brand-200 bg-gradient-to-r from-brand-50 to-transparent px-2.5 py-1 text-[11px] font-semibold text-brand-300", className)}>
      <svg className="size-3.5 text-brand-400" viewBox="0 0 24 24" fill="currentColor">
        <path d="M12 2l1.6 4.9L18.5 8.5 13.6 10 12 15l-1.6-5L5.5 8.5 10.4 6.9 12 2zM19 14l.9 2.6L22.5 17.5 20 18.4 19 21l-.9-2.6L15.5 17.5 18 16.6 19 14z" />
      </svg>
      {t("common.aiAnalysisAvailable")}
    </span>
  )
}
