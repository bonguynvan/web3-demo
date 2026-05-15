/**
 * HyperliquidAgentModal — Phase 1 of the signed trading flow.
 *
 * Walks the user through:
 *   1. Connect wagmi wallet (if not already)
 *   2. Generate a fresh agent key locally
 *   3. Approve that agent via EIP-712 (one wallet prompt)
 *   4. Show agent address + revoke option
 *
 * Locked to testnet in Phase 1. The "approve" call throws on mainnet
 * until the trading half is validated and Phase 3 flips the gate.
 */

import { useState } from 'react'
import { useAccount, useConnect, useWalletClient } from 'wagmi'
import { ShieldCheck, AlertTriangle, KeyRound, Trash2, CheckCircle2, Loader2, Copy } from 'lucide-react'
import { Modal } from './ui/Modal'
import { useToast } from '../store/toastStore'
import { cn } from '../lib/format'
import {
  loadAgent, generateAgent, clearAgent, markApproved, hlNetwork, hlIsMainnet,
  type HlAgentRecord,
} from '../lib/hyperliquidAgent'
import { approveHyperliquidAgent } from '../lib/hyperliquidApprove'

interface Props {
  open: boolean
  onClose: () => void
}

export function HyperliquidAgentModal({ open, onClose }: Props) {
  const toast = useToast()
  const { address, isConnected } = useAccount()
  const { connect: connectWallet, connectors } = useConnect()
  const { data: walletClient } = useWalletClient()
  const [agent, setAgent] = useState<HlAgentRecord | null>(() => loadAgent())
  const [busy, setBusy] = useState<'generate' | 'approve' | null>(null)

  const network = hlNetwork()
  const mainnet = hlIsMainnet()
  const approved = agent?.approvedAt != null

  const handleConnect = () => {
    const first = connectors[0]
    if (!first) {
      toast.error('No wallet connector available', 'Install a browser wallet (e.g. MetaMask)')
      return
    }
    connectWallet({ connector: first })
  }

  const handleGenerate = () => {
    setBusy('generate')
    try {
      const rec = generateAgent()
      setAgent(rec)
      toast.success('Agent generated', `${truncAddr(rec.address)} — sign approval to enable`)
    } catch (e) {
      toast.error('Failed to generate agent', e instanceof Error ? e.message : 'Unknown error')
    } finally {
      setBusy(null)
    }
  }

  const handleApprove = async () => {
    if (!agent || !walletClient || !address) return
    setBusy('approve')
    try {
      await approveHyperliquidAgent({
        walletClient,
        agentAddress: agent.address,
        agentName: agent.name,
      })
      markApproved(address)
      setAgent(loadAgent())
      toast.success('Agent approved', 'You can now sign orders without a wallet prompt')
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Unknown error'
      toast.error('Approval failed', msg)
    } finally {
      setBusy(null)
    }
  }

  const handleRevoke = () => {
    if (!agent) return
    if (!confirm('Forget this agent? You can generate a new one. Already-placed orders are unaffected.')) return
    clearAgent()
    setAgent(null)
    toast.info('Agent forgotten', 'Generate a new one to resume signed trading')
  }

  const handleCopy = (s: string) => {
    navigator.clipboard.writeText(s).catch(() => {})
    toast.success('Copied', '')
  }

  return (
    <Modal open={open} onClose={onClose} title="Hyperliquid agent wallet" maxWidth="max-w-lg">
      <div className="p-4 space-y-4">

        <div className={cn(
          'flex items-start gap-2 px-3 py-2.5 rounded-md text-[11px] leading-relaxed border',
          mainnet
            ? 'border-short/40 bg-short/10 text-short'
            : 'border-amber-400/40 bg-amber-400/10 text-amber-200'
        )}>
          <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
          <div>
            {mainnet ? (
              <>
                <div className="font-semibold mb-0.5">Mainnet detected — Phase 1 is testnet-only.</div>
                Approval will throw. Set <code className="font-mono">VITE_HYPERLIQUID_NETWORK=testnet</code> and rebuild
                before approving an agent.
              </>
            ) : (
              <>
                <div className="font-semibold mb-0.5">Testnet — Phase 1.</div>
                Validate the approve flow here first. Mainnet trading unlocks in a later phase.
              </>
            )}
          </div>
        </div>

        <div className="flex items-start gap-2 px-3 py-2.5 rounded-md bg-accent-dim/20 border border-accent/30 text-[11px] text-text-secondary leading-relaxed">
          <ShieldCheck className="w-3.5 h-3.5 shrink-0 mt-0.5 text-accent" />
          <div>
            <div className="text-text-primary font-semibold mb-0.5">What an agent is.</div>
            A disposable subkey. You sign <span className="font-mono">approveAgent</span> once with your real wallet; from then on
            the agent (held only in this browser) signs individual orders silently. It can place orders but
            <strong> cannot withdraw or move funds</strong>. Forget it any time.
          </div>
        </div>

        {!isConnected && (
          <button
            type="button"
            onClick={handleConnect}
            className="w-full py-2 text-sm font-semibold rounded-md bg-accent text-white hover:bg-accent/90 transition-colors cursor-pointer"
          >
            Connect wallet first
          </button>
        )}

        {isConnected && (
          <>
            <Row label="Network">
              <span className="uppercase">{network}</span>
            </Row>
            <Row label="Master wallet">
              <span className="font-mono">{truncAddr(address!)}</span>
            </Row>

            {agent ? (
              <>
                <Row label="Agent address">
                  <span className="font-mono">{truncAddr(agent.address)}</span>
                  <button
                    onClick={() => handleCopy(agent.address)}
                    className="ml-1.5 text-text-muted hover:text-text-primary cursor-pointer"
                    title="Copy full address"
                  >
                    <Copy className="w-3 h-3" />
                  </button>
                </Row>
                <Row label="Status">
                  {approved ? (
                    <span className="text-long font-mono flex items-center gap-1">
                      <CheckCircle2 className="w-3 h-3" />
                      Approved {new Date(agent.approvedAt!).toLocaleString()}
                    </span>
                  ) : (
                    <span className="text-amber-300 font-mono">Pending approval</span>
                  )}
                </Row>
                {agent.network !== network && (
                  <div className="text-[11px] text-short">
                    Warning: this agent was created on <code className="font-mono">{agent.network}</code>, current
                    network is <code className="font-mono">{network}</code>. Forget + regenerate.
                  </div>
                )}
              </>
            ) : (
              <div className="text-xs text-text-muted">No agent yet. Generate one below.</div>
            )}

            <div className="flex flex-wrap gap-2 pt-2">
              {!agent && (
                <button
                  type="button"
                  onClick={handleGenerate}
                  disabled={busy !== null}
                  className="flex items-center gap-1.5 px-3 py-2 text-sm font-semibold rounded-md bg-accent text-white hover:bg-accent/90 transition-colors cursor-pointer disabled:opacity-50"
                >
                  {busy === 'generate' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <KeyRound className="w-3.5 h-3.5" />}
                  Generate agent
                </button>
              )}

              {agent && !approved && (
                <button
                  type="button"
                  onClick={handleApprove}
                  disabled={busy !== null || !walletClient || mainnet}
                  className="flex items-center gap-1.5 px-3 py-2 text-sm font-semibold rounded-md bg-accent text-white hover:bg-accent/90 transition-colors cursor-pointer disabled:opacity-50"
                  title={mainnet ? 'Switch to testnet first' : 'Sign approveAgent in your wallet'}
                >
                  {busy === 'approve' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ShieldCheck className="w-3.5 h-3.5" />}
                  Sign approval
                </button>
              )}

              {agent && (
                <button
                  type="button"
                  onClick={handleRevoke}
                  disabled={busy !== null}
                  className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-md border border-border text-text-secondary hover:text-short hover:border-short/40 transition-colors cursor-pointer disabled:opacity-50"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Forget agent
                </button>
              )}
            </div>
          </>
        )}

      </div>
    </Modal>
  )
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2 text-xs">
      <span className="text-text-muted font-mono uppercase tracking-wider">{label}</span>
      <span className="text-text-primary flex items-center">{children}</span>
    </div>
  )
}

function truncAddr(a: string): string {
  return `${a.slice(0, 6)}…${a.slice(-4)}`
}
