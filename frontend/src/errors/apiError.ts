export interface RequestContext {
    method: string;
    path: string;
}

/** Safe user-facing failure. Raw response bodies and exception messages stay out of UI. */
export class ApiError extends Error {
    constructor(
        message: string,
        readonly action: string,
        readonly status: number | null,
        readonly method: string,
        readonly path: string,
        readonly reference?: string,
    ) {
        super(message);
        this.name = 'ApiError';
    }
}

const safeReference = (value: unknown): string | undefined =>
    typeof value === 'string' && /^[a-zA-Z0-9_-]{1,128}$/.test(value) ? value : undefined;

/** Decode the API envelope, using only known validation messages and safe diagnostics. */
export async function readApiError(response: Response, context: RequestContext): Promise<ApiError> {
    let body: Record<string, unknown> = {};
    try {
        const parsed: unknown = JSON.parse(await response.text());
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) body = parsed as Record<string, unknown>;
    } catch { /* Proxies can return HTML, plain text, or an empty body. */ }
    const reference = safeReference(response.headers?.get('x-error-id')) ?? safeReference(body.error_id);
    let message = 'The server could not complete this request.';
    let action = 'Try again. If the problem continues, share the technical details with support.';
    switch (response.status) {
        case 400:
        case 422:
            message = 'Some information could not be accepted.';
            action = 'Check the file and required fields, then try again.';
            if (body.error === 'invalid gpx file' || body.error === 'invalid kml file') {
                message = 'This file does not contain a usable track.';
                action = 'Choose a GPX or KML file with at least two different points in a continuous route.';
            } else if (body.error === 'at least one category is required' || body.error === 'Select at least one category') {
                message = 'Select at least one category.';
                action = 'Choose a category, then upload your track again.';
            }
            break;
        case 401:
            message = 'Your sign-in session has expired.';
            action = 'Sign in again, then retry this action.';
            break;
        case 403:
            message = 'You do not have permission to change this track.';
            action = 'Use the account or browser that owns the track.';
            break;
        case 404:
            message = 'This track could not be found.';
            action = 'Check the link or return to the map.';
            break;
        case 409:
            message = 'This track already exists.';
            action = 'Open the existing track from the map.';
            break;
        case 413:
            message = 'This file is too large.';
            action = 'Choose a smaller GPX or KML file and try again.';
            break;
        case 429:
            message = context.path === '/api/tracks/upload'
                ? 'Please, wait 10 seconds between uploads.'
                : 'Too many requests. Please wait before trying again.';
            action = 'Wait a moment and try again.';
            break;
    }
    return new ApiError(message, action, response.status, context.method, context.path, reference);
}

export function toApiError(error: unknown, context: RequestContext): ApiError {
    if (error instanceof ApiError) return error;
    if (!(error instanceof TypeError)) {
        return new ApiError(
            'The request could not be completed.',
            'Try again. If the problem continues, contact support.',
            null, context.method, context.path,
        );
    }
    return new ApiError(
        'Could not reach the server.', 'Check your connection and try again.',
        null, context.method, context.path,
    );
}
