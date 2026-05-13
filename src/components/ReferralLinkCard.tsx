/**
 * ReferralLinkCard — surfaces the signed-in user's referral URL so
 * they can actually share it. The capture pipeline already exists
 * (useReferralCapture + ?ref=<userId> → +7 trial days for both
 * sides via siwe.go extendReferrerTrial); this is the missing UI half.
 *
 * Renders nothing unless the backend is configured and the user is
 * signed in — there's no useful referral link without a user id.
 */

import { useState } from 'react'
import { Link2, Check, Twitter } from 'lucide-react'
import { apiAvailable } from '../api/client'
import { useAuthStore } from '../store/authStore'
import { cn } from '../lib/format'

export function ReferralLinkCard({ className }: { className?: string }) {
  const user = useAuthStore(s => s.user)
  const [copied, setCopied] = useState(false)

  if (!apiAvailable() || !user) return null

  const url = typeof window !== 'undefined'
    ? `${window.location.origin}/?ref=${user.id}`
    : `https://tradingdek.com/?ref=${user.id}`

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    } catch {
      window.prompt('Copy this URL:', url)
    }
  }

  const tweetText = encodeURIComponent(
    `I'm using @tradingdek for live signal hit-rates + bots. Free 14-day Pro trial via my link:`,
  )
  const tweetUrl = encodeURIComponent(url)

  return (
    <div className={cn('rounded-lg border border-border bg-panel/40 p-4 space-y-3', className)}>
      <div>
        <div className="text-sm font-semibold text-text-primary flex items-center gap-1.5">
          <Link2 className="w-3.5 h-3.5 text-accent" />
          Refer a friend, both get +7 trial days
        </div>
        <p className="text-[11px] text-text-muted leading-snug mt-1 max-w-md">
          Anyone who signs in via your link adds 7 days to your Pro entitlement
          and gets 7 days added to theirs.
        </p>
      </div>

      <div className="flex items-center gap-2">
        <input
          readOnly
          value={url}
          onClick={(e) => (e.target as HTMLInputElement).select()}
          className="flex-1 min-w-0 bg-surface border border-border rounded px-2.5 py-1.5 text-xs font-mono text-text-primary outline-none focus:border-accent"
        />
        <button
          onClick={handleCopy}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded text-[11px] font-mono uppercase tracking-[0.14em] bg-accent text-surface hover:opacity-90 transition-opacity cursor-pointer"
        >
          {copied ? <Check className="w-3 h-3" /> : <Link2 className="w-3 h-3" />}
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>

      <a
        href={`https://twitter.com/intent/tweet?text=${tweetText}&url=${tweetUrl}`}
        target="_blank" rel="noopener noreferrer"
        className="inline-flex items-center gap-1.5 text-[11px] font-mono uppercase tracking-[0.14em] text-accent hover:underline"
      >
        <Twitter className="w-3 h-3" />
        Share on X
      </a>
    </div>
  )
}
