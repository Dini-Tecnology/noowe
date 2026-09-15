import React, { useMemo, useState } from 'react';
import { View, TouchableOpacity, StyleSheet } from 'react-native';
import { Text } from 'react-native-paper';
import { Info } from 'lucide-react-native';
import { useColors } from '@okinawa/shared/contexts/ThemeContext';
import ApiService from '@okinawa/shared/services/api';
import { V2Shell } from './shared/V2Shell';
import { V2_TONE } from './shared/v2Theme';
import { V2StatusBadge } from './shared/V2StatusBadge';
import { V2ConfirmDialog } from './shared/V2ConfirmDialog';
import { V2DetailDialog } from './shared/V2DetailDialog';
import { useKdsOrders } from './shared/useRestaurantOperations';
import { kdsStatusLabel, kdsStatusTone } from './shared/v2Types';
import type { KdsFilter, KdsOrder, KdsStatus } from './shared/v2Types';

type PendingKdsAction = {
  orderId: string;
  action: 'start' | 'ready';
};

const FILTER_TABS: { key: KdsFilter; label: string }[] = [
  { key: 'queue', label: 'Fila' },
  { key: 'preparing', label: 'Preparando' },
  { key: 'ready', label: 'Prontos' },
];

export default function KitchenDisplayScreen() {
  const colors = useColors();
  const [activeTab, setActiveTab] = useState<KdsFilter>('queue');
  const [pendingAction, setPendingAction] = useState<PendingKdsAction | null>(null);
  const [detailOrder, setDetailOrder] = useState<KdsOrder | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { data: orders, loading, error, refresh } = useKdsOrders();

  const counts = useMemo(() => ({
    queue: orders.filter((o) => o.status === 'queue').length,
    preparing: orders.filter((o) => o.status === 'preparing').length,
    ready: orders.filter((o) => o.status === 'ready').length,
  }), [orders]);

  const filteredOrders = useMemo(
    () => orders.filter((o) => o.status === activeTab),
    [orders, activeTab],
  );

  const handleConfirm = async () => {
    if (!pendingAction) return;
    const newStatus: KdsStatus = pendingAction.action === 'start' ? 'preparing' : 'ready';
    setIsSubmitting(true);
    try {
      await ApiService.updateOrderStatus(pendingAction.orderId, newStatus);
      await refresh();
      setPendingAction(null);
    } finally {
      setIsSubmitting(false);
    }
  };

  const pendingOrder = pendingAction ? orders.find((o) => o.id === pendingAction.orderId) : null;

  return (
    <V2Shell title="KDS Cozinha" subtitle="Kitchen Display System" showBack onRefresh={refresh}>
      <View style={styles.stats}>
        {FILTER_TABS.map((tab) => {
          const tone = tab.key === 'queue' ? 'warning' : tab.key === 'preparing' ? 'info' : 'success';
          const isActive = activeTab === tab.key;
          return (
            <TouchableOpacity
              key={tab.key}
              activeOpacity={0.7}
              onPress={() => setActiveTab(tab.key)}
              style={[
                styles.stat,
                {
                  backgroundColor: isActive ? `${colors.primary}10` : colors.card,
                  borderColor: isActive ? colors.primary : colors.border,
                  borderWidth: isActive ? 2 : 1,
                },
              ]}
            >
              <Text style={[styles.statValue, { color: V2_TONE[tone].text, backgroundColor: V2_TONE[tone].bg }]}>
                {counts[tab.key]}
              </Text>
              <Text style={{ fontSize: 12, color: colors.foregroundSecondary }}>{tab.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {loading ? (
        <StateCard message="Carregando KDS..." />
      ) : error ? (
        <StateCard message={error} actionLabel="Tentar novamente" onAction={refresh} />
      ) : filteredOrders.length === 0 ? (
        <StateCard message="Nenhum item nesta etapa." />
      ) : null}

      {filteredOrders.map((order) => (
        <View key={order.id} style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={styles.cardHeader}>
            <View style={{ flex: 1 }}>
              <Text style={{ fontWeight: '700', fontSize: 16, color: colors.foreground }}>{order.table}</Text>
              <Text style={{ fontSize: 12, color: colors.foregroundSecondary }}>{order.meta}</Text>
            </View>
            <View style={styles.headerActions}>
              <TouchableOpacity
                onPress={() => setDetailOrder(order)}
                style={[styles.detailBtn, { backgroundColor: colors.backgroundSecondary }]}
              >
                <Info size={16} color={colors.foregroundSecondary} />
              </TouchableOpacity>
              <V2StatusBadge label={kdsStatusLabel(order.status)} tone={kdsStatusTone(order.status)} />
            </View>
          </View>
          {order.items.map(([name, time]) => (
            <View key={name} style={styles.itemRow}>
              <Text style={{ color: colors.foreground, fontSize: 13 }}>{name}</Text>
              <Text style={{ color: colors.foregroundSecondary, fontSize: 12 }}>{time}</Text>
            </View>
          ))}
          {order.status === 'queue' && (
            <TouchableOpacity
              style={styles.action}
              onPress={() => setPendingAction({ orderId: order.id, action: 'start' })}
            >
              <Text style={{ color: '#1E293B', fontWeight: '700' }}>Iniciar preparo</Text>
            </TouchableOpacity>
          )}
          {order.status === 'preparing' && (
            <TouchableOpacity
              style={[styles.action, { backgroundColor: '#22C55E' }]}
              onPress={() => setPendingAction({ orderId: order.id, action: 'ready' })}
            >
              <Text style={{ color: '#FFF', fontWeight: '700' }}>Marcar pronto</Text>
            </TouchableOpacity>
          )}
        </View>
      ))}

      <V2ConfirmDialog
        visible={!!pendingAction}
        title={pendingAction?.action === 'start' ? 'Iniciar preparo' : 'Marcar como pronto'}
        message={
          pendingAction?.action === 'start' && pendingOrder
            ? `Iniciar preparo do pedido da ${pendingOrder.table}?`
            : pendingOrder
              ? `Marcar pedido da ${pendingOrder.table} como pronto?`
              : ''
        }
        confirmLabel={isSubmitting ? 'Salvando...' : pendingAction?.action === 'start' ? 'Iniciar' : 'Marcar pronto'}
        onConfirm={() => void handleConfirm()}
        onCancel={() => setPendingAction(null)}
      />

      <V2DetailDialog
        visible={!!detailOrder}
        order={detailOrder}
        onClose={() => setDetailOrder(null)}
      />
    </V2Shell>
  );
}

function StateCard({ message, actionLabel, onAction }: { message: string; actionLabel?: string; onAction?: () => void }) {
  const colors = useColors();
  return (
    <View style={[styles.stateCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <Text style={{ color: colors.foregroundSecondary, textAlign: 'center' }}>{message}</Text>
      {actionLabel && onAction ? (
        <TouchableOpacity onPress={onAction} style={[styles.retryBtn, { backgroundColor: colors.primary }]}>
          <Text style={{ color: '#FFF', fontWeight: '700' }}>{actionLabel}</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  stats: { flexDirection: 'row', gap: 10, marginBottom: 16 },
  stat: { flex: 1, borderRadius: 14, padding: 12 },
  statValue: { alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999, fontWeight: '700', fontSize: 14, overflow: 'hidden' },
  card: { borderRadius: 16, borderWidth: 1, padding: 14, marginBottom: 12 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 },
  headerActions: { alignItems: 'flex-end', gap: 8 },
  detailBtn: { padding: 6, borderRadius: 8 },
  itemRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 },
  action: { marginTop: 12, backgroundColor: '#F59E0B', borderRadius: 14, paddingVertical: 12, alignItems: 'center' },
  stateCard: { borderWidth: 1, borderRadius: 14, padding: 16, marginBottom: 12, alignItems: 'center', gap: 10 },
  retryBtn: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 12 },
});
