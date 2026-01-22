import { useState, useEffect, useCallback } from 'react';

/**
 * Hook for fetching and managing system health data.
 *
 * @param {number} refreshInterval - Refresh interval in milliseconds (default 60s)
 * @returns {{
 *   health: Object|null,
 *   loading: boolean,
 *   error: string|null,
 *   refresh: Function
 * }}
 */
export function useSystemHealth(refreshInterval = 60000) {
  const [health, setHealth] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const refresh = useCallback(async () => {
    try {
      const response = await fetch('/api/system/health');
      const data = await response.json();
      if (data.success) {
        setHealth(data.data);
        setError(null);
      } else {
        setError(data.error);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, refreshInterval);
    return () => clearInterval(interval);
  }, [refresh, refreshInterval]);

  return { health, loading, error, refresh };
}
