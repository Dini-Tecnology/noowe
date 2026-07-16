import { useCallback, useState } from 'react';

type RefreshCallback = () => void | Promise<unknown>;

/** Keeps the native refresh indicator visible until the real reload finishes. */
export function usePullToRefresh(refresh: RefreshCallback) {
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = useCallback(async () => {
    if (refreshing) return;
    setRefreshing(true);
    try {
      await refresh();
    } finally {
      setRefreshing(false);
    }
  }, [refresh, refreshing]);

  return { refreshing, onRefresh };
}
