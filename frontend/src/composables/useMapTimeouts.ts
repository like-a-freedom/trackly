import { ref } from 'vue';

export interface MapTimeouts {
    animationTimeout: ReturnType<typeof setTimeout> | null;
    clusteringUpdateTimeout: ReturnType<typeof setTimeout> | null;
    mapUpdateTimeout: ReturnType<typeof setTimeout> | null;
    filterUpdateTimeout: ReturnType<typeof setTimeout> | null;
    boundsUpdateTimeout: ReturnType<typeof setTimeout> | null;
    tracksWatchTimeout: ReturnType<typeof setTimeout> | null;
}

export interface MapTimeoutActions {
    clearAnimationTimeout(): void;
    clearClusteringUpdateTimeout(): void;
    clearMapUpdateTimeout(): void;
    clearFilterUpdateTimeout(): void;
    clearBoundsTimeout(): void;
    clearTracksWatchTimeout(): void;
    clearAll(): void;
}

export function useMapTimeouts(): MapTimeouts & MapTimeoutActions {
    let animationTimeout: ReturnType<typeof setTimeout> | null = null;
    let clusteringUpdateTimeout: ReturnType<typeof setTimeout> | null = null;
    let mapUpdateTimeout: ReturnType<typeof setTimeout> | null = null;
    let filterUpdateTimeout: ReturnType<typeof setTimeout> | null = null;
    let boundsUpdateTimeout: ReturnType<typeof setTimeout> | null = null;
    let tracksWatchTimeout: ReturnType<typeof setTimeout> | null = null;

    function clearAnimationTimeout(): void {
        if (animationTimeout) {
            clearTimeout(animationTimeout);
            animationTimeout = null;
        }
    }

    function clearClusteringUpdateTimeout(): void {
        if (clusteringUpdateTimeout) {
            clearTimeout(clusteringUpdateTimeout);
            clusteringUpdateTimeout = null;
        }
    }

    function clearMapUpdateTimeout(): void {
        if (mapUpdateTimeout) {
            clearTimeout(mapUpdateTimeout);
            mapUpdateTimeout = null;
        }
    }

    function clearFilterUpdateTimeout(): void {
        if (filterUpdateTimeout) {
            clearTimeout(filterUpdateTimeout);
            filterUpdateTimeout = null;
        }
    }

    function clearBoundsTimeout(): void {
        if (boundsUpdateTimeout) {
            clearTimeout(boundsUpdateTimeout);
            boundsUpdateTimeout = null;
        }
    }

    function clearTracksWatchTimeout(): void {
        if (tracksWatchTimeout) {
            clearTimeout(tracksWatchTimeout);
            tracksWatchTimeout = null;
        }
    }

    function clearAll(): void {
        clearAnimationTimeout();
        clearClusteringUpdateTimeout();
        clearMapUpdateTimeout();
        clearFilterUpdateTimeout();
        clearBoundsTimeout();
        clearTracksWatchTimeout();
    }

    return {
        get animationTimeout() { return animationTimeout; },
        set animationTimeout(v: ReturnType<typeof setTimeout> | null) { animationTimeout = v; },
        get clusteringUpdateTimeout() { return clusteringUpdateTimeout; },
        set clusteringUpdateTimeout(v: ReturnType<typeof setTimeout> | null) { clusteringUpdateTimeout = v; },
        get mapUpdateTimeout() { return mapUpdateTimeout; },
        set mapUpdateTimeout(v: ReturnType<typeof setTimeout> | null) { mapUpdateTimeout = v; },
        get filterUpdateTimeout() { return filterUpdateTimeout; },
        set filterUpdateTimeout(v: ReturnType<typeof setTimeout> | null) { filterUpdateTimeout = v; },
        get boundsUpdateTimeout() { return boundsUpdateTimeout; },
        set boundsUpdateTimeout(v: ReturnType<typeof setTimeout> | null) { boundsUpdateTimeout = v; },
        get tracksWatchTimeout() { return tracksWatchTimeout; },
        set tracksWatchTimeout(v: ReturnType<typeof setTimeout> | null) { tracksWatchTimeout = v; },
        clearAnimationTimeout,
        clearClusteringUpdateTimeout,
        clearMapUpdateTimeout,
        clearFilterUpdateTimeout,
        clearBoundsTimeout,
        clearTracksWatchTimeout,
        clearAll,
    };
}
