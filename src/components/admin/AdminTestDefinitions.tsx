import React, { useCallback, useEffect, useState } from "react"
import { Card, ErrorState } from "../primitives"
import { useLang } from "../../lib/i18n"
import { useAuth } from "../../lib/auth"
import { apiClientList, type BackendClientListRow } from "../../lib/api"
import { mapTestDefinitionFailure } from "../../lib/testDefinitionLifecycle"
import { TestDefinitionsPage } from "../testdefinitions/TestDefinitionsPage"
import { FieldHint, FieldLabel, SelectInput } from "../testdefinitions/shared"

/**
 * Admin console entry for Test Definitions.
 *
 * An ADMIN identity has no tenant scope (`clientId` is null), while every Test
 * Definition route is addressed per client, so the console picks the environment
 * to work in first. There is no global "acting as client" context in the
 * dashboard, which is the same approach `AdminClients` takes.
 */
export function AdminTestDefinitions({ initialClientId, initialDefinitionId }: {
  initialClientId?: number | null
  initialDefinitionId?: number | null
} = {}) {
  const { t } = useLang()
  const { logout } = useAuth()

  const [clients, setClients] = useState<BackendClientListRow[] | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)
  const [selectedId, setSelectedId] = useState<number | null>(
    initialClientId ?? null,
  )

  const load = useCallback(async () => {
    setLoadError(null)
    try {
      const rows = await apiClientList()
      setClients(rows)
      setSelectedId((current) => {
        if (current != null && rows.some((row) => row.id === current))
          return current
        if (
          initialClientId != null &&
          rows.some((row) => row.id === initialClientId)
        )
          return initialClientId
        return rows[0]?.id ?? null
      })
    } catch (err) {
      const failure = mapTestDefinitionFailure(err)
      if (failure.kind === "unauthenticated") {
        logout()
        return
      }
      setLoadError(failure.message)
    }
  }, [logout])

  useEffect(() => {
    void load()
  }, [load, reloadKey])

  const selected = clients?.find((row) => row.id === selectedId) ?? null

  return (
    <div className="space-y-6">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-warning">
          {t("nav.adminConsole")}
        </p>
        <h1 className="mt-1 font-display text-2xl font-bold tracking-tight text-navy">
          {t("testdef.title")}
        </h1>
        <p className="mt-1 text-[13px] text-slate-500">
          {t("testdef.admin.subtitle")}
        </p>
      </div>

      <Card className="p-4">
        <div className="max-w-sm space-y-1.5">
          <FieldLabel htmlFor="admin-testdef-client">
            {t("testdef.admin.pickClient")}
          </FieldLabel>
          <SelectInput
            id="admin-testdef-client"
            value={selectedId == null ? "" : String(selectedId)}
            disabled={clients === null || clients.length === 0}
            onChange={(e) =>
              setSelectedId(
                e.target.value === "" ? null : Number(e.target.value),
              )
            }
          >
            {clients === null && (
              <option value="">{t("common.loading")}</option>
            )}
            {clients?.length === 0 && (
              <option value="">{t("testdef.admin.noClients")}</option>
            )}
            {(clients ?? []).map((row) => (
              <option key={row.id} value={String(row.id)}>
                {row.client_name}
              </option>
            ))}
          </SelectInput>
          <FieldHint>{t("testdef.admin.pickClientHint")}</FieldHint>
        </div>
      </Card>

      {loadError ? (
        <ErrorState
          title={t("testdef.admin.clientsFailed")}
          description={loadError}
          onRetry={() => setReloadKey((k) => k + 1)}
        />
      ) : selected ? (
        <TestDefinitionsPage
          /* Remount on tenant change so no list, draft or run leaks across clients. */
          key={`${selected.id}:${
            selected.id === initialClientId
              ? (initialDefinitionId ?? "list")
              : "list"
          }`}
          clientId={selected.id}
          clientName={selected.client_name}
          isAdmin
          onUnauthorized={logout}
          showPageHeader={false}
          initialDefinitionId={
            selected.id === initialClientId
              ? (initialDefinitionId ?? null)
              : null
          }
        />
      ) : clients !== null && clients.length === 0 ? (
        <Card className="flex items-center justify-center px-6 py-16">
          <p className="text-[13px] text-slate-400">
            {t("testdef.admin.noClients")}
          </p>
        </Card>
      ) : (
        <Card className="flex items-center justify-center px-6 py-16">
          <p role="status" className="text-[13px] text-slate-400">
            {t("common.loading")}
          </p>
        </Card>
      )}
    </div>
  )
}

export default AdminTestDefinitions
