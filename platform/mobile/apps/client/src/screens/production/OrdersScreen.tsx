import React, { useEffect, useMemo } from 'react';
import { ActivityIndicator, FlatList, RefreshControl, StyleSheet, TouchableOpacity, View } from 'react-native';
import { Text } from 'react-native-paper';
import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useColors } from '@okinawa/shared/contexts/ThemeContext';
import { ScreenContainer } from '@okinawa/shared/components/ScreenContainer';
import customerBackend, { type CustomerOrder, type CustomerOrderStatus } from '../../services/customer-backend';
import { money, rootNavigate, StateView } from './shared';

const STATUS_LABELS: Record<CustomerOrderStatus, string> = {
  pending: 'Recebido', confirmed: 'Confirmado', preparing: 'Preparando',
  ready: 'Pronto', delivered: 'Entregue', completed: 'Concluído', cancelled: 'Cancelado',
};

const STATUS_COLORS: Record<CustomerOrderStatus, string> = {
  pending: '#EA580C', confirmed: '#EA580C', preparing: '#D97706',
  ready: '#16A34A', delivered: '#64748B', completed: '#64748B', cancelled: '#DC2626',
};

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
  const orders = query.data?.pages.flatMap((page) => page.data) ?? [];

  useEffect(() => {
    let channel: any;
    customerBackend.subscribeToUserChanges(() => queryClient.invalidateQueries({ queryKey: ['orders'] })).then((value) => { channel = value; });
    return () => { channel?.unsubscribe(); };
  }, [queryClient]);

  const styles = useMemo(() => StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.background },
    content: { paddingHorizontal: 18, paddingTop: 18, paddingBottom: 96 },
    title: { fontSize: 24, fontWeight: '800', color: colors.foreground, marginBottom: 14 },
    section: { fontSize: 13, fontWeight: '700', color: colors.foregroundSecondary, marginBottom: 18 },
    card: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 14, borderRadius: 18, backgroundColor: colors.card, marginBottom: 10, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 8, elevation: 2 },
    icon: { width: 46, height: 46, borderRadius: 15, backgroundColor: colors.backgroundTertiary, alignItems: 'center', justifyContent: 'center' },
    body: { flex: 1, minWidth: 0 },
    topRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
    name: { color: colors.foreground, fontSize: 15, fontWeight: '800', flexShrink: 1 },
    orderNumber: { color: colors.foregroundMuted, fontSize: 11, fontWeight: '600' },
    preview: { color: colors.foregroundSecondary, fontSize: 12.5, marginBottom: 5 },
    meta: { color: colors.foregroundMuted, fontSize: 11 },
    right: { alignItems: 'flex-end', gap: 6 },
    total: { color: colors.foreground, fontSize: 15, fontWeight: '800' },
    statusPill: { paddingHorizontal: 9, paddingVertical: 3, borderRadius: 999 },
    statusPillText: { fontSize: 10, fontWeight: '700' },
    stars: { color: '#F59E0B', fontSize: 11, letterSpacing: 1 },
    footer: { paddingVertical: 18 },
  }), [colors]);

  const renderOrder = ({ item }: { item: CustomerOrder }) => {
    const statusColor = STATUS_COLORS[item.status] ?? colors.primary;
    const firstItemName = item.items[0]?.name;
    const extraCount = item.items.length - 1;
    return (
      <TouchableOpacity
        style={styles.card}
        onPress={() => rootNavigate(navigation, 'OrderDetail', { orderId: item.id })}
        activeOpacity={0.82}
        accessibilityRole="button"
        accessibilityLabel={`${item.restaurantName}, ${money(item.total)}`}
      >
        <View style={[styles.icon, { backgroundColor: `${statusColor}1A` }]}>
          <Ionicons name="restaurant-outline" size={20} color={statusColor} />
        </View>
        <View style={styles.body}>
          <View style={styles.topRow}>
            <Text style={styles.name} numberOfLines={1}>{item.restaurantName}</Text>
            <Text style={styles.orderNumber}>{item.orderNumber}</Text>
          </View>
          {firstItemName ? (
            <Text style={styles.preview} numberOfLines={1}>
              {firstItemName}{extraCount > 0 ? ` +${extraCount} ${extraCount === 1 ? 'item' : 'itens'}` : ''}
            </Text>
          ) : null}
          <Text style={styles.meta}>{visitDate(item.createdAt)}{item.tableNumber ? ` · Mesa ${item.tableNumber}` : ''}</Text>
        </View>
        <View style={styles.right}>
          <Text style={styles.total}>{money(item.total)}</Text>
          {item.rating ? (
            <Text style={styles.stars}>{'★'.repeat(Math.round(item.rating))}</Text>
          ) : (
            <View style={[styles.statusPill, { backgroundColor: `${statusColor}1A` }]}>
              <Text style={[styles.statusPillText, { color: statusColor }]}>{STATUS_LABELS[item.status] ?? item.status}</Text>
            </View>
          )}
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <ScreenContainer edges={['top']}>
      <View style={styles.screen}>
        {query.isLoading || query.isError ? <StateView loading={query.isLoading} error={query.error} onRetry={() => query.refetch()} /> : null}
        <FlatList
          style={{ flex: 1 }}
          data={orders}
          keyExtractor={(item) => item.id}
          renderItem={renderOrder}
          contentContainerStyle={styles.content}
          ListHeaderComponent={<><Text style={styles.title}>Meus Pedidos</Text><Text style={styles.section}>Últimas visitas</Text></>}
          ListEmptyComponent={!query.isLoading && !query.isError ? <StateView empty="Você ainda não fez pedidos." emptyIcon="receipt-outline" /> : null}
          ListFooterComponent={query.isFetchingNextPage ? <ActivityIndicator style={styles.footer} color={colors.primary} /> : null}
          refreshControl={<RefreshControl refreshing={query.isRefetching && !query.isFetchingNextPage} onRefresh={() => query.refetch()} tintColor={colors.primary} />}
          onEndReached={() => query.hasNextPage && !query.isFetchingNextPage && query.fetchNextPage()}
          onEndReachedThreshold={0.35}
          showsVerticalScrollIndicator={false}
        />
      </View>
    </ScreenContainer>
  );
}
