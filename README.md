# Assuredia Dashboard (frontend)

React + Vite + Tailwind CSS admin/client dashboard for the Assuredia **automation-engine**
backend. This repository holds the frontend only; the engine is a separate Spring Boot
project and is versioned in its own repository.

The dashboard is where a client watches the health of their automated test estate — flows,
runs, failures, alerts, AI analysis — and where an Assuredia operator runs the admin
console: onboarding requests, clients, asset requests, the test-creation queue and global
settings.

See [AGENTS.md](AGENTS.md) for the project structure and coding conventions.

## What's in the app

There is **no router**: `src/App.tsx` holds an `active` string in state and swaps whole
views. Three surfaces hang off that state.

### Public surface

| View                  | Component                                | Notes                                                                 |
| --------------------- | ---------------------------------------- | --------------------------------------------------------------------- |
| Landing               | `components/Landing.tsx` (+ `LandingGlass.tsx` variant) | Marketing page, no backend calls                      |
| Log in / Sign up      | `components/LoginScreen.tsx`             | Split-screen: brand panel + tabbed credentials card; email/password **and** OAuth (Google/GitHub) |
| Self-service signup   | `components/SelfServiceOnboarding.tsx`   | Client self-registration → onboarding request for an admin to approve  |
| OAuth callback        | `components/OAuthComplete.tsx`           | Completes the provider round-trip and adopts the session              |

### Client workspace (`components/Sidebar.tsx` nav)

| Group           | View                | Component                                                        | What it does                                                                                    |
| --------------- | ------------------- | ---------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Workspace       | Overview            | `Dashboard.tsx`                                                  | Health KPIs, status breakdown, recent runs, deep-links into Run History                           |
| Workspace       | Flows               | `Flows.tsx`, `FlowForm.tsx`                                      | Create/rename/delete flows, reorder the tests inside a flow, run a flow, raise an asset request   |
| Workspace       | Automations         | `Automations.tsx`, `AutomationForm.tsx`, `AutomationRunView.tsx` | One user-facing model over the backend's Saved Live Runs (manual) + Execution Plans (scheduled)  |
| Workspace       | Test Definitions    | `testdefinitions/*`                                              | List / create / detail with lifecycle (draft → trial → approve → proving → READY → archive), run panel, artifact download |
| Workspace       | Requests            | `Requests.tsx`                                                   | Client-raised asset requests (new flow, new test, …) and their status                             |
| Workspace       | Run History         | `RunHistory.tsx`, `RunDetail.tsx`, `LiveRunView.tsx`             | Past runs, live polling of a running run, failures, cancel, re-run                                |
| Monitoring      | Alerts              | `Alerts.tsx`                                                     | Failure alerts, unread badge, read / resolve / mark-all-read                                     |
| Monitoring      | AI Analysis         | `AiAnalysis.tsx`, `AiCard.tsx`                                   | Trigger analysis on a run and read the stored AI report — real backend data only, no demo content |
| Test creation   | New Test            | `testcreation/TestCreationWizard.tsx`                            | Multi-step wizard that produces a test-definition creation request                                |
| Test creation   | Creation Requests   | `testcreation/CreationRequestsPage.tsx`                          | Track the requests the client submitted                                                          |
| System          | Settings            | `Settings.tsx`                                                   | Account, Security, Environment, Execution, Notifications, Timezone, Preferences (theme + language) |
| Support         | Feedback / Help     | `Feedback.tsx`, `Help.tsx`                                       | Feedback submits to the backend; Help Center is static, localised content                        |

### Admin console (`components/admin/AdminShell.tsx` nav) — `user.role === "ADMIN"`

Overview · Clients (+ `CreateClient.tsx`) · Onboarding Requests · Asset Requests · Runs ·
Test Definitions (any tenant, via a client picker) · Feedback · Alerts · AI Analysis ·
Creation Queue (`testcreation/AdminCreationQueue.tsx`) · Design System
(`ComponentShowcase.tsx`) · Settings (`AdminSettings.tsx`, which also manages the platform
team and shows the audit log).

An ADMIN identity is **not** tenant-scoped (`clientId` is null), so admin screens that need
a tenant ask for one explicitly (for example `AdminTestDefinitions.tsx` mounts the same
`TestDefinitionsPage` the client uses, with a client selector in front of it).

## Project structure

```
src/
  main.tsx                  React entrypoint; applies the saved theme before first paint
  App.tsx                   View switching, header/sidebar shell, cross-view deep links
  index.css                 Tailwind v4 entrypoint + theme tokens (brand ramp, semantic colors)
  components/
    primitives.tsx          Button, Card, Modal, Toast, Skeleton, StatusBadge, cx, …
    Sidebar.tsx             Client workspace navigation + brand marks
    runShared.tsx           Shared run status model/badges used by history, admin, alerts
    WorkspaceHeader.tsx     Page header used by the workspace views
    admin/                  Admin console screens (+ adminData.ts, __tests__)
    testcreation/           Test-creation wizard, client requests page, admin queue
    testdefinitions/        Test Definition list/create/detail/run panel (+ shared.tsx, __tests__)
  lib/
    api.ts                  The only place that talks HTTP. Full contract documented at the top
    auth.tsx                AuthProvider: token → /auth/me → user; login/logout
    i18n.tsx                en/ar dictionary (~1,550 entries) + LanguageProvider
    theme.ts                dark/light via the `dark` class on <html>
    automations.ts          Unifies Saved Live Runs + Execution Plans into one Automation model
    runHistory.ts           Backend run rows → UI history entries
    runData.ts, useLiveRun.ts   Run model + live polling hook
    testDefinitionSchema.ts     Definition schema, validation, starter template
    testDefinitionLifecycle.ts  Lifecycle transitions + backend error mapping
    testCreation.ts, testDefinitionRuns.ts, aiAnalysis.ts, adminRuns.ts, dashboardData.ts, flowsData.ts
  imports/                  Design assets and pasted Figma/design specs kept for reference
tests/e2e/                  Playwright specs + an in-memory engine double (tests/e2e/mock-engine.mjs)
e2e/live/                   Opt-in real-stack suite (real Spring Boot + PostgreSQL) — see its README
```

## Architecture notes

- **Single API boundary.** Everything goes through `src/lib/api.ts`, which owns the token,
  the `VITE_API_BASE_URL` prefix, JSON error parsing (`{ "error": "..." }`) and the mapping of
  known backend error strings to localised messages. Components never call `fetch` directly.
- **Authentication.** `POST /auth/login` stores a bearer token in `localStorage`
  (`assuredia.token`); on boot `AuthProvider` validates it against `GET /auth/me` and falls
  back to the login screen on any failure. Roles are `ADMIN` and `CLIENT`; the engine is the
  authority and answers 403 regardless of what the UI shows.
- **i18n.** `en` and `ar` only, switchable from Settings ▸ Preferences and persisted in
  `assuredia_lang`. Static UI copy is translated; backend data (names, ids, cron, AI report
  text) is deliberately **not** passed through the dictionary.
- **Theming.** Dark is the default. `main.tsx` toggles the `dark` class before first paint to
  avoid a flash; `lib/theme.ts` keeps the header toggle and the Settings control in sync.
- **Design system.** Tailwind v4 utility classes plus `components/primitives.tsx`; tokens live
  in the `@theme` block of `src/index.css`. `ComponentShowcase.tsx` renders the catalogue.
- **Test Definition lifecycle rules** live in `lib/testDefinitionLifecycle.ts`, headless and
  unit-tested on purpose. It mirrors the engine's own guards — `DRAFT → VALIDATED →
  APPROVED → READY → ARCHIVED`, with approve/proving/archive reserved for an ADMIN (the
  engine answers 403 no matter what the UI shows) and `READY` reachable only through a
  passed proving run — and it owns the idempotency keys that make a double-clicked
  trial/proving safe.
- **localStorage keys in use:** `assuredia.token`, `assuredia_lang`, `theme`,
  `sidebarCollapsed`, and the account timezone config written by `lib/automations.ts`.

## Toolchain

Pinned in [.mise.toml](.mise.toml): Node 22, pnpm 10.34.3.

```bash
pnpm install
```

## Scripts

| Script            | Purpose                                                                    |
| ----------------- | -------------------------------------------------------------------------- |
| `pnpm dev`        | Vite dev server on port 3000 (the engine's default allowed CORS origin)     |
| `pnpm typecheck`  | `tsc --noEmit` over `src` and `vite.config.ts`                              |
| `pnpm build`      | Release build into `dist/` — see below                                      |
| `pnpm preview`    | Serve a built `dist/` locally                                               |
| `pnpm test`       | Unit/integration tests for the admin console + Test Definition area (Node test runner via `tsx`) |
| `pnpm test:e2e`   | Playwright suite against an in-memory engine double (see below)             |
| `pnpm test:live`  | Opt-in real-stack suite — real engine + PostgreSQL in Docker ([e2e/live/README.md](e2e/live/README.md)) |
| `pnpm format`     | oxfmt                                                                       |

## Backend address: `VITE_API_BASE_URL`

`src/lib/api.ts` prefixes every request with `import.meta.env.VITE_API_BASE_URL`. Vite
**inlines that value into the JavaScript at build time**, so it is a property of the
artifact, not of the deployment. A bundle built with the wrong value cannot be corrected
by setting an environment variable on the server — it has to be rebuilt.

### Local development

Copy [.env.example](.env.example) to `.env` (or `.env.local`) and point it at your engine:

```bash
VITE_API_BASE_URL=http://localhost:8080
```

### Release build

Supply the deployed engine origin on the build command itself. Vite applies the process
environment last, so this outranks every `.env` file:

```bash
VITE_API_BASE_URL=https://engine.example.com pnpm run build
```

Use `VITE_API_BASE_URL=/` when the dashboard is served from the engine's own origin behind
a single reverse proxy; `api.ts` then issues relative requests.

Two things make it hard to ship the wrong address:

- **[.env.production](.env.production)** is committed and deliberately blank. Vite resolves
  env files as `.env` < `.env.local` < `.env.production` < `.env.production.local`, so a
  developer's `.env.local` can no longer decide the backend address of a deployable bundle.
- **[vite.config.ts](vite.config.ts)** (`assertDeployableApiBaseUrl`) fails the build when a
  release build resolves to a blank value, a non-`http(s)` value, or a hostname that only
  resolves to the build machine (`localhost`, `127.0.0.0/8`, `::1`, `0.0.0.0`, `*.localhost`).

Cached previews (`pnpm run build --mode development`, used by `.figma/make/deploy-preview`)
are exempt on purpose: they are meant to talk to the developer's own backend.

### Engine side

The engine must allow this dashboard's origin for credentialed CORS. Set `DASHBOARD_ORIGINS`
(comma-separated) on the engine; with nothing configured it allows only
`http://localhost:3000` and `http://localhost:5173`.

## Backend API surface

Every call is under `/dashboard-api`, authenticated with a bearer token, and answers JSON
errors as `{ "error": "..." }`. Cross-tenant access answers **404** — ownership is resolved
server-side and body/path ids are never trusted. The full contract is documented at the top
of [src/lib/api.ts](src/lib/api.ts); the groups are:

| Group                | Examples                                                                                      |
| -------------------- | --------------------------------------------------------------------------------------------- |
| Auth                 | `POST /auth/login`, `POST /auth/signup`, `GET /auth/me`, `POST /auth/oauth/exchange`, `GET /auth/oauth/{provider}/link/start` |
| Clients & flows      | `GET /clients/{id}`, `PUT /clients/{id}`, `POST /clients/{id}/flows`, `GET/PUT /flows/{id}/tests`, `DELETE /flows/{id}` |
| Runs                 | `POST /clients/{id}/flows/{flowId}/run`, `GET /runs/{id}/status`, `POST /runs/{id}/cancel`, `GET /runs/{id}/failures`, `GET\|POST /runs/{id}/analysis\|analyze`, `GET /clients/{id}/runs` |
| Automations          | `GET/POST/PUT/DELETE /clients/{id}/live-runs[/{savedId}]`, `POST /clients/{id}/live-runs/{savedId}/run`, `GET /clients/{id}/live-runs/executions/{executionId}[/cancel]`, `GET/POST /clients/{id}/schedules[/{planId}]`, `POST /clients/{id}/schedules/{planId}/run` |
| Test definitions     | `GET/POST /clients/{id}/test-definitions`, `GET/PUT /clients/{id}/test-definitions/{id}`, `POST …/{id}/versions`, `GET/PUT …/{id}/versions/{versionId}`, `POST …/versions/{versionId}/validate\|trial\|approve\|proving\|archive`, `GET …/runs/{runId}`, `GET …/runs/{runId}/artifacts/{artifactId}` |
| Test creation        | `POST /clients/{id}/test-creation-requests`, admin: `GET /admin/test-creation-requests`, `…/assign`, `…/start`, `…/create-draft`, `…/reject` |
| Asset requests       | `POST /clients/{id}/requests`, `GET /clients/{id}/requests[/{requestId}]`, `POST /clients/{id}/requests/{id}/cancel`; admin: `GET /admin/requests[/{id}]`, `POST /admin/requests/{id}/approve\|reject\|implement` |
| Alerts               | `GET /alerts`, `GET /alerts/unread-count`, `POST /alerts/{id}/read\|resolve`, `POST /alerts/mark-all-read` |
| Admin                | `GET /admin/overview`, `GET /admin/settings`, `GET/POST /admin/team`, `PUT /admin/team/{id}/role`, `DELETE /admin/team/{id}`, `GET /admin/audit-log`, `GET /admin/feedback[/{id}]`, `GET /admin/runs` |
| Onboarding & misc    | `GET /onboarding/requests[/{id}]`, `…/approve\|reject`, `POST /feedback`, `POST /clients/{id}/telegram/link\|test`, `GET /clients` |

`AdminSettings.tsx` reads `GET /admin/settings` and manages the team through the
`/admin/team` endpoints; it does not write platform settings.

## Testing

Three layers, in increasing order of realism:

1. **`pnpm test`** — Node's test runner through `tsx`, no browser. The script globs
   `src/components/admin/__tests__/*.test.ts` (dashboard, runs, alerts, requests) and
   `src/components/testdefinitions/__tests__/*.test.ts` (create, list, detail, lifecycle,
   evidence, accessibility, schema, API mapping). Shared harness, DOM environment and
   fixtures sit next to the specs and are not collected as tests.
2. **`pnpm test:e2e`** — Playwright ([playwright.config.ts](playwright.config.ts)). It starts
   two throwaway servers and tears them down with the run: `tests/e2e/mock-engine.mjs` (an
   in-memory engine double on 8099) and this app's dev server on 3100 with
   `VITE_API_BASE_URL` pinned to loopback. One worker, no retries, and no screenshots/video/
   trace — the repository does not version test artifacts. The dev server runs on its own
   port so a developer's `pnpm dev` on 3000 is left alone.
3. **`pnpm test:live`** — opt-in, documented in [e2e/live/README.md](e2e/live/README.md):
   real Chromium, a real Spring Boot engine built from `ASSUREDIA_BACKEND_DIR`, and a
   disposable PostgreSQL container. No mocks, no route interception. Requires Docker,
   Java 21 + Maven, and cleans up after itself whether it passes or fails.

`pnpm typecheck` and `pnpm format` are the two gates to run before pushing.

## Release identity

A release is the pairing of three independently versioned things. Record all three together
when you cut one:

| Component     | Identity                                                                     |
| ------------- | ---------------------------------------------------------------------------- |
| Frontend      | this repository's commit SHA (and tag), plus the `VITE_API_BASE_URL` it was built with |
| Backend       | the automation-engine repository's commit SHA; Maven artifact `TestNG_Framework` |
| DB migrations | the highest `migration-NNN-*.sql` applied, as recorded in the engine's `assuredia_schema_migrations` ledger table |

`dist/` is not versioned. It is rebuilt from a known frontend SHA with an explicit
`VITE_API_BASE_URL`, which is what makes the pairing reproducible.

## Version control notes

- Ignored and never committed: `.env`, `.env.local`, `.env.production.local`, `dist/`,
  `build/`, `node_modules/`, `.vite/`, logs, and `.mcp.json` (account-scoped MCP proxy
  wiring). Committed on purpose: `.env.example` and the blank `.env.production`.
- [.gitattributes](.gitattributes) normalises text to LF. The `.figma/make/*` helpers are
  extensionless bash scripts committed mode `100755`; a CRLF checkout would make
  `#!/usr/bin/env bash` unrunnable on the Linux hosts that build and deploy this app.
- `.gitattributes` also carries generated Git LFS rules for binary types. LFS is **not**
  enabled in this repository — the image payload is a few MB and git stores it as ordinary
  blobs, so no LFS support is required at the remote. To switch to LFS later:
  `git lfs install --local && git add --renormalize . && git commit`.

## Reference documentation

| Document                                                    | What it covers                                             |
| ----------------------------------------------------------- | ---------------------------------------------------------- |
| [AGENTS.md](AGENTS.md)                                      | Conventions, styling rules, dev-server notes (the file `CLAUDE.md` points at) |
| [PHASE8-AI-ANALYSIS-REPORT.md](PHASE8-AI-ANALYSIS-REPORT.md) | How the AI Analysis page was rebuilt on real backend data  |
| [PHASE9-SETTINGS-REPORT.md](PHASE9-SETTINGS-REPORT.md)       | Settings + language/theme preference work                  |
| [src/lib/api.ts](src/lib/api.ts) (header comment)            | The frozen backend contract, endpoint by endpoint           |
| [e2e/live/README.md](e2e/live/README.md)                     | Real-stack suite: prerequisites, orchestration, coverage    |
| `src/imports/pasted_text/*.md`                               | The original Figma/design specs the screens were built from |
