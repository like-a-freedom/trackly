// @ts-nocheck - Test mocks don't need full type fidelity
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { useFeatureFlagsStore } from '../featureFlags';

describe('useFeatureFlagsStore', () => {
  it('exposes an unavailable state for malformed flags and recovers on retry', async () => {
    globalThis.fetch = vi.fn().mockResolvedValueOnce({ok:true,json:async()=>({auth:'true',editor:true})}).mockResolvedValueOnce({ok:true,json:async()=>({auth:false,editor:true})});
    const store = useFeatureFlagsStore();
    await store.fetchFlags();
    expect(store.isAuthEnabled).toBe(false);
    expect(store.isEditorEnabled).toBe(false);
    expect(store.error).toBeTruthy();
    await store.fetchFlags();
    expect(store.error).toBeNull();
    expect(store.isEditorEnabled).toBe(true);
  });
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.restoreAllMocks();
  });

  it('keeps features disabled before fetch', () => {
    const store = useFeatureFlagsStore();
    expect(store.isAuthEnabled).toBe(false);
    expect(store.isEditorEnabled).toBe(false);
    expect(store.isLoaded).toBe(false);
  });

  it('shares a pending flags request between startup and navigation', async () => {
    let complete: (value: unknown) => void = () => {};
    globalThis.fetch = vi.fn(() => new Promise(resolve => { complete = resolve; }));
    const store = useFeatureFlagsStore();
    const first = store.fetchFlags();
    const second = store.fetchFlags();
    expect(fetch).toHaveBeenCalledTimes(1);
    complete({ ok:true, json:async () => ({auth:false,editor:false}) });
    await Promise.all([first,second]);
    expect(store.isEditorEnabled).toBe(false);
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

  it('disables features on fetch failure', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('network'));
    const store = useFeatureFlagsStore();
    await store.fetchFlags();
    expect(store.isAuthEnabled).toBe(false);
    expect(store.isEditorEnabled).toBe(false);
    expect(store.isLoaded).toBe(true);
  });

  it('disables features on non-ok response', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: false, status: 500 });
    const store = useFeatureFlagsStore();
    await store.fetchFlags();
    expect(store.isAuthEnabled).toBe(false);
    expect(store.isEditorEnabled).toBe(false);
    expect(store.isLoaded).toBe(true);
  });
});
