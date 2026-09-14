/**
 * In-memory Assuredia engine for the Test Definitions end-to-end test.
 *
 * It implements the routes the dashboard actually calls, with the same shapes and
 * the same lifecycle guards as `TestDefinitionController` /
 * `TestDefinitionLifecycleService`:
 *
 *   - version content is mutable only in DRAFT, under an optimistic `versionLock`;
 *   - validation moves DRAFT to VALIDATED only when the document is valid;
 *   - a trial needs VALIDATED or APPROVED plus a bound flow;
 *   - approve requires VALIDATED, proving requires APPROVED;
 *   - READY is reached only by a PASSED proving run, never by a direct call;
 *   - archive requires READY and freezes the aggregate;
 *   - `Idempotency-Key` replays a completed trial/proving as the stored run,
 *     which is a *different response shape* from a fresh execution.
 *
 * It is a test double, not a second implementation of the product: it holds no
 * credentials, listens on the loopback interface only, and nothing it serves ever
 * leaves the machine.
 */

import { createServer } from "node:http"

const PORT = Number(process.env.MOCK_ENGINE_PORT ?? 8099)
const ORIGIN = process.env.MOCK_ENGINE_ALLOW_ORIGIN ?? "http://127.0.0.1:3100"

/** The one token the spec injects. Any other value is rejected as a real engine would. */
const SESSION_TOKEN = "e2e-session-token"

const state = {
  nextDefinitionId: 1,
  nextVersionId: 1,
  nextRunId: 1,
  nextArtifactId: 1,
  nextCreationId: 1,
  definitions: new Map(),
  versions: new Map(),
  runs: new Map(),
  idempotency: new Map(),
  creations: new Map(),
  creationIdempotency: new Map(),
  discoveryMode: "completed",
  discoveryRequests: 0,
  plannerMode: "plan",
  plannerRequests: 0,
  plans: new Map(),
  confirmKeys: new Map(),
  nextPlanId: 1,
  nextConfirmDefinitionId: 501,
  /** Set by the spec to make the next proving run fail instead of pass. */
  nextExecutionStatus: "PASSED",
  /** PR10C.5 credentials: rows keyed by id; mirrors the frozen contract. */
  credentials: new Map(),
  nextCredentialId: 1,
  /** When set, every credentials endpoint answers the 503 migration window. */
  credentialsUnavailable: false,
  /** Requests recording the credential the planner received (spec assertions). */
  lastPlannerCredentialId: undefined,
  /** Audit F-02: count of credential CREATE POSTs (double-click guard). */
  credentialCreateRequests: 0,
  /** Audit F-01: the description of the last created draft (review/submit match). */
  lastDraftDescription: null,
}

const CLIENT = { id: 7, client_name: "northwind sandbox" }
const FLOW = { id: 300, flow_name: "Checkout" }

function nowIso() {
  return new Date().toISOString()
}

/* ---- Secure Credentials (PR10C.5) ----------------------------------- */
/** The fake's plaintext secret for the seeded Default row — never served. */
const DEFAULT_CREDENTIAL_SECRET = "mock-secret"

/**
 * Seeds the fixture set every reset. Mirrors what the real engine serves
 * after migration-018's backfill: one "Default" USER_ACCOUNT row (usable,
 * masked username), one API_SERVICE row, and one incomplete row so the UI's
 * three statuses all render. The secret is stored only in the fake's head;
 * views never expose it.
 */
function seedCredentials() {
  const seeded = [
    {
      name: "Default",
      type: "USER_ACCOUNT",
      status: "CONFIGURED",
      username: "customer",
      hasSecret: true,
    },
    {
      name: "Shop API",
      type: "API_SERVICE",
      status: "CONFIGURED",
      username: "svc-shop",
      hasSecret: true,
    },
    {
      name: "Staging Login",
      type: "USER_ACCOUNT",
      status: "NEEDS_SETUP",
      username: "staging.user",
      hasSecret: false,
    },
  ]
  for (const row of seeded) {
    const id = state.nextCredentialId++
    state.credentials.set(id, {
      id,
      name: row.name,
      type: row.type,
      status: row.status,
      username: row.username,
      hasSecret: row.hasSecret,
      lastUsedAt: null,
      useCount: 0,
    })
  }
}

/** The wire CredentialView — metadata only; the secret never crosses. */
function credentialView(row) {
  const masked =
    row.username == null || row.username === ""
      ? null
      : row.username.length <= 3
        ? "***"
        : `${row.username.slice(0, 3)}***`
  return {
    id: row.id,
    name: row.name,
    type: row.type,
    status: row.status,
    usernameMasked: masked,
    lastUsedAt: row.lastUsedAt,
    useCount: row.useCount,
  }
}

function json(res, status, body) {
  const payload = body === undefined ? "" : JSON.stringify(body)
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": ORIGIN,
    "Access-Control-Allow-Credentials": "true",
    "Content-Length": Buffer.byteLength(payload),
  })
  res.end(payload)
}

function error(res, status, message) {
  json(res, status, { error: message })
}

function validateDocument(sourceJson) {
  let doc
  try {
    doc = JSON.parse(sourceJson)
  } catch {
    return {
      valid: false,
      errors: [
        {
          ruleId: "V-S-01",
          code: "SCHEMA_INVALID",
          jsonPointer: "",
          message: "Definition source is not valid JSON",
        },
      ],
      warnings: [],
      schemaVersion: null,
      validatorVersion: "1.0.0",
    }
  }
  const errors = []
  if (doc?.schemaVersion !== "1.0") {
    errors.push({
      ruleId: "V-S-02",
      code: "UNSUPPORTED_SCHEMA_VERSION",
      jsonPointer: "/schemaVersion",
      message: "Only schema version 1.x is supported",
    })
  }
  if (!doc?.metadata?.name) {
    errors.push({
      ruleId: "V-S-03",
      code: "SCHEMA_INVALID",
      jsonPointer: "/metadata/name",
      message: "metadata.name is required",
    })
  }
  if (!Array.isArray(doc?.steps) || doc.steps.length === 0) {
    errors.push({
      ruleId: "V-S-04",
      code: "SCHEMA_INVALID",
      jsonPointer: "/steps",
      message: "steps must contain at least one step",
    })
  }
  if (
    !Array.isArray(doc?.expectedOutcomes) ||
    doc.expectedOutcomes.length === 0
  ) {
    errors.push({
      ruleId: "V-S-05",
      code: "SCHEMA_INVALID",
      jsonPointer: "/expectedOutcomes",
      message: "expectedOutcomes must contain at least one assertion",
    })
  }
  ;(doc?.steps ?? []).forEach((step, index) => {
    if (step?.action === "ui.navigate" && !step.url) {
      errors.push({
        ruleId: "V-S-06",
        code: "SCHEMA_INVALID",
        jsonPointer: `/steps/${index}/url`,
        message: "url is required for ui.navigate",
      })
    }
  })
  return {
    valid: errors.length === 0,
    errors,
    warnings: [],
    schemaVersion: doc?.schemaVersion ?? null,
    validatorVersion: "1.0.0",
  }
}

function versionSummary(version) {
  return {
    id: version.id,
    versionNumber: version.versionNumber,
    schemaVersion: version.schemaVersion,
    status: version.status,
    versionLock: version.versionLock,
    createdAt: version.createdAt,
    validatedAt: version.validatedAt,
    approvedAt: version.approvedAt,
    readyAt: version.readyAt,
    archivedAt: version.archivedAt,
    updatedAt: version.updatedAt,
  }
}

function versionsOf(definitionId) {
  return [...state.versions.values()]
    .filter((v) => v.testDefinitionId === definitionId)
    .sort((a, b) => b.versionNumber - a.versionNumber)
}

function definitionRow(definition) {
  return {
    id: definition.id,
    clientId: definition.clientId,
    name: definition.name,
    description: definition.description,
    flowId: definition.flowId,
    assetRequestId: definition.assetRequestId,
    isArchived: definition.isArchived,
    createdAt: definition.createdAt,
    updatedAt: definition.updatedAt,
  }
}

/** The persisted-run shape: the `test_runs` row plus camelCase children. */
function runDetailsBody(run) {
  return {
    id: run.id,
    run_id: run.externalId,
    client_id: CLIENT.id,
    flow_id: FLOW.id,
    status: run.status,
    total: run.steps.length,
    passed: run.steps.filter((s) => s.status === "PASSED").length,
    failed: run.steps.filter(
      (s) => s.status === "FAILED" || s.status === "ERROR",
    ).length,
    skipped: 0,
    duration_seconds: 1,
    timestamp: run.timestamp,
    browser: "CHROMIUM",
    env: "ENGINE_WORKER",
    error_message: null,
    implementation_type: "TEST_DEFINITION",
    execution_purpose: run.purpose,
    test_definition_id: run.definitionId,
    test_definition_version_id: run.versionId,
    definition_version_number: run.versionNumber,
    stepResults: run.steps.map((step, index) => ({
      id: index + 1,
      testRunId: run.id,
      stepIndex: step.stepIndex,
      stepIdentifier: step.stepAddress,
      actionType: step.opcode,
      status: step.status,
      reasonCode: step.reasonCode,
      message: step.sanitizedMessage,
      durationMs: step.elapsedMs,
      createdAt: run.createdAt,
    })),
    artifacts: run.artifacts,
  }
}

function executeRun(definition, version, purpose) {
  const status = state.nextExecutionStatus
  const failing = status !== "PASSED"
  const steps = [
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
      elapsedMs: 310,
      screenshotPath: null,
    },
  ]
  const outcomes = [
    {
      stepIndex: 0,
      stepAddress: "expectedOutcomes[0]",
      opcode: "UI_ASSERT_TEXT",
      status: failing ? "FAILED" : "PASSED",
      reasonCode: failing ? "ASSERTION_FAILED" : null,
      sanitizedMessage: failing
        ? 'Expected "Thank you" but found "Payment declined"'
        : null,
      expectedValue: "Thank you",
      actualValue: failing ? "Payment declined" : "Thank you",
      effectiveTimeoutMs: 10000,
      elapsedMs: 95,
      screenshotPath: "step-0.png",
    },
  ]

  const run = {
    id: state.nextRunId++,
    externalId: `run-def-e2e-${state.nextRunId}`,
    definitionId: definition.id,
    versionId: version.id,
    versionNumber: version.versionNumber,
    purpose,
    status,
    steps: [...steps, ...outcomes],
    timestamp: Date.now(),
    createdAt: nowIso(),
    artifacts: [
      {
        id: state.nextArtifactId++,
        testRunId: state.nextRunId,
        stepIndex: 0,
        artifactType: "SCREENSHOT",
        artifactName: "step-0.png",
        filePath: `${CLIENT.id}/run-${state.nextRunId}/step-0.png`,
        fileSizeBytes: 18342,
        contentType: "image/png",
        createdAt: nowIso(),
      },
    ],
  }
  state.runs.set(run.id, run)

  let becameReady = false
  if (purpose === "PROVING" && status === "PASSED") {
    version.status = "READY"
    version.readyAt = nowIso()
    version.provingRunId = run.id
    version.updatedAt = nowIso()
    becameReady = true
  }

  return {
    run,
    becameReady,
    freshBody: {
      runId: run.id,
      definitionId: definition.id,
      versionId: version.id,
      versionNumber: version.versionNumber,
      executionPurpose: purpose,
      status,
      terminatingReasonCode: failing ? "ASSERTION_FAILED" : null,
      stepResults: steps,
      outcomeResults: outcomes,
      totalElapsedMs: 405,
    },
  }
}

/**
 * Trial and proving share this path. The two-phase idempotency check mirrors the
 * engine: a completed key replays the stored run *before* any lifecycle guard is
 * applied, so a replay still succeeds after the version has moved on.
 */
function handleExecution(res, definition, version, purpose, idempotencyKey) {
  const requestHash = `${version.sourceJson}:${version.versionNumber}`
  const recordKey = idempotencyKey ? `${purpose}:${idempotencyKey}` : null

  if (recordKey && state.idempotency.has(recordKey)) {
    const record = state.idempotency.get(recordKey)
    if (record.requestHash !== requestHash || record.versionId !== version.id) {
      return error(
        res,
        409,
        "Idempotency key reused with mismatched version or request parameters",
      )
    }
    if (record.status === "IN_PROGRESS") {
      return error(
        res,
        409,
        "A previous request with this idempotency key is currently in progress",
      )
    }
    return json(res, 200, runDetailsBody(state.runs.get(record.runId)))
  }

  if (definition.isArchived) {
    return error(
      res,
      409,
      `Test Definition is archived; ${
        purpose === "TRIAL" ? "run trials" : "run proving"
      } is not permitted`,
    )
  }
  if (
    purpose === "TRIAL" &&
    version.status !== "VALIDATED" &&
    version.status !== "APPROVED"
  ) {
    return error(
      res,
      409,
      `Trial runs are only permitted on VALIDATED or APPROVED versions (current: ${version.status})`,
    )
  }
  if (purpose === "PROVING" && version.status !== "APPROVED") {
    return error(
      res,
      409,
      `Proving runs are only allowed for APPROVED versions (current: ${version.status})`,
    )
  }
  if (definition.flowId == null) {
    return error(
      res,
      409,
      `Test Definition must be linked to a Flow before ${
        purpose === "TRIAL" ? "run trials" : "run proving"
      }`,
    )
  }

  const executed = executeRun(definition, version, purpose)
  if (recordKey) {
    state.idempotency.set(recordKey, {
      status: "COMPLETED",
      runId: executed.run.id,
      requestHash,
      versionId: version.id,
    })
  }

  const body = executed.freshBody
  if (purpose === "PROVING") {
    body.becameReady = executed.becameReady
    body.currentStatus = executed.becameReady ? "READY" : "APPROVED"
  }
  return json(res, 200, body)
}

async function readBody(req) {
  const chunks = []
  for await (const chunk of req) chunks.push(chunk)
  if (chunks.length === 0) return null
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"))
  } catch {
    return null
  }
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", `http://127.0.0.1:${PORT}`)
  const path = url.pathname
  const method = req.method ?? "GET"

  if (method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": ORIGIN,
      "Access-Control-Allow-Credentials": "true",
      "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
      // The engine's own CORS layer must allow this for trial/proving to work at
      // all from a browser; PR 5 adds it there.
      "Access-Control-Allow-Headers":
        "Authorization, Content-Type, Accept, Origin, Idempotency-Key",
      "Access-Control-Expose-Headers":
        "Authorization, Content-Type, Content-Disposition",
      "Access-Control-Max-Age": "600",
    })
    res.end()
    return
  }

  /* ---- Test-only control plane (never part of the product contract) ---- */
  if (path === "/__test__/health") {
    return json(res, 200, { ok: true })
  }
  if (path === "/__test__/execution-status" && method === "POST") {
    const body = await readBody(req)
    state.nextExecutionStatus = body?.status === "FAILED" ? "FAILED" : "PASSED"
    return json(res, 200, { status: state.nextExecutionStatus })
  }
  if (path === "/__test__/discovery-mode" && method === "POST") {
    const body = await readBody(req)
    const allowed = ["completed", "empty", "truncated", "failed", "unavailable"]
    state.discoveryMode = allowed.includes(body?.mode) ? body.mode : "completed"
    return json(res, 200, { mode: state.discoveryMode })
  }
  if (path === "/__test__/discovery-count" && method === "GET") {
    return json(res, 200, { count: state.discoveryRequests })
  }
  if (path === "/__test__/planner-mode" && method === "POST") {
    const body = await readBody(req)
    const allowed = [
      "plan",
      "clarification",
      "invalid-shape",
      "failed:AI_UNAVAILABLE",
      "failed:AI_TIMEOUT",
      "failed:CREDENTIAL_REQUIRED",
      "failed:CREDENTIAL_UNAVAILABLE",
      "failed:UNSUPPORTED_SCENARIO",
      "failed:INTENT_AMBIGUOUS",
    ]
    state.plannerMode =
      typeof body?.mode === "string" && allowed.includes(body.mode)
        ? body.mode
        : "plan"
    return json(res, 200, { mode: state.plannerMode })
  }
  if (path === "/__test__/reset" && method === "POST") {
    state.definitions.clear()
    state.versions.clear()
    state.runs.clear()
    state.idempotency.clear()
    state.creations.clear()
    state.creationIdempotency.clear()
    state.nextDefinitionId = 1
    state.nextVersionId = 1
    state.nextRunId = 1
    state.nextArtifactId = 1
    state.nextCreationId = 1
    state.nextExecutionStatus = "PASSED"
    state.discoveryMode = "completed"
    state.discoveryRequests = 0
    state.plannerMode = "plan"
    state.plannerRequests = 0
    state.plans.clear()
    state.confirmKeys.clear()
    state.nextPlanId = 1
    state.nextConfirmDefinitionId = 501
    state.credentials.clear()
    state.nextCredentialId = 1
    state.credentialsUnavailable = false
    state.lastPlannerCredentialId = undefined
    state.credentialCreateRequests = 0
    state.lastDraftDescription = null
    seedCredentials()
    return json(res, 200, { ok: true })
  }

  /* ---- Auth ---------------------------------------------------------- */
  const auth = req.headers.authorization
  if (
    path.startsWith("/dashboard-api/") &&
    auth !== `Bearer ${SESSION_TOKEN}`
  ) {
    return error(res, 401, "Token is invalid or expired — log in again")
  }

  if (path === "/dashboard-api/auth/me") {
    // An ADMIN identity has no tenant scope, exactly like the real engine.
    // Interactive visual testing sets MOCK_ENGINE_IDENTITY=client to receive a
    // tenant-scoped identity instead; the E2E specs never set it.
    if (process.env.MOCK_ENGINE_IDENTITY === "client") {
      return json(res, 200, {
        id: 2,
        userId: 2,
        email: "qa@example.test",
        role: "CLIENT",
        clientId: CLIENT.id,
        clientName: CLIENT.client_name,
        name: "QA Engineer",
      })
    }
    return json(res, 200, {
      id: 1,
      userId: 1,
      email: "platform.admin@example.test",
      role: "ADMIN",
      clientId: null,
      clientName: null,
      name: "Platform Admin",
    })
  }

  /* ---- Client environments ------------------------------------------- */
  if (path === "/dashboard-api/clients" && method === "GET") {
    return json(res, 200, [
      {
        id: CLIENT.id,
        client_name: CLIENT.client_name,
        base_url: "https://shop.example.test",
        browser: "CHROMIUM",
        headless: true,
        is_active: true,
        ai_active: false,
        chat_id: null,
        notify_policy: "on_failure",
        timeout_seconds: 30,
        retry_count: 0,
        run_timeout_minutes: 30,
        device_type: "DESKTOP",
        viewport_width: 1280,
        viewport_height: 800,
        device_emulation: null,
        timezone: "UTC",
        created_at: "2026-01-01T00:00:00Z",
        last_run_status: null,
        last_run_timestamp: null,
      },
    ])
  }

  if (path === `/dashboard-api/clients/${CLIENT.id}` && method === "GET") {
    return json(res, 200, {
      client: {
        id: CLIENT.id,
        client_name: CLIENT.client_name,
        base_url: "https://shop.example.test",
        browser: "CHROMIUM",
        device_type: "DESKTOP",
        timezone: "UTC",
        site_username: "customer",
        site_password_set: true,
      },
      flows: [
        {
          id: FLOW.id,
          flow_name: FLOW.flow_name,
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
    })
  }

  /* ---- UI Discovery (PR10B synchronous contract) ---------------------- */
  if (
    path.startsWith("/dashboard-api/clients/") &&
    path.endsWith("/discovery") &&
    method === "POST"
  ) {
    if (path !== `/dashboard-api/clients/${CLIENT.id}/discovery`)
      return error(res, 404, "This client does not exist")
    state.discoveryRequests += 1
    const body = await readBody(req)
    if (body == null || Object.keys(body).length !== 0)
      return error(res, 400, "Discovery request must be empty")
    if (state.discoveryMode === "unavailable")
      return error(res, 503, "Discovery is not configured on this deployment")
    if (state.discoveryMode === "failed") {
      return json(res, 200, {
        sessionId: `discovery-${state.discoveryRequests}`,
        status: "FAILED",
        origin: "https://shop.example.test:443",
        failureReason: "mcp_navigation_failed",
      })
    }
    const elements =
      state.discoveryMode === "empty"
        ? []
        : [
            {
              elementId: "e1",
              role: "button",
              name: "Add to cart",
              attributes: { ref: "e1", type: "button" },
              locatorCandidates: [
                {
                  strategy: "role",
                  value: "button[name=Add to cart]",
                  strength: "STRONG",
                  state: "UNVERIFIED",
                },
              ],
            },
            {
              elementId: "e2",
              role: "textbox",
              name: "Search products",
              attributes: { ref: "e2", placeholder: "Search" },
              locatorCandidates: [
                {
                  strategy: "placeholder",
                  value: "Search",
                  strength: "MEDIUM",
                  state: "UNVERIFIED",
                },
              ],
            },
          ]
    return json(res, 200, {
      sessionId: `discovery-${state.discoveryRequests}`,
      status: "COMPLETED",
      origin: "https://shop.example.test:443",
      truncated: state.discoveryMode === "truncated",
      pages: [
        {
          url: "https://shop.example.test:443/",
          title: "Northwind Store",
          elements,
        },
      ],
    })
  }

  /* ---- Test Creation Requests (PR10A mock) --------------------------- */
  function creationRow(c) {
    return { ...c }
  }
  function createCreation({ journeyType, title, description, flowId, method }) {
    const now = nowIso()
    const row = {
      id: state.nextCreationId++,
      clientId: CLIENT.id,
      flowId: flowId ?? null,
      journeyType,
      creationMethod: method,
      status: method === "MANUAL_EDITOR" ? "DRAFT_CREATED" : "SUBMITTED",
      requestedBy: 1,
      assignedTo: null,
      definitionId: null,
      title,
      description: description ?? null,
      decisionReason: null,
      failureCode: null,
      failureMessage: null,
      versionLock: 1,
      createdAt: now,
      updatedAt: now,
      completedAt: null,
    }
    state.creations.set(row.id, row)
    return row
  }
  const creationRoot = `/dashboard-api/clients/${CLIENT.id}/test-creation-requests`
  if (
    path.startsWith("/dashboard-api/clients/") &&
    path.includes("/test-creation-requests")
  ) {
    if (!path.startsWith(creationRoot))
      return error(res, 404, "This client does not exist")
    const rest = path.slice(creationRoot.length).replace(/^\//, "")
    const segments = rest === "" ? [] : rest.split("/")
    if (segments.length === 0 && method === "GET") {
      const status = (url.searchParams.get("status") ?? "").toUpperCase()
      const limit = Math.max(
        1,
        Math.min(Number(url.searchParams.get("limit") ?? 50), 100),
      )
      const offset = Math.max(0, Number(url.searchParams.get("offset") ?? 0))
      const all = [...state.creations.values()]
        .filter((c) => status === "" || c.status === status)
        .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
      return json(res, 200, {
        items: all.slice(offset, offset + limit).map(creationRow),
        total: all.length,
        limit,
        offset,
      })
    }
    if (segments.length === 0 && method === "POST") {
      const key = req.headers["idempotency-key"]
      if (!key) return error(res, 400, "Idempotency-Key header is required")
      const body = await readBody(req)
      const journeyType = (body?.journeyType ?? "").trim()
      const title = (body?.title ?? "").trim()
      if (!["UI", "API", "MIXED"].includes(journeyType))
        return error(res, 400, "Invalid journeyType")
      if (!title || title.length > 120)
        return error(res, 400, "Title must be between 1 and 120 characters")
      if ((body?.description ?? "")?.length > 2000)
        return error(res, 400, "Description is too long")
      const fingerprint = JSON.stringify([
        journeyType,
        title,
        body?.description ?? null,
        body?.flowId ?? null,
      ])
      const existing = state.creationIdempotency.get(`${CLIENT.id}:${key}`)
      if (existing) {
        if (existing.fingerprint !== fingerprint)
          return error(
            res,
            409,
            "Idempotency key reused with different request parameters",
          )
        return json(res, 201, creationRow(existing.row))
      }
      const row = createCreation({
        journeyType,
        title,
        description: body?.description ?? null,
        flowId: body?.flowId ?? null,
        method: "MANUAL_REQUEST",
      })
      state.creationIdempotency.set(`${CLIENT.id}:${key}`, { row, fingerprint })
      return json(res, 201, creationRow(row))
    }
    const creation = state.creations.get(Number(segments[0]))
    if (!creation) return error(res, 404, "Test creation request not found")
    if (segments.length === 1 && method === "GET")
      return json(res, 200, creationRow(creation))
    if (
      segments.length === 2 &&
      segments[1] === "cancel" &&
      method === "POST"
    ) {
      if (!["SUBMITTED", "IN_REVIEW"].includes(creation.status))
        return error(
          res,
          409,
          "Request cannot be cancelled in its current status",
        )
      creation.status = "CANCELLED"
      creation.completedAt = nowIso()
      creation.updatedAt = nowIso()
      creation.versionLock += 1
      return json(res, 200, creationRow(creation))
    }
    return error(res, 404, "Test creation request not found")
  }
  if (
    path === "/dashboard-api/admin/test-creation-requests" &&
    method === "GET"
  ) {
    const limit = Math.max(
      1,
      Math.min(Number(url.searchParams.get("limit") ?? 50), 100),
    )
    const offset = Math.max(0, Number(url.searchParams.get("offset") ?? 0))
    const all = [...state.creations.values()].sort((a, b) =>
      a.createdAt < b.createdAt ? 1 : -1,
    )
    return json(res, 200, {
      items: all.slice(offset, offset + limit).map(creationRow),
      limit,
      offset,
    })
  }
  const adminAction = path.match(
    /^\/dashboard-api\/admin\/test-creation-requests\/(\d+)\/(assign|start|reject|create-draft)$/,
  )
  if (adminAction && method === "POST") {
    const row = state.creations.get(Number(adminAction[1]))
    if (!row) return error(res, 404, "Test creation request not found")
    const kind = adminAction[2]
    const body = await readBody(req)
    if (kind === "assign") {
      row.status = "IN_REVIEW"
      row.assignedTo = 1
    } else if (kind === "start") {
      if (row.status !== "IN_REVIEW")
        return error(
          res,
          409,
          "Stale update: request was modified concurrently",
        )
      row.status = "IN_PROGRESS"
    } else if (kind === "reject") {
      if (!body?.decisionReason?.trim())
        return error(res, 400, "decisionReason is required")
      row.status = "REJECTED"
      row.decisionReason = body.decisionReason.trim()
      row.completedAt = nowIso()
    } else {
      if (row.status !== "IN_PROGRESS")
        return error(
          res,
          409,
          "Stale update: request was modified concurrently",
        )
      row.status = "DRAFT_CREATED"
      row.definitionId = 900 + row.id
      row.completedAt = nowIso()
    }
    row.updatedAt = nowIso()
    row.versionLock += 1
    return json(res, kind === "create-draft" ? 201 : 200, creationRow(row))
  }

  /* ---- AI Test Builder (PR10C planner contract) ---------------------- */
  function plannerStepsFor(testType) {
    if (testType === "BACKEND_CHECK") {
      return [
        {
          type: "API",
          intent: "Verify product availability",
          requiresDiscovery: false,
        },
        {
          type: "API",
          intent: "Verify the response is correct",
          requiresDiscovery: false,
        },
      ]
    }
    if (testType === "END_TO_END") {
      return [
        {
          type: "UI",
          intent: "Search for a product",
          requiresDiscovery: true,
        },
        {
          type: "API",
          intent: "Verify product availability",
          requiresDiscovery: false,
        },
      ]
    }
    return [
      {
        type: "UI",
        intent: "Search for a product",
        requiresDiscovery: true,
      },
      {
        type: "UI",
        intent: "Add the product to the cart",
        requiresDiscovery: true,
      },
    ]
  }
  function plannerPlan(testType, credentialId) {
    const id = state.nextPlanId++
    const plan = {
      status: "PLAN_READY",
      planId: `plan-${id}`,
      testType,
      title: "Mock planned test",
      description: "Planned from mock intent",
      authenticationRequired: credentialId != null,
      credentialReference:
        credentialId != null
          ? { credentialId, name: "Client site login" }
          : null,
      steps: plannerStepsFor(testType),
      expectedOutcomes: [
        { type: testType === "BACKEND_CHECK" ? "API" : "UI", intent: "It works" },
      ],
      requiredCapabilities:
        testType === "END_TO_END"
          ? ["APP_DISCOVERY", "BACKEND_DISCOVERY"]
          : testType === "BACKEND_CHECK"
            ? ["BACKEND_DISCOVERY"]
            : ["APP_DISCOVERY"],
      warnings: [],
      definitionSourceJson: "{}",
      consumed: false,
    }
    state.plans.set(plan.planId, plan)
    const { consumed, ...body } = plan
    return body
  }
  /* ---- Secure Credentials (PR10C.5, frozen contract) ----------------- */
  if (path === "/__test__/credentials-unavailable" && method === "POST") {
    const body = await readBody(req)
    state.credentialsUnavailable = body?.unavailable === true
    return json(res, 200, { unavailable: state.credentialsUnavailable })
  }
  if (path === "/__test__/last-planner-credential" && method === "GET") {
    // The credentialId of the most recent plan request (PR10C.5 Phase 2
    // assertion: the composer must send the REAL credential id).
    return json(res, 200, { credentialId: state.lastPlannerCredentialId ?? null })
  }
  if (path === "/__test__/credential-create-count" && method === "GET") {
    // Audit F-02: how many credential CREATE POSTs arrived.
    return json(res, 200, { count: state.credentialCreateRequests })
  }
  if (path === "/__test__/last-draft-description" && method === "GET") {
    // Audit F-01: the description the last draft creation carried.
    return json(res, 200, { description: state.lastDraftDescription })
  }

  const credentialsRoot = `/dashboard-api/clients/${CLIENT.id}/credentials`
  if (
    path.startsWith(`/dashboard-api/clients/`) &&
    path.includes("/credentials")
  ) {
    if (!path.startsWith(credentialsRoot))
      return error(res, 404, "This client does not exist")

    // Migration-window mode: until migration-018 is applied the real engine
    // answers 503 from every credentials endpoint.
    if (state.credentialsUnavailable)
      return error(res, 503, "Secure credentials aren't available on this deployment yet")

    const rest = path.slice(credentialsRoot.length).replace(/^\//, "")
    const segments = rest === "" ? [] : rest.split("/")
    const credentialId = segments.length > 0 ? Number(segments[0]) : NaN
    const row = Number.isInteger(credentialId)
      ? state.credentials.get(credentialId)
      : undefined

    // LIST
    if (segments.length === 0 && method === "GET") {
      const rows = [...state.credentials.values()].sort((a, b) =>
        a.name.toLowerCase() < b.name.toLowerCase() ? -1 : 1
      )
      return json(res, 200, { credentials: rows.map(credentialView) })
    }

    // CREATE
    if (segments.length === 0 && method === "POST") {
      state.credentialCreateRequests += 1
      const body = await readBody(req)
      const name = typeof body?.name === "string" ? body.name.trim() : ""
      const type = typeof body?.type === "string" ? body.type : ""
      const username = typeof body?.username === "string" ? body.username.trim() : ""
      const password = typeof body?.password === "string" ? body.password : ""
      if (name.length === 0 || name.length > 120)
        return error(res, 400, "The credential name must be between 1 and 120 characters")
      if (!["USER_ACCOUNT", "API_SERVICE"].includes(type))
        return error(res, 400, "The credential type must be USER_ACCOUNT or API_SERVICE")
      if (username === "" || password === "")
        return error(res, 400, "A username and password are required")
      const duplicate = [...state.credentials.values()].find(
        (c) => c.name.toLowerCase() === name.toLowerCase()
      )
      if (duplicate)
        return error(res, 409, "A credential with this name already exists for this client")
      const id = state.nextCredentialId++
      const created = {
        id,
        name,
        type,
        status: "CONFIGURED",
        username,
        hasSecret: true,
        lastUsedAt: null,
        useCount: 0,
      }
      state.credentials.set(id, created)
      return json(res, 201, credentialView(created))
    }

    if (!row) return error(res, 404, "The credential does not exist")

    // GET ONE
    if (segments.length === 1 && method === "GET")
      return json(res, 200, credentialView(row))

    // UPDATE (blank password = keep)
    if (segments.length === 1 && method === "PUT") {
      const body = await readBody(req)
      if (body?.name != null) {
        const name = String(body.name).trim()
        if (name.length === 0 || name.length > 120)
          return error(res, 400, "The credential name must be between 1 and 120 characters")
        const duplicate = [...state.credentials.values()].find(
          (c) => c.id !== row.id && c.name.toLowerCase() === name.toLowerCase()
        )
        if (duplicate)
          return error(res, 409, "A credential with this name already exists for this client")
        row.name = name
      }
      if (body?.type != null) {
        if (!["USER_ACCOUNT", "API_SERVICE"].includes(body.type))
          return error(res, 400, "The credential type must be USER_ACCOUNT or API_SERVICE")
        row.type = body.type
      }
      if (body?.username != null) {
        const username = String(body.username).trim()
        if (username === "")
          return error(res, 400, "A username is required")
        row.username = username
      }
      if (typeof body?.password === "string" && body.password !== "")
        row.hasSecret = true
      row.status = row.hasSecret && row.username ? "CONFIGURED" : "NEEDS_SETUP"
      return json(res, 200, credentialView(row))
    }

    // DELETE
    if (segments.length === 1 && method === "DELETE") {
      state.credentials.delete(row.id)
      res.writeHead(204, {
        "Access-Control-Allow-Origin": ORIGIN,
        "Access-Control-Allow-Credentials": "true",
      })
      return res.end()
    }

    // TEST CONNECTION — mirrors the real contract: proves the stored secret
    // decrypts and the client's base URL is reachable. A spec can force the
    // failure via the row's name ("fail:" prefix) for the INVALID path.
    if (segments.length === 2 && segments[1] === "test" && method === "POST") {
      if (!row.hasSecret)
        return json(res, 200, {
          success: false,
          message: "The credential isn't fully configured yet. Set a username and password first.",
        })
      if (row.name.startsWith("fail:"))
        return json(res, 200, {
          success: false,
          message: "The target application couldn't be reached.",
        })
      return json(res, 200, {
        success: true,
        message: "The target application is reachable and the secret decrypts.",
      })
    }
  }

  const plansRoot = `/dashboard-api/clients/${CLIENT.id}/test-plans`
  if (
    path.startsWith(`/dashboard-api/clients/`) &&
    path.includes("/test-plans")
  ) {
    if (!path.startsWith(plansRoot))
      return error(res, 404, "This client does not exist")
    state.plannerRequests += 1
    const rest = path.slice(plansRoot.length).replace(/^\//, "")
    const segments = rest === "" ? [] : rest.split("/")
    if (segments.length === 0 && method === "POST") {
      const body = await readBody(req)
      const intent = typeof body?.intent === "string" ? body.intent : ""
      if (!intent.trim()) return error(res, 400, "intent is required")
      if (intent.length > 4000)
        return error(res, 400, "intent exceeds the maximum length")
      const requestedType = body?.requestedType ?? "USER_JOURNEY"
      if (!["USER_JOURNEY", "BACKEND_CHECK", "END_TO_END"].includes(requestedType))
        return error(res, 400, "requestedType must be a known test type")
      const mode = state.plannerMode
      if (mode === "clarification") {
        const id = state.nextPlanId++
        return json(res, 200, {
          status: "NEEDS_CLARIFICATION",
          planId: `plan-${id}`,
          requestedType,
          questions: [
            {
              question: "Which checkout flow should be verified?",
              category: "MISSING_BUSINESS_OBJECTIVE",
            },
          ],
          categories: ["MISSING_BUSINESS_OBJECTIVE"],
        })
      }
      if (mode === "invalid-shape") {
        return json(res, 200, { status: "PLAN_READY" })
      }
      if (mode.startsWith("failed:")) {
        const category = mode.slice("failed:".length)
        // Mirror the real contract: the clarification-shaped categories
        // (INTENT_AMBIGUOUS, CREDENTIAL_REQUIRED) answer 200; every other
        // category answers 503 with the same FAILED body.
        const status =
          category === "INTENT_AMBIGUOUS" || category === "CREDENTIAL_REQUIRED"
            ? 200
            : 503
        return json(res, status, {
          status: "FAILED",
          planId: null,
          errorCategory: category,
          message: `Mock ${category}`,
        })
      }
      // Records the REAL credential id the composer sent (spec assertion);
      // undefined when none was referenced.
      state.lastPlannerCredentialId = body?.credentialId ?? null
      return json(res, 200, plannerPlan(requestedType, body?.credentialId ?? null))
    }
    if (segments.length === 2 && segments[1] === "confirm" && method === "POST") {
      const planId = segments[0]
      const key = req.headers["idempotency-key"]
      if (!key) return error(res, 400, "Idempotency-Key header is required")
      const plan = state.plans.get(planId)
      if (!plan || plan.consumed)
        return error(res, 404, "Test plan not found")
      const body = await readBody(req)
      const name =
        typeof body?.name === "string" && body.name.trim()
          ? body.name.trim().slice(0, 120)
          : plan.title
      const fingerprint = JSON.stringify([planId, name])
      const seen = state.confirmKeys.get(key)
      if (seen) {
        if (seen.fingerprint !== fingerprint)
          return error(res, 409, "Idempotency key reused with different parameters")
        return json(res, 200, seen.result)
      }
      const definitionId = state.nextConfirmDefinitionId++
      const definition = {
        id: definitionId,
        clientId: CLIENT.id,
        name,
        description: null,
        flowId: null,
        assetRequestId: null,
        isArchived: false,
        createdAt: nowIso(),
        updatedAt: nowIso(),
      }
      state.definitions.set(definition.id, definition)
      const version = {
        id: state.nextVersionId++,
        testDefinitionId: definition.id,
        versionNumber: 1,
        schemaVersion: "1.0",
        sourceJson: JSON.stringify({
          schemaVersion: "1.0",
          metadata: { name },
          steps: [{ action: "ui.wait", for: "duration", durationMs: 100 }],
          expectedOutcomes: [
            {
              action: "ui.assertVisible",
              locator: { strategy: "css", value: "body" },
            },
          ],
        }),
        status: "DRAFT",
        validationReportJson: null,
        versionLock: 1,
        createdBy: 1,
        validatedBy: null,
        approvedBy: null,
        provingRunId: null,
        createdAt: nowIso(),
        validatedAt: null,
        approvedAt: null,
        readyAt: null,
        archivedAt: null,
        updatedAt: nowIso(),
      }
      state.versions.set(version.id, version)
      const result = {
        definitionId,
        creationRequestId: 900 + definitionId,
        status: "DRAFT",
        planId,
        plannedTestType: plan.testType,
      }
      state.confirmKeys.set(key, { fingerprint, result })
      plan.consumed = true
      return json(res, 200, result)
    }
    return error(res, 404, "Test plan not found")
  }

  /* ---- Test Definitions ---------------------------------------------- */
  const tenantRoot = `/dashboard-api/clients/${CLIENT.id}/test-definitions`
  if (
    path.startsWith(`/dashboard-api/clients/`) &&
    path.includes("/test-definitions")
  ) {
    if (!path.startsWith(tenantRoot)) {
      // Any other tenant is indistinguishable from one that does not exist.
      return error(res, 404, "This client does not exist")
    }

    const rest = path.slice(tenantRoot.length).replace(/^\//, "")
    const segments = rest === "" ? [] : rest.split("/")

    if (segments.length === 0 && method === "GET") {
      const search = (url.searchParams.get("search") ?? "").trim().toLowerCase()
      const limit = Math.max(
        1,
        Math.min(Number(url.searchParams.get("limit") ?? 50), 100),
      )
      const offset = Math.max(0, Number(url.searchParams.get("offset") ?? 0))
      const all = [...state.definitions.values()]
        .filter(
          (d) =>
            d.clientId === CLIENT.id &&
            (search === "" || d.name.toLowerCase().includes(search)),
        )
        .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1))
      return json(res, 200, {
        items: all.slice(offset, offset + limit).map(definitionRow),
        total: all.length,
        limit,
        offset,
      })
    }

    if (segments.length === 0 && method === "POST") {
      const body = await readBody(req)
      if (body?.journeyType != null && body.journeyType !== "") {
        const jt = String(body.journeyType).trim()
        if (!["UI", "API", "MIXED"].includes(jt))
          return error(res, 400, "Invalid journeyType")
        // Mirror the backend's journey/definition compatibility gate: a journeyed
        // draft must carry a matching schema or it is rejected before persistence.
        const rawSource =
          typeof body?.initialSourceJson === "string"
            ? body.initialSourceJson.trim()
            : ""
        if (rawSource !== "") {
          let doc = null
          try {
            doc = JSON.parse(rawSource)
          } catch {
            return error(
              res,
              400,
              "Definition source is not a valid test definition",
            )
          }
          const version = doc?.schemaVersion === "1.1" ? "1.1" : "1.0"
          const hasApi = rawSource.includes('"action": "api.')
          const hasUi = rawSource.includes('"action": "ui.')
          const compatible =
            jt === "UI"
              ? hasUi && !hasApi
              : jt === "API"
                ? version === "1.1" && hasApi && !hasUi
                : version === "1.1" && hasApi && hasUi
          if (!compatible)
            return error(
              res,
              400,
              `Definition is not compatible with journey type ${jt}`,
            )
        }
        const key = req.headers["idempotency-key"]
        const fp = JSON.stringify([
          jt,
          (body?.name ?? "").trim(),
          body?.description ?? null,
          body?.flowId ?? null,
          body?.initialSourceJson ?? null,
        ])
        if (key) {
          const hit = state.creationIdempotency.get(`${CLIENT.id}:${key}`)
          if (hit && hit.fingerprint === fp)
            return json(res, 200, creationRow(hit.row))
          if (hit)
            return error(
              res,
              409,
              "Idempotency key reused with different request parameters",
            )
        }
      }
      const name = (body?.name ?? "").trim()
      if (name === "") return error(res, 400, "Definition name cannot be blank")
      if (name.length > 120)
        return error(res, 400, "Definition name cannot exceed 120 characters")
      const clash = [...state.definitions.values()].some(
        (d) =>
          d.clientId === CLIENT.id &&
          d.name.toLowerCase() === name.toLowerCase(),
      )
      if (clash)
        return error(
          res,
          409,
          "A Test Definition with this name already exists for this client",
        )
      if (body?.flowId != null && body.flowId !== FLOW.id) {
        return error(res, 404, "Specified flow does not belong to this client")
      }

      const definition = {
        id: state.nextDefinitionId++,
        clientId: CLIENT.id,
        name,
        description: body?.description ?? null,
        flowId: body?.flowId ?? null,
        assetRequestId: null,
        isArchived: false,
        createdAt: nowIso(),
        updatedAt: nowIso(),
      }
      // Audit F-01: record the EXACT description the client submitted so the
      // spec can assert review display === submitted body.
      state.lastDraftDescription = body?.description ?? null
      state.definitions.set(definition.id, definition)

      const journeyForFallback =
        body?.journeyType != null && body.journeyType !== ""
          ? String(body.journeyType).trim()
          : "UI"
      const fallbackSource =
        journeyForFallback === "API"
          ? {
              schemaVersion: "1.1",
              metadata: { name, tags: ["api"] },
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
                {
                  action: "api.assertJsonPath",
                  path: "$.status",
                  expected: "UP",
                },
                { action: "api.assertResponseTime", maxDurationMs: 2000 },
              ],
            }
          : journeyForFallback === "MIXED"
            ? {
                schemaVersion: "1.1",
                metadata: { name, tags: ["mixed"] },
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
              }
            : {
                schemaVersion: "1.0",
                metadata: { name },
                steps: [
                  { action: "ui.wait", for: "duration", durationMs: 100 },
                ],
                expectedOutcomes: [
                  {
                    action: "ui.assertVisible",
                    locator: { strategy: "css", value: "body" },
                  },
                ],
              }
      const sourceJson = body?.initialSourceJson?.trim()
        ? body.initialSourceJson.trim()
        : JSON.stringify(fallbackSource, null, 2)

      const version = {
        id: state.nextVersionId++,
        testDefinitionId: definition.id,
        versionNumber: 1,
        schemaVersion: "1.0",
        sourceJson,
        status: "DRAFT",
        validationReportJson: null,
        versionLock: 1,
        createdBy: 1,
        validatedBy: null,
        approvedBy: null,
        provingRunId: null,
        createdAt: nowIso(),
        validatedAt: null,
        approvedAt: null,
        readyAt: null,
        archivedAt: null,
        updatedAt: nowIso(),
      }
      state.versions.set(version.id, version)

      if (body?.journeyType != null && body.journeyType !== "") {
        const now = nowIso()
        const row = {
          id: state.nextCreationId++,
          clientId: CLIENT.id,
          flowId: definition.flowId,
          journeyType: String(body.journeyType).trim(),
          creationMethod: "MANUAL_EDITOR",
          status: "DRAFT_CREATED",
          requestedBy: 1,
          assignedTo: null,
          definitionId: definition.id,
          title: name,
          description: definition.description,
          decisionReason: null,
          failureCode: null,
          failureMessage: null,
          versionLock: 1,
          createdAt: now,
          updatedAt: now,
          completedAt: now,
        }
        state.creations.set(row.id, row)
        const key = req.headers["idempotency-key"]
        if (key) {
          state.creationIdempotency.set(`${CLIENT.id}:${key}`, {
            row,
            fingerprint: JSON.stringify([
              row.journeyType,
              name,
              definition.description,
              definition.flowId,
              body?.initialSourceJson ?? null,
            ]),
          })
        }
        return json(res, 200, {
          ...creationRow(row),
          creationRequestId: row.id,
        })
      }

      return json(res, 200, {
        definitionId: definition.id,
        clientId: CLIENT.id,
        name,
        description: definition.description,
        flowId: definition.flowId,
        initialVersionId: version.id,
        versionNumber: 1,
        status: "DRAFT",
      })
    }

    const definition = state.definitions.get(Number(segments[0]))
    if (!definition) return error(res, 404, "Test Definition not found")

    if (segments.length === 1 && method === "GET") {
      return json(res, 200, {
        ...definitionRow(definition),
        versions: versionsOf(definition.id).map(versionSummary),
      })
    }

    if (segments[1] === "versions" && segments.length >= 3) {
      const version = state.versions.get(Number(segments[2]))
      if (!version || version.testDefinitionId !== definition.id) {
        return error(res, 404, "Test Definition version not found")
      }
      const action = segments[3]

      if (!action && method === "GET") {
        return json(res, 200, version)
      }

      if (!action && method === "PUT") {
        const body = await readBody(req)
        if (body?.versionLock == null)
          return error(
            res,
            400,
            "versionLock is required for optimistic concurrency",
          )
        if (!body?.sourceJson?.trim())
          return error(res, 400, "sourceJson is required")
        if (version.status !== "DRAFT") {
          return error(
            res,
            409,
            `Version ${version.versionNumber} is ${version.status} and cannot be edited. Create a new version instead.`,
          )
        }
        if (body.versionLock !== version.versionLock) {
          return error(
            res,
            409,
            "Stale update detected; the draft was modified concurrently or expectedLock did not match",
          )
        }
        version.sourceJson = body.sourceJson.trim()
        version.schemaVersion = body.schemaVersion?.trim() || "1.0"
        // A content change invalidates the stored report, as the engine does.
        version.validationReportJson = null
        version.versionLock += 1
        version.updatedAt = nowIso()
        definition.updatedAt = nowIso()
        return json(res, 200, {
          definitionId: definition.id,
          versionId: version.id,
          versionNumber: version.versionNumber,
          status: "DRAFT",
          versionLock: version.versionLock,
          updated: true,
        })
      }

      if (action === "validate" && method === "POST") {
        if (definition.isArchived)
          return error(
            res,
            409,
            "Test Definition is archived; validate versions is not permitted",
          )
        if (version.status !== "DRAFT") {
          return error(
            res,
            409,
            `Validation can only be run on DRAFT versions (current status: ${version.status})`,
          )
        }
        const report = validateDocument(version.sourceJson)
        version.status = report.valid ? "VALIDATED" : "DRAFT"
        version.validationReportJson = JSON.stringify(report)
        version.validatedAt = report.valid ? nowIso() : null
        version.updatedAt = nowIso()
        return json(res, 200, {
          definitionId: definition.id,
          versionId: version.id,
          versionNumber: version.versionNumber,
          status: version.status,
          valid: report.valid,
          validationReport: report,
        })
      }

      if (action === "trial" && method === "POST") {
        return handleExecution(
          res,
          definition,
          version,
          "TRIAL",
          req.headers["idempotency-key"],
        )
      }

      if (action === "approve" && method === "POST") {
        if (definition.isArchived)
          return error(
            res,
            409,
            "Test Definition is archived; approve versions is not permitted",
          )
        if (version.status !== "VALIDATED") {
          return error(
            res,
            409,
            `Only VALIDATED versions can be APPROVED (current: ${version.status})`,
          )
        }
        version.status = "APPROVED"
        version.approvedAt = nowIso()
        version.approvedBy = 1
        version.updatedAt = nowIso()
        return json(res, 200, {
          definitionId: definition.id,
          versionId: version.id,
          versionNumber: version.versionNumber,
          status: "APPROVED",
        })
      }

      if (action === "proving" && method === "POST") {
        return handleExecution(
          res,
          definition,
          version,
          "PROVING",
          req.headers["idempotency-key"],
        )
      }

      if (action === "archive" && method === "POST") {
        if (version.status !== "READY") {
          return error(
            res,
            409,
            `Only READY versions can be ARCHIVED (current: ${version.status})`,
          )
        }
        if (definition.isArchived)
          return error(res, 409, "Test Definition is already archived")
        version.status = "ARCHIVED"
        version.archivedAt = nowIso()
        version.updatedAt = nowIso()
        definition.isArchived = true
        definition.updatedAt = nowIso()
        return json(res, 200, {
          definitionId: definition.id,
          versionId: version.id,
          versionNumber: version.versionNumber,
          status: "ARCHIVED",
          aggregateArchived: true,
        })
      }
    }

    if (
      segments[1] === "versions" &&
      segments.length === 2 &&
      method === "POST"
    ) {
      const body = await readBody(req)
      if (definition.isArchived)
        return error(
          res,
          409,
          "Test Definition is archived; create new versions is not permitted",
        )
      const existing = versionsOf(definition.id)
      const base =
        body?.baseVersionId != null
          ? state.versions.get(Number(body.baseVersionId))
          : existing[0]
      const created = {
        id: state.nextVersionId++,
        testDefinitionId: definition.id,
        versionNumber: (existing[0]?.versionNumber ?? 0) + 1,
        schemaVersion: base?.schemaVersion ?? "1.0",
        sourceJson: base?.sourceJson ?? "{}",
        status: "DRAFT",
        validationReportJson: null,
        versionLock: 1,
        createdBy: 1,
        validatedBy: null,
        approvedBy: null,
        provingRunId: null,
        createdAt: nowIso(),
        validatedAt: null,
        approvedAt: null,
        readyAt: null,
        archivedAt: null,
        updatedAt: nowIso(),
      }
      state.versions.set(created.id, created)
      return json(res, 200, {
        definitionId: definition.id,
        versionId: created.id,
        versionNumber: created.versionNumber,
        status: "DRAFT",
        versionLock: 1,
      })
    }

    if (segments[1] === "runs" && segments.length >= 3) {
      const run = state.runs.get(Number(segments[2]))
      if (!run || run.definitionId !== definition.id)
        return error(res, 404, "Run not found for this definition")
      if (segments[3] === "artifacts" && segments[4]) {
        const artifact = run.artifacts.find((a) => a.id === Number(segments[4]))
        if (!artifact) return error(res, 404, "Artifact not found")
        // A one-pixel PNG stands in for the stored evidence file.
        const bytes = Buffer.from(
          "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
          "base64",
        )
        res.writeHead(200, {
          "Content-Type": artifact.contentType ?? "application/octet-stream",
          "Content-Disposition": `attachment; filename="${artifact.artifactName}"`,
          "Access-Control-Allow-Origin": ORIGIN,
          "Access-Control-Allow-Credentials": "true",
          "Access-Control-Expose-Headers": "Content-Disposition",
          "Content-Length": bytes.length,
        })
        res.end(bytes)
        return
      }
      if (method === "GET") return json(res, 200, runDetailsBody(run))
    }

    return error(res, 404, "Test Definition not found")
  }

  /* ---- Alerts badge parity --------------------------------------------- */
  if (path === "/dashboard-api/alerts/unread-count") {
    const count = [...state.runs.values()].filter(
      (run) =>
        !run.isRead &&
        (run.failed > 0 || ["FAIL", "FAILED"].includes(String(run.status).toUpperCase())) &&
        String(run.status).toUpperCase() !== "CANCELLED",
    ).length
    return json(res, 200, { count })
  }

  /* ---- Everything else the shells poll on load ------------------------ */
  if (path === "/dashboard-api/onboarding/requests") return json(res, 200, [])
  if (path === "/dashboard-api/admin/asset-requests") return json(res, 200, [])
  if (path === "/dashboard-api/admin/overview") {
    // Shape mirrors AdminOverviewResponse exactly; the admin console's default
    // page reads these fields unconditionally.
    return json(res, 200, {
      kpis: {
        totalClients: 1,
        activeClients: 1,
        inactiveClients: 0,
        totalRuns: 0,
        failedRuns30d: 0,
        passedRuns30d: 0,
        successRate30d: null,
      },
      executionHealth: { running: 0, passed: 0, failed: 0, total: 0 },
      weeklyChart: [],
      clients: [],
      recentActivity: [],
    })
  }
  if (method === "GET") return json(res, 200, [])

  return error(res, 404, "Not found")
})

server.listen(PORT, "127.0.0.1", () => {
  seedCredentials()
  process.stdout.write(`mock engine listening on http://127.0.0.1:${PORT}\n`)
})
