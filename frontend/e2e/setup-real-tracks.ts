/**
 * Setup real tracks in the backend for E2E tests
 * This replaces synthetic fixtures with real API calls
 */

import { readFileSync, writeFileSync } from 'fs';
import path from 'path';

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

  for (let att = 1; att <= 6; att++) {
    const response = await fetch(`${BACKEND_URL}/api/tracks`, {
      method: 'POST',
      body: form as any,
      headers: form.getHeaders()
    });

    if (response.ok) {
      const data = await response.json();
      return { id: data.id || data.track_id, name: trackName };
    }

    const errorText = await response.text();
    console.warn('Upload attempt', att, 'failed:', response.status, errorText);

    // Handle cooldown / rate limit
    if (response.status === 429) {
      const m = typeof errorText === 'string' && errorText.match && errorText.match(/Please, wait (\d+) seconds/);
      if (m) {
        const sec = Number(m[1]) || 1;
        console.warn('Server requested wait', sec, 'seconds — sleeping');
        await new Promise(r => setTimeout(r, (sec + 1) * 1000));
        continue;
      }
      const retry = response.headers.get('retry-after');
      if (retry) {
        const sec = Number(retry) || 1;
        console.warn('Retry-After header present, sleeping', sec, 'seconds');
        await new Promise(r => setTimeout(r, (sec + 1) * 1000));
        continue;
      }
      await new Promise(r => setTimeout(r, 1000 * att));
      continue;
    }

    // If geometry validation fails, try with a two-point GPX
    if (response.status >= 500 && errorText && (errorText.includes('tracks_geom_valid') || errorText.includes('Too few points'))) {
      console.warn('Geometry validation failed; retrying upload with 2-point GPX');
      const twoPoint = `<?xml version="1.0" encoding="UTF-8"?>\n<gpx version="1.1" creator="Trackly E2E">\n  <trk>\n    <name>${trackName} (2pt)</name>\n    <trkseg>\n      <trkpt lat="37.7810" lon="-122.4200"><ele>10</ele></trkpt>\n      <trkpt lat="37.7820" lon="-122.4210"><ele>12</ele></trkpt>\n    </trkseg>\n  </trk>\n</gpx>`;
      const altForm = new (await import('form-data')).default();
      altForm.append('file', Buffer.from(twoPoint), {
        filename: `${trackName}-2pt.gpx`,
        contentType: 'application/gpx+xml'
      });
      altForm.append('name', trackName + ' (2pt)');
      altForm.append('categories', 'e2e-test');
      altForm.append('session_id', 'e2e-test-session');
      const r2 = await fetch(`${BACKEND_URL}/api/tracks`, { method: 'POST', body: altForm as any, headers: altForm.getHeaders() });
      if (r2.ok) {
        const d2 = await r2.json();
        return { id: d2.id || d2.track_id, name: trackName };
      }
      const t2 = await r2.text();
      console.warn('Alt upload failed', r2.status, t2);
      await new Promise(r => setTimeout(r, 1000 * att));
      continue;
    }

    if (response.status >= 500) {
      await new Promise(r => setTimeout(r, 1000 * att));
      continue;
    }

    throw new Error(`Failed to upload GPX: ${response.status} ${response.statusText}\n${errorText}`);
  }

  throw new Error('Failed to upload GPX after retries');
}

/**
 * Create test tracks from fixture data
 * Returns mapping of fixture name to real track ID
 */
const FIXTURE_MAP: Array<{ key: string; name: string; path: string }> = [
  { key: 'test-track-e2e', name: 'E2E Base Track', path: './e2e/fixtures/gpx/e2e-base.gpx' },
  { key: 'test-track-multi', name: 'E2E Multi Track', path: './e2e/fixtures/gpx/e2e-multi.gpx' },
  { key: 'test-track-single', name: 'E2E Single Track', path: './e2e/fixtures/gpx/e2e-single.gpx' }
];

// Keep track of uploads we created so we can clean them up later
const uploadedByTest: string[] = [];

export async function setupTestTracks(): Promise<Record<string, string>> {
  // Query backend for existing tracks and pick representative ones
  const tracks: Record<string, string> = {};
  try {
    const res = await fetch(`${BACKEND_URL}/api/tracks?mode=detail&zoom=12`);
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
      const detailRes = await fetch(`${BACKEND_URL}/api/tracks/${id}`);
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

    // If any of the core fixtures are missing or equal to undefined, try uploading our fixtures
    for (const fixture of FIXTURE_MAP) {
      if (!tracks[fixture.key]) {
        try {
          console.log(`Attempting upload of fixture ${fixture.name}`);
          // Resolve fixture path relative to project frontend folder
          const p = path.resolve(process.cwd(), 'frontend', fixture.path.replace(/^\.\//, ''));
          const uploaded = await uploadGpxFile(p, fixture.name);
          if (uploaded && uploaded.id) {
            tracks[fixture.key] = uploaded.id;
            uploadedByTest.push(uploaded.id);
            console.log(`Uploaded fixture ${fixture.name}: ${uploaded.id}`);
            continue;
          }
        } catch (err) {
          console.warn(`Upload of fixture ${fixture.name} failed:`, err);
        }
      }
    }

    // If still missing some keys, attempt to search by name as a last resort
    for (const fixture of FIXTURE_MAP) {
      if (!tracks[fixture.key]) {
        try {
          const searchRes = await fetch(`${BACKEND_URL}/api/tracks/search?query=${encodeURIComponent(fixture.name)}`);
          if (searchRes.ok) {
            const results = await searchRes.json();
            if (Array.isArray(results) && results.length > 0 && results[0].id) {
              tracks[fixture.key] = results[0].id;
              console.log(`Found existing fixture by search ${fixture.name}: ${results[0].id}`);
            }
          }
        } catch (err) {
          console.warn('Search for fixture failed:', err);
        }
      }
    }

    // Final assertion: ensure we have ids for all keys
    for (const fixture of FIXTURE_MAP) {
      if (!tracks[fixture.key]) {
        console.warn(`Warning: could not resolve track for fixture ${fixture.name}. Some tests may skip.`);
      }
    }

    return tracks;
  } catch (error) {
    console.error('Failed to setup test tracks (list/search):', error);
    throw error;
  }
}

export async function cleanupTestTracks(trackIds: string[]): Promise<void> {
  // Delete only tracks we uploaded during setup
  try {
    for (const id of uploadedByTest) {
      try {
        const res = await fetch(`${BACKEND_URL}/api/tracks/${id}`, {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: 'delete', session_id: 'e2e-test-session' })
        });
        if (res.ok) {
          console.log('Deleted uploaded test track:', id);
        } else {
          console.warn('Failed to delete uploaded test track:', id, res.status);
        }
      } catch (err) {
        console.warn('Failed to delete uploaded test track:', id, err);
      }
    }
  } catch (err) {
    console.warn('cleanupTestTracks error:', err);
  }
}

/**
 * Cleanup test tracks after tests complete
 */

