// @ts-nocheck - Test mocks don't need full type fidelity
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

    it('attributes a view to search only once, for the matching track', () => {
        const store = useSearchStore();
        store.markSelectedFromSearch('t1');

        // Consumed by the first view of that track...
        expect(store.consumeSelectedFromSearch('t1')).toBe(true);
        // ...and not reported again for later views of the same track.
        expect(store.consumeSelectedFromSearch('t1')).toBe(false);
    });

    it('does not attribute a view to search for a different track', () => {
        const store = useSearchStore();
        store.markSelectedFromSearch('t1');

        expect(store.consumeSelectedFromSearch('t2')).toBe(false);
        // The pending attribution for t1 survives an unrelated view.
        expect(store.consumeSelectedFromSearch('t1')).toBe(true);
    });

    it('drops pending search attribution when search state is cleared', () => {
        const store = useSearchStore();
        store.markSelectedFromSearch('t1');
        store.clearSearchState();

        expect(store.consumeSelectedFromSearch('t1')).toBe(false);
    });
});
