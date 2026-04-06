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
})
