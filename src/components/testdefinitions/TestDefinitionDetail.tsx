import React, { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Button, Card, ErrorState, cx, useToast } from "../primitives"
import { useLang, langLocale } from "../../lib/i18n"
import {
  apiApproveTestDefinitionVersion,
  apiArchiveTestDefinitionVersion,
  apiCreateTestDefinitionVersion,
  apiEditTestDefinitionDraft,
  apiExecuteTestDefinitionProving,
  apiExecuteTestDefinitionTrial,
  apiGetTestDefinition,
  apiGetTestDefinitionRun,
  apiGetTestDefinitionVersion,
  apiValidateTestDefinitionVersion,
  type TestDefinitionDetails,
  type TestDefinitionValidationReport,
  type TestDefinitionVersion,
} from "../../lib/api"
import {
  IdempotencyRegistry,
  availabilityOf,
  isContentEditable,
  lifecycleAvailability,
  mapTestDefinitionFailure,
  type LifecycleAction,
  type OperationIdentity,
} from "../../lib/testDefinitionLifecycle"
import {
  runViewFromDetails,
  runViewFromExecutionResponse,
  type DefinitionRunView,
} from "../../lib/testDefinitionRuns"
import { formatDefinitionSource, validateDefinitionSource } from "../../lib/testDefinitionSchema"
import { ConfirmDialog } from "./ConfirmDialog"
import { TestDefinitionRunPanel } from "./TestDefinitionRunPanel"
import {
  BackButton,
  FieldError,
  JsonEditor,
  LifecycleBadge,
  MetaRow,
  SectionHeading,
  ValidationFindings,
  formatTimestamp,
} from "./shared"

/** Which lifecycle step is currently on the wire; only one may be. */
type PendingAction = LifecycleAction | "save" | null

/** The sensitive steps that require an explicit confirmation. */
type ConfirmTarget = "approve" | "proving" | "archive" | "leave"

function parseStoredReport(json: string | null): TestDefinitionValidationReport | null {
  if (!json) return null
  try {
    const parsed = JSON.parse(json) as TestDefinitionValidationReport
    if (typeof parsed?.valid !== "boolean") return null
    return {
      valid: parsed.valid,
      errors: parsed.errors ?? [],
      warnings: parsed.warnings ?? [],
      schemaVersion: parsed.schemaVersion ?? null,
      validatorVersion: parsed.validatorVersion ?? null,
    }
  } catch {
    return null
  }
}

export function TestDefinitionDetail({
  clientId,
  clientName,
  definitionId,
  isAdmin,
  onBack,
  onUnauthorized,
  onChanged,
}: {
  clientId: number
  clientName: string
  definitionId: number
  isAdmin: boolean
  onBack: () => void
  onUnauthorized: () => void
  onChanged?: () => void
}) {
  const { t } = useLang()
  const toast = useToast()
  const locale = langLocale()

  const [definition, setDefinition] = useState<TestDefinitionDetails | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)

  const [selectedVersionId, setSelectedVersionId] = useState<number | null>(null)
  const [version, setVersion] = useState<TestDefinitionVersion | null>(null)
  const [versionError, setVersionError] = useState<string | null>(null)

  const [draft, setDraft] = useState("")
  const [draftError, setDraftError] = useState<string | null>(null)
  const [pending, setPending] = useState<PendingAction>(null)
  const [confirm, setConfirm] = useState<ConfirmTarget | null>(null)

  const [engineReport, setEngineReport] = useState<TestDefinitionValidationReport | null>(null)
  const [run, setRun] = useState<DefinitionRunView | null>(null)
  const [runRefreshing, setRunRefreshing] = useState(false)

  /* One registry per mounted detail view: keys live only as long as the view. */
  const idempotencyRef = useRef(new IdempotencyRegistry())
  const definitionRequestRef = useRef(0)
  const versionRequestRef = useRef(0)

  const dirty = version !== null && draft !== version.sourceJson

  /* ---- Loading ------------------------------------------------------ */

  const loadDefinition = useCallback(
    async (opts: { keepVersion?: boolean } = {}) => {
      const rid = ++definitionRequestRef.current
      if (!opts.keepVersion) setLoadError(null)
      try {
        const details = await apiGetTestDefinition(clientId, definitionId)
        if (rid !== definitionRequestRef.current) return
        setDefinition(details)
        setSelectedVersionId((current) => {
          if (opts.keepVersion && current != null && details.versions.some((v) => v.id === current)) {
            return current
          }
          // versions[] arrives newest-first from the engine.
          return details.versions[0]?.id ?? null
        })
      } catch (err) {
        if (rid !== definitionRequestRef.current) return
        const failure = mapTestDefinitionFailure(err)
        if (failure.kind === "unauthenticated") {
          onUnauthorized()
          return
        }
        setLoadError(failure.message)
      }
    },
    [clientId, definitionId, onUnauthorized],
  )

  useEffect(() => {
    void loadDefinition()
    return () => {
      definitionRequestRef.current++
    }
  }, [loadDefinition, reloadKey])

  /* The source document and the stored validation report live on the version
     route; `versions[]` in the aggregate deliberately omits both. */
  useEffect(() => {
    if (selectedVersionId == null) {
      setVersion(null)
      setDraft("")
      setEngineReport(null)
      return
    }
    const rid = ++versionRequestRef.current
    setVersionError(null)
    apiGetTestDefinitionVersion(clientId, definitionId, selectedVersionId)
      .then((loaded) => {
        if (rid !== versionRequestRef.current) return
        setVersion(loaded)
        setDraft(loaded.sourceJson)
        setDraftError(null)
        setEngineReport(parseStoredReport(loaded.validationReportJson))
      })
      .catch((err) => {
        if (rid !== versionRequestRef.current) return
        const failure = mapTestDefinitionFailure(err)
        if (failure.kind === "unauthenticated") {
          onUnauthorized()
          return
        }
        setVersionError(failure.message)
      })
    return () => {
      versionRequestRef.current++
    }
  }, [clientId, definitionId, selectedVersionId, onUnauthorized])

  /* A dirty draft is protected against a full page unload as well as in-app
     navigation; this is the only guard the dashboard has, so it is explicit. */
  useEffect(() => {
    if (!dirty) return
    function onBeforeUnload(event: BeforeUnloadEvent) {
      event.preventDefault()
      event.returnValue = ""
    }
    window.addEventListener("beforeunload", onBeforeUnload)
    return () => window.removeEventListener("beforeunload", onBeforeUnload)
  }, [dirty])

  const availability = useMemo(
    () =>
      lifecycleAvailability({
        status: version?.status ?? "DRAFT",
        definitionArchived: definition?.isArchived ?? false,
        flowId: definition?.flowId ?? null,
        isAdmin,
      }),
    [version?.status, definition?.isArchived, definition?.flowId, isAdmin],
  )

  const editable = version !== null && isContentEditable(version.status, definition?.isArchived ?? false)

  /* ---- Shared failure handling -------------------------------------- */

  /**
   * Applies one failed lifecycle call. A stale-state conflict reloads from the
   * server rather than guessing; the caller never advances the UI on its own.
   */
  const handleFailure = useCallback(
    (err: unknown, title: string): void => {
      const failure = mapTestDefinitionFailure(err)
      if (failure.kind === "unauthenticated") {
        onUnauthorized()
        return
      }
      toast({ title, description: failure.message, variant: "error" })
      if (failure.requiresReload) {
        toast({ title: t("testdef.reloadNeeded"), variant: "info" })
        void loadDefinition({ keepVersion: true })
        setReloadKey((k) => k + 1)
      }
    },
    [loadDefinition, onUnauthorized, t, toast],
  )

  /** Re-reads the aggregate and the selected version after any transition. */
  const refreshFromServer = useCallback(async () => {
    await loadDefinition({ keepVersion: true })
    if (selectedVersionId != null) {
      try {
        const reloaded = await apiGetTestDefinitionVersion(clientId, definitionId, selectedVersionId)
        setVersion(reloaded)
        setDraft(reloaded.sourceJson)
        const stored = parseStoredReport(reloaded.validationReportJson)
        // A draft edit clears the stored report; keep a report the engine just
        // returned rather than blanking the panel behind the user.
        if (stored) setEngineReport(stored)
      } catch {
        // The aggregate reload already reported anything fatal; a version that
        // vanished is covered by the version-level error state.
      }
    }
    onChanged?.()
  }, [clientId, definitionId, loadDefinition, onChanged, selectedVersionId])

  /* ---- Draft editing ------------------------------------------------- */

  async function handleSave() {
    if (!version || pending) return
    const local = validateDefinitionSource(draft)
    const syntaxFailure = local.errors.find((f) => f.ruleId.startsWith("FE-JSON"))
    if (syntaxFailure) {
      setDraftError(syntaxFailure.message)
      return
    }
    setDraftError(null)
    setPending("save")
    try {
      await apiEditTestDefinitionDraft(clientId, definitionId, version.id, {
        versionLock: version.versionLock,
        sourceJson: draft,
        schemaVersion: version.schemaVersion,
      })
      toast({
        title: t("testdef.detail.savedTitle"),
        description: t("testdef.detail.savedDesc"),
        variant: "success",
      })
      await refreshFromServer()
    } catch (err) {
      handleFailure(err, t("testdef.detail.saveFailedTitle"))
    } finally {
      setPending(null)
    }
  }

  function handleFormat() {
    const formatted = formatDefinitionSource(draft)
    if (formatted === null) {
      setDraftError(t("testdef.detail.jsonInvalid"))
      return
    }
    setDraft(formatted)
    setDraftError(null)
  }

  /* ---- Lifecycle transitions ---------------------------------------- */

  async function runSimpleAction(
    action: Extract<LifecycleAction, "validate" | "approve" | "archive" | "newVersion">,
  ) {
    if (!version || pending) return
    setPending(action)
    try {
      if (action === "validate") {
        const result = await apiValidateTestDefinitionVersion(clientId, definitionId, version.id)
        setEngineReport(result.validationReport)
        toast({
          title: result.valid ? t("testdef.validated.title") : t("testdef.validated.invalidTitle"),
          description: result.valid ? undefined : t("testdef.validated.invalidDesc"),
          variant: result.valid ? "success" : "warning",
        })
      } else if (action === "approve") {
        await apiApproveTestDefinitionVersion(clientId, definitionId, version.id)
        toast({ title: t("testdef.approved.title"), variant: "success" })
      } else if (action === "archive") {
        await apiArchiveTestDefinitionVersion(clientId, definitionId, version.id)
        toast({ title: t("testdef.archived.title"), variant: "success" })
      } else {
        const created = await apiCreateTestDefinitionVersion(clientId, definitionId, version.id)
        toast({
          title: t("testdef.newVersion.title"),
          description: t("testdef.newVersion.desc", { version: created.versionNumber }),
          variant: "success",
        })
        setRun(null)
        setSelectedVersionId(created.versionId)
      }
      await refreshFromServer()
    } catch (err) {
      handleFailure(err, t("testdef.actionFailed"))
    } finally {
      setPending(null)
      setConfirm(null)
    }
  }

  /**
   * Trial and Proving are the two idempotent operations.
   *
   * One gesture owns one key for its whole life: the registry refuses a second
   * dispatch while the first is in flight, keeps the key when the outcome is
   * unknown so a retry replays rather than re-runs, and drops it only once the
   * engine has answered definitively.
   */
  async function runExecution(purpose: "TRIAL" | "PROVING") {
    if (!version || pending) return
    const identity: OperationIdentity = { purpose, versionId: version.id }
    const key = idempotencyRef.current.acquire(identity)
    if (key === null) return

    setPending(purpose === "TRIAL" ? "trial" : "proving")
    setRun(null)
    try {
      const response = purpose === "TRIAL"
        ? await apiExecuteTestDefinitionTrial(clientId, definitionId, version.id, key)
        : await apiExecuteTestDefinitionProving(clientId, definitionId, version.id, key)

      idempotencyRef.current.settle(identity)
      setRun(runViewFromExecutionResponse(response))
      await refreshFromServer()
    } catch (err) {
      const failure = mapTestDefinitionFailure(err)
      if (failure.retrySameKey) {
        // The engine may or may not have applied it; the key is kept so the next
        // attempt is a replay of the same operation.
        idempotencyRef.current.holdForRetry(identity)
      } else {
        idempotencyRef.current.settle(identity)
      }
      handleFailure(err, t("testdef.actionFailed"))
    } finally {
      setPending(null)
      setConfirm(null)
    }
  }

  /** Re-reads the stored run so evidence metadata appears after an execution. */
  async function refreshRun() {
    if (!run || runRefreshing) return
    setRunRefreshing(true)
    try {
      const details = await apiGetTestDefinitionRun(clientId, definitionId, run.runId)
      setRun(runViewFromDetails(details))
    } catch (err) {
      handleFailure(err, t("testdef.run.loadFailed"))
    } finally {
      setRunRefreshing(false)
    }
  }

  function requestBack() {
    if (dirty) {
      setConfirm("leave")
      return
    }
    onBack()
  }

  /* ---- Render -------------------------------------------------------- */

  if (loadError && definition === null) {
    return (
      <div className="space-y-4">
        <BackButton label={t("testdef.back")} onClick={onBack} />
        <ErrorState
          title={t("testdef.detail.loadFailed")}
          description={loadError}
          onRetry={() => setReloadKey((k) => k + 1)}
        />
      </div>
    )
  }

  if (!definition) {
    return (
      <div className="space-y-4">
        <BackButton label={t("testdef.back")} onClick={onBack} />
        <Card className="flex items-center justify-center px-6 py-16">
          <p role="status" className="text-[13px] text-slate-400">
            {t("common.loading")}
          </p>
        </Card>
      </div>
    )
  }

  const versionLabel = version ? t("testdef.versionNumber", { number: version.versionNumber }) : "—"
  const busy = pending !== null

  function actionButton(
    action: LifecycleAction,
    label: string,
    busyLabel: string,
    variant: "primary" | "secondary" | "outline" | "danger",
    onPress: () => void,
  ) {
    const info = availabilityOf(availability, action)
    if (!info.visible) return null
    const isPending = pending === action
    return (
      <Button
        key={action}
        variant={variant}
        size="sm"
        data-action={action}
        disabled={!info.enabled || (busy && !isPending)}
        loading={isPending}
        title={info.reason ?? undefined}
        aria-describedby={info.reason ? `testdef-reason-${action}` : undefined}
        onClick={onPress}
      >
        {isPending ? busyLabel : label}
      </Button>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <BackButton label={t("testdef.back")} onClick={requestBack} />
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <h1 className="font-display text-2xl font-bold tracking-tight text-navy">{definition.name}</h1>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              {version && <LifecycleBadge status={version.status} />}
              <span className="text-[12px] text-slate-400">{versionLabel}</span>
              {dirty && (
                <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-700">
                  {t("testdef.detail.unsavedBadge")}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {definition.isArchived && (
        <div role="status" className="rounded-xl border border-slate-200 bg-slate-100 px-4 py-3 text-[13px] text-slate-600">
          {t("testdef.detail.archivedReadOnly")}
        </div>
      )}

      {/* Lifecycle actions. READY has no control by design: the engine reaches it
          only through a passing proving run. */}
      <Card className="p-4">
        <div className="flex flex-wrap items-center gap-2">
          {actionButton("validate", t("testdef.action.validate"), t("testdef.action.validating"), "secondary", () => void runSimpleAction("validate"))}
          {actionButton("trial", t("testdef.action.trial"), t("testdef.action.trialRunning"), "secondary", () => void runExecution("TRIAL"))}
          {actionButton("approve", t("testdef.action.approve"), t("testdef.action.approving"), "primary", () => setConfirm("approve"))}
          {actionButton("proving", t("testdef.action.proving"), t("testdef.action.provingRunning"), "primary", () => setConfirm("proving"))}
          {actionButton("archive", t("testdef.action.archive"), t("testdef.action.archiving"), "danger", () => setConfirm("archive"))}
          {actionButton("newVersion", t("testdef.action.newVersion"), t("testdef.action.newVersionWorking"), "outline", () => void runSimpleAction("newVersion"))}
        </div>
        {availability
          .filter((info) => info.visible && !info.enabled && info.reason)
          .map((info) => (
            <p key={info.action} id={`testdef-reason-${info.action}`} className="mt-2 text-[11px] text-slate-400">
              {t(`testdef.action.${info.action}`)}: {info.reason}
            </p>
          ))}
        <p className="mt-2 text-[11px] text-slate-400">{t("testdef.readyHint")}</p>
      </Card>

      <div className="grid gap-4 lg:grid-cols-3">
        {/* Metadata */}
        <Card className="p-5">
          <SectionHeading>{t("testdef.detail.metadata")}</SectionHeading>
          <div className="divide-y divide-slate-200">
            <MetaRow label={t("testdef.th.client")}>{clientName || `#${definition.clientId}`}</MetaRow>
            <MetaRow label={t("testdef.th.flow")}>
              <span className="font-mono text-[12px]" dir="ltr">
                {definition.flowId == null
                  ? t("testdef.noFlow")
                  : t("testdef.flowNumber", { id: definition.flowId })}
              </span>
            </MetaRow>
            <MetaRow label={t("testdef.th.implementation")}>
              {t("testdef.implementation.testDefinition")}
            </MetaRow>
            <MetaRow label={t("testdef.detail.created")}>
              {formatTimestamp(definition.createdAt, locale)}
            </MetaRow>
            <MetaRow label={t("testdef.th.updated")}>
              {formatTimestamp(definition.updatedAt, locale)}
            </MetaRow>
            <MetaRow label={t("testdef.detail.provingRun")}>
              {version?.provingRunId == null ? (
                t("testdef.detail.provingRunNone")
              ) : (
                <span className="font-mono text-[12px]" dir="ltr">
                  #{version.provingRunId}
                </span>
              )}
            </MetaRow>
          </div>
          {definition.description && (
            <p className="mt-3 border-t border-slate-200 pt-3 text-[13px] text-slate-600">
              {definition.description}
            </p>
          )}
        </Card>

        {/* Version history */}
        <Card className="p-5 lg:col-span-2">
          <SectionHeading>{t("testdef.detail.versions")}</SectionHeading>
          {definition.versions.length === 0 ? (
            <p className="text-[13px] text-slate-500">{t("testdef.noVersions")}</p>
          ) : (
            <ul className="divide-y divide-slate-200">
              {definition.versions.map((entry) => {
                const active = entry.id === selectedVersionId
                return (
                  <li key={entry.id}>
                    <button
                      type="button"
                      aria-current={active ? "true" : undefined}
                      onClick={() => {
                        if (dirty && !active) {
                          setConfirm("leave")
                          return
                        }
                        setRun(null)
                        setSelectedVersionId(entry.id)
                      }}
                      className={cx(
                        "flex w-full flex-wrap items-center justify-between gap-3 px-2 py-2.5 text-start transition-colors",
                        active ? "bg-brand-50" : "hover:bg-slate-50",
                      )}
                    >
                      <span className="flex items-center gap-2.5">
                        <span className="font-mono text-[12px] text-slate-500" dir="ltr">
                          {t("testdef.versionNumber", { number: entry.versionNumber })}
                        </span>
                        <LifecycleBadge status={entry.status} />
                      </span>
                      <span className="flex items-center gap-4 text-[11px] text-slate-400">
                        <span>
                          {t("testdef.detail.versionLock")} {entry.versionLock}
                        </span>
                        <span>{formatTimestamp(entry.updatedAt ?? entry.createdAt, locale)}</span>
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </Card>
      </div>

      {/* Source */}
      {versionError ? (
        <ErrorState title={t("testdef.detail.versionLoadFailed")} description={versionError} />
      ) : version === null ? (
        <Card className="flex items-center justify-center px-6 py-12">
          <p role="status" className="text-[13px] text-slate-400">
            {t("common.loading")}
          </p>
        </Card>
      ) : (
        <Card className="p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <SectionHeading>{t("testdef.detail.source")}</SectionHeading>
            {editable && (
              <div className="flex items-center gap-2 pb-3">
                <Button variant="ghost" size="sm" onClick={handleFormat}>
                  {t("testdef.create.format")}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={!dirty || busy}
                  onClick={() => {
                    setDraft(version.sourceJson)
                    setDraftError(null)
                  }}
                >
                  {t("testdef.detail.revert")}
                </Button>
                <Button
                  variant="primary"
                  size="sm"
                  disabled={!dirty || (busy && pending !== "save")}
                  loading={pending === "save"}
                  onClick={() => void handleSave()}
                >
                  {pending === "save" ? t("testdef.detail.saving") : t("testdef.detail.save")}
                </Button>
              </div>
            )}
          </div>
          <label htmlFor="testdef-source-editor" className="sr-only">
            {t("testdef.detail.source")}
          </label>
          <JsonEditor
            id="testdef-source-editor"
            rows={18}
            value={draft}
            readOnly={!editable}
            disabled={!editable}
            error={Boolean(draftError)}
            aria-describedby={draftError ? "testdef-draft-error" : editable ? undefined : "testdef-readonly-hint"}
            onChange={(e) => {
              setDraft(e.target.value)
              setDraftError(null)
            }}
          />
          {draftError ? (
            <div className="mt-1.5">
              <FieldError id="testdef-draft-error">{draftError}</FieldError>
            </div>
          ) : (
            !editable && (
              <p id="testdef-readonly-hint" className="mt-1.5 text-[11px] text-slate-400">
                {definition.isArchived ? t("testdef.detail.archivedReadOnly") : t("testdef.detail.readOnly")}
              </p>
            )
          )}
        </Card>
      )}

      {/* Validation: the local pre-check while editing, and the engine's report. */}
      {editable && dirty && (() => {
        const local = validateDefinitionSource(draft)
        return (
          <ValidationFindings
            title={t("testdef.validation.localTitle")}
            hint={t("testdef.validation.localHint")}
            valid={local.valid}
            errors={local.errors}
            warnings={local.warnings}
          />
        )
      })()}

      <ValidationFindings
        title={t("testdef.validation.engineTitle")}
        valid={engineReport?.valid ?? false}
        errors={engineReport?.errors ?? []}
        warnings={engineReport?.warnings ?? []}
        emptyLabel={engineReport ? t("testdef.validation.passed") : t("testdef.validation.notRunYet")}
      />

      <TestDefinitionRunPanel
        clientId={clientId}
        definitionId={definitionId}
        run={run}
        running={pending === "trial" || pending === "proving"}
        onRefresh={run ? () => void refreshRun() : undefined}
        refreshing={runRefreshing}
      />

      {/* Confirmations for the sensitive steps and for discarding a dirty draft. */}
      <ConfirmDialog
        open={confirm === "approve"}
        title={t("testdef.confirm.approveTitle")}
        description={t("testdef.confirm.approveDesc", {
          name: definition.name,
          version: version?.versionNumber ?? "",
        })}
        confirmLabel={t("testdef.action.approve")}
        busyLabel={t("testdef.action.approving")}
        busy={pending === "approve"}
        onConfirm={() => void runSimpleAction("approve")}
        onCancel={() => setConfirm(null)}
      />

      <ConfirmDialog
        open={confirm === "proving"}
        title={t("testdef.confirm.provingTitle")}
        description={t("testdef.confirm.provingDesc", {
          name: definition.name,
          version: version?.versionNumber ?? "",
        })}
        confirmLabel={t("testdef.action.proving")}
        busyLabel={t("testdef.action.provingRunning")}
        busy={pending === "proving"}
        onConfirm={() => void runExecution("PROVING")}
        onCancel={() => setConfirm(null)}
      />

      <ConfirmDialog
        open={confirm === "archive"}
        tone="danger"
        title={t("testdef.confirm.archiveTitle")}
        description={t("testdef.confirm.archiveDesc", { name: definition.name })}
        confirmLabel={t("testdef.action.archive")}
        busyLabel={t("testdef.action.archiving")}
        busy={pending === "archive"}
        onConfirm={() => void runSimpleAction("archive")}
        onCancel={() => setConfirm(null)}
      />

      <ConfirmDialog
        open={confirm === "leave"}
        tone="danger"
        title={t("testdef.detail.unsavedTitle")}
        description={t("testdef.detail.unsavedDesc")}
        confirmLabel={t("testdef.detail.unsavedConfirm")}
        cancelLabel={t("testdef.detail.unsavedStay")}
        onConfirm={() => {
          setConfirm(null)
          if (version) setDraft(version.sourceJson)
          onBack()
        }}
        onCancel={() => setConfirm(null)}
      />
    </div>
  )
}

export default TestDefinitionDetail
