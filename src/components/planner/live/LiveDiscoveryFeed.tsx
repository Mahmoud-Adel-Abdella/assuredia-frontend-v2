import React from "react"
import { cx, Modal, Button } from "../../primitives"
import { useLang } from "../../../lib/i18n"

const Check = ({ className = "" }: { className?: string; strokeWidth?: number }) => <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="m5 12 4 4L19 6" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" /></svg>
const X = ({ className = "" }: { className?: string; strokeWidth?: number }) => <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="m6 6 12 12M18 6 6 18" strokeWidth="3" strokeLinecap="round" /></svg>
const AlertCircle = ({ className = "" }: { className?: string }) => <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor"><circle cx="12" cy="12" r="9" /><path d="M12 8v5m0 3h.01" /></svg>
import type { LivePlanEvent } from "./useDiscoveryStream"

function Icon({ status, animated }: { status: LivePlanEvent["status"]; animated: boolean }) {
  const base = "relative z-10 flex-shrink-0 w-6 h-6 rounded-full mt-0.5 flex items-center justify-center"
  if (status === "COMPLETE") return <div className={cx(base, "bg-emerald-500/20 border border-emerald-500/40")}><Check className="w-3.5 h-3.5 text-emerald-400" strokeWidth={3} /></div>
  if (status === "FAILED") return <div className={cx(base, "bg-red-500/20 border border-red-500/40")}><X className="w-3.5 h-3.5 text-red-400" strokeWidth={3} /></div>
  if (status === "ACTIVE") return <div className={cx(base, "bg-brand-600 shadow-md shadow-brand-500/40")}><span className={cx("w-2 h-2 rounded-full bg-white", animated && "animate-ping")} /><span className="absolute w-2 h-2 rounded-full bg-white" />{animated && <span className="absolute -inset-1 rounded-full border border-brand-400/40 animate-pulse" />}</div>
  return <div className={cx(base, "border-2 border-white/30 bg-surface-elevated")} />
}

export function LiveDiscoveryFeed({ events, targetOrigin, stalled, onCancel, onRetry, onEdit }: { events: LivePlanEvent[]; targetOrigin: string | null; stalled?: boolean; onCancel: () => void; onRetry?: () => void; onEdit?: () => void }) {
  const { t, lang } = useLang()
  const [confirming, setConfirming] = React.useState(false)
  const requestCancel = () => setConfirming(true)
  return <>
  <div className="w-full max-w-[640px] mx-auto" dir={lang === "ar" ? "rtl" : "ltr"} data-testid="live-discovery-feed">
    <div className="flex items-center justify-between mb-6"><div className="flex items-center gap-2.5"><div className="w-2.5 h-2.5 rounded-full bg-brand-500 animate-pulse" /><span className="text-xs font-mono uppercase tracking-wider text-brand-400 font-semibold">{t("pr10c.live.header")}</span></div><div className="text-xs font-mono text-foreground-muted">{t("pr10c.live.target")} <span className="text-foreground" dir="ltr">{targetOrigin ?? "—"}</span></div></div>
    <div className="glass-card rounded-2xl p-6 sm:p-8 relative"><div className="relative"><div className="absolute left-3 top-3 bottom-3 w-px bg-gradient-to-b from-brand-500/50 via-white/10 to-transparent rtl:left-auto rtl:right-3" /> <div className="space-y-4">
      {events.map((event, i) => { const active = event.status === "ACTIVE"; const complete = event.status === "COMPLETE"; const failed = event.status === "FAILED"; return <div key={event.id} className={cx("relative flex items-start gap-4 rounded-xl transition-all animate-fade-in-up", active && "p-3.5 bg-brand-500/[0.09] border border-brand-500/25 shadow-lg shadow-brand-500/5", complete && "p-3 opacity-75 hover:opacity-100 hover:bg-white/[0.03]", failed && "p-3.5 bg-red-500/[0.08] border border-red-500/25 shadow-lg shadow-red-500/5", event.status === "PENDING" && "p-3 opacity-45")}><Icon status={event.status} animated={i === events.length - 1 && active} /><div className="flex-1 min-w-0"><div className={cx("text-[15px] leading-snug flex items-center gap-2", active && "font-semibold text-white", complete && "font-medium text-foreground", failed && "font-semibold text-white", event.status === "PENDING" && "font-medium text-foreground-muted")}><span>{event.message}</span>{active && <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-brand-500/20 text-brand-300">{t("pr10c.live.active")}</span>}{failed && <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-red-500/20 text-red-300">{t("pr10c.live.failed")}</span>}</div>{event.details && <div className={cx("text-[13px] mt-0.5", active && "text-brand-300/80", failed && "text-red-300/80", complete && "text-foreground-muted", event.status === "PENDING" && "text-muted-foreground")}>{event.details}</div>}</div>{event.metadata?.elapsedMs != null && <span className={cx("text-[11px] font-mono pt-1", complete && "text-emerald-400/70", active && "text-brand-400")} dir="ltr">{(Number(event.metadata.elapsedMs) / 1000).toFixed(1)}s</span>}</div> })}
      {stalled && <div className="flex items-center gap-2 text-[13px] text-foreground-muted"><AlertCircle className="size-4" /> {t("pr10c.live.still_working")}</div>}
    </div></div><div className="mt-8 flex items-center justify-between border-t border-white/[0.08] pt-4"><span className="text-[12px] text-foreground-muted">{t("pr10c.live.sandbox_note")}</span><button type="button" onClick={requestCancel} className="text-[12px] font-medium text-foreground-muted hover:text-foreground">{t("pr10c.live.cancel")}</button></div>{onRetry && <div className="mt-4 flex gap-2"><button type="button" onClick={onRetry} className="rounded-lg bg-brand-600 px-3 py-2 text-sm text-white">{t("pr10c.live.try_again")}</button>{onEdit && <button type="button" onClick={onEdit} className="rounded-lg border border-white/10 px-3 py-2 text-sm text-foreground">{t("pr10c.live.edit_intent")}</button>}</div>}</div>
  </div>
  <Modal isOpen={confirming} onClose={() => setConfirming(false)} title={t("pr10c.live.cancel_title")} description={t("pr10c.live.cancel_body")} variant="danger" footer={<><Button variant="secondary" onClick={() => setConfirming(false)}>{t("pr10c.live.cancel_no")}</Button><Button variant="danger" onClick={() => { setConfirming(false); onCancel() }}>{t("pr10c.live.cancel_yes")}</Button></>} />
  </>
}
