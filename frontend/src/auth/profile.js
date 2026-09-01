const API_BASE = '';

/**
 * Fetch user profile from API.
 *
 * @param {string} accessToken - Current access token
 * @returns {Promise<object|null>}
 */
export async function fetchProfile(accessToken) {
    if (!accessToken) return null;

    const response = await fetch(`${API_BASE}/api/account/me`, {
        headers: { Authorization: `Bearer ${accessToken}` }
    });

    if (!response.ok) {
        throw new Error('Failed to fetch user profile');
    }

    return response.json();
}

/**
 * Update user profile.
 *
 * @param {string} accessToken - Current access token
 * @param {object} updates - Fields to update
 * @returns {Promise<object>} Updated user object
 */
export async function updateProfile(accessToken, updates) {
    const response = await fetch(`${API_BASE}/api/account/profile`, {
        method: 'PATCH',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${accessToken}`
        },
        body: JSON.stringify(updates)
    });

    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || 'Failed to update profile');
    }

    return response.json();
}

/**
 * Delete user account.
 *
 * @param {string} accessToken - Current access token
 * @returns {Promise<void>}
 */
export async function deleteAccount(accessToken) {
    const response = await fetch(`${API_BASE}/api/account`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${accessToken}` },
        credentials: 'include'
    });

    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || 'Failed to delete account');
    }
}
