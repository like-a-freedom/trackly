import { describe, it, expect } from 'vitest'
import { getSlopeColor } from '../../src/utils/slopeColors.js'

describe('slopeColors', () => {
    it('returns cyan for slopes in 0-4% range (harmonized with elevation)', () => {
        expect(getSlopeColor(0)).toBe('#4BC0C0')
        expect(getSlopeColor(2)).toBe('#4BC0C0')
        expect(getSlopeColor(3.9)).toBe('#4BC0C0')
    })

    it('returns light orange for slopes in 4-8% range', () => {
        expect(getSlopeColor(5)).toBe('#FFB347')
        expect(getSlopeColor(7)).toBe('#FFB347')
    })

    it('returns tomato red for slopes in 8-12% range', () => {
        expect(getSlopeColor(10)).toBe('#FF6347')
        expect(getSlopeColor(11)).toBe('#FF6347')
    })

    it('returns crimson for slopes in 12-18% range', () => {
        expect(getSlopeColor(13)).toBe('#DC143C')
        expect(getSlopeColor(15)).toBe('#DC143C')
        expect(getSlopeColor(17)).toBe('#DC143C')
    })

    it('returns dark red for slopes 18% and above', () => {
        expect(getSlopeColor(20)).toBe('#8B0000')
        expect(getSlopeColor(30)).toBe('#8B0000')
        expect(getSlopeColor(100)).toBe('#8B0000')
    })

    it('handles negative slopes correctly', () => {
        expect(getSlopeColor(-2)).toBe('#90EE90')  // Light green for slight downhill (-4 to 0%)
        expect(getSlopeColor(-5)).toBe('#32CD32')  // Lime green for gentle downhill (-8 to -4%)
        expect(getSlopeColor(-10)).toBe('#228B22') // Forest green for moderate downhill (-15 to -8%)
        expect(getSlopeColor(-20)).toBe('#006400') // Dark green for very steep downhill (< -15%)
    })

    it('handles edge cases at range boundaries', () => {
        // Test exact boundary values
        expect(getSlopeColor(4)).toBe('#FFB347')  // Just at 4%, should be in 4-8% range
        expect(getSlopeColor(8)).toBe('#FF6347')  // Just at 8%, should be in 8-12% range
        expect(getSlopeColor(12)).toBe('#DC143C') // Just at 12%, should be in 12-18% range
        expect(getSlopeColor(18)).toBe('#8B0000') // Just at 18%, should be in 18%+ range
    })

    it('handles zero slope', () => {
        expect(getSlopeColor(0)).toBe('#4BC0C0')
    })

    it('handles very small decimal slopes', () => {
        expect(getSlopeColor(0.1)).toBe('#4BC0C0')
        expect(getSlopeColor(0.01)).toBe('#4BC0C0')
        expect(getSlopeColor(0.001)).toBe('#4BC0C0')
    })

    it('handles very large slopes', () => {
        expect(getSlopeColor(500)).toBe('#8B0000')
        expect(getSlopeColor(1000)).toBe('#8B0000')
    })

    it('handles decimal slopes in different ranges', () => {
        expect(getSlopeColor(3.7)).toBe('#4BC0C0')  // 0-4% range
        expect(getSlopeColor(6.3)).toBe('#FFB347')  // 4-8% range
        expect(getSlopeColor(10.8)).toBe('#FF6347') // 8-12% range
        expect(getSlopeColor(16.2)).toBe('#DC143C') // 12-18% range
    })

    it('maintains harmonization with elevation chart colors', () => {
        // The 0-4% range should use cyan (#4BC0C0) to match elevation chart
        const lowSlopeColor = getSlopeColor(2)
        expect(lowSlopeColor).toBe('#4BC0C0')

        // This ensures visual consistency between elevation and slope visualizations
        expect(lowSlopeColor).toBe('#4BC0C0') // Same cyan as elevation chart
    })

    it('provides distinct colors for each slope range', () => {
        const colors = [
            getSlopeColor(2),   // 0-4% range
            getSlopeColor(6),   // 4-8% range
            getSlopeColor(10),  // 8-12% range
            getSlopeColor(15),  // 12-18% range
            getSlopeColor(20)   // 18%+ range
        ]

        // All colors should be different
        const uniqueColors = new Set(colors)
        expect(uniqueColors.size).toBe(5)

        // Verify specific expected colors
        expect(colors[0]).toBe('#4BC0C0') // cyan
        expect(colors[1]).toBe('#FFB347') // light orange
        expect(colors[2]).toBe('#FF6347') // tomato red
        expect(colors[3]).toBe('#DC143C') // crimson
        expect(colors[4]).toBe('#8B0000') // dark red
    })

    it('handles undefined and null inputs gracefully', () => {
        expect(getSlopeColor(undefined)).toBe('#808080') // Gray for invalid data
        expect(getSlopeColor(null)).toBe('#808080')      // Gray for invalid data
    })

    it('handles NaN input gracefully', () => {
        expect(getSlopeColor(NaN)).toBe('#808080') // Gray for invalid data
    })

    it('provides consistent colors for the same slope values', () => {
        const slope = 8.5
        const color1 = getSlopeColor(slope)
        const color2 = getSlopeColor(slope)
        expect(color1).toBe(color2)
    })

    it('works correctly with realistic slope data', () => {
        // Test with typical slope values found in real track data
        const realisticSlopes = [0.5, 2.1, 4.8, 7.2, 11.5, 16.3, 25.0]
        const colors = realisticSlopes.map(getSlopeColor)

        expect(colors[0]).toBe('#4BC0C0') // 0.5% - cyan
        expect(colors[1]).toBe('#4BC0C0') // 2.1% - cyan
        expect(colors[2]).toBe('#FFB347') // 4.8% - light orange
        expect(colors[3]).toBe('#FFB347') // 7.2% - light orange
        expect(colors[4]).toBe('#FF6347') // 11.5% - tomato red
        expect(colors[5]).toBe('#DC143C') // 16.3% - crimson
        expect(colors[6]).toBe('#8B0000') // 25.0% - dark red
    })
})
