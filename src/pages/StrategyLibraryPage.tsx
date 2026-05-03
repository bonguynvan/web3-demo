/**
 * StrategyLibraryPage — curated strategies users can install with one click.
 *
 * MVP for the social/marketplace direction. Strategies are venue-agnostic:
 * each one defines its filters via `allowedSources` and `allowedMarkets`,
 * and runs against whatever VenueAdapter the user has active.
 */

import { useState } from 'react'
import { BookOpen, Plus, Check, Search } from 'lucide-react'
import { useBotStore } from '../store/botStore'
import { useToast } from '../store/toastStore'
import { STRATEGY_LIBRARY, type PublishedStrategy } from '../strategies/library'
import { cn } from '../lib/format'

export function StrategyLibraryPage() {
  const addBot = useBotStore(s => s.addBot)
  const bots = useBotStore(s => s.bots)
  const existingBotNames = new Set(bots.map(b => b.name))
  // For each strategy already installed, look up the matching bot's
  // createdAt so we can show "Recently added" sorted newest first.
  const createdAtByName = new Map(bots.map(b => [b.name, b.createdAt]))
  const toast = useToast()
  const [filterTag, setFilterTag] = useState<string>('')
  const [query, setQuery] = useState<string>('')

  const allTags = Array.from(new Set(STRATEGY_LIBRARY.flatMap(s => s.tags))).sort()
  const q = query.trim().toLowerCase()
  const visible = STRATEGY_LIBRARY.filter(s => {
    if (filterTag && !s.tags.includes(filterTag)) return false
    if (q) {
      const hay = `${s.name} ${s.summary} ${s.author.name} ${s.tags.join(' ')}`.toLowerCase()
      if (!hay.includes(q)) return false
    }
    return true
  })

  const install = (s: PublishedStrategy) => {
    if (existingBotNames.has(s.bot.name)) {
      toast.info(`Already added`, `${s.name} is already in your bots`)
      return
    }
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
    toast.success(`Added ${s.name}`, 'Now running in paper mode on your active venue')
  }

  return (
    <div className="h-full overflow-y-auto bg-surface text-text-primary">
      <section className="max-w-5xl mx-auto px-6 md:px-10 py-8">
        <div className="flex items-center gap-2 mb-6">
          <BookOpen className="w-5 h-5 text-accent" />
          <span className="text-base font-semibold">Strategy library</span>
        </div>
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

        <div className="flex items-center gap-2 mb-4 bg-panel border border-border rounded-md px-3 py-2 max-w-md">
          <Search className="w-4 h-4 text-text-muted shrink-0" />
          <input
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search strategies…"
            className="flex-1 bg-transparent outline-none text-sm text-text-primary placeholder:text-text-muted"
          />
          {query && (
            <button
              onClick={() => setQuery('')}
              className="text-[10px] text-text-muted hover:text-text-primary cursor-pointer"
            >
              clear
            </button>
          )}
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

        {(() => {
          const yours = STRATEGY_LIBRARY
            .filter(s => existingBotNames.has(s.bot.name))
            .map(s => ({ s, ts: createdAtByName.get(s.bot.name) ?? 0 }))
            .sort((a, b) => b.ts - a.ts)
            .slice(0, 4)
            .map(x => x.s)
          if (yours.length === 0) return null
          return (
            <div className="mb-6">
              <div className="text-[10px] uppercase tracking-wider text-text-muted mb-2">Yours</div>
              <div className="flex flex-wrap gap-1.5">
                {yours.map(s => (
                  <span
                    key={s.id}
                    className="px-2 py-1 text-[11px] rounded-full bg-accent-dim text-accent border border-accent/30"
                  >
                    {s.name}
                  </span>
                ))}
              </div>
            </div>
          )
        })()}

        {visible.length === 0 ? (
          <div className="bg-panel/40 border border-border rounded-lg p-8 text-center">
            <div className="text-sm text-text-secondary mb-1">
              No strategies match{query && <> "<span className="font-mono">{query}</span>"</>}
              {query && filterTag && ' in '}
              {filterTag && <> tag "<span className="font-mono">{filterTag}</span>"</>}
            </div>
            <button
              onClick={() => { setFilterTag(''); setQuery('') }}
              className="text-xs text-accent hover:underline cursor-pointer"
            >
              Clear filters
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {visible.map(s => {
              // Bots already running that share at least one signal source
              // with this strategy. Empty allowedSources on a bot means
              // "any source" so it overlaps with everything.
              const overlapCount = bots.filter(b => {
                if (!b.enabled) return false
                if (b.allowedSources.length === 0) return true
                if (s.bot.allowedSources.length === 0) return true
                return b.allowedSources.some(src => s.bot.allowedSources.includes(src))
              }).length
              return (
                <StrategyCard
                  key={s.id}
                  strategy={s}
                  installed={existingBotNames.has(s.bot.name)}
                  overlapCount={overlapCount}
                  onInstall={() => install(s)}
                />
              )
            })}
          </div>
        )}

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
  strategy, installed, overlapCount, onInstall,
}: {
  strategy: PublishedStrategy
  installed: boolean
  overlapCount: number
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

      {overlapCount > 0 && !installed && (
        <div className="text-[10px] text-text-muted mb-3">
          You have {overlapCount} active bot{overlapCount === 1 ? '' : 's'} watching overlapping sources.
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
