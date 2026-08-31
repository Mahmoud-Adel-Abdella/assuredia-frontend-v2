import React, { useState } from "react"
import { Button, Card, Select, Textarea, cx } from "./primitives"
import { useLang } from "../lib/i18n"
import { apiSubmitFeedback } from "../lib/api"

/**
 * Client Feedback page (Figma: "Feedback", Support section).
 * Submits user rating, feedback category, and message to the Assuredia backend.
 */

type Rating = 1 | 2 | 3 | 4 | 5

const RATING_KEYS: { value: Rating; emoji: string; labelKey: string }[] = [
  { value: 1, emoji: "😞", labelKey: "feedback.rate1" },
  { value: 2, emoji: "😕", labelKey: "feedback.rate2" },
  { value: 3, emoji: "😐", labelKey: "feedback.rate3" },
  { value: 4, emoji: "🙂", labelKey: "feedback.rate4" },
  { value: 5, emoji: "😍", labelKey: "feedback.rate5" },
]

const CATEGORY_OPTIONS: { value: string; labelKey: string }[] = [
  { value: "general", labelKey: "feedback.category.general" },
  { value: "feature-request", labelKey: "feedback.category.featureRequest" },
  { value: "ui-ux", labelKey: "feedback.category.uiux" },
  { value: "performance", labelKey: "feedback.category.performance" },
  { value: "monitoring", labelKey: "feedback.category.monitoring" },
  { value: "ai-analysis", labelKey: "feedback.category.aiAnalysis" },
  { value: "other", labelKey: "feedback.category.other" },
]

function SuccessState({ onReset }: { onReset: () => void }) {
  const { t } = useLang()
  return (
    <div className="flex flex-col items-center gap-5 py-16 text-center">
      <div className="flex size-16 items-center justify-center rounded-full bg-emerald-50 ring-1 ring-emerald-200">
        <svg
          className="size-8 text-emerald-500"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <polyline points="20 6 9 17 4 12" />
        </svg>
      </div>
      <div>
        <h2 className="text-[18px] font-bold text-navy">{t("feedback.successTitle")}</h2>
        <p className="mt-1.5 text-[14px] text-slate-500">{t("feedback.successDesc")}</p>
      </div>
      <Button variant="secondary" size="md" onClick={onReset}>
        {t("feedback.sendMore")}
      </Button>
    </div>
  )
}

export function Feedback() {
  const { t } = useLang()
  const [rating, setRating] = useState<Rating | null>(null)
  const [hovered, setHovered] = useState<Rating | null>(null)
  const [message, setMessage] = useState("")
  const [category, setCategory] = useState("general")
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [submitted, setSubmitted] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (rating === null) {
      setError("Please select a rating before submitting.")
      return
    }
    if (!message.trim()) {
      setError("Please enter your feedback message.")
      return
    }

    setSubmitting(true)
    setError(null)
    try {
      await apiSubmitFeedback({
        rating,
        category,
        message: message.trim(),
      })
      setSubmitted(true)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to submit feedback. Please try again.")
    } finally {
      setSubmitting(false)
    }
  }

  function handleReset() {
    setRating(null)
    setHovered(null)
    setMessage("")
    setCategory("general")
    setError(null)
    setSubmitted(false)
  }

  return (
    <div>
      {/* Page header */}
      <div className="mb-6">
        <h1 className="font-display text-2xl font-bold tracking-tight text-navy">{t("page.feedback.title")}</h1>
        <p className="mt-1 text-[14px] text-slate-500">{t("page.feedback.subtitle")}</p>
      </div>

      <div className="max-w-[640px]">
        <Card className="p-6 sm:p-8">
          {submitted ? (
            <SuccessState onReset={handleReset} />
          ) : (
            <form onSubmit={handleSubmit} noValidate>
              <p className="mb-6 text-[14px] leading-relaxed text-slate-500">{t("feedback.intro")}</p>

              {/* Rating */}
              <fieldset className="mb-6">
                <legend className="mb-3 text-[13px] font-semibold text-navy">{t("feedback.ratingQuestion")}</legend>
                <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={t("feedback.ratingGroupLabel")}>
                  {RATING_KEYS.map(({ value, emoji, labelKey }) => {
                    const isActive = rating === value
                    const isHighlighted =
                      hovered !== null ? value <= hovered : rating !== null ? value <= rating : false
                    return (
                      <button
                        key={value}
                        type="button"
                        role="radio"
                        aria-checked={isActive}
                        aria-label={t(labelKey)}
                        title={t(labelKey)}
                        onClick={() => setRating(value)}
                        onMouseEnter={() => setHovered(value)}
                        onMouseLeave={() => setHovered(null)}
                        className={cx(
                          "flex h-14 w-14 select-none flex-col items-center justify-center gap-0.5 rounded-xl border text-[22px] transition-all duration-100",
                          isActive
                            ? "border-brand-300 bg-brand-50 shadow-sm ring-1 ring-brand-300"
                            : isHighlighted
                              ? "border-brand-200 bg-brand-50/40"
                              : "border-slate-200 bg-surface hover:border-slate-300 hover:bg-slate-50",
                        )}
                      >
                        <span aria-hidden="true">{emoji}</span>
                        <span className="sr-only">{t(labelKey)}</span>
                        {isActive && (
                          <span className="text-[9px] font-semibold leading-none text-brand-400">{value}</span>
                        )}
                      </button>
                    )
                  })}
                </div>
                {rating !== null && (
                  <p className="mt-2 text-[12px] text-slate-400" aria-live="polite">
                    {t(RATING_KEYS.find((r) => r.value === rating)?.labelKey ?? "")}
                  </p>
                )}
              </fieldset>

              {/* Message */}
              <div className="mb-5">
                <label htmlFor="feedback-message" className="mb-1.5 block text-[13px] font-semibold text-navy">
                  {t("feedback.messageLabel")}
                </label>
                <Textarea
                  id="feedback-message"
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder={t("feedback.messagePlaceholder")}
                  rows={5}
                  className="text-[14px]"
                />
              </div>

              {/* Category */}
              <div className="mb-7">
                <label htmlFor="feedback-category" className="mb-1.5 block text-[13px] font-semibold text-navy">
                  {t("feedback.categoryLabel")}
                </label>
                <Select
                  id="feedback-category"
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  options={CATEGORY_OPTIONS.map((c) => ({ value: c.value, label: t(c.labelKey) }))}
                />
              </div>

              {error && (
                <div className="mb-5 rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-[13px] text-red-600">
                  {error}
                </div>
              )}

              {/* Submit */}
              <div className="flex justify-end">
                <Button type="submit" variant="primary" size="lg" disabled={submitting}>
                  {submitting ? "Submitting..." : t("feedback.submit")}
                </Button>
              </div>
            </form>
          )}
        </Card>
      </div>
    </div>
  )
}

export default Feedback
