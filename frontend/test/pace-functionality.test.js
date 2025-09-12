import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import ElevationChart from '../src/components/ElevationChart.vue';

// Mock Chart.js
vi.mock('vue-chartjs', () => ({
  Line: {
    name: 'Line',
    props: ['data', 'options'],
    template: '<div class="chart-mock" :data-chart-data="JSON.stringify(data)" :data-chart-options="JSON.stringify(options)"></div>'
  }
}));

// Mock Chart.js registration
vi.mock('chart.js', () => ({
  Chart: {
    register: vi.fn()
  },
  Title: {},
  Tooltip: {},
  Legend: {},
  LineElement: {},
  CategoryScale: {},
  LinearScale: {},
  PointElement: {},
  Filler: {}
}));

describe('Pace Functionality', () => {
  it('should detect pace data from speed data', () => {
    const wrapper = mount(ElevationChart, {
      props: {
        elevationData: [],
        heartRateData: [],
        temperatureData: [],
        slopeData: [],
        speedData: [10, 8, 12, 15, 6], // km/h speeds
        coordinateData: [],
        timeData: [],
        trackName: 'Test Track',
        totalDistance: 5.0,
        chartMode: 'pace',
        elevationStats: {},
        distanceUnit: 'km'
      }
    });

    // Check if pace data is detected
    expect(wrapper.vm.hasPace).toBe(true);
  });

  it('should calculate pace from coordinate and time data', () => {
    const coordinateData = [
      [37.7749, -122.4194], // San Francisco
      [37.7849, -122.4094], // Moved slightly north and east
      [37.7949, -122.3994]  // Moved more north and east
    ];
    
    const timeData = [
      '2023-01-01T10:00:00Z',
      '2023-01-01T10:05:00Z', // 5 minutes later
      '2023-01-01T10:10:00Z'  // 10 minutes later
    ];

    const wrapper = mount(ElevationChart, {
      props: {
        elevationData: [],
        heartRateData: [],
        temperatureData: [],
        slopeData: [],
        speedData: [],
        coordinateData: coordinateData,
        timeData: timeData,
        trackName: 'Test Track',
        totalDistance: 5.0,
        chartMode: 'pace',
        elevationStats: {},
        distanceUnit: 'km'
      }
    });

    // Check if pace data is detected from coordinate/time data
    expect(wrapper.vm.hasPace).toBe(true);
  });

  it('should convert speed to pace correctly', () => {
    const wrapper = mount(ElevationChart, {
      props: {
        elevationData: [],
        heartRateData: [],
        temperatureData: [],
        slopeData: [],
        speedData: [12], // 12 km/h should be 5 min/km pace
        coordinateData: [],
        timeData: [],
        trackName: 'Test Track',
        totalDistance: 1.0,
        chartMode: 'pace',
        elevationStats: {},
        distanceUnit: 'km'
      }
    });

    const chartData = wrapper.vm.chartData;
    expect(chartData.datasets).toBeDefined();
    expect(chartData.datasets.length).toBeGreaterThan(0);
    
    const paceDataset = chartData.datasets.find(d => d.yAxisID === 'y-pace');
    expect(paceDataset).toBeDefined();
    expect(paceDataset.label).toBe('Pace (min/km)');
    
    // 12 km/h = 60/12 = 5 min/km
    expect(paceDataset.data[0]).toBe(5);
  });

  it('should handle null speed values in pace calculation', () => {
    const wrapper = mount(ElevationChart, {
      props: {
        elevationData: [],
        heartRateData: [],
        temperatureData: [],
        slopeData: [],
        speedData: [12, null, 0, 8], // Mix of valid and invalid speeds
        coordinateData: [],
        timeData: [],
        trackName: 'Test Track',
        totalDistance: 1.0,
        chartMode: 'pace',
        elevationStats: {},
        distanceUnit: 'km'
      }
    });

    const chartData = wrapper.vm.chartData;
    const paceDataset = chartData.datasets.find(d => d.yAxisID === 'y-pace');
    expect(paceDataset).toBeDefined();
    
    // Check that null and zero speeds result in null pace values
    expect(paceDataset.data[0]).toBe(5); // 60/12 = 5 min/km
    expect(paceDataset.data[1]).toBe(null); // null speed
    expect(paceDataset.data[2]).toBe(null); // zero speed
    expect(paceDataset.data[3]).toBe(7.5); // 60/8 = 7.5 min/km
  });

  it('should show pace in chart tooltip format', () => {
    const wrapper = mount(ElevationChart, {
      props: {
        elevationData: [],
        heartRateData: [],
        temperatureData: [],
        slopeData: [],
        speedData: [10], // 10 km/h = 6 min/km
        coordinateData: [],
        timeData: [],
        trackName: 'Test Track',
        totalDistance: 1.0,
        chartMode: 'pace',
        elevationStats: {},
        distanceUnit: 'km'
      }
    });

    // Test the tooltip formatting logic
    const chartData = wrapper.vm.chartData;
    const paceDataset = chartData.datasets.find(d => d.yAxisID === 'y-pace');
    expect(paceDataset).toBeDefined();
    
    // 10 km/h = 6 min/km
    const paceValue = paceDataset.data[0];
    const minutes = Math.floor(paceValue);
    const seconds = Math.round((paceValue - minutes) * 60);
    
    expect(minutes).toBe(6);
    expect(seconds).toBe(0);
  });
});