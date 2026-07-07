import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

// https://vite.dev/config/
export default defineConfig({
  base: '/static/react/',
  plugins: [react()],
  resolve: {
    alias: {
      '@common': resolve(__dirname, 'src/common'),
      '@co2': resolve(__dirname, 'src/co2_management'),
      '@wind': resolve(__dirname, 'src/wind_management'),
    }
  },
  build: {
    outDir: resolve(__dirname, '../src/geonode_project/static/react/'),
    emptyOutDir: true,
    manifest: true,
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'src/loader.tsx'),
      },
      output: {
        entryFileNames: 'bundle.js',
        chunkFileNames: 'chunks/[name]-[hash].js',
        assetFileNames: (assetInfo) => {
          if (assetInfo.name && assetInfo.name.endsWith('.css')) {
            return 'bundle.css';
          }
          return 'assets/[name]-[hash].[ext]';
        },
      },
    },
  },
})
