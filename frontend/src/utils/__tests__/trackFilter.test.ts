import { describe, it, expect } from 'vitest';
import { geoJsonFilter, type FilterState, type TrackFeature } from '../trackFilter';

const baseFilterState: FilterState = {
    categories: [],
    lengthRange: [0, 100],
    elevationGainRange: [0, 2000],
    slopeRange: [0, 20],
    showHeatmap: false,
};

function makeFeature(overrides: Partial<TrackFeature['properties']> = {}): TrackFeature {
    return {
        properties: {
            id: 'track-1',
            categories: ['hiking'],
            length_km: 5,
            elevation_gain: 100,
            slope_min: 0,
            slope_max: 10,
            ...overrides,
        },
    };
}

describe('geoJsonFilter', () => {
    describe('category filtering', () => {
        it('returns true when category matches', () => {
            const result = geoJsonFilter(
                makeFeature({ categories: ['hiking'] }),
                { ...baseFilterState, categories: ['hiking'] },
            );
            expect(result).toBe(true);
        });

        it('returns false when category does not match', () => {
            const result = geoJsonFilter(
                makeFeature({ categories: ['cycling'] }),
                { ...baseFilterState, categories: ['hiking'] },
            );
            expect(result).toBe(false);
        });

        it('returns false when no categories selected and not transitioning', () => {
            const result = geoJsonFilter(
                makeFeature({ categories: ['hiking'] }),
                { ...baseFilterState, categories: [] },
            );
            expect(result).toBe(false);
        });
    });

    describe('length range filtering', () => {
        it('returns true when length is within range', () => {
            const result = geoJsonFilter(
                makeFeature({ length_km: 5 }),
                { ...baseFilterState, categories: ['hiking'], lengthRange: [0, 10] },
            );
            expect(result).toBe(true);
        });

        it('returns false when length exceeds range', () => {
            const result = geoJsonFilter(
                makeFeature({ length_km: 15 }),
                { ...baseFilterState, categories: ['hiking'], lengthRange: [0, 10] },
            );
            expect(result).toBe(false);
        });

        it('applies epsilon tolerance at boundaries', () => {
            const result = geoJsonFilter(
                makeFeature({ length_km: 10.4 }),
                { ...baseFilterState, categories: ['hiking'], lengthRange: [0, 10] },
            );
            expect(result).toBe(true);
        });
    });

    describe('elevation gain filtering', () => {
        it('returns true when elevation is within range', () => {
            const result = geoJsonFilter(
                makeFeature({ elevation_gain: 500 }),
                { ...baseFilterState, categories: ['hiking'], elevationGainRange: [0, 1000] },
            );
            expect(result).toBe(true);
        });

        it('returns false when elevation exceeds range', () => {
            const result = geoJsonFilter(
                makeFeature({ elevation_gain: 2500 }),
                { ...baseFilterState, categories: ['hiking'], elevationGainRange: [0, 2000] },
            );
            expect(result).toBe(false);
        });

        it('uses elevation_up as fallback when elevation_gain is absent', () => {
            const result = geoJsonFilter(
                makeFeature({ elevation_gain: undefined, elevation_up: 500 }),
                { ...baseFilterState, categories: ['hiking'], elevationGainRange: [0, 1000] },
            );
            expect(result).toBe(true);
        });

        it('passes when no elevation data is available', () => {
            const result = geoJsonFilter(
                makeFeature({ elevation_gain: undefined, elevation_up: undefined }),
                { ...baseFilterState, categories: ['hiking'], elevationGainRange: [0, 1000] },
            );
            expect(result).toBe(true);
        });
    });

    describe('slope filtering', () => {
        it('returns true when slope is within range', () => {
            const result = geoJsonFilter(
                makeFeature({ slope_min: 0, slope_max: 10 }),
                { ...baseFilterState, categories: ['hiking'], slopeRange: [0, 20] },
            );
            expect(result).toBe(true);
        });

        it('returns false when slope exceeds range', () => {
            const result = geoJsonFilter(
                makeFeature({ slope_min: 25, slope_max: 30 }),
                { ...baseFilterState, categories: ['hiking'], slopeRange: [0, 20] },
            );
            expect(result).toBe(false);
        });

        it('passes when slope data is missing', () => {
            const result = geoJsonFilter(
                makeFeature({ slope_min: undefined, slope_max: undefined }),
                { ...baseFilterState, categories: ['hiking'], slopeRange: [0, 20] },
            );
            expect(result).toBe(true);
        });
    });

    describe('transition behavior', () => {
        it('returns true when transitioning and no categories selected', () => {
            const result = geoJsonFilter(
                makeFeature({ categories: ['hiking'] }),
                { ...baseFilterState, categories: [] },
                { isTransitioning: true },
            );
            expect(result).toBe(true);
        });

        it('applies filters when transitioning and categories are selected', () => {
            const result = geoJsonFilter(
                makeFeature({ categories: ['cycling'] }),
                { ...baseFilterState, categories: ['hiking'] },
                { isTransitioning: true },
            );
            expect(result).toBe(false);
        });
    });

    describe('selected track behavior', () => {
        it('shows only the selected track when selectedTrackId is set', () => {
            const result = geoJsonFilter(
                makeFeature({ id: 'track-1' }),
                { ...baseFilterState, categories: ['hiking'] },
                { selectedTrackId: 'track-1' },
            );
            expect(result).toBe(true);
        });

        it('hides non-selected tracks when selectedTrackId is set', () => {
            const result = geoJsonFilter(
                makeFeature({ id: 'track-2' }),
                { ...baseFilterState, categories: ['hiking'] },
                { selectedTrackId: 'track-1' },
            );
            expect(result).toBe(false);
        });
    });
});
