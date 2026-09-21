/**
 * Form state for a Test Definition schedule, kept out of the modal so the rules
 * that matter can be tested without a DOM.
 *
 * Everything here is a thin composition of the schedule helpers that already
 * exist for flow automations (`deriveCron`, `parseCronToForm`,
 * `describeFrequency`). A definition schedule and a flow schedule are the same
 * backend concept with a different target, so they must not grow two cron
 * dialects — this module exists so the modal never writes cron by hand.
 */

import {
  SCHEDULE_FREQUENCIES,
  deriveCron,
  describeFrequency,
  parseCronToForm,
} from "./automations"
import type { DefinitionSchedule, DefinitionScheduleInput } from "./api"

/** The frequency the form opens on when nothing is known yet. */
export const DEFAULT_SCHEDULE_FREQUENCY = "Every day"

/** The time the form opens on when nothing is known yet — 09:00, the same default flow automations use. */
export const DEFAULT_SCHEDULE_TIME = "09:00"

/** The form's editable state. `frequency` is one of {@link SCHEDULE_FREQUENCIES}. */
export type ScheduleForm = {
  frequency: string
  time: string
  timezone: string
  notifyPolicy: string
  name: string
}

export function defaultScheduleForm(timezone: string): ScheduleForm {
  return {
    frequency: DEFAULT_SCHEDULE_FREQUENCY,
    time: DEFAULT_SCHEDULE_TIME,
    timezone,
    notifyPolicy: "",
    name: "",
  }
}

/** True when the chosen frequency needs a time of day (everything except the interval presets). */
export function frequencyNeedsTime(frequency: string): boolean {
  return frequency === "Every day" || frequency === "Every week"
}

/**
 * The cron expression this form currently describes.
 *
 * Always derived, never typed: the engine validates with Spring's
 * {@code CronExpression}, which needs a leading seconds field, and a hand-typed
 * five-field expression is the most likely way to get a 400 here.
 *
 * A custom frequency (see {@link isCustomFrequency}) is returned verbatim, so an
 * expression the presets cannot express survives an edit of the other fields
 * instead of being silently replaced by the preset default.
 */
export function scheduleFormCron(form: ScheduleForm): string {
  if (isCustomFrequency(form.frequency)) return form.frequency.trim()
  return deriveCron(form.frequency, frequencyNeedsTime(form.frequency) ? form.time : "00:00")
}

/**
 * Rebuilds the form from a stored cron expression.
 *
 * A cron the form cannot represent (one created outside this UI) keeps its own
 * frequency token so the raw expression is never silently replaced by a preset
 * the user did not choose — {@link scheduleFormCron} then echoes the raw value
 * back unchanged, because `deriveCron` passes unknown tokens through.
 */
export function scheduleFormFromCron(cron: string, timezone: string): ScheduleForm {
  const parsed = parseCronToForm(cron)
  if (!parsed) {
    return { ...defaultScheduleForm(timezone), frequency: cron, time: DEFAULT_SCHEDULE_TIME }
  }
  return { ...defaultScheduleForm(timezone), frequency: parsed.frequency, time: parsed.time }
}

/** True when the form holds an expression the preset picker cannot express. */
export function isCustomFrequency(frequency: string): boolean {
  return !SCHEDULE_FREQUENCIES.includes(frequency)
}

/** A human summary of a cron expression, falling back to the raw expression. */
export function scheduleSummary(cron: string): string {
  const parsed = parseCronToForm(cron)
  if (parsed) return describeFrequency(parsed.frequency, parsed.time)
  return cron
}

/**
 * The request body for creating this schedule.
 *
 * A blank name is left out entirely rather than sent as an empty string: the
 * engine derives one from the definition's name, and an empty string would
 * store a nameless schedule.
 */
export function scheduleFormBody(form: ScheduleForm): DefinitionScheduleInput {
  return {
    name: form.name.trim() ? form.name.trim() : null,
    cronExpression: scheduleFormCron(form),
    timezone: form.timezone.trim() ? form.timezone.trim() : null,
    isActive: true,
    notifyPolicy: form.notifyPolicy.trim() ? form.notifyPolicy.trim() : null,
  }
}

/**
 * The i18n key of the first problem with this form, or null when it is ready to
 * submit. Checked before the request so the common mistakes cost no round trip;
 * the engine remains authoritative and its 400 is still displayed verbatim.
 */
export function scheduleFormError(form: ScheduleForm): string | null {
  const cron = scheduleFormCron(form)
  const fields = cron.trim().split(/\s+/)
  if (fields.length !== 6) return "testdef.schedule.errorCron"
  if (frequencyNeedsTime(form.frequency) && !/^\d{2}:\d{2}$/.test(form.time)) {
    return "testdef.schedule.errorTime"
  }
  if (!form.timezone.trim()) return "testdef.schedule.errorTimezone"
  return null
}

/** A schedule is "live" when the engine will actually fire it. */
export function isLiveSchedule(schedule: DefinitionSchedule): boolean {
  return schedule.isActive !== false
}

/**
 * A stable display order: live schedules first, then by id.
 *
 * The engine returns them oldest-first; a paused schedule is still worth
 * showing, but not worth showing first.
 */
export function sortSchedules(schedules: DefinitionSchedule[]): DefinitionSchedule[] {
  return [...schedules].sort((a, b) => {
    const live = Number(isLiveSchedule(b)) - Number(isLiveSchedule(a))
    return live !== 0 ? live : a.id - b.id
  })
}

/** How many of a definition's schedules the engine will actually fire. */
export function countLiveSchedules(schedules: DefinitionSchedule[]): number {
  return schedules.filter(isLiveSchedule).length
}
