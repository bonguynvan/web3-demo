/**
 * MarketInfo — displays oracle prices, vault stats, and market data.
 *
 * Replaces the orderbook in the AMM layout. In a GMX-style DEX,
 * there's no orderbook — traders trade against the liquidity pool.
 * This panel shows pool health, oracle prices, and fee information.
 */

import { usePrices } from '../hooks/usePrices'
import { useVault } from '../hooks/useVault'
import { useTradingStore } from '../store/tradingStore'
import { cn, formatUsd, formatCompact } from '../lib/format'

export function MarketInfo() {
  const selectedMarket = useTradingStore(s => s.selectedMarket)
  const { prices } = usePrices()
  const { stats } = useVault()

  const currentPrice = prices.find(p => p.market === selectedMarket.symbol)

  const fmtCompactUsd = (n: number) => `$${formatCompact(n)}`

  return (
    <div className="flex flex-col h-full bg-panel rounded-lg border border-border overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-border">
        <span className="text-xs font-medium text-text-primary">Market Info</span>
        <span className="text-[10px] text-accent bg-accent-dim px-1.5 py-0.5 rounded">AMM</span>
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* Oracle Price */}
        <div className="px-3 py-4 border-b border-border text-center">
          <div className="text-[10px] text-text-muted uppercase tracking-wider mb-1">
            {selectedMarket.baseAsset} Oracle Price
          </div>
          <div className="text-2xl font-mono font-bold text-text-primary">
            ${currentPrice ? formatUsd(currentPrice.price) : '---'}
          </div>
          <div className="text-[10px] text-text-muted mt-1">
            Chainlink • Updates every 3s
          </div>
        </div>

        {/* All market prices */}
        <div className="px-3 py-3 border-b border-border">
          <div className="text-[10px] text-text-muted uppercase tracking-wider mb-2">Oracle Prices</div>
          <div className="space-y-2">
            {prices.map(p => (
              <div key={p.market} className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className={cn(
                    'w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold',
                    p.symbol === 'ETH' ? 'bg-blue-500/20 text-blue-400' : 'bg-orange-500/20 text-orange-400'
                  )}>
                    {p.symbol.charAt(0)}
                  </span>
                  <span className="text-xs text-text-primary">{p.market}</span>
                </div>
                <span className="font-mono text-xs text-text-primary">
                  ${p.price > 0 ? formatUsd(p.price) : '---'}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Vault Stats */}
        <div className="px-3 py-3 border-b border-border">
          <div className="text-[10px] text-text-muted uppercase tracking-wider mb-2">Liquidity Pool</div>
          <div className="space-y-2">
            <StatRow label="Total Pool" value={fmtCompactUsd(stats.poolAmount)} />
            <StatRow label="Available" value={fmtCompactUsd(stats.availableLiquidity)} />
            <StatRow label="Reserved" value={fmtCompactUsd(stats.reservedAmount)} />

            {/* Utilization bar */}
            <div className="mt-2">
              <div className="flex justify-between text-[10px] mb-1">
                <span className="text-text-muted">Utilization</span>
                <span className="text-text-primary font-mono">{stats.utilizationPercent.toFixed(1)}%</span>
              </div>
              <div className="h-1.5 bg-surface rounded-full overflow-hidden">
                <div
                  className={cn(
                    'h-full rounded-full transition-all duration-500',
                    stats.utilizationPercent > 70 ? 'bg-short' :
                    stats.utilizationPercent > 40 ? 'bg-accent' : 'bg-long'
                  )}
                  style={{ width: `${Math.min(stats.utilizationPercent, 100)}%` }}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Trading Params */}
        <div className="px-3 py-3">
          <div className="text-[10px] text-text-muted uppercase tracking-wider mb-2">Trading Parameters</div>
          <div className="space-y-2">
            <StatRow label="Max Leverage" value="20x" />
            <StatRow label="Margin Fee" value="0.1%" />
            <StatRow label="Liquidation Fee" value="$5.00" />
            <StatRow label="Max Utilization" value="80%" />
            <StatRow label="Collateral" value="USDC" />
          </div>
        </div>
      </div>
    </div>
  )
}

function StatRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between text-xs">
      <span className="text-text-muted">{label}</span>
      <span className="font-mono text-text-primary">{value}</span>
    </div>
  )
}
