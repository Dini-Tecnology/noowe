import React, { useMemo, useState } from 'react';
import { View, TouchableOpacity, StyleSheet } from 'react-native';
import { Text } from 'react-native-paper';
import { Clock, Check, ChefHat, Truck, X, Info } from 'lucide-react-native';
import { useColors } from '@okinawa/shared/contexts/ThemeContext';
import ApiService from '@okinawa/shared/services/api';
import { V2Shell } from './shared/V2Shell';
import { V2ConfirmDialog } from './shared/V2ConfirmDialog';
import { V2DetailDialog } from './shared/V2DetailDialog';
import { shortOrderId, useRestaurantOrders } from './shared/useRestaurantOperations';
import type { OrderFilter, OrderStatus, TabOrder } from './shared/v2Types';

type PendingAction = {
  orderId: string;
  action: 'accept' | 'cancel' | 'ready' | 'deliver';
};

const FILTER_TABS: { key: OrderFilter; label: string }[] = [
  { key: 'all', label: 'Todos' },
  { key: 'new', label: 'Novos' },
  { key: 'preparing', label: 'Preparando' },
  { key: 'ready', label: 'Prontos' },
];

const ACTION_MESSAGES: Record<PendingAction['action'], { title: string; message: string; destructive?: boolean; confirmLabel: string }> = {
  accept: { title: 'Aceitar pedido', message: '', confirmLabel: 'Aceitar' },
  cancel: { title: 'Cancelar pedido', message: 'Deseja cancelar este pedido?', destructive: true, confirmLabel: 'Cancelar pedido' },
  ready: { title: 'Marcar como pronto', message: 'Confirmar que o pedido está pronto para entrega?', confirmLabel: 'Marcar pronto' },
  deliver: { title: 'Confirmar entrega', message: 'Confirmar que o pedido foi entregue ao cliente?', confirmLabel: 'Confirmar entrega' },
};

function nextStatus(action: PendingAction['action']): OrderStatus | null {
  if (action === 'accept') return 'preparing';
  if (action === 'ready') return 'ready';
  return null;
}

export default function OrdersScreen() {
  const colors = useColors();
  const [activeTab, setActiveTab] = useState<OrderFilter>('all');
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null);
  const [detailOrder, setDetailOrder] = useState<TabOrder | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { data: orders, loading, error, refresh } = useRestaurantOrders();

  const filteredOrders = useMemo(() => {
    if (activeTab === 'all') return orders;
    return orders.filter((o) => o.status === activeTab);
  }, [orders, activeTab]);

  const handleConfirm = async () => {
    if (!pendingAction) return;
    const { orderId, action } = pendingAction;

    setIsSubmitting(true);
    try {
      if (action === 'cancel') {
        await ApiService.updateOrderStatus(orderId, 'cancelled');
      } else if (action === 'deliver') {
        await ApiService.updateOrderStatus(orderId, 'delivered');
      } else {
        const newStatus = nextStatus(action);
        if (newStatus) await ApiService.updateOrderStatus(orderId, newStatus);
      }
      await refresh();
      setPendingAction(null);
    } finally {
      setIsSubmitting(false);
    }
  };

  const pendingOrder = pendingAction ? orders.find((o) => o.id === pendingAction.orderId) : null;
  const dialogConfig = pendingAction ? ACTION_MESSAGES[pendingAction.action] : null;

  return (
    <V2Shell title="Pedidos" subtitle="Gestão em tempo real" showBack onRefresh={refresh}>
      <View style={styles.filters}>
        {FILTER_TABS.map((tab) => (
          <TouchableOpacity
            key={tab.key}
            activeOpacity={0.7}
            onPress={() => setActiveTab(tab.key)}
            style={[
              styles.chip,
              { backgroundColor: activeTab === tab.key ? colors.primary : colors.backgroundSecondary },
            ]}
          >
            <Text
              style={{
                color: activeTab === tab.key ? '#FFF' : colors.foregroundSecondary,
                fontSize: 12,
                fontWeight: '600',
              }}
            >
              {tab.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {loading ? (
        <StateCard message="Carregando pedidos..." />
      ) : error ? (
        <StateCard message={error} actionLabel="Tentar novamente" onAction={refresh} />
      ) : filteredOrders.length === 0 ? (
        <StateCard message="Nenhum pedido nesta fila." />
      ) : null}

      {filteredOrders.map((order) => (
        <View
          key={order.id}
          style={[
            styles.card,
            {
              borderColor: order.status === 'new' ? colors.primary : order.status === 'ready' ? '#22C55E' : colors.border,
              backgroundColor: colors.card,
            },
          ]}
        >
          <View style={styles.row}>
            <Text style={{ fontWeight: '700', fontSize: 16, color: colors.foreground }}>{shortOrderId(order.id)}</Text>
            <Text style={{ color: colors.foregroundSecondary }}>{order.table}</Text>
            <View style={styles.timeRow}>
              <Clock size={14} color={colors.foregroundSecondary} />
              <Text style={{ color: colors.foregroundSecondary, fontSize: 12 }}>{order.time}</Text>
            </View>
            <TouchableOpacity
              onPress={() => setDetailOrder(order)}
              style={[styles.infoBtn, { backgroundColor: colors.backgroundSecondary }]}
            >
              <Info size={16} color={colors.foregroundSecondary} />
            </TouchableOpacity>
          </View>
          {order.items.map((item) => (
            <Text key={item} style={{ color: colors.foregroundSecondary, fontSize: 13 }}>{item}</Text>
          ))}
          <View style={[styles.footer, { borderTopColor: colors.border }]}>
            <Text style={{ fontWeight: '700', color: colors.primary }}>R$ {order.total.toFixed(2)}</Text>
            {order.status === 'new' && (
              <View style={styles.actions}>
                <TouchableOpacity
                  style={styles.iconBtn}
                  onPress={() => setPendingAction({ orderId: order.id, action: 'cancel' })}
                >
                  <X size={18} color="#EF4444" />
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.btn, { backgroundColor: colors.primary }]}
                  onPress={() => setPendingAction({ orderId: order.id, action: 'accept' })}
                >
                  <ChefHat size={16} color="#FFF" />
                  <Text style={styles.btnText}>Aceitar</Text>
                </TouchableOpacity>
              </View>
            )}
            {order.status === 'preparing' && (
              <TouchableOpacity
                style={[styles.btn, { backgroundColor: '#22C55E' }]}
                onPress={() => setPendingAction({ orderId: order.id, action: 'ready' })}
              >
                <Check size={16} color="#FFF" />
                <Text style={styles.btnText}>Pronto</Text>
              </TouchableOpacity>
            )}
            {order.status === 'ready' && (
              <TouchableOpacity
                style={[styles.btn, { backgroundColor: '#8B5CF6' }]}
                onPress={() => setPendingAction({ orderId: order.id, action: 'deliver' })}
              >
                <Truck size={16} color="#FFF" />
                <Text style={styles.btnText}>Entregar</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      ))}

      <V2ConfirmDialog
        visible={!!pendingAction}
        title={dialogConfig?.title ?? ''}
        message={
          pendingAction?.action === 'accept' && pendingOrder
            ? `Aceitar pedido ${shortOrderId(pendingOrder.id)}?`
            : dialogConfig?.message ?? ''
        }
        confirmLabel={isSubmitting ? 'Salvando...' : dialogConfig?.confirmLabel}
        destructive={dialogConfig?.destructive}
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
          <Text style={styles.btnText}>{actionLabel}</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  filters: { flexDirection: 'row', gap: 8, marginBottom: 16, flexWrap: 'wrap' },
  chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 12 },
  card: { borderWidth: 2, borderRadius: 16, padding: 16, marginBottom: 12 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8, flexWrap: 'wrap' },
  timeRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginLeft: 'auto' },
  infoBtn: { padding: 6, borderRadius: 8 },
  footer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 12, paddingTop: 12, borderTopWidth: StyleSheet.hairlineWidth },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  iconBtn: { padding: 8, borderRadius: 12, backgroundColor: '#FEE2E2' },
  btn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 12 },
  btnText: { color: '#FFF', fontWeight: '600', fontSize: 13 },
  stateCard: { borderWidth: 1, borderRadius: 14, padding: 16, marginBottom: 12, alignItems: 'center', gap: 10 },
  retryBtn: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 12 },
});
