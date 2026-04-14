import { readFileSync, existsSync } from "fs";
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";
import {
  createPublicClient,
  createWalletClient,
  http,
  parseAbi,
  type Address,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { foundry } from "viem/chains";

// --- Environment ---

const RPC_URL = process.env.RPC_URL ?? "http://127.0.0.1:8545";

// Anvil account 0 (deployer/keeper) — NEVER use real keys here
const KEEPER_PK =
  (process.env.KEEPER_PRIVATE_KEY as `0x${string}`) ??
  "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";

// --- Clients ---

export const publicClient = createPublicClient({
  chain: foundry,
  transport: http(RPC_URL, { timeout: 30_000 }),
});

export const keeperAccount = privateKeyToAccount(KEEPER_PK);

export const walletClient = createWalletClient({
  account: keeperAccount,
  chain: foundry,
  transport: http(RPC_URL, { timeout: 30_000 }),
});

// --- Contract Addresses ---
//
// Resolution order (first match wins):
//   1. Per-address env var (e.g. ROUTER_ADDRESS) — used by dev:full to push
//      the currently-deployed addresses into the child process environment
//   2. `src/addresses.json` at the repo root — written by
//      `scripts/export-addresses.mjs` after every fresh `forge script
//      DeployLocal`. Same source the frontend and the server use, so the
//      keeper can never drift from the deployed contracts.
//   3. Hardcoded typechain defaults — last-resort fallback for CI / first
//      run before any deploy has happened.
//
// Read once at module load. If you redeploy the contracts mid-run the
// keeper process needs to be restarted to pick up the new addresses.

export interface Addresses {
  usdc: Address;
  weth: Address;
  wbtc: Address;
  ethOracle: Address;
  btcOracle: Address;
  priceFeed: Address;
  vault: Address;
  positionManager: Address;
  router: Address;
}

const __dirname = dirname(fileURLToPath(import.meta.url));
const ADDRESSES_JSON_PATH = resolve(__dirname, "../../../src/addresses.json");

interface AddressesJsonShape {
  usdc?: string;
  weth?: string;
  wbtc?: string;
  ethOracle?: string;
  btcOracle?: string;
  priceFeed?: string;
  vault?: string;
  positionManager?: string;
  router?: string;
}

function loadAddressesFromJson(): AddressesJsonShape | null {
  try {
    if (!existsSync(ADDRESSES_JSON_PATH)) return null;
    const raw = readFileSync(ADDRESSES_JSON_PATH, "utf-8");
    return JSON.parse(raw) as AddressesJsonShape;
  } catch (err: unknown) {
    console.warn(
      `[keeper config] Failed to read ${ADDRESSES_JSON_PATH}, falling back to typechain defaults:`,
      err instanceof Error ? err.message : String(err),
    );
    return null;
  }
}

const ADDRESSES_FROM_JSON = loadAddressesFromJson();
if (ADDRESSES_FROM_JSON) {
  console.log("[keeper config] Loaded contract addresses from src/addresses.json");
} else {
  console.log("[keeper config] Using hardcoded typechain defaults (no addresses.json found)");
}

function pick(
  envKey: string,
  jsonKey: keyof AddressesJsonShape,
  fallback: string,
): Address {
  return (
    process.env[envKey] ??
    ADDRESSES_FROM_JSON?.[jsonKey] ??
    fallback
  ) as Address;
}

export function getAddresses(): Addresses {
  return {
    usdc: pick("USDC_ADDRESS", "usdc", "0x5FbDB2315678afecb367f032d93F642f64180aa3"),
    weth: pick("WETH_ADDRESS", "weth", "0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512"),
    wbtc: pick("WBTC_ADDRESS", "wbtc", "0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0"),
    ethOracle: pick("ETH_ORACLE_ADDRESS", "ethOracle", "0xCf7Ed3AccA5a467e9e704C703E8D87F634fB0Fc9"),
    btcOracle: pick("BTC_ORACLE_ADDRESS", "btcOracle", "0xDc64a140Aa3E981100a9becA4E685f962f0cF6C9"),
    priceFeed: pick("PRICE_FEED_ADDRESS", "priceFeed", "0x2279B7A0a67DB372996a5FaB50D91eAA73d2eBe6"),
    vault: pick("VAULT_ADDRESS", "vault", "0x0DCd1Bf9A1b36cE34237eEaFef220932846BCD82"),
    positionManager: pick(
      "POSITION_MANAGER_ADDRESS",
      "positionManager",
      "0x0B306BF915C4d645ff596e518fAf3F9669b97016",
    ),
    router: pick("ROUTER_ADDRESS", "router", "0x3Aa5ebB10DC797CAC828524e59A333d0A371443c"),
  };
}

// --- ABIs ---

export const PositionManagerABI = parseAbi([
  "function getPosition(address account, address indexToken, bool isLong) external view returns (uint256 size, uint256 collateral, uint256 averagePrice, uint256 entryFundingRate, uint256 lastUpdatedTime)",
  "function getPositionKey(address account, address indexToken, bool isLong) external pure returns (bytes32)",
  "function liquidatePosition(address account, address indexToken, bool isLong, address feeReceiver) external",
  "function marginFeeBps() external view returns (uint256)",
  "event IncreasePosition(address indexed account, address indexed indexToken, bool isLong, uint256 sizeDelta, uint256 collateralDelta, uint256 price, uint256 fee)",
  "event DecreasePosition(address indexed account, address indexed indexToken, bool isLong, uint256 sizeDelta, uint256 collateralDelta, uint256 price, uint256 fee, uint256 usdcOut)",
  "event LiquidatePosition(address indexed account, address indexed indexToken, bool isLong, uint256 size, uint256 collateral, uint256 markPrice, address feeReceiver, uint256 liquidationFee)",
]);

export const PriceFeedABI = parseAbi([
  "function getPrice(address token, bool maximise) external view returns (uint256 price)",
  "function getLatestPrice(address token) external view returns (uint256 price)",
]);

export const MockOracleABI = parseAbi([
  "function setLatestAnswer(int256 answer) external",
  "function latestRoundData() external view returns (uint80, int256, uint256, uint256, uint80)",
]);

// --- Constants (mirrored from Solidity) ---

export const PRICE_PRECISION = 10n ** 30n;
export const BASIS_POINTS_DIVISOR = 10_000n;
export const LIQUIDATION_FEE_USD = 5n * PRICE_PRECISION;
export const LIQUIDATION_THRESHOLD_BPS = 100n; // 1%

// --- Helpers ---

export function formatUsd(amount: bigint): string {
  const usdcAmount = amount / (10n ** 24n); // 30 dec → 6 dec
  const dollars = Number(usdcAmount) / 1e6;
  return `$${dollars.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
