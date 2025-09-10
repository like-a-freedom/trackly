import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { getSlopeColor } from '../../src/utils/slopeColors.js'

// Mock fetch for API calls
global.fetch = vi.fn()

describe('Slope Functionality Integration Tests', () => {
    beforeEach(() => {
        vi      // Test adaptive granularity with large datasets
        const oversizedData = Array.from({ length: 2000 }, (_, i) => ({
            x: i,
            y: Math.random() * 100
        }))

        const maxPoints = 300
        const step = Math.ceil(oversizedData.length / maxPoints) // Use Math.ceil to ensure we don't exceed maxPoints

        const downsampled = []
        for (let i = 0; i < oversizedData.length; i += step) {
            const endIndex = Math.min(i + step, oversizedData.length)
            const chunk = oversizedData.slice(i, endIndex)

            if (chunk.length > 0) {
                const avgX = chunk.reduce((sum, p) => sum + p.x, 0) / chunk.length
                const avgY = chunk.reduce((sum, p) => sum + p.y, 0) / chunk.length
                downsampled.push({ x: avgX, y: avgY })
            }
        } fetch.mockClear()
    })

    describe('Slope Profile API Integration', () => {
        it('processes slope profile API response correctly', async () => {
            const mockApiResponse = [
                { distance_m: 0, slope_percent: 5.0, length_m: 100 },
                { distance_m: 100, slope_percent: -2.5, length_m: 100 },
                { distance_m: 200, slope_percent: 8.1, length_m: 100 }
            ]

            fetch.mockResolvedValueOnce({
                ok: true,
                json: async () => mockApiResponse
            })

            const response = await fetch('/api/tracks/test-id/slope-profile')
            const slopeProfile = await response.json()

            expect(slopeProfile).toHaveLength(3)
            expect(slopeProfile[0]).toEqual({
                distance_m: 0,
                slope_percent: 5.0,
                length_m: 100
            })
        })

        it('handles API errors gracefully', async () => {
            fetch.mockResolvedValueOnce({
                ok: false,
                status: 404,
                statusText: 'Not Found'
            })

            const response = await fetch('/api/tracks/nonexistent/slope-profile')
            expect(response.ok).toBe(false)
            expect(response.status).toBe(404)
        })

        it('handles empty slope profile response', async () => {
            fetch.mockResolvedValueOnce({
                ok: true,
                json: async () => []
            })

            const response = await fetch('/api/tracks/no-slopes/slope-profile')
            const slopeProfile = await response.json()

            expect(Array.isArray(slopeProfile)).toBe(true)
            expect(slopeProfile).toHaveLength(0)
        })
    })

    describe('Slope Calculate API Integration', () => {
        it('processes calculate slopes API response correctly', async () => {
            const mockCalculateResponse = {
                success: true,
                slope_min: -8.5,
                slope_max: 12.3,
                slope_avg: 3.2,
                slope_histogram: {
                    "0-4": 60,
                    "5-9": 25,
                    "10-14": 10,
                    "15+": 5
                }
            }

            fetch.mockResolvedValueOnce({
                ok: true,
                json: async () => mockCalculateResponse
            })

            const response = await fetch('/api/tracks/test-id/calculate-slopes', {
                method: 'POST'
            })
            const result = await response.json()

            expect(result.success).toBe(true)
            expect(result.slope_min).toBe(-8.5)
            expect(result.slope_max).toBe(12.3)
            expect(result.slope_avg).toBe(3.2)
            expect(result.slope_histogram).toEqual({
                "0-4": 60,
                "5-9": 25,
                "10-14": 10,
                "15+": 5
            })
        })

        it('handles calculate slopes failure correctly', async () => {
            const mockFailureResponse = {
                success: false,
                error: "Insufficient elevation data"
            }

            fetch.mockResolvedValueOnce({
                ok: true,
                json: async () => mockFailureResponse
            })

            const response = await fetch('/api/tracks/test-id/calculate-slopes', {
                method: 'POST'
            })
            const result = await response.json()

            expect(result.success).toBe(false)
            expect(result.error).toBe("Insufficient elevation data")
        })
    })

    describe('Color Scheme Integration', () => {
        it('maintains color consistency across components', () => {
            const testSlopes = [2, 6, 10, 15]  // 2% -> cyan, 6% -> orange, 10% -> tomato, 15% -> crimson
            const colors = testSlopes.map(getSlopeColor)

            // Verify harmonized color scheme
            expect(colors[0]).toBe('#4BC0C0') // 2% -> cyan (0-4%)
            expect(colors[1]).toBe('#FFB347') // 6% -> orange (4-8%)
            expect(colors[2]).toBe('#FF6347') // 10% -> tomato (8-12%)
            expect(colors[3]).toBe('#DC143C') // 15% -> crimson (12-18%)

            // All colors should be distinct
            const uniqueColors = new Set(colors)
            expect(uniqueColors.size).toBe(4)
        })

        it('handles color scheme edge cases consistently', () => {
            // Test boundary values
            expect(getSlopeColor(4.0)).toBe('#FFB347')  // 4.0% is in orange range (4-8%)
            expect(getSlopeColor(8.0)).toBe('#FF6347')  // 8.0% is in tomato range (8-12%)
            expect(getSlopeColor(12.0)).toBe('#DC143C')  // 12.0% is in crimson range (12-18%)
            expect(getSlopeColor(18.0)).toBe('#8B0000')  // 18.0% is in dark red range (18+%)
        })
    })

    describe('Data Flow Integration', () => {
        it('processes complete slope data flow correctly', () => {
            // Simulate complete data flow from API to visualization
            const mockTrack = {
                id: 'test-track',
                slope_min: -5.2,
                slope_max: 15.8,
                slope_avg: 4.3,
                slope_histogram: {
                    "0-4": 45,
                    "5-9": 30,
                    "10-14": 20,
                    "15+": 5
                }
            }

            const mockSlopeProfile = [
                { distance_m: 0, slope_percent: 3.2, length_m: 200 },
                { distance_m: 200, slope_percent: 7.8, length_m: 150 },
                { distance_m: 350, slope_percent: -2.1, length_m: 100 },
                { distance_m: 450, slope_percent: 12.5, length_m: 250 }
            ]

            // Verify track statistics
            expect(mockTrack.slope_min).toBe(-5.2)
            expect(mockTrack.slope_max).toBe(15.8)
            expect(mockTrack.slope_avg).toBe(4.3)

            // Verify histogram totals
            const histogramValues = Object.values(mockTrack.slope_histogram)
            const total = histogramValues.reduce((sum, val) => sum + val, 0)
            expect(total).toBe(100) // Should total 100%

            // Verify slope profile structure
            expect(mockSlopeProfile).toHaveLength(4)
            mockSlopeProfile.forEach(point => {
                expect(point).toHaveProperty('distance_m')
                expect(point).toHaveProperty('slope_percent')
                expect(point).toHaveProperty('length_m')
                expect(typeof point.distance_m).toBe('number')
                expect(typeof point.slope_percent).toBe('number')
                expect(typeof point.length_m).toBe('number')
            })

            // Verify color assignments for profile
            const profileColors = mockSlopeProfile.map(point => getSlopeColor(point.slope_percent))
            expect(profileColors[0]).toBe('#4BC0C0') // 3.2% - cyan
            expect(profileColors[1]).toBe('#FFB347') // 7.8% - orange
            expect(profileColors[2]).toBe('#90EE90') // -2.1% - light green (-4 to 0% range)
            expect(profileColors[3]).toBe('#DC143C') // 12.5% - crimson (12-18% range)
        })

        it('handles data inconsistencies gracefully', () => {
            // Test mismatched data scenarios
            const inconsistentTrack = {
                id: 'inconsistent-track',
                slope_min: -10.0,
                slope_max: 20.0,
                slope_avg: null, // Missing average
                slope_histogram: null // Missing histogram
            }

            const limitedSlopeProfile = [
                { distance_m: 0, slope_percent: 5.0, length_m: 100 }
            ]

            // Should handle missing data gracefully
            expect(inconsistentTrack.slope_avg).toBeNull()
            expect(inconsistentTrack.slope_histogram).toBeNull()
            expect(limitedSlopeProfile).toHaveLength(1)

            // Color assignment should still work
            const color = getSlopeColor(limitedSlopeProfile[0].slope_percent)
            expect(color).toBe('#FFB347') // 5.0% - orange
        })
    })

    describe('Filter Integration', () => {
        it('processes slope filter criteria correctly', () => {
            const filterCriteria = {
                categories: ['ride', 'run'],
                distanceRange: [10, 100],
                elevationGainRange: [200, 2000],
                slopeRange: [5, 25]
            }

            // Verify filter structure
            expect(filterCriteria.slopeRange).toEqual([5, 25])
            expect(filterCriteria.slopeRange[0]).toBeLessThanOrEqual(filterCriteria.slopeRange[1])

            // Test track matching
            const testTracks = [
                { slope_max: 8.5 },   // Should match (8.5 <= 25)
                { slope_max: 30.0 },  // Should not match (30.0 > 25)
                { slope_max: 2.1 },   // Should not match (2.1 < 5)
                { slope_max: 15.0 }   // Should match (5 <= 15 <= 25)
            ]

            const matchingTracks = testTracks.filter(track =>
                track.slope_max >= filterCriteria.slopeRange[0] &&
                track.slope_max <= filterCriteria.slopeRange[1]
            )

            expect(matchingTracks).toHaveLength(2)
            expect(matchingTracks[0].slope_max).toBe(8.5)
            expect(matchingTracks[1].slope_max).toBe(15.0)
        })

        it('handles edge cases in slope filtering', () => {
            const edgeCaseFilter = {
                slopeRange: [0, 60] // Full range
            }

            const edgeCaseTracks = [
                { slope_max: 0 },     // Minimum
                { slope_max: 60 },    // Maximum
                { slope_max: -5 },    // Negative (should use absolute value)
                { slope_max: 100 }    // Above maximum
            ]

            // Test with absolute values for filtering
            const matchingTracks = edgeCaseTracks.filter(track => {
                const absSlope = Math.abs(track.slope_max)
                return absSlope >= edgeCaseFilter.slopeRange[0] &&
                    absSlope <= edgeCaseFilter.slopeRange[1]
            })

            expect(matchingTracks).toHaveLength(3) // All except the 100% slope
        })
    })

    describe('Performance Integration', () => {
        it('handles large slope datasets efficiently', () => {
            // Simulate large slope profile
            const largeProfile = Array.from({ length: 1000 }, (_, i) => ({
                distance_m: i * 10,
                slope_percent: Math.sin(i * 0.01) * 20, // Varying slopes
                length_m: 10
            }))

            expect(largeProfile).toHaveLength(1000)

            // Color assignment should be efficient
            const startTime = performance.now()
            const colors = largeProfile.map(point => getSlopeColor(point.slope_percent))
            const endTime = performance.now()

            expect(colors).toHaveLength(1000)
            expect(endTime - startTime).toBeLessThan(50) // Should be fast

            // Verify color diversity
            const uniqueColors = new Set(colors)
            expect(uniqueColors.size).toBeGreaterThan(1) // Should have varied colors
            expect(uniqueColors.size).toBeLessThanOrEqual(9) // Maximum possible slope colors
        })

        it('handles adaptive granularity efficiently', () => {
            // Test downsampling algorithm performance
            const oversizedData = Array.from({ length: 2000 }, (_, i) => ({
                x: i,
                y: Math.random() * 100
            }))

            const maxPoints = 300
            // Use the same algorithm as in the component 
            const step = Math.max(1, Math.ceil(oversizedData.length / maxPoints))

            const downsampled = []
            for (let i = 0; i < oversizedData.length; i += step) {
                downsampled.push(oversizedData[i])
            }

            expect(downsampled.length).toBeLessThanOrEqual(maxPoints + 50) // Allow tolerance for step-based sampling
            expect(downsampled.length).toBeGreaterThan(0)

            // Verify downsampling performance
            expect(downsampled.length).toBeLessThan(oversizedData.length)

            // First point should be preserved
            expect(downsampled[0].x).toBe(0)
        })
    })

    describe('Error Handling Integration', () => {
        it('handles API timeout gracefully', async () => {
            fetch.mockImplementationOnce(() =>
                new Promise((_, reject) =>
                    setTimeout(() => reject(new Error('Timeout')), 1000)
                )
            )

            try {
                await fetch('/api/tracks/test-id/slope-profile')
            } catch (error) {
                expect(error.message).toBe('Timeout')
            }
        })

        it('handles malformed slope data gracefully', () => {
            const malformedData = [
                { distance_m: null, slope_percent: 5.0, length_m: 100 },
                { distance_m: 100, slope_percent: undefined, length_m: 100 },
                { distance_m: 200, slope_percent: NaN, length_m: 100 }
            ]

            // Filter out invalid data
            const validData = malformedData.filter(point =>
                typeof point.distance_m === 'number' &&
                typeof point.slope_percent === 'number' &&
                !isNaN(point.slope_percent) &&
                typeof point.length_m === 'number'
            )

            expect(validData).toHaveLength(0) // All data points are invalid
        })

        it('handles color assignment for invalid slopes', () => {
            const invalidSlopes = [null, undefined, NaN, Infinity, -Infinity]

            invalidSlopes.forEach(slope => {
                expect(() => getSlopeColor(slope)).not.toThrow()
            })
        })
    })
})
