/**
 * useOrderFormShortcuts — MT4-style keyboard shortcuts for the order form.
 *
 * Bindings:
 *   B    → toggle to Long
 *   S    → toggle to Short
 *   M    → switch to Market order
 *   L    → switch to Limit order
 *   1-5  → leverage presets 1x / 2x / 5x / 10x / 20x
 *   Esc  → clear orderSize input + cancel limit price
 *
 * Guard rails:
 *   - Bindings DO NOT fire while an input/textarea/contenteditable is focused.
 *     Otherwise typing "1" into the amount field would jump leverage instead.
 *   - Modifier keys (Ctrl/Meta/Alt) suppress the bindings so browser shortcuts
 *     keep working (Ctrl+L for the address bar, etc).
 *   - Listener attaches to window so it captures keys regardless of focus
 *     within the trading layout.
 */

import { useEffect } from 'react'
import { useTradingStore } from '../store/tradingStore'

const LEVERAGE_PRESETS: Record<string, number> = {
  '1': 1,
  '2': 2,
  '3': 5,
  '4': 10,
  '5': 20,
}

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  const tag = target.tagName
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true
  if (target.isContentEditable) return true
  return false
}

export function useOrderFormShortcuts(): void {
  const setOrderSide = useTradingStore(s => s.setOrderSide)
  const setOrderType = useTradingStore(s => s.setOrderType)
  const setLeverage = useTradingStore(s => s.setLeverage)
  const setOrderSize = useTradingStore(s => s.setOrderSize)
  const setOrderPrice = useTradingStore(s => s.setOrderPrice)

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Skip when modifier keys are held — preserves browser/OS shortcuts.
      if (e.ctrlKey || e.metaKey || e.altKey) return

      // Skip while the user is typing in an input field.
      if (isTypingTarget(e.target)) return

      const key = e.key.toLowerCase()

      switch (key) {
        case 'b':
          setOrderSide('long')
          e.preventDefault()
          return
        case 's':
          setOrderSide('short')
          e.preventDefault()
          return
        case 'm':
          setOrderType('market')
          e.preventDefault()
          return
        case 'l':
          setOrderType('limit')
          e.preventDefault()
          return
        case 'escape':
          setOrderSize('')
          setOrderPrice('')
          e.preventDefault()
          return
      }

      if (LEVERAGE_PRESETS[key] !== undefined) {
        setLeverage(LEVERAGE_PRESETS[key])
        e.preventDefault()
      }
    }

    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [setOrderSide, setOrderType, setLeverage, setOrderSize, setOrderPrice])
}
