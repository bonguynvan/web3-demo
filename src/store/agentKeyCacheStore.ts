/**
 * agentKeyCacheStore — in-memory cache for the unsealed Hyperliquid
 * agent private key.
 *
 * The agent private key lives encrypted in the credentials vault. To
 * sign orders we need it in plaintext. We hold it in JS memory only
 * for the duration of the tab: no localStorage, no IndexedDB. On
 * refresh / tab close the cache is empty and the user must unlock
 * the vault again.
 *
 * Why not just unseal on every signed order? The vault's PBKDF2
 * (600k iterations) takes ~300ms — fine once per session, prohibitive
 * per-order (especially for bots).
 */

import { create } from 'zustand'

interface AgentKeyCacheStore {
  privateKey: `0x${string}` | null
  setKey: (k: `0x${string}` | null) => void
  clear: () => void
}

export const useAgentKeyCacheStore = create<AgentKeyCacheStore>((set) => ({
  privateKey: null,
  setKey: (k) => set({ privateKey: k }),
  clear: () => set({ privateKey: null }),
}))

/**
 * Imperative getter for non-React contexts (adapter, signing helpers).
 * Returns null if the vault hasn't been unlocked yet.
 */
export function getAgentPrivateKey(): `0x${string}` | null {
  return useAgentKeyCacheStore.getState().privateKey
}
