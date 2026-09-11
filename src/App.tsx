import React, { useEffect, useState } from "react"
import { Sidebar, AssureMark } from "./components/Sidebar"
import { Dashboard } from "./components/Dashboard"
import { Flows } from "./components/Flows"
import { Automations } from "./components/Automations"
import { Alerts } from "./components/Alerts"
import { Settings } from "./components/Settings"
import { RunHistory } from "./components/RunHistory"
import { Requests } from "./components/Requests"
import { AiAnalysis } from "./components/AiAnalysis"
import { AdminShell } from "./components/admin/AdminShell"
import { LoginScreen } from "./components/LoginScreen"
import {
  SelfServiceOnboarding,
  SignedUpUser,
} from "./components/SelfServiceOnboarding"
import {
  OAuthCompleteScreen,
  isOauthCompletePath,
} from "./components/OAuthComplete"
import { LiveRunView } from "./components/LiveRunView"
import { AutomationRunView } from "./components/AutomationRunView"
import { Feedback } from "./components/Feedback"
import { Help } from "./components/Help"
import { Landing } from "./components/Landing"
import { TestDefinitionsPage } from "./components/testdefinitions/TestDefinitionsPage"
import { CreateTestPage } from "./components/CreateTestPage"
import { CreationRequestsPage } from "./components/testcreation/CreationRequestsPage"
import { cx, Spinner, ToastProvider, useToast } from "./components/primitives"
import { AuthProvider, useAuth } from "./lib/auth"
import { LanguageProvider, useLang } from "./lib/i18n"
import { useTheme } from "./lib/theme"
import {
  ApiError,
  apiAlertsUnreadCount,
  apiRunFlow,
  type AssetRequestType,
} from "./lib/api"
import type { AutomationRunStart } from "./lib/automations"
import type { LiveRunSession } from "./lib/runData"

function ThemeToggle() {
  // Centralized theme mechanism (src/lib/theme.ts): same localStorage key +
  // <html> class as the pre-paint bootstrap in main.tsx. A MutationObserver
  // keeps this toggle in sync with the Settings > Preferences control.
  const { dark, toggle } = useTheme()
  const { t } = useLang()
  const label = dark ? t("header.switchToLight") : t("header.switchToDark")

  return (
    <button
      onClick={toggle}
      aria-label={label}
      title={label}
      className="rounded-lg border border-slate-200 bg-surface p-2 text-slate-500 transition-colors hover:bg-slate-50 hover:text-slate-700"
    >
      {dark ? (
        <svg
          className="size-5"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M21 12.8A9 9 0 1111.2 3a7 7 0 009.8 9.8z"
          />
        </svg>
      ) : (
        <svg
          className="size-5"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
        >
          <circle cx="12" cy="12" r="4" />
          <path
            strokeLinecap="round"
            d="M12 2v2m0 16v2M4.9 4.9l1.4 1.4m11.4 11.4l1.4 1.4M2 12h2m16 0h2M4.9 19.1l1.4-1.4m11.4-11.4l1.4-1.4"
          />
        </svg>
      )}
    </button>
  )
}

function Header({
  onMenu,
  alertsUnread,
  onBell,
  onHelp,
}: {
  onMenu: () => void
  alertsUnread: number
  onBell: () => void
  onHelp: () => void
}) {
  const { user } = useAuth()
  const { t } = useLang()
  const hour = new Date().getHours()
  const greeting = t(
    hour < 12
      ? "header.goodMorning"
      : hour < 18
        ? "header.goodAfternoon"
        : "header.goodEvening",
  )
  const firstName = user?.name?.trim().split(/\s+/)[0]
  const bellLabel =
    alertsUnread > 0
      ? t("header.unreadAlerts", { count: alertsUnread })
      : t("nav.alerts")

  return (
    <header className="sticky top-0 z-20 border-b border-slate-200/70 bg-background/80 backdrop-blur-md">
      <div className="flex items-center gap-4 px-4 py-4 sm:px-6 lg:px-8">
        <button
          onClick={onMenu}
          className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 lg:hidden"
          aria-label="Open navigation"
        >
          <svg
            className="size-5"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path strokeLinecap="round" d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>

        <div className="min-w-0 flex-1">
          <h1 className="truncate font-display text-xl font-bold tracking-tight text-navy sm:text-2xl">
            {firstName ? `${greeting}, ${firstName}` : greeting}
          </h1>
          <p className="mt-0.5 hidden text-[13px] text-slate-500 sm:block">
            {t("header.subtitle")}
          </p>
        </div>

        <div className="flex items-center gap-2">
          {/* Status indicator */}
          <div className="hidden items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 sm:inline-flex">
            <span className="relative flex size-2">
              <span
                className="absolute inline-flex size-full rounded-full bg-success"
                style={{ animation: "pulse-ring 2s infinite" }}
              />
              <span className="relative inline-flex size-2 rounded-full bg-success" />
            </span>
            <span className="text-[13px] font-semibold text-emerald-700">
              {t("header.allSystems")}
            </span>
          </div>

          <ThemeToggle />

          <button
            onClick={onBell}
            aria-label={bellLabel}
            title={bellLabel}
            className="relative rounded-lg border border-slate-200 bg-surface p-2 text-slate-500 transition-colors hover:bg-slate-50 hover:text-slate-700"
          >
            <svg
              className="size-5"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M18 8a6 6 0 00-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 01-3.4 0"
              />
            </svg>
            {alertsUnread > 0 && (
              <span className="absolute -end-1.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-error px-1 text-[9px] font-bold leading-none text-white ring-2 ring-surface">
                {alertsUnread > 99 ? "99+" : alertsUnread}
              </span>
            )}
          </button>

          {/* Help — opens the Help Center (Figma top bar) */}
          <button
            onClick={onHelp}
            aria-label={t("header.help")}
            title={t("header.help")}
            className="rounded-lg border border-slate-200 bg-surface p-2 text-slate-500 transition-colors hover:bg-slate-50 hover:text-slate-700"
          >
            <svg
              className="size-5"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
            >
              <circle cx="12" cy="12" r="10" />
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M9.09 9a3 3 0 015.83 1c0 2-3 3-3 3"
              />
              <circle
                cx="12"
                cy="17"
                r=".5"
                fill="currentColor"
                stroke="none"
              />
            </svg>
          </button>
        </div>
      </div>
    </header>
  )
}

type PublicView = "landing" | "login" | "signup" | "onboarding"
type AuthedView = "client" | "admin"

/* Full-screen splash shown while a stored token is validated against /me. */
function AuthRestoringScreen() {
  return (
    <div className="flex min-h-full flex-col items-center justify-center gap-5 bg-background px-4">
      <AssureMark className="h-12 w-auto" />
      <div className="flex items-center gap-2.5 text-[13px] text-slate-500">
        <Spinner size="sm" className="text-brand-400" />
        Signing you in…
      </div>
    </div>
  )
}

function AppInner() {
  const { status, user, logout } = useAuth()
  const { t } = useLang()
  const toast = useToast()
  const [publicView, setPublicView] = useState<PublicView>("landing")
  const [signedUpUser, setSignedUpUser] = useState<SignedUpUser | null>(null)
  const [authedView, setAuthedView] = useState<AuthedView>("client")
  const [active, setActive] = useState("overview")
  const [mobileOpen, setMobileOpen] = useState(false)
  // Sidebar collapsed state — persisted to localStorage (Figma delta).
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    try {
      return localStorage.getItem("sidebarCollapsed") === "true"
    } catch {
      return false
    }
  })

  function toggleSidebar() {
    setSidebarCollapsed((v) => {
      const next = !v
      try {
        localStorage.setItem("sidebarCollapsed", String(next))
      } catch {
        /* ignore storage failures */
      }
      return next
    })
  }

  /** The run currently open in the live RunDetail view (Phase 4). */
  const [liveRun, setLiveRun] = useState<LiveRunSession | null>(null)
  /** The aggregate automation execution currently open (Phase 5 remediation). */
  const [automationRun, setAutomationRun] = useState<{
    target: AutomationRunStart
    name: string
  } | null>(null)
  /** Real unread-alerts count behind the bell + sidebar badge (Phase 7). */
  const [alertsUnread, setAlertsUnread] = useState(0)
  /** Bumped by the Alerts page after read/resolve so the count refreshes. */
  const [alertsVersion, setAlertsVersion] = useState(0)
  /** Run deep-linked from an alert — consumed by Run History. */
  const [pendingRunId, setPendingRunId] = useState<string | null>(null)
  /** Preselected request type when the Flows page opens a request form. */
  const [pendingRequest, setPendingRequest] = useState<{
    type: AssetRequestType
    flowId?: number
  } | null>(null)
  /** Test Definition deep-linked from a DRAFT_CREATED creation request. */
  const [pendingDefinitionId, setPendingDefinitionId] = useState<number | null>(
    null,
  )
  /** Run/execution deep-linked via "View AI Analysis" — consumed by the AI Analysis page. */
  const [aiOpenRunId, setAiOpenRunId] = useState<string | null>(null)
  /** True when the page loaded on the OAuth callback route (/oauth/complete). */
  const [oauthComplete, setOauthComplete] = useState(() =>
    isOauthCompletePath(),
  )

  /** Open one run's AI analysis on the AI Analysis page (stable run/execution id). */
  function openAiAnalysis(runId: string) {
    setAiOpenRunId(runId)
    setLiveRun(null)
    setAutomationRun(null)
    setActive("ai-analysis")
  }

  // Unread alert count: fetched once per session, per navigation, and after
  // alert mutations. The backend has no push channel, so there is no polling —
  // the count is never simulated between fetches.
  useEffect(() => {
    if (status !== "authenticated") {
      setAlertsUnread(0)
      return
    }
    let cancelled = false
    apiAlertsUnreadCount()
      .then(({ count }) => {
        if (!cancelled) setAlertsUnread(count)
      })
      .catch((err) => {
        if (cancelled) return
        if (err instanceof ApiError && err.status === 401) logout()
        // Any other failure leaves the last known count in place.
      })
    return () => {
      cancelled = true
    }
  }, [status, active, alertsVersion, logout])

  function handleLogout() {
    logout()
    setMobileOpen(false)
    setActive("overview")
    setAuthedView("client")
    setPublicView("landing")
    setSignedUpUser(null)
    setLiveRun(null)
    setAutomationRun(null)
    setPendingRunId(null)
    setAiOpenRunId(null)
    setAlertsUnread(0)
  }

  /**
   * Run Again — re-executes the same flow through the same single-flow
   * endpoint with the options the run was started with. All required
   * information (client from auth, flowId + options from the session) is
   * available, so this maps safely onto the frozen contract.
   */
  async function handleRunAgain() {
    if (!liveRun || user?.clientId == null) return
    try {
      const res = await apiRunFlow(
        user.clientId,
        liveRun.flowId,
        liveRun.options,
      )
      setLiveRun({ ...liveRun, runId: res.runId, totalTests: res.totalTests })
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        logout()
        return
      }
      if (err instanceof ApiError && err.status === 409) {
        toast({
          title: "Run already in progress",
          description: "Another run is already in progress for this client.",
          variant: "warning",
        })
        return
      }
      toast({
        title: "Could not start the run",
        description:
          err instanceof ApiError
            ? err.message
            : "Something went wrong. Please try again.",
        variant: "error",
      })
    }
  }

  /**
   * Run Again from Run History (Figma run-header action) — re-executes a
   * finished single-flow run with default options via the same frozen
   * single-flow endpoint used by the Flows page.
   */
  async function handleRunAgainFromHistory(flowId: number) {
    if (user?.clientId == null) return
    try {
      const res = await apiRunFlow(user.clientId, flowId)
      setLiveRun({
        runId: res.runId,
        flowId,
        flowName: res.flow,
        clientName: res.client,
        methods: [],
        totalTests: res.totalTests,
        options: {},
      })
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        logout()
        return
      }
      if (err instanceof ApiError && err.status === 409) {
        toast({
          title: "Run already in progress",
          description: "Another run is already in progress for this client.",
          variant: "warning",
        })
        return
      }
      toast({
        title: "Could not start the run",
        description:
          err instanceof ApiError
            ? err.message
            : "Something went wrong. Please try again.",
        variant: "error",
      })
    }
  }

  // ---- OAuth callback route -----------------------------------------
  // The backend OAuth redirect lands here with a one-time code (or error).
  // Rendered before any status-based view so Login/Dashboard never flash
  // while the code is exchanged.
  if (oauthComplete) {
    return <OAuthCompleteScreen onDone={() => setOauthComplete(false)} />
  }

  // ---- Restoring a stored session ---------------------------------
  if (status === "restoring") {
    return <AuthRestoringScreen />
  }

  // ---- Unauthenticated: landing / login / signup / onboarding ------
  if (status === "unauthenticated") {
    if (publicView === "landing") {
      return (
        <Landing
          onSignIn={() => setPublicView("login")}
          onSignUp={() => setPublicView("signup")}
        />
      )
    }
    if (publicView === "onboarding" && signedUpUser) {
      return (
        <SelfServiceOnboarding
          user={signedUpUser}
          onApproved={() => setAuthedView("client")}
          onBack={() => setPublicView("login")}
        />
      )
    }
    // Combined Figma auth screen: one tabbed credentials card for both
    // entry points. `key` remounts it when the entry point changes so the
    // initial tab always matches the CTA that opened it (Figma flow).
    return (
      <LoginScreen
        key={publicView}
        initialTab={publicView === "signup" ? "signup" : "login"}
        onSignIn={() => setAuthedView("client")}
        onSignUp={(u) => {
          setSignedUpUser(u)
          setPublicView("onboarding")
        }}
        onBack={() => setPublicView("landing")}
      />
    )
  }

  // ---- Authenticated ----------------------------------------------
  if (authedView === "admin" && user?.role === "ADMIN") {
    return <AdminShell onExit={() => setAuthedView("client")} />
  }

  return (
    <div className="flex h-full bg-background text-foreground">
      {/* Desktop sidebar — width transitions smoothly on collapse */}
      <aside
        className={cx(
          "hidden shrink-0 overflow-hidden border-e border-slate-200/70 transition-[width] duration-200 ease-in-out lg:block",
          sidebarCollapsed ? "w-16" : "w-64",
        )}
      >
        <Sidebar
          active={active}
          onSelect={setActive}
          onAdmin={
            user?.role === "ADMIN" ? () => setAuthedView("admin") : undefined
          }
          onLogout={handleLogout}
          userName={user?.name}
          userEmail={user?.email}
          clientName={user?.clientName}
          alertsBadge={alertsUnread}
          collapsed={sidebarCollapsed}
          onToggleCollapsed={toggleSidebar}
        />
      </aside>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div
            className="absolute inset-0 bg-[#020a16]/70 backdrop-blur-sm"
            onClick={() => setMobileOpen(false)}
          />
          <div
            className={cx(
              "absolute inset-y-0 start-0 w-72 max-w-[85%] shadow-2xl",
            )}
          >
            <Sidebar
              active={active}
              onSelect={setActive}
              onNavigate={() => setMobileOpen(false)}
              onAdmin={
                user?.role === "ADMIN"
                  ? () => {
                      setAuthedView("admin")
                      setMobileOpen(false)
                    }
                  : undefined
              }
              onLogout={() => {
                handleLogout()
                setMobileOpen(false)
              }}
              userName={user?.name}
              userEmail={user?.email}
              clientName={user?.clientName}
              alertsBadge={alertsUnread}
            />
          </div>
        </div>
      )}

      {/* Main */}
      <div className="flex min-w-0 flex-1 flex-col overflow-y-auto">
        <Header
          onMenu={() => setMobileOpen(true)}
          alertsUnread={alertsUnread}
          onBell={() => setActive("alerts")}
          onHelp={() => setActive("help")}
        />
        <main className="mx-auto w-full max-w-[1400px] flex-1 px-4 py-6 sm:px-6 lg:px-8">
          {liveRun ? (
            <LiveRunView
              active={active}
              onSelect={(k) => {
                setLiveRun(null)
                setAutomationRun(null)
                setAiOpenRunId(null)
                setActive(k)
              }}
              session={liveRun}
              onBack={() => setLiveRun(null)}
              onUnauthorized={logout}
              onRunAgain={handleRunAgain}
              onViewAi={openAiAnalysis}
              backLabel={
                automationRun
                  ? t("autrun.backToAutomationRun")
                  : active === "automations"
                    ? t("page.automations.back")
                    : active === "history"
                      ? t("history.backToHistory")
                      : t("flowform.backToFlows")
              }
            />
          ) : automationRun && user?.clientId != null ? (
            <AutomationRunView
              active={active}
              onSelect={(k) => {
                setAutomationRun(null)
                setAiOpenRunId(null)
                setActive(k)
              }}
              clientId={user.clientId}
              clientName={user?.clientName ?? ""}
              automationName={automationRun.name}
              target={automationRun.target}
              onBack={() => setAutomationRun(null)}
              onUnauthorized={logout}
              onOpenChildRun={setLiveRun}
              onViewAi={openAiAnalysis}
            />
          ) : active === "flows" ? (
            <Flows
              active={active}
              onSelect={setActive}
              onStartRun={setLiveRun}
              onRequestPreset={(preset) => setPendingRequest(preset)}
            />
          ) : active === "automations" ? (
            <Automations
              active={active}
              onSelect={setActive}
              onOpenRun={(target, name) => setAutomationRun({ target, name })}
            />
          ) : active === "test-definitions" && user?.clientId != null ? (
            <TestDefinitionsPage
              key={pendingDefinitionId ?? "list"}
              active={active}
              onSelect={(k) => {
                setPendingDefinitionId(null)
                setActive(k)
              }}
              showWorkspaceHeader
              clientId={user.clientId}
              clientName={user.clientName ?? ""}
              /* The engine reserves Approve, Proving and Archive for an ADMIN and
                 answers 403 regardless of what this flag shows. */
              isAdmin={user.role === "ADMIN"}
              onUnauthorized={logout}
              initialDefinitionId={pendingDefinitionId}
            />
          ) : active === "test-creation" && user?.clientId != null ? (
            <CreateTestPage
              clientId={user.clientId}
              onViewDrafts={() => {
                setPendingDefinitionId(null)
                setActive("test-definitions")
              }}
              onViewRequests={() => setActive("creation-requests")}
              onOpenDefinition={(definitionId) => {
                setPendingDefinitionId(definitionId)
                setActive("test-definitions")
              }}
              onUnauthorized={logout}
            />
          ) : active === "creation-requests" && user?.clientId != null ? (
            <CreationRequestsPage
              clientId={user.clientId}
              onNewTest={() => setActive("test-creation")}
              onOpenDefinition={(definitionId) => {
                setPendingDefinitionId(definitionId)
                setActive("test-definitions")
              }}
              onUnauthorized={logout}
            />
          ) : active === "alerts" ? (
            <Alerts
              active={active}
              onSelect={setActive}
              onOpenRun={(runId) => {
                setPendingRunId(runId)
                setAiOpenRunId(null)
                setActive("history")
              }}
              onAlertsChanged={() => setAlertsVersion((v) => v + 1)}
            />
          ) : active === "settings" ? (
            <Settings
              active={active}
              onSelect={setActive}
              onLogout={handleLogout}
            />
          ) : active === "history" ? (
            <RunHistory
              active={active}
              onSelect={setActive}
              openRunId={pendingRunId}
              onOpenRunConsumed={() => setPendingRunId(null)}
              onViewAi={openAiAnalysis}
              onRunAgainFlow={handleRunAgainFromHistory}
            />
          ) : active === "requests" ? (
            <Requests
              active={active}
              onSelect={setActive}
              initialType={pendingRequest?.type}
              initialFlowId={pendingRequest?.flowId}
              initialConsumed={() => setPendingRequest(null)}
            />
          ) : active === "ai-analysis" ? (
            <AiAnalysis
              active={active}
              onSelect={setActive}
              openRunId={aiOpenRunId}
              onOpenRunConsumed={() => setAiOpenRunId(null)}
              onOpenRun={(runId) => {
                setPendingRunId(runId)
                setActive("history")
              }}
            />
          ) : active === "feedback" ? (
            <Feedback />
          ) : active === "help" ? (
            <Help />
          ) : (
            <Dashboard
              onSelect={setActive}
              onOpenRun={(runId) => {
                setPendingRunId(runId)
                setAiOpenRunId(null)
                setActive("history")
              }}
            />
          )}
          <footer className="mt-10 flex flex-col items-center justify-between gap-2 border-t border-slate-200/70 pt-5 text-[12px] text-slate-400 sm:flex-row">
            <p>{t("footer.tagline")}</p>
            <p className="font-mono">v3.2.0 · region us-east-1</p>
          </footer>
        </main>
      </div>
    </div>
  )
}

export default function App() {
  return (
    <LanguageProvider>
      <ToastProvider>
        <AuthProvider>
          <AppInner />
        </AuthProvider>
      </ToastProvider>
    </LanguageProvider>
  )
}
