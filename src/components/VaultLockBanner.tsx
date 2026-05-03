/**
 * VaultLockBanner — top-of-app CTA when an encrypted credentials vault
 * exists but hasn't been unlocked in this session.
 *
 * Hidden when there's no vault (nothing to unlock) or when the vault
 * has already been unlocked this session (auth is live).
 */

import { useState } from 'react'
import { Lock, X } from 'lucide-react'
import { vaultExists } from '../lib/credentialsVault'
import { useVaultSessionStore } from '../store/vaultSessionStore'
import { VaultViewModal } from './VaultViewModal'

export function VaultLockBanner() {
  const unlocked = useVaultSessionStore(s => s.unlocked)
  const [open, setOpen] = useState(false)
  const [dismissed, setDismissed] = useState(false)

  if (!vaultExists() || unlocked || dismissed) return null

  return (
    <>
      <div className="flex items-center gap-3 px-4 py-2 border-b border-amber-400/30 bg-amber-400/10 text-xs shrink-0">
        <Lock className="w-3.5 h-3.5 text-amber-400 shrink-0" />
        <div className="flex-1 min-w-0">
          <span className="font-semibold text-amber-400">Vault locked</span>
          <span className="ml-2 text-text-secondary">
            Authenticated trading is paused. Unlock to activate stored venue connections this session.
          </span>
        </div>
        <button
          onClick={() => setOpen(true)}
          className="shrink-0 px-2.5 py-1 text-[11px] font-semibold rounded bg-amber-400/20 hover:bg-amber-400/30 text-amber-400 transition-colors cursor-pointer"
        >
          Unlock
        </button>
        <button
          onClick={() => setDismissed(true)}
          className="shrink-0 p-1 rounded text-amber-400/70 hover:text-amber-400 hover:bg-black/10 dark:hover:bg-white/10 transition-colors cursor-pointer"
          title="Dismiss for this session"
          aria-label="Dismiss"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
      <VaultViewModal open={open} onClose={() => setOpen(false)} />
    </>
  )
}
