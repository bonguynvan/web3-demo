/**
 * SwapHistory — recent swap transactions list.
 *
 * Reads from the client-side swap history store (localStorage-backed).
 * Shows token pair, amounts, time, and links to Arbiscan.
 */

import { useEffect } from 'react'
import { useAccount } from 'wagmi'
import { useTranslation } from 'react-i18next'
import { ExternalLink, Inbox, ArrowRight } from 'lucide-react'
import { useSwapHistoryStore, type SwapHistoryEntry } from '../../store/swapHistoryStore'

const ARBISCAN_TX = 'https://arbiscan.io/tx/'

export function SwapHistory() {
  const { t } = useTranslation('spot')
  const { address } = useAccount()
  const { entries, loadForAddress } = useSwapHistoryStore()

  // Load history when wallet connects
  useEffect(() => {
    if (address) loadForAddress(address)
  }, [address, loadForAddress])

  if (!address) {
    return (
      <EmptyState message={t('common:connect_wallet')} />
    )
  }

  if (entries.length === 0) {
    return (
      <EmptyState message={t('no_swaps_yet')} />
    )
  }

  return (
    <div className="space-y-1">
      {entries.map(entry => (
        <SwapRow key={entry.id} entry={entry} />
      ))}
    </div>
  )
}

function SwapRow({ entry }: { entry: SwapHistoryEntry }) {
  const { t } = useTranslation('spot')
  const timeStr = formatRelativeTime(entry.timestamp)

  return (
    <div className="flex items-center justify-between px-2 py-2 rounded hover:bg-surface/50 transition-colors group">
      <div className="flex items-center gap-2 min-w-0">
        {/* Token pair */}
        <div className="flex items-center gap-1 text-xs font-medium text-text-primary">
          <span>{entry.sellToken.symbol}</span>
          <ArrowRight className="w-3 h-3 text-text-muted" />
          <span>{entry.buyToken.symbol}</span>
        </div>
      </div>

      <div className="flex items-center gap-3 shrink-0">
        {/* Amounts */}
        <div className="text-right text-[10px]">
          <div className="text-text-muted font-mono">
            -{entry.sellAmount} {entry.sellToken.symbol}
          </div>
          <div className="text-long font-mono">
            +{entry.buyAmount} {entry.buyToken.symbol}
          </div>
        </div>

        {/* Time + link */}
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] text-text-muted">{timeStr}</span>
          <a
            href={`${ARBISCAN_TX}${entry.txHash}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-text-muted hover:text-accent transition-colors opacity-0 group-hover:opacity-100"
            title={t('view_on_arbiscan')}
          >
            <ExternalLink className="w-3 h-3" />
          </a>
        </div>
      </div>
    </div>
  )
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-8 gap-2">
      <div className="w-10 h-10 rounded-full bg-surface/70 flex items-center justify-center text-text-muted">
        <Inbox className="w-4 h-4" />
      </div>
      <div className="text-[10px] text-text-muted text-center max-w-[200px]">
        {message}
      </div>
    </div>
  )
}

function formatRelativeTime(timestamp: number): string {
  const diff = Date.now() - timestamp
  const seconds = Math.floor(diff / 1000)

  if (seconds < 60) return 'now'
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}d ago`

  return new Date(timestamp).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  })
}
