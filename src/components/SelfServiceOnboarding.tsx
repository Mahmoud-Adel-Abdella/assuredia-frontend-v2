import React, { useState } from "react"
import { Button, Card, cx, useToast } from "./primitives"
import { useAuth } from "../lib/auth"
import { apiLogin, apiSignup, ApiError, type AuthUser } from "../lib/api"
import { translate, useLang } from "../lib/i18n"
import { AssureMark } from "./Sidebar"

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */
export type SignedUpUser = { name: string; email: string; password: string }

type Browser = "Chrome" | "Firefox" | "Edge"
type Device = "Desktop" | "Tablet" | "Mobile" | "Custom"

type OnboardingData = {
  company: string
  website: string
  appUrl: string
  appUsername: string
  appPassword: string
  browser: Browser
  device: Device
  headless: boolean
  timeout: string
  retryCount: string
}

type OnboardingState = "form" | "pending" | "checking" | "approved"

const DEFAULTS: OnboardingData = {
  company: "",
  website: "",
  appUrl: "",
  appUsername: "",
  appPassword: "",
  browser: "Chrome",
  device: "Desktop",
  headless: true,
  timeout: "60",
  retryCount: "1",
}

/* ------------------------------------------------------------------ */
/* Step config                                                         */
/* ------------------------------------------------------------------ */
const STEPS = [
  { n: 1, labelKey: "signup.stepAccount", descKey: "onb.step1Desc" },
  { n: 2, labelKey: "signup.stepClient", descKey: "onb.step2Desc" },
  { n: 3, labelKey: "signup.stepApplication", descKey: "onb.step3Desc" },
  { n: 4, labelKey: "signup.stepRuntime", descKey: "onb.step4Desc" },
  { n: 5, labelKey: "signup.stepReview", descKey: "onb.step5Desc" },
]

/* Device tokens stay English (backend values); only the display label is localized. */
const DEVICE_LABEL_KEY: Record<Device, string> = {
  Desktop: "onb.device.desktop",
  Tablet: "onb.device.tablet",
  Mobile: "onb.device.mobile",
  Custom: "onb.device.custom",
}

/* ------------------------------------------------------------------ */
/* Field primitives                                                   */
/* ------------------------------------------------------------------ */
function FL({ htmlFor, children, required }: { htmlFor: string; children: React.ReactNode; required?: boolean }) {
  return (
    <label htmlFor={htmlFor} className="mb-1.5 flex items-center gap-1 text-[12px] font-semibold text-slate-500">
      {children}{required && <span className="text-error">*</span>}
    </label>
  )
}
function FE({ msg }: { msg?: string }) {
  if (!msg) return null
  return <p className="mt-1 flex items-center gap-1 text-[11px] text-error"><svg className="size-3 shrink-0" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" /></svg>{msg}</p>
}

function TI({ id, value, onChange, placeholder, error, type = "text" }: { id: string; value: string; onChange: (v: string) => void; placeholder?: string; error?: string; type?: string }) {
  return (
    <div>
      <input id={id} type={type} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
        className={cx("block w-full rounded-lg border bg-elevated px-3.5 py-2.5 text-[13px] text-slate-700 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-400", error ? "border-red-400" : "border-slate-200")} />
      <FE msg={error} />
    </div>
  )
}

function PI({ id, value, onChange, error }: { id: string; value: string; onChange: (v: string) => void; error?: string }) {
  const [show, setShow] = useState(false)
  return (
    <div>
      <div className={cx("flex overflow-hidden rounded-lg border focus-within:ring-2 focus-within:ring-brand-400", error ? "border-red-400" : "border-slate-200")}>
        <input id={id} type={show ? "text" : "password"} value={value} onChange={(e) => onChange(e.target.value)} placeholder="••••••••" autoComplete="new-password"
          className="flex-1 bg-elevated px-3.5 py-2.5 text-[13px] text-slate-700 placeholder-slate-400 focus:outline-none" />
        <button type="button" tabIndex={-1} onClick={() => setShow((v) => !v)}
          className="flex items-center border-s border-slate-200 bg-elevated px-3 text-slate-400 hover:text-slate-600">
          {show ? (
            <svg className="size-4" viewBox="0 0 20 20" fill="currentColor"><path d="M10 12a2 2 0 100-4 2 2 0 000 4z" /><path fillRule="evenodd" d="M.458 10C1.732 5.943 5.522 3 10 3s8.268 2.943 9.542 7c-1.274 4.057-5.064 7-9.542 7S1.732 14.057.458 10zM14 10a4 4 0 11-8 0 4 4 0 018 0z" /></svg>
          ) : (
            <svg className="size-4" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M3.707 2.293a1 1 0 00-1.414 1.414l14 14a1 1 0 001.414-1.414l-1.473-1.473A10.014 10.014 0 0019.542 10C18.268 5.943 14.478 3 10 3a9.958 9.958 0 00-4.512 1.074l-1.78-1.781zm4.261 4.26l1.514 1.515a2.003 2.003 0 012.45 2.45l1.514 1.514a4 4 0 00-5.478-5.478z" /><path d="M12.454 16.697L9.75 13.992a4 4 0 01-3.742-3.741L2.335 6.578A9.98 9.98 0 00.458 10c1.274 4.057 5.064 7 9.542 7 .847 0 1.669-.105 2.454-.303z" /></svg>
          )}
        </button>
      </div>
      <FE msg={error} />
    </div>
  )
}

function Toggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button type="button" role="switch" aria-checked={on} onClick={() => onChange(!on)}
      className={cx("relative inline-flex h-6 w-11 shrink-0 rounded-full border-2 border-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400", on ? "bg-brand-900" : "bg-slate-200")}>
      <span className={cx("pointer-events-none inline-block size-4 rounded-full bg-white shadow ring-0 transition-transform mt-0.5", on ? "ltr:translate-x-5 rtl:-translate-x-5" : "translate-x-0")} />
    </button>
  )
}

function Tile<T extends string>({ value, current, onClick, icon, label }: { value: T; current: T; onClick: (v: T) => void; icon: React.ReactNode; label: string }) {
  const active = value === current
  return (
    <button type="button" onClick={() => onClick(value)}
      className={cx("flex flex-col items-center gap-2 rounded-lg border px-3 py-3.5 text-center text-[12px] font-medium transition-all", active ? "border-brand-600 bg-brand-50 text-brand-300 ring-1 ring-brand-600/30" : "border-slate-200 bg-elevated text-slate-500 hover:border-slate-300 hover:bg-slate-50")}>
      <span className={cx("transition-colors", active ? "text-brand-400" : "text-slate-400")}>{icon}</span>
      {label}
    </button>
  )
}

/* ------------------------------------------------------------------ */
/* Step progress strip                                                */
/* ------------------------------------------------------------------ */
function StepStrip({ current }: { current: number }) {
  const { t } = useLang()
  return (
    <div className="flex items-center gap-1">
      {STEPS.map((step, i) => {
        const done = current > step.n
        const active = current === step.n
        return (
          <React.Fragment key={step.n}>
            <div className="flex items-center gap-1.5">
              <span className={cx("flex size-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold", done ? "bg-success text-white" : active ? "bg-brand-900 text-white" : "border border-slate-200 bg-elevated text-slate-400")}>
                {done ? <svg className="size-3" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M16.7 5.3a1 1 0 010 1.4l-7.5 7.5a1 1 0 01-1.4 0L3.3 9.7a1 1 0 011.4-1.4l3.1 3.1 6.8-6.8a1 1 0 011.4 0z" /></svg> : step.n}
              </span>
              {active && <span className="text-[12px] font-semibold text-navy">{t(step.labelKey)}</span>}
            </div>
            {i < STEPS.length - 1 && <div className={cx("h-px flex-1", done ? "bg-success" : "bg-slate-200")} />}
          </React.Fragment>
        )
      })}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Section heading                                                    */
/* ------------------------------------------------------------------ */
function SH({ n, title, desc }: { n: number; title: string; desc: string }) {
  return (
    <div className="border-b border-slate-100 px-5 py-4">
      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-brand-300">0{n}</p>
      <h2 className="mt-0.5 font-display text-base font-bold text-navy">{title}</h2>
      <p className="mt-0.5 text-[13px] text-slate-500">{desc}</p>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Review row                                                         */
/* ------------------------------------------------------------------ */
function RR({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2.5">
      <span className="text-[12px] text-slate-400">{label}</span>
      <span className={cx("text-end text-[13px] font-medium text-slate-700", mono && "font-mono")}>{value}</span>
    </div>
  )
}
function RS({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">{title}</h3>
      <div className="divide-y divide-slate-100 rounded-lg border border-slate-200 bg-elevated px-4">{children}</div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Browser / Device icons                                             */
/* ------------------------------------------------------------------ */
const BI: Record<Browser, React.ReactNode> = {
  Chrome: <svg className="size-5" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.6" /><circle cx="12" cy="12" r="4" fill="currentColor" opacity="0.3" /><path d="M12 8h8.5M7.4 15.5L3 8M16.6 15.5L12 23" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>,
  Firefox: <svg className="size-5" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.6" /><path d="M12 3C12 3 8 7 8 12s4 9 9 9" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /><circle cx="12" cy="12" r="3.5" fill="currentColor" opacity="0.35" /></svg>,
  Edge: <svg className="size-5" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.6" /><path d="M7 12c0-2.8 2-5 5-5a5 5 0 011 9.9C10 17.5 7 16 7 13h9" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>,
}
const DI: Record<Device, React.ReactNode> = {
  Desktop: <svg className="size-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><rect x="2" y="3" width="20" height="14" rx="2" /><path strokeLinecap="round" d="M8 21h8M12 17v4" /></svg>,
  Tablet: <svg className="size-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><rect x="4" y="2" width="16" height="20" rx="2" /><circle cx="12" cy="18" r="1" fill="currentColor" /></svg>,
  Mobile: <svg className="size-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><rect x="6" y="2" width="12" height="20" rx="3" /><circle cx="12" cy="18" r="1" fill="currentColor" /></svg>,
  Custom: <svg className="size-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><path strokeLinecap="round" strokeLinejoin="round" d="M4 8V4m0 0h4M4 4l5 5M20 8V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5M20 16v4m0 0h-4m4 0l-5-5" /></svg>,
}

/* ------------------------------------------------------------------ */
/* Pending / Approved states                                          */
/* ------------------------------------------------------------------ */
function PendingState({ data, user, onCheck, checking, onBack }: { data: OnboardingData; user: SignedUpUser; onCheck: () => void; checking: boolean; onBack: () => void }) {
  const { t } = useLang()
  return (
    <div className="flex min-h-full items-center justify-center bg-background px-4 py-16">
      <div className="w-full max-w-[520px]">
        {/* Status card */}
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
          <h2 className="mt-4 font-display text-2xl font-bold tracking-tight text-navy">{t("onb.requestSubmitted")}</h2>
          <p className="mt-2 text-[14px] text-slate-500">
            {t("onb.requestSentDesc")}
          </p>
          <p className="mt-1 text-[13px] text-slate-400">
            {t("onb.afterApproval")}
          </p>
        </div>

        {/* Summary */}
        <Card className="mt-4 divide-y divide-slate-100 px-5">
          <div className="py-3 flex items-center justify-between">
            <span className="text-[12px] text-slate-400">{t("onb.requester")}</span>
            <span className="text-[13px] font-medium text-slate-700">{user.name}</span>
          </div>
          <div className="py-3 flex items-center justify-between">
            <span className="text-[12px] text-slate-400">{t("onb.emailLabel")}</span>
            <span className="text-[13px] font-medium text-slate-700">{user.email}</span>
          </div>
          <div className="py-3 flex items-center justify-between">
            <span className="text-[12px] text-slate-400">{t("onb.companyLabel")}</span>
            <span className="text-[13px] font-medium text-slate-700">{data.company}</span>
          </div>
          <div className="py-3 flex items-center justify-between">
            <span className="text-[12px] text-slate-400">{t("onb.website")}</span>
            <span className="text-[13px] font-medium text-slate-700">{data.website}</span>
          </div>
          <div className="py-3 flex items-center justify-between">
            <span className="text-[12px] text-slate-400">{t("table.status")}</span>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-2.5 py-1 text-[11px] font-semibold text-amber-700 ring-1 ring-inset ring-amber-600/10">
              <span className="size-1.5 rounded-full bg-warning" />
              {t("onb.pending")}
            </span>
          </div>
        </Card>

        <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:justify-center">
          <Button variant="primary" onClick={onCheck} disabled={checking}>
            {checking && <svg className="size-4 animate-spin" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>}
            {checking ? t("onb.checking") : t("onb.checkStatus")}
          </Button>
          <Button variant="secondary" onClick={onBack}>{t("onb.backToLogin")}</Button>
        </div>
        <p className="mt-4 text-center text-[11px] text-slate-400">
          {t("onb.notifyEmail")}
        </p>
      </div>
    </div>
  )
}

function ApprovedState({ user, onEnter }: { user: SignedUpUser; onEnter: () => void }) {
  const { t } = useLang()
  return (
    <div className="flex min-h-full items-center justify-center bg-background px-4 py-16">
      <div className="w-full max-w-[480px] text-center">
        <div className="mx-auto flex size-20 items-center justify-center rounded-2xl bg-emerald-50">
          <svg className="size-10 text-success" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6l7-3z" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4" />
          </svg>
        </div>
        <span className="mt-5 inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-[12px] font-bold uppercase tracking-wide text-emerald-700 ring-1 ring-inset ring-emerald-600/10">
          <span className="size-1.5 rounded-full bg-success" />
          {t("onb.approved")}
        </span>
        <h2 className="mt-4 font-display text-2xl font-bold tracking-tight text-navy">{t("onb.workspaceReady")}</h2>
        <p className="mt-2 text-[14px] text-slate-500">
          {t("onb.approvedDesc", { name: user.name.split(" ")[0] })}
          <br />
          {t("onb.welcome")}
        </p>
        <Button variant="primary" className="mx-auto mt-8" onClick={onEnter}>
          <svg className="size-4 rtl:-scale-x-100" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M10.293 3.293a1 1 0 011.414 0l6 6a1 1 0 010 1.414l-6 6a1 1 0 01-1.414-1.414L14.586 11H3a1 1 0 110-2h11.586l-4.293-4.293a1 1 0 010-1.414z" /></svg>
          {t("onb.openWorkspace")}
        </Button>
        <p className="mt-3 text-[12px] text-slate-400">
          {t("onb.dashboardAccess")}
        </p>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Main onboarding form                                               */
/* ------------------------------------------------------------------ */
export function SelfServiceOnboarding({
  user,
  onApproved,
  onBack,
}: {
  user: SignedUpUser
  onApproved: () => void
  onBack: () => void
}) {
  const [step, setStep] = useState(1)
  const [data, setData] = useState<OnboardingData>(DEFAULTS)
  const [errors, setErrors] = useState<Partial<Record<keyof OnboardingData, string>>>({})
  const [submitting, setSubmitting] = useState(false)
  const [state, setState] = useState<OnboardingState>("form")
  const [checking, setChecking] = useState(false)
  // Session obtained by the status check, adopted only when the user opens the workspace.
  const [granted, setGranted] = useState<{ user: AuthUser; token: string } | null>(null)
  const { setSession } = useAuth()
  const toast = useToast()
  const { t } = useLang()

  function update<K extends keyof OnboardingData>(key: K, value: OnboardingData[K]) {
    setData((p) => ({ ...p, [key]: value }))
    setErrors((p) => ({ ...p, [key]: undefined }))
  }

  function isValidUrl(s: string) {
    try { return !!new URL(s.startsWith("http") ? s : `https://${s}`).hostname } catch { return false }
  }

  function validateStep(n: number) {
    const e: typeof errors = {}
    if (n === 2) {
      if (!data.company.trim()) e.company = translate("onb.companyRequired")
      if (!data.website.trim()) e.website = translate("onb.websiteRequired")
      else if (!isValidUrl(data.website)) e.website = translate("onb.invalidUrl")
    }
    if (n === 3) {
      if (!data.appUrl.trim()) e.appUrl = translate("onb.appUrlRequired")
      else if (!isValidUrl(data.appUrl)) e.appUrl = translate("onb.invalidUrl")
      if (!data.appUsername.trim()) e.appUsername = translate("onb.appUsernameRequired")
      if (!data.appPassword) e.appPassword = translate("onb.appPasswordRequired")
    }
    if (n === 4) {
      const tv = parseInt(data.timeout); if (isNaN(tv) || tv < 10 || tv > 600) e.timeout = translate("onb.timeoutRange")
      const r = parseInt(data.retryCount); if (isNaN(r) || r < 0 || r > 5) e.retryCount = translate("onb.retryRange")
    }
    return e
  }

  function next() {
    const e = validateStep(step)
    if (Object.keys(e).length > 0) { setErrors(e); return }
    setErrors({})
    setStep((s) => s + 1)
  }

  async function submit() {
    setSubmitting(true)
    try {
      // Real backend contract: POST /dashboard-api/auth/signup
      // { email, password, companyName } → 201 { status: "pending", message }
      await apiSignup(user.email, user.password, data.company.trim())
      setState("pending")
    } catch (err) {
      setState("form")
      toast({
        title: translate("onb.signupFailed"),
        description: err instanceof ApiError ? err.message : translate("common.somethingWentWrong"),
        variant: "error",
      })
    } finally {
      setSubmitting(false)
    }
  }

  async function checkStatus() {
    setChecking(true)
    try {
      // Approval is the only transition out of PENDING that lets the applicant
      // authenticate again. So we re-run the real login: a 200 means the account
      // was approved and promoted (APPLICANT → CLIENT). The session is held
      // locally and adopted only when the user opens the workspace, so the
      // existing Approved screen stays visible until then.
      const session = await apiLogin(user.email, user.password)
      setGranted(session)
      setState("approved")
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : translate("onb.statusCheckFailed")
      toast({ title: translate("onb.stillPending"), description: msg, variant: "warning" })
    } finally {
      setChecking(false)
    }
  }

  if (state === "pending") {
    return <PendingState data={data} user={user} onCheck={checkStatus} checking={checking} onBack={onBack} />
  }
  if (state === "approved") {
    return (
      <ApprovedState
        user={user}
        onEnter={() => {
          if (granted) setSession(granted.user, granted.token)
          onApproved()
        }}
      />
    )
  }

  return (
    <div className="min-h-full bg-background">
      {/* Top bar */}
      <header className="sticky top-0 z-10 border-b border-slate-200/70 bg-background/80 backdrop-blur-md">
        <div className="mx-auto flex max-w-[860px] items-center gap-4 px-4 py-3.5 sm:px-6">
          <div className="flex items-center gap-2.5 me-4">
            <AssureMark className="h-7 w-auto" />
            <p className="hidden font-display text-[15px] font-extrabold tracking-tight sm:block">
              <span className="text-navy">ASSURE</span>
              <span style={{ color: "#06b6d4" }}>DIA</span>
            </p>
          </div>
          <div className="flex-1 overflow-x-auto">
            <StepStrip current={step} />
          </div>
          <button onClick={onBack} className="ms-4 shrink-0 text-[12px] font-medium text-slate-400 transition-colors hover:text-slate-600">
            {t("onb.exit")}
          </button>
        </div>
      </header>

      {/* Content */}
      <main className="mx-auto max-w-[680px] px-4 py-8 sm:px-6">
        {/* Page title */}
        <div className="mb-6">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-brand-300">
            {t("onb.eyebrow")}
          </p>
          <h1 className="mt-1 font-display text-2xl font-bold tracking-tight text-navy">
            {t("onb.title")}
          </h1>
          <p className="mt-1 text-[13px] text-slate-500">
            {t("onb.subtitle")}
          </p>
        </div>

        {/* Step 1: Account */}
        {step === 1 && (
          <Card className="overflow-hidden">
            <SH n={1} title={t("signup.stepAccount")} desc={t("onb.s1Desc")} />
            <div className="divide-y divide-slate-100">
              <div className="px-5 py-4">
                <p className="mb-4 flex items-start gap-3 rounded-lg border border-brand-200 bg-brand-50 px-4 py-3">
                  <svg className="mt-0.5 size-4 shrink-0 text-brand-400" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" /></svg>
                  <span className="text-[12px] leading-relaxed text-slate-500">{t("onb.s1Note")}</span>
                </p>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="mb-1 text-[12px] font-semibold text-slate-400">{t("signup.fullName")}</p>
                    <div className="rounded-lg border border-slate-100 bg-slate-50/60 px-3.5 py-2.5 text-[13px] font-medium text-slate-700">{user.name}</div>
                  </div>
                  <div>
                    <p className="mb-1 text-[12px] font-semibold text-slate-400">{t("onb.emailLabel")}</p>
                    <div className="rounded-lg border border-slate-100 bg-slate-50/60 px-3.5 py-2.5 text-[13px] font-medium text-slate-700">{user.email}</div>
                  </div>
                </div>
              </div>
            </div>
          </Card>
        )}

        {/* Step 2: Client */}
        {step === 2 && (
          <Card className="overflow-hidden">
            <SH n={2} title={t("signup.stepClient")} desc={t("onb.s2Desc")} />
            <div className="divide-y divide-slate-100">
              <div className="px-5 py-4">
                <FL htmlFor="ob-company" required>{t("onb.companyName")}</FL>
                <TI id="ob-company" value={data.company} onChange={(v) => update("company", v)} placeholder="Northwind Cloud" error={errors.company} />
                <p className="mt-1 text-[11px] text-slate-400">{t("onb.companyHint")}</p>
              </div>
              <div className="px-5 py-4">
                <FL htmlFor="ob-website" required>{t("onb.website")}</FL>
                <TI id="ob-website" value={data.website} onChange={(v) => update("website", v)} placeholder="https://northwindcloud.io" type="url" error={errors.website} />
                <p className="mt-1 text-[11px] text-slate-400">{t("onb.websiteHint")}</p>
              </div>
            </div>
          </Card>
        )}

        {/* Step 3: Application */}
        {step === 3 && (
          <Card className="overflow-hidden">
            <SH n={3} title={t("signup.stepApplication")} desc={t("onb.s3Desc")} />
            <div className="divide-y divide-slate-100">
              <div className="px-5 py-4">
                <div className="mb-4 flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
                  <svg className="mt-0.5 size-4 shrink-0 text-warning" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" /></svg>
                  <div>
                    <p className="text-[12px] font-semibold text-amber-700">{t("onb.credTitle")}</p>
                    <p className="mt-0.5 text-[12px] leading-relaxed text-slate-500">{t("onb.credNote")}</p>
                  </div>
                </div>
                <FL htmlFor="ob-appUrl" required>{t("onb.appUrl")}</FL>
                <TI id="ob-appUrl" value={data.appUrl} onChange={(v) => update("appUrl", v)} placeholder="https://app.northwindcloud.io" type="url" error={errors.appUrl} />
                <p className="mt-1 text-[11px] text-slate-400">{t("onb.appUrlHint")}</p>
              </div>
              <div className="px-5 py-4">
                <FL htmlFor="ob-appUser" required>{t("onb.appUsername")}</FL>
                <TI id="ob-appUser" value={data.appUsername} onChange={(v) => update("appUsername", v)} placeholder="testuser@northwindcloud.io" error={errors.appUsername} />
                <p className="mt-1 text-[11px] text-slate-400">{t("onb.appUsernameHint")}</p>
              </div>
              <div className="px-5 py-4">
                <FL htmlFor="ob-appPw" required>{t("onb.appPassword")}</FL>
                <PI id="ob-appPw" value={data.appPassword} onChange={(v) => update("appPassword", v)} error={errors.appPassword} />
                <p className="mt-1 text-[11px] text-slate-400">{t("onb.appPasswordHint")}</p>
              </div>
            </div>
          </Card>
        )}

        {/* Step 4: Runtime */}
        {step === 4 && (
          <div className="space-y-4">
            <Card className="overflow-hidden">
              <SH n={4} title={t("signup.stepRuntime")} desc={t("onb.s4Desc")} />
              <div className="space-y-5 p-5">
                {/* Browser */}
                <div>
                  <p className="mb-2.5 text-[12px] font-semibold text-slate-600">{t("onb.browser")}</p>
                  <div className="grid grid-cols-3 gap-2">
                    {(["Chrome", "Firefox", "Edge"] as Browser[]).map((b) => (
                      <Tile key={b} value={b} current={data.browser} onClick={(v) => update("browser", v)} icon={BI[b]} label={b} />
                    ))}
                  </div>
                </div>
                {/* Device */}
                <div>
                  <p className="mb-2.5 text-[12px] font-semibold text-slate-600">{t("onb.device")}</p>
                  <div className="grid grid-cols-4 gap-2">
                    {(["Desktop", "Tablet", "Mobile", "Custom"] as Device[]).map((d) => (
                      <Tile key={d} value={d} current={data.device} onClick={(v) => update("device", v)} icon={DI[d]} label={t(DEVICE_LABEL_KEY[d])} />
                    ))}
                  </div>
                </div>
              </div>
            </Card>
            <Card className="divide-y divide-slate-100">
              <div className="flex items-center justify-between p-5">
                <div>
                  <p className="text-[13px] font-semibold text-slate-700">{t("onb.headless")}</p>
                  <p className="mt-0.5 text-[12px] text-slate-400">{t("onb.headlessHint")}</p>
                </div>
                <Toggle on={data.headless} onChange={(v) => update("headless", v)} />
              </div>
              <div className="grid grid-cols-2 divide-x divide-slate-100">
                <div className="p-5">
                  <FL htmlFor="ob-timeout">{t("onb.timeoutLabel")}</FL>
                  <div className={cx("flex overflow-hidden rounded-lg border focus-within:ring-2 focus-within:ring-brand-400", errors.timeout ? "border-red-400" : "border-slate-200")}>
                    <input id="ob-timeout" type="number" value={data.timeout} onChange={(e) => update("timeout", e.target.value)} min={10} max={600}
                      className="w-full bg-elevated px-3.5 py-2.5 font-mono text-[13px] text-slate-700 focus:outline-none" />
                    <span className="flex items-center border-s border-slate-200 bg-elevated px-3 text-[12px] text-slate-400">{t("onb.secondsShort")}</span>
                  </div>
                  {errors.timeout && <p className="mt-1 text-[11px] text-error">{errors.timeout}</p>}
                  <p className="mt-1 text-[11px] text-slate-400">{t("onb.timeoutHint")}</p>
                </div>
                <div className="p-5">
                  <FL htmlFor="ob-retry">{t("onb.retryLabel")}</FL>
                  <input id="ob-retry" type="number" value={data.retryCount} onChange={(e) => update("retryCount", e.target.value)} min={0} max={5}
                    className={cx("block w-full rounded-lg border bg-elevated px-3.5 py-2.5 font-mono text-[13px] text-slate-700 focus:outline-none focus:ring-2 focus:ring-brand-400", errors.retryCount ? "border-red-400" : "border-slate-200")} />
                  {errors.retryCount && <p className="mt-1 text-[11px] text-error">{errors.retryCount}</p>}
                  <p className="mt-1 text-[11px] text-slate-400">{t("onb.retryHint")}</p>
                </div>
              </div>
            </Card>
          </div>
        )}

        {/* Step 5: Review */}
        {step === 5 && (
          <div className="space-y-4">
            <div className="flex items-start gap-3 rounded-lg border border-brand-200 bg-brand-50 px-4 py-3.5">
              <svg className="mt-0.5 size-4 shrink-0 text-brand-400" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" /></svg>
              <div>
                <p className="text-[12px] font-semibold text-brand-300">{t("onb.readyTitle")}</p>
                <p className="mt-0.5 text-[12px] leading-relaxed text-slate-500">{t("onb.readyDesc")}</p>
              </div>
            </div>
            <RS title={t("signup.stepAccount")}>
              <RR label={t("onb.name")} value={user.name} />
              <RR label={t("onb.emailLabel")} value={user.email} />
            </RS>
            <RS title={t("signup.stepClient")}>
              <RR label={t("onb.companyLabel")} value={data.company} />
              <RR label={t("onb.website")} value={data.website} />
            </RS>
            <RS title={t("signup.stepApplication")}>
              <RR label={t("onb.appUrl")} value={data.appUrl} />
              <RR label={t("onb.username")} value={data.appUsername} />
              <RR label={t("login.password")} value={t("onb.passwordConfigured")} />
            </RS>
            <RS title={t("signup.stepRuntime")}>
              <RR label={t("onb.browser")} value={data.browser} />
              <RR label={t("onb.device")} value={t(DEVICE_LABEL_KEY[data.device])} />
              <RR label={t("onb.headless")} value={data.headless ? t("common.enabled") : t("common.disabled")} />
              <RR label={t("onb.timeoutShort")} value={t("onb.seconds", { n: data.timeout })} />
              <RR label={t("onb.retryLabel")} value={data.retryCount} />
            </RS>
          </div>
        )}

        {/* Navigation */}
        <div className="mt-6 flex items-center justify-between border-t border-slate-200 pt-5">
          <Button variant="secondary" onClick={step === 1 ? onBack : () => setStep((s) => s - 1)}>
            {step === 1 ? t("onb.exit") : t("common.back")}
          </Button>
          <div className="flex items-center gap-3">
            <div className="hidden items-center gap-1.5 sm:flex">
              {STEPS.map((s) => (
                <span key={s.n} className={cx("size-1.5 rounded-full transition-all", step === s.n ? "w-4 bg-brand-600" : step > s.n ? "bg-success" : "bg-slate-200")} />
              ))}
            </div>
            {step < 5 ? (
              <Button variant="primary" onClick={next}>
                {t("onb.continue")}
                <svg className="size-4 rtl:-scale-x-100" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M10.293 3.293a1 1 0 011.414 0l6 6a1 1 0 010 1.414l-6 6a1 1 0 01-1.414-1.414L14.586 11H3a1 1 0 110-2h11.586l-4.293-4.293a1 1 0 010-1.414z" /></svg>
              </Button>
            ) : (
              <Button variant="primary" onClick={submit} disabled={submitting}>
                {submitting && <svg className="size-4 animate-spin" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>}
                {submitting ? t("onb.submitting") : t("onb.submitForApproval")}
              </Button>
            )}
          </div>
        </div>
      </main>
    </div>
  )
}

export default SelfServiceOnboarding
