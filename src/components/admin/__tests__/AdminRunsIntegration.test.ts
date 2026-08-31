import test from "node:test"
import assert from "node:assert/strict"
import { fetchAdminRuns } from "../../../lib/adminRuns"
import { ApiError, type DashboardRun } from "../../../lib/api"

const mockAdminRuns: DashboardRun[] = [
  {
    id: 101,
    client_id: 1,
    client_name: "Alpha Corp",
    flow_id: 11,
    flow_name: "Login Flow",
    status: "PASS",
    browser: "Chrome",
    env: "Production",
    total: 5,
    passed: 5,
    failed: 0,
    skipped: 0,
    duration_seconds: 12,
    timestamp: "2026-08-30T04:00:00Z",
    client_timezone: "UTC",
    run_id: "run-101",
    ai_report: null,
    error_message: null,
    trigger_source: "DIRECT",
    source: "DIRECT",
    type: "SINGLE",
  },
  {
    id: "pkg-201",
    run_id: "pkg-201",
    client_id: 2,
    client_name: "Beta Ltd",
    executionId: "pkg-201",
    flow_name: "Nightly Regression",
    name: "Nightly Regression",
    status: "FAILED",
    browser: "PACKAGE",
    env: "LIVE PACKAGE",
    total: 10,
    passed: 8,
    failed: 2,
    skipped: 0,
    timestamp: "2026-08-30T05:00:00Z",
    trigger_source: "SCHEDULED",
    source: "SCHEDULED",
    type: "PACKAGE",
    packageId: "pkg-201",
    packageName: "Nightly Regression",
    packageItems: [],
  },
]

test("Admin Runs Scalability & Integration Suite", async (t) => {
  const originalFetch = globalThis.fetch

  t.afterEach(() => {
    globalThis.fetch = originalFetch
  })

  await t.test("1. fetchAdminRuns executes exactly 1 HTTP request (no N+1 per-client requests)", async () => {
    let httpCallCount = 0
    let capturedUrl = ""

    globalThis.fetch = (async (url: string | URL | Request) => {
      httpCallCount++
      capturedUrl = String(url)
      return new Response(JSON.stringify(mockAdminRuns), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    }) as typeof fetch

    const rows = await fetchAdminRuns(200)

    assert.equal(httpCallCount, 1, "Must make exactly 1 HTTP request")
    assert.match(capturedUrl, /\/dashboard-api\/admin\/runs\?limit=200$/)
    assert.equal(rows.length, 2)

    // Verify ordering: newest first (pkg-201 at 05:00 before run-101 at 04:00)
    assert.equal(rows[0].entry.run.id, "pkg-201")
    assert.equal(rows[0].clientId, 2)
    assert.equal(rows[0].clientName, "Beta Ltd")
    assert.equal(rows[0].entry.run.status, "FAILED")
    assert.equal(rows[0].entry.run.trigger, "Scheduled")

    assert.equal(rows[1].entry.run.id, "run-101")
    assert.equal(rows[1].clientId, 1)
    assert.equal(rows[1].clientName, "Alpha Corp")
    assert.equal(rows[1].entry.run.status, "PASS")
    assert.equal(rows[1].entry.run.trigger, "Manual")
  })

  await t.test("2. fetchAdminRuns handles zero data cleanly", async () => {
    let httpCallCount = 0

    globalThis.fetch = (async () => {
      httpCallCount++
      return new Response(JSON.stringify([]), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    }) as typeof fetch

    const rows = await fetchAdminRuns(200)
    assert.equal(httpCallCount, 1)
    assert.equal(rows.length, 0)
  })

  await t.test("3. Error handling: 401 Unauthorized", async () => {
    globalThis.fetch = (async () => {
      return new Response(JSON.stringify({ error: "Session expired" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      })
    }) as typeof fetch

    await assert.rejects(async () => {
      await fetchAdminRuns(200)
    }, (err: unknown) => {
      assert.ok(err instanceof ApiError)
      assert.equal(err.status, 401)
      return true
    })
  })

  await t.test("4. Error handling: 403 Forbidden", async () => {
    globalThis.fetch = (async () => {
      return new Response(JSON.stringify({ error: "Restricted to administrators" }), {
        status: 403,
        headers: { "Content-Type": "application/json" },
      })
    }) as typeof fetch

    await assert.rejects(async () => {
      await fetchAdminRuns(200)
    }, (err: unknown) => {
      assert.ok(err instanceof ApiError)
      assert.equal(err.status, 403)
      return true
    })
  })
})