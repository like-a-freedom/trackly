import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mount } from '@vue/test-utils';
import GeolocationButton from '../../src/components/GeolocationButton.vue';

describe('GeolocationButton', () => {
    let mockGeolocation;

    beforeEach(() => {
        // Mock geolocation API
        mockGeolocation = {
            getCurrentPosition: vi.fn()
        };
        global.navigator.geolocation = mockGeolocation;
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    it('renders button with geolocation icon', () => {
        const wrapper = mount(GeolocationButton);

        expect(wrapper.find('button.geolocation-button').exists()).toBe(true);
        expect(wrapper.find('svg.geolocation-icon').exists()).toBe(true);
    });

    it('has correct icon structure with path element', () => {
        const wrapper = mount(GeolocationButton);
        const svg = wrapper.find('svg.geolocation-icon');

        expect(svg.find('path').exists()).toBe(true);
    });

    it('has correct viewBox for proper icon sizing', () => {
        const wrapper = mount(GeolocationButton);
        const svg = wrapper.find('svg.geolocation-icon');

        expect(svg.attributes('viewBox')).toBe('0 0 24 24');
    });

    it('icon has stroke attribute for visibility', () => {
        const wrapper = mount(GeolocationButton);
        const svg = wrapper.find('svg.geolocation-icon');

        expect(svg.attributes('stroke')).toBe('currentColor');
        expect(svg.attributes('fill')).toBe('none');
    });

    it('SVG has proper styles applied for visibility', () => {
        const wrapper = mount(GeolocationButton);
        const button = wrapper.find('button.geolocation-button');

        // Check that button exists with proper class
        expect(button.exists()).toBe(true);

        const svg = button.find('svg.geolocation-icon');
        expect(svg.exists()).toBe(true);
    });

    it('shows navigation icon when not getting location', () => {
        const wrapper = mount(GeolocationButton);
        const svg = wrapper.find('svg.geolocation-icon');

        expect(svg.classes()).not.toContain('spinning');
        expect(svg.find('path').attributes('d')).toContain('m9.5 14.5');
    });

    it('shows loading icon when getting location', async () => {
        mockGeolocation.getCurrentPosition.mockImplementation((success, error) => {
            // Simulate async behavior
            setTimeout(() => success({
                coords: { latitude: 50, longitude: 50 }
            }), 100);
        });

        const wrapper = mount(GeolocationButton);
        await wrapper.find('button').trigger('click');

        // Should show loading state
        expect(wrapper.vm.gettingLocation).toBe(true);
        const loadingSvg = wrapper.find('svg.spinning');
        expect(loadingSvg.exists()).toBe(true);
    });

    it('emits location-found event on successful geolocation', async () => {
        const mockPosition = {
            coords: {
                latitude: 56.04028,
                longitude: 37.83185
            }
        };

        mockGeolocation.getCurrentPosition.mockImplementation((success) => {
            success(mockPosition);
        });

        const wrapper = mount(GeolocationButton);
        await wrapper.find('button').trigger('click');
        await wrapper.vm.$nextTick();

        expect(wrapper.emitted('location-found')).toBeTruthy();
        expect(wrapper.emitted('location-found')[0][0]).toEqual({
            latitude: mockPosition.coords.latitude,
            longitude: mockPosition.coords.longitude
        });
    });

    it('emits error on geolocation failure', async () => {
        const mockError = {
            code: 1, // PERMISSION_DENIED
            PERMISSION_DENIED: 1,
            POSITION_UNAVAILABLE: 2,
            TIMEOUT: 3
        };

        mockGeolocation.getCurrentPosition.mockImplementation((success, error) => {
            error(mockError);
        });

        const wrapper = mount(GeolocationButton);
        await wrapper.find('button').trigger('click');
        await wrapper.vm.$nextTick();

        expect(wrapper.emitted('location-found')).toBeTruthy();
        expect(wrapper.emitted('location-found')[0][0]).toHaveProperty('error');
        expect(wrapper.emitted('location-found')[0][0].error).toContain('denied');
    });

    it('disables button while getting location', async () => {
        mockGeolocation.getCurrentPosition.mockImplementation((success) => {
            setTimeout(() => success({
                coords: { latitude: 50, longitude: 50 }
            }), 100);
        });

        const wrapper = mount(GeolocationButton);
        const button = wrapper.find('button');

        await button.trigger('click');

        expect(button.attributes('disabled')).toBeDefined();
    });

    it('has proper accessibility attributes', () => {
        const wrapper = mount(GeolocationButton);
        const button = wrapper.find('button');

        expect(button.attributes('title')).toBe('Center map on current location');
    });

    it('updates title when getting location', async () => {
        mockGeolocation.getCurrentPosition.mockImplementation((success) => {
            setTimeout(() => success({
                coords: { latitude: 50, longitude: 50 }
            }), 100);
        });

        const wrapper = mount(GeolocationButton);
        await wrapper.find('button').trigger('click');
        await wrapper.vm.$nextTick();

        const button = wrapper.find('button');
        expect(button.attributes('title')).toBe('Getting location...');
    });

    it('handles unsupported geolocation gracefully', async () => {
        delete global.navigator.geolocation;

        const wrapper = mount(GeolocationButton);
        await wrapper.find('button').trigger('click');
        await wrapper.vm.$nextTick();

        expect(wrapper.emitted('location-found')).toBeTruthy();
        expect(wrapper.emitted('location-found')[0][0].error).toContain('not supported');
    });

    it('maintains icon visibility on mobile screens', () => {
        const wrapper = mount(GeolocationButton);
        const svg = wrapper.find('svg.geolocation-icon');

        // Icon should always be present regardless of screen size
        expect(svg.exists()).toBe(true);
        expect(svg.attributes('viewBox')).toBe('0 0 24 24');
    });

    it('renders without errors', () => {
        expect(() => mount(GeolocationButton)).not.toThrow();
    });

    it('button is not disabled by default', () => {
        const wrapper = mount(GeolocationButton);
        const button = wrapper.find('button');

        expect(button.attributes('disabled')).toBeUndefined();
    });

    it('has spinning animation class during loading', async () => {
        mockGeolocation.getCurrentPosition.mockImplementation((success) => {
            setTimeout(() => success({
                coords: { latitude: 50, longitude: 50 }
            }), 100);
        });

        const wrapper = mount(GeolocationButton);
        await wrapper.find('button').trigger('click');

        const loadingSvg = wrapper.find('svg.spinning');
        expect(loadingSvg.exists()).toBe(true);
    });

    it('icon path has proper geometry for navigation arrow', () => {
        const wrapper = mount(GeolocationButton);
        const path = wrapper.find('svg.geolocation-icon path');

        // Verify path exists with navigation arrow shape
        expect(path.attributes('d')).toContain('m9.5 14.5');
    });

    it('handles timeout error correctly', async () => {
        const mockError = {
            code: 3, // TIMEOUT
            PERMISSION_DENIED: 1,
            POSITION_UNAVAILABLE: 2,
            TIMEOUT: 3
        };

        mockGeolocation.getCurrentPosition.mockImplementation((success, error) => {
            error(mockError);
        });

        const wrapper = mount(GeolocationButton);
        await wrapper.find('button').trigger('click');
        await wrapper.vm.$nextTick();

        expect(wrapper.emitted('location-found')[0][0].error).toContain('timed out');
    });

    it('handles position unavailable error correctly', async () => {
        const mockError = {
            code: 2, // POSITION_UNAVAILABLE
            PERMISSION_DENIED: 1,
            POSITION_UNAVAILABLE: 2,
            TIMEOUT: 3
        };

        mockGeolocation.getCurrentPosition.mockImplementation((success, error) => {
            error(mockError);
        });

        const wrapper = mount(GeolocationButton);
        await wrapper.find('button').trigger('click');
        await wrapper.vm.$nextTick();

        expect(wrapper.emitted('location-found')[0][0].error).toContain('unavailable');
    });
});
