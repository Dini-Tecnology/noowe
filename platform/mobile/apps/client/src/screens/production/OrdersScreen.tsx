import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Image, StyleSheet, TouchableOpacity, View } from 'react-native';
import { Text } from 'react-native-paper';
import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useColors } from '@okinawa/shared/contexts/ThemeContext';
import { ScreenContainer } from '@okinawa/shared/components/ScreenContainer';
import customerBackend, { type CustomerOrder, type CustomerOrderStatus } from '../../services/customer-backend';
import { useQuickReorder } from '../../hooks/useQuickReorder';
import { money, restaurantRowStyles, rootNavigate, StateView, tableLabel, useQueryRefreshControl } from './shared';
import { canReorderQuickOrder, quickOrderStatusLabel, quickOrdersFilter } from './quick-service-ui';

const STATUS_LABELS: Record<CustomerOrderStatus, string> = {
  pending: 'Recebido', confirmed: 'Confirmado', preparing: 'Preparando',
  ready: 'Pronto', delivered: 'Entregue', completed: 'Concluído', cancelled: 'Cancelado',
};

const STATUS_COLORS: Record<CustomerOrderStatus, string> = {
  pending: '#EA580C', confirmed: '#EA580C', preparing: '#D97706',
  ready: '#16A34A', delivered: '#64748B', completed: '#64748B', cancelled: '#DC2626',
};

type OrderFilter = 'active' | 'completed' | 'cancelled';

const FILTERS: { id: OrderFilter; label: string }[] = [
  { id: 'active', label: 'Em andamento' },
  { id: 'completed', label: 'Concluídos' },
  { id: 'cancelled', label: 'Cancelados' },
];

const EMPTY_MESSAGES: Record<OrderFilter, string> = {
  active: 'Nenhum pedido em andamento.',
  completed: 'Nenhum pedido concluído ainda.',
  cancelled: 'Nenhum pedido cancelado.',
};

// "Entregue" still belongs to the open table tab: the order is only concluded after payment.
function filterOf(order: Pick<CustomerOrder, 'status' | 'serviceModel' | 'fulfillmentStatus'>): OrderFilter {
  // Quick Service não tem comanda aberta: o pedido termina na retirada (ou no "não retirado").
  if (order.serviceModel === 'quick_service') return quickOrdersFilter(order);
  if (order.status === 'completed') return 'completed';
  if (order.status === 'cancelled') return 'cancelled';
  return 'active';
}

function visitDate(value: string) {
  const date = new Date(value);
  const days = Math.floor((Date.now() - date.getTime()) / 86_400_000);
  if (days <= 0) return 'Hoje';
  if (days === 1) return 'Ontem';
  if (days < 7) return `Há ${days} dias`;
  return date.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
}

export default function OrdersScreen({ navigation }: any) {
  const colors = useColors();
  const queryClient = useQueryClient();
  const query = useInfiniteQuery({
    queryKey: ['orders'],
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) => customerBackend.listOrders(20, pageParam),
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
  });
  const allOrders = query.data?.pages.flatMap((page) => page.data) ?? [];
  const [filter, setFilter] = useState<OrderFilter>('active');
  const orders = allOrders.filter((order) => filterOf(order) === filter);
  const { reorder } = useQuickReorder(navigation);

  // Filtering happens on loaded pages; keep loading until the chosen tab has enough rows.
  useEffect(() => {
    if (orders.length < 8 && query.hasNextPage && !query.isFetchingNextPage) {
      void query.fetchNextPage();
    }
  }, [filter, orders.length, query]);
  const refreshControl = useQueryRefreshControl([query]);

  useEffect(() => {
    let channel: any;
    let cancelled = false;
    customerBackend.subscribeToUserChanges(() => queryClient.invalidateQueries({ queryKey: ['orders'] }))
      .then((value) => {
        // Unmounted before the subscription resolved — don't leak the channel.
        if (cancelled) void value.unsubscribe();
        else channel = value;
      })
      .catch(() => {
        // Pull-to-refresh remains available when Realtime is temporarily offline.
      });
    return () => {
      cancelled = true;
      channel?.unsubscribe();
    };
  }, [queryClient]);

  const styles = useMemo(() => StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.background },
    content: { paddingHorizontal: 18, paddingTop: 18, paddingBottom: 96 },
    title: { fontSize: 24, fontWeight: '800', color: colors.foreground, marginBottom: 14 },
    section: { fontSize: 13, fontWeight: '700', color: colors.foregroundSecondary, marginBottom: 18 },
    ...restaurantRowStyles(colors),
    filters: { flexDirection: 'row', gap: 8, marginBottom: 16 },
    chip: { paddingHorizontal: 16, paddingVertical: 9, borderRadius: 20, backgroundColor: colors.backgroundTertiary },
    chipSelected: { backgroundColor: colors.primary },
    chipText: { fontSize: 13, fontWeight: '600', color: colors.foregroundSecondary },
    chipTextSelected: { color: colors.primaryForeground },
    total: { color: colors.foreground, fontSize: 15, fontWeight: '700' },
    statusPill: { paddingHorizontal: 9, paddingVertical: 3, borderRadius: 999 },
    statusPillText: { fontSize: 10, fontWeight: '700' },
    stars: { color: '#F59E0B', fontSize: 11, letterSpacing: 1 },
    reorderText: { fontSize: 11, fontWeight: '700', color: colors.primary, marginTop: 4 },
    footer: { paddingVertical: 18 },
  }), [colors]);

  const renderOrder = ({ item }: { item: CustomerOrder }) => {
    const quickStatus = item.serviceModel === 'quick_service' ? quickOrderStatusLabel(item) : null;
    const statusLabel = quickStatus?.label ?? STATUS_LABELS[item.status] ?? item.status;
    const statusColor = quickStatus
      ? { ok: '#16A34A', warn: '#EA580C', off: '#64748B', bad: '#DC2626' }[quickStatus.tone]
      : STATUS_COLORS[item.status] ?? colors.primary;
    const firstItemName = item.items[0]?.name;
    const extraCount = item.items.length - 1;
    const preview = firstItemName
      ? `${firstItemName}${extraCount > 0 ? ` +${extraCount}` : ''}`
      : null;
    const subtitle = [
      preview,
      visitDate(item.createdAt),
      item.tableNumber ? tableLabel(item.tableNumber) : null,
    ].filter(Boolean).join(' · ');
    return (
      <TouchableOpacity
        style={styles.nearbyItem}
        onPress={() => rootNavigate(navigation, 'OrderDetail', { orderId: item.id })}
        activeOpacity={0.85}
        accessibilityRole="button"
        accessibilityLabel={`${item.restaurantName}, ${statusLabel}, ${money(item.total)}`}
      >
        {item.restaurantPhoto ? (
          <Image source={{ uri: item.restaurantPhoto }} style={styles.nearbyPhoto} resizeMode="cover" />
        ) : (
          <View style={styles.nearbyIcon}>
            <Ionicons name="restaurant-outline" size={26} color={colors.primary} />
          </View>
        )}
        <View style={styles.nearbyInfo}>
          <Text style={styles.nearbyName} numberOfLines={1}>{item.restaurantName}</Text>
          <Text style={styles.nearbySub} numberOfLines={1}>{subtitle}</Text>
        </View>
        <View style={styles.nearbyTrailing}>
          <Text style={styles.total}>{money(item.total)}</Text>
          {item.rating ? (
            <Text style={styles.stars}>{'★'.repeat(Math.round(item.rating))}</Text>
          ) : (
            <View style={[styles.statusPill, { backgroundColor: `${statusColor}1A` }]}>
              <Text style={[styles.statusPillText, { color: statusColor }]}>{statusLabel}</Text>
            </View>
          )}
          {item.serviceModel === 'quick_service' && canReorderQuickOrder(item) && (
            <TouchableOpacity
              onPress={() => { void reorder(item); }}
              accessibilityRole="button"
              accessibilityLabel={`Pedir novamente em ${item.restaurantName}`}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Text style={styles.reorderText}>Pedir novamente</Text>
            </TouchableOpacity>
          )}
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <ScreenContainer edges={['top']}>
      <View style={styles.screen}>
        <FlatList
          style={{ flex: 1 }}
          data={orders}
          keyExtractor={(item) => item.id}
          renderItem={renderOrder}
          contentContainerStyle={styles.content}
          ListHeaderComponent={
            <>
              <Text style={styles.title}>Meus Pedidos</Text>
              <View style={styles.filters}>
                {FILTERS.map((option) => {
                  const selected = filter === option.id;
                  return (
                    <TouchableOpacity
                      key={option.id}
                      style={[styles.chip, selected && styles.chipSelected]}
                      onPress={() => setFilter(option.id)}
                      accessibilityRole="button"
                      accessibilityState={{ selected }}
                    >
                      <Text style={[styles.chipText, selected && styles.chipTextSelected]}>{option.label}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </>
          }
          ListEmptyComponent={
            query.isLoading || query.isError
              ? <StateView loading={query.isLoading} error={query.error} onRetry={() => query.refetch()} />
              : query.hasNextPage || query.isFetchingNextPage
                ? <ActivityIndicator style={styles.footer} color={colors.primary} />
                : <StateView empty={filter ? EMPTY_MESSAGES[filter] : 'Você ainda não fez pedidos.'} emptyIcon="receipt-outline" />
          }
          ListFooterComponent={query.isFetchingNextPage ? <ActivityIndicator style={styles.footer} color={colors.primary} /> : null}
          refreshControl={refreshControl}
          onEndReached={() => query.hasNextPage && !query.isFetchingNextPage && query.fetchNextPage()}
          onEndReachedThreshold={0.35}
          showsVerticalScrollIndicator={false}
        />
      </View>
    </ScreenContainer>
  );
}
