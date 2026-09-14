import assert from "node:assert/strict"
import test from "node:test"

import {
  HISTORY_TIME_OPTIONS,
  buildClientRunsQuery,
  historyTimeCutoff,
} from "./runHistory"

test("history time options start with All time", () => {
  assert.equal(HISTORY_TIME_OPTIONS[0], "All time")
})

test("All time sends no time bound — the same window as Overview Recent Runs", () => {
  const q = buildClientRunsQuery({
    trigger: "all",
    flowId: "all",
    test: "all",
    time: "All time",
  })
  assert.deepEqual(q, {})
  assert.equal(historyTimeCutoff("All time"), null)
})

test("narrowed time options set only the from bound", () => {
  const before = Date.now()
  const q = buildClientRunsQuery({
    trigger: "all",
    flowId: "all",
    test: "all",
    time: "Last 7 days",
  })
  const after = Date.now()
  assert.ok(q.from, "Last 7 days must send from")
  assert.equal(q.to, undefined)
  const fromMs = new Date(q.from as string).getTime()
  assert.ok(fromMs >= before - 7 * 86_400_000 && fromMs <= after - 7 * 86_400_000)
})

test("Today cuts off at local midnight", () => {
  const cutoff = historyTimeCutoff("Today")
  const midnight = new Date()
  midnight.setHours(0, 0, 0, 0)
  assert.equal(cutoff, midnight.getTime())
})

test("active filters map onto the verified backend query params", () => {
  const q = buildClientRunsQuery({
    status: "FAILED",
    trigger: "SCHEDULED",
    flowId: "20",
    test: "testLogin",
    time: "All time",
  })
  assert.deepEqual(q, { status: "FAILED", source: "SCHEDULED", flowId: 20, test: "testLogin" })
})

test("custom range bounds are inclusive ISO-8601 timestamps", () => {
  const q = buildClientRunsQuery({
    trigger: "all",
    flowId: "all",
    test: "all",
    time: "Custom range",
    customFrom: "2026-09-01",
    customTo: "2026-09-10",
  })
  assert.equal(q.from, new Date("2026-09-01T00:00:00").toISOString())
  assert.equal(q.to, new Date("2026-09-10T23:59:59.999").toISOString())
})

test("an inverted custom range sends nothing instead of a 400", () => {
  const q = buildClientRunsQuery({
    trigger: "all",
    flowId: "all",
    test: "all",
    time: "Custom range",
    customFrom: "2026-09-10",
    customTo: "2026-09-01",
    customRangeInvalid: true,
  })
  assert.deepEqual(q, {})
})
