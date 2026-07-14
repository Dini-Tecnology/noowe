import { useCallback, useEffect, useState } from 'react';
import { CreditCard, PieChart, Users } from 'lucide-react-native';
import { formatCurrency } from '@okinawa/shared/utils/formatters';
import { supabaseApiAdapter } from '@okinawa/shared/services/supabase-api';
import { V2ListScreen, type V2ListItem } from './shared/V2ListScreen';
import { useRestaurantRole } from '../../contexts/RestaurantRoleContext';

export default function TipsScreen() {
  const { restaurantId } = useRestaurantRole();
  const [totalTips, setTotalTips] = useState<number | null>(null);
  const [shiftStaffCount, setShiftStaffCount] = useState<number | null>(null);

  const load = useCallback(async () => {
    if (!restaurantId) return;
    try {
      const [summary, shiftCount] = await Promise.all([
        supabaseApiAdapter.getTipsSummary(restaurantId),
        supabaseApiAdapter.getActiveShiftCount(restaurantId),
      ]);
      setTotalTips(Number(summary?.total_tips ?? 0));
      setShiftStaffCount(Number(shiftCount ?? 0));
    } catch {
      setTotalTips(0);
      setShiftStaffCount(0);
    }
  }, [restaurantId]);

  useEffect(() => { void load(); }, [load]);

  const items: V2ListItem[] = [
    {
      icon: CreditCard,
      label: 'Pool do turno',
      subtitle: totalTips != null ? `${formatCurrency(totalTips)} acumulado` : 'Carregando…',
    },
    { icon: PieChart, label: 'Distribuição por cargo', subtitle: 'Igual · Por role · Por horas' },
    {
      icon: Users,
      label: 'Equipe no turno',
      subtitle: shiftStaffCount != null ? `${shiftStaffCount} colaborador${shiftStaffCount === 1 ? '' : 'es'}` : 'Carregando…',
    },
  ];

  return <V2ListScreen title="Gorjetas" subtitle="Distribuição e histórico" showBack items={items} onRefresh={load} />;
}
