import { describe, it, expect, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { nextTick } from 'vue';
import ToastNotification from '../ToastNotification.vue';

describe('ToastNotification', () => {
    it('should not be visible when message is empty', async () => {
        const wrapper = mount(ToastNotification, {
            props: { message: '', type: 'info', duration: 3000 },
        });
        await nextTick();
        expect(wrapper.find('.toast').exists()).toBe(false);
    });

    it('should be visible when message is set after mount', async () => {
        const wrapper = mount(ToastNotification, {
            props: { message: '', type: 'info', duration: 3000 },
        });
        await nextTick();
        expect(wrapper.find('.toast').exists()).toBe(false);

        await wrapper.setProps({ message: 'Hello World' });
        await nextTick();
        expect(wrapper.find('.toast').exists()).toBe(true);
    });

    it('should display message text', async () => {
        const wrapper = mount(ToastNotification, {
            props: { message: '', type: 'info', duration: 3000 },
        });
        await wrapper.setProps({ message: 'Hello World' });
        await nextTick();
        expect(wrapper.text()).toContain('Hello World');
    });

    it('should apply success class', async () => {
        const wrapper = mount(ToastNotification, {
            props: { message: '', type: 'success', duration: 3000 },
        });
        await wrapper.setProps({ message: 'Success!' });
        await nextTick();
        expect(wrapper.find('.toast').classes()).toContain('success');
    });

    it('should apply error class', async () => {
        const wrapper = mount(ToastNotification, {
            props: { message: '', type: 'error', duration: 3000 },
        });
        await wrapper.setProps({ message: 'Error!' });
        await nextTick();
        expect(wrapper.find('.toast').classes()).toContain('error');
    });

    it('should apply info class by default', async () => {
        const wrapper = mount(ToastNotification, {
            props: { message: '', duration: 3000 },
        });
        await wrapper.setProps({ message: 'Info' });
        await nextTick();
        expect(wrapper.find('.toast').classes()).toContain('info');
    });

    it('should emit close event when close button clicked', async () => {
        const wrapper = mount(ToastNotification, {
            props: { message: '', type: 'info', duration: 3000 },
        });
        await wrapper.setProps({ message: 'Test' });
        await nextTick();
        await wrapper.find('.toast-close').trigger('click');
        expect(wrapper.emitted('close')).toBeTruthy();
    });

    it('should render close button', async () => {
        const wrapper = mount(ToastNotification, {
            props: { message: '', type: 'info', duration: 3000 },
        });
        await wrapper.setProps({ message: 'Test' });
        await nextTick();
        expect(wrapper.find('.toast-close').exists()).toBe(true);
    });

    it('should hide when message becomes empty', async () => {
        const wrapper = mount(ToastNotification, {
            props: { message: '', type: 'info', duration: 3000 },
        });
        await wrapper.setProps({ message: 'Test' });
        await nextTick();
        expect(wrapper.find('.toast').exists()).toBe(true);

        await wrapper.setProps({ message: '' });
        await nextTick();
        expect(wrapper.find('.toast').exists()).toBe(false);
    });

    it('should render toast element when visible', async () => {
        const wrapper = mount(ToastNotification, {
            props: { message: '', type: 'info', duration: 3000 },
        });
        await wrapper.setProps({ message: 'Test' });
        await nextTick();
        const toast = wrapper.find('.toast');
        expect(toast.exists()).toBe(true);
    });
});
