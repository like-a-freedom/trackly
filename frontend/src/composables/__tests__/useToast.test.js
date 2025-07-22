import { describe, it, expect, beforeEach } from 'vitest';
import { useToast } from '../useToast';

describe('useToast', () => {
    let toast, showToast;

    beforeEach(() => {
        const result = useToast();
        toast = result.toast;
        showToast = result.showToast;
    });

    describe('Initial state', () => {
        it('returns toast reactive object and showToast function', () => {
            expect(typeof showToast).toBe('function');
            expect(toast.value).toBeDefined();
        });

        it('initializes with empty message and default values', () => {
            expect(toast.value.message).toBe('');
            expect(toast.value.type).toBe('info');
            expect(toast.value.duration).toBe(3000);
        });
    });

    describe('showToast function', () => {
        it('sets toast message with default type and duration', () => {
            showToast('Test message');

            expect(toast.value.message).toBe('Test message');
            expect(toast.value.type).toBe('info');
            expect(toast.value.duration).toBe(3000);
        });

        it('sets toast message with custom type', () => {
            showToast('Success message', 'success');

            expect(toast.value.message).toBe('Success message');
            expect(toast.value.type).toBe('success');
            expect(toast.value.duration).toBe(3000);
        });

        it('sets toast message with custom duration', () => {
            showToast('Warning message', 'warning', 5000);

            expect(toast.value.message).toBe('Warning message');
            expect(toast.value.type).toBe('warning');
            expect(toast.value.duration).toBe(5000);
        });

        it('overwrites previous toast message', () => {
            showToast('First message', 'info');
            expect(toast.value.message).toBe('First message');
            expect(toast.value.type).toBe('info');

            showToast('Second message', 'error', 2000);
            expect(toast.value.message).toBe('Second message');
            expect(toast.value.type).toBe('error');
            expect(toast.value.duration).toBe(2000);
        });
    });

    describe('Multiple instances', () => {
        it('creates independent toast instances', () => {
            const toast1 = useToast();
            const toast2 = useToast();

            toast1.showToast('First toast', 'info');
            toast2.showToast('Second toast', 'error');

            expect(toast1.toast.value.message).toBe('First toast');
            expect(toast1.toast.value.type).toBe('info');
            expect(toast2.toast.value.message).toBe('Second toast');
            expect(toast2.toast.value.type).toBe('error');
        });
    });
});
