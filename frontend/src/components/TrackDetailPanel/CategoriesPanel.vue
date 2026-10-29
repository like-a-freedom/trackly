<script setup lang="ts">
import { computed, ref, shallowRef, watch } from "vue";
import TrackCategoryPicker from "../TrackCategoryPicker.vue";
import ErrorNotice from '../ErrorNotice.vue';
import { toApiError } from '../../errors/apiError';
const props = withDefaults(defineProps<{
  track: { categories?: string[] };
  isOwner?: boolean;
  categoriesList?: {value:string;label:string}[];
  saveCategories?: (categories: string[]) => Promise<void>;
}>(), {isOwner:false});
const emit = defineEmits<{ "categories-updated": [categories: string[]] }>();
const selection = ref<string[]>([]);
const saving = ref(false);
const error = shallowRef<ReturnType<typeof toApiError> | null>(null);
watch(() => props.track.categories, values => { if (!saving.value) selection.value = [...(values ?? [])]; }, {immediate:true});
const changed = computed(() => JSON.stringify(selection.value) !== JSON.stringify(props.track.categories ?? []));
const handleSave = async () => {
  if (saving.value || !changed.value) return;
  saving.value = true;
  error.value = null;
  const snapshot = [...selection.value];
  try {
    if (props.saveCategories) await props.saveCategories(snapshot);
    emit("categories-updated", snapshot);
  } catch (cause) {
    error.value = toApiError(cause, {method:'PATCH',path:'/api/tracks/:id/categories'});
  } finally { saving.value = false; }
};
</script>

<template>
  <section v-if="isOwner || track.categories?.length" class="stats-section">
    <div :class="{ 'categories-inline-edit': isOwner }">
      <TrackCategoryPicker v-model="selection" class="track-category-select-inline" :readonly="!isOwner" :disabled="saving" />
      <button v-if="isOwner" type="button" data-testid="save-categories" class="mbs-3 min-h-11 rounded bg-action px-4 text-sm font-semibold text-white disabled:opacity-50" :disabled="saving || !changed" @click="handleSave">{{ saving ? "Saving categories…" : "Save categories" }}</button>
      <ErrorNotice v-if="error" class="mbs-2" title="Categories were not saved" :error="error" />
    </div>
  </section>
</template>
