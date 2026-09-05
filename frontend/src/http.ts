/**
 * Single HTTP request module with auth header injection and logging.
 */

export type HttpRequest = (path: string, opts?: RequestInit) => Promise<Response>;

export interface TokenSource {
    getToken: () => Promise<string | null>;
}

export interface LogEntry {
    method: string;
    path: string;
    status: number;
}

export interface LogSink {
    log: (entry: LogEntry) => void;
}

export interface CreateHttpDeps {
    tokenSource: TokenSource;
    logSink?: LogSink;
    baseUrl?: string;
}

/**
 * Create a request function with auth and logging.
 */
export function createHttp({ tokenSource, logSink, baseUrl = '' }: CreateHttpDeps): HttpRequest {
    const sink: LogSink = logSink || { log: () => {} };

    return async function request(path: string, opts: RequestInit = {}): Promise<Response> {
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
