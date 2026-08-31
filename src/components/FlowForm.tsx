import React, { useCallback, useEffect, useRef, useState } from "react"
import { Button, Card, Spinner, cx, useToast } from "./primitives"
import { ApiError, apiFlowTests } from "../lib/api"
import { translate, useLang } from "../lib/i18n"
import { flowDisplayId, toFlowTests } from "../lib/flowsData"
import type { Flow, FlowTest } from "../lib/flowsData"

export type { Flow, FlowTest, FlowStatus } from "../lib/flowsData"

/* ------------------------------------------------------------------ */
/* Field primitives                                                   */
/* ------------------------------------------------------------------ */
function Label({ htmlFor, children, required }: { htmlFor: string; children: React.ReactNode; required?: boolean }) {
  return (
    <label htmlFor={htmlFor} className="mb-1.5 flex items-center gap-1 text-[12px] font-semibold text-slate-500">
      {children}
      {required && <span className="text-error">*</span>}
    </label>
  )
}

function FieldError({ msg }: { msg?: string }) {
  if (!msg) return null
  return (
    <p className="mt-1 flex items-center gap-1 text-[11px] text-error">
      <svg className="size-3 shrink-0" viewBox="0 0 20 20" fill="currentColor">
        <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" />
      </svg>
      {msg}
    </p>
  )
}

function TextInput({ id, value, onChange, placeholder, error, disabled }: { id: string; value: string; onChange: (v: string) => void; placeholder?: string; error?: string; disabled?: boolean }) {
  return (
    <div>
      <input
        id={id}
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        className={cx(
          "block w-full rounded-lg border bg-elevated px-3.5 py-2.5 text-[13px] text-slate-700 placeholder-slate-400 transition-colors focus:outline-none focus:ring-2 focus:ring-brand-400 disabled:cursor-not-allowed disabled:opacity-60",
          error ? "border-red-400" : "border-slate-200",
        )}
      />
      <FieldError msg={error} />
    </div>
  )
}

function TextArea({ id, value, onChange, placeholder, rows = 3, disabled }: { id: string; value: string; onChange: (v: string) => void; placeholder?: string; rows?: number; disabled?: boolean }) {
  return (
    <textarea
      id={id}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      rows={rows}
      disabled={disabled}
      className="block w-full rounded-lg border border-slate-200 bg-elevated px-3.5 py-2.5 text-[13px] text-slate-700 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-400 resize-none disabled:cursor-not-allowed disabled:opacity-60"
    />
  )
}

/* ------------------------------------------------------------------ */
/* Test item in the flow list                                         */
/* ------------------------------------------------------------------ */
function TestRow({ test, onRemove, onEdit }: { test: FlowTest; onRemove: () => void; onEdit: () => void }) {
  const { t } = useLang()
  return (
    <div className="group flex items-center gap-3 rounded-lg border border-slate-100 bg-slate-50/60 px-3.5 py-2.5 transition-colors hover:border-slate-200">
      <span className="flex size-6 shrink-0 items-center justify-center rounded-md bg-emerald-50 text-success">
        <svg className="size-3.5" viewBox="0 0 20 20" fill="currentColor">
          <path fillRule="evenodd" d="M16.7 5.3a1 1 0 010 1.4l-7.5 7.5a1 1 0 01-1.4 0L3.3 9.7a1 1 0 011.4-1.4l3.1 3.1 6.8-6.8a1 1 0 011.4 0z" />
        </svg>
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate font-mono text-[13px] font-medium text-slate-700">{test.name}</p>
        <p className="text-[11px] text-slate-400">{test.suite}</p>
      </div>
      <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
        <button
          onClick={onEdit}
          className="flex size-7 items-center justify-center rounded-md text-slate-400 hover:bg-brand-50 hover:text-brand-400"
          title={t("flowform.editTest")}
        >
          <svg className="size-3.5" viewBox="0 0 20 20" fill="currentColor">
            <path d="M13.586 3.586a2 2 0 112.828 2.828l-8.5 8.5a2 2 0 01-.878.506l-3 .857a.5.5 0 01-.618-.618l.857-3a2 2 0 01.506-.878l8.5-8.5z" />
          </svg>
        </button>
        <button
          onClick={onRemove}
          className="flex size-7 items-center justify-center rounded-md text-slate-400 hover:bg-red-50 hover:text-error"
          title={t("flowform.removeTest")}
        >
          <svg className="size-3.5" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M9 2a1 1 0 00-.89.55L7.38 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.38l-.73-1.45A1 1 0 0011 2H9zm-1 6a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" />
          </svg>
        </button>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Add Test panel — select from pool or create manually              */
/* ------------------------------------------------------------------ */
type AddTestMode = "select" | "create"

const EMPTY_NEW: FlowTest = { name: "", suite: "", description: "", expectedResult: "" }

function AddTestPanel({
  existingTests,
  onAdd,
  onClose,
}: {
  existingTests: FlowTest[]
  onAdd: (tests: FlowTest[]) => void
  onClose: () => void
}) {
  const [mode, setMode] = useState<AddTestMode>("select")
  const [search, setSearch] = useState("")
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [newTest, setNewTest] = useState<FlowTest>(EMPTY_NEW)
  const [newErrors, setNewErrors] = useState<{ name?: string; suite?: string }>({})
  const searchRef = useRef<HTMLInputElement>(null)
  const { t } = useLang()

  // The frozen backend exposes no endpoint that lists the tests available to a
  // client (test classes are generated code on the engine side), so the pool
  // has no real data source and stays empty — see the Phase 3 gap report.
  // Tests are added through "Create manually", which maps 1:1 to the backend.
  const pool: FlowTest[] = []

  const existingNames = new Set(existingTests.map((t) => t.name))
  const visiblePool = pool.filter(
    (t) =>
      !existingNames.has(t.name) &&
      (search === "" ||
        t.name.toLowerCase().includes(search.toLowerCase()) ||
        t.suite.toLowerCase().includes(search.toLowerCase())),
  )

  function toggle(name: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      next.has(name) ? next.delete(name) : next.add(name)
      return next
    })
  }

  function handleAddSelected() {
    const toAdd = pool.filter((t) => selected.has(t.name))
    if (toAdd.length === 0) return
    onAdd(toAdd)
    onClose()
  }

  function handleCreateTest() {
    const e: { name?: string; suite?: string } = {}
    if (!newTest.name.trim()) e.name = t("flowform.testNameRequired")
    if (!newTest.suite.trim()) e.suite = t("flowform.testSuiteRequired")
    if (Object.keys(e).length > 0) { setNewErrors(e); return }
    if (existingNames.has(newTest.name.trim())) {
      setNewErrors({ name: t("flowform.testNameExists") })
      return
    }
    onAdd([{ name: newTest.name.trim(), suite: newTest.suite.trim() }])
    onClose()
  }

  return (
    <div className="mt-3 rounded-xl border border-brand-200 bg-elevated shadow-lg">
      {/* Tabs */}
      <div className="flex items-center gap-0 border-b border-slate-200 px-1 pt-1">
        {([["select", t("flowform.selectFromPool")], ["create", t("flowform.createManually")]] as [AddTestMode, string][]).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setMode(key)}
            className={cx(
              "rounded-t-md px-4 py-2.5 text-[13px] font-medium transition-colors",
              mode === key
                ? "border-b-2 border-brand-600 text-brand-300 -mb-px"
                : "text-slate-400 hover:text-slate-600",
            )}
          >
            {label}
          </button>
        ))}
        <button
          onClick={onClose}
          className="ms-auto me-2 flex size-7 items-center justify-center rounded-md text-slate-400 hover:text-slate-600"
        >
          <svg className="size-4" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" />
          </svg>
        </button>
      </div>

      <div className="p-4">
        {mode === "select" ? (
          <>
            {/* Search */}
            <div className="relative mb-3">
              <svg className="absolute start-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M9 3.5a5.5 5.5 0 100 11 5.5 5.5 0 000-11zM2 9a7 7 0 1112.452 4.391l3.328 3.329a.75.75 0 11-1.06 1.06l-3.329-3.328A7 7 0 012 9z" />
              </svg>
              <input
                ref={searchRef}
                type="search"
                placeholder={t("flowform.searchTests")}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="block w-full rounded-lg border border-slate-200 bg-surface py-2 ps-9 pe-3.5 text-[13px] text-slate-700 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-400"
              />
            </div>

            {/* Pool list */}
            <div className="max-h-56 overflow-y-auto space-y-1 pe-1">
              {visiblePool.length === 0 ? (
                <p className="py-6 text-center text-[13px] text-slate-400">
                  {search
                    ? t("flowform.noMatchingTests")
                    : t("flowform.poolEmpty")}
                </p>
              ) : (
                visiblePool.map((t) => {
                  const checked = selected.has(t.name)
                  return (
                    <button
                      key={t.name}
                      onClick={() => toggle(t.name)}
                      className={cx(
                        "flex w-full items-center gap-3 rounded-md px-3 py-2 text-start transition-colors",
                        checked ? "bg-brand-50" : "hover:bg-slate-50",
                      )}
                    >
                      <span className={cx("flex size-4 shrink-0 items-center justify-center rounded border transition-colors", checked ? "border-brand-600 bg-brand-600" : "border-slate-300")}>
                        {checked && (
                          <svg className="size-3 text-white" viewBox="0 0 20 20" fill="currentColor">
                            <path fillRule="evenodd" d="M16.7 5.3a1 1 0 010 1.4l-8 8a1 1 0 01-1.4 0l-4-4a1 1 0 111.4-1.4l3.3 3.29 7.3-7.3a1 1 0 011.4 0z" />
                          </svg>
                        )}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-mono text-[13px] font-medium text-slate-700">{t.name}</span>
                        <span className="text-[11px] text-slate-400">{t.suite}</span>
                      </span>
                    </button>
                  )
                })
              )}
            </div>

            {/* Footer */}
            <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-3">
              <div className="flex items-center gap-3 text-[12px]">
                <button onClick={() => setSelected(new Set(visiblePool.map((t) => t.name)))} className="font-medium text-brand-300 hover:text-brand-400">
                  {t("flows.selectAll")}
                </button>
                <span className="text-slate-200">·</span>
                <button onClick={() => setSelected(new Set())} className="font-medium text-slate-400 hover:text-slate-600">
                  {t("flowform.clear")}
                </button>
                {selected.size > 0 && (
                  <span className="rounded-full bg-brand-50 px-2 py-0.5 text-[11px] font-semibold text-brand-300">
                    {t("flows.selectedCount", { count: selected.size })}
                  </span>
                )}
              </div>
              <Button variant="primary" size="sm" onClick={handleAddSelected} disabled={selected.size === 0}>
                {selected.size > 0 ? t("flowform.addSelected", { count: selected.size }) : t("flowform.addTests")}
              </Button>
            </div>
          </>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="newTestName" required>{t("flowform.testNameLabel")}</Label>
                <TextInput
                  id="newTestName"
                  value={newTest.name}
                  onChange={(v) => { setNewTest((p) => ({ ...p, name: v })); setNewErrors((e) => ({ ...e, name: undefined })) }}
                  placeholder="testMyFeature"
                  error={newErrors.name}
                />
              </div>
              <div>
                <Label htmlFor="newTestSuite" required>{t("flowform.testSuiteLabel")}</Label>
                <TextInput
                  id="newTestSuite"
                  value={newTest.suite}
                  onChange={(v) => { setNewTest((p) => ({ ...p, suite: v })); setNewErrors((e) => ({ ...e, suite: undefined })) }}
                  placeholder="FeatureTest"
                  error={newErrors.suite}
                />
              </div>
            </div>
            <div>
              <Label htmlFor="newTestDesc">{t("flowform.descLabel")}</Label>
              <TextArea
                id="newTestDesc"
                value={newTest.description ?? ""}
                onChange={(v) => setNewTest((p) => ({ ...p, description: v }))}
                placeholder={t("flowform.testDescPlaceholder")}
                rows={2}
                disabled
              />
            </div>
            <div>
              <Label htmlFor="newTestExpected">{t("flowform.testExpectedLabel")}</Label>
              <TextArea
                id="newTestExpected"
                value={newTest.expectedResult ?? ""}
                onChange={(v) => setNewTest((p) => ({ ...p, expectedResult: v }))}
                placeholder={t("flowform.testExpectedPlaceholder")}
                rows={2}
                disabled
              />
            </div>
            <div className="flex justify-end border-t border-slate-100 pt-3">
              <Button variant="primary" size="sm" onClick={handleCreateTest}>
                {t("flowform.addTest")}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Inline edit panel for an existing test                             */
/* ------------------------------------------------------------------ */
function EditTestPanel({
  test,
  onSave,
  onClose,
}: {
  test: FlowTest
  onSave: (t: FlowTest) => void
  onClose: () => void
}) {
  const [draft, setDraft] = useState<FlowTest>({ ...test })
  const [errors, setErrors] = useState<{ name?: string; suite?: string }>({})
  const { t } = useLang()

  function handleSave() {
    const e: { name?: string; suite?: string } = {}
    if (!draft.name.trim()) e.name = t("flowform.testNameRequired")
    if (!draft.suite.trim()) e.suite = t("flowform.testSuiteRequired")
    if (Object.keys(e).length > 0) { setErrors(e); return }
    onSave({ ...draft, name: draft.name.trim(), suite: draft.suite.trim() })
    onClose()
  }

  return (
    <div className="mt-2 rounded-xl border border-slate-200 bg-elevated p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <p className="text-[12px] font-semibold text-slate-500">{t("flowform.editTest")}</p>
        <button onClick={onClose} className="flex size-6 items-center justify-center rounded-md text-slate-400 hover:text-slate-600">
          <svg className="size-3.5" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" />
          </svg>
        </button>
      </div>
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="editTestName" required>{t("flowform.testNameLabel")}</Label>
            <TextInput id="editTestName" value={draft.name} onChange={(v) => { setDraft((p) => ({ ...p, name: v })); setErrors((e) => ({ ...e, name: undefined })) }} error={errors.name} />
          </div>
          <div>
            <Label htmlFor="editTestSuite" required>{t("flowform.testSuiteLabel")}</Label>
            <TextInput id="editTestSuite" value={draft.suite} onChange={(v) => { setDraft((p) => ({ ...p, suite: v })); setErrors((e) => ({ ...e, suite: undefined })) }} error={errors.suite} />
          </div>
        </div>
        <div>
          <Label htmlFor="editTestDesc">{t("flowform.descLabel")}</Label>
          <TextArea id="editTestDesc" value={draft.description ?? ""} onChange={(v) => setDraft((p) => ({ ...p, description: v }))} rows={2} disabled />
        </div>
        <div>
          <Label htmlFor="editTestExpected">{t("flowform.testExpectedLabel")}</Label>
          <TextArea id="editTestExpected" value={draft.expectedResult ?? ""} onChange={(v) => setDraft((p) => ({ ...p, expectedResult: v }))} rows={2} disabled />
        </div>
        <div className="flex justify-end gap-2 border-t border-slate-100 pt-3">
          <Button variant="secondary" size="sm" onClick={onClose}>{t("common.cancel")}</Button>
          <Button variant="primary" size="sm" onClick={handleSave}>{t("common.saveChanges")}</Button>
        </div>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Flow Summary sidebar panel                                         */
/* ------------------------------------------------------------------ */
function FlowSummary({ name, tests, isEdit, flowId }: { name: string; tests: FlowTest[]; isEdit: boolean; flowId?: number }) {
  const { t } = useLang()
  const suites = [...new Set(tests.map((test) => test.suite))]

  return (
    <Card className="p-4 sticky top-4">
      <h3 className="mb-3 text-[11px] font-semibold uppercase tracking-wide text-slate-400">{t("flowform.summaryTitle")}</h3>

      <div className="space-y-3">
        <div>
          <p className="text-[11px] text-slate-400">{t("flowform.nameLabel")}</p>
          <p className={cx("mt-0.5 text-[14px] font-bold tracking-tight", name ? "text-navy" : "text-slate-300 italic")}>
            {name || t("flowform.untitledFlow")}
          </p>
        </div>

        {isEdit && flowId != null && (
          <div>
            <p className="text-[11px] text-slate-400">{t("flowform.flowId")}</p>
            <p className="mt-0.5 font-mono text-[12px] text-slate-500">{flowDisplayId(flowId)}</p>
          </div>
        )}

        <div className="flex items-center gap-4 rounded-lg border border-slate-100 bg-slate-50/60 px-3 py-2.5">
          <div className="text-center">
            <p className="font-display text-xl font-bold text-navy">{tests.length}</p>
            <p className="text-[10px] text-slate-400">{t("flowform.testsTitle")}</p>
          </div>
          <div className="h-8 w-px bg-slate-200" />
          <div className="text-center">
            <p className="font-display text-xl font-bold text-navy">{suites.length}</p>
            <p className="text-[10px] text-slate-400">{t("flowform.suitesStat")}</p>
          </div>
          <div className="h-8 w-px bg-slate-200" />
          <div className="text-center">
            <div className="flex items-center gap-1 justify-center">
              <span className={cx("size-2 rounded-full", tests.length > 0 ? "bg-success" : "bg-slate-300")} />
            </div>
            <p className="text-[10px] text-slate-400">{tests.length > 0 ? t("flowform.ready") : t("flowform.noTests")}</p>
          </div>
        </div>

        {suites.length > 0 && (
          <div>
            <p className="mb-1.5 text-[11px] text-slate-400">{t("flowform.testSuites")}</p>
            <div className="flex flex-wrap gap-1.5">
              {suites.map((s) => (
                <span key={s} className="rounded-md bg-brand-50 px-2 py-0.5 font-mono text-[11px] font-medium text-brand-300">
                  {s}
                </span>
              ))}
            </div>
          </div>
        )}

        {tests.length > 0 && (
          <div>
            <p className="mb-1.5 text-[11px] text-slate-400">{t("flowform.testsTitle")}</p>
            <ul className="space-y-1">
              {tests.map((test) => (
                <li key={test.name} className="flex items-center gap-1.5 text-[12px]">
                  <span className="size-1.5 shrink-0 rounded-full bg-success" />
                  <span className="truncate font-mono text-slate-600">{test.name}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {tests.length === 0 && (
          <p className="rounded-lg border border-dashed border-slate-200 px-3 py-4 text-center text-[12px] text-slate-400">
            {t("flowform.summaryEmpty")}
          </p>
        )}
      </div>
    </Card>
  )
}

/* ------------------------------------------------------------------ */
/* Success state                                                      */
/* ------------------------------------------------------------------ */
function SuccessState({ flowName, isEdit, onOpenFlow, onBack }: { flowName: string; isEdit: boolean; onOpenFlow: () => void; onBack: () => void }) {
  const { t } = useLang()
  return (
    <div className="flex flex-1 flex-col items-center justify-center py-20 text-center">
      <div className="flex size-16 items-center justify-center rounded-2xl bg-emerald-50 text-success">
        <svg className="size-8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      </div>
      <h2 className="mt-5 font-display text-2xl font-bold tracking-tight text-navy">
        {isEdit ? t("flowform.successEditTitle") : t("flowform.successCreateTitle")}
      </h2>
      <p className="mt-2 text-[14px] text-slate-500">
        <span className="font-semibold text-slate-700">{flowName}</span>{" "}
        {isEdit ? t("flowform.successEditSuffix") : t("flowform.successCreateSuffix")}
      </p>

      <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row">
        <Button variant="primary" onClick={onOpenFlow}>
          <svg className="size-4 rtl:-scale-x-100" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M10.293 3.293a1 1 0 011.414 0l6 6a1 1 0 010 1.414l-6 6a1 1 0 01-1.414-1.414L14.586 11H3a1 1 0 110-2h11.586l-4.293-4.293a1 1 0 010-1.414z" />
          </svg>
          {t("flowform.openFlow")}
        </Button>
        <Button variant="secondary" onClick={onBack}>
          {t("flowform.backToFlows")}
        </Button>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Main FlowForm component                                            */
/* ------------------------------------------------------------------ */

/** What the parent persists: the flow name plus its ordered test list. */
export type FlowDraft = { name: string; tests: FlowTest[] }

type FlowFormProps = {
  /** "create" posts a new flow; "edit" replaces the flow's test list */
  mode: "create" | "edit"
  /** Edit mode: the flow being edited (real backend id + name) */
  initialFlow?: Flow
  onBack: () => void
  /** Persists the draft against the real backend. Rejects with ApiError on failure. */
  onSave: (draft: FlowDraft) => Promise<void>
  /** Invoked on 401 — the parent routes it through the Phase 1 auth flow. */
  onUnauthorized: () => void
}

export function FlowForm({ initialFlow, mode, onBack, onSave, onUnauthorized }: FlowFormProps) {
  const isEdit = mode === "edit"
  const toast = useToast()
  const { t } = useLang()

  const [name, setName] = useState(initialFlow?.name ?? "")
  const [tests, setTests] = useState<FlowTest[]>([])
  const [errors, setErrors] = useState<{ name?: string }>({})

  const [testsLoading, setTestsLoading] = useState(isEdit)
  const [testsError, setTestsError] = useState<string | null>(null)

  const [addTestOpen, setAddTestOpen] = useState(false)
  const [editingIndex, setEditingIndex] = useState<number | null>(null)

  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  /* ---- Edit mode: load the flow's real tests on mount ------------- */
  const loadTests = useCallback(async () => {
    if (!initialFlow) return
    setTestsLoading(true)
    setTestsError(null)
    try {
      const rows = await apiFlowTests(initialFlow.id)
      setTests(toFlowTests(rows))
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        onUnauthorized()
        return
      }
      setTestsError(err instanceof ApiError ? err.message : translate("flows.testsLoadFailed"))
    } finally {
      setTestsLoading(false)
    }
  }, [initialFlow, onUnauthorized])

  useEffect(() => {
    if (isEdit) loadTests()
  }, [isEdit, loadTests])

  function removeTest(idx: number) {
    setTests((prev) => prev.filter((_, i) => i !== idx))
    if (editingIndex === idx) setEditingIndex(null)
  }

  function addTests(incoming: FlowTest[]) {
    setTests((prev) => {
      const existingNames = new Set(prev.map((t) => t.name))
      return [...prev, ...incoming.filter((t) => !existingNames.has(t.name))]
    })
  }

  function updateTest(idx: number, updated: FlowTest) {
    setTests((prev) => prev.map((t, i) => (i === idx ? updated : t)))
  }

  const testsReady = !testsLoading && !testsError

  async function handleSave() {
    const e: { name?: string } = {}
    if (!name.trim()) e.name = t("flowform.nameRequired")
    if (Object.keys(e).length > 0) { setErrors(e); return }
    // A replace-all must never be sent without the flow's real test list.
    if (isEdit && !testsReady) return
    setSaving(true)
    try {
      await onSave({ name: name.trim(), tests })
      setSaved(true)
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        onUnauthorized()
        return
      }
      toast({
        title: isEdit ? t("flowform.saveFailedEdit") : t("flowform.saveFailedCreate"),
        description: err instanceof ApiError ? err.message : t("common.somethingWentWrong"),
        variant: "error",
      })
    } finally {
      setSaving(false)
    }
  }

  if (saved) {
    return (
      <SuccessState
        flowName={name}
        isEdit={isEdit}
        onOpenFlow={onBack}
        onBack={onBack}
      />
    )
  }

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div>
        <button
          onClick={onBack}
          className="mb-3 inline-flex items-center gap-1.5 text-[13px] font-medium text-slate-400 transition-colors hover:text-brand-300"
        >
          <svg className="size-4 rtl:-scale-x-100" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M12.7 15.3a1 1 0 01-1.4 0l-4.5-4.6a1 1 0 010-1.4l4.5-4.6a1 1 0 111.4 1.4L8.9 10l3.8 3.9a1 1 0 010 1.4z" />
          </svg>
          {t("flowform.backToFlows")}
        </button>
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-brand-300">
          {t("flowform.eyebrow")}
        </p>
        <h1 className="mt-1 font-display text-2xl font-bold tracking-tight text-navy">
          {isEdit ? t("flowform.editTitle") : t("flowform.createTitle")}
        </h1>
        <p className="mt-1 text-[13px] text-slate-500">
          {t("flowform.subtitle")}
        </p>
      </div>

      {/* Two-column layout */}
      <div className="grid gap-6 lg:grid-cols-[1fr_260px]">
        {/* Main */}
        <div className="space-y-4">

          {/* 01 Flow Information */}
          <Card className="overflow-hidden">
            <div className="border-b border-slate-100 px-5 py-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-brand-300">01</p>
              <h2 className="mt-0.5 font-display text-base font-bold text-navy">{t("flowform.infoTitle")}</h2>
              <p className="mt-0.5 text-[13px] text-slate-500">{t("flowform.infoDesc")}</p>
            </div>

            <div className="divide-y divide-slate-100">
              <div className="px-5 py-4">
                <Label htmlFor="flowName" required>{t("flowform.nameLabel")}</Label>
                <TextInput
                  id="flowName"
                  value={name}
                  onChange={(v) => { setName(v); setErrors((e) => ({ ...e, name: undefined })) }}
                  placeholder={t("flowform.namePlaceholder")}
                  error={errors.name}
                  disabled={isEdit}
                />
                <p className="mt-1 text-[11px] text-slate-400">
                  {isEdit
                    ? t("flowform.nameEditHint")
                    : t("flowform.nameHint")}
                </p>
              </div>

              <div className="px-5 py-4">
                <Label htmlFor="flowDesc">{t("flowform.descLabel")}</Label>
                <TextArea
                  id="flowDesc"
                  value=""
                  onChange={() => {}}
                  placeholder={t("flowform.descPlaceholder")}
                  rows={2}
                  disabled
                />
              </div>

              {isEdit && initialFlow && (
                <div className="flex items-center justify-between px-5 py-3.5">
                  <span className="text-[12px] text-slate-400">{t("flowform.flowId")}</span>
                  <span className="font-mono text-[12px] font-medium text-slate-500">{flowDisplayId(initialFlow.id)}</span>
                </div>
              )}
            </div>
          </Card>

          {/* 02 Tests */}
          <Card className="overflow-hidden">
            <div className="border-b border-slate-100 px-5 py-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-brand-300">02</p>
              <h2 className="mt-0.5 font-display text-base font-bold text-navy">{t("flowform.testsTitle")}</h2>
              <p className="mt-0.5 text-[13px] text-slate-500">
                {t("flowform.testsDesc")}
              </p>
            </div>

            <div className="px-5 py-4">
              {testsLoading ? (
                <div className="mb-4 flex items-center justify-center gap-2 rounded-lg border border-dashed border-slate-200 py-8 text-[13px] text-slate-400">
                  <Spinner size="sm" />
                  {t("flows.loadingTests")}
                </div>
              ) : testsError ? (
                <div className="mb-4 flex flex-col items-center justify-center rounded-lg border border-dashed border-red-200 py-8 text-center">
                  <p className="text-[13px] font-medium text-error">{testsError}</p>
                  <Button variant="secondary" size="sm" className="mt-3" onClick={loadTests}>
                    {t("common.retry")}
                  </Button>
                </div>
              ) : (
                <>
                  {/* Test list */}
                  {tests.length > 0 ? (
                    <div className="mb-4 space-y-1.5">
                      {tests.map((t, i) => (
                        <div key={`${t.name}-${i}`}>
                          <TestRow
                            test={t}
                            onRemove={() => removeTest(i)}
                            onEdit={() => setEditingIndex(editingIndex === i ? null : i)}
                          />
                          {editingIndex === i && (
                            <EditTestPanel
                              test={t}
                              onSave={(updated) => { updateTest(i, updated); setEditingIndex(null) }}
                              onClose={() => setEditingIndex(null)}
                            />
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="mb-4 flex flex-col items-center justify-center rounded-lg border border-dashed border-slate-200 py-8 text-center">
                      <svg className="size-8 text-slate-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                      </svg>
                      <p className="mt-2 text-[13px] font-medium text-slate-500">{t("flowform.noTestsTitle")}</p>
                      <p className="mt-0.5 text-[12px] text-slate-400">{t("flowform.noTestsDesc")}</p>
                    </div>
                  )}

                  {/* Add Test button / panel */}
                  {!addTestOpen ? (
                    <button
                      onClick={() => { setAddTestOpen(true); setEditingIndex(null) }}
                      className="inline-flex items-center gap-2 rounded-lg border border-dashed border-brand-300 px-4 py-2 text-[13px] font-medium text-brand-300 transition-colors hover:border-brand-400 hover:bg-brand-50"
                    >
                      <svg className="size-4" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" />
                      </svg>
                      {t("flowform.addTest")}
                    </button>
                  ) : (
                    <AddTestPanel
                      existingTests={tests}
                      onAdd={addTests}
                      onClose={() => setAddTestOpen(false)}
                    />
                  )}
                </>
              )}
            </div>
          </Card>

          {/* Actions */}
          <div className="flex items-center justify-between border-t border-slate-200 pt-4">
            <Button variant="secondary" onClick={onBack}>
              {t("common.cancel")}
            </Button>
            <Button variant="primary" onClick={handleSave} disabled={saving || (isEdit && !testsReady)}>
              {saving && (
                <svg className="size-4 animate-spin" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
              )}
              {saving ? t("flowform.saving") : isEdit ? t("common.saveChanges") : t("flowform.createTitle")}
            </Button>
          </div>
        </div>

        {/* Sidebar */}
        <div className="hidden lg:block">
          <FlowSummary name={name} tests={tests} isEdit={isEdit} flowId={initialFlow?.id} />
        </div>
      </div>
    </div>
  )
}

export default FlowForm
