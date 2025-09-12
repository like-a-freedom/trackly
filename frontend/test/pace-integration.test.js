import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import { computed } from 'vue';
import TrackDetailPanel from '../src/components/TrackDetailPanel.vue';

// Mock all the required dependencies
vi.mock('../src/components/ElevationChart.vue', () => ({
  default: {
    name: 'ElevationChart',
    props: ['elevationData', 'heartRateData', 'temperatureData', 'slopeData', 'speedData', 'coordinateData', 'timeData', 'trackName', 'totalDistance', 'chartMode', 'distanceUnit', 'elevationStats'],
    template: '<div class="elevation-chart-mock" :data-chart-mode="chartMode" :data-has-speed-data="!!speedData" :data-has-coordinate-data="!!coordinateData" :data-has-time-data="!!timeData"></div>'
  }
}));

// Mock composables
vi.mock('../src/composables/useTracks.js', () => ({
  validateSpeedData: vi.fn(speed => typeof speed === 'number' && speed > 0 ? speed : null),
  formatSpeed: vi.fn((speed, unit) => `${speed} ${unit === 'mph' ? 'mph' : 'km/h'}`),
  calculatePaceFromSpeed: vi.fn((speed, unit) => {
    if (!speed || speed <= 0) return 'N/A';
    const pace = 60 / speed;
    const minutes = Math.floor(pace);
    const seconds = Math.round((pace - minutes) * 60);
    return `${minutes}:${seconds.toString().padStart(2, '0')} ${unit}`;
  }),
  formatPace: vi.fn((pace, unit) => {
    if (!pace || pace <= 0) return 'N/A';
    const minutes = Math.floor(pace);
    const seconds = Math.round((pace - minutes) * 60);
    return `${minutes}:${seconds.toString().padStart(2, '0')} ${unit}`;
  })
}));

vi.mock('../src/composables/useUnits.js', () => ({
  useUnits: () => ({
    speedUnit: { value: 'kmh' },
    setSpeedUnit: vi.fn(),
    getDistanceUnit: vi.fn(() => 'km'),
    getPaceUnit: vi.fn(() => 'min/km'),
    convertPace: vi.fn(pace => pace)
  })
}));

vi.mock('../src/composables/useMemoization.js', () => ({
  useMemoizedComputed: (fn, deps, options) => {
    return computed(() => fn(...deps.map(dep => dep())));
  },
  clearCacheByPattern: vi.fn()
}));

vi.mock('../src/composables/useAdvancedDebounce.js', () => ({
  useAdvancedDebounce: vi.fn((fn) => fn)
}));

vi.mock('../src/composables/useToast.js', () => ({
  useToast: () => ({
    showToast: vi.fn()
  })
}));

vi.mock('../src/composables/useConfirm.js', () => ({
  useConfirm: () => ({
    showConfirm: vi.fn(() => Promise.resolve(true))
  })
}));

vi.mock('../src/utils/format.js', () => ({
  formatDuration: vi.fn(seconds => `${Math.floor(seconds / 60)}:${(seconds % 60).toString().padStart(2, '0')}`),
  formatDistance: vi.fn((km, unit) => `${km.toFixed(2)} ${unit}`),
  convertUrlsToLinks: vi.fn(text => text)
}));

describe('Pace Integration in TrackDetailPanel', () => {
  const mockTrackWithPaceData = {
    id: 'test-track-123',
    name: 'Running Track with Pace',
    description: 'A test track with pace data',
    categories: ['running'],
    auto_classifications: ['aerobic_run'],
    geom_geojson: {
      type: 'LineString',
      coordinates: [
        [-122.4194, 37.7749], // San Francisco
        [-122.4094, 37.7849], // Moved slightly
        [-122.3994, 37.7949]  // Moved more
      ]
    },
    length_km: 2.5,
    elevation_profile: [100, 110, 105],
    hr_data: [130, 140, 135],
    temp_data: [20, 21, 22],
    time_data: [
      '2023-01-01T10:00:00Z',
      '2023-01-01T10:05:00Z', // 5 minutes later
      '2023-01-01T10:10:00Z'  // 10 minutes later
    ],
    speed_data: [12, 10, 8], // km/h speeds
    elevation_gain: 15,
    elevation_loss: -5,
    elevation_min: 100,
    elevation_max: 110,
    elevation_enriched: true,
    elevation_dataset: 'srtm30m',
    avg_speed: 10,
    moving_avg_speed: 10,
    moving_avg_pace: 6, // min/km
    avg_hr: 135,
    duration_seconds: 600,
    created_at: '2023-01-01T09:00:00Z',
    updated_at: '2023-01-01T09:30:00Z',
    recorded_at: '2023-01-01T10:00:00Z'
  };

  it('should detect pace data availability', () => {
    const wrapper = mount(TrackDetailPanel, {
      props: {
        track: mockTrackWithPaceData,
        isOwner: true,
        sessionId: 'test-session'
      },
      global: {
        stubs: {
          RouterLink: true
        }
      }
    });

    // Check if pace data is detected
    expect(wrapper.vm.hasPaceData).toBe(true);
  });

  it('should pass pace data to ElevationChart component', () => {
    const wrapper = mount(TrackDetailPanel, {
      props: {
        track: mockTrackWithPaceData,
        isOwner: true,
        sessionId: 'test-session'
      },
      global: {
        stubs: {
          RouterLink: true
        }
      }
    });

    const elevationChart = wrapper.findComponent({ name: 'ElevationChart' });
    expect(elevationChart.exists()).toBe(true);
    
    // Check that pace-related props are passed
    expect(elevationChart.props('speedData')).toEqual(mockTrackWithPaceData.speed_data);
    expect(elevationChart.props('coordinateData')).toEqual(mockTrackWithPaceData.geom_geojson.coordinates);
    expect(elevationChart.props('timeData')).toEqual(mockTrackWithPaceData.time_data);
  });

  it('should show pace toggle button when pace data is available', () => {
    const wrapper = mount(TrackDetailPanel, {
      props: {
        track: mockTrackWithPaceData,
        isOwner: true,
        sessionId: 'test-session'
      },
      global: {
        stubs: {
          RouterLink: true
        }
      }
    });

    // Look for pace toggle button
    const paceToggle = wrapper.find('.chart-toggle').findWhere(toggle => 
      toggle.text().includes('Pace')
    );
    expect(paceToggle.exists()).toBe(true);
  });

  it('should handle tracks without pace data gracefully', () => {
    const trackWithoutPaceData = {
      ...mockTrackWithPaceData,
      speed_data: null,
      time_data: null,
      geom_geojson: { type: 'LineString', coordinates: [] }
    };

    const wrapper = mount(TrackDetailPanel, {
      props: {
        track: trackWithoutPaceData,
        isOwner: true,
        sessionId: 'test-session'
      },
      global: {
        stubs: {
          RouterLink: true
        }
      }
    });

    // Check that pace data is not detected
    expect(wrapper.vm.hasPaceData).toBe(false);
    
    // Pace toggle should not be visible
    const paceToggle = wrapper.find('.chart-toggle').findWhere(toggle => 
      toggle.text().includes('Pace')
    );
    expect(paceToggle.exists()).toBe(false);
  });

  it('should include pace data in "Both" mode calculation', () => {
    const wrapper = mount(TrackDetailPanel, {
      props: {
        track: mockTrackWithPaceData,
        isOwner: true,
        sessionId: 'test-session'
      },
      global: {
        stubs: {
          RouterLink: true
        }
      }
    });

    // Find the "Both" toggle button
    const bothToggle = wrapper.find('.chart-toggle').findWhere(toggle => 
      toggle.text().includes('Both')
    );
    expect(bothToggle.exists()).toBe(true);
    
    // The "Both" mode should be available since we have elevation + pace data
    expect(wrapper.vm.hasElevationData).toBe(true);
    expect(wrapper.vm.hasPaceData).toBe(true);
  });
});