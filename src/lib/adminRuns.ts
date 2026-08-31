import { apiAdminRuns } from "./api"
import { toHistoryEntry, type HistoryEntry } from "./runHistory"

/* ------------------------------------------------------------------ */
/* Admin Runs — single aggregate, real backend data                   */
/* ------------------------------------------------------------------ */
/*
 * GET /dashboard-api/admin/runs provides a server-side aggregate across all
 * clients in a single bounded request, eliminating the N+1 HTTP request pattern.
 *
 * It preserves identical run semantics:
 *   - PACKAGE rows arrive with their live_run_execution_items attached;
 *     child runs are NOT flattened into unrelated individual runs.
 *   - SINGLE rows belonging to a package execution are excluded server-side.
 *   - Raw statuses, trigger types, and timestamps map identically.
 */

/** One composed row: the shared view model plus the owning client. */
export type AdminRunRow = {
  entry: HistoryEntry
  clientId: number
  clientName: string
}

/**
 * Fetches newest runs across all clients via single aggregate API call.
 */
export async function fetchAdminRuns(limit = 200): Promise<AdminRunRow[]> {
  const rows = await apiAdminRuns(limit)
  const merged: AdminRunRow[] = []

  for (const row of rows) {
    const clientId = Number(row.client_id ?? row.clientId ?? 0)
    const clientName = String(row.client_name ?? row.clientName ?? "")
    const entry = toHistoryEntry(row, clientName)
    if (entry) {
      merged.push({ entry, clientId, clientName })
    }
  }

  merged.sort(
    (a, b) => (b.entry.meta.anchor?.getTime() ?? 0) - (a.entry.meta.anchor?.getTime() ?? 0),
  )
  return merged
}

