/**
 * Headless lifecycle rules, permissions, idempotency and error mapping for Test
 * Definitions. Kept out of the components so the behaviour that matters is
 * testable without a DOM, and so one place mirrors the engine's guards.
 *
 * Every rule here is a copy of a server-side guard in
 * `TestDefinitionLifecycleService`, not an independent policy. The engine remains
 * authoritative: this module only decides what to show and what to enable, and a
 * request the UI would allow can still be refused with 403 or 409.
 */

import { ApiError, type TestDefinitionStatus } from "./api"
import { translate } from "./i18n"

/** The lifecycle operations the dashboard can invoke. */
export type LifecycleAction =
  | "validate"
  | "trial"
  | "approve"
  | "proving"
  | "archive"
  | "newVersion"
  | "schedule"

/** Whether an action is offered, and if it is disabled, the reason to show. */
export type ActionAvailability = {
  action: LifecycleAction
  /** False when the caller's role must not see the control at all. */
  visible: boolean
  enabled: boolean
  /** Localized explanation shown as the disabled control's title/aria description. */
  reason: string | null
}

/** Just enough of a definition and version to decide availability. */
export type LifecycleSubject = {
  status: TestDefinitionStatus
  definitionArchived: boolean
  /** Null when the definition is not bound to a flow; trial and proving then refuse. */
  flowId: number | null
  isAdmin: boolean
}

/** Actions reserved for an ADMIN identity by the engine. */
export const ADMIN_ONLY_ACTIONS: LifecycleAction[] = ["approve", "proving", "archive"]

/**
 * Every status except ARCHIVED. A trial is a non-gating manual execution and the
 * engine permits it on any non-archived version (spec §2003-2008); the archive
 * guard in `entry` still disables it for ARCHIVED.
 */
export const NON_ARCHIVED_STATUSES: TestDefinitionStatus[] = [
  "DRAFT",
  "VALIDATED",
  "APPROVED",
  "READY",
]

/**
 * Resolves every lifecycle action for one version.
 *
 * READY is deliberately absent: the engine reaches it only through a PASSED
 * proving run (`markReadyAfterProving`), so no manual control may exist.
 */
export function lifecycleAvailability(subject: LifecycleSubject): ActionAvailability[] {
  const { status, definitionArchived, flowId, isAdmin } = subject
  const archived = definitionArchived || status === "ARCHIVED"
  const noFlow = flowId == null

  function entry(action: LifecycleAction, allowedStatuses: TestDefinitionStatus[], needsFlow: boolean) {
    const adminOnly = ADMIN_ONLY_ACTIONS.includes(action)
    if (adminOnly && !isAdmin) {
      return { action, visible: false, enabled: false, reason: translate("testdef.reason.adminOnly") }
    }
    if (archived) {
      return { action, visible: true, enabled: false, reason: translate("testdef.reason.archived") }
    }
    if (!allowedStatuses.includes(status)) {
      return {
        action,
        visible: true,
        enabled: false,
        reason: translate("testdef.reason.wrongStatus", {
          status: translate(statusLabelKey(status)),
        }),
      }
    }
    if (needsFlow && noFlow) {
      return { action, visible: true, enabled: false, reason: translate("testdef.reason.noFlow") }
    }
    return { action, visible: true, enabled: true, reason: null }
  }

  return [
    entry("validate", ["DRAFT"], false),
    // Trial is a non-gating manual execution: any non-archived status, and no Flow
    // requirement. The engine mirrors this (TestDefinitionLifecycleService.executeTrial).
    entry("trial", NON_ARCHIVED_STATUSES, false),
    entry("approve", ["VALIDATED"], false),
    entry("proving", ["APPROVED"], true),
    entry("archive", ["READY"], false),
    entry("newVersion", ["DRAFT", "VALIDATED", "APPROVED", "READY"], false),
    // Scheduling names a DEFINITION, not a version, so it is offered for any
    // non-archived status — a DRAFT test can be put on a schedule and the version
    // is resolved each time the trigger fires. The engine mirrors this: the
    // endpoint refuses only an ARCHIVED definition (409), and a fire on one that
    // has since been archived is recorded as a visible skip.
    entry("schedule", NON_ARCHIVED_STATUSES, false),
  ]
}

/** Convenience lookup over {@link lifecycleAvailability}. */
export function availabilityOf(
  list: ActionAvailability[],
  action: LifecycleAction,
): ActionAvailability {
  const found = list.find((a) => a.action === action)
  return found ?? { action, visible: false, enabled: false, reason: null }
}

/** Only a DRAFT version's source may be edited; everything else is immutable. */
export function isContentEditable(status: TestDefinitionStatus, definitionArchived: boolean): boolean {
  return status === "DRAFT" && !definitionArchived
}

/** i18n key for one lifecycle status. */
export function statusLabelKey(status: TestDefinitionStatus): string {
  return `testdef.status.${status.toLowerCase()}`
}

/* ------------------------------------------------------------------ */
/* Idempotency                                                         */
/* ------------------------------------------------------------------ */

/** Identifies one user operation: a purpose against one specific version. */
export type OperationIdentity = { purpose: "TRIAL" | "PROVING"; versionId: number }

type OperationState = { key: string; inFlight: boolean }

function identityOf(identity: OperationIdentity): string {
  return `${identity.purpose}:${identity.versionId}`
}

/** A fresh key. Crypto-random so two operations can never collide. */
function newIdempotencyKey(): string {
  const cryptoApi = globalThis.crypto
  if (cryptoApi && typeof cryptoApi.randomUUID === "function") return cryptoApi.randomUUID()
  if (cryptoApi && typeof cryptoApi.getRandomValues === "function") {
    const bytes = cryptoApi.getRandomValues(new Uint8Array(16))
    return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("")
  }
  throw new Error("No cryptographic random source is available for an idempotency key")
}

/**
 * Tracks the idempotency key of each in-progress trial/proving operation.
 *
 * One user gesture owns one key for its whole life, including retries after an
 * uncertain network outcome — that is what makes a retry a replay rather than a
 * second run. The key is dropped only when the outcome is definitively known
 * (`settle`) or when the user deliberately starts a new operation (`restart`).
 *
 * Keys are never logged, never persisted and never attached to analytics; they
 * live only in this in-memory map for the lifetime of the view.
 */
export class IdempotencyRegistry {
  private readonly operations = new Map<string, OperationState>()

  /**
   * The key to send for this operation, reusing the pending one when present.
   * Returns null when a request for the same operation is already in flight,
   * which is how a double click is refused before it reaches the network.
   */
  acquire(identity: OperationIdentity): string | null {
    const id = identityOf(identity)
    const existing = this.operations.get(id)
    if (existing) {
      if (existing.inFlight) return null
      existing.inFlight = true
      return existing.key
    }
    const state: OperationState = { key: newIdempotencyKey(), inFlight: true }
    this.operations.set(id, state)
    return state.key
  }

  /** True while a request for this operation is on the wire. */
  isInFlight(identity: OperationIdentity): boolean {
    return this.operations.get(identityOf(identity))?.inFlight === true
  }

  /** True when a key is being held for a retry of this operation. */
  isRetryable(identity: OperationIdentity): boolean {
    const state = this.operations.get(identityOf(identity))
    return state !== undefined && !state.inFlight
  }

  /**
   * Releases the wire but keeps the key, for an outcome that is not definitive:
   * a network failure, a 5xx, or a 409 saying the original request is still
   * running. The next attempt reuses the same key and replays.
   */
  holdForRetry(identity: OperationIdentity): void {
    const state = this.operations.get(identityOf(identity))
    if (state) state.inFlight = false
  }

  /** Drops the key because the outcome is known — success, or a terminal refusal. */
  settle(identity: OperationIdentity): void {
    this.operations.delete(identityOf(identity))
  }

  /** Forgets the held key so the next attempt is a genuinely new operation. */
  restart(identity: OperationIdentity): void {
    this.operations.delete(identityOf(identity))
  }
}

/* ------------------------------------------------------------------ */
/* Error mapping                                                       */
/* ------------------------------------------------------------------ */

/** How the UI should react to one failed call. */
export type FailureKind =
  /** 400 — the request or the document was rejected. */
  | "invalid"
  /** 401 — the session is gone; the caller signs the user out. */
  | "unauthenticated"
  /** 403 — the identity may not perform this operation. */
  | "forbidden"
  /** 404 — missing, or owned by another tenant (indistinguishable by design). */
  | "notFound"
  /** 409 — lifecycle, version-lock, duplicate-name or idempotency conflict. */
  | "conflict"
  /** 5xx — the outcome is unknown; a retry may reuse the idempotency key. */
  | "unavailable"
  /** No response reached us at all; the request may or may not have been applied. */
  | "network"

export type MappedFailure = {
  kind: FailureKind
  /** Safe, display-ready text. Never a stack trace, SQL detail or internal path. */
  message: string
  /** True when the same idempotency key must be reused on the next attempt. */
  retrySameKey: boolean
  /** True when a stale lock or lifecycle change means the caller must reload first. */
  requiresReload: boolean
}

/** Backend 409 texts that mean "your copy is stale", rather than a flat refusal. */
const STALE_CONFLICT_MARKERS = [
  "Stale update detected",
  "cannot be edited",
  "state changed concurrently",
  "is no longer READY",
]

/** The 409 text that means the original request is still running under this key. */
const IN_PROGRESS_MARKER = "currently in progress"

/**
 * Turns any thrown value into a safe, actionable failure.
 *
 * 5xx bodies are replaced with a generic message unless the engine already
 * returned one of its own safe summaries, so no server internals reach the UI.
 */
export function mapTestDefinitionFailure(err: unknown): MappedFailure {
  if (!(err instanceof ApiError)) {
    return {
      kind: "unavailable",
      message: translate("errors.serverError"),
      retrySameKey: true,
      requiresReload: false,
    }
  }

  if (err.status === 0) {
    return {
      kind: "network",
      message: err.message || translate("errors.networkUnreachable"),
      retrySameKey: true,
      requiresReload: false,
    }
  }
  if (err.status === 401) {
    return {
      kind: "unauthenticated",
      message: translate("errors.unauthorized"),
      retrySameKey: false,
      requiresReload: false,
    }
  }
  if (err.status === 403) {
    return { kind: "forbidden", message: err.message, retrySameKey: false, requiresReload: false }
  }
  if (err.status === 404) {
    return { kind: "notFound", message: err.message, retrySameKey: false, requiresReload: true }
  }
  if (err.status === 409) {
    const inProgress = err.message.includes(IN_PROGRESS_MARKER)
    return {
      kind: "conflict",
      message: err.message,
      // A request still in flight under this key must be retried with it, never a new one.
      retrySameKey: inProgress,
      requiresReload: STALE_CONFLICT_MARKERS.some((marker) => err.message.includes(marker)),
    }
  }
  if (err.status === 400) {
    return { kind: "invalid", message: err.message, retrySameKey: false, requiresReload: false }
  }

  // 5xx and anything unexpected: the engine's own safe summaries are kept, the
  // rest is collapsed so no raw server text is ever displayed.
  const safeEngineMessages = [
    translate("errors.featureUnavailable"),
    "The requested operation is temporarily unavailable",
    "Execution result could not be persisted; the run did not complete",
  ]
  const message = safeEngineMessages.includes(err.message)
    ? err.message
    : translate("errors.serverError")
  return { kind: "unavailable", message, retrySameKey: true, requiresReload: false }
}
