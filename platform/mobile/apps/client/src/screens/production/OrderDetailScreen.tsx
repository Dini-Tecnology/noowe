import React, { useEffect, useMemo } from 'react';
import { Alert, Platform, ScrollView, StatusBar, StyleSheet, TouchableOpacity, View } from 'react-native';
import { Text } from 'react-native-paper';
import { LinearGradient } from 'expo-linear-gradient';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useQuery } from '@tanstack/react-query';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useColors } from '@okinawa/shared/contexts/ThemeContext';
import { ScreenContainer } from '@okinawa/shared/components/ScreenContainer';
import OrderStatusStepper, { type OrderStatusStep } from '@okinawa/shared/components/orders/OrderStatusStepper';
import { useVisitSession } from '../../contexts/VisitSessionContext';
import { useServiceTypeFor } from '../../hooks/useServiceTypeFeatures';
import customerBackend, { type CustomerOrderStatus } from '../../services/customer-backend';
import { money, rootNavigate, StateView, useQueryRefreshControl } from './shared';

type TrackingStep = 'received' | 'preparing' | 'ready' | 'delivered';
type QuickServiceStep = 'received' | 'preparing' | 'checking' | 'ready';

/** Gradiente do header — espelha os tokens `primary → accent` do design de referência. */
const HEADER_GRADIENT = ['#FF5724', '#F97316', '#F59E0B'] as const;

const TRACKING_STEPS: (OrderStatusStep & { key: TrackingStep })[] = [
  { key: 'received', label: 'Recebido', icon: 'checkmark-circle' },
  { key: 'preparing', label: 'Preparando', icon: 'chef-hat', iconSet: 'material-community' },
  { key: 'ready', label: 'Pronto', icon: 'silverware-fork-knife', iconSet: 'material-community' },
  { key: 'delivered', label: 'Entregue', icon: 'checkmark' },
];

const STEP_INDEX: Record<TrackingStep, number> = { received: 0, preparing: 1, ready: 2, delivered: 3 };

const QUICK_TRACKING_STEPS: (OrderStatusStep & { key: QuickServiceStep })[] = [
  { key: 'received', label: 'Recebido', icon: 'checkmark-circle' },
  { key: 'preparing', label: 'Preparando', icon: 'chef-hat', iconSet: 'material-community' },
  { key: 'checking', label: 'Conferência', icon: 'search' },
  { key: 'ready', label: 'Pronto', icon: 'silverware-fork-knife', iconSet: 'material-community' },
];

const QUICK_STEP_INDEX: Record<QuickServiceStep, number> = { received: 0, preparing: 1, checking: 2, ready: 3 };

// No backend status maps to "Conferência" — it's a purely visual midpoint
// between preparing and ready. Jumping from index 1 straight to index 3 still
// marks it done (`index < currentStep` in OrderStatusStepper) without
// fabricating a status that doesn't exist server-side.
function quickStepFromStatus(status: CustomerOrderStatus): QuickServiceStep {
  if (status === 'preparing') return 'preparing';
  if (status === 'ready' || status === 'delivered' || status === 'completed') return 'ready';
  return 'received';
}

const ITEM_STATUS_LABELS: Record<string, string> = {
  pending: 'Na fila', preparing: 'Preparando', ready: 'Pronto', delivered: 'Entregue', cancelled: 'Cancelado',
};

const ITEM_STATUS_COLORS: Record<string, string> = {
  pending: '#94A3B8', preparing: '#EA580C', ready: '#16A34A', delivered: '#16A34A', cancelled: '#DC2626',
};

function stepFromStatus(status: CustomerOrderStatus): TrackingStep {
  if (status === 'preparing') return 'preparing';
  if (status === 'ready') return 'ready';
  if (status === 'delivered' || status === 'completed') return 'delivered';
  return 'received';
}

function progressFromStatus(status: CustomerOrderStatus): number {
  switch (status) {
    case 'preparing': return 0.5;
    case 'ready': return 0.85;
    case 'delivered':
    case 'completed': return 1;
    default: return 0.1;
  }
}

function minutesUntil(iso: string | null): number | null {
  if (!iso) return null;
  const diffMs = new Date(iso).getTime() - Date.now();
  if (diffMs <= 0) return null;
  return Math.max(1, Math.round(diffMs / 60_000));
}

function estimatedRangeLabel(estimatedTime: number | null): string {
  if (!estimatedTime) return '—';
  const low = Math.max(1, estimatedTime - 2);
  return `${low}-${estimatedTime} min`;
}

const STATUS_BAR_HEIGHT = Platform.OS === 'ios' ? 44 : StatusBar.currentHeight ?? 24;

export default function OrderDetailScreen({ route, navigation }: any) {
  const colors = useColors();
  const queryClient = useQueryClient();
  const { session } = useVisitSession();
  const orderId = route.params.orderId as string;
  const query = useQuery({ queryKey: ['orders', orderId], queryFn: () => customerBackend.getOrder(orderId) });
  const refreshControl = useQueryRefreshControl([query]);
  const { capabilities } = useServiceTypeFor(query.data?.restaurantId);
  // Pickup journeys follow the four counter steps and close on a pickup screen;
  // table journeys follow the kitchen status of the order.
  const pickupSteps = capabilities?.orderTracking === 'pickup_steps';
  const showPickupCode = capabilities?.pickupCode === true;

  // Skip the Line has no "Entregue" step of its own — once the kitchen marks
  // it ready, the customer moves on to the "Pedido Pronto" close-out screen.
  useEffect(() => {
    if (pickupSteps && query.data && (query.data.status === 'ready' || query.data.status === 'completed')) {
      navigation.replace('OrderReady', { orderId });
    }
  }, [pickupSteps, query.data, orderId, navigation]);
  const cancel = useMutation({
    mutationFn: () => customerBackend.cancelOrder(route.params.orderId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['orders'] }),
    onError: (error: Error) => Alert.alert('Não foi possível cancelar', error.message),
  });

  useEffect(() => {
    let channel: Awaited<ReturnType<typeof customerBackend.subscribeToOrderChanges>> | undefined;
    let cancelled = false;

    customerBackend.subscribeToOrderChanges(orderId, () => {
      void queryClient.invalidateQueries({ queryKey: ['orders', orderId] });
      void queryClient.invalidateQueries({ queryKey: ['orders'], exact: true });
    }).then((value) => {
      if (cancelled) {
        void value.unsubscribe();
      } else {
        channel = value;
      }
    }).catch(() => {
      // Pull-to-refresh remains available when Realtime is temporarily offline.
    });

    return () => {
      cancelled = true;
      if (channel) void channel.unsubscribe();
    };
  }, [orderId, queryClient]);

  const styles = useMemo(
    () =>
      StyleSheet.create({
        root: { flex: 1, backgroundColor: colors.background },
        scrollContent: { paddingBottom: 32 },
        gradientHeader: { paddingTop: STATUS_BAR_HEIGHT + 8, paddingBottom: 36, paddingHorizontal: 16 },
        headerTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, gap: 12 },
        backBtn: { width: 40, height: 40, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.20)', alignItems: 'center', justifyContent: 'center' },
        headerCenter: { flex: 1, alignItems: 'center', paddingHorizontal: 4 },
        headerTitle: { fontSize: 18, fontWeight: '700', color: '#FFFFFF' },
        headerSubtitle: { fontSize: 13, color: 'rgba(255,255,255,0.8)', marginTop: 3 },
        orderChip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.20)', alignItems: 'center', justifyContent: 'center' },
        orderChipText: { fontSize: 12, fontWeight: '700', letterSpacing: 0.6, color: '#FFFFFF' },
        body: { paddingHorizontal: 16, marginTop: -28, gap: 16 },
        timeCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.card, borderRadius: 20, padding: 18, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.08, shadowRadius: 12, elevation: 4 },
        timeCardLeft: { flex: 1 },
        timeCardLabel: { fontSize: 13, color: colors.foregroundSecondary, marginBottom: 6 },
        timeCardValue: { fontSize: 28, fontWeight: '800', color: colors.foreground, marginBottom: 12 },
        timeCardIcon: { width: 44, height: 44, borderRadius: 22, backgroundColor: `${colors.primary}1A`, alignItems: 'center', justifyContent: 'center', marginLeft: 12 },
        progressTrack: { height: 4, borderRadius: 2, backgroundColor: colors.backgroundTertiary, overflow: 'hidden' },
        progressFill: { height: '100%', borderRadius: 2, backgroundColor: colors.primary },
        sectionTitle: { fontSize: 12, fontWeight: '700', letterSpacing: 1, color: colors.foregroundSecondary, marginBottom: 10 },
        itemCard: { backgroundColor: colors.card, borderRadius: 14, padding: 14, borderWidth: 1, borderColor: colors.border },
        itemTopRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
        itemName: { fontSize: 15, fontWeight: '600', color: colors.foreground },
        itemMeta: { fontSize: 13, color: colors.foregroundSecondary, marginTop: 2 },
        itemChefRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
        itemChefName: { fontSize: 12, color: colors.foregroundSecondary },
        itemPrice: { fontSize: 15, fontWeight: '700', color: colors.foreground },
        itemBottomRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 10 },
        itemStatusPill: { alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
        itemStatusPillText: { fontSize: 11, fontWeight: '700' },
        itemEta: { fontSize: 12, fontWeight: '700', color: colors.primary },
        totalRow: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 4 },
        totalLabel: { fontSize: 15, color: colors.foregroundSecondary },
        totalValue: { fontSize: 18, fontWeight: '700', color: colors.foreground },
        tableCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.card, borderRadius: 16, padding: 14, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, gap: 12 },
        tableIcon: { width: 40, height: 40, borderRadius: 20, backgroundColor: `${colors.primary}1A`, alignItems: 'center', justifyContent: 'center' },
        tableTitle: { fontSize: 14, fontWeight: '700', color: colors.foreground },
        tableSubtitle: { fontSize: 12, color: colors.foregroundSecondary, marginTop: 2 },
        tableAction: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, backgroundColor: `${colors.primary}1A` },
        tableActionText: { fontSize: 12, fontWeight: '700', color: colors.primary },
        helpBar: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.foreground, borderRadius: 16, padding: 14 },
        helpIcon: { width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.14)', alignItems: 'center', justifyContent: 'center' },
        helpTitle: { fontSize: 14, fontWeight: '700', color: colors.background },
        helpSubtitle: { fontSize: 12, color: colors.background, opacity: 0.65, marginTop: 1 },
        cancelBtn: { paddingVertical: 14, borderRadius: 16, borderWidth: 1.5, borderColor: '#DC2626', alignItems: 'center' },
        cancelBtnText: { color: '#DC2626', fontSize: 15, fontWeight: '700' },
        pickupCard: {
          alignItems: 'center', backgroundColor: colors.card, borderRadius: 20, paddingVertical: 20,
          shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.08, shadowRadius: 12, elevation: 4,
        },
        pickupLabel: { fontSize: 12, fontWeight: '600', color: colors.foregroundSecondary, marginBottom: 6 },
        pickupCode: { fontSize: 32, fontWeight: '800', letterSpacing: 1, color: colors.primary },
      }),
    [colors],
  );

  if (query.isLoading || query.isError || !query.data) {
    return (
      <ScreenContainer edges={['top']}>
        <StateView loading={query.isLoading} error={query.error} onRetry={() => query.refetch()} />
      </ScreenContainer>
    );
  }

  const order = query.data;
  const currentStepIndex = pickupSteps
    ? QUICK_STEP_INDEX[quickStepFromStatus(order.status)]
    : STEP_INDEX[stepFromStatus(order.status)];
  const progress = progressFromStatus(order.status);
  const canCancel = ['pending', 'confirmed'].includes(order.status);
  const isActiveVisit = !!session && session.tableSessionId === order.tableSessionId;
  const showHelpBar = (isActiveVisit || pickupSteps) && !['delivered', 'completed', 'cancelled', 'ready'].includes(order.status);
  const tableLabel = order.tableNumber ? `Mesa ${order.tableNumber}` : null;

  return (
    <ScreenContainer edges={[]}>
      <View style={styles.root}>
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={styles.scrollContent}
          refreshControl={refreshControl}
          alwaysBounceVertical
        >
          <LinearGradient
            colors={HEADER_GRADIENT as unknown as [string, string, string]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.gradientHeader}
          >
            <View style={styles.headerTop}>
              <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()} accessibilityRole="button" accessibilityLabel="Voltar">
                <Ionicons name="arrow-back" size={22} color="#FFFFFF" />
              </TouchableOpacity>
              <View style={styles.headerCenter}>
                <Text style={styles.headerTitle}>Status do Pedido</Text>
                <Text style={styles.headerSubtitle}>{tableLabel ? `${tableLabel} · ${order.restaurantName}` : order.restaurantName}</Text>
              </View>
              <View style={styles.orderChip}>
                <Text style={styles.orderChipText}>{order.orderNumber}</Text>
              </View>
            </View>

            <OrderStatusStepper steps={pickupSteps ? QUICK_TRACKING_STEPS : TRACKING_STEPS} currentStep={currentStepIndex} />
          </LinearGradient>

          <View style={styles.body}>
            <View style={styles.timeCard}>
              <View style={styles.timeCardLeft}>
                <Text style={styles.timeCardLabel}>
                  {order.status === 'cancelled' ? 'Pedido cancelado' : 'Tempo estimado'}
                </Text>
                {order.status !== 'cancelled' && <Text style={styles.timeCardValue}>{estimatedRangeLabel(order.estimatedTime)}</Text>}
                <View style={styles.progressTrack}>
                  <View style={[styles.progressFill, { width: `${progress * 100}%` }]} />
                </View>
              </View>
              <View style={styles.timeCardIcon}>
                <Ionicons name="time-outline" size={22} color={colors.primary} />
              </View>
            </View>

            {showPickupCode && (
              <View style={styles.pickupCard}>
                <Text style={styles.pickupLabel}>Código de retirada</Text>
                <Text style={styles.pickupCode}>{order.orderNumber}</Text>
              </View>
            )}

            <View>
              <Text style={styles.sectionTitle}>SEUS ITENS</Text>
              <View style={{ gap: 10 }}>
                {order.items.map((item) => {
                  const eta = ['pending', 'preparing'].includes(item.status) ? minutesUntil(item.expectedReadyAt) : null;
                  return (
                    <View key={item.id} style={styles.itemCard}>
                      <View style={styles.itemTopRow}>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.itemName}>{item.name}</Text>
                          <Text style={styles.itemMeta}>{item.quantity}x</Text>
                          {item.preparedByName && (
                            <View style={styles.itemChefRow}>
                              <Ionicons name="restaurant-outline" size={12} color={colors.foregroundSecondary} />
                              <Text style={styles.itemChefName}>{item.preparedByName}</Text>
                            </View>
                          )}
                        </View>
                        <Text style={styles.itemPrice}>{money(item.totalPrice)}</Text>
                      </View>
                      <View style={styles.itemBottomRow}>
                        <View style={[styles.itemStatusPill, { backgroundColor: `${ITEM_STATUS_COLORS[item.status] ?? '#94A3B8'}1A` }]}>
                          <Text style={[styles.itemStatusPillText, { color: ITEM_STATUS_COLORS[item.status] ?? '#94A3B8' }]}>
                            {ITEM_STATUS_LABELS[item.status] ?? item.status}
                          </Text>
                        </View>
                        {eta && <Text style={styles.itemEta}>~{eta} min</Text>}
                      </View>
                    </View>
                  );
                })}
              </View>
            </View>

            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>Total</Text>
              <Text style={styles.totalValue}>{money(order.total)}</Text>
            </View>

            {tableLabel && (
              <View style={styles.tableCard}>
                <View style={styles.tableIcon}>
                  <Ionicons name="location-outline" size={18} color={colors.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.tableTitle}>{tableLabel} · {order.partySize} {order.partySize === 1 ? 'pessoa' : 'pessoas'}</Text>
                  <Text style={styles.tableSubtitle}>Você</Text>
                </View>
                {isActiveVisit && (
                  <TouchableOpacity
                    style={styles.tableAction}
                    onPress={() => rootNavigate(navigation, 'FecharConta', { tableSessionId: order.tableSessionId })}
                    accessibilityRole="button"
                  >
                    <Text style={styles.tableActionText}>Fechar Conta</Text>
                  </TouchableOpacity>
                )}
              </View>
            )}

            {showHelpBar && (
              <TouchableOpacity
                style={styles.helpBar}
                onPress={() => rootNavigate(navigation, 'CallWaiter')}
                accessibilityRole="button"
              >
                <View style={styles.helpIcon}>
                  <Ionicons name="notifications-outline" size={18} color={colors.background} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.helpTitle}>Precisa de ajuda?</Text>
                  <Text style={styles.helpSubtitle}>Chamar equipe discretamente</Text>
                </View>
                <Ionicons name="chatbubble-outline" size={18} color={colors.background} style={{ opacity: 0.65 }} />
              </TouchableOpacity>
            )}

            {canCancel && (
              <TouchableOpacity style={styles.cancelBtn} onPress={() => cancel.mutate()} disabled={cancel.isPending} accessibilityRole="button">
                <Text style={styles.cancelBtnText}>{cancel.isPending ? 'Cancelando...' : 'Cancelar Pedido'}</Text>
              </TouchableOpacity>
            )}
          </View>
        </ScrollView>
      </View>
    </ScreenContainer>
  );
}
