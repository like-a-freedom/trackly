/**
 * Single HTTP request module with auth header injection and logging.
 *
 * @typedef {(path: string, opts?: RequestInit) => Promise<Response>} HttpRequest
 * @typedef {{ getToken: () => Promise<string | null> }} TokenSource
 * @typedef {{ log: (entry: { method: string, path: string, status: number }) => void }} LogSink
 */

/**
 * Create a request function with auth and logging.
 *
 * @param {{ tokenSource: TokenSource, logSink?: LogSink, baseUrl?: string }} deps
 * @returns {HttpRequest}
 */
export function createHttp({ tokenSource, logSink, baseUrl = '' }) {
    const sink = logSink || { log: () => {} };

    return async function request(path, opts = {}) {
        const token = await tokenSource.getToken();

        const res = await fetch(baseUrl + path, {
            ...opts,
            headers: {
                ...(opts.headers ?? {}),
                ...(token ? { Authorization: `Bearer ${token}` } : {}),
            },
        });

        sink.log({ method: opts.method ?? 'GET', path, status: res.status });
        return res;
    };
}
