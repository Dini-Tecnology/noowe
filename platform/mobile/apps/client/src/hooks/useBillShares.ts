import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { billShares } from '../services/bill-shares';

/** Parcelas e marcações de itens da mesa, mantidas ao vivo pelo Realtime (respeita RLS). */
export function useBillShares(tableSessionId: string | undefined, pollMs: number | false = false) {
  const queryClient = useQueryClient();
  const shares = useQuery({
    queryKey: ['bill-shares', tableSessionId],
    queryFn: () => billShares.list(tableSessionId!),
    enabled: !!tableSessionId,
    refetchInterval: pollMs,
  });
  const claims = useQuery({
    queryKey: ['bill-claims', tableSessionId],
    queryFn: () => billShares.listClaims(tableSessionId!),
    enabled: !!tableSessionId,
  });
  useEffect(() => {
    if (!tableSessionId) return undefined;
    const channel = billShares.subscribe(tableSessionId, () => {
      void queryClient.invalidateQueries({ queryKey: ['bill-shares', tableSessionId] });
      void queryClient.invalidateQueries({ queryKey: ['bill-claims', tableSessionId] });
      void queryClient.invalidateQueries({ queryKey: ['bill-split-preview', tableSessionId] });
    });
    return () => { void channel.unsubscribe(); };
  }, [tableSessionId, queryClient]);
  return { shares, claims };
}
