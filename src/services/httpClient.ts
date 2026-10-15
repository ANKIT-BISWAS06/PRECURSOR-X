/**
 * Reusable HTTP client for the PRECURSOR-X API (same-origin /api/v1).
 * Handles timeouts, network errors, non-2xx responses, and json parsing.
 */

/**
 * The backend origin the deployed frontend's Express server proxies /api/* to (it is configured
 * on the server through the BACKEND_URL environment variable). Kept purely as documented
 * reference; the browser never calls it directly and it is NOT used as a fallback value.
 */
export const KNOWN_PRODUCTION_BACKEND_ORIGIN = 'https://precursor-x-backend.onrender.com';

/**
 * Resolves and normalizes the API base URL to always include the authoritative /api/v1 path prefix.
 *
 * Resolution priority:
 *   1. Explicit `rawUrl` argument (e.g. for tests).
 *   2. `VITE_API_BASE_URL` baked in at Vite build time: an explicit opt-out of same-origin
 *      proxying, for deployments that do not use the Express proxy.
 *   3. Relative '/api/v1', in EVERY environment (production and local dev alike).
 *
 * Why relative in production too:
 * Render's onrender.com is on the public suffix list, so the frontend's and backend's
 * *.onrender.com subdomains are different *sites* to a browser. A session cookie set in
 * response to a direct cross-site fetch is a third-party cookie that browsers routinely
 * refuse to keep (login returns 200, then every request is 401). The architecture is
 * therefore Browser -> same-origin Express server (server/) -> FastAPI: the browser calls the
 * relative path, the Express server forwards it (cookies included) to the backend, and the
 * Set-Cookie response arrives from the frontend's own origin as a first-party cookie.
 * Local development uses the Vite dev server's `proxy` entry for the same effect.
 *
 * Handles:
 * - Full URL with /api/v1: https://backend.example.com/api/v1 -> https://backend.example.com/api/v1
 * - Origin / Host only: https://backend.example.com -> appends /api/v1
 */
export const resolveApiBaseUrl = (rawUrl?: string): string => {
  const explicit = (rawUrl !== undefined ? rawUrl : import.meta.env.VITE_API_BASE_URL || '').trim();

  if (!explicit) {
    // No explicit override: always relative. A same-origin proxy (the Express server in
    // production, the Vite dev server locally) forwards this to the real backend, which is
    // what keeps the HttpOnly session cookie first-party. See the comment above for why this
    // must NOT resolve to an absolute cross-origin URL by default.
    return '/api/v1';
  }

  // Strip trailing slashes
  const clean = explicit.replace(/\/+$/, '');
  // If provided URL already ends with /api/v1, use directly
  if (clean.endsWith('/api/v1')) {
    return clean;
  }
  // If only origin/host or other prefix was provided, append /api/v1
  return `${clean}/api/v1`;
};

export const API_BASE_URL = resolveApiBaseUrl();

// Development-only diagnostic: makes the resolved API base URL visible in the
// browser console during local dev / build debugging. No secrets are logged —
// only the derived, already-public base URL. Stripped from production builds
// since import.meta.env.DEV is statically replaced with `false` and dead-code
// eliminated by Vite/esbuild at build time.
if (import.meta.env.DEV) {
  // eslint-disable-next-line no-console
  console.log('[httpClient] Resolved API_BASE_URL:', API_BASE_URL);
}

export interface ApiErrorDetails {
  status: number;
  message: string;
  isOffline: boolean;
  endpoint: string;
}

export class ApiClientError extends Error {
  public status: number;
  public isOffline: boolean;
  public endpoint: string;

  constructor(details: ApiErrorDetails) {
    super(details.message);
    this.name = 'ApiClientError';
    this.status = details.status;
    this.isOffline = details.isOffline;
    this.endpoint = details.endpoint;
  }
}

interface RequestOptions extends RequestInit {
  timeoutMs?: number;
}

export async function request<T>(
  endpoint: string,
  options: RequestOptions = {}
): Promise<T> {
  // 30s default tolerates a Render free-tier cold start of the backend on the first request.
  const { timeoutMs = 30000, ...fetchOptions } = options;
  const normalizedEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
  const url = `${API_BASE_URL}${normalizedEndpoint}`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, {
      credentials: 'include',
      ...fetchOptions,
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        ...(fetchOptions.headers || {})
      }
    });

    clearTimeout(timeoutId);

    if (!res.ok) {
      let errorMessage = `HTTP Error ${res.status}: ${res.statusText}`;
      try {
        const errorJson = await res.json();
        if (errorJson.detail) {
          errorMessage = typeof errorJson.detail === 'string'
            ? errorJson.detail
            : JSON.stringify(errorJson.detail);
        } else if (errorJson.message) {
          errorMessage = errorJson.message;
        }
      } catch {
        // Response was not JSON
      }

      throw new ApiClientError({
        status: res.status,
        message: errorMessage,
        isOffline: false,
        endpoint: normalizedEndpoint
      });
    }

    // Try parsing JSON
    try {
      return (await res.json()) as T;
    } catch {
      throw new ApiClientError({
        status: res.status,
        message: `Failed to parse JSON response from ${normalizedEndpoint}`,
        isOffline: false,
        endpoint: normalizedEndpoint
      });
    }
  } catch (err: any) {
    clearTimeout(timeoutId);

    if (err instanceof ApiClientError) {
      throw err;
    }

    const isNetworkOrAbort =
      err.name === 'AbortError' ||
      err.message?.includes('Failed to fetch') ||
      err.message?.includes('NetworkError') ||
      err.message?.includes('ECONNREFUSED');

    const message = isNetworkOrAbort
      ? `The server is unavailable at ${API_BASE_URL}. The service may be starting up, offline, or blocked by network settings.`
      : (err.message || 'Unknown network error occurred');

    throw new ApiClientError({
      status: 0,
      message,
      isOffline: true,
      endpoint: normalizedEndpoint
    });
  }
}

export const httpClient = {
  get<T>(endpoint: string, options?: RequestOptions): Promise<T> {
    return request<T>(endpoint, { ...options, method: 'GET' });
  },

  post<T>(endpoint: string, body?: any, options?: RequestOptions): Promise<T> {
    return request<T>(endpoint, {
      ...options,
      method: 'POST',
      body: body !== undefined ? JSON.stringify(body) : undefined
    });
  },

  patch<T>(endpoint: string, body?: any, options?: RequestOptions): Promise<T> {
    return request<T>(endpoint, {
      ...options,
      method: 'PATCH',
      body: body !== undefined ? JSON.stringify(body) : undefined
    });
  },

  delete<T>(endpoint: string, options?: RequestOptions): Promise<T> {
    return request<T>(endpoint, { ...options, method: 'DELETE' });
  }
};
