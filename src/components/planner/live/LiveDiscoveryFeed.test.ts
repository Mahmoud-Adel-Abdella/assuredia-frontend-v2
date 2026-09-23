import test from "node:test"
import assert from "node:assert/strict"
import React from "react"
import "../../testdefinitions/__tests__/domEnvironment"
import { mount, cleanup } from "../../testdefinitions/__tests__/harness"
import { LiveDiscoveryFeed } from "./LiveDiscoveryFeed"
import type { LivePlanEvent } from "./useDiscoveryStream"

const event = (
  id: string,
  stage: string,
  status: LivePlanEvent["status"],
  details: string | null = null,
  elapsedMs?: number,
): LivePlanEvent => ({
  id,
  stage,
  message: stage,
  details,
  status,
  timestamp: 1,
  metadata: elapsedMs != null ? { elapsedMs } : {},
})

test("LiveDiscoveryFeed truthfulness (LIVE_DISCOVERY_FEED_CORRECTNESS_FIX)", async (t) => {
  t.afterEach(() => cleanup())

  await t.test("renders lifecycle stages without any percentage or fabricated total", async () => {
    const events: LivePlanEvent[] = [
      event("e1", "navigate_done", "COMPLETE", "Response: 6007ms", 6007),
      event("e2", "snapshot_done", "COMPLETE", "Origin: https://shop.example.com:443", 6100),
      event("e3", "elements_parsed", "COMPLETE", null, 6200),
      event("e4", "locators_done", "COMPLETE", null, 6300),
      event("e5", "ai_start", "ACTIVE", null),
    ]
    const view = await mount(
      React.createElement(LiveDiscoveryFeed, {
        events,
        targetOrigin: "https://shop.example.com:443",
        onCancel: () => {},
      }),
    )
    const text = view.container.textContent ?? ""

    // No fabricated progress percentage anywhere in the live feed.
    assert.equal(/\d+\s*%/.test(text), false, "feed must not render a percentage")
    // No bounded element/target totals presented as authoritative discovery counts.
    assert.equal(/\d+\s+elements\b/.test(text), false, "feed must not render a live element total")
    assert.equal(/\d+\s+targets\b/.test(text), false, "feed must not render a live target total")

    // Elapsed time is allowed, and it is clearly labelled as seconds (not progress).
    assert.ok(text.includes("6.0s"), "elapsed time is shown as seconds")

    view.unmount()
  })

  await t.test("renders one row per event and does not duplicate stages", async () => {
    const events: LivePlanEvent[] = [
      event("e1", "start", "COMPLETE"),
      event("e2", "navigate_done", "COMPLETE"),
      event("e3", "ready", "COMPLETE"),
    ]
    const view = await mount(
      React.createElement(LiveDiscoveryFeed, {
        events,
        targetOrigin: null,
        onCancel: () => {},
      }),
    )
    const rows = view.container.querySelectorAll(".animate-fade-in-up")
    assert.equal(rows.length, events.length, "one rendered row per event")
    view.unmount()
  })
})
