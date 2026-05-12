/**
 * authStore — token + user identity for the TradingDek backend.
 *
 * Token lives in localStorage via the api/client helpers so a refresh
 * keeps the user signed in. We mirror the user shape in state so the
 * SPA can render `0xab…cd` without re-fetching /api/me on every render.
 *
 * Sign-in flow lives in components/SignInWithWalletButton.tsx; this
 * store just stores the result and exposes a `signOut()` helper.
 */

import { create } from 'zustand'
import { getToken, setToken } from '../api/client'

const USER_KEY = 'tc-auth-user-v1'

export interface AuthUser {
  id: string
  wallet_address: string
}

function loadUser(): AuthUser | null {
  try {
    const raw = localStorage.getItem(USER_KEY)
    if (!raw) return null
    return JSON.parse(raw) as AuthUser
  } catch { return null }
}

function persistUser(u: AuthUser | null): void {
  try {
    if (u) localStorage.setItem(USER_KEY, JSON.stringify(u))
    else localStorage.removeItem(USER_KEY)
  } catch { /* storage full */ }
}

interface AuthState {
  token: string | null
  user: AuthUser | null
  setSession: (token: string, user: AuthUser) => void
  signOut: () => void
  isAuthed: () => boolean
}

export const useAuthStore = create<AuthState>((set, get) => ({
  token: getToken(),
  user: loadUser(),

  setSession: (token, user) => {
    setToken(token)
    persistUser(user)
    set({ token, user })
  },

  signOut: () => {
    setToken(null)
    persistUser(null)
    set({ token: null, user: null })
  },

  isAuthed: () => !!get().token && !!get().user,
}))
