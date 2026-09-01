/**
 * ClusterAdapter — manages a MarkerClusterGroup lifecycle.
 *
 * Wraps `L.markerClusterGroup` creation, marker CRUD, event wiring,
 * and cleanup behind a single, testable factory function.
 *
 * @module map/ClusterAdapter
 */

import L from 'leaflet';

/**
 * Create a ClusterAdapter.
 *
 * @param {object} [config] - Cluster configuration overrides.
 * @param {number}  [config.disableClusteringAtZoom=14]
 * @param {number}  [config.maxClusterRadius=36]
 * @param {boolean} [config.showCoverageOnHover=true]
 * @param {boolean} [config.zoomToBoundsOnClick=true]
 * @param {boolean} [config.animate=true]
 * @param {boolean} [config.animateAddingMarkers=true]
 * @returns {{
 *   initialize(config?: object): object|null,
 *   addMarker(marker: object): void,
 *   addMarkers(markers: Array): void,
 *   removeMarker(marker: object): void,
 *   clearLayers(): void,
 *   getGroup(): object|null,
 *   getLayers(): Array,
 *   getBounds(): object|null,
 *   addTo(map: object): void,
 *   remove(): void,
 *   on(event: string, cb: Function): void,
 *   off(event: string, cb: Function): void,
 *   cleanup(): void,
 * }}
 */
export function createClusterAdapter(config = {}) {
  /** @type {object|null} */
  let _group = null;

  /**
   * Initialise (or re-initialise) the underlying MarkerClusterGroup.
   *
   * @param {object} [overrides] - Configuration overrides merged on top
   *   of the defaults provided at construction time.
   * @returns {object|null} The newly created group, or null when
   *   `L.markerClusterGroup` is unavailable.
   */
  function initialize(overrides = {}) {
    // Tear down any previous group first
    if (_group) {
      cleanup();
    }

    const opts = { ...config, ...overrides };

    if (typeof L.markerClusterGroup !== 'function') {
      // Return a minimal stub so callers never have to null-check
      _group = {
        addLayer() {},
        addLayers() {},
        removeLayer() {},
        clearLayers() {},
        addTo() { return this; },
        on() { return this; },
        off() { return this; },
        remove() {},
        getLayers() { return []; },
        getBounds() { return null; },
        getChildCount() { return 0; },
        getAllChildMarkers() { return []; },
      };
      return _group;
    }

    _group = L.markerClusterGroup({
      disableClusteringAtZoom: opts.disableClusteringAtZoom ?? 14,
      maxClusterRadius: opts.maxClusterRadius ?? 36,
      showCoverageOnHover: opts.showCoverageOnHover ?? true,
      zoomToBoundsOnClick: opts.zoomToBoundsOnClick ?? true,
      animate: opts.animate ?? true,
      animateAddingMarkers: opts.animateAddingMarkers ?? true,
      chunkedLoading: true,
      removeOutsideVisibleBounds: true,
      spiderfyOnMaxZoom: false,
    });

    return _group;
  }

  // ----- marker CRUD -----

  /**
   * Add a single marker to the cluster group.
   * @param {object} marker
   */
  function addMarker(marker) {
    if (_group && marker) {
      _group.addLayer(marker);
    }
  }

  /**
   * Add an array of markers in one call.
   * @param {Array} markers
   */
  function addMarkers(markers) {
    if (_group && Array.isArray(markers) && markers.length > 0) {
      _group.addLayers(markers);
    }
  }

  /**
   * Remove a single marker from the cluster group.
   * @param {object} marker
   */
  function removeMarker(marker) {
    if (_group && marker) {
      _group.removeLayer(marker);
    }
  }

  /** Remove all markers from the group. */
  function clearLayers() {
    if (_group && _group.getLayers && _group.getLayers().length > 0) {
      _group.clearLayers();
    }
  }

  // ----- accessors -----

  /** @returns {object|null} */
  function getGroup() {
    return _group;
  }

  /** @returns {Array} */
  function getLayers() {
    if (!_group || !_group.getLayers) return [];
    return _group.getLayers();
  }

  /** @returns {object|null} */
  function getBounds() {
    if (!_group || !_group.getBounds) return null;
    return _group.getBounds();
  }

  // ----- map integration -----

  /**
   * Add the cluster group to a map.
   * @param {object} map
   */
  function addTo(map) {
    if (_group && map) {
      map.addLayer(_group);
    }
  }

  /** Remove the cluster group from whatever map it is on. */
  function remove() {
    if (_group) {
      _group.remove();
    }
  }

  // ----- events -----

  /**
   * @param {string} event
   * @param {Function} cb
   */
  function on(event, cb) {
    if (_group) {
      _group.on(event, cb);
    }
  }

  /**
   * @param {string} event
   * @param {Function} cb
   */
  function off(event, cb) {
    if (_group) {
      _group.off(event, cb);
    }
  }

  // ----- cleanup -----

  /** Tear down the group completely and release references. */
  function cleanup() {
    if (!_group) return;

    try {
      // Remove zoom animation listeners from individual markers first
      if (_group.getLayers) {
        const layers = _group.getLayers();
        layers.forEach((layer) => {
          try {
            if (layer._map) {
              layer._map.off('zoomanim', layer._animateZoom, layer);
              layer._map = null;
            }
          } catch (_) { /* noop */ }
        });
        _group.clearLayers();
      }

      if (_group.off) {
        _group.off();
      }

      _group.remove();
    } catch (_) { /* noop */ }

    _group = null;
  }

  // ----- public API -----

  return {
    initialize,
    addMarker,
    addMarkers,
    removeMarker,
    clearLayers,
    getGroup,
    getLayers,
    getBounds,
    addTo,
    remove,
    on,
    off,
    cleanup,
  };
}
