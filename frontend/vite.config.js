import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  server: {
    port: 81,
    host: '0.0.0.0',
    proxy: {
      // All API endpoints are prefixed with /api
      '/api': 'http://localhost:8080',
      // Health and metrics endpoints (no /api prefix)
      '/health': 'http://localhost:8080',
      '/metrics': 'http://localhost:8080',
    },
  },
})
