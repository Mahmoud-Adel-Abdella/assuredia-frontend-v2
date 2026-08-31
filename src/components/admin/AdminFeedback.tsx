import React, { useCallback, useEffect, useMemo, useState } from "react"
import { Button, Card, cx } from "../primitives"
import {
  apiListAdminFeedback,
  apiGetAdminFeedbackDetail,
  FeedbackCategory,
  FeedbackEntry,
  FeedbackRating,
  FeedbackSummary,
} from "../../lib/api"

/* ------------------------------------------------------------------ */
/* Rating helpers                                                     */
/* ------------------------------------------------------------------ */
const RATING_META: Record<FeedbackRating, { emoji: string; label: string; color: string }> = {
  1: { emoji: "😞", label: "Very dissatisfied", color: "text-red-500" },
  2: { emoji: "😕", label: "Dissatisfied",      color: "text-orange-500" },
  3: { emoji: "😐", label: "Neutral",           color: "text-slate-500" },
  4: { emoji: "🙂", label: "Satisfied",         color: "text-emerald-600" },
  5: { emoji: "😍", label: "Very satisfied",    color: "text-brand-400" },
}

function RatingPill({ rating }: { rating: FeedbackRating }) {
  const meta = RATING_META[rating] ?? { emoji: "😐", label: "Neutral", color: "text-slate-500" }
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-[13px]" aria-label={meta.label}>
      <span aria-hidden="true">{meta.emoji}</span>
      <span className={cx("font-semibold", meta.color)}>{rating}</span>
    </span>
  )
}

const ALL_CATEGORIES: FeedbackCategory[] = [
  "General",
  "Feature Request",
  "UI / UX",
  "Performance",
  "Monitoring",
  "AI Analysis",
  "Other",
]

function formatDate(iso: string): string {
  try {
    const d = new Date(iso)
    if (isNaN(d.getTime())) return iso
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
  } catch {
    return iso
  }
}

/* ------------------------------------------------------------------ */
/* Detail modal                                                       */
/* ------------------------------------------------------------------ */
function FeedbackDetail({ entry, onClose }: { entry: FeedbackEntry; onClose: () => void }) {
  const meta = RATING_META[entry.rating] ?? { emoji: "😐", label: "Neutral", color: "text-slate-500" }
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-[#020a16]/70 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />
      <div className="relative w-full max-w-lg rounded-2xl bg-surface p-6 shadow-2xl">
        {/* Header */}
        <div className="mb-5 flex items-start justify-between gap-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-slate-400">{entry.id}</p>
            <h2 className="mt-0.5 font-display text-[17px] font-bold text-navy">Client Feedback</h2>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
          >
            <svg className="size-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Rating */}
        <div className="mb-4 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
          <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.1em] text-slate-400">Rating</p>
          <div className="flex items-center gap-2">
            <span className="text-[26px]" aria-hidden="true">{meta.emoji}</span>
            <span className={cx("text-[15px] font-bold", meta.color)}>{meta.label}</span>
          </div>
        </div>

        {/* Fields */}
        <dl className="space-y-4">
          <div>
            <dt className="mb-1 text-[11px] font-semibold uppercase tracking-[0.1em] text-slate-400">Category</dt>
            <dd>
              <span className="inline-flex items-center rounded-md bg-brand-50 px-2.5 py-1 text-[12px] font-semibold text-brand-300 ring-1 ring-inset ring-brand-600/10">
                {entry.category}
              </span>
            </dd>
          </div>
          <div>
            <dt className="mb-1 text-[11px] font-semibold uppercase tracking-[0.1em] text-slate-400">Feedback</dt>
            <dd className="rounded-lg border border-slate-200 bg-slate-50 px-3.5 py-3 text-[14px] leading-relaxed text-slate-700">
              {entry.message}
            </dd>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <dt className="mb-1 text-[11px] font-semibold uppercase tracking-[0.1em] text-slate-400">Client</dt>
              <dd className="text-[14px] font-semibold text-navy">{entry.client}</dd>
              {entry.submittedByEmail && (
                <p className="text-[12px] text-slate-400 truncate">{entry.submittedByEmail}</p>
              )}
            </div>
            <div>
              <dt className="mb-1 text-[11px] font-semibold uppercase tracking-[0.1em] text-slate-400">Submitted</dt>
              <dd className="text-[14px] text-slate-600">{formatDate(entry.submittedAt)}</dd>
            </div>
          </div>
        </dl>

        <div className="mt-6 flex justify-end">
          <Button variant="secondary" size="sm" onClick={onClose}>Close</Button>
        </div>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Empty state                                                        */
/* ------------------------------------------------------------------ */
function EmptyState() {
  return (
    <div className="flex flex-col items-center gap-3 py-20 text-center">
      <div className="flex size-14 items-center justify-center rounded-full bg-slate-100">
        <svg className="size-7 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
          <path strokeLinecap="round" strokeLinejoin="round" d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M8 10h8M8 14h5" />
        </svg>
      </div>
      <div>
        <p className="font-semibold text-navy">No feedback yet</p>
        <p className="mt-1 text-[13px] text-slate-500">Client feedback will appear here when submitted.</p>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Main page                                                          */
/* ------------------------------------------------------------------ */
export function AdminFeedback() {
  const [categoryFilter, setCategoryFilter] = useState<"All" | FeedbackCategory>("All")
  const [search, setSearch] = useState("")
  const [entries, setEntries] = useState<FeedbackEntry[]>([])
  const [summary, setSummary] = useState<FeedbackSummary>({
    totalSubmissions: 0,
    averageRating: null,
    featureRequests: 0,
    thisWeek: 0,
  })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [detail, setDetail] = useState<FeedbackEntry | null>(null)

  const loadFeedback = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await apiListAdminFeedback({
        category: categoryFilter === "All" ? undefined : categoryFilter,
        search: search.trim() || undefined,
        limit: 100,
      })
      setEntries(res.entries)
      setSummary(res.summary)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to load feedback")
    } finally {
      setLoading(false)
    }
  }, [categoryFilter, search])

  useEffect(() => {
    loadFeedback()
  }, [loadFeedback])

  const openDetail = async (item: FeedbackEntry) => {
    try {
      const fresh = await apiGetAdminFeedbackDetail(item.id)
      setDetail(fresh)
    } catch {
      setDetail(item)
    }
  }

  return (
    <div>
      {/* Page header */}
      <div className="mb-6 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight text-navy">Feedback</h1>
          <p className="mt-1 text-[14px] text-slate-500">Review client feedback and product suggestions</p>
        </div>
        <Button variant="secondary" size="sm" onClick={loadFeedback} disabled={loading}>
          {loading ? "Refreshing..." : "Refresh"}
        </Button>
      </div>

      {/* Summary stats */}
      <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
        {[
          { label: "Total submissions", value: summary.totalSubmissions },
          { label: "Avg. rating", value: summary.averageRating != null ? summary.averageRating.toFixed(1) : "—" },
          { label: "Feature requests", value: summary.featureRequests },
          { label: "This week", value: summary.thisWeek },
        ].map(({ label, value }) => (
          <Card key={label} className="px-4 py-3.5">
            <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-slate-400">{label}</p>
            <p className="mt-1 font-display text-[22px] font-bold text-navy">{value}</p>
          </Card>
        ))}
      </div>

      {/* Filters & Search */}
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-1.5">
          {(["All", ...ALL_CATEGORIES] as const).map((cat) => (
            <button
              key={cat}
              onClick={() => setCategoryFilter(cat)}
              className={cx(
                "rounded-full px-3.5 py-1.5 text-[12px] font-semibold transition-colors",
                categoryFilter === cat
                  ? "bg-brand-900 text-white shadow-sm"
                  : "bg-surface border border-slate-200 text-slate-600 hover:border-slate-300 hover:bg-slate-50",
              )}
            >
              {cat}
            </button>
          ))}
        </div>
        <div className="w-full sm:w-64">
          <input
            type="text"
            placeholder="Search feedback..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-lg border border-slate-200 bg-surface px-3 py-1.5 text-[13px] text-navy placeholder:text-slate-400 focus:border-brand-300 focus:outline-none"
          />
        </div>
      </div>

      {/* Error alert */}
      {error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-4 text-[13px] text-red-600">
          {error}
        </div>
      )}

      {/* Table */}
      <Card className="overflow-hidden">
        {loading && entries.length === 0 ? (
          <div className="py-20 text-center text-[14px] text-slate-400">Loading feedback submissions...</div>
        ) : entries.length === 0 ? (
          <EmptyState />
        ) : (
          <>
            {/* Desktop table */}
            <div className="hidden sm:block">
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50/60">
                    {["Rating", "Category", "Client", "Feedback", "Date"].map((col) => (
                      <th
                        key={col}
                        className="px-5 py-3 text-[11px] font-semibold uppercase tracking-[0.1em] text-slate-400"
                      >
                        {col}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {entries.map((entry) => (
                    <tr
                      key={entry.id}
                      onClick={() => openDetail(entry)}
                      className="cursor-pointer transition-colors hover:bg-slate-50"
                    >
                      <td className="px-5 py-3.5">
                        <RatingPill rating={entry.rating} />
                      </td>
                      <td className="px-5 py-3.5">
                        <span className="inline-flex items-center rounded-md bg-brand-50 px-2 py-0.5 text-[11px] font-semibold text-brand-300 ring-1 ring-inset ring-brand-600/10">
                          {entry.category}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 text-[13px] font-semibold text-navy whitespace-nowrap">
                        {entry.client}
                      </td>
                      <td className="max-w-[340px] px-5 py-3.5">
                        <p className="truncate text-[13px] text-slate-600">{entry.message}</p>
                      </td>
                      <td className="px-5 py-3.5 text-[12px] whitespace-nowrap text-slate-400">
                        {formatDate(entry.submittedAt)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile card list */}
            <div className="divide-y divide-slate-100 sm:hidden">
              {entries.map((entry) => (
                <button
                  key={entry.id}
                  onClick={() => openDetail(entry)}
                  className="flex w-full flex-col gap-2 px-4 py-4 text-left transition-colors hover:bg-slate-50"
                >
                  <div className="flex items-center justify-between gap-3">
                    <RatingPill rating={entry.rating} />
                    <span className="inline-flex items-center rounded-md bg-brand-50 px-2 py-0.5 text-[11px] font-semibold text-brand-300 ring-1 ring-inset ring-brand-600/10">
                      {entry.category}
                    </span>
                    <span className="ml-auto text-[11px] text-slate-400">{formatDate(entry.submittedAt)}</span>
                  </div>
                  <p className="text-[13px] font-semibold text-navy">{entry.client}</p>
                  <p className="line-clamp-2 text-[13px] text-slate-500">{entry.message}</p>
                </button>
              ))}
            </div>
          </>
        )}
      </Card>

      {/* Detail modal */}
      {detail && <FeedbackDetail entry={detail} onClose={() => setDetail(null)} />}
    </div>
  )
}

export default AdminFeedback
