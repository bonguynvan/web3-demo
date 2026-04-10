/**
 * AboutModal — static "what is this app and how does it work" content.
 *
 * Aimed at first-time users who land on the site cold and need a 60-second
 * orientation. Covers: project pitch, demo vs live mode, the GMX-style fee
 * model the contracts implement, where data comes from in each mode, and
 * pointers to the underlying repos.
 *
 * Intentionally NO heavy formatting / dynamic content. If something here
 * needs to update with state, it shouldn't live in About.
 */

import { ExternalLink, Zap } from 'lucide-react'
import { Modal } from './ui/Modal'

interface AboutModalProps {
  open: boolean
  onClose: () => void
}

export function AboutModal({ open, onClose }: AboutModalProps) {
  return (
    <Modal open={open} onClose={onClose} title="About Perp DEX" maxWidth="max-w-lg">
      <div className="space-y-5 text-xs leading-relaxed text-text-secondary max-h-[70dvh] overflow-y-auto">
        {/* Hero */}
        <div className="flex items-start gap-3 pb-4 border-b border-border">
          <div className="w-10 h-10 rounded-lg bg-accent/10 flex items-center justify-center shrink-0">
            <Zap className="w-5 h-5 text-accent" />
          </div>
          <div>
            <div className="text-sm font-semibold text-text-primary mb-1">
              Perp DEX — GMX-style perpetuals on Anvil
            </div>
            <div className="text-[11px] text-text-muted">
              An end-to-end perpetuals trading interface backed by Foundry contracts,
              an event indexer, and a custom canvas chart library. Built as a
              learning + reference project.
            </div>
          </div>
        </div>

        {/* Demo vs Live */}
        <Section title="Demo vs live mode">
          <p>
            <span className="font-semibold text-text-primary">Demo mode</span> runs entirely
            in your browser. No wallet, no transactions, no real anything — positions,
            balances, and history are simulated against live Binance prices so you can
            try the UI risk-free.
          </p>
          <p>
            <span className="font-semibold text-text-primary">Live mode</span> talks to a
            local Anvil chain running a deployed copy of the perp DEX contracts. Trades
            are real on-chain transactions signed by your connected wallet (or one of
            the pre-funded local Anvil accounts). The keeper services (price updater
            + liquidator) and the indexer backend run alongside the frontend.
          </p>
        </Section>

        {/* Fee model */}
        <Section title="Fee model">
          <p>The contracts implement a GMX-style AMM with these defaults:</p>
          <ul className="list-disc ml-4 space-y-0.5 text-[11px]">
            <li><span className="font-mono">0.10%</span> open fee on position size</li>
            <li><span className="font-mono">0.10%</span> close fee on position size</li>
            <li><span className="font-mono">0.05%</span> spread applied to entry price (longs pay higher, shorts lower)</li>
            <li><span className="font-mono">~0.01%/8h</span> funding rate (placeholder — accumulator not yet wired)</li>
            <li><span className="font-mono">$5</span> flat liquidation fee paid to the liquidator keeper</li>
          </ul>
          <p className="text-[11px] text-text-muted">
            All fees are deducted from collateral on close. Realised PnL = usdcOut −
            collateralDelta − fee.
          </p>
        </Section>

        {/* Data sources */}
        <Section title="Where the data comes from">
          <ul className="space-y-1.5 text-[11px]">
            <li>
              <span className="font-semibold text-text-primary">Demo prices</span> →
              Binance public WebSocket ticker (free, no key)
            </li>
            <li>
              <span className="font-semibold text-text-primary">Live prices</span> →
              local price-updater keeper writing to the on-chain oracle every ~5s
            </li>
            <li>
              <span className="font-semibold text-text-primary">Live trades / history</span> →
              backend indexer streaming PositionManager events into SQLite, served
              over REST + WebSocket
            </li>
            <li>
              <span className="font-semibold text-text-primary">Live positions</span> →
              read directly from PositionManager.getPosition (no caching)
            </li>
          </ul>
        </Section>

        {/* Tips */}
        <Section title="Tips">
          <ul className="space-y-1 text-[11px]">
            <li>• Press <kbd className="px-1 bg-surface border border-border rounded">B</kbd> / <kbd className="px-1 bg-surface border border-border rounded">S</kbd> to switch sides, <kbd className="px-1 bg-surface border border-border rounded">1</kbd>–<kbd className="px-1 bg-surface border border-border rounded">5</kbd> for leverage presets</li>
            <li>• Hover any metric label for an explanation tooltip</li>
            <li>• Click the green/yellow/red status pill in the header for diagnostics</li>
            <li>• Use the gear icon to tune liquidation alert thresholds or wipe local state</li>
            <li>• Save your chart layout (drawings + indicators) via the chart toolbar's Save dropdown</li>
          </ul>
        </Section>

        {/* Disclaimer */}
        <div className="pt-3 border-t border-border text-[10px] text-text-muted leading-relaxed">
          This is a reference implementation, not financial advice or production
          software. Demo mode is fake. Live mode is real on whatever chain you point
          it at — never connect a wallet holding real funds to a local development
          contract you haven't audited.
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

// External link is exported so the parent can render it next to the modal trigger
// if it ever wants to (kept here to avoid a separate file).
export function ExternalRepoLink({ href, label }: { href: string; label: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1 text-accent hover:underline"
    >
      {label}
      <ExternalLink className="w-3 h-3" />
    </a>
  )
}
