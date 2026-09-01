import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createHttp } from '../http.js';

describe('http module', () => {
    let fetchMock;

    beforeEach(() => {
        fetchMock = vi.fn();
        global.fetch = fetchMock;
    });

    it('injects Authorization header when token is available', async () => {
        const http = createHttp({
            tokenSource: { getToken: () => Promise.resolve('my-token') },
            logSink: { log: vi.fn() },
        });

        fetchMock.mockResolvedValue({ ok: true, status: 200 });

        await http('/api/tracks', { method: 'GET' });

        expect(fetchMock).toHaveBeenCalledWith('/api/tracks', {
            method: 'GET',
            headers: { Authorization: 'Bearer my-token' },
        });
    });

    it('omits Authorization header when token is null', async () => {
        const http = createHttp({
            tokenSource: { getToken: () => Promise.resolve(null) },
            logSink: { log: vi.fn() },
        });

        fetchMock.mockResolvedValue({ ok: true, status: 200 });

        await http('/api/tracks');

        expect(fetchMock).toHaveBeenCalledWith('/api/tracks', {
            headers: {},
        });
    });

    it('calls logSink with method, path, and status', async () => {
        const logSpy = vi.fn();
        const http = createHttp({
            tokenSource: { getToken: () => Promise.resolve(null) },
            logSink: { log: logSpy },
        });

        fetchMock.mockResolvedValue({ ok: true, status: 201 });

        await http('/api/tracks/upload', { method: 'POST' });

        expect(logSpy).toHaveBeenCalledWith({
            method: 'POST',
            path: '/api/tracks/upload',
            status: 201,
        });
    });

    it('preserves existing headers and merges with auth', async () => {
        const http = createHttp({
            tokenSource: { getToken: () => Promise.resolve('tok') },
            logSink: { log: vi.fn() },
        });

        fetchMock.mockResolvedValue({ ok: true, status: 200 });

        await http('/api/tracks', {
            headers: { 'Content-Type': 'application/json' },
        });

        expect(fetchMock).toHaveBeenCalledWith('/api/tracks', {
            headers: {
                'Content-Type': 'application/json',
                Authorization: 'Bearer tok',
            },
        });
    });
});
