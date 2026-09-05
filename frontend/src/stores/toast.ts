import { defineStore } from 'pinia';
import { ref } from 'vue';

type ToastType = 'info' | 'success' | 'warning' | 'error';

export const useToastStore = defineStore('toast', () => {
    const message = ref<string>('');
    const type = ref<ToastType>('info');
    const duration = ref<number>(3000);

    function showToast(msg: string, toastType: ToastType = 'info', ms: number = 3000): void {
        message.value = msg;
        type.value = toastType;
        duration.value = ms;
    }

    return { message, type, duration, showToast };
});
