import React, { useCallback, useEffect, useMemo, useState } from "react"
import { Button, Card, ErrorState, Spinner, cx, useToast } from "./primitives"
import { useAuth } from "../lib/auth"
import { useLang, type Lang } from "../lib/i18n"
import { useTheme } from "../lib/theme"
import { CredentialsSection } from "./credentials/CredentialsSection"
import {
  ApiError,
  apiClientDetails,
  apiOauthLinkStart,
  apiTelegramLink,
  apiTelegramTest,
  apiUpdateClient,
  type BackendClientInfo,
  type ClientUpdateBody,
  type OAuthProvider,
  type TelegramLinkResponse,
} from "../lib/api"
import { hasAccountTimezoneConfig, setAccountTimezoneConfig } from "../lib/automations"

/* ------------------------------------------------------------------ */
/* Shared form primitives                                             */
/* ------------------------------------------------------------------ */
function Field({
  label,
  hint,
  children,
}: {
  label: string
  hint?: string
  children: React.ReactNode
}) {
  return (
    <div>
      <label className="mb-1.5 block text-[13px] font-semibold text-slate-700">{label}</label>
      {children}
      {hint && <p className="mt-1.5 text-[12px] text-slate-400">{hint}</p>}
    </div>
  )
}

const inputCls =
  "w-full rounded-lg border border-slate-200 bg-surface px-3 py-2 text-[13px] font-medium text-slate-700 transition-colors placeholder:text-slate-400 hover:border-slate-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400"

function TextInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={cx(inputCls, props.className)} />
}

function Toggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={() => onChange(!on)}
      className={cx(
        "relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors",
        on ? "bg-brand-600" : "bg-slate-300",
      )}
    >
      <span
        className={cx(
          "inline-block size-4 rounded-full bg-white transition-transform",
          on ? "ltr:translate-x-4 rtl:-translate-x-4" : "ltr:translate-x-0.5 rtl:-translate-x-0.5",
        )}
      />
    </button>
  )
}

type SegmentedOption = { value: string; label: string }

function Segmented({
  options,
  value,
  onChange,
}: {
  options: SegmentedOption[]
  value: string
  onChange: (v: string) => void
}) {
  return (
    <div className="inline-flex flex-wrap items-center gap-1 rounded-lg bg-slate-100 p-1">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={cx(
            "rounded-md px-3 py-1.5 text-[13px] font-medium transition-all",
            value === o.value ? "bg-surface text-brand-300 shadow-sm" : "text-slate-500 hover:text-slate-700",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

function SectionPanel({
  title,
  description,
  children,
}: {
  title: string
  description: string
  children: React.ReactNode
}) {
  return (
    <Card className="overflow-hidden">
      <div className="border-b border-slate-100 px-5 py-4">
        <h2 className="font-display text-base font-bold text-navy">{title}</h2>
        <p className="mt-0.5 text-[13px] text-slate-500">{description}</p>
      </div>
      <div className="space-y-5 px-5 py-5">{children}</div>
    </Card>
  )
}

/** Read-only value rendered like a disabled input (real backend data that cannot be edited here). */
function ReadOnlyValue({ value, mono = false }: { value: string; mono?: boolean }) {
  return (
    <div className={cx(inputCls, "flex cursor-not-allowed items-center text-slate-500", mono && "font-mono")}>
      <span className="truncate">{value}</span>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Section: Account (identity from GET /dashboard-api/auth/me)        */
/* ------------------------------------------------------------------ */
function AccountSection() {
  const { user } = useAuth()
  const { t } = useLang()
  return (
    <SectionPanel title={t("settings.section.account")} description={t("settings.account.description")}>
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <Field label={t("settings.account.name")} hint={t("settings.account.readOnlyHint")}>
          <ReadOnlyValue value={user?.name ?? "—"} />
        </Field>
        <Field label={t("settings.account.email")}>
          <ReadOnlyValue value={user?.email ?? "—"} />
        </Field>
      </div>
      <Field label={t("settings.account.role")} hint={t("settings.account.roleHint")}>
        <div className="inline-flex items-center gap-1.5 rounded-full bg-brand-50 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-brand-300 ring-1 ring-inset ring-brand-700/10">
          <span className="size-1.5 rounded-full bg-brand-700" />
          {user?.role ?? "CLIENT"}
        </div>
      </Field>
    </SectionPanel>
  )
}

/* ------------------------------------------------------------------ */
/* Linked accounts — start a Google/GitHub OAuth linking round-trip.  */
/* The backend returns an authenticated start URL; the provider sends  */
/* the user back to /oauth/complete, where the current session is     */
/* kept as the source of identity (the JWT is never replaced).        */
/* ------------------------------------------------------------------ */
function GoogleGlyph() {
  return (
    <svg className="size-4" viewBox="0 0 24 24">
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
    </svg>
  )
}

function GitHubGlyph() {
  return (
    <svg className="size-4" viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" />
    </svg>
  )
}

function LinkedAccounts() {
  const { t } = useLang()
  const toast = useToast()
  const [connecting, setConnecting] = useState<OAuthProvider | null>(null)

  async function connect(provider: OAuthProvider) {
    if (connecting) return
    setConnecting(provider)
    try {
      const url = await apiOauthLinkStart(provider)
      window.location.assign(url)
    } catch {
      setConnecting(null)
      toast({
        title: t("oauth.linkStartFailed"),
        description: t("oauth.genericErrorDesc"),
        variant: "error",
      })
    }
  }

  const rows: Array<{ provider: OAuthProvider; label: string; icon: React.ReactNode }> = [
    { provider: "google", label: t("oauth.linkGoogle"), icon: <GoogleGlyph /> },
    { provider: "github", label: t("oauth.linkGitHub"), icon: <GitHubGlyph /> },
  ]

  return (
    <div>
      <p className="mb-1.5 text-[13px] font-semibold text-slate-700">{t("oauth.linkedAccounts")}</p>
      <p className="mb-3 text-[12px] text-slate-400">{t("oauth.linkedAccountsDesc")}</p>
      <div className="space-y-2">
        {rows.map(({ provider, label, icon }) => (
          <div
            key={provider}
            className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 px-4 py-3"
          >
            <div className="flex min-w-0 items-center gap-3">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-slate-50 text-slate-600">
                {icon}
              </span>
              <p className="truncate text-[13px] font-semibold text-slate-700">{label}</p>
            </div>
            <Button
              variant="secondary"
              size="sm"
              loading={connecting === provider}
              onClick={() => connect(provider)}
            >
              {connecting === provider ? t("oauth.connecting") : t("oauth.connect")}
            </Button>
          </div>
        ))}
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Section: Security                                                  */
/* ------------------------------------------------------------------ */
function SecuritySection({ onLogout }: { onLogout?: () => void }) {
  const { user } = useAuth()
  const { t } = useLang()
  return (
    <SectionPanel title={t("settings.section.security")} description={t("settings.security.description")}>
      <Field label={t("settings.security.password")} hint={t("settings.security.passwordHint")}>
        <div className="flex flex-wrap items-center gap-3">
          <div className={cx(inputCls, "flex flex-1 items-center gap-2 tracking-[0.3em] text-slate-400")}>
            ••••••••••••
          </div>
        </div>
        <p className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-slate-50 px-3 py-2 text-[12px] text-slate-500">
          <svg className="size-3.5 shrink-0" viewBox="0 0 20 20" fill="currentColor">
            <path
              fillRule="evenodd"
              d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a.75.75 0 000 1.5h.253a.25.25 0 01.244.304l-.459 2.066A1.75 1.75 0 0010.747 15H11a.75.75 0 000-1.5h-.253a.25.25 0 01-.244-.304l.459-2.066A1.75 1.75 0 009.253 9H9z"
              clipRule="evenodd"
            />
          </svg>
          {t("settings.security.passwordManaged")}
        </p>
      </Field>

      <div>
        <p className="mb-1.5 text-[13px] font-semibold text-slate-700">{t("settings.security.currentSession")}</p>
        <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              <span className="flex size-9 items-center justify-center rounded-lg bg-emerald-50 text-success">
                <svg className="size-4.5" viewBox="0 0 20 20" fill="currentColor">
                  <path d="M10 2a4 4 0 00-4 4v2H5a2 2 0 00-2 2v6a2 2 0 002 2h10a2 2 0 002-2v-6a2 2 0 00-2-2h-1V6a4 4 0 00-4-4zm2 6H8V6a2 2 0 114 0v2z" />
                </svg>
              </span>
              <div>
                <p className="text-[13px] font-semibold text-slate-700">
                  {t("settings.security.signedInAs")} <span className="font-mono">{user?.email ?? "—"}</span>
                </p>
                <p className="mt-0.5 text-[12px] text-slate-400">{user?.role ?? "CLIENT"}</p>
              </div>
            </div>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 ring-1 ring-inset ring-emerald-600/10">
              <span className="size-1.5 rounded-full bg-success" />
              {t("common.active")}
            </span>
          </div>
        </div>
      </div>

      <LinkedAccounts />

      {onLogout && (
        <div className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 px-4 py-3">
          <div>
            <p className="text-[13px] font-semibold text-slate-700">{t("settings.security.signOut")}</p>
            <p className="text-[12px] text-slate-400">{t("settings.security.signOutHint")}</p>
          </div>
          <Button variant="secondary" size="sm" onClick={onLogout}>
            {t("settings.security.signOut")}
          </Button>
        </div>
      )}
    </SectionPanel>
  )
}

/* ------------------------------------------------------------------ */
/* Section: Client Environment (GET/PUT /dashboard-api/clients/{id})  */
/* ------------------------------------------------------------------ */
function ClientEnvironmentSection({
  client,
  onSave,
  saving,
}: {
  client: BackendClientInfo
  onSave: (body: ClientUpdateBody) => Promise<boolean>
  saving: boolean
}) {
  const { t } = useLang()
  const [website, setWebsite] = useState(client.base_url ?? "")
  const [siteActive, setSiteActive] = useState(client.is_active !== false)
  const [siteUsername, setSiteUsername] = useState(client.site_username ?? "")
  const [sitePassword, setSitePassword] = useState("")
  const passwordSet = client.site_password_set === true

  async function save() {
    const trimmedSite = website.trim()
    if (!trimmedSite) return
    await onSave({
      baseUrl: trimmedSite,
      isActive: siteActive,
      siteUsername: siteUsername.trim(),
      // Blank password = keep the stored one (the frozen backend does the same).
      ...(sitePassword ? { sitePassword } : {}),
    })
  }

  return (
    <SectionPanel title={t("settings.section.environment")} description={t("settings.env.description")}>
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <Field label={t("settings.env.clientName")} hint={t("settings.env.clientNameHint")}>
          <ReadOnlyValue value={client.client_name} />
        </Field>
        <Field label={t("settings.env.clientId")} hint={t("settings.env.clientIdHint")}>
          <ReadOnlyValue value={`#${client.id}`} mono />
        </Field>
      </div>

      <Field label={t("settings.env.website")}>
        <TextInput value={website} onChange={(e) => setWebsite(e.target.value)} placeholder="https://" />
      </Field>

      <div className="flex items-center justify-between rounded-lg border border-slate-200 px-4 py-3">
        <div>
          <p className="text-[13px] font-semibold text-slate-700">{t("settings.env.clientStatus")}</p>
          <p className="text-[12px] text-slate-400">{t("settings.env.clientStatusDesc")}</p>
        </div>
        <div className="flex items-center gap-2.5">
          <span className={cx("text-[12px] font-semibold", siteActive ? "text-emerald-700" : "text-slate-400")}>
            {siteActive ? t("common.active") : t("common.inactive")}
          </span>
          <Toggle on={siteActive} onChange={setSiteActive} />
        </div>
      </div>

      <Field label={t("settings.env.siteCredentials")} hint={t("settings.env.siteCredentialsHint")}>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <TextInput
            type="text"
            autoComplete="off"
            placeholder={t("settings.env.siteUsernamePlaceholder")}
            value={siteUsername}
            onChange={(e) => setSiteUsername(e.target.value)}
          />
          <TextInput
            type="password"
            autoComplete="new-password"
            placeholder={
              passwordSet
                ? t("settings.env.sitePasswordPlaceholderKept")
                : t("settings.env.sitePasswordPlaceholderNew")
            }
            value={sitePassword}
            onChange={(e) => setSitePassword(e.target.value)}
          />
        </div>
        <p className="mt-2 text-[12px] text-slate-400">
          {passwordSet ? t("settings.env.sitePasswordSet") : t("settings.env.sitePasswordUnset")}
        </p>
      </Field>

      <SaveBar saving={saving} onSave={save} />
    </SectionPanel>
  )
}

/* ------------------------------------------------------------------ */
/* Section: Test Execution (GET/PUT /dashboard-api/clients/{id})      */
/* ------------------------------------------------------------------ */
const BROWSERS: SegmentedOption[] = [
  { value: "chrome", label: "Chrome" },
  { value: "firefox", label: "Firefox" },
  { value: "edge", label: "Edge" },
]

function normalizeBrowser(raw: string | null | undefined): string {
  const known = BROWSERS.map((b) => b.value)
  const v = (raw ?? "").toLowerCase()
  return known.includes(v) ? v : "chrome"
}

function TestExecutionSection({
  client,
  onSave,
  saving,
}: {
  client: BackendClientInfo
  onSave: (body: ClientUpdateBody) => Promise<boolean>
  saving: boolean
}) {
  const { t } = useLang()
  const devices: SegmentedOption[] = [
    { value: "desktop", label: t("settings.exec.device.desktop") },
    { value: "tablet", label: t("settings.exec.device.tablet") },
    { value: "mobile", label: t("settings.exec.device.mobile") },
    { value: "custom", label: t("settings.exec.device.custom") },
  ]
  /* Target-device round trip (backend contract: PUT accepts deviceType for
     named devices, viewportWidth/Height for a custom viewport; GET returns
     device_type + nullable viewport_width/height). A named device must win
     over a stale viewport pair — Custom Viewport only applies when the
     backend actually reports no device_type but does report a viewport. */
  const rawDevice = (client.device_type ?? "").trim().toLowerCase()
  const initialDevice = ["desktop", "tablet", "mobile"].includes(rawDevice)
    ? rawDevice
    : client.viewport_width != null || client.viewport_height != null
      ? "custom"
      : "desktop"
  const [browser, setBrowser] = useState(normalizeBrowser(client.browser))
  const [device, setDevice] = useState(
    devices.some((d) => d.value === initialDevice) ? initialDevice : "desktop",
  )
  const [headless, setHeadless] = useState(client.headless !== false)
  const [aiActive, setAiActive] = useState(client.ai_active !== false)
  /* Backend: timeout_seconds = WebDriver implicit wait (SECONDS, default 10);
     run_timeout_minutes = whole-run force-stop (MINUTES, default 10). */
  const [implicitWait, setImplicitWait] = useState(String(client.timeout_seconds ?? 10))
  const [runTimeout, setRunTimeout] = useState(String(client.run_timeout_minutes ?? 10))
  const [retries, setRetries] = useState(String(client.retry_count ?? 0))
  const [vpWidth, setVpWidth] = useState(client.viewport_width != null ? String(client.viewport_width) : "1280")
  const [vpHeight, setVpHeight] = useState(client.viewport_height != null ? String(client.viewport_height) : "800")

  async function save() {
    const waitNum = Number(implicitWait)
    const runTimeoutNum = Number(runTimeout)
    const retryNum = Number(retries)
    if (!Number.isFinite(waitNum) || waitNum < 1) return
    if (!Number.isFinite(runTimeoutNum) || runTimeoutNum < 1) return
    if (!Number.isFinite(retryNum) || retryNum < 0) return
    const body: ClientUpdateBody = {
      browser,
      headless,
      aiActive,
      timeoutSeconds: Math.floor(waitNum),
      runTimeoutMinutes: Math.floor(runTimeoutNum),
      retryCount: Math.floor(retryNum),
    }
    if (device === "custom") {
      const w = Number(vpWidth)
      const h = Number(vpHeight)
      if (Number.isFinite(w) && w > 0) body.viewportWidth = Math.floor(w)
      if (Number.isFinite(h) && h > 0) body.viewportHeight = Math.floor(h)
    } else {
      body.deviceType = device
    }
    await onSave(body)
  }

  return (
    <SectionPanel title={t("settings.section.execution")} description={t("settings.exec.description")}>
      <Field label={t("settings.exec.browser")}>
        <Segmented options={BROWSERS} value={browser} onChange={setBrowser} />
      </Field>
      <Field label={t("settings.exec.device")}>
        <Segmented options={devices} value={device} onChange={setDevice} />
      </Field>

      {device === "custom" && (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <Field label={t("settings.exec.viewportWidth")}>
            <TextInput type="number" min={1} value={vpWidth} onChange={(e) => setVpWidth(e.target.value)} />
          </Field>
          <Field label={t("settings.exec.viewportHeight")}>
            <TextInput type="number" min={1} value={vpHeight} onChange={(e) => setVpHeight(e.target.value)} />
          </Field>
        </div>
      )}

      <div className="flex items-center justify-between rounded-lg border border-slate-200 px-4 py-3">
        <div>
          <p className="text-[13px] font-semibold text-slate-700">{t("settings.exec.headless")}</p>
          <p className="text-[12px] text-slate-400">{t("settings.exec.headlessDesc")}</p>
        </div>
        <Toggle on={headless} onChange={setHeadless} />
      </div>

      {/* AI enable/disable — real client.ai_active (null counts as enabled backend-side) */}
      <div className="flex items-center justify-between rounded-lg border border-slate-200 px-4 py-3">
        <div>
          <p className="text-[13px] font-semibold text-slate-700">{t("settings.exec.aiReports")}</p>
          <p className="text-[12px] text-slate-400">{t("settings.exec.aiReportsDesc")}</p>
        </div>
        <Toggle on={aiActive} onChange={setAiActive} />
      </div>

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
        <Field label={t("settings.exec.runTimeout")} hint={t("settings.exec.runTimeoutHint")}>
          <TextInput type="number" min={1} value={runTimeout} onChange={(e) => setRunTimeout(e.target.value)} />
        </Field>
        <Field label={t("settings.exec.timeout")} hint={t("settings.exec.timeoutHint")}>
          <TextInput type="number" min={1} value={implicitWait} onChange={(e) => setImplicitWait(e.target.value)} />
        </Field>
        <Field label={t("settings.exec.retries")} hint={t("settings.exec.retriesHint")}>
          <TextInput type="number" min={0} value={retries} onChange={(e) => setRetries(e.target.value)} />
        </Field>
      </div>

      <SaveBar saving={saving} onSave={save} />
    </SectionPanel>
  )
}

/* ------------------------------------------------------------------ */
/* Section: Notifications (notify_policy + Telegram via real API)     */
/* ------------------------------------------------------------------ */
const POLICIES: { key: "never" | "always" | "on_failure"; labelKey: string; descKey: string }[] = [
  { key: "never", labelKey: "settings.notify.policy.never", descKey: "settings.notify.policy.neverDesc" },
  { key: "always", labelKey: "settings.notify.policy.always", descKey: "settings.notify.policy.alwaysDesc" },
  {
    key: "on_failure",
    labelKey: "settings.notify.policy.onFailure",
    descKey: "settings.notify.policy.onFailureDesc",
  },
]

function normalizePolicy(raw: unknown): "never" | "always" | "on_failure" {
  const v = String(raw ?? "").toLowerCase()
  if (v === "never" || v === "always" || v === "on_failure") return v
  return "always"
}

function maskChatId(chatId: string): string {
  return `••••••${chatId.slice(-4)}`
}

function NotificationsSection({
  client,
  onSave,
  saving,
  onRefresh,
}: {
  client: BackendClientInfo
  onSave: (body: ClientUpdateBody) => Promise<boolean>
  saving: boolean
  onRefresh: () => Promise<void>
}) {
  const { t } = useLang()
  const toast = useToast()
  const [policy, setPolicy] = useState<"never" | "always" | "on_failure">(normalizePolicy(client.notify_policy))
  const chatId = (client.chat_id ?? "").trim()
  const telegramOn = chatId.length > 0
  const [linkBusy, setLinkBusy] = useState(false)
  const [pendingLink, setPendingLink] = useState<TelegramLinkResponse | null>(null)
  const [testBusy, setTestBusy] = useState(false)
  const [checking, setChecking] = useState(false)

  async function save() {
    await onSave({ notifyPolicy: policy })
  }

  async function connectTelegram() {
    setLinkBusy(true)
    try {
      const res = await apiTelegramLink(client.id)
      setPendingLink(res)
    } catch (err) {
      toast({
        title: t("common.loadFailed"),
        description: err instanceof ApiError ? err.message : undefined,
        variant: "error",
      })
    } finally {
      setLinkBusy(false)
    }
  }

  async function checkConnection() {
    setChecking(true)
    try {
      await onRefresh()
      setPendingLink(null)
    } finally {
      setChecking(false)
    }
  }

  async function disconnectTelegram() {
    // Clearing chat_id is a real partial-update write; the notification
    // workflow simply has no chat to deliver to afterwards.
    const ok = await onSave({ chatId: "" })
    if (ok) setPendingLink(null)
  }

  async function sendTest() {
    setTestBusy(true)
    try {
      await apiTelegramTest(client.id)
      toast({ title: t("settings.notify.testSent"), variant: "success" })
    } catch (err) {
      toast({
        title: t("common.loadFailed"),
        description: err instanceof ApiError ? err.message : undefined,
        variant: "error",
      })
    } finally {
      setTestBusy(false)
    }
  }

  return (
    <SectionPanel title={t("settings.section.notifications")} description={t("settings.notify.description")}>
      <Field label={t("settings.notify.policy")}>
        <div className="space-y-2">
          {POLICIES.map((p) => {
            const selected = policy === p.key
            return (
              <button
                key={p.key}
                type="button"
                onClick={() => setPolicy(p.key)}
                className={cx(
                  "flex w-full items-start gap-3 rounded-lg border px-4 py-3 text-left transition-colors",
                  selected ? "border-brand-600 bg-brand-50" : "border-slate-200 hover:border-slate-300",
                )}
              >
                <span
                  className={cx(
                    "mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full border-2 transition-colors",
                    selected ? "border-brand-600" : "border-slate-300",
                  )}
                >
                  {selected && <span className="size-2 rounded-full bg-brand-600" />}
                </span>
                <span className="min-w-0">
                  <span
                    className={cx(
                      "block font-mono text-[12px] font-semibold uppercase tracking-wide",
                      selected ? "text-brand-300" : "text-slate-500",
                    )}
                  >
                    {t(p.labelKey)}
                  </span>
                  <span className="mt-0.5 block text-[13px] text-slate-500">{t(p.descKey)}</span>
                </span>
              </button>
            )
          })}
        </div>
        <p className="mt-2 text-[12px] text-slate-400">{t("settings.notify.deliveryNote")}</p>
      </Field>

      {/* Telegram */}
      <div>
        <p className="mb-1.5 text-[13px] font-semibold text-slate-700">{t("settings.notify.telegram")}</p>
        <div className="rounded-lg border border-slate-200 px-4 py-3.5">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              <span className="flex size-9 items-center justify-center rounded-lg bg-brand-50 text-brand-400">
                <svg className="size-4.5" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M21.9 4.3l-3.3 15.5c-.2 1-.9 1.3-1.8.8l-4.9-3.6-2.4 2.3c-.3.3-.5.5-1 .5l.3-4.9 8.9-8c.4-.3-.1-.5-.6-.2L6.2 13.6l-4.7-1.5c-1-.3-1-1 .2-1.5l18.4-7.1c.9-.3 1.6.2 1.3 1.3z" />
                </svg>
              </span>
              <div>
                <div className="flex items-center gap-2">
                  <p className="text-[13px] font-semibold text-slate-700">{t("settings.notify.telegramBot")}</p>
                  {telegramOn ? (
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 ring-1 ring-inset ring-emerald-600/10">
                      <span className="size-1.5 rounded-full bg-success" />
                      {t("settings.notify.telegramConnected")}
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-50 px-2 py-0.5 text-[11px] font-semibold text-slate-400 ring-1 ring-inset ring-slate-300/20">
                      <span className="size-1.5 rounded-full bg-slate-400" />
                      {t("settings.notify.telegramNotConnected")}
                    </span>
                  )}
                </div>
                <p className="mt-0.5 text-[12px] text-slate-400">
                  {telegramOn ? (
                    <>
                      {t("settings.notify.telegramChatId")}{" "}
                      <span className="font-mono text-slate-500">{maskChatId(chatId)}</span>
                    </>
                  ) : (
                    t("settings.notify.telegramConnectDesc")
                  )}
                </p>
              </div>
            </div>
            {telegramOn ? (
              <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
                <Button variant="secondary" size="sm" onClick={sendTest} loading={testBusy}>
                  {t("settings.notify.sendTest")}
                </Button>
                <Button variant="ghost" size="sm" onClick={disconnectTelegram} disabled={saving}>
                  {t("settings.notify.disconnect")}
                </Button>
              </div>
            ) : (
              <Button variant="primary" size="sm" onClick={connectTelegram} loading={linkBusy}>
                {t("settings.notify.connectTelegram")}
              </Button>
            )}
          </div>

          {/* One-time bot link minted by POST /clients/{id}/telegram/link */}
          {pendingLink && (
            <div className="mt-3 rounded-lg border border-brand-200 bg-brand-50 px-4 py-3">
              <p className="text-[13px] font-semibold text-slate-700">{t("settings.notify.connectTitle")}</p>
              <p className="mt-1 text-[12px] text-slate-500">{t("settings.notify.connectSteps")}</p>
              <div className="mt-2.5 flex flex-wrap items-center gap-2">
                <a href={pendingLink.link} target="_blank" rel="noopener noreferrer">
                  <Button variant="primary" size="sm">
                    {t("settings.notify.openBotLink")}
                  </Button>
                </a>
                <Button variant="secondary" size="sm" onClick={checkConnection} loading={checking}>
                  {t("settings.notify.checkStatus")}
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>

      <SaveBar saving={saving} onSave={save} />
    </SectionPanel>
  )
}

/* ------------------------------------------------------------------ */
/* Section: Timezone (design section, persisted to clients.timezone)  */
/* ------------------------------------------------------------------ */
const COMMON_TIMEZONES = [
  "UTC",
  "Africa/Cairo",
  "Africa/Johannesburg",
  "Africa/Nairobi",
  "Europe/London",
  "Europe/Berlin",
  "Europe/Paris",
  "Europe/Istanbul",
  "Asia/Riyadh",
  "Asia/Dubai",
  "Asia/Kolkata",
  "Asia/Singapore",
  "Asia/Tokyo",
  "Asia/Seoul",
  "Australia/Sydney",
  "Pacific/Auckland",
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "America/Sao_Paulo",
]

function getUtcOffset(tz: string): string {
  try {
    const parts = new Intl.DateTimeFormat("en", {
      timeZone: tz,
      timeZoneName: "longOffset",
    }).formatToParts(new Date())
    const val = parts.find((p) => p.type === "timeZoneName")?.value ?? ""
    return val.replace("GMT", "UTC") || "UTC+00:00"
  } catch {
    return ""
  }
}

function detectBrowserTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"
  } catch {
    return "UTC"
  }
}

function TimezoneSection({
  client,
  onSave,
  saving,
}: {
  client: BackendClientInfo
  onSave: (body: ClientUpdateBody) => Promise<boolean>
  saving: boolean
}) {
  const { t } = useLang()
  const detectedTz = useMemo(detectBrowserTimezone, [])
  const storedTz = (client.timezone ?? "").trim()
  const [autoDetect, setAutoDetect] = useState(storedTz === "")
  const [manualTz, setManualTz] = useState(
    storedTz !== "" ? storedTz : COMMON_TIMEZONES.includes(detectedTz) ? detectedTz : "UTC",
  )

  const effectiveTz = autoDetect ? detectedTz : manualTz
  const utcOffset = getUtcOffset(effectiveTz)
  const options = useMemo(() => {
    const list = COMMON_TIMEZONES.includes(manualTz) ? COMMON_TIMEZONES : [...COMMON_TIMEZONES, manualTz]
    return [...list]
  }, [manualTz])

  async function save() {
    const ok = await onSave({ timezone: effectiveTz })
    if (ok) {
      // Keep the existing frontend mirror (read by the automation form's
      // "account timezone") consistent with the value just persisted.
      setAccountTimezoneConfig({ autoDetect, manualTz: effectiveTz })
    }
  }

  return (
    <SectionPanel title={t("settings.section.timezone")} description={t("settings.tz.description")}>
      {/* Auto-detect toggle */}
      <div
        className={cx(
          "flex items-center justify-between rounded-lg border px-4 py-3 transition-colors",
          autoDetect ? "border-brand-200 bg-brand-50" : "border-slate-200",
        )}
      >
        <div>
          <p className="text-[13px] font-semibold text-slate-700">{t("settings.tz.autoDetect")}</p>
          <p className="text-[12px] text-slate-400">{t("settings.tz.autoDetectDesc")}</p>
        </div>
        <Toggle on={autoDetect} onChange={setAutoDetect} />
      </div>

      {/* Detected / effective timezone display */}
      <div
        className={cx(
          "overflow-hidden rounded-lg border",
          autoDetect ? "border-emerald-200 bg-emerald-50" : "border-slate-200 bg-slate-50",
        )}
      >
        <div className="flex items-center gap-4 px-4 py-3.5">
          <div
            className={cx(
              "flex size-10 shrink-0 items-center justify-center rounded-lg",
              autoDetect ? "bg-emerald-100 text-success" : "bg-slate-100 text-slate-500",
            )}
          >
            <svg className="size-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
              <circle cx="12" cy="12" r="9" />
              <path strokeLinecap="round" d="M12 3v18M3 9h18M3 15h18" />
            </svg>
          </div>
          <div className="min-w-0 flex-1">
            <p
              className={cx(
                "text-[11px] font-semibold uppercase tracking-[0.1em]",
                autoDetect ? "text-emerald-600" : "text-slate-400",
              )}
            >
              {autoDetect ? t("settings.tz.detected") : t("settings.tz.selected")}
            </p>
            <div className="mt-0.5 flex items-baseline gap-2">
              <span className="font-mono text-[15px] font-bold text-navy">{effectiveTz}</span>
              <span className="font-mono text-[12px] text-slate-400">{utcOffset}</span>
            </div>
          </div>
          {autoDetect && (
            <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-success/10 px-2.5 py-1 text-[11px] font-semibold text-success">
              <svg className="size-3" viewBox="0 0 20 20" fill="currentColor">
                <path
                  fillRule="evenodd"
                  d="M16.7 5.3a1 1 0 010 1.4l-8 8a1 1 0 01-1.4 0l-4-4a1 1 0 011.4-1.4l3.3 3.29 7.3-7.3a1 1 0 011.4 0z"
                  clipRule="evenodd"
                />
              </svg>
              {t("settings.tz.autoDetected")}
            </span>
          )}
        </div>
      </div>

      {/* Manual selector — visible only when auto-detect is off */}
      {!autoDetect && (
        <Field label={t("settings.tz.label")} hint={t("settings.tz.hint")}>
          <select value={manualTz} onChange={(e) => setManualTz(e.target.value)} className={inputCls}>
            {options.map((tz) => (
              <option key={tz} value={tz}>
                {tz}
              </option>
            ))}
          </select>
        </Field>
      )}

      {/* Scheduling default notice */}
      <div className="flex items-start gap-2.5 rounded-lg border border-brand-100 bg-brand-50 px-4 py-3 text-[12px] text-brand-400">
        <svg className="mt-0.5 size-4 shrink-0" viewBox="0 0 20 20" fill="currentColor">
          <path
            fillRule="evenodd"
            d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a.75.75 0 000 1.5h.253a.25.25 0 01.244.304l-.459 2.066A1.75 1.75 0 0010.747 15H11a.75.75 0 000-1.5h-.253a.25.25 0 01-.244-.304l.459-2.066A1.75 1.75 0 009.253 9H9z"
            clipRule="evenodd"
          />
        </svg>
        <p>
          <span className="font-semibold">{t("settings.tz.schedulingDefault")}</span>{" "}
          {t("settings.tz.scheduleNote", { tz: effectiveTz })}
        </p>
      </div>

      <SaveBar saving={saving} onSave={save} />
    </SectionPanel>
  )
}

/* ------------------------------------------------------------------ */
/* Section: Preferences (frontend-only: language + theme)             */
/* ------------------------------------------------------------------ */
function PreferencesSection() {
  const { t, lang, setLang } = useLang()
  const { dark, setDark } = useTheme()
  return (
    <SectionPanel title={t("settings.section.preferences")} description={t("settings.prefs.description")}>
      <Field label={t("settings.prefs.language")} hint={t("settings.prefs.languageDesc")}>
        <Segmented
          options={[
            { value: "en", label: "English" },
            { value: "ar", label: "العربية" },
          ]}
          value={lang}
          onChange={(v) => setLang(v as Lang)}
        />
      </Field>

      <div className="flex items-center justify-between rounded-lg border border-slate-200 px-4 py-3">
        <div>
          <p className="text-[13px] font-semibold text-slate-700">{t("settings.prefs.theme")}</p>
          <p className="text-[12px] text-slate-400">{t("settings.prefs.themeDesc")}</p>
        </div>
        <div className="flex items-center gap-2.5">
          <span className="text-[12px] font-semibold text-slate-500">
            {dark ? t("settings.prefs.darkMode") : t("settings.prefs.lightMode")}
          </span>
          <Toggle on={dark} onChange={setDark} />
        </div>
      </div>
    </SectionPanel>
  )
}

/* ------------------------------------------------------------------ */
/* Save bar — success feedback only after a confirmed backend write   */
/* ------------------------------------------------------------------ */
function SaveBar({ saving, onSave }: { saving: boolean; onSave: () => Promise<void> }) {
  const { t } = useLang()
  return (
    <div className="flex flex-wrap items-center justify-end gap-3 border-t border-slate-100 pt-4">
      <Button variant="primary" onClick={onSave} loading={saving}>
        {t("common.saveChanges")}
      </Button>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Settings page                                                      */
/* ------------------------------------------------------------------ */
const NAV: { key: string; labelKey: string; needsClient: boolean }[] = [
  { key: "account", labelKey: "settings.section.account", needsClient: false },
  { key: "security", labelKey: "settings.section.security", needsClient: false },
  { key: "credentials", labelKey: "settings.section.credentials", needsClient: true },
  { key: "environment", labelKey: "settings.section.environment", needsClient: true },
  { key: "execution", labelKey: "settings.section.execution", needsClient: true },
  { key: "notifications", labelKey: "settings.section.notifications", needsClient: true },
  { key: "timezone", labelKey: "settings.section.timezone", needsClient: true },
  { key: "preferences", labelKey: "settings.section.preferences", needsClient: false },
]

const NavIcon: Record<string, React.ReactNode> = {
  account: (
    <svg className="size-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <circle cx="12" cy="8" r="3.5" />
      <path strokeLinecap="round" d="M5 20a7 7 0 0114 0" />
    </svg>
  ),
  security: (
    <svg className="size-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6l7-3z" />
    </svg>
  ),
  credentials: (
    <svg className="size-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
      <rect x="3" y="11" width="18" height="11" rx="2" />
      <path d="M7 11V7a5 5 0 0110 0v4" />
    </svg>
  ),
  environment: (
    <svg className="size-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <circle cx="12" cy="12" r="9" />
      <path strokeLinecap="round" d="M3 12h18M12 3c2.5 2.5 3.8 5.8 3.8 9s-1.3 6.5-3.8 9c-2.5-2.5-3.8-5.8-3.8-9S9.5 5.5 12 3z" />
    </svg>
  ),
  execution: (
    <svg className="size-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path strokeLinecap="round" strokeLinejoin="round" d="M8 5l11 7-11 7V5z" />
    </svg>
  ),
  notifications: (
    <svg className="size-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path strokeLinecap="round" strokeLinejoin="round" d="M18 8a6 6 0 00-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M13.7 21a2 2 0 01-3.4 0" />
    </svg>
  ),
  timezone: (
    <svg className="size-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <circle cx="12" cy="12" r="9" />
      <path strokeLinecap="round" d="M12 3v18M3 9h18M3 15h18" />
    </svg>
  ),
  preferences: (
    <svg className="size-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path strokeLinecap="round" d="M4 8h10M18 8h2M4 16h2M10 16h10" />
      <circle cx="15.5" cy="8" r="2" />
      <circle cx="7.5" cy="16" r="2" />
    </svg>
  ),
}

export function Settings({
  active = "settings",
  onSelect = () => {},
  onLogout,
  initialSection,
}: {
  active?: string
  onSelect?: (k: string) => void
  onLogout?: () => void
  /** Section to open first (e.g. "credentials" for the settings-credentials route). */
  initialSection?: string
}) {
  void active
  void onSelect
  const { user, logout } = useAuth()
  const { t } = useLang()
  const toast = useToast()
  const [section, setSection] = useState(initialSection ?? "account")
  const [client, setClient] = useState<BackendClientInfo | null>(null)
  const clientId = user?.clientId ?? null
  const [loading, setLoading] = useState(clientId != null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const loadDetails = useCallback(async () => {
    if (clientId == null) return
    try {
      const details = await apiClientDetails(clientId)
      setClient(details.client)
      setLoadError(null)
      // Seed the frontend timezone mirror from the backend value once, so the
      // automation form's "account timezone" agrees with the server.
      const tz = (details.client.timezone ?? "").trim()
      if (tz !== "" && !hasAccountTimezoneConfig()) {
        setAccountTimezoneConfig({ autoDetect: false, manualTz: tz })
      }
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        logout()
        return
      }
      setLoadError(err instanceof ApiError ? err.message : t("common.loadFailed"))
    } finally {
      setLoading(false)
    }
  }, [clientId, logout, t])

  useEffect(() => {
    if (clientId != null) void loadDetails()
  }, [clientId, loadDetails])

  /** Persist a partial update; resolves true only when the backend confirmed the write. */
  async function saveChanges(body: ClientUpdateBody): Promise<boolean> {
    if (clientId == null) return false
    setSaving(true)
    try {
      await apiUpdateClient(clientId, body)
      await loadDetails()
      toast({ title: t("common.changesSaved"), variant: "success" })
      return true
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        logout()
        return false
      }
      toast({
        title: t("common.saveFailed"),
        description: err instanceof ApiError ? err.message : undefined,
        variant: "error",
      })
      return false
    } finally {
      setSaving(false)
    }
  }

  const visibleNav = NAV.filter((n) => !n.needsClient || clientId != null)

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-brand-300">{t("settings.eyebrow")}</p>
        <h1 className="mt-1 font-display text-2xl font-bold tracking-tight text-navy">{t("settings.title")}</h1>
        <p className="mt-1 text-[13px] text-slate-500">{t("settings.description")}</p>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[220px_1fr]">
        {/* Settings navigation */}
        <nav className="lg:sticky lg:top-24 lg:self-start">
          <div className="flex gap-1 overflow-x-auto lg:flex-col">
            {visibleNav.map((n) => {
              const isActive = section === n.key
              return (
                <button
                  key={n.key}
                  onClick={() => setSection(n.key)}
                  className={cx(
                    "flex shrink-0 items-center gap-2.5 whitespace-nowrap rounded-lg px-3 py-2 text-left text-[13px] font-medium transition-colors",
                    isActive
                      ? "bg-brand-50 text-brand-300"
                      : "text-slate-600 hover:bg-slate-50 hover:text-slate-900",
                  )}
                >
                  <span className={cx(isActive ? "text-brand-400" : "text-slate-400")}>{NavIcon[n.key]}</span>
                  {t(n.labelKey)}
                </button>
              )
            })}
          </div>
        </nav>

        {/* Content */}
        <div className="min-w-0 space-y-6">
          {section === "account" && <AccountSection />}
          {section === "security" && <SecuritySection onLogout={onLogout ?? logout} />}
          {section === "preferences" && <PreferencesSection />}

          {/* Secure Credentials (PR10C.5 Phase 2): client-backed and
              self-fetching — it owns its own loading/error states, so it
              renders whenever a client is linked, independent of the
              client-details fetch below. */}
          {clientId != null && section === "credentials" && (
            <CredentialsSection
              key={`creds-${clientId}`}
              clientId={clientId}
              onUnauthorized={logout}
            />
          )}

          {/* Client-backed sections */}
          {clientId != null && loading && (
            <div className="flex items-center justify-center gap-2.5 rounded-xl border border-slate-200 bg-surface px-6 py-14 text-[13px] text-slate-500">
              <Spinner size="sm" className="text-brand-400" />
              {t("common.loading")}
            </div>
          )}
          {clientId != null && !loading && loadError && (
            <Card>
              <ErrorState
                title={t("common.loadFailed")}
                description={loadError}
                onRetry={() => {
                  setLoading(true)
                  void loadDetails()
                }}
              />
            </Card>
          )}
          {clientId != null && !loading && !loadError && client && (
            <>
              {section === "environment" && (
                <ClientEnvironmentSection
                  key={`env-${client.id}-${[client.base_url, client.is_active, client.site_username, client.site_password_set].join("|")}`}
                  client={client}
                  onSave={saveChanges}
                  saving={saving}
                />
              )}
              {section === "execution" && (
                <TestExecutionSection
                  key={`exec-${client.id}-${[client.browser, client.device_type, client.headless, client.ai_active, client.timeout_seconds, client.run_timeout_minutes, client.retry_count, client.viewport_width, client.viewport_height].join("|")}`}
                  client={client}
                  onSave={saveChanges}
                  saving={saving}
                />
              )}
              {section === "notifications" && (
                <NotificationsSection
                  key={`notify-${client.id}-${[client.notify_policy, client.chat_id].join("|")}`}
                  client={client}
                  onSave={saveChanges}
                  saving={saving}
                  onRefresh={loadDetails}
                />
              )}
              {section === "timezone" && (
                <TimezoneSection
                  key={`tz-${client.id}-${client.timezone ?? ""}`}
                  client={client}
                  onSave={saveChanges}
                  saving={saving}
                />
              )}
            </>
          )}
          {clientId == null && NAV.some((n) => n.key === section && n.needsClient) && (
            <Card>
              <div className="px-5 py-8 text-center text-[13px] text-slate-500">{t("settings.noClient")}</div>
            </Card>
          )}
        </div>
      </div>
    </div>
  )
}

export default Settings
