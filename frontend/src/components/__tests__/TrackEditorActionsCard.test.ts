// @ts-nocheck - Test mocks don't need full type fidelity
import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import TrackEditorActionsCard from '../editor/TrackEditorActionsCard.vue';

// Stub child components with data-testid attributes and props
const TrackEditorInspectorTrackActions = {
    name: 'TrackEditorInspectorTrackActions',
    template: '<div data-testid="track-actions"></div>',
    props: ['onDuplicateTrack', 'onReverseTrack'],
};

const TrackEditorInspectorSummary = {
    name: 'TrackEditorInspectorSummary',
    template: '<div data-testid="summary"></div>',
    props: ['totalDistanceKm', 'estimatedTimeMinutes', 'totalPoints', 'segmentCount', 'poiCount', 'onCloseLoop', 'onCloseLoopSameWay', 'onCloseLoopDifferentRoute'],
};

const TrackEditorInspectorOptimizer = {
    name: 'TrackEditorInspectorOptimizer',
    template: '<div data-testid="optimizer"></div>',
    props: ['optimizerTargetRatio', 'optimizerPreview', 'optimizerStats', 'optimizerLoading', 'optimizerError', 'totalPoints', 'onUpdateOptimizerTargetRatio', 'onPreviewOptimization', 'onApplyOptimization', 'onClearOptimization', 'onDownloadOptimization'],
};

const TrackEditorInspectorFragmentTools = {
    name: 'TrackEditorInspectorFragmentTools',
    template: '<div data-testid="fragment-tools"></div>',
    props: ['fragmentInfo', 'onClearFragment', 'onRerouteFragment', 'onDeleteFragmentConnect', 'onDeleteFragmentSplit', 'onReverseFragment', 'onExportFragment'],
};

describe('TrackEditorActionsCard', () => {
    function createWrapper(props = {}) {
        return mount(TrackEditorActionsCard, {
            props: {
                totalDistanceKm: 3.4,
                estimatedTimeMinutes: 45,
                totalPoints: 8,
                segmentCount: 2,
                poiCount: 1,
                fragmentInfo: null,
                optimizerTargetRatio: 0.1,
                optimizerPreview: null,
                optimizerStats: null,
                optimizerLoading: false,
                optimizerError: null,
                ...props,
            },
            global: {
                stubs: {
                    TrackEditorInspectorTrackActions,
                    TrackEditorInspectorSummary,
                    TrackEditorInspectorOptimizer,
                    TrackEditorInspectorFragmentTools,
                },
            },
        });
    }

    it('renders the actions card container', () => {
        const wrapper = createWrapper();
        expect(wrapper.find('[data-testid="track-editor-actions-card"]').exists()).toBe(true);
    });

    it('renders child components', () => {
        const wrapper = createWrapper();
        expect(wrapper.find('[data-testid="track-actions"]').exists()).toBe(true);
        expect(wrapper.find('[data-testid="summary"]').exists()).toBe(true);
        expect(wrapper.find('[data-testid="optimizer"]').exists()).toBe(true);
    });

    it('does not render fragment tools when fragmentInfo is null', () => {
        const wrapper = createWrapper({ fragmentInfo: null });
        expect(wrapper.find('[data-testid="fragment-tools"]').exists()).toBe(false);
    });

    it('renders fragment tools when fragmentInfo is provided', () => {
        const wrapper = createWrapper({
            fragmentInfo: { segIndex: 0, points: 2, complete: true },
        });
        expect(wrapper.find('[data-testid="fragment-tools"]').exists()).toBe(true);
    });

    it('passes props to optimizer component', () => {
        const wrapper = createWrapper({
            optimizerTargetRatio: 0.5,
            optimizerLoading: true,
            optimizerError: 'Test error',
        });
        const optimizer = wrapper.findComponent({ name: 'TrackEditorInspectorOptimizer' });
        expect(optimizer.props('optimizerTargetRatio')).toBe(0.5);
        expect(optimizer.props('optimizerLoading')).toBe(true);
        expect(optimizer.props('optimizerError')).toBe('Test error');
    });

    it('passes props to summary component', () => {
        const wrapper = createWrapper({
            totalDistanceKm: 10.5,
            estimatedTimeMinutes: 120,
            totalPoints: 50,
            segmentCount: 3,
            poiCount: 5,
        });
        const summary = wrapper.findComponent({ name: 'TrackEditorInspectorSummary' });
        expect(summary.props('totalDistanceKm')).toBe(10.5);
        expect(summary.props('estimatedTimeMinutes')).toBe(120);
        expect(summary.props('totalPoints')).toBe(50);
        expect(summary.props('segmentCount')).toBe(3);
        expect(summary.props('poiCount')).toBe(5);
    });

    it('passes fragmentInfo to fragment tools component', () => {
        const fragmentInfo = { segIndex: 1, points: 5, complete: false };
        const wrapper = createWrapper({ fragmentInfo });
        const fragmentTools = wrapper.findComponent({ name: 'TrackEditorInspectorFragmentTools' });
        expect(fragmentTools.props('fragmentInfo')).toEqual(fragmentInfo);
    });
});
