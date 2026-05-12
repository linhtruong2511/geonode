import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

// https://vite.dev/config/
export default defineConfig({
  base: '/static/co2_management/react/',
  plugins: [react()],
  resolve: {
    alias: {
      '@common': resolve(__dirname, 'src/common'),
      '@co2': resolve(__dirname, 'src/co2_management'),
    }
  },
  build: {
    outDir: resolve(__dirname, '../src/co2_management/static/co2_management/react/'),
    emptyOutDir: true,
    manifest: true,
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'src/loader.tsx'),
      },
      output: {
        entryFileNames: 'bundle.js',
        chunkFileNames: 'chunks/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash].[ext]',
      },
    },
  },
})
