import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Mock Vue lifecycle hooks before importing the composable
vi.mock('vue', async () => {
    const actual = await vi.importActual('vue');
    return {
        ...actual,
        onBeforeUnmount: vi.fn(),
    };
});

import { useDraftSave } from '../useDraftSave';

describe('useDraftSave', () => {
    let storage;

    beforeEach(() => {
        vi.useFakeTimers();
        storage = {};
        vi.stubGlobal('localStorage', {
            getItem: vi.fn((key) => storage[key] ?? null),
            setItem: vi.fn((key, val) => { storage[key] = val; }),
            removeItem: vi.fn((key) => { delete storage[key]; }),
        });
        vi.stubGlobal('addEventListener', vi.fn());
        vi.stubGlobal('removeEventListener', vi.fn());
    });

    afterEach(() => {
        vi.useRealTimers();
        vi.restoreAllMocks();
    });

    function createDraft() {
        return useDraftSave({ debounceMs: 100 });
    }

    describe('checkDraft', () => {
        it('returns false when nothing in localStorage', () => {
            const ds = createDraft();
            expect(ds.hasDraft.value).toBe(false);
        });

        it('returns true for valid draft', () => {
            storage['trackly_draft'] = JSON.stringify({
                version: 1,
                track: { name: 'Test' },
            });
            const ds = createDraft();
            expect(ds.hasDraft.value).toBe(true);
        });

        it('returns false for wrong version', () => {
            storage['trackly_draft'] = JSON.stringify({
                version: 99,
                track: { name: 'Test' },
            });
            const ds = createDraft();
            expect(ds.hasDraft.value).toBe(false);
        });

        it('returns false for corrupt JSON', () => {
            storage['trackly_draft'] = '{invalid json}}}';
            const ds = createDraft();
            expect(ds.hasDraft.value).toBe(false);
        });
    });

    describe('saveDraft / loadDraft', () => {
        it('saves and loads a draft correctly', () => {
            const ds = createDraft();
            const state = {
                track: { name: 'My Track', segments: [[1, 2]] },
                editingState: { activeSegment: 0 },
            };

            ds.saveDraft(state);
            expect(ds.hasDraft.value).toBe(true);

            const loaded = ds.loadDraft();
            expect(loaded).not.toBeNull();
            expect(loaded.version).toBe(1);
            expect(loaded.track.name).toBe('My Track');
            expect(loaded.timestamp).toBeDefined();
        });

        it('loadDraft returns null when nothing saved', () => {
            const ds = createDraft();
            expect(ds.loadDraft()).toBeNull();
        });
    });

    describe('deleteDraft', () => {
        it('removes draft from storage', () => {
            const ds = createDraft();
            ds.saveDraft({ track: { name: 'del' }, editingState: {} });
            expect(ds.hasDraft.value).toBe(true);

            ds.deleteDraft();
            expect(ds.hasDraft.value).toBe(false);
            expect(ds.isDirty.value).toBe(false);
        });
    });

    describe('debouncedSave', () => {
        it('saves after debounce delay', () => {
            const ds = createDraft();
            const state = { track: { name: 'debounced' }, editingState: {} };

            ds.debouncedSave(state);
            expect(ds.isDirty.value).toBe(true);

            // Not yet saved
            expect(ds.loadDraft()).toBeNull();

            vi.advanceTimersByTime(100);
            const loaded = ds.loadDraft();
            expect(loaded.track.name).toBe('debounced');
        });

        it('resets timer on rapid calls', () => {
            const ds = createDraft();

            ds.debouncedSave({ track: { name: 'first' }, editingState: {} });
            vi.advanceTimersByTime(50);

            ds.debouncedSave({ track: { name: 'second' }, editingState: {} });
            vi.advanceTimersByTime(50);

            // First timer would have fired by now, but was reset
            expect(ds.loadDraft()).toBeNull();

            vi.advanceTimersByTime(50);
            const loaded = ds.loadDraft();
            expect(loaded.track.name).toBe('second');
        });
    });

    describe('markClean', () => {
        it('sets isDirty to false', () => {
            const ds = createDraft();
            ds.debouncedSave({ track: { name: 'x' }, editingState: {} });
            expect(ds.isDirty.value).toBe(true);

            ds.markClean();
            expect(ds.isDirty.value).toBe(false);
        });
    });

    describe('install / uninstall', () => {
        it('adds beforeunload listener on install', () => {
            const ds = createDraft();
            ds.install();
            expect(window.addEventListener).toHaveBeenCalledWith(
                'beforeunload',
                expect.any(Function)
            );
        });

        it('removes beforeunload listener on uninstall', () => {
            const ds = createDraft();
            ds.install();
            ds.uninstall();
            expect(window.removeEventListener).toHaveBeenCalledWith(
                'beforeunload',
                expect.any(Function)
            );
        });
    });
});
