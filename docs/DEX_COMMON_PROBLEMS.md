# Common DEX Frontend Problems & Solutions

Real problems you'll hit building a DEX frontend, with concrete solutions. Ordered by how likely you are to encounter them.

---

## 1. Precision Loss: "The $0 Balance Bug"

**Problem**: User has 0.000001 USDC but UI shows `$0.00`. Or worse: user has $100,000 but UI shows `$0.00` because `Number(100000000000000000000n)` overflows.

**Root cause**: Converting `BigInt` to `Number` too early.

```typescript
// ❌ Bug: Number can't represent 18-decimal values
const balance = Number(rawBalance) // 999999999999999999n → 1000000000000000000 (wrong!)

// ✅ Fix: Stay in BigInt, convert only at display time
const display = (Number(rawBalance / 10n**12n) / 1e6).toFixed(2) // "999,999.99"
```

**Rule**: All math in BigInt. Convert to Number only in the render function, never in hooks or store.

---

## 2. The "Two Transactions" Problem

**Problem**: User clicks "Long ETH" but nothing happens. They click again — now they sent the approve TX twice, or the second trade fails because the first one changed the nonce.

**Root cause**: No state machine for transaction lifecycle.

**Solution**: Implement a proper state machine:

```typescript
type TradeStatus = 'idle' | 'approving' | 'submitting' | 'confirming' | 'success' | 'error'

// Disable the button while any step is in progress
const isSubmitting = status !== 'idle' && status !== 'success' && status !== 'error'

// Show what's happening
{status === 'approving' && 'Approving USDC...'}
{status === 'submitting' && 'Submitting transaction...'}
{status === 'confirming' && 'Waiting for confirmation...'}
```

**Also**: Check allowance BEFORE showing the approve step. If already approved, skip it.

---

## 3. Stale Data After Transaction

**Problem**: User opens a position. Transaction confirms. But the Positions table still shows empty.

**Root cause**: React Query / wagmi caches contract reads. After a write, the cached read is stale.

**Solution**: Invalidate caches after every successful transaction:

```typescript
const queryClient = useQueryClient()

// After tx confirms:
queryClient.invalidateQueries({ queryKey: ['readContract'] })
queryClient.invalidateQueries({ queryKey: ['readContracts'] })
```

**Also**: Set reasonable `staleTime` (5s) and `refetchInterval` (5-10s) on reads.

---

## 4. "Transaction Reverted" with No Explanation

**Problem**: User clicks trade, MetaMask shows, they confirm, then "Transaction reverted" with a hex error code.

**Root cause**: Contract reverted with a custom error, but the frontend doesn't decode it.

**Solution**: Parse custom error signatures:

```typescript
try {
  await writeContractAsync({ ... })
} catch (err) {
  const message = err instanceof Error ? err.message : String(err)

  // Map known contract errors to human messages
  if (message.includes('InsufficientCollateral')) {
    toast.error('Insufficient collateral', 'Increase your collateral amount')
  } else if (message.includes('SlippageExceeded')) {
    toast.error('Price moved', 'The price changed while submitting. Try again.')
  } else if (message.includes('InvalidLeverage')) {
    toast.error('Invalid leverage', 'Maximum leverage is 20x')
  } else {
    toast.error('Transaction failed', message.slice(0, 150))
  }
}
```

---

## 5. Wrong Chain

**Problem**: User connected MetaMask on Ethereum mainnet but the DEX is on Arbitrum. All reads return zero/error.

**Solution**: Check chain ID on every action:

```typescript
const chainId = useChainId()

if (chainId !== 42161) { // Arbitrum
  return <div>Please switch to Arbitrum</div>
}
```

**Better**: Use wagmi's `useSwitchChain` to prompt automatic switching:

```typescript
const { switchChain } = useSwitchChain()
switchChain({ chainId: 42161 })
```

---

## 6. Wallet Disconnects Mid-Transaction

**Problem**: User approves in MetaMask, then closes the browser. When they come back, the approval happened but the trade didn't.

**Solution**:
1. After approval, immediately proceed to the trade tx (don't wait for user input).
2. Store pending tx hashes in localStorage. On page load, check if any are still pending.
3. Use wagmi's `useWaitForTransactionReceipt` with the stored hash.

```typescript
// Save pending tx
localStorage.setItem('pendingTx', JSON.stringify({ hash, action: 'increasePosition', params: {...} }))

// On page load, check for pending
const pending = JSON.parse(localStorage.getItem('pendingTx') || 'null')
if (pending) {
  const receipt = await getTransactionReceipt({ hash: pending.hash })
  if (receipt) {
    localStorage.removeItem('pendingTx')
    if (receipt.status === 'success') toast.success('Previous trade confirmed!')
  }
}
```

---

## 7. Price Flash / Layout Shift

**Problem**: Price displays flash between `$3,498.22` and `$3,498.22` (same value), or the arrow indicator appears/disappears causing layout to jump.

**Solution**: Reserve fixed width for changing elements:

```typescript
// ❌ Layout shifts when arrow appears/disappears
{flash === 'up' && '▲ '}{price}

// ✅ Fixed-width slot — invisible character when no arrow
<span style={{ display: 'inline-block', width: '1em', textAlign: 'center' }}>
  {flash === 'up' ? '▲' : flash === 'down' ? '▼' : '\u2007'}
</span>
{price}
```

Also: only trigger flash when value ACTUALLY changes:
```typescript
if (value === prevRef.current) return // skip — no change
```

---

## 8. Orderbook Performance (High Frequency)

**Problem**: Orderbook updates 10+ times per second. Each update causes full React re-render of 50+ rows.

**Solutions** (pick based on severity):

1. **Throttle**: Use `requestAnimationFrame` to limit to 60fps max
2. **Virtualize**: Use `react-window` to only render visible rows (~20)
3. **Memoize**: Wrap each row in `React.memo` with proper key
4. **Skip React**: For extreme performance, render orderbook in a Canvas (like the chart)

```typescript
// Throttled store subscription (don't re-render on every tick)
const rawOrderbook = useTradingStore(s => s.orderbook)
const orderbook = useThrottledValue(rawOrderbook, 100) // max 10 updates/sec
```

---

## 9. The "Infinite Approval" Decision

**Problem**: Should you ask users to approve the exact amount or `MaxUint256` (infinite)?

| Approach | UX | Security |
|----------|-----|---------|
| Exact amount | Bad — approve TX before every trade | Safe — only approved amount can be spent |
| MaxUint256 | Good — approve once, trade forever | Risk — if contract is compromised, all tokens at risk |

**Industry standard**: Most DEXs use `MaxUint256` for trusted contracts. Show a clear message:

```
"Allow Router to spend your USDC"
[Approve Once]  ← MaxUint256

// For power users, offer exact approval
[Advanced: Approve exact amount]
```

---

## 10. Handling Multiple Positions

**Problem**: User has positions in ETH-PERP (long) and BTC-PERP (short). Switching markets should show the correct position, but the data is mixed.

**Solution**: Key positions by `(account, indexToken, isLong)`:

```typescript
// Read all possible positions
const slots = markets.flatMap(m => [
  { market: m.symbol, token: m.indexToken, isLong: true },
  { market: m.symbol, token: m.indexToken, isLong: false },
])

// Filter to non-zero positions
const openPositions = slots
  .map(slot => readPosition(account, slot.token, slot.isLong))
  .filter(pos => pos.size > 0n)
```

---

## 11. Funding Rate Display

**Problem**: Funding rate is `0.0042%` per 8 hours. How to display it?

**Standard formats**:
```
Per 8h:   +0.0042%     ← what the contract charges
Per hour: +0.000525%   ← divide by 8
Annual:   +18.40%      ← multiply by 365 * 3
```

**What traders want**: The 8h rate + countdown to next payment.

```
Funding: +0.0042%  05:23:41
                   ^^^^^^^^ countdown to next 8h cycle
```

Countdown logic:
```typescript
const now = new Date()
const hours = now.getUTCHours()
const nextFunding = Math.ceil(hours / 8) * 8 // 0, 8, 16 UTC
const target = new Date(now)
target.setUTCHours(nextFunding, 0, 0, 0)
if (target <= now) target.setUTCHours(target.getUTCHours() + 8)
const secondsLeft = Math.floor((target - now) / 1000)
```

---

## 12. The "Liquidation Near" Warning

**Problem**: User's position is approaching liquidation. They should be warned BEFORE it happens.

**Solution**: Calculate margin ratio and show warnings at thresholds:

```typescript
const marginRatio = collateral / size // e.g., 0.05 = 5%
const liquidationThreshold = 0.01     // 1% = liquidation

if (marginRatio < 0.03) {
  // CRITICAL — within 3% of liquidation
  toast.warning('Liquidation risk!', 'Your ETH-PERP long is at 97% margin usage')
}
if (marginRatio < 0.05) {
  // WARNING — within 5%
  // Show orange border around position row
}
```

**Also**: Show the liquidation price prominently in the position table. Color it red. Add a progress bar showing how close the position is to liquidation.

---

## 13. Network Errors & Retries

**Problem**: RPC node returns an error. The whole app breaks.

**Solution**: Wrap all RPC calls with retry logic and graceful degradation:

```typescript
// wagmi's React Query handles retries automatically
const { data, isError, isLoading } = useReadContract({
  ...contracts.vault,
  functionName: 'getPoolAmount',
  query: {
    retry: 2,          // retry twice on failure
    staleTime: 5000,   // cache for 5s
    refetchInterval: 10000, // poll every 10s
  },
})

// Show loading/error states
if (isLoading) return <Skeleton />
if (isError) return <div>Failed to load — retrying...</div>
```

---

## 14. The "Flash Loan" Display Bug

**Problem**: A flash loan temporarily inflates pool amounts. If your UI reads mid-transaction, it shows wrong numbers.

**Solution**: This is mostly a backend concern, but frontend should:
1. Use `block.timestamp` to detect if data is from the current block
2. Average over multiple readings if values change dramatically
3. Show a "data may be delayed" notice during high volatility

---

## 15. Mobile Responsive Trading

**Problem**: Trading UIs are designed for 1920×1080 monitors. On mobile, everything overlaps.

**Solution**: Stack panels vertically on mobile, hide secondary panels:

```
Desktop: [Chart | Orderbook | OrderForm]
Mobile:  [Chart]
         [OrderForm]      ← full width
         [Positions]      ← expandable
         [Orderbook]      ← collapsed by default
```

Use `xl:` breakpoint in Tailwind:
```tsx
<div className="flex flex-col xl:flex-row gap-1">
```

---

## 16. Time Zone Handling

**Problem**: Candle timestamps are in UTC. User is in UTC+7. The chart shows wrong day boundaries.

**Solution**: Always store timestamps in UTC. Convert to local only for display:

```typescript
// Store: always UTC timestamp (seconds or milliseconds)
const candle = { time: 1712345600000 } // UTC

// Display: use user's locale
new Date(candle.time).toLocaleTimeString() // "7:23:41 PM" in user's timezone
```

**For candle charts**: Most libraries handle timezone automatically. But session break lines must align with exchange hours (e.g., crypto = 00:00 UTC).

---

## 17. Testing DEX Frontend

### What to Test

| Priority | What | How |
|----------|------|-----|
| 🔴 Critical | Precision conversions | Unit tests: `usdcToInternal(1000000n)` |
| 🔴 Critical | PnL calculations | Unit tests: all long/short/profit/loss scenarios |
| 🟡 High | Trade flow state machine | Integration test: idle → approve → submit → confirm |
| 🟡 High | Wallet connect/disconnect | E2E: connect demo account, verify balance shows |
| 🟢 Medium | Price flash animation | Visual regression test |
| 🟢 Medium | Responsive layout | Screenshot tests at 320/768/1440px |

### Test with Anvil

```bash
# Start local chain
anvil

# Deploy contracts
forge script script/DeployLocal.s.sol --rpc-url http://127.0.0.1:8545 --broadcast

# Run frontend against local chain
npm run dev
```

Anvil provides deterministic accounts with 10,000 ETH each. Use these for testing.

---

## 18. Checklist Before Launch

- [ ] All BigInt math — no Number for on-chain values
- [ ] Approval flow works (check → approve → trade)
- [ ] Transaction error messages are human-readable
- [ ] Stale data invalidated after every transaction
- [ ] Chain ID check — wrong chain shows warning
- [ ] Liquidation price always visible
- [ ] Price direction flash (green/red)
- [ ] Funding rate countdown accurate
- [ ] PnL updates on every price tick
- [ ] Mobile layout doesn't overlap
- [ ] Wallet disconnect handled gracefully
- [ ] Gas estimation shown before confirming
- [ ] Max leverage enforced in UI (not just contract)
- [ ] Zero amount / negative inputs prevented
- [ ] Loading states for all async operations
- [ ] Error boundaries around each panel
