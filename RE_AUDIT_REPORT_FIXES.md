# PR10C FRONTEND — RE-AUDIT OF FIX COMMIT f583960

**Branch:** `feature/pr10c-frontend-ai-builder`
**Fix commit:** `f583960` ("fix(pr10c): close audit findings F-01, F-02, F-03, F-04")
**Prior audit:** CHANGES_REQUIRED — F-01 HIGH, F-02/F-03 MEDIUM, F-04/F-05/F-06/F-07 LOW (`PR10C_FRONTEND_AUDIT_REPORT.md`)
**Scope:** focused re-audit of the 7 findings only; no full re-audit.
**Method:** diff review of all 7 touched files + full regression suite + live adversarial browser tests (mock engine + dev server + real browser session). Read-only: one temporary mutation to `src/lib/i18n.tsx` was made solely for the F-07 injection test and reverted immediately (`git status` clean afterward; only the untracked audit reports remain).

---

## SECTION 1 — Executive Summary

### Verdict: **APPROVE**

All 7 findings are addressed. F-01, F-02, F-03, F-04, F-06, F-07 are fully verified (code + tests + live adversarial evidence). F-05 is verified in substance (parallel `Promise.all`, no code change needed) but the "backend follow-up noted" sub-claim is only partially satisfied: the constraint is documented in the code comment, but no explicit follow-up note exists. One new LOW finding (N-01, prototype-chain nit in the new F-01 guard) and one LOW documentation gap (N-02) — neither blocks merge.

| Fix | Status |
|-----|--------|
| F-01 (HIGH) 503 FAILED mapping | ✅ FIXED — verified live, all 3 adversarial cases |
| F-02 (MEDIUM) mock 503 contract | ✅ FIXED — INTENT_AMBIGUOUS→200, others→503; absence assertion present |
| F-03 (MEDIUM) retryConfirm wired | ✅ FIXED — verified live; identical keys on the wire |
| F-04 (LOW) "READY" token | ✅ FIXED — EN reworded, AR correct |
| F-05 (LOW) N+1 parallelism | ⚠️ PARTIAL — parallel ✅, explicit follow-up note missing (N-02) |
| F-06 (LOW) legacy tab relabel | ✅ FIXED — "Asset Requests" renders; no orphan routes |
| F-07 (LOW) terminology test | ✅ FIXED — mutation test proves it fails on injection |

Regression checks: typecheck ✅, unit 201/201 ✅, E2E 35/35 ✅, build ✅, no files outside fix scope (AiPlanViews.tsx modification is the F-03 banner itself — in scope), no new dependencies.

---

## SECTION 2 — Per-fix verification

| Fix | Claim | Found | Status | Evidence |
|-----|-------|-------|--------|----------|
| F-01 | Rejection handler maps `body.status === "FAILED"` + string `errorCategory` through `PLAN_ERROR_MESSAGES` | Implemented exactly: guard requires `error instanceof ApiError && error.body != null`, `body.status === "FAILED"`, `typeof errorCategory === "string"`, and `errorCategory in PLAN_ERROR_MESSAGES` (known categories only). Sits AFTER the 401 check and BEFORE the abort/timeout path; the final `fail(PLAN_ERROR_MESSAGES.AI_UNAVAILABLE)` fallback is retained. Backend `message` still passed as description only when a non-empty string. | ✅ FIXED | `src/components/planner/AiBuilderPage.tsx:285-306` (diff hunk `@@ -282,6 +282,31 @@`); live cases 1-3 below |
| F-02 | Mock serves FAILED at 503 for non-ambiguous categories; INTENT_AMBIGUOUS stays 200; new E2E asserts the 503 path incl. absence of the generic message | `mock-engine.mjs:946-947`: `const status = category === "INTENT_AMBIGUOUS" ? 200 : 503`. Allowed modes extended with `failed:CREDENTIAL_UNAVAILABLE` and `failed:INTENT_AMBIGUOUS`. New E2E `planner.spec.ts:212-229` asserts the correct heading AND `toHaveCount(0)` for "AI Test Builder is temporarily unavailable" — explicit absence assertion confirmed. The pre-existing `failed:AI_TIMEOUT` test now exercises the 503 path implicitly and still passes. | ✅ FIXED | `tests/e2e/mock-engine.mjs:457-464,943-951`; `tests/e2e/planner.spec.ts:138-172,212-229`; E2E run: tests 3, 5, 6 pass |
| F-03 | Network-failed confirms stay in review with inline banner; Try again reuses the retained key; Back abandons (fresh key) | `confirmDraft`'s rejection handler now has a transport-failure branch (`error.status === 0 \|\| controller.signal.aborted`) → `setConfirmError(...)`, `setPhase("review")`, key NOT cleared. `retryConfirm` is wired to the "Try again" button rendered by `ReviewView` when `confirmError` is set (with `role="alert"`, Dismiss button). `backToProposed` clears `confirmKeyRef` so the next confirm is a fresh logical submission. New E2E asserts `keys[1] === keys[0]` on the wire. | ✅ FIXED | `AiBuilderPage.tsx:424-433,440-455,671-675`; `AiPlanViews.tsx:630-653`; `planner.spec.ts:138-172`; live test below (identical key `db04b88e-…`) |
| F-04 | "READY" token removed from user-facing strings | EN: "None of the definitions on this page are **active yet**." — no "READY" token. AR: "لا توجد اختبارات نشطة في هذه الصفحة بعد" ("no active tests on this page yet") — correct, non-literal, uses the approved "Active" vocabulary. Key identifier `testdef.noReadyOnPage` unchanged (not user-facing). | ✅ FIXED | `src/lib/i18n.tsx:3529-3532`; terminology test green |
| F-05 | Was already `Promise.all`-parallel; no code change; backend follow-up noted | Parallelism: ✅ verified — `TestDefinitionList.tsx:152` `await Promise.all(rows.map(...))`, no sequential awaits, and the file is untouched by f583960 (consistent with "no code change"). "Follow-up noted": ⚠️ the constraint IS documented (`TestDefinitionList.tsx:33-36` — "The list endpoint reports no version status… resolved through the existing detail route… client-side"), but no explicit backend-follow-up note exists in code, README, or the commit message. | ⚠️ PARTIAL (N-02) | `TestDefinitionList.tsx:143-181`; `git show f583960 --stat` (file absent) |
| F-06 | Legacy `requests` relabeled "Asset Requests"; distinct from "Test Requests"; no orphan routes | `WORKSPACE_NAV` now uses new key `nav.assetRequests` ("Asset Requests" / "طلبات الأصول"); sidebar `nav.testRequests` ("Test Requests") unchanged — two distinct labels confirmed. Route key `requests` unchanged, `App.tsx` mounting unchanged → no orphan routes. Verified live: Flows-page header renders "Asset Requests"; sidebar renders "Test Requests". | ✅ FIXED | `WorkspaceHeader.tsx:17`; `i18n.tsx:3510`; live header check |
| F-07 | terminology.test.ts guards pr10c.*/nav.* fully; testdef.* implementation-tokens only; lifecycle words grandfathered | `src/lib/terminology.test.ts` parses pr10c/nav/testdef entries (asserts >50 parsed), scans **pr10c.\* + nav.\*** against all 18 forbidden tokens, scans **testdef.\*** against the same list minus `LIFECYCLE_WORDS = {Step, Proving, READY}` — i.e. stricter than claimed (testdef.* is also scanned for "UI Test", "Assertion", etc., which is fine). Grandfather clause documented in the file header with rationale. Mutation test: injecting "MCP proxy" into `pr10c.page.eyebrow` made the test fail with exactly `['pr10c.page.eyebrow contains "MCP"', 'pr10c.page.eyebrow contains "proxy"']`; reverted immediately. | ✅ FIXED | `src/lib/terminology.test.ts:15-94`; mutation run output (pass→fail→revert) |

**Scope check:** modified files = AiBuilderPage.tsx, AiPlanViews.tsx, i18n.tsx, WorkspaceHeader.tsx, mock-engine.mjs, planner.spec.ts; created = terminology.test.ts. `AiPlanViews.tsx` was not in the brief's expected list but is the F-03 inline banner itself — in scope, not flagged. No new dependencies (package.json untouched).

---

## SECTION 3 — Adversarial test results (live, real browser)

Environment: `MOCK_ENGINE_IDENTITY=client` mock engine on :8099, dev server on :3100, seeded client session. All executed against the working tree at f583960.

### F-01 — 503 FAILED mapping (3 cases)

| Case | Forced response | Expected | Observed | Verdict |
|------|-----------------|----------|----------|---------|
| 1 | Mock `failed:CREDENTIAL_UNAVAILABLE` → **HTTP 503** `{status:"FAILED", errorCategory:"CREDENTIAL_UNAVAILABLE"}` | "The selected credential is not available. Choose another." — NOT the generic message | Heading = "The selected credential is not available. Choose another."; `genericShown: false` (body text does not contain "AI Test Builder is temporarily unavailable") | ✅ PASS |
| 2 | Mock `failed:AI_TIMEOUT` → **HTTP 503** | "The plan took too long to generate. Try again." | Heading = "The plan took too long to generate. Try again." | ✅ PASS |
| 3 | Page-level fetch wrap → **HTTP 503** `{status:"FAILED", errorCategory:"NOT_A_REAL_CATEGORY", message:"weird"}` | Safe fallback to AI_UNAVAILABLE, no crash, no raw leak | Heading = "AI Test Builder is temporarily unavailable. Try again in a moment." | ✅ PASS |

### F-03 — key-preserving confirm retry

| Step | Expected | Observed | Verdict |
|------|----------|----------|---------|
| Confirm → fetch rejects (network failure) | Stay in review with inline banner | `role="alert"`: "Could not reach Assuredia. Check your connection and try again." with **Try again** + **Dismiss** buttons; review content intact | ✅ PASS |
| Click "Try again" | Same logical confirm re-sent with the SAME Idempotency-Key; success | Reached "Test Draft Created". Captured on the wire: `keys: ["db04b88e-684d-4ace-8477-91d3c55574c1", "db04b88e-684d-4ace-8477-91d3c55574c1"]` — **identical** | ✅ PASS |
| Back (abandon) | Key cleared → fresh key next submission | Verified in code: `backToProposed` sets `confirmKeyRef.current = null` (AiBuilderPage.tsx:449-454); `onReview` also nulls it (pre-existing) | ✅ PASS (code) |

---

## SECTION 4 — New findings (introduced or surfaced by the fixes)

| ID | Finding | Severity | File : Line | Note |
|----|---------|----------|-------------|------|
| N-01 | The new F-01 guard uses `body.errorCategory in PLAN_ERROR_MESSAGES`, which checks the **prototype chain**: a backend body with `errorCategory: "toString"` / `"constructor"` / `"valueOf"` would pass the guard and pass a function (not a string) to `fail()` as the title. Only reachable from a buggy/malicious backend (the real backend sends its closed enum), and React renders a function child as empty rather than crashing. | LOW (nit) | `src/components/planner/AiBuilderPage.tsx:296` | Suggested hardening: `Object.prototype.hasOwnProperty.call(PLAN_ERROR_MESSAGES, body.errorCategory)` or `Object.hasOwn(...)`. Not merge-blocking. |
| N-02 | F-05 sub-claim "backend follow-up noted" is not satisfied anywhere findable: no explicit follow-up note in code comments, README, or the commit message — only the constraint documentation pre-dating the fix. | LOW (doc) | `src/components/testdefinitions/TestDefinitionList.tsx:33-36` | One-line comment addition (e.g. "backend follow-up: expose latest-version status on the list endpoint to remove the per-row resolution") closes it. Not merge-blocking. |

No regressions introduced by the fixes were found: all previously passing behavior re-verified (198 prior unit tests still pass; 33 prior E2E tests still pass; build clean; bundle unchanged in nature).

---

## SECTION 5 — Final verdict

```
AUDIT_STATUS       = COMPLETE
VERDICT            = APPROVE
FIXES_VERIFIED     = 7 / 7  (6 fully, F-05 partial on the documentation sub-claim only)
NEW_FINDINGS       = 2      (both LOW, non-blocking: N-01 prototype-chain nit, N-02 doc note)
READY_TO_MERGE     = true
```

**Rationale:** the HIGH finding is closed with live adversarial proof across all three specified cases, the mock now mirrors the real controller's status semantics and the suite asserts absence of the generic message, the key-preserving retry is reachable and proven byte-identical on the wire, and the terminology guard demonstrably fails on injected violations. The two new LOW items are a defensive-coding nit and a missing documentation line; both can be folded into a later cleanup without gating the merge.
