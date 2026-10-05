<script setup lang="ts">
import { computed, ref, watch } from "vue";
import TrackCategoryPicker from "../TrackCategoryPicker.vue";
const props = withDefaults(defineProps<{
  track: { categories?: string[] };
  isOwner?: boolean;
  categoriesList?: {value:string;label:string}[];
  saveCategories?: (categories: string[]) => Promise<void>;
}>(), {isOwner:false});
const emit = defineEmits<{ "categories-updated": [categories: string[]] }>();
const selection = ref<string[]>([]);
const saving = ref(false);
const error = ref("");
watch(() => props.track.categories, values => { if (!saving.value) selection.value = [...(values ?? [])]; }, {immediate:true});
const changed = computed(() => JSON.stringify(selection.value) !== JSON.stringify(props.track.categories ?? []));
const handleSave = async () => {
  if (saving.value || !changed.value) return;
  saving.value = true;
  error.value = "";
  const snapshot = [...selection.value];
  try {
    if (props.saveCategories) await props.saveCategories(snapshot);
    emit("categories-updated", snapshot);
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : "Could not save categories. Retry.";
  } finally { saving.value = false; }
};
</script>

<template>
  <section v-if="isOwner || track.categories?.length" class="stats-section">
    <div :class="{ 'categories-inline-edit': isOwner }">
      <TrackCategoryPicker v-model="selection" class="track-category-select-inline" :readonly="!isOwner" :disabled="saving" />
      <button v-if="isOwner" type="button" data-testid="save-categories" class="mt-3 min-h-11 rounded bg-action px-4 text-sm font-semibold text-white disabled:opacity-50" :disabled="saving || !changed" @click="handleSave">{{ saving ? "Saving categories…" : "Save categories" }}</button>
      <p v-if="error" role="alert" class="mt-2 text-sm text-danger">{{ error }}</p>
    </div>
  </section>
</template>
