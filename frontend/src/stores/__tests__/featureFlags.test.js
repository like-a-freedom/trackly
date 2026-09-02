import { describe, it, expect, beforeEach, vi } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { useFeatureFlagsStore } from '../featureFlags';

describe('useFeatureFlagsStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.restoreAllMocks();
  });

  it('has default flags (all enabled) before fetch', () => {
    const store = useFeatureFlagsStore();
    expect(store.isAuthEnabled).toBe(true);
    expect(store.isEditorEnabled).toBe(true);
    expect(store.isLoaded).toBe(false);
  });

  it('fetches flags from backend', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ auth: false, editor: true }),
    });
    const store = useFeatureFlagsStore();
    await store.fetchFlags();
    expect(store.isAuthEnabled).toBe(false);
    expect(store.isEditorEnabled).toBe(true);
    expect(store.isLoaded).toBe(true);
  });

  it('keeps defaults on fetch failure', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('network'));
    const store = useFeatureFlagsStore();
    await store.fetchFlags();
    expect(store.isAuthEnabled).toBe(true);
    expect(store.isEditorEnabled).toBe(true);
    expect(store.isLoaded).toBe(true);
  });

  it('keeps defaults on non-ok response', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: false, status: 500 });
    const store = useFeatureFlagsStore();
    await store.fetchFlags();
    expect(store.isAuthEnabled).toBe(true);
    expect(store.isEditorEnabled).toBe(true);
    expect(store.isLoaded).toBe(true);
  });
});
