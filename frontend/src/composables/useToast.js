import { ref } from 'vue';
/**
 * Simple toast notification composable for global user feedback.
 * Usage: const { showToast, toast } = useToast();
 * In template: <Toast :message="toast.message" :type="toast.type" :duration="toast.duration" />
 */
export function useToast() {
    const toast = ref({ message: '', type: 'info', duration: 3000 });
    function showToast(message, type = 'info', duration = 3000) {
        toast.value = { message, type, duration };
    }
    return { showToast, toast };
}
