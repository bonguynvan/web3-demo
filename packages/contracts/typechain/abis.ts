// Typed ABI exports for viem/wagmi frontend integration
// These are human-readable ABIs (viem format) for the core contracts.
// For full ABIs, use the JSON files in abi/ directory.

export const VaultABI = [
  "function deposit(uint256 usdcAmount) external returns (uint256 plpAmount)",
  "function withdraw(uint256 plpAmount) external returns (uint256 usdcAmount)",
  "function getPoolAmount() external view returns (uint256)",
  "function getReservedAmount() external view returns (uint256)",
  "function getAvailableLiquidity() external view returns (uint256)",
  "function getAum() external view returns (uint256)",
  "function poolAmount() external view returns (uint256)",
  "function reservedAmount() external view returns (uint256)",
  "event Deposit(address indexed account, uint256 usdcAmount, uint256 plpAmount)",
  "event Withdraw(address indexed account, uint256 plpAmount, uint256 usdcAmount)",
  "event PoolAmountUpdated(uint256 poolAmount)",
] as const;

export const RouterABI = [
  "function increasePosition(address indexToken, uint256 collateralAmount, uint256 sizeDelta, bool isLong, uint256 acceptablePrice) external",
  "function decreasePosition(address indexToken, uint256 collateralDelta, uint256 sizeDelta, bool isLong, uint256 acceptablePrice, address receiver) external",
  "function depositToVault(uint256 usdcAmount) external returns (uint256 plpAmount)",
  "function withdrawFromVault(uint256 plpAmount) external returns (uint256 usdcAmount)",
] as const;

export const PositionManagerABI = [
  "function getPosition(address account, address indexToken, bool isLong) external view returns (tuple(uint256 size, uint256 collateral, uint256 averagePrice, uint256 entryFundingRate, uint256 lastUpdatedTime))",
  "function getPositionKey(address account, address indexToken, bool isLong) external pure returns (bytes32)",
  "function marginFeeBps() external view returns (uint256)",
  "function feeReserves() external view returns (uint256)",
  "event IncreasePosition(address indexed account, address indexed indexToken, bool isLong, uint256 sizeDelta, uint256 collateralDelta, uint256 price, uint256 fee)",
  "event DecreasePosition(address indexed account, address indexed indexToken, bool isLong, uint256 sizeDelta, uint256 collateralDelta, uint256 price, uint256 fee, uint256 usdcOut)",
  "event LiquidatePosition(address indexed account, address indexed indexToken, bool isLong, uint256 size, uint256 collateral, uint256 markPrice, address feeReceiver, uint256 liquidationFee)",
] as const;

export const PriceFeedABI = [
  "function getPrice(address token, bool maximise) external view returns (uint256 price)",
  "function getLatestPrice(address token) external view returns (uint256 price)",
] as const;

export const PLPABI = [
  "function totalSupply() external view returns (uint256)",
  "function balanceOf(address account) external view returns (uint256)",
  "function approve(address spender, uint256 amount) external returns (bool)",
  "function transfer(address to, uint256 amount) external returns (bool)",
  "function allowance(address owner, address spender) external view returns (uint256)",
] as const;

export const ERC20ABI = [
  "function totalSupply() external view returns (uint256)",
  "function balanceOf(address account) external view returns (uint256)",
  "function approve(address spender, uint256 amount) external returns (bool)",
  "function transfer(address to, uint256 amount) external returns (bool)",
  "function transferFrom(address from, address to, uint256 amount) external returns (bool)",
  "function allowance(address owner, address spender) external view returns (uint256)",
  "function decimals() external view returns (uint8)",
  "function symbol() external view returns (string)",
  "function name() external view returns (string)",
  "event Transfer(address indexed from, address indexed to, uint256 value)",
  "event Approval(address indexed owner, address indexed spender, uint256 value)",
] as const;
