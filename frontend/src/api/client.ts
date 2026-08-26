/**
 * Centralized API client for TraceLine backend.
 *
 * Supports:
 * - Relative URLs for development proxy (default: `/api`)
 * - Absolute remote URLs for production deployments (e.g. `https://api.example.com` or `https://api.example.com/api`)
 * - Configured via `VITE_API_BASE_URL` environment variable.
 */

export function buildApiUrl(endpoint: string): string {
  const cleanEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
  let base = (import.meta.env.VITE_API_BASE_URL as string | undefined) || '/api';

  // Strip trailing slashes
  if (base.endsWith('/')) {
    base = base.slice(0, -1);
  }

  // If base is an absolute URL (e.g. https://api.traceline.com) without /api and endpoint doesn't start with /api, append /api
  if (/^https?:\/\//i.test(base) && !base.endsWith('/api') && !cleanEndpoint.startsWith('/api')) {
    return `${base}/api${cleanEndpoint}`;
  }

  return `${base}${cleanEndpoint}`;
}

export class ApiError extends Error {
  status: number;
  data: any;

  constructor(message: string, status: number, data?: any) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.data = data;
  }
}

export async function fetchApi<T>(endpoint: string, options?: RequestInit): Promise<T> {
  const url = buildApiUrl(endpoint);

  try {
    const response = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        ...options?.headers,
      },
    });

    if (!response.ok) {
      let errorData;
      try {
        errorData = await response.json();
      } catch {
        errorData = await response.text();
      }
      const message = errorData?.detail || `API error: ${response.status} ${response.statusText}`;
      throw new ApiError(message, response.status, errorData);
    }

    return (await response.json()) as T;
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }
    throw new ApiError(
      error instanceof Error ? error.message : 'Network request failed. Is the TraceLine API running and reachable?',
      0
    );
  }
}
