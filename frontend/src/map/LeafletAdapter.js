/**
 * LeafletAdapter — wraps a Leaflet L.Map instance behind the MapAdapter port.
 *
 * Provides a thin, library-agnostic façade over every Leaflet API surface
 * used by TrackMap: view control, layer management, heatmap, polylines,
 * pane creation, and event delegation.
 *
 * @module map/LeafletAdapter
 */

import L from 'leaflet';

/**
 * Create a LeafletAdapter instance.
 *
 * The returned object satisfies (and extends) the MapAdapter interface.
 * Call `setMap(map)` with a live `L.Map` before using any method that
 * touches the map; all methods are null-guarded so they no-op when the
 * map is not yet available.
 *
 * @returns {import('./MapAdapter.js').MapAdapter & {
 *   setMap(map: L.Map|void): void,
 *   getMap(): L.Map|void,
 *   renderTile(url: string, attribution: string): void,
 *   renderGeoJson(data: object, style: Function, onEach: Function): L.GeoJSON|null,
 *   renderClusterGroup(points: Array, options: object): object,
 *   createHeatLayer(latlngs: Array, options: object): L.HeatLayer|null,
 *   createPolyline(latlngs: Array, options: object): L.Polyline|null,
 *   getCenter(): [number,number]|null,
 *   getZoom(): number|null,
 *   getBounds(): L.LatLngBounds|null,
 *   setView(center: Array, zoom: number): void,
 *   flyTo(center: Array, zoom: number, options?: object): void,
 *   flyToBounds(bounds: Array, options?: object): void,
 *   fitBounds(bounds: Array, options?: object): void,
 *   panTo(latlng: Array, options?: object): void,
 *   stop(): void,
 *   addLayer(layer: L.Layer): void,
 *   removeLayer(layer: L.Layer): void,
 *   eachLayer(cb: Function): void,
 *   getPane(name: string): HTMLElement|null,
 *   createPane(name: string, container?: HTMLElement): HTMLElement|void,
 *   on(event: string, cb: Function): void,
 *   off(event: string, cb: Function): void,
 *   isIdle(): boolean,
 *   exposeE2E(namespace: string, api: object): void,
 * }}
 */
export function createLeafletAdapter() {
  /** @type {L.Map|null} */
  let _map = null;

  /** @type {boolean} */
  let _idle = false;

  // ----- lifecycle -----

  /**
   * Bind the adapter to a live Leaflet map instance.
   * @param {L.Map} map
   */
  function setMap(map) {
    _map = map;
    _idle = false;

    if (map) {
      // Track idle state through moveend / zoomend
      map.on('moveend', () => { _idle = true; });
      map.on('zoomend', () => { _idle = true; });
      map.on('movestart', () => { _idle = false; });
      map.on('zoomstart', () => { _idle = false; });
    }
  }

  /** @returns {L.Map|null} */
  function getMap() {
    return _map;
  }

  // ----- tile layer (programmatic) -----

  /**
   * Add a tile layer to the map.
   * @param {string} url
   * @param {string} attribution
   */
  function renderTile(url, attribution) {
    if (!_map) return;
    L.tileLayer(url, { attribution }).addTo(_map);
  }

  // ----- GeoJSON layer (programmatic) -----

  /**
   * Add a GeoJSON layer to the map.
   * @param {object} data
   * @param {Function} style
   * @param {Function} onEach
   * @returns {L.GeoJSON|null}
   */
  function renderGeoJson(data, style, onEach) {
    if (!_map) return null;
    return L.geoJson(data, { style, onEachFeature: onEach }).addTo(_map);
  }

  // ----- cluster group (delegates to L.markerClusterGroup) -----

  /**
   * Create a MarkerClusterGroup (does **not** add it to the map).
   * @param {object} options
   * @returns {object} The cluster group — caller adds to map via addTo / addLayer.
   */
  function renderClusterGroup(_points, options = {}) {
    // Lazy-require to avoid hard dep when clustering is tree-shaken
    // eslint-disable-next-line no-underscore-dangle
    if (typeof L.markerClusterGroup !== 'function') {
      return {
        addLayer() {},
        removeLayer() {},
        clearLayers() {},
        addTo() {},
        on() {},
        off() {},
        remove() {},
        getLayers() { return []; },
        getBounds() { return null; },
        getChildCount() { return 0; },
        getAllChildMarkers() { return []; },
      };
    }
    return L.markerClusterGroup(options);
  }

  // ----- heatmap -----

  /**
   * Create a Leaflet.heat layer.
   * @param {Array} latlngs
   * @param {object} options
   * @returns {L.HeatLayer|null}
   */
  function createHeatLayer(latlngs, options = {}) {
    if (!_map) return null;
    if (typeof L.heatLayer !== 'function') return null;
    return L.heatLayer(latlngs, options);
  }

  // ----- polyline -----

  /**
   * Create a Leaflet polyline (not yet added to any map).
   * @param {Array} latlngs
   * @param {object} options
   * @returns {L.Polyline|null}
   */
  function createPolyline(latlngs, options = {}) {
    if (typeof L.polyline !== 'function') return null;
    return L.polyline(latlngs, options);
  }

  // ----- view control -----

  /**
   * @returns {[number,number]|null}
   */
  function getCenter() {
    if (!_map) return null;
    const c = _map.getCenter();
    return [c.lat, c.lng];
  }

  /** @returns {number|null} */
  function getZoom() {
    if (!_map) return null;
    return _map.getZoom();
  }

  /** @returns {L.LatLngBounds|null} */
  function getBounds() {
    if (!_map) return null;
    return _map.getBounds();
  }

  /**
   * @param {Array} center [lat, lng]
   * @param {number} zoom
   */
  function setView(center, zoom) {
    if (!_map) return;
    _map.setView(center, zoom);
  }

  /**
   * @param {Array} center [lat, lng]
   * @param {number} zoom
   * @param {object} [options]
   */
  function flyTo(center, zoom, options) {
    if (!_map) return;
    _map.flyTo(center, zoom, options);
  }

  /**
   * @param {Array} bounds
   * @param {object} [options]
   */
  function flyToBounds(bounds, options) {
    if (!_map) return;
    _map.flyToBounds(bounds, options);
  }

  /**
   * @param {Array} bounds
   * @param {object} [options]
   */
  function fitBounds(bounds, options) {
    if (!_map) return;
    _map.fitBounds(bounds, options);
  }

  /**
   * @param {Array} latlng [lat, lng]
   * @param {object} [options]
   */
  function panTo(latlng, options) {
    if (!_map) return;
    _map.panTo(latlng, options);
  }

  /** Stop all map animations. */
  function stop() {
    if (!_map) return;
    try { _map.stop(); } catch (_) { /* noop */ }
  }

  // ----- layer management -----

  /**
   * @param {L.Layer} layer
   */
  function addLayer(layer) {
    if (!_map) return;
    _map.addLayer(layer);
  }

  /**
   * @param {L.Layer} layer
   */
  function removeLayer(layer) {
    if (!_map) return;
    try { _map.removeLayer(layer); } catch (_) { /* noop */ }
  }

  /**
   * Iterate all layers on the map.
   * @param {Function} cb
   */
  function eachLayer(cb) {
    if (!_map) return;
    _map.eachLayer(cb);
  }

  // ----- pane management -----

  /**
   * @param {string} name
   * @returns {HTMLElement|null}
   */
  function getPane(name) {
    if (!_map) return null;
    return _map.getPane(name) || null;
  }

  /**
   * @param {string} name
   * @param {HTMLElement} [container]
   * @returns {HTMLElement|void}
   */
  function createPane(name, container) {
    if (!_map) return undefined;
    return _map.createPane(name, container);
  }

  // ----- attribution control -----

  /**
   * Move the attribution control to a given position.
   * @param {string} position - e.g. 'bottomleft'
   */
  function repositionAttribution(position) {
    if (!_map || !_map.attributionControl) return;
    try {
      _map.removeControl(_map.attributionControl);
      _map.attributionControl.setPosition(position);
      _map.addControl(_map.attributionControl);
    } catch (_) { /* noop */ }
  }

  // ----- events -----

  /**
   * @param {string} event
   * @param {Function} cb
   */
  function on(event, cb) {
    if (!_map) return;
    _map.on(event, cb);
  }

  /**
   * @param {string} event
   * @param {Function} cb
   */
  function off(event, cb) {
    if (!_map) return;
    _map.off(event, cb);
  }

  // ----- idle state -----

  /** @returns {boolean} */
  function isIdle() {
    return _idle;
  }

  // ----- E2E hooks (lightweight delegate) -----

  /**
   * Expose an API object under `window[namespace]`.
   * Preserves any existing keys already on the namespace object.
   *
   * @param {string} namespace
   * @param {object} api
   */
  function exposeE2E(namespace, api) {
    if (typeof window === 'undefined') return;
    window[namespace] = window[namespace] || {};
    Object.assign(window[namespace], api);
  }

  // ----- public interface -----

  return {
    // lifecycle
    setMap,
    getMap,

    // MapAdapter port methods
    renderTile,
    renderGeoJson,
    renderClusterGroup,
    on,
    off,
    getCenter,
    getZoom,
    getBounds,
    isIdle,
    fitBounds,
    setView,
    exposeE2E,

    // extended API
    flyTo,
    flyToBounds,
    panTo,
    stop,
    addLayer,
    removeLayer,
    eachLayer,
    getPane,
    createPane,
    repositionAttribution,
    createHeatLayer,
    createPolyline,
  };
}
