import React, { useCallback, useEffect, useId, useRef } from "react"
import { createPortal } from "react-dom"
import { Button, cx } from "../primitives"
import { useLang } from "../../lib/i18n"

/**
 * Confirmation dialog for the sensitive lifecycle steps (Approve, Proving,
 * Archive).
 *
 * The shared `Modal` in `primitives.tsx` has no dialog semantics and no focus
 * management, and these are the actions where that matters most: Proving runs
 * against the client's real environment and Archive is terminal. This dialog is
 * announced as a modal dialog, moves focus in on open, keeps Tab inside it, and
 * restores focus to whatever opened it. While the action is in flight the dialog
 * refuses to close, so one confirmation dispatches exactly one request.
 */
export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  busyLabel,
  cancelLabel,
  tone = "default",
  busy = false,
  onConfirm,
  onCancel,
  children,
}: {
  open: boolean
  title: string
  description: string
  confirmLabel: string
  busyLabel?: string
  /** Overrides the default "Cancel" when a more specific choice reads better. */
  cancelLabel?: string
  tone?: "default" | "danger"
  busy?: boolean
  onConfirm: () => void
  onCancel: () => void
  children?: React.ReactNode
}) {
  const { t } = useLang()
  const panelRef = useRef<HTMLDivElement>(null)
  const restoreRef = useRef<Element | null>(null)
  const titleId = useId()
  const descriptionId = useId()

  const requestClose = useCallback(() => {
    if (!busy) onCancel()
  }, [busy, onCancel])

  /* Remember the trigger, focus the primary action, restore focus on close. */
  useEffect(() => {
    if (!open) return
    restoreRef.current = document.activeElement
    panelRef.current?.querySelector<HTMLElement>("[data-confirm-action]")?.focus()
    return () => {
      const restore = restoreRef.current
      if (restore instanceof HTMLElement) restore.focus()
    }
  }, [open])

  /* Escape closes; Tab cycles within the dialog. */
  useEffect(() => {
    if (!open) return
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault()
        requestClose()
        return
      }
      if (event.key !== "Tab") return
      const panel = panelRef.current
      if (!panel) return
      const focusable = Array.from(
        panel.querySelectorAll<HTMLElement>(
          "button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex='-1'])",
        ),
      )
      if (focusable.length === 0) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      const active = document.activeElement
      if (event.shiftKey && (active === first || !panel.contains(active))) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && active === last) {
        event.preventDefault()
        first.focus()
      }
    }
    document.addEventListener("keydown", onKeyDown)
    return () => document.removeEventListener("keydown", onKeyDown)
  }, [open, requestClose])

  if (!open || typeof document === "undefined") return null

  return createPortal(
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-[#020a16]/70 backdrop-blur-sm" onClick={requestClose} />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        className="relative w-full max-w-[480px] overflow-hidden rounded-2xl border border-slate-200 bg-elevated shadow-2xl"
      >
        <div className="border-b border-slate-200 px-6 py-5">
          <h2
            id={titleId}
            className={cx(
              "font-display text-[17px] font-bold",
              tone === "danger" ? "text-error" : "text-navy",
            )}
          >
            {title}
          </h2>
          <p id={descriptionId} className="mt-1 text-[13px] text-slate-500">
            {description}
          </p>
        </div>
        {children && <div className="px-6 py-4 text-[13px] text-slate-600">{children}</div>}
        <div className="flex items-center justify-end gap-2 border-t border-slate-200 px-6 py-4">
          <Button variant="secondary" onClick={requestClose} disabled={busy}>
            {cancelLabel ?? t("common.cancel")}
          </Button>
          <Button
            data-confirm-action="true"
            variant={tone === "danger" ? "danger" : "primary"}
            onClick={onConfirm}
            loading={busy}
          >
            {busy ? (busyLabel ?? confirmLabel) : confirmLabel}
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  )
}

export default ConfirmDialog
