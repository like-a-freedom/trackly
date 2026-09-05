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
    setupFiles: ["./src/test-setup.js"],
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
