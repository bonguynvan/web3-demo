/**
 * StrategyAssistantPage — AI helper that turns a trading hypothesis
 * into a suggested bot config.
 *
 * v1 is plain text streaming: user types a hypothesis, Claude writes
 * back a structured response (Strategy / Configuration / Rationale /
 * Risks). The user reads the config and creates the bot manually via
 * /bots. Auto-parse + one-click apply is a future polish.
 *
 * Pro-gated server-side (same gate as /api/ai/explain). The page
 * itself stays accessible — the request just returns 402 if not Pro,
 * surfaced to the user as a clear message.
 */

import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, Sparkles, Send, Square, Copy } from 'lucide-react'
import { useDocumentMeta } from '../lib/documentMeta'
import { strategyAssistantStreaming } from '../api/ai'
import { useToast } from '../store/toastStore'
import { cn } from '../lib/format'

const EXAMPLES = [
  'Mean-revert RSI extremes on BTC during US session',
  'Fade crowded long funding on alts',
  'Follow whale wallets into ETH-PERP, exit fast',
  'Buy volatility breakouts confirmed by confluence',
]

export function StrategyAssistantPage() {
  useDocumentMeta({
    title: 'TradingDek — Strategy assistant',
    description: 'AI turns a trading hypothesis into a bot config.',
    canonical: '/strategy-assistant',
  })

  const toast = useToast()
  const [hypothesis, setHypothesis] = useState('')
  const [response, setResponse] = useState('')
  const [streaming, setStreaming] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const controllerRef = useRef<AbortController | null>(null)

  // Cancel any in-flight stream on unmount.
  useEffect(() => () => controllerRef.current?.abort(), [])

  const submit = () => {
    const h = hypothesis.trim()
    if (!h) return
    setResponse('')
    setError(null)
    setStreaming(true)
    controllerRef.current?.abort()
    controllerRef.current = strategyAssistantStreaming(h, {
      onChunk: (text) => setResponse(prev => prev + text),
      onDone: () => setStreaming(false),
      onError: (msg) => {
        setError(prettifyError(msg))
        setStreaming(false)
      },
    })
  }

  const cancel = () => {
    controllerRef.current?.abort()
    setStreaming(false)
  }

  const copyResponse = () => {
    if (!response) return
    navigator.clipboard.writeText(response).catch(() => {})
    toast.success('Copied', 'Strategy suggestion on your clipboard.')
  }

  return (
    <div className="h-full overflow-y-auto bg-surface text-text-primary">
      <section className="max-w-3xl mx-auto px-4 md:px-8 py-6 space-y-5">
        <header className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-xl font-semibold flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-accent" />
              Strategy assistant
            </h1>
            <p className="text-xs text-text-muted mt-0.5">
              Describe a hypothesis; Claude suggests a bot config. Pro feature.
            </p>
          </div>
          <Link
            to="/profile"
            className="flex items-center gap-1.5 text-xs text-text-secondary hover:text-text-primary border border-border hover:border-accent/40 rounded-md px-2.5 py-1.5 transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Profile
          </Link>
        </header>

        <div className="rounded-lg border border-border bg-panel/30 p-4 space-y-3">
          <label className="block text-[10px] text-text-muted uppercase tracking-wider font-mono">
            Your hypothesis
          </label>
          <textarea
            value={hypothesis}
            onChange={e => setHypothesis(e.target.value)}
            placeholder="e.g. Funding-driven mean reversion in low-vol regimes"
            rows={3}
            maxLength={1000}
            disabled={streaming}
            className="w-full bg-panel border border-border rounded-md px-3 py-2 text-sm text-text-primary outline-none focus:border-accent disabled:opacity-60 resize-none leading-relaxed"
          />
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex flex-wrap gap-1.5">
              {EXAMPLES.map(ex => (
                <button
                  key={ex}
                  type="button"
                  disabled={streaming}
                  onClick={() => setHypothesis(ex)}
                  className="px-2 py-1 text-[10px] rounded-md border border-border bg-panel text-text-muted hover:text-text-primary transition-colors cursor-pointer disabled:opacity-50"
                >
                  {ex}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-mono text-text-muted">{hypothesis.length}/1000</span>
              {streaming ? (
                <button
                  onClick={cancel}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-md bg-surface text-text-muted border border-border hover:text-text-primary cursor-pointer"
                >
                  <Square className="w-3 h-3" />
                  Stop
                </button>
              ) : (
                <button
                  onClick={submit}
                  disabled={!hypothesis.trim()}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-md bg-accent text-white hover:bg-accent/90 transition-colors cursor-pointer disabled:opacity-40"
                >
                  <Send className="w-3 h-3" />
                  Generate
                </button>
              )}
            </div>
          </div>
        </div>

        {error && (
          <div className="rounded-md border border-short/40 bg-short/10 text-short px-4 py-3 text-sm">
            {error}
          </div>
        )}

        {(response || streaming) && (
          <div className="rounded-lg border border-border bg-panel/30 p-4">
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-[11px] uppercase tracking-[0.18em] font-mono font-semibold text-text-secondary">
                Suggestion
                {streaming && <span className="ml-2 text-text-muted animate-pulse">▍</span>}
              </h2>
              {response && (
                <button
                  onClick={copyResponse}
                  className="flex items-center gap-1 text-[10px] font-mono uppercase tracking-wider text-text-muted hover:text-text-primary cursor-pointer"
                >
                  <Copy className="w-3 h-3" />
                  Copy
                </button>
              )}
            </div>
            <pre className={cn(
              'whitespace-pre-wrap font-mono text-[11px] text-text-secondary leading-relaxed',
              streaming && 'after:inline-block after:w-1.5 after:h-3 after:bg-accent after:ml-px after:animate-pulse',
            )}>
              {response}
            </pre>
            {!streaming && response && (
              <div className="mt-3 pt-3 border-t border-border text-[10px] text-text-muted">
                Read the suggestion, then{' '}
                <Link to="/bots" className="text-accent hover:underline">create a bot</Link>
                {' '}with these settings. The studio supports every field this assistant references.
              </div>
            )}
          </div>
        )}

        {!response && !streaming && !error && (
          <div className="text-[11px] text-text-muted leading-relaxed">
            Examples that work well:
            <ul className="list-disc ml-5 mt-1 space-y-0.5">
              <li>"Tail whale flow on ETH-PERP with a tight 1.5% stop"</li>
              <li>"Counter-trend RSI alerts only during low BTC volatility"</li>
              <li>"News-driven longs with 24h max hold and 3% take-profit"</li>
            </ul>
            <div className="mt-2 italic">
              The assistant suggests starting parameters. Always paper-trade for a week
              before flipping a bot to live mode.
            </div>
          </div>
        )}
      </section>
    </div>
  )
}

function prettifyError(msg: string): string {
  if (msg.includes('Pro required')) return 'This is a Pro feature. Upgrade your plan to use the strategy assistant.'
  if (msg.includes('sign in required')) return 'Sign in with your wallet to use the strategy assistant.'
  if (msg.includes('rate limit')) return 'Rate limit (30/hour). Try again in a bit.'
  if (msg.includes('backend not configured')) return 'AI assistant not available in this build (VITE_API_BASE unset).'
  return `Failed: ${msg}`
}
