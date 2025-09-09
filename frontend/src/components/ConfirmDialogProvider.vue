<template>
  <teleport to="body">
    <ConfirmDialog
      v-for="dialog in confirmDialogs"
      :key="dialog.id"
      :title="dialog.title"
      :message="dialog.message"
      :confirm-text="dialog.confirmText"
      :cancel-text="dialog.cancelText"
      :close-on-overlay="dialog.closeOnOverlay"
      :ref="el => setDialogRef(dialog.id, el)"
      @confirm="() => confirmDialog(dialog, true)"
      @cancel="() => confirmDialog(dialog, false)"
    />
  </teleport>
</template>

<script setup>
import { onMounted, onUnmounted } from 'vue';
import ConfirmDialog from './ConfirmDialog.vue';
import { useConfirm } from '../composables/useConfirm.js';

const { confirmDialogs, confirmDialog } = useConfirm();
const dialogRefs = new Map();

function setDialogRef(id, el) {
  if (el) {
    dialogRefs.set(id, el);
    // Show the dialog when the ref is set
    el.show();
  } else {
    dialogRefs.delete(id);
  }
}

onUnmounted(() => {
  dialogRefs.clear();
});
</script>
