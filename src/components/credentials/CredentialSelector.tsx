import React, { useEffect, useLayoutEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { cx } from "../primitives"
import { useLang } from "../../lib/i18n"
import { IconChevronDown, IconLock } from "../planner/AiIcons"
import {
  groupByType,
  isCredentialConfigured,
} from "../../lib/credentials"
import type { CredentialView } from "../../lib/api"

/* ------------------------------------------------------------------ */
/* Adapted from the Figma Make export (CreateTestPage: CredentialPill   */
/* dropdown). Visual language preserved; the two-option pill is now a   */
/* real multi-credential selector fed by the PR10C.5 backend, grouped   */
/* by type with per-credential status badges. The dropdown renders in a  */
/* document portal: the pill often lives inside cards with              */
/* overflow-hidden (the AI Composer), which would clip a plain          */
/* absolutely-positioned panel.                                         */
/*                                                                      */
/* Adapted from Figma Make export (Assuredia UI (7).zip);               */
/* originals retained in the Figma source, not in this repo.            */
/* ------------------------------------------------------------------ */

export type CredentialOption = {
  id: number
  name: string
}

export function credentialTypeLabel(
  t: (key: string) => string,
  type: CredentialView["type"],
): string {
  return type === "API_SERVICE"
    ? t("settings.credentials.typeApiService")
    : t("settings.credentials.typeUserAccount")
}

export function CredentialSelector({
  credentials,
  selectedId,
  onSelect,
  onManage,
  loading = false,
  compact = true,
}: {
  /** Credentials from the frozen backend view; never secret material. */
  credentials: CredentialView[]
  /** The REAL credential id (PR10C.5), or null for "No credential". */
  selectedId: number | null
  onSelect: (id: number | null) => void
  /** "Set up in Settings" CTA target; rendered in the empty state. */
  onManage: () => void
  /** While the first fetch is in flight the pill shows a neutral label. */
  loading?: boolean
  /** Pill style (composer/footer contexts) vs full-width (manual editors). */
  compact?: boolean
}) {
  const { t } = useLang()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const pillRef = useRef<HTMLButtonElement>(null)
  const [panelStyle, setPanelStyle] = useState<React.CSSProperties | null>(null)

  useEffect(() => {
    if (!open) return
    function onOutside(e: MouseEvent) {
      // The panel lives in a portal; both the pill and the panel are "inside".
      const target = e.target as Node
      if (
        ref.current?.contains(target) ||
        document.getElementById(CREDENTIAL_PANEL_ID)?.contains(target)
      ) {
        return
      }
      setOpen(false)
    }
    document.addEventListener("mousedown", onOutside)
    return () => document.removeEventListener("mousedown", onOutside)
  }, [open])

  // Position the portal panel against the pill: prefer opening upward
  // (the Figma composer layout), falling back to downward when there is
  // no room above.
  useLayoutEffect(() => {
    if (!open || !pillRef.current) return
    const rect = pillRef.current.getBoundingClientRect()
    const width = 256
    const panelEstimatedHeight = 280
    const top = rect.top > panelEstimatedHeight + 16
      ? rect.top - panelEstimatedHeight - 8
      : rect.bottom + 8
    const left = Math.max(8, Math.min(rect.left, window.innerWidth - width - 8))
    setPanelStyle({
      position: "fixed",
      top,
      left,
      width,
      maxHeight: `min(70vh, ${window.innerHeight - top - 8}px)`,
      overflowY: "auto",
    })
  }, [open])

  const selected =
    credentials.find((c) => c.id === selectedId) ?? null
  const configured = selected != null && isCredentialConfigured(selected)

  return (
    <div className={cx("relative", !compact && "w-full")} ref={ref}>
      <button
        ref={pillRef}
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className={cx(
          "flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] font-medium transition-all border",
          selected
            ? configured
              ? "border-emerald-300/60 bg-emerald-50 text-emerald-700 dark:border-emerald-700/40 dark:bg-emerald-900/20 dark:text-emerald-400"
              : "border-amber-300/60 bg-amber-50 text-amber-700 dark:border-amber-700/40 dark:bg-amber-900/20 dark:text-amber-400"
            : "border-slate-200 bg-slate-50 text-slate-500 hover:border-slate-300 hover:text-slate-700 dark:border-white/10 dark:bg-white/5 dark:text-white/50 dark:hover:bg-white/10 dark:hover:text-white/70",
        )}
      >
        <IconLock className="h-3 w-3 flex-shrink-0" />
        {selected
          ? `${selected.name} · ${credentialStatusShort(t, selected.status)}`
          : loading
            ? t("common.loading")
            : t("pr10c.composer.addCredential")}
        <IconChevronDown
          className={cx(
            "h-3 w-3 opacity-60 transition-transform rtl:-scale-x-100",
            open && "rotate-180",
          )}
        />
      </button>

      {selected && !configured && (
        <p className="mt-1 text-[11px] font-medium text-amber-600 dark:text-amber-400">
          {t("pr10c.credential.notConfiguredHint")}
        </p>
      )}

      {open && panelStyle != null && createPortal(
        <div
          id={CREDENTIAL_PANEL_ID}
          style={panelStyle}
          className={cx(
            "z-[110] overflow-hidden rounded-xl border border-slate-200/80 bg-white/95 shadow-xl backdrop-blur-xl dark:border-white/[0.09] dark:bg-slate-900/90 dark:shadow-[0_8px_32px_rgba(0,0,0,0.5),0_0_0_1px_rgba(255,255,255,0.04)_inset]",
            !compact && "!static !w-full rounded-lg border-slate-200 dark:border-white/[0.08]",
          )}
        >
          <div className="p-1">
            <button
              onClick={() => {
                onSelect(null)
                setOpen(false)
              }}
              className={cx(
                "flex w-full items-center gap-2 rounded-lg px-3 py-2 text-[13px] text-left transition-colors",
                selectedId == null
                  ? "bg-slate-100 font-medium text-slate-800 dark:bg-white/10 dark:text-white"
                  : "text-slate-500 hover:bg-slate-50 dark:text-slate-400 dark:hover:bg-white/[0.08]",
              )}
            >
              {t("credentials.selector.none")}
            </button>

            {credentials.length === 0 && !loading && (
              <div className="px-3 py-3 text-center">
                <p className="text-[12px] font-medium text-slate-600 dark:text-slate-300">
                  {t("credentials.selector.empty")}
                </p>
                <button
                  onClick={() => {
                    onManage()
                    setOpen(false)
                  }}
                  className="mt-2 text-[12px] font-semibold text-brand-400 hover:text-brand-300"
                >
                  {t("credentials.selector.emptyCta")} →
                </button>
              </div>
            )}

            {groupByType(credentials).map((group) => (
              <div key={group.type}>
                <p className="px-3 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-[0.1em] text-slate-400 dark:text-white/30">
                  {credentialTypeLabel(t, group.type)}
                </p>
                {group.credentials.map((c) => {
                  const isConfigured = isCredentialConfigured(c)
                  return (
                    <button
                      key={c.id}
                      onClick={() => {
                        onSelect(c.id)
                        setOpen(false)
                      }}
                      className={cx(
                        "flex w-full items-center gap-2 rounded-lg px-3 py-2 text-[13px] text-left transition-colors",
                        selectedId === c.id
                          ? "bg-slate-100 font-medium text-slate-800 dark:bg-white/10 dark:text-white"
                          : "text-slate-700 hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-white/[0.08]",
                      )}
                    >
                      <IconLock className="h-3.5 w-3.5 shrink-0 text-slate-400 dark:text-slate-500" />
                      <span className="min-w-0 flex-1 truncate">{c.name}</span>
                      <span
                        className={cx(
                          "flex shrink-0 items-center gap-1 text-[11px] font-medium",
                          isConfigured
                            ? "text-emerald-600 dark:text-emerald-400"
                            : "text-amber-600 dark:text-amber-400",
                        )}
                      >
                        <span
                          className={cx(
                            "inline-block h-1.5 w-1.5 rounded-full",
                            isConfigured ? "bg-emerald-500" : "bg-amber-400",
                          )}
                        />
                        {credentialStatusShort(t, c.status)}
                      </span>
                    </button>
                  )
                })}
              </div>
            ))}
          </div>
          <div className="border-t border-slate-100 px-3 py-2 dark:border-white/[0.08]">
            <p className="text-[11px] text-slate-400 dark:text-slate-500">
              {t("credentials.selector.managedNote")}
            </p>
          </div>
        </div>,
        document.body,
      )}
    </div>
  )
}

/** Portal panel id — the outside-click check treats it as part of the pill. */
const CREDENTIAL_PANEL_ID = "credential-selector-panel"

/** Customer-facing status label: the three closed statuses, nothing raw. */
function credentialStatusShort(
  t: (key: string) => string,
  status: CredentialView["status"],
): string {
  switch (status) {
    case "CONFIGURED":
      return t("settings.credentials.statusConfigured")
    case "NEEDS_SETUP":
      return t("settings.credentials.statusNeedsSetup")
    case "INVALID":
      return t("settings.credentials.statusInvalid")
  }
}
