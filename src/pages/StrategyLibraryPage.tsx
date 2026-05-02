/**
 * StrategyLibraryPage — curated strategies users can install with one click.
 *
 * MVP for the social/marketplace direction. Strategies are venue-agnostic:
 * each one defines its filters via `allowedSources` and `allowedMarkets`,
 * and runs against whatever VenueAdapter the user has active.
 */

import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, BookOpen, Plus, Check } from 'lucide-react'
import { useBotStore } from '../store/botStore'
import { useToast } from '../store/toastStore'
import { STRATEGY_LIBRARY, type PublishedStrategy } from '../strategies/library'
import { cn } from '../lib/format'

export function StrategyLibraryPage() {
  const addBot = useBotStore(s => s.addBot)
  const toast = useToast()
  const [installed, setInstalled] = useState<Set<string>>(() => new Set())
  const [filterTag, setFilterTag] = useState<string>('')

  const allTags = Array.from(new Set(STRATEGY_LIBRARY.flatMap(s => s.tags))).sort()
  const visible = filterTag
    ? STRATEGY_LIBRARY.filter(s => s.tags.includes(filterTag))
    : STRATEGY_LIBRARY

  const install = (s: PublishedStrategy) => {
    addBot({
      name: s.bot.name,
      enabled: true,
      mode: s.bot.mode,
      allowedSources: s.bot.allowedSources,
      allowedMarkets: s.bot.allowedMarkets,
      minConfidence: s.bot.minConfidence,
      positionSizeUsd: s.bot.positionSizeUsd,
      holdMinutes: s.bot.holdMinutes,
      maxTradesPerDay: s.bot.maxTradesPerDay,
    })
    setInstalled(prev => new Set(prev).add(s.id))
    toast.success(`Added ${s.name}`, 'Now running in paper mode on your active venue')
  }

  return (
    <div className="min-h-screen bg-surface text-text-primary">
      <header className="flex items-center justify-between px-6 md:px-10 py-5 border-b border-border">
        <div className="flex items-center gap-2">
          <BookOpen className="w-5 h-5 text-accent" />
          <span className="text-base font-semibold">Strategy library</span>
        </div>
        <Link
          to="/trade"
          className="flex items-center gap-1.5 text-sm text-text-secondary hover:text-text-primary transition-colors"
        >
          Open the Deck
          <ArrowRight className="w-3.5 h-3.5" />
        </Link>
      </header>

      <section className="max-w-5xl mx-auto px-6 md:px-10 py-10">
        <div className="mb-8">
          <h1 className="text-3xl font-bold tracking-tight mb-2">
            Curated strategies, one-click install
          </h1>
          <p className="text-sm text-text-secondary max-w-2xl leading-relaxed">
            Strategies published by the TradingDek team and the community. Each runs in paper mode
            on your active venue (CEX or DEX) so you can validate before risking real capital.
            Past performance is not predictive — sample sizes shown.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-1.5 mb-6">
          <button
            onClick={() => setFilterTag('')}
            className={cn(
              'px-2.5 py-1 text-[11px] uppercase tracking-wider rounded-full border transition-colors cursor-pointer',
              filterTag === ''
                ? 'border-accent text-accent bg-accent-dim'
                : 'border-border text-text-muted hover:text-text-primary',
            )}
          >
            All
          </button>
          {allTags.map(tag => (
            <button
              key={tag}
              onClick={() => setFilterTag(tag === filterTag ? '' : tag)}
              className={cn(
                'px-2.5 py-1 text-[11px] uppercase tracking-wider rounded-full border transition-colors cursor-pointer',
                filterTag === tag
                  ? 'border-accent text-accent bg-accent-dim'
                  : 'border-border text-text-muted hover:text-text-primary',
              )}
            >
              {tag}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {visible.map(s => (
            <StrategyCard
              key={s.id}
              strategy={s}
              installed={installed.has(s.id)}
              onInstall={() => install(s)}
            />
          ))}
        </div>

        <div className="mt-10 p-4 bg-panel/60 border border-border rounded-lg text-[11px] text-text-muted leading-relaxed">
          Want to publish your own strategy? Export your bot from the Bots panel — the same
          portable JSON format powers this library. A submission flow lands when the marketplace
          backend ships.
        </div>
      </section>
    </div>
  )
}

function StrategyCard({
  strategy, installed, onInstall,
}: {
  strategy: PublishedStrategy
  installed: boolean
  onInstall: () => void
}) {
  const { bot, performance } = strategy
  return (
    <article className="bg-panel border border-border rounded-lg p-4 flex flex-col">
      <header className="flex items-start justify-between gap-3 mb-2">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-text-primary truncate">{strategy.name}</h3>
          <div className="text-[11px] text-text-muted">
            by {strategy.author.name}
            {strategy.author.handle && <span className="ml-1 text-text-muted/80">{strategy.author.handle}</span>}
          </div>
        </div>
        {performance && (
          <div className="shrink-0 text-right">
            <div className={cn(
              'text-sm font-mono tabular-nums font-semibold',
              performance.winRate >= 0.55 ? 'text-long' : 'text-text-secondary',
            )}>
              {Math.round(performance.winRate * 100)}%
            </div>
            <div className="text-[10px] text-text-muted">
              {performance.sample} trades
            </div>
          </div>
        )}
      </header>

      <p className="text-xs text-text-secondary leading-relaxed mb-3 flex-1">{strategy.summary}</p>

      <div className="flex flex-wrap gap-1 mb-3">
        {strategy.tags.map(t => (
          <span
            key={t}
            className="px-1.5 py-0.5 text-[10px] uppercase tracking-wider rounded bg-surface border border-border text-text-muted"
          >
            {t}
          </span>
        ))}
      </div>

      <div className="flex items-center gap-1.5 mb-3 text-[10px]">
        <span className="text-text-muted uppercase tracking-wider">Watches</span>
        <div className="flex flex-wrap gap-1">
          {bot.allowedSources.length === 0 ? (
            <span className="px-1.5 py-0.5 rounded bg-surface border border-border text-text-secondary">any source</span>
          ) : bot.allowedSources.map(src => (
            <span
              key={src}
              className="px-1.5 py-0.5 rounded bg-accent-dim text-accent capitalize"
            >
              {src}
            </span>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-1.5 mb-3 text-[10px]">
        <Stat label="Hold" value={`${bot.holdMinutes}m`} />
        <Stat label="Size" value={`$${bot.positionSizeUsd}`} />
        <Stat label="Min conf" value={`${Math.round(bot.minConfidence * 100)}%`} />
      </div>

      {performance && (
        <div className="text-[10px] text-text-muted mb-3">
          Tracked since {performance.since}
        </div>
      )}

      <button
        onClick={onInstall}
        disabled={installed}
        className={cn(
          'w-full py-2 text-xs font-semibold rounded-md transition-colors flex items-center justify-center gap-1.5',
          installed
            ? 'bg-long/15 text-long cursor-default'
            : 'bg-accent text-white hover:bg-accent/90 cursor-pointer',
        )}
      >
        {installed ? <Check className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
        {installed ? 'Added to your bots' : 'Add to my bots'}
      </button>
    </article>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-surface/60 rounded px-2 py-1 border border-border/60">
      <div className="text-text-muted uppercase tracking-wider">{label}</div>
      <div className="font-mono text-text-primary tabular-nums">{value}</div>
    </div>
  )
}
