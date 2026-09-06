import test from "node:test"
import assert from "node:assert/strict"
import {
  formatDefinitionSource,
  parseDefinitionSource,
  starterDefinitionSource,
  validateDefinitionDocument,
  validateDefinitionSource,
} from "../../../lib/testDefinitionSchema"
import { VALID_SOURCE } from "./fixtures"

function pointers(findings: { jsonPointer: string }[]): string[] {
  return findings.map((f) => f.jsonPointer)
}

test("Test Definition schema pre-check", async (t) => {
  await t.test("6. Invalid JSON is reported as a syntax finding, not a thrown error", () => {
    const parsed = parseDefinitionSource('{ "schemaVersion": "1.0", }')
    assert.equal(parsed.ok, false)
    if (parsed.ok) return
    assert.equal(parsed.finding.ruleId, "FE-JSON-SYNTAX")
    assert.equal(parsed.finding.code, "SCHEMA_INVALID")

    const empty = parseDefinitionSource("   ")
    assert.equal(empty.ok, false)
    if (!empty.ok) assert.equal(empty.finding.ruleId, "FE-JSON-EMPTY")

    const result = validateDefinitionSource("not json at all")
    assert.equal(result.valid, false)
    assert.equal(result.errors.length, 1)
    assert.equal(result.warnings.length, 0)
  })

  await t.test("7a. A document matching schema 1.0 is accepted", () => {
    const result = validateDefinitionSource(VALID_SOURCE)
    assert.equal(result.valid, true, `unexpected errors: ${JSON.stringify(result.errors)}`)
    assert.equal(result.errors.length, 0)
  })

  await t.test("7b. Missing required roots are each reported with a pointer", () => {
    const result = validateDefinitionDocument({ metadata: { name: "x" } })
    assert.equal(result.valid, false)
    const messages = result.errors.map((e) => e.message).join(" | ")
    assert.match(messages, /steps is required/)
    assert.match(messages, /expectedOutcomes is required/)
    assert.ok(
      result.errors.some((e) => e.jsonPointer === "/schemaVersion" && e.code === "UNSUPPORTED_SCHEMA_VERSION"),
      "an absent schemaVersion must be reported against /schemaVersion",
    )
  })

  await t.test("7c. An unknown action is reported as UNKNOWN_ACTION at the action node", () => {
    const result = validateDefinitionDocument({
      schemaVersion: "1.0",
      metadata: { name: "x" },
      steps: [{ action: "ui.teleport" }],
      expectedOutcomes: [{ action: "ui.assertVisible", locator: { strategy: "css", value: "body" } }],
    })
    assert.equal(result.valid, false)
    const finding = result.errors.find((e) => e.jsonPointer === "/steps/0/action")
    assert.ok(finding, `expected a finding at /steps/0/action, got ${JSON.stringify(pointers(result.errors))}`)
    assert.equal(finding?.code, "UNKNOWN_ACTION")
  })

  await t.test("7d. Unknown fields are rejected, matching unevaluatedProperties: false", () => {
    const result = validateDefinitionDocument({
      schemaVersion: "1.0",
      metadata: { name: "x" },
      steps: [{ action: "ui.navigate", url: "/a", retries: 3 }],
      expectedOutcomes: [{ action: "ui.assertVisible", locator: { strategy: "css", value: "body" } }],
      extras: {},
    })
    assert.equal(result.valid, false)
    assert.ok(pointers(result.errors).includes("/steps/0/retries"))
    assert.ok(pointers(result.errors).includes("/extras"))
  })

  await t.test("7e. ui.wait enforces the duration / locatorState split", () => {
    const both = validateDefinitionDocument({
      schemaVersion: "1.0",
      metadata: { name: "x" },
      steps: [{ action: "ui.wait", for: "duration", durationMs: 200, state: "visible" }],
      expectedOutcomes: [{ action: "ui.assertVisible", locator: { strategy: "css", value: "body" } }],
    })
    assert.equal(both.valid, false)
    assert.ok(pointers(both.errors).includes("/steps/0/state"))

    const outOfRange = validateDefinitionDocument({
      schemaVersion: "1.0",
      metadata: { name: "x" },
      steps: [{ action: "ui.wait", for: "duration", durationMs: 99 }],
      expectedOutcomes: [{ action: "ui.assertVisible", locator: { strategy: "css", value: "body" } }],
    })
    assert.equal(outOfRange.valid, false)
    assert.ok(pointers(outOfRange.errors).includes("/steps/0/durationMs"))

    const locatorState = validateDefinitionDocument({
      schemaVersion: "1.0",
      metadata: { name: "x" },
      steps: [
        { action: "ui.wait", for: "locatorState", state: "visible", locator: { strategy: "testId", value: "cart" } },
      ],
      expectedOutcomes: [{ action: "ui.assertVisible", locator: { strategy: "css", value: "body" } }],
    })
    assert.equal(locatorState.valid, true, JSON.stringify(locatorState.errors))
  })

  await t.test("7f. Locator strategy branches and one-level scoping are enforced", () => {
    const missingValue = validateDefinitionDocument({
      schemaVersion: "1.0",
      metadata: { name: "x" },
      steps: [{ action: "ui.click", locator: { strategy: "testId" } }],
      expectedOutcomes: [{ action: "ui.assertVisible", locator: { strategy: "css", value: "body" } }],
    })
    assert.ok(pointers(missingValue.errors).includes("/steps/0/locator/value"))

    const nested = validateDefinitionDocument({
      schemaVersion: "1.0",
      metadata: { name: "x" },
      steps: [
        {
          action: "ui.click",
          locator: {
            strategy: "text",
            value: "Pay",
            within: { strategy: "testId", value: "cart", within: { strategy: "css", value: "body" } },
          },
        },
      ],
      expectedOutcomes: [{ action: "ui.assertVisible", locator: { strategy: "css", value: "body" } }],
    })
    assert.ok(
      nested.errors.some((e) => e.ruleId === "FE-LOCATOR-NESTING"),
      "a scoping locator may not itself be scoped",
    )
  })

  await t.test("7g. css and placeholder strategies warn without blocking", () => {
    const result = validateDefinitionSource(VALID_SOURCE.replace('"strategy": "testId"', '"strategy": "css"'))
    assert.equal(result.valid, true)
    assert.ok(result.warnings.some((w) => w.ruleId === "FE-WEAK-LOCATOR"))
    assert.ok(result.warnings.every((w) => w.code === null), "warnings never carry a reason code")
  })

  await t.test("7h. Duplicate step ids are reported once, against the later step", () => {
    const result = validateDefinitionDocument({
      schemaVersion: "1.0",
      metadata: { name: "x" },
      steps: [
        { action: "ui.navigate", url: "/a", id: "go" },
        { action: "ui.navigate", url: "/b", id: "go" },
      ],
      expectedOutcomes: [{ action: "ui.assertVisible", locator: { strategy: "css", value: "body" } }],
    })
    const duplicates = result.errors.filter((e) => e.ruleId === "FE-DUPLICATE-ID")
    assert.equal(duplicates.length, 1)
    assert.equal(duplicates[0].jsonPointer, "/steps/1/id")
  })

  await t.test("7i. expectedOutcomes accepts assertions only", () => {
    const result = validateDefinitionDocument({
      schemaVersion: "1.0",
      metadata: { name: "x" },
      steps: [{ action: "ui.navigate", url: "/a" }],
      expectedOutcomes: [{ action: "ui.click", locator: { strategy: "css", value: "body" } }],
    })
    assert.equal(result.valid, false)
    assert.equal(result.errors[0].jsonPointer, "/expectedOutcomes/0/action")
  })

  await t.test("7j. The starter document the engine seeds is itself valid", () => {
    const starter = starterDefinitionSource('Odd "name"\nwith control chars')
    const result = validateDefinitionSource(starter)
    assert.equal(result.valid, true, JSON.stringify(result.errors))
    const parsed = JSON.parse(starter) as { metadata: { name: string } }
    assert.ok(!parsed.metadata.name.includes('"'))
    assert.ok(!parsed.metadata.name.includes("\n"))
  })

  await t.test("7k. Formatting re-indents valid JSON and refuses invalid JSON", () => {
    assert.equal(formatDefinitionSource("{invalid"), null)
    const formatted = formatDefinitionSource('{"schemaVersion":"1.0"}')
    assert.equal(formatted, '{\n  "schemaVersion": "1.0"\n}\n')
  })
})
