import assert from "node:assert/strict"
import test from "node:test"

import { authoritativeUnreadCount, unreadOutsideFilter } from "./alerts"

type AlertLike = { id: string; isRead?: boolean }

const UNREAD_OLD: AlertLike = { id: "a1", isRead: false }
const UNREAD_NEW: AlertLike = { id: "a2", isRead: false }
const READ: AlertLike = { id: "a3", isRead: true }

test("authoritativeUnreadCount normalizes the server badge/page count", () => {
  assert.equal(authoritativeUnreadCount(7), 7)
  assert.equal(authoritativeUnreadCount(2.9), 2)
  assert.equal(authoritativeUnreadCount(-1), 0)
  assert.equal(authoritativeUnreadCount(Number.NaN), 0)
})

test("unreadOutsideFilter counts unread alerts hidden by the current filter", () => {
  const all = [UNREAD_OLD, UNREAD_NEW, READ]
  // A narrowed time filter shows only the fresh unread alert.
  const visible = [UNREAD_NEW, READ]
  assert.equal(unreadOutsideFilter(all, visible), 1)
})

test("unreadOutsideFilter returns zero when the filter hides nothing unread", () => {
  const all = [UNREAD_OLD, UNREAD_NEW, READ]
  assert.equal(unreadOutsideFilter(all, all), 0)
})

test("unreadOutsideFilter counts every unread alert when the filter hides all", () => {
  const all = [UNREAD_OLD, UNREAD_NEW, READ]
  assert.equal(unreadOutsideFilter(all, [READ]), 2)
})

test("unreadOutsideFilter is zero with no unread alerts at all", () => {
  const all = [READ]
  assert.equal(unreadOutsideFilter(all, []), 0)
})

test("unreadOutsideFilter treats alerts missing isRead as unread", () => {
  const legacy: AlertLike = { id: "a4" }
  assert.equal(unreadOutsideFilter([legacy], []), 1)
  assert.equal(unreadOutsideFilter([legacy], [legacy]), 0)
})
