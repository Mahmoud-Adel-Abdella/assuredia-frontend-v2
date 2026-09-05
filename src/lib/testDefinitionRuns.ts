/**
 * One view model for a Test Definition run, whichever shape the engine answered
 * with.
 *
 * `POST …/trial` and `POST …/proving` return two structurally different bodies:
 * a fresh execution answers `formatExecutionResponse` (camelCase, `runId`,
 * separate `stepResults`/`outcomeResults`, no artifacts), while a completed
 * idempotent replay answers `getRunDetails` (the `test_runs` row in snake_case
 * under `id`, persisted step rows, and artifact metadata). `GET …/runs/{id}`
 * always uses the second shape.
 *
 * Everything downstream renders {@link DefinitionRunView}, so no component has
 * to know which one it received.
 */

import type {
  TestDefinitionExecutionResponse,
  TestDefinitionExecutionResult,
  TestDefinitionRunArtifact,
  TestDefinitionRunDetails,
  TestDefinitionRunStatus,
} from "./api"

/** One step as displayed, from either an in-memory outcome or a persisted row. */
export type RunStepView = {
  stepIndex: number
  /** Step id or address when the document named one, otherwise null. */
  label: string | null
  /** Enum name of the opcode, e.g. "UI_NAVIGATE". */
  action: string | null
  status: TestDefinitionRunStatus | string | null
  reasonCode: string | null
  /** Already sanitized by the engine; rendered as text, never as markup. */
  message: string | null
  durationMs: number | null
  /** True for the assertions in `expectedOutcomes` rather than `steps`. */
  isExpectedOutcome: boolean
}

/** Artifact metadata as displayed. The storage reference is deliberately dropped. */
export type RunArtifactView = {
  id: number
  name: string
  type: string | null
  stepIndex: number | null
  sizeBytes: number | null
  contentType: string | null
  createdAt: string | null
}

export type DefinitionRunView = {
  runId: number
  /** External `test_runs.run_id` when the persisted row was returned. */
  externalRunId: string | null
  purpose: "TRIAL" | "PROVING" | string | null
  status: TestDefinitionRunStatus | string | null
  terminatingReasonCode: string | null
  versionNumber: number | null
  versionId: number | null
  startedAt: string | null
  durationMs: number | null
  totals: { total: number | null; passed: number | null; failed: number | null; skipped: number | null }
  steps: RunStepView[]
  artifacts: RunArtifactView[]
  /** Proving only, and only on a fresh response: whether READY was accepted. */
  becameReady: boolean | null
  /** Proving only, and only on a fresh response: the version status afterwards. */
  currentStatus: string | null
  /** True when this body was a replay of an earlier identical operation. */
  replayed: boolean
  /** Set when the execution lost its idempotency lease; the stored run is authoritative. */
  idempotencyNote: string | null
  /**
   * True when the response carried no artifact information at all. A fresh
   * execution never includes artifacts, so this distinguishes "not reported
   * here" from "this run produced none".
   */
  artifactsUnknown: boolean
}

/** Discriminates the two bodies: only the fresh execution shape carries `runId`. */
export function isFreshExecutionResponse(
  body: TestDefinitionExecutionResponse,
): body is TestDefinitionExecutionResult {
  return typeof (body as TestDefinitionExecutionResult).runId === "number"
}

function toIsoString(value: number | string | null | undefined): string | null {
  if (value === null || value === undefined) return null
  if (typeof value === "number") {
    const date = new Date(value)
    return Number.isNaN(date.getTime()) ? null : date.toISOString()
  }
  return value
}

function mapArtifact(artifact: TestDefinitionRunArtifact): RunArtifactView {
  // filePath is intentionally not carried into the view model: it is a
  // server-owned storage reference, and artifacts are addressed by id.
  return {
    id: artifact.id,
    name: artifact.artifactName,
    type: artifact.artifactType,
    stepIndex: artifact.stepIndex,
    sizeBytes: artifact.fileSizeBytes,
    contentType: artifact.contentType,
    createdAt: artifact.createdAt,
  }
}

/** Normalizes the persisted run-details shape (also what `GET …/runs/{id}` returns). */
export function runViewFromDetails(
  details: TestDefinitionRunDetails,
  options?: { replayed?: boolean },
): DefinitionRunView {
  const steps: RunStepView[] = (details.stepResults ?? []).map((row) => ({
    stepIndex: row.stepIndex,
    label: row.stepIdentifier,
    action: row.actionType,
    status: row.status,
    reasonCode: row.reasonCode,
    message: row.message,
    durationMs: row.durationMs,
    // Persisted rows do not distinguish steps from expected outcomes; the engine
    // appends both into one ordered list.
    isExpectedOutcome: false,
  }))

  return {
    runId: details.id,
    externalRunId: details.run_id ?? null,
    purpose: details.execution_purpose ?? null,
    status: details.status ?? null,
    terminatingReasonCode: null,
    versionNumber: details.definition_version_number ?? null,
    versionId: details.test_definition_version_id ?? null,
    startedAt: toIsoString(details.timestamp),
    durationMs: details.duration_seconds == null ? null : details.duration_seconds * 1000,
    totals: {
      total: details.total ?? null,
      passed: details.passed ?? null,
      failed: details.failed ?? null,
      skipped: details.skipped ?? null,
    },
    steps,
    artifacts: (details.artifacts ?? []).map(mapArtifact),
    becameReady: null,
    currentStatus: null,
    replayed: options?.replayed ?? false,
    idempotencyNote: null,
    artifactsUnknown: false,
  }
}

/** Normalizes a fresh trial/proving execution response. */
export function runViewFromExecution(result: TestDefinitionExecutionResult): DefinitionRunView {
  const steps: RunStepView[] = [
    ...(result.stepResults ?? []).map((step) => ({ step, isExpectedOutcome: false })),
    ...(result.outcomeResults ?? []).map((step) => ({ step, isExpectedOutcome: true })),
  ].map(({ step, isExpectedOutcome }) => ({
    stepIndex: step.stepIndex,
    label: step.stepAddress,
    action: step.opcode,
    status: step.status,
    reasonCode: step.reasonCode,
    message: step.sanitizedMessage,
    durationMs: step.elapsedMs,
    isExpectedOutcome,
  }))

  const counted = steps.filter((s) => s.status !== "NOT_EXECUTED")

  return {
    runId: result.runId,
    externalRunId: null,
    purpose: result.executionPurpose,
    status: result.status,
    terminatingReasonCode: result.terminatingReasonCode ?? null,
    versionNumber: result.versionNumber,
    versionId: result.versionId,
    startedAt: null,
    durationMs: result.totalElapsedMs ?? null,
    totals: {
      total: steps.length,
      passed: counted.filter((s) => s.status === "PASSED").length,
      failed: counted.filter((s) => s.status === "FAILED" || s.status === "ERROR").length,
      skipped: steps.filter((s) => s.status === "NOT_EXECUTED").length,
    },
    steps,
    artifacts: [],
    becameReady: result.becameReady ?? null,
    currentStatus: result.currentStatus ?? null,
    replayed: false,
    idempotencyNote: result.idempotencyNote ?? null,
    // A fresh execution response never carries artifact metadata; it has to be
    // read back from GET …/runs/{runId}.
    artifactsUnknown: true,
  }
}

/** Normalizes whichever shape a trial/proving call answered with. */
export function runViewFromExecutionResponse(
  body: TestDefinitionExecutionResponse,
): DefinitionRunView {
  return isFreshExecutionResponse(body)
    ? runViewFromExecution(body)
    : runViewFromDetails(body, { replayed: true })
}

/** Human-readable size for artifact metadata; null stays unknown. */
export function formatArtifactSize(bytes: number | null): string | null {
  if (bytes == null || bytes < 0) return null
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

/** Duration for display; null when the engine reported none. */
export function formatRunDuration(durationMs: number | null): string | null {
  if (durationMs == null || durationMs < 0) return null
  if (durationMs < 1000) return `${durationMs} ms`
  const seconds = durationMs / 1000
  if (seconds < 60) return `${seconds.toFixed(seconds < 10 ? 1 : 0)} s`
  const minutes = Math.floor(seconds / 60)
  return `${minutes}m ${Math.round(seconds - minutes * 60)}s`
}
