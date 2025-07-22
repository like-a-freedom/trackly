import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import TrackDetailPanel from '../TrackDetailPanel.vue';
import ElevationChart from '../ElevationChart.vue';

// Mock the ElevationChart component
vi.mock('../ElevationChart.vue', () => ({
  default: {
    name: 'ElevationChart',
    template: '<div class="elevation-chart-mock">Elevation Chart</div>',
    props: ['elevationData', 'heartRateData', 'temperatureData', 'trackName', 'totalDistance', 'chartMode']
  }
}));

// Mock the useTracks composable
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
    elevation_up: 500,
    elevation_down: -450,
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
        elevation_up: 200,
        elevation_down: -300
      };

      wrapper = mount(TrackDetailPanel, {
        props: { track: trackNegativeElevation }
      });

      expect(wrapper.text()).toContain('-100 m');
    });

    it('hides elevation section when no elevation data available', () => {
      const trackNoElevation = { ...mockTrackMinimal };
      wrapper = mount(TrackDetailPanel, {
        props: { track: trackNoElevation }
      });

      expect(wrapper.text()).not.toContain('Elevation');
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

    it('hides categories section when no categories available', () => {
      const trackNoCategories = { ...mockTrackMinimal };
      wrapper = mount(TrackDetailPanel, {
        props: { track: trackNoCategories }
      });

      expect(wrapper.text()).not.toContain('Categories');
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

      // Should not show chart section or placeholder when no data
      expect(wrapper.find('.chart-section').exists()).toBe(false);
      expect(wrapper.find('.elevation-profile-placeholder').exists()).toBe(false);
    });

    it('hides elevation section when no elevation data available', () => {
      const trackNoElevation = { ...mockTrackMinimal };
      wrapper = mount(TrackDetailPanel, {
        props: { track: trackNoElevation }
      });

      expect(wrapper.text()).not.toContain('Elevation');
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
        elevation_up: 10000,
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
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true })
      });

      wrapper = mount(TrackDetailPanel, {
        props: { track: mockTrackComplete, isOwner: true, sessionId: 'test-session' }
      });

      // Enter edit mode
      await wrapper.find('.edit-name-btn').trigger('click');
      await wrapper.vm.$nextTick();

      // Change name
      const input = wrapper.find('.edit-name-input');
      await input.setValue('Updated Track Name');

      // Save
      await wrapper.find('.save-btn').trigger('click');
      await wrapper.vm.$nextTick();

      expect(global.fetch).toHaveBeenCalledWith('/tracks/1/name', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Updated Track Name', session_id: 'test-session' })
      });

      expect(wrapper.emitted('name-updated')).toEqual([['Updated Track Name']]);
      expect(wrapper.vm.isEditingName).toBe(false);
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
      global.fetch.mockResolvedValueOnce({
        ok: false,
        status: 403
      });

      wrapper = mount(TrackDetailPanel, {
        props: { track: mockTrackComplete, isOwner: true }
      });

      // Enter edit mode and save
      await wrapper.find('.edit-name-btn').trigger('click');
      await wrapper.vm.$nextTick();

      const input = wrapper.find('.edit-name-input');
      await input.setValue('New Name');

      await wrapper.find('.save-btn').trigger('click');
      await wrapper.vm.$nextTick();

      expect(wrapper.find('.edit-name-error').text()).toBe('You are not allowed to edit this track name.');
    });

    it('should handle network error', async () => {
      global.fetch.mockRejectedValueOnce(new Error('Network error'));

      wrapper = mount(TrackDetailPanel, {
        props: { track: mockTrackComplete, isOwner: true }
      });

      // Enter edit mode and save
      await wrapper.find('.edit-name-btn').trigger('click');
      await wrapper.vm.$nextTick();

      const input = wrapper.find('.edit-name-input');
      await input.setValue('New Name');

      await wrapper.find('.save-btn').trigger('click');
      await wrapper.vm.$nextTick();

      expect(wrapper.find('.edit-name-error').text()).toBe('Network error.');
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
      await new Promise(resolve => setTimeout(resolve, 0));

      expect(fetch).toHaveBeenCalledWith(`/tracks/${track.id}/export`);
      // Check that createElement was called with 'a' after clicking export
      expect(document.createElement).toHaveBeenCalledWith('a');
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
      await new Promise(resolve => setTimeout(resolve, 0));

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

    it('should show only available chart toggle buttons based on data', () => {
      // Test with only elevation data
      const trackOnlyElevation = {
        id: 1,
        name: 'Elevation Only Track',
        elevation_profile: [100, 110, 120],
        hr_data: null,
        temp_data: null
      };

      wrapper = mount(TrackDetailPanel, {
        props: { track: trackOnlyElevation, isVisible: true }
      });

      const chartToggleButtons = wrapper.findAll('button.chart-toggle');
      expect(chartToggleButtons).toHaveLength(1);
      expect(chartToggleButtons[0].text()).toBe('Elevation');
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
});
