import { nextTick, onBeforeUnmount, watch, type Ref } from 'vue';

/** Isolate siblings along the dialog's ancestor path without hiding the dialog. */
export function useModalIsolation(open: Ref<boolean>, dialog: Ref<HTMLElement | null>): void {
    const isolated: HTMLElement[] = [];
    let disposed = false;
    const release = () => {
        isolated.splice(0).forEach(element => element.removeAttribute('inert'));
    };
    watch(open, async active => {
        release();
        if (!active) return;
        await nextTick();
        if (!open.value || disposed) return;
        let current: HTMLElement | null = dialog.value;
        while (current?.parentElement) {
            const parent: HTMLElement = current.parentElement;
            for (const sibling of Array.from(parent.children)) {
                if (sibling !== current && sibling instanceof HTMLElement && !sibling.hasAttribute('inert')) {
                    sibling.setAttribute('inert', '');
                    isolated.push(sibling);
                }
            }
            if (parent === document.body) break;
            current = parent;
        }
    }, { immediate: true, flush: 'sync' });
    onBeforeUnmount(() => { disposed = true; release(); });
}
