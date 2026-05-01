/**
 * Mode store — STUB.
 *
 * The Demo/Live toggle was removed in the trading-terminal pivot
 * (Phase 1 cleanup). Every venue (Binance, Hyperliquid) is real;
 * there is no synthetic path to switch to. Bots run paper-only
 * regardless of mode until Phase 2d wallet trading lands.
 *
 * This file is kept as a no-op shim so the 20 existing callers
 * compile without churn. useIsDemo() always returns true so all
 * historical demo branches stay live; live branches become
 * unreachable. Phase 2 of the cleanup deletes them outright
 * alongside the on-chain code strip.
 */

import { create } from 'zustand'

export type AppMode = 'demo' | 'live'

interface ModeState {
  mode: AppMode
  setMode: (mode: AppMode) => void
  toggleMode: () => void
}

export const useModeStore = create<ModeState>(() => ({
  mode: 'demo',
  setMode: () => { /* no-op — toggle removed */ },
  toggleMode: () => { /* no-op — toggle removed */ },
}))

export function useIsDemo(): boolean {
  return true
}

export function useIsLive(): boolean {
  return false
}
