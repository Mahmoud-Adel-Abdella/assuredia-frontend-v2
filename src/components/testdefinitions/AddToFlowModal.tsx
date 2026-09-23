import { useCallback, useEffect, useMemo, useState } from "react"

import {
  apiClientDetails,
  apiCreateFlow,
  apiUpdateTestDefinition,
  type BackendFlowRow,
} from "../../lib/api"
import { mapTestDefinitionFailure } from "../../lib/testDefinitionLifecycle"
import { useLang } from "../../lib/i18n"
import { Alert, Button, FormField, Input, Modal, Select, Spinner } from "../primitives"

/**
 * Add a Test Definition to a Flow — existing or newly created (Draft-Activation phase).
 *
 * A Test Definition's Flow membership is the aggregate's single `flowId` (many-to-one). This dialog
 * reuses the existing endpoints rather than inventing anything:
 *
 *  - "Existing Flow": `apiUpdateTestDefinition({ flowId })` re-binds the aggregate. The server
 *    validates that the flow belongs to the same client (cross-client is a 404).
 *  - "Create new Flow": `apiCreateFlow({ flowName })` creates an (empty) flow, then
 *    `apiUpdateTestDefinition({ flowId })` binds this definition to it. `flows` has a UNIQUE
 *    (client_id, flow_name), so a duplicate name is a safe 409 rather than a duplicate flow.
 *
 * The definition's name and description are sent unchanged on the bind so the PUT (which COALESCEs
 * to null on omission) never wipes them — only `flowId` changes.
 */
export function AddToFlowModal({
  open,
  clientId,
  definitionId,
  definitionName,
  definitionDescription,
  currentFlowId,
  onClose,
  onAdded,
  onUnauthorized,
}: {
  open: boolean
  clientId: number
  definitionId: number
  definitionName: string
  definitionDescription: string | null
  currentFlowId: number | null
  onClose: () => void
  onAdded: () => void
  onUnauthorized: () => void
}) {
  const { t } = useLang()

  const [mode, setMode] = useState<"existing" | "new">("existing")
  const [flows, setFlows] = useState<BackendFlowRow[] | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [selectedFlowId, setSelectedFlowId] = useState<string>("")
  const [newFlowName, setNewFlowName] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)

  const reload = useCallback(async () => {
    setFlows(null)
    setLoadError(null)
    try {
      const details = await apiClientDetails(clientId)
      // Only active flows are valid bind targets; a soft-deleted flow must not be offered.
      setFlows((details.flows ?? []).filter((f) => f.is_active !== false))
    } catch (err) {
      const failure = mapTestDefinitionFailure(err)
      if (failure.kind === "unauthenticated") {
        onUnauthorized()
        return
      }
      setLoadError(failure.message)
    }
  }, [clientId, onUnauthorized])

  useEffect(() => {
    if (!open) return
    setMode("existing")
    setSelectedFlowId("")
    setNewFlowName("")
    setSubmitError(null)
    void reload()
  }, [open, reload])

  const flowOptions = useMemo(
    () =>
      (flows ?? []).map((f) => ({
        value: String(f.id),
        label: f.id === currentFlowId ? `${f.flow_name} ${t("testdef.addToFlow.currentSuffix")}` : f.flow_name,
      })),
    [flows, currentFlowId, t],
  )

  const canSubmit =
    !submitting &&
    (mode === "existing" ? selectedFlowId !== "" : newFlowName.trim().length > 0)

  /** Binds the aggregate to `flowId`, preserving name/description. */
  async function bind(flowId: number) {
    await apiUpdateTestDefinition(clientId, definitionId, {
      name: definitionName,
      description: definitionDescription,
      flowId,
    })
  }

  async function submit() {
    if (!canSubmit) return
    setSubmitting(true)
    setSubmitError(null)
    try {
      if (mode === "existing") {
        await bind(Number(selectedFlowId))
      } else {
        const created = await apiCreateFlow(clientId, { flowName: newFlowName.trim() })
        await bind(created.flowId)
      }
      onAdded()
    } catch (err) {
      const failure = mapTestDefinitionFailure(err)
      if (failure.kind === "unauthenticated") {
        onUnauthorized()
        return
      }
      setSubmitError(failure.message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal
      isOpen={open}
      onClose={onClose}
      title={t("testdef.addToFlow.title", { name: definitionName })}
      description={t("testdef.addToFlow.subtitle")}
      size="md"
      footer={
        <div className="flex items-center justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button
            variant="primary"
            data-testid="add-to-flow-submit"
            loading={submitting}
            disabled={!canSubmit}
            onClick={() => void submit()}
          >
            {mode === "existing"
              ? t("testdef.addToFlow.addExisting")
              : t("testdef.addToFlow.createAndAdd")}
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        {/* Mode toggle */}
        <div className="flex gap-2" role="radiogroup" aria-label={t("testdef.addToFlow.mode")}>
          <button
            type="button"
            role="radio"
            aria-checked={mode === "existing"}
            data-testid="add-to-flow-mode-existing"
            onClick={() => setMode("existing")}
            className={
              "flex-1 rounded-lg border px-3 py-2 text-[13px] font-medium transition-colors " +
              (mode === "existing"
                ? "border-brand-400 bg-brand-50 text-brand-700"
                : "border-slate-200 text-slate-600 hover:border-slate-300")
            }
          >
            {t("testdef.addToFlow.existing")}
          </button>
          <button
            type="button"
            role="radio"
            aria-checked={mode === "new"}
            data-testid="add-to-flow-mode-new"
            onClick={() => setMode("new")}
            className={
              "flex-1 rounded-lg border px-3 py-2 text-[13px] font-medium transition-colors " +
              (mode === "new"
                ? "border-brand-400 bg-brand-50 text-brand-700"
                : "border-slate-200 text-slate-600 hover:border-slate-300")
            }
          >
            {t("testdef.addToFlow.createNew")}
          </button>
        </div>

        {mode === "existing" ? (
          loadError ? (
            <div className="space-y-2">
              <Alert tone="error" title={t("testdef.addToFlow.loadFailed")}>
                {loadError}
              </Alert>
              <Button variant="secondary" size="sm" onClick={() => void reload()}>
                {t("common.retry")}
              </Button>
            </div>
          ) : flows === null ? (
            <div className="flex items-center gap-2 py-3 text-[12px] text-slate-400">
              <Spinner size="sm" />
              {t("common.loading")}
            </div>
          ) : flows.length === 0 ? (
            <p className="py-2 text-[12px] text-slate-400" data-testid="add-to-flow-no-flows">
              {t("testdef.addToFlow.noFlows")}
            </p>
          ) : (
            <FormField label={t("testdef.addToFlow.existingLabel")} htmlFor="add-to-flow-select" required>
              <Select
                id="add-to-flow-select"
                data-testid="add-to-flow-select"
                value={selectedFlowId}
                options={[
                  { value: "", label: t("testdef.addToFlow.selectPlaceholder") },
                  ...flowOptions,
                ]}
                onChange={(e) => setSelectedFlowId(e.target.value)}
              />
            </FormField>
          )
        ) : (
          <FormField
            label={t("testdef.addToFlow.newNameLabel")}
            htmlFor="add-to-flow-new-name"
            hint={t("testdef.addToFlow.newNameHint")}
            required
          >
            <Input
              id="add-to-flow-new-name"
              data-testid="add-to-flow-new-name"
              value={newFlowName}
              maxLength={120}
              placeholder={t("testdef.addToFlow.newNamePlaceholder")}
              onChange={(e) => setNewFlowName(e.target.value)}
            />
          </FormField>
        )}

        {submitError && (
          <Alert tone="error" title={t("testdef.addToFlow.failed")}>
            {submitError}
          </Alert>
        )}
      </div>
    </Modal>
  )
}

export default AddToFlowModal
