// session.js
// Utility for generating and persisting a session_id for the user
// Uses localStorage for simplicity and reliability

const SESSION_KEY = 'trackly_session_id';

function generateSessionId() {
    // Use crypto API for UUID v4 if available, fallback to random string
    if (window.crypto && window.crypto.randomUUID) {
        return window.crypto.randomUUID();
    }
    // Fallback: not cryptographically strong, but sufficient for session
    return 'xxxxxxxxyxxxxyxxxyxxxxxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
        const r = Math.random() * 16 | 0;
        return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
    });
}

export function getSessionId() {
    let sessionId = localStorage.getItem(SESSION_KEY);
    if (!sessionId) {
        sessionId = generateSessionId();
        localStorage.setItem(SESSION_KEY, sessionId);
    }
    return sessionId;
}
