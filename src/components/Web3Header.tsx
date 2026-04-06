/**
 * Web3Header — market bar with real wallet connection and on-chain data.
 */

import { useState, useEffect } from 'react'
import { useAccount, useConnect, useDisconnect, useChainId } from 'wagmi'
import { ChevronDown, Wallet, Zap, LogOut } from 'lucide-react'
import { useTradingStore } from '../store/tradingStore'
import { useUsdcBalance } from '../hooks/useTokenBalance'
import { usePrices } from '../hooks/usePrices'
import { useVault } from '../hooks/useVault'
import { useFaucet } from '../hooks/useFaucet'
import { cn } from '../lib/format'

const CHAIN_NAMES: Record<number, string> = {
  31337: 'Anvil',
  42161: 'Arbitrum',
  8453: 'Base',
}

export function Web3Header() {
  const { markets, selectedMarket, setSelectedMarket } = useTradingStore()
  const [showMarketSelector, setShowMarketSelector] = useState(false)
  const [showWalletMenu, setShowWalletMenu] = useState(false)

  // wagmi hooks
  const { address, isConnected } = useAccount()
  const chainId = useChainId()
  const { connect, connectors } = useConnect()
  const { disconnect } = useDisconnect()

  // On-chain data
  const { dollars: usdcBalance } = useUsdcBalance()
  const { getPrice } = usePrices()
  const { stats: vaultStats } = useVault()
  const { mint, minting, isAvailable: faucetAvailable } = useFaucet()

  const currentPrice = getPrice(selectedMarket.symbol)

  const truncatedAddress = address
    ? `${address.slice(0, 6)}...${address.slice(-4)}`
    : ''

  const formatUsd = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  const formatCompact = (n: number) => {
    if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`
    if (n >= 1e3) return `${(n / 1e3).toFixed(1)}K`
    return n.toFixed(0)
  }

  return (
    <header className="flex items-center h-14 bg-panel border-b border-border px-4 gap-6 shrink-0">
      {/* Logo */}
      <div className="flex items-center gap-2 mr-2">
        <Zap className="w-5 h-5 text-accent" />
        <span className="font-semibold text-text-primary text-sm">PERP DEX</span>
      </div>

      {/* Market Selector */}
      <div className="relative">
        <button
          onClick={() => { setShowMarketSelector(!showMarketSelector); setShowWalletMenu(false) }}
          className="flex items-center gap-2 cursor-pointer hover:bg-panel-light px-3 py-1.5 rounded transition-colors"
        >
          <span className="font-semibold text-text-primary">{selectedMarket.symbol}</span>
          <ChevronDown className="w-4 h-4 text-text-muted" />
        </button>

        {showMarketSelector && (
          <>
            <div className="fixed inset-0 z-10" onClick={() => setShowMarketSelector(false)} />
            <div className="absolute top-full left-0 mt-1 bg-panel border border-border rounded-lg shadow-2xl z-20 min-w-[280px]">
              {markets.map(m => {
                const mPrice = getPrice(m.symbol)
                return (
                  <button
                    key={m.symbol}
                    onClick={() => { setSelectedMarket(m.symbol); setShowMarketSelector(false) }}
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
            </div>
          </>
        )}
      </div>

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
          {/* Faucet (Anvil only) */}
          {faucetAvailable && (
            <button
              onClick={() => mint(10_000)}
              disabled={minting}
              className="text-[10px] bg-accent-dim text-accent px-2 py-1 rounded hover:bg-accent-dim/80 transition-colors cursor-pointer disabled:opacity-50"
            >
              {minting ? 'Minting...' : '+ 10K USDC'}
            </button>
          )}

          {/* USDC Balance */}
          <div className="text-xs">
            <span className="text-text-muted">USDC</span>
            <span className="ml-1.5 font-mono text-text-primary font-medium">${formatUsd(usdcBalance)}</span>
          </div>

          {/* Wallet address + menu */}
          <div className="relative">
            <button
              onClick={() => { setShowWalletMenu(!showWalletMenu); setShowMarketSelector(false) }}
              className="flex items-center gap-1.5 bg-accent-dim text-accent text-xs px-3 py-1.5 rounded-md cursor-pointer hover:bg-accent-dim/80 transition-colors"
            >
              <Wallet className="w-3.5 h-3.5" />
              <span className="font-mono">{truncatedAddress}</span>
              <span className="text-[10px] text-accent/60">{CHAIN_NAMES[chainId] || `Chain ${chainId}`}</span>
            </button>

            {showWalletMenu && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setShowWalletMenu(false)} />
                <div className="absolute top-full right-0 mt-1 bg-panel border border-border rounded-lg shadow-2xl z-20 min-w-[200px]">
                  <div className="px-4 py-3 border-b border-border">
                    <div className="text-xs text-text-muted">Connected as</div>
                    <div className="text-sm font-mono text-text-primary mt-0.5">{truncatedAddress}</div>
                  </div>
                  <button
                    onClick={() => { disconnect(); setShowWalletMenu(false) }}
                    className="flex items-center gap-2 w-full px-4 py-2.5 text-xs text-short hover:bg-panel-light transition-colors cursor-pointer"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                    Disconnect
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      ) : (
        <div className="relative">
          <button
            onClick={() => { setShowWalletMenu(!showWalletMenu); setShowMarketSelector(false) }}
            className="flex items-center gap-1.5 bg-accent hover:bg-accent/80 text-white text-xs font-medium px-4 py-2 rounded-md transition-colors cursor-pointer"
          >
            <Wallet className="w-3.5 h-3.5" />
            Connect Wallet
          </button>

          {showWalletMenu && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setShowWalletMenu(false)} />
              <div className="absolute top-full right-0 mt-1 bg-panel border border-border rounded-lg shadow-2xl z-20 min-w-[220px] p-2">
                <div className="text-[10px] text-text-muted uppercase tracking-wider px-2 py-1">
                  Choose Wallet
                </div>
                {connectors.map(connector => (
                  <button
                    key={connector.uid}
                    onClick={() => { connect({ connector }); setShowWalletMenu(false) }}
                    className="flex items-center gap-2 w-full px-3 py-2.5 text-xs text-text-primary hover:bg-panel-light rounded transition-colors cursor-pointer"
                  >
                    <Wallet className="w-4 h-4 text-accent" />
                    {connector.name}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </header>
  )
}
