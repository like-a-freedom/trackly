import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
    getDetailPanelFitBoundsOptions,
    POLYLINE_WEIGHT_ACTIVE,
    POLYLINE_WEIGHT_SELECTED_DETAIL,
    POLYLINE_WEIGHT_DEFAULT,
    POLYLINE_OPACITY_ACTIVE,
    POLYLINE_OPACITY_HOVER_DIM,
    POLYLINE_OPACITY_SELECTED_DETAIL,
    POLYLINE_OPACITY_DEFAULT,
} from '../mapConstants';

describe('mapConstants', () => {
    describe('getDetailPanelFitBoundsOptions', () => {
        const originalInnerHeight = window.innerHeight;
        const originalInnerWidth = window.innerWidth;

        beforeEach(() => {
            // Set consistent viewport dimensions
            Object.defineProperty(window, 'innerHeight', { value: 800, writable: true });
            Object.defineProperty(window, 'innerWidth', { value: 1200, writable: true });
        });

        afterEach(() => {
            Object.defineProperty(window, 'innerHeight', { value: originalInnerHeight, writable: true });
            Object.defineProperty(window, 'innerWidth', { value: originalInnerWidth, writable: true });
        });

        it('returns correct structure', () => {
            const options = getDetailPanelFitBoundsOptions();
            expect(options).toHaveProperty('paddingTopLeft');
            expect(options).toHaveProperty('paddingBottomRight');
            expect(options).toHaveProperty('animate');
            expect(options).toHaveProperty('duration');
            expect(options).toHaveProperty('maxZoom');
        });

        it('calculates padding based on viewport', () => {
            const options = getDetailPanelFitBoundsOptions();
            const expectedBottomPadding = Math.round(800 - 800 * 0.45 - 40);
            expect(options.paddingBottomRight[1]).toBe(expectedBottomPadding);
            expect(options.paddingTopLeft[1]).toBe(40);
        });

        it('uses smaller side padding for narrow viewports', () => {
            Object.defineProperty(window, 'innerWidth', { value: 500, writable: true });
            const options = getDetailPanelFitBoundsOptions();
            expect(options.paddingTopLeft[0]).toBe(15);
        });

        it('uses larger side padding for wide viewports', () => {
            Object.defineProperty(window, 'innerWidth', { value: 1200, writable: true });
            const options = getDetailPanelFitBoundsOptions();
            expect(options.paddingTopLeft[0]).toBe(30);
        });

        it('returns animation enabled', () => {
            const options = getDetailPanelFitBoundsOptions();
            expect(options.animate).toBe(true);
            expect(options.duration).toBe(0.5);
        });

        it('limits max zoom', () => {
            const options = getDetailPanelFitBoundsOptions();
            expect(options.maxZoom).toBe(16);
        });
    });

    describe('polyline constants', () => {
        it('has correct weight values', () => {
            expect(POLYLINE_WEIGHT_ACTIVE).toBe(7);
            expect(POLYLINE_WEIGHT_SELECTED_DETAIL).toBe(5);
            expect(POLYLINE_WEIGHT_DEFAULT).toBe(4);
        });

        it('has correct opacity values', () => {
            expect(POLYLINE_OPACITY_ACTIVE).toBe(1);
            expect(POLYLINE_OPACITY_HOVER_DIM).toBe(0.75);
            expect(POLYLINE_OPACITY_SELECTED_DETAIL).toBe(1);
            expect(POLYLINE_OPACITY_DEFAULT).toBe(0.85);
        });
    });
});
