import { defineStore } from 'pinia';

export const useConfirmStore = defineStore('confirm', {
    state: () => ({
        confirmDialogs: [],
    }),
    actions: {
        showConfirm(options) {
            return new Promise((resolve) => {
                const id = Date.now() + Math.random();
                this.confirmDialogs.push({
                    id,
                    title: options.title || '',
                    message: options.message,
                    confirmText: options.confirmText || 'Confirm',
                    cancelText: options.cancelText || 'Cancel',
                    closeOnOverlay: options.closeOnOverlay !== false,
                    resolve,
                });
            });
        },
        confirmDialog(dialog, confirmed) {
            const index = this.confirmDialogs.findIndex((d) => d.id === dialog.id);
            if (index !== -1) {
                this.confirmDialogs.splice(index, 1);
                dialog.resolve(confirmed);
            }
        },
    },
});
