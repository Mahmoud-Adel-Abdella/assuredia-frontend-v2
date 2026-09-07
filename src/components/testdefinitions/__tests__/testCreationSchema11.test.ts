import test from "node:test"
import assert from "node:assert/strict"
import {
  resolveSaveSchemaVersion,
  starterDefinitionSource,
  validateDefinitionSource,
} from "../../../lib/testDefinitionSchema"

function validApiDoc() {
  return JSON.parse(starterDefinitionSource("API starter", "API"))
}

function validMixedDoc() {
  return JSON.parse(starterDefinitionSource("Mixed starter", "MIXED"))
}

test("PR10A Schema 1.1: journey starters, validation, and save-version safety", async (t) => {
  await t.test("UI starter stays Schema 1.0 and valid", () => {
    const starter = starterDefinitionSource("Checkout flow", "UI")
    const parsed = JSON.parse(starter) as { schemaVersion: string }
    assert.equal(parsed.schemaVersion, "1.0")
    const result = validateDefinitionSource(starter)
    assert.equal(result.valid, true, JSON.stringify(result.errors))
  })

  await t.test(
    "API starter is valid Schema 1.1 with native api actions",
    () => {
      const starter = starterDefinitionSource("Health API", "API")
      const parsed = JSON.parse(starter) as { schemaVersion: string }
      assert.equal(parsed.schemaVersion, "1.1")
      assert.ok(starter.includes("api.request"))
      assert.ok(starter.includes("api.assertStatus"))
      const result = validateDefinitionSource(starter)
      assert.equal(result.valid, true, JSON.stringify(result.errors))
    },
  )

  await t.test(
    "Mixed starter is valid Schema 1.1 with ordered UI and API steps",
    () => {
      const starter = starterDefinitionSource("Token to portal", "MIXED")
      assert.ok(starter.indexOf("api.request") < starter.indexOf("ui.navigate"))
      const result = validateDefinitionSource(starter)
      assert.equal(result.valid, true, JSON.stringify(result.errors))
    },
  )

  await t.test("Schema 1.0 rejects native api actions", () => {
    const doc = {
      schemaVersion: "1.0",
      metadata: { name: "API in 1.0" },
      steps: [{ action: "api.request", method: "GET", url: "/api/v1/health" }],
      expectedOutcomes: [{ action: "api.assertStatus", expected: 200 }],
    }
    const result = validateDefinitionSource(JSON.stringify(doc))
    assert.equal(result.valid, false)
    assert.ok(result.errors.some((e) => e.code === "UNKNOWN_ACTION"))
  })

  await t.test(
    "Schema 1.1 accepts a valid api.request with optional fields",
    () => {
      const doc = validApiDoc()
      doc.steps[0] = {
        action: "api.request",
        method: "POST",
        url: "https://api.example.com/api/v1/orders",
        headers: { "Content-Type": "application/json" },
        query: { page: "1" },
        body: '{"item":"book"}',
        contentType: "application/json",
        timeoutMs: 5000,
      }
      const result = validateDefinitionSource(JSON.stringify(doc))
      assert.equal(result.valid, true, JSON.stringify(result.errors))
    },
  )

  await t.test("Schema 1.1 accepts every supported API assertion", () => {
    const doc = validApiDoc()
    doc.expectedOutcomes = [
      { action: "api.assertStatus", expected: 201, matcher: "greaterOrEqual" },
      {
        action: "api.assertHeader",
        header: "X-Request-Id",
        expected: "req-",
        matcher: "startsWith",
      },
      { action: "api.assertJsonPath", path: "$.order.id", expected: 42 },
      { action: "api.assertResponseTime", maxDurationMs: 1500 },
    ]
    const result = validateDefinitionSource(JSON.stringify(doc))
    assert.equal(result.valid, true, JSON.stringify(result.errors))
  })

  await t.test(
    "Schema 1.1 accepts a valid api.extract with sensitive flag",
    () => {
      const doc = validApiDoc()
      doc.steps[1] = {
        action: "api.extract",
        jsonPath: "$.token",
        variable: "authToken",
        sensitive: true,
      }
      const result = validateDefinitionSource(JSON.stringify(doc))
      assert.equal(result.valid, true, JSON.stringify(result.errors))
    },
  )

  await t.test("Schema 1.1 rejects malformed API actions", () => {
    const cases: Array<{
      label: string
      mutate: (doc: any) => void
      pointer: string
    }> = [
      {
        label: "bad method",
        mutate: (doc) => {
          doc.steps[0].method = "FETCH"
        },
        pointer: "/steps/0/method",
      },
      {
        label: "missing url",
        mutate: (doc) => {
          delete doc.steps[0].url
        },
        pointer: "/steps/0/url",
      },
      {
        label: "bad url scheme",
        mutate: (doc) => {
          doc.steps[0].url = "ftp://files.example.com/x"
        },
        pointer: "/steps/0/url",
      },
      {
        label: "bad jsonPath",
        mutate: (doc) => {
          doc.steps[1].jsonPath = "status"
        },
        pointer: "/steps/1/jsonPath",
      },
      {
        label: "bad variable",
        mutate: (doc) => {
          doc.steps[1].variable = "${extracted.x}"
        },
        pointer: "/steps/1/variable",
      },
      {
        label: "status out of range",
        mutate: (doc) => {
          doc.expectedOutcomes[0].expected = 99
        },
        pointer: "/expectedOutcomes/0/expected",
      },
      {
        label: "bad header name",
        mutate: (doc) => {
          doc.expectedOutcomes[1].header = "X Bad!"
        },
        pointer: "/expectedOutcomes/1/header",
      },
      {
        label: "bad matcher",
        mutate: (doc) => {
          doc.expectedOutcomes[1].matcher = "regex"
        },
        pointer: "/expectedOutcomes/1/matcher",
      },
      {
        label: "bad response time",
        mutate: (doc) => {
          doc.expectedOutcomes[3].maxDurationMs = 0
        },
        pointer: "/expectedOutcomes/3/maxDurationMs",
      },
      {
        label: "unknown field",
        mutate: (doc) => {
          doc.steps[0].retries = 3
        },
        pointer: "/steps/0/retries",
      },
    ]
    for (const { label, mutate, pointer } of cases) {
      const doc = validApiDoc()
      mutate(doc)
      const result = validateDefinitionSource(JSON.stringify(doc))
      assert.equal(result.valid, false, `${label} must be rejected`)
      assert.ok(
        result.errors.some((e) => e.jsonPointer === pointer),
        `${label}: expected a finding at ${pointer}, got ${JSON.stringify(result.errors.map((e) => e.jsonPointer))}`,
      )
    }
  })

  await t.test("Schema 1.1 accepts a valid Mixed definition", () => {
    const result = validateDefinitionSource(JSON.stringify(validMixedDoc()))
    assert.equal(result.valid, true, JSON.stringify(result.errors))
  })

  await t.test("Unknown actions stay rejected under 1.1", () => {
    const doc = validMixedDoc()
    doc.steps.push({ action: "api.teleport", method: "GET", url: "/x" })
    const result = validateDefinitionSource(JSON.stringify(doc))
    assert.equal(result.valid, false)
    assert.ok(result.errors.some((e) => e.code === "UNKNOWN_ACTION"))
  })

  await t.test("Unsupported schema versions are rejected", () => {
    const doc = validApiDoc()
    doc.schemaVersion = "2.0"
    const result = validateDefinitionSource(JSON.stringify(doc))
    assert.equal(result.valid, false)
    assert.ok(result.errors.some((e) => e.jsonPointer === "/schemaVersion"))
  })

  await t.test(
    "save resolves the edited source version and blocks downgrade",
    () => {
      assert.deepEqual(
        resolveSaveSchemaVersion({ schemaVersion: "1.0" }, "1.0"),
        {
          ok: true,
          schemaVersion: "1.0",
        },
      )
      assert.deepEqual(
        resolveSaveSchemaVersion({ schemaVersion: "1.1" }, "1.1"),
        {
          ok: true,
          schemaVersion: "1.1",
        },
      )
      assert.deepEqual(
        resolveSaveSchemaVersion({ schemaVersion: "1.1" }, "1.0"),
        {
          ok: true,
          schemaVersion: "1.1",
        },
      )
      const downgrade = resolveSaveSchemaVersion(
        { schemaVersion: "1.0" },
        "1.1",
      )
      assert.equal(downgrade.ok, false)
      const unsupported = resolveSaveSchemaVersion(
        { schemaVersion: "2.0" },
        "1.1",
      )
      assert.equal(unsupported.ok, false)
      const missing = resolveSaveSchemaVersion({}, "1.0")
      assert.equal(missing.ok, false)
    },
  )
})
