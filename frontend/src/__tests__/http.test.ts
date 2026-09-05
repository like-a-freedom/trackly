import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createHttp } from '../http';

// Mock auth store before importing http-instance
vi.mock('../stores/auth', () => ({
    useAuthStore: vi.fn(() => ({
        accessToken: 'test-token',
        ensureValidToken: vi.fn().mockResolvedValue(undefined),
    })),
}));

describe('http module', () => {
    let fetchMock: ReturnType<typeof vi.fn>;

    beforeEach(() => {
        fetchMock = vi.fn();
        global.fetch = fetchMock as unknown as typeof fetch;
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

    it('uses default GET method in log', async () => {
        const logSpy = vi.fn();
        const http = createHttp({
            tokenSource: { getToken: () => Promise.resolve(null) },
            logSink: { log: logSpy },
        });

        fetchMock.mockResolvedValue({ ok: true, status: 200 });

        await http('/api/test');

        expect(logSpy).toHaveBeenCalledWith({
            method: 'GET',
            path: '/api/test',
            status: 200,
        });
    });

    it('works without logSink', async () => {
        const http = createHttp({
            tokenSource: { getToken: () => Promise.resolve(null) },
        });

        fetchMock.mockResolvedValue({ ok: true, status: 200 });

        await http('/api/test');

        expect(fetchMock).toHaveBeenCalled();
    });

    it('uses base URL', async () => {
        const http = createHttp({
            tokenSource: { getToken: () => Promise.resolve(null) },
            logSink: { log: vi.fn() },
            baseUrl: 'http://api.example.com',
        });

        fetchMock.mockResolvedValue({ ok: true, status: 200 });

        await http('/test');

        expect(fetchMock).toHaveBeenCalledWith('http://api.example.com/test', expect.any(Object));
    });

    it('handles PUT method', async () => {
        const logSpy = vi.fn();
        const http = createHttp({
            tokenSource: { getToken: () => Promise.resolve('token') },
            logSink: { log: logSpy },
        });

        fetchMock.mockResolvedValue({ ok: true, status: 200 });

        await http('/api/test', { method: 'PUT', body: JSON.stringify({ data: 'test' }) });

        expect(fetchMock).toHaveBeenCalledWith('/api/test', {
            method: 'PUT',
            body: JSON.stringify({ data: 'test' }),
            headers: { Authorization: 'Bearer token' },
        });
    });
});

describe('http-instance', () => {
    let fetchMock: ReturnType<typeof vi.fn>;

    beforeEach(() => {
        fetchMock = vi.fn();
        global.fetch = fetchMock as unknown as typeof fetch;
        vi.clearAllMocks();
    });

    it('exports http instance', async () => {
        const { http } = await import('../http-instance');
        expect(http).toBeDefined();
        expect(typeof http).toBe('function');
    });

    it('calls ensureValidToken when getting token', async () => {
        const { useAuthStore } = await import('../stores/auth');
        const mockStore = {
            accessToken: 'instance-token',
            ensureValidToken: vi.fn().mockResolvedValue(undefined),
        };
        vi.mocked(useAuthStore).mockReturnValue(mockStore as unknown as ReturnType<typeof useAuthStore>);

        const { http } = await import('../http-instance');

        fetchMock.mockResolvedValue({ ok: true, status: 200 });

        await http('/api/test', { method: 'GET' });

        expect(mockStore.ensureValidToken).toHaveBeenCalled();
        expect(fetchMock).toHaveBeenCalledWith('/api/test', {
            method: 'GET',
            headers: { Authorization: 'Bearer instance-token' },
        });
    });

    it('returns null token when accessToken is null', async () => {
        const { useAuthStore } = await import('../stores/auth');
        const mockStore = {
            accessToken: null,
            ensureValidToken: vi.fn().mockResolvedValue(undefined),
        };
        vi.mocked(useAuthStore).mockReturnValue(mockStore as unknown as ReturnType<typeof useAuthStore>);

        const { http } = await import('../http-instance');

        fetchMock.mockResolvedValue({ ok: true, status: 200 });

        await http('/api/test', { method: 'GET' });

        expect(fetchMock).toHaveBeenCalledWith('/api/test', {
            method: 'GET',
            headers: {},
        });
    });
});
