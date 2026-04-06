/**
 * Liquidation Keeper Bot
 *
 * Discovers open positions by scanning IncreasePosition/DecreasePosition/LiquidatePosition events,
 * maintains an in-memory set of open positions, and checks each against current price
 * for liquidatability on every tick.
 *
 * Usage: tsx src/liquidator.ts
 */

import { type Address, type Log, getAddress, keccak256, encodePacked } from "viem";
import {
  publicClient,
  walletClient,
  keeperAccount,
  getAddresses,
  PositionManagerABI,
  PriceFeedABI,
  PRICE_PRECISION,
  BASIS_POINTS_DIVISOR,
  LIQUIDATION_FEE_USD,
  LIQUIDATION_THRESHOLD_BPS,
  formatUsd,
  sleep,
} from "./config.js";

// --- Types ---

interface TrackedPosition {
  account: Address;
  indexToken: Address;
  isLong: boolean;
  key: string; // for dedup
}

interface OnChainPosition {
  size: bigint;
  collateral: bigint;
  averagePrice: bigint;
  entryFundingRate: bigint;
  lastUpdatedTime: bigint;
}

function toOnChainPosition(raw: readonly [bigint, bigint, bigint, bigint, bigint]): OnChainPosition {
  return { size: raw[0], collateral: raw[1], averagePrice: raw[2], entryFundingRate: raw[3], lastUpdatedTime: raw[4] };
}

// --- State ---

const openPositions = new Map<string, TrackedPosition>();
let lastScannedBlock = 0n;

const POLL_INTERVAL_MS = 2_000; // 2 seconds
const EVENT_LOOKBACK_BLOCKS = 10_000n;

// --- Position key (mirrors Solidity) ---

function positionKey(account: Address, indexToken: Address, isLong: boolean): string {
  return keccak256(
    encodePacked(["address", "address", "bool"], [account, indexToken, isLong])
  );
}

// --- Scan events to discover positions ---

async function scanEvents(addresses: ReturnType<typeof getAddresses>): Promise<void> {
  const currentBlock = await publicClient.getBlockNumber();
  const fromBlock = lastScannedBlock > 0n ? lastScannedBlock + 1n : currentBlock > EVENT_LOOKBACK_BLOCKS ? currentBlock - EVENT_LOOKBACK_BLOCKS : 0n;

  if (fromBlock > currentBlock) return;

  // Fetch IncreasePosition events (new/enlarged positions)
  const increaseLogs = await publicClient.getContractEvents({
    address: addresses.positionManager,
    abi: PositionManagerABI,
    eventName: "IncreasePosition",
    fromBlock,
    toBlock: currentBlock,
  });

  for (const log of increaseLogs) {
    const args = (log as unknown as { args: { account: Address; indexToken: Address; isLong: boolean } }).args;
    const { account, indexToken, isLong } = args;
    if (!account || !indexToken || isLong === undefined) continue;

    const key = positionKey(account, indexToken, isLong);
    if (!openPositions.has(key)) {
      openPositions.set(key, {
        account: getAddress(account),
        indexToken: getAddress(indexToken),
        isLong,
        key,
      });
    }
  }

  // Remove positions that were fully closed or liquidated
  const decreaseLogs = await publicClient.getContractEvents({
    address: addresses.positionManager,
    abi: PositionManagerABI,
    eventName: "DecreasePosition",
    fromBlock,
    toBlock: currentBlock,
  });

  const liquidateLogs = await publicClient.getContractEvents({
    address: addresses.positionManager,
    abi: PositionManagerABI,
    eventName: "LiquidatePosition",
    fromBlock,
    toBlock: currentBlock,
  });

  // For decrease events, check if the position is now closed (size = 0)
  for (const log of decreaseLogs) {
    const args = (log as unknown as { args: { account: Address; indexToken: Address; isLong: boolean } }).args;
    const { account, indexToken, isLong } = args;
    if (!account || !indexToken || isLong === undefined) continue;

    const key = positionKey(account, indexToken, isLong);
    // We'll verify on-chain in the check loop — just mark for recheck
  }

  // Liquidated positions are definitely closed
  for (const log of liquidateLogs) {
    const args = (log as unknown as { args: { account: Address; indexToken: Address; isLong: boolean } }).args;
    const { account, indexToken, isLong } = args;
    if (!account || !indexToken || isLong === undefined) continue;

    const key = positionKey(account, indexToken, isLong);
    openPositions.delete(key);
  }

  lastScannedBlock = currentBlock;
}

// --- Check if a position is liquidatable (off-chain simulation) ---

function isLiquidatable(
  position: OnChainPosition,
  markPrice: bigint,
  isLong: boolean,
  marginFeeBps: bigint
): boolean {
  if (position.size === 0n) return false;

  // Calculate PnL
  let hasProfit: boolean;
  let delta: bigint;

  if (isLong) {
    hasProfit = markPrice > position.averagePrice;
    const priceDelta = hasProfit
      ? markPrice - position.averagePrice
      : position.averagePrice - markPrice;
    delta = (position.size * priceDelta) / position.averagePrice;
  } else {
    hasProfit = position.averagePrice > markPrice;
    const priceDelta = hasProfit
      ? position.averagePrice - markPrice
      : markPrice - position.averagePrice;
    delta = (position.size * priceDelta) / position.averagePrice;
  }

  // Remaining collateral
  let remainingCollateral = position.collateral;

  if (!hasProfit) {
    if (delta >= remainingCollateral) return true;
    remainingCollateral -= delta;
  }

  // Fees
  const marginFee = (position.size * marginFeeBps) / BASIS_POINTS_DIVISOR;
  const totalFees = marginFee + LIQUIDATION_FEE_USD;
  if (totalFees >= remainingCollateral) return true;
  remainingCollateral -= totalFees;

  // Min margin check
  const minMargin = (position.size * LIQUIDATION_THRESHOLD_BPS) / BASIS_POINTS_DIVISOR;
  return remainingCollateral < minMargin;
}

// --- Execute liquidation ---

async function tryLiquidate(
  tracked: TrackedPosition,
  addresses: ReturnType<typeof getAddresses>
): Promise<boolean> {
  try {
    const txHash = await walletClient.writeContract({
      address: addresses.positionManager,
      abi: PositionManagerABI,
      functionName: "liquidatePosition",
      args: [tracked.account, tracked.indexToken, tracked.isLong, keeperAccount.address],
    });

    const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
    const gasUsed = receipt.gasUsed;

    console.log(
      `  [LIQUIDATED] tx=${txHash.slice(0, 10)}... gas=${gasUsed} ` +
      `account=${tracked.account.slice(0, 10)}... ` +
      `token=${tracked.indexToken.slice(0, 10)}... ` +
      `${tracked.isLong ? "LONG" : "SHORT"}`
    );

    openPositions.delete(tracked.key);
    return true;
  } catch (err: unknown) {
    // Expected: PM__NotLiquidatable — position was healthy, off-chain check was wrong
    // This can happen due to price changes between check and execution
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes("NotLiquidatable")) {
      return false; // Expected, not an error
    }
    console.error(`  [ERROR] liquidation failed: ${message.slice(0, 100)}`);
    return false;
  }
}

// --- Main loop ---

async function main(): Promise<void> {
  const addresses = getAddresses();

  console.log("=== Liquidation Keeper Bot ===");
  console.log(`RPC: ${publicClient.transport.url}`);
  console.log(`Keeper: ${keeperAccount.address}`);
  console.log(`PositionManager: ${addresses.positionManager}`);
  console.log(`Poll interval: ${POLL_INTERVAL_MS}ms`);
  console.log("");

  // Get margin fee once (it rarely changes)
  const marginFeeBps = (await publicClient.readContract({
    address: addresses.positionManager,
    abi: PositionManagerABI,
    functionName: "marginFeeBps",
  })) as bigint;

  const indexTokens = [addresses.weth, addresses.wbtc];

  while (true) {
    try {
      // 1. Scan for new/closed positions
      await scanEvents(addresses);

      // 2. Clean stale positions (size == 0 on-chain)
      const toRemove: string[] = [];
      for (const [key, tracked] of openPositions) {
        const rawPos = (await publicClient.readContract({
          address: addresses.positionManager,
          abi: PositionManagerABI,
          functionName: "getPosition",
          args: [tracked.account, tracked.indexToken, tracked.isLong],
        })) as readonly [bigint, bigint, bigint, bigint, bigint];
        const pos = toOnChainPosition(rawPos);

        if (pos.size === 0n) {
          toRemove.push(key);
        }
      }
      for (const key of toRemove) {
        openPositions.delete(key);
      }

      if (openPositions.size === 0) {
        process.stdout.write(`\r[${new Date().toISOString()}] No open positions. Waiting...`);
        await sleep(POLL_INTERVAL_MS);
        continue;
      }

      // 3. Get current prices
      const prices = new Map<string, bigint>();
      for (const token of indexTokens) {
        try {
          const price = await publicClient.readContract({
            address: addresses.priceFeed,
            abi: PriceFeedABI,
            functionName: "getPrice",
            args: [token, false], // minimize for liquidation check (worst case for trader)
          });
          prices.set(token.toLowerCase(), price);
        } catch {
          // Token might not have a feed
        }
      }

      // 4. Check each position
      let liquidated = 0;
      for (const [, tracked] of openPositions) {
        const markPrice = prices.get(tracked.indexToken.toLowerCase());
        if (!markPrice) continue;

        const rawPos2 = (await publicClient.readContract({
          address: addresses.positionManager,
          abi: PositionManagerABI,
          functionName: "getPosition",
          args: [tracked.account, tracked.indexToken, tracked.isLong],
        })) as readonly [bigint, bigint, bigint, bigint, bigint];
        const pos = toOnChainPosition(rawPos2);

        if (pos.size === 0n) continue;

        if (isLiquidatable(pos, markPrice, tracked.isLong, marginFeeBps)) {
          console.log(
            `\n[${new Date().toISOString()}] Position liquidatable:` +
            ` account=${tracked.account.slice(0, 10)}...` +
            ` ${tracked.isLong ? "LONG" : "SHORT"}` +
            ` size=${formatUsd(pos.size)}` +
            ` collateral=${formatUsd(pos.collateral)}` +
            ` mark=${formatUsd(markPrice)}`
          );

          const success = await tryLiquidate(tracked, addresses);
          if (success) liquidated++;
        }
      }

      const status = `[${new Date().toISOString()}] Tracking ${openPositions.size} positions. Liquidated this tick: ${liquidated}`;
      process.stdout.write(`\r${status}`);
    } catch (err: unknown) {
      console.error(`\n[ERROR] ${err instanceof Error ? err.message : String(err)}`);
    }

    await sleep(POLL_INTERVAL_MS);
  }
}

main().catch(console.error);
