import { useCallback, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { supabaseApiAdapter } from '@okinawa/shared/services/supabase-api';
import { useRestaurantRole } from '../../../contexts/RestaurantRoleContext';

/** O que o plano atual não inclui: some das telas do dia a dia. Só o Dono vê com cadeado, em Módulos e plano. */
export function usePlanLocks(): string[] {
  const { restaurantId } = useRestaurantRole();
  const [locks, setLocks] = useState<string[]>([]);
  useFocusEffect(useCallback(() => {
    if (!restaurantId) return;
    supabaseApiAdapter.getPlanLocks(restaurantId).then(setLocks).catch(() => setLocks([]));
  }, [restaurantId]));
  return locks;
}
