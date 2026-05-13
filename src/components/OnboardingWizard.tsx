/**
 * OnboardingWizard — one-shot modal for first-time signed-in users
 * with zero bots. Picks three curated presets and installs the
 * chosen one in a single click.
 *
 * Funnel rationale: the existing OnboardingCard is a passive
 * checklist. The wizard is an active push — the moment we know we
 * have a real user (signed in via wallet, zero bots), we drop them
 * into a working setup so they reach the "first profitable trade"
 * milestone faster, which is the moment they have a reason to pay.
 *
 * Triggers once. Dismissal is permanent; the card-style
 * OnboardingCard continues to serve as the slower nudge afterwards.
 */

import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Sparkles, X, Check, Bot, ArrowRight } from 'lucide-react'
import { Modal } from './ui/Modal'
import { useAuthStore } from '../store/authStore'
import { useBotStore } from '../store/botStore'
import { STRATEGY_LIBRARY } from '../strategies/library'
import { cn } from '../lib/format'

const STORAGE_KEY = 'tc-wizard-v1'

// IDs from STRATEGY_LIBRARY — three accessible starters covering
// conservative (confluence), mean-reverting (funding), and momentum
// (volatility) styles. Curated team picks only, no community entries.
const STARTER_IDS = ['tdk-confluence-classic', 'tdk-funding-fade', 'tdk-volatility-momentum']

function loadDone(): boolean {
  try { return localStorage.getItem(STORAGE_KEY) === '1' } catch { return false }
}
function markDone() {
  try { localStorage.setItem(STORAGE_KEY, '1') } catch { /* full */ }
}

export function OnboardingWizard() {
  const navigate = useNavigate()
  const token = useAuthStore(s => s.token)
  const bots = useBotStore(s => s.bots)
  const addBot = useBotStore(s => s.addBot)
  const [open, setOpen] = useState(false)
  const [picked, setPicked] = useState<string | null>(null)
  const [installed, setInstalled] = useState(false)

  const starters = useMemo(
    () => STARTER_IDS
      .map(id => STRATEGY_LIBRARY.find(s => s.id === id))
      .filter((s): s is NonNullable<typeof s> => !!s),
    [],
  )

  useEffect(() => {
    if (loadDone()) return
    if (!token) return
    if (bots.length > 0) return
    setOpen(true)
  }, [token, bots.length])

  const close = (permanent: boolean) => {
    if (permanent) markDone()
    setOpen(false)
  }

  const handleInstall = () => {
    const strat = starters.find(s => s.id === picked)
    if (!strat) return
    addBot({
      name: strat.bot.name,
      mode: 'paper',
      enabled: true,
      allowedSources: strat.bot.allowedSources,
      allowedMarkets: strat.bot.allowedMarkets,
      minConfidence: strat.bot.minConfidence,
      positionSizeUsd: strat.bot.positionSizeUsd,
      holdMinutes: strat.bot.holdMinutes,
      maxTradesPerDay: strat.bot.maxTradesPerDay,
    } as Parameters<typeof addBot>[0])
    setInstalled(true)
  }

  return (
    <Modal open={open} onClose={() => close(true)} title="Welcome — let's install your first bot" maxWidth="max-w-xl">
      <div className="p-5 space-y-5">
        {installed ? (
          <div className="text-center space-y-4 py-3">
            <div className="w-12 h-12 rounded-full bg-long/15 text-long flex items-center justify-center mx-auto">
              <Check className="w-6 h-6" />
            </div>
            <h2 className="text-lg font-semibold text-text-primary">Your bot is running in paper mode.</h2>
            <p className="text-sm text-text-secondary leading-relaxed max-w-md mx-auto">
              It'll take signals as they fire and record paper trades.
              Come back in a few days — once it crosses 10 trades you'll
              see a hit-rate readout on{' '}
              <span className="text-text-primary font-mono">/portfolio</span>.
            </p>
            <button
              onClick={() => { close(true); navigate('/bots') }}
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-accent text-surface text-sm font-semibold rounded-md hover:opacity-90 transition-opacity cursor-pointer"
            >
              Open Bot Manager
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        ) : (
          <>
            <p className="text-sm text-text-secondary leading-relaxed">
              Pick a starter. Each one is a paper bot — no real money. You can
              tune it, run it for a few weeks, and see if its signal source
              fits your style before doing anything live.
            </p>

            <div className="space-y-2.5">
              {starters.map(strat => (
                <button
                  key={strat.id}
                  onClick={() => setPicked(strat.id)}
                  className={cn(
                    'w-full text-left p-3 rounded-md border transition-colors cursor-pointer',
                    picked === strat.id
                      ? 'border-accent bg-accent-dim/30'
                      : 'border-border bg-surface/60 hover:border-accent/40',
                  )}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-semibold text-text-primary flex items-center gap-1.5">
                      <Bot className="w-3.5 h-3.5 text-accent" />
                      {strat.name}
                    </span>
                    {strat.performance && (
                      <span className="text-[10px] font-mono uppercase tracking-[0.14em] text-text-muted">
                        {Math.round(strat.performance.winRate * 100)}% / {strat.performance.sample} trades
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-text-muted leading-snug">{strat.summary}</p>
                </button>
              ))}
            </div>

            <div className="flex items-center justify-between gap-3 pt-2 border-t border-border">
              <button
                onClick={() => close(true)}
                className="flex items-center gap-1 text-[11px] font-mono uppercase tracking-[0.14em] text-text-muted hover:text-text-primary cursor-pointer"
              >
                <X className="w-3 h-3" />
                Skip — I'll explore on my own
              </button>
              <button
                onClick={handleInstall}
                disabled={!picked}
                className={cn(
                  'flex items-center gap-1.5 px-4 py-2 text-sm font-semibold rounded-md transition-colors cursor-pointer',
                  picked
                    ? 'bg-accent text-surface hover:opacity-90'
                    : 'bg-surface border border-border text-text-muted cursor-not-allowed',
                )}
              >
                <Sparkles className="w-3.5 h-3.5" />
                Install + start paper-trading
              </button>
            </div>
          </>
        )}
      </div>
    </Modal>
  )
}
