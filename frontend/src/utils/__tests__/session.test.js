import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { generateSessionId, getSessionId } from '../session';

const originalCryptoDescriptor = Object.getOwnPropertyDescriptor(window, 'crypto');
const originalLocalStorageDescriptor = Object.getOwnPropertyDescriptor(window, 'localStorage');

function setCrypto(value) {
    Object.defineProperty(window, 'crypto', {
        configurable: true,
        writable: true,
        value
    });
}

function setLocalStorageMock() {
    let store = {};
    const mock = {
        getItem: (key) => (Object.prototype.hasOwnProperty.call(store, key) ? store[key] : null),
        setItem: (key, value) => {
            store[key] = value.toString();
        },
        removeItem: (key) => {
            delete store[key];
        },
        clear: () => {
            store = {};
        }
    };

    Object.defineProperty(window, 'localStorage', {
        configurable: true,
        writable: true,
        value: mock
    });
    global.localStorage = mock;
}

describe('session utils', () => {
    beforeEach(() => {
        setLocalStorageMock();
    });

    afterEach(() => {
        if (originalCryptoDescriptor) {
            Object.defineProperty(window, 'crypto', originalCryptoDescriptor);
        } else {
            delete window.crypto;
        }
        if (originalLocalStorageDescriptor) {
            Object.defineProperty(window, 'localStorage', originalLocalStorageDescriptor);
            global.localStorage = window.localStorage;
        } else {
            delete window.localStorage;
            delete global.localStorage;
        }
        vi.restoreAllMocks();
    });

    it('prefers crypto.randomUUID when available', () => {
        const expected = '11111111-1111-4111-8111-111111111111';
        setCrypto({
            randomUUID: vi.fn(() => expected)
        });

        const result = generateSessionId();

        expect(result).toBe(expected);
        expect(window.crypto.randomUUID).toHaveBeenCalledTimes(1);
    });

    it('falls back to crypto.getRandomValues when randomUUID is missing', () => {
        const bytes = Uint8Array.from([
            0, 1, 2, 3, 4, 5, 6, 7,
            8, 9, 10, 11, 12, 13, 14, 15
        ]);
        setCrypto({
            getRandomValues: vi.fn((arr) => arr.set(bytes))
        });

        const result = generateSessionId();
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
        expect(result).toMatch(uuidRegex);
        expect(window.crypto.getRandomValues).toHaveBeenCalledTimes(1);
    });

    it('falls back to Math.random-based hex if no crypto API exists', () => {
        setCrypto(undefined);
        const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0.5);

        const result = generateSessionId();

        expect(result).toMatch(/^[0-9a-f]{32}$/);
        expect(randomSpy).toHaveBeenCalled();
    });

    it('persists the session id in localStorage', () => {
        const expected = '22222222-2222-4222-8222-222222222222';
        setCrypto({
            randomUUID: vi.fn(() => expected)
        });

        const firstCall = getSessionId();
        const secondCall = getSessionId();

        expect(firstCall).toBe(expected);
        expect(secondCall).toBe(expected);
        expect(localStorage.getItem('trackly_session_id')).toBe(expected);
        expect(window.crypto.randomUUID).toHaveBeenCalledTimes(1);
    });

    it('returns existing session id without regenerating', () => {
        const stored = '33333333333333333333333333333333';
        localStorage.setItem('trackly_session_id', stored);
        setCrypto({
            randomUUID: vi.fn(() => 'should-not-be-called')
        });

        const result = getSessionId();

        expect(result).toBe(stored);
        expect(window.crypto.randomUUID).not.toHaveBeenCalled();
    });
});
