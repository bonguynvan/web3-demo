/**
 * Mock WebSocket server that simulates a DEX data feed.
 *
 * Channels:
 *   - ticker    : price updates (configurable rate)
 *   - orderbook : full orderbook snapshots
 *   - trades    : individual trade events
 *
 * Control messages (send from client):
 *   { "type": "set_rate", "channel": "ticker", "interval_ms": 1 }
 *   { "type": "set_rate", "channel": "orderbook", "interval_ms": 50 }
 *   { "type": "set_rate", "channel": "trades", "interval_ms": 5 }
 *   { "type": "burst", "count": 5000, "channel": "ticker" }  // burst N messages instantly
 *   { "type": "disconnect_test", "after_ms": 3000 }           // simulate network drop
 *   { "type": "stale_test" }                                   // send out-of-order sequence
 *
 * Run:
 *   npx tsx server/mockWsServer.ts
 *   npx tsx server/mockWsServer.ts --port 8081
 */

import { WebSocketServer, WebSocket } from 'ws'

const PORT = parseInt(process.argv.find((_, i, a) => a[i - 1] === '--port') || '8080')

const wss = new WebSocketServer({ port: PORT })
console.log(`[MockWS] Listening on ws://localhost:${PORT}`)

// ---- Market State ----
let price = 3245.67
let sequence = 0

function nextSeq() { return ++sequence }

function randomWalk(current: number, volatility: number): number {
  const change = (Math.random() - 0.48) * current * volatility
  return +(current + change).toFixed(2)
}

function generateOrderBookSnapshot(mid: number) {
  const asks: [number, number][] = []
  const bids: [number, number][] = []
  const tick = 0.01

  for (let i = 0; i < 25; i++) {
    asks.push([
      +(mid + (i + 1) * tick * (1 + Math.random() * 2)).toFixed(2),
      +(Math.random() * 50 + 0.5).toFixed(3),
    ])
    bids.push([
      +(mid - (i + 1) * tick * (1 + Math.random() * 2)).toFixed(2),
      +(Math.random() * 50 + 0.5).toFixed(3),
    ])
  }

  return {
    type: 'orderbook',
    seq: nextSeq(),
    ts: Date.now(),
    data: { asks, bids, mid },
  }
}

function generateTicker(mid: number) {
  return {
    type: 'ticker',
    seq: nextSeq(),
    ts: Date.now(),
    data: {
      price: mid,
      markPrice: +(mid + (Math.random() - 0.5) * 0.5).toFixed(2),
      indexPrice: +(mid + (Math.random() - 0.5) * 0.3).toFixed(2),
      volume24h: +(847_234_567 + Math.random() * 10_000_000).toFixed(0),
      change24h: +((Math.random() - 0.5) * 5).toFixed(2),
      fundingRate: +((Math.random() - 0.3) * 0.01).toFixed(4),
    },
  }
}

function generateTrade(mid: number) {
  const side = Math.random() > 0.5 ? 'long' : 'short'
  return {
    type: 'trade',
    seq: nextSeq(),
    ts: Date.now(),
    data: {
      id: `t-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      price: +(mid + (Math.random() - 0.5) * mid * 0.001).toFixed(2),
      size: +(Math.random() * 10 + 0.01).toFixed(3),
      side,
    },
  }
}

// ---- Per-client feed management ----
interface ClientState {
  intervals: Record<string, ReturnType<typeof setInterval>>
  rates: Record<string, number>
}

const clients = new Map<WebSocket, ClientState>()

function startFeed(ws: WebSocket, state: ClientState, channel: string, intervalMs: number) {
  // Clear existing
  if (state.intervals[channel]) clearInterval(state.intervals[channel])
  state.rates[channel] = intervalMs

  const sender = () => {
    if (ws.readyState !== WebSocket.OPEN) return
    price = randomWalk(price, 0.0003)

    let msg: object
    switch (channel) {
      case 'ticker':
        msg = generateTicker(price)
        break
      case 'orderbook':
        msg = generateOrderBookSnapshot(price)
        break
      case 'trades':
        msg = generateTrade(price)
        break
      default:
        return
    }
    ws.send(JSON.stringify(msg))
  }

  state.intervals[channel] = setInterval(sender, intervalMs)
}

function stopAllFeeds(state: ClientState) {
  Object.values(state.intervals).forEach(clearInterval)
}

wss.on('connection', (ws) => {
  console.log('[MockWS] Client connected')

  const state: ClientState = { intervals: {}, rates: {} }
  clients.set(ws, state)

  // Default rates: moderate (like a real exchange)
  startFeed(ws, state, 'ticker', 100)
  startFeed(ws, state, 'orderbook', 200)
  startFeed(ws, state, 'trades', 50)

  // Send initial snapshot
  ws.send(JSON.stringify({
    type: 'snapshot',
    seq: nextSeq(),
    ts: Date.now(),
    data: {
      ticker: generateTicker(price).data,
      orderbook: generateOrderBookSnapshot(price).data,
    },
  }))

  ws.on('message', (raw) => {
    try {
      const msg = JSON.parse(raw.toString())

      switch (msg.type) {
        case 'set_rate': {
          // Change update frequency for a channel
          const ms = Math.max(1, msg.interval_ms)
          console.log(`[MockWS] set_rate: ${msg.channel} = ${ms}ms (${(1000 / ms).toFixed(0)}/sec)`)
          startFeed(ws, state, msg.channel, ms)
          break
        }

        case 'burst': {
          // Send N messages as fast as possible (stress test)
          const count = msg.count || 1000
          const channel = msg.channel || 'ticker'
          console.log(`[MockWS] Burst: ${count} ${channel} messages`)
          for (let i = 0; i < count; i++) {
            price = randomWalk(price, 0.0003)
            let burstMsg: object
            switch (channel) {
              case 'ticker': burstMsg = generateTicker(price); break
              case 'orderbook': burstMsg = generateOrderBookSnapshot(price); break
              case 'trades': burstMsg = generateTrade(price); break
              default: continue
            }
            ws.send(JSON.stringify(burstMsg))
          }
          ws.send(JSON.stringify({ type: 'burst_complete', count }))
          break
        }

        case 'disconnect_test': {
          // Simulate network drop
          const afterMs = msg.after_ms || 3000
          console.log(`[MockWS] Will disconnect in ${afterMs}ms`)
          setTimeout(() => {
            ws.close()
            console.log('[MockWS] Simulated disconnect')
          }, afterMs)
          break
        }

        case 'stale_test': {
          // Send messages with out-of-order sequence numbers
          console.log('[MockWS] Sending stale (out-of-order) messages')
          const futureSeq = sequence + 100
          ws.send(JSON.stringify({ ...generateTicker(price + 50), seq: futureSeq }))
          ws.send(JSON.stringify({ ...generateTicker(price - 50), seq: futureSeq - 50 })) // stale!
          ws.send(JSON.stringify({ ...generateTicker(price), seq: futureSeq + 1 }))
          sequence = futureSeq + 1
          break
        }

        default:
          console.log(`[MockWS] Unknown message type: ${msg.type}`)
      }
    } catch (e) {
      console.error('[MockWS] Bad message:', e)
    }
  })

  ws.on('close', () => {
    console.log('[MockWS] Client disconnected')
    stopAllFeeds(state)
    clients.delete(ws)
  })
})

console.log(`
  Control the feed by sending JSON messages:

  Set update rates:
    {"type":"set_rate","channel":"ticker","interval_ms":1}      // 1000 tickers/sec
    {"type":"set_rate","channel":"orderbook","interval_ms":10}   // 100 books/sec
    {"type":"set_rate","channel":"trades","interval_ms":1}       // 1000 trades/sec

  Stress tests:
    {"type":"burst","count":5000,"channel":"ticker"}  // instant burst
    {"type":"disconnect_test","after_ms":3000}         // drop connection
    {"type":"stale_test"}                              // out-of-order seqs
`)
