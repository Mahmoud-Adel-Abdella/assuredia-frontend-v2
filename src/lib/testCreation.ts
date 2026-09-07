import { ApiError } from "./api"

export type JourneyType = "UI" | "API" | "MIXED"
export type CreationMethod = "MANUAL_REQUEST" | "MANUAL_EDITOR"
export type CreationStatus = "SUBMITTED" | "IN_REVIEW" | "IN_PROGRESS" | "DRAFT_CREATED" | "REJECTED" | "CANCELLED" | "FAILED"

export type TestCreationRequest = {
  id: number
  clientId: number
  flowId: number | null
  journeyType: JourneyType
  creationMethod: CreationMethod
  status: CreationStatus
  requestedBy: number
  assignedTo: number | null
  definitionId: number | null
  title: string
  description: string | null
  decisionReason: string | null
  failureCode: string | null
  failureMessage: string | null
  versionLock: number
  createdAt: string
  updatedAt: string
  completedAt: string | null
}

export const JOURNEY_TYPES: JourneyType[] = ["UI", "API", "MIXED"]
export const CREATION_METHODS: CreationMethod[] = [
  "MANUAL_REQUEST",
  "MANUAL_EDITOR",
]
export const CREATION_STATUSES: CreationStatus[] = [
  "SUBMITTED",
  "IN_REVIEW",
  "IN_PROGRESS",
  "DRAFT_CREATED",
  "REJECTED",
  "CANCELLED",
  "FAILED",
]

export const ACTIVE_QUEUE_STATUSES: CreationStatus[] = [
  "SUBMITTED",
  "IN_REVIEW",
  "IN_PROGRESS",
]
export const COMPLETED_QUEUE_STATUSES: CreationStatus[] = [
  "DRAFT_CREATED",
  "REJECTED",
  "CANCELLED",
  "FAILED",
]

export const TITLE_MAX = 120
export const DESCRIPTION_MAX = 2000
export const REASON_MAX = 2000
export const REJECT_REASON_MIN = 10

export function journeyLabel(j: JourneyType): string {
  return j === "UI" ? "UI" : j === "API" ? "API" : "Mixed"
}

export function methodLabel(m: CreationMethod): string {
  return m === "MANUAL_REQUEST" ? "Manual Request" : "Manual Editor"
}

export function statusLabel(s: CreationStatus): string {
  switch (s) {
    case "SUBMITTED":
      return "Submitted"
    case "IN_REVIEW":
      return "In Review"
    case "IN_PROGRESS":
      return "In Progress"
    case "DRAFT_CREATED":
      return "Draft Created"
    case "REJECTED":
      return "Rejected"
    case "CANCELLED":
      return "Cancelled"
    case "FAILED":
      return "Failed"
  }
}

export function statusHelper(s: CreationStatus): string | null {
  return s === "SUBMITTED" ? "Awaiting review" : null
}

export function statusBadgeClass(s: CreationStatus): string {
  switch (s) {
    case "SUBMITTED":
      return "bg-brand-50 text-brand-300 ring-brand-700/10"
    case "IN_REVIEW":
      return "bg-amber-50 text-amber-700 ring-amber-600/10"
    case "IN_PROGRESS":
      return "bg-sky-50 text-sky-700 ring-sky-600/10"
    case "DRAFT_CREATED":
      return "bg-emerald-50 text-emerald-700 ring-emerald-600/10"
    case "REJECTED":
    case "FAILED":
      return "bg-red-50 text-red-700 ring-red-600/10"
    case "CANCELLED":
      return "bg-slate-100 text-slate-500 ring-slate-400/10"
  }
}

export function isTerminalStatus(s: CreationStatus): boolean {
  return (
    s === "DRAFT_CREATED" ||
    s === "REJECTED" ||
    s === "CANCELLED" ||
    s === "FAILED"
  )
}

export function canCancel(status: CreationStatus): boolean {
  return status === "SUBMITTED" || status === "IN_REVIEW"
}

export function adminActionsFor(
  status: CreationStatus,
): Array<"review" | "start" | "reject" | "draft"> {
  if (status === "SUBMITTED") return ["review", "reject"]
  if (status === "IN_REVIEW") return ["start", "reject"]
  if (status === "IN_PROGRESS") return ["draft", "reject"]
  return []
}

export function requiresActionCount(
  rows: TestCreationRequest[],
  opts: {
    isAdmin: boolean
    userId: number | null
  },
): number {
  if (!opts.isAdmin) return 0
  return rows.filter((r) => {
    if (r.status === "SUBMITTED") return true
    if (r.status === "IN_REVIEW" || r.status === "IN_PROGRESS") {
      if (r.assignedTo == null) return true
      if (opts.userId != null && r.assignedTo === opts.userId) return true
    }
    return false
  }).length
}

export function validateTitle(title: string): string | null {
  if (!title.trim()) return "Title is required."
  if (title.trim().length > TITLE_MAX)
    return `Title must be ${TITLE_MAX} characters or fewer.`
  return null
}

export function validateDescription(description: string): string | null {
  if (description.length > DESCRIPTION_MAX)
    return `Description must be ${DESCRIPTION_MAX} characters or fewer.`
  return null
}

export function validateRejectReason(reason: string): string | null {
  if (!reason.trim())
    return "A reason is required and will be visible to the client."
  if (reason.trim().length < REJECT_REASON_MIN)
    return `Minimum ${REJECT_REASON_MIN} characters. This will be visible to the client.`
  if (reason.trim().length > REASON_MAX)
    return `Reason must be ${REASON_MAX} characters or fewer.`
  return null
}

export function buildManualRequestDescription(input: {
  description: string
  objective: string
  preconditions?: string
  journeyDescription: string
  expectedOutcome: string
  testData?: string
  auth?: string
  notes?: string
}): string {
  const sections: Array<[string, string]> = [
    ["Summary", input.description.trim()],
    ["Business objective", input.objective.trim()],
    ["Preconditions", (input.preconditions ?? "").trim()],
    ["Journey", input.journeyDescription.trim()],
    ["Expected outcome", input.expectedOutcome.trim()],
    ["Test data (references only)", (input.testData ?? "").trim()],
    ["Authentication (references only)", (input.auth ?? "").trim()],
    ["Notes", (input.notes ?? "").trim()],
  ]
  return sections
    .filter(([, v]) => v.length > 0)
    .map(([k, v]) => `${k}: ${v}`)
    .join("\n\n")
    .slice(0, DESCRIPTION_MAX)
}

export function newIdempotencyKey(): string {
  const cryptoApi = globalThis.crypto
  if (cryptoApi && typeof cryptoApi.randomUUID === "function")
    return cryptoApi.randomUUID()
  if (cryptoApi && typeof cryptoApi.getRandomValues === "function") {
    const bytes = cryptoApi.getRandomValues(new Uint8Array(16))
    bytes[6] = (bytes[6] & 0x0f) | 0x40
    bytes[8] = (bytes[8] & 0x3f) | 0x80
    const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join(
      "",
    )
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
  }
  throw new Error(
    "No cryptographic random source is available for an idempotency key",
  )
}

export type CreationFailure = {
  kind: "validation"
  message: string
} | {
  kind: "unauthenticated"
} | { kind: "forbidden" } | { kind: "notFound" } | {
  kind: "conflict"
  message: string
  requiresReload: boolean
} | {
  kind: "unavailable"
  message: string
} | {
  kind: "network"
  retrySameKey: boolean
} | {
  kind: "unexpected"
  message: string
}

export function mapCreationFailure(err: unknown): CreationFailure {
  if (err instanceof ApiError) {
    if (err.status === 0) return { kind: "network", retrySameKey: true }
    if (err.status === 400) return { kind: "validation", message: err.message }
    if (err.status === 401) return { kind: "unauthenticated" }
    if (err.status === 403) return { kind: "forbidden" }
    if (err.status === 404) return { kind: "notFound" }
    if (err.status === 409)
      return { kind: "conflict", message: err.message, requiresReload: true }
    if (err.status === 503) return { kind: "unavailable", message: err.message }
    return { kind: "unexpected", message: err.message }
  }
  return {
    kind: "unexpected",
    message: "Something went wrong. Please try again.",
  }
}

export function failureText(f: CreationFailure): string {
  switch (f.kind) {
    case "validation":
      return f.message
    case "unauthenticated":
      return "Your session expired. Please sign in again."
    case "forbidden":
      return "You do not have permission to perform this action."
    case "notFound":
      return "This request was not found."
    case "conflict":
      return f.message
    case "unavailable":
      return f.message
    case "network":
      return "Connection lost. You can safely retry with the same submission."
    case "unexpected":
      return f.message
  }
}
