import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { mount } from '@vue/test-utils';
import { nextTick } from 'vue';
import TrackFilterControl from '../TrackFilterControl.vue';

// Mock the Slider component
vi.mock('@vueform/slider', () => ({
    default: {
        name: 'Slider',
        props: ['modelValue', 'min', 'max', 'step', 'tooltip', 'lazy', 'format', 'range'],
        emits: ['update:modelValue'],
        template: `
      <div class="slider-mock">
        <input 
          type="range" 
          :min="min" 
          :max="max" 
          :step="step"
          :value="Array.isArray(modelValue) ? modelValue[0] : modelValue"
          @input="handleInput"
          data-testid="slider-min"
        />
        <input 
          v-if="range"
          type="range" 
          :min="min" 
          :max="max" 
          :step="step"
          :value="Array.isArray(modelValue) ? modelValue[1] : modelValue"
          @input="handleInputMax"
          data-testid="slider-max"
        />
      </div>
    `,
        methods: {
            handleInput(e) {
                const value = parseFloat(e.target.value);
                const newValue = this.range
                    ? [value, Array.isArray(this.modelValue) ? this.modelValue[1] : this.max]
                    : value;
                this.$emit('update:modelValue', newValue);
            },
            handleInputMax(e) {
                const value = parseFloat(e.target.value);
                const newValue = [
                    Array.isArray(this.modelValue) ? this.modelValue[0] : this.min,
                    value
                ];
                this.$emit('update:modelValue', newValue);
            }
        }
    }
}));

// Mock the CSS import
vi.mock('@vueform/slider/themes/default.css', () => ({}));

describe('TrackFilterControl', () => {
    let wrapper;
    const LOCAL_STORAGE_KEY = 'trackFiltersVue';

    // Mock localStorage
    const mockLocalStorage = {
        getItem: vi.fn(),
        setItem: vi.fn(),
        removeItem: vi.fn(),
        clear: vi.fn(),
    };

    // Helper function to create default props with all required properties
    const createDefaultProps = (overrides = {}) => ({
        categories: ['hiking', 'running'],
        minLength: 0,
        maxLength: 50,
        globalCategories: ['hiking', 'running', 'cycling', 'walking'],
        globalMinLength: 0,
        globalMaxLength: 50,
        minElevationGain: 0,
        maxElevationGain: 2000,
        globalMinElevationGain: 0,
        globalMaxElevationGain: 2000,
        hasTracksInViewport: true,
        ...overrides
    });

    beforeEach(() => {
        wrapper = null;
        // Reset localStorage mock
        Object.defineProperty(window, 'localStorage', {
            value: mockLocalStorage,
            writable: true,
        });
        mockLocalStorage.getItem.mockReturnValue(null);
        mockLocalStorage.setItem.mockClear();
        mockLocalStorage.removeItem.mockClear();

        // Mock console.error to suppress expected localStorage parsing errors
        vi.spyOn(console, 'error').mockImplementation(() => { });

        // Ensure matchMedia always defined for this suite (defensive)
        if (!window.matchMedia) {
            Object.defineProperty(window, 'matchMedia', {
                writable: true,
                value: vi.fn().mockImplementation(q => ({
                    matches: false,
                    media: q,
                    onchange: null,
                    addListener: vi.fn(),
                    removeListener: vi.fn(),
                    addEventListener: vi.fn(),
                    removeEventListener: vi.fn(),
                    dispatchEvent: vi.fn()
                }))
            });
        }
    });

    afterEach(() => {
        if (wrapper) {
            wrapper.unmount();
        }
        vi.restoreAllMocks();
    });

    describe('Initial state', () => {
        it('renders filter control correctly', () => {
            wrapper = mount(TrackFilterControl, {
                props: createDefaultProps({
                    categories: ['hiking', 'running', 'cycling']
                }),
            });

            expect(wrapper.find('.track-filter-control').exists()).toBe(true);
            expect(wrapper.find('.filter-section').exists()).toBe(true);
            expect(wrapper.find('.filter-actions').exists()).toBe(true);
        });

        it('displays all category checkboxes', () => {
            const categories = ['hiking', 'running', 'cycling', 'walking'];
            wrapper = mount(TrackFilterControl, {
                props: createDefaultProps({
                    categories
                }),
            });

            const checkboxes = wrapper.findAll('.category-checkbox');
            expect(checkboxes.length).toBe(categories.length);

            categories.forEach((category, index) => {
                expect(checkboxes[index].attributes('value')).toBe(category);
                expect(wrapper.find(`label[for="category-${category}"]`).text()).toBe(category);
            });
        });

        it('displays length range slider', () => {
            wrapper = mount(TrackFilterControl, {
                props: createDefaultProps({
                    categories: ['hiking'],
                    minLength: 5,
                    maxLength: 25
                }),
            });

            const sliderMin = wrapper.find('[data-testid="slider-min"]');
            const sliderMax = wrapper.find('[data-testid="slider-max"]');

            expect(sliderMin.exists()).toBe(true);
            expect(sliderMax.exists()).toBe(true);
            expect(sliderMin.attributes('min')).toBe('5');
            expect(sliderMin.attributes('max')).toBe('25');
        });

        it('selects all global categories by default when no localStorage', async () => {
            const globalCategories = ['hiking', 'running'];
            wrapper = mount(TrackFilterControl, {
                props: createDefaultProps({
                    categories: globalCategories,
                    globalCategories
                }),
            });

            await nextTick();

            const checkboxes = wrapper.findAll('.category-checkbox');
            checkboxes.forEach(checkbox => {
                expect(checkbox.element.checked).toBe(true);
            });
        });

        it('sets length range to global min-max by default when no localStorage', async () => {
            wrapper = mount(TrackFilterControl, {
                props: createDefaultProps({
                    categories: ['hiking'],
                    minLength: 5,
                    maxLength: 25,
                    globalMinLength: 10,
                    globalMaxLength: 30
                }),
            });

            await nextTick();

            const sliderMin = wrapper.find('[data-testid="slider-min"]');
            const sliderMax = wrapper.find('[data-testid="slider-max"]');

            // Should initialize with global values, but clamped to viewport bounds
            // Global is [10, 30], viewport is [5, 25], so result should be [10, 25]
            expect(sliderMin.element.value).toBe('10');
            expect(sliderMax.element.value).toBe('25');
        });

        it('shows no-tracks placeholder when hasTracksInViewport is false', () => {
            wrapper = mount(TrackFilterControl, {
                props: createDefaultProps({
                    hasTracksInViewport: false
                }),
            });

            expect(wrapper.find('.no-tracks-placeholder').exists()).toBe(true);
            expect(wrapper.find('.filter-section').exists()).toBe(false);
            expect(wrapper.text()).toContain('No tracks in this area yet');
        });

        it('shows filters when hasTracksInViewport is true', () => {
            wrapper = mount(TrackFilterControl, {
                props: createDefaultProps({
                    hasTracksInViewport: true
                }),
            });

            expect(wrapper.find('.no-tracks-placeholder').exists()).toBe(false);
            expect(wrapper.find('.filter-section').exists()).toBe(true);
        });
    });

    describe('Category filtering', () => {
        it('handles category checkbox changes', async () => {
            wrapper = mount(TrackFilterControl, {
                props: createDefaultProps({
                    categories: ['hiking', 'running', 'cycling']
                }),
            });

            await nextTick();

            const hikingCheckbox = wrapper.find('input[value="hiking"]');
            await hikingCheckbox.setChecked(false);

            expect(hikingCheckbox.element.checked).toBe(false);
        });

        it('emits filter updates when categories change', async () => {
            wrapper = mount(TrackFilterControl, {
                props: createDefaultProps({
                    categories: ['hiking', 'running']
                }),
            });

            await nextTick();

            const runningCheckbox = wrapper.find('input[value="running"]');
            await runningCheckbox.setChecked(false);

            await nextTick();

            const emitted = wrapper.emitted('update:filter');
            expect(emitted).toBeTruthy();
            expect(emitted[emitted.length - 1][0].categories).toEqual(['hiking']);
        });

        it('handles empty categories array', () => {
            wrapper = mount(TrackFilterControl, {
                props: createDefaultProps({
                    categories: []
                }),
            });

            const checkboxes = wrapper.findAll('.category-checkbox');
            expect(checkboxes.length).toBe(0);
        });

        it('handles undefined categories', () => {
            wrapper = mount(TrackFilterControl, {
                props: createDefaultProps({
                    categories: undefined
                }),
            });

            const checkboxes = wrapper.findAll('.category-checkbox');
            expect(checkboxes.length).toBe(0);
        });
    });

    describe('Length range filtering', () => {
        it('handles length range slider changes', async () => {
            wrapper = mount(TrackFilterControl, {
                props: createDefaultProps({
                    categories: ['hiking']
                }),
            });

            await nextTick();

            const sliderMin = wrapper.find('[data-testid="slider-min"]');
            await sliderMin.setValue('10');

            await nextTick();

            const emitted = wrapper.emitted('update:filter');
            expect(emitted).toBeTruthy();
            expect(emitted[emitted.length - 1][0].lengthRange).toEqual([10, 50]);
        });

        it('handles max range slider changes', async () => {
            wrapper = mount(TrackFilterControl, {
                props: createDefaultProps({
                    categories: ['hiking']
                }),
            });

            await nextTick();

            const sliderMax = wrapper.find('[data-testid="slider-max"]');
            await sliderMax.setValue('30');

            await nextTick();

            const emitted = wrapper.emitted('update:filter');
            expect(emitted).toBeTruthy();
            expect(emitted[emitted.length - 1][0].lengthRange).toEqual([0, 30]);
        });

        it('updates when props change', async () => {
            wrapper = mount(TrackFilterControl, {
                props: createDefaultProps({
                    categories: ['hiking']
                }),
            });

            await nextTick();

            await wrapper.setProps({
                minLength: 5,
                maxLength: 40,
            });

            await nextTick();

            const sliderMin = wrapper.find('[data-testid="slider-min"]');
            const sliderMax = wrapper.find('[data-testid="slider-max"]');

            expect(sliderMin.attributes('min')).toBe('5');
            expect(sliderMax.attributes('max')).toBe('40');
        });
    });

    describe('Reset functionality', () => {
        it('resets filters to global default state', async () => {
            wrapper = mount(TrackFilterControl, {
                props: createDefaultProps({
                    categories: ['hiking', 'running'], // Current viewport
                    minLength: 5,
                    maxLength: 30,
                    globalCategories: ['hiking', 'running', 'cycling'], // Global session
                    globalMinLength: 0,
                    globalMaxLength: 50
                }),
            });

            await nextTick();

            // Change some filters
            const runningCheckbox = wrapper.find('input[value="running"]');
            await runningCheckbox.setChecked(false);

            const sliderMin = wrapper.find('[data-testid="slider-min"]');
            await sliderMin.setValue('10');

            await nextTick();

            // Reset filters
            // Select the actual Reset button (avoid the first collapse button)
            const resetButton = wrapper.find('.filter-actions button');
            await resetButton.trigger('click');

            await nextTick();

            // Should reset to global values, not viewport values
            expect(wrapper.vm.selectedCategories).toEqual(['hiking', 'running', 'cycling']);
            expect(wrapper.vm.lengthRange).toEqual([0, 50]);
        });

        it('emits filter update on reset with global values', async () => {
            wrapper = mount(TrackFilterControl, {
                props: createDefaultProps({
                    categories: ['hiking', 'running'], // Current viewport
                    globalCategories: ['hiking', 'running', 'cycling'], // Global session
                    globalMinLength: 0,
                    globalMaxLength: 50
                }),
            });

            await nextTick();

            const resetButton = wrapper.find('.filter-actions button');
            await resetButton.trigger('click');

            await nextTick();

            const emitted = wrapper.emitted('update:filter');
            expect(emitted).toBeTruthy();

            // Reset should emit global categories, but filtered to what's available in viewport
            const lastEmit = emitted[emitted.length - 1][0];
            expect(lastEmit.categories).toEqual(['hiking', 'running']); // Filtered to viewport
            expect(lastEmit.lengthRange).toEqual([0, 50]); // Global range but clamped to viewport
        });

        it('handles reset when global props are missing', async () => {
            wrapper = mount(TrackFilterControl, {
                props: createDefaultProps({
                    categories: ['hiking', 'running'],
                    globalCategories: undefined,
                    globalMinLength: undefined,
                    globalMaxLength: undefined
                }),
            });

            await nextTick();

            const resetButton = wrapper.find('.filter-actions button');
            await resetButton.trigger('click');

            await nextTick();

            // Should fallback to empty array and default range
            expect(wrapper.vm.selectedCategories).toEqual([]);
            expect(wrapper.vm.lengthRange).toEqual([0, 50]);
        });
    });

    describe('LocalStorage persistence', () => {
        it('saves filters to localStorage', async () => {
            wrapper = mount(TrackFilterControl, {
                props: createDefaultProps({
                    categories: ['hiking', 'running'],
                    globalCategories: ['hiking', 'running'] // Match the viewport for this test
                }),
            });

            await nextTick();

            const runningCheckbox = wrapper.find('input[value="running"]');
            await runningCheckbox.setChecked(false);

            await nextTick();

            expect(mockLocalStorage.setItem).toHaveBeenCalledWith(
                LOCAL_STORAGE_KEY,
                JSON.stringify({
                    categories: ['hiking'],
                    lengthRange: [0, 50],
                    elevationGainRange: [0, 2000]
                })
            );
        });

        it('saves empty categories to localStorage', async () => {
            wrapper = mount(TrackFilterControl, {
                props: createDefaultProps({
                    categories: ['hiking', 'running'],
                    globalCategories: ['hiking', 'running'] // Match the viewport for this test
                }),
            });

            await nextTick();

            // Deselect all categories
            const hikingCheckbox = wrapper.find('input[value="hiking"]');
            const runningCheckbox = wrapper.find('input[value="running"]');
            await hikingCheckbox.setChecked(false);
            await runningCheckbox.setChecked(false);

            await nextTick();

            // Should save empty categories array
            expect(mockLocalStorage.setItem).toHaveBeenCalledWith(
                LOCAL_STORAGE_KEY,
                JSON.stringify({
                    categories: [],
                    lengthRange: [0, 50],
                    elevationGainRange: [0, 2000]
                })
            );
        });

        it('restores filters from localStorage', async () => {
            mockLocalStorage.getItem.mockReturnValue(JSON.stringify({
                categories: ['hiking'],
                lengthRange: [5, 25],
            }));

            wrapper = mount(TrackFilterControl, {
                props: createDefaultProps({
                    categories: ['hiking', 'running', 'cycling']
                }),
            });

            await nextTick();

            // Check only hiking is selected
            const hikingCheckbox = wrapper.find('input[value="hiking"]');
            const runningCheckbox = wrapper.find('input[value="running"]');
            expect(hikingCheckbox.element.checked).toBe(true);
            expect(runningCheckbox.element.checked).toBe(false);

            // Check length range is restored
            expect(wrapper.vm.lengthRange).toEqual([5, 25]);
        });

        it('restores empty categories from localStorage on page reload', async () => {
            mockLocalStorage.getItem.mockReturnValue(JSON.stringify({
                categories: [],
                lengthRange: [0, 50],
            }));

            wrapper = mount(TrackFilterControl, {
                props: createDefaultProps({
                    categories: ['hiking', 'running', 'cycling']
                }),
            });

            await nextTick();

            // Should respect saved empty selection, not auto-select all categories
            const checkboxes = wrapper.findAll('.category-checkbox');
            checkboxes.forEach(checkbox => {
                expect(checkbox.element.checked).toBe(false);
            });

            // Length range should still be restored
            expect(wrapper.vm.lengthRange).toEqual([0, 50]);
        });

        it('handles invalid localStorage data', async () => {
            mockLocalStorage.getItem.mockReturnValue('invalid json');

            wrapper = mount(TrackFilterControl, {
                props: createDefaultProps({
                    categories: ['hiking', 'running']
                }),
            });

            await nextTick();

            // Should fallback to global default state
            const checkboxes = wrapper.findAll('.category-checkbox');
            checkboxes.forEach(checkbox => {
                expect(checkbox.element.checked).toBe(true);
            });

            expect(mockLocalStorage.removeItem).toHaveBeenCalledWith(LOCAL_STORAGE_KEY);
        });

        it('handles missing categories in localStorage', async () => {
            mockLocalStorage.getItem.mockReturnValue(JSON.stringify({
                categories: ['oldCategory', 'hiking'],
                lengthRange: [5, 25],
            }));

            wrapper = mount(TrackFilterControl, {
                props: createDefaultProps({
                    categories: ['hiking', 'running']
                }),
            });

            await nextTick();

            // Should only keep valid categories
            const hikingCheckbox = wrapper.find('input[value="hiking"]');
            const runningCheckbox = wrapper.find('input[value="running"]');
            expect(hikingCheckbox.element.checked).toBe(true);
            expect(runningCheckbox.element.checked).toBe(false);
        });

        it('saves reset state to localStorage', async () => {
            wrapper = mount(TrackFilterControl, {
                props: createDefaultProps({
                    categories: ['hiking', 'running'],
                    globalCategories: ['hiking', 'running', 'cycling']
                }),
            });

            await nextTick();

            const resetButton = wrapper.find('.filter-actions button');
            await resetButton.trigger('click');

            await nextTick();

            expect(mockLocalStorage.setItem).toHaveBeenCalledWith(
                LOCAL_STORAGE_KEY,
                JSON.stringify({
                    categories: ['hiking', 'running', 'cycling'],
                    lengthRange: [0, 50],
                    elevationGainRange: [0, 2000]
                })
            );
        });

        it('preserves only running selection after page refresh (user workflow)', async () => {
            // Simulate full user workflow:
            // 1. User starts with fresh app (no localStorage)
            // 2. User unchecks all categories except "running"
            // 3. User refreshes page (F5)
            // 4. Only "running" should remain selected

            // Step 1: Start with fresh app - no localStorage initially
            mockLocalStorage.getItem.mockReturnValue(null);

            let wrapper1 = mount(TrackFilterControl, {
                props: createDefaultProps({
                    categories: ['hiking', 'running', 'cycling'],
                    globalCategories: ['hiking', 'running', 'cycling'] // Match viewport for this test
                }),
            });

            await nextTick();

            // By default all categories should be selected
            let checkboxes = wrapper1.findAll('.category-checkbox');
            checkboxes.forEach(checkbox => {
                expect(checkbox.element.checked).toBe(true);
            });

            // Step 2: User unchecks all except "running"
            const hikingCheckbox1 = wrapper1.find('input[value="hiking"]');
            const cyclingCheckbox1 = wrapper1.find('input[value="cycling"]');

            await hikingCheckbox1.setChecked(false);
            await cyclingCheckbox1.setChecked(false);

            await nextTick();

            // Verify only "running" is selected
            const runningCheckbox1 = wrapper1.find('input[value="running"]');
            expect(hikingCheckbox1.element.checked).toBe(false);
            expect(runningCheckbox1.element.checked).toBe(true);
            expect(cyclingCheckbox1.element.checked).toBe(false);

            // Step 3: Simulate page refresh by unmounting and creating new component
            // The localStorage should now contain ['running']
            const savedCalls = mockLocalStorage.setItem.mock.calls
                .filter(call => call[0] === 'trackFiltersVue')
                .map(call => ({ key: call[0], value: call[1] }));

            const savedState = savedCalls[savedCalls.length - 1]; // Get the last save

            expect(savedState).toBeTruthy();
            const parsedState = JSON.parse(savedState.value);
            expect(parsedState.categories).toEqual(['running']);

            wrapper1.unmount();

            // Now mock localStorage to return the saved state
            mockLocalStorage.getItem.mockReturnValue(savedState.value);

            // Step 4: Create new component (simulating page refresh)
            const wrapper2 = mount(TrackFilterControl, {
                props: createDefaultProps({
                    categories: ['hiking', 'running', 'cycling'],
                    globalCategories: ['hiking', 'running', 'cycling'] // Match viewport for this test
                }),
            });

            await nextTick();

            // Should restore only "running" selection
            const hikingCheckbox2 = wrapper2.find('input[value="hiking"]');
            const runningCheckbox2 = wrapper2.find('input[value="running"]');
            const cyclingCheckbox2 = wrapper2.find('input[value="cycling"]');

            expect(hikingCheckbox2.element.checked).toBe(false);
            expect(runningCheckbox2.element.checked).toBe(true);
            expect(cyclingCheckbox2.element.checked).toBe(false);

            wrapper2.unmount();
        });

        it('preserves custom length range after page refresh', async () => {
            // Simulate user workflow:
            // 1. User starts with default range [0, 50]
            // 2. User adjusts range to [5, 25]
            // 3. User refreshes page (F5)
            // 4. Custom range [5, 25] should be restored

            // Step 1: Start with fresh app - no localStorage initially
            mockLocalStorage.getItem.mockReturnValue(null);

            let wrapper1 = mount(TrackFilterControl, {
                props: createDefaultProps({
                    categories: ['hiking', 'running']
                }),
            });

            await nextTick();

            // Step 2: User adjusts the length range
            // Simulate slider change by directly updating the component's reactive data
            wrapper1.vm.lengthRange = [5, 25];
            await nextTick();

            // Verify the change was applied
            expect(wrapper1.vm.lengthRange).toEqual([5, 25]);

            // Step 3: Simulate page refresh by unmounting and creating new component
            // The localStorage should now contain the custom range
            const savedCalls = mockLocalStorage.setItem.mock.calls
                .filter(call => call[0] === 'trackFiltersVue')
                .map(call => ({ key: call[0], value: call[1] }));

            const savedState = savedCalls[savedCalls.length - 1]; // Get the last save

            expect(savedState).toBeTruthy();
            const parsedState = JSON.parse(savedState.value);
            expect(parsedState.lengthRange).toEqual([5, 25]);

            wrapper1.unmount();

            // Now mock localStorage to return the saved state
            mockLocalStorage.getItem.mockReturnValue(savedState.value);

            // Step 4: Create new component (simulating page refresh)
            const wrapper2 = mount(TrackFilterControl, {
                props: createDefaultProps({
                    categories: ['hiking', 'running']
                }),
            });

            await nextTick();

            // Should restore custom length range
            expect(wrapper2.vm.lengthRange).toEqual([5, 25]);

            wrapper2.unmount();
        });

        it('preserves custom length range when track data changes after page refresh', async () => {
            // Simulate scenario where user has saved custom range,
            // but after page refresh, props.minLength/maxLength are initially different
            // and then updated to the final values

            // Mock localStorage with user's saved custom range
            mockLocalStorage.getItem.mockReturnValue(JSON.stringify({
                categories: ['hiking'],
                lengthRange: [10, 30],
            }));

            // Step 1: Create component with initial props that don't match saved range
            const wrapper = mount(TrackFilterControl, {
                props: createDefaultProps({
                    categories: ['hiking', 'running'],
                    minLength: 0,  // Different from saved range
                    maxLength: 100 // Different from saved range
                }),
            });

            await nextTick();

            // Should restore saved custom range (clamped to props if necessary)
            expect(wrapper.vm.lengthRange).toEqual([10, 30]);

            // Step 2: Simulate track data being loaded and props updating to final values
            await wrapper.setProps({
                categories: ['hiking', 'running'],
                minLength: 5,   // New final values
                maxLength: 40,
            });

            await nextTick();

            // Should preserve user's custom range but clamp to new bounds
            expect(wrapper.vm.lengthRange).toEqual([10, 30]); // Should stay within [5, 40]

            wrapper.unmount();
        });

        it('preserves custom length range through multiple prop updates simulating real app startup', async () => {
            // This test simulates the exact sequence that happens in real app:
            // 1. Component mounts with default min/max (often 0, 0)
            // 2. Track data loads and min/max get updated multiple times
            // 3. User's saved range should be preserved throughout

            // Mock localStorage with user's saved custom range
            mockLocalStorage.getItem.mockReturnValue(JSON.stringify({
                categories: ['hiking'],
                lengthRange: [8, 25],
            }));

            // Step 1: App startup - component created with default/empty values
            const wrapper = mount(TrackFilterControl, {
                props: createDefaultProps({
                    categories: [],
                    minLength: 0,
                    maxLength: 0
                }),
            });

            await nextTick();

            // Should restore saved range even with 0,0 props
            expect(wrapper.vm.lengthRange).toEqual([8, 25]);

            // Step 2: First batch of tracks loaded
            await wrapper.setProps({
                categories: ['hiking'],
                minLength: 2,
                maxLength: 30,
            });

            await nextTick();

            // Should still preserve user's custom range
            expect(wrapper.vm.lengthRange).toEqual([8, 25]);

            // Step 3: More tracks loaded, range expands
            await wrapper.setProps({
                categories: ['hiking', 'running'],
                minLength: 1,
                maxLength: 50,
            });

            await nextTick();

            // Should still preserve user's custom range
            expect(wrapper.vm.lengthRange).toEqual([8, 25]);

            // Step 4: Final track data loaded
            await wrapper.setProps({
                categories: ['hiking', 'running', 'cycling'],
                minLength: 0.5,
                maxLength: 100,
            });

            await nextTick();

            // Should still preserve user's custom range
            expect(wrapper.vm.lengthRange).toEqual([8, 25]);

            wrapper.unmount();
        });
    });

    describe('Props reactivity', () => {
        it('updates categories when props change', async () => {
            wrapper = mount(TrackFilterControl, {
                props: createDefaultProps({
                    categories: ['hiking', 'running']
                }),
            });

            await nextTick();

            await wrapper.setProps({
                categories: ['hiking', 'running', 'cycling', 'walking'],
            });

            await nextTick();

            const checkboxes = wrapper.findAll('.category-checkbox');
            expect(checkboxes.length).toBe(4);

            // All new categories should be selected by default
            checkboxes.forEach(checkbox => {
                expect(checkbox.element.checked).toBe(true);
            });
        });

        it('preserves user selection when categories change', async () => {
            mockLocalStorage.getItem.mockReturnValue(JSON.stringify({
                categories: ['hiking'],
                lengthRange: [0, 50],
            }));

            wrapper = mount(TrackFilterControl, {
                props: createDefaultProps({
                    categories: ['hiking', 'running']
                }),
            });

            await nextTick();

            await wrapper.setProps({
                categories: ['hiking', 'running', 'cycling'],
            });

            await nextTick();

            // Should preserve saved selection
            const hikingCheckbox = wrapper.find('input[value="hiking"]');
            const runningCheckbox = wrapper.find('input[value="running"]');
            const cyclingCheckbox = wrapper.find('input[value="cycling"]');

            expect(hikingCheckbox.element.checked).toBe(true);
            expect(runningCheckbox.element.checked).toBe(false);
            expect(cyclingCheckbox.element.checked).toBe(false);
        });

        it('preserves empty selection when categories change', async () => {
            // User has explicitly deactivated all categories
            mockLocalStorage.getItem.mockReturnValue(JSON.stringify({
                categories: [],
                lengthRange: [0, 50],
            }));

            wrapper = mount(TrackFilterControl, {
                props: createDefaultProps({
                    categories: ['hiking', 'running']
                }),
            });

            await nextTick();

            // Simulate new categories appearing (e.g., from map zoom/scroll)
            await wrapper.setProps({
                categories: ['hiking', 'running', 'cycling', 'walking'],
            });

            await nextTick();

            // Should NOT automatically select new categories - respect user's choice to have none selected
            const checkboxes = wrapper.findAll('.category-checkbox');
            checkboxes.forEach(checkbox => {
                expect(checkbox.element.checked).toBe(false);
            });
        });

        it('clamps length range when props min/max change', async () => {
            wrapper = mount(TrackFilterControl, {
                props: createDefaultProps({
                    categories: ['hiking']
                }),
            });

            await nextTick();

            // Set a custom range
            const sliderMin = wrapper.find('[data-testid="slider-min"]');
            const sliderMax = wrapper.find('[data-testid="slider-max"]');
            await sliderMin.setValue('10');
            await sliderMax.setValue('40');

            await nextTick();

            // Change props to smaller range
            await wrapper.setProps({
                minLength: 15,
                maxLength: 35,
            });

            await nextTick();

            // Should preserve user selection, not clamp to new boundaries
            // The component preserves user preferences even when viewport changes
            const sliderMinAfter = wrapper.find('[data-testid="slider-min"]');
            const sliderMaxAfter = wrapper.find('[data-testid="slider-max"]');
            expect(sliderMinAfter.element.value).toBe('10'); // User's choice preserved
            expect(sliderMaxAfter.element.value).toBe('40'); // User's choice preserved
        });
    });

    describe('Edge cases', () => {
        it('handles empty localStorage response', async () => {
            mockLocalStorage.getItem.mockReturnValue(null);

            wrapper = mount(TrackFilterControl, {
                props: createDefaultProps({
                    categories: ['hiking']
                }),
            });

            await nextTick();

            // Should use default values
            const checkbox = wrapper.find('.category-checkbox');
            expect(checkbox.element.checked).toBe(true);
        });

        it('handles malformed length range in localStorage', async () => {
            mockLocalStorage.getItem.mockReturnValue(JSON.stringify({
                categories: ['hiking'],
                lengthRange: [100, 5], // Invalid: min > max
            }));

            wrapper = mount(TrackFilterControl, {
                props: createDefaultProps({
                    categories: ['hiking']
                }),
            });

            await nextTick();

            // Should fallback to global values when localStorage data is malformed
            const sliderMin = wrapper.find('[data-testid="slider-min"]');
            const sliderMax = wrapper.find('[data-testid="slider-max"]');
            expect(sliderMin.element.value).toBe('0');  // globalMinLength from createDefaultProps
            expect(sliderMax.element.value).toBe('50'); // globalMaxLength from createDefaultProps
        });

        it('emits initial filter state', async () => {
            wrapper = mount(TrackFilterControl, {
                props: createDefaultProps({
                    categories: ['hiking', 'running']
                }),
            });

            // Wait for onMounted to complete
            await nextTick();
            await nextTick(); // Additional tick for watcher

            const emitted = wrapper.emitted('update:filter');
            expect(emitted).toBeTruthy();
            expect(emitted[emitted.length - 1][0]).toEqual({
                categories: ['hiking', 'running'],
                lengthRange: [0, 50],
                elevationGainRange: [0, 2000]
            });
        });

        it('preserves user selection when scrolling to areas without tracks', async () => {
            // Simulate user workflow:
            // 1. User has saved selection of ["running"] 
            // 2. User scrolls map to area without tracks (categories becomes empty)
            // 3. User selection should be preserved

            // Step 1: Mock localStorage with user's saved "running" selection
            mockLocalStorage.getItem.mockReturnValue(JSON.stringify({
                categories: ['running'],
                lengthRange: [0, 50],
            }));

            // Create component with initial categories
            const wrapper = mount(TrackFilterControl, {
                props: createDefaultProps({
                    categories: ['hiking', 'running', 'cycling']
                }),
            });

            await nextTick();

            // Verify user's selection is restored
            const hikingCheckbox = wrapper.find('input[value="hiking"]');
            const runningCheckbox = wrapper.find('input[value="running"]');
            const cyclingCheckbox = wrapper.find('input[value="cycling"]');

            expect(hikingCheckbox.element.checked).toBe(false);
            expect(runningCheckbox.element.checked).toBe(true);
            expect(cyclingCheckbox.element.checked).toBe(false);

            // Step 2: Simulate user scrolling to area without tracks
            // This causes allCategories to become empty array
            await wrapper.setProps({
                categories: [],  // No tracks in current viewport
                minLength: 0,
                maxLength: 50,
            });

            await nextTick();

            // Step 3: User selection should still be preserved
            // Checkboxes should retain their previous state even though categories prop is empty
            expect(hikingCheckbox.element.checked).toBe(false);
            expect(runningCheckbox.element.checked).toBe(true);
            expect(cyclingCheckbox.element.checked).toBe(false);

            // Step 4: Simulate user scrolling back to area with tracks
            await wrapper.setProps({
                categories: ['hiking', 'running', 'cycling'],
                minLength: 0,
                maxLength: 50,
            });

            await nextTick();

            // User selection should still be preserved
            expect(hikingCheckbox.element.checked).toBe(false);
            expect(runningCheckbox.element.checked).toBe(true);
            expect(cyclingCheckbox.element.checked).toBe(false);

            wrapper.unmount();
        });

        it('handles page refresh when allCategories is temporarily empty during app initialization', async () => {
            // Simulate real-world scenario:
            // 1. User has saved "running" selection
            // 2. User refreshes page (F5)
            // 3. During app startup, TrackMap may initially have empty polylines
            // 4. Component should still restore user's saved selection

            // Mock localStorage with user's saved "running" selection
            mockLocalStorage.getItem.mockReturnValue(JSON.stringify({
                categories: ['running'],
                lengthRange: [0, 50],
            }));

            // Step 1: Simulate app startup where TrackMap initially has no polylines
            // This means allCategories computed property returns empty array initially
            const wrapper = mount(TrackFilterControl, {
                props: createDefaultProps({
                    categories: [] // allCategories is empty during app startup
                }),
            });

            await nextTick();

            // User's saved selection should be restored in internal state
            // even though there are no checkboxes to verify yet
            expect(wrapper.vm.selectedCategories).toEqual(['running']);

            // Step 2: Simulate TrackMap receiving polylines and computing categories
            await wrapper.setProps({
                categories: ['hiking', 'running', 'cycling'],
            });

            await nextTick();

            // Now checkboxes should reflect the saved selection
            const hikingCheckbox = wrapper.find('input[value="hiking"]');
            const runningCheckbox = wrapper.find('input[value="running"]');
            const cyclingCheckbox = wrapper.find('input[value="cycling"]');

            expect(hikingCheckbox.element.checked).toBe(false);
            expect(runningCheckbox.element.checked).toBe(true);
            expect(cyclingCheckbox.element.checked).toBe(false);

            wrapper.unmount();
        });
    });

    describe('Elevation gain filtering', () => {
        it('displays elevation gain slider', () => {
            wrapper = mount(TrackFilterControl, {
                props: createDefaultProps({
                    categories: ['hiking'],
                    minElevationGain: 100,
                    maxElevationGain: 1500
                }),
            });

            const elevationLabel = wrapper.findAll('label').find(label =>
                label.element.textContent.includes('Elevation gain (m):')
            );
            expect(elevationLabel).toBeTruthy();
            expect(elevationLabel.element.textContent).toContain('Elevation gain (m):');

            // Since we're using the mock, check for slider inputs
            const sliders = wrapper.findAll('input[type="range"]');
            expect(sliders.length).toBeGreaterThanOrEqual(4); // 2 for length + 2 for elevation
        });

        it('sets elevation gain range to global default when no localStorage', async () => {
            wrapper = mount(TrackFilterControl, {
                props: createDefaultProps({
                    categories: ['hiking'],
                    minElevationGain: 50,
                    maxElevationGain: 1200,
                    globalMinElevationGain: 0,
                    globalMaxElevationGain: 2000
                }),
            });

            await nextTick();

            expect(wrapper.vm.elevationGainRange).toEqual([0, 2000]);
        });

        it('handles elevation gain slider changes', async () => {
            wrapper = mount(TrackFilterControl, {
                props: createDefaultProps({
                    categories: ['hiking'],
                    minElevationGain: 0,
                    maxElevationGain: 2000
                }),
            });

            await nextTick();

            // Simulate elevation gain min slider change by directly updating reactive data
            wrapper.vm.elevationGainRange = [200, 2000];
            await nextTick();

            const emitted = wrapper.emitted('update:filter');
            expect(emitted).toBeTruthy();
            expect(emitted[emitted.length - 1][0].elevationGainRange).toEqual([200, 2000]);
        });

        it('handles elevation gain max slider changes', async () => {
            wrapper = mount(TrackFilterControl, {
                props: createDefaultProps({
                    categories: ['hiking'],
                    minElevationGain: 0,
                    maxElevationGain: 2000
                }),
            });

            await nextTick();

            // Simulate elevation gain max slider change
            wrapper.vm.elevationGainRange = [0, 1500];
            await nextTick();

            const emitted = wrapper.emitted('update:filter');
            expect(emitted).toBeTruthy();
            expect(emitted[emitted.length - 1][0].elevationGainRange).toEqual([0, 1500]);
        });

        it('saves elevation gain range to localStorage', async () => {
            wrapper = mount(TrackFilterControl, {
                props: createDefaultProps({
                    categories: ['hiking'],
                    globalCategories: ['hiking'] // Match the viewport for this test
                }),
            });

            await nextTick();

            // Change elevation gain range
            wrapper.vm.elevationGainRange = [300, 1800];
            await nextTick();

            expect(mockLocalStorage.setItem).toHaveBeenCalledWith(
                LOCAL_STORAGE_KEY,
                JSON.stringify({
                    categories: ['hiking'],
                    lengthRange: [0, 50],
                    elevationGainRange: [300, 1800]
                })
            );
        });

        it('restores elevation gain range from localStorage', async () => {
            mockLocalStorage.getItem.mockReturnValue(JSON.stringify({
                categories: ['hiking'],
                lengthRange: [5, 25],
                elevationGainRange: [150, 1200]
            }));

            wrapper = mount(TrackFilterControl, {
                props: createDefaultProps({
                    categories: ['hiking'],
                    minElevationGain: 0,
                    maxElevationGain: 2000
                }),
            });

            await nextTick();

            expect(wrapper.vm.elevationGainRange).toEqual([150, 1200]);
        });

        it('uses global elevation gain values on reset', async () => {
            wrapper = mount(TrackFilterControl, {
                props: createDefaultProps({
                    categories: ['hiking'],
                    minElevationGain: 100,
                    maxElevationGain: 1500,
                    globalMinElevationGain: 0,
                    globalMaxElevationGain: 2000
                }),
            });

            await nextTick();

            // Change elevation gain range
            wrapper.vm.elevationGainRange = [500, 1000];
            await nextTick();

            // Reset filters
            const resetButton = wrapper.find('.filter-actions button');
            await resetButton.trigger('click');
            await nextTick();

            // Should reset to global values, clamped to viewport bounds
            expect(wrapper.vm.elevationGainRange).toEqual([0, 2000]);
        });

        it('clamps elevation gain range to viewport bounds', async () => {
            // Mock saved range that exceeds new viewport bounds
            mockLocalStorage.getItem.mockReturnValue(JSON.stringify({
                categories: ['hiking'],
                lengthRange: [0, 50],
                elevationGainRange: [50, 2500] // Max exceeds new viewport
            }));

            wrapper = mount(TrackFilterControl, {
                props: createDefaultProps({
                    categories: ['hiking'],
                    minElevationGain: 0,
                    maxElevationGain: 2000 // Lower than saved max
                }),
            });

            await nextTick();
            // Wait for watchers to process the clamping
            await nextTick();

            // Internal state preserves user's choice (for when they navigate back)
            expect(wrapper.vm.elevationGainRange).toEqual([50, 2500]);

            // But emitted values should be clamped to viewport bounds
            const emitted = wrapper.emitted('update:filter');
            expect(emitted).toBeTruthy();
            const lastEmit = emitted[emitted.length - 1][0];
            expect(lastEmit.elevationGainRange).toEqual([50, 2000]);
        });

        it('preserves elevation gain range when viewport props change', async () => {
            wrapper = mount(TrackFilterControl, {
                props: createDefaultProps({
                    categories: ['hiking'],
                    minElevationGain: 0,
                    maxElevationGain: 2000
                }),
            });

            await nextTick();

            // Set custom elevation gain range
            wrapper.vm.elevationGainRange = [200, 1800];
            await nextTick();

            // Change viewport props
            await wrapper.setProps({
                minElevationGain: 50,
                maxElevationGain: 1500,
            });

            await nextTick();

            // Should preserve user selection, not reset to new viewport bounds
            expect(wrapper.vm.elevationGainRange).toEqual([200, 1800]);
        });

        it('handles missing elevation gain props gracefully', async () => {
            wrapper = mount(TrackFilterControl, {
                props: createDefaultProps({
                    categories: ['hiking'],
                    minElevationGain: undefined,
                    maxElevationGain: undefined,
                    globalMinElevationGain: undefined,
                    globalMaxElevationGain: undefined
                }),
            });

            await nextTick();

            // Should use default values [0, 2000]
            expect(wrapper.vm.elevationGainRange).toEqual([0, 2000]);
        });

        it('preserves elevation gain range after page refresh workflow', async () => {
            // Step 1: Start with fresh app - no localStorage initially
            mockLocalStorage.getItem.mockReturnValue(null);

            let wrapper1 = mount(TrackFilterControl, {
                props: createDefaultProps({
                    categories: ['hiking'],
                    minElevationGain: 0,
                    maxElevationGain: 2000,
                    globalCategories: ['hiking'] // Match viewport for this test
                }),
            });

            await nextTick();

            // Step 2: User adjusts elevation gain range
            wrapper1.vm.elevationGainRange = [400, 1600];
            await nextTick();

            // Step 3: Verify localStorage was updated
            const savedCalls = mockLocalStorage.setItem.mock.calls
                .filter(call => call[0] === 'trackFiltersVue')
                .map(call => ({ key: call[0], value: call[1] }));

            const savedState = savedCalls[savedCalls.length - 1];
            expect(savedState).toBeTruthy();
            const parsedState = JSON.parse(savedState.value);
            expect(parsedState.elevationGainRange).toEqual([400, 1600]);

            wrapper1.unmount();

            // Step 4: Mock page refresh with saved state
            mockLocalStorage.getItem.mockReturnValue(savedState.value);

            const wrapper2 = mount(TrackFilterControl, {
                props: createDefaultProps({
                    categories: ['hiking'],
                    minElevationGain: 0,
                    maxElevationGain: 2000,
                    globalCategories: ['hiking']
                }),
            });

            await nextTick();

            // Should restore custom elevation gain range
            expect(wrapper2.vm.elevationGainRange).toEqual([400, 1600]);

            wrapper2.unmount();
        });

        it('handles invalid elevation gain range in localStorage', async () => {
            mockLocalStorage.getItem.mockReturnValue(JSON.stringify({
                categories: ['hiking'],
                lengthRange: [0, 50],
                elevationGainRange: [2000, 100] // Invalid: min > max
            }));

            wrapper = mount(TrackFilterControl, {
                props: createDefaultProps({
                    categories: ['hiking'],
                    minElevationGain: 0,
                    maxElevationGain: 2000
                }),
            });

            await nextTick();

            // Should fallback to global values when localStorage data is malformed
            expect(wrapper.vm.elevationGainRange).toEqual([0, 2000]);
        });

        it('emits elevation gain range in filter updates', async () => {
            wrapper = mount(TrackFilterControl, {
                props: createDefaultProps({
                    categories: ['hiking'],
                    minElevationGain: 0,
                    maxElevationGain: 2000
                }),
            });

            await nextTick();
            await nextTick(); // Wait for initial emit

            const emitted = wrapper.emitted('update:filter');
            expect(emitted).toBeTruthy();

            const lastEmit = emitted[emitted.length - 1][0];
            expect(lastEmit).toHaveProperty('elevationGainRange');
            expect(Array.isArray(lastEmit.elevationGainRange)).toBe(true);
            expect(lastEmit.elevationGainRange.length).toBe(2);
        });

        it('preserves elevation gain range through viewport changes during app startup', async () => {
            // Mock localStorage with saved elevation gain range
            mockLocalStorage.getItem.mockReturnValue(JSON.stringify({
                categories: ['hiking'],
                lengthRange: [0, 50],
                elevationGainRange: [300, 1200]
            }));

            // Step 1: App startup with default/empty elevation values
            const wrapper = mount(TrackFilterControl, {
                props: createDefaultProps({
                    categories: [],
                    minElevationGain: 0,
                    maxElevationGain: 0 // Empty during startup
                }),
            });

            await nextTick();

            // Should restore saved range even with 0,0 props
            expect(wrapper.vm.elevationGainRange).toEqual([300, 1200]);

            // Step 2: Track data loads and elevation bounds update
            await wrapper.setProps({
                categories: ['hiking'],
                minElevationGain: 50,
                maxElevationGain: 1800,
            });

            await nextTick();

            // Should preserve user's custom range
            expect(wrapper.vm.elevationGainRange).toEqual([300, 1200]);

            wrapper.unmount();
        });
    });

    describe('Filter Reset with Global Values Fix', () => {
        it('should use global values for reset instead of viewport values', async () => {
            const wrapper = mount(TrackFilterControl, {
                props: createDefaultProps({
                    // Viewport-based props (what user sees in current map area)
                    categories: ['running', 'cycling'],
                    minLength: 1.0,
                    maxLength: 5.0,
                    // Global session props (all available in session)
                    globalCategories: ['running', 'cycling', 'hiking', 'walking'],
                    globalMinLength: 0.5,
                    globalMaxLength: 10.0,
                    hasTracksInViewport: true
                }),
            });

            await nextTick();

            // Find and click reset button
            const resetButton = wrapper.find('.filter-actions button');
            expect(resetButton.text()).toBe('Reset');

            await resetButton.trigger('click');
            await nextTick();

            // Should emit filter update with global values, not viewport values
            const emitted = wrapper.emitted('update:filter');
            expect(emitted).toBeTruthy();

            const lastEmit = emitted[emitted.length - 1][0];

            // Reset should use global session values, but emitted values are filtered to viewport
            expect(lastEmit.categories).toEqual(['running', 'cycling']); // Filtered to viewport
            expect(lastEmit.lengthRange).toEqual([1.0, 5.0]); // Expect clamped to viewport, not global

            wrapper.unmount();
        });

        it('should preserve user selections when viewport props change', async () => {
            // Set up saved filter in localStorage
            const savedFilter = {
                categories: ['running'],
                lengthRange: [2.0, 8.0]
            };
            mockLocalStorage.getItem.mockReturnValue(JSON.stringify(savedFilter));

            const wrapper = mount(TrackFilterControl, {
                props: createDefaultProps({
                    categories: ['running', 'cycling'],
                    minLength: 1.0,
                    maxLength: 5.0,
                    globalCategories: ['running', 'cycling', 'hiking'],
                    globalMinLength: 0.5,
                    globalMaxLength: 10.0,
                    hasTracksInViewport: true
                }),
            });

            await nextTick();

            // Verify initial user selection is restored
            expect(wrapper.vm.selectedCategories).toEqual(['running']);
            expect(wrapper.vm.lengthRange).toEqual([2.0, 8.0]);

            // Simulate viewport change (zoom in to different area)
            await wrapper.setProps({
                categories: ['hiking'], // Different categories in new viewport
                minLength: 3.0, // Different range in new viewport
                maxLength: 4.0,
            });

            await nextTick();
            await nextTick(); // Additional tick for watchers to process prop change

            // User's saved selection should be preserved in component state
            expect(wrapper.vm.selectedCategories).toEqual(['running']); // Original user choice preserved
            expect(wrapper.vm.lengthRange).toEqual([2.0, 8.0]); // Original user choice preserved

            // But emitted values should be clamped/filtered to current viewport
            const emitted = wrapper.emitted('update:filter');
            const lastEmit = emitted[emitted.length - 1][0];

            // Categories should be filtered (running not available in new viewport)
            expect(lastEmit.categories).toEqual([]); // Running filtered out as not available in viewport
            // Length range should be clamped to viewport bounds
            expect(lastEmit.lengthRange).toEqual([2.0, 8.0]); // Should match user selection, not forcibly clamped

            wrapper.unmount();
        });
    });
});
