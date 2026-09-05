// @ts-nocheck - Test mocks don't need full type fidelity
import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import TrackEditorTopBar from '../editor/TrackEditorTopBar.vue';

describe('TrackEditorTopBar', () => {
    it('renders track context live metrics and save action', async () => {
        const wrapper = mount(TrackEditorTopBar, {
            props: {
                trackName: 'Morning Ride',
                totalPoints: 24,
                totalDistanceKm: 12.34,
                estimatedTimeMinutes: 78,
                manualRoutingPercent: 15,
                canSave: true,
                saving: false,
                savedTrackId: 'track-123',
            },
        });

        expect(wrapper.find('[data-testid="top-bar-track-name"]').text()).toContain('Morning Ride');
        expect(wrapper.find('[data-testid="top-bar-distance"]').text()).toContain('12.34 km');
        expect(wrapper.find('[data-testid="top-bar-time"]').text()).toContain('1 h 18 min');
        expect(wrapper.find('[data-testid="top-bar-points"]').text()).toContain('24');
        expect(wrapper.find('[data-testid="top-bar-manual-warning"]').text()).toContain('15%');
        expect(wrapper.find('[data-testid="top-bar-save"]').attributes('disabled')).toBeUndefined();
        expect(wrapper.find('[data-testid="top-bar-saved-badge"]').exists()).toBe(true);

        const overflowToggle = wrapper.find('[data-testid="top-bar-overflow-toggle"]');
        expect(overflowToggle.attributes('aria-expanded')).toBe('false');

        await overflowToggle.trigger('click');

        expect(wrapper.find('[data-testid="top-bar-overflow-menu"]').exists()).toBe(true);
        expect(wrapper.find('[data-testid="top-bar-routing-toggle"]').exists()).toBe(true);
        expect(wrapper.find('[data-testid="top-bar-snap-mode"]').exists()).toBe(true);
        expect(wrapper.find('[data-testid="top-bar-routing-profile"]').exists()).toBe(true);
        expect(wrapper.find('[data-testid="top-bar-distance-markers"]').exists()).toBe(true);
        expect(wrapper.find('[data-testid="top-bar-export-kml"]').exists()).toBe(true);

        await wrapper.find('[data-testid="top-bar-distance-markers"]').trigger('click');
        await wrapper.find('[data-testid="top-bar-export-kml"]').trigger('click');
        await wrapper.find('[data-testid="top-bar-save"]').trigger('click');

        expect(wrapper.emitted('toggleDistanceMarkers')).toHaveLength(1);
        expect(wrapper.emitted('export')).toEqual([['kml']]);
        expect(wrapper.emitted('save')).toHaveLength(1);
    });

    it('shows retry controls when graph error exists and auto routing is enabled', async () => {
        const wrapper = mount(TrackEditorTopBar, {
            props: {
                routingMode: 'auto',
                graphError: 'Failed to load graph',
                totalPoints: 2,
            },
        });

        expect(wrapper.find('[data-testid="top-bar-status"]').exists()).toBe(true);
        expect(wrapper.find('[data-testid="top-bar-reload-graph"]').exists()).toBe(true);
        expect(wrapper.find('[data-testid="top-bar-switch-to-manual"]').exists()).toBe(true);

        await wrapper.find('[data-testid="top-bar-reload-graph"]').trigger('click');
        await wrapper.find('[data-testid="top-bar-switch-to-manual"]').trigger('click');

        expect(wrapper.emitted('reloadGraph')).toHaveLength(1);
        expect(wrapper.emitted('switchToManual')).toHaveLength(1);
    });
    it('does not show routing error status for an empty manual track', () => {
        const wrapper = mount(TrackEditorTopBar, {
            props: {
                trackName: '',
                totalPoints: 0,
                totalDistanceKm: 0,
                estimatedTimeMinutes: 0,
                routingMode: 'manual',
                graphError: 'Route unavailable',
            },
        });

        expect(wrapper.text()).not.toContain('Route unavailable');
        expect(wrapper.find('.top-bar-status').exists()).toBe(false);
    });
});
