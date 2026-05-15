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
import { User, KeyRound, AlertTriangle, Database, Megaphone, Bell, ArrowRight, Lock, ExternalLink, Bot } from 'lucide-react'
import { ConnectVenueModal } from '../components/ConnectVenueModal'
import { HyperliquidAgentModal } from '../components/HyperliquidAgentModal'
import { loadAgent as loadHlAgent, hlNetwork } from '../lib/hyperliquidAgent'
import { ReferralLinkCard } from '../components/ReferralLinkCard'
import { VaultViewModal } from '../components/VaultViewModal'
import type { VenueId } from '../adapters/types'
import { useBotStore } from '../store/botStore'
import { useSignalPerformanceStore } from '../store/signalPerformanceStore'
import { useActiveVenue } from '../hooks/useActiveVenue'
import { listAdapters } from '../adapters/registry'
import { vaultExists, clear as clearVault } from '../lib/credentialsVault'
import { useToast } from '../store/toastStore'
import { useVenueOpenOrders } from '../hooks/useVenueOpenOrders'
import { useHyperliquidConnect } from '../hooks/useHyperliquidConnect'
import { useVaultSessionStore } from '../store/vaultSessionStore'
import { getAdapter } from '../adapters/registry'
import { cn } from '../lib/format'

export function ProfilePage() {
  const bots = useBotStore(s => s.bots)
  const trades = useBotStore(s => s.trades)
  const resolved = useSignalPerformanceStore(s => s.resolved)
  const activeVenue = useActiveVenue()
  const adapters = listAdapters()
  const toast = useToast()
  const setAllEnabled = useBotStore(s => s.setAllEnabled)
  const hyperliquid = useHyperliquidConnect()
  const [hlAgentOpen, setHlAgentOpen] = useState(false)
  const [hlAgentTick, setHlAgentTick] = useState(0)
  const hlAgent = (() => { void hlAgentTick; return loadHlAgent() })()
  const { states: venueOpenOrders, refresh: refreshOpenOrders } = useVenueOpenOrders()
  const liveOpenOrdersAll = Object.entries(venueOpenOrders).flatMap(([venueId, st]) =>
    (st?.orders ?? []).map(o => ({ venueId, order: o })))

  const emergencyStop = async () => {
    if (!confirm('EMERGENCY STOP\n\nThis will:\n  • Disable ALL bots immediately\n  • Cancel ALL open live orders on connected venues\n\nYour open positions on the venue stay open — go to the venue UI to flatten them.\n\nProceed?')) return
    setAllEnabled(false)
    let canceled = 0
    for (const { venueId, order } of liveOpenOrdersAll) {
      const a = adapters.find(x => x.id === venueId)
      if (!a) continue
      try {
        await a.cancelOrder({ marketId: order.marketId, orderId: order.id })
        canceled += 1
      } catch {
        // best-effort
      }
    }
    refreshOpenOrders()
    toast.success('Emergency stop complete', `Bots disabled · ${canceled}/${liveOpenOrdersAll.length} live orders canceled`)
  }
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
        <ReferralLinkCard />

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

          <div className="mt-3 mb-4 flex items-start gap-2 px-3 py-2.5 rounded-md bg-accent-dim/30 border border-accent/30 text-[11px] text-text-secondary leading-relaxed">
            <KeyRound className="w-3.5 h-3.5 shrink-0 mt-0.5 text-accent" />
            <div>
              <div className="text-text-primary font-semibold mb-0.5">Live trading is ready — three steps:</div>
              <ol className="list-decimal ml-4 space-y-0.5">
                <li>Generate a Binance API key on the venue dashboard. Enable <span className="font-mono text-text-primary">Spot &amp; Margin Trading</span>. Disable withdrawals. IP-whitelist your IP if possible.</li>
                <li>Click <span className="font-mono text-text-primary">Connect</span> on the Binance card below. Paste the key + secret + a passphrase you'll remember.</li>
                <li>Open any bot's mode badge and flip to <span className="font-mono text-text-primary">LIVE</span>. The bot will route signed limit orders directly to your account on signal hits.</li>
              </ol>
              <div className="mt-1.5 text-text-muted">
                Keys are encrypted with your passphrase (AES-GCM, PBKDF2-SHA256 600k iters) before any storage. They never leave your browser — we can't read them.
              </div>
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
                onWalletConnect={adapter.id === 'hyperliquid' ? () => { void hyperliquid.connect() } : undefined}
                onTest={async () => {
                  const a = getAdapter(adapter.id)
                  if (!a || !('getAccountSnapshot' in a)) {
                    toast.warning('Test not available', `${adapter.id} adapter has no test endpoint yet`)
                    return
                  }
                  try {
                    const snap = await (a as { getAccountSnapshot: () => Promise<unknown> }).getAccountSnapshot()
                    const summary = typeof snap === 'object' && snap !== null && 'balances' in snap
                      ? `${(snap as { balances: unknown[] }).balances.length} balances returned`
                      : 'Account fetch ok'
                    toast.success(`${adapter.id} reachable`, summary)
                  } catch (e) {
                    const msg = e instanceof Error ? e.message : 'Unknown error'
                    toast.error('Test failed', msg)
                  }
                }}
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

        {/* Live trading guide */}
        <div>
          <SectionHeader
            icon={Bot}
            title="Live trading"
            subtitle="When you're ready to let bots place real venue orders, the four-step path:"
          />
          <ol className="mt-3 space-y-2 text-sm text-text-secondary leading-relaxed list-decimal list-inside">
            <li>
              Connect a venue API key above. Generate it on the venue dashboard with{' '}
              <span className="text-text-primary">trading scope enabled</span> and{' '}
              <span className="text-short font-semibold">withdrawal scope DISABLED</span>.
            </li>
            <li>
              Each session, unlock the vault from the amber banner at the top of the app.
              Authenticated trading is paused until then by design.
            </li>
            <li>
              Pick a bot (or build one), then click its{' '}
              <span className="text-text-primary uppercase tracking-wider text-[11px] font-semibold">paper</span> badge to switch to{' '}
              <span className="text-amber-400 uppercase tracking-wider text-[11px] font-semibold">live</span>.
              The confirm shows max daily exposure.
            </li>
            <li>
              Live bots fire signed orders on signal matches. Watch /portfolio for live open orders, fills, and bot ownership badges.
              Cancel anytime with one click.
            </li>
          </ol>
          <div className="mt-3 flex items-start gap-2 px-3 py-2.5 rounded-md bg-amber-400/10 border border-amber-400/30 text-[11px] text-amber-400 leading-relaxed">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
            <div>
              Limit-only by design — market orders skip the price check and can fill far from
              expected during volatility. Bots also respect the per-bot daily cap.
            </div>
          </div>
        </div>

        {/* Emergency stop */}
        <div>
          <SectionHeader
            icon={AlertTriangle}
            title="Emergency stop"
            subtitle="One-click kill switch — disables every bot AND cancels every open live order across connected venues. Useful when something feels wrong."
          />
          <div className="mt-3">
            <button
              onClick={emergencyStop}
              className="px-4 py-2 text-xs font-bold uppercase tracking-wider rounded-md bg-short text-white hover:bg-short/90 transition-colors cursor-pointer"
            >
              Emergency stop
            </button>
            <span className="ml-3 text-[11px] text-text-muted">
              Open positions on the venue stay open — visit the venue UI to flatten them.
            </span>
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

        {/* Hyperliquid agent wallet (Phase 1 — testnet only) */}
        <div>
          <SectionHeader
            icon={KeyRound}
            title="Hyperliquid agent wallet"
            subtitle="Phase 1 of signed trading. Approve a local agent key once via your wallet, then sign orders silently. Locked to testnet until validated."
          />
          <div className="mt-3 flex flex-wrap items-center gap-3 text-xs">
            <button
              onClick={() => setHlAgentOpen(true)}
              className="px-3 py-1.5 rounded-md bg-accent text-white font-semibold hover:bg-accent/90 transition-colors cursor-pointer"
            >
              {hlAgent ? 'Manage agent' : 'Set up agent'}
            </button>
            {hlAgent && (
              <span className="font-mono text-text-muted">
                <span className="uppercase mr-2">{hlNetwork()}</span>
                {hlAgent.address.slice(0, 6)}…{hlAgent.address.slice(-4)} ·{' '}
                {hlAgent.approvedAt
                  ? <span className="text-long">approved</span>
                  : <span className="text-amber-300">pending</span>}
              </span>
            )}
          </div>
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

      <HyperliquidAgentModal
        open={hlAgentOpen}
        onClose={() => { setHlAgentOpen(false); setHlAgentTick(t => t + 1) }}
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
  venueId, isActive, onConnect, onTest, onWalletConnect,
}: {
  venueId: string
  isActive: boolean
  onConnect: () => void
  onTest: () => void | Promise<void>
  onWalletConnect?: () => void
}) {
  const isPerp = venueId === 'hyperliquid'
  const auth = isPerp ? 'Wallet (EIP-712 signing)' : 'API key + secret (HMAC)'
  const links = VENUE_DOCS[venueId] ?? {}
  const sessionUnlocked = useVaultSessionStore(s => s.unlocked)
  const adapter = getAdapter(venueId as never)
  const adapterWithAuth = adapter as unknown as { isAuthenticated?: () => boolean } | undefined
  const isConnected = !isPerp && sessionUnlocked
    && typeof adapterWithAuth?.isAuthenticated === 'function'
    && adapterWithAuth.isAuthenticated()

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
        <span className={cn(
          'shrink-0 text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded',
          isConnected
            ? 'bg-long/15 text-long'
            : 'bg-surface border border-border text-text-muted',
        )}>
          {isConnected ? 'Connected' : 'Disconnected'}
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

      <div className="flex gap-2">
        <button
          onClick={() => {
            if (isPerp) {
              onWalletConnect?.()
            } else {
              onConnect()
            }
          }}
          disabled={isPerp && !onWalletConnect}
          className={cn(
            'flex-1 py-2 text-xs font-semibold rounded-md transition-colors',
            isPerp && !onWalletConnect
              ? 'bg-surface border border-border text-text-muted cursor-not-allowed'
              : isConnected
                ? 'bg-surface border border-border text-text-secondary hover:text-text-primary hover:bg-panel-light cursor-pointer'
                : 'bg-accent text-white hover:bg-accent/90 cursor-pointer',
          )}
          title={
            isPerp && !onWalletConnect ? 'Wallet connect coming soon'
              : isPerp ? 'Connect wallet via wagmi for EIP-712 signing'
              : isConnected ? 'Replace credentials'
              : 'Open connection form'
          }
        >
          {isPerp
            ? (onWalletConnect ? 'Connect wallet' : 'Wallet connect (soon)')
            : (isConnected ? 'Replace key' : 'Connect API key')}
        </button>
        {isConnected && (
          <button
            onClick={onTest}
            className="px-3 py-2 text-xs font-semibold rounded-md bg-surface border border-border text-text-secondary hover:text-text-primary hover:bg-panel-light cursor-pointer"
            title="Make a signed read-only call to verify the key works"
          >
            Test
          </button>
        )}
      </div>
    </div>
  )
}
