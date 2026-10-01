import { useCallback, useEffect, useState } from 'react';
import { supabaseApiAdapter, type CapacityRequest } from '@okinawa/shared/services/supabase-api';
import { useRestaurantRole } from '../../../contexts/RestaurantRoleContext';
import { useRealtimeSubscription } from './useRealtimeSubscription';
import { userErrorMessage } from '@okinawa/shared/utils/user-error-message';

/**
 * Pending over-capacity entries of this restaurant (ADR-007), kept live by
 * Realtime. RLS already limits the rows to this restaurant's staff.
 */
export function useCapacityRequests() {
  const { restaurantId } = useRestaurantRole();
  const [data, setData] = useState<CapacityRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!restaurantId) return;
    try {
      const rows = await supabaseApiAdapter.getCapacityRequests(restaurantId, 'pending');
      setData(rows);
      setError(null);
    } catch (err) {
      setError(userErrorMessage(err, 'Erro ao carregar solicitações de lotação'));
    } finally {
      setLoading(false);
    }
  }, [restaurantId]);

  // Initial load; state is only set once the request resolves.
  useEffect(() => {
    if (!restaurantId) return undefined;
    let cancelled = false;
    supabaseApiAdapter.getCapacityRequests(restaurantId, 'pending')
      .then((rows) => { if (!cancelled) { setData(rows); setError(null); } })
      .catch((err: unknown) => {
        if (!cancelled) setError(userErrorMessage(err, 'Erro ao carregar solicitações de lotação'));
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [restaurantId]);
  useRealtimeSubscription({
    channelName: `capacity-requests:${restaurantId ?? 'none'}`,
    table: 'capacity_requests',
    filter: restaurantId ? { column: 'restaurant_id', value: restaurantId } : undefined,
    onRefresh: refresh,
    enabled: !!restaurantId,
  });

  return { data, loading, error, refresh };
}
