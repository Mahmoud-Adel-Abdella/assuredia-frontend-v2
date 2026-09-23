import test from "node:test"
import assert from "node:assert/strict"
import React from "react"
import "../../testdefinitions/__tests__/domEnvironment"
import { mount, cleanup } from "../../testdefinitions/__tests__/harness"
import { ClarificationView } from "../AiPlanViews"
import { normalizePlanClarification } from "../../../lib/planner"

test("ClarificationView regression (Case 6)", async (t) => {
  t.afterEach(() => {
    cleanup()
  })

  await t.test("ClarificationView receives actual question strings and renders them", async () => {
    const rawBackendPayload = {
      status: "NEEDS_CLARIFICATION",
      planId: "p-41",
      requestedType: "USER_JOURNEY",
      questions: ["Which account should be used?"],
      categories: ["MISSING_BUSINESS_OBJECTIVE"],
    }
    const normalized = normalizePlanClarification(rawBackendPayload)
    const questions = normalized.questions.map((q) => ({ ...q, answer: "" }))

    const view = await mount(
      React.createElement(ClarificationView, {
        questions,
        onContinue: () => {},
        onCancel: () => {},
      }),
    )

    // Verify question is visible in the container
    assert.ok(view.container.textContent?.includes("Which account should be used?"))
    assert.ok(view.container.textContent?.includes("Missing Objective"))

    // Verify input element has aria-label matching the question
    const input = view.container.querySelector<HTMLInputElement>("input[type='text']")
    assert.ok(input, "input element should exist")
    assert.equal(input?.getAttribute("aria-label"), "Which account should be used?")
  })

  await t.test("Regression reproduction: un-normalized string spread leaves item.question undefined", () => {
    // Demonstrates the exact bug prior to normalization:
    // If q is a raw string from backend, { ...q, answer: "" } spreads string into character indices
    const rawString = "Which account should be used?"
    const brokenItem = { ...(rawString as unknown as object), answer: "" } as unknown as {
      question?: string
      answer: string
      category?: string | null
    }
    assert.equal(brokenItem.question, undefined)
    assert.equal((brokenItem as Record<string, unknown>)["0"], "W")

    // In contrast, normalized question preserves question and category:
    const normalized = normalizePlanClarification({
      questions: [rawString],
      categories: ["MISSING_BUSINESS_OBJECTIVE"],
    })
    const fixedItem = { ...normalized.questions[0], answer: "" }
    assert.equal(fixedItem.question, "Which account should be used?")
    assert.equal((fixedItem as Record<string, unknown>)["0"], undefined)
  })
})
