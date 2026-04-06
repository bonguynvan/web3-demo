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
  transport: http(RPC_URL),
});

export const keeperAccount = privateKeyToAccount(KEEPER_PK);

export const walletClient = createWalletClient({
  account: keeperAccount,
  chain: foundry,
  transport: http(RPC_URL),
});

// --- Contract Addresses (from DeployLocal, fresh Anvil) ---
// These are deterministic when deploying to a fresh Anvil with default account 0.
// Update after running `deploy:local` if addresses differ.

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

// Load from environment or use defaults
export function getAddresses(): Addresses {
  return {
    usdc: (process.env.USDC_ADDRESS ?? "0x5FbDB2315678afecb367f032d93F642f64180aa3") as Address,
    weth: (process.env.WETH_ADDRESS ?? "0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512") as Address,
    wbtc: (process.env.WBTC_ADDRESS ?? "0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0") as Address,
    ethOracle: (process.env.ETH_ORACLE_ADDRESS ?? "0xCf7Ed3AccA5a467e9e704C703E8D87F634fB0Fc9") as Address,
    btcOracle: (process.env.BTC_ORACLE_ADDRESS ?? "0xDc64a140Aa3E981100a9becA4E685f962f0cF6C9") as Address,
    priceFeed: (process.env.PRICE_FEED_ADDRESS ?? "0x2279B7A0a67DB372996a5FaB50D91eAA73d2eBe6") as Address,
    vault: (process.env.VAULT_ADDRESS ?? "0x0DCd1Bf9A1b36cE34237eEaFef220932846BCD82") as Address,
    positionManager: (process.env.POSITION_MANAGER_ADDRESS ?? "0x0B306BF915C4d645ff596e518fAf3F9669b97016") as Address,
    router: (process.env.ROUTER_ADDRESS ?? "0x3Aa5ebB10DC797CAC828524e59A333d0A371443c") as Address,
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
