/// <reference types="vitest" />
import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import { fileURLToPath } from "url";

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: ["./src/test-setup.ts"],
    // Unit/integration tests live in two trees: src/**/__tests__ (canonical) and
    // the legacy test/ tree. Both are listed explicitly because e2e/ holds
    // Playwright *.spec.ts files that match vitest's default include pattern —
    // without this, a bare `vitest run` would try to execute them.
    include: [
      "src/**/*.{test,spec}.?(c|m)[jt]s?(x)",
      "test/**/*.{test,spec}.?(c|m)[jt]s?(x)",
    ],
    exclude: ["e2e/**", "**/node_modules/**", "**/dist/**"],
    server: {
      deps: {
        inline: ["leaflet", "leaflet.markercluster"],
      },
    },
    deps: {
      optimizer: {
        web: {
          include: ["leaflet", "leaflet.markercluster"],
        },
      },
    },
    // Ignore asset imports completely
    transformMode: {
      web: [/\.[jt]sx?$/, /\.vue$/],
    },
    threads: true,
    maxThreads: "50%",
  },
  // Asset handling for test environment
  assetsInclude: ["**/*.png", "**/*.jpg", "**/*.jpeg", "**/*.gif", "**/*.svg"],
  define: {
    "process.env.NODE_ENV": JSON.stringify("test"),
    global: "globalThis",
  },
  esbuild: {
    // Handle asset imports at build level
    loader: {
      ".png": "dataurl",
      ".jpg": "dataurl",
      ".jpeg": "dataurl",
      ".gif": "dataurl",
      ".svg": "dataurl",
    },
  },
});
