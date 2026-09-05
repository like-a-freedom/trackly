import { defineStore } from 'pinia';
import { ref, computed } from 'vue';

export const useFeatureFlagsStore = defineStore('featureFlags', () => {
    const auth = ref<boolean>(true);
    const editor = ref<boolean>(true);
    const isLoaded = ref<boolean>(false);

    const isAuthEnabled = computed(() => auth.value);
    const isEditorEnabled = computed(() => editor.value);

    async function fetchFlags(): Promise<void> {
        try {
            const res = await fetch('/api/feature-flags');
            if (!res.ok) return;
            const data: { auth?: boolean; editor?: boolean } = await res.json();
            if (data.auth !== undefined) auth.value = data.auth;
            if (data.editor !== undefined) editor.value = data.editor;
        } catch (e) {
            console.warn('[FeatureFlags] Failed to fetch, using defaults:', e);
        } finally {
            isLoaded.value = true;
        }
    }

    return {
        auth,
        editor,
        isLoaded,
        isAuthEnabled,
        isEditorEnabled,
        fetchFlags
    };
});
