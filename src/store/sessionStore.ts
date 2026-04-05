/**
 * Session Store — manages the Sign-to-Trade authentication state.
 *
 * FLOW:
 * =====
 * 1. User connects wallet → useAccount gives us the address
 * 2. User clicks "Enable Trading" → signAuthentication() is called
 * 3. MetaMask popup: "Sign-to-Trade, expires in 24h"
 * 4. User signs → we store the AuthSession in this store
 * 5. Now the user can place orders without MetaMask popups
 *    (the session signature is sent with each API request)
 *
 * WHY SEPARATE FROM tradingStore?
 * ===============================
 * Session state (wallet, auth) changes rarely (on connect/disconnect).
 * Trading state (prices, orderbook) changes 100x/sec.
 * Separating them prevents auth-related renders from triggering price rerenders.
 */

import { create } from 'zustand'
import type { AuthSession } from '../lib/eip712'

export type TradingStatus = 'disconnected' | 'connected' | 'signing' | 'ready' | 'error'

interface SessionState {
  // Wallet
  address: `0x${string}` | null
  chainId: number | null
  setWallet: (address: `0x${string}` | null, chainId: number | null) => void

  // Auth session
  session: AuthSession | null
  status: TradingStatus
  error: string | null
  setSession: (session: AuthSession) => void
  setStatus: (status: TradingStatus, error?: string) => void
  clearSession: () => void

  // Computed
  isReady: () => boolean
}

export const useSessionStore = create<SessionState>((set, get) => ({
  address: null,
  chainId: null,
  setWallet: (address, chainId) => {
    set({ address, chainId })
    // If wallet disconnected, clear the session
    if (!address) {
      set({ session: null, status: 'disconnected', error: null })
    } else if (!get().session) {
      set({ status: 'connected' })
    }
  },

  session: null,
  status: 'disconnected',
  error: null,

  setSession: (session) => set({ session, status: 'ready', error: null }),
  setStatus: (status, error) => set({ status, error: error || null }),
  clearSession: () => set({ session: null, status: 'connected', error: null }),

  isReady: () => {
    const { session, status } = get()
    if (!session || status !== 'ready') return false
    const now = Math.floor(Date.now() / 1000)
    return now < session.expiry
  },
}))
