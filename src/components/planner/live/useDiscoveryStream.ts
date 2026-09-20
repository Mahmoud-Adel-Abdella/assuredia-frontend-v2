import { useCallback, useEffect, useRef, useState } from "react"
import { getToken } from "../../../lib/api"
import type { PlanClarification, PlanFailure, TestPlan } from "../../../lib/planner"

export type LivePlanEvent = {
  id: string
  stage: string
  message: string
  details: string | null
  status: "PENDING" | "ACTIVE" | "COMPLETE" | "FAILED"
  timestamp: number
  metadata?: Record<string, unknown>
}
export type StreamStatus = "idle" | "streaming" | "done" | "failed" | "clarification"
export type DiscoveryStreamResult = { events: LivePlanEvent[]; status: StreamStatus; plan: TestPlan | null; failure: PlanFailure | null; clarification: PlanClarification | null; stalled: boolean }
const BASE_URL = ((typeof import.meta !== "undefined" && import.meta.env?.VITE_API_BASE_URL) || "").replace(/\/+$/, "")
export const STALL_HINT_MS = 15_000

export const EMPTY_STREAM: DiscoveryStreamResult = { events: [], status: "idle", plan: null, failure: null, clarification: null, stalled: false }

export function parseSse(buffer: string, onFrame: (name: string, data: string) => void) {
  const parts = buffer.split(/\r?\n\r?\n/)
  const remainder = parts.pop() ?? ""
  for (const part of parts) {
    let name = "message"
    const data: string[] = []
    for (const line of part.split(/\r?\n/)) {
      if (line.startsWith("event:")) name = line.slice(6).trim()
      if (line.startsWith("data:")) data.push(line.slice(5).trimStart())
    }
    if (data.length) onFrame(name, data.join("\n"))
  }
  return remainder
}

/** Maps a terminal SSE event name to its stream status. Pure; null for non-terminal frames. */
export function terminalName(name: string): Exclude<StreamStatus, "idle" | "streaming"> | null {
  if (name === "complete") return "done"
  if (name === "clarification") return "clarification"
  if (name === "failed") return "failed"
  return null
}

/** Applies one parsed frame to the stream state. Pure so SSE and polling share it. */
export function applyFrame(result: DiscoveryStreamResult, name: string, body: unknown): DiscoveryStreamResult {
  if (name === "progress") {
    const event = body as LivePlanEvent
    return { ...result, events: [...result.events, event] }
  }
  const status = terminalName(name)
  if (!status) return result
  if (status === "done") return { ...result, status, plan: body as TestPlan }
  if (status === "clarification") return { ...result, status, clarification: body as PlanClarification }
  return { ...result, status, failure: body as PlanFailure }
}

/** Decides what a polling response means. Pure. */
export function pollOutcome(status: number, body: unknown): { retry: true } | { retry: false; name: string; body: unknown } {
  if (status === 200) {
    const record = body as { status?: string }
    if (record?.status === "PLAN_READY") return { retry: false, name: "complete", body }
    if (record?.status === "NEEDS_CLARIFICATION") return { retry: false, name: "clarification", body }
    if (record?.status === "FAILED") return { retry: false, name: "failed", body }
    return { retry: true }
  }
  // The real backend delivers failures over 503 (INTENT_AMBIGUOUS-shaped
  // categories arrive as 200 FAILED); the body IS the terminal result either
  // way — never retry a received failure.
  const record = body as { status?: string } | null
  if (record?.status === "FAILED") return { retry: false, name: "failed", body }
  // 404 while the job is still running (or after stream expiry) → keep polling.
  return { retry: true }
}

export function useDiscoveryStream(clientId: number, planId: string | null): DiscoveryStreamResult & { cancel: () => void } {
  const [result, setResult] = useState<DiscoveryStreamResult>(EMPTY_STREAM)
  const abortRef = useRef<AbortController | null>(null)
  const cancel = useCallback(() => abortRef.current?.abort(), [])
  useEffect(() => {
    // No active job: clear ALL stream state so a reset/retry never shows
    // stale events from a previous attempt.
    if (!planId) { setResult(EMPTY_STREAM); return }
    const abort = new AbortController(); abortRef.current = abort
    let pollTimer: number | undefined; let stallTimer: number | undefined
    const headers: Record<string, string> = { Accept: "text/event-stream" }
    const token = getToken(); if (token) headers.Authorization = `Bearer ${token}`
    const base = `${BASE_URL}/dashboard-api/clients/${clientId}/test-plans/${planId}`
    setResult({ events: [], status: "streaming", plan: null, failure: null, clarification: null, stalled: false })
    const finish = (name: string, body: unknown) => {
      if (abort.signal.aborted) return
      setResult((r) => applyFrame(r, name, body))
      if (pollTimer) clearTimeout(pollTimer)
      abort.abort()
    }
    const poll = async () => {
      try {
        const response = await fetch(base, { headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) }, signal: abort.signal })
        let body: unknown = null
        try { body = await response.json() } catch { /* empty/invalid body — decided by status below */ }
        const outcome = pollOutcome(response.status, body)
        if (!outcome.retry) { finish(outcome.name, outcome.body); return }
      } catch { /* network error — retry below */ }
      if (!abort.signal.aborted) pollTimer = window.setTimeout(poll, 500)
    }
    const consume = async () => {
      try {
        const response = await fetch(`${base}/events`, { headers, signal: abort.signal })
        if (!response.ok || !response.body) throw new Error("stream unavailable")
        const reader = response.body.getReader(); const decoder = new TextDecoder(); let buffer = ""
        let closed = false
        while (!abort.signal.aborted) {
          const { value, done } = await reader.read(); if (done) break
          buffer += decoder.decode(value, { stream: true })
          buffer = parseSse(buffer, (name, raw) => {
            try {
              const body = JSON.parse(raw)
              if (terminalName(name) !== null) closed = true
              if (!abort.signal.aborted) setResult((r) => applyFrame(r, name, body))
            } catch { /* ignore malformed frames */ }
          })
          if (closed) { if (pollTimer) clearTimeout(pollTimer); break }
        }
        // Stream ended without a terminal frame (network drop / proxy close):
        // fall back to polling for the terminal result.
        if (!abort.signal.aborted && !closed) void poll()
      } catch { if (!abort.signal.aborted) void poll() }
    }
    stallTimer = window.setTimeout(() => setResult((r) => (r.status === "streaming" ? { ...r, stalled: true } : r)), STALL_HINT_MS)
    void consume()
    return () => { abort.abort(); if (pollTimer) clearTimeout(pollTimer); if (stallTimer) clearTimeout(stallTimer); abortRef.current = null }
  }, [clientId, planId])
  return { ...result, cancel }
}
