import { defineStore } from 'pinia';

export const useSearchStore = defineStore('search', {
    state: () => ({
        searchQuery: '',
        searchResults: [],
        lastSearchQuery: ''
    }),

    getters: {
        hasSearchState: (state) => state.lastSearchQuery.trim() !== ''
    },

    actions: {
        saveSearchState(query, results) {
            this.lastSearchQuery = query;
            this.searchQuery = query;
            this.searchResults = [...results];
        },

        restoreSearchState() {
            this.searchQuery = this.lastSearchQuery;
        },

        clearSearchState() {
            this.searchQuery = '';
            this.searchResults = [];
            this.lastSearchQuery = '';
        }
    }
});
