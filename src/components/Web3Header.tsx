/**
 * Web3Header — two-row header for the trading workstation.
 *
 *   Top bar (h-12):    global controls — venue, status, alerts, bell, wallet, mobile menu
 *   Market bar (h-12): per-market context — selector + price + 24h stats + funding
 *
 * Sidebar still owns desktop brand + page nav + theme/settings/about.
 * Mobile gets brand here (sidebar hidden) and a hamburger to the same
 * MobileMenuDrawer with mode/theme/preferences/24h stats.
 */

import { useState } from 'react'
import { useAccount, useConnect, useDisconnect, useChainId } from 'wagmi'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import {
  ChevronDown, Wallet, LogOut, Menu, Target, BarChart3,
} from 'lucide-react'
import { FlashPrice } from './ui/FlashPrice'
import { useTradingStore } from '../store/tradingStore'
import { useUsdcBalance } from '../hooks/useTokenBalance'
import { usePrices } from '../hooks/usePrices'
import { useMarketStats } from '../hooks/useMarketStats'
import { useModeStore } from '../store/modeStore'
import { useVaultSessionStore } from '../store/vaultSessionStore'
import { PlaceOrderModal } from './PlaceOrderModal'
import { useThemeStore } from '../store/themeStore'
import { cn, formatUsd, formatCompact, formatCountdown } from '../lib/format'
import { Dropdown, DropdownItem } from './ui/Dropdown'
import { Skeleton } from './ui/Skeleton'
import { Tooltip } from './ui/Tooltip'
import { StatusPill } from './StatusPill'
import { VenueSwitcher } from './VenueSwitcher'
import { NotificationBell } from './NotificationBell'
import { PriceAlertModal } from './PriceAlertModal'
import { MobileMenuDrawer } from './MobileMenuDrawer'

const CHAIN_NAMES: Record<number, string> = {
  31337: 'Anvil',
  42161: 'Arbitrum',
  8453: 'Base',
}

export function Web3Header() {
  const { mode, setMode } = useModeStore()
  const { theme: appTheme, toggleTheme } = useThemeStore()
  const stats = useMarketStats()

  const [drawerOpen, setDrawerOpen] = useState(false)
  const [alertsOpen, setAlertsOpen] = useState(false)

  // Mode toggle was removed in the trading-terminal pivot. Wallet
  // connections are now whatever the user chose — no auto-disconnect
  // on mode change, no auto-connect to a demo wallet.

  return (
    <div className="flex flex-col shrink-0">
      <TopBar
        onOpenAlerts={() => setAlertsOpen(true)}
        onOpenDrawer={() => setDrawerOpen(true)}
      />
      <MarketBar />

      <MobileMenuDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        stats={stats}
        mode={mode}
        setMode={setMode}
        theme={appTheme}
        toggleTheme={toggleTheme}
      />
      <PriceAlertModal open={alertsOpen} onClose={() => setAlertsOpen(false)} />
    </div>
  )
}

// ─── Top bar — global controls ──────────────────────────────────────────────

function TopBar({
  onOpenAlerts, onOpenDrawer,
}: {
  onOpenAlerts: () => void
  onOpenDrawer: () => void
}) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { isConnected, address, connector } = useAccount()
  const { connect, connectors } = useConnect()
  const { disconnect } = useDisconnect()
  const chainId = useChainId()
  const { dollars: usdcBalance } = useUsdcBalance()
  const { mode } = useModeStore()
  const isDemoAccount = connector?.type === 'demo'
  const truncatedAddress = address ? `${address.slice(0, 6)}...${address.slice(-4)}` : ''

  return (
    <header className="flex items-center h-12 bg-panel border-b border-border px-3 md:px-4 gap-3 shrink-0">
      {/* Mobile-only brand — desktop has it in Sidebar */}
      <button
        onClick={() => navigate('/')}
        title="Back to TradingDek home"
        className="md:hidden flex items-center gap-2 cursor-pointer"
      >
        <div className="flex items-center justify-center w-7 h-7 rounded-md bg-accent text-white">
          <BarChart3 className="w-4 h-4" />
        </div>
      </button>

      {/* Push everything else to the right */}
      <div className="flex-1" />

      {/* Venue switcher — primary global control on desktop */}
      <div className="hidden md:flex">
        <VenueSwitcher />
      </div>

      {/* Service health */}
      <StatusPill />

      {/* Alerts + bell — connected only */}
      {isConnected && (
        <div className="flex items-center gap-1">
          <button
            onClick={onOpenAlerts}
            className="hidden md:flex items-center justify-center w-8 h-8 rounded-md bg-surface text-text-muted hover:text-text-primary transition-colors cursor-pointer"
            title="Price Alerts"
          >
            <Target className="w-4 h-4" />
          </button>
          <NotificationBell />
        </div>
      )}

      {/* Wallet area */}
      {isConnected ? (
        <Dropdown
          trigger={
            <>
              {isDemoAccount
                ? <div className="w-4 h-4 rounded-full bg-long/20 flex items-center justify-center text-[8px] text-long font-bold shrink-0">D</div>
                : <Wallet className="w-3.5 h-3.5 shrink-0" />
              }
              <span className="font-mono text-[11px] md:text-xs">{truncatedAddress}</span>
              {isDemoAccount && <span className="hidden md:inline text-[9px] bg-long/20 text-long px-1 rounded">DEMO</span>}
              <span className="hidden lg:inline text-[10px] text-accent/60">{CHAIN_NAMES[chainId] || `Chain ${chainId}`}</span>
            </>
          }
          align="right"
          width="min-w-[220px]"
        >
          <div className="px-4 py-3 border-b border-border" onClick={e => e.stopPropagation()}>
            <div className="text-xs text-text-muted">{t('connected_as')}</div>
            <div className="text-sm font-mono text-text-primary mt-0.5">{truncatedAddress}</div>
            <div className="text-[10px] text-text-muted mt-0.5">
              {CHAIN_NAMES[chainId] || `Chain ${chainId}`}
              {isDemoAccount && ' · Demo account'}
            </div>
            <div className="text-[10px] text-text-muted mt-2 flex items-center justify-between gap-2">
              <span>USDC balance</span>
              <span className="font-mono text-text-primary">${formatUsd(usdcBalance)}</span>
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
              {connectors.filter(c => c.type === 'demo').map(c => (
                <DropdownItem key={c.uid} onClick={() => connect({ connector: c })}>
                  <div className="flex items-center gap-2">
                    <div className="w-5 h-5 rounded-full bg-long/20 flex items-center justify-center text-[10px] text-long font-bold">D</div>
                    <span>{c.name}</span>
                  </div>
                </DropdownItem>
              ))}
            </>
          ) : (
            <>
              <div className="text-[10px] text-text-muted uppercase tracking-wider px-2 py-1" onClick={e => e.stopPropagation()}>
                {t('real_wallets')}
              </div>
              {connectors.filter(c => c.type !== 'demo').map(c => (
                <DropdownItem key={c.uid} onClick={() => connect({ connector: c })}>
                  <div className="flex items-center gap-2">
                    <Wallet className="w-4 h-4 text-accent" />
                    {c.name}
                  </div>
                </DropdownItem>
              ))}
              {connectors.filter(c => c.type !== 'demo').length === 0 && (
                <div className="text-[10px] text-text-muted px-3 py-2" onClick={e => e.stopPropagation()}>
                  {t('no_wallet_detected')}
                </div>
              )}
            </>
          )}
        </Dropdown>
      )}

      {/* Mobile menu */}
      <button
        onClick={onOpenDrawer}
        className="md:hidden flex items-center justify-center w-9 h-9 rounded-md bg-surface text-text-muted hover:text-text-primary transition-colors cursor-pointer"
        title="Menu"
        aria-label="Open menu"
      >
        <Menu className="w-4 h-4" />
      </button>
    </header>
  )
}

// ─── Market bar — per-market context ────────────────────────────────────────

function MarketBar() {
  const { t } = useTranslation()
  const { markets, selectedMarket, setSelectedMarket } = useTradingStore()
  const { getPrice } = usePrices()
  const stats = useMarketStats()
  const { mode } = useModeStore()
  const currentPrice = getPrice(selectedMarket.symbol)
  const priceLabel = mode === 'demo' ? t('perp:binance') : t('perp:oracle')
  const vaultUnlocked = useVaultSessionStore(s => s.unlocked)
  const [placeOrderOpen, setPlaceOrderOpen] = useState(false)

  return (
    <div className="flex items-center h-12 bg-panel/60 border-b border-border px-3 md:px-4 gap-3 md:gap-5 shrink-0 overflow-x-auto">
      {/* Market selector */}
      <Dropdown
        trigger={
          <>
            <span className="font-semibold text-text-primary text-sm">{selectedMarket.symbol}</span>
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
                m.symbol === selectedMarket.symbol && 'bg-panel-light',
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

      {/* Price + 24h change */}
      <div className="flex items-center gap-3 shrink-0">
        <div>
          <div className="text-[9px] text-text-muted uppercase tracking-wider">{priceLabel}</div>
          <div className="text-sm font-semibold leading-tight">
            {currentPrice && currentPrice.price > 0 ? (
              <FlashPrice value={currentPrice.price} size="md" showArrow format={n => `$${formatUsd(n)}`} />
            ) : (
              <span className="font-mono text-text-muted">$---</span>
            )}
          </div>
        </div>

        <Stat label={t('perp:24h_change')}>
          {stats.statsAvailable ? (
            <span className={cn(
              'font-mono font-medium leading-tight',
              stats.change24h >= 0 ? 'text-long' : 'text-short',
            )}>
              {stats.change24h >= 0 ? '+' : ''}{stats.change24h.toFixed(2)}%
            </span>
          ) : stats.isInitialLoad ? (
            <Skeleton className="h-[18px] mt-0.5" width={56} subtle />
          ) : (
            <span className="font-mono text-text-muted">—</span>
          )}
        </Stat>
      </div>

      <Divider />

      <Stat label={t('perp:24h_high')} className="hidden md:block">
        {stats.statsAvailable ? (
          <span className="font-mono text-text-primary leading-tight">${formatUsd(stats.high24h)}</span>
        ) : stats.isInitialLoad ? (
          <Skeleton className="h-[18px] mt-0.5" width={64} subtle />
        ) : (
          <span className="font-mono text-text-muted">—</span>
        )}
      </Stat>

      <Stat label={t('perp:24h_low')} className="hidden md:block">
        {stats.statsAvailable ? (
          <span className="font-mono text-text-primary leading-tight">${formatUsd(stats.low24h)}</span>
        ) : stats.isInitialLoad ? (
          <Skeleton className="h-[18px] mt-0.5" width={64} subtle />
        ) : (
          <span className="font-mono text-text-muted">—</span>
        )}
      </Stat>

      <Stat label={t('perp:24h_volume')} className="hidden md:block">
        {stats.statsAvailable ? (
          <span className="font-mono text-text-primary leading-tight">${formatCompact(stats.volume24h)}</span>
        ) : stats.isInitialLoad ? (
          <Skeleton className="h-[18px] mt-0.5" width={56} subtle />
        ) : (
          <span className="font-mono text-text-muted">—</span>
        )}
      </Stat>

      <Stat label={t('perp:open_interest')} className="hidden xl:block">
        {stats.statsAvailable ? (
          <Tooltip
            title="Open interest"
            content="Total notional value of open positions across all traders. A proxy for committed capital."
            side="bottom"
          >
            <span className="font-mono text-text-primary leading-tight cursor-help">${formatCompact(stats.openInterest)}</span>
          </Tooltip>
        ) : stats.isInitialLoad ? (
          <Skeleton className="h-[18px] mt-0.5" width={56} subtle />
        ) : (
          <span className="font-mono text-text-muted">—</span>
        )}
      </Stat>

      <Divider />

      <Stat label={t('perp:funding_countdown')}>
        {stats.fundingAvailable ? (
          <Tooltip
            title="Funding rate"
            content="Periodic payment between longs and shorts. Positive = longs pay shorts. Charged every 8 hours."
            side="bottom"
          >
            <div className="flex items-center gap-1.5 leading-tight cursor-help">
              <span className={cn('font-mono font-medium', stats.fundingRate >= 0 ? 'text-long' : 'text-short')}>
                {stats.fundingRate >= 0 ? '+' : ''}{stats.fundingRate.toFixed(4)}%
              </span>
              <span className="text-text-muted font-mono text-[10px]">{formatCountdown(stats.nextFundingSec)}</span>
            </div>
          </Tooltip>
        ) : (
          <span className="font-mono text-text-muted leading-tight">—</span>
        )}
      </Stat>

      {vaultUnlocked && (
        <button
          onClick={() => setPlaceOrderOpen(true)}
          title={`Place a limit order on ${selectedMarket.symbol}`}
          className="ml-auto shrink-0 px-3 py-1.5 text-xs font-semibold rounded-md bg-accent text-white hover:bg-accent/90 transition-colors cursor-pointer"
        >
          Trade
        </button>
      )}

      <PlaceOrderModal
        open={placeOrderOpen}
        onClose={() => setPlaceOrderOpen(false)}
        defaultMarketId={selectedMarket.symbol}
      />
    </div>
  )
}

function Stat({
  label, children, className,
}: {
  label: string
  children: React.ReactNode
  className?: string
}) {
  return (
    <div className={cn('shrink-0', className)}>
      <div className="text-[9px] text-text-muted uppercase tracking-wider">{label}</div>
      <div className="text-xs">{children}</div>
    </div>
  )
}

function Divider() {
  return <div className="w-px h-6 bg-border shrink-0 hidden md:block" />
}
