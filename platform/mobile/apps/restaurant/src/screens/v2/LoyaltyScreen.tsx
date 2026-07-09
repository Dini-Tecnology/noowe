import { useEffect, useState } from 'react';
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

  useEffect(() => {
    let cancelled = false;
    if (!restaurantId) return;
    Promise.all([
      supabaseApiAdapter.getLoyaltyStats(restaurantId),
      supabaseApiAdapter.getLoyaltyConfig(restaurantId),
    ])
      .then(([statsResult, configResult]) => {
        if (!cancelled) {
          setStats(statsResult ?? {});
          setConfig(configResult ?? {});
        }
      })
      .catch(() => { if (!cancelled) { setStats({}); setConfig({}); } })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [restaurantId]);

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

  return <V2ListScreen title="Fidelidade" subtitle="Programa de recompensas" showBack items={items} />;
}
