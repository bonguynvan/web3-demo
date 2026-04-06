// Public API for frontend integration
// Usage: import { RouterABI, getAddresses, PRICE_PRECISION } from "@perp-dex/contracts/typechain";

export {
  VaultABI,
  RouterABI,
  PositionManagerABI,
  PriceFeedABI,
  PLPABI,
  ERC20ABI,
} from "./abis";

export {
  type ContractAddresses,
  LOCALHOST_ADDRESSES,
  ADDRESSES,
  getAddresses,
} from "./addresses";

export {
  PRICE_PRECISION,
  USDC_DECIMALS,
  USDC_PRECISION,
  CHAINLINK_DECIMALS,
  BASIS_POINTS_DIVISOR,
  MAX_LEVERAGE,
  MIN_LEVERAGE,
  DEFAULT_MARGIN_FEE_BPS,
  LIQUIDATION_FEE_USD,
  MAX_UTILIZATION_BPS,
  usdcToInternal,
  internalToUsdc,
  usd,
  formatUsd,
  getLeverageBps,
  formatLeverage,
} from "./constants";
