/**
 * AboutModal — static "what is this app" content.
 *
 * Aimed at first-time users who land cold and need a 60-second orientation
 * to TradingDek's positioning: research deck for signals + paper bots,
 * not a custodian or order router.
 */

import { Zap } from 'lucide-react'
import { Modal } from './ui/Modal'

interface AboutModalProps {
  open: boolean
  onClose: () => void
}

export function AboutModal({ open, onClose }: AboutModalProps) {
  return (
    <Modal open={open} onClose={onClose} title="About TradingDek" maxWidth="max-w-lg">
      <div className="space-y-5 text-xs leading-relaxed text-text-secondary max-h-[70dvh] overflow-y-auto">
        <div className="flex items-start gap-3 pb-4 border-b border-border">
          <div className="w-10 h-10 rounded-lg bg-accent/10 flex items-center justify-center shrink-0">
            <Zap className="w-5 h-5 text-accent" />
          </div>
          <div>
            <div className="text-sm font-semibold text-text-primary mb-1">
              TradingDek — your trading deck. One screen.
            </div>
            <div className="text-[11px] text-text-muted">
              A multi-venue research workstation: live signal scanner, paper-trading
              bots, hit-rate tracking, and one-click deep-links into the venues you
              already trade on.
            </div>
          </div>
        </div>

        <Section title="What we do, what we don't">
          <p>
            <span className="font-semibold text-text-primary">We do:</span> aggregate
            charts and signals across Binance and Hyperliquid, run paper-trading bots
            against the live signal feed, track every fired signal so you can audit
            the win rate yourself, and let you deep-link out to whichever venue you
            already have an account on.
          </p>
          <p>
            <span className="font-semibold text-text-primary">We don't:</span> custody
            funds, run a matching engine, or compete with venue-native order entry.
            Execution is one tap away on Binance / Hyperliquid / OKX, where you
            already have liquidity and risk tools.
          </p>
        </Section>

        <Section title="Signal sources">
          <ul className="list-disc ml-4 space-y-0.5 text-[11px]">
            <li>Funding extremes (perp markets)</li>
            <li>EMA9 / EMA21 crossover on closed bars</li>
            <li>RSI overbought / oversold extremes</li>
            <li>Volatility spikes vs rolling baseline</li>
            <li>Liquidation cascades</li>
            <li>Whale flow (large notional with directional skew)</li>
            <li>News catalyst (when a CryptoPanic token is configured)</li>
            <li>Confluence — synthesized when ≥2 sources agree on direction</li>
          </ul>
        </Section>

        <Section title="Where the data comes from">
          <ul className="space-y-1.5 text-[11px]">
            <li>
              <span className="font-semibold text-text-primary">Prices + tickers</span> —
              Binance and Hyperliquid public WebSocket feeds (no key required)
            </li>
            <li>
              <span className="font-semibold text-text-primary">Real account state</span> —
              signed REST to your venue (Binance API key kept in an encrypted
              client-side vault; never sent to a server)
            </li>
            <li>
              <span className="font-semibold text-text-primary">Bot ledger</span> —
              localStorage; bots run in your browser, not on a server
            </li>
            <li>
              <span className="font-semibold text-text-primary">Hit-rate stats</span> —
              every signal records its trigger price; we resolve 30 minutes later
              against the live mark and store the outcome
            </li>
          </ul>
        </Section>

        <Section title="Tips">
          <ul className="space-y-1 text-[11px]">
            <li>• Press <kbd className="px-1 bg-surface border border-border rounded">⌘K</kbd> for the market quick-jump palette</li>
            <li>• Press <kbd className="px-1 bg-surface border border-border rounded">⌘L</kbd> to open the live-order modal pre-filled with the active market</li>
            <li>• Press <kbd className="px-1 bg-surface border border-border rounded">?</kbd> for the full keyboard shortcut list</li>
            <li>• ★ next to the market name pins it to your watchlist</li>
            <li>• Run any bot through the backtest replay (/replay) to watch trade decisions bar-by-bar</li>
            <li>• Settings → Backup exports your bots, signal settings, and performance history as JSON for cross-browser migration</li>
          </ul>
        </Section>

        <div className="pt-3 border-t border-border text-[10px] text-text-muted leading-relaxed">
          Not financial advice. Bots run paper-only by default; live mode requires
          you to connect a venue API key, which only ever lives encrypted in your
          browser — we cannot move funds, place orders without your explicit
          approval, or see what your other accounts are doing.
        </div>
      </div>
    </Modal>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-1.5">
      <div className="text-[10px] text-text-muted uppercase tracking-wider font-semibold">
        {title}
      </div>
      {children}
    </section>
  )
}
