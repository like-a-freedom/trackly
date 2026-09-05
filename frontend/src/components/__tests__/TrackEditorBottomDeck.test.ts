// @ts-nocheck - Test mocks don't need full type fidelity
import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import TrackEditorBottomDeck from '../editor/TrackEditorBottomDeck.vue';

// Stub child components
const createStub = (name: string, testId: string, props: string[] = []) => ({
    name,
    template: `<div data-testid="${testId}"></div>`,
    props,
});

const TrackEditorMetaCard = createStub('TrackEditorMetaCard', 'track-editor-meta-card', [
    'trackName', 'trackDescription', 'trackCategories', 'totalPoints',
    'onUpdateTrackName', 'onUpdateTrackDescription', 'onUpdateTrackCategories',
]);

const TrackEditorSegmentsCard = createStub('TrackEditorSegmentsCard', 'track-editor-segments-card', [
    'segmentStats', 'activeSegmentIndex', 'highlightedSegmentIndex',
    'onAddSegment', 'onSetActiveSegment', 'onHoverSegment', 'onLeaveSegment',
    'onUpdateSegmentName', 'onUpdateSegmentColor', 'onJoinSegments',
    'onNewTrackFromSegment', 'onReverseSegment', 'onDeleteSegment',
]);

const TrackEditorActionsCard = createStub('TrackEditorActionsCard', 'track-editor-actions-card', [
    'totalDistanceKm', 'estimatedTimeMinutes', 'totalPoints', 'segmentCount',
    'poiCount', 'fragmentInfo', 'optimizerTargetRatio', 'optimizerPreview',
    'optimizerStats', 'optimizerLoading', 'optimizerError',
    'onDuplicateTrack', 'onReverseTrack', 'onCloseLoop', 'onCloseLoopSameWay',
    'onCloseLoopDifferentRoute', 'onUpdateOptimizerTargetRatio',
    'onPreviewOptimization', 'onApplyOptimization', 'onClearOptimization',
    'onDownloadOptimization', 'onClearFragment', 'onRerouteFragment',
    'onDeleteFragmentConnect', 'onDeleteFragmentSplit', 'onReverseFragment',
    'onExportFragment',
]);

const TrackEditorChartCard = createStub('TrackEditorChartCard', 'track-editor-chart-card', [
    'elevationProfile', 'elevationStats', 'totalDistanceKm', 'coordinateData',
    'elevationLoading', 'elevationError',
    'onChartPointHover', 'onChartPointLeave', 'onChartPointClick',
]);

describe('TrackEditorBottomDeck', () => {
    function createWrapper(props = {}) {
        return mount(TrackEditorBottomDeck, {
            props: {
                trackName: 'Morning route',
                trackDescription: 'A scenic loop',
                trackCategories: ['hiking'],
                segmentStats: [
                    {
                        name: '',
                        displayName: 'Day 1',
                        pointCount: 8,
                        distanceKm: 3.4,
                        color: '#1976d2',
                    },
                ],
                activeSegmentIndex: 0,
                totalDistanceKm: 3.4,
                totalPoints: 8,
                estimatedTimeMinutes: 45,
                pois: [{ name: 'Shelter' }],
                elevationProfile: [{ distance: 0, elevation: 100 }],
                elevationStats: { gain: 50, loss: 30 },
                elevationLoading: false,
                elevationError: null,
                coordinateData: [[50.45, 30.52]],
                highlightedSegmentIndex: null,
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
                    TrackEditorMetaCard,
                    TrackEditorSegmentsCard,
                    TrackEditorActionsCard,
                    TrackEditorChartCard,
                },
            },
        });
    }

    it('renders the bottom deck container', () => {
        const wrapper = createWrapper();
        expect(wrapper.find('[data-testid="track-editor-bottom-deck"]').exists()).toBe(true);
    });

    it('renders all child components', () => {
        const wrapper = createWrapper();
        expect(wrapper.find('[data-testid="track-editor-meta-card"]').exists()).toBe(true);
        expect(wrapper.find('[data-testid="track-editor-segments-card"]').exists()).toBe(true);
        expect(wrapper.find('[data-testid="track-editor-actions-card"]').exists()).toBe(true);
        expect(wrapper.find('[data-testid="track-editor-chart-card"]').exists()).toBe(true);
    });

    it('passes props to meta card', () => {
        const wrapper = createWrapper({
            trackName: 'Test Track',
            trackDescription: 'Test Description',
            trackCategories: ['cycling', 'hiking'],
            totalPoints: 100,
        });
        const metaCard = wrapper.findComponent({ name: 'TrackEditorMetaCard' });
        expect(metaCard.props('trackName')).toBe('Test Track');
        expect(metaCard.props('trackDescription')).toBe('Test Description');
        expect(metaCard.props('trackCategories')).toEqual(['cycling', 'hiking']);
        expect(metaCard.props('totalPoints')).toBe(100);
    });

    it('passes props to segments card', () => {
        const segmentStats = [
            { name: 'seg1', displayName: 'Segment 1', pointCount: 10, distanceKm: 5.0, color: '#ff0000' },
        ];
        const wrapper = createWrapper({
            segmentStats,
            activeSegmentIndex: 0,
            highlightedSegmentIndex: 1,
        });
        const segmentsCard = wrapper.findComponent({ name: 'TrackEditorSegmentsCard' });
        expect(segmentsCard.props('segmentStats')).toEqual(segmentStats);
        expect(segmentsCard.props('activeSegmentIndex')).toBe(0);
        expect(segmentsCard.props('highlightedSegmentIndex')).toBe(1);
    });

    it('passes props to actions card', () => {
        const wrapper = createWrapper({
            totalDistanceKm: 15.5,
            estimatedTimeMinutes: 180,
            totalPoints: 200,
            pois: [{ name: 'POI1' }, { name: 'POI2' }],
            fragmentInfo: { segIndex: 0, points: 5, complete: true },
            optimizerTargetRatio: 0.3,
            optimizerLoading: true,
        });
        const actionsCard = wrapper.findComponent({ name: 'TrackEditorActionsCard' });
        expect(actionsCard.props('totalDistanceKm')).toBe(15.5);
        expect(actionsCard.props('estimatedTimeMinutes')).toBe(180);
        expect(actionsCard.props('totalPoints')).toBe(200);
        expect(actionsCard.props('segmentCount')).toBe(1); // segmentStats.length
        expect(actionsCard.props('poiCount')).toBe(2); // pois.length
        expect(actionsCard.props('fragmentInfo')).toEqual({ segIndex: 0, points: 5, complete: true });
        expect(actionsCard.props('optimizerTargetRatio')).toBe(0.3);
        expect(actionsCard.props('optimizerLoading')).toBe(true);
    });

    it('passes props to chart card', () => {
        const elevationProfile = [{ distance: 0, elevation: 100 }, { distance: 1000, elevation: 150 }];
        const elevationStats = { gain: 100, loss: 50 };
        const coordinateData = [[50.45, 30.52], [50.46, 30.53]];
        const wrapper = createWrapper({
            elevationProfile,
            elevationStats,
            coordinateData,
            elevationLoading: true,
            elevationError: 'Test error',
        });
        const chartCard = wrapper.findComponent({ name: 'TrackEditorChartCard' });
        expect(chartCard.props('elevationProfile')).toEqual(elevationProfile);
        expect(chartCard.props('elevationStats')).toEqual(elevationStats);
        expect(chartCard.props('coordinateData')).toEqual(coordinateData);
        expect(chartCard.props('elevationLoading')).toBe(true);
        expect(chartCard.props('elevationError')).toBe('Test error');
    });

    it('computes segmentCount from segmentStats length', () => {
        const wrapper = createWrapper({
            segmentStats: [
                { name: 's1', displayName: 'S1', pointCount: 5, distanceKm: 1.0, color: '#ff0000' },
                { name: 's2', displayName: 'S2', pointCount: 5, distanceKm: 2.0, color: '#00ff00' },
                { name: 's3', displayName: 'S3', pointCount: 5, distanceKm: 3.0, color: '#0000ff' },
            ],
        });
        const actionsCard = wrapper.findComponent({ name: 'TrackEditorActionsCard' });
        expect(actionsCard.props('segmentCount')).toBe(3);
    });

    it('computes poiCount from pois length', () => {
        const wrapper = createWrapper({
            pois: [{ name: 'P1' }, { name: 'P2' }, { name: 'P3' }, { name: 'P4' }],
        });
        const actionsCard = wrapper.findComponent({ name: 'TrackEditorActionsCard' });
        expect(actionsCard.props('poiCount')).toBe(4);
    });
});
