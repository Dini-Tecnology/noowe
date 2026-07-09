import { useEffect, useState } from 'react';
import { Share } from 'react-native';
import { TrendingUp, Users, Clock, Download } from 'lucide-react-native';
import { formatCurrency } from '@okinawa/shared/utils/formatters';
import { supabaseApiAdapter } from '@okinawa/shared/services/supabase-api';
import { V2ListScreen, type V2ListItem } from './shared/V2ListScreen';
import { useRestaurantRole } from '../../contexts/RestaurantRoleContext';

interface Reports {
  revenue?: { total?: number };
  customers?: { unique_served?: number };
  service_time?: { average_minutes?: number };
  orders?: { total?: number; completed?: number };
}

export default function ReportsScreen() {
  const { restaurantId } = useRestaurantRole();
  const [reports, setReports] = useState<Reports | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!restaurantId) return;
    supabaseApiAdapter.getReports(restaurantId)
      .then((data) => { if (!cancelled) setReports(data ?? {}); })
      .catch(() => { if (!cancelled) setReports({}); });
    return () => { cancelled = true; };
  }, [restaurantId]);

  const exportData = () => {
    const csv = [
      'metric,value',
      `revenue_total,${reports?.revenue?.total ?? 0}`,
      `orders_total,${reports?.orders?.total ?? 0}`,
      `orders_completed,${reports?.orders?.completed ?? 0}`,
      `unique_customers,${reports?.customers?.unique_served ?? 0}`,
      `avg_service_minutes,${reports?.service_time?.average_minutes ?? 0}`,
    ].join('\n');
    void Share.share({ message: csv, title: 'Relatório do mês' });
  };

  const items: V2ListItem[] = [
    {
      icon: TrendingUp,
      label: 'Vendas por Período',
      subtitle: reports?.revenue?.total != null ? formatCurrency(reports.revenue.total) : 'Carregando…',
    },
    {
      icon: Users,
      label: 'Clientes Atendidos',
      subtitle: reports?.customers?.unique_served != null ? `${reports.customers.unique_served} clientes` : 'Carregando…',
    },
    {
      icon: Clock,
      label: 'Tempo de Atendimento',
      subtitle: reports?.service_time?.average_minutes != null ? `${reports.service_time.average_minutes} min em média` : 'Carregando…',
    },
    { icon: Download, label: 'Exportar Dados', subtitle: 'Compartilhar como CSV', onPress: exportData },
  ];

  return (
    <V2ListScreen
      title="Relatórios"
      subtitle="Análises e métricas"
      showBack
      items={items}
    />
  );
}
