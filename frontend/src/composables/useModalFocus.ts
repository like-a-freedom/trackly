import { nextTick, onBeforeUnmount, watch, type Ref } from 'vue';
import { useModalIsolation } from './useModalIsolation';

export function useModalFocus(open: Ref<boolean>, element: Ref<HTMLElement | null>, close: () => void): void {
    useModalIsolation(open, element);
    let previousFocus: HTMLElement | null = null;
    let previousOverflow = '';
    const focusable = () => Array.from(element.value?.querySelectorAll<HTMLElement>('button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex="0"]') ?? []);
    const handleKeydown = (event: KeyboardEvent) => {
        if (!open.value) return;
        if (event.key === 'Escape') { event.preventDefault(); close(); return; }
        if (event.key !== 'Tab') return;
        const items = focusable();
        const first = items[0];
        const last = items.at(-1);
        if (!first) { event.preventDefault(); element.value?.focus(); return; }
        if (event.shiftKey && (document.activeElement === first || document.activeElement === element.value)) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    const handleFocus = (event: FocusEvent) => {
        if (open.value && !element.value?.contains(event.target as Node)) (focusable()[0] ?? element.value)?.focus();
    };
    const release = () => {
        document.removeEventListener('keydown', handleKeydown);
        document.removeEventListener('focusin', handleFocus);
        document.body.style.overflow = previousOverflow;
        previousFocus?.focus();
    };
    watch(open, async active => {
        if (!active) { release(); return; }
        previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
        previousOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        await nextTick();
        if (!open.value) return;
        (focusable()[0] ?? element.value)?.focus();
        document.addEventListener('keydown', handleKeydown);
        document.addEventListener('focusin', handleFocus);
    });
    onBeforeUnmount(() => { if (open.value) release(); });
}
