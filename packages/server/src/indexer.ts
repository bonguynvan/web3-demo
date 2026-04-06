/**
 * Event Indexer — watches PositionManager events and stores them in SQLite.
 *
 * On startup: backfills from last indexed block to current block.
 * Then: watches for new events in real-time.
 * Detects chain resets (Anvil restart) and re-indexes from scratch.
 */

import { type Log, getAddress } from 'viem'
import {
  publicClient,
  getAddresses,
  PositionManagerABI,
  PriceFeedABI,
  tokenSymbol,
  formatUsd,
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

export function setOnNewTrade(cb: EventCallback) {
  onNewTrade = cb
}

export async function startIndexer() {
  const addresses = getAddresses()
  const currentBlock = await publicClient.getBlockNumber()
  let lastIndexed = getLastIndexedBlock()

  // Detect chain reset (block number went backward)
  if (lastIndexed > currentBlock) {
    console.log(`[Indexer] Chain reset detected (last: ${lastIndexed}, current: ${currentBlock}). Re-indexing.`)
    resetDatabase()
    lastIndexed = 0n
  }

  // Backfill
  if (lastIndexed < currentBlock) {
    const fromBlock = lastIndexed > 0n ? lastIndexed + 1n : 0n
    console.log(`[Indexer] Backfilling blocks ${fromBlock} → ${currentBlock}`)
    await indexRange(addresses.positionManager, fromBlock, currentBlock)
    setLastIndexedBlock(currentBlock)
    console.log(`[Indexer] Backfill complete.`)
  }

  // Watch for new events
  console.log(`[Indexer] Watching for new events from block ${currentBlock + 1n}...`)

  publicClient.watchContractEvent({
    address: addresses.positionManager,
    abi: PositionManagerABI,
    eventName: 'IncreasePosition',
    onLogs: (logs) => processLogs(logs, 'increase'),
  })

  publicClient.watchContractEvent({
    address: addresses.positionManager,
    abi: PositionManagerABI,
    eventName: 'DecreasePosition',
    onLogs: (logs) => processLogs(logs, 'decrease'),
  })

  publicClient.watchContractEvent({
    address: addresses.positionManager,
    abi: PositionManagerABI,
    eventName: 'LiquidatePosition',
    onLogs: (logs) => processLogs(logs, 'liquidate'),
  })

  // Price polling — sample oracle prices every 5 seconds for candle data
  startPricePoller(addresses)
}

async function indexRange(pmAddress: `0x${string}`, fromBlock: bigint, toBlock: bigint) {
  const addresses = getAddresses()
  const trades: TradeRow[] = []

  // Fetch all three event types
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

  for (const log of increaseLogs) {
    const trade = logToTrade(log, 'increase')
    if (trade) trades.push(trade)
  }
  for (const log of decreaseLogs) {
    const trade = logToTrade(log, 'decrease')
    if (trade) trades.push(trade)
  }
  for (const log of liquidateLogs) {
    const trade = logToTrade(log, 'liquidate')
    if (trade) trades.push(trade)
  }

  if (trades.length > 0) {
    insertTrades(trades)
    console.log(`[Indexer] Indexed ${trades.length} trades from backfill.`)
  }
}

function logToTrade(log: any, eventType: 'increase' | 'decrease' | 'liquidate'): TradeRow | null {
  const args = log.args
  if (!args) return null

  const blockNumber = Number(log.blockNumber ?? 0)
  const txHash = log.transactionHash ?? '0x'
  const logIndex = log.logIndex ?? 0

  // Get block timestamp (approximate — use block number as fallback)
  const timestamp = Math.floor(Date.now() / 1000)

  if (eventType === 'increase') {
    return {
      block_number: blockNumber,
      tx_hash: txHash,
      log_index: logIndex,
      event_type: 'increase',
      account: (args.account as string).toLowerCase(),
      index_token: (args.indexToken as string).toLowerCase(),
      is_long: args.isLong ? 1 : 0,
      size_delta: (args.sizeDelta as bigint).toString(),
      collateral_delta: (args.collateralDelta as bigint).toString(),
      price: (args.price as bigint).toString(),
      fee: (args.fee as bigint).toString(),
      timestamp,
    }
  }

  if (eventType === 'decrease') {
    return {
      block_number: blockNumber,
      tx_hash: txHash,
      log_index: logIndex,
      event_type: 'decrease',
      account: (args.account as string).toLowerCase(),
      index_token: (args.indexToken as string).toLowerCase(),
      is_long: args.isLong ? 1 : 0,
      size_delta: (args.sizeDelta as bigint).toString(),
      collateral_delta: (args.collateralDelta as bigint).toString(),
      price: (args.price as bigint).toString(),
      fee: (args.fee as bigint).toString(),
      timestamp,
    }
  }

  if (eventType === 'liquidate') {
    return {
      block_number: blockNumber,
      tx_hash: txHash,
      log_index: logIndex,
      event_type: 'liquidate',
      account: (args.account as string).toLowerCase(),
      index_token: (args.indexToken as string).toLowerCase(),
      is_long: args.isLong ? 1 : 0,
      size_delta: (args.size as bigint).toString(),
      collateral_delta: (args.collateral as bigint).toString(),
      price: (args.markPrice as bigint).toString(),
      fee: (args.liquidationFee as bigint).toString(),
      timestamp,
    }
  }

  return null
}

function processLogs(logs: any[], eventType: 'increase' | 'decrease' | 'liquidate') {
  const trades: TradeRow[] = []
  for (const log of logs) {
    const trade = logToTrade(log, eventType)
    if (trade) {
      trades.push(trade)
      if (onNewTrade) onNewTrade(trade)
    }
  }
  if (trades.length > 0) {
    insertTrades(trades)
    // Update sync state
    const maxBlock = BigInt(Math.max(...trades.map(t => t.block_number)))
    const last = getLastIndexedBlock()
    if (maxBlock > last) setLastIndexedBlock(maxBlock)
    console.log(`[Indexer] +${trades.length} ${eventType} event(s)`)
  }
}

function startPricePoller(addresses: ReturnType<typeof getAddresses>) {
  const tokens = [
    { address: addresses.weth, symbol: 'ETH' },
    { address: addresses.wbtc, symbol: 'BTC' },
  ]

  setInterval(async () => {
    try {
      const blockNumber = Number(await publicClient.getBlockNumber())
      const timestamp = Math.floor(Date.now() / 1000)

      for (const token of tokens) {
        try {
          const price = await publicClient.readContract({
            address: addresses.priceFeed,
            abi: PriceFeedABI,
            functionName: 'getLatestPrice',
            args: [token.address],
          }) as bigint

          insertPrice(token.address.toLowerCase(), price.toString(), blockNumber, timestamp)
        } catch {
          // Feed might not be available
        }
      }
    } catch {
      // RPC error — skip this tick
    }
  }, 5_000)
}
