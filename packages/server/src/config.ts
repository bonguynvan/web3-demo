/**
 * Server configuration — shared viem client and contract references.
 *
 * ABIs and default addresses are imported from `@perp-dex/contracts/typechain`
 * (the source of truth that the frontend also uses) so the indexer cannot
 * drift when the contracts change.
 *
 * Env vars override the typechain defaults when deploying to a non-Anvil
 * chain (e.g. Arbitrum Sepolia). RPC_URL is the only var that's typically
 * needed locally.
 */

import { readFileSync, existsSync } from 'fs'
import { dirname, resolve } from 'path'
import { fileURLToPath } from 'url'
import {
  createPublicClient,
  http,
  parseAbi,
  type Address,
} from 'viem'
import { foundry } from 'viem/chains'
// Import the leaf files directly with explicit .ts extensions.
//
// Why not the barrel: `index.ts` re-exports `from "./addresses"` (no file
// extension), which Node 24 strict-ESM cannot resolve. Vite handles it for
// the frontend but tsx-on-Node-24 doesn't.
//
// Why .ts and not .js: tsx 4.21's `.js → .ts` runtime rewrite is broken on
// Node 24 — it finds the file but the named exports come back empty
// (probably an interaction with Node's native --experimental-strip-types).
// Explicit `.ts` extensions sidestep the rewrite path entirely and load
// correctly. tsc accepts them via `allowImportingTsExtensions`.
import {
  PositionManagerABI as PositionManagerHumanABI,
  PriceFeedABI as PriceFeedHumanABI,
  VaultABI as VaultHumanABI,
} from '../../contracts/typechain/abis.ts'
import {
  LOCALHOST_ADDRESSES,
  type ContractAddresses,
} from '../../contracts/typechain/addresses.ts'

const RPC_URL = process.env.RPC_URL ?? 'http://127.0.0.1:8545'
const HTTP_PORT = parseInt(process.env.PORT ?? '3001', 10)
const WS_PORT = parseInt(process.env.WS_PORT ?? '3002', 10)

export const config = {
  rpcUrl: RPC_URL,
  httpPort: HTTP_PORT,
  wsPort: WS_PORT,
} as const

export const publicClient = createPublicClient({
  chain: foundry,
  // 30s timeout — Anvil chokes under concurrent load from keeper +
  // liquidator + indexer + frontend. Prevents watch filters and the
  // price poller from dying on temporary congestion.
  transport: http(RPC_URL, { timeout: 30_000 }),
})

// Re-export the typechain shape so consumers don't need a second import.
export type Addresses = ContractAddresses

/**
 * Resolve contract addresses for the current environment.
 *
 * Resolution order (first match wins):
 *   1. Per-address env var (e.g. ROUTER_ADDRESS) — used for testnet deploys
 *   2. `src/addresses.json` at the repo root — written by `scripts/export-addresses.mjs`
 *      after every fresh `forge script DeployLocal`. This is the same file the
 *      frontend reads, so the server cannot drift from the deployed contracts.
 *   3. Typechain `LOCALHOST_ADDRESSES` — fallback for CI / first-time setup
 *      before a deploy has happened.
 *
 * The file is read once at module load. If you redeploy the contracts mid-
 * session you'll need to restart the server to pick up the new addresses
 * (tsx watch will do this automatically when addresses.json changes if
 * you're running `pnpm dev`).
 */

const __dirname = dirname(fileURLToPath(import.meta.url))
const ADDRESSES_JSON_PATH = resolve(__dirname, '../../../src/addresses.json')

interface AddressesJsonShape {
  usdc?: string
  weth?: string
  wbtc?: string
  ethOracle?: string
  btcOracle?: string
  plp?: string
  priceFeed?: string
  vault?: string
  positionManager?: string
  router?: string
}

function loadAddressesFromJson(): AddressesJsonShape | null {
  try {
    if (!existsSync(ADDRESSES_JSON_PATH)) return null
    const raw = readFileSync(ADDRESSES_JSON_PATH, 'utf-8')
    return JSON.parse(raw) as AddressesJsonShape
  } catch (err: unknown) {
    console.warn(
      `[config] Failed to read ${ADDRESSES_JSON_PATH}, falling back to typechain defaults:`,
      err instanceof Error ? err.message : String(err),
    )
    return null
  }
}

const ADDRESSES_FROM_JSON = loadAddressesFromJson()
if (ADDRESSES_FROM_JSON) {
  console.log('[config] Loaded contract addresses from src/addresses.json')
} else {
  console.log('[config] Using typechain LOCALHOST_ADDRESSES (no addresses.json found)')
}

function pickAddress(envKey: string, jsonKey: keyof AddressesJsonShape, fallback: string): Address {
  return (
    process.env[envKey] ??
    ADDRESSES_FROM_JSON?.[jsonKey] ??
    fallback
  ) as Address
}

export function getAddresses(): Addresses {
  return {
    usdc: pickAddress('USDC_ADDRESS', 'usdc', LOCALHOST_ADDRESSES.usdc),
    weth: pickAddress('WETH_ADDRESS', 'weth', LOCALHOST_ADDRESSES.weth),
    wbtc: pickAddress('WBTC_ADDRESS', 'wbtc', LOCALHOST_ADDRESSES.wbtc),
    ethOracle: pickAddress('ETH_ORACLE_ADDRESS', 'ethOracle', LOCALHOST_ADDRESSES.ethOracle),
    btcOracle: pickAddress('BTC_ORACLE_ADDRESS', 'btcOracle', LOCALHOST_ADDRESSES.btcOracle),
    plp: pickAddress('PLP_ADDRESS', 'plp', LOCALHOST_ADDRESSES.plp),
    priceFeed: pickAddress('PRICE_FEED_ADDRESS', 'priceFeed', LOCALHOST_ADDRESSES.priceFeed),
    vault: pickAddress('VAULT_ADDRESS', 'vault', LOCALHOST_ADDRESSES.vault),
    positionManager: pickAddress('POSITION_MANAGER_ADDRESS', 'positionManager', LOCALHOST_ADDRESSES.positionManager),
    router: pickAddress('ROUTER_ADDRESS', 'router', LOCALHOST_ADDRESSES.router),
  }
}

// ABIs are stored as string arrays in the typechain barrel; viem needs them
// parsed once at startup. parseAbi is the cheapest way to do this.
export const PositionManagerABI = parseAbi(PositionManagerHumanABI)
export const PriceFeedABI = parseAbi(PriceFeedHumanABI)
export const VaultABI = parseAbi(VaultHumanABI)

// ─── Token symbol mapping ───────────────────────────────────────────────────

export const TOKEN_SYMBOLS: Record<string, string> = {}

export function initTokenSymbols(): void {
  const addr = getAddresses()
  TOKEN_SYMBOLS[addr.weth.toLowerCase()] = 'ETH'
  TOKEN_SYMBOLS[addr.wbtc.toLowerCase()] = 'BTC'
}

export function tokenSymbol(address: string): string {
  return TOKEN_SYMBOLS[address.toLowerCase()] ?? address.slice(0, 10)
}

// ─── Market metadata ────────────────────────────────────────────────────────

export interface MarketMeta {
  symbol: string
  baseAsset: string
  indexToken: Address
}

/** Markets exposed via REST/WS. Mirrors `getMarkets()` in the frontend. */
export function getMarkets(): MarketMeta[] {
  const addr = getAddresses()
  return [
    { symbol: 'ETH-PERP', baseAsset: 'ETH', indexToken: addr.weth },
    { symbol: 'BTC-PERP', baseAsset: 'BTC', indexToken: addr.wbtc },
  ]
}

export function marketBySymbol(symbol: string): MarketMeta | null {
  return getMarkets().find(m => m.symbol === symbol) ?? null
}

// ─── Precision helpers ──────────────────────────────────────────────────────

export const PRICE_PRECISION = 10n ** 30n
export const USDC_DENOM = PRICE_PRECISION / 10n ** 6n // 10^24

/** Convert a 30-dec internal amount to a display dollar number. */
export function formatUsd(amount: bigint): number {
  const usdc = amount / USDC_DENOM
  return Number(usdc) / 1e6
}
