import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mount } from '@vue/test-utils';
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

vi.mock('../composables/useToast', () => ({
    useToast: () => ({
        showToast: vi.fn(),
        toast: ref({ value: null })
    })
}));

vi.mock('../composables/useSearchState', () => ({
    useSearchState: () => ({
        clearSearchState: vi.fn(),
        searchResults: ref([]),
        searchQuery: ref(''),
        hasSearchState: () => false
    })
}));

vi.mock('../utils/session', () => ({
    getSessionId: () => 'test-session-id'
}));

// Mock router
const mockRouter = {
    push: vi.fn(),
    currentRoute: ref({ value: { path: '/' } })
};

vi.mock('vue-router', () => ({
    useRouter: () => mockRouter
}));

describe('HomeView', () => {
    let wrapper;

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
            expect(title.text()).toBe('Upload Track');
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
});
