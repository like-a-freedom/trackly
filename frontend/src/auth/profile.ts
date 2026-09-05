import type { User } from '@/types';

const API_BASE = '';

/**
 * Fetch user profile from API.
 *
 * @param accessToken - Current access token
 * @returns User profile or null if no token
 */
export async function fetchProfile(accessToken: string): Promise<User | null> {
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
 * @param accessToken - Current access token
 * @param updates - Fields to update
 * @returns Updated user object
 */
export async function updateProfile(accessToken: string, updates: Partial<User>): Promise<User> {
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
 * @param accessToken - Current access token
 */
export async function deleteAccount(accessToken: string): Promise<void> {
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
