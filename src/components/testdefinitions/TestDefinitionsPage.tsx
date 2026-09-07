import React, { useCallback, useState } from "react"
import { useLang } from "../../lib/i18n"
import { WorkspaceHeader } from "../WorkspaceHeader"
import { TestDefinitionCreate } from "./TestDefinitionCreate"
import { TestDefinitionDetail } from "./TestDefinitionDetail"
import { TestDefinitionList } from "./TestDefinitionList"

type View = { kind: "list" } | { kind: "create" } | { kind: "detail"; definitionId: number }

/**
 * The Test Definitions area for one client environment.
 *
 * List, create and detail are the three states of one page, switched on local
 * state the way the rest of the dashboard does it — there is no router. Both the
 * client workspace and the admin console mount this component; `isAdmin` decides
 * whether the admin-only lifecycle steps are offered, and the engine enforces the
 * same rule regardless of what the UI shows.
 */
export function TestDefinitionsPage({
  clientId,
  clientName,
  isAdmin,
  onUnauthorized,
  active = "test-definitions",
  onSelect,
  showWorkspaceHeader = false,
  showPageHeader = true,
  headerEyebrow,
  headerSubtitle,
  initialDefinitionId,
}: {
  clientId: number
  clientName: string
  isAdmin: boolean
  onUnauthorized: () => void
  active?: string
  onSelect?: (key: string) => void
  showWorkspaceHeader?: boolean
  /** False when the host already rendered its own page header (the admin console). */
  showPageHeader?: boolean
  headerEyebrow?: string
  headerSubtitle?: string
  initialDefinitionId?: number | null
}) {
  const { t } = useLang()
  const [view, setView] = useState<View>(
    initialDefinitionId != null ? { kind: "detail", definitionId: initialDefinitionId } : { kind: "list" },
  )
  /* Bumped after a mutation so the list re-reads when it comes back into view. */
  const [listVersion, setListVersion] = useState(0)

  const backToList = useCallback(() => {
    setView({ kind: "list" })
    setListVersion((v) => v + 1)
  }, [])

  if (view.kind === "detail") {
    return (
      <div className="space-y-6">
        {showWorkspaceHeader && onSelect && <WorkspaceHeader active={active} onSelect={onSelect} />}
        <TestDefinitionDetail
          clientId={clientId}
          clientName={clientName}
          definitionId={view.definitionId}
          isAdmin={isAdmin}
          onBack={backToList}
          onUnauthorized={onUnauthorized}
          onChanged={() => setListVersion((v) => v + 1)}
        />
      </div>
    )
  }

  if (view.kind === "create") {
    return (
      <div className="space-y-6">
        {showWorkspaceHeader && onSelect && <WorkspaceHeader active={active} onSelect={onSelect} />}
        <TestDefinitionCreate
          clientId={clientId}
          clientName={clientName}
          onCancel={backToList}
          onCreated={(definitionId) => {
            setListVersion((v) => v + 1)
            setView({ kind: "detail", definitionId })
          }}
          onUnauthorized={onUnauthorized}
        />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {showWorkspaceHeader && onSelect && <WorkspaceHeader active={active} onSelect={onSelect} />}
      {showPageHeader && (
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-brand-300">
              {headerEyebrow ?? t("testdef.eyebrow")}
            </p>
            <h1 className="mt-1 font-display text-2xl font-bold tracking-tight text-navy">
              {t("testdef.title")}
            </h1>
            <p className="mt-1 text-[13px] text-slate-500">{headerSubtitle ?? t("testdef.subtitle")}</p>
          </div>
        </div>
      )}
      <TestDefinitionList
        key={listVersion}
        clientId={clientId}
        clientName={clientName}
        onOpen={(definitionId) => setView({ kind: "detail", definitionId })}
        onCreate={() => setView({ kind: "create" })}
        onUnauthorized={onUnauthorized}
      />
    </div>
  )
}

export default TestDefinitionsPage
