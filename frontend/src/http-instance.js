/**
 * Production HTTP instance with auth from useAuthStore.
 */
import { createHttp } from './http.js';
import { useAuthStore } from './stores/auth.js';

export const http = createHttp({
    tokenSource: {
        async getToken() {
            const store = useAuthStore();
            if (!store.accessToken) return null;
            await store.ensureValidToken();
            return store.accessToken;
        }
    },
    logSink: {
        log({ method, path, status }) {
            if (import.meta.env.DEV) {
                console.log(`[http] ${method} ${path} → ${status}`);
            }
        }
    }
});
