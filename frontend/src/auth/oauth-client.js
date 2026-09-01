import { generatePkce, generateState, parseJwt } from './pkce.js';

const API_BASE = '';

/**
 * Start OAuth2 login flow with Google.
 * Stores PKCE verifier and state in sessionStorage, then redirects.
 *
 * @param {object} opts - { onStateSet?: function }
 * @returns {Promise<void>}
 */
export async function startLogin({ onStateSet } = {}) {
    const { codeVerifier, codeChallenge } = await generatePkce();
    const state = generateState();

    sessionStorage.setItem('pkce_code_verifier', codeVerifier);
    sessionStorage.setItem('oauth_state', state);

    if (onStateSet) {
        onStateSet(state);
    }

    const configResponse = await fetch(`${API_BASE}/api/auth/oauth-config`);
    if (!configResponse.ok) {
        throw new Error('Failed to get OAuth configuration');
    }
    const config = await configResponse.json();

    const params = new URLSearchParams({
        client_id: config.client_id,
        redirect_uri: config.redirect_uri,
        response_type: 'code',
        scope: 'openid email profile',
        state,
        code_challenge: codeChallenge,
        code_challenge_method: 'S256',
        access_type: 'offline',
        prompt: 'consent'
    });

    window.location.href = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

/**
 * Handle OAuth callback - exchange code for tokens.
 *
 * @param {string} code - Authorization code from OAuth callback
 * @param {string} state - State parameter for CSRF verification
 * @returns {Promise<{ accessToken: string, user?: object }>}
 */
export async function handleCallback(code, state) {
    const savedState = sessionStorage.getItem('oauth_state');
    if (state !== savedState) {
        throw new Error('Invalid OAuth state - possible CSRF attack');
    }

    const codeVerifier = sessionStorage.getItem('pkce_code_verifier');
    if (!codeVerifier) {
        throw new Error('Missing PKCE code verifier');
    }

    const response = await fetch(`${API_BASE}/api/auth/google/callback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
            code,
            state,
            pkce_verifier: codeVerifier
        })
    });

    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || 'Failed to exchange authorization code');
    }

    const data = await response.json();

    // Clean up sessionStorage
    sessionStorage.removeItem('oauth_state');
    sessionStorage.removeItem('pkce_code_verifier');

    const payload = parseJwt(data.access_token);

    return {
        accessToken: data.access_token,
        expiresAt: payload?.exp ? payload.exp * 1000 : null,
        user: data.user || null
    };
}

/**
 * Clear OAuth state from sessionStorage.
 */
export function clearOAuthState() {
    sessionStorage.removeItem('oauth_state');
    sessionStorage.removeItem('pkce_code_verifier');
    sessionStorage.removeItem('pending_migration_session_id');
}
