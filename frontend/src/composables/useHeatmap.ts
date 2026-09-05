import { ref, type Ref } from 'vue';
import type { MapLayer, MapAdapter } from '../map/MapAdapter';
import type { LatLngTuple } from '@/types';

export interface HeatmapPoint {
    lat: number;
    lon: number;
    weight?: number;
}

export interface HeatmapOptions {
    radius?: number;
    blur?: number;
    minOpacity?: number;
    maxZoom?: number;
    pane?: string;
}

const DEFAULT_HEATMAP_OPTIONS: HeatmapOptions = {
    radius: 18,
    blur: 22,
    minOpacity: 0.25,
    maxZoom: 17,
};

export function useHeatmap(
    adapter: MapAdapter,
    paneName: string = 'heatmapPane',
    options: HeatmapOptions = {}
) {
    const heatLayer: Ref<MapLayer | null> = ref(null);
    const heatmapMaxWeight: Ref<number> = ref(0);

    const mergedOptions = { ...DEFAULT_HEATMAP_OPTIONS, ...options };

    function ensureHeatmapPane(): void {
        if (!adapter.getPane(paneName)) {
            const pane = adapter.createPane(paneName);
            if (pane) {
                pane.style.zIndex = '350';
                pane.style.pointerEvents = 'none';
            }
        }
    }

    function buildHeatmapLatLngs(points: HeatmapPoint[]): Array<[number, number, number]> {
        if (!Array.isArray(points)) return [];
        return points
            .map((point) => {
                if (!point) return null;
                const lat = typeof point.lat === 'number' ? point.lat : null;
                const lon = typeof point.lon === 'number' ? point.lon : null;
                if (lat === null || lon === null) return null;
                const weight =
                    typeof point.weight === 'number' && !Number.isNaN(point.weight)
                        ? Math.max(0, point.weight)
                        : 0;
                return [lat, lon, weight] as [number, number, number];
            })
            .filter((point): point is [number, number, number] => point !== null);
    }

    function removeHeatmapLayer(): void {
        if (heatLayer.value) {
            adapter.removeLayer(heatLayer.value);
        }
        heatLayer.value = null;
        heatmapMaxWeight.value = 0;
    }

    function updateHeatmapLayer(
        points: HeatmapPoint[],
        showHeatmap: boolean,
        mapIsReady: boolean,
        isUnmounting: boolean,
        getMap: () => unknown
    ): void {
        if (!mapIsReady || isUnmounting) return;
        const map = getMap();
        if (!map) return;

        if (!showHeatmap) {
            removeHeatmapLayer();
            return;
        }

        const latlngs = buildHeatmapLatLngs(points);
        if (latlngs.length === 0) {
            removeHeatmapLayer();
            return;
        }

        ensureHeatmapPane();
        const maxWeight = Math.max(...latlngs.map((point) => point[2] || 0), 1);
        const shouldRecreate =
            !heatLayer.value || heatmapMaxWeight.value !== maxWeight;

        if (shouldRecreate && heatLayer.value) {
            adapter.removeLayer(heatLayer.value);
            heatLayer.value = null;
        }

        if (!heatLayer.value) {
            heatLayer.value = adapter.createHeatLayer(latlngs, {
                radius: mergedOptions.radius,
                blur: mergedOptions.blur,
                minOpacity: mergedOptions.minOpacity,
                maxZoom: mergedOptions.maxZoom,
                max: maxWeight,
                pane: paneName,
            });
            if (heatLayer.value) {
                adapter.addLayer(heatLayer.value);
            }
            heatmapMaxWeight.value = maxWeight;
        } else if (heatLayer.value.setLatLngs) {
            heatLayer.value.setLatLngs(latlngs as unknown as LatLngTuple[]);
        }
    }

    return {
        heatLayer,
        heatmapMaxWeight,
        ensureHeatmapPane,
        buildHeatmapLatLngs,
        removeHeatmapLayer,
        updateHeatmapLayer,
    };
}
