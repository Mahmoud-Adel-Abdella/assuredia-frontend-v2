/**
 * Alerts filtering helpers (pure — unit-tested in alerts.test.ts).
 */

/**
 * How many unread alerts the current filter hides (live-test F-9).
 *
 * The unread badge counts every unread alert, but a narrowed filter (e.g.
 * "Last 24 hours") can hide older unread rows, making the page look like
 * nothing needs attention. This comparison drives the "unread outside the
 * current filter" banner so hidden attention items stay visible as a count.
 */
/**
 * The server count is authoritative for the page summary and shell badge.
 * Keep the normalization in one pure helper so both surfaces share the same
 * non-negative integer contract even when the bounded list is filtered.
 */
export function authoritativeUnreadCount(value: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0
}

export function unreadOutsideFilter<T extends { isRead?: boolean }>(
  all: readonly T[],
  visible: readonly T[],
): number {
  const visibleIds = new Set(visible)
  let hidden = 0
  for (const alert of all) {
    if (alert.isRead) continue
    if (!visibleIds.has(alert)) hidden += 1
  }
  return hidden
}
