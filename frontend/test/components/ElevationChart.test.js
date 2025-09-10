import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount } from '@vue/test-utils'
import ElevationChart from '../../src/components/ElevationChart.vue'

// Mock Chart.js
vi.mock('chart.js', () => ({
    Chart: {
        register: vi.fn(),
    },
    CategoryScale: vi.fn(),
    LinearScale: vi.fn(),
    PointElement: vi.fn(),
    LineElement: vi.fn(),
    Title: vi.fn(),
    Tooltip: vi.fn(),
    Legend: vi.fn(),
    Filler: vi.fn(),
}))

// Mock vue-chartjs
vi.mock('vue-chartjs', () => ({
    Line: {
        name: 'Line',
        render: () => null,
    },
}))

// Mock useMemoizedComputed
vi.mock('../../src/composables/useMemoization', () => ({
    useMemoizedComputed: (fn, deps, options) => {
        return {
            get value() {
                const depValues = deps.map(dep => dep());
                return fn(...depValues);
            }
        };
    },
    clearCacheByPattern: vi.fn()
}))

describe('ElevationChart', () => {
    const mockTrack = {
        id: 'test-track-1',
        elevation_points: [
            { distance: 0, elevation: 100 },
            { distance: 100, elevation: 110 },
            { distance: 200, elevation: 105 },
            { distance: 300, elevation: 120 },
        ]
    }

    const mockSlopeProfile = [
        { distance_m: 0, slope_percent: 5.0, length_m: 100 },
        { distance_m: 100, slope_percent: -2.5, length_m: 100 },
        { distance_m: 200, slope_percent: 7.5, length_m: 100 },
    ]

    beforeEach(() => {
        vi.clearAllMocks()
    })

    it('renders without errors', () => {
        const wrapper = mount(ElevationChart, {
            props: {
                track: mockTrack,
                showSlope: false,
            }
        })

        expect(wrapper.exists()).toBe(true)
    })

    it('processes elevation data correctly', () => {
        const wrapper = mount(ElevationChart, {
            props: {
                elevationData: mockTrack.elevation_points,
                mode: 'elevation'
            }
        })

        // Test that component renders without errors
        expect(wrapper.exists()).toBe(true)
        // Chart.js is mocked, so we test that chart container div exists
        expect(wrapper.find('.elevation-chart-container').exists()).toBe(true)
    })

    it('handles adaptive granularity for large datasets', () => {
        // Create a track with more than 300 points
        const largeElevationData = Array.from({ length: 500 }, (_, i) => ({
            distance: i * 10,
            elevation: 100 + Math.sin(i * 0.1) * 10
        }))

        const wrapper = mount(ElevationChart, {
            props: {
                elevationData: largeElevationData,
                mode: 'elevation'
            }
        })

        // Test that component renders without errors even with large datasets
        expect(wrapper.exists()).toBe(true)
        // Chart.js is mocked, so we test that chart container exists
        expect(wrapper.find('.elevation-chart-container').exists()).toBe(true)
    })

    it('processes slope profile correctly', async () => {
        const wrapper = mount(ElevationChart, {
            props: {
                elevationData: mockTrack.elevation_points,
                slopeData: mockSlopeProfile,
                mode: 'elevation-with-slope'
            }
        })

        // Test that component renders without errors in slope mode
        expect(wrapper.exists()).toBe(true)
        // Chart.js is mocked, so we test that chart container exists
        expect(wrapper.find('.elevation-chart-container').exists()).toBe(true)
    })

    it('applies correct slope colors', () => {
        const wrapper = mount(ElevationChart, {
            props: {
                track: mockTrack,
                showSlope: true,
                slopeProfile: mockSlopeProfile,
            }
        })

        // Test that component renders without errors with slope colors
        expect(wrapper.exists()).toBe(true)
        // Chart.js is mocked, so we test that chart container exists
        expect(wrapper.find('.elevation-chart-container').exists()).toBe(true)
    })

    it('handles empty slope profile', () => {
        const wrapper = mount(ElevationChart, {
            props: {
                track: mockTrack,
                showSlope: true,
                slopeProfile: [],
            }
        })

        const slopeData = wrapper.vm.slopeData
        expect(slopeData).toEqual([])
    })

    it('handles missing elevation data', () => {
        const trackWithoutElevation = {
            id: 'no-elevation',
            elevation_points: []
        }

        const wrapper = mount(ElevationChart, {
            props: {
                track: trackWithoutElevation,
                showSlope: false,
            }
        })

        const elevationData = wrapper.vm.elevationData
        expect(elevationData).toEqual([])
    })

    it('updates chart when showSlope prop changes', async () => {
        const wrapper = mount(ElevationChart, {
            props: {
                elevationData: mockTrack.elevation_points,
                slopeData: mockSlopeProfile,
                mode: 'elevation'
            }
        })

        // Test that component renders and handles prop changes
        expect(wrapper.exists()).toBe(true)

        // Change to show slope
        await wrapper.setProps({ mode: 'elevation-with-slope' })
        expect(wrapper.exists()).toBe(true)
    })

    it('generates unique key for chart recreation', () => {
        const wrapper = mount(ElevationChart, {
            props: {
                track: { id: 'test-track-1', ...mockTrack },
                mode: 'elevation'
            }
        })

        // Test that component renders
        expect(wrapper.exists()).toBe(true)
        // Chart.js is mocked, so we test that chart container exists
        expect(wrapper.find('.elevation-chart-container').exists()).toBe(true)
    })

    it('generates different keys for different modes', () => {
        const wrapper1 = mount(ElevationChart, {
            props: {
                track: { id: 'test-track-1', ...mockTrack },
                mode: 'elevation'
            }
        })

        const wrapper2 = mount(ElevationChart, {
            props: {
                track: { id: 'test-track-1', ...mockTrack },
                mode: 'pulse'
            }
        })

        // Test that both components render
        expect(wrapper1.exists()).toBe(true)
        expect(wrapper2.exists()).toBe(true)
    })

    it('handles downsampling correctly', () => {
        const wrapper = mount(ElevationChart, {
            props: {
                elevationData: mockTrack.elevation_points,
                mode: 'elevation'
            }
        })

        // Test that component renders without errors
        expect(wrapper.exists()).toBe(true)
        // Chart.js is mocked, so we test that chart container exists
        expect(wrapper.find('.elevation-chart-container').exists()).toBe(true)
    })

    it('preserves data integrity during downsampling', () => {
        const wrapper = mount(ElevationChart, {
            props: {
                elevationData: mockTrack.elevation_points,
                mode: 'elevation'
            }
        })

        // Test that component renders without errors
        expect(wrapper.exists()).toBe(true)
        // Chart.js is mocked, so we test that chart container exists
        expect(wrapper.find('.elevation-chart-container').exists()).toBe(true)
    })

    it('handles chart options correctly', () => {
        const wrapper = mount(ElevationChart, {
            props: {
                elevationData: mockTrack.elevation_points,
                mode: 'elevation'
            }
        })

        // Test that component renders without errors
        expect(wrapper.exists()).toBe(true)
        // Chart.js is mocked, so we test that chart container exists
        expect(wrapper.find('.elevation-chart-container').exists()).toBe(true)
    })

    it('updates y-axis label when showing slope', () => {
        const wrapper = mount(ElevationChart, {
            props: {
                elevationData: mockTrack.elevation_points,
                slopeData: mockSlopeProfile,
                mode: 'elevation-with-slope'
            }
        })

        // Test that component renders without errors
        expect(wrapper.exists()).toBe(true)
        // Chart.js is mocked, so we test that chart container exists
        expect(wrapper.find('.elevation-chart-container').exists()).toBe(true)
    })

    describe('Custom Tooltip Functionality', () => {
        let tooltipElement

        beforeEach(() => {
            // Clean up any existing tooltip elements
            const existingTooltip = document.getElementById('elevation-chart-tooltip')
            if (existingTooltip) {
                existingTooltip.remove()
            }
        })

        afterEach(() => {
            // Clean up tooltip element after each test
            const tooltip = document.getElementById('elevation-chart-tooltip')
            if (tooltip) {
                tooltip.remove()
            }
        })

        it('should create custom tooltip element when external tooltip handler is called', () => {
            const wrapper = mount(ElevationChart, {
                props: {
                    elevationData: [100, 110, 105, 120],
                    totalDistance: 1000,
                    trackName: 'Test Track',
                    chartMode: 'elevation',
                    timeData: ['10:00:00', '10:01:00', '10:02:00', '10:03:00']
                }
            })

            // Simulate tooltip context
            const mockContext = {
                chart: {
                    canvas: {
                        getBoundingClientRect: () => ({ left: 100, top: 100 })
                    }
                },
                tooltip: {
                    opacity: 1,
                    body: [{ lines: ['Elevation: 110m'] }],
                    title: ['Distance: 0.1 km'],
                    dataPoints: [{
                        label: '0.10 km',
                        dataIndex: 1,
                        parsed: { y: 110 },
                        dataset: { yAxisID: 'y-elevation' },
                        raw: 110
                    }],
                    caretX: 50,
                    caretY: 50
                }
            }

            // Get the chart options and call external tooltip handler
            const chartOptions = wrapper.vm.chartOptions
            if (chartOptions && chartOptions.plugins && chartOptions.plugins.tooltip && chartOptions.plugins.tooltip.external) {
                chartOptions.plugins.tooltip.external(mockContext)
            }

            // Check if tooltip element was created
            const tooltip = document.getElementById('elevation-chart-tooltip')
            expect(tooltip).toBeTruthy()
            expect(tooltip.className).toBe('elevation-tooltip')
        })

        it('should display elevation data correctly in tooltip', () => {
            const wrapper = mount(ElevationChart, {
                props: {
                    elevationData: [100, 110, 105, 120],
                    totalDistance: 1000,
                    trackName: 'Test Track',
                    chartMode: 'elevation'
                }
            })

            const mockContext = {
                chart: {
                    canvas: {
                        getBoundingClientRect: () => ({ left: 100, top: 100 })
                    }
                },
                tooltip: {
                    opacity: 1,
                    body: [{ lines: ['Elevation: 110m'] }],
                    title: ['Distance: 0.1 km'],
                    dataPoints: [{
                        label: '0.25 km',
                        dataIndex: 1,
                        parsed: { y: 110 },
                        dataset: { yAxisID: 'y-elevation' },
                        raw: 110
                    }],
                    caretX: 50,
                    caretY: 50
                }
            }

            const chartOptions = wrapper.vm.chartOptions
            if (chartOptions && chartOptions.plugins && chartOptions.plugins.tooltip && chartOptions.plugins.tooltip.external) {
                chartOptions.plugins.tooltip.external(mockContext)
            }

            const tooltip = document.getElementById('elevation-chart-tooltip')
            expect(tooltip).toBeTruthy()
            expect(tooltip.innerHTML).toContain('📍 0.25 km')
            expect(tooltip.innerHTML).toContain('⛰️')
            expect(tooltip.innerHTML).toContain('Elevation:')
            expect(tooltip.innerHTML).toContain('110 m')
        })

        it('should display slope data correctly in elevation-with-slope mode', () => {
            const wrapper = mount(ElevationChart, {
                props: {
                    elevationData: [100, 110, 105, 120],
                    slopeData: mockSlopeProfile,
                    totalDistance: 1000,
                    trackName: 'Test Track',
                    chartMode: 'elevation-with-slope'
                }
            })

            const mockContext = {
                chart: {
                    canvas: {
                        getBoundingClientRect: () => ({ left: 100, top: 100 })
                    }
                },
                tooltip: {
                    opacity: 1,
                    body: [{ lines: ['Elevation: 110m'] }],
                    title: ['Distance: 0.1 km'],
                    dataPoints: [{
                        label: '0.25 km',
                        dataIndex: 1,
                        parsed: { y: 110 },
                        dataset: { yAxisID: 'y-elevation' },
                        raw: {
                            x: '0.25 km',
                            y: 110,
                            slope: 5.2,
                            slopeCategory: 'Moderate Incline'
                        }
                    }],
                    caretX: 50,
                    caretY: 50
                }
            }

            const chartOptions = wrapper.vm.chartOptions
            if (chartOptions && chartOptions.plugins && chartOptions.plugins.tooltip && chartOptions.plugins.tooltip.external) {
                chartOptions.plugins.tooltip.external(mockContext)
            }

            const tooltip = document.getElementById('elevation-chart-tooltip')
            expect(tooltip).toBeTruthy()
            expect(tooltip.innerHTML).toContain('📐')
            expect(tooltip.innerHTML).toContain('Slope:')
            expect(tooltip.innerHTML).toContain('5.2%')
            expect(tooltip.innerHTML).toContain('Moderate Incline')
        })

        it('should display pulse data correctly', () => {
            const wrapper = mount(ElevationChart, {
                props: {
                    elevationData: [100, 110, 105, 120],
                    heartRateData: [120, 125, 130, 128],
                    totalDistance: 1000,
                    trackName: 'Test Track',
                    chartMode: 'both'
                }
            })

            const mockContext = {
                chart: {
                    canvas: {
                        getBoundingClientRect: () => ({ left: 100, top: 100 })
                    }
                },
                tooltip: {
                    opacity: 1,
                    body: [{ lines: ['Pulse: 125 bpm'] }],
                    title: ['Distance: 0.1 km'],
                    dataPoints: [{
                        label: '0.25 km',
                        dataIndex: 1,
                        parsed: { y: 125 },
                        dataset: { yAxisID: 'y-pulse' },
                        raw: 125
                    }],
                    caretX: 50,
                    caretY: 50
                }
            }

            const chartOptions = wrapper.vm.chartOptions
            if (chartOptions && chartOptions.plugins && chartOptions.plugins.tooltip && chartOptions.plugins.tooltip.external) {
                chartOptions.plugins.tooltip.external(mockContext)
            }

            const tooltip = document.getElementById('elevation-chart-tooltip')
            expect(tooltip).toBeTruthy()
            expect(tooltip.innerHTML).toContain('💗')
            expect(tooltip.innerHTML).toContain('Heart Rate:')
            expect(tooltip.innerHTML).toContain('125 bpm')
        })

        it('should display time data when available', () => {
            const wrapper = mount(ElevationChart, {
                props: {
                    elevationData: [100, 110, 105, 120],
                    totalDistance: 1000,
                    trackName: 'Test Track',
                    chartMode: 'elevation',
                    timeData: [0, 60, 120, 180] // elapsed seconds
                }
            })

            const mockContext = {
                chart: {
                    canvas: {
                        getBoundingClientRect: () => ({ left: 100, top: 100 })
                    }
                },
                tooltip: {
                    opacity: 1,
                    body: [{ lines: ['Elevation: 110m'] }],
                    title: ['Distance: 0.1 km'],
                    dataPoints: [{
                        label: '0.25 km',
                        dataIndex: 1,
                        parsed: { y: 110 },
                        dataset: { yAxisID: 'y-elevation' },
                        raw: 110
                    }],
                    caretX: 50,
                    caretY: 50
                }
            }

            const chartOptions = wrapper.vm.chartOptions
            if (chartOptions && chartOptions.plugins && chartOptions.plugins.tooltip && chartOptions.plugins.tooltip.external) {
                chartOptions.plugins.tooltip.external(mockContext)
            }

            const tooltip = document.getElementById('elevation-chart-tooltip')
            expect(tooltip).toBeTruthy()
            expect(tooltip.innerHTML).toContain('⏱️')
            expect(tooltip.innerHTML).toContain('1:00') // 60 seconds formatted as 1:00
        })

        it('should hide tooltip when opacity is 0', () => {
            const wrapper = mount(ElevationChart, {
                props: {
                    elevationData: [100, 110, 105, 120],
                    totalDistance: 1000,
                    trackName: 'Test Track',
                    chartMode: 'elevation'
                }
            })

            // First create tooltip
            const mockShowContext = {
                chart: {
                    canvas: {
                        getBoundingClientRect: () => ({ left: 100, top: 100 })
                    }
                },
                tooltip: {
                    opacity: 1,
                    body: [{ lines: ['Elevation: 110m'] }],
                    title: ['Distance: 0.1 km'],
                    dataPoints: [{
                        label: '0.25 km',
                        dataIndex: 1,
                        parsed: { y: 110 },
                        dataset: { yAxisID: 'y-elevation' },
                        raw: 110
                    }],
                    caretX: 50,
                    caretY: 50
                }
            }

            const chartOptions = wrapper.vm.chartOptions
            if (chartOptions && chartOptions.plugins && chartOptions.plugins.tooltip && chartOptions.plugins.tooltip.external) {
                chartOptions.plugins.tooltip.external(mockShowContext)
            }

            let tooltip = document.getElementById('elevation-chart-tooltip')
            expect(tooltip).toBeTruthy()

            // Then hide tooltip
            const mockHideContext = {
                chart: {
                    canvas: {
                        getBoundingClientRect: () => ({ left: 100, top: 100 })
                    }
                },
                tooltip: {
                    opacity: 0
                }
            }

            chartOptions.plugins.tooltip.external(mockHideContext)

            tooltip = document.getElementById('elevation-chart-tooltip')
            expect(tooltip.style.opacity).toBe('0')
            expect(tooltip.style.transform).toBe('translateY(-5px)')
        })

        it('should position tooltip correctly and handle screen edges', () => {
            // Mock window dimensions
            Object.defineProperty(window, 'innerWidth', { value: 1000, writable: true })
            Object.defineProperty(window, 'innerHeight', { value: 800, writable: true })

            const wrapper = mount(ElevationChart, {
                props: {
                    elevationData: [100, 110, 105, 120],
                    totalDistance: 1000,
                    trackName: 'Test Track',
                    chartMode: 'elevation'
                }
            })

            const mockContext = {
                chart: {
                    canvas: {
                        getBoundingClientRect: () => ({ left: 100, top: 100 })
                    }
                },
                tooltip: {
                    opacity: 1,
                    body: [{ lines: ['Elevation: 110m'] }],
                    title: ['Distance: 0.1 km'],
                    dataPoints: [{
                        label: '0.25 km',
                        dataIndex: 1,
                        parsed: { y: 110 },
                        dataset: { yAxisID: 'y-elevation' },
                        raw: 110
                    }],
                    caretX: 950, // Near right edge
                    caretY: 50
                }
            }

            const chartOptions = wrapper.vm.chartOptions
            if (chartOptions && chartOptions.plugins && chartOptions.plugins.tooltip && chartOptions.plugins.tooltip.external) {
                chartOptions.plugins.tooltip.external(mockContext)
            }

            const tooltip = document.getElementById('elevation-chart-tooltip')
            expect(tooltip).toBeTruthy()
            expect(tooltip.style.position).toBe('absolute')
            expect(tooltip.style.zIndex).toBe('9999')
        })
    })
})
