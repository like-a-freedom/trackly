import { defineStore } from 'pinia';
import { ref, computed } from 'vue';

export const useFeatureFlagsStore = defineStore('featureFlags', () => {
    const auth = ref<boolean>(false);
    const editor = ref<boolean>(false);
    const isLoaded = ref<boolean>(false);
    const error = ref<string | null>(null);
    const isLoading = ref(false);

    const isAuthEnabled = computed(() => auth.value);
    const isEditorEnabled = computed(() => editor.value);

    let pending: Promise<void> | null = null;
    function fetchFlags(): Promise<void> {
        if (isLoaded.value && !error.value) return Promise.resolve();
        if (pending) return pending;
        pending = loadFlags().finally(() => { pending = null; });
        return pending;
    }

    async function loadFlags(): Promise<void> {
        isLoading.value = true;
        try {
            const res = await fetch('/api/feature-flags');
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const data = await res.json();
            if (typeof data?.auth !== 'boolean' || typeof data?.editor !== 'boolean') throw new Error('Invalid feature flags');
            auth.value = data.auth;
            editor.value = data.editor;
            error.value = null;
        } catch (e) {
            console.warn('[FeatureFlags] Failed to fetch:', e);
            auth.value = false;
            editor.value = false;
            error.value = 'Some features are unavailable because app settings could not load. Retry to restore them.';
        } finally {
            isLoaded.value = true;
            isLoading.value = false;
        }
    }

    return {
        auth,
        editor,
        isLoaded,
        error,
        isLoading,
        isAuthEnabled,
        isEditorEnabled,
        fetchFlags
    };
});
