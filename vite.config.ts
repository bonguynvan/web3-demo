import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      // Public aliases used by dapp-demo imports
      '@chart-lib/library': path.resolve(__dirname, '../chart-lib/packages/library/src'),
      '@chart-lib/core': path.resolve(__dirname, '../chart-lib/packages/core/src'),
      '@chart-lib/commons': path.resolve(__dirname, '../chart-lib/packages/commons/src'),
      // Internal aliases used within chart-lib packages (@tradecanvas scope)
      '@tradecanvas/chart': path.resolve(__dirname, '../chart-lib/packages/library/src'),
      '@tradecanvas/core': path.resolve(__dirname, '../chart-lib/packages/core/src'),
      '@tradecanvas/commons': path.resolve(__dirname, '../chart-lib/packages/commons/src'),
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id: string) {
          // React core
          if (id.includes('node_modules/react-dom') || id.includes('node_modules/react/')) {
            return 'react-vendor'
          }
          // Web3 stack (wagmi, viem, tanstack query)
          if (id.includes('node_modules/wagmi') || id.includes('node_modules/viem') || id.includes('node_modules/@tanstack')) {
            return 'web3'
          }
          // Chart library (now a sibling repo)
          if (id.includes('chart-lib/packages/')) {
            return 'chart'
          }
        },
      },
    },
  },
})
