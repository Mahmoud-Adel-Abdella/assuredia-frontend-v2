import React, { useState } from "react"
import { TestCreationWizard } from "./testcreation/TestCreationWizard"
import { ManualEditorFlow } from "./testcreation/ManualEditorFlow"
import { AiBuilderPage } from "./planner/AiBuilderPage"
import type { JourneyType } from "../lib/testCreation"

type CreateTestPageProps = {
  clientId: number
  onOpenDefinition: (id: number) => void
  onViewDrafts: () => void
  onViewRequests: () => void
  onUnauthorized: () => void
  /** Opens Settings → Secure Credentials (PR10C.5 credential selector CTA). */
  onOpenSettingsCredentials?: () => void
}

/**
 * Create Test is intentionally an AI-first entry point (PR10C D-1): the
 * customer describes what they want to verify and the AI Test Builder chooses
 * which discovery capability to invoke internally. Legacy DiscoveryFlow stays
 * in the codebase for PR10E, but is not a customer-selected method here.
 */
export function CreateTestPage({
  clientId,
  onOpenDefinition,
  onViewDrafts,
  onViewRequests,
  onUnauthorized,
  onOpenSettingsCredentials,
}: CreateTestPageProps) {
  const [manualJourney, setManualJourney] = useState<JourneyType | null>(null)
  const [manualRequestOpen, setManualRequestOpen] = useState(false)

  if (manualRequestOpen) {
    return (
      <TestCreationWizard
        clientId={clientId}
        initialMethod="MANUAL_REQUEST"
        onExit={() => setManualRequestOpen(false)}
        onViewRequests={onViewRequests}
        onOpenDefinition={onOpenDefinition}
        onUnauthorized={onUnauthorized}
      />
    )
  }

  if (manualJourney != null) {
    return (
      <ManualEditorFlow
        clientId={clientId}
        initialJourneyType={manualJourney}
        onBack={() => setManualJourney(null)}
        onOpenDefinition={onOpenDefinition}
        onViewDrafts={onViewDrafts}
        onUnauthorized={onUnauthorized}
        onOpenSettingsCredentials={onOpenSettingsCredentials}
      />
    )
  }

  return (
    <AiBuilderPage
      clientId={clientId}
      onOpenDefinition={onOpenDefinition}
      onViewDrafts={onViewDrafts}
      onViewRequests={onViewRequests}
      onUnauthorized={onUnauthorized}
      onOpenSettingsCredentials={onOpenSettingsCredentials}
      onOpenManualEditor={setManualJourney}
      onOpenManualRequest={() => setManualRequestOpen(true)}
    />
  )
}

export default CreateTestPage
