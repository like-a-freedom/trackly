import { ref } from 'vue'

// Global search state
const searchQuery = ref('')
const searchResults = ref([])
const lastSearchQuery = ref('')

export function useSearchState() {
    const saveSearchState = (query, results) => {
        lastSearchQuery.value = query
        searchQuery.value = query
        searchResults.value = [...results]
    }

    const restoreSearchState = () => {
        searchQuery.value = lastSearchQuery.value
        // Results will be restored via the search query
    }

    const clearSearchState = () => {
        searchQuery.value = ''
        searchResults.value = []
        lastSearchQuery.value = ''
    }

    const hasSearchState = () => {
        return lastSearchQuery.value.trim() !== ''
    }

    return {
        searchQuery,
        searchResults,
        lastSearchQuery,
        saveSearchState,
        restoreSearchState,
        clearSearchState,
        hasSearchState
    }
}
