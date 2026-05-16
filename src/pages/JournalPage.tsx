/**
 * JournalPage — chronological list of every annotated trade.
 *
 * The pro habit: at the end of each week, scroll through losing
 * trades, find recurring tags, identify the pattern. This page is
 * the surface for that ritual. Notes + tags + 0-5 rating per trade,
 * sortable by rating or date, filterable by tag.
 *
 * Entries are saved per-trade-id; if the bot ledger is cleared the
 * orphan entries stay — they're still a record of what was learned.
 */

import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, BookOpen, Star } from 'lucide-react'
import { useDocumentMeta } from '../lib/documentMeta'
import { useJournalStore, type JournalEntry } from '../store/journalStore'
import { useBotStore } from '../store/botStore'
import { EmptyState } from '../components/ui/EmptyState'
import { JournalEntryEditor } from '../components/JournalEntryEditor'
import { cn } from '../lib/format'
import type { BotTrade } from '../bots/types'

type SortKey = 'newest' | 'rating' | 'pnl'

interface Joined {
  entry: JournalEntry
  trade: BotTrade | undefined
}

export function JournalPage() {
  useDocumentMeta({
    title: 'TradingDek — Journal',
    description: 'Per-trade annotations and weekly review.',
    canonical: '/journal',
  })

  const entries = useJournalStore(s => s.entries)
  const trades = useBotStore(s => s.trades)
  const tradeById = useMemo(() => new Map(trades.map(t => [t.id, t])), [trades])

  const [sortKey, setSortKey] = useState<SortKey>('newest')
  const [tagFilter, setTagFilter] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)

  const joined: Joined[] = useMemo(() => {
    return Object.values(entries).map(e => ({ entry: e, trade: tradeById.get(e.tradeId) }))
  }, [entries, tradeById])

  const allTags = useMemo(() => {
    const counts = new Map<string, number>()
    for (const e of Object.values(entries)) {
      for (const t of e.tags) counts.set(t, (counts.get(t) ?? 0) + 1)
    }
    return Array.from(counts.entries()).sort((a, b) => b[1] - a[1])
  }, [entries])

  const filteredSorted = useMemo(() => {
    let arr = joined
    if (tagFilter) arr = arr.filter(j => j.entry.tags.includes(tagFilter))
    const sorted = [...arr]
    if (sortKey === 'rating') {
      sorted.sort((a, b) => (b.entry.rating - a.entry.rating) || (b.entry.updatedAt - a.entry.updatedAt))
    } else if (sortKey === 'pnl') {
      sorted.sort((a, b) => (b.trade?.pnlUsd ?? 0) - (a.trade?.pnlUsd ?? 0))
    } else {
      sorted.sort((a, b) => b.entry.updatedAt - a.entry.updatedAt)
    }
    return sorted
  }, [joined, sortKey, tagFilter])

  return (
    <div className="h-full overflow-y-auto bg-surface text-text-primary">
      <section className="max-w-4xl mx-auto px-4 md:px-8 py-6 space-y-5">
        <header className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-xl font-semibold flex items-center gap-2">
              <BookOpen className="w-5 h-5 text-accent" />
              Trade journal
            </h1>
            <p className="text-xs text-text-muted mt-0.5">
              {joined.length} annotated trade{joined.length === 1 ? '' : 's'}. Review weekly — look for recurring tags.
            </p>
          </div>
          <Link
            to="/bots"
            className="flex items-center gap-1.5 text-xs text-text-secondary hover:text-text-primary border border-border hover:border-accent/40 rounded-md px-2.5 py-1.5 transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Bots
          </Link>
        </header>

        {joined.length === 0 ? (
          <EmptyState
            density="spacious"
            title="No annotated trades yet"
            description="Open a closed trade on the Bots page and tap 'Annotate' to add notes and tags. Pros review their journal at the end of every week."
          />
        ) : (
          <>
            {allTags.length > 0 && (
              <div className="flex items-center gap-1.5 flex-wrap text-[11px]">
                <span className="text-text-muted font-mono uppercase tracking-wider mr-1">Tags:</span>
                <button
                  onClick={() => setTagFilter(null)}
                  className={cn(
                    'px-2 py-0.5 rounded border transition-colors cursor-pointer',
                    tagFilter === null ? 'border-accent/40 bg-accent-dim/30 text-accent' : 'border-border text-text-muted hover:text-text-primary',
                  )}
                >
                  All
                </button>
                {allTags.map(([tag, count]) => (
                  <button
                    key={tag}
                    onClick={() => setTagFilter(tagFilter === tag ? null : tag)}
                    className={cn(
                      'px-2 py-0.5 rounded border transition-colors cursor-pointer font-mono',
                      tagFilter === tag ? 'border-accent/40 bg-accent-dim/30 text-accent' : 'border-border text-text-secondary hover:text-text-primary',
                    )}
                  >
                    {tag}
                    <span className="opacity-60 ml-1">{count}</span>
                  </button>
                ))}
              </div>
            )}

            <div className="flex items-center gap-2 text-[11px]">
              <span className="text-text-muted font-mono uppercase tracking-wider">Sort:</span>
              {(['newest', 'rating', 'pnl'] as const).map(s => (
                <button
                  key={s}
                  onClick={() => setSortKey(s)}
                  className={cn(
                    'px-2 py-0.5 rounded transition-colors cursor-pointer',
                    sortKey === s ? 'text-accent' : 'text-text-muted hover:text-text-primary',
                  )}
                >
                  {s === 'newest' ? 'Newest' : s === 'rating' ? 'Rating' : 'P&L'}
                </button>
              ))}
            </div>

            <div className="space-y-2">
              {filteredSorted.map(({ entry, trade }) => (
                <JournalRow
                  key={entry.tradeId}
                  entry={entry}
                  trade={trade}
                  onEdit={() => setEditingId(entry.tradeId)}
                />
              ))}
            </div>
          </>
        )}
      </section>

      {editingId && (
        <JournalEntryEditor
          tradeId={editingId}
          trade={tradeById.get(editingId)}
          onClose={() => setEditingId(null)}
        />
      )}
    </div>
  )
}

function JournalRow({ entry, trade, onEdit }: { entry: JournalEntry; trade: BotTrade | undefined; onEdit: () => void }) {
  const pnl = trade?.pnlUsd ?? 0
  const pnlClass = pnl > 0 ? 'text-long' : pnl < 0 ? 'text-short' : 'text-text-muted'
  const updatedAt = new Date(entry.updatedAt)
  return (
    <button
      onClick={onEdit}
      className="w-full text-left rounded-lg border border-border bg-panel/30 hover:bg-panel/60 hover:border-accent/30 transition-colors p-3"
    >
      <div className="flex items-baseline justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          {trade ? (
            <>
              <span className={cn('text-xs font-mono uppercase font-semibold',
                trade.direction === 'long' ? 'text-long' : 'text-short')}>
                {trade.direction}
              </span>
              <span className="text-xs font-mono text-text-primary truncate">{trade.marketId}</span>
              <span className={cn('text-xs font-mono tabular-nums', pnlClass)}>
                {pnl >= 0 ? '+' : ''}${pnl.toFixed(2)}
              </span>
              {trade.exitReason && (
                <span className="text-[10px] font-mono uppercase tracking-wider text-text-muted">
                  · {trade.exitReason.replace('_', ' ')}
                </span>
              )}
            </>
          ) : (
            <span className="text-xs font-mono text-text-muted italic">(orphan — trade was cleared)</span>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {entry.rating > 0 && <RatingStars rating={entry.rating} small />}
          <span className="text-[10px] font-mono text-text-muted">{updatedAt.toLocaleDateString()}</span>
        </div>
      </div>
      {entry.note && (
        <div className="text-[11px] text-text-secondary mt-1.5 line-clamp-3 leading-relaxed">
          {entry.note}
        </div>
      )}
      {entry.tags.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-2">
          {entry.tags.map(t => (
            <span key={t} className="text-[10px] font-mono text-text-muted bg-surface px-1.5 py-0.5 rounded">
              {t}
            </span>
          ))}
        </div>
      )}
    </button>
  )
}

function RatingStars({ rating, small }: { rating: number; small?: boolean }) {
  const sz = small ? 'w-3 h-3' : 'w-3.5 h-3.5'
  return (
    <span className="inline-flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map(n => (
        <Star
          key={n}
          className={cn(sz, n <= rating ? 'fill-amber-300 text-amber-300' : 'text-text-muted')}
        />
      ))}
    </span>
  )
}
