import { defineStore } from 'pinia';

export const useFeatureFlagsStore = defineStore('featureFlags', {
  state: () => ({
    auth: true,
    editor: true,
    isLoaded: false,
  }),
  getters: {
    isAuthEnabled: (s) => s.auth,
    isEditorEnabled: (s) => s.editor,
  },
  actions: {
    async fetchFlags() {
      try {
        const res = await fetch('/api/feature-flags');
        if (!res.ok) return;
        const data = await res.json();
        this.auth = data.auth;
        this.editor = data.editor;
      } catch {
        // Keep defaults on failure
      } finally {
        this.isLoaded = true;
      }
    },
  },
});
