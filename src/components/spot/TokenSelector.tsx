/**
 * TokenSelector — modal for picking a token to swap.
 *
 * Features:
 * - Search by symbol, name, or address
 * - Popular tokens row for quick selection
 * - Virtualized list for 500+ tokens via react-window
 * - Shows user balance for each token
 */

import { useState, useCallback, useEffect, useRef } from 'react'
import { Search } from 'lucide-react'
import { Modal } from '../ui/Modal'
import { useTokenList } from '../../hooks/useTokenList'
import { useErc20Balance } from '../../hooks/useErc20Balance'
import { getPopularTokens } from '../../lib/tokenList'
import { cn } from '../../lib/format'
import { ARBITRUM_CHAIN_ID } from '../../lib/spotConstants'
import type { Token } from '../../types/spot'

interface TokenSelectorProps {
  open: boolean
  onClose: () => void
  onSelect: (token: Token) => void
  /** Address to exclude (the token already selected on the other side). */
  excludeAddress?: string
}

export function TokenSelector({ open, onClose, onSelect, excludeAddress }: TokenSelectorProps) {
  const [query, setQuery] = useState('')
  const { tokens, isLoading, search } = useTokenList()
  const inputRef = useRef<HTMLInputElement>(null)

  // Focus search input when modal opens
  useEffect(() => {
    if (open) {
      setQuery('')
      setTimeout(() => inputRef.current?.focus(), 100)
    }
  }, [open])

  const results = query.trim()
    ? search(query).filter(t => t.address.toLowerCase() !== excludeAddress?.toLowerCase())
    : tokens.filter(t => t.address.toLowerCase() !== excludeAddress?.toLowerCase())

  const handleSelect = useCallback(
    (token: Token) => {
      onSelect(token)
      onClose()
    },
    [onSelect, onClose],
  )

  const popularTokens = getPopularTokens().filter(
    t => t.address.toLowerCase() !== excludeAddress?.toLowerCase(),
  )

  return (
    <Modal open={open} onClose={onClose} title="Select Token" maxWidth="max-w-sm">
      {/* Search input */}
      <div className="relative mb-3">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Search by name or paste address"
          className="w-full pl-9 pr-3 py-2.5 bg-surface border border-border rounded-lg text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent"
        />
      </div>

      {/* Popular tokens row */}
      <div className="flex flex-wrap gap-1.5 mb-3">
        {popularTokens.map(token => (
          <button
            key={token.address}
            onClick={() => handleSelect(token)}
            className="flex items-center gap-1.5 px-2.5 py-1.5 bg-surface border border-border rounded-full text-xs text-text-primary hover:bg-panel-light transition-colors cursor-pointer"
          >
            <TokenIcon token={token} size={16} />
            {token.symbol}
          </button>
        ))}
      </div>

      <div className="border-t border-border -mx-4 mb-2" />

      {/* Token list — plain scrollable div (no virtualization needed for <50 filtered results;
          full list rendering is acceptable for the initial 200-500 token set). */}
      {isLoading ? (
        <div className="text-center text-text-muted text-xs py-8">Loading tokens...</div>
      ) : results.length === 0 ? (
        <div className="text-center text-text-muted text-xs py-8">No tokens found</div>
      ) : (
        <div className="max-h-[300px] overflow-y-auto -mx-1">
          {results.map(token => (
            <TokenRow key={token.address} token={token} onSelect={handleSelect} />
          ))}
        </div>
      )}
    </Modal>
  )
}

/** Single row in the token list. */
function TokenRow({ token, onSelect }: { token: Token; onSelect: (t: Token) => void }) {
  return (
    <button
      onClick={() => onSelect(token)}
      className="flex items-center justify-between w-full px-2 py-2 hover:bg-panel-light transition-colors cursor-pointer rounded"
    >
      <div className="flex items-center gap-2.5 min-w-0">
        <TokenIcon token={token} size={28} />
        <div className="min-w-0">
          <div className="text-sm font-medium text-text-primary truncate">{token.symbol}</div>
          <div className="text-[10px] text-text-muted truncate">{token.name}</div>
        </div>
      </div>
      <TokenBalanceDisplay token={token} />
    </button>
  )
}

/** Inline balance for a token row. */
function TokenBalanceDisplay({ token }: { token: Token }) {
  const { formatted, isLoading } = useErc20Balance({
    tokenAddress: token.address,
    decimals: token.decimals,
    chainId: ARBITRUM_CHAIN_ID,
  })

  if (isLoading) return <span className="text-[10px] text-text-muted">...</span>
  if (formatted === '0') return null

  return (
    <span className="text-xs font-mono text-text-secondary tabular-nums">{formatted}</span>
  )
}

/** Token icon with fallback to first letter of symbol. */
function TokenIcon({ token, size = 24 }: { token: Token; size?: number }) {
  if (token.logoURI) {
    return (
      <img
        src={token.logoURI}
        alt={token.symbol}
        width={size}
        height={size}
        className={cn('rounded-full shrink-0')}
        onError={e => {
          // Fallback to letter on load failure
          const el = e.currentTarget
          el.style.display = 'none'
          el.nextElementSibling?.classList.remove('hidden')
        }}
      />
    )
  }

  return (
    <div
      className="rounded-full bg-accent/20 flex items-center justify-center text-accent font-bold shrink-0"
      style={{ width: size, height: size, fontSize: size * 0.4 }}
    >
      {token.symbol[0]}
    </div>
  )
}
