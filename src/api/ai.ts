/**
 * AI signal explainer — streaming client.
 *
 * Backend at /api/ai/explain returns text/event-stream. Each SSE
 * frame contains either `{"text":"…"}` (incremental chunk) or
 * `{"error":"…"}` (terminal). The stream ends with `[DONE]`.
 *
 * Server-side caches by signal id for 1 hour, so repeat clicks
 * stream the cached text in one immediate frame.
 */

import { getToken, apiBase, apiAvailable } from './client'

export interface ExplainRequest {
  signal_id: string
  source: string
  market_id: string
  direction: 'long' | 'short'
  confidence: number
  title: string
  detail: string
  price?: number
  change_24h?: number
}

export interface StreamCallbacks {
  onChunk: (text: string) => void
  onDone: (fullText: string) => void
  onError: (message: string) => void
}

/**
 * Stream the explainer. Returns an AbortController so the caller can
 * cancel mid-stream (component unmount, navigation).
 */
export function explainSignalStreaming(
  req: ExplainRequest,
  cb: StreamCallbacks,
): AbortController {
  const controller = new AbortController()
  void runStream('/api/ai/explain', req, cb, controller.signal)
  return controller
}

export interface FollowupTurn {
  role: 'user' | 'assistant'
  content: string
}

export interface FollowupRequest {
  signal_context: ExplainRequest
  history: FollowupTurn[]
  question: string
}

/** Multi-turn version. Same auth/Pro/rate-limit gates as explain. */
export function followupStreaming(
  req: FollowupRequest,
  cb: StreamCallbacks,
): AbortController {
  const controller = new AbortController()
  void runStream('/api/ai/followup', req, cb, controller.signal)
  return controller
}

/**
 * Strategy assistant — user submits a free-form trading hypothesis,
 * Claude streams back a bot config suggestion + rationale. Same
 * Pro gate + 30/hour rate limit as the explainer. No caching
 * (each hypothesis is bespoke).
 */
export function strategyAssistantStreaming(
  hypothesis: string,
  cb: StreamCallbacks,
): AbortController {
  const controller = new AbortController()
  void runStream('/api/ai/strategy', { hypothesis }, cb, controller.signal)
  return controller
}

async function runStream(path: string, req: object, cb: StreamCallbacks, signal: AbortSignal) {
  if (!apiAvailable()) {
    cb.onError('backend not configured')
    return
  }
  const token = getToken()
  if (!token) {
    cb.onError('sign in required')
    return
  }
  let res: Response
  try {
    res = await fetch(`${apiBase()}${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'text/event-stream',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(req),
      signal,
    })
  } catch (e) {
    cb.onError(e instanceof Error ? e.message : String(e))
    return
  }
  if (!res.ok) {
    // 402 = Pro required, 429 = rate limit, etc. Surface the
    // server's JSON error if it provided one.
    const txt = await res.text().catch(() => '')
    let msg = `HTTP ${res.status}`
    try {
      const j = JSON.parse(txt)
      if (j && typeof j.error === 'string') msg = j.error
    } catch { /* not JSON */ }
    cb.onError(msg)
    return
  }
  if (!res.body) {
    cb.onError('empty response')
    return
  }

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let fullText = ''

  try {
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const { value, done } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })

      // Process complete SSE frames (\n\n delimited).
      const frames = buffer.split('\n\n')
      buffer = frames.pop() ?? ''
      for (const frame of frames) {
        const lines = frame.split('\n')
        let isError = false
        let dataLine = ''
        for (const line of lines) {
          if (line.startsWith('event: error')) isError = true
          else if (line.startsWith('data: ')) dataLine = line.slice(6)
        }
        if (!dataLine) continue
        if (dataLine === '[DONE]') {
          cb.onDone(fullText)
          return
        }
        try {
          const parsed = JSON.parse(dataLine) as { text?: string; error?: string }
          if (isError || parsed.error) {
            cb.onError(parsed.error ?? 'stream error')
            return
          }
          if (typeof parsed.text === 'string') {
            fullText += parsed.text
            cb.onChunk(parsed.text)
          }
        } catch {
          /* malformed frame — ignore */
        }
      }
    }
    cb.onDone(fullText)
  } catch (e) {
    if (signal.aborted) return
    cb.onError(e instanceof Error ? e.message : String(e))
  }
}

/**
 * Parse Claude's streamed markdown into {explanation, risk}. Tolerant
 * of incomplete input — returns whatever it can split out so far.
 */
export function parseExplanation(raw: string): { explanation: string; risk: string } {
  const text = raw.trim()
  // Match the section headers Claude was asked to emit verbatim.
  const riskMarker = /(?:^|\n)\s*Risk\s*:\s*/i
  const split = text.split(riskMarker)
  if (split.length >= 2) {
    const explanation = split[0].replace(/^Explanation\s*:\s*/i, '').trim()
    const risk = split.slice(1).join('').trim()
    return { explanation, risk }
  }
  return { explanation: text.replace(/^Explanation\s*:\s*/i, '').trim(), risk: '' }
}
