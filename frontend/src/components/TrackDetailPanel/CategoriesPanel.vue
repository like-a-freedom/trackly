<script setup lang="ts">
import { computed, nextTick, ref, shallowRef, watch } from "vue";
import TrackActionButton from "../TrackActionButton.vue";
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
const editing = ref(false);
const categoryRegion = ref<HTMLElement | null>(null);
const editButton = ref<InstanceType<typeof TrackActionButton> | null>(null);
const handleEdit = async () => {
  editing.value = true;
  await nextTick();
  categoryRegion.value?.querySelector<HTMLInputElement>('input[type="checkbox"]')?.focus();
};
const restoreEditFocus = async () => { await nextTick(); editButton.value?.$el.focus(); };
const handleCancel = () => { selection.value = [...(props.track.categories ?? [])]; error.value = null; editing.value = false; void restoreEditFocus(); };
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
    editing.value = false;
    void restoreEditFocus();
  } catch (cause) {
    error.value = toApiError(cause, {method:'PATCH',path:'/api/tracks/:id/categories'});
  } finally { saving.value = false; }
};
</script>

<template>
  <section v-if="isOwner || track.categories?.length" ref="categoryRegion" class="stats-section" aria-label="Track categories">
    <div class="flex min-w-0 flex-col gap-4">
      <div class="min-w-0">
        <TrackCategoryPicker v-model="selection" compact class="track-category-select-inline" :readonly="!editing" :disabled="saving">
          <template #heading-action>
            <TrackActionButton v-if="isOwner && !editing" ref="editButton" action="edit" label="Edit categories" @click="handleEdit" />
          </template>
        </TrackCategoryPicker>
        <p v-if="!editing && !selection.length" class="m-0 text-sm text-muted">No categories selected.</p>
      </div>
      <div v-if="editing" class="flex flex-wrap items-center gap-3">
        <TrackActionButton action="save" :loading="saving" data-testid="save-categories" :disabled="saving || !changed" @click="handleSave">{{ saving ? "Saving categories…" : "Save categories" }}</TrackActionButton>
        <TrackActionButton action="cancel" :disabled="saving" @click="handleCancel">Cancel</TrackActionButton>
      </div>
      <ErrorNotice v-if="error" title="Categories were not saved" :error="error" />
    </div>
  </section>
</template>
