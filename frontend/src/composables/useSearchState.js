import { computed } from 'vue';
import { useSearchStore } from '../stores/search.js';

export function useSearchState() {
    const store = useSearchStore();
    const searchQuery = computed({
        get: () => store.searchQuery,
        set: (val) => { store.searchQuery = val; }
    });
    const searchResults = computed(() => store.searchResults);
    const lastSearchQuery = computed(() => store.lastSearchQuery);

    return {
        searchQuery,
        searchResults,
        lastSearchQuery,
        saveSearchState: store.saveSearchState.bind(store),
        restoreSearchState: store.restoreSearchState.bind(store),
        clearSearchState: store.clearSearchState.bind(store),
        hasSearchState: () => store.hasSearchState
    };
}
