import { useConfirmStore } from '../stores/confirm';
import { storeToRefs } from 'pinia';

export function useConfirm() {
    const store = useConfirmStore();
    const { confirmDialogs } = storeToRefs(store);
    const showConfirm = store.showConfirm.bind(store);

    return {
        confirmDialogs,
        showConfirm,
        confirm: showConfirm, // alias for AccountView.vue:451,659,722
        confirmDialog: store.confirmDialog.bind(store),
    };
}
