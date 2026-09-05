/**
 * E2E testing utilities for TrackView
 * Exposes hooks for automated testing in non-production environments
 */
import { type Ref } from 'vue';
import type { LatLngTuple } from '@/types';

interface UseTrackViewE2EOptions {
    track: Ref<unknown>;
    coordinateData: Ref<LatLngTuple[]>;
    isChartPointFixed: Ref<boolean>;
    chartHoverPoint: Ref<unknown>;
    markerLatLng: Ref<{ latlng?: LatLngTuple | { lat: number; lng: number }; segmentIndex?: number } | null>;
    handleChartPointHover: (payload: { index: number; latlng: LatLngTuple; distanceKm?: number; elevation?: number; isFixed?: boolean }) => void;
}

// E2E namespace type for window.__e2e
interface E2ENamespace {
    hoverAtIndex?: (index: number, opts?: Record<string, unknown>) => Promise<boolean> | boolean | void;
    fixAtIndex?: (index: number) => Promise<boolean> | boolean | void;
    hoverAtLatLng?: (lat: number, lng: number, opts?: Record<string, unknown>) => boolean | void;
    clearMarker?: () => boolean | void;
    getLastMarkerLatLng?: () => { lat: number; lng: number } | null;
    isMarkerFixed?: () => boolean;
    getLastMarkerDetails?: () => unknown;
    getCoordinateDataLength?: () => number;
    getLastHoverPayload?: () => unknown;
    lastHighlightedColor?: string | null;
    lastGapLineExists?: boolean;
    lastHoverPayload?: unknown;
    forceHighlightSegment?: (lat: number, lng: number, segmentIndex: number) => void;
}

export function useTrackViewE2E({
    track: _track,
    coordinateData,
    isChartPointFixed,
    chartHoverPoint,
    markerLatLng,
    handleChartPointHover
}: UseTrackViewE2EOptions) {
    // Only initialize in non-production modes
    if (import.meta.env.MODE === 'production') {
        return { initE2E: () => {}, cleanup: () => { } };
    }

    const getE2E = (): E2ENamespace => {
        const w = window as unknown as { __e2e?: E2ENamespace };
        if (!w.__e2e) {
            w.__e2e = {};
        }
        return w.__e2e!;
    };

    const initE2E = (): void => {
        const e2e = getE2E();

        // Simulate hovering at a chart index
        e2e.hoverAtIndex = async (index: number, opts: Record<string, unknown> = {}): Promise<boolean> => {
            try {
                const idx = Number(index);
                if (!Number.isFinite(idx)) return false;

                // Wait for coordinateData to be populated (avoid races with async loading)
                const start = Date.now();
                while (!coordinateData.value || coordinateData.value.length === 0) {
                    if (Date.now() - start > 2000) {
                        console.debug('E2E hoverAtIndex: timed out waiting for coordinateData');
                        return false; // timeout
                    }
                    // eslint-disable-next-line no-await-in-loop
                    await new Promise((r) => setTimeout(r, 50));
                }

                const i = Math.max(0, Math.min(idx, coordinateData.value.length - 1));
                const latlng = coordinateData.value[i];
                const payload = {
                    index: i,
                    latlng: latlng ?? [0, 0],
                    distanceKm: undefined,
                    elevation: undefined,
                    isFixed: !!(opts && opts.isFixed)
                };
                handleChartPointHover(payload);

                // Wait for TrackMap to process highlight (avoid races when map is still animating)
                const s = Date.now();
                while (Date.now() - s < 2000) {
                    if (e2e.lastHighlightedColor != null) break;
                    if (e2e.lastGapLineExists) break;
                    // eslint-disable-next-line no-await-in-loop
                    await new Promise((r) => setTimeout(r, 50));
                }

                // If highlight didn't happen, try forcing a highlight via map helper (if available)
                if ((!e2e.lastHighlightedColor) && typeof e2e.forceHighlightSegment === 'function') {
                    try {
                        console.debug('E2E hoverAtIndex: attempting forceHighlightSegment');
                        const [lat, lng] = latlng || [0, 0];
                        e2e.forceHighlightSegment!(lat ?? 0, lng ?? 0, 0);
                        const s2 = Date.now();
                        while (Date.now() - s2 < 1000) {
                            if (e2e.lastHighlightedColor != null) break;
                            if (e2e.lastGapLineExists) break;
                            // eslint-disable-next-line no-await-in-loop
                            await new Promise((r) => setTimeout(r, 50));
                        }
                        if (!e2e.lastHighlightedColor) {
                            console.debug('E2E hoverAtIndex: forceHighlightSegment did not produce highlight');
                        }
                    } catch (e) {
                        console.debug('E2E hoverAtIndex: forceHighlightSegment failed', e);
                    }
                }

                return true;
            } catch (e) {
                console.warn('E2E hoverAtIndex failed:', e);
                return false;
            }
        };

        // Fix a point at index
        e2e.fixAtIndex = (index: number): Promise<boolean> | boolean | void => {
            try {
                const result = e2e.hoverAtIndex?.(index, { isFixed: true });
                if (result instanceof Promise) {
                    return result.then(r => r ?? false);
                }
                return result ?? false;
            } catch (e) {
                console.warn('E2E fixAtIndex failed:', e);
                return false;
            }
        };

        // Allow hovering at a specific lat/lng for gap testing
        e2e.hoverAtLatLng = (lat: number, lng: number, opts: Record<string, unknown> = {}): boolean => {
            try {
                if (lat === undefined || lng === undefined) return false;
                const payload: { latlng: LatLngTuple; isFixed?: boolean; index?: number } = { latlng: [lat, lng], isFixed: !!(opts && opts.isFixed) };
                if (opts && typeof opts.index !== 'undefined') payload.index = opts.index as number;
                handleChartPointHover(payload as { index: number; latlng: LatLngTuple; isFixed?: boolean });
                if (opts && typeof opts.segmentIndex !== 'undefined' && markerLatLng?.value) {
                    try { markerLatLng.value.segmentIndex = opts.segmentIndex as number; } catch (e) { }
                }
                return true;
            } catch (e) {
                console.warn('E2E hoverAtLatLng failed:', e);
                return false;
            }
        };

        // Clear any marker or fixed points
        e2e.clearMarker = (): boolean => {
            try {
                isChartPointFixed.value = false;
                chartHoverPoint.value = null;
                markerLatLng.value = null;
                return true;
            } catch (e) {
                console.warn('E2E clearMarker failed:', e);
                return false;
            }
        };

        // Expose last marker latlng and fixed state
        e2e.getLastMarkerLatLng = (): { lat: number; lng: number } | null => {
            try {
                const v = markerLatLng?.value?.latlng ?? null;
                if (!v) return null;
                if (Array.isArray(v) && v.length >= 2) return { lat: v[0], lng: v[1] };
                if (typeof v === 'object' && 'lat' in v && 'lng' in v) return v as { lat: number; lng: number };
                return null;
            } catch (e) {
                return null;
            }
        };

        e2e.isMarkerFixed = (): boolean => {
            try {
                return !!isChartPointFixed.value;
            } catch (e) {
                return false;
            }
        };

        e2e.getLastMarkerDetails = (): unknown => {
            try {
                return markerLatLng?.value ? { ...markerLatLng.value } : null;
            } catch (e) {
                return null;
            }
        };

        e2e.getCoordinateDataLength = (): number => {
            try {
                return coordinateData?.value?.length ?? 0;
            } catch (e) {
                return 0;
            }
        };

        // Ensure E2E observability defaults are present early so tests don't race on missing keys
        e2e.lastHighlightedColor = e2e.lastHighlightedColor ?? null;
        e2e.lastGapLineExists = e2e.lastGapLineExists ?? false;

        e2e.getLastHoverPayload = (): unknown => {
            try {
                return e2e.lastHoverPayload ? { ...e2e.lastHoverPayload } : null;
            } catch (e) {
                return null;
            }
        };
    };

    const cleanup = (): void => {
        const e2e = getE2E();
        delete e2e.hoverAtIndex;
        delete e2e.fixAtIndex;
        delete e2e.clearMarker;
        delete e2e.getLastMarkerLatLng;
        delete e2e.isMarkerFixed;
    };

    return { initE2E, cleanup };
}
