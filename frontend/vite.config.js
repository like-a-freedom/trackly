import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  server: {
    port: 81,
    host: '0.0.0.0',
    proxy: {
      '/tracks': 'http://localhost:8080',
      '/auth': 'http://localhost:8080',
      '/api': 'http://localhost:8080',
      '/pois': 'http://localhost:8080',
    },
  },
})
