import React, { useEffect, useRef, useState } from "react"
import { Button, Card, cx } from "../primitives"
import { useLang } from "../../lib/i18n"
import {
  Composer,
  Suggestions,
  buildingStages,
} from "./AiComposer"
import {
  IconEngineer,
  IconFork,
  IconLock,
  IconChevronDown,
  IconRecord,
  IconSparkle,
  IconUpload,
} from "./AiIcons"
import {
  ApiError,
  PLANNER_CLIENT_TIMEOUT_MS,
  apiClientDetails,
  apiConfirmTestPlan,
  apiCreateTestPlan,
  apiListCredentials,
  type CredentialView,
} from "../../lib/api"
import {
  COMPOSER_TO_WIRE,
  CONFIRM_ERROR_MESSAGES,
  PLAN_ERROR_MESSAGES,
  attachOutcomesToSteps,
  isPlanClarification,
  isPlanReady,
  normalizePlanEvidence,
  newConfirmKey,
  type ComposerTestType,
  type PlanClarificationQuestion,
  type PlanFailureCategory,
  type PlanOutcome,
  type TestPlan,
} from "../../lib/planner"
import {
  BuildingView,
  ClarificationView,
  PlannerErrorView,
  PreflightUrlView,
  ProposedView,
  ReviewView,
  SuccessView,
  type EditableStep,
} from "./AiPlanViews"

/* ------------------------------------------------------------------ */
/* AI Test Builder page: idle → building → proposed → review →          */
/* confirming → success, plus clarification / failed / auth branches.   */
/* Single synchronous POST per step; AbortController cancels only the   */
/* client fetch; 60 s client timeout maps to the timeout message.       */
/* State persists across phases in this component (no unmount).         */
/* ------------------------------------------------------------------ */

type Phase =
  | "idle"
  | "preflight-url"
  | "auth-required"
  | "building"
  | "proposed"
  | "review"
  | "confirming"
  | "success"
  | "clarification"
  | "failed"
  | "duplicate"

type Failure = { title: string; description?: string }

let stepKeySeq = 0
export function toEditable(
  steps: {
    type: "UI" | "API"
    intent: string
    requiresDiscovery: boolean
    endpoint?: { method: string; path: string }
  }[],
  outcomes: PlanOutcome[] | null | undefined,
): EditableStep[] {
  // Attach each expected result to its step (index-aligned planner output):
  // later edits that move/delete steps then carry or prune the outcome with
  // them, so no orphaned expected result can remain (F-7).
  return attachOutcomesToSteps(
    steps.map((s) => ({
      type: s.type,
      intent: s.intent,
      requiresDiscovery: s.requiresDiscovery,
      endpoint: s.endpoint,
      key: `s${++stepKeySeq}`,
    })),
    outcomes,
  )
}

export function AiBuilderPage({
  clientId,
  onOpenDefinition,
  onViewDrafts,
  onViewRequests,
  onUnauthorized,
  onOpenSettingsCredentials = () => {},
  onOpenManualEditor,
  onOpenManualRequest,
}: {
  /** Opens the hidden-by-default manual capability picker. */
  onOpenManualEditor?: (journey: "UI" | "API") => void
  /** Opens the legitimate Ask an Engineer/manual request flow. */
  onOpenManualRequest?: () => void
  clientId: number
  onOpenDefinition: (definitionId: number) => void
  onViewDrafts: () => void
  onViewRequests: () => void
  onUnauthorized: () => void
  /** "Set up in Settings" CTA from the credential selector (PR10C.5 Phase 2). */
  onOpenSettingsCredentials?: () => void
}) {
  const { t } = useLang()
  const [phase, setPhase] = useState<Phase>("idle")
  const [composerType, setComposerType] = useState<ComposerTestType>("UI")
  const [intent, setIntent] = useState("")
  // PR10C.5 Phase 2: the REAL selected credential id (client_credentials.id),
  // replacing the pre-018 `credentialId = clientId` alias.
  const [selectedCredentialId, setSelectedCredentialId] = useState<number | null>(null)
  const [credentials, setCredentials] = useState<CredentialView[]>([])
  const [credentialsLoaded, setCredentialsLoaded] = useState(false)
  const [origin, setOrigin] = useState<string | null | undefined>(undefined)
  const [stage, setStage] = useState(0)
  const [plan, setPlan] = useState<TestPlan | null>(null)
  const [steps, setSteps] = useState<EditableStep[]>([])
  const [planTitle, setPlanTitle] = useState("")
  const [clarification, setClarification] = useState<{
    questions: (PlanClarificationQuestion & { answer: string })[]
  } | null>(null)
  const [failure, setFailure] = useState<Failure | null>(null)
  const [success, setSuccess] = useState<{
    definitionId: number
    title: string
    stepCount: number
  } | null>(null)
  const [busy, setBusy] = useState(false)
  const [advancedOpen, setAdvancedOpen] = useState(false)
  const [evidenceOpen, setEvidenceOpen] = useState(false)

  const abortRef = useRef<AbortController | null>(null)
  const timersRef = useRef<number[]>([])
  const confirmKeyRef = useRef<string | null>(null)
  const cancelReasonRef = useRef<"user" | "timeout" | null>(null)

  function clearTimers() {
    for (const id of timersRef.current) window.clearTimeout(id)
    timersRef.current = []
  }

  useEffect(() => {
    let cancelled = false
    apiClientDetails(clientId)
      .then((details) => {
        if (cancelled) return
        setOrigin(details.client.base_url ?? null)
      })
      .catch((error) => {
        if (cancelled) return
        if (error instanceof ApiError && error.status === 401) {
          onUnauthorized()
          return
        }
        setOrigin(null)
      })
    // PR10C.5 Phase 2: real multi-credential list feeds the composer's
    // selector; a failed fetch degrades to an empty list (the "No
    // credentials configured" state), never a blocked composer.
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

  useEffect(() => {
    abortRef.current?.abort()
    clearTimers()
    return () => {
      abortRef.current?.abort()
      clearTimers()
    }
  }, [])

  function fail(title: string, description?: string) {
    setFailure({ title, description })
    setPhase("failed")
    setBusy(false)
  }

  function startBuild(nextIntent: string) {
    if (busy) return
    abortRef.current?.abort()
    clearTimers()
    // No target origin configured → preflight state for every test type.
    // Backend Check and End-to-End need the client's base_url too: it is
    // where backend discovery probes the API spec (PR10D.5 D-7).
    if (origin === null) {
      setPhase("preflight-url")
      return
    }
    // A selected-but-unconfigured credential can never succeed — surface the
    // auth state instead of spending a plan call.
    const selectedCredential =
      credentials.find((c) => c.id === selectedCredentialId) ?? null
    if (selectedCredential != null && selectedCredential.status !== "CONFIGURED") {
      setPhase("auth-required")
      return
    }
    runPlan(nextIntent)
  }

  function runPlan(nextIntent: string) {
    const controller = new AbortController()
    abortRef.current = controller
    cancelReasonRef.current = null
    setPhase("building")
    setStage(0)
    setBusy(true)

    const stages = buildingStages(t)
    const stepper = window.setInterval(() => {
      setStage((s) => Math.min(s + 1, stages.length - 1))
    }, 1200)
    const timeoutId = window.setTimeout(() => {
      cancelReasonRef.current = "timeout"
      controller.abort()
    }, PLANNER_CLIENT_TIMEOUT_MS)
    timersRef.current.push(stepper, timeoutId)

    // PR10C.5 Phase 2: send the REAL credential id (client_credentials.id);
    // the backend's dual-id transition accepts it natively.
    const credentialId = selectedCredentialId
    apiCreateTestPlan(
      clientId,
      {
        intent: nextIntent.trim(),
        requestedType: COMPOSER_TO_WIRE[composerType],
        ...(credentialId != null ? { credentialId } : {}),
      },
      controller.signal,
    ).then(
      (raw) => {
        window.clearInterval(stepper)
        window.clearTimeout(timeoutId)
        setBusy(false)
        if (isPlanReady(raw)) {
          const ready = raw as TestPlan
          if (
            !Array.isArray(ready.steps) ||
            typeof ready.planId !== "string" ||
            typeof ready.title !== "string"
          ) {
            fail(PLAN_ERROR_MESSAGES.AI_INVALID_OUTPUT)
            return
          }
          const normalizedEvidence = normalizePlanEvidence(
            (raw as { evidence?: unknown }).evidence,
          )
          const normalizedPlan = normalizedEvidence
            ? { ...ready, evidence: normalizedEvidence }
            : ready
          setPlan(normalizedPlan)
          setEvidenceOpen(false)
          setSteps(toEditable(normalizedPlan.steps, normalizedPlan.expectedOutcomes))
          setPlanTitle(ready.title)
          setClarification(null)
          setPhase("proposed")
        } else if (isPlanClarification(raw)) {
          const body = raw as {
            questions?: unknown
            requestedType?: unknown
          }
          const list = Array.isArray(body.questions) ? body.questions : []
          setClarification({
            questions: list.map((q) =>
              typeof q === "string"
                ? { question: q, category: null, answer: "" }
                : {
                    question: String(
                      (q as { question?: unknown }).question ?? "",
                    ),
                    category:
                      typeof (q as { category?: unknown }).category ===
                      "string"
                        ? ((q as { category?: string }).category as string)
                        : null,
                    answer: "",
                  },
            ),
          })
          setPhase("clarification")
        } else {
          const failed = raw as {
            errorCategory?: unknown
            message?: unknown
          }
          const category = (
            typeof failed.errorCategory === "string"
              ? failed.errorCategory
              : "AI_UNAVAILABLE"
          ) as PlanFailureCategory
          fail(
            PLAN_ERROR_MESSAGES[category] ??
              PLAN_ERROR_MESSAGES.AI_UNAVAILABLE,
            typeof failed.message === "string" && failed.message
              ? failed.message
              : undefined,
          )
        }
      },
      (error: unknown) => {
        window.clearInterval(stepper)
        window.clearTimeout(timeoutId)
        setBusy(false)
        if (error instanceof ApiError && error.status === 401) {
          onUnauthorized()
          return
        }
        // F-01: the backend delivers plan FAILED over HTTP error statuses
        // (503 for every category except the clarification-shaped
        // INTENT_AMBIGUOUS and CREDENTIAL_REQUIRED, which answer 200 and
        // are handled in the success path above). Map those bodies exactly
        // like the HTTP-200 FAILED shape instead of collapsing to
        // AI_UNAVAILABLE.
        if (error instanceof ApiError && error.body != null) {
          const body = error.body as {
            status?: unknown
            errorCategory?: unknown
            message?: unknown
          }
          if (
            body.status === "FAILED" &&
            typeof body.errorCategory === "string" &&
            Object.prototype.hasOwnProperty.call(
              PLAN_ERROR_MESSAGES,
              body.errorCategory,
            )
          ) {
            fail(
              PLAN_ERROR_MESSAGES[
                body.errorCategory as PlanFailureCategory
              ],
              typeof body.message === "string" && body.message
                ? body.message
                : undefined,
            )
            return
          }
        }
        if (
          controller.signal.aborted ||
          (error instanceof ApiError && error.status === 0)
        ) {
          fail(
            cancelReasonRef.current === "user"
              ? PLAN_ERROR_MESSAGES.AI_UNAVAILABLE
              : PLAN_ERROR_MESSAGES.AI_TIMEOUT,
          )
          if (cancelReasonRef.current === "user") setPhase("idle")
          return
        }
        fail(PLAN_ERROR_MESSAGES.AI_UNAVAILABLE)
      },
    )
  }

  function cancelBuild() {
    cancelReasonRef.current = "user"
    abortRef.current?.abort()
    clearTimers()
    setBusy(false)
    setPhase("idle")
  }

  function resetAll() {
    abortRef.current?.abort()
    clearTimers()
    confirmKeyRef.current = null
    setPhase("idle")
    setIntent("")
    setSelectedCredentialId(null)
    setComposerType("UI")
    setPlan(null)
    setSteps([])
    setPlanTitle("")
    setClarification(null)
    setFailure(null)
    setSuccess(null)
    setBusy(false)
  }

  function reviseWith(text: string) {
    const combined = `${intent.trim()}\nAdditional detail: ${text}`.slice(
      0,
      4000,
    )
    setIntent(combined)
    runPlan(combined)
  }

  function continueWithAnswers(
    answers: { question: string; answer: string }[],
  ) {
    const detail = answers
      .filter((a) => a.answer.trim())
      .map((a) => `${a.question} ${a.answer.trim()}`)
      .join("\n")
    const combined = detail
      ? `${intent.trim()}\n${detail}`.slice(0, 4000)
      : intent
    setIntent(combined)
    setClarification(null)
    runPlan(combined)
  }

  function confirmDraft() {
    if (!plan || busy) return
    setConfirmError(null)
    setPhase("confirming")
    setBusy(true)
    if (!confirmKeyRef.current) confirmKeyRef.current = newConfirmKey()
    const key = confirmKeyRef.current
    const controller = new AbortController()
    abortRef.current = controller
    const timeoutId = window.setTimeout(() => controller.abort(), 60_000)
    timersRef.current.push(timeoutId)

    apiConfirmTestPlan(
      clientId,
      plan.planId,
      key,
      {
        name: planTitle.trim().slice(0, 120) || plan.title,
        description: plan.description ?? null,
        modifiedSteps: steps.map((s) => ({
          type: s.type,
          intent: s.intent,
          endpoint: s.endpoint,
        })),
        modifiedOutcomes: steps
          .map((s) => s.outcome)
          .filter((o): o is NonNullable<typeof o> => o != null),
      },
      controller.signal,
    ).then(
      (result) => {
        window.clearTimeout(timeoutId)
        setBusy(false)
        setSuccess({
          definitionId: result.definitionId,
          title: planTitle.trim() || plan.title,
          stepCount: steps.length,
        })
        setPhase("success")
      },
      (error: unknown) => {
        window.clearTimeout(timeoutId)
        setBusy(false)
        if (error instanceof ApiError && error.status === 401) {
          onUnauthorized()
          return
        }
        if (error instanceof ApiError && error.status === 404) {
          fail(CONFIRM_ERROR_MESSAGES.PLAN_EXPIRED)
          return
        }
        if (error instanceof ApiError && error.status === 409) {
          confirmKeyRef.current = null
          setPhase("duplicate")
          return
        }
        if (
          error instanceof ApiError &&
          error.status === 400 &&
          typeof error.message === "string" &&
          error.message.includes("changed this End-to-End plan into a")
        ) {
          fail(
            error.message.includes("Deleting the API steps")
              ? CONFIRM_ERROR_MESSAGES.COMPOSITION_UI_ONLY
              : CONFIRM_ERROR_MESSAGES.COMPOSITION_CHANGED,
          )
          return
        }
        if (
          (error instanceof ApiError && error.status === 0) ||
          controller.signal.aborted
        ) {
          // Transport failure, outcome unknown: stay in review so the same
          // logical confirm can be retried with its retained key.
          setBusy(false)
          setConfirmError(t("pr10c.confirm.networkError"))
          setPhase("review")
          return
        }
        fail(CONFIRM_ERROR_MESSAGES.MISSING_IDEMPOTENCY_KEY)
      },
    )
  }

  // Network-uncertain retry of the same logical confirm: the retained
  // Idempotency-Key makes a replayed request return the original draft.
  const [confirmError, setConfirmError] = useState<string | null>(null)

  function retryConfirm() {
    setConfirmError(null)
    setPhase("review")
    window.setTimeout(() => confirmDraft(), 0)
  }

  function backToProposed() {
    // Leaving review abandons this confirm attempt: the next confirm is a
    // new logical submission with a fresh key.
    confirmKeyRef.current = null
    setConfirmError(null)
    setPhase("proposed")
  }

  const stages = buildingStages(t)
  const subtitle =
    phase === "building"
      ? t("pr10c.page.subtitleBuilding")
      : phase === "proposed" || phase === "review"
        ? t("pr10c.page.subtitleReview")
        : t("pr10c.page.subtitle")

  return (
    <div className="min-h-full">
      <div className="relative mb-8">
        <div className="pointer-events-none absolute -inset-x-16 -top-10 h-72 bg-[radial-gradient(ellipse_60%_40%_at_50%_0%,rgba(37,99,235,0.05)_0%,transparent_100%)] dark:bg-[radial-gradient(ellipse_60%_40%_at_50%_0%,rgba(59,130,246,0.09)_0%,transparent_100%)]" />
        <div className="pointer-events-none absolute -right-32 -top-20 hidden h-96 w-96 bg-[radial-gradient(ellipse_at_center,rgba(20,184,166,0.04)_0%,transparent_70%)] dark:block dark:opacity-100" />
        <div className="pointer-events-none absolute -right-6 -top-4 hidden opacity-[0.12] dark:opacity-[0.07] sm:block">
          <IconSparkle className="h-32 w-32 text-brand-400" />
        </div>
        <div className="relative">
          <div className="mb-1.5 flex items-center gap-1.5">
            <IconSparkle className="h-3.5 w-3.5 text-brand-400" />
            <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-brand-400">
              {t("pr10c.page.eyebrow")}
            </span>
          </div>
          <h1 className="text-[32px] font-bold leading-[1.1] text-slate-900 dark:text-white">
            {t("pr10c.page.title")}
          </h1>
          <p className="mt-2 max-w-lg text-[16px] leading-relaxed text-slate-500 dark:text-white/40">
            {subtitle}
          </p>
        </div>
      </div>

      {phase === "idle" && (
        <div className="mx-auto max-w-[880px]">
          <div className="relative">
            <div className="pointer-events-none absolute -left-20 -top-10 hidden h-80 w-80 rounded-full bg-blue-600/[0.07] blur-3xl dark:block" />
            <div className="pointer-events-none absolute -right-12 top-4 hidden h-60 w-60 rounded-full bg-blue-500/[0.05] blur-3xl dark:block" />
            <div className="pointer-events-none absolute -bottom-8 left-1/2 hidden h-48 w-96 -translate-x-1/2 rounded-full bg-teal-500/[0.03] blur-3xl dark:block" />
            <div className="relative">
              <Composer
                testType={composerType}
                setTestType={setComposerType}
                intent={intent}
                setIntent={setIntent}
                credentials={credentials}
                credentialsLoading={!credentialsLoaded}
                selectedCredentialId={selectedCredentialId}
                onSelectCredential={setSelectedCredentialId}
                onManageCredentials={() => {
                  onOpenSettingsCredentials()
                }}
                onBuild={() => startBuild(intent)}
                building={busy}
              />
              <div className="mt-10">
                <Suggestions
                  testType={composerType}
                  onSelect={(text) => setIntent(text)}
                />
              </div>
              <p className="mt-5 flex items-center gap-1.5 text-[12px] text-slate-400/80 dark:text-white/20">
                <IconLock className="h-3.5 w-3.5 shrink-0 opacity-70" />
                {t("pr10c.page.secureNotice")}
              </p>
            </div>
          </div>

          <div className="mt-12 flex items-center gap-4">
            <div className="h-px flex-1 bg-gradient-to-r from-transparent via-slate-200 to-transparent dark:via-white/[0.07]" />
            <span className="text-[12px] font-medium tracking-[0.02em] text-slate-400/80 dark:text-white/25">
              {t("pr10c.page.otherWays")}
            </span>
            <div className="h-px flex-1 bg-gradient-to-l from-transparent via-slate-200 to-transparent dark:via-white/[0.07]" />
          </div>

          <div className="mb-6 mt-6 grid gap-3 sm:grid-cols-2">
            <OtherWayCard
              icon={<IconRecord className="h-5 w-5" />}
              title={t("pr10c.other.recordTitle")}
              description={t("pr10c.other.recordDescription")}
              cta={t("pr10c.other.recordCta")}
              comingSoon
            />
            <OtherWayCard
              icon={<IconUpload className="h-5 w-5" />}
              title={t("pr10c.other.importTitle")}
              description={t("pr10c.other.importDescription")}
              cta={t("pr10c.other.importCta")}
              comingSoon
            />
            <OtherWayCard
              icon={<IconEngineer className="h-5 w-5" />}
              title={t("pr10c.other.engineerTitle")}
              description={t("pr10c.other.engineerDescription")}
              cta={t("pr10c.other.engineerCta")}
              onClick={onOpenManualRequest ?? onViewRequests}
            />
            <OtherWayCard
              icon={<IconFork className="h-5 w-5" />}
              title={t("pr10c.other.existingTitle")}
              description={t("pr10c.other.existingDescription")}
              cta={t("pr10c.other.existingCta")}
              onClick={onViewDrafts}
            />
          </div>

          {onOpenManualEditor && (
            <Card className="mb-10 overflow-hidden p-0">
              <button
                type="button"
                aria-expanded={advancedOpen}
                onClick={() => setAdvancedOpen((open) => !open)}
                className="flex w-full items-center justify-between gap-3 px-4 py-3 text-start text-[13px] font-semibold text-navy transition-colors hover:bg-slate-50 dark:hover:bg-white/[0.04]"
              >
                <span>{t("pr10c.advanced.title")}</span>
                <IconChevronDown
                  className={cx(
                    "size-4 text-slate-400 transition-transform dark:text-white/35",
                    advancedOpen && "rotate-180",
                  )}
                />
              </button>
              {advancedOpen && (
                <div className="grid gap-2 border-t border-slate-100 p-3 dark:border-white/[0.07] sm:grid-cols-2">
                  <button
                    type="button"
                    onClick={() => onOpenManualEditor("UI")}
                    className="rounded-lg border border-slate-200 px-3 py-2.5 text-start text-[13px] font-medium text-slate-600 transition-colors hover:border-brand-300 hover:bg-brand-50 hover:text-brand-400 dark:border-white/[0.08] dark:text-white/60 dark:hover:border-white/20 dark:hover:bg-white/[0.04]"
                  >
                    {t("pr10c.advanced.manualJourney")}
                  </button>
                  <button
                    type="button"
                    onClick={() => onOpenManualEditor("API")}
                    className="rounded-lg border border-slate-200 px-3 py-2.5 text-start text-[13px] font-medium text-slate-600 transition-colors hover:border-brand-300 hover:bg-brand-50 hover:text-brand-400 dark:border-white/[0.08] dark:text-white/60 dark:hover:border-white/20 dark:hover:bg-white/[0.04]"
                  >
                    {t("pr10c.advanced.manualBackend")}
                  </button>
                </div>
              )}
            </Card>
          )}
        </div>
      )}

      {phase === "preflight-url" && (
        <div className="mx-auto max-w-[880px]">
          <div
            className={cx(
              "overflow-hidden rounded-[20px]",
              "border border-amber-200/60 bg-white/90 backdrop-blur-sm [box-shadow:var(--shadow-elevated)]",
              "dark:border-amber-500/15 dark:bg-slate-950/70 dark:backdrop-blur-xl",
            )}
          >
            <PreflightUrlView onBack={() => setPhase("idle")} />
          </div>
        </div>
      )}

      {phase === "auth-required" && (
        <div className="mx-auto max-w-[880px]">
          <div
            className={cx(
              "overflow-hidden rounded-[20px]",
              "border border-brand-200/60 bg-white/90 backdrop-blur-sm [box-shadow:var(--shadow-composer)]",
              "dark:border-white/[0.08] dark:bg-slate-950/70 dark:backdrop-blur-xl",
            )}
          >
            <AuthRequiredView
              onBack={() => setPhase("idle")}
              onContinueWithout={() => {
                setSelectedCredentialId(null)
                runPlan(intent)
              }}
            />
          </div>
        </div>
      )}

      {phase === "building" && (
        <div className="mx-auto max-w-[880px]">
          <div
            className={cx(
              "relative overflow-hidden rounded-[20px]",
              "border border-brand-200/60 bg-white/90 backdrop-blur-sm [box-shadow:var(--shadow-composer)]",
              "dark:border-white/[0.08] dark:bg-slate-950/70 dark:backdrop-blur-xl",
            )}
          >
            <div className="pointer-events-none absolute -left-16 -top-8 hidden h-64 w-64 rounded-full bg-brand-700/10 blur-3xl dark:block" />
            <div className="pointer-events-none absolute -right-8 top-4 hidden h-48 w-48 rounded-full bg-brand-600/8 blur-3xl dark:block" />
            <div className="relative">
              <BuildingView
                testType={composerType}
                stages={stages}
                currentStage={stage}
                onCancel={cancelBuild}
              />
            </div>
          </div>
        </div>
      )}

      {phase === "proposed" && plan && (
        <div className="mx-auto max-w-[880px]">
          <ProposedView
            testType={composerType}
            title={planTitle}
            onTitleChange={setPlanTitle}
            intent={intent}
            credentialName={
              plan.credentialReference ? plan.credentialReference.name : null
            }
            steps={steps}
            warnings={plan.warnings}
            evidence={plan.evidence}
            evidenceOpen={evidenceOpen}
            onOpenEvidence={() => setEvidenceOpen(true)}
            onCloseEvidence={() => setEvidenceOpen(false)}
            onStepsChange={setSteps}
            onAddStep={() =>
              setSteps((prev) => [
                ...prev,
                {
                  key: `s${++stepKeySeq}`,
                  type: composerType === "API" ? "API" : "UI",
                  intent: "",
                  requiresDiscovery: false,
                },
              ])
            }
            onReview={() => {
              confirmKeyRef.current = null
              setPhase("review")
            }}
            onBack={() => setPhase("idle")}
            onRevise={reviseWith}
            revising={busy}
          />
        </div>
      )}

      {phase === "review" && plan && (
        <div className="mx-auto max-w-2xl">
          <ReviewView
            testType={composerType}
            title={planTitle.trim() || plan.title}
            intent={intent}
            origin={origin ?? null}
            credentialName={
              plan.credentialReference ? plan.credentialReference.name : null
            }
            steps={steps}
            evidence={plan.evidence}
            evidenceOpen={evidenceOpen}
            onOpenEvidence={() => setEvidenceOpen(true)}
            onCloseEvidence={() => setEvidenceOpen(false)}
            onCreate={confirmDraft}
            onBack={backToProposed}
            confirmError={confirmError}
            onRetryConfirm={retryConfirm}
            onDismissConfirmError={() => setConfirmError(null)}
          />
        </div>
      )}

      {phase === "confirming" && (
        <div className="mx-auto max-w-2xl">
          <ConfirmingView />
        </div>
      )}

      {phase === "success" && success && (
        <div className="mx-auto max-w-2xl">
          <SuccessView
            testType={composerType}
            title={success.title}
            stepCount={success.stepCount}
            onOpenDefinition={() => onOpenDefinition(success.definitionId)}
            onViewDrafts={onViewDrafts}
            onCreateAnother={resetAll}
          />
        </div>
      )}

      {phase === "clarification" && clarification && (
        <div className="mx-auto max-w-[880px]">
          <div
            className={cx(
              "overflow-hidden rounded-[20px]",
              "border border-brand-200/60 bg-white/90 backdrop-blur-sm [box-shadow:var(--shadow-composer)]",
              "dark:border-white/[0.08] dark:bg-slate-950/70 dark:backdrop-blur-xl",
            )}
          >
            <ClarificationView
              questions={clarification.questions}
              onContinue={continueWithAnswers}
              onCancel={() => {
                setClarification(null)
                setPhase("idle")
              }}
              answering={busy}
            />
          </div>
        </div>
      )}

      {phase === "failed" && failure && (
        <div className="mx-auto max-w-[880px]">
          <div
            className={cx(
              "overflow-hidden rounded-[20px]",
              "border border-brand-200/60 bg-white/90 backdrop-blur-sm [box-shadow:var(--shadow-composer)]",
              "dark:border-white/[0.08] dark:bg-slate-950/70 dark:backdrop-blur-xl",
            )}
          >
            <PlannerErrorView
              title={failure.title}
              description={failure.description}
              onRetry={() => runPlan(intent)}
              onEdit={() => setPhase("idle")}
            />
          </div>
        </div>
      )}

      {phase === "duplicate" && (
        <div className="mx-auto max-w-[880px]">
          <div
            className={cx(
              "overflow-hidden rounded-[20px]",
              "border border-brand-200/60 bg-white/90 backdrop-blur-sm [box-shadow:var(--shadow-composer)]",
              "dark:border-white/[0.08] dark:bg-slate-950/70 dark:backdrop-blur-xl",
            )}
          >
            <DuplicateView
              onViewDrafts={onViewDrafts}
              onBack={() => setPhase("idle")}
            />
          </div>
        </div>
      )}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Page-local helpers (kept in the page, not the shared views)          */
/* ------------------------------------------------------------------ */

function OtherWayCard({
  icon,
  title,
  description,
  cta,
  onClick,
  comingSoon,
}: {
  icon: React.ReactNode
  title: string
  description: string
  cta: string
  onClick?: () => void
  comingSoon?: boolean
}) {
  return (
    <button
      onClick={comingSoon ? undefined : onClick}
      disabled={comingSoon}
      className={cx(
        "group flex flex-col items-start gap-4 rounded-2xl border p-5 text-left transition-all duration-150",
        comingSoon
          ? "cursor-default opacity-65 border-slate-200/70 bg-white/80 dark:border-white/[0.05] dark:bg-white/[0.02]"
          : "cursor-pointer border-slate-200/70 bg-white/90 backdrop-blur-sm hover:border-brand-300/50 hover:-translate-y-0.5 hover:bg-white dark:border-white/[0.07] dark:bg-white/[0.04] dark:backdrop-blur-md dark:hover:border-brand-400/30 dark:hover:bg-white/[0.07]",
      )}
    >
      <div className="flex w-full items-start justify-between gap-2">
        <div
          className={cx(
            "flex h-12 w-12 shrink-0 items-center justify-center rounded-xl transition-transform duration-150 group-hover:scale-105",
            comingSoon
              ? "bg-slate-100/70 text-slate-400 dark:bg-white/[0.04] dark:text-white/25"
              : "bg-brand-50/90 text-brand-400 dark:bg-brand-500/[0.12] dark:text-brand-400",
          )}
        >
          {icon}
        </div>
        {comingSoon && (
          <span className="rounded-full border border-slate-200/70 bg-white/70 px-2 py-0.5 text-[10px] font-medium text-slate-400 backdrop-blur-sm dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-white/30">
            Coming soon
          </span>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="mb-1 text-[16px] font-semibold text-slate-800 dark:text-white/90">
          {title}
        </p>
        <p className="text-[14px] leading-relaxed text-slate-500 dark:text-white/35">
          {description}
        </p>
      </div>
      {!comingSoon && (
        <div className="flex items-center gap-1 text-[14px] font-medium text-brand-400 group-hover:text-brand-300 dark:text-brand-400 dark:group-hover:text-brand-300">
          {cta}
          <span className="inline-block transition-transform duration-150 group-hover:translate-x-1 rtl:-scale-x-100">
            →
          </span>
        </div>
      )}
    </button>
  )
}

function ConfirmingView() {
  const { t } = useLang()
  return (
    <div className="flex flex-col items-center py-16 text-center" aria-live="polite">
      <div className="relative mb-8 flex h-20 w-20 items-center justify-center">
        <div className="absolute inset-0 animate-spin rounded-full border-4 border-slate-100 border-t-brand-700 dark:border-slate-700/60 dark:border-t-brand-400" />
        <IconSparkle className="h-8 w-8 text-brand-700 dark:text-brand-400" />
      </div>
      <h2 className="mb-2 text-[20px] font-semibold text-slate-800 dark:text-white">
        {t("pr10c.confirm.creating")}
      </h2>
      <p className="max-w-sm text-[14px] text-slate-500 dark:text-white/40">
        {t("pr10c.confirm.creatingHint")}
      </p>
    </div>
  )
}

function AuthRequiredView({
  onBack,
  onContinueWithout,
}: {
  onBack: () => void
  onContinueWithout: () => void
}) {
  const { t } = useLang()
  return (
    <div className="flex flex-col items-center py-16 text-center">
      <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-brand-50 dark:bg-brand-900/30">
        <IconLock className="h-8 w-8 text-brand-400" />
      </div>
      <h2 className="mb-2 text-[20px] font-semibold text-slate-800 dark:text-white">
        {t("pr10c.auth.requiredTitle")}
      </h2>
      <p className="mb-8 max-w-sm text-[14px] text-slate-500 dark:text-slate-400">
        {t("pr10c.auth.requiredBody")}
      </p>
      <div className="flex items-center gap-3">
        <Button
          variant="secondary"
          size="md"
          onClick={onContinueWithout}
        >
          {t("pr10c.auth.continueWithout")}
        </Button>
        <Button variant="ghost" size="md" onClick={onBack}>
          {t("common.back")}
        </Button>
      </div>
    </div>
  )
}

function DuplicateView({
  onViewDrafts,
  onBack,
}: {
  onViewDrafts: () => void
  onBack: () => void
}) {
  const { t } = useLang()
  return (
    <div className="flex flex-col items-center py-16 text-center">
      <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-amber-50 dark:bg-amber-900/30">
        <IconSparkle className="h-8 w-8 text-amber-500 dark:text-amber-400" />
      </div>
      <h2 className="mb-2 text-[20px] font-semibold text-slate-800 dark:text-white">
        {t("pr10c.duplicate.title")}
      </h2>
      <p className="mb-8 max-w-sm text-[14px] text-slate-500 dark:text-slate-400">
        {t("pr10c.duplicate.body")}
      </p>
      <div className="flex items-center gap-3">
        <Button variant="primary" size="md" onClick={onViewDrafts}>
          {t("pr10c.success.viewDrafts")}
        </Button>
        <Button variant="ghost" size="md" onClick={onBack}>
          {t("common.back")}
        </Button>
      </div>
    </div>
  )
}
