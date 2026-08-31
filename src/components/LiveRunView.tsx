/**
 * Live Run view (Phase 4) — the existing RunDetail implementation fed by
 * real execution data. No new screen design: this component only converts
 * the data source (backend polling → Run model) and forwards the existing
 * cancel/back interactions.
 */

import React from "react"
import { Card, ErrorState, Skeleton, useToast } from "./primitives"
import { WorkspaceHeader } from "./WorkspaceHeader"
import { RunDetail } from "./RunDetail"
import { useLiveRun } from "../lib/useLiveRun"
import type { LiveRunSession } from "../lib/runData"
import { useLang } from "../lib/i18n"

export function LiveRunView({
  active,
  onSelect,
  session,
  onBack,
  onUnauthorized,
  onRunAgain,
  onViewAi,
  backLabel,
}: {
  active: string
  onSelect: (k: string) => void
  session: LiveRunSession
  onBack: () => void
  onUnauthorized: () => void
  onRunAgain: () => void
  /** Deep link into the AI Analysis page for this run's report. */
  onViewAi?: (runId: string) => void
  backLabel?: string
}) {
  const toast = useToast()
  const { t } = useLang()
  const { run, pollError, cancel, retryAnalysis, retryingAnalysis } = useLiveRun(session, onUnauthorized)

  async function handleCancel() {
    const result = await cancel()
    if (result.ok) {
      toast({
        title: t("autrun.cancelRequestedTitle"),
        description: t("autrun.cancelRequestedDesc"),
        variant: "info",
      })
    } else if (result.alreadyFinished) {
      toast({
        title: t("autrun.runAlreadyFinishedTitle"),
        description: t("autrun.runAlreadyFinishedDesc"),
        variant: "info",
      })
    } else if (result.message) {
      toast({ title: t("autrun.cancelFailedTitle"), description: result.message, variant: "error" })
    }
  }

  async function handleRetryAi() {
    const result = await retryAnalysis()
    if (!result.ok && result.message) {
      toast({ title: t("run.unableToStartAnalysis"), description: result.message, variant: "error" })
    }
  }

  return (
    <div className="space-y-6">
      <WorkspaceHeader active={active} onSelect={onSelect} />
      {run ? (
        <RunDetail
          run={run}
          onBack={onBack}
          onCancel={handleCancel}
          onRunAgain={onRunAgain}
          onRetryAi={run.ai?.retryable ? handleRetryAi : undefined}
          aiRetrying={retryingAnalysis}
          onViewAiAnalysis={onViewAi ? () => onViewAi(run.id) : undefined}
          backLabel={backLabel}
        />
      ) : (
        <Card>
          <Skeleton className="h-24 w-full" rounded="lg" />
        </Card>
      )}
      {pollError && (
        <Card>
          <ErrorState title={t("history.runUnavailable")} description={pollError} />
        </Card>
      )}
    </div>
  )
}

export default LiveRunView
