# Real-stack integration suite (opt-in)

End-to-end tests that run the **real** stack: real Chromium browser, real Spring
Boot backend, disposable PostgreSQL container, real Test Definition execution
worker against a loopback-only fixture website. There are **no API mocks, no
route interception, and no in-memory engine** — every request the browser makes
reaches the local backend.

This suite is deliberately **opt-in**: `npm test` and `npm run test:e2e` never
start Docker, Java, or a second Chromium. The Playwright config refuses to run
unless the orchestrator launched the stack.

## Prerequisites

- Docker (for the disposable `postgres:16-alpine` container)
- Java 21 + Maven (to build and run the engine jar)
- `npm install` completed in this repository (Playwright 1.62 browser binaries
  cached; the engine's Playwright Java uses the same browser revision)
- The automation-engine repository checked out locally (any commit; use the
  approved backend baseline unless told otherwise)

## Command

```bash
ASSUREDIA_BACKEND_DIR="C:/path/to/automation-engine-v3" npm run test:live
```

Options:

| Variable | Purpose |
| --- | --- |
| `ASSUREDIA_BACKEND_DIR` (required) | Path to the automation-engine repository. Refused if it does not look like the engine. |
| `HEADED=1` | Run Chromium headed instead of headless. |

## What the orchestrator does

`e2e/live/real-stack.mjs`:

1. Allocates **free** localhost ports for PostgreSQL, the backend, the Vite dev
   server, and the fixture website (no fixed ports).
2. Starts a disposable PostgreSQL container and applies the repository's own
   bootstrap + `migration-*.sql` set through the engine's
   `assuredia_schema_migrations` ledger (the run aborts unless the ledger holds
   exactly 15 entries).
3. Seeds **synthetic fixtures only**: two clients, two flows, one ADMIN and two
   CLIENT users. Passwords are generated per run and hashed by PostgreSQL's
   pgcrypto bcrypt — no credential is hard-coded anywhere.
4. Builds the engine jar from `ASSUREDIA_BACKEND_DIR` and starts it with AI,
   notification-webhook and OAuth integrations unset (disabled) and a
   **disposable artifact root** in the OS temp directory.
5. Performs one **warm-up execution** so Playwright Java's first-use driver
   extraction and first browser launch are paid before the audited run, then
   deletes every warm-up row and file so the audit sees only browser-driven data.
6. Starts the real Vite dev server with `VITE_API_BASE_URL` pointing at the
   local backend.
7. Runs `e2e/live/test-definitions-real-stack.spec.ts` (21 scenarios).
8. **Cleans everything up whether the suite passed or failed**: backend,
   frontend, fixture site and browser processes are killed (whole process tree
   on Windows), the container is stopped and removed, and the temporary
   evidence directory is deleted. Evidence never lives inside a repository.

## Coverage

Browser login · list/empty/create/edit/validate · trial (single dispatch,
`Idempotency-Key` observed on the wire, double-click refusal) · approve ·
proving → READY · step results · artifact metadata · authenticated artifact
download (HTTP 200, non-empty PNG, `Content-Disposition`) · archive/read-only ·
idempotent replay (trial, proving, and after archive) · fingerprint mismatch
409 · no-flow 409 · cross-tenant flow 404 · non-admin 403 · invalid JSON blocked
locally · duplicate name 409 · cross-tenant definition/artifact 404 ·
unknown/missing artifact 404 (with recovery after restoring the file) ·
non-local-request guard · console/network audit.

## Notes

- The primary lifecycle is driven through visible UI interactions.
  Authenticated browser-context `fetch` is used only for scenarios the current
  UI cannot express: the idempotency fingerprint mismatch (the UI never reuses a
  key with different input), cross-tenant probes (the UI hides those controls by
  design), and stored-run read-backs after a session change.
- The fixture website is bound to `127.0.0.1` only, so the worker's browser
  traffic never leaves the machine.
- Backend production code is never modified by this suite.
