import { useEffect, useState } from 'react';
import { Utensils, Truck, Music, Settings } from 'lucide-react-native';
import { supabaseApiAdapter } from '@okinawa/shared/services/supabase-api';
import { V2ListScreen, type V2ListItem } from './shared/V2ListScreen';
import { useRestaurantRole } from '../../contexts/RestaurantRoleContext';

interface ServiceConfigRow {
  service_type: string;
  is_active: boolean;
  reservation_required?: boolean;
  table_service?: boolean;
  drive_thru_lanes?: number;
  waitlist_enabled?: boolean;
}

const SERVICE_TYPE_LABEL: Record<string, { label: string; icon: any; subtitle: (c: ServiceConfigRow) => string }> = {
  fine_dining: { label: 'Fine Dining', icon: Utensils, subtitle: (c) => c.reservation_required ? 'Reservas + harmonização' : 'Sem reserva obrigatória' },
  casual_dining: { label: 'Casual Dining', icon: Utensils, subtitle: (c) => c.table_service ? 'QR na mesa' : 'Sem atendimento à mesa' },
  food_truck: { label: 'Food Truck', icon: Truck, subtitle: () => 'Modo móvel' },
  club: { label: 'Club / Noturno', icon: Music, subtitle: (c) => c.waitlist_enabled ? 'Fila e VIP' : 'Sem fila configurada' },
};

export default function ServiceConfigScreen() {
  const { restaurantId } = useRestaurantRole();
  const [configs, setConfigs] = useState<ServiceConfigRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    if (!restaurantId) return;
    supabaseApiAdapter.getServiceConfigs(restaurantId)
      .then((rows) => { if (!cancelled) setConfigs(Array.isArray(rows) ? rows : []); })
      .catch(() => { if (!cancelled) setConfigs([]); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [restaurantId]);

  const activeConfigs = configs.filter((c) => c.is_active);

  const items: V2ListItem[] = loading
    ? [{ icon: Settings, label: 'Carregando modalidades…' }]
    : activeConfigs.length === 0
      ? [{ icon: Settings, label: 'Nenhuma modalidade configurada' }]
      : activeConfigs.map((config) => {
          const meta = SERVICE_TYPE_LABEL[config.service_type] ?? { label: config.service_type, icon: Settings, subtitle: () => 'Ativo' };
          return { icon: meta.icon, label: meta.label, subtitle: meta.subtitle(config) };
        });

  return <V2ListScreen title="Tipo de Serviço" subtitle="Modalidades ativas" showBack items={items} />;
}
