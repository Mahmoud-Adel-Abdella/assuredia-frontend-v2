import React, { FormEvent, useState } from "react"
import { cx } from "./primitives"
import { AssureMark } from "./Sidebar"
import { useAuth } from "../lib/auth"
import { useLang } from "../lib/i18n"
import { ApiError, oauthStartUrl, type OAuthProvider } from "../lib/api"

/**
 * Combined auth screen (auth design): a split-screen page — left brand
 * section, right tabbed credentials card (Log In / Sign Up).
 *
 * The forms keep the existing working authentication behavior untouched:
 * real login through useAuth (backend error semantics preserved), OAuth as a
 * full-page browser redirect, and signup credentials carried into self-service
 * onboarding — the backend POST /dashboard-api/auth/signup requires
 * companyName, which the onboarding form collects (step 2), so no signup API
 * call happens here.
 */

export type SignedUpUser = { name: string; email: string; password: string }
type AuthTab = "login" | "signup"

/* ------------------------------------------------------------------ */
/* Entrance motion (Figma) — disabled for reduced-motion users          */
/* ------------------------------------------------------------------ */
const AUTH_MOTION_CSS = `
@keyframes authFadeUp {
  from { opacity: 0; transform: translateY(16px); }
  to   { opacity: 1; transform: translateY(0); }
}
@keyframes authSlideRight {
  from { opacity: 0; transform: translateX(20px); }
  to   { opacity: 1; transform: translateX(0); }
}
@media (prefers-reduced-motion: reduce) {
  .auth-anim { animation: none !important; opacity: 1 !important; transform: none !important; }
}
`

function aup(delayMs: number, durationMs = 480): React.CSSProperties {
  return { animation: `authFadeUp ${durationMs}ms ease-out ${delayMs}ms both` }
}

/* ------------------------------------------------------------------ */
/* Shared sub-components                                               */
/* ------------------------------------------------------------------ */
function SocialButton({
  onClick,
  children,
  icon,
}: {
  onClick: () => void
  children: React.ReactNode
  icon: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center justify-center gap-3 rounded-lg border border-slate-200 bg-elevated px-4 py-2.5 text-[13px] font-medium text-slate-700 transition-colors hover:border-slate-300 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400"
    >
      {icon}
      {children}
    </button>
  )
}

function GoogleIcon() {
  return (
    <svg className="size-4" viewBox="0 0 24 24">
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
    </svg>
  )
}

function GitHubIcon() {
  return (
    <svg className="size-4" viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" />
    </svg>
  )
}

function EyeToggle({ show, onToggle }: { show: boolean; onToggle: () => void }) {
  const { t } = useLang()
  return (
    <button
      type="button"
      tabIndex={-1}
      onClick={onToggle}
      className="text-slate-400 hover:text-slate-600"
      aria-label={show ? t("login.hidePassword") : t("login.showPassword")}
    >
      {show ? (
        <svg className="size-4" viewBox="0 0 20 20" fill="currentColor">
          <path d="M10 12a2 2 0 100-4 2 2 0 000 4z" />
          <path fillRule="evenodd" d="M.458 10C1.732 5.943 5.522 3 10 3s8.268 2.943 9.542 7c-1.274 4.057-5.064 7-9.542 7S1.732 14.057.458 10zM14 10a4 4 0 11-8 0 4 4 0 018 0z" />
        </svg>
      ) : (
        <svg className="size-4" viewBox="0 0 20 20" fill="currentColor">
          <path fillRule="evenodd" d="M3.707 2.293a1 1 0 00-1.414 1.414l14 14a1 1 0 001.414-1.414l-1.473-1.473A10.014 10.014 0 0019.542 10C18.268 5.943 14.478 3 10 3a9.958 9.958 0 00-4.512 1.074l-1.78-1.781zm4.261 4.26l1.514 1.515a2.003 2.003 0 012.45 2.45l1.514 1.514a4 4 0 00-5.478-5.478z" />
          <path d="M12.454 16.697L9.75 13.992a4 4 0 01-3.742-3.741L2.335 6.578A9.98 9.98 0 00.458 10c1.274 4.057 5.064 7 9.542 7 .847 0 1.669-.105 2.454-.303z" />
        </svg>
      )}
    </button>
  )
}

/* ------------------------------------------------------------------ */
/* Login form — existing working card content, tab-switch hookup        */
/* ------------------------------------------------------------------ */
function LoginForm({
  onSignIn,
  onSwitchTab,
}: {
  onSignIn: () => void
  onSwitchTab: () => void
}) {
  const { login } = useAuth()
  const { t } = useLang()
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!email.trim()) {
      setError(t("login.emailRequired"))
      return
    }
    if (!password) {
      setError(t("login.passwordRequired"))
      return
    }
    setError("")
    setLoading(true)
    try {
      await login(email.trim(), password)
      onSignIn()
    } catch (err) {
      if (err instanceof ApiError) {
        // Backend messages are user-safe: 400 invalid input, 401 invalid
        // credentials, 403 pending/rejected applicant or inactive client.
        setError(err.status === 401 ? t("login.invalidCredentials") : err.message)
      } else {
        setError(t("login.signInFailed"))
      }
    } finally {
      setLoading(false)
    }
  }

  function handleSocial(provider: OAuthProvider) {
    // OAuth start is a full-page browser redirect to the backend — never a fetch call.
    window.location.assign(oauthStartUrl(provider))
  }

  return (
    <>
      {/* Heading */}
      <div className="mb-7">
        <h1 className="font-display text-[22px] font-bold tracking-tight text-navy">
          {t("login.title")}
        </h1>
        <p className="mt-1.5 text-[13px] text-slate-500">
          {t("login.subtitle")}
        </p>
      </div>

      {/* Social auth */}
      <div className="space-y-2.5">
        <SocialButton onClick={() => handleSocial("google")} icon={<GoogleIcon />}>
          {t("login.continueGoogle")}
        </SocialButton>
        <SocialButton onClick={() => handleSocial("github")} icon={<GitHubIcon />}>
          {t("login.continueGitHub")}
        </SocialButton>
      </div>

      {/* OR divider */}
      <div className="my-6 flex items-center gap-3">
        <div className="flex-1 border-t border-slate-200" />
        <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{t("login.or")}</span>
        <div className="flex-1 border-t border-slate-200" />
      </div>

      {/* Form */}
      <form onSubmit={handleSubmit} noValidate className="space-y-4">
        {/* Email */}
        <div>
          <label htmlFor="email" className="mb-1.5 block text-[12px] font-semibold text-slate-500">
            {t("login.email")}
          </label>
          <input
            id="email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => { setEmail(e.target.value); setError("") }}
            placeholder="you@company.com"
            disabled={loading}
            className={cx(
              "block w-full rounded-lg border bg-elevated px-3.5 py-2.5 text-[13px] text-slate-700 placeholder-slate-400 transition-colors focus:outline-none focus:ring-2 focus:ring-brand-400 disabled:opacity-60",
              error && !password ? "border-red-400" : "border-slate-200 hover:border-slate-300",
            )}
          />
        </div>

        {/* Password */}
        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <label htmlFor="password" className="text-[12px] font-semibold text-slate-500">
              {t("login.password")}
            </label>
            <button
              type="button"
              className="text-[12px] font-medium text-brand-300 transition-colors hover:text-brand-400"
            >
              {t("login.forgot")}
            </button>
          </div>
          <div className="relative">
            <input
              id="password"
              type={showPassword ? "text" : "password"}
              autoComplete="current-password"
              value={password}
              onChange={(e) => { setPassword(e.target.value); setError("") }}
              placeholder="••••••••"
              disabled={loading}
              className={cx(
                "block w-full rounded-lg border bg-elevated px-3.5 py-2.5 pe-10 text-[13px] text-slate-700 placeholder-slate-400 transition-colors focus:outline-none focus:ring-2 focus:ring-brand-400 disabled:opacity-60",
                error && password ? "border-red-400" : "border-slate-200 hover:border-slate-300",
              )}
            />
            <span className="absolute end-3 top-1/2 -translate-y-1/2">
              <EyeToggle show={showPassword} onToggle={() => setShowPassword((v) => !v)} />
            </span>
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="flex items-center gap-2 text-[12px] text-error">
            <svg className="size-3.5 shrink-0" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" />
            </svg>
            {error}
          </div>
        )}

        {/* Submit */}
        <button
          type="submit"
          disabled={loading}
          className="relative mt-1 flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-brand-900 px-4 text-[14px] font-semibold text-white shadow-sm transition-all hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:ring-offset-2 focus-visible:ring-offset-surface active:scale-[.98] disabled:cursor-not-allowed disabled:opacity-70"
        >
          {loading && (
            <svg className="size-4 animate-spin" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
          )}
          {loading ? t("login.signingIn") : t("login.submit")}
        </button>
      </form>

      {/* Footer */}
      <div className="mt-6 space-y-2.5 text-center text-[12px] text-slate-400">
        <p>
          {t("login.noAccount")}{" "}
          <button
            type="button"
            onClick={onSwitchTab}
            className="font-medium text-brand-300 transition-colors hover:text-brand-400"
          >
            {t("login.createAccount")}
          </button>
        </p>
      </div>
    </>
  )
}

/* ------------------------------------------------------------------ */
/* Signup form — existing working card content, tab-switch hookup       */
/* ------------------------------------------------------------------ */
function SignupForm({
  onSignUp,
  onSwitchTab,
}: {
  onSignUp: (user: SignedUpUser) => void
  onSwitchTab: () => void
}) {
  const [fullName, setFullName] = useState("")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [confirm, setConfirm] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [loading, setLoading] = useState(false)
  const [errors, setErrors] = useState<{ fullName?: string; email?: string; password?: string; confirm?: string }>({})
  const { t } = useLang()

  function validate() {
    const e: typeof errors = {}
    if (!fullName.trim()) e.fullName = t("signup.fullNameRequired")
    if (!email.trim()) e.email = t("signup.emailRequired")
    else if (!/\S+@\S+\.\S+/.test(email)) e.email = t("signup.invalidEmail")
    if (!password) e.password = t("signup.passwordRequired")
    else if (password.length < 8) e.password = t("signup.passwordMin")
    if (!confirm) e.confirm = t("signup.confirmRequired")
    else if (confirm !== password) e.confirm = t("signup.passwordMismatch")
    return e
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    const errs = validate()
    if (Object.keys(errs).length > 0) { setErrors(errs); return }
    setErrors({})
    // No API call here: the backend signup needs companyName, collected in
    // the onboarding form. Credentials move forward in memory only.
    onSignUp({ name: fullName.trim(), email: email.trim(), password })
  }

  function handleSocial(provider: OAuthProvider) {
    // OAuth start is a full-page browser redirect to the backend — never a fetch call.
    window.location.assign(oauthStartUrl(provider))
  }

  return (
    <>
      <div className="mb-6">
        <h1 className="font-display text-[22px] font-bold tracking-tight text-navy">{t("signup.title")}</h1>
        <p className="mt-1.5 text-[13px] text-slate-500">{t("signup.subtitle")}</p>
      </div>

      {/* Social auth */}
      <div className="space-y-2.5">
        <SocialButton onClick={() => handleSocial("google")} icon={<GoogleIcon />}>
          {t("login.continueGoogle")}
        </SocialButton>
        <SocialButton onClick={() => handleSocial("github")} icon={<GitHubIcon />}>
          {t("login.continueGitHub")}
        </SocialButton>
      </div>

      <div className="my-5 flex items-center gap-3">
        <div className="flex-1 border-t border-slate-200" />
        <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{t("login.or")}</span>
        <div className="flex-1 border-t border-slate-200" />
      </div>

      <form onSubmit={handleSubmit} noValidate className="space-y-4">
        {/* Full Name */}
        <div>
          <label htmlFor="su-name" className="mb-1.5 block text-[12px] font-semibold text-slate-500">
            {t("signup.fullName")} <span className="text-error">*</span>
          </label>
          <input
            id="su-name" type="text" autoComplete="name"
            value={fullName} onChange={(e) => { setFullName(e.target.value); setErrors((p) => ({ ...p, fullName: undefined })) }}
            placeholder="Elena Marsh" disabled={loading}
            className={cx("block w-full rounded-lg border bg-elevated px-3.5 py-2.5 text-[13px] text-slate-700 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-400 disabled:opacity-60", errors.fullName ? "border-red-400" : "border-slate-200 hover:border-slate-300")}
          />
          {errors.fullName && <p className="mt-1 text-[11px] text-error">{errors.fullName}</p>}
        </div>

        {/* Email */}
        <div>
          <label htmlFor="su-email" className="mb-1.5 block text-[12px] font-semibold text-slate-500">
            {t("login.email")} <span className="text-error">*</span>
          </label>
          <input
            id="su-email" type="email" autoComplete="email"
            value={email} onChange={(e) => { setEmail(e.target.value); setErrors((p) => ({ ...p, email: undefined })) }}
            placeholder="you@company.com" disabled={loading}
            className={cx("block w-full rounded-lg border bg-elevated px-3.5 py-2.5 text-[13px] text-slate-700 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-400 disabled:opacity-60", errors.email ? "border-red-400" : "border-slate-200 hover:border-slate-300")}
          />
          {errors.email && <p className="mt-1 text-[11px] text-error">{errors.email}</p>}
        </div>

        {/* Password */}
        <div>
          <label htmlFor="su-pw" className="mb-1.5 block text-[12px] font-semibold text-slate-500">
            {t("login.password")} <span className="text-error">*</span>
          </label>
          <div className="relative">
            <input
              id="su-pw" type={showPassword ? "text" : "password"} autoComplete="new-password"
              value={password} onChange={(e) => { setPassword(e.target.value); setErrors((p) => ({ ...p, password: undefined, confirm: undefined })) }}
              placeholder={t("signup.passwordPlaceholder")} disabled={loading}
              className={cx("block w-full rounded-lg border bg-elevated px-3.5 py-2.5 pe-10 text-[13px] text-slate-700 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-400 disabled:opacity-60", errors.password ? "border-red-400" : "border-slate-200 hover:border-slate-300")}
            />
            <span className="absolute end-3 top-1/2 -translate-y-1/2">
              <EyeToggle show={showPassword} onToggle={() => setShowPassword((v) => !v)} />
            </span>
          </div>
          {errors.password && <p className="mt-1 text-[11px] text-error">{errors.password}</p>}
        </div>

        {/* Confirm Password */}
        <div>
          <label htmlFor="su-confirm" className="mb-1.5 block text-[12px] font-semibold text-slate-500">
            {t("signup.confirmPassword")} <span className="text-error">*</span>
          </label>
          <div className="relative">
            <input
              id="su-confirm" type={showConfirm ? "text" : "password"} autoComplete="new-password"
              value={confirm} onChange={(e) => { setConfirm(e.target.value); setErrors((p) => ({ ...p, confirm: undefined })) }}
              placeholder={t("signup.confirmPlaceholder")} disabled={loading}
              className={cx("block w-full rounded-lg border bg-elevated px-3.5 py-2.5 pe-10 text-[13px] text-slate-700 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-400 disabled:opacity-60", errors.confirm ? "border-red-400" : "border-slate-200 hover:border-slate-300")}
            />
            <span className="absolute end-3 top-1/2 -translate-y-1/2">
              <EyeToggle show={showConfirm} onToggle={() => setShowConfirm((v) => !v)} />
            </span>
          </div>
          {errors.confirm && <p className="mt-1 text-[11px] text-error">{errors.confirm}</p>}
        </div>

        <button
          type="submit" disabled={loading}
          className="relative mt-1 flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-brand-900 px-4 text-[14px] font-semibold text-white shadow-sm transition-all hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 active:scale-[.98] disabled:cursor-not-allowed disabled:opacity-70"
        >
          {loading && (
            <svg className="size-4 animate-spin" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
          )}
          {t("signup.submit")}
        </button>
      </form>

      <p className="mt-5 text-center text-[12px] text-slate-400">
        {t("signup.haveAccount")}{" "}
        <button type="button" onClick={onSwitchTab} className="font-medium text-brand-300 transition-colors hover:text-brand-400">
          {t("signup.signIn")}
        </button>
      </p>
    </>
  )
}

/* ------------------------------------------------------------------ */
/* Combined auth screen (Figma split-screen layout)                     */
/* ------------------------------------------------------------------ */
export function LoginScreen({
  onSignIn,
  onSignUp,
  initialTab = "login",
  onBack,
}: {
  onSignIn: () => void
  onSignUp: (user: SignedUpUser) => void
  initialTab?: AuthTab
  onBack?: () => void
}) {
  const { t } = useLang()
  const [tab, setTab] = useState<AuthTab>(initialTab)

  const features = ["auth.feature1", "auth.feature2", "auth.feature3"]
  const featureDotColors = ["#2dd4bf", "#60a5fa", "#94a3b8"]
  const metrics = [
    { labelKey: "auth.metric.uptime", value: "99.98%", color: "#2dd4bf" },
    { labelKey: "auth.metric.monitoring", value: "24/7", color: "#60a5fa" },
    /* Neutral value uses the theme token (Figma's #e2e8f0 is dark-only). */
    { labelKey: "auth.metric.response", value: "< 1m", color: null },
  ]

  return (
    <div className="flex h-screen overflow-hidden flex-col bg-background lg:flex-row">
      <style>{AUTH_MOTION_CSS}</style>

      {/* ---- Left: brand + hero (Figma layout) ---- */}
      <div className="relative hidden flex-col justify-between overflow-hidden px-10 py-8 lg:flex lg:w-[60%]">
        {/* Top: logo — back to landing */}
        <button
          type="button"
          onClick={onBack}
          className="auth-anim relative z-10 flex items-center gap-3 text-start transition-opacity hover:opacity-80 disabled:pointer-events-none"
          disabled={!onBack}
          aria-label={t("auth.backHome")}
          style={aup(100)}
        >
          <AssureMark className="h-[72px] w-auto" />
          <div className="leading-none">
            <span className="block text-[26px] font-extrabold tracking-[0.10em] text-navy">
              ASSURE<span style={{ color: "#12b9aa" }}>DIA</span>
            </span>
          </div>
        </button>

        {/* Middle: badge + headline + description + bullets */}
        <div className="relative z-10 space-y-5">
          <div className="auth-anim inline-flex items-center gap-2 rounded-full border border-teal-400/20 bg-teal-400/10 px-4 py-2 text-sm text-teal-300 backdrop-blur-xl" style={aup(240)}>
            <span className="h-2 w-2 rounded-full bg-teal-400 animate-pulse" />
            {t("landing.badge")}
          </div>

          <div className="auth-anim" style={aup(360)}>
            <h2 className="text-5xl font-black leading-tight tracking-tight text-navy">
              {t("landing.heroAlways")} <span style={{ color: "#12b9aa" }}>{t("landing.heroOn")}</span>
              <br />
              <span style={{ background: "linear-gradient(to right, #3b82f6, #2dd4bf)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text" }}>
                {t("landing.heroQuality")}
              </span>
            </h2>
            <p className="mt-4 max-w-md text-[14px] leading-relaxed text-slate-400">
              {t("landing.heroCopy")}
            </p>
          </div>

          <div className="auth-anim space-y-3" style={aup(480)}>
            {features.map((key, i) => (
              <div key={key} className="flex items-center gap-3 text-sm text-slate-400">
                <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: featureDotColors[i] }} />
                {t(key)}
              </div>
            ))}
          </div>
        </div>

        {/* Bottom: metric cards */}
        <div className="auth-anim relative z-10 grid grid-cols-3 gap-3" style={aup(580)}>
          {metrics.map(({ labelKey, value, color }) => (
            <div key={labelKey} className="rounded-2xl border border-slate-200 bg-slate-50/60 p-4 shadow-lg backdrop-blur-xl">
              <p className="text-xs text-slate-400">{t(labelKey)}</p>
              <p
                className={cx("mt-1.5 text-2xl font-bold", !color && "text-slate-500")}
                dir="ltr"
                style={color ? { color } : undefined}
              >
                {value}
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* ---- Right: tab bar + existing auth card ---- */}
      <div
        className="auth-anim flex flex-1 flex-col items-center overflow-y-auto px-4 py-8 sm:px-8 lg:px-10"
        style={{ animation: "authSlideRight 0.5s ease-out 0.2s both" }}
      >
        {/* Mobile logo — back to landing */}
        <button
          type="button"
          onClick={onBack}
          disabled={!onBack}
          className="mb-8 flex items-center gap-2.5 transition-opacity hover:opacity-80 disabled:pointer-events-none lg:hidden"
          aria-label={t("auth.backHome")}
        >
          <AssureMark className="h-8 w-auto" />
          <p className="font-display text-[16px] font-extrabold tracking-tight">
            <span className="text-navy">ASSURE</span>
            <span style={{ color: "#06b6d4" }}>DIA</span>
          </p>
        </button>

        <div className="my-auto w-full max-w-[420px] py-4">
          {/* Tab bar */}
          <div className="mb-6 flex rounded-[12px] border border-slate-200 bg-elevated p-1">
            <button
              type="button"
              onClick={() => setTab("login")}
              aria-pressed={tab === "login"}
              className={cx(
                "flex-1 rounded-[9px] py-2 text-[13px] font-semibold transition-all",
                tab === "login"
                  ? "bg-brand-900 text-white shadow-sm"
                  : "text-slate-400 hover:text-navy",
              )}
            >
              {t("auth.tabLogin")}
            </button>
            <button
              type="button"
              onClick={() => setTab("signup")}
              aria-pressed={tab === "signup"}
              className={cx(
                "flex-1 rounded-[9px] py-2 text-[13px] font-semibold transition-all",
                tab === "signup"
                  ? "bg-brand-900 text-white shadow-sm"
                  : "text-slate-400 hover:text-navy",
              )}
            >
              {t("auth.tabSignup")}
            </button>
          </div>

          {/* Card */}
          <div className="rounded-[16px] border border-slate-200 bg-surface p-8" style={{ boxShadow: "var(--shadow-card)" }}>
            {tab === "login" ? (
              <LoginForm onSignIn={onSignIn} onSwitchTab={() => setTab("signup")} />
            ) : (
              <SignupForm onSignUp={onSignUp} onSwitchTab={() => setTab("login")} />
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

export default LoginScreen
