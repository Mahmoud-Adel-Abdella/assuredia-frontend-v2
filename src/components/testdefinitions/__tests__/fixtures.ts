/**
 * Fixtures shaped exactly like the engine's responses.
 *
 * Values follow `TestDefinitionController` and `TestDefinitionLifecycleService`:
 * the list and version routes are camelCase records, the run route is the
 * `test_runs` row in snake_case with camelCase `stepResults`/`artifacts`, and
 * `timestamp` is epoch millis rather than an ISO string. Nothing here is real
 * customer data — names, ids and hosts are invented.
 */

import type {
  TestDefinitionDetails,
  TestDefinitionExecutionResult,
  TestDefinitionListItem,
  TestDefinitionListResponse,
  TestDefinitionRunDetails,
  TestDefinitionStatus,
  TestDefinitionValidationReport,
  TestDefinitionVersion,
} from "../../../lib/api"

export const CLIENT_ID = 7
export const CLIENT_NAME = "Northwind Sandbox"
export const DEFINITION_ID = 42
export const VERSION_ID = 91
export const FLOW_ID = 300
export const RUN_ID = 512

export const VALID_SOURCE = `${JSON.stringify(
  {
    schemaVersion: "1.0",
    metadata: { name: "Checkout happy path" },
    steps: [
      { action: "ui.navigate", url: "/checkout" },
      { action: "ui.fill", locator: { strategy: "testId", value: "email" }, value: "buyer@example.test" },
      { action: "ui.click", locator: { strategy: "role", role: "button", name: "Pay" } },
    ],
    expectedOutcomes: [
      { action: "ui.assertText", locator: { strategy: "testId", value: "receipt" }, expected: "Thank you" },
    ],
  },
  null,
  2,
)}\n`

export function listItem(overrides: Partial<TestDefinitionListItem> = {}): TestDefinitionListItem {
  return {
    id: DEFINITION_ID,
    clientId: CLIENT_ID,
    name: "Checkout happy path",
    description: "Proves a card purchase completes",
    flowId: FLOW_ID,
    assetRequestId: null,
    isArchived: false,
    createdAt: "2026-08-01T09:00:00Z",
    updatedAt: "2026-08-30T11:15:00Z",
    ...overrides,
  }
}

export function listResponse(
  items: TestDefinitionListItem[],
  overrides: Partial<TestDefinitionListResponse> = {},
): TestDefinitionListResponse {
  return { items, total: items.length, limit: 25, offset: 0, ...overrides }
}

export function versionSummary(
  status: TestDefinitionStatus,
  overrides: Partial<TestDefinitionDetails["versions"][number]> = {},
) {
  return {
    id: VERSION_ID,
    versionNumber: 1,
    schemaVersion: "1.0",
    status,
    versionLock: 1,
    createdAt: "2026-08-01T09:00:00Z",
    validatedAt: null,
    approvedAt: null,
    readyAt: null,
    archivedAt: null,
    updatedAt: "2026-08-30T11:15:00Z",
    ...overrides,
  }
}

export function details(
  status: TestDefinitionStatus,
  overrides: Partial<TestDefinitionDetails> = {},
): TestDefinitionDetails {
  return {
    id: DEFINITION_ID,
    clientId: CLIENT_ID,
    name: "Checkout happy path",
    description: "Proves a card purchase completes",
    flowId: FLOW_ID,
    assetRequestId: null,
    isArchived: status === "ARCHIVED",
    createdAt: "2026-08-01T09:00:00Z",
    updatedAt: "2026-08-30T11:15:00Z",
    versions: [versionSummary(status)],
    ...overrides,
  }
}

export function version(
  status: TestDefinitionStatus,
  overrides: Partial<TestDefinitionVersion> = {},
): TestDefinitionVersion {
  return {
    id: VERSION_ID,
    testDefinitionId: DEFINITION_ID,
    versionNumber: 1,
    schemaVersion: "1.0",
    sourceJson: VALID_SOURCE,
    status,
    validationReportJson: null,
    versionLock: 1,
    createdBy: 11,
    validatedBy: null,
    approvedBy: null,
    provingRunId: null,
    createdAt: "2026-08-01T09:00:00Z",
    validatedAt: null,
    approvedAt: null,
    readyAt: null,
    archivedAt: null,
    updatedAt: "2026-08-30T11:15:00Z",
    ...overrides,
  }
}

export function validReport(): TestDefinitionValidationReport {
  return { valid: true, errors: [], warnings: [], schemaVersion: "1.0", validatorVersion: "1.0.0" }
}

export function invalidReport(): TestDefinitionValidationReport {
  return {
    valid: false,
    errors: [
      {
        ruleId: "V-S-06",
        code: "SCHEMA_INVALID",
        jsonPointer: "/steps/0/url",
        message: "url is required for ui.navigate",
      },
    ],
    warnings: [],
    schemaVersion: "1.0",
    validatorVersion: "1.0.0",
  }
}

export function executionResult(
  purpose: "TRIAL" | "PROVING",
  overrides: Partial<TestDefinitionExecutionResult> = {},
): TestDefinitionExecutionResult {
  return {
    runId: RUN_ID,
    definitionId: DEFINITION_ID,
    versionId: VERSION_ID,
    versionNumber: 1,
    executionPurpose: purpose,
    status: "PASSED",
    terminatingReasonCode: null,
    stepResults: [
      {
        stepIndex: 0,
        stepAddress: "steps[0]",
        opcode: "UI_NAVIGATE",
        status: "PASSED",
        reasonCode: null,
        sanitizedMessage: null,
        expectedValue: null,
        actualValue: null,
        effectiveTimeoutMs: 10000,
        elapsedMs: 420,
        screenshotPath: null,
      },
    ],
    outcomeResults: [
      {
        stepIndex: 0,
        stepAddress: "expectedOutcomes[0]",
        opcode: "UI_ASSERT_TEXT",
        status: "PASSED",
        reasonCode: null,
        sanitizedMessage: null,
        expectedValue: "Thank you",
        actualValue: "Thank you",
        effectiveTimeoutMs: 10000,
        elapsedMs: 88,
        screenshotPath: null,
      },
    ],
    totalElapsedMs: 508,
    ...overrides,
  }
}

export function runDetails(overrides: Partial<TestDefinitionRunDetails> = {}): TestDefinitionRunDetails {
  return {
    id: RUN_ID,
    run_id: "run-def-abc123",
    client_id: CLIENT_ID,
    flow_id: FLOW_ID,
    status: "PASSED",
    total: 2,
    passed: 2,
    failed: 0,
    skipped: 0,
    duration_seconds: 1,
    timestamp: Date.UTC(2026, 7, 30, 11, 20, 0),
    browser: "CHROMIUM",
    env: "ENGINE_WORKER",
    error_message: null,
    implementation_type: "TEST_DEFINITION",
    execution_purpose: "TRIAL",
    test_definition_id: DEFINITION_ID,
    test_definition_version_id: VERSION_ID,
    definition_version_number: 1,
    stepResults: [
      {
        id: 1,
        testRunId: RUN_ID,
        stepIndex: 0,
        stepIdentifier: "steps[0]",
        actionType: "UI_NAVIGATE",
        status: "PASSED",
        reasonCode: null,
        message: null,
        durationMs: 420,
        createdAt: "2026-08-30T11:20:01Z",
      },
    ],
    artifacts: [
      {
        id: 5,
        testRunId: RUN_ID,
        stepIndex: 0,
        artifactType: "SCREENSHOT",
        artifactName: "step-0.png",
        // The engine's intended redaction of this field is a no-op, so a real
        // response carries the storage reference. The UI must never render it.
        filePath: `${CLIENT_ID}/run-${RUN_ID}/step-0.png`,
        fileSizeBytes: 20481,
        contentType: "image/png",
        createdAt: "2026-08-30T11:20:01Z",
      },
    ],
    ...overrides,
  }
}

/** `GET /dashboard-api/clients/{id}` — only the fields the create form reads. */
export function clientDetailsResponse() {
  return {
    client: { id: CLIENT_ID, client_name: CLIENT_NAME, browser: "CHROMIUM", device_type: null, timezone: "UTC" },
    flows: [
      {
        id: FLOW_ID,
        flow_name: "Checkout",
        is_active: true,
        scheduler_id: null,
        cron_expression: null,
        scheduler_active: null,
        webhook_url: null,
        only_tests: null,
        next_run_at: null,
        last_run_at: null,
        is_running: null,
      },
    ],
  }
}

export const PATHS = {
  list: `/dashboard-api/clients/${CLIENT_ID}/test-definitions`,
  definition: `/dashboard-api/clients/${CLIENT_ID}/test-definitions/${DEFINITION_ID}`,
  version: `/dashboard-api/clients/${CLIENT_ID}/test-definitions/${DEFINITION_ID}/versions/${VERSION_ID}`,
  run: `/dashboard-api/clients/${CLIENT_ID}/test-definitions/${DEFINITION_ID}/runs/${RUN_ID}`,
}
