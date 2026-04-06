/**
 * WebSocket event feed — broadcasts new trade events to subscribers.
 *
 * Clients subscribe with their address to receive only their own events,
 * or subscribe with "*" to receive all events.
 */

import { WebSocketServer, WebSocket } from 'ws'
import { tokenSymbol, formatUsd } from '../config.js'
import { setOnNewTrade } from '../indexer.js'
import type { TradeRow } from '../db.js'

interface Subscriber {
  ws: WebSocket
  filter: string // lowercase address or "*" for all
}

const subscribers: Subscriber[] = []

export function setupEventFeed(wss: WebSocketServer) {
  wss.on('connection', (ws) => {
    ws.on('message', (data) => {
      try {
        const msg = JSON.parse(data.toString())
        if (msg.type === 'subscribe' && msg.channel === 'events') {
          const filter = (msg.address ?? '*').toLowerCase()
          subscribers.push({ ws, filter })
        }
      } catch {
        // Ignore malformed messages
      }
    })

    ws.on('close', () => {
      // Remove all subscriptions for this socket
      for (let i = subscribers.length - 1; i >= 0; i--) {
        if (subscribers[i].ws === ws) {
          subscribers.splice(i, 1)
        }
      }
    })
  })

  // Hook into indexer to broadcast new events
  setOnNewTrade((trade: TradeRow) => {
    if (subscribers.length === 0) return

    const message = JSON.stringify({
      type: 'trade',
      eventType: trade.event_type,
      account: trade.account,
      token: tokenSymbol(trade.index_token),
      isLong: trade.is_long === 1,
      sizeDelta: formatUsd(BigInt(trade.size_delta)),
      price: formatUsd(BigInt(trade.price)),
      timestamp: trade.timestamp,
      txHash: trade.tx_hash,
    })

    for (const sub of subscribers) {
      if (sub.ws.readyState !== WebSocket.OPEN) continue
      if (sub.filter === '*' || sub.filter === trade.account) {
        sub.ws.send(message)
      }
    }
  })
}
