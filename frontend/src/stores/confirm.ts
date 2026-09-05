import { defineStore } from 'pinia';
import { ref } from 'vue';

interface ConfirmDialog {
    id: number;
    title: string;
    message: string;
    confirmText: string;
    cancelText: string;
    closeOnOverlay: boolean;
    resolve: (value: boolean) => void;
}

interface ConfirmOptions {
    title?: string;
    message: string;
    confirmText?: string;
    cancelText?: string;
    closeOnOverlay?: boolean;
}

export const useConfirmStore = defineStore('confirm', () => {
    const confirmDialogs = ref<ConfirmDialog[]>([]);

    function showConfirm(options: ConfirmOptions): Promise<boolean> {
        return new Promise((resolve) => {
            const id = Date.now() + Math.random();
            confirmDialogs.value.push({
                id,
                title: options.title || '',
                message: options.message,
                confirmText: options.confirmText || 'Confirm',
                cancelText: options.cancelText || 'Cancel',
                closeOnOverlay: options.closeOnOverlay !== false,
                resolve,
            });
        });
    }

    function confirmDialog(dialog: ConfirmDialog, confirmed: boolean): void {
        const index = confirmDialogs.value.findIndex((d) => d.id === dialog.id);
        if (index !== -1) {
            confirmDialogs.value.splice(index, 1);
            dialog.resolve(confirmed);
        }
    }

    return { confirmDialogs, showConfirm, confirmDialog };
});
