// @ts-nocheck - Test mocks don't need full type fidelity
import { describe, it, expect } from 'vitest';
import { getLatLngFromTouch } from '../touch';

describe('touch.js', () => {
    it('returns null when no touch data is present', () => {
        const map = { mouseEventToLatLng: () => ({ lat: 0, lng: 0 }) };
        expect(getLatLngFromTouch(map, {})).toBeNull();
    });

    it('uses changedTouches when available', () => {
        const map = { mouseEventToLatLng: (touch) => ({ lat: touch.clientY, lng: touch.clientX }) };
        const event = {
            originalEvent: {
                changedTouches: [{ clientX: 10, clientY: 20 }]
            }
        };

        expect(getLatLngFromTouch(map, event)).toEqual({ lat: 20, lng: 10 });
    });

    it('falls back to touches when changedTouches is missing', () => {
        const map = { mouseEventToLatLng: (touch) => ({ lat: touch.pageY, lng: touch.pageX }) };
        const event = {
            originalEvent: {
                touches: [{ pageX: 5, pageY: 15 }]
            }
        };

        expect(getLatLngFromTouch(map, event)).toEqual({ lat: 15, lng: 5 });
    });
});
