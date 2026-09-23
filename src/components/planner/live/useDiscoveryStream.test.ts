import { test } from "node:test"
import assert from "node:assert/strict"
import {
  applyFrame,
  EMPTY_STREAM,
  isTerminalStatus,
  parseSse,
  pollOutcome,
  POLL_MAX_WINDOW_MS,
  POLL_TIMEOUT_FAILURE,
  terminalName,
  withinPollWindow,
} from "./useDiscoveryStream"
import type { LivePlanEvent } from "./useDiscoveryStream"

const progressEvent = (stage: string): LivePlanEvent => ({
  id: `evt-${stage}`,
  stage,
  message: "Reading your request",
  details: null,
  status: "COMPLETE",
  timestamp: 1,
  metadata: {},
})

test("parseSse handles named frames and repeated data lines", () => {
  const frames: Array<[string, string]> = []
  const remainder = parseSse("event: progress\nid: 1\ndata: {\"a\":\ndata: 1}\n\nevent: complete\ndata: {}\n\npartial", (name, data) => frames.push([name, data]))
  assert.deepEqual(frames, [["progress", '{"a":\n1}'], ["complete", "{}"]])
  assert.equal(remainder, "partial")
})

test("parseSse defaults unnamed frames to message", () => {
  const frames: Array<[string, string]> = []
  parseSse("data: hello\n\n", (name, data) => frames.push([name, data]))
  assert.deepEqual(frames, [["message", "hello"]])
})

test("terminalName maps exactly the three terminal frames", () => {
  assert.equal(terminalName("complete"), "done")
  assert.equal(terminalName("clarification"), "clarification")
  assert.equal(terminalName("failed"), "failed")
  assert.equal(terminalName("progress"), null)
  assert.equal(terminalName("message"), null)
})

test("applyFrame appends progress events in arrival order", () => {
  let result = EMPTY_STREAM
  result = applyFrame(result, "progress", progressEvent("start"))
  result = applyFrame(result, "progress", progressEvent("navigate_done"))
  result = applyFrame(result, "progress", progressEvent("ai_start"))
  assert.equal(result.events.length, 3)
  assert.deepEqual(result.events.map((e) => e.stage), ["start", "navigate_done", "ai_start"])
  assert.equal(result.status, "idle")
})

test("applyFrame maps terminal frames without touching collected events", () => {
  let result = applyFrame(EMPTY_STREAM, "progress", progressEvent("start"))
  const withProgress = result
  const completed = applyFrame(result, "complete", { status: "PLAN_READY", planId: "p1", steps: [] })
  assert.equal(completed.status, "done")
  assert.equal((completed.plan as { planId?: string }).planId, "p1")
  assert.equal(completed.events.length, 1)
  result = applyFrame(withProgress, "failed", { status: "FAILED", errorCategory: "AI_TIMEOUT", message: "too long" })
  assert.equal(result.status, "failed")
  assert.equal((result.failure as { errorCategory?: string }).errorCategory, "AI_TIMEOUT")
  result = applyFrame(withProgress, "clarification", { status: "NEEDS_CLARIFICATION", questions: [] })
  assert.equal(result.status, "clarification")
})

test("applyFrame ignores unknown frames", () => {
  assert.equal(applyFrame(EMPTY_STREAM, "ping", {}), EMPTY_STREAM)
})

test("Case 7 (SSE): applyFrame normalizes raw backend clarification payload without character-index keys", () => {
  const withProgress = applyFrame(EMPTY_STREAM, "progress", progressEvent("ai_start"))
  const rawBackendClarification = {
    status: "NEEDS_CLARIFICATION",
    planId: "plan-clarify-123",
    requestedType: "USER_JOURNEY",
    questions: ["Which account should be used?"],
    categories: ["MISSING_BUSINESS_OBJECTIVE"],
  }
  const result = applyFrame(withProgress, "clarification", rawBackendClarification)
  assert.equal(result.status, "clarification")
  assert.ok(result.clarification)
  assert.equal(result.clarification.questions.length, 1)

  const firstQuestion = result.clarification.questions[0]
  assert.equal(firstQuestion.question, "Which account should be used?")
  assert.equal(firstQuestion.category, "MISSING_BUSINESS_OBJECTIVE")

  // Verify that spreading in AiBuilderPage ({ ...q, answer: "" }) operates on an object with question and NO character-index keys
  const mapped = { ...firstQuestion, answer: "" }
  assert.equal(mapped.question, "Which account should be used?")
  assert.equal(mapped.category, "MISSING_BUSINESS_OBJECTIVE")
  assert.equal(mapped.answer, "")
  assert.equal((mapped as Record<string, unknown>)["0"], undefined)
  assert.equal((mapped as Record<string, unknown>)["1"], undefined)
  assert.equal((mapped as Record<string, unknown>)["2"], undefined)
})

test("pollOutcome terminates on a PLAN_READY body over 200", () => {
  const outcome = pollOutcome(200, { status: "PLAN_READY", planId: "p1" })
  assert.equal(outcome.retry, false)
  assert.equal((outcome as { name?: string }).name, "complete")
})

test("pollOutcome terminates on a FAILED body even over 503", () => {
  // The real backend serves planning failures over HTTP 503; the body is
  // still the terminal result and must never be retried forever.
  const outcome = pollOutcome(503, { status: "FAILED", errorCategory: "AI_TIMEOUT", message: "x" })
  assert.equal(outcome.retry, false)
  assert.equal((outcome as { name?: string }).name, "failed")
})

test("pollOutcome terminates on a 200 FAILED body (clarification-shaped categories)", () => {
  const outcome = pollOutcome(200, { status: "FAILED", errorCategory: "CREDENTIAL_REQUIRED", message: "x" })
  assert.equal(outcome.retry, false)
  assert.equal((outcome as { name?: string }).name, "failed")
})

test("pollOutcome keeps retrying while the job is running (404) or unknown", () => {
  assert.deepEqual(pollOutcome(404, { error: "Plan not found" }), { retry: true })
  assert.deepEqual(pollOutcome(500, null), { retry: true })
  assert.deepEqual(pollOutcome(200, { status: "PLANNING" }), { retry: true })
})

// ── LIVE_DISCOVERY_FEED_CORRECTNESS_FIX ─────────────────────────────────────────

test("applyFrame renders a duplicate progress event only once (dedup by id)", () => {
  let result = applyFrame(EMPTY_STREAM, "progress", progressEvent("navigate_done"))
  // Same backend event id re-delivered (SSE retransmit) must not double-append.
  result = applyFrame(result, "progress", progressEvent("navigate_done"))
  assert.equal(result.events.length, 1)
  assert.equal(result.events[0].stage, "navigate_done")
})

test("applyFrame renders a replayed batch of events once each, preserving order", () => {
  // Simulate a reconnect that replays the whole buffer on top of what we already have.
  let result = EMPTY_STREAM
  for (const stage of ["start", "navigate_done", "ai_start"]) {
    result = applyFrame(result, "progress", progressEvent(stage))
  }
  for (const stage of ["start", "navigate_done", "ai_start"]) {
    result = applyFrame(result, "progress", progressEvent(stage))
  }
  assert.equal(result.events.length, 3)
  assert.deepEqual(result.events.map((e) => e.stage), ["start", "navigate_done", "ai_start"])
})

test("applyFrame applies a terminal frame once and ignores a second terminal", () => {
  let result = applyFrame(EMPTY_STREAM, "complete", { status: "PLAN_READY", planId: "p1", steps: [] })
  assert.equal(result.status, "done")
  // A second, different terminal must not overwrite the first.
  result = applyFrame(result, "failed", { status: "FAILED", errorCategory: "AI_TIMEOUT", message: "late" })
  assert.equal(result.status, "done")
  assert.equal((result.plan as { planId?: string }).planId, "p1")
  assert.equal(result.failure, null)
})

test("applyFrame ignores progress events that arrive after a terminal state", () => {
  let result = applyFrame(EMPTY_STREAM, "progress", progressEvent("ai_start"))
  result = applyFrame(result, "complete", { status: "PLAN_READY", planId: "p9", steps: [] })
  const beforeStraggler = result
  result = applyFrame(result, "progress", progressEvent("locators_done"))
  assert.equal(result, beforeStraggler)
  assert.equal(result.events.length, 1)
  assert.equal(result.status, "done")
})

test("isTerminalStatus recognizes exactly the terminal states", () => {
  assert.equal(isTerminalStatus("idle"), false)
  assert.equal(isTerminalStatus("streaming"), false)
  assert.equal(isTerminalStatus("done"), true)
  assert.equal(isTerminalStatus("failed"), true)
  assert.equal(isTerminalStatus("clarification"), true)
})

test("withinPollWindow bounds the fallback so a 404 cannot poll forever", () => {
  const start = 1_000_000
  assert.equal(withinPollWindow(start, start, POLL_MAX_WINDOW_MS), true)
  assert.equal(withinPollWindow(start, start + POLL_MAX_WINDOW_MS - 1, POLL_MAX_WINDOW_MS), true)
  // At and beyond the window the fallback must stop.
  assert.equal(withinPollWindow(start, start + POLL_MAX_WINDOW_MS, POLL_MAX_WINDOW_MS), false)
  assert.equal(withinPollWindow(start, start + POLL_MAX_WINDOW_MS + 5_000, POLL_MAX_WINDOW_MS), false)
})

test("the bounded fallback resolves to an honest terminal timeout failure", () => {
  assert.equal(POLL_TIMEOUT_FAILURE.status, "FAILED")
  assert.equal(POLL_TIMEOUT_FAILURE.errorCategory, "AI_TIMEOUT")
  // Applying it terminates the stream deterministically.
  const result = applyFrame(EMPTY_STREAM, "failed", POLL_TIMEOUT_FAILURE)
  assert.equal(result.status, "failed")
  assert.equal(result.failure?.errorCategory, "AI_TIMEOUT")
})
