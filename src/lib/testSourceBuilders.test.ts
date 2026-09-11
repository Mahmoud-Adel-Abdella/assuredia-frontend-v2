import test from "node:test"
import assert from "node:assert/strict"
import type { DiscoveredElement } from "./discovery"
import {
  buildAPIEditorSourceJson,
  buildDiscoverySourceJson,
  buildUIEditorSourceJson,
  type APIConfig,
  type UIAction,
} from "./testSourceBuilders"
import { validateDefinitionSource } from "./testDefinitionSchema"

function parseValid(source: string): any {
  const result = validateDefinitionSource(source)
  assert.equal(result.valid, true, JSON.stringify(result.errors))
  return JSON.parse(source)
}

const discovered = (
  role: string,
  strategy: "role" | "label" | "text" = "role",
): DiscoveredElement => ({
  elementId: `e-${role}`,
  role,
  name: `${role} name`,
  attributes: { disabled: "false" },
  locatorCandidates: [
    {
      strategy,
      value: `${role} candidate`,
      strength: strategy === "role" ? "STRONG" : "MEDIUM",
      state: "UNVERIFIED",
    },
    {
      strategy: "text",
      value: "ignored second candidate",
      strength: "MEDIUM",
      state: "UNVERIFIED",
    },
  ],
})

test("PR10B Schema 1.1 source builders", async (t) => {
  await t.test(
    "builds discovery steps with role locators and valid outcomes",
    () => {
      const elements = [
        discovered("textbox"),
        discovered("combobox", "label"),
        discovered("checkbox"),
        discovered("button"),
        discovered("heading"),
      ]
      const before = structuredClone(elements)
      const doc = parseValid(
        buildDiscoverySourceJson(
          "Discovered journey",
          "Preserve this description",
          "https://app.example.test/path",
          elements,
        ),
      )

      assert.deepEqual(elements, before, "builder must preserve caller state")
      assert.equal(doc.schemaVersion, "1.1")
      assert.deepEqual(doc.metadata, {
        name: "Discovered journey",
        description: "Preserve this description",
      })
      assert.deepEqual(
        doc.steps.map((step: any) => step.action),
        [
          "ui.navigate",
          "ui.fill",
          "ui.select",
          "ui.check",
          "ui.click",
          "ui.hover",
        ],
      )
      assert.deepEqual(doc.steps[1].locator, {
        strategy: "role",
        role: "textbox",
        name: "textbox name",
      })
      assert.deepEqual(doc.steps[2].locator, {
        strategy: "label",
        value: "combobox candidate",
      })
      assert.equal(doc.steps[1].value, "")
      assert.equal(doc.steps[2].value, "")
      assert.deepEqual(doc.expectedOutcomes, [
        { action: "ui.assertUrl", expected: "https://app.example.test" },
      ])
    },
  )

  await t.test("uses safe discovery fallbacks and required arrays", () => {
    const noCandidate = discovered("CUSTOM ROLE")
    noCandidate.locatorCandidates = []
    const doc = parseValid(
      buildDiscoverySourceJson("Fallbacks", "", "javascript:alert(1)", [
        noCandidate,
      ]),
    )
    assert.deepEqual(doc.steps[0], { action: "ui.navigate", url: "/" })
    assert.deepEqual(doc.steps[1].locator, {
      strategy: "role",
      role: "customrole",
      name: "CUSTOM ROLE name",
    })
    assert.ok(doc.steps.length >= 1)
    assert.ok(doc.expectedOutcomes.length >= 1)
  })

  await t.test("maps every supported UI editor action", () => {
    const types: UIAction["type"][] = [
      "navigate",
      "click",
      "type",
      "select",
      "check",
      "wait",
      "scroll",
    ]
    const actions: UIAction[] = types.map((type, index) => ({
      id: String(index),
      type,
      target: type === "navigate" ? "/orders" : `${type} target`,
      value:
        type === "wait"
          ? "750"
          : type === "type" || type === "select"
            ? ""
            : undefined,
      expectedResult: index === 1 ? "Clicked content" : undefined,
    }))
    const before = structuredClone(actions)
    const doc = parseValid(
      buildUIEditorSourceJson("UI editor", "Details", actions),
    )

    assert.deepEqual(actions, before, "builder must preserve editor state")
    assert.deepEqual(
      doc.steps.map((step: any) => step.action),
      [
        "ui.navigate",
        "ui.click",
        "ui.fill",
        "ui.select",
        "ui.check",
        "ui.wait",
        "ui.hover",
      ],
    )
    assert.deepEqual(doc.steps[5], {
      action: "ui.wait",
      for: "duration",
      durationMs: 750,
    })
    assert.equal(doc.steps[2].value, "")
    assert.equal(doc.steps[3].value, "")
    assert.deepEqual(doc.expectedOutcomes[0], {
      action: "ui.assertText",
      locator: { strategy: "text", value: "click target" },
      expected: "Clicked content",
    })
  })

  await t.test("keeps empty UI editor output schema-valid", () => {
    const doc = parseValid(buildUIEditorSourceJson("Empty UI", "", []))
    assert.equal(doc.steps.length, 1)
    assert.equal(doc.expectedOutcomes.length, 1)
  })

  await t.test(
    "builds API request and only schema-valid API assertions",
    () => {
      const config: APIConfig = {
        method: "POST",
        endpoint: "api/orders",
        queryParams: [
          { id: "q1", key: "page", value: "1" },
          { id: "q2", key: "", value: "ignored" },
        ],
        headers: [{ id: "h1", key: "Accept", value: "application/json" }],
        body: '{"item":"book"}',
        expectedStatus: "201",
        assertions: [
          { id: "a1", field: "$.order.id", operator: "eq", value: "42" },
          { id: "a2", field: "status", operator: "contains", value: "created" },
          { id: "a3", field: "$.order", operator: "exists" },
        ],
      }
      const before = structuredClone(config)
      const doc = parseValid(
        buildAPIEditorSourceJson("API editor", "Details", config),
      )

      assert.deepEqual(config, before, "builder must preserve editor state")
      assert.deepEqual(doc.steps, [
        {
          action: "api.request",
          method: "POST",
          url: "/api/orders",
          headers: { Accept: "application/json" },
          query: { page: "1" },
          body: '{"item":"book"}',
        },
      ])
      assert.deepEqual(
        doc.expectedOutcomes.map((outcome: any) => outcome.action),
        [
          "api.assertStatus",
          "api.assertJsonPath",
          "api.assertJsonPath",
          "api.assertJsonPath",
        ],
      )
      assert.equal(doc.expectedOutcomes[0].expected, 201)
      assert.equal(doc.expectedOutcomes[1].expected, 42)
      assert.equal(doc.expectedOutcomes[2].path, "$.status")
      assert.equal(doc.expectedOutcomes[3].matcher, "exists")
    },
  )

  await t.test("omits an empty API body and supplies required outcomes", () => {
    const doc = parseValid(
      buildAPIEditorSourceJson("Health", "", {
        method: "GET",
        endpoint: "/health",
        body: "   ",
        assertions: [],
      }),
    )
    assert.equal("body" in doc.steps[0], false)
    assert.deepEqual(
      doc.expectedOutcomes.map((outcome: any) => outcome.action),
      ["api.assertStatus", "api.assertJsonPath"],
    )
  })
})
