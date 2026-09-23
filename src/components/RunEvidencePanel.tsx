import { useCallback, useEffect, useRef, useState } from "react"
import { Button, Card, Modal } from "./primitives"
import { useLang, langLocale } from "../lib/i18n"
import {
  apiDownloadTestDefinitionArtifact,
  apiGetTestDefinitionRun,
  ApiError,
} from "../lib/api"
import {
  formatArtifactSize,
  formatRunDuration,
  runViewFromDetails,
  type DefinitionRunView,
  type RunArtifactView,
} from "../lib/testDefinitionRuns"
import { formatTimestamp, SectionHeading } from "./testdefinitions/shared"
import { RunStatusBadge } from "./testdefinitions/TestDefinitionRunPanel"

/**
 * Run History → Run Detail → Execution Evidence.
 *
 * Answers "what actually happened during this run?" for a definition-linked run,
 * by reading the authenticated run-evidence endpoint
 * (GET …/test-definitions/{definitionId}/runs/{runId}) and rendering ONLY what the
 * backend returned: run summary, per-step execution timeline, and captured
 * artifacts (screenshots inline, other files as authenticated downloads).
 *
 * Nothing is fabricated: the backend does not persist per-step expected/actual
 * assertion values or structured API request/response, so those are not shown.
 * Artifacts have no public URL — every byte is fetched with the session token and
 * the object URL is revoked as soon as it is consumed.
 *
 * Run identity is guarded two ways so Run A's evidence can never surface under
 * Run B: an AbortController cancels the in-flight fetch on switch/unmount, and a
 * resolved response is dropped unless its run identity still matches the request.
 */

type Phase = "loading" | "ready" | "error"

function isImageArtifact(a: RunArtifactView): boolean {
  if ((a.type ?? "").toUpperCase() === "SCREENSHOT") return true
  return (a.contentType ?? "").toLowerCase().startsWith("image/")
}

/* ------------------------------------------------------------------ */
/* Inline screenshot evidence (authenticated blob → object URL)        */
/* ------------------------------------------------------------------ */

function ScreenshotEvidence({
  clientId,
  definitionId,
  runId,
  artifact,
}: {
  clientId: number
  definitionId: number
  runId: number
  artifact: RunArtifactView
}) {
  const { t } = useLang()
  const [url, setUrl] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)
  const [zoom, setZoom] = useState(false)

  useEffect(() => {
    let disposed = false
    let objectUrl: string | null = null
    setUrl(null)
    setFailed(false)
    apiDownloadTestDefinitionArtifact(clientId, definitionId, runId, artifact.id)
      .then((blob) => {
        if (disposed) return
        objectUrl = URL.createObjectURL(blob)
        setUrl(objectUrl)
      })
      .catch(() => {
        if (!disposed) setFailed(true)
      })
    return () => {
      disposed = true
      // Always revoke the object URL we created, on unmount or artifact switch.
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [clientId, definitionId, runId, artifact.id])

  const size = formatArtifactSize(artifact.sizeBytes)
  const caption = [
    artifact.stepIndex == null ? t("testdef.artifacts.runScope") : t("testdef.artifacts.step", { index: artifact.stepIndex }),
    size,
  ]
    .filter(Boolean)
    .join(" · ")

  return (
    <figure className="overflow-hidden rounded-lg border border-slate-200 bg-elevated">
      {failed ? (
        <div className="flex h-32 items-center justify-center px-3 text-center text-[12px] text-slate-400">
          {t("runEvidence.screenshotUnavailable")}
        </div>
      ) : url ? (
        <button
          type="button"
          onClick={() => setZoom(true)}
          className="block w-full"
          title={t("runEvidence.viewScreenshot")}
        >
          <img src={url} alt={artifact.name} className="h-32 w-full object-contain bg-white" dir="ltr" />
        </button>
      ) : (
        <div className="flex h-32 items-center justify-center text-[12px] text-slate-400" role="status">
          {t("runEvidence.loading")}
        </div>
      )}
      <figcaption className="flex items-center justify-between gap-2 border-t border-slate-100 px-3 py-2">
        <span className="truncate font-mono text-[11px] text-slate-500" dir="ltr">{artifact.name}</span>
        <span className="shrink-0 text-[10px] uppercase tracking-wide text-slate-400">{caption}</span>
      </figcaption>
      {zoom && url && (
        <Modal isOpen={zoom} onClose={() => setZoom(false)} title={artifact.name} size="lg">
          <img src={url} alt={artifact.name} className="max-h-[70vh] w-full object-contain" dir="ltr" />
        </Modal>
      )}
    </figure>
  )
}

/* ------------------------------------------------------------------ */
/* Downloadable (non-image) artifact                                   */
/* ------------------------------------------------------------------ */

function DownloadArtifactRow({
  clientId,
  definitionId,
  runId,
  artifact,
}: {
  clientId: number
  definitionId: number
  runId: number
  artifact: RunArtifactView
}) {
  const { t } = useLang()
  const [downloading, setDownloading] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)

  async function download() {
    if (downloading) return
    setDownloading(true)
    setProblem(null)
    try {
      const blob = await apiDownloadTestDefinitionArtifact(clientId, definitionId, runId, artifact.id)
      const objectUrl = URL.createObjectURL(blob)
      try {
        const link = document.createElement("a")
        link.href = objectUrl
        link.download = artifact.name
        link.rel = "noopener"
        document.body.appendChild(link)
        link.click()
        link.remove()
      } finally {
        URL.revokeObjectURL(objectUrl)
      }
    } catch {
      setProblem(t("runEvidence.screenshotUnavailable"))
    } finally {
      setDownloading(false)
    }
  }

  const size = formatArtifactSize(artifact.sizeBytes)
  return (
    <li className="flex flex-wrap items-center justify-between gap-3 py-2.5">
      <div className="min-w-0">
        <p className="truncate font-mono text-[12px] text-slate-700" dir="ltr">{artifact.name}</p>
        <p className="mt-0.5 text-[11px] text-slate-400">
          {[
            artifact.type,
            artifact.stepIndex == null ? t("testdef.artifacts.runScope") : t("testdef.artifacts.step", { index: artifact.stepIndex }),
            size,
          ]
            .filter(Boolean)
            .join(" · ")}
        </p>
        {problem && <p className="mt-1 text-[11px] text-red-700">{problem}</p>}
      </div>
      <Button variant="secondary" size="sm" onClick={() => void download()} loading={downloading}>
        {downloading ? t("testdef.artifacts.downloading") : t("testdef.artifacts.download")}
      </Button>
    </li>
  )
}

/* ------------------------------------------------------------------ */
/* Execution timeline row                                              */
/* ------------------------------------------------------------------ */

function TimelineRow({ step }: { step: DefinitionRunView["steps"][number] }) {
  const duration = formatRunDuration(step.durationMs)
  return (
    <tr className="align-top">
      <td className="px-4 py-2.5 font-mono text-[12px] text-slate-400" dir="ltr">{step.stepIndex}</td>
      <td className="px-4 py-2.5">
        <p className="font-mono text-[12px] text-slate-700" dir="ltr">{step.action ?? "—"}</p>
        {step.label && <p className="mt-0.5 font-mono text-[11px] text-slate-400" dir="ltr">{step.label}</p>}
      </td>
      <td className="px-4 py-2.5"><RunStatusBadge status={step.status == null ? null : String(step.status)} /></td>
      <td className="px-4 py-2.5">
        {step.message ? (
          <p className="max-w-md whitespace-pre-wrap break-words text-[12px] text-slate-600">{step.message}</p>
        ) : (
          <span className="text-[12px] text-slate-400">—</span>
        )}
        {step.reasonCode && <p className="mt-1 font-mono text-[11px] text-slate-400" dir="ltr">{step.reasonCode}</p>}
      </td>
      <td className="px-4 py-2.5 text-end font-mono text-[12px] text-slate-500" dir="ltr">{duration ?? "—"}</td>
    </tr>
  )
}

/* ------------------------------------------------------------------ */
/* Panel                                                               */
/* ------------------------------------------------------------------ */

export function RunEvidencePanel({
  clientId,
  definitionId,
  runId,
}: {
  clientId: number
  /** Numeric test_definition_id; null for legacy/package runs with no definition. */
  definitionId: number | null
  /** Numeric test_runs.id; null when the history row exposed no numeric id. */
  runId: number | null
}) {
  const { t } = useLang()
  const locale = langLocale()
  const [phase, setPhase] = useState<Phase>("loading")
  const [view, setView] = useState<DefinitionRunView | null>(null)
  const [nonce, setNonce] = useState(0)
  const retry = useCallback(() => setNonce((n) => n + 1), [])

  const linked = definitionId != null && runId != null
  /** Identity of the run currently requested; a resolved response for anything else is stale. */
  const identity = linked ? `${clientId}:${definitionId}:${runId}` : null
  const identityRef = useRef<string | null>(null)

  useEffect(() => {
    if (definitionId == null || runId == null) return
    const token = `${clientId}:${definitionId}:${runId}`
    identityRef.current = token
    const abort = new AbortController()
    let disposed = false
    setPhase("loading")
    setView(null)
    apiGetTestDefinitionRun(clientId, definitionId, runId, abort.signal)
      .then((details) => {
        // Stale guard: ignore a response for a run we are no longer showing, even
        // if the abort did not land first (rapid A→B→A switching).
        if (disposed || identityRef.current !== token) return
        setView(runViewFromDetails(details))
        setPhase("ready")
      })
      .catch((err) => {
        if (disposed || identityRef.current !== token) return
        // An aborted fetch is a deliberate switch/unmount, not an error to show.
        if (err instanceof ApiError && err.status === 0) return
        if (err instanceof DOMException && err.name === "AbortError") return
        setPhase("error")
      })
    return () => {
      disposed = true
      abort.abort()
    }
  }, [clientId, definitionId, runId, nonce])

  // Legacy/package run: no definition linkage, so the rich evidence endpoint is
  // not called at all. Truthful unavailable state — never an empty panel.
  if (!linked) {
    return (
      <Card className="p-5" data-testid="run-evidence-unavailable">
        <SectionHeading>{t("runEvidence.title")}</SectionHeading>
        <p className="text-[13px] text-slate-500">{t("runEvidence.unavailable")}</p>
        <p className="mt-1 text-[12px] text-slate-400">{t("runEvidence.unavailableHint")}</p>
      </Card>
    )
  }

  if (phase === "loading") {
    return (
      <Card className="p-5" data-testid="run-evidence-loading">
        <SectionHeading>{t("runEvidence.title")}</SectionHeading>
        <p role="status" className="text-[13px] text-slate-500">{t("runEvidence.loading")}</p>
      </Card>
    )
  }

  if (phase === "error" || !view) {
    return (
      <Card className="p-5" data-testid="run-evidence-error">
        <SectionHeading>{t("runEvidence.title")}</SectionHeading>
        <p role="alert" className="text-[13px] text-red-700">{t("runEvidence.error")}</p>
        <div className="mt-3">
          <Button variant="secondary" size="sm" onClick={retry}>{t("runEvidence.retry")}</Button>
        </div>
      </Card>
    )
  }

  const screenshots = view.artifacts.filter(isImageArtifact)
  const files = view.artifacts.filter((a) => !isImageArtifact(a))
  const nothing = view.steps.length === 0 && view.artifacts.length === 0

  return (
    <div className="space-y-4" data-testid="run-evidence-ready" data-run-identity={identity ?? ""}>
      {/* Run Summary */}
      <Card className="p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <SectionHeading>{t("runEvidence.summary")}</SectionHeading>
            <p className="text-[12px] text-slate-400">{t("runEvidence.subtitle")}</p>
          </div>
          <RunStatusBadge status={view.status == null ? null : String(view.status)} />
        </div>
        <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-2 sm:grid-cols-4">
          <div>
            <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{t("testdef.run.runId")}</dt>
            <dd className="font-mono text-[13px] text-slate-700" dir="ltr">{view.externalRunId ?? `#${view.runId}`}</dd>
          </div>
          <div>
            <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{t("testdef.run.startedAt")}</dt>
            <dd className="text-[13px] text-slate-700">{formatTimestamp(view.startedAt, locale)}</dd>
          </div>
          <div>
            <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{t("testdef.run.duration")}</dt>
            <dd className="font-mono text-[13px] text-slate-700" dir="ltr">{formatRunDuration(view.durationMs) ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{t("testdef.th.version")}</dt>
            <dd className="text-[13px] text-slate-700">
              {view.versionNumber == null ? "—" : t("testdef.versionNumber", { number: view.versionNumber })}
            </dd>
          </div>
        </dl>
      </Card>

      {nothing ? (
        <Card className="p-5" data-testid="run-evidence-empty">
          <p className="text-[13px] text-slate-500">{t("runEvidence.empty")}</p>
        </Card>
      ) : (
        <>
          {/* Execution Timeline */}
          <Card className="overflow-hidden">
            <div className="px-5 pt-4"><SectionHeading>{t("runEvidence.timeline")}</SectionHeading></div>
            {view.steps.length === 0 ? (
              <p className="px-5 pb-5 text-[13px] text-slate-500">{t("runEvidence.noSteps")}</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-start text-[13px]">
                  <caption className="sr-only">{t("runEvidence.timeline")}</caption>
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
                    {view.steps.map((step, index) => (
                      <TimelineRow key={`${step.stepIndex}-${index}`} step={step} />
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          {/* Screenshots (inline, authenticated) */}
          {screenshots.length > 0 && (
            <Card className="p-5">
              <SectionHeading>{t("runEvidence.screenshots")}</SectionHeading>
              <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
                {screenshots.map((artifact) => (
                  <ScreenshotEvidence
                    key={artifact.id}
                    clientId={clientId}
                    definitionId={definitionId}
                    runId={runId}
                    artifact={artifact}
                  />
                ))}
              </div>
            </Card>
          )}

          {/* Other artifacts (authenticated download) */}
          {files.length > 0 && (
            <Card className="p-5">
              <SectionHeading>{t("testdef.artifacts.title")}</SectionHeading>
              <ul className="divide-y divide-slate-200">
                {files.map((artifact) => (
                  <DownloadArtifactRow
                    key={artifact.id}
                    clientId={clientId}
                    definitionId={definitionId}
                    runId={runId}
                    artifact={artifact}
                  />
                ))}
              </ul>
            </Card>
          )}
        </>
      )}
    </div>
  )
}

export default RunEvidencePanel


