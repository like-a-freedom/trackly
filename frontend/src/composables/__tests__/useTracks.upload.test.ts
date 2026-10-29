// @ts-nocheck - Test mocks don't need full type fidelity
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
    it('returns the accessible existing track when the backend detects a duplicate', async () => {
        global.fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: 'This file has already been imported.', existing_track_id: 'existing' }), {status:409}));
        const { uploadTrack } = useTracks();
        expect(await uploadTrack({file: new File(['same'], 'same.gpx')})).toEqual({alreadyExists:true,id:'existing',url:'/track/existing'});
    });
    beforeEach(() => {
        vi.restoreAllMocks();
        global.fetch = vi.fn(() =>
            Promise.resolve({
                ok: true,
                json: () => Promise.resolve({ id: 'track-id', url: '/api/tracks/track-id' })
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
        expect(url).toBe('/api/tracks/upload');
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

    it.each(['{"code":500,"error":"Internal server error","error_id":"support-123"}', '<html>proxy crash with private details</html>', 'private database detail'])('hides raw server responses and exposes safe diagnostics: %s', async (body) => {
        const errorResponse = {
            ok: false,
            status: 500,
            text: () => Promise.resolve(body),
            headers: new Headers({ 'x-error-id': 'support-123' })
        };
        global.fetch = vi.fn(() => Promise.resolve(errorResponse));
        const { uploadTrack } = useTracks();
        const file = new File(['<gpx></gpx>'], 'broken.gpx');

        await expect(uploadTrack({ file })).rejects.toMatchObject({
            message: 'The server could not complete this request.',
            action: 'Try again. If the problem continues, share the technical details with support.',
            status: 500, method: 'POST', path: '/api/tracks/upload', reference: 'support-123',
        });
    });

    it('gives useful guidance for an invalid track file', async () => {
        global.fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({code:400,error:'invalid gpx file'}),{status:400}));
        await expect(useTracks().uploadTrack({file: new File(['bad'], 'bad.gpx')})).rejects.toMatchObject({
            message: 'This file does not contain a usable track.',
            action: 'Choose a GPX or KML file with at least two different points in a continuous route.',
            status: 400,
        });
    });

    it('normalizes network failures without exposing browser exceptions', async () => {
        global.fetch = vi.fn().mockRejectedValue(new TypeError('Load failed'));
        await expect(useTracks().uploadTrack({file: new File(['gpx'], 'route.gpx')})).rejects.toMatchObject({
            message: 'Could not reach the server.', action: 'Check your connection and try again.', status: null,
        });
    });

    it('leaves upload failures with the form instead of publishing a second global error', async () => {
        global.fetch = vi.fn().mockResolvedValue(new Response('{"error":"Internal server error"}', {status:500}));
        const {uploadTrack,error} = useTracks();
        await expect(uploadTrack({file:new File(['gpx'],'route.gpx')})).rejects.toThrow();
        expect(error.value).toBeNull();
    });
});
