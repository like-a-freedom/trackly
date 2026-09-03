import { describe, it, expect, beforeEach } from 'vitest';
import { mount } from '@vue/test-utils';
import ElevationPanel from '../ElevationPanel.vue';

vi.mock('../../ElevationChart.vue', () => ({
    default: {
        name: 'ElevationChart',
        template: '<div class="elevation-chart-mock">Chart</div>',
        props: ['elevationData', 'heartRateData', 'trackName', 'chartMode'],
        emits: ['chartPointHover', 'chartPointLeave', 'chartPointClick'],
    },
}));

describe('ElevationPanel', () => {
    let props;

    beforeEach(() => {
        props = {
            track: {
                id: 't1',
                name: 'Test Track',
                elevation_profile: [100, 200, 300],
                elevation_gain: 200,
                elevation_loss: 100,
                elevation_min: 100,
                elevation_max: 300,
                elevation_enriched: true,
            },
            isOwner: false,
            coordinateData: [],
            parsedTimeData: [],
            chartMode: 'elevation',
            chartUpdateKey: 0,
            distanceUnit: 'km',
            isPollingForElevation: false,
            enrichingElevation: false,
        };
    });

    it('renders nothing when no elevation or heart rate data', () => {
        const wrapper = mount(ElevationPanel, {
            props: {
                ...props,
                track: { id: 't1', elevation_profile: [], elevation_gain: 0, hr_data: [] },
            },
        });
        expect(wrapper.find('.stats-section').exists()).toBe(false);
    });

    it('renders elevation chart when elevation data exists', () => {
        const wrapper = mount(ElevationPanel, { props });
        expect(wrapper.find('.stats-section').exists()).toBe(true);
        expect(wrapper.find('.chart-section').exists()).toBe(true);
    });

    it('renders heart rate data when available', () => {
        const wrapper = mount(ElevationPanel, {
            props: {
                ...props,
                track: { ...props.track, hr_data: [60, 70, 80] },
            },
        });
        expect(wrapper.find('.stats-section').exists()).toBe(true);
    });

    it('shows force enrich button for owner', () => {
        const wrapper = mount(ElevationPanel, {
            props: { ...props, isOwner: true },
        });
        expect(wrapper.find('.force-update-btn').exists()).toBe(true);
    });

    it('hides force enrich button for non-owner', () => {
        const wrapper = mount(ElevationPanel, { props });
        expect(wrapper.find('.force-update-btn').exists()).toBe(false);
    });

    it('shows stop polling button when polling', () => {
        const wrapper = mount(ElevationPanel, {
            props: { ...props, isPollingForElevation: true },
        });
        expect(wrapper.find('.stop-polling-btn-header').exists()).toBe(true);
    });

    it('emits force-enrich-elevation event', async () => {
        const wrapper = mount(ElevationPanel, {
            props: { ...props, isOwner: true },
        });
        await wrapper.find('.force-update-btn').trigger('click');
        expect(wrapper.emitted('force-enrich-elevation')).toBeTruthy();
    });

    it('emits stop-elevation-polling event', async () => {
        const wrapper = mount(ElevationPanel, {
            props: { ...props, isPollingForElevation: true },
        });
        await wrapper.find('.stop-polling-btn-header').trigger('click');
        expect(wrapper.emitted('stop-elevation-polling')).toBeTruthy();
    });

    it('emits chart-mode-change event', async () => {
        const wrapper = mount(ElevationPanel, { props });
        const pulseButton = wrapper.find('.chart-toggle:nth-child(2)');
        if (pulseButton.exists()) {
            await pulseButton.trigger('click');
            expect(wrapper.emitted('chart-mode-change')).toBeTruthy();
        }
    });

    it('renders elevation statistics', () => {
        const wrapper = mount(ElevationPanel, { props });
        expect(wrapper.text()).toContain('Total ascent');
        expect(wrapper.text()).toContain('Total descent');
        expect(wrapper.text()).toContain('Minimum elevation');
        expect(wrapper.text()).toContain('Maximum elevation');
    });

    it('shows chart toggles when data available', () => {
        const wrapper = mount(ElevationPanel, { props });
        expect(wrapper.find('.chart-toggles').exists()).toBe(true);
    });
});
