import test from "node:test"
import assert from "node:assert/strict"
import { apiAlertsUnreadCount, ApiError } from "../../../lib/api"

test("Admin Alerts Unread Count & Integration Suite", async (t) => {
  const originalFetch = globalThis.fetch

  t.afterEach(() => {
    globalThis.fetch = originalFetch
  })

  await t.test("1. apiAlertsUnreadCount calls GET /dashboard-api/alerts/unread-count and returns real count", async () => {
    let calledUrl = ""
    globalThis.fetch = async (input: RequestInfo | URL) => {
      calledUrl = String(input)
      return new Response(JSON.stringify({ count: 7 }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    }

    const { count } = await apiAlertsUnreadCount()
    assert.match(calledUrl, /\/dashboard-api\/alerts\/unread-count/)
    assert.equal(count, 7)
  })

  await t.test("2. apiAlertsUnreadCount handles zero unread state accurately", async () => {
    globalThis.fetch = async () => {
      return new Response(JSON.stringify({ count: 0 }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    }

    const { count } = await apiAlertsUnreadCount()
    assert.equal(count, 0)
  })

  await t.test("3. Error handling: 401 Unauthorized", async () => {
    globalThis.fetch = async () => {
      return new Response(JSON.stringify({ error: "Session expired" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      })
    }

    await assert.rejects(async () => {
      await apiAlertsUnreadCount()
    }, (err: unknown) => {
      assert.ok(err instanceof ApiError)
      assert.equal(err.status, 401)
      return true
    })
  })

  await t.test("4. Error handling: 500 Network failure", async () => {
    globalThis.fetch = async () => {
      return new Response(JSON.stringify({ error: "Internal server error" }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      })
    }

    await assert.rejects(async () => {
      await apiAlertsUnreadCount()
    }, (err: unknown) => {
      assert.ok(err instanceof ApiError)
      assert.equal(err.status, 500)
      return true
    })
  })
})
