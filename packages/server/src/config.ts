/**
 * Server configuration — shared viem client and contract references.
 */

import {
  createPublicClient,
  http,
  parseAbi,
  type Address,
} from 'viem'
import { foundry } from 'viem/chains'

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
  transport: http(RPC_URL),
})

// Contract addresses (from Anvil deploy — update after each fresh deploy)
export interface Addresses {
  usdc: Address
  weth: Address
  wbtc: Address
  ethOracle: Address
  btcOracle: Address
  priceFeed: Address
  vault: Address
  positionManager: Address
  router: Address
}

export function getAddresses(): Addresses {
  return {
    usdc: (process.env.USDC_ADDRESS ?? '0x5FbDB2315678afecb367f032d93F642f64180aa3') as Address,
    weth: (process.env.WETH_ADDRESS ?? '0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512') as Address,
    wbtc: (process.env.WBTC_ADDRESS ?? '0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0') as Address,
    ethOracle: (process.env.ETH_ORACLE_ADDRESS ?? '0xCf7Ed3AccA5a467e9e704C703E8D87F634fB0Fc9') as Address,
    btcOracle: (process.env.BTC_ORACLE_ADDRESS ?? '0xDc64a140Aa3E981100a9becA4E685f962f0cF6C9') as Address,
    priceFeed: (process.env.PRICE_FEED_ADDRESS ?? '0x2279B7A0a67DB372996a5FaB50D91eAA73d2eBe6') as Address,
    vault: (process.env.VAULT_ADDRESS ?? '0x0DCd1Bf9A1b36cE34237eEaFef220932846BCD82') as Address,
    positionManager: (process.env.POSITION_MANAGER_ADDRESS ?? '0x0B306BF915C4d645ff596e518fAf3F9669b97016') as Address,
    router: (process.env.ROUTER_ADDRESS ?? '0x3Aa5ebB10DC797CAC828524e59A333d0A371443c') as Address,
  }
}

// ABIs
export const PositionManagerABI = parseAbi([
  'event IncreasePosition(address indexed account, address indexed indexToken, bool isLong, uint256 sizeDelta, uint256 collateralDelta, uint256 price, uint256 fee)',
  'event DecreasePosition(address indexed account, address indexed indexToken, bool isLong, uint256 sizeDelta, uint256 collateralDelta, uint256 price, uint256 fee, uint256 usdcOut)',
  'event LiquidatePosition(address indexed account, address indexed indexToken, bool isLong, uint256 size, uint256 collateral, uint256 markPrice, address feeReceiver, uint256 liquidationFee)',
  'function getPosition(address account, address indexToken, bool isLong) external view returns (uint256 size, uint256 collateral, uint256 averagePrice, uint256 entryFundingRate, uint256 lastUpdatedTime)',
])

export const PriceFeedABI = parseAbi([
  'function getLatestPrice(address token) external view returns (uint256 price)',
])

export const VaultABI = parseAbi([
  'event Deposit(address indexed account, uint256 usdcAmount, uint256 plpAmount)',
  'event Withdraw(address indexed account, uint256 plpAmount, uint256 usdcAmount)',
])

// Token label mapping
export const TOKEN_SYMBOLS: Record<string, string> = {}
export function initTokenSymbols() {
  const addr = getAddresses()
  TOKEN_SYMBOLS[addr.weth.toLowerCase()] = 'ETH'
  TOKEN_SYMBOLS[addr.wbtc.toLowerCase()] = 'BTC'
}

export function tokenSymbol(address: string): string {
  return TOKEN_SYMBOLS[address.toLowerCase()] ?? address.slice(0, 10)
}

export const PRICE_PRECISION = 10n ** 30n

export function formatUsd(amount: bigint): number {
  const usdc = amount / (PRICE_PRECISION / 10n ** 6n)
  return Number(usdc) / 1e6
}
