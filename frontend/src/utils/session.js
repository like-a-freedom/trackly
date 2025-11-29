// session.js
// Utility for generating and persisting a session_id for the user
// Uses localStorage for simplicity and reliability

const SESSION_KEY = 'trackly_session_id';

function formatUuid(bytes) {
    const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function generateSessionId() {
    const cryptoApi = typeof window !== 'undefined' ? window.crypto : undefined;

    if (cryptoApi?.randomUUID) {
        return cryptoApi.randomUUID();
    }

    if (cryptoApi?.getRandomValues) {
        const bytes = new Uint8Array(16);
        cryptoApi.getRandomValues(bytes);
        bytes[6] = (bytes[6] & 0x0f) | 0x40; // version 4
        bytes[8] = (bytes[8] & 0x3f) | 0x80; // variant 1
        return formatUuid(bytes);
    }

    // Final fallback: deterministic-length hex string so backend UUID parsing never fails
    let fallback = '';
    for (let i = 0; i < 32; i += 1) {
        fallback += Math.floor(Math.random() * 16).toString(16);
    }
    return fallback;
}

export function getSessionId() {
    let sessionId = localStorage.getItem(SESSION_KEY);
    if (!sessionId) {
        sessionId = generateSessionId();
        localStorage.setItem(SESSION_KEY, sessionId);
    }
    return sessionId;
}
