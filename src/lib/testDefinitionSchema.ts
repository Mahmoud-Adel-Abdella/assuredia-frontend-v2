/**
 * Browser-side pre-check for Test Definition source JSON, schema version 1.0.
 *
 * Mirrors `src/main/resources/schemas/test-definition/1.0.json` in the engine so
 * the editor can point at a broken node before a round trip. It is deliberately
 * advisory: `POST …/validate` in the engine remains the authority, and a
 * document this module accepts can still be rejected there (semantic rules such
 * as variable-reference legality are not reproduced here). Findings therefore
 * carry `FE-` rule ids, so a local finding is never mistaken for an engine one.
 *
 * The finding shape matches the engine's `ValidationFinding` (`ruleId`, `code`,
 * `jsonPointer`, `message`) so both sets render through the same component.
 */

/** One local error or warning. `code` mirrors the engine's ReasonCode vocabulary. */
export type SchemaFinding = {
  ruleId: string
  code: string | null
  jsonPointer: string
  message: string
}

/** Outcome of checking one source document. */
export type LocalValidation = {
  /** True when no errors were found. Warnings never block. */
  valid: boolean
  errors: SchemaFinding[]
  warnings: SchemaFinding[]
}

const ROOT_KEYS = [
  "schemaVersion",
  "metadata",
  "defaults",
  "variables",
  "steps",
  "expectedOutcomes",
]
const COMMON_STEP_KEYS = ["id", "name", "timeoutMs"]

/** The schema versions the engine supports (StructuralValidator: 1.0 and 1.1). */
export const SUPPORTED_SCHEMA_VERSIONS = ["1.0", "1.1"] as const
export type SupportedSchemaVersion = typeof SUPPORTED_SCHEMA_VERSIONS[number]

/** Native API steps (Schema 1.1 only). */
export const API_STEP_ACTIONS = ["api.request", "api.extract"]
/** Native API assertions (Schema 1.1 only, steps and expectedOutcomes). */
export const API_ASSERTION_ACTIONS = [
  "api.assertStatus",
  "api.assertHeader",
  "api.assertJsonPath",
  "api.assertResponseTime",
]
/** apiMatcher enum from Schema 1.1 (UI matchers are the 4-value subset). */
export const API_MATCHERS = [
  "equals",
  "notEquals",
  "contains",
  "startsWith",
  "endsWith",
  "greaterThan",
  "lessThan",
  "greaterOrEqual",
  "lessOrEqual",
  "isNull",
  "isNotNull",
  "exists",
  "notExists",
]
/** Valid HTTP methods for api.request (V-E-13). */
export const HTTP_METHODS = [
  "GET",
  "POST",
  "PUT",
  "DELETE",
  "PATCH",
  "HEAD",
  "OPTIONS",
]

const JSON_PATH_MAX = 256
const HEADER_NAME_PATTERN = /^[a-zA-Z0-9_-]+$/
const STEP_ID_PATTERN = /^[a-z0-9][a-z0-9_-]{0,63}$/
const TAG_PATTERN = /^[a-z0-9][a-z0-9-]{0,31}$/
const VARIABLE_NAME_PATTERN = /^[a-zA-Z][a-zA-Z0-9_]{0,63}$/
const ATTRIBUTE_NAME_PATTERN = /^[a-zA-Z][a-zA-Z0-9:_.-]{0,63}$/
const ROLE_PATTERN = /^[a-z]+$/

const ORIGINS = ["HUMAN_AUTHORED", "AI_GENERATED", "AI_GENERATED_EDITED"]
const MATCHERS = ["equals", "contains", "startsWith", "endsWith"]
const LOCATOR_STRATEGIES = [
  "role",
  "label",
  "text",
  "testId",
  "placeholder",
  "css",
]
const WEAK_STRATEGIES = ["placeholder", "css"]
const WAIT_STATES = ["visible", "hidden", "attached", "detached"]

const STATE_ASSERTIONS = [
  "ui.assertVisible",
  "ui.assertHidden",
  "ui.assertEnabled",
  "ui.assertDisabled",
]
const ELEMENT_TEXT_ASSERTIONS = ["ui.assertText", "ui.assertValue"]
const PAGE_TEXT_ASSERTIONS = ["ui.assertUrl", "ui.assertTitle"]
const ELEMENT_ACTIONS = ["ui.click", "ui.hover", "ui.check", "ui.uncheck"]

/** Every action the 1.0 schema accepts inside `steps`. */
export const STEP_ACTIONS = [
  "ui.navigate",
  ...ELEMENT_ACTIONS,
  "ui.fill",
  "ui.select",
  "ui.wait",
  "ui.extract",
  "ui.screenshot",
  ...STATE_ASSERTIONS,
  ...ELEMENT_TEXT_ASSERTIONS,
  ...PAGE_TEXT_ASSERTIONS,
]

/** The subset accepted inside `expectedOutcomes` (assertions only). */
export const OUTCOME_ACTIONS = [
  ...STATE_ASSERTIONS,
  ...ELEMENT_TEXT_ASSERTIONS,
  ...PAGE_TEXT_ASSERTIONS,
]

/** Schema 1.1 steps: every 1.0 step plus the native API steps. */
export const STEP_ACTIONS_11 = [...STEP_ACTIONS, ...API_STEP_ACTIONS]

/** Schema 1.1 outcomes: every 1.0 assertion plus the native API assertions. */
export const OUTCOME_ACTIONS_11 = [...OUTCOME_ACTIONS, ...API_ASSERTION_ACTIONS]

/* ------------------------------------------------------------------ */
/* Finding helpers                                                     */
/* ------------------------------------------------------------------ */

/** Builds an RFC 6901 pointer; `~` and `/` inside a key are escaped. */
function pointer(...segments: (string | number)[]): string {
  if (segments.length === 0) return ""
  return segments
    .map((s) => `/${String(s).split("~").join("~0").split("/").join("~1")}`)
    .join("")
}

class FindingSink {
  readonly errors: SchemaFinding[] = []
  readonly warnings: SchemaFinding[] = []

  error(ruleId: string, code: string, jsonPointer: string, message: string) {
    this.errors.push({ ruleId, code, jsonPointer, message })
  }

  warn(ruleId: string, jsonPointer: string, message: string) {
    this.warnings.push({ ruleId, code: null, jsonPointer, message })
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function isInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value)
}

/** Reports every key that the schema does not evaluate (`unevaluatedProperties: false`). */
function rejectUnknownKeys(
  sink: FindingSink,
  node: Record<string, unknown>,
  allowed: string[],
  at: string,
  what: string,
) {
  for (const key of Object.keys(node)) {
    if (!allowed.includes(key)) {
      sink.error(
        "FE-UNKNOWN-FIELD",
        "SCHEMA_INVALID",
        `${at}${pointer(key)}`,
        `"${key}" is not a field of ${what}.`,
      )
    }
  }
}

function checkTimeout(
  sink: FindingSink,
  value: unknown,
  at: string,
  field: string,
) {
  if (value === undefined) return
  if (!isInteger(value) || value < 100 || value > 120000) {
    sink.error(
      "FE-TIMEOUT-RANGE",
      "SCHEMA_INVALID",
      at,
      `${field} must be a whole number of milliseconds between 100 and 120000.`,
    )
  }
}

function checkBoundedString(
  sink: FindingSink,
  value: unknown,
  at: string,
  field: string,
  min: number,
  max: number,
) {
  if (typeof value !== "string") {
    sink.error("FE-TYPE", "SCHEMA_INVALID", at, `${field} must be a string.`)
    return false
  }
  if (value.length < min) {
    sink.error(
      "FE-LENGTH",
      "SCHEMA_INVALID",
      at,
      min === 1
        ? `${field} cannot be empty.`
        : `${field} must be at least ${min} characters.`,
    )
    return false
  }
  if (value.length > max) {
    sink.error(
      "FE-LENGTH",
      "SCHEMA_INVALID",
      at,
      `${field} cannot exceed ${max} characters.`,
    )
    return false
  }
  return true
}

/* ------------------------------------------------------------------ */
/* Locators                                                            */
/* ------------------------------------------------------------------ */

/**
 * Checks one locator. Scoping is one level deep by design (§3.5), so a locator
 * reached through `within` may not carry its own `within`.
 */
function checkLocator(
  sink: FindingSink,
  node: unknown,
  at: string,
  allowWithin: boolean,
) {
  if (!isPlainObject(node)) {
    sink.error("FE-TYPE", "SCHEMA_INVALID", at, "locator must be an object.")
    return
  }

  const strategy = node.strategy
  if (typeof strategy !== "string" || !LOCATOR_STRATEGIES.includes(strategy)) {
    sink.error(
      "FE-LOCATOR-STRATEGY",
      "SCHEMA_INVALID",
      `${at}${pointer("strategy")}`,
      `locator strategy must be one of ${LOCATOR_STRATEGIES.join(", ")}.`,
    )
    return
  }

  const allowed = ["strategy", "exact", "nth"]
  if (allowWithin) allowed.push("within")

  switch (strategy) {
    case "role":
      allowed.push("role", "name")
      if (
        typeof node.role !== "string" ||
        !ROLE_PATTERN.test(node.role) ||
        node.role.length > 40
      ) {
        sink.error(
          "FE-LOCATOR-ROLE",
          "SCHEMA_INVALID",
          `${at}${pointer("role")}`,
          "role must be lowercase letters only, up to 40 characters.",
        )
      }
      if (node.name !== undefined) {
        checkBoundedString(
          sink,
          node.name,
          `${at}${pointer("name")}`,
          "locator name",
          0,
          2048,
        )
      }
      break
    case "testId":
      allowed.push("value")
      checkBoundedString(
        sink,
        node.value,
        `${at}${pointer("value")}`,
        "locator value",
        1,
        200,
      )
      break
    case "css":
      allowed.push("value")
      checkBoundedString(
        sink,
        node.value,
        `${at}${pointer("value")}`,
        "locator value",
        1,
        512,
      )
      break
    default:
      allowed.push("value")
      checkBoundedString(
        sink,
        node.value,
        `${at}${pointer("value")}`,
        "locator value",
        1,
        2048,
      )
      break
  }

  if (WEAK_STRATEGIES.includes(strategy)) {
    sink.warn(
      "FE-WEAK-LOCATOR",
      `${at}${pointer("strategy")}`,
      `The "${strategy}" strategy is a weak fallback; prefer role, label, text or testId.`,
    )
  }

  if (node.exact !== undefined && typeof node.exact !== "boolean") {
    sink.error(
      "FE-TYPE",
      "SCHEMA_INVALID",
      `${at}${pointer("exact")}`,
      "exact must be true or false.",
    )
  }
  if (
    node.nth !== undefined &&
    (!isInteger(node.nth) || node.nth < 0 || node.nth > 999)
  ) {
    sink.error(
      "FE-RANGE",
      "SCHEMA_INVALID",
      `${at}${pointer("nth")}`,
      "nth must be a whole number between 0 and 999.",
    )
  }
  if (node.within !== undefined) {
    if (!allowWithin) {
      sink.error(
        "FE-LOCATOR-NESTING",
        "SCHEMA_INVALID",
        `${at}${pointer("within")}`,
        "A scoping locator cannot itself be scoped; nesting is limited to one level.",
      )
    } else {
      checkLocator(sink, node.within, `${at}${pointer("within")}`, false)
    }
  }

  rejectUnknownKeys(sink, node, allowed, at, `a "${strategy}" locator`)
}

/* ------------------------------------------------------------------ */
/* Steps                                                               */
/* ------------------------------------------------------------------ */

function checkCommonStepFields(
  sink: FindingSink,
  node: Record<string, unknown>,
  at: string,
) {
  if (
    node.id !== undefined &&
    (typeof node.id !== "string" || !STEP_ID_PATTERN.test(node.id))
  ) {
    sink.error(
      "FE-STEP-ID",
      "SCHEMA_INVALID",
      `${at}${pointer("id")}`,
      "id must start with a lowercase letter or digit and use only lowercase letters, digits, - or _.",
    )
  }
  if (node.name !== undefined) {
    checkBoundedString(
      sink,
      node.name,
      `${at}${pointer("name")}`,
      "step name",
      0,
      200,
    )
  }
  checkTimeout(
    sink,
    node.timeoutMs,
    `${at}${pointer("timeoutMs")}`,
    "timeoutMs",
  )
}

function requireLocator(
  sink: FindingSink,
  node: Record<string, unknown>,
  at: string,
) {
  if (node.locator === undefined) {
    sink.error(
      "FE-REQUIRED",
      "SCHEMA_INVALID",
      at,
      "This action requires a locator.",
    )
    return
  }
  checkLocator(sink, node.locator, `${at}${pointer("locator")}`, true)
}

function requireInterpolated(
  sink: FindingSink,
  node: Record<string, unknown>,
  at: string,
  field: string,
) {
  if (node[field] === undefined) {
    sink.error(
      "FE-REQUIRED",
      "SCHEMA_INVALID",
      at,
      `This action requires "${field}".`,
    )
    return
  }
  checkBoundedString(
    sink,
    node[field],
    `${at}${pointer(field)}`,
    field,
    0,
    2048,
  )
}

function checkMatcherFields(
  sink: FindingSink,
  node: Record<string, unknown>,
  at: string,
) {
  if (
    node.matcher !== undefined &&
    (typeof node.matcher !== "string" || !MATCHERS.includes(node.matcher))
  ) {
    sink.error(
      "FE-MATCHER",
      "SCHEMA_INVALID",
      `${at}${pointer("matcher")}`,
      `matcher must be one of ${MATCHERS.join(", ")}. Regular expressions are not supported in v1.`,
    )
  }
  if (node.ignoreCase !== undefined && typeof node.ignoreCase !== "boolean") {
    sink.error(
      "FE-TYPE",
      "SCHEMA_INVALID",
      `${at}${pointer("ignoreCase")}`,
      "ignoreCase must be true or false.",
    )
  }
}

function checkApiMatcherFields(
  sink: FindingSink,
  node: Record<string, unknown>,
  at: string,
) {
  if (
    node.matcher !== undefined &&
    (typeof node.matcher !== "string" || !API_MATCHERS.includes(node.matcher))
  ) {
    sink.error(
      "FE-API-MATCHER",
      "SCHEMA_INVALID",
      `${at}${pointer("matcher")}`,
      `matcher must be one of ${API_MATCHERS.join(", ")}.`,
    )
  }
  if (node.ignoreCase !== undefined && typeof node.ignoreCase !== "boolean") {
    sink.error(
      "FE-TYPE",
      "SCHEMA_INVALID",
      `${at}${pointer("ignoreCase")}`,
      "ignoreCase must be true or false.",
    )
  }
}

function checkHeadersOrQuery(
  sink: FindingSink,
  value: unknown,
  at: string,
  field: string,
) {
  if (value === undefined) return
  if (!isPlainObject(value)) {
    sink.error(
      "FE-TYPE",
      "SCHEMA_INVALID",
      at,
      `${field} must be an object of string values.`,
    )
    return
  }
  const names = Object.keys(value)
  if (names.length > 50) {
    sink.error(
      "FE-LENGTH",
      "SCHEMA_INVALID",
      at,
      `${field} cannot exceed 50 entries.`,
    )
  }
  for (const name of names) {
    const entry = (value as Record<string, unknown>)[name]
    if (typeof entry !== "string" || entry.length > 2048) {
      sink.error(
        "FE-TYPE",
        "SCHEMA_INVALID",
        `${at}${pointer(name)}`,
        `${field} values must be strings up to 2048 characters.`,
      )
    }
  }
}

function checkJsonPathField(
  sink: FindingSink,
  value: unknown,
  at: string,
  field: string,
) {
  if (
    typeof value !== "string" ||
    !value.startsWith("$") ||
    value.length < 1 ||
    value.length > JSON_PATH_MAX
  ) {
    sink.error(
      "FE-API-JSONPATH",
      "SCHEMA_INVALID",
      at,
      `${field} must start with "$" and use 1 to ${JSON_PATH_MAX} characters.`,
    )
  }
}

function checkApiRequestStep(
  sink: FindingSink,
  node: Record<string, unknown>,
  at: string,
) {
  if (typeof node.method !== "string" || !HTTP_METHODS.includes(node.method)) {
    sink.error(
      "FE-API-METHOD",
      "SCHEMA_INVALID",
      `${at}${pointer("method")}`,
      `method must be one of ${HTTP_METHODS.join(", ")}.`,
    )
  }
  if (typeof node.url !== "string" || node.url.length === 0) {
    sink.error(
      "FE-REQUIRED",
      "SCHEMA_INVALID",
      `${at}${pointer("url")}`,
      "api.request requires a url.",
    )
  } else if (
    !node.url.startsWith("/") &&
    !node.url.startsWith("http://") &&
    !node.url.startsWith("https://") &&
    !node.url.startsWith("${")
  ) {
    sink.error(
      "FE-API-URL",
      "SCHEMA_INVALID",
      `${at}${pointer("url")}`,
      "api.request url must start with /, http://, https://, or ${.",
    )
  } else if (node.url.length > 2048) {
    sink.error(
      "FE-LENGTH",
      "SCHEMA_INVALID",
      `${at}${pointer("url")}`,
      "url cannot exceed 2048 characters.",
    )
  }
  checkHeadersOrQuery(
    sink,
    node.headers,
    `${at}${pointer("headers")}`,
    "headers",
  )
  checkHeadersOrQuery(sink, node.query, `${at}${pointer("query")}`, "query")
  if (node.body !== undefined) {
    checkBoundedString(
      sink,
      node.body,
      `${at}${pointer("body")}`,
      "body",
      0,
      1048576,
    )
  }
  if (node.contentType !== undefined) {
    checkBoundedString(
      sink,
      node.contentType,
      `${at}${pointer("contentType")}`,
      "contentType",
      1,
      128,
    )
  }
}

function checkApiExtractStep(
  sink: FindingSink,
  node: Record<string, unknown>,
  at: string,
) {
  checkJsonPathField(
    sink,
    node.jsonPath,
    `${at}${pointer("jsonPath")}`,
    "jsonPath",
  )
  if (
    typeof node.variable !== "string" ||
    !VARIABLE_NAME_PATTERN.test(node.variable)
  ) {
    sink.error(
      "FE-VARIABLE-NAME",
      "SCHEMA_INVALID",
      `${at}${pointer("variable")}`,
      "variable must be a bare name starting with a letter (no ${extracted.} prefix).",
    )
  }
  if (node.sensitive !== undefined && typeof node.sensitive !== "boolean") {
    sink.error(
      "FE-TYPE",
      "SCHEMA_INVALID",
      `${at}${pointer("sensitive")}`,
      "sensitive must be true or false.",
    )
  }
}

/** Validates one step or expected outcome. `allowedActions` narrows the union. */
function checkStep(
  sink: FindingSink,
  node: unknown,
  at: string,
  allowedActions: string[],
) {
  if (!isPlainObject(node)) {
    sink.error("FE-TYPE", "SCHEMA_INVALID", at, "Each step must be an object.")
    return
  }

  const action = node.action
  if (typeof action !== "string" || !allowedActions.includes(action)) {
    sink.error(
      "FE-UNKNOWN-ACTION",
      "UNKNOWN_ACTION",
      `${at}${pointer("action")}`,
      typeof action === "string"
        ? `"${action}" is not a supported action here.`
        : 'Every step needs an "action".',
    )
    return
  }

  checkCommonStepFields(sink, node, at)
  const allowed = [...COMMON_STEP_KEYS, "action"]

  if (action === "ui.navigate") {
    allowed.push("url")
    requireInterpolated(sink, node, at, "url")
  } else if (ELEMENT_ACTIONS.includes(action)) {
    allowed.push("locator")
    requireLocator(sink, node, at)
  } else if (action === "ui.fill") {
    allowed.push("locator", "value")
    requireLocator(sink, node, at)
    requireInterpolated(sink, node, at, "value")
  } else if (action === "ui.select") {
    allowed.push("locator", "value", "by")
    requireLocator(sink, node, at)
    requireInterpolated(sink, node, at, "value")
    if (node.by !== undefined && node.by !== "label" && node.by !== "value") {
      sink.error(
        "FE-ENUM",
        "SCHEMA_INVALID",
        `${at}${pointer("by")}`,
        'by must be "label" or "value".',
      )
    }
  } else if (action === "ui.wait") {
    allowed.push("for", "durationMs", "locator", "state")
    checkWaitStep(sink, node, at)
  } else if (action === "ui.extract") {
    allowed.push("locator", "from", "attributeName", "variable")
    checkExtractStep(sink, node, at)
  } else if (action === "ui.screenshot") {
    allowed.push("label")
    if (node.label !== undefined) {
      checkBoundedString(
        sink,
        node.label,
        `${at}${pointer("label")}`,
        "label",
        0,
        2048,
      )
    }
  } else if (STATE_ASSERTIONS.includes(action)) {
    allowed.push("locator")
    requireLocator(sink, node, at)
  } else if (ELEMENT_TEXT_ASSERTIONS.includes(action)) {
    allowed.push(
      "locator",
      "expected",
      "matcher",
      "ignoreCase",
      "normalizeWhitespace",
    )
    requireLocator(sink, node, at)
    requireInterpolated(sink, node, at, "expected")
    checkMatcherFields(sink, node, at)
    if (
      node.normalizeWhitespace !== undefined &&
      typeof node.normalizeWhitespace !== "boolean"
    ) {
      sink.error(
        "FE-TYPE",
        "SCHEMA_INVALID",
        `${at}${pointer("normalizeWhitespace")}`,
        "normalizeWhitespace must be true or false.",
      )
    }
  } else if (PAGE_TEXT_ASSERTIONS.includes(action)) {
    allowed.push("expected", "matcher", "ignoreCase")
    requireInterpolated(sink, node, at, "expected")
    checkMatcherFields(sink, node, at)
  } else if (action === "api.request") {
    allowed.push("method", "url", "headers", "query", "body", "contentType")
    checkApiRequestStep(sink, node, at)
  } else if (action === "api.extract") {
    allowed.push("jsonPath", "variable", "sensitive")
    checkApiExtractStep(sink, node, at)
  } else if (action === "api.assertStatus") {
    allowed.push("expected", "matcher")
    if (
      !isInteger(node.expected) ||
      node.expected < 100 ||
      node.expected > 599
    ) {
      sink.error(
        "FE-API-STATUS",
        "SCHEMA_INVALID",
        `${at}${pointer("expected")}`,
        "api.assertStatus expected must be a whole HTTP status between 100 and 599.",
      )
    }
    checkApiMatcherFields(sink, node, at)
  } else if (action === "api.assertHeader") {
    allowed.push("header", "expected", "matcher", "ignoreCase")
    if (
      typeof node.header !== "string" ||
      node.header.length < 1 ||
      node.header.length > 64 ||
      !HEADER_NAME_PATTERN.test(node.header)
    ) {
      sink.error(
        "FE-API-HEADER",
        "SCHEMA_INVALID",
        `${at}${pointer("header")}`,
        "header must use letters, digits, _ or -, 1 to 64 characters.",
      )
    }
    requireInterpolated(sink, node, at, "expected")
    checkApiMatcherFields(sink, node, at)
  } else if (action === "api.assertJsonPath") {
    allowed.push("path", "expected", "matcher", "ignoreCase")
    checkJsonPathField(sink, node.path, `${at}${pointer("path")}`, "path")
    if (node.expected !== undefined) {
      const expectedType = typeof node.expected
      if (
        expectedType !== "string" &&
        expectedType !== "number" &&
        expectedType !== "boolean"
      ) {
        sink.error(
          "FE-TYPE",
          "SCHEMA_INVALID",
          `${at}${pointer("expected")}`,
          "expected must be a string, number or boolean.",
        )
      } else if (
        expectedType === "string" &&
        (node.expected as string).length > 2048
      ) {
        sink.error(
          "FE-LENGTH",
          "SCHEMA_INVALID",
          `${at}${pointer("expected")}`,
          "expected cannot exceed 2048 characters.",
        )
      }
    }
    checkApiMatcherFields(sink, node, at)
  } else if (action === "api.assertResponseTime") {
    allowed.push("maxDurationMs")
    if (
      !isInteger(node.maxDurationMs) ||
      node.maxDurationMs < 1 ||
      node.maxDurationMs > 120000
    ) {
      sink.error(
        "FE-API-RESPONSETIME",
        "SCHEMA_INVALID",
        `${at}${pointer("maxDurationMs")}`,
        "maxDurationMs must be a whole number of milliseconds between 1 and 120000.",
      )
    }
  }

  rejectUnknownKeys(sink, node, allowed, at, `a "${action}" step`)
}

function checkWaitStep(
  sink: FindingSink,
  node: Record<string, unknown>,
  at: string,
) {
  const waitFor = node.for
  if (waitFor !== "duration" && waitFor !== "locatorState") {
    sink.error(
      "FE-ENUM",
      "SCHEMA_INVALID",
      `${at}${pointer("for")}`,
      'ui.wait needs "for": "duration" or "locatorState".',
    )
    return
  }

  if (waitFor === "duration") {
    if (
      !isInteger(node.durationMs) ||
      node.durationMs < 100 ||
      node.durationMs > 30000
    ) {
      sink.error(
        "FE-RANGE",
        "SCHEMA_INVALID",
        `${at}${pointer("durationMs")}`,
        "A duration wait needs durationMs between 100 and 30000.",
      )
    }
    for (const forbidden of ["locator", "state"]) {
      if (node[forbidden] !== undefined) {
        sink.error(
          "FE-EXCLUSIVE",
          "SCHEMA_INVALID",
          `${at}${pointer(forbidden)}`,
          `A duration wait cannot also carry "${forbidden}".`,
        )
      }
    }
    return
  }

  requireLocator(sink, node, at)
  if (typeof node.state !== "string" || !WAIT_STATES.includes(node.state)) {
    sink.error(
      "FE-ENUM",
      "SCHEMA_INVALID",
      `${at}${pointer("state")}`,
      `A locatorState wait needs state to be one of ${WAIT_STATES.join(", ")}.`,
    )
  }
  if (node.durationMs !== undefined) {
    sink.error(
      "FE-EXCLUSIVE",
      "SCHEMA_INVALID",
      `${at}${pointer("durationMs")}`,
      "A locatorState wait cannot also carry durationMs.",
    )
  }
}

function checkExtractStep(
  sink: FindingSink,
  node: Record<string, unknown>,
  at: string,
) {
  requireLocator(sink, node, at)

  const from = node.from
  if (from !== "text" && from !== "value" && from !== "attribute") {
    sink.error(
      "FE-ENUM",
      "SCHEMA_INVALID",
      `${at}${pointer("from")}`,
      'ui.extract needs "from": "text", "value" or "attribute".',
    )
  } else if (from === "attribute") {
    if (
      typeof node.attributeName !== "string" ||
      !ATTRIBUTE_NAME_PATTERN.test(node.attributeName)
    ) {
      sink.error(
        "FE-REQUIRED",
        "SCHEMA_INVALID",
        `${at}${pointer("attributeName")}`,
        "Extracting an attribute requires a valid attributeName.",
      )
    }
  } else if (node.attributeName !== undefined) {
    sink.error(
      "FE-EXCLUSIVE",
      "SCHEMA_INVALID",
      `${at}${pointer("attributeName")}`,
      "attributeName applies only when extracting from an attribute.",
    )
  }

  if (
    typeof node.variable !== "string" ||
    !VARIABLE_NAME_PATTERN.test(node.variable)
  ) {
    sink.error(
      "FE-VARIABLE-NAME",
      "SCHEMA_INVALID",
      `${at}${pointer("variable")}`,
      "variable must be a bare name starting with a letter (no ${extracted.} prefix).",
    )
  }
}

/* ------------------------------------------------------------------ */
/* Document                                                            */
/* ------------------------------------------------------------------ */

function checkMetadata(sink: FindingSink, node: unknown) {
  const at = pointer("metadata")
  if (!isPlainObject(node)) {
    sink.error("FE-TYPE", "SCHEMA_INVALID", at, "metadata must be an object.")
    return
  }
  checkBoundedString(
    sink,
    node.name,
    `${at}${pointer("name")}`,
    "metadata name",
    1,
    120,
  )
  if (node.description !== undefined) {
    checkBoundedString(
      sink,
      node.description,
      `${at}${pointer("description")}`,
      "description",
      0,
      2000,
    )
  }
  if (
    node.origin !== undefined &&
    (typeof node.origin !== "string" || !ORIGINS.includes(node.origin))
  ) {
    sink.error(
      "FE-ENUM",
      "SCHEMA_INVALID",
      `${at}${pointer("origin")}`,
      `origin must be one of ${ORIGINS.join(", ")}.`,
    )
  }
  if (node.tags !== undefined) {
    if (!Array.isArray(node.tags)) {
      sink.error(
        "FE-TYPE",
        "SCHEMA_INVALID",
        `${at}${pointer("tags")}`,
        "tags must be an array.",
      )
    } else {
      if (node.tags.length > 20) {
        sink.error(
          "FE-LENGTH",
          "SCHEMA_INVALID",
          `${at}${pointer("tags")}`,
          "At most 20 tags are allowed.",
        )
      }
      node.tags.forEach((tag, index) => {
        if (typeof tag !== "string" || !TAG_PATTERN.test(tag)) {
          sink.error(
            "FE-TAG",
            "SCHEMA_INVALID",
            `${at}${pointer("tags", index)}`,
            "Tags use lowercase letters, digits and hyphens, up to 32 characters.",
          )
        }
      })
    }
  }
  rejectUnknownKeys(
    sink,
    node,
    ["name", "description", "origin", "tags"],
    at,
    "metadata",
  )
}

function checkDefaults(sink: FindingSink, node: unknown) {
  const at = pointer("defaults")
  if (!isPlainObject(node)) {
    sink.error("FE-TYPE", "SCHEMA_INVALID", at, "defaults must be an object.")
    return
  }
  checkTimeout(
    sink,
    node.timeoutMs,
    `${at}${pointer("timeoutMs")}`,
    "timeoutMs",
  )
  checkTimeout(
    sink,
    node.navigationTimeoutMs,
    `${at}${pointer("navigationTimeoutMs")}`,
    "navigationTimeoutMs",
  )
  rejectUnknownKeys(
    sink,
    node,
    ["timeoutMs", "navigationTimeoutMs"],
    at,
    "defaults",
  )
}

function checkVariables(sink: FindingSink, node: unknown) {
  const at = pointer("variables")
  if (!isPlainObject(node)) {
    sink.error("FE-TYPE", "SCHEMA_INVALID", at, "variables must be an object.")
    return
  }
  const names = Object.keys(node)
  if (names.length > 50) {
    sink.error(
      "FE-LENGTH",
      "SCHEMA_INVALID",
      at,
      "At most 50 variables are allowed.",
    )
  }
  for (const name of names) {
    if (!VARIABLE_NAME_PATTERN.test(name)) {
      sink.error(
        "FE-VARIABLE-NAME",
        "SCHEMA_INVALID",
        `${at}${pointer(name)}`,
        "Variable names start with a letter and use letters, digits or underscores.",
      )
    }
    const value = node[name]
    const type = typeof value
    if (type !== "string" && type !== "number" && type !== "boolean") {
      sink.error(
        "FE-TYPE",
        "SCHEMA_INVALID",
        `${at}${pointer(name)}`,
        "Variable values must be a string, number or boolean.",
      )
    } else if (type === "string" && (value as string).length > 2048) {
      sink.error(
        "FE-LENGTH",
        "SCHEMA_INVALID",
        `${at}${pointer(name)}`,
        "Variable values cannot exceed 2048 characters.",
      )
    }
  }
}

function checkStepArray(
  sink: FindingSink,
  node: unknown,
  field: "steps" | "expectedOutcomes",
  maxItems: number,
  allowedActions: string[],
) {
  const at = pointer(field)
  if (!Array.isArray(node)) {
    sink.error("FE-TYPE", "SCHEMA_INVALID", at, `${field} must be an array.`)
    return
  }
  if (node.length === 0) {
    sink.error(
      "FE-LENGTH",
      "SCHEMA_INVALID",
      at,
      `${field} needs at least one entry.`,
    )
  }
  if (node.length > maxItems) {
    sink.error(
      "FE-LENGTH",
      "SCHEMA_INVALID",
      at,
      `${field} cannot exceed ${maxItems} entries.`,
    )
  }
  node.forEach((step, index) =>
    checkStep(sink, step, `${at}${pointer(index)}`, allowedActions),
  )
}

/** Reports duplicate step ids, which must be unique across the document. */
function checkDuplicateStepIds(
  sink: FindingSink,
  doc: Record<string, unknown>,
) {
  const seen = new Map<string, string>()
  for (const field of ["steps", "expectedOutcomes"] as const) {
    const list = doc[field]
    if (!Array.isArray(list)) continue
    list.forEach((step, index) => {
      if (!isPlainObject(step) || typeof step.id !== "string") return
      const at = `${pointer(field, index)}${pointer("id")}`
      const previous = seen.get(step.id)
      if (previous) {
        sink.error(
          "FE-DUPLICATE-ID",
          "SCHEMA_INVALID",
          at,
          `Step id "${step.id}" is already used at ${previous}.`,
        )
      } else {
        seen.set(step.id, at)
      }
    })
  }
}

/** Validates an already-parsed document against schema 1.0. */
export function validateDefinitionDocument(doc: unknown): LocalValidation {
  const sink = new FindingSink()

  if (!isPlainObject(doc)) {
    sink.error(
      "FE-TYPE",
      "SCHEMA_INVALID",
      "",
      "A Test Definition must be a JSON object.",
    )
    return { valid: false, errors: sink.errors, warnings: sink.warnings }
  }

  const schema11 = doc.schemaVersion === "1.1"
  if (doc.schemaVersion !== "1.0" && !schema11) {
    sink.error(
      "FE-SCHEMA-VERSION",
      "UNSUPPORTED_SCHEMA_VERSION",
      pointer("schemaVersion"),
      'schemaVersion must be "1.0" or "1.1".',
    )
  }

  if (doc.metadata === undefined) {
    sink.error("FE-REQUIRED", "SCHEMA_INVALID", "", "metadata is required.")
  } else {
    checkMetadata(sink, doc.metadata)
  }

  if (doc.defaults !== undefined) checkDefaults(sink, doc.defaults)
  if (doc.variables !== undefined) checkVariables(sink, doc.variables)

  if (doc.steps === undefined) {
    sink.error("FE-REQUIRED", "SCHEMA_INVALID", "", "steps is required.")
  } else {
    checkStepArray(
      sink,
      doc.steps,
      "steps",
      200,
      schema11 ? STEP_ACTIONS_11 : STEP_ACTIONS,
    )
  }

  if (doc.expectedOutcomes === undefined) {
    sink.error(
      "FE-REQUIRED",
      "SCHEMA_INVALID",
      "",
      "expectedOutcomes is required — a definition must assert something.",
    )
  } else {
    checkStepArray(
      sink,
      doc.expectedOutcomes,
      "expectedOutcomes",
      50,
      schema11 ? OUTCOME_ACTIONS_11 : OUTCOME_ACTIONS,
    )
  }

  checkDuplicateStepIds(sink, doc)
  rejectUnknownKeys(sink, doc, ROOT_KEYS, "", "a Test Definition")

  return {
    valid: sink.errors.length === 0,
    errors: sink.errors,
    warnings: sink.warnings,
  }
}

/** Parse outcome, keeping the syntax error separate from schema findings. */
export type ParsedSource = {
  ok: true
  value: unknown
} | {
  ok: false
  finding: SchemaFinding
}

/** Parses source JSON, reporting a syntax error as a finding rather than throwing. */
export function parseDefinitionSource(text: string): ParsedSource {
  if (text.trim() === "") {
    return {
      ok: false,
      finding: {
        ruleId: "FE-JSON-EMPTY",
        code: "SCHEMA_INVALID",
        jsonPointer: "",
        message: "The definition source is empty.",
      },
    }
  }
  try {
    return { ok: true, value: JSON.parse(text) }
  } catch (err) {
    return {
      ok: false,
      finding: {
        ruleId: "FE-JSON-SYNTAX",
        code: "SCHEMA_INVALID",
        jsonPointer: "",
        message:
          err instanceof Error
            ? err.message
            : "The definition source is not valid JSON.",
      },
    }
  }
}

/** Parses and validates in one step — what the editor and create form call. */
export function validateDefinitionSource(text: string): LocalValidation {
  const parsed = parseDefinitionSource(text)
  if (!parsed.ok)
    return { valid: false, errors: [parsed.finding], warnings: [] }
  return validateDefinitionDocument(parsed.value)
}

/** Re-indents valid source with two spaces; returns null when it cannot be parsed. */
export function formatDefinitionSource(text: string): string | null {
  const parsed = parseDefinitionSource(text)
  if (!parsed.ok) return null
  return `${JSON.stringify(parsed.value, null, 2)}\n`
}

/**
 * The starter document for one journey, matching the engine's journey-aware
 * template authority (`JourneyDraftTemplates.templateFor`), so a locally-seeded
 * editor and a server-seeded one agree.
 *
 * UI keeps the historical Schema 1.0 starter; API and MIXED produce valid
 * Schema 1.1 starters with native api.* actions and relative URLs only.
 */
export function starterDefinitionSource(
  name: string,
  journeyType: "UI" | "API" | "MIXED" = "UI",
): string {
  const safeName =
    name
      .replace(/["\r\n]/g, " ")
      .trim()
      .slice(0, 120) || "New Test Definition"
  if (journeyType === "API") {
    return `${JSON.stringify(
      {
        schemaVersion: "1.1",
        metadata: { name: safeName, tags: ["api"] },
        steps: [
          {
            action: "api.request",
            method: "GET",
            url: "/api/v1/health",
            headers: { Accept: "application/json" },
          },
          {
            action: "api.extract",
            jsonPath: "$.status",
            variable: "healthStatus",
          },
        ],
        expectedOutcomes: [
          { action: "api.assertStatus", expected: 200 },
          {
            action: "api.assertHeader",
            header: "Content-Type",
            expected: "application/json",
            matcher: "contains",
          },
          { action: "api.assertJsonPath", path: "$.status", expected: "UP" },
          { action: "api.assertResponseTime", maxDurationMs: 2000 },
        ],
      },
      null,
      2,
    )}\n`
  }
  if (journeyType === "MIXED") {
    return `${JSON.stringify(
      {
        schemaVersion: "1.1",
        metadata: { name: safeName, tags: ["mixed"] },
        steps: [
          {
            action: "api.request",
            method: "POST",
            url: "/api/auth/token",
            body: '{"user":"admin"}',
          },
          {
            action: "api.extract",
            jsonPath: "$.token",
            variable: "sessionToken",
            sensitive: true,
          },
          { action: "ui.navigate", url: "/app/dashboard" },
        ],
        expectedOutcomes: [
          { action: "api.assertStatus", expected: 200 },
          { action: "ui.assertUrl", expected: "/app/dashboard" },
        ],
      },
      null,
      2,
    )}\n`
  }
  return `${JSON.stringify(
    {
      schemaVersion: "1.0",
      metadata: { name: safeName },
      steps: [{ action: "ui.wait", for: "duration", durationMs: 100 }],
      expectedOutcomes: [
        {
          action: "ui.assertVisible",
          locator: { strategy: "css", value: "body" },
        },
      ],
    },
    null,
    2,
  )}\n`
}

/**
 * Resolves the schemaVersion to send when saving a draft.
 *
 * The edited source is authoritative: it must declare a supported version, and
 * the DTO must match it. A stored 1.1 draft is never silently downgraded to 1.0.
 */
export function resolveSaveSchemaVersion(
  doc: unknown,
  storedVersion: string | null,
): {
  ok: true
  schemaVersion: SupportedSchemaVersion
} | {
  ok: false
  message: string
} {
  const declared = isPlainObject(doc) ? doc.schemaVersion : undefined
  if (declared !== "1.0" && declared !== "1.1") {
    return { ok: false, message: 'schemaVersion must be "1.0" or "1.1".' }
  }
  if (storedVersion === "1.1" && declared === "1.0") {
    return {
      ok: false,
      message:
        "Saving would downgrade this draft from schema 1.1 to 1.0. Restore 1.1 to save.",
    }
  }
  return { ok: true, schemaVersion: declared }
}
