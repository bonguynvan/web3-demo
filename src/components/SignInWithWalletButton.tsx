/**
 * SignInWithWalletButton — wallet-only auth for the TradingDek backend.
 *
 * Renders nothing if the backend isn't configured (VITE_API_BASE unset).
 * When configured:
 *   - not connected → button labelled "Connect" (delegates to wagmi)
 *   - connected, not signed-in → "Sign in with wallet" (SIWE flow)
 *   - signed-in → small wallet pill + sign-out menu
 *
 * The SIWE flow is the three-call dance from src/api/auth.ts:
 *   requestNonce → buildSiweMessage → signMessageAsync → verifySignature.
 * On success the session lands in useAuthStore and /api/me will fetch
 * automatically via the useEntitlement hook mounted in AppShell.
 */

import { useState } from 'react'
import { useAccount, useSignMessage } from 'wagmi'
import { LogIn, LogOut, Loader2 } from 'lucide-react'
import { apiAvailable } from '../api/client'
import { requestNonce, verifySignature, buildSiweMessage } from '../api/auth'
import { useAuthStore } from '../store/authStore'
import { cn } from '../lib/format'

export function SignInWithWalletButton({ className }: { className?: string }) {
  const { address, isConnected } = useAccount()
  const { signMessageAsync } = useSignMessage()
  const token = useAuthStore(s => s.token)
  const user = useAuthStore(s => s.user)
  const setSession = useAuthStore(s => s.setSession)
  const signOut = useAuthStore(s => s.signOut)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  if (!apiAvailable()) return null

  const handleSignIn = async () => {
    if (!address) return
    setBusy(true)
    setErr(null)
    try {
      const { nonce } = await requestNonce(address)
      const message = buildSiweMessage(address, nonce)
      const signature = await signMessageAsync({ message })
      const out = await verifySignature({ address, message, signature })
      setSession(out.token, out.user)
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  if (token && user) {
    return (
      <button
        onClick={signOut}
        title={`Signed in as ${user.wallet_address} — click to sign out`}
        className={cn(
          'flex items-center gap-1.5 px-2 py-1 rounded text-[11px] font-mono uppercase tracking-[0.14em] bg-accent-dim text-accent hover:bg-accent hover:text-surface transition-colors cursor-pointer',
          className,
        )}
      >
        <span>{short(user.wallet_address)}</span>
        <LogOut className="w-3 h-3" />
      </button>
    )
  }

  if (!isConnected) {
    return (
      <div
        title="Connect a wallet first, then sign in"
        className={cn(
          'flex items-center gap-1.5 px-2 py-1 rounded text-[11px] font-mono uppercase tracking-[0.14em] text-text-muted',
          className,
        )}
      >
        Sign-in needs a wallet
      </div>
    )
  }

  return (
    <div className="flex flex-col items-end gap-0.5">
      <button
        onClick={handleSignIn}
        disabled={busy}
        className={cn(
          'flex items-center gap-1.5 px-2.5 py-1 rounded text-[11px] font-mono uppercase tracking-[0.14em] bg-accent text-surface hover:opacity-90 transition-opacity cursor-pointer disabled:opacity-60 disabled:cursor-wait',
          className,
        )}
      >
        {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : <LogIn className="w-3 h-3" />}
        Sign in
      </button>
      {err && <span className="text-[10px] text-short max-w-[200px] truncate">{err}</span>}
    </div>
  )
}

function short(a: string): string {
  if (a.length < 10) return a
  return `${a.slice(0, 6)}…${a.slice(-4)}`
}
