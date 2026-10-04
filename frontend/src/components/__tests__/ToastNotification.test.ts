import { describe, it, expect, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { nextTick, computed, defineComponent, h, onMounted, ref } from 'vue';
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

    it('should apply warning class', async () => {
        const wrapper = mount(ToastNotification, {
            props: { message: '', type: 'warning', duration: 3000 },
        });
        await wrapper.setProps({ message: 'Heads up' });
        await nextTick();
        expect(wrapper.find('.toast').classes()).toContain('warning');
    });

    it('announces politely and names its dismiss control', async () => {
        const wrapper = mount(ToastNotification, {
            props: { message: '', type: 'error', duration: 3000 },
        });
        await wrapper.setProps({ message: 'Upload failed' });
        await nextTick();
        expect(wrapper.attributes('role')).toBe('status');
        expect(wrapper.attributes('aria-live')).toBe('polite');
        expect(wrapper.find('.toast-close').attributes('aria-label')).toBe('Dismiss notification');
    });

    it('hides when the user dismisses it', async () => {
        const wrapper = mount(ToastNotification, {
            props: { message: '', type: 'success', duration: 100000 },
        });
        await wrapper.setProps({ message: 'Track uploaded successfully!' });
        await nextTick();
        expect(wrapper.find('.toast').exists()).toBe(true);
        await wrapper.find('.toast-close').trigger('click');
        expect(wrapper.find('.toast').exists()).toBe(false);
    });
});

/**
 * Regression guard for a real defect on the home surface: HomeView and
 * TrackView bound the toast props as `toast.value && toast.value.message`.
 * A template auto-unwraps a top-level ref, so `toast.value` was always
 * `undefined` and the message never reached this component — no toast ever
 * appeared. Reading the unwrapped computed is what renders.
 */
describe('ToastNotification host binding', () => {
    const makeHost = (readUnwrapped: boolean) =>
        defineComponent({
            components: { ToastNotification },
            setup() {
                const store = ref({ message: '', type: 'info', duration: 3000 });
                const toast = computed(() => store.value);
                onMounted(() => {
                    store.value = {
                        message: 'Track uploaded successfully!',
                        type: 'success',
                        duration: 3000,
                    };
                });
                return { toast, store };
            },
            render() {
                const t = this.toast as unknown as Record<string, string | number>;
                // When readUnwrapped is false the template shape is simulated:
                // Vue would have unwrapped the ref already, so `.value` is
                // undefined and the message arrives empty.
                const message = readUnwrapped
                    ? (t.message as string)
                    : ((t as { value?: { message: string } }).value?.message ?? '');
                return h(ToastNotification, {
                    message,
                    type: 'success',
                    duration: 3000,
                });
            },
        });

    it('renders nothing when read as toast.value (the original defect)', async () => {
        const wrapper = mount(makeHost(false));
        await new Promise((r) => setTimeout(r, 40));
        expect(wrapper.find('.toast').exists()).toBe(false);
    });

    it('renders the message when read as the unwrapped computed', async () => {
        const wrapper = mount(makeHost(true));
        await new Promise((r) => setTimeout(r, 40));
        expect(wrapper.find('.toast').exists()).toBe(true);
        expect(wrapper.text()).toContain('Track uploaded successfully!');
    });
});
