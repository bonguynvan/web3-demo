/**
 * Web3Header — market bar with real wallet connection via wagmi.
 *
 * Wallet connection flow:
 *   1. User clicks "Connect Wallet"
 *   2. wagmi's useConnect shows connector options (MetaMask, WalletConnect)
 *   3. User approves in wallet → useAccount returns the address
 *   4. We sync the address to sessionStore
 *   5. Header shows truncated address + chain indicator
 */

import { useState, useEffect } from 'react'
import { useAccount, useConnect, useDisconnect, useChainId } from 'wagmi'
import { ChevronDown, Wallet, Zap, LogOut, Shield } from 'lucide-react'
import { useTradingStore } from '../store/tradingStore'
import { useSessionStore } from '../store/sessionStore'
import { formatUsd, formatCompact, formatCountdown, cn } from '../lib/format'
import { useThrottledValue } from '../lib/useThrottledValue'
import { useRenderCount } from '../lib/useRenderCount'

const CHAIN_NAMES: Record<number, string> = {
  1: 'Ethereum',
  11155111: 'Sepolia',
  1337: 'Localhost',
}

export function Web3Header() {
  useRenderCount('Header')

  const { markets, setSelectedMarket, accountBalance } = useTradingStore()
  const rawMarket = useTradingStore(s => s.selectedMarket)
  const selectedMarket = useThrottledValue(rawMarket)
  const [showMarketSelector, setShowMarketSelector] = useState(false)
  const [showWalletMenu, setShowWalletMenu] = useState(false)

  // wagmi hooks
  const { address, isConnected } = useAccount()
  const chainId = useChainId()
  const { connect, connectors } = useConnect()
  const { disconnect } = useDisconnect()

  // Session store
  const { setWallet, status: sessionStatus, session } = useSessionStore()

  // Sync wagmi state → sessionStore
  useEffect(() => {
    setWallet(address ?? null, chainId ?? null)
  }, [address, chainId, setWallet])

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
              {markets.map(m => (
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
                    <div className="text-xs text-text-muted">Vol {formatCompact(m.volume24h)}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-mono text-text-primary">${formatUsd(m.lastPrice)}</div>
                    <div className={cn('text-xs font-mono', m.change24h >= 0 ? 'text-long' : 'text-short')}>
                      {m.change24h >= 0 ? '+' : ''}{m.change24h}%
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Market Stats — truncate on narrow screens to avoid overlapping center toggle */}
      <div className="flex items-center gap-6 text-xs overflow-hidden">
        <div>
          <span className="text-text-muted">Mark</span>
          <span className="ml-1.5 font-mono text-text-primary">${formatUsd(selectedMarket.markPrice)}</span>
        </div>
        <div>
          <span className="text-text-muted">Index</span>
          <span className="ml-1.5 font-mono text-text-primary">${formatUsd(selectedMarket.indexPrice)}</span>
        </div>
        <div>
          <span className="text-text-muted">24h Change</span>
          <span className={cn('ml-1.5 font-mono', selectedMarket.change24h >= 0 ? 'text-long' : 'text-short')}>
            {selectedMarket.change24h >= 0 ? '+' : ''}{selectedMarket.change24h}%
          </span>
        </div>
        <div>
          <span className="text-text-muted">24h Vol</span>
          <span className="ml-1.5 font-mono text-text-primary">${formatCompact(selectedMarket.volume24h)}</span>
        </div>
        <div>
          <span className="text-text-muted">Funding</span>
          <span className={cn('ml-1.5 font-mono', selectedMarket.fundingRate >= 0 ? 'text-long' : 'text-short')}>
            {selectedMarket.fundingRate >= 0 ? '+' : ''}{selectedMarket.fundingRate}%
          </span>
          <span className="ml-1 text-text-muted">{formatCountdown(selectedMarket.nextFunding)}</span>
        </div>
      </div>

      <div className="flex-1" />

      {/* Wallet Section */}
      {isConnected ? (
        <div className="flex items-center gap-3">
          {/* Session status indicator */}
          <div className={cn(
            'flex items-center gap-1 text-[10px] px-2 py-1 rounded',
            sessionStatus === 'ready' ? 'bg-long-dim text-long' :
            sessionStatus === 'signing' ? 'bg-accent-dim text-accent' :
            'bg-surface text-text-muted'
          )}>
            <Shield className="w-3 h-3" />
            {sessionStatus === 'ready' ? 'Trading Enabled' :
             sessionStatus === 'signing' ? 'Signing...' :
             'Sign to Trade'}
          </div>

          {/* Balance */}
          <div className="text-xs">
            <span className="text-text-muted">Balance</span>
            <span className="ml-1.5 font-mono text-text-primary font-medium">${formatUsd(accountBalance)}</span>
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
                    {session && (
                      <div className="text-[10px] text-long mt-1">
                        Session expires: {new Date(session.expiry * 1000).toLocaleTimeString()}
                      </div>
                    )}
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
