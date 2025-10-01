import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { nextTick } from 'vue';
import ConfirmDialog from '../ConfirmDialog.vue';
import ConfirmDialogProvider from '../ConfirmDialogProvider.vue';
import { useConfirm } from '../../composables/useConfirm';

describe('ConfirmDialog.vue', () => {
    describe('Rendering', () => {
        it('should render dialog when visible', async () => {
            const wrapper = mount(ConfirmDialog, {
                props: {
                    message: 'Test message'
                }
            });

            // Initially hidden
            expect(wrapper.find('.dialog-overlay').exists()).toBe(false);

            // Show dialog
            wrapper.vm.show();
            await nextTick();

            expect(wrapper.find('.dialog-overlay').exists()).toBe(true);
            expect(wrapper.find('.dialog-message').text()).toBe('Test message');
        });

        it('should render title when provided', async () => {
            const wrapper = mount(ConfirmDialog, {
                props: {
                    title: 'Test Title',
                    message: 'Test message'
                }
            });

            wrapper.vm.show();
            await nextTick();

            expect(wrapper.find('.dialog-title').exists()).toBe(true);
            expect(wrapper.find('.dialog-title').text()).toBe('Test Title');
        });

        it('should not render title when not provided', async () => {
            const wrapper = mount(ConfirmDialog, {
                props: {
                    message: 'Test message'
                }
            });

            wrapper.vm.show();
            await nextTick();

            expect(wrapper.find('.dialog-title').exists()).toBe(false);
        });

        it('should render custom button texts', async () => {
            const wrapper = mount(ConfirmDialog, {
                props: {
                    message: 'Test message',
                    confirmText: 'Yes',
                    cancelText: 'No'
                }
            });

            wrapper.vm.show();
            await nextTick();

            const buttons = wrapper.findAll('.dialog-btn');
            expect(buttons[0].text()).toBe('No');
            expect(buttons[1].text()).toBe('Yes');
        });

        it('should use default button texts', async () => {
            const wrapper = mount(ConfirmDialog, {
                props: {
                    message: 'Test message'
                }
            });

            wrapper.vm.show();
            await nextTick();

            const buttons = wrapper.findAll('.dialog-btn');
            expect(buttons[0].text()).toBe('Cancel');
            expect(buttons[1].text()).toBe('Confirm');
        });
    });

    describe('User interactions', () => {
        it('should emit confirm event when confirm button clicked', async () => {
            const wrapper = mount(ConfirmDialog, {
                props: {
                    message: 'Test message'
                }
            });

            wrapper.vm.show();
            await nextTick();

            const confirmBtn = wrapper.find('.dialog-btn-confirm');
            await confirmBtn.trigger('click');

            expect(wrapper.emitted()).toHaveProperty('confirm');
            expect(wrapper.emitted('confirm')).toHaveLength(1);
        });

        it('should emit cancel event when cancel button clicked', async () => {
            const wrapper = mount(ConfirmDialog, {
                props: {
                    message: 'Test message'
                }
            });

            wrapper.vm.show();
            await nextTick();

            const cancelBtn = wrapper.find('.dialog-btn-cancel');
            await cancelBtn.trigger('click');

            expect(wrapper.emitted()).toHaveProperty('cancel');
            expect(wrapper.emitted('cancel')).toHaveLength(1);
        });

        it('should hide dialog after confirm', async () => {
            const wrapper = mount(ConfirmDialog, {
                props: {
                    message: 'Test message'
                }
            });

            wrapper.vm.show();
            await nextTick();

            expect(wrapper.find('.dialog-overlay').exists()).toBe(true);

            const confirmBtn = wrapper.find('.dialog-btn-confirm');
            await confirmBtn.trigger('click');
            await nextTick();

            expect(wrapper.find('.dialog-overlay').exists()).toBe(false);
        });

        it('should hide dialog after cancel', async () => {
            const wrapper = mount(ConfirmDialog, {
                props: {
                    message: 'Test message'
                }
            });

            wrapper.vm.show();
            await nextTick();

            const cancelBtn = wrapper.find('.dialog-btn-cancel');
            await cancelBtn.trigger('click');
            await nextTick();

            expect(wrapper.find('.dialog-overlay').exists()).toBe(false);
        });

        it('should close on overlay click by default', async () => {
            const wrapper = mount(ConfirmDialog, {
                props: {
                    message: 'Test message'
                }
            });

            wrapper.vm.show();
            await nextTick();

            const overlay = wrapper.find('.dialog-overlay');
            await overlay.trigger('click');

            expect(wrapper.emitted()).toHaveProperty('cancel');
            expect(wrapper.find('.dialog-overlay').exists()).toBe(false);
        });

        it('should not close on overlay click when closeOnOverlay is false', async () => {
            const wrapper = mount(ConfirmDialog, {
                props: {
                    message: 'Test message',
                    closeOnOverlay: false
                }
            });

            wrapper.vm.show();
            await nextTick();

            const overlay = wrapper.find('.dialog-overlay');
            await overlay.trigger('click');

            expect(wrapper.emitted()).not.toHaveProperty('cancel');
            expect(wrapper.find('.dialog-overlay').exists()).toBe(true);
        });

        it('should not close when clicking inside dialog', async () => {
            const wrapper = mount(ConfirmDialog, {
                props: {
                    message: 'Test message'
                }
            });

            wrapper.vm.show();
            await nextTick();

            const dialog = wrapper.find('.dialog');
            await dialog.trigger('click');

            // Should not emit cancel
            expect(wrapper.emitted('cancel')).toBeUndefined();
            // Should still be visible
            expect(wrapper.find('.dialog-overlay').exists()).toBe(true);
        });
    });

    describe('Public API', () => {
        it('should expose show method', () => {
            const wrapper = mount(ConfirmDialog, {
                props: {
                    message: 'Test message'
                }
            });

            expect(wrapper.vm.show).toBeDefined();
            expect(typeof wrapper.vm.show).toBe('function');
        });

        it('should expose hide method', () => {
            const wrapper = mount(ConfirmDialog, {
                props: {
                    message: 'Test message'
                }
            });

            expect(wrapper.vm.hide).toBeDefined();
            expect(typeof wrapper.vm.hide).toBe('function');
        });

        it('show() should make dialog visible', async () => {
            const wrapper = mount(ConfirmDialog, {
                props: {
                    message: 'Test message'
                }
            });

            expect(wrapper.find('.dialog-overlay').exists()).toBe(false);

            wrapper.vm.show();
            await nextTick();

            expect(wrapper.find('.dialog-overlay').exists()).toBe(true);
        });

        it('hide() should make dialog invisible', async () => {
            const wrapper = mount(ConfirmDialog, {
                props: {
                    message: 'Test message'
                }
            });

            wrapper.vm.show();
            await nextTick();

            expect(wrapper.find('.dialog-overlay').exists()).toBe(true);

            wrapper.vm.hide();
            await nextTick();

            expect(wrapper.find('.dialog-overlay').exists()).toBe(false);
        });
    });

    describe('Edge cases', () => {
        it('should handle empty message', async () => {
            const wrapper = mount(ConfirmDialog, {
                props: {
                    message: ''
                }
            });

            wrapper.vm.show();
            await nextTick();

            expect(wrapper.find('.dialog-message').exists()).toBe(true);
            expect(wrapper.find('.dialog-message').text()).toBe('');
        });

        it('should handle long message', async () => {
            const longMessage = 'A'.repeat(1000);
            const wrapper = mount(ConfirmDialog, {
                props: {
                    message: longMessage
                }
            });

            wrapper.vm.show();
            await nextTick();

            expect(wrapper.find('.dialog-message').text()).toBe(longMessage);
        });

        it('should handle multiple show/hide cycles', async () => {
            const wrapper = mount(ConfirmDialog, {
                props: {
                    message: 'Test message'
                }
            });

            for (let i = 0; i < 5; i++) {
                wrapper.vm.show();
                await nextTick();
                expect(wrapper.find('.dialog-overlay').exists()).toBe(true);

                wrapper.vm.hide();
                await nextTick();
                expect(wrapper.find('.dialog-overlay').exists()).toBe(false);
            }
        });
    });
});

describe('useConfirm composable', () => {
    beforeEach(() => {
        // Clear any existing dialogs
        const { confirmDialogs } = useConfirm();
        confirmDialogs.value = [];
    });

    it('should create confirm dialog', async () => {
        const { showConfirm, confirmDialogs } = useConfirm();

        const promise = showConfirm({
            message: 'Test message'
        });

        await nextTick();

        expect(confirmDialogs.value).toHaveLength(1);
        expect(confirmDialogs.value[0].message).toBe('Test message');
    });

    it('should resolve with true when confirmed', async () => {
        const { showConfirm, confirmDialog, confirmDialogs } = useConfirm();

        const promise = showConfirm({
            message: 'Test message'
        });

        await nextTick();

        const dialog = confirmDialogs.value[0];
        confirmDialog(dialog, true);

        const result = await promise;
        expect(result).toBe(true);
    });

    it('should resolve with false when cancelled', async () => {
        const { showConfirm, confirmDialog, confirmDialogs } = useConfirm();

        const promise = showConfirm({
            message: 'Test message'
        });

        await nextTick();

        const dialog = confirmDialogs.value[0];
        confirmDialog(dialog, false);

        const result = await promise;
        expect(result).toBe(false);
    });

    it('should support custom options', async () => {
        const { showConfirm, confirmDialogs } = useConfirm();

        showConfirm({
            title: 'Custom Title',
            message: 'Custom Message',
            confirmText: 'Yes',
            cancelText: 'No',
            closeOnOverlay: false
        });

        await nextTick();

        const dialog = confirmDialogs.value[0];
        expect(dialog.title).toBe('Custom Title');
        expect(dialog.message).toBe('Custom Message');
        expect(dialog.confirmText).toBe('Yes');
        expect(dialog.cancelText).toBe('No');
        expect(dialog.closeOnOverlay).toBe(false);
    });

    it('should handle multiple dialogs', async () => {
        const { showConfirm, confirmDialogs } = useConfirm();

        showConfirm({ message: 'Dialog 1' });
        showConfirm({ message: 'Dialog 2' });
        showConfirm({ message: 'Dialog 3' });

        await nextTick();

        expect(confirmDialogs.value).toHaveLength(3);
    });

    it('should remove dialog after confirmation', async () => {
        const { showConfirm, confirmDialog, confirmDialogs } = useConfirm();

        showConfirm({ message: 'Dialog 1' });
        showConfirm({ message: 'Dialog 2' });

        await nextTick();
        expect(confirmDialogs.value).toHaveLength(2);

        const firstDialog = confirmDialogs.value[0];
        confirmDialog(firstDialog, true);

        await nextTick();
        expect(confirmDialogs.value).toHaveLength(1);
        expect(confirmDialogs.value[0].message).toBe('Dialog 2');
    });

    it('should use default values for optional options', async () => {
        const { showConfirm, confirmDialogs } = useConfirm();

        showConfirm({ message: 'Test' });

        await nextTick();

        const dialog = confirmDialogs.value[0];
        expect(dialog.title).toBe('');
        expect(dialog.confirmText).toBe('Confirm');
        expect(dialog.cancelText).toBe('Cancel');
        expect(dialog.closeOnOverlay).toBe(true);
    });

    it('should generate unique IDs for dialogs', async () => {
        const { showConfirm, confirmDialogs } = useConfirm();

        showConfirm({ message: 'Dialog 1' });
        showConfirm({ message: 'Dialog 2' });

        await nextTick();

        const id1 = confirmDialogs.value[0].id;
        const id2 = confirmDialogs.value[1].id;

        expect(id1).not.toBe(id2);
    });
});

describe('ConfirmDialogProvider.vue', () => {
    it('should render ConfirmDialog components for each dialog', async () => {
        const wrapper = mount(ConfirmDialogProvider);
        const { confirmDialogs } = useConfirm();

        // Clear any existing dialogs first
        confirmDialogs.value = [];
        await nextTick();

        // Create two dialogs
        confirmDialogs.value.push(
            { id: 1, show: true, title: 'Dialog 1', message: 'Message 1', onConfirm: vi.fn(), onCancel: vi.fn() },
            { id: 2, show: true, title: 'Dialog 2', message: 'Message 2', onConfirm: vi.fn(), onCancel: vi.fn() }
        );

        await nextTick();

        // Should have 2 ConfirmDialog components
        const dialogs = wrapper.findAllComponents(ConfirmDialog);
        expect(dialogs.length).toBe(2);
    });

    it('should pass props to ConfirmDialog components', async () => {
        const wrapper = mount(ConfirmDialogProvider, {
            global: {
                stubs: {
                    teleport: true
                }
            }
        });

        const { showConfirm, confirmDialogs } = useConfirm();

        // Clear any existing dialogs first
        confirmDialogs.value = [];
        await nextTick();

        showConfirm({
            title: 'Test Title',
            message: 'Test Message',
            confirmText: 'Yes',
            cancelText: 'No'
        });

        await nextTick();
        await flushPromises();

        const dialog = wrapper.findComponent(ConfirmDialog);
        expect(dialog.props('title')).toBe('Test Title');
        expect(dialog.props('message')).toBe('Test Message');
        expect(dialog.props('confirmText')).toBe('Yes');
        expect(dialog.props('cancelText')).toBe('No');
    });

    it('should handle dialog confirmation', async () => {
        const wrapper = mount(ConfirmDialogProvider, {
            global: {
                stubs: {
                    teleport: true
                }
            }
        });

        const { showConfirm } = useConfirm();

        // Clear any existing dialogs first
        confirmDialogs.value = [];
        await nextTick();

        const promise = showConfirm({ message: 'Test' });

        await nextTick();
        await flushPromises();

        expect(confirmDialogs.value).toHaveLength(1);

        const dialog = wrapper.findComponent(ConfirmDialog);
        dialog.vm.$emit('confirm');

        await nextTick();

        const result = await promise;
        expect(result).toBe(true);
        expect(confirmDialogs.value).toHaveLength(0);
    });

    it('should handle dialog cancellation', async () => {
        const wrapper = mount(ConfirmDialogProvider, {
            global: {
                stubs: {
                    teleport: true
                }
            }
        });

        const { showConfirm } = useConfirm();

        // Clear any existing dialogs first
        confirmDialogs.value = [];
        await nextTick();

        const promise = showConfirm({ message: 'Test' });

        await nextTick();
        await flushPromises();

        const dialog = wrapper.findComponent(ConfirmDialog);
        dialog.vm.$emit('cancel');

        await nextTick();

        const result = await promise;
        expect(result).toBe(false);
        expect(confirmDialogs.value).toHaveLength(0);
    });
});
