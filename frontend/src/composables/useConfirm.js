import { ref } from 'vue';

const confirmDialogs = ref([]);

export function useConfirm() {
    function showConfirm(options) {
        return new Promise((resolve) => {
            const dialog = {
                id: Date.now() + Math.random(),
                title: options.title || '',
                message: options.message,
                confirmText: options.confirmText || 'Confirm',
                cancelText: options.cancelText || 'Cancel',
                closeOnOverlay: options.closeOnOverlay !== false,
                resolve
            };

            confirmDialogs.value.push(dialog);
        });
    }

    function confirmDialog(dialog, confirmed) {
        const index = confirmDialogs.value.findIndex(d => d.id === dialog.id);
        if (index !== -1) {
            confirmDialogs.value.splice(index, 1);
            dialog.resolve(confirmed);
        }
    }

    return {
        confirmDialogs,
        showConfirm,
        confirmDialog
    };
}
