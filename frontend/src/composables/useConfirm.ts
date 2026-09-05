import { useConfirmStore } from '../stores/confirm';
import { storeToRefs } from 'pinia';
import type { Ref } from 'vue';

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

export function useConfirm() {
    const store = useConfirmStore();
    const { confirmDialogs } = storeToRefs(store);
    const showConfirm = store.showConfirm.bind(store);

    return {
        confirmDialogs: confirmDialogs as Ref<ConfirmDialog[]>,
        showConfirm: showConfirm as (options: ConfirmOptions) => Promise<boolean>,
        confirm: showConfirm as (options: ConfirmOptions) => Promise<boolean>, // alias for AccountView.vue:451,659,722
        confirmDialog: store.confirmDialog.bind(store),
    };
}
