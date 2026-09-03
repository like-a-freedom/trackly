import { describe, it, expect, beforeEach } from 'vitest';
import { mount } from '@vue/test-utils';
import TrackInfoPanel from '../TrackInfoPanel.vue';

describe('TrackInfoPanel', () => {
    let props;

    beforeEach(() => {
        props = {
            track: {
                id: 't1',
                recorded_at: '2024-01-01T08:00:00Z',
                created_at: '2024-01-01T10:00:00Z',
                updated_at: '2024-01-01T12:00:00Z',
            },
        };
    });

    it('renders track info section', () => {
        const wrapper = mount(TrackInfoPanel, { props });
        expect(wrapper.find('.track-metadata').exists()).toBe(true);
        expect(wrapper.text()).toContain('Track info');
    });

    it('renders recorded date', () => {
        const wrapper = mount(TrackInfoPanel, { props });
        expect(wrapper.text()).toContain('Recorded');
    });

    it('renders added date', () => {
        const wrapper = mount(TrackInfoPanel, { props });
        expect(wrapper.text()).toContain('Added');
    });

    it('renders modified date', () => {
        const wrapper = mount(TrackInfoPanel, { props });
        expect(wrapper.text()).toContain('Modified');
    });

    it('formats dates in 24-hour format', () => {
        const wrapper = mount(TrackInfoPanel, { props });
        const text = wrapper.text();
        expect(text).not.toContain('AM');
        expect(text).not.toContain('PM');
    });

    it('hides recorded date when not available', () => {
        props.track.recorded_at = null;
        const wrapper = mount(TrackInfoPanel, { props });
        expect(wrapper.text()).not.toContain('Recorded');
    });

    it('hides added date when not available', () => {
        props.track.created_at = null;
        const wrapper = mount(TrackInfoPanel, { props });
        expect(wrapper.text()).not.toContain('Added');
    });

    it('hides modified date when not available', () => {
        props.track.updated_at = null;
        const wrapper = mount(TrackInfoPanel, { props });
        expect(wrapper.text()).not.toContain('Modified');
    });

    it('handles invalid dates gracefully', () => {
        props.track.created_at = 'invalid-date';
        const wrapper = mount(TrackInfoPanel, { props });
        expect(wrapper.text()).toContain('Invalid Date');
    });

    it('handles empty track dates', () => {
        props.track = { id: 't1' };
        const wrapper = mount(TrackInfoPanel, { props });
        expect(wrapper.find('.metadata-grid').exists()).toBe(true);
    });
});
