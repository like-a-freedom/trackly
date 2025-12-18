/// <reference types="vitest" />
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
    plugins: [vue()],
    test: {
        globals: true,
        environment: 'jsdom',
        setupFiles: ['./src/test-setup.js'],
        server: {
            deps: {
                inline: ['leaflet', 'leaflet.markercluster']
            }
        },
        deps: {
            optimizer: {
                web: {
                    include: ['leaflet', 'leaflet.markercluster']
                }
            }
        },
        // Ignore asset imports completely
        transformMode: {
            web: [/\.[jt]sx?$/, /\.vue$/]
        },        // Improve test parallelism
        threads: true,
        maxThreads: '50%',
    },
    // Asset handling for test environment
    assetsInclude: ['**/*.png', '**/*.jpg', '**/*.jpeg', '**/*.gif', '**/*.svg'],
    define: {
        'process.env.NODE_ENV': JSON.stringify('test'),
        global: 'globalThis'
    },
    esbuild: {
        // Handle asset imports at build level
        loader: {
            '.png': 'dataurl',
            '.jpg': 'dataurl',
            '.jpeg': 'dataurl',
            '.gif': 'dataurl',
            '.svg': 'dataurl'
        }
    }
})
