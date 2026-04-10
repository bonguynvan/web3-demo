/**
 * SwapQuoteDisplay — shows quote details between input and submit button.
 *
 * Rows: exchange rate, price impact, estimated gas, route/sources.
 */

import { Loader2 } from 'lucide-react'
import { cn } from '../../lib/format'
import { formatTokenAmount } from '../../lib/spotUtils'
import type { SwapQuote } from '../../types/spot'

interface SwapQuoteDisplayProps {
  quote: SwapQuote | null
  isLoading: boolean
  error: string | null
  slippageBps: number
}

export function SwapQuoteDisplay({ quote, isLoading, error, slippageBps }: SwapQuoteDisplayProps) {
  if (error) {
    return (
      <div className="text-xs text-short bg-short/10 rounded-lg px-3 py-2">
        {error}
      </div>
    )
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center gap-2 text-xs text-text-muted py-3">
        <Loader2 className="w-3.5 h-3.5 animate-spin" />
        Fetching quote...
      </div>
    )
  }

  if (!quote) return null

  const minReceived = quote.buyAmount - (quote.buyAmount * BigInt(slippageBps)) / 10000n
  const impactClass = Math.abs(quote.estimatedPriceImpact) > 3
    ? 'text-short'
    : Math.abs(quote.estimatedPriceImpact) > 1
      ? 'text-yellow-400'
      : 'text-text-secondary'

  const routeLabel = quote.sources.length > 0
    ? quote.sources
        .filter(s => s.proportion > 0)
        .map(s => s.name)
        .join(' → ')
    : 'Best route'

  return (
    <div className="space-y-1.5 text-xs">
      <QuoteRow
        label="Rate"
        value={`1 ${quote.sellToken.symbol} = ${quote.price.toFixed(6)} ${quote.buyToken.symbol}`}
      />
      <QuoteRow
        label="Price Impact"
        value={`${quote.estimatedPriceImpact >= 0 ? '' : ''}${quote.estimatedPriceImpact.toFixed(2)}%`}
        valueClass={impactClass}
      />
      <QuoteRow
        label="Min. Received"
        value={`${formatTokenAmount(minReceived, quote.buyToken.decimals, 6)} ${quote.buyToken.symbol}`}
      />
      <QuoteRow
        label="Slippage"
        value={`${(slippageBps / 100).toFixed(1)}%`}
      />
      <QuoteRow
        label="Route"
        value={routeLabel}
        valueClass="text-text-muted"
      />
    </div>
  )
}

function QuoteRow({
  label,
  value,
  valueClass,
}: {
  label: string
  value: string
  valueClass?: string
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-text-muted">{label}</span>
      <span className={cn('font-mono tabular-nums text-right', valueClass ?? 'text-text-secondary')}>
        {value}
      </span>
    </div>
  )
}
