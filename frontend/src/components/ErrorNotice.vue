<script setup lang="ts">
import { useId } from 'vue';
import { ChevronDown, CircleAlert } from 'lucide-vue-next';
import type { ApiError } from '../errors/apiError';

defineProps<{ title: string; error: ApiError }>();
const titleId = useId();
</script>

<template>
  <section role="alert" aria-atomic="true" :aria-labelledby="titleId" tabindex="-1" class="min-w-0 rounded border border-danger bg-surface p-3 text-sm text-ink [overflow-wrap:anywhere] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring">
    <div class="flex items-start gap-2">
      <CircleAlert aria-hidden="true" class="mt-0.5 h-5 w-5 shrink-0 text-danger" />
      <div class="min-w-0 flex-1">
        <p :id="titleId" class="m-0 font-semibold">{{ title }}</p>
        <p class="m-0 mbs-1">{{ error.message }}</p>
        <p class="m-0 mbs-2 text-muted">{{ error.action }}</p>
      </div>
    </div>
    <details v-if="error.status || error.reference" class="group mbs-2 border-bs border-line">
      <summary class="flex min-h-11 cursor-pointer items-center justify-between gap-2 text-muted hover:bg-canvas active:bg-canvas focus-visible:outline-2 focus-visible:outline-focus-ring">
        <span>Technical details</span>
        <ChevronDown aria-hidden="true" class="h-4 w-4 shrink-0 group-open:rotate-180" />
      </summary>
      <dl class="m-0 grid gap-2 text-xs">
        <div v-if="error.status"><dt class="font-semibold">Response</dt><dd class="m-0">HTTP {{ error.status }}</dd></div>
        <div><dt class="font-semibold">Request</dt><dd class="m-0">{{ error.method }} {{ error.path }}</dd></div>
        <div v-if="error.reference"><dt class="font-semibold">Error reference</dt><dd class="m-0 select-all">{{ error.reference }}</dd></div>
      </dl>
    </details>
  </section>
</template>
