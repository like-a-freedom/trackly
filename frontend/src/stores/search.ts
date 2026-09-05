import { defineStore } from 'pinia';
import { ref, computed } from 'vue';

export const useSearchStore = defineStore('search', () => {
    const searchQuery = ref<string>('');
    const searchResults = ref<unknown[]>([]);
    const lastSearchQuery = ref<string>('');

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
    }

    return {
        searchQuery,
        searchResults,
        lastSearchQuery,
        hasSearchState,
        saveSearchState,
        restoreSearchState,
        clearSearchState
    };
});
