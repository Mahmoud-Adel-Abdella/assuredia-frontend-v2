import React from "react"
import { cx } from "../primitives"
import { useLang } from "../../lib/i18n"
import {
  evidenceTruncationCounts,
  formatEvidenceDuration,
  type PlanEvidence,
} from "../../lib/planner"

export function EvidenceSummaryStrip({
  evidence,
  onView,
}: {
  evidence: PlanEvidence
  onView: () => void
}) {
  const { t } = useLang()
  const counts = evidenceTruncationCounts(evidence)

  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 dark:border-white/[0.08] dark:bg-white/[0.04]">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-[12px] text-slate-600 dark:text-white/60">
          <span className="font-semibold text-slate-800 dark:text-white/80">
            {t("evidence.title")}
          </span>
          <span dir="ltr">{t("evidence.elements.count", { count: evidence.elementsFound })}</span>
          <span dir="ltr">{t("evidence.summary.backendOperations", { count: evidence.backendOperations.length })}</span>
          <span dir="ltr">{t("evidence.summary.networkRequests", { count: evidence.networkRequests.length })}</span>
          <span dir="ltr">{formatEvidenceDuration(evidence.discoveryDurationMs)}</span>
          {counts.isPartial && (
            <span className="font-medium text-amber-700 dark:text-amber-300">
              {t("evidence.partial")}
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={onView}
          className={cx(
            "rounded-lg px-3 py-2 text-[12px] font-semibold text-brand-700 transition-colors",
            "hover:bg-brand-100 focus:outline-none focus:ring-2 focus:ring-brand-400",
            "dark:text-brand-300 dark:hover:bg-brand-400/10",
          )}
        >
          {t("evidence.toggle")} <span aria-hidden="true">›</span>
        </button>
      </div>
    </div>
  )
}
