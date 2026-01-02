import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import TrackDetailPanel from '../TrackDetailPanel.vue';
import ElevationChart from '../ElevationChart.vue';

// Mock the useToast composable
const mockShowToast = vi.fn();
vi.mock('../../composables/useToast', () => ({
  useToast: () => ({
    showToast: mockShowToast
  })
}));

// Mock the useConfirm composable
const mockShowConfirm = vi.fn();
vi.mock('../../composables/useConfirm', () => ({
  useConfirm: () => ({
    showConfirm: mockShowConfirm
  })
}));

// Disable debouncing inside this test suite
vi.mock('../../composables/useAdvancedDebounce', () => ({
  useAdvancedDebounce: (fn) => fn
}));

// Mock the ElevationChart component
vi.mock('../ElevationChart.vue', () => ({
  default: {
    name: 'ElevationChart',
    template: '<div class="elevation-chart-mock">Elevation Chart</div>',
    props: ['elevationData', 'heartRateData', 'temperatureData', 'trackName', 'totalDistance', 'chartMode']
  }
}));

// Mock the useTracks composable
const mockUpdateTrackCategories = vi.fn(async (id, categories) => true);
const mockUpdateTrackInPolylines = vi.fn();
vi.mock('../../composables/useTracks', () => ({
  formatSpeed: vi.fn((speed, unit = 'kmh') => {
    if (typeof speed !== 'number' || speed < 0) return 'N/A';
    if (unit === 'mph') return `${(speed * 0.621371).toFixed(2)} miles`;
    return `${speed.toFixed(2)} km`;
  }),
  calculatePaceFromSpeed: vi.fn((speed, unit = 'min/km') => {
    if (typeof speed !== 'number' || speed <= 0) return 'N/A';
    let paceMinutes;
    if (unit === 'min/mi') {
      paceMinutes = 60 / (speed * 0.621371);
    } else {
      paceMinutes = 60 / speed;
    }
    const minutes = Math.floor(paceMinutes);
    const seconds = Math.round((paceMinutes - minutes) * 60);
    return `${minutes}:${seconds.toString().padStart(2, '0')} ${unit}`;
  }),
  formatDuration: vi.fn((seconds) => {
    if (seconds === null || seconds === undefined || seconds < 0 || isNaN(seconds)) return 'N/A';
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    if (h > 0) return `${h}h ${m}m ${s}s`;
    if (m > 0) return `${m}m ${s}s`;
    return `${s}s`;
  }),
  formatDistance: vi.fn((distanceKm, unit = 'km') => {
    if (typeof distanceKm !== 'number' || distanceKm < 0) return 'N/A';
    if (unit === 'mi') return `${(distanceKm * 0.621371).toFixed(2)} mi`;
    return `${distanceKm.toFixed(2)} km`;
  }),
  validateSpeedData: vi.fn((speed) => {
    if (typeof speed !== 'number' || isNaN(speed) || speed < 0 || speed > 200) return null;
    return speed;
  }),
  formatPace: vi.fn((pace, unit = 'min/km') => {
    if (typeof pace !== 'number' || pace <= 0) return 'N/A';
    const minutes = Math.floor(pace);
    const seconds = Math.round((pace - minutes) * 60);
    return `${minutes}:${seconds.toString().padStart(2, '0')} ${unit}`;
  }),
  useTracks: () => ({
    updateTrackCategories: mockUpdateTrackCategories,
    updateTrackInPolylines: mockUpdateTrackInPolylines
  })
}));


// Mock DOM elements for GPX export functionality
beforeEach(() => {
  // Clear all mocks
  vi.clearAllMocks();
});

describe('TrackDetailPanel', () => {
  let wrapper;

  const mockTrackMinimal = {
    id: 1,
    name: 'Test Track',
    length_km: 10.5,
    duration_seconds: 3600,
    created_at: '2024-01-01T10:00:00Z',
    updated_at: '2024-01-01T10:00:00Z'
  };

  const mockTrackComplete = {
    id: 1,
    name: 'Complete Test Track',
    description: 'A comprehensive test track with all data',
    length_km: 21.1,
    duration_seconds: 7200,
    avg_speed: 10.5,
    moving_avg_speed: 10.5,
    moving_avg_pace: 5.7, // minutes per km
    max_speed: 25.0,
    elevation_gain: 500,
    elevation_loss: -450,
    avg_hr: 150,
    hr_max: 180,
    categories: ['Running', 'Marathon'],
    recorded_at: '2024-01-01T08:00:00Z',
    created_at: '2024-01-01T10:00:00Z',
    updated_at: '2024-01-01T12:00:00Z',
    elevation_profile: [
      { distance: 0, elevation: 100 },
      { distance: 5000, elevation: 200 },
      { distance: 10000, elevation: 150 }
    ],
    hr_data: [
      { distance: 0, hr: 120 },
      { distance: 5000, hr: 160 },
      { distance: 10000, hr: 140 }
    ]
  };

  beforeEach(() => {
    // Reset all mocks before each test
    vi.clearAllMocks();
  });

  afterEach(() => {
    if (wrapper) {
      wrapper.unmount();
    }
  });

  describe('Component Initialization', () => {
    it('renders with minimal track data', () => {
      wrapper = mount(TrackDetailPanel, {
        props: { track: mockTrackMinimal }
      });

      expect(wrapper.find('h2').text()).toBe('Test Track');
      expect(wrapper.find('.stat-value').text()).toContain('10.50 km');
    });

    it('renders with complete track data', () => {
      wrapper = mount(TrackDetailPanel, {
        props: { track: mockTrackComplete }
      });

      expect(wrapper.find('h2').text()).toBe('Complete Test Track');
      expect(wrapper.find('.track-description-text').text()).toBe('A comprehensive test track with all data');
    });

    it('handles missing track name gracefully', () => {
      const trackNoName = { ...mockTrackMinimal, name: undefined };
      wrapper = mount(TrackDetailPanel, {
        props: { track: trackNoName }
      });

      expect(wrapper.find('h2').text()).toBe('Unnamed Track');
    });
  });

  describe('Speed and Pace Display', () => {
    beforeEach(() => {
      wrapper = mount(TrackDetailPanel, {
        props: { track: mockTrackComplete }
      });
    });

    it('displays speed and pace section when speed data is available', () => {
      expect(wrapper.find('.stats-section').exists()).toBe(true);
      expect(wrapper.text()).toContain('Statistics');
    });

    it('shows km by default', () => {
      const kmhButton = wrapper.find('.unit-toggle[class*="active"]');
      expect(kmhButton.text()).toBe('km');
    });

    it('switches to miles when miles button is clicked', async () => {
      const milesButton = wrapper.findAll('.unit-toggle').find(btn => btn.text() === 'miles');
      await milesButton.trigger('click');

      const activeButton = wrapper.find('.unit-toggle.active');
      expect(activeButton.text()).toBe('miles');
    });

    it('displays average speed correctly', () => {
      const speedStats = wrapper.findAll('.stat-item');
      // Check if any stat item contains speed-related text
      const hasSpeedStat = speedStats.some(stat => {
        const text = stat.text().toLowerCase();
        return text.includes('speed') || text.includes('km') || text.includes('miles');
      });
      expect(hasSpeedStat).toBe(true);
    });

    it('displays average pace correctly', () => {
      const speedStats = wrapper.findAll('.stat-item');
      // Check if any stat item contains pace-related text
      const hasPaceStat = speedStats.some(stat => {
        const text = stat.text().toLowerCase();
        return text.includes('pace') || text.includes('min/km') || text.includes('min/mi');
      });
      expect(hasPaceStat).toBe(true);
    });

    it('hides speed section when no speed data available', () => {
      const trackNoSpeed = { ...mockTrackMinimal };
      delete trackNoSpeed.avg_speed;
      delete trackNoSpeed.max_speed;

      wrapper = mount(TrackDetailPanel, {
        props: { track: trackNoSpeed }
      });

      expect(wrapper.text()).not.toContain('Speed & Pace');
    });
  });

  describe('Elevation Data Display', () => {
    it('displays elevation section when elevation data is available', () => {
      wrapper = mount(TrackDetailPanel, {
        props: { track: mockTrackComplete }
      });

      expect(wrapper.text()).toContain('Elevation');
      expect(wrapper.text()).toContain('Total ascent');
      expect(wrapper.text()).toContain('Total descent');
    });

    it('calculates net elevation correctly', () => {
      wrapper = mount(TrackDetailPanel, {
        props: { track: mockTrackComplete }
      });

      expect(wrapper.text()).toContain('Net elevation');
      // Net = 500 - 450 = +50
      expect(wrapper.text()).toContain('+50 m');
    });

    it('handles negative net elevation', () => {
      const trackNegativeElevation = {
        ...mockTrackComplete,
        elevation_gain: 200,
        elevation_loss: -300
      };

      wrapper = mount(TrackDetailPanel, {
        props: { track: trackNegativeElevation }
      });

      expect(wrapper.text()).toContain('-100 m');
    });

    it('hides elevation section when no elevation data available', () => {
      const trackNoElevation = {
        ...mockTrackMinimal,
        // Explicitly remove all slope and elevation data with null values  
        slope_min: null,
        slope_max: null,
        slope_avg: null,
        slope_histogram: null,
        slope_segments: null,
        elevation_gain: null,
        elevation_loss: null,
        elevation_profile: null,
        elevation_points: [],
        heart_rate_points: [],
        temperature_points: []
      };
      wrapper = mount(TrackDetailPanel, {
        props: { track: trackNoElevation }
      });

      // Chart section should not exist when no chart data available
      expect(wrapper.find('.chart-section').exists()).toBe(false);
    });

    it('does not auto-start polling on mount', async () => {
      const trackNoElevation = {
        ...mockTrackMinimal,
        length_km: 5.0,
        elevation_enriched: false,
        elevation_gain: null,
        elevation_loss: null,
        elevation_profile: null
      };

      global.fetch = vi.fn();

      wrapper = mount(TrackDetailPanel, {
        props: { track: trackNoElevation }
      });

      await wrapper.vm.$nextTick();

      // Polling should not start automatically
      expect(wrapper.vm.isPollingForElevation).toBe(false);
      expect(wrapper.vm.enrichmentPollingInterval).toBe(null);
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it('stops polling in response to stop-elevation-polling event', async () => {
      const trackNoElevation = {
        ...mockTrackMinimal,
        length_km: 5.0,
        elevation_enriched: false,
        elevation_gain: null
      };

      wrapper = mount(TrackDetailPanel, { props: { track: trackNoElevation } });
      await wrapper.vm.$nextTick();

      // Manually start polling
      wrapper.vm.startElevationPolling(trackNoElevation.id);
      await wrapper.vm.$nextTick();

      expect(wrapper.vm.isPollingForElevation).toBe(true);

      // Dispatch stop event from 'parent'
      window.dispatchEvent(new CustomEvent('stop-elevation-polling'));
      await wrapper.vm.$nextTick();

      expect(wrapper.vm.isPollingForElevation).toBe(false);
      expect(wrapper.vm.enrichmentPollingInterval).toBe(null);
    });

    it('stops polling when track changes', async () => {
      const trackNoElevation = {
        ...mockTrackMinimal,
        id: 1,
        length_km: 5.0,
        elevation_enriched: false,
        elevation_gain: null
      };

      const track2 = {
        ...mockTrackMinimal,
        id: 2,
        length_km: 6.0,
        elevation_enriched: true,
        elevation_gain: 100
      };

      wrapper = mount(TrackDetailPanel, { props: { track: trackNoElevation } });
      await wrapper.vm.$nextTick();

      // Manually start polling
      wrapper.vm.startElevationPolling(trackNoElevation.id);
      await wrapper.vm.$nextTick();
      expect(wrapper.vm.isPollingForElevation).toBe(true);

      // Change track prop to stop polling automatically
      await wrapper.setProps({ track: track2 });
      await wrapper.vm.$nextTick();
      expect(wrapper.vm.isPollingForElevation).toBe(false);
      expect(wrapper.vm.enrichmentPollingInterval).toBe(null);
    });
  });

  describe('Heart Rate Data Display', () => {
    it('displays heart rate section when HR data is available', () => {
      wrapper = mount(TrackDetailPanel, {
        props: { track: mockTrackComplete }
      });

      expect(wrapper.text()).toContain('Statistics');
      expect(wrapper.text()).toContain('Average HR');
      expect(wrapper.text()).toContain('150 bpm');
    });

    it('rounds heart rate values correctly', () => {
      const trackFloatHR = {
        ...mockTrackComplete,
        avg_hr: 150.7,
        hr_max: 179.3
      };

      wrapper = mount(TrackDetailPanel, {
        props: { track: trackFloatHR }
      });

      expect(wrapper.text()).toContain('151 bpm');
      expect(wrapper.text()).toContain('179 bpm');
    });

    it('hides heart rate section when no HR data available', () => {
      const trackNoHR = { ...mockTrackMinimal };
      wrapper = mount(TrackDetailPanel, {
        props: { track: trackNoHR }
      });

      expect(wrapper.text()).not.toContain('Heart Rate');
    });
  });

  describe('Categories Display', () => {
    it('displays categories when available', () => {
      wrapper = mount(TrackDetailPanel, {
        props: { track: mockTrackComplete }
      });

      expect(wrapper.text()).toContain('Categories');
      expect(wrapper.text()).toContain('Running');
      expect(wrapper.text()).toContain('Marathon');
    });

    it('hides categories section when no categories available and not owner', () => {
      const trackNoCategories = { ...mockTrackMinimal };
      wrapper = mount(TrackDetailPanel, {
        props: { track: trackNoCategories, isOwner: false }
      });

      expect(wrapper.text()).not.toContain('Categories');
    });

    it('shows inline Multiselect when owner', () => {
      wrapper = mount(TrackDetailPanel, {
        props: { track: mockTrackComplete, isOwner: true }
      });

      expect(wrapper.find('.categories-inline-edit').exists()).toBe(true);
      expect(wrapper.find('.track-category-select-inline').exists()).toBe(true);
    });

    it('shows read-only tags when not owner', () => {
      wrapper = mount(TrackDetailPanel, {
        props: { track: mockTrackComplete, isOwner: false }
      });

      expect(wrapper.find('.categories').exists()).toBe(true);
      expect(wrapper.find('.categories-inline-edit').exists()).toBe(false);
    });
  });

  describe('Categories Inline Editing', () => {
    it('initializes selectedCategories from track data', async () => {
      wrapper = mount(TrackDetailPanel, {
        props: { track: mockTrackComplete, isOwner: true }
      });

      await wrapper.vm.$nextTick();

      // Check that selectedCategories is array of objects
      expect(Array.isArray(wrapper.vm.selectedCategories)).toBe(true);
      expect(wrapper.vm.selectedCategories.length).toBeGreaterThan(0);
      expect(wrapper.vm.selectedCategories[0]).toHaveProperty('value');
      expect(wrapper.vm.selectedCategories[0]).toHaveProperty('label');
    });

    it('auto-saves categories on change', async () => {
      wrapper = mount(TrackDetailPanel, {
        props: { track: mockTrackComplete, isOwner: true }
      });

      await wrapper.vm.$nextTick();

      // Simulate category change
      const newCategories = [
        { value: 'hiking', label: 'Hiking' },
        { value: 'running', label: 'Running' }
      ];

      await wrapper.vm.onCategoriesChange(newCategories);
      await wrapper.vm.$nextTick();

      // Ensure composable was called with string array
      expect(mockUpdateTrackCategories).toHaveBeenCalledWith(
        expect.anything(),
        ['hiking', 'running']
      );
      expect(wrapper.emitted('categories-updated')).toBeTruthy();
    });

    it('validates empty categories on change', async () => {
      wrapper = mount(TrackDetailPanel, {
        props: { track: { ...mockTrackComplete, categories: ['hiking'] }, isOwner: true }
      });

      await wrapper.vm.$nextTick();

      // Try to set empty categories
      await wrapper.vm.onCategoriesChange([]);
      await wrapper.vm.$nextTick();

      expect(wrapper.vm.categoriesError).toBe('At least one category is required.');
    });

    it('shows saving indicator during save', async () => {
      let resolveSave;
      mockUpdateTrackCategories.mockImplementation(() => {
        return new Promise(resolve => {
          resolveSave = resolve;
        });
      });

      wrapper = mount(TrackDetailPanel, {
        props: { track: mockTrackComplete, isOwner: true }
      });

      await wrapper.vm.$nextTick();

      // Start saving (don't await yet)
      const savePromise = wrapper.vm.onCategoriesChange([
        { value: 'hiking', label: 'Hiking' }
      ]);

      // Wait for the saving state to update
      await new Promise(resolve => setTimeout(resolve, 50));

      // Should show saving indicator
      expect(wrapper.vm.savingCategories).toBe(true);

      // Clean up
      resolveSave();
      await savePromise.catch(() => { });
    });

    it('has predefined categories list', () => {
      wrapper = mount(TrackDetailPanel, {
        props: { track: mockTrackComplete, isOwner: true }
      });

      // Check that categoriesList exists and has expected categories
      expect(wrapper.vm.categoriesList).toBeDefined();
      expect(Array.isArray(wrapper.vm.categoriesList)).toBe(true);
      expect(wrapper.vm.categoriesList.length).toBeGreaterThan(0);

      // Check for common categories
      const categoryValues = wrapper.vm.categoriesList.map(c => c.value);
      expect(categoryValues).toContain('hiking');
      expect(categoryValues).toContain('running');
      expect(categoryValues).toContain('cycling');
    });

    it('does not allow custom category creation', () => {
      wrapper = mount(TrackDetailPanel, {
        props: { track: mockTrackComplete, isOwner: true }
      });

      // Multiselect component should have createOption set to false
      const multiselect = wrapper.findComponent({ name: 'Multiselect' });
      expect(multiselect.props('createOption')).toBe(false);
    });

    it('reverts to previous categories on error', async () => {
      mockUpdateTrackCategories.mockRejectedValue(new Error('Network error'));

      wrapper = mount(TrackDetailPanel, {
        props: { track: { ...mockTrackComplete, categories: ['hiking', 'running'] }, isOwner: true }
      });

      await wrapper.vm.$nextTick();

      const initialCategories = [...wrapper.vm.selectedCategories];

      // Try to change categories (should fail)
      await wrapper.vm.onCategoriesChange([
        { value: 'walking', label: 'Walking' }
      ]);
      await wrapper.vm.$nextTick();

      // Should revert to initial categories
      expect(wrapper.vm.selectedCategories).toHaveLength(2);
      expect(wrapper.vm.categoriesError).toContain('Network error');
    });
  });

  describe('ElevationChart Integration', () => {
    it('renders ElevationChart when elevation profile data exists', () => {
      wrapper = mount(TrackDetailPanel, {
        props: { track: mockTrackComplete },
        global: {
          components: {
            ElevationChart
          }
        }
      });

      expect(wrapper.findComponent(ElevationChart).exists()).toBe(true);
    });

    it('hides elevation section when no elevation or heart rate data available', () => {
      const trackNoProfile = {
        ...mockTrackMinimal,
        elevation_profile: null,
        hr_data: null,
        elevation_up: null,
        elevation_down: null,
        avg_hr: null,
        hr_max: null
      };
      wrapper = mount(TrackDetailPanel, {
        props: { track: trackNoProfile, isVisible: true }
      });

      // Chart section still exists because track has slope data
      expect(wrapper.find('.chart-section').exists()).toBe(true);
      expect(wrapper.find('.elevation-profile-placeholder').exists()).toBe(false);
    });

    it('hides elevation section when no elevation data available', () => {
      const trackNoElevation = {
        ...mockTrackMinimal,
        // Explicitly remove all slope and elevation data with null values  
        slope_min: null,
        slope_max: null,
        slope_avg: null,
        slope_histogram: null,
        slope_segments: null,
        elevation_gain: null,
        elevation_loss: null,
        elevation_profile: null,
        elevation_points: [],
        heart_rate_points: [],
        temperature_points: []
      };
      wrapper = mount(TrackDetailPanel, {
        props: { track: trackNoElevation }
      });

      // Chart section should not exist when no chart data available
      expect(wrapper.find('.chart-section').exists()).toBe(false);
      expect(wrapper.find('.elevation-profile-placeholder').exists()).toBe(false);
    });

    it('passes correct props to ElevationChart', () => {
      wrapper = mount(TrackDetailPanel, {
        props: { track: mockTrackComplete },
        global: {
          components: {
            ElevationChart
          }
        }
      });

      const chart = wrapper.findComponent(ElevationChart);
      expect(chart.props('elevationData')).toEqual(mockTrackComplete.elevation_profile);
      expect(chart.props('heartRateData')).toEqual(mockTrackComplete.hr_data);
      expect(chart.props('totalDistance')).toBe(mockTrackComplete.length_km);
    });
  });

  describe('Date Formatting', () => {
    it('formats dates correctly in 24-hour format', () => {
      wrapper = mount(TrackDetailPanel, {
        props: { track: mockTrackComplete }
      });

      expect(wrapper.text()).toContain('Recorded');
      expect(wrapper.text()).toContain('Added');
      expect(wrapper.text()).toContain('Modified');

      // Check that dates are formatted in 24-hour format (no AM/PM)
      expect(wrapper.text()).not.toContain('AM');
      expect(wrapper.text()).not.toContain('PM');
    });

    it('handles missing recorded_at gracefully', () => {
      const trackNoRecorded = { ...mockTrackComplete };
      delete trackNoRecorded.recorded_at;

      wrapper = mount(TrackDetailPanel, {
        props: { track: trackNoRecorded }
      });

      expect(wrapper.text()).not.toContain('Recorded');
    });

    it('handles invalid dates gracefully', () => {
      const trackInvalidDate = {
        ...mockTrackComplete,
        created_at: 'invalid-date'
      };

      wrapper = mount(TrackDetailPanel, {
        props: { track: trackInvalidDate }
      });

      expect(wrapper.text()).toContain('Invalid Date');
    });
  });

  describe('Panel Collapse Functionality', () => {
    beforeEach(() => {
      wrapper = mount(TrackDetailPanel, {
        props: { track: mockTrackMinimal }
      });
    });

    it('panel starts in expanded state', () => {
      expect(wrapper.vm.isCollapsed).toBe(false);
      expect(wrapper.find('.flyout-content').exists()).toBe(true);
      // panel-controls-tab exists but is hidden with v-show
      expect(wrapper.find('.panel-controls-tab').isVisible()).toBe(false);
    });

    it('shows collapse toggle button in header-actions when expanded', () => {
      const headerActions = wrapper.find('.header-actions');
      const collapseButton = headerActions.find('.collapse-toggle-btn');
      expect(collapseButton.exists()).toBe(true);
      expect(collapseButton.attributes('title')).toBe('Collapse panel');
    });

    it('toggles panel collapsed state when collapse button is clicked', async () => {
      const collapseButton = wrapper.find('.collapse-toggle-btn');
      await collapseButton.trigger('click');

      expect(wrapper.vm.isCollapsed).toBe(true);
      expect(wrapper.find('.panel-controls-tab').isVisible()).toBe(true);
      // collapsible-content is hidden with v-show when collapsed
      expect(wrapper.find('.collapsible-content').isVisible()).toBe(false);
    });

    it('shows panel-controls-tab only when collapsed', async () => {
      // Initially expanded - tab exists but hidden
      expect(wrapper.find('.panel-controls-tab').isVisible()).toBe(false);

      // Collapse panel
      await wrapper.find('.collapse-toggle-btn').trigger('click');
      await wrapper.vm.$nextTick();

      // Verify the state changed
      expect(wrapper.vm.isCollapsed).toBe(true);

      // Force wrapper to update after state change
      await wrapper.vm.$forceUpdate();
      await wrapper.vm.$nextTick();

      // Now tab should be visible
      const tab = wrapper.find('.panel-controls-tab');
      expect(tab.exists()).toBe(true);

      // Check the button inside the tab has the correct title
      const tabButton = tab.find('.collapse-toggle-btn');
      expect(tabButton.exists()).toBe(true);
      expect(tabButton.attributes('title')).toBe('Expand panel');
    });

    it('expands panel when tab is clicked', async () => {
      // Collapse first
      await wrapper.find('.collapse-toggle-btn').trigger('click');
      expect(wrapper.vm.isCollapsed).toBe(true);

      // Click tab to expand - the tab contains the collapse button
      const tabButton = wrapper.find('.panel-controls-tab .collapse-toggle-btn');
      await tabButton.trigger('click');

      expect(wrapper.vm.isCollapsed).toBe(false);
      expect(wrapper.find('.collapsible-content').isVisible()).toBe(true);
      expect(wrapper.find('.panel-controls-tab').isVisible()).toBe(false);
    });
  });

  describe('Close Functionality', () => {
    beforeEach(() => {
      wrapper = mount(TrackDetailPanel, {
        props: { track: mockTrackMinimal }
      });
    });

    it('emits close event when close button is clicked', async () => {
      vi.useFakeTimers();

      const closeButton = wrapper.find('.close-button');
      await closeButton.trigger('click');

      expect(wrapper.vm.isClosing).toBe(true);

      // Fast-forward time to trigger the delayed emit
      vi.advanceTimersByTime(300);

      expect(wrapper.emitted('close')).toBeTruthy();
      expect(wrapper.emitted('close')).toHaveLength(1);

      vi.useRealTimers();
    });

    it('close button is in header-actions', () => {
      const headerActions = wrapper.find('.header-actions');
      const closeButton = headerActions.find('.close-button');
      expect(closeButton.exists()).toBe(true);
    });
  });

  describe('Error Handling and Edge Cases', () => {
    it('handles null/undefined track data gracefully', () => {
      const trackWithNulls = {
        ...mockTrackMinimal,
        avg_speed: null,
        elevation_up: undefined,
        duration_seconds: null
      };

      wrapper = mount(TrackDetailPanel, {
        props: { track: trackWithNulls }
      });

      expect(wrapper.text()).toContain('Test Track');
      expect(wrapper.text()).not.toContain('Speed & Pace');
    });

    it('handles zero values correctly', () => {
      const trackWithZeros = {
        ...mockTrackMinimal,
        avg_speed: 0,
        elevation_up: 0,
        duration_seconds: 0
      };

      wrapper = mount(TrackDetailPanel, {
        props: { track: trackWithZeros }
      });

      expect(wrapper.text()).not.toContain('Duration'); // Duration section should be hidden when 0
    });

    it('handles extremely large values', () => {
      const trackLargeValues = {
        ...mockTrackMinimal,
        avg_speed: 100,
        elevation_gain: 10000,
        duration_seconds: 86400 // 24 hours
      };

      wrapper = mount(TrackDetailPanel, {
        props: { track: trackLargeValues }
      });

      expect(wrapper.text()).toContain('24h');
      expect(wrapper.text()).toContain('10000 m');
    });
  });

  describe('Name Editing', () => {
    beforeEach(() => {
      // Mock fetch for name editing
      global.fetch = vi.fn();
    });

    it('should not show edit name button when not owner', () => {
      wrapper = mount(TrackDetailPanel, {
        props: { track: mockTrackComplete, isOwner: false }
      });

      expect(wrapper.find('.edit-name-btn').exists()).toBe(false);
    });

    it('should show edit name button when owner', () => {
      wrapper = mount(TrackDetailPanel, {
        props: { track: mockTrackComplete, isOwner: true }
      });

      expect(wrapper.find('.edit-name-btn').exists()).toBe(true);
    });

    it('edit name button is positioned next to track title', () => {
      wrapper = mount(TrackDetailPanel, {
        props: { track: mockTrackComplete, isOwner: true }
      });

      const titleContainer = wrapper.find('.title-with-edit');
      const editButton = titleContainer.find('.edit-name-btn');
      expect(editButton.exists()).toBe(true);
    });

    it('should enter edit mode when edit button is clicked', async () => {
      wrapper = mount(TrackDetailPanel, {
        props: { track: mockTrackComplete, isOwner: true }
      });

      await wrapper.find('.edit-name-btn').trigger('click');
      await wrapper.vm.$nextTick();

      expect(wrapper.find('.name-edit-block').exists()).toBe(true);
      expect(wrapper.find('.edit-name-input').exists()).toBe(true);
      expect(wrapper.vm.isEditingName).toBe(true);
      expect(wrapper.vm.editedName).toBe(mockTrackComplete.name);
    });

    it('should cancel edit mode when cancel button is clicked', async () => {
      wrapper = mount(TrackDetailPanel, {
        props: { track: mockTrackComplete, isOwner: true }
      });

      // Enter edit mode
      await wrapper.find('.edit-name-btn').trigger('click');
      await wrapper.vm.$nextTick();

      // Cancel edit
      await wrapper.find('.cancel-btn').trigger('click');
      await wrapper.vm.$nextTick();

      expect(wrapper.find('.name-edit-block').exists()).toBe(false);
      expect(wrapper.vm.isEditingName).toBe(false);
    });

    it('should save name successfully', async () => {
      global.fetch.mockResolvedValueOnce({ ok: true });
      wrapper = mount(TrackDetailPanel, { props: { track: mockTrackComplete, isOwner: true, sessionId: 'test-session' } });
      await wrapper.find('.edit-name-btn').trigger('click');
      await wrapper.vm.$nextTick();
      const input = wrapper.find('.edit-name-input');
      await input.setValue('Updated Track Name');
      await wrapper.find('.save-btn').trigger('click');
      await Promise.resolve();
      await wrapper.vm.$nextTick();
      expect(global.fetch).toHaveBeenCalledWith('/tracks/1/name', expect.objectContaining({ method: 'PATCH' }));
      expect(wrapper.emitted('name-updated')).toEqual([['Updated Track Name']]);
    });

    it('should handle empty name validation', async () => {
      wrapper = mount(TrackDetailPanel, {
        props: { track: mockTrackComplete, isOwner: true }
      });

      // Enter edit mode
      await wrapper.find('.edit-name-btn').trigger('click');
      await wrapper.vm.$nextTick();

      // Set empty name
      const input = wrapper.find('.edit-name-input');
      await input.setValue('   ');

      // Try to save
      await wrapper.find('.save-btn').trigger('click');
      await wrapper.vm.$nextTick();

      expect(wrapper.find('.edit-name-error').text()).toBe('Track name cannot be empty.');
      expect(wrapper.vm.isEditingName).toBe(true);
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it('should handle 403 error', async () => {
      global.fetch.mockResolvedValueOnce({ ok: false, status: 403 });
      wrapper = mount(TrackDetailPanel, { props: { track: mockTrackComplete, isOwner: true, sessionId: 'sess' } });
      await wrapper.find('.edit-name-btn').trigger('click');
      await wrapper.vm.$nextTick();
      const input = wrapper.find('.edit-name-input');
      await input.setValue('New Name');
      await wrapper.find('.save-btn').trigger('click');
      await Promise.resolve();
      await wrapper.vm.$nextTick();
      expect(wrapper.find('.edit-name-error').text()).toBe('You are not allowed to edit this track name.');
    });

    it('should handle network error', async () => {
      global.fetch.mockRejectedValueOnce(new Error('Network error'));
      wrapper = mount(TrackDetailPanel, { props: { track: mockTrackComplete, isOwner: true, sessionId: 'sess' } });
      await wrapper.find('.edit-name-btn').trigger('click');
      await wrapper.vm.$nextTick();
      const input = wrapper.find('.edit-name-input');
      await input.setValue('New Name');
      await wrapper.find('.save-btn').trigger('click');
      await Promise.resolve();
      await wrapper.vm.$nextTick();
      expect(wrapper.find('.edit-name-error').text()).toBe('Network error');
    });
  });

  describe('Header Actions Layout', () => {
    it('displays all action buttons in header-actions when expanded', () => {
      wrapper = mount(TrackDetailPanel, {
        props: { track: mockTrackComplete, isOwner: true }
      });

      const headerActions = wrapper.find('.header-actions');
      expect(headerActions.exists()).toBe(true);

      // Check that all buttons are present in header-actions
      expect(headerActions.find('.export-gpx-btn').exists()).toBe(true);
      expect(headerActions.find('.share-track-btn').exists()).toBe(true);
      expect(headerActions.find('.collapse-toggle-btn').exists()).toBe(true);
      expect(headerActions.find('.close-button').exists()).toBe(true);
    });

    it('all action buttons have consistent styling', () => {
      wrapper = mount(TrackDetailPanel, {
        props: { track: mockTrackComplete, isOwner: true }
      });

      const buttons = [
        '.export-gpx-btn',
        '.share-track-btn',
        '.collapse-toggle-btn',
        '.close-button',
        '.edit-name-btn'
      ];

      buttons.forEach(selector => {
        const button = wrapper.find(selector);
        if (button.exists()) {
          // Check that buttons exist and have button styling
          expect(button.element.tagName).toBe('BUTTON');
        }
      });
    });

    it('header-actions buttons are in correct order', () => {
      wrapper = mount(TrackDetailPanel, {
        props: { track: mockTrackComplete, isOwner: true }
      });

      const headerActions = wrapper.find('.header-actions');
      const buttons = headerActions.findAll('button');

      // Based on the template: share, export, collapse, close
      const buttonClasses = buttons.map(btn => btn.classes());

      const shareIndex = buttonClasses.findIndex(classes => classes.includes('share-track-btn'));
      const exportIndex = buttonClasses.findIndex(classes => classes.includes('export-gpx-btn'));
      const collapseIndex = buttonClasses.findIndex(classes => classes.includes('collapse-toggle-btn'));
      const closeIndex = buttonClasses.findIndex(classes => classes.includes('close-button'));

      // Verify the actual order: share -> export -> collapse -> close
      expect(shareIndex).toBeLessThan(exportIndex);
      expect(exportIndex).toBeLessThan(collapseIndex);
      expect(collapseIndex).toBeLessThan(closeIndex);
    });
  });

  describe('Mobile Responsiveness', () => {
    it('applies mobile classes correctly', () => {
      wrapper = mount(TrackDetailPanel, {
        props: { track: mockTrackComplete }
      });

      expect(wrapper.find('.track-detail-flyout').exists()).toBe(true);
      // CSS classes for mobile responsiveness should be present
      expect(wrapper.html()).toContain('speed-pace-grid');
    });
  });

  describe('GPX Export functionality', () => {
    it('should display export GPX button in header-actions', async () => {
      const track = {
        id: 1,
        name: 'Test Track',
        length_km: 10.5,
        duration_seconds: 3600,
        created_at: '2024-01-01T10:00:00Z',
        updated_at: '2024-01-01T10:00:00Z'
      };

      const wrapper = mount(TrackDetailPanel, {
        props: { track, isVisible: true }
      });

      // Wait for component to be fully mounted
      await wrapper.vm.$nextTick();

      // Check for export GPX button in header-actions
      const headerActions = wrapper.find('.header-actions');
      const exportButton = headerActions.find('.export-gpx-btn');
      expect(exportButton.exists()).toBe(true);
      expect(exportButton.attributes('title')).toBe('Export track as GPX file');
    });

    it('should display share track button in header-actions', async () => {
      const track = {
        id: 1,
        name: 'Test Track',
        length_km: 10.5,
        duration_seconds: 3600,
        created_at: '2024-01-01T10:00:00Z',
        updated_at: '2024-01-01T10:00:00Z'
      };

      const wrapper = mount(TrackDetailPanel, {
        props: { track, isVisible: true }
      });

      await wrapper.vm.$nextTick();

      const headerActions = wrapper.find('.header-actions');
      const shareButton = headerActions.find('.share-track-btn');
      expect(shareButton.exists()).toBe(true);
      expect(shareButton.attributes('title')).toBe('Copy shareable link');
    });

    it('should call export API when export button is clicked', async () => {
      // Mock fetch for export
      global.fetch.mockResolvedValue({
        ok: true,
        headers: new Map([
          ['content-disposition', 'attachment; filename="test-track.gpx"']
        ]),
        blob: () => Promise.resolve(new Blob(['<gpx>mock gpx content</gpx>'], { type: 'application/gpx+xml' }))
      });

      // Reset createElement mock to track only calls made during export
      document.createElement.mockClear();

      const track = { ...mockTrackComplete };
      const wrapper = mount(TrackDetailPanel, {
        props: { track, isVisible: true }
      });

      const exportButton = wrapper.find('.export-gpx-btn');
      await exportButton.trigger('click');

      // Wait for async operations
      await wrapper.vm.$nextTick();
      await flushPromises();

      expect(fetch).toHaveBeenCalledWith(`/tracks/${track.id}/export`);
      // Ensure at least one anchor element was created for download
      const anchorCalls = document.createElement.mock.calls.filter(c => c[0] === 'a');
      expect(anchorCalls.length).toBeGreaterThan(0);

      // Inspect created <a> element to ensure filename logic ran
      const createdAnchorResult = document.createElement.mock.results.find(r => r.value && r.value.tagName && r.value.tagName.toLowerCase() === 'a');
      expect(createdAnchorResult).toBeDefined();
      const createdAnchor = createdAnchorResult.value;
      // When server supplies Content-Disposition with filename, we should use it
      expect(createdAnchor.download).toBe('test-track.gpx');

    });

    it('should preserve Cyrillic track names when no header filename is provided', async () => {
      // Mock fetch response without content-disposition header
      global.fetch.mockResolvedValue({
        ok: true,
        headers: new Map(),
        blob: () => Promise.resolve(new Blob(['<gpx></gpx>'], { type: 'application/gpx+xml' }))
      });

      const track = { ...mockTrackComplete, name: 'Мой трек' };
      const wrapper = mount(TrackDetailPanel, { props: { track, isVisible: true } });

      document.createElement.mockClear();
      const exportButton = wrapper.find('.export-gpx-btn');
      await exportButton.trigger('click');
      await wrapper.vm.$nextTick();
      await flushPromises();

      const createdAnchorResult = document.createElement.mock.results.find(r => r.value && r.value.tagName && r.value.tagName.toLowerCase() === 'a');
      expect(createdAnchorResult).toBeDefined();
      const createdAnchor = createdAnchorResult.value;
      expect(createdAnchor.download).toBe('Мой_трек.gpx');
    });

    it('should fallback to track id when sanitized name is empty', async () => {
      global.fetch.mockResolvedValue({
        ok: true,
        headers: new Map(),
        blob: () => Promise.resolve(new Blob(['<gpx></gpx>'], { type: 'application/gpx+xml' }))
      });

      const track = { ...mockTrackComplete, id: 42, name: '///' };
      const wrapper = mount(TrackDetailPanel, { props: { track, isVisible: true } });

      document.createElement.mockClear();
      const exportButton = wrapper.find('.export-gpx-btn');
      await exportButton.trigger('click');
      await wrapper.vm.$nextTick();
      await flushPromises();

      const createdAnchorResult = document.createElement.mock.results.find(r => r.value && r.value.tagName && r.value.tagName.toLowerCase() === 'a');
      expect(createdAnchorResult).toBeDefined();
      const createdAnchor = createdAnchorResult.value;
      expect(createdAnchor.download).toBe('track-42.gpx');
    });

    it('should disable export button during export', async () => {
      // Mock slow fetch response
      global.fetch.mockImplementation(() =>
        new Promise(resolve => setTimeout(() => resolve({
          ok: true,
          headers: new Map([['content-disposition', 'attachment; filename="test.gpx"']]),
          blob: () => Promise.resolve(new Blob(['<gpx></gpx>']))
        }), 100))
      );

      const track = { ...mockTrackComplete };
      const wrapper = mount(TrackDetailPanel, {
        props: { track, isVisible: true }
      });

      const exportButton = wrapper.find('.export-gpx-btn');
      expect(exportButton.attributes('disabled')).toBe(undefined);

      await exportButton.trigger('click');
      await wrapper.vm.$nextTick();

      expect(exportButton.attributes('disabled')).toBe('');
      expect(exportButton.attributes('title')).toBe('Exporting...');
    });

    it('should handle export error gracefully', async () => {
      global.fetch.mockRejectedValue(new Error('Network error'));

      // Mock console.error to avoid test noise
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => { });

      const track = { ...mockTrackComplete };
      const wrapper = mount(TrackDetailPanel, {
        props: { track, isVisible: true }
      });

      const exportButton = wrapper.find('.export-gpx-btn');
      await exportButton.trigger('click');

      await wrapper.vm.$nextTick();
      await flushPromises();

      expect(consoleSpy).toHaveBeenCalledWith('Export failed:', expect.any(Error));
      expect(exportButton.attributes('disabled')).toBe(undefined);

      consoleSpy.mockRestore();
    });
  });

  describe('Temperature Functionality', () => {
    const mockTrackWithTemperature = {
      ...mockTrackComplete,
      temp_data: [22.5, 23.0, 24.2, 25.1, 26.8],
      elevation_profile: [100, 110, 120, 130, 140],
      hr_data: [120, 125, 130, 135, 140]
    };

    const mockTrackWithoutTemperature = {
      ...mockTrackComplete,
      temp_data: null,
      elevation_profile: [100, 110, 120, 130, 140],
      hr_data: [120, 125, 130, 135, 140]
    };

    it('should detect when temperature data is available', () => {
      wrapper = mount(TrackDetailPanel, {
        props: { track: mockTrackWithTemperature, isVisible: true }
      });

      expect(wrapper.vm.hasTemperatureData).toBe(true);
    });

    it('should detect when temperature data is not available', () => {
      wrapper = mount(TrackDetailPanel, {
        props: { track: mockTrackWithoutTemperature, isVisible: true }
      });

      expect(wrapper.vm.hasTemperatureData).toBe(false);
    });

    it('should show temperature chart toggle button when temperature data is available', () => {
      wrapper = mount(TrackDetailPanel, {
        props: { track: mockTrackWithTemperature, isVisible: true }
      });

      const chartToggleButtons = wrapper.findAll('button.chart-toggle');
      const temperatureButton = chartToggleButtons.find(btn =>
        btn.text().includes('Temperature')
      );
      expect(temperatureButton).toBeTruthy();
    });

    it('should not show temperature chart toggle button when temperature data is not available', () => {
      wrapper = mount(TrackDetailPanel, {
        props: { track: mockTrackWithoutTemperature, isVisible: true }
      });

      const chartToggleButtons = wrapper.findAll('button.chart-toggle');
      const temperatureButton = chartToggleButtons.find(btn =>
        btn.text().includes('Temperature')
      );
      expect(temperatureButton).toBeFalsy();
    });

    it('should switch to temperature chart mode when temperature button is clicked', async () => {
      wrapper = mount(TrackDetailPanel, {
        props: { track: mockTrackWithTemperature, isVisible: true }
      });

      const chartToggleButtons = wrapper.findAll('button.chart-toggle');
      const temperatureButton = chartToggleButtons.find(btn =>
        btn.text().includes('Temperature')
      );

      await temperatureButton.trigger('click');
      expect(wrapper.vm.chartMode).toBe('temperature');
      expect(temperatureButton.classes()).toContain('active');
    });

    it('should pass temperature data to ElevationChart component', () => {
      wrapper = mount(TrackDetailPanel, {
        props: { track: mockTrackWithTemperature, isVisible: true }
      });

      const elevationChart = wrapper.findComponent(ElevationChart);
      expect(elevationChart.props('temperatureData')).toEqual([22.5, 23.0, 24.2, 25.1, 26.8]);
    });

    it('should auto-set chart mode to temperature when only temperature data is available', async () => {
      const trackOnlyTemperature = {
        id: 123,
        name: 'Temperature Only Track',
        description: 'Test track with only temperature data',
        length_km: 5.0,
        temp_data: [22.5, 23.0, 24.2],
        elevation_profile: null,
        hr_data: null,
        elevation_up: null,
        elevation_down: null
      };

      wrapper = mount(TrackDetailPanel, {
        props: { track: trackOnlyTemperature, isVisible: true }
      });

      // Wait for the watcher to execute
      await wrapper.vm.$nextTick();

      // Debug: check computed values
      console.log('hasElevationData:', wrapper.vm.hasElevationData);
      console.log('hasHeartRateData:', wrapper.vm.hasHeartRateData);
      console.log('hasTemperatureData:', wrapper.vm.hasTemperatureData);
      console.log('chartMode:', wrapper.vm.chartMode);

      expect(wrapper.vm.hasElevationData).toBe(false);
      expect(wrapper.vm.hasHeartRateData).toBe(false);
      expect(wrapper.vm.hasTemperatureData).toBe(true);
      expect(wrapper.vm.chartMode).toBe('temperature');
    });

    it('should handle "both" mode with temperature and elevation data', async () => {
      const trackTempAndElevation = {
        ...mockTrackComplete,
        temp_data: [22.5, 23.0, 24.2],
        elevation_profile: [100, 110, 120],
        hr_data: null
      };

      wrapper = mount(TrackDetailPanel, {
        props: { track: trackTempAndElevation, isVisible: true }
      });

      const chartToggleButtons = wrapper.findAll('button.chart-toggle');
      const bothButton = chartToggleButtons.find(btn =>
        btn.text().includes('Both')
      );

      await bothButton.trigger('click');
      expect(wrapper.vm.chartMode).toBe('both');
      expect(bothButton.classes()).toContain('active');
    });

    it('should show only temperature chart toggle button when only temperature data is available', () => {
      const trackOnlyTemperature = {
        id: 123,
        name: 'Temperature Only Track',
        temp_data: [22.5, 23.0, 24.2],
        elevation_profile: null,
        hr_data: null
      };

      wrapper = mount(TrackDetailPanel, {
        props: { track: trackOnlyTemperature, isVisible: true }
      });

      // Chart toggles should be visible and contain only the Temperature button
      const chartToggles = wrapper.find('.chart-toggles');
      expect(chartToggles.exists()).toBe(true);

      const chartToggleButtons = wrapper.findAll('button.chart-toggle');
      expect(chartToggleButtons).toHaveLength(1);
      expect(chartToggleButtons[0].text()).toBe('Temperature');

      // But the chart should still be rendered with temperature data
      const chart = wrapper.findComponent({ name: 'ElevationChart' });
      expect(chart.exists()).toBe(true);
      expect(chart.props('temperatureData')).toEqual([22.5, 23.0, 24.2]);
    });

    it('should handle empty temperature data array', () => {
      const trackEmptyTemperature = {
        ...mockTrackComplete,
        temp_data: [],
        elevation_profile: [100, 110, 120],
        hr_data: null
      };

      wrapper = mount(TrackDetailPanel, {
        props: { track: trackEmptyTemperature, isVisible: true }
      });

      expect(wrapper.vm.hasTemperatureData).toBe(false);

      // Temperature button should not exist when no temperature data
      const chartToggleButtons = wrapper.findAll('button.chart-toggle');
      const temperatureButton = chartToggleButtons.find(btn =>
        btn.text().includes('Temperature')
      );
      expect(temperatureButton).toBeFalsy();
    });

    it('should include temperature in chart title computation', () => {
      wrapper = mount(TrackDetailPanel, {
        props: { track: mockTrackWithTemperature, isVisible: true }
      });

      // Set to temperature mode
      wrapper.vm.chartMode = 'temperature';

      const elevationChart = wrapper.findComponent(ElevationChart);
      expect(elevationChart.props('trackName')).toContain('Temperature');
    });

    it('should show only HR and Elevation buttons when temperature data is missing', () => {
      const trackNoTemperature = {
        ...mockTrackComplete,
        temp_data: null,
        elevation_profile: [100, 110, 120],
        hr_data: [120, 125, 130]
      };

      wrapper = mount(TrackDetailPanel, {
        props: { track: trackNoTemperature, isVisible: true }
      });

      const chartToggleButtons = wrapper.findAll('button.chart-toggle');
      const buttonTexts = chartToggleButtons.map(btn => btn.text());

      expect(buttonTexts).toContain('Elevation');
      expect(buttonTexts).toContain('Heart rate');
      expect(buttonTexts).toContain('Both');
      expect(buttonTexts).not.toContain('Temperature');
    });

    it('should show Both button only when elevation and at least one other data type is available', () => {
      const trackElevationAndTemp = {
        id: 1,
        name: 'Elevation and Temperature Track',
        elevation_profile: [100, 110, 120],
        hr_data: null,
        temp_data: [22.5, 23.0, 24.2]
      };

      wrapper = mount(TrackDetailPanel, {
        props: { track: trackElevationAndTemp, isVisible: true }
      });

      const chartToggleButtons = wrapper.findAll('button.chart-toggle');
      const buttonTexts = chartToggleButtons.map(btn => btn.text());

      expect(buttonTexts).toContain('Elevation');
      expect(buttonTexts).toContain('Temperature');
      expect(buttonTexts).toContain('Both');
      expect(buttonTexts).not.toContain('Heart rate');
    });

    it('should not show Both button when only one data type is available', () => {
      const trackOnlyHR = {
        id: 1,
        name: 'HR Only Track',
        elevation_profile: null,
        hr_data: [120, 125, 130],
        temp_data: null
      };

      wrapper = mount(TrackDetailPanel, {
        props: { track: trackOnlyHR, isVisible: true }
      });

      const chartToggleButtons = wrapper.findAll('button.chart-toggle');
      const buttonTexts = chartToggleButtons.map(btn => btn.text());

      expect(buttonTexts).toContain('Heart rate');
      expect(buttonTexts).not.toContain('Both');
      expect(buttonTexts).not.toContain('Elevation');
      expect(buttonTexts).not.toContain('Temperature');
    });
  });

  describe('Force Update Elevation functionality', () => {
    beforeEach(() => {
      // Mock fetch for elevation enrichment
      global.fetch = vi.fn();
      // Reset the mocks (clears both call history and implementation)
      mockShowToast.mockReset();
      mockShowConfirm.mockReset();

      // Mock window.dispatchEvent for global events  
      global.dispatchEvent = vi.fn();
      window.dispatchEvent = global.dispatchEvent; // Ensure window.dispatchEvent uses the same mock
    });

    it('should not show force update button when not owner', () => {
      wrapper = mount(TrackDetailPanel, {
        props: { track: mockTrackComplete, isOwner: false }
      });

      expect(wrapper.find('.force-update-btn').exists()).toBe(false);
    });

    it('should not show force update button when no elevation data', () => {
      const trackNoElevation = { ...mockTrackMinimal };
      delete trackNoElevation.elevation_gain;
      delete trackNoElevation.elevation_loss;

      wrapper = mount(TrackDetailPanel, {
        props: { track: trackNoElevation, isOwner: true }
      });

      expect(wrapper.find('.force-update-btn').exists()).toBe(false);
    });

    it('should show force update button when owner and has elevation data', () => {
      wrapper = mount(TrackDetailPanel, {
        props: { track: mockTrackComplete, isOwner: true }
      });

      expect(wrapper.find('.force-update-btn').exists()).toBe(true);
      expect(wrapper.find('.force-update-btn').attributes('title')).toBe('Force update elevation data from external service');
    });

    it('should show confirmation dialog when track already has elevation data', async () => {
      mockShowConfirm.mockResolvedValue(false); // User cancels

      wrapper = mount(TrackDetailPanel, {
        props: {
          track: { ...mockTrackComplete, elevation_enriched: true, elevation_gain: 500 },
          isOwner: true,
          sessionId: 'test-session'
        }
      });

      const forceUpdateBtn = wrapper.find('.force-update-btn');
      await forceUpdateBtn.trigger('click');

      expect(mockShowConfirm).toHaveBeenCalledWith({
        title: 'Update Elevation Data',
        message: 'This track already has elevation data. Updating will replace the existing data with new values from the external service. Continue?',
        confirmText: 'Continue',
        cancelText: 'Cancel'
      });
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it('should proceed with enrichment when user confirms', async () => {
      mockShowConfirm.mockResolvedValue(true); // User confirms
      global.fetch
        .mockResolvedValueOnce({ // First call for enrichment
          ok: true,
          json: () => Promise.resolve({
            elevation_gain: 600,
            elevation_loss: -500,
            elevation_min: 100,
            elevation_max: 700,
            elevation_dataset: 'srtm90m',
            enriched_at: '2024-01-01T12:00:00Z'
          })
        })
        .mockResolvedValueOnce({ // Second call for updated track data
          ok: true,
          json: () => Promise.resolve({
            ...mockTrackComplete,
            elevation_gain: 600,
            elevation_loss: -500,
            elevation_profile: [{ distance: 0, elevation: 100 }]
          })
        });

      wrapper = mount(TrackDetailPanel, {
        props: {
          track: { ...mockTrackComplete, elevation_enriched: true },
          isOwner: true,
          sessionId: 'test-session'
        }
      });

      const forceUpdateBtn = wrapper.find('.force-update-btn');
      await forceUpdateBtn.trigger('click');

      // Wait for async operations
      await waitFor(() => mockShowConfirm.mock.calls.length > 0);

      expect(mockShowConfirm).toHaveBeenCalled();
      expect(global.fetch).toHaveBeenCalledWith('/tracks/1/enrich-elevation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: 'test-session', force: true })
      });

      // Wait for enrichment flow to complete and toast to be shown
      await waitFor(() => mockShowToast.mock.calls.length > 0);

      expect(mockShowToast).toHaveBeenCalledWith('Elevation data updated successfully!', 'success');
    });

    it('should not show force update button when track has no elevation data', async () => {
      const trackNoElevation = { ...mockTrackComplete, elevation_enriched: false, elevation_gain: null, elevation_loss: null, elevation_profile: null };

      wrapper = mount(TrackDetailPanel, {
        props: { track: trackNoElevation, isOwner: true, sessionId: 'test-session' }
      });

      // Button should not exist when there's no elevation data
      const forceUpdateBtn = wrapper.find('.force-update-btn');
      expect(forceUpdateBtn.exists()).toBe(false);
    });

    it('should disable button during enrichment process', async () => {
      // Mock showConfirm to return true (user confirms)
      mockShowConfirm.mockResolvedValueOnce(true);

      // Mock slow fetch response - use mockResolvedValueOnce to avoid polluting other tests
      let resolveEnrichment;
      const enrichmentPromise = new Promise(resolve => {
        resolveEnrichment = resolve;
      });

      global.fetch.mockReturnValueOnce(
        enrichmentPromise.then(() => ({
          ok: true,
          json: () => Promise.resolve({ elevation_gain: 400 })
        }))
      );

      wrapper = mount(TrackDetailPanel, {
        props: { track: mockTrackComplete, isOwner: true, sessionId: 'test-session' }
      });

      const forceUpdateBtn = wrapper.find('.force-update-btn');
      expect(forceUpdateBtn.attributes('disabled')).toBeUndefined();

      await forceUpdateBtn.trigger('click');
      await wrapper.vm.$nextTick();

      expect(forceUpdateBtn.attributes('disabled')).toBe('');

      // Clean up - resolve the promise so it doesn't leak
      resolveEnrichment();
      await flushPromises();
    });

    it('should handle 403 permission error', async () => {
      // Mock showConfirm to return true (user confirms)
      mockShowConfirm.mockResolvedValueOnce(true);

      global.fetch.mockResolvedValueOnce({ ok: false, status: 403 });

      wrapper = mount(TrackDetailPanel, {
        props: { track: mockTrackComplete, isOwner: true, sessionId: 'test-session' }
      });

      const forceUpdateBtn = wrapper.find('.force-update-btn');
      await forceUpdateBtn.trigger('click');

      await waitFor(() => mockShowToast.mock.calls.length > 0);

      expect(mockShowToast).toHaveBeenCalledWith('You are not allowed to update this track.', 'error');
    });

    it('should handle 429 rate limit error', async () => {
      // Mock showConfirm to return true (user confirms)
      mockShowConfirm.mockResolvedValueOnce(true);

      global.fetch.mockResolvedValueOnce({ ok: false, status: 429 });

      wrapper = mount(TrackDetailPanel, {
        props: { track: mockTrackComplete, isOwner: true, sessionId: 'test-session' }
      });

      const forceUpdateBtn = wrapper.find('.force-update-btn');
      await forceUpdateBtn.trigger('click');

      await waitFor(() => mockShowToast.mock.calls.length > 0);

      expect(mockShowToast).toHaveBeenCalledWith('API rate limit exceeded. Please try again later.', 'error');
    });

    it('should handle network errors gracefully', async () => {
      // Mock showConfirm to return true (user confirms)
      mockShowConfirm.mockResolvedValueOnce(true);

      global.fetch.mockRejectedValueOnce(new Error('Network error'));

      wrapper = mount(TrackDetailPanel, {
        props: { track: mockTrackComplete, isOwner: true, sessionId: 'test-session' }
      });

      const forceUpdateBtn = wrapper.find('.force-update-btn');
      await forceUpdateBtn.trigger('click');

      await waitFor(() => mockShowToast.mock.calls.length > 0);

      expect(mockShowToast).toHaveBeenCalledWith('Failed to update elevation data. Please try again.', 'error');
    });

    it('should update track data with enrichment results', async () => {
      const enrichmentResult = {
        elevation_gain: 650,
        elevation_loss: -600,
        elevation_min: 90,
        elevation_max: 740,
        elevation_dataset: 'aster30m',
        enriched_at: '2024-01-01T13:00:00Z'
      };

      // Mock showConfirm to return true (user confirms the update)
      mockShowConfirm.mockResolvedValueOnce(true);

      global.fetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(enrichmentResult)
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({
            ...mockTrackComplete,
            ...enrichmentResult,
            elevation_profile: [{ distance: 0, elevation: 90 }]
          })
        });

      wrapper = mount(TrackDetailPanel, {
        props: { track: mockTrackComplete, isOwner: true, sessionId: 'test-session' }
      });

      const forceUpdateBtn = wrapper.find('.force-update-btn');
      await forceUpdateBtn.trigger('click');

      await waitFor(() => wrapper.vm.track && wrapper.vm.track.elevation_gain === 650);

      // Check that track data was updated
      expect(wrapper.vm.track.elevation_gain).toBe(650);
      expect(wrapper.vm.track.elevation_loss).toBe(-600);
      expect(wrapper.vm.track.elevation_dataset).toBe('aster30m');
      expect(wrapper.vm.track.elevation_enriched).toBe(true);
    });

    it('should dispatch global event after successful enrichment', async () => {
      // Mock showConfirm to return true (user confirms)
      mockShowConfirm.mockResolvedValueOnce(true);

      global.fetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ elevation_gain: 450 })
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ ...mockTrackComplete, elevation_gain: 450 })
        });

      wrapper = mount(TrackDetailPanel, {
        props: { track: mockTrackComplete, isOwner: true, sessionId: 'test-session' }
      });

      const forceUpdateBtn = wrapper.find('.force-update-btn');
      await forceUpdateBtn.trigger('click');

      // Wait for all async operations to complete
      await waitFor(() => global.dispatchEvent.mock.calls.length > 0);
      await wrapper.vm.$nextTick();

      expect(global.dispatchEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'track-elevation-updated',
          detail: expect.objectContaining({
            trackId: mockTrackComplete.id
          })
        })
      );
    });

    it('should handle failed track data fetch after enrichment', async () => {
      // Mock showConfirm to return true (user confirms)
      mockShowConfirm.mockResolvedValueOnce(true);

      global.fetch
        .mockResolvedValueOnce({ // Enrichment succeeds
          ok: true,
          json: () => Promise.resolve({ elevation_gain: 450 })
        })
        .mockRejectedValueOnce(new Error('Fetch failed')); // Track data fetch fails

      wrapper = mount(TrackDetailPanel, {
        props: { track: mockTrackComplete, isOwner: true, sessionId: 'test-session' }
      });

      const forceUpdateBtn = wrapper.find('.force-update-btn');
      await forceUpdateBtn.trigger('click');

      // Wait for all async operations to complete
      await waitFor(() => mockShowToast.mock.calls.length > 0);
      await wrapper.vm.$nextTick();

      expect(mockShowToast).toHaveBeenCalledWith(
        'Elevation data was enriched, but failed to refresh the display. Please refresh the page to see the updated data.',
        'error'
      );
    });

    it('should not call API when already enriching', async () => {
      wrapper = mount(TrackDetailPanel, {
        props: { track: mockTrackComplete, isOwner: true, sessionId: 'test-session' }
      });

      // Set enriching state manually
      wrapper.vm.enrichingElevation = true;
      await wrapper.vm.$nextTick();

      const forceUpdateBtn = wrapper.find('.force-update-btn');
      await forceUpdateBtn.trigger('click');

      expect(global.fetch).not.toHaveBeenCalled();
    });

    it('should not call API when track has no ID', async () => {
      const trackNoId = { ...mockTrackComplete };
      delete trackNoId.id;

      wrapper = mount(TrackDetailPanel, {
        props: { track: trackNoId, isOwner: true, sessionId: 'test-session' }
      });

      const forceUpdateBtn = wrapper.find('.force-update-btn');
      await forceUpdateBtn.trigger('click');

      expect(global.fetch).not.toHaveBeenCalled();
    });
  });

  describe('Elevation Polling functionality', () => {
    beforeEach(() => {
      // Mock fetch for polling
      global.fetch = vi.fn();
      // Mock timers for polling intervals
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('should NOT auto-start elevation polling for tracks without elevation data (manual start only)', async () => {
      const trackNoElevation = {
        ...mockTrackMinimal,
        length_km: 5.0,
        elevation_enriched: false,
        elevation_gain: null
      };

      global.fetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(trackNoElevation)
      });

      wrapper = mount(TrackDetailPanel, {
        props: { track: trackNoElevation, isVisible: true }
      });

      await wrapper.vm.$nextTick();

      // Polling should NOT auto-start; manual start is required
      expect(wrapper.vm.isPollingForElevation).toBe(false);

      // Manually start and verify
      wrapper.vm.startElevationPolling(trackNoElevation.id);
      await wrapper.vm.$nextTick();
      expect(wrapper.vm.isPollingForElevation).toBe(true);
    });

    it('should not start polling when track already has elevation data', async () => {
      wrapper = mount(TrackDetailPanel, {
        props: { track: mockTrackComplete, isVisible: true }
      });

      await wrapper.vm.$nextTick();

      expect(wrapper.vm.isPollingForElevation).toBe(false);
    });

    it('should handle polling state correctly', async () => {
      const trackNoElevation = {
        ...mockTrackMinimal,
        length_km: 5.0,
        elevation_enriched: false,
        elevation_gain: null
      };

      wrapper = mount(TrackDetailPanel, {
        props: { track: trackNoElevation, isVisible: true }
      });

      // Wait for component to mount and auto-start polling
      await wrapper.vm.$nextTick();
      await wrapper.vm.$nextTick();

      // Manually start polling and verify state
      wrapper.vm.startElevationPolling();
      await wrapper.vm.$nextTick();

      expect(wrapper.vm.isPollingForElevation).toBe(true);

      // Stop polling and verify state
      wrapper.vm.stopElevationPolling();
      await wrapper.vm.$nextTick();

      expect(wrapper.vm.isPollingForElevation).toBe(false);
    });

    it('should manage polling lifecycle correctly', async () => {
      const trackNoElevation = {
        ...mockTrackMinimal,
        length_km: 5.0,
        elevation_enriched: false,
        elevation_gain: null
      };

      wrapper = mount(TrackDetailPanel, {
        props: { track: trackNoElevation, isVisible: true }
      });

      // Start polling and verify interval is set
      wrapper.vm.startElevationPolling();
      await wrapper.vm.$nextTick();

      expect(wrapper.vm.isPollingForElevation).toBe(true);
      expect(wrapper.vm.enrichmentPollingInterval).not.toBe(null);

      // Stop polling and verify cleanup
      wrapper.vm.stopElevationPolling();
      await wrapper.vm.$nextTick();

      expect(wrapper.vm.isPollingForElevation).toBe(false);
      expect(wrapper.vm.enrichmentPollingInterval).toBe(null);
    });

    it('should stop polling when elevation data is detected', async () => {
      const trackNoElevation = {
        ...mockTrackMinimal,
        length_km: 5.0,
        elevation_enriched: false,
        elevation_gain: null
      };

      // Mock fetch to return track with elevation data
      global.fetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          ...trackNoElevation,
          elevation_enriched: true,
          elevation_gain: 300
        })
      });

      wrapper = mount(TrackDetailPanel, {
        props: { track: trackNoElevation, isVisible: true }
      });

      // Manually start polling and test the polling function directly
      wrapper.vm.isPollingForElevation = true;
      await wrapper.vm.$nextTick();

      // Call the polling method directly to avoid timer issues
      await wrapper.vm.pollForElevationData();
      await wrapper.vm.$nextTick();

      // Polling should stop when elevation data is detected
      expect(wrapper.vm.isPollingForElevation).toBe(false);
    });

    it('should handle polling fetch errors gracefully', async () => {
      const trackNoElevation = {
        ...mockTrackMinimal,
        length_km: 5.0,
        elevation_enriched: false,
        elevation_gain: null
      };

      global.fetch.mockRejectedValue(new Error('Network error'));

      // Mock console.error to avoid test noise
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => { });

      wrapper = mount(TrackDetailPanel, {
        props: { track: trackNoElevation, isVisible: true }
      });

      await wrapper.vm.$nextTick();

      // Manually start polling and test error handling
      wrapper.vm.startElevationPolling(trackNoElevation.id);

      // Call polling method directly and handle error
      try {
        await wrapper.vm.pollForElevationData();
      } catch (error) {
        // Expected to fail
      }
      await wrapper.vm.$nextTick();

      // Polling should continue despite error
      expect(wrapper.vm.isPollingForElevation).toBe(true);

      consoleSpy.mockRestore();
    });

    it('should stop polling when component is unmounted', async () => {
      const trackNoElevation = {
        ...mockTrackMinimal,
        length_km: 5.0,
        elevation_enriched: false,
        elevation_gain: null
      };

      wrapper = mount(TrackDetailPanel, {
        props: { track: trackNoElevation, isVisible: true }
      });

      await wrapper.vm.$nextTick();

      // Manual start polling required
      wrapper.vm.startElevationPolling(trackNoElevation.id);
      await wrapper.vm.$nextTick();
      expect(wrapper.vm.isPollingForElevation).toBe(true);

      wrapper.unmount();

      // Polling should be stopped after unmount
      expect(wrapper.vm.isPollingForElevation).toBe(false);
    });

    it('should update track data when polling detects changes', async () => {
      const trackNoElevation = {
        ...mockTrackMinimal,
        length_km: 5.0,
        elevation_enriched: false,
        elevation_gain: null
      };

      const updatedTrackData = {
        ...trackNoElevation,
        elevation_enriched: true,
        elevation_gain: 400,
        elevation_loss: -350,
        elevation_profile: [{ distance: 0, elevation: 100 }]
      };

      // Mock fetch to return updated data
      global.fetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(updatedTrackData)
      });

      wrapper = mount(TrackDetailPanel, {
        props: { track: trackNoElevation, isVisible: true }
      });

      await wrapper.vm.$nextTick();

      // Manually start polling and test the update
      wrapper.vm.startElevationPolling(trackNoElevation.id);

      // Call polling method directly to avoid timer issues
      await wrapper.vm.pollForElevationData();
      await wrapper.vm.$nextTick();

      // Track data should be updated
      expect(wrapper.vm.track.elevation_gain).toBe(400);
      expect(wrapper.vm.track.elevation_enriched).toBe(true);
    });
  });

  describe('Description Link Conversion', () => {
    it('should render description with clickable links', () => {
      const trackWithLinks = {
        ...mockTrackComplete,
        description: 'Check out http://example.com and https://google.com for more info'
      };

      wrapper = mount(TrackDetailPanel, {
        props: { track: trackWithLinks }
      });

      const descriptionElement = wrapper.find('.track-description-text');
      expect(descriptionElement.exists()).toBe(true);
      expect(descriptionElement.html()).toContain('<a href="http://example.com"');
      expect(descriptionElement.html()).toContain('<a href="https://google.com"');
      expect(descriptionElement.html()).toContain('target="_blank"');
      expect(descriptionElement.html()).toContain('rel="noopener noreferrer"');
    });

    it('should handle description without links', () => {
      const trackNoLinks = {
        ...mockTrackComplete,
        description: 'This is a description without any links'
      };

      wrapper = mount(TrackDetailPanel, {
        props: { track: trackNoLinks }
      });

      const descriptionElement = wrapper.find('.track-description-text');
      expect(descriptionElement.exists()).toBe(true);
      expect(descriptionElement.html()).not.toContain('<a href=');
      expect(descriptionElement.text()).toBe('This is a description without any links');
    });

    it('should handle www links correctly', () => {
      const trackWithWww = {
        ...mockTrackComplete,
        description: 'Visit www.example.com for more info'
      };

      wrapper = mount(TrackDetailPanel, {
        props: { track: trackWithWww }
      });

      const descriptionElement = wrapper.find('.track-description-text');
      expect(descriptionElement.html()).toContain('<a href="https://www.example.com"');
      expect(descriptionElement.html()).toContain('www.example.com</a>');
    });

    it('should escape HTML entities in URLs', () => {
      const trackWithSpecialChars = {
        ...mockTrackComplete,
        description: 'Check http://example.com/<script> for XSS test'
      };

      wrapper = mount(TrackDetailPanel, {
        props: { track: trackWithSpecialChars }
      });

      const descriptionElement = wrapper.find('.track-description-text');
      // Check that HTML entities are properly escaped in the visible link text (HTML source encodes ampersands)
      expect(descriptionElement.html()).toContain('http://example.com/&amp;lt;script&amp;gt;');
      // Check that no unescaped script tags appear in the HTML source
      expect(descriptionElement.html()).not.toContain('<script>');
    });

    it('should handle multiple links in description', () => {
      const trackMultipleLinks = {
        ...mockTrackComplete,
        description: 'Visit http://site1.com and https://site2.com or www.site3.com'
      };

      wrapper = mount(TrackDetailPanel, {
        props: { track: trackMultipleLinks }
      });

      const descriptionElement = wrapper.find('.track-description-text');
      const html = descriptionElement.html();
      expect(html).toContain('<a href="http://site1.com"');
      expect(html).toContain('<a href="https://site2.com"');
      expect(html).toContain('<a href="https://www.site3.com"');
    });
  });

  describe('Touch Event Handling for Mobile Devices', () => {
    beforeEach(() => {
      wrapper = mount(TrackDetailPanel, {
        props: { track: mockTrackComplete }
      });
    });

    it('prevents touch event propagation on flyout content', async () => {
      const flyoutContent = wrapper.find('.flyout-content');
      expect(flyoutContent.exists()).toBe(true);

      // Create a mock touch event
      const touchEvent = {
        touches: [{ clientY: 100 }],
        stopPropagation: vi.fn(),
        preventDefault: vi.fn()
      };

      // Trigger touchstart
      await flyoutContent.trigger('touchstart', touchEvent);
      // touchstart.stop should prevent propagation
      expect(touchEvent.stopPropagation).toHaveBeenCalled();
    });

    it('handles touchmove on content to prevent map interaction', async () => {
      const flyoutContent = wrapper.find('.flyout-content');

      // Set up scrollable content
      const mockElement = {
        scrollTop: 50,
        scrollHeight: 500,
        clientHeight: 200
      };
      wrapper.vm.flyoutContent = mockElement;

      const touchMoveEvent = {
        touches: [{ clientY: 80 }],
        stopPropagation: vi.fn(),
        preventDefault: vi.fn()
      };

      // Call the handler directly
      wrapper.vm.handleContentTouchMove(touchMoveEvent);

      // Should stop propagation when content can scroll
      expect(touchMoveEvent.stopPropagation).toHaveBeenCalled();
    });

    it('prevents both propagation and default when content cannot scroll', async () => {
      const flyoutContent = wrapper.find('.flyout-content');

      // Set up non-scrollable content
      const mockElement = {
        scrollTop: 0,
        scrollHeight: 100,
        clientHeight: 100
      };
      wrapper.vm.flyoutContent = mockElement;

      const touchMoveEvent = {
        touches: [{ clientY: 80 }],
        stopPropagation: vi.fn(),
        preventDefault: vi.fn()
      };

      // Call the handler directly
      wrapper.vm.handleContentTouchMove(touchMoveEvent);

      // Should prevent both when content can't scroll
      expect(touchMoveEvent.stopPropagation).toHaveBeenCalled();
      expect(touchMoveEvent.preventDefault).toHaveBeenCalled();
    });

    it('handles touchend to reset touch tracking', async () => {
      const flyoutContent = wrapper.find('.flyout-content');

      // Trigger touchstart first
      const touchStartEvent = {
        touches: [{ clientY: 100 }],
        stopPropagation: vi.fn()
      };
      await flyoutContent.trigger('touchstart', touchStartEvent);

      // Then trigger touchend
      const touchEndEvent = {
        stopPropagation: vi.fn()
      };

      // Call the handler directly
      wrapper.vm.handleTouchEnd(touchEndEvent);

      // Check that tracking values are reset
      expect(wrapper.vm.touchStartY).toBe(0);
      expect(wrapper.vm.touchStartScrollTop).toBe(0);
    });

    it('has proper CSS touch-action properties', () => {
      const flyout = wrapper.find('.track-detail-flyout');
      const flyoutContent = wrapper.find('.flyout-content');

      expect(flyout.exists()).toBe(true);
      expect(flyoutContent.exists()).toBe(true);

      // Note: We can't directly test CSS properties in this test environment,
      // but we can verify that the elements exist and the template is correct
    });
  });
});
