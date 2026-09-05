<template>
  <teleport to="body">
    <ConfirmDialog
      v-for="dialog in confirmDialogs"
      :key="dialog.id"
      :ref="el => setDialogRef(dialog.id, el)"
      :title="dialog.title"
      :message="dialog.message"
      :confirm-text="dialog.confirmText"
      :cancel-text="dialog.cancelText"
      :close-on-overlay="dialog.closeOnOverlay"
      @confirm="() => confirmDialog(dialog, true)"
      @cancel="() => confirmDialog(dialog, false)"
    />
  </teleport>
</template>

<script setup lang="ts">
import { onUnmounted } from 'vue';
import ConfirmDialog from './ConfirmDialog.vue';
import { useConfirm } from '../composables/useConfirm';
import type { ComponentPublicInstance } from 'vue';

const { confirmDialogs, confirmDialog } = useConfirm();
const dialogRefs = new Map<number, ComponentPublicInstance<{ show: () => void; hide: () => void }>>();

function setDialogRef(id: number, el: unknown): void {
  const dialogEl = el as ComponentPublicInstance<{ show: () => void; hide: () => void }> | null;
  if (dialogEl) {
    dialogRefs.set(id, dialogEl);
    // Show the dialog when the ref is set
    dialogEl.show();
  } else {
    dialogRefs.delete(id);
  }
}

onUnmounted(() => {
  dialogRefs.clear();
});
</script>
