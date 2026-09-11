import React, { useRef, useState } from "react"
import { Alert, Button, Card } from "../primitives"
import { useLang } from "../../lib/i18n"
import { ApiError, apiCreateManualEditorDraft } from "../../lib/api"
import {
  mapCreationFailure,
  newIdempotencyKey,
  type JourneyType,
} from "../../lib/testCreation"

export const inputClass =
  "block w-full rounded-lg border border-slate-200 bg-elevated px-3.5 py-2.5 text-[13px] text-slate-700 placeholder-slate-400 transition-colors hover:border-slate-300 focus:outline-none focus:ring-2 focus:ring-brand-400 disabled:cursor-not-allowed disabled:opacity-60"

export function Field({
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
    <div className="space-y-1.5">
      <label
        htmlFor={id}
        className="flex items-center gap-1 text-[12px] font-semibold text-slate-500"
      >
        {label}
        {required && (
          <span aria-hidden="true" className="text-error">
            *
          </span>
        )}
      </label>
      {children}
      {error ? (
        <p id={`${id}-error`} role="alert" className="text-[11px] text-error">
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className="text-[11px] text-slate-400">
          {hint}
        </p>
      ) : null}
    </div>
  )
}

export type DraftPayload = {
  journeyType: JourneyType
  name: string
  description: string
  sourceJson: string
}

type SubmitFailure = {
  titleKey: string
  detail?: string
  network: boolean
}

export function DraftSuccess({
  definitionId,
  onOpenDefinition,
  onCreateAnother,
  onViewDrafts,
}: {
  definitionId: number
  onOpenDefinition: (definitionId: number) => void
  onCreateAnother: () => void
  onViewDrafts: () => void
}) {
  const { t } = useLang()
  return (
    <Card
      className="mx-auto max-w-2xl p-6 text-center"
      role="status"
      aria-live="polite"
    >
      <div
        className="mx-auto flex size-12 items-center justify-center rounded-full bg-emerald-50 text-xl font-bold text-emerald-700"
        aria-hidden="true"
      >
        ✓
      </div>
      <h2 className="mt-4 font-display text-xl font-bold text-navy">
        {t("pr10b.success.title")}
      </h2>
      <p className="mt-1 text-sm text-slate-500">
        {t("pr10b.success.description")}
      </p>
      <p className="mt-3 text-[12px] text-slate-400" dir="ltr">
        {t("pr10b.success.definitionId", { id: definitionId })}
      </p>
      <div className="mt-5 flex flex-wrap justify-center gap-2">
        <Button
          variant="primary"
          onClick={() => onOpenDefinition(definitionId)}
        >
          {t("pr10b.success.open")}
        </Button>
        <Button variant="secondary" onClick={onCreateAnother}>
          {t("pr10b.success.another")}
        </Button>
        <Button variant="ghost" onClick={onViewDrafts}>
          {t("pr10b.success.viewDrafts")}
        </Button>
      </div>
    </Card>
  )
}

export function useDraftSubmit({
  clientId,
  onUnauthorized,
}: {
  clientId: number
  onUnauthorized: () => void
}) {
  const [submitting, setSubmitting] = useState(false)
  const [failure, setFailure] = useState<SubmitFailure | null>(null)
  const [definitionId, setDefinitionId] = useState<number | null>(null)
  const idempotencyKey = useRef<string | null>(null)

  async function submit(payload: DraftPayload, explicitRetry = false) {
    if (submitting) return
    if (explicitRetry || !idempotencyKey.current)
      idempotencyKey.current = newIdempotencyKey()
    setSubmitting(true)
    setFailure(null)
    try {
      const result = await apiCreateManualEditorDraft(
        clientId,
        {
          journeyType: payload.journeyType,
          name: payload.name,
          description: payload.description.trim() || null,
          initialSourceJson: payload.sourceJson,
        },
        idempotencyKey.current,
      )
      setDefinitionId(result.definitionId)
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        onUnauthorized()
        return
      }
      const mapped = mapCreationFailure(error)
      if (mapped.kind === "validation") {
        setFailure({
          titleKey: "pr10b.errors.validation",
          detail: mapped.message,
          network: false,
        })
      } else if (mapped.kind === "conflict") {
        setFailure({ titleKey: "pr10b.errors.duplicate", network: false })
      } else if (mapped.kind === "unavailable") {
        setFailure({ titleKey: "pr10b.errors.unavailable", network: false })
      } else if (mapped.kind === "network") {
        setFailure({ titleKey: "pr10b.errors.network", network: true })
      } else {
        setFailure({
          titleKey: "pr10b.errors.unexpected",
          detail: "message" in mapped ? mapped.message : undefined,
          network: false,
        })
      }
    } finally {
      setSubmitting(false)
    }
  }

  function resetSubmit() {
    idempotencyKey.current = null
    setFailure(null)
    setDefinitionId(null)
  }

  return { submitting, failure, definitionId, submit, resetSubmit }
}

export function SubmitFailureAlert({
  failure,
  onRetry,
  retrying,
}: {
  failure: SubmitFailure
  onRetry: () => void
  retrying: boolean
}) {
  const { t } = useLang()
  return (
    <Alert tone="error" title={t(failure.titleKey)}>
      {failure.detail && <p>{failure.detail}</p>}
      <Button
        className="mt-2"
        size="sm"
        variant="secondary"
        loading={retrying}
        onClick={onRetry}
      >
        {t("pr10b.actions.retry")}
      </Button>
    </Alert>
  )
}
