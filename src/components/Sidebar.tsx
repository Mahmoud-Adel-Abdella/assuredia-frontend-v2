import React from "react"
import { cx } from "./primitives"
import { useLang } from "../lib/i18n"
import assureMarkPng from "../assets/assure-mark.png"

type IconProps = { className?: string }
const Icon = {
  overview: (p: IconProps) => (
    <svg {...p} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <rect x="3" y="3" width="7" height="9" rx="1.5" />
      <rect x="14" y="3" width="7" height="5" rx="1.5" />
      <rect x="14" y="12" width="7" height="9" rx="1.5" />
      <rect x="3" y="16" width="7" height="5" rx="1.5" />
    </svg>
  ),
  flows: (p: IconProps) => (
    <svg {...p} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <circle cx="6" cy="6" r="2.5" />
      <circle cx="18" cy="6" r="2.5" />
      <circle cx="12" cy="18" r="2.5" />
      <path strokeLinecap="round" d="M6 8.5v3a3 3 0 003 3h.5M18 8.5v3a3 3 0 01-3 3h-.5" />
    </svg>
  ),
  automations: (p: IconProps) => (
    <svg {...p} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path strokeLinecap="round" strokeLinejoin="round" d="M13 2L4 14h7l-1 8 9-12h-7l1-8z" />
    </svg>
  ),
  history: (p: IconProps) => (
    <svg {...p} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path strokeLinecap="round" strokeLinejoin="round" d="M3.5 12a8.5 8.5 0 108.5-8.5A8.5 8.5 0 004 8" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v4h4M12 7.5V12l3 2" />
    </svg>
  ),
  requests: (p: IconProps) => (
    <svg {...p} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"
      />
    </svg>
  ),
  testDefinitions: (p: IconProps) => (
    <svg {...p} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path strokeLinecap="round" strokeLinejoin="round" d="M14 3H7a2 2 0 00-2 2v14a2 2 0 002 2h10a2 2 0 002-2V8l-5-5z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M14 3v5h5" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M9.5 13.5L11 15l-1.5 1.5M13 16.5h2" />
    </svg>
  ),
  alerts: (p: IconProps) => (
    <svg {...p} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path strokeLinecap="round" strokeLinejoin="round" d="M18 8a6 6 0 00-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M13.7 21a2 2 0 01-3.4 0" />
    </svg>
  ),
  ai: (p: IconProps) => (
    <svg {...p} viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 2l1.6 4.9L18.5 8.5 13.6 10 12 15l-1.6-5L5.5 8.5 10.4 6.9 12 2zM19 14l.9 2.6L22.5 17.5 20 18.4 19 21l-.9-2.6L15.5 17.5 18 16.6 19 14z" />
    </svg>
  ),
  settings: (p: IconProps) => (
    <svg {...p} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <circle cx="12" cy="12" r="3" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 11-2.83 2.83l-.06-.06a1.65 1.65 0 00-2.77.66 1.65 1.65 0 01-3.16 0 1.65 1.65 0 00-2.77-.66l-.06.06a2 2 0 11-2.83-2.83l.06-.06A1.65 1.65 0 004.6 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 112.83-2.83l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 112.83 2.83l-.06.06A1.65 1.65 0 0019.4 9V9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" />
    </svg>
  ),
  logout: (p: IconProps) => (
    <svg {...p} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9" />
    </svg>
  ),
  feedback: (p: IconProps) => (
    <svg {...p} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path strokeLinecap="round" strokeLinejoin="round" d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M8 10h8M8 14h5" />
    </svg>
  ),
  help: (p: IconProps) => (
    <svg {...p} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <circle cx="12" cy="12" r="10" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M9.09 9a3 3 0 015.83 1c0 2-3 3-3 3" />
      <circle cx="12" cy="17" r=".5" fill="currentColor" stroke="none" />
    </svg>
  ),
  /* Sidebar panel toggle — matches the ChatGPT-style icon in the Figma design */
  sidebarToggle: (p: IconProps) => (
    <svg {...p} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <rect x="3" y="3" width="18" height="18" rx="2.5" />
      <path strokeLinecap="round" d="M9 3v18" />
    </svg>
  ),
}

type NavItem = { key: string; labelKey: string; icon: (p: IconProps) => React.ReactNode; badge?: number }
type NavGroup = { titleKey: string; items: NavItem[] }

const groups: NavGroup[] = [
  {
    titleKey: "nav.workspace",
    items: [
      { key: "overview", labelKey: "nav.overview", icon: Icon.overview },
      { key: "flows", labelKey: "nav.flows", icon: Icon.flows },
      { key: "automations", labelKey: "nav.automations", icon: Icon.automations },
      { key: "test-definitions", labelKey: "nav.testDefinitions", icon: Icon.testDefinitions },
      { key: "requests", labelKey: "nav.requests", icon: Icon.requests },
      { key: "history", labelKey: "nav.runHistory", icon: Icon.history },
    ],
  },
  {
    titleKey: "nav.monitoring",
    items: [
      { key: "alerts", labelKey: "nav.alerts", icon: Icon.alerts },
      { key: "ai-analysis", labelKey: "nav.aiAnalysis", icon: Icon.ai },
    ],
  },
  {
    titleKey: "nav.testCreation",
    items: [
      { key: "test-creation", labelKey: "nav.newTest", icon: Icon.testDefinitions },
      { key: "creation-requests", labelKey: "nav.creationRequests", icon: Icon.requests },
    ],
  },
  {
    titleKey: "nav.system",
    items: [{ key: "settings", labelKey: "nav.settings", icon: Icon.settings }],
  },
  {
    titleKey: "nav.support",
    items: [
      { key: "feedback", labelKey: "nav.feedback", icon: Icon.feedback },
      { key: "help", labelKey: "nav.help", icon: Icon.help },
    ],
  },
]

/** The Assuredia symbol mark — the exact brand asset from the approved Figma design. */
export function AssureMark({ className }: { className?: string }) {
  return (
    <img
      src={assureMarkPng}
      alt="Assuredia symbol"
      className={className}
      style={{ objectFit: "contain" }}
      aria-hidden="true"
    />
  )
}

/**
 * Horizontal brand lockup: symbol + ASSURE (navy → light on dark theme) +
 * DIA (teal). The approved logo carries no tagline.
 */
export function Logo({ compact }: { compact?: boolean }) {
  return (
    <div className="flex items-center gap-2">
      <AssureMark className={compact ? "h-7 w-auto" : "h-8 w-auto"} />
      {!compact && (
        <p className="font-display text-[18px] font-extrabold tracking-tight">
          <span className="text-navy">ASSURE</span>
          <span style={{ color: "#06b6d4" }}>DIA</span>
        </p>
      )}
    </div>
  )
}

export function Sidebar({
  active,
  onSelect,
  onNavigate,
  onAdmin,
  onLogout,
  userName,
  userEmail,
  clientName,
  alertsBadge = 0,
  collapsed = false,
  onToggleCollapsed,
}: {
  active: string
  onSelect: (k: string) => void
  onNavigate?: () => void
  onAdmin?: () => void
  onLogout?: () => void
  userName?: string
  userEmail?: string
  clientName?: string | null
  /** Real unread-alerts count (GET /alerts/unread-count); hidden when 0. */
  alertsBadge?: number
  /** Icon-only collapsed mode (desktop only; the mobile drawer stays expanded). */
  collapsed?: boolean
  onToggleCollapsed?: () => void
}) {
  const { t } = useLang()
  const accountName = clientName?.trim() || t("common.workspace")
  const accountInitials =
    accountName.trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join("").toUpperCase() || "WS"
  const userInitials =
    (userName ?? "A").trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join("").toUpperCase() || "A"

  return (
    <div className="flex h-full flex-col bg-surface">
      {/* Brand header — collapse toggle lives here, top corner, ChatGPT-style */}
      <div className={cx("flex h-16 items-center border-b border-slate-100", collapsed ? "justify-center gap-0.5 px-0.5" : "px-4")}>
        {collapsed ? (
          <AssureMark className="h-6 w-auto shrink-0" />
        ) : (
          <div className="min-w-0 flex-1">
            <Logo />
          </div>
        )}
        {onToggleCollapsed && (
          <div className="group relative shrink-0">
            <button
              onClick={onToggleCollapsed}
              aria-label={collapsed ? t("sidebar.open") : t("sidebar.close")}
              className="flex size-8 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
            >
              <Icon.sidebarToggle className="size-[18px]" />
            </button>
            {/* Tooltip — appears below, offset so it clears the sidebar edge */}
            <div
              className={cx(
                "pointer-events-none absolute top-full z-50 mt-2 whitespace-nowrap rounded-md bg-slate-900 px-2.5 py-1.5 text-[12px] font-medium text-white opacity-0 shadow-lg transition-opacity group-hover:opacity-100",
                collapsed ? "start-0" : "end-0",
              )}
            >
              {collapsed ? t("sidebar.open") : t("sidebar.close")}
              {/* Caret pointing up */}
              <span className={cx("absolute -top-1 size-2 rotate-45 bg-slate-900", collapsed ? "start-3" : "end-3")} />
            </div>
          </div>
        )}
      </div>

      {/* Nav */}
      <nav className={cx("flex-1 overflow-y-auto py-5", collapsed ? "space-y-2 px-2" : "space-y-6 px-3")}>
        {groups.map((group, gi) => (
          <div key={group.titleKey}>
            {collapsed ? (
              gi > 0 && <div className="my-2 h-px bg-slate-100" />
            ) : (
              <p className="px-3 pb-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400">
                {t(group.titleKey)}
              </p>
            )}
            <div className="space-y-0.5">
              {group.items.map((item) => {
                const isActive = active === item.key
                const badge = item.key === "alerts" ? alertsBadge : item.badge
                return (
                  <button
                    key={item.key}
                    title={collapsed ? t(item.labelKey) : undefined}
                    onClick={() => {
                      onSelect(item.key)
                      onNavigate?.()
                    }}
                    className={cx(
                      "group relative flex w-full items-center rounded-lg transition-colors",
                      collapsed ? "justify-center p-2.5" : "gap-3 px-3 py-2 text-sm font-medium",
                      isActive
                        ? "bg-brand-50 text-brand-300"
                        : "text-slate-600 hover:bg-slate-50 hover:text-slate-900",
                    )}
                  >
                    {isActive && (
                      <span className="absolute start-0 top-1/2 h-5 w-1 -translate-y-1/2 rounded-e-full bg-brand-900" />
                    )}
                    <span className={cx("relative shrink-0", isActive ? "text-brand-400" : "text-slate-400 group-hover:text-slate-500")}>
                      {item.icon?.({ className: "size-[18px]" })}
                      {/* Collapsed badge — red dot on the icon */}
                      {collapsed && badge != null && badge > 0 && (
                        <span className="absolute -end-0.5 -top-0.5 size-2 rounded-full bg-error ring-1 ring-surface" />
                      )}
                    </span>
                    {!collapsed && (
                      <>
                        <span className="flex-1 text-start">{t(item.labelKey)}</span>
                        {badge != null && badge > 0 && (
                          <span className="rounded-full bg-red-100 px-1.5 py-0.5 text-[10px] font-bold text-red-600">
                            {badge > 99 ? "99+" : badge}
                          </span>
                        )}
                      </>
                    )}
                  </button>
                )
              })}
            </div>
          </div>
        ))}
      </nav>

      <div className={cx("border-t border-slate-100", collapsed ? "p-2" : "p-3")}>
        {/* Admin Console access */}
        {onAdmin &&
          (collapsed ? (
            <button
              onClick={onAdmin}
              title={t("nav.adminConsole")}
              aria-label={t("nav.adminConsole")}
              className="mb-2 flex w-full justify-center rounded-lg p-2.5 text-amber-500 transition-colors hover:bg-amber-50"
            >
              <span className="flex size-5 items-center justify-center rounded-sm bg-warning text-[9px] font-bold text-white">A</span>
            </button>
          ) : (
            <button
              onClick={onAdmin}
              className="mb-2 flex w-full items-center gap-2 rounded-lg px-3 py-2 text-[12px] font-semibold text-amber-600 transition-colors hover:bg-amber-50"
            >
              <span className="flex size-4 items-center justify-center rounded-sm bg-warning text-[8px] font-bold text-white">A</span>
              {t("nav.adminConsole")}
              <svg className="ms-auto size-3.5 text-amber-400 rtl:-scale-x-100" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M10.293 3.293a1 1 0 011.414 0l6 6a1 1 0 010 1.414l-6 6a1 1 0 01-1.414-1.414L14.586 11H3a1 1 0 110-2h11.586l-4.293-4.293a1 1 0 010-1.414z" />
              </svg>
            </button>
          ))}

        {/* Account indicator */}
        {collapsed ? (
          <div
            title={`${accountName} · ${t("sidebar.planLabel")}`}
            className="mb-2 flex justify-center rounded-lg p-1.5"
          >
            <div className="flex size-8 items-center justify-center rounded-md bg-brand-900 font-display text-[13px] font-bold text-white">
              {accountInitials}
            </div>
          </div>
        ) : (
          <div className="mb-2 flex items-center gap-2.5 rounded-lg bg-slate-50 px-3 py-2.5">
            <div className="flex size-8 items-center justify-center rounded-md bg-brand-900 font-display text-[13px] font-bold text-white">
              {accountInitials}
            </div>
            <div className="min-w-0 flex-1 leading-tight">
              <p className="truncate text-[13px] font-semibold text-slate-800">{accountName}</p>
              <p className="truncate text-[11px] text-slate-400">{t("sidebar.planLabel")}</p>
            </div>
            <svg className="size-4 shrink-0 text-slate-300" viewBox="0 0 20 20" fill="currentColor">
              <path d="M6 8l4 4 4-4H6z" />
            </svg>
          </div>
        )}

        {/* User profile — collapsed mode keeps the avatar with a tooltip;
            logout stays reachable when expanded and in Settings. */}
        {collapsed ? (
          <div
            title={`${userName ?? t("common.user")}${userEmail ? ` · ${userEmail}` : ""}`}
            className="flex justify-center px-1 py-1.5"
          >
            <div className="flex size-8 items-center justify-center rounded-full bg-brand-900 font-display text-[11px] font-bold text-white ring-2 ring-surface">
              {userInitials}
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-2.5 px-1 py-1.5">
            <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-brand-900 font-display text-[11px] font-bold text-white ring-2 ring-surface">
              {userInitials}
            </div>
            <div className="min-w-0 flex-1 leading-tight">
              <p className="truncate text-[13px] font-semibold text-slate-800">{userName ?? t("common.user")}</p>
              <p className="truncate text-[11px] text-slate-400">{userEmail ?? ""}</p>
            </div>
            <button
              title={t("nav.logout")}
              aria-label={t("nav.logout")}
              onClick={onLogout}
              className="rounded-md p-1.5 text-slate-400 transition-colors hover:bg-red-50 hover:text-error"
            >
              <Icon.logout className="size-[18px]" />
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
