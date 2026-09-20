import { test } from "node:test"
import assert from "node:assert/strict"
import { applyFrame, EMPTY_STREAM, parseSse, pollOutcome, terminalName } from "./useDiscoveryStream"
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
