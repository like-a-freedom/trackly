import { computed } from 'vue';
import { useToastStore } from '../stores/toast.js';

/**
 * Simple toast notification composable for global user feedback.
 * Usage: const { showToast, toast } = useToast();
 */
export function useToast() {
    const store = useToastStore();
    const toast = computed(() => ({
        message: store.message,
        type: store.type,
        duration: store.duration
    }));
    return { showToast: store.showToast.bind(store), toast };
}
