import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { defineComponent, h, ref } from 'vue';
import TrackEditorView from '../TrackEditorView.vue';

const mockRouter = {
    push: vi.fn().mockResolvedValue(undefined),
    replace: vi.fn().mockResolvedValue(undefined),
};

const mockRoute = {
    params: {},
};

vi.mock('vue-router', () => ({
    useRouter: () => mockRouter,
    useRoute: () => mockRoute,
}));

const showToast = vi.fn();

vi.mock('../../composables/useToast', () => ({
    useToast: () => ({
        showToast,
        toast: {
            message: '',
            type: 'info',
            duration: 0,
        },
    }),
}));

let mockEditor;

vi.mock('../../composables/useTrackEditor', () => ({
    useTrackEditor: () => mockEditor,
}));

const mapZoomIn = vi.fn();
const mapZoomOut = vi.fn();
const mapPanTo = vi.fn();
const mapFitBounds = vi.fn();

const TrackEditorMapStub = defineComponent({
    name: 'TrackEditorMap',
    setup(_, { expose }) {
        expose({
            zoomIn: mapZoomIn,
            zoomOut: mapZoomOut,
            panTo: mapPanTo,
            fitBounds: mapFitBounds,
        });
        return () => h('div');
    },
});

const TrackEditorToolbarStub = defineComponent({
    name: 'TrackEditorToolbar',
    props: [
        'mode',
        'canUndo',
        'canRedo',
        'canSave',
        'saving',
        'totalPoints',
        'totalDistanceKm',
        'routingMode',
        'snapToRoadMode',
        'routingProfile',
        'graphLoading',
        'graphError',
        'graphProgress',
        'estimatedTimeMinutes',
        'manualRoutingPercent',
        'poiMode',
        'savedTrackId',
    ],
    emits: [
        'setMode',
        'undo',
        'redo',
        'save',
        'toggleRouting',
        'setSnapToRoadMode',
        'setRoutingProfile',
        'togglePoiMode',
        'export',
    ],
    setup() {
        return () => h('div');
    },
});

const TrackEditorSidebarStub = defineComponent({
    name: 'TrackEditorSidebar',
    props: [
        'trackName',
        'trackDescription',
        'trackCategories',
        'segmentStats',
        'activeSegmentIndex',
        'totalDistanceKm',
        'totalPoints',
        'error',
        'showDraftBanner',
        'estimatedTimeMinutes',
        'pois',
        'elevationProfile',
        'elevationStats',
        'elevationLoading',
        'elevationError',
        'coordinateData',
        'collapsed',
        'fragmentSelection',
        'optimizerTargetRatio',
        'optimizerPreview',
        'optimizerStats',
        'optimizerLoading',
        'optimizerError',
    ],
    emits: [
        'update:trackName',
        'update:trackDescription',
        'update:trackCategories',
        'updateSegmentName',
        'updateSegmentColor',
        'update:optimizerTargetRatio',
        'addSegment',
        'deleteSegment',
        'reverseSegment',
        'setActiveSegment',
        'restoreDraft',
        'deleteDraft',
        'joinSegments',
        'deletePoi',
        'updatePoi',
        'toggleCollapse',
        'clearFragment',
        'deleteFragmentConnect',
        'deleteFragmentSplit',
        'reverseFragment',
        'rerouteFragment',
        'closeLoop',
        'reverseTrack',
        'duplicateTrack',
        'newTrackFromSegment',
        'previewOptimization',
        'applyOptimization',
        'clearOptimization',
        'downloadOptimization',
        'chart-point-hover',
        'chart-point-leave',
        'chart-point-click',
    ],
    setup() {
        return () => h('div');
    },
});

const ToastStub = defineComponent({
    name: 'Toast',
    props: ['message', 'type', 'duration'],
    setup() {
        return () => h('div');
    },
});

function createMockEditor() {
    return {
        editorMode: ref('edit'),
        canUndo: ref(false),
        canRedo: ref(false),
        canSave: ref(true),
        saving: ref(false),
        totalPoints: ref(2),
        totalDistanceKm: ref(1.2),
        estimatedTimeMinutes: ref(10),
        manualRoutingPercent: ref(0),
        trackName: ref('Test track'),
        trackDescription: ref(''),
        trackCategories: ref([]),
        segments: ref([
            {
                points: [
                    [10, 20],
                    [11, 21],
                ],
                waypoints: [0, 1],
                surfaceTypes: [],
                color: '#1976D2',
            },
        ]),
        segmentStats: ref([
            {
                index: 0,
                name: '',
                displayName: 'Day 1',
                pointCount: 2,
                distanceKm: 1.2,
                color: '#1976D2',
            },
        ]),
        activeSegmentIndex: ref(0),
        coordinateData: ref([
            [10, 20],
            [11, 21],
        ]),
        fragmentSelection: ref({ segIndex: null, startIdx: null, endIdx: null }),
        pois: ref([]),
        elevationProfile: ref([]),
        elevationStats: ref({}),
        elevationLoading: ref(false),
        elevationError: ref(null),
        optimizerTargetRatio: ref(0.1),
        optimizerPreview: ref(null),
        optimizerStats: ref(null),
        optimizerLoading: ref(false),
        optimizerError: ref(null),
        savedTrackId: ref(null),
        error: ref(null),
        hasDraft: ref(false),
        isOwner: ref(true),
        snapToRoadMode: ref('auto'),
        routing: {
            mode: ref('auto'),
            profile: ref('hiking'),
            graphLoading: ref(false),
            graphError: ref(null),
            graphProgress: ref(0),
            toggleMode: vi.fn(),
            setProfile: vi.fn(),
            initialize: vi.fn(),
            snapToPoint: vi.fn(),
        },
        setMode: vi.fn(),
        handleUndo: vi.fn(),
        handleRedo: vi.fn(),
        addSegment: vi.fn(),
        deleteLastPoint: vi.fn(),
        splitSegment: vi.fn(),
        setActiveSegment: vi.fn(),
        promoteToWaypoint: vi.fn(),
        addWaypoint: vi.fn(),
        moveWaypoint: vi.fn(),
        deleteWaypoint: vi.fn(),
        insertWaypoint: vi.fn(),
        cutSegmentAt: vi.fn(),
        setFragmentPoint: vi.fn(),
        clearFragmentSelection: vi.fn(),
        deleteFragmentConnect: vi.fn(),
        deleteFragmentSplit: vi.fn(),
        reverseFragment: vi.fn(),
        rerouteFragment: vi.fn(),
        closeLoop: vi.fn(),
        reverseTrack: vi.fn(),
        duplicateTrack: vi.fn(),
        createTrackFromSegment: vi.fn(),
        previewOptimization: vi.fn(),
        applyOptimizationPreview: vi.fn(),
        clearOptimizationPreview: vi.fn(),
        downloadOptimizationPreview: vi.fn(),
        setSegmentName: vi.fn(),
        setSegmentColor: vi.fn(),
        setOptimizerTargetRatio: vi.fn(),
        addPoi: vi.fn(),
        deletePoi: vi.fn(),
        updatePoi: vi.fn(),
        saveTrack: vi.fn(),
        exportTrack: vi.fn(),
        loadTrack: vi.fn(),
        restoreDraft: vi.fn(),
        deleteDraft: vi.fn(),
    };
}

describe('TrackEditorView keyboard shortcuts', () => {
    let wrapper;

    beforeEach(() => {
        mockEditor = createMockEditor();
        mapZoomIn.mockClear();
        mapZoomOut.mockClear();
        mapPanTo.mockClear();
        mapFitBounds.mockClear();
        showToast.mockClear();
        wrapper = mount(TrackEditorView, {
            global: {
                stubs: {
                    TrackEditorMap: TrackEditorMapStub,
                    TrackEditorToolbar: TrackEditorToolbarStub,
                    TrackEditorSidebar: TrackEditorSidebarStub,
                    Toast: ToastStub,
                },
            },
        });
    });

    afterEach(() => {
        if (wrapper) {
            wrapper.unmount();
        }
    });

    it('zooms map with + and - hotkeys', () => {
        document.dispatchEvent(new KeyboardEvent('keydown', { key: '+' }));
        document.dispatchEvent(new KeyboardEvent('keydown', { key: '-' }));
        expect(mapZoomIn).toHaveBeenCalledTimes(1);
        expect(mapZoomOut).toHaveBeenCalledTimes(1);
    });

    it('navigates points with arrow keys', () => {
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight' }));
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft' }));
        expect(mapPanTo).toHaveBeenCalled();
    });

    it('confirms fragment selection with Enter', () => {
        mockEditor.editorMode.value = 'fragment';
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight' }));
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
        expect(mockEditor.setFragmentPoint).toHaveBeenCalledWith(0, 0);
    });
});
