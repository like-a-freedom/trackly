import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { nextTick } from 'vue';
import GeolocationButton from '../GeolocationButton.vue';

describe('GeolocationButton.vue', () => {
    let mockGeolocation;

    beforeEach(() => {
        // Mock navigator.geolocation
        mockGeolocation = {
            getCurrentPosition: vi.fn()
        };

        Object.defineProperty(global.navigator, 'geolocation', {
            value: mockGeolocation,
            writable: true,
            configurable: true
        });
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    describe('Rendering', () => {
        it('should render geolocation button', () => {
            const wrapper = mount(GeolocationButton);

            expect(wrapper.find('.geolocation-button').exists()).toBe(true);
        });

        it('should show location icon by default', () => {
            const wrapper = mount(GeolocationButton);

            const icons = wrapper.findAll('.geolocation-icon');
            expect(icons).toHaveLength(1);
            expect(icons[0].classes()).not.toContain('spinning');
        });

        it('should show spinning icon while getting location', async () => {
            mockGeolocation.getCurrentPosition.mockImplementation(() => {
                // Don't resolve immediately
            });

            const wrapper = mount(GeolocationButton);

            const button = wrapper.find('.geolocation-button');
            await button.trigger('click');
            await nextTick();

            const spinningIcon = wrapper.find('.spinning');
            expect(spinningIcon.exists()).toBe(true);
        });

        it('should have correct title when idle', () => {
            const wrapper = mount(GeolocationButton);

            const button = wrapper.find('.geolocation-button');
            expect(button.attributes('title')).toBe(
                'Center map on current location'
            );
        });

        it('should have correct title when getting location', async () => {
            mockGeolocation.getCurrentPosition.mockImplementation(() => {
                // Don't resolve
            });

            const wrapper = mount(GeolocationButton);

            await wrapper.find('.geolocation-button').trigger('click');
            await nextTick();

            const button = wrapper.find('.geolocation-button');
            expect(button.attributes('title')).toBe('Getting location...');
        });

        it('should be disabled while getting location', async () => {
            mockGeolocation.getCurrentPosition.mockImplementation(() => {
                // Don't resolve
            });

            const wrapper = mount(GeolocationButton);

            const button = wrapper.find('.geolocation-button');
            expect(button.attributes('disabled')).toBeUndefined();

            await button.trigger('click');
            await nextTick();

            expect(button.attributes('disabled')).toBeDefined();
        });
    });

    describe('Geolocation success', () => {
        it('should emit location-found with coordinates on success', async () => {
            const mockPosition = {
                coords: {
                    latitude: 59.9139,
                    longitude: 10.7522
                }
            };

            mockGeolocation.getCurrentPosition.mockImplementation(
                (success) => {
                    success(mockPosition);
                }
            );

            const wrapper = mount(GeolocationButton);

            await wrapper.find('.geolocation-button').trigger('click');
            await nextTick();

            expect(wrapper.emitted('location-found')).toBeTruthy();
            expect(wrapper.emitted('location-found')[0]).toEqual([
                {
                    latitude: 59.9139,
                    longitude: 10.7522
                }
            ]);
        });

        it('should re-enable button after successful location', async () => {
            const mockPosition = {
                coords: {
                    latitude: 59.9139,
                    longitude: 10.7522
                }
            };

            mockGeolocation.getCurrentPosition.mockImplementation(
                (success) => {
                    success(mockPosition);
                }
            );

            const wrapper = mount(GeolocationButton);

            await wrapper.find('.geolocation-button').trigger('click');
            await nextTick();

            const button = wrapper.find('.geolocation-button');
            expect(button.attributes('disabled')).toBeUndefined();
        });

        it('should request high accuracy location', async () => {
            mockGeolocation.getCurrentPosition.mockImplementation(
                (success) => {
                    success({
                        coords: { latitude: 0, longitude: 0 }
                    });
                }
            );

            const wrapper = mount(GeolocationButton);

            await wrapper.find('.geolocation-button').trigger('click');
            await nextTick();

            expect(mockGeolocation.getCurrentPosition).toHaveBeenCalledWith(
                expect.any(Function),
                expect.any(Function),
                expect.objectContaining({
                    enableHighAccuracy: true
                })
            );
        });

        it('should use appropriate timeout', async () => {
            mockGeolocation.getCurrentPosition.mockImplementation(
                (success) => {
                    success({
                        coords: { latitude: 0, longitude: 0 }
                    });
                }
            );

            const wrapper = mount(GeolocationButton);

            await wrapper.find('.geolocation-button').trigger('click');
            await nextTick();

            expect(mockGeolocation.getCurrentPosition).toHaveBeenCalledWith(
                expect.any(Function),
                expect.any(Function),
                expect.objectContaining({
                    timeout: 10000
                })
            );
        });

        it('should use maximum age for caching', async () => {
            mockGeolocation.getCurrentPosition.mockImplementation(
                (success) => {
                    success({
                        coords: { latitude: 0, longitude: 0 }
                    });
                }
            );

            const wrapper = mount(GeolocationButton);

            await wrapper.find('.geolocation-button').trigger('click');
            await nextTick();

            expect(mockGeolocation.getCurrentPosition).toHaveBeenCalledWith(
                expect.any(Function),
                expect.any(Function),
                expect.objectContaining({
                    maximumAge: 60000
                })
            );
        });
    });

    describe('Geolocation errors', () => {
        it('should emit error when geolocation is not supported', async () => {
            // Remove geolocation support
            Object.defineProperty(global.navigator, 'geolocation', {
                value: undefined,
                writable: true,
                configurable: true
            });

            const wrapper = mount(GeolocationButton);

            await wrapper.find('.geolocation-button').trigger('click');
            await nextTick();

            expect(wrapper.emitted('location-found')).toBeTruthy();
            expect(wrapper.emitted('location-found')[0]).toEqual([
                {
                    error: 'Geolocation is not supported by this browser'
                }
            ]);
        });

        it('should handle PERMISSION_DENIED error', async () => {
            const error = {
                code: 1, // PERMISSION_DENIED
                PERMISSION_DENIED: 1
            };

            mockGeolocation.getCurrentPosition.mockImplementation(
                (success, failure) => {
                    failure(error);
                }
            );

            const wrapper = mount(GeolocationButton);

            await wrapper.find('.geolocation-button').trigger('click');
            await nextTick();

            expect(wrapper.emitted('location-found')).toBeTruthy();
            expect(wrapper.emitted('location-found')[0]).toEqual([
                {
                    error: 'Location access denied by user'
                }
            ]);
        });

        it('should handle POSITION_UNAVAILABLE error', async () => {
            const error = {
                code: 2, // POSITION_UNAVAILABLE
                POSITION_UNAVAILABLE: 2
            };

            mockGeolocation.getCurrentPosition.mockImplementation(
                (success, failure) => {
                    failure(error);
                }
            );

            const wrapper = mount(GeolocationButton);

            await wrapper.find('.geolocation-button').trigger('click');
            await nextTick();

            expect(wrapper.emitted('location-found')).toBeTruthy();
            expect(wrapper.emitted('location-found')[0]).toEqual([
                {
                    error: 'Location information is unavailable'
                }
            ]);
        });

        it('should handle TIMEOUT error', async () => {
            const error = {
                code: 3, // TIMEOUT
                TIMEOUT: 3
            };

            mockGeolocation.getCurrentPosition.mockImplementation(
                (success, failure) => {
                    failure(error);
                }
            );

            const wrapper = mount(GeolocationButton);

            await wrapper.find('.geolocation-button').trigger('click');
            await nextTick();

            expect(wrapper.emitted('location-found')).toBeTruthy();
            expect(wrapper.emitted('location-found')[0]).toEqual([
                {
                    error: 'Location request timed out'
                }
            ]);
        });

        it('should handle unknown error', async () => {
            const error = {
                code: 999, // Unknown error code
                message: 'Unknown error'
            };

            mockGeolocation.getCurrentPosition.mockImplementation(
                (success, failure) => {
                    failure(error);
                }
            );

            const wrapper = mount(GeolocationButton);

            await wrapper.find('.geolocation-button').trigger('click');
            await nextTick();

            expect(wrapper.emitted('location-found')).toBeTruthy();
            expect(wrapper.emitted('location-found')[0]).toEqual([
                {
                    error: 'An unknown error occurred while getting location'
                }
            ]);
        });

        it('should re-enable button after error', async () => {
            const error = {
                code: 1,
                PERMISSION_DENIED: 1
            };

            mockGeolocation.getCurrentPosition.mockImplementation(
                (success, failure) => {
                    failure(error);
                }
            );

            const wrapper = mount(GeolocationButton);

            await wrapper.find('.geolocation-button').trigger('click');
            await nextTick();

            const button = wrapper.find('.geolocation-button');
            expect(button.attributes('disabled')).toBeUndefined();
        });
    });

    describe('User interactions', () => {
        it('should call getCurrentPosition when button clicked', async () => {
            mockGeolocation.getCurrentPosition.mockImplementation(
                (success) => {
                    success({
                        coords: { latitude: 0, longitude: 0 }
                    });
                }
            );

            const wrapper = mount(GeolocationButton);

            await wrapper.find('.geolocation-button').trigger('click');

            expect(mockGeolocation.getCurrentPosition).toHaveBeenCalled();
        });

        it('should not trigger if button is disabled', async () => {
            // Create a scenario where button gets disabled
            mockGeolocation.getCurrentPosition.mockImplementation(() => {
                // Don't resolve immediately
            });

            const wrapper = mount(GeolocationButton);

            await wrapper.find('.geolocation-button').trigger('click');
            await nextTick();

            // Try to click again while disabled
            const clickCount = mockGeolocation.getCurrentPosition.mock.calls.length;

            await wrapper.find('.geolocation-button').trigger('click');

            // Should still be the same count
            expect(mockGeolocation.getCurrentPosition.mock.calls.length).toBe(
                clickCount
            );
        });

        it('should handle multiple successful requests', async () => {
            mockGeolocation.getCurrentPosition.mockImplementation(
                (success) => {
                    success({
                        coords: { latitude: 59.9139, longitude: 10.7522 }
                    });
                }
            );

            const wrapper = mount(GeolocationButton);

            // First request
            await wrapper.find('.geolocation-button').trigger('click');
            await nextTick();

            expect(wrapper.emitted('location-found')).toHaveLength(1);

            // Second request
            await wrapper.find('.geolocation-button').trigger('click');
            await nextTick();

            expect(wrapper.emitted('location-found')).toHaveLength(2);
        });
    });

    describe('Edge cases', () => {
        it('should handle coordinates at 0,0', async () => {
            mockGeolocation.getCurrentPosition.mockImplementation(
                (success) => {
                    success({
                        coords: { latitude: 0, longitude: 0 }
                    });
                }
            );

            const wrapper = mount(GeolocationButton);

            await wrapper.find('.geolocation-button').trigger('click');
            await nextTick();

            expect(wrapper.emitted('location-found')[0]).toEqual([
                { latitude: 0, longitude: 0 }
            ]);
        });

        it('should handle negative coordinates', async () => {
            mockGeolocation.getCurrentPosition.mockImplementation(
                (success) => {
                    success({
                        coords: { latitude: -33.8688, longitude: -151.2093 }
                    });
                }
            );

            const wrapper = mount(GeolocationButton);

            await wrapper.find('.geolocation-button').trigger('click');
            await nextTick();

            expect(wrapper.emitted('location-found')[0]).toEqual([
                { latitude: -33.8688, longitude: -151.2093 }
            ]);
        });

        it('should handle extreme coordinates', async () => {
            mockGeolocation.getCurrentPosition.mockImplementation(
                (success) => {
                    success({
                        coords: { latitude: 90, longitude: 180 }
                    });
                }
            );

            const wrapper = mount(GeolocationButton);

            await wrapper.find('.geolocation-button').trigger('click');
            await nextTick();

            expect(wrapper.emitted('location-found')[0]).toEqual([
                { latitude: 90, longitude: 180 }
            ]);
        });
    });
});
