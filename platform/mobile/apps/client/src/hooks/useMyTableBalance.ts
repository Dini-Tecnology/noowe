import { useQuery } from '@tanstack/react-query';
import customerBackend from '../services/customer-backend';

/** Saldo da pessoa na mesa (ADR-021). O servidor decide; sem sessão ativa a consulta nem roda. */
export function useMyTableBalance(tableSessionId: string | null | undefined) {
  return useQuery({
    queryKey: ['my-table-balance', tableSessionId],
    queryFn: () => customerBackend.getMyTableBalance(tableSessionId as string),
    enabled: !!tableSessionId,
    staleTime: 10 * 1000,
    refetchInterval: 20 * 1000,
  });
}
