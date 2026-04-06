/**
 * Contract configuration for wagmi hooks.
 *
 * Combines ABIs from typechain with deployed addresses.
 * Usage: const { data } = useReadContract({ ...contracts.vault, functionName: 'getPoolAmount' })
 */

import { parseAbi, type Address } from 'viem'
import {
  getAddresses,
  type ContractAddresses,
  VaultABI,
  RouterABI,
  PositionManagerABI,
  PriceFeedABI,
  ERC20ABI,
} from '../../packages/contracts/typechain'

// Market definitions — maps UI symbol to on-chain indexToken address
export interface MarketConfig {
  symbol: string
  baseAsset: string
  indexToken: Address
}

export function getMarkets(addresses: ContractAddresses): MarketConfig[] {
  return [
    { symbol: 'ETH-PERP', baseAsset: 'ETH', indexToken: addresses.weth },
    { symbol: 'BTC-PERP', baseAsset: 'BTC', indexToken: addresses.wbtc },
  ]
}

// Parse human-readable ABIs into viem format
const vaultAbi = parseAbi(VaultABI)
const routerAbi = parseAbi(RouterABI)
const positionManagerAbi = parseAbi(PositionManagerABI)
const priceFeedAbi = parseAbi(PriceFeedABI)
const erc20Abi = parseAbi(ERC20ABI)

// MockERC20 has a mint function for dev faucet
const mockErc20Abi = parseAbi([
  ...ERC20ABI,
  'function mint(address to, uint256 amount) external',
])

export function getContracts(chainId: number) {
  const addresses = getAddresses(chainId)

  return {
    vault: { address: addresses.vault, abi: vaultAbi } as const,
    router: { address: addresses.router, abi: routerAbi } as const,
    positionManager: { address: addresses.positionManager, abi: positionManagerAbi } as const,
    priceFeed: { address: addresses.priceFeed, abi: priceFeedAbi } as const,
    usdc: { address: addresses.usdc, abi: erc20Abi } as const,
    usdcMock: { address: addresses.usdc, abi: mockErc20Abi } as const,
    plp: { address: addresses.plp, abi: erc20Abi } as const,
    addresses,
  }
}

// Re-export for convenience
export { getAddresses, type ContractAddresses }
