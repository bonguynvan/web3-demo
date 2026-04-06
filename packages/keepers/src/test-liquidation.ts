/**
 * Integration test: Deploy → Open 10x long → Crash price → Run liquidator tick
 *
 * Usage: tsx src/test-liquidation.ts
 * Requires: anvil running with fresh state, then `deploy:local`
 */

import {
  createPublicClient,
  createWalletClient,
  http,
  parseAbi,
  type Address,
  encodePacked,
  keccak256,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { foundry } from "viem/chains";

// Anvil accounts
const DEPLOYER_PK = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80" as const;
const TRADER_PK = "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d" as const;

const RPC = "http://127.0.0.1:8545";

const publicClient = createPublicClient({ chain: foundry, transport: http(RPC) });
const deployerWallet = createWalletClient({ account: privateKeyToAccount(DEPLOYER_PK), chain: foundry, transport: http(RPC) });
const traderWallet = createWalletClient({ account: privateKeyToAccount(TRADER_PK), chain: foundry, transport: http(RPC) });

const deployer = privateKeyToAccount(DEPLOYER_PK).address;
const trader = privateKeyToAccount(TRADER_PK).address;

// ABIs
const MockERC20ABI = parseAbi([
  "constructor(string name, string symbol, uint8 decimals)",
  "function mint(address to, uint256 amount) external",
  "function approve(address spender, uint256 amount) external returns (bool)",
  "function balanceOf(address account) external view returns (uint256)",
]);

const MockOracleABI = parseAbi([
  "function setLatestAnswer(int256 answer) external",
]);

const PLPABI = parseAbi([
  "function setMinter(address newMinter) external",
]);

const PriceFeedABI = parseAbi([
  "function setFeed(address token, address feed) external",
  "function setSpreadBasisPoints(address token, uint256 spreadBps) external",
  "function getLatestPrice(address token) external view returns (uint256)",
]);

const VaultABI = parseAbi([
  "function deposit(uint256 usdcAmount) external returns (uint256)",
  "function setPositionManager(address pm) external",
  "function getPoolAmount() external view returns (uint256)",
]);

const PMABI = parseAbi([
  "function setHandler(address handler, bool active) external",
  "function setAllowedToken(address token, bool allowed) external",
  "function getPosition(address account, address indexToken, bool isLong) external view returns (uint256 size, uint256 collateral, uint256 averagePrice, uint256 entryFundingRate, uint256 lastUpdatedTime)",
  "function liquidatePosition(address account, address indexToken, bool isLong, address feeReceiver) external",
]);

const RouterABI = parseAbi([
  "function increasePosition(address indexToken, uint256 collateralAmount, uint256 sizeDelta, bool isLong, uint256 acceptablePrice) external",
]);

const PP = 10n ** 30n;

async function deploy(bytecode: `0x${string}`, abi: readonly unknown[], args: unknown[]): Promise<Address> {
  const hash = await deployerWallet.deployContract({
    abi: abi as any,
    bytecode,
    args: args as any,
  });
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  return receipt.contractAddress!;
}

async function main() {
  console.log("=== Liquidation Integration Test ===\n");

  // We'll use forge artifacts to get bytecodes
  // Instead, let's call the already-deployed contracts from DeployLocal
  // But addresses differ each time... Let's do a self-contained deploy via forge script
  // Actually, simplest: use cast to interact with already-deployed contracts

  // Read deployed addresses from the latest broadcast
  const { readFileSync, readdirSync } = await import("fs");
  const { join } = await import("path");

  const broadcastDir = join(process.cwd(), "..", "contracts", "broadcast", "DeployLocal.s.sol", "31337");
  const runFile = join(broadcastDir, "run-latest.json");
  const run = JSON.parse(readFileSync(runFile, "utf-8"));

  const contractAddresses: Record<string, Address> = {};
  const nameCount: Record<string, number> = {};
  for (const tx of run.transactions) {
    if (tx.transactionType === "CREATE" && tx.contractName) {
      const name = tx.contractName;
      nameCount[name] = (nameCount[name] ?? 0) + 1;
      // MockERC20 appears 3x: USDC(1), WETH(2), WBTC(3)
      // MockChainlinkAggregator appears 2x: ETH(1), BTC(2)
      if (name === "MockERC20") {
        if (nameCount[name] === 1) contractAddresses["USDC"] = tx.contractAddress;
        if (nameCount[name] === 2) contractAddresses["WETH"] = tx.contractAddress;
        if (nameCount[name] === 3) contractAddresses["WBTC"] = tx.contractAddress;
      } else if (name === "MockChainlinkAggregator") {
        if (nameCount[name] === 1) contractAddresses["ETH_ORACLE"] = tx.contractAddress;
        if (nameCount[name] === 2) contractAddresses["BTC_ORACLE"] = tx.contractAddress;
      } else {
        contractAddresses[name] = tx.contractAddress;
      }
    }
  }

  const usdc = contractAddresses["USDC"] as Address;
  const weth = contractAddresses["WETH"] as Address;
  const ethOracle = contractAddresses["ETH_ORACLE"] as Address;
  const vault = contractAddresses["Vault"] as Address;
  const pm = contractAddresses["PositionManager"] as Address;
  const router = contractAddresses["Router"] as Address;
  const priceFeed = contractAddresses["PriceFeed"] as Address;

  console.log("Addresses loaded from broadcast:");
  console.log(`  USDC: ${usdc}`);
  console.log(`  WETH: ${weth}`);
  console.log(`  Vault: ${vault}`);
  console.log(`  PM: ${pm}`);
  console.log(`  Router: ${router}`);
  console.log(`  ETH Oracle: ${ethOracle}`);

  // Step 1: Trader deposits LP to provide liquidity
  console.log("\n--- Step 1: Seed liquidity ($50k) ---");
  await traderWallet.writeContract({ address: usdc, abi: MockERC20ABI, functionName: "approve", args: [vault, 2n ** 256n - 1n] });
  await traderWallet.writeContract({ address: vault, abi: VaultABI, functionName: "deposit", args: [50_000_000000n] });

  const pool = await publicClient.readContract({ address: vault, abi: VaultABI, functionName: "getPoolAmount" });
  console.log(`  Pool: $${Number(pool) / 1e6}`);

  // Step 2: Trader opens a 10x long
  console.log("\n--- Step 2: Open 10x long ETH ($1k collateral, $10k size) ---");
  await traderWallet.writeContract({ address: usdc, abi: MockERC20ABI, functionName: "approve", args: [router, 2n ** 256n - 1n] });

  const ethPrice = await publicClient.readContract({ address: priceFeed, abi: PriceFeedABI, functionName: "getLatestPrice", args: [weth] }) as bigint;
  console.log(`  ETH price: $${Number(ethPrice / (PP / 1000000n)) / 1e6}`);

  await traderWallet.writeContract({
    address: router,
    abi: RouterABI,
    functionName: "increasePosition",
    args: [weth, 1_000_000000n, 10_000n * PP, true, ethPrice + ethPrice / 50n],
  });

  const pos1 = await publicClient.readContract({ address: pm, abi: PMABI, functionName: "getPosition", args: [trader, weth, true] }) as readonly [bigint, bigint, bigint, bigint, bigint];
  console.log(`  Position size: $${Number(pos1[0] / (PP / 1000000n)) / 1e6}`);
  console.log(`  Collateral: $${Number(pos1[1] / (PP / 1000000n)) / 1e6}`);

  // Step 3: Crash ETH price by ~9.5% (within 10% deviation limit, step gradually)
  console.log("\n--- Step 3: Crash ETH price ---");
  // $3,500 → $3,300 → $3,170
  await deployerWallet.writeContract({ address: ethOracle, abi: MockOracleABI, functionName: "setLatestAnswer", args: [3300_00000000n] });
  console.log("  ETH → $3,300");
  await deployerWallet.writeContract({ address: ethOracle, abi: MockOracleABI, functionName: "setLatestAnswer", args: [3170_00000000n] });
  console.log("  ETH → $3,170 (−9.4%)");

  // Step 4: Check position — should be liquidatable
  console.log("\n--- Step 4: Attempt liquidation ---");
  try {
    const txHash = await deployerWallet.writeContract({
      address: pm,
      abi: PMABI,
      functionName: "liquidatePosition",
      args: [trader, weth, true, deployer],
    });
    const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
    console.log(`  LIQUIDATED! tx=${txHash.slice(0, 16)}... gas=${receipt.gasUsed}`);

    // Verify position is gone
    const pos2 = await publicClient.readContract({ address: pm, abi: PMABI, functionName: "getPosition", args: [trader, weth, true] }) as readonly [bigint, bigint, bigint, bigint, bigint];
    console.log(`  Position size after: ${pos2[0] === 0n ? "0 (closed)" : pos2[0]}`);

    // Check keeper received liq fee
    const keeperBal = await publicClient.readContract({ address: usdc, abi: MockERC20ABI, functionName: "balanceOf", args: [deployer] });
    console.log(`  Keeper USDC balance: $${Number(keeperBal) / 1e6}`);
  } catch (err: unknown) {
    console.error(`  FAILED: ${err instanceof Error ? err.message.slice(0, 200) : String(err)}`);
  }

  console.log("\n=== TEST COMPLETE ===");
}

main().catch(console.error);
