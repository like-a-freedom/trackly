import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useTracks } from '../useTracks';
import * as sessionUtils from '../../utils/session';

const MOCK_SESSION_ID = '11111111-1111-4111-8111-111111111111';

if (typeof File === 'undefined') {
    // Minimal File polyfill for Node-based tests
    global.File = class TestFile extends Blob {
        constructor(bits, name, options = {}) {
            super(bits, options);
            this.name = name;
            this.lastModified = options.lastModified || Date.now();
        }
    };
}

describe('useTracks.uploadTrack', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
        global.fetch = vi.fn(() =>
            Promise.resolve({
                ok: true,
                json: () => Promise.resolve({ id: 'track-id', url: '/tracks/track-id' })
            })
        );
        vi.spyOn(sessionUtils, 'getSessionId').mockReturnValue(MOCK_SESSION_ID);
    });

    it('attaches session_id and payload fields to the upload form', async () => {
        const { uploadTrack } = useTracks();
        const file = new File(['<gpx></gpx>'], 'test-track.gpx', { type: 'application/gpx+xml' });

        await uploadTrack({
            file,
            name: 'Morning Run',
            categories: ['running', 'cycling']
        });

        expect(sessionUtils.getSessionId).toHaveBeenCalledTimes(1);
        expect(global.fetch).toHaveBeenCalledTimes(1);

        const [url, options] = global.fetch.mock.calls[0];
        expect(url).toBe('/tracks/upload');
        expect(options.method).toBe('POST');
        expect(options.body).toBeInstanceOf(FormData);

        const bodyEntries = Array.from(options.body.entries()).reduce((acc, [key, value]) => {
            acc[key] = value;
            return acc;
        }, {});

        expect(bodyEntries.session_id).toBe(MOCK_SESSION_ID);
        expect(bodyEntries.name).toBe('Morning Run');
        expect(bodyEntries.categories).toBe('running,cycling');
        expect(bodyEntries.file).toBeInstanceOf(File);
        expect(bodyEntries.file.name).toBe('test-track.gpx');
    });

    it('sends only required fields when optional data missing', async () => {
        const { uploadTrack } = useTracks();
        const file = new File(['<gpx></gpx>'], 'solo.gpx');

        await uploadTrack({ file });

        const [, options] = global.fetch.mock.calls[0];
        const entries = Array.from(options.body.entries());
        const keys = entries.map(([key]) => key);

        expect(keys).toContain('file');
        expect(keys).toContain('session_id');
        expect(keys).not.toContain('name');
        expect(keys).not.toContain('categories');
    });

    it('propagates backend errors with readable messages', async () => {
        const errorResponse = {
            ok: false,
            status: 429,
            text: () => Promise.resolve('rate limited')
        };
        global.fetch = vi.fn(() => Promise.resolve(errorResponse));
        const { uploadTrack } = useTracks();
        const file = new File(['<gpx></gpx>'], 'test-track.gpx');

        await expect(
            uploadTrack({ file, categories: [] })
        ).rejects.toThrow('Please, wait 10 seconds between uploads.');
    });

    it('uses backend-provided error text for non-429 failures', async () => {
        const errorResponse = {
            ok: false,
            status: 500,
            text: () => Promise.resolve('boom')
        };
        global.fetch = vi.fn(() => Promise.resolve(errorResponse));
        const { uploadTrack } = useTracks();
        const file = new File(['<gpx></gpx>'], 'broken.gpx');

        await expect(uploadTrack({ file })).rejects.toThrow('boom');
    });
});
