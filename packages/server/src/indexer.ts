/**
 * Event Indexer — watches PositionManager events and stores them in SQLite.
 *
 * On startup: backfills from last indexed block to current block.
 * Then: subscribes via viem watchContractEvent for real-time events.
 * Detects chain resets (Anvil restart, block number rewind) and re-indexes.
 *
 * Block timestamps are real (fetched per block, cached) — not Date.now().
 */

import {
  publicClient,
  getAddresses,
  PositionManagerABI,
  PriceFeedABI,
} from './config.js'
import {
  getLastIndexedBlock,
  setLastIndexedBlock,
  insertTrades,
  insertPrice,
  resetDatabase,
  type TradeRow,
} from './db.js'

type EventCallback = (trade: TradeRow) => void

let onNewTrade: EventCallback | null = null

export function setOnNewTrade(cb: EventCallback): void {
  onNewTrade = cb
}

// ─── Block timestamp cache ──────────────────────────────────────────────────
// Avoids one RPC call per event during backfill. Bounded to keep memory flat
// for long-running processes.

const BLOCK_TS_CACHE_LIMIT = 5_000
const blockTimestampCache = new Map<bigint, number>()

async function getBlockTimestamp(blockNumber: bigint): Promise<number> {
  const cached = blockTimestampCache.get(blockNumber)
  if (cached !== undefined) return cached

  const block = await publicClient.getBlock({ blockNumber })
  const timestamp = Number(block.timestamp)

  if (blockTimestampCache.size >= BLOCK_TS_CACHE_LIMIT) {
    const firstKey = blockTimestampCache.keys().next().value
    if (firstKey !== undefined) blockTimestampCache.delete(firstKey)
  }
  blockTimestampCache.set(blockNumber, timestamp)
  return timestamp
}

/** Resolve a set of block timestamps in parallel, deduped via the cache. */
async function resolveBlockTimestamps(blockNumbers: readonly bigint[]): Promise<void> {
  const unique = Array.from(new Set(blockNumbers)).filter(b => !blockTimestampCache.has(b))
  if (unique.length === 0) return
  await Promise.all(
    unique.map(b =>
      getBlockTimestamp(b).catch(err => {
        console.error(`[Indexer] Failed to fetch block ${b} timestamp:`, errorMessage(err))
      }),
    ),
  )
}

// ─── Public API ─────────────────────────────────────────────────────────────

export async function startIndexer(): Promise<void> {
  const addresses = getAddresses()
  const currentBlock = await publicClient.getBlockNumber()
  let lastIndexed = getLastIndexedBlock()

  // Detect chain reset (Anvil restart pushes block number backward).
  if (lastIndexed > currentBlock) {
    console.log(
      `[Indexer] Chain reset detected (last: ${lastIndexed}, current: ${currentBlock}). Re-indexing.`,
    )
    resetDatabase()
    blockTimestampCache.clear()
    lastIndexed = 0n
  }

  // Backfill anything we missed.
  if (lastIndexed < currentBlock) {
    const fromBlock = lastIndexed > 0n ? lastIndexed + 1n : 0n
    console.log(`[Indexer] Backfilling blocks ${fromBlock} → ${currentBlock}`)
    try {
      await indexRange(addresses.positionManager, fromBlock, currentBlock)
      setLastIndexedBlock(currentBlock)
      console.log(`[Indexer] Backfill complete.`)
    } catch (err: unknown) {
      console.error(`[Indexer] Backfill ${fromBlock}→${currentBlock} failed:`, errorMessage(err))
      // Don't update cursor — next start will retry.
    }
  }

  // Live event subscriptions
  console.log(`[Indexer] Watching for new events from block ${currentBlock + 1n}...`)

  publicClient.watchContractEvent({
    address: addresses.positionManager,
    abi: PositionManagerABI,
    eventName: 'IncreasePosition',
    onLogs: logs => void handleLiveBatch(logs, 'increase'),
    onError: err => console.error(`[Indexer] watchEvent IncreasePosition error:`, errorMessage(err)),
  })

  publicClient.watchContractEvent({
    address: addresses.positionManager,
    abi: PositionManagerABI,
    eventName: 'DecreasePosition',
    onLogs: logs => void handleLiveBatch(logs, 'decrease'),
    onError: err => console.error(`[Indexer] watchEvent DecreasePosition error:`, errorMessage(err)),
  })

  publicClient.watchContractEvent({
    address: addresses.positionManager,
    abi: PositionManagerABI,
    eventName: 'LiquidatePosition',
    onLogs: logs => void handleLiveBatch(logs, 'liquidate'),
    onError: err => console.error(`[Indexer] watchEvent LiquidatePosition error:`, errorMessage(err)),
  })

  // Sample oracle prices for OHLC candle generation.
  startPricePoller(addresses)
}

// ─── Backfill ───────────────────────────────────────────────────────────────

async function indexRange(
  pmAddress: `0x${string}`,
  fromBlock: bigint,
  toBlock: bigint,
): Promise<void> {
  const [increaseLogs, decreaseLogs, liquidateLogs] = await Promise.all([
    publicClient.getContractEvents({
      address: pmAddress,
      abi: PositionManagerABI,
      eventName: 'IncreasePosition',
      fromBlock,
      toBlock,
    }),
    publicClient.getContractEvents({
      address: pmAddress,
      abi: PositionManagerABI,
      eventName: 'DecreasePosition',
      fromBlock,
      toBlock,
    }),
    publicClient.getContractEvents({
      address: pmAddress,
      abi: PositionManagerABI,
      eventName: 'LiquidatePosition',
      fromBlock,
      toBlock,
    }),
  ])

  // Pre-warm the timestamp cache so logToTrade() never blocks on RPC.
  const allBlocks = [
    ...increaseLogs.map(l => l.blockNumber),
    ...decreaseLogs.map(l => l.blockNumber),
    ...liquidateLogs.map(l => l.blockNumber),
  ].filter((b): b is bigint => b !== null)
  await resolveBlockTimestamps(allBlocks)

  const trades: TradeRow[] = []

  for (const log of increaseLogs) {
    const row = increaseLogToTrade(log)
    if (row) trades.push(row)
  }
  for (const log of decreaseLogs) {
    const row = decreaseLogToTrade(log)
    if (row) trades.push(row)
  }
  for (const log of liquidateLogs) {
    const row = liquidateLogToTrade(log)
    if (row) trades.push(row)
  }

  if (trades.length > 0) {
    insertTrades(trades)
    console.log(`[Indexer] Indexed ${trades.length} trades from blocks ${fromBlock}–${toBlock}.`)
  }
}

// ─── Live event handler ─────────────────────────────────────────────────────
// Each watchContractEvent subscription gets logs whose specific shape is
// derived from the eventName param. Rather than wrestle the viem generic
// machinery into a union, the live handler uses a structural input type and
// dispatches to the same per-event mappers as the backfill path.

interface LooseLog {
  blockNumber: bigint | null
  transactionHash: `0x${string}` | null
  logIndex: number | null
  args: Record<string, unknown>
}

async function handleLiveBatch(
  logs: readonly LooseLog[],
  eventType: 'increase' | 'decrease' | 'liquidate',
): Promise<void> {
  if (logs.length === 0) return

  const blocks = logs.map(l => l.blockNumber).filter((b): b is bigint => b !== null)
  try {
    await resolveBlockTimestamps(blocks)
  } catch (err: unknown) {
    console.error(
      `[Indexer] Failed to resolve block timestamps for ${eventType} batch:`,
      errorMessage(err),
    )
    return
  }

  const trades: TradeRow[] = []
  for (const log of logs) {
    const row =
      eventType === 'increase' ? increaseLogToTrade(log) :
      eventType === 'decrease' ? decreaseLogToTrade(log) :
      liquidateLogToTrade(log)
    if (row) {
      trades.push(row)
      onNewTrade?.(row)
    }
  }

  if (trades.length === 0) return

  try {
    insertTrades(trades)
  } catch (err: unknown) {
    console.error(`[Indexer] Failed to insert ${trades.length} ${eventType} trades:`, errorMessage(err))
    return
  }

  const maxBlock = trades.reduce(
    (m, t) => (BigInt(t.block_number) > m ? BigInt(t.block_number) : m),
    0n,
  )
  if (maxBlock > getLastIndexedBlock()) setLastIndexedBlock(maxBlock)
  console.log(`[Indexer] +${trades.length} ${eventType} event(s)`)
}

// ─── Log → row mappers ──────────────────────────────────────────────────────
// Use a structural input type so both backfill (getContractEvents result) and
// live (watchContractEvent callback parameter) feed into the same code. Each
// mapper does its own argument extraction and validation. Mismatched logs are
// dropped with `null`, never thrown.

function commonFields(log: LooseLog) {
  return {
    block_number: Number(log.blockNumber ?? 0n),
    tx_hash: log.transactionHash ?? '0x',
    log_index: log.logIndex ?? 0,
    timestamp:
      blockTimestampCache.get(log.blockNumber ?? 0n) ?? Math.floor(Date.now() / 1000),
  }
}

function asAddress(value: unknown): string | null {
  return typeof value === 'string' && value.startsWith('0x') ? value.toLowerCase() : null
}

function asBigInt(value: unknown): bigint | null {
  return typeof value === 'bigint' ? value : null
}

function increaseLogToTrade(log: LooseLog): TradeRow | null {
  const args = log.args
  const account = asAddress(args.account)
  const indexToken = asAddress(args.indexToken)
  const sizeDelta = asBigInt(args.sizeDelta)
  if (!account || !indexToken || sizeDelta === null) return null
  return {
    ...commonFields(log),
    event_type: 'increase',
    account,
    index_token: indexToken,
    is_long: args.isLong ? 1 : 0,
    size_delta: sizeDelta.toString(),
    collateral_delta: (asBigInt(args.collateralDelta) ?? 0n).toString(),
    price: (asBigInt(args.price) ?? 0n).toString(),
    fee: (asBigInt(args.fee) ?? 0n).toString(),
    usdc_out: '0', // opens never pay USDC out
  }
}

function decreaseLogToTrade(log: LooseLog): TradeRow | null {
  const args = log.args
  const account = asAddress(args.account)
  const indexToken = asAddress(args.indexToken)
  const sizeDelta = asBigInt(args.sizeDelta)
  if (!account || !indexToken || sizeDelta === null) return null
  return {
    ...commonFields(log),
    event_type: 'decrease',
    account,
    index_token: indexToken,
    is_long: args.isLong ? 1 : 0,
    size_delta: sizeDelta.toString(),
    collateral_delta: (asBigInt(args.collateralDelta) ?? 0n).toString(),
    price: (asBigInt(args.price) ?? 0n).toString(),
    fee: (asBigInt(args.fee) ?? 0n).toString(),
    // usdcOut is the actual USDC paid back to the receiver after settlement.
    // Realised PnL on the close is `usdc_out - collateral_delta - fee`.
    usdc_out: (asBigInt(args.usdcOut) ?? 0n).toString(),
  }
}

function liquidateLogToTrade(log: LooseLog): TradeRow | null {
  const args = log.args
  const account = asAddress(args.account)
  const indexToken = asAddress(args.indexToken)
  const size = asBigInt(args.size)
  if (!account || !indexToken || size === null) return null
  return {
    ...commonFields(log),
    event_type: 'liquidate',
    account,
    index_token: indexToken,
    is_long: args.isLong ? 1 : 0,
    size_delta: size.toString(),
    collateral_delta: (asBigInt(args.collateral) ?? 0n).toString(),
    price: (asBigInt(args.markPrice) ?? 0n).toString(),
    fee: (asBigInt(args.liquidationFee) ?? 0n).toString(),
    usdc_out: '0', // liquidations send the residual to the fee receiver, not the user
  }
}

// ─── Price poller ───────────────────────────────────────────────────────────

function startPricePoller(addresses: ReturnType<typeof getAddresses>): void {
  const tokens = [
    { address: addresses.weth, symbol: 'ETH' },
    { address: addresses.wbtc, symbol: 'BTC' },
  ]

  setInterval(async () => {
    let blockNumber: number
    let timestamp: number
    try {
      const block = await publicClient.getBlock()
      blockNumber = Number(block.number)
      timestamp = Number(block.timestamp)
    } catch (err: unknown) {
      console.error(`[Indexer] Price poll: failed to read latest block:`, errorMessage(err))
      return
    }

    for (const token of tokens) {
      try {
        const price = (await publicClient.readContract({
          address: addresses.priceFeed,
          abi: PriceFeedABI,
          functionName: 'getLatestPrice',
          args: [token.address],
        })) as bigint

        insertPrice(token.address.toLowerCase(), price.toString(), blockNumber, timestamp)
      } catch (err: unknown) {
        console.error(`[Indexer] Price poll: ${token.symbol} read failed:`, errorMessage(err))
      }
    }
  }, 5_000)
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message
  return String(err)
}
