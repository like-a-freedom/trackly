/**
 * Pure track-filter logic, extracted from useTrackFilters for testability.
 *
 * No Vue, no closures — all inputs are explicit parameters.
 */

export interface FilterState {
    categories: string[];
    lengthRange: [number, number];
    elevationGainRange: [number, number];
    slopeRange: [number, number];
    showHeatmap: boolean;
}

export interface TrackFeature {
    properties?: {
        id?: string;
        categories?: string[];
        length_km?: number;
        elevation_gain?: number;
        elevation_up?: number;
        slope_min?: number;
        slope_max?: number;
        [key: string]: unknown;
    };
}

export interface GeoJsonFilterOptions {
    epsilon?: number;
    epsilonElevation?: number;
    epsilonSlope?: number;
    isTransitioning?: boolean;
    selectedTrackId?: string | null;
}

const DEFAULT_EPSILON = 0.5;
const DEFAULT_EPSILON_ELEVATION = 10;
const DEFAULT_EPSILON_SLOPE = 0.1;

/**
 * Pure filter function: decides whether a track feature passes the current filter.
 *
 * @param feature - track feature with properties
 * @param filterState - current filter ranges/categories
 * @param options - transition state, selected track, epsilon tolerances
 * @returns true if the feature should be visible
 */
export function geoJsonFilter(
    feature: TrackFeature,
    filterState: FilterState,
    options: GeoJsonFilterOptions = {},
): boolean {
    const {
        epsilon = DEFAULT_EPSILON,
        epsilonElevation = DEFAULT_EPSILON_ELEVATION,
        epsilonSlope = DEFAULT_EPSILON_SLOPE,
        isTransitioning = false,
        selectedTrackId = null,
    } = options;

    const cats = feature.properties?.categories || [];
    const len = feature.properties?.length_km;

    const elevationGain = feature.properties?.elevation_gain;
    const elevationUp = feature.properties?.elevation_up;
    const effectiveGain =
        typeof elevationGain === "number"
            ? elevationGain
            : typeof elevationUp === "number"
                ? elevationUp
                : null;

    const slopeMin = feature.properties?.slope_min;
    const slopeMax = feature.properties?.slope_max;

    // During transition, maintain the same filter behavior as before the transition
    if (isTransitioning) {
        if (filterState.categories.length > 0) {
            return matchesAll(filterState, cats, len, effectiveGain, slopeMin, slopeMax, epsilon, epsilonElevation, epsilonSlope);
        }
        return true;
    }

    // When track detail panel is open, show ONLY the selected track
    if (selectedTrackId) {
        const props = feature.properties;
        return props != null && props.id === selectedTrackId;
    }

    if (filterState.categories.length === 0) {
        return false;
    }

    return matchesAll(filterState, cats, len, effectiveGain, slopeMin, slopeMax, epsilon, epsilonElevation, epsilonSlope);
}

function matchesAll(
    filterState: FilterState,
    cats: string[],
    len: number | undefined,
    effectiveGain: number | null,
    slopeMin: number | undefined,
    slopeMax: number | undefined,
    epsilon: number,
    epsilonElevation: number,
    epsilonSlope: number,
): boolean {
    const catMatch = filterState.categories.some((cat) => cats.includes(cat));

    const min = filterState.lengthRange[0];
    const max = filterState.lengthRange[1];
    const lenMatch = len !== undefined && len >= min - epsilon && len <= max + epsilon;

    const elevationMin = filterState.elevationGainRange[0];
    const elevationMax = filterState.elevationGainRange[1];
    const elevationMatch =
        effectiveGain === null ||
        (effectiveGain >= elevationMin - epsilonElevation &&
            effectiveGain <= elevationMax + epsilonElevation);

    const slopeFilterMin = filterState.slopeRange?.[0] ?? 0;
    const slopeFilterMax = filterState.slopeRange?.[1] ?? 20;
    const slopeMatch =
        slopeMin === null ||
        slopeMin === undefined ||
        slopeMax === null ||
        slopeMax === undefined ||
        (slopeMax >= slopeFilterMin - epsilonSlope &&
            slopeMin <= slopeFilterMax + epsilonSlope);

    return catMatch && lenMatch && elevationMatch && slopeMatch;
}
