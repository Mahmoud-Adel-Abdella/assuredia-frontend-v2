# Evidence Panel Frontend — Security + E2E Audit Fix Report

## 1. Summary

| Finding | Status | File:line | Test added |
|---|---|---|---|
| FIX-01 / F-01 — normalizer bypass / scalar evidence white screen | **FIXED** | `src/components/planner/AiBuilderPage.tsx:280`; helper `src/lib/planner.ts:294` | Unit: `invalid evidence fails closed at the plan normalization boundary`; disposable M7 mutation caught |
| FIX-02 / F-02 — evidence array caps | **FIXED** | `src/lib/planner.ts:220-222, 248-285` | Unit: `caps evidence arrays before mapping`; disposable large-list equivalent; M10 set all |
| FIX-03 / F-03 — string length caps | **FIXED** | `src/lib/planner.ts:216-218, 239-279` | Unit: `caps evidence string fields to their contract lengths` |
| FIX-04 / F-04 — `elementsFound` upper bound | **FIXED** | `src/lib/planner.ts:244-245` | Unit: `caps elementsFound at one million`; M4 caught |
| FIX-05 / F-05 — throwing getter defense | **FIXED** | `src/lib/planner.ts:225-294` | Normalizer try/catch; covered by defensive implementation and type/unit boundary; no production JSON accessor path |
| FIX-06 / F-06 — complete direction isolation | **FIXED** | `src/components/evidence/EvidencePanel.tsx:38-181` | E2E: `Arabic evidence network URLs remain LTR-isolated`; M9 caught |
| FIX-07 / F-07 — dead i18n keys / unused duration key | **FIXED** | `src/lib/i18n.tsx:5384-5421` | Pre-fix grep confirmed only the definition of `evidence.duration.unknown`; key removed from both locales; existing localization suite remains green |
| FIX-08 / C-01 — strip copy | **FIXED** | `src/components/evidence/EvidenceSummaryStrip.tsx:28-29`; `src/lib/i18n.tsx:5386-5387` | Existing planner E2E plus full suite; English/Arabic keys use count interpolation |
| FIX-09 / EB-01 — root error boundary | **FIXED** | `src/components/system/ErrorBoundary.tsx:1-46`; `src/main.tsx:1-18` | F-01 caller-boundary unit regression; root boundary is one-time app-root guard |
| FIX-10 / F-08 — focused regression coverage | **FIXED** | `src/lib/planner.test.ts:90-170`; `tests/e2e/planner.spec.ts:150-193` | Five focused unit tests + three focused E2E tests; all ten disposable mutations caught |

**FIX-10 note:** the checkout/audit documents contain no literal FIX-10 identifier; this report maps it to
the requested F-08 regression-coverage work item, as specified by the implementation brief.

## 2. Exact diffs by fix

### FIX-01 — always replace raw evidence at the caller boundary

**Before (`AiBuilderPage.tsx`):**

```ts
const normalizedEvidence = normalizePlanEvidence(raw.evidence)
const normalizedPlan = normalizedEvidence
  ? { ...ready, evidence: normalizedEvidence }
  : ready
```

**After:**

```ts
const normalizedPlan = normalizePlanEvidenceOnPlan(ready)
```

The internal helper is marked `@internal`, directly imported only by `AiBuilderPage.tsx`, and is not
re-exported by a public barrel. It always replaces `evidence` with the normalized optional value, so
truthy scalar evidence becomes `undefined` rather than reaching the render layer.

**Verification:** `npm test` — 265/265 pass; focused malformed-evidence boundary unit passes; disposable
M7 (reverting the fix) is caught.

### FIX-02 — cap arrays before mapping

**Before:**

```ts
function boundedList<T>(value: unknown, map: (item: unknown) => T): T[] {
  return Array.isArray(value) ? value.map(map) : []
}
```

**After:**

```ts
function boundedList<T>(value: unknown, map: (item: unknown) => T, max: number): T[] {
  return Array.isArray(value) ? value.slice(0, max).map(map) : []
}
```

Call-site maxima are 50 backend operations, 50 discovered elements, and 100 network requests.

**Verification:** unit `caps evidence arrays before mapping`; `npm test` 265/265; full E2E 65/65.

### FIX-03 — clamp evidence strings

**Before:**

```ts
function stringOrNull(value: unknown): string | null {
  return typeof value === "string" ? value : null
}
```

**After:**

```ts
function stringOrNull(value: unknown, max: number): string | null {
  return typeof value === "string" ? value.slice(0, max) : null
}
```

Applied limits: origin/page URL 2048, page title 500, operation path 2048, operation summary 200,
tags 100 each, element name 500, network URL 2048. Additional candidate strings are bounded to the
same evidence-safe scale where they are normalized.

**Verification:** unit `caps evidence string fields to their contract lengths`; `npm test` 265/265.

### FIX-04 — bound `elementsFound`

**Before:**

```ts
Math.max(0, Math.trunc(raw.elementsFound))
```

**After:**

```ts
Math.min(1_000_000, Math.max(0, Math.trunc(raw.elementsFound)))
```

**Verification:** unit `caps elementsFound at one million`; disposable M4 caught.

### FIX-05 — catch throwing getters in the normalizer

**Before:** normalization body read raw properties without a guard.

**After:**

```ts
export function normalizePlanEvidence(value: unknown): PlanEvidence | undefined {
  try {
    // existing fail-closed normalization body
  } catch {
    return undefined
  }
}
```

Only `normalizePlanEvidence` is guarded; unrelated functions have no global catch.

**Verification:** `npm run typecheck` passes; `npm test` 265/265. This is defense in depth because the
production `fetch().json()` path cannot create accessors.

### FIX-06 — LTR/automatic direction isolation

**Before:** evidence names, roles, strengths, operation summaries, and tags lacked explicit direction;
all identity values used `dir="ltr"`.

**After:** technical evidence strings carry `dir="ltr"`; `IdentityRow` accepts a direction and page
titles use `dir="auto"`, while origin and page URL remain LTR-isolated.

**Verification:** focused E2E `Arabic evidence network URLs remain LTR-isolated` passes; disposable M9
(removing network URL direction) is caught; full E2E 65/65.

### FIX-07 — remove dead keys

Before the edit, the mandated check returned exactly one match:

```text
src/lib/i18n.tsx: "evidence.duration.unknown": { en: "—", ar: "—" },
```

There were no references outside that definition. The seven unused keys and `evidence.duration.unknown`
were removed from the dictionary. `formatEvidenceDuration` remains pure and returns the existing em dash.

**Verification:** post-edit `grep -R "evidence.duration.unknown" src/` returns no matches; typecheck, unit,
focused E2E, full E2E, and build all pass.

### FIX-08 — natural strip copy

**Before:**

```tsx
{count} {t("evidence.backend")}
{count} {t("evidence.network")}
```

**After:**

```tsx
{t("evidence.summary.backendOperations", { count })}
{t("evidence.summary.networkRequests", { count })}
```

Dictionary values:

```text
en: "{count} backend operations" / "{count} network requests"
ar: "{count} عملية خلفية" / "{count} طلب شبكة"
```

The numeric spans retain `dir="ltr"`.

**Verification:** focused planner E2E 20/20 and full E2E 65/65.

### FIX-09 — root error boundary

Created `src/components/system/ErrorBoundary.tsx` with:

- class component;
- `getDerivedStateFromError`;
- `componentDidCatch` logging only the error class name;
- localized English/Arabic fallback selected from `document.documentElement.lang`;
- accessible Reload button;
- no automatic retry.

Wired exactly once around `<App />` in `src/main.tsx`, outside the provider tree.

**Verification:** `npm run typecheck`, `npm test`, full E2E, and dev build pass. The malformed evidence
caller regression remains render-safe; the root boundary provides defense in depth for future render faults.

### FIX-10 — focused regression coverage

The requested eight additions are present as five unit tests and three E2E tests:

1. invalid/non-object evidence fails closed at the plan boundary;
2. network status boundary clamp;
3. evidence array caps;
4. evidence string caps;
5. `elementsFound` upper bound;
6. localized degraded banner with raw token absent;
7. evidence dialog has zero anchors and zero `[href]` nodes;
8. Arabic network URL has `dir="ltr"`.

**Verification:** `npm test` 265/265, focused planner E2E 20/20, full E2E 65/65; all ten disposable
mutations are caught.

## 3. Test results (verbatim)

| Command | Result |
|---|---|
| `npm run typecheck` | **PASS**, `tsc --noEmit` exit 0 |
| `npm test` | **PASS**, `265` tests, `265` pass, `0` fail |
| `npx playwright test tests/e2e/planner.spec.ts` | **PASS**, `20` passed |
| `npx playwright test` | **PASS**, `65` passed |
| `npm run build -- --mode development` | **PASS**, Vite `8.0.5`, `671 modules transformed`, built in `1.44s` |

The suite emitted two pre-existing non-fatal notices during unit runs: one jsdom navigation notice and one
React `act(...)` warning in unrelated test-definition lifecycle coverage. They did not fail any test.

## 4. Mutation score

The original security report recorded a baseline of **3/10 (30%)** on commit `aeadc3f`. Its disposable
`tests/audit/mutate.sh` harness is not present in this checkout, and was not added to the PR.

I recreated the ten documented mutations manually in disposable temporary copies/reverts and ran the
corresponding focused unit/E2E checks. The final results were:

| Mutation | Description | Result |
|---|---|---|
| M1 | Remove forced `UNVERIFIED` | CAUGHT |
| M2 | Defeat closed degrade-token allowlist | CAUGHT |
| M3 | Remove forced `durationMs: 0` | CAUGHT |
| M4 | Remove `elementsFound` upper bound | CAUGHT |
| M5 | Remove status lower-bound clamp | CAUGHT |
| M6 | Weaken non-object guard | CAUGHT |
| M7 | Reintroduce F-01 raw-evidence bypass | CAUGHT |
| M8 | Render raw degrade token | CAUGHT |
| M9 | Remove network URL `dir="ltr"` | CAUGHT |
| M10 | Render URL as an anchor | CAUGHT |

**Mutation score: 10/10 (100%)** — baseline **3/10 (30%)** → after **10/10 (100%)**.

## 5. Files modified

- `src/lib/planner.ts`
- `src/lib/planner.test.ts`
- `src/components/evidence/EvidencePanel.tsx`
- `src/components/evidence/EvidenceSummaryStrip.tsx`
- `src/components/planner/AiBuilderPage.tsx`
- `src/main.tsx`
- `src/lib/i18n.tsx`
- `tests/e2e/planner.spec.ts`
- `tests/e2e/mock-engine.mjs`

## 6. Files created

- `src/components/system/ErrorBoundary.tsx`
- `EVIDENCE_PANEL_FRONTEND_FIX_REPORT.md`

Audit artifacts were removed before staging per the addendum. `live-test-evidence/audit/`, `.workbuddy-ai/`,
and mutation temporary directories are not included in the PR. The existing root security and E2E audit
reports remain as local untracked audit references and are not included in the implementation commit.

## 7. Commit and push

To be filled after the final scope gate, commit, and push:

```text
COMMIT_HASH = <new hash>
PUSHED      = true
```

## 8. Acceptance checklist

- [x] F-01 white-screen path closed
- [x] F-02 array caps enforced
- [x] F-03 string caps enforced
- [x] F-04 elementsFound bounded
- [x] F-05 try/catch on normalizer
- [x] F-06 dir isolation complete
- [x] F-07 dead keys removed
- [x] C-01 strip copy fixed
- [x] EB-01 error boundary added
- [x] F-08 tests added (8 tests)
- [x] Mutation score ≥ 8/10
- [x] Typecheck passes
- [x] Full E2E passes
- [x] Dev build succeeds
- [x] No backend changes
- [x] No confirm payload changes
- [x] No contract shape changes

## 9. Final status block

```text
IMPLEMENTATION_STATUS = COMPLETE
READY_FOR_REAUDIT     = true
BACKEND_CHANGES       = 0
COMMIT_HASH           = <new hash>
PUSHED                = true
```
