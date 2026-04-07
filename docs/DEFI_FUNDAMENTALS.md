# DeFi & DEX Fundamentals for Frontend Developers

Everything a frontend developer needs to understand before building a DeFi trading product. This isn't a Solidity guide — it's the knowledge you need to write correct UI code, handle edge cases, and not lose users' money through display bugs.

---

## 1. The Decimal Problem (Most Critical)

### Why This Matters First

The #1 source of frontend DeFi bugs is **decimal precision**. Get this wrong and your UI shows $100 when the user actually has $0.0001, or vice versa.

### How Blockchain Stores Numbers

Blockchains have **no floating point**. All values are unsigned integers.

```
Real-world: $1,234.56
On-chain:   1234560000  (USDC with 6 decimals)
            1234560000000000000000  (DAI with 18 decimals)
```

Every token defines its own decimal places:

| Token | Decimals | $1.00 on-chain | Max safe JS number? |
|-------|----------|---------------|---------------------|
| USDC | 6 | `1000000` | ✅ Yes (fits in Number) |
| WETH | 18 | `1000000000000000000` | ❌ No (exceeds 2^53) |
| WBTC | 8 | `100000000` | ✅ Yes |
| DAI | 18 | `1000000000000000000` | ❌ No |

### The BigInt Rule

**NEVER use JavaScript `Number` for on-chain amounts.** Use `BigInt` everywhere.

```typescript
// ❌ WRONG — precision loss
const balance = Number(rawBalance) / 1e18
const amount = balance * 0.5  // floating point error!

// ✅ CORRECT — BigInt until the last moment
const rawBalance = 1234567890123456789n  // from contract
const halfBalance = rawBalance / 2n       // exact integer division
const display = formatUnits(halfBalance, 18)  // "0.617283945061728394" — string for display only
```

### Conversion Map for This Project

Our contracts use **3 different decimal formats**:

```
USDC on-chain:     6 decimals   (1 USDC = 1_000_000)
Internal/prices:   30 decimals  (GMX convention, 1 USD = 10^30)
Frontend display:  human numbers ($1,234.56)
```

Conversion rules:
```typescript
// USDC (6) → Internal (30): multiply by 10^24
usdcToInternal(amount) = amount * 10n**24n

// Internal (30) → USDC (6): divide by 10^24 (rounds down)
internalToUsdc(amount) = amount / 10n**24n

// USDC (6) → Display: divide by 10^6
usdcToDisplay(amount) = Number(amount) / 1e6  // OK because USDC fits in Number

// Display → USDC (6): multiply by 10^6 via string (avoid float)
displayToUsdc("1234.56") → parse string → 1234560000n
```

**Golden rule**: Convert to `Number` ONLY for display. Never convert back from `Number` to `BigInt`.

---

## 2. Wallets & Connections

### What a Wallet Actually Is

A wallet is NOT a balance holder. It's a **key pair**:
- **Private key**: signs transactions (never leaves the user's device)
- **Public key → Address**: the account identifier (0x...)

The blockchain holds the balances, not the wallet software.

### Connection Flow

```
User clicks "Connect" → wagmi shows connector list
  → User picks MetaMask → MetaMask popup asks permission
    → User approves → wagmi gets the address
      → Your app reads balances from the chain using that address
```

### Key Concepts

| Concept | What It Means for Frontend |
|---------|--------------------------|
| **Chain ID** | Each network has a unique ID (1=Ethereum, 42161=Arbitrum, 31337=Anvil). Your app must check it. |
| **RPC URL** | The HTTP endpoint your app talks to. `http://127.0.0.1:8545` for local, `https://arb1.arbitrum.io/rpc` for Arbitrum. |
| **Transaction hash** | After sending a tx, you get a hash. Poll `getTransactionReceipt(hash)` until it confirms. |
| **Gas** | Every tx costs gas. Users pay in the native token (ETH on Ethereum/Arbitrum). |
| **Nonce** | Each account has a counter. Transactions must be sent in order. If a tx fails, the nonce doesn't increment. |
| **Revert** | A failed transaction. The chain rejected it (e.g., "insufficient balance"). Gas is still consumed. |

### The Approval Pattern (Critical for DEX)

ERC20 tokens require a **two-step** process before a contract can spend them:

```
Step 1: User calls token.approve(spenderAddress, amount)
  → "I allow the Router contract to spend up to X of my USDC"

Step 2: User calls router.increasePosition(...)
  → Router calls token.transferFrom(user, router, amount)
  → This works because of the approval in Step 1
```

Frontend flow:
```typescript
// 1. Check current allowance
const allowance = await usdc.allowance(userAddress, routerAddress)

// 2. If not enough, request approval
if (allowance < amount) {
  await usdc.approve(routerAddress, MaxUint256)  // one-time infinite approval
  // Wait for tx confirmation before proceeding!
}

// 3. Now execute the trade
await router.increasePosition(...)
```

**UX tip**: Use `MaxUint256` for approval so users only approve once. Show a clear "Approve USDC" step in the UI.

---

## 3. How a Perpetual DEX Works

### AMM vs Orderbook

| | Orderbook (Binance, dYdX v4) | AMM/Pool (GMX, our DEX) |
|--|------|------|
| **Who is the counterparty?** | Another trader | The liquidity pool |
| **Where does the price come from?** | Supply/demand matching | Oracle (Chainlink) |
| **Orderbook needed?** | Yes, real | No (or synthetic for display) |
| **Slippage** | Depends on book depth | Depends on pool size |
| **Speed** | As fast as the matching engine | As fast as the block time |

### Our Architecture (GMX v1 Style)

```
                 Chainlink Oracle
                       │
                  ┌─────┴─────┐
                  │ PriceFeed  │  ← "ETH is $3,500"
                  └─────┬─────┘
                        │
Trader ──→ Router ──→ PositionManager ──→ Vault (USDC pool)
  │                     │
  │              Opens/closes positions
  │              using oracle price
  │
  └─ Pays USDC collateral
     Gets leveraged exposure
```

- **Vault**: holds USDC from liquidity providers (LPs)
- **PositionManager**: tracks all open positions, handles PnL
- **Router**: user-facing, adds slippage protection
- **PriceFeed**: wraps Chainlink oracle with safety checks

### Key Terms for Frontend

| Term | Definition | Frontend Impact |
|------|-----------|-----------------|
| **Collateral** | USDC the trader puts up | Input field, shown in order form |
| **Size / Notional** | Total position value (collateral × leverage) | `$10,000` position |
| **Leverage** | Multiplier on collateral | Slider, 1x-20x |
| **Entry Price** | Price when position opened | From oracle + spread |
| **Mark Price** | Current oracle price | Used for PnL calculation |
| **Liquidation Price** | Price where position is force-closed | Critical risk metric to display |
| **Unrealized PnL** | Profit/loss if closed now | Must update in real-time |
| **Realized PnL** | Actual profit/loss after closing | Shown in trade history |
| **Funding Rate** | Periodic payment between longs and shorts | Display with countdown timer |
| **Spread** | Difference between buy and sell price | Longs pay higher, shorts pay lower |

### PnL Calculation (Must Be Correct)

```typescript
// Long position PnL
pnl = size × (markPrice - entryPrice) / entryPrice

// Short position PnL
pnl = size × (entryPrice - markPrice) / entryPrice

// Example: Long $10,000, entered at $3,500, now $3,600
pnl = 10000 × (3600 - 3500) / 3500 = $285.71
```

**Frontend rule**: Calculate PnL on every price tick. This is the most watched number on the screen.

### Liquidation Price

```typescript
// Long: liqPrice = entryPrice × (1 - 1/leverage) + fees
// Short: liqPrice = entryPrice × (1 + 1/leverage) - fees

// Example: 10x Long at $3,500
liqPrice ≈ 3500 × (1 - 1/10) = $3,150
// A 10% drop wipes out a 10x long
```

**Frontend rule**: Always show liquidation price. Color it red. This is user safety.

---

## 4. Oracle Prices

### What Chainlink Does

Chainlink is a decentralized oracle network. It reads real-world prices (from exchanges) and puts them on-chain. Your contract reads these prices.

### Why It Matters for Frontend

- **Price staleness**: If the oracle hasn't updated in > 1 hour, the price might be wrong. Your UI should show a warning.
- **Price deviation**: If the price jumps > 10% between rounds, it might be manipulation. The contract will revert — your UI should explain why.
- **Sequencer uptime** (Arbitrum): If the L2 sequencer is down, prices aren't updating. Show a "Network issue" banner.
- **Spread**: For anti-sandwich protection, the contract charges a small spread. Longs pay `price + spread`, shorts pay `price - spread`. Show both prices.

### What to Display

```
Oracle Price:    $3,500.00          ← raw Chainlink price
Long Entry:      $3,501.75  (+0.05% spread)
Short Entry:     $3,498.25  (-0.05% spread)
Last Updated:    2 seconds ago      ← show staleness
```

---

## 5. Transactions & UX

### Transaction Lifecycle

```
1. Build tx      → User fills form, app constructs calldata
2. Sign tx       → MetaMask popup (or demo account signs locally)
3. Send tx       → Broadcast to the network
4. Pending       → In the mempool, waiting to be included in a block
5. Confirmed     → Included in a block, receipt available
6. Success/Fail  → receipt.status === 1 (success) or 0 (reverted)
```

### What to Show at Each Step

| Step | UI State | User Action |
|------|---------|-------------|
| Building | "Preparing transaction..." | None |
| Signing | "Confirm in wallet..." | User approves in MetaMask |
| Pending | "Transaction submitted..." with spinner | Show tx hash link |
| Confirming | "Waiting for confirmation..." | None |
| Success | Green toast "Position opened!" | Auto-dismiss after 4s |
| Failed | Red toast with error message | Show "Try again" |

### Common Revert Reasons

| Error | Meaning | UI Action |
|-------|---------|-----------|
| `PM__InsufficientCollateral` | Collateral too low after fees | "Increase collateral" |
| `PM__InvalidLeverage` | Leverage out of range | "Max leverage is 20x" |
| `Router__SlippageExceeded` | Price moved too much | "Price changed, try again" |
| `Vault__UtilizationExceeded` | Pool is fully utilized | "Reduce position size" |
| `ERC20InsufficientBalance` | Not enough USDC | "Insufficient balance" |
| `ERC20InsufficientAllowance` | Not approved | Show approve step |

**Frontend rule**: Parse revert reasons and show human-readable messages. Never show raw hex to users.

---

## 6. Gas & Speed

### What Traders Care About

- **Gas cost**: How much does this trade cost? Show estimated gas in USD.
- **Confirmation time**: How long until the trade is confirmed? Depends on chain.
- **Failed tx gas**: If a tx reverts, gas is still consumed. Warn before risky txs.

| Chain | Block time | Typical gas cost |
|-------|-----------|-----------------|
| Ethereum L1 | ~12 seconds | $5-50 |
| Arbitrum | ~0.25 seconds | $0.01-0.10 |
| Base | ~2 seconds | $0.001-0.05 |
| Anvil (local) | Instant | Free |

### Frontend Gas Estimation

```typescript
// Estimate gas before sending
const gasEstimate = await publicClient.estimateGas({
  account: userAddress,
  to: routerAddress,
  data: encodeFunctionData({ abi: RouterABI, functionName: 'increasePosition', args: [...] }),
})

// Show to user: "Estimated gas: ~$0.05"
```

---

## 7. Token Decimals Cheat Sheet

| What You're Displaying | Source Decimals | How to Convert |
|------------------------|----------------|----------------|
| USDC balance | 6 | `Number(raw) / 1e6` |
| ETH balance | 18 | `formatUnits(raw, 18)` → string |
| Position size (internal) | 30 | `Number(raw / 10n**24n) / 1e6` |
| Price (internal) | 30 | Same as position size |
| Leverage (basis points) | 0 | `Number(raw) / 10000` (e.g., 100000 = 10x) |
| Fee (basis points) | 0 | `Number(raw) / 10000` (e.g., 10 = 0.1%) |

---

## 8. Security: What Frontend Devs Must Know

### Never Trust the Frontend

The frontend is for **display and UX** only. All validation happens on-chain. But you still need to:

1. **Validate inputs before sending** — Don't let users submit `0` collateral or `999x` leverage. The contract will revert and waste gas.
2. **Never store private keys** — Even test keys in constants should be clearly marked as Anvil-only.
3. **Never construct raw transactions** — Use viem/ethers to build calldata. Hand-crafting ABI encoding leads to bugs.
4. **Check chain ID** — If the user is on the wrong chain, don't let them trade. Show "Switch to Arbitrum".
5. **Handle disconnection** — Wallet can disconnect at any time. Reset UI state.

### The Approval Attack

If you approve `MaxUint256` on a malicious contract, it can drain all your tokens. Only approve **trusted, audited** contracts. In our app, the Router is the only contract that needs USDC approval.

### Read-After-Write Consistency

After a transaction confirms, on-chain state has changed — but your cached reads are stale. Always **invalidate caches** after tx confirmation:

```typescript
// After trade confirms
queryClient.invalidateQueries({ queryKey: ['readContract'] })
queryClient.invalidateQueries({ queryKey: ['readContracts'] })
// Now hooks will re-fetch fresh data
```

---

## 9. Real-Time Data Handling

### Price Updates

In a DEX, prices change every few seconds (or every block). Your UI must handle:

```
Oracle polls every 3s → usePrices hook → React state → components re-render
```

**Rules:**
- Throttle renders to max 60fps (use `requestAnimationFrame`)
- Show price direction (green flash up, red flash down)
- Handle stale prices (show warning if > 30s since last update)
- Never block the UI thread — use async reads

### Position PnL

Positions should update PnL on every price tick. The formula is pure math (no contract call needed):

```typescript
// Recalculate on every price change — no RPC needed
const pnl = isLong
  ? size * (markPrice - entryPrice) / entryPrice
  : size * (entryPrice - markPrice) / entryPrice
```

### Orderbook / Depth (AMM)

Our DEX has no real orderbook (AMM model). The depth display is **synthetic** — generated from the current price and pool liquidity. This is fine for UX but must be clearly communicated to users.

---

## 10. Glossary

| Term | Definition |
|------|-----------|
| **ABI** | Application Binary Interface — the JSON schema that describes a contract's functions and events |
| **AMM** | Automated Market Maker — trades against a pool instead of matching buyers with sellers |
| **Basis Points (bps)** | 1/100th of a percent. 100 bps = 1%. Used for fees and rates. |
| **Calldata** | The encoded function call sent in a transaction |
| **EIP-1559** | Transaction pricing model with base fee + priority fee |
| **ERC-20** | The standard interface for fungible tokens (USDC, WETH, etc.) |
| **Funding Rate** | Periodic payment between longs and shorts to keep perp price near index |
| **Gas** | Unit of computation on EVM chains. Users pay gas × gas price |
| **Keeper** | A bot that performs maintenance tasks (liquidations, price updates) |
| **Liquidation** | Forced closure of a position when collateral drops below threshold |
| **LP** | Liquidity Provider — deposits USDC into the vault, earns from trader losses |
| **Mark Price** | The price used for PnL and liquidation calculations |
| **MEV** | Miner/Maximal Extractable Value — front-running and sandwich attacks |
| **Oracle** | External data feed (Chainlink) that brings off-chain prices on-chain |
| **PLP** | Perp Liquidity Provider token — represents LP's share of the vault |
| **Slippage** | Price difference between expected and actual execution price |
| **Smart Contract** | Immutable code deployed on the blockchain that executes automatically |
| **Spread** | Difference between buy price and sell price (anti-sandwich protection) |
| **TVL** | Total Value Locked — total USDC in the vault |
| **Vault** | The smart contract holding all USDC liquidity |
| **viem** | TypeScript library for Ethereum interactions (successor to ethers.js) |
| **wagmi** | React hooks library for wallet connections and contract interactions |
