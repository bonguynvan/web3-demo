import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@chart-lib/library': path.resolve(__dirname, 'packages/library/src'),
      '@chart-lib/core': path.resolve(__dirname, 'packages/core/src'),
      '@chart-lib/commons': path.resolve(__dirname, 'packages/commons/src'),
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
          // Chart library
          if (id.includes('packages/core/') || id.includes('packages/library/') || id.includes('packages/commons/')) {
            return 'chart'
          }
        },
      },
    },
  },
})
