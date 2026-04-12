/**
 * Aave V3 constants — Arbitrum One deployment addresses and minimal ABIs.
 *
 * Only the functions we actually call are included in the ABI fragments
 * to keep the bundle small.
 *
 * @see https://docs.aave.com/developers/deployed-contracts/v3-mainnet/arbitrum
 */

import type { Address } from 'viem'
import { parseAbi } from 'viem'
import { ARBITRUM_WETH, ARBITRUM_USDC, ARBITRUM_WBTC } from './spotConstants'
import type { Token } from '../types/spot'

// ─── Contract Addresses (Arbitrum One) ──────────────────────────────────────

export const AAVE_POOL: Address =
  '0x794a61358D6845594F94dc1DB02A252b5b4814aD'

export const AAVE_POOL_ADDRESSES_PROVIDER: Address =
  '0xa97684ead0e402dC232d5A977953DF7ECBaB3CDb'

export const AAVE_UI_POOL_DATA_PROVIDER: Address =
  '0x145dE30c929a065582da84Cf96F88460dB9745A7'

export const AAVE_WETH_GATEWAY: Address =
  '0xC09e69E79106861dF5d289dA88349f10e2dc6b5C'

// ─── Minimal ABIs ───────────────────────────────────────────────────────────

/** Pool contract — supply, borrow, repay, withdraw, getUserAccountData */
export const AAVE_POOL_ABI = parseAbi([
  'function supply(address asset, uint256 amount, address onBehalfOf, uint16 referralCode) external',
  'function borrow(address asset, uint256 amount, uint256 interestRateMode, uint16 referralCode, address onBehalfOf) external',
  'function repay(address asset, uint256 amount, uint256 interestRateMode, address onBehalfOf) external returns (uint256)',
  'function withdraw(address asset, uint256 amount, address to) external returns (uint256)',
  'function getUserAccountData(address user) external view returns (uint256 totalCollateralBase, uint256 totalDebtBase, uint256 availableBorrowsBase, uint256 currentLiquidationThreshold, uint256 ltv, uint256 healthFactor)',
])

/** WETH Gateway — for native ETH supply/repay/withdraw */
export const AAVE_WETH_GATEWAY_ABI = parseAbi([
  'function depositETH(address pool, address onBehalfOf, uint16 referralCode) external payable',
  'function withdrawETH(address pool, uint256 amount, address to) external',
  'function repayETH(address pool, uint256 amount, uint256 rateMode, address onBehalfOf) external payable',
])

// ─── Supported Margin Tokens ────────────────────────────────────────────────

/** Tokens supported for Aave V3 margin trading on Arbitrum. */
export const MARGIN_SUPPORTED_TOKENS: Token[] = [
  ARBITRUM_WETH,
  ARBITRUM_USDC,
  ARBITRUM_WBTC,
]

// ─── Constants ──────────────────────────────────────────────────────────────

/** Variable interest rate mode (stable rate deprecated in Aave V3). */
export const VARIABLE_RATE_MODE = 2n

/** Aave uses 8 decimals for USD-denominated values in getUserAccountData. */
export const AAVE_USD_DECIMALS = 8

/** 1 WAD = 1e18 — used for health factor conversion. */
export const WAD = 10n ** 18n

/** 1 RAY = 1e27 — used for interest rate conversion. */
export const RAY = 10n ** 27n

/** Referral code (0 = no referral). */
export const REFERRAL_CODE = 0
