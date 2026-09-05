// @ts-nocheck - Test mocks don't need full type fidelity
import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import TrackEditorSegmentsCard from '../editor/TrackEditorSegmentsCard.vue';

const TrackEditorInspectorSegments = {
    name: 'TrackEditorInspectorSegments',
    template: '<div data-testid="inspector-segments"></div>',
    props: [
        'segmentStats', 'activeSegmentIndex', 'highlightedSegmentIndex',
        'onAddSegment', 'onSetActiveSegment', 'onHoverSegment', 'onLeaveSegment',
        'onUpdateSegmentName', 'onUpdateSegmentColor', 'onJoinSegments',
        'onNewTrackFromSegment', 'onReverseSegment', 'onDeleteSegment',
    ],
};

describe('TrackEditorSegmentsCard', () => {
    function createWrapper(props = {}) {
        return mount(TrackEditorSegmentsCard, {
            props: {
                segmentStats: [],
                activeSegmentIndex: 0,
                highlightedSegmentIndex: null,
                ...props,
            },
            global: {
                stubs: {
                    TrackEditorInspectorSegments,
                },
            },
        });
    }

    it('renders the segments card container', () => {
        const wrapper = createWrapper();
        expect(wrapper.find('[data-testid="track-editor-segments-card"]').exists()).toBe(true);
    });

    it('renders the inspector segments component', () => {
        const wrapper = createWrapper();
        expect(wrapper.find('[data-testid="inspector-segments"]').exists()).toBe(true);
    });

    it('passes segmentStats to inspector segments', () => {
        const segmentStats = [
            { name: 'seg1', displayName: 'Segment 1', pointCount: 10, distanceKm: 5.0, color: '#ff0000' },
        ];
        const wrapper = createWrapper({ segmentStats });
        const inspector = wrapper.findComponent({ name: 'TrackEditorInspectorSegments' });
        expect(inspector.props('segmentStats')).toEqual(segmentStats);
    });

    it('passes activeSegmentIndex to inspector segments', () => {
        const wrapper = createWrapper({ activeSegmentIndex: 2 });
        const inspector = wrapper.findComponent({ name: 'TrackEditorInspectorSegments' });
        expect(inspector.props('activeSegmentIndex')).toBe(2);
    });

    it('passes highlightedSegmentIndex to inspector segments', () => {
        const wrapper = createWrapper({ highlightedSegmentIndex: 1 });
        const inspector = wrapper.findComponent({ name: 'TrackEditorInspectorSegments' });
        expect(inspector.props('highlightedSegmentIndex')).toBe(1);
    });

    it('handles null highlightedSegmentIndex', () => {
        const wrapper = createWrapper({ highlightedSegmentIndex: null });
        const inspector = wrapper.findComponent({ name: 'TrackEditorInspectorSegments' });
        expect(inspector.props('highlightedSegmentIndex')).toBeNull();
    });

    it('handles empty segmentStats', () => {
        const wrapper = createWrapper({ segmentStats: [] });
        const inspector = wrapper.findComponent({ name: 'TrackEditorInspectorSegments' });
        expect(inspector.props('segmentStats')).toEqual([]);
    });
});
