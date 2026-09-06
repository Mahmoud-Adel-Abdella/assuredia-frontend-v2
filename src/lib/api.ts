/**
 * Centralized API client for the Assuredia dashboard backend.
 *
 * Contract source (frozen backend, automation-engine):
 *   POST /dashboard-api/auth/login   { email, password }              → 200 identity + token | 400 | 401 | 403
 *   POST /dashboard-api/auth/signup  { email, password, companyName } → 201 { status, message } | 400 | 409 | 500
 *   GET  /dashboard-api/auth/me      Bearer token                     → 200 identity | 401
 *   GET  /dashboard-api/auth/verify  Bearer token                     → identical to /me (delegates to it)
 *   GET  /dashboard-api/clients/{id}/runs?limit=N  Bearer token       → 200 bare run array (tenant-scoped) | 401 | 404
 *   GET  /dashboard-api/alerts?limit=N             Bearer token       → 200 bare failure-alert array (tenant-scoped) | 401
 *   GET  /dashboard-api/alerts/unread-count        Bearer token       → 200 { count } (tenant-scoped) | 401
 *   POST /dashboard-api/alerts/{id}/read           Bearer token       → 204 (id = "run-{test_runs.id}"; 404 unknown/unowned)
 *   POST /dashboard-api/alerts/{id}/resolve        Bearer token       → 200 { id, runId, executionStatus, failed, originalFailure, resolutionState, resolvedBy, resolvedAt, isRead } (idempotent)
 *   POST /dashboard-api/alerts/mark-all-read       Bearer token       → 200 { updated } (tenant-scoped)
 *   GET  /dashboard-api/clients/{id}               Bearer token       → 200 { client, flows } (tenant-scoped) | 401 | 404
 *   POST /dashboard-api/clients/{id}/flows         { flowName, tests? } → 200 { status, flowId, flowName, testsCreated } | 400 | 401 | 404 | 409
 *   DELETE /dashboard-api/flows/{flowId}           Bearer token       → 200 { status } (soft delete) | 401 | 404
 *   GET  /dashboard-api/flows/{flowId}/tests       Bearer token       → 200 flow_tests array (ordered) | 401 | 404
 *   PUT  /dashboard-api/flows/{flowId}/tests       { tests: string[] } → 200 { status, testsCount } (replace-all) | 400 | 401 | 404
 *   POST /dashboard-api/clients/{id}/flows/{flowId}/run  RunOptions?  → 202 { runId, status:"QUEUED", client, flow, totalTests, message } | 400 | 401 | 404 | 409 BUSY
 *   GET  /dashboard-api/runs/{runId}/status        Bearer token       → 200 live run state (or historical fallback) | 401 | 404
 *   POST /dashboard-api/runs/{runId}/cancel        Bearer token       → 202 { runId, status:"CANCELLING", message } | 401 | 404 | 409 already completed
 *   GET  /dashboard-api/runs/{runId}/failures      Bearer token       → 200 [{ id, test_name, error_message }] (sanitized) | 401
 *   GET  /dashboard-api/runs/{runId}/analysis      Bearer token       → 200 { runId, analysisStatus, analysis } (test_runs scope; 404 for package execution ids) | 401 | 404
 *   POST /dashboard-api/runs/{runId}/analyze       Bearer token       → 202 { runId, analysisStatus:"ANALYZING", message } | 401 | 404 | 409 { error, analysisStatus:"DISABLED" }
 *
 * Errors are always JSON: { "error": "..." }.
 * Cross-tenant access answers 404 (ownership is resolved server-side; body/path ids are never trusted).
 */

import { translate } from "./i18n"

const TOKEN_KEY = "assuredia.token"

export function getToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY)
  } catch {
    return null
  }
}

export function setToken(token: string) {
  try {
    localStorage.setItem(TOKEN_KEY, token)
  } catch {
    /* storage unavailable — session lives only in memory */
  }
}

export function clearToken() {
  try {
    localStorage.removeItem(TOKEN_KEY)
  } catch {
    /* ignore */
  }
}

/** Error surfaced by the API layer. `status` 0 means network/unreachable. */
export class ApiError extends Error {
  status: number
  /** Parsed JSON error body from the backend, when one was returned. */
  body?: Record<string, unknown>
  constructor(status: number, message: string) {
    super(message)
    this.name = "ApiError"
    this.status = status
  }
}

const BASE_URL = (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_BASE_URL ? import.meta.env.VITE_API_BASE_URL : "").replace(/\/+$/, "")

type RequestOptions = {
  method?: string
  body?: unknown
  /** Send Authorization header even if a token is stored. Defaults to true. */
  auth?: boolean
  /**
   * Extra request headers. Used by endpoints whose contract carries one, e.g.
   * the Test Definition trial/proving `Idempotency-Key`. Values are sent
   * verbatim; nothing here is ever logged.
   */
  headers?: Record<string, string>
}

async function request<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = { Accept: "application/json" }
  if (opts.body !== undefined) headers["Content-Type"] = "application/json"

  const token = getToken()
  if (token && opts.auth !== false) headers["Authorization"] = `Bearer ${token}`

  if (opts.headers) {
    for (const [name, value] of Object.entries(opts.headers)) {
      if (value !== undefined && value !== null && value !== "") headers[name] = value
    }
  }

  let res: Response
  try {
    res = await fetch(`${BASE_URL}${path}`, {
      method: opts.method ?? "GET",
      headers,
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    })
  } catch {
    throw new ApiError(0, translate("errors.networkUnreachable"))
  }

  let payload: unknown = null
  try {
    payload = await res.json()
  } catch {
    /* empty or non-JSON body */
  }

  if (!res.ok) {
    const message =
      payload && typeof payload === "object" && typeof (payload as { error?: unknown }).error === "string"
        ? localizeBackendMessage((payload as { error: string }).error)
        : fallbackMessage(res.status)
    const err = new ApiError(res.status, message)
    if (payload && typeof payload === "object") err.body = payload as Record<string, unknown>
    throw err
  }

  return payload as T
}

/**
 * Fetches a non-JSON response body as a Blob, with the same Bearer auth and the
 * same error mapping as {@link request}. Used for the Test Definition artifact
 * endpoint, which answers `application/octet-stream` (or the artifact's own
 * content type) plus `Content-Disposition: attachment` rather than JSON.
 *
 * The engine's CORS layer does not expose `Content-Disposition` to scripts, so
 * the caller supplies its own download file name from artifact metadata instead
 * of parsing the header.
 */
export async function requestBinary(path: string): Promise<Blob> {
  const headers: Record<string, string> = { Accept: "*/*" }
  const token = getToken()
  if (token) headers["Authorization"] = `Bearer ${token}`

  let res: Response
  try {
    res = await fetch(`${BASE_URL}${path}`, { method: "GET", headers })
  } catch {
    throw new ApiError(0, translate("errors.networkUnreachable"))
  }

  if (!res.ok) {
    // Error bodies are still JSON ({ error }); a 404 from this endpoint may also
    // be empty (ResponseEntity.notFound().build()), which falls back by status.
    let payload: unknown = null
    try {
      payload = await res.json()
    } catch {
      /* empty or non-JSON error body */
    }
    const message =
      payload && typeof payload === "object" && typeof (payload as { error?: unknown }).error === "string"
        ? localizeBackendMessage((payload as { error: string }).error)
        : fallbackMessage(res.status)
    const err = new ApiError(res.status, message)
    if (payload && typeof payload === "object") err.body = payload as Record<string, unknown>
    throw err
  }

  return res.blob()
}

/**
 * Known frozen-backend error strings → localized frontend messages. The
 * backend itself is never modified; the raw value is only remapped for
 * display. Unrecognized messages pass through unchanged (they are technical
 * diagnostics the UI shows as detail text).
 */
const ERROR_MESSAGE_MAP: Record<string, string> = {
  "Invalid login credentials": "login.invalidCredentials",
  "You must provide an email and password": "errors.emailPasswordRequired",
  "Your account is pending approval.": "errors.pendingApproval",
  "Your application was not approved.": "errors.notApproved",
  "Email, password, and company name are required": "errors.signupRequired",
  "Enter a valid email address": "errors.validEmail",
  "An account with this email already exists": "errors.emailExists",
  "Your application is already pending": "errors.alreadyPending",
  "Could not complete signup. Please try again.": "errors.signupFailed",
  "Run has already completed.": "errors.runAlreadyCompleted",
  "Client or flow not found.": "errors.flowNotFound",
  "This client does not exist": "errors.clientNotExist",
  "The selected Flow does not belong to this Client.": "errors.flowNotOwned",
  "This request does not exist": "errors.requestNotExist",
  "Onboarding request not found": "errors.requestNotExist",
  "Request is not PENDING": "errors.requestStateChanged",
  "Request is not PENDING or already processed": "errors.requestStateChanged",
  "Request was already processed": "errors.requestStateChanged",
  "Request is not APPROVED or was updated concurrently": "errors.requestStateChanged",
  "adminNotes is required for rejection": "errors.adminNotesRequired",
  "baseUrl is required to provision the client": "errors.baseUrlRequired",
  "The company name contains an invalid path component": "errors.invalidCompanyName",
  "from must be before to.": "errors.fromBeforeTo",
  "Execution plan must contain at least one flow.": "errors.planEmpty",
  "A flow may appear only once in an execution plan.": "errors.planDuplicateFlow",
  "SELECTED_TESTS requires at least one test.": "errors.planNoTests",
  "Execution plan could not be started.": "errors.planNotStarted",
}

function localizeBackendMessage(raw: string): string {
  const key = ERROR_MESSAGE_MAP[raw]
  if (key) return translate(key)
  if (raw.startsWith("Client '") && raw.endsWith("' already exists")) {
    return translate("admin.create.duplicateName")
  }
  if (raw.startsWith("Password must be at least ")) {
    const count = parseInt(raw.slice("Password must be at least ".length), 10)
    if (Number.isFinite(count)) return translate("errors.passwordMinLength", { count })
  }
  if (raw.startsWith("Password must be at most ")) {
    const count = parseInt(raw.slice("Password must be at most ".length), 10)
    if (Number.isFinite(count)) return translate("errors.passwordMaxLength", { count })
  }
  if (raw.includes("already has a run in progress")) return translate("errors.runInProgress")
  if (raw.startsWith("Run not found")) return translate("errors.runNotFound")
  if (raw.startsWith("Flow not found")) return translate("errors.flowNotFound")
  if (raw.startsWith("Selected test(s) are no longer available in ")) {
    const flow = raw.slice("Selected test(s) are no longer available in ".length).split(":")[0].trim()
    return translate("errors.testsUnavailable", { flow })
  }
  if (raw.includes("migration-") || raw.includes("are unavailable.")) return translate("errors.featureUnavailable")
  return raw
}

function fallbackMessage(status: number): string {
  if (status === 400) return translate("errors.badRequest")
  if (status === 401) return translate("errors.unauthorized")
  if (status === 403) return translate("errors.forbidden")
  if (status === 409) return translate("errors.conflict")
  return translate("errors.serverError")
}

/* ------------------------------------------------------------------ */
/* Auth contract types (mirrors DashboardAuthController.identity)      */
/* ------------------------------------------------------------------ */
export type UserRole = "ADMIN" | "CLIENT"

export type AuthUser = {
  id: number
  userId: number
  email: string
  role: UserRole
  clientId: number | null
  clientName: string | null
  name: string
}

type LoginResponse = AuthUser & { token: string; accessToken: string; user: AuthUser }

function toUser(payload: LoginResponse): AuthUser {
  return {
    id: payload.id,
    userId: payload.userId,
    email: payload.email,
    role: payload.role,
    clientId: payload.clientId ?? null,
    clientName: payload.clientName ?? null,
    name: payload.name ?? payload.email,
  }
}

/** POST /dashboard-api/auth/login — 200 { identity..., token, accessToken } */
export async function apiLogin(email: string, password: string): Promise<{ user: AuthUser; token: string }> {
  const payload = await request<LoginResponse>("/dashboard-api/auth/login", {
    method: "POST",
    auth: false,
    body: { email, password },
  })
  return { user: toUser(payload), token: payload.token }
}

/** POST /dashboard-api/auth/signup — 201 { status: "pending", message } */
export async function apiSignup(email: string, password: string, companyName: string): Promise<string> {
  const payload = await request<{ status: string; message: string }>("/dashboard-api/auth/signup", {
    method: "POST",
    auth: false,
    body: { email, password, companyName },
  })
  return payload.message
}

/** GET /dashboard-api/auth/me — 200 identity (no token). */
export async function apiMe(): Promise<AuthUser> {
  const payload = await request<LoginResponse>("/dashboard-api/auth/me")
  return toUser(payload)
}

/* ------------------------------------------------------------------ */
/* OAuth (Google + GitHub) — frozen backend contract                    */
/*   GET  {API}/dashboard-api/auth/oauth/{provider}/start              */
/*        → 302 browser redirect (NEVER fetched — navigate to it)      */
/*   POST /dashboard-api/auth/oauth/exchange      { code }             */
/*        → 200 login shape | 403 pending/not-approved                 */
/*        | 200 { status:"onboarding_incomplete", email, provider,     */
/*                ticket, message }                                     */
/*   POST /dashboard-api/auth/oauth/onboarding    { ticket, company }  */
/*        → 201 { status:"pending", message }                          */
/*   GET  /dashboard-api/auth/oauth/{provider}/link/start  Bearer      */
/*        → 200 { url }                                                */
/* Failure redirects carry ?oauth_error=<wire code>; error bodies are  */
/* { error, oauthError }. Codes are single-use.                        */
/* ------------------------------------------------------------------ */
export type OAuthProvider = "google" | "github"

/** Browser-redirect URL that starts an OAuth sign-in. Navigate to it — never fetch. */
export function oauthStartUrl(provider: OAuthProvider): string {
  return `${BASE_URL}/dashboard-api/auth/oauth/${provider}/start`
}

/** ApiError that also carries the backend OAuth wire code (`oauthError` body field). */
export class OAuthApiError extends ApiError {
  oauthError: string | null
  constructor(status: number, message: string, oauthError: string | null) {
    super(status, message)
    this.name = "OAuthApiError"
    this.oauthError = oauthError
  }
}

function toOAuthError(err: unknown): never {
  if (err instanceof ApiError) {
    const wire = err.body && typeof err.body.oauthError === "string" ? err.body.oauthError : null
    throw new OAuthApiError(err.status, err.message, wire)
  }
  throw err
}

type OauthOnboardingResponse = {
  status: "onboarding_incomplete"
  email: string
  provider: string
  ticket: string
  message: string
}

export type OauthExchangeResult =
  /** Approved account: exact same shape as a normal login response. */
  | { kind: "approved"; user: AuthUser; token: string }
  /** New OAuth-only applicant: company name still required via the one-time ticket. */
  | { kind: "onboarding"; email: string; provider: string; ticket: string }

/** POST /dashboard-api/auth/oauth/exchange — consumes the one-time `oauth_code` exactly once. */
export async function apiOauthExchange(code: string): Promise<OauthExchangeResult> {
  try {
    const payload = await request<Partial<OauthOnboardingResponse> & Partial<LoginResponse>>(
      "/dashboard-api/auth/oauth/exchange",
      { method: "POST", auth: false, body: { code } },
    )
    if (payload.status === "onboarding_incomplete" && typeof payload.ticket === "string") {
      return {
        kind: "onboarding",
        email: typeof payload.email === "string" ? payload.email : "",
        provider: typeof payload.provider === "string" ? payload.provider : "",
        ticket: payload.ticket,
      }
    }
    const login = payload as LoginResponse
    return { kind: "approved", user: toUser(login), token: login.token }
  } catch (err) {
    toOAuthError(err)
  }
}

/** POST /dashboard-api/auth/oauth/onboarding — ticket-gated company-name submission → 201 pending. */
export async function apiOauthOnboarding(ticket: string, companyName: string): Promise<string> {
  try {
    const payload = await request<{ status: string; message: string }>("/dashboard-api/auth/oauth/onboarding", {
      method: "POST",
      auth: false,
      body: { ticket, companyName },
    })
    return payload.message
  } catch (err) {
    toOAuthError(err)
  }
}

/**
 * GET /dashboard-api/auth/oauth/{provider}/link/start — authenticated with the
 * existing Bearer token; returns the provider URL the browser must navigate to.
 */
export async function apiOauthLinkStart(provider: OAuthProvider): Promise<string> {
  try {
    const payload = await request<{ url: string }>(`/dashboard-api/auth/oauth/${provider}/link/start`)
    return payload.url
  } catch (err) {
    toOAuthError(err)
  }
}

/* ------------------------------------------------------------------ */
/* Client dashboard data contract (DashboardController)                */
/* ------------------------------------------------------------------ */

/**
 * One row of GET /dashboard-api/clients/{id}/runs. The backend merges two
 * shapes into a single array: SINGLE test-run rows (snake_case, numeric id)
 * and PACKAGE live-run rows (mixed case, string execution id). Fields that
 * only exist on one shape are optional here.
 */
/**
 * One child item of a PACKAGE row (attached by the backend's
 * attachPackageItems). `selected_tests` is a parsed array for FULL_FLOW
 * items (resolved to the flow's current tests) and the raw stored value
 * otherwise. `run_id` is null until the child flow run has started.
 */
export type DashboardPackageItem = {
  execution_id: string
  flow_id: number | null
  flow: string | null
  run_id: string | null
  scope: string | null
  selected_tests: unknown
  status: string | null
  total: number | null
  passed: number | null
  failed: number | null
  skipped: number | null
  message: string | null
}

export type DashboardRun = {
  id: number | string
  type?: "SINGLE" | "PACKAGE"
  run_id: string | null
  executionId?: string | null
  name?: string | null
  client_id?: number | null
  clientId?: number | null
  client_name?: string | null
  clientName?: string | null
  flow_id?: number | null
  flow_name: string | null
  status: string
  browser?: string | null
  env?: string | null
  total?: number | null
  passed?: number | null
  failed?: number | null
  skipped?: number | null
  duration_seconds?: number | null
  timestamp: string
  /** SINGLE rows only: sanitized top-level run error message, when failed. */
  error_message?: string | null
  /** PACKAGE rows only: start time (timestamp is COALESCE(finished, started)). */
  started_at?: string | null
  /** PACKAGE rows only: number of flows in the executed package. */
  flow_count?: number | null
  client_timezone?: string | null
  trigger_source?: string | null
  source?: string | null
  package_id?: string | null
  package_name?: string | null
  packageId?: string | null
  packageName?: string | null
  /** PACKAGE rows only: per-flow child items in execution order. */
  packageItems?: DashboardPackageItem[]
  /**
   * AI reliability report, raw JSON string. Present on SINGLE rows when an
   * analysis finished and on PACKAGE rows alongside analysis_status. null
   * means no report is stored — never a failed or pending analysis.
   */
  ai_report?: string | null
  /**
   * PACKAGE rows only: analysis lifecycle state
   * (NOT_STARTED | ANALYZING | COMPLETED | FAILED | DISABLED | RATE_LIMITED).
   * SINGLE rows do not expose this field — presence is inferred from
   * ai_report, or resolved via GET /runs/{runId}/analysis.
   */
  analysis_status?: string | null
}

/**
 * One row of GET /dashboard-api/alerts — a failed, non-cancelled run.
 * There is no alerts table: each row is derived from a persisted test_runs
 * row (id = "run-{test_runs.id}"). `isRead` / `resolutionState` live on the
 * run row itself; resolving an alert never changes the run's FAILED status.
 */
export type DashboardAlert = {
  id: string
  type?: string
  severity?: string
  status?: string
  /** "OPEN" | "RESOLVED" (backend defaults to OPEN). */
  resolutionState?: string
  /** users.id of the resolver; present only once resolved. */
  resolvedBy?: string | number | null
  /** Present only once resolved. */
  resolvedAt?: string | null
  isRead?: boolean
  clientId?: number
  client?: string | null
  flowId?: number | null
  flow?: string | null
  runId?: string | null
  failedCount?: number
  testName?: string | null
  tests?: string | null
  summary?: string | null
  timestamp: string
}

/** 200 body of POST /dashboard-api/alerts/{id}/resolve (authoritative row state). */
export type AlertResolveResponse = {
  id: string
  runId: string | null
  executionStatus: string | null
  failed: number | null
  originalFailure: string | null
  resolutionState: string
  resolvedBy: string | number | null
  resolvedAt: string | null
  isRead: boolean | null
}

/**
 * Verified server-side Run History filters (DashboardController#getClientRuns).
 * Every field mirrors a real @RequestParam — nothing here is invented.
 */
export type ClientRunsQuery = {
  /** PASSED | FAILED | RUNNING | CANCELLED | SKIPPED (backend normalizes aliases). */
  status?: string
  /** DIRECT | SCHEDULED | UNKNOWN. */
  source?: string
  /** SINGLE | PACKAGE. */
  type?: string
  /** Automation/package name; the backend matches with ILIKE %name%. */
  packageName?: string
  /** Flow id; must belong to the client (backend validates). */
  flowId?: number
  /** Test method name; the backend matches with ILIKE. */
  test?: string
  /** Inclusive lower bound, ISO-8601 date/time. */
  from?: string
  /** Inclusive upper bound, ISO-8601 date/time. */
  to?: string
}

/**
 * GET /dashboard-api/clients/{id}/runs — newest first, capped at limit
 * (backend max 200). Verified contract: there is no offset/page/cursor
 * parameter — only limit, filters, and inclusive from/to bounds — so older
 * runs are reachable by narrowing the time range, not by paging.
 */
export async function apiClientRuns(
  clientId: number,
  limit = 200,
  query?: ClientRunsQuery,
): Promise<DashboardRun[]> {
  const clamped = Math.max(1, Math.min(200, Math.floor(limit)))
  const params = new URLSearchParams()
  params.set("limit", String(clamped))
  if (query?.status) params.set("status", query.status)
  if (query?.source) params.set("source", query.source)
  if (query?.type) params.set("type", query.type)
  if (query?.packageName) params.set("package", query.packageName)
  if (query?.flowId != null) params.set("flowId", String(query.flowId))
  if (query?.test) params.set("test", query.test)
  if (query?.from) params.set("from", query.from)
  if (query?.to) params.set("to", query.to)
  return request<DashboardRun[]>(`/dashboard-api/clients/${clientId}/runs?${params.toString()}`)
}

/**
 * GET /dashboard-api/admin/runs — single bounded aggregate cross-client run history.
 * Solves N+1 query/request explosion by fetching cross-client runs in 1 HTTP call.
 */
export async function apiAdminRuns(
  limit = 200,
  query?: ClientRunsQuery & { clientId?: number },
): Promise<DashboardRun[]> {
  const clamped = Math.max(1, Math.min(200, Math.floor(limit)))
  const params = new URLSearchParams()
  params.set("limit", String(clamped))
  if (query?.status) params.set("status", query.status)
  if (query?.source) params.set("source", query.source)
  if (query?.type) params.set("type", query.type)
  if (query?.clientId != null) params.set("clientId", String(query.clientId))
  if (query?.packageName) params.set("package", query.packageName)
  if (query?.flowId != null) params.set("flowId", String(query.flowId))
  if (query?.test) params.set("test", query.test)
  if (query?.from) params.set("from", query.from)
  if (query?.to) params.set("to", query.to)
  return request<DashboardRun[]>(`/dashboard-api/admin/runs?${params.toString()}`)
}

/** GET /dashboard-api/alerts — failure alerts for the caller's tenant, newest first. */
export async function apiAlerts(limit = 5): Promise<DashboardAlert[]> {
  return request<DashboardAlert[]>(`/dashboard-api/alerts?limit=${Math.max(1, Math.floor(limit))}`)
}

/** GET /dashboard-api/alerts/unread-count — unread failure alerts for the caller's tenant. */
export async function apiAlertsUnreadCount(): Promise<{ count: number }> {
  return request<{ count: number }>("/dashboard-api/alerts/unread-count")
}

/** POST /dashboard-api/alerts/{id}/read — 204; marks the underlying run row read. */
export async function apiAlertRead(id: string): Promise<void> {
  await request<unknown>(`/dashboard-api/alerts/${encodeURIComponent(id)}/read`, { method: "POST" })
}

/**
 * POST /dashboard-api/alerts/{id}/resolve — idempotent: repeating the request
 * returns the original resolution metadata. The run's execution status stays
 * FAILED; only resolution_state/resolved_by/resolved_at are written.
 */
export async function apiAlertResolve(id: string): Promise<AlertResolveResponse> {
  return request<AlertResolveResponse>(`/dashboard-api/alerts/${encodeURIComponent(id)}/resolve`, {
    method: "POST",
  })
}

/** POST /dashboard-api/alerts/mark-all-read — 200 { updated } for the caller's tenant. */
export async function apiAlertsMarkAllRead(): Promise<{ updated: number }> {
  return request<{ updated: number }>("/dashboard-api/alerts/mark-all-read", { method: "POST" })
}

/* ------------------------------------------------------------------ */
/* Flows + Tests contract (DashboardController)                        */
/* ------------------------------------------------------------------ */

/**
 * One row of the `flows` array inside GET /dashboard-api/clients/{id}.
 * Each flow is LEFT JOINed with its scheduler row, so every scheduler
 * field is null when the flow has no schedule.
 */
export type BackendFlowRow = {
  id: number
  flow_name: string
  is_active: boolean
  scheduler_id: number | null
  cron_expression: string | null
  scheduler_active: boolean | null
  webhook_url: string | null
  only_tests: string[] | null
  next_run_at: string | null
  last_run_at: string | null
  is_running: boolean | null
}

/** The `client` object inside GET /dashboard-api/clients/{id}. */
export type BackendClientInfo = {
  id: number
  client_name: string
  browser: string | null
  device_type: string | null
  timezone: string | null
  /* Settings-facing fields returned by the frozen backend (secrets stripped server-side) */
  base_url?: string | null
  headless?: boolean | null
  is_active?: boolean | null
  ai_active?: boolean | null
  chat_id?: string | null
  telegram_username?: string | null
  notify_policy?: "always" | "on_failure" | "never" | null
  timeout_seconds?: number | null
  retry_count?: number | null
  run_timeout_minutes?: number | null
  device_emulation?: string | null
  viewport_width?: number | null
  viewport_height?: number | null
  site_username?: string | null
  /** Leak-free boolean: a site password exists. The encrypted value itself is never returned. */
  site_password_set?: boolean
  dashboard_user_count?: number
  dashboard_user_email?: string | null
  created_at?: string | null
  [key: string]: unknown
}

export type BackendClientDetails = {
  client: BackendClientInfo
  flows: BackendFlowRow[]
}

/**
 * Body accepted by PUT /dashboard-api/clients/{id} (partial update — any
 * omitted/null field keeps its current DB value via COALESCE). client_name
 * is intentionally NOT editable server-side. A blank sitePassword keeps the
 * stored encrypted value; a present one is encrypted server-side.
 */
export type ClientUpdateBody = {
  baseUrl?: string
  browser?: string
  headless?: boolean
  isActive?: boolean
  aiActive?: boolean
  chatId?: string
  telegramUsername?: string
  notifyPolicy?: "always" | "on_failure" | "never"
  siteUsername?: string
  sitePassword?: string
  timeoutSeconds?: number
  retryCount?: number
  runTimeoutMinutes?: number
  deviceType?: string
  viewportWidth?: number
  viewportHeight?: number
  deviceEmulation?: string
  timezone?: string
}

/** PUT /dashboard-api/clients/{id} — 200 { status: "updated" } | 401 | 404. */
export async function apiUpdateClient(clientId: number, body: ClientUpdateBody): Promise<{ status: string }> {
  return request<{ status: string }>(`/dashboard-api/clients/${clientId}`, {
    method: "PUT",
    body,
  })
}

/** Response of POST /dashboard-api/clients/{id}/telegram/link. */
export type TelegramLinkResponse = {
  token: string
  link: string
  botUsername: string
  clientName: string
}

/** POST /dashboard-api/clients/{id}/telegram/link — mints a one-time bot link. */
export async function apiTelegramLink(clientId: number): Promise<TelegramLinkResponse> {
  return request<TelegramLinkResponse>(`/dashboard-api/clients/${clientId}/telegram/link`, {
    method: "POST",
  })
}

/** POST /dashboard-api/clients/{id}/telegram/test — dispatches a test alert via the notification workflow. */
export async function apiTelegramTest(clientId: number): Promise<{ status: string; message: string }> {
  return request<{ status: string; message: string }>(`/dashboard-api/clients/${clientId}/telegram/test`, {
    method: "POST",
  })
}

/** One row of GET /dashboard-api/flows/{flowId}/tests. */
export type BackendFlowTestRow = {
  id: number
  flow_id: number
  test_class: string
  test_method: string
  order: number
}

/** POST /dashboard-api/clients/{id}/flows response. */
export type BackendCreateFlowResponse = {
  status: string
  flowId: number
  flowName: string
  testsCreated: number
}

/** PUT /dashboard-api/flows/{flowId}/tests response. */
export type BackendUpdateTestsResponse = {
  status: string
  testsCount: number
}

/** GET /dashboard-api/clients/{id} — client settings + its flows (+ scheduler per flow). */
export async function apiClientDetails(clientId: number): Promise<BackendClientDetails> {
  return request<BackendClientDetails>(`/dashboard-api/clients/${clientId}`)
}

/* ------------------------------------------------------------------ */
/* Client list + create (admin surface of the same controller)         */
/* ------------------------------------------------------------------ */
/*
 * GET  /dashboard-api/clients          → 200 rows (ADMIN: every client; CLIENT: its own) | 401
 * POST /dashboard-api/clients          → 200 { status:"created", clientId, ... } | 400 | 401 | 403 non-admin | 409 duplicate name
 *
 * The list row is the clients table plus the latest run per client via
 * LEFT JOIN LATERAL — last_run_status/last_run_timestamp are null when the
 * client has never run. No plan/region/success-rate fields exist in this
 * contract; the backend does not aggregate them.
 */

/** One row of GET /dashboard-api/clients. */
export type BackendClientListRow = {
  id: number
  client_name: string
  base_url: string | null
  browser: string | null
  headless: boolean | null
  is_active: boolean | null
  ai_active: boolean | null
  chat_id: string | null
  notify_policy: string | null
  timeout_seconds: number | null
  retry_count: number | null
  run_timeout_minutes: number | null
  device_type: string | null
  viewport_width: number | null
  viewport_height: number | null
  device_emulation: string | null
  timezone: string | null
  created_at: string | null
  /** Latest run status across all flows — null when the client never ran. */
  last_run_status: string | null
  /** Timestamp (text) of the latest run — null when the client never ran. */
  last_run_timestamp: string | null
}

/** GET /dashboard-api/clients — all clients (admin) with latest-run info, name-ordered. */
export async function apiClientList(): Promise<BackendClientListRow[]> {
  return request<BackendClientListRow[]>("/dashboard-api/clients")
}

/** Body accepted by POST /dashboard-api/clients (clientName is lowercased server-side). */
export type NewClientPayload = {
  clientName: string
  baseUrl: string
  browser?: string
  headless?: boolean
  timeoutSeconds?: number
  retryCount?: number
  notifyPolicy?: string
  siteUsername?: string
  sitePassword?: string
  chatId?: string
  timezone?: string
}

/** POST /dashboard-api/clients — create a client environment (admin only). */
export async function apiCreateClient(
  payload: NewClientPayload,
): Promise<{ status: string; clientId: number; clientName: string; flowsCreated: number; message: string }> {
  return request("/dashboard-api/clients", { method: "POST", body: payload })
}


/** GET /dashboard-api/flows/{flowId}/tests — the flow's tests, ordered by "order" then id. */
export async function apiFlowTests(flowId: number): Promise<BackendFlowTestRow[]> {
  return request<BackendFlowTestRow[]>(`/dashboard-api/flows/${flowId}/tests`)
}

/**
 * POST /dashboard-api/clients/{id}/flows — create a flow (optionally with its tests).
 * Each test ref is "TestClass.testMethod" (or fully qualified); the backend
 * qualifies and splits it. 400 blank name, 409 duplicate name, 404 unknown client.
 */
export async function apiCreateFlow(
  clientId: number,
  body: { flowName: string; tests?: string[] },
): Promise<BackendCreateFlowResponse> {
  return request<BackendCreateFlowResponse>(`/dashboard-api/clients/${clientId}/flows`, {
    method: "POST",
    body,
  })
}

/**
 * PUT /dashboard-api/flows/{flowId}/tests — replace the entire test list of a
 * flow (delete + reinsert). 400 when the tests array is missing/empty,
 * 404 unknown/unowned flow. There is no per-test create/update/delete endpoint.
 */
export async function apiReplaceFlowTests(flowId: number, tests: string[]): Promise<BackendUpdateTestsResponse> {
  return request<BackendUpdateTestsResponse>(`/dashboard-api/flows/${flowId}/tests`, {
    method: "PUT",
    body: { tests },
  })
}

/** DELETE /dashboard-api/flows/{flowId} — soft-deletes the flow (is_active=false). */
export async function apiDeleteFlow(flowId: number): Promise<{ status: string }> {
  return request<{ status: string }>(`/dashboard-api/flows/${flowId}`, { method: "DELETE" })
}

/* ------------------------------------------------------------------ */
/* Execution contract (DashboardController — frozen backend)           */
/* ------------------------------------------------------------------ */

/**
 * Request body for POST /dashboard-api/clients/{id}/flows/{flowId}/run.
 * Every field is optional; anything omitted falls back to the client's
 * stored defaults server-side. Only fields the frozen backend consumes
 * are exposed here — `skipAiAnalysis` is an internal package flag and
 * is never sent from the dashboard.
 */
export type RunFlowOptions = {
  browser?: string
  deviceType?: string
  onlyTests?: string[]
}

/** 202 response of POST /dashboard-api/clients/{id}/flows/{flowId}/run. */
export type RunFlowResponse = {
  runId: string
  status: string
  client: string
  flow: string
  totalTests: number
  message: string
}

/**
 * One step of the live run state. Statuses come from the engine's
 * LiveExecutionTracker: PENDING | RUNNING | PASSED | FAILED | SKIPPED.
 * errorMessage is sanitized server-side before it reaches the dashboard.
 */
export type BackendStepState = {
  testMethod: string
  stepName: string
  status: string
  durationMs?: number | null
  errorMessage?: string | null
}

/**
 * GET /dashboard-api/runs/{runId}/status — live shape (in-memory tracker).
 * The historical DB fallback returns a subset of these fields, so most are
 * optional; `status` is always present:
 * QUEUED | RUNNING | COMPLETED | FAILED | CANCELLED.
 */
export type BackendRunStatus = {
  runId: string
  client?: string | null
  clientId?: number | null
  flow?: string | null
  status: string
  progress?: number | null
  currentTest?: string | null
  currentStep?: string | null
  totalTests?: number | null
  completedTests?: number | null
  passedTests?: number | null
  failedTests?: number | null
  skippedTests?: number | null
  startedAt?: string | null
  completedAt?: string | null
  durationSeconds?: number | null
  analysisStatus?: string | null
  aiReport?: unknown
  steps?: BackendStepState[] | null
  cancelRequested?: boolean | null
}

/** One row of GET /dashboard-api/runs/{runId}/failures. */
export type BackendRunFailure = {
  id: number
  test_name: string
  error_message: string
}

/**
 * POST /dashboard-api/clients/{id}/flows/{flowId}/run — start a single-flow
 * execution. 202 { runId, status: "QUEUED", ... }. 409 means the client
 * already has a run in progress (one run lock per client, all triggers).
 */
export async function apiRunFlow(
  clientId: number,
  flowId: number,
  options?: RunFlowOptions,
): Promise<RunFlowResponse> {
  return request<RunFlowResponse>(`/dashboard-api/clients/${clientId}/flows/${flowId}/run`, {
    method: "POST",
    body: options ?? {},
  })
}

/** GET /dashboard-api/runs/{runId}/status — live state, or historical fallback. */
export async function apiRunStatus(runId: string): Promise<BackendRunStatus> {
  return request<BackendRunStatus>(`/dashboard-api/runs/${encodeURIComponent(runId)}/status`)
}

/** POST /dashboard-api/runs/{runId}/cancel — 202 CANCELLING; 409 when the run already finished. */
export async function apiCancelRun(runId: string): Promise<{ runId: string; status: string; message: string }> {
  return request<{ runId: string; status: string; message: string }>(
    `/dashboard-api/runs/${encodeURIComponent(runId)}/cancel`,
    { method: "POST" },
  )
}

/** GET /dashboard-api/runs/{runId}/failures — sanitized failure rows (empty until the run is persisted). */
export async function apiRunFailures(runId: string): Promise<BackendRunFailure[]> {
  return request<BackendRunFailure[]>(`/dashboard-api/runs/${encodeURIComponent(runId)}/failures`)
}

/* ------------------------------------------------------------------ */
/* AI analysis contract (DashboardController — frozen backend)         */
/* ------------------------------------------------------------------ */
/*
 * Analysis lifecycle states (same vocabulary for test_runs and
 * live_run_executions): NOT_STARTED | ANALYZING | COMPLETED | FAILED |
 * DISABLED | RATE_LIMITED. Analysis never changes the execution status —
 * it is informational augmentation of a run/package, not a source of truth.
 *
 *   GET  /dashboard-api/runs/{runId}/analysis
 *     test_runs-scoped. Returns { runId, analysisStatus, analysis } where
 *     `analysis` is the parsed stored report or {} when absent/malformed.
 *     404 for package execution ids (live_/plan_) and unknown/unowned runs.
 *
 *   POST /dashboard-api/runs/{runId}/analyze
 *     test_runs-scoped retry/trigger. 202 { runId, analysisStatus:
 *     "ANALYZING", message } when accepted; 409 { error, analysisStatus:
 *     "DISABLED" } when the client's AI flag is off; 404 for package
 *     execution ids (the frozen backend has no package retry).
 */

/** 200 body of GET /dashboard-api/runs/{runId}/analysis. */
export type BackendRunAnalysis = {
  runId: string
  analysisStatus: string
  /** Parsed report object, or {} when no report is stored. */
  analysis: unknown
}

/** 202 body of POST /dashboard-api/runs/{runId}/analyze. */
export type BackendAnalyzeAccepted = {
  runId: string
  analysisStatus: string
  message: string | null
}

/** GET /dashboard-api/runs/{runId}/analysis — analysis state of a single run. 404 for package ids. */
export async function apiRunAnalysis(runId: string): Promise<BackendRunAnalysis> {
  return request<BackendRunAnalysis>(`/dashboard-api/runs/${encodeURIComponent(runId)}/analysis`)
}

/**
 * POST /dashboard-api/runs/{runId}/analyze — trigger/re-run the analysis of
 * a single run (test_runs scope only). 202 when accepted, 409 when the
 * client has AI disabled ({ error, analysisStatus: "DISABLED" }), 404 for
 * unknown or package ids.
 */
export async function apiTriggerAnalysis(runId: string): Promise<BackendAnalyzeAccepted> {
  return request<BackendAnalyzeAccepted>(`/dashboard-api/runs/${encodeURIComponent(runId)}/analyze`, {
    method: "POST",
  })
}

/* ------------------------------------------------------------------ */
/* Saved Live Runs contract (DashboardController — frozen backend)     */
/* ------------------------------------------------------------------ */
/*
 *   GET    /dashboard-api/clients/{id}/live-runs                       → 200 rows | 503 { error } (migration-005 missing)
 *   GET    /dashboard-api/clients/{id}/live-runs/{savedId}             → 200 config + items | 404 (empty body)
 *   POST   /dashboard-api/clients/{id}/live-runs                       → 201 { id, name } | 400 { error }
 *   PUT    /dashboard-api/clients/{id}/live-runs/{savedId}             → 200 { id, name } | 400 { error } | 404
 *   DELETE /dashboard-api/clients/{id}/live-runs/{savedId}             → 204 (no body) | 404
 *   POST   /dashboard-api/clients/{id}/live-runs/{savedId}/run         → 202 State | 409 State (BUSY) | 400 { error }
 *   GET    /dashboard-api/clients/{id}/live-runs/executions/{execId}   → 200 State | 404
 *   POST   /dashboard-api/clients/{id}/live-runs/executions/{execId}/cancel → 202 State | 409 State | 404
 *
 * Item rules enforced server-side: at least one item; every item needs a
 * numeric flowId; a flow may appear only once; runScope FULL_FLOW or
 * SELECTED_TESTS; SELECTED_TESTS needs ≥1 existing test; FULL_FLOW must not
 * carry selectedTests.
 */

/** One row of GET /dashboard-api/clients/{id}/live-runs. */
export type BackendSavedLiveRunRow = {
  id: number
  client_id: number
  name: string
  created_at: string
  updated_at: string
  flow_count: number
  selected_test_count: number
}

/** One item of GET /dashboard-api/clients/{id}/live-runs/{savedId}. */
export type BackendSavedLiveRunItem = {
  id: number
  flow_id: number
  flow_name: string
  run_scope: "FULL_FLOW" | "SELECTED_TESTS"
  /** JSON-encoded string array (adapter must JSON.parse); null for FULL_FLOW. */
  selected_tests: string | null
  position: number
}

/** 200 body of GET /dashboard-api/clients/{id}/live-runs/{savedId}. */
export type BackendSavedLiveRunConfig = {
  id: number
  client_id: number
  name: string
  items: BackendSavedLiveRunItem[]
}

/** One item inside a live-run execution State. */
export type BackendLiveRunItemState = {
  flowId: number
  flow: string
  scope: "FULL_FLOW" | "SELECTED_TESTS"
  tests: string[]
  runId: string | null
  status: "PENDING" | "RUNNING" | "COMPLETED" | "FAILED" | "CANCELLED" | "SKIPPED"
  message: string | null
  total: number
  passed: number
  failed: number
  skipped: number
}

/**
 * Execution State returned by run / execution-status / cancel endpoints.
 * Statuses: QUEUED | RUNNING | COMPLETED | FAILED | CANCELLED | BUSY.
 * The backend exposes no startedAt for live-run executions.
 */
export type BackendLiveRunState = {
  executionId: string
  savedLiveRunId: number
  clientId: number
  client: string
  name: string
  status: string
  cancelRequested: boolean
  currentFlow: string | null
  currentTest: string | null
  message: string | null
  finishedAt: string | null
  analysisStatus: string | null
  aiReport: unknown
  total: number
  passed: number
  failed: number
  skipped: number
  items: BackendLiveRunItemState[]
}

/** Item body accepted by create/update saved live run. */
export type SavedLiveRunItemWrite = {
  flowId: number
  runScope: "FULL_FLOW" | "SELECTED_TESTS"
  selectedTests?: string[]
}

/** GET /dashboard-api/clients/{id}/live-runs — the client's saved live runs. */
export async function apiListSavedLiveRuns(clientId: number): Promise<BackendSavedLiveRunRow[]> {
  return request<BackendSavedLiveRunRow[]>(`/dashboard-api/clients/${clientId}/live-runs`)
}

/** GET /dashboard-api/clients/{id}/live-runs/{savedId} — full config with items. */
export async function apiGetSavedLiveRun(clientId: number, savedId: number): Promise<BackendSavedLiveRunConfig> {
  return request<BackendSavedLiveRunConfig>(`/dashboard-api/clients/${clientId}/live-runs/${savedId}`)
}

/** POST /dashboard-api/clients/{id}/live-runs — 201 { id, name } | 400 { error }. */
export async function apiCreateSavedLiveRun(
  clientId: number,
  body: { name: string; items: SavedLiveRunItemWrite[] },
): Promise<{ id: number; name: string }> {
  return request<{ id: number; name: string }>(`/dashboard-api/clients/${clientId}/live-runs`, {
    method: "POST",
    body,
  })
}

/** PUT /dashboard-api/clients/{id}/live-runs/{savedId} — 200 { id, name } | 400 | 404. */
export async function apiUpdateSavedLiveRun(
  clientId: number,
  savedId: number,
  body: { name: string; items: SavedLiveRunItemWrite[] },
): Promise<{ id: number; name: string }> {
  return request<{ id: number; name: string }>(`/dashboard-api/clients/${clientId}/live-runs/${savedId}`, {
    method: "PUT",
    body,
  })
}

/** DELETE /dashboard-api/clients/{id}/live-runs/{savedId} — 204 no content | 404. */
export async function apiDeleteSavedLiveRun(clientId: number, savedId: number): Promise<void> {
  await request<unknown>(`/dashboard-api/clients/${clientId}/live-runs/${savedId}`, { method: "DELETE" })
}

/** POST /dashboard-api/clients/{id}/live-runs/{savedId}/run — 202 State | 409 State (BUSY) | 400. */
export async function apiRunSavedLiveRun(clientId: number, savedId: number): Promise<BackendLiveRunState> {
  return request<BackendLiveRunState>(`/dashboard-api/clients/${clientId}/live-runs/${savedId}/run`, {
    method: "POST",
  })
}

/** GET /dashboard-api/clients/{id}/live-runs/executions/{executionId} — live State | 404. */
export async function apiSavedLiveRunExecution(clientId: number, executionId: string): Promise<BackendLiveRunState> {
  return request<BackendLiveRunState>(
    `/dashboard-api/clients/${clientId}/live-runs/executions/${encodeURIComponent(executionId)}`,
  )
}

/** POST .../executions/{executionId}/cancel — 202 State | 409 State (terminal) | 404. */
export async function apiCancelSavedLiveRunExecution(
  clientId: number,
  executionId: string,
): Promise<BackendLiveRunState> {
  return request<BackendLiveRunState>(
    `/dashboard-api/clients/${clientId}/live-runs/executions/${encodeURIComponent(executionId)}/cancel`,
    { method: "POST" },
  )
}

/* ------------------------------------------------------------------ */
/* Execution Plans (schedules) contract (DashboardController — frozen) */
/* ------------------------------------------------------------------ */
/*
 *   GET    /dashboard-api/clients/{id}/schedules                        → 200 plans | 503 { error } (migration-003 missing)
 *   POST   /dashboard-api/clients/{id}/schedules                        → 201 plan | 400 { error }
 *   GET    /dashboard-api/clients/{id}/schedules/{planId}               → 200 plan | 404 { error }
 *   PUT    /dashboard-api/clients/{id}/schedules/{planId}               → 200 plan | 400 { error } | 404
 *   DELETE /dashboard-api/clients/{id}/schedules/{planId}               → 200 { status: "deleted", planId } | 404
 *   POST   /dashboard-api/clients/{id}/schedules/{planId}/run           → 202 planRun | 400 { error } | 409 { error } | 404
 *   GET    /dashboard-api/clients/{id}/schedules/{planId}/runs/{runId}  → 200 planRun | 404 { error }
 *   POST   .../schedules/{planId}/runs/{runId}/cancel                   → 202 { status: "cancelling" } | 409 { error } | 404
 *
 * cronExpression is validated with Spring CronExpression — SIX fields
 * (seconds minutes hours day month weekday). isActive=false pauses the
 * trigger; there is no separate pause endpoint and no next-run-time API.
 */

/** One item of an execution plan (response shape — selectedTests already parsed). */
export type BackendPlanItem = {
  id: number
  flowId: number
  flowName: string
  runScope: "FULL_FLOW" | "SELECTED_TESTS"
  selectedTests: string[]
  position: number
}

/** Plan response body (list / create / get / update). */
export type BackendPlanResponse = {
  id: number
  clientId: number
  clientName: string
  name: string
  cronExpression: string
  timezone: string | null
  isActive: boolean
  notifyPolicy: "always" | "on_failure" | "never" | null
  createdAt: string
  updatedAt: string
  items: BackendPlanItem[]
}

/** One item inside a plan-run state. */
export type BackendPlanItemRun = {
  flowId: number
  flow: string
  scope: "FULL_FLOW" | "SELECTED_TESTS"
  runId: string | null
  status: "PENDING" | "RUNNING" | "COMPLETED" | "FAILED" | "CANCELLED" | "SKIPPED"
  total: number
  passed: number
  failed: number
  skipped: number
  message?: string | null
}

/**
 * Plan-run state (run-now / run-status). Statuses: QUEUED | RUNNING |
 * COMPLETED | FAILED | CANCELLED. Kept in memory for ~30 minutes.
 */
export type BackendPlanRunResponse = {
  planRunId: string
  planId: number
  client: string
  planName: string
  trigger: string
  status: string
  cancelRequested: boolean
  startedAt: string | null
  finishedAt: string | null
  message?: string | null
  items: BackendPlanItemRun[]
}

/** Item body accepted by create/update plan. */
export type PlanItemWrite = {
  flowId: number
  runScope: "FULL_FLOW" | "SELECTED_TESTS"
  selectedTests?: string[]
}

/** Body accepted by POST/PUT plan. cronExpression must be 6-field. */
export type PlanWrite = {
  name: string
  cronExpression: string
  timezone?: string | null
  isActive?: boolean
  notifyPolicy?: "always" | "on_failure" | "never" | null
  items: PlanItemWrite[]
}

/** GET /dashboard-api/clients/{id}/schedules — the client's execution plans. */
export async function apiListPlans(clientId: number): Promise<BackendPlanResponse[]> {
  return request<BackendPlanResponse[]>(`/dashboard-api/clients/${clientId}/schedules`)
}

/** POST /dashboard-api/clients/{id}/schedules — 201 plan | 400 { error }. */
export async function apiCreatePlan(clientId: number, body: PlanWrite): Promise<BackendPlanResponse> {
  return request<BackendPlanResponse>(`/dashboard-api/clients/${clientId}/schedules`, {
    method: "POST",
    body,
  })
}

/** GET /dashboard-api/clients/{id}/schedules/{planId} — 200 plan | 404. */
export async function apiGetPlan(clientId: number, planId: number): Promise<BackendPlanResponse> {
  return request<BackendPlanResponse>(`/dashboard-api/clients/${clientId}/schedules/${planId}`)
}

/** PUT /dashboard-api/clients/{id}/schedules/{planId} — 200 plan | 400 | 404. */
export async function apiUpdatePlan(clientId: number, planId: number, body: PlanWrite): Promise<BackendPlanResponse> {
  return request<BackendPlanResponse>(`/dashboard-api/clients/${clientId}/schedules/${planId}`, {
    method: "PUT",
    body,
  })
}

/** DELETE /dashboard-api/clients/{id}/schedules/{planId} — 200 { status, planId } | 404. */
export async function apiDeletePlan(clientId: number, planId: number): Promise<{ status: string; planId: number }> {
  return request<{ status: string; planId: number }>(`/dashboard-api/clients/${clientId}/schedules/${planId}`, {
    method: "DELETE",
  })
}

/** POST /dashboard-api/clients/{id}/schedules/{planId}/run — 202 planRun | 400 | 409 | 404. */
export async function apiRunPlanNow(clientId: number, planId: number): Promise<BackendPlanRunResponse> {
  return request<BackendPlanRunResponse>(`/dashboard-api/clients/${clientId}/schedules/${planId}/run`, {
    method: "POST",
  })
}

/** GET /dashboard-api/clients/{id}/schedules/{planId}/runs/{planRunId} — 200 planRun | 404. */
export async function apiPlanRunStatus(
  clientId: number,
  planId: number,
  planRunId: string,
): Promise<BackendPlanRunResponse> {
  return request<BackendPlanRunResponse>(
    `/dashboard-api/clients/${clientId}/schedules/${planId}/runs/${encodeURIComponent(planRunId)}`,
  )
}

/** POST .../runs/{planRunId}/cancel — 202 cancelling | 409 already finished | 404. */
export async function apiCancelPlanRun(
  clientId: number,
  planId: number,
  planRunId: string,
): Promise<{ status: string; planRunId: string }> {
  return request<{ status: string; planRunId: string }>(
    `/dashboard-api/clients/${clientId}/schedules/${planId}/runs/${encodeURIComponent(planRunId)}/cancel`,
    { method: "POST" },
  )
}

/* ------------------------------------------------------------------ */
/* Asset Requests contract (AssetRequestController)                    */
/* ------------------------------------------------------------------ */
/*
 * Client surface (tenant-scoped; the clientId in the URL is checked against
 * the JWT identity server-side):
 *   POST   /dashboard-api/clients/{id}/requests                 → 200 { id, status:"PENDING", ... } | 400 | 404 | 409 (duplicate flow name)
 *   GET    /dashboard-api/clients/{id}/requests?status=         → 200 rows | 404
 *   GET    /dashboard-api/clients/{id}/requests/{requestId}      → 200 row | 404 (same message for foreign tenant)
 *   POST   /dashboard-api/clients/{id}/requests/{requestId}/cancel → 200 { status:"CANCELLED" } | 409 not PENDING/concurrent | 404
 *
 * Request rows carry: id, client_id, requested_by, request_type, status,
 * payload (parsed JSON object), admin_notes, reviewed_by, reviewed_at,
 * implemented_at, created_at, updated_at, requested_by_email (nullable).
 * Payload is IMMUTABLE after submission — there is no PATCH endpoint.
 */

export type AssetRequestType =
  | "ADD_FLOW"
  | "MODIFY_FLOW"
  | "ADD_TEST"
  | "MODIFY_TEST"
  | "DELETE_FLOW"
  | "DELETE_TEST"

export type AssetRequestStatus =
  | "PENDING"
  | "APPROVED"
  | "REJECTED"
  | "IMPLEMENTED"
  | "CANCELLED"

/** One test entry inside an ADD_FLOW payload. */
export type AssetRequestTestSpec = {
  testName: string
  description?: string
  expectedBehavior?: string
  steps: string[]
}

/**
 * The stored payload document, keyed by request type. The write union
 * (AssetRequestPayload) is what forms produce; this read union is what the
 * backend returns (all fields optional at runtime — nothing is fabricated).
 */
export type AssetRequestPayloadDoc =
  | {
      requestType?: "ADD_FLOW"
      flowName?: string
      description?: string
      expectedBehavior?: string
      tests?: AssetRequestTestSpec[]
    }
  | {
      requestType?: "MODIFY_FLOW"
      flowId?: number
      description?: string
      expectedBehavior?: string
      steps?: string[]
      reason?: string
    }
  | {
      requestType?: "ADD_TEST"
      flowId?: number
      testName?: string
      description?: string
      expectedBehavior?: string
      steps?: string[]
    }
  | {
      requestType?: "MODIFY_TEST"
      flowId?: number
      testMethod?: string
      description?: string
      expectedBehavior?: string
      steps?: string[]
      reason?: string
    }
  | {
      requestType?: "DELETE_FLOW"
      flowId?: number
      reason?: string
    }
  | {
      requestType?: "DELETE_TEST"
      flowId?: number
      testMethod?: string
      reason?: string
    }

/** Discriminated write payload per request type (validated server-side too). */
export type AssetRequestPayload =
  | {
      requestType: "ADD_FLOW"
      flowName: string
      description?: string
      expectedBehavior?: string
      tests: AssetRequestTestSpec[]
    }
  | {
      requestType: "MODIFY_FLOW"
      flowId: number
      description?: string
      expectedBehavior?: string
      steps?: string[]
      reason: string
    }
  | {
      requestType: "ADD_TEST"
      flowId: number
      testName: string
      description?: string
      expectedBehavior?: string
      steps: string[]
    }
  | {
      requestType: "MODIFY_TEST"
      flowId: number
      testMethod: string
      description?: string
      expectedBehavior?: string
      steps?: string[]
      reason: string
    }
  | {
      requestType: "DELETE_FLOW"
      flowId: number
      reason: string
    }
  | {
      requestType: "DELETE_TEST"
      flowId: number
      testMethod: string
      reason: string
    }

/** One row of GET /clients/{id}/requests (list and detail share the shape). */
export type BackendAssetRequest = {
  id: number
  client_id: number
  requested_by: number | null
  request_type: AssetRequestType
  status: AssetRequestStatus
  payload: AssetRequestPayloadDoc
  admin_notes: string | null
  reviewed_by: number | null
  reviewed_at: string | null
  implemented_at: string | null
  created_at: string
  updated_at: string
  requested_by_email?: string | null
}

/** POST /dashboard-api/clients/{id}/requests — create a PENDING request. */
export async function apiCreateAssetRequest(
  clientId: number,
  payload: AssetRequestPayload,
): Promise<{ id: number; status: string; requestType: string; payload: Record<string, unknown> }> {
  const { requestType, ...doc } = payload
  return request(`/dashboard-api/clients/${clientId}/requests`, {
    method: "POST",
    body: { requestType, payload: doc },
  })
}

/** GET /dashboard-api/clients/{id}/requests — the client's own requests. */
export async function apiListAssetRequests(
  clientId: number,
  status?: AssetRequestStatus,
): Promise<BackendAssetRequest[]> {
  const suffix = status ? `?status=${encodeURIComponent(status)}` : ""
  return request<BackendAssetRequest[]>(`/dashboard-api/clients/${clientId}/requests${suffix}`)
}

/** GET /dashboard-api/clients/{id}/requests/{requestId} — one request; 404 when foreign/missing. */
export async function apiGetAssetRequest(
  clientId: number,
  requestId: number,
): Promise<BackendAssetRequest> {
  return request<BackendAssetRequest>(
    `/dashboard-api/clients/${clientId}/requests/${requestId}`,
  )
}

/** POST .../requests/{requestId}/cancel — PENDING only; 409 otherwise. */
export async function apiCancelAssetRequest(
  clientId: number,
  requestId: number,
): Promise<{ status: string }> {
  return request<{ status: string }>(
    `/dashboard-api/clients/${clientId}/requests/${requestId}/cancel`,
    { method: "POST" },
  )
}

/* ------------------------------------------------------------------ */
/* Admin Asset Requests surface (same controller, admin-guarded)       */
/* ------------------------------------------------------------------ */
/*
 *   GET  /dashboard-api/admin/requests?status=&clientId=  → 200 rows | 401 | 403
 *   GET  /dashboard-api/admin/requests/{requestId}        → 200 row | 404
 *   POST /dashboard-api/admin/requests/{requestId}/approve  { adminNotes? } → 200 { status:"APPROVED" } | 409 not PENDING/concurrent
 *   POST /dashboard-api/admin/requests/{requestId}/reject   { adminNotes  } → 200 { status:"REJECTED" } | 400 blank notes | 409
 *   POST /dashboard-api/admin/requests/{requestId}/implement          (no body) → 200 { status:"IMPLEMENTED" } | 409 not APPROVED/concurrent
 *
 * Admin list rows additionally carry client_name (LEFT JOIN clients); the
 * admin detail row does not — the client name is only available from the
 * list the row was opened from.
 */

/** One row of GET /dashboard-api/admin/requests (list response). */
export type AdminAssetRequestRow = BackendAssetRequest & {
  /** Present in the admin LIST response only — null when the client was deleted. */
  client_name?: string | null
}

/** GET /dashboard-api/admin/requests — full queue, newest first. */
export async function apiListAdminAssetRequests(
  status?: AssetRequestStatus,
  clientId?: number,
): Promise<AdminAssetRequestRow[]> {
  const params = new URLSearchParams()
  if (status) params.set("status", status)
  if (clientId != null) params.set("clientId", String(clientId))
  const suffix = params.size > 0 ? `?${params.toString()}` : ""
  return request<AdminAssetRequestRow[]>(`/dashboard-api/admin/requests${suffix}`)
}

/** GET /dashboard-api/admin/requests/{requestId} — one request; 404 when missing. */
export async function apiGetAdminAssetRequest(requestId: number): Promise<BackendAssetRequest> {
  return request<BackendAssetRequest>(`/dashboard-api/admin/requests/${requestId}`)
}

/** POST .../admin/requests/{requestId}/approve — PENDING → APPROVED. */
export async function apiApproveAdminAssetRequest(
  requestId: number,
  adminNotes?: string,
): Promise<{ status: string }> {
  return request<{ status: string }>(
    `/dashboard-api/admin/requests/${requestId}/approve`,
    { method: "POST", body: { ...(adminNotes ? { adminNotes } : {}) } },
  )
}

/** POST .../admin/requests/{requestId}/reject — PENDING → REJECTED; backend requires non-blank adminNotes. */
export async function apiRejectAdminAssetRequest(
  requestId: number,
  adminNotes: string,
): Promise<{ status: string }> {
  return request<{ status: string }>(
    `/dashboard-api/admin/requests/${requestId}/reject`,
    { method: "POST", body: { adminNotes } },
  )
}

/** POST .../admin/requests/{requestId}/implement — APPROVED → IMPLEMENTED (backend performs the asset mutation). */
export async function apiImplementAdminAssetRequest(requestId: number): Promise<{ status: string }> {
  return request<{ status: string }>(
    `/dashboard-api/admin/requests/${requestId}/implement`,
    { method: "POST" },
  )
}

/* ------------------------------------------------------------------ */
/* Onboarding Requests contract (OnboardingController)                */
/* ------------------------------------------------------------------ */
/*
 * Admin surface (admin-guarded via Bearer token):
 *   GET  /dashboard-api/onboarding/requests?status= → 200 rows | 401 | 403 | 503
 *   GET  /dashboard-api/onboarding/requests/{id}    → 200 row | 404
 *   POST /dashboard-api/onboarding/requests/{id}/approve { baseUrl } → 200 { status, clientId, clientName, message } | 400 | 404 | 409
 *   POST /dashboard-api/onboarding/requests/{id}/reject  { adminNotes? } → 200 { status:"rejected" } | 404 | 409
 */

export type OnboardingRequestStatus = "PENDING" | "APPROVED" | "REJECTED"

export type BackendOnboardingRequest = {
  id: number
  user_id: number
  company_name: string
  status: OnboardingRequestStatus
  client_id: number | null
  reviewed_by: number | null
  reviewed_at: string | null
  admin_notes: string | null
  created_at: string
  email: string
}

export type OnboardingApproveResponse = {
  status: "approved" | "approved_with_warnings"
  clientId: number
  clientName: string
  message: string
}

export type OnboardingRejectResponse = {
  status: "rejected"
}

/** GET /dashboard-api/onboarding/requests — all onboarding requests (admin only). */
export async function apiListOnboardingRequests(
  status?: OnboardingRequestStatus,
): Promise<BackendOnboardingRequest[]> {
  const suffix = status ? `?status=${encodeURIComponent(status)}` : ""
  return request<BackendOnboardingRequest[]>(`/dashboard-api/onboarding/requests${suffix}`)
}

/** GET /dashboard-api/onboarding/requests/{id} — one onboarding request (admin only). */
export async function apiGetOnboardingRequest(id: number): Promise<BackendOnboardingRequest> {
  return request<BackendOnboardingRequest>(`/dashboard-api/onboarding/requests/${id}`)
}

/** POST /dashboard-api/onboarding/requests/{id}/approve — provisions the client and approves the request. */
export async function apiApproveOnboardingRequest(
  id: number,
  baseUrl: string,
): Promise<OnboardingApproveResponse> {
  return request<OnboardingApproveResponse>(`/dashboard-api/onboarding/requests/${id}/approve`, {
    method: "POST",
    body: { baseUrl },
  })
}

/** POST /dashboard-api/onboarding/requests/{id}/reject — rejects the onboarding request. */
export async function apiRejectOnboardingRequest(
  id: number,
  adminNotes?: string,
): Promise<OnboardingRejectResponse> {
  return request<OnboardingRejectResponse>(`/dashboard-api/onboarding/requests/${id}/reject`, {
    method: "POST",
    body: { ...(adminNotes ? { adminNotes } : {}) },
  })
}

/* ------------------------------------------------------------------ */
/* Admin Overview contract (DashboardController.getAdminOverview)     */
/* ------------------------------------------------------------------ */

export type AdminOverviewKpis = {
  totalClients: number
  activeClients: number
  inactiveClients: number
  totalRuns: number
  failedRuns30d: number
  passedRuns30d: number
  successRate30d: number | null
}

export type AdminOverviewExecutionHealth = {
  running: number
  passed: number
  failed: number
  total: number
}

export type AdminOverviewWeeklyBucket = {
  date: string
  label: string
  passed: number
  failed: number
}

export type AdminOverviewClient = {
  id: number
  name: string
  status: "ACTIVE" | "INACTIVE"
  flows: number
  recentRun: "PASS" | "FAILED" | "RUNNING" | "CANCELLED" | null
  successRate: number | null
  totalRuns: number
  lastActivity: string | null
}

export type AdminOverviewActivityEvent = {
  id: string
  type: "client_created" | "flow_executed" | "schedule_completed" | "test_failed" | "ai_generated" | "alert_triggered"
  client: string
  message: string
  timestamp: string
  status?: "PASS" | "FAILED" | "INFO"
}

export type AdminOverviewResponse = {
  kpis: AdminOverviewKpis
  executionHealth: AdminOverviewExecutionHealth
  weeklyChart: AdminOverviewWeeklyBucket[]
  clients: AdminOverviewClient[]
  recentActivity: AdminOverviewActivityEvent[]
}

/** GET /dashboard-api/admin/overview — Authoritative Admin overview aggregate data (admin only). */
export async function apiAdminOverview(): Promise<AdminOverviewResponse> {
  return request<AdminOverviewResponse>("/dashboard-api/admin/overview")
}

/* ------------------------------------------------------------------ */
/* Admin Settings, Team & Access, and Audit Log contracts (Phase 1)   */
/* ------------------------------------------------------------------ */

export type AdminSettingsResponse = {
  general: {
    platformName: string
    defaultTimezone: string
  }
  security: {
    passwordAuthEnabled: boolean
    sessionTimeout: string
    sessionTimeoutMinutes: number
    mfaSupported: boolean
    oauth: {
      google: { configured: boolean }
      github: { configured: boolean; pkceEnabled: boolean }
      redirectOrigin: string
    }
  }
  ai: {
    enabled: boolean
    provider: string
    model: string
    timeoutSeconds: number
    maxAttempts: number
  }
  notifications: {
    webhookConfigured: boolean
    webhookSigned: boolean
    webhookTimeoutSeconds: number
    webhookRetryMaxAttempts: number
    supportedChannels: string[]
    note: string
  }
  monitoring: {
    executionRegion: string
    note: string
  }
}

export type AdminTeamMemberRole = "ADMIN" | "CLIENT" | "APPLICANT"

export type AdminTeamMember = {
  id: number
  email: string
  role: AdminTeamMemberRole
  clientId: number | null
  clientName: string | null
  status: "active" | "pending"
  createdAt: string | null
}

export type AdminTeamStats = {
  total: number
  active: number
  pending: number
  admin_count?: number
  client_count?: number
  applicant_count?: number
}

export type AdminTeamResponse = {
  members: AdminTeamMember[]
  stats: AdminTeamStats
  totalCount: number
  limit: number
  offset: number
}

export type CreateTeamMemberPayload = {
  email: string
  role: "ADMIN" | "CLIENT"
  clientId?: number
  password?: string
}

export type CreateTeamMemberResponse = {
  status: string
  userId: number
  email: string
  role: AdminTeamMemberRole
  clientId: number | null
  temporaryPassword?: string
}

export type AdminAuditLogEntry = {
  id: number
  actorId: number | null
  actorEmail: string
  action: string
  resourceType: string
  resourceId: string | null
  details: Record<string, unknown> | null
  ipAddress: string | null
  createdAt: string
}

export type AdminAuditLogResponse = {
  logs: AdminAuditLogEntry[]
  totalCount: number
  limit: number
  offset: number
}

/** GET /dashboard-api/admin/settings — safe platform settings (admin only). */
export async function apiGetAdminSettings(): Promise<AdminSettingsResponse> {
  return request<AdminSettingsResponse>("/dashboard-api/admin/settings")
}

/** GET /dashboard-api/admin/team — list all platform users and stats (admin only). */
export async function apiListAdminTeam(params?: {
  role?: string
  search?: string
  limit?: number
  offset?: number
}): Promise<AdminTeamResponse> {
  const query = new URLSearchParams()
  if (params?.role) query.set("role", params.role)
  if (params?.search) query.set("search", params.search)
  if (params?.limit !== undefined) query.set("limit", String(params.limit))
  if (params?.offset !== undefined) query.set("offset", String(params.offset))
  const suffix = query.toString() ? `?${query.toString()}` : ""
  return request<AdminTeamResponse>(`/dashboard-api/admin/team${suffix}`)
}

/** GET /dashboard-api/admin/team/{id} — get member details including linked OAuth providers. */
export async function apiGetAdminTeamMember(id: number): Promise<Record<string, unknown>> {
  return request<Record<string, unknown>>(`/dashboard-api/admin/team/${id}`)
}

/** POST /dashboard-api/admin/team — create a new ADMIN or CLIENT user (admin only). */
export async function apiCreateAdminTeamMember(
  payload: CreateTeamMemberPayload,
): Promise<CreateTeamMemberResponse> {
  return request<CreateTeamMemberResponse>("/dashboard-api/admin/team", {
    method: "POST",
    body: payload,
  })
}

/** PUT /dashboard-api/admin/team/{id}/role — update user role and client assignment (admin only). */
export async function apiUpdateAdminUserRole(
  id: number,
  role: AdminTeamMemberRole,
  clientId?: number,
): Promise<{ status: string; userId: number; role: string; clientId: string }> {
  return request<{ status: string; userId: number; role: string; clientId: string }>(
    `/dashboard-api/admin/team/${id}/role`,
    {
      method: "PUT",
      body: { role, ...(clientId ? { clientId } : {}) },
    },
  )
}

/** DELETE /dashboard-api/admin/team/{id} — delete a platform user (admin only). */
export async function apiDeleteAdminTeamMember(
  id: number,
): Promise<{ status: string; userId: number; email: string }> {
  return request<{ status: string; userId: number; email: string }>(
    `/dashboard-api/admin/team/${id}`,
    {
      method: "DELETE",
    },
  )
}

/** GET /dashboard-api/admin/audit-log — bounded, paginated admin audit log (admin only). */
export async function apiListAdminAuditLogs(params?: {
  action?: string
  actor?: string
  resourceType?: string
  search?: string
  limit?: number
  offset?: number
}): Promise<AdminAuditLogResponse> {
  const query = new URLSearchParams()
  if (params?.action) query.set("action", params.action)
  if (params?.actor) query.set("actor", params.actor)
  if (params?.resourceType) query.set("resourceType", params.resourceType)
  if (params?.search) query.set("search", params.search)
  if (params?.limit !== undefined) query.set("limit", String(params.limit))
  if (params?.offset !== undefined) query.set("offset", String(params.offset))
  const suffix = query.toString() ? `?${query.toString()}` : ""
  return request<AdminAuditLogResponse>(`/dashboard-api/admin/audit-log${suffix}`)
}

/* ------------------------------------------------------------------ */
/* Feedback contract (FeedbackController)                             */
/* ------------------------------------------------------------------ */

export type FeedbackRating = 1 | 2 | 3 | 4 | 5

export type FeedbackCategory =
  | "General"
  | "Feature Request"
  | "UI / UX"
  | "Performance"
  | "Monitoring"
  | "AI Analysis"
  | "Other"

export type FeedbackEntry = {
  id: string
  rawId: number
  rating: FeedbackRating
  category: FeedbackCategory
  client: string
  clientId: number | null
  message: string
  submittedAt: string
  submittedByEmail?: string | null
}

export type FeedbackSummary = {
  totalSubmissions: number
  averageRating: number | null
  featureRequests: number
  thisWeek: number
}

export type AdminFeedbackListResponse = {
  entries: FeedbackEntry[]
  summary: FeedbackSummary
  totalCount: number
  limit: number
  offset: number
}

export type SubmitFeedbackPayload = {
  rating: FeedbackRating
  category: string
  message: string
}

export type SubmitFeedbackResponse = {
  id: string
  rawId: number
  rating: number
  category: string
  status: string
  createdAt: string
}

/** POST /dashboard-api/feedback — submit feedback from client. */
export async function apiSubmitFeedback(
  payload: SubmitFeedbackPayload,
): Promise<SubmitFeedbackResponse> {
  return request<SubmitFeedbackResponse>("/dashboard-api/feedback", {
    method: "POST",
    body: payload,
  })
}

/** GET /dashboard-api/admin/feedback — list feedback with filters, pagination, and KPIs. */
export async function apiListAdminFeedback(params?: {
  category?: string
  search?: string
  limit?: number
  offset?: number
}): Promise<AdminFeedbackListResponse> {
  const query = new URLSearchParams()
  if (params?.category) query.set("category", params.category)
  if (params?.search) query.set("search", params.search)
  if (params?.limit !== undefined) query.set("limit", String(params.limit))
  if (params?.offset !== undefined) query.set("offset", String(params.offset))
  const suffix = query.toString() ? `?${query.toString()}` : ""
  return request<AdminFeedbackListResponse>(`/dashboard-api/admin/feedback${suffix}`)
}

/** GET /dashboard-api/admin/feedback/{id} — get detail for single feedback entry. */
export async function apiGetAdminFeedbackDetail(id: string): Promise<FeedbackEntry> {
  return request<FeedbackEntry>(`/dashboard-api/admin/feedback/${encodeURIComponent(id)}`)
}

/* ------------------------------------------------------------------ */
/* Test Definitions (PR 4 / 4.1 admin + tenant lifecycle APIs)         */
/*                                                                     */
/* Every route lives under                                             */
/*   /dashboard-api/clients/{clientId}/test-definitions                */
/* and resolves tenant ownership server-side, so a cross-tenant id      */
/* answers 404 exactly like a missing one. Approve, Proving and         */
/* Archive additionally require an ADMIN identity (403 otherwise);      */
/* the frontend hides those controls for usability only.               */
/*                                                                     */
/* Shapes below mirror the real controller/service responses,          */
/* including two deliberate irregularities the engine produces:        */
/*  - the run row is copied straight out of `test_runs`, so those keys  */
/*    are snake_case while nested records are camelCase;               */
/*  - a completed idempotent replay of trial/proving answers the        */
/*    run-details shape instead of the execution shape.                */
/* ------------------------------------------------------------------ */

/** Lifecycle states of one Test Definition version (LifecycleStatus). */
export type TestDefinitionStatus = "DRAFT" | "VALIDATED" | "APPROVED" | "READY" | "ARCHIVED"

/** Why one execution ran (ExecutionPurpose); NORMAL belongs to flow runs. */
export type TestDefinitionExecutionPurpose = "NORMAL" | "TRIAL" | "PROVING"

/** Terminal status of a run or a single step (ExecutionStatus). */
export type TestDefinitionRunStatus = "PASSED" | "FAILED" | "ERROR" | "CANCELLED" | "NOT_EXECUTED"

/** Implementation kind recorded on a run (ImplementationType). */
export type TestDefinitionImplementationType = "LEGACY_TESTNG" | "TEST_DEFINITION"

/** One validation error or warning; `code` is null on warnings (ValidationFinding). */
export type TestDefinitionValidationFinding = {
  ruleId: string
  code: string | null
  jsonPointer: string
  message: string
}

/** Structured validation output (ValidationReport) — never a bare boolean. */
export type TestDefinitionValidationReport = {
  valid: boolean
  errors: TestDefinitionValidationFinding[]
  warnings: TestDefinitionValidationFinding[]
  schemaVersion: string | null
  validatorVersion: string | null
}

/** One row of `items` in GET …/test-definitions (TestDefinitionEntity). */
export type TestDefinitionListItem = {
  id: number
  clientId: number
  name: string
  description: string | null
  flowId: number | null
  assetRequestId: number | null
  isArchived: boolean
  createdAt: string | null
  updatedAt: string | null
}

/** GET …/test-definitions — bounded page plus the unfiltered/filtered total. */
export type TestDefinitionListResponse = {
  items: TestDefinitionListItem[]
  total: number
  limit: number
  offset: number
}

/**
 * One entry of `versions[]` inside GET …/test-definitions/{id}. Deliberately
 * carries no `sourceJson` or validation report — those come from the
 * single-version route.
 */
export type TestDefinitionVersionSummary = {
  id: number
  versionNumber: number
  schemaVersion: string | null
  status: TestDefinitionStatus
  versionLock: number
  createdAt: string | null
  validatedAt: string | null
  approvedAt: string | null
  readyAt: string | null
  archivedAt: string | null
  updatedAt: string | null
}

/** GET …/test-definitions/{id} — the aggregate with its version history. */
export type TestDefinitionDetails = {
  id: number
  clientId: number
  name: string
  description: string | null
  flowId: number | null
  assetRequestId: number | null
  isArchived: boolean
  createdAt: string | null
  updatedAt: string | null
  versions: TestDefinitionVersionSummary[]
}

/** GET …/versions/{versionId} — the full version record (TestDefinitionVersionEntity). */
export type TestDefinitionVersion = {
  id: number
  testDefinitionId: number
  versionNumber: number
  schemaVersion: string | null
  sourceJson: string
  status: TestDefinitionStatus
  validationReportJson: string | null
  versionLock: number
  createdBy: number | null
  validatedBy: number | null
  approvedBy: number | null
  provingRunId: number | null
  createdAt: string | null
  validatedAt: string | null
  approvedAt: string | null
  readyAt: string | null
  archivedAt: string | null
  updatedAt: string | null
}

/** POST …/test-definitions — the created aggregate and its initial DRAFT version. */
export type TestDefinitionCreated = {
  definitionId: number
  clientId: number
  name: string
  description: string | null
  flowId: number | null
  initialVersionId: number
  versionNumber: number
  status: "DRAFT"
}

/** POST …/test-definitions/{id}/versions — a fresh DRAFT copied from a base version. */
export type TestDefinitionVersionCreated = {
  definitionId: number
  versionId: number
  versionNumber: number
  status: "DRAFT"
  versionLock: number
}

/** PUT …/versions/{versionId} — the accepted draft edit and its next lock value. */
export type TestDefinitionDraftSaved = {
  definitionId: number
  versionId: number
  versionNumber: number
  status: "DRAFT"
  versionLock: number
  updated: boolean
}

/** POST …/validate — VALIDATED when the report is valid, otherwise still DRAFT. */
export type TestDefinitionValidated = {
  definitionId: number
  versionId: number
  versionNumber: number
  status: TestDefinitionStatus
  valid: boolean
  validationReport: TestDefinitionValidationReport
}

/** POST …/approve — the version after the guarded VALIDATED → APPROVED transition. */
export type TestDefinitionApproved = {
  definitionId: number
  versionId: number
  versionNumber: number
  status: "APPROVED"
}

/** POST …/archive — terminal transition of the version and its aggregate. */
export type TestDefinitionArchived = {
  definitionId: number
  versionId: number
  versionNumber: number
  status: "ARCHIVED"
  aggregateArchived: boolean
}

/** One in-memory step outcome on a fresh execution response (StepResult). */
export type TestDefinitionStepOutcome = {
  stepIndex: number
  stepAddress: string | null
  /** Enum name, e.g. "UI_NAVIGATE" — the engine does not emit the "ui.navigate" wire form here. */
  opcode: string
  status: TestDefinitionRunStatus
  reasonCode: string | null
  sanitizedMessage: string | null
  expectedValue: string | null
  actualValue: string | null
  effectiveTimeoutMs: number
  elapsedMs: number
  /** Server-side artifact label, never a browsable URL. */
  screenshotPath: string | null
}

/** One persisted step row on a run-details response (TestRunStepResult). */
export type TestDefinitionRunStepRow = {
  id: number
  testRunId: number
  stepIndex: number
  stepIdentifier: string | null
  actionType: string | null
  status: string | null
  reasonCode: string | null
  message: string | null
  durationMs: number | null
  createdAt: string | null
}

/**
 * Artifact metadata on a run-details response (TestRunArtifact).
 *
 * `filePath` is a server-owned, root-relative reference ("<client>/run-<id>/<name>")
 * and is never rendered — the UI addresses artifacts by `id` through the
 * authenticated download route.
 */
export type TestDefinitionRunArtifact = {
  id: number
  testRunId: number
  stepIndex: number | null
  artifactType: string | null
  artifactName: string
  filePath: string
  fileSizeBytes: number | null
  contentType: string | null
  createdAt: string | null
}

/**
 * GET …/runs/{runId} — the `test_runs` row (snake_case, copied verbatim) plus
 * camelCase `stepResults` and `artifacts`. `timestamp` arrives as epoch millis
 * because the row is read as a `java.sql.Timestamp`, not an `Instant`.
 */
export type TestDefinitionRunDetails = {
  id: number
  run_id: string | null
  client_id: number
  flow_id: number | null
  status: string | null
  total: number | null
  passed: number | null
  failed: number | null
  skipped: number | null
  duration_seconds: number | null
  timestamp: number | string | null
  browser: string | null
  env: string | null
  error_message: string | null
  implementation_type: TestDefinitionImplementationType | string | null
  execution_purpose: TestDefinitionExecutionPurpose | string | null
  test_definition_id: number | null
  test_definition_version_id: number | null
  definition_version_number: number | null
  stepResults: TestDefinitionRunStepRow[]
  artifacts: TestDefinitionRunArtifact[]
}

/**
 * POST …/trial and POST …/proving on a *fresh* execution. A completed
 * idempotent replay answers {@link TestDefinitionRunDetails} instead, so both
 * shapes are unioned and normalized in `src/lib/testDefinitionRuns.ts`.
 */
export type TestDefinitionExecutionResult = {
  runId: number
  definitionId: number
  versionId: number
  versionNumber: number
  executionPurpose: "TRIAL" | "PROVING"
  status: TestDefinitionRunStatus
  terminatingReasonCode: string | null
  stepResults: TestDefinitionStepOutcome[]
  outcomeResults: TestDefinitionStepOutcome[]
  totalElapsedMs: number
  /** Present only when this execution lost its idempotency lease. */
  idempotencyNote?: string
  /** Proving only: whether the guarded APPROVED → READY transition was accepted. */
  becameReady?: boolean
  /** Proving only: "READY" or "APPROVED". */
  currentStatus?: TestDefinitionStatus
}

/** Either shape a trial/proving call can answer with. */
export type TestDefinitionExecutionResponse = TestDefinitionExecutionResult | TestDefinitionRunDetails

const TEST_DEFINITION_NAME_MAX_LENGTH = 120

function testDefinitionsPath(clientId: number): string {
  return `/dashboard-api/clients/${clientId}/test-definitions`
}

/**
 * GET …/test-definitions — one bounded page, newest-updated first.
 *
 * The engine clamps `limit` to 1..100 and `offset` to 0..100000 and truncates
 * `search` at 200 characters, then echoes the values it actually used, so the
 * caller paginates from the response rather than from its own request.
 */
export async function apiListTestDefinitions(
  clientId: number,
  params?: { limit?: number; offset?: number; search?: string },
): Promise<TestDefinitionListResponse> {
  const query = new URLSearchParams()
  if (params?.limit !== undefined) query.set("limit", String(params.limit))
  if (params?.offset !== undefined) query.set("offset", String(params.offset))
  const search = params?.search?.trim()
  if (search) query.set("search", search)
  const suffix = query.toString() ? `?${query.toString()}` : ""
  return request<TestDefinitionListResponse>(`${testDefinitionsPath(clientId)}${suffix}`)
}

/** GET …/test-definitions/{definitionId} — aggregate metadata plus version history. */
export async function apiGetTestDefinition(
  clientId: number,
  definitionId: number,
): Promise<TestDefinitionDetails> {
  return request<TestDefinitionDetails>(`${testDefinitionsPath(clientId)}/${definitionId}`)
}

/**
 * POST …/test-definitions — creates the aggregate and its initial DRAFT version.
 *
 * A blank `initialSourceJson` makes the engine seed a valid starter template.
 * 409 means the name already exists for this client (case-insensitively);
 * 404 means the named flow or asset request does not belong to this client.
 */
export async function apiCreateTestDefinition(
  clientId: number,
  body: {
    name: string
    description?: string | null
    flowId?: number | null
    assetRequestId?: number | null
    initialSourceJson?: string | null
  },
): Promise<TestDefinitionCreated> {
  return request<TestDefinitionCreated>(testDefinitionsPath(clientId), {
    method: "POST",
    body: {
      name: body.name.trim().slice(0, TEST_DEFINITION_NAME_MAX_LENGTH),
      description: body.description ?? null,
      flowId: body.flowId ?? null,
      assetRequestId: body.assetRequestId ?? null,
      initialSourceJson: body.initialSourceJson ?? null,
    },
  })
}

/** PUT …/test-definitions/{definitionId} — renames or re-binds the aggregate. */
export async function apiUpdateTestDefinition(
  clientId: number,
  definitionId: number,
  body: { name: string; description?: string | null; flowId?: number | null },
): Promise<{ updated: boolean }> {
  return request<{ updated: boolean }>(`${testDefinitionsPath(clientId)}/${definitionId}`, {
    method: "PUT",
    body: {
      name: body.name.trim(),
      description: body.description ?? null,
      flowId: body.flowId ?? null,
    },
  })
}

/**
 * POST …/{definitionId}/versions — the only way to edit content that has left
 * DRAFT: a new DRAFT is opened from `baseVersionId` (or the latest version).
 */
export async function apiCreateTestDefinitionVersion(
  clientId: number,
  definitionId: number,
  baseVersionId?: number | null,
): Promise<TestDefinitionVersionCreated> {
  return request<TestDefinitionVersionCreated>(
    `${testDefinitionsPath(clientId)}/${definitionId}/versions`,
    { method: "POST", body: { baseVersionId: baseVersionId ?? null } },
  )
}

/** GET …/versions/{versionId} — the full record, including `sourceJson`. */
export async function apiGetTestDefinitionVersion(
  clientId: number,
  definitionId: number,
  versionId: number,
): Promise<TestDefinitionVersion> {
  return request<TestDefinitionVersion>(
    `${testDefinitionsPath(clientId)}/${definitionId}/versions/${versionId}`,
  )
}

/**
 * PUT …/versions/{versionId} — optimistic draft save.
 *
 * `versionLock` is the value last read from the server; a mismatch, or a version
 * that has left DRAFT, answers 409 and the caller must reload before retrying.
 */
export async function apiEditTestDefinitionDraft(
  clientId: number,
  definitionId: number,
  versionId: number,
  body: { versionLock: number; sourceJson: string; schemaVersion?: string | null },
): Promise<TestDefinitionDraftSaved> {
  return request<TestDefinitionDraftSaved>(
    `${testDefinitionsPath(clientId)}/${definitionId}/versions/${versionId}`,
    {
      method: "PUT",
      body: {
        versionLock: body.versionLock,
        sourceJson: body.sourceJson,
        schemaVersion: body.schemaVersion ?? null,
      },
    },
  )
}

/**
 * POST …/versions/{versionId}/validate — structural + semantic validation.
 *
 * Answers 200 whether or not the document is valid: `valid === false` keeps the
 * version in DRAFT and returns the findings. Only a DRAFT may be validated.
 */
export async function apiValidateTestDefinitionVersion(
  clientId: number,
  definitionId: number,
  versionId: number,
): Promise<TestDefinitionValidated> {
  return request<TestDefinitionValidated>(
    `${testDefinitionsPath(clientId)}/${definitionId}/versions/${versionId}/validate`,
    { method: "POST" },
  )
}

/**
 * POST …/versions/{versionId}/trial — non-gating trial execution.
 *
 * Permitted on VALIDATED or APPROVED versions that are bound to a flow. The
 * `Idempotency-Key` header makes one user operation replay-safe: a completed
 * key answers the original run instead of executing again.
 */
export async function apiExecuteTestDefinitionTrial(
  clientId: number,
  definitionId: number,
  versionId: number,
  idempotencyKey?: string,
): Promise<TestDefinitionExecutionResponse> {
  return request<TestDefinitionExecutionResponse>(
    `${testDefinitionsPath(clientId)}/${definitionId}/versions/${versionId}/trial`,
    { method: "POST", headers: idempotencyKey ? { "Idempotency-Key": idempotencyKey } : undefined },
  )
}

/** POST …/versions/{versionId}/approve — admin-only VALIDATED → APPROVED. */
export async function apiApproveTestDefinitionVersion(
  clientId: number,
  definitionId: number,
  versionId: number,
): Promise<TestDefinitionApproved> {
  return request<TestDefinitionApproved>(
    `${testDefinitionsPath(clientId)}/${definitionId}/versions/${versionId}/approve`,
    { method: "POST" },
  )
}

/**
 * POST …/versions/{versionId}/proving — admin-only gating run on an APPROVED
 * version. READY is reached only by a PASSED proving run, never by a direct
 * transition, and the engine reports the outcome in `becameReady`.
 */
export async function apiExecuteTestDefinitionProving(
  clientId: number,
  definitionId: number,
  versionId: number,
  idempotencyKey?: string,
): Promise<TestDefinitionExecutionResponse> {
  return request<TestDefinitionExecutionResponse>(
    `${testDefinitionsPath(clientId)}/${definitionId}/versions/${versionId}/proving`,
    { method: "POST", headers: idempotencyKey ? { "Idempotency-Key": idempotencyKey } : undefined },
  )
}

/** POST …/versions/{versionId}/archive — admin-only, READY versions only. */
export async function apiArchiveTestDefinitionVersion(
  clientId: number,
  definitionId: number,
  versionId: number,
): Promise<TestDefinitionArchived> {
  return request<TestDefinitionArchived>(
    `${testDefinitionsPath(clientId)}/${definitionId}/versions/${versionId}/archive`,
    { method: "POST" },
  )
}

/** GET …/{definitionId}/runs/{runId} — persisted run row, steps and artifact metadata. */
export async function apiGetTestDefinitionRun(
  clientId: number,
  definitionId: number,
  runId: number,
): Promise<TestDefinitionRunDetails> {
  return request<TestDefinitionRunDetails>(
    `${testDefinitionsPath(clientId)}/${definitionId}/runs/${runId}`,
  )
}

/**
 * GET …/runs/{runId}/artifacts/{artifactId} — the artifact bytes.
 *
 * Authenticated like every other route, so the file is fetched as a Blob rather
 * than linked to; there is no public URL for evidence. 404 covers both "no such
 * artifact for this run" and "the stored file is not retrievable".
 */
export async function apiDownloadTestDefinitionArtifact(
  clientId: number,
  definitionId: number,
  runId: number,
  artifactId: number,
): Promise<Blob> {
  return requestBinary(
    `${testDefinitionsPath(clientId)}/${definitionId}/runs/${runId}/artifacts/${artifactId}`,
  )
}
