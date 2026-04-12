/**
 * Margin store — holds UI state for the Aave margin form.
 *
 * On-chain data (positions, health factor) comes from hooks, not this store.
 * Follows the same pattern as spotStore.ts.
 */

import { create } from 'zustand'
import type { Token } from '../types/spot'
import type { MarginAction } from '../types/margin'
import { ARBITRUM_USDC } from '../lib/spotConstants'

interface MarginState {
  action: MarginAction
  selectedAsset: Token
  amount: string

  setAction: (action: MarginAction) => void
  setSelectedAsset: (asset: Token) => void
  setAmount: (amount: string) => void
  reset: () => void
}

export const useMarginStore = create<MarginState>((set) => ({
  action: 'supply',
  selectedAsset: ARBITRUM_USDC,
  amount: '',

  setAction: (action) => set({ action, amount: '' }),
  setSelectedAsset: (asset) => set({ selectedAsset: asset, amount: '' }),
  setAmount: (amount) => set({ amount }),
  reset: () => set({ action: 'supply', selectedAsset: ARBITRUM_USDC, amount: '' }),
}))
