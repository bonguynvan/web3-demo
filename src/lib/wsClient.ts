/**
 * Resilient WebSocket client for trading data.
 *
 * Handles the problems real DEX frontends face:
 * 1. Auto-reconnect with exponential backoff
 * 2. Sequence-based stale data rejection
 * 3. Message batching via requestAnimationFrame
 * 4. Connection state tracking
 * 5. Heartbeat / stale detection
 */

export type ConnectionStatus = 'connecting' | 'connected' | 'reconnecting' | 'disconnected'

export interface WsMessage {
  type: string
  seq: number
  ts: number
  data: unknown
}

interface WsClientOptions {
  url: string
  onMessage: (msg: WsMessage) => void
  onStatusChange: (status: ConnectionStatus) => void
  maxReconnectAttempts?: number
  staleThresholdMs?: number   // if no message for this long, mark as stale
  batchUpdates?: boolean       // batch via rAF instead of processing every message
}

export class WsClient {
  private ws: WebSocket | null = null
  private opts: Required<WsClientOptions>
  private lastSeq: Record<string, number> = {}  // per-channel sequence tracking
  private reconnectAttempt = 0
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private staleTimer: ReturnType<typeof setTimeout> | null = null
  private pendingMessages: WsMessage[] = []
  private rafId = 0
  private _status: ConnectionStatus = 'disconnected'
  private intentionalClose = false

  // Stats for perf monitoring
  messagesReceived = 0
  messagesDropped = 0
  messagesProcessed = 0

  constructor(opts: WsClientOptions) {
    this.opts = {
      maxReconnectAttempts: 10,
      staleThresholdMs: 5000,
      batchUpdates: true,
      ...opts,
    }
  }

  get status() { return this._status }

  connect() {
    this.intentionalClose = false
    this.setStatus('connecting')

    try {
      this.ws = new WebSocket(this.opts.url)
    } catch {
      this.scheduleReconnect()
      return
    }

    this.ws.onopen = () => {
      this.reconnectAttempt = 0
      this.setStatus('connected')
      this.resetStaleTimer()
    }

    this.ws.onmessage = (event) => {
      this.messagesReceived++
      this.resetStaleTimer()

      try {
        const msg: WsMessage = JSON.parse(event.data)

        // Stale data rejection: drop messages with older sequence than what we've seen
        if (msg.seq !== undefined && msg.type) {
          const key = msg.type
          if (this.lastSeq[key] !== undefined && msg.seq <= this.lastSeq[key]) {
            this.messagesDropped++
            return // stale message — drop it
          }
          this.lastSeq[key] = msg.seq
        }

        if (this.opts.batchUpdates) {
          this.pendingMessages.push(msg)
          this.scheduleFlush()
        } else {
          this.messagesProcessed++
          this.opts.onMessage(msg)
        }
      } catch {
        // malformed message — ignore
      }
    }

    this.ws.onclose = () => {
      if (!this.intentionalClose) {
        this.scheduleReconnect()
      } else {
        this.setStatus('disconnected')
      }
    }

    this.ws.onerror = () => {
      // onclose will fire after onerror, which handles reconnect
    }
  }

  disconnect() {
    this.intentionalClose = true
    this.cleanup()
    this.setStatus('disconnected')
  }

  /** Send a control message to the server */
  send(msg: object) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg))
    }
  }

  // ---- rAF batching ----
  // Instead of processing every WS message immediately (which would cause
  // 1000 React re-renders/sec), we collect messages and flush once per frame.
  // This is the #1 optimization for high-frequency trading UIs.
  private scheduleFlush() {
    if (this.rafId) return  // already scheduled
    this.rafId = requestAnimationFrame(() => {
      this.rafId = 0
      const batch = this.pendingMessages
      this.pendingMessages = []
      this.messagesProcessed += batch.length

      // Process all pending messages. For most channels, only the latest matters.
      // This deduplication is key: if we got 50 ticker updates in one frame,
      // we only need to render the last one.
      const latest = new Map<string, WsMessage>()
      const trades: WsMessage[] = []

      for (const msg of batch) {
        if (msg.type === 'trade') {
          trades.push(msg)  // trades accumulate, not deduplicate
        } else {
          latest.set(msg.type, msg)  // only keep latest ticker/orderbook
        }
      }

      // Deliver deduplicated messages
      for (const msg of latest.values()) {
        this.opts.onMessage(msg)
      }
      // Deliver trades as a batch
      if (trades.length > 0) {
        this.opts.onMessage({
          type: 'trades_batch',
          seq: trades[trades.length - 1].seq,
          ts: Date.now(),
          data: trades.map(t => t.data),
        })
      }
    })
  }

  // ---- Reconnection with exponential backoff ----
  private scheduleReconnect() {
    if (this.reconnectAttempt >= this.opts.maxReconnectAttempts) {
      this.setStatus('disconnected')
      return
    }

    this.setStatus('reconnecting')
    const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempt), 30000)
    this.reconnectAttempt++

    console.log(`[WS] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempt})`)
    this.reconnectTimer = setTimeout(() => this.connect(), delay)
  }

  // ---- Stale detection ----
  // If we don't get any message for staleThresholdMs, something is wrong.
  // The UI should show a "stale data" indicator.
  private resetStaleTimer() {
    if (this.staleTimer) clearTimeout(this.staleTimer)
    this.staleTimer = setTimeout(() => {
      console.warn('[WS] Data feed appears stale')
      this.opts.onStatusChange('reconnecting')
    }, this.opts.staleThresholdMs)
  }

  private setStatus(status: ConnectionStatus) {
    this._status = status
    this.opts.onStatusChange(status)
  }

  private cleanup() {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer)
    if (this.staleTimer) clearTimeout(this.staleTimer)
    if (this.rafId) cancelAnimationFrame(this.rafId)
    if (this.ws) {
      this.ws.onopen = null
      this.ws.onmessage = null
      this.ws.onclose = null
      this.ws.onerror = null
      if (this.ws.readyState === WebSocket.OPEN) this.ws.close()
    }
    this.ws = null
    this.pendingMessages = []
  }
}
