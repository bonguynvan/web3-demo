/**
 * Oracle Price Updater Bot (Local Dev Only)
 *
 * Simulates realistic price movements on MockChainlinkAggregator oracles.
 * Uses geometric Brownian motion with configurable volatility.
 *
 * Usage: tsx src/price-updater.ts
 */

import {
  publicClient,
  walletClient,
  keeperAccount,
  getAddresses,
  MockOracleABI,
  sleep,
} from "./config.js";

// --- Config ---

interface TokenConfig {
  name: string;
  oracleAddress: `0x${string}`;
  basePrice: number; // USD, no decimals
  volatility: number; // annualized vol (e.g. 0.6 = 60%)
}

const UPDATE_INTERVAL_MS = 3_000; // 3 seconds
const CHAINLINK_DECIMALS = 8;

// --- Price simulation (geometric Brownian motion) ---

function simulatePriceStep(currentPrice: number, volatility: number, dtSeconds: number): number {
  const dtYears = dtSeconds / (365.25 * 24 * 3600);
  const drift = 0; // no drift for local simulation
  const diffusion = volatility * Math.sqrt(dtYears);
  const randomShock = gaussianRandom();

  // GBM: dS/S = mu*dt + sigma*dW
  const logReturn = drift * dtYears + diffusion * randomShock;
  return currentPrice * Math.exp(logReturn);
}

function gaussianRandom(): number {
  // Box-Muller transform
  let u = 0;
  let v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
}

function priceToChainlink(price: number): bigint {
  return BigInt(Math.round(price * 10 ** CHAINLINK_DECIMALS));
}

// --- Main loop ---

async function main(): Promise<void> {
  const addresses = getAddresses();

  const tokens: TokenConfig[] = [
    {
      name: "ETH",
      oracleAddress: addresses.ethOracle,
      basePrice: 3500,
      volatility: 0.65, // ~65% annualized (crypto-typical)
    },
    {
      name: "BTC",
      oracleAddress: addresses.btcOracle,
      basePrice: 65000,
      volatility: 0.55,
    },
  ];

  console.log("=== Oracle Price Updater (Local Dev) ===");
  console.log(`RPC: ${publicClient.transport.url}`);
  console.log(`Updater: ${keeperAccount.address}`);
  console.log(`Update interval: ${UPDATE_INTERVAL_MS}ms`);
  console.log("");

  // Read current prices from oracles
  const currentPrices = new Map<string, number>();
  for (const token of tokens) {
    try {
      const result = await publicClient.readContract({
        address: token.oracleAddress,
        abi: MockOracleABI,
        functionName: "latestRoundData",
      });
      const chainlinkPrice = result[1]; // int256 answer
      const price = Number(chainlinkPrice) / 10 ** CHAINLINK_DECIMALS;
      currentPrices.set(token.name, price);
      console.log(`${token.name} current price: $${price.toLocaleString()}`);
    } catch {
      currentPrices.set(token.name, token.basePrice);
      console.log(`${token.name} using base price: $${token.basePrice.toLocaleString()}`);
    }
  }

  console.log("\nStarting price updates...\n");

  while (true) {
    const updates: string[] = [];

    for (const token of tokens) {
      const current = currentPrices.get(token.name) ?? token.basePrice;
      const next = simulatePriceStep(current, token.volatility, UPDATE_INTERVAL_MS / 1000);

      // Clamp to prevent extreme moves (max 5% per tick for safety)
      const maxMove = current * 0.05;
      const clamped = Math.max(current - maxMove, Math.min(current + maxMove, next));

      const chainlinkValue = priceToChainlink(clamped);

      try {
        const txHash = await walletClient.writeContract({
          address: token.oracleAddress,
          abi: MockOracleABI,
          functionName: "setLatestAnswer",
          args: [chainlinkValue],
        });

        currentPrices.set(token.name, clamped);

        const change = ((clamped - current) / current) * 100;
        const arrow = change >= 0 ? "▲" : "▼";
        updates.push(
          `${token.name}: $${clamped.toLocaleString("en-US", { maximumFractionDigits: 2 })} ${arrow}${Math.abs(change).toFixed(3)}%`
        );
      } catch (err: unknown) {
        console.error(`  [ERROR] ${token.name} update failed: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    if (updates.length > 0) {
      process.stdout.write(`\r[${new Date().toISOString()}] ${updates.join(" | ")}          `);
    }

    await sleep(UPDATE_INTERVAL_MS);
  }
}

main().catch(console.error);
