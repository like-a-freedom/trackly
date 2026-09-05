// @ts-nocheck - Test mocks don't need full type fidelity
import { describe, it, expect, beforeEach } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { useToastStore } from '../toast';

describe('useToastStore', () => {
    beforeEach(() => {
        setActivePinia(createPinia());
    });

    it('initializes with empty state', () => {
        const store = useToastStore();
        expect(store.message).toBe('');
        expect(store.type).toBe('info');
        expect(store.duration).toBe(3000);
    });

    it('shows toast with message', () => {
        const store = useToastStore();
        store.showToast('Test message');
        expect(store.message).toBe('Test message');
        expect(store.type).toBe('info');
    });

    it('shows toast with custom type', () => {
        const store = useToastStore();
        store.showToast('Error message', 'error');
        expect(store.message).toBe('Error message');
        expect(store.type).toBe('error');
    });

    it('shows toast with custom duration', () => {
        const store = useToastStore();
        store.showToast('Success!', 'success', 5000);
        expect(store.message).toBe('Success!');
        expect(store.type).toBe('success');
        expect(store.duration).toBe(5000);
    });

    it('updates message on subsequent calls', () => {
        const store = useToastStore();
        store.showToast('First message');
        store.showToast('Second message');
        expect(store.message).toBe('Second message');
    });
});
