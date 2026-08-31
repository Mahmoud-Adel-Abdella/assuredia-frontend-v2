# Assuredia Dashboard (frontend)

React + Vite + Tailwind CSS admin/client dashboard for the Assuredia **automation-engine**
backend. This repository holds the frontend only; the engine is a separate Spring Boot
project and is versioned in its own repository.

See [AGENTS.md](AGENTS.md) for the project structure and coding conventions.

## Toolchain

Pinned in [.mise.toml](.mise.toml): Node 22, pnpm 10.34.3.

```bash
pnpm install
```

## Scripts

| Script            | Purpose                                                    |
| ----------------- | ---------------------------------------------------------- |
| `pnpm dev`        | Vite dev server on port 3000 (the engine's default allowed CORS origin) |
| `pnpm typecheck`  | `tsc --noEmit` over `src` and `vite.config.ts`              |
| `pnpm build`      | Release build into `dist/` — see below                      |
| `pnpm preview`    | Serve a built `dist/` locally                               |
| `pnpm test`       | Component unit tests under `src/components/admin/__tests__` |
| `pnpm format`     | oxfmt                                                       |

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
