/**
 * Spot swap store — holds UI state for the swap form.
 *
 * On-chain data (balances, quotes) comes from hooks, not this store.
 * Follows the same pattern as tradingStore.ts.
 */

import { create } from 'zustand'
import type { Token } from '../types/spot'
import { NATIVE_ETH, ARBITRUM_USDC } from '../lib/spotConstants'

interface SpotState {
  sellToken: Token
  buyToken: Token
  sellAmount: string
  slippageBps: number

  setSellToken: (token: Token) => void
  setBuyToken: (token: Token) => void
  setSellAmount: (amount: string) => void
  setSlippageBps: (bps: number) => void
  flipTokens: () => void
  reset: () => void
}

export const useSpotStore = create<SpotState>((set) => ({
  sellToken: NATIVE_ETH,
  buyToken: ARBITRUM_USDC,
  sellAmount: '',
  slippageBps: 50, // 0.5%

  setSellToken: (token) =>
    set((state) => {
      // If selecting the same token as buyToken, swap them
      if (token.address.toLowerCase() === state.buyToken.address.toLowerCase()) {
        return { sellToken: token, buyToken: state.sellToken, sellAmount: '' }
      }
      return { sellToken: token, sellAmount: '' }
    }),

  setBuyToken: (token) =>
    set((state) => {
      if (token.address.toLowerCase() === state.sellToken.address.toLowerCase()) {
        return { buyToken: token, sellToken: state.buyToken, sellAmount: '' }
      }
      return { buyToken: token }
    }),

  setSellAmount: (amount) => set({ sellAmount: amount }),

  setSlippageBps: (bps) => set({ slippageBps: Math.max(1, Math.min(bps, 500)) }),

  flipTokens: () =>
    set((state) => ({
      sellToken: state.buyToken,
      buyToken: state.sellToken,
      sellAmount: '',
    })),

  reset: () =>
    set({
      sellToken: NATIVE_ETH,
      buyToken: ARBITRUM_USDC,
      sellAmount: '',
      slippageBps: 50,
    }),
}))
