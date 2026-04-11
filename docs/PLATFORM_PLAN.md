# DeFi Trading Platform — Implementation Plan

> Evolving from perp-only DEX to multi-market DeFi platform.

## Vision

A fast, secure, multi-language DeFi trading platform supporting:
- **Spot** trading (Phase 1 — next)
- **Perpetual** futures (existing)
- **Margin** trading (Phase 3)
- **Futures** with expiry (Phase 4)

Target chain: **Arbitrum One** (deepest L2 DeFi liquidity, GMX ecosystem home).

---

## Architecture Overview

```
┌──────────────────────────────────────────────────────────┐
│                    App Shell (i18n, routing)              │
├──────────┬──────────┬──────────┬─────────────────────────┤
│  Spot    │  Perp    │  Margin  │  Futures                │
│  Module  │  Module  │  Module  │  Module                 │
├──────────┴──────────┴──────────┴─────────────────────────┤
│              Shared Components Layer                      │
│  (Chart, OrderBook, TradeHistory, OrderForm, Positions)   │
├──────────────────────────────────────────────────────────┤
│              Market Abstraction Layer                     │
│  MarketProvider → SpotMarket | PerpMarket | MarginMarket │
├──────────────────────────────────────────────────────────┤
│              Execution Layer                              │
│  SpotExecutor (0x API) | PerpExecutor (GMX Router)       │
├──────────────────────────────────────────────────────────┤
│              Wallet & Chain Layer                         │
│  wagmi + viem → Arbitrum One                             │
└──────────────────────────────────────────────────────────┘
```

---

## Phase 1: Spot Trading (0x Swap API)

### Decision: 0x Swap API v2

| Factor | 0x | 1inch |
|--------|-----|-------|
| Free tier | 5 RPS, no monthly cap | 1 RPS, 100K/month |
| wagmi integration | First-class (official example) | Manual assembly |
| Arbitrum RFQ | Yes — CEX-grade pricing | Limited |
| Fee | 0.15% on select pairs | None |
| Token list | External (Uniswap/CoinGecko) | Built-in (paid only) |

**Verdict:** 0x wins on DX, free tier, and Arbitrum liquidity.

### Spot Trading Flow

```
User selects token pair (e.g., ETH → USDC)
         │
         ▼
GET /swap/allowance-holder/price  (indicative quote)
         │
         ▼
Display: price, slippage, gas estimate, route
         │
         ▼
User clicks "Swap"
         │
         ▼
Check token allowance → approve if needed (AllowanceHolder contract)
         │
         ▼
GET /swap/allowance-holder/quote  (firm quote with tx data)
         │
         ▼
useSendTransaction(quote.transaction)
         │
         ▼
Wait for confirmation → show success/failure
```

### New Files to Create

```
src/
├── types/
│   └── spot.ts                  # SpotToken, SpotQuote, SpotOrder types
├── lib/
│   ├── zeroex.ts                # 0x API client (quote, swap, token list)
│   └── tokens.ts                # Token list management + local cache
├── hooks/
│   ├── useSpotQuote.ts          # React Query hook for 0x price quotes
│   ├── useSpotSwap.ts           # Swap execution (approve + send tx)
│   ├── useTokenList.ts          # Fetch & cache Arbitrum token list
│   └── useTokenBalance.ts       # (extend existing) multi-token balances
├── store/
│   └── spotStore.ts             # Spot UI state (selected tokens, amount)
├── components/
│   └── spot/
│       ├── SpotSwapForm.tsx     # Token selector + amount + swap button
│       ├── TokenSelector.tsx    # Search/select token modal
│       ├── SwapQuoteDisplay.tsx # Price, route, slippage, gas info
│       └── SwapHistory.tsx      # Recent swap transactions
```

### Files to Modify

| File | Change |
|------|--------|
| `src/types/trading.ts` | Add `MarketType = 'spot' \| 'perp' \| 'margin' \| 'futures'` |
| `src/store/tradingStore.ts` | Add `marketType` field, extend `MarketInfo` |
| `src/App.tsx` | Add market type tabs/routing (Spot \| Perp) |
| `src/components/Web3Header.tsx` | Add market type switcher |
| `src/lib/contracts.ts` | Add spot token addresses for Arbitrum |
| `vite.config.ts` | Add `spot` chunk for code splitting |
| `package.json` | No new deps (wagmi/viem/react-query sufficient) |

### Key Types

```typescript
// src/types/spot.ts

export interface SpotToken {
  address: Address
  symbol: string
  name: string
  decimals: number
  logoURI?: string
}

export interface SpotQuote {
  sellToken: SpotToken
  buyToken: SpotToken
  sellAmount: bigint
  buyAmount: bigint
  minBuyAmount: bigint      // after slippage
  price: number             // human-readable rate
  estimatedGas: bigint
  route: string             // e.g. "Uniswap V3 → Camelot"
  sources: { name: string; proportion: number }[]
}

export interface SpotSwapParams {
  sellToken: Address
  buyToken: Address
  sellAmount: string
  slippageBps: number       // default 50 (0.5%)
  taker: Address
}
```

### Implementation Order

1. **Types & 0x client** — `spot.ts` + `zeroex.ts`
2. **Token list** — `tokens.ts` + `useTokenList.ts`
3. **Quote hook** — `useSpotQuote.ts` (price polling)
4. **Swap execution** — `useSpotSwap.ts` (approve + send)
5. **UI components** — `SpotSwapForm` + `TokenSelector` + `SwapQuoteDisplay`
6. **App integration** — Market type tabs, routing, code splitting
7. **Swap history** — `SwapHistory.tsx` (read from on-chain events)

### Estimated Complexity

| Task | Effort |
|------|--------|
| 0x API integration | Small — REST API, no contract ABIs |
| Token approval flow | Small — standard ERC20 approve |
| Token selector with search | Medium — UI + token list management |
| Quote display with routing | Small — render API response |
| Market type abstraction | Medium — refactor store + App layout |
| Swap history | Medium — index on-chain Transfer events |

---

## Phase 2: i18n (Multi-Language)

### Setup

- **Library:** `react-i18next` (most popular, lazy-loading support)
- **Default locale:** `en`
- **Initial locales:** `en`, extensible to any language later
- **Number formatting:** `Intl.NumberFormat` with locale-aware config

### Translation Structure

```
src/
├── i18n/
│   ├── index.ts              # i18next init
│   ├── locales/
│   │   ├── en/
│   │   │   ├── common.json   # shared strings
│   │   │   ├── spot.json     # spot trading
│   │   │   ├── perp.json     # perp trading
│   │   │   └── errors.json   # error messages
│   │   └── vi/               # Vietnamese (when legal)
│   │       ├── common.json
│   │       ├── spot.json
│   │       ├── perp.json
│   │       └── errors.json
│   └── useLocale.ts          # locale-aware number/date formatting
```

### Key Decisions

- Extract all hardcoded strings during Phase 1 spot development
- Use namespace-based splitting (lazy-load per market type)
- Store locale preference in localStorage
- Locale-aware number formatting critical for token amounts and prices

---

## Phase 3: Margin Trading (Future)

- Integrate with lending protocols (Aave V3 on Arbitrum)
- Borrow against collateral → execute spot swap → track position
- Liquidation monitoring via keeper service
- More complex than spot — depends on Phase 1 + 2 maturity

## Phase 4: Futures with Expiry (Future)

- Similar to perps but with settlement dates
- May require custom contracts or integration with existing futures protocols
- Lowest priority — evaluate after Phase 3

---

## Cross-Cutting Concerns

### Security

- [ ] Never store API keys client-side (0x key via env var + proxy if needed)
- [ ] Validate all 0x API responses before building transactions
- [ ] Set reasonable slippage defaults (0.5%) with user override
- [ ] Transaction simulation before signing (already in perp flow)
- [ ] Token allowance management (approve exact amounts, not infinite)

### Performance

- [ ] Lazy load spot module (React.lazy + Suspense)
- [ ] Debounce quote requests (300ms after user stops typing)
- [ ] Cache token list in localStorage with 24h TTL
- [ ] Stale-while-revalidate for quotes (React Query)
- [ ] Code split per market type in vite.config.ts

### Chain Configuration

```typescript
// Arbitrum One
const ARBITRUM_CONFIG = {
  chainId: 42161,
  rpcUrl: 'https://arb1.arbitrum.io/rpc',
  blockExplorer: 'https://arbiscan.io',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  zeroExApi: 'https://arbitrum.api.0x.org',
}
```

---

## Progress Tracker

### Phase 1: Spot Trading — DONE
- [x] Types & constants (`spot.ts`, `spotConstants.ts`)
- [x] 0x API client (`zeroXClient.ts`)
- [x] Token list (`tokenList.ts`, `useTokenList.ts`)
- [x] Spot utilities (`spotUtils.ts`)
- [x] Zustand store (`spotStore.ts`)
- [x] Quote hook (`useSwapQuote.ts`) — debounced, React Query
- [x] Balance hook (`useErc20Balance.ts`) — generic ERC-20 + native ETH
- [x] Swap execution (`useSwapExecution.ts`) — approval + swap state machine
- [x] SpotSwapForm + TokenSelector + SwapQuoteDisplay
- [x] TradePanel integration (Spot tab)
- [x] Arbitrum chain config (wagmi)
- [x] Swap history (`SwapHistory.tsx`, localStorage-backed)

### Phase 2: i18n — FOUNDATION DONE
- [x] Install react-i18next + i18next
- [x] i18n init with namespace splitting (common, spot, perp, errors)
- [x] English translation files
- [x] SpotSwapForm migrated to t() calls (reference pattern)
- [ ] Migrate remaining components (Web3Header, PositionsTable, etc.)
- [ ] Add language switcher UI
- [ ] Add additional languages

### Phase 3: Polish & Testing — DONE
- [x] Code splitting / lazy loading for spot module
- [x] Mobile responsive spot UI (bottom CTA, full-screen modal, touch targets)
- [x] Unit tests (48 tests — Vitest)
- [x] E2E tests (29 tests — Playwright, desktop + mobile)

### Remaining
- [ ] Arbitrum testnet deployment (waiting for funded wallet)
- [ ] Security review
- [ ] Migrate remaining perp components to i18n (Web3Header, Web3OrderForm)
- [ ] Add additional languages
