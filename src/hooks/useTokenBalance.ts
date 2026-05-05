/**
 * useUsdcBalance — STUB.
 *
 * Pre-pivot this read on-chain ERC20.balanceOf for the connected wallet
 * (live mode) or polled the synthetic DEMO_ACCOUNT.balance (demo mode).
 * Both paths are gone — there's no on-chain USDC contract deployed and
 * the demo account is no longer mutated by the removed Web3OrderForm.
 *
 * Real venue balances now come through `useVenueBalances()` (signed REST
 * to Binance). This stub stays so the few consumers we haven't yet
 * rewired (Web3Header dropdown, usePortfolioData, FuturesOrderForm)
 * compile without churn during the post-pivot cleanup.
 */

export function useUsdcBalance() {
  return { raw: 0n, dollars: 0, isLoading: false, isFetched: true as const }
}
