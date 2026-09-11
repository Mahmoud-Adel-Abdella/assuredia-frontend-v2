import test from "node:test"
import assert from "node:assert/strict"
import { ApiError, apiRunDiscovery } from "./api"
import {
  DISCOVERY_CLIENT_TIMEOUT_MS,
  DISCOVERY_ERROR_MESSAGES,
  DiscoveryError,
  type DiscoveryFailureToken,
  failureTokenToI18nKey,
  normalizeDiscoveryResult,
} from "./discovery"

type CapturedRequest = {
  url: string
  method: string
  headers: Record<string, string>
  body: unknown
  signal?: AbortSignal | null
}

type StubResponse = {
  status?: number
  json: unknown
}

function stubFetch(
  responder: (request: CapturedRequest) => StubResponse,
): CapturedRequest[] {
  const calls: CapturedRequest[] = []
  globalThis.fetch = ((async (input: unknown, init?: RequestInit) => {
    const request: CapturedRequest = {
      url: String(input),
      method: init?.method ?? "GET",
      headers: { ...(init?.headers as Record<string, string> ?? {}) },
      body: typeof init?.body === "string" ? JSON.parse(init.body) : undefined,
      signal: init?.signal,
    }
    calls.push(request)
    const response = responder(request)
    return new Response(JSON.stringify(response.json), {
      status: response.status ?? 200,
      headers: { "Content-Type": "application/json" },
    })
  }) as typeof fetch)
  return calls
}

const completedResult = {
  sessionId: "correlation-only-123",
  status: "COMPLETED" as const,
  origin: "https://example.test",
  truncated: false,
  pages: [
    {
      url: "https://example.test/login",
      title: "Sign in",
      elements: [
        {
          elementId: "email",
          role: "textbox",
          name: "Email",
          attributes: { type: "email" },
          locatorCandidates: [
            {
              strategy: "label" as const,
              value: "Email",
              strength: "STRONG" as const,
              state: "UNVERIFIED" as const,
            },
          ],
        },
      ],
    },
  ],
}

test("Discovery synchronous runtime handler", async (t) => {
  const originalFetch = globalThis.fetch
  t.afterEach(() => {
    globalThis.fetch = originalFetch
  })

  await t.test(
    "sends one authenticated-contract POST with an empty body",
    async () => {
      const calls = stubFetch(() => ({ json: completedResult }))

      const result = await apiRunDiscovery(42)

      assert.deepEqual(result, completedResult)
      assert.equal(calls.length, 1)
      assert.match(calls[0].url, /\/dashboard-api\/clients\/42\/discovery$/)
      assert.equal(calls[0].method, "POST")
      assert.deepEqual(calls[0].body, {})
      assert.equal(calls[0].headers.Accept, "application/json")
      assert.equal(calls[0].headers["Content-Type"], "application/json")
      assert.ok(calls[0].signal instanceof AbortSignal)
    },
  )

  await t.test(
    "preserves a completed discovery result without using sessionId",
    async () => {
      stubFetch(() => ({ json: completedResult }))

      const result = await apiRunDiscovery(7)

      assert.equal(result.sessionId, "correlation-only-123")
      assert.equal(
        result.pages?.[0].elements[0].locatorCandidates[0].state,
        "UNVERIFIED",
      )
      assert.equal(result.truncated, false)
    },
  )

  await t.test(
    "turns every HTTP 200 failure token into DiscoveryError",
    async () => {
      const tokens: DiscoveryFailureToken[] = [
        "mcp_unavailable",
        "mcp_initialization_failed",
        "mcp_navigation_failed",
        "mcp_snapshot_failed",
        "mcp_call_timeout",
        "client_configuration_invalid",
        "origin_rejected",
        "discovery_failed",
      ]

      for (const token of tokens) {
        stubFetch(() => ({
          json: {
            sessionId: "correlation-only",
            status: "FAILED",
            origin: "https://example.test",
            failureReason: token,
          },
        }))

        await assert.rejects(
          () => apiRunDiscovery(7),
          (error: unknown) => {
            assert.ok(error instanceof DiscoveryError)
            assert.equal(error.token, token)
            assert.equal(error.isTimeout, false)
            return true
          },
        )
      }
    },
  )

  await t.test(
    "falls back safely when a failed body omits its token",
    async () => {
      stubFetch(() => ({
        json: {
          sessionId: "correlation-only",
          status: "FAILED",
          origin: "https://example.test",
        },
      }))

      await assert.rejects(
        () => apiRunDiscovery(7),
        (error: unknown) =>
          error instanceof DiscoveryError && error.token === "discovery_failed",
      )
    },
  )

  await t.test("keeps controller-level failures as ApiError", async () => {
    for (const status of [400, 401, 403, 404, 503]) {
      stubFetch(() => ({ status, json: { error: `controller-${status}` } }))

      await assert.rejects(
        () => apiRunDiscovery(7),
        (error: unknown) => {
          assert.ok(error instanceof ApiError)
          assert.equal(error.status, status)
          assert.deepEqual(error.body, { error: `controller-${status}` })
          return true
        },
      )
    }
  })

  await t.test(
    "maps the client timeout to a timeout DiscoveryError",
    async () => {
      const originalSetTimeout = globalThis.setTimeout
      const originalClearTimeout = globalThis.clearTimeout
      let scheduledDelay: number | undefined

      globalThis.setTimeout = (((callback: () => void, delay?: number) => {
        scheduledDelay = delay
        queueMicrotask(callback)
        return 1 as unknown as ReturnType<typeof setTimeout>
      }) as typeof setTimeout)
      globalThis.clearTimeout = ((() => undefined) as typeof clearTimeout)
      globalThis.fetch = (((_input: unknown, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => {
            reject(new DOMException("Aborted", "AbortError"))
          })
        })) as typeof fetch)

      try {
        await assert.rejects(
          () => apiRunDiscovery(7),
          (error: unknown) => {
            assert.ok(error instanceof DiscoveryError)
            assert.equal(error.token, "mcp_call_timeout")
            assert.equal(error.isTimeout, true)
            return true
          },
        )
        assert.equal(scheduledDelay, DISCOVERY_CLIENT_TIMEOUT_MS)
      } finally {
        globalThis.setTimeout = originalSetTimeout
        globalThis.clearTimeout = originalClearTimeout
      }
    },
  )

  await t.test(
    "normalizes only COMPLETED results to one page with safe defaults",
    () => {
      assert.deepEqual(normalizeDiscoveryResult(completedResult), {
        origin: "https://example.test",
        pageTitle: "Sign in",
        pageUrl: "https://example.test/login",
        elements: completedResult.pages[0].elements,
        truncated: false,
      })
      assert.deepEqual(
        normalizeDiscoveryResult({
          sessionId: "empty",
          status: "COMPLETED",
          origin: "https://empty.test",
        }),
        {
          origin: "https://empty.test",
          pageUrl: "https://empty.test",
          pageTitle: "",
          elements: [],
          truncated: false,
        },
      )
      assert.throws(
        () =>
          normalizeDiscoveryResult({
            sessionId: "bad",
            status: "RUNNING" as never,
            origin: "https://example.test",
          }),
        (error: unknown) =>
          error instanceof DiscoveryError && error.token === "discovery_failed",
      )
    },
  )

  await t.test("exports the exact customer-safe English messages", () => {
    assert.deepEqual(DISCOVERY_ERROR_MESSAGES, {
      mcp_unavailable: "Discovery is not available right now.",
      mcp_initialization_failed: "Discovery could not start.",
      mcp_navigation_failed: "Could not reach the target application.",
      mcp_snapshot_failed: "Could not read the page structure.",
      mcp_call_timeout: "Discovery took too long. Try again.",
      origin_rejected: "The target application origin is not allowed.",
      client_configuration_invalid:
        "Target URL is not configured. Configure it in Settings.",
      discovery_failed: "Discovery failed. Try again.",
    })
  })

  await t.test(
    "rejects nonterminal or malformed HTTP 200 statuses safely",
    async () => {
      for (const status of ["REQUESTED", "RUNNING", "UNKNOWN", undefined]) {
        stubFetch(() => ({
          json: {
            sessionId: "correlation-only",
            status,
            origin: "https://example.test",
          },
        }))
        await assert.rejects(
          () => apiRunDiscovery(7),
          (error: unknown) =>
            error instanceof DiscoveryError &&
            error.token === "discovery_failed",
        )
      }
    },
  )

  await t.test("maps failure tokens to stable translation keys", () => {
    assert.equal(
      failureTokenToI18nKey("mcp_snapshot_failed"),
      "discovery.errors.mcp_snapshot_failed",
    )
  })
})
