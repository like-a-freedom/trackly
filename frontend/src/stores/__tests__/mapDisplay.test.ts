import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { useMapDisplayStore } from '../mapDisplay';

describe('personal map display preferences', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
        localStorage.clear();
        setActivePinia(createPinia());
    });

    it('shows markers by default', () => {
        expect(useMapDisplayStore().distanceMarkersEnabled).toBe(true);
    });

    it('restores the personal preference in a new application session', () => {
        useMapDisplayStore().setDistanceMarkersEnabled(false);
        setActivePinia(createPinia());
        expect(useMapDisplayStore().distanceMarkersEnabled).toBe(false);
    });

    it('ignores malformed stored values', () => {
        localStorage.setItem('trackly_distance_markers', 'invalid');
        expect(useMapDisplayStore().distanceMarkersEnabled).toBe(true);
    });

    it('keeps the setting usable when browser storage is blocked', () => {
        vi.spyOn(localStorage, 'getItem').mockImplementation(() => { throw new DOMException('Blocked', 'SecurityError'); });
        const store = useMapDisplayStore();
        expect(store.preferencePersisted).toBe(false);
        store.setDistanceMarkersEnabled(false);
        expect(store.distanceMarkersEnabled).toBe(false);
    });

    it('keeps the current view when persistence fails', () => {
        const store = useMapDisplayStore();
        vi.spyOn(localStorage, 'setItem').mockImplementation(() => { throw new DOMException('Full', 'QuotaExceededError'); });
        store.setDistanceMarkersEnabled(false);
        expect(store.distanceMarkersEnabled).toBe(false);
        expect(store.preferencePersisted).toBe(false);
    });
});
