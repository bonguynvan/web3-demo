/**
 * Mode store — controls Demo vs Live mode for the entire app.
 *
 * Demo mode: all data is simulated, no wallet or Anvil needed.
 * Live mode: real on-chain data, requires wallet + running chain.
 *
 * Every hook that reads data or executes transactions checks this mode.
 */

import { create } from 'zustand'

export type AppMode = 'demo' | 'live'

interface ModeState {
  mode: AppMode
  setMode: (mode: AppMode) => void
  toggleMode: () => void
}

export const useModeStore = create<ModeState>((set) => ({
  mode: 'demo',
  setMode: (mode) => set({ mode }),
  toggleMode: () => set(state => ({ mode: state.mode === 'demo' ? 'live' : 'demo' })),
}))

/** Shorthand to check current mode */
export function useIsDemo(): boolean {
  return useModeStore(s => s.mode) === 'demo'
}

export function useIsLive(): boolean {
  return useModeStore(s => s.mode) === 'live'
}
