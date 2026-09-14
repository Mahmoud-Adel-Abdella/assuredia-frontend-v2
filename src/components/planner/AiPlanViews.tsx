import React, { useState } from "react"
import { Button, cx } from "../primitives"
import { useLang } from "../../lib/i18n"
import {
  type ComposerTestType,
  type PlanCredentialReference,
  type PlanOutcome,
  type PlanStep,
  outcomesOfSteps,
} from "../../lib/planner"

function categoryLabel(t: (key: string) => string, category: string | null): string {
  switch (category) {
    case "MISSING_BUSINESS_OBJECTIVE":
      return t("pr10c.category.missingObjective")
    case "MISSING_TARGET_APPLICATION":
      return t("pr10c.category.missingApplication")
    case "MISSING_CREDENTIAL":
      return t("pr10c.category.missingCredential")
    case "UNCLEAR_EXPECTED_OUTCOME":
    case "MISSING_ACCOUNT":
    case "UNCLEAR_OUTCOME":
      return t("pr10c.category.unclearOutcome")
    case "UNSUPPORTED_CAPABILITY":
      return t("pr10c.category.unsupportedCapability")
    default:
      return t("pr10c.category.default")
  }
}
import { IconCheck, IconChevronDown, IconLock } from "./AiIcons"

/* ------------------------------------------------------------------ */
/* Adapted from the Figma Make export (CreateTestPage: CapBadge,        */
/* BuildingView, StepRow, ProposedView, ReviewView, SuccessView,        */
/* ErrorView, PreflightUrlView). Layout and visuals preserved.          */
/* Wiring changes: real plan shapes (no fabricated targets/endpoints),  */
/* editable/reorderable/deletable actions, clarification questions view, */
/* read-only target-application badge, Open-Test-Definition action.     */
/* ------------------------------------------------------------------ */

/**
 * An editable plan step. `outcome` is the step's own expected result
 * (index-aligned planner output, attached at plan load): it moves and is
 * deleted together with the step, so structural edits can never orphan it.
 */
export type EditableStep = PlanStep & { key: string; outcome?: PlanOutcome }

export function CapBadge({ cap }: { cap: "UI" | "API" }) {
  return (
    <span
      className={cx(
        "inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-semibold tracking-wide",
        cap === "UI"
          ? "bg-teal-50 text-teal-700 dark:bg-teal-900/40 dark:text-teal-300"
          : "bg-indigo-50 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300",
      )}
    >
      {cap}
    </span>
  )
}

export function BuildingView({
  testType,
  stages,
  currentStage,
  onCancel,
}: {
  testType: ComposerTestType
  stages: string[]
  currentStage: number
  onCancel: () => void
}) {
  const { t } = useLang()
  return (
    <div className="flex flex-col items-center py-16">
      <div className="relative mb-10 flex h-20 w-20 items-center justify-center">
        <div className="absolute inset-0 animate-spin rounded-full border-4 border-slate-100 border-t-brand-700 dark:border-slate-700/60 dark:border-t-brand-400" />
        <span className="text-[11px] font-bold text-brand-700 dark:text-brand-400">
          {t("pr10c.building.aiBadge")}
        </span>
      </div>
      <h3 className="mb-2 text-[18px] font-semibold text-slate-800 dark:text-white">
        {t("pr10c.building.title", { type: t(`pr10c.type.${testType === "UI" ? "userJourney" : testType === "API" ? "backendCheck" : "endToEnd"}`) })}
      </h3>
      <p className="mb-10 text-[14px] text-slate-500 dark:text-white/40">
        {t("pr10c.building.subtitle")}
      </p>
      <div className="w-full max-w-sm space-y-3" aria-live="polite">
        {stages.map((stage, i) => {
          const done = i < currentStage
          const active = i === currentStage
          return (
            <div
              key={i}
              className={cx(
                "flex items-center gap-3 rounded-xl px-4 py-3 transition-all",
                done
                  ? "opacity-50"
                  : active
                    ? "bg-brand-50 dark:bg-brand-50"
                    : "opacity-20",
              )}
            >
              <div
                className={cx(
                  "flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full text-[11px] font-bold",
                  done
                    ? "bg-emerald-500 text-white"
                    : active
                      ? "bg-brand-900 text-white"
                      : "border-2 border-slate-200 bg-surface text-slate-400 dark:border-slate-700 dark:bg-elevated",
                )}
              >
                {done ? <IconCheck className="h-3 w-3" /> : i + 1}
              </div>
              <span
                className={cx(
                  "text-[13px] font-medium",
                  active
                    ? "text-brand-300 dark:text-brand-400"
                    : "text-slate-600 dark:text-slate-400",
                )}
              >
                {stage}
              </span>
              {active && (
                <span className="ml-auto flex gap-0.5" aria-hidden="true">
                  {[0, 1, 2].map((d) => (
                    <span
                      key={d}
                      className="inline-block h-1.5 w-1.5 animate-bounce rounded-full bg-brand-400"
                      style={{ animationDelay: `${d * 150}ms` }}
                    />
                  ))}
                </span>
              )}
            </div>
          )
        })}
      </div>
      <button
        onClick={onCancel}
        className="mt-8 text-[13px] text-slate-500 hover:text-slate-700 dark:text-white/35 dark:hover:text-white/65"
      >
        {t("pr10c.building.cancel")}
      </button>
    </div>
  )
}

export function StepRow({
  index,
  step,
  expanded,
  onToggle,
  onChangeIntent,
  onDelete,
  onMove,
  canMoveUp,
  canMoveDown,
  editable,
}: {
  index: number
  step: EditableStep
  expanded: boolean
  onToggle: () => void
  onChangeIntent?: (intent: string) => void
  onDelete?: () => void
  onMove?: (direction: -1 | 1) => void
  canMoveUp?: boolean
  canMoveDown?: boolean
  editable?: boolean
}) {
  const { t } = useLang()
  return (
    <div className="rounded-xl border border-slate-100 bg-white transition-shadow hover:shadow-sm dark:border-white/[0.07] dark:bg-white/[0.04]">
      <button
        onClick={onToggle}
        aria-expanded={expanded}
        className="flex w-full items-center gap-4 px-5 py-4 text-left"
      >
        <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-slate-100 text-[12px] font-bold text-slate-500 dark:bg-white/10 dark:text-white/40">
          {String(index + 1).padStart(2, "0")}
        </span>
        <CapBadge cap={step.type} />
        <span className="flex-1 text-[14px] font-medium text-slate-800 dark:text-white/85">
          {step.intent}
        </span>
        {step.requiresDiscovery && (
          <span className="hidden rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-700 sm:inline dark:bg-amber-900/30 dark:text-amber-400">
            {t("pr10c.plan.needsDiscovery")}
          </span>
        )}
        <IconChevronDown
          className={cx(
            "h-4 w-4 flex-shrink-0 text-slate-400 transition-transform dark:text-white/25",
            expanded && "rotate-180",
          )}
        />
      </button>
      {expanded && (
        <div className="space-y-3 border-t border-slate-100 px-5 pb-4 pt-3 dark:border-white/[0.06]">
          {editable ? (
            <label className="block">
              <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-400 dark:text-white/30">
                {t("pr10c.plan.actionLabel")}
              </span>
              <input
                type="text"
                value={step.intent}
                onChange={(e) => onChangeIntent?.(e.target.value)}
                maxLength={500}
                className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-[13px] text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-400 dark:border-white/10 dark:bg-white/5 dark:text-white/75"
              />
            </label>
          ) : (
            <p className="text-[13px] text-slate-700 dark:text-white/70">
              {step.intent}
            </p>
          )}
          {editable && (onMove || onDelete) && (
            <div className="flex items-center gap-2">
              {onMove && (
                <>
                  <button
                    onClick={() => onMove(-1)}
                    disabled={!canMoveUp}
                    aria-label={t("pr10c.plan.moveUp")}
                    className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-[12px] font-medium text-slate-600 transition-colors hover:bg-slate-50 disabled:opacity-40 dark:border-white/10 dark:text-white/60 dark:hover:bg-white/5"
                  >
                    ↑
                  </button>
                  <button
                    onClick={() => onMove(1)}
                    disabled={!canMoveDown}
                    aria-label={t("pr10c.plan.moveDown")}
                    className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-[12px] font-medium text-slate-600 transition-colors hover:bg-slate-50 disabled:opacity-40 dark:border-white/10 dark:text-white/60 dark:hover:bg-white/5"
                  >
                    ↓
                  </button>
                </>
              )}
              {onDelete && (
                <button
                  onClick={onDelete}
                  aria-label={t("pr10c.plan.deleteAction")}
                  className="ms-auto rounded-lg border border-red-200 px-2.5 py-1.5 text-[12px] font-medium text-red-600 transition-colors hover:bg-red-50 dark:border-red-900/40 dark:text-red-400 dark:hover:bg-red-950/30"
                >
                  {t("pr10c.plan.delete")}
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function typeLabelKey(testType: ComposerTestType): string {
  return `pr10c.type.${testType === "UI" ? "userJourney" : testType === "API" ? "backendCheck" : "endToEnd"}`
}

export function ProposedView({
  testType,
  title,
  onTitleChange,
  intent,
  credentialName,
  steps,
  warnings,
  onStepsChange,
  onAddStep,
  onReview,
  onBack,
  onRevise,
  revising,
}: {
  testType: ComposerTestType
  title: string
  onTitleChange: (title: string) => void
  intent: string
  credentialName: string | null
  steps: EditableStep[]
  warnings: string[]
  onStepsChange: (steps: EditableStep[]) => void
  onAddStep: () => void
  onReview: () => void
  onBack: () => void
  onRevise: (text: string) => void
  revising?: boolean
}) {
  const { t } = useLang()
  const [expanded, setExpanded] = useState<string | null>(null)
  const [revision, setRevision] = useState("")
  // Outcomes are attached to their steps: deleting or reordering a step
  // automatically prunes/carries its expected result (F-7).
  const outcomes = outcomesOfSteps(steps)

  function moveStep(key: string, direction: -1 | 1) {
    const index = steps.findIndex((s) => s.key === key)
    const target = index + direction
    if (index < 0 || target < 0 || target >= steps.length) return
    const next = [...steps]
    const [moved] = next.splice(index, 1)
    next.splice(target, 0, moved)
    onStepsChange(next)
  }

  return (
    <div className="space-y-6">
      {warnings.length > 0 && (
        <div
          role="status"
          className="rounded-xl border border-amber-200 bg-amber-50 px-5 py-3 text-[13px] text-amber-700 dark:border-amber-900/30 dark:bg-amber-950/20 dark:text-amber-400"
        >
          {warnings.map((warning) => (
            <p key={warning} className="mt-0.5 first:mt-0">
              {warning}
            </p>
          ))}
        </div>
      )}

      <div className="rounded-xl border border-indigo-200 bg-indigo-50 px-5 py-4 dark:border-indigo-500/20 dark:bg-indigo-500/10">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <div className="mb-1 flex items-center gap-2">
              <span className="rounded bg-indigo-600 px-2 py-0.5 text-[11px] font-semibold text-white">
                {t(typeLabelKey(testType))}
              </span>
              <span className="text-[12px] text-indigo-600 dark:text-indigo-400">
                {t("pr10c.plan.actionsProposed", { count: steps.length })}
              </span>
            </div>
            <h3 className="text-[15px] font-semibold text-indigo-900 dark:text-indigo-100">
              {t("pr10c.plan.proposedTitle")}
            </h3>
            {intent && (
              <p className="mt-1 line-clamp-2 text-[13px] text-indigo-700/80 dark:text-indigo-300/70">
                {intent}
              </p>
            )}
          </div>
          {credentialName && (
            <div className="flex items-center gap-1.5 rounded-lg bg-white/60 px-2.5 py-1.5 dark:bg-white/8">
              <IconLock className="h-3.5 w-3.5 text-indigo-500" />
              <span className="text-[12px] font-medium text-indigo-700 dark:text-indigo-300">
                {credentialName}
              </span>
            </div>
          )}
        </div>
        <label className="mt-3 block">
          <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-indigo-700/70 dark:text-indigo-300/60">
            {t("pr10c.plan.testName")}
          </span>
          <input
            type="text"
            value={title}
            onChange={(e) => onTitleChange(e.target.value)}
            maxLength={120}
            className="w-full rounded-lg border border-indigo-200 bg-white px-3 py-2 text-[14px] font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-400 dark:border-white/10 dark:bg-white/5 dark:text-white/85"
          />
        </label>
      </div>

      <div className="space-y-2">
        {steps.map((step, index) => (
          <StepRow
            key={step.key}
            index={index}
            step={step}
            expanded={expanded === step.key}
            onToggle={() =>
              setExpanded(expanded === step.key ? null : step.key)
            }
            editable
            canMoveUp={index > 0}
            canMoveDown={index < steps.length - 1}
            onChangeIntent={(nextIntent) =>
              onStepsChange(
                steps.map((s) =>
                  s.key === step.key ? { ...s, intent: nextIntent } : s,
                ),
              )
            }
            onMove={(direction) => moveStep(step.key, direction)}
            onDelete={() =>
              onStepsChange(steps.filter((s) => s.key !== step.key))
            }
          />
        ))}
      </div>
      <button
        onClick={onAddStep}
        className="w-full rounded-xl border border-dashed border-slate-300 px-4 py-3 text-[13px] font-medium text-slate-500 transition-colors hover:border-brand-300 hover:text-brand-400 dark:border-white/10 dark:text-white/40 dark:hover:border-white/20 dark:hover:text-white/60"
      >
        {t("pr10c.plan.addAction")}
      </button>

      {outcomes.length > 0 && (
        <div>
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400 dark:text-white/30">
            {t("pr10c.plan.expectedResults")}
          </p>
          <ul className="space-y-1.5">
            {outcomes.map((outcome, i) => (
              <li
                key={i}
                className="flex items-start gap-2.5 rounded-xl border border-slate-100 bg-white px-4 py-3 text-[13px] text-slate-700 dark:border-white/[0.06] dark:bg-white/[0.03] dark:text-white/65"
              >
                <CapBadge cap={outcome.type} />
                <span>{outcome.intent}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-white/[0.07] dark:bg-white/[0.04]">
        <p className="mb-2 text-[13px] font-medium text-slate-700 dark:text-white/70">
          {t("pr10c.plan.reviseTitle")}
        </p>
        <div className="flex gap-2">
          <input
            type="text"
            value={revision}
            onChange={(e) => setRevision(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && revision.trim() && !revising) {
                onRevise(revision.trim())
                setRevision("")
              }
            }}
            placeholder={t("pr10c.plan.revisePlaceholder")}
            aria-label={t("pr10c.plan.reviseTitle")}
            className="flex-1 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-[13px] text-slate-700 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-400 dark:border-white/10 dark:bg-white/5 dark:text-white/75 dark:placeholder-white/25"
          />
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              if (revision.trim() && !revising) {
                onRevise(revision.trim())
                setRevision("")
              }
            }}
            disabled={!revision.trim() || revising}
          >
            {t("pr10c.plan.reviseAction")}
          </Button>
        </div>
      </div>

      <div className="flex items-center justify-between border-t border-slate-100 pt-4 dark:border-white/[0.06]">
        <button
          onClick={onBack}
          className="text-[13px] text-slate-500 hover:text-slate-700 dark:text-white/35 dark:hover:text-white/65"
        >
          ← {t("pr10c.plan.editIntent")}
        </button>
        <Button
          variant="primary"
          size="md"
          onClick={onReview}
          disabled={steps.length === 0}
        >
          {t("pr10c.plan.review")} →
        </Button>
      </div>
    </div>
  )
}

export function ReviewView({
  testType,
  title,
  intent,
  origin,
  credentialName,
  steps,
  onCreate,
  onBack,
  confirmError,
  onRetryConfirm,
  onDismissConfirmError,
}: {
  testType: ComposerTestType
  title: string
  intent: string
  origin: string | null
  credentialName: string | null
  steps: EditableStep[]
  onCreate: () => void
  onBack: () => void
  confirmError?: string | null
  onRetryConfirm?: () => void
  onDismissConfirmError?: () => void
}) {
  const { t } = useLang()
  const uiCount = steps.filter((s) => s.type === "UI").length
  const apiCount = steps.filter((s) => s.type === "API").length
  const outcomes = outcomesOfSteps(steps)

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-[18px] font-semibold text-slate-800 dark:text-white">
          {t("pr10c.review.title")}
        </h2>
        <p className="mt-1 text-[13px] text-slate-500 dark:text-white/40">
          {t("pr10c.review.subtitle")}
        </p>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-white/[0.07] dark:bg-white/[0.04]">
        <p className="mb-3 text-[11px] font-semibold uppercase tracking-widest text-slate-400 dark:text-white/30">
          {t("pr10c.review.testInformation")}
        </p>
        <div className="space-y-3">
          <div className="flex items-baseline gap-4">
            <span className="w-28 flex-shrink-0 text-[12px] text-slate-500 dark:text-white/35">
              {t("pr10c.review.name")}
            </span>
            <span className="text-[14px] font-medium text-slate-800 dark:text-white/85">
              {title}
            </span>
          </div>
          <div className="flex items-baseline gap-4">
            <span className="w-28 flex-shrink-0 text-[12px] text-slate-500 dark:text-white/35">
              {t("pr10c.review.type")}
            </span>
            <span className="rounded bg-indigo-600 px-2 py-0.5 text-[11px] font-semibold text-white">
              {t(typeLabelKey(testType))}
            </span>
          </div>
          <div className="flex items-baseline gap-4">
            <span className="w-28 flex-shrink-0 text-[12px] text-slate-500 dark:text-white/35">
              {t("pr10c.review.targetApplication")}
            </span>
            {origin ? (
              <span
                dir="ltr"
                className="truncate font-mono text-[13px] text-slate-700 dark:text-white/65"
              >
                {origin}
              </span>
            ) : (
              <span className="text-[13px] text-amber-600 dark:text-amber-400">
                {t("pr10c.review.targetMissing")}
              </span>
            )}
          </div>
          <div className="flex items-center gap-4">
            <span className="w-28 flex-shrink-0 text-[12px] text-slate-500 dark:text-white/35">
              {t("pr10c.review.authentication")}
            </span>
            {credentialName ? (
              <span className="flex items-center gap-1.5 text-[13px] text-slate-700 dark:text-white/65">
                <IconLock className="h-3.5 w-3.5 text-slate-400" />
                {credentialName}
              </span>
            ) : (
              <span className="text-[13px] text-slate-400 dark:text-white/25">
                {t("pr10c.review.notRequired")}
              </span>
            )}
          </div>
          <div className="flex items-center gap-4">
            <span className="w-28 flex-shrink-0 text-[12px] text-slate-500 dark:text-white/35">
              {t("pr10c.review.creation")}
            </span>
            <span className="text-[13px] text-slate-700 dark:text-white/65">
              {t("pr10c.review.aiTestBuilder")}
            </span>
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-white/[0.07] dark:bg-white/[0.04]">
        <div className="mb-3 flex items-center justify-between">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-slate-400 dark:text-white/30">
            {t("pr10c.review.executionPlan")}
          </p>
          <div className="flex items-center gap-2">
            <span className="text-[12px] font-medium text-slate-600 dark:text-white/50">
              {t("pr10c.plan.actionsCount", { count: steps.length })}
            </span>
            {uiCount > 0 && (
              <span className="rounded bg-teal-50 px-2 py-0.5 text-[11px] font-semibold text-teal-700 dark:bg-teal-900/40 dark:text-teal-300">
                {uiCount} UI
              </span>
            )}
            {apiCount > 0 && (
              <span className="rounded bg-indigo-50 px-2 py-0.5 text-[11px] font-semibold text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300">
                {apiCount} API
              </span>
            )}
          </div>
        </div>
        <div className="space-y-2">
          {steps.map((step, index) => (
            <div key={step.key} className="flex items-start gap-3 py-2">
              <span className="mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-slate-100 text-[10px] font-bold text-slate-500 dark:bg-white/10 dark:text-white/35">
                {index + 1}
              </span>
              <CapBadge cap={step.type} />
              <div className="min-w-0 flex-1">
                <p className="text-[13px] font-medium text-slate-700 dark:text-white/70">
                  {step.intent}
                </p>
              </div>
            </div>
          ))}
          {outcomes.map((outcome, i) => (
            <div key={`o-${i}`} className="flex items-start gap-3 py-2">
              <span className="mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-emerald-100 text-[10px] font-bold text-emerald-600 dark:bg-emerald-900/40 dark:text-emerald-400">
                ✓
              </span>
              <CapBadge cap={outcome.type} />
              <div className="min-w-0 flex-1">
                <p className="text-[13px] font-medium text-slate-700 dark:text-white/70">
                  {outcome.intent}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>

      <p className="rounded-xl bg-amber-50 px-4 py-3 text-[12px] text-amber-700 dark:bg-amber-900/20 dark:text-amber-400">
        {t("pr10c.review.draftNote")}
      </p>

      {confirmError && (
        <div
          role="alert"
          className="flex flex-wrap items-center gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 dark:border-red-900/40 dark:bg-red-950/30"
        >
          <p className="min-w-0 flex-1 text-[13px] text-red-700 dark:text-red-400">
            {confirmError}
          </p>
          {onRetryConfirm && (
            <Button variant="primary" size="sm" onClick={onRetryConfirm}>
              {t("pr10c.confirm.tryAgain")}
            </Button>
          )}
          {onDismissConfirmError && (
            <button
              onClick={onDismissConfirmError}
              aria-label={t("pr10c.confirm.dismiss")}
              className="rounded-lg px-2 py-1 text-[13px] text-red-500 hover:bg-red-100 dark:text-red-400 dark:hover:bg-red-900/40"
            >
              ✕
            </button>
          )}
        </div>
      )}

      <div className="flex items-center justify-between border-t border-slate-100 pt-4 dark:border-white/[0.06]">
        <button
          onClick={onBack}
          className="text-[13px] text-slate-500 hover:text-slate-700 dark:text-white/35 dark:hover:text-white/65"
        >
          ← {t("pr10c.review.back")}
        </button>
        <Button variant="primary" size="md" onClick={onCreate}>
          {t("pr10c.review.create")}
        </Button>
      </div>
    </div>
  )
}

export function SuccessView({
  testType,
  title,
  stepCount,
  onOpenDefinition,
  onViewDrafts,
  onCreateAnother,
}: {
  testType: ComposerTestType
  title: string
  stepCount: number
  onOpenDefinition: () => void
  onViewDrafts: () => void
  onCreateAnother: () => void
}) {
  const { t } = useLang()
  return (
    <div className="flex flex-col items-center py-16 text-center">
      <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-900/40">
        <IconCheck className="h-8 w-8 text-emerald-600 dark:text-emerald-400" />
      </div>
      <h2 className="mb-2 text-[22px] font-semibold text-slate-800 dark:text-white">
        {t("pr10c.success.title")}
      </h2>
      <p className="mb-8 max-w-sm text-[14px] text-slate-500 dark:text-white/40">
        {t("pr10c.success.subtitle")}
      </p>
      <div className="mb-8 w-full max-w-sm rounded-xl border border-slate-200 bg-white p-5 text-left dark:border-white/[0.07] dark:bg-white/[0.04]">
        <div className="mb-3 flex items-center gap-2">
          <span className="rounded bg-indigo-600 px-2 py-0.5 text-[11px] font-semibold text-white">
            {t(typeLabelKey(testType))}
          </span>
          <span className="rounded bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-700 dark:bg-amber-900/40 dark:text-amber-400">
            {t("pr10c.success.draftBadge")}
          </span>
        </div>
        <p className="mb-1 text-[14px] font-semibold text-slate-800 dark:text-white/85">
          {title}
        </p>
        <p className="text-[12px] text-slate-500 dark:text-white/35">
          {t("pr10c.plan.actionsCount", { count: stepCount })} ·{" "}
          {t("pr10c.review.aiTestBuilder")}
        </p>
      </div>
      <div className="flex flex-wrap items-center justify-center gap-3">
        <Button variant="primary" size="md" onClick={onOpenDefinition}>
          {t("pr10c.success.openTest")} →
        </Button>
        <Button variant="secondary" size="md" onClick={onViewDrafts}>
          {t("pr10c.success.viewDrafts")}
        </Button>
        <Button variant="ghost" size="md" onClick={onCreateAnother}>
          {t("pr10c.success.createAnother")}
        </Button>
      </div>
    </div>
  )
}

export function PlannerErrorView({
  title,
  description,
  onRetry,
  onEdit,
}: {
  title: string
  description?: string
  onRetry: () => void
  onEdit: () => void
}) {
  const { t } = useLang()
  return (
    <div className="flex flex-col items-center py-16 text-center">
      <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-red-50 dark:bg-red-900/30">
        <svg
          className="h-8 w-8 text-red-500 dark:text-red-400"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
        >
          <circle cx="12" cy="12" r="9" strokeLinecap="round" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4M12 16h.01" />
        </svg>
      </div>
      <h2 className="mb-2 text-[20px] font-semibold text-slate-800 dark:text-white">
        {title}
      </h2>
      {description && (
        <p className="mb-8 max-w-sm text-[14px] text-slate-500 dark:text-slate-400">
          {description}
        </p>
      )}
      <div className="flex items-center gap-3">
        <Button variant="primary" size="md" onClick={onRetry}>
          {t("common.retry")}
        </Button>
        <Button variant="secondary" size="md" onClick={onEdit}>
          {t("pr10c.plan.editIntent")}
        </Button>
      </div>
    </div>
  )
}

export function ClarificationView({
  questions,
  onContinue,
  onCancel,
  answering,
}: {
  questions: { question: string; category: string | null; answer: string }[]
  onContinue: (answers: { question: string; answer: string }[]) => void
  onCancel: () => void
  answering?: boolean
}) {
  const { t } = useLang()
  const [answers, setAnswers] = useState<Record<number, string>>({})

  return (
    <div className="flex flex-col items-center py-16 text-center">
      <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-blue-50 dark:bg-blue-950/40">
        <svg
          className="h-8 w-8 text-blue-500 dark:text-blue-400"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
        >
          <circle cx="12" cy="12" r="10" strokeLinecap="round" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M9.09 9a3 3 0 015.83 1c0 2-3 3-3 3" />
          <circle cx="12" cy="17" r=".5" fill="currentColor" stroke="none" />
        </svg>
      </div>
      <h2 className="mb-2 max-w-sm text-[20px] font-semibold leading-snug text-slate-800 dark:text-white">
        {t("pr10c.clarification.title")}
      </h2>
      <p className="mb-6 max-w-sm text-[14px] text-slate-500 dark:text-slate-400">
        {t("pr10c.clarification.subtitle")}
      </p>
      <div className="mb-8 w-full max-w-sm space-y-3 text-left">
        {questions.map((item, i) => (
          <div
            key={i}
            className="rounded-xl border border-slate-100 bg-white/60 px-4 py-3 dark:border-white/[0.06] dark:bg-white/[0.04]"
          >
            <div className="mb-1.5 flex items-center gap-2">
              <span className="rounded bg-blue-50 px-2 py-0.5 text-[11px] font-semibold text-blue-600 dark:bg-blue-900/40 dark:text-blue-400">
                {categoryLabel(t, item.category)}
              </span>
            </div>
            <p className="mb-2 text-[13px] font-medium text-slate-700 dark:text-white/70">
              {item.question}
            </p>
            <input
              type="text"
              value={answers[i] ?? item.answer}
              onChange={(e) =>
                setAnswers((prev) => ({ ...prev, [i]: e.target.value }))
              }
              placeholder={t("pr10c.clarification.answerPlaceholder")}
              aria-label={item.question}
              className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-[13px] text-slate-700 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-400 dark:border-white/10 dark:bg-white/5 dark:text-white/75 dark:placeholder-white/25"
            />
          </div>
        ))}
      </div>
      <div className="flex items-center gap-3">
        <Button
          variant="primary"
          size="md"
          disabled={answering}
          onClick={() =>
            onContinue(
              questions.map((item, i) => ({
                question: item.question,
                answer: answers[i] ?? item.answer ?? "",
              })),
            )
          }
        >
          {t("pr10c.clarification.continue")}
        </Button>
        <Button variant="secondary" size="md" onClick={onCancel}>
          {t("common.cancel")}
        </Button>
      </div>
    </div>
  )
}

export function PreflightUrlView({ onBack }: { onBack: () => void }) {
  const { t } = useLang()
  return (
    <div className="flex flex-col items-center py-16 text-center">
      <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-amber-50 dark:bg-amber-900/20">
        <svg
          className="h-8 w-8 text-amber-500 dark:text-amber-400"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M12 9v4M12 17h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"
          />
        </svg>
      </div>
      <h2 className="mb-2 text-[20px] font-semibold text-slate-800 dark:text-white">
        {t("pr10c.preflight.targetMissingTitle")}
      </h2>
      <p className="mb-8 max-w-sm text-[14px] text-slate-500 dark:text-slate-400">
        {t("pr10c.preflight.targetMissingBody")}
      </p>
      <div className="flex items-center gap-3">
        <Button variant="secondary" size="md" onClick={onBack}>
          {t("common.back")}
        </Button>
      </div>
    </div>
  )
}

export type { PlanCredentialReference }
