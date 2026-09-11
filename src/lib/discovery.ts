/**
 * Discovery domain types — PR10B App Discovery.
 *
 * Backend contract: POST /dashboard-api/clients/{clientId}/discovery
 * See DISCOVERY_REST_CONTRACT_FREEZE_v1.md for the frozen contract.
 *
 * IMPORTANT:
 * - Discovery is SYNCHRONOUS and can block for up to ~30 seconds.
 * - HTTP 200 can carry status="FAILED" — callers MUST check `status`.
 * - `sessionId` is correlation-only; it is NOT a session handle.
 *   There is no GET endpoint, no polling, no cancellation.
 * - `pages` is ONLY present when status === "COMPLETED".
 */

export type DiscoveryStatus = "COMPLETED" | "FAILED"

export type DiscoveryFailureToken = "mcp_unavailable" | "mcp_initialization_failed" | "mcp_navigation_failed" | "mcp_snapshot_failed" | "mcp_call_timeout" | "client_configuration_invalid" | "origin_rejected" | "discovery_failed"

export const DISCOVERY_ERROR_MESSAGES: Record<DiscoveryFailureToken, string> = {
  mcp_unavailable: "Discovery is not available right now.",
  mcp_initialization_failed: "Discovery could not start.",
  mcp_navigation_failed: "Could not reach the target application.",
  mcp_snapshot_failed: "Could not read the page structure.",
  mcp_call_timeout: "Discovery took too long. Try again.",
  origin_rejected: "The target application origin is not allowed.",
  client_configuration_invalid:
    "Target URL is not configured. Configure it in Settings.",
  discovery_failed: "Discovery failed. Try again.",
}

export type LocatorStrategy = "role" | "label" | "text" | "testId" | "placeholder" | "css"

export type LocatorStrength = "STRONG" | "MEDIUM"
export type LocatorState = "UNVERIFIED"

export interface LocatorCandidate {
  strategy: LocatorStrategy
  value: string
  strength: LocatorStrength
  state: LocatorState
}

export interface DiscoveredElement {
  elementId: string
  role: string
  name: string
  attributes: Record<string, string>
  locatorCandidates: LocatorCandidate[]
}

export interface DiscoveredPage {
  url: string
  title: string
  elements: DiscoveredElement[]
}

export interface DiscoveryResult {
  sessionId: string
  status: DiscoveryStatus
  origin: string
  truncated?: boolean
  pages?: DiscoveredPage[]
  failureReason?: DiscoveryFailureToken
}

export interface NormalizedDiscoveryResult {
  origin: string
  pageTitle: string
  pageUrl: string
  elements: DiscoveredElement[]
  truncated: boolean
}

const DISCOVERY_FAILURE_TOKENS = new Set<DiscoveryFailureToken>([
  "mcp_unavailable",
  "mcp_initialization_failed",
  "mcp_navigation_failed",
  "mcp_snapshot_failed",
  "mcp_call_timeout",
  "client_configuration_invalid",
  "origin_rejected",
  "discovery_failed",
])

function discoveryFailureToken(value: unknown): DiscoveryFailureToken {
  return DISCOVERY_FAILURE_TOKENS.has(value as DiscoveryFailureToken)
    ? value as DiscoveryFailureToken
    : "discovery_failed"
}

/**
 * Converts the synchronous wire response into the single-page shape consumed
 * by the UI. Only COMPLETED is usable; every other or malformed status fails
 * closed without introducing a polling/session lifecycle.
 */
export function normalizeDiscoveryResult(
  result: DiscoveryResult,
): NormalizedDiscoveryResult {
  if (!result || result.status !== "COMPLETED") {
    const token =
      result?.status === "FAILED"
        ? discoveryFailureToken(result.failureReason)
        : "discovery_failed"
    throw new DiscoveryError(token)
  }

  const origin = typeof result.origin === "string" ? result.origin : ""
  const firstPage = Array.isArray(result.pages) ? result.pages[0] : undefined
  return {
    origin,
    pageUrl:
      firstPage && typeof firstPage.url === "string" ? firstPage.url : origin,
    pageTitle:
      firstPage && typeof firstPage.title === "string" ? firstPage.title : "",
    elements:
      firstPage && Array.isArray(firstPage.elements) ? firstPage.elements : [],
    truncated: result.truncated === true,
  }
}

/**
 * Thrown by apiRunDiscovery when the backend returns status="FAILED"
 * inside an HTTP 200 response, or when the client-side timeout fires.
 */
export class DiscoveryError extends Error {
  readonly token: DiscoveryFailureToken
  readonly isTimeout: boolean

  constructor(token: DiscoveryFailureToken, isTimeout = false) {
    super(`Discovery failed: ${token}`)
    this.name = "DiscoveryError"
    this.token = token
    this.isTimeout = isTimeout
  }
}

/**
 * Client-side timeout for discovery.
 * Backend caps at ~30s (10s init + 15s tool + 5s shutdown).
 * 35s gives a 5-second safety margin.
 */
export const DISCOVERY_CLIENT_TIMEOUT_MS = 60_000

/**
 * Maps a discovery failure token to a stable i18n key.
 * The actual translation lives in i18n.tsx under `discovery.errors.*`.
 */
export function failureTokenToI18nKey(token: DiscoveryFailureToken): string {
  return `discovery.errors.${token}`
}
