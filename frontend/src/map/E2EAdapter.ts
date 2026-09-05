/**
 * E2EAdapter — sets up and tears down E2E testing hooks on `window`.
 *
 * Provides a portable way to expose APIs under a configurable namespace
 * (default `__e2e`) that Playwright / Cypress tests can call.
 *
 * @module map/E2EAdapter
 */

export interface E2EAdapter {
    exposeE2E: (namespace: string, api: Record<string, unknown>) => void;
    expose: (api: Record<string, unknown>) => void;
    getApi: () => Record<string, unknown> | null;
    cleanup: () => void;
}

interface E2EAdapterOptions {
    namespace?: string;
    production?: boolean;
}

/**
 * Create an E2EAdapter.
 *
 * @param opts - Options with namespace and production flag
 * @returns E2EAdapter instance
 */
export function createE2EAdapter({ namespace = '__e2e', production = false }: E2EAdapterOptions = {}): E2EAdapter {
    if (production) {
        return {
            exposeE2E() {},
            expose() {},
            getApi() { return null; },
            cleanup() {},
        };
    }

    /** Keys we have added (for selective cleanup). */
    const _addedKeys: string[] = [];

    /**
     * Merge `api` properties into `window[ns]`, preserving any keys
     * that already existed on the object.
     *
     * @param ns - Namespace / property name on `window`.
     * @param api - Key-value pairs to expose.
     */
    function exposeE2E(ns: string, api: Record<string, unknown>): void {
        if (typeof window === 'undefined' || !api) return;
        (window as unknown as Record<string, Record<string, unknown>>)[ns] =
            (window as unknown as Record<string, Record<string, unknown>>)[ns] || {};
        for (const key of Object.keys(api)) {
            const nsObj = (window as unknown as Record<string, Record<string, unknown>>)[ns];
            if (nsObj) nsObj[key] = api[key];
            _addedKeys.push(key);
        }
    }

    /**
     * Shorthand: expose under the adapter's default namespace.
     * @param api - Key-value pairs to expose.
     */
    function expose(api: Record<string, unknown>): void {
        exposeE2E(namespace, api);
    }

    /**
     * Return a reference to the current namespace object, or `null`.
     */
    function getApi(): Record<string, unknown> | null {
        if (typeof window === 'undefined') return null;
        return (window as unknown as Record<string, Record<string, unknown>>)[namespace] || null;
    }

    /**
     * Remove only the keys this adapter has added, leaving pre-existing
     * keys intact.
     */
    function cleanup(): void {
        if (typeof window === 'undefined') return;
        if (!(window as unknown as Record<string, unknown>)[namespace]) return;
        for (const key of _addedKeys) {
            try {
                const nsObj = (window as unknown as Record<string, Record<string, unknown>>)[namespace];
                if (nsObj) delete nsObj[key];
            } catch (_) { /* non-configurable — skip */ }
        }
        _addedKeys.length = 0;

        // Remove the namespace object itself if it is now empty
        const nsObj = (window as unknown as Record<string, Record<string, unknown>>)[namespace];
        if (nsObj && Object.keys(nsObj).length === 0) {
            delete (window as unknown as Record<string, unknown>)[namespace];
        }
    }

    return {
        exposeE2E,
        expose,
        getApi,
        cleanup,
    };
}
