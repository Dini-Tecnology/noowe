import React, { useCallback, useEffect, useState } from 'react';
import { RefreshControl, ScrollView, View, TouchableOpacity, StyleSheet } from 'react-native';
import { Text } from 'react-native-paper';
import { Bell, CreditCard, Plus, CheckCircle } from 'lucide-react-native';
import { useColors } from '@okinawa/shared/contexts/ThemeContext';
import { supabaseApiAdapter } from '@okinawa/shared/services/supabase-api';
import { useRestaurantRole } from '../../contexts/RestaurantRoleContext';
import { useServiceCallsRealtime, useTablesRealtime } from './shared/useRealtimeSubscription';
import { V2Shell } from './shared/V2Shell';

interface TableRow {
  id: string;
  table_number?: number | string;
  status: string;
  guest_name?: string;
  guest_count?: number;
  notes?: string;
  open_calls?: number;
}

function tableTone(status: string, openCalls: number, primary: string) {
  if (openCalls > 0 || status === 'needs_attention') {
    return { bg: '#FEE2E2', border: '#EF4444', Icon: Bell, iconBg: '#EF4444' };
  }
  if (status === 'payment') {
    return { bg: '#EDE9FE', border: '#8B5CF6', Icon: CreditCard, iconBg: '#8B5CF6' };
  }
  if (status === 'occupied') {
    return { bg: `${primary}15`, border: primary, Icon: Plus, iconBg: primary };
  }
  if (status === 'ready') {
    return { bg: '#F0FDF4', border: '#22C55E', Icon: CheckCircle, iconBg: '#22C55E' };
  }
  return { bg: `${primary}08`, border: `${primary}40`, Icon: Plus, iconBg: primary };
}

function tableStatusLabel(status: string, openCalls: number): string {
  if (openCalls > 0) return `${openCalls} chamado${openCalls > 1 ? 's' : ''} aberto${openCalls > 1 ? 's' : ''}`;
  const map: Record<string, string> = {
    available: 'Livre',
    occupied: 'Ocupada',
    reserved: 'Reservada',
    cleaning: 'Limpeza',
    payment: 'Aguardando pagamento',
    ready: 'Pronta para atender',
  };
  return map[status] ?? status;
}

export default function WaiterScreen() {
  const colors = useColors();
  const { restaurantId } = useRestaurantRole();
  const [tables, setTables] = useState<TableRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      setError(null);
      const [tablesData, callsData] = await Promise.all([
        supabaseApiAdapter.getMyTables(),
        supabaseApiAdapter.getServiceCalls(undefined, ['open', 'acknowledged']),
      ]);

      const callsByTable: Record<string, number> = {};
      if (Array.isArray(callsData)) {
        for (const call of callsData) {
          if (call.table_id) {
            callsByTable[call.table_id] = (callsByTable[call.table_id] ?? 0) + 1;
          }
        }
      }

      const rows: TableRow[] = Array.isArray(tablesData)
        ? tablesData.map((t: any) => ({
            id: t.id,
            table_number: t.table_number ?? t.number,
            status: t.status,
            guest_name: t.guest_name,
            guest_count: t.guest_count,
            notes: t.notes,
            open_calls: callsByTable[t.id] ?? 0,
          }))
        : [];

      // Sort: tables with open calls first, then by status priority
      rows.sort((a, b) => {
        const aCalls = a.open_calls ?? 0;
        const bCalls = b.open_calls ?? 0;
        if (aCalls !== bCalls) return bCalls - aCalls;
        const priority = (s: string) => (s === 'payment' ? 0 : s === 'occupied' ? 1 : 2);
        return priority(a.status) - priority(b.status);
      });

      setTables(rows);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar mesas');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);
  useTablesRealtime(restaurantId, load);
  useServiceCallsRealtime(restaurantId, load);

  const onRefresh = () => {
    setRefreshing(true);
    void load();
  };

  return (
    <V2Shell title="Garçom" subtitle="Mesas e chamados" showBack>
      <ScrollView
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        showsVerticalScrollIndicator={false}
      >
        {loading && (
          <Text style={{ textAlign: 'center', color: colors.foregroundSecondary, marginTop: 24 }}>
            Carregando mesas…
          </Text>
        )}
        {error && (
          <Text style={{ textAlign: 'center', color: '#EF4444', marginTop: 24 }}>{error}</Text>
        )}
        {!loading && !error && tables.length === 0 && (
          <Text style={{ textAlign: 'center', color: colors.foregroundSecondary, marginTop: 24 }}>
            Nenhuma mesa atribuída
          </Text>
        )}
        {tables.map((table) => {
          const tone = tableTone(table.status, table.open_calls ?? 0, colors.primary);
          const { Icon } = tone;
          const label = `Mesa ${table.table_number ?? table.id}`;
          const message = tableStatusLabel(table.status, table.open_calls ?? 0);
          return (
            <View
              key={table.id}
              style={[styles.card, { backgroundColor: tone.bg, borderColor: tone.border }]}
            >
              <View>
                <Text style={{ fontWeight: '700', fontSize: 18, color: colors.foreground }}>{label}</Text>
                <Text style={{ color: colors.foregroundSecondary }}>{message}</Text>
                {table.guest_name ? (
                  <Text style={{ fontSize: 12, color: colors.foregroundSecondary }}>
                    {table.guest_name}{table.guest_count ? ` · ${table.guest_count} pessoas` : ''}
                  </Text>
                ) : null}
              </View>
              <View style={[styles.iconWrap, { backgroundColor: tone.iconBg }]}>
                <Icon size={20} color="#FFF" />
              </View>
            </View>
          );
        })}
      </ScrollView>
    </V2Shell>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderRadius: 16,
    borderWidth: 2,
    marginBottom: 12,
  },
  iconWrap: { padding: 12, borderRadius: 12 },
});
