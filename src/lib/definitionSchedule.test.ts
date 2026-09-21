import test from "node:test"
import assert from "node:assert/strict"

import {
  DEFAULT_SCHEDULE_FREQUENCY,
  DEFAULT_SCHEDULE_TIME,
  countLiveSchedules,
  defaultScheduleForm,
  frequencyNeedsTime,
  isCustomFrequency,
  isLiveSchedule,
  scheduleFormBody,
  scheduleFormCron,
  scheduleFormError,
  scheduleFormFromCron,
  scheduleSummary,
  sortSchedules,
} from "./definitionSchedule"
import type { DefinitionSchedule } from "./api"

/**
 * Phase 4 — the definition-schedule form.
 *
 * The engine validates with Spring's `CronExpression`, which needs a leading
 * seconds field. A hand-typed five-field expression is the most likely way to
 * get a 400 here, so these tests pin the derivation, the round trip, and the
 * refusal to silently replace a cron the presets cannot express.
 */

function schedule(overrides: Partial<DefinitionSchedule> = {}): DefinitionSchedule {
  return {
    id: 1,
    definitionId: 7,
    name: "Login journey schedule",
    cronExpression: "0 0 9 * * *",
    timezone: "UTC",
    isActive: true,
    notifyPolicy: null,
    ...overrides,
  }
}

test("the form opens on a daily 09:00 schedule in the given timezone", () => {
  const form = defaultScheduleForm("Africa/Cairo")

  assert.equal(form.frequency, DEFAULT_SCHEDULE_FREQUENCY)
  assert.equal(form.time, DEFAULT_SCHEDULE_TIME)
  assert.equal(form.timezone, "Africa/Cairo")
  assert.equal(form.notifyPolicy, "")
  assert.equal(form.name, "")
  assert.equal(scheduleFormCron(form), "0 0 9 * * *")
})

test("a daily frequency derives a six-field expression with the chosen time", () => {
  const form = { ...defaultScheduleForm("UTC"), frequency: "Every day", time: "14:30" }

  assert.equal(scheduleFormCron(form), "0 30 14 * * *")
  assert.equal(scheduleFormCron(form).split(/\s+/).length, 6, "Spring needs six fields")
})

test("a weekly frequency derives Monday", () => {
  const form = { ...defaultScheduleForm("UTC"), frequency: "Every week", time: "08:05" }

  assert.equal(scheduleFormCron(form), "0 5 8 * * 1")
})

test("interval frequencies ignore the time of day", () => {
  for (const [frequency, expected] of [
    ["Every 15 minutes", "0 */15 * * * *"],
    ["Every 30 minutes", "0 */30 * * * *"],
    ["Every hour", "0 0 * * * *"],
    ["Every 2 hours", "0 0 */2 * * *"],
    ["Every 6 hours", "0 0 */6 * * *"],
  ] as const) {
    const form = { ...defaultScheduleForm("UTC"), frequency, time: "23:59" }
    assert.equal(scheduleFormCron(form), expected, frequency)
    assert.equal(frequencyNeedsTime(frequency), false, frequency)
  }
})

test("a stored expression round-trips through the form unchanged", () => {
  for (const cron of [
    "0 0 9 * * *",
    "0 30 14 * * *",
    "0 5 8 * * 1",
    "0 */15 * * * *",
    "0 0 */6 * * *",
  ]) {
    const form = scheduleFormFromCron(cron, "UTC")
    assert.equal(scheduleFormCron(form), cron, cron)
  }
})

test("an expression the presets cannot express survives the round trip verbatim", () => {
  // A cron created outside this UI must not be silently replaced by a preset the
  // user never chose — editing the name must not change when the test runs.
  const cron = "0 0 3 1 * *"
  const form = scheduleFormFromCron(cron, "UTC")

  assert.equal(isCustomFrequency(form.frequency), true)
  assert.equal(scheduleFormCron(form), cron)
  assert.equal(scheduleFormCron({ ...form, name: "renamed" }), cron)
})

test("a custom frequency is echoed even when the time field changes", () => {
  const form = { ...defaultScheduleForm("UTC"), frequency: "0 0 3 1 * *", time: "18:00" }

  assert.equal(scheduleFormCron(form), "0 0 3 1 * *")
})

test("the summary falls back to the raw expression when it cannot be described", () => {
  assert.notEqual(scheduleSummary("0 0 3 1 * *"), "")
  assert.ok(scheduleSummary("0 0 3 1 * *").includes("0 0 3 1 * *"))
})

test("a blank name is omitted so the engine derives one", () => {
  const body = scheduleFormBody({ ...defaultScheduleForm("UTC"), name: "   " })

  assert.equal(body.name, null, "an empty string would store a nameless schedule")
  assert.equal(body.cronExpression, "0 0 9 * * *")
  assert.equal(body.timezone, "UTC")
  assert.equal(body.isActive, true)
  assert.equal(body.notifyPolicy, null)
})

test("a typed name is trimmed and sent", () => {
  const body = scheduleFormBody({ ...defaultScheduleForm("UTC"), name: "  Nightly login  " })

  assert.equal(body.name, "Nightly login")
})

test("a blank timezone becomes null so the client's timezone is inherited", () => {
  const body = scheduleFormBody({ ...defaultScheduleForm("   ") })

  assert.equal(body.timezone, null)
})

test("a notify policy is passed through, and blank means inherit", () => {
  assert.equal(
    scheduleFormBody({ ...defaultScheduleForm("UTC"), notifyPolicy: "on_failure" }).notifyPolicy,
    "on_failure",
  )
  assert.equal(scheduleFormBody({ ...defaultScheduleForm("UTC"), notifyPolicy: "" }).notifyPolicy, null)
})

test("a complete form has no error", () => {
  assert.equal(scheduleFormError(defaultScheduleForm("UTC")), null)
})

test("a missing timezone is refused before the request", () => {
  assert.equal(scheduleFormError(defaultScheduleForm("  ")), "testdef.schedule.errorTimezone")
})

test("a malformed time is refused for the frequencies that use one", () => {
  const form = { ...defaultScheduleForm("UTC"), frequency: "Every day", time: "9:5" }

  assert.equal(scheduleFormError(form), "testdef.schedule.errorTime")
})

test("a time is not required for an interval frequency", () => {
  const form = { ...defaultScheduleForm("UTC"), frequency: "Every 15 minutes", time: "" }

  assert.equal(scheduleFormError(form), null)
})

test("an expression that is not six fields is refused before the request", () => {
  const form = { ...defaultScheduleForm("UTC"), frequency: "0 0 3 * *" }

  assert.equal(scheduleFormError(form), "testdef.schedule.errorCron")
})

test("a live schedule sorts before a paused one, then by id", () => {
  const ordered = sortSchedules([
    schedule({ id: 5, isActive: false }),
    schedule({ id: 3, isActive: true }),
    schedule({ id: 1, isActive: true }),
    schedule({ id: 9, isActive: false }),
  ])

  assert.deepEqual(
    ordered.map((s) => s.id),
    [1, 3, 5, 9],
  )
})

test("sorting does not mutate the array it was given", () => {
  const input = [schedule({ id: 2, isActive: false }), schedule({ id: 1, isActive: true })]

  sortSchedules(input)

  assert.deepEqual(
    input.map((s) => s.id),
    [2, 1],
  )
})

test("a schedule with no explicit isActive flag counts as live", () => {
  // The engine only ever omits the flag when it is true, so treating a missing
  // flag as paused would hide a schedule that is actually firing.
  const withoutFlag = { ...schedule() } as DefinitionSchedule
  delete (withoutFlag as Partial<DefinitionSchedule>).isActive

  assert.equal(isLiveSchedule(withoutFlag), true)
  assert.equal(countLiveSchedules([withoutFlag, schedule({ id: 2, isActive: false })]), 1)
})

test("an empty schedule list counts zero live", () => {
  assert.equal(countLiveSchedules([]), 0)
})
