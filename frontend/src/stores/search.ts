import { defineStore } from 'pinia';
import { ref, computed } from 'vue';

export const useSearchStore = defineStore('search', () => {
    const searchQuery = ref<string>('');
    const searchResults = ref<unknown[]>([]);
    const lastSearchQuery = ref<string>('');
    // One-shot marker: which track the user most recently picked from search
    // results. Consumed by the first view of that track for referrer attribution.
    const pendingSearchTrackId = ref<string | null>(null);

    const hasSearchState = computed(() => lastSearchQuery.value.trim() !== '');

    function saveSearchState(query: string, results: unknown[]): void {
        lastSearchQuery.value = query;
        searchQuery.value = query;
        searchResults.value = [...results];
    }

    function restoreSearchState(): void {
        searchQuery.value = lastSearchQuery.value;
    }

    function clearSearchState(): void {
        searchQuery.value = '';
        searchResults.value = [];
        lastSearchQuery.value = '';
        pendingSearchTrackId.value = null;
    }

    function markSelectedFromSearch(trackId: string): void {
        pendingSearchTrackId.value = trackId;
    }

    function consumeSelectedFromSearch(trackId: string): boolean {
        if (pendingSearchTrackId.value !== trackId) return false;
        pendingSearchTrackId.value = null;
        return true;
    }

    return {
        searchQuery,
        searchResults,
        lastSearchQuery,
        hasSearchState,
        saveSearchState,
        restoreSearchState,
        clearSearchState,
        markSelectedFromSearch,
        consumeSelectedFromSearch
    };
});
