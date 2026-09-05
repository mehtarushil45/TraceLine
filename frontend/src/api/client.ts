/**
 * Centralized API client for TraceLine backend with Stale-While-Revalidate (SWR) caching.
 *
 * Supports:
 * - Relative URLs for development proxy (default: `/api`)
 * - Absolute remote URLs for production deployments
 * - Configured via `VITE_API_BASE_URL` environment variable
 * - In-memory query caching with TTL and Stale-While-Revalidate
 * - In-flight promise deduplication to prevent redundant network requests
 * - Targeted cache invalidation for instant data consistency after mutations
 */

export function buildApiUrl(endpoint: string): string {
  const cleanEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
  let base = (import.meta.env.VITE_API_BASE_URL as string | undefined) || '/api';

  // Strip trailing slashes
  if (base.endsWith('/')) {
    base = base.slice(0, -1);
  }

  // If base is an absolute URL without /api and endpoint doesn't start with /api, append /api
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

interface CacheEntry<T> {
  data: T;
  timestamp: number;
  ttlMs: number;
}

const apiCache = new Map<string, CacheEntry<any>>();
const inFlightRequests = new Map<string, Promise<any>>();

const cacheListeners = new Map<string, Set<() => void>>();

export function getCachedApiData<T>(endpoint: string): T | null {
  const cacheKey = `GET:${endpoint}`;
  const entry = apiCache.get(cacheKey);
  return entry ? (entry.data as T) : null;
}

export function setCachedApiData<T>(endpoint: string, data: T, ttlMs = 120_000): void {
  const cacheKey = `GET:${endpoint}`;
  apiCache.set(cacheKey, { data, timestamp: Date.now(), ttlMs });
  notifyListeners(cacheKey);
}

export function subscribeToApiCache(endpoint: string, listener: () => void): () => void {
  const cacheKey = `GET:${endpoint}`;
  if (!cacheListeners.has(cacheKey)) {
    cacheListeners.set(cacheKey, new Set());
  }
  cacheListeners.get(cacheKey)!.add(listener);
  return () => {
    cacheListeners.get(cacheKey)?.delete(listener);
  };
}

function notifyListeners(cacheKey: string) {
  const listeners = cacheListeners.get(cacheKey);
  if (listeners) {
    listeners.forEach((fn) => {
      try {
        fn();
      } catch { /* ignore */ }
    });
  }
}

export interface CacheOptions {
  /** Time to live in milliseconds (default: 60,000ms = 1 min). */
  ttlMs?: number;
  /** If true, ignores cache and forces a fresh network fetch. */
  forceRefresh?: boolean;
  /** If false, disables caching for this request. */
  cache?: boolean;
}

/**
 * Invalidate cached endpoints matching an optional string prefix or RegExp.
 * If no pattern is provided, clears the entire cache.
 */
export function invalidateApiCache(pattern?: string | RegExp): void {
  if (!pattern) {
    apiCache.clear();
    cacheListeners.forEach((set) => set.forEach((fn) => fn()));
    return;
  }
  for (const key of apiCache.keys()) {
    if (typeof pattern === 'string' ? key.includes(pattern) : pattern.test(key)) {
      apiCache.delete(key);
      notifyListeners(key);
    }
  }
}

/**
 * Perform an HTTP request with caching, deduplication, and error normalization.
 */
export async function fetchApi<T>(
  endpoint: string,
  options?: RequestInit,
  cacheOptions?: CacheOptions
): Promise<T> {
  const method = (options?.method || 'GET').toUpperCase();
  const isGet = method === 'GET';
  const shouldCache = isGet && (cacheOptions?.cache !== false);
  const ttlMs = cacheOptions?.ttlMs ?? 120_000; // 2 minutes default TTL
  const cacheKey = `${method}:${endpoint}`;

  // If cache is valid and not force-refreshing, return cached data immediately
  if (shouldCache && !cacheOptions?.forceRefresh) {
    const cached = apiCache.get(cacheKey);
    if (cached) {
      const isFresh = Date.now() - cached.timestamp < cached.ttlMs;
      if (isFresh) {
        return cached.data as T;
      }
      // Stale-While-Revalidate: trigger background revalidation without blocking
      revalidateInBackground<T>(endpoint, options, cacheKey, ttlMs);
      return cached.data as T;
    }
  }

  // Deduplicate concurrent in-flight requests for the same endpoint
  if (shouldCache && inFlightRequests.has(cacheKey)) {
    return inFlightRequests.get(cacheKey) as Promise<T>;
  }

  const requestPromise = executeRequest<T>(endpoint, options)
    .then((data) => {
      if (shouldCache) {
        apiCache.set(cacheKey, { data, timestamp: Date.now(), ttlMs });
        notifyListeners(cacheKey);
      }
      return data;
    })
    .finally(() => {
      if (shouldCache) {
        inFlightRequests.delete(cacheKey);
      }
    });

  if (shouldCache) {
    inFlightRequests.set(cacheKey, requestPromise);
  }

  return requestPromise;
}

async function revalidateInBackground<T>(
  endpoint: string,
  options: RequestInit | undefined,
  cacheKey: string,
  ttlMs: number
): Promise<void> {
  if (inFlightRequests.has(cacheKey)) return;
  try {
    const p = executeRequest<T>(endpoint, options).then((data) => {
      apiCache.set(cacheKey, { data, timestamp: Date.now(), ttlMs });
      notifyListeners(cacheKey);
      return data;
    }).finally(() => {
      inFlightRequests.delete(cacheKey);
    });
    inFlightRequests.set(cacheKey, p);
  } catch {
    // Background revalidation failures are non-blocking
  }
}

async function executeRequest<T>(endpoint: string, options?: RequestInit): Promise<T> {
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
