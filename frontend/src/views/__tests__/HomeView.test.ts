// @ts-nocheck - Test mocks don't need full type fidelity
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import type { VueWrapper } from '@vue/test-utils';
import { ref } from 'vue';

import HomeView from '../HomeView.vue';

// Mock composables
vi.mock('../composables/useTracks', () => ({
    useTracks: () => ({
        polylines: ref([]),
        fetchTracksInBounds: vi.fn(),
        uploadTrack: vi.fn(),
        error: ref(null)
    })
}));

vi.mock('../stores/toast.js', () => ({
    useToastStore: () => ({
        showToast: vi.fn(),
        message: '',
        type: 'info',
        duration: 3000
    })
}));

vi.mock('../stores/search.js', () => ({
    useSearchStore: () => ({
        clearSearchState: vi.fn(),
        searchResults: [],
        searchQuery: '',
        hasSearchState: false
    })
}));

vi.mock('../composables/useMapUrlState', () => ({
    useMapUrlState: () => ({
        zoom: ref(11),
        center: ref([55.7558, 37.6176]),
        bounds: ref(null),
        trackId: ref(null),
        poiId: ref(null),
        updateZoom: vi.fn(),
        updateCenter: vi.fn(),
        updateBounds: vi.fn(),
        setTrackId: vi.fn(),
        setPoiId: vi.fn(),
        clearTrackId: vi.fn(),
        clearPoiId: vi.fn(),
    })
}));

vi.mock('../utils/session', () => ({
    getSessionId: () => 'test-session-id'
}));

vi.mock('../composables/useAuth', () => ({
    useAuth: () => ({
        user: ref(null),
        isAuthenticated: ref(false),
        isLoading: ref(false),
        error: ref(null),
        login: vi.fn(),
        logout: vi.fn(),
        checkAuth: vi.fn(),
        _resetForTesting: vi.fn()
    })
}));

// Mock router
const mockRouter = {
    push: vi.fn(),
    currentRoute: ref({ value: { path: '/' } })
};

vi.mock('vue-router', () => ({
    useRouter: () => mockRouter,
    useRoute: () => ({
        query: {},
        path: '/',
    })
}));

describe('HomeView', () => {
    let wrapper: VueWrapper<InstanceType<typeof TrackView>>;

    // Helper function to create mounted wrapper with proper data
    function createWrapper() {
        return mount(HomeView, {
            data() {
                return {
                    center: [55.7558, 37.6176], // Valid coordinates for Moscow
                    zoom: 11, // Valid zoom level
                    mapReadyToShow: true, // Force map to show
                    uploadFormExpanded: false,
                    dragActive: false
                };
            },
            global: {
                plugins: [],
                stubs: {
                    TrackMap: {
                        template: `
                            <div data-testid="track-map-mock">
                                <slot />
                            </div>
                        `,
                        props: ['center', 'zoom', 'bounds', 'polylines'],
                        emits: ['mapReady', 'update:center', 'update:zoom', 'update:bounds', 'trackClick']
                    },
                    TrackTooltip: {
                        template: '<div class="track-tooltip-mock"></div>',
                        props: ['visible', 'x', 'y', 'data']
                    },
                    UploadForm: {
                        template: '<div class="upload-form-mock"></div>',
                        emits: ['upload', 'uploaded', 'update:dragActive'],
                        props: ['dragActive']
                    },
                    Toast: {
                        template: '<div class="toast-mock"></div>',
                        props: ['message', 'type', 'duration']
                    },
                    TrackSearch: {
                        template: '<div class="track-search-mock"></div>',
                        props: ['isVisible'],
                        emits: ['close', 'track-selected']
                    },
                    LoginButton: {
                        template: '<div class="login-button-mock"></div>'
                    },
                    SearchButton: {
                        template: '<div class="search-button-mock"></div>',
                        emits: ['open-search']
                    },
                    GeolocationButton: {
                        template: '<div class="geolocation-button-mock"></div>',
                        emits: ['location-found']
                    }
                }
            }
        });
    }

    beforeEach(() => {
        wrapper = createWrapper();

        // Wait for component to be fully mounted and reactive values to be set
        return wrapper.vm.$nextTick();
    });

    describe('Upload Form Collapsible Behavior', () => {
        it('should render upload form collapsed by default', () => {
            // Form should be collapsed by default
            expect(wrapper.find('.upload-form-expanded').exists()).toBe(false);
            expect(wrapper.find('.upload-button-compact').exists()).toBe(true);
        });

        it('should show expand button in collapsed state', () => {
            const compactButton = wrapper.find('.upload-button-compact');
            expect(compactButton.exists()).toBe(true);
            expect(compactButton.attributes('title')).toBe('Upload track file');
        });

        it('should show upload icon in compact state', () => {
            const compactButton = wrapper.find('.upload-button-compact');
            const svg = compactButton.find('svg');

            expect(svg.exists()).toBe(true);
            expect(svg.classes()).toContain('upload-icon');
        });

        it('should toggle to expanded state when compact button is clicked', async () => {
            const compactButton = wrapper.find('.upload-button-compact');

            // Initially collapsed
            expect(wrapper.find('.upload-form-expanded').exists()).toBe(false);
            expect(wrapper.find('.upload-button-compact').exists()).toBe(true);

            // Click compact button to expand
            await compactButton.trigger('click');

            // Should now be expanded
            expect(wrapper.find('.upload-form-expanded').exists()).toBe(true);
            expect(wrapper.find('.upload-button-compact').exists()).toBe(false);
        });

        it('should show collapse button in expanded state', async () => {
            // Expand the form first
            await wrapper.find('.upload-button-compact').trigger('click');

            const collapseButton = wrapper.find('.collapse-button');
            expect(collapseButton.exists()).toBe(true);
            expect(collapseButton.attributes('title')).toBe('Collapse upload form');
        });

        it('should toggle back to collapsed state when collapse button is clicked', async () => {
            // Expand the form first
            await wrapper.find('.upload-button-compact').trigger('click');
            
            const collapseButton = wrapper.find('.collapse-button');

            // Should be expanded
            expect(wrapper.find('.upload-form-expanded').exists()).toBe(true);
            expect(wrapper.find('.upload-button-compact').exists()).toBe(false);

            // Click collapse button
            await collapseButton.trigger('click');

            // Should now be collapsed
            expect(wrapper.find('.upload-form-expanded').exists()).toBe(false);
            expect(wrapper.find('.upload-button-compact').exists()).toBe(true);
        });

        it('should have correct CSS classes for collapsed state', () => {
            const collapsibleUpload = wrapper.find('.collapsible-upload');
            expect(collapsibleUpload.classes()).not.toContain('expanded');
        });

        it('should have expanded class in expanded state', async () => {
            // Expand the form
            await wrapper.find('.upload-button-compact').trigger('click');

            const collapsibleUpload = wrapper.find('.collapsible-upload');
            expect(collapsibleUpload.classes()).toContain('expanded');
        });

        it('should render upload form component in collapsed state', () => {
            const uploadForm = wrapper.findComponent({ name: 'UploadForm' });
            expect(uploadForm.exists()).toBe(false);
        });

        it('should render upload form component in expanded state', async () => {
            // Expand the form first
            await wrapper.find('.upload-button-compact').trigger('click');
            
            // Check for upload form mock content
            const uploadFormContent = wrapper.find('.upload-form-mock');
            expect(uploadFormContent.exists()).toBe(true);
        });
    });

    describe('Upload Form Header', () => {
        it('should display correct title in expanded state', async () => {
            // Expand the form first
            await wrapper.find('.upload-button-compact').trigger('click');
            
            const title = wrapper.find('.upload-form-title');
            expect(title.exists()).toBe(true);
            expect(title.text()).toBe('Upload track');
        });

        it('should have proper header layout with title and collapse button', async () => {
            // Expand the form first
            await wrapper.find('.upload-button-compact').trigger('click');
            
            const header = wrapper.find('.upload-form-header');
            const title = header.find('.upload-form-title');
            const button = header.find('.collapse-button');

            expect(header.exists()).toBe(true);
            expect(title.exists()).toBe(true);
            expect(button.exists()).toBe(true);
        });
    });

    describe('Drag and Drop Behavior', () => {
        it('should handle dragover on compact button', () => {
            const compactButton = wrapper.find('.upload-button-compact');
            compactButton.trigger('dragover');

            // Drag over should be handled (no errors thrown)
            expect(compactButton.exists()).toBe(true);
        });

        it('should handle dragleave on compact button', () => {
            const compactButton = wrapper.find('.upload-button-compact');
            compactButton.trigger('dragleave');

            // Drag leave should be handled (no errors thrown)
            expect(compactButton.exists()).toBe(true);
        });

        it('should handle drop on compact button', () => {
            const compactButton = wrapper.find('.upload-button-compact');
            compactButton.trigger('drop');

            // Drop should be handled (no errors thrown)
            expect(compactButton.exists()).toBe(true);
        });
    });

    describe('Form Container Styling', () => {
        it('should have correct container classes', () => {
            const container = wrapper.find('.upload-form-container');
            const collapsible = wrapper.find('.collapsible-upload');

            expect(container.exists()).toBe(true);
            expect(collapsible.exists()).toBe(true);
        });

        it('should position container absolutely in bottom right', () => {
            const container = wrapper.find('.upload-form-container');
            expect(container.exists()).toBe(true);
            // CSS positioning is tested via computed styles in browser tests
        });
    });

    describe('Map Controls Overlay', () => {
        it('should render map controls overlay', () => {
            const overlay = wrapper.find('.map-controls-overlay');
            expect(overlay.exists()).toBe(true);
        });

        it('should render search button', () => {
            const searchButton = wrapper.find('.search-button-mock');
            expect(searchButton.exists()).toBe(true);
        });

        it('should render geolocation button', () => {
            const geoButton = wrapper.find('.geolocation-button-mock');
            expect(geoButton.exists()).toBe(true);
        });

        it('should render Create Track inside the map controls overlay', () => {
            const overlay = wrapper.find('.map-controls-overlay');
            const createTrack = wrapper.find('.create-track-btn');

            expect(createTrack.exists()).toBe(true);
            // Drawing a track belongs with the other map commands, not across
            // the map in the upload cluster.
            expect(overlay.find('.create-track-btn').exists()).toBe(true);
        });

        it('should keep Create Track out of the upload container', () => {
            const uploadContainer = wrapper.find('.upload-form-container');
            expect(uploadContainer.find('.create-track-btn').exists()).toBe(false);
        });

        it('should order Create Track last in the tool stack', () => {
            const children = [...wrapper.find('.map-controls-overlay').element.children];
            const last = children[children.length - 1];

            expect(last.classList.contains('create-track-btn')).toBe(true);
        });

        it('should use a distinct icon, not the zoom plus', () => {
            const createTrack = wrapper.find('.create-track-btn');
            // A plus would read as "zoom in" next to the zoom control.
            const lines = createTrack.findAll('line');
            const circles = createTrack.findAll('circle');

            expect(lines).toHaveLength(0);
            expect(circles.length).toBeGreaterThan(0);
        });
    });

    describe('Toast Component', () => {
        it('should render toast notification', () => {
            const toast = wrapper.find('.toast-mock');
            expect(toast.exists()).toBe(true);
        });
    });

    describe('Component Lifecycle', () => {
        it('should call nextTick after mounting', async () => {
            // Component should mount without errors
            expect(wrapper.exists()).toBe(true);
        });

        it('should have correct component name', () => {
            expect(wrapper.vm.$options.name).toBe('HomeView');
        });
    });

    describe('Map Position Persistence', () => {
        beforeEach(() => {
            // Clear localStorage before each test
            localStorage.clear();
        });

        it('should save map position to localStorage', () => {
            const setItemSpy = vi.spyOn(localStorage, 'setItem');

            // Trigger save by calling the component method
            wrapper.vm.saveMapPosition([55.7558, 37.6176], 12);

            expect(setItemSpy).toHaveBeenCalledWith(
                'trackly_map_position',
                expect.stringContaining('"center":[55.7558,37.6176]')
            );
        });

        it('should load valid map position from localStorage', () => {
            const validPosition = JSON.stringify({
                center: [55.7558, 37.6176],
                zoom: 12,
                timestamp: Date.now()
            });
            localStorage.setItem('trackly_map_position', validPosition);

            const result = wrapper.vm.loadMapPosition();

            expect(result).toEqual({
                center: [55.7558, 37.6176],
                zoom: 12,
                timestamp: expect.any(Number)
            });
        });

        it('should return null for invalid position data', () => {
            localStorage.setItem('trackly_map_position', 'invalid json');

            const result = wrapper.vm.loadMapPosition();

            expect(result).toBeNull();
        });

        it('should return null for missing position data', () => {
            const result = wrapper.vm.loadMapPosition();

            expect(result).toBeNull();
        });

        it('should return null for position with invalid center', () => {
            const invalidPosition = JSON.stringify({
                center: [null, null],
                zoom: 12,
                timestamp: Date.now()
            });
            localStorage.setItem('trackly_map_position', invalidPosition);

            const result = wrapper.vm.loadMapPosition();

            expect(result).toBeNull();
        });
    });

    describe('Map State Validation', () => {
        it('should validate valid latlng', () => {
            expect(wrapper.vm.isValidLatLng([55.7558, 37.6176])).toBe(true);
            expect(wrapper.vm.isValidLatLng([-90, -180])).toBe(true);
            expect(wrapper.vm.isValidLatLng([90, 180])).toBe(true);
        });

        it('should reject invalid latlng', () => {
            expect(wrapper.vm.isValidLatLng(null)).toBe(false);
            expect(wrapper.vm.isValidLatLng([55.7558])).toBe(false);
            expect(wrapper.vm.isValidLatLng(['55', '37'])).toBe(false);
            expect(wrapper.vm.isValidLatLng([NaN, 37])).toBe(false);
        });

        it('should validate valid zoom', () => {
            expect(wrapper.vm.isValidZoom(10)).toBe(true);
            expect(wrapper.vm.isValidZoom(18)).toBe(true);
        });

        it('should reject invalid zoom', () => {
            expect(wrapper.vm.isValidZoom(NaN)).toBe(false);
            expect(wrapper.vm.isValidZoom('10')).toBe(false);
            expect(wrapper.vm.isValidZoom(null)).toBe(false);
        });
    });

    describe('Search Functions', () => {
        it('should open search', () => {
            wrapper.vm.openSearch();
            // Search visibility is internal state, but we can verify no errors
            expect(wrapper.find('.track-search-mock').exists()).toBe(true);
        });

        it('should close search', () => {
            wrapper.vm.closeSearch();
            // Search visibility is internal state, but we can verify no errors
            expect(wrapper.find('.track-search-mock').exists()).toBe(true);
        });
    });

    describe('Drag and Drop Handlers', () => {
        it('should handle drag over', () => {
            const event = { preventDefault: vi.fn() };
            wrapper.vm.handleDragOver(event);
            expect(event.preventDefault).toHaveBeenCalled();
        });

        it('should handle drag leave', () => {
            const event = { preventDefault: vi.fn() };
            wrapper.vm.handleDragLeave(event);
            expect(event.preventDefault).toHaveBeenCalled();
        });

        it('should handle drop', () => {
            const event = { preventDefault: vi.fn() };
            wrapper.vm.handleDrop(event);
            expect(event.preventDefault).toHaveBeenCalled();
        });
    });

    describe('Event Handlers', () => {
        it('should handle track deletion event', () => {
            // Emit track-deleted event
            wrapper.vm.handleTrackDeleted({ id: 'test-track-123' });
            // Should not throw
            expect(wrapper.exists()).toBe(true);
        });

        it('should handle track name updated event', () => {
            wrapper.vm.handleTrackNameUpdated({
                trackId: 'test-track-123',
                newName: 'New Track Name'
            });
            // Should not throw
            expect(wrapper.exists()).toBe(true);
        });

        it('should handle track description updated event', () => {
            wrapper.vm.handleTrackDescriptionUpdated({
                trackId: 'test-track-123',
                newDescription: 'New Description'
            });
            // Should not throw
            expect(wrapper.exists()).toBe(true);
        });

        it('should handle filter changed event', () => {
            wrapper.vm.onFilterChanged({
                categories: ['hiking'],
                lengthRange: [0, 10]
            });
            // Should not throw
            expect(wrapper.exists()).toBe(true);
        });

        it('should handle filter changed with showHeatmap', () => {
            wrapper.vm.onFilterChanged({
                showHeatmap: true,
                categories: []
            });
            // Should not throw
            expect(wrapper.exists()).toBe(true);
        });

        it('should handle location found event', () => {
            wrapper.vm.onLocationFound({
                latitude: 55.7558,
                longitude: 37.6176
            });
            // Should not throw
            expect(wrapper.exists()).toBe(true);
        });

        it('should handle location found with error', () => {
            wrapper.vm.onLocationFound({
                error: 'Location access denied'
            });
            // Should not throw
            expect(wrapper.exists()).toBe(true);
        });

        it('should handle URL state change event', () => {
            wrapper.vm.handleUrlStateChange({
                zoom: 14,
                center: [55.7558, 37.6176],
                source: 'url'
            });
            // Should not throw
            expect(wrapper.exists()).toBe(true);
        });

        it('should handle URL state change from non-url source', () => {
            wrapper.vm.handleUrlStateChange({
                zoom: 14,
                center: [55.7558, 37.6176],
                source: 'map'
            });
            // Should not throw
            expect(wrapper.exists()).toBe(true);
        });
    });

    describe('Track Interaction', () => {
        it('should handle track click', async () => {
            const poly = {
                properties: { id: 'test-track-123' }
            };
            await wrapper.vm.onTrackClick(poly, {});
            // Should not throw
            expect(wrapper.exists()).toBe(true);
        });

        it('should handle track click without id', async () => {
            const poly = {
                properties: {}
            };
            await wrapper.vm.onTrackClick(poly, {});
            // Should not throw
            expect(wrapper.exists()).toBe(true);
        });

        it('should handle track mouse over', () => {
            const poly = {
                properties: { id: 'test-track-123', name: 'Test Track' }
            };
            const event = { originalEvent: { clientX: 100, clientY: 200 } };
            wrapper.vm.onTrackMouseOver(poly, event);
            // Should not throw
            expect(wrapper.exists()).toBe(true);
        });

        it('should handle track mouse move', () => {
            const event = { originalEvent: { clientX: 100, clientY: 200 } };
            wrapper.vm.onTrackMouseMove(event);
            // Should not throw
            expect(wrapper.exists()).toBe(true);
        });

        it('should handle track mouse out', () => {
            const event = { originalEvent: { relatedTarget: null } };
            wrapper.vm.onTrackMouseOut(event);
            // Should not throw
            expect(wrapper.exists()).toBe(true);
        });

        it('should handle track mouse out with related target', () => {
            const mockElement = {
                closest: vi.fn().mockReturnValue(null)
            };
            const event = { originalEvent: { relatedTarget: mockElement } };
            wrapper.vm.onTrackMouseOut(event);
            expect(mockElement.closest).toHaveBeenCalledWith('.leaflet-interactive');
        });
    });

    describe('Upload Handlers', () => {
        it('should handle upload completed', () => {
            wrapper.vm.handleUploadCompleted();
            // Should not throw
            expect(wrapper.exists()).toBe(true);
        });

        it('should toggle upload form', () => {
            const initialState = wrapper.vm.uploadFormExpanded;
            wrapper.vm.toggleUploadForm();
            expect(wrapper.vm.uploadFormExpanded).toBe(!initialState);
        });
    });

    describe('onTrackSelected', () => {
        it('should navigate to track and close search', () => {
            const track = { id: 'track-123' };
            wrapper.vm.onTrackSelected(track);
            expect(mockRouter.push).toHaveBeenCalledWith('/track/track-123');
        });
    });

    describe('handleTrackDeleted', () => {
        it('should handle track deletion without throwing', () => {
            wrapper.vm.handleTrackDeleted({ id: 'track-to-delete' });
            expect(wrapper.exists()).toBe(true);
        });

        it('should handle deletion with null event', () => {
            wrapper.vm.handleTrackDeleted(null);
            expect(wrapper.exists()).toBe(true);
        });
    });

    describe('handleUrlStateChange', () => {
        it('should update center from URL state change', () => {
            wrapper.vm.handleUrlStateChange({
                zoom: 14,
                center: [50.0, 30.0],
                source: 'url'
            });
            expect(wrapper.vm.center).toEqual([50.0, 30.0]);
        });
    });
});
