/**
 * WebSocket price feed — polls oracle, broadcasts to all subscribers.
 *
 * One server polls the RPC node, broadcasts to N frontend clients.
 * More efficient than each client polling independently.
 */

import { WebSocketServer, WebSocket } from 'ws'
import { publicClient, getAddresses, PriceFeedABI, PRICE_PRECISION } from '../config.js'

const subscribers = new Set<WebSocket>()

export function setupPriceFeed(wss: WebSocketServer) {
  wss.on('connection', (ws) => {
    ws.on('message', (data) => {
      try {
        const msg = JSON.parse(data.toString())
        if (msg.type === 'subscribe' && msg.channel === 'prices') {
          subscribers.add(ws)
        }
        if (msg.type === 'unsubscribe' && msg.channel === 'prices') {
          subscribers.delete(ws)
        }
      } catch {
        // Ignore malformed messages
      }
    })

    ws.on('close', () => {
      subscribers.delete(ws)
    })
  })

  // Poll prices every 3 seconds and broadcast
  const addresses = getAddresses()
  const tokens = [
    { address: addresses.weth, symbol: 'ETH' },
    { address: addresses.wbtc, symbol: 'BTC' },
  ]

  setInterval(async () => {
    if (subscribers.size === 0) return

    for (const token of tokens) {
      try {
        const price = await publicClient.readContract({
          address: addresses.priceFeed,
          abi: PriceFeedABI,
          functionName: 'getLatestPrice',
          args: [token.address],
        }) as bigint

        const usdPrice = Number(price / (PRICE_PRECISION / 10n ** 6n)) / 1e6

        const message = JSON.stringify({
          type: 'price',
          token: token.symbol,
          tokenAddress: token.address.toLowerCase(),
          price: usdPrice,
          priceRaw: price.toString(),
          timestamp: Date.now(),
        })

        for (const ws of subscribers) {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(message)
          }
        }
      } catch {
        // Oracle not available
      }
    }
  }, 3_000)
}

export function getPriceSubscriberCount(): number {
  return subscribers.size
}
