/**
 * JournalEntryEditor — modal for annotating a single trade.
 *
 * Free-form note, comma-separated tags, 0-5 star rating. Saving with
 * everything empty deletes the entry (handled inside the store).
 *
 * Used from JournalPage (edit existing) and BotCard (annotate a closed
 * trade for the first time). Both surfaces pass the trade row so the
 * editor can render context (market, direction, PnL) above the form.
 */

import { useEffect, useState } from 'react'
import { Star, Trash2 } from 'lucide-react'
import { Modal } from './ui/Modal'
import { useJournalStore } from '../store/journalStore'
import { cn } from '../lib/format'
import type { BotTrade } from '../bots/types'

interface Props {
  tradeId: string
  trade: BotTrade | undefined
  onClose: () => void
}

export function JournalEntryEditor({ tradeId, trade, onClose }: Props) {
  const existing = useJournalStore(s => s.entries[tradeId])
  const setEntry = useJournalStore(s => s.setEntry)
  const removeEntry = useJournalStore(s => s.removeEntry)

  const [note, setNote] = useState(existing?.note ?? '')
  const [tagsInput, setTagsInput] = useState((existing?.tags ?? []).join(', '))
  const [rating, setRating] = useState(existing?.rating ?? 0)

  // Sync if the editor is reused without unmount (e.g. different tradeId).
  useEffect(() => {
    setNote(existing?.note ?? '')
    setTagsInput((existing?.tags ?? []).join(', '))
    setRating(existing?.rating ?? 0)
  }, [tradeId, existing])

  const handleSave = () => {
    const tags = tagsInput.split(',').map(t => t.trim()).filter(Boolean)
    setEntry(tradeId, { note: note.trim(), tags, rating })
    onClose()
  }

  const handleDelete = () => {
    if (!confirm('Delete this journal entry?')) return
    removeEntry(tradeId)
    onClose()
  }

  return (
    <Modal open onClose={onClose} title="Trade journal" maxWidth="max-w-md">
      <div className="p-4 space-y-3">
        {trade && (
          <div className="rounded-md border border-border bg-panel/40 px-3 py-2 text-[11px] font-mono">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className={cn('uppercase font-semibold',
                  trade.direction === 'long' ? 'text-long' : 'text-short')}>
                  {trade.direction}
                </span>
                <span className="text-text-primary">{trade.marketId}</span>
                {trade.exitReason && (
                  <span className="text-text-muted uppercase tracking-wider text-[9px]">
                    · {trade.exitReason.replace('_', ' ')}
                  </span>
                )}
              </div>
              <span className={cn('tabular-nums font-semibold',
                (trade.pnlUsd ?? 0) > 0 ? 'text-long' : (trade.pnlUsd ?? 0) < 0 ? 'text-short' : 'text-text-muted')}>
                {(trade.pnlUsd ?? 0) >= 0 ? '+' : ''}${(trade.pnlUsd ?? 0).toFixed(2)}
              </span>
            </div>
            <div className="text-[10px] text-text-muted mt-0.5">
              Entry ${trade.entryPrice.toFixed(4)}
              {trade.closePrice && ` → close $${trade.closePrice.toFixed(4)}`}
            </div>
          </div>
        )}

        <div>
          <label className="block text-[10px] text-text-muted uppercase tracking-wider mb-1">Notes</label>
          <textarea
            value={note}
            onChange={e => setNote(e.target.value)}
            placeholder="What went right or wrong? Would you take this trade again?"
            rows={5}
            className="w-full bg-panel border border-border rounded px-2 py-1.5 text-xs text-text-primary outline-none focus:border-accent resize-none leading-relaxed"
          />
        </div>

        <div>
          <label className="block text-[10px] text-text-muted uppercase tracking-wider mb-1">
            Tags (comma-separated)
          </label>
          <input
            type="text"
            value={tagsInput}
            onChange={e => setTagsInput(e.target.value)}
            placeholder="regime-fade, news-driven, fomo, overconfident"
            className="w-full bg-panel border border-border rounded px-2 py-1.5 text-xs text-text-primary outline-none focus:border-accent font-mono"
          />
        </div>

        <div>
          <label className="block text-[10px] text-text-muted uppercase tracking-wider mb-1">
            Quality rating ({rating > 0 ? `${rating}/5` : 'unrated'})
          </label>
          <div className="flex items-center gap-1">
            {[1, 2, 3, 4, 5].map(n => (
              <button
                key={n}
                type="button"
                onClick={() => setRating(rating === n ? 0 : n)}
                className="cursor-pointer"
                title={`${n} star${n === 1 ? '' : 's'}`}
              >
                <Star className={cn('w-5 h-5 transition-colors',
                  n <= rating ? 'fill-amber-300 text-amber-300' : 'text-text-muted hover:text-amber-300/60')} />
              </button>
            ))}
          </div>
        </div>

        <div className="flex justify-between items-center pt-2">
          {existing ? (
            <button
              type="button"
              onClick={handleDelete}
              className="flex items-center gap-1 text-[11px] text-text-muted hover:text-short transition-colors cursor-pointer"
            >
              <Trash2 className="w-3 h-3" />
              Delete entry
            </button>
          ) : <span />}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider rounded-md bg-surface text-text-muted border border-border hover:text-text-primary cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              className="px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider rounded-md bg-accent text-white hover:bg-accent/90 cursor-pointer"
            >
              Save
            </button>
          </div>
        </div>
      </div>
    </Modal>
  )
}
