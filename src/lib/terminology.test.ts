import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"

/**
 * F-07: automated terminology guard for customer-facing copy.
 *
 * Scans every i18n EN+AR string under pr10c.* and nav.* for forbidden
 * internal vocabulary, plus the high-risk implementation tokens under
 * testdef.*. Lifecycle-domain words (Step/Proving/Ready) are grandfathered
 * in testdef.* only: they are pre-existing backend lifecycle vocabulary
 * (testdef.run.steps, testdef.run.proving, testdef.status.ready), not AI
 * Builder leaks.
 */

const SOURCE = new URL("./i18n.tsx", import.meta.url)

type Entry = { en: string; ar: string }

function readEntries(): Record<string, Entry> {
  const text = readFileSync(SOURCE, "utf8")
  const entries: Record<string, Entry> = {}
  const keyPattern = /"((?:pr10c|nav|testdef)\.[^"]+)":\s*\{/g
  let keyMatch: RegExpExecArray | null
  while ((keyMatch = keyPattern.exec(text)) !== null) {
    const key = keyMatch[1]
    const rest = text.slice(keyMatch.index)
    const en = /en:\s*"((?:[^"\\]|\\.)*)"/.exec(rest)?.[1]
    const ar = /ar:\s*"((?:[^"\\]|\\.)*)"/.exec(rest)?.[1]
    if (en !== undefined && ar !== undefined) entries[key] = { en, ar }
  }
  return entries
}

const FULL_TOKENS = [
  "MCP",
  "Playwright",
  "STDIO",
  "Chromium",
  "broker",
  "proxy",
  "DOM",
  "JSON-RPC",
  "UI Test",
  "API Test",
  "Mixed Test",
  "Step",
  "Assertion",
  "Locator",
  "UNVERIFIED",
  "Proving",
  "READY",
  "secret references",
]

// Backend lifecycle vocabulary, grandfathered in testdef.* only.
const LIFECYCLE_WORDS = new Set(["Step", "Proving", "READY"])

const SCOPE_FULL = /^(pr10c|nav)\./

test("Terminology guard for customer-facing copy", async (t) => {
  const entries = readEntries()
  assert.ok(
    Object.keys(entries).length > 50,
    "expected to parse the pr10c/nav/testdef namespaces",
  )

  await t.test("pr10c.* and nav.* contain no forbidden tokens", () => {
    const violations: string[] = []
    for (const [key, entry] of Object.entries(entries)) {
      if (!SCOPE_FULL.test(key)) continue
      for (const token of FULL_TOKENS) {
        if (entry.en.includes(token) || entry.ar.includes(token)) {
          violations.push(`${key} contains ${JSON.stringify(token)}`)
        }
      }
    }
    assert.deepEqual(violations, [])
  })

  await t.test("testdef.* contains no internal-implementation tokens", () => {
    const violations: string[] = []
    for (const [key, entry] of Object.entries(entries)) {
      if (!key.startsWith("testdef.")) continue
      for (const token of FULL_TOKENS) {
        if (LIFECYCLE_WORDS.has(token)) continue
        if (entry.en.includes(token) || entry.ar.includes(token)) {
          violations.push(`${key} contains ${JSON.stringify(token)}`)
        }
      }
    }
    assert.deepEqual(violations, [])
  })
})
