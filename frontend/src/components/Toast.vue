<template>
  <transition name="toast-fade">
    <div v-if="internalVisible" class="toast" :class="type">
      <span>{{ message }}</span>
      <button class="toast-close" @click="close">&times;</button>
    </div>
  </transition>
</template>
<script setup>
import { ref, watch, onUnmounted } from 'vue';
const props = defineProps({
  message: { type: String, required: true },
  type: { type: String, default: 'info' },
  duration: { type: Number, default: 3000 }
});
const emit = defineEmits(['close']);
const internalVisible = ref(false);
let timer = null;
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
  font-size: 15px;
  z-index: 3000;
  display: flex;
  align-items: center;
  gap: 12px;
  border: 1px solid #e0e0e0;
  animation: toast-in 0.22s;
}
.toast.info { border-left: 4px solid #1976d2; }
.toast.success { border-left: 4px solid #43a047; }
.toast.error { border-left: 4px solid #c00; }
.toast-close {
  background: none;
  border: none;
  color: #888;
  font-size: 18px;
  cursor: pointer;
  margin-left: 8px;
}
.toast-fade-enter-active, .toast-fade-leave-active { transition: opacity 0.22s; }
.toast-fade-enter-from, .toast-fade-leave-to { opacity: 0; }
@keyframes toast-in { from { opacity: 0; transform: translateX(-50%) translateY(20px); } to { opacity: 1; transform: translateX(-50%) translateY(0); } }
</style>
