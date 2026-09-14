# PR10C.5 Phase 2 Frontend — Independent Audit Report

Branch: `feature/pr10c5-phase2-frontend` @ `bb43b39` · Base: `main` · Date: 2026-09-12
Mode: READ-ONLY audit. No code modified. Every claim below cites file:line evidence.
Executed: unit suite (224/224 pass), credentials e2e (12/12 pass), full e2e (48/48 pass), typecheck pass, build pass (with `VITE_API_BASE_URL=/`).

---

## SECTION 1 — Executive Summary

**Verdict: APPROVE_WITH_FOLLOWUPS** — no blockers, no HIGH findings. The agent's core claims hold up under adversarial testing. One MEDIUM (manual-editor review/submit description mismatch + silent truncation risk) and four LOW/NOTE items should be tracked as follow-ups. Nothing blocks merge.

Findings by severity: BLOCKER 0 · HIGH 0 · MEDIUM 1 · LOW 4 (incl. 2 NOTEs)
Top items:
1. [MEDIUM] Manual editor reviews raw `description` but submits `description + credential metadata` (can also silently truncate at 2000 chars) — `ManualEditorFlow.tsx:190-195,829-838,857-870`.
2. [LOW] No double-submit guard/test on credential Save — rapid double-click can fire 2 POSTs (`CredentialFormModal.tsx:85-89`, `CredentialsSection.tsx:126-152`).
3. [LOW] Hardcoded placeholder `"Customer Login"` not via i18n (`CredentialFormModal.tsx:120`).
4. [NOTE] `credentialStats` counts `INVALID` inside "Needs Setup" — sensible UX, deviates narrowly from the audit brief (`credentials.ts:226-235`).
5. [NOTE] D2 Figma-adaptation claim is UNVERIFIABLE — no credential Figma originals in `src/imports/` to diff against.

Agent-claim scorecard: 9 VERIFIED · 2 PARTIAL (portal fix verified by test, mobile/viewport coverage partial; edit-blank-username verified for password path strongly, username path by unit+code) · 0 FALSE · 1 UNVERIFIABLE (D2 originals).

---

## SECTION 2 — D1 through D14

### D1 — Backend contract adherence — PASS ([VERIFIED])

| Check | Expected | Found | Status | Evidence |
|---|---|---|---|---|
| 6 endpoints | GET/POST list+create, GET/PUT/DELETE one, POST /test | All 6 present, exact paths | [VERIFIED] | `src/lib/api.ts:3240-3304` (`apiListCredentials`, `apiGetCredential`, `apiCreateCredential`, `apiUpdateCredential`, `apiDeleteCredential`, `apiTestCredential`); backend `CredentialController.java:42-167` same 6 routes |
| Request bodies | Create `{name,type,username,password}`; Update all-optional | Exact match | [VERIFIED] | `api.ts:3214-3232`; backend `CredentialDtos.java:31-38` identical records |
| Response type | `{id,name,type,status,usernameMasked,lastUsedAt,useCount}` | Exact match (7 fields, no extras) | [VERIFIED] | `api.ts:3202-3212` vs `CredentialDtos.java:20-28` field-for-field |
| No invented endpoints/fields | — | None; list unwraps `{credentials:[]}` per backend `Map.of("credentials")` | [VERIFIED] | `api.ts:3244-3248`; `CredentialController.java:63` |
| Error mapping | 400/401/404/409/503; cross-tenant 404; 503 migration window | 400→validation+field, 409→name conflict, 404→stale, 503→unavailable, 0→network; 401→onUnauthorized; 503 copy shown | [VERIFIED] | `credentials.ts:172-203`; `CredentialsSection.tsx:76-88,143-149,165-171,184-195`; backend `CredentialController.java:171-185` + `requireClient` (404 sameness) |
| Test endpoint | POST `/{cid}/test` → `{success,message}` | Correct method+path+type; sends `{}` body (backend ignores body) | [VERIFIED] | `api.ts:3296-3304`; `CredentialDtos.java:41`; mock `mock-engine.mjs:1110-1125` |

Adversarial (via mock + e2e, all observed): long name →400, bad type →400, duplicate →409, cross-tenant/missing →404, 503 →safe copy, no secret fields in any view — PASS. Evidence: `mock-engine.mjs:1028-1060`, `credentials.spec.ts:119-132,202-289`.

Sub-note: frontend types `type`/`status` as closed unions while backend sends `String`; `groupByType` defensively folds unknown → USER_ACCOUNT instead of crashing (`credentials.ts:39-48`). Good.

### D2 — Figma TSX handling — UNVERIFIABLE (honest)

| Check | Status | Evidence |
|---|---|---|
| Adaptation comments present | [VERIFIED] | `CredentialsSection.tsx:26-34`, `CredentialSelector.tsx:12-20`, `CredentialFormModal.tsx:18-25` (with `[IMPROVISED_MISSING_FIGMA]`), `AiComposer.tsx:16-22` |
| Originals exist / diff adapted vs original / no rewrite | [UNVERIFIABLE] | `src/imports/` contains only `native-logo*.png`, `image.png`, `pasted_text/*.md` (+1 `.tsx`: `client-flows.tsx`) — no credential Figma originals to diff. Claim accepted only as "comments + visual-language consistency", not as a verified diff. |
| Improvised marker (1: CredentialFormModal) | [VERIFIED] | Exactly one `[IMPROVISED_MISSING_FIGMA]` marker, on the modal (`CredentialFormModal.tsx:19`) |

### D3 — Settings page correctness — PASS ([VERIFIED])

Route `settings-credentials` → `Settings initialSection="credentials"` (`App.tsx:638-639,672-678`), nav entry with `needsClient` (`Settings.tsx:983,1163-1169`). Header/notice/stats/list/loading/empty/error-with-retry all present (`CredentialsSection.tsx:204-316`). Rows show name/type/status/`usernameMasked`/`useCount`+lastUsed; chevron expands (`302-315,374-473,477-561`). `dir="ltr"` on masked username (`493`). 503 → `unavailable503` copy; other failures → `loadFailed` (`80-88`). Stats from `credentialStats` (see F-04 note). E2E: page loads, stats, badges, expand (`credentials.spec.ts:78-102`). **Adversarial**: empty list → EmptyState; 503 → safe message (`202-217`); stats render from real list. PASS.

### D4 — CRUD flows — PASS ([VERIFIED])

Add: empty form, create-mode requires name/username/password (`credentials.ts:99-124`), POST→refresh→close+toast, 400/409 inline, Cancel closes without request (`CredentialsSection.tsx:112-152`, `CredentialFormModal.tsx:85-89,211-229`). E2E duplicate-name stays open with inline error (`credentials.spec.ts:119-132`). Edit: pre-fills name/type only, username/password blank (`initialValues`, `CredentialFormModal.tsx:233-240`); blank omitted from PUT (`credentials.ts:142-153`); PUT→refresh (`CredentialsSection.tsx:132-138`). Unit covers blank-username + blank-password keep (`credentials.test.ts:170-196,214-232`). Delete: proper `Modal` confirm with usage warning (no `window.confirm`), DELETE→204→refresh (`CredentialsSection.tsx:154-174,329-365`); e2e confirms dialog-then-remove (`158-168`). **Adversarial**: 409 inline (not close) PASS; blank-password keep verified end-to-end via status stays CONFIGURED (`134-156`); delete requires confirmation PASS. Gaps → F-02 (double-click), username-blank network-body path asserted at unit level only (PARTIAL, no e2e request-body capture for username).

### D5 — Test connection flow — PASS ([VERIFIED])

Per-row button in expanded detail with loading state (`CredentialsSection.tsx:519-528,176-196`); POST `/test`; success/failure inline panel, failure refreshes list (backend flips INVALID) (`180-195,537-559`); copy via `testResultMessage` prefers bounded backend message, falls back to generic (`credentials.ts:218-223`); network/503 mapped, never raw (`172-203`). E2E success + failure paths (`170-200`). The agent's "bounded message, no per-failure-code copy" limitation is accurate and matches the frozen `TestResult(success,message)` contract — not a defect.

### D6 — AI Composer selector (CRITICAL) — PASS ([VERIFIED])

`CredentialPill` replaced: `AiComposer.tsx:73-78` re-exports `CredentialSelector`; `Composer` renders it (`160-166`); `AiBuilderPage` drops `wantCredential/credConfigured` alias for `selectedCredentialId: number|null` + real list fetch with graceful empty degradation (`104-108,150-167`). Grouped by type, status badges, empty CTA, footer note (`CredentialSelector.tsx:182-231,165-180,227-231`). Sends real id: `credentialId = selectedCredentialId` spread only when non-null (`AiBuilderPage.tsx:228-238`). Auth-required preflight preserved (`199-208,611-629`); continue-without clears (`622-625`). **Adversarial**: e2e selects "Default Configured", builds, probes `last-planner-credential` ≠ clientId and typeof number (`credentials.spec.ts:295-330`; probe `mock-engine.mjs:993-997`, recorder `1182-1185`). Portal fix: dropdown renders via `createPortal(..., document.body)` with outside-click handling that includes the panel (`CredentialSelector.tsx:140-234,62-77`) — composer root is `overflow-hidden` (`AiComposer.tsx:112-119`), so the portal is the correct fix; e2e clicks the dropdown successfully. Mobile-viewport positioning not explicitly exercised → PARTIAL on viewport coverage only.

### D7 — Manual editor integration — PARTIAL ([PARTIAL], see F-01)

Frozen contract truly has no `credentialId`: `apiCreateManualEditorDraft` body is `{journeyType,name,description,flowId,initialSourceJson}` (`api.ts:3074-3096`); create-request payload likewise has no credential field. Wizard convention confirmed: `buildManualRequestDescription` emits an `"Authentication (references only)"` section (`testCreation.ts:182-197`). Editor follows it: appends `"Authentication (references only): Secure Credential — <name>"` (slice 2000) (`ManualEditorFlow.tsx:190-195`). BUT: review step renders raw `{description}` (`829-838`), not the submitted `payload.description`, so the exact submitted text is never reviewed — reviewer sees a separate credential block instead (`857-870`). Honest-ish but mismatched; plus silent truncation risk at the 2000 cap. → F-01 [MEDIUM]. No secret values ever stored (name only).

### D8 — Terminology enforcement — PASS ([VERIFIED], scope-noted)

New credential i18n block (`i18n.tsx:905-1167`) inspected: required terms present ("Secure Credential", "Configured/Not configured/Needs attention", "User Account/API Service", "Test connection", "Add credential/Edit/Delete/Remove"); forbidden tokens absent from these values (no MCP/Playwright/STDIO/Chromium/broker/proxy/JSON-RPC/tools-call/Assertion/Locator/AES/ciphertext etc.). Grep hits for `Assertion/Locator/secret references` are pre-existing PR10B/test-builder strings and code identifiers (exempt), not new credential UI. One deviation → F-03 (hardcoded placeholder).

### D9 — Security — PASS ([VERIFIED], critical gate green)

Password exists only in `CredentialFormModal` via `PasswordInput` (forced `type="password"`, `primitives.tsx:601-603`) with `autoComplete="new-password"`; username `dir="ltr"`, `autoComplete="off"` (`CredentialFormModal.tsx:162-197`). No password display anywhere; list shows `usernameMasked` only. No `console.log`/TODO in new code (grep clean), no `localStorage/sessionStorage` in credential modules (grep clean), no secrets in URLs. Mock secret `DEFAULT_CREDENTIAL_SECRET="mock-secret"` never served — `credentialView` returns metadata only (`mock-engine.mjs:69-70,118-135`); e2e asserts secret absent from content after expand and after create (`94-102,104-117`). Responses carry no `password/secret/encrypted` fields (DTO + controller comments confirm). PASS.

### D10 — RTL/Arabic — PASS ([VERIFIED])

`dir` flips via i18n provider (`i18n.tsx:5597-5598`); e2e asserts ltr→rtl + Arabic heading (`credentials.spec.ts:356-370`). Chevron/selectors mirror (`CredentialsSection.tsx:462`, `CredentialSelector.tsx:128`, `AiComposer.tsx:156`); username inputs stay `dir="ltr"` (`CredentialFormModal.tsx:166`, `CredentialsSection.tsx:493`); full AR dictionary for all credential keys (`i18n.tsx:905-1167`); `useCount` interpolates Western numerals. Positioning under RTL uses `Math.max/min` clamping but keeps `left` anchoring — works, not perfectly mirrored; covered as LOW-grade note inside F-05 scope (no failure observed in test).

### D11 — i18n completeness — PASS ([VERIFIED] modulo F-03)

All `settings.credentials.*` / `credentials.*` keys used in code exist in EN+AR; AR values are real translations (not fallback). Key naming follows conventions. One hardcoded string: `placeholder="Customer Login"` (`CredentialFormModal.tsx:120`) → F-03. Terminology guard (`terminology.test.ts`) covers `pr10c.*`/`nav.*`/`testdef.*` and passes within the 224.

### D12 — Test quality — PASS ([VERIFIED] with honest mutation note)

Unit 224/224 pass (observed `pnpm test` tail: `tests 224, pass 224, fail 0`); e2e 48/48 pass (observed full run `48 passed`), of which `credentials.spec.ts` contributes 12. New unit file `credentials.test.ts` (287 lines) asserts behavior (validation boundaries incl. 120-char edge, builders trim/omit semantics, error mapping per status, stats/grouping). E2E covers page, expand, add, duplicate-409, edit-keep-secret, delete-confirm, test success+failure, 503, REST CRUD+cross-tenant, composer REAL id, auth-required, Arabic. No skips observed. **Mutation tests**: not executed by code mutation (READ-ONLY constraint) — verified by inspection instead: (1) sending `clientId` would fail `credentials.spec.ts:328` (`not.toBe(CLIENT_ID)`); (2) restoring username-required on edit would fail `credentials.test.ts:186-196`; (3) removing the portal would re-clip inside `overflow-hidden` composer and break dropdown click (`credentials.spec.ts:303-313`) — asserted by code path, not by re-running mutants. Honestly marked as inspection-verified, not run-verified.

### D13 — Regression — PASS ([VERIFIED])

Full `pnpm test:e2e` → 48 passed (includes planner, test-creation, lifecycle suites). No test files deleted (`git diff --stat -- tests`: only `credentials.spec.ts` +276/`mock-engine.mjs` +226/`planner.spec.ts` +9/-2). `planner.spec.ts` delta is additive (credential probe support). PR10C/Phase-0/manual-editor/composer flows all green in the same run.

### D14 — Bundle/build health — PASS ([VERIFIED])

`pnpm typecheck` clean; `pnpm test` 224/224; `pnpm test:e2e` 48/48; `pnpm build` succeeds with `VITE_API_BASE_URL=/` (fails without it by design — deploy guard, not a defect). `package.json`/`pnpm-lock.yaml` diff empty (no new deps). No `console.log`/TODO in new code (grep clean). Bundle: `index-*.js 1708 kB (gzip 417 kB)` with pre-existing >500 kB chunk warning — no baseline in scope to call it a regression; noted, not flagged.

---

## SECTION 3 — Adversarial Test Results

| # | Test | Expected | Observed | Result |
|---|---|---|---|---|
| 1 | Composer sends REAL id (select Default → Build → probe) | `credentialId` = real row id, ≠ 7 | e2e asserts `not.toBe(7)` + typeof number; probe records `body.credentialId` | PASS |
| 2 | Dropdown not clipped (composer `overflow-hidden`) | Options visible/clickable | Portal to `document.body`; e2e opens + selects grouped options | PASS (desktop; mobile viewport not exercised → partial) |
| 3 | Edit blank = keep | PUT omits username/password; status stays CONFIGURED | Unit asserts omit-semantics; e2e asserts CONFIGURED survives blank-password edit | PASS (password E2E; username body at unit level) |
| 4 | Cross-tenant 404 | 404 not 403 | `requireClient` sameness; e2e `404/404` for missing + other-client | PASS |
| 5 | Migration 503 | Safe copy, no crash | `unavailable503` rendered; mapped error copy on mutations | PASS |
| 6 | RTL mirror (ar) | `dir=rtl`, Arabic strings, LTR usernames | e2e `ltr→rtl` + Arabic heading; `dir="ltr"` on username fields | PASS |
| 7 | Manual-editor honesty | Credential note in submitted description; UI not misleading | Name-only metadata appended; review shows credential block but NOT the exact submitted description text; truncation risk | PARTIAL → F-01 |
| 8 | No secrets in responses | No password/secret/encrypted fields; masked username format `abc***` | DTO/view carry metadata only; mask `slice(0,3)+"***"`; e2e content checks | PASS |
| 9 | Duplicate name 409 | Inline error, modal stays open | `credentials.spec.ts:119-132` | PASS |
| 10 | Delete confirmation | No auto-delete | Proper Modal; e2e dialog-then-delete | PASS |

---

## SECTION 4 — Findings by Severity

| ID | Finding | Severity | File:Line | Owner | Effort |
|---|---|---|---|---|---|
| F-01 | Manual editor review/submit mismatch: review renders raw `description` while submit sends `description + "\n\nAuthentication (references only): …"`; combined text `.slice(0,2000)` can silently truncate user input. Reviewer sees a separate credential block, so context isn't hidden — but the exact submitted string is never reviewed. Fix: render `payload.description` (or the credential suffix) in review + validate combined length before submit. | MEDIUM | `ManualEditorFlow.tsx:190-195,829-838,857-870` | Frontend | S (1-2h) |
| F-02 | No double-submit guard/test: `submit()` calls `onSubmit` synchronously; `saving` disables only after re-render, so rapid double-click can fire 2 POSTs (dup-name → 409 saves it, but non-idempotent creates could double). Fix: disable synchronously (ref guard) + e2e double-click test. | LOW | `CredentialFormModal.tsx:85-89`; `CredentialsSection.tsx:126-152,220-227` | Frontend | S |
| F-03 | Hardcoded placeholder `placeholder="Customer Login"` bypasses i18n (shows English in AR). Fix: move to `credentials.form.nameHint`-style key. | LOW | `CredentialFormModal.tsx:120` | Frontend | XS |
| F-04 | NOTE: `credentialStats` folds `INVALID` into "Needs Setup" (`needsSetup = NEEDS_SETUP + INVALID`). Sensible UX; brief asked NEEDS_SETUP-only. Keep + document, or split third card. | LOW (note) | `credentials.ts:226-235` | Frontend/PM | XS |
| F-05 | NOTE: D2 adaptation claim UNVERIFIABLE (no Figma originals in repo to diff). Comments + `[IMPROVISED_MISSING_FIGMA]` present and visual language consistent; do not present as "diff-verified". | LOW (process note) | `CredentialsSection.tsx:26-34`; `src/imports/` listing | Process | — |

No console.log/TODO/secrets/storage/dep-change issues found (greps clean, package diff empty).

---

## SECTION 5 — Claims Verification

| Agent Claim | Verdict | Evidence |
|---|---|---|
| 224/224 unit (23 new) | [VERIFIED] | `pnpm test`: 224 pass; `credentials.test.ts` 287 lines new |
| 48/48 e2e (12 new) | [VERIFIED] | Full run 48 passed; `credentials.spec.ts` 12 tests all pass |
| Build passes | [VERIFIED] | `pnpm build` ✓ with `VITE_API_BASE_URL=/` (guard without it is by design) |
| RTL verified | [VERIFIED] | `i18n.tsx:5597-5598`; e2e AR test; `dir="ltr"` + `rtl:` mirrors |
| 0 forbidden tokens in UI | [VERIFIED] (scope: new credential strings) | `i18n.tsx:905-1167` clean; other hits pre-existing/exempt |
| READY_FOR_REVIEW=true | [VERIFIED] | Justified — no blockers |
| Bug 1: dropdown clipping → portal | [VERIFIED] | `CredentialSelector.tsx:140-234`; composer `overflow-hidden` (`AiComposer.tsx:112`); e2e selection passes |
| Bug 2: edit username blank=keep | [PARTIAL] | Strong for password (unit+e2e); username path unit (`credentials.test.ts:186-196`) + builder (`credentials.ts:142-153`) + placeholder UX (`CredentialFormModal.tsx:167-171`); no e2e request-body capture for username |
| Limitation 1: manual editor = description metadata | [PARTIAL] | True that contract lacks the field; convention followed; but review/submit mismatch + truncation → F-01 |
| Limitation 2: backend Phase 1 unmerged | [VERIFIED] as process fact | Frontend + mock implement the frozen contract; backend merge state outside this repo's scope |
| Limitation 3: bounded test message, no per-code copy | [VERIFIED] | Matches `TestResult(success,message)`; `testResultMessage` (`credentials.ts:218-223`) |

---

## SECTION 6 — Known Limitations Scrutiny

1. **Manual editor stores credential as description metadata.** Accurately described (contract indeed has no `credentialId`). Convention genuinely followed (`testCreation.ts:189` → `ManualEditorFlow.tsx:194`). Impact: reference is human-readable but not machine-bound — downstream execution can't resolve it automatically. UX is *mostly* honest (selector + review credential block + "references only" wording) but review doesn't show the literal appended suffix → F-01. Acceptable for Phase 2 if F-01 fixed; Phase 3 should add a real `credentialId` field.
2. **Backend Phase 1 not merged yet.** Accurate as a sequencing note; frontend degrades gracefully (empty list, 503 copy) and the mock mirrors the frozen DTOs field-for-field. No product-promise break at the UI layer.
3. **Test connection: bounded message, no per-failure-code copy.** Accurate and contract-faithful. The mock distinguishes unconfigured vs unreachable; UI surfaces the bounded message + "needs attention" note. Acceptable; per-code copy is a Phase-3 enhancement, not a Phase-2 gap.

---

## SECTION 7 — Blockers

None. No secrets exposure, no contract breach, no failing suites.

---

## SECTION 8 — Recommendations (ordered)

1. Fix F-01: show the exact submitted description (with credential suffix) in the manual-editor review + validate combined ≤2000 before submit (MEDIUM).
2. Add double-submit guard + e2e double-click test (F-02).
3. i18n-ize the `"Customer Login"` placeholder (F-03).
4. Document/decide F-04 (INVALID counting) and strengthen the composer probe to assert exact credential id equality, not just `≠ clientId`.
5. Add mobile-viewport dropdown + test-connection-timeout e2e cases; keep D2 adaptation evidence (link Figma source) for future phases.

---

## SECTION 9 — Final Verdict

AUDIT_STATUS = COMPLETE
VERDICT = APPROVE_WITH_FOLLOWUPS
BLOCKERS = 0
HIGH = 0
MEDIUM = 1
LOW = 4
READY_TO_MERGE = true
