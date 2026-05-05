/**
 * useTradeFeed — STUB (no-op).
 *
 * Pre-pivot this generated synthetic trades for `tradingStore.recentTrades`
 * (demo mode) or read PositionManager events from chain (live mode).
 * Both data sources are gone post-pivot.
 *
 * Going forward, RecentTrades should read from the active venue's public
 * trade stream (adapter.subscribePublicTrades). Wiring that is a separate
 * pass — until then this hook is a deliberate no-op so the AppShell mount
 * stays in place without churn.
 */

export function useTradeFeed(): void {
  // intentionally empty
}
