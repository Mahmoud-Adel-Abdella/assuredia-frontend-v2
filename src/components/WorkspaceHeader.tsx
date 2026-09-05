import React from "react"
import { Card, cx } from "./primitives"
import { useAuth } from "../lib/auth"
import { useLang } from "../lib/i18n"

/* ------------------------------------------------------------------ */
/* Shared Client Workspace header + navigation                        */
/* Overview · Flows · Automations · Run History                       */
/* Identity comes from the real /auth/me session — never hardcoded.   */
/* ------------------------------------------------------------------ */
export const WORKSPACE_NAV = [
  { key: "overview", labelKey: "nav.overview" },
  { key: "flows", labelKey: "nav.flows" },
  { key: "automations", labelKey: "nav.automations" },
  { key: "test-definitions", labelKey: "nav.testDefinitions" },
  { key: "requests", labelKey: "nav.requests" },
  { key: "history", labelKey: "nav.runHistory" },
]

export function WorkspaceHeader({
  active,
  onSelect,
}: {
  active: string
  onSelect: (k: string) => void
}) {
  const { user } = useAuth()
  const { t } = useLang()
  const clientName = user?.clientName?.trim() || t("common.workspace")
  const initials =
    clientName
      .split(/\s+/)
      .map((w) => w[0])
      .filter(Boolean)
      .slice(0, 2)
      .join("")
      .toUpperCase() || "WS"

  return (
    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-start justify-between gap-4 px-5 py-4">
        <div className="flex items-center gap-3.5">
          <div className="flex size-11 items-center justify-center rounded-xl bg-brand-900 font-display text-sm font-bold text-white shadow-sm">
            {initials}
          </div>
          <div>
            <div className="flex items-center gap-2.5">
              <h2 className="font-display text-lg font-bold tracking-tight text-navy">{clientName}</h2>
            </div>
            <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[12px] text-slate-400">
              {user?.clientId != null && <span className="font-mono">#{user.clientId}</span>}
              {user?.email && (
                <>
                  {user.clientId != null && <span className="text-slate-300">·</span>}
                  <span>{user.email}</span>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
      <div className="flex items-center gap-1 overflow-x-auto border-t border-slate-100 px-3">
        {WORKSPACE_NAV.map((n) => {
          const isActive = active === n.key
          return (
            <button
              key={n.key}
              onClick={() => onSelect(n.key)}
              className={cx(
                "relative whitespace-nowrap px-3 py-3 text-[13px] font-medium transition-colors",
                isActive ? "text-brand-300" : "text-slate-500 hover:text-slate-700",
              )}
            >
              {t(n.labelKey)}
              {isActive && (
                <span className="absolute inset-x-3 bottom-0 h-0.5 rounded-full bg-brand-600" />
              )}
            </button>
          )
        })}
      </div>
    </Card>
  )
}

export default WorkspaceHeader
