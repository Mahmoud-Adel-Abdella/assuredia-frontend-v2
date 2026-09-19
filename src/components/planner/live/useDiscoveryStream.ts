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

export function useDiscoveryStream(clientId: number, planId: string | null): DiscoveryStreamResult & { cancel: () => void } {
  const [result, setResult] = useState<DiscoveryStreamResult>({ events: [], status: "idle", plan: null, failure: null, clarification: null, stalled: false })
  const abortRef = useRef<AbortController | null>(null)
  const cancel = useCallback(() => abortRef.current?.abort(), [])
  useEffect(() => {
    if (!planId) { setResult((r) => ({ ...r, status: "idle" })); return }
    const abort = new AbortController(); abortRef.current = abort
    let pollTimer: number | undefined; let stallTimer: number | undefined; let polling = false
    const headers: Record<string, string> = { Accept: "text/event-stream" }
    const token = getToken(); if (token) headers.Authorization = `Bearer ${token}`
    const base = `${BASE_URL}/dashboard-api/clients/${clientId}/test-plans/${planId}`
    setResult({ events: [], status: "streaming", plan: null, failure: null, clarification: null, stalled: false })
    const finish = (name: string, body: any) => {
      if (abort.signal.aborted) return
      if (name === "complete") setResult((r) => ({ ...r, status: "done", plan: body as TestPlan }))
      else if (name === "clarification") setResult((r) => ({ ...r, status: "clarification", clarification: body as PlanClarification }))
      else setResult((r) => ({ ...r, status: "failed", failure: body as PlanFailure }))
      abort.abort()
    }
    const poll = async () => {
      try {
        const response = await fetch(base, { headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) }, signal: abort.signal })
        if (response.ok) { const body = await response.json(); finish(body.status === "PLAN_READY" ? "complete" : body.status === "NEEDS_CLARIFICATION" ? "clarification" : "failed", body); return }
      } catch { /* retry below */ }
      if (!abort.signal.aborted) pollTimer = window.setTimeout(poll, 500)
    }
    const fallback = () => { if (polling) return; polling = true; void poll() }
    const consume = async () => {
      try {
        const response = await fetch(`${base}/events`, { headers, signal: abort.signal })
        if (!response.ok || !response.body) throw new Error("stream unavailable")
        const reader = response.body.getReader(); const decoder = new TextDecoder(); let buffer = ""
        while (!abort.signal.aborted) {
          const { value, done } = await reader.read(); if (done) break
          buffer += decoder.decode(value, { stream: true })
          buffer = parseSse(buffer, (name, raw) => { try { const body = JSON.parse(raw); if (name === "progress") setResult((r) => ({ ...r, events: [...r.events, body as LivePlanEvent] })); else finish(name, body) } catch { /* ignore malformed frames */ } })
        }
        if (!abort.signal.aborted && !polling) fallback()
      } catch { if (!abort.signal.aborted) fallback() }
    }
    stallTimer = window.setTimeout(() => setResult((r) => ({ ...r, stalled: true })), STALL_HINT_MS)
    void consume()
    return () => { abort.abort(); if (pollTimer) clearTimeout(pollTimer); if (stallTimer) clearTimeout(stallTimer); abortRef.current = null }
  }, [clientId, planId])
  return { ...result, cancel }
}
