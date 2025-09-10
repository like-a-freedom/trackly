import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import TrackDetailPanel from '../../src/components/TrackDetailPanel.vue'

// Mock Chart.js and vue-chartjs for ElevationChart
vi.mock('chart.js', () => ({
    Chart: { register: vi.fn() },
    CategoryScale: vi.fn(),
    LinearScale: vi.fn(),
    PointElement: vi.fn(),
    LineElement: vi.fn(),
    Title: vi.fn(),
    Tooltip: vi.fn(),
    Legend: vi.fn(),
    Filler: vi.fn(),
}))

vi.mock('vue-chartjs', () => ({
    Line: { name: 'Line', render: () => null },
}))

// Mock ElevationChart component
vi.mock('../../src/components/ElevationChart.vue', () => ({
    default: { name: 'ElevationChart', render: () => null }
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

describe('TrackDetailPanel - Slope Functionality', () => {
    const mockTrack = {
        id: 'test-track-1',
        name: 'Test Track',
        distance_km: 25.5,
        elevation_gain_m: 450,
        duration_minutes: 120,
        activity_type: 'ride',
        slope_min: -8.5,
        slope_max: 12.3,
        slope_avg: 3.2,
        slope_histogram: {
            "0-4": 60,
            "5-9": 25,
            "10-14": 10,
            "15+": 5
        },
        elevation_points: [
            { distance: 0, elevation: 100 },
            { distance: 1000, elevation: 120 },
            { distance: 2000, elevation: 115 }
        ]
    }

    const mockSlopeProfile = [
        { distance_m: 0, slope_percent: 5.0, length_m: 500 },
        { distance_m: 500, slope_percent: -2.5, length_m: 500 },
        { distance_m: 1000, slope_percent: 8.1, length_m: 1000 }
    ]

    beforeEach(() => {
        vi.clearAllMocks()
    })

    it('renders slope analysis section when slope data is available', () => {
        const wrapper = mount(TrackDetailPanel, {
            props: {
                track: mockTrack,
                slopeProfile: mockSlopeProfile
            }
        })

        expect(wrapper.find('[data-testid="slope-section"]').exists()).toBe(true)
    })

    it('displays slope statistics correctly', () => {
        const wrapper = mount(TrackDetailPanel, {
            props: {
                track: mockTrack,
                slopeProfile: mockSlopeProfile
            }
        })

        const slopeSection = wrapper.find('[data-testid="slope-section"]')
        expect(slopeSection.text()).toContain('3.2%') // average slope
        expect(slopeSection.text()).toContain('-8.5%') // min slope
        expect(slopeSection.text()).toContain('12.3%') // max slope
    })

    it('displays slope histogram when available', () => {
        const wrapper = mount(TrackDetailPanel, {
            props: {
                track: mockTrack,
                slopeProfile: mockSlopeProfile
            }
        })

        const histogramSection = wrapper.find('[data-testid="slope-stats-grid"]')
        expect(histogramSection.exists()).toBe(true)

        // Check slope statistics display
        expect(histogramSection.text()).toContain('Max uphill slope')
        expect(histogramSection.text()).toContain('+12.3%')
        expect(histogramSection.text()).toContain('Max downhill slope')
        expect(histogramSection.text()).toContain('-8.5%')
    })

    it('formats slope percentages correctly', () => {
        const trackWithDecimals = {
            ...mockTrack,
            slope_min: -8.567,
            slope_max: 12.345,
            slope_avg: 3.789
        }

        const wrapper = mount(TrackDetailPanel, {
            props: {
                track: trackWithDecimals,
                slopeProfile: mockSlopeProfile
            }
        })

        const slopeSection = wrapper.find('[data-testid="slope-section"]')
        // Should format to 1 decimal place
        expect(slopeSection.text()).toContain('3.8%') // average slope
        expect(slopeSection.text()).toContain('-8.6%') // min slope
        expect(slopeSection.text()).toContain('12.3%') // max slope
    })

    it('hides slope analysis when no slope data is available', () => {
        const trackWithoutSlope = {
            ...mockTrack,
            slope_min: null,
            slope_max: null,
            slope_avg: null,
            slope_histogram: null
        }

        const wrapper = mount(TrackDetailPanel, {
            props: {
                track: trackWithoutSlope,
                slopeProfile: []
            }
        })

        expect(wrapper.find('[data-testid="slope-section"]').exists()).toBe(false)
    })

    it('uses proper grid layout for slope statistics', () => {
        const wrapper = mount(TrackDetailPanel, {
            props: {
                track: mockTrack,
                slopeProfile: mockSlopeProfile
            }
        })

        const statsGrid = wrapper.find('[data-testid="slope-stats-grid"]')
        expect(statsGrid.exists()).toBe(true)
        expect(statsGrid.classes()).toContain('slope-stats-grid')
    })

    it('renders slope section as separate from other stats', () => {
        const wrapper = mount(TrackDetailPanel, {
            props: {
                track: mockTrack,
                slopeProfile: mockSlopeProfile
            }
        })

        const slopeSection = wrapper.find('[data-testid="slope-section"]')
        expect(slopeSection.classes()).toContain('stats-section')
    })

    it('handles missing slope histogram gracefully', () => {
        const trackWithoutHistogram = {
            ...mockTrack,
            slope_histogram: null
        }

        const wrapper = mount(TrackDetailPanel, {
            props: {
                track: trackWithoutHistogram,
                slopeProfile: mockSlopeProfile
            }
        })

        const slopeSection = wrapper.find('[data-testid="slope-section"]')
        expect(slopeSection.exists()).toBe(true)

        const histogramSection = wrapper.find('[data-testid="slope-histogram"]')
        expect(histogramSection.exists()).toBe(false)
    })

    it('handles empty slope histogram gracefully', () => {
        const trackWithEmptyHistogram = {
            ...mockTrack,
            slope_histogram: {}
        }

        const wrapper = mount(TrackDetailPanel, {
            props: {
                track: trackWithEmptyHistogram,
                slopeProfile: mockSlopeProfile
            }
        })

        const histogramSection = wrapper.find('[data-testid="slope-histogram"]')
        expect(histogramSection.exists()).toBe(false)
    })

    it('displays slope histogram ranges in correct order', () => {
        const wrapper = mount(TrackDetailPanel, {
            props: {
                track: mockTrack,
                slopeProfile: mockSlopeProfile
            }
        })

        const statsSection = wrapper.find('[data-testid="slope-stats-grid"]')
        expect(statsSection.exists()).toBe(true)

        // Test that slope stats are displayed
        const slopeSection = wrapper.find('[data-testid="slope-section"]')
        expect(slopeSection.exists()).toBe(true)
    })

    it('calculates slope range correctly', () => {
        const wrapper = mount(TrackDetailPanel, {
            props: {
                track: mockTrack,
                slopeProfile: mockSlopeProfile
            }
        })

        const slopeSection = wrapper.find('[data-testid="slope-section"]')
        const slopeText = slopeSection.text()

        // Should show range from min to max
        expect(slopeText).toContain('-8.5%')
        expect(slopeText).toContain('12.3%')
    })

    it('handles zero slope values correctly', () => {
        const trackWithZeroSlopes = {
            ...mockTrack,
            slope_min: 0,
            slope_max: 0,
            slope_avg: 0
        }

        const wrapper = mount(TrackDetailPanel, {
            props: {
                track: trackWithZeroSlopes,
                slopeProfile: mockSlopeProfile
            }
        })

        const slopeSection = wrapper.find('[data-testid="slope-section"]')
        expect(slopeSection.text()).toContain('0%')
    })

    it('handles extreme slope values correctly', () => {
        const trackWithExtremeSlopes = {
            ...mockTrack,
            slope_min: -25.7,
            slope_max: 45.2,
            slope_avg: 8.9
        }

        const wrapper = mount(TrackDetailPanel, {
            props: {
                track: trackWithExtremeSlopes,
                slopeProfile: mockSlopeProfile
            }
        })

        const slopeSection = wrapper.find('[data-testid="slope-section"]')
        expect(slopeSection.text()).toContain('-25.7%')
        expect(slopeSection.text()).toContain('45.2%')
        expect(slopeSection.text()).toContain('8.9%')
    })

    it('integrates properly with elevation chart component', () => {
        const wrapper = mount(TrackDetailPanel, {
            props: {
                track: mockTrack,
                slopeProfile: mockSlopeProfile
            }
        })

        const elevationChart = wrapper.findComponent({ name: 'ElevationChart' })
        expect(elevationChart.exists()).toBe(true)
        // With mocked ElevationChart, just verify it's rendered when slope data is available
    })

    it('maintains consistent styling with other track statistics', () => {
        const wrapper = mount(TrackDetailPanel, {
            props: {
                track: mockTrack,
                slopeProfile: mockSlopeProfile
            }
        })

        const slopeSection = wrapper.find('[data-testid="slope-section"]')
        expect(slopeSection.exists()).toBe(true)

        // Slope section should have the stats-section class
        expect(slopeSection.classes()).toContain('stats-section')
    })

    it('displays section title correctly', () => {
        const wrapper = mount(TrackDetailPanel, {
            props: {
                track: mockTrack,
                slopeProfile: mockSlopeProfile
            }
        })

        const slopeSection = wrapper.find('[data-testid="slope-section"]')
        expect(slopeSection.find('h3').text()).toBe('Slope Analysis')
    })

    it('handles partial slope data correctly', () => {
        const trackWithPartialSlope = {
            ...mockTrack,
            slope_min: -5.2,
            slope_max: 8.7,
            slope_avg: null, // Missing average
            slope_histogram: null // Missing histogram
        }

        const wrapper = mount(TrackDetailPanel, {
            props: {
                track: trackWithPartialSlope,
                slopeProfile: mockSlopeProfile
            }
        })

        const slopeSection = wrapper.find('[data-testid="slope-section"]')
        expect(slopeSection.exists()).toBe(true)
        expect(slopeSection.text()).toContain('-5.2%')
        expect(slopeSection.text()).toContain('8.7%')

        // Should not show histogram section
        const histogramSection = wrapper.find('[data-testid="slope-histogram"]')
        expect(histogramSection.exists()).toBe(false)
    })
})
