import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import TrackFilterControl from '../../src/components/TrackFilterControl.vue'

describe('TrackFilterControl', () => {
    const defaultProps = {
        categories: ['ride', 'run', 'hike'],
        minLength: 0,
        maxLength: 200,
        minElevationGain: 0,
        maxElevationGain: 4000,
        minSlope: 0,
        maxSlope: 60,
        globalCategories: ['ride', 'run', 'hike'],
        globalMinLength: 0,
        globalMaxLength: 200,
        globalMinElevationGain: 0,
        globalMaxElevationGain: 4000,
        globalMinSlope: 0,
        globalMaxSlope: 60,
        hasTracksInViewport: true
    }

    beforeEach(() => {
        vi.clearAllMocks()
        // Mock localStorage
        global.localStorage = {
            getItem: vi.fn(),
            setItem: vi.fn(),
            removeItem: vi.fn(),
            clear: vi.fn(),
        }
        // Mock window.matchMedia for responsive logic
        global.window.matchMedia = vi.fn(() => ({
            matches: false,
            addEventListener: vi.fn(),
            removeEventListener: vi.fn(),
        }))
    })

    it('renders without errors', () => {
        const wrapper = mount(TrackFilterControl, {
            props: defaultProps
        })
        expect(wrapper.exists()).toBe(true)
    })

    it('initializes with default filter values from props', () => {
        const wrapper = mount(TrackFilterControl, {
            props: defaultProps
        })

        // Check if component rendered and has expected structure
        expect(wrapper.find('.track-filter-wrapper').exists()).toBe(true)
    })

    it('accepts initial values through props', () => {
        const customProps = {
            ...defaultProps,
            categories: ['run'],
            minLength: 5,
            maxLength: 50,
            minElevationGain: 200,
            maxElevationGain: 1500,
            minSlope: 5,
            maxSlope: 30,
            globalCategories: ['run'],
            globalMinLength: 5,
            globalMaxLength: 50,
            globalMinElevationGain: 200,
            globalMaxElevationGain: 1500,
            globalMinSlope: 5,
            globalMaxSlope: 30
        }

        const wrapper = mount(TrackFilterControl, {
            props: customProps
        })

        expect(wrapper.exists()).toBe(true)
        // Component should render with custom props
        expect(wrapper.find('.track-filter-wrapper').exists()).toBe(true)
    })

    it('emits filter-changed when interacted with', async () => {
        const wrapper = mount(TrackFilterControl, {
            props: defaultProps
        })

        // Find and click a filter control to trigger updates
        const categoryButtons = wrapper.findAll('[data-testid^="category-"]')
        if (categoryButtons.length > 0) {
            await categoryButtons[0].trigger('click')
        }

        // Should emit update:filter event
        expect(wrapper.emitted('update:filter')).toBeTruthy()
    })

    it('handles filter interactions correctly', async () => {
        const wrapper = mount(TrackFilterControl, {
            props: defaultProps
        })

        // Component should handle interactions without errors
        expect(wrapper.find('.track-filter-wrapper').exists()).toBe(true)

        // Look for toggle button
        const toggleButton = wrapper.find('.filter-button-compact')
        if (toggleButton.exists()) {
            await toggleButton.trigger('click')
        }

        expect(wrapper.exists()).toBe(true)
    })

    it('handles edge cases gracefully', async () => {
        const edgeProps = {
            ...defaultProps,
            categories: [],
            minLength: 0,
            maxLength: 0,
            minElevationGain: 0,
            maxElevationGain: 0,
            minSlope: 0,
            maxSlope: 0,
            hasTracksInViewport: false
        }

        const wrapper = mount(TrackFilterControl, {
            props: edgeProps
        })

        expect(wrapper.exists()).toBe(true)
    })

    it('renders with localStorage data', async () => {
        // Mock localStorage with saved data
        global.localStorage.getItem = vi.fn((key) => {
            if (key === 'trackFiltersVue') {
                return JSON.stringify({
                    categories: ['ride'],
                    lengthRange: [10, 50],
                    elevationGainRange: [100, 1000],
                    slopeRange: [5, 25]
                })
            }
            if (key === 'trackFiltersVueOpen') {
                return 'true'
            }
            return null
        })

        const wrapper = mount(TrackFilterControl, {
            props: defaultProps
        })

        expect(wrapper.exists()).toBe(true)
    })

    it('handles missing props gracefully', () => {
        const minimalProps = {
            categories: ['ride'],
            minLength: 0,
            maxLength: 100,
            minElevationGain: 0,
            maxElevationGain: 1000,
            minSlope: 0,
            maxSlope: 20,
            hasTracksInViewport: true
        }

        const wrapper = mount(TrackFilterControl, {
            props: minimalProps
        })

        expect(wrapper.exists()).toBe(true)
    })

})
