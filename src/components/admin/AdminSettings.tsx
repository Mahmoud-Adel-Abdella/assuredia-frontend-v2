import React, { useCallback, useEffect, useState } from "react"
import { Button, Card, ErrorState, Spinner, cx, useToast } from "../primitives"
import { useLang } from "../../lib/i18n"
import {
  ApiError,
  apiGetAdminSettings,
  apiListAdminTeam,
  apiCreateAdminTeamMember,
  apiUpdateAdminUserRole,
  apiDeleteAdminTeamMember,
  apiListAdminAuditLogs,
  apiClientList,
  type AdminSettingsResponse,
  type AdminTeamMember,
  type AdminTeamStats,
  type AdminTeamMemberRole,
  type AdminAuditLogEntry,
  type BackendClientListRow,
} from "../../lib/api"

type Section = "general" | "team" | "security" | "api" | "notifications" | "monitoring" | "ai" | "audit"

const SECTIONS: { key: Section; label: string }[] = [
  { key: "general", label: "General" },
  { key: "team", label: "Team & Access" },
  { key: "security", label: "Security" },
  { key: "api", label: "API & Integrations" },
  { key: "notifications", label: "Notifications" },
  { key: "monitoring", label: "Monitoring" },
  { key: "ai", label: "AI & Intelligence" },
  { key: "audit", label: "Audit Log" },
]

function SettingRow({
  label,
  description,
  children,
}: {
  label: string
  description?: string
  children: React.ReactNode
}) {
  return (
    <div className="flex items-start justify-between gap-8 py-4">
      <div className="max-w-md">
        <p className="text-[13px] font-semibold text-slate-800">{label}</p>
        {description && <p className="mt-0.5 text-[12px] text-slate-500 leading-relaxed">{description}</p>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  )
}

function RoleBadge({ role }: { role: AdminTeamMemberRole }) {
  const map: Record<AdminTeamMemberRole, { bg: string; text: string; ring: string }> = {
    ADMIN: { bg: "bg-purple-50", text: "text-purple-700", ring: "ring-purple-600/20" },
    CLIENT: { bg: "bg-blue-50", text: "text-blue-700", ring: "ring-blue-600/20" },
    APPLICANT: { bg: "bg-amber-50", text: "text-amber-700", ring: "ring-amber-600/20" },
  }
  const conf = map[role] || { bg: "bg-slate-50", text: "text-slate-700", ring: "ring-slate-600/20" }
  return (
    <span className={cx("inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-semibold ring-1 ring-inset", conf.bg, conf.text, conf.ring)}>
      {role}
    </span>
  )
}

function ActionBadge({ action }: { action: string }) {
  const isApproved = action.includes("APPROVED") || action.includes("CREATED")
  const isRejected = action.includes("REJECTED") || action.includes("DELETED")
  const isUpdated = action.includes("UPDATED") || action.includes("RESOLVED")

  let color = "bg-slate-50 text-slate-700 ring-slate-600/20"
  if (isApproved) color = "bg-emerald-50 text-emerald-700 ring-emerald-600/20"
  else if (isRejected) color = "bg-rose-50 text-rose-700 ring-rose-600/20"
  else if (isUpdated) color = "bg-sky-50 text-sky-700 ring-sky-600/20"

  return (
    <span className={cx("inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-semibold ring-1 ring-inset", color)}>
      {action}
    </span>
  )
}

export function AdminSettings() {
  const { t } = useLang()
  const toast = useToast()
  const [section, setSection] = useState<Section>("general")

  // Settings State
  const [settings, setSettings] = useState<AdminSettingsResponse | null>(null)
  const [loadingSettings, setLoadingSettings] = useState(false)
  const [settingsError, setSettingsError] = useState<string | null>(null)

  // Team State
  const [members, setMembers] = useState<AdminTeamMember[]>([])
  const [teamStats, setTeamStats] = useState<AdminTeamStats | null>(null)
  const [loadingTeam, setLoadingTeam] = useState(false)
  const [teamError, setTeamError] = useState<string | null>(null)
  const [roleFilter, setRoleFilter] = useState<string>("")
  const [teamSearch, setTeamSearch] = useState<string>("")
  const [clients, setClients] = useState<BackendClientListRow[]>([])

  // Modals
  const [showAddModal, setShowAddModal] = useState(false)
  const [newEmail, setNewEmail] = useState("")
  const [newRole, setNewRole] = useState<"ADMIN" | "CLIENT">("ADMIN")
  const [newClientId, setNewClientId] = useState<number | undefined>(undefined)
  const [newPassword, setNewPassword] = useState("")
  const [creatingMember, setCreatingMember] = useState(false)
  const [createdCredentials, setCreatedCredentials] = useState<{ email: string; temporaryPassword?: string } | null>(null)

  // Role Edit Modal
  const [editingMember, setEditingMember] = useState<AdminTeamMember | null>(null)
  const [editRole, setEditRole] = useState<AdminTeamMemberRole>("CLIENT")
  const [editClientId, setEditClientId] = useState<number | undefined>(undefined)
  const [updatingRole, setUpdatingRole] = useState(false)

  // Audit Log State
  const [auditLogs, setAuditLogs] = useState<AdminAuditLogEntry[]>([])
  const [auditTotal, setAuditTotal] = useState(0)
  const [auditOffset, setAuditOffset] = useState(0)
  const [auditLimit] = useState(25)
  const [auditSearch, setAuditSearch] = useState("")
  const [auditActionFilter, setAuditActionFilter] = useState("")
  const [loadingAudit, setLoadingAudit] = useState(false)
  const [auditError, setAuditError] = useState<string | null>(null)

  // Load Platform Settings
  const loadSettings = useCallback(async () => {
    setLoadingSettings(true)
    setSettingsError(null)
    try {
      const data = await apiGetAdminSettings()
      setSettings(data)
    } catch (e) {
      setSettingsError(e instanceof ApiError ? e.message : "Failed to load platform settings")
    } finally {
      setLoadingSettings(false)
    }
  }, [])

  // Load Team
  const loadTeam = useCallback(async () => {
    setLoadingTeam(true)
    setTeamError(null)
    try {
      const resp = await apiListAdminTeam({
        role: roleFilter || undefined,
        search: teamSearch || undefined,
      })
      setMembers(resp.members)
      setTeamStats(resp.stats)
    } catch (e) {
      setTeamError(e instanceof ApiError ? e.message : "Failed to load team members")
    } finally {
      setLoadingTeam(false)
    }
  }, [roleFilter, teamSearch])

  // Load Clients for dropdowns
  const loadClients = useCallback(async () => {
    try {
      const data = await apiClientList()
      setClients(data)
      if (data.length > 0 && !newClientId) {
        setNewClientId(data[0].id)
      }
    } catch {
      // client list error ignored
    }
  }, [newClientId])

  // Load Audit Logs
  const loadAudit = useCallback(async () => {
    setLoadingAudit(true)
    setAuditError(null)
    try {
      const resp = await apiListAdminAuditLogs({
        action: auditActionFilter || undefined,
        search: auditSearch || undefined,
        limit: auditLimit,
        offset: auditOffset,
      })
      setAuditLogs(resp.logs)
      setAuditTotal(resp.totalCount)
    } catch (e) {
      setAuditError(e instanceof ApiError ? e.message : "Failed to load audit logs")
    } finally {
      setLoadingAudit(false)
    }
  }, [auditActionFilter, auditSearch, auditLimit, auditOffset])

  useEffect(() => {
    loadSettings()
    loadClients()
  }, [loadSettings, loadClients])

  useEffect(() => {
    if (section === "team") {
      loadTeam()
    } else if (section === "audit") {
      loadAudit()
    }
  }, [section, loadTeam, loadAudit])

  const handleCreateMember = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newEmail.trim()) return
    setCreatingMember(true)
    try {
      const res = await apiCreateAdminTeamMember({
        email: newEmail.trim(),
        role: newRole,
        clientId: newRole === "CLIENT" ? newClientId : undefined,
        password: newPassword.trim() || undefined,
      })
      toast({ title: "Member account created successfully", variant: "success" })
      if (res.temporaryPassword) {
        setCreatedCredentials({ email: res.email, temporaryPassword: res.temporaryPassword })
      } else {
        setShowAddModal(false)
        setNewEmail("")
        setNewPassword("")
      }
      loadTeam()
    } catch (err) {
      toast({ title: "Failed to create user", description: err instanceof ApiError ? err.message : undefined, variant: "error" })
    } finally {
      setCreatingMember(false)
    }
  }

  const handleUpdateRole = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!editingMember) return
    setUpdatingRole(true)
    try {
      await apiUpdateAdminUserRole(
        editingMember.id,
        editRole,
        editRole === "CLIENT" ? editClientId : undefined,
      )
      toast({ title: "User role updated successfully", variant: "success" })
      setEditingMember(null)
      loadTeam()
    } catch (err) {
      toast({ title: "Failed to update role", description: err instanceof ApiError ? err.message : undefined, variant: "error" })
    } finally {
      setUpdatingRole(false)
    }
  }

  const handleDeleteMember = async (member: AdminTeamMember) => {
    if (!window.confirm(`Are you sure you want to remove ${member.email}?`)) {
      return
    }
    try {
      await apiDeleteAdminTeamMember(member.id)
      toast({ title: "User removed successfully", variant: "success" })
      loadTeam()
    } catch (err) {
      toast({ title: "Failed to delete user", description: err instanceof ApiError ? err.message : undefined, variant: "error" })
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-warning">{t("nav.adminConsole")}</p>
        <h1 className="mt-1 font-display text-2xl font-bold tracking-tight text-navy">{t("admin.settings.title")}</h1>
        <p className="mt-1 text-[13px] text-slate-500">Platform configuration, team management, and immutable audit logs.</p>
      </div>

      <div className="flex flex-col md:flex-row gap-6">
        {/* Sidebar Nav */}
        <div className="w-full md:w-52 shrink-0">
          <nav className="space-y-1">
            {SECTIONS.map((s) => (
              <button
                key={s.key}
                onClick={() => setSection(s.key)}
                className={cx(
                  "w-full rounded-lg px-3 py-2.5 text-start text-[13px] font-medium transition-colors flex items-center justify-between",
                  section === s.key ? "bg-brand-50 text-brand-900 font-semibold shadow-xs" : "text-slate-600 hover:bg-slate-50",
                )}
              >
                <span>{s.label}</span>
                {s.key === "audit" && auditTotal > 0 && (
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] text-slate-600 font-mono">
                    {auditTotal}
                  </span>
                )}
              </button>
            ))}
          </nav>
        </div>

        {/* Content Panel */}
        <div className="min-w-0 flex-1">
          {/* SECTION 1: GENERAL */}
          {section === "general" && (
            <Card className="divide-y divide-slate-100 px-6">
              <div className="py-4">
                <h2 className="font-display text-base font-bold text-navy">General Settings</h2>
                <p className="text-[12px] text-slate-500 mt-0.5">Platform runtime defaults and identity parameters.</p>
              </div>
              {loadingSettings ? (
                <div className="py-8 flex justify-center"><Spinner /></div>
              ) : settingsError ? (
                <ErrorState description={settingsError} onRetry={loadSettings} />
              ) : (
                <>
                  <SettingRow label="Platform Name" description="The global instance branding name.">
                    <span className="text-[13px] font-semibold text-slate-700 bg-slate-50 px-3 py-1.5 rounded-lg border border-slate-200">
                      {settings?.general.platformName ?? "Assuredia"}
                    </span>
                  </SettingRow>
                  <SettingRow label="Default Timezone" description="Global default timezone for scheduled cron evaluations.">
                    <span className="text-[13px] font-mono text-slate-700 bg-slate-50 px-3 py-1.5 rounded-lg border border-slate-200">
                      {settings?.general.defaultTimezone ?? "UTC"}
                    </span>
                  </SettingRow>
                  <SettingRow label="Tenant Model" description="Multi-tenant client environments with isolated flows and credentials.">
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-700 ring-1 ring-inset ring-emerald-600/20">
                      <span className="size-1.5 rounded-full bg-emerald-500" />
                      Client-Centric Isolation
                    </span>
                  </SettingRow>
                </>
              )}
            </Card>
          )}

          {/* SECTION 2: TEAM & ACCESS */}
          {section === "team" && (
            <div className="space-y-4">
              {/* Stats Bar */}
              {teamStats && (
                <div className="grid grid-cols-3 gap-4">
                  <Card className="p-4">
                    <p className="text-[11px] font-medium uppercase text-slate-400">Total Users</p>
                    <p className="text-2xl font-bold text-navy mt-1">{teamStats.total}</p>
                  </Card>
                  <Card className="p-4">
                    <p className="text-[11px] font-medium uppercase text-slate-400">Active Accounts</p>
                    <p className="text-2xl font-bold text-emerald-600 mt-1">{teamStats.active}</p>
                  </Card>
                  <Card className="p-4">
                    <p className="text-[11px] font-medium uppercase text-slate-400">Pending Approval</p>
                    <p className="text-2xl font-bold text-amber-600 mt-1">{teamStats.pending}</p>
                  </Card>
                </div>
              )}

              <Card className="p-6">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-100">
                  <div>
                    <h2 className="font-display text-base font-bold text-navy">Team Members & Accounts</h2>
                    <p className="text-[12px] text-slate-500 mt-0.5">Manage administrative and client login identities.</p>
                  </div>
                  <Button variant="primary" size="sm" onClick={() => { setCreatedCredentials(null); setShowAddModal(true) }}>
                    + Add Member
                  </Button>
                </div>

                {/* Filters */}
                <div className="flex flex-wrap items-center gap-3 py-3">
                  <input
                    type="text"
                    placeholder="Search by email or client..."
                    value={teamSearch}
                    onChange={(e) => setTeamSearch(e.target.value)}
                    className="rounded-lg border border-slate-200 bg-surface px-3 py-1.5 text-[13px] text-slate-700 focus:outline-none focus:ring-2 focus:ring-brand-400 w-64"
                  />
                  <select
                    value={roleFilter}
                    onChange={(e) => setRoleFilter(e.target.value)}
                    className="rounded-lg border border-slate-200 bg-surface px-3 py-1.5 text-[13px] text-slate-700 focus:outline-none focus:ring-2 focus:ring-brand-400"
                  >
                    <option value="">All Roles</option>
                    <option value="ADMIN">ADMIN</option>
                    <option value="CLIENT">CLIENT</option>
                    <option value="APPLICANT">APPLICANT</option>
                  </select>
                </div>

                {/* Table */}
                {loadingTeam ? (
                  <div className="py-12 flex justify-center"><Spinner size="lg" /></div>
                ) : teamError ? (
                  <ErrorState description={teamError} onRetry={loadTeam} />
                ) : members.length === 0 ? (
                  <div className="text-center py-12 text-slate-400 text-sm">No team members found matching filter.</div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-[13px]">
                      <thead>
                        <tr className="border-b border-slate-100 text-slate-400 text-[11px] uppercase tracking-wider">
                          <th className="py-2.5 font-semibold">User / Email</th>
                          <th className="py-2.5 font-semibold">Role</th>
                          <th className="py-2.5 font-semibold">Client Environment</th>
                          <th className="py-2.5 font-semibold">Status</th>
                          <th className="py-2.5 font-semibold text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {members.map((m) => (
                          <tr key={m.id} className="hover:bg-slate-50/50">
                            <td className="py-3 font-medium text-slate-800">{m.email}</td>
                            <td className="py-3"><RoleBadge role={m.role} /></td>
                            <td className="py-3 text-slate-600">
                              {m.clientName ? (
                                <span className="font-mono text-[12px] bg-slate-50 px-2 py-0.5 rounded border border-slate-200">
                                  {m.clientName}
                                </span>
                              ) : (
                                <span className="text-slate-400">—</span>
                              )}
                            </td>
                            <td className="py-3">
                              <span className={cx("inline-flex items-center gap-1.5 text-[12px]", m.status === "active" ? "text-emerald-700 font-medium" : "text-amber-600 font-medium")}>
                                <span className={cx("size-1.5 rounded-full", m.status === "active" ? "bg-emerald-500" : "bg-amber-500")} />
                                {m.status === "active" ? "Active" : "Pending"}
                              </span>
                            </td>
                            <td className="py-3 text-right space-x-2">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => {
                                  setEditingMember(m)
                                  setEditRole(m.role)
                                  setEditClientId(m.clientId ?? undefined)
                                }}
                              >
                                Edit Role
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="text-rose-600 hover:text-rose-700 hover:bg-rose-50"
                                onClick={() => handleDeleteMember(m)}
                              >
                                Remove
                              </Button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </Card>
            </div>
          )}

          {/* SECTION 3: SECURITY */}
          {section === "security" && (
            <Card className="divide-y divide-slate-100 px-6">
              <div className="py-4">
                <h2 className="font-display text-base font-bold text-navy">Security & Authentication</h2>
                <p className="text-[12px] text-slate-500 mt-0.5">Identity verification and credential protection policies.</p>
              </div>
              <SettingRow label="Password Authentication" description="Bcrypt one-way password hashing (10 rounds).">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-700 ring-1 ring-inset ring-emerald-600/20">
                  <span className="size-1.5 rounded-full bg-emerald-500" />
                  Always Active
                </span>
              </SettingRow>
              <SettingRow label="Session Expiry (JWT)" description="Signed HMAC-SHA256 bearer token lifetime.">
                <span className="text-[13px] font-mono text-slate-700 bg-slate-50 px-3 py-1.5 rounded-lg border border-slate-200">
                  {settings?.security.sessionTimeout ?? "12 hours"}
                </span>
              </SettingRow>
              <SettingRow label="Google OAuth" description="Federated sign-in using Google identity provider.">
                {settings?.security.oauth.google.configured ? (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-700 ring-1 ring-inset ring-emerald-600/20">
                    <span className="size-1.5 rounded-full bg-emerald-500" />
                    Connected
                  </span>
                ) : (
                  <span className="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-500">
                    Not Configured
                  </span>
                )}
              </SettingRow>
              <SettingRow label="GitHub OAuth" description="Federated sign-in using GitHub identity provider.">
                {settings?.security.oauth.github.configured ? (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-700 ring-1 ring-inset ring-emerald-600/20">
                    <span className="size-1.5 rounded-full bg-emerald-500" />
                    Connected
                  </span>
                ) : (
                  <span className="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-500">
                    Not Configured
                  </span>
                )}
              </SettingRow>
              <SettingRow label="Multi-Factor Authentication (MFA)" description="Require a second factor for administrative accounts.">
                <span className="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-500">
                  Coming Soon (Phase 2)
                </span>
              </SettingRow>
            </Card>
          )}

          {/* SECTION 4: API & INTEGRATIONS */}
          {section === "api" && (
            <Card className="divide-y divide-slate-100 px-6">
              <div className="py-4">
                <h2 className="font-display text-base font-bold text-navy">API & Webhook Integrations</h2>
                <p className="text-[12px] text-slate-500 mt-0.5">External alerting workflows and webhook delivery.</p>
              </div>
              <SettingRow label="Outbound Webhooks (n8n)" description="Signed HMAC-SHA256 alert dispatches to workflow automation.">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-700 ring-1 ring-inset ring-emerald-600/20">
                  <span className="size-1.5 rounded-full bg-emerald-500" />
                  Active & Signed
                </span>
              </SettingRow>
              <SettingRow label="Telegram Bot Integration" description="Paired per-client via bot token and chat ID.">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-700 ring-1 ring-inset ring-emerald-600/20">
                  <span className="size-1.5 rounded-full bg-emerald-500" />
                  Per-Client Supported
                </span>
              </SettingRow>
              <SettingRow label="Slack / Microsoft Teams / Email" description="Direct connectors to third-party messaging platforms.">
                <span className="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-600">
                  Routed via n8n Webhook
                </span>
              </SettingRow>
              <SettingRow label="Dynamic API Key Rotation" description="Self-service creation of scoped developer API keys.">
                <span className="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-500">
                  Coming Soon (Phase 2)
                </span>
              </SettingRow>
            </Card>
          )}

          {/* SECTION 5: NOTIFICATIONS */}
          {section === "notifications" && (
            <Card className="divide-y divide-slate-100 px-6">
              <div className="py-4">
                <h2 className="font-display text-base font-bold text-navy">Notification Delivery Policy</h2>
                <p className="text-[12px] text-slate-500 mt-0.5">Platform alerting defaults and routing rules.</p>
              </div>
              <SettingRow label="Webhook Timeout" description="Maximum timeout waiting for n8n delivery endpoint acknowledgment.">
                <span className="text-[13px] font-mono text-slate-700 bg-slate-50 px-3 py-1.5 rounded-lg border border-slate-200">
                  {settings?.notifications.webhookTimeoutSeconds ?? 10} seconds
                </span>
              </SettingRow>
              <SettingRow label="Delivery Retries" description="Maximum attempts when dispatching outbound webhook notifications.">
                <span className="text-[13px] font-mono text-slate-700 bg-slate-50 px-3 py-1.5 rounded-lg border border-slate-200">
                  {settings?.notifications.webhookRetryMaxAttempts ?? 2} retries
                </span>
              </SettingRow>
              <SettingRow label="Client Notification Policy" description="Trigger conditions ('always', 'on_failure', 'never').">
                <span className="text-[12px] text-slate-600 bg-slate-50 px-3 py-1.5 rounded-lg border border-slate-200">
                  Managed per client environment
                </span>
              </SettingRow>
            </Card>
          )}

          {/* SECTION 6: MONITORING */}
          {section === "monitoring" && (
            <Card className="divide-y divide-slate-100 px-6">
              <div className="py-4">
                <h2 className="font-display text-base font-bold text-navy">Monitoring & Execution Defaults</h2>
                <p className="text-[12px] text-slate-500 mt-0.5">Global defaults for test execution pipelines.</p>
              </div>
              <SettingRow label="Execution Region" description="Test runner node execution region.">
                <span className="text-[13px] font-mono text-slate-700 bg-slate-50 px-3 py-1.5 rounded-lg border border-slate-200">
                  {settings?.monitoring.executionRegion ?? "Auto"}
                </span>
              </SettingRow>
              <SettingRow label="Client Execution Configuration" description="Retry count, explicit wait timeouts, and browser emulation.">
                <span className="text-[12px] text-slate-600 bg-slate-50 px-3 py-1.5 rounded-lg border border-slate-200">
                  Configured individually per client in Client settings
                </span>
              </SettingRow>
            </Card>
          )}

          {/* SECTION 7: AI */}
          {section === "ai" && (
            <Card className="divide-y divide-slate-100 px-6">
              <div className="py-4">
                <h2 className="font-display text-base font-bold text-navy">AI Reliability & Intelligence</h2>
                <p className="text-[12px] text-slate-500 mt-0.5">Automated root cause analysis and risk scoring configuration.</p>
              </div>
              <SettingRow label="AI Reliability Service" description="Post-execution automated analysis of test runs.">
                {settings?.ai.enabled ? (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-700 ring-1 ring-inset ring-emerald-600/20">
                    <span className="size-1.5 rounded-full bg-emerald-500" />
                    Active
                  </span>
                ) : (
                  <span className="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-500">
                    Disabled
                  </span>
                )}
              </SettingRow>
              <SettingRow label="Active Model" description="Large language model powering root cause analysis.">
                <span className="text-[13px] font-mono text-slate-700 bg-slate-50 px-3 py-1.5 rounded-lg border border-slate-200">
                  {settings?.ai.model ?? "openai/gpt-oss-120b"}
                </span>
              </SettingRow>
              <SettingRow label="PII & Secret Sanitization" description="Automatic redaction of tokens, passwords, and sessions prior to inference.">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-700 ring-1 ring-inset ring-emerald-600/20">
                  <span className="size-1.5 rounded-full bg-emerald-500" />
                  Enforced (ErrorSanitizer)
                </span>
              </SettingRow>
            </Card>
          )}

          {/* SECTION 8: AUDIT LOG */}
          {section === "audit" && (
            <Card className="p-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-100">
                <div>
                  <h2 className="font-display text-base font-bold text-navy">Admin Audit Log</h2>
                  <p className="text-[12px] text-slate-500 mt-0.5">Immutable audit trail of security-sensitive administrative actions.</p>
                </div>
                <Button variant="secondary" size="sm" onClick={loadAudit}>
                  Refresh
                </Button>
              </div>

              {/* Filters */}
              <div className="flex flex-wrap items-center gap-3 py-3">
                <input
                  type="text"
                  placeholder="Search action, actor, resource..."
                  value={auditSearch}
                  onChange={(e) => { setAuditSearch(e.target.value); setAuditOffset(0) }}
                  className="rounded-lg border border-slate-200 bg-surface px-3 py-1.5 text-[13px] text-slate-700 focus:outline-none focus:ring-2 focus:ring-brand-400 w-64"
                />
                <select
                  value={auditActionFilter}
                  onChange={(e) => { setAuditActionFilter(e.target.value); setAuditOffset(0) }}
                  className="rounded-lg border border-slate-200 bg-surface px-3 py-1.5 text-[13px] text-slate-700 focus:outline-none focus:ring-2 focus:ring-brand-400"
                >
                  <option value="">All Actions</option>
                  <option value="ONBOARDING_APPROVED">ONBOARDING_APPROVED</option>
                  <option value="ONBOARDING_REJECTED">ONBOARDING_REJECTED</option>
                  <option value="ASSET_REQUEST_APPROVED">ASSET_REQUEST_APPROVED</option>
                  <option value="ASSET_REQUEST_REJECTED">ASSET_REQUEST_REJECTED</option>
                  <option value="ASSET_REQUEST_IMPLEMENTED">ASSET_REQUEST_IMPLEMENTED</option>
                  <option value="MEMBER_CREATED">MEMBER_CREATED</option>
                  <option value="MEMBER_ROLE_UPDATED">MEMBER_ROLE_UPDATED</option>
                  <option value="MEMBER_DELETED">MEMBER_DELETED</option>
                  <option value="CLIENT_USER_PROVISIONED">CLIENT_USER_PROVISIONED</option>
                  <option value="CLIENT_USER_UPDATED">CLIENT_USER_UPDATED</option>
                  <option value="ALERT_RESOLVED">ALERT_RESOLVED</option>
                </select>
              </div>

              {/* Table */}
              {loadingAudit ? (
                <div className="py-12 flex justify-center"><Spinner size="lg" /></div>
              ) : auditError ? (
                <ErrorState description={auditError} onRetry={loadAudit} />
              ) : auditLogs.length === 0 ? (
                <div className="text-center py-12 text-slate-400 text-sm">No audit logs recorded yet.</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-[13px]">
                    <thead>
                      <tr className="border-b border-slate-100 text-slate-400 text-[11px] uppercase tracking-wider">
                        <th className="py-2.5 font-semibold">Timestamp</th>
                        <th className="py-2.5 font-semibold">Actor</th>
                        <th className="py-2.5 font-semibold">Action</th>
                        <th className="py-2.5 font-semibold">Resource</th>
                        <th className="py-2.5 font-semibold">Details</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {auditLogs.map((log) => (
                        <tr key={log.id} className="hover:bg-slate-50/50">
                          <td className="py-3 text-slate-500 font-mono text-[12px] whitespace-nowrap">
                            {new Date(log.createdAt).toLocaleString()}
                          </td>
                          <td className="py-3 font-medium text-slate-800">{log.actorEmail}</td>
                          <td className="py-3"><ActionBadge action={log.action} /></td>
                          <td className="py-3 text-slate-600 font-mono text-[12px]">
                            {log.resourceType}{log.resourceId ? ` #${log.resourceId}` : ""}
                          </td>
                          <td className="py-3 text-slate-500 text-[12px] max-w-xs truncate">
                            {log.details ? JSON.stringify(log.details) : "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>

                  {/* Pagination */}
                  <div className="flex items-center justify-between pt-4 border-t border-slate-100 mt-4 text-[13px] text-slate-500">
                    <span>
                      Showing {auditOffset + 1} to {Math.min(auditOffset + auditLimit, auditTotal)} of {auditTotal} events
                    </span>
                    <div className="space-x-2">
                      <Button
                        variant="secondary"
                        size="sm"
                        disabled={auditOffset === 0}
                        onClick={() => setAuditOffset((prev) => Math.max(0, prev - auditLimit))}
                      >
                        ← Prev
                      </Button>
                      <Button
                        variant="secondary"
                        size="sm"
                        disabled={auditOffset + auditLimit >= auditTotal}
                        onClick={() => setAuditOffset((prev) => prev + auditLimit)}
                      >
                        Next →
                      </Button>
                    </div>
                  </div>
                </div>
              )}
            </Card>
          )}
        </div>
      </div>

      {/* MODAL: ADD MEMBER */}
      {showAddModal && (
        <div className="fixed inset-0 bg-navy/40 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <Card className="w-full max-w-md p-6 bg-surface shadow-xl space-y-4">
            <h3 className="font-display text-base font-bold text-navy">Add Team Member</h3>
            {createdCredentials ? (
              <div className="space-y-4">
                <div className="rounded-lg bg-emerald-50 p-4 border border-emerald-200 space-y-2">
                  <p className="text-[13px] font-semibold text-emerald-800">Account Created Successfully</p>
                  <p className="text-[12px] text-emerald-700">Please share these initial credentials with the user:</p>
                  <div className="bg-white p-2.5 rounded border border-emerald-300 font-mono text-[12px] space-y-1">
                    <p><span className="text-slate-400">Email:</span> {createdCredentials.email}</p>
                    {createdCredentials.temporaryPassword && (
                      <p><span className="text-slate-400">Temporary Password:</span> <strong className="text-rose-600">{createdCredentials.temporaryPassword}</strong></p>
                    )}
                  </div>
                </div>
                <div className="flex justify-end">
                  <Button variant="primary" size="sm" onClick={() => { setShowAddModal(false); setCreatedCredentials(null); setNewEmail(""); setNewPassword("") }}>
                    Done
                  </Button>
                </div>
              </div>
            ) : (
              <form onSubmit={handleCreateMember} className="space-y-4">
                <div>
                  <label className="block text-[12px] font-semibold text-slate-700 mb-1">Email Address</label>
                  <input
                    type="email"
                    required
                    value={newEmail}
                    onChange={(e) => setNewEmail(e.target.value)}
                    placeholder="user@example.com"
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-[13px] text-slate-800 focus:ring-2 focus:ring-brand-400 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-[12px] font-semibold text-slate-700 mb-1">Role</label>
                  <select
                    value={newRole}
                    onChange={(e) => setNewRole(e.target.value as "ADMIN" | "CLIENT")}
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-[13px] text-slate-800 focus:ring-2 focus:ring-brand-400 outline-none"
                  >
                    <option value="ADMIN">ADMIN (Platform Administrator)</option>
                    <option value="CLIENT">CLIENT (Client Workspace User)</option>
                  </select>
                </div>
                {newRole === "CLIENT" && (
                  <div>
                    <label className="block text-[12px] font-semibold text-slate-700 mb-1">Assign to Client</label>
                    <select
                      required
                      value={newClientId ?? ""}
                      onChange={(e) => setNewClientId(Number(e.target.value))}
                      className="w-full rounded-lg border border-slate-200 px-3 py-2 text-[13px] text-slate-800 focus:ring-2 focus:ring-brand-400 outline-none"
                    >
                      {clients.map((c) => (
                        <option key={c.id} value={c.id}>{c.client_name} (id: {c.id})</option>
                      ))}
                    </select>
                  </div>
                )}
                <div>
                  <label className="block text-[12px] font-semibold text-slate-700 mb-1">Password (Optional)</label>
                  <input
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="Leave empty to auto-generate"
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-[13px] text-slate-800 focus:ring-2 focus:ring-brand-400 outline-none"
                  />
                  <p className="text-[11px] text-slate-400 mt-1">If left blank, a secure temporary password will be generated.</p>
                </div>
                <div className="flex justify-end gap-2 pt-2">
                  <Button variant="secondary" size="sm" type="button" onClick={() => setShowAddModal(false)}>
                    Cancel
                  </Button>
                  <Button variant="primary" size="sm" type="submit" loading={creatingMember}>
                    Create Account
                  </Button>
                </div>
              </form>
            )}
          </Card>
        </div>
      )}

      {/* MODAL: EDIT ROLE */}
      {editingMember && (
        <div className="fixed inset-0 bg-navy/40 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <Card className="w-full max-w-md p-6 bg-surface shadow-xl space-y-4">
            <h3 className="font-display text-base font-bold text-navy">Edit User Role</h3>
            <p className="text-[12px] text-slate-500">Updating role for <strong className="text-slate-700">{editingMember.email}</strong></p>
            <form onSubmit={handleUpdateRole} className="space-y-4">
              <div>
                <label className="block text-[12px] font-semibold text-slate-700 mb-1">Select Role</label>
                <select
                  value={editRole}
                  onChange={(e) => setEditRole(e.target.value as AdminTeamMemberRole)}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-[13px] text-slate-800 focus:ring-2 focus:ring-brand-400 outline-none"
                >
                  <option value="ADMIN">ADMIN</option>
                  <option value="CLIENT">CLIENT</option>
                  <option value="APPLICANT">APPLICANT</option>
                </select>
              </div>
              {editRole === "CLIENT" && (
                <div>
                  <label className="block text-[12px] font-semibold text-slate-700 mb-1">Assign to Client</label>
                  <select
                    required
                    value={editClientId ?? ""}
                    onChange={(e) => setEditClientId(Number(e.target.value))}
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-[13px] text-slate-800 focus:ring-2 focus:ring-brand-400 outline-none"
                  >
                    {clients.map((c) => (
                      <option key={c.id} value={c.id}>{c.client_name} (id: {c.id})</option>
                    ))}
                  </select>
                </div>
              )}
              <div className="flex justify-end gap-2 pt-2">
                <Button variant="secondary" size="sm" type="button" onClick={() => setEditingMember(null)}>
                  Cancel
                </Button>
                <Button variant="primary" size="sm" type="submit" loading={updatingRole}>
                  Save Role
                </Button>
              </div>
            </form>
          </Card>
        </div>
      )}
    </div>
  )
}

export default AdminSettings
