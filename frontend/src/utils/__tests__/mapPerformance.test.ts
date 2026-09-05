import { describe, it, expect } from 'vitest';
import { OPTIMIZED_MAP_OPTIONS } from '../mapPerformance';

describe('mapPerformance', () => {
    describe('OPTIMIZED_MAP_OPTIONS', () => {
        it('has correct performance settings', () => {
            expect(OPTIMIZED_MAP_OPTIONS.preferCanvas).toBe(true);
            expect(OPTIMIZED_MAP_OPTIONS.zoomControl).toBe(false);
            expect(OPTIMIZED_MAP_OPTIONS.maxZoom).toBe(18);
            expect(OPTIMIZED_MAP_OPTIONS.minZoom).toBe(2);
        });

        it('enables animations for smooth UX', () => {
            expect(OPTIMIZED_MAP_OPTIONS.zoomAnimation).toBe(true);
            expect(OPTIMIZED_MAP_OPTIONS.fadeAnimation).toBe(true);
            expect(OPTIMIZED_MAP_OPTIONS.markerZoomAnimation).toBe(true);
        });

        it('optimizes interactions', () => {
            expect(OPTIMIZED_MAP_OPTIONS.wheelDebounceTime).toBe(60);
            expect(OPTIMIZED_MAP_OPTIONS.doubleClickZoom).toBe(true);
        });
    });
});
