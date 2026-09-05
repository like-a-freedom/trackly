// TypeScript shim for Vue SFC modules
// This allows TypeScript to recognize .vue files as modules
declare module '*.vue' {
    import type { DefineComponent } from 'vue';
    const component: DefineComponent<{}, {}, any>;
    export default component;
}

// Vite client types for import.meta.env
/// <reference types="vite/client" />

// CSS module declarations
declare module '*.css' {
    const content: string;
    export default content;
}

// Temporary declarations for JS modules being migrated (will be removed in Phase 4)
declare module '../stores/auth' {
    export const useAuthStore: unknown;
}
declare module '../stores/featureFlags' {
    export const useFeatureFlagsStore: unknown;
}
declare module './stores/auth' {
    export const useAuthStore: unknown;
}
declare module './stores/featureFlags' {
    export const useFeatureFlagsStore: unknown;
}
