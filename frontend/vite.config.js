import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  server: {
    port: 81,
    host: '0.0.0.0',
    proxy: {
      '/tracks': 'http://localhost:8080',
      // Proxy auth endpoints to backend
      // /auth/google/callback: proxy POST (API call), but let GET through to frontend router
      '/auth/google/callback': {
        target: 'http://localhost:8080',
        bypass: (req) => {
          // Only proxy POST requests; GET should be handled by frontend router (OAuth redirect)
          if (req.method === 'GET') {
            return req.url; // Return the URL to skip proxy and serve from Vite
          }
          // POST requests go to backend
          return null;
        },
      },
      '/auth/oauth-config': 'http://localhost:8080',
      '/auth/google/login': 'http://localhost:8080',
      '/auth/refresh': 'http://localhost:8080',
      '/auth/logout': 'http://localhost:8080',
      '/auth/migrate-session-tracks': 'http://localhost:8080',
      '/api': 'http://localhost:8080',
      '/pois': 'http://localhost:8080',
    },
  },
})
