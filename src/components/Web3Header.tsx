/**
 * Web3Header — market bar with real wallet connection and on-chain data.
 */

import { useEffect } from 'react'
import { useAccount, useConnect, useDisconnect, useChainId } from 'wagmi'
import { ChevronDown, Wallet, Zap, LogOut } from 'lucide-react'
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
  // - Demo → Live: disconnect demo account (user must manually connect external)
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
    } else if (mode === 'live') {
      // Disconnect demo account — user must manually connect external wallet
      if (isConnected && isDemoAccount) {
        disconnect()
      }
    }
  }, [mode, isConnected, isDemoAccount, connector, connectors, connect, disconnect])

  const currentPrice = getPrice(selectedMarket.symbol)
  const priceLabel = mode === 'demo' ? 'Binance' : 'Oracle'

  const truncatedAddress = address
    ? `${address.slice(0, 6)}...${address.slice(-4)}`
    : ''

  return (
    <header className="flex items-center h-14 bg-panel border-b border-border px-4 gap-6 shrink-0">
      {/* Logo */}
      <div className="flex items-center gap-2 mr-2">
        <Zap className="w-5 h-5 text-accent" />
        <span className="font-semibold text-text-primary text-sm">PERP DEX</span>
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

      {/* Market Stats Bar */}
      <div className="flex items-center gap-4 text-xs overflow-hidden">
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
          <div className={cn('font-mono font-medium', stats.change24h >= 0 ? 'text-long' : 'text-short')}>
            {stats.change24h >= 0 ? '+' : ''}{stats.change24h.toFixed(2)}%
          </div>
        </div>

        {/* 24h High */}
        <div>
          <span className="text-text-muted text-[10px]">24h High</span>
          <div className="font-mono text-text-primary">${formatUsd(stats.high24h)}</div>
        </div>

        {/* 24h Low */}
        <div>
          <span className="text-text-muted text-[10px]">24h Low</span>
          <div className="font-mono text-text-primary">${formatUsd(stats.low24h)}</div>
        </div>

        {/* 24h Volume */}
        <div>
          <span className="text-text-muted text-[10px]">24h Volume</span>
          <div className="font-mono text-text-primary">${formatCompact(stats.volume24h)}</div>
        </div>

        {/* Open Interest */}
        <div className="hidden xl:block">
          <span className="text-text-muted text-[10px]">Open Interest</span>
          <div className="font-mono text-text-primary">${formatCompact(stats.openInterest)}</div>
        </div>

        <div className="w-px h-6 bg-border" />

        {/* Funding Rate + Countdown */}
        <div>
          <span className="text-text-muted text-[10px]">Funding / Countdown</span>
          <div className="flex items-center gap-1.5">
            <span className={cn('font-mono font-medium', stats.fundingRate >= 0 ? 'text-long' : 'text-short')}>
              {stats.fundingRate >= 0 ? '+' : ''}{stats.fundingRate.toFixed(4)}%
            </span>
            <span className="text-text-muted font-mono">{formatCountdown(stats.nextFundingSec)}</span>
          </div>
        </div>
      </div>

      <div className="flex-1" />

      {/* Mode Toggle */}
      <div className="flex items-center bg-surface rounded-md p-0.5 gap-0.5">
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

      {/* Theme Toggle */}
      <button
        onClick={toggleTheme}
        className="flex items-center justify-center w-8 h-8 rounded-md bg-surface text-text-muted hover:text-text-primary transition-colors cursor-pointer"
        title={appTheme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
      >
        {appTheme === 'dark' ? (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="5" /><line x1="12" y1="1" x2="12" y2="3" /><line x1="12" y1="21" x2="12" y2="23" /><line x1="4.22" y1="4.22" x2="5.64" y2="5.64" /><line x1="18.36" y1="18.36" x2="19.78" y2="19.78" /><line x1="1" y1="12" x2="3" y2="12" /><line x1="21" y1="12" x2="23" y2="12" /><line x1="4.22" y1="19.78" x2="5.64" y2="18.36" /><line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
          </svg>
        ) : (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
          </svg>
        )}
      </button>

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

          <div className="text-xs">
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
                Connect Wallet
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
            </>
          )}
        </Dropdown>
      )}
    </header>
  )
}
