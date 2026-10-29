import { describe, expect, it } from 'vitest';
import { ApiError, readApiError, toApiError } from './apiError';

const context = {method:'POST',path:'/api/tracks/upload'};
describe('API error presentation', () => {
    it.each([null, [], '<html>private proxy diagnostics</html>', {error:'private SQL details'}])('never exposes an unknown body: %j', async body => {
        const failure = await readApiError(new Response(JSON.stringify(body), {status:400}), context);
        expect(failure.message).toBe('Some information could not be accepted.');
        expect(failure.action).toContain('Check');
        expect(failure.status).toBe(400);
    });
    it.each([
        [401, 'Your sign-in session has expired.'],
        [403, 'You do not have permission to change this track.'],
        [404, 'This track could not be found.'],
        [409, 'This track already exists.'],
        [413, 'This file is too large.'],
        [429, 'Please, wait 10 seconds between uploads.'],
        [502, 'The server could not complete this request.'],
    ])('explains HTTP %i', async (status, message) => {
        const failure = await readApiError(new Response('unsafe response', {status}), context);
        expect(failure.message).toBe(message);
        expect(failure.action).not.toBe('');
    });
    it.each(['invalid gpx file', 'invalid kml file'])('explains %s without an opaque parser error', async error => {
        const failure = await readApiError(new Response(JSON.stringify({error}),{status:400}),context);
        expect(failure.message).toBe('This file does not contain a usable track.');
    });
    it('uses a body reference when the proxy did not forward the header', async () => {
        const failure = await readApiError(new Response('{"error_id":"ref-123"}',{status:500}),context);
        expect(failure.reference).toBe('ref-123');
        expect(toApiError(failure, context)).toBe(failure);
    });
    it('discards malformed diagnostic references', async () => {
        const failure = await readApiError(new Response('{"error_id":"<script>secret</script>"}',{status:500}),context);
        expect(failure.reference).toBeUndefined();
    });
    it('does not expose exceptions from unknown callers', () => {
        const failure = toApiError(new Error('private SQL details'),context);
        expect(failure).toBeInstanceOf(ApiError);
        expect(failure.message).toBe('The request could not be completed.');
    });
    it('does not describe other rate-limited actions as uploads', async () => {
        const failure = await readApiError(new Response('', {status:429}), {method:'PATCH',path:'/api/tracks/123/categories'});
        expect(failure.message).toBe('Too many requests. Please wait before trying again.');
    });
});
