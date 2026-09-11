import React, { useState } from "react"
import { Button, Card } from "./primitives"
import { useLang } from "../lib/i18n"
import { TestCreationWizard } from "./testcreation/TestCreationWizard"
import { DiscoveryFlow } from "./testcreation/DiscoveryFlow"
import { ManualEditorFlow } from "./testcreation/ManualEditorFlow"
import { AiBuilderPage } from "./planner/AiBuilderPage"

type Method = "home" | "ai" | "discovery" | "manual-request" | "manual-editor"

type CreateTestPageProps = {
  clientId: number
  onOpenDefinition: (id: number) => void
  onViewDrafts: () => void
  onViewRequests: () => void
  onUnauthorized: () => void
}

export function CreateTestPage({
  clientId,
  onOpenDefinition,
  onViewDrafts,
  onViewRequests,
  onUnauthorized,
}: CreateTestPageProps) {
  const { t } = useLang()
  const [method, setMethod] = useState<Method>("home")

  if (method === "ai") {
    return (
      <AiBuilderPage
        clientId={clientId}
        onOpenDefinition={onOpenDefinition}
        onViewDrafts={onViewDrafts}
        onViewRequests={onViewRequests}
        onUnauthorized={onUnauthorized}
      />
    )
  }
  if (method === "discovery") {
    return (
      <DiscoveryFlow
        clientId={clientId}
        onBack={() => setMethod("home")}
        onOpenDefinition={onOpenDefinition}
        onViewDrafts={onViewDrafts}
        onUnauthorized={onUnauthorized}
      />
    )
  }
  if (method === "manual-editor") {
    return (
      <ManualEditorFlow
        clientId={clientId}
        onBack={() => setMethod("home")}
        onOpenDefinition={onOpenDefinition}
        onViewDrafts={onViewDrafts}
        onUnauthorized={onUnauthorized}
      />
    )
  }
  if (method === "manual-request") {
    return (
      <TestCreationWizard
        clientId={clientId}
        initialMethod="MANUAL_REQUEST"
        onExit={() => setMethod("home")}
        onViewRequests={onViewRequests}
        onOpenDefinition={onOpenDefinition}
        onUnauthorized={onUnauthorized}
      />
    )
  }

  const options = [
    {
      key: "discovery" as const,
      title: t("pr10b.methods.discovery.title"),
      description: t("pr10b.methods.discovery.description"),
      action: t("pr10b.methods.discovery.action"),
      variant: "primary" as const,
    },
    {
      key: "manual-request" as const,
      title: t("pr10b.methods.request.title"),
      description: t("pr10b.methods.request.description"),
      action: t("pr10b.methods.request.action"),
      variant: "secondary" as const,
    },
    {
      key: "manual-editor" as const,
      title: t("pr10b.methods.editor.title"),
      description: t("pr10b.methods.editor.description"),
      action: t("pr10b.methods.editor.action"),
      variant: "secondary" as const,
    },
  ]

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400">
            {t("pr10b.eyebrow")}
          </p>
          <h1 className="mt-1 font-display text-2xl font-bold tracking-tight text-navy">
            {t("pr10b.title")}
          </h1>
          <p className="mt-1 text-sm text-slate-500">{t("pr10b.subtitle")}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="ghost" onClick={onViewRequests}>
            {t("pr10b.actions.viewRequests")}
          </Button>
          <Button size="sm" variant="ghost" onClick={onViewDrafts}>
            {t("pr10b.success.viewDrafts")}
          </Button>
        </div>
      </div>
      <Card className="flex flex-col gap-4 p-6 sm:flex-row sm:items-center">
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-brand-400">
            {t("pr10c.page.eyebrow")}
          </p>
          <h2 className="mt-1 font-display text-lg font-bold text-navy">
            {t("pr10c.home.aiTitle")}
          </h2>
          <p className="mt-1 text-sm leading-6 text-slate-500">
            {t("pr10c.home.aiDescription")}
          </p>
        </div>
        <Button
          className="w-full sm:w-auto"
          variant="primary"
          onClick={() => setMethod("ai")}
        >
          {t("pr10c.home.aiAction")}
        </Button>
      </Card>
      <div className="grid gap-4 lg:grid-cols-3">
        {options.map((option) => (
          <Card key={option.key} className="flex flex-col p-6">
            <h2 className="font-display text-lg font-bold text-navy">
              {option.title}
            </h2>
            <p className="mt-2 flex-1 text-sm leading-6 text-slate-500">
              {option.description}
            </p>
            <Button
              className="mt-5 w-full"
              variant={option.variant}
              onClick={() => setMethod(option.key)}
            >
              {option.action}
            </Button>
          </Card>
        ))}
      </div>
    </div>
  )
}

export default CreateTestPage
