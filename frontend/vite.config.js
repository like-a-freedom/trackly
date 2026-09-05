import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import { fileURLToPath, URL } from "node:url";

export default defineConfig({
  plugins: [
    vue(),
    {
      name: "remove-permissions-policy",
      configureServer(server) {
        server.middlewares.use((req, res, next) => {
          const originalWriteHead = res.writeHead;
          res.writeHead = function (statusCode, headers) {
            if (headers && headers["Permissions-Policy"]) {
              delete headers["Permissions-Policy"];
            }
            if (this.getHeader && this.getHeader("Permissions-Policy")) {
              this.removeHeader("Permissions-Policy");
            }
            return originalWriteHead.call(this, statusCode, headers);
          };
          next();
        });
      },
    },
  ],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  server: {
    port: 81,
    host: "0.0.0.0",
    proxy: {
      // All API endpoints are prefixed with /api
      "/api": "http://localhost:8080",
      // Health and metrics endpoints (no /api prefix)
      "/health": "http://localhost:8080",
      "/metrics": "http://localhost:8080",
    },
  },
  build: {
    target: "es2022",
  },
});
