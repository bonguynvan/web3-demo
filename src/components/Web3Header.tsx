/**
 * Web3Header — market bar with real wallet connection and on-chain data.
 */

import { useEffect, useState } from 'react'
import { useAccount, useConnect, useDisconnect, useChainId } from 'wagmi'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { ChevronDown, Wallet, Zap, LogOut, Menu, Sun, Moon, Settings, HelpCircle, Target } from 'lucide-react'
import { FlashPrice } from './ui/FlashPrice'
import { useTradingStore } from '../store/tradingStore'
import { useUsdcBalance } from '../hooks/useTokenBalance'
import { usePrices } from '../hooks/usePrices'
import { useMarketStats } from '../hooks/useMarketStats'
import { useModeStore, type AppMode } from '../store/modeStore'
import { useThemeStore } from '../store/themeStore'
import { cn, formatUsd, formatCompact, formatCountdown } from '../lib/format'
import { Dropdown, DropdownItem } from './ui/Dropdown'
import { Drawer } from './ui/Drawer'
import { Skeleton } from './ui/Skeleton'
import { Tooltip } from './ui/Tooltip'
import { StatusPill } from './StatusPill'
import { VenueSwitcher } from './VenueSwitcher'
import { NotificationBell } from './NotificationBell'
import { PriceAlertModal } from './PriceAlertModal'
import { SettingsModal } from './SettingsModal'
import { AboutModal } from './AboutModal'

const CHAIN_NAMES: Record<number, string> = {
  31337: 'Anvil',
  42161: 'Arbitrum',
  8453: 'Base',
}

// NAV_ITEMS moved to Sidebar.tsx for desktop. Mobile drawer still has its
// own nav section via MobileMenuDrawer.

export function Web3Header() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { markets, selectedMarket, setSelectedMarket } = useTradingStore()

  const { address, isConnected, connector } = useAccount()
  const isDemoAccount = connector?.type === 'demo'
  const chainId = useChainId()
  const { connect, connectors } = useConnect()
  const { disconnect } = useDisconnect()

  const { dollars: usdcBalance } = useUsdcBalance()
  const { getPrice } = usePrices()
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
  const priceLabel = mode === 'demo' ? t('perp:binance') : t('perp:oracle')

  const truncatedAddress = address
    ? `${address.slice(0, 6)}...${address.slice(-4)}`
    : ''

  // Mobile drawer for stats + mode + theme. Desktop gets these via Sidebar.
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [alertsOpen, setAlertsOpen] = useState(false)

  return (
    <header className="flex items-center h-14 bg-panel border-b border-border px-3 md:px-4 gap-3 md:gap-4 shrink-0">
      {/* Logo — mobile only (desktop logo is in the sidebar) */}
      <button
        onClick={() => navigate('/trade')}
        className="md:hidden flex items-center gap-2 cursor-pointer"
      >
        <Zap className="w-5 h-5 text-accent shrink-0" />
      </button>

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

      {/* Venue switcher — desktop only */}
      <div className="hidden md:flex items-center">
        <VenueSwitcher />
      </div>

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
          <span className="text-text-muted text-[10px]">{t('perp:24h_change')}</span>
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
          <span className="text-text-muted text-[10px]">{t('perp:24h_high')}</span>
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
          <span className="text-text-muted text-[10px]">{t('perp:24h_low')}</span>
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
          <span className="text-text-muted text-[10px]">{t('perp:24h_volume')}</span>
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
            <span className="text-text-muted text-[10px] cursor-help">{t('perp:open_interest')}</span>
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
            <span className="text-text-muted text-[10px] cursor-help">{t('perp:funding_countdown')}</span>
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

      {/* Alerts + Notifications — desktop only */}
      {isConnected && (
        <div className="hidden md:flex items-center gap-1">
          <button
            onClick={() => setAlertsOpen(true)}
            className="flex items-center justify-center w-8 h-8 rounded-md bg-surface text-text-muted hover:text-text-primary transition-colors cursor-pointer"
            title="Price Alerts"
          >
            <Target className="w-4 h-4" />
          </button>
          <NotificationBell />
        </div>
      )}

      {/* Mode/Theme/Settings/About moved to Sidebar for desktop.
          Mobile still gets them via the drawer below. */}

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
      />

      {/* SettingsModal + AboutModal now live in Sidebar (desktop) and
          MobileMenuDrawer (mobile). Only PriceAlertModal stays here since
          it's triggered from the header's alert bell. */}
      <PriceAlertModal open={alertsOpen} onClose={() => setAlertsOpen(false)} />

      {/* Wallet Section */}
      {isConnected ? (
        <div className="flex items-center gap-2 md:gap-3">
          {/* Balance — desktop only */}
          <div className="hidden md:block text-xs">
            <span className="text-text-muted">USDC</span>
            <span className="ml-1.5 font-mono text-text-primary font-medium">${formatUsd(usdcBalance)}</span>
          </div>

          <Dropdown
            trigger={
              <>
                {isDemoAccount
                  ? <div className="w-4 h-4 rounded-full bg-long/20 flex items-center justify-center text-[8px] text-long font-bold shrink-0">D</div>
                  : <Wallet className="w-3.5 h-3.5 shrink-0" />
                }
                {/* Mobile: just short address. Desktop: address + badge + chain */}
                <span className="font-mono text-[11px] md:text-xs">{truncatedAddress}</span>
                {isDemoAccount && <span className="hidden md:inline text-[9px] bg-long/20 text-long px-1 rounded">DEMO</span>}
                <span className="hidden md:inline text-[10px] text-accent/60">{CHAIN_NAMES[chainId] || `Chain ${chainId}`}</span>
              </>
            }
            align="right"
            width="min-w-[200px]"
          >
            <div className="px-4 py-3 border-b border-border" onClick={e => e.stopPropagation()}>
              <div className="text-xs text-text-muted">{t('connected_as')}</div>
              <div className="text-sm font-mono text-text-primary mt-0.5">{truncatedAddress}</div>
              <div className="text-[10px] text-text-muted mt-0.5">
                {CHAIN_NAMES[chainId] || `Chain ${chainId}`}
                {isDemoAccount && ' · Demo account'}
              </div>
            </div>
            <button
              onClick={() => disconnect()}
              className="flex items-center gap-2 w-full px-4 py-2.5 text-xs text-short hover:bg-panel-light transition-colors cursor-pointer"
            >
              <LogOut className="w-3.5 h-3.5" />
              {t('disconnect')}
            </button>
          </Dropdown>
        </div>
      ) : (
        <Dropdown
          trigger={
            <>
              <Wallet className="w-3.5 h-3.5" />
              <span className="hidden md:inline">{t('connect_wallet')}</span>
              <span className="md:hidden">{t('connect')}</span>
            </>
          }
          align="right"
          width="min-w-[220px]"
        >
          {mode === 'demo' ? (
            <>
              <div className="text-[10px] text-text-muted uppercase tracking-wider px-2 py-1" onClick={e => e.stopPropagation()}>
                {t('demo_accounts')}
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
                {t('no_wallet_needed_demo')}
              </div>
            </>
          ) : (
            <>
              <div className="text-[10px] text-text-muted uppercase tracking-wider px-2 py-1" onClick={e => e.stopPropagation()}>
                {t('real_wallets')}
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
                  {t('no_wallet_detected')}
                </div>
              )}
              {/* Local Anvil accounts work in live mode too — the demo
                  connector proxies real reads/writes to Anvil so they
                  behave like a headless local wallet. Useful when you
                  want to test the contract path without setting up
                  MetaMask + a custom Anvil network. */}
              <div className="text-[10px] text-text-muted uppercase tracking-wider px-2 py-1 border-t border-border mt-1 pt-2" onClick={e => e.stopPropagation()}>
                {t('local_anvil_accounts')}
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
}

function MobileMenuDrawer({
  open, onClose, stats, mode, setMode, theme, toggleTheme,
}: MobileMenuDrawerProps) {
  const { t } = useTranslation()
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [aboutOpen, setAboutOpen] = useState(false)

  return (
    <>
    <Drawer open={open} onClose={onClose} title={t('menu')} widthClass="w-[300px]">
      <div className="p-4 space-y-5">
        {/* Mode Toggle */}
        <section>
          <div className="text-[10px] text-text-muted uppercase tracking-wider mb-2">{t('mode')}</div>
          <div className="flex items-center bg-surface rounded-md p-1 gap-1">
            <button
              onClick={() => { setMode('demo'); onClose() }}
              className={cn(
                'flex-1 py-2 text-xs font-medium rounded transition-colors cursor-pointer',
                mode === 'demo' ? 'bg-accent text-white' : 'text-text-muted hover:text-text-primary',
              )}
            >
              {t('demo')}
            </button>
            <button
              onClick={() => { setMode('live'); onClose() }}
              className={cn(
                'flex-1 py-2 text-xs font-medium rounded transition-colors cursor-pointer',
                mode === 'live' ? 'bg-long text-white' : 'text-text-muted hover:text-text-primary',
              )}
            >
              {t('live')}
            </button>
          </div>
        </section>

        {/* Theme Toggle */}
        <section>
          <div className="text-[10px] text-text-muted uppercase tracking-wider mb-2">{t('appearance')}</div>
          <button
            onClick={toggleTheme}
            className="flex items-center justify-between w-full bg-surface hover:bg-panel-light rounded-md px-3 py-2.5 transition-colors cursor-pointer"
          >
            <span className="text-xs text-text-secondary">
              {theme === 'dark' ? t('dark_mode') : t('light_mode')}
            </span>
            {theme === 'dark' ? <Sun className="w-4 h-4 text-text-muted" /> : <Moon className="w-4 h-4 text-text-muted" />}
          </button>
        </section>

        {/* Settings + About entries */}
        <section>
          <div className="text-[10px] text-text-muted uppercase tracking-wider mb-2">{t('preferences')}</div>
          <div className="space-y-1.5">
            <button
              onClick={() => { onClose(); setSettingsOpen(true) }}
              className="flex items-center justify-between w-full bg-surface hover:bg-panel-light rounded-md px-3 py-2.5 transition-colors cursor-pointer"
            >
              <span className="text-xs text-text-secondary">{t('settings')}…</span>
              <Settings className="w-4 h-4 text-text-muted" />
            </button>
            <button
              onClick={() => { onClose(); setAboutOpen(true) }}
              className="flex items-center justify-between w-full bg-surface hover:bg-panel-light rounded-md px-3 py-2.5 transition-colors cursor-pointer"
            >
              <span className="text-xs text-text-secondary">{t('about')}</span>
              <HelpCircle className="w-4 h-4 text-text-muted" />
            </button>
          </div>
        </section>

        {/* 24h Stats */}
        <section>
          <div className="text-[10px] text-text-muted uppercase tracking-wider mb-2">{t('statistics_24h')}</div>
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

    <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    <AboutModal open={aboutOpen} onClose={() => setAboutOpen(false)} />
    </>
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
