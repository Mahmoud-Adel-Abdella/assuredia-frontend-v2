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
}

export type PlanOutcome = {
  type: "UI" | "API"
  intent: string
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
