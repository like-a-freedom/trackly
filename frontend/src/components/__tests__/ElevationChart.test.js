import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import ElevationChart from '../ElevationChart.vue';

// Mock vue-chartjs
vi.mock('vue-chartjs', () => ({
    Line: {
        name: 'Line',
        template: '<canvas class="chart-mock"></canvas>',
        props: ['data', 'options']
    }
}));

// Mock Chart.js
vi.mock('chart.js', () => {
    const mockChart = {
        destroy: vi.fn(),
        update: vi.fn(),
        resize: vi.fn(),
        data: { datasets: [] }
    };

    const MockChartClass = vi.fn(() => mockChart);
    MockChartClass.register = vi.fn();

    return {
        Chart: MockChartClass,
        registerables: [],
        CategoryScale: vi.fn(),
        LinearScale: vi.fn(),
        PointElement: vi.fn(),
        LineElement: vi.fn(),
        Title: vi.fn(),
        Tooltip: vi.fn(),
        Legend: vi.fn(),
        Filler: vi.fn(),
    };
});

describe('ElevationChart', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    const createMockElevationData = () => [
        { distance: 0, elevation: 100 },
        { distance: 1, elevation: 110 },
        { distance: 2, elevation: 90 }
    ];

    const createMockHeartRateData = () => [150, 160, null, 155];

    const createMockTemperatureData = () => [22.5, 23.0, 24.2, 25.1];

    describe('Chart rendering', () => {
        it('should render chart container', () => {
            const wrapper = mount(ElevationChart, {
                props: {
                    elevationData: createMockElevationData(),
                    heartRateData: null,
                    trackName: 'Test Track',
                    totalDistance: 2.5
                }
            });

            expect(wrapper.find('.elevation-chart-container').exists()).toBe(true);
            expect(wrapper.find('canvas').exists()).toBe(true);
        });

        it('should handle elevation data only', () => {
            const elevationData = createMockElevationData();
            const wrapper = mount(ElevationChart, {
                props: {
                    elevationData,
                    heartRateData: null,
                    trackName: 'Test Track',
                    totalDistance: 2.5
                }
            });

            expect(wrapper.vm.elevationData).toEqual(elevationData);
            expect(wrapper.vm.heartRateData).toBe(null);
        });

        it('should handle heart rate data only', () => {
            const heartRateData = createMockHeartRateData();
            const wrapper = mount(ElevationChart, {
                props: {
                    elevationData: null,
                    heartRateData,
                    trackName: 'Test Track',
                    totalDistance: 2.5
                }
            });

            expect(wrapper.vm.elevationData).toBe(null);
            expect(wrapper.vm.heartRateData).toEqual(heartRateData);
        });

        it('should handle both elevation and heart rate data', () => {
            const elevationData = createMockElevationData();
            const heartRateData = createMockHeartRateData();
            const wrapper = mount(ElevationChart, {
                props: {
                    elevationData,
                    heartRateData,
                    trackName: 'Test Track',
                    totalDistance: 2.5
                }
            });

            expect(wrapper.vm.elevationData).toEqual(elevationData);
            expect(wrapper.vm.heartRateData).toEqual(heartRateData);
        });

        it('should handle temperature data', () => {
            const temperatureData = createMockTemperatureData();
            const wrapper = mount(ElevationChart, {
                props: {
                    elevationData: null,
                    heartRateData: null,
                    temperatureData,
                    trackName: 'Test Track',
                    totalDistance: 2.5,
                    chartMode: 'temperature'
                }
            });

            expect(wrapper.vm.temperatureData).toEqual(temperatureData);
            expect(wrapper.find('.chart-mock').exists()).toBe(true);
        });

        it('should handle all three data types together', () => {
            const elevationData = createMockElevationData();
            const heartRateData = createMockHeartRateData();
            const temperatureData = createMockTemperatureData();
            const wrapper = mount(ElevationChart, {
                props: {
                    elevationData,
                    heartRateData,
                    temperatureData,
                    trackName: 'Test Track',
                    totalDistance: 2.5,
                    chartMode: 'both'
                }
            });

            expect(wrapper.vm.elevationData).toEqual(elevationData);
            expect(wrapper.vm.heartRateData).toEqual(heartRateData);
            expect(wrapper.vm.temperatureData).toEqual(temperatureData);
        });

        it('should handle heart rate data with null values', () => {
            const heartRateData = [150, null, 160, null, 155];
            const wrapper = mount(ElevationChart, {
                props: {
                    elevationData: null,
                    heartRateData,
                    trackName: 'Test Track',
                    totalDistance: 2.5
                }
            });

            expect(wrapper.vm.heartRateData).toEqual(heartRateData);
            // Chart should handle null values gracefully
            expect(wrapper.vm.$el).toBeTruthy();
        });
    });

    describe('Chart modes', () => {
        it('should handle elevation mode', () => {
            const elevationData = createMockElevationData();
            const wrapper = mount(ElevationChart, {
                props: {
                    elevationData,
                    heartRateData: null,
                    temperatureData: null,
                    trackName: 'Test Track',
                    totalDistance: 2.5,
                    chartMode: 'elevation'
                }
            });

            expect(wrapper.vm.chartMode).toBe('elevation');
            expect(wrapper.find('.chart-mock').exists()).toBe(true);
        });

        it('should handle pulse mode', () => {
            const heartRateData = createMockHeartRateData();
            const wrapper = mount(ElevationChart, {
                props: {
                    elevationData: null,
                    heartRateData,
                    temperatureData: null,
                    trackName: 'Test Track',
                    totalDistance: 2.5,
                    chartMode: 'pulse'
                }
            });

            expect(wrapper.vm.chartMode).toBe('pulse');
            expect(wrapper.find('.chart-mock').exists()).toBe(true);
        });

        it('should handle temperature mode', () => {
            const temperatureData = createMockTemperatureData();
            const wrapper = mount(ElevationChart, {
                props: {
                    elevationData: null,
                    heartRateData: null,
                    temperatureData,
                    trackName: 'Test Track',
                    totalDistance: 2.5,
                    chartMode: 'temperature'
                }
            });

            expect(wrapper.vm.chartMode).toBe('temperature');
            expect(wrapper.find('.chart-mock').exists()).toBe(true);
        });

        it('should handle both mode with multiple datasets', () => {
            const elevationData = createMockElevationData();
            const heartRateData = createMockHeartRateData();
            const temperatureData = createMockTemperatureData();
            const wrapper = mount(ElevationChart, {
                props: {
                    elevationData,
                    heartRateData,
                    temperatureData,
                    trackName: 'Test Track',
                    totalDistance: 2.5,
                    chartMode: 'both'
                }
            });

            expect(wrapper.vm.chartMode).toBe('both');
            expect(wrapper.find('.chart-mock').exists()).toBe(true);
        });
    });

    describe('Data validation computed properties', () => {
        it('should detect valid pulse data', () => {
            const heartRateData = createMockHeartRateData();
            const wrapper = mount(ElevationChart, {
                props: {
                    elevationData: null,
                    heartRateData,
                    temperatureData: null,
                    trackName: 'Test Track',
                    totalDistance: 2.5
                }
            });

            expect(wrapper.vm.hasPulse).toBe(true);
        });

        it('should detect invalid pulse data', () => {
            const heartRateData = [null, null, null];
            const wrapper = mount(ElevationChart, {
                props: {
                    elevationData: null,
                    heartRateData,
                    temperatureData: null,
                    trackName: 'Test Track',
                    totalDistance: 2.5
                }
            });

            expect(wrapper.vm.hasPulse).toBe(false);
        });

        it('should detect valid temperature data', () => {
            const temperatureData = createMockTemperatureData();
            const wrapper = mount(ElevationChart, {
                props: {
                    elevationData: null,
                    heartRateData: null,
                    temperatureData,
                    trackName: 'Test Track',
                    totalDistance: 2.5
                }
            });

            expect(wrapper.vm.hasTemperature).toBe(true);
        });

        it('should detect invalid temperature data', () => {
            const temperatureData = [null, null, null];
            const wrapper = mount(ElevationChart, {
                props: {
                    elevationData: null,
                    heartRateData: null,
                    temperatureData,
                    trackName: 'Test Track',
                    totalDistance: 2.5
                }
            });

            expect(wrapper.vm.hasTemperature).toBe(false);
        });

        it('should handle empty temperature data', () => {
            const wrapper = mount(ElevationChart, {
                props: {
                    elevationData: null,
                    heartRateData: null,
                    temperatureData: [],
                    trackName: 'Test Track',
                    totalDistance: 2.5
                }
            });

            expect(wrapper.vm.hasTemperature).toBe(false);
        });
    });

    describe('Chart data processing', () => {
        it('should process elevation data correctly', () => {
            const elevationData = createMockElevationData();
            const wrapper = mount(ElevationChart, {
                props: {
                    elevationData,
                    heartRateData: null,
                    trackName: 'Test Track',
                    totalDistance: 2.5
                }
            });

            // Verify that elevation data is processed
            expect(wrapper.vm.elevationData.length).toBe(3);
            expect(wrapper.vm.elevationData[0].elevation).toBe(100);
            expect(wrapper.vm.elevationData[2].elevation).toBe(90);
        });

        it('should process heart rate data correctly', () => {
            const heartRateData = createMockHeartRateData();
            const wrapper = mount(ElevationChart, {
                props: {
                    elevationData: null,
                    heartRateData,
                    trackName: 'Test Track',
                    totalDistance: 2.5
                }
            });

            // Verify that heart rate data is processed
            expect(wrapper.vm.heartRateData.length).toBe(4);
            expect(wrapper.vm.heartRateData[0]).toBe(150);
            expect(wrapper.vm.heartRateData[2]).toBe(null);
        });

        it('should process temperature data correctly', () => {
            const temperatureData = createMockTemperatureData();
            const wrapper = mount(ElevationChart, {
                props: {
                    elevationData: null,
                    heartRateData: null,
                    temperatureData,
                    trackName: 'Test Track',
                    totalDistance: 2.5
                }
            });

            // Verify that temperature data is processed
            expect(wrapper.vm.temperatureData.length).toBe(4);
            expect(wrapper.vm.temperatureData[0]).toBe(22.5);
            expect(wrapper.vm.temperatureData[3]).toBe(25.1);
        });
    });

    describe('Chart configuration', () => {
        it('should configure chart for elevation only', () => {
            const elevationData = createMockElevationData();
            const wrapper = mount(ElevationChart, {
                props: {
                    elevationData,
                    heartRateData: null,
                    trackName: 'Test Track',
                    totalDistance: 2.5
                }
            });

            // Chart should be created with elevation configuration
            expect(wrapper.find('.chart-mock').exists()).toBe(true);
        });

        it('should configure chart for heart rate only', () => {
            const heartRateData = createMockHeartRateData();
            const wrapper = mount(ElevationChart, {
                props: {
                    elevationData: null,
                    heartRateData,
                    trackName: 'Test Track',
                    totalDistance: 2.5
                }
            });

            // Chart should be created with heart rate configuration
            expect(wrapper.find('.chart-mock').exists()).toBe(true);
        });

        it('should configure chart for both elevation and heart rate', () => {
            const elevationData = createMockElevationData();
            const heartRateData = createMockHeartRateData();
            const wrapper = mount(ElevationChart, {
                props: {
                    elevationData,
                    heartRateData,
                    trackName: 'Test Track',
                    totalDistance: 2.5
                }
            });

            // Chart should be created with both datasets
            expect(wrapper.find('.chart-mock').exists()).toBe(true);
        });

        it('should configure chart for temperature only', () => {
            const temperatureData = createMockTemperatureData();
            const wrapper = mount(ElevationChart, {
                props: {
                    elevationData: null,
                    heartRateData: null,
                    temperatureData,
                    trackName: 'Test Track',
                    totalDistance: 2.5,
                    chartMode: 'temperature'
                }
            });

            // Chart should be created with temperature configuration
            expect(wrapper.find('.chart-mock').exists()).toBe(true);
        });

        it('should configure chart for all three data types', () => {
            const elevationData = createMockElevationData();
            const heartRateData = createMockHeartRateData();
            const temperatureData = createMockTemperatureData();
            const wrapper = mount(ElevationChart, {
                props: {
                    elevationData,
                    heartRateData,
                    temperatureData,
                    trackName: 'Test Track',
                    totalDistance: 2.5,
                    chartMode: 'both'
                }
            });

            // Chart should be created with all datasets
            expect(wrapper.find('.chart-mock').exists()).toBe(true);
        });
    });

    describe('Component lifecycle', () => {
        it('should destroy chart on unmount', () => {
            const wrapper = mount(ElevationChart, {
                props: {
                    elevationData: createMockElevationData(),
                    heartRateData: null,
                    trackName: 'Test Track',
                    totalDistance: 2.5
                }
            });

            // Test that the component can be unmounted without errors
            expect(() => wrapper.unmount()).not.toThrow();
        });

        it('should update chart when props change', async () => {
            const wrapper = mount(ElevationChart, {
                props: {
                    elevationData: createMockElevationData(),
                    heartRateData: null,
                    temperatureData: null,
                    trackName: 'Test Track',
                    totalDistance: 2.5
                }
            });

            // Test that props can be updated without errors
            await expect(() => wrapper.setProps({
                heartRateData: createMockHeartRateData()
            })).not.toThrow();

            // Verify chart mock is still rendered
            expect(wrapper.find('.chart-mock').exists()).toBe(true);
        });

        it('should update chart when temperature data is added', async () => {
            const wrapper = mount(ElevationChart, {
                props: {
                    elevationData: createMockElevationData(),
                    heartRateData: null,
                    temperatureData: null,
                    trackName: 'Test Track',
                    totalDistance: 2.5,
                    chartMode: 'elevation'
                }
            });

            // Add temperature data and change mode
            await expect(() => wrapper.setProps({
                temperatureData: createMockTemperatureData(),
                chartMode: 'temperature'
            })).not.toThrow();

            expect(wrapper.vm.temperatureData).toEqual(createMockTemperatureData());
            expect(wrapper.vm.chartMode).toBe('temperature');
            expect(wrapper.find('.chart-mock').exists()).toBe(true);
        });

        it('should handle chartMode changes', async () => {
            const wrapper = mount(ElevationChart, {
                props: {
                    elevationData: createMockElevationData(),
                    heartRateData: createMockHeartRateData(),
                    temperatureData: createMockTemperatureData(),
                    trackName: 'Test Track',
                    totalDistance: 2.5,
                    chartMode: 'elevation'
                }
            });

            // Change between different chart modes
            const modes = ['pulse', 'temperature', 'both', 'elevation'];
            for (const mode of modes) {
                await wrapper.setProps({ chartMode: mode });
                expect(wrapper.vm.chartMode).toBe(mode);
                expect(wrapper.find('.chart-mock').exists()).toBe(true);
            }
        });
    });

    describe('Edge cases', () => {
        it('should display fallback message when no data is available', () => {
            const wrapper = mount(ElevationChart, {
                props: {
                    elevationData: null,
                    heartRateData: null,
                    temperatureData: null,
                    trackName: 'Test Track',
                    totalDistance: 2.5
                }
            });

            expect(wrapper.text()).toContain('No elevation, pulse, or temperature data available');
        });

        it('should display fallback message with empty arrays', () => {
            const wrapper = mount(ElevationChart, {
                props: {
                    elevationData: [],
                    heartRateData: [],
                    temperatureData: [],
                    trackName: 'Test Track',
                    totalDistance: 2.5
                }
            });

            expect(wrapper.text()).toContain('No elevation, pulse, or temperature data available');
        });

        it('should handle temperature data with null values', () => {
            const temperatureData = [22.5, null, 24.2, null];
            const wrapper = mount(ElevationChart, {
                props: {
                    elevationData: null,
                    heartRateData: null,
                    temperatureData,
                    trackName: 'Test Track',
                    totalDistance: 2.5,
                    chartMode: 'temperature'
                }
            });

            expect(wrapper.vm.temperatureData).toEqual(temperatureData);
            expect(wrapper.find('.chart-mock').exists()).toBe(true);
        });

        it('should handle mixed data types in temperature mode', () => {
            const temperatureData = [22.5, '23.0', 24.2, '25.1']; // Mixed string/number
            const wrapper = mount(ElevationChart, {
                props: {
                    elevationData: null,
                    heartRateData: null,
                    temperatureData,
                    trackName: 'Test Track',
                    totalDistance: 2.5,
                    chartMode: 'temperature'
                }
            });

            // Should still render without errors
            expect(wrapper.find('.chart-mock').exists()).toBe(true);
        });
    });
});
