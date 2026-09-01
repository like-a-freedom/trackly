import { defineStore } from 'pinia';

export const useToastStore = defineStore('toast', {
    state: () => ({
        message: '',
        type: 'info',
        duration: 3000
    }),

    actions: {
        showToast(message, type = 'info', duration = 3000) {
            this.message = message;
            this.type = type;
            this.duration = duration;
        }
    }
});
