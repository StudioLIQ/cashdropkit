/**
 * API Client for Railway backend
 *
 * Standardized HTTP client for all API calls.
 * Initialized by app bootstrap; falls back to Dexie repositories when absent.
 */

export interface ApiClientConfig {
  baseUrl: string;
  getToken?: () => string | null;
}

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

let _config: ApiClientConfig | null = null;

/**
 * Initialize the API client with a base URL and optional token provider.
 */
export function initApiClient(config: ApiClientConfig): void {
  _config = config;
}

/**
 * Returns true if the API client has been initialized (i.e., API_URL is set).
 */
export function isApiAvailable(): boolean {
  return _config !== null && _config.baseUrl.length > 0;
}

/**
 * Get the current base URL (for debugging/logging).
 */
export function getApiBaseUrl(): string {
  return _config?.baseUrl ?? '';
}

async function request<T>(
  method: string,
  path: string,
  body?: unknown,
): Promise<T> {
  if (!_config) {
    throw new ApiError(0, 'API_NOT_CONFIGURED', 'API client not initialized');
  }

  const url = `${_config.baseUrl}${path}`;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  const token = _config.getToken?.();
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const res = await fetch(url, {
    method,
    headers,
    body: body != null ? JSON.stringify(body) : undefined,
  });

  // Handle no-content responses
  if (res.status === 204) {
    return undefined as T;
  }

  const json = await res.json();

  if (!res.ok) {
    const err = json?.error ?? {};
    throw new ApiError(
      res.status,
      err.code ?? 'UNKNOWN',
      err.message ?? `HTTP ${res.status}`,
      err.details,
    );
  }

  return json as T;
}

// Convenience methods
export const apiClient = {
  get: <T>(path: string) => request<T>('GET', path),
  post: <T>(path: string, body?: unknown) => request<T>('POST', path, body),
  patch: <T>(path: string, body?: unknown) => request<T>('PATCH', path, body),
  put: <T>(path: string, body?: unknown) => request<T>('PUT', path, body),
  delete: <T>(path: string) => request<T>('DELETE', path),
};
