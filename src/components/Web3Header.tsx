/**
 * Web3Header — market bar with real wallet connection and on-chain data.
 */

import { useAccount, useConnect, useDisconnect, useChainId } from 'wagmi'
import { ChevronDown, Wallet, Zap, LogOut } from 'lucide-react'
import { useTradingStore } from '../store/tradingStore'
import { useUsdcBalance } from '../hooks/useTokenBalance'
import { usePrices } from '../hooks/usePrices'
import { useVault } from '../hooks/useVault'
import { useFaucet } from '../hooks/useFaucet'
import { cn, formatUsd, formatCompact } from '../lib/format'
import { Dropdown, DropdownItem } from './ui/Dropdown'

const CHAIN_NAMES: Record<number, string> = {
  31337: 'Anvil',
  42161: 'Arbitrum',
  8453: 'Base',
}

export function Web3Header() {
  const { markets, selectedMarket, setSelectedMarket } = useTradingStore()

  const { address, isConnected } = useAccount()
  const chainId = useChainId()
  const { connect, connectors } = useConnect()
  const { disconnect } = useDisconnect()

  const { dollars: usdcBalance } = useUsdcBalance()
  const { getPrice } = usePrices()
  const { stats: vaultStats } = useVault()
  const { mint, minting, isAvailable: faucetAvailable } = useFaucet()

  const currentPrice = getPrice(selectedMarket.symbol)

  const truncatedAddress = address
    ? `${address.slice(0, 6)}...${address.slice(-4)}`
    : ''

  return (
    <header className="flex items-center h-14 bg-panel border-b border-border px-4 gap-6 shrink-0">
      {/* Logo */}
      <div className="flex items-center gap-2 mr-2">
        <Zap className="w-5 h-5 text-accent" />
        <span className="font-semibold text-text-primary text-sm">PERP DEX</span>
      </div>

      {/* Market Selector */}
      <Dropdown
        trigger={
          <>
            <span className="font-semibold text-text-primary">{selectedMarket.symbol}</span>
            <ChevronDown className="w-4 h-4 text-text-muted" />
          </>
        }
        width="min-w-[280px]"
      >
        {markets.map(m => {
          const mPrice = getPrice(m.symbol)
          return (
            <button
              key={m.symbol}
              onClick={() => setSelectedMarket(m.symbol)}
              className={cn(
                'flex items-center justify-between w-full px-4 py-2.5 hover:bg-panel-light transition-colors cursor-pointer text-left',
                m.symbol === selectedMarket.symbol && 'bg-panel-light'
              )}
            >
              <div>
                <div className="text-sm font-medium text-text-primary">{m.symbol}</div>
                <div className="text-xs text-text-muted">{m.baseAsset}</div>
              </div>
              <div className="text-right">
                <div className="text-sm font-mono text-text-primary">
                  ${mPrice ? formatUsd(mPrice.price) : '---'}
                </div>
              </div>
            </button>
          )
        })}
      </Dropdown>

      {/* Market Stats */}
      <div className="flex items-center gap-6 text-xs overflow-hidden">
        <div>
          <span className="text-text-muted">Oracle Price</span>
          <span className="ml-1.5 font-mono text-text-primary font-medium">
            ${currentPrice ? formatUsd(currentPrice.price) : '---'}
          </span>
        </div>
        <div>
          <span className="text-text-muted">Pool</span>
          <span className="ml-1.5 font-mono text-text-primary">${formatCompact(vaultStats.poolAmount)}</span>
        </div>
        <div>
          <span className="text-text-muted">Utilization</span>
          <span className="ml-1.5 font-mono text-text-primary">{vaultStats.utilizationPercent.toFixed(1)}%</span>
        </div>
      </div>

      <div className="flex-1" />

      {/* Wallet Section */}
      {isConnected ? (
        <div className="flex items-center gap-3">
          {faucetAvailable && (
            <button
              onClick={() => mint(10_000)}
              disabled={minting}
              className="text-[10px] bg-accent-dim text-accent px-2 py-1 rounded hover:bg-accent-dim/80 transition-colors cursor-pointer disabled:opacity-50"
            >
              {minting ? 'Minting...' : '+ 10K USDC'}
            </button>
          )}

          <div className="text-xs">
            <span className="text-text-muted">USDC</span>
            <span className="ml-1.5 font-mono text-text-primary font-medium">${formatUsd(usdcBalance)}</span>
          </div>

          <Dropdown
            trigger={
              <>
                <Wallet className="w-3.5 h-3.5" />
                <span className="font-mono">{truncatedAddress}</span>
                <span className="text-[10px] text-accent/60">{CHAIN_NAMES[chainId] || `Chain ${chainId}`}</span>
              </>
            }
            align="right"
            width="min-w-[200px]"
          >
            <div className="px-4 py-3 border-b border-border" onClick={e => e.stopPropagation()}>
              <div className="text-xs text-text-muted">Connected as</div>
              <div className="text-sm font-mono text-text-primary mt-0.5">{truncatedAddress}</div>
            </div>
            <button
              onClick={() => disconnect()}
              className="flex items-center gap-2 w-full px-4 py-2.5 text-xs text-short hover:bg-panel-light transition-colors cursor-pointer"
            >
              <LogOut className="w-3.5 h-3.5" />
              Disconnect
            </button>
          </Dropdown>
        </div>
      ) : (
        <Dropdown
          trigger={
            <>
              <Wallet className="w-3.5 h-3.5" />
              Connect Wallet
            </>
          }
          align="right"
          width="min-w-[220px]"
        >
          <div className="text-[10px] text-text-muted uppercase tracking-wider px-2 py-1" onClick={e => e.stopPropagation()}>
            Choose Wallet
          </div>
          {connectors.map(connector => (
            <DropdownItem key={connector.uid} onClick={() => connect({ connector })}>
              <div className="flex items-center gap-2">
                <Wallet className="w-4 h-4 text-accent" />
                {connector.name}
              </div>
            </DropdownItem>
          ))}
        </Dropdown>
      )}
    </header>
  )
}
