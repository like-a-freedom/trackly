import { ref } from 'vue';

/**
 * Routing composable for track editor.
 *
 * Supports two modes:
 *  - 'manual': connects waypoints with straight lines (always available)
 *  - 'auto': uses WASM fast_paths routing (requires loaded graph)
 *
 * The WASM auto-routing is a stub until the fast_paths WASM module is built
 * and regional graph data is prepared. When auto mode is selected but the
 * graph is not loaded, a notification callback fires and the route returns null.
 */
export function useRouting() {
    /** Current routing mode: 'manual' | 'auto' */
    const mode = ref('manual');

    /** Whether the WASM routing graph is loaded and ready. */
    const graphReady = ref(false);

    /** Whether the graph is currently loading. */
    const graphLoading = ref(false);

    /**
     * Find a route between two points.
     * @param {Object} from - { lat, lng }
     * @param {Object} to - { lat, lng }
     * @param {Object} options
     * @param {Function} options.onNotAvailable - Called when auto routing is not available
     * @returns {Array<[number,number]>|null} Array of [lat, lng] points or null
     */
    function findRoute(from, to, { onNotAvailable } = {}) {
        if (mode.value === 'manual') {
            // Straight line between points
            return [
                [from.lat, from.lng],
                [to.lat, to.lng],
            ];
        }

        // Auto mode — WASM routing
        if (!graphReady.value) {
            if (typeof onNotAvailable === 'function') {
                onNotAvailable(
                    'Automatic routing is unavailable. Load the road network graph or switch to manual mode.'
                );
            }
            return null;
        }

        // TODO: Implement WASM fast_paths calc_path() call here
        // For now, return null to indicate route not found
        if (typeof onNotAvailable === 'function') {
            onNotAvailable(
                'WASM router is not yet implemented. Switch to manual mode.'
            );
        }
        return null;
    }

    /**
     * Set routing mode.
     * @param {'manual'|'auto'} newMode
     */
    function setMode(newMode) {
        if (newMode === 'manual' || newMode === 'auto') {
            mode.value = newMode;
        }
    }

    /** Toggle between manual and auto modes. */
    function toggleMode() {
        mode.value = mode.value === 'manual' ? 'auto' : 'manual';
    }

    return {
        mode,
        graphReady,
        graphLoading,
        findRoute,
        setMode,
        toggleMode,
    };
}
