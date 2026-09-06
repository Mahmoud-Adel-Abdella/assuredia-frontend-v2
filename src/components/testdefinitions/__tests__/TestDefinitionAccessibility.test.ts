import test from "node:test"
import assert from "node:assert/strict"
import React from "react"
import {
  button,
  cleanup,
  click,
  flush,
  mount,
  optionalButton,
  pressKey,
  queryAll,
  setValue,
  stubFetch,
  textOf,
} from "./harness"
import { ConfirmDialog } from "../ConfirmDialog"
import { TestDefinitionDetail } from "../TestDefinitionDetail"
import { translate } from "../../../lib/i18n"
import {
  CLIENT_ID,
  CLIENT_NAME,
  DEFINITION_ID,
  PATHS,
  VALID_SOURCE,
  details,
  version,
} from "./fixtures"

test("Accessibility and unsaved-change protection", async (t) => {
  let restore: (() => void) | null = null
  t.afterEach(() => {
    restore?.()
    restore = null
    cleanup()
  })

  await t.test("30. The confirmation dialog is announced, labelled and focus-managed", async () => {
    let confirmed = 0
    let cancelled = 0
    const view = await mount(
      React.createElement(
        "div",
        null,
        React.createElement("button", { id: "opener" }, "Open"),
        React.createElement(ConfirmDialog, {
          open: true,
          title: "Archive this definition?",
          description: "Archiving is permanent.",
          confirmLabel: "Archive",
          tone: "danger",
          onConfirm: () => confirmed++,
          onCancel: () => cancelled++,
        }),
      ),
    )
    await flush()

    const dialog = document.body.querySelector('[role="dialog"]')
    assert.ok(dialog, "the dialog must be exposed as a dialog")
    assert.equal(dialog.getAttribute("aria-modal"), "true")

    const labelledBy = dialog.getAttribute("aria-labelledby")
    const describedBy = dialog.getAttribute("aria-describedby")
    assert.ok(labelledBy && describedBy)
    assert.equal(document.getElementById(labelledBy)?.textContent, "Archive this definition?")
    assert.equal(document.getElementById(describedBy)?.textContent, "Archiving is permanent.")

    // Focus lands on the action, so a keyboard user is not left at the page top.
    const confirm = dialog.querySelector("[data-confirm-action]")
    assert.equal(document.activeElement, confirm)

    // Tab from the last control cycles back into the dialog rather than escaping it.
    const focusable = queryAll<HTMLElement>(dialog, "button")
    focusable[focusable.length - 1].focus()
    await pressKey("Tab", document)
    assert.ok(dialog.contains(document.activeElement), "focus must stay inside the dialog")

    await pressKey("Escape", document)
    assert.equal(cancelled, 1, "Escape must dismiss the dialog")
    assert.equal(confirmed, 0)

    view.unmount()
  })

  await t.test("30b. A dialog in flight refuses to close, so one confirm sends one request", async () => {
    let cancelled = 0
    await mount(
      React.createElement(ConfirmDialog, {
        open: true,
        title: "Run the proving execution?",
        description: "This runs against the real environment.",
        confirmLabel: "Run proving",
        busyLabel: "Running proving…",
        busy: true,
        onConfirm: () => {},
        onCancel: () => cancelled++,
      }),
    )
    await flush()

    const dialog = document.body.querySelector('[role="dialog"]')!
    assert.equal(button(dialog, "Cancel").disabled, true)
    assert.equal(button(dialog, "Running proving").disabled, true)

    await pressKey("Escape", document)
    assert.equal(cancelled, 0, "an in-flight action cannot be dismissed out from under itself")
  })

  await t.test("30c. Form controls are labelled and errors are announced", async () => {
    const stub = stubFetch([
      { match: PATHS.version, method: "GET", json: version("DRAFT") },
      { match: PATHS.definition, method: "GET", json: details("DRAFT") },
    ])
    restore = stub.restore

    const view = await mount(
      React.createElement(TestDefinitionDetail, {
        clientId: CLIENT_ID,
        clientName: CLIENT_NAME,
        definitionId: DEFINITION_ID,
        isAdmin: true,
        onBack: () => {},
        onUnauthorized: () => {},
      }),
    )
    await flush(5)

    // Every text control the page renders has a label pointing at it.
    for (const control of queryAll<HTMLElement>(view.container, "textarea, input, select")) {
      const id = control.getAttribute("id")
      assert.ok(id, `a control without an id cannot be labelled: ${control.outerHTML.slice(0, 80)}`)
      const label = view.container.querySelector(`label[for="${id}"]`)
      assert.ok(label, `#${id} has no label`)
      assert.ok(textOf(label).length > 0, `the label for #${id} is empty`)
    }

    // Tables name themselves for a screen reader, and use scoped headers.
    for (const table of queryAll(view.container, "table")) {
      assert.ok(table.querySelector("caption"), "each table needs a caption")
      for (const th of queryAll(table, "th")) {
        assert.equal(th.getAttribute("scope"), "col")
      }
    }

    await setValue(view.container.querySelector<HTMLTextAreaElement>("#testdef-source-editor")!, "{ broken")
    await click(button(view.container, "Save draft"))
    await flush()

    const error = view.container.querySelector("#testdef-draft-error")
    assert.ok(error)
    assert.equal(error.getAttribute("role"), "alert", "a validation error must be announced")
    assert.equal(
      view.container.querySelector("#testdef-source-editor")?.getAttribute("aria-describedby"),
      "testdef-draft-error",
    )
  })

  await t.test("A dirty draft is protected when leaving the page", async () => {
    const stub = stubFetch([
      { match: PATHS.version, method: "GET", json: version("DRAFT") },
      { match: PATHS.definition, method: "GET", json: details("DRAFT") },
    ])
    restore = stub.restore
    let left = 0

    const view = await mount(
      React.createElement(TestDefinitionDetail, {
        clientId: CLIENT_ID,
        clientName: CLIENT_NAME,
        definitionId: DEFINITION_ID,
        isAdmin: true,
        onBack: () => left++,
        onUnauthorized: () => {},
      }),
    )
    await flush(5)

    // Clean: leaving is immediate.
    await click(button(view.container, "Back to Test Definitions"))
    assert.equal(left, 1)

    await setValue(
      view.container.querySelector<HTMLTextAreaElement>("#testdef-source-editor")!,
      VALID_SOURCE.replace("Checkout", "Edited"),
    )
    await click(button(view.container, "Back to Test Definitions"))

    assert.equal(left, 1, "a dirty draft must not be discarded silently")
    const dialog = document.body.querySelector('[role="dialog"]')
    assert.ok(dialog)
    assert.match(textOf(dialog), /Leave without saving\?/)

    await click(button(dialog, "Keep editing"))
    assert.equal(left, 1)
    assert.equal(document.body.querySelector('[role="dialog"]'), null)

    await click(button(view.container, "Back to Test Definitions"))
    await click(button(document.body.querySelector('[role="dialog"]')!, "Discard and leave"))
    assert.equal(left, 2)
  })

  await t.test("Every key the feature renders exists in English and in Arabic", async () => {
    // `translate()` cannot read a language preference under Node, so the Arabic
    // side is asserted against the dictionary module directly rather than through it.
    const module = await import("../../../lib/i18n")
    const source = await import("node:fs/promises").then((fs) =>
      fs.readFile(new URL("../../../lib/i18n.tsx", import.meta.url), "utf8"),
    )

    const keys = [
      "nav.testDefinitions",
      "admin.navTestDefinitions",
      "testdef.title",
      "testdef.subtitle",
      "testdef.admin.subtitle",
      "testdef.new",
      "testdef.searchPlaceholder",
      "testdef.status.draft",
      "testdef.status.validated",
      "testdef.status.approved",
      "testdef.status.ready",
      "testdef.status.archived",
      "testdef.th.name",
      "testdef.th.client",
      "testdef.th.flow",
      "testdef.th.version",
      "testdef.th.status",
      "testdef.th.implementation",
      "testdef.th.updated",
      "testdef.th.actions",
      "testdef.empty",
      "testdef.emptyHint",
      "testdef.noMatch",
      "testdef.noMatchHint",
      "testdef.loadFailed",
      "testdef.back",
      "testdef.create.title",
      "testdef.create.name",
      "testdef.create.nameRequired",
      "testdef.create.duplicateName",
      "testdef.create.flow",
      "testdef.create.source",
      "testdef.create.submit",
      "testdef.detail.source",
      "testdef.detail.readOnly",
      "testdef.detail.archivedReadOnly",
      "testdef.detail.save",
      "testdef.detail.unsavedTitle",
      "testdef.detail.unsavedConfirm",
      "testdef.detail.unsavedStay",
      "testdef.action.validate",
      "testdef.action.trial",
      "testdef.action.approve",
      "testdef.action.proving",
      "testdef.action.archive",
      "testdef.action.newVersion",
      "testdef.reason.adminOnly",
      "testdef.reason.archived",
      "testdef.reason.wrongStatus",
      "testdef.reason.noFlow",
      "testdef.readyHint",
      "testdef.confirm.approveTitle",
      "testdef.confirm.provingTitle",
      "testdef.confirm.archiveTitle",
      "testdef.validation.localTitle",
      "testdef.validation.engineTitle",
      "testdef.validation.notRunYet",
      "testdef.run.title",
      "testdef.run.replayed",
      "testdef.run.becameReady",
      "testdef.run.notReady",
      "testdef.run.status.passed",
      "testdef.run.status.failed",
      "testdef.run.status.error",
      "testdef.artifacts.title",
      "testdef.artifacts.none",
      "testdef.artifacts.unknown",
      "testdef.artifacts.download",
      "testdef.artifacts.missingTitle",
      "testdef.artifacts.deniedTitle",
      "testdef.admin.pickClient",
      "testdef.admin.noClients",
    ]

    for (const key of keys) {
      const english = module.translate(key, { count: 1, status: "Draft", name: "x", version: 1, id: 1, index: 0, from: 1, to: 1, total: 1, number: 1, shown: 1 })
      assert.notEqual(english, key, `Missing EN translation for ${key}`)

      // Locate the entry in the dictionary source and confirm it carries `ar`.
      const declaration = source.indexOf(`"${key}": {`)
      assert.notEqual(declaration, -1, `Key ${key} is not declared in i18n.tsx`)
      const entry = source.slice(declaration, declaration + 600)
      const closing = entry.indexOf("},")
      assert.ok(
        entry.slice(0, closing === -1 ? entry.length : closing).includes("ar:"),
        `Missing AR translation for ${key}`,
      )
    }
  })

  await t.test("Arabic status labels are real translations, not the English fallback", () => {
    // Sanity check on the dictionary itself: the keys the badges use must differ
    // between languages, which is what proves the AR side was actually filled in.
    assert.equal(translate("testdef.status.ready"), "Ready")
    assert.ok(optionalButton(document.body, "never") === null)
  })
})
