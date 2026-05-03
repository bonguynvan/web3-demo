/**
 * ConnectVenueModal — passphrase-encrypted CEX API-key entry.
 *
 * Flow:
 *   - If vault doesn't exist yet, user picks a passphrase to create it.
 *   - If vault exists, user unlocks with their existing passphrase, then
 *     adds (or replaces) the venue's credentials.
 *   - Trading scope is opt-in (defaults to read-only).
 *
 * Wallet-based venues (Hyperliquid) skip this modal — wagmi's connect
 * flow already covers EIP-712 signing without storing any secret.
 */

import { useState } from 'react'
import { Modal } from './ui/Modal'
import { AlertTriangle, Eye, EyeOff } from 'lucide-react'
import {
  seal, unseal, vaultExists, WrongPassphraseError,
  type VaultPayload,
} from '../lib/credentialsVault'
import { getAdapter } from '../adapters/registry'
import { useVaultSessionStore } from '../store/vaultSessionStore'
import { useToast } from '../store/toastStore'
import type { VenueId } from '../adapters/types'
import { cn } from '../lib/format'

interface Props {
  open: boolean
  onClose: () => void
  venueId: VenueId
}

export function ConnectVenueModal({ open, onClose, venueId }: Props) {
  const toast = useToast()
  const setUnlocked = useVaultSessionStore(s => s.setUnlocked)
  const exists = vaultExists()

  const [passphrase, setPassphrase] = useState('')
  const [confirmPassphrase, setConfirmPassphrase] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [apiSecret, setApiSecret] = useState('')
  const [readOnly, setReadOnly] = useState(true)
  const [showSecret, setShowSecret] = useState(false)
  const [busy, setBusy] = useState(false)

  const reset = () => {
    setPassphrase('')
    setConfirmPassphrase('')
    setApiKey('')
    setApiSecret('')
    setReadOnly(true)
    setShowSecret(false)
  }

  const handleClose = () => {
    reset()
    onClose()
  }

  const submit = async () => {
    if (!apiKey.trim() || !apiSecret.trim()) {
      toast.error('Missing fields', 'API key and secret are required')
      return
    }
    if (!passphrase) {
      toast.error('Passphrase required', 'Used to encrypt the credentials at rest')
      return
    }
    if (!exists && passphrase !== confirmPassphrase) {
      toast.error('Passphrases do not match', 'Re-enter to confirm')
      return
    }
    if (!exists && passphrase.length < 8) {
      toast.error('Passphrase too short', 'Use at least 8 characters')
      return
    }

    setBusy(true)
    try {
      let payload: VaultPayload
      if (exists) {
        try {
          payload = await unseal(passphrase)
        } catch (e) {
          if (e instanceof WrongPassphraseError) {
            toast.error('Wrong passphrase', 'Unable to unlock the existing vault')
            setBusy(false)
            return
          }
          throw e
        }
      } else {
        payload = { venues: {} }
      }

      const newCred = {
        kind: 'apiKey' as const,
        apiKey: apiKey.trim(),
        apiSecret: apiSecret.trim(),
        readOnly,
      }
      payload.venues[venueId] = newCred
      payload.meta = { ...(payload.meta ?? {}), [venueId]: { addedAt: Date.now() } }
      await seal(passphrase, payload)

      // Hot-path: also push the creds into the live adapter so authenticated
      // requests work in this session without requiring an unlock + restart.
      const adapter = getAdapter(venueId)
      if (adapter) {
        try {
          await adapter.authenticate(newCred)
        } catch (e) {
          // Vault save succeeded — only the in-session activation failed.
          // Surface a non-blocking warning; user can retry next session.
          const msg = e instanceof Error ? e.message : 'Unknown error'
          toast.warning(`${venueId} saved, but session auth failed`, msg)
          handleClose()
          return
        }
      }

      setUnlocked(true)
      toast.success(`${venueId} connected`, readOnly ? 'Read-only scope' : 'Trading scope enabled')
      handleClose()
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Unknown error'
      toast.error('Failed to save credentials', msg)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal open={open} onClose={handleClose} title={`Connect ${venueId}`}>
      <div className="p-4 space-y-4">
        <div className="flex items-start gap-2 px-3 py-2.5 rounded-md bg-amber-400/10 border border-amber-400/30 text-[11px] text-amber-400 leading-relaxed">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
          <div>
            Self-host mode: your secret never leaves this browser. It is encrypted with your
            passphrase using AES-GCM before storage. Without the passphrase the data is
            unrecoverable. Do not deploy this build for multi-user use.
          </div>
        </div>

        <Field label="API key">
          <input
            value={apiKey}
            onChange={e => setApiKey(e.target.value)}
            autoComplete="off"
            spellCheck={false}
            className="w-full text-sm bg-surface border border-border rounded-md px-3 py-2 text-text-primary outline-none focus:border-accent font-mono"
          />
        </Field>

        <Field label="API secret">
          <div className="flex items-center gap-2">
            <input
              type={showSecret ? 'text' : 'password'}
              value={apiSecret}
              onChange={e => setApiSecret(e.target.value)}
              autoComplete="off"
              spellCheck={false}
              className="flex-1 text-sm bg-surface border border-border rounded-md px-3 py-2 text-text-primary outline-none focus:border-accent font-mono"
            />
            <button
              type="button"
              onClick={() => setShowSecret(s => !s)}
              className="shrink-0 w-9 h-9 flex items-center justify-center rounded-md bg-surface border border-border text-text-muted hover:text-text-primary cursor-pointer"
              title={showSecret ? 'Hide' : 'Show'}
            >
              {showSecret ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
            </button>
          </div>
        </Field>

        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={readOnly}
            onChange={e => setReadOnly(e.target.checked)}
            className="w-4 h-4 accent-accent cursor-pointer"
          />
          <span className="text-xs text-text-secondary">
            Read-only scope (recommended — disables order placement on this key)
          </span>
        </label>

        <div className="border-t border-border pt-3">
          <Field label={exists ? 'Vault passphrase' : 'New vault passphrase'}>
            <input
              type="password"
              value={passphrase}
              onChange={e => setPassphrase(e.target.value)}
              autoComplete="new-password"
              className="w-full text-sm bg-surface border border-border rounded-md px-3 py-2 text-text-primary outline-none focus:border-accent font-mono"
            />
          </Field>
          {!exists && (
            <div className="mt-3">
              <Field label="Confirm passphrase">
                <input
                  type="password"
                  value={confirmPassphrase}
                  onChange={e => setConfirmPassphrase(e.target.value)}
                  autoComplete="new-password"
                  className="w-full text-sm bg-surface border border-border rounded-md px-3 py-2 text-text-primary outline-none focus:border-accent font-mono"
                />
              </Field>
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <button
            onClick={handleClose}
            disabled={busy}
            className="px-4 py-2 text-xs font-semibold rounded-md bg-surface border border-border text-text-secondary hover:text-text-primary hover:bg-panel-light transition-colors cursor-pointer disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={busy}
            className={cn(
              'px-4 py-2 text-xs font-semibold rounded-md bg-accent text-white hover:bg-accent/90 transition-colors cursor-pointer',
              busy && 'opacity-60 cursor-wait',
            )}
          >
            {busy ? 'Saving…' : exists ? 'Unlock & save' : 'Create vault & save'}
          </button>
        </div>
      </div>
    </Modal>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <div className="text-[10px] uppercase tracking-wider text-text-muted mb-1">{label}</div>
      {children}
    </label>
  )
}
