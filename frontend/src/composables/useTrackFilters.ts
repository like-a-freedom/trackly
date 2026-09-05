/**
 * Composable that encapsulates all track-filter logic previously inlined in TrackMap.vue.
 */
import { ref, computed, watch, toValue, type Ref } from "vue";
import { useAdvancedDebounce } from "./useAdvancedDebounce";
import { geoJsonFilter as pureGeoJsonFilter, type FilterState, type TrackFeature } from "../utils/trackFilter";

interface Polyline {
    properties?: {
        categories?: string[];
        length_km?: number;
        elevation_gain?: number;
        elevation_up?: number;
        slope_min?: number;
        slope_max?: number;
        slope_avg?: number;
        id?: string;
        [key: string]: unknown;
    };
}

interface UseTrackFiltersProps {
    polylines?: Polyline[];
    selectedTrackDetail?: { id?: string } | null;
}

interface UseTrackFiltersDeps {
    isTransitioning?: Ref<boolean>;
    debouncedFilterUpdate?: () => void;
}

export function useTrackFilters(
    props: Ref<UseTrackFiltersProps> | UseTrackFiltersProps,
    emit: (event: string, ...args: unknown[]) => void,
    { isTransitioning, debouncedFilterUpdate }: UseTrackFiltersDeps = {}
) {
    // Normalize: works with both a Vue Ref (tests) and a reactive proxy (defineProps)
    const p = (): UseTrackFiltersProps => toValue(props) as UseTrackFiltersProps;

    // ── Session data refs ───────────────────────────────────────────────────
    const sessionCategories = ref(new Set<string>());
    const sessionTrackLengths = ref(new Set<number>());
    const sessionElevationGains = ref(new Set<number>());
    const sessionSlopeValues = ref(new Set<number>());

    // ── Watch for new tracks & update session data ──────────────────────────
    watch(
        () => p().polylines,
        (newPolylines) => {
            if (newPolylines) {
                newPolylines.forEach((poly) => {
                    // Update session categories
                    if (poly.properties && Array.isArray(poly.properties.categories)) {
                        poly.properties.categories.forEach((cat) => {
                            if (cat && typeof cat === "string") {
                                sessionCategories.value.add(cat);
                            }
                        });
                    }

                    // Update session lengths
                    const length = poly.properties?.length_km;
                    if (typeof length === "number" && length >= 0) {
                        sessionTrackLengths.value.add(length);
                    }

                    // Update session elevation gains
                    const elevationGain = poly.properties?.elevation_gain;
                    const elevationUp = poly.properties?.elevation_up;
                    const effectiveGain =
                        typeof elevationGain === "number" && elevationGain >= 0
                            ? elevationGain
                            : typeof elevationUp === "number" && elevationUp >= 0
                                ? elevationUp
                                : null;

                    if (effectiveGain !== null) {
                        sessionElevationGains.value.add(effectiveGain);
                    }

                    // Update session slope values
                    const slopeMin = poly.properties?.slope_min;
                    const slopeMax = poly.properties?.slope_max;
                    if (typeof slopeMin === "number") {
                        sessionSlopeValues.value.add(slopeMin);
                    }
                    if (typeof slopeMax === "number") {
                        sessionSlopeValues.value.add(slopeMax);
                    }
                });
            }
        },
        { immediate: true, deep: true }
    );

    // ── Computed ranges (viewport-scoped) ───────────────────────────────────

    const allCategories = computed((): string[] => {
        const currentPolylines = p().polylines || [];

        if (currentPolylines.length > 0) {
            const currentCategories = new Set<string>();
            currentPolylines.forEach((poly) => {
                if (poly.properties && Array.isArray(poly.properties.categories)) {
                    poly.properties.categories.forEach((cat) => {
                        if (cat && typeof cat === "string") {
                            currentCategories.add(cat);
                        }
                    });
                }
            });
            return Array.from(currentCategories).sort();
        } else {
            return Array.from(sessionCategories.value).sort();
        }
    });

    const minTrackLength = computed((): number => {
        const polylines = p().polylines || [];
        const lengths = polylines
            .map((poly) => poly.properties?.length_km)
            .filter((len): len is number => typeof len === "number" && len >= 0);
        if (lengths.length > 0) {
            return Math.min(...lengths);
        }
        return 0;
    });

    const maxTrackLength = computed((): number => {
        const polylines = p().polylines || [];
        const lengths = polylines
            .map((poly) => poly.properties?.length_km)
            .filter((len): len is number => typeof len === "number" && len >= 0);
        if (lengths.length > 0) {
            return Math.max(...lengths);
        }
        return 50;
    });

    const minElevationGain = computed((): number => {
        const polylines = p().polylines || [];
        const elevationGains = polylines
            .map((poly) => {
                const gain = poly.properties?.elevation_gain;
                const up = poly.properties?.elevation_up;
                return typeof gain === "number" && gain >= 0
                    ? gain
                    : typeof up === "number" && up >= 0
                        ? up
                        : null;
            })
            .filter((gain): gain is number => gain !== null);
        if (elevationGains.length > 0) {
            return Math.min(...elevationGains);
        }
        return 0;
    });

    const maxElevationGain = computed((): number => {
        const polylines = p().polylines || [];
        const elevationGains = polylines
            .map((poly) => {
                const gain = poly.properties?.elevation_gain;
                const up = poly.properties?.elevation_up;
                return typeof gain === "number" && gain >= 0
                    ? gain
                    : typeof up === "number" && up >= 0
                        ? up
                        : null;
            })
            .filter((gain): gain is number => gain !== null);
        if (elevationGains.length > 0) {
            return Math.max(...elevationGains);
        }
        return 2000;
    });

    const minSlope = computed((): number => {
        const polylines = p().polylines || [];
        const slopes = polylines
            .map((poly) => poly.properties?.slope_min)
            .filter((slope): slope is number => slope !== null && slope !== undefined && typeof slope === "number");
        if (slopes.length > 0) {
            return Math.min(...slopes);
        }
        return 0;
    });

    const maxSlope = computed((): number => {
        const polylines = p().polylines || [];
        const slopes = polylines
            .map((poly) => poly.properties?.slope_max)
            .filter((slope): slope is number => slope !== null && slope !== undefined && typeof slope === "number");
        if (slopes.length > 0) {
            return Math.max(...slopes);
        }
        return 20;
    });

    // ── Global session-based ranges (for reset functionality) ───────────────

    const globalMinTrackLength = computed((): number => {
        const sessionLengths = Array.from(sessionTrackLengths.value);
        if (sessionLengths.length > 0) {
            return Math.min(...sessionLengths);
        }
        return 0;
    });

    const globalMaxTrackLength = computed((): number => {
        const sessionLengths = Array.from(sessionTrackLengths.value);
        if (sessionLengths.length > 0) {
            return Math.max(...sessionLengths);
        }
        return 50;
    });

    const globalMinElevationGain = computed((): number => {
        const elevationGains = Array.from(sessionElevationGains.value);
        if (elevationGains.length > 0) {
            return Math.min(...elevationGains);
        }
        return 0;
    });

    const globalMaxElevationGain = computed((): number => {
        const elevationGains = Array.from(sessionElevationGains.value);
        if (elevationGains.length > 0) {
            return Math.max(...elevationGains);
        }
        return 2000;
    });

    const globalMinSlope = computed((): number => {
        const slopes = Array.from(sessionSlopeValues.value);
        if (slopes.length > 0) {
            return Math.min(...slopes);
        }
        return 0;
    });

    const globalMaxSlope = computed((): number => {
        const slopes = Array.from(sessionSlopeValues.value);
        if (slopes.length > 0) {
            return Math.max(...slopes);
        }
        return 20;
    });

    const globalCategories = computed((): string[] => {
        return Array.from(sessionCategories.value).sort();
    });

    const hasElevationData = computed((): boolean => {
        const polylines = p().polylines;
        if (!polylines || !polylines.length) return false;
        return polylines.some(
            (track) => track.properties && track.properties.elevation_gain != null
        );
    });

    const hasSlopeData = computed((): boolean => {
        const polylines = p().polylines;
        if (!polylines || !polylines.length) return false;
        return polylines.some(
            (track) =>
                track.properties &&
                (track.properties.slope_min != null ||
                    track.properties.slope_max != null ||
                    track.properties.slope_avg != null)
        );
    });

    // ── Filter state ────────────────────────────────────────────────────────
    const filterState = ref<FilterState>({
        categories: [],
        lengthRange: [0, 0],
        elevationGainRange: [0, 2000],
        slopeRange: [0, 20],
        showHeatmap: false,
    });

    // ── Native Leaflet filter function ──────────────────────────────────────
    // Delegates to the pure utility in utils/trackFilter.ts
    function geoJsonFilter(feature: { properties?: Record<string, unknown> }, _layer: unknown): boolean {
        return pureGeoJsonFilter(
            feature as TrackFeature,
            filterState.value,
            {
                isTransitioning: isTransitioning?.value ?? false,
                selectedTrackId: p().selectedTrackDetail?.id ?? null,
            },
        );
    }

    // ── Tracks that pass the current filter ─────────────────────────────────
    const filteredTracks = computed((): Polyline[] => {
        const polylines = p().polylines;
        if (!polylines || !polylines.length) {
            return [];
        }

        return polylines.filter((track) => {
            const feature = {
                properties: track.properties,
            };
            return geoJsonFilter(feature, null);
        });
    });

    // ── Filter change handlers ──────────────────────────────────────────────

    const debouncedOnFilterChange = useAdvancedDebounce(
        (newFilterState: unknown) => {
            filterState.value = { ...newFilterState as FilterState };
            if (debouncedFilterUpdate) debouncedFilterUpdate();
            emit("filter-changed", newFilterState);
        },
        150,
        { leading: false, trailing: true }
    );

    function onFilterChange(newFilterState: FilterState): void {
        try {
            if (JSON.stringify(filterState.value) === JSON.stringify(newFilterState)) {
                return;
            }
        } catch (_e) {
            // If serialization fails, fall back to processing
        }

        if (import.meta.env.MODE === "test") {
            filterState.value = { ...newFilterState };
            if (debouncedFilterUpdate) debouncedFilterUpdate();
            emit("filter-changed", newFilterState);
        } else {
            debouncedOnFilterChange(newFilterState);
        }
    }

    const batchedFilterUpdate = useAdvancedDebounce(
        () => {
            if (debouncedFilterUpdate) debouncedFilterUpdate();
        },
        50,
        { leading: false, trailing: true }
    );

    // ── Watch for changes in track ranges and initialise filter ─────────────
    watch(
        [
            minTrackLength,
            maxTrackLength,
            minElevationGain,
            maxElevationGain,
            minSlope,
            maxSlope,
        ],
        ([minLen, maxLen, minElev, maxElev, minSlopeVal, maxSlopeVal]) => {
            let hasUpdates = false;

            if (
                filterState.value.lengthRange[0] === 0 &&
                filterState.value.lengthRange[1] === 0
            ) {
                filterState.value.lengthRange = [minLen, maxLen];
                hasUpdates = true;
            }

            if (
                filterState.value.elevationGainRange[0] === 0 &&
                filterState.value.elevationGainRange[1] === 2000
            ) {
                filterState.value.elevationGainRange = [minElev, maxElev];
                hasUpdates = true;
            }

            if (
                (filterState.value.slopeRange?.[0] ?? 0) === 0 &&
                (filterState.value.slopeRange?.[1] ?? 20) === 20
            ) {
                if (!filterState.value.slopeRange) {
                    filterState.value.slopeRange = [0, 20];
                }
                filterState.value.slopeRange = [minSlopeVal, maxSlopeVal];
                hasUpdates = true;
            }

            if (hasUpdates) {
                batchedFilterUpdate();
            }
        },
        { immediate: true }
    );

    return {
        sessionCategories,
        sessionTrackLengths,
        sessionElevationGains,
        sessionSlopeValues,
        allCategories,
        minTrackLength,
        maxTrackLength,
        minElevationGain,
        maxElevationGain,
        minSlope,
        maxSlope,
        globalMinTrackLength,
        globalMaxTrackLength,
        globalMinElevationGain,
        globalMaxElevationGain,
        globalMinSlope,
        globalMaxSlope,
        globalCategories,
        hasElevationData,
        hasSlopeData,
        filterState,
        geoJsonFilter,
        filteredTracks,
        onFilterChange,
        batchedFilterUpdate,
    };
}
