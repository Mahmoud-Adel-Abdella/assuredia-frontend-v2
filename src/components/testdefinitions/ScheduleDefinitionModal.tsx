import { useCallback, useEffect, useMemo, useState } from "react"

import {
  NOTIFY_POLICY_OPTIONS,
  SCHEDULE_FREQUENCIES,
  TIMEZONE_OPTIONS,
  frequencyLabel,
  getAccountTimezone,
} from "../../lib/automations"
import {
  apiCreateDefinitionSchedule,
  apiDeleteDefinitionSchedule,
  apiListDefinitionSchedules,
  type DefinitionSchedule,
} from "../../lib/api"
import {
  countLiveSchedules,
  defaultScheduleForm,
  frequencyNeedsTime,
  isCustomFrequency,
  isLiveSchedule,
  scheduleFormBody,
  scheduleFormCron,
  scheduleFormError,
  scheduleSummary,
  sortSchedules,
  type ScheduleForm,
} from "../../lib/definitionSchedule"
import { mapTestDefinitionFailure } from "../../lib/testDefinitionLifecycle"
import { useLang } from "../../lib/i18n"
import { Alert, Button, FormField, Input, Modal, Select, Spinner, cx } from "../primitives"

/**
 * Schedule a Test Definition.
 *
 * A definition is usable without a Flow, so it must also be schedulable without
 * one — that is the whole point of this dialog. The engine stores the result as
 * an ordinary execution plan whose single item targets the definition, so what
 * appears in the flow-schedule list afterwards is the same kind of object.
 *
 * Two things are deliberately NOT offered here:
 *
 *  - A version picker. A schedule names a DEFINITION, and the engine resolves the
 *    version when the trigger fires. Pinning a version would silently freeze the
 *    test at whatever was current when someone clicked Schedule, which is the
 *    opposite of what continuous testing means.
 *  - An "enabled" toggle. A schedule is created live; pausing it is the existing
 *    flow-schedule editor's job, on the object this dialog creates.
 */
export function ScheduleDefinitionModal({
  open,
  clientId,
  definitionId,
  definitionName,
  onClose,
  onChanged,
}: {
  open: boolean
  clientId: number
  definitionId: number
  definitionName: string
  onClose: () => void
  onChanged?: () => void
}) {
  const { t } = useLang()

  const [form, setForm] = useState<ScheduleForm>(() => defaultScheduleForm("UTC"))
  const [schedules, setSchedules] = useState<DefinitionSchedule[]>([])
  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)
  const [removingId, setRemovingId] = useState<number | null>(null)
  const [removeError, setRemoveError] = useState<string | null>(null)

  const reload = useCallback(async () => {
    setLoading(true)
    setLoadError(null)
    try {
      setSchedules(await apiListDefinitionSchedules(clientId, definitionId))
    } catch (err) {
      setLoadError(mapTestDefinitionFailure(err).message)
    } finally {
      setLoading(false)
    }
  }, [clientId, definitionId])

  /* The form starts from the account timezone rather than UTC: an inherited
     timezone is what the engine stores when the field is blank, and showing the
     user the timezone their schedule will actually run in is the difference
     between "daily at 09:00" meaning what they think it means and not. */
  useEffect(() => {
    if (!open) return
    setForm(defaultScheduleForm(getAccountTimezone()))
    setCreateError(null)
    setRemoveError(null)
    void reload()
  }, [open, reload])

  const cron = useMemo(() => scheduleFormCron(form), [form])
  const formError = useMemo(() => scheduleFormError(form), [form])
  const ordered = useMemo(() => sortSchedules(schedules), [schedules])
  const liveCount = countLiveSchedules(schedules)

  const timezoneOptions = useMemo(() => {
    const values = new Set([form.timezone, ...TIMEZONE_OPTIONS].filter(Boolean))
    return Array.from(values).map((value) => ({ value, label: value }))
  }, [form.timezone])

  const frequencyOptions = useMemo(() => {
    const options = SCHEDULE_FREQUENCIES.map((f) => ({ value: f, label: frequencyLabel(f) }))
    if (isCustomFrequency(form.frequency)) {
      options.unshift({ value: form.frequency, label: form.frequency })
    }
    return options
  }, [form.frequency])

  async function create() {
    if (formError) return
    setCreating(true)
    setCreateError(null)
    try {
      await apiCreateDefinitionSchedule(clientId, definitionId, scheduleFormBody(form))
      setForm((current) => ({ ...current, name: "" }))
      await reload()
      onChanged?.()
    } catch (err) {
      setCreateError(mapTestDefinitionFailure(err).message)
    } finally {
      setCreating(false)
    }
  }

  async function remove(planId: number) {
    setRemovingId(planId)
    setRemoveError(null)
    try {
      await apiDeleteDefinitionSchedule(clientId, definitionId, planId)
      await reload()
      onChanged?.()
    } catch (err) {
      setRemoveError(mapTestDefinitionFailure(err).message)
    } finally {
      setRemovingId(null)
    }
  }

  return (
    <Modal
      isOpen={open}
      onClose={onClose}
      title={t("testdef.schedule.title")}
      description={t("testdef.schedule.subtitle", { name: definitionName })}
      size="lg"
      footer={
        <div className="flex items-center justify-between gap-3">
          <span className="text-[11px] text-slate-400" data-testid="schedule-preview">
            {scheduleSummary(cron)}
          </span>
          <div className="flex items-center gap-2">
            <Button variant="secondary" onClick={onClose}>
              {t("common.close")}
            </Button>
            <Button
              variant="primary"
              data-testid="schedule-submit"
              loading={creating}
              disabled={creating || formError !== null}
              onClick={() => void create()}
            >
              {t("testdef.schedule.create")}
            </Button>
          </div>
        </div>
      }
    >
      <div className="space-y-5">
        {/* ── The form ────────────────────────────────────────────────── */}
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField
            label={t("testdef.schedule.frequency")}
            htmlFor="schedule-frequency"
            required
          >
            <Select
              id="schedule-frequency"
              data-testid="schedule-frequency"
              value={form.frequency}
              options={frequencyOptions}
              onChange={(e) => setForm({ ...form, frequency: e.target.value })}
            />
          </FormField>

          {frequencyNeedsTime(form.frequency) && (
            <FormField label={t("testdef.schedule.time")} htmlFor="schedule-time" required>
              <Input
                id="schedule-time"
                data-testid="schedule-time"
                type="time"
                value={form.time}
                onChange={(e) => setForm({ ...form, time: e.target.value })}
              />
            </FormField>
          )}

          <FormField
            label={t("testdef.schedule.timezone")}
            htmlFor="schedule-timezone"
            hint={t("testdef.schedule.timezoneHint")}
          >
            <Select
              id="schedule-timezone"
              data-testid="schedule-timezone"
              value={form.timezone}
              options={timezoneOptions}
              onChange={(e) => setForm({ ...form, timezone: e.target.value })}
            />
          </FormField>

          <FormField
            label={t("testdef.schedule.notify")}
            htmlFor="schedule-notify"
            hint={t("testdef.schedule.notifyHint")}
          >
            <Select
              id="schedule-notify"
              data-testid="schedule-notify"
              value={form.notifyPolicy}
              options={[
                { value: "", label: t("testdef.schedule.notifyInherit") },
                ...NOTIFY_POLICY_OPTIONS.map((o) => ({ value: o.value, label: t(o.labelKey) })),
              ]}
              onChange={(e) => setForm({ ...form, notifyPolicy: e.target.value })}
            />
          </FormField>

          <div className="sm:col-span-2">
            <FormField
              label={t("testdef.schedule.name")}
              htmlFor="schedule-name"
              hint={t("testdef.schedule.nameHint", { name: definitionName })}
            >
              <Input
                id="schedule-name"
                data-testid="schedule-name"
                value={form.name}
                placeholder={t("testdef.schedule.namePlaceholder", { name: definitionName })}
                maxLength={120}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </FormField>
          </div>
        </div>

        <p
          className="rounded-xl bg-slate-100 px-4 py-3 text-[12px] text-slate-600"
          dir="auto"
        >
          <span className="font-semibold">{scheduleSummary(cron)}</span>
          <span className="mx-1.5 text-slate-400">·</span>
          <span className="font-mono text-[11px]" dir="ltr">
            {cron}
          </span>
        </p>

        {formError && (
          <p role="alert" className="text-[12px] text-error">
            {t(formError)}
          </p>
        )}

        {createError && (
          <Alert tone="error" title={t("testdef.schedule.createFailed")}>
            {createError}
          </Alert>
        )}

        {/* ── Existing schedules ──────────────────────────────────────── */}
        <div className="border-t border-slate-200 pt-4">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-[12px] font-semibold text-slate-500">
              {t("testdef.schedule.existing")}
            </h3>
            {schedules.length > 0 && (
              <span className="text-[11px] text-slate-400" data-testid="schedule-live-count">
                {t("testdef.schedule.liveCount", {
                  live: liveCount,
                  total: schedules.length,
                })}
              </span>
            )}
          </div>

          {removeError && (
            <p role="alert" className="mb-2 text-[12px] text-error">
              {removeError}
            </p>
          )}

          {loading && schedules.length === 0 ? (
            <div className="flex items-center gap-2 py-3 text-[12px] text-slate-400">
              <Spinner size="sm" />
              {t("common.loading")}
            </div>
          ) : loadError ? (
            <div className="space-y-2">
              <p role="alert" className="text-[12px] text-error">
                {loadError}
              </p>
              <Button variant="secondary" size="sm" onClick={() => void reload()}>
                {t("common.retry")}
              </Button>
            </div>
          ) : ordered.length === 0 ? (
            <p className="py-2 text-[12px] text-slate-400" data-testid="schedule-empty">
              {t("testdef.schedule.none")}
            </p>
          ) : (
            <ul className="divide-y divide-slate-200" data-testid="schedule-list">
              {ordered.map((schedule) => (
                <li
                  key={schedule.id}
                  data-testid={`schedule-row-${schedule.id}`}
                  className="flex flex-wrap items-center gap-3 py-2.5"
                >
                  <span
                    className={cx(
                      "inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold",
                      isLiveSchedule(schedule)
                        ? "bg-emerald-100 text-emerald-700"
                        : "bg-slate-200 text-slate-600",
                    )}
                  >
                    {isLiveSchedule(schedule)
                      ? t("testdef.schedule.live")
                      : t("testdef.schedule.paused")}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-medium text-slate-700">
                      {schedule.name}
                    </p>
                    <p className="text-[11px] text-slate-400">
                      {scheduleSummary(schedule.cronExpression)}
                      {schedule.timezone ? ` · ${schedule.timezone}` : ""}
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    data-testid={`schedule-remove-${schedule.id}`}
                    loading={removingId === schedule.id}
                    disabled={removingId !== null}
                    onClick={() => void remove(schedule.id)}
                  >
                    {t("testdef.schedule.remove")}
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <p className="text-[11px] text-slate-400">{t("testdef.schedule.versionNote")}</p>
      </div>
    </Modal>
  )
}

export default ScheduleDefinitionModal
