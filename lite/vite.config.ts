import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  server: {
    port: 5183,
    strictPort: true,
    fs: {
      allow: [resolve(here, '..')]
    }
  },
  resolve: {
    alias: {
      '@': resolve(here, '../src/renderer/src'),
      '@renderer': resolve(here, '../src/renderer/src'),
      '@shared': resolve(here, '../src/shared')
    }
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    target: 'chrome120',
    chunkSizeWarningLimit: 2000
  }
})
