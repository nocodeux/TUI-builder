import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// All /api/* requests are proxied to the Express server (src/server/index.js).
// Run both with: npm run dev:full
// Express handles persistence; Vite handles HMR and the React build.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 3001,
    open: true,
    proxy: {
      '/api': {
        target: 'http://localhost:3002',
        changeOrigin: true,
      }
    }
  }
})
