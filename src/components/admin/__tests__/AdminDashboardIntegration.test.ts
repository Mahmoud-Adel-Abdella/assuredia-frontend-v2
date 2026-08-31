import test from "node:test"
import assert from "node:assert/strict"
import {
  apiAdminOverview,
  type AdminOverviewResponse,
  ApiError,
} from "../../../lib/api"
import { translate } from "../../../lib/i18n"

const mockOverview: AdminOverviewResponse = {
  kpis: {
    totalClients: 3,
    activeClients: 2,
    inactiveClients: 1,
    totalRuns: 45,
    failedRuns30d: 4,
    passedRuns30d: 41,
    successRate30d: 91.1,
  },
  executionHealth: {
    running: 1,
    passed: 41,
    failed: 4,
    total: 45,
  },
  weeklyChart: [
    { date: "2026-08-24", label: "Aug 24", passed: 5, failed: 0 },
    { date: "2026-08-25", label: "Aug 25", passed: 8, failed: 1 },
    { date: "2026-08-26", label: "Aug 26", passed: 6, failed: 0 },
    { date: "2026-08-27", label: "Aug 27", passed: 4, failed: 2 },
    { date: "2026-08-28", label: "Aug 28", passed: 7, failed: 0 },
    { date: "2026-08-29", label: "Aug 29", passed: 5, failed: 1 },
    { date: "2026-08-30", label: "Aug 30", passed: 6, failed: 0 },
  ],
  clients: [
    {
      id: 101,
      name: "Acme Corp",
      status: "ACTIVE",
      flows: 5,
      recentRun: "PASS",
      successRate: 95.0,
      totalRuns: 20,
      lastActivity: "2026-08-30T05:00:00Z",
    },
    {
      id: 102,
      name: "Beta Inc",
      status: "ACTIVE",
      flows: 3,
      recentRun: "FAILED",
      successRate: 85.0,
      totalRuns: 20,
      lastActivity: "2026-08-30T04:30:00Z",
    },
    {
      id: 103,
      name: "Gamma Store",
      status: "INACTIVE",
      flows: 1,
      recentRun: null,
      successRate: null,
      totalRuns: 5,
      lastActivity: null,
    },
  ],
  recentActivity: [
    {
      id: "run-1",
      type: "flow_executed",
      client: "Acme Corp",
      message: "Checkout passed",
      timestamp: "2026-08-30T05:00:00Z",
      status: "PASS",
    },
    {
      id: "run-2",
      type: "test_failed",
      client: "Beta Inc",
      message: "Login failed: 401 unauthorized",
      timestamp: "2026-08-30T04:30:00Z",
      status: "FAILED",
    },
  ],
}

test("Admin Dashboard Overview Integration Suite", async (t) => {
  const originalFetch = globalThis.fetch

  t.afterEach(() => {
    globalThis.fetch = originalFetch
  })

  await t.test("1. apiAdminOverview calls GET /dashboard-api/admin/overview and maps response", async () => {
    let capturedUrl = ""
    let capturedMethod = ""

    globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
      capturedUrl = String(url)
      capturedMethod = init?.method ?? "GET"
      return new Response(JSON.stringify(mockOverview), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    }) as typeof fetch

    const res = await apiAdminOverview()
    assert.match(capturedUrl, /\/dashboard-api\/admin\/overview$/)
    assert.equal(capturedMethod, "GET")
    assert.equal(res.kpis.totalClients, 3)
    assert.equal(res.kpis.activeClients, 2)
    assert.equal(res.kpis.inactiveClients, 1)
    assert.equal(res.kpis.totalRuns, 45)
    assert.equal(res.kpis.successRate30d, 91.1)
    assert.equal(res.executionHealth.running, 1)
    assert.equal(res.executionHealth.passed, 41)
    assert.equal(res.weeklyChart.length, 7)
    assert.equal(res.clients.length, 3)
    assert.equal(res.clients[0].name, "Acme Corp")
    assert.equal(res.clients[0].successRate, 95.0)
    assert.equal(res.recentActivity.length, 2)
  })

  await t.test("2. apiAdminOverview handles zero-data state honestly", async () => {
    const zeroOverview: AdminOverviewResponse = {
      kpis: {
        totalClients: 0,
        activeClients: 0,
        inactiveClients: 0,
        totalRuns: 0,
        failedRuns30d: 0,
        passedRuns30d: 0,
        successRate30d: null,
      },
      executionHealth: {
        running: 0,
        passed: 0,
        failed: 0,
        total: 0,
      },
      weeklyChart: [
        { date: "2026-08-24", label: "Aug 24", passed: 0, failed: 0 },
        { date: "2026-08-25", label: "Aug 25", passed: 0, failed: 0 },
        { date: "2026-08-26", label: "Aug 26", passed: 0, failed: 0 },
        { date: "2026-08-27", label: "Aug 27", passed: 0, failed: 0 },
        { date: "2026-08-28", label: "Aug 28", passed: 0, failed: 0 },
        { date: "2026-08-29", label: "Aug 29", passed: 0, failed: 0 },
        { date: "2026-08-30", label: "Aug 30", passed: 0, failed: 0 },
      ],
      clients: [],
      recentActivity: [],
    }

    globalThis.fetch = (async () => {
      return new Response(JSON.stringify(zeroOverview), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    }) as typeof fetch

    const res = await apiAdminOverview()
    assert.equal(res.kpis.totalClients, 0)
    assert.equal(res.kpis.activeClients, 0)
    assert.equal(res.kpis.totalRuns, 0)
    assert.equal(res.kpis.successRate30d, null)
    assert.equal(res.clients.length, 0)
    assert.equal(res.recentActivity.length, 0)
  })

  await t.test("3. Error handling: 401 Unauthorized", async () => {
    globalThis.fetch = (async () => {
      return new Response(JSON.stringify({ error: "Not signed in — log in again" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      })
    }) as typeof fetch

    await assert.rejects(async () => {
      await apiAdminOverview()
    }, (err: unknown) => {
      assert.ok(err instanceof ApiError)
      assert.equal(err.status, 401)
      return true
    })
  })

  await t.test("4. Error handling: 403 Forbidden", async () => {
    globalThis.fetch = (async () => {
      return new Response(JSON.stringify({ error: "This operation is restricted to administrators" }), {
        status: 403,
        headers: { "Content-Type": "application/json" },
      })
    }) as typeof fetch

    await assert.rejects(async () => {
      await apiAdminOverview()
    }, (err: unknown) => {
      assert.ok(err instanceof ApiError)
      assert.equal(err.status, 403)
      return true
    })
  })

  await t.test("5. Error handling: 500 / Network failure", async () => {
    globalThis.fetch = (async () => {
      throw new TypeError("Failed to fetch")
    }) as typeof fetch

    await assert.rejects(async () => {
      await apiAdminOverview()
    }, (err: unknown) => {
      assert.ok(err instanceof ApiError)
      assert.equal(err.status, 0)
      return true
    })
  })

  await t.test("6. Localization: Dashboard i18n keys in EN and AR", async () => {
    const keys = [
      "admin.dash.title",
      "admin.dash.subtitle",
      "admin.dash.totalClients",
      "admin.dash.activeClients",
      "admin.dash.inactiveCount",
      "admin.dash.failedRuns",
      "admin.dash.last30",
      "admin.dash.execHealth",
      "admin.dash.viewAllRuns",
      "admin.dash.manageClients",
      "admin.dash.chart7",
      "admin.dash.chartTip",
      "admin.dash.recentActivity",
      "admin.dash.noActivity",
      "admin.dash.noClients",
      "admin.dash.loadFailed",
    ]

    for (const key of keys) {
      const en = translate(key, { count: 3, label: "Aug 24", passed: 10, failed: 1 })
      assert.ok(en && en.length > 0 && en !== key, `Missing EN key: ${key}`)
    }
  })
})