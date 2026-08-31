import React, { useEffect, useRef, useState } from "react"
import { Button, Card, Spinner, useToast } from "./primitives"
import { AssureMark } from "./Sidebar"
import { useAuth } from "../lib/auth"
import { translate, useLang } from "../lib/i18n"
import {
  ApiError,
  OAuthApiError,
  apiOauthExchange,
  apiOauthOnboarding,
  oauthStartUrl,
  type OAuthProvider,
} from "../lib/api"

/* ------------------------------------------------------------------ */
/* /oauth/complete — the route the backend callback redirects to.      */
/*                                                                     */
/* Success:  ?provider=google&oauth_code=<one-time code>               */
/* Failure:  ?provider=github&oauth_error=<wire code>                  */
/*                                                                     */
/* The one-time code is exchanged exactly once, the URL is cleaned     */
/* immediately (refresh can never re-submit), and an already-signed-in */
/* visitor is treated as an account-linking round-trip whose result    */
/* never replaces the current session.                                 */
/* ------------------------------------------------------------------ */

/** True when the app was loaded on the OAuth callback route. */
export function isOauthCompletePath(): boolean {
  return window.location.pathname.replace(/\/+$/, "") === "/oauth/complete"
}

type OauthParams = { provider: string; code: string | null; error: string | null }

/* Captured once per page load: React StrictMode remounts components, and the
   URL is cleaned right away — the snapshot keeps the params available to the
   second mount without ever reading them twice from the address bar. */
let paramsSnapshot: OauthParams | null = null
function takeOauthParams(): OauthParams {
  if (!paramsSnapshot) {
    const q = new URLSearchParams(window.location.search)
    paramsSnapshot = {
      provider: (q.get("provider") ?? "").toLowerCase(),
      code: q.get("oauth_code"),
      error: q.get("oauth_error"),
    }
  }
  return paramsSnapshot
}

let urlCleaned = false
/** Strip the one-time code (and any error) from the address bar. */
function clearOauthUrl() {
  if (urlCleaned) return
  urlCleaned = true
  window.history.replaceState(null, "", "/")
}

/** Provider display name is a proper noun — identical in EN and AR. */
function providerLabel(provider: string): string {
  return provider === "github" ? "GitHub" : "Google"
}

type Phase =
  | { name: "processing"; linking: boolean; provider: string }
  | { name: "onboarding"; email: string; provider: string; ticket: string }
  | { name: "pending"; email: string; company: string }
  | { name: "rejected" }
  | { name: "linked"; provider: string }
  | { name: "failed"; wire: string | null; provider: string; linking: boolean }

/** Wire error code → localized title/description. Never shows raw backend text. */
function oauthErrorText(
  t: (key: string, vars?: Record<string, string | number>) => string,
  wire: string | null,
  provider: string,
  linking: boolean,
): { title: string; description: string; tone: "error" | "warning" } {
  const p = providerLabel(provider)
  switch (wire) {
    case "access_denied":
      return {
        title: t("oauth.cancelled", { provider: p }),
        description: t("oauth.cancelledDesc"),
        tone: "warning",
      }
    case "invalid_state":
    case "expired_state":
      return { title: t("oauth.invalidSession"), description: t("oauth.invalidSessionDesc"), tone: "error" }
    case "invalid_code":
      return { title: t("oauth.invalidCode"), description: t("oauth.invalidCodeDesc"), tone: "error" }
    case "provider_unavailable":
      return {
        title: t("oauth.providerUnavailable", { provider: p }),
        description: t("oauth.providerUnavailableDesc"),
        tone: "warning",
      }
    case "unverified_email":
      return {
        title: t("oauth.unverifiedEmail", { provider: p }),
        description: t("oauth.unverifiedEmailDesc", { provider: p }),
        tone: "error",
      }
    case "account_conflict":
      return linking
        ? { title: t("oauth.linkConflict", { provider: p }), description: t("oauth.linkConflictDesc", { provider: p }), tone: "error" }
        : {
            title: t("oauth.accountConflict"),
            description: t("oauth.accountConflictDesc", { provider: p }),
            tone: "error",
          }
    case "missing_configuration":
      return {
        title: t("oauth.missingConfiguration", { provider: p }),
        description: t("oauth.missingConfigurationDesc", { provider: p }),
        tone: "warning",
      }
    default:
      // invalid_provider_token and anything unrecognized get the safe generic message.
      return {
        title: linking
          ? t("oauth.linkStartFailed")
          : t("oauth.genericError", { provider: p }),
        description: t("oauth.genericErrorDesc"),
        tone: "error",
      }
  }
}

/** Errors that should not offer an immediate "try again" back to the provider. */
const NO_RETRY_CODES = new Set(["missing_configuration", "account_conflict", "unverified_email"])

/* ------------------------------------------------------------------ */
/* Full-screen shell shared by all OAuth states                        */
/* ------------------------------------------------------------------ */
function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-full flex-col items-center justify-center bg-background px-4 py-16">
      {children}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Onboarding step: company name for a brand-new OAuth applicant.      */
/* The one-time ticket lives ONLY in this component's state.           */
/* ------------------------------------------------------------------ */
function OnboardingStep({
  email,
  provider,
  ticket,
  onSubmitted,
}: {
  email: string
  provider: string
  ticket: string
  onSubmitted: (company: string) => void
}) {
  const { t } = useLang()
  const toast = useToast()
  const [company, setCompany] = useState("")
  const [fieldError, setFieldError] = useState("")
  const [submitting, setSubmitting] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    const name = company.trim()
    if (!name) {
      setFieldError(t("onb.companyRequired"))
      return
    }
    setFieldError("")
    setSubmitting(true)
    try {
      await apiOauthOnboarding(ticket, name)
      onSubmitted(name)
    } catch (err) {
      const wire = err instanceof OAuthApiError ? err.oauthError : null
      const text = oauthErrorText(translate, wire, provider, false)
      toast({
        title: t("oauth.submitFailed"),
        description: text.title,
        variant: "error",
      })
      setSubmitting(false)
    }
  }

  return (
    <Shell>
      <div className="w-full max-w-[440px]">
        <Card className="overflow-hidden">
          <div className="border-b border-slate-100 px-6 py-5 text-center">
            <div className="mx-auto flex size-12 items-center justify-center rounded-xl bg-brand-50 text-brand-400">
              <svg className="size-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                <path strokeLinecap="round" d="M3 21h18M5 21V7l7-4 7 4v14M9 9h1m4 0h1M9 13h1m4 0h1M9 17h1m4 0h1" />
              </svg>
            </div>
            <h1 className="mt-3 font-display text-xl font-bold tracking-tight text-navy">
              {t("oauth.onboardingTitle")}
            </h1>
            <p className="mt-1 text-[13px] text-slate-500">{t("oauth.onboardingDesc")}</p>
          </div>
          <form onSubmit={submit} className="space-y-4 px-6 py-5">
            {email && (
              <div>
                <p className="mb-1.5 text-[12px] font-semibold text-slate-500">{t("onb.emailLabel")}</p>
                <div className="rounded-lg border border-slate-100 bg-slate-50/60 px-3.5 py-2.5 text-[13px] font-medium text-slate-700">
                  {email}
                </div>
              </div>
            )}
            <div>
              <label htmlFor="oauth-company" className="mb-1.5 flex items-center gap-1 text-[12px] font-semibold text-slate-500">
                {t("onb.companyName")}
                <span className="text-error">*</span>
              </label>
              <input
                id="oauth-company"
                type="text"
                value={company}
                onChange={(e) => {
                  setCompany(e.target.value)
                  setFieldError("")
                }}
                placeholder="Northwind Cloud"
                autoComplete="organization"
                className={
                  "block w-full rounded-lg border bg-elevated px-3.5 py-2.5 text-[13px] text-slate-700 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-400 " +
                  (fieldError ? "border-red-400" : "border-slate-200")
                }
              />
              {fieldError && <p className="mt-1 text-[11px] text-error">{fieldError}</p>}
            </div>
            <p className="flex items-start gap-2 rounded-lg border border-brand-100 bg-brand-50 px-3.5 py-3 text-[12px] leading-relaxed text-slate-500">
              <svg className="mt-0.5 size-4 shrink-0 text-brand-400" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
              </svg>
              {t("oauth.onboardingNote")}
            </p>
            <Button type="submit" variant="primary" className="w-full" loading={submitting}>
              {t("onb.continue")}
            </Button>
          </form>
        </Card>
      </div>
    </Shell>
  )
}

/* ------------------------------------------------------------------ */
/* Main component                                                      */
/* ------------------------------------------------------------------ */
export function OAuthCompleteScreen({ onDone }: { onDone: () => void }) {
  const { status, setSession } = useAuth()
  const { t } = useLang()
  const [phase, setPhase] = useState<Phase>(() => ({
    name: "processing",
    linking: false,
    provider: takeOauthParams().provider,
  }))
  /* Guards the single exchange against React StrictMode's double effect run. */
  const startedRef = useRef(false)

  // Strip the one-time code from the address bar immediately, before any
  // async work, so a refresh can never re-submit it.
  useEffect(() => {
    clearOauthUrl()
  }, [])

  // Exchange once the auth status is settled: a stored session means this is
  // an account-linking round-trip; otherwise it is a sign-in.
  useEffect(() => {
    if (status === "restoring" || startedRef.current) return
    startedRef.current = true

    const { provider, code, error } = takeOauthParams()
    const linking = status === "authenticated"

    if (error) {
      setPhase({ name: "failed", wire: error, provider, linking })
      return
    }
    if (!code) {
      setPhase({ name: "failed", wire: null, provider, linking })
      return
    }

    // No cancellation on effect re-runs: startedRef already guarantees the
    // exchange happens exactly once, and StrictMode's mount → cleanup → mount
    // cycle must not orphan the in-flight request (its result is what gets the
    // screen out of the processing state). State updates after a true unmount
    // are safe no-ops in React 18+.
    ;(async () => {
      setPhase({ name: "processing", linking, provider })
      try {
        const result = await apiOauthExchange(code)

        if (linking) {
          // Link round-trip: the current session stays untouched regardless of
          // what the exchange returns — the JWT is never replaced here.
          setPhase({ name: "linked", provider })
          return
        }
        if (result.kind === "approved") {
          // Exact same adoption path as a normal email/password login.
          setSession(result.user, result.token)
          onDone()
          return
        }
        setPhase({
          name: "onboarding",
          email: result.email,
          provider: result.provider || provider,
          ticket: result.ticket,
        })
      } catch (err) {
        if (!linking && err instanceof ApiError && err.status === 403) {
          // Same localized states the password login shows for applicants.
          if (err.message === translate("errors.pendingApproval")) {
            setPhase({ name: "pending", email: "", company: "" })
            return
          }
          if (err.message === translate("errors.notApproved")) {
            setPhase({ name: "rejected" })
            return
          }
        }
        const wire = err instanceof OAuthApiError ? err.oauthError : null
        setPhase({ name: "failed", wire, provider, linking })
      }
    })()
  }, [status, setSession, onDone])

  /* ---------------- processing ---------------- */
  if (phase.name === "processing") {
    const label = phase.linking
      ? phase.provider === "github"
        ? t("oauth.connectingGitHub")
        : t("oauth.connectingGoogle")
      : t("oauth.signingIn")
    return (
      <Shell>
        <AssureMark className="h-12 w-auto" />
        <div className="mt-5 flex items-center gap-2.5 text-[13px] text-slate-500">
          <Spinner size="sm" className="text-brand-400" />
          {label}
        </div>
      </Shell>
    )
  }

  /* ---------------- onboarding (company name) ---------------- */
  if (phase.name === "onboarding") {
    return (
      <OnboardingStep
        email={phase.email}
        provider={phase.provider}
        ticket={phase.ticket}
        onSubmitted={(company) => setPhase({ name: "pending", email: phase.email, company })}
      />
    )
  }

  /* ---------------- pending approval (same localized state as signup) ---------------- */
  if (phase.name === "pending") {
    return (
      <Shell>
        <div className="w-full max-w-[520px]">
          <div className="rounded-2xl border border-amber-200 bg-surface p-8 text-center">
            <div className="mx-auto flex size-16 items-center justify-center rounded-2xl bg-amber-50">
              <svg className="size-8 text-warning" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                <circle cx="12" cy="12" r="10" />
                <path strokeLinecap="round" d="M12 6v6l4 2" />
              </svg>
            </div>
            <div className="mt-4">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-3 py-1 text-[12px] font-bold uppercase tracking-wide text-amber-700 ring-1 ring-inset ring-amber-600/20">
                <span className="size-1.5 rounded-full bg-warning" />
                {t("onb.pendingApproval")}
              </span>
            </div>
            <h2 className="mt-4 font-display text-2xl font-bold tracking-tight text-navy">
              {t("onb.requestSubmitted")}
            </h2>
            <p className="mt-2 text-[14px] text-slate-500">{t("onb.requestSentDesc")}</p>
            <p className="mt-1 text-[13px] text-slate-400">{t("onb.afterApproval")}</p>
          </div>

          <Card className="mt-4 divide-y divide-slate-100 px-5">
            {phase.email && (
              <div className="flex items-center justify-between py-3">
                <span className="text-[12px] text-slate-400">{t("onb.emailLabel")}</span>
                <span className="text-[13px] font-medium text-slate-700">{phase.email}</span>
              </div>
            )}
            {phase.company && (
              <div className="flex items-center justify-between py-3">
                <span className="text-[12px] text-slate-400">{t("onb.companyName")}</span>
                <span className="text-[13px] font-medium text-slate-700">{phase.company}</span>
              </div>
            )}
            <div className="flex items-center justify-between py-3">
              <span className="text-[12px] text-slate-400">{t("table.status")}</span>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-2.5 py-1 text-[11px] font-semibold text-amber-700 ring-1 ring-inset ring-amber-600/10">
                <span className="size-1.5 rounded-full bg-warning" />
                {t("onb.pending")}
              </span>
            </div>
          </Card>

          <div className="mt-5 flex justify-center">
            <Button variant="secondary" onClick={onDone}>
              {t("onb.backToLogin")}
            </Button>
          </div>
          <p className="mt-4 text-center text-[11px] text-slate-400">{t("onb.notifyEmail")}</p>
        </div>
      </Shell>
    )
  }

  /* ---------------- rejected ---------------- */
  if (phase.name === "rejected") {
    return (
      <Shell>
        <div className="w-full max-w-[440px] rounded-2xl border border-red-200 bg-surface p-8 text-center">
          <div className="mx-auto flex size-16 items-center justify-center rounded-2xl bg-red-50">
            <svg className="size-8 text-error" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
              <circle cx="12" cy="12" r="10" />
              <path strokeLinecap="round" d="M15 9l-6 6M9 9l6 6" />
            </svg>
          </div>
          <h2 className="mt-4 font-display text-2xl font-bold tracking-tight text-navy">
            {t("oauth.rejectedTitle")}
          </h2>
          <p className="mt-2 text-[14px] text-slate-500">{t("oauth.rejectedDesc")}</p>
          <div className="mt-6 flex justify-center">
            <Button variant="secondary" onClick={onDone}>
              {t("onb.backToLogin")}
            </Button>
          </div>
        </div>
      </Shell>
    )
  }

  /* ---------------- linked (authenticated round-trip success) ---------------- */
  if (phase.name === "linked") {
    return (
      <Shell>
        <div className="w-full max-w-[440px] rounded-2xl border border-emerald-200 bg-surface p-8 text-center">
          <div className="mx-auto flex size-16 items-center justify-center rounded-2xl bg-emerald-50">
            <svg className="size-8 text-success" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6l7-3z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4" />
            </svg>
          </div>
          <h2 className="mt-4 font-display text-2xl font-bold tracking-tight text-navy">
            {phase.provider === "github" ? t("oauth.linkedGitHub") : t("oauth.linkedGoogle")}
          </h2>
          <p className="mt-2 text-[14px] text-slate-500">{t("oauth.linkedDesc")}</p>
          <div className="mt-6 flex justify-center">
            <Button variant="primary" onClick={onDone}>
              {t("onb.continue")}
            </Button>
          </div>
        </div>
      </Shell>
    )
  }

  /* ---------------- failed ---------------- */
  const text = oauthErrorText(t, phase.wire, phase.provider, phase.linking)
  const canRetry =
    phase.provider !== "" && phase.wire !== null && !NO_RETRY_CODES.has(phase.wire) && !phase.linking
  const toneStyles =
    text.tone === "warning"
      ? { border: "border-amber-200", bg: "bg-amber-50", color: "text-warning" }
      : { border: "border-red-200", bg: "bg-red-50", color: "text-error" }

  return (
    <Shell>
      <div className={`w-full max-w-[440px] rounded-2xl border ${toneStyles.border} bg-surface p-8 text-center`}>
        <div className={`mx-auto flex size-16 items-center justify-center rounded-2xl ${toneStyles.bg}`}>
          <svg className={`size-8 ${toneStyles.color}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
            <path strokeLinecap="round" d="M12 9v4m0 4h.01" />
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M10.3 3.9L1.8 18a2 2 0 001.7 3h17a2 2 0 001.7-3L13.7 3.9a2 2 0 00-3.4 0z"
            />
          </svg>
        </div>
        <h2 className="mt-4 font-display text-xl font-bold tracking-tight text-navy">{text.title}</h2>
        <p className="mt-2 text-[14px] text-slate-500">{text.description}</p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          {canRetry && (
            <Button variant="primary" onClick={() => window.location.assign(oauthStartUrl(phase.provider as OAuthProvider))}>
              {t("oauth.tryAgain")}
            </Button>
          )}
          <Button variant={canRetry ? "secondary" : "primary"} onClick={onDone}>
            {phase.wire === "account_conflict" && !phase.linking ? t("oauth.goToSignIn") : t("onb.backToLogin")}
          </Button>
        </div>
      </div>
    </Shell>
  )
}

export default OAuthCompleteScreen
