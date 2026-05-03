/**
 * vaultSessionStore — in-memory flag for "vault has been unlocked
 * during this browser session".
 *
 * Not persisted: a refresh re-locks the vault by design. Used by the
 * VaultLockBanner to decide whether to show the unlock CTA, and by
 * VaultViewModal / ConnectVenueModal to flip the flag on success.
 */

import { create } from 'zustand'

interface VaultSessionStore {
  unlocked: boolean
  setUnlocked: (v: boolean) => void
}

export const useVaultSessionStore = create<VaultSessionStore>((set) => ({
  unlocked: false,
  setUnlocked: (v) => set({ unlocked: v }),
}))
