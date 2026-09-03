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

vi.mock('../../stores/toast.js', () => ({
    useToastStore: () => ({
        showToast,
        message: '',
        type: 'info',
        duration: 0,
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
        return () => h('div', { 'data-testid': 'track-editor-map-stub' });
    },
});

const TrackEditorToolbarStub = defineComponent({
    name: 'TrackEditorToolbar',
    props: [
        'mode',
        'canUndo',
        'canRedo',
        'poiMode',
        'routingMode',
        'snapToRoadMode',
        'routingProfile',
        'showDistanceMarkers',
    ],
    emits: [
        'setMode',
        'undo',
        'redo',
        'togglePoiMode',
        'toggleRouting',
        'setSnapToRoadMode',
        'setRoutingProfile',
        'toggleDistanceMarkers',
    ],
    setup() {
        return () => h('div', { 'data-testid': 'track-editor-toolbar-stub' });
    },
});

const TrackEditorLeftPanelStub = defineComponent({
    name: 'TrackEditorLeftPanel',
    emits: ['addSegment', 'chart-point-click', 'save', 'export'],
    setup(_, { emit }) {
        return () => h('div', { 'data-testid': 'track-editor-left-panel-stub' }, [
            h('button', {
                'data-testid': 'track-editor-left-panel-add-segment',
                onClick: () => emit('addSegment'),
            }),
            h('button', {
                'data-testid': 'track-editor-left-panel-chart-click',
                onClick: () => emit('chart-point-click', {
                    coordinateIndex: 1,
                    isFixed: true,
                    latlng: [11, 21],
                }),
            }),
        ]);
    },
});

const TrackEditorInspectorStub = defineComponent({
    name: 'TrackEditorInspector',
    props: [
        'editorMode',
        'poiMode',
        'segmentStats',
        'activeSegmentIndex',
        'pois',
        'fragmentInfo',
    ],
    emits: [
        'deletePoi',
        'updatePoi',
    ],
    setup() {
        return () => h('div', { 'data-testid': 'track-editor-inspector-stub' });
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
                    TrackEditorLeftPanel: TrackEditorLeftPanelStub,
                    TrackEditorToolbar: TrackEditorToolbarStub,
                    TrackEditorInspector: TrackEditorInspectorStub,
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

    it('renders the new editor shell zones around the map', () => {
        const leftPanel = wrapper.find('[data-testid="editor-left-panel"]');
        const toolbar = wrapper.find('[data-testid="editor-toolbar"]');
        const mapRegion = wrapper.find('[data-testid="editor-map-region"]');
        const inspector = wrapper.find('[data-testid="editor-right-inspector"]');

        expect(leftPanel.exists()).toBe(true);
        expect(toolbar.exists()).toBe(true);
        expect(mapRegion.exists()).toBe(true);
        expect(inspector.exists()).toBe(true);

        expect(leftPanel.isVisible()).toBe(true);
        expect(toolbar.isVisible()).toBe(true);
        expect(mapRegion.isVisible()).toBe(true);
        expect(inspector.isVisible()).toBe(true);

        expect(leftPanel.find('[data-testid="track-editor-left-panel-stub"]').exists()).toBe(true);
        expect(toolbar.find('[data-testid="track-editor-toolbar-stub"]').exists()).toBe(true);
        expect(mapRegion.find('[data-testid="track-editor-map-stub"]').exists()).toBe(true);
        expect(inspector.find('[data-testid="track-editor-inspector-stub"]').exists()).toBe(true);
    });

    it('mounts the editor as a full-screen map stage with a dedicated overlay layer', () => {
        const mapStage = wrapper.find('[data-testid="editor-map-stage"]');
        const overlayLayer = wrapper.find('[data-testid="editor-overlay-layer"]');

        expect(mapStage.exists()).toBe(true);
        expect(overlayLayer.exists()).toBe(true);
        expect(mapStage.find('[data-testid="editor-map-region"]').exists()).toBe(true);

        expect(overlayLayer.find('[data-testid="editor-left-panel"]').exists()).toBe(true);
        expect(overlayLayer.find('[data-testid="editor-toolbar"]').exists()).toBe(true);
        expect(overlayLayer.find('[data-testid="editor-right-inspector"]').exists()).toBe(true);
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

    it('preserves mode-switching shortcuts', () => {
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'F1' }));
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'F2' }));
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'F3' }));
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'F4' }));
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 't' }));

        expect(mockEditor.setMode).toHaveBeenNthCalledWith(1, 'view');
        expect(mockEditor.setMode).toHaveBeenNthCalledWith(2, 'edit');
        expect(mockEditor.setMode).toHaveBeenNthCalledWith(3, 'fragment');
        expect(mockEditor.setMode).toHaveBeenNthCalledWith(4, 'routing');
        expect(mockEditor.setMode).toHaveBeenNthCalledWith(5, 'trace');
    });

    it('preserves undo redo and save shortcuts', async () => {
        mockEditor.saveTrack.mockResolvedValue('saved-track-id');

        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true }));
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'y', ctrlKey: true }));
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'S', ctrlKey: true, shiftKey: true }));

        expect(mockEditor.handleUndo).toHaveBeenCalledTimes(1);
        expect(mockEditor.handleRedo).toHaveBeenCalledTimes(1);

        await Promise.resolve();
        expect(mockEditor.saveTrack).toHaveBeenCalledTimes(1);
        expect(mockRouter.push).toHaveBeenCalledWith({
            name: 'Track',
            params: { id: 'saved-track-id' },
        });
    });

    it('preserves non-map action shortcuts', () => {
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 's', ctrlKey: true }));
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete' }));

        expect(mockEditor.addSegment).toHaveBeenCalledTimes(1);
        expect(mockEditor.deleteLastPoint).toHaveBeenCalledTimes(1);
    });

    it('forwards bottom deck segment actions to editor logic', async () => {
        await wrapper.find('[data-testid="track-editor-left-panel-add-segment"]').trigger('click');

        expect(mockEditor.addSegment).toHaveBeenCalledTimes(1);
    });

    it('routes chart clicks from the bottom deck back to the map-facing shell', async () => {
        await wrapper.find('[data-testid="track-editor-left-panel-chart-click"]').trigger('click');

        expect(mockEditor.setFragmentPoint).toHaveBeenCalledWith(0, 1);
        expect(mapPanTo).toHaveBeenCalledWith([11, 21]);
    });
});
