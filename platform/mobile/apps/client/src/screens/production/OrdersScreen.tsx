import React, { useEffect, useMemo } from 'react';
import { ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { Text } from 'react-native-paper';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useColors } from '@okinawa/shared/contexts/ThemeContext';
import { ScreenContainer } from '@okinawa/shared/components/ScreenContainer';
import customerBackend, { type CustomerOrderStatus } from '../../services/customer-backend';
import { money, rootNavigate, StateView } from './shared';

const STATUS_COLORS: Record<CustomerOrderStatus, string> = {
  pending: '#EA580C', confirmed: '#EA580C', preparing: '#D97706',
  ready: '#16A34A', delivered: '#6B7280', completed: '#6B7280', cancelled: '#DC2626',
};

const STATUS_LABELS: Record<CustomerOrderStatus, string> = {
  pending: 'Recebido', confirmed: 'Confirmado', preparing: 'Preparando',
  ready: 'Pronto', delivered: 'Entregue', completed: 'Concluído', cancelled: 'Cancelado',
};

export default function OrdersScreen({ navigation }: any) {
  const colors = useColors();
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: ['orders'], queryFn: () => customerBackend.listOrders() });

  useEffect(() => {
    let channel: any;
    customerBackend.subscribeToUserChanges(() => queryClient.invalidateQueries({ queryKey: ['orders'] })).then((c) => {
      channel = c;
    });
    return () => { channel?.unsubscribe(); };
  }, [queryClient]);

  const styles = useMemo(
    () =>
      StyleSheet.create({
        container: { flex: 1, backgroundColor: colors.background },
        headerTitle: { fontSize: 26, fontWeight: '700', color: colors.foreground, marginBottom: 16 },
        content: { paddingBottom: 32 },
        orderCard: {
          flexDirection: 'row', alignItems: 'center', gap: 14, padding: 16, borderRadius: 18,
          backgroundColor: colors.card, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, marginBottom: 10,
        },
        orderIcon: { width: 48, height: 48, borderRadius: 14, backgroundColor: 'rgba(234, 88, 12, 0.12)', alignItems: 'center', justifyContent: 'center' },
        orderRestaurant: { fontSize: 15, fontWeight: '700', color: colors.foreground, marginBottom: 4 },
        orderMeta: { fontSize: 13, color: colors.foregroundSecondary },
        statusPill: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 10 },
        statusText: { fontSize: 12, fontWeight: '700' },
      }),
    [colors],
  );

  const orders = query.data?.data ?? [];

  return (
    <ScreenContainer edges={['top']}>
      <ScrollView style={styles.container} contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 8 }} showsVerticalScrollIndicator={false}>
        <Text style={styles.headerTitle}>Pedidos</Text>

        <StateView
          loading={query.isLoading}
          error={query.error}
          onRetry={() => query.refetch()}
          empty={orders.length === 0 && !query.isLoading ? 'Você ainda não fez pedidos.' : undefined}
          emptyIcon="receipt-outline"
        />

        <View style={styles.content}>
          {orders.map((order) => {
            const statusColor = STATUS_COLORS[order.status] ?? STATUS_COLORS.pending;
            return (
              <TouchableOpacity
                key={order.id}
                style={styles.orderCard}
                onPress={() => rootNavigate(navigation, 'OrderDetail', { orderId: order.id })}
                activeOpacity={0.85}
                accessibilityRole="button"
              >
                <View style={styles.orderIcon}>
                  <Ionicons name="receipt-outline" size={24} color={colors.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.orderRestaurant}>{order.restaurantName}</Text>
                  <Text style={styles.orderMeta}>
                    {order.items.length} {order.items.length === 1 ? 'item' : 'itens'} · {money(order.total)} · {new Date(order.createdAt).toLocaleString('pt-BR')}
                  </Text>
                </View>
                <View style={[styles.statusPill, { backgroundColor: `${statusColor}18` }]}>
                  <Text style={[styles.statusText, { color: statusColor }]}>{STATUS_LABELS[order.status] ?? order.status}</Text>
                </View>
                <Ionicons name="chevron-forward" size={20} color={colors.foregroundMuted} />
              </TouchableOpacity>
            );
          })}
        </View>
      </ScrollView>
    </ScreenContainer>
  );
}
