import React, { useEffect, useMemo, useRef, useState } from "react"

/* PR10E TODO: keep this implementation for the future recorder/internal
 * capability. It is intentionally not mounted as a customer-selected method:
 * the AI Test Builder owns discovery selection under PR10C D-1. */

import {
  Alert,
  Button,
  Card,
  EmptyState,
  ErrorState,
  Spinner,
} from "../primitives"
import { useLang } from "../../lib/i18n"
import { ApiError, apiClientDetails, apiRunDiscovery } from "../../lib/api"
import {
  DiscoveryError,
  normalizeDiscoveryResult,
  type NormalizedDiscoveryResult,
} from "../../lib/discovery"
import { buildDiscoverySourceJson } from "../../lib/testSourceBuilders"
import {
  DraftSuccess,
  Field,
  SubmitFailureAlert,
  inputClass,
  useDraftSubmit,
  type DraftPayload,
} from "./CreateTestShared"

type DiscoveryFlowProps = {
  clientId: number
  onBack: () => void
  onOpenDefinition: (definitionId: number) => void
  onViewDrafts: () => void
  onUnauthorized: () => void
}

type Candidate = {
  strategy: string
  value: string
  strength: string
  state: string
}
type PageElement = {
  elementId: string
  role: string
  name: string
  attributes: Record<string, string>
  locatorCandidates: Candidate[]
}
type DiscoveryView = NormalizedDiscoveryResult
type Phase = "setup" | "loading" | "results" | "review"

function elementKey(element: PageElement, elementIndex: number) {
  return `${element.elementId || elementIndex}`
}

function builderSource(value: unknown): string {
  return typeof value === "string"
    ? value
    : `${JSON.stringify(value, null, 2)}\n`
}

export function DiscoveryFlow({
  clientId,
  onBack,
  onOpenDefinition,
  onViewDrafts,
  onUnauthorized,
}: DiscoveryFlowProps) {
  const { t } = useLang()
  const [phase, setPhase] = useState<Phase>("setup")
  const [origin, setOrigin] = useState("")
  const [clientLoading, setClientLoading] = useState(true)
  const [clientError, setClientError] = useState<string | null>(null)
  const [result, setResult] = useState<DiscoveryView | null>(null)
  const [discoveryError, setDiscoveryError] = useState<string | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [filter, setFilter] = useState("")
  const [name, setName] = useState("")
  const [description, setDescription] = useState("")
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const requestId = useRef(0)
  const draft = useDraftSubmit({ clientId, onUnauthorized })

  useEffect(() => {
    let cancelled = false
    setClientLoading(true)
    setClientError(null)
    apiClientDetails(clientId)
      .then((details) => {
        if (cancelled) return
        const baseUrl = details.client.base_url?.trim() ?? ""
        setOrigin(baseUrl)
        if (!baseUrl) setClientError(t("pr10b.discovery.noOrigin"))
      })
      .catch((error) => {
        if (cancelled) return
        if (error instanceof ApiError && error.status === 401) {
          onUnauthorized()
          return
        }
        setClientError(
          error instanceof ApiError
            ? error.message
            : t("pr10b.discovery.clientLoadFailed"),
        )
      })
      .finally(() => {
        if (!cancelled) setClientLoading(false)
      })
    return () => {
      cancelled = true
      requestId.current += 1
    }
  }, [clientId, onUnauthorized, t])

  async function runDiscovery() {
    if (phase === "loading") return
    const current = ++requestId.current
    setPhase("loading")
    setDiscoveryError(null)
    setResult(null)
    setSelected(new Set())
    try {
      const normalized = normalizeDiscoveryResult(
        await apiRunDiscovery(clientId),
      ) as DiscoveryView
      if (current !== requestId.current) return
      setResult(normalized)
      setSelected(
        new Set(
          normalized.elements.map((element, elementIndex) =>
            elementKey(element, elementIndex),
          ),
        ),
      )
      setPhase("results")
    } catch (error) {
      if (current !== requestId.current) return
      if (error instanceof ApiError && error.status === 401) {
        onUnauthorized()
        return
      }
      if (error instanceof DiscoveryError) {
        const messageKey = `discovery.errors.${
          error.isTimeout ? "mcp_call_timeout" : error.token
        }`
        setDiscoveryError(t(messageKey))
      } else if (error instanceof ApiError) {
        setDiscoveryError(error.message)
      } else {
        setDiscoveryError(t("pr10b.discovery.failed"))
      }
      setPhase("setup")
    }
  }

  const selectedElements = useMemo(() => {
    if (!result) return []
    return result.elements.filter((element, elementIndex) =>
      selected.has(elementKey(element, elementIndex)),
    )
  }, [result, selected])

  const payload = useMemo<DraftPayload | null>(() => {
    if (!result) return null
    return {
      journeyType: "UI",
      name: name.trim(),
      description,
      sourceJson: builderSource(
        buildDiscoverySourceJson(
          name.trim(),
          description,
          result.origin,
          selectedElements,
        ),
      ),
    }
  }, [description, name, result, selectedElements])

  function goToReview() {
    const next: Record<string, string> = {}
    if (!name.trim()) next.name = t("pr10b.validation.nameRequired")
    if (name.trim().length > 120) next.name = t("pr10b.validation.nameLong")
    if (description.length > 2000)
      next.description = t("pr10b.validation.descriptionLong")
    if (selectedElements.length === 0)
      next.selection = t("pr10b.validation.selectionRequired")
    setFieldErrors(next)
    if (Object.keys(next).length === 0) setPhase("review")
  }

  function toggle(key: string) {
    setSelected((current) => {
      const next = new Set(current)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  function createAnother() {
    requestId.current += 1
    setPhase("setup")
    setResult(null)
    setSelected(new Set())
    setName("")
    setDescription("")
    setFilter("")
    setDiscoveryError(null)
    setFieldErrors({})
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

  const hasElements = Boolean(result?.elements.length)

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
            {t("pr10b.discovery.title")}
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            {t("pr10b.discovery.subtitle")}
          </p>
        </div>
        <Button size="sm" variant="ghost" onClick={onViewDrafts}>
          {t("pr10b.success.viewDrafts")}
        </Button>
      </div>

      <Card className="space-y-4 p-5">
        <Field
          id="pr10b-origin"
          label={t("pr10b.discovery.origin")}
          hint={t("pr10b.discovery.originHint")}
          error={clientError}
        >
          <div className="relative">
            <input
              id="pr10b-origin"
              dir="ltr"
              readOnly
              disabled
              value={origin}
              className={inputClass}
              aria-describedby={
                clientError ? "pr10b-origin-error" : "pr10b-origin-hint"
              }
            />
            {clientLoading && (
              <Spinner
                size="sm"
                className="absolute end-3 top-3 text-slate-400"
              />
            )}
          </div>
        </Field>
        {phase === "loading" ? (
          <div
            role="status"
            aria-live="polite"
            className="flex items-center gap-3 rounded-xl bg-brand-50 p-4 text-sm text-brand-300"
          >
            <Spinner />
            <div>
              <p className="font-semibold">{t("pr10b.discovery.loading")}</p>
              <p className="text-[12px] opacity-80">
                {t("pr10b.discovery.loadingHint")}
              </p>
            </div>
          </div>
        ) : (
          <Button
            variant="primary"
            disabled={clientLoading || Boolean(clientError) || !origin}
            onClick={() => void runDiscovery()}
          >
            {result ? t("pr10b.discovery.retry") : t("pr10b.discovery.start")}
          </Button>
        )}
      </Card>

      {discoveryError && (
        <ErrorState
          title={t("pr10b.discovery.errorTitle")}
          description={discoveryError}
          onRetry={() => void runDiscovery()}
        />
      )}

      {result && (phase === "results" || phase === "review") && (
        <>
          {result.truncated && (
            <Alert tone="warning" title={t("pr10b.discovery.truncatedTitle")}>
              {t("pr10b.discovery.truncatedDescription")}
            </Alert>
          )}
          {!hasElements ? (
            <Card>
              <EmptyState
                title={t("pr10b.discovery.emptyTitle")}
                description={t("pr10b.discovery.emptyDescription")}
                action={
                  <Button
                    variant="secondary"
                    onClick={() => void runDiscovery()}
                  >
                    {t("pr10b.discovery.retry")}
                  </Button>
                }
              />
            </Card>
          ) : phase === "results" ? (
            <>
              <Card className="space-y-4 p-5">
                <div className="flex flex-wrap items-end justify-between gap-3">
                  <div>
                    <h2 className="font-display text-base font-bold text-navy">
                      {t("pr10b.discovery.results")}
                    </h2>
                    <p className="text-[12px] text-slate-400">
                      {t("pr10b.discovery.selectedCount", {
                        count: selected.size,
                      })}
                    </p>
                  </div>
                  <Field id="pr10b-filter" label={t("pr10b.discovery.filter")}>
                    <input
                      id="pr10b-filter"
                      className={inputClass}
                      value={filter}
                      onChange={(event) => setFilter(event.target.value)}
                    />
                  </Field>
                </div>
                {(() => {
                  const query = filter.trim().toLocaleLowerCase()
                  const visible = result.elements
                    .map((element, elementIndex) => ({ element, elementIndex }))
                    .filter(
                      ({ element }) =>
                        !query ||
                        `${element.role} ${element.name} ${element.locatorCandidates.map((candidate) => candidate.value).join(" ")}`
                          .toLocaleLowerCase()
                          .includes(query),
                    )
                  return (
                    <section
                      aria-labelledby="pr10b-page"
                      className="space-y-3 rounded-xl border border-slate-200 p-4"
                    >
                      <div>
                        <h3 id="pr10b-page" className="font-semibold text-navy">
                          {result.pageTitle ||
                            t("pr10b.discovery.untitledPage")}
                        </h3>
                        <p
                          dir="ltr"
                          className="mt-1 break-all font-mono text-[11px] text-slate-400"
                        >
                          {result.pageUrl}
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() =>
                            setSelected(
                              new Set(
                                result.elements.map((element, elementIndex) =>
                                  elementKey(element, elementIndex),
                                ),
                              ),
                            )
                          }
                        >
                          {t("pr10b.discovery.selectAll")}
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setSelected(new Set())}
                        >
                          {t("pr10b.discovery.deselectAll")}
                        </Button>
                      </div>
                      {visible.length === 0 ? (
                        <EmptyState
                          title={t("pr10b.discovery.filterEmpty")}
                          description={t("pr10b.discovery.filterEmptyHint")}
                        />
                      ) : (
                        <div className="space-y-2">
                          {visible.map(({ element, elementIndex }) => {
                            const key = elementKey(element, elementIndex)
                            const first = element.locatorCandidates[0]
                            return (
                              <label
                                key={key}
                                className="flex cursor-pointer items-start gap-3 rounded-lg border border-slate-200 p-3 hover:bg-slate-50"
                              >
                                <input
                                  type="checkbox"
                                  className="mt-1 size-4"
                                  checked={selected.has(key)}
                                  onChange={() => toggle(key)}
                                />
                                <span className="min-w-0 flex-1">
                                  <span className="font-medium text-navy">
                                    {element.name || element.role}
                                  </span>
                                  <span className="ms-2 rounded bg-slate-100 px-1.5 py-0.5 text-[11px] text-slate-500">
                                    {element.role}
                                  </span>
                                  {first && (
                                    <span
                                      className="mt-1 block break-all font-mono text-[11px] text-slate-500"
                                      dir="ltr"
                                    >
                                      {first.strategy}: {first.value} ·{" "}
                                      {first.strength} · {first.state}
                                    </span>
                                  )}
                                </span>
                              </label>
                            )
                          })}
                        </div>
                      )}
                    </section>
                  )
                })()}
              </Card>
              {fieldErrors.selection && (
                <Alert tone="error" title={fieldErrors.selection} />
              )}
              <Card className="space-y-4 p-5">
                <h2 className="font-display text-base font-bold text-navy">
                  {t("pr10b.discovery.draftDetails")}
                </h2>
                <Field
                  id="pr10b-discovery-name"
                  label={t("pr10b.fields.name")}
                  required
                  error={fieldErrors.name}
                >
                  <input
                    id="pr10b-discovery-name"
                    className={inputClass}
                    maxLength={120}
                    value={name}
                    aria-invalid={Boolean(fieldErrors.name)}
                    onChange={(event) => setName(event.target.value)}
                  />
                </Field>
                <Field
                  id="pr10b-discovery-description"
                  label={t("pr10b.fields.description")}
                  error={fieldErrors.description}
                >
                  <textarea
                    id="pr10b-discovery-description"
                    className={inputClass}
                    rows={3}
                    maxLength={2000}
                    value={description}
                    onChange={(event) => setDescription(event.target.value)}
                  />
                </Field>
              </Card>
              <div className="flex justify-end">
                <Button variant="primary" onClick={goToReview}>
                  {t("pr10b.actions.review")}
                </Button>
              </div>
            </>
          ) : (
            <DiscoveryReview
              result={result}
              selectedElements={selectedElements}
              name={name}
              description={description}
            />
          )}
        </>
      )}

      {phase === "review" && payload && (
        <>
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
              onClick={() => setPhase("results")}
            >
              {t("pr10b.actions.backToEditor")}
            </Button>
            <Button
              variant="primary"
              loading={draft.submitting}
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

function DiscoveryReview({
  result,
  selectedElements,
  name,
  description,
}: {
  result: DiscoveryView
  selectedElements: PageElement[]
  name: string
  description: string
}) {
  const { t } = useLang()
  return (
    <Card className="space-y-4 p-5">
      <h2 className="font-display text-lg font-bold text-navy">
        {t("pr10b.review.title")}
      </h2>
      <dl className="grid gap-4 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-[12px] font-semibold text-slate-400">
            {t("pr10b.fields.name")}
          </dt>
          <dd className="mt-1 font-medium text-navy">{name}</dd>
        </div>
        <div>
          <dt className="text-[12px] font-semibold text-slate-400">
            {t("pr10b.discovery.elements")}
          </dt>
          <dd dir="ltr" className="mt-1 font-medium text-navy">
            {selectedElements.length}
          </dd>
        </div>
        <div className="sm:col-span-2">
          <dt className="text-[12px] font-semibold text-slate-400">
            {t("pr10b.discovery.origin")}
          </dt>
          <dd
            dir="ltr"
            className="mt-1 break-all font-mono text-[12px] text-slate-700"
          >
            {result.origin}
          </dd>
        </div>
        {description && (
          <div className="sm:col-span-2">
            <dt className="text-[12px] font-semibold text-slate-400">
              {t("pr10b.fields.description")}
            </dt>
            <dd className="mt-1 whitespace-pre-wrap text-slate-700">
              {description}
            </dd>
          </div>
        )}
      </dl>
      <ul className="space-y-2">
        {selectedElements.map((element, index) => (
          <li
            key={`${element.elementId}-${index}`}
            className="rounded-lg bg-slate-50 px-3 py-2 text-[13px] text-slate-700"
          >
            <span className="font-medium">{element.name || element.role}</span>
            {element.locatorCandidates[0] && (
              <code
                dir="ltr"
                className="ms-2 font-mono text-[11px] text-slate-500"
              >
                {element.locatorCandidates[0].strategy}:
                {element.locatorCandidates[0].value}
              </code>
            )}
          </li>
        ))}
      </ul>
    </Card>
  )
}

export default DiscoveryFlow
