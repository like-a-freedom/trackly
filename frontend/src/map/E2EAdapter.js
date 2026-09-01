/**
 * E2EAdapter — sets up and tears down E2E testing hooks on `window`.
 *
 * Provides a portable way to expose APIs under a configurable namespace
 * (default `__e2e`) that Playwright / Cypress tests can call.
 *
 * @module map/E2EAdapter
 */

/**
 * Create an E2EAdapter.
 *
 * @param {object}  [opts]
 * @param {string}  [opts.namespace='__e2e'] - Property name on `window`.
 * @param {boolean} [opts.production=false]  - When true the adapter is a
 *   no-op (nothing is exposed).
 * @returns {{
 *   exposeE2E(namespace: string, api: object): void,
 *   expose(api: object): void,
 *   getApi(): object|null,
 *   cleanup(): void,
 * }}
 */
export function createE2EAdapter({ namespace = '__e2e', production = false } = {}) {
  if (production) {
    return {
      exposeE2E() {},
      expose() {},
      getApi() { return null; },
      cleanup() {},
    };
  }

  /** @type {string[]} Keys we have added (for selective cleanup). */
  const _addedKeys = [];

  /**
   * Merge `api` properties into `window[ns]`, preserving any keys
   * that already existed on the object.
   *
   * @param {string} ns  Namespace / property name on `window`.
   * @param {object} api Key-value pairs to expose.
   */
  function exposeE2E(ns, api) {
    if (typeof window === 'undefined' || !api) return;
    window[ns] = window[ns] || {};
    for (const key of Object.keys(api)) {
      window[ns][key] = api[key];
      _addedKeys.push(key);
    }
  }

  /**
   * Shorthand: expose under the adapter's default namespace.
   * @param {object} api
   */
  function expose(api) {
    exposeE2E(namespace, api);
  }

  /**
   * Return a reference to the current namespace object, or `null`.
   * @returns {object|null}
   */
  function getApi() {
    if (typeof window === 'undefined') return null;
    return window[namespace] || null;
  }

  /**
   * Remove only the keys this adapter has added, leaving pre-existing
   * keys intact.
   */
  function cleanup() {
    if (typeof window === 'undefined') return;
    if (!window[namespace]) return;
    for (const key of _addedKeys) {
      try {
        delete window[namespace][key];
      } catch (_) { /* non-configurable — skip */ }
    }
    _addedKeys.length = 0;

    // Remove the namespace object itself if it is now empty
    if (Object.keys(window[namespace]).length === 0) {
      delete window[namespace];
    }
  }

  return {
    exposeE2E,
    expose,
    getApi,
    cleanup,
  };
}
