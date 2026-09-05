import { useState, useEffect, useCallback, useRef } from 'react';
import { getCachedApiData, subscribeToApiCache } from '../api/client';

export interface UseApiQueryOptions<T> {
  enabled?: boolean;
  onSuccess?: (data: T) => void;
  onError?: (err: Error) => void;
}

export interface UseApiQueryResult<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  refetch: () => Promise<T | null>;
}

/**
 * Enterprise-grade client data query hook with instant SWR re-hydration.
 *
 * If cached data already exists in memory, returns immediately on the very first
 * render with `loading = false` and `data = cachedData`, eliminating blank screen
 * flickers, layout shifts, and loading skeleton churn during navigation.
 */
export function useApiQuery<T>(
  endpoint: string | null,
  fetcher: () => Promise<T>,
  options: UseApiQueryOptions<T> = {}
): UseApiQueryResult<T> {
  const { enabled = true, onSuccess, onError } = options;

  // Synchronous cache lookup for instantaneous 0ms initial render
  const [data, setData] = useState<T | null>(() => {
    if (!endpoint) return null;
    return getCachedApiData<T>(endpoint);
  });

  const [loading, setLoading] = useState<boolean>(() => {
    if (!endpoint || !enabled) return false;
    return getCachedApiData<T>(endpoint) === null;
  });

  const [error, setError] = useState<string | null>(null);

  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  const onSuccessRef = useRef(onSuccess);
  onSuccessRef.current = onSuccess;

  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;

  const executeFetch = useCallback(
    async (isSilent = false): Promise<T | null> => {
      if (!endpoint || !enabled) return null;
      if (!isSilent && getCachedApiData<T>(endpoint) === null) {
        setLoading(true);
      }
      setError(null);
      try {
        const res = await fetcherRef.current();
        setData(res);
        setLoading(false);
        onSuccessRef.current?.(res);
        return res;
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Failed to load data';
        setError(msg);
        setLoading(false);
        onErrorRef.current?.(err instanceof Error ? err : new Error(msg));
        return null;
      }
    },
    [endpoint, enabled]
  );

  useEffect(() => {
    if (!endpoint || !enabled) return;

    const cached = getCachedApiData<T>(endpoint);
    if (cached !== null) {
      setData(cached);
      setLoading(false);
      // Quiet background revalidation without clearing UI
      executeFetch(true);
    } else {
      executeFetch(false);
    }

    // Subscribe to any cache writes for this endpoint
    return subscribeToApiCache(endpoint, () => {
      const latest = getCachedApiData<T>(endpoint);
      if (latest !== null) {
        setData(latest);
        setLoading(false);
      }
    });
  }, [endpoint, enabled, executeFetch]);

  return {
    data,
    loading,
    error,
    refetch: () => executeFetch(false),
  };
}
