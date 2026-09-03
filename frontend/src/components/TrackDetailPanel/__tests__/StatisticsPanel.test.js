import { describe, it, expect, beforeEach } from 'vitest';
import { mount } from '@vue/test-utils';
import StatisticsPanel from '../StatisticsPanel.vue';

describe('StatisticsPanel', () => {
    let props;

    beforeEach(() => {
        props = {
            track: {
                id: 't1',
                name: 'Test Track',
                length_km: 10.5,
                duration_seconds: 3600,
                moving_avg_speed: 10.5,
                moving_avg_pace: 5.7,
                avg_hr: 150,
                hr_min: 120,
                hr_max: 180,
            },
            isOwner: false,
            speedUnit: 'kmh',
            formattedDistance: '10.50 km',
            formattedDuration: '1h 0m 0s',
            formattedMovingAvgSpeed: '10.50 km/h',
            formattedMovingAvgPace: '5:42 min/km',
            distanceMarkersEnabled: true,
        };
    });

    it('renders basic info section', () => {
        const wrapper = mount(StatisticsPanel, { props });
        expect(wrapper.find('.basic-info-grid').exists()).toBe(true);
        expect(wrapper.text()).toContain('Distance');
        expect(wrapper.text()).toContain('10.50 km');
    });

    it('renders duration when available', () => {
        const wrapper = mount(StatisticsPanel, { props });
        expect(wrapper.text()).toContain('Duration');
        expect(wrapper.text()).toContain('1h 0m 0s');
    });

    it('hides duration when not available', () => {
        props.track.duration_seconds = 0;
        const wrapper = mount(StatisticsPanel, { props });
        expect(wrapper.text()).not.toContain('Duration');
    });

    it('renders map overlays section', () => {
        const wrapper = mount(StatisticsPanel, { props });
        expect(wrapper.text()).toContain('Map overlays');
        expect(wrapper.text()).toContain('Distance markers');
    });

    it('emits speed-unit-change event', async () => {
        const wrapper = mount(StatisticsPanel, { props });
        const milesButton = wrapper.findAll('.unit-toggle').find(btn => btn.text() === 'miles');
        await milesButton.trigger('click');
        expect(wrapper.emitted('speed-unit-change')).toBeTruthy();
        expect(wrapper.emitted('speed-unit-change')[0]).toEqual(['mph']);
    });

    it('emits distance-markers-toggle event', async () => {
        props.isOwner = true;
        const wrapper = mount(StatisticsPanel, { props });
        const checkbox = wrapper.find('input[type="checkbox"]');
        await checkbox.trigger('change');
        expect(wrapper.emitted('distance-markers-toggle')).toBeTruthy();
    });

    it('disables checkbox for non-owner', () => {
        const wrapper = mount(StatisticsPanel, { props });
        const checkbox = wrapper.find('input[type="checkbox"]');
        expect(checkbox.element.disabled).toBe(true);
    });

    it('enables checkbox for owner', () => {
        props.isOwner = true;
        const wrapper = mount(StatisticsPanel, { props });
        const checkbox = wrapper.find('input[type="checkbox"]');
        expect(checkbox.element.disabled).toBe(false);
    });

    it('shows statistics when speed data available', () => {
        const wrapper = mount(StatisticsPanel, { props });
        expect(wrapper.text()).toContain('Statistics');
        expect(wrapper.text()).toContain('Average moving speed');
        expect(wrapper.text()).toContain('Average moving pace');
    });

    it('hides statistics when no speed data', () => {
        props.track.moving_avg_speed = undefined;
        props.track.moving_avg_pace = undefined;
        props.track.avg_hr = undefined;
        const wrapper = mount(StatisticsPanel, { props });
        expect(wrapper.text()).not.toContain('Statistics');
    });

    it('renders heart rate data when available', () => {
        const wrapper = mount(StatisticsPanel, { props });
        expect(wrapper.text()).toContain('Average HR');
        expect(wrapper.text()).toContain('150 bpm');
    });
});
