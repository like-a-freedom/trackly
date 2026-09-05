import { ref, type Ref } from 'vue';

export interface MapObjectResult {
    leafletMap: Ref<unknown>;
    leafletInstance: Ref<unknown>;
    getMapObject(context?: string): unknown;
    setMapInstance(map: unknown): void;
    setUnmounting(value: boolean): void;
}

export function useMapObject(): MapObjectResult {
    const leafletMap = ref(null);
    const leafletInstance: Ref<unknown> = ref(null);
    const isUnmounting = ref(false);

    function getMapObject(context: string = ''): unknown {
        try {
            if (leafletMap.value && (leafletMap.value as unknown as { mapObject: unknown }).mapObject) {
                return (leafletMap.value as unknown as { mapObject: unknown }).mapObject;
            }
            const mapInstance = (leafletMap.value as unknown as { leafletObject: unknown })?.leafletObject ||
                (leafletMap.value as unknown as { mapObject: unknown })?.mapObject;
            if (mapInstance && typeof (mapInstance as unknown as { getZoom: () => number }).getZoom === 'function') {
                return mapInstance;
            }
            if (context !== 'cleanup' && !isUnmounting.value) {
                console.warn(
                    `[TrackMap] Map object not available${context ? ' in ' + context : ''}`
                );
            }
            return null;
        } catch (error) {
            if (context !== 'cleanup' && !isUnmounting.value) {
                console.error(
                    `[TrackMap] Error accessing map object${context ? ' in ' + context : ''}:`,
                    error
                );
            }
            return null;
        }
    }

    function setMapInstance(map: unknown): void {
        leafletInstance.value = map;
    }

    function setUnmounting(value: boolean): void {
        isUnmounting.value = value;
    }

    return {
        leafletMap,
        leafletInstance,
        getMapObject,
        setMapInstance,
        setUnmounting,
    };
}
