/**
 * PWAInstallPrompt — small "install app" toast for installable browsers.
 *
 * Listens for the `beforeinstallprompt` event (Chromium/Edge mobile),
 * captures it, and surfaces an unobtrusive bottom-right toast. The
 * default native prompt is suppressed via preventDefault; we trigger
 * it on demand when the user clicks "Install".
 *
 * Dismissal persists for 30 days. iOS Safari has no programmatic
 * install API — for that audience we may later add an "Add to Home
 * Screen" hint. Not in v1.
 */

import { useEffect, useState } from 'react'
import { Download, X } from 'lucide-react'

const DISMISS_KEY = 'tc-pwa-dismissed-v1'
const DISMISS_WINDOW_MS = 30 * 24 * 60 * 60 * 1000

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

export function PWAInstallPrompt() {
  const [evt, setEvt] = useState<BeforeInstallPromptEvent | null>(null)
  const [hidden, setHidden] = useState(false)

  useEffect(() => {
    try {
      const at = Number(localStorage.getItem(DISMISS_KEY) ?? '0')
      if (Date.now() - at < DISMISS_WINDOW_MS) {
        setHidden(true)
        return
      }
    } catch { /* ignore */ }

    const onBefore = (e: Event) => {
      e.preventDefault()
      setEvt(e as BeforeInstallPromptEvent)
    }
    window.addEventListener('beforeinstallprompt', onBefore)
    return () => window.removeEventListener('beforeinstallprompt', onBefore)
  }, [])

  if (hidden || !evt) return null

  const dismiss = () => {
    try { localStorage.setItem(DISMISS_KEY, String(Date.now())) } catch { /* full */ }
    setHidden(true)
  }

  const install = async () => {
    try {
      await evt.prompt()
      const choice = await evt.userChoice
      if (choice.outcome === 'accepted') setEvt(null)
      else dismiss()
    } catch {
      dismiss()
    }
  }

  return (
    <div className="fixed bottom-20 md:bottom-4 right-4 z-40 w-[280px] max-w-[calc(100vw-2rem)] bg-panel border border-accent/40 rounded-lg shadow-lg shadow-accent/10 p-3 flex items-start gap-2.5">
      <div className="w-8 h-8 rounded-md bg-accent-dim text-accent flex items-center justify-center shrink-0">
        <Download className="w-4 h-4" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-semibold text-text-primary">Install TradingDek</div>
        <div className="text-[11px] text-text-muted leading-snug mt-0.5">
          Faster launches, fewer tabs, runs offline once cached.
        </div>
        <div className="flex items-center gap-2 mt-2">
          <button
            onClick={install}
            className="px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] rounded bg-accent text-surface hover:opacity-90 cursor-pointer"
          >
            Install
          </button>
          <button
            onClick={dismiss}
            className="px-2 py-1 text-[11px] font-mono uppercase tracking-[0.14em] text-text-muted hover:text-text-primary cursor-pointer"
          >
            Later
          </button>
        </div>
      </div>
      <button onClick={dismiss} aria-label="Dismiss" className="text-text-muted hover:text-text-primary cursor-pointer">
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  )
}
