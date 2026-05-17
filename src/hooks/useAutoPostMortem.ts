/**
 * useAutoPostMortem — write a 2-sentence Claude analysis into the
 * trade journal whenever a bot closes a position.
 *
 * Opt-in via journalStore.autoPostMortemEnabled. Pro-gated server-side
 * (the /api/ai/postmortem endpoint returns 402 if the user isn't Pro).
 *
 * Implementation notes:
 *   - Tracks trade ids we've already processed in a ref so we don't
 *     re-fire on store re-renders.
 *   - Primes the cache on first mount so existing closed trades don't
 *     all stream post-mortems at once.
 *   - Skips trades that already have a journal entry (user wrote their
 *     own first — don't overwrite).
 */

import { useEffect, useRef } from 'react'
import { useBotStore } from '../store/botStore'
import { useJournalStore } from '../store/journalStore'
import { postMortemStreaming } from '../api/ai'
import type { BotTrade, BotConfig } from '../bots/types'

export function useAutoPostMortem(): void {
  const trades = useBotStore(s => s.trades)
  const bots = useBotStore(s => s.bots)
  const enabled = useJournalStore(s => s.autoPostMortemEnabled)
  const entries = useJournalStore(s => s.entries)
  const setEntry = useJournalStore(s => s.setEntry)

  // Trade ids we've already kicked off a post-mortem for (success or fail).
  const processedRef = useRef<Set<string>>(new Set())
  const primedRef = useRef(false)

  useEffect(() => {
    if (!enabled) {
      // Refresh the snapshot so re-enabling doesn't dump old trades.
      processedRef.current = new Set(trades.filter(t => t.closedAt).map(t => t.id))
      primedRef.current = true
      return
    }
    if (!primedRef.current) {
      processedRef.current = new Set(trades.filter(t => t.closedAt).map(t => t.id))
      primedRef.current = true
      return
    }

    const botById = new Map(bots.map(b => [b.id, b]))
    for (const t of trades) {
      if (!t.closedAt) continue
      if (processedRef.current.has(t.id)) continue
      if (entries[t.id]) {
        // User already wrote their own — respect that.
        processedRef.current.add(t.id)
        continue
      }
      processedRef.current.add(t.id)
      streamPostMortem(t, botById.get(t.botId), setEntry)
    }
  }, [trades, bots, enabled, entries, setEntry])
}

function streamPostMortem(
  t: BotTrade,
  bot: BotConfig | undefined,
  setEntry: ReturnType<typeof useJournalStore.getState>['setEntry'],
): void {
  const holdMin = t.closedAt && t.openedAt
    ? Math.max(1, Math.round((t.closedAt - t.openedAt) / 60_000))
    : 0
  let buffer = ''
  postMortemStreaming(
    {
      bot_name: bot?.name ?? 'Bot',
      market_id: t.marketId,
      source: t.signalId.split(':')[0] || 'unknown',
      direction: t.direction,
      entry_price: t.entryPrice,
      close_price: t.closePrice ?? t.entryPrice,
      pnl_usd: t.pnlUsd ?? 0,
      exit_reason: t.exitReason ?? 'hold_expired',
      hold_minutes: holdMin,
    },
    {
      onChunk: (chunk) => { buffer += chunk },
      onDone: (full) => {
        const note = (full || buffer).trim()
        if (!note) return
        setEntry(t.id, {
          note,
          tags: ['auto-post-mortem'],
        })
      },
      // Stay quiet on errors — don't toast the user on every Pro 402.
      // The journal page can surface "X trades skipped (rate limit)"
      // in a future pass if needed.
      onError: () => { /* silent */ },
    },
  )
}
