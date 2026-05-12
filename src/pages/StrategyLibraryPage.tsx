/**
 * StrategyLibraryPage — curated strategies users can install with one click.
 *
 * MVP for the social/marketplace direction. Strategies are venue-agnostic:
 * each one defines its filters via `allowedSources` and `allowedMarkets`,
 * and runs against whatever VenueAdapter the user has active.
 */

import { useState } from 'react'
import { Link } from 'react-router-dom'
import { BookOpen, Plus, Check, Search, Heart, BadgeCheck, Upload } from 'lucide-react'
import { useBotStore } from '../store/botStore'
import { useToast } from '../store/toastStore'
import { useFollowStore } from '../store/followStore'
import { useActiveVenue } from '../hooks/useActiveVenue'
import { setActiveVenue } from '../adapters/registry'
import { STRATEGY_LIBRARY, type PublishedStrategy } from '../strategies/library'
import { cn } from '../lib/format'
import { Modal } from '../components/ui/Modal'

export function StrategyLibraryPage() {
  const addBot = useBotStore(s => s.addBot)
  const bots = useBotStore(s => s.bots)
  const existingBotNames = new Set(bots.map(b => b.name))
  // For each strategy already installed, look up the matching bot's
  // createdAt so we can show "Recently added" sorted newest first.
  const createdAtByName = new Map(bots.map(b => [b.name, b.createdAt]))
  const toast = useToast()
  const followsStrategy = useFollowStore(s => s.followsStrategy)
  const toggleStrategy = useFollowStore(s => s.toggleStrategy)
  const followedStrategyIds = useFollowStore(s => s.strategies)
  const [filterTag, setFilterTag] = useState<string>('')
  const [query, setQuery] = useState<string>('')
  const [detail, setDetail] = useState<PublishedStrategy | null>(null)
  const [sortBy, setSortBy] = useState<'curated' | 'winrate' | 'sample' | 'name'>('curated')
  const [kindFilter, setKindFilter] = useState<'all' | 'curated' | 'community' | 'following'>('all')
  const [publishOpen, setPublishOpen] = useState(false)

  const venueId = useActiveVenue()
  // Today: hyperliquid = perp, binance = spot. Future venue adapters
  // should be added here (or this should switch to a per-adapter
  // capability flag once VenueAdapter exposes one synchronously).
  const activeHasPerps = venueId === 'hyperliquid'

  const allTags = Array.from(new Set(STRATEGY_LIBRARY.flatMap(s => s.tags))).sort()
  const q = query.trim().toLowerCase()
  const filtered = STRATEGY_LIBRARY.filter(s => {
    const kind = s.kind ?? 'curated'
    if (kindFilter === 'curated' && kind !== 'curated') return false
    if (kindFilter === 'community' && kind !== 'community') return false
    if (kindFilter === 'following' && !followedStrategyIds.includes(s.id)) return false
    if (filterTag && !s.tags.includes(filterTag)) return false
    if (q) {
      const hay = `${s.name} ${s.summary} ${s.author.name} ${s.tags.join(' ')}`.toLowerCase()
      if (!hay.includes(q)) return false
    }
    return true
  })

  const kindCounts = {
    all: STRATEGY_LIBRARY.length,
    curated: STRATEGY_LIBRARY.filter(s => (s.kind ?? 'curated') === 'curated').length,
    community: STRATEGY_LIBRARY.filter(s => s.kind === 'community').length,
    following: followedStrategyIds.length,
  }
  const visible = (() => {
    if (sortBy === 'curated') return filtered
    if (sortBy === 'name') return [...filtered].sort((a, b) => a.name.localeCompare(b.name))
    return [...filtered].sort((a, b) => {
      const av = sortBy === 'winrate' ? (a.performance?.winRate ?? -1) : (a.performance?.sample ?? -1)
      const bv = sortBy === 'winrate' ? (b.performance?.winRate ?? -1) : (b.performance?.sample ?? -1)
      return bv - av
    })
  })()

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
        <div className="mb-8 flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-3xl font-bold tracking-tight mb-2">
              Strategy marketplace
            </h1>
            <p className="text-sm text-text-secondary max-w-2xl leading-relaxed">
              Strategies published by the TradingDek team and the community. Each
              runs in paper mode on your active venue, so you can backtest, replay,
              and validate before risking real capital. Past performance is not
              predictive — sample sizes shown.
            </p>
          </div>
          <button
            onClick={() => setPublishOpen(true)}
            className="shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-md border border-accent/40 text-accent text-xs font-mono uppercase tracking-[0.14em] hover:bg-accent-dim/30 transition-colors cursor-pointer"
          >
            <Upload className="w-3.5 h-3.5" />
            Publish
          </button>
        </div>

        <div className="flex items-center gap-1 mb-4 flex-wrap">
          {(['all', 'curated', 'community', 'following'] as const).map(k => (
            <button
              key={k}
              onClick={() => setKindFilter(k)}
              className={cn(
                'flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs uppercase tracking-[0.14em] font-mono transition-colors cursor-pointer',
                kindFilter === k
                  ? 'bg-accent text-surface'
                  : 'bg-panel border border-border text-text-secondary hover:text-text-primary',
              )}
            >
              {k === 'following' && <Heart className="w-3 h-3" />}
              {k}
              <span className={cn(
                'text-[9px] tabular-nums',
                kindFilter === k ? 'text-surface/70' : 'text-text-muted',
              )}>
                {kindCounts[k]}
              </span>
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2 mb-4 max-w-2xl">
          <div className="flex items-center gap-2 flex-1 bg-panel border border-border rounded-md px-3 py-2">
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
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
            title="Sort strategies"
            className="text-xs bg-panel border border-border rounded-md px-2 py-2 text-text-secondary cursor-pointer focus:outline-none focus:border-accent"
          >
            <option value="curated">Curated</option>
            <option value="winrate">Win rate</option>
            <option value="sample">Sample size</option>
            <option value="name">Name (A–Z)</option>
          </select>
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
          <div className="bg-panel/40 border border-border rounded-lg p-8 text-center flex flex-col items-center gap-4">
            <img
              src="/library-empty.png"
              alt=""
              aria-hidden="true"
              loading="lazy"
              onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none' }}
              className="w-32 h-32 opacity-60 object-contain"
            />
            <div className="text-sm text-text-secondary">
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
                  followed={followsStrategy(s.id)}
                  overlapCount={overlapCount}
                  activeHasPerps={activeHasPerps}
                  activeVenueId={venueId}
                  onInstall={() => install(s)}
                  onToggleFollow={() => toggleStrategy(s.id)}
                  onOpenDetail={() => setDetail(s)}
                />
              )
            })}
          </div>
        )}

        <div className="mt-10 p-4 bg-panel/60 border border-border rounded-lg text-[11px] text-text-muted leading-relaxed flex items-start gap-3">
          <Upload className="w-4 h-4 text-accent shrink-0 mt-0.5" />
          <div>
            <div className="text-text-secondary font-medium mb-0.5">Publish your own bot</div>
            Export it as JSON from any bot card, then submit a PR adding it to{' '}
            <code className="text-text-primary bg-surface px-1 rounded">src/strategies/library.ts</code>{' '}
            with <code className="text-text-primary bg-surface px-1 rounded">kind: 'community'</code>.
            Until a backend ships, the team reviews submissions in-repo so authorship and
            performance numbers are version-controlled.
          </div>
        </div>
      </section>

      <StrategyDetailModal
        strategy={detail}
        installed={detail ? existingBotNames.has(detail.bot.name) : false}
        onClose={() => setDetail(null)}
        onInstall={() => {
          if (detail) {
            install(detail)
            setDetail(null)
          }
        }}
      />

      <PublishGuideModal open={publishOpen} onClose={() => setPublishOpen(false)} />
    </div>
  )
}

function PublishGuideModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Modal open={open} onClose={onClose} title="Publish your bot" maxWidth="max-w-md">
      <div className="p-4 space-y-3 text-xs leading-relaxed text-text-secondary">
        <p>
          Until the marketplace has a server, publication is a pull request — that
          way authorship, performance numbers, and review history live in version
          control where they can't be silently rewritten.
        </p>
        <ol className="list-decimal ml-4 space-y-1.5 text-[11px]">
          <li>Open the Bots panel, click ⋮ on your bot, choose "Share / export JSON".</li>
          <li>Add a new entry to <code className="text-text-primary bg-surface px-1 rounded">src/strategies/library.ts</code>.
            Set <code className="text-text-primary bg-surface px-1 rounded">kind: 'community'</code>,
            include your handle, and optionally a starting <code className="text-text-primary bg-surface px-1 rounded">performance</code> snapshot.</li>
          <li>Submit a PR. The team verifies the config compiles and the
            performance claim is consistent with public hit-rate data.</li>
          <li>Once merged, your strategy shows up in the Community tab with your
            handle next to it. Followers see new bots from you in the Following tab.</li>
        </ol>
        <div className="pt-3 border-t border-border text-[10px] text-text-muted">
          Curated entries are vetted by the TradingDek team and carry the verified
          badge. Community entries are unverified by default — followers should
          run them in paper mode and read the proof page (<code className="text-text-primary bg-surface px-1 rounded">/proof</code>)
          before enabling live execution.
        </div>
        <div className="flex justify-end pt-2">
          <button
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold rounded-md bg-accent text-surface hover:opacity-90 transition-opacity cursor-pointer"
          >
            Got it
          </button>
        </div>
      </div>
    </Modal>
  )
}

function StrategyDetailModal({
  strategy, installed, onClose, onInstall,
}: {
  strategy: PublishedStrategy | null
  installed: boolean
  onClose: () => void
  onInstall: () => void
}) {
  if (!strategy) return null
  const { bot, performance, author } = strategy
  return (
    <Modal open={!!strategy} onClose={onClose} title={strategy.name} maxWidth="max-w-lg">
      <div className="p-4 space-y-4">
        <div className="text-[11px] text-text-muted">
          by {author.name}
          {author.handle && <span className="ml-1">{author.handle}</span>}
        </div>
        <p className="text-sm text-text-secondary leading-relaxed">{strategy.summary}</p>

        <div className="flex flex-wrap gap-1">
          {strategy.tags.map(t => (
            <span
              key={t}
              className="px-1.5 py-0.5 text-[10px] uppercase tracking-wider rounded bg-surface border border-border text-text-muted"
            >
              {t}
            </span>
          ))}
        </div>

        <div className="border-t border-border pt-3">
          <div className="text-xs font-medium text-text-primary mb-2">Bot configuration</div>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-[11px]">
            <DetailRow label="Mode" value={bot.mode} />
            <DetailRow label="Min confidence" value={`${Math.round(bot.minConfidence * 100)}%`} />
            <DetailRow label="Position size" value={`$${bot.positionSizeUsd}`} />
            <DetailRow label="Hold window" value={`${bot.holdMinutes} min`} />
            <DetailRow label="Daily cap" value={`${bot.maxTradesPerDay} trades`} />
            <DetailRow label="Markets" value={bot.allowedMarkets.length === 0 ? 'any market' : bot.allowedMarkets.join(', ')} />
            <DetailRow
              label="Sources"
              value={bot.allowedSources.length === 0 ? 'any source' : bot.allowedSources.join(', ')}
              span2
            />
          </dl>
        </div>

        {performance && (
          <div className="border-t border-border pt-3">
            <div className="text-xs font-medium text-text-primary mb-2">Performance</div>
            <div className="grid grid-cols-3 gap-2 text-[11px]">
              <DetailStat label="Win rate" value={`${Math.round(performance.winRate * 100)}%`} />
              <DetailStat label="Sample" value={`${performance.sample} trades`} />
              <DetailStat label="Since" value={performance.since} />
            </div>
            <div className="text-[10px] text-text-muted mt-2 leading-relaxed">
              Past performance is not predictive. Paper-traded on the publisher's setup; results
              on your active venue may differ.
            </div>
          </div>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <button
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold rounded-md bg-surface border border-border text-text-secondary hover:text-text-primary hover:bg-panel-light transition-colors cursor-pointer"
          >
            Close
          </button>
          <button
            onClick={onInstall}
            disabled={installed}
            className={cn(
              'px-4 py-2 text-xs font-semibold rounded-md transition-colors',
              installed
                ? 'bg-long/15 text-long cursor-default'
                : 'bg-accent text-white hover:bg-accent/90 cursor-pointer',
            )}
          >
            {installed ? 'Already added' : 'Add to my bots'}
          </button>
        </div>
      </div>
    </Modal>
  )
}

function DetailRow({ label, value, span2 }: { label: string; value: string; span2?: boolean }) {
  return (
    <div className={cn('flex justify-between gap-2', span2 && 'col-span-2')}>
      <span className="text-text-muted">{label}</span>
      <span className="font-mono text-text-primary capitalize text-right truncate">{value}</span>
    </div>
  )
}

function DetailStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-surface/60 rounded px-2 py-1.5 border border-border/60">
      <div className="text-[9px] uppercase tracking-wider text-text-muted">{label}</div>
      <div className="font-mono text-text-primary tabular-nums">{value}</div>
    </div>
  )
}

function StrategyCard({
  strategy, installed, followed, overlapCount, activeHasPerps, activeVenueId, onInstall, onToggleFollow, onOpenDetail,
}: {
  strategy: PublishedStrategy
  installed: boolean
  followed: boolean
  overlapCount: number
  activeHasPerps: boolean
  activeVenueId: string
  onInstall: () => void
  onToggleFollow: () => void
  onOpenDetail: () => void
}) {
  const { bot, performance } = strategy
  const perpOnly = bot.allowedSources.includes('funding')
  const incompatible = perpOnly && !activeHasPerps
  const isCommunity = strategy.kind === 'community'
  return (
    <article
      onClick={onOpenDetail}
      className="bg-panel border border-border rounded-lg p-4 flex flex-col cursor-pointer hover:border-border-light transition-colors"
    >
      <header className="flex items-start justify-between gap-3 mb-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-text-primary truncate">{strategy.name}</h3>
            {!isCommunity && (
              <span title="Curated by the TradingDek team — vetted before publication." className="shrink-0 inline-flex">
                <BadgeCheck className="w-3.5 h-3.5 text-accent" />
              </span>
            )}
            {isCommunity && (
              <span
                title="Community submission — not yet vetted by the team."
                className="shrink-0 text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-surface border border-border text-text-muted"
              >
                Community
              </span>
            )}
            {perpOnly && !incompatible && (
              <span
                title="Requires perp markets (funding rates)."
                className="shrink-0 text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-amber-400/15 text-amber-400"
              >
                Perp
              </span>
            )}
            {incompatible && (
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  setActiveVenue('hyperliquid')
                }}
                title={`This strategy needs perp markets. Active venue (${activeVenueId}) has no perp data. Click to switch to Hyperliquid.`}
                className="shrink-0 text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-short/15 text-short hover:bg-short/25 cursor-pointer transition-colors"
              >
                Switch venue
              </button>
            )}
          </div>
          <div className="text-[11px] text-text-muted">
            by {strategy.author.name}
            {strategy.author.handle && (
              <Link
                to={`/author/${strategy.author.handle.replace(/^@/, '')}`}
                onClick={(e) => e.stopPropagation()}
                className="ml-1 text-accent hover:underline"
              >
                {strategy.author.handle}
              </Link>
            )}
          </div>
        </div>
        <button
          onClick={(e) => { e.stopPropagation(); onToggleFollow() }}
          title={followed ? 'Unfollow' : 'Follow'}
          className={cn(
            'shrink-0 flex items-center justify-center w-7 h-7 rounded transition-colors cursor-pointer',
            followed
              ? 'text-accent hover:bg-accent-dim/30'
              : 'text-text-muted hover:text-text-primary hover:bg-panel-light',
          )}
        >
          <Heart className={cn('w-3.5 h-3.5', followed && 'fill-accent')} />
        </button>
        {performance && (
          <div className="shrink-0 text-right min-w-[64px]">
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

      {performance && (
        <div className="mb-3" aria-hidden>
          <div className="h-1 w-full bg-surface rounded overflow-hidden">
            <div
              className={cn(
                'h-full transition-all',
                performance.winRate >= 0.55 ? 'bg-long' : performance.winRate >= 0.45 ? 'bg-text-muted' : 'bg-short',
              )}
              style={{ width: `${Math.round(performance.winRate * 100)}%` }}
            />
          </div>
        </div>
      )}

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
        onClick={(e) => { e.stopPropagation(); onInstall() }}
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
