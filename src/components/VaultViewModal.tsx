/**
 * VaultViewModal — passphrase prompt → unlocked list of stored venues.
 *
 * Decryption happens fully in-browser. The component holds plaintext
 * in component state only — never logs, never persists, never sends.
 * Only metadata is shown (venue id + read-only flag); the API secret
 * is never rendered.
 */

import { useState } from 'react'
import { Modal } from './ui/Modal'
import { Lock, Unlock, Trash2, AlertTriangle } from 'lucide-react'
import { unseal, seal, WrongPassphraseError, type VaultPayload } from '../lib/credentialsVault'
import { getAdapter } from '../adapters/registry'
import { useToast } from '../store/toastStore'
import { useVaultSessionStore } from '../store/vaultSessionStore'
import { cn } from '../lib/format'
import type { VenueId } from '../adapters/types'

interface Props {
  open: boolean
  onClose: () => void
}

export function VaultViewModal({ open, onClose }: Props) {
  const toast = useToast()
  const setUnlocked = useVaultSessionStore(s => s.setUnlocked)
  const [passphrase, setPassphrase] = useState('')
  const [busy, setBusy] = useState(false)
  const [unlocked, setUnlockedPayload] = useState<VaultPayload | null>(null)

  const reset = () => {
    setPassphrase('')
    setBusy(false)
    setUnlockedPayload(null)
  }

  const handleClose = () => {
    reset()
    onClose()
  }

  const tryUnlock = async () => {
    if (!passphrase) return
    setBusy(true)
    try {
      const payload = await unseal(passphrase)
      setUnlockedPayload(payload)
      setUnlocked(true)

      // Push creds into matching adapters so authenticated calls work
      // for the rest of this session. Failures are logged via toast but
      // don't block the unlock flow.
      let activated = 0
      for (const [venueId, cred] of Object.entries(payload.venues)) {
        if (!cred) continue
        const adapter = getAdapter(venueId as VenueId)
        if (!adapter) continue
        try {
          await adapter.authenticate(cred)
          activated += 1
        } catch (e) {
          const msg = e instanceof Error ? e.message : 'Unknown error'
          toast.warning(`${venueId} session auth failed`, msg)
        }
      }
      if (activated > 0) {
        toast.success(`Vault unlocked`, `${activated} venue${activated === 1 ? '' : 's'} active this session`)
      }
    } catch (e) {
      if (e instanceof WrongPassphraseError) {
        toast.error('Wrong passphrase', 'Try again')
      } else {
        const msg = e instanceof Error ? e.message : 'Unknown error'
        toast.error('Failed to unlock', msg)
      }
    } finally {
      setBusy(false)
    }
  }

  const removeVenue = async (venueId: string) => {
    if (!unlocked) return
    if (!confirm(`Remove ${venueId} credentials from the vault?`)) return
    const next: VaultPayload = {
      ...unlocked,
      venues: { ...unlocked.venues },
      meta: unlocked.meta ? { ...unlocked.meta } : undefined,
    }
    delete next.venues[venueId as keyof typeof next.venues]
    if (next.meta) delete next.meta[venueId as keyof typeof next.meta]
    try {
      await seal(passphrase, next)
      setUnlockedPayload(next)
      toast.success(`Removed ${venueId}`, 'Vault re-sealed')
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Unknown error'
      toast.error('Failed to remove', msg)
    }
  }

  const venues = unlocked ? Object.keys(unlocked.venues) : []

  return (
    <Modal open={open} onClose={handleClose} title="View vault">
      <div className="p-4 space-y-4">
        {!unlocked ? (
          <>
            <div className="flex items-start gap-2 px-3 py-2.5 rounded-md bg-panel/60 border border-border text-[11px] text-text-secondary leading-relaxed">
              <Lock className="w-3.5 h-3.5 shrink-0 mt-0.5 text-text-muted" />
              <div>
                Enter your vault passphrase to see which venues are stored. Only the venue id and
                scope are shown — the API secret is never rendered.
              </div>
            </div>

            <label className="block">
              <div className="text-[10px] uppercase tracking-wider text-text-muted mb-1">Passphrase</div>
              <input
                type="password"
                autoFocus
                value={passphrase}
                onChange={e => setPassphrase(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') tryUnlock() }}
                autoComplete="off"
                className="w-full text-sm bg-surface border border-border rounded-md px-3 py-2 text-text-primary outline-none focus:border-accent font-mono"
              />
            </label>

            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={handleClose}
                disabled={busy}
                className="px-4 py-2 text-xs font-semibold rounded-md bg-surface border border-border text-text-secondary hover:text-text-primary hover:bg-panel-light transition-colors cursor-pointer disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={tryUnlock}
                disabled={busy || !passphrase}
                className={cn(
                  'px-4 py-2 text-xs font-semibold rounded-md bg-accent text-white hover:bg-accent/90 transition-colors cursor-pointer flex items-center gap-1.5',
                  busy && 'opacity-60 cursor-wait',
                )}
              >
                <Unlock className="w-3.5 h-3.5" />
                {busy ? 'Unlocking…' : 'Unlock'}
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="flex items-start gap-2 px-3 py-2.5 rounded-md bg-amber-400/10 border border-amber-400/30 text-[11px] text-amber-400 leading-relaxed">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
              <div>
                Vault unlocked in this tab. Close the modal when done — plaintext is held only in
                this component's memory.
              </div>
            </div>

            {venues.length === 0 ? (
              <div className="text-sm text-text-muted text-center py-6">
                Vault is empty.
              </div>
            ) : (
              <div className="space-y-1.5">
                {venues.map(v => {
                  const cred = unlocked.venues[v as keyof typeof unlocked.venues]
                  const scope = cred?.kind === 'apiKey'
                    ? cred.readOnly ? 'Read-only' : 'Trading'
                    : cred?.kind === 'wallet'
                      ? 'Wallet'
                      : '—'
                  const addedAt = unlocked.meta?.[v as keyof NonNullable<typeof unlocked.meta>]?.addedAt
                  return (
                    <div
                      key={v}
                      className="flex items-center justify-between gap-2 px-3 py-2 rounded-md bg-surface/60 border border-border"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-sm font-medium text-text-primary capitalize truncate">{v}</span>
                        <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-panel text-text-muted">
                          {scope}
                        </span>
                        {addedAt && (
                          <span className="text-[10px] text-text-muted truncate">
                            added {new Date(addedAt).toLocaleDateString()}
                          </span>
                        )}
                      </div>
                      <button
                        onClick={() => removeVenue(v)}
                        className="shrink-0 w-7 h-7 rounded text-text-muted hover:text-short hover:bg-short/10 flex items-center justify-center cursor-pointer"
                        title={`Remove ${v}`}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )
                })}
              </div>
            )}

            <div className="flex justify-end pt-2">
              <button
                onClick={handleClose}
                className="px-4 py-2 text-xs font-semibold rounded-md bg-accent text-white hover:bg-accent/90 transition-colors cursor-pointer"
              >
                Close (lock again)
              </button>
            </div>
          </>
        )}
      </div>
    </Modal>
  )
}
