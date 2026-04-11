# Development Setup

## Prerequisites

- Node.js >= 18
- pnpm >= 9 (for chart-lib monorepo)
- npm (for dapp-demo)
- Git

## Repository Structure

This project depends on a sibling chart library:

```
personal_project/
├── dapp-demo/          # This app (DeFi trading platform)
└── chart-lib/          # Chart library (standalone monorepo)
```

## First-Time Setup

### 1. Clone both repositories

```bash
cd ~/WebstormProjects/personal_project

# dapp-demo (this app)
git clone <dapp-demo-repo-url> dapp-demo

# chart-lib (chart library)
git clone <chart-lib-repo-url> chart-lib
```

### 2. Install chart-lib dependencies

```bash
cd chart-lib
pnpm install
pnpm build
```

### 3. Install dapp-demo dependencies

```bash
cd ../dapp-demo
npm install
```

### 4. Start development

```bash
npm run dev
```

## How Chart Library Integration Works

dapp-demo imports `@chart-lib/*` packages, which are resolved to the sibling directory
via two mechanisms:

**Vite aliases** (for bundling + HMR):
```typescript
// vite.config.ts
resolve: {
  alias: {
    '@chart-lib/library': path.resolve(__dirname, '../chart-lib/packages/library/src'),
    '@chart-lib/core':    path.resolve(__dirname, '../chart-lib/packages/core/src'),
    '@chart-lib/commons': path.resolve(__dirname, '../chart-lib/packages/commons/src'),
  }
}
```

**TypeScript paths** (for IDE intellisense + type checking):
```json
// tsconfig.app.json
"paths": {
  "@chart-lib/library": ["../chart-lib/packages/library/src"],
  "@chart-lib/core":    ["../chart-lib/packages/core/src"],
  "@chart-lib/commons": ["../chart-lib/packages/commons/src"]
}
```

Changes to `../chart-lib/` automatically reload in dapp-demo via Vite HMR.

## Important Notes

- Chart library source lives exclusively in `../chart-lib/`.
- The chart library will be published as `@vanbo/trading-chart` or `@vanbo/chart-lib`.
  Once published, dapp-demo will switch from path aliases to npm imports.

## Available Scripts

| Script | Description |
|--------|-------------|
| `npm run dev` | Start Vite dev server |
| `npm run dev:full` | Start with local Anvil chain + keepers |
| `npm run build` | TypeScript check + Vite production build |
| `npm run lint` | Run ESLint |
| `npm run preview` | Preview production build |

## Architecture

See [FRONTEND_ARCHITECTURE.md](./FRONTEND_ARCHITECTURE.md) for the full architecture guide.

## Platform Roadmap

See [PLATFORM_PLAN.md](./PLATFORM_PLAN.md) for the multi-market DeFi platform plan.
