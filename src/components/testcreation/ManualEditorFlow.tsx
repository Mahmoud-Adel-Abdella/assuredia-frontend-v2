import React, { useEffect, useMemo, useState } from "react"
import { Alert, Button, Card } from "../primitives"
import { useLang } from "../../lib/i18n"
import {
  buildAPIEditorSourceJson,
  buildUIEditorSourceJson,
  type APIConfig,
  type KeyValueEntry,
  type UIAction,
} from "../../lib/testSourceBuilders"
import { starterDefinitionSource } from "../../lib/testDefinitionSchema"
import type { JourneyType } from "../../lib/testCreation"
import {
  ApiError,
  apiListCredentials,
  type CredentialView,
} from "../../lib/api"
import {
  buildFinalDescription,
  descriptionOverflow,
} from "../../lib/credentials"
import { CredentialSelector } from "../credentials/CredentialSelector"
import {
  DraftSuccess,
  Field,
  SubmitFailureAlert,
  inputClass,
  useDraftSubmit,
  type DraftPayload,
} from "./CreateTestShared"

type EditorStep = "editor" | "review"
type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE" | "HEAD" | "OPTIONS"
type UIActionKind = "navigate" | "click" | "type" | "select" | "check" | "wait" | "scroll"
type UIActionForm = {
  id: string
  kind: UIActionKind
  url: string
  strategy: "role" | "label" | "text" | "testId" | "placeholder" | "css"
  role: string
  locator: string
  value: string
  expectedResult: string
}

type ManualEditorProps = {
  clientId: number
  onBack: () => void
  onOpenDefinition: (definitionId: number) => void
  onViewDrafts: () => void
  onUnauthorized: () => void
  /** Opens Settings → Secure Credentials (credential selector CTA). */
  onOpenSettingsCredentials?: () => void
}

const methods: HttpMethod[] = [
  "GET",
  "POST",
  "PUT",
  "PATCH",
  "DELETE",
  "HEAD",
  "OPTIONS",
]
const locatorStrategies: UIActionForm["strategy"][] = [
  "role",
  "label",
  "text",
  "testId",
  "placeholder",
  "css",
]

function blankAction(kind: UIActionKind = "navigate"): UIActionForm {
  return {
    id: globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`,
    kind,
    url: "",
    strategy: "role",
    role: "button",
    locator: "",
    value: "",
    expectedResult: "",
  }
}

function parsePairs(text: string): KeyValueEntry[] {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line, index) => {
      const separator = line.indexOf(":")
      return {
        id: String(index),
        key: separator < 0 ? line : line.slice(0, separator).trim(),
        value: separator < 0 ? "" : line.slice(separator + 1).trim(),
      }
    })
}

function parseAssertions(text: string) {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line, index) => {
      const separator = line.indexOf("=")
      const field = separator < 0 ? line : line.slice(0, separator).trim()
      const value = separator < 0 ? undefined : line.slice(separator + 1).trim()
      return {
        id: String(index),
        field,
        operator: separator < 0 ? "exists" as const : "eq" as const,
        value,
      }
    })
}

function toUIActions(actions: UIActionForm[]): UIAction[] {
  return actions.map((item) => ({
    id: item.id,
    type: item.kind,
    target: item.kind === "navigate" ? item.url : item.locator,
    value: item.value || undefined,
    expectedResult: item.expectedResult || undefined,
  }))
}

function readBuilderSource(value: unknown): string {
  return typeof value === "string"
    ? value
    : `${JSON.stringify(value, null, 2)}\n`
}

export function ManualEditorFlow({
  clientId,
  onBack,
  onOpenDefinition,
  onViewDrafts,
  onUnauthorized,
  onOpenSettingsCredentials,
}: ManualEditorProps) {
  const { t } = useLang()
  const [step, setStep] = useState<EditorStep>("editor")
  const [journeyType, setJourneyType] = useState<JourneyType>("UI")
  const [name, setName] = useState("")
  const [description, setDescription] = useState("")
  const [actions, setActions] = useState<UIActionForm[]>([blankAction()])
  const [method, setMethod] = useState<HttpMethod>("GET")
  const [endpoint, setEndpoint] = useState("")
  const [query, setQuery] = useState("")
  const [headers, setHeaders] = useState("")
  const [body, setBody] = useState("")
  const [status, setStatus] = useState("200")
  const [assertions, setAssertions] = useState("")
  const [errors, setErrors] = useState<Record<string, string>>({})
  const draft = useDraftSubmit({ clientId, onUnauthorized })

  // PR10C.5 Phase 2: credential context for the draft. The frozen draft-
  // creation contract has no credentialId field, so the selection follows the
  // manual-request convention — it is recorded in the description metadata
  // ("Authentication (references only)") and shown in the review step.
  const [credentials, setCredentials] = useState<CredentialView[]>([])
  const [credentialsLoaded, setCredentialsLoaded] = useState(false)
  const [selectedCredentialId, setSelectedCredentialId] = useState<number | null>(null)

  useEffect(() => {
    let cancelled = false
    apiListCredentials(clientId)
      .then((list) => {
        if (cancelled) return
        setCredentials(list)
        setCredentialsLoaded(true)
      })
      .catch((error) => {
        if (cancelled) return
        if (error instanceof ApiError && error.status === 401) {
          onUnauthorized()
          return
        }
        setCredentials([])
        setCredentialsLoaded(true)
      })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId])

  const selectedCredential =
    credentials.find((c) => c.id === selectedCredentialId) ?? null

  // Audit F-01: ONE source of truth for the submitted description. The
  // review step renders this exact string and the payload sends this exact
  // string. No silent truncation: when the combined text exceeds the
  // backend limit the editor surfaces an inline error and blocks submit.
  const finalDescription = useMemo(
    () => buildFinalDescription(description, selectedCredential?.name ?? null),
    [description, selectedCredential],
  )
  const descriptionOverflowCount = useMemo(
    () => descriptionOverflow(description, selectedCredential?.name ?? null),
    [description, selectedCredential],
  )

  const payload = useMemo<DraftPayload>(() => {
    if (journeyType === "UI") {
      return {
        journeyType,
        name: name.trim(),
        description: finalDescription,
        sourceJson: readBuilderSource(
          buildUIEditorSourceJson(
            name.trim(),
            description,
            toUIActions(actions),
          ),
        ),
      }
    }
    if (journeyType === "API") {
      const config: APIConfig = {
        method,
        endpoint,
        queryParams: parsePairs(query),
        headers: parsePairs(headers),
        body,
        expectedStatus: Number(status),
        assertions: parseAssertions(assertions),
      }
      return {
        journeyType,
        name: name.trim(),
        description: finalDescription,
        sourceJson: readBuilderSource(
          buildAPIEditorSourceJson(name.trim(), description, config),
        ),
      }
    }
    return {
      journeyType,
      name: name.trim(),
      description: finalDescription,
      sourceJson: starterDefinitionSource(name.trim(), "MIXED"),
    }
  }, [
    actions,
    assertions,
    body,
    description,
    endpoint,
    finalDescription,
    headers,
    journeyType,
    method,
    name,
    query,
    status,
  ])

  function validate(): boolean {
    const next: Record<string, string> = {}
    if (!name.trim()) next.name = t("pr10b.validation.nameRequired")
    if (name.trim().length > 120) next.name = t("pr10b.validation.nameLong")
    if (description.length > 2000)
      next.description = t("pr10b.validation.descriptionLong")
    // Audit F-01: the credential suffix must never be truncated — refuse to
    // advance when the combined description exceeds the backend limit.
    if (descriptionOverflowCount > 0)
      next.description = t("credentials.manual.descriptionOverflow", {
        count: descriptionOverflowCount,
      })
    if (journeyType === "UI") {
      actions.forEach((action, index) => {
        if (action.kind === "navigate" && !action.url.trim())
          next[`action-${index}`] = t("pr10b.validation.urlRequired")
        if (action.kind !== "navigate" && !action.locator.trim())
          next[`action-${index}`] = t("pr10b.validation.locatorRequired")
        if (
          (action.kind === "type" || action.kind === "select") &&
          !action.value
        )
          next[`action-${index}`] = t("pr10b.validation.valueRequired")
      })
    }
    if (journeyType === "API") {
      if (!endpoint.trim())
        next.endpoint = t("pr10b.validation.endpointRequired")
      if (
        !/^\d{3}$/.test(status) ||
        Number(status) < 100 ||
        Number(status) > 599
      )
        next.status = t("pr10b.validation.statusInvalid")
    }
    setErrors(next)
    return Object.keys(next).length === 0
  }

  function goToReview() {
    if (validate()) setStep("review")
  }

  function createAnother() {
    setStep("editor")
    setName("")
    setDescription("")
    setActions([blankAction()])
    setMethod("GET")
    setEndpoint("")
    setQuery("")
    setHeaders("")
    setBody("")
    setStatus("200")
    setAssertions("")
    setErrors({})
    draft.resetSubmit()
  }

  if (draft.definitionId != null) {
    return (
      <DraftSuccess
        definitionId={draft.definitionId}
        onOpenDefinition={onOpenDefinition}
        onCreateAnother={createAnother}
        onViewDrafts={onViewDrafts}
      />
    )
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <button
            type="button"
            onClick={onBack}
            className="mb-2 text-[13px] font-medium text-slate-400 hover:text-brand-300"
          >
            {t("pr10b.actions.back")}
          </button>
          <h1 className="font-display text-2xl font-bold tracking-tight text-navy">
            {t("pr10b.editor.title")}
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            {t("pr10b.editor.subtitle")}
          </p>
        </div>
        <span className="rounded-full bg-slate-100 px-3 py-1 text-[12px] font-semibold text-slate-500">
          {step === "editor"
            ? t("pr10b.progress.editor")
            : t("pr10b.progress.review")}
        </span>
      </div>

      {step === "editor" ? (
        <>
          <Card className="space-y-4 p-5">
            <h2 className="font-display text-base font-bold text-navy">
              {t("pr10b.editor.details")}
            </h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                id="pr10b-name"
                label={t("pr10b.fields.name")}
                required
                error={errors.name}
              >
                <input
                  id="pr10b-name"
                  className={inputClass}
                  maxLength={120}
                  value={name}
                  aria-invalid={Boolean(errors.name)}
                  aria-describedby={
                    errors.name ? "pr10b-name-error" : undefined
                  }
                  onChange={(event) => setName(event.target.value)}
                />
              </Field>
              <Field
                id="pr10b-type"
                label={t("pr10b.fields.journeyType")}
                required
              >
                <select
                  id="pr10b-type"
                  className={inputClass}
                  value={journeyType}
                  onChange={(event) =>
                    setJourneyType(event.target.value as JourneyType)
                  }
                >
                  <option value="UI">{t("pr10b.journey.ui")}</option>
                  <option value="API">{t("pr10b.journey.api")}</option>
                  <option value="MIXED">{t("pr10b.journey.mixed")}</option>
                </select>
              </Field>
            </div>
            <Field
              id="pr10b-description"
              label={t("pr10b.fields.description")}
              error={errors.description}
            >
              <textarea
                id="pr10b-description"
                rows={3}
                maxLength={2000}
                className={inputClass}
                value={description}
                aria-invalid={Boolean(errors.description)}
                onChange={(event) => setDescription(event.target.value)}
              />
            </Field>

            {/* PR10C.5 Phase 2: credential context for the draft. The frozen
                creation contract has no credentialId field, so the choice is
                recorded in the description metadata (the manual-request
                convention) and travels with the draft for review. */}
            <div className="flex flex-wrap items-center gap-3">
              <CredentialSelector
                credentials={credentials}
                selectedId={selectedCredentialId}
                onSelect={setSelectedCredentialId}
                onManage={() => onOpenSettingsCredentials?.()}
                loading={!credentialsLoaded}
                compact={false}
              />
            </div>
          </Card>

          {journeyType === "UI" && (
            <Card className="space-y-4 p-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="font-display text-base font-bold text-navy">
                  {t("pr10b.editor.uiActions")}
                </h2>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() =>
                    setActions((current) => [...current, blankAction("click")])
                  }
                >
                  {t("pr10b.actions.addAction")}
                </Button>
              </div>
              {actions.map((action, index) => (
                <fieldset
                  key={action.id}
                  className="space-y-3 rounded-xl border border-slate-200 p-4"
                >
                  <legend className="px-1 text-[12px] font-semibold text-slate-500">
                    {t("pr10b.editor.actionNumber", { number: index + 1 })}
                  </legend>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Field
                      id={`pr10b-action-kind-${index}`}
                      label={t("pr10b.editor.actionType")}
                    >
                      <select
                        id={`pr10b-action-kind-${index}`}
                        className={inputClass}
                        value={action.kind}
                        onChange={(event) =>
                          setActions((current) =>
                            current.map((item, i) =>
                              i === index
                                ? {
                                    ...item,
                                    kind: event.target.value as UIActionKind,
                                  }
                                : item,
                            ),
                          )
                        }
                      >
                        {[
                          "navigate",
                          "click",
                          "type",
                          "select",
                          "check",
                          "wait",
                          "scroll",
                        ].map((kind) => (
                          <option key={kind} value={kind}>
                            {kind}
                          </option>
                        ))}
                      </select>
                    </Field>
                    {action.kind === "navigate" ? (
                      <Field
                        id={`pr10b-action-url-${index}`}
                        label={t("pr10b.fields.url")}
                        required
                        error={errors[`action-${index}`]}
                      >
                        <input
                          id={`pr10b-action-url-${index}`}
                          dir="ltr"
                          className={inputClass}
                          value={action.url}
                          onChange={(event) =>
                            setActions((current) =>
                              current.map((item, i) =>
                                i === index
                                  ? { ...item, url: event.target.value }
                                  : item,
                              ),
                            )
                          }
                        />
                      </Field>
                    ) : action.kind === "wait" ? (
                      <Field
                        id={`pr10b-action-duration-${index}`}
                        label={t("pr10b.fields.duration")}
                        required
                      >
                        <input
                          id={`pr10b-action-duration-${index}`}
                          dir="ltr"
                          inputMode="numeric"
                          className={inputClass}
                          value={action.value}
                          onChange={(event) =>
                            setActions((current) =>
                              current.map((item, i) =>
                                i === index
                                  ? { ...item, value: event.target.value }
                                  : item,
                              ),
                            )
                          }
                        />
                      </Field>
                    ) : (
                      <Field
                        id={`pr10b-action-strategy-${index}`}
                        label={t("pr10b.fields.strategy")}
                      >
                        <select
                          id={`pr10b-action-strategy-${index}`}
                          className={inputClass}
                          value={action.strategy}
                          onChange={(event) =>
                            setActions((current) =>
                              current.map((item, i) =>
                                i === index
                                  ? {
                                      ...item,
                                      strategy: event.target
                                        .value as UIActionForm["strategy"],
                                    }
                                  : item,
                              ),
                            )
                          }
                        >
                          {locatorStrategies.map((strategy) => (
                            <option key={strategy} value={strategy}>
                              {strategy}
                            </option>
                          ))}
                        </select>
                      </Field>
                    )}
                  </div>
                  {action.kind !== "navigate" && action.kind !== "wait" && (
                    <div className="grid gap-3 sm:grid-cols-2">
                      {action.strategy === "role" && (
                        <Field
                          id={`pr10b-action-role-${index}`}
                          label={t("pr10b.fields.role")}
                        >
                          <input
                            id={`pr10b-action-role-${index}`}
                            dir="ltr"
                            className={inputClass}
                            value={action.role}
                            onChange={(event) =>
                              setActions((current) =>
                                current.map((item, i) =>
                                  i === index
                                    ? { ...item, role: event.target.value }
                                    : item,
                                ),
                              )
                            }
                          />
                        </Field>
                      )}
                      <Field
                        id={`pr10b-action-locator-${index}`}
                        label={t("pr10b.fields.locator")}
                        required
                        error={errors[`action-${index}`]}
                      >
                        <input
                          id={`pr10b-action-locator-${index}`}
                          dir="ltr"
                          className={inputClass}
                          value={action.locator}
                          aria-invalid={Boolean(errors[`action-${index}`])}
                          onChange={(event) =>
                            setActions((current) =>
                              current.map((item, i) =>
                                i === index
                                  ? { ...item, locator: event.target.value }
                                  : item,
                              ),
                            )
                          }
                        />
                      </Field>
                      {(action.kind === "type" || action.kind === "select") && (
                        <Field
                          id={`pr10b-action-value-${index}`}
                          label={t("pr10b.fields.value")}
                          required
                          error={errors[`action-${index}`]}
                        >
                          <input
                            id={`pr10b-action-value-${index}`}
                            className={inputClass}
                            value={action.value}
                            onChange={(event) =>
                              setActions((current) =>
                                current.map((item, i) =>
                                  i === index
                                    ? { ...item, value: event.target.value }
                                    : item,
                                ),
                              )
                            }
                          />
                        </Field>
                      )}
                    </div>
                  )}
                  {action.kind !== "navigate" && action.kind !== "wait" && (
                    <Field
                      id={`pr10b-action-expected-${index}`}
                      label={t("pr10b.fields.expectedResult")}
                    >
                      <input
                        id={`pr10b-action-expected-${index}`}
                        className={inputClass}
                        value={action.expectedResult}
                        onChange={(event) =>
                          setActions((current) =>
                            current.map((item, i) =>
                              i === index
                                ? {
                                    ...item,
                                    expectedResult: event.target.value,
                                  }
                                : item,
                            ),
                          )
                        }
                      />
                    </Field>
                  )}
                  <div className="flex justify-end">
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={actions.length === 1}
                      onClick={() =>
                        setActions((current) =>
                          current.filter((_, i) => i !== index),
                        )
                      }
                    >
                      {t("pr10b.actions.remove")}
                    </Button>
                  </div>
                </fieldset>
              ))}
            </Card>
          )}

          {journeyType === "API" && (
            <Card className="space-y-4 p-5">
              <h2 className="font-display text-base font-bold text-navy">
                {t("pr10b.editor.apiRequest")}
              </h2>
              <div className="grid gap-4 sm:grid-cols-[10rem_1fr]">
                <Field
                  id="pr10b-method"
                  label={t("pr10b.fields.method")}
                  required
                >
                  <select
                    id="pr10b-method"
                    className={inputClass}
                    value={method}
                    onChange={(event) =>
                      setMethod(event.target.value as HttpMethod)
                    }
                  >
                    {methods.map((value) => (
                      <option key={value} value={value}>
                        {value}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field
                  id="pr10b-endpoint"
                  label={t("pr10b.fields.endpoint")}
                  required
                  error={errors.endpoint}
                >
                  <input
                    id="pr10b-endpoint"
                    dir="ltr"
                    className={inputClass}
                    value={endpoint}
                    aria-invalid={Boolean(errors.endpoint)}
                    onChange={(event) => setEndpoint(event.target.value)}
                  />
                </Field>
              </div>
              <div className="grid gap-4 lg:grid-cols-2">
                <Field
                  id="pr10b-query"
                  label={t("pr10b.fields.query")}
                  hint={t("pr10b.hints.keyValueLines")}
                >
                  <textarea
                    id="pr10b-query"
                    dir="ltr"
                    rows={4}
                    className={`${inputClass} font-mono`}
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                  />
                </Field>
                <Field
                  id="pr10b-headers"
                  label={t("pr10b.fields.headers")}
                  hint={t("pr10b.hints.keyValueLines")}
                >
                  <textarea
                    id="pr10b-headers"
                    dir="ltr"
                    rows={4}
                    className={`${inputClass} font-mono`}
                    value={headers}
                    onChange={(event) => setHeaders(event.target.value)}
                  />
                </Field>
              </div>
              <Field id="pr10b-body" label={t("pr10b.fields.body")}>
                <textarea
                  id="pr10b-body"
                  dir="ltr"
                  rows={6}
                  className={`${inputClass} font-mono`}
                  value={body}
                  onChange={(event) => setBody(event.target.value)}
                />
              </Field>
              <div className="grid gap-4 lg:grid-cols-[12rem_1fr]">
                <Field
                  id="pr10b-status"
                  label={t("pr10b.fields.expectedStatus")}
                  required
                  error={errors.status}
                >
                  <input
                    id="pr10b-status"
                    dir="ltr"
                    inputMode="numeric"
                    className={inputClass}
                    value={status}
                    aria-invalid={Boolean(errors.status)}
                    onChange={(event) => setStatus(event.target.value)}
                  />
                </Field>
                <Field
                  id="pr10b-assertions"
                  label={t("pr10b.fields.assertions")}
                  hint={t("pr10b.hints.assertionLines")}
                >
                  <textarea
                    id="pr10b-assertions"
                    dir="ltr"
                    rows={4}
                    className={`${inputClass} font-mono`}
                    value={assertions}
                    onChange={(event) => setAssertions(event.target.value)}
                  />
                </Field>
              </div>
            </Card>
          )}

          {journeyType === "MIXED" && (
            <Alert tone="info" title={t("pr10b.editor.mixedTitle")}>
              {t("pr10b.editor.mixedDescription")}
            </Alert>
          )}

          <div className="flex flex-wrap justify-between gap-2">
            <Button variant="secondary" onClick={onBack}>
              {t("pr10b.actions.cancel")}
            </Button>
            <Button variant="primary" onClick={goToReview}>
              {t("pr10b.actions.review")}
            </Button>
          </div>
        </>
      ) : (
        <>
          <Card className="space-y-5 p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-display text-lg font-bold text-navy">
                {t("pr10b.review.title")}
              </h2>
              <Button
                size="sm"
                variant="link"
                onClick={() => setStep("editor")}
              >
                {t("pr10b.actions.edit")}
              </Button>
            </div>
            <dl className="grid gap-4 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-[12px] font-semibold text-slate-400">
                  {t("pr10b.fields.name")}
                </dt>
                <dd className="mt-1 font-medium text-navy">{name}</dd>
              </div>
              <div>
                <dt className="text-[12px] font-semibold text-slate-400">
                  {t("pr10b.fields.journeyType")}
                </dt>
                <dd className="mt-1 font-medium text-navy">{journeyType}</dd>
              </div>
              {/* Re-audit LOW: guard on the computed value so an empty raw
                  description with a selected credential still shows the
                  suffix the submit handler sends. */}
              {finalDescription && (
                <div className="sm:col-span-2">
                  <dt className="text-[12px] font-semibold text-slate-400">
                    {t("pr10b.fields.description")}
                    {selectedCredential && (
                      <span className="ml-1.5 font-normal normal-case tracking-normal text-slate-400">
                        ({t("credentials.manual.asSubmitted")})
                      </span>
                    )}
                  </dt>
                  {/* Audit F-01: the reviewer sees the EXACT string the submit
                      handler sends — credential metadata included, never a
                      separately-rendered approximation. */}
                  <dd className="mt-1 whitespace-pre-wrap text-slate-700">
                    {finalDescription}
                  </dd>
                </div>
              )}
            </dl>
            {journeyType === "UI" && <ReviewUIActions actions={actions} />}
            {journeyType === "API" && (
              <ReviewAPI
                method={method}
                endpoint={endpoint}
                query={query}
                headers={headers}
                body={body}
                status={status}
                assertions={assertions}
              />
            )}
            {journeyType === "MIXED" && (
              <p className="text-sm text-slate-600">
                {t("pr10b.review.mixedStarter")}
              </p>
            )}
            {selectedCredential && (
              <div>
                <dt className="text-[12px] font-semibold text-slate-400">
                  {t("pr10c.composer.credentialLabel")}
                </dt>
                <dd className="mt-1 font-medium text-navy">
                  {selectedCredential.name}
                  {" · "}
                  {selectedCredential.status === "CONFIGURED"
                    ? t("settings.credentials.statusConfigured")
                    : t("settings.credentials.statusNeedsSetup")}
                </dd>
              </div>
            )}
          </Card>
          {draft.failure && (
            <SubmitFailureAlert
              failure={draft.failure}
              retrying={draft.submitting}
              onRetry={() => void draft.submit(payload, true)}
            />
          )}
          <div className="flex flex-wrap justify-between gap-2">
            <Button
              variant="secondary"
              disabled={draft.submitting}
              onClick={() => setStep("editor")}
            >
              {t("pr10b.actions.backToEditor")}
            </Button>
            <Button
              variant="primary"
              loading={draft.submitting}
              disabled={descriptionOverflowCount > 0}
              onClick={() => void draft.submit(payload)}
            >
              {t("pr10b.actions.createDraft")}
            </Button>
          </div>
        </>
      )}
    </div>
  )
}

function ReviewUIActions({ actions }: { actions: UIActionForm[] }) {
  const { t } = useLang()
  return (
    <div>
      <h3 className="text-[12px] font-semibold text-slate-400">
        {t("pr10b.editor.uiActions")}
      </h3>
      <ol className="mt-2 space-y-2">
        {actions.map((action, index) => (
          <li
            key={action.id}
            className="rounded-lg bg-slate-50 px-3 py-2 text-[13px] text-slate-700"
          >
            <span className="font-semibold">
              {index + 1}. {action.kind}
            </span>{" "}
            <code dir="ltr" className="font-mono text-[12px]">
              {action.kind === "navigate"
                ? action.url
                : `${action.strategy}:${action.locator}${
                    action.value ? ` = ${action.value}` : ""
                  }`}
            </code>
          </li>
        ))}
      </ol>
    </div>
  )
}

function ReviewAPI({
  method,
  endpoint,
  query,
  headers,
  body,
  status,
  assertions,
}: {
  method: HttpMethod
  endpoint: string
  query: string
  headers: string
  body: string
  status: string
  assertions: string
}) {
  const { t } = useLang()
  const rows = [
    [t("pr10b.fields.method"), method],
    [t("pr10b.fields.endpoint"), endpoint],
    [t("pr10b.fields.query"), query],
    [t("pr10b.fields.headers"), headers],
    [t("pr10b.fields.body"), body],
    [t("pr10b.fields.expectedStatus"), status],
    [t("pr10b.fields.assertions"), assertions],
  ].filter(([, value]) => value)
  return (
    <dl className="space-y-2 rounded-xl bg-slate-50 p-4">
      {rows.map(([label, value]) => (
        <div key={label} className="grid gap-1 sm:grid-cols-[10rem_1fr]">
          <dt className="text-[12px] font-semibold text-slate-400">{label}</dt>
          <dd
            dir="ltr"
            className="whitespace-pre-wrap break-all font-mono text-[12px] text-slate-700"
          >
            {value}
          </dd>
        </div>
      ))}
    </dl>
  )
}

export default ManualEditorFlow
