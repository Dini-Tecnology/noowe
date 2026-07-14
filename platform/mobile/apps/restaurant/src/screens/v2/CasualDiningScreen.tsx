import { useCallback, useEffect, useState } from 'react';
import { QrCode, Users, Bell } from 'lucide-react-native';
import { supabaseApiAdapter } from '@okinawa/shared/services/supabase-api';
import { V2ListScreen, type V2ListItem } from './shared/V2ListScreen';
import { useRestaurantRole } from '../../contexts/RestaurantRoleContext';
import { useRestaurantTables } from './shared/useRestaurantOperations';

interface CasualDiningConfig {
  call_waiter_button?: boolean;
  partial_order_enabled?: boolean;
}

export default function CasualDiningScreen() {
  const { restaurantId } = useRestaurantRole();
  const { data: tables, refresh: refreshTables } = useRestaurantTables();
  const [config, setConfig] = useState<CasualDiningConfig | null>(null);

  const loadConfig = useCallback(async () => {
    if (!restaurantId) return;
    try {
      const rows = await supabaseApiAdapter.getServiceConfigs(restaurantId);
      const casual = Array.isArray(rows) ? rows.find((r: any) => r.service_type === 'casual_dining') : null;
      setConfig(casual ?? {});
    } catch {
      setConfig({});
    }
  }, [restaurantId]);

  useEffect(() => { void loadConfig(); }, [loadConfig]);

  const tablesWithQR = tables.filter((t) => t.hasQR).length;

  const items: V2ListItem[] = [
    { icon: QrCode, label: 'QR Code na mesa', subtitle: `Ativo em ${tablesWithQR} mesa${tablesWithQR === 1 ? '' : 's'}` },
    { icon: Bell, label: 'Chamar garçom', subtitle: config?.call_waiter_button ? 'Push + KDS garçom' : 'Desativado' },
    { icon: Users, label: 'Pedido compartilhado', subtitle: config?.partial_order_enabled ? 'Split por item' : 'Desativado' },
  ];

  return <V2ListScreen title="Casual Dining" subtitle="Configuração do modo" showBack items={items} onRefresh={() => Promise.all([refreshTables(), loadConfig()]).then(() => undefined)} />;
}
