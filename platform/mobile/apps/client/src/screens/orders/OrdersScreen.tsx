import React, { useMemo, useCallback } from 'react';
import { View, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator } from 'react-native';
import { Text } from 'react-native-paper';
import { useNavigation } from '@react-navigation/native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useColors } from '@okinawa/shared/contexts/ThemeContext';
import { ScreenContainer } from '@okinawa/shared/components/ScreenContainer';
import { useMyOrders } from '@okinawa/shared/hooks/useOrdersQuery';

function formatPrice(value: number): string {
  return `R$ ${value.toFixed(2).replace('.', ',')}`;
}

type OrderStatus = 'pending' | 'confirmed' | 'preparing' | 'ready' | 'delivered' | 'completed' | 'cancelled';

const STATUS_COLORS: Record<OrderStatus, string> = {
  pending: '#EA580C',
  confirmed: '#EA580C',
  preparing: '#D97706',
  ready: '#16A34A',
  delivered: '#6B7280',
  completed: '#6B7280',
  cancelled: '#DC2626',
};

const STATUS_LABELS: Record<OrderStatus, string> = {
  pending: 'Recebido',
  confirmed: 'Confirmado',
  preparing: 'Preparando',
  ready: 'Pronto',
  delivered: 'Entregue',
  completed: 'Concluído',
  cancelled: 'Cancelado',
};

const ACTIVE_STATUSES: OrderStatus[] = ['pending', 'confirmed', 'preparing', 'ready'];

function orderTotal(order: any): number {
  return (order.order_items ?? []).reduce((sum: number, item: any) => sum + Number(item.total_price ?? 0), 0);
}

function orderItemCount(order: any): number {
  return (order.order_items ?? []).length;
}

function formatTime(iso: string): string {
  const date = new Date(iso);
  return date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

/** Aba Pedidos — pedidos ativos do cliente autenticado */
export default function OrdersScreen() {
  const navigation = useNavigation<any>();
  const colors = useColors();
  const { data: allOrders, isLoading, isError, refetch } = useMyOrders();

  const orders = useMemo(
    () => ((allOrders ?? []) as any[]).filter((o) => ACTIVE_STATUSES.includes(o.status)),
    [allOrders],
  );
  const hasOrders = orders.length > 0;

  const styles = useMemo(
    () =>
      StyleSheet.create({
        container: {
          flex: 1,
          backgroundColor: colors.background,
        },
        header: {
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingHorizontal: 16,
          paddingVertical: 12,
        },
        headerBtn: {
          width: 40,
          height: 40,
          borderRadius: 20,
          backgroundColor: colors.backgroundTertiary,
          alignItems: 'center',
          justifyContent: 'center',
        },
        headerSpacer: {
          width: 40,
        },
        headerTitle: {
          fontSize: 18,
          fontWeight: '700',
          color: colors.foreground,
        },
        scroll: { flex: 1 },
        content: {
          paddingHorizontal: 16,
          paddingBottom: 88,
          gap: 20,
        },
        sectionLabel: {
          fontSize: 12,
          fontWeight: '700',
          letterSpacing: 1,
          color: colors.foregroundSecondary,
          marginBottom: 10,
        },
        orderCard: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: 14,
          padding: 16,
          borderRadius: 18,
          backgroundColor: colors.card,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: colors.border,
          marginBottom: 10,
        },
        orderIcon: {
          width: 48,
          height: 48,
          borderRadius: 14,
          backgroundColor: 'rgba(234, 88, 12, 0.12)',
          alignItems: 'center',
          justifyContent: 'center',
        },
        orderRestaurant: {
          fontSize: 15,
          fontWeight: '700',
          color: colors.foreground,
          marginBottom: 4,
        },
        orderMeta: {
          fontSize: 13,
          color: colors.foregroundSecondary,
        },
        statusPill: {
          paddingHorizontal: 10,
          paddingVertical: 5,
          borderRadius: 10,
        },
        statusText: {
          fontSize: 12,
          fontWeight: '700',
        },
        chevron: {
          marginLeft: 4,
        },
        emptyWrap: {
          alignItems: 'center',
          paddingVertical: 32,
          paddingHorizontal: 24,
        },
        receiptIconWrap: {
          width: 96,
          height: 96,
          borderRadius: 48,
          backgroundColor: colors.backgroundTertiary,
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: 16,
        },
        emptyMessage: {
          fontSize: 15,
          color: colors.foregroundSecondary,
          textAlign: 'center',
          marginBottom: 20,
        },
        primaryBtn: {
          backgroundColor: colors.primary,
          paddingHorizontal: 28,
          paddingVertical: 12,
          borderRadius: 14,
        },
        primaryBtnText: {
          color: colors.primaryForeground,
          fontSize: 15,
          fontWeight: '700',
        },
        comandaItem: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: 12,
          padding: 12,
          borderRadius: 16,
          backgroundColor: colors.card,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: colors.border,
          marginBottom: 10,
        },
        itemImage: {
          width: 56,
          height: 56,
          borderRadius: 12,
          backgroundColor: colors.backgroundTertiary,
        },
        itemInfo: { flex: 1 },
        itemName: {
          fontSize: 15,
          fontWeight: '600',
          color: colors.foreground,
          marginBottom: 4,
        },
        itemMeta: {
          fontSize: 13,
          color: colors.foregroundSecondary,
        },
        itemPrice: {
          fontSize: 15,
          fontWeight: '700',
          color: colors.foreground,
        },
        comandaFooter: {
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
          paddingTop: 8,
        },
        totalLabel: {
          fontSize: 15,
          color: colors.foregroundSecondary,
        },
        totalValue: {
          fontSize: 18,
          fontWeight: '700',
          color: colors.foreground,
        },
      }),
    [colors],
  );

  const openTracking = useCallback(
    (orderId: string) => {
      navigation.navigate('OrderTracking', { orderId });
    },
    [navigation],
  );

  const openHome = useCallback(() => {
    navigation.navigate('Home');
  }, [navigation]);

  return (
    <ScreenContainer edges={['top']}>
      <View style={styles.container}>
        <View style={styles.header}>
          <View style={styles.headerSpacer} />
          <Text style={styles.headerTitle}>Pedidos</Text>
          <View style={styles.headerSpacer} />
        </View>

        <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>
          <View style={styles.content}>
            <View>
              <Text style={styles.sectionLabel}>PEDIDOS ATIVOS</Text>
              {isLoading ? (
                <View style={styles.emptyWrap}>
                  <ActivityIndicator color={colors.primary} />
                </View>
              ) : isError ? (
                <View style={styles.emptyWrap}>
                  <Ionicons name="cloud-offline-outline" size={40} color={colors.foregroundMuted} />
                  <Text style={styles.emptyMessage}>Não foi possível carregar seus pedidos</Text>
                  <TouchableOpacity style={styles.primaryBtn} onPress={() => refetch()} activeOpacity={0.85}>
                    <Text style={styles.primaryBtnText}>Tentar novamente</Text>
                  </TouchableOpacity>
                </View>
              ) : hasOrders ? (
                orders.map((order) => {
                  const status = order.status as OrderStatus;
                  const statusColor = STATUS_COLORS[status] ?? STATUS_COLORS.pending;
                  const total = orderTotal(order);
                  const itemCount = orderItemCount(order);
                  const restaurantName = order.restaurants?.name ?? 'Restaurante';
                  return (
                    <TouchableOpacity
                      key={order.id}
                      style={styles.orderCard}
                      onPress={() => openTracking(order.id)}
                      activeOpacity={0.85}
                      accessibilityRole="button"
                      accessibilityLabel={`Pedido em ${restaurantName}, ${STATUS_LABELS[status] ?? status}`}
                    >
                      <View style={styles.orderIcon}>
                        <Ionicons name="receipt-outline" size={24} color={colors.primary} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.orderRestaurant}>{restaurantName}</Text>
                        <Text style={styles.orderMeta}>{formatTime(order.created_at)}</Text>
                        <Text style={styles.orderMeta}>
                          {itemCount} {itemCount === 1 ? 'item' : 'itens'} · {formatPrice(total)}
                        </Text>
                      </View>
                      <View style={[styles.statusPill, { backgroundColor: `${statusColor}18` }]}>
                        <Text style={[styles.statusText, { color: statusColor }]}>
                          {STATUS_LABELS[status] ?? status}
                        </Text>
                      </View>
                      <Ionicons
                        name="chevron-forward"
                        size={20}
                        color={colors.foregroundMuted}
                        style={styles.chevron}
                      />
                    </TouchableOpacity>
                  );
                })
              ) : (
                <View style={styles.emptyWrap}>
                  <View style={styles.receiptIconWrap}>
                    <Ionicons name="receipt-outline" size={40} color={colors.foregroundMuted} />
                  </View>
                  <Text style={styles.emptyMessage}>Nenhum pedido ativo no momento</Text>
                  <TouchableOpacity
                    style={styles.primaryBtn}
                    onPress={openHome}
                    activeOpacity={0.85}
                  >
                    <Text style={styles.primaryBtnText}>Explorar restaurantes</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          </View>
        </ScrollView>
      </View>
    </ScreenContainer>
  );
}
