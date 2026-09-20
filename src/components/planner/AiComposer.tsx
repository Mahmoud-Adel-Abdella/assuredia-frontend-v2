import React from "react"
import { cx } from "../primitives"
import { useLang } from "../../lib/i18n"
import type { ComposerTestType } from "../../lib/planner"
import type { CredentialView } from "../../lib/api"
import { CredentialSelector } from "../credentials/CredentialSelector"
import {
  IconArrowUp,
  IconCheck,
  IconLayers,
  IconPhone,
  IconServer,
  IconSparkle,
} from "./AiIcons"

/* ------------------------------------------------------------------ */
/* Adapted from the Figma Make export (CreateTestPage: Composer,        */
/* Suggestions, CredentialPill). Layout and visuals preserved; the      */
/* two-option pill is now the real multi-credential CredentialSelector */
/* fed by the PR10C.5 Phase 1 backend, grouped by type with per-         */
/* credential status badges (PR10C.5 Phase 2).                           */
/* ------------------------------------------------------------------ */

export const COMPOSER_TYPES: ComposerTestType[] = ["UI", "API", "MIXED"]

export function composerTypeLabel(
  t: (key: string) => string,
  type: ComposerTestType,
): string {
  switch (type) {
    case "UI":
      return t("pr10c.type.userJourney")
    case "API":
      return t("pr10c.type.backendCheck")
    case "MIXED":
      return t("pr10c.type.endToEnd")
  }
}

export const COMPOSER_SUGGESTIONS: Record<ComposerTestType, string[]> = {
  UI: [
    "Verify user sign-in",
    "Test product search and filters",
    "Verify adding a product to cart",
    "Test checkout flow",
    "Verify password reset",
  ],
  API: [
    "Verify order status",
    "Check product availability",
    "Validate customer profile",
    "Verify payment response",
  ],
  MIXED: [
    "Test complete checkout",
    "Verify registration to first purchase",
    "Test search to checkout",
    "Verify order creation",
  ],
}

/** Fixed 4-stage progress copy for plan generation (contract §8 FIX 2). */
export function buildingStages(t: (key: string) => string): string[] {
  return [
    t("pr10c.stages.understanding"),
    t("pr10c.stages.exploring"),
    t("pr10c.stages.planning"),
    t("pr10c.stages.validating"),
  ]
}

/**
 * The composer's credential control (PR10C.5 Phase 2): the real
 * multi-credential CredentialSelector (grouped by type, per-credential
 * status badges, real client_credentials ids), replacing the pre-018
 * two-option CredentialPill.
 */
export { CredentialSelector }

export function Composer({
  testType,
  setTestType,
  intent,
  setIntent,
  credentials,
  credentialsLoading,
  selectedCredentialId,
  onSelectCredential,
  onManageCredentials,
  onBuild,
  building,
}: {
  testType: ComposerTestType
  setTestType: (t: ComposerTestType) => void
  intent: string
  setIntent: (v: string) => void
  /** Real credentials from the frozen PR10C.5 backend (never secret material). */
  credentials: CredentialView[]
  credentialsLoading: boolean
  /** The REAL selected credential id, or null for "No credential". */
  selectedCredentialId: number | null
  onSelectCredential: (id: number | null) => void
  /** "Set up in Settings" CTA target from the selector's empty state. */
  onManageCredentials: () => void
  onBuild: () => void
  building?: boolean
}) {
  const { t } = useLang()
  const MIN_INTENT_LENGTH = 11
  const canBuild = intent.trim().length >= MIN_INTENT_LENGTH && !building
  // The disabled Build button alone gives no reason; tell the user how much
  // more is needed once they started typing (live-test F-8).
  const showMinLengthHint =
    !building && intent.trim().length > 0 && intent.trim().length < MIN_INTENT_LENGTH

  return (
    <div
      className={cx(
        "relative overflow-hidden rounded-[20px] transition-all duration-200",
        "border border-slate-200/70 bg-white/90 backdrop-blur-sm [box-shadow:var(--shadow-composer)]",
        "[&:focus-within]:[box-shadow:var(--shadow-composer-focus)] focus-within:border-brand-400/60",
        "dark:border-white/[0.08] dark:bg-slate-950/70 dark:backdrop-blur-xl",
        "dark:focus-within:border-brand-400/40 dark:[&:focus-within]:[box-shadow:0_0_0_1px_rgba(96,165,250,0.2),0_8px_32px_rgba(0,0,0,0.5),0_0_60px_rgba(37,99,235,0.1)]",
      )}
    >
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/30 to-transparent dark:via-white/[0.12]" />
      <div className="pointer-events-none absolute inset-0 rounded-[20px] shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]" />

      <div className="min-h-[120px] px-6 pb-2 pt-5">
        <div className="flex items-start gap-2.5">
          <IconSparkle className="mt-[3px] h-3.5 w-3.5 shrink-0 text-teal-400 opacity-90" />
          <textarea
            id="ai-intent-textarea"
            value={intent}
            onChange={(e) => setIntent(e.target.value)}
            placeholder={t("pr10c.composer.placeholder")}
            rows={3}
            aria-label={t("pr10c.composer.intentLabel")}
            className={cx(
              "w-full resize-none bg-transparent text-[15px] leading-relaxed focus:outline-none",
              "text-slate-800 placeholder-slate-400",
              "dark:text-white dark:placeholder-white/25",
            )}
          />
        </div>
      </div>

      <div className="mx-5 h-px bg-slate-100 dark:bg-slate-700/40" />

      <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
        <div className="flex items-center gap-2.5">
          <button
            onClick={onBuild}
            disabled={!canBuild}
            className={cx(
              "flex h-10 items-center gap-2 rounded-xl px-4 text-[14px] font-semibold transition-all duration-150",
              canBuild
                ? "bg-brand-900 text-white hover:bg-brand-700 hover:shadow-lg hover:shadow-brand-700/20 active:scale-[0.97]"
                : "cursor-not-allowed bg-slate-100 text-slate-400 dark:bg-white/5 dark:text-white/20",
            )}
          >
            <IconArrowUp className="h-4 w-4 flex-shrink-0 rtl:-scale-x-100" />
            {t("pr10c.composer.build")}
          </button>

          <CredentialSelector
            credentials={credentials}
            selectedId={selectedCredentialId}
            onSelect={onSelectCredential}
            onManage={onManageCredentials}
            loading={credentialsLoading}
          />
        </div>

        <div
          className="flex items-center gap-1.5"
          role="radiogroup"
          aria-label={t("pr10c.composer.typeLabel")}
        >
          {COMPOSER_TYPES.map((type) => {
            const active = testType === type
            return (
              <button
                key={type}
                role="radio"
                aria-checked={active}
                onClick={() => setTestType(type)}
                className={cx(
                  "flex h-8 items-center gap-1.5 rounded-full border px-3 text-[12px] font-medium transition-all duration-150",
                  active
                    ? "border-brand-400/60 bg-brand-50/90 text-brand-300 dark:border-brand-400/50 dark:bg-brand-500/10 dark:text-brand-400"
                    : "border-slate-200/80 bg-slate-50/80 text-slate-500 hover:border-brand-200 hover:bg-brand-50/50 hover:text-brand-400 dark:border-white/[0.08] dark:bg-white/[0.03] dark:text-white/35 dark:hover:border-white/15 dark:hover:bg-white/[0.06] dark:hover:text-white/60",
                )}
              >
                {active ? (
                  <IconCheck className="h-2.5 w-2.5 flex-shrink-0 text-teal-400" />
                ) : type === "UI" ? (
                  <IconPhone className="h-3 w-3 flex-shrink-0" />
                ) : type === "API" ? (
                  <IconServer className="h-3 w-3 flex-shrink-0" />
                ) : (
                  <IconLayers className="h-3 w-3 flex-shrink-0" />
                )}
                {composerTypeLabel(t, type)}
              </button>
            )
          })}
        </div>
      </div>

      {showMinLengthHint && (
        <p
          role="note"
          className="px-5 pb-3 text-[12px] text-slate-400 dark:text-white/30"
        >
          {t("pr10c.composer.minLengthHint")}
        </p>
      )}
    </div>
  )
}

export function Suggestions({
  testType,
  onSelect,
}: {
  testType: ComposerTestType
  onSelect: (text: string) => void
}) {
  const { t } = useLang()
  return (
    <div>
      <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400 dark:text-white/30">
        {t("pr10c.composer.tryExample")}
      </p>
      <div className="relative">
        <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-10 bg-gradient-to-l from-[var(--color-background)] to-transparent sm:hidden" />
        <div className="flex gap-2 overflow-x-auto pb-1 sm:flex-wrap sm:overflow-visible sm:pb-0 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {COMPOSER_SUGGESTIONS[testType].map((chip) => (
            <button
              key={chip}
              onClick={() => onSelect(chip)}
              className={cx(
                "group flex h-9 shrink-0 items-center gap-2 rounded-full border px-3.5 text-[14px] font-medium transition-all duration-150",
                "border-slate-200/70 bg-white/80 text-slate-600 backdrop-blur-sm",
                "hover:-translate-y-px hover:border-brand-300/60 hover:bg-white hover:text-brand-400 hover:[box-shadow:var(--shadow-subtle)]",
                "dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-white/50 dark:backdrop-blur-sm",
                "dark:hover:border-teal-400/30 dark:hover:bg-white/[0.08] dark:hover:text-white/80",
              )}
            >
              <IconSparkle className="h-3.5 w-3.5 shrink-0 text-teal-400" />
              {chip}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
