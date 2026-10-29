<script setup lang="ts">
import { ref, useId } from 'vue';
import { TRACK_CATEGORIES, validateCategories } from '../domain/trackCategories';

const props = withDefaults(defineProps<{ modelValue: string[]; disabled?: boolean; readonly?: boolean; required?: boolean }>(), { disabled: false, readonly: false, required: false });
const emit = defineEmits<{ 'update:modelValue': [categories: string[]] }>();
const error = ref('');
const helpId = useId();
const handleToggle = (value: string) => {
    if (props.disabled) return;
    const next = props.modelValue.includes(value) ? props.modelValue.filter(category => category !== value) : [...props.modelValue, value];
    error.value = validateCategories(next) ?? '';
    if (!error.value) emit('update:modelValue', next);
};
</script>

<template>
  <fieldset class="m-0 min-w-0 border-0 p-0 text-ink" :disabled="disabled" :aria-describedby="readonly ? undefined : helpId">
    <legend class="mbe-2 p-0 font-semibold">Categories</legend>
    <template v-if="readonly">
      <div class="categories flex flex-wrap gap-2">
        <span v-for="value in modelValue" :key="value" class="category-tag rounded border border-line bg-canvas px-2 py-1 text-sm">{{ TRACK_CATEGORIES.find(option => option.value === value)?.label ?? value }}</span>
      </div>
    </template>
    <template v-else>
      <div class="grid grid-cols-2 gap-2">
        <label v-for="option in TRACK_CATEGORIES" :key="option.value" class="flex min-h-11 cursor-pointer items-center gap-2 rounded border border-line bg-surface px-3 text-sm focus-within:outline-2 focus-within:outline-action" :class="{ 'font-semibold': modelValue.includes(option.value) }">
          <input type="checkbox" :value="option.value" :checked="modelValue.includes(option.value)" :data-testid="`category-input-${option.value}`" class="h-4 w-4 accent-action" @change="handleToggle(option.value)" />
          {{ option.label }}
        </label>
      </div>
      <p :id="helpId" class="mbe-0 mbs-2 text-sm text-muted">{{ required ? 'Select at least one category. You can choose more than one.' : 'Optional. Choose activities from the list.' }}</p>
      <p v-if="error" role="alert" class="mbe-0 mbs-2 text-sm text-danger">{{ error }}</p>
    </template>
  </fieldset>
</template>
