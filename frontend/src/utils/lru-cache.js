/**
 * Simple LRU cache backed by Map (insertion-ordered).
 * When size exceeds `max`, the oldest entry is evicted.
 */
export class LRUCache {
  constructor(max = 100) {
    this._max = max;
    this._map = new Map();
  }

  get(key) {
    if (!this._map.has(key)) return undefined;
    // Move to end (most recently used)
    const value = this._map.get(key);
    this._map.delete(key);
    this._map.set(key, value);
    return value;
  }

  set(key, value) {
    if (this._map.has(key)) this._map.delete(key);
    this._map.set(key, value);
    // Evict oldest if over capacity
    if (this._map.size > this._max) {
      const oldest = this._map.keys().next().value;
      this._map.delete(oldest);
    }
  }

  has(key) {
    return this._map.has(key);
  }

  get size() {
    return this._map.size;
  }

  clear() {
    this._map.clear();
  }
}
