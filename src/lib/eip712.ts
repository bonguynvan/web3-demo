/**
 * EIP-712 Sign-to-Trade — the authentication mechanism used by hybrid DEXs.
 *
 * HOW "SIGN-TO-TRADE" WORKS:
 * ==========================
 *
 * Problem: A centralized orderbook can match orders in milliseconds.
 *          But signing an on-chain transaction per order takes 15+ seconds
 *          and costs gas. Traders can't wait that long.
 *
 * Solution (what dYdX v3 invented):
 *   1. User connects wallet (MetaMask)
 *   2. User signs a structured message (EIP-712) — this is FREE, no gas
 *   3. The signed message proves "this wallet authorized this order"
 *   4. The DEX backend receives the signed order and matches it instantly
 *   5. Periodically, matched trades are settled on-chain in batches
 *
 * EIP-712 gives us:
 *   - Human-readable signing prompts (not raw hex)
 *   - Typed, structured data (not arbitrary bytes)
 *   - Domain separation (signatures can't be replayed on other apps)
 *   - Wallet support (MetaMask shows the fields clearly)
 *
 * SECURITY:
 *   - Each signed order includes: market, side, size, price, expiry, nonce
 *   - The nonce prevents replay attacks
 *   - The expiry prevents stale orders from being matched
 *   - The domain separator includes the contract address and chain ID
 */

import { type WalletClient } from 'viem'

// ---- EIP-712 Domain ----
// This identifies which app/contract the signature is for.
// A signature from "Perp DEX on chain 1" can't be used on "Other DEX on chain 1".
export const EIP712_DOMAIN = {
  name: 'PerpDEX',
  version: '1',
  chainId: 1,  // mainnet; in production, read from the connected chain
  verifyingContract: '0x1234567890abcdef1234567890abcdef12345678' as `0x${string}`,
} as const

// ---- Order Types ----
// These define the structure of what gets signed.
// The wallet shows these fields to the user before signing.
export const ORDER_TYPES = {
  Order: [
    { name: 'market', type: 'string' },       // e.g., "ETH-PERP"
    { name: 'side', type: 'string' },          // "long" or "short"
    { name: 'size', type: 'uint256' },         // in base asset, 18 decimals
    { name: 'price', type: 'uint256' },        // in quote asset, 18 decimals
    { name: 'leverage', type: 'uint256' },     // leverage, 18 decimals
    { name: 'orderType', type: 'string' },     // "market" or "limit"
    { name: 'expiry', type: 'uint256' },       // unix timestamp
    { name: 'nonce', type: 'uint256' },        // unique per order, prevents replay
    { name: 'trader', type: 'address' },       // the signer's address
  ],
} as const

// ---- Authentication Types ----
// Used for the initial "Sign-to-Trade" session authentication.
// User signs this once, then can submit orders via API without re-signing.
export const AUTH_TYPES = {
  Authentication: [
    { name: 'action', type: 'string' },        // "Sign-to-Trade"
    { name: 'timestamp', type: 'uint256' },     // when the auth was created
    { name: 'expiry', type: 'uint256' },        // session expiry
    { name: 'trader', type: 'address' },        // the signer's address
  ],
} as const

// ---- Order Message (what gets signed) ----
export interface OrderMessage {
  market: string
  side: 'long' | 'short'
  size: bigint
  price: bigint
  leverage: bigint
  orderType: 'market' | 'limit'
  expiry: bigint
  nonce: bigint
  trader: `0x${string}`
}

// ---- Signed Order (sent to the matching engine) ----
export interface SignedOrder {
  order: OrderMessage
  signature: `0x${string}`
  // The matching engine verifies: ecrecover(hash(order), signature) === order.trader
}

// ---- Auth Session ----
export interface AuthSession {
  trader: `0x${string}`
  signature: `0x${string}`
  timestamp: number
  expiry: number
}

let currentNonce = 0n

/**
 * Sign the initial authentication message.
 *
 * This is called once when the user clicks "Enable Trading".
 * After this, the session signature is sent with every API request
 * as proof that the wallet holder authorized this session.
 *
 * Flow:
 *   1. Frontend creates auth message with 24h expiry
 *   2. MetaMask shows: "Sign-to-Trade, expires at [time], trader: [address]"
 *   3. User clicks "Sign"
 *   4. Frontend stores the signature in memory
 *   5. All subsequent API calls include this signature in headers
 */
export async function signAuthentication(
  walletClient: WalletClient,
  account: `0x${string}`,
): Promise<AuthSession> {
  const timestamp = Math.floor(Date.now() / 1000)
  const expiry = timestamp + 86400 // 24 hours

  const signature = await walletClient.signTypedData({
    account,
    domain: EIP712_DOMAIN,
    types: AUTH_TYPES,
    primaryType: 'Authentication',
    message: {
      action: 'Sign-to-Trade',
      timestamp: BigInt(timestamp),
      expiry: BigInt(expiry),
      trader: account,
    },
  })

  return { trader: account, signature, timestamp, expiry }
}

/**
 * Sign an individual order using EIP-712.
 *
 * This is called every time the user places an order.
 * In "Sign-to-Trade" mode, this can happen automatically
 * (the session auth proves intent, individual order signatures
 * are for on-chain verification if needed).
 *
 * In practice, some DEXs:
 * - dYdX v3: signs every order individually (STARK key)
 * - Hyperliquid: signs every order individually (EIP-712)
 * - dYdX v4: uses Cosmos SDK, different signing model
 *
 * The MetaMask popup shows:
 *   Market: ETH-PERP
 *   Side: long
 *   Size: 5200000000000000000 (5.2 ETH in 18 decimals)
 *   Price: 3245670000000000000000 ($3245.67)
 *   ...
 */
export async function signOrder(
  walletClient: WalletClient,
  account: `0x${string}`,
  order: Omit<OrderMessage, 'nonce' | 'trader' | 'expiry'>,
): Promise<SignedOrder> {
  const nonce = ++currentNonce
  const expiry = BigInt(Math.floor(Date.now() / 1000) + 300) // 5 min expiry

  const fullOrder: OrderMessage = {
    ...order,
    nonce,
    expiry,
    trader: account,
  }

  const signature = await walletClient.signTypedData({
    account,
    domain: EIP712_DOMAIN,
    types: ORDER_TYPES,
    primaryType: 'Order',
    message: {
      ...fullOrder,
      // viem expects the message values to match the types exactly
      size: fullOrder.size,
      price: fullOrder.price,
      leverage: fullOrder.leverage,
      expiry: fullOrder.expiry,
      nonce: fullOrder.nonce,
    },
  })

  return { order: fullOrder, signature }
}

/**
 * Verify that a session is still valid.
 * Call this before submitting orders.
 */
export function isSessionValid(session: AuthSession | null): boolean {
  if (!session) return false
  const now = Math.floor(Date.now() / 1000)
  return now < session.expiry
}
