import { useCallback, useEffect, useState } from 'react';
import { Gift, Users, Award } from 'lucide-react-native';
import { supabaseApiAdapter } from '@okinawa/shared/services/supabase-api';
import { V2ListScreen, type V2ListItem } from './shared/V2ListScreen';
import { useRestaurantRole } from '../../contexts/RestaurantRoleContext';

interface LoyaltyStats {
  active_members?: number;
  redemptions_this_month?: number;
}

interface LoyaltyConfig {
  points_per_real?: number;
}

export default function LoyaltyScreen() {
  const { restaurantId } = useRestaurantRole();
  const [stats, setStats] = useState<LoyaltyStats | null>(null);
  const [config, setConfig] = useState<LoyaltyConfig | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!restaurantId) return;
    setLoading(true);
    try {
      const [statsResult, configResult] = await Promise.all([
      supabaseApiAdapter.getLoyaltyStats(restaurantId),
      supabaseApiAdapter.getLoyaltyConfig(restaurantId),
      ]);
      setStats(statsResult ?? {});
      setConfig(configResult ?? {});
    } catch {
      setStats({});
      setConfig({});
    } finally {
      setLoading(false);
    }
  }, [restaurantId]);

  useEffect(() => { void load(); }, [load]);

  const items: V2ListItem[] = loading
    ? [{ icon: Gift, label: 'Carregando programa de fidelidade…' }]
    : [
        {
          icon: Gift,
          label: 'Regras do programa',
          subtitle: config?.points_per_real ? `${config.points_per_real} ponto(s) a cada R$ 1` : 'Não configurado',
        },
        { icon: Users, label: 'Membros ativos', subtitle: `${stats?.active_members ?? 0} clientes` },
        { icon: Award, label: 'Resgates do mês', subtitle: `${stats?.redemptions_this_month ?? 0} recompensas` },
      ];

  return <V2ListScreen title="Fidelidade" subtitle="Programa de recompensas" showBack items={items} onRefresh={load} />;
}
