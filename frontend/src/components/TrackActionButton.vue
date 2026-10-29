<script setup lang="ts">
import { computed } from 'vue';
import { Check, LoaderCircle, Pencil, RefreshCw, Upload, X } from 'lucide-vue-next';
const props = withDefaults(defineProps<{
  action: 'edit' | 'save' | 'cancel' | 'upload' | 'refresh';
  label?: string;
  loading?: boolean;
  disabled?: boolean;
  type?: 'button' | 'submit' | 'reset';
}>(), {loading:false, disabled:false, type:'button'});
const icon = computed(() => props.loading ? LoaderCircle : ({edit:Pencil,save:Check,cancel:X,upload:Upload,refresh:RefreshCw})[props.action]);
</script>
<template>
  <button :type="type" :disabled="disabled || loading" :aria-label="label" :title="action === 'edit' || action === 'refresh' ? label : undefined" :aria-busy="loading || undefined" :class="[action === 'save' || action === 'upload' ? 'ui-primary' : 'ui-secondary', {'track-action-icon':action === 'edit' || action === 'refresh'}]" class="track-action-button">
    <component :is="icon" aria-hidden="true" class="track-action-glyph" :class="{'track-action-loading':loading}" />
    <span v-if="action !== 'edit' && action !== 'refresh'"><slot>{{ label }}</slot></span>
  </button>
</template>
<style scoped>
.track-action-button {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  flex-shrink: 0;
  min-block-size: 36px;
  padding-block: 6px;
  padding-inline: 12px;
  border-radius: 6px;
  font-size: 0.8125rem;
  line-height: 1.5;
}
.track-action-button::after {
  content: "";
  position: absolute;
  inset: min(0px, (100% - 44px) / 2);
}
.track-action-icon {
  inline-size: 28px;
  min-block-size: 28px;
  padding: 0;
  border-color: transparent;
  background: transparent;
  color: var(--color-muted);
}
@media (hover: hover) and (pointer: fine) {
  .track-action-icon:hover:not(:disabled) {
    background: var(--color-soft);
    color: var(--color-action);
  }
}
.track-action-glyph { inline-size:1.15em; block-size:1.15em; flex-shrink:0; }
@media (prefers-reduced-motion: no-preference) {
  .track-action-loading { animation: track-action-spin 1s linear infinite; }
}
@keyframes track-action-spin { to { transform:rotate(360deg); } }
</style>
