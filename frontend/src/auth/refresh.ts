import { parseJwt } from './pkce';

const API_BASE = '';

interface TokenData {
    access_token: string;
}

interface RefreshResult {
    accessToken: string;
    expiresAt: number | null;
}

/**
 * Refresh access token using refresh token cookie.
 *
 * @returns Object with accessToken and expiresAt, or null if no session exists (204) or on failure.
 */
export async function refreshToken(): Promise<RefreshResult | null> {
    try {
        const response = await fetch(`${API_BASE}/api/auth/refresh`, {
            method: 'POST',
            credentials: 'include'
        });

        // 204 No Content → no session (no cookie) - not an error
        if (response.status === 204) {
            return null;
        }

        if (!response.ok) {
            return null;
        }

        const data: TokenData = await response.json();
        const payload = parseJwt(data.access_token);

        return {
            accessToken: data.access_token,
            expiresAt: payload?.exp ? Number(payload.exp) * 1000 : null
        };
    } catch (e) {
        console.error('Token refresh failed:', e);
        return null;
    }
}

/**
 * Logout - invalidate refresh token via server.
 *
 * @param accessToken - Current access token (may be null)
 */
export async function logout(accessToken: string | null): Promise<void> {
    try {
        const response = await fetch(`${API_BASE}/api/auth/logout`, {
            method: 'POST',
            credentials: 'include',
            headers: accessToken
                ? { Authorization: `Bearer ${accessToken}` }
                : {}
        });
        if (!response.ok) throw new Error(`Logout HTTP ${response.status}`);
    } catch (e) {
        console.error('Logout request failed:', e);
        throw new Error('Signed out on this device, but server logout could not be confirmed. Retry to end the server session.');
    }
}
