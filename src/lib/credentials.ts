/**
 * Secure Credentials domain helpers (PR10C.5 Phase 2).
 *
 * Pure functions shared by the Settings → Secure Credentials page, the
 * credential form, and the AI Composer / manual editor selectors:
 * form validation against the frozen backend contract (name 1–120 chars,
 * closed type vocabulary, required username/password on create), inline
 * error mapping for the four failure statuses (400/404/409/503), and
 * display helpers. No fetches here — the single HTTP boundary is api.ts.
 */

import { ApiError } from "./api"
import type {
  CreateCredentialRequest,
  CredentialStatus,
  CredentialTestResult,
  CredentialType,
  CredentialView,
  UpdateCredentialRequest,
} from "./api"

/* ------------------------------------------------------------------ */
/* Display helpers                                                    */
/* ------------------------------------------------------------------ */

/** Whether the credential is usable in a test right now. */
export function isCredentialConfigured(credential: CredentialView): boolean {
  return credential.status === "CONFIGURED"
}

/** Credentials grouped by type, in a stable order for the dropdown. */
export function groupByType(
  credentials: CredentialView[],
): { type: CredentialType; credentials: CredentialView[] }[] {
  const groups: Record<CredentialType, CredentialView[]> = {
    USER_ACCOUNT: [],
    API_SERVICE: [],
  }
  for (const credential of credentials) {
    // Defensive: an unknown type still renders rather than crashing the UI.
    const type =
      credential.type === "API_SERVICE" ? "API_SERVICE" : "USER_ACCOUNT"
    groups[type].push(credential)
  }
  return (["USER_ACCOUNT", "API_SERVICE"] as CredentialType[])
    .map((type) => ({ type, credentials: groups[type] }))
    .filter((group) => group.credentials.length > 0)
}

/** First-3-chars username preview the form can seed from the masked value. */
export function unmaskPrefix(credential: CredentialView): string {
  const masked = credential.usernameMasked ?? ""
  return masked.endsWith("***") ? masked.slice(0, -3) : ""
}

/** "3 Jun 2026"-style rendering; the caller's locale decides the exact shape. */
export function formatLastUsed(
  credential: CredentialView,
  locale: string,
): string | null {
  if (credential.lastUsedAt == null) return null
  const date = new Date(credential.lastUsedAt)
  return Number.isNaN(date.getTime())
    ? null
    : date.toLocaleDateString(locale, {
        day: "numeric",
        month: "short",
        year: "numeric",
      })
}

/* ------------------------------------------------------------------ */
/* Form validation (frozen backend contract)                           */
/* ------------------------------------------------------------------ */

export type CredentialFormValues = {
  name: string
  type: CredentialType
  username: string
  password: string
}

export type CredentialFormErrors = {
  name?: string
  type?: string
  username?: string
  password?: string
}

export const CREDENTIAL_NAME_MAX = 120

/**
 * Validates the credential form against the frozen backend contract.
 * On create, username and password are both required. On edit, every field
 * may be left blank — blank means "keep the stored value" for the username
 * and the password alike (the backend's partial-update semantics), so only
 * the name is always required.
 */
export function validateCredentialForm(
  values: CredentialFormValues,
  mode: "create" | "edit",
  errors: {
    nameRequired: string
    nameTooLong: string
    usernameRequired: string
    passwordRequired: string
  },
): CredentialFormErrors {
  const found: CredentialFormErrors = {}

  const name = values.name.trim()
  if (name.length === 0) found.name = errors.nameRequired
  else if (name.length > CREDENTIAL_NAME_MAX) found.name = errors.nameTooLong

  if (mode === "create" && values.username.trim().length === 0) {
    found.username = errors.usernameRequired
  }

  if (mode === "create" && values.password.length === 0) {
    found.password = errors.passwordRequired
  }

  return found
}

/** Assembles the create body; trims user-visible fields, never the password. */
export function toCreateRequest(
  values: CredentialFormValues,
): CreateCredentialRequest {
  return {
    name: values.name.trim(),
    type: values.type,
    username: values.username.trim(),
    password: values.password,
  }
}

/**
 * Assembles the update body: blank-able fields are omitted (keep stored),
 * a non-blank password replaces the secret, a non-blank username replaces it.
 */
export function toUpdateRequest(
  values: CredentialFormValues,
): UpdateCredentialRequest {
  const body: UpdateCredentialRequest = {}
  const name = values.name.trim()
  if (name.length > 0) body.name = name
  const username = values.username.trim()
  if (username.length > 0) body.username = username
  if (values.type != null) body.type = values.type
  if (values.password.length > 0) body.password = values.password
  return body
}

/* ------------------------------------------------------------------ */
/* Error + test-result mapping                                        */
/* ------------------------------------------------------------------ */

export type CredentialActionError = {
  /** Ready-to-render inline message; never provider or SQL text. */
  message: string
  /** True when the failure is a per-field validation fault. */
  field?: "name" | "type" | "username" | "password"
  /** True when the saved copy is stale (row was deleted elsewhere). */
  stale?: boolean
}

/**
 * Maps a caught error from a credential mutation to an inline, localized
 * message. The copy comes from the caller (i18n) so this helper stays pure.
 */
export function mapCredentialError(
  error: unknown,
  copy: {
    validation: string
    conflict: string
    notFound: string
    unavailable: string
    network: string
    fallback: string
  },
): CredentialActionError {
  if (error instanceof ApiError) {
    switch (error.status) {
      case 400:
        return { message: copy.validation, field: inferField(error) }
      case 409:
        return { message: copy.conflict, field: "name" }
      case 404:
        return { message: copy.notFound, stale: true }
      case 503:
        return { message: copy.unavailable }
      case 0:
        return { message: copy.network }
      case 401:
        // The caller's onUnauthorized path handles this before we get here.
        return { message: copy.fallback }
      default:
        return { message: copy.fallback }
    }
  }
  return { message: copy.fallback }
}

/** Best-effort field attribution from the backend's validation message. */
function inferField(error: ApiError): CredentialActionError["field"] {
  const message = error.message.toLowerCase()
  if (message.includes("name")) return "name"
  if (message.includes("type")) return "type"
  if (message.includes("username")) return "username"
  if (message.includes("password") || message.includes("secret")) {
    return "password"
  }
  return undefined
}

/** Customer-facing verdict of a connection test (never raw error text). */
export function testResultMessage(
  result: CredentialTestResult,
  copy: { works: string; failed: string },
): string {
  return result.success ? copy.works : result.message || copy.failed
}

/**
 * UX decision (audit F-04): INVALID credentials are grouped under
 * "Needs Setup" because both represent states where the user must take
 * action (complete the setup, or re-test after a failure). This is
 * intentional and documented in the audit follow-up — do NOT split
 * INVALID into a third card.
 */
export function credentialStats(
  credentials: CredentialView[],
): { total: number; configured: number; needsSetup: number } {
  const configured = credentials.filter(
    (c) => c.status === ("CONFIGURED" satisfies CredentialStatus),
  ).length
  const needsSetup = credentials.filter(
    (c) => c.status === "NEEDS_SETUP" || c.status === "INVALID",
  ).length
  return { total: credentials.length, configured, needsSetup }
}

/* ------------------------------------------------------------------ */
/* Draft description with credential metadata (audit F-01)             */
/* ------------------------------------------------------------------ */

/** The frozen draft-creation contract's description limit (backend, chars). */
export const DRAFT_DESCRIPTION_MAX = 2000

/**
 * Single source of truth for the submitted draft description: the review
 * step renders EXACTLY this string and the submit handler sends EXACTLY
 * this string, so a reviewer always sees the bytes that reach the backend.
 * The credential reference is appended as fixed suffix metadata.
 */
export function buildFinalDescription(
  rawDescription: string,
  credentialName: string | null,
): string {
  if (!credentialName) return rawDescription
  return `${rawDescription}\n\nAuthentication (references only): Secure Credential — ${credentialName}`
}

/**
 * How many characters the combined description exceeds the backend limit
 * by (0 when it fits). Callers must surface this as an inline error and
 * refuse to submit — the credential suffix is NEVER truncated silently.
 */
export function descriptionOverflow(
  rawDescription: string,
  credentialName: string | null,
): number {
  const combined = buildFinalDescription(rawDescription, credentialName)
  return Math.max(0, combined.length - DRAFT_DESCRIPTION_MAX)
}

/* ------------------------------------------------------------------ */
/* Submit latch (audit F-02)                                          */
/* ------------------------------------------------------------------ */

/**
 * Synchronous double-submit latch (audit F-02): a React state flag only
 * disables the Save button after a re-render, so a rapid double-click can
 * fire two POSTs. The latch is checked synchronously inside the click
 * handler, latched for the whole in-flight submit (released when the
 * onSubmit promise settles), and reusable afterwards.
 */
export function createSubmitLatch() {
  let held = false
  return {
    /** Returns true when the caller owns the in-flight slot. */
    tryEnter(): boolean {
      if (held) return false
      held = true
      return true
    },
    /** Releases the slot; safe to call more than once. */
    exit(): void {
      held = false
    },
  }
}

/**
 * Whether the credential selector's pill should show the "Loading..." label
 * (live-test F-10). Only a genuinely in-flight first fetch qualifies: once
 * any credentials are loaded the pill shows the real label, so the loading
 * text can never linger or flash back after the data arrived.
 */
export function selectorShowsLoading(
  loading: boolean,
  credentialCount: number,
): boolean {
  return loading && credentialCount === 0
}
