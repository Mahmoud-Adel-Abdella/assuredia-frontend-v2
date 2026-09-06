/**
 * Opt-in real-stack integration orchestrator for the Test Definition dashboard.
 *
 * Run with:  npm run test:live   (see e2e/live/README.md)
 * Requires:  ASSUREDIA_BACKEND_DIR pointing at the automation-engine repository.
 *
 * What it does, in order:
 *   1. allocates free localhost ports for PostgreSQL, backend, frontend, fixture site;
 *   2. starts a disposable PostgreSQL container and applies the repository's own
 *      bootstrap + migration-*.sql set through the engine's ledger mechanism;
 *   3. seeds synthetic fixtures only (two clients, two flows, an ADMIN and two
 *      CLIENT users — passwords generated per run, hashed by PostgreSQL's pgcrypto
 *      bcrypt so nothing is hard-coded anywhere);
 *   4. builds the backend jar from ASSUREDIA_BACKEND_DIR and starts it with AI,
 *      notification and OAuth integrations unset (disabled) and a disposable
 *      artifact root outside any repository;
 *   5. performs a warm-up execution so Playwright Java's one-time driver
 *      extraction and first browser launch are paid BEFORE the audited run, then
 *      deletes every warm-up row and file so the audit sees only browser-driven data;
 *   6. starts the real Vite dev server pointed at the real backend;
 *   7. runs the Playwright suite (real Chromium, no mocks, no route interception);
 *   8. cleans everything up — processes, container, temporary files — whether the
 *      suite passed or failed.
 */

import { spawn, spawnSync } from "node:child_process"
import { createServer } from "node:http"
import crypto from "node:crypto"
import fs from "node:fs"
import net from "node:net"
import os from "node:os"
import path from "node:path"

const BACKEND_DIR = process.env.ASSUREDIA_BACKEND_DIR
if (!BACKEND_DIR || !fs.existsSync(path.join(BACKEND_DIR, "pom.xml"))) {
  console.error(
    "Set ASSUREDIA_BACKEND_DIR to the automation-engine repository path.\n" +
      "  Example: ASSUREDIA_BACKEND_DIR=\"C:/path/to/automation-engine-v3\" npm run test:live",
  )
  process.exit(2)
}
if (!fs.existsSync(path.join(BACKEND_DIR, "src", "main", "resources", "migration-015-test-definition-persistence.sql"))) {
  console.error("ASSUREDIA_BACKEND_DIR does not look like the automation-engine repository (migration 015 missing).")
  process.exit(2)
}
if (!fs.existsSync(path.join(BACKEND_DIR, "src", "main", "resources", "migration-016-test-creation-requests.sql"))) {
  console.error("ASSUREDIA_BACKEND_DIR does not include the PR10A foundation (migration 016 missing).")
  process.exit(2)
}

const HEADED = process.env.HEADED === "1"
const PG_IMAGE = "postgres:16-alpine"

function freePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer()
    srv.once("error", reject)
    srv.listen(0, "127.0.0.1", () => {
      const port = srv.address().port
      srv.close(() => resolve(port))
    })
  })
}

function httpOk(url, timeoutMs = 5000) {
  // Best-effort probe used for readiness polling; connection errors count as not-ready.
  return new Promise((resolve) => {
    const req = fetch(url, { signal: AbortSignal.timeout(timeoutMs) })
      .then((res) => resolve(res.status))
      .catch(() => resolve(0))
    void req
  })
}

async function poll(url, expected, attempts, everyMs) {
  for (let i = 1; i <= attempts; i++) {
    const status = await httpOk(url)
    if (status === expected) {
      console.log(`  ready after ${i} poll(s): ${url} -> ${status}`)
      return true
    }
    await new Promise((r) => setTimeout(r, everyMs))
  }
  return false
}

function run(cmd, args, opts = {}) {
  const child = spawn(cmd, args, { stdio: opts.pipe ? ["ignore", "pipe", "pipe"] : "ignore", ...opts })
  return child
}

function runCapture(cmd, args, opts = {}) {
  const res = spawnSync(cmd, args, { encoding: "utf8", ...opts })
  if (res.status !== 0) {
    throw new Error(`${cmd} ${args.join(" ")} failed (${res.status}): ${(res.stderr || res.stdout || "").slice(0, 500)}`)
  }
  return res.stdout
}

async function psql(db, sql) {
  return runCapture("docker", ["exec", db.container, "psql", "-U", db.user, "-d", db.name, "-tA", "-v", "ON_ERROR_STOP=1", "-c", sql])
}

async function main() {
  const work = fs.mkdtempSync(path.join(os.tmpdir(), "assuredia-live-"))
  const evidence = path.join(work, "evidence")
  const artifactRoot = path.join(work, "artifacts")
  const siteDir = path.join(work, "fixture-site")
  fs.mkdirSync(evidence)
  fs.mkdirSync(artifactRoot)
  fs.mkdirSync(siteDir)

  const [pgPort, backendPort, frontendPort, sitePort] = [
    await freePort(),
    await freePort(),
    await freePort(),
    await freePort(),
  ]
  const frontendOrigin = `http://127.0.0.1:${frontendPort}`
  const backendUrl = `http://127.0.0.1:${backendPort}`
  const runTag = crypto.randomBytes(4).toString("hex")
  const password = `Live-${crypto.randomBytes(12).toString("hex")}`
  const jwtSecret = crypto.randomBytes(48).toString("base64")
  const encKey = crypto.randomBytes(32).toString("base64")
  const dbName = `assuredia_live_${runTag}`

  const children = []
  let siteKeepAlive = null
  const spawnTracked = (cmd, args, opts, logFile) => {
    const log = fs.openSync(logFile, "a")
    const child = spawn(cmd, args, { stdio: ["ignore", log, log], ...opts })
    children.push(child)
    return child
  }

  const containerName = `assuredia-live-pg-${runTag}`
  let exitCode = 1
  let playwright = null

  try {
    /* ---- 1-2. disposable PostgreSQL + the repository's own migrations ---- */
    console.log("[1/7] starting disposable PostgreSQL on 127.0.0.1:" + pgPort)
    const pgPassword = crypto.randomBytes(16).toString("hex")
    runCapture("docker", [
      "run", "-d", "--name", containerName, "--rm",
      "-e", `POSTGRES_DB=${dbName}`,
      "-e", `POSTGRES_USER=assuredia_live`,
      "-e", `POSTGRES_PASSWORD=${pgPassword}`,
      "-p", `127.0.0.1:${pgPort}:5432`,
      PG_IMAGE,
    ])
    let ready = false
    for (let i = 1; i <= 60; i++) {
      const probe = spawnSync("docker", ["exec", containerName, "pg_isready", "-U", "assuredia_live", "-d", dbName])
      if (probe.status === 0) { ready = true; break }
      await new Promise((r) => setTimeout(r, 1000))
    }
    if (!ready) throw new Error("PostgreSQL container never became ready")
    const db = { container: containerName, user: "assuredia_live", name: dbName }

    console.log("[2/7] applying bootstrap + migrations through the engine's ledger")
    fs.mkdirSync(path.join(work, "resources"), { recursive: true })
    fs.cpSync(path.join(BACKEND_DIR, "tools", "postgres-bootstrap.sql"), path.join(work, "000-bootstrap.sql"))
    fs.cpSync(path.join(BACKEND_DIR, "src", "main", "resources"), path.join(work, "resources"), { recursive: true })
    runCapture("docker", ["cp", path.join(work, "000-bootstrap.sql"), `${containerName}:/tmp/000-bootstrap.sql`])
    runCapture("docker", ["cp", path.join(work, "resources"), `${containerName}:/tmp/resources`])
    // pg_isready can answer while the database is still finishing recovery;
    // retry the whole idempotent migration application until it sticks.
    let migrated = false
    let lastMigrationError = ""
    for (let migrationAttempt = 1; migrationAttempt <= 5 && !migrated; migrationAttempt++) {
      try {
        runCapture("docker", ["exec", containerName, "sh", "-c",
      `psql -U assuredia_live -d ${dbName} -v ON_ERROR_STOP=1 -f /tmp/000-bootstrap.sql >/dev/null && ` +
      `psql -U assuredia_live -d ${dbName} -v ON_ERROR_STOP=1 -c "CREATE TABLE IF NOT EXISTS assuredia_schema_migrations (filename text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())" >/dev/null && ` +
      `for m in /tmp/resources/migration-*.sql; do f=$(basename "$m"); ` +
      `a=$(psql -U assuredia_live -d ${dbName} -tA -c "SELECT 1 FROM assuredia_schema_migrations WHERE filename='$f'"); ` +
      `if [ "$a" != "1" ]; then psql -U assuredia_live -d ${dbName} -v ON_ERROR_STOP=1 -f "$m" >/dev/null; ` +
      `psql -U assuredia_live -d ${dbName} -v ON_ERROR_STOP=1 -c "INSERT INTO assuredia_schema_migrations (filename) VALUES ('$f')" >/dev/null; fi; done`,
    ])
        migrated = true
      } catch (err) {
        lastMigrationError = (err && err.message ? err.message : "(no message)") +
          " | type=" + (err && err.constructor ? err.constructor.name : typeof err) +
          " | stdout=" + String(err && err.stdout ? String(err.stdout).slice(0, 200) : "(none)")
        console.log("  migration attempt " + migrationAttempt + " failed: " + lastMigrationError.slice(0, 300))
        await new Promise((r) => setTimeout(r, 2000))
      }
    }
    if (!migrated) throw new Error("Migration application failed after retries: " + lastMigrationError)
    const ledger = runCapture("docker", ["exec", containerName, "psql", "-U", "assuredia_live", "-d", dbName, "-tA", "-c", "SELECT COUNT(*) FROM assuredia_schema_migrations"]).trim()
    if (ledger !== "16") throw new Error(`Expected 16 ledger entries, found ${ledger}`)
    console.log(`  ledger entries: ${ledger} (migration 016 applied)`)

    /* ---- 3. synthetic fixtures ---- */
    console.log("[3/7] seeding synthetic fixtures (pgcrypto bcrypt, per-run password)")
    await psql(db, "CREATE EXTENSION IF NOT EXISTS pgcrypto;")
    const fixtures = `
      INSERT INTO clients (client_name, base_url, browser, headless, is_active, role)
      VALUES ('live-sandbox-alpha', 'http://127.0.0.1:${sitePort}', 'CHROMIUM', true, true, 'client')
      RETURNING id;
      INSERT INTO clients (client_name, base_url, browser, headless, is_active, role)
      VALUES ('live-sandbox-beta', 'http://127.0.0.1:${sitePort}', 'CHROMIUM', true, true, 'client')
      RETURNING id;
      INSERT INTO users (email, password_hash, role, client_id)
      VALUES ('live-admin-${runTag}@local.test', crypt('${password}', gen_salt('bf', 10)), 'ADMIN', NULL);
      INSERT INTO users (email, password_hash, role, client_id)
      SELECT 'live-client-alpha-${runTag}@local.test', crypt('${password}', gen_salt('bf', 10)), 'CLIENT', id FROM clients WHERE client_name = 'live-sandbox-alpha';
      INSERT INTO users (email, password_hash, role, client_id)
      SELECT 'live-client-beta-${runTag}@local.test', crypt('${password}', gen_salt('bf', 10)), 'CLIENT', id FROM clients WHERE client_name = 'live-sandbox-beta';
      INSERT INTO flows (client_id, flow_name, is_active)
      SELECT id, 'live-checkout-flow', true FROM clients WHERE client_name = 'live-sandbox-alpha';
      INSERT INTO flows (client_id, flow_name, is_active)
      SELECT id, 'live-beta-flow', true FROM clients WHERE client_name = 'live-sandbox-beta';`
    runCapture("docker", ["exec", containerName, "psql", "-U", "assuredia_live", "-d", dbName, "-v", "ON_ERROR_STOP=1", "-c", fixtures])
    const clientAId = Number(runCapture("docker", ["exec", containerName, "psql", "-U", "assuredia_live", "-d", dbName, "-tA", "-c",
      "SELECT id FROM clients WHERE client_name = 'live-sandbox-alpha'"]).trim())
    const flowAId = Number(runCapture("docker", ["exec", containerName, "psql", "-U", "assuredia_live", "-d", dbName, "-tA", "-c",
      "SELECT id FROM flows WHERE flow_name = 'live-checkout-flow'"]).trim())

    /* ---- 4. backend jar ---- */
    console.log("[4/7] building the backend jar (skipTests; the full suite is a separate gate)")
    // mvn (like npm) is a .cmd shim on Windows; Node refuses to spawn .cmd files
    // without a shell, so they are routed through cmd.exe explicitly.
    const isWin = process.platform === "win32"
    const mvnCmd = isWin ? "cmd.exe" : "mvn"
    const mvnArgs = isWin ? ["/c", "mvn", "-B", "clean", "package", "-DskipTests"] : ["-B", "clean", "package", "-DskipTests"]
    runCapture(mvnCmd, mvnArgs, { cwd: BACKEND_DIR })

    fs.mkdirSync(path.join(work, "runtime-clients"), { recursive: true })

    /* ---- 5. fixture site (loopback only) ---- */
    console.log("[5/7] starting the loopback fixture site on 127.0.0.1:" + sitePort)
    fs.writeFileSync(path.join(siteDir, "index.html"),
      `<!doctype html><html><head><meta charset="utf-8"><title>Live Fixture Storefront</title></head>` +
      `<body><main><h1>Live fixture storefront</h1>` +
      `<p>Synthetic local page for Test Definition worker executions only.</p>` +
      `<button id="pay" data-testid="pay-button">Pay</button>` +
      `<span data-testid="receipt">Thank you</span></main></body></html>`)
    // The site runs as a standalone process (not in this orchestrator's event
    // loop), mirroring a real deployment and keeping the worker's target
    // reachable no matter what this script does between requests.
    const siteServerSrc = `
      import { createServer } from "node:http"
      import { readFileSync } from "node:fs"
      import { join, dirname } from "node:path"
      import { fileURLToPath } from "node:url"
      process.on("uncaughtException", (err) => {
        console.error("UNCAUGHT:", err && (err.stack || err.message))
      })
      process.on("unhandledRejection", (err) => {
        console.error("UNHANDLED REJECTION:", err && (err.stack || err))
      })
      const port = Number(process.env.FIXTURE_PORT)
      const root = dirname(fileURLToPath(import.meta.url))
      const html = readFileSync(join(root, "index.html"))
      const server = createServer((req, res) => {
        req.on("error", () => {})
        res.on("error", () => {})
        const pathOnly = (req.url ?? "/").split("?")[0]
        if (pathOnly !== "/" && pathOnly !== "/index.html") {
          res.writeHead(404, { "Content-Type": "text/plain" })
          res.end("not found")
          return
        }
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Content-Length": html.length })
        res.end(html)
      })
      server.on("clientError", (err, socket) => {
        console.error("CLIENT ERROR:", err.message)
        socket.end("HTTP/1.1 400 Bad Request\\r\\n\\r\\n")
      })
      server.listen(port, "127.0.0.1", () => console.log("fixture site ready on " + port))
      // Periodic liveness heartbeat so a silent death has a last-known-alive marker.
      setInterval(() => console.log("alive " + new Date().toISOString()), 5000)
    `
    fs.writeFileSync(path.join(siteDir, "server.mjs"), siteServerSrc)
    const siteChild = spawnTracked(process.platform === "win32" ? "node.exe" : "node",
      [path.join(siteDir, "server.mjs")], {
        env: { ...process.env, FIXTURE_PORT: String(sitePort) },
      }, path.join(evidence, "site.log"))
    void siteChild
        if (!(await poll(`http://127.0.0.1:${sitePort}/?utm=live`, 200, 5, 500))) {
      throw new Error("Fixture site stopped answering before the suite started")
    }

    /* ---- backend ---- */
    console.log("[6/7] starting the real backend on 127.0.0.1:" + backendPort)
    const backend = spawnTracked("java", ["-jar", path.join(BACKEND_DIR, "target", "TestNG_Framework-1.0-SNAPSHOT.jar")], {
      cwd: BACKEND_DIR,
      env: {
        ...process.env,
        DB_URL: `jdbc:postgresql://127.0.0.1:${pgPort}/${dbName}`,
        DB_USER: "assuredia_live",
        DB_PASSWORD: pgPassword,
        DASHBOARD_JWT_SECRET: jwtSecret,
        ENGINE_ENCRYPTION_KEY: encKey,
        DASHBOARD_ORIGINS: `${frontendOrigin},http://localhost:${frontendPort}`,
        ASSUREDIA_ARTIFACT_ROOT: artifactRoot,
        SERVER_PORT: String(backendPort),
        // Config sync (clients/config.json projection) must write into the
        // disposable workdir: keeps the source tree clean and prevents stale
        // files from a previous run overwriting this run's seeded database.
        SYNC_CLIENTS_ROOT: path.join(work, "runtime-clients").replace(/\\/g, "/") + "/",
        // AI, notification-webhook and OAuth integrations stay unset: disabled.
      },
    }, path.join(evidence, "backend.log"))
    if (!(await poll(`${backendUrl}/api/health`, 200, 60, 2000))) {
      throw new Error("Backend health endpoint never returned 200")
    }

    const api = async (method, route, body, token, idempotencyKey) => {
      const res = await fetch(`${backendUrl}${route}`, {
        method,
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      })
      let json = null
      try { json = await res.json() } catch { json = null }
      return { status: res.status, json }
    }

    /* ---- warm-up (explicit, excluded from the audit) ---- */
    // The FIRST worker execution on a machine pays one-time costs (Playwright
    // driver extraction, first browser launch) that can exceed the bridge's
    // fixed 30s trial timeout or fail a transient launch. The warm-up retries
    // until one execution passes (or attempts run out), then deletes all of its
    // own data so the audited lifecycle sees only browser-driven runs.
    console.log("  warm-up executions (absorb Playwright Java first-use costs; deleted afterwards)")
    const login = await api("POST", "/dashboard-api/auth/login", {
      email: `live-admin-${runTag}@local.test`,
      password,
    })
    if (login.status !== 200) throw new Error("Warm-up admin login failed: " + login.status + " " + JSON.stringify(login.json))
    const adminToken = login.json.token
    const warmSource = JSON.stringify({
      schemaVersion: "1.0",
      metadata: { name: "warmup-def" },
      steps: [
        { action: "ui.navigate", url: "/" },
        { action: "ui.wait", for: "locatorState", locator: { strategy: "testId", value: "receipt" }, state: "visible" },
      ],
      expectedOutcomes: [
        { action: "ui.assertVisible", locator: { strategy: "testId", value: "receipt" } },
      ],
    })
    const warmDef = await api("POST", `/dashboard-api/clients/${clientAId}/test-definitions`, { name: "warmup-def", initialSourceJson: warmSource }, adminToken)
    if (warmDef.status !== 200) throw new Error("Warm-up definition creation failed: " + warmDef.status + " " + JSON.stringify(warmDef.json))
    await api("PUT", `/dashboard-api/clients/${clientAId}/test-definitions/${warmDef.json.definitionId}`, {
      name: "warmup-def", flowId: flowAId,
    }, adminToken)
    const validated = await api("POST", `/dashboard-api/clients/${clientAId}/test-definitions/${warmDef.json.definitionId}/versions/${warmDef.json.initialVersionId}/validate`, undefined, adminToken)
    if (validated.json.status !== "VALIDATED") throw new Error("Warm-up validation failed: " + JSON.stringify(validated.json))

    const WARMUP_ATTEMPTS = 4
    let warmPassed = false
    for (let attempt = 1; attempt <= WARMUP_ATTEMPTS && !warmPassed; attempt++) {
      const warmRun = await api("POST",
        `/dashboard-api/clients/${clientAId}/test-definitions/${warmDef.json.definitionId}/versions/${warmDef.json.initialVersionId}/trial`,
        undefined, adminToken, `warmup-${runTag}-${attempt}`)
      if (warmRun.json.status === "PASSED") {
        warmPassed = true
        console.log(`  warm-up attempt ${attempt}: PASSED`)
      } else {
        let diag = "(no diagnostics)"
        try {
          const row = await psql(db, `SELECT COALESCE(error_message, '(null)') FROM test_runs WHERE implementation_type = 'TEST_DEFINITION' ORDER BY id DESC LIMIT 1`)
          diag = row.trim()
        } catch { diag = "(db probe failed)" }
        console.log(`  warm-up attempt ${attempt}: ${warmRun.json.status}/${warmRun.json.terminatingReasonCode || "?"} — ${diag}`)
      }
      // Each attempt's data (failed or passed) is wiped before the next attempt.
      await psql(db, `
        DELETE FROM test_run_artifacts WHERE test_run_id IN (SELECT id FROM test_runs WHERE test_definition_id = ${warmDef.json.definitionId});
        DELETE FROM test_run_step_results WHERE test_run_id IN (SELECT id FROM test_runs WHERE test_definition_id = ${warmDef.json.definitionId});
        DELETE FROM definition_execution_idempotency WHERE test_definition_id = ${warmDef.json.definitionId};
        DELETE FROM test_runs WHERE test_definition_id = ${warmDef.json.definitionId};`)
    }
    if (!warmPassed) throw new Error(`Warm-up trial never passed after ${WARMUP_ATTEMPTS} attempts — the worker environment is not healthy enough for the audited run`)

    // Remove every trace of the warm-up so the audit only sees browser-driven data.
    await psql(db, `
      DELETE FROM test_run_artifacts WHERE test_run_id IN (SELECT id FROM test_runs WHERE test_definition_id = ${warmDef.json.definitionId});
      DELETE FROM test_run_step_results WHERE test_run_id IN (SELECT id FROM test_runs WHERE test_definition_id = ${warmDef.json.definitionId});
      DELETE FROM definition_execution_idempotency WHERE test_definition_id = ${warmDef.json.definitionId};
      DELETE FROM test_runs WHERE test_definition_id = ${warmDef.json.definitionId};
      DELETE FROM test_definitions;`)
    fs.rmSync(artifactRoot, { recursive: true, force: true })
    fs.mkdirSync(artifactRoot)

    /* ---- frontend ---- */
    console.log("[7/7] starting the real frontend dev server on 127.0.0.1:" + frontendPort)
    const repoDir = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1")), "..", "..")
    const frontend = spawnTracked(isWin ? "cmd.exe" : "npm", isWin ? ["/c", "npm", "run", "dev"] : ["run", "dev"], {
      cwd: repoDir,
      env: { ...process.env, PORT: String(frontendPort), VITE_API_BASE_URL: backendUrl },
    }, path.join(evidence, "frontend.log"))
    if (!(await poll(`${frontendOrigin}/`, 200, 30, 1000))) {
      throw new Error("Frontend dev server never returned 200")
    }

    /* ---- the audited browser run ---- */
    console.log("running the Playwright real-stack suite (real Chromium, headed=" + HEADED + ")")
    playwright = spawn(process.platform === "win32" ? "node.exe" : "node",
      ["node_modules/@playwright/test/cli.js", "test", "-c", "e2e/live/playwright.live.config.ts"], {
      cwd: repoDir,
      stdio: "inherit",
      env: {
        ...process.env,
        LIVE_STACK_READY: "1",
        LIVE_BACKEND_URL: backendUrl,
        LIVE_FRONTEND_URL: frontendOrigin,
        LIVE_CLIENT_A_ID: String(clientAId),
        LIVE_CLIENT_B_FLOW_ID: String(Number(runCapture("docker", ["exec", containerName, "psql", "-U", "assuredia_live", "-d", dbName, "-tA", "-c", "SELECT id FROM flows WHERE flow_name = 'live-beta-flow'"]).trim())),
        LIVE_ADMIN_EMAIL: `live-admin-${runTag}@local.test`,
        LIVE_CLIENT_EMAIL: `live-client-alpha-${runTag}@local.test`,
        LIVE_CLIENT_BETA_EMAIL: `live-client-beta-${runTag}@local.test`,
        LIVE_PASSWORD: password,
        LIVE_ARTIFACT_ROOT: artifactRoot,
        EVIDENCE_DIR: evidence,
        HEADED: HEADED ? "1" : "",
      },
    })
    exitCode = await new Promise((resolve) => playwright.on("exit", resolve))
    console.log(`playwright exit code: ${exitCode}`)
  } catch (err) {
    console.error("LIVE STACK ERROR:", err.message)
    exitCode = 1
  } finally {
    console.log("cleaning up (processes, container, temporary files)…")
    if (!(process.env.KEEP_ON_FAILURE === "1" && exitCode !== 0)) {
      for (const child of children) {
        try {
          if (child.pid && process.platform === "win32") {
            // /T kills the whole tree: the backend JVM spawns worker processes.
            spawnSync("taskkill", ["/PID", String(child.pid), "/T", "/F"])
          } else {
            child.kill()
          }
        } catch {}
      }
    }
    if (playwright) {
      try {
        if (playwright.pid && process.platform === "win32") {
          spawnSync("taskkill", ["/PID", String(playwright.pid), "/T", "/F"])
        } else {
          playwright.kill()
        }
      } catch {}
    }
    if (!(process.env.KEEP_ON_FAILURE === "1" && exitCode !== 0)) {
      try { runCapture("docker", ["stop", containerName]) } catch {}
      try { runCapture("docker", ["rm", "-f", containerName]) } catch {}
    }
    // The temporary workdir holds evidence needed to diagnose failures only until
    // this process exits; it lives outside every repository and is removed here.
    if (process.env.KEEP_ON_FAILURE === "1" && exitCode !== 0) {
      console.log("KEEP_ON_FAILURE=1 — workdir kept: " + work)
    } else {
      try { fs.rmSync(work, { recursive: true, force: true }) } catch {}
    }
    console.log("cleanup complete (container, processes, temporary files removed)")
  }
  process.exit(exitCode)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
