<template>
  <transition name="dialog-fade">
    <div v-if="visible" class="dialog-overlay" @click="onOverlayClick">
      <div class="dialog" @click.stop>
        <div class="dialog-content">
          <h3 v-if="title" class="dialog-title">{{ title }}</h3>
          <p class="dialog-message">{{ message }}</p>
        </div>
        <div class="dialog-actions">
          <button class="dialog-btn dialog-btn-cancel" @click="onCancel">
            {{ cancelText }}
          </button>
          <button class="dialog-btn dialog-btn-confirm" @click="onConfirm">
            {{ confirmText }}
            
          </button>
        </div>
      </div>
    </div>
  </transition>
</template>

<script setup>
import { ref } from 'vue';

const props = defineProps({
  title: { type: String, default: '' },
  message: { type: String, required: true },
  confirmText: { type: String, default: 'Confirm' },
  cancelText: { type: String, default: 'Cancel' },
  closeOnOverlay: { type: Boolean, default: true }
});

const emit = defineEmits(['confirm', 'cancel', 'close']);

const visible = ref(false);

function show() {
  visible.value = true;
}

function hide() {
  visible.value = false;
}

function onConfirm() {
  emit('confirm');
  hide();
}

function onCancel() {
  emit('cancel');
  hide();
}

function onOverlayClick() {
  if (props.closeOnOverlay) {
    onCancel();
  }
}

if (typeof defineExpose === 'function') {
  try {
    defineExpose({
      show,
      hide
    });
  } catch (e) {
    // no-op if defineExpose macro is not available at runtime
  }
}
</script>

<style scoped>
.dialog-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 4000;
  padding: 20px;
}

.dialog {
  background: #fff;
  border-radius: 12px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
  max-width: 450px;
  width: 100%;
  max-height: 90vh;
  overflow: hidden;
  animation: dialog-in 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

.dialog-content {
  padding: 24px 24px 20px 24px;
}

.dialog-title {
  margin: 0 0 12px 0;
  font-size: 1.2em;
  font-weight: 600;
  color: #1a1a1a;
}

.dialog-message {
  margin: 0;
  font-size: 0.95em;
  line-height: 1.5;
  color: #444;
}

.dialog-actions {
  padding: 16px 24px 24px 24px;
  display: flex;
  gap: 12px;
  justify-content: flex-end;
}

.dialog-btn {
  border: none;
  border-radius: 8px;
  padding: 10px 20px;
  font-size: 0.95em;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s ease;
  min-width: 80px;
}

.dialog-btn-cancel {
  background: #f5f5f5;
  color: #666;
  border: 2px solid #ddd;
}

.dialog-btn-cancel:hover {
  background: #eeeeee;
  border-color: #bbb;
  color: #444;
}

.dialog-btn-confirm {
  background: #dc2626;
  color: #fff;
  box-shadow: 0 2px 8px rgba(220, 38, 38, 0.3);
}

.dialog-btn-confirm:hover {
  background: #b91c1c;
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(220, 38, 38, 0.4);
}

.dialog-btn:active {
  transform: scale(0.98);
}

.dialog-fade-enter-active,
.dialog-fade-leave-active {
  transition: opacity 0.3s ease;
}

.dialog-fade-enter-from,
.dialog-fade-leave-to {
  opacity: 0;
}

@keyframes dialog-in {
  from {
    opacity: 0;
    transform: scale(0.95) translateY(-20px);
  }
  to {
    opacity: 1;
    transform: scale(1) translateY(0);
  }
}

/* Mobile responsiveness */
@media (max-width: 500px) {
  .dialog {
    margin: 20px;
    max-width: calc(100vw - 40px);
  }
  
  .dialog-content {
    padding: 20px 20px 16px 20px;
  }
  
  .dialog-actions {
    padding: 12px 20px 20px 20px;
    flex-direction: column-reverse;
  }
  
  .dialog-btn {
    width: 100%;
  }
}
</style>
