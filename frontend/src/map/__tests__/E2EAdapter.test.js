/**
 * Tests for E2EAdapter
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createE2EAdapter } from '../E2EAdapter.js';

describe('E2EAdapter', () => {
  // ---- production mode (no-op) ----
  describe('production mode', () => {
    it('expose is a no-op', () => {
      const adapter = createE2EAdapter({ production: true });
      adapter.expose({ hello: 'world' });
      // window.__e2e should not exist
      expect(globalThis.__e2e).toBeUndefined();
    });

    it('getApi returns null', () => {
      const adapter = createE2EAdapter({ production: true });
      expect(adapter.getApi()).toBeNull();
    });

    it('cleanup is a no-op', () => {
      const adapter = createE2EAdapter({ production: true });
      expect(() => adapter.cleanup()).not.toThrow();
    });
  });

  // ---- dev mode ----
  describe('dev mode', () => {
    let adapter;

    beforeEach(() => {
      adapter = createE2EAdapter({ namespace: '__test_e2e' });
    });

    afterEach(() => {
      adapter.cleanup();
      delete globalThis.__test_e2e;
    });

    // ---- expose ----
    describe('expose', () => {
      it('creates namespace object', () => {
        adapter.expose({ hello: 'world' });
        expect(globalThis.__test_e2e).toBeDefined();
        expect(globalThis.__test_e2e.hello).toBe('world');
      });

      it('merges multiple calls', () => {
        adapter.expose({ a: 1 });
        adapter.expose({ b: 2 });
        expect(globalThis.__test_e2e).toEqual({ a: 1, b: 2 });
      });

      it('preserves pre-existing keys', () => {
        globalThis.__test_e2e = { preExisting: true };
        adapter.expose({ added: 'new' });
        expect(globalThis.__test_e2e.preExisting).toBe(true);
        expect(globalThis.__test_e2e.added).toBe('new');
      });
    });

    // ---- exposeE2E (with custom namespace) ----
    describe('exposeE2E', () => {
      it('exposes under a custom namespace', () => {
        adapter.exposeE2E('__custom_ns', { key: 'val' });
        expect(globalThis.__custom_ns).toEqual({ key: 'val' });
        // Clean up
        delete globalThis.__custom_ns;
      });
    });

    // ---- getApi ----
    describe('getApi', () => {
      it('returns null before expose', () => {
        expect(adapter.getApi()).toBeNull();
      });

      it('returns namespace object after expose', () => {
        adapter.expose({ hello: 'world' });
        expect(adapter.getApi()).toEqual({ hello: 'world' });
      });
    });

    // ---- cleanup ----
    describe('cleanup', () => {
      it('removes only keys added by this adapter', () => {
        globalThis.__test_e2e = { preExisting: true };
        adapter.expose({ added1: 1, added2: 2 });
        adapter.cleanup();
        expect(globalThis.__test_e2e).toEqual({ preExisting: true });
      });

      it('deletes namespace object if empty after cleanup', () => {
        adapter.expose({ only: 'key' });
        adapter.cleanup();
        expect(globalThis.__test_e2e).toBeUndefined();
      });

      it('does not throw when namespace does not exist', () => {
        delete globalThis.__test_e2e;
        expect(() => adapter.cleanup()).not.toThrow();
      });

      it('can be called multiple times', () => {
        adapter.expose({ a: 1 });
        adapter.cleanup();
        expect(() => adapter.cleanup()).not.toThrow();
      });
    });
  });

  // ---- default namespace ----
  describe('default namespace (__e2e)', () => {
    let adapter;

    beforeEach(() => {
      adapter = createE2EAdapter();
    });

    afterEach(() => {
      adapter.cleanup();
      delete globalThis.__e2e;
    });

    it('uses __e2e by default', () => {
      adapter.expose({ test: true });
      expect(globalThis.__e2e).toBeDefined();
      expect(globalThis.__e2e.test).toBe(true);
    });

    it('cleanup removes only added keys', () => {
      globalThis.__e2e = { existing: 42 };
      adapter.expose({ mine: 'data' });
      adapter.cleanup();
      expect(globalThis.__e2e).toEqual({ existing: 42 });
    });
  });
});
