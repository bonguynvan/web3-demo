/**
 * Order Flow — the complete lifecycle of a trade on a hybrid DEX.
 *
 * ══════════════════════════════════════════════════════════════════
 *  THE COMPLETE DATA FLOW: User clicks "Long" → Order is settled
 * ══════════════════════════════════════════════════════════════════
 *
 *  ┌─────────────┐     ┌─────────────┐     ┌──────────────────┐
 *  │   FRONTEND   │     │  OFF-CHAIN   │     │    ON-CHAIN       │
 *  │  (React App) │     │   (Server)   │     │  (Smart Contract) │
 *  └──────┬───────┘     └──────┬───────┘     └────────┬──────────┘
 *         │                     │                      │
 *  STEP 1 │ User clicks "Long ETH-PERP"               │
 *         │                     │                      │
 *  STEP 2 │ Frontend builds OrderMessage:              │
 *         │   { market: "ETH-PERP",                    │
 *         │     side: "long",                          │
 *         │     size: 5.2 ETH (as BigInt 18dec),       │
 *         │     price: $3245.67 (as BigInt 18dec),     │
 *         │     leverage: 10x,                         │
 *         │     orderType: "market",                   │
 *         │     expiry: now + 5min,                    │
 *         │     nonce: unique counter }                │
 *         │                     │                      │
 *  STEP 3 │ EIP-712 Signing:                           │
 *         │ MetaMask shows structured order fields      │
 *         │ User clicks "Sign" → signature (65 bytes)  │
 *         │                     │                      │
 *  STEP 4 │────── POST /order ─────→│                  │
 *         │  { order, signature }   │                  │
 *         │  + session auth header  │                  │
 *         │                         │                  │
 *  STEP 5 │                    │ Server verifies:      │
 *         │                    │  a) ecrecover(sig) == trader address
 *         │                    │  b) order not expired  │
 *         │                    │  c) nonce not used     │
 *         │                    │  d) sufficient margin  │
 *         │                    │                        │
 *  STEP 6 │                    │ Matching Engine:       │
 *         │                    │  Find counterparty     │
 *         │                    │  Match at best price   │
 *         │                    │  (< 1ms latency)      │
 *         │                    │                        │
 *  STEP 7 │←── WS: order_update ──│                    │
 *         │  { status: "filled",   │                   │
 *         │    fillPrice: 3245.89, │                   │
 *         │    fillSize: 5.2 }     │                   │
 *         │                        │                   │
 *  STEP 8 │                    │ Batch Settlement:     │
 *         │                    │  Every N seconds,     │
 *         │                    │  matched trades are   │
 *         │                    │──── settled on-chain ─────→│
 *         │                    │  submitBatch([trade1,  │  │
 *         │                    │    trade2, ...])       │  │ Verify sigs
 *         │                    │                        │  │ Update balances
 *         │                    │                        │  │ Emit events
 *         │                    │                        │  │
 *  STEP 9 │←── WS: settlement ──│←── Event logs ──────│
 *         │  { txHash: "0x...",  │                     │
 *         │    status: "settled" }│                    │
 *         │                      │                     │
 *  DONE   │ UI shows:                                  │
 *         │  ✓ Position open: Long 5.2 ETH @ $3245.89 │
 *         │  ✓ Settled on-chain: tx 0x...              │
 *         └──────────────────────────────────────────────
 *
 * WHY HYBRID (OFF-CHAIN MATCHING + ON-CHAIN SETTLEMENT)?
 * ======================================================
 * - Pure on-chain DEX (Uniswap): every trade is a transaction (slow, expensive)
 * - Pure centralized exchange: fast, but you trust the operator with your funds
 * - Hybrid (dYdX model): fast matching + crypto guarantees
 *     - Speed: orders match in <1ms (like Binance)
 *     - Security: funds are in smart contract (not the operator's wallet)
 *     - Verifiable: all matched trades are proven on-chain
 *     - Non-custodial: operator can't steal your margin
 */

import { type WalletClient } from 'viem'
import { signOrder, isSessionValid, type SignedOrder, type AuthSession } from './eip712'
import { FP } from './fixedPoint'

// ---- Order Status Lifecycle ----
export type OrderStatus =
  | 'building'      // Frontend is constructing the order
  | 'signing'       // Waiting for MetaMask signature
  | 'submitting'    // Sending to matching engine API
  | 'pending'       // Accepted by matching engine, waiting for match
  | 'matched'       // Matched with counterparty (off-chain)
  | 'settling'      // Being settled on-chain
  | 'settled'       // Confirmed on-chain — done!
  | 'rejected'      // Matching engine rejected (insufficient margin, etc.)
  | 'expired'       // Order expired before being matched
  | 'failed'        // Signing or submission failed

export interface OrderUpdate {
  orderId: string
  status: OrderStatus
  fillPrice?: bigint
  fillSize?: bigint
  txHash?: string
  error?: string
  timestamp: number
}

export type OrderUpdateCallback = (update: OrderUpdate) => void

/**
 * Submit an order — the complete flow from button click to settlement.
 *
 * This is what happens when the user clicks "Long" or "Short".
 * The callback fires for each status change so the UI can show progress.
 */
export async function submitOrder(
  params: {
    walletClient: WalletClient
    account: `0x${string}`
    session: AuthSession
    market: string
    side: 'long' | 'short'
    size: bigint         // in base asset, 18 decimals
    price: bigint        // in quote asset, 18 decimals
    leverage: bigint     // 18 decimals
    orderType: 'market' | 'limit'
  },
  onUpdate: OrderUpdateCallback,
): Promise<void> {
  const orderId = `order-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
  const { walletClient, account, session, market, side, size, price, leverage, orderType } = params

  try {
    // ── STEP 1: Validate session ──
    if (!isSessionValid(session)) {
      onUpdate({ orderId, status: 'failed', error: 'Session expired. Please re-authenticate.', timestamp: Date.now() })
      return
    }

    // ── STEP 2: Build order message ──
    onUpdate({ orderId, status: 'building', timestamp: Date.now() })

    // Validate margin requirement
    const notional = FP.mul(size, price)
    void FP.div(notional, leverage) // requiredMargin — in production, check against on-chain balance

    // ── STEP 3: Sign order with EIP-712 ──
    onUpdate({ orderId, status: 'signing', timestamp: Date.now() })

    let signedOrder: SignedOrder
    try {
      signedOrder = await signOrder(walletClient, account, {
        market,
        side,
        size,
        price,
        leverage,
        orderType,
      })
    } catch (err) {
      // User rejected in MetaMask, or signing failed
      const message = err instanceof Error ? err.message : 'Signing failed'
      onUpdate({ orderId, status: 'failed', error: message, timestamp: Date.now() })
      return
    }

    // ── STEP 4: Submit to matching engine API ──
    onUpdate({ orderId, status: 'submitting', timestamp: Date.now() })

    // In production, this would be:
    //   const response = await fetch('https://api.dex.com/v1/orders', {
    //     method: 'POST',
    //     headers: {
    //       'Content-Type': 'application/json',
    //       'X-Auth-Signature': session.signature,
    //       'X-Auth-Timestamp': String(session.timestamp),
    //     },
    //     body: JSON.stringify({
    //       order: {
    //         ...signedOrder.order,
    //         size: signedOrder.order.size.toString(),
    //         price: signedOrder.order.price.toString(),
    //         leverage: signedOrder.order.leverage.toString(),
    //         expiry: signedOrder.order.expiry.toString(),
    //         nonce: signedOrder.order.nonce.toString(),
    //       },
    //       signature: signedOrder.signature,
    //     }),
    //   })

    // ── MOCK: Simulate matching engine ──
    await simulateMatchingEngine(orderId, signedOrder, onUpdate)

  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    onUpdate({ orderId, status: 'failed', error: message, timestamp: Date.now() })
  }
}

/**
 * Mock matching engine — simulates what happens server-side.
 *
 * In production, the matching engine is a high-performance server
 * (usually written in Rust/C++) that:
 * 1. Receives signed orders via API
 * 2. Verifies signatures (ecrecover)
 * 3. Checks margin requirements against on-chain balances
 * 4. Maintains an in-memory orderbook
 * 5. Matches orders using price-time priority
 * 6. Sends fill notifications via WebSocket
 * 7. Batches matched trades for on-chain settlement
 */
async function simulateMatchingEngine(
  orderId: string,
  signedOrder: SignedOrder,
  onUpdate: OrderUpdateCallback,
) {
  // Step 5: Order accepted, pending match
  onUpdate({ orderId, status: 'pending', timestamp: Date.now() })

  // Simulate matching delay (real engine: <1ms, we add drama)
  await delay(300 + Math.random() * 700)

  // Step 6: Matched!
  // The fill price might differ from the order price (slippage for market orders)
  const slippage = signedOrder.order.orderType === 'market'
    ? FP.pct(signedOrder.order.price, Math.random() > 0.5 ? 5 : -5)  // ±0.05%
    : 0n
  const fillPrice = FP.add(signedOrder.order.price, slippage)

  onUpdate({
    orderId,
    status: 'matched',
    fillPrice,
    fillSize: signedOrder.order.size,
    timestamp: Date.now(),
  })

  // Step 7: Settlement (batched on-chain)
  // In production, this happens asynchronously — the matching engine
  // batches N trades together and submits one on-chain transaction.
  await delay(2000 + Math.random() * 3000)

  onUpdate({ orderId, status: 'settling', timestamp: Date.now() })

  await delay(1000 + Math.random() * 2000)

  // Step 8: Settled on-chain
  const fakeTxHash = `0x${Array.from({ length: 64 }, () => Math.floor(Math.random() * 16).toString(16)).join('')}` as `0x${string}`

  onUpdate({
    orderId,
    status: 'settled',
    fillPrice,
    fillSize: signedOrder.order.size,
    txHash: fakeTxHash,
    timestamp: Date.now(),
  })
}

function delay(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

// ---- Order History Store (tracks in-flight orders) ----
import { create } from 'zustand'

interface OrderFlowState {
  activeOrders: Map<string, OrderUpdate>
  orderHistory: OrderUpdate[]
  updateOrder: (update: OrderUpdate) => void
  clearHistory: () => void
}

export const useOrderFlowStore = create<OrderFlowState>((set) => ({
  activeOrders: new Map(),
  orderHistory: [],

  updateOrder: (update) => set(state => {
    const newActive = new Map(state.activeOrders)

    if (['settled', 'rejected', 'expired', 'failed'].includes(update.status)) {
      newActive.delete(update.orderId)
    } else {
      newActive.set(update.orderId, update)
    }

    return {
      activeOrders: newActive,
      orderHistory: [update, ...state.orderHistory.slice(0, 99)],
    }
  }),

  clearHistory: () => set({ orderHistory: [] }),
}))
