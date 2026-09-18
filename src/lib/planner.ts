/**
 * AI Test Builder domain layer (PR10C).
 *
 * Customer-facing types and vocabulary for the AI Test Builder UI. Wire terms
 * use the frozen PR10C backend contract (USER_JOURNEY / BACKEND_CHECK /
 * END_TO_END); display terms use the customer-facing vocabulary. The backend
 * remains the source of truth — this module never invents endpoints or states.
 */

export type PlannerTestType = "USER_JOURNEY" | "BACKEND_CHECK" | "END_TO_END"

/** Composer selection (customer-facing). Maps 1:1 onto the wire type. */
export type ComposerTestType = "UI" | "API" | "MIXED"

export const COMPOSER_TO_WIRE: Record<ComposerTestType, PlannerTestType> = {
  UI: "USER_JOURNEY",
  API: "BACKEND_CHECK",
  MIXED: "END_TO_END",
}

export type PlanStep = {
  type: "UI" | "API"
  intent: string
  requiresDiscovery: boolean
  endpoint?: {
    method: string
    path: string
  }
}

export type PlanOutcome = {
  type: "UI" | "API"
  intent: string
}

export type DegradeWarningToken =
  | "spec_not_found"
  | "spec_invalid"
  | "target_unreachable"
  | "discovery_timeout"
  | "discovery_failed"

export type CatalogOperationView = {
  method: string
  path: string
  summary: string
  tags: string[]
  expectedStatuses: number[]
}

export type DiscoveredElementView = {
  elementId: string
  role: string
  name: string
  strategy: string | null
  value: string | null
  strength: string | null
  state: "UNVERIFIED"
}

export type NetworkRequestView = {
  method: string
  url: string
  status: number
  durationMs: number
}

export type PlanEvidence = {
  origin: string | null
  pageTitle: string | null
  pageUrl: string | null
  truncated: boolean
  elementsFound: number
  backendOperations: CatalogOperationView[]
  discoveredElements: DiscoveredElementView[]
  networkRequests: NetworkRequestView[]
  discoveryDurationMs: number
  degradeWarningToken: DegradeWarningToken | null
}

/**
 * The planner returns steps and expectedOutcomes as index-aligned parallel
 * lists. Attaching each outcome to its step makes structural edits safe:
 * moving or deleting a step carries its expected result with it, so a
 * deleted step can never leave an orphaned outcome behind (F-7).
 */
export type WithOutcome = { outcome?: PlanOutcome }

export function attachOutcomesToSteps<S extends object>(
  steps: S[],
  outcomes: PlanOutcome[] | null | undefined,
): (S & WithOutcome)[] {
  return steps.map((step, index) =>
    outcomes && outcomes[index] ? { ...step, outcome: outcomes[index] } : step,
  )
}

/** Expected results that survive with their steps, in display order. */
export function outcomesOfSteps(steps: ReadonlyArray<WithOutcome>): PlanOutcome[] {
  return steps.flatMap((step) => (step.outcome ? [step.outcome] : []))
}

export type PlanCredentialReference = {
  credentialId: number
  name: string
}

export type TestPlan = {
  status: "PLAN_READY"
  planId: string
  testType: PlannerTestType
  title: string
  description: string | null
  authenticationRequired: boolean
  credentialReference: PlanCredentialReference | null
  steps: PlanStep[]
  expectedOutcomes: PlanOutcome[]
  requiredCapabilities: string[]
  warnings: string[]
  definitionSourceJson: string
  evidence?: PlanEvidence
}

export type PlanClarificationQuestion = {
  question: string
  category: string | null
}

export type PlanClarification = {
  status: "NEEDS_CLARIFICATION"
  planId: string
  requestedType: PlannerTestType | null
  questions: PlanClarificationQuestion[]
}

export type PlanFailureCategory =
  | "AI_UNAVAILABLE"
  | "AI_TIMEOUT"
  | "AI_INVALID_OUTPUT"
  | "AI_PLAN_INVALID"
  | "INTENT_AMBIGUOUS"
  | "DISCOVERY_FAILED"
  | "CREDENTIAL_REQUIRED"
  | "CREDENTIAL_UNAVAILABLE"
  | "UNSUPPORTED_SCENARIO"

export type PlanFailure = {
  status: "FAILED"
  planId: string | null
  errorCategory: PlanFailureCategory
  message: string
}

/** Exact user-facing strings per the PR10C message contract. */
export const PLAN_ERROR_MESSAGES: Record<PlanFailureCategory, string> = {
  AI_UNAVAILABLE:
    "AI Test Builder is temporarily unavailable. Try again in a moment.",
  AI_TIMEOUT: "The plan took too long to generate. Try again.",
  AI_INVALID_OUTPUT:
    "The plan could not be finalized. Try again or adjust your request.",
  AI_PLAN_INVALID:
    "The proposed plan needs review. Adjust your intent and retry.",
  INTENT_AMBIGUOUS: "Your request needs more detail. Please clarify.",
  DISCOVERY_FAILED:
    "We couldn't explore the application to plan this test.",
  CREDENTIAL_REQUIRED:
    "This test requires a Secure Credential. Select one to continue.",
  CREDENTIAL_UNAVAILABLE:
    "The selected credential is not available. Choose another.",
  UNSUPPORTED_SCENARIO:
    "This scenario isn't supported yet. Try a different request.",
}

export const CONFIRM_ERROR_MESSAGES = {
  MISSING_IDEMPOTENCY_KEY: "Something went wrong. Please try again.",
  COMPOSITION_CHANGED:
    "Deleting the UI steps turned this into an API-only plan. Create a Backend Check test instead.",
  COMPOSITION_UI_ONLY:
    "Deleting the API steps turned this into a UI-only plan. Create a User Journey test instead.",
  PLAN_NOT_FOUND: "This plan has expired. Please create a new one.",
  PLAN_EXPIRED: "This plan has expired. Please create a new one.",
  DUPLICATE_CONFIRM: "This plan was already confirmed. Opening the draft...",
  CROSS_TENANT_404: "This plan does not exist.",
} as const

/** Human-readable category labels for clarification questions. */
export function clarificationCategoryLabel(category: string | null): string {
  switch (category) {
    case "MISSING_BUSINESS_OBJECTIVE":
      return "Missing Objective"
    case "MISSING_TARGET_APPLICATION":
      return "Missing Application"
    case "MISSING_CREDENTIAL":
      return "Missing Credential"
    case "UNCLEAR_EXPECTED_OUTCOME":
    case "MISSING_ACCOUNT":
      return "Unclear Outcome"
    case "UNCLEAR_OUTCOME":
      return "Unclear Outcome"
    case "UNSUPPORTED_CAPABILITY":
      return "Unsupported Capability"
    default:
      return "Clarification"
  }
}

/** Type guards for the three plan-generation response shapes. */
export function isPlanReady(value: unknown): value is TestPlan {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as { status?: unknown }).status === "PLAN_READY"
  )
}

function stringOrNull(value: unknown): string | null {
  return typeof value === "string" ? value : null
}

function boundedList<T>(value: unknown, map: (item: unknown) => T): T[] {
  return Array.isArray(value) ? value.map(map) : []
}

export function normalizePlanEvidence(value: unknown): PlanEvidence | undefined {
  if (typeof value !== "object" || value === null) return undefined
  const raw = value as Record<string, unknown>
  const token = raw.degradeWarningToken
  const degradeWarningToken: DegradeWarningToken | null =
    token === "spec_not_found" ||
    token === "spec_invalid" ||
    token === "target_unreachable" ||
    token === "discovery_timeout" ||
    token === "discovery_failed"
      ? token
      : null

  return {
    origin: stringOrNull(raw.origin),
    pageTitle: stringOrNull(raw.pageTitle),
    pageUrl: stringOrNull(raw.pageUrl),
    truncated: raw.truncated === true,
    elementsFound:
      typeof raw.elementsFound === "number" && Number.isFinite(raw.elementsFound)
        ? Math.max(0, Math.trunc(raw.elementsFound))
        : 0,
    backendOperations: boundedList(raw.backendOperations, (item) => {
      const operation = (item ?? {}) as Record<string, unknown>
      return {
        method: typeof operation.method === "string" ? operation.method : "UNKNOWN",
        path: typeof operation.path === "string" ? operation.path : "",
        summary: typeof operation.summary === "string" ? operation.summary : "",
        tags: Array.isArray(operation.tags)
          ? operation.tags.filter((tag): tag is string => typeof tag === "string")
          : [],
        expectedStatuses: Array.isArray(operation.expectedStatuses)
          ? operation.expectedStatuses.filter(
              (status): status is number => typeof status === "number" && Number.isFinite(status),
            )
          : [],
      }
    }),
    discoveredElements: boundedList(raw.discoveredElements, (item) => {
      const element = (item ?? {}) as Record<string, unknown>
      return {
        elementId: typeof element.elementId === "string" ? element.elementId : "",
        role: typeof element.role === "string" ? element.role : "",
        name: typeof element.name === "string" ? element.name : "",
        strategy: stringOrNull(element.strategy),
        value: stringOrNull(element.value),
        strength: stringOrNull(element.strength),
        state: "UNVERIFIED" as const,
      }
    }),
    networkRequests: boundedList(raw.networkRequests, (item) => {
      const request = (item ?? {}) as Record<string, unknown>
      return {
        method: typeof request.method === "string" ? request.method : "UNKNOWN",
        url: typeof request.url === "string" ? request.url : "",
        status:
          typeof request.status === "number" && Number.isFinite(request.status)
            ? Math.max(0, Math.min(599, Math.trunc(request.status)))
            : 0,
        durationMs: 0,
      }
    }),
    discoveryDurationMs:
      typeof raw.discoveryDurationMs === "number" && Number.isFinite(raw.discoveryDurationMs)
        ? Math.max(0, Math.trunc(raw.discoveryDurationMs))
        : 0,
    degradeWarningToken,
  }
}

export function formatEvidenceDuration(durationMs: number): string {
  if (durationMs <= 0) return "—"
  return `${(durationMs / 1000).toFixed(1)}s`
}

export function evidenceStatusKind(status: number): "success" | "warning" | "error" | "failed" {
  if (status === 0) return "failed"
  if (status >= 200 && status < 300) return "success"
  if (status >= 300 && status < 400) return "warning"
  return "error"
}

export function evidenceTruncationCounts(evidence: PlanEvidence): {
  shown: number
  total: number
  isPartial: boolean
} {
  return {
    shown: evidence.discoveredElements.length,
    total: evidence.elementsFound,
    isPartial: evidence.truncated || evidence.elementsFound > evidence.discoveredElements.length,
  }
}

export function isPlanClarification(
  value: unknown,
): value is { status: "NEEDS_CLARIFICATION" } {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as { status?: unknown }).status === "NEEDS_CLARIFICATION"
  )
}

/** Client-generated idempotency key for confirm (never payload-derived). */
export function newConfirmKey(): string {
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
  ) {
    return crypto.randomUUID()
  }
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("")
}
