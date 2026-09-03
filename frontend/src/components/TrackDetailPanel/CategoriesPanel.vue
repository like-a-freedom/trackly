<script setup>
import { ref, watch } from 'vue';
import Multiselect from '@vueform/multiselect';

const props = defineProps({
    track: { type: Object, required: true },
    isOwner: { type: Boolean, default: false },
    categoriesList: { type: Array, default: () => [] },
});

const emit = defineEmits(['categories-updated', 'error']);

const selectedCategories = ref([]);
const savingCategories = ref(false);
const categoriesError = ref('');

function formatCategory(category) {
    if (!category) return '';
    return category.charAt(0).toUpperCase() + category.slice(1);
}

// Initialize selectedCategories from track.categories
watch(
    () => props.track?.categories,
    (newCategories) => {
        if (newCategories) {
            selectedCategories.value = newCategories.map((cat) => {
                const found = props.categoriesList.find((c) => c.value === cat.toLowerCase());
                return found || { value: cat.toLowerCase(), label: cat };
            });
        } else {
            selectedCategories.value = [];
        }
    },
    { immediate: true }
);

async function onCategoriesChange(newValue) {
    categoriesError.value = '';

    if (!newValue || newValue.length === 0) {
        categoriesError.value = 'At least one category is required.';
        // Revert to previous value
        selectedCategories.value = props.track.categories.map((cat) => {
            const found = props.categoriesList.find((c) => c.value === cat.toLowerCase());
            return found || { value: cat.toLowerCase(), label: cat };
        });
        return;
    }

    // Convert objects to strings
    const categoryValues = newValue.map((c) => c.value);

    savingCategories.value = true;
    try {
        emit('categories-updated', categoryValues);
    } catch (err) {
        console.error('Failed to update categories', err);
        categoriesError.value = err.message || 'Failed to update categories.';

        // Revert to previous value on error
        selectedCategories.value = props.track.categories.map((cat) => {
            const found = props.categoriesList.find((c) => c.value === cat.toLowerCase());
            return found || { value: cat.toLowerCase(), label: cat };
        });
    } finally {
        savingCategories.value = false;
    }
}
</script>

<template>
    <div
        v-if="isOwner || (track.categories && track.categories.length > 0)"
        class="stats-section"
    >
        <div class="section-header-with-tooltip">
            <h3>Categories</h3>
            <span
                class="info-icon"
                tabindex="0"
                data-tooltip="Categories that were added by the user during track upload"
                aria-label="Categories that were added by the user during track upload"
            >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <circle cx="12" cy="12" r="10" />
                    <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
                    <line x1="12" y1="17" x2="12.01" y2="17" />
                </svg>
            </span>
        </div>

        <!-- Owner: inline editable Multiselect -->
        <div
            v-if="isOwner"
            class="categories-inline-edit"
            @mousedown.stop
            @mouseup.stop
            @click.stop
            @dblclick.stop
            @selectstart.stop
            @dragstart.prevent
        >
            <Multiselect
                v-model="selectedCategories"
                mode="tags"
                :close-on-select="false"
                :searchable="true"
                :create-option="false"
                :options="categoriesList"
                :object="true"
                placeholder="Select categories"
                class="track-category-select-inline"
                :append-to-body="true"
                position="bottom-start"
                :max-height="220"
                :disabled="savingCategories"
                :style="{ margin: '0', marginLeft: '0', marginRight: '0' }"
                @change="onCategoriesChange"
                @mousedown.stop
                @mouseup.stop
                @click.stop
                @dblclick.stop
                @selectstart.stop
                @dragstart.prevent
            />
            <transition name="fade-slide">
                <div v-if="savingCategories" class="saving-indicator">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="spinner">
                        <circle cx="12" cy="12" r="10" opacity="0.25" />
                        <path d="M12 2 A10 10 0 0 1 22 12" stroke-linecap="round" />
                    </svg>
                    Saving...
                </div>
            </transition>
            <transition name="fade-slide">
                <div v-if="categoriesError" class="edit-error">
                    {{ categoriesError }}
                </div>
            </transition>
        </div>

        <!-- Non-owner: read-only tags -->
        <div v-else class="categories">
            <span v-for="category in track.categories" :key="category" class="category-tag">
                {{ formatCategory(category) }}
            </span>
        </div>
    </div>
</template>
