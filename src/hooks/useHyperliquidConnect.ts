/**
 * useHyperliquidConnect — wires the connected wagmi wallet into the
 * HyperliquidAdapter as wallet credentials.
 *
 * If the wallet is already connected, calling `connect()` builds
 * `WalletCredentials` from the wagmi account + `signTypedDataAsync` and
 * calls `adapter.authenticate(creds)`. If not connected, it kicks off
 * the wagmi connect flow first; the user can call again once connected.
 *
 * Self-host only — secrets never leave the browser, the adapter just
 * holds a reference to the signer fn.
 */

import { useCallback } from 'react'
import { useAccount, useConnect, useSignTypedData } from 'wagmi'
import { getAdapter } from '../adapters/registry'
import { useToast } from '../store/toastStore'
import { useVaultSessionStore } from '../store/vaultSessionStore'
import type { WalletCredentials } from '../adapters/types'

export interface UseHyperliquidConnectResult {
  /** True once wagmi has a connected wallet. */
  walletReady: boolean
  /** Authenticate the Hyperliquid adapter using the connected wallet. */
  connect: () => Promise<boolean>
}

export function useHyperliquidConnect(): UseHyperliquidConnectResult {
  const toast = useToast()
  const { address, isConnected } = useAccount()
  const { connect: connectWallet, connectors } = useConnect()
  const { signTypedDataAsync } = useSignTypedData()
  const setUnlocked = useVaultSessionStore(s => s.setUnlocked)

  const connect = useCallback(async (): Promise<boolean> => {
    if (!isConnected || !address) {
      const first = connectors[0]
      if (!first) {
        toast.error('No wallet connector available', 'Install a browser wallet (e.g. MetaMask)')
        return false
      }
      toast.info('Approve the wallet connection', 'Then click Connect again to authenticate')
      connectWallet({ connector: first })
      return false
    }

    const adapter = getAdapter('hyperliquid')
    if (!adapter) {
      toast.error('Hyperliquid adapter not registered', '')
      return false
    }

    const creds: WalletCredentials = {
      kind: 'wallet',
      address,
      signTypedData: (params) => signTypedDataAsync({
        domain: params.domain,
        types: params.types,
        primaryType: params.primaryType,
        message: params.message,
      } as Parameters<typeof signTypedDataAsync>[0]),
    }

    try {
      await adapter.authenticate(creds)
      // Hyperliquid auth doesn't write to the encrypted vault (the wallet
      // signer can't be serialized). Flip the session-unlocked flag so the
      // rest of the app reacts the same as the CEX path.
      setUnlocked(true)
      toast.success('Hyperliquid connected', `wallet ${address.slice(0, 6)}…${address.slice(-4)}`)
      return true
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Unknown error'
      toast.error('Hyperliquid auth failed', msg)
      return false
    }
  }, [isConnected, address, connectors, connectWallet, signTypedDataAsync, setUnlocked, toast])

  return { walletReady: isConnected && !!address, connect }
}
