import { useEffect } from 'react';

type RemoteRefresh = () => void | Promise<void>;

const mountedRefreshers = new Set<RemoteRefresh>();

export function useRegisterRemoteRefresh(refresh: RemoteRefresh) {
  useEffect(() => {
    mountedRefreshers.add(refresh);
    return () => { mountedRefreshers.delete(refresh); };
  }, [refresh]);
}

export async function refreshMountedRemoteData() {
  const refreshers = Array.from(mountedRefreshers);
  await Promise.allSettled(refreshers.map((refresh) => Promise.resolve().then(refresh)));
}
