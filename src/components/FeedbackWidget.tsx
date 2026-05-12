/**
 * FeedbackWidget — bottom-left floating button that opens a tiny modal
 * with a pre-filled mailto: link. Picks up the current route and
 * browser as context so a bug report arrives with the boilerplate
 * already written.
 *
 * Mounted globally in AppShell so users on any workstation surface
 * can flag an issue in two clicks. Target email is configurable via
 * VITE_FEEDBACK_EMAIL with a sensible default.
 *
 * Intentionally minimal — when a real backend ships, this becomes a
 * POST to /api/feedback. Until then mailto: is the lowest-friction
 * channel that doesn't require us to operate an inbox-on-our-side.
 */

import { useState } from 'react'
import { MessageCircle, X, ExternalLink } from 'lucide-react'
import { Modal } from './ui/Modal'
import { getShortDeviceId } from '../store/deviceIdStore'

const FEEDBACK_EMAIL =
  (import.meta.env.VITE_FEEDBACK_EMAIL as string | undefined) ?? 'feedback@tradingdek.com'

export function FeedbackWidget() {
  const [open, setOpen] = useState(false)

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        title="Send feedback"
        aria-label="Send feedback"
        className="fixed bottom-4 left-4 z-40 flex items-center justify-center w-10 h-10 rounded-full bg-accent text-surface shadow-lg shadow-accent/30 hover:opacity-90 transition-opacity cursor-pointer"
      >
        <MessageCircle className="w-4 h-4" />
      </button>

      <FeedbackModal open={open} onClose={() => setOpen(false)} />
    </>
  )
}

function FeedbackModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [kind, setKind] = useState<'bug' | 'idea' | 'praise'>('bug')

  const subject = encodeURIComponent(
    kind === 'bug' ? '[TradingDek] Bug report'
    : kind === 'idea' ? '[TradingDek] Feature suggestion'
    : '[TradingDek] Feedback',
  )

  const ctx = [
    '',
    '---',
    `Route:    ${typeof window !== 'undefined' ? window.location.pathname : '/'}`,
    `Device:   ${getShortDeviceId()}`,
    `When:     ${new Date().toISOString()}`,
    `Browser:  ${typeof navigator !== 'undefined' ? navigator.userAgent : 'unknown'}`,
  ].join('\n')

  const body = encodeURIComponent(
    kind === 'bug'
      ? `What were you doing?\n\nWhat happened?\n\nWhat did you expect?\n${ctx}`
      : kind === 'idea'
        ? `Suggestion:\n\nWhy it would matter:\n${ctx}`
        : `\n${ctx}`,
  )

  const mailto = `mailto:${FEEDBACK_EMAIL}?subject=${subject}&body=${body}`

  return (
    <Modal open={open} onClose={onClose} title="Send feedback" maxWidth="max-w-md">
      <div className="p-4 space-y-4">
        <p className="text-sm text-text-secondary leading-relaxed">
          Hit a bug, have an idea, or just want to say it works? Pick a type
          and we'll open your mail client with the route and browser already
          filled in so you don't have to type the boilerplate.
        </p>

        <div className="grid grid-cols-3 gap-2">
          {(['bug', 'idea', 'praise'] as const).map(k => (
            <button
              key={k}
              onClick={() => setKind(k)}
              className={
                'py-2 text-xs font-semibold uppercase tracking-[0.14em] rounded-md transition-colors cursor-pointer ' +
                (kind === k
                  ? 'bg-accent text-surface'
                  : 'bg-surface border border-border text-text-secondary hover:text-text-primary')
              }
            >
              {k}
            </button>
          ))}
        </div>

        <div className="text-[10px] text-text-muted bg-surface/60 border border-border rounded px-2 py-1.5 font-mono leading-relaxed">
          We don't read your secret keys, watchlist, or browsing history.
          The email includes only the route you're on, your device id
          (anonymous), the timestamp, and your browser UA — same context a
          server log would capture.
        </div>

        <div className="flex justify-between items-center gap-2 pt-2">
          <button
            onClick={onClose}
            className="px-3 py-2 text-xs font-semibold rounded-md bg-surface border border-border text-text-secondary hover:text-text-primary transition-colors cursor-pointer flex items-center gap-1"
          >
            <X className="w-3 h-3" />
            Cancel
          </button>
          <a
            href={mailto}
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold rounded-md bg-accent text-surface hover:opacity-90 transition-opacity cursor-pointer flex items-center gap-1"
          >
            Open mail client
            <ExternalLink className="w-3 h-3" />
          </a>
        </div>
      </div>
    </Modal>
  )
}
