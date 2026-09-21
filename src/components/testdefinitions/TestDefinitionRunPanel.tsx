import React, { useEffect, useState } from "react"
import { Button, Card, cx, useToast } from "../primitives"
import { useLang, langLocale } from "../../lib/i18n"
import { AiAnalysisCard } from "../AiCard"
import { apiDownloadTestDefinitionArtifact, apiRunAnalysis, apiTriggerAnalysis } from "../../lib/api"
import { parseAiReport } from "../../lib/aiAnalysis"
import { mapTestDefinitionFailure } from "../../lib/testDefinitionLifecycle"
import {
  formatArtifactSize,
  formatRunDuration,
  type DefinitionRunView,
  type RunStepView,
} from "../../lib/testDefinitionRuns"
import { SectionHeading, formatTimestamp } from "./shared"

/* ------------------------------------------------------------------ */
/* Status presentation                                                 */
/* ------------------------------------------------------------------ */

const RUN_STATUS_STYLE: Record<string, { bg: string; text: string; ring: string; dot: string; glyph: string; labelKey: string }> = {
  PASSED: { bg: "bg-emerald-50", text: "text-emerald-700", ring: "ring-emerald-600/10", dot: "bg-success", glyph: "✓", labelKey: "testdef.run.status.passed" },
  PASS: { bg: "bg-emerald-50", text: "text-emerald-700", ring: "ring-emerald-600/10", dot: "bg-success", glyph: "✓", labelKey: "testdef.run.status.passed" },
  FAILED: { bg: "bg-red-50", text: "text-red-700", ring: "ring-red-600/10", dot: "bg-error", glyph: "✕", labelKey: "testdef.run.status.failed" },
  FAIL: { bg: "bg-red-50", text: "text-red-700", ring: "ring-red-600/10", dot: "bg-error", glyph: "✕", labelKey: "testdef.run.status.failed" },
  ERROR: { bg: "bg-amber-50", text: "text-amber-800", ring: "ring-amber-600/10", dot: "bg-warning", glyph: "!", labelKey: "testdef.run.status.error" },
  CANCELLED: { bg: "bg-slate-100", text: "text-slate-500", ring: "ring-slate-400/10", dot: "bg-slate-400", glyph: "⊘", labelKey: "testdef.run.status.cancelled" },
  NOT_EXECUTED: { bg: "bg-slate-100", text: "text-slate-500", ring: "ring-slate-400/10", dot: "bg-slate-300", glyph: "–", labelKey: "testdef.run.status.notExecuted" },
}

/** Status is shown with a dot, a glyph and a word — never colour alone. */
export function RunStatusBadge({ status }: { status: string | null }) {
  const { t } = useLang()
  const key = (status ?? "").toUpperCase()
  const style = RUN_STATUS_STYLE[key]
  const label = style ? t(style.labelKey) : (status || t("testdef.run.status.unknown"))
  const applied = style ?? {
    bg: "bg-slate-100",
    text: "text-slate-500",
    ring: "ring-slate-400/10",
    dot: "bg-slate-300",
    glyph: "?",
  }
  return (
    <span
      data-testid={`testdef-run-status-${key || "UNKNOWN"}`}
      className={cx(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide ring-1 ring-inset",
        applied.bg,
        applied.text,
        applied.ring,
      )}
    >
      <span className={cx("size-1.5 rounded-full", applied.dot)} />
      <span aria-hidden="true">{applied.glyph}</span>
      {label}
    </span>
  )
}

/* ------------------------------------------------------------------ */
/* Evidence                                                            */
/* ------------------------------------------------------------------ */

type ArtifactProblem = { artifactId: number; title: string; description: string }

function ArtifactRow({
  clientId,
  definitionId,
  runId,
  artifact,
  onProblem,
}: {
  clientId: number
  definitionId: number
  runId: number
  artifact: DefinitionRunView["artifacts"][number]
  onProblem: (problem: ArtifactProblem) => void
}) {
  const { t } = useLang()
  const [downloading, setDownloading] = useState(false)

  /**
   * Evidence has no public URL: the route is authenticated like every other, so
   * the bytes are fetched with the session token and handed to the browser as an
   * object URL that is revoked immediately afterwards.
   */
  async function handleDownload() {
    if (downloading) return
    setDownloading(true)
    try {
      const blob = await apiDownloadTestDefinitionArtifact(clientId, definitionId, runId, artifact.id)
      const url = URL.createObjectURL(blob)
      try {
        const link = document.createElement("a")
        link.href = url
        link.download = artifact.name
        link.rel = "noopener"
        document.body.appendChild(link)
        link.click()
        link.remove()
      } finally {
        URL.revokeObjectURL(url)
      }
    } catch (err) {
      const failure = mapTestDefinitionFailure(err)
      if (failure.kind === "notFound") {
        onProblem({
          artifactId: artifact.id,
          title: t("testdef.artifacts.missingTitle"),
          description: t("testdef.artifacts.missingDesc"),
        })
        return
      }
      if (failure.kind === "forbidden") {
        onProblem({
          artifactId: artifact.id,
          title: t("testdef.artifacts.deniedTitle"),
          description: failure.message,
        })
        return
      }
      onProblem({
        artifactId: artifact.id,
        title: t("testdef.artifacts.failedTitle"),
        description: failure.message,
      })
    } finally {
      setDownloading(false)
    }
  }

  const size = formatArtifactSize(artifact.sizeBytes)

  return (
    <li className="flex flex-wrap items-center justify-between gap-3 py-2.5">
      <div className="min-w-0">
        <p className="truncate font-mono text-[12px] text-slate-700" dir="ltr">
          {artifact.name}
        </p>
        <p className="mt-0.5 text-[11px] text-slate-400">
          {[
            artifact.type,
            artifact.stepIndex == null
              ? t("testdef.artifacts.runScope")
              : t("testdef.artifacts.step", { index: artifact.stepIndex }),
            size,
          ]
            .filter(Boolean)
            .join(" · ")}
        </p>
      </div>
      <Button variant="secondary" size="sm" onClick={() => void handleDownload()} loading={downloading}>
        {downloading ? t("testdef.artifacts.downloading") : t("testdef.artifacts.download")}
      </Button>
    </li>
  )
}

/* ------------------------------------------------------------------ */
/* Run panel                                                           */
/* ------------------------------------------------------------------ */

function StepRow({ step }: { step: RunStepView }) {
  const { t } = useLang()
  const duration = formatRunDuration(step.durationMs)
  return (
    <tr className="align-top">
      <td className="px-4 py-2.5 font-mono text-[12px] text-slate-400" dir="ltr">
        {step.stepIndex}
      </td>
      <td className="px-4 py-2.5">
        <p className="font-mono text-[12px] text-slate-700" dir="ltr">
          {step.action ?? "—"}
        </p>
        {step.label && (
          <p className="mt-0.5 font-mono text-[11px] text-slate-400" dir="ltr">
            {step.label}
          </p>
        )}
        {step.isExpectedOutcome && (
          <span className="mt-1 inline-block rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
            {t("testdef.run.expectedOutcome")}
          </span>
        )}
      </td>
      <td className="px-4 py-2.5">
        <RunStatusBadge status={step.status == null ? null : String(step.status)} />
      </td>
      <td className="px-4 py-2.5">
        {/* Engine-sanitized text, rendered as text: no markup is ever interpreted. */}
        {step.message ? (
          <p className="max-w-md whitespace-pre-wrap break-words text-[12px] text-slate-600">{step.message}</p>
        ) : (
          <span className="text-[12px] text-slate-400">—</span>
        )}
        {step.reasonCode && (
          <p className="mt-1 font-mono text-[11px] text-slate-400" dir="ltr">
            {step.reasonCode}
          </p>
        )}
      </td>
      <td className="px-4 py-2.5 text-end font-mono text-[12px] text-slate-500" dir="ltr">
        {duration ?? "—"}
      </td>
    </tr>
  )
}

/**
 * Displays one trial or proving run: its identity, outcome, per-step results and
 * evidence metadata.
 *
 * A fresh execution response never carries artifact metadata — that lives on the
 * stored run — so the panel says so explicitly and offers a refresh instead of
 * implying the run produced nothing.
 */
export function TestDefinitionRunPanel({
  clientId,
  definitionId,
  run,
  running,
  onRefresh,
  refreshing,
}: {
  clientId: number
  definitionId: number
  run: DefinitionRunView | null
  running: boolean
  onRefresh?: () => void
  refreshing?: boolean
}) {
  const { t } = useLang()
  const locale = langLocale()
  const toast = useToast()
  const [problem, setProblem] = useState<ArtifactProblem | null>(null)
  const [analysisOpen, setAnalysisOpen] = useState(false)
  const [analysisStatus, setAnalysisStatus] = useState("NOT_STARTED")
  const [analysisReport, setAnalysisReport] = useState<ReturnType<typeof parseAiReport>>(null)
  const [analysisLoading, setAnalysisLoading] = useState(false)
  const [analysisError, setAnalysisError] = useState<string | null>(null)
  const [analysisRetrying, setAnalysisRetrying] = useState(false)

  const terminalFailure = run != null && ["FAILED", "FAIL", "ERROR"].includes(String(run.status).toUpperCase())
  const analysisRunId = run?.externalRunId ?? null

  async function loadAnalysis() {
    if (!analysisRunId || analysisLoading) return
    setAnalysisLoading(true)
    setAnalysisError(null)
    try {
      const result = await apiRunAnalysis(analysisRunId)
      if (result.analysisStatus === "NOT_STARTED") {
        const accepted = await apiTriggerAnalysis(analysisRunId)
        setAnalysisStatus(accepted.analysisStatus)
        setAnalysisReport(null)
      } else {
        setAnalysisStatus(result.analysisStatus)
        setAnalysisReport(parseAiReport(result.analysis))
      }
    } catch (error) {
      setAnalysisError(error instanceof Error ? error.message : t("runPanel.analysis.error"))
    } finally {
      setAnalysisLoading(false)
    }
  }

  async function retryAnalysis() {
    if (!analysisRunId || analysisRetrying) return
    setAnalysisRetrying(true)
    setAnalysisError(null)
    try {
      const result = await apiTriggerAnalysis(analysisRunId)
      setAnalysisStatus(result.analysisStatus)
      setAnalysisReport(null)
      await loadAnalysis()
    } catch (error) {
      setAnalysisError(error instanceof Error ? error.message : t("runPanel.analysis.error"))
    } finally {
      setAnalysisRetrying(false)
    }
  }

  useEffect(() => {
    setAnalysisOpen(false)
    setAnalysisStatus("NOT_STARTED")
    setAnalysisReport(null)
    setAnalysisError(null)
  }, [run?.externalRunId])

  function reportProblem(next: ArtifactProblem) {
    setProblem(next)
    toast({ title: next.title, description: next.description, variant: "error" })
  }

  if (running && !run) {
    return (
      <Card className="p-5">
        <SectionHeading>{t("testdef.run.title")}</SectionHeading>
        <p role="status" className="text-[13px] text-slate-500">
          {t("testdef.run.pending")}
        </p>
      </Card>
    )
  }

  if (!run) return null

  const purposeLabel =
    run.purpose === "PROVING"
      ? t("testdef.run.proving")
      : run.purpose === "TRIAL"
        ? t("testdef.run.trial")
        : (run.purpose ?? "—")

  return (
    <div className="space-y-4">
      <Card className="p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <SectionHeading>{t("testdef.run.title")}</SectionHeading>
            <div className="flex flex-wrap items-center gap-2">
              <RunStatusBadge status={run.status == null ? null : String(run.status)} />
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                {purposeLabel}
              </span>
              {run.replayed && (
                <span
                  className="rounded-full bg-brand-50 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-brand-300"
                  title={t("testdef.run.replayedHint")}
                >
                  {t("testdef.run.replayed")}
                </span>
              )}
            </div>
          </div>
          {onRefresh && (
            <Button variant="secondary" size="sm" onClick={onRefresh} loading={refreshing}>
              {t("testdef.run.reload")}
            </Button>
          )}
        </div>

        <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-2 sm:grid-cols-4">
          <div>
            <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
              {t("testdef.run.runId")}
            </dt>
            <dd className="font-mono text-[13px] text-slate-700" dir="ltr">
              {run.externalRunId ?? `#${run.runId}`}
            </dd>
          </div>
          <div>
            <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
              {t("testdef.run.startedAt")}
            </dt>
            <dd className="text-[13px] text-slate-700">{formatTimestamp(run.startedAt, locale)}</dd>
          </div>
          <div>
            <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
              {t("testdef.run.duration")}
            </dt>
            <dd className="font-mono text-[13px] text-slate-700" dir="ltr">
              {formatRunDuration(run.durationMs) ?? "—"}
            </dd>
          </div>
          <div>
            <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
              {t("testdef.th.version")}
            </dt>
            <dd className="text-[13px] text-slate-700">
              {run.versionNumber == null ? "—" : t("testdef.versionNumber", { number: run.versionNumber })}
            </dd>
          </div>
        </dl>

        {run.becameReady === true && (
          <p className="mt-4 rounded-lg bg-emerald-50 px-3 py-2 text-[13px] font-medium text-emerald-800">
            {t("testdef.run.becameReady")}
          </p>
        )}
        {run.becameReady === false && (
          <p className="mt-4 rounded-lg bg-amber-50 px-3 py-2 text-[13px] font-medium text-amber-800">
            {t("testdef.run.notReady")}
          </p>
        )}
        {run.idempotencyNote && (
          <p className="mt-3 text-[12px] text-slate-500">{run.idempotencyNote}</p>
        )}
      </Card>

      {terminalFailure && (
        <Card className="overflow-hidden">
          <button
            type="button"
            className="flex w-full items-center justify-between gap-3 px-5 py-4 text-start"
            aria-expanded={analysisOpen}
            aria-controls="testdef-inline-ai-analysis"
            onClick={() => {
              const next = !analysisOpen
              setAnalysisOpen(next)
              if (next && analysisStatus === "NOT_STARTED") void loadAnalysis()
            }}
          >
            <span className="text-[13px] font-semibold text-navy">{t("runPanel.analysis.title")}</span>
            <span aria-hidden="true" className="text-slate-400">{analysisOpen ? "−" : "+"}</span>
          </button>
          {analysisOpen && (
            <div id="testdef-inline-ai-analysis" className="border-t border-slate-200 p-4">
              {!analysisRunId ? (
                <p role="alert" className="text-[13px] text-red-700">{t("runPanel.analysis.unavailable")}</p>
              ) : analysisLoading ? (
                <p role="status" className="text-[13px] text-slate-500">{t("runPanel.analysis.loading")}</p>
              ) : analysisError ? (
                <p role="alert" className="text-[13px] text-red-700">{analysisError}</p>
              ) : (
                <AiAnalysisCard
                  status={analysisStatus}
                  report={analysisReport}
                  retryable={analysisStatus === "FAILED" || analysisStatus === "RATE_LIMITED" || analysisStatus === "NOT_STARTED"}
                  retrying={analysisRetrying}
                  onRetry={() => void retryAnalysis()}
                />
              )}
            </div>
          )}
        </Card>
      )}

      {/* Steps */}
      <Card className="overflow-hidden">
        <div className="px-5 pt-4">
          <SectionHeading>{t("testdef.run.steps")}</SectionHeading>
        </div>
        {run.steps.length === 0 ? (
          <p className="px-5 pb-5 text-[13px] text-slate-500">{t("testdef.run.noSteps")}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-start text-[13px]">
              <caption className="sr-only">{t("testdef.run.steps")}</caption>
              <thead>
                <tr className="border-y border-slate-200 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                  <th scope="col" className="px-4 py-2.5 text-start">{t("testdef.run.thStep")}</th>
                  <th scope="col" className="px-4 py-2.5 text-start">{t("testdef.run.thAction")}</th>
                  <th scope="col" className="px-4 py-2.5 text-start">{t("testdef.run.thStatus")}</th>
                  <th scope="col" className="px-4 py-2.5 text-start">{t("testdef.run.thDetail")}</th>
                  <th scope="col" className="px-4 py-2.5 text-end">{t("testdef.run.thDuration")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {run.steps.map((step, index) => (
                  <StepRow key={`${step.isExpectedOutcome ? "outcome" : "step"}-${step.stepIndex}-${index}`} step={step} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Evidence */}
      <Card className="p-5">
        <SectionHeading>{t("testdef.artifacts.title")}</SectionHeading>
        {run.artifactsUnknown ? (
          <p className="text-[13px] text-slate-500">{t("testdef.artifacts.unknown")}</p>
        ) : run.artifacts.length === 0 ? (
          <p className="text-[13px] text-slate-500">{t("testdef.artifacts.none")}</p>
        ) : (
          <ul className="divide-y divide-slate-200">
            {run.artifacts.map((artifact) => (
              <ArtifactRow
                key={artifact.id}
                clientId={clientId}
                definitionId={definitionId}
                runId={run.runId}
                artifact={artifact}
                onProblem={reportProblem}
              />
            ))}
          </ul>
        )}
        {problem && (
          <div role="status" className="mt-3 rounded-lg bg-red-50 px-3 py-2">
            <p className="text-[12px] font-semibold text-red-700">{problem.title}</p>
            <p className="mt-0.5 text-[12px] text-red-700">{problem.description}</p>
          </div>
        )}
      </Card>
    </div>
  )
}

export default TestDefinitionRunPanel
