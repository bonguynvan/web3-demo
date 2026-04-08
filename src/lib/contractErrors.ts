/**
 * Contract revert → friendly user-facing message mapping.
 *
 * The Solidity contracts in packages/contracts/ use custom errors with names
 * like `Router__SlippageExceeded`. Viem decodes these and surfaces them in
 * `BaseError.shortMessage` or as the trailing token in the message string.
 *
 * This helper turns those into messages a trader actually wants to see.
 */

interface FriendlyError {
  /** Short title for the toast */
  title: string
  /** Longer explanation, optional */
  detail?: string
}

const ERROR_MAP: Record<string, FriendlyError> = {
  // Router
  Router__SlippageExceeded: {
    title: 'Price moved',
    detail: 'Mark price moved beyond your slippage tolerance. Try again.',
  },
  Router__InvalidParams: {
    title: 'Invalid order',
    detail: 'Order parameters are invalid. Check size and collateral.',
  },
  Router__Unauthorized: {
    title: 'Not authorised',
    detail: 'Wallet not authorised to call this function.',
  },

  // PositionManager
  PM__InvalidLeverage: {
    title: 'Leverage out of range',
    detail: 'Leverage must be within the protocol min/max bounds.',
  },
  PM__PositionNotFound: {
    title: 'No position',
    detail: 'No open position to modify on this market and side.',
  },
  PM__SizeTooSmall: {
    title: 'Size too small',
    detail: 'Order size is below the minimum required.',
  },
  PM__InsufficientCollateral: {
    title: 'Not enough collateral',
    detail: 'Collateral remaining after this action would be too low.',
  },
  PM__LiquidatablePosition: {
    title: 'Position is liquidatable',
    detail: 'Cannot modify a liquidatable position. Add collateral first.',
  },

  // Vault
  Vault__UtilizationExceeded: {
    title: 'Pool utilisation full',
    detail: 'The vault has no free liquidity for this trade. Try a smaller size.',
  },
  Vault__InsufficientLiquidity: {
    title: 'Insufficient liquidity',
    detail: 'Not enough USDC in the pool for this trade.',
  },
  Vault__InsufficientPoolAmount: {
    title: 'Pool too small',
    detail: 'Vault pool is too small for this trade.',
  },

  // ERC20
  ERC20InsufficientBalance: {
    title: 'Not enough USDC',
    detail: 'Wallet balance is below the collateral required.',
  },
  ERC20InsufficientAllowance: {
    title: 'Approval needed',
    detail: 'USDC spend approval is too low. Re-approve and try again.',
  },
}

/**
 * Extract a friendly message from any error thrown by a wagmi/viem write call.
 *
 * Strategy:
 *   1. Stringify the error and look for a known custom error name.
 *   2. If not found, fall back to the first 200 chars of the message.
 */
export function friendlyContractError(err: unknown): FriendlyError {
  const raw = err instanceof Error ? err.message : String(err)

  for (const [name, friendly] of Object.entries(ERROR_MAP)) {
    if (raw.includes(name)) return friendly
  }

  // User rejection (MetaMask / injected wallets)
  if (/user rejected|user denied/i.test(raw)) {
    return { title: 'Cancelled', detail: 'You cancelled the transaction.' }
  }

  // Generic fallback
  return {
    title: 'Transaction failed',
    detail: raw.slice(0, 200),
  }
}
