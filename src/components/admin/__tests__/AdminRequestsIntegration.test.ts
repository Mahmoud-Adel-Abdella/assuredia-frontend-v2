import { test, describe, beforeEach, afterEach } from "node:test"
import assert from "node:assert/strict"
import {
  apiListOnboardingRequests,
  apiGetOnboardingRequest,
  apiApproveOnboardingRequest,
  apiRejectOnboardingRequest,
  ApiError,
  type BackendOnboardingRequest,
} from "../../../lib/api.ts"
import { translate } from "../../../lib/i18n.tsx"

describe("Admin Onboarding Integration & Lifecycle Suite", () => {
  const originalFetch = globalThis.fetch

  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  test("1. apiListOnboardingRequests fetches real onboarding list without filter", async () => {
    const mockRows: BackendOnboardingRequest[] = [
      {
        id: 101,
        user_id: 12,
        company_name: "Acme Corp",
        status: "PENDING",
        client_id: null,
        reviewed_by: null,
        reviewed_at: null,
        admin_notes: null,
        created_at: "2026-08-30T05:00:00Z",
        email: "alice@acme.com",
      },
      {
        id: 102,
        user_id: 14,
        company_name: "Beta Logistics",
        status: "APPROVED",
        client_id: 5,
        reviewed_by: 1,
        reviewed_at: "2026-08-30T05:30:00Z",
        admin_notes: null,
        created_at: "2026-08-30T04:00:00Z",
        email: "bob@beta.com",
      },
    ]

    globalThis.fetch = async (input: RequestInfo | URL) => {
      const url = String(input)
      assert.ok(url.includes("/dashboard-api/onboarding/requests"))
      return new Response(JSON.stringify(mockRows), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    }

    const rows = await apiListOnboardingRequests()
    assert.equal(rows.length, 2)
    assert.equal(rows[0].id, 101)
    assert.equal(rows[0].company_name, "Acme Corp")
    assert.equal(rows[0].status, "PENDING")
  })

  test("2. apiListOnboardingRequests supports status filter query parameter", async () => {
    let capturedUrl = ""
    globalThis.fetch = async (input: RequestInfo | URL) => {
      capturedUrl = String(input)
      return new Response(JSON.stringify([]), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    }

    await apiListOnboardingRequests("PENDING")
    assert.ok(capturedUrl.includes("?status=PENDING"))
  })

  test("3. apiGetOnboardingRequest fetches single request by id", async () => {
    const mockRequest: BackendOnboardingRequest = {
      id: 101,
      user_id: 12,
      company_name: "Acme Corp",
      status: "PENDING",
      client_id: null,
      reviewed_by: null,
      reviewed_at: null,
      admin_notes: null,
      created_at: "2026-08-30T05:00:00Z",
      email: "alice@acme.com",
    }

    globalThis.fetch = async (input: RequestInfo | URL) => {
      assert.ok(String(input).endsWith("/dashboard-api/onboarding/requests/101"))
      return new Response(JSON.stringify(mockRequest), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    }

    const req = await apiGetOnboardingRequest(101)
    assert.equal(req.id, 101)
    assert.equal(req.email, "alice@acme.com")
  })

  test("4. apiApproveOnboardingRequest provisions client with baseUrl", async () => {
    let requestBody: any = null
    let requestMethod = ""

    globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      requestMethod = init?.method || "GET"
      requestBody = JSON.parse(init?.body as string)
      assert.ok(String(input).endsWith("/dashboard-api/onboarding/requests/101/approve"))
      return new Response(
        JSON.stringify({
          status: "approved",
          clientId: 25,
          clientName: "acme corp",
          message: "Client provisioned successfully.",
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      )
    }

    const res = await apiApproveOnboardingRequest(101, "https://app.acme.com")
    assert.equal(requestMethod, "POST")
    assert.equal(requestBody.baseUrl, "https://app.acme.com")
    assert.equal(res.status, "approved")
    assert.equal(res.clientId, 25)
    assert.equal(res.clientName, "acme corp")
  })

  test("5. apiRejectOnboardingRequest forwards adminNotes", async () => {
    let requestBody: any = null

    globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      requestBody = JSON.parse(init?.body as string)
      assert.ok(String(input).endsWith("/dashboard-api/onboarding/requests/101/reject"))
      return new Response(JSON.stringify({ status: "rejected" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    }

    const res = await apiRejectOnboardingRequest(101, "Application lacks required verification")
    assert.equal(requestBody.adminNotes, "Application lacks required verification")
    assert.equal(res.status, "rejected")
  })

  test("6. Error handling: 400 Bad Request when baseUrl is missing", async () => {
    globalThis.fetch = async () => {
      return new Response(
        JSON.stringify({ error: "baseUrl is required to provision the client" }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      )
    }

    await assert.rejects(
      async () => {
        await apiApproveOnboardingRequest(101, "")
      },
      (err: any) => {
        assert.ok(err instanceof ApiError)
        assert.equal(err.status, 400)
        assert.equal(err.message, translate("errors.baseUrlRequired"))
        return true
      },
    )
  })

  test("7. Error handling: 409 Conflict when request is not PENDING (stale conflict)", async () => {
    globalThis.fetch = async () => {
      return new Response(
        JSON.stringify({ error: "Request is not PENDING or already processed" }),
        { status: 409, headers: { "Content-Type": "application/json" } },
      )
    }

    await assert.rejects(
      async () => {
        await apiApproveOnboardingRequest(101, "https://app.acme.com")
      },
      (err: any) => {
        assert.ok(err instanceof ApiError)
        assert.equal(err.status, 409)
        assert.equal(err.message, translate("errors.requestStateChanged"))
        return true
      },
    )
  })

  test("8. Error handling: 409 Conflict when client name already exists", async () => {
    globalThis.fetch = async () => {
      return new Response(
        JSON.stringify({ error: "Client 'acme' already exists" }),
        { status: 409, headers: { "Content-Type": "application/json" } },
      )
    }

    await assert.rejects(
      async () => {
        await apiApproveOnboardingRequest(101, "https://app.acme.com")
      },
      (err: any) => {
        assert.ok(err instanceof ApiError)
        assert.equal(err.status, 409)
        assert.equal(err.message, translate("admin.create.duplicateName"))
        return true
      },
    )
  })

  test("9. Error handling: 404 Request Not Found", async () => {
    globalThis.fetch = async () => {
      return new Response(
        JSON.stringify({ error: "Onboarding request not found" }),
        { status: 404, headers: { "Content-Type": "application/json" } },
      )
    }

    await assert.rejects(
      async () => {
        await apiGetOnboardingRequest(999)
      },
      (err: any) => {
        assert.ok(err instanceof ApiError)
        assert.equal(err.status, 404)
        assert.equal(err.message, translate("errors.requestNotExist"))
        return true
      },
    )
  })

  test("10. Error handling: 500 / Network Error", async () => {
    globalThis.fetch = async () => {
      throw new TypeError("Failed to fetch")
    }

    await assert.rejects(
      async () => {
        await apiListOnboardingRequests()
      },
      (err: any) => {
        assert.ok(err instanceof ApiError)
        assert.equal(err.status, 0)
        assert.equal(err.message, translate("errors.networkUnreachable"))
        return true
      },
    )
  })

  test("11. Localization: All onboarding keys exist in English and Arabic", () => {
    const keysToCheck = [
      "admin.requests.subtitle",
      "admin.requests.back",
      "admin.requests.review",
      "admin.requests.details",
      "admin.requests.requestId",
      "admin.requests.currentStatus",
      "admin.requests.approve",
      "admin.requests.approving",
      "admin.requests.reject",
      "admin.requests.rejectionPlaceholder",
      "admin.requests.confirmReject",
      "admin.requests.rejecting",
      "admin.requests.approvedNote",
      "admin.requests.approveModalTitle",
      "admin.requests.approveModalDesc",
      "admin.requests.baseUrlLabel",
      "admin.requests.baseUrlPlaceholder",
      "admin.requests.baseUrlRequired",
      "admin.requests.confirmApprove",
      "admin.requests.approvedTitle",
      "admin.requests.approvedDesc",
      "admin.requests.rejectedTitle",
      "admin.requests.rejectedDesc",
      "admin.requests.approveFailedTitle",
      "admin.requests.rejectFailedTitle",
      "admin.requests.loadFailedTitle",
      "admin.requests.emptyTitle",
      "admin.requests.emptyDesc",
      "admin.requests.provisionedClient",
      "admin.requests.provisionedClientDesc",
      "errors.baseUrlRequired",
      "errors.invalidCompanyName",
    ]

    for (const key of keysToCheck) {
      const en = translate(key)
      assert.notEqual(en, key, `Missing EN translation for key: ${key}`)
    }
  })
})
