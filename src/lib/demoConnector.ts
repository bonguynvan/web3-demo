/**
 * Demo Account Connector — wagmi connector for Anvil pre-funded accounts.
 *
 * Allows trading without MetaMask by using well-known Anvil private keys.
 * When connected, all wagmi hooks (useAccount, useWriteContract, etc.) work
 * as if a real wallet is connected.
 *
 * Accounts are pre-funded with USDC by the deploy script.
 */

import { createConnector } from 'wagmi'
import {
  createWalletClient,
  createPublicClient,
  http,
  type Address,
  type Chain,
  custom,
  type EIP1193RequestFn,
  type WalletClient,
} from 'viem'
import { privateKeyToAccount, type PrivateKeyAccount } from 'viem/accounts'
import { foundry } from 'viem/chains'

export interface DemoAccount {
  label: string
  address: Address
  privateKey: `0x${string}`
  balance: string // display label
}

export const DEMO_ACCOUNTS: DemoAccount[] = [
  {
    label: 'Demo Account 1',
    address: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
    privateKey: '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d',
    balance: '$100K USDC',
  },
  {
    label: 'Demo Account 2',
    address: '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC',
    privateKey: '0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a',
    balance: '$100K USDC',
  },
  {
    label: 'Demo Account 3',
    address: '0x90F79bf6EB2c4f870365E785982E1f101E93b906',
    privateKey: '0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6',
    balance: '$100K USDC',
  },
  {
    label: 'Deployer (Admin)',
    address: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266',
    privateKey: '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80',
    balance: '$1M USDC',
  },
]

const RPC_URL = 'http://127.0.0.1:8545'

/**
 * Create a wagmi connector for a specific Anvil demo account.
 * Usage: demoConnector({ account: DEMO_ACCOUNTS[0] })
 */
export function demoConnector(params: { account: DemoAccount }) {
  const { account: demoAccount } = params
  const viemAccount = privateKeyToAccount(demoAccount.privateKey)

  let cachedProvider: any = null

  return createConnector((config) => ({
    id: `demo-${demoAccount.address.slice(0, 8)}`,
    name: demoAccount.label,
    type: 'demo' as const,

    // @ts-expect-error wagmi v3.4 connect() signature is generic over withCapabilities;
    // this demo connector ignores capabilities and is slated for deletion in the trading-terminal pivot.
    async connect() {
      const chainId = foundry.id
      return {
        accounts: [viemAccount.address] as readonly `0x${string}`[],
        chainId,
      }
    },

    async disconnect() {
      // nothing to clean up
    },

    async getAccounts() {
      return [viemAccount.address]
    },

    async getChainId() {
      return foundry.id
    },

    async isAuthorized() {
      return true
    },

    onAccountsChanged() {},
    onChainChanged() {},
    onDisconnect() {},

    async getProvider(): Promise<any> {
      // Cache the wallet client so we don't create new instances on every call
      if (!cachedProvider) {
        const wc = createWalletClient({
          account: viemAccount,
          chain: foundry,
          transport: http(RPC_URL),
        })

        cachedProvider = {
          request: async ({ method, params }: { method: string; params?: any[] }) => {
            switch (method) {
              case 'eth_accounts':
              case 'eth_requestAccounts':
                return [viemAccount.address]

              case 'eth_chainId':
                return `0x${foundry.id.toString(16)}`

              case 'personal_sign':
              case 'eth_sign': {
                const [message] = params as [string]
                return wc.signMessage({ message: { raw: message as `0x${string}` } })
              }

              case 'eth_signTypedData_v4': {
                const [, typedData] = params as [string, string]
                const parsed = JSON.parse(typedData)
                return wc.signTypedData({
                  domain: parsed.domain,
                  types: parsed.types,
                  primaryType: parsed.primaryType,
                  message: parsed.message,
                })
              }

              case 'eth_sendTransaction': {
                const [tx] = params as [any]
                const hash = await wc.sendTransaction({
                  to: tx.to,
                  data: tx.data,
                  value: tx.value ? BigInt(tx.value) : undefined,
                  // Let viem auto-estimate gas if not provided
                  ...(tx.gas ? { gas: BigInt(tx.gas) } : {}),
                })
                return hash
              }

              // ─── Fakes for noisy block-tracker calls ───
              // wagmi's transport-level block tracker may poll these even
              // with `pollingInterval: 60000` set. Faking them keeps Anvil
              // logs clean without affecting any real read path — application
              // hooks fetch their own data via `useReadContract` which goes
              // through the `eth_call` branch below.
              case 'eth_blockNumber':
                return `0x${Math.floor(Date.now() / 12000).toString(16)}`

              case 'eth_getBlockByNumber':
              case 'eth_getBlockByHash':
                return {
                  number: `0x${Math.floor(Date.now() / 12000).toString(16)}`,
                  hash: '0x0000000000000000000000000000000000000000000000000000000000000000',
                  timestamp: `0x${Math.floor(Date.now() / 1000).toString(16)}`,
                  parentHash: '0x0000000000000000000000000000000000000000000000000000000000000000',
                  baseFeePerGas: '0x3b9aca00',
                  gasLimit: '0x1c9c380',
                  gasUsed: '0x0',
                  transactions: [],
                }

              // ─── Real reads — proxy straight to Anvil ───
              // Required for live mode (balance, allowance, position reads,
              // simulations, etc.). In demo mode the live hooks are guarded
              // with `enabled: !isDemo`, so these branches don't fire and
              // there's no RPC spam.
              case 'eth_call':
              case 'eth_getBalance':
              case 'eth_getCode':
              case 'eth_estimateGas':
              case 'eth_gasPrice':
              case 'eth_maxPriorityFeePerGas':
              case 'eth_getTransactionReceipt':
              case 'eth_getTransactionByHash':
              case 'eth_getLogs':
              case 'net_version':
              default: {
                try {
                  const res = await fetch(RPC_URL, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
                  })
                  const json = await res.json()
                  if (json.error) throw new Error(json.error.message)
                  return json.result
                } catch (err) {
                  // Fall through to a sensible empty response per method type
                  // so the UI doesn't crash on transient Anvil hiccups.
                  if (method === 'eth_call' || method === 'eth_getCode') return '0x'
                  if (method === 'eth_getBalance' || method === 'eth_estimateGas') return '0x0'
                  throw err
                }
              }
            }
          },
          on: () => {},
          removeListener: () => {},
        }
      }
      return cachedProvider
    },
  }))
}
