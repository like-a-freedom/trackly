/**
 * StubAdapter — test double for MapAdapter.
 * Records all calls for assertion in tests.
 */

export function createStubAdapter() {
    const calls = [];

    return {
        calls,

        renderTile(_url, _attribution) {
            calls.push({ method: 'renderTile', args: [_url, _attribution] });
        },

        renderGeoJson(_data, _style, _onEach) {
            calls.push({ method: 'renderGeoJson', args: [_data, _style, _onEach] });
            return { setStyle: () => {}, remove: () => {}, addTo: () => {} };
        },

        renderClusterGroup(_points, _options) {
            calls.push({ method: 'renderClusterGroup', args: [_points, _options] });
            return {
                addLayer: () => {},
                removeLayer: () => {},
                clearLayers: () => {},
                addTo: () => {},
                on: () => {},
                off: () => {},
                remove: () => {},
            };
        },

        on(_event, _cb) {
            calls.push({ method: 'on', args: [_event, _cb] });
        },

        off(_event, _cb) {
            calls.push({ method: 'off', args: [_event, _cb] });
        },

        getCenter() {
            calls.push({ method: 'getCenter' });
            return [0, 0];
        },

        isIdle() {
            calls.push({ method: 'isIdle' });
            return true;
        },

        fitBounds(_bbox) {
            calls.push({ method: 'fitBounds', args: [_bbox] });
        },

        setView(_center, _zoom) {
            calls.push({ method: 'setView', args: [_center, _zoom] });
        },

        exposeE2E(_namespace, _api) {
            calls.push({ method: 'exposeE2E', args: [_namespace, _api] });
        },
    };
}
