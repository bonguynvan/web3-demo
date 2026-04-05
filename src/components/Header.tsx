import { useState } from 'react'
import { ChevronDown, Wallet, Zap } from 'lucide-react'
import { useTradingStore } from '../store/tradingStore'
import { formatUsd, formatCompact, formatCountdown, cn } from '../lib/format'
import { useThrottledValue } from '../lib/useThrottledValue'
import { useRenderCount } from '../lib/useRenderCount'

export function Header() {
  useRenderCount('Header')
  const { markets, setSelectedMarket, accountBalance, walletConnected, connectWallet } = useTradingStore()
  const rawMarket = useTradingStore(s => s.selectedMarket)
  const selectedMarket = useThrottledValue(rawMarket)
  const [showMarketSelector, setShowMarketSelector] = useState(false)

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
          onClick={() => setShowMarketSelector(!showMarketSelector)}
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

      {/* Market Stats */}
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
          <span className="text-text-muted">24h High</span>
          <span className="ml-1.5 font-mono text-text-primary">${formatUsd(selectedMarket.high24h)}</span>
        </div>
        <div>
          <span className="text-text-muted">24h Low</span>
          <span className="ml-1.5 font-mono text-text-primary">${formatUsd(selectedMarket.low24h)}</span>
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

      {/* Spacer */}
      <div className="flex-1" />

      {/* Balance + Wallet */}
      {walletConnected ? (
        <div className="flex items-center gap-4">
          <div className="text-xs">
            <span className="text-text-muted">Balance</span>
            <span className="ml-1.5 font-mono text-text-primary font-medium">${formatUsd(accountBalance)}</span>
          </div>
          <div className="flex items-center gap-1.5 bg-accent-dim text-accent text-xs px-3 py-1.5 rounded-md">
            <Wallet className="w-3.5 h-3.5" />
            <span className="font-mono">0x1a2b...9f3e</span>
          </div>
        </div>
      ) : (
        <button
          onClick={connectWallet}
          className="flex items-center gap-1.5 bg-accent hover:bg-accent/80 text-white text-xs font-medium px-4 py-2 rounded-md transition-colors cursor-pointer"
        >
          <Wallet className="w-3.5 h-3.5" />
          Connect Wallet
        </button>
      )}
    </header>
  )
}
