/**
 * SpotSwapForm — token swap interface using 0x Swap API.
 *
 * Layout:
 *  [You Pay]                    [Token Pill ▾]
 *  [Amount input]         Bal: X.XX [Max]
 *             ↕ (flip button)
 *  [You Receive]                [Token Pill ▾]
 *  [Computed output]      ≈ $X.XX
 *  ─────────────────────────────────────────
 *  [Quote details: rate, impact, gas]
 *  ─────────────────────────────────────────
 *  [     Swap ETH for USDC     ]
 */

import { useState, useCallback } from 'react'
import { useAccount, useChainId } from 'wagmi'
import { ArrowDownUp, Loader2, Check, Settings } from 'lucide-react'
import { useSpotStore } from '../../store/spotStore'
import { useSwapQuote } from '../../hooks/useSwapQuote'
import { useSwapExecution } from '../../hooks/useSwapExecution'
import { useErc20Balance } from '../../hooks/useErc20Balance'
import { formatTokenAmount, isValidAmount, parseTokenAmount } from '../../lib/spotUtils'
import { ARBITRUM_CHAIN_ID } from '../../lib/spotConstants'
import { cn } from '../../lib/format'
import { TokenSelector } from './TokenSelector'
import { SwapQuoteDisplay } from './SwapQuoteDisplay'
import type { Token } from '../../types/spot'
import type { SwapStatus } from '../../types/spot'

type TokenSide = 'sell' | 'buy'

export function SpotSwapForm() {
  const { isConnected } = useAccount()
  const chainId = useChainId()

  const {
    sellToken, buyToken, sellAmount, slippageBps,
    setSellToken, setBuyToken, setSellAmount, setSlippageBps, flipTokens,
  } = useSpotStore()

  const { quote, isLoading: quoteLoading, error: quoteError } = useSwapQuote()
  const { status, error: swapError, executeSwap } = useSwapExecution()

  const { raw: sellBalance, formatted: sellBalanceFormatted } = useErc20Balance({
    tokenAddress: sellToken.address,
    decimals: sellToken.decimals,
    chainId: ARBITRUM_CHAIN_ID,
  })

  // Token selector state
  const [selectorOpen, setSelectorOpen] = useState(false)
  const [selectorSide, setSelectorSide] = useState<TokenSide>('sell')
  const [showSlippage, setShowSlippage] = useState(false)

  const openSelector = useCallback((side: TokenSide) => {
    setSelectorSide(side)
    setSelectorOpen(true)
  }, [])

  const handleTokenSelect = useCallback(
    (token: Token) => {
      if (selectorSide === 'sell') setSellToken(token)
      else setBuyToken(token)
    },
    [selectorSide, setSellToken, setBuyToken],
  )

  const handleMax = useCallback(() => {
    if (sellBalance > 0n) {
      setSellAmount(formatTokenAmount(sellBalance, sellToken.decimals, sellToken.decimals))
    }
  }, [sellBalance, sellToken, setSellAmount])

  // Computed output
  const outputDisplay = quote
    ? formatTokenAmount(quote.buyAmount, quote.buyToken.decimals, 6)
    : ''

  // Button state
  const buttonLabel = getButtonLabel({
    isConnected,
    chainId,
    sellAmount,
    sellBalance,
    sellToken,
    buyToken,
    status,
  })
  const buttonDisabled = status !== 'idle' && status !== 'error' && status !== 'success'
  const isWrongChain = chainId !== ARBITRUM_CHAIN_ID

  return (
    <div className="flex flex-col h-full bg-panel rounded-lg border border-border">
      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {/* ─── You Pay ─── */}
        <div className="bg-surface rounded-lg p-3">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] text-text-muted uppercase tracking-wider">You Pay</span>
            <div className="flex items-center gap-1.5 text-[10px] text-text-muted">
              Bal: <span className="font-mono">{sellBalanceFormatted}</span>
              <button
                onClick={handleMax}
                className="text-accent hover:text-accent/80 font-medium cursor-pointer"
              >
                Max
              </button>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="text"
              inputMode="decimal"
              value={sellAmount}
              onChange={e => setSellAmount(e.target.value)}
              placeholder="0.0"
              className="flex-1 bg-transparent text-xl font-mono text-text-primary placeholder:text-text-muted/50 focus:outline-none min-w-0"
            />
            <TokenPill token={sellToken} onClick={() => openSelector('sell')} />
          </div>
        </div>

        {/* ─── Flip button ─── */}
        <div className="flex justify-center -my-1.5 relative z-10">
          <button
            onClick={flipTokens}
            className="w-8 h-8 rounded-full bg-panel border border-border flex items-center justify-center text-text-muted hover:text-accent hover:border-accent transition-colors cursor-pointer"
          >
            <ArrowDownUp className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* ─── You Receive ─── */}
        <div className="bg-surface rounded-lg p-3">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] text-text-muted uppercase tracking-wider">You Receive</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex-1 text-xl font-mono text-text-primary min-w-0">
              {quoteLoading ? (
                <span className="text-text-muted/50">...</span>
              ) : outputDisplay ? (
                outputDisplay
              ) : (
                <span className="text-text-muted/50">0.0</span>
              )}
            </div>
            <TokenPill token={buyToken} onClick={() => openSelector('buy')} />
          </div>
        </div>

        {/* ─── Slippage setting ─── */}
        <div className="flex items-center justify-between px-1">
          <button
            onClick={() => setShowSlippage(!showSlippage)}
            className="flex items-center gap-1 text-[10px] text-text-muted hover:text-text-secondary transition-colors cursor-pointer"
          >
            <Settings className="w-3 h-3" />
            Slippage: {(slippageBps / 100).toFixed(1)}%
          </button>
        </div>

        {showSlippage && (
          <div className="flex gap-1.5 px-1">
            {[10, 50, 100, 200].map(bps => (
              <button
                key={bps}
                onClick={() => setSlippageBps(bps)}
                className={cn(
                  'px-2.5 py-1 text-[10px] rounded-md transition-colors cursor-pointer',
                  slippageBps === bps
                    ? 'bg-accent text-white'
                    : 'bg-surface text-text-muted hover:text-text-primary border border-border',
                )}
              >
                {(bps / 100).toFixed(1)}%
              </button>
            ))}
          </div>
        )}

        {/* ─── Quote details ─── */}
        {(isValidAmount(sellAmount)) && (
          <div className="border-t border-border pt-3">
            <SwapQuoteDisplay
              quote={quote}
              isLoading={quoteLoading}
              error={quoteError}
              slippageBps={slippageBps}
            />
          </div>
        )}

        {/* ─── Swap error ─── */}
        {swapError && (
          <div className="text-xs text-short bg-short/10 rounded-lg px-3 py-2">
            {swapError}
          </div>
        )}

        {/* ─── Status indicator ─── */}
        {status !== 'idle' && status !== 'error' && (
          <SwapStatusDisplay status={status} />
        )}
      </div>

      {/* ─── Submit button ─── */}
      <div className="p-3 pt-0">
        <button
          onClick={executeSwap}
          disabled={buttonDisabled || isWrongChain || !isConnected}
          className={cn(
            'w-full py-3 rounded-lg font-semibold text-sm transition-colors cursor-pointer',
            'disabled:opacity-50 disabled:cursor-not-allowed',
            status === 'success'
              ? 'bg-long text-white'
              : status === 'error'
                ? 'bg-short text-white'
                : 'bg-accent text-white hover:bg-accent/90',
          )}
        >
          {buttonLabel}
        </button>
      </div>

      {/* ─── Token selector modal ─── */}
      <TokenSelector
        open={selectorOpen}
        onClose={() => setSelectorOpen(false)}
        onSelect={handleTokenSelect}
        excludeAddress={selectorSide === 'sell' ? buyToken.address : sellToken.address}
      />
    </div>
  )
}

/** Token pill button with icon + symbol. */
function TokenPill({ token, onClick }: { token: Token; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-1.5 px-2.5 py-1.5 bg-panel border border-border rounded-full text-sm font-medium text-text-primary hover:bg-panel-light transition-colors cursor-pointer shrink-0"
    >
      <div className="w-5 h-5 rounded-full bg-accent/20 flex items-center justify-center text-[9px] text-accent font-bold">
        {token.symbol[0]}
      </div>
      {token.symbol}
    </button>
  )
}

/** Status progress during swap execution. */
function SwapStatusDisplay({ status }: { status: SwapStatus }) {
  const steps: { key: SwapStatus; label: string }[] = [
    { key: 'fetching-quote', label: 'Fetching quote' },
    { key: 'approving', label: 'Approving token' },
    { key: 'submitting', label: 'Submitting swap' },
    { key: 'confirming', label: 'Confirming' },
    { key: 'success', label: 'Complete' },
  ]

  return (
    <div className="space-y-1">
      {steps.map(step => {
        const stepIndex = steps.findIndex(s => s.key === step.key)
        const currentIndex = steps.findIndex(s => s.key === status)
        const isActive = step.key === status
        const isDone = stepIndex < currentIndex || status === 'success'

        return (
          <div key={step.key} className="flex items-center gap-2 text-xs">
            {isDone ? (
              <Check className="w-3.5 h-3.5 text-long" />
            ) : isActive ? (
              <Loader2 className="w-3.5 h-3.5 text-accent animate-spin" />
            ) : (
              <div className="w-3.5 h-3.5 rounded-full border border-border" />
            )}
            <span className={cn(
              isDone ? 'text-text-secondary' : isActive ? 'text-text-primary' : 'text-text-muted',
            )}>
              {step.label}
            </span>
          </div>
        )
      })}
    </div>
  )
}

/** Determine the submit button label based on form state. */
function getButtonLabel({
  isConnected,
  chainId,
  sellAmount,
  sellBalance,
  sellToken,
  buyToken,
  status,
}: {
  isConnected: boolean
  chainId: number
  sellAmount: string
  sellBalance: bigint
  sellToken: Token
  buyToken: Token
  status: SwapStatus
}): string {
  if (!isConnected) return 'Connect Wallet'
  if (chainId !== ARBITRUM_CHAIN_ID) return 'Switch to Arbitrum'
  if (status === 'success') return 'Swap Successful'
  if (status === 'error') return 'Try Again'
  if (status !== 'idle') return 'Swapping...'
  if (!isValidAmount(sellAmount)) return 'Enter Amount'

  // Check insufficient balance
  const required = parseTokenAmount(sellAmount, sellToken.decimals)
  if (required > sellBalance) return `Insufficient ${sellToken.symbol}`

  return `Swap ${sellToken.symbol} for ${buyToken.symbol}`
}
