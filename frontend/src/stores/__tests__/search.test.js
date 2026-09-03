import { describe, it, expect, beforeEach } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { useSearchStore } from '../search';

describe('useSearchStore', () => {
    beforeEach(() => {
        setActivePinia(createPinia());
    });

    it('initializes with empty state', () => {
        const store = useSearchStore();
        expect(store.searchQuery).toBe('');
        expect(store.searchResults).toEqual([]);
        expect(store.lastSearchQuery).toBe('');
        expect(store.hasSearchState).toBe(false);
    });

    it('hasSearchState returns true when lastSearchQuery is set', () => {
        const store = useSearchStore();
        store.saveSearchState('test', []);
        expect(store.hasSearchState).toBe(true);
    });

    it('saves search state', () => {
        const store = useSearchStore();
        const results = [{ id: 't1' }];
        store.saveSearchState('test', results);
        expect(store.lastSearchQuery).toBe('test');
        expect(store.searchQuery).toBe('test');
        expect(store.searchResults).toEqual(results);
    });

    it('restores search state', () => {
        const store = useSearchStore();
        store.saveSearchState('test', []);
        store.searchQuery = '';
        store.restoreSearchState();
        expect(store.searchQuery).toBe('test');
    });

    it('clears search state', () => {
        const store = useSearchStore();
        store.saveSearchState('test', []);
        store.clearSearchState();
        expect(store.searchQuery).toBe('');
        expect(store.searchResults).toEqual([]);
        expect(store.lastSearchQuery).toBe('');
        expect(store.hasSearchState).toBe(false);
    });
});
