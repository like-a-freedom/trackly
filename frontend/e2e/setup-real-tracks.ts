/**
 * Setup real tracks in the backend for E2E tests
 * This replaces synthetic fixtures with real API calls
 */

import { readFileSync, writeFileSync } from 'fs';

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:8080';

interface TrackInfo {
  id: string;
  name: string;
}

/**
 * Upload a GPX file to the backend and return track ID
 */
async function uploadGpxFile(filePath: string, trackName: string): Promise<TrackInfo> {
  // Need to use node-fetch FormData for Node.js environment
  const FormData = (await import('form-data')).default;
  const gpxContent = readFileSync(filePath);
  
  const form = new FormData();
  form.append('file', gpxContent, {
    filename: `${trackName}.gpx`,
    contentType: 'application/gpx+xml'
  });
  form.append('categories', 'e2e-test');
  form.append('session_id', 'e2e-test-session');
  form.append('name', trackName);

  const response = await fetch(`${BACKEND_URL}/tracks`, {
    method: 'POST',
    body: form as any,
    headers: form.getHeaders()
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('Upload failed:', errorText);
    throw new Error(`Failed to upload GPX: ${response.status} ${response.statusText}\n${errorText}`);
  }

  const data = await response.json();
  return {
    id: data.id || data.track_id,
    name: trackName
  };
}

/**
 * Create test tracks from fixture data
 * Returns mapping of fixture name to real track ID
 */
export async function setupTestTracks(): Promise<Record<string, string>> {
  // Query backend for existing tracks and pick representative ones
  const tracks: Record<string, string> = {};
  try {
    const res = await fetch(`${BACKEND_URL}/tracks?mode=detail&zoom=12`);
    if (!res.ok) throw new Error(`Failed to list tracks: ${res.status}`);
    const geo = await res.json();
    const features = geo.features || [];

    // Fill default ids in order: base, multi (with gaps), single (no gaps)
    let baseId: string | null = null;
    let multiId: string | null = null;
    let singleId: string | null = null;

    for (const f of features) {
      const id = f.properties && f.properties.id;
      if (!id) continue;
      if (!baseId) baseId = id;

      // Fetch detailed track to inspect segment_gaps
      const detailRes = await fetch(`${BACKEND_URL}/tracks/${id}`);
      if (!detailRes.ok) continue;
      const detail = await detailRes.json();

      const hasGaps = Array.isArray(detail.segment_gaps) && detail.segment_gaps.length > 0;

      if (hasGaps && !multiId) {
        multiId = id;
      }
      if (!hasGaps && !singleId) {
        singleId = id;
      }

      if (baseId && multiId && singleId) break;
    }

    // Fallbacks if not found
    if (!baseId && features.length > 0) baseId = features[0].properties.id;
    if (!multiId) multiId = baseId;
    if (!singleId) singleId = baseId;

    tracks['test-track-e2e'] = baseId as string;
    tracks['test-track-multi'] = multiId as string;
    tracks['test-track-single'] = singleId as string;

    console.log('✓ Selected existing tracks for E2E:', tracks);
    return tracks;
  } catch (error) {
    console.error('Failed to setup test tracks (list/search):', error);
    throw error;
  }
}

/**
 * Cleanup test tracks after tests complete
 */
export async function cleanupTestTracks(_trackIds: string[]): Promise<void> {
  // We are using existing local backend tracks; do NOT delete them in tests.
  console.log('Skipping deletion of real tracks (using local backend)');
}
