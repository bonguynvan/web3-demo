/**
 * SignalSourcesModal — toggle per-user which signal sources fire.
 *
 * The toggles are presentation-only. The underlying compute layer
 * (including confluence) still has access to every source internally;
 * we just hide disabled ones from the panel, alerts, and bots.
 */

import { X } from 'lucide-react'
import { Modal } from './ui/Modal'
import { useSignalSettingsStore, ALL_SOURCES } from '../store/signalSettingsStore'
import { cn } from '../lib/format'
import type { SignalSource } from '../signals/types'

interface Props {
  open: boolean
  onClose: () => void
}

const SOURCE_INFO: Record<SignalSource, { label: string; emoji: string; description: string }> = {
  funding: {
    label: 'Funding',
    emoji: '⚡',
    description: 'Funding-rate extremes on perp markets — long/short squeeze setups.',
  },
  crossover: {
    label: 'Crossover',
    emoji: '↗︎',
    description: 'EMA9/21 crossovers across the top markets by volume.',
  },
  rsi: {
    label: 'RSI',
    emoji: '🔄',
    description: 'Wilder RSI(14) crossing into overbought (≥70) or oversold (≤30) zones.',
  },
  volatility: {
    label: 'Volatility',
    emoji: '🚀',
    description: 'Latest bar range ≥3× the rolling 20-bar average — breakout candidates.',
  },
  whale: {
    label: 'Whale',
    emoji: '🐋',
    description: 'Live large-trade flow + on-chain whale-wallet position opens.',
  },
  confluence: {
    label: 'Confluence',
    emoji: '🎯',
    description: 'Synthesized when ≥2 distinct sources agree on direction. Top priority.',
  },
  news: {
    label: 'News',
    emoji: '📰',
    description: 'Important sentiment-leaning headlines from CryptoPanic (requires token).',
  },
  liquidation: {
    label: 'Liquidation',
    emoji: '💥',
    description: 'Forced position liquidations (not yet wired).',
  },
}

export function SignalSourcesModal({ open, onClose }: Props) {
  const enabled = useSignalSettingsStore(s => s.enabled)
  const toggle = useSignalSettingsStore(s => s.toggle)
  const setAll = useSignalSettingsStore(s => s.setAll)

  return (
    <Modal open={open} onClose={onClose} title="Signal sources">
      <div className="p-4 space-y-3 max-h-[70vh] overflow-y-auto">
        <div className="text-[11px] text-text-muted leading-relaxed">
          Toggle which sources fire in the live feed, alerts, and bot engine.
          Confluence still factors all sources internally regardless — these
          flags are presentation-only.
        </div>

        <div className="flex gap-1.5">
          <button
            onClick={() => setAll(true)}
            className="flex-1 py-1.5 text-[11px] font-medium rounded-md bg-surface border border-border text-text-secondary hover:text-text-primary hover:bg-panel-light transition-colors cursor-pointer"
          >
            Enable all
          </button>
          <button
            onClick={() => setAll(false)}
            className="flex-1 py-1.5 text-[11px] font-medium rounded-md bg-surface border border-border text-text-secondary hover:text-text-primary hover:bg-panel-light transition-colors cursor-pointer"
          >
            Disable all
          </button>
        </div>

        <div className="space-y-1.5">
          {ALL_SOURCES.map(src => {
            const info = SOURCE_INFO[src]
            const on = enabled[src] !== false
            return (
              <label
                key={src}
                className={cn(
                  'flex items-start justify-between gap-3 px-3 py-2.5 rounded-md cursor-pointer transition-colors',
                  on ? 'bg-surface/60' : 'bg-surface/30 opacity-60',
                  'hover:bg-panel-light',
                )}
              >
                <div className="flex items-start gap-2 min-w-0">
                  <span className="text-base shrink-0 mt-0.5">{info.emoji}</span>
                  <div className="min-w-0">
                    <div className="text-xs font-medium text-text-primary">{info.label}</div>
                    <div className="text-[10px] text-text-muted leading-snug">{info.description}</div>
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={on}
                  onChange={() => toggle(src)}
                  className="w-4 h-4 accent-accent cursor-pointer shrink-0 mt-1"
                />
              </label>
            )
          })}
        </div>
      </div>

      <div className="flex justify-end px-4 pb-4">
        <button
          onClick={onClose}
          className="flex items-center justify-center w-9 h-9 rounded-md bg-surface border border-border text-text-muted hover:text-text-primary transition-colors cursor-pointer"
          aria-label="Close"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    </Modal>
  )
}
