/**
 * Web3Header — market bar with real wallet connection and on-chain data.
 */

import { useEffect, useState } from 'react'
import { useAccount, useConnect, useDisconnect, useChainId } from 'wagmi'
import { ChevronDown, Wallet, Zap, LogOut, Menu, Sun, Moon, Settings, HelpCircle } from 'lucide-react'
import { FlashPrice } from './ui/FlashPrice'
import { useTradingStore } from '../store/tradingStore'
import { useUsdcBalance } from '../hooks/useTokenBalance'
import { usePrices } from '../hooks/usePrices'
import { useVault } from '../hooks/useVault'
import { useFaucet } from '../hooks/useFaucet'
import { useMarketStats } from '../hooks/useMarketStats'
import { useModeStore, type AppMode } from '../store/modeStore'
import { useThemeStore } from '../store/themeStore'
import { cn, formatUsd, formatCompact, formatCountdown } from '../lib/format'
import { Dropdown, DropdownItem } from './ui/Dropdown'
import { Drawer } from './ui/Drawer'
import { Skeleton } from './ui/Skeleton'
import { Tooltip } from './ui/Tooltip'
import { StatusPill } from './StatusPill'
import { SettingsModal } from './SettingsModal'
import { AboutModal } from './AboutModal'

const CHAIN_NAMES: Record<number, string> = {
  31337: 'Anvil',
  42161: 'Arbitrum',
  8453: 'Base',
}

export function Web3Header() {
  const { markets, selectedMarket, setSelectedMarket } = useTradingStore()

  const { address, isConnected, connector } = useAccount()
  const isDemoAccount = connector?.type === 'demo'
  const chainId = useChainId()
  const { connect, connectors } = useConnect()
  const { disconnect } = useDisconnect()

  const { dollars: usdcBalance } = useUsdcBalance()
  const { getPrice } = usePrices()
  const { stats: vaultStats } = useVault()
  const { mint, minting, isAvailable: faucetAvailable } = useFaucet()
  const stats = useMarketStats()
  const { mode, setMode } = useModeStore()
  const { theme: appTheme, toggleTheme } = useThemeStore()

  // Sync wallet with mode:
  // - Live → Demo: disconnect external wallet, auto-connect first demo account
  // - Demo → Live: keep the demo account connected. The demo connector now
  //   proxies real reads/writes to Anvil so it doubles as a "headless local
  //   wallet" for live-mode testing without MetaMask. Users with MetaMask
  //   can still switch to it via the wallet dropdown.
  useEffect(() => {
    if (mode === 'demo') {
      // Disconnect external wallet first
      if (isConnected && connector && connector.type !== 'demo') {
        disconnect()
        return
      }
      // Auto-connect first demo account if nothing connected
      if (!isConnected) {
        const demoConnector = connectors.find(c => c.type === 'demo')
        if (demoConnector) {
          connect({ connector: demoConnector })
        }
      }
    }
    // Live mode: don't auto-disconnect anything. The user can manually
    // switch wallets via the connect dropdown.
  }, [mode, isConnected, isDemoAccount, connector, connectors, connect, disconnect])

  const currentPrice = getPrice(selectedMarket.symbol)
  const priceLabel = mode === 'demo' ? 'Binance' : 'Oracle'

  const truncatedAddress = address
    ? `${address.slice(0, 6)}...${address.slice(-4)}`
    : ''

  // Mobile drawer for stats + mode + theme. Wallet stays visible in the
  // header even on small screens because connection status is too important
  // to bury behind a menu.
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [aboutOpen, setAboutOpen] = useState(false)

  return (
    <header className="flex items-center h-14 bg-panel border-b border-border px-3 md:px-4 gap-3 md:gap-6 shrink-0">
      {/* Logo — text hidden on mobile to save space, icon stays */}
      <div className="flex items-center gap-2 md:mr-2">
        <Zap className="w-5 h-5 text-accent shrink-0" />
        <span className="hidden md:inline font-semibold text-text-primary text-sm">PERP DEX</span>
      </div>

      {/* Market Selector */}
      <Dropdown
        trigger={
          <>
            <span className="font-semibold text-text-primary">{selectedMarket.symbol}</span>
            <ChevronDown className="w-4 h-4 text-text-muted" />
          </>
        }
        width="min-w-[280px]"
      >
        {markets.map(m => {
          const mPrice = getPrice(m.symbol)
          return (
            <button
              key={m.symbol}
              onClick={() => setSelectedMarket(m.symbol)}
              className={cn(
                'flex items-center justify-between w-full px-4 py-2.5 hover:bg-panel-light transition-colors cursor-pointer text-left',
                m.symbol === selectedMarket.symbol && 'bg-panel-light'
              )}
            >
              <div>
                <div className="text-sm font-medium text-text-primary">{m.symbol}</div>
                <div className="text-xs text-text-muted">{m.baseAsset}</div>
              </div>
              <div className="text-right">
                <div className="text-sm font-mono text-text-primary">
                  ${mPrice ? formatUsd(mPrice.price) : '---'}
                </div>
              </div>
            </button>
          )
        })}
      </Dropdown>

      {/* Market Stats Bar — hidden on mobile, shown in drawer instead */}
      <div className="hidden md:flex items-center gap-4 text-xs overflow-hidden">
        {/* Price Source */}
        <div>
          <span className="text-text-muted text-[10px]">{priceLabel}</span>
          <div className="font-semibold">
            {currentPrice && currentPrice.price > 0 ? (
              <FlashPrice value={currentPrice.price} size="md" showArrow format={n => `$${formatUsd(n)}`} />
            ) : (
              <span className="font-mono text-text-muted">$---</span>
            )}
          </div>
        </div>

        <div className="w-px h-6 bg-border" />

        {/* 24h Change */}
        <div>
          <span className="text-text-muted text-[10px]">24h Change</span>
          {stats.statsAvailable ? (
            <div className={cn(
              'font-mono font-medium',
              stats.change24h >= 0 ? 'text-long' : 'text-short',
            )}>
              {stats.change24h >= 0 ? '+' : ''}{stats.change24h.toFixed(2)}%
            </div>
          ) : stats.isInitialLoad ? (
            <Skeleton className="h-[18px] mt-0.5" width={60} subtle />
          ) : (
            <div className="font-mono text-text-muted">—</div>
          )}
        </div>

        {/* 24h High */}
        <div>
          <span className="text-text-muted text-[10px]">24h High</span>
          {stats.statsAvailable ? (
            <div className="font-mono text-text-primary">${formatUsd(stats.high24h)}</div>
          ) : stats.isInitialLoad ? (
            <Skeleton className="h-[18px] mt-0.5" width={72} subtle />
          ) : (
            <div className="font-mono text-text-muted">—</div>
          )}
        </div>

        {/* 24h Low */}
        <div>
          <span className="text-text-muted text-[10px]">24h Low</span>
          {stats.statsAvailable ? (
            <div className="font-mono text-text-primary">${formatUsd(stats.low24h)}</div>
          ) : stats.isInitialLoad ? (
            <Skeleton className="h-[18px] mt-0.5" width={72} subtle />
          ) : (
            <div className="font-mono text-text-muted">—</div>
          )}
        </div>

        {/* 24h Volume */}
        <div>
          <span className="text-text-muted text-[10px]">24h Volume</span>
          {stats.statsAvailable ? (
            <div className="font-mono text-text-primary">${formatCompact(stats.volume24h)}</div>
          ) : stats.isInitialLoad ? (
            <Skeleton className="h-[18px] mt-0.5" width={64} subtle />
          ) : (
            <div className="font-mono text-text-muted">—</div>
          )}
        </div>

        {/* Open Interest */}
        <div className="hidden xl:block">
          <Tooltip
            title="Open interest"
            content="Total notional value of open positions across all traders on this market. A proxy for how much capital is currently committed to directional bets."
            side="bottom"
          >
            <span className="text-text-muted text-[10px] cursor-help">Open Interest</span>
          </Tooltip>
          {stats.statsAvailable ? (
            <div className="font-mono text-text-primary">${formatCompact(stats.openInterest)}</div>
          ) : stats.isInitialLoad ? (
            <Skeleton className="h-[18px] mt-0.5" width={64} subtle />
          ) : (
            <div className="font-mono text-text-muted">—</div>
          )}
        </div>

        <div className="w-px h-6 bg-border" />

        {/* Funding Rate + Countdown */}
        <div>
          <Tooltip
            title="Funding rate"
            content="Periodic payment between longs and shorts to keep the perpetual price aligned with spot. Positive = longs pay shorts; negative = shorts pay longs. Charged every 8 hours."
            side="bottom"
          >
            <span className="text-text-muted text-[10px] cursor-help">Funding / Countdown</span>
          </Tooltip>
          {stats.fundingAvailable ? (
            <div className="flex items-center gap-1.5">
              <span className={cn('font-mono font-medium', stats.fundingRate >= 0 ? 'text-long' : 'text-short')}>
                {stats.fundingRate >= 0 ? '+' : ''}{stats.fundingRate.toFixed(4)}%
              </span>
              <span className="text-text-muted font-mono">{formatCountdown(stats.nextFundingSec)}</span>
            </div>
          ) : (
            <div
              className="font-mono text-text-muted"
              title="Funding accumulator not yet implemented in the contracts"
            >
              —
            </div>
          )}
        </div>
      </div>

      <div className="flex-1" />

      {/* Service health pill — green/yellow/red dot with click-to-diagnose */}
      <StatusPill />

      {/* Mode Toggle — hidden on mobile, shown in drawer */}
      <div className="hidden md:flex items-center bg-surface rounded-md p-0.5 gap-0.5">
        <button
          onClick={() => setMode('demo')}
          className={cn(
            'px-3 py-1 text-[11px] font-medium rounded transition-colors cursor-pointer',
            mode === 'demo' ? 'bg-accent text-white' : 'text-text-muted hover:text-text-primary'
          )}
        >
          Demo
        </button>
        <button
          onClick={() => setMode('live')}
          className={cn(
            'px-3 py-1 text-[11px] font-medium rounded transition-colors cursor-pointer',
            mode === 'live' ? 'bg-long text-white' : 'text-text-muted hover:text-text-primary'
          )}
        >
          Live
        </button>
      </div>

      {/* Theme Toggle — hidden on mobile, shown in drawer */}
      <button
        onClick={toggleTheme}
        className="hidden md:flex items-center justify-center w-8 h-8 rounded-md bg-surface text-text-muted hover:text-text-primary transition-colors cursor-pointer"
        title={appTheme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
      >
        {appTheme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
      </button>

      {/* Settings — desktop only; mobile gets it via the drawer */}
      <button
        onClick={() => setSettingsOpen(true)}
        className="hidden md:flex items-center justify-center w-8 h-8 rounded-md bg-surface text-text-muted hover:text-text-primary transition-colors cursor-pointer"
        title="Settings"
        aria-label="Open settings"
      >
        <Settings className="w-4 h-4" />
      </button>

      {/* About — desktop only; mobile gets it via the drawer */}
      <button
        onClick={() => setAboutOpen(true)}
        className="hidden md:flex items-center justify-center w-8 h-8 rounded-md bg-surface text-text-muted hover:text-text-primary transition-colors cursor-pointer"
        title="About"
        aria-label="About this app"
      >
        <HelpCircle className="w-4 h-4" />
      </button>

      {/* Mobile menu button — drawer trigger */}
      <button
        onClick={() => setDrawerOpen(true)}
        className="md:hidden flex items-center justify-center w-9 h-9 rounded-md bg-surface text-text-muted hover:text-text-primary transition-colors cursor-pointer"
        title="Menu"
        aria-label="Open menu"
      >
        <Menu className="w-4 h-4" />
      </button>

      <MobileMenuDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        stats={stats}
        mode={mode}
        setMode={setMode}
        theme={appTheme}
        toggleTheme={toggleTheme}
        onOpenSettings={() => {
          setDrawerOpen(false)
          setSettingsOpen(true)
        }}
        onOpenAbout={() => {
          setDrawerOpen(false)
          setAboutOpen(true)
        }}
      />

      <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />
      <AboutModal open={aboutOpen} onClose={() => setAboutOpen(false)} />

      {/* Wallet Section */}
      {isConnected ? (
        <div className="flex items-center gap-3">
          {mode === 'demo' && faucetAvailable && (
            <button
              onClick={() => mint(10_000)}
              disabled={minting}
              className="w-[72px] text-[10px] bg-accent-dim text-accent px-2 py-1 rounded hover:bg-accent-dim/80 transition-colors cursor-pointer disabled:opacity-50 text-center"
            >
              {minting ? '...' : '+ 10K USDC'}
            </button>
          )}

          <div className="hidden md:block text-xs">
            <span className="text-text-muted">USDC</span>
            <span className="ml-1.5 font-mono text-text-primary font-medium">${formatUsd(usdcBalance)}</span>
          </div>

          <Dropdown
            trigger={
              <>
                {isDemoAccount
                  ? <div className="w-4 h-4 rounded-full bg-long/20 flex items-center justify-center text-[8px] text-long font-bold">D</div>
                  : <Wallet className="w-3.5 h-3.5" />
                }
                <span className="font-mono">{truncatedAddress}</span>
                {isDemoAccount && <span className="text-[9px] bg-long/20 text-long px-1 rounded">DEMO</span>}
                <span className="text-[10px] text-accent/60">{CHAIN_NAMES[chainId] || `Chain ${chainId}`}</span>
              </>
            }
            align="right"
            width="min-w-[200px]"
          >
            <div className="px-4 py-3 border-b border-border" onClick={e => e.stopPropagation()}>
              <div className="text-xs text-text-muted">Connected as</div>
              <div className="text-sm font-mono text-text-primary mt-0.5">{truncatedAddress}</div>
            </div>
            <button
              onClick={() => disconnect()}
              className="flex items-center gap-2 w-full px-4 py-2.5 text-xs text-short hover:bg-panel-light transition-colors cursor-pointer"
            >
              <LogOut className="w-3.5 h-3.5" />
              Disconnect
            </button>
          </Dropdown>
        </div>
      ) : (
        <Dropdown
          trigger={
            <>
              <Wallet className="w-3.5 h-3.5" />
              Connect Wallet
            </>
          }
          align="right"
          width="min-w-[220px]"
        >
          {mode === 'demo' ? (
            <>
              <div className="text-[10px] text-text-muted uppercase tracking-wider px-2 py-1" onClick={e => e.stopPropagation()}>
                Demo Accounts
              </div>
              {connectors.filter(c => c.type === 'demo').map(connector => (
                <DropdownItem key={connector.uid} onClick={() => connect({ connector })}>
                  <div className="flex items-center gap-2">
                    <div className="w-5 h-5 rounded-full bg-long/20 flex items-center justify-center text-[10px] text-long font-bold">D</div>
                    <span>{connector.name}</span>
                  </div>
                </DropdownItem>
              ))}
              <div className="text-[10px] text-text-muted px-3 py-2 border-t border-border" onClick={e => e.stopPropagation()}>
                No real wallet needed in Demo mode
              </div>
            </>
          ) : (
            <>
              <div className="text-[10px] text-text-muted uppercase tracking-wider px-2 py-1" onClick={e => e.stopPropagation()}>
                Real Wallets
              </div>
              {connectors.filter(c => c.type !== 'demo').map(connector => (
                <DropdownItem key={connector.uid} onClick={() => connect({ connector })}>
                  <div className="flex items-center gap-2">
                    <Wallet className="w-4 h-4 text-accent" />
                    {connector.name}
                  </div>
                </DropdownItem>
              ))}
              {connectors.filter(c => c.type !== 'demo').length === 0 && (
                <div className="text-[10px] text-text-muted px-3 py-2" onClick={e => e.stopPropagation()}>
                  No wallet detected. Install MetaMask.
                </div>
              )}
              {/* Local Anvil accounts work in live mode too — the demo
                  connector proxies real reads/writes to Anvil so they
                  behave like a headless local wallet. Useful when you
                  want to test the contract path without setting up
                  MetaMask + a custom Anvil network. */}
              <div className="text-[10px] text-text-muted uppercase tracking-wider px-2 py-1 border-t border-border mt-1 pt-2" onClick={e => e.stopPropagation()}>
                Local Anvil Accounts
              </div>
              {connectors.filter(c => c.type === 'demo').map(connector => (
                <DropdownItem key={connector.uid} onClick={() => connect({ connector })}>
                  <div className="flex items-center gap-2">
                    <div className="w-5 h-5 rounded-full bg-long/20 flex items-center justify-center text-[10px] text-long font-bold">D</div>
                    <span>{connector.name}</span>
                  </div>
                </DropdownItem>
              ))}
            </>
          )}
        </Dropdown>
      )}
    </header>
  )
}

// ─── Mobile menu drawer ────────────────────────────────────────────────────
//
// Hosts the bits we hide from the top-of-screen header on small viewports:
// the 24h stats grid, the demo/live mode toggle, and the theme toggle. The
// wallet section stays in the header itself because connection status is
// too important to require an extra tap to see.

interface MobileMenuDrawerProps {
  open: boolean
  onClose: () => void
  stats: ReturnType<typeof useMarketStats>
  mode: AppMode
  setMode: (m: AppMode) => void
  theme: 'light' | 'dark'
  toggleTheme: () => void
  onOpenSettings: () => void
  onOpenAbout: () => void
}

function MobileMenuDrawer({
  open, onClose, stats, mode, setMode, theme, toggleTheme, onOpenSettings, onOpenAbout,
}: MobileMenuDrawerProps) {
  return (
    <Drawer open={open} onClose={onClose} title="Menu" widthClass="w-[300px]">
      <div className="p-4 space-y-5">
        {/* Mode Toggle */}
        <section>
          <div className="text-[10px] text-text-muted uppercase tracking-wider mb-2">Mode</div>
          <div className="flex items-center bg-surface rounded-md p-1 gap-1">
            <button
              onClick={() => { setMode('demo'); onClose() }}
              className={cn(
                'flex-1 py-2 text-xs font-medium rounded transition-colors cursor-pointer',
                mode === 'demo' ? 'bg-accent text-white' : 'text-text-muted hover:text-text-primary',
              )}
            >
              Demo
            </button>
            <button
              onClick={() => { setMode('live'); onClose() }}
              className={cn(
                'flex-1 py-2 text-xs font-medium rounded transition-colors cursor-pointer',
                mode === 'live' ? 'bg-long text-white' : 'text-text-muted hover:text-text-primary',
              )}
            >
              Live
            </button>
          </div>
        </section>

        {/* Theme Toggle */}
        <section>
          <div className="text-[10px] text-text-muted uppercase tracking-wider mb-2">Appearance</div>
          <button
            onClick={toggleTheme}
            className="flex items-center justify-between w-full bg-surface hover:bg-panel-light rounded-md px-3 py-2.5 transition-colors cursor-pointer"
          >
            <span className="text-xs text-text-secondary">
              {theme === 'dark' ? 'Dark' : 'Light'} mode
            </span>
            {theme === 'dark' ? <Sun className="w-4 h-4 text-text-muted" /> : <Moon className="w-4 h-4 text-text-muted" />}
          </button>
        </section>

        {/* Settings + About entries */}
        <section>
          <div className="text-[10px] text-text-muted uppercase tracking-wider mb-2">Preferences</div>
          <div className="space-y-1.5">
            <button
              onClick={onOpenSettings}
              className="flex items-center justify-between w-full bg-surface hover:bg-panel-light rounded-md px-3 py-2.5 transition-colors cursor-pointer"
            >
              <span className="text-xs text-text-secondary">Settings…</span>
              <Settings className="w-4 h-4 text-text-muted" />
            </button>
            <button
              onClick={onOpenAbout}
              className="flex items-center justify-between w-full bg-surface hover:bg-panel-light rounded-md px-3 py-2.5 transition-colors cursor-pointer"
            >
              <span className="text-xs text-text-secondary">About this app</span>
              <HelpCircle className="w-4 h-4 text-text-muted" />
            </button>
          </div>
        </section>

        {/* 24h Stats */}
        <section>
          <div className="text-[10px] text-text-muted uppercase tracking-wider mb-2">24h Statistics</div>
          <div className="bg-surface/60 rounded-md p-3 space-y-2 text-xs">
            <DrawerStatRow
              label="Change"
              value={stats.statsAvailable
                ? `${stats.change24h >= 0 ? '+' : ''}${stats.change24h.toFixed(2)}%`
                : '—'}
              valueClass={stats.statsAvailable
                ? (stats.change24h >= 0 ? 'text-long' : 'text-short')
                : 'text-text-muted'}
            />
            <DrawerStatRow
              label="High"
              value={stats.statsAvailable ? `$${formatUsd(stats.high24h)}` : '—'}
            />
            <DrawerStatRow
              label="Low"
              value={stats.statsAvailable ? `$${formatUsd(stats.low24h)}` : '—'}
            />
            <DrawerStatRow
              label="Volume"
              value={stats.statsAvailable ? `$${formatCompact(stats.volume24h)}` : '—'}
            />
            <DrawerStatRow
              label="Open Interest"
              value={stats.statsAvailable ? `$${formatCompact(stats.openInterest)}` : '—'}
            />
            <DrawerStatRow
              label="Funding"
              value={stats.fundingAvailable
                ? `${stats.fundingRate >= 0 ? '+' : ''}${stats.fundingRate.toFixed(4)}%`
                : '—'}
              valueClass={stats.fundingAvailable
                ? (stats.fundingRate >= 0 ? 'text-long' : 'text-short')
                : 'text-text-muted'}
            />
          </div>
        </section>
      </div>
    </Drawer>
  )
}

function DrawerStatRow({
  label, value, valueClass,
}: {
  label: string
  value: string
  valueClass?: string
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-text-muted">{label}</span>
      <span className={cn('font-mono tabular-nums', valueClass ?? 'text-text-primary')}>{value}</span>
    </div>
  )
}
