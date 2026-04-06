/**
 * Perp DEX Backend Server
 *
 * - HTTP API (Hono) on port 3001: /api/trades, /api/positions, /api/prices
 * - WebSocket on port 3002: price feed + event feed
 * - Event indexer: watches on-chain events, stores in SQLite
 *
 * Usage: tsx src/index.ts (or npm run dev for watch mode)
 */

import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { serve } from '@hono/node-server'
import { WebSocketServer } from 'ws'
import { config, initTokenSymbols } from './config.js'
import { getDb } from './db.js'
import { startIndexer } from './indexer.js'
import { tradesRouter } from './routes/trades.js'
import { positionsRouter } from './routes/positions.js'
import { pricesRouter } from './routes/prices.js'
import { setupPriceFeed, getPriceSubscriberCount } from './ws/price-feed.js'
import { setupEventFeed } from './ws/events.js'

async function main() {
  console.log('=== Perp DEX Backend Server ===')
  console.log(`RPC: ${config.rpcUrl}`)
  console.log(`HTTP: http://localhost:${config.httpPort}`)
  console.log(`WS:   ws://localhost:${config.wsPort}`)
  console.log('')

  // Init
  initTokenSymbols()
  getDb() // ensure schema is created

  // ─── HTTP API ───
  const app = new Hono()

  app.use('*', cors({
    origin: '*',
    allowMethods: ['GET', 'POST', 'OPTIONS'],
  }))

  app.get('/', (c) => c.json({
    name: 'perp-dex-server',
    version: '0.0.1',
    endpoints: [
      'GET /api/trades',
      'GET /api/positions/:address',
      'GET /api/prices/:token',
    ],
  }))

  app.route('/api/trades', tradesRouter)
  app.route('/api/positions', positionsRouter)
  app.route('/api/prices', pricesRouter)

  // Health check
  app.get('/health', (c) => c.json({
    ok: true,
    wsSubscribers: getPriceSubscriberCount(),
  }))

  serve({ fetch: app.fetch, port: config.httpPort }, () => {
    console.log(`[HTTP] Listening on port ${config.httpPort}`)
  })

  // ─── WebSocket ───
  const wss = new WebSocketServer({ port: config.wsPort })
  setupPriceFeed(wss)
  setupEventFeed(wss)
  console.log(`[WS] Listening on port ${config.wsPort}`)

  wss.on('connection', (ws) => {
    console.log(`[WS] Client connected (total: ${wss.clients.size})`)
    ws.on('close', () => {
      console.log(`[WS] Client disconnected (total: ${wss.clients.size})`)
    })
  })

  // ─── Event Indexer ───
  try {
    await startIndexer()
  } catch (err: unknown) {
    console.error(`[Indexer] Failed to start: ${err instanceof Error ? err.message : String(err)}`)
    console.error('[Indexer] Server will continue without indexing. Start Anvil and restart.')
  }

  console.log('\n[Server] Ready.')
}

main().catch(console.error)
