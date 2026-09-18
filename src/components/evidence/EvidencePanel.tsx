import React, { useEffect, useId, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { cx } from "../primitives"
import { useLang } from "../../lib/i18n"
import {
  evidenceStatusKind,
  evidenceTruncationCounts,
  formatEvidenceDuration,
  type CatalogOperationView,
  type DiscoveredElementView,
  type NetworkRequestView,
  type PlanEvidence,
} from "../../lib/planner"
import { EvidenceSummaryStrip } from "./EvidenceSummaryStrip"

type EvidenceTab = "overview" | "app" | "backend" | "network"

function methodClass(method: string): string {
  switch (method.toUpperCase()) {
    case "GET": return "text-emerald-700 dark:text-emerald-300"
    case "POST": return "text-blue-700 dark:text-blue-300"
    case "PUT": return "text-amber-700 dark:text-amber-300"
    case "PATCH": return "text-purple-700 dark:text-purple-300"
    case "DELETE": return "text-red-700 dark:text-red-300"
    default: return "text-slate-600 dark:text-white/60"
  }
}

function statusClass(status: number): string {
  switch (evidenceStatusKind(status)) {
    case "success": return "text-emerald-700 bg-emerald-50 dark:text-emerald-300 dark:bg-emerald-900/30"
    case "warning": return "text-amber-700 bg-amber-50 dark:text-amber-300 dark:bg-amber-900/30"
    case "error": return "text-red-700 bg-red-50 dark:text-red-300 dark:bg-red-900/30"
    default: return "text-slate-600 bg-slate-100 dark:text-white/60 dark:bg-white/10"
  }
}

function IdentityRow({ label, value }: { label: string; value: string | null }) {
  if (!value) return null
  return (
    <div className="flex min-w-0 items-start gap-3 text-[13px]">
      <span className="w-28 flex-shrink-0 text-slate-500 dark:text-white/35">{label}</span>
      <span dir="ltr" className="min-w-0 break-all font-mono text-slate-700 dark:text-white/70">{value}</span>
    </div>
  )
}

function ElementCard({ element }: { element: DiscoveredElementView }) {
  const { t } = useLang()
  const [open, setOpen] = useState(false)
  return (
    <div className="rounded-xl border border-slate-200 bg-white dark:border-white/[0.07] dark:bg-white/[0.03]">
      <button
        type="button"
        className="flex w-full items-start justify-between gap-3 p-3 text-start"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <span className="min-w-0">
          <span className="block truncate text-[13px] font-medium text-slate-800 dark:text-white/80">
            {element.name || t("evidence.elements.noCandidate")}
          </span>
          <span className="mt-1 block text-[11px] text-slate-500 dark:text-white/35">{element.role}</span>
        </span>
        <span className="flex flex-shrink-0 items-center gap-2">
          <span className="rounded-full bg-brand-50 px-2 py-0.5 text-[10px] font-semibold text-brand-700 dark:bg-brand-400/10 dark:text-brand-300">
            {t("evidence.elements.suggested")}
          </span>
          <span aria-hidden="true" className={cx("text-slate-400 transition-transform", open && "rotate-180")}>⌄</span>
        </span>
      </button>
      {open && (
        <div className="space-y-3 border-t border-slate-100 px-3 pb-3 pt-3 dark:border-white/[0.06]">
          <div className="flex flex-wrap gap-2 text-[11px]">
            <span className="rounded bg-slate-100 px-2 py-1 text-slate-600 dark:bg-white/10 dark:text-white/60">{element.role}</span>
            {element.strength && <span className="rounded bg-emerald-50 px-2 py-1 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300">{element.strength}</span>}
          </div>
          {element.strategy && element.value ? (
            <div>
              <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400 dark:text-white/30">{t("evidence.elements.candidate")}</p>
              <p dir="ltr" className="break-all rounded-lg bg-slate-50 p-2 font-mono text-[11px] text-slate-600 dark:bg-black/20 dark:text-white/60">
                {element.strategy}: {element.value}
              </p>
            </div>
          ) : (
            <p className="text-[12px] text-slate-500 dark:text-white/40">{t("evidence.elements.noCandidate")}</p>
          )}
        </div>
      )}
    </div>
  )
}

function Overview({ evidence }: { evidence: PlanEvidence }) {
  const { t } = useLang()
  const counts = evidenceTruncationCounts(evidence)
  const stats = [
    [t("evidence.elements.title"), String(evidence.elementsFound)],
    [t("evidence.backend"), String(evidence.backendOperations.length)],
    [t("evidence.network"), String(evidence.networkRequests.length)],
    [t("evidence.header.duration"), formatEvidenceDuration(evidence.discoveryDurationMs)],
  ]
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {stats.map(([label, value]) => (
          <div key={label} className="rounded-xl bg-slate-50 p-3 dark:bg-white/[0.04]">
            <p className="text-[11px] text-slate-500 dark:text-white/35">{label}</p>
            <p dir="ltr" className="mt-1 text-[18px] font-semibold text-slate-800 dark:text-white/80">{value}</p>
          </div>
        ))}
      </div>
      {counts.isPartial && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-[12px] text-amber-800 dark:border-amber-400/20 dark:bg-amber-900/20 dark:text-amber-200">
          {t("evidence.elements.truncated", { shown: counts.shown, total: counts.total })}
        </div>
      )}
      <div className="space-y-2">
        <IdentityRow label={t("evidence.header.origin")} value={evidence.origin} />
        <IdentityRow label={t("evidence.header.pageTitle")} value={evidence.pageTitle} />
        <IdentityRow label={t("evidence.header.pageUrl")} value={evidence.pageUrl} />
      </div>
      {!evidence.origin && !evidence.pageTitle && !evidence.pageUrl && evidence.backendOperations.length === 0 && evidence.discoveredElements.length === 0 && evidence.networkRequests.length === 0 && (
        <div className="rounded-xl border border-slate-200 px-4 py-6 text-center dark:border-white/[0.08]">
          <p className="text-[14px] font-medium text-slate-700 dark:text-white/70">{t("evidence.empty.title")}</p>
          <p className="mt-1 text-[12px] text-slate-500 dark:text-white/40">{t("evidence.empty.body")}</p>
        </div>
      )}
    </div>
  )
}

function AppDiscovery({ evidence }: { evidence: PlanEvidence }) {
  const { t } = useLang()
  const counts = evidenceTruncationCounts(evidence)
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-[12px] text-slate-500 dark:text-white/45">
        <IdentityRow label={t("evidence.header.pageTitle")} value={evidence.pageTitle} />
        <IdentityRow label={t("evidence.header.pageUrl")} value={evidence.pageUrl} />
      </div>
      {counts.isPartial && <p className="rounded-lg bg-amber-50 px-3 py-2 text-[12px] text-amber-700 dark:bg-amber-900/20 dark:text-amber-300">{t("evidence.elements.truncated", { shown: counts.shown, total: counts.total })}</p>}
      {evidence.discoveredElements.length === 0 ? (
        <p className="rounded-xl border border-slate-200 px-4 py-6 text-center text-[13px] text-slate-500 dark:border-white/[0.08] dark:text-white/40">{t("evidence.elements.empty")}</p>
      ) : (
        <div className="space-y-2">{evidence.discoveredElements.map((element) => <ElementCard key={element.elementId} element={element} />)}</div>
      )}
    </div>
  )
}

function BackendDiscovery({ operations }: { operations: CatalogOperationView[] }) {
  const { t } = useLang()
  if (operations.length === 0) return <p className="rounded-xl border border-slate-200 px-4 py-6 text-center text-[13px] text-slate-500 dark:border-white/[0.08] dark:text-white/40">{t("evidence.backend.empty")}</p>
  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-white/[0.08]">
      <table className="min-w-full text-start text-[12px]">
        <thead className="bg-slate-50 text-slate-500 dark:bg-white/[0.04] dark:text-white/40">
          <tr><th className="px-3 py-2 font-medium">{t("evidence.backend.method")}</th><th className="px-3 py-2 font-medium">{t("evidence.backend.path")}</th><th className="px-3 py-2 font-medium">{t("evidence.backend.summary")}</th><th className="px-3 py-2 font-medium">{t("evidence.backend.tags")}</th><th className="px-3 py-2 font-medium">{t("evidence.backend.statuses")}</th></tr>
        </thead>
        <tbody className="divide-y divide-slate-100 dark:divide-white/[0.06]">
          {operations.map((operation, index) => <tr key={`${operation.method}-${operation.path}-${index}`}><td dir="ltr" className={cx("px-3 py-2 font-semibold", methodClass(operation.method))}>{operation.method}</td><td dir="ltr" className="whitespace-nowrap px-3 py-2 font-mono text-slate-700 dark:text-white/70">{operation.path}</td><td className="px-3 py-2 text-slate-600 dark:text-white/55">{operation.summary}</td><td className="px-3 py-2"><span className="flex flex-wrap gap-1">{operation.tags.map((tag) => <span key={tag} className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-600 dark:bg-white/10 dark:text-white/60">{tag}</span>)}</span></td><td dir="ltr" className="px-3 py-2"><span className="flex flex-wrap gap-1">{operation.expectedStatuses.map((status) => <span key={status} className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-600 dark:bg-white/10 dark:text-white/60">{status}</span>)}</span></td></tr>)}
        </tbody>
      </table>
    </div>
  )
}

function NetworkActivity({ requests }: { requests: NetworkRequestView[] }) {
  const { t } = useLang()
  if (requests.length === 0) return <p className="rounded-xl border border-slate-200 px-4 py-6 text-center text-[13px] text-slate-500 dark:border-white/[0.08] dark:text-white/40">{t("evidence.network.empty")}</p>
  return (
    <div className="space-y-2">
      {requests.map((request, index) => {
        const failed = request.status === 0
        return <div key={`${request.method}-${request.url}-${index}`} className="flex flex-col gap-2 rounded-xl border border-slate-200 p-3 sm:flex-row sm:items-center dark:border-white/[0.08]">
          <span dir="ltr" className={cx("w-14 flex-shrink-0 text-[11px] font-bold", methodClass(request.method))}>{request.method}</span>
          <span dir="ltr" className="min-w-0 flex-1 break-all font-mono text-[11px] text-slate-600 dark:text-white/60">{request.url}</span>
          <span dir="ltr" className={cx("w-fit rounded px-2 py-1 text-[10px] font-semibold", statusClass(request.status))}>{failed ? t("evidence.network.failed") : request.status}</span>
        </div>
      })}
    </div>
  )
}

export function EvidencePanel({ evidence, open, onOpen, onClose }: { evidence: PlanEvidence; open: boolean; onOpen: () => void; onClose: () => void }) {
  const { t } = useLang()
  const [tab, setTab] = useState<EvidenceTab>("overview")
  const panelRef = useRef<HTMLDivElement>(null)
  const restoreRef = useRef<Element | null>(null)
  const titleId = useId()

  useEffect(() => {
    if (!open) return
    restoreRef.current = document.activeElement
    panelRef.current?.querySelector<HTMLElement>("button")?.focus()
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") { event.preventDefault(); onClose() }
      if (event.key !== "Tab" || !panelRef.current) return
      const focusable = Array.from(panelRef.current.querySelectorAll<HTMLElement>("button, [href], input, select, textarea, [tabindex]:not([tabindex='-1'])"))
      if (!focusable.length) return
      const first = focusable[0]; const last = focusable[focusable.length - 1]
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
    }
    document.addEventListener("keydown", onKeyDown)
    return () => { document.removeEventListener("keydown", onKeyDown); if (restoreRef.current instanceof HTMLElement) restoreRef.current.focus() }
  }, [open, onClose])

  return <>
    <EvidenceSummaryStrip evidence={evidence} onView={() => { setTab("overview"); onOpen() }} />
    {open && createPortal(<div className="fixed inset-0 z-[110] flex items-center justify-center p-3 sm:p-6">
      <button type="button" aria-label={t("evidence.close")} className="absolute inset-0 bg-slate-950/70 backdrop-blur-sm" onClick={onClose} />
      <div ref={panelRef} role="dialog" aria-modal="true" aria-labelledby={titleId} className="relative flex max-h-[85vh] w-full max-w-[900px] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-white/[0.08] dark:bg-slate-950">
        <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-5 py-4 dark:border-white/[0.07]">
          <div className="min-w-0"><h2 id={titleId} className="text-[17px] font-semibold text-slate-800 dark:text-white/90">{t("evidence.title")}</h2><p className="mt-1 text-[12px] text-slate-500 dark:text-white/40">{t("evidence.subtitle")}</p></div>
          <button type="button" onClick={onClose} aria-label={t("evidence.close")} className="rounded-lg px-2 py-1 text-slate-500 hover:bg-slate-100 dark:text-white/50 dark:hover:bg-white/10">✕</button>
        </div>
        <div className="flex overflow-x-auto border-b border-slate-100 px-5 dark:border-white/[0.07]">
          {(["overview", "app", "backend", "network"] as EvidenceTab[]).map((value) => <button key={value} type="button" onClick={() => setTab(value)} className={cx("whitespace-nowrap border-b-2 px-3 py-3 text-[12px] font-semibold", tab === value ? "border-brand-500 text-brand-700 dark:text-brand-300" : "border-transparent text-slate-500 dark:text-white/40")}>{t(`evidence.${value === "app" ? "app" : value}`)}</button>)}
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-5">
          {tab === "overview" && <Overview evidence={evidence} />}
          {tab === "app" && <AppDiscovery evidence={evidence} />}
          {tab === "backend" && <BackendDiscovery operations={evidence.backendOperations} />}
          {tab === "network" && <NetworkActivity requests={evidence.networkRequests} />}
        </div>
        {evidence.degradeWarningToken && <div className="border-t border-amber-200 bg-amber-50 px-5 py-3 text-[12px] text-amber-800 dark:border-amber-400/20 dark:bg-amber-900/20 dark:text-amber-200">{t(`evidence.degrade.${evidence.degradeWarningToken}`)}</div>}
      </div>
    </div>, document.body)}
  </>
}
