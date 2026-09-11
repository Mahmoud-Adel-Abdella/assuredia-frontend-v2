import type {
  DiscoveredElement,
  LocatorCandidate,
  LocatorStrategy,
} from "./discovery"

export type UIActionType = "navigate" | "click" | "type" | "select" | "check" | "wait" | "scroll"

export interface UIAction {
  id: string
  type: UIActionType
  target: string
  value?: string
  expectedResult?: string
}

export interface APIAssertion {
  id: string
  field: string
  operator: "exists" | "eq" | "contains" | "gt"
  value?: string
}

export interface KeyValueEntry {
  id?: string
  key: string
  value: string
}

export interface APIConfig {
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE" | "HEAD" | "OPTIONS"
  endpoint: string
  queryParams?: KeyValueEntry[]
  headers?: KeyValueEntry[]
  body?: string
  expectedStatus?: string | number
  assertions?: APIAssertion[]
}

type Locator = {
  strategy: "role"
  role: string
  name: string
} | {
  strategy: Exclude<LocatorStrategy, "role">
  value: string
}

type SourceDocument = {
  schemaVersion: "1.1"
  metadata: {
    name: string
    description: string
  }
  steps: Array<Record<string, unknown>>
  expectedOutcomes: Array<Record<string, unknown>>
}

function text(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback
}

function metadata(name: string, description: string) {
  return {
    name: text(name).trim().slice(0, 120) || "New Test Definition",
    description: text(description).slice(0, 2000),
  }
}

function source(doc: SourceDocument): string {
  return `${JSON.stringify(doc, null, 2)}\n`
}

function absoluteOrigin(value: string): string | null {
  try {
    const url = new URL(value)
    return url.protocol === "http:" || url.protocol === "https:"
      ? url.origin
      : null
  } catch {
    return null
  }
}

function normalizedRole(role: string): string {
  const normalized = text(role)
    .toLowerCase()
    .replace(/[^a-z]/g, "")
  return normalized || "button"
}

function candidateLocator(
  candidate: LocatorCandidate | undefined,
  element: DiscoveredElement,
): Locator {
  if (candidate?.strategy === "role") {
    return {
      strategy: "role",
      role: normalizedRole(element.role),
      name: text(element.name),
    }
  }
  if (candidate?.value) {
    return { strategy: candidate.strategy, value: candidate.value }
  }
  return {
    strategy: "role",
    role: normalizedRole(element.role),
    name: text(element.name),
  }
}

function targetLocator(target: string): Locator {
  return { strategy: "text", value: text(target) }
}

function elementAction(element: DiscoveredElement): Record<string, unknown> {
  const locator = candidateLocator(element.locatorCandidates?.[0], element)
  const role = normalizedRole(element.role)
  if (["textbox", "searchbox", "spinbutton"].includes(role)) {
    return { action: "ui.fill", locator, value: "" }
  }
  if (["combobox", "listbox"].includes(role)) {
    return { action: "ui.select", locator, value: "" }
  }
  if (["checkbox", "radio", "switch"].includes(role)) {
    return { action: "ui.check", locator }
  }
  if (["button", "link", "menuitem", "option", "tab"].includes(role)) {
    return { action: "ui.click", locator }
  }
  return { action: "ui.hover", locator }
}

export function buildDiscoverySourceJson(
  name: string,
  description: string,
  origin: string,
  selectedElements: DiscoveredElement[],
): string
export function buildDiscoverySourceJson(
  selectedElements: DiscoveredElement[],
  name: string,
  description: string,
  origin: string,
): string
export function buildDiscoverySourceJson(
  nameOrElements: string | DiscoveredElement[],
  descriptionOrName: string,
  originOrDescription: string,
  elementsOrOrigin: DiscoveredElement[] | string,
): string {
  const selectedElements = Array.isArray(nameOrElements)
    ? nameOrElements
    : elementsOrOrigin as DiscoveredElement[]
  const name = Array.isArray(nameOrElements)
    ? descriptionOrName
    : nameOrElements
  const description = Array.isArray(nameOrElements)
    ? originOrDescription
    : descriptionOrName
  const origin = Array.isArray(nameOrElements)
    ? elementsOrOrigin as string
    : originOrDescription
  const navigationUrl = absoluteOrigin(origin) ?? "/"
  return source({
    schemaVersion: "1.1",
    metadata: metadata(name, description),
    steps: [
      { action: "ui.navigate", url: navigationUrl },
      ...selectedElements.map(elementAction),
    ],
    expectedOutcomes: [{ action: "ui.assertUrl", expected: navigationUrl }],
  })
}

function uiStep(action: UIAction): Record<string, unknown> {
  const locator = targetLocator(action.target)
  switch (action.type) {
    case "navigate":
      return {
        action: "ui.navigate",
        url:
          /^https?:\/\//.test(action.target) || action.target.startsWith("/")
            ? action.target
            : "/",
      }
    case "click":
      return { action: "ui.click", locator }
    case "type":
      return { action: "ui.fill", locator, value: action.value ?? "" }
    case "select":
      return { action: "ui.select", locator, value: action.value ?? "" }
    case "check":
      return { action: "ui.check", locator }
    case "wait": {
      const duration = Number(action.value)
      return {
        action: "ui.wait",
        for: "duration",
        durationMs:
          Number.isFinite(duration) && duration >= 100 && duration <= 30_000
            ? Math.floor(duration)
            : 100,
      }
    }
    case "scroll":
      return { action: "ui.hover", locator }
  }
}

function uiOutcome(action: UIAction): Record<string, unknown> | null {
  if (!action.expectedResult) return null
  return {
    action: "ui.assertText",
    locator: targetLocator(action.target),
    expected: action.expectedResult,
  }
}

export function buildUIEditorSourceJson(
  name: string,
  description: string,
  actions: UIAction[],
): string
export function buildUIEditorSourceJson(
  actions: UIAction[],
  name: string,
  description: string,
): string
export function buildUIEditorSourceJson(
  nameOrActions: string | UIAction[],
  descriptionOrName: string,
  actionsOrDescription: UIAction[] | string,
): string {
  const actions = Array.isArray(nameOrActions)
    ? nameOrActions
    : actionsOrDescription as UIAction[]
  const name = Array.isArray(nameOrActions) ? descriptionOrName : nameOrActions
  const description = Array.isArray(nameOrActions)
    ? actionsOrDescription as string
    : descriptionOrName
  const expectedOutcomes = actions
    .map(uiOutcome)
    .filter((outcome): outcome is Record<string, unknown> => outcome !== null)
  return source({
    schemaVersion: "1.1",
    metadata: metadata(name, description),
    steps:
      actions.length > 0
        ? actions.map(uiStep)
        : [{ action: "ui.wait", for: "duration", durationMs: 100 }],
    expectedOutcomes:
      expectedOutcomes.length > 0
        ? expectedOutcomes
        : [{ action: "ui.assertUrl", expected: "/" }],
  })
}

function entries(
  values: KeyValueEntry[] | undefined,
): Record<string, string> | undefined {
  const pairs = (values ?? [])
    .filter(({ key }) => key.trim() !== "")
    .map(({ key, value }) => [key.trim(), value] as const)
  return pairs.length > 0 ? Object.fromEntries(pairs) : undefined
}

function apiMatcher(operator: APIAssertion["operator"]): string {
  if (operator === "contains") return "contains"
  if (operator === "gt") return "greaterThan"
  if (operator === "exists") return "exists"
  return "equals"
}

function assertionValue(value: string | undefined): string | number | boolean {
  if (value === "true") return true
  if (value === "false") return false
  if (
    value !== undefined &&
    value.trim() !== "" &&
    Number.isFinite(Number(value))
  ) {
    return Number(value)
  }
  return value ?? ""
}

export function buildAPIEditorSourceJson(
  name: string,
  description: string,
  config: APIConfig,
): string
export function buildAPIEditorSourceJson(
  config: APIConfig,
  name: string,
  description: string,
): string
export function buildAPIEditorSourceJson(
  nameOrConfig: string | APIConfig,
  descriptionOrName: string,
  configOrDescription: APIConfig | string,
): string {
  const config =
    typeof nameOrConfig === "string"
      ? configOrDescription as APIConfig
      : nameOrConfig
  const name =
    typeof nameOrConfig === "string" ? nameOrConfig : descriptionOrName
  const description =
    typeof nameOrConfig === "string"
      ? descriptionOrName
      : configOrDescription as string
  const endpoint = text(config.endpoint).trim()
  const request: Record<string, unknown> = {
    action: "api.request",
    method: config.method,
    url:
      endpoint.startsWith("/") || /^https?:\/\//.test(endpoint)
        ? endpoint
        : `/${endpoint}`,
  }
  const headers = entries(config.headers)
  const query = entries(config.queryParams)
  if (headers) request.headers = headers
  if (query) request.query = query
  if (config.body?.trim()) request.body = config.body

  const expectedStatus = Number(config.expectedStatus ?? 200)
  const outcomes: Array<Record<string, unknown>> = [
    {
      action: "api.assertStatus",
      expected:
        Number.isInteger(expectedStatus) &&
        expectedStatus >= 100 &&
        expectedStatus <= 599
          ? expectedStatus
          : 200,
    },
  ]
  for (const assertion of config.assertions ?? []) {
    const field = assertion.field.trim()
    const path = field.startsWith("$")
      ? field
      : `$.${field.replace(/[^a-zA-Z0-9_.-]/g, "")}`
    if (path === "$.") continue
    const outcome: Record<string, unknown> = {
      action: "api.assertJsonPath",
      path,
      matcher: apiMatcher(assertion.operator),
    }
    if (assertion.operator !== "exists") {
      outcome.expected = assertionValue(assertion.value)
    }
    outcomes.push(outcome)
  }
  if (outcomes.length === 1) {
    outcomes.push({
      action: "api.assertJsonPath",
      path: "$",
      matcher: "exists",
    })
  }

  return source({
    schemaVersion: "1.1",
    metadata: metadata(name, description),
    steps: [request],
    expectedOutcomes: outcomes,
  })
}
