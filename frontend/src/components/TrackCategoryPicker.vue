<script setup lang="ts">
import { ref, useId } from 'vue';
import { TRACK_CATEGORIES, validateCategories } from '../domain/trackCategories';

const props = withDefaults(defineProps<{ modelValue: string[]; disabled?: boolean; readonly?: boolean; required?: boolean; compact?: boolean }>(), { disabled: false, readonly: false, required: false, compact: true });
const emit = defineEmits<{ 'update:modelValue': [categories: string[]] }>();
const error = ref('');
const helpId = useId();
const handleToggle = (value: string) => {
    if (props.disabled || props.readonly) return;
    const next = props.modelValue.includes(value) ? props.modelValue.filter(category => category !== value) : [...props.modelValue, value];
    error.value = validateCategories(next) ?? '';
    if (!error.value) emit('update:modelValue', next);
};
</script>

<template>
  <fieldset class="m-0 min-w-0 border-0 p-0 text-ink" :disabled="disabled" :aria-describedby="readonly ? undefined : helpId">
    <legend class="mbe-2 w-full p-0 font-semibold"><span class="flex min-h-8 items-center gap-2"><span>Categories</span><slot name="heading-action" /></span></legend>
    <template v-if="readonly">
      <div class="categories flex flex-wrap gap-2">
        <span v-for="value in modelValue" :key="value" class="category-tag track-tag">{{ TRACK_CATEGORIES.find(option => option.value === value)?.label ?? value }}</span>
      </div>
    </template>
    <template v-else>
      <div :class="compact ? 'flex flex-wrap gap-2' : 'grid grid-cols-2 gap-2'">
        <label v-for="option in TRACK_CATEGORIES" :key="option.value" class="category-option track-tag-option" :class="{ 'selected-category': modelValue.includes(option.value) }">
          <input type="checkbox" :value="option.value" :checked="modelValue.includes(option.value)" :data-testid="`category-input-${option.value}`" class="h-4 w-4 accent-action" @change="handleToggle(option.value)" />
          {{ option.label }}
        </label>
      </div>
      <p :id="helpId" class="mbe-0 mbs-2 text-sm text-muted">{{ required ? 'Select at least one category. You can choose more than one.' : 'Optional. Choose activities from the list.' }}</p>
      <p v-if="error" role="alert" class="mbe-0 mbs-2 text-sm text-danger">{{ error }}</p>
    </template>
  </fieldset>
</template>
