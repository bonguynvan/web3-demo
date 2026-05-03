/**
 * ProfilePage — identity + venue connections + data ownership hub.
 *
 * Today this is a scaffold. The connection cards are placeholders that
 * describe the planned flow. Real authenticated trading lands when
 * either:
 *
 *   1. Client-side AES-GCM encryption with passphrase prompt (Web
 *      Crypto API) for personal/self-host setups, or
 *   2. Server proxy that holds keys encrypted server-side and signs
 *      requests on the user's behalf (multi-user prod).
 *
 * See memory/project_api_connections_and_profile.md for the full
 * direction and security guardrails.
 */

import { useState } from 'react'
import { Link } from 'react-router-dom'
import { User, KeyRound, AlertTriangle, Database, Megaphone, Bell, ArrowRight, Lock, ExternalLink } from 'lucide-react'
import { ConnectVenueModal } from '../components/ConnectVenueModal'
import { VaultViewModal } from '../components/VaultViewModal'
import type { VenueId } from '../adapters/types'
import { useBotStore } from '../store/botStore'
import { useSignalPerformanceStore } from '../store/signalPerformanceStore'
import { useActiveVenue } from '../hooks/useActiveVenue'
import { listAdapters } from '../adapters/registry'
import { vaultExists, clear as clearVault } from '../lib/credentialsVault'
import { useToast } from '../store/toastStore'
import { cn } from '../lib/format'

export function ProfilePage() {
  const bots = useBotStore(s => s.bots)
  const trades = useBotStore(s => s.trades)
  const resolved = useSignalPerformanceStore(s => s.resolved)
  const activeVenue = useActiveVenue()
  const adapters = listAdapters()
  const toast = useToast()
  const [connectVenue, setConnectVenue] = useState<VenueId | null>(null)
  // Track vault presence locally so the clear button removes the row
  // without a page reload.
  const [vaultPresent, setVaultPresent] = useState(() => vaultExists())
  const [vaultViewOpen, setVaultViewOpen] = useState(false)
  const handleClearVault = () => {
    if (!confirm('Clear vault and forget all stored credentials? This cannot be undone.')) return
    clearVault()
    setVaultPresent(false)
    toast.success('Vault cleared', 'All encrypted credentials removed from this browser')
  }

  return (
    <div className="h-full overflow-y-auto bg-surface text-text-primary">
      <section className="max-w-4xl mx-auto px-6 md:px-10 py-8 space-y-8">
        {/* Identity */}
        <div className="bg-panel border border-border rounded-lg p-6">
          <div className="flex items-start gap-4">
            <div className="shrink-0 w-12 h-12 rounded-full bg-accent-dim flex items-center justify-center">
              <User className="w-6 h-6 text-accent" />
            </div>
            <div className="flex-1 min-w-0">
              <h1 className="text-lg font-semibold">Anonymous trader</h1>
              <div className="text-xs text-text-muted mt-1">
                Sign-in coming with the marketplace launch. Until then, all data lives on this
                browser — use Settings → Backup to migrate.
              </div>
            </div>
          </div>

          <div className="mt-6 grid grid-cols-3 gap-2 text-center">
            <Stat label="Bots" value={`${bots.length}`} />
            <Stat label="Trades" value={`${trades.length}`} />
            <Stat label="Resolved signals" value={`${resolved.length}`} />
          </div>
        </div>

        {/* Venue connections */}
        <div>
          <SectionHeader
            icon={KeyRound}
            title="Venue connections"
            subtitle="Connect API keys (CEX) or a wallet (DEX) to enable authenticated trading. Public market data works without any connection — these are only needed to place orders."
          />

          <div className="mt-3 mb-4 flex items-start gap-2 px-3 py-2.5 rounded-md bg-amber-400/10 border border-amber-400/30 text-[11px] text-amber-400 leading-relaxed">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
            <div>
              Authenticated trading is not yet wired. Connection forms below are placeholders.
              When implemented, API secrets will be encrypted with a passphrase before any storage
              and never sent to a TradingDek server in self-host mode.
            </div>
          </div>

          <div className="mb-3 flex items-center justify-between gap-3 px-3 py-2 rounded-md bg-panel/60 border border-border text-[11px]">
            <div className="flex items-center gap-2">
              <Lock className="w-3.5 h-3.5 text-text-muted" />
              <span className="text-text-secondary">Credentials vault:</span>
              <span className={cn('font-medium', vaultPresent ? 'text-accent' : 'text-text-muted')}>
                {vaultPresent ? 'Locked (passphrase required)' : 'Empty'}
              </span>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-text-muted">AES-GCM · PBKDF2 600k iters</span>
              {vaultPresent && (
                <>
                  <button
                    onClick={() => setVaultViewOpen(true)}
                    title="Unlock and view stored venues"
                    className="text-text-muted hover:text-text-primary transition-colors cursor-pointer uppercase tracking-wider"
                  >
                    View
                  </button>
                  <button
                    onClick={handleClearVault}
                    title="Delete the encrypted vault"
                    className="text-text-muted hover:text-short transition-colors cursor-pointer uppercase tracking-wider"
                  >
                    Clear
                  </button>
                </>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {adapters.map(adapter => (
              <VenueCard
                key={adapter.id}
                venueId={adapter.id}
                isActive={adapter.id === activeVenue}
                onConnect={() => setConnectVenue(adapter.id)}
              />
            ))}
          </div>
        </div>

        {/* Data ownership */}
        <div>
          <SectionHeader
            icon={Database}
            title="Data ownership"
            subtitle="Everything you've configured lives in this browser. Back it up before clearing storage or switching machines."
          />
          <div className="mt-3 bg-panel/60 border border-border rounded-lg p-4 text-sm text-text-secondary leading-relaxed">
            Use <span className="text-text-primary">Settings → Backup</span> in the sidebar to
            export bots, signal settings, thresholds, and performance history as a single JSON
            file. Importing it on another browser restores the full setup.
          </div>
        </div>

        {/* Strategy publishing (future marketplace) */}
        <div>
          <SectionHeader
            icon={Megaphone}
            title="Publish a strategy"
            subtitle="Submit a paper-traded bot to the curated library. The marketplace backend that supports follower count, comments, and revenue share is not yet live — until then, share via the bot export JSON."
          />
          <div className="mt-3 bg-panel/60 border border-border rounded-lg p-4 flex items-center justify-between gap-3">
            <div className="text-sm text-text-secondary">
              Want to be among the first publishers when the marketplace ships?
            </div>
            <Link
              to="/library"
              className="shrink-0 flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-md bg-surface border border-border text-text-secondary hover:text-text-primary hover:bg-panel-light transition-colors"
            >
              Browse library
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        </div>

        {/* Notification preferences */}
        <div>
          <SectionHeader
            icon={Bell}
            title="Notification preferences"
            subtitle="Sound, browser, and Telegram toggles live in the Signals panel header (bell, volume, send icons). Per-source enable/disable and threshold tuning are in the SignalSourcesModal (sliders icon)."
          />
        </div>
      </section>

      <ConnectVenueModal
        open={!!connectVenue}
        venueId={connectVenue ?? 'binance'}
        onClose={() => {
          setConnectVenue(null)
          setVaultPresent(vaultExists())
        }}
      />

      <VaultViewModal
        open={vaultViewOpen}
        onClose={() => {
          setVaultViewOpen(false)
          setVaultPresent(vaultExists())
        }}
      />
    </div>
  )
}

function SectionHeader({
  icon: Icon, title, subtitle,
}: {
  icon: typeof User
  title: string
  subtitle: string
}) {
  return (
    <div className="flex items-start gap-2.5">
      <Icon className="w-4 h-4 text-accent mt-1 shrink-0" />
      <div className="min-w-0">
        <h2 className="text-sm font-semibold text-text-primary">{title}</h2>
        <p className="text-[11px] text-text-muted leading-relaxed mt-0.5">{subtitle}</p>
      </div>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-surface/60 rounded px-3 py-2 border border-border/60">
      <div className="text-[10px] uppercase tracking-wider text-text-muted">{label}</div>
      <div className="text-sm font-mono text-text-primary tabular-nums">{value}</div>
    </div>
  )
}

const VENUE_DOCS: Record<string, { keyUrl?: string; docsUrl?: string }> = {
  binance: {
    keyUrl: 'https://www.binance.com/en/my/settings/api-management',
    docsUrl: 'https://developers.binance.com/docs/binance-spot-api-docs',
  },
  hyperliquid: {
    docsUrl: 'https://hyperliquid.gitbook.io/hyperliquid-docs',
  },
}

function VenueCard({
  venueId, isActive, onConnect,
}: {
  venueId: string
  isActive: boolean
  onConnect: () => void
}) {
  const isPerp = venueId === 'hyperliquid'
  const auth = isPerp ? 'Wallet (EIP-712 signing)' : 'API key + secret (HMAC)'
  const links = VENUE_DOCS[venueId] ?? {}

  return (
    <div className="bg-panel border border-border rounded-lg p-4">
      <div className="flex items-start justify-between gap-3 mb-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-text-primary capitalize">{venueId}</span>
            {isActive && (
              <span className="text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-accent-dim text-accent">
                Active
              </span>
            )}
          </div>
          <div className="text-[11px] text-text-muted mt-0.5">
            {isPerp ? 'Perp DEX' : 'CEX (spot)'} · auth via {auth}
          </div>
        </div>
        <span className="shrink-0 text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-surface border border-border text-text-muted">
          Disconnected
        </span>
      </div>

      <div className="text-[11px] text-text-muted leading-relaxed mb-2">
        {isPerp
          ? 'Connect your wallet to sign orders directly. Builder code is automatic — TradingDek receives a small rebate per fill at no extra cost to you.'
          : 'Generate a read-only API key in your venue dashboard, then paste it here. Trading scope is opt-in. Withdrawal scope must be DISABLED on the key.'}
      </div>

      {(links.keyUrl || links.docsUrl) && (
        <div className="flex flex-wrap gap-3 mb-3 text-[10px]">
          {links.keyUrl && (
            <a
              href={links.keyUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="inline-flex items-center gap-1 text-accent hover:underline cursor-pointer"
            >
              Create API key <ExternalLink className="w-2.5 h-2.5" />
            </a>
          )}
          {links.docsUrl && (
            <a
              href={links.docsUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="inline-flex items-center gap-1 text-text-muted hover:text-text-primary cursor-pointer"
            >
              API docs <ExternalLink className="w-2.5 h-2.5" />
            </a>
          )}
        </div>
      )}

      <button
        onClick={onConnect}
        disabled={isPerp}
        className={cn(
          'w-full py-2 text-xs font-semibold rounded-md transition-colors',
          isPerp
            ? 'bg-surface border border-border text-text-muted cursor-not-allowed'
            : 'bg-accent text-white hover:bg-accent/90 cursor-pointer',
        )}
        title={isPerp ? 'Wallet connect coming soon (uses wagmi)' : 'Open connection form'}
      >
        {isPerp ? 'Wallet connect (coming soon)' : 'Connect API key'}
      </button>
    </div>
  )
}
