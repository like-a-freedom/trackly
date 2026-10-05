<script setup lang="ts">
import { computed, ref, useId } from 'vue';
import { TRACK_CATEGORIES, validateCategories } from '../domain/trackCategories';

const props = withDefaults(defineProps<{ modelValue: string[]; disabled?: boolean; readonly?: boolean }>(), { disabled: false, readonly: false });
const emit = defineEmits<{ 'update:modelValue': [categories: string[]] }>();
const custom = ref('');
const error = ref('');
const helpId = useId();
const customValues = computed(() => props.modelValue.filter(value => !TRACK_CATEGORIES.some(option => option.value === value)));
const handleToggle = (value: string) => {
    if (props.disabled) return;
    const next = props.modelValue.includes(value) ? props.modelValue.filter(category => category !== value) : [...props.modelValue, value];
    error.value = validateCategories(next) ?? '';
    if (!error.value) emit('update:modelValue', next);
};
const handleAdd = () => {
    const value = custom.value.trim().normalize('NFC');
    if (!value || props.disabled) return;
    if (props.modelValue.includes(value)) { custom.value = ''; return; }
    const next = [...props.modelValue, value];
    error.value = validateCategories(next) ?? '';
    if (error.value) return;
    emit('update:modelValue', next);
    custom.value = '';
};
</script>

<template>
  <fieldset class="m-0 min-w-0 border-0 p-0 text-ink" :disabled="disabled" :aria-describedby="readonly ? undefined : helpId">
    <legend class="mb-2 p-0 font-semibold">Categories</legend>
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
      <div v-if="customValues.length" class="mt-2 flex flex-wrap gap-2">
        <button v-for="value in customValues" :key="value" type="button" class="min-h-11 max-w-full break-words rounded border border-line bg-canvas px-3 text-sm" :aria-label="`Remove category ${value}`" @click="handleToggle(value)">{{ value }} ×</button>
      </div>
      <div class="mt-3 flex gap-2">
        <input v-model="custom" type="text" aria-label="Custom category" placeholder="Custom category" class="min-h-11 min-w-0 flex-1 rounded border border-line bg-surface px-3 text-base" :aria-invalid="!!error" :aria-describedby="helpId" @keydown.enter.prevent="handleAdd" />
        <button type="button" data-testid="add-category" class="min-h-11 rounded border border-line bg-surface px-3 text-sm font-semibold" :disabled="disabled || !custom.trim()" @click="handleAdd">Add</button>
      </div>
      <p :id="helpId" class="mb-0 mt-2 text-sm text-muted">Optional. Up to 50 categories; 100 UTF-8 bytes each.</p>
      <p v-if="error" role="alert" class="mb-0 mt-2 text-sm text-danger">{{ error }}</p>
    </template>
  </fieldset>
</template>
