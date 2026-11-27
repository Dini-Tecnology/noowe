import React, { useCallback, useEffect, useState } from 'react';
import { RefreshControl, ScrollView, View, TouchableOpacity, StyleSheet } from 'react-native';
import { Text } from 'react-native-paper';
import { Wine } from 'lucide-react-native';
import { useColors } from '@okinawa/shared/contexts/ThemeContext';
import { supabaseApiAdapter } from '@okinawa/shared/services/supabase-api';
import { V2Shell } from './shared/V2Shell';
import { userErrorMessage } from '@okinawa/shared/utils/user-error-message';
import { itemStatusLabel } from '@okinawa/shared/utils/status-label';
import { mapBarQueueRow, type BarQueueItem, type RawBarQueueRow } from './shared/kdsItems';
import { CancelItemLink, useCancelKdsItem } from './shared/cancelKdsItem';

// A RPC devolve name/table_number; o mapeamento é o mesmo da visão do barman.
type BarKdsItem = BarQueueItem & { notes: string | null };

function statusColor(status: string, primary: string): string {
  if (status === 'ready') return '#22C55E';
  if (status === 'preparing') return '#F59E0B';
  if (status === 'cancelled') return '#EF4444';
  return primary;
}

export default function BarKDSScreen() {
  const colors = useColors();
  const [items, setItems] = useState<BarKdsItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      setError(null);
      const data = await supabaseApiAdapter.getBarQueue();
      setItems((Array.isArray(data) ? data : []).map((row: RawBarQueueRow & { special_instructions?: string | null }) => ({ ...mapBarQueueRow(row), notes: row.special_instructions ?? null })));
    } catch (err) {
      setError(userErrorMessage(err, 'Erro ao carregar fila do bar'));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  const cancelItem = useCancelKdsItem(load);

  // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount: the async loader sets state after its request resolves, not synchronously
  useEffect(() => { void load(); }, [load]);

  const onRefresh = () => {
    setRefreshing(true);
    void load();
  };

  const markReady = async (itemId: string) => {
    try {
      await supabaseApiAdapter.updateOrderItemStatus(itemId, 'ready');
      void load();
    } catch (err) {
      console.warn('Erro ao marcar item pronto:', err);
    }
  };

  return (
    <V2Shell title="KDS Bar" subtitle="Bebidas e drinks" showBack>
      <ScrollView
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        showsVerticalScrollIndicator={false}
      >
        {loading && (
          <Text style={{ textAlign: 'center', color: colors.foregroundSecondary, marginTop: 24 }}>
            Carregando fila do bar…
          </Text>
        )}
        {error && (
          <Text style={{ textAlign: 'center', color: '#EF4444', marginTop: 24 }}>
            {error}
          </Text>
        )}
        {!loading && !error && items.length === 0 && (
          <Text style={{ textAlign: 'center', color: colors.foregroundSecondary, marginTop: 24 }}>
            Nenhum item na fila do bar
          </Text>
        )}
        {items.map((item) => {
          const accent = statusColor(item.status, colors.primary);
          return (
            <View
              key={item.id}
              style={[styles.card, { backgroundColor: colors.card, borderColor: accent }]}
            >
              <View style={[styles.iconWrap, { backgroundColor: `${accent}20` }]}>
                <Wine size={20} color={accent} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontWeight: '700', color: colors.foreground }}>
                  {item.quantity > 1 ? `${item.quantity}x ` : ''}{item.name}
                </Text>
                <Text style={{ fontSize: 12, color: colors.foregroundSecondary }}>
                  {item.tableLabel}
                  {item.elapsedMinutes != null ? ` · ${item.elapsedMinutes}min` : ''}
                </Text>
                {item.notes ? (
                  <Text style={{ fontSize: 12, color: colors.foregroundSecondary, fontStyle: 'italic' }}>
                    {item.notes}
                  </Text>
                ) : null}
              </View>
              <View style={{ alignItems: 'flex-end', gap: 6 }}>
                <Text style={{ fontSize: 12, fontWeight: '600', color: accent }}>
                  {itemStatusLabel(item.status)}
                </Text>
                {item.status !== 'ready' ? (
                  <TouchableOpacity
                    style={[styles.actionBtn, { backgroundColor: '#22C55E' }]}
                    onPress={() => void markReady(item.id)}
                  >
                    <Text style={{ color: '#FFF', fontSize: 11, fontWeight: '700' }}>Pronto</Text>
                  </TouchableOpacity>
                ) : null}
                <CancelItemLink name={item.name} status={item.status} onPress={() => cancelItem.request(item.id, item.name)} />
              </View>
            </View>
          );
        })}
      </ScrollView>
      {cancelItem.dialog}
    </V2Shell>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderRadius: 14,
    borderWidth: 1.5,
    marginBottom: 10,
  },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionBtn: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
});
