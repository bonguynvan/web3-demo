/**
 * GlobalPlaceOrder — listens for Cmd/Ctrl+L globally and opens the
 * PlaceOrderModal pre-filled with the active market.
 *
 * Only fires when the vault is unlocked (so authenticated trading is
 * actually possible). Skipped while typing in inputs/textarea.
 */

import { useEffect, useState } from 'react'
import { PlaceOrderModal } from './PlaceOrderModal'
import { useTradingStore } from '../store/tradingStore'
import { useVaultSessionStore } from '../store/vaultSessionStore'

export function GlobalPlaceOrder() {
  const [open, setOpen] = useState(false)
  const selectedMarket = useTradingStore(s => s.selectedMarket)
  const unlocked = useVaultSessionStore(s => s.unlocked)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'l') {
        const target = e.target as HTMLElement | null
        const tag = target?.tagName
        const editable = target?.isContentEditable
        if (tag === 'INPUT' || tag === 'TEXTAREA' || editable) return
        if (!unlocked) return
        e.preventDefault()
        setOpen(true)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [unlocked])

  return (
    <PlaceOrderModal
      open={open}
      onClose={() => setOpen(false)}
      defaultMarketId={selectedMarket.symbol}
    />
  )
}
