import React, { useEffect, useState } from "react"
import { Button, Card, cx } from "../primitives"
import { useLang } from "../../lib/i18n"
import { useAuth } from "../../lib/auth"
import { useToast } from "../primitives"
import { ApiError, apiCreateClient } from "../../lib/api"

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */
type Browser = "Chrome" | "Firefox" | "Edge"
type Device = "Desktop" | "Tablet" | "Mobile" | "Custom"

type FormData = {
  clientName: string
  clientId: string
  website: string
  plan: string
  region: string
  browser: Browser
  device: Device
  headless: boolean
  timeout: string
  retryCount: string
  appUsername: string
  appPassword: string
}

type Errors = Partial<Record<keyof FormData, string>>

const DEFAULTS: FormData = {
  clientName: "",
  clientId: "",
  website: "",
  plan: "Professional",
  region: "us-east-1",
  browser: "Chrome",
  device: "Desktop",
  headless: true,
  timeout: "60",
  retryCount: "1",
  appUsername: "",
  appPassword: "",
}

/* Device token → i18n label key (tokens themselves never change). */
const DEVICE_LABEL_KEY: Record<Device, string> = {
  Desktop: "onb.device.desktop",
  Tablet: "onb.device.tablet",
  Mobile: "onb.device.mobile",
  Custom: "onb.device.custom",
}

function slugify(s: string) {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
}

function isValidUrl(s: string) {
  try {
    const url = new URL(s.startsWith("http") ? s : `https://${s}`)
    return !!url.hostname
  } catch {
    return false
  }
}

/* ------------------------------------------------------------------ */
/* Reusable field components                                          */
/* ------------------------------------------------------------------ */
function FieldLabel({ htmlFor, children, required }: { htmlFor: string; children: React.ReactNode; required?: boolean }) {
  return (
    <label htmlFor={htmlFor} className="mb-1.5 flex items-center gap-1 text-[12px] font-semibold text-slate-500">
      {children}
      {required && <span className="text-error">*</span>}
    </label>
  )
}

function FieldHint({ children }: { children: React.ReactNode }) {
  return <p className="mt-1 text-[11px] text-slate-400">{children}</p>
}

function FieldError({ msg }: { msg?: string }) {
  if (!msg) return null
  return (
    <p className="mt-1 flex items-center gap-1 text-[11px] text-error">
      <svg className="size-3 shrink-0" viewBox="0 0 20 20" fill="currentColor">
        <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 002 0V6a1 1 0 00-1-1z" />
      </svg>
      {msg}
    </p>
  )
}

function TextInput({
  id,
  value,
  onChange,
  placeholder,
  type = "text",
  error,
  prefix,
}: {
  id: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
  type?: string
  error?: string
  prefix?: string
}) {
  return (
    <div>
      <div className={cx("flex overflow-hidden rounded-lg border transition-colors focus-within:ring-2 focus-within:ring-brand-400", error ? "border-red-400" : "border-slate-200")}>
        {prefix && (
          <span className="flex items-center border-e border-slate-200 bg-elevated px-3 text-[12px] text-slate-400">
            {prefix}
          </span>
        )}
        <input
          id={id}
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="block flex-1 bg-elevated px-3.5 py-2.5 text-[13px] text-slate-700 placeholder-slate-400 focus:outline-none"
        />
      </div>
      <FieldError msg={error} />
    </div>
  )
}

function SelectInput({
  id,
  value,
  onChange,
  options,
}: {
  id: string
  value: string
  onChange: (v: string) => void
  options: { value: string; label: string }[]
}) {
  return (
    <select
      id={id}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="block w-full rounded-lg border border-slate-200 bg-elevated px-3.5 py-2.5 text-[13px] text-slate-700 focus:outline-none focus:ring-2 focus:ring-brand-400"
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </select>
  )
}

function NumberInput({
  id,
  value,
  onChange,
  min,
  max,
  error,
  suffix,
}: {
  id: string
  value: string
  onChange: (v: string) => void
  min?: number
  max?: number
  error?: string
  suffix?: string
}) {
  return (
    <div>
      <div className={cx("flex overflow-hidden rounded-lg border transition-colors focus-within:ring-2 focus-within:ring-brand-400", error ? "border-red-400" : "border-slate-200")}>
        <input
          id={id}
          type="number"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          min={min}
          max={max}
          className="block w-full bg-elevated px-3.5 py-2.5 font-mono text-[13px] text-slate-700 focus:outline-none"
        />
        {suffix && (
          <span className="flex items-center border-s border-slate-200 bg-elevated px-3 text-[12px] text-slate-400">
            {suffix}
          </span>
        )}
      </div>
      <FieldError msg={error} />
    </div>
  )
}

function PasswordInput({
  id,
  value,
  onChange,
  placeholder,
  error,
}: {
  id: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
  error?: string
}) {
  const { t } = useLang()
  const [show, setShow] = useState(false)
  return (
    <div>
      <div className={cx("flex overflow-hidden rounded-lg border transition-colors focus-within:ring-2 focus-within:ring-brand-400", error ? "border-red-400" : "border-slate-200")}>
        <input
          id={id}
          type={show ? "text" : "password"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder ?? "••••••••"}
          autoComplete="new-password"
          className="block flex-1 bg-elevated px-3.5 py-2.5 text-[13px] text-slate-700 placeholder-slate-400 focus:outline-none"
        />
        <button
          type="button"
          tabIndex={-1}
          onClick={() => setShow((v) => !v)}
          className="flex items-center border-s border-slate-200 bg-elevated px-3 text-slate-400 hover:text-slate-600"
          aria-label={show ? t("admin.create.hidePassword") : t("admin.create.showPassword")}
        >
          {show ? (
            <svg className="size-4" viewBox="0 0 20 20" fill="currentColor">
              <path d="M10 12a2 2 0 100-4 2 2 0 000 4z" />
              <path fillRule="evenodd" d="M.458 10C1.732 5.943 5.522 3 10 3s8.268 2.943 9.542 7c-1.274 4.057-5.064 7-9.542 7S1.732 14.057.458 10zM14 10a4 4 0 11-8 0 4 4 0 018 0z" />
            </svg>
          ) : (
            <svg className="size-4" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M3.707 2.293a1 1 0 00-1.414 1.414l14 14a1 1 0 001.414-1.414l-1.473-1.473A10.014 10.014 0 0019.542 10C18.268 5.943 14.478 3 10 3a9.958 9.958 0 00-4.512 1.074l-1.78-1.781zm4.261 4.26l1.514 1.515a2.003 2.003 0 012.45 2.45l1.514 1.514a4 4 0 00-5.478-5.478z" />
              <path d="M12.454 16.697L9.75 13.992a4 4 0 01-3.742-3.741L2.335 6.578A9.98 9.98 0 00.458 10c1.274 4.057 5.064 7 9.542 7 .847 0 1.669-.105 2.454-.303z" />
            </svg>
          )}
        </button>
      </div>
      <FieldError msg={error} />
    </div>
  )
}

function Toggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={() => onChange(!on)}
      className={cx(
        "relative inline-flex h-6 w-11 shrink-0 rounded-full border-2 border-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400",
        on ? "bg-brand-900" : "bg-slate-200",
      )}
    >
      <span className={cx("pointer-events-none inline-block size-4 rounded-full bg-white shadow ring-0 transition-transform mt-0.5", on ? "ltr:translate-x-5 rtl:-translate-x-5" : "translate-x-0")} />
    </button>
  )
}

/* ------------------------------------------------------------------ */
/* Selection tile (browser / device)                                  */
/* ------------------------------------------------------------------ */
function TileGroup<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T
  onChange: (v: T) => void
  options: { value: T; label: string; icon: React.ReactNode }[]
}) {
  return (
    <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${options.length}, 1fr)` }}>
      {options.map((opt) => {
        const active = value === opt.value
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            className={cx(
              "flex flex-col items-center gap-2 rounded-lg border px-3 py-3.5 text-center text-[12px] font-medium transition-all",
              active
                ? "border-brand-600 bg-brand-50 text-brand-300 ring-1 ring-brand-600/30"
                : "border-slate-200 bg-elevated text-slate-500 hover:border-slate-300 hover:bg-slate-50",
            )}
          >
            <span className={cx("transition-colors", active ? "text-brand-400" : "text-slate-400")}>
              {opt.icon}
            </span>
            {opt.label}
          </button>
        )
      })}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Progress sidebar / strip                                           */
/* ------------------------------------------------------------------ */
const STEPS = [
  { n: 1, titleKey: "admin.create.step1", descKey: "admin.create.step1Desc" },
  { n: 2, titleKey: "admin.create.step2", descKey: "admin.create.step2Desc" },
  { n: 3, titleKey: "admin.create.step3", descKey: "admin.create.step3Desc" },
  { n: 4, titleKey: "admin.create.step4", descKey: "admin.create.step4Desc" },
]

function StepSidebar({ current, data }: { current: number; data: FormData }) {
  const { t } = useLang()
  return (
    <div className="space-y-6">
      {/* Steps */}
      <Card className="p-4">
        <h3 className="mb-3 text-[11px] font-semibold uppercase tracking-wide text-slate-400">{t("admin.create.progress")}</h3>
        <ol className="space-y-1">
          {STEPS.map((step) => {
            const done = current > step.n
            const active = current === step.n
            return (
              <li key={step.n} className="flex items-start gap-3 py-1.5">
                <span
                  className={cx(
                    "mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold",
                    done
                      ? "bg-success text-white"
                      : active
                        ? "bg-brand-900 text-white"
                        : "border border-slate-200 bg-elevated text-slate-400",
                  )}
                >
                  {done ? (
                    <svg className="size-3.5" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M16.7 5.3a1 1 0 010 1.4l-7.5 7.5a1 1 0 01-1.4 0L3.3 9.7a1 1 0 011.4-1.4l3.1 3.1 6.8-6.8a1 1 0 011.4 0z" />
                    </svg>
                  ) : (
                    step.n
                  )}
                </span>
                <div className="min-w-0">
                  <p className={cx("text-[13px] font-semibold", active ? "text-navy" : done ? "text-slate-600" : "text-slate-400")}>
                    {t(step.titleKey)}
                  </p>
                  <p className="text-[11px] text-slate-400">{t(step.descKey)}</p>
                </div>
              </li>
            )
          })}
        </ol>
      </Card>

      {/* Live summary */}
      {current > 1 && (
        <Card className="p-4">
          <h3 className="mb-3 text-[11px] font-semibold uppercase tracking-wide text-slate-400">{t("admin.create.soFar")}</h3>
          <dl className="space-y-2.5">
            {data.clientName && (
              <SummaryRow label={t("run.client")} value={data.clientName} />
            )}
            {data.website && (
              <SummaryRow label={t("onb.website")} value={data.website} />
            )}
            {current > 2 && (
              <>
                <SummaryRow label={t("onb.browser")} value={data.browser} />
                <SummaryRow label={t("onb.device")} value={t(DEVICE_LABEL_KEY[data.device])} />
                <SummaryRow label={t("onb.headless")} value={data.headless ? t("common.yes") : t("common.no")} />
                <SummaryRow label={t("onb.timeoutShort")} value={`${data.timeout}${t("onb.secondsShort")}`} />
              </>
            )}
            {current > 3 && data.appUsername && (
              <SummaryRow label={t("admin.create.appUser")} value={data.appUsername} />
            )}
          </dl>
        </Card>
      )}
    </div>
  )
}

function SummaryRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <dt className="text-[11px] text-slate-400">{label}</dt>
      <dd className={cx("text-end text-[12px] font-medium text-slate-600", mono && "font-mono")}>{value}</dd>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Step progress strip (mobile)                                       */
/* ------------------------------------------------------------------ */
function StepStrip({ current }: { current: number }) {
  const { t } = useLang()
  return (
    <div className="flex items-center gap-1.5">
      {STEPS.map((step, i) => {
        const done = current > step.n
        const active = current === step.n
        return (
          <React.Fragment key={step.n}>
            <div className="flex items-center gap-1.5">
              <span
                className={cx(
                  "flex size-6 items-center justify-center rounded-full text-[11px] font-bold",
                  done
                    ? "bg-success text-white"
                    : active
                      ? "bg-brand-900 text-white"
                      : "border border-slate-200 bg-elevated text-slate-400",
                )}
              >
                {done ? (
                  <svg className="size-3" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M16.7 5.3a1 1 0 010 1.4l-7.5 7.5a1 1 0 01-1.4 0L3.3 9.7a1 1 0 011.4-1.4l3.1 3.1 6.8-6.8a1 1 0 011.4 0z" />
                  </svg>
                ) : step.n}
              </span>
              {active && <span className="text-[12px] font-semibold text-navy">{t(step.titleKey)}</span>}
            </div>
            {i < STEPS.length - 1 && (
              <div className={cx("h-px flex-1", done ? "bg-success" : "bg-slate-200")} />
            )}
          </React.Fragment>
        )
      })}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Section wrapper                                                    */
/* ------------------------------------------------------------------ */
function Section({
  number,
  title,
  description,
  children,
}: {
  number: number
  title: string
  description: string
  children: React.ReactNode
}) {
  return (
    <div className="space-y-5">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-brand-300">
          {String(number).padStart(2, "0")}
        </p>
        <h2 className="mt-0.5 font-display text-lg font-bold tracking-tight text-navy">{title}</h2>
        <p className="mt-1 text-[13px] text-slate-500">{description}</p>
      </div>
      {children}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Step 1 — Client Information                                        */
/* ------------------------------------------------------------------ */
function Step1({
  data,
  errors,
  onChange,
}: {
  data: FormData
  errors: Errors
  onChange: (key: keyof FormData, value: string | boolean) => void
}) {
  const { t } = useLang()
  return (
    <Section number={1} title={t("admin.create.step1")} description={t("admin.create.s1Desc")}>
      <Card className="divide-y divide-slate-100">
        <div className="p-5">
          <FieldLabel htmlFor="clientName" required>{t("admin.create.clientName")}</FieldLabel>
          <TextInput
            id="clientName"
            value={data.clientName}
            onChange={(v) => onChange("clientName", v)}
            placeholder="Northwind Cloud"
            error={errors.clientName}
          />
          <FieldHint>{t("admin.create.clientNameHint")}</FieldHint>
        </div>

        <div className="p-5">
          <FieldLabel htmlFor="clientId" required>{t("admin.create.clientId")}</FieldLabel>
          <TextInput
            id="clientId"
            value={data.clientId}
            onChange={(v) => onChange("clientId", v)}
            placeholder="northwind-cloud"
            error={errors.clientId}
          />
          <FieldHint>
            {t("admin.create.clientIdHint")}
          </FieldHint>
        </div>

        <div className="p-5">
          <FieldLabel htmlFor="website" required>{t("admin.create.websiteUrl")}</FieldLabel>
          <TextInput
            id="website"
            value={data.website}
            onChange={(v) => onChange("website", v)}
            placeholder="https://app.northwindcloud.io"
            type="url"
            error={errors.website}
          />
          <FieldHint>{t("admin.create.websiteHint")}</FieldHint>
        </div>

        <div className="grid grid-cols-2 gap-0 divide-x divide-slate-100">
          <div className="p-5">
            <FieldLabel htmlFor="plan">{t("admin.plan")}</FieldLabel>
            <SelectInput
              id="plan"
              value={data.plan}
              onChange={(v) => onChange("plan", v)}
              options={[
                { value: "Starter", label: "Starter" },
                { value: "Professional", label: "Professional" },
                { value: "Enterprise", label: "Enterprise" },
              ]}
            />
          </div>
          <div className="p-5">
            <FieldLabel htmlFor="region">{t("admin.region")}</FieldLabel>
            <SelectInput
              id="region"
              value={data.region}
              onChange={(v) => onChange("region", v)}
              options={[
                { value: "us-east-1", label: "US East (N. Virginia)" },
                { value: "us-west-2", label: "US West (Oregon)" },
                { value: "eu-west-1", label: "EU West (Ireland)" },
                { value: "ap-southeast-1", label: "Asia Pacific (Singapore)" },
              ]}
            />
          </div>
        </div>
      </Card>
    </Section>
  )
}

/* ------------------------------------------------------------------ */
/* Step 2 — Runtime Configuration                                     */
/* ------------------------------------------------------------------ */
const BROWSER_ICONS: Record<Browser, React.ReactNode> = {
  Chrome: (
    <svg className="size-6" viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.6" />
      <circle cx="12" cy="12" r="4" fill="currentColor" opacity="0.3" />
      <path d="M12 8h8.5M7.4 15.5L3 8M16.6 15.5L12 23" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  ),
  Firefox: (
    <svg className="size-6" viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.6" />
      <path d="M12 3C12 3 8 7 8 12s4 9 9 9" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <circle cx="12" cy="12" r="3.5" fill="currentColor" opacity="0.35" />
    </svg>
  ),
  Edge: (
    <svg className="size-6" viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.6" />
      <path d="M7 12c0-2.8 2-5 5-5a5 5 0 011 9.9C10 17.5 7 16 7 13h9" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
}

const DEVICE_ICONS: Record<Device, React.ReactNode> = {
  Desktop: (
    <svg className="size-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
      <rect x="2" y="3" width="20" height="14" rx="2" />
      <path strokeLinecap="round" d="M8 21h8M12 17v4" />
    </svg>
  ),
  Tablet: (
    <svg className="size-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
      <rect x="4" y="2" width="16" height="20" rx="2" />
      <circle cx="12" cy="18" r="1" fill="currentColor" />
    </svg>
  ),
  Mobile: (
    <svg className="size-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
      <rect x="6" y="2" width="12" height="20" rx="3" />
      <circle cx="12" cy="18" r="1" fill="currentColor" />
    </svg>
  ),
  Custom: (
    <svg className="size-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 8V4m0 0h4M4 4l5 5M20 8V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5M20 16v4m0 0h-4m4 0l-5-5" />
    </svg>
  ),
}

function Step2({
  data,
  errors,
  onChange,
}: {
  data: FormData
  errors: Errors
  onChange: (key: keyof FormData, value: string | boolean) => void
}) {
  const { t } = useLang()
  return (
    <Section number={2} title={t("admin.create.step2")} description={t("admin.create.s2Desc")}>
      <div className="space-y-4">
        {/* Browser */}
        <Card className="p-5">
          <h3 className="mb-3 text-[12px] font-semibold text-slate-600">{t("onb.browser")}</h3>
          <TileGroup
            value={data.browser}
            onChange={(v: Browser) => onChange("browser", v)}
            options={(["Chrome", "Firefox", "Edge"] as Browser[]).map((b) => ({
              value: b,
              label: b,
              icon: BROWSER_ICONS[b],
            }))}
          />
        </Card>

        {/* Device */}
        <Card className="p-5">
          <h3 className="mb-3 text-[12px] font-semibold text-slate-600">{t("onb.device")}</h3>
          <TileGroup
            value={data.device}
            onChange={(v: Device) => onChange("device", v)}
            options={(["Desktop", "Tablet", "Mobile", "Custom"] as Device[]).map((d) => ({
              value: d,
              label: t(DEVICE_LABEL_KEY[d]),
              icon: DEVICE_ICONS[d],
            }))}
          />
        </Card>

        {/* Headless + Timeouts */}
        <Card className="divide-y divide-slate-100">
          <div className="flex items-center justify-between p-5">
            <div>
              <p className="text-[13px] font-semibold text-slate-700">{t("onb.headless")}</p>
              <p className="mt-0.5 text-[12px] text-slate-400">{t("onb.headlessHint")}</p>
            </div>
            <Toggle on={data.headless} onChange={(v) => onChange("headless", v)} />
          </div>

          <div className="grid grid-cols-2 divide-x divide-slate-100">
            <div className="p-5">
              <FieldLabel htmlFor="timeout">{t("onb.timeoutLabel")}</FieldLabel>
              <NumberInput
                id="timeout"
                value={data.timeout}
                onChange={(v) => onChange("timeout", v)}
                min={10}
                max={600}
                suffix={t("onb.secondsShort")}
                error={errors.timeout}
              />
              <FieldHint>{t("onb.timeoutHint")}</FieldHint>
            </div>
            <div className="p-5">
              <FieldLabel htmlFor="retryCount">{t("onb.retryLabel")}</FieldLabel>
              <NumberInput
                id="retryCount"
                value={data.retryCount}
                onChange={(v) => onChange("retryCount", v)}
                min={0}
                max={5}
                error={errors.retryCount}
              />
              <FieldHint>{t("onb.retryHint")}</FieldHint>
            </div>
          </div>
        </Card>
      </div>
    </Section>
  )
}

/* ------------------------------------------------------------------ */
/* Step 3 — Application Access                                        */
/* ------------------------------------------------------------------ */
function Step3({
  data,
  errors,
  onChange,
}: {
  data: FormData
  errors: Errors
  onChange: (key: keyof FormData, value: string | boolean) => void
}) {
  const { t } = useLang()
  return (
    <Section number={3} title={t("admin.create.step3")} description={t("admin.create.s3Desc")}>
      {/* Security callout */}
      <div className="flex items-start gap-3 rounded-lg border border-brand-200 bg-brand-50 px-4 py-3.5">
        <svg className="mt-0.5 size-4 shrink-0 text-brand-400" viewBox="0 0 20 20" fill="currentColor">
          <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" />
        </svg>
        <div>
          <p className="text-[12px] font-semibold text-brand-300">{t("admin.create.credTitle")}</p>
          <p className="mt-0.5 text-[12px] leading-relaxed text-slate-500">
            {t("admin.create.credNote")}
          </p>
        </div>
      </div>

      <Card className="divide-y divide-slate-100">
        <div className="p-5">
          <FieldLabel htmlFor="appUsername">{t("onb.appUsername")}</FieldLabel>
          <TextInput
            id="appUsername"
            value={data.appUsername}
            onChange={(v) => onChange("appUsername", v)}
            placeholder="testuser@company.com"
            error={errors.appUsername}
          />
          <FieldHint>
            {t("onb.appUsernameHint")}
          </FieldHint>
        </div>

        <div className="p-5">
          <FieldLabel htmlFor="appPassword">{t("onb.appPassword")}</FieldLabel>
          <PasswordInput
            id="appPassword"
            value={data.appPassword}
            onChange={(v) => onChange("appPassword", v)}
            error={errors.appPassword}
          />
          <FieldHint>
            {t("onb.appPasswordHint")}
          </FieldHint>
        </div>
      </Card>
    </Section>
  )
}

/* ------------------------------------------------------------------ */
/* Step 4 — Review & Create                                           */
/* ------------------------------------------------------------------ */
function ReviewRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2.5">
      <span className="text-[12px] text-slate-400">{label}</span>
      <span className={cx("text-end text-[13px] font-medium text-slate-700", mono && "font-mono")}>{value}</span>
    </div>
  )
}

function ReviewSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">{title}</h3>
      <div className="divide-y divide-slate-100 rounded-lg border border-slate-200 bg-elevated px-4">
        {children}
      </div>
    </div>
  )
}

function Step4({ data }: { data: FormData }) {
  const { t } = useLang()
  return (
    <Section number={4} title={t("admin.create.step4")} description={t("admin.create.s4Desc")}>
      <div className="space-y-4">
        <ReviewSection title={t("admin.create.step1")}>
          <ReviewRow label={t("admin.create.clientName")} value={data.clientName} />
          <ReviewRow label={t("admin.create.clientId")} value={data.clientId} mono />
          <ReviewRow label={t("onb.website")} value={data.website} />
          <ReviewRow label={t("admin.plan")} value={data.plan} />
          <ReviewRow label={t("admin.region")} value={data.region} mono />
        </ReviewSection>

        <ReviewSection title={t("admin.create.step2")}>
          <ReviewRow label={t("onb.browser")} value={data.browser} />
          <ReviewRow label={t("onb.device")} value={t(DEVICE_LABEL_KEY[data.device])} />
          <ReviewRow label={t("onb.headless")} value={data.headless ? t("common.enabled") : t("common.disabled")} />
          <ReviewRow label={t("onb.timeoutLabel")} value={t("onb.seconds", { n: data.timeout })} />
          <ReviewRow label={t("onb.retryLabel")} value={data.retryCount} />
        </ReviewSection>

        <ReviewSection title={t("admin.create.step3")}>
          <ReviewRow
            label={t("onb.appUsername")}
            value={data.appUsername || t("admin.create.notConfigured")}
          />
          <ReviewRow
            label={t("onb.appPassword")}
            value={data.appPassword ? t("onb.passwordConfigured") : t("admin.create.notConfigured")}
          />
        </ReviewSection>
      </div>
    </Section>
  )
}

/* ------------------------------------------------------------------ */
/* Success state                                                      */
/* ------------------------------------------------------------------ */
function SuccessState({ clientName, clientId, onOpenClient, onBack }: { clientName: string; onOpenClient: (clientId: number) => void; onBack: () => void; clientId: number }) {
  const { t } = useLang()
  return (
    <div className="flex flex-1 flex-col items-center justify-center py-20 text-center">
      <div className="flex size-16 items-center justify-center rounded-2xl bg-emerald-50 text-success">
        <svg className="size-8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6l7-3z" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4" />
        </svg>
      </div>
      <h2 className="mt-5 font-display text-2xl font-bold tracking-tight text-navy">
        {t("admin.create.successTitle")}
      </h2>
      <p className="mt-2 text-[14px] text-slate-500">
        {t("admin.create.successDesc", { name: clientName })}
      </p>

      <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row">
        <Button variant="primary" onClick={() => onOpenClient(clientId)}>
          <svg className="size-4 rtl:-scale-x-100" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M10.293 3.293a1 1 0 011.414 0l6 6a1 1 0 010 1.414l-6 6a1 1 0 01-1.414-1.414L14.586 11H3a1 1 0 110-2h11.586l-4.293-4.293a1 1 0 010-1.414z" />
          </svg>
          {t("admin.create.openClient")}
        </Button>
        <Button variant="secondary" onClick={onBack}>
          {t("admin.clients.back")}
        </Button>
      </div>

      <div className="mt-8 flex items-center gap-6 text-[12px] text-slate-400">
        <span className="flex items-center gap-1.5">
          <span className="size-1.5 rounded-full bg-slate-300" />
          {t("admin.create.nextFlows")}
        </span>
        <span className="flex items-center gap-1.5">
          <span className="size-1.5 rounded-full bg-slate-300" />
          {t("admin.create.nextSchedules")}
        </span>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Main component                                                     */
/* ------------------------------------------------------------------ */
export function CreateClient({
  onBack,
  onOpenClient,
}: {
  onBack: () => void
  /** Called with the created client's real id when "Open Client" is pressed. */
  onOpenClient?: (clientId: number) => void
}) {
  const { t } = useLang()
  const toast = useToast()
  const { logout } = useAuth()
  const [step, setStep] = useState(1)
  const [data, setData] = useState<FormData>(DEFAULTS)
  const [errors, setErrors] = useState<Errors>({})
  const [creating, setCreating] = useState(false)
  const [created, setCreated] = useState(false)
  const [createdClientId, setCreatedClientId] = useState<number | null>(null)

  // Auto-derive client ID from name
  useEffect(() => {
    if (step === 1) {
      setData((prev) => ({ ...prev, clientId: slugify(prev.clientName) }))
    }
  }, [data.clientName, step])

  function update(key: keyof FormData, value: string | boolean) {
    setData((prev) => ({ ...prev, [key]: value }))
    setErrors((prev) => ({ ...prev, [key]: undefined }))
  }

  function validateStep(n: number): Errors {
    const e: Errors = {}
    if (n === 1) {
      if (!data.clientName.trim()) e.clientName = t("admin.create.clientNameRequired")
      if (!data.clientId.trim()) e.clientId = t("admin.create.clientIdRequired")
      if (!data.website.trim()) e.website = t("admin.create.websiteRequired")
      else if (!isValidUrl(data.website)) e.website = t("onb.invalidUrl")
    }
    if (n === 2) {
      const tv = parseInt(data.timeout)
      if (isNaN(tv) || tv < 10 || tv > 600) e.timeout = t("onb.timeoutRange")
      const r = parseInt(data.retryCount)
      if (isNaN(r) || r < 0 || r > 5) e.retryCount = t("onb.retryRange")
    }
    return e
  }

  function handleNext() {
    const e = validateStep(step)
    if (Object.keys(e).length > 0) {
      setErrors(e)
      return
    }
    setErrors({})
    setStep((s) => s + 1)
  }

  async function handleCreate() {
    if (creating) return
    setCreating(true)
    try {
      /* Fields the frozen POST /clients contract does not accept (plan,
         region, device) are intentionally not sent — the backend applies
         its own defaults (UTC, desktop). */
      const res = await apiCreateClient({
        clientName: data.clientName.trim(),
        baseUrl: data.website.trim(),
        browser: data.browser.toLowerCase(),
        headless: data.headless,
        timeoutSeconds: parseInt(data.timeout, 10),
        retryCount: parseInt(data.retryCount, 10),
        siteUsername: data.appUsername.trim(),
        sitePassword: data.appPassword,
      })
      setCreatedClientId(res.clientId)
      setCreated(true)
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        logout()
        return
      }
      if (err instanceof ApiError && err.status === 409) {
        setErrors({ clientName: t("admin.create.duplicateName") })
        setStep(1)
        return
      }
      toast({
        title: t("admin.create.failedTitle"),
        description: err instanceof Error ? err.message : t("common.somethingWentWrong"),
        variant: "error",
      })
    } finally {
      setCreating(false)
    }
  }

  if (created) {
    return (
      <div className="flex h-full flex-col space-y-6">
        <SuccessState
          clientName={data.clientName}
          clientId={createdClientId ?? 0}
          onOpenClient={(id) => onOpenClient?.(id)}
          onBack={onBack}
        />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div>
        <button
          onClick={onBack}
          className="mb-3 inline-flex items-center gap-1.5 text-[13px] font-medium text-slate-400 transition-colors hover:text-brand-300"
        >
          <svg className="size-4 rtl:-scale-x-100" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M12.7 15.3a1 1 0 01-1.4 0l-4.5-4.6a1 1 0 010-1.4l4.5-4.6a1 1 0 111.4 1.4L8.9 10l3.8 3.9a1 1 0 010 1.4z" />
          </svg>
          {t("admin.clients.back")}
        </button>
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-warning">
          {t("admin.create.eyebrow")}
        </p>
        <h1 className="mt-1 font-display text-2xl font-bold tracking-tight text-navy">{t("admin.create.title")}</h1>
        <p className="mt-1 text-[13px] text-slate-500">
          {t("admin.create.subtitle")}
        </p>
      </div>

      {/* Mobile step strip */}
      <div className="lg:hidden">
        <StepStrip current={step} />
      </div>

      {/* Two-column layout */}
      <div className="grid gap-6 lg:grid-cols-[1fr_260px]">
        {/* Main form */}
        <div className="space-y-6">
          {step === 1 && <Step1 data={data} errors={errors} onChange={update} />}
          {step === 2 && <Step2 data={data} errors={errors} onChange={update} />}
          {step === 3 && <Step3 data={data} errors={errors} onChange={update} />}
          {step === 4 && <Step4 data={data} />}

          {/* Navigation */}
          <div className="flex items-center justify-between border-t border-slate-200 pt-5">
            <Button
              variant="secondary"
              onClick={step === 1 ? onBack : () => setStep((s) => s - 1)}
            >
              {step === 1 ? t("common.cancel") : t("common.back")}
            </Button>

            <div className="flex items-center gap-3">
              {/* Step dots */}
              <div className="hidden items-center gap-1.5 sm:flex">
                {STEPS.map((s) => (
                  <span
                    key={s.n}
                    className={cx(
                      "size-1.5 rounded-full transition-all",
                      step === s.n ? "w-4 bg-brand-600" : step > s.n ? "bg-success" : "bg-slate-200",
                    )}
                  />
                ))}
              </div>

              {step < 4 ? (
                <Button variant="primary" onClick={handleNext}>
                  {t("onb.continue")}
                  <svg className="size-4 rtl:-scale-x-100" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M10.293 3.293a1 1 0 011.414 0l6 6a1 1 0 010 1.414l-6 6a1 1 0 01-1.414-1.414L14.586 11H3a1 1 0 110-2h11.586l-4.293-4.293a1 1 0 010-1.414z" />
                  </svg>
                </Button>
              ) : (
                <Button variant="primary" onClick={handleCreate} disabled={creating}>
                  {creating && (
                    <svg className="size-4 animate-spin" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                  )}
                  {creating ? t("admin.create.creating") : t("admin.create.title")}
                </Button>
              )}
            </div>
          </div>
        </div>

        {/* Sidebar (desktop only) */}
        <div className="hidden lg:block">
          <StepSidebar current={step} data={data} />
        </div>
      </div>
    </div>
  )
}

export default CreateClient
