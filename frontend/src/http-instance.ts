/**
 * Production HTTP instance with auth from useAuthStore.
 */
import { createHttp } from './http';
import { useAuthStore } from './stores/auth';

export const http = createHttp({
    tokenSource: {
        async getToken(): Promise<string | null> {
            const store = useAuthStore();
            if (!store.accessToken) return null;
            await store.ensureValidToken();
            return store.accessToken;
        }
    },
    logSink: {
        log({ method, path, status }: { method: string; path: string; status: number }): void {
            if (import.meta.env.DEV) {
                console.log(`[http] ${method} ${path} → ${status}`);
            }
        }
    }
});
