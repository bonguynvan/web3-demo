/**
 * AuthorProfilePage — public profile for a marketplace publisher.
 *
 * Standalone page (no AppShell) at /author/:handle. Aggregates every
 * strategy published under that handle, shows author-level stats
 * (total strategies, average win rate across qualifying samples,
 * combined resolved trades), and exposes a Follow button.
 *
 * Useful as the destination when a user clicks an author handle on a
 * strategy card — closes the social loop ("if I like this bot, what
 * else does this person publish?").
 */

import { useMemo } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, BadgeCheck, Heart, ExternalLink } from 'lucide-react'
import { Wordmark } from '../components/ui/Logo'
import { STRATEGY_LIBRARY, type PublishedStrategy } from '../strategies/library'
import { useFollowStore } from '../store/followStore'
import { useBotStore } from '../store/botStore'
import { useToast } from '../store/toastStore'
import { cn } from '../lib/format'

export function AuthorProfilePage() {
  const { handle: rawHandle } = useParams<{ handle: string }>()
  const navigate = useNavigate()
  const toast = useToast()
  const followsAuthor = useFollowStore(s => s.followsAuthor)
  const toggleAuthor = useFollowStore(s => s.toggleAuthor)
  const followsStrategy = useFollowStore(s => s.followsStrategy)
  const toggleStrategy = useFollowStore(s => s.toggleStrategy)
  const addBot = useBotStore(s => s.addBot)
  const existingBotNames = useBotStore(s => new Set(s.bots.map(b => b.name)))

  // The route handle arrives without the leading @ since it lives in a
  // URL segment; normalise both ways so links from cards and direct
  // visits both work.
  const normalised = (rawHandle ?? '').replace(/^@/, '')
  const candidateHandle = `@${normalised}`

  const strategies = useMemo(() => {
    return STRATEGY_LIBRARY.filter(s =>
      (s.author.handle ?? '').toLowerCase() === candidateHandle.toLowerCase(),
    )
  }, [candidateHandle])

  const author = strategies[0]?.author
  const isFollowed = followsAuthor(candidateHandle)

  const stats = useMemo(() => computeStats(strategies), [strategies])

  const install = (s: PublishedStrategy) => {
    if (existingBotNames.has(s.bot.name)) {
      toast.info('Already added', `${s.name} is in your bots`)
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

  if (!author) {
    return <UnknownAuthor handle={candidateHandle} onBack={() => navigate('/library')} />
  }

  return (
    <div className="min-h-screen bg-surface text-text-primary overflow-y-auto">
      <header className="border-b border-border bg-panel/60 backdrop-blur sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between gap-4">
          <Link to="/" className="hover:opacity-80 transition-opacity">
            <Wordmark size="sm" />
          </Link>
          <Link
            to="/library"
            className="flex items-center gap-1.5 text-xs text-text-muted hover:text-text-primary transition-colors"
          >
            <ArrowLeft className="w-3 h-3" />
            Marketplace
          </Link>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-10 space-y-10">
        <section className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <div className="flex items-center gap-2 text-text-muted text-[11px] uppercase tracking-[0.18em] font-mono mb-2">
              Author profile
            </div>
            <h1 className="text-3xl md:text-4xl font-bold tracking-tight">{author.name}</h1>
            {author.handle && (
              <div className="text-sm text-text-secondary mt-1">{author.handle}</div>
            )}
          </div>
          <button
            onClick={() => toggleAuthor(candidateHandle)}
            className={cn(
              'flex items-center gap-1.5 px-4 py-2 rounded-md text-xs font-mono uppercase tracking-[0.16em] transition-colors cursor-pointer',
              isFollowed
                ? 'bg-accent text-surface hover:opacity-90'
                : 'bg-panel border border-accent/40 text-accent hover:bg-accent-dim/30',
            )}
          >
            <Heart className={cn('w-3.5 h-3.5', isFollowed && 'fill-surface')} />
            {isFollowed ? 'Following' : 'Follow'}
          </button>
        </section>

        <section className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Stat label="Strategies" value={stats.totalStrategies.toString()} />
          <Stat label="Curated" value={stats.curated.toString()} hint="vetted by team" />
          <Stat
            label="Avg win rate"
            value={stats.qualifiedSampleCount === 0 ? '—' : `${(stats.avgWinRate * 100).toFixed(0)}%`}
            hint={stats.qualifiedSampleCount === 0 ? 'no qualifying samples' : `over ${stats.qualifiedStrategies} bots`}
            tone={stats.qualifiedSampleCount > 0 ? (stats.avgWinRate >= 0.55 ? 'long' : 'neutral') : 'neutral'}
          />
          <Stat
            label="Resolved trades"
            value={stats.totalResolved.toString()}
            hint="across all strategies"
          />
        </section>

        <section>
          <h2 className="text-[11px] uppercase tracking-[0.18em] font-mono font-semibold text-text-secondary mb-3">
            Strategies
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {strategies.map(s => {
              const installed = existingBotNames.has(s.bot.name)
              const followed = followsStrategy(s.id)
              return (
                <article
                  key={s.id}
                  className="bg-panel border border-border rounded-lg p-4"
                >
                  <header className="flex items-start justify-between gap-2 mb-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <h3 className="text-sm font-semibold text-text-primary truncate">{s.name}</h3>
                        {(s.kind ?? 'curated') === 'curated' ? (
                          <BadgeCheck className="w-3.5 h-3.5 text-accent shrink-0" />
                        ) : (
                          <span className="text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-surface border border-border text-text-muted">
                            Community
                          </span>
                        )}
                      </div>
                      {s.publishedAt && (
                        <div className="text-[10px] text-text-muted mt-0.5">
                          Published {s.publishedAt}
                        </div>
                      )}
                    </div>
                    <button
                      onClick={() => toggleStrategy(s.id)}
                      title={followed ? 'Unfollow' : 'Follow'}
                      className={cn(
                        'flex items-center justify-center w-7 h-7 rounded transition-colors cursor-pointer',
                        followed
                          ? 'text-accent hover:bg-accent-dim/30'
                          : 'text-text-muted hover:text-text-primary hover:bg-panel-light',
                      )}
                    >
                      <Heart className={cn('w-3.5 h-3.5', followed && 'fill-accent')} />
                    </button>
                  </header>

                  <p className="text-xs text-text-secondary leading-relaxed mb-3 line-clamp-3">
                    {s.summary}
                  </p>

                  <div className="flex flex-wrap gap-1 mb-3">
                    {s.tags.map(t => (
                      <span
                        key={t}
                        className="px-1.5 py-0.5 text-[9px] uppercase tracking-wider rounded bg-surface border border-border text-text-muted"
                      >
                        {t}
                      </span>
                    ))}
                  </div>

                  {s.performance && (
                    <div className="flex items-center justify-between text-[11px] mb-3">
                      <span className="text-text-muted">{s.performance.sample} resolved</span>
                      <span className={cn(
                        'font-mono tabular-nums font-semibold',
                        s.performance.winRate >= 0.55 ? 'text-long' : 'text-text-secondary',
                      )}>
                        {Math.round(s.performance.winRate * 100)}%
                      </span>
                    </div>
                  )}

                  <button
                    onClick={() => install(s)}
                    disabled={installed}
                    className={cn(
                      'w-full py-1.5 text-[11px] font-semibold rounded transition-colors',
                      installed
                        ? 'bg-long/15 text-long cursor-default'
                        : 'bg-accent text-surface hover:opacity-90 cursor-pointer',
                    )}
                  >
                    {installed ? 'Already added' : 'Add to my bots'}
                  </button>
                </article>
              )
            })}
          </div>
        </section>

        <section className="border-t border-border pt-6 flex items-center justify-between gap-4 flex-wrap text-[11px]">
          <Link
            to="/library"
            className="flex items-center gap-1.5 text-text-muted hover:text-text-primary transition-colors"
          >
            <ArrowLeft className="w-3 h-3" />
            Back to marketplace
          </Link>
          <Link
            to="/proof"
            className="flex items-center gap-1.5 text-accent hover:underline font-mono uppercase tracking-[0.16em]"
          >
            See public track record
            <ExternalLink className="w-3 h-3" />
          </Link>
        </section>
      </main>
    </div>
  )
}

function Stat({
  label, value, hint, tone = 'neutral',
}: {
  label: string
  value: string
  hint?: string
  tone?: 'long' | 'short' | 'neutral'
}) {
  const toneClass = tone === 'long' ? 'text-long' : tone === 'short' ? 'text-short' : 'text-text-primary'
  return (
    <div className="rounded-lg border border-border bg-panel/40 px-4 py-3">
      <div className="text-[10px] uppercase tracking-[0.18em] text-text-muted font-mono mb-1">{label}</div>
      <div className={cn('text-2xl font-mono font-semibold tabular-nums', toneClass)}>{value}</div>
      {hint && <div className="text-[10px] text-text-muted mt-0.5">{hint}</div>}
    </div>
  )
}

interface AuthorStats {
  totalStrategies: number
  curated: number
  avgWinRate: number
  qualifiedSampleCount: number
  qualifiedStrategies: number
  totalResolved: number
}

const QUALIFY_MIN_SAMPLE = 3

function computeStats(strategies: PublishedStrategy[]): AuthorStats {
  let curated = 0
  let totalResolved = 0
  let weightedWinRate = 0
  let qualifiedSampleCount = 0
  let qualifiedStrategies = 0

  for (const s of strategies) {
    if ((s.kind ?? 'curated') === 'curated') curated += 1
    if (s.performance) {
      totalResolved += s.performance.sample
      if (s.performance.sample >= QUALIFY_MIN_SAMPLE) {
        weightedWinRate += s.performance.winRate * s.performance.sample
        qualifiedSampleCount += s.performance.sample
        qualifiedStrategies += 1
      }
    }
  }

  return {
    totalStrategies: strategies.length,
    curated,
    avgWinRate: qualifiedSampleCount > 0 ? weightedWinRate / qualifiedSampleCount : 0,
    qualifiedSampleCount,
    qualifiedStrategies,
    totalResolved,
  }
}

function UnknownAuthor({ handle, onBack }: { handle: string; onBack: () => void }) {
  return (
    <div className="min-h-screen bg-surface text-text-primary flex flex-col items-center justify-center px-6 text-center gap-4">
      <Wordmark size="sm" />
      <h1 className="text-2xl font-bold">No author called {handle}</h1>
      <p className="text-sm text-text-secondary max-w-sm">
        Either this handle hasn't published yet, or the link's stale.
        Browse the marketplace to find current authors.
      </p>
      <button
        onClick={onBack}
        className="flex items-center gap-1.5 px-4 py-2 rounded-md bg-accent text-surface text-xs font-semibold uppercase tracking-[0.16em] hover:opacity-90 transition-opacity cursor-pointer"
      >
        <ArrowLeft className="w-3 h-3" />
        Marketplace
      </button>
    </div>
  )
}
