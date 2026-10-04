<template>
  <transition name="toast-fade">
    <div
      v-if="internalVisible"
      class="toast"
      :class="type"
      role="status"
      aria-live="polite"
    >
      <span>{{ message }}</span>
      <button
        class="toast-close"
        type="button"
        aria-label="Dismiss notification"
        @click="close"
      >
        &times;
      </button>
    </div>
  </transition>
</template>
<script setup lang="ts">
import { ref, watch, onUnmounted } from 'vue';

interface Props {
  message: string;
  type?: string;
  duration?: number;
}

const props = withDefaults(defineProps<Props>(), {
  type: 'info',
  duration: 3000
});

const emit = defineEmits<{
  close: [];
}>();
const internalVisible = ref(false);
let timer: ReturnType<typeof setTimeout> | null = null;
function close() {
  internalVisible.value = false;
  emit('close');
}
watch(() => props.message, (msg) => {
  if (msg) {
    internalVisible.value = true;
    if (timer) clearTimeout(timer);
    if (props.duration > 0) {
      timer = setTimeout(close, props.duration);
    }
  } else {
    internalVisible.value = false;
    if (timer) clearTimeout(timer);
  }
});
onUnmounted(() => { if (timer) clearTimeout(timer); });
</script>
<style scoped>
.toast {
  position: fixed;
  bottom: 32px;
  left: 50%;
  transform: translateX(-50%);
  min-width: 180px;
  max-width: 90vw;
  background: #fff;
  color: #222;
  border-radius: 8px;
  box-shadow: 0 2px 12px rgba(0,0,0,0.18);
  padding: 12px 24px 12px 16px;
  font-size: var(--text-sm);
  line-height: var(--leading-snug);
  z-index: 3000;
  display: flex;
  align-items: center;
  gap: 12px;
  border: 1px solid #e0e0e0;
  animation: toast-in 0.22s;
}
.toast.info { border-left: 4px solid var(--accent); }
.toast.success { border-left: 4px solid var(--success); }
.toast.warning { border-left: 4px solid var(--warning); }
.toast.error { border-left: 4px solid var(--danger); }
.toast-close {
  background: none;
  border: none;
  color: #888;
  font-size: 18px;
  line-height: 1;
  cursor: pointer;
  margin-left: 8px;
  padding: 2px;
  border-radius: 4px;
}
.toast-close:hover {
  color: #333;
  background: rgba(0, 0, 0, 0.06);
}
.toast-fade-enter-active, .toast-fade-leave-active { transition: opacity 0.22s; }
.toast-fade-enter-from, .toast-fade-leave-to { opacity: 0; }
@keyframes toast-in { from { opacity: 0; transform: translateX(-50%) translateY(20px); } to { opacity: 1; transform: translateX(-50%) translateY(0); } }
</style>
