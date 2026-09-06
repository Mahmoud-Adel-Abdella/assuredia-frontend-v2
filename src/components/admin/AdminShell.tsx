import React, { useCallback, useEffect, useState } from "react"
import { cx } from "../primitives"
import { useLang } from "../../lib/i18n"
import { apiAlertsUnreadCount, apiListAdminAssetRequests, apiListOnboardingRequests } from "../../lib/api"
import { AssureMark } from "../Sidebar"
import { AdminDashboard } from "./AdminDashboard"
import { AdminClients } from "./AdminClients"
import { AdminRuns } from "./AdminRuns"
import { AdminTestDefinitions } from "./AdminTestDefinitions"
import { AdminAlerts } from "./AdminAlerts"
import { AdminAiAnalysis } from "./AdminAiAnalysis"
import { AdminSettings } from "./AdminSettings"
import { AdminRequests } from "./AdminRequests"
import { AdminAssetRequests } from "./AdminAssetRequests"
import { AdminFeedback } from "./AdminFeedback"
import { AdminCreationQueue } from "../testcreation/AdminCreationQueue"
import { ComponentShowcase } from "../ComponentShowcase"

/* ------------------------------------------------------------------ */
/* Admin sidebar                                                      */
/* ------------------------------------------------------------------ */
type NavItem = { key: string; labelKey: string; icon: React.ReactNode; badge?: number }
type NavGroup = { titleKey: string; items: NavItem[] }

function NavIcon({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}

const GROUPS: NavGroup[] = [
  {
    titleKey: "nav.overview",
    items: [
      {
        key: "dashboard",
        labelKey: "admin.navDashboard",
        icon: (
          <svg className="size-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
            <rect x="3" y="3" width="7" height="9" rx="1.5" />
            <rect x="14" y="3" width="7" height="5" rx="1.5" />
            <rect x="14" y="12" width="7" height="9" rx="1.5" />
            <rect x="3" y="16" width="7" height="5" rx="1.5" />
          </svg>
        ),
      },
      {
        key: "clients",
        labelKey: "admin.navClients",
        icon: (
          <svg className="size-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
            <path strokeLinecap="round" strokeLinejoin="round" d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" />
            <circle cx="9" cy="7" r="4" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75" />
          </svg>
        ),
      },
      {
        key: "requests",
        labelKey: "admin.navRequests",
        icon: (
          <svg className="size-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5l5 5v11a2 2 0 01-2 2z" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M13 3v5h5" />
          </svg>
        ),
      },
      {
        key: "asset-requests",
        labelKey: "admin.navAssetRequests",
        icon: (
          <svg className="size-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2" />
            <rect x="9" y="3" width="6" height="4" rx="1" strokeLinecap="round" strokeLinejoin="round" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6M9 16h4" />
          </svg>
        ),
      },
      {
        key: "runs",
        labelKey: "admin.navRuns",
        icon: (
          <svg className="size-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
            <path strokeLinecap="round" strokeLinejoin="round" d="M3.5 12a8.5 8.5 0 108.5-8.5A8.5 8.5 0 004 8" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v4h4M12 7.5V12l3 2" />
          </svg>
        ),
      },
      {
        key: "test-definitions",
        labelKey: "admin.navTestDefinitions",
        icon: (
          <svg className="size-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
            <path strokeLinecap="round" strokeLinejoin="round" d="M14 3H7a2 2 0 00-2 2v14a2 2 0 002 2h10a2 2 0 002-2V8l-5-5z" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M14 3v5h5" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M9.5 13.5L11 15l-1.5 1.5M13 16.5h2" />
          </svg>
        ),
      },
      {
        key: "feedback",
        labelKey: "admin.navFeedback",
        icon: (
          <svg className="size-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
            <path strokeLinecap="round" strokeLinejoin="round" d="M8 10h8M8 14h5M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
          </svg>
        ),
      },
    ],
  },
  {
    titleKey: "nav.monitoring",
    items: [
      {
        key: "alerts",
        labelKey: "nav.alerts",
        icon: (
          <svg className="size-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
            <path strokeLinecap="round" strokeLinejoin="round" d="M18 8a6 6 0 00-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M13.7 21a2 2 0 01-3.4 0" />
          </svg>
        ),
      },
      {
        key: "ai-analysis",
        labelKey: "nav.aiAnalysis",
        icon: (
          <svg className="size-[18px]" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 2l1.6 4.9L18.5 8.5 13.6 10 12 15l-1.6-5L5.5 8.5 10.4 6.9 12 2zM19 14l.9 2.6L22.5 17.5 20 18.4 19 21l-.9-2.6L15.5 17.5 18 16.6 19 14z" />
          </svg>
        ),
      },
    ],
  },
  {
    titleKey: "nav.testCreation",
    items: [
      {
        key: "creation-queue",
        labelKey: "admin.navCreationQueue",
        icon: (
          <svg className="size-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
          </svg>
        ),
      },
    ],
  },
  {
    titleKey: "nav.system",
    items: [
      {
        key: "design-system",
        labelKey: "admin.navDesignSystem",
        icon: (
          <svg className="size-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
            <rect x="2" y="3" width="8" height="8" rx="2" />
            <rect x="14" y="3" width="8" height="8" rx="2" />
            <rect x="2" y="14" width="8" height="8" rx="2" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M18 14v8m-4-4h8" />
          </svg>
        ),
      },
      {
        key: "settings",
        labelKey: "nav.settings",
        icon: (
          <svg className="size-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
            <circle cx="12" cy="12" r="3" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 11-2.83 2.83l-.06-.06a1.65 1.65 0 00-2.77.66 1.65 1.65 0 01-3.16 0 1.65 1.65 0 00-2.77-.66l-.06.06a2 2 0 11-2.83-2.83l.06-.06A1.65 1.65 0 004.6 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 112.83-2.83l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 112.83 2.83l-.06.06A1.65 1.65 0 0019.4 9V9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" />
          </svg>
        ),
      },
    ],
  },
]

function AdminSidebar({
  active,
  onSelect,
  onExit,
  onNavigate,
  onboardingPendingBadge,
  assetPendingBadge,
  alertsUnreadBadge,
}: {
  active: string
  onSelect: (k: string) => void
  onExit: () => void
  onNavigate?: () => void
  onboardingPendingBadge?: number
  assetPendingBadge?: number
  alertsUnreadBadge?: number
}) {
  const { t } = useLang()
  return (
    <div className="flex h-full flex-col bg-surface">
      {/* Brand */}
      <div className="flex h-16 items-center gap-2.5 border-b border-slate-200 px-5">
        <div className="relative shrink-0">
          <AssureMark className="h-9 w-auto" />
          {/* Admin indicator */}
          <span className="absolute -end-1 -top-1 flex size-3.5 items-center justify-center rounded-full bg-warning text-[8px] font-bold text-white ring-2 ring-surface">
            A
          </span>
        </div>
        <div className="leading-none">
          <p className="font-display text-[17px] font-extrabold tracking-tight">
            <span className="text-navy">ASSURE</span>
            <span style={{ color: "#06b6d4" }}>DIA</span>
          </p>
          <p className="mt-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-warning">
            {t("nav.adminConsole")}
          </p>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 space-y-5 overflow-y-auto px-3 py-5">
        {GROUPS.map((group) => (
          <div key={group.titleKey}>
            <p className="px-3 pb-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400">
              {t(group.titleKey)}
            </p>
            <div className="space-y-0.5">
              {group.items.map((item) => {
                const isActive = active === item.key
                return (
                  <button
                    key={item.key}
                    onClick={() => { onSelect(item.key); onNavigate?.() }}
                    className={cx(
                      "group relative flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                      isActive
                        ? "bg-brand-50 text-brand-300"
                        : "text-slate-600 hover:bg-slate-50 hover:text-slate-900",
                    )}
                  >
                    {isActive && (
                      <span className="absolute start-0 top-1/2 h-5 w-1 -translate-y-1/2 rounded-e-full bg-brand-900" />
                    )}
                    <span className={cx(isActive ? "text-brand-400" : "text-slate-400 group-hover:text-slate-500")}>
                      {item.icon}
                    </span>
                    <span className="flex-1 text-start">{t(item.labelKey)}</span>
                    {(() => {
                      const badgeCount =
                        item.key === "requests"
                          ? onboardingPendingBadge
                          : item.key === "asset-requests"
                            ? assetPendingBadge
                            : item.key === "alerts"
                              ? alertsUnreadBadge
                              : item.badge
                      if (typeof badgeCount === "number" && badgeCount > 0) {
                        return (
                          <span className="rounded-full bg-red-100 px-1.5 py-0.5 text-[10px] font-bold text-red-600">
                            {badgeCount}
                          </span>
                        )
                      }
                      return null
                    })()}
                  </button>
                )
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* Footer */}
      <div className="border-t border-slate-200 p-3">
        {/* Admin identity */}
        <div className="mb-2 flex items-center gap-2.5 rounded-lg bg-amber-50 px-3 py-2.5">
          <div className="flex size-8 items-center justify-center rounded-md bg-warning font-display text-[13px] font-bold text-white">
            SA
          </div>
          <div className="min-w-0 flex-1 leading-tight">
            <p className="truncate text-[13px] font-semibold text-slate-800">{t("admin.platformAdmin")}</p>
            <p className="truncate text-[11px] text-amber-600">{t("admin.superAdminGlobal")}</p>
          </div>
        </div>
        {/* Exit to client */}
        <button
          onClick={onExit}
          className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] font-medium text-slate-500 transition-colors hover:bg-slate-50 hover:text-slate-800"
        >
          <svg className="size-4 text-slate-400" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M3 3a1 1 0 00-1 1v12a1 1 0 001 1h12a1 1 0 001-1V4a1 1 0 00-1-1H3zm10.293 9.293a1 1 0 001.414 1.414l3-3a1 1 0 000-1.414l-3-3a1 1 0 10-1.414 1.414L14.586 9H7a1 1 0 100 2h7.586l-1.293 1.293z" />
          </svg>
          {t("admin.exitToClient")}
        </button>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Admin shell                                                        */
/* ------------------------------------------------------------------ */
export function AdminShell({ onExit }: { onExit: () => void }) {
  const [active, setActive] = useState("dashboard")
  const [mobileOpen, setMobileOpen] = useState(false)
  const [pendingDefinition, setPendingDefinition] = useState<{ clientId: number; definitionId: number } | null>(null)
  const { t } = useLang()

  /* Real pending Onboarding Requests count behind the sidebar badge. */
  const [onboardingPending, setOnboardingPending] = useState<number | null>(null)
  const refreshOnboardingPending = useCallback(() => {
    let activeReq = true
    apiListOnboardingRequests("PENDING")
      .then((rows) => {
        if (activeReq) setOnboardingPending(rows.length)
      })
      .catch(() => {
        if (activeReq) setOnboardingPending(null)
      })
    return () => {
      activeReq = false
    }
  }, [])

  useEffect(() => refreshOnboardingPending(), [refreshOnboardingPending])

  /* Real pending Asset Requests count behind the sidebar badge. The badge
     hides until the first successful load; a failed fetch never leaves a
     misleading hardcoded count on screen. */
  const [assetPending, setAssetPending] = useState<number | null>(null)
  const refreshAssetPending = useCallback(() => {
    let activeReq = true
    apiListAdminAssetRequests("PENDING")
      .then((rows) => {
        if (activeReq) setAssetPending(rows.length)
      })
      .catch(() => {
        if (activeReq) setAssetPending(null)
      })
    return () => {
      activeReq = false
    }
  }, [])

  useEffect(() => refreshAssetPending(), [refreshAssetPending])

  /* Real unread alert count behind the sidebar badge (admin-wide scope
     comes from the same role-scoped endpoint the client bell uses). */
  const [alertsUnread, setAlertsUnread] = useState<number | null>(null)
  const refreshAlertsUnread = useCallback(() => {
    let activeReq = true
    apiAlertsUnreadCount()
      .then(({ count }) => {
        if (activeReq) setAlertsUnread(count)
      })
      .catch(() => {
        if (activeReq) setAlertsUnread(null)
      })
    return () => {
      activeReq = false
    }
  }, [])

  useEffect(() => refreshAlertsUnread(), [refreshAlertsUnread])

  return (
    <div className="flex h-full bg-background text-foreground">
      {/* Desktop sidebar */}
      <aside className="hidden w-64 shrink-0 border-e border-slate-200/70 lg:block">
        <AdminSidebar
          active={active}
          onSelect={setActive}
          onExit={onExit}
          onboardingPendingBadge={onboardingPending ?? undefined}
          assetPendingBadge={assetPending ?? undefined}
          alertsUnreadBadge={alertsUnread ?? undefined}
        />
      </aside>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div
            className="absolute inset-0 bg-[#020a16]/70 backdrop-blur-sm"
            onClick={() => setMobileOpen(false)}
          />
          <div className="absolute inset-y-0 start-0 w-72 max-w-[85%] shadow-2xl">
            <AdminSidebar
              active={active}
              onSelect={setActive}
              onExit={onExit}
              onNavigate={() => setMobileOpen(false)}
              onboardingPendingBadge={onboardingPending ?? undefined}
              assetPendingBadge={assetPending ?? undefined}
              alertsUnreadBadge={alertsUnread ?? undefined}
            />
          </div>
        </div>
      )}

      {/* Main content */}
      <div className="flex min-w-0 flex-1 flex-col overflow-y-auto">
        {/* Top bar */}
        <header className="sticky top-0 z-20 border-b border-slate-200/70 bg-background/80 backdrop-blur-md">
          <div className="flex items-center gap-4 px-4 py-3 sm:px-6 lg:px-8">
            <button
              onClick={() => setMobileOpen(true)}
              className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 lg:hidden"
              aria-label={t("admin.openNav")}
            >
              <svg className="size-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2.5">
                <span className="hidden items-center gap-1.5 rounded-full bg-amber-50 px-2.5 py-1 text-[11px] font-semibold text-amber-700 ring-1 ring-inset ring-amber-600/10 sm:inline-flex">
                  <span className="size-1.5 rounded-full bg-warning" />
                  {t("nav.adminConsole")}
                </span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {/* Live indicator */}
              <div className="hidden items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 sm:inline-flex">
                <span className="relative flex size-2">
                  <span className="absolute inline-flex size-full rounded-full bg-success" style={{ animation: "pulse-ring 2s infinite" }} />
                  <span className="relative inline-flex size-2 rounded-full bg-success" />
                </span>
                <span className="text-[13px] font-semibold text-emerald-700">{t("admin.platformHealthy")}</span>
              </div>
            </div>
          </div>
        </header>

        {/* Page content */}
        <main className="mx-auto w-full max-w-[1400px] flex-1 px-4 py-6 sm:px-6 lg:px-8">
          {active === "dashboard" ? (
            <AdminDashboard onNavigate={setActive} />
          ) : active === "clients" ? (
            <AdminClients />
          ) : active === "requests" ? (
            <AdminRequests onRequestsChanged={refreshOnboardingPending} />
          ) : active === "asset-requests" ? (
            <AdminAssetRequests onRequestsChanged={refreshAssetPending} />
          ) : active === "runs" ? (
            <AdminRuns />
          ) : active === "test-definitions" ? (
            <AdminTestDefinitions
              initialClientId={pendingDefinition?.clientId ?? null}
              initialDefinitionId={pendingDefinition?.definitionId ?? null}
            />
          ) : active === "creation-queue" ? (
            <AdminCreationQueue
              onOpenDefinition={(clientId, definitionId) => {
                setPendingDefinition({ clientId, definitionId })
                setActive("test-definitions")
              }}
              onUnauthorized={onExit}
            />
          ) : active === "alerts" ? (
            <AdminAlerts onAlertsChanged={refreshAlertsUnread} />
          ) : active === "ai-analysis" ? (
            <AdminAiAnalysis />
          ) : active === "design-system" ? (
            <ComponentShowcase />
          ) : active === "settings" ? (
            <AdminSettings />
          ) : active === "feedback" ? (
            <AdminFeedback />
          ) : (
            <AdminDashboard onNavigate={setActive} />
          )}
          <footer className="mt-10 flex flex-col items-center justify-between gap-2 border-t border-slate-200/70 pt-5 text-[12px] text-slate-400 sm:flex-row">
            <p>{t("admin.footer")}</p>
            <p className="font-mono">Admin Console v3.2.0 · region us-east-1</p>
          </footer>
        </main>
      </div>
    </div>
  )
}

export default AdminShell

