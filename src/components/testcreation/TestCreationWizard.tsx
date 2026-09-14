import React, { useEffect, useRef, useState } from "react"
import { Button, Card, useToast } from "../primitives"
import { useAuth } from "../../lib/auth"
import {
  ApiError,
  apiClientDetails,
  apiCreateManualEditorDraft,
  apiCreateManualRequest,
  type BackendFlowRow,
} from "../../lib/api"
import { starterDefinitionSource } from "../../lib/testDefinitionSchema"
import {
  buildManualRequestDescription,
  failureText,
  mapCreationFailure,
  newIdempotencyKey,
  statusBadgeClass,
  statusLabel,
  validateTitle,
  type CreationMethod,
  type CreationStatus,
  type JourneyType,
} from "../../lib/testCreation"

const STEP_LABELS = [
  "Journey Type",
  "Creation Method",
  "Request Details",
  "Configuration",
  "Review",
]

function SecurityNotice() {
  return (
    <div
      role="note"
      className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-[13px] text-amber-800"
    >
      Security: Do not enter passwords, tokens, cookies, private keys, or
      personal data. Use approved secret references where available.
    </div>
  )
}

function Field({
  id,
  label,
  required,
  hint,
  error,
  children,
}: {
  id: string
  label: string
  required?: boolean
  hint?: string
  error?: string | null
  children: React.ReactNode
}) {
  return (
    <div>
      <label
        htmlFor={id}
        className="mb-1.5 block text-[13px] font-semibold text-navy"
      >
        {label}{" "}
        {required && (
          <span aria-hidden="true" className="text-error">
            *
          </span>
        )}
      </label>
      {children}
      {hint && !error && (
        <p className="mt-1 text-[12px] text-slate-500">{hint}</p>
      )}
      {error && (
        <p
          id={`${id}-error`}
          role="alert"
          className="mt-1 text-[12px] font-medium text-error"
        >
          {error}
        </p>
      )}
    </div>
  )
}

const inputClass = (invalid: boolean) =>
  `w-full rounded-lg border bg-surface px-3 py-2.5 text-sm text-foreground placeholder:text-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 ${
    invalid ? "border-error" : "border-slate-200"
  }`

export function TestCreationWizard({
  clientId,
  onViewRequests,
  onOpenDefinition,
  onUnauthorized,
  initialMethod,
  onExit,
}: {
  clientId: number
  onViewRequests: () => void
  onOpenDefinition: (definitionId: number) => void
  onUnauthorized: () => void
  initialMethod?: CreationMethod
  onExit?: () => void
}) {
  const toast = useToast()
  const { user } = useAuth()
  const [started, setStarted] = useState(initialMethod != null)
  const [step, setStep] = useState(0)
  const [journeyType, setJourneyType] = useState<JourneyType | null>(null)
  const [method, setMethod] = useState<CreationMethod | null>(
    initialMethod ?? null,
  )
  const [title, setTitle] = useState("")
  const [description, setDescription] = useState("")
  const [flowId, setFlowId] = useState("")
  const [flows, setFlows] = useState<BackendFlowRow[]>([])
  const [objective, setObjective] = useState("")
  const [preconditions, setPreconditions] = useState("")
  const [journeyDescription, setJourneyDescription] = useState("")
  const [expectedOutcome, setExpectedOutcome] = useState("")
  const [testData, setTestData] = useState("")
  const [authRef, setAuthRef] = useState("")
  const [notes, setNotes] = useState("")
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [result, setResult] = useState<{
    requestId: number
    status: CreationStatus
    definitionId: number | null
  } | null>(null)
  const idempotencyKey = useRef<string | null>(null)

  useEffect(() => {
    let cancelled = false
    apiClientDetails(clientId)
      .then((d) => {
        if (!cancelled) setFlows(d.flows ?? [])
      })
      .catch((err) => {
        if (!cancelled && err instanceof ApiError && err.status === 401)
          onUnauthorized()
      })
    return () => {
      cancelled = true
    }
  }, [clientId, onUnauthorized])

  function resetAll() {
    if (onExit) {
      onExit()
      return
    }
    setStarted(false)
    setStep(0)
    setJourneyType(null)
    setMethod(null)
    setTitle("")
    setDescription("")
    setFlowId("")
    setObjective("")
    setPreconditions("")
    setJourneyDescription("")
    setExpectedOutcome("")
    setTestData("")
    setAuthRef("")
    setNotes("")
    setFieldErrors({})
    setSubmitError(null)
    setResult(null)
    setSubmitting(false)
    idempotencyKey.current = null
  }

  function stepValid(s: number): boolean {
    if (s === 0) return journeyType != null
    if (s === 1) return method != null
    if (s === 2)
      return (
        validateTitle(title) == null &&
        description.trim().length > 0 &&
        description.length <= 2000
      )
    if (s === 3) {
      if (method === "MANUAL_EDITOR") return true
      return (
        objective.trim().length > 0 &&
        journeyDescription.trim().length > 0 &&
        expectedOutcome.trim().length > 0
      )
    }
    return true
  }

  function validateDetails(): boolean {
    const errors: Record<string, string> = {}
    const t = validateTitle(title)
    if (t) errors.title = t
    if (!description.trim()) errors.description = "Description is required."
    else if (description.length > 2000)
      errors.description = "Description must be 2000 characters or fewer."
    setFieldErrors(errors)
    return Object.keys(errors).length === 0
  }

  function validateConfig(): boolean {
    if (method === "MANUAL_EDITOR") return true
    const errors: Record<string, string> = {}
    if (!objective.trim()) errors.objective = "Business objective is required."
    if (!journeyDescription.trim())
      errors.journeyDescription = "Journey description is required."
    if (!expectedOutcome.trim())
      errors.expectedOutcome = "Expected outcome is required."
    for (const [key, value, max] of [
      ["objective", objective, 600],
      ["preconditions", preconditions, 400],
      ["journeyDescription", journeyDescription, 1000],
      ["expectedOutcome", expectedOutcome, 400],
      ["testData", testData, 400],
      ["authRef", authRef, 300],
      ["notes", notes, 300],
    ] as Array<[string, string, number]>) {
      if (value.length > max)
        errors[key] = `Must be ${max} characters or fewer.`
    }
    setFieldErrors(errors)
    return Object.keys(errors).length === 0
  }

  async function submit() {
    if (submitting || !journeyType || !method) return
    if (!validateDetails() || !validateConfig()) {
      if (!validateDetails()) setStep(2)
      else setStep(3)
      return
    }
    if (!idempotencyKey.current) idempotencyKey.current = newIdempotencyKey()
    const key = idempotencyKey.current
    const parsedFlowId = flowId ? Number(flowId) : null
    setSubmitting(true)
    setSubmitError(null)
    try {
      if (method === "MANUAL_REQUEST") {
        const combined = buildManualRequestDescription({
          description,
          objective,
          preconditions,
          journeyDescription,
          expectedOutcome,
          testData,
          auth: authRef,
          notes,
        })
        const row = await apiCreateManualRequest(
          clientId,
          {
            journeyType,
            title: title.trim(),
            description: combined,
            flowId: parsedFlowId,
          },
          key,
        )
        setResult({
          requestId: row.id,
          status: row.status,
          definitionId: row.definitionId ?? null,
        })
      } else {
        const created = await apiCreateManualEditorDraft(
          clientId,
          {
            journeyType,
            name: title.trim(),
            description: description.trim(),
            flowId: parsedFlowId,
            initialSourceJson: starterDefinitionSource(
              title.trim(),
              journeyType,
            ),
          },
          key,
        )
        setResult({
          requestId: created.creationRequestId,
          status: "DRAFT_CREATED",
          definitionId: created.definitionId,
        })
      }
      setStep(5)
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        onUnauthorized()
        return
      }
      const mapped = mapCreationFailure(err)
      setSubmitError(failureText(mapped))
      // Move to the result step so the failure is announced with a safe
      // retry affordance; the idempotency key is retained for the retry.
      setStep(5)
      if (mapped.kind === "conflict" && mapped.requiresReload) {
        toast({
          title: "Conflict",
          description: mapped.message,
          variant: "warning",
        })
      }
    } finally {
      setSubmitting(false)
    }
  }

  if (!started) {
    return (
      <div className="space-y-6">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400">
            Test Creation
          </p>
          <h1 className="mt-1 font-display text-2xl font-bold tracking-tight text-navy">
            Create a New Test
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Choose how you want to create your monitored test journey.
          </p>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <Card className="flex flex-col p-6">
            <h2 className="font-display text-lg font-bold text-navy">
              Manual Request
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              Submit your journey requirements and let an Assuredia Test
              Engineer implement the test definition for you.
            </p>
            <ul className="mt-4 space-y-1.5 text-[13px] text-slate-600">
              <li>You know what to test but not how</li>
              <li>You want an expert to write the test</li>
              <li>Your team prefers a reviewed implementation</li>
            </ul>
            <p className="mt-4 rounded-lg bg-slate-50 px-3 py-2 font-mono text-[12px] text-slate-600">
              Workflow: SUBMITTED → IN_REVIEW → IN_PROGRESS → DRAFT_CREATED
            </p>
            <div className="mt-5 flex-1" />
            <Button
              variant="primary"
              onClick={() => {
                setStarted(true)
                setMethod("MANUAL_REQUEST")
                setStep(0)
              }}
            >
              Create Manual Request
            </Button>
          </Card>
          <Card className="flex flex-col p-6">
            <h2 className="font-display text-lg font-bold text-navy">
              Manual Editor
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              Directly author a structured Test Definition using the step
              editor. Creates a Draft immediately upon submission.
            </p>
            <ul className="mt-4 space-y-1.5 text-[13px] text-slate-600">
              <li>You know the exact test steps</li>
              <li>You are a QA engineer familiar with the test schema</li>
              <li>You want a Draft without waiting for review</li>
            </ul>
            <p className="mt-4 rounded-lg bg-slate-50 px-3 py-2 font-mono text-[12px] text-slate-600">
              Workflow: SUBMITTED → DRAFT_CREATED (immediate)
            </p>
            <div className="mt-5 flex-1" />
            <Button
              variant="secondary"
              onClick={() => {
                setStarted(true)
                setMethod("MANUAL_EDITOR")
                setStep(0)
              }}
            >
              Open Manual Editor
            </Button>
          </Card>
        </div>
        <Card className="p-6">
          <h2 className="font-display text-base font-bold text-navy">
            Request Status Reference
          </h2>
          <p className="mt-1 text-[13px] text-slate-500">
            Draft Created means creation has finished. The resulting Test
            Definition is still a Draft — it is not READY until it passes
            validation, trial, approval, and proving.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {([
              "SUBMITTED",
              "IN_REVIEW",
              "IN_PROGRESS",
              "DRAFT_CREATED",
              "REJECTED",
              "CANCELLED",
              "FAILED",
            ] as CreationStatus[]).map((s) => (
              <span
                key={s}
                className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] font-semibold ring-1 ring-inset ${statusBadgeClass(s)}`}
              >
                <span
                  className="size-1.5 rounded-full bg-current"
                  aria-hidden="true"
                />
                {statusLabel(s)}
              </span>
            ))}
          </div>
        </Card>
      </div>
    )
  }

  if (step === 5) {
    if (submitting && !result && !submitError) {
      return (
        <div
          role="status"
          aria-live="polite"
          className="mx-auto max-w-lg py-16 text-center"
        >
          <p className="font-display text-lg font-bold text-navy">
            Submitting your request…
          </p>
          <p className="mt-1 text-sm text-slate-500">
            Please wait. Do not close this page.
          </p>
        </div>
      )
    }
    if (submitError && !result) {
      return (
        <div className="mx-auto max-w-lg space-y-4 py-10 text-center">
          <h1 className="font-display text-xl font-bold text-navy">
            Submission failed
          </h1>
          <p role="alert" className="text-sm text-slate-500">
            An error occurred. Your data has not been saved. You can safely
            retry.
          </p>
          <p
            role="alert"
            className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-[13px] text-red-700"
          >
            {submitError}
          </p>
          <div className="flex justify-center gap-2">
            <Button
              variant="primary"
              loading={submitting}
              disabled={submitting}
              onClick={() => {
                idempotencyKey.current = null
                void submit()
              }}
            >
              Retry Submission
            </Button>
            <Button variant="secondary" onClick={resetAll}>
              Start Over
            </Button>
          </div>
        </div>
      )
    }
    const isEditor = method === "MANUAL_EDITOR"
    return (
      <div className="mx-auto max-w-xl space-y-5 py-6 text-center">
        <h1 className="font-display text-2xl font-bold text-navy">
          {isEditor ? "Draft Created" : "Request Submitted"}
        </h1>
        <p className="text-sm text-slate-500">
          {isEditor
            ? "Your Creation Request and Test Definition Draft have been created."
            : "Your creation request has been submitted and will enter the review workflow."}
        </p>
        {result && (
          <Card className="p-5 text-start">
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between gap-4">
                <dt className="text-slate-500">Request ID</dt>
                <dd className="font-mono font-semibold text-navy">
                  {result.requestId}
                </dd>
              </div>
              <div className="flex items-center justify-between gap-4">
                <dt className="text-slate-500">Status</dt>
                <dd>
                  <span
                    className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] font-semibold ring-1 ring-inset ${statusBadgeClass(result.status)}`}
                  >
                    {statusLabel(result.status)}
                  </span>
                </dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-slate-500">Next step</dt>
                <dd className="text-end text-slate-700">
                  {isEditor
                    ? "Open Draft to complete step configuration."
                    : "Your request will be reviewed and assigned to an engineer."}
                </dd>
              </div>
            </dl>
          </Card>
        )}
        {!isEditor && (
          <p className="text-[13px] text-slate-500">
            Submitting this request does not immediately create a Test
            Definition.
          </p>
        )}
        <div className="flex flex-wrap justify-center gap-2">
          {result?.definitionId != null && (
            <Button
              variant="primary"
              onClick={() => onOpenDefinition(result.definitionId as number)}
            >
              Open Test Definition
            </Button>
          )}
          <Button variant="secondary" onClick={onViewRequests}>
            View Creation Requests
          </Button>
          <Button variant="ghost" onClick={resetAll}>
            Create Another
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400">
          Test Creation
        </p>
        <h1 className="mt-1 font-display text-2xl font-bold tracking-tight text-navy">
          New Test Request
        </h1>
        <ol aria-label="Progress" className="mt-3 flex flex-wrap gap-2">
          {STEP_LABELS.map((label, i) => (
            <li
              key={label}
              aria-current={i === step ? "step" : undefined}
              className={`rounded-full px-3 py-1 text-[12px] font-semibold ${
                i === step
                  ? "bg-brand-900 text-white"
                  : i < step
                    ? "bg-emerald-50 text-emerald-700"
                    : "bg-slate-100 text-slate-500"
              }`}
            >
              {i + 1}. {label}
            </li>
          ))}
        </ol>
        <p className="mt-2 text-[12px] text-slate-400">Step {step + 1} of 5</p>
      </div>

      {step === 0 && (
        <Card className="space-y-3 p-6">
          <h2 className="font-display text-lg font-bold text-navy">
            What kind of flow do you want to monitor?
          </h2>
          <div
            className="grid gap-3"
            role="radiogroup"
            aria-label="Journey type"
          >
            {([
              [
                "UI",
                "UI Journey",
                "Browser interactions and UI assertions across the application interface.",
                "e.g. Login flow, checkout journey, form submission validation",
              ],
              [
                "API",
                "API Journey",
                "HTTP requests, response assertions, and value extraction from backend APIs.",
                "e.g. Order creation API, authentication endpoint, data sync verification",
              ],
              [
                "MIXED",
                "Mixed Journey",
                "Combines API and UI steps with shared variables across the full journey.",
                "e.g. API creates order → UI searches order → UI asserts result",
              ],
            ] as Array<[JourneyType, string, string, string]>).map(
              ([value, titleText, desc, example]) => (
                <button
                  key={value}
                  role="radio"
                  aria-checked={journeyType === value}
                  onClick={() => setJourneyType(value)}
                  className={`rounded-xl border-2 p-4 text-start transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 ${
                    journeyType === value
                      ? "border-brand-900 bg-brand-50/50"
                      : "border-slate-200 hover:border-slate-300"
                  }`}
                >
                  <span className="font-semibold text-navy">{titleText}</span>
                  <span className="mt-1 block text-[13px] text-slate-600">
                    {desc}
                  </span>
                  <span className="mt-1 block text-[12px] text-slate-400">
                    {example}
                  </span>
                </button>
              ),
            )}
          </div>
        </Card>
      )}

      {step === 1 && (
        <Card className="space-y-3 p-6">
          <h2 className="font-display text-lg font-bold text-navy">
            How would you like to create this test?
          </h2>
          <div
            className="grid gap-3"
            role="radiogroup"
            aria-label="Creation method"
          >
            <button
              role="radio"
              aria-checked={method === "MANUAL_REQUEST"}
              onClick={() => setMethod("MANUAL_REQUEST")}
              className={`rounded-xl border-2 p-4 text-start focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 ${
                method === "MANUAL_REQUEST"
                  ? "border-brand-900 bg-brand-50/50"
                  : "border-slate-200 hover:border-slate-300"
              }`}
            >
              <span className="font-semibold text-navy">Manual Request</span>
              <span className="mt-0.5 block text-[12px] font-medium text-slate-500">
                Enters review workflow — no immediate Draft
              </span>
              <span className="mt-1 block text-[13px] text-slate-600">
                Describe your journey requirements and submit them for an
                Assuredia Admin or Test Engineer to implement.
              </span>
              <span className="mt-2 block font-mono text-[12px] text-slate-500">
                SUBMITTED → IN_REVIEW → IN_PROGRESS → DRAFT_CREATED
              </span>
            </button>
            <button
              role="radio"
              aria-checked={method === "MANUAL_EDITOR"}
              onClick={() => setMethod("MANUAL_EDITOR")}
              className={`rounded-xl border-2 p-4 text-start focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 ${
                method === "MANUAL_EDITOR"
                  ? "border-brand-900 bg-brand-50/50"
                  : "border-slate-200 hover:border-slate-300"
              }`}
            >
              <span className="font-semibold text-navy">Manual Editor</span>
              <span className="mt-0.5 block text-[12px] font-medium text-slate-500">
                Creates Test Definition Draft immediately
              </span>
              <span className="mt-1 block text-[13px] text-slate-600">
                Author the request now; UI steps, API steps, mixed ordered
                steps, variables, secret references, assertions, extractions,
                and timeouts are configured in the Test Definitions editor after
                submission.
              </span>
              <span className="mt-2 block font-mono text-[12px] text-slate-500">
                SUBMITTED → DRAFT_CREATED
              </span>
            </button>
          </div>
          <div className="grid gap-2 opacity-60" aria-label="Future methods">
            {[
              "AI Description",
              "Browser Recorder",
              "OpenAPI / Postman / HAR import",
            ].map((label) => (
              <div
                key={label}
                className="flex items-center justify-between rounded-xl border border-dashed border-slate-200 px-4 py-2.5 text-[13px] text-slate-500"
              >
                <span>{label}</span>
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold">
                  Coming soon
                </span>
              </div>
            ))}
          </div>
        </Card>
      )}

      {step === 2 && (
        <Card className="space-y-4 p-6">
          <h2 className="font-display text-lg font-bold text-navy">
            Provide the core information for this test creation request.
          </h2>
          <SecurityNotice />
          <Field id="tc-title" label="Title" required error={fieldErrors.title}>
            <input
              id="tc-title"
              value={title}
              maxLength={120}
              placeholder="e.g. Checkout UI flow — guest purchase"
              onChange={(e) => setTitle(e.target.value)}
              aria-invalid={Boolean(fieldErrors.title)}
              aria-describedby={
                fieldErrors.title ? "tc-title-error" : undefined
              }
              className={inputClass(Boolean(fieldErrors.title))}
            />
          </Field>
          <Field
            id="tc-desc"
            label="Description"
            required
            hint="Briefly describe what this test should verify."
            error={fieldErrors.description}
          >
            <textarea
              id="tc-desc"
              value={description}
              rows={3}
              maxLength={2000}
              placeholder="Briefly describe what this test should verify."
              onChange={(e) => setDescription(e.target.value)}
              aria-invalid={Boolean(fieldErrors.description)}
              aria-describedby={
                fieldErrors.description ? "tc-desc-error" : undefined
              }
              className={inputClass(Boolean(fieldErrors.description))}
            />
          </Field>
          <Field
            id="tc-flow"
            label="Related Flow (optional)"
            hint="Select or reference the Assuredia flow this test belongs to, if applicable."
          >
            <select
              id="tc-flow"
              value={flowId}
              onChange={(e) => setFlowId(e.target.value)}
              className={inputClass(false)}
            >
              <option value="">No flow</option>
              {flows.map((f) => (
                <option key={f.id} value={String(f.id)}>
                  {f.flow_name ?? `Flow ${f.id}`}
                </option>
              ))}
            </select>
          </Field>
        </Card>
      )}

      {step === 3 && method === "MANUAL_REQUEST" && (
        <Card className="space-y-4 p-6">
          <h2 className="font-display text-lg font-bold text-navy">
            Journey Configuration
          </h2>
          <p className="text-[13px] text-slate-500">
            Help the Assuredia team understand exactly what to build.
          </p>
          <SecurityNotice />
          <Field
            id="tc-objective"
            label="Business Objective"
            required
            error={fieldErrors.objective}
          >
            <textarea
              id="tc-objective"
              value={objective}
              rows={3}
              maxLength={600}
              placeholder="What business outcome should this test protect?"
              onChange={(e) => setObjective(e.target.value)}
              aria-invalid={Boolean(fieldErrors.objective)}
              aria-describedby={
                fieldErrors.objective ? "tc-objective-error" : undefined
              }
              className={inputClass(Boolean(fieldErrors.objective))}
            />
          </Field>
          <Field
            id="tc-pre"
            label="Preconditions"
            error={fieldErrors.preconditions}
          >
            <textarea
              id="tc-pre"
              value={preconditions}
              rows={3}
              maxLength={400}
              placeholder="What must be true before the test starts? (e.g. user is logged in, product exists in catalog)"
              onChange={(e) => setPreconditions(e.target.value)}
              className={inputClass(Boolean(fieldErrors.preconditions))}
            />
          </Field>
          <Field
            id="tc-journey"
            label="Journey Description"
            required
            error={fieldErrors.journeyDescription}
          >
            <textarea
              id="tc-journey"
              value={journeyDescription}
              rows={5}
              maxLength={1000}
              placeholder="Describe the steps of the journey in natural language."
              onChange={(e) => setJourneyDescription(e.target.value)}
              aria-invalid={Boolean(fieldErrors.journeyDescription)}
              aria-describedby={
                fieldErrors.journeyDescription ? "tc-journey-error" : undefined
              }
              className={inputClass(Boolean(fieldErrors.journeyDescription))}
            />
          </Field>
          <Field
            id="tc-expected"
            label="Expected Outcome"
            required
            error={fieldErrors.expectedOutcome}
          >
            <textarea
              id="tc-expected"
              value={expectedOutcome}
              rows={3}
              maxLength={400}
              placeholder="What should the test confirm is working correctly?"
              onChange={(e) => setExpectedOutcome(e.target.value)}
              aria-invalid={Boolean(fieldErrors.expectedOutcome)}
              aria-describedby={
                fieldErrors.expectedOutcome ? "tc-expected-error" : undefined
              }
              className={inputClass(Boolean(fieldErrors.expectedOutcome))}
            />
          </Field>
          <Field
            id="tc-data"
            label="Required Test Data"
            hint="Do not include passwords, tokens, or sensitive values. Reference approved secrets by name."
            error={fieldErrors.testData}
          >
            <textarea
              id="tc-data"
              value={testData}
              rows={3}
              maxLength={400}
              placeholder="Describe test data needed — use secret references, not raw values."
              onChange={(e) => setTestData(e.target.value)}
              className={inputClass(Boolean(fieldErrors.testData))}
            />
          </Field>
          <Field
            id="tc-auth"
            label="Authentication Requirements"
            hint="Specify secret reference names only — never enter actual credentials here."
            error={fieldErrors.authRef}
          >
            <textarea
              id="tc-auth"
              value={authRef}
              rows={2}
              maxLength={300}
              placeholder="Describe authentication needed using secret reference names only."
              onChange={(e) => setAuthRef(e.target.value)}
              className={inputClass(Boolean(fieldErrors.authRef))}
            />
          </Field>
          <Field
            id="tc-notes"
            label="Additional Notes"
            error={fieldErrors.notes}
          >
            <textarea
              id="tc-notes"
              value={notes}
              rows={2}
              maxLength={300}
              placeholder="Any other context that would help the test engineer."
              onChange={(e) => setNotes(e.target.value)}
              className={inputClass(Boolean(fieldErrors.notes))}
            />
          </Field>
        </Card>
      )}

      {step === 3 && method === "MANUAL_EDITOR" && (
        <Card className="space-y-3 p-6">
          <h2 className="font-display text-lg font-bold text-navy">
            Manual Editor
          </h2>
          <p className="text-[13px] text-slate-500">
            The structured test definition editor will open after submission.
            Review your request details first.
          </p>
          <div className="rounded-xl border border-brand-900/20 bg-brand-50/60 px-4 py-3 text-[13px] text-slate-700">
            After submitting your request details, a Creation Request with
            status SUBMITTED is created. The backend immediately processes it
            and creates a Test Definition Draft. You will be taken to the Draft
            editor to complete your step configuration: UI steps, API steps,
            mixed ordered steps (for example API step → extract variable → UI
            step using the variable), variables, secret references, assertions,
            extractions, and timeouts.
          </div>
        </Card>
      )}

      {step === 4 && (
        <div className="space-y-4">
          <Card className="p-6">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-lg font-bold text-navy">
                Request Summary
              </h2>
              <Button variant="link" onClick={() => setStep(2)}>
                Edit
              </Button>
            </div>
            <dl className="mt-3 space-y-2 text-sm">
              <div className="flex justify-between gap-4">
                <dt className="text-slate-500">Journey Type</dt>
                <dd className="font-medium text-navy">{journeyType}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-slate-500">Method</dt>
                <dd className="font-medium text-navy">
                  {method === "MANUAL_REQUEST"
                    ? "Manual Request"
                    : "Manual Editor"}
                </dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-slate-500">Title</dt>
                <dd className="max-w-[60%] truncate text-end font-medium text-navy">
                  {title}
                </dd>
              </div>
              {flowId && (
                <div className="flex justify-between gap-4">
                  <dt className="text-slate-500">Flow</dt>
                  <dd className="max-w-[60%] truncate text-end font-medium text-navy">
                    {/* Resolve the selected flow's name from the same list
                        that backs the dropdown; a stale/unknown id stays
                        honest instead of showing a bare number (F-6). */}
                    {flows.find((f) => String(f.id) === flowId)?.flow_name ||
                      `Flow #${flowId} (name unavailable)`}
                  </dd>
                </div>
              )}
              <div>
                <dt className="text-slate-500">Description</dt>
                <dd className="mt-1 whitespace-pre-wrap text-slate-700">
                  {description}
                </dd>
              </div>
            </dl>
          </Card>
          {method === "MANUAL_REQUEST" && (
            <Card className="p-6">
              <div className="flex items-center justify-between">
                <h2 className="font-display text-lg font-bold text-navy">
                  Journey Configuration
                </h2>
                <Button variant="link" onClick={() => setStep(3)}>
                  Edit
                </Button>
              </div>
              <dl className="mt-3 space-y-2 text-sm">
                <div>
                  <dt className="text-slate-500">Objective</dt>
                  <dd className="text-slate-700">{objective}</dd>
                </div>
                {preconditions && (
                  <div>
                    <dt className="text-slate-500">Preconditions</dt>
                    <dd className="text-slate-700">{preconditions}</dd>
                  </div>
                )}
                <div>
                  <dt className="text-slate-500">Journey</dt>
                  <dd className="whitespace-pre-wrap text-slate-700">
                    {journeyDescription}
                  </dd>
                </div>
                <div>
                  <dt className="text-slate-500">Expected</dt>
                  <dd className="text-slate-700">{expectedOutcome}</dd>
                </div>
                {testData && (
                  <div>
                    <dt className="text-slate-500">Test Data</dt>
                    <dd className="text-slate-700">{testData}</dd>
                  </div>
                )}
                {authRef && (
                  <div>
                    <dt className="text-slate-500">Auth</dt>
                    <dd className="text-slate-700">{authRef}</dd>
                  </div>
                )}
                {notes && (
                  <div>
                    <dt className="text-slate-500">Notes</dt>
                    <dd className="text-slate-700">{notes}</dd>
                  </div>
                )}
              </dl>
            </Card>
          )}
          <div
            role="note"
            className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-[13px] text-slate-600"
          >
            {method === "MANUAL_REQUEST"
              ? "Note: Submitting this request does not immediately create a Test Definition. It will enter the review workflow and be assigned to an Assuredia Test Engineer."
              : "Note: Submitting will create a Creation Request and an associated Test Definition Draft for your review. Draft does not mean READY."}
          </div>
        </div>
      )}

      <div className="flex items-center justify-between">
        <div>
          {step === 0 ? (
            <Button variant="ghost" onClick={resetAll}>
              Cancel
            </Button>
          ) : (
            <Button
              variant="secondary"
              onClick={() => {
                setSubmitError(null)
                setStep((s) => Math.max(0, s - 1))
              }}
            >
              ← Back
            </Button>
          )}
        </div>
        <div className="flex gap-2">
          {step < 4 ? (
            <Button
              variant="primary"
              disabled={!stepValid(step)}
              onClick={() => {
                if (step === 2 && !validateDetails()) return
                if (step === 3 && !validateConfig()) return
                setFieldErrors({})
                setStep((s) => Math.min(4, s + 1))
              }}
            >
              Next →
            </Button>
          ) : (
            <Button
              variant="primary"
              loading={submitting}
              disabled={submitting}
              onClick={submit}
            >
              {method === "MANUAL_EDITOR" ? "Create Draft" : "Submit Request"}
            </Button>
          )}
        </div>
      </div>
      <p className="text-[12px] text-slate-400" aria-live="polite">
        Signed in as {user?.email ?? "client"} · Client #{clientId}
      </p>
    </div>
  )
}
