// @ts-nocheck - Test mocks don't need full type fidelity
import { describe, it, expect, beforeEach } from 'vitest';
import { mount } from '@vue/test-utils';
import StatisticsPanel from '../StatisticsPanel.vue';

describe('StatisticsPanel', () => {
    let props: {
        track: {
            id: string;
            name: string;
            length_km: number;
            duration_seconds: number;
            moving_avg_speed: number;
            moving_avg_pace: number;
            avg_hr: number;
            hr_min: number;
            hr_max: number;
        };
        isOwner: boolean;
        speedUnit: string;
        formattedDistance: string;
        formattedDuration: string;
        formattedMovingAvgSpeed: string;
        formattedMovingAvgPace: string;
        distanceMarkersEnabled: boolean;
    };

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

    it('explains when duration was not recorded', () => {
        props.track.duration_seconds = 0;
        props.formattedDuration = 'N/A';
        const wrapper = mount(StatisticsPanel, { props });
        expect(wrapper.text()).toContain('Not recorded');
    });

    it('renders map overlays section', () => {
        const wrapper = mount(StatisticsPanel, { props });
        expect(wrapper.text()).toContain('Map display');
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

    it('allows every viewer to change their personal display', () => {
        const wrapper = mount(StatisticsPanel, { props });
        const checkbox = wrapper.find('input[type="checkbox"]');
        expect(checkbox.element.disabled).toBe(false);
    });

    it('enables checkbox for owner', () => {
        props.isOwner = true;
        const wrapper = mount(StatisticsPanel, { props });
        const checkbox = wrapper.find('input[type="checkbox"]');
        expect(checkbox.element.disabled).toBe(false);
    });

    it('exposes an accessible switch with the saved state', () => {
        const wrapper = mount(StatisticsPanel, { props: {...props, isOwner:true} });
        expect(wrapper.find('input[role="switch"]').element.checked).toBe(true);
        expect(wrapper.text()).toContain('Only in this browser');
    });

    it('dismisses the hint with Escape without bubbling to the track panel', async () => {
        const wrapper = mount(StatisticsPanel, { props });
        const hint = wrapper.get('button[aria-label="About distance markers"]');
        await hint.trigger('focus');
        expect(hint.attributes('aria-expanded')).toBe('true');
        const event = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true });
        const bubbled = vi.fn();
        wrapper.element.addEventListener('keydown', bubbled);
        hint.element.dispatchEvent(event);
        await wrapper.vm.$nextTick();
        expect(hint.attributes('aria-expanded')).toBe('false');
        expect(bubbled).not.toHaveBeenCalled();
    });

    it('explains when the preference only lasts for this visit', () => {
        const wrapper = mount(StatisticsPanel, { props: {...props, preferencePersisted:false} });
        expect(wrapper.text()).toContain('For this visit');
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
