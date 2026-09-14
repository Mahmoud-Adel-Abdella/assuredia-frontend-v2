# PR10C FRONTEND AUDIT REPORT

**Branch:** `feature/pr10c-frontend-ai-builder`
**Commits:** `6a90f1b` (AI Test Builder UI) + `2a792c3` (Sidebar IA migration)
**Base:** `main` (post PR10B merge, a711352)
**Auditor:** Independent, read-only. No product code was modified. (A temporary probe script `audit-503-probe.mts` was created in the repo root during adversarial testing and deleted afterward; `git status` is clean.)
**Backend reference:** `C:\Users\mahaa\Downloads\webapp\Assuredia Engine V3` (TestPlanController.java, AiPlannerService.java, PlannerCredentialService.java, TestDefinitionController.java — verified directly, not from documentation).

---

## SECTION 1 — Executive Summary

### Verdict: **CHANGES_REQUIRED**

| Severity | Count |
|----------|-------|
| BLOCKER  | 0 |
| HIGH     | 1 |
| MEDIUM   | 2 |
| LOW      | 4 |

The implementation is substantially high quality: the frozen backend contract is followed almost exactly, the sidebar IA migration is correct, deep links are preserved, PR10B passes unchanged, all 198 unit + 33 E2E tests pass, and the build is healthy. However, **one HIGH finding breaks the plan-error contract against the real backend**: planning FAILED responses are delivered by the real backend over **HTTP 503** (only `INTENT_AMBIGUOUS` arrives as HTTP 200), while the frontend maps `errorCategory` only from HTTP-200 bodies. Every real planning failure except `INTENT_AMBIGUOUS` will therefore render the generic "AI Test Builder is temporarily unavailable" message instead of the category-specific message the contract requires (verified by direct probe with production code). The E2E mock masks this by serving FAILED at HTTP 200.

### Top findings

1. **[HIGH] F-01** — Real-backend FAILED (503) never maps to its error category; 8 of 9 categories degrade to the generic AI_UNAVAILABLE message. Probe-verified with production code.
2. **[MEDIUM] F-02** — E2E mock serves plan FAILED at HTTP 200, diverging from the real controller's 503 — this is exactly why F-01 was not caught by the "18/18 acceptance" suite.
3. **[MEDIUM] F-03** — `retryConfirm()` (key-preserving confirm retry) is defined but never wired to any UI element — dead code; the network-uncertain-retry guarantee exists only on paper.
4. **[LOW] F-04** — `testdef.noReadyOnPageHint` leaks the literal lifecycle token "READY" into a user-facing string (terminology rule: "READY" forbidden in UI).
5. **[LOW] F-05** — N+1 status resolution in TESTS IA views: one extra GET per definition row per page (bounded at 50, acceptable but should be flagged).

---

## SECTION 2 — D1 through D14

### D1 — Contract Adherence

| Check | Expected | Found | Status | Evidence |
|-------|----------|-------|--------|----------|
| Plan endpoint | `POST /dashboard-api/clients/{id}/test-plans` | Exact match | ✅ VERIFIED | `src/lib/api.ts:3125-3135` — `apiCreateTestPlan` posts to `/dashboard-api/clients/${clientId}/test-plans` |
| Plan request shape | `{ intent, requestedType?, credentialId? }` | `intent` always; `requestedType`/`credentialId` spread only when set | ✅ VERIFIED | `api.ts:3128-3131`; unit test `planner.test.ts:98-105` asserts `{intent}` alone |
| Plan response: 3 statuses | PLAN_READY / NEEDS_CLARIFICATION / FAILED all handled | Type guards + phase machine | ✅ VERIFIED | `planner.ts:132-148` (`isPlanReady`/`isPlanClarification`); `AiBuilderPage.tsx:219-275` |
| Confirm endpoint | `POST .../test-plans/{planId}/confirm` | Exact match | ✅ VERIFIED | `api.ts:3137-3153` |
| Idempotency-Key header | Required on confirm | Sent always | ✅ VERIFIED | `api.ts:3145` `headers: { "Idempotency-Key": idempotencyKey }`; unit test `planner.test.ts:121-132`; browser test 4 captured key `5b70af79-…` on the wire |
| Confirm body | `{ name?, description? }` | Sends `{ name, description }` | ✅ VERIFIED | `AiBuilderPage.tsx:366-369` (name trimmed, ≤120; description from plan) — matches `TestPlanController.java:135-146` bounds |
| No invented endpoints | — | Only the two contract endpoints + existing `apiClientDetails` | ✅ VERIFIED | `git diff main...HEAD -- src/lib/api.ts` adds exactly 2 functions |
| No polling loops | Single synchronous POST | One POST per phase; AbortController cancel | ✅ VERIFIED | `AiBuilderPage.tsx:187-300`; no `setInterval`-driven fetch (interval only advances the stage UI) |
| sessionId correlation-only | No session lifecycle | No sessionId field exists at all | ✅ VERIFIED | grep: no `sessionId` in planner files |
| Key generated per user intent | New key per plan | `confirmKeyRef.current = null` on entering review of a NEW plan (`onReview`, AiBuilderPage.tsx:598-601) | ✅ VERIFIED | Browser test 4: two different plans produced two different keys |
| Key NOT regenerated on retry | Same key re-used for same logical confirm | Ref preserved in `useRef` | ⚠️ PARTIAL | `AiBuilderPage.tsx:118,355` — key IS kept in `confirmKeyRef` and reused by `retryConfirm()` (line 403-407), **but `retryConfirm` is never wired to any UI element** (see F-03). The only reachable retry paths create a new plan → new key (safe, but the network-uncertain retry case cannot be exercised by a user) |
| Plan expiry (single-use/404) | 404 → expired message | 404 → `CONFIRM_ERROR_MESSAGES.PLAN_EXPIRED` | ✅ VERIFIED | `AiBuilderPage.tsx:389-391`; adversarial test 2 (browser, forced 404) rendered "This plan has expired. Please create a new one." |
| Duplicate confirm (409) | "already confirmed" | 409 → duplicate phase → "Already confirmed" + View in Drafts | ✅ VERIFIED | `AiBuilderPage.tsx:393-396`; adversarial test 3 (forced 409) rendered "Already confirmed" heading and navigated correctly |

### D2 — Figma TSX Handling

| Check | Found | Status |
|-------|-------|--------|
| Figma originals placed as-is initially | Not verifiable — no received Figma TSX files exist in the repo or git history (only pre-PR10C design docs in `src/imports/pasted_text/`) | ❓ UNVERIFIABLE |
| Adapters are edits of Figma originals | Header comments claim adaptation with named originals (`Assuredia UI (7)/src/components/CreateTestPage.tsx`) — `AiComposer.tsx:16-21`, `AiPlanViews.tsx:30-37`, `AiIcons.tsx:1-5` ("carried over verbatim") | ❓ UNVERIFIABLE (claim only) |
| No file rewritten from scratch | Icons are verbatim carry-overs per their header; visual structure (rounded-20px composer, blur layers, badge styles) is coherent with the repo's Figma-era components | ⚠️ PLAUSIBLE, UNVERIFIABLE |
| `[IMPROVISED_MISSING_FIGMA]` markers | None exist in the code | ✅ VERIFIED (grep: zero matches) |
| Improvised components use primitives + tokens | `AiPlanViews`/`AiComposer` use `Button`/`cx` from `../primitives` and the token classes used repo-wide | ✅ VERIFIED |

**Note:** The audit contract asked to verify adaptation "not rewrite", but the received Figma TSX is not part of this repository, so per Special Rule 3 this dimension is UNVERIFIABLE. The claiming comments are detailed and specific (file path inside the Figma Make project), which supports but does not prove the claim.

### D3 — FIX 9 Sidebar IA Migration

| Route | Expected target | Found | Status |
|-------|-----------------|-------|--------|
| `active-tests` | TestDefinitionsPage (READY) | `App.tsx:607-635` — mounts TestDefinitionsPage with `filter="READY"` | ✅ |
| `drafts-reviews` | TestDefinitionsPage (DRAFTS) | `App.tsx:607-634` — `filter="DRAFTS"` | ✅ |
| `test-requests` | CreationRequestsPage | `App.tsx:650-658` | ✅ |
| `create-test` | CreateTestPage | `App.tsx:636-649` | ✅ |
| `run-history` | RunHistory | `App.tsx:677-684` | ✅ |
| `live-runs` | Automations | `App.tsx:599-605` — `active === "automations" \|\| "live-runs" \|\| "scheduled-runs"` → Automations | ✅ |
| `scheduled-runs` | Automations | same branch | ✅ |

Sidebar groups (`Sidebar.tsx:233-293`):
- TESTS group with 4 items (Active Tests, Drafts & Reviews, Test Requests, Create Test) ✅
- RUNS & RESULTS with 3 items (Live Runs, Scheduled Runs, History) ✅
- Workspace / Monitoring / System / Support preserved ✅
- No orphan routes: every sidebar key maps to an App.tsx branch ✅ (verified by cross-referencing `Sidebar.tsx` group keys against `App.tsx:560-715` conditions)

Filter verification:
- `matchesFilter` (`TestDefinitionList.tsx:42-49`): READY filter returns only `status === "READY"`; DRAFTS filter returns `DRAFT | VALIDATED | APPROVED` ✅ matches spec
- Works with real backend data: the list endpoint returns no version status, so each row is resolved via `apiGetTestDefinition` (N+1, bounded by page size 50) — `TestDefinitionList.tsx:143-181` ✅ functional, ⚠️ efficiency note (F-05)
- E2E `sidebar-ia.spec.ts:71-102` proves Active Tests hides a draft and Drafts & Reviews shows it, against the mock engine's real creation endpoints ✅

**Minor IA inconsistency (F-06, LOW):** `WorkspaceHeader.tsx:13` still exposes a `requests` key (the old Asset Requests page, still mounted at `App.tsx:686`) alongside the new `test-requests`. Two different "requests" concepts appear in the same header nav. The old page is still reachable (not orphaned), so this is IA polish, not breakage. `Automations.tsx:581-586` defaults `active = "automations"`, so when mounted via `live-runs`/`scheduled-runs` the workspace-header highlight falls back to "Automations" — cosmetic only.

### D4 — Terminology Enforcement

Sweep of all PR10C files (`src/components/planner/*`, `src/lib/planner.ts`, new i18n lines, `CreateTestPage.tsx` changes):

| Term | Result |
|------|--------|
| MCP, Playwright, STDIO, Chromium, broker, proxy, container, JSON-RPC, tools/call, "UI Test", "API Test", "Mixed Test" | ✅ Zero occurrences in PR10C-added code |
| "DOM" | ✅ Zero (only `crypto.randomUUID` false-positives) |
| "Assertion"/"Locator" | ✅ Zero in PR10C strings (pre-existing manual-editor strings are PR10A scope, unchanged by this diff) |
| "Step"/"Step N" | ✅ PR10C uses "Action" (`pr10c.plan.actionLabel` = "Action", moveUp/moveDown/deleteAction) |
| "UNVERIFIED"/"Proving" | ✅ Zero in PR10C strings |
| "READY" user-facing | ⚠️ **F-04**: `testdef.noReadyOnPageHint` — "None of the definitions on this page are READY." (i18n.tsx:5311-5314, new in this diff) leaks the lifecycle token |
| Required terms | ✅ All present: "User Journey"/"Backend Check"/"End-to-End" (pr10c.type.*), "AI Test Builder", "Test Draft" (review.draftNote, success.*), "Action N" (numbered 01/02 rows), "Expected Results", "Active" (Active Tests), "Secure Credential" (pr10c.credential.*) |
| "Element Target"/"Suggested"/"Verification" | ❓ Not present — these come from the discovery flow (PR10B vocabulary); no PR10C surface requires them. Not a violation. |

### D5 — SSRF Fix Verification

| Check | Found | Status |
|-------|-------|--------|
| No URL input in creation flows | All 5 inputs in planner components are: intent textarea, step-intent text, test-name text, revision text, clarification answers — none accept URLs | ✅ |
| Origin read-only badge | `ReviewView` renders origin in a non-editable `<span dir="ltr">` (`AiPlanViews.tsx:530-536`) | ✅ |
| Origin from apiClientDetails | `AiBuilderPage.tsx:128-135` — `details.client.base_url` | ✅ |
| Preflight when base_url missing | `origin === null && composerType !== "API"` → `preflight-url` phase ("Target application not configured", Settings guidance) `AiBuilderPage.tsx:174-177,516-528`; E2E `planner.spec.ts:240-265` | ✅ |
| No URL injection | Grep for `value={…url}` in planner/testcreation: zero matches | ✅ |

### D6 — RTL / Arabic

| Check | Evidence | Status |
|-------|----------|--------|
| `documentElement.dir` switches | `i18n.tsx:5298-5301` useEffect sets `dir = lang === "ar" ? "rtl" : "ltr"` | ✅ |
| All PR10C components respect RTL | Layout uses logical/flex utilities; `ms-auto` (logical) in StepRow | ✅ |
| Directional icons mirror | `rtl:-scale-x-100` on arrow-up (AiComposer.tsx:260) and the OtherWayCard arrow (AiBuilderPage.tsx:765) | ✅ |
| Non-directional icons unchanged | Check/Lock/Sparkle/Chevron not flipped | ✅ |
| URLs in `<span dir="ltr">` | ReviewView origin badge (AiPlanViews.tsx:532) | ✅ |
| Western numerals | Step numbers rendered as `String(index+1).padStart(2,"0")`; Arabic E2E shows "01"/"02"/"2 من الإجراءات" | ✅ |
| Sidebar mirrors | Browser measurement in Arabic: sidebar bounding box x=1025-1280 (right edge), main x=22-1036 (left) — full mirror | ✅ VERIFIED LIVE |
| Arabic strings exist | Full `pr10c.*` and new `nav.*`/`testdef.*` ar entries (i18n.tsx:3501-5290) | ✅ |
| Live mirror test | Executed: lang=ar → dir=rtl; builder flow ran fully in Arabic; no missing keys (snapshot showed translated strings only) | ✅ VERIFIED LIVE |

Note: only 2 `rtl:` utilities exist in PR10C code; the rest relies on flexbox auto-mirroring, which the geometric test confirms works.

### D7 — State Management & Flow Integrity

| Check | Evidence | Status |
|-------|----------|--------|
| Composer state (intent/type/credential) | `AiBuilderPage.tsx:96-102` useState: `composerType`, `intent`, `wantCredential`, `credConfigured`, `credName`, `origin` | ✅ |
| Plan state | `plan`, `steps`, `planTitle` (104-106) | ✅ |
| Building progress 4 stages | `buildingStages(t)` 4 entries (AiComposer.tsx:62-69); stepper interval advances UI only | ✅ |
| Clarification state | questions+answers map (107-109, 240-256) | ✅ |
| Error state mapped | `failure` {title, description} (110) | ✅ (but see F-01 for 503 gap) |
| Review state | review phase re-renders from same `steps`/`planTitle` state (609-625) | ✅ |
| Success state | `success` {definitionId, title, stepCount} (111-115) | ✅ |
| Review→Edit preserves state | `onBack={() => setPhase("proposed")}` (623) — same component, no unmount; steps edits survive round-trip (verified in browser: title/steps retained) | ✅ |
| State cleared on Create Another | `resetAll()` clears all fields + confirmKeyRef (310-325) | ✅ |
| Idempotency key in useRef | `confirmKeyRef = useRef<string \| null>(null)` (120) | ✅ |
| No stale state after confirm | success phase renders only from `success`; plan/steps left in memory but harmless; `confirmKeyRef` cleared only on resetAll/409 — a 409 clears it (394) before duplicate view | ✅ |

Two flow observations: (a) `startBuild` blocks when `busy` — double-click safe; (b) revise/clarify append to intent with 4000-char cap (327-349), matching backend `@Size(max=4000)`.

### D8 — Error Handling & User Messaging

Confirm-status mapping (all adversarially verified live):

| Backend case | Expected message | Observed | Status |
|--------------|------------------|----------|--------|
| 400 missing key | "Something went wrong. Please try again." | Probe: mock returns 400 without key → but the UI always sends the key; the fallback branch (398) shows exactly this string on any non-401/404/409 error | ✅ (fallback covers) |
| 404 unknown/expired | "This plan has expired…" | Live test 2: rendered exactly | ✅ |
| 409 duplicate | "already confirmed. Opening the draft…" | Live test 3: "Already confirmed" + draft CTA (body copy differs slightly from the message-constant wording — same meaning, no backend-string leak) | ✅ |

Plan-failure mapping — **the critical split**:

| Delivery | Categories | Frontend behavior | Status |
|----------|-----------|-------------------|--------|
| HTTP 200 + FAILED body | INTENT_AMBIGUOUS (real), all 9 (mock) | `errorCategory` read from body, mapped via `PLAN_ERROR_MESSAGES` | ✅ VERIFIED (live test 1a: AI_TIMEOUT message rendered) |
| **HTTP 503 + FAILED body** | **AI_UNAVAILABLE, AI_TIMEOUT, AI_INVALID_OUTPUT, AI_PLAN_INVALID, DISCOVERY_FAILED, CREDENTIAL_REQUIRED, CREDENTIAL_UNAVAILABLE, UNSUPPORTED_SCENARIO (real backend, `TestPlanController.statusFor`)** | `request()` throws ApiError(503); runPlan rejection handler (AiBuilderPage.tsx:277-298) checks only 401/abort → falls to `PLAN_ERROR_MESSAGES.AI_UNAVAILABLE` — **`error.body.errorCategory` is never read** | ❌ **HIGH F-01** |

F-01 reproduction (production code, probe against 503 + `{status:"FAILED", errorCategory:"CREDENTIAL_UNAVAILABLE"}`):
```
UI DISPLAYS: "AI Test Builder is temporarily unavailable. Try again in a moment."
SHOULD DISPLAY: "The selected credential is not available. Choose another."
MATCH: false
```
Only the last-resort message shows; the description line shows the backend's bounded message, but the title (the actionable part) is wrong for 8 of 9 categories. Fix is small: in the rejection handler, read `error.body?.errorCategory` when `error instanceof ApiError` and map through `PLAN_ERROR_MESSAGES`.

Other checks: no raw provider strings (backend contract guarantees bounded messages; frontend only ever renders `failed.message` when it is a string — backend `PlannerErrorCategory.customerMessage()` is business-safe); no stack traces (nowhere rendered); retry paths exist (Retry + Edit intent on every failure view); user input preserved on failure (intent retained; failure view's Edit intent returns to composer with intent intact — verified live).

### D9 — Test Quality

| Claim | Verdict | Evidence |
|-------|---------|----------|
| 198 unit tests pass | ✅ VERIFIED | Ran `pnpm test`: `tests 198 / pass 198 / fail 0` |
| 33 E2E pass | ✅ VERIFIED | Ran `pnpm test:e2e`: `33 passed (26.2s)` |
| Tests assert behavior, not strings | ✅ MOSTLY | planner.test.ts stubs fetch and asserts **request bodies/headers/URLs** (real behavioral coverage of api layer); E2E specs drive real UI through mount→build→review→confirm→deep-link with the mock engine — genuinely behavioral |
| Confirm 409 → "already confirmed" | ✅ | `planner.spec.ts:200-225` (route-fulfilled 409) + live test 3 |
| 404 → expired message | ✅ | `planner.spec.ts:177-198` + live test 2 |
| RTL toggle works | ✅ | `planner.spec.ts:267-278`, `sidebar-ia.spec.ts:153-163`, `test-creation.spec.ts:348` + live geometric mirror |
| Idempotency-Key sent on confirm | ✅ | `planner.test.ts:121-132` (header asserted) + live capture `5b70af79-…` |
| Key NOT regenerated on retry | ⚠️ PARTIAL | Unit test asserts keys unique per call (91-96) — no test covers same-key retry; and the UI path for it is dead code (F-03), so it is untestable as shipped |
| Terminology customer-facing | ⚠️ WEAK | No automated terminology test exists in this changeset; sweep was manual (this audit) |
| Sidebar filters READY vs DRAFTS | ✅ | `sidebar-ia.spec.ts:71-102` — real API-driven draft creation, then visibility assertions |
| Deep link (pendingDefinitionId) | ✅ | `sidebar-ia.spec.ts:132-151` + planner.spec full-flow `115-136` + live test 6 |
| 24 acceptance criteria evidenced from real tests | ⚠️ MOSTLY | E2E covers the flows; the FAILED-category acceptance evidence only holds for the 200-shaped mock — with the real backend the same criteria would fail (F-01/F-02) |

Red-flag scan: no tests mock the thing under test (planner.test.ts mocks only the transport, which is appropriate); no `.skip`; negative tests present (invalid requestedType 400, no-key 400, unknown plan 404 in `planner.spec.ts:93-113`); tests would fail if code deleted (they assert concrete rendered headings and request shapes).

### D10 — Deep Link Preservation

| Check | Evidence | Status |
|-------|----------|--------|
| `pendingDefinitionId` mechanism | Unchanged; now routes to `drafts-reviews` (`App.tsx:640-647`, `656-657`); `key={active:pendingDefinitionId}` remounts correctly | ✅ |
| `pendingRunId` | Routes to `run-history`; `openRunId` consumed one-shot in `RunHistory.tsx:361-394` | ✅ |
| `onOpenDefinition(definitionId)` | Success view wires it (AiBuilderPage.tsx:639) | ✅ |
| Detail mounts via deep link | Live test 6: success → Open Test → TestDefinitionDetail open on the new definition ("Mock planned test", v1 Draft) | ✅ VERIFIED LIVE |
| No regression from IA migration | test-creation.spec updated only for renamed nav labels (diff shown); all 17 PR10B-era E2E tests pass | ✅ |

### D11 — PR10B Regression Check

- `pnpm test` includes `discovery.test.ts` + `testSourceBuilders.test.ts` (PR10B suites) — **pass unchanged** (198 total).
- E2E run includes all PR10B flows (tests 17-33: manual request, manual editor UI/API/MIXED, double-submit idempotent replay, cross-tenant 404, admin transitions, UI discovery → draft, discovery error mapping, Arabic discovery, schema-1.1 retention, journey mismatch) — **all pass**.
- The only PR10B-file changes in this branch are nav-label selectors in `tests/e2e/test-creation.spec.ts` ("New Test"→"Create Test", "Creation Requests"→"Test Requests") and `CreateTestPage.tsx` onViewDrafts/onViewRequests retargeting — consistent with the IA rename, no logic change.
- Discovery flow, 60s timeout, manual editors, schema 1.1 builders: verified passing via the suite above. ✅ NO REGRESSION

### D12 — Improvised Components

Only `ClarificationView` is improvised (`AiPlanViews.tsx:744-828`):
- Not in the received Figma (per adaptation header comment listing the adapted views; ClarificationView is absent from that list) — **consistent with claim, but Figma original unavailable for diff (see D2)**.
- Uses primitives (`Button`), token classes, i18n keys (`pr10c.clarification.*` with EN+AR) ✅
- Handles category labels for all backend clarification categories incl. `MISSING_ACCOUNT`/`UNCLEAR_OUTCOME` variants (`categoryLabel`, 10-27) ✅
- Supports string AND object questions (AiBuilderPage.tsx:240-255 normalizes both) ✅
- a11y: each answer input has `aria-label={item.question}`; buttons labeled ✅

No undisclosed improvised components found: every other PR10C view claims Figma provenance; `PreflightUrlView`, `AuthRequiredView`, `DuplicateView`, `ConfirmingView`, `OtherWayCard` are page-local helpers (documented as such in the file headers).

### D13 — Backend Integration Accuracy

Checked frontend types against the actual Java sources:

| Assumption | Backend reality | Status |
|-----------|-----------------|--------|
| PLAN_READY flat fields | `planReadyBody` (TestPlanController.java:185-203): flat `status/planId/testType/title/description/authenticationRequired/credentialReference/steps/expectedOutcomes/requiredCapabilities/warnings/definitionSourceJson` — frontend `TestPlan` matches 1:1 | ✅ |
| No `confidence`/`expiresAt` expected | Absent from frontend type and code | ✅ |
| Questions are strings | Backend `ClarificationRequest.questions: List<String>`; frontend tolerates string OR object (defensive) | ✅ |
| `requestedType` null-able in clarification | `clarification.requestedType()` may be null → `.name()` only when non-null | ✅ frontend reads it optionally |
| 404 (not 410) on expired | Controller returns 404 for unknown/expired/cross-tenant | ✅ |
| Confirm body `{name?, description?}` | `ConfirmTestPlanRequest` name/description optional; defaults from plan | ✅ |
| journeyType mapping | `COMPOSER_TO_WIRE: UI→USER_JOURNEY, API→BACKEND_CHECK, MIXED→END_TO_END` (planner.ts:15-19) — matches `PlannedTestType.fromWire` | ✅ |
| credentialId semantics | Frontend sends `clientId` as credentialId when credential selected (AiBuilderPage.tsx:205). Verified against `PlannerCredentialService.requireUsableCredential` (47-70): **a credential reference is ALWAYS the client's own config credential; `credentialId != clientId` is a cross-tenant attempt and 404s**. So `credentialId = clientId` is exactly correct | ✅ |
| FAILED delivery status | `statusFor`: INTENT_AMBIGUOUS→200, **default→503** | ❌ mismatch → F-01 |
| Confirm single-use semantics | finally-block `consumePlan(planId)` — sequential retry after success = 404 | ✅ frontend's 404→"expired" mapping matches this documented behavior |

### D14 — Bundle / Build Health

| Check | Result |
|-------|--------|
| `pnpm typecheck` | ✅ clean |
| `pnpm test` | ✅ 198/198 |
| `pnpm test:e2e` | ✅ 33/33 |
| `pnpm build` (with deployable `VITE_API_BASE_URL`) | ✅ built in 474ms |
| Build with loopback URL | Correctly **refused** by vite.config deploy guard (pre-existing guard, good behavior) |
| No new dependencies | ✅ `package.json` identical to main |
| Bundle size | main 1.53MB → branch 1.61MB JS (+~5%, under the 10% flag threshold; pre-existing >500kB chunk warning unchanged in nature) |
| console.log / TODO / FIXME / commented-out code in new files | ✅ zero (grep across `src/components/planner/`, `src/lib/planner.ts`, `src/lib/planner.test.ts`) |

---

## SECTION 3 — Adversarial Test Results

All tests executed live (mock engine + dev server + real browser session on the working tree).

| # | Test | Expected | Observed | Pass/Fail |
|---|------|----------|----------|-----------|
| 1a | FAILED plan, HTTP **200** + errorCategory=AI_TIMEOUT (mock shape) | Timeout message | "The plan took too long to generate. Try again." rendered | ✅ PASS |
| 1b-1 | PLAN_READY missing `planId` | Safe invalid-output handling | "The plan could not be finalized. Try again or adjust your request." (AI_INVALID_OUTPUT guard, AiBuilderPage.tsx:221-227) | ✅ PASS |
| 1b-2 | PLAN_READY with empty `steps` | No crash; review blocked | Proposed view rendered; "Review Test" disabled; "+ Add action manually" offered | ✅ PASS |
| 1b-3 | FAILED with invalid errorCategory "NOT_A_REAL_CATEGORY" | Safe fallback | "AI Test Builder is temporarily unavailable…" + bounded message as description | ✅ PASS |
| 1c | FAILED plan, **HTTP 503** + errorCategory=CREDENTIAL_UNAVAILABLE (**real backend shape**) | "The selected credential is not available. Choose another." | **"AI Test Builder is temporarily unavailable. Try again in a moment."** — category ignored | ❌ **FAIL (F-01)** |
| 2 | Expired plan: confirm → 404 | "This plan has expired. Please create a new one." | Exact message rendered, Retry + Edit intent offered | ✅ PASS |
| 3 | Duplicate confirm: 409 | "Already confirmed" → drafts | "Already confirmed" heading; "View in Drafts & Reviews" navigates to the drafts page | ✅ PASS |
| 4 | Network failure on confirm (fetch rejects) | Key preserved for retry; safe message | "Something went wrong. Please try again." rendered; key `189f904f-…` captured once. Retry re-plans (new key — correct for new intent). Key-preserving `retryConfirm` unreachable from UI (F-03) | ⚠️ PARTIAL |
| 4b | Confirm aborted mid-flight (AbortError) | Safe message, no hang | "Something went wrong. Please try again."; no stale success state | ✅ PASS |
| 5 | RTL toggle (lang=ar) | Full mirror; URLs LTR; numerals Western | `dir=rtl`; sidebar geometrically on the RIGHT (x 1025-1280) with main content left; origin badge `dir="ltr"`; "01"/"02"/"2" Western; all strings Arabic | ✅ PASS |
| 6 | Deep link: Create → confirm → success → Open Test | Detail opens with the created definition | TestDefinitionDetail opened on "Mock planned test" (v1, Draft) inside Drafts & Reviews | ✅ PASS |
| 7 | Terminology sweep | No forbidden terms in PR10C code | Clean except F-04 ("READY" token in `testdef.noReadyOnPageHint`) | ⚠️ 1 LOW |

---

## SECTION 4 — Findings by Severity

| ID | Finding | Severity | File : Line | Fix Owner | Effort |
|----|---------|----------|-------------|-----------|--------|
| F-01 | Plan FAILED delivered over HTTP 503 by the real backend is never mapped to its `errorCategory`; the rejection handler (only 401/abort checks) falls through to the generic AI_UNAVAILABLE message. 8 of 9 error categories render the wrong message in production. Probe-verified with production code. | HIGH | `src/components/planner/AiBuilderPage.tsx:277-298` (rejection path); root also in mock `tests/e2e/mock-engine.mjs:944-951` | Frontend | S (in the catch branch, `if (error instanceof ApiError && typeof error.body?.errorCategory === "string")` → map via `PLAN_ERROR_MESSAGES`; plus mock fix in F-02) |
| F-02 | E2E mock serves plan FAILED at HTTP 200; real controller serves 503 (INTENT_AMBIGUOUS only at 200). The mock divergence masked F-01 and makes the suite contract-unfaithful. | MEDIUM | `tests/e2e/mock-engine.mjs` (planner POST branch, ~line 944) | Frontend | S (serve FAILED at 503 except INTENT_AMBIGUOUS; update the two affected E2E expectations) |
| F-03 | `retryConfirm()` — the same-key network-uncertain retry — is defined but never wired to any UI element (dead code). The "Idempotency-Key NOT regenerated on retry" guarantee cannot be exercised by a user; the failed-confirm view's Retry re-plans with a NEW key. Behavior is safe (new intent ⇒ new key is correct) but the designed recovery path is missing. | MEDIUM | `src/components/planner/AiBuilderPage.tsx:403-407` (unused) vs `:398` fallback | Frontend | S-M (on a network-failure confirm, keep the review phase and offer "Try again" wired to `retryConfirm`; or delete the dead function and document the semantics) |
| F-04 | Lifecycle token "READY" leaks into a user-facing string: "None of the definitions on this page are READY." | LOW | `src/lib/i18n.tsx:5311` (`testdef.noReadyOnPageHint`) | Frontend | XS (reword to "…are active yet." / AR equivalent) |
| F-05 | TESTS IA filters resolve each row's status via one extra GET per definition (N+1, page-size 50). Functional but chatty; ARCHIVED rows resolved too. | LOW | `src/components/testdefinitions/TestDefinitionList.tsx:143-181` | Frontend (or Backend: add status to list endpoint later) | M |
| F-06 | WorkspaceHeader still lists old `requests` (Asset Requests) beside new `test-requests` (Test Requests) — two "requests" concepts in one nav; Automations header highlight defaults to "Automations" when entered via live-runs/scheduled-runs. | LOW | `src/components/WorkspaceHeader.tsx:13`, `src/components/Automations.tsx:581-586` | Frontend | S |
| F-07 | No automated terminology test (forbidden/required vocabulary) — enforcement is manual. | LOW | — (test gap) | Frontend | S |

---

## SECTION 5 — Claims Verification

| Agent Claim | Verdict | Evidence |
|--------------|---------|----------|
| PLANNER_UI_STATUS = COMPLETE (after FIX 9) | **PARTIAL** | All planner UI states exist and work (verified live end-to-end), but the FAILED-over-503 contract path is broken (F-01) — a production-integration gap, not a missing screen |
| ACCEPTANCE_PASSED = 18/18 (FIX 9) | **PARTIAL** | The E2E suite passes 33/33 and covers the criteria, but two acceptance dependencies are unfaithful: mock FAILED status shape (F-02) and the unreachable key-retry (F-03). With a contract-accurate mock, the FAILED-category criterion would fail |
| 198 unit tests pass | **VERIFIED** | Ran: 198/198 (`pnpm test`) |
| 33 E2E tests pass | **VERIFIED** | Ran: 33/33 (`pnpm test:e2e`) |
| RTL verified | **VERIFIED** | Code (`dir` switch, `rtl:-scale-x-100`, `dir="ltr"` badges) + E2E + live geometric mirror test |
| READY_FOR_REVIEW = true | **PARTIAL** | True in the sense that the branch is reviewable, tested, and clean — but the HIGH finding must be fixed before merge (see gates) |
| Figma TSX adapted, not rewritten | **UNVERIFIABLE** | Received Figma TSX not present in the repo/history; adaptation comments are detailed and consistent but cannot be diffed (D2) |
| ClarificationView is the only improvised component | **PARTIALLY VERIFIED** | No other component claims improvisation; page-local helper views (AuthRequired/Duplicate/Confirming/PreflightUrl/OtherWayCard) are new but documented as page-local, not "[IMPROVISED_MISSING_FIGMA]" — consistent, though Figma originals unavailable to prove absence |
| Sidebar IA migration correct | **VERIFIED** | D3 table above + live navigation + E2E |
| Deep links preserved | **VERIFIED** | D10 + live test 6 |
| PR10B no regression | **VERIFIED** | D11 (all PR10B suites pass unchanged) |

---

## SECTION 6 — Blockers

**None.** No BLOCKER findings.

Merge is gated on the HIGH finding:

- **F-01 (HIGH)** must be fixed before merge: map `errorCategory` from the ApiError body (503 FAILED) in `AiBuilderPage.runPlan`'s rejection handler. Without it, every real planning failure except `INTENT_AMBIGUOUS` shows a wrong, non-actionable message in production.
- **F-02 (MEDIUM)** should land with the same PR: fix the mock to serve 503 so the fixed path is regression-locked; otherwise the fix has no test coverage.

---

## SECTION 7 — Recommendations (ordered)

1. **Fix F-01** — in `AiBuilderPage.tsx` confirm/plan rejection handlers, when `error instanceof ApiError`, read `error.body?.status === "FAILED" && error.body.errorCategory` and map via `PLAN_ERROR_MESSAGES` before the generic fallback. (Small, surgical.)
2. **Fix F-02** — mock: FAILED → 503 (except `INTENT_AMBIGUOUS` → 200 with FAILED body, mirroring `statusFor`); adjust `planner.spec.ts` "failure maps the timeout message" to the 503 path so the mapping is contract-locked.
3. **Resolve F-03** — either wire `retryConfirm` (keep user on review with a "Try confirm again" action after a network-failure) or remove the dead function and add a unit test asserting new-plan ⇒ new key (current de-facto behavior).
4. **Fix F-04** — reword `testdef.noReadyOnPageHint` (and AR) to avoid the literal "READY" token.
5. **F-06** — drop `requests` from `WORKSPACE_NAV` (or relabel to "Asset Requests") and pass the true `active` into Automations' header for live-runs/scheduled-runs highlight.
6. **F-05** — track a backend follow-up to include latest-version status in the list endpoint; until then the N+1 is acceptable (bounded 50/page, parallelized).
7. **F-07** — add a cheap unit test asserting the forbidden-vocabulary set does not appear in `pr10c.*`/`nav.*` i18n values.
8. Optional: restore Figma TSX originals into the repo (e.g. `src/imports/`) so provenance claims (D2) become verifiable for future audits.

---

## SECTION 8 — Final Verdict

```
AUDIT_STATUS       = COMPLETE
VERDICT            = CHANGES_REQUIRED
BLOCKERS           = 0
HIGH               = 1
MEDIUM             = 2
LOW                = 4
READY_TO_MERGE     = false
```

**Rationale:** The branch is close to merge quality — contract shapes, IA migration, deep links, RTL, PR10B compatibility, and the test suite are all genuinely solid and independently verified. But the real backend delivers planning FAILED over HTTP 503, and the frontend only maps `errorCategory` from HTTP-200 bodies (probe-confirmed with production code): in production, 8 of 9 planning failure categories would show "AI Test Builder is temporarily unavailable" instead of the contract-mandated category message. The E2E mock serves FAILED at 200, which masked the defect behind an 18/18 green suite. Per the gates (no HIGH findings may merge without explicit documented follow-up), the verdict is CHANGES_REQUIRED with one small, well-localized fix (plus the mock correction to lock it).
