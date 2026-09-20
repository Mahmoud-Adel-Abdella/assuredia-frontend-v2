import React from "react"
import { cx, Modal, Button } from "../../primitives"
import { useLang } from "../../../lib/i18n"
import type { LivePlanEvent } from "./useDiscoveryStream"

const Check = ({ className = "" }: { className?: string }) => <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="m5 12 4 4L19 6" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" /></svg>
const X = ({ className = "" }: { className?: string }) => <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="m6 6 12 12M18 6 6 18" strokeWidth="3" strokeLinecap="round" /></svg>
const AlertCircle = ({ className = "" }: { className?: string }) => <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor"><circle cx="12" cy="12" r="9" /><path d="M12 8v5m0 3h.01" /></svg>

/** Backend stage token → localized title key. Unknown stages fall back to the wire message. */
const STAGE_MESSAGE_KEYS: Record<string, string> = {
  start: "pr10c.live.stage.start",
  mcp_warmup: "pr10c.live.stage.mcp_warmup",
  mcp_ready: "pr10c.live.stage.mcp_ready",
  navigate_start: "pr10c.live.stage.navigate_start",
  navigate_done: "pr10c.live.stage.navigate_done",
  snapshot_done: "pr10c.live.stage.snapshot_done",
  elements_parsed: "pr10c.live.stage.elements_parsed",
  locators_start: "pr10c.live.stage.locators_start",
  locators_done: "pr10c.live.stage.locators_done",
  ui_discovery_warning: "pr10c.live.stage.ui_discovery_warning",
  api_probe_start: "pr10c.live.stage.api_probe_start",
  api_probe_done: "pr10c.live.stage.api_probe_done",
  api_probe_warning: "pr10c.live.stage.api_probe_warning",
  api_probe_failed: "pr10c.live.stage.api_probe_failed",
  evidence_start: "pr10c.live.stage.evidence_start",
  evidence_done: "pr10c.live.stage.evidence_done",
  ai_start: "pr10c.live.stage.ai_start",
  ai_done: "pr10c.live.stage.ai_done",
  validate_start: "pr10c.live.stage.validate_start",
  validate_done: "pr10c.live.stage.validate_done",
  ready: "pr10c.live.stage.ready",
}

function Icon({ status, animated }: { status: LivePlanEvent["status"]; animated: boolean }) {
  const base = "relative z-10 flex-shrink-0 w-6 h-6 rounded-full mt-0.5 flex items-center justify-center"
  if (status === "COMPLETE") return <div className={cx(base, "bg-emerald-500/20 border border-emerald-500/40")}><Check className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" /></div>
  if (status === "FAILED") return <div className={cx(base, "bg-red-500/20 border border-red-500/40")}><X className="w-3.5 h-3.5 text-red-600 dark:text-red-400" /></div>
  if (status === "ACTIVE") return <div className={cx(base, "bg-brand-600 shadow-md shadow-brand-500/40")}><span className={cx("w-2 h-2 rounded-full bg-white", animated && "animate-ping")} /><span className="absolute w-2 h-2 rounded-full bg-white" />{animated && <span className="absolute -inset-1 rounded-full border border-brand-400/40 animate-pulse" />}</div>
  return <div className={cx(base, "border-2 border-slate-300 bg-elevated dark:border-white/30")} />
}

export function LiveDiscoveryFeed({
  events,
  targetOrigin,
  stalled,
  onCancel,
  onRetry,
  onEditIntent,
  errorTitle,
  errorDescription,
}: {
  events: LivePlanEvent[]
  targetOrigin: string | null
  stalled?: boolean
  onCancel: () => void
  /** Called when user clicks "Try Again" from the inline error recovery panel. */
  onRetry?: () => void
  /** Called when user clicks "Edit Intent" from the inline error recovery panel. */
  onEditIntent?: () => void
  /** Title for the error recovery panel. */
  errorTitle?: string
  /** Description for the error recovery panel. */
  errorDescription?: string
}) {
  const { t, lang } = useLang()
  const [confirming, setConfirming] = React.useState(false)
  const requestCancel = () => setConfirming(true)
  const failed = events.some((event) => event.status === "FAILED")
  const stageMessage = (event: LivePlanEvent) => {
    const key = event.stage ? STAGE_MESSAGE_KEYS[event.stage] : undefined
    return key ? t(key) : event.message
  }
  return <>
  <div className="w-full max-w-[640px] mx-auto" dir={lang === "ar" ? "rtl" : "ltr"} data-testid="live-discovery-feed">
    <div className="flex items-center justify-between mb-6"><div className="flex items-center gap-2.5"><div className="w-2.5 h-2.5 rounded-full bg-brand-500 animate-pulse" /><span className="text-xs font-mono uppercase tracking-wider text-brand-400 font-semibold">{t("pr10c.live.header")}</span></div><div className="text-xs font-mono text-foreground-muted">{t("pr10c.live.target")} <span className="text-foreground" dir="ltr">{targetOrigin ?? "—"}</span></div></div>
    <div className="glass-card rounded-2xl p-6 sm:p-8 relative"><div className="relative">{failed
      ? <div className="absolute left-[19px] top-[24px] h-20 w-[2px] bg-gradient-to-b from-emerald-500/40 to-red-500/80 pointer-events-none rtl:left-auto rtl:right-[19px]" />
      : <div className="absolute left-[19px] top-[24px] bottom-[28px] w-[2px] bg-gradient-to-b from-emerald-500/40 via-brand-500/60 to-slate-200 pointer-events-none dark:to-white/10 rtl:left-auto rtl:right-[19px]" />}
      <div className="space-y-4">
      {events.map((event, i) => { const active = event.status === "ACTIVE"; const complete = event.status === "COMPLETE"; const failedRow = event.status === "FAILED"; return <div key={event.id} className={cx("relative flex items-start gap-4 rounded-xl transition-all animate-fade-in-up", active && "p-3.5 bg-brand-500/[0.09] border border-brand-500/25 shadow-lg shadow-brand-500/5", complete && "p-3 opacity-75 hover:opacity-100 hover:bg-slate-50 dark:hover:bg-white/[0.03]", failedRow && "p-3.5 bg-red-500/[0.08] border border-red-500/25 shadow-lg shadow-red-500/5", event.status === "PENDING" && "p-3 opacity-45")}><Icon status={event.status} animated={i === events.length - 1 && active} /><div className="flex-1 min-w-0"><div className={cx("text-[15px] leading-snug flex items-center gap-2", active && "font-semibold text-foreground", complete && "font-medium text-foreground", failedRow && "font-semibold text-foreground", event.status === "PENDING" && "font-medium text-foreground-muted")}><span>{stageMessage(event)}</span>{active && <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-brand-500/20 text-brand-300">{t("pr10c.live.active")}</span>}{failedRow && <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-red-500/20 text-red-600 dark:text-red-300">{t("pr10c.live.failed")}</span>}</div>{event.details && <div className={cx("text-[13px] mt-0.5", active && "text-brand-300/80", failedRow && "text-red-700/80 dark:text-red-300/80", complete && "text-foreground-muted", event.status === "PENDING" && "text-muted-foreground")}>{event.details}</div>}</div>{event.metadata?.elapsedMs != null && <span className={cx("text-[11px] font-mono pt-1", complete && "text-emerald-600 dark:text-emerald-400/70", active && "text-brand-400")} dir="ltr">{(Number(event.metadata.elapsedMs) / 1000).toFixed(1)}s</span>}</div> })}
      {stalled && <div className="flex items-center gap-2 text-[13px] text-foreground-muted"><AlertCircle className="size-4" /> {t("pr10c.live.still_working")}</div>}
    </div></div>
    {/* Inline error recovery panel — visible when planning has failed (ref. Screen 4). */}
    {failed && (onRetry != null || onEditIntent != null) && (
      <div className="mt-8 pt-6 border-t border-slate-200 dark:border-white/10">
        <div className="p-4 rounded-xl bg-red-500/[0.06] border border-red-500/20 flex flex-col sm:flex-row sm:items-center justify-between gap-4 animate-fade-in-up">
          <div>
            <div className="text-[14px] font-semibold text-slate-900 dark:text-white flex items-center gap-2">
              <AlertCircle className="size-4 text-red-500 dark:text-red-400" />
              {errorTitle ?? t("pr10c.live.error_hint")}
            </div>
            {errorDescription && <p className="text-[12px] text-slate-500 dark:text-slate-400 mt-1">{errorDescription}</p>}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {onRetry && <Button variant="primary" size="sm" onClick={onRetry}>{t("pr10c.live.try_again")}</Button>}
            {onEditIntent && <Button variant="secondary" size="sm" onClick={onEditIntent}>{t("pr10c.live.edit_intent")}</Button>}
          </div>
        </div>
      </div>
    )}
    <div className="mt-8 flex items-center justify-between border-t border-slate-200 dark:border-white/[0.08] pt-4"><span className="text-[12px] text-foreground-muted">{t("pr10c.live.sandbox_note")}</span><button type="button" onClick={requestCancel} className="relative z-20 px-3.5 py-1.5 rounded-lg text-[12px] font-medium text-foreground-muted hover:text-foreground bg-slate-100 border border-slate-200 transition dark:bg-white/5 dark:border-white/10">{t("pr10c.live.cancel")}</button></div></div>
  </div>
  <Modal isOpen={confirming} onClose={() => setConfirming(false)} title={t("pr10c.live.cancel_title")} description={t("pr10c.live.cancel_body")} variant="danger" footer={<><Button variant="secondary" onClick={() => setConfirming(false)}>{t("pr10c.live.cancel_no")}</Button><Button variant="danger" onClick={() => { setConfirming(false); onCancel() }}>{t("pr10c.live.cancel_yes")}</Button></>} />
  </>
}


