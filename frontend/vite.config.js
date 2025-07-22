import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  server: {
    port: 81,
    host: '0.0.0.0',
    proxy: {
      '/tracks': 'http://localhost:8080',
    },
  },
})
