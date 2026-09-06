import React, { useCallback, useEffect, useMemo, useState } from "react"
import { Button, Card, cx, useToast } from "../primitives"
import { useLang } from "../../lib/i18n"
import {
  apiClientDetails,
  apiCreateTestDefinition,
  type BackendFlowRow,
} from "../../lib/api"
import { mapTestDefinitionFailure } from "../../lib/testDefinitionLifecycle"
import {
  formatDefinitionSource,
  starterDefinitionSource,
  validateDefinitionSource,
  type LocalValidation,
} from "../../lib/testDefinitionSchema"
import {
  BackButton,
  FieldError,
  FieldHint,
  FieldLabel,
  JsonEditor,
  SectionHeading,
  SelectInput,
  TextArea,
  TextInput,
  ValidationFindings,
} from "./shared"

const NAME_MAX = 120
const DESCRIPTION_MAX = 2000

type Errors = Partial<Record<"name" | "description" | "flowId" | "source", string>>

/**
 * Creates a definition and its initial DRAFT version.
 *
 * The source document is checked locally before the request so a syntax slip or
 * a schema mistake is shown against the offending node instead of costing a
 * round trip; the engine validates again on `POST …/validate`, and that result
 * is the one that moves the lifecycle.
 */
export function TestDefinitionCreate({
  clientId,
  clientName,
  onCancel,
  onCreated,
  onUnauthorized,
}: {
  clientId: number
  clientName: string
  onCancel: () => void
  onCreated: (definitionId: number) => void
  onUnauthorized: () => void
}) {
  const { t } = useLang()
  const toast = useToast()

  const [name, setName] = useState("")
  const [description, setDescription] = useState("")
  const [flowId, setFlowId] = useState<string>("")
  const [source, setSource] = useState("")
  const [errors, setErrors] = useState<Errors>({})
  const [submitting, setSubmitting] = useState(false)

  const [flows, setFlows] = useState<BackendFlowRow[] | null>(null)
  const [flowsFailed, setFlowsFailed] = useState(false)

  /* Flow bindings come from the client the definition belongs to. A failure here
     is not fatal: the definition can be created unbound and bound later. */
  useEffect(() => {
    let cancelled = false
    apiClientDetails(clientId)
      .then((details) => {
        if (cancelled) return
        setFlows(details.flows ?? [])
      })
      .catch((err) => {
        if (cancelled) return
        if (mapTestDefinitionFailure(err).kind === "unauthenticated") {
          onUnauthorized()
          return
        }
        setFlows([])
        setFlowsFailed(true)
      })
    return () => {
      cancelled = true
    }
  }, [clientId, onUnauthorized])

  const localValidation: LocalValidation | null = useMemo(
    () => (source.trim() === "" ? null : validateDefinitionSource(source)),
    [source],
  )

  const update = useCallback(<K extends keyof Errors>(key: K) => {
    setErrors((prev) => (prev[key] === undefined ? prev : { ...prev, [key]: undefined }))
  }, [])

  function validate(): Errors {
    const next: Errors = {}
    const trimmedName = name.trim()
    if (!trimmedName) next.name = t("testdef.create.nameRequired")
    else if (trimmedName.length > NAME_MAX) next.name = t("testdef.create.nameTooLong")
    if (description.length > DESCRIPTION_MAX) next.description = t("testdef.create.descriptionTooLong")
    if (source.trim() !== "" && localValidation && !localValidation.valid) {
      next.source = localValidation.errors[0]?.message ?? t("testdef.detail.jsonInvalid")
    }
    return next
  }

  async function handleSubmit() {
    if (submitting) return
    const found = validate()
    if (Object.keys(found).length > 0) {
      setErrors(found)
      return
    }
    setErrors({})
    setSubmitting(true)
    try {
      const created = await apiCreateTestDefinition(clientId, {
        name: name.trim(),
        description: description.trim() || null,
        flowId: flowId === "" ? null : Number(flowId),
        // Blank source lets the engine seed its own starter template, so the
        // client and the server never disagree about the initial document.
        initialSourceJson: source.trim() === "" ? null : source,
      })
      toast({
        title: t("testdef.create.createdTitle"),
        description: t("testdef.create.createdDesc", {
          name: created.name,
          version: created.versionNumber,
        }),
        variant: "success",
      })
      onCreated(created.definitionId)
    } catch (err) {
      const failure = mapTestDefinitionFailure(err)
      if (failure.kind === "unauthenticated") {
        onUnauthorized()
        return
      }
      if (failure.kind === "conflict") {
        setErrors({ name: t("testdef.create.duplicateName") })
        return
      }
      if (failure.kind === "notFound") {
        // The engine answers 404 when the named flow does not belong to this client.
        setErrors({ flowId: failure.message })
        return
      }
      if (failure.kind === "invalid") {
        setErrors({ source: failure.message })
        return
      }
      toast({ title: t("testdef.create.failedTitle"), description: failure.message, variant: "error" })
    } finally {
      setSubmitting(false)
    }
  }

  function handleFormat() {
    const formatted = formatDefinitionSource(source)
    if (formatted === null) {
      setErrors((prev) => ({ ...prev, source: t("testdef.create.formatFailed") }))
      return
    }
    setSource(formatted)
    update("source")
  }

  return (
    <div className="space-y-6">
      <div>
        <BackButton label={t("testdef.back")} onClick={onCancel} />
        <h1 className="font-display text-2xl font-bold tracking-tight text-navy">
          {t("testdef.create.title")}
        </h1>
        <p className="mt-1 text-[13px] text-slate-500">{t("testdef.create.subtitle")}</p>
      </div>

      <Card className="p-5">
        <SectionHeading>{t("testdef.detail.metadata")}</SectionHeading>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <FieldLabel htmlFor="testdef-name" required>
              {t("testdef.create.name")}
            </FieldLabel>
            <TextInput
              id="testdef-name"
              value={name}
              maxLength={NAME_MAX}
              error={Boolean(errors.name)}
              aria-describedby={errors.name ? "testdef-name-error" : undefined}
              placeholder={t("testdef.create.namePlaceholder")}
              onChange={(e) => {
                setName(e.target.value)
                update("name")
              }}
            />
            {errors.name ? (
              <FieldError id="testdef-name-error">{errors.name}</FieldError>
            ) : (
              <FieldHint>{t("testdef.create.nameHint")}</FieldHint>
            )}
          </div>

          <div className="space-y-1.5">
            <FieldLabel htmlFor="testdef-client">{t("testdef.create.client")}</FieldLabel>
            {/* Tenant scope is fixed by the route the request is made on; it is
                shown for context and never chosen inside the form. */}
            <TextInput
              id="testdef-client"
              value={clientName || `#${clientId}`}
              readOnly
              disabled
              className="cursor-not-allowed"
            />
          </div>

          <div className="space-y-1.5">
            <FieldLabel htmlFor="testdef-flow">{t("testdef.create.flow")}</FieldLabel>
            <SelectInput
              id="testdef-flow"
              value={flowId}
              error={Boolean(errors.flowId)}
              aria-describedby={errors.flowId ? "testdef-flow-error" : undefined}
              disabled={flows === null}
              onChange={(e) => {
                setFlowId(e.target.value)
                update("flowId")
              }}
            >
              <option value="">{t("testdef.create.flowNone")}</option>
              {(flows ?? []).map((flow) => (
                <option key={flow.id} value={String(flow.id)}>
                  {flow.flow_name}
                </option>
              ))}
            </SelectInput>
            {errors.flowId ? (
              <FieldError id="testdef-flow-error">{errors.flowId}</FieldError>
            ) : (
              <FieldHint>
                {flowsFailed ? t("testdef.create.flowLoadFailed") : t("testdef.create.flowHint")}
              </FieldHint>
            )}
          </div>

          <div className="space-y-1.5">
            <FieldLabel htmlFor="testdef-description">{t("testdef.create.description")}</FieldLabel>
            <TextArea
              id="testdef-description"
              rows={3}
              value={description}
              maxLength={DESCRIPTION_MAX}
              error={Boolean(errors.description)}
              aria-describedby={errors.description ? "testdef-description-error" : undefined}
              placeholder={t("testdef.create.descriptionPlaceholder")}
              onChange={(e) => {
                setDescription(e.target.value)
                update("description")
              }}
            />
            {errors.description && (
              <FieldError id="testdef-description-error">{errors.description}</FieldError>
            )}
          </div>
        </div>
      </Card>

      <Card className="p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <SectionHeading>{t("testdef.create.source")}</SectionHeading>
          <div className="flex items-center gap-2 pb-3">
            <Button variant="ghost" size="sm" onClick={() => { setSource(starterDefinitionSource(name)); update("source") }}>
              {t("testdef.create.insertStarter")}
            </Button>
            <Button variant="ghost" size="sm" onClick={handleFormat} disabled={source.trim() === ""}>
              {t("testdef.create.format")}
            </Button>
          </div>
        </div>
        <label htmlFor="testdef-source" className="sr-only">
          {t("testdef.create.source")}
        </label>
        <JsonEditor
          id="testdef-source"
          rows={16}
          value={source}
          error={Boolean(errors.source)}
          aria-describedby={errors.source ? "testdef-source-error" : "testdef-source-hint"}
          onChange={(e) => {
            setSource(e.target.value)
            update("source")
          }}
        />
        {errors.source ? (
          <div className="mt-1.5">
            <FieldError id="testdef-source-error">{errors.source}</FieldError>
          </div>
        ) : (
          <p id="testdef-source-hint" className="mt-1.5 text-[11px] text-slate-400">
            {t("testdef.create.sourceHint")}
          </p>
        )}
      </Card>

      {localValidation && (
        <ValidationFindings
          title={t("testdef.validation.localTitle")}
          hint={t("testdef.validation.localHint")}
          valid={localValidation.valid}
          errors={localValidation.errors}
          warnings={localValidation.warnings}
        />
      )}

      <div className={cx("flex items-center justify-end gap-2")}>
        <Button variant="secondary" onClick={onCancel} disabled={submitting}>
          {t("common.cancel")}
        </Button>
        <Button variant="primary" onClick={() => void handleSubmit()} loading={submitting}>
          {submitting ? t("testdef.create.submitting") : t("testdef.create.submit")}
        </Button>
      </div>
    </div>
  )
}

export default TestDefinitionCreate
